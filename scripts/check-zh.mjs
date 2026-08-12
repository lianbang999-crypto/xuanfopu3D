#!/usr/bin/env node
// 简繁一体护栏 · npm run check:zh
// ─────────────────────────────────────────────────────────────────────────────
// 【为什么要这道栏】全站曾有三处简繁映射各自维护：
//   ① src/zh-conv.js —— ZH_T2S／ZH_S2T 双向表（OpenCC 字典按本作语料裁剪），前端显示层唯一取值处；
//   ② agent/worker/src/corpus.js 的 S2T —— 智能体问句归一用，**由 agent/gen-corpus.mjs 从 ① 生成**；
//   ③ intent.js／canon-route.js 的 S2T_COMBO —— 只管「谟弥」二字的微表，两处各写一遍。
// ② 虽是生成的，却无人验它与 ① 是否还同步：改了 ① 而忘了重跑生成器，两边就悄悄分家；
// ③ 则是同一张表抄了两份。今立此栏，把「唯一正本」这件事变成可执行的检查。
//
// 【七检】
//   一 · 字典自检：无自映射、单字对单字、键非空
//   二 · 一简多繁清单：T2S 把多个繁体折到同一简体时，S2T 只能选一个还原——
//        另几个即「简→繁不可逆」之字。此表不是错误，是**必须知道的风险面**：
//        校勘之本（原文）一律不走 S2T，正为避此（见 src/sfp-reader.js 的 rawSlot 头注）。
//   三 · 繁体正文回归：全库繁体数据过 S2T 应当**一字不变**（verify.js 早有此断言，此处坐实）
//   四 · 简繁往返：繁 → T2S → S2T 应回到原形，回不去的即二之清单，两处须对得上
//   五 · 生成物同步：按 gen-corpus.mjs 的裁剪规则从 ① 重算，与 corpus.js 里的 S2T 逐条比对
//   六 · 微表归一：全站不得再有第二份硬编码简繁表（③ 已收进 src/zh-conv.js 的 ZH_COMBO_S2T）
//   七 · 语料覆盖（OpenCC 基准）：白话四库＋判词＋名相＋原文六库逐字过全量 OpenCC（tw→cn），
//        凡 OpenCC 会折、裁剪表折不动的字即缺字——2026-08-12 首扫补了 51 单字与
//        29 条「著」助词词组（「这裡」赫然在列），此检保住那次校核不再回退。
//        豁免名单只两字：著（一简多义，单字必错，词组已按语境逐处人工判过）、
//        抬（OpenCC 的 tw 正字化方向怪癖，抬本就是简体形）。语料新增词若再撞缺字，此检即红。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ZH_T2S, ZH_S2T, ZH_COMBO_S2T } = await import(join(ROOT, 'src/zh-conv.js'));

let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (x ? '\n      ' + x : '')); } };

// 最长匹配转换（与 game.js 的 zhWith、worker search.js 的 toTrad 同法）
const MAXLEN = (d) => Math.max(1, ...Object.keys(d).map((k) => k.length));
function conv(s, dict, ml) {
  let r = '', i = 0;
  while (i < s.length) {
    let hit = 0;
    for (let L = Math.min(ml, s.length - i); L >= 1; L--) {
      const seg = s.substr(i, L);
      if (dict[seg] !== undefined) { r += dict[seg]; i += L; hit = 1; break; }
    }
    if (!hit) { r += s[i]; i++; }
  }
  return r;
}
const T2S_ML = MAXLEN(ZH_T2S), S2T_ML = MAXLEN(ZH_S2T);
const toSimp = (s) => conv(s, ZH_T2S, T2S_ML);
const toTrad = (s) => conv(s, ZH_S2T, S2T_ML);

console.log('《選佛譜》简繁一体核验\n');

