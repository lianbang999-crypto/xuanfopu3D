#!/usr/bin/env node
// 意圖理解評測（M5 第一步）
//
// 兩條路都要有硬指標：
//   · 無密鑰 → 走正則降級。此路是地基，密鑰失效之日仍須答得出，故**必須全過**。
//   · 有密鑰 → 走模型。口語問法、指代、跨位對比等正則接不住者，看模型能接住幾成。
//
// 用法：
//   node agent/eval/intent-eval.mjs              # 只測降級路（不調模型、不花錢）
//   SILICONFLOW_API_KEY=… node agent/eval/intent-eval.mjs --model   # 併測模型路
//
// 密鑰只從環境變量讀，**不落盤、不入倉**。

import { resolveIntent } from '../worker/src/intent.js';

const useModel = process.argv.includes('--model');
const env = useModel ? { SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY } : {};
if (useModel && !env.SILICONFLOW_API_KEY) {
  console.error('✗ --model 需環境變量 SILICONFLOW_API_KEY');
  process.exit(1);
}

// ── 甲 · 正則接得住者（地基，無密鑰亦須全過）──
const BASE = [
  // [問句, 期望 intent, 期望位名, 期望輪相]
  ['在九法王子住掷得那那为什么不行？', 'explain', '九法王子住', '那那'],
  ['圆十信位掷得阿佛怎么走', 'explain', '圓十信位', '阿佛'],
  ['上品十恶掷出那那会怎样', 'explain', '上品十惡', '那那'],
  ['初住掷得谟谟为何不行', 'explain', '初發心住', '謨謨'],
  ['廣果天擲得阿阿', 'explain', '廣果天', '阿阿'],
  ['圆十信位掷得什么', 'table', '圓十信位', ''],
  ['南赡部洲是什么', 'position', '南贍部洲', ''],
];

// ── 乙 · 正則接不住、須模型者（口語、指代、對比、名相）──
const MODEL_ONLY = [
  ['我现在这一步为什么走不动', 'explain', { posName: '九法王子住', combo: '那那' }],
  ['刚才那个无生忏是什么意思', 'glossary', {}],
  ['别教和圆教的三恶相差在哪', 'compare', {}],
  ['从初发心住到成佛要经过哪些位', 'path', {}],
  ['这一位到底是干什么的', 'position', { posName: '圓十信位' }],
  ['我该不该辞职去出家', 'offtopic', {}],
];

const run = async (list, withCtx) => {
  let ok = 0;
  for (const item of list) {
    const [q, wantIntent, a, b] = item;
    const ctx = withCtx && typeof a === 'object' ? a : {};
    const r = await resolveIntent({ question: q, ...ctx }, env);
    const first = r.targets && r.targets[0];
    let good = r.intent === wantIntent;
    if (good && !withCtx) {
      if (a) good = first && first.posName === a;
      if (good && b !== undefined && b !== '') good = first && first.combo === b;
      if (good && b === '') good = first && !first.combo;
    }
    if (good) ok++;
    const got = `${r.intent || '無'}${first ? `／${first.posName || '?'}${first.combo ? '×' + first.combo : ''}` : ''}`;
    console.log(`  ${good ? '✓' : '✗'} 「${q}」　→ ${got}　[${r.by}]`);
  }
  return ok;
};

console.log(`\n甲 · 正則降級路（地基，須全過）　密鑰：${useModel ? '有（但本組不應用到）' : '無'}`);
const baseOk = await run(BASE, false);
console.log(`  ${baseOk}/${BASE.length}`);

let modelOk = null;
if (useModel) {
  console.log('\n乙 · 模型路（口語・指代・對比・名相——正則接不住者）');
  modelOk = await run(MODEL_ONLY, true);
  console.log(`  ${modelOk}/${MODEL_ONLY.length}`);
} else {
  console.log('\n乙 · 模型路　已跳過（加 --model 併測，須環境變量 SILICONFLOW_API_KEY）');
  console.log('   無密鑰時此類問句一律降級：能解出位相者作 explain，否則交拒答——不強答。');
}

const pass = baseOk === BASE.length;
console.log(`\n${pass ? '✓ 地基全通' : '✗ 地基未過——密鑰失效之日將答不出定本，須先修此'}`);
process.exit(pass ? 0 : 1);
