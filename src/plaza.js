// 共修大厅 · 前端
// 职责：广场数据取用（掷轮攒批上报／每日功课榜／及第局录）＋ 大厅面板渲染（12 室·动态广播）
// 规则判定与谱义一律不在此处；本模块只做展示与上报。
// 名字口径：进大厅／看广播／一人行谱皆不问名；入座与及第才问，且及第可不填（作「无名同修」）。

const PENDING_KEY = 'sm10.plaza.pending'; // 未送达的掷数（关页面也不丢）
const NAME_KEY = 'sm10.net.name';         // 与联机名号共用，免重复填写
const PRACTICE_ID_KEY = 'sm10.practice.id'; // 本机匿名功课身份：不含账号、IP 等个人信息
const TICK_BATCH = 10;                    // 每十掷送一次，省请求

export const TABLE_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const STATE_TEXT = { empty: '空室', waiting: '候莲友', playing: '行谱中', full: '满座' };

export function savedName() {
  try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
}
export function practiceId() {
  try {
    const old = localStorage.getItem(PRACTICE_ID_KEY) || '';
    if (/^p_[a-f0-9]{24}$/.test(old)) return old;
    const bytes = new Uint8Array(12);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const id = `p_${[...bytes].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    localStorage.setItem(PRACTICE_ID_KEY, id);
    return id;
  } catch (e) {
    return `p_${String(Date.now()).padStart(24, '0').slice(-24)}`;
  }
}
export function practiceName() {
  const named = savedName();
  return named || `莲友·${practiceId().slice(-4).toUpperCase()}`;
}
function pending() {
  try { return Math.max(0, Number(localStorage.getItem(PENDING_KEY)) || 0); } catch (e) { return 0; }
}
function setPending(n) {
  try { localStorage.setItem(PENDING_KEY, String(Math.max(0, n))); } catch (e) {}
}

// ---------------- 上报 ----------------

// 掷轮计数：只在轮落定时调用一次；攒够一批或强制时才发请求
let sending = false;
export async function tick(n = 1, force = false) {
  setPending(pending() + n);
  if (sending) return;
  if (!force && pending() < TICK_BATCH) return;
  await flush();
}

export async function flush() {
  const n = pending();
  if (!n || sending) return;
  sending = true;
  try {
    // 服务端单次封顶 60，超出留待下批，免默默丢数
    const send = Math.min(60, n);
    const r = await fetch('/api/plaza/tick', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: send, actor: practiceId(), name: practiceName() }),
    });
    if (r.ok) setPending(pending() - send);
  } catch (e) { /* 送不出就留着，下次再送 */ }
  finally { sending = false; }
}

// 关页面时把余数用 sendBeacon 送走（fetch 会被中断，beacon 不会）
export function flushOnExit() {
  const n = Math.min(60, pending());
  if (!n || !navigator.sendBeacon) return;
  try {
    const blob = new Blob([JSON.stringify({ n, actor: practiceId(), name: practiceName() })], { type: 'application/json' });
    if (navigator.sendBeacon('/api/plaza/tick', blob)) setPending(pending() - n);
  } catch (e) {}
}

// 及第局录：名字选填，不填即「无名同修」
export async function record(run) {
  try {
    const r = await fetch('/api/plaza/record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    return r.ok;
  } catch (e) { return false; }
}

export async function fetchPlaza(hall = 0) {
  const r = await fetch(`/api/plaza${hall ? `?hall=${hall}` : ''}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 一局行处摘要：从足迹算历经门／最深落处／历经位次数／横超或竖出
// depthOf(pid) 须返回该位在十法界竖轴上的高度（愈低愈深）——门号是章次不是深浅：
// 门1「發始因地」是起点门而非最深处，拿门号当深浅会把「上品十惡」误报成最深落处。
export function runSummary(trail, byId, n, seat, depthOf) {
  const uniq = [...new Set(trail || [])].filter(id => byId[id]);
  const doors = [...new Set(uniq.map(id => byId[id].door))].sort((a, b) => a - b);
  let lowest = null;
  let lowD = Infinity;
  for (const id of uniq) {
    const d = Number(depthOf ? depthOf(id) : byId[id].door);
    if (!Number.isFinite(d)) continue;
    if (d < lowD) { lowD = d; lowest = id; }
  }
  return {
    n,
    doors,
    lowest: lowest ? byId[lowest].name : '',
    span: uniq.length,
    path: uniq.some(id => byId[id].pure) ? 'pure' : 'rise',
    seat,
  };
}

// ---------------- 渲染 ----------------

const num = (v) => Number(v || 0).toLocaleString('en-US');

function when(ts) {
  const d = Date.now() - Number(ts || 0);
  if (d < 60000) return '刚刚';
  if (d < 3600000) return `${Math.max(1, Math.floor(d / 60000))}分钟前`;
  if (d < 86400000) return `${Math.max(1, Math.floor(d / 3600000))}小时前`;
  return `${Math.max(1, Math.floor(d / 86400000))}天前`;
}

function tableCell(t, esc, here) {
  const dots = Array.from({ length: t.max }, (_, i) => (i < t.live ? '●' : '○')).join('');
  const who = t.seats.filter(s => s.online).map(s =>
    `<i style="color:${esc(s.color || '#dccf9f')}">${esc(s.name)}</i>`).join(' ');
  // 上锁的室照样列出（藏起来反而让人纳闷"为什么这桌空着没人坐"），点了再问密码
  const mine = t.code === here;
  const state = mine ? '您在此' : (t.locked ? '凭密码入座' : (STATE_TEXT[t.state] || ''));
  return `<button class="pzT s-${t.state}${t.locked ? ' locked' : ''}${mine ? ' mine' : ''}" data-code="${esc(t.code)}"
    aria-label="共修室${TABLE_ORD[t.no - 1]}，${state}，${t.live}/${t.max}位在线"${t.state === 'full' && !mine ? ' disabled' : ''}>
    <span class="ord">${TABLE_ORD[t.no - 1]}${t.locked ? '<em>🔒</em>' : ''}</span>
    <span class="dots">${dots}</span>
    <span class="st">${mine ? '您在此' : (t.locked ? '凭密码' : (STATE_TEXT[t.state] || ''))}</span>
    <span class="who">${who || '&nbsp;'}</span></button>`;
}

function runLine(r, esc) {
  const bits = [`第 ${r.n} 掷及第`];
  if (r.doors.length) bits.push(`历${r.doors.length}门`);
  if (r.lowest) bits.push(`最深曾至「${esc(r.lowest)}」`);
  if (r.path === 'pure') bits.push('横超净土');
  return `<div class="pzRun"><b>${esc(r.name)}</b><span>${bits.join(' · ')}</span><i>${when(r.ts)}</i></div>`;
}

function leaderRows(rows, esc) {
  if (!rows.length) return '<div class="pzRankEmpty">今日尚无人记入功课</div>';
  return rows.slice(0, 10).map((row, i) => `<div class="pzRankRow">
    <span class="no">${i + 1}</span><b>${esc(row.name)}</b>
    <span>${num(row.tosses)} 念</span>
  </div>`).join('');
}

function rankingHtml(data, esc) {
  const today = data.practiceLeaders || [];
  return `<button class="pzRankClose" type="button" aria-label="关闭功课榜">✕</button>
    <div class="pzRankHead"><span>今日共修</span><h3>念佛功课榜</h3>
      <p>一掷一称念 · 至心称念「南无阿弥陀佛」</p></div>
    <div class="pzRankStats">
      <div><b>${num(data.tossesToday)}</b><span>今日称念</span></div>
      <div><b>${num(data.practicePeople)}</b><span>今日莲友</span></div>
      <div><b>${num(data.winsToday)}</b><span>今日及第</span></div>
      <div><b>${num(data.tosses)}</b><span>累计称念</span></div>
    </div>
    <div class="pzRankList">${leaderRows(today, esc)}</div>
    <div class="pzRankNote">随喜记录，不作修证高下；榜单每日零时（北京时间）重新开始</div>`;
}

function openRanking(p, ui) {
  const layer = p.querySelector('.pzRankLayer');
  const card = layer.querySelector('.pzRankCard');
  card.innerHTML = rankingHtml(p._plazaData || {}, ui.esc);
  layer.classList.add('on');
  layer.setAttribute('aria-hidden', 'false');
  const close = () => {
    layer.classList.remove('on');
    layer.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', onEsc, true);
    p.querySelector('#pzRank')?.focus({ preventScroll: true });
  };
  const onEsc = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };
  window.addEventListener('keydown', onEsc, true);
  layer.querySelector('.pzRankClose').addEventListener('click', close);
  layer.addEventListener('pointerdown', (event) => { if (event.target === layer) close(); }, { once: true });
  layer.querySelector('.pzRankClose').focus();
}

function tickerHtml(data, esc) {
  const feed = (data.feed || []).slice(0, 8);
  const items = feed.length ? feed : [{
    text: `此刻 ${num(data.online)} 位在座 · 今日 ${num(data.tossesToday)} 念 · ${num(data.winsToday)} 次及第`,
    ts: Date.now(),
  }];
  const set = items.map(item => `<span>${esc(item.text)}<i>${when(item.ts)}</i></span>`).join('');
  return `<span class="pzTickerSet">${set}</span>${items.length > 1 ? `<span class="pzTickerSet" aria-hidden="true">${set}</span>` : ''}`;
}

// 只补写会变化的桌况与数字，不销毁大厅本身；保住滚动、焦点和已打开的功课榜。
export function updatePlaza(p, data, ui) {
  p._plazaData = data;
  p._plazaUi = ui || p._plazaUi;
  const activeUi = p._plazaUi;
  const tables = data.tables || [];
  p.querySelector('.pzGrid').innerHTML = tables.map(t => tableCell(t, activeUi.esc, activeUi.seatedAt)).join('');
  p.querySelector('.pzOnline').textContent = num(data.online);
  p.querySelector('.pzPlaying').textContent = num(data.playingTables);
  p.querySelector('.pzTodayToss').textContent = num(data.tossesToday);
  p.querySelector('.pzTodayWins').textContent = num(data.winsToday);
  p.querySelector('.pzTickerTrack').innerHTML = tickerHtml(data, activeUi.esc);
  p.querySelector('.pzTickerTrack').classList.toggle('move', (data.feed || []).length > 1);
  const seat = p.querySelector('.pzSeatNote');
  const no = Number(String(activeUi.seatedAt || '').split('T')[1]);
  seat.hidden = !activeUi.seatedAt;
  seat.textContent = activeUi.seatedAt ? `您在共修室${TABLE_ORD[no - 1] || ''} · 换室会先让出原座` : '';
}

// 全屏大厅：顶部动态 + 单人/多人二选一；选桌是次级操作，榜单在大厅内层弹出。
export function renderPlaza(data, ui) {
  const { el } = ui;
  const p = el(`<div class="panel pzPanel">
    <div class="pzShell">
      <header class="pzTop">
        <div><span class="pzEyebrow">选佛谱</span><h2>共修大厅</h2></div>
        <div class="pzPresence" aria-live="polite">
          <span><b class="pzOnline">0</b> 位在座</span><i></i>
          <span><b class="pzPlaying">0</b> 桌行谱中</span>
        </div>
      </header>

      <button class="pzTicker" id="pzRank" type="button" aria-haspopup="dialog">
        <span class="pzTickerLabel">共修动态</span>
        <span class="pzTickerViewport"><span class="pzTickerTrack"></span></span>
        <span class="pzTickerMore">功课榜 <b>›</b></span>
      </button>

      <section class="pzModes" aria-label="选择行谱方式">
        <button class="pzMode solo" id="pzSolo" type="button">
          <span class="pzModeNo">一</span><span><b>一人行谱</b><i>随时开始 · 独自完成一局</i></span><em>开始</em>
        </button>
        <button class="pzMode multi primary" id="pzQuick" type="button">
          <span class="pzModeNo">众</span><span><b>与人共修</b><i>2–4 人 · 自动加入合适的共修室</i></span><em>随喜入座</em>
        </button>
      </section>

      <main class="pzMain">
        <section class="pzRooms">
          <div class="pzSectionHead"><div><span>选择共修室</span><h3>十二室</h3></div>
            <p>自行选室 · 两位准备即可开局</p></div>
          <div class="pzGrid"></div>
          <div class="pzSeatNote" hidden></div>
        </section>
        <aside class="pzAside">
          <div class="pzToday">
            <span>今日共修</span>
            <div><b class="pzTodayToss">0</b><i>称念</i></div>
            <div><b class="pzTodayWins">0</b><i>及第</i></div>
          </div>
          <div class="pzGuide">
            <b>入座后</b>
            <p>先在准备室等候莲友。东位可邀请莲友或设置四位数密码。</p>
            <button type="button" id="pzPriv">邀请说明</button>
          </div>
          <button class="pzBack" id="pzClose" type="button">${ui.backText || '返回'}</button>
        </aside>
      </main>
    </div>
    <div class="pzRankLayer" aria-hidden="true">
      <section class="pzRankCard" role="dialog" aria-modal="true" aria-label="共修功课榜"></section>
    </div>
  </div>`);

  p._plazaUi = ui;
  p.querySelector('.pzGrid').addEventListener('click', (event) => {
    const button = event.target.closest('.pzT');
    if (button) ui.onSit(button.dataset.code, '', button.classList.contains('locked'));
  });
  p.querySelector('#pzSolo').addEventListener('click', () => ui.onSolo());
  p.querySelector('#pzQuick').addEventListener('click', () => {
    const tables = p._plazaData?.tables || [];
    // 优先坐进人最多但未满且未上锁的室，让同修更快凑齐开局。
    const open = tables.filter(t => t.state !== 'full' && !t.locked);
    if (!open.length) return ui.onQuick(null);
    const best = open.slice().sort((a, b) => b.live - a.live)[0];
    ui.onQuick(best.code);
  });
  p.querySelector('#pzRank').addEventListener('click', () => openRanking(p, ui));
  p.querySelector('#pzPriv').addEventListener('click', () => ui.onPrivate());
  p.querySelector('#pzClose').addEventListener('click', () => ui.onClose());
  updatePlaza(p, data, ui);
  return p;
}

// 入座前问名（只在没有存名时出现一次；留空即「莲友」，此后自动带上）
// 版式与密码卡同一路数：一句话、一个大字输入、一个主钮——不设 label 与补充说明，
// 该说的写进 placeholder 与那一句话里，少一层视觉噪音。
export function renderSitName(code, ui) {
  const { el } = ui;
  const ord = TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
  const p = el(`<div class="panel pzAsk"><h2>入座 · 共修室${ord}</h2>
    <form class="body" id="pzNameForm">
      <div class="lead">同座莲友要认得您</div>
      <input id="pzName" class="bigIn" maxlength="12" autocomplete="nickname" placeholder="莲友">
      <div class="hint" id="pzNameNote">留空即称「莲友」· 至多十二字 · 只问这一次</div>
      <button class="gbtn primary big" type="submit">入座</button>
      <button class="gbtn ghost" id="pzNameBack" type="button">返回大厅</button>
    </form></div>`);
  const input = p.querySelector('#pzName');
  p.querySelector('#pzNameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = Array.from(input.value.replace(/\s+/g, ' ').trim()).slice(0, 12).join('') || '莲友';
    saveName(name);
    ui.onSit(code, name);
  });
  p.querySelector('#pzNameBack').addEventListener('click', () => ui.onBack());
  setTimeout(() => input.focus(), 80);
  return p;
}

