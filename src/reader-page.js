// 《選佛譜》六卷原文 · 独立阅读页（read.html 的主体）
// ─────────────────────────────────────────────────────────────────────────────
// 【缘起】2026-08-12 发起人拍板：阅读器从游戏内浮层（openOverlay 上的 .rdPanel）迁出，
//   立为独立页面；UI/UX 交互、布局、字体方案、色彩延用 wenchao（印光法师文钞 · 文白对照，
//   /Users/bincai/Downloads/foyue/wenchao）的「纸墨」形制。迁出的缘由有三：
//   ① 读一部书是长事，不该活在一张游戏浮层里——浮层随游戏主循环占帧、随 overlay 栈生灭；
//   ② wenchao 的阅读形制（顶栏·抽屉目录·吸顶模式条·沉浸滚动·注释弹卡·三主题）在
//      文钞站上磨了几千篇的读者，直接延用，不再自造一套；
//   ③ 独立页面无 WebGL，测试与 SEO 都是平地（无催帧之坑，见旧 test-reader.mjs 头注）。
//
// 【分层】内容层仍是 src/sfp-reader.js 的 readerNodes/nodeKey/nodeBodyHtml——
//   六卷为经 239 节、两档文白（2026-08-12 定案：原文档照原书连读不出表，
//   廿一相表为白话档专属）、原文过 rawShow 不过 zh()（校勘之本不因显示层改字）。
//   本页只做皮与交互：路由（hash＝节键）、目录树、模式条、Aa 弹层、名相弹卡、进度线。
//
// 【简繁】延用游戏侧同一套 zh-conv 正本（npm run check:zh 护栏所守的那一份）；
//   本页一切文本皆经 render 产出，无 zhDom 之患——切简繁即整节重绘，原文走 rawShow。
//   初值迁自游戏存档 save.zh（读者在游戏里选过繁体，来此不必再选一遍）。
import './reader-page.css';
import { readerNodes, nodeKey, nodeBodyHtml } from './sfp-reader.js';
import { sfpVerdictCanonReady } from './sfp-verdict-canon.js'; // 切库后判词白话为懒块：页尾装载即重绘
import { ZH_T2S, ZH_S2T } from './zh-conv.js';
import { SFP_GLOSS } from './sfp-gloss.js';
import { mountAsk } from './reader-ask.js';   // 问谱右抽屉（2026-08-12，问文钞形制；后端 agent/worker 问谱 v3）

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- 持久化偏好（键前缀 sfpr.，与游戏存档、wenchao 的 wc. 各立门户） ---------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('sfpr.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sfpr.' + k, JSON.stringify(v)); } catch {} },
};
// 一次性迁移：游戏内旧阅读器的进度（save.reader）与简繁选择（save.zh）搬来，
// 老读者开新页不丢「读到哪」。只在本页从未存过时迁，之后两边各走各的。
function migrate() {
  if (localStorage.getItem('sfpr.at') !== null) return {};
  try {
    const sv = JSON.parse(localStorage.getItem('sm10.save.v1') || '{}');
    const r = sv.reader || {};
    return {
      at: Number.isFinite(r.at) ? r.at : undefined,
      done: Array.isArray(r.done) ? r.done : undefined,
      mode: r.mode === 'wenyan' ? 'wenyan' : r.mode ? 'baihua' : undefined,   // duizhao（已撤档）落白话
      fs: [15, 17, 19][r.size],
      trad: sv.zh === 't' ? true : undefined,
    };
  } catch { return {}; }
}
const mig = migrate();
const prefs = {
  fs: store.get('fs', mig.fs ?? 17),
  theme: store.get('theme', 'paper'),
  mode: store.get('mode', mig.mode ?? 'baihua'),     // wenyan | baihua
  trad: store.get('trad', mig.trad ?? false),
};
if (prefs.mode !== 'wenyan' && prefs.mode !== 'baihua') prefs.mode = 'baihua';
const done = new Set(store.get('done', mig.done ?? []));

