// 玩法與局面路由 —— 答「這局怎麼玩」「我現在處境如何」
//
// 【何以立此一路】
// 舊版六路由皆繫於譜文：位、相、名相、他家講記。可玩家在局中問得最多的一類——
// 「怎麼才算贏」「贈擲是什麼」「我離成佛還有多遠」「下一步會去哪」——譜裡本無此問，
// 於是全數落入拒答。實測 52 個真實問法，拒答率 57.7%，其中三分之一屬此類。
// 而這類問題的答案**遊戲自己全知道**：規則是定的，局面在 payload 裡，行法表查表即得。
// 答不出來不是沒有知識，是沒有這一路。
//
// 【材料之分野】（紀律三：逐字引文／項目釋義／操作規則不得互相冒充）
//   · 譜內引文  → passages，可核可跳，角標所指即此
//   · 操作規則  → 事實段，明署「本項目操作規則」，不綴角標、不冒充譜曰
//   · 當下局面  → 事實段，查表所得
//
// 【不占卜】玩家問「我這局是不是預示我要倒霉」，須明白回絕。
// 這是依教乘所定的圖（敘云「皆本教乘非出臆見」），不是籤筒。此戒寫進了 compose 的 rules 提示詞。

import { lookupTable } from './canon-route.js';
import { searchCorpus, toPassages } from './search.js';
import { POS_BY_NAME, POS_IDS } from './canon.js';

// 玩法之問：規則、勝負、操作、術語（贈擲・首擲・輪相怎麼算）
const PLAY = /怎麼玩|怎么玩|玩法|規則|规则|怎麼擲|怎么掷|怎樣擲|怎样掷|輸贏|输赢|算贏|算赢|勝負|胜负|贏了|赢了|輸了|输了|結束|结束|通關|通关|贈擲|赠掷|贈骰|首擲|首掷|第一擲|第一掷|發始因地|发始因地|兩枚|两枚|兩個輪|两个轮|輪子|轮子|怎麼算|怎么算|存檔|存档|多久|幾次|几次|多少次|落子|判詞|判词/;

// 局面之問：我在哪、我怎麼樣、下一步如何
const SITU = /我現在|我现在|我在哪|我這|我这|這一局|这一局|本局|我的位置|離成佛|离成佛|還有多遠|还有多远|多遠|多远|下一步|下一擲|下一掷|接下來|接下来|會去哪|会去哪|走得好|走得如何|處境|处境|危險|危险|還有救|还有救|怎麼辦|怎么办|能出來|能出去|能出来|上進|上进|怎麼升|怎么升/;

// 占卜之問：須明白回絕，不可順著答。攔在此處只為打標，答語仍由 compose 依戒作答。
const DIVINE = /預示|预示|預兆|预兆|徵兆|征兆|運氣|运气|倒霉|倒楣|吉凶|凶吉|算命|占卜|求籤|求签|抽籤|抽签|命運|命运|是不是說明我|是不是说明我/;

export function isPlay(q) { return PLAY.test(String(q || '')); }
export function isSituation(q) { return SITU.test(String(q || '')); }
export function isDivine(q) { return DIVINE.test(String(q || '')); }

/** 此問是否該走本路 */
export function worthRules(q, hasBoard) {
  const s = String(q || '');
  if (isDivine(s)) return true;                 // 占卜之問必須有人回絕，不可落入「未載」了事
  if (isPlay(s)) return true;
  return hasBoard && isSituation(s);            // 局面之問須有局，無局則無可答
}

// 本項目操作規則。**與 game.js 之 SFP_RULES_A 同源**（2026-08-04 核對逐字相符）——
// 兩處分述而不同步，遲早各說各話；此處若改，那處須一併改。
const OPS = [
  '兩枚輪相各刻「那·謨·阿·彌·陀·佛」六字，合讀正是「南無阿彌陀佛」——擲輪即是稱名。',
  '長按擲鈕，至心稱念一句佛號，念畢鬆手即擲。',
  '第一擲定「發始因地」，此後每擲依當位行法表升降；判詞窗點「行」落子。',
  '那、謨二字下墜，阿、彌、陀、佛四字上升。',
  '兩輪合擲共二十一種輪相，每一位各有其行法表，同一輪相在不同位去向不同。',
  '無輸局：墮三途亦不出譜，仍依本位行法續擲。行至圓教究竟妙覺位即選佛及第，全譜畢局。',
  '「贈擲」者，本擲不移位（或移位後），仍由當前操作者立即續擲一次至數次。',
  '「不行」者，本擲不移位，安住原位。',
  '棋局隨時存檔，可續擲上局。',
].join('\n');

/**
 * 組裝本路材料。
 * @param {string} q     問句
 * @param {object} body  請求體（含局面）
 * @returns {{passages:Array, facts:object, label:string}}
 */
export function buildRules(q, body) {
  // 譜內引文：輪相表法諸塊最切玩法之問（六字表善惡、有升有降之理皆在彼）
  const seed = isPlay(q) || isDivine(q) ? `${q} 輪相 表法 善惡 升降` : q;
  const hits = searchCorpus(seed, { k: 2 });
  const passages = toPassages(hits.filter((h) => h.score >= 12));

  const facts = {
    ops: OPS,
    n: body.n || 0,
    trail: Array.isArray(body.trail) ? body.trail.slice(-8) : [],
    // 中文數字不受核驗之數字閘，阿拉伯數字則須報備——否則「二十一相」寫作「21」即被判憑空
    nums: ['21', '220', '15', '6', '2', String(body.n || 0)],
  };

  // 有局者：現居位、所在門、本位行法表全帶上——「下一步會去哪」之答全在表裡
  const t = lookupTable(posNoOf(body));
  if (t) {
    facts.pos = t.posName;
    facts.posId = t.posId;
    facts.gate = t.gate;
    facts.gateName = t.gateName;
    facts.rows = t.rows;
    // 位名閘以此為準：行法表所列諸去向皆是本局可談之位，不得因未在引文中出現而誤報憑空
    facts.ansDests = t.rows.map((r) => r.to).filter(Boolean);
    if (body.combo) facts.combo = body.combo;
  }
  return { passages, facts, label: '本谱玩法' };
}

/** 從請求體取位序（與 canon-route.parseTarget ① 同則） */
function posNoOf(body) {
  if (body.posName && POS_BY_NAME.has(body.posName)) return POS_BY_NAME.get(body.posName);
  if (body.pos && POS_BY_NAME.has(body.pos)) return POS_BY_NAME.get(body.pos);
  if (body.pos) { const i = POS_IDS.indexOf(body.pos); if (i >= 0) return i; }
  return -1;
}
