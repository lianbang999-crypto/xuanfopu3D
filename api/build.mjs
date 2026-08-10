#!/usr/bin/env node
// 選佛譜正本 API · 數據生成器
//
// 由三處正本合成 api/src/canon.js（打進 Worker bundle，勿手改）：
//   · 正本/门NN.js      —— 白话正本 4620 格（「白话 ‖ 引文」定式，2026-08-09 规程逐门校审）
//   · src/sfp-data.js   —— SFP_POS 220 位（moves 定去处与贈掷）、SFP_DOORS 15 门、SFP_META
//   · 承注/rules/gNN.json —— 只取 meta.juan 补门的卷次
//
// 判定码：0 行　1 不行　2 贈掷　3 無行法（门十五终局，本无行法，非此路不通）
// 去重：白话与引文各存一份，格只存索引——引文重复极多（通则一句常管数十格）。
//
// 用法：node api/build.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const { SFP_POS, SFP_DOORS, SFP_META } = await import(pathToFileURL(join(ROOT, 'src/sfp-data.js')));
const { ZH_T2S } = await import(pathToFileURL(join(ROOT, 'src/zh-conv.js')));

// ── 繁→簡：用戶多以簡體檢索，位名底本是繁體，不兩收則「圆十信位」永遠匹配不上「圓十信位」 ──
const MAXLEN = Math.max(...Object.keys(ZH_T2S).map((k) => k.length));
function t2s(str) {
  let r = '', i = 0;
  while (i < str.length) {
    let hit = 0;
    for (let L = Math.min(MAXLEN, str.length - i); L >= 1; L -= 1) {
      const seg = str.substr(i, L);
      if (ZH_T2S[seg] !== undefined) { r += ZH_T2S[seg]; i += L; hit = 1; break; }
    }
    if (!hit) { r += str[i]; i += 1; }
  }
  return r;
}

// ── 二十一相：標準十五序 ＋ 相雜六相（與 canon-route.js、check.mjs 同序，不得改動）──
const COMBOS = [
  '那那', '那謨', '謨謨', '阿阿', '阿彌', '彌彌', '阿陀', '彌陀', '陀陀',
  '那佛', '謨佛', '阿佛', '彌佛', '陀佛', '佛佛',
  '那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀',
];

const VERDICT_GO = 0, VERDICT_STAY = 1, VERDICT_BONUS = 2, VERDICT_NONE = 3;

// ── 讀白话正本 ──────────────────────────────────────────────
const 正本 = {};
for (let d = 1; d <= 15; d += 1) {
  const mod = await import(pathToFileURL(join(ROOT, '正本', `门${String(d).padStart(2, '0')}.js`)));
  Object.assign(正本, mod.default);
}
const zbKeys = Object.keys(正本);
if (zbKeys.length !== 4620) throw new Error(`正本格数 ${zbKeys.length} ≠ 4620`);

// ── 門的卷次：取自承注庫 meta.juan ──────────────────────────
const juanOf = new Map();
for (let d = 1; d <= 15; d += 1) {
  const p = join(ROOT, '承注/rules', `g${String(d).padStart(2, '0')}.json`);
  if (!existsSync(p)) continue;
  try { juanOf.set(d, JSON.parse(readFileSync(p, 'utf8'))?.meta?.juan ?? null); } catch { /* 缺卷次不致命 */ }
}

// ── 去重表 ──────────────────────────────────────────────────
const plainIdx = new Map(), citeIdx = new Map();
const PLAIN = [], CITE = [];
const put = (map, arr, s) => {
  if (!map.has(s)) { map.set(s, arr.length); arr.push(s); }
  return map.get(s);
};

// ── 位 ──────────────────────────────────────────────────────
// moves.to 指的是位之 id，而門十五「佛」的 id 作「圓教究竟妙覺位」，與 name 不同，故兩收
const posNo = new Map();
SFP_POS.forEach((p, i) => { posNo.set(p.name, i); posNo.set(p.id, i); });
const POS = SFP_POS.map((p) => {
  const o = { n: p.name, g: p.door, a: p.anchor, d: p.note || '' };
  const s = t2s(p.name);
  if (s !== p.name) o.s = s;                       // 簡體異形方存，省體積
  if (p.id !== p.name) o.f = p.id;                 // 正式全名（僅門十五「佛」＝圓教究竟妙覺位）
  if (p.start) o.start = p.start;                  // 起手相（第一門諸位）
  if (p.pure) o.pure = 1;                          // 純善位
  if (p.terminal) o.terminal = 1;                  // 終局位
  return o;
});

