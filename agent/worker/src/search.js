// 譜內全文檢索 —— 遍歷 692 塊，無索引、無向量
//
// 三段：① 實體精確命中　② 全塊掃描打分　③ 取 top-k
// 前二段零成本零延遲；模型只在最後拿到已篩好的譜內原文去組織話。
//
// 打分之要在**義理提要（title）與名相（terms）權重遠高於正文**——
// 那兩者是人工分塊時逐塊寫的，正是為檢索而設；正文則長短懸殊，
// 純按詞頻打分會讓長塊（如八背捨觀 2802 字）恆居前列，反不切題。

import { BLOCKS, ENTITY, KIND, S2T } from './corpus.js';

// 用戶打簡體，語料存底本形（繁）——檢索前先歸一，否則「见惑」永遠匹配不上「見惑」。
// 表只含書中出現之字詞，故最長匹配之代價極小。
const S2T_MAX = Math.max(1, ...Object.keys(S2T).map((k) => k.length));
function toTrad(x) {
  const s = String(x || '');
  let r = '', i = 0;
  while (i < s.length) {
    let hit = 0;
    for (let L = Math.min(S2T_MAX, s.length - i); L >= 1; L--) {
      const g = s.substr(i, L);
      if (S2T[g] !== undefined) { r += S2T[g]; i += L; hit = 1; break; }
    }
    if (!hit) { r += s[i]; i++; }
  }
  return r;
}

/** 歸一：去標點空白校勘記，異體字囘→迴 */
const norm = (t) => String(t || '')
  .replace(/\[[^\]]*\]/g, '')
  .replace(/[()（）\s。，、；：？！「」『』…—·]/g, '')
  .replaceAll('囘', '迴');

// 塊型權重：問答與表法最切題，逐相判與判定表最不切（那是承注庫的活）
const KW = { xu: 1.0, biaofa: 1.3, qa: 1.3, mulu: 0.8, gate: 1.2, table: 0.3, puyue: 1.2, 'puyue-rule': 0.4, end: 0.5 };

// ── 問法橋（2026-08-04 補）──
// 【何以立此】玩家說的是白話，書是文言，二者用詞不同源，bigram 便對不上：
// 「这是谁写的」轉繁後 bigram 為 這是／是誰／誰寫／寫的——書中一個也無，檢索 **0 命中**，
// 遂答「此事《選佛譜》未載」，而卷首明明署「古吳蕅益道人述」。同病者實測九條：
// 人道（書作人天）・成佛（書作妙覺）・竖入（書作豎）・业力（書作業）・做这个图（書在《敘》）。
//
// 【何以不用向量】設計書判本場景為「小語料強結構」，全部可窮舉實體不足六百——
// 為九條問法架一套嵌入模型，是以千鈞之弩射鼷鼠。橋只是把玩家的話翻成書裡的話，
// 零延遲、可逐條審、錯了一眼看得出。**每一條都出自實測失敗問句，非憑空臆造。**
// 【簡繁並收】問句過 toTrad 後仍可能存簡體——S2T 只收「書中出現之字」，
// 而「谁」「幾」之屬書中無之，故轉不動。此表逕以字符類並收兩形，不倚賴歸一。
const ASK2BOOK = [
  [/[誰谁][寫写作著编編]|作者|何人所作/, ['蕅益道人', '選佛譜敘', '述']],
  [/[為为][何什麼么].{0,4}[做作寫写编編].{0,3}[這这此]?[個个]?[圖图譜谱遊游][戲戏]?/, ['選佛譜敘', '蕅益道人']],
  [/大富翁|[飛飞]行棋|骰子|[和跟].{0,6}[遊游][戲戏].{0,4}[區区][別别]/, ['選佛譜敘', '戲']],
  [/迷信|算命|封建/, ['選佛譜敘', '教乘']],
  [/人道|人[間间]|做人/, ['人天', '四洲']],
  [/成佛[是在]|佛位|最[後后]一位|[終终][點点]|最高位/, ['妙覺', '佛果', '究竟']],
  [/[豎竪竖][入出]|一步步[斷断]|慢慢修/, ['豎', '橫超']],
  [/[業业][力報报]|[報报][應应]/, ['業', '十惡', '十善']],
  [/原地不[動动]|走不了|卡住|[沒没][動动]/, ['不行', '安住']],
  [/掉下[來来去]|[墮堕]下|退回|降下/, ['墮', '退']],
  [/第[幾几][門门]|哪一[門门]|屬於哪[門门]/, ['門']],
  // ── 2026-08-12 問譜 v3 首評補三條（ask-eval 甲節實測「未检得」而書中明有）──
  [/[贏赢]|[勝胜]出|[終终][點点局]|通[關关]/, ['妙覺', '佛佛', '成佛']],          // 怎么才算赢 → 譜以成佛（妙覺）為極
  [/[兩两][個个]?[輪轮]|[輪轮]子|[輪轮]相怎/, ['輪相', '表法']],                  // 两个轮子怎么算 → 卷首〈輪相表法〉
  [/首[擲掷]|第一[擲掷]|[開开][局場场]|起手/, ['發始因地', '第一門']],            // 首掷是干嘛的 → 第一發始因地門
];