/* ---------- 简繁（与 game.js 的 zhWith/zh/rawShow 同法同正本） ---------- */
const ML_S = Math.max(...Object.keys(ZH_T2S).map((k) => k.length));
const ML_T = Math.max(...Object.keys(ZH_S2T).map((k) => k.length));
function conv(s, dict, ml) {
  let r = '', i = 0;
  while (i < s.length) {
    let hit = '';
    for (let L = Math.min(ml, s.length - i); L >= 1; L--) {
      const seg = s.substr(i, L);
      if (dict[seg] !== undefined) { r += dict[seg]; i += L; hit = seg; break; }
    }
    if (!hit) { r += s[i]; i++; }
  }
  return r;
}
const zh = (s) => (prefs.trad ? conv(String(s), ZH_S2T, ML_T) : conv(String(s), ZH_T2S, ML_S));
// 原文显示态：繁体原样（底本即繁体逐字），简体折简。不走 zh()——繁体态跑 S2T 会把
// 「余年」误作「餘年」等 14 处底本用字改掉（名单钉在 npm run check:zh 检三）。
const rawShow = (t) => (prefs.trad ? String(t) : conv(String(t), ZH_T2S, ML_S));

/* ---------- 名相浮标（词键繁体，与 game.js 的 glossify 同法） ---------- */
const GLS_IDX = {};
SFP_GLOSS.forEach((g, i) => { GLS_IDX[g[0]] = i; });
const GLS_RE = new RegExp(SFP_GLOSS.map((g) => g[0]).sort((a, b) => b.length - a.length).join('|'), 'g');
function glossify(html, seen) {
  seen = seen || new Set();
  return html.split(/(<[^>]*>)/).map((seg) => {
    if (seg.startsWith('<')) return seg;
    return seg.replace(GLS_RE, (m) => {
      if (seen.has(m)) return m;
      seen.add(m);
      return `<span class="gls" data-g="${GLS_IDX[m]}">${m}</span>`;
    });
  }).join('');
}

/* ---------- 骨架：239 节 ---------- */
const nodes = readerNodes();
const KEYS = nodes.map(nodeKey);
const DOOR_TITLE = {};                       // 门号 → 门题（crumb 与目录用）
nodes.forEach((n) => { if (n.kind === 'door') DOOR_TITLE[n.door] = n.title; });
const CNJ = ['一', '二', '三', '四', '五', '六'];
let at = Math.min(nodes.length - 1, Math.max(0, store.get('at', mig.at ?? 0)));

/* ---------- 主题 ---------- */
const THEMES = {
  paper: { attr: '', color: '#f6f1e6' },
  plain: { attr: 'plain', color: '#e8e7e3' },
  night: { attr: 'night', color: '#171310' },
};
function applyPrefs() {
  document.documentElement.style.setProperty('--fs', prefs.fs + 'px');
  const t = THEMES[prefs.theme] || THEMES.paper;
  document.documentElement.dataset.theme = t.attr;
  $('meta[name=theme-color]').setAttribute('content', t.color);
  const tog = (sel, on) => { const e = $(sel); if (e) e.classList.toggle('on', on); };
  tog('#theme-paper', prefs.theme === 'paper');
  tog('#theme-plain', prefs.theme === 'plain');
  tog('#theme-night', prefs.theme === 'night');
  tog('#cc-simp', !prefs.trad);
  tog('#cc-trad', prefs.trad);
}

/* ---------- 抽屉 ---------- */
const drawer = $('#drawer-left'), overlay = $('#overlay');
const wideMq = matchMedia('(min-width: 1180px)');
function syncWide() { document.body.toggleAttribute('data-wide', wideMq.matches); }
wideMq.addEventListener?.('change', syncWide);
function openDrawer() {
  if (wideMq.matches) return;
  ask?.close();                        // 两抽屉互斥（问谱在右，目录在左）
  drawer.classList.add('open'); overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));
}
function closeDrawer() {
  drawer.classList.remove('open'); overlay.classList.remove('show');
  setTimeout(() => { overlay.hidden = true; }, 280);
}
$('#btn-nav').addEventListener('click', openDrawer);
overlay.addEventListener('click', closeDrawer);

