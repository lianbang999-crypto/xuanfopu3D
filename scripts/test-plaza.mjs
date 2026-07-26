// 共修广场协议测试：对 wrangler dev 跑固定桌 + 广场汇总全流程
// 覆盖：12 张固定桌快照/桌态流转/分厅/掷轮计数/上报上限/及第局录/公报流/
//       共同准备开局/中途入座转旁观/断线保座/共同状态与座次推送
// 用法：先 `npx wrangler dev --port 8788`，再 `node scripts/test-plaza.mjs`
// 注：桌是全站固定对象，默认占用 H1T12；可用 PLAZA_TEST_TABLE 指定一张空桌。

const BASE = process.env.NET_BASE || 'http://localhost:8788';
const WS_BASE = BASE.replace(/^http/, 'ws');
const TABLE = String(process.env.PLAZA_TEST_TABLE || 'H1T12').toUpperCase();
const TEST_HALL = Number(/^H(\d+)T/.exec(TABLE)?.[1] || 1);

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

const plaza = () => fetch(`${BASE}/api/plaza?hall=${TEST_HALL}`).then(r => r.json());
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
const ACTOR_A = 'p_aaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR_B = 'p_bbbbbbbbbbbbbbbbbbbbbbbb';
const tick = (n, actor = ACTOR_A, name = '慧明') => fetch(`${BASE}/api/plaza/tick`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n, actor, name }),
}).then(r => r.json());
const base = p0.tosses;
await tick(5);
const afterTick = await tick(3);
ok(afterTick.tosses === base + 8, '掷轮数累加（5+3）');
const capped = await tick(9999);
ok(capped.tosses === base + 8 + 60, '单次上报封顶 60 掷，防灌爆');
const p1 = await plaza();
ok(p1.tossesToday >= 68, '今日掷轮数同步累加');
const practiceA = p1.practiceLeaders.find(row => row.name.startsWith('慧明'));
ok(practiceA && practiceA.tosses >= 68, '每日功课榜按实际掷轮总数累计');
await tick(4, ACTOR_B, '慧明');
const p1SameName = await plaza();
ok(p1SameName.practicePeople >= 2, '同名莲友按匿名身份分别记功课，不会错误合并');
const sameNameRows = p1SameName.practiceLeaders.filter(row => row.name.startsWith('慧明 · '));
ok(sameNameRows.length >= 2 && new Set(sameNameRows.map(row => row.name)).size === sameNameRows.length, '同名功课用匿名尾号清楚区分');
ok(p1SameName.practiceLeaders.every(row => !('actor' in row)), '榜单接口不公开匿名身份');
await tick(-5);
const p1b = await plaza();
ok(p1b.tosses === p1SameName.tosses, '负数上报不减总数');

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
const leader = p2.leaders.find(row => row.name === '慧明');
const todayLeader = p2.leadersToday.find(row => row.name === '慧明');
ok(leader && leader.wins >= 1 && leader.best <= 31, '及第录仍保留近局聚合统计');
ok(todayLeader && todayLeader.wins >= 1 && p2.rankedRuns >= 1, '今日及第统计与样本数同步返回');
const bad = await fetch(`${BASE}/api/plaza/record`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: '越界', n: 5, doors: [99, 0, 7], span: 1, path: 'x', seat: 'table:99' }),
}).then(r => r.json());
ok(bad.ok, '非法字段被夹取而非报错');
const p2b = await plaza();
ok(JSON.stringify(p2b.runs[0].doors) === JSON.stringify([7]), '越界门号被剔除');
ok(p2b.runs[0].path === 'rise' && p2b.runs[0].seat === 'solo', '非法 path/seat 落回缺省值');

// ── 四、共修室：共同准备后才开局 ──
console.log('\n【共修室 · 共同开局】');
const a = connect(TABLE); await a.opened;
a.send({ type: 'join', protocolVersion: 2, name: '甲同修' });
const ja = await a.next(m => m.type === 'joined');
await a.next(m => m.type === 'sync');
ok(ja.seat === 0, '首位入座 seat=0');

const b = connect(TABLE); await b.opened;
b.send({ type: 'join', protocolVersion: 2, name: '乙同修' });
const jb = await b.next(m => m.type === 'joined');
await b.next(m => m.type === 'sync');
ok(jb.seat === 1, '第二位成为普通成员');

