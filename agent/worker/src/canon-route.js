// 定本路由 —— 位 × 相精確命中，零檢索
//
// 此路由之所以不需要向量檢索：位×相是一組**可枚舉的有限鍵**（220 × 21 ＝ 4620），
// 精確查表即得答語與逐字引文。問文鈔那條鏈路（向量召回 → RRF → 重排 → top-k）
// 是為「不知道答案在哪一段」而設的；我們知道，而且逐格審定過。
//
// 故本路由**不調用生成模型**：答語即承注庫已審定之白話，引文即該格所繫之逐字原文。
// 但形態仍是 NotebookLM 的——流式吐出、角標可點、出處可跳、可追問。
// 追問與自由問句走路由②③（M5），那裡才需要模型組織。

import { ANS, CITE, PLAIN, POS, POS_IDS, POS_BY_NAME, ALIAS, CELLS, GATES, ANS_DESTS } from './canon.js';

// 位名檢索表：繁簡兼收。用戶在遊戲裡打的是簡體，位名底本是繁體——
// 不兩收則「圆十信位」永遠匹配不上「圓十信位」，只剩單字「佛」誤中。
const NAME_LOOKUP = [];
POS.forEach((p, i) => { NAME_LOOKUP.push([p.n, i]); if (p.s) NAME_LOOKUP.push([p.s, i]); });
for (const [a, no] of Object.entries(ALIAS)) NAME_LOOKUP.push([a, no]);
// 長名先試：「初住」不得搶在「初發心住」之前中的
NAME_LOOKUP.sort((a, b) => b[0].length - a[0].length);

// ── 二十一相：標準十五序 ＋ 相雜六相 ──
export const COMBOS = [
  '那那', '那謨', '謨謨', '阿阿', '阿彌', '彌彌', '阿陀', '彌陀', '陀陀',
  '那佛', '謨佛', '阿佛', '彌佛', '陀佛', '佛佛',
  '那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀',
];

// 用戶可能用簡體輸入（謨→谟、彌→弥），輪相字須歸一
const T2S_COMBO = { 謨: '谟', 彌: '弥' };
const S2T_COMBO = { 谟: '謨', 弥: '彌' };
const toTradCombo = (s) => String(s || '').replace(/[谟弥]/g, (c) => S2T_COMBO[c]);
const COMBO_SET = new Set(COMBOS);

const VERDICT = ['行', '不行', '無行法'];

// 指代詞：用戶不報位名相名，只說「這一位」「現在這步」者，方以局面補全。
// 無指代亦無位相意向之問（「怎麼玩」「你是誰」），一概不補——補則必誤，見下。
const DEICTIC = /這一位|这一位|這一格|这一格|這一步|这一步|現在這|现在这|剛才這|刚才这|這一擲|这一掷|我現在|我现在|當前|当前|本位|這裡|这里|此位|這位|这位/;

// 但有指代**仍不足**以補全：須所問確係「這一擲何以如此」，方是那一格的事。
// 「我現在這步為何這樣走」問的是本擲緣由，補得；
// 「我現在擲什麼最好」「我現在在哪」問的是策略與方位，補了就答非所問——
// 那兩類該走玩法路（rules），在那裡連行法表一併講，才是玩家要的。
const ABOUT_MOVE = /為什麼|为什么|為何|为何|何以|怎麼走|怎么走|如何走|怎麼行|怎么行|去哪|往哪|走到哪|這樣走|这样走|怎麼回事|怎么回事|什麼意思|什么意思|如何解|怎麼解|怎么解/;