/* ---------- 目录树：六卷为经、门为节 ---------- */
function tocHtml(q) {
  if (q) {
    const qt = conv(q, ZH_S2T, ML_T);        // 查询归一到底本形（位名存繁体）
    const hits = nodes.map((n, i) => ({ n, i }))
      .filter(({ n }) => n.title.includes(q) || n.title.includes(qt) || zh(n.title).includes(q));
    if (!hits.length) return `<div class="nav-empty">${zh('無此位目')}</div>`;
    return `<div class="search-count">${zh(`${hits.length} 目`)}</div>` + hits.map(({ n, i }) =>
      `<button class="nav-item${i === at ? ' active' : ''}${done.has(KEYS[i]) ? ' visited' : ''}" data-i="${i}" type="button">${esc(zh(n.title))}</button>`).join('');
  }
  let h = '', curJuan = 0, curDoor = 0;
  const item = (i, cls = '') => {
    const n = nodes[i];
    const c = ['nav-item', cls, i === at ? 'active' : '', done.has(KEYS[i]) ? 'visited' : ''].filter(Boolean).join(' ');
    // 门节在目录里作「總說」一目（门题已在分组题上，不重复一遍）
    const label = n.kind === 'door' ? '總說' : n.title;
    return `<button class="${c}" data-i="${i}" type="button">${esc(zh(label))}</button>`;
  };
  nodes.forEach((n, i) => {
    if (n.juan !== curJuan) {
      if (curDoor) { h += '</details>'; curDoor = 0; }
      if (curJuan) h += '</details>';
      curJuan = n.juan;
      const cnt = nodes.filter((x) => x.juan === n.juan).length;
      h += `<details class="nav-vol"${n.juan === nodes[at].juan ? ' open' : ''}>`
        + `<summary><span class="tri"></span>${zh(`卷第${CNJ[n.juan - 1]}`)}<span class="count">${cnt}</span></summary>`;
    }
    if (n.kind === 'door') {
      if (curDoor) h += '</details>';
      curDoor = n.door;
      h += `<details class="nav-juan"${n.door === nodes[at].door ? ' open' : ''}>`
        + `<summary><span class="tri"></span>${esc(zh(n.title))}</summary>` + item(i);
    } else if (n.kind === 'front') {
      if (curDoor) { h += '</details>'; curDoor = 0; }
      h += item(i, 'nav-juan-leaf');
    } else {
      h += item(i);
    }
  });
  if (curDoor) h += '</details>';
  if (curJuan) h += '</details>';
  return h;
}
const navTree = $('#nav-tree');
function paintToc() {
  navTree.innerHTML = tocHtml($('#nav-search').value.trim());
  $('#nav-stats').textContent = zh(`六卷 ${nodes.length} 節 · 已讀 ${done.size}`);
  const cur = navTree.querySelector('.nav-item.active');
  if (cur) cur.scrollIntoView({ block: 'center' });
}
navTree.addEventListener('click', (e) => {
  const b = e.target.closest('.nav-item');
  if (!b) return;
  go(Number(b.dataset.i));
  closeDrawer();
});
$('#nav-search').addEventListener('input', () => { navTree.innerHTML = tocHtml($('#nav-search').value.trim()); });

/* ---------- 名相注释弹卡 ---------- */
const sheet = $('#sheet'), sheetBd = $('#sheet-backdrop');
function openSheet(idx) {
  const g = SFP_GLOSS[idx];
  if (!g) return;
  $('#sheet-body').innerHTML = `<h4>${esc(zh(String(g[0])))}</h4><p>${esc(zh(String(g[1])))}</p>`
    + (g[2] ? `<small class="note-src">${esc(zh(String(g[2])))}</small>` : '');
  sheet.hidden = false; sheetBd.hidden = false;
}
function closeSheet() { sheet.hidden = true; sheetBd.hidden = true; }
sheetBd.addEventListener('click', closeSheet);
// 名相词条里有 129 条与谱位同名（阿鼻地獄／初歡喜地／常寂光淨土…）。这类词条的释义是位注白话
//   的缩写版，而本阅读器一位即一节（239 节＝四篇＋十五门＋二百二十位），那一节才是全本。
//   故点到位名不弹缩写签，直接翻到那一节——与游戏侧「位名点开即入位卡」同一条规矩，
//   只是此处的「那一位」是本页的一节，不必跨页回游戏（2026-08-12 发起人点单「推到全站」）。
// 例外同游戏侧：正读着的就是这一位，点它自己的名字仍弹签，不作原地空翻。
const GLS_POS_KEY = new Map();
nodes.forEach((n, i) => { if (n.kind === 'pos') GLS_POS_KEY.set(n.title, i); });
document.addEventListener('click', (e) => {
  const t = e.target.closest?.('.gls');
  if (!t) return;
  const idx = Number(t.dataset.g);
  const term = (SFP_GLOSS[idx] || [])[0];
  const to = GLS_POS_KEY.get(String(term));
  if (to !== undefined && to !== at) { closeSheet(); go(to); return; }
  openSheet(idx);
});

