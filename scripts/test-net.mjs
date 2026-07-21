// 联机协议测试：对 wrangler dev（localhost:8787）跑四人房全流程
// 覆盖：开房/入房/满员谢客/开局轮次/行棋公报/交轮/及第跳轮/聊天广播/离房/再来一局（restart）
// 用法：先 `npm run server`，再 `node scripts/test-net.mjs`

const BASE = process.env.NET_BASE || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function connect(code) {
  const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    const w = waiters.findIndex(f => f.test(m));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(m);
    else inbox.push(m);
  });
  const next = (test, ms = 4000) => new Promise((resolve, reject) => {
    const i = inbox.findIndex(test);
    if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
    const f = { test, resolve };
    waiters.push(f);
    setTimeout(() => { const j = waiters.indexOf(f); if (j >= 0) { waiters.splice(j, 1); reject(new Error('等消息超时')); } }, ms);
  });
  const send = (o) => ws.send(JSON.stringify(o));
  const opened = new Promise(r => ws.addEventListener('open', r));
  return { ws, next, send, opened, inbox };
}

const r = await fetch(`${BASE}/api/room/new`).then(x => x.json());
console.log(`开房：${r.code}`);
ok(/^[A-Z0-9]{4}$/.test(r.code || ''), '开房返回房号');

// 四人入座
const names = ['慧明', '慧安', '慧净', '慧觉'];
const cs = [];
for (let i = 0; i < 4; i++) {
  const c = connect(r.code);
  await c.opened;
  c.send({ type: 'join', name: names[i] });
  const j = await c.next(m => m.type === 'joined');
  c.playerId = j.playerId; c.seat = j.seat; c.name = names[i];
  ok(j.seat === i, `「${names[i]}」入座 seat=${j.seat}`);
  cs.push(c);
}
const sync0 = await cs[0].next(m => m.type === 'sync' && m.players.length === 4);
ok(sync0.players.length === 4, '名单四人齐');

// 第五人应被谢客
const c5 = connect(r.code);
await c5.opened;
c5.send({ type: 'join', name: '第五人' });
const e5 = await c5.next(m => m.type === 'error');
ok(e5.code === 'full', '第五人满员谢客');
c5.ws.close();

// 非房主不能开局；房主开局
cs[1].send({ type: 'start' });
await new Promise(rr => setTimeout(rr, 300));
cs[0].send({ type: 'start' });
await cs[2].next(m => m.type === 'started');
const sy1 = await cs[2].next(m => m.type === 'sync' && m.started);
ok(sy1.turn === cs[0].playerId, '开局后轮到首座');

// 首座行棋 + 交轮 → 轮到次座；其余人收到公报
cs[0].send({ type: 'move', combo: '那那', txt: '起行 · 因地「盲龜」', dir: 'start', pos: 'g1-01', n: 1 });
const mv = await cs[3].next(m => m.type === 'move');
ok(mv.pos === 'g1-01' && mv.name === '慧明', '行棋公报到达同修');
cs[0].send({ type: 'end_turn' });
const sy2 = await cs[1].next(m => m.type === 'sync' && m.turn === cs[1].playerId);
ok(sy2.turn === cs[1].playerId, '交轮到次座');

// 次座及第（done）→ 交轮应跳过其后一切 done 者
cs[1].send({ type: 'move', combo: '佛佛', txt: '选佛及第', dir: 'pure', pos: 'g15-fo', n: 9, done: true });
cs[1].send({ type: 'end_turn' });
const sy3 = await cs[2].next(m => m.type === 'sync' && m.turn === cs[2].playerId);
ok(sy3.turn === cs[2].playerId, '及第者交轮到三座');
cs[2].send({ type: 'end_turn' });
const sy4 = await cs[3].next(m => m.type === 'sync' && m.turn === cs[3].playerId);
ok(sy4.turn === cs[3].playerId, '三座交轮到四座');
cs[3].send({ type: 'end_turn' });
const sy5 = await cs[0].next(m => m.type === 'sync' && m.turn === cs[0].playerId);
ok(sy5.turn === cs[0].playerId, '四座交轮回首座（跳过已及第的次座）');

// 聊天广播
cs[2].send({ type: 'chat', text: '南無阿彌陀佛，随喜慧安及第！' });
const ch = await cs[0].next(m => m.type === 'chat');
ok(ch.text.includes('随喜') && ch.name === '慧净', '聊天广播到达');

// 断线重连：关１号连接后重入，棋况仍在
cs[0].ws.close();
await new Promise(rr => setTimeout(rr, 400));
const c0b = connect(r.code);
await c0b.opened;
c0b.send({ type: 'join', name: '慧明', playerId: cs[0].playerId });
const jb = await c0b.next(m => m.type === 'joined');
ok(jb.playerId === cs[0].playerId, '断线重连回原座');
const syb = await c0b.next(m => m.type === 'sync');
const me = syb.players.find(p => p.id === jb.playerId);
ok(me && me.pos === 'g1-01', '重连后棋况保留');

// 再来一局：非房主发起应被拒；房主发起→全房回等候室（started=false、棋况清零、可再开局）
cs[2].send({ type: 'restart' });
let nonHostRejected = true;
try { await cs[3].next(m => m.type === 'restarted', 700); nonHostRejected = false; } catch (e) { /* 超时即未广播＝正确 */ }
ok(nonHostRejected, '非房主重开被拒');
cs[2].inbox.length = 0; cs[3].inbox.length = 0; // 清残留旧 sync：入座阶段的 !started sync 会与重开后的混淆
c0b.send({ type: 'restart' });
const rs = await cs[3].next(m => m.type === 'restarted');
ok(!!rs, '房主重开广播到达全房');
const syr = await cs[2].next(m => m.type === 'sync' && !m.started);
ok(syr.players.every(p => !p.pos && !p.done && p.n === 0), '重开后全房棋况清零（座次保留）');
ok(syr.players.length === 4, '重开不散房');
// 重开后可再开局，轮次从首座起
c0b.send({ type: 'start' });
const st2 = await cs[1].next(m => m.type === 'started');
ok(!!st2, '重开后房主可再开局');
const syf = await cs[1].next(m => m.type === 'sync' && m.started);
ok(syf.turn === cs[0].playerId, '再开局轮到首座');

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
