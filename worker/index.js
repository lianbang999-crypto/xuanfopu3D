// 选佛谱联机后端 · Cloudflare Worker + Durable Object
// 职责：房间制（最多 4 人）实时联机（WebSocket）+ 在线聊天 + 断线重连恢复
// 规则判定全部在客户端依原谱数据进行；服务端只做名单、轮次、转发与留存，不改动任何谱义。

const ROOM_MAX = 4;                 // 原谱多人局：至多四位同修
const CHAT_KEEP = 120;              // 聊天留存条数（重连可回看）
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 去易混字符的房号字母表
const PLAYER_COLORS = ['#e8c766', '#96e1d6', '#d98873', '#b9a7e0']; // 金·青·赭·藕——四位同修珠色
const ASK_INTERNAL_URL = 'https://ask.internal/v1/ask';

function newCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- 问义 API：同域入口 → Cloudflare Service Binding → 经据智能体 ----
    if (path === '/api/ask') return proxyAsk(request, env);

    // ---- 联机 API ----
    if (path === '/api/room/new') {
      // 开新房：房号即 DO 名；先探测避免撞号（撞上已开局的房则换号）
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const probe = await stub.fetch('https://room/probe');
        const st = await probe.json();
        if (st.empty) return json({ code });
      }
      return json({ error: 'busy' }, 503);
    }

    const mWs = path.match(/^\/api\/room\/([A-Z0-9]{4,8})\/ws$/i);
    if (mWs) {
      const code = mWs[1].toUpperCase();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(request);
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
  }

  async load() {
    if (this.players) return;
    this.players = (await this.state.storage.get('players')) || {};
    this.meta = (await this.state.storage.get('meta')) || { started: false, order: [], turnIdx: 0, createdAt: Date.now() };
    this.chat = (await this.state.storage.get('chat')) || [];
  }

  async save() {
    await this.state.storage.put({ players: this.players, meta: this.meta, chat: this.chat });
  }

  liveIds() {
    // 在线连接的 playerId 集合（休眠恢复也数得到）
    const ids = new Set();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.playerId) ids.add(att.playerId);
    }
    return ids;
  }

  roster() {
    const live = this.liveIds();
    return Object.values(this.players)
      .sort((a, b) => a.seat - b.seat)
      .map(p => ({ ...p, online: live.has(p.id) }));
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
      started: this.meta.started,
      turn: this.meta.started ? this.meta.order[this.meta.turnIdx] : null,
      chat: this.chat.slice(-CHAT_KEEP),
    };
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    if (url.pathname === '/probe') {
      return json({
        empty: Object.keys(this.players).length === 0,
        count: Object.keys(this.players).length,
        started: this.meta.started,
        online: this.liveIds().size,
      });
    }

    // WebSocket 升级
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // 休眠式 WebSocket：DO 空闲时可休眠省费，消息到来自动唤醒
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ playerId: null });
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
        // 入座或重连：同名同座恢复；满四人谢客
        const name = String(msg.name || '').trim().slice(0, 12) || '同修';
        let p = msg.playerId ? this.players[msg.playerId] : null;
        if (!p) p = Object.values(this.players).find(q => q.name === name && !this.liveIds().has(q.id)) || null;
        if (!p) {
          if (Object.keys(this.players).length >= ROOM_MAX) {
            ws.send(JSON.stringify({ type: 'error', code: 'full', text: '此房已满四位同修' }));
            return;
          }
          if (this.meta.started) {
            ws.send(JSON.stringify({ type: 'error', code: 'started', text: '此局已开——请开新房或候下一局' }));
            return;
          }
          const seat = [0, 1, 2, 3].find(i => !Object.values(this.players).some(q => q.seat === i));
          p = {
            id: crypto.randomUUID().slice(0, 8),
            name, seat,
            color: PLAYER_COLORS[seat],
            pos: null, n: 0, done: false,
          };
          this.players[p.id] = p;
        }
        ws.serializeAttachment({ playerId: p.id });
        await this.save();
        ws.send(JSON.stringify({ type: 'joined', playerId: p.id, seat: p.seat, color: p.color }));
        this.broadcast(this.syncMsg());
        break;
      }

      case 'start': {
        // 开局：房主（0 号座）宣局；座次即轮次，从首座起掷
        const me = this.players[att.playerId];
        if (!me || me.seat !== 0 || this.meta.started) return;
        this.meta.started = true;
        this.meta.order = this.roster().map(p => p.id);
        this.meta.turnIdx = 0;
        await this.save();
        this.broadcast({ type: 'started' });
        this.broadcast(this.syncMsg());
        break;
      }

      case 'move': {
        // 行棋公报：客户端依原谱判定后报结果，服务端记账并转发
        const p = this.players[att.playerId];
        if (!p) return;
        p.pos = msg.pos ?? p.pos;
        p.n = msg.n ?? p.n;
        if (msg.done) p.done = true;
        await this.save();
        this.broadcast({
          type: 'move', playerId: p.id, name: p.name, color: p.color,
          combo: msg.combo, txt: msg.txt, dir: msg.dir, pos: p.pos, n: p.n, done: p.done,
        }, ws);
        this.broadcast(this.syncMsg());
        break;
      }

      case 'end_turn': {
        // 轮次交接：跳过已及第与已离席的同修
        const cur = this.meta.order[this.meta.turnIdx];
        if (cur !== att.playerId || !this.meta.started) return;
        const n = this.meta.order.length;
        for (let step = 1; step <= n; step++) {
          const idx = (this.meta.turnIdx + step) % n;
          const pid = this.meta.order[idx];
          const q = this.players[pid];
          if (q && !q.done) { this.meta.turnIdx = idx; break; }
        }
        await this.save();
        this.broadcast(this.syncMsg());
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
    if (att.playerId) this.broadcast(this.syncMsg(), ws);
    // 房间无人且未开局超过一天由 Cloudflare 自然回收（storage 留着供重连）
    if (this.liveIds().size === 0 && !this.meta.started) {
      await this.state.storage.deleteAll();
      this.players = {}; this.meta = { started: false, order: [], turnIdx: 0, createdAt: Date.now() }; this.chat = [];
    }
  }

  async dropPlayer(playerId, ws) {
    if (!playerId || !this.players[playerId]) return;
    const wasTurn = this.meta.order[this.meta.turnIdx] === playerId;
    delete this.players[playerId];
    this.meta.order = this.meta.order.filter(id => id !== playerId);
    if (this.meta.order.length === 0) { this.meta.started = false; this.meta.turnIdx = 0; }
    else if (wasTurn) this.meta.turnIdx = this.meta.turnIdx % this.meta.order.length;
    else this.meta.turnIdx = Math.max(0, this.meta.order.indexOf(this.meta.order[this.meta.turnIdx] || this.meta.order[0]));
    await this.save();
    try { ws.close(1000, 'left'); } catch (e) { /* 已断则忽略 */ }
    this.broadcast(this.syncMsg());
  }
}
