// 选佛谱联机后端 · Cloudflare Worker + Durable Object
// 职责：共修室（每室至多 4 人）实时联机（WebSocket）+ 在线聊天 + 断线重连 + 密码邀熟人
// 各人自由掷、互不阻塞（无轮次制：陌生人同座时一人挂机不该卡死全桌）。
// 规则判定全部在客户端依原谱数据进行；服务端只做名单、锁、转发与留存，不改动任何谱义。

const ROOM_MAX = 4;                 // 原谱多人局：至多四位同修
const CHAT_KEEP = 120;              // 聊天留存条数（重连可回看）
const PLAYER_COLORS = ['#e8c766', '#96e1d6', '#d98873', '#b9a7e0']; // 金·青·赭·藕——四位同修珠色
// 座次即方位（合本作四洲罗盘，亦合「东家」之俗）：东位者即房主，可设本室密码。
// 东位空出后，下一位坐进东位者继承房主之位——规则只此一条，不另记谁先来。
const SEAT_DIR = ['东', '南', '西', '北'];
const ASK_INTERNAL_URL = 'https://ask.internal/v1/ask';

// ---- 共修广场：固定 12 张共修室（复刻棋牌大厅：桌数固定、座数固定、坐下即行） ----
const PLAZA_OBJECT = '__xuanfopu_plaza__';
const TABLE_COUNT = 12;
const TABLE_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const FEED_KEEP = 60;   // 公报流留存条数
const RUN_KEEP = 500;   // 及第录留存条数（超出按时间裁旧）
// 桌位快照保鲜期：桌 DO 若因驱逐/发版等原因没能报「已离席」，快照会挂着假在座者。
// 超期即视为失效并清掉；在座者只要还在掷轮就会续报，不会被误清。
const TABLE_TTL = 20 * 60 * 1000;
const REPORT_REFRESH = 5 * 60 * 1000; // 行棋时若距上次上报超过此值就续报一次，保住新鲜度
// 桌号 H{厅}T{桌}（如 H1T12）：厅满自动开下一厅，桌数每厅固定 12——
// 与旧的 4 位纯数字房号天然不撞，沿用现有 /api/room/:code/ws 路由，无需改路由正则。
const tableCode = (hall, no) => `H${hall}T${no}`;
const TABLE_RE = /^H([1-9]\d{0,2})T([1-9]|1[0-2])$/;
const isTableCode = (code) => TABLE_RE.test(String(code || '').toUpperCase());
function tableSeatOf(code) {
  const m = TABLE_RE.exec(String(code || '').toUpperCase());
  return m ? { hall: Number(m[1]), no: Number(m[2]) } : null;
}
const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10); // UTC 日界，与展示口径一致

// ---- 密码：共修室可由东位者（房主）设四位数密码，邀熟人同座（取代原「私室」） ----
// 密码由用户自设四位数字：一万种组合配「错满十次封室」，猜中概率千分之一，够用；
// 系统代设反而让人记不住、也没法口头报给莲友。
const LOCK_MAX_TRIES = 10;      // 密码错满即封室，防暴力猜
const LOCK_MAX_PER_HALL = 4;    // 一厅至多四室设密码（12 之三分一），余下永远对陌生人敞开
// 座位回收：不设闹钟，只在有人求座、真要谢客之前懒清一次
const DONE_HOLD = 10 * 60 * 1000;     // 及第后留座十分钟：够您看完判词、决定再来一局还是离席
const OFFLINE_GRACE = 90 * 1000;      // 断线保座九十秒：够走完一次重连退避

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function proxyAsk(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'content type must be application/json' }, 415);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid json' }, 400); }
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 2000) return json({ error: 'question must be 1-2000 characters' }, 400);

  // 不向问义服务传原始 IP；以哈希后的浏览器网络指纹执行服务端日限额。
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = (request.headers.get('User-Agent') || 'unknown').slice(0, 240);
  const clientKey = await sha256(`${ip}\n${ua}`);
  const upstream = await env.ASK_SERVICE.fetch(new Request(ASK_INTERNAL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ask-client': clientKey,
      'user-agent': 'xuanfopu-sumeru/1.0',
    },
    body: JSON.stringify({ ...body, question }),
    signal: request.signal,
  }));

  const headers = new Headers(upstream.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-ask-proxy', 'service-binding');
  headers.delete('access-control-allow-origin');
  headers.delete('vary');
  return new Response(upstream.body, { status: upstream.status, headers });
}