await new Promise(r => setTimeout(r, 250));
const pT = await plaza();
ok(table12(pT).state === 'waiting' && table12(pT).live === 2, '未准备/未开局显示候莲友');

a.send({ type: 'ready_set', ready: true, requestId: 'pa-ready' });
b.send({ type: 'ready_set', ready: true, requestId: 'pb-ready' });
await a.next(m => m.type === 'sync' && m.players.filter(q => q.ready).length === 2);
a.send({ type: 'start_match', requestId: 'pa-start' });
const ms = await a.next(m => m.type === 'match_started');
ok(ms.room.status === 'playing' && ms.room.order.length === 2, '两位准备后由房主共同开局');
await new Promise(r => setTimeout(r, 250));
const pP = await plaza();
ok(table12(pP).state === 'playing', '服务器房态开局后广场显示行谱中');

// ── 五、对局中后来者只旁观 ──
console.log('\n【中途旁观】');
const c = connect(TABLE); await c.opened;
c.send({ type: 'join', protocolVersion: 2, name: '丙同修' });
await c.next(m => m.type === 'joined');
const sc = await c.next(m => m.type === 'sync');
ok(sc.players.find(q => q.name === '丙同修').spectator, '对局中后来者标记为候下局');
ok(!sc.room.order.includes(sc.players.find(q => q.name === '丙同修').id), '后来者不插入当前行动顺序');

// ── 六、满座 ──
console.log('\n【满座】');
const d = connect(TABLE); await d.opened;
d.send({ type: 'join', protocolVersion: 2, name: '丁同修' });
const jd = await d.next(m => m.type === 'joined'); d.playerId = jd.playerId;
await d.next(m => m.type === 'sync');
await new Promise(r => setTimeout(r, 250));
const pF = await plaza();
ok(table12(pF).state === 'full' && table12(pF).live === 4, '四个真人座位坐满');
const e = connect(TABLE); await e.opened;
e.send({ type: 'join', protocolVersion: 2, name: '戊同修' });
const je = await e.next(m => m.type === 'joined' || m.type === 'error');
ok(je.type === 'error' && je.code === 'full', '第五人满座谢客');

// ── 七、断线保座而广场不算在线 ──
console.log('\n【断线保座】');
const dId = d.playerId;
try { d.ws.close(); } catch {}
await new Promise(r => setTimeout(r, 450));
const pDrop = await plaza();
ok(table12(pDrop).live === 3, '直接断线立即从广场在线数移除');
const probe = await fetch(`${BASE}/api/room/${TABLE}`).then(r => r.json());
ok(probe.count === 4 && probe.online === 3, '意外断线九十秒内保留原座供重连');

for (const cli of [a, b, c]) cli.send({ type: 'leave' });
await new Promise(r => setTimeout(r, 300));
if (dId) {
  const dr = connect(TABLE); await dr.opened;
  dr.send({ type: 'join', protocolVersion: 2, name: '丁同修', playerId: dId });
  const jr = await dr.next(m => m.type === 'joined' || m.type === 'error');
  if (jr.type === 'joined') {
    await dr.next(m => m.type === 'sync');
    dr.send({ type: 'leave' });
  }
  await new Promise(r => setTimeout(r, 150));
  try { dr.ws.close(); } catch {}
}
for (const cli of [a, b, c, d, e]) { try { cli.ws.close(); } catch {} }
await new Promise(r => setTimeout(r, 300));

// ── 八、非广场房号不上广场 ──
console.log('\n【非广场房号】');
const pv = connect('9042'); await pv.opened;
pv.send({ type: 'join', protocolVersion: 2, name: '房内同修' });
await pv.next(m => m.type === 'joined');
await pv.next(m => m.type === 'sync');
await new Promise(r => setTimeout(r, 300));
const pPriv = await plaza();
ok(pPriv.tables.every(t => t.code !== TABLE || t.live === 0), '非广场房号的在座者不会漏进广场桌位');
pv.send({ type: 'leave' });
await new Promise(r => setTimeout(r, 200));
try { pv.ws.close(); } catch {}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
