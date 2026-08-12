// 《選佛譜》四六二〇格白话正本——游戏端唯一取值口。
//
// 正本/门01.js … 门15.js 是逐门校审后的发布数据。过去游戏仍从
// sfp-doorN-why / glyph / stay 等旧层回退取判词，造成“正本写完了，卡上
// 仍可能显示旧句”的双轨。此模块只做两件事：合并十五门、拆开白话与引文；
// 不改写任何正文，也不把项目操作规则混入正本。
import 门01 from '../正本/门01.js';
import 门02 from '../正本/门02.js';
import 门03 from '../正本/门03.js';
import 门04 from '../正本/门04.js';
import 门05 from '../正本/门05.js';
import 门06 from '../正本/门06.js';
import 门07 from '../正本/门07.js';
import 门08 from '../正本/门08.js';
import 门09 from '../正本/门09.js';
import 门10 from '../正本/门10.js';
import 门11 from '../正本/门11.js';
import 门12 from '../正本/门12.js';
import 门13 from '../正本/门13.js';
import 门14 from '../正本/门14.js';
import 门15 from '../正本/门15.js';

export const SFP_VERDICT_CANON = Object.freeze({
  ...门01, ...门02, ...门03, ...门04, ...门05,
  ...门06, ...门07, ...门08, ...门09, ...门10,
  ...门11, ...门12, ...门13, ...门14, ...门15,
});

export const SFP_VERDICT_CANON_COUNT = Object.keys(SFP_VERDICT_CANON).length;
if (SFP_VERDICT_CANON_COUNT !== 4620) {
  throw new Error(`白话正本条数 ${SFP_VERDICT_CANON_COUNT}，应为 4620`);
}

export function sfpCanonVerdict(position, combo) {
  // 游戏终位 ID 与原谱位题不同；第十五门正本仍依原谱题名“佛”立键。
  const name = position === '圓教究竟妙覺位' ? '佛' : String(position || '');
  const raw = SFP_VERDICT_CANON[`${name}|${combo}`];
  if (!raw) return null;
  const at = String(raw).indexOf('‖');
  if (at < 0) return { raw: String(raw), plain: String(raw).trim(), quote: '' };
  return {
    raw: String(raw),
    plain: String(raw).slice(0, at).trim(),
    quote: String(raw).slice(at + 1).trim().replace(/^譜曰[：:]\s*/, ''),
  };
}

// ── 「譜曰」与「承前」之判分 ────────────────────────────────────────────────
// 2026-08-11 实测：4620 格的 ‖ 出处里，只 1786 格是本位原文，另 2834 格系承前引文——
//   原谱多处行法承前（如门1〈見取〉一句「其餘位中。以阿彌陀善。與那謨惡相為對治」
//   管着全谱几十位的那阿等六相），承注库校审时照实引了来源处的原文。
//   若一概题作「谱曰」，读者会把别位的话当成本位的话——这是无声的错引。
// 判分纯据数据比对（标点归一后看是否为本位原文的子串），不改判词一字。
//
// 【何以立在此处】这问的是「‖ 右半句是不是本位自己的话」，属本模块所辖数据的属性，
//   不是某张卡或阅读器的排版事。阅读器（sfp-reader.js）与位卡（game.js）共用此一处，
//   两边各写一遍必然漂移。只出 kind，不出标签串——阅读器题「譜曰／承前」，
//   位卡题「谱曰 · 本掷／承前 · 本掷」，措辞各归卡面。
export function sfpCanonNorm(s) {
  return String(s == null ? '' : s).replace(/[。、，；：？！「」『』（）()\s]/g, '');
}
// ownText＝本位位文（已去「譜曰。」前缀）；quote＝sfpCanonVerdict().quote
// 返回 'own'（本位原文逐字）｜'cite'（承自他位或门首）｜''（无引文）
export function sfpQuoteKind(ownText, quote) {
  if (!quote) return '';
  return sfpCanonNorm(ownText).includes(sfpCanonNorm(quote)) ? 'own' : 'cite';
}
