// 共修大厅客户端逻辑测试（不依赖浏览器）：掷轮攒批上报、封顶留余、及第局录摘要
// 用法：node scripts/test-plaza-client.mjs

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

// 极简 localStorage / fetch 桩
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const posts = [];
globalThis.fetch = async (url, opt) => {
  posts.push({ url, body: JSON.parse(opt.body) });
  return { ok: true, json: async () => ({ ok: true }) };
};
// Node 22 的 navigator 只有 getter，改用 defineProperty 覆盖
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: () => true }, configurable: true });

const Plaza = await import('../src/plaza.js');

// ── 掷轮攒批 ──
console.log('\n【掷轮攒批】');
for (let i = 0; i < 9; i++) await Plaza.tick(1);
ok(posts.length === 0, '未满十掷不发请求（省请求）');
ok(localStorage.getItem('sm10.plaza.pending') === '9', '未送达的掷数留在本地，不丢');
await Plaza.tick(1);
ok(posts.length === 1 && posts[0].body.n === 10, '第十掷触发上报，一次送十');
ok(localStorage.getItem('sm10.plaza.pending') === '0', '送达后本地余额归零');

posts.length = 0;
await Plaza.tick(200);
ok(posts[0].body.n === 60, '单次上报封顶 60（与服务端一致）');
ok(localStorage.getItem('sm10.plaza.pending') === '140', '超出的 140 掷留待下批，不默默丢弃');

posts.length = 0;
store.set('sm10.plaza.pending', '3');
await Plaza.flush();
ok(posts.length === 1 && posts[0].body.n === 3, '强制 flush 可送不足一批的余数（及第时用）');

// 送不出时不清账
posts.length = 0;
store.set('sm10.plaza.pending', '7');
const okFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('offline'); };
await Plaza.flush();
ok(localStorage.getItem('sm10.plaza.pending') === '7', '网络不通时掷数留着，下次再送');
globalThis.fetch = okFetch;

// ── 及第局录摘要 ──
console.log('\n【及第局录摘要】');
const byId = {
  'g1-01': { name: '三品十惡', door: 1, pure: false, y: 0 },      // 南赡部洲，人间
  'g3-04': { name: '無間地獄', door: 3, pure: false, y: -60 },    // 地狱法界，最深
  'g8-02': { name: '四無量心', door: 8, pure: false, y: 120 },
  'g14-01': { name: '上品上生', door: 14, pure: true, y: 200 },
  'g15-01': { name: '妙覺位', door: 15, pure: false, y: 300 },
};
const depthOf = (id) => (byId[id] ? byId[id].y : NaN);
const rise = Plaza.runSummary(['g1-01', 'g3-04', 'g3-04', 'g8-02', 'g15-01'], byId, 31, 'table:3', depthOf);
ok(JSON.stringify(rise.doors) === JSON.stringify([1, 3, 8, 15]), '历经门号去重升序');
ok(rise.lowest === '無間地獄', '最深落处＝竖轴最低之位（非门号最小）');
const byDoor = Plaza.runSummary(['g1-01', 'g3-04'], byId, 9, 'solo');
ok(byDoor.lowest === '三品十惡', '不给 depthOf 时退回门号口径（供对照）');
ok(rise.span === 4, '历经位次数按去重计');
ok(rise.path === 'rise', '未经净土＝竖出');
ok(rise.n === 31 && rise.seat === 'table:3', '掷数与座处原样带上');

const pure = Plaza.runSummary(['g1-01', 'g14-01', 'g15-01'], byId, 12, 'solo', depthOf);
ok(pure.path === 'pure', '经净土诸位＝横超');

const junk = Plaza.runSummary(['g1-01', 'nonexistent', null], byId, 5, 'solo', depthOf);
ok(junk.span === 1 && junk.doors.length === 1, '足迹中的无效位被剔除，不计入');

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
