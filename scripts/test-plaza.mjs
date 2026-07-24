// 共修广场协议测试：对 wrangler dev 跑固定桌 + 广场汇总全流程
// 覆盖：12 张固定桌快照/桌态流转/分厅/掷轮计数/上报上限/及第局录/公报流/
//       共修室中途入座/个人重开只清自己/共修室拒绝全桌重开/座次推送
// 用法：先 `npx wrangler dev --port 8788`，再 `node scripts/test-plaza.mjs`
// 注：桌是全站固定对象，本测试会占用 H1T12（跑前请确保该桌无人）

const BASE = process.env.NET_BASE || 'http://localhost:8788';
const WS_BASE = BASE.replace(/^http/, 'ws');
const TABLE = 'H1T12';

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
  return { ws, next, send: (o) => ws.send(JSON.stringify(o)), opened: new Promise(r => ws.addEventListener('open', r)), inbox };
}

const plaza = () => fetch(`${BASE}/api/plaza`).then(r => r.json());
const table12 = (p) => p.tables.find(t => t.code === TABLE);

// ── 一、广场快照：桌数固定 ──
console.log('\n【广场快照】');
const p0 = await plaza();
ok(p0.tables.length === 12, '广场固定 12 张共修室');
ok(p0.tables.every((t, i) => t.no === i + 1 && t.max === 4 && t.hall === p0.hall), '桌次连续、每桌固定四座、同属一厅');
ok(p0.tables[10].ord === '十一', '桌号以中文序数标名');
ok(table12(p0).state === 'empty', `${TABLE} 起始为空室`);
ok(p0.seatsPerHall === 48, '每厅 48 座（12 桌 × 4）');
ok(p0.tables.every(t => /^H\d+T([1-9]|1[0-2])$/.test(t.code)), '桌号带厅号（H{厅}T{桌}）');
const pH9 = await fetch(`${BASE}/api/plaza?hall=9`).then(r => r.json());
ok(pH9.hall === 9 && pH9.tables.length === 12 && pH9.tables[0].code === 'H9T1', '可指定厅号，任何厅都是 12 张桌');

// ── 二、掷轮计数 ──
console.log('\n【掷轮计数】');
const tick = (n) => fetch(`${BASE}/api/plaza/tick`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n }),
}).then(r => r.json());
const base = p0.tosses;
await tick(5);
const afterTick = await tick(3);
ok(afterTick.tosses === base + 8, '掷轮数累加（5+3）');
const capped = await tick(9999);
ok(capped.tosses === base + 8 + 60, '单次上报封顶 60 掷，防灌爆');
const p1 = await plaza();
ok(p1.tossesToday >= 68, '今日掷轮数同步累加');
await tick(-5);
const p1b = await plaza();
ok(p1b.tosses === p1.tosses, '负数上报不减总数');

// ── 三、及第局录 ──
console.log('\n【及第局录】');
const winsBefore = p1b.wins;
const rec = await fetch(`${BASE}/api/plaza/record`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: '慧明', n: 31, doors: [1, 3, 3, 8, 15], lowest: '無間地獄', span: 27, path: 'rise', seat: 'table:12' }),
}).then(r => r.json());
ok(rec.wins === winsBefore + 1, '及第次数累加');
const p2 = await plaza();
const run = p2.runs[0];
ok(run && run.name === '慧明' && run.n === 31, '及第录首条为最新一局');
ok(JSON.stringify(run.doors) === JSON.stringify([1, 3, 8, 15]), '历经门号去重升序');
ok(run.lowest === '無間地獄' && run.span === 27, '最深落处与历经位次数留存');
ok(p2.feed[0] && p2.feed[0].text.includes('慧明') && p2.feed[0].text.includes('31'), '公报流生成及第公告');
const bad = await fetch(`${BASE}/api/plaza/record`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: '越界', n: 5, doors: [99, 0, 7], span: 1, path: 'x', seat: 'table:99' }),
}).then(r => r.json());
ok(bad.ok, '非法字段被夹取而非报错');
const p2b = await plaza();
ok(JSON.stringify(p2b.runs[0].doors) === JSON.stringify([7]), '越界门号被剔除');
ok(p2b.runs[0].path === 'rise' && p2b.runs[0].seat === 'solo', '非法 path/seat 落回缺省值');

// ── 四、共修室：坐下即行、中途可入 ──
console.log('\n【共修室 · 自由掷】');
const a = connect(TABLE); await a.opened;
a.send({ type: 'join', name: '甲同修' });
const ja = await a.next(m => m.type === 'joined');
ok(ja.seat === 0, '首位入座 seat=0');

