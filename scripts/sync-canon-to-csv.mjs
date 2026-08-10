// 把「白话正本」四六二〇条判词写进《选佛谱·轮相说明总表》CSV。
//
// 【为什么不是重新生成整张表】
//   scripts/export-rules.mjs 生成的是 22 列；而仓库根这张总表是 24 列——
//   「当令层」「层次依据」两列是 2026-08-09 母本补齐工序后加的，逐格实核而来，
//   .claude/skills/sfp-baihua/check.mjs 第十二·十三项（母本字义不符／母本④层不符）
//   正以这两列为镜。重新生成即丢，故本脚本以现有 CSV 为底做**增量**：只加列，不动既有列。
//
// 【为什么旧白话不删】
//   旧「白话说明」列来自 src/sfp-doorN-why.js 手工层，那是**现在上屏用的**链路；
//   正本（正本/门NN.js）按 2026-08-09 新规程重写并逐门校审，尚未接入上屏
//   （正本/README.md：「十五门全部写完之后再一并接入上屏，中途不动现有链路」）。
//   两套并存正是实况，故旧列改名标明「旧·上屏现行」，不抹去。
//   引文亦然：旧引文出处带承注库的定位串（如「《選佛譜》卷第一・見取・L57」），
//   与旧引文配套；正本引文另有承前体例（（X位下云：…）／（本位表列：…）／门首云／问答云），
//   两者对不上，强行合并即造伪，故各占一列。
//
// 用法：node scripts/sync-canon-to-csv.mjs [--dry]
//   --dry 只报差异，不落盘。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(ROOT, '选佛谱·轮相说明总表.csv');
const DRY = process.argv.includes('--dry');

// ── CSV 读写（字段内含换行，须按引号状态逐字符解析）──────────────
function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i += 1; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const cell = (v) => {
  const t = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
// BOM ＋ CRLF：Excel 才认 UTF-8 中文，且与原表一致
const toCSV = (rows) => `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

// ── 载入正本十五门 ────────────────────────────────────────────
const canon = {};
for (let i = 1; i <= 15; i += 1) {
  const n = String(i).padStart(2, '0');
  const mod = await import(pathToFileURL(path.join(ROOT, '正本', `门${n}.js`)).href);
  const obj = mod[`门${n}`] || Object.values(mod)[0];
  Object.assign(canon, obj);
}
const canonKeys = Object.keys(canon);
if (canonKeys.length !== 4620) throw new Error(`正本条数 ${canonKeys.length}，应为 4620`);

// 正本值体例：主句‖譜曰：引文（全谱无一例外，已验）
function splitCanon(v) {
  const parts = String(v).split('‖');
  if (parts.length !== 2) throw new Error(`正本条目分隔符异常：${v.slice(0, 40)}`);
  return { main: parts[0].trim(), quote: parts[1].trim() };
}

// ── 读表、对齐、加列 ──────────────────────────────────────────
const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
const H = rows[0].map((s) => s.replace(/^﻿/, ''));
const ix = (name) => {
  const i = H.indexOf(name);
  if (i < 0) throw new Error(`总表缺列「${name}」`);
  return i;
};
const iPos = ix('位次'); const iCombo = ix('轮相');
// 首次同步时列名还是「白话说明」；同步完成后已改名为「旧·上屏现行」。
// 先判断现态再取列，保证 --dry 与重复同步都真正幂等。
const DONE = H.includes('白话说明（正本）');
const iPlain = ix(DONE ? '白话说明（旧·上屏现行）' : '白话说明');

// 幂等：已同步过则原地更新，不重复加列
const OLD_PLAIN = '白话说明（旧·上屏现行）';
const NEW_PLAIN = '白话说明（正本）';
const NEW_QUOTE = '引文（正本）';

let head; let idxNewPlain; let idxNewQuote;
if (DONE) {
  head = H.slice();
  idxNewPlain = head.indexOf(NEW_PLAIN);
  idxNewQuote = head.indexOf(NEW_QUOTE);
} else {
  // 旧白话列改名标明来源；正本两列紧随其后，读者从左往右先看正本
  head = H.slice();
  head[iPlain] = OLD_PLAIN;
  head.splice(iPlain, 0, NEW_PLAIN, NEW_QUOTE);
  idxNewPlain = iPlain;
  idxNewQuote = iPlain + 1;
}

const out = [head];
const stat = { n: 0, miss: [], same: 0, changed: 0 };
for (const r0 of rows.slice(1)) {
  const r = r0.slice();
  const key = `${r[iPos]}|${r[iCombo]}`;
  const v = canon[key];
  if (!v) { stat.miss.push(key); }
  const { main, quote } = v ? splitCanon(v) : { main: '', quote: '' };

  if (!DONE) r.splice(iPlain, 0, main, quote);
  else { r[idxNewPlain] = main; r[idxNewQuote] = quote; }

  // 正本判词与旧白话是否实质不同（只作统计，两列都留）
  const old = DONE ? r[head.indexOf(OLD_PLAIN)] : r[idxNewPlain + 2];
  if (String(old).trim() === main) stat.same += 1; else stat.changed += 1;
  stat.n += 1;
  out.push(r);
}

if (stat.miss.length) {
  console.log(`✗ 有 ${stat.miss.length} 格在正本中找不到，前 5：${stat.miss.slice(0, 5).join('、')}`);
  process.exit(1);
}
// 正本有而表中无（反向核对）
const inCSV = new Set(rows.slice(1).map((r) => `${r[iPos]}|${r[iCombo]}`));
const orphan = canonKeys.filter((k) => !inCSV.has(k));
if (orphan.length) {
  console.log(`✗ 正本有 ${orphan.length} 条不在总表中，前 5：${orphan.slice(0, 5).join('、')}`);
  process.exit(1);
}

console.log(`总表 ${stat.n} 行 × ${head.length} 列（原 ${H.length} 列）`);
console.log(`  正本判词写入 ${stat.n} 条：与旧白话相同 ${stat.same}，不同 ${stat.changed}`);
console.log(`  列：${NEW_PLAIN}／${NEW_QUOTE}；旧白话列改名为「${OLD_PLAIN}」（不删）`);
if (DRY) { console.log('  --dry：未落盘'); process.exit(0); }
fs.writeFileSync(CSV_PATH, toCSV(out), 'utf8');
console.log(`✓ 已写入 ${CSV_PATH}（${(fs.statSync(CSV_PATH).size / 1024 / 1024).toFixed(2)} MB）`);
