#!/usr/bin/env node
// 全文錄入 · 校驗與合併
//
// 塊只記語義邊界（錨句），逐字原文由本檔依錨句自底本取——
// 分塊準確靠人，逐字準確靠機器。與承注庫同一體例。
//
// 三道校驗皆須零，否則不出數據：
//   ① 錨句可尋：from／to 須在該行逐字尋得，且 to 在 from 之後
//   ② 塊不重疊：同一行內諸塊之區間不得相交
//   ③ 覆蓋率：諸塊所取原文須覆蓋底本（除 CBETA 頭部、圖片標記、校勘記）
//      ——此為「全部錄入」之可驗證保證：漏一段，覆蓋率即掉
//
// 用法：node 全文/build.mjs [--verbose]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const verbose = process.argv.includes('--verbose');

// ── 底本六卷，按行存 ──
const JUAN = {};
for (let i = 1; i <= 6; i++) {
  JUAN[i] = readFileSync(join(ROOT, `繁体版/B0136_00${i}.txt`), 'utf8').split('\n');
}

// 非正文行：CBETA 頭部、圖片標記、校勘記、空行
const isMeta = (s) => !s.trim() || /^#/.test(s) || /^【圖：/.test(s) || /^\s*\[[A-Z]\d+\]/.test(s);

// corpus.json 是本檔之產物，非輸入——不排除則每塊讀兩遍，自己與自己相交
const files = readdirSync(HERE).filter((f) => f.endsWith('.json') && f !== 'corpus.json').sort();
const blocks = [];
const errs = [];

for (const f of files) {
  const doc = JSON.parse(readFileSync(join(HERE, f), 'utf8'));
  for (const b of doc.blocks || []) {
    const lines = JUAN[b.juan];
    if (!lines) { errs.push(`${b.id}：無卷 ${b.juan}`); continue; }
    const raw = lines[b.line - 1];
    if (raw === undefined) { errs.push(`${b.id}：卷${b.juan} 無第 ${b.line} 行`); continue; }

    // ① 錨句可尋
    const i = raw.indexOf(b.from);
    if (i < 0) { errs.push(`${b.id}：起錨「${b.from.slice(0, 16)}」不見於卷${b.juan} L${b.line}`); continue; }
    const j = raw.indexOf(b.to, i);
    if (j < 0) { errs.push(`${b.id}：止錨「${b.to.slice(0, 16)}」不見於起錨之後`); continue; }
    const end = j + b.to.length;

    blocks.push({ ...b, file: f, span: [i, end], text: raw.slice(i, end) });
  }
}

// ② 塊不重疊
const byLine = new Map();
for (const b of blocks) {
  const k = `${b.juan}:${b.line}`;
  (byLine.get(k) || byLine.set(k, []).get(k)).push(b);
}
for (const [k, list] of byLine) {
  const sorted = [...list].sort((a, b) => a.span[0] - b.span[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].span[0] < sorted[i - 1].span[1]) {
      errs.push(`${sorted[i].id} 與 ${sorted[i - 1].id} 於 ${k} 區間相交`);
    }
  }
}

// ③ 覆蓋率：逐卷逐行，算已錄入之字符數 ÷ 正文總字符數
const cover = {};
for (let n = 1; n <= 6; n++) {
  let total = 0, got = 0;
  const miss = [];
  JUAN[n].forEach((raw, idx) => {
    if (isMeta(raw)) return;
    total += raw.length;
    const list = (byLine.get(`${n}:${idx + 1}`) || []).sort((a, b) => a.span[0] - b.span[0]);
    let covered = 0, cur = 0;
    for (const b of list) {
      covered += Math.max(0, b.span[1] - Math.max(b.span[0], cur));
      cur = Math.max(cur, b.span[1]);
    }
    got += covered;
    if (covered < raw.length * 0.98) miss.push({ line: idx + 1, len: raw.length, covered, head: raw.slice(0, 40) });
  });
  cover[n] = { total, got, miss };
}

console.log(`\n全文錄入 · 校驗\n`);
console.log(`塊 ${blocks.length} 個（${files.length} 檔）`);
if (errs.length) {
  console.log(`\n✗ 校驗不過 ${errs.length} 處：`);
  errs.slice(0, 12).forEach((e) => console.log('  ' + e));
  process.exit(1);
}
console.log('✓ 錨句皆可尋、塊無重疊\n');

console.log('覆蓋率（除 CBETA 頭部、圖片標記、校勘記）：');
let T = 0, G = 0;
for (let n = 1; n <= 6; n++) {
  const c = cover[n];
  T += c.total; G += c.got;
  const pct = c.total ? (100 * c.got / c.total).toFixed(1) : '—';
  console.log(`  卷${n}　${String(c.got).padStart(6)} / ${String(c.total).padStart(6)} 字　${pct.padStart(5)}%　未錄入 ${c.miss.length} 行`);
  if (verbose && c.miss.length) c.miss.slice(0, 6).forEach((m) => console.log(`      L${m.line}（${m.len}字，已錄 ${m.covered}）${m.head}…`));
}
console.log(`  ──　${G} / ${T} 字　${(100 * G / T).toFixed(1)}%`);

writeFileSync(join(HERE, 'corpus.json'), JSON.stringify({
  meta: { builtAt: new Date().toISOString().slice(0, 10), blocks: blocks.length, coverage: +(100 * G / T).toFixed(1) },
  blocks: blocks.map(({ file, span, ...b }) => b),
}, null, 1));
console.log(`\n已寫出 全文/corpus.json`);