/** 問句切詞：中文以 bigram 為主，另收實體全名（長者優先，免「初住」搶「初發心住」） */
function terms(q) {
  const s = toTrad(norm(q));
  // 問法橋：命中者把書裡的話補進實體位（權重同名相），使檢索至少取得回相關之塊。
  // 只補不減——原問句之 bigram 照舊參與打分，故不奪正常命中。
  const bridged = [];
  for (const [re, words] of ASK2BOOK) {
    if (re.test(s) || re.test(String(q))) bridged.push(...words);
  }
  const ents = Object.keys(ENTITY)
    .filter((e) => s.includes(e))
    .sort((a, b) => b.length - a.length);
  const used = new Set();
  const kept = [];
  for (const e of ents) {                      // 長實體先佔位，短者若已被含則棄
    if ([...used].some((u) => u.includes(e))) continue;
    kept.push(e); used.add(e);
  }
  const grams = [];
  for (let i = 0; i + 2 <= s.length; i++) grams.push(s.slice(i, i + 2));
  // 橋詞入實體位，且補其 bigram——書中詞未必在 ENTITY 表內（如「豎」「業」單字之屬）
  for (const w of bridged) {
    if (!kept.includes(w)) kept.push(w);
    for (let i = 0; i + 2 <= w.length; i++) grams.push(w.slice(i, i + 2));
  }
  return { ents: kept, grams: [...new Set(grams)] };
}

/**
 * 檢索譜內全文。
 * @param {string} q     問句
 * @param {object} opt   { k 取幾條, kinds 限定塊型 }
 * @returns {Array} [{ block, score, why }]
 */
export function searchCorpus(q, opt = {}) {
  const k = opt.k || 5;
  const { ents, grams } = terms(q);
  if (!ents.length && grams.length < 2) return [];

  const scored = BLOCKS.map((b, idx) => {
    const kind = KIND[b.k];
    if (opt.kinds && !opt.kinds.includes(kind)) return null;
    const ti = norm(b.i), me = b.m.map(norm), tx = norm(b.t), nt = norm(b.n);
    let s = 0; const why = [];

    // ① 實體命中：名相全等最重，其次提要，再次正文
    for (const e of ents) {
      const ne = norm(e);
      if (me.some((m) => m === ne)) { s += 24; why.push('名相:' + e); }
      else if (me.some((m) => m.includes(ne))) { s += 12; why.push('名相含:' + e); }
      if (ti.includes(ne)) { s += 16; why.push('提要:' + e); }
      if (nt.includes(ne)) s += 6;
      if (tx.includes(ne)) { s += 8; why.push('原文:' + e); }
    }
    // ② bigram：提要與名相重，正文輕且封頂——免長塊恆勝
    let gt = 0, gm = 0, gx = 0;
    for (const g of grams) {
      if (ti.includes(g)) gt++;
      if (me.some((m) => m.includes(g))) gm++;
      if (tx.includes(g)) gx++;
    }
    s += gt * 3 + gm * 2 + Math.min(gx, 12) * 0.5;

    s *= (KW[kind] ?? 1);
    return s > 0 ? { idx, block: b, kind, score: s, why: why.slice(0, 4) } : null;
  }).filter(Boolean);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** 檢索結果 → 引文卡（欄位對齊定本路由之 passages，前端內核不分兩套） */
export function toPassages(hits) {
  return hits.map((h) => {
    const b = h.block;
    return {
      title: b.s || b.i,
      text: b.t,
      ref: `《選佛譜》卷第${['','一','二','三','四','五','六'][b.j]}・${b.s}・L${b.l}`,
      juan: b.j, line: b.l,
      posName: '',                       // 譜內全文塊不繫位，故不作跳位
      url: '',
      gloss: b.i,                        // 義理提要——前臺可作出處卡之小標
    };
  });
}
