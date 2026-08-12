// 問譜 · 阅读页右抽屉（read.html 的问答面）
// ─────────────────────────────────────────────────────────────────────────────
// 【形制】照 wenchao 问文钞（site/js/ai-core.js ＋ app.js 右抽屉）：chips 预设问、
//   ndjson 流式打字机、轻量 Markdown ＋ 行内角标 [n]、角标点开出处卡、核验徽标、
//   本地会话存续。后端是 agent/worker 的问谱 v3（2026-08-12 重立），协议同问文钞。
//
// 【与问文钞的一处不同】出处卡多一枚「读原文 ›」——引文所出的章节（位/门/卷首篇）
//   可一键跳到阅读器那一节。引文不是死的脚注，能把人带到书里的另一处。
//
// 【简繁】所有渲染出口都过 ctx.zh()；用户在 Aa 里切简繁时由 reader-page 唤 repaint。
//   问句原样送后端（后端检索前自会 S2T 归一），不在前端转——转了反而丢用户原话。
//
// 【会话】存 localStorage sfpr.aiSession（问答对，答存纯文本），开页回放；
//   「新对话」清空。history 随问带末二轮，续问接得上茬（后端截四百字）。
const ASK_API = '/api/ask';                       // 与游戏侧同一路（dev 由 vite 代理到 8788，prod 由主 Worker service binding 内转）
const CHIPS = [
  ['这部谱怎么玩', '这部《选佛谱》是怎么玩的？'],
  ['谁写的', '选佛谱是谁写的，为什么要做这个谱？'],
  ['什么是横超', '什么是横超？'],
  ['见惑思惑', '见惑和思惑有什么分别？'],
];

/* ── ndjson 流式（协议同 wenchao ai-core.streamAsk：meta / delta / done）── */
async function streamAsk(payload, handlers, signal) {
  const { onMeta, onDelta, onDone } = handlers || {};
  const res = await fetch(ASK_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  let full = '';
  const onMsg = (m) => {
    if (!m) return;
    if (m.type === 'meta') { if (onMeta) onMeta(m); }
    else if (m.type === 'delta') { full += m.text || ''; if (onDelta) onDelta(full, m.text || ''); }
    else if (m.type === 'done') { if (onDone) onDone(m); }
    else if (typeof m.message === 'string' && m.message) { full += m.message; if (onDelta) onDelta(full, m.message); }
  };
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (reader) {
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (l) try { onMsg(JSON.parse(l)); } catch { /* 半行 */ }
      }
    }
    if (buf.trim()) try { onMsg(JSON.parse(buf.trim())); } catch { /* 无换行的错误体 */ }
  } else {
    (await res.text()).split('\n').forEach((l) => { if (l.trim()) try { onMsg(JSON.parse(l)); } catch { /* 略 */ } });
  }
  return full;
}

/* ── 轻量 Markdown ＋ 行内角标（承 wenchao ai-core.aiFormat 之形，裁掉本库用不到的分支）── */
function aiFormat(esc, text, nCites) {
  const t = esc(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  let html = '', list = '', liOpen = false;
  const closeLi = () => { if (liOpen) { html += '</li>'; liOpen = false; } };
  const closeList = () => { closeLi(); if (list) { html += '</' + list + '>'; list = ''; } };
  for (const raw of t.split('\n')) {
    const ln = raw.trim();
    if (!ln) continue;
    let m;
    if ((m = ln.match(/^#{1,4}\s*(.+)$/))
      || (m = ln.match(/^(?:<strong>)?\s*((?:[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）)[^<\n]{0,40})(?:<\/strong>)?$/))) {
      closeList(); html += '<h4 class="ai-h">' + m[1] + '</h4>';
    } else if ((m = ln.match(/^(\d+)[.、)]\s*(.+)$/))) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } else closeLi();
      html += '<li>' + m[2]; liOpen = true;
    } else if ((m = ln.match(/^[-*●·•]\s+(.+)$/))) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } else closeLi();
      html += '<li>' + m[1]; liOpen = true;
    } else {
      closeList(); html += '<p>' + ln + '</p>';
    }
  }
  closeList();
  if (nCites > 0) {
    html = html.replace(/\[(\d{1,2})\]/g, (mm, n) =>
      (+n >= 1 && +n <= nCites ? `<button class="ai-cite" data-n="${n}" type="button">${n}</button>` : mm));
  }
  return html;
}

/**
 * 挂载问谱抽屉。
 * ctx：{ esc, zh, store, openNode(secTitle, probe?)→bool 按章节题跳阅读器节（probe 只探不跳） }
 * 返回 { open, close, toggle, repaint }——repaint 供简繁切换后整层重绘。
 */