// ── 一 · 字典自检 ──
console.log('【一 · 字典自检】');
for (const [name, d, ml] of [['ZH_T2S', ZH_T2S, T2S_ML], ['ZH_S2T', ZH_S2T, S2T_ML]]) {
  const empty = Object.entries(d).filter(([k, v]) => !k || !v).map(([k]) => k);
  const lenBad = Object.entries(d).filter(([k, v]) => k.length === 1 && v.length !== 1).map(([k, v]) => k + '→' + v);
  // 自映射（值等于键）只许作幂等保护——拿掉它这条键就会被更短的规则改掉。
  // 拿不掉也无妨者即冗余，须删；否则表里会慢慢堆起一批没人知道为什么在的条目。
  const self = Object.keys(d).filter((k) => d[k] === k);
  const idle = self.filter((k) => {
    const без = { ...d }; delete без[k];
    return conv(k, без, ml) === k;                 // 拿掉后仍不变 → 这条没挡住任何东西
  });
  ok(!empty.length, `${name} 无空键值`, empty.slice(0, 8).join(' '));
  ok(!lenBad.length, `${name} 单字键对单字值`, lenBad.slice(0, 8).join(' '));
  ok(!idle.length, `${name} 自映射 ${self.length} 条皆确有挡用${self.length ? '（' + self.join('、') + '）' : ''}`,
    idle.length ? `冗余：${idle.join('、')}——拿掉也不会被改，应删` : '');
}

// ── 二 · 一简多繁清单 ──
console.log('\n【二 · 一简多繁（简→繁不可逆之字）】');
const bySimp = {};
for (const [t, s] of Object.entries(ZH_T2S)) {
  if (t.length !== 1 || s.length !== 1) continue;
  (bySimp[s] ||= []).push(t);
}
const ambiguous = Object.entries(bySimp).filter(([, ts]) => ts.length > 1)
  .map(([s, ts]) => ({ s, ts, pick: ZH_S2T[s] || '（未收）' }));
console.log('  ' + (ambiguous.length
  ? ambiguous.map((a) => `${a.s}→${a.pick}［${a.ts.join('')}］`).join('　')
  : '（无）'));
ok(ambiguous.every((a) => a.pick === '（未收）' || a.ts.includes(a.pick)),
  '每个一简多繁字的 S2T 取值都在候选内',
  ambiguous.filter((a) => a.pick !== '（未收）' && !a.ts.includes(a.pick)).map((a) => a.s + '→' + a.pick).join(' '));

// ── 三 · 底本异形面：原文若误过 S2T 会被改掉哪些字 ──
// 【这不是要修的 bug，是要守的边界】原文是 CBETA B24n0136 逐字底本，本就是繁体，
//   照理过简→繁应当恒等；实则不然——底本用的是「并」「于」「义」「余」等**古本正字**，
//   而 S2T 服务的是白话与界面语（那里「并」该作「並」、「于」该作「於」）。
//   两者本就不是一回事，故原文一律走 rawShow（繁体态原样返回）而非 zh()，
//   见 src/sfp-reader.js 的 rawSlot 头注与 game.js:3325。
//   此检把「若守不住这条边界会坏掉哪些字」逐处列出，并钉死其规模：
//   数目一变即说明有人往 ZH_S2T 里加了会碰底本的条目，须当场判断该不该加。
const DRIFT_EXPECT = 14;
console.log('\n【三 · 底本异形面（原文一旦误过 S2T 会被改掉之处）】');
const { SFP_CANON_FRONT, SFP_CANON_DOORS } = await import(join(ROOT, 'src/sfp-canon.js'));
const corpus = [];
for (const f of SFP_CANON_FRONT) corpus.push([f.title, f.text]);
for (const dn of Object.keys(SFP_CANON_DOORS)) {
  const d = SFP_CANON_DOORS[dn];
  if (d.intro) corpus.push([`门${dn} 总说`, d.intro]);
  for (const p of d.positions) corpus.push([p.name, p.text]);
}
let chars = 0;
const drift = [], driftChars = new Set();
for (const [name, text] of corpus) {
  chars += text.length;
  const out = toTrad(text);
  if (out === text) continue;
  let first = '';
  for (let i = 0; i < text.length; i++) {
    if (out[i] === text[i]) continue;
    driftChars.add(text[i] + '→' + out[i]);
    if (!first) first = `${name}：「${text.slice(Math.max(0, i - 6), i + 7)}」${text[i]}→${out[i]}`;
  }
  drift.push(first);
}
console.log(`  底本 ${corpus.length} 篇／位　${chars} 字　涉字 ${[...driftChars].join('　')}`);
for (const d of drift) console.log('    · ' + d);
ok(drift.length === DRIFT_EXPECT,
  `底本异形面仍是 ${DRIFT_EXPECT} 处（原文走 rawShow，此面不落到读者眼前）`,
  drift.length > DRIFT_EXPECT
    ? `多出 ${drift.length - DRIFT_EXPECT} 处：新加的 S2T 条目碰了底本用字，请核该条是否该收`
    : `少了 ${DRIFT_EXPECT - drift.length} 处：底本或字典有改动，核对后把 DRIFT_EXPECT 改成 ${drift.length}`);

