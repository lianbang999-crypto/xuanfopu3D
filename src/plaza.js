// 共修大厅 · 前端
// 职责：广场数据取用（掷轮攒批上报／及第局录）＋ 大厅面板渲染（12 桌网格·动态广播·及第录）
// 规则判定与谱义一律不在此处；本模块只做展示与上报。
// 名字口径：进大厅／看广播／一人行谱皆不问名；入座与及第才问，且及第可不填（作「无名同修」）。

const PENDING_KEY = 'sm10.plaza.pending'; // 未送达的掷数（关页面也不丢）
const NAME_KEY = 'sm10.net.name';         // 与联机名号共用，免重复填写
const TICK_BATCH = 10;                    // 每十掷送一次，省请求

export const TABLE_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const STATE_TEXT = { empty: '空室', waiting: '候莲友', playing: '行谱中', full: '满座' };

export function savedName() {
  try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
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
      body: JSON.stringify({ n: send }),
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
    const blob = new Blob([JSON.stringify({ n })], { type: 'application/json' });
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
  return `<button class="pzT s-${t.state}${t.locked ? ' locked' : ''}${mine ? ' mine' : ''}" data-code="${esc(t.code)}"${t.state === 'full' && !mine ? ' disabled' : ''}>
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

// 大厅面板：ui = { el, esc, zh, onSolo, onSit, onQuick, onPrivate, onRefresh }
export function renderPlaza(data, ui) {
  const { el, esc } = ui;
  const tables = data.tables || [];
  const feed = (data.feed || []).slice(0, 6);
  const runs = (data.runs || []).slice(0, 8);

  const p = el(`<div class="panel pzPanel"><h2>共修大厅</h2><div class="body">
    <div class="pzStat">
      <div class="big"><b>${num(data.tosses)}</b> 掷</div>
      <div class="sub">今日 ${num(data.tossesToday)} 掷 · 今日及第 ${num(data.winsToday)} 次</div>
      <div class="sub">此刻 ${num(data.online)} 位在座 · ${num(data.playingTables)} 桌行谱中${data.hallCount > 1 ? ` · 共修${TABLE_ORD[(data.hall || 1) - 1] || data.hall}厅` : ''}</div>
    </div>

    <div class="pzGrid">${tables.map(t => tableCell(t, esc, ui.seatedAt)).join('')}</div>

    <div class="pzActs">
      <button class="gbtn primary" id="pzSolo">一人行谱</button>
      <button class="gbtn" id="pzQuick">随喜入座</button>
    </div>
    <div class="cNote" style="text-align:center">点空位即坐即掷。入座后可设四位数密码，邀请链接发给莲友即成熟人局；一人行谱不占座。</div>

    ${feed.length ? `<div class="pzHead">动态</div><div class="pzFeed">${feed.map(f =>
      `<div class="pzF"><span>${esc(f.text)}</span><i>${when(f.ts)}</i></div>`).join('')}</div>` : ''}

    ${runs.length ? `<details class="sec pzRuns"><summary>及第录 · 近${runs.length}局行处</summary>
      <div style="margin-top:6px">${runs.map(r => runLine(r, esc)).join('')}</div></details>` : ''}

    ${ui.seatedAt ? `<div class="cNote" style="text-align:center;margin-top:8px">您现在共修室${TABLE_ORD[Number(String(ui.seatedAt).split('T')[1]) - 1] || ''}——点别室即换座，原座随之让出。</div>` : ''}
    <div class="pzFoot">
      <span class="tlink" id="pzPriv">如何邀莲友</span>
      <span class="tlink" id="pzClose">${ui.backText || '返回'}</span>
    </div>
  </div></div>`);

  p.querySelectorAll('.pzT').forEach(btn => btn.addEventListener('click', () => {
    ui.onSit(btn.dataset.code, '', btn.classList.contains('locked'));
  }));
  p.querySelector('#pzSolo').addEventListener('click', () => ui.onSolo());
  p.querySelector('#pzQuick').addEventListener('click', () => {
    // 随喜入座：优先坐进人最多但未满的桌，先把桌坐满，免得人人各据一桌
    // 随喜入座只坐没上锁的室——上锁的是熟人局，不该把陌生人塞进去
    const open = tables.filter(t => t.state !== 'full' && !t.locked);
    if (!open.length) return ui.onQuick(null);
    const best = open.slice().sort((a, b) => b.live - a.live)[0];
    ui.onQuick(best.code);
  });
  p.querySelector('#pzPriv').addEventListener('click', () => ui.onPrivate());
  p.querySelector('#pzClose').addEventListener('click', () => ui.onClose());
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
.pzPanel .body{max-height:min(72vh,640px);overflow-y:auto}
.pzStat{text-align:center;padding:6px 0 12px;border-bottom:1px solid rgba(216,197,139,.16)}
.pzStat .big{color:#e8c766;letter-spacing:2px}
.pzStat .big b{font-size:26px;letter-spacing:3px}
.pzStat .sub{font-size:var(--fs-xs,11px);color:#9d9170;letter-spacing:1px;margin-top:3px}
.pzGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0}
@media (max-width:420px){.pzGrid{grid-template-columns:repeat(3,1fr)}}
.pzT{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px 7px;cursor:pointer;
  border:1px solid rgba(216,197,139,.26);border-radius:10px;background:rgba(255,255,255,.035);color:#cfc7ad;font:inherit}
.pzT:hover:not(:disabled){border-color:rgba(232,199,102,.6);background:rgba(232,199,102,.1)}
.pzT:disabled{opacity:.45;cursor:not-allowed}
.pzT .ord{font-size:var(--fs-md,14px);color:#dccf9f;letter-spacing:2px}
.pzT .dots{font-size:10px;letter-spacing:2px;color:#e8c766}
.pzT .st{font-size:var(--fs-xs,11px);color:#9d9170;letter-spacing:1px}
.pzT .who{font-size:9px;line-height:1.3;color:#9d9170;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pzT .who i{font-style:normal}
.pzT .ord em{font-style:normal;font-size:9px;margin-left:2px}
.pzT.locked{border-style:dashed}
.pzT.locked .st{color:#b9a7e0}
.pzT.mine{border-color:rgba(232,199,102,.85);background:rgba(232,199,102,.14)}
.pzT.mine .st{color:#e8c766}
.pzT.s-playing{border-color:rgba(150,225,214,.4)}
.pzT.s-playing .st{color:#96e1d6}
.pzT.s-waiting{border-color:rgba(232,199,102,.5)}
.pzT.s-waiting .st{color:#e8c766}
.pzActs{display:flex;gap:8px;margin:4px 0 6px}
.pzActs .gbtn{flex:1}
.pzHead{margin-top:14px;font-size:var(--fs-sm,12.5px);color:#dccf9f;letter-spacing:2px}
.pzFeed{margin-top:5px}
.pzF{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:var(--fs-sm,12.5px);
  color:#cfc7ad;border-bottom:1px solid rgba(216,197,139,.08)}
.pzF i{font-style:normal;color:#9d9170;font-size:var(--fs-xs,11px);flex:none}
.pzRuns{margin-top:10px}
.pzRun{display:flex;align-items:baseline;gap:7px;padding:4px 0;font-size:var(--fs-sm,12.5px);color:#cfc7ad}
.pzRun b{color:#e8c766;flex:none}
.pzRun span{flex:1}
.pzRun i{font-style:normal;color:#9d9170;font-size:var(--fs-xs,11px);flex:none}
.pzFoot{display:flex;justify-content:space-between;margin-top:14px}
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
