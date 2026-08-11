#!/usr/bin/env node
// 選佛譜正本 API · 自檢
//
// 直接 import Worker 入口，構造 Request 打進去，逐條核對響應與正本源數據是否一字不差。
// 不起 wrangler dev，故無端口依賴，可在 CI 裡跑。
//
// 用法：node api/test.mjs            對本地 bundle 自檢
//       node api/test.mjs <origin>   對已部署站點自檢（如 https://api.foyue.org）

import { readFileSync } from 'node:fs';
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

// ── 九 · 位注原文三段（義解｜行法｜後論）────────────────────
{
  const { SFP_POS } = await import(pathToFileURL(join(ROOT, 'src/sfp-data.js')));
  const { sfpSplitOf } = await import(pathToFileURL(join(ROOT, 'src/sfp-canon-split.js')));

  const one = await get(`/v1/positions/${encodeURIComponent('上品十惡')}`);
  const c = one.body.canon;
  ok(c.full === SFP_POS[0].note, '位注原文 full 與源數據一字不差');
  ok(c.exegesis + (c.practice || '') + (c.postscript || '') === c.full, '三段拼回即全文');
  // 切点在「那那」处，其前的全角分隔空格归義解段——故比對前先去尾空白
  ok(c.exegesis.trimEnd().endsWith('故是地獄因也。'), '義解段止於「故是地獄因也。」', c.exegesis.slice(-10));
  ok(c.practice?.includes('那那。則邪見增盛'), '行法段自「那那」起', String(c.practice).slice(0, 12));
  ok(one.body.definition === c.full, 'v1.0 之 definition 欄位仍等同 canon.full');

  // 全量核對：220 位三段皆與 sfpSplitOf 相符
  const ex = await get('/v1/export');
  let badSplit = 0, actN = 0, postN = 0;
  for (const p of ex.body.positions) {
    const src = SFP_POS.find((x) => x.name === p.name);
    const r = sfpSplitOf(p.name, src.note || '');
    const got = p.canon;
    if (got.full !== src.note) { badSplit += 1; continue; }
    if (got.exegesis !== (r.act ? r.jie : src.note)) badSplit += 1;
    else if ((got.practice || '') !== (r.post ? r.act : r.act)) badSplit += 1;
    else if ((got.postscript || '') !== r.post) badSplit += 1;
    if (got.practice) actN += 1;
    if (got.postscript) postN += 1;
  }
  ok(badSplit === 0, '二百二十位三段與切点表逐位相符', `${badSplit} 位不符`);
  ok(actN === 140, '有行法段者 140 位', String(actN));
  ok(postN === 6, '另有後論者 6 位', String(postN));

  // 門十五題下六句標目
  const fo = await get(`/v1/positions/${encodeURIComponent('佛')}`);
  ok(fo.body.headings?.length === 6, '門十五「佛」帶題下六句標目', String(fo.body.headings?.length));
  ok(fo.body.headings?.[0] === '圓教究竟妙覺位', '首句標目為圓教究竟妙覺位', fo.body.headings?.[0]);
}

// ── 十 · 各層白話 ───────────────────────────────────────────
{
  const { SFP_POS_BAIHUA } = await import(pathToFileURL(join(ROOT, 'src/sfp-pos-baihua.js')));
  const { SFP_DOOR_BAIHUA } = await import(pathToFileURL(join(ROOT, 'src/sfp-door-baihua.js')));
  const { SFP_FRONT_BAIHUA, SFP_POST_BAIHUA } = await import(pathToFileURL(join(ROOT, 'src/sfp-front-baihua.js')));

  // 位注白話：220 位無一缺，且逐字對得上源數據
  const ex = await get('/v1/export');
  const noVern = ex.body.positions.filter((p) => !p.vernacular?.text).length;
  ok(noVern === 0, '二百二十位位注白話無一缺', `${noVern} 位缺`);
  let badVern = 0;
  for (const p of ex.body.positions) {
    const src = SFP_POS_BAIHUA[p.name] ?? SFP_POS_BAIHUA[p.formal_name];
    if (!src || src.v !== p.vernacular.text) badVern += 1;
  }
  ok(badVern === 0, '位注白話逐位與源數據一字不差', `${badVern} 位不符`);

  // 門義白話
  const d1 = await get('/v1/doors/1');
  ok(d1.body.vernacular?.text === SFP_DOOR_BAIHUA[1].v, '門一門義白話對得上源數據');
  ok(d1.body.vernacular?.self_authored === true, '門一導語標為本項目自撰（原譜無此門總說）');
  const d3 = await get('/v1/doors/3');
  ok(!d3.body.vernacular?.self_authored, '門三有原譜總說，不標自撰');
  ok(d3.body.intro.startsWith('依六道論'), '門三門首總說原文無「譜曰」領起', d3.body.intro.slice(0, 8));
  let badDoorBH = 0;
  for (let n = 1; n <= 15; n += 1) {
    const r = await get(`/v1/doors/${n}`);
    if (r.body.vernacular?.text !== SFP_DOOR_BAIHUA[n].v) badDoorBH += 1;
  }
  ok(badDoorBH === 0, '十五門門義白話逐門相符', `${badDoorBH} 門不符`);

  // 位下後論白話：原文有後論之六位方有，餘位皆 null
  const withPost = ex.body.positions.filter((p) => p.postscript_vernacular);
  ok(withPost.length === 6, '位下後論白話六位', String(withPost.length));
  ok(withPost.every((p) => p.canon.postscript), '有後論白話者原文必有後論段');
  ok(withPost.every((p) => SFP_POST_BAIHUA[p.name]?.v === p.postscript_vernacular.text), '後論白話逐位相符');

  // 卷首卷末四篇
  const f = await get('/v1/front');
  ok(f.body.total === 4, '卷首卷末四篇', String(f.body.total));
  ok(f.body.sections.every((x) => x.text && x.vernacular?.text), '四篇原文與白話俱全');
  ok(f.body.sections.every((x) => SFP_FRONT_BAIHUA[x.title]?.v === x.vernacular.text), '四篇白話逐篇相符');
  const one = await get(`/v1/front/${encodeURIComponent('輪相表法第一')}`);
  ok(one.body.text.includes('那謨表惡'), '〈輪相表法第一〉原文含「那謨表惡」');
  ok(one.body.text.length === 808, '〈輪相表法第一〉原文 808 字', String(one.body.text.length));
  ok((await get('/v1/front/2')).body.title === '輪相表法第一', '序號 2 即輪相表法第一');
  ok((await get(`/v1/front/${encodeURIComponent('查無此篇')}`)).status === 404, '無此篇 404');
}

