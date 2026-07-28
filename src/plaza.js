// 共修大厅 · 前端
// 职责：广场数据取用（掷轮攒批上报／每日功课榜）＋ 大厅面板渲染（12 室·动态广播）
// 规则判定与谱义一律不在此处；本模块只做展示与上报。
// 名字口径：进大厅／看广播／一人行谱皆不问名；真人入座才问，功课榜沿用该名或稳定匿名莲号。

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

// 改名后即便无待送掷数，也发一次空报让榜上那一行换名（服务端只认 actor，不改计数）
export async function pushName() {
  try {
    await fetch('/api/plaza/tick', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 0, actor: practiceId(), name: practiceName() }),
    });
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

// 一人行谱的及第：带莲号上报，才记得到本人名下（共修室的由本室服务器出具）
export async function record(run) {
  try {
    const r = await fetch('/api/plaza/record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...run, actor: practiceId() }),
    });
    return r.ok;
  } catch (e) { return false; }
}

// 我的功课：累计·及第·共修天数·连续日·逐日（月历）·逐局记录
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

// 房间格只建一次空壳，此后就地补写——整段 innerHTML 重绘会吞掉键盘焦点与正在进行的点击。
function tableShell(t, esc) {
  return `<button class="pzT" data-code="${esc(t.code)}">
    <span class="ord"></span><span class="dots"></span><span class="st"></span><span class="who"></span></button>`;
}

// 只在内容真的变了才写 DOM：dataset.raw 记的是转换前的原文，
// 免得简繁转换（zhDom）把已转好的字又被这里的简体原文覆盖回去、每八秒闪一次。
function setCell(host, selector, html) {
  const node = host.querySelector(selector);
  if (!node || node.dataset.raw === html) return;
  node.dataset.raw = html;
  node.innerHTML = html;
}

function paintTable(button, t, esc, here) {
  const who = t.seats.filter(s => s.online).map(s =>
    `<i style="color:${esc(s.color || '#dccf9f')}">${esc(s.name)}</i>`).join(' ');
  // 上锁的室照样列出（藏起来反而让人纳闷"为什么这桌空着没人坐"），点了再问密码
  const mine = t.code === here;
  const full = t.state === 'full' && !mine;
  const label = mine ? '您在此' : (t.locked ? '凭密码入座' : (STATE_TEXT[t.state] || ''));
  const className = `pzT s-${t.state}${t.locked ? ' locked' : ''}${mine ? ' mine' : ''}`;
  if (button.className !== className) button.className = className;
  button.disabled = full;
  // 读屏仍报全状态；眼睛看到的则按「有人才说话」减负
  button.setAttribute('aria-label',
    `共修室${TABLE_ORD[t.no - 1]}，${label}，${t.live}/${t.max}位在线`);
  setCell(button, '.ord', `${TABLE_ORD[t.no - 1]}${t.locked ? '<em>🔒</em>' : ''}`);
  // 空室不画四个空圈、也不写「空室」——十二格里常有十格是空的，两套记号说同一件「没人」，
  // 反把「哪里有人」淹没了。空室只留一个淡序号，人一坐进来才长出点阵与名号。
  const quiet = t.live === 0 && !t.locked && !mine;
  setCell(button, '.dots', quiet ? ''
    : Array.from({ length: t.max }, (_, i) => (i < t.live ? '●' : '○')).join(''));
  setCell(button, '.st', quiet ? '' : (mine ? '您在此' : (t.locked ? '凭密码' : (STATE_TEXT[t.state] || ''))));
  setCell(button, '.who', quiet ? '' : (who || '&nbsp;'));
}

// 哪一行是「我」：服务端不外发匿名莲号，故按本机上报的那个名号比对；
// 重名时服务端会缀上「 · 尾号」，一并认。
function isMine(name) {
  const mine = practiceName();
  return name === mine || String(name).startsWith(`${mine} · `);
}

