// 共修大厅 · 前端
// 职责：广场数据取用（掷轮攒批上报／每日功课榜）＋ 大厅面板渲染（9 室·动态广播）
// 规则判定与谱义一律不在此处；本模块只做展示与上报。
// 名字口径：进大厅／看广播／一人行谱皆不问名；真人入座才问，功课榜沿用该名或稳定匿名莲号。

import { ico } from './icons.js'; // 内联 SVG：一人／众人两张模式卡先认形，再认字

const PENDING_KEY = 'sm10.plaza.pending'; // 未送达的掷数（关页面也不丢）
const NAME_KEY = 'sm10.net.name';         // 与联机名号共用，免重复填写
const PRACTICE_ID_KEY = 'sm10.practice.id'; // 本机匿名功课身份：不含账号、IP 等个人信息
const TICK_BATCH = 10;                    // 每十掷送一次，省请求

export const TABLE_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const STATE_TEXT = { empty: '空室', waiting: '候莲友', playing: '行谱中', full: '满座' };

export function savedName() {
  try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) {}
}
let memPracticeId = ''; // localStorage 不可用（隐私模式/配额满）时的会话内兜底：同一会话必须始终同一身份，
                        // 否则上报与查询各拿一个 actor，功课散成服务端幽灵行、「我的」永远查空
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
    if (!memPracticeId) memPracticeId = `p_${String(Date.now()).padStart(24, '0').slice(-24)}`;
    return memPracticeId;
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

// 掷轮计数：只在轮落定时调用一次；攒够一批或强制时才发请求。
// v392 加时间闸：批量之外三分钟必送——题屏「10 分钟内在行谱」靠 updated 新鲜度才立得住
// （旧式攒满十掷才报，慢掷的人在广场上永远「不在场」，刚离开的人反而算在场）
let sending = false;
let lastFlushAt = 0;
export async function tick(n = 1, force = false) {
  setPending(pending() + n);
  if (sending) return;
  if (!force && pending() < TICK_BATCH && Date.now() - lastFlushAt < 180000) return;
  await flush();
}

// 本机最近一次「在场」上报成功的时刻：tick/pushName 都带莲号，服务端皆记一笔 presence——
// 在此窗口内，服务端的在线数必然含本机一票。在线人数展示凭 selfOnline() 自减，
// 免得独自在站还见「1 位莲友在线」（那一位就是自己）——与「不假装热闹」同一条家法。
let lastBeatOk = 0;
export function selfOnline() {
  return Date.now() - lastBeatOk < 8 * 60 * 1000; // ＝服务端 presence 新鲜窗（8 分钟）
}

// 改名后即便无待送掷数，也发一次空报让榜上那一行换名（服务端只认 actor，不改计数）
export async function pushName() {
  try {
    const r = await fetch('/api/plaza/tick', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 0, actor: practiceId(), name: practiceName() }),
    });
    if (r.ok) lastBeatOk = Date.now();
  } catch (e) {}
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
    if (r.ok) { setPending(pending() - send); lastFlushAt = Date.now(); lastBeatOk = Date.now(); }
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

// 一人行谱的成佛：带莲号上报，才记得到本人名下（共修室的由本室服务器出具）
export async function record(run) {
  try {
    const r = await fetch('/api/plaza/record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...run, actor: practiceId() }),
    });
    return r.ok;
  } catch (e) { return false; }
}

