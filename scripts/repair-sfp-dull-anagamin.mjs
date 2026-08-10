#!/usr/bin/env node
// 修复〈鈍根阿那含〉三恶相的白话与承注证据链。
//
// 【已跑完，勿再跑】2026-08-10 总表由 24 列增至 26 列，下方 24 列护栏会直接抛错拦住——
//   本脚本按旧列名写值，再跑即写错位置。要改正本判词请跑 scripts/sync-canon-to-csv.mjs。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { czOf } from '../src/sfp-chengzhu.js';
import { sfpManualWhyText } from '../src/sfp-evidence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_FILE = join(ROOT, '选佛谱·轮相说明总表.csv');
const EVIDENCE_TARGET = new Set(['那那', '那謨', '謨謨']);
const WHITE_TARGET = new Set([
  ...EVIDENCE_TARGET,
  '那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀',
]);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const source = text.replace(/^\ufeff/u, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && source[i + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; i += 1;
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const rows = parseCsv(readFileSync(CSV_FILE, 'utf8'));
const header = rows[0];
const col = Object.fromEntries(header.map((name, index) => [name, index]));
if (rows.length !== 4621 || header.length !== 24) {
  throw new Error(`母本结构异常：${rows.length - 1} 行、${header.length} 列`);
}

let repaired = 0;
let evidenceRepaired = 0;
for (const row of rows.slice(1)) {
  const position = row[col.位次];
  const combo = row[col.轮相];
  if (position !== '鈍根阿那含' || !WHITE_TARGET.has(combo)) continue;

  const cz = czOf(position, combo);
  const plain = sfpManualWhyText(position, combo);
  if (!plain || plain.includes('永不退转')) throw new Error(`白话仍有旧误：${position}/${combo}`);

  row[col.白话说明] = plain;
  if (EVIDENCE_TARGET.has(combo)) {
    if (!cz || cz.level !== '推演' || cz.cites.length !== 4
      || !plain.includes('不再受生欲界') || !plain.includes('有漏不动业')) {
      throw new Error(`承注证据链异常：${position}/${combo}`);
    }
    row[col.承注层级] = cz.level;
    row[col.引文] = cz.cites.map((cite) => cite.t).join('\n');
    row[col.引文出处] = cz.cites.map((cite) => cite.r).join('\n');
    row[col.引文所出之位] = [...new Set(cz.cites.map((cite) => cite.n).filter(Boolean))].join('、');
    evidenceRepaired += 1;
  }
  repaired += 1;
}

if (repaired !== 9 || evidenceRepaired !== 3) {
  throw new Error(`修复计数异常：白话 ${repaired}，证据 ${evidenceRepaired}`);
}

const output = `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
writeFileSync(CSV_FILE, output, 'utf8');
console.log(`已修复〈鈍根阿那含〉白话 ${repaired} 格、证据链 ${evidenceRepaired} 格。`);