// 共修动态：一人一行，按最近用功时刻倒序。**不列名次**——
// 念佛记录上不该比高下，时间先后本身就是次序。
function streamRows(rows, esc) {
  if (!rows.length) return '<div class="pzRankEmpty">此刻还没有莲友在行谱</div>';
  return rows.map(row => `<div class="pzRankRow${isMine(row.name) ? ' mine' : ''}">
    <b>${esc(row.name)}</b>${isMine(row.name) ? '<i>您</i>' : ''}
    <span>${num(row.tosses)} 掷${row.wins ? ` · 及第 ${num(row.wins)}` : ''}</span>
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

// 顶条一句叙述：本站共修多久、多少人来过、一共掷了多少轮——共修的规模一眼可知。
function sayHtml(data) {
  return `本站共修第 <b>${num(data.days || 1)}</b> 天 · 已参加 <b>${num(data.people || 0)}</b> 人 · 累计掷轮 <b>${num(data.tosses || 0)}</b>`;
}
// 顶条第二行：最近在用功的几位莲友。与「共修动态」同一份数据，不另起一套。
function tickerHtml(data, esc) {
  const rows = (data.stream || []).slice(0, 3);
  if (!rows.length) return '<span class="pzTickerSet"><span>此刻还没有莲友在行谱——您可以是第一位</span></span>';
  return `<span class="pzTickerSet">${rows.map(r =>
    `<span>${esc(r.name)}<i>${when(r.at)}</i></span>`).join('')}</span>`;
}

// 只补写会变化的桌况与数字，不销毁大厅本身；保住滚动、焦点和已打开的功课榜。
export function updatePlaza(p, data, ui) {
  p._plazaData = data;
  p._plazaUi = ui || p._plazaUi;
  const activeUi = p._plazaUi;
  const tables = data.tables || [];
  const grid = p.querySelector('.pzGrid');
  const codes = tables.map(t => t.code).join(',');
  if (grid.dataset.codes !== codes) {        // 只有房间集合本身变了（换厅）才重建空壳
    grid.dataset.codes = codes;
    grid.innerHTML = tables.map(t => tableShell(t, activeUi.esc)).join('');
  }
  const cells = grid.querySelectorAll('.pzT');
  tables.forEach((t, i) => { if (cells[i]) paintTable(cells[i], t, activeUi.esc, activeUi.seatedAt); });
  p.querySelector('.pzOnline').textContent = num(data.online);
  p.querySelector('.pzPlaying').textContent = num(data.playingTables);
  // 跑马灯只在动态条目本身变了才重写：每次重写都会把 34 秒的滚动动画打回起点，
  // 八秒一刷则后面的条目永远滚不出来。比对用条目身份（时刻＋正文），
  // 不用渲染结果——「几分钟前」每分钟都在变，拿它比对等于白比。
  p.querySelector('.pzTickerSay').innerHTML = sayHtml(data);
  const track = p.querySelector('.pzTickerTrack');
  const key = (data.stream || []).slice(0, 3).map(r => `${r.at}:${r.name}`).join('|');
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
        <div class="pzPresence" aria-live="polite">
          <span><b class="pzOnline">0</b> 位在座</span><i></i>
          <span><b class="pzPlaying">0</b> 桌行谱中</span>
        </div>
      </header>

      <button class="pzTicker" id="pzRank" type="button" aria-haspopup="dialog">
        <span class="pzTickerSay"></span>
        <span class="pzTickerViewport"><span class="pzTickerTrack"></span></span>
        <span class="pzTickerMore">共修动态 <b>›</b></span>
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
          <div class="pzSectionHead"><h3>十二室</h3>
            <p>自行选室 · 两位准备即可开局</p></div>
          <div class="pzGrid"></div>
        </section>
        <div class="pzSeatNote" hidden></div>
        <button class="pzBack" id="pzClose" type="button">${ui.backText || '返回'}</button>
      </main>
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
    const open = tables.filter(t => t.state !== 'full' && !t.locked);
    if (!open.length) return ui.onQuick(null);
    // 「随喜入座」是要立刻开始共修，不是要旁观：先取还在候莲友的室（其中人最多者最快凑齐），
    // 全都在行谱中才退而求其次——否则人越多的室越可能正打到一半，点进去只能干等一整局。
    const rank = (t) => (t.state === 'waiting' ? 0 : (t.state === 'empty' ? 1 : 2));
    const best = open.slice().sort((a, b) => rank(a) - rank(b) || b.live - a.live)[0];
    ui.onQuick(best.code);
  });
  p.querySelector('#pzRank').addEventListener('click', () => ui.onStream());
  p.querySelector('#pzClose').addEventListener('click', () => ui.onClose());
  updatePlaza(p, data, ui);
  return p;
}

// 入座前问名（只在没有存名时出现一次；留空即「莲友」，此后自动带上）
// 一张卡两用：入座前留名号，或单从功课榜来改名号（ui.rename）
export function renderSitName(code, ui) {
  const { el } = ui;
  const rename = !!ui.rename;
  const ord = TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
  const verb = rename ? '记名' : '入座';
  const p = el(`<div class="panel pzAsk pzAskName center" role="dialog" aria-modal="true" aria-labelledby="pzNameTitle">
    <div class="askEyebrow">${rename ? '念佛功课榜 · 记名' : `共修室${ord} · 入座前一步`}</div>
    <h2 id="pzNameTitle">${rename ? (savedName() ? '改名号' : '取个共修名号') : '留下共修名号'}</h2>
    <form class="body" id="pzNameForm" novalidate>
      <p class="lead">${rename ? '功课与及第都记在这个名下' : '方便同座莲友认得您'}</p>
      <div class="nameField">
        <label for="pzName">名号 <span>选填</span></label>
        <input id="pzName" class="bigIn" maxlength="24" autocomplete="nickname" enterkeyhint="go"
          spellcheck="false" aria-describedby="pzNameNote pzNameScope" placeholder="例如：慧明">
        <div class="fieldMeta">
          <span id="pzNameNote">留空则显示「莲友」</span>
          <span id="pzNameCount">0 / 12</span>
        </div>
      </div>
      <p class="scope" id="pzNameScope">将显示在本室名单与念佛功课榜，并保存在本机。</p>
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
    note.textContent = '留空则显示「莲友」';
  };
  input.addEventListener('input', syncName);
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
/* 全屏页通用壳：与大厅同一张底、同一处 ✕、同一套留白。
   大厅有四段所以自带四行栅格；「我的」「共修动态」只需「一行页头 + 可滚主体」。 */
.fsShell{width:min(1180px,100%);height:100%;margin:auto;padding:calc(24px + env(safe-area-inset-top))
  max(24px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom))
  max(24px,env(safe-area-inset-left));box-sizing:border-box;display:grid;
  grid-template-rows:auto minmax(0,1fr);gap:14px}