/* ---------- 阅读设置（Aa 弹层，形制同 wenchao） ---------- */
let aaSheet = null;
function ensureAaSheet() {
  if (aaSheet) return aaSheet;
  const el = document.createElement('div');
  el.className = 'aa-sheet'; el.hidden = true;
  el.innerHTML =
    `<div class="aa-mask"></div>`
    + `<div class="aa-panel">`
    + `<div class="rb-set"><span class="rb-set-k">${zh('字号')}</span><span class="rb-chips">`
    + `<button class="rb-chip" id="font-dec" type="button" aria-label="减小字号">A−</button>`
    + `<span class="aa-fs" aria-live="polite"></span>`
    + `<button class="rb-chip" id="font-inc" type="button" aria-label="增大字号">A＋</button></span></div>`
    + `<div class="rb-set"><span class="rb-set-k">${zh('底色')}</span><span class="rb-chips">`
    + `<button class="rb-chip" id="theme-paper" type="button">${zh('纸色')}</button>`
    + `<button class="rb-chip" id="theme-plain" type="button">${zh('素白')}</button>`
    + `<button class="rb-chip" id="theme-night" type="button">${zh('墨夜')}</button></span></div>`
    + `<div class="rb-set"><span class="rb-set-k">${zh('文字')}</span><span class="rb-chips">`
    + `<button class="rb-chip" id="cc-simp" type="button">简体</button>`
    + `<button class="rb-chip" id="cc-trad" type="button">繁體</button></span></div>`
    + `</div>`;
  document.body.appendChild(el);
  el.querySelector('.aa-mask').onclick = closeAaSheet;
  el.querySelector('#font-dec').onclick = () => { prefs.fs = Math.max(14, prefs.fs - 1); store.set('fs', prefs.fs); applyPrefs(); syncAaSheet(); measureMax(); };
  el.querySelector('#font-inc').onclick = () => { prefs.fs = Math.min(24, prefs.fs + 1); store.set('fs', prefs.fs); applyPrefs(); syncAaSheet(); measureMax(); };
  el.querySelector('#theme-paper').onclick = () => setTheme('paper');
  el.querySelector('#theme-plain').onclick = () => setTheme('plain');
  el.querySelector('#theme-night').onclick = () => setTheme('night');
  el.querySelector('#cc-simp').onclick = () => setTrad(false);
  el.querySelector('#cc-trad').onclick = () => setTrad(true);
  return (aaSheet = el);
}
function syncAaSheet() { if (aaSheet) { aaSheet.querySelector('.aa-fs').textContent = prefs.fs; applyPrefs(); } }
function openAaSheet() { ensureAaSheet().hidden = false; syncAaSheet(); }
function closeAaSheet() { if (aaSheet) aaSheet.hidden = true; }
const setTheme = (name) => { prefs.theme = name; store.set('theme', name); applyPrefs(); };
function setTrad(on) {
  if (prefs.trad === !!on) return;
  prefs.trad = !!on; store.set('trad', prefs.trad);
  // Aa 弹层的标签也要换字形——整层弃重建（下次打开现做），正文与目录即时重绘
  const wasOpen = aaSheet && !aaSheet.hidden;
  if (aaSheet) { aaSheet.remove(); aaSheet = null; }
  render(); paintToc(); syncStatic();
  ask?.repaint();                     // 问谱抽屉的欢迎语/chips/已答会话同换字形
  if (wasOpen) openAaSheet(); else applyPrefs();
}

/* ---------- 静态件（顶栏/两抽屉头/搜索框）随简繁换字形 ---------- */
function syncStatic() {
  $('#topbar-title').textContent = zh('選佛譜');
  $('#nav-title').textContent = zh('選佛譜');
  $('#nav-search').placeholder = zh('在谱中搜索位名…');
  $('#ask-title').textContent = zh('问谱');
  $('#ask-sub').textContent = zh('基于《選佛譜》六卷全文');
  $('#ai-text').placeholder = zh('向谱请益…');
  $('.ai-send').textContent = zh('发送');
  $('#ai-disclaimer').textContent = zh('回答仅供参考，请以出处原文为准');
  document.title = zh(`選佛譜 · ${nodes[at].title}`);
}