// 入座上锁之室：先问密码
export function renderSitKey(code, ui, errText = '') {
  const { el } = ui;
  const ord = TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
  const p = el(`<div class="panel pzAsk"><h2>共修室${ord} · 凭密码入座</h2>
    <form class="body" id="pzKeyForm">
      <div class="lead">此室已由莲友设了密码</div>
      <input id="pzKey" class="bigIn num" maxlength="4" inputmode="numeric" placeholder="····">
      <div class="hint${errText ? ' err' : ''}" id="pzKeyNote">${errText || '也可直接点莲友发来的邀请链接，无须手输'}</div>
      <button class="gbtn primary big" type="submit">入座</button>
      <button class="gbtn ghost" id="pzKeyBack" type="button">返回大厅</button>
    </form></div>`);
  const input = p.querySelector('#pzKey');
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
  p.querySelector('#pzKeyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(input.value)) { p.querySelector('#pzKeyNote').textContent = '请填四位数字'; return; }
    ui.onKey(code, input.value);
  });
  p.querySelector('#pzKeyBack').addEventListener('click', () => ui.onBack());
  setTimeout(() => input.focus(), 80);
  return p;
}

export const PLAZA_CSS = `
/* 共修大厅是模式选择中心，不再作为窄弹窗：全屏承载两种玩法、动态与选桌。 */
.overlay:has(.pzPanel){align-items:stretch;justify-content:stretch;background:rgba(8,8,18,.78)}
.overlay .pzPanel{width:100vw;max-width:none;height:100dvh;max-height:none;box-sizing:border-box;
  padding:0;border:0;border-radius:0;overflow:hidden;background:
  radial-gradient(circle at 78% 16%,rgba(87,70,128,.18),transparent 34%),
  radial-gradient(circle at 14% 82%,rgba(119,77,45,.12),transparent 30%),
  linear-gradient(145deg,rgba(17,17,31,.985),rgba(23,20,38,.985) 56%,rgba(13,16,28,.99));
  backdrop-filter:none;animation:pzIn .24s ease-out}
@keyframes pzIn{from{opacity:.4;transform:scale(1.01)}}
.pzPanel>.ovClose{top:calc(18px + env(safe-area-inset-top));right:calc(22px + env(safe-area-inset-right));
  border-color:rgba(232,199,102,.22);background:rgba(255,255,255,.035);color:#b9b09a}
.pzLoading{display:grid!important;place-items:center}.pzLoadingInner{text-align:center;width:min(360px,84vw)}
.pzLoadingInner>span{color:#817967;font-size:var(--fs-xs,11px);letter-spacing:4px}
.pzLoadingInner h2{margin:6px 0 18px;color:#f0dfa8;font-size:28px;letter-spacing:7px;font-weight:500}
.pzLoadingInner .body{color:#9d9170}.pzLoadingInner .gbtn{display:block;width:100%;margin-top:10px}
.pzShell{width:min(1180px,100%);height:100%;margin:auto;padding:calc(24px + env(safe-area-inset-top))
  max(24px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom))
  max(24px,env(safe-area-inset-left));box-sizing:border-box;display:grid;
  grid-template-rows:auto auto auto minmax(0,1fr);gap:16px}
.pzTop{display:flex;align-items:center;justify-content:space-between;padding-right:58px}
.pzEyebrow{display:block;font-size:var(--fs-xs,11px);color:#8f856d;letter-spacing:4px;margin-bottom:3px}
.pzTop h2{margin:0;color:#f1dfaa;font-size:clamp(24px,3vw,36px);letter-spacing:7px;font-weight:500}
.pzPresence{display:flex;align-items:center;gap:12px;color:#aaa18c;font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzPresence b{font-size:18px;color:#e8c766;font-weight:500}
.pzPresence i{width:3px;height:3px;border-radius:50%;background:#776e5b}
.pzTicker{width:100%;min-height:44px;display:flex;align-items:center;gap:16px;padding:0 16px;
  overflow:hidden;border:1px solid rgba(216,197,139,.18);border-radius:12px;
  background:rgba(255,255,255,.025);color:#cfc7ad;font:inherit;cursor:pointer;text-align:left}
.pzTicker:hover,.pzTicker:focus-visible{border-color:rgba(232,199,102,.48);background:rgba(232,199,102,.07)}
.pzTickerLabel{color:#e8c766;font-size:var(--fs-xs,11px);letter-spacing:2px;white-space:nowrap}
.pzTickerViewport{min-width:0;flex:1;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 3%,#000 97%,transparent)}
.pzTickerTrack{display:flex;width:max-content;white-space:nowrap}
.pzTickerTrack.move{animation:pzMarquee 34s linear infinite}
.pzTickerSet{display:flex;align-items:center;gap:48px;padding-right:48px}
.pzTickerSet span{font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzTickerSet i{font-style:normal;color:#746d5d;font-size:var(--fs-xs,11px);margin-left:9px}
@keyframes pzMarquee{to{transform:translateX(-50%)}}
.pzTickerMore{flex:none;color:#a99c79;font-size:var(--fs-sm,12.5px);letter-spacing:1px;white-space:nowrap}
.pzTickerMore b{font-size:18px;font-weight:400;margin-left:4px}
.pzModes{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pzMode{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;min-height:84px;
  padding:16px 18px;text-align:left;font:inherit;border-radius:14px;cursor:pointer;
  border:1px solid rgba(216,197,139,.2);background:rgba(255,255,255,.035);color:#d5cdb8;
  transition:transform .18s,border-color .18s,background .18s}
.pzMode:hover,.pzMode:focus-visible{transform:translateY(-1px);border-color:rgba(232,199,102,.52);background:rgba(232,199,102,.08)}
.pzMode.primary{border-color:rgba(232,199,102,.45);background:linear-gradient(110deg,rgba(197,150,51,.19),rgba(232,199,102,.07))}
.pzModeNo{width:40px;height:40px;display:grid;place-items:center;border:1px solid rgba(232,199,102,.35);
  border-radius:50%;color:#e8c766;font-family:var(--f-display);font-size:17px}
.pzMode span:nth-child(2){display:grid;gap:4px;min-width:0}
.pzMode b{color:#f0dfa8;font-size:var(--fs-lg,16px);letter-spacing:3px;font-weight:600}
.pzMode i{font-style:normal;color:#8f8774;font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzMode em{font-style:normal;color:#c8b988;font-size:var(--fs-sm,12.5px);letter-spacing:2px}
.pzMain{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:18px;min-height:0}
.pzRooms{min-height:0;display:flex;flex-direction:column;padding:18px;border:1px solid rgba(216,197,139,.13);
  border-radius:16px;background:rgba(255,255,255,.018);overflow:auto}
.pzSectionHead{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:14px}
.pzSectionHead span,.pzToday>span{display:block;color:#8f856d;font-size:var(--fs-xs,11px);letter-spacing:2px}
.pzSectionHead h3{margin:2px 0 0;color:#d9ccaa;font-size:var(--fs-lg,16px);font-weight:500;letter-spacing:4px}
.pzSectionHead p{margin:0;color:#77705f;font-size:var(--fs-xs,11px);letter-spacing:1px}
.pzGrid{display:grid;grid-template-columns:repeat(4,minmax(108px,1fr));gap:10px}
.pzT{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:92px;padding:13px 14px;cursor:pointer;
  border:1px solid rgba(216,197,139,.18);border-radius:12px;background:rgba(255,255,255,.025);color:#cfc7ad;font:inherit}
.pzT:hover:not(:disabled),.pzT:focus-visible:not(:disabled){border-color:rgba(232,199,102,.55);background:rgba(232,199,102,.08)}
.pzT:disabled{opacity:.42;cursor:not-allowed}
.pzT .ord{font-size:var(--fs-md,14px);color:#dccf9f;letter-spacing:2px}
.pzT .dots{font-size:11px;letter-spacing:3px;color:#8e8265}
.pzT .st{font-size:var(--fs-xs,11px);color:#8f8774;letter-spacing:1px}
.pzT .who{font-size:var(--fs-xs,11px);line-height:1.35;color:#9d9170;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pzT .who i{font-style:normal}
.pzT .ord em{font-style:normal;font-size:9px;margin-left:3px}
.pzT.locked{border-style:dashed}.pzT.locked .st{color:#b9a7e0}
.pzT.mine{border-color:rgba(232,199,102,.86);background:rgba(232,199,102,.12)}.pzT.mine .st{color:#e8c766}
.pzT.s-playing{border-color:rgba(150,225,214,.38)}.pzT.s-playing .st{color:#96e1d6}
.pzT.s-waiting{border-color:rgba(232,199,102,.48)}.pzT.s-waiting .st{color:#e8c766}
.pzSeatNote{margin-top:12px;color:#a99c79;font-size:var(--fs-sm,12.5px);text-align:center;letter-spacing:1px}
.pzAside{display:flex;flex-direction:column;gap:12px;min-height:0}
.pzToday,.pzGuide{border:1px solid rgba(216,197,139,.14);border-radius:14px;background:rgba(255,255,255,.025);padding:16px}
.pzToday{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pzToday>span{grid-column:1/-1}
.pzToday div{display:grid;gap:3px}.pzToday b{color:#e8c766;font-size:24px;font-weight:500}.pzToday i{font-style:normal;color:#7e7766;font-size:var(--fs-xs,11px);letter-spacing:1px}
.pzGuide{color:#9a927f;line-height:1.7;font-size:var(--fs-sm,12.5px)}
.pzGuide b{color:#d8cba8;letter-spacing:2px}.pzGuide p{margin:7px 0 10px}
.pzGuide button,.pzBack{border:0;background:none;color:#c8b988;font:inherit;font-size:var(--fs-sm,12.5px);letter-spacing:1px;cursor:pointer;padding:8px 0}
.pzGuide button:hover,.pzBack:hover{color:#f0dfa8}
.pzBack{margin-top:auto;min-height:44px;border:1px solid rgba(216,197,139,.16);border-radius:10px}
/* 大厅内层榜单：不销毁大厅，所以返回后桌况、滚动和焦点都还在。 */
.pzRankLayer{position:absolute;inset:0;z-index:6;display:none;align-items:center;justify-content:center;
  padding:20px;background:rgba(6,7,14,.78);backdrop-filter:blur(5px)}
.pzRankLayer.on{display:flex;animation:ovIn .18s ease}
.pzRankCard{position:relative;width:min(620px,94vw);max-height:min(760px,88dvh);overflow:auto;box-sizing:border-box;
  padding:24px;border:1px solid rgba(216,197,139,.28);border-radius:18px;background:rgba(22,21,36,.985);
  box-shadow:0 28px 90px rgba(0,0,0,.52);color:#d8d0bd}
.pzRankClose{position:absolute;right:14px;top:14px;width:44px;height:44px;border-radius:10px;cursor:pointer;
  border:1px solid rgba(216,197,139,.2);background:rgba(255,255,255,.035);color:#aaa18c;font-size:17px}
.pzRankHead span{color:#a4936c;font-size:var(--fs-xs,11px);letter-spacing:3px}
.pzRankHead h3{margin:3px 0 6px;color:#f0dfa8;font-family:var(--f-display);font-size:26px;letter-spacing:6px;font-weight:500}
.pzRankHead p{margin:0;color:#7f7868;font-size:var(--fs-xs,11px);letter-spacing:1px}
.pzRankStats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:20px 0 16px}
.pzRankStats div{display:grid;gap:4px;padding:12px;border:1px solid rgba(216,197,139,.12);border-radius:11px;background:rgba(255,255,255,.025)}
.pzRankStats b{color:#e8c766;font-size:20px;font-weight:500}.pzRankStats span{color:#7f7868;font-size:var(--fs-xs,11px);letter-spacing:1px}
.pzRankList{border-top:1px solid rgba(216,197,139,.14)}
.pzRankRow{display:grid;grid-template-columns:30px minmax(90px,1fr) auto;align-items:center;gap:10px;min-height:48px;
  border-bottom:1px solid rgba(216,197,139,.09);font-size:var(--fs-sm,12.5px)}
.pzRankRow .no{color:#7e7562}.pzRankRow b{color:#dcd0ad;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pzRankRow span{color:#e8c766}
.pzRankEmpty{padding:38px 12px;text-align:center;color:#77705f;letter-spacing:2px}
.pzRankNote{margin-top:12px;color:#6e685a;text-align:center;font-size:var(--fs-xs,11px)}
@media (prefers-reduced-motion:reduce){.pzTickerTrack.move{animation:none}.pzMode{transition:none}}
@media (max-width:820px){
  .pzShell{padding-left:16px;padding-right:16px;gap:12px}
  .pzMain{grid-template-columns:1fr}.pzAside{display:grid;grid-template-columns:1fr 1fr auto}.pzToday,.pzGuide{padding:12px}
  .pzBack{margin:0;align-self:stretch;padding:0 14px}.pzGrid{grid-template-columns:repeat(4,minmax(92px,1fr))}
}
@media (max-width:640px){
  .overlay .pzPanel{width:100vw;max-width:none;height:100dvh;max-height:none;border:0;border-radius:0;padding:0;animation:pzIn .2s ease}
  .pzPanel>.ovClose{top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right))}
  .pzShell{padding:calc(14px + env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom));gap:10px}
  .pzTop{padding-right:50px}.pzTop h2{font-size:24px;letter-spacing:5px}.pzEyebrow{display:none}
  .pzPresence{gap:7px;font-size:11px}.pzPresence b{font-size:14px}
  .pzTicker{min-height:40px;padding:0 11px;gap:9px}.pzTickerLabel{display:none}.pzTickerMore{font-size:11px}
  .pzModes{gap:8px}.pzMode{grid-template-columns:1fr;gap:4px;min-height:78px;padding:11px 12px}
  .pzModeNo{display:none}.pzMode span:nth-child(2){gap:2px}.pzMode b{font-size:14px;letter-spacing:2px}
  .pzMode i{font-size:10.5px;line-height:1.35}.pzMode em{font-size:11px;margin-top:4px}
  .pzMain{display:block;overflow:auto}.pzRooms{padding:12px;overflow:visible}.pzAside{display:grid;grid-template-columns:1fr auto;margin-top:10px}
  .pzToday{display:none}.pzGuide{padding:12px}.pzGuide p{margin:5px 0}.pzBack{padding:0 14px}
  .pzSectionHead{align-items:flex-start;margin-bottom:10px}.pzSectionHead p{max-width:160px;text-align:right;line-height:1.5}
  .pzGrid{grid-template-columns:repeat(3,1fr);gap:7px}.pzT{min-height:78px;padding:10px 9px}.pzT .who{font-size:10px}
  .pzRankLayer{padding:0;align-items:flex-end}.pzRankCard{width:100%;max-width:none;max-height:88dvh;border-radius:18px 18px 0 0;
    border-left:0;border-right:0;border-bottom:0;padding:20px 14px calc(18px + env(safe-area-inset-bottom))}
  .pzRankStats{grid-template-columns:1fr 1fr}.pzRankRow{grid-template-columns:26px minmax(70px,1fr) auto}
}
@media (max-width:370px){.pzGrid{grid-template-columns:repeat(2,1fr)}.pzSectionHead p{display:none}}
/* 问名／问密码卡：一句话、一个大字输入、一个主钮——与密码卡同一路数 */
.pzAsk .body{display:grid;gap:12px;text-align:center}
.pzAsk .lead{color:#dccf9f;font-size:var(--fs-md,14px);letter-spacing:2px}
.pzAsk .bigIn{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);
  border:1px solid rgba(216,197,139,.3);border-radius:12px;color:#f4e6b8;font-family:inherit;
  padding:15px 12px;font-size:22px;letter-spacing:6px;text-indent:6px;text-align:center;outline:none;
  transition:border-color .2s,box-shadow .2s}
.pzAsk .bigIn.num{font-size:28px;letter-spacing:16px;text-indent:16px}
.pzAsk .bigIn::placeholder{color:#6f7787;letter-spacing:6px}
.pzAsk .bigIn:focus{border-color:rgba(232,199,102,.75);box-shadow:0 0 0 3px rgba(215,170,69,.14)}
.pzAsk .hint{font-size:var(--fs-xs,11px);color:#9d9170;letter-spacing:1px;min-height:15px}
.pzAsk .hint.err{color:#d98873}
.pzAsk .gbtn.big{width:100%;padding:13px 0;font-size:var(--fs-md,14px);letter-spacing:3px}
.pzAsk .gbtn.ghost{width:100%;background:none;border-color:rgba(216,197,139,.22);color:#9d9170}
`;

/* 同修及第横幅：不弹窗不打断 */
export const PEER_WIN_CSS = `
#peerWin{position:fixed;left:50%;top:12%;transform:translate(-50%,-14px);z-index:52;pointer-events:none;
  opacity:0;transition:opacity .45s,transform .45s;white-space:nowrap;
  background:linear-gradient(90deg,rgba(232,199,102,0),rgba(232,199,102,.22),rgba(232,199,102,0));
  border-top:1px solid rgba(232,199,102,.45);border-bottom:1px solid rgba(232,199,102,.45);
  padding:9px 30px;color:#f4e6b8;letter-spacing:2px;font-size:var(--fs-md,14px)}
#peerWin.show{opacity:1;transform:translate(-50%,0)}
#peerWin b{color:#e8c766;font-weight:600;margin-right:6px}
#peerWin i{font-style:normal;color:#96e1d6;margin-left:12px;font-size:var(--fs-sm,12.5px)}
`;