// 广场 DO：沿用 RoomDO 类（已是 SQLite class，无需新 migration），以固定对象名汇总全站
function plazaStub(env) { return env.ROOM.get(env.ROOM.idFromName(PLAZA_OBJECT)); }

function plazaForward(request, env, path, search = '') {
  const target = new URL(`https://plaza.internal${path}`);
  target.search = search;
  return plazaStub(env).fetch(new Request(target, request));
}

// 桌态：空室／候莲友（有人未起行）／行谱中／满座
function tableState(seats) {
  const live = seats.filter(s => s.online).length;
  if (live >= ROOM_MAX) return 'full';
  if (live === 0) return 'empty';
  return seats.some(s => s.online && s.n > 0) ? 'playing' : 'waiting';
}

// 桌位快照由各桌 DO 在座次变动时推送到广场 DO（参 Colyseus LobbyRoom 的 push 模型）：
// 看广场＝1 次 DO 请求，而非并发探 12 桌——看广场远比座位变动频繁，推送省得多。
function plazaTables(hall, snaps) {
  return Array.from({ length: TABLE_COUNT }, (_, i) => {
    const no = i + 1;
    const snap = snaps[no] || {};
    const seats = snap.seats || [];
    return {
      hall, no, code: tableCode(hall, no), ord: TABLE_ORD[i],
      seats, live: seats.filter(s => s.online).length, max: ROOM_MAX,
      state: tableState(seats), locked: !!snap.locked,
    };
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- 问义 API：同域入口 → Cloudflare Service Binding → 经据智能体 ----
    if (path === '/api/ask') return proxyAsk(request, env);

    // ---- 共修广场 ----
    if (path === '/api/plaza') {
      // 一次取齐（单次 DO 请求）：掷轮数／及第录／公报流／各厅桌位快照
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const statRes = await plazaForward(request, env, '/plaza/stat', url.search);
      const stat = await statRes.json();
      const hall = Math.max(1, Math.floor(Number(url.searchParams.get('hall')) || 0) || stat.hall);
      const tables = plazaTables(hall, (stat.snaps || {})[hall] || {});
      delete stat.snaps;
      return json({
        ...stat,
        hall, tables,
        online: tables.reduce((sum, t) => sum + t.live, 0),
        playingTables: tables.filter(t => t.state === 'playing').length,
      });
    }
    if (path === '/api/plaza/tick') {   // 掷轮计数：客户端攒批上报
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      return plazaForward(request, env, '/plaza/tick');
    }
    if (path === '/api/plaza/record') { // 及第局录
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      return plazaForward(request, env, '/plaza/record');
    }

    // ---- 共修室 API（择室在广场；此处只有入座与探室） ----
    const mWs = path.match(/^\/api\/room\/([A-Z0-9]{4,8})\/ws$/i);
    if (mWs) {
      const code = mWs[1].toUpperCase();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      // 桌标由服务端判定（不信客户端）：广场固定桌才有「共修室」身份（可上锁、上广场）
      const target = new URL(request.url);
      target.searchParams.set('t', isTableCode(code) ? '1' : '0');
      target.searchParams.set('code', code);
      return stub.fetch(new Request(target, request));
    }

    const mInfo = path.match(/^\/api\/room\/([A-Z0-9]{4,8})$/i);
    if (mInfo) {
      const code = mInfo[1].toUpperCase();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      const probe = await stub.fetch('https://room/probe');
      const st = await probe.json();
      return json(st);
    }

    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);

    // ---- 其余请求：交给静态资源（dist） ----
    return env.ASSETS.fetch(request);
  },
};

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // players: id → { id, name, color, pos, n, done, seat }
    this.players = null;   // 惰性从 storage 恢复
    this.meta = null;      // { started, order:[id...], turnIdx, createdAt }
    this.chat = null;      // [{ id, name, text, ts }]
    this.plazaReady = false;
  }

  // 名号消毒：去控制字符、压空白、至多十二字
  safeName(value) {
    return Array.from(String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()).slice(0, 12).join('');
  }

  // ---- 共修广场（固定对象）：掷轮计数 · 及第局录 · 公报流 ----
  plazaInit() {
    if (this.plazaReady) return;
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS plaza_counter (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS plaza_runs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        n INTEGER NOT NULL,          -- 掷数
        doors TEXT NOT NULL,         -- 历经门号（JSON 数组）
        lowest TEXT,                 -- 本局最深落处（位名）
        span INTEGER NOT NULL,       -- 历经不同位次数
        path TEXT NOT NULL,          -- 'pure' 横超净土 / 'rise' 竖出
        seat TEXT NOT NULL,          -- 'solo' 独行 / 'table:N' 共修室 / 'private' 私室
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS plaza_runs_ts ON plaza_runs(ts DESC, seq DESC);
      CREATE TABLE IF NOT EXISTS plaza_feed (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS plaza_feed_ts ON plaza_feed(ts DESC, seq DESC);
      CREATE TABLE IF NOT EXISTS plaza_tables (
        code TEXT PRIMARY KEY,       -- H{厅}T{桌}
        hall INTEGER NOT NULL, no INTEGER NOT NULL,
        seats TEXT NOT NULL,         -- 在座者快照（JSON）
        live INTEGER NOT NULL, ts INTEGER NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS plaza_tables_hall ON plaza_tables(hall, no);
    `);
    // 旧库补列（新建库已含）：locked 列缺失时补上，免得升级后读不到锁态
    try { this.state.storage.sql.exec('ALTER TABLE plaza_tables ADD COLUMN locked INTEGER NOT NULL DEFAULT 0'); }
    catch (e) { /* 已有该列 */ }
    this.plazaReady = true;
  }

  plazaBump(key, by) {
    this.state.storage.sql.exec(
      'INSERT INTO plaza_counter (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = v + ?', key, by, by,
    );
  }

  plazaGet(key) {
    const row = [...this.state.storage.sql.exec('SELECT v FROM plaza_counter WHERE k = ? LIMIT 1', key)][0];
    return Number(row?.v || 0);
  }

  plazaPush(kind, text) {
    this.state.storage.sql.exec(
      'INSERT INTO plaza_feed (kind,text,ts) VALUES (?,?,?)', kind, String(text).slice(0, 120), Date.now(),
    );
    this.state.storage.sql.exec(
      'DELETE FROM plaza_feed WHERE seq NOT IN (SELECT seq FROM plaza_feed ORDER BY seq DESC LIMIT ?)', FEED_KEEP,
    );
  }

  plazaStat() {
    this.plazaInit();
    const today = dayKey();
    const runs = [...this.state.storage.sql.exec(
      'SELECT name,n,doors,lowest,span,path,seat,ts FROM plaza_runs ORDER BY ts DESC, seq DESC LIMIT 20',
    )].map(r => ({
      name: String(r.name), n: Number(r.n),
      doors: JSON.parse(String(r.doors || '[]')), lowest: r.lowest ? String(r.lowest) : '',
      span: Number(r.span), path: String(r.path), seat: String(r.seat), ts: Number(r.ts),
    }));
    const feed = [...this.state.storage.sql.exec(
      'SELECT kind,text,ts FROM plaza_feed ORDER BY seq DESC LIMIT 20',
    )].map(r => ({ kind: String(r.kind), text: String(r.text), ts: Number(r.ts) }));

    // 桌位快照按厅归拢；顺带算各厅人数，供“默认落在人最多但未满的厅”
    const snaps = {};
    const hallLive = {};
    this.state.storage.sql.exec('DELETE FROM plaza_tables WHERE ts < ?', Date.now() - TABLE_TTL); // 清失效快照
    for (const row of this.state.storage.sql.exec('SELECT code,hall,no,seats,live,locked FROM plaza_tables WHERE live > 0')) {
      const hall = Number(row.hall);
      (snaps[hall] ||= {})[Number(row.no)] = { seats: JSON.parse(String(row.seats || '[]')), locked: !!Number(row.locked) };
      hallLive[hall] = (hallLive[hall] || 0) + Number(row.live);
    }
    const cap = TABLE_COUNT * ROOM_MAX;
    const halls = Object.keys(hallLive).map(Number).sort((a, b) => a - b);
    // 默认厅＝人最多但未坐满的厅；全满则开新厅；无人则第一厅
    const open = halls.filter(h => hallLive[h] < cap).sort((a, b) => hallLive[b] - hallLive[a]);
    const hall = open[0] || (halls.length ? Math.max(...halls) + 1 : 1);

    return json({
      tosses: this.plazaGet('tosses'),
      tossesToday: this.plazaGet(`tosses:${today}`),
      wins: this.plazaGet('wins'),
      winsToday: this.plazaGet(`wins:${today}`),
      runs, feed, day: today,
      hall, snaps,
      halls: halls.map(h => ({ hall: h, live: hallLive[h] })),
      hallCount: Math.max(1, halls.length ? Math.max(...halls) : 1),
      seatsPerHall: cap,
    });
  }

  // 各桌 DO 推来的座次快照（座次变动时才推，不随每掷推）
  async plazaTableReport(request) {
    this.plazaInit();
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid json' }, 400); }
    const at = tableSeatOf(body?.code);
    if (!at) return json({ error: 'invalid table code' }, 400);
    const seats = (Array.isArray(body?.seats) ? body.seats : []).slice(0, ROOM_MAX).map(s => ({
      name: this.safeName(s?.name) || '同修',
      color: String(s?.color || '').slice(0, 8),
      seat: Math.max(0, Math.min(ROOM_MAX - 1, Math.floor(Number(s?.seat) || 0))),
      dir: SEAT_DIR.includes(s?.dir) ? s.dir : '',
      host: !!s?.host,
      n: Math.max(0, Math.min(9999, Math.floor(Number(s?.n) || 0))),
      done: !!s?.done, online: !!s?.online,
    }));
    const live = seats.filter(s => s.online).length;
    const code = tableCode(at.hall, at.no);
    if (!live) this.state.storage.sql.exec('DELETE FROM plaza_tables WHERE code = ?', code);
    else {
      this.state.storage.sql.exec(
        `INSERT INTO plaza_tables (code,hall,no,seats,live,ts,locked) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(code) DO UPDATE SET seats = excluded.seats, live = excluded.live,
           ts = excluded.ts, locked = excluded.locked`,
        code, at.hall, at.no, JSON.stringify(seats), live, Date.now(), body?.locked ? 1 : 0,
      );
    }
    return json({ ok: true, code, live });
  }

  // 上锁前问广场：本厅锁满了没有（保证陌生人永远有敞开的桌可坐）
  plazaCanLock(url) {
    this.plazaInit();
    const hall = Math.max(1, Math.floor(Number(url.searchParams.get('hall')) || 1));
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const row = [...this.state.storage.sql.exec(
      'SELECT COUNT(*) AS n FROM plaza_tables WHERE hall = ? AND locked = 1 AND code <> ? AND ts > ?',
      hall, code, Date.now() - TABLE_TTL,
    )][0];
    const locked = Number(row?.n || 0);
    return json({ ok: locked < LOCK_MAX_PER_HALL, locked, max: LOCK_MAX_PER_HALL });
  }

  async plazaTick(request) {
    this.plazaInit();
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid json' }, 400); }
    // 只计实际落定的掷轮；单次上报上限 60，防止伪造把总数灌爆
    const n = Math.min(60, Math.max(0, Math.floor(Number(body?.n) || 0)));
    if (!n) return json({ ok: true, tosses: this.plazaGet('tosses') });
    this.plazaBump('tosses', n);
    this.plazaBump(`tosses:${dayKey()}`, n);
    return json({ ok: true, tosses: this.plazaGet('tosses') });
  }

  async plazaRecord(request) {
    this.plazaInit();
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid json' }, 400); }
    const name = this.safeName(body?.name) || '同修';
    const n = Math.max(1, Math.min(9999, Math.floor(Number(body?.n) || 0)));
    // 门号越界者剔除，不夹取——把 99 夹成 15 等于替人捏造「历十五门」，宁可少记不可虚记
    const doors = Array.isArray(body?.doors)
      ? body.doors.map(d => Math.floor(Number(d))).filter(d => Number.isInteger(d) && d >= 1 && d <= 15).slice(0, 15)
      : [];
    const lowest = String(body?.lowest || '').slice(0, 24);
    const span = Math.max(1, Math.min(999, Math.floor(Number(body?.span) || 1)));
    const path = body?.path === 'pure' ? 'pure' : 'rise';
    const seat = /^(solo|private|table:([1-9]|1[0-2]))$/.test(String(body?.seat || '')) ? String(body.seat) : 'solo';
    const ts = Date.now();
    this.state.storage.sql.exec(
      'INSERT INTO plaza_runs (name,n,doors,lowest,span,path,seat,ts) VALUES (?,?,?,?,?,?,?,?)',
      name, n, JSON.stringify([...new Set(doors)].sort((a, b) => a - b)), lowest, span, path, seat, ts,
    );
    this.state.storage.sql.exec(
      'DELETE FROM plaza_runs WHERE seq NOT IN (SELECT seq FROM plaza_runs ORDER BY seq DESC LIMIT ?)', RUN_KEEP,
    );
    this.plazaBump('wins', 1);
    this.plazaBump(`wins:${dayKey(ts)}`, 1);
    this.plazaPush('win', `${name} 第 ${n} 掷选佛及第`);
    return json({ ok: true, wins: this.plazaGet('wins') });
  }

  async load() {
    if (this.players) return;
    this.players = (await this.state.storage.get('players')) || {};
    this.meta = (await this.state.storage.get('meta')) || { createdAt: Date.now(), lockHash: '', lockBy: '', tries: 0 };
    this.chat = (await this.state.storage.get('chat')) || [];
  }

  async save() {
    await this.state.storage.put({ players: this.players, meta: this.meta, chat: this.chat });
  }

  liveIds(exceptWs = null) {
    // 在线连接的 playerId 集合（休眠恢复也数得到）
    // exceptWs：webSocketClose 期间，正在关闭的连接仍在 getWebSockets() 里，
    // 不排除掉就会把已离席者算作在座——座位永不释放，广场慢慢被僵尸填满。
    const ids = new Set();
    for (const ws of this.state.getWebSockets()) {
      if (ws === exceptWs) continue;
      const att = ws.deserializeAttachment();
      if (att && att.playerId) ids.add(att.playerId);
    }
    return ids;
  }

  // 珠色跟人不跟座：座次会因东位递补而变，珠色一路不变，免得 3D 珠中途换色认不出人
  freeColor() {
    const used = new Set(Object.values(this.players).map(q => q.color));
    return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0];
  }

  // 东位递补：东位一空，在座者中座次最小者补上，房主之位随之继承。
  // 不补的话，房主一走就没人能撤密码——那间室会一直锁着，谁也进不去、谁也解不开。
  promoteEast() {
    const all = Object.values(this.players);
    if (!all.length || all.some(q => q.seat === 0)) return false;
    const next = all.slice().sort((a, b) => a.seat - b.seat)[0];
    next.seat = 0;
    return true;
  }

  // 清废座（懒清：只在有人求座、真要谢客之前跑一次，不设闹钟）：
  // ① 已及第且久未再动者——一局已圆，座该让给候着的莲友；② 离线超过宽限期者。
  sweepSeats() {
    const now = Date.now();
    const live = this.liveIds();
    let swept = false;
    for (const q of Object.values(this.players)) {
      const online = live.has(q.id);
      const doneIdle = q.done && q.doneAt && now - q.doneAt > DONE_HOLD;
      const offGone = !online && now - Number(q.seenAt || 0) > OFFLINE_GRACE;
      if (doneIdle || offGone) { delete this.players[q.id]; swept = true; }
    }
    if (swept) this.promoteEast();
    return swept;
  }

  roster(exceptWs = null) {
    const live = this.liveIds(exceptWs);
    return Object.values(this.players)
      .sort((a, b) => a.seat - b.seat)
      .map(p => ({ ...p, dir: SEAT_DIR[p.seat] || '', host: p.seat === 0, online: live.has(p.id) }));
  }

  // 向广场推送本桌座次（仅共修室；仅在座次真正变动时调用，不随每掷推）
  async plazaReport(exceptWs = null) {
    const code = this.meta && this.meta.code;
    if (!isTableCode(code)) return;
    const seats = this.roster(exceptWs).map(p => ({
      name: p.name, color: p.color, seat: p.seat, dir: p.dir, host: p.host,
      n: p.n, done: !!p.done, online: !!p.online,
    }));
    try {
      await this.env.ROOM.get(this.env.ROOM.idFromName(PLAZA_OBJECT)).fetch(
        'https://plaza.internal/plaza/table',
        { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, seats, locked: !!this.meta.lockHash }) },
      );
      this.meta.reportedAt = Date.now();
      await this.save();
    } catch (e) { /* 广场暂时不可达不影响本桌行谱 */ }
  }

  // 密码哈希加盐：盐取房号，同一密码在不同室哈希不同，防彩虹表与跨室比对
  keyHash(key) { return sha256(`${this.meta.code || ''}:${key}`); }

  // 问广场本厅还能不能再设密码（广场是唯一知道全厅锁况的地方）
  async plazaAskLock(hall) {
    try {
      const r = await this.env.ROOM.get(this.env.ROOM.idFromName(PLAZA_OBJECT)).fetch(
        `https://plaza.internal/plaza/canlock?hall=${hall}&code=${encodeURIComponent(this.meta.code || '')}`,
      );
      const d = await r.json();
      return !!d.ok;
    } catch (e) { return false; } // 问不到就不给锁：宁可少锁一室，不可锁满全厅
  }

  broadcast(msg, exceptWs = null) {
    const s = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exceptWs) continue;
      try { ws.send(s); } catch (e) { /* 断连交给 close 处理 */ }
    }
  }

  syncMsg() {
    return {
      type: 'sync',
      players: this.roster(),
      locked: !!this.meta.lockHash,
      chat: this.chat.slice(-CHAT_KEEP),
    };
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 广场固定对象：只走 SQL，不加载房间态
    if (url.pathname === '/plaza/stat') return this.plazaStat();
    if (url.pathname === '/plaza/tick') return this.plazaTick(request);
    if (url.pathname === '/plaza/record') return this.plazaRecord(request);
    if (url.pathname === '/plaza/table') return this.plazaTableReport(request);
    if (url.pathname === '/plaza/canlock') return this.plazaCanLock(url);

    await this.load();

    if (url.pathname === '/probe') {
      const seats = this.roster().map(p => ({
        name: p.name, color: p.color, seat: p.seat, n: p.n, done: !!p.done, online: !!p.online,
      }));
      return json({
        empty: Object.keys(this.players).length === 0,
        count: Object.keys(this.players).length,
        locked: !!this.meta.lockHash,
        online: this.liveIds().size,
        seats,
      });
    }

    // WebSocket 升级
    if (request.headers.get('Upgrade') === 'websocket') {
      // 桌号由 Worker 依房号判定后带入并留存——DO 本身不知道自己的名字，推送广场时要用
      const code = String(url.searchParams.get('code') || '').toUpperCase();
      if (isTableCode(code) && this.meta.code !== code) { this.meta.code = code; await this.save(); }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // 休眠式 WebSocket：DO 空闲时可休眠省费，消息到来自动唤醒
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ playerId: null, table: url.searchParams.get('t') === '1' });
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: 'bad request' }, 400);
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const att = ws.deserializeAttachment() || {};

    switch (msg.type) {
      case 'join': {
        // 入座或重连。重连（持 playerId 或同名空座）不再查密码——本已放进来过的人，
        // 掉个线不该被自己的室挡在外面；playerId 是随机串，猜不着。
        const name = String(msg.name || '').trim().slice(0, 12) || '同修';
        let p = msg.playerId ? this.players[msg.playerId] : null;
        if (!p) p = Object.values(this.players).find(q => q.name === name && !this.liveIds().has(q.id)) || null;
        if (!p) {
          this.sweepSeats();                       // 先清废座（已及第久坐者／离线超时者），再论满座
          if (Object.keys(this.players).length >= ROOM_MAX) {
            ws.send(JSON.stringify({ type: 'error', code: 'full', text: '此室已满四位同修' }));
            return;
          }
          // 上锁的共修室：须持密码或邀请链接。密码只存加盐哈希，比对也在服务端。
          if (this.meta.lockHash) {
            if (Number(this.meta.tries || 0) >= LOCK_MAX_TRIES) {
              ws.send(JSON.stringify({ type: 'error', code: 'locked', text: '此室密码错次过多，暂闭；请另择一室' }));
              return;
            }
            const given = await this.keyHash(String(msg.key || ''));
            if (given !== this.meta.lockHash) {
              this.meta.tries = Number(this.meta.tries || 0) + 1;
              await this.save();
              ws.send(JSON.stringify({ type: 'error', code: 'needkey', text: '此室已设密码——请凭密码或邀请链接入座' }));
              return;
            }
            this.meta.tries = 0; // 密码对上，计数归零
          }
          const seat = [0, 1, 2, 3].find(i => !Object.values(this.players).some(q => q.seat === i));
          p = {
            id: crypto.randomUUID().slice(0, 8),
            name, seat,
            color: this.freeColor(),               // 珠色跟人不跟座：座次会递补，珠色一路不变
            pos: null, n: 0, done: false, doneAt: 0,
          };
          this.players[p.id] = p;
        }
        p.seenAt = Date.now();
        ws.serializeAttachment({ playerId: p.id, table: !!att.table });
        await this.save();
        ws.send(JSON.stringify({ type: 'joined', playerId: p.id, seat: p.seat, color: p.color, dir: SEAT_DIR[p.seat] || '', host: p.seat === 0 }));
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        break;
      }

      case 'lock': {
        // 设密码／撤密码：只有东位者（房主）可设。密码由用户自定四位数字；
        // 库中只留加盐哈希（盐＝房号，同一密码在不同室哈希不同），比对亦在服务端。
        const me = this.players[att.playerId];
        if (!me || me.seat !== 0) return;
        if (msg.off) {
          this.meta.lockHash = ''; this.meta.lockBy = ''; this.meta.tries = 0;
          await this.save();
          this.broadcast(this.syncMsg());
          ws.send(JSON.stringify({ type: 'locked', locked: false }));
          break;
        }
        if (!att.table) return;                       // 只有广场共修室有密码的概念
        const key = String(msg.key || '');
        if (!/^\d{4}$/.test(key)) {
          ws.send(JSON.stringify({ type: 'error', code: 'badkey', text: '密码须为四位数字' }));
          return;
        }
        const at = tableSeatOf(this.meta.code);
        // 一厅至多锁三分之一，余下的室永远对陌生人敞开——否则熟人能把整厅占光
        if (at && !this.meta.lockHash) {
          const okToLock = await this.plazaAskLock(at.hall);
          if (!okToLock) {
            ws.send(JSON.stringify({ type: 'error', code: 'lockfull', text: `本厅至多 ${LOCK_MAX_PER_HALL} 室设密码，请换一室` }));
            return;
          }
        }
        this.meta.lockHash = await this.keyHash(key);
        this.meta.lockBy = me.id;
        this.meta.tries = 0;
        await this.save();
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        ws.send(JSON.stringify({ type: 'locked', locked: true, key })); // 回显自己设的密码，供复制/生成邀请链接
        break;
      }

      case 'move': {
        // 行棋公报：客户端依原谱判定后报结果，服务端记账并转发
        const p = this.players[att.playerId];
        if (!p) return;
        const was = { n: p.n, done: p.done };
        p.pos = msg.pos ?? p.pos;
        p.n = msg.n ?? p.n;
        p.seenAt = Date.now();
        if (msg.done) { p.done = true; p.doneAt = p.doneAt || Date.now(); }
        await this.save();
        // 只在桌态可能翻转时推广场：起行（候莲友→行谱中）与及第；
        // 另加保鲜续报——久坐久掷的桌不能因快照过期被误判成空桌。
        const stale = Date.now() - Number(this.meta.reportedAt || 0) > REPORT_REFRESH;
        if ((was.n === 0 && p.n > 0) || (!was.done && p.done) || stale) this.state.waitUntil(this.plazaReport());
        this.broadcast({
          type: 'move', playerId: p.id, name: p.name, color: p.color,
          combo: msg.combo, txt: msg.txt, dir: msg.dir, pos: p.pos, n: p.n, done: p.done,
        }, ws);
        this.broadcast(this.syncMsg());
        break;
      }

      case 'restart_self': {
        // 个人再入选佛场：只清自己这一局，不碰同桌他人（共修室行处各自独立，谁也不该被别人一键归零）
        const me = this.players[att.playerId];
        if (!me) return;
        me.pos = null; me.n = 0; me.done = false; me.doneAt = 0; me.seenAt = Date.now();
        await this.save();
        this.broadcast({ type: 'restarted_self', playerId: me.id, name: me.name });
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        break;
      }


      case 'chat': {
        const p = this.players[att.playerId];
        if (!p) return;
        const text = String(msg.text || '').trim().slice(0, 200);
        if (!text) return;
        const entry = { id: p.id, name: p.name, color: p.color, text, ts: Date.now() };
        this.chat.push(entry);
        if (this.chat.length > CHAT_KEEP) this.chat = this.chat.slice(-CHAT_KEEP);
        await this.save();
        this.broadcast({ type: 'chat', ...entry });
        break;
      }

      case 'sync': {
        ws.send(JSON.stringify(this.syncMsg()));
        break;
      }

      case 'leave': {
        await this.dropPlayer(att.playerId, ws);
        break;
      }
    }
  }

  async webSocketClose(ws) {
    await this.load();
    const att = ws.deserializeAttachment() || {};
    // 掉线不除名（可重连续局）；只广播在线状态；若正轮到掉线者且久未归，其余同修可继续聊天等候
    if (att.playerId) { this.broadcast(this.syncMsg(), ws); this.state.waitUntil(this.plazaReport(ws)); }
    // 房间无人且未开局超过一天由 Cloudflare 自然回收（storage 留着供重连）
    if (this.liveIds(ws).size === 0) {
      await this.state.storage.deleteAll(); // 室空即归零：名单、密码、聊天一并清
      this.players = {}; this.meta = { createdAt: Date.now(), lockHash: '', lockBy: '', tries: 0 }; this.chat = [];
    }
  }

  async dropPlayer(playerId, ws) {
    if (!playerId || !this.players[playerId]) return;
    delete this.players[playerId];
    if (!Object.keys(this.players).length) { this.meta.lockHash = ''; this.meta.lockBy = ''; this.meta.tries = 0; } // 人走室空，密码一并撤
    else this.promoteEast(); // 东位一空即递补，房主之位随之继承（否则密码没人撤得掉）
    await this.save();
    try { ws.close(1000, 'left'); } catch (e) { /* 已断则忽略 */ }
    this.broadcast(this.syncMsg());
    this.state.waitUntil(this.plazaReport());
  }
}