export function mountAsk(ctx) {
  const { esc, zh, store } = ctx;
  const $ = (s, r = document) => r.querySelector(s);
  const drawer = $('#drawer-ask'), overlay = $('#overlay');
  const log = $('#ai-log'), form = $('#ai-form'), ta = $('#ai-text'), chipsEl = $('#ai-chips');

  // 会话：{u 问, a 答纯文本, p 引文, v 核验, d 降级} —— 答语存纯文本，渲染时再排版（简繁随切随换）
  let sess = store.get('aiSession', []);
  let busy = false, ctl = null;

  const WELCOME = () => `<div class="ai-welcome">
      <p class="aw-greet">${zh('问谱')}</p>
      <p class="aw-lead">${zh('这里可以问《选佛谱》：谱位与轮相行法、名相义理、这部书的来历。')}</p>
      <p class="aw-hint">${zh('回答只依六卷谱文，逐句带出处角标，点角标可核对原文。')}</p>
    </div>`;

  const verifyBadge = (v, degraded) => {
    if (degraded) return `<span class="ai-verify warn">${zh('模型暂不可用，以下为检得原文直出')}</span>`;
    if (!v || !v.checks) return '';
    return v.ok
      ? `<span class="ai-verify ok">${zh('引文已逐句核验')}</span>`
      : `<span class="ai-verify warn">${zh(`有 ${v.checks.dropped || 0} 句未过核验，已剔除`)}</span>`;
  };

  function paint() {
    chipsEl.innerHTML = CHIPS.map(([label, q]) => `<button class="chip-btn" type="button" data-q="${esc(q)}">${zh(label)}</button>`).join('');
    let h = WELCOME();
    sess.forEach((m, mi) => {
      h += `<div class="ai-msg user">${esc(zh(m.u))}</div>`;
      const cites = Array.isArray(m.p) ? m.p : [];
      const body = m.a
        ? aiFormat(esc, zh(m.a), cites.length)
        : `<div class="ai-loading"><i>${zh('检书中')}</i><span></span><span></span><span></span></div>`;
      h += `<div class="ai-msg bot" data-mi="${mi}">${body}${m.done ? verifyBadge(m.v, m.d) : ''}</div>`;
    });
    log.innerHTML = h;
    log.scrollTop = log.scrollHeight;
  }

  /* 出处卡（底部弹卡，复用 read.html 的 #sheet）：原文 ＋ 出处串 ＋ 读原文跳节 */
  function openCite(mi, n) {
    const m = sess[mi];
    const p = m && m.p && m.p[n - 1];
    if (!p) return;
    const sheet = $('#sheet'), bd = $('#sheet-backdrop');
    const sec = String(p.title || '');
    const jump = ctx.openNode && ctx.openNode(sec, true)
      ? `<button class="sheet-goto" id="cite-go" type="button">${zh('读原文')} ›</button>` : '';
    $('#sheet-body').innerHTML = `<h4>${esc(zh(sec))}<span class="note-n">[${n}]</span></h4>
      <p class="cite-text">${esc(p.text || '')}</p>
      <small class="note-src">${esc(zh(String(p.ref || '')))}</small>${jump}`;
    sheet.hidden = false; bd.hidden = false;
    const go = $('#cite-go');
    if (go) go.onclick = () => { sheet.hidden = true; bd.hidden = true; close(); ctx.openNode(sec); };
  }
  log.addEventListener('click', (e) => {
    const b = e.target.closest?.('.ai-cite');
    if (!b) return;
    openCite(Number(b.closest('.ai-msg').dataset.mi), Number(b.dataset.n));
  });

  async function send(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true;
    ta.value = '';
    const m = { u: q, a: '', p: [], v: null, d: false, done: false };
    sess.push(m);
    paint();
    ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 45000);
    // 末二轮作续问上下文（答语截四百字，后端另有一道截取）
    const history = sess.slice(0, -1).slice(-2).filter((x) => x.a).map((x) => ({ q: x.u, a: x.a.slice(0, 400) }));
    try {
      await streamAsk({ question: q, history }, {
        onMeta: (meta) => { m.p = meta.passages || []; m.d = !!meta.degraded; },
        onDelta: (full) => { m.a = full; paint(); },
        onDone: (d) => { m.v = d.verify || null; },
      }, ctl.signal);
      if (!m.a.trim()) throw new Error('empty');
    } catch {
      m.a = m.a || zh('这会儿没连上问谱。稍后再试，或先翻目录找相关的卷门。');
      m.d = true;
    }
    clearTimeout(to);
    m.done = true;
    busy = false;
    // 只存最近 20 轮；答语已是纯文本
    sess = sess.slice(-20);
    store.set('aiSession', sess);
    paint();
  }

  /* 开合（与目录抽屉同一套 overlay；两抽屉互斥） */
  let isOpen = false;
  function open() {
    if (isOpen) return;
    isOpen = true;
    document.querySelector('#drawer-left')?.classList.remove('open');
    drawer.classList.add('open');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('show'));
    paint();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    drawer.classList.remove('open');
    if (!document.querySelector('#drawer-left.open')) {
      overlay.classList.remove('show');
      setTimeout(() => { if (!drawer.classList.contains('open')) overlay.hidden = true; }, 280);
    }
  }

  /* 接线 */
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest?.('.chip-btn');
    if (b) send(b.dataset.q);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(ta.value); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ta.value); }
  });
  $('#btn-ask-new').addEventListener('click', () => {
    ctl?.abort();
    sess = []; store.set('aiSession', sess); busy = false; paint();
  });
  $('#btn-ask-close').addEventListener('click', close);

  paint();
  return { open, close, toggle: () => (isOpen ? close() : open()), repaint: paint, get isOpen() { return isOpen; } };
}