// ── 四 · 幂等：转一遍与转两遍须同 ──
// 往返（繁→简→繁）本就回不去——异体归并是有损的（剋捨昇穀繫脩蔔製闇雲 十字即是），
//   那是字典的本分，不是毛病。真正该守的是**幂等**：转出来的结果再转一次不许再变，
//   否则同一段文本在界面上切两次简繁就会越切越歪。
console.log('\n【四 · 幂等（转两遍不得再变）】');
const notIdem = [];
// ① 全库底本实扫
const SAMPLE = corpus.map(([, t]) => t).join('');
for (const [name, f] of [['简→繁', toTrad], ['繁→简', toSimp]]) {
  const once = f(SAMPLE), twice = f(once);
  for (let i = 0; i < once.length && once !== twice; i++) {
    if (once[i] !== twice[i]) { notIdem.push(`底本 ${name}：…${once.slice(Math.max(0, i - 5), i + 6)}… ${once[i]}→${twice[i]}`); break; }
  }
}
// ② 逐条测每个词组键本身——单字规则把词组成果又折回去的坑（乾闥婆／征战即此），
//    底本里未必出现，却会在白话、界面语、用户问句里现形，故须逐条测而非只测语料。
for (const [name, d, f] of [['T2S', ZH_T2S, toSimp], ['S2T', ZH_S2T, toTrad]]) {
  for (const k of Object.keys(d)) {
    if (k.length < 2) continue;
    const a = f(k), b = f(a);
    if (a !== b) notIdem.push(`${name} 词组「${k}」→${a}→${b}`);
  }
}
ok(!notIdem.length, `两向转换皆幂等（底本 ${SAMPLE.length} 字 ＋ 词组逐条）`, notIdem.slice(0, 8).join('\n      '));
const lossy = Object.entries(ZH_T2S).filter(([t]) => t.length === 1 && toTrad(ZH_T2S[t]) !== t).map(([t]) => t);
console.log(`  异体归并（繁→简→繁 回不去）${lossy.length} 字：${lossy.join('')}`);

// ── 五 · 生成物同步：corpus.js 的 S2T 与正本重算结果一致 ──
console.log('\n【五 · 生成物同步（worker 语料侧 S2T）】');
const { S2T: WORKER_S2T, BLOCKS } = await import(join(ROOT, 'agent/worker/src/corpus.js'));
// 复算 gen-corpus.mjs 的裁剪规则：只收「书中出现之字」
const inBook = new Set();
for (const b of BLOCKS) for (const c of b.t) inBook.add(c);
const expect = {};
for (const [s, t] of Object.entries(ZH_S2T)) {
  if (s === t) continue;
  if (s.length === 1 && t.length === 1) { if (inBook.has(t)) expect[s] = t; }
  else if ([...t].every((c) => inBook.has(c))) expect[s] = t;
}
// 生成器另从名相反查补条（书中名相的简体形），那批不在 ZH_S2T 里，故只单向查漏不查多
const missing = Object.entries(expect).filter(([k, v]) => WORKER_S2T[k] !== v)
  .map(([k, v]) => `${k}→${v}（现为 ${WORKER_S2T[k] === undefined ? '缺' : WORKER_S2T[k]}）`);
