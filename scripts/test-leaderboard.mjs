// 公共选佛榜接口测试：对 wrangler dev（localhost:8787）验证昵称入榜、查询、改名与去重。
// 用法：先 `npm run server`，再 `node scripts/test-leaderboard.mjs`

const BASE = process.env.NET_BASE || 'http://localhost:8787';
const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const a = `test_${seed}_a`;
const b = `test_${seed}_b`;

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

async function join(id, name) {
  const r = await fetch(`${BASE}/api/leaderboard?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, name }),
  });
  return { status: r.status, body: await r.json() };
}

const invalid = await join('bad', '');
ok(invalid.status === 400, '空昵称与非法身份被拒');

const first = await join(a, '慧明');
ok(first.status === 200, '填写昵称后成功入榜');
ok(first.body.me?.id === a && first.body.me?.name === '慧明', '返回自己的榜单记录');
ok(first.body.players.some(p => p.id === a), '自己出现在共修榜列表');
const totalAfterFirst = first.body.total;
const seqA = first.body.me?.seq;

const second = await join(b, '慧安');
ok(second.status === 200 && second.body.total === totalAfterFirst + 1, '第二位同修加入且总人数增加');
ok(second.body.me?.seq === seqA + 1, '新同修莲号连续递增');

const renamed = await join(a, '慧明改名');
ok(renamed.status === 200 && renamed.body.me?.name === '慧明改名', '原身份可以修改昵称');
ok(renamed.body.total === second.body.total, '修改昵称不会重复上榜');
ok(renamed.body.me?.seq === seqA, '修改昵称保留原入榜次序');

const list = await fetch(`${BASE}/api/leaderboard?id=${encodeURIComponent(a)}&limit=1&offset=0`).then(r => r.json());
ok(list.players.length === 1 && list.hasMore === (list.total > 1), '公共榜支持分页');
ok(list.me?.id === a, '翻页之外仍固定返回“我的榜单卡”');

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
