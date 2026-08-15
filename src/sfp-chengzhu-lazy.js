// 承注库懒装载壳（2026-08-14 切库治本）——sfp-chengzhu.js 是 gen-chengzhu.mjs 的生成件
// （831KB，勿手改），从前随首包静态打入。此壳提供同名同步 API：
//   czOf(位名, 相) —— 预装前返 null（消费处本就 null 容忍；判词收口另有竞速门）；
//   czReady()      —— 动态装载（首帧后闲时预取，掷轮收口兜底等待）；
//   onCzReady(fn)  —— 装载即回调（sfp-evidence 的两段求值期补格循环移居于此）。
// 生成链不动：gen-chengzhu.mjs 照旧产 sfp-chengzhu.js，本壳只改「何时装」不改「装什么」。
let M = null;
let readyP = null;
const hooks = [];

export function czReady() {
  return readyP ||= import('./sfp-chengzhu.js').then((mod) => {
    M = mod;
    for (const f of hooks.splice(0)) { try { f(mod); } catch (e) { console.warn('onCzReady:', e); } }
    return mod;
  });
}
export function czLoaded() { return !!M; }
export function czOf(name, combo) { return M ? M.czOf(name, combo) : null; }
export function czAll() { return M ? M.CZ : null; }
export function onCzReady(f) { if (M) f(M); else hooks.push(f); }