/**
 * 從請求體與問句解析出位與相。
 *
 * **優先級之教訓（2026-08-04 改）**：舊版把前端傳的 pos/combo 無條件置於問句之前，
 * 而前端每問都隨手帶上現居位與最近一擲——於是玩家在局中無論問什麼，
 * 都被判成「現居位×最近相」那一格。實測 52 個不同問句（「這個遊戲怎麼玩」
 * 「什麼是橫超」「你是誰」「我該不該出家」）全部返回同一答，佔滿六路由中的定本一路，
 * 模型連調都沒調。捷徑吞掉了整個問答。
 *
 * 故今分三層，**問句永遠先讀**：
 *   ① ask:'reading'  「AI 解讀」按鈕，問句由 askQFor 模板生成，位相必帶且問的必是那一格——
 *                     惟明署此標者方走捷徑
 *   ② 問句自解       位名取最長匹配，輪相取二十一相之一
 *   ③ 指代補全       問句確有指代詞（「這一位」「現在這步」），方以局面補其未及者
 */
export function parseTarget(body) {
  const out = { posNo: -1, combo: '', from: '' };

  // 局面所帶之位相：只作備料，用不用看下文三層
  let payPos = -1;
  if (body.posName && POS_BY_NAME.has(body.posName)) payPos = POS_BY_NAME.get(body.posName);
  else if (body.pos && POS_BY_NAME.has(body.pos)) payPos = POS_BY_NAME.get(body.pos);
  else if (body.pos) {
    const i = POS_IDS.indexOf(body.pos);          // pos 亦可為位 id
    if (i >= 0) payPos = i;
  }
  const payCombo = COMBO_SET.has(toTradCombo(body.combo)) ? toTradCombo(body.combo) : '';

  // ① 明署「AI 解讀」者直取
  if (body.ask === 'reading' && payPos >= 0 && payCombo) {
    return { posNo: payPos, combo: payCombo, from: 'payload' };
  }

  // ② 從問句解析。位名取最長匹配，免「初住」誤中於「初發心住」之外的短名
  const q = toTradCombo(String(body.question || ''));
  for (const c of COMBOS) if (q.includes(c)) { out.combo = c; break; }
  // 單字位名（門十五之「佛」）不參與問句匹配——問句裡幾乎必有「佛」字，中則必誤
  for (const [name, no] of NAME_LOOKUP) {
    if (name.length >= 2 && q.includes(name)) { out.posNo = no; break; }
  }
  if (out.posNo >= 0 && out.combo) { out.from = 'question'; return out; }

  // ③ 指代補全。三道閘一起把關：有指代詞、所問確係本擲緣由、局面備得位相——
  //    「我現在這步為何這樣走」補得；
  //    「我現在餓了」無指代所指，補不得；
  //    「我現在擲什麼最好」有指代卻不問本擲緣由，亦不補——那是玩法路的事。
  const deictic = DEICTIC.test(q) && ABOUT_MOVE.test(q);
  if (deictic) {
    if (out.posNo < 0 && payPos >= 0) out.posNo = payPos;
    if (!out.combo && payCombo) out.combo = payCombo;
    if (out.posNo >= 0 && out.combo) { out.from = 'deictic'; return out; }
  }
  return out;
}

/** 取該格全部定本材料。命中即返回，未命中返回 null（交由上層轉路由②或拒答）。 */
export function lookup(posNo, combo) {
  if (posNo < 0 || !COMBO_SET.has(combo)) return null;
  const pid = POS_IDS[posNo];
  const row = CELLS[pid];
  if (!row || !row[combo]) return null;
  const [vc, ai, cis, pi, to, grant] = row[combo];
  const p = POS[posNo];
  const gate = GATES.find((g) => g.no === p.g);
  return {
    posNo, posId: pid, posName: p.n, gate: p.g, gateName: gate ? gate.t : '', anchor: p.a,
    posPlain: p.p >= 0 ? PLAIN[p.p] : '',      // 位義白話（這一位是什麼）
    puyue: p.y >= 0 ? ANS[p.y] : '',           // 本位譜曰全文
    combo,
    verdict: VERDICT[vc],
    答: ANS[ai],
    白話: pi >= 0 ? PLAIN[pi] : '',
    引: cis.map((i) => CITE[i]),
    to: to >= 0 ? { no: to, id: POS_IDS[to], name: POS[to].n, gate: POS[to].g } : null,
    grant,
    // 本答語所覆蓋諸格之位名與去向並集——一句常管數格（「那那猶為上畜。那謨猶為畜脩」一句管三），
    // 核驗答語所稱之位時須以此為準，否則必誤報
    ansDests: ANS_DESTS[ai] || [],
  };
}

