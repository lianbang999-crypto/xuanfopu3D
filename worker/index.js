// 选佛谱联机后端 · Cloudflare Worker + Durable Object
// 职责：2–4 位真人共同准备、轮流掷轮、服务器权威判定、共同结算、聊天与断线重连。
// 谱位事实与升降规则复用浏览器同一份纯规则引擎；房间生命周期属于项目操作规则。
import {
  SFP_FACE_ORDER,
  SFP_PROTOCOL_VERSION,
  canonicalSfpCombo,
  emptySfpPlayerState,
  resolveSfpToss,
} from '../src/sfp-engine.js';

const ROOM_MAX = 4;                 // 原谱多人局：至多四位同修
const CHAT_KEEP = 120;              // 聊天留存条数（重连可回看）
const PLAYER_COLORS = ['#e8c766', '#96e1d6', '#d98873', '#b9a7e0']; // 金·青·赭·藕——四位同修珠色
// 座次只用于服务器轮流掷轮，不在前台显示方位。最先入室者为房主；
// 房主离开后按入座次序递补，不再让用户理解“东南西北”。
const ASK_INTERNAL_URL = 'https://ask.internal/v1/ask';

// ---- 共修广场：固定 12 张共修室（桌数固定、座数固定，入座准备后共同开局） ----
const PLAZA_OBJECT = '__xuanfopu_plaza__';
const TABLE_COUNT = 12;
const TABLE_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
// plaza_feed 为旧「及第公报流」，已由共修动态（一人一行，见 plaza_practice）取代；
// 建表与旧数据保留，只在推算「本站共修起始日」时读一次，不再写入。
const RUN_KEEP = 500;   // 及第录留存条数（超出按时间裁旧）
const PRACTICE_DAILY_CAP = 10000; // 功课榜是随喜记录；单身份日上限仅防异常灌数
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
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const dayKey = (ts = Date.now()) => new Date(ts + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);