/* ---------- 一节的渲染 ---------- */
const reader = $('#reader');
function crumbOf(n) {
  const juan = `卷第${CNJ[n.juan - 1]}`;
  if (n.kind === 'pos') return `${juan} · ${DOOR_TITLE[n.door] || ''}`;
  if (n.kind === 'door') return juan;
  return `${juan} · ${n.juan === 6 ? '卷末' : '卷首'}`;
}
function render() {
  const n = nodes[at];
  const raws = [];
  // 整节正文过 zh()：白话数据存繁体（两白话本规约①），简体态在此折简。
  // 属性里只有数字下标（sfp-reader.js 硬约束①），故整段 HTML 过转换是安全的；
  // 原文段此刻还是空占位（data-raw），转完才回填——底本不经 zh() 之手。
  const body = zh(nodeBodyHtml(n, prefs.mode, { esc, glossify, zh }, raws));
  const meta = n.kind === 'door' ? `<div class="art-crumb" style="margin-top:6px">${zh(`本門 ${nodes.filter((x) => x.kind === 'pos' && x.door === n.door).length} 位`)}</div>` : '';
  const prev = at > 0 ? nodes[at - 1] : null;
  const next = at < nodes.length - 1 ? nodes[at + 1] : null;
  reader.innerHTML = `<div class="reader-inner">
    <div class="mode-bar">
      <div class="mb-segs" role="tablist">
        <button class="seg${prefs.mode === 'wenyan' ? ' on' : ''}" data-m="wenyan">${zh('原文')}</button>
        <button class="seg${prefs.mode === 'baihua' ? ' on' : ''}" data-m="baihua">${zh('白話')}</button>
      </div>
      <div class="mb-acts">
        <button class="mb-act mb-aa" aria-label="阅读设置"><span class="mb-aa-g">Aa</span></button>
      </div>
    </div>
    <header class="art-head">
      <div class="art-crumb">${esc(zh(crumbOf(n)))}</div>
      <h1 class="art-title">${esc(zh(n.title))}</h1>
      <div class="rule"></div>
      ${meta}
    </header>
    <article class="art-body">${body}</article>
    <nav class="art-nav">
      <button type="button" id="art-prev"${prev ? '' : ' disabled'}>${prev ? `<small>${zh('上一節')}</small>${esc(zh(prev.title))}` : `<small>${zh('卷首')}</small>—`}</button>
      <button type="button" id="art-next"${next ? '' : ' disabled'}>${next ? `<small>${zh('下一節')}</small>${esc(zh(next.title))}` : `<small>${zh('卷末')}</small>—`}</button>
    </nav>
  </div>`;
  // 原文回填：过 rawShow 取显示态正字，再上名相浮标——不经 zh()（缘由见文件头【简繁】）
  reader.querySelectorAll('[data-raw]').forEach((e2) => {
    const t = raws[Number(e2.getAttribute('data-raw'))];
    if (t !== undefined) e2.innerHTML = glossify(esc(rawShow(t)));
  });
  // 档位切换：正文换、版面不换；短促淡出淡入糊过跳变（wenchao mode-swap 之制）
  reader.querySelectorAll('.mode-bar .seg').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.m === prefs.mode) return;
      prefs.mode = b.dataset.m; store.set('mode', prefs.mode);
      render();
      const ab = reader.querySelector('.art-body');
      ab.classList.add('mode-swap');
    };
  });
  const aa = reader.querySelector('.mb-aa'); if (aa) aa.onclick = openAaSheet;
  const bp = $('#art-prev'), bn = $('#art-next');
  if (bp && prev) bp.onclick = () => go(at - 1);
  if (bn && next) bn.onclick = () => go(at + 1);
  scrollTo(0, 0);
  document.body.classList.remove('nav-hidden');
  // 读过即记 + 存进度
  if (!done.has(KEYS[at])) { done.add(KEYS[at]); store.set('done', [...done]); }
  store.set('at', at);
  syncStatic();
  measureMax(); paintProgress();
}

