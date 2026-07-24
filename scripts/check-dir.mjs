// 升降判定核证：把 sfpDirOf 的每一条判定与原谱注措辞对照，抵触者列出待裁
//
// 原理：谱注在说明每一轮相去处时，常自带升降语。凡原文措辞与引擎判定相抵者，
// 一律以原文为准——引擎是推断，原文是依据。
// 用法：node scripts/check-dir.mjs [--all]
//   默认只列冲突；--all 连同已裁定（SFP_DIR_FIX）一并列出。

import { readFileSync } from 'node:fs';
import { sfpDirOf, SFP_DIR_FIX } from '../src/sfp-rules.js';

const src = readFileSync(new URL('../src/sfp-data.js', import.meta.url), 'utf8');
const SFP_POS = JSON.parse(/SFP_POS\s*=\s*(\[[\s\S]*?\]);/.exec(src)[1]);
const BY = Object.fromEntries(SFP_POS.map(p => [p.id, p]));
const ORDER = SFP_POS.map(p => p.id);

// 谱注判升降之字，逐字取自原谱。只认**判果**之词，不认**述因**之词——
// 「妄起見愛」「煩惑紛陳」「愛染方強」说的是所以然（因），不是升降本身（果）；
// 原文判降一律用「墮／沈／退／貶」，判升用「升／生／成／為／證／登／超」。
const DOWN_WORDS = ['墮', '堕', '沈淪', '沉沦', '退失', '退墮', '貶', '贬', '輪轉', '轮转'];
const UP_WORDS = ['升', '昇', '超', '登', '證', '证', '入聖', '得生', '生天'];

// 比较级：同侪之间的高下，非升降。
// 如【下品十善】整位是「阿脩羅道因」，四种修罗以「稍勝／又勝／更勝」相次，皆在恶趣，不得判升。
const COMPARATIVE = /(稍|又|更|倍|尚|愈)(勝|胜|深|增|重|強|强)/;

// 从谱注中截出讲这一轮相的那一句（原文以句号断，逐字不改）
function sentenceFor(note, combo) {
  if (!note) return '';
  for (const s of String(note).split(/[。　]/)) {
    if (s.includes(combo)) return s.trim();
  }
  return '';
}

function verdictOf(sentence) {
  if (!sentence) return null;
  if (COMPARATIVE.test(sentence)) return null; // 同侪高下，非升降
  const down = DOWN_WORDS.filter(w => sentence.includes(w));
  const up = UP_WORDS.filter(w => sentence.includes(w));
  if (down.length && !up.length) return { dir: 'down', hit: down };
  if (up.length && !down.length) return { dir: 'up', hit: up };
  return null; // 兼有或全无：机器不臆断，留给人读原文
}

const showAll = process.argv.includes('--all');
const conflicts = [];
const fixed = [];
let checked = 0;

for (const p of SFP_POS) {
  for (const mv of p.moves || []) {
    const dest = BY[mv.to];
    if (!dest) continue;
    for (const combo of mv.c) {
      checked++;
      const key = `${p.id}|${combo}`;
      const engine = sfpDirOf(p, dest, combo, ORDER);
      if (SFP_DIR_FIX[key]) { fixed.push({ key, dir: engine, why: SFP_DIR_FIX[key].why }); continue; }
      if (engine === 'pure') continue;            // 横超净土另有一路，不入升降之辨
      const sent = sentenceFor(p.note, combo);
      const v = verdictOf(sent);
      if (v && v.dir !== engine) {
        conflicts.push({ door: p.door, pos: p.id, combo, to: mv.to, engine, canon: v.dir, hit: v.hit.join(''), sent });
      }
    }
  }
}

console.log(`核过 ${checked} 条行棋；已依原文裁定 ${fixed.length} 条；与原文措辞相抵 ${conflicts.length} 条。\n`);

if (showAll && fixed.length) {
  console.log('── 已裁定（SFP_DIR_FIX）──');
  for (const f of fixed) console.log(`  ${f.key} → ${f.dir}\n      依据：${f.why}`);
  console.log('');
}

if (!conflicts.length) {
  console.log('未见抵触。');
} else {
  console.log('── 待裁（引擎判定 ≠ 原文措辞）──');
  const byPos = {};
  for (const c of conflicts) (byPos[`门${c.door} ${c.pos}`] ||= []).push(c);
  for (const [pos, list] of Object.entries(byPos)) {
    console.log(`\n【${pos}】`);
    for (const c of list) {
      console.log(`  ${c.combo} → ${c.to}   引擎:${c.engine}  原文措辞:${c.canon}（${c.hit}）`);
      console.log(`      原文：${c.sent}。`);
    }
  }
  console.log('\n注：本表是「待人裁定」清单，不是错误清单——');
  console.log('    机器只认字面升降语，原文亦有「雖…而…」之转折。请逐条读原文定夺，');
  console.log('    确认为误判者补进 src/sfp-rules.js 的 SFP_DIR_FIX（须附原文依据）。');
}

process.exit(0);
