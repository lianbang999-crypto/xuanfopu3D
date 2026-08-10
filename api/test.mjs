#!/usr/bin/env node
// 選佛譜正本 API · 自檢
//
// 直接 import Worker 入口，構造 Request 打進去，逐條核對響應與正本源數據是否一字不差。
// 不起 wrangler dev，故無端口依賴，可在 CI 裡跑。
//
// 用法：node api/test.mjs            對本地 bundle 自檢
//       node api/test.mjs <origin>   對已部署站點自檢（如 https://api.foyue.org）

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ORIGIN = process.argv[2] || null;

let worker = null;
if (!ORIGIN) worker = (await import(pathToFileURL(join(HERE, 'src/index.js')))).default;

const BASE = ORIGIN || 'https://api.foyue.org';
async function get(path) {
  const url = BASE + path;
  const res = ORIGIN ? await fetch(url) : await worker.fetch(new Request(url));
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, body };
}

let pass = 0, fail = 0;
const log = [];
function ok(cond, name, detail) {
  if (cond) { pass += 1; } else { fail += 1; log.push(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}

// ── 源數據：核對之鏡 ─────────────────────────────────────────
const { SFP_POS } = await import(pathToFileURL(join(ROOT, 'src/sfp-data.js')));
const 正本 = {};
for (let d = 1; d <= 15; d += 1) {
  const m = await import(pathToFileURL(join(ROOT, '正本', `门${String(d).padStart(2, '0')}.js`)));
  Object.assign(正本, m.default);
}
const COMBOS = [
  '那那', '那謨', '謨謨', '阿阿', '阿彌', '彌彌', '阿陀', '彌陀', '陀陀',
  '那佛', '謨佛', '阿佛', '彌佛', '陀佛', '佛佛',
  '那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀',
];

console.log(`\n選佛譜正本 API 自檢 · ${ORIGIN ? `線上 ${ORIGIN}` : '本地 bundle'}\n`);

// ── 一 · 索引與統計 ──────────────────────────────────────────
{
  const r = await get('/');
  ok(r.status === 200, '/ 返回 200', `得 ${r.status}`);
  ok(r.body.statistics?.cells === 4620, '/ 統計格數 4620', JSON.stringify(r.body.statistics));
  ok(r.body.statistics?.positions === 220, '/ 統計位數 220');
  ok(r.body.statistics?.doors === 15, '/ 統計門數 15');
  ok(r.headers.get('access-control-allow-origin') === '*', 'CORS 全開');
}

// ── 二 · 門 ─────────────────────────────────────────────────
{
  const r = await get('/v1/doors');
  ok(r.body.total === 15, '門總數 15');
  ok(r.body.doors.reduce((a, d) => a + d.positions, 0) === 220, '十五門位數合計 220');

  const d1 = await get('/v1/doors/1');
  ok(d1.body.title === '發始因地門', '門一名為發始因地門', d1.body.title);
  ok(d1.body.positions.length === d1.body.positions_count || Array.isArray(d1.body.positions), '門一含位列表');
  const d15 = await get('/v1/doors/15');
  ok(d15.body.positions.length === 1 && d15.body.positions[0].name === '佛', '門十五唯一位「佛」');
  ok((await get('/v1/doors/16')).status === 404, '門十六 404');
}

// ── 三 · 位 ─────────────────────────────────────────────────
{
  const r = await get('/v1/positions?limit=500');
  ok(r.body.total === 220, '位總數 220', String(r.body.total));
  const names = new Set(r.body.positions.map((p) => p.name));
  ok(names.size === 220, '位名皆不重');
  ok(SFP_POS.every((p) => names.has(p.name)), '二百二十位名與 SFP_POS 全同');

  const one = await get(`/v1/positions/${encodeURIComponent('上品十惡')}`);
  ok(one.body.rules?.length === 21, '單位帶二十一格', String(one.body.rules?.length));
  ok(one.body.definition === SFP_POS[0].note, '本位定诠與源數據一字不差');

  // 繁・簡・序號・正式全名四路定位同一位
  const byNo = await get('/v1/positions/1');
  const bySimp = await get(`/v1/positions/${encodeURIComponent('上品十恶')}`);
  ok(byNo.body.name === '上品十惡', '序號 1 定位到上品十惡', byNo.body.name);
  ok(bySimp.body.name === '上品十惡', '簡體「上品十恶」定位成功', bySimp.body.name);
  const byFormal = await get(`/v1/positions/${encodeURIComponent('圓教究竟妙覺位')}`);
  ok(byFormal.body.name === '佛', '正式全名「圓教究竟妙覺位」定位到「佛」', byFormal.body.name);
  ok((await get(`/v1/positions/${encodeURIComponent('查無此位')}`)).status === 404, '無此位 404');

  const byDoor = await get('/v1/positions?door=12&limit=500');
  ok(byDoor.body.total === 52, '門十二五十二位', String(byDoor.body.total));
}

// ── 四 · 四六二〇格逐格核對（本檢為重）────────────────────────
{
  const r = await get('/v1/rules?limit=500&page=1');
  ok(r.body.total === 4620, '格總數 4620', String(r.body.total));

  // 全量下載後逐格與正本源文比對
  const ex = await get('/v1/export');
  const rules = ex.body.rules;
  ok(rules.length === 4620, '全量導出 4620 格', String(rules.length));

  let mismatch = 0, badVerdict = 0, badCombo = 0;
  const seen = new Set();
  for (const c of rules) {
    const key = `${c.position}|${c.combo}`;
    seen.add(key);
    const raw = 正本[key];
    if (raw === undefined) { mismatch += 1; continue; }
    const cut = raw.indexOf('‖');
    if (raw.slice(0, cut).trim() !== c.plain || raw.slice(cut + 1).trim() !== c.cite) mismatch += 1;
    if (!['行', '不行', '贈擲', '無行法'].includes(c.verdict)) badVerdict += 1;
    if (!COMBOS.includes(c.combo)) badCombo += 1;
  }
  ok(mismatch === 0, '四六二〇格白話與引文逐格對得上正本', `${mismatch} 格不符`);
  ok(seen.size === 4620, '導出無重無漏', `唯一鍵 ${seen.size}`);
  ok(badVerdict === 0, '判定皆在四種之內', `${badVerdict} 格越界`);
  ok(badCombo === 0, '輪相皆在二十一相之內', `${badCombo} 格越界`);

  // 判定分佈須與 build 統計一致
  const dist = {};
  for (const c of rules) dist[c.verdict] = (dist[c.verdict] || 0) + 1;
  ok(dist['行'] === 2688, '行 2688', String(dist['行']));
  ok(dist['不行'] === 1828, '不行 1828', String(dist['不行']));
  ok(dist['贈擲'] === 83, '贈擲 83', String(dist['贈擲']));
  ok(dist['無行法'] === 21, '無行法 21（門十五終局）', String(dist['無行法']));

  // 去向皆為實有之位；不行／贈擲／無行法者去向須為 null
  const posNames = new Set(SFP_POS.map((p) => p.name));
  let badTo = 0;
  for (const c of rules) {
    if (c.verdict === '行') { if (!posNames.has(c.to)) badTo += 1; }
    else if (c.to !== null) badTo += 1;
  }
  ok(badTo === 0, '去向皆實有之位，非「行」者去向為 null', `${badTo} 格有誤`);

  // 贈擲格須帶贈數，非贈擲格贈數為 0
  let badBonus = 0;
  for (const c of rules) {
    if (c.verdict === '贈擲' ? !(c.bonus > 0) : c.bonus !== 0) badBonus += 1;
  }
  ok(badBonus === 0, '贈數與判定相符', `${badBonus} 格有誤`);
}

// ── 五 · 單格 ───────────────────────────────────────────────
{
  const r = await get(`/v1/rules/${encodeURIComponent('上品十惡')}/${encodeURIComponent('那那')}`);
  ok(r.body.rule?.to === '阿鼻地獄', '上品十惡・那那 → 阿鼻地獄', r.body.rule?.to);
  ok(r.body.rule?.verdict === '行', '上品十惡・那那 判定為行');
  // 簡體輪相與序號兩路
  const simp = await get(`/v1/rules/1/${encodeURIComponent('那谟')}`);
  ok(simp.body.rule?.combo === '那謨', '簡體「那谟」歸一到「那謨」', simp.body.rule?.combo);
  const byIdx = await get('/v1/rules/1/1');
  ok(byIdx.body.rule?.combo === '那那', '相序 1 即那那', byIdx.body.rule?.combo);
  ok((await get(`/v1/rules/1/${encodeURIComponent('那佛佛')}`)).status === 404, '偽輪相 404');

  // 門十五終局
  const end = await get(`/v1/rules/${encodeURIComponent('佛')}/${encodeURIComponent('佛佛')}`);
  ok(end.body.rule?.verdict === '無行法', '門十五「佛」判定為無行法', end.body.rule?.verdict);
}

// ── 六 · 篩選 ───────────────────────────────────────────────
{
  const byDoor = await get('/v1/rules?door=2&limit=500');
  ok(byDoor.body.total === 105, '門二一〇五格（五位×廿一）', String(byDoor.body.total));
  const byVerdict = await get('/v1/rules?verdict=' + encodeURIComponent('贈擲') + '&limit=500');
  ok(byVerdict.body.total === 83, '判定篩選：贈擲 83 格', String(byVerdict.body.total));
  const byCombo = await get('/v1/rules?combo=' + encodeURIComponent('佛佛') + '&limit=500');
  ok(byCombo.body.total === 220, '輪相篩選：佛佛 220 格（每位一格）', String(byCombo.body.total));
  const byTo = await get('/v1/rules?to=' + encodeURIComponent('阿鼻地獄') + '&limit=500');
  ok(byTo.body.total > 0, '去處篩選：往阿鼻地獄者非空', String(byTo.body.total));
  ok((await get('/v1/rules?door=99')).status === 400, '門號越界 400');
  ok((await get('/v1/rules?verdict=' + encodeURIComponent('飛升'))).status === 400, '偽判定 400');

  // 分頁不重不漏
  const p1 = await get('/v1/rules?door=2&limit=50&page=1');
  const p2 = await get('/v1/rules?door=2&limit=50&page=2');
  const p3 = await get('/v1/rules?door=2&limit=50&page=3');
  const keys = [...p1.body.rules, ...p2.body.rules, ...p3.body.rules].map((c) => `${c.position}|${c.combo}`);
  ok(keys.length === 105 && new Set(keys).size === 105, '分頁三頁湊足一〇五格且不重', String(keys.length));
  ok(p3.body.has_more === false, '末頁 has_more 為 false');
}

// ── 七 · 檢索 ───────────────────────────────────────────────
{
  const r = await get('/v1/search?q=' + encodeURIComponent('取相懺'));
  ok(r.body.rules.length > 0, '檢索「取相懺」有命中', String(r.body.rules?.length));
  ok(r.body.positions.some((p) => p.name === '取相懺'), '檢索命中同名之位');
  const simp = await get('/v1/search?q=' + encodeURIComponent('取相忏'));
  ok(simp.body.rules.length > 0 || simp.body.positions.length > 0, '簡體檢索亦有命中');
  ok((await get('/v1/search')).status === 400, '空 q 400');
  ok((await get('/v1/search?q=' + 'x'.repeat(80))).status === 400, '超長 q 400');
}

// ── 八 · 六字與輪相 ─────────────────────────────────────────
{
  const g = await get('/v1/glyphs');
  ok(g.body.glyphs.length === 6, '六字定诠六條', String(g.body.glyphs?.length));
  ok(g.body.glyphs.find((x) => x.glyph === '那')?.二惑?.startsWith('見煩惱'), '那表見煩惱');
  ok(g.body.glyphs.find((x) => x.glyph === '佛')?.四門?.startsWith('圓頓門'), '佛表圓頓門');
  const c = await get('/v1/combos');
  ok(c.body.combos.length === 21, '輪相二十一', String(c.body.combos?.length));
  ok(c.body.combos.filter((x) => x.standard).length === 15, '標準十五序');
}

// ── 九 · 雜項 ───────────────────────────────────────────────
{
  ok((await get('/openapi.json')).body.openapi === '3.1.0', 'OpenAPI 3.1 規格可取');
  ok((await get('/v1/不存在')).status === 404, '未知路徑 404');
  const m = await get('/v1/meta');
  ok(typeof m.body.source?.dice === 'string', 'meta 帶輪相總說');
}

// ── 交卷 ────────────────────────────────────────────────────
console.log(log.join('\n'));
console.log(`\n${fail === 0 ? '✓ 全數通過' : '✗ 有未過項'}：${pass} 過 / ${fail} 未過\n`);
process.exit(fail === 0 ? 0 : 1);