/* ---------- 路由：hash ＝ 节键（door:4 / 位名 / 篇名），可直达可分享 ---------- */
function keyToIndex(k) { return KEYS.indexOf(k); }
function go(i, push = true) {
  const j = Math.min(nodes.length - 1, Math.max(0, i));
  at = j;
  const h = '#' + encodeURIComponent(KEYS[at]);
  if (push && location.hash !== h) history.pushState(null, '', h);
  render(); paintToc();
}
function routeFromHash(push = false) {
  let k = '';
  try { k = decodeURIComponent(location.hash.slice(1)); } catch { k = ''; }
  // 门号直达（游戏侧门卡「读本门原文」用此形）：#door:4；位名与篇名直接作键
  const i = k ? keyToIndex(k) : -1;
  if (i >= 0) go(i, push);
  else {
    // 无 hash（或不识）：续上次读处，并把键补上地址栏（replace，不添历史项）
    history.replaceState(null, '', '#' + encodeURIComponent(KEYS[at]));
    render(); paintToc();
  }
}
addEventListener('popstate', () => routeFromHash(false));

/* ---------- 进度细线 + 沉浸阅读（wenchao 同制：rAF 刷新，8px 防抖） ---------- */
const progressBar = $('#read-progress');
let rafPending = false, lastNavY = 0, maxScroll = 0;
function measureMax() { maxScroll = document.body.scrollHeight - innerHeight; return maxScroll; }
addEventListener('resize', measureMax, { passive: true });
if (document.fonts?.ready) document.fonts.ready.then(measureMax);
function paintProgress() {
  rafPending = false;
  progressBar.style.width = maxScroll > 200 ? Math.min(100, scrollY / maxScroll * 100) + '%' : '0';
  const y = scrollY;
  if (y < 72) document.body.classList.remove('nav-hidden');
  else if (y > lastNavY + 8) document.body.classList.add('nav-hidden');
  else if (y < lastNavY - 8) document.body.classList.remove('nav-hidden');
  lastNavY = y;
}
addEventListener('scroll', () => {
  if (!rafPending) { rafPending = true; requestAnimationFrame(paintProgress); }
}, { passive: true });

/* ---------- 键盘：← → 翻节，Esc 收层 ---------- */
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (aaSheet && !aaSheet.hidden) return closeAaSheet();
    if (!sheet.hidden) return closeSheet();
    if (ask && ask.isOpen) return ask.close();
    if (drawer.classList.contains('open')) return closeDrawer();
    return;
  }
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowLeft' && at > 0) go(at - 1);
  else if (e.key === 'ArrowRight' && at < nodes.length - 1) go(at + 1);
});

/* ---------- 顶栏 ---------- */
$('#topbar-title').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- 问谱（右抽屉） ---------- */
// 出处 → 阅读器节：引文卡的章节题（p.title＝语料块之 s）映射到 239 节。
//   位与卷首篇是全等；门的块题作「第一發始因地門」，而门节题作「第一門 · 發始因地門」，
//   剥去序号后包含比对即得。probe 态只探不跳（出处卡据此决定亮不亮「读原文」钮）。
function findNodeBySec(sec) {
  const s = String(sec || '').trim();
  if (!s) return -1;
  let i = nodes.findIndex((n) => n.title === s);
  if (i >= 0) return i;
  // 门题两形并收：「第十四淨土橫超門」与「十四淨土橫超門」剥去序号皆得「淨土橫超門」
  const bare = s.replace(/^第?[一二三四五六七八九十]+/, '');
  if (bare.length >= 3) {
    i = nodes.findIndex((n) => n.kind === 'door' && n.title.includes(bare));
    if (i >= 0) return i;
  }
  return -1;
}
const ask = mountAsk({
  esc, zh, store,
  openNode: (sec, probe) => {
    const i = findNodeBySec(sec);
    if (i < 0) return false;
    if (!probe) go(i);
    return true;
  },
});
$('#btn-ask').addEventListener('click', ask.toggle);
overlay.addEventListener('click', () => ask.close());

/* ---------- 启动 ---------- */
applyPrefs();
syncWide();
routeFromHash(false);
// 游戏侧「问谱」入口带 #ask 进来：开抽屉，并把地址栏还给当前节（免得刷新又开一次）
if (location.hash === '#ask') {
  history.replaceState(null, '', '#' + encodeURIComponent(KEYS[at]));
  ask.open();
}
// 正本懒装载（2026-08-14 切库）：4620 格判词白话随块而至——页先出（原文与骨架不等它），
// 块到重绘本节，判词列无声补齐；取不到则列空，原文照读不误
void sfpVerdictCanonReady().then(() => { render(); paintToc(); }).catch(() => {});