console.log(`  正本裁剪后应收 ${Object.keys(expect).length} 条　worker 侧现有 ${Object.keys(WORKER_S2T).length} 条`);
ok(!missing.length, 'worker 侧 S2T 与正本同步（无缺条、无异值）',
  missing.slice(0, 8).join('\n      ') + (missing.length > 8 ? `\n      …共 ${missing.length} 条。请跑 node agent/gen-corpus.mjs` : ''));

// ── 六 · 微表归一：全站不得再有第二份硬编码简繁表 ──
console.log('\n【六 · 微表归一】');
const SCAN = ['agent/worker/src/intent.js', 'agent/worker/src/canon-route.js', 'agent/worker/src/search.js',
  'agent/worker/src/verify.js', 'src/game.js', 'src/plaza.js', 'src/chalou.js'];
const inline = [];
for (const f of SCAN) {
  let src = '';
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  // 找「字面量简繁表」：形如 { 谟: '謨', … } 或 {"简":"繁"} 的对象字面量（键值皆单个汉字且不同形）
  const re = /\{\s*(?:['"]?[㐀-鿿]['"]?\s*:\s*['"][㐀-鿿]['"]\s*,?\s*){2,}\}/g;
  for (const m of src.match(re) || []) {
    if (/ZH_COMBO_S2T|zh-conv/.test(src.slice(Math.max(0, src.indexOf(m) - 120), src.indexOf(m)))) continue;
    inline.push(`${f}：${m.slice(0, 40)}${m.length > 40 ? '…' : ''}`);
  }
}
ok(!inline.length, '无第二份硬编码简繁表（一律取自 src/zh-conv.js）', inline.join('\n      '));
ok(ZH_COMBO_S2T && Object.keys(ZH_COMBO_S2T).length > 0, 'ZH_COMBO_S2T（轮相六字微表）已立于正本');

// ── 七 · 语料覆盖（OpenCC 基准）──
console.log('\n【七 · 语料覆盖（以 scripts/vendor/opencc.js 全量字典为基准）】');
{
  // wenchao 自托管的 OpenCC（UMD 包，字典内嵌），Node 里用 Function 喂进去即可驱动
  global.self = global;
  const O = {};
  new Function('exports', 'module', readFileSync(join(ROOT, 'scripts/vendor/opencc.js'), 'utf8'))(O, { exports: O });
  const occ = (global.OpenCC || O).Converter({ from: 'tw', to: 'cn' });
  const SRC = ['src/sfp-pos-baihua.js', 'src/sfp-door-baihua.js', 'src/sfp-front-baihua.js',
    'src/sfp-verdict-canon.js', 'src/sfp-gloss.js', 'src/sfp-canon.js'];
  let all = '';
  for (const f of SRC) all += JSON.stringify(await import(join(ROOT, f)));
  all = all.replace(/\\u[\da-f]{4}/gi, (m) => JSON.parse('"' + m + '"'));
  const EXEMPT = new Set(['著', '抬']);            // 缘由见文件头七检说明
  const seen = new Set(), gaps = [];
  for (const c of all) {
    if (seen.has(c) || !/[㐀-鿿]/.test(c)) continue;
    seen.add(c);
    if (ZH_T2S[c] !== undefined || EXEMPT.has(c)) continue;
    const b = occ(c);
    if (b !== c && b.length === 1) gaps.push(c + '→' + b);
  }
  console.log(`  语料 ${all.length} 字（六库并卷）　豁免：${[...EXEMPT].join('、')}`);
  ok(!gaps.length, 'T2S 无缺字（语料在用而裁剪表折不动者）',
    gaps.slice(0, 20).join(' ') + (gaps.length > 20 ? ` …共 ${gaps.length} 字` : ''));
}

console.log(`\n${fail ? '✗' : '✓'} ${fail ? `七检有 ${fail} 处未过` : '七检俱过'}　通过 ${pass}　失败 ${fail}`);
process.exit(fail ? 1 : 0);