.fsBody{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:2px}
.fsWrap{width:min(560px,100%);margin:0 auto}
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
/* 顶条主句：本站共修第几天·多少人来过·一共掷了多少轮 */
.pzTickerSay{flex:none;color:#a99c79;font-size:var(--fs-sm,12.5px);letter-spacing:1px;white-space:nowrap}
.pzTickerSay b{color:#e8c766;font-weight:500}
.pzTickerViewport{min-width:0;flex:1;overflow:hidden;mask-image:linear-gradient(90deg,#000 92%,transparent)}
.pzTickerTrack{display:flex;min-width:0;white-space:nowrap}
.pzTickerSet{display:flex;align-items:center;min-width:0}
.pzTickerSet span{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzTickerSet i{font-style:normal;color:#746d5d;font-size:var(--fs-xs,11px);margin-left:9px}
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
.pzPanel.joining .pzMode,.pzPanel.joining .pzT{pointer-events:none;opacity:.56}
.pzPanel.joining #pzQuick{border-color:rgba(232,199,102,.7);opacity:1}
/* 右侧原有「今日共修／入座后／邀请说明」三块已撤：数字在功课榜里已有一份，
   入座说明在房内指引里已有一份，同一句话不在大厅再说一遍（§5.0b）。房间格因此拿到整幅宽度。 */
.pzMain{display:grid;grid-template-rows:minmax(0,1fr) auto auto;gap:12px;min-height:0}
.pzRooms{min-height:0;display:flex;flex-direction:column;padding:18px;border:1px solid rgba(216,197,139,.13);
  border-radius:16px;background:rgba(255,255,255,.018);overflow:auto}
.pzSectionHead{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:14px}
.pzSectionHead h3{margin:0;color:#d9ccaa;font-size:var(--fs-lg,16px);font-weight:500;letter-spacing:4px}
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
.pzT .dots:empty,.pzT .st:empty,.pzT .who:empty{display:none}
/* 空室退到背景里：一个淡序号即可，视线自然落在有人的那几间 */
.pzT.s-empty{justify-content:center;align-items:center;border-color:rgba(216,197,139,.09);background:rgba(255,255,255,.012)}
.pzT.s-empty .ord{color:#6d6754;font-size:var(--fs-lg,16px)}
.pzT.s-empty:hover:not(:disabled),.pzT.s-empty:focus-visible:not(:disabled){border-color:rgba(232,199,102,.4);background:rgba(232,199,102,.05)}
.pzT .ord em{font-style:normal;font-size:9px;margin-left:3px}
.pzT.locked{border-style:dashed}.pzT.locked .st{color:#b9a7e0}
.pzT.mine{border-color:rgba(232,199,102,.86);background:rgba(232,199,102,.12)}.pzT.mine .st{color:#e8c766}
.pzT.s-playing{border-color:rgba(150,225,214,.38)}.pzT.s-playing .st{color:#96e1d6}
.pzT.s-waiting{border-color:rgba(232,199,102,.48)}.pzT.s-waiting .st{color:#e8c766}
.pzSeatNote{color:#a99c79;font-size:var(--fs-sm,12.5px);text-align:center;letter-spacing:1px}
.pzSeatNote[hidden]{display:none}
.pzBack{width:100%;min-height:44px;border:1px solid rgba(216,197,139,.16);border-radius:10px;background:none;
  color:#c8b988;font:inherit;font-size:var(--fs-sm,12.5px);letter-spacing:1px;cursor:pointer;padding:0 14px}
.pzBack:hover{color:#f0dfa8}
/* 共修动态一行三段：名号 · 掷数 · 何时。没有名次列——不排名次就不给序号留位置。 */
.pzRankList{margin-top:14px;border-top:1px solid rgba(216,197,139,.14)}
.pzRankRow{display:grid;grid-template-columns:minmax(72px,1fr) auto auto;align-items:center;gap:12px;min-height:48px;
  border-bottom:1px solid rgba(216,197,139,.09);font-size:var(--fs-sm,12.5px)}
.pzRankRow b{color:#dcd0ad;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pzRankRow span{color:#e8c766;white-space:nowrap}
.pzRankRow em{font-style:normal;color:#6e685a;font-size:var(--fs-xs,11px);white-space:nowrap;min-width:52px;text-align:right}
.pzRankRow.mine{background:rgba(232,199,102,.07)}
.pzRankRow.mine b{color:#f0dfa8}
.pzRankRow i{font-style:normal;font-size:var(--fs-xs,11px);color:#e8c766;letter-spacing:1px;margin-left:6px}
.pzRankEmpty{padding:38px 12px;text-align:center;color:#77705f;letter-spacing:2px}
.pzRankNote{margin-top:12px;color:#6e685a;text-align:center;font-size:var(--fs-xs,11px)}
@media (prefers-reduced-motion:reduce){.pzMode{transition:none}}
@media (max-width:820px){
  .pzShell{padding-left:16px;padding-right:16px;gap:12px}
  .pzGrid{grid-template-columns:repeat(4,minmax(92px,1fr))}
}
@media (max-width:640px){
  .overlay .pzPanel{width:100vw;max-width:none;height:100dvh;max-height:none;border:0;border-radius:0;padding:0;animation:pzIn .2s ease}
  .pzPanel>.ovClose{top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right))}
  .pzShell{padding:calc(14px + env(safe-area-inset-top)) 12px calc(14px + env(safe-area-inset-bottom));gap:10px}
  .pzTop{padding-right:50px}.pzTop h2{font-size:24px;letter-spacing:5px}.pzEyebrow{display:none}
  .pzPresence{gap:7px;font-size:11px}.pzPresence b{font-size:14px}
  /* 窄屏只留主句与入口，最近几位收起——主句本身已把规模说清 */
  .pzTicker{min-height:40px;padding:0 11px;gap:9px}.pzTickerViewport{display:none}.pzTickerMore{font-size:11px}
  .pzTickerSay{white-space:normal;line-height:1.45}
  .pzModes{gap:8px}.pzMode{grid-template-columns:1fr;gap:4px;min-height:78px;padding:11px 12px}
  .pzModeNo{display:none}.pzMode span:nth-child(2){gap:2px}.pzMode b{font-size:14px;letter-spacing:2px}
  .pzMode i{font-size:10.5px;line-height:1.35}.pzMode em{font-size:11px;margin-top:4px}
  .pzMain{display:block;overflow:auto}.pzRooms{padding:12px;overflow:visible}.pzBack{margin-top:10px}
  .pzSectionHead{align-items:flex-start;margin-bottom:10px}.pzSectionHead p{max-width:160px;text-align:right;line-height:1.5}
  .pzGrid{grid-template-columns:repeat(3,1fr);gap:7px}.pzT{min-height:78px;padding:10px 9px}.pzT .who{font-size:10px}
  .fsShell{padding:calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));gap:10px}
  .pzRankRow{grid-template-columns:minmax(60px,1fr) auto auto;gap:8px}
}
@media (max-width:370px){.pzGrid{grid-template-columns:repeat(2,1fr)}.pzSectionHead p{display:none}}
/* 问名／问密码卡 */
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
.pzAskName{width:min(420px,92vw);padding:23px 22px 18px!important}
.pzAskName .askEyebrow{margin:0 46px 8px 0;color:#a99560;font-size:var(--fs-xs,11px);letter-spacing:2px}
.pzAskName h2{margin:0 46px 5px 0;font-size:clamp(22px,4.6vw,28px);letter-spacing:3px}
.pzAskName .body{gap:14px;text-align:left}
.pzAskName .lead{margin:0 0 2px;color:#c7bd9d;font-size:var(--fs-sm,12.5px);letter-spacing:1px}
.pzAskName .nameField{display:grid;gap:7px}
.pzAskName label{display:flex;align-items:baseline;gap:8px;color:#f0dfaa;font-size:var(--fs-md,14px);letter-spacing:2px}
.pzAskName label span{color:#8e856e;font-size:var(--fs-xs,11px);letter-spacing:1px}
.pzAskName .bigIn{min-height:52px;padding:13px 14px;font-size:18px;letter-spacing:1.5px;text-indent:0;text-align:left}
.pzAskName .bigIn::placeholder{letter-spacing:1px}
.pzAskName .fieldMeta{display:flex;justify-content:space-between;gap:12px;min-height:17px;color:#92886d;font-size:var(--fs-xs,11px);letter-spacing:.5px}
.pzAskName .fieldMeta span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
.pzAskName .fieldMeta .err{color:#d98873}
.pzAskName .scope{margin:0;padding:11px 0;border-top:1px solid rgba(216,197,139,.13);border-bottom:1px solid rgba(216,197,139,.13);
  color:#a69c7d;font-size:var(--fs-xs,11px);line-height:1.65;letter-spacing:.5px}
.pzAskName .gbtn.big{min-height:50px;margin-top:1px}
.pzAskName .pzAskBack{min-height:44px;border:0;background:none;color:#a69c7d;font-family:inherit;font-size:var(--fs-sm,12.5px);letter-spacing:2px;cursor:pointer}
.pzAskName .pzAskBack:hover{color:#e6d8aa}
.pzAskName .pzAskBack:focus-visible{outline:2px solid rgba(232,199,102,.72);outline-offset:2px;border-radius:9px}
.pzAskName button:disabled,.pzAskName input:disabled{cursor:wait;opacity:.62}
@media(max-width:640px){
  .pzAskName{width:min(92vw,420px);padding:21px 18px 16px!important}
  .pzAskName h2{font-size:24px}
}
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
