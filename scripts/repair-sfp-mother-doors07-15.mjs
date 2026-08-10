#!/usr/bin/env node
// 2026-08-09 门七至十五专项复核后的母本修复器。
// 只改已核定项目：④层格、门十五终局、三等一切佛迴向错位、门十三/十四证据链。
//
// 【已跑完，勿再跑】2026-08-10 总表由 24 列增至 26 列（加「白话说明（正本）」「引文（正本）」，
//   原「白话说明」改名「白话说明（旧·上屏现行）」），下方 24 列护栏会直接抛错拦住——这是对的：
//   本脚本按旧列名写值，再跑即写错位置。要改正本判词请改 正本/门NN.js 后跑 scripts/sync-canon-to-csv.mjs。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { czOf } from '../src/sfp-chengzhu.js';
import { sfpManualWhyText } from '../src/sfp-evidence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_FILE = join(ROOT, '选佛谱·轮相说明总表.csv');
const CANON_FILE = join(ROOT, 'src/sfp-canon.js');
const POS_FILE = join(ROOT, 'xuanfopu-h5/data/positions.json');

// 修正旧 canon 抽取把上一位轮相表粘进〈三等一切佛迴向〉的唯一错位。
{
  const oldText = '阿阿。四向阿彌。五向彌彌阿陀。皆六向彌陀。七向陀陀。八向那佛。七向謨佛。八向阿佛。圓信彌佛。方便淨土陀佛。圓住佛佛。圓向譜曰。三世佛法。一切時行。故名等一切佛也。';
  const newText = '譜曰。三世佛法。一切時行。故名等一切佛也。';
  const source = readFileSync(CANON_FILE, 'utf8');
  const count = source.split(oldText).length - 1;
  if (count > 1) throw new Error(`canon 错位片段出现 ${count} 次，拒绝批量替换`);
  if (count === 1) writeFileSync(CANON_FILE, source.replace(oldText, newText));
  else if (!source.includes(newText)) throw new Error('canon 中既无待修片段，也无修后片段');
}

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

const positions = JSON.parse(readFileSync(POS_FILE, 'utf8')).positions;
const byName = new Map(positions.map((position) => [position.name, position]));
const door12 = positions.filter((position) => position.gate === 12);
const door12Fourth = new Set(door12.slice(10).map((position) => `${position.name}|佛佛`));
const door13Fourth = new Set(positions.filter((position) => position.gate === 13).slice(2)
  .map((position) => `${position.name}|佛佛`));
const door14Fourth = new Set([
  '淨土疑城|佛佛',
  '下品下生|陀佛', '下品下生|佛佛',
  '下品中生|陀佛',
  '下品上生|陀佛', '下品上生|佛佛',
  '中品下生|彌佛',
  '中品中生|佛佛',
  '上品下生|佛佛',
  '上品中生|佛佛',
  '上品上生|佛佛',
  '方便有餘淨土|佛佛',
  '實報莊嚴淨土|佛佛',
  '常寂光淨土|佛佛',
]);

const evidenceKeys = new Set([
  ...positions.filter((position) => position.gate === 13).slice(2)
    .flatMap((position) => ['彌佛', '陀佛', '佛佛'].map((combo) => `${position.name}|${combo}`)),
  ...['實報莊嚴淨土', '常寂光淨土']
    .flatMap((position) => ['那那', '那謨', '那阿', '那彌', '那陀', '那佛', '謨謨', '謨阿', '謨彌', '謨陀', '謨佛', '阿阿', '阿彌', '阿陀', '阿佛', '彌彌', '彌陀', '彌佛', '陀陀', '陀佛', '佛佛']
      .map((combo) => `${position}|${combo}`)),
]);

let fourthCount = 0;
let evidenceCount = 0;
let terminalCount = 0;
let canonCount = 0;