/** 引文卡 → NotebookLM 之 passages（欄位名對齊問文鈔 ai-core.js，前端內核可直接複用） */
export function toPassages(hit) {
  return hit.引.map((c, i) => ({
    title: c.n || hit.posName,                 // 所出之位名——點開即知引的是本位還是他位
    text: c.t,                                 // 逐字原文（底本形；前臺繁簡由遊戲設定之 OpenCC 開關統管）
    ref: c.r,                                  // 「《選佛譜》卷第六・初發心住・L57」
    juan: c.j, line: c.l,
    posName: c.n || '',                        // 遊戲內跳位用
    url: c.n ? `#pos=${encodeURIComponent(c.n)}` : '',
  }));
}

/**
 * 組answer：承注庫白話為主體，角標已在庫中就位。
 * 單引文格（4360 格）庫中白話無角標，此處補綴 [1]——一條引文，通篇即依此一條。
 */
export function composeAnswer(hit) {
  const n = hit.引.length;
  let body = hit.白話 || hit.答;
  if (n === 1 && !/\[\d\]/.test(body)) {
    body = body.replace(/[。！？]?\s*$/, '') + '[1]。';
  }
  const head = hit.verdict === '無行法'
    ? `${hit.posName} · 掷得「${hit.combo}」→ 已至究竟，本无行法`
    : hit.verdict === '不行'
      ? `${hit.posName} · 掷得「${hit.combo}」→ 不行，安住原位`
      : hit.grant
        ? `${hit.posName} · 掷得「${hit.combo}」→ 赠掷 ${hit.grant} 次`
        : `${hit.posName} · 掷得「${hit.combo}」→ ${hit.to ? hit.to.name : ''}`;
  return { head, body };
}

/** 取一位之本體：位義白話（這是什麼位）＋ 本位譜曰（依據）。供「問某位是什麼」之用。 */
export function lookupPosition(posNo) {
  if (posNo < 0 || posNo >= POS.length) return null;
  const p = POS[posNo];
  const gate = GATES.find((g) => g.no === p.g);
  return {
    posNo, posId: POS_IDS[posNo], posName: p.n, gate: p.g, gateName: gate ? gate.t : '', anchor: p.a,
    plain: p.p >= 0 ? PLAIN[p.p] : '',
    puyue: p.y >= 0 ? ANS[p.y] : '',
  };
}

/** 一位之行法表：二十一相各往何處。問「某位擲得什麼」者所求即此。 */
export function lookupTable(posNo) {
  const base = lookupPosition(posNo);
  if (!base) return null;
  const row = CELLS[POS_IDS[posNo]] || {};
  const rows = COMBOS.filter((c) => row[c]).map((c) => {
    const [vc, , , , to, grant] = row[c];
    return {
      combo: c,
      verdict: VERDICT[vc],
      to: to >= 0 ? POS[to].n : null,
      grant: grant || 0,
    };
  });
  return { ...base, rows };
}

/** 定本事實（發給前端）：渲去向按鈕之所需，僅此而已 */
export function toFacts(hit) {
  return {
    pos: hit.posName, posId: hit.posId, gate: hit.gate, gateName: hit.gateName,
    combo: hit.combo, verdict: hit.verdict,
    to: hit.to ? hit.to.name : null, toId: hit.to ? hit.to.id : null,
    grant: hit.grant || 0, anchor: hit.anchor,
  };
}

/** 核驗用事實：多帶 ansDests（本答語所覆蓋諸格之去向並集）。
 *  此係內部結構，不隨 meta 發往前端——既省帶寬，亦不洩漏內部欄位（紀律三）。 */
export function toVerifyFacts(hit) {
  return { ...toFacts(hit), ansDests: hit.ansDests || [] };
}