// ── 格：220 × 21 ────────────────────────────────────────────
let stat = { 行: 0, 不行: 0, 贈掷: 0, 無行法: 0 };
const CELLS = SFP_POS.map((p) => {
  const mv = new Map();
  for (const m of (p.moves || [])) for (const c of m.c) mv.set(c, m);
  return COMBOS.map((c) => {
    const raw = 正本[`${p.name}|${c}`];
    if (raw === undefined) throw new Error(`正本缺格：${p.name}|${c}`);
    const cut = raw.indexOf('‖');
    if (cut < 0) throw new Error(`格无引文分隔：${p.name}|${c}`);
    const plain = raw.slice(0, cut).trim();
    const cite = raw.slice(cut + 1).trim();

    const m = mv.get(c);
    let v, to = -1, bonus = 0;
    if (p.door === 15) { v = VERDICT_NONE; stat.無行法 += 1; }        // 終局門：本無輪相行法表
    else if (!m) { v = VERDICT_STAY; stat.不行 += 1; }
    else if (m.bonus) { v = VERDICT_BONUS; bonus = m.bonus; stat.贈掷 += 1; }
    else {
      v = VERDICT_GO; stat.行 += 1;
      to = posNo.get(m.to);
      if (to === undefined) throw new Error(`去处不在位表：${p.name}|${c} → ${m.to}`);
    }
    return [v, to, bonus, put(plainIdx, PLAIN, plain), put(citeIdx, CITE, cite)];
  });
});

// ── 門 ──────────────────────────────────────────────────────
const DOORS = SFP_DOORS.map((d) => {
  const idx = SFP_POS.reduce((a, p, i) => (p.door === d.no ? [...a, i] : a), []);
  return {
    no: d.no,
    t: d.title,
    s: t2s(d.title),
    intro: d.intro || '',
    juan: juanOf.get(d.no) ?? null,
    from: idx[0],           // 位序區間（POS 下標，連續）
    count: idx.length,
  };
});
for (const d of DOORS) {
  const seg = SFP_POS.slice(d.from, d.from + d.count);
  if (!seg.every((p) => p.door === d.no)) throw new Error(`门${d.no}位序不连续`);
}

// ── 落盤 ────────────────────────────────────────────────────
const banner = `// 選佛譜正本 · API 內建數據（由 api/build.mjs 生成，勿手改）
//
// 底本：蕅益智旭《選佛譜》六卷 · 大藏經補編第24冊 No.136（CBETA 電子佛典，公版古籍）
// 白话正本：正本/门01.js…门15.js，2026-08-09 规程逐门校审，四六二〇格逐格实核。
//
// 結構：
//   POS[i]    位 { n 繁名, s 簡名, f 正式全名, g 門號, a 法界錨點, d 本位定诠（譜曰定义段） }
//   DOORS[i]  門 { no, t 門名, s 簡名, intro 門首語, juan 卷次, from 起始位序, count 位數 }
//   CELLS[位序][相序] = [判定, 去向位序, 贈數, 白话→PLAIN, 引文→CITE]
//     判定 0＝行　1＝不行　2＝贈擲　3＝無行法（門十五終局：本無行法，非此路不通）
//     去向 -1 表不行／贈擲／無行法；贈數 0 表非贈擲
//   PLAIN/CITE 去重後各存一份
//
// 生成統計：格 4620（行 ${stat.行}・不行 ${stat.不行}・贈擲 ${stat.贈掷}・無行法 ${stat.無行法}）
//           白话去重 ${PLAIN.length} 條・引文去重 ${CITE.length} 條
`;

const out = [
  banner,
  `export const META = ${JSON.stringify(SFP_META)};`,
  `export const COMBOS = ${JSON.stringify(COMBOS)};`,
  `export const DOORS = ${JSON.stringify(DOORS)};`,
  `export const POS = ${JSON.stringify(POS)};`,
  `export const PLAIN = ${JSON.stringify(PLAIN)};`,
  `export const CITE = ${JSON.stringify(CITE)};`,
  `export const CELLS = ${JSON.stringify(CELLS)};`,
  `export const STAT = ${JSON.stringify({ doors: DOORS.length, positions: POS.length, cells: 4620, ...stat })};`,
  '',
].join('\n');

mkdirSync(join(HERE, 'src'), { recursive: true });
writeFileSync(join(HERE, 'src/canon.js'), out);

console.log('✓ api/src/canon.js');
console.log(`  門 ${DOORS.length}　位 ${POS.length}　格 4620`);
console.log(`  判定：行 ${stat.行}・不行 ${stat.不行}・贈擲 ${stat.贈掷}・無行法 ${stat.無行法}`);
console.log(`  去重：白话 ${PLAIN.length} 條・引文 ${CITE.length} 條`);
console.log(`  體積 ${(out.length / 1024).toFixed(0)} KB（未壓縮）`);
