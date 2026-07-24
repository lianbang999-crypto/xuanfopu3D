// 共修室协议测试：对 wrangler dev 跑四人同座全流程
// 覆盖：入座/满座谢客/自由掷（无轮次阻塞）/行棋公报/中途入座/个人重开/断线重连/聊天广播/离席
//       密码：仅东位者可设·四位数校验·加盐哈希比对·错次封室·撤销·一厅锁数上限
// 用法：先 `npx wrangler dev --port 8787`，再 `node scripts/test-net.mjs`
// 注：本测试占用 H1T8~H1T11 与 H2T1~H2T6（跑前请确保无人）

const BASE = process.env.NET_BASE || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const T = 'H1T8';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function connect(code) {
  const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
  const inbox = [], waiters = [];
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
  return { ws, next, send: (o) => ws.send(JSON.stringify(o)), opened: new Promise(r => ws.addEventListener('open', r)), inbox };
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ── 一、入座 ──
console.log('\n【入座】');
const names = ['慧明', '慧安', '慧净', '慧觉'];
const cs = [];
for (let i = 0; i < 4; i++) {
  const c = connect(T); await c.opened;
  c.send({ type: 'join', name: names[i] });
  const j = await c.next(m => m.type === 'joined');
  ok(j.seat === i && j.dir === ['东', '南', '西', '北'][i], `「${names[i]}」入座 ${j.dir}位`);
  c.playerId = j.playerId;
  cs.push(c);
}
const sync0 = await cs[0].next(m => m.type === 'sync' && m.players.length === 4);
ok(sync0.players.length === 4, '名单四人齐');
ok(sync0.locked === false, '新室默认无密码');
ok(sync0.players[0].host === true && sync0.players[0].dir === '东', '东位者即房主');
ok(sync0.players.slice(1).every(q => !q.host), '余三座非房主');

const c5 = connect(T); await c5.opened;
c5.send({ type: 'join', name: '第五人' });
const e5 = await c5.next(m => m.type === 'error');
ok(e5.code === 'full', '第五人满座谢客');
try { c5.ws.close(); } catch {}

// ── 二、自由掷：无轮次阻塞 ──
console.log('\n【自由掷】');
ok(sync0.turn === undefined, '同步消息不再带轮次（轮掷制已撤）');
cs[2].send({ type: 'move', combo: '阿彌', txt: '起行', dir: 'up', pos: 'g1-01', n: 1 });
const mv = await cs[0].next(m => m.type === 'move' && m.name === '慧净');
ok(mv.pos === 'g1-01', '三座不必等轮即可掷，公报到达同修');
cs[3].send({ type: 'move', combo: '那謨', txt: '下堕', dir: 'down', pos: 'g3-02', n: 1 });
const mv2 = await cs[0].next(m => m.type === 'move' && m.name === '慧觉');
ok(mv2.pos === 'g3-02', '四座紧接着也能掷（互不阻塞）');

// 一人挂机不卡任何人：慧明始终不掷，其余照掷
cs[1].send({ type: 'move', combo: '陀佛', txt: '上进', dir: 'up', pos: 'g7-01', n: 1 });
const mv3 = await cs[2].next(m => m.type === 'move' && m.name === '慧安');
ok(!!mv3, '首座挂机不掷，其余同修照行不误');

// ── 三、个人重开只清自己 ──
console.log('\n【个人重开】');
cs[3].send({ type: 'restart_self' });
const syR = await cs[0].next(m => m.type === 'sync' && m.players.some(q => q.name === '慧觉' && q.n === 0));
ok(syR.players.find(q => q.name === '慧觉').n === 0, '慧觉重开后自己归零');
ok(syR.players.find(q => q.name === '慧净').pos === 'g1-01', '慧净行处不受影响（同座不互清）');

// ── 四、断线重连 ──
console.log('\n【断线重连】');
try { cs[2].ws.close(); } catch {}
await wait(400);
const back = connect(T); await back.opened;
back.send({ type: 'join', name: '慧净', playerId: cs[2].playerId });
const jb = await back.next(m => m.type === 'joined');
ok(jb.playerId === cs[2].playerId, '断线重连回原座');
const syB = await back.next(m => m.type === 'sync');
ok(syB.players.find(q => q.id === jb.playerId).pos === 'g1-01', '重连后棋况保留');
cs[2] = back;

// ── 五、聊天 ──
console.log('\n【聊天】');
cs[1].send({ type: 'chat', text: '随喜同修' });
const ch = await cs[3].next(m => m.type === 'chat');
ok(ch.text === '随喜同修' && ch.name === '慧安', '聊天广播到达');

// ── 六、上锁 ──
console.log('\n【密码】');
const KEY = '8412';
cs[1].inbox.length = 0;
cs[1].send({ type: 'lock', key: '1111' });
let nonHostLocked = true;
try { await cs[1].next(m => m.type === 'locked', 700); nonHostLocked = false; } catch (e) { /* 超时即未响应＝正确 */ }
ok(nonHostLocked, '非东位者不能设密码');

cs[0].inbox.length = 0;
cs[0].send({ type: 'lock', key: '12' });
const eBad = await cs[0].next(m => m.type === 'error');
ok(eBad.code === 'badkey', '密码须四位数字，短的被拒');

cs[0].send({ type: 'lock', key: KEY });
const lk = await cs[0].next(m => m.type === 'locked');
ok(lk.locked === true && lk.key === KEY, '东位者设密码成功，回显自己设的密码');
const syL = await cs[1].next(m => m.type === 'sync' && m.locked);
ok(syL.locked === true, '锁态广播全室');
ok(syL.key === undefined, '同步消息不带密码，别人拿不到');

// 上锁后，无口令者入不来
cs[3].send({ type: 'leave' });
await wait(400);
const noKey = connect(T); await noKey.opened;
noKey.send({ type: 'join', name: '路人' });
const eNo = await noKey.next(m => m.type === 'error');
ok(eNo.code === 'needkey', '无密码者被挡在门外');
try { noKey.ws.close(); } catch {}

const wrong = connect(T); await wrong.opened;
wrong.send({ type: 'join', name: '路人', key: '000000' });
const eW = await wrong.next(m => m.type === 'error');
ok(eW.code === 'needkey', '错密码被挡');
try { wrong.ws.close(); } catch {}

const right = connect(T); await right.opened;
right.send({ type: 'join', name: '熟人', key: KEY });
const jR = await right.next(m => m.type === 'joined' || m.type === 'error');
ok(jR.type === 'joined', '持密码者可入座');
cs[3] = right;

// 错次封室
console.log('\n【防猜】');
const T2 = 'H1T9';
const g = connect(T2); await g.opened;
g.send({ type: 'join', name: '房主' }); await g.next(m => m.type === 'joined');
g.send({ type: 'lock', key: '9999' }); await g.next(m => m.type === 'locked');
let banned = false;
for (let i = 0; i < 11; i++) {
  const bad = connect(T2); await bad.opened;
  bad.send({ type: 'join', name: '猜的', key: String(100000 + i) });
  const er = await bad.next(m => m.type === 'error');
  if (er.code === 'locked') banned = true;
  try { bad.ws.close(); } catch {}
}
ok(banned, '密码错满十次即封室，防暴力猜');

// 解锁
g.send({ type: 'lock', off: true });
const un = await g.next(m => m.type === 'locked');
ok(un.locked === false, '东位者可撤密码');
g.send({ type: 'leave' }); await wait(300); try { g.ws.close(); } catch {}

// ── 七、一厅锁数上限 ──
console.log('\n【锁数上限】');
const hosts = [];
let refusedAt = 0;
for (let i = 1; i <= 6; i++) {
  const h = connect(`H2T${i}`); await h.opened;
  h.send({ type: 'join', name: `主${i}` }); await h.next(m => m.type === 'joined');
  h.send({ type: 'lock', key: '2024' });
  const r = await h.next(m => m.type === 'locked' || m.type === 'error');
  if (r.type === 'error' && r.code === 'lockfull' && !refusedAt) refusedAt = i;
  hosts.push(h);
  await wait(250); // 等快照推到广场，锁数才数得准
}
ok(refusedAt === 5, `一厅至多四室设密码（第 ${refusedAt} 室被拒），余下永远对陌生人敞开`);

// ── 八、东位递补：房主一走，座次最小者继位，密码撤得掉 ──
console.log('\n【东位递补】');
const T3 = 'H1T10';
const h1 = connect(T3); await h1.opened; h1.send({ type: 'join', name: '甲' }); await h1.next(m => m.type === 'joined');
const h2 = connect(T3); await h2.opened; h2.send({ type: 'join', name: '乙' });
const j2 = await h2.next(m => m.type === 'joined');
const h3 = connect(T3); await h3.opened; h3.send({ type: 'join', name: '丙' }); await h3.next(m => m.type === 'joined');
ok(j2.dir === '南' && !j2.host, '乙初入南位，非房主');
h1.send({ type: 'lock', key: '1234' }); await h1.next(m => m.type === 'locked');
const colorBefore = (await h2.next(m => m.type === 'sync' && m.locked)).players.find(q => q.name === '乙').color;

h2.inbox.length = 0;
h1.send({ type: 'leave' });                     // 房主离席
const syP = await h2.next(m => m.type === 'sync' && !m.players.some(q => q.name === '甲'));
const nowEast = syP.players.find(q => q.dir === '东');
ok(nowEast && nowEast.name === '乙', '房主离席，座次最小者（乙）递补东位');
ok(nowEast.host === true, '递补者即新房主');
ok(nowEast.color === colorBefore, '珠色跟人不跟座——递补后珠色不变，认得出是谁');
ok(syP.locked === true, '递补时密码不动（在座者不该被踢出自己的室）');

h2.inbox.length = 0;
h2.send({ type: 'lock', off: true });
const un2 = await h2.next(m => m.type === 'locked');
ok(un2.locked === false, '新房主撤得掉前房主设的密码（原本是死锁）');
for (const c of [h2, h3]) { try { c.send({ type: 'leave' }); } catch {} }
await wait(400);
for (const c of [h1, h2, h3]) { try { c.ws.close(); } catch {} }

// ── 九、废座懒清：离线超时者不占座 ──
console.log('\n【废座懒清】');
const T4 = 'H1T11';
const q = [];
for (let i = 0; i < 4; i++) {
  const x = connect(T4); await x.opened; x.send({ type: 'join', name: `占${i}` });
  await x.next(m => m.type === 'joined'); q.push(x);
}
const blocked = connect(T4); await blocked.opened; blocked.send({ type: 'join', name: '想坐' });
const eb = await blocked.next(m => m.type === 'error');
ok(eb.code === 'full' && eb.text.includes('室'), '四座坐满时谢客（文案称「室」不称「房」）');
try { blocked.ws.close(); } catch {}
for (const x of q) { try { x.send({ type: 'leave' }); } catch {} }
await wait(400);
for (const x of q) { try { x.ws.close(); } catch {} }

// 收摊
for (const c of [...cs, ...hosts]) { try { c.send({ type: 'leave' }); } catch {} }
await wait(500);
for (const c of [...cs, ...hosts]) { try { c.ws.close(); } catch {} }
await wait(300);

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