// ---- 密码：共修室可由房主设置四位数密码，邀熟人同座（取代原「私室」） ----
// 密码由用户自设四位数字：一万种组合配「十分钟内错满十次暂闭」，猜中概率千分之一；
// 系统代设反而让人记不住、也没法口头报给莲友。
const LOCK_MAX_TRIES = 10;      // 密码错满即暂闭，防暴力猜
const LOCK_WINDOW_MS = 10 * 60 * 1000; // 十分钟后自动恢复，避免恶意试错永久锁死房间
const LOCK_MAX_PER_HALL = 4;    // 一厅至多四室设密码（12 之三分一），余下永远对陌生人敞开
// 座位回收：不设闹钟，只在有人求座、真要谢客之前懒清一次
const OFFLINE_GRACE = 90 * 1000;      // 断线保座九十秒：够走完一次重连退避
const TURN_MS = 60 * 1000;            // 在线等待一手的最长时间
const DISCONNECT_TURN_MS = 30 * 1000; // 正轮到的同修断线，先等三十秒重连
// 判词卡是本谱的正经阅读界面（谱曰原文＋经证＋名相小签），二十秒读不完一段古文；
// 兜底放宽到一分钟，与在线等待一手同刻度，前台另有倒计时提示。
const RESOLVE_MS = 60 * 1000;         // 客户端动画/判词未确认时的服务端兜底
const GIFT_CHOICE_MS = 30 * 1000;      // 三至四人局选择受赠者；超时按座次自动施与
// 房主挂机不该锁死全房：人已齐备并等够这段时间，任一已准备者都可以开局
const HOST_IDLE_MS = 45 * 1000;
// 公开端点日上限（按 IP+UA 哈希计）：广场数字是给人看的随喜记录，不该谁都能随手灌
const PUBLIC_RUN_CAP = 60;        // 单一来源每日至多登记的及第局数
const PUBLIC_TICK_CAP = 20000;    // 单一来源每日至多计入的掷数
const CHAT_GAP_MS = 750;              // 单连接聊天限速

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
  // 满座尺用「占座数」（含断线保座九十秒者）——与房间 join 的满员检查同一把尺，
  // 免得大厅按在线数显示可坐、点进去却被 full 拒（保座者的座确实还占着）
  const held = seats.length;
  const live = seats.filter(s => s.online).length;
  if (held >= ROOM_MAX) return 'full';
  if (live === 0) return 'empty';
  return seats.some(s => s.online && s.roomStatus === 'playing') ? 'playing' : 'waiting';
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
    if (path === '/api/plaza/me') {     // 个人功课：累计·及第·共修天数·连续日·逐日（供月历）
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      return plazaForward(request, env, '/plaza/me');
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
    // players: id → { id,name,color,seat,ready,spectator,pos,n,bonus,done,away,... }
    this.players = null;   // 惰性从 storage 恢复
    this.meta = null;      // v2 房间状态机；见 freshRoomMeta()
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

  safeClientToken(value) {
    const token = String(value || '');
    return /^[A-Za-z0-9:_-]{12,96}$/.test(token) ? token : '';
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
      -- 逐日掷数：只为月历与「连续N日」保留；名次不再由它产生
      CREATE TABLE IF NOT EXISTS plaza_daily_practice (
        day TEXT NOT NULL,
        actor TEXT NOT NULL,
        name TEXT NOT NULL,
        tosses INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL,
        PRIMARY KEY(day, actor)
      );
      CREATE INDEX IF NOT EXISTS plaza_daily_practice_rank
        ON plaza_daily_practice(day, tosses DESC, updated ASC);
      -- 累计功课：念佛计数的语义是一辈子只增，不按天清零。
      -- 共修动态按 lastAt 倒序取——时间先后即次序，不排名次（不作修证高下）。
      CREATE TABLE IF NOT EXISTS plaza_practice (
        actor TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tosses INTEGER NOT NULL DEFAULT 0,   -- 累计掷轮（一掷一称念）
        wins INTEGER NOT NULL DEFAULT 0,     -- 累计及第
        days INTEGER NOT NULL DEFAULT 0,     -- 共修天数（有掷轮的天数）
        firstAt INTEGER NOT NULL,
        lastAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS plaza_practice_recent ON plaza_practice(lastAt DESC);
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
    // 及第录补 actor 列：旧记录只有名号，认不回是谁；新记录起可归到本人名下
    try { this.state.storage.sql.exec('ALTER TABLE plaza_runs ADD COLUMN actor TEXT'); }
    catch (e) { /* 已有该列 */ }
    this.plazaReady = true;
    this.plazaMigrate();
  }

  // 一次性迁移：把按天分区的旧数据汇总进累计表，一声不丢；并固化「本站共修第一天」
  plazaMigrate() {
    if (this.plazaGet('schema') >= 2) return;
    this.state.storage.sql.exec(
      `INSERT INTO plaza_practice (actor,name,tosses,wins,days,firstAt,lastAt)
       SELECT actor, MAX(name), SUM(tosses), 0, COUNT(DISTINCT day), MIN(updated), MAX(updated)
       FROM plaza_daily_practice GROUP BY actor
       ON CONFLICT(actor) DO NOTHING`,
    );
    if (!this.plazaGet('since')) {
      // 起算日取现存最早的一条痕迹；库里若空无一物就从今天算起
      const earliest = [...this.state.storage.sql.exec(
        `SELECT MIN(t) AS t FROM (
           SELECT MIN(ts) AS t FROM plaza_runs
           UNION ALL SELECT MIN(ts) FROM plaza_feed
           UNION ALL SELECT MIN(updated) FROM plaza_daily_practice)`,
      )][0];
      this.plazaBump('since', Number(earliest?.t) || Date.now());
    }
    this.plazaBump('schema', 2);
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

  plazaStat() {
    this.plazaInit();
    const today = dayKey();
    const todayStart = Date.parse(`${today}T00:00:00+08:00`);
    void todayStart;
    // 共修动态：一人一行，按最近用功时刻倒序。时间先后即次序，不列名次——
    // 念佛记录上不该出现排名（不作修证高下）。同名者缀莲号尾四位以分。
    const streamRows = [...this.state.storage.sql.exec(
      'SELECT actor,name,tosses,wins,lastAt FROM plaza_practice ORDER BY lastAt DESC LIMIT 30',
    )];
    const dupNames = new Set();
    const seenNames = new Set();
    for (const r of streamRows) {
      const nm = String(r.name);
      if (seenNames.has(nm)) dupNames.add(nm); else seenNames.add(nm);
    }
    const stream = streamRows.map(r => {
      const nm = String(r.name);
      return {
        name: dupNames.has(nm) ? `${nm} · ${String(r.actor).slice(-4).toUpperCase()}` : nm,
        tosses: Number(r.tosses),
        wins: Number(r.wins),
        at: Number(r.lastAt),
      };
    });
    const people = Number([...this.state.storage.sql.exec(
      'SELECT COUNT(*) n FROM plaza_practice',
    )][0]?.n || 0);
    // 逐日表只供月历与「连续N日」：留 400 天（够画一年日历），总量在累计表里不受清理影响
    this.state.storage.sql.exec(
      'DELETE FROM plaza_daily_practice WHERE day < ?', dayKey(Date.now() - 400 * 86400000),
    );
    const since = this.plazaGet('since') || Date.now();
    // 本站共修第几天：起算日当天即第 1 天
    const days = Math.max(1, Math.floor((Date.parse(`${today}T00:00:00+08:00`)
      - Date.parse(`${dayKey(since)}T00:00:00+08:00`)) / 86400000) + 1);

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
      days, people, since,                       // 本站共修第 N 天 · 已参加 N 人
      tosses: this.plazaGet('tosses'),           // 全站累计掷轮（一掷一称念）
      tossesToday: this.plazaGet(`tosses:${today}`),
      wins: this.plazaGet('wins'),
      winsToday: this.plazaGet(`wins:${today}`),
      stream, day: today,                        // 共修动态：一人一行，时间序，无名次
      hall, snaps,
      halls: halls.map(h => ({ hall: h, live: hallLive[h] })),
      hallCount: Math.max(1, halls.length ? Math.max(...halls) : 1),
      seatsPerHall: cap,
    });
  }

  // 个人功课：累计、及第、共修天数、连续日与逐日掷数（供月历）。
  // 莲号是本机随机 24 位十六进制，不可枚举；此处只按莲号取自己的数。
  async plazaMine(request) {
    this.plazaInit();
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid json' }, 400); }
    const actor = /^p_[a-f0-9]{24}$/.test(String(body?.actor || '')) ? String(body.actor) : '';
    if (!actor) return json({ error: 'actor required' }, 400);
    const me = [...this.state.storage.sql.exec(
      'SELECT name,tosses,wins,days,firstAt,lastAt FROM plaza_practice WHERE actor = ? LIMIT 1', actor,
    )][0];
    const daily = {};
    for (const row of this.state.storage.sql.exec(
      'SELECT day,tosses FROM plaza_daily_practice WHERE actor = ? ORDER BY day DESC LIMIT 400', actor,
    )) daily[String(row.day)] = Number(row.tosses);
    // 连续用功日：今日还没掷不算断（照 foyue 念佛计数器口径，从昨日起算）
    let streak = 0;
    for (let i = daily[dayKey()] > 0 ? 0 : 1; i < 400; i++) {
      if (daily[dayKey(Date.now() - i * 86400000)] > 0) streak++; else break;
    }
    const runs = [...this.state.storage.sql.exec(
      'SELECT n,doors,lowest,span,path,seat,ts FROM plaza_runs WHERE actor = ? ORDER BY ts DESC LIMIT 30', actor,
    )].map(r => ({
      n: Number(r.n), doors: JSON.parse(String(r.doors || '[]')),
      lowest: r.lowest ? String(r.lowest) : '', span: Number(r.span),
      path: String(r.path), seat: String(r.seat), ts: Number(r.ts),
    }));
    return json({
      name: me ? String(me.name) : '',
      tosses: Number(me?.tosses || 0),
      wins: Number(me?.wins || 0),
      days: Number(me?.days || 0),
      firstAt: Number(me?.firstAt || 0),
      today: daily[dayKey()] || 0,
      streak, daily, runs, day: dayKey(),
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
      host: !!s?.host,
      n: Math.max(0, Math.min(9999, Math.floor(Number(s?.n) || 0))),
      done: !!s?.done,
      online: !!s?.online,
      ready: !!s?.ready,
      spectator: !!s?.spectator,
      roomStatus: ['waiting', 'playing', 'finished'].includes(s?.roomStatus) ? s.roomStatus : 'waiting',
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
    // 只计实际落定的掷轮；单次上报上限 60，稳定匿名身份每日最多记一万念。
    let n = Math.min(60, Math.max(0, Math.floor(Number(body?.n) || 0)));
    const actorId = /^p_[a-f0-9]{24}$/.test(String(body?.actor || '')) ? String(body.actor) : '';
    if (!n) {
      // 只改名不计数：刚在功课榜取了名号，本人那一行应当立刻换过来，不必等下一掷
      const newName = this.safeName(body?.name);
      if (actorId && newName) {
        this.state.storage.sql.exec(
          'UPDATE plaza_daily_practice SET name = ? WHERE day = ? AND actor = ?',
          newName, dayKey(), actorId,
        );
        this.state.storage.sql.exec('UPDATE plaza_practice SET name = ? WHERE actor = ?', newName, actorId);
      }
      return json({ ok: true, tosses: this.plazaGet('tosses') });
    }
    // 匿名身份由浏览器自生成，换一个就能重开一份额度；再按来源指纹压一道日上限
    n = this.quotaTake('tick', await this.sourceKey(request), PUBLIC_TICK_CAP, n);
    if (!n) return json({ ok: true, accepted: 0, tosses: this.plazaGet('tosses') });
    const actor = actorId;
    const name = this.safeName(body?.name) || (actor ? `莲友·${actor.slice(-4).toUpperCase()}` : '莲友');
    const today = dayKey();
    let accepted = n;
    if (actor) {
      const old = [...this.state.storage.sql.exec(
        'SELECT tosses FROM plaza_daily_practice WHERE day = ? AND actor = ? LIMIT 1', today, actor,
      )][0];
      const freshDay = !old;   // 今天第一次记：共修天数加一（这次查询顺带就知道了，不另查一趟）
      accepted = Math.min(n, Math.max(0, PRACTICE_DAILY_CAP - Number(old?.tosses || 0)));
      if (accepted) {
        const now = Date.now();
        this.state.storage.sql.exec(
          `INSERT INTO plaza_daily_practice (day,actor,name,tosses,updated) VALUES (?,?,?,?,?)
           ON CONFLICT(day,actor) DO UPDATE SET
             name = excluded.name,
             tosses = plaza_daily_practice.tosses + excluded.tosses,
             updated = excluded.updated`,
          today, actor, name, accepted, now,
        );
        this.state.storage.sql.exec(
          `INSERT INTO plaza_practice (actor,name,tosses,wins,days,firstAt,lastAt) VALUES (?,?,?,0,?,?,?)
           ON CONFLICT(actor) DO UPDATE SET
             name = excluded.name,
             tosses = plaza_practice.tosses + excluded.tosses,
             days = plaza_practice.days + excluded.days,
             lastAt = excluded.lastAt`,
          actor, name, accepted, freshDay ? 1 : 0, now, now,
        );
      }
    }
    // 兼容旧客户端：无匿名身份时仍计入全站总数，但不会进入个人榜。
    if (accepted) {
      this.plazaBump('tosses', accepted);
      this.plazaBump(`tosses:${today}`, accepted);
    }
    return json({ ok: true, accepted, tosses: this.plazaGet('tosses') });
  }

  // 来源指纹：只留哈希，不落原始 IP（与 /api/ask 同口径）
  async sourceKey(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ua = (request.headers.get('User-Agent') || 'unknown').slice(0, 240);
    return (await sha256(`${ip}\n${ua}`)).slice(0, 24);
  }

  // 日配额：超出即拒，不静默丢——调用方据实告知
  quotaTake(kind, who, cap, want = 1) {
    const key = `lim:${kind}:${dayKey()}:${who}`;
    const used = this.plazaGet(key);
    const take = Math.max(0, Math.min(want, cap - used));
    if (take > 0) this.plazaBump(key, take);
    return take;
  }

  // 共修室的及第由本室 DO 直接登记（服务器权威），不经浏览器自报；
  // 及第累加到本人莲号：共修室的由房间带莲号上来，一人行谱的由客户端自带
  bumpWin(actor, name, ts) {
    this.plazaBump('wins', 1);
    this.plazaBump(`wins:${dayKey(ts)}`, 1);
    if (!actor) return;
    this.state.storage.sql.exec(
      `INSERT INTO plaza_practice (actor,name,tosses,wins,days,firstAt,lastAt) VALUES (?,?,0,1,0,?,?)
       ON CONFLICT(actor) DO UPDATE SET wins = plaza_practice.wins + 1, lastAt = excluded.lastAt`,
      actor, name, ts, ts,
    );
  }

  async plazaRecordVerified(request) {
    this.plazaInit();
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid json' }, 400); }
    const name = this.safeName(body?.name) || '同修';
    const n = Math.max(1, Math.min(9999, Math.floor(Number(body?.n) || 0)));
    const seat = /^table:([1-9]|1[0-2])$/.test(String(body?.seat || '')) ? String(body.seat) : 'private';
    const actor = /^p_[a-f0-9]{24}$/.test(String(body?.actor || '')) ? String(body.actor) : '';
    const ts = Date.now();
    this.state.storage.sql.exec(
      'INSERT INTO plaza_runs (name,n,doors,lowest,span,path,seat,ts,actor) VALUES (?,?,?,?,?,?,?,?,?)',
      name, n, '[]', '', 1, 'rise', seat, ts, actor || null,
    );
    this.state.storage.sql.exec(
      'DELETE FROM plaza_runs WHERE seq NOT IN (SELECT seq FROM plaza_runs ORDER BY seq DESC LIMIT ?)', RUN_KEEP,
    );
    this.bumpWin(actor, name, ts);
    return json({ ok: true, wins: this.plazaGet('wins') });
  }

  async plazaRecord(request) {
    this.plazaInit();
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid json' }, 400); }
    // 共修室的及第只认本室 DO 出具的那一份；浏览器自报不得声称自己坐在某间共修室
    if (String(body?.seat || 'solo') !== 'solo') {
      return json({ error: 'table runs are recorded by the room itself' }, 403);
    }
    const who = await this.sourceKey(request);
    if (!this.quotaTake('run', who, PUBLIC_RUN_CAP)) {
      return json({ error: 'daily record quota reached', wins: this.plazaGet('wins') }, 429);
    }
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
    const actor = /^p_[a-f0-9]{24}$/.test(String(body?.actor || '')) ? String(body.actor) : '';
    const ts = Date.now();
    this.state.storage.sql.exec(
      'INSERT INTO plaza_runs (name,n,doors,lowest,span,path,seat,ts,actor) VALUES (?,?,?,?,?,?,?,?,?)',
      name, n, JSON.stringify([...new Set(doors)].sort((a, b) => a - b)), lowest, span, path, seat, ts, actor || null,
    );
    this.state.storage.sql.exec(
      'DELETE FROM plaza_runs WHERE seq NOT IN (SELECT seq FROM plaza_runs ORDER BY seq DESC LIMIT ?)', RUN_KEEP,
    );
    this.bumpWin(actor, name, ts);
    return json({ ok: true, wins: this.plazaGet('wins') });
  }

  async load() {
    if (this.players) return;
    this.players = (await this.state.storage.get('players')) || {};
    this.meta = (await this.state.storage.get('meta')) || {};
    this.chat = (await this.state.storage.get('chat')) || [];
    const previousProtocol = Number(this.meta.protocolVersion || 0);
    this.meta = this.freshRoomMeta(this.meta);
    for (const p of Object.values(this.players)) {
      p.ready = !!p.ready;
      p.spectator = !!p.spectator;
      p.away = !!p.away;
      p.skips = Math.max(0, Number(p.skips) || 0);
      p.pos = p.pos || null;
      p.n = Math.max(0, Number(p.n) || 0);
      p.bonus = Math.max(0, Number(p.bonus) || 0);
      p.done = !!p.done;
      p.doneAt = Number(p.doneAt) || 0;
      p.seenAt = Number(p.seenAt) || Date.now();
      p.pendingGrantCount = Math.max(0, Math.min(4, Number(p.pendingGrantCount) || 0));
    }
    this.normalizeGiftQueue();
    // 从旧“同桌自由掷”协议升级时，不把各自本地进度伪装成同一局。
    // 保留房间、座次、密码和聊天，统一回到真人准备室。
    if (previousProtocol !== SFP_PROTOCOL_VERSION) {
      for (const p of Object.values(this.players)) Object.assign(p, {
        ready: false, spectator: false, away: false, skips: 0,
        pos: null, n: 0, bonus: 0, done: false, doneAt: 0,
      });
      Object.assign(this.meta, this.freshRoomMeta({
        createdAt: this.meta.createdAt,
        code: this.meta.code,
        lockHash: this.meta.lockHash,
        lockBy: this.meta.lockBy,
        tries: this.meta.tries,
        triesAt: this.meta.triesAt,
        reportedAt: this.meta.reportedAt,
      }));
      await this.save();
    }
  }

  async save() {
    await this.state.storage.put({ players: this.players, meta: this.meta, chat: this.chat });
  }

  freshRoomMeta(base = {}) {
    return {
      protocolVersion: SFP_PROTOCOL_VERSION,
      createdAt: Number(base.createdAt) || Date.now(),
      code: base.code || '',
      lockHash: base.lockHash || '',
      lockBy: base.lockBy || '',
      tries: Math.max(0, Number(base.tries) || 0),
      triesAt: Number(base.triesAt) || 0,
      reportedAt: Number(base.reportedAt) || 0,
      revision: Math.max(0, Number(base.revision) || 0),
      status: ['waiting', 'playing', 'finished'].includes(base.status) ? base.status : 'waiting',
      phase: ['waiting_toss', 'resolving', 'choosing_grant', 'finished'].includes(base.phase) ? base.phase : 'waiting_toss',
      matchId: base.matchId || '',
      order: Array.isArray(base.order) ? base.order.slice(0, ROOM_MAX) : [],
      turnIdx: Math.max(0, Number(base.turnIdx) || 0),
      round: Math.max(0, Number(base.round) || 0),
      availableAt: Number(base.availableAt) || 0,
      turnDeadline: Number(base.turnDeadline) || 0,
      actorId: String(base.actorId || ''),
      giftQueue: Array.isArray(base.giftQueue)
        ? base.giftQueue.slice(0, 24).map((gift) => ({
          giverId: String(gift?.giverId || ''),
          recipientId: String(gift?.recipientId || ''),
          remaining: Math.max(0, Math.min(4, Number(gift?.remaining) || 0)),
        }))
        : [],
      pendingGrant: base.pendingGrant && typeof base.pendingGrant === 'object'
        ? {
          giverId: String(base.pendingGrant.giverId || ''),
          count: Math.max(0, Math.min(4, Number(base.pendingGrant.count) || 0)),
          candidateIds: Array.isArray(base.pendingGrant.candidateIds)
            ? base.pendingGrant.candidateIds.map(String).slice(0, ROOM_MAX - 1)
            : [],
        }
        : null,
      readySince: Number(base.readySince) || 0,
      finishing: !!base.finishing,
      finishedAt: Number(base.finishedAt) || 0,
      starterSeat: Math.max(0, Number(base.starterSeat) || 0) % ROOM_MAX,
      finishReason: base.finishReason || '',
    };
  }

  readyIds(exceptWs = null) {
    const live = this.liveIds(exceptWs);
    return Object.values(this.players).filter((p) => p.ready && live.has(p.id)).map((p) => p.id);
  }

  // 记下「人已齐备」的时刻：房主久久不开局时，据此把开局权让给在座诸位
  syncReadyGate(exceptWs = null) {
    if (this.meta.status === 'playing') { this.meta.readySince = 0; return; }
    if (this.readyIds(exceptWs).length >= 2) {
      if (!this.meta.readySince) this.meta.readySince = Date.now();
    } else this.meta.readySince = 0;
  }

  // 房主挂机就没人能开局，全房干等——房主离线、或人齐等够 HOST_IDLE_MS，任一已准备者都可开局
  startOpenAt() {
    if (!this.meta.readySince) return 0;
    const host = Object.values(this.players).find((p) => p.seat === 0);
    if (!host || !this.liveIds().has(host.id)) return this.meta.readySince;
    return this.meta.readySince + HOST_IDLE_MS;
  }

  canStartMatch(playerId) {
    const me = this.players[playerId];
    if (!me || !me.ready) return false;
    if (me.seat === 0) return true;
    const openAt = this.startOpenAt();
    return !!openAt && Date.now() >= openAt;
  }

  bumpRevision() {
    this.meta.revision = Math.max(0, Number(this.meta.revision) || 0) + 1;
    return this.meta.revision;
  }

  currentPlayerId() {
    if (this.meta.status !== 'playing' || !this.meta.order.length) return '';
    if (['resolving', 'choosing_grant'].includes(this.meta.phase) && this.meta.actorId) {
      return this.meta.actorId;
    }
    return this.activeGift()?.recipientId || this.regularPlayerId();
  }

  regularPlayerId() {
    if (this.meta.status !== 'playing' || !this.meta.order.length) return '';
    return this.meta.order[this.meta.turnIdx] || '';
  }

  activeGift() {
    return Array.isArray(this.meta.giftQueue) ? (this.meta.giftQueue[0] || null) : null;
  }

  normalizeGiftQueue() {
    if (!this.meta || !this.players) return;
    const activeIds = new Set(Array.isArray(this.meta.order) ? this.meta.order : []);
    this.meta.giftQueue = (Array.isArray(this.meta.giftQueue) ? this.meta.giftQueue : [])
      .filter((gift) => gift
        && Number(gift.remaining) > 0
        && activeIds.has(gift.giverId)
        && activeIds.has(gift.recipientId)
        && this.players[gift.recipientId]
        && !this.players[gift.recipientId].done
        && !this.players[gift.recipientId].away)
      .slice(0, 24)
      .map((gift) => ({
        giverId: String(gift.giverId),
        recipientId: String(gift.recipientId),
        remaining: Math.max(1, Math.min(4, Number(gift.remaining) || 1)),
      }));
    for (const player of Object.values(this.players)) player.bonus = 0;
    const gift = this.activeGift();
    if (gift && this.players[gift.recipientId]) {
      this.players[gift.recipientId].bonus = gift.remaining;
    }
  }

  grantCandidates(giverId) {
    const live = this.liveIds();
    return this.meta.order.filter((id) => {
      const player = this.players[id];
      return id !== giverId && player && !player.done && !player.away && live.has(id);
    });
  }

  // 施者离席、或候选者走空：待施之贈不能把整房卡在择人相位上
  prunePendingGrant() {
    const pending = this.meta.pendingGrant;
    if (!pending) return false;
    if (!this.players[pending.giverId]) { this.meta.pendingGrant = null; return true; }
    pending.candidateIds = pending.candidateIds.filter(
      (id) => this.players[id] && this.meta.order.includes(id));
    if (!pending.candidateIds.length) { this.meta.pendingGrant = null; return true; }
    return false;
  }

  // 施与：入施受队列，随后由受赠者接掷（timing: immediate）
  async assignGrant(giverId, recipientId, count, reason = 'chosen') {
    this.meta.pendingGrant = null;
    this.meta.giftQueue.push({
      giverId, recipientId, remaining: Math.max(1, Math.min(4, Number(count) || 1)),
    });
    if (this.meta.giftQueue.length > 24) this.meta.giftQueue = this.meta.giftQueue.slice(-24);
    this.normalizeGiftQueue();
    this.broadcast({
      type: 'grant_given',
      reason,
      giverId,
      giverName: this.players[giverId]?.name || '同修',
      recipientId,
      recipientName: this.players[recipientId]?.name || '同修',
      count: Math.max(1, Math.min(4, Number(count) || 1)),
    });
    await this.continueOrAdvance();
  }

  // 择人超时：按座次自动施与——取施者之后座次最近的一位在局莲友，规则可预期，不掷骰
  async autoAssignGrant() {
    const pending = this.meta.pendingGrant;
    if (!pending) return;
    const giver = this.players[pending.giverId];
    const listed = new Set(pending.candidateIds);
    const fresh = this.grantCandidates(pending.giverId);
    const pool = fresh.filter((id) => listed.has(id)).length
      ? fresh.filter((id) => listed.has(id))
      : fresh;
    if (!pool.length) {
      this.meta.pendingGrant = null;
      this.broadcast({
        type: 'grant_void', giverId: pending.giverId,
        name: giver?.name || '同修', count: pending.count,
      });
      await this.continueOrAdvance();
      return;
    }
    const giverSeat = Number(giver?.seat || 0);
    const next = pool.slice().sort((a, b) =>
      ((this.players[a].seat - giverSeat + ROOM_MAX) % ROOM_MAX)
      - ((this.players[b].seat - giverSeat + ROOM_MAX) % ROOM_MAX))[0];
    await this.assignGrant(pending.giverId, next, pending.count, 'timeout');
  }

  // 施受队列未尽则由受赠者接着掷，尽了才轮转到下一位
  async continueOrAdvance() {
    this.normalizeGiftQueue();
    if (!this.activeGift()) {
      await this.advanceTurn();
      return;
    }
    const now = Date.now();
    this.meta.phase = 'waiting_toss';
    this.meta.actorId = '';
    this.meta.availableAt = now;
    this.meta.turnDeadline = now + TURN_MS;
    this.bumpRevision();
    await this.save();
    await this.setRoomAlarm();
    this.broadcast({ type: 'turn_started', continuation: true, room: this.roomState(), players: this.roster() });
    this.broadcast(this.syncMsg());
  }

  roomState() {
    return {
      protocolVersion: SFP_PROTOCOL_VERSION,
      revision: this.meta.revision,
      status: this.meta.status,
      phase: this.meta.phase,
      matchId: this.meta.matchId,
      order: this.meta.order.slice(),
      turnId: this.currentPlayerId(),
      turnIdx: this.meta.turnIdx,
      round: this.meta.round,
      availableAt: this.meta.availableAt,
      turnDeadline: this.meta.turnDeadline,
      startOpenAt: this.startOpenAt(),   // 此刻之后，非房主的已准备者也可开局
      gift: this.activeGift() ? { ...this.activeGift() } : null,
      pendingGrant: this.meta.pendingGrant ? {
        giverId: this.meta.pendingGrant.giverId,
        count: this.meta.pendingGrant.count,
        candidateIds: this.meta.pendingGrant.candidateIds.slice(),
      } : null,
      finishing: !!this.meta.finishing,
      finishedAt: this.meta.finishedAt,
      finishReason: this.meta.finishReason || '',
    };
  }

  commandError(ws, code, text, requestId = '') {
    try {
      ws.send(JSON.stringify({
        type: 'command_error', code, text, requestId,
        revision: this.meta.revision, room: this.roomState(),
      }));
    } catch (e) { /* 连接已断 */ }
  }

  async setRoomAlarm(at = this.meta.turnDeadline) {
    if (!at) return;
    try { await this.state.storage.setAlarm(Math.max(Date.now() + 250, at)); } catch (e) { /* 本地测试环境可无 alarm */ }
  }

  randomCombo() {
    const face = () => {
      const bytes = new Uint8Array(1);
      do { crypto.getRandomValues(bytes); } while (bytes[0] >= 252);
      return SFP_FACE_ORDER[bytes[0] % 6];
    };
    return canonicalSfpCombo(face(), face());
  }

  resetPlayerForMatch(p, spectator = false) {
    Object.assign(p, {
      spectator, away: false, skips: 0,
      pos: null, n: 0, bonus: 0, done: false, doneAt: 0, pendingGrantCount: 0, recorded: false,
      lastTossRequestId: '', lastTossEvent: null, lastGrantRequestId: '',
    });
  }

  async startMatch() {
    const ready = Object.values(this.players)
      .filter((p) => p.ready && this.liveIds().has(p.id))
      .sort((a, b) => a.seat - b.seat);
    if (ready.length < 2) return false;

    const starterSeat = this.meta.status === 'finished'
      ? (Number(this.meta.starterSeat || 0) + 1) % ROOM_MAX
      : Number(this.meta.starterSeat || 0) % ROOM_MAX;
    ready.sort((a, b) => ((a.seat - starterSeat + ROOM_MAX) % ROOM_MAX)
      - ((b.seat - starterSeat + ROOM_MAX) % ROOM_MAX));
    const activeIds = new Set(ready.map((p) => p.id));
    for (const p of Object.values(this.players)) {
      this.resetPlayerForMatch(p, !activeIds.has(p.id));
      p.ready = false;
    }
    const now = Date.now();
    Object.assign(this.meta, {
      status: 'playing',
      phase: 'waiting_toss',
      matchId: crypto.randomUUID(),
      order: ready.map((p) => p.id),
      turnIdx: 0,
      round: 1,
      availableAt: now + 3000,
      turnDeadline: now + 3000 + TURN_MS,
      actorId: '',
      giftQueue: [],
      pendingGrant: null,
      finishing: false,
      finishedAt: 0,
      finishReason: '',
      starterSeat,
    });
    this.bumpRevision();
    await this.save();
    await this.setRoomAlarm();
    return true;
  }

  async finishMatch(reason = 'completed') {
    this.meta.status = 'finished';
    this.meta.phase = 'finished';
    this.meta.finishedAt = Date.now();
    this.meta.turnDeadline = 0;
    this.meta.availableAt = 0;
    this.meta.actorId = '';
    this.meta.giftQueue = [];
    this.meta.pendingGrant = null;
    this.meta.finishReason = reason;
    this.normalizeGiftQueue();
    // 本局既已结算，暂离与超时计数一并归零：下一局人人从同一起点准备
    for (const p of Object.values(this.players)) {
      p.ready = false;
      p.pendingGrantCount = 0;
      p.away = false;
      p.skips = 0;
      p.spectator = false;   // 本局已了，旁观身份随之解除：下一局人人可入座
    }
    this.syncReadyGate();
    this.bumpRevision();
    await this.save();
    const event = {
      type: 'match_finished',
      reason,
      winners: this.meta.order.filter((id) => this.players[id]?.done),
      room: this.roomState(),
      players: this.roster(),
    };
    this.broadcast(event);
    this.broadcast(this.syncMsg());
    this.state.waitUntil(this.plazaReport());
    this.state.waitUntil(this.plazaRecordWinners());
  }

  // 共修室的及第由本室出具：掷数与名号都取服务器权威棋况，不采信浏览器自报
  async plazaRecordWinners() {
    const at = tableSeatOf(this.meta.code);
    const winners = this.meta.order
      .map((id) => this.players[id])
      .filter((p) => p && p.done && !p.recorded);
    if (!winners.length) return;
    for (const p of winners) p.recorded = true;
    await this.save();
    for (const p of winners) {
      try {
        await this.env.ROOM.get(this.env.ROOM.idFromName(PLAZA_OBJECT)).fetch(
          'https://plaza.internal/plaza/record-verified',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            // 带上莲号，共修室的及第才记得到本人名下（入座时随 join 带来）
            body: JSON.stringify({
              name: p.name, n: p.n, actor: p.practiceId || '',
              seat: at ? `table:${at.no}` : 'private',
            }),
          },
        );
      } catch (e) { /* 广场暂时不可达不影响本室结算 */ }
    }
  }

  async advanceTurn() {
    if (this.meta.status !== 'playing') return;
    if (this.meta.order.length < 2) {
      await this.finishMatch('not_enough_players');
      return;
    }

    const previousIdx = this.meta.turnIdx;
    let nextIdx = (previousIdx + 1) % this.meta.order.length;
    if (this.meta.finishing && nextIdx === 0) {
      await this.finishMatch('completed');
      return;
    }
    if (nextIdx === 0) this.meta.round++;

    let guard = 0;
    while (guard++ < this.meta.order.length) {
      const next = this.players[this.meta.order[nextIdx]];
      if (next && !next.done && !next.away) break;
      nextIdx = (nextIdx + 1) % this.meta.order.length;
      if (this.meta.finishing && nextIdx === 0) {
        await this.finishMatch('completed');
        return;
      }
      if (nextIdx === 0) this.meta.round++;
    }
    if (guard > this.meta.order.length) {
      await this.finishMatch(this.meta.finishing ? 'completed' : 'not_enough_players');
      return;
    }

    const now = Date.now();
    const nextOnline = this.liveIds().has(this.meta.order[nextIdx]);
    this.meta.turnIdx = nextIdx;
    this.meta.phase = 'waiting_toss';
    this.meta.actorId = '';   // 相位锁解除：候掷相位的当前操作者由施受队列／座次推出
    this.meta.availableAt = now;
    this.meta.turnDeadline = now + (nextOnline ? TURN_MS : DISCONNECT_TURN_MS);
    this.bumpRevision();
    await this.save();
    await this.setRoomAlarm();
    this.broadcast({ type: 'turn_started', room: this.roomState(), players: this.roster() });
    this.broadcast(this.syncMsg());
  }

  async completeCurrentTurn(playerId) {
    if (this.meta.status !== 'playing' || this.currentPlayerId() !== playerId || this.meta.phase !== 'resolving') return false;
    const p = this.players[playerId];
    if (!p) return false;
    p.seenAt = Date.now();
    // 本手掷得的贈掷不归自己（本项目定稿操作规则 grant-ontology v2：giver_selects_other_player）：
    // 判词行毕才请他择人，免得判词卡还没读完就被择人卡压在上面。
    const pending = Math.max(0, Number(p.pendingGrantCount) || 0);
    if (pending > 0) {
      p.pendingGrantCount = 0;
      const candidates = this.grantCandidates(p.id);
      if (candidates.length === 1) {                 // 只剩一位可施者，不必多问一步
        await this.assignGrant(p.id, candidates[0], pending, 'only_candidate');
        return true;
      }
      if (candidates.length > 1) {
        const now = Date.now();
        this.meta.phase = 'choosing_grant';
        this.meta.actorId = p.id;
        this.meta.availableAt = 0;
        this.meta.turnDeadline = now + GIFT_CHOICE_MS;
        this.meta.pendingGrant = { giverId: p.id, count: pending, candidateIds: candidates };
        this.bumpRevision();
        await this.save();
        await this.setRoomAlarm();
        this.broadcast({ type: 'grant_pending', room: this.roomState(), players: this.roster() });
        this.broadcast(this.syncMsg());
        return true;
      }
      // 无人可施：依定稿规则此贈作废（soloPolicy: void_without_recipient），不折回自己续掷
      this.broadcast({ type: 'grant_void', giverId: p.id, name: p.name, count: pending });
    }
    await this.continueOrAdvance();
    return true;
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

  // 珠色跟人不跟座：房主递补时珠色一路不变，免得 3D 珠中途换色认不出人
  freeColor() {
    const used = new Set(Object.values(this.players).map(q => q.color));
    return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0];
  }

  // 房主递补：首位一空，在座者中座次最小者补为房主。
  // 不补的话，房主一走就没人能撤密码——那间室会一直锁着，谁也进不去、谁也解不开。
  promoteHost() {
    const all = Object.values(this.players);
    if (!all.length || all.some(q => q.seat === 0)) return false;
    const next = all.slice().sort((a, b) => a.seat - b.seat)[0];
    next.seat = 0;
    return true;
  }

  // 清废座：显式离席立即删除；意外断线保座九十秒，凭 playerId 可续回同一局。
  sweepSeats() {
    const now = Date.now();
    const live = this.liveIds();
    const currentId = this.currentPlayerId();
    let swept = false;
    for (const q of Object.values(this.players)) {
      const online = live.has(q.id);
      const offGone = !online && now - Number(q.seenAt || 0) > OFFLINE_GRACE;
      if (offGone) { delete this.players[q.id]; swept = true; }
    }
    if (swept) {
      this.promoteHost();
      this.meta.order = this.meta.order.filter((id) => this.players[id]);
      this.meta.giftQueue = (this.meta.giftQueue || []).filter(
        (gift) => this.players[gift.giverId] && this.players[gift.recipientId]);
      if (this.meta.actorId && !this.players[this.meta.actorId]) this.meta.actorId = '';
      if (this.prunePendingGrant() && this.meta.phase === 'choosing_grant') this.meta.phase = 'waiting_toss';
      this.normalizeGiftQueue();
      if (currentId && this.meta.order.includes(currentId)) this.meta.turnIdx = this.meta.order.indexOf(currentId);
      else if (this.meta.order.length) this.meta.turnIdx %= this.meta.order.length;
      else this.meta.turnIdx = 0;
    }
    return swept;
  }

  roster(exceptWs = null) {
    const live = this.liveIds(exceptWs);
    return Object.values(this.players)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        seat: p.seat,
        host: p.seat === 0,
        online: live.has(p.id),
        ready: !!p.ready,
        spectator: !!p.spectator,
        away: !!p.away,
        skips: Math.max(0, Number(p.skips) || 0),
        pos: p.pos || null,
        n: Math.max(0, Number(p.n) || 0),
        bonus: Math.max(0, Number(p.bonus) || 0),
        done: !!p.done,
      }));
  }

  // 向广场推送本桌座次（仅共修室；仅在座次真正变动时调用，不随每掷推）
  async plazaReport(exceptWs = null) {
    const code = this.meta && this.meta.code;
    if (!isTableCode(code)) return;
    const seats = this.roster(exceptWs).map(p => ({
      name: p.name, color: p.color, seat: p.seat, host: p.host,
      n: p.n, done: !!p.done, online: !!p.online, ready: !!p.ready,
      spectator: !!p.spectator, roomStatus: this.meta.status,
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

  // withChat 仅在「初次入座/重连」时为真：只有新到者需要历史聊天。
  // 名单同步（入座/离席/行棋/上锁都会广播）不再夹带整段聊天——
  // 否则每有人掷一轮，全室都要重收上百条聊天、并整段重建聊天 DOM，
  // 既费流量，又会把行棋公报的系统消息一并冲掉（公报刚插入即被 _chatFill 清空）。
  syncMsg(withChat = false, exceptWs = null) {
    // exceptWs：webSocketClose 期间正在关闭的连接仍在 getWebSockets() 里（见 liveIds 注），
    // 名单不排除他就会把断线者广播成 online:true，等候室人数虚高最长九十秒
    const msg = {
      type: 'sync',
      protocolVersion: SFP_PROTOCOL_VERSION,
      revision: this.meta.revision,
      room: this.roomState(),
      players: this.roster(exceptWs),
      locked: !!this.meta.lockHash,
    };
    if (withChat) msg.chat = this.chat.slice(-CHAT_KEEP);
    return msg;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 广场固定对象：只走 SQL，不加载房间态
    if (url.pathname === '/plaza/stat') return this.plazaStat();
    if (url.pathname === '/plaza/tick') return this.plazaTick(request);
    if (url.pathname === '/plaza/record') return this.plazaRecord(request);
    if (url.pathname === '/plaza/me') return this.plazaMine(request);
    // 只对 DO 之间开放：公共 Worker 的 /api/* 路由不会转到这里
    if (url.pathname === '/plaza/record-verified') return this.plazaRecordVerified(request);
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
        room: this.roomState(),
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
        // playerId 用于断线重连；clientToken 防同一浏览器重复点击生成多个“自己”。
        // 同名仍不作为身份依据，避免陌生人冒名覆盖棋况。
        const name = this.safeName(msg.name) || '同修';
        const clientToken = this.safeClientToken(msg.clientToken);
        let p = msg.playerId ? this.players[msg.playerId] : null;
        if (!p && clientToken) {
          p = Object.values(this.players).find((player) => player.clientToken === clientToken) || null;
        }
        if (!p) {
          this.sweepSeats();
          if (Object.keys(this.players).length >= ROOM_MAX) {
            ws.send(JSON.stringify({ type: 'error', code: 'full', text: '此室已满四位同修' }));
            return;
          }
          // 上锁的共修室：须持密码或邀请链接。密码只存加盐哈希，比对也在服务端。
          if (this.meta.lockHash) {
            const now = Date.now();
            if (now - Number(this.meta.triesAt || 0) >= LOCK_WINDOW_MS) {
              this.meta.tries = 0;
              this.meta.triesAt = 0;
            }
            if (Number(this.meta.tries || 0) >= LOCK_MAX_TRIES) {
              ws.send(JSON.stringify({ type: 'error', code: 'locked', text: '此室密码错次过多，暂闭十分钟；请稍后再试' }));
              return;
            }
            const given = await this.keyHash(String(msg.key || ''));
            if (given !== this.meta.lockHash) {
              this.meta.tries = Number(this.meta.tries || 0) + 1;
              this.meta.triesAt = now;
              await this.save();
              ws.send(JSON.stringify({ type: 'error', code: 'needkey', text: '此室已设密码——请凭密码或邀请链接入座' }));
              return;
            }
            this.meta.tries = 0; this.meta.triesAt = 0; // 密码对上，计数归零
          }
          const seat = [0, 1, 2, 3].find(i => !Object.values(this.players).some(q => q.seat === i));
          p = {
            id: crypto.randomUUID(),
            name, seat,
            color: this.freeColor(),
            clientToken,
            ready: false,
            spectator: this.meta.status === 'playing',
            away: false,
            skips: 0,
            ...emptySfpPlayerState(),
          };
          this.players[p.id] = p;
        }
        p.name = name;
        if (clientToken) p.clientToken = clientToken;
        // 莲号（功课身份）：只用来把本室的及第记到本人名下，不作身份凭据
        const practiceId = /^p_[a-f0-9]{24}$/.test(String(msg.practiceId || '')) ? String(msg.practiceId) : '';
        if (practiceId) p.practiceId = practiceId;
        p.away = false;
        p.skips = 0;
        p.seenAt = Date.now();
        ws.serializeAttachment({ playerId: p.id, table: !!att.table });
        this.syncReadyGate();
        this.bumpRevision();
        await this.save();
        ws.send(JSON.stringify({
          type: 'joined',
          protocolVersion: SFP_PROTOCOL_VERSION,
          playerId: p.id,
          seat: p.seat,
          color: p.color,
          host: p.seat === 0,
        }));
        ws.send(JSON.stringify(this.syncMsg(true)));    // 入座/重连者：名单 + 历史聊天
        this.broadcast(this.syncMsg(), ws);             // 其余同修：只更名单（不重发聊天）
        this.state.waitUntil(this.plazaReport());
        break;
      }

      case 'lock': {
        // 设密码／撤密码：只有房主可设。密码由用户自定四位数字；
        // 库中只留加盐哈希（盐＝房号，同一密码在不同室哈希不同），比对亦在服务端。
        const me = this.players[att.playerId];
        if (!me || me.seat !== 0) return;
        if (msg.off) {
          this.meta.lockHash = ''; this.meta.lockBy = ''; this.meta.tries = 0; this.meta.triesAt = 0;
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
        this.meta.triesAt = 0;
        await this.save();
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        ws.send(JSON.stringify({ type: 'locked', locked: true, key })); // 回显自己设的密码，供复制/生成邀请链接
        break;
      }

      case 'ready_set': {
        const me = this.players[att.playerId];
        if (!me) return;
        if (this.meta.status === 'playing') {
          this.commandError(ws, 'match_started', '本局已经开始，请等待共同结算', msg.requestId);
          return;
        }
        me.ready = !!msg.ready;
        me.spectator = false;
        me.away = false;
        me.seenAt = Date.now();
        this.syncReadyGate();
        this.bumpRevision();
        await this.save();
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        break;
      }

      case 'start_match': {
        const me = this.players[att.playerId];
        if (!me) return;
        if (this.meta.status === 'playing') {
          this.commandError(ws, 'already_started', '本局已经开始', msg.requestId);
          return;
        }
        this.syncReadyGate();
        if (!this.canStartMatch(me.id)) {
          this.commandError(ws, 'host_only', '本局由房主开始；房主久未开局时诸位皆可开局', msg.requestId);
          return;
        }
        const ready = Object.values(this.players).filter((p) => p.ready && this.liveIds().has(p.id));
        if (!me.ready || ready.length < 2) {
          this.commandError(ws, 'not_ready', '至少两位在线同修准备后方可开局', msg.requestId);
          return;
        }
        if (!await this.startMatch()) {
          this.commandError(ws, 'not_ready', '至少两位在线同修准备后方可开局', msg.requestId);
          return;
        }
        this.broadcast({ type: 'match_started', room: this.roomState(), players: this.roster() });
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        break;
      }

      case 'toss_request': {
        const p = this.players[att.playerId];
        const requestId = String(msg.requestId || '').slice(0, 80);
        if (!p) return;
        if (!requestId) {
          this.commandError(ws, 'request_id', '掷轮请求缺少编号');
          return;
        }
        if (p.lastTossRequestId === requestId && p.lastTossEvent) {
          try { ws.send(JSON.stringify(p.lastTossEvent)); } catch (e) {}
          return;
        }
        if (this.meta.status !== 'playing') {
          this.commandError(ws, 'not_playing', '本局尚未开始', requestId);
          return;
        }
        if (this.currentPlayerId() !== p.id) {
          this.commandError(ws, 'not_your_turn', '尚未轮到您掷轮', requestId);
          return;
        }
        if (this.meta.phase !== 'waiting_toss') {
          this.commandError(ws, 'resolving', '上一掷正在行棋，请稍候', requestId);
          return;
        }
        if (Date.now() < Number(this.meta.availableAt || 0)) {
          this.commandError(ws, 'countdown', '共同开局倒计时尚未结束', requestId);
          return;
        }
        if (p.done || p.away) {
          this.commandError(ws, 'inactive', '本局中您当前不在行动序列', requestId);
          return;
        }

        const gift = this.activeGift();
        const usingGift = !!(gift && gift.recipientId === p.id);
        const combo = this.randomCombo();
        const resolved = resolveSfpToss(p, combo);
        Object.assign(p, resolved.state, { seenAt: Date.now(), skips: 0, away: false });
        // 受赠之掷：本掷落定即从施受队列扣一枚。队列是唯一的账本，
        // p.bonus 一律由 normalizeGiftQueue 依队列重算，不各记一本。
        if (usingGift) {
          gift.remaining = Math.max(0, Number(gift.remaining) - 1);
          if (!gift.remaining) this.meta.giftQueue.shift();
        }
        // 本掷新得的「贈N掷」记在掷者身上，待判词行毕再请他择一位受赠莲友
        p.pendingGrantCount = p.done ? 0 : Math.max(0, Math.min(4, Number(resolved.grant) || 0));
        this.normalizeGiftQueue();
        if (p.done) this.meta.finishing = true;
        this.meta.phase = 'resolving';
        this.meta.actorId = p.id;  // 相位锁在掷者：施受队列变动不会把「正在行棋的人」挪走
        this.meta.availableAt = 0;
        this.meta.turnDeadline = Date.now() + RESOLVE_MS;
        this.bumpRevision();
        const event = {
          type: 'toss_committed',
          requestId,
          playerId: p.id,
          name: p.name,
          color: p.color,
          combo,
          steps: resolved.steps,
          grant: p.pendingGrantCount,       // 待施与的贈掷数，供判词卡措辞
          usedGift: usingGift,
          player: this.roster().find((q) => q.id === p.id),
          room: this.roomState(),
          players: this.roster(),
        };
        p.lastTossRequestId = requestId;
        p.lastTossEvent = event;
        await this.save();
        await this.setRoomAlarm();
        this.broadcast(event);
        this.broadcast(this.syncMsg());
        const stale = Date.now() - Number(this.meta.reportedAt || 0) > REPORT_REFRESH;
        if (p.n === 1 || p.done || stale) this.state.waitUntil(this.plazaReport());
        break;
      }

      case 'turn_done': {
        const me = this.players[att.playerId];
        if (!me) return;
        if (!await this.completeCurrentTurn(me.id)) {
          this.commandError(ws, 'turn_state', '当前没有待确认的本手', msg.requestId);
        }
        break;
      }

      case 'grant_choose': {
        // 掷得贈掷者择一位同席莲友受之；受赠者在自身所在位续掷（本项目定稿操作规则）
        const me = this.players[att.playerId];
        const requestId = String(msg.requestId || '').slice(0, 80);
        if (!me) return;
        if (requestId && me.lastGrantRequestId === requestId) return; // 重复提交：已办过
        const pending = this.meta.pendingGrant;
        if (this.meta.status !== 'playing' || this.meta.phase !== 'choosing_grant' || !pending) {
          this.commandError(ws, 'no_grant', '此刻没有待施与的贈掷', requestId);
          return;
        }
        if (pending.giverId !== me.id) {
          this.commandError(ws, 'not_giver', '此贈由掷得者施与', requestId);
          return;
        }
        const recipientId = String(msg.recipientId || '');
        if (!pending.candidateIds.includes(recipientId) || !this.players[recipientId]) {
          this.commandError(ws, 'bad_recipient', '这位莲友此刻不能受贈，请另择一位', requestId);
          return;
        }
        me.lastGrantRequestId = requestId;
        await this.assignGrant(me.id, recipientId, pending.count, 'chosen');
        break;
      }

      case 'move':
      case 'restart_self': {
        this.commandError(ws, 'old_protocol', '联机协议已升级，请刷新页面后重新入座', msg.requestId);
        break;
      }


      case 'chat': {
        const p = this.players[att.playerId];
        if (!p) return;
        const now = Date.now();
        if (now - Number(p.chatAt || 0) < CHAT_GAP_MS) {
          this.commandError(ws, 'chat_rate', '说话稍慢一些', msg.requestId);
          return;
        }
        const text = String(msg.text || '').trim().slice(0, 200);
        if (!text) return;
        p.chatAt = now;
        const entry = { id: p.id, name: p.name, color: p.color, text, ts: now };
        this.chat.push(entry);
        if (this.chat.length > CHAT_KEEP) this.chat = this.chat.slice(-CHAT_KEEP);
        await this.save();
        this.broadcast({ type: 'chat', ...entry });
        break;
      }

      case 'wake': {
        // 暂离者自请归队。超时两手即被移出行动序列，在此之前唯一的复活路径是刷新页面重进——
        // 那既无从发现，又白费一次重连；给一条明路，下一轮就能接着掷。
        const me = this.players[att.playerId];
        if (!me) return;
        me.seenAt = Date.now();
        if (!me.away) return;
        me.away = false;
        me.skips = 0;
        this.bumpRevision();
        await this.save();
        this.broadcast({ type: 'player_back', playerId: me.id, name: me.name });
        this.broadcast(this.syncMsg());
        this.state.waitUntil(this.plazaReport());
        break;
      }

      case 'sync': {
        ws.send(JSON.stringify(this.syncMsg(true)));    // 主动求全量：名单 + 聊天
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
    const p = this.players[att.playerId];
    if (p) {
      p.seenAt = Date.now();
      this.syncReadyGate(ws); // 断线者不再计入齐备人数，等候门槛随之回退（排掉正在关闭的连接）
      if (this.meta.status === 'playing' && this.currentPlayerId() === p.id) {
        this.meta.turnDeadline = Math.min(
          Number(this.meta.turnDeadline || Infinity),
          Date.now() + DISCONNECT_TURN_MS,
        );
      }
      this.bumpRevision();
      await this.save();
      await this.setRoomAlarm(this.meta.turnDeadline || (Date.now() + OFFLINE_GRACE));
      this.broadcast(this.syncMsg(false, ws), ws);
      this.state.waitUntil(this.plazaReport(ws));
    }
  }

  async dropPlayer(playerId, ws) {
    if (!playerId || !this.players[playerId]) return;
    const currentId = this.currentPlayerId();
    delete this.players[playerId];
    this.meta.order = this.meta.order.filter((id) => id !== playerId);
    if (!Object.keys(this.players).length) {
      const keep = { createdAt: Date.now(), code: this.meta.code };
      this.meta = this.freshRoomMeta(keep);
      this.chat = [];
    } else {
      this.promoteHost();
      if (this.meta.status === 'playing') {
        // 离席者身上挂着的施受关系一并清掉：施者或受赠者走了，那笔贈掷就不存在了
        this.meta.giftQueue = (this.meta.giftQueue || []).filter(
          (gift) => gift.giverId !== playerId && gift.recipientId !== playerId);
        if (this.meta.actorId === playerId) this.meta.actorId = '';
        const grantGone = this.prunePendingGrant();
        this.normalizeGiftQueue();
        if (this.meta.order.length < 2) {
          await this.finishMatch('not_enough_players');
        } else if (this.meta.phase === 'choosing_grant' && grantGone) {
          // 施者已离席，待施之贈随之作废——不能把全房卡在择人相位上
          this.meta.phase = 'waiting_toss';
          this.meta.turnIdx %= this.meta.order.length;
          this.meta.availableAt = Date.now();
          this.meta.turnDeadline = Date.now() + TURN_MS;
        } else if (currentId === playerId) {
          this.meta.turnIdx %= this.meta.order.length;
          this.meta.phase = 'waiting_toss';
          this.meta.availableAt = Date.now();
          this.meta.turnDeadline = Date.now() + TURN_MS;
        } else if (this.meta.order.includes(currentId)) {
          this.meta.turnIdx = this.meta.order.indexOf(currentId);
        }
      }
    }
    this.syncReadyGate();
    this.bumpRevision();
    await this.save();
    // 同一浏览器若曾因旧版并发入座留下多条连接，离开时一并关闭，避免幽灵连接。
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.playerId !== playerId) continue;
      try { socket.close(1000, 'left'); } catch (e) { /* 已断则忽略 */ }
    }
    this.broadcast(this.syncMsg());
    this.state.waitUntil(this.plazaReport());
  }

  async alarm() {
    await this.load();
    const now = Date.now();
    const live = this.liveIds();

    // 无连接的旧座到期后回收；房间真正空了才清密码和聊天。
    // turnIdx 重映射同 sweepSeats 之例：先记住当前行动者，删完人按其新下标回定——
    // 旧式只在「被删者恰是当前者」时取模，被删者排在当前者之前时轮次会整体前移（偷手），
    // 极端时 turnIdx 越界指空致房间僵死在 playing。
    const currentId = this.currentPlayerId();
    let removed = false;
    for (const p of Object.values(this.players)) {
      if (!live.has(p.id) && now - Number(p.seenAt || 0) >= OFFLINE_GRACE) {
        delete this.players[p.id];
        this.meta.order = this.meta.order.filter((id) => id !== p.id);
        this.meta.giftQueue = (this.meta.giftQueue || []).filter(
          (gift) => gift.giverId !== p.id && gift.recipientId !== p.id);
        if (this.meta.actorId === p.id) this.meta.actorId = '';
        removed = true;
      }
    }
    if (removed) {
      if (currentId && this.meta.order.includes(currentId)) this.meta.turnIdx = this.meta.order.indexOf(currentId);
      else if (this.meta.order.length) this.meta.turnIdx %= this.meta.order.length;
      else this.meta.turnIdx = 0;
      this.promoteHost();
      if (this.prunePendingGrant() && this.meta.phase === 'choosing_grant') this.meta.phase = 'waiting_toss';
      this.normalizeGiftQueue();
    }

    if (!Object.keys(this.players).length) {
      await this.state.storage.deleteAll();
      this.players = {};
      this.meta = this.freshRoomMeta({ code: this.meta.code });
      this.chat = [];
      this.state.waitUntil(this.plazaReport());
      return;
    }

    if (this.meta.status === 'playing' && this.meta.order.length < 2) {
      await this.finishMatch('not_enough_players');
    } else if (this.meta.status === 'playing' && now >= Number(this.meta.turnDeadline || Infinity)) {
      const current = this.players[this.currentPlayerId()];
      if (this.meta.phase === 'choosing_grant') {
        await this.autoAssignGrant();          // 择人超时：按座次自动施与，不让房间停摆
      } else if (this.meta.phase === 'resolving') {
        if (current) await this.completeCurrentTurn(current.id);
      } else if (current) {
        current.skips = Math.max(0, Number(current.skips) || 0) + 1;
        if (current.skips >= 2) current.away = true;
        this.broadcast({
          type: 'turn_skipped',
          playerId: current.id,
          name: current.name,
          away: !!current.away,
        });
        await this.advanceTurn();
      }
    } else {
      this.bumpRevision();
      await this.save();
      this.broadcast(this.syncMsg());
    }

    // 仍有离线保座者时，确保九十秒后能再清一次。
    const nextOffline = Object.values(this.players)
      .filter((p) => !live.has(p.id))
      .map((p) => Number(p.seenAt || now) + OFFLINE_GRACE)
      .sort((a, b) => a - b)[0];
    const candidates = [
      nextOffline,
      this.meta.status === 'playing' ? Number(this.meta.turnDeadline || 0) : 0,
    ].filter((value) => value > now);
    if (candidates.length) await this.setRoomAlarm(Math.min(...candidates));
    this.state.waitUntil(this.plazaReport());
  }
}
