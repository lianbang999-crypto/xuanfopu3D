// 终局规则端到端验证（2026-08-04 用户定案）。用法：先 `npx wrangler dev --port 8787`，再 `npm run test:finish-rule`。
// 轮询式驱动（主动 sync 快照+旁路留档 match_finished），无消息时序依赖——消息流驱动在真网络下会滞旧卡死。
// 验：
// ① 先成佛者不终局，另一位继续行谱，末位成佛才共同结算（reason=completed，两位皆列名）；
// ② 成佛手不发 turn_done，服务器当即自动交轮（无 60 秒硬等）；
// ③ 先成佛者离席后余者独行至圆满，名录快照仍列其名。
import { SFP_PROTOCOL_VERSION } from '../src/sfp-engine.js';

const BASE = process.env.NET_BASE || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

let passed = 0, failed = 0;
const ok = (c, name) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.error(`  ✗ ${name}`); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const rid = (p) => `${p}:${crypto.randomUUID()}`;

function connect(code) {
  const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
  const inbox = []; const waiters = []; const finishes = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'match_finished') finishes.push(m);   // 结算事件旁路留档（champions 断言用）
    const i = waiters.findIndex(w => w.test(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m);
  });
  const next = (test, timeoutMs = 8000) => new Promise((resolve, reject) => {
    const i = inbox.findIndex(test);
    if (i >= 0) { resolve(inbox.splice(i, 1)[0]); return; }
    const w = { test, resolve }; waiters.push(w);
    setTimeout(() => { const j = waiters.indexOf(w); if (j >= 0) { waiters.splice(j, 1); reject(new Error('等消息超时')); } }, timeoutMs);
  });
  return { ws, inbox, finishes, next, send: (m) => ws.send(JSON.stringify(m)), opened: new Promise(r => ws.addEventListener('open', r)) };
}
async function join(code, name) {
  const c = connect(code); await c.opened;
  c.send({ type: 'join', protocolVersion: SFP_PROTOCOL_VERSION, name, playerId: null, key: '', clientToken: '' });
  const j = await c.next(m => m.type === 'joined' || m.type === 'error');
  if (j.type !== 'joined') throw new Error('入座失败: ' + JSON.stringify(j));
  c.playerId = j.playerId;
  return c;
}
// 主动求全量快照（丢弃积压，无滞旧）
async function snap(c) {
  c.inbox.length = 0;
  c.send({ type: 'sync' });
  return await c.next(m => m.type === 'sync');
}
async function playMatch({ clients, leaveOnFirstDone = false }) {
  const byId = Object.fromEntries(clients.map(c => [c.playerId, c]));
  let firstDoneId = '', autoAdvanceMs = -1, tossesAfterFirstDone = 0, leftSent = false;
  const alive = () => clients.filter(c => !leftSent || c.playerId !== firstDoneId);
  for (let step = 0; step < 1200; step++) {
    const observer = alive()[0];
    const s = await snap(observer);
    if (s.room.status === 'finished') {
      const fin = clients.flatMap(c => c.finishes).find(f => f.room?.matchId === s.room.matchId) || clients.flatMap(c => c.finishes).at(-1);
      return { fin, firstDoneId, autoAdvanceMs, tossesAfterFirstDone, leftSent };
    }
    if (s.room.status !== 'playing') { await wait(150); continue; }
    if (Date.now() < Number(s.room.availableAt || 0)) { await wait(Number(s.room.availableAt) - Date.now() + 60); continue; }
    if (s.room.phase !== 'waiting_toss') { await wait(150); continue; }
    const turnId = s.room.turnId;
    const c = byId[turnId];
    if (!c || (leftSent && turnId === firstDoneId)) { await wait(200); continue; }
    c.inbox.length = 0;
    c.send({ type: 'toss_request', requestId: rid('toss') });
    const ev = await c.next(m => (m.type === 'toss_committed' && m.playerId === c.playerId) || m.type === 'command_error', 8000)
      .catch(() => null);
    if (!ev || ev.type === 'command_error') { await wait(150); continue; }
    if (firstDoneId && !ev.player?.done) tossesAfterFirstDone++;
    if (ev.player?.done) {
      if (!firstDoneId) {
        firstDoneId = ev.playerId;
        // 成佛手不发 turn_done：量服务器自动交轮的时延（下一拍 waiting_toss 或收局）
        const t0 = Date.now();
        for (let i = 0; i < 40; i++) {
          const s2 = await snap(alive()[0]);
          if (s2.room.status === 'finished' || (s2.room.phase === 'waiting_toss' && s2.room.turnId !== firstDoneId)) { autoAdvanceMs = Date.now() - t0; break; }
          await wait(120);
        }
        if (leaveOnFirstDone) { c.send({ type: 'leave', requestId: rid('leave') }); leftSent = true; await wait(250); }
      }
      continue; // done 手不发 turn_done（客户端新契约：服务器已代为交轮）
    }
    c.send({ type: 'turn_done', requestId: rid('done') });
    await wait(30);
  }
  throw new Error('1200 步仍未终局');
}

// ── 局一 ──
console.log('\n【局一 · 先成佛者不终局，末位成佛才结算】');
const CODE = 'R' + String(Math.floor(1000 + Math.random() * 9000));
const A = await join(CODE, '慧甲');
const B = await join(CODE, '慧乙');
for (const c of [A, B]) c.send({ type: 'ready_set', ready: true, requestId: rid('r') });
await wait(300);
A.send({ type: 'start_match', requestId: rid('s') });
await wait(400);
const r1 = await playMatch({ clients: [A, B] });
ok(!!r1.firstDoneId, '有人先成佛');
ok(r1.autoAdvanceMs >= 0 && r1.autoAdvanceMs < 8000, `成佛手未发 turn_done，服务器自动交轮（${r1.autoAdvanceMs}ms，非 60 秒硬等）`);
ok(r1.tossesAfterFirstDone > 0, `先成佛后另一位继续行谱（又掷 ${r1.tossesAfterFirstDone} 手）`);
ok(r1.fin?.reason === 'completed', `末位成佛后共同结算（reason=${r1.fin?.reason}）`);
ok((r1.fin?.winners || []).length === 2, `两位皆列名成佛（${r1.fin?.winners?.length} 位）`);
ok(Array.isArray(r1.fin?.champions) && r1.fin.champions.length === 2 && r1.fin.champions.every(x => x.name && x.n > 0),
  '名录快照带名号与掷数');

// ── 局二 ──
console.log('\n【局二 · 先成佛者离席，余者独行至圆满】');
for (const c of [A, B]) { c.finishes.length = 0; c.send({ type: 'ready_set', ready: true, requestId: rid('r') }); }
await wait(300);
A.send({ type: 'start_match', requestId: rid('s') });
await wait(400);
const r2 = await playMatch({ clients: [A, B], leaveOnFirstDone: true });
ok(r2.leftSent, '先成佛者已离席');
ok(r2.tossesAfterFirstDone > 0, `离席后余者仍继续行谱（又掷 ${r2.tossesAfterFirstDone} 手），未被判中止`);
ok(r2.fin?.reason === 'completed', `末位成佛后结算缘由为圆满（reason=${r2.fin?.reason}）`);
ok((r2.fin?.champions || []).length === 2, `名录列全两位成佛者（含已离席者，${r2.fin?.champions?.length} 位）`);

console.log(`\n通过 ${passed} · 失败 ${failed}`);
try { A.ws.close(); } catch {}
try { B.ws.close(); } catch {}
process.exit(failed ? 1 : 0);
