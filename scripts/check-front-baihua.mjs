// 卷首卷末四篇 + 后论六段 白话校验（比照 check-pos-baihua.mjs 的口径）
import { SFP_FRONT_BAIHUA, SFP_POST_BAIHUA } from '../src/sfp-front-baihua.js';
import { SFP_CANON_FRONT } from '../src/sfp-canon.js';
import { sfpSplitOf } from '../src/sfp-canon-split.js';
import { SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { SFP_GLOSS } from '../src/sfp-gloss.js';
import { ZH_T2S, ZH_S2T } from '../src/zh-conv.js';

const err = [], warn = [];
const conv = (s, d) => [...String(s)].map((c) => d[c] || c).join('');
const bodyOf = (b) => String(b.v || '') + (b.rows || []).map((r) => r.v).join('') ;

// ① 覆盖：卷首四篇齐、后论六段齐
const wantFront = SFP_CANON_FRONT.map((f) => f.title);
for (const t of wantFront) if (!SFP_FRONT_BAIHUA[t]) err.push(`卷首篇缺白话：${t}`);
for (const k of Object.keys(SFP_FRONT_BAIHUA)) if (!wantFront.includes(k)) err.push(`白话有原文所无之篇：${k}`);

const T = {};
for (const d of Object.values(SFP_CANON_DOORS)) for (const p of d.positions) T[p.name] = String(p.text).replace(/^譜曰。/, '');
const wantPost = Object.keys(T).filter((n) => sfpSplitOf(n, T[n]).post.trim());
for (const n of wantPost) if (!SFP_POST_BAIHUA[n]) err.push(`后论段缺白话：${n}`);
for (const k of Object.keys(SFP_POST_BAIHUA)) if (!wantPost.includes(k)) err.push(`白话有无后论之位：${k}`);

// ② 字形须繁体：名相浮标 GLS_RE 的词键全是繁体形，简体正文一个也匹配不上。
const all = { ...SFP_FRONT_BAIHUA, ...SFP_POST_BAIHUA };
// 本篇对应的原文（白话若照原文用字，即便该字另有繁体异体，也是对的）
const SRC_OF = {};
for (const f of SFP_CANON_FRONT) SRC_OF[f.title] = f.text;
for (const n of wantPost) SRC_OF[n] = sfpSplitOf(n, T[n]).post;
for (const [k, b] of Object.entries(all)) {
  const body = bodyOf(b);
  const s = conv(body, ZH_T2S);
  if (s === body) warn.push(`${k}：折简后无变化（正文可能未用繁体，或恰无简繁异形字）`);
  // 逐字查简体形：ZH_S2T 收「简→繁」，凡 ZH_S2T[c] 存在且不等于 c 者，c 疑是简体写法。
  // （不可反用 ZH_T2S 的值域来判——「升」「丑」「松」「谷」等本字都会被误判，
  //   它们只是恰好另有繁体异体「昇」「醜」「鬆」「穀」，本字在繁体中仍是正字。）
  // 再加一道：该字若在**本篇原文**中同形出现，即是照原文用字，放行——
  //   〈敘選佛譜敘〉的「乙丑年」（丑系地支）「松陵」（地名）即此例，原刻本就作丑、松。
  const src = SRC_OF[k] || '';
  const simp = [...new Set([...body].filter((c) => ZH_S2T[c] && ZH_S2T[c] !== c && !src.includes(c)))];
  if (simp.length) err.push(`${k}：正文含简体字形「${simp.join('')}」→ 应作「${simp.map((c) => ZH_S2T[c]).join('')}」`);
}

// ③ ext 三全
for (const [k, b] of Object.entries(all)) {
  for (const x of b.ext || []) {
    if (!x.v) err.push(`${k}：ext 缺白话 v`);
    if (!x.canon) err.push(`${k}：ext 缺逐字原文 canon`);
    if (!x.src) err.push(`${k}：ext 缺出处 src`);
    else if (!/[TXJB]\d+n[A-Z]?\d+_p\d+[a-c]\d+/.test(x.src)) err.push(`${k}：ext 出处无经号行号 → ${x.src}`);
  }
}

// ④ src 必备
for (const [k, b] of Object.entries(all)) if (!b.src) err.push(`${k}：缺 src`);

// ⑤ 禁语：主句不得出现「谱主」「譜曰」「蕅益大師」署名
for (const [k, b] of Object.entries(all)) {
  const body = bodyOf(b);
  for (const w of ['譜主', '谱主', '譜曰', '谱曰']) {
    if (body.includes(w)) err.push(`${k}：主句含禁语「${w}」`);
  }
}

// ⑥ 名相浮标命中数（繁体键才匹配得上，作正字形的旁证）
const keys = SFP_GLOSS.map((g) => g[0]);
let hit = 0;
for (const b of Object.values(all)) { const body = bodyOf(b); for (const g of keys) if (body.includes(g)) hit++; }

// ⑦ 原文覆盖比：白话字数 / 原文字数
const lenFront = {};
for (const f of SFP_CANON_FRONT) lenFront[f.title] = f.text.length;
console.log('《選佛譜》卷首卷末四篇 · 位下後論六段 白话校验\n');
console.log('① 覆盖');
console.log(`   卷首卷末 ${Object.keys(SFP_FRONT_BAIHUA).length}/${wantFront.length}　后论 ${Object.keys(SFP_POST_BAIHUA).length}/${wantPost.length}`);
console.log('\n② 篇幅比（白话字数 ÷ 原文字数）');
for (const [k, b] of Object.entries(SFP_FRONT_BAIHUA)) {
  const n = bodyOf(b).length, o = lenFront[k];
  console.log(`   ${k.padEnd(8)} 原文 ${String(o).padStart(4)} → 白话 ${String(n).padStart(4)}　比 ${(n / o).toFixed(2)}`);
}
for (const [k, b] of Object.entries(SFP_POST_BAIHUA)) {
  const n = bodyOf(b).length, o = sfpSplitOf(k, T[k]).post.length;
  console.log(`   ${k.padEnd(8)} 后论 ${String(o).padStart(4)} → 白话 ${String(n).padStart(4)}　比 ${(n / o).toFixed(2)}`);
}
console.log(`\n③ ext 补注 ${Object.values(all).reduce((a, b) => a + (b.ext || []).length, 0)} 条，皆带经号行号`);
console.log(`④ 名相浮标命中 ${hit} 处（繁体键命中即证字形无误）`);
if (warn.length) { console.log(`\n提示 ${warn.length} 条：`); warn.forEach((w) => console.log('   · ' + w)); }
if (err.length) { console.error(`\n✗ 不合 ${err.length} 条：`); err.forEach((e) => console.error('   ✗ ' + e)); process.exit(1); }
console.log('\n✓ 六检俱过');