// ── 十一 · 全書原文 ─────────────────────────────────────────
{
  const corpus = JSON.parse(readFileSync(join(ROOT, '全文/corpus.json'), 'utf8'));
  const r = await get('/v1/text?limit=500');
  ok(r.body.total === 692, '全書原文 692 塊', String(r.body.total));

  const ex = await get('/v1/export?include=text');
  ok(ex.body.text?.length === 692, 'export?include=text 併出 692 塊', String(ex.body.text?.length));
  const plain = await get('/v1/export');
  ok(plain.body.text === undefined, 'export 默認不併出全書原文');

  let badText = 0;
  for (const b of ex.body.text) {
    const src = corpus.blocks.find((x) => x.id === b.id);
    if (!src || (src.text || '') !== b.text) badText += 1;
  }
  ok(badText === 0, '六九二塊原文逐塊與 corpus 一字不差', `${badText} 塊不符`);
  ok(ex.body.text.reduce((a, b) => a + b.text.length, 0) === 76276, '全書原文合計 76276 字');
  const empties = ex.body.text.filter((b) => b.empty);
  ok(empties.length === 2, '母本未取到正文者 2 塊，且如實標 empty', String(empties.length));
  ok(empties.every((b) => b.text === ''), 'empty 之塊正文留空，不以他文冒充');

  const j1 = await get('/v1/text?juan=1&limit=500');
  ok(j1.body.total === 100, '卷一 100 塊', String(j1.body.total));
  const qa = await get('/v1/text?kind=qa&limit=500');
  ok(qa.body.total === 11, '問答塊 11', String(qa.body.total));
  const byPos = await get(`/v1/text?position=${encodeURIComponent('見取')}&limit=500`);
  ok(byPos.body.total === 6, '〈見取〉6 塊', String(byPos.body.total));
  ok(byPos.body.blocks.every((b) => b.position === '見取'), '按位篩選之塊皆屬該位');
  const blk = await get('/v1/text/j1-g01-title');
  ok(blk.body.title?.includes('發始因地門'), '單塊可取', blk.body.title);
  ok((await get('/v1/text/j9-none')).status === 404, '無此塊 404');
  ok((await get('/v1/text?juan=9')).status === 400, '卷次越界 400');
  ok((await get('/v1/text?kind=nope')).status === 400, '偽 kind 400');
}

// ── 十二 · 檢索擴至白話與全書原文 ───────────────────────────
{
  const v = await get('/v1/search?in=vernacular&q=' + encodeURIComponent('殺生'));
  ok(v.body.positions.length > 0, '按白話檢索有命中', String(v.body.positions.length));
  ok(v.body.positions.every((p) => p.vernacular?.text), '白話命中項帶白話正文');
  const t = await get('/v1/search?in=text&q=' + encodeURIComponent('萬德洪名'));
  ok(t.body.texts.length > 0, '按全書原文檢索有命中', String(t.body.texts.length));
  ok(t.body.texts.some((b) => b.text.includes('萬德洪名')), '命中塊正文確含該詞');
  const all = await get('/v1/search?q=' + encodeURIComponent('取相懺'));
  ok(all.body.counts.texts > 0 && all.body.counts.rules > 0, 'in=all 兼收格與全書原文');
  ok((await get('/v1/search?in=nope&q=x')).status === 400, '偽 in 400');
}

// ── 十三 · 雜項 ─────────────────────────────────────────────
{
  const o = await get('/openapi.json');
  ok(o.body.openapi === '3.1.0', 'OpenAPI 3.1 規格可取');
  ok(o.body.paths['/v1/text'] && o.body.paths['/v1/front'], 'OpenAPI 含新增端點');
  ok((await get('/v1/不存在')).status === 404, '未知路徑 404');
  const m = await get('/v1/meta');
  ok(typeof m.body.source?.dice === 'string', 'meta 帶輪相總說');
  ok(m.body.statistics.text_blocks === 692 && m.body.statistics.front_sections === 4, 'meta 統計含新層');
  const root = await get('/');
  ok(root.body.version === '1.1.0', '版本已進至 1.1.0', root.body.version);
}

// ── 交卷 ────────────────────────────────────────────────────
console.log(log.join('\n'));
console.log(`\n${fail === 0 ? '✓ 全數通過' : '✗ 有未過項'}：${pass} 過 / ${fail} 未過\n`);
process.exit(fail === 0 ? 0 : 1);