const pT = await plaza();
ok(table12(pT).state === 'waiting' && table12(pT).live === 1, '有人未起行＝候莲友');

a.send({ type: 'move', combo: '阿彌', txt: '起行', dir: 'up', pos: 'g1-01', n: 1 });
await new Promise(r => setTimeout(r, 200));
const pP = await plaza();
ok(table12(pP).state === 'playing', '有人已掷＝行谱中');
ok(table12(pP).seats[0].n === 1 && table12(pP).seats[0].name === '甲同修', '桌上可见在座者名号与掷数');

// 关键：共修室不设开局闸——即便发过 start，后来者仍可入座
a.send({ type: 'start' });
await new Promise(r => setTimeout(r, 200));
const b = connect(TABLE); await b.opened;
b.send({ type: 'join', name: '乙同修' });
const jb = await b.next(m => m.type === 'joined' || m.type === 'error');
ok(jb.type === 'joined', '共修室中途可入座（不再谢客）');
ok(jb.seat === 1, '后来者落次座');

// ── 五、个人重开只清自己 ──
console.log('\n【个人重开】');
b.send({ type: 'move', combo: '那謨', txt: '下堕', dir: 'down', pos: 'g3-04', n: 1 });
await a.next(m => m.type === 'move' && m.name === '乙同修');
b.send({ type: 'restart_self' });
const syR = await a.next(m => m.type === 'sync' && m.players.some(q => q.name === '乙同修' && q.n === 0));
const meA = syR.players.find(q => q.name === '甲同修');
const meB = syR.players.find(q => q.name === '乙同修');
ok(meB.n === 0 && !meB.pos, '乙重开后自己归零');
ok(meA.n === 1 && meA.pos === 'g1-01', '甲的行处不受影响（同桌不互清）');

// 共修室拒绝全桌重开
b.inbox.length = 0;
b.send({ type: 'restart' });
let refused = true;
try { await b.next(m => m.type === 'restarted', 700); refused = false; } catch (e) { /* 超时即未广播＝正确 */ }
ok(refused, '共修室拒绝全桌重开（陌生人行处不可被他人一键归零）');

// ── 六、满座 ──
console.log('\n【满座】');
const c = connect(TABLE); await c.opened; c.send({ type: 'join', name: '丙同修' }); await c.next(m => m.type === 'joined');
const d = connect(TABLE); await d.opened; d.send({ type: 'join', name: '丁同修' }); await d.next(m => m.type === 'joined');
await new Promise(r => setTimeout(r, 200));
const pF = await plaza();
ok(table12(pF).state === 'full' && table12(pF).live === 4, '四座坐满＝满座');
const e = connect(TABLE); await e.opened; e.send({ type: 'join', name: '戊同修' });
const je = await e.next(m => m.type === 'joined' || m.type === 'error');
ok(je.type === 'error' && je.code === 'full', '第五人满座谢客');

// ── 七、断线即释放座位（不留僵尸座）──
console.log('\n【断线释放】');
for (const cli of [a, b, c]) { cli.send({ type: 'leave' }); }
await new Promise(r => setTimeout(r, 400));
try { d.ws.close(); } catch {}                       // 丁不发 leave，直接断线
await new Promise(r => setTimeout(r, 600));
const pDrop = await plaza();
ok(table12(pDrop).live === 0, '直接断线（未发 leave）也释放座位，不留僵尸座');

for (const cli of [a, b, c, d, e]) { try { cli.ws.close(); } catch {} }
await new Promise(r => setTimeout(r, 300));
const pEnd = await plaza();
ok(table12(pEnd).live === 0, '全员离席后桌位释放');
ok(pEnd.tables.every(t => t.state === 'empty'), '本厅无人时全部归空室（快照已清）');

// ── 八、非广场房号不上广场 ──
console.log('\n【非广场房号】');
const pv = connect('9042'); await pv.opened;   // 旧式 4 位房号：仍连得上，但不属任何厅
pv.send({ type: 'join', name: '房内同修' });
await pv.next(m => m.type === 'joined');
await new Promise(r => setTimeout(r, 300));
const pPriv = await plaza();
ok(pPriv.tables.every(t => t.live === 0), '非广场房号的在座者不会漏进广场桌位');
pv.send({ type: 'leave' });
await new Promise(r => setTimeout(r, 200));
try { pv.ws.close(); } catch {}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
