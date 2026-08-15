// 《選佛譜》四六二〇格白话正本——游戏端唯一取值口。
//
// 正本/门01.js … 门15.js 是逐门校审后的发布数据。过去游戏仍从
// sfp-doorN-why / glyph / stay 等旧层回退取判词，造成“正本写完了，卡上
// 仍可能显示旧句”的双轨。此模块只做两件事：合并十五门、拆开白话与引文；
// 不改写任何正文，也不把项目操作规则混入正本。
//
// ── 内部动态装载（2026-08-14 切库治本，发起人定案）──────────────────────
// 十五门 1.6MB 从前随首包静态打入——首屏 JS gzip 逾一兆、点了钮半天无响应的病根之一。
// 今改内部 import()：同名同步 API 一字不动（sfpCanonVerdict 预装前返 null，调用处本就
// null 容忍），装载三路见者先得：
//   ① sfpVerdictCanonReady()——整块动态 chunk（首帧后闲时预取；块到手即离线自足）；
//   ② sfpVerdictCanonSeed()——正本 API（api.foyue.org）单位取格的应急籽，掷时块未到先垫上
//      （键式与「白话‖引文」定式与本库一致，籽只济急，块到即以块为准）；
//   ③ 全不到＝返 null，判词卡降级走 why 家族白话（仍在首包），不空手。
// 4620 之数断言随装载走（见 ready）；COUNT 为定数常量，供自测钩子与自检。
let MAP = null;                    // 十五门合并本（Object.freeze）；未装载时为 null
const SEED = {};                   // 掷时应急籽：`位名|相` → 「白话‖引文」原式
let readyP = null;

export function sfpVerdictCanonReady() {
  return readyP ||= Promise.all([
    import('../正本/门01.js'), import('../正本/门02.js'), import('../正本/门03.js'),
    import('../正本/门04.js'), import('../正本/门05.js'), import('../正本/门06.js'),
    import('../正本/门07.js'), import('../正本/门08.js'), import('../正本/门09.js'),
    import('../正本/门10.js'), import('../正本/门11.js'), import('../正本/门12.js'),
    import('../正本/门13.js'), import('../正本/门14.js'), import('../正本/门15.js'),
  ]).then((ms) => {
    const merged = Object.freeze(Object.assign({}, ...ms.map((m) => m.default)));
    const n = Object.keys(merged).length;
    if (n !== 4620) throw new Error(`白话正本条数 ${n}，应为 4620`);
    MAP = merged;
    return MAP;
  });
}
export function sfpVerdictCanonLoaded() { return !!MAP; }
/** 掷时应急籽（正本 API 单位取格）：cells＝{ '位名|相': '白话‖引文' }。块已到则籽无用武。 */
export function sfpVerdictCanonSeed(cells) { if (cells) Object.assign(SEED, cells); }

export const SFP_VERDICT_CANON_COUNT = 4620;

export function sfpCanonVerdict(position, combo) {
  // 游戏终位 ID 与原谱位题不同；第十五门正本仍依原谱题名“佛”立键。
  const name = position === '圓教究竟妙覺位' ? '佛' : String(position || '');
  const raw = MAP ? MAP[`${name}|${combo}`] : SEED[`${name}|${combo}`];
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