// 我的功课：累计·成佛·共修天数·连续日·逐日（月历）·逐局记录
export async function fetchMine() {
  const r = await fetch('/api/plaza/me', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor: practiceId() }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
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

// 2026-08-05 曾改「有人的逐行列出 ＋ 空室压成一行」：十二格时代七八格空盒吃掉半屏。
// 2026-08-12 依用户点单改回九宫格（桌数已收九）：3×3 恒定紧凑，空卡只占 1/9 屏，
//   十二格时代「空盒吃版面」的动因已消；九张桌卡本身即是「厅」的具象——
//   空室不再是要藏的噪声，而是虚位以待的一张桌。
// 格恒为九：壳建一次，此后逐格就地补写——整段 innerHTML 重绘会吞掉键盘焦点与正在进行的点击（旧则不变）。
function tableShell(t, esc) {
  return `<button class="pzR" data-code="${esc(t.code)}">
    <span class="ord"></span><span class="who"></span><span class="st"></span></button>`;
}

// 只在内容真的变了才写 DOM：dataset.raw 记的是转换前的原文，
// 免得简繁转换（zhDom）把已转好的字又被这里的简体原文覆盖回去、每八秒闪一次。
function setCell(host, selector, html) {
  const node = host.querySelector(selector);
  if (!node || node.dataset.raw === html) return;
  node.dataset.raw = html;
  node.innerHTML = html;
}

// 桌卡三段：圆章室号｜在座名号（空则「空室」浅字）｜状态＋人数。
// 名号不再随珠色上色——珠色的辨识意义在房内名单；浅底大厅里统一墨色更清。
function paintTable(button, t, esc, here) {
  const mine = t.code === here;
  const full = t.state === 'full' && !mine;
  const empty = t.state === 'empty';
  const className = `pzR s-${t.state}${t.locked ? ' locked' : ''}${mine ? ' mine' : ''}`;
  if (button.className !== className) button.className = className;
  button.disabled = full;
  const label = mine ? '您在此' : (t.locked ? '凭密码入座' : (STATE_TEXT[t.state] || ''));
  button.setAttribute('aria-label', `共修室${TABLE_ORD[t.no - 1]}，${label}${empty ? '' : `，${t.live}/${t.max}位在线`}`);
  setCell(button, '.ord', `${TABLE_ORD[t.no - 1]}${t.locked ? '<em>🔒</em>' : ''}`);
  const who = empty
    ? `<i class="idle">${t.locked ? '凭密码入座' : '空室'}</i>`
    : t.seats.filter(s => s.online).map(s => `<i>${esc(s.name)}</i>`).join('');
  setCell(button, '.who', who || '&nbsp;');
  // 状态字与「2/4」并列一行；空室不再复述（卡上「空室」已答）
  setCell(button, '.st', empty ? '&nbsp;'
    : `${mine ? '您在此' : (t.locked ? '凭密码' : (STATE_TEXT[t.state] || ''))}<b>${t.live}/${t.max}</b>`);
}

// 哪一行是「我」：服务端不外发匿名莲号，故按本机上报的那个名号比对。
// 重名时服务端缀「 · 莲号尾四位」（worker plaza 同名去重规则）——须按本机尾号精确比对，
// 旧式 startsWith 会把同名他人的行也误标成「您」。
function isMine(name) {
  const mine = practiceName();
  return name === mine || name === `${mine} · ${practiceId().slice(-4).toUpperCase()}`;
}

// 共修动态：一人一行，按最近用功时刻倒序。**不列名次**——
// 念佛记录上不该比高下，时间先后本身就是次序。
function streamRows(rows, esc) {
  if (!rows.length) return '<div class="pzRankEmpty">此刻还没有莲友在行谱</div>';
  return rows.map(row => `<div class="pzRankRow${isMine(row.name) ? ' mine' : ''}">
    <b>${esc(row.name)}</b>${isMine(row.name) ? '<i>您</i>' : ''}
    <span>${num(row.tosses)} 掷${row.wins ? ` · 成佛 ${num(row.wins)}` : ''}</span>
    <em>${when(row.at)}</em>
  </div>`).join('');
}

// 共修动态：独立全屏页（与大厅、我的同壳），不再作大厅内的弹层——少一层嵌套，退路也只有一条。
export function renderStream(data, ui) {
  const { el, esc } = ui;
  const p = el(`<div class="panel pzPanel"><div class="fsShell">
    <header class="pzTop"><div><span class="pzEyebrow">本站共修第 ${num(data.days || 1)} 天</span><h2>共修动态</h2></div>
      <div class="pzPresence"><span>已参加 <b>${num(data.people || 0)}</b> 人</span><i></i><span>累计掷轮 <b>${num(data.tosses || 0)}</b></span></div>
    </header>
    <div class="fsBody"><div class="fsWrap">
      <div class="pzRankList">${streamRows(data.stream || [], esc)}</div>
      <div class="pzRankNote">按最近用功先后列出，不排名次 · 一掷一称念「南无阿弥陀佛」</div>
      <button class="pzBack" id="pzStreamBack" type="button" style="margin-top:16px">回大厅</button>
    </div></div>
  </div></div>`);
  p.querySelector('#pzStreamBack').addEventListener('click', () => ui.onBack());
  return p;
}

// 顶条一句叙述：只说动的——当下多少人在座、几室行谱。
// 2026-08-05 收口：页头右上原另有一份「N 位在座 · N 桌行谱中」，与此处同义，已撤——
// 同一组数不在一屏里说两遍。「已参加 N 人」并入「共修动态」页头（那里本就有一份完整名单）。
// 2026-08-11 再拆：静的（共修第 N 天·累计 N 掷）沉到页脚 .pzStill——数字不是大厅的主角。
function sayHtml(data) {
  // v393 在线人数合一（发起人点单极简）：单机行谱者从前不入「在座/行谱」两数，明明有人在玩却满屏是零——
  // 今只报一个「在线」（服务端 onlineNow＝页面开着的人，心跳制并计单机与联机；旧服务端回退在座数）；
  // 无人则整句不出——不展示数字 0，与题屏「不假装热闹」同一条家法
  // 2026-08-13 去己：本机心跳在窗内时自减一——「莲友」指同修他人，独自在站不再见
  // 「1 位莲友在线」的假热闹（那一位就是自己）
  const n = Number(data.onlineNow ?? data.online ?? 0) - (selfOnline() ? 1 : 0);
  return n > 0 ? `<b>${num(n)}</b> 位莲友在线` : '';
}
// 页脚静数字：站史与累计，动也是一天一动，不必占顶条
function stillHtml(data) {
  return `共修第 <b>${num(data.days || 1)}</b> 天 · 累计 <b>${num(data.tosses || 0)}</b> 掷`;
}
// 顶条第二行：最近在用功的几位莲友。与「共修动态」同一份数据，不另起一套。
function tickerHtml(data, esc) {
  const rows = (data.stream || []).slice(0, 3);
  if (!rows.length) return '<span class="pzTickerSet"><span>此刻还没有莲友在行谱——您可以是第一位</span></span>';
  return `<span class="pzTickerSet">${rows.map(r =>
    `<span>${esc(r.name)}<i>${when(r.at)}</i></span>`).join('')}</span>`;
}

// 离席遮罩（2026-08-13 用户报「点离席后大厅桌面还挂着」）：离席请求与大厅快照赛跑，
// 快照未及更新时桌上还挂着自己的名号（八秒一刷才自愈）。凭 Net 记下的「刚离的席」
// 先按已离席呈现——只抹本机那一票、只在 12 秒窗口内，服务器快照一到即为准；
// 若已另坐一桌（here 有值且同码），说明是重入而非离席，遮罩不生效。
function scrubJustLeft(tables, jl, here) {
  if (!jl || Date.now() - jl.at > 12000 || !jl.code || jl.code === here) return tables;
  return tables.map(t => {
    if (t.code !== jl.code) return t;
    const seats = (t.seats || []).filter(s => s.name !== jl.name);
    const live = seats.filter(s => s.online).length;
    // 桌况按服务端同一把尺就地重判（tableState 的三段：占满／无人在线／行谱或候人）
    const state = seats.length >= t.max ? 'full'
      : (live === 0 ? 'empty'
        : (seats.some(s => s.online && s.roomStatus === 'playing') ? 'playing' : 'waiting'));
    return { ...t, seats, live, state };
  });
}

// 只补写会变化的桌况与数字，不销毁大厅本身；保住滚动、焦点和已打开的功课榜。
export function updatePlaza(p, data, ui) {
  p._plazaUi = ui || p._plazaUi;
  const activeUi = p._plazaUi;
  const here = activeUi.seatedAt;
  const tables = scrubJustLeft(data.tables || [], activeUi.justLeft, here);
  p._plazaData = { ...data, tables }; // 「随喜入座」等读的也是遮罩后的桌况，与眼见一致
  // 九宫格恒定按室号排，不按人数重排——八秒一刷，若照人数排序，
  // 房间会在眼皮底下跳来跳去，正想点的那间恰好挪开。
  const grid = p.querySelector('.pzGrid');
  if (grid.children.length !== tables.length) grid.innerHTML = tables.map(t => tableShell(t, activeUi.esc)).join('');
  const cells = grid.querySelectorAll('.pzR');
  tables.forEach((t, i) => { if (cells[i]) paintTable(cells[i], t, activeUi.esc, here); });
  // 顶条最近几位只在条目身份（时刻＋正文）变了才重写——「几分钟前」每分钟都在变，
  // 拿渲染结果比对等于白比。（滚动动画已随极简方案撤除，此比对仍保住选中态与无谓的 DOM 重排）
  // 数字轻变：内容真变了才重写（dataset.raw 防 zhDom 简繁转换被原文覆写而每拍一闪），
  // 且非首拍时 0.25s 淡入一记——数字换了有感，不跳不滚。
  const sayEl = p.querySelector('.pzTickerSay');
  const sayNow = sayHtml(data);
  if (sayEl.dataset.raw !== sayNow) {
    const firstPaint = !sayEl.dataset.raw;
    sayEl.dataset.raw = sayNow;
    sayEl.innerHTML = sayNow;
    if (!firstPaint) { sayEl.classList.remove('fresh'); void sayEl.offsetWidth; sayEl.classList.add('fresh'); }
  }
  const stillEl = p.querySelector('.pzStill');
  const stillNow = stillHtml(data);
  if (stillEl.dataset.raw !== stillNow) { stillEl.dataset.raw = stillNow; stillEl.innerHTML = stillNow; }
  const track = p.querySelector('.pzTickerTrack');
  const key = (data.stream || []).slice(0, 3).map(r => `${r.at}:${r.name}`).join('|') + '|' + Math.floor(Date.now() / 60000); // 分钟桶：无新掷时「刚刚/N分钟前」也随时间刷新
  if (!key || track.dataset.feed !== key) {
    track.dataset.feed = key;
    track.innerHTML = tickerHtml(data, activeUi.esc);
  }
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
      </header>

      <button class="pzTicker" id="pzRank" type="button" aria-haspopup="dialog" aria-live="polite">
        <span class="pzTickerSay"></span>
        <span class="pzTickerViewport"><span class="pzTickerTrack"></span></span>
        <span class="pzTickerMore">共修动态 <b>›</b></span>
      </button>

      <section class="pzModes" aria-label="共修去处">
        <button class="pzMode multi primary" id="pzQuick" type="button">
          <span class="pzModeNo">${ico('group')}</span><span><b>与人共修</b><i>2–4 人 · 自动入座</i></span><em>随喜入座</em>
        </button>
        <button class="pzMode chalou" id="pzChalou" type="button">
          <span class="pzModeNo">${ico('tea')}</span><span><b>茶寮</b><i>莲友闲话一处</i></span><em>进来坐</em>
        </button>
      </section>

      <main class="pzMain">
        <section class="pzRooms" aria-label="共修诸室">
          <div class="pzGrid"></div>
          <p class="pzRoomsNote">自行选室 · 两位准备即可开局</p>
        </section>
        <div class="pzSeatNote" hidden></div>
        <div class="pzStill"></div>
        <button class="pzBack" id="pzClose" type="button">${ui.backText || '返回'}</button>
      </main>

      <aside class="pzSide" aria-label="莲友茶寮">
        <div class="pzSideHead">莲友茶寮</div>
        <div class="pzSideFeed"></div>
        <div class="pzSideInput"></div>
      </aside>
    </div>
  </div>`);

  p._plazaUi = ui;
  // 一处代理管九格：点任一桌卡即入座（上锁的照旧先问密码）
  p.querySelector('.pzRooms').addEventListener('click', (event) => {
    const button = event.target.closest('.pzR');
    if (button) ui.onSit(button.dataset.code, '', button.classList.contains('locked'));
  });
  // 桌面右墙茶寮（2026-08-11 大厅即茶寮）：挂载交给宿主（chalou.js 的 feed＋input），
  // 大厅自己不知聊天细节；手机上这面墙 display:none，茶寮入口是上头那张卡（独立全屏页）。
  ui.mountSide?.(p.querySelector('.pzSide'));
  p.querySelector('#pzQuick').addEventListener('click', () => {
    const tables = p._plazaData?.tables || [];
    const open = tables.filter(t => t.state !== 'full' && !t.locked);
    if (!open.length) return ui.onQuick(null);
    // 「随喜入座」是要立刻开始共修，不是要旁观：先取还在候莲友的室（其中人最多者最快凑齐），
    // 全都在行谱中才退而求其次——否则人越多的室越可能正打到一半，点进去只能干等一整局。
    const rank = (t) => (t.state === 'waiting' ? 0 : (t.state === 'empty' ? 1 : 2));
    const best = open.slice().sort((a, b) => rank(a) - rank(b) || b.live - a.live)[0];
    ui.onQuick(best.code, best);   // 把选中桌况一并带出：系统替用户挑了哪间、为何，宿主 toast 报出来
  });
  p.querySelector('#pzRank').addEventListener('click', () => ui.onStream());
  p.querySelector('#pzChalou').addEventListener('click', () => ui.onChalou?.());
  p.querySelector('#pzClose').addEventListener('click', () => ui.onClose());
  updatePlaza(p, data, ui);
  return p;
}

// 入座前问名（只在没有存名时出现一次；留空即「莲友」，此后自动带上）
// 一张卡两用：入座前留名号，或单从功课榜来改名号（ui.rename）
// 2026-08-12 极简重做（用户点单）：八层收六层——标题下即输入框，label 行与 lead 句撤
// （义归 aria-label 与 scope 一句）；「选填／留空即莲友／存本机」三句并作输入框下一句；
// 新增三枚建议名章：不想费神起名的人点一枚即填好（不弹键盘），再点主钮即入——两点进房。
const NAME_POOL = ['慧明', '净安', '照心', '澄怀', '若水', '闻钟', '静远', '莲舟', '初心', '望岳', '拾阶', '归元'];
export function renderSitName(code, ui) {
  const { el } = ui;
  const rename = !!ui.rename;
  const ord = TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
  const verb = rename ? '记名' : '入座';
  const p = el(`<div class="panel pzAsk pzAskName center" role="dialog" aria-modal="true" aria-labelledby="pzNameTitle">
    <div class="askEyebrow">${rename ? '共修名号' : `共修室${ord}`}</div>
    <h2 id="pzNameTitle">${rename ? (savedName() ? '改名号' : '取个共修名号') : '留下共修名号'}</h2>
    <form class="body" id="pzNameForm" novalidate>
      <div class="nameField">
        <input id="pzName" class="bigIn" maxlength="24" autocomplete="nickname" enterkeyhint="go"
          spellcheck="false" aria-label="共修名号，选填" aria-describedby="pzNameNote pzNameScope" placeholder="如「慧明」，可留空">
        <div class="fieldMeta"><!-- 计数只在输入时浮现（focus-within 控 opacity，innerText 恒新以保回归断言） -->
          <span id="pzNameNote" aria-live="polite"></span>
          <span id="pzNameCount">0 / 12</span>
        </div>
      </div>
      <div class="nameChips" aria-label="名号建议">
        <button type="button" class="chip"></button><button type="button" class="chip"></button><button type="button" class="chip"></button>
        <button type="button" class="chipMore" aria-label="换一批建议名" title="换一批">↻</button>
      </div>
      <p class="scope" id="pzNameScope">${rename
        ? '功课与成佛记在此名下 · 显示在本室名单与共修动态 · 只存本机'
        : '将显示在本室名单与共修动态 · 只存本机 · 留空即「莲友」'}</p>
      <button class="gbtn primary big" id="pzNameSubmit" type="submit">
        <span id="pzNameGo">以「莲友」${verb}</span>
      </button>
      <button class="pzAskBack" id="pzNameBack" type="button">${rename ? '返回' : '返回大厅'}</button>
    </form></div>`);
  const input = p.querySelector('#pzName');
  const form = p.querySelector('#pzNameForm');
  const note = p.querySelector('#pzNameNote');
  const count = p.querySelector('#pzNameCount');
  const submit = p.querySelector('#pzNameSubmit');
  const go = p.querySelector('#pzNameGo');
  const back = p.querySelector('#pzNameBack');
  let submitting = false;
  const syncName = () => {
    const chars = Array.from(input.value);
    if (chars.length > 12) input.value = chars.slice(0, 12).join('');
    const value = Array.from(input.value);
    count.textContent = `${value.length} / 12`;
    const name = input.value.replace(/\s+/g, ' ').trim() || '莲友';
    go.textContent = `以「${name}」${verb}`;
    note.classList.remove('err');
    note.textContent = '';   // 「留空即莲友」已并入 scope 一句；此行只在出错时说话
  };
  input.addEventListener('input', syncName);
  // 建议名章：点即填好并同步主钮——不 focus 输入框（免手机弹键盘），看主钮变字即知已取
  const chips = [...p.querySelectorAll('.nameChips .chip')];
  let poolAt = Math.floor(Math.random() * NAME_POOL.length);
  const dealChips = () => { chips.forEach((c) => { c.textContent = NAME_POOL[poolAt % NAME_POOL.length]; poolAt++; }); };
  dealChips();
  p.querySelector('.chipMore').addEventListener('click', dealChips);
  p.querySelector('.nameChips').addEventListener('click', (event) => {
    const c = event.target.closest('.chip');
    if (!c || submitting) return;
    input.value = c.textContent || '';
    syncName();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    const name = Array.from(input.value.replace(/\s+/g, ' ').trim()).slice(0, 12).join('') || '莲友';
    saveName(name);
    submitting = true;
    form.setAttribute('aria-busy', 'true');
    input.disabled = true;
    submit.disabled = true;
    back.disabled = true;
    go.textContent = rename ? '正在记名…' : '正在入座…';
    let failed = false;
    try {
      await ui.onSit(code, name);
    } catch {
      failed = true;
      if (p.isConnected) {
        note.textContent = '暂时无法入座，请稍后再试';
        note.classList.add('err');
      }
    } finally {
      if (p.isConnected) {
        submitting = false;
        form.setAttribute('aria-busy', 'false');
        input.disabled = false;
        submit.disabled = false;
        back.disabled = false;
        if (failed) go.textContent = `以「${name}」${verb}`;
        else syncName();
      }
    }
  });
  back.addEventListener('click', () => { if (!submitting) ui.onBack(); });
  if (rename && savedName()) { input.value = savedName(); syncName(); }   // 改名先带出现名
  if (!matchMedia('(max-width:640px)').matches) setTimeout(() => input.focus(), 80);
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
/* 共修大厅是模式选择中心，不再作为窄弹窗：全屏承载三种去处、动态与选桌。
   2026-07-30 石青·晓（§七之十一）：社交面换敦煌石青浅底，泥金只作线与形；色一律走 --aq-* token。
   2026-08-11 美术批：底色向题屏莲池壁画（title-bg2）的石绿水色靠——顶上一抹石绿天光、
   侧点泥金、底下一汪水光，仍是纯 CSS 三层光晕，不叠图不加动画。 */
.overlay:has(.pzPanel){align-items:stretch;justify-content:stretch;background:rgba(8,8,18,.78)}
.overlay .pzPanel{width:100vw;max-width:none;height:100dvh;max-height:none;box-sizing:border-box;
  padding:0;border:0;border-radius:0;overflow:hidden;color:var(--aq-tx);background:
  radial-gradient(ellipse at 50% -8%,rgba(47,106,94,.13),transparent 46%),
  radial-gradient(circle at 84% 16%,rgba(176,131,28,.08),transparent 32%),
  radial-gradient(circle at 10% 90%,rgba(47,106,94,.09),transparent 38%),
  linear-gradient(166deg,#e2ebe8,#e7ede9 52%,#d5e2db);
  backdrop-filter:none;animation:pzIn var(--t-mid,.24s) var(--ease-out,ease-out)}
@keyframes pzIn{from{opacity:.4;transform:scale(1.01)}}
.pzPanel>.ovClose{top:calc(18px + env(safe-area-inset-top));right:calc(22px + env(safe-area-inset-right));
  border-color:var(--aq-line);background:rgba(255,255,255,.5);color:var(--aq-note)}
/* 浅面上的按钮与注脚：金洗底＋青墨字＋金深描边（.overlay .pzPanel 三类选择器压过全局 .overlay .gbtn） */
.overlay .pzPanel .gbtn{background:rgba(255,255,255,.55);border:1px solid var(--aq-line);color:var(--aq-tx)}
.overlay .pzPanel .gbtn.primary{background:var(--aq-goldwash);border:1px solid var(--aq-goldline);color:var(--aq-tx);font-weight:600}
.overlay .pzPanel .cNote{color:var(--aq-note)}
/* 加载态两形（2026-08-12 批）：默认九宫格骨架（与终局同形零跳变）；.err 才居中错误卡 */
.pzLoading.err{display:grid!important;place-items:center}
.pzLoadingInner{text-align:center;width:min(360px,84vw)}
.pzLoadingInner[hidden],.pzSkShell[hidden]{display:none}
.pzSkShell{align-content:start}
.pzSk{display:block;border:1px solid var(--aq-line);border-radius:14px;background:rgba(255,255,255,.5);animation:pzSk 1.2s ease-in-out infinite}
.pzSk.skT{min-height:44px;border-radius:12px}
.pzSk.skM{min-height:84px}
.pzSk.skC{min-height:108px}
.pzSk.skSide{display:none}
@keyframes pzSk{0%,100%{opacity:.4}50%{opacity:.85}}
@media (min-width:981px){
  .pzSkShell .pzSk.skT,.pzSkShell .pzSk.skM,.pzSkShell .pzGrid{grid-column:1}
  .pzSk.skSide{display:block;grid-column:2;grid-row:2/5;border-radius:16px}
}
@media (prefers-reduced-motion:reduce){.pzSk{animation:none;opacity:.55}}
.pzLoadingInner>span{color:var(--aq-note);font-size:var(--fs-xs,11px);letter-spacing:4px}
.pzLoadingInner h2{margin:6px 0 18px;color:var(--aq-title);font-size:28px;letter-spacing:7px;font-weight:500}
.pzLoadingInner .body{color:var(--aq-note)}.pzLoadingInner .gbtn{display:block;width:100%;margin-top:10px}
.pzShell{width:min(1180px,100%);height:100%;margin:auto;padding:calc(24px + env(safe-area-inset-top))
  max(24px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom))
  max(24px,env(safe-area-inset-left));box-sizing:border-box;display:grid;
  grid-template-rows:auto auto auto minmax(0,1fr);gap:16px}
/* 全屏页通用壳：与大厅同一张底、同一处 ✕、同一套留白。
   大厅有四段所以自带四行栅格；「我的」「共修动态」只需「一行页头 + 可滚主体」。 */
.fsShell{width:min(680px,100%);height:100%;margin:auto;padding:calc(24px + env(safe-area-inset-top))
  max(24px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom))
  max(24px,env(safe-area-inset-left));box-sizing:border-box;display:grid;
  grid-template-rows:auto minmax(0,1fr);gap:14px}
.fsBody{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:2px;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.pzMain,.pzRooms{touch-action:pan-y}
.fsWrap{width:100%;margin:0 auto}
/* 整页壳里的 .body 只借字号行距，不许自成滚动容器——「我的」页滑不动的病根：
   全局 .overlay .body 为旧抽屉写的 overflow-y:auto + overscroll-behavior:contain，
   套进 .fsBody 后成了一个「自己滚不动、又不放行给外层」的死容器，一指下滑整个被它吃掉。
   （大厅与共修动态的 .fsWrap 未挂 body 类，故独此一页中招。） */
.fsBody>.body{overflow:visible;overscroll-behavior:auto}
.pzTop{display:flex;align-items:center;justify-content:space-between;padding-right:58px}
.pzEyebrow{display:block;font-size:var(--fs-xs,11px);color:var(--aq-note);letter-spacing:4px;margin-bottom:3px}
/* 题字走楷金（与题屏 #bootName 同栈）：大厅、我的、共修动态、茶寮四页页头一体升格；
   题下一道泥金短线作签，静态装饰不吃动画预算。 */
.pzTop h2{margin:0;color:var(--aq-title);font-size:clamp(24px,3vw,36px);letter-spacing:7px;font-weight:600;
  font-family:"Kaiti SC","STKaiti","KaiTi","Songti SC",serif}
.pzTop h2::after{content:'';display:block;width:46px;height:2px;margin-top:7px;border-radius:1px;
  background:linear-gradient(90deg,var(--aq-gold),rgba(176,131,28,0))}
.pzPresence{display:flex;align-items:center;gap:12px;color:var(--aq-note);font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzPresence b{font-size:var(--fs-xl);color:var(--aq-strong);font-weight:500}
.pzPresence i{width:3px;height:3px;border-radius:50%;background:var(--aq-line)}
.pzTicker{width:100%;min-height:44px;display:flex;align-items:center;gap:16px;padding:0 16px;
  overflow:hidden;border:1px solid var(--aq-line);border-radius:12px;
  background:rgba(255,255,255,.55);color:var(--aq-tx);font:inherit;cursor:pointer;text-align:left;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55)}
.pzTicker:hover,.pzTicker:focus-visible{border-color:var(--aq-goldline);background:rgba(176,131,28,.07)}
/* 顶条主句：本站共修第几天·多少人来过·一共掷了多少轮 */
.pzTickerSay{flex:none;color:var(--aq-note);font-size:var(--fs-sm,12.5px);letter-spacing:1px;white-space:nowrap}
.pzTickerSay b{color:var(--aq-strong);font-weight:500;font-variant-numeric:tabular-nums}
.pzTickerSay.fresh{animation:pzNum .25s ease-out}
@keyframes pzNum{from{opacity:.35}}
.pzTickerViewport{min-width:0;flex:1;overflow:hidden;mask-image:linear-gradient(90deg,#000 92%,transparent)}
.pzTickerTrack{display:flex;min-width:0;white-space:nowrap}
.pzTickerSet{display:flex;align-items:center;min-width:0;gap:18px}
.pzTickerSet span{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzTickerSet i{font-style:normal;color:var(--aq-note);opacity:.8;font-size:var(--fs-xs,11px);margin-left:9px}
.pzTickerMore{flex:none;color:var(--aq-note);font-size:var(--fs-sm,12.5px);letter-spacing:1px;white-space:nowrap}
.pzTickerMore b{font-size:var(--fs-xl);font-weight:400;margin-left:4px}
/* 两卡并排（2026-08-11 重排）：与人共修（主）｜茶寮（手机入口）——
   「一人行谱」卡撤：单人是玩法不是共修去处，入口在题屏主钮；大厅只管人。
   桌面双栏时茶寮卡亦藏（右墙代之），与人共修独占一行成唯一主动作。 */
.pzModes{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pzMode{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;min-height:84px;
  padding:16px 18px;text-align:left;font:inherit;border-radius:14px;cursor:pointer;
  border:1px solid var(--aq-line);background:rgba(255,255,255,.6);color:var(--aq-tx);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5);
  transition:transform .18s,border-color .18s,background .18s}
.pzMode:hover,.pzMode:focus-visible{transform:translateY(-1px);border-color:var(--aq-goldline);background:rgba(176,131,28,.08)}
.pzMode.primary{border-color:var(--aq-goldline);background:
  radial-gradient(circle at 100% 0%,rgba(232,199,102,.22),transparent 44%),
  linear-gradient(110deg,rgba(176,131,28,.17),rgba(176,131,28,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55)}
.pzModeNo{width:40px;height:40px;display:grid;place-items:center;border:1px solid rgba(150,112,32,.4);
  border-radius:50%;color:var(--aq-gold);font-family:var(--f-display);font-size:var(--fs-xl)}
.pzModeNo .ico{width:21px;height:21px;vertical-align:0}  /* 圆章内的形：一人／三人／茶盏一眼分得开 */
.pzMode.primary .pzModeNo{border-color:var(--aq-goldline);background:rgba(176,131,28,.07)}
.pzMode span:nth-child(2){display:grid;gap:4px;min-width:0}
.pzMode b{color:var(--aq-title);font-size:var(--fs-lg,16px);letter-spacing:3px;font-weight:600}
.pzMode i{font-style:normal;color:var(--aq-note);font-size:var(--fs-sm,12.5px);letter-spacing:1px;text-wrap:balance}
.pzMode em{font-style:normal;color:var(--aq-strong);font-size:var(--fs-sm,12.5px);letter-spacing:2px}
.pzPanel.joining .pzMode,.pzPanel.joining .pzR{pointer-events:none;opacity:.56}
.pzPanel.joining #pzQuick{border-color:rgba(150,112,32,.7);opacity:1}
/* 右侧原有「今日共修／入座后／邀请说明」三块已撤：数字在功课榜里已有一份，
   入座说明在房内指引里已有一份，同一句话不在大厅再说一遍（§5.0b）。房间格因此拿到整幅宽度。 */
/* 房间少时不把空卡撑满整屏（旧式桌面在卡内底下留 ~78px 死区，一个撑大的空边框看着像出错）：
   房间卡按内容收，「回题屏」则 margin-top:auto 钉在壳底——退路本就该在页脚，
   否则它跟着短列表浮在半空、底下一大片空白。房间多时卡自行滚动，仍不溢出整壳。 */
.pzMain{display:flex;flex-direction:column;gap:12px;min-height:0}
.pzMain>.pzStill{margin-top:auto}   /* 静数字与「回题屏」一同钉页脚：退路与站史本就该在脚下 */
.pzRooms{min-height:0;flex:0 1 auto;display:flex;flex-direction:column;gap:8px;padding:12px;
  border:1px solid var(--aq-line);border-radius:16px;background:rgba(255,255,255,.44);overflow:auto;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
/* 九宫格桌卡（2026-08-12 用户点单）：3×3 恒定，一格一桌——圆章室号、在座名号、状态一列。
   卡底一弯「桌影」（radial 金洗）作桌的具象；行谱中转石绿并带呼吸边（一屏仍只此一种常驻动画）。 */
.pzGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.pzR{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  min-height:108px;padding:12px 8px 10px;cursor:pointer;text-align:center;font:inherit;
  border:1px solid var(--aq-line);border-radius:14px;color:var(--aq-tx);
  background:radial-gradient(ellipse 64% 26% at 50% 92%,rgba(176,131,28,.10),transparent 72%),rgba(255,255,255,.6);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5)}
.pzR:hover:not(:disabled),.pzR:focus-visible:not(:disabled){border-color:var(--aq-goldline);
  background:radial-gradient(ellipse 64% 26% at 50% 92%,rgba(176,131,28,.15),transparent 72%),rgba(255,255,255,.74)}
.pzR:disabled{opacity:.42;cursor:not-allowed}
/* 室号成章（2026-08-11 美术批）：九室皆单字，恰好容进一枚泥金描边的小圆章——
   章色随行相走：行谱中石绿、候莲友泥金、您在此金洗底。锁标挪到章角，不挤章内。 */
.pzR .ord{position:relative;width:30px;height:30px;display:grid;place-items:center;
  border:1px solid rgba(150,112,32,.42);border-radius:50%;background:rgba(255,255,255,.55);
  color:var(--aq-title);font-size:var(--fs-md,14px);
  font-family:"Kaiti SC","STKaiti","KaiTi","Songti SC",serif}
.pzR .ord em{position:absolute;right:-5px;bottom:-4px;font-style:normal;font-size:10px;line-height:1}
.pzR.s-playing .ord{border-color:rgba(47,106,94,.52);color:var(--aq-green)}
.pzR.s-waiting .ord{border-color:var(--aq-goldline);color:var(--aq-strong)}
.pzR.mine .ord{background:var(--aq-goldwash);border-color:var(--aq-goldline);color:var(--aq-strong)}
.pzR .who{min-width:0;max-width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;font-size:var(--fs-sm,12.5px);line-height:1.45;color:var(--aq-tx)}
.pzR .who i{font-style:normal;margin:0 3px}
.pzR .who .idle{color:#8a8271;letter-spacing:2px;margin:0}
.pzR .st{white-space:nowrap;color:var(--aq-note);font-size:var(--fs-xs,11px);letter-spacing:1px;min-height:1em}
.pzR .st b{margin-left:6px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--aq-tx)}
/* 空桌自沉一档：底更淡、章更浅——「虚位以待」不与有人的桌抢眼 */
.pzR.s-empty{background:radial-gradient(ellipse 64% 26% at 50% 92%,rgba(112,96,64,.05),transparent 72%),rgba(255,255,255,.4)}
.pzR.s-empty .ord{border-color:rgba(112,96,64,.3);background:rgba(255,255,255,.42);color:#8a8271}
.pzR.locked{border-style:dashed}.pzR.locked .st{color:var(--aq-strong)} /* 锁定语义已有 🔒＋虚线边双重表达 */
.pzR.mine{border-color:rgba(150,112,32,.8);
  background:radial-gradient(ellipse 64% 26% at 50% 92%,rgba(176,131,28,.16),transparent 72%),rgba(176,131,28,.1)}
.pzR.mine .st{color:var(--aq-strong)}
/* 行谱中的桌呼吸（2026-08-11）：边色 3.6s 极缓明暗，传达「这桌是活的」——
   一屏至多这一种常驻动画（动画预算），reduced-motion 全关。桌影随行相转石绿。 */
.pzR.s-playing{border-color:rgba(47,106,94,.45);
  background:radial-gradient(ellipse 64% 26% at 50% 92%,rgba(47,106,94,.12),transparent 72%),rgba(255,255,255,.6);
  animation:pzLive 3.6s ease-in-out infinite}
.pzR.s-playing .st{color:var(--aq-green)}
@keyframes pzLive{0%,100%{border-color:rgba(47,106,94,.28)}50%{border-color:rgba(47,106,94,.62)}}
.pzR.s-waiting{border-color:var(--aq-goldline)}.pzR.s-waiting .st{color:var(--aq-strong)}
/* 入座途中：点的那张桌原位亮着（joining 面板整体压暗，独此卡答「正入此室」） */
.pzPanel.joining .pzR.sitting{opacity:1;border-color:rgba(150,112,32,.8);background:rgba(176,131,28,.12)}
/* 「两位准备即可开局」是新来者未必猜得到的规矩，故留：从旧式 34px 的标题块（含自明的「十二室」小题）
   降为一行页脚小字——话还在，版面省下大半。 */
.pzRoomsNote{margin:2px 0 0;color:var(--aq-note);opacity:.8;font-size:var(--fs-xs,11px);letter-spacing:1px}
.pzSeatNote{color:var(--aq-note);font-size:var(--fs-sm,12.5px);text-align:center;letter-spacing:1px}
.pzSeatNote[hidden]{display:none}
.pzBack{width:100%;min-height:44px;border:1px solid var(--aq-line);border-radius:10px;background:none;
  color:var(--aq-note);font:inherit;font-size:var(--fs-sm,12.5px);letter-spacing:1px;cursor:pointer;padding:0 14px}
.pzBack:hover{color:var(--aq-title)}
/* 页脚静数字（2026-08-11 从顶条拆来）：站史与累计一天一动，沉底小字即可 */
.pzStill{color:var(--aq-note);opacity:.85;font-size:var(--fs-xs,11px);letter-spacing:1.5px;text-align:center;padding:2px 0}
.pzStill b{color:var(--aq-strong);font-weight:500;font-variant-numeric:tabular-nums}
/* 桌面右墙茶寮（2026-08-11 大厅即茶寮）：人进大厅就看见话在流——多人是氛围的载体。
   基础不渲染（手机茶寮走独立全屏页），宽桌面才立墙。 */
.pzSide{display:none}
@media (min-width:981px){
  .pzShell{grid-template-columns:minmax(0,1fr) 320px;grid-template-rows:auto auto auto minmax(0,1fr);column-gap:26px}
  .pzTop{grid-column:1/-1}
  .pzTicker,.pzModes,.pzMain{grid-column:1}
  .pzSide{grid-column:2;grid-row:2/5;display:flex;flex-direction:column;gap:9px;min-height:0;
    padding:14px 14px 12px;border:1px solid var(--aq-line);border-radius:16px;background:rgba(255,255,255,.42);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.55)}
  .pzSideHead{flex:none;color:var(--aq-title);font-size:var(--fs-md,14px);letter-spacing:3px}
  .pzSideFeed{flex:1;min-height:0;display:flex;flex-direction:column}
  .pzSideInput{flex:none}
  .pzModes{grid-template-columns:1fr}
  .pzModes .pzMode.chalou{display:none}   /* 右墙已是茶寮本体，入口卡不再重复（§5.0b 入口只出一次） */
}
/* 共修动态一行三段：名号 · 掷数 · 何时。没有名次列——不排名次就不给序号留位置。 */
.pzRankList{margin-top:14px;border-top:1px solid var(--aq-line)}
.pzRankRow{display:grid;grid-template-columns:minmax(72px,1fr) auto auto;align-items:center;gap:12px;min-height:48px;
  border-bottom:1px solid rgba(112,96,64,.14);font-size:var(--fs-sm,12.5px)}
.pzRankRow b{color:var(--aq-tx);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pzRankRow span{color:var(--aq-strong);white-space:nowrap}
.pzRankRow em{font-style:normal;color:var(--aq-note);font-size:var(--fs-xs,11px);white-space:nowrap;min-width:52px;text-align:right}
.pzRankRow.mine{background:rgba(176,131,28,.1)}
.pzRankRow.mine b{color:var(--aq-title)}
.pzRankRow i{font-style:normal;font-size:var(--fs-xs,11px);color:var(--aq-strong);letter-spacing:1px;margin-left:6px}
.pzRankEmpty{padding:38px 12px;text-align:center;color:var(--aq-note);letter-spacing:2px}
.pzRankNote{margin-top:12px;color:var(--aq-note);text-align:center;font-size:var(--fs-xs,11px)}
@media (prefers-reduced-motion:reduce){.pzMode{transition:none}.pzR.s-playing{animation:none}.pzTickerSay.fresh{animation:none}}
@media (max-width:820px){
  .pzShell{padding-left:16px;padding-right:16px;gap:12px}
}
@media (max-width:640px){
  .overlay .pzPanel{width:100vw;max-width:none;height:100dvh;max-height:none;border:0;border-radius:0;padding:0;animation:pzIn var(--t-fast,.18s) var(--ease-out,ease)}
  .pzPanel>.ovClose{top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right))}
  .pzShell{padding:calc(14px + env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom));gap:10px}
  .pzTop{padding-right:50px}.pzTop h2{font-size:24px;letter-spacing:5px}.pzShell .pzEyebrow,.myPanel .pzEyebrow{display:none}
  /* 窄屏只留主句与入口，最近几位收起——主句本身已把规模说清 */
  .pzTicker{min-height:40px;padding:0 11px;gap:9px}.pzTickerViewport{display:none}.pzTickerMore{font-size:var(--fs-xs)}
  .pzTickerSay{white-space:normal;line-height:1.45}
  /* 窄屏留形去字（§七之七）：三卡并排各约 113px，只留形＋题，副题与动作词收起 */
  .pzModes{gap:8px}.pzMode{grid-template-columns:auto minmax(0,1fr);gap:3px 8px;min-height:56px;padding:11px 10px;align-items:center}
  .pzMode .pzModeNo,.pzMode.primary .pzModeNo{width:22px;height:22px;border:0;background:none;align-self:center;margin-top:0}
  .pzModeNo .ico{width:19px;height:19px}
  .pzMode span:nth-child(2),.pzMode em{grid-column:2}
  .pzMode span:nth-child(2){gap:2px}.pzMode b{font-size:var(--fs-md);letter-spacing:2px}
  .pzMode i,.pzMode em{display:none}
  /* 窄屏整块主区一起滚（房间卡不自成内滚，免两层滚动互抢）；「回题屏」仍钉页脚 */
  .pzMain{overflow:auto;gap:10px}.pzRooms{flex:0 0 auto;padding:10px;overflow:visible}
  .pzGrid{gap:7px}
  .pzR{gap:5px;min-height:96px;padding:10px 6px 8px}
  .pzR .ord{width:27px;height:27px;font-size:var(--fs-sm,12.5px)}
  .pzR .who{font-size:var(--fs-xs,11px)}
  .fsShell{padding:calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));gap:10px}
  .pzRankRow{grid-template-columns:minmax(60px,1fr) auto auto;gap:8px}
}
@media (max-width:370px){.pzGrid{gap:6px}.pzR{min-height:88px;padding:9px 5px 7px}}
/* 问名／问密码卡：随社交面走石青（.panel 底为暗夜 --ck-*，此处整卡覆写） */
.pzAsk{background:var(--aq-panel);border-color:var(--aq-goldline);color:var(--aq-tx)}
.pzAsk h2{color:var(--aq-title)}
.pzAsk .gbtn{background:rgba(255,255,255,.55);border:1px solid var(--aq-line);color:var(--aq-tx)}
.pzAsk .gbtn.primary{background:var(--aq-goldwash);border:1px solid var(--aq-goldline);color:var(--aq-tx);font-weight:600}
.pzAsk .body{display:grid;gap:12px;text-align:center}
.pzAsk .lead{color:var(--aq-tx);font-size:var(--fs-md,14px);letter-spacing:2px}
.pzAsk .bigIn{width:100%;box-sizing:border-box;background:rgba(255,255,255,.7);
  border:1px solid var(--aq-goldline);border-radius:12px;color:var(--aq-tx);font-family:inherit;
  padding:15px 12px;font-size:22px;letter-spacing:6px;text-indent:6px;text-align:center;outline:none;
  transition:border-color .2s,box-shadow .2s}
.pzAsk .bigIn.num{font-size:28px;letter-spacing:16px;text-indent:16px}
.pzAsk .bigIn::placeholder{color:#9a917d;letter-spacing:6px}
.pzAsk .bigIn:focus{border-color:rgba(150,112,32,.7);box-shadow:0 0 0 3px rgba(176,131,28,.12)}
.pzAsk .hint{font-size:var(--fs-xs,11px);color:var(--aq-note);letter-spacing:1px;min-height:15px}
.pzAsk .hint.err{color:var(--aq-woe)}
.pzAsk .gbtn.big{width:100%;padding:13px 0;font-size:var(--fs-md,14px);letter-spacing:3px}
.pzAsk .gbtn.ghost{width:100%;background:none;border-color:var(--aq-line);color:var(--aq-note)}
.pzAskName{width:min(420px,92vw);padding:23px 22px 18px!important}
.pzAskName .askEyebrow{margin:0 46px 8px 0;color:var(--aq-note);font-size:var(--fs-xs,11px);letter-spacing:2px}
.pzAskName h2{margin:0 46px 5px 0;font-size:clamp(22px,4.6vw,28px);letter-spacing:3px}
.pzAskName .body{gap:14px;text-align:left}
.pzAskName .nameField{display:grid;gap:7px}
/* 建议名章（2026-08-12 极简重做）：三枚泥金小章＋一枚 ↻ 换批——两点进房的那条近路 */
.pzAskName .nameChips{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.pzAskName .chip{min-height:34px;padding:5px 13px;border:1px solid var(--aq-goldline);border-radius:17px;
  background:rgba(255,255,255,.5);color:var(--aq-tx);font:inherit;font-size:var(--fs-sm,12.5px);letter-spacing:2px;cursor:pointer}
.pzAskName .chip:hover,.pzAskName .chip:focus-visible{background:var(--aq-goldwash)}
.pzAskName .chipMore{width:34px;height:34px;flex:none;border:1px solid var(--aq-line);border-radius:50%;
  background:none;color:var(--aq-note);font:inherit;font-size:var(--fs-md,14px);cursor:pointer}
.pzAskName .chipMore:hover,.pzAskName .chipMore:focus-visible{border-color:var(--aq-goldline);color:var(--aq-strong)}
.pzAskName .bigIn{min-height:52px;padding:13px 14px;font-size:var(--fs-xl);letter-spacing:1.5px;text-indent:0;text-align:left}
.pzAskName .bigIn::placeholder{letter-spacing:1px}
.pzAskName .fieldMeta{display:flex;justify-content:space-between;gap:12px;min-height:17px;color:var(--aq-note);font-size:var(--fs-xs,11px);letter-spacing:.5px}
.pzAskName .fieldMeta span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums;
  opacity:0;transition:opacity var(--t-fast,.18s)}   /* 计数平时不占眼，动笔才浮现 */
.pzAskName .nameField:focus-within .fieldMeta span:last-child{opacity:.9}
.pzAskName .fieldMeta .err{color:var(--aq-woe)}
.pzAskName .scope{margin:0;padding:9px 0;border-top:1px solid var(--aq-line);border-bottom:1px solid var(--aq-line);
  color:var(--aq-note);font-size:var(--fs-xs,11px);line-height:1.65;letter-spacing:.5px}
.pzAskName .gbtn.big{min-height:50px;margin-top:1px}
.pzAskName .pzAskBack{min-height:44px;border:0;background:none;color:var(--aq-note);font-family:inherit;font-size:var(--fs-sm,12.5px);letter-spacing:2px;cursor:pointer}
.pzAskName .pzAskBack:hover{color:var(--aq-title)}
.pzAskName .pzAskBack:focus-visible{outline:2px solid rgba(150,112,32,.72);outline-offset:2px;border-radius:9px}
.pzAskName button:disabled,.pzAskName input:disabled{cursor:wait;opacity:.62}
@media(max-width:640px){
  .pzAskName{width:min(92vw,420px);padding:21px 18px 16px!important}
  .pzAskName h2{font-size:24px}
}
/* 莲友茶寮样式已随 2026-08-11 脱钩改版迁至 chalou.js（CHALOU_CSS）——一行一言极简皮，此处不再持有 .cl* */
`;

/* 同修成佛横幅：不弹窗不打断 */
export const PEER_WIN_CSS = `
#peerWin,#matchBegin{position:fixed;left:50%;top:12%;transform:translate(-50%,-14px);z-index:52;pointer-events:none;
  opacity:0;transition:opacity var(--t-slow,.36s) var(--ease-out,ease),transform var(--t-slow,.36s) var(--ease-out,ease);white-space:nowrap;
  background:linear-gradient(90deg,rgba(232,199,102,0),rgba(232,199,102,.22),rgba(232,199,102,0));
  border-top:1px solid rgba(232,199,102,.45);border-bottom:1px solid rgba(232,199,102,.45);
  padding:9px 30px;color:#f4e6b8;letter-spacing:2px;font-size:var(--fs-md,14px)}
#peerWin.show,#matchBegin.show{opacity:1;transform:translate(-50%,0)}
/* v393 敦煌联珠纹边带（壁画光第二期）：仪式横幅上下各一行金珠，语式取自经变画装饰边带 */
#peerWin::before,#matchBegin::before,#peerWin::after,#matchBegin::after{content:'';position:absolute;left:9%;right:9%;height:5px;
  background-image:radial-gradient(circle at 4.5px 2.5px, rgba(232,199,102,.58) 1.3px, rgba(232,199,102,0) 1.9px);
  background-size:9px 5px;background-repeat:repeat-x}
#peerWin::before,#matchBegin::before{top:-9px}
#peerWin::after,#matchBegin::after{bottom:-9px}
#peerWin b,#matchBegin b{color:var(--gold-hi);font-weight:600;margin-right:6px}
#peerWin i,#matchBegin i{font-style:normal;color:var(--teal);margin-left:12px;font-size:var(--fs-sm,12.5px)}
/* #matchBegin＝共同开局金横幅（2026-08-12 批）：与同修成佛横幅同形制——开局是全局最有仪式感的一刻，
   从一条 toast 升格为金字幕＋磬；字距放大一档以示庄重 */
#matchBegin b{letter-spacing:6px;font-size:var(--fs-lg,16px)}
`;
