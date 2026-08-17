#!/usr/bin/env node
// 正本为准 · 旧数据不得回流主包（2026-08-12 发起人定）
//
// 守两件：
//   一 src/ 里任何进主包的模块，不得再 import 已封存的旧白话本；
//   二 正本须真的全覆盖——旧本一旦被谁悄悄接回去，本本先红，而不是等玩家读到两副说法。
//
// 为什么要有这道闸：旧本不坏，坏的是并存。sfp-why-plain 1462 键覆盖 220 位原文 100%，
//   sfp-pos-plain 220 位齐全——正因为它们看起来「能用」，才最容易被顺手 import 回来。
// 运行：npm run check:canon-first
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFP_POS } from '../src/sfp-data.js';
import { SFP_POS_BAIHUA } from '../src/sfp-pos-baihua.js';
import { SFP_DOOR_BAIHUA } from '../src/sfp-door-baihua.js';
import { sfpCanonVerdict, sfpVerdictCanonReady } from '../src/sfp-verdict-canon.js';

const SEALED = ['sfp-why-plain.js', 'sfp-pos-plain.js'];
// 用 fileURLToPath 而非 .pathname：本仓路径含中文，.pathname 拿到的是百分号编码串，readdirSync 会 ENOENT
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

// ── 一 封存本不得被 src/ 引回 ──
// *.backup-*.js 不查：它们已在 .gitignore 之列、无人 import，进不了包，只是本机留痕。
//   （2026-08-12 实测 src/ 下四份，合 857 KB；要不要清是另一件事，不归本闸管。）
const offenders = [];
for (const f of readdirSync(SRC)) {
  if (!f.endsWith('.js') || SEALED.includes(f) || /\.backup-/.test(f)) continue;
  const text = readFileSync(join(SRC, f), 'utf8');
  for (const line of text.split(/\r?\n/u)) {
    if (!/^\s*(import|export)\b[^\n]*\bfrom\s*['"]/.test(line)) continue;   // 只看真 import，注释里提名字不算
    for (const s of SEALED) if (line.includes(`./${s}`)) offenders.push(`${f} → ${s}`);
  }
}
assert.deepEqual(offenders, [], `已封存的旧白话本被 src/ 引回主包：\n  ${offenders.join('\n  ')}`);
console.log(`✓ 封存本零回流（查 src/ 下 ${readdirSync(SRC).filter((f) => f.endsWith('.js')).length} 个模块）`);

// ── 二 正本全覆盖：旧本撤了，正本就得顶得住 ──
// 须先候装载（2026-08-17 修）：v398 切懒装载后，十五门改内部 import()，
// sfpCanonVerdict 在装载前按设计返回 null。本闸自 08-12 未随之改，遂自 08-15 起
// 格格皆判「缺白话」而报 4620 格全缺——数据其实完好，是闸自己坏了。
// 且它一红即退出，其后「门义十五门」与「位注领起句」两道闸从此再未跑过。
await sfpVerdictCanonReady();
const FACES = '那謨阿彌陀佛';
const COMBOS = [];
for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) COMBOS.push(FACES[i] + FACES[j]);

const lackV = SFP_POS.filter((p) => !String((SFP_POS_BAIHUA[p.id] || {}).v || '').trim());
assert.deepEqual(lackV.map((p) => p.id), [], '位注白话正本缺领起句');
console.log(`✓ 位注白话正本 ${SFP_POS.length}/${SFP_POS.length} 位有领起句`);

let cells = 0;
const lack = [];
for (const p of SFP_POS) for (const c of COMBOS) {
  cells++;
  const v = sfpCanonVerdict(p.id, c);
  if (!v || !String(v.plain || '').trim()) lack.push(`${p.id}|${c}`);
}
assert.equal(cells, 4620);
assert.deepEqual(lack.slice(0, 5), [], `发布判词正本缺白话 ${lack.length} 格：${lack.slice(0, 5).join('、')}`);
console.log(`✓ 发布判词正本 ${cells}/${cells} 格有白话`);

const lackD = [];
for (let n = 1; n <= 15; n++) if (!String((SFP_DOOR_BAIHUA[n] || {}).v || '').trim()) lackD.push(n);
assert.deepEqual(lackD, [], `门义白话正本缺门：${lackD.join('、')}`);
console.log('✓ 门义白话正本 15/15 门有领起句');

console.log('\n正本为准 · 全数通过');