for (const row of rows.slice(1)) {
  const position = row[col.位次];
  const combo = row[col.轮相];
  const key = `${position}|${combo}`;
  const door = Number(row[col.门次].match(/\d+/u)?.[0] || 0);

  if (door12Fourth.has(key) || door13Fourth.has(key) || door14Fourth.has(key)) {
    row[col.当令层] = '④';
    const destination = row[col.去处] === '佛' ? '圆教究竟妙觉位' : row[col.去处];
    const tail = String(row[col.白话说明] || '').replace(/^[^。]*。/u, '');
    if (combo === '佛佛') {
      row[col.首字表义] = '圓頓門';
      row[col.次字表义] = '圓頓門';
      row[col.层次依据] = `本位轮相明列「佛佛」至${destination}；佛在此格按④层表圆顿门`;
      row[col.白话说明] = `「佛佛」二字在此格表圆顿门。${tail}`;
    } else if (combo === '陀佛') {
      row[col.首字表义] = '次第門';
      row[col.次字表义] = '無漏善慧';
      row[col.层次依据] = `本位轮相明列「陀佛」至${destination}；陀在此格按④层表次第门`;
      row[col.白话说明] = `「陀」在此格表次第门，「佛」表无漏善慧。${tail}`;
    } else if (combo === '彌佛') {
      row[col.首字表义] = '無生門';
      row[col.次字表义] = '無漏善慧';
      row[col.层次依据] = `本位轮相明列「彌佛」至${destination}；彌在此格按④层表无生门`;
      row[col.白话说明] = `「彌」在此格表无生门，「佛」表无漏善慧。${tail}`;
    }
    fourthCount += 1;
  }

  if (evidenceKeys.has(key)) {
    const cz = czOf(position, combo);
    if (!cz) throw new Error(`承注缺格：${key}`);
    row[col.白话说明] = sfpManualWhyText(position, combo) || cz.plain || row[col.白话说明];
    row[col.承注层级] = cz.level;
    row[col.引文] = cz.cites.map((cite) => cite.t).join('\n');
    row[col.引文出处] = cz.cites.map((cite) => cite.r).join('\n');
    row[col.引文所出之位] = [...new Set(cz.cites.map((cite) => cite.n).filter(Boolean))].join('、');
    evidenceCount += 1;
  }

  if (position === '圓十行位' && combo === '佛佛') {
    row[col.白话说明] = '「佛佛」二字在此格表圆顿门。本位轮相表明列「佛佛」至究竟妙觉；圆教行人善能超越，一生能顿入，故成圆教究竟妙觉位。';
  }

  if (position === '三等一切佛迴向') {
    row[col['谱曰原文（本位按语）']] = '三世佛法。一切時行。故名等一切佛也。';
    canonCount += 1;
  }

  // 证据链刷新可能重取手写说明；最后再按已核定的④层改正句首字义。
  if (door12Fourth.has(key) || door13Fourth.has(key) || door14Fourth.has(key)) {
    const tail = String(row[col.白话说明] || '').replace(/^[^。]*。/u, '');
    if (combo === '佛佛') row[col.白话说明] = `「佛佛」二字在此格表圆顿门。${tail}`;
    else if (combo === '陀佛') row[col.白话说明] = `「陀」在此格表次第门，「佛」表无漏善慧。${tail}`;
    else if (combo === '彌佛') row[col.白话说明] = `「彌」在此格表无生门，「佛」表无漏善慧。${tail}`;
  }

  if (door === 15) {
    const terminal = byName.get('佛');
    const puyue = String(terminal?.puyue || '').split('\n紀事')[0].replace(/^譜曰。/u, '');
    const cz = czOf('佛', combo);
    row[col.首字表义] = '不适用（终局占位）';
    row[col.次字表义] = '不适用（终局占位）';
    row[col.当令层] = '不适用（终局无轮相）';
    row[col.层次依据] = '第十五门原文不列轮相行法；二十一组合仅为数据结构占位';
    row[col.判定] = '终局·不再掷轮';
    row[col.去处] = '';
    row[col.去处门次] = '';
    row[col.升降] = '终局';
    row[col.贈掷] = '';
    row[col.白话说明] = '到此即为全谱终局，不再掷轮；本表所列二十一组合仅为数据结构占位，并非《選佛譜》另立的二十一条规则。';
    row[col.说明来源] = '终局说明（本位无谱表）';
    row[col.承注层级] = cz?.level || '直說';
    row[col['谱曰原文（本位按语）']] = puyue;
    row[col.引文] = (cz?.cites || []).map((cite) => cite.t).join('\n');
    row[col.引文出处] = (cz?.cites || []).map((cite) => cite.r).join('\n');
    row[col.引文所出之位] = [...new Set((cz?.cites || []).map((cite) => cite.n).filter(Boolean))].join('、');
    terminalCount += 1;
  }
}

if (fourthCount !== 62 || evidenceCount !== 60 || terminalCount !== 21 || canonCount !== 21) {
  throw new Error(`修复计数异常：④=${fourthCount}，证据=${evidenceCount}，终局=${terminalCount}，三等原文=${canonCount}`);
}

const output = `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
writeFileSync(CSV_FILE, output, 'utf8');
console.log(`已修复母本：④层 ${fourthCount} 格；证据链 ${evidenceCount} 格；终局 ${terminalCount} 格；三等原文 ${canonCount} 格。`);
