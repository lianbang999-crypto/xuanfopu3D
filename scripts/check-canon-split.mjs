// 位文切点表核验 · 诚实闸门
// 切点表（src/sfp-canon-split.js）把每位原文切成「义解段｜行法段｜后论」，阅读器据此
//   连读义解、另作廿一相表。切错的后果不是排版难看，是把谱主的逐组按语混进义解连读，
//   或反之把义解半句挂到某一相名下——两者都是无声的错引。故逐条量给数字，不靠自觉。
// 运行：node scripts/check-canon-split.mjs（或 npm run check:split）
//
// 七检：
//   ① 条数与键：220 条，键与 SFP_CANON_DOORS 位名一一对应，不多不少
//   ② 锚串唯一：act 与 post 在本位原文中各恰好命中一次（indexOf 定位才不会漂）
//   ③ 段序：post 须在 act 之后——否则三段颠倒
//   ④ 义解非空：act 不得落在篇首，那等于说本位没有义解
//   ⑤ 义解不含逐组按语：义解段内不得残留「句首即轮相组」的句子（漏切信号）
//   ⑥ null 位确无按语：判为 null 者，其位文中不得有「句首即轮相组」的句子
//   ⑦ 人工核定锁：未标「人工核定」者，其 act 须与机器规则（句首轮相组）相符——
//      锁住 2026-08-11 逐门逐位核定的结果，让日后原文校勘或规则改动引起的漂移无处遁形。
//      ⑤⑥两检对人工核定位放行（那正是机器判不了才逐位读原文定的），②③④仍验。
import { SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { SFP_CANON_SPLIT, SFP_CANON_SPLIT_COUNT, sfpSplitOf } from '../src/sfp-canon-split.js';
import { readFileSync } from 'node:fs';

const G = '那謨阿彌陀佛';
// 佛名与音译整串先挖成占位符，免把「念阿彌陀佛」的「阿彌」、「梵語阿那含」的「阿那」误认作轮相
const NAME_RE = /南無阿彌陀佛|那謨阿彌陀佛|阿彌陀佛|彼佛阿彌陀|阿彌陀經|彌陀要解|彌陀經|阿那含|阿羅漢|阿鼻|阿脩羅|阿修羅|阿僧祇|阿賴耶|陀羅尼|須陀洹|阿闍梨|阿含/g;
const LEAD = /^(故|則|今|其|唯|惟|若|至|乃至|而|又|亦|是以|所以|自|從|由|以|至於|下|上|其餘|餘|然|但|雖)+/;
const COMBO = new RegExp('^[' + G + '][' + G + ']');
const mask = (s) => s.replace(NAME_RE, (m) => '＊'.repeat(m.length));
const headCombo = (s) => COMBO.test(mask(s).replace(LEAD, ''));

// 机器规则：首个「句首即轮相组」的句子起始偏移；-1＝无
function autoCut(t) {
  let off = 0;
  for (const seg of t.split('。')) {
    const s = seg.trim();
    if (s && headCombo(s)) return off + seg.indexOf(s);
    off += seg.length + 1;                       // +1 补回被 split 吃掉的「。」
  }
  return -1;
}

// 表源里带「人工核定」标记的位（第⑦检用）
const SRC = readFileSync(new URL('../src/sfp-canon-split.js', import.meta.url), 'utf8');
const MANUAL = new Set();
for (const m of SRC.matchAll(/^\s{2}(\S+?):\s*(?:'[^']*'|\{[^}]*\}|null),\s*\/\/\s*人工核定/gm)) MANUAL.add(m[1]);

const err = [], warn = [];
const posOf = {};
for (const [dn, d] of Object.entries(SFP_CANON_DOORS)) {
  for (const p of d.positions) posOf[p.name] = { door: +dn, text: String(p.text).replace(/^譜曰。/, '') };
}

// ① 条数与键
if (SFP_CANON_SPLIT_COUNT !== 220) err.push(`切点表 ${SFP_CANON_SPLIT_COUNT} 条，应为 220`);
for (const k of Object.keys(SFP_CANON_SPLIT)) if (!posOf[k]) err.push(`表中有原文所无之位：${k}`);
for (const n of Object.keys(posOf)) {
  if (!Object.prototype.hasOwnProperty.call(SFP_CANON_SPLIT, n)) err.push(`原文有位而表中缺条：${n}`);
}

let nAct = 0, nPost = 0, nNull = 0, nManual = 0;
const short = [];
for (const [name, v] of Object.entries(SFP_CANON_SPLIT)) {
  const p = posOf[name];
  if (!p) continue;
  const t = p.text;
  const auto = autoCut(t);
  const isManual = MANUAL.has(name);
  if (isManual) nManual++;

  const act = v === null ? null : (typeof v === 'string' ? v : v.act);
  const post = v && typeof v === 'object' ? v.post : null;

  if (!act) {
    nNull++;
    // ⑥ null 位确无逐组按语（人工核定者放行——如〈出世定學〉配相嵌于四分类叙述）
    if (auto >= 0 && !isManual) {
      err.push(`【${name}】表判无行法段，但原文第 ${auto} 字起有「${t.substr(auto, 14)}」——疑漏判，且未标「人工核定」`);
    }
    continue;
  }

  nAct++;
  // ② 锚串唯一
  const hitA = t.split(act).length - 1;
  if (hitA === 0) { err.push(`【${name}】act 串不在原文中：「${act}」`); continue; }
  if (hitA > 1) { err.push(`【${name}】act 串命中 ${hitA} 次，不唯一：「${act}」`); continue; }
  const at = t.indexOf(act);

  let pt = -1;
  if (post) {
    nPost++;
    const hitP = t.split(post).length - 1;
    if (hitP === 0) { err.push(`【${name}】post 串不在原文中：「${post}」`); continue; }
    if (hitP > 1) { err.push(`【${name}】post 串命中 ${hitP} 次，不唯一：「${post}」`); continue; }
    pt = t.indexOf(post);
    // ③ 段序
    if (pt <= at) err.push(`【${name}】post 在第 ${pt} 字、act 在第 ${at} 字——后论不在行法段之后`);
  }

  // ④ 义解非空
  if (at === 0) err.push(`【${name}】切点落在篇首，本位遂无义解段`);
  else if (at < 8) short.push(`${name}(${at}字)`);

  // ⑤ 义解段不得残留逐组按语（人工核定者放行）
  const leak = t.slice(0, at).split('。').map((x) => x.trim()).filter((x) => x && headCombo(x));
  if (leak.length && !isManual) {
    err.push(`【${name}】义解段内残留逐组按语：「${leak[0].slice(0, 18)}」——疑切晚，且未标「人工核定」`);
  }

  // ⑦ 人工核定锁
  if (auto !== at && !isManual) {
    err.push(`【${name}】机器切点在第 ${auto} 字、表中在第 ${at} 字，却未标「人工核定」`);
  }
  if (auto === at && isManual && !post) warn.push(`【${name}】机器已能判对，「人工核定」标记可撤`);

  // 三段切分自检：拼回去须与原文逐字相等（sfpSplitOf 是阅读器的取值口，此处一并验）
  const s = sfpSplitOf(name, t);
  if (s.jie + s.act + s.post !== t) err.push(`【${name}】sfpSplitOf 三段拼回与原文不等——切分函数有误`);
}

if (short.length) warn.push(`义解段短于 8 字者 ${short.length} 位：${short.join('、')}`);

console.log('《選佛譜》位文切点表核验');
console.log(`  条数 ${SFP_CANON_SPLIT_COUNT}／220　有行法段 ${nAct}　另有后论 ${nPost}　无行法段 ${nNull}　人工核定 ${nManual}`);
if (warn.length) { console.log(`\n提示 ${warn.length} 条：`); warn.forEach((w) => console.log('  · ' + w)); }
if (err.length) {
  console.error(`\n✗ 不合 ${err.length} 条：`);
  err.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log('\n✓ 七检俱过');
