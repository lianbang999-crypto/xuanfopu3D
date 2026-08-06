// 斷言級引文核驗 —— 設計書紀律一
//
// 舊智能體只校驗帶引號的直引，故那句「萬歷己巳年（1599年）…1368字」查不出來：
// 它是**無引號的裸陳述**。新版把答語中的四類 token 一併回查——
//   直引（「」內）· 位名 · 門號 · 數字
// 凡不能在所引段落或定本事實中逐字找到者，即剝除或降級。
//
// 與問文鈔之別：那邊 validateCitations 只能作「遙測信號，不改寫已輸出內容」——
// 流式吐完才檢出，來不及。定本路由的答語與引文皆出自承注庫（expand.mjs 已逐字校過底本），
// 故此處是**斷言**：不通過即是數據出了岔子，當報錯，不當降級蒙混。
//
// 繁簡：白話庫已統一底本形（繁），與引文同形，故此處**嚴格逐字比**，不再需要
// 簡體歸一串與「逐字皆在乾草堆中」那種寬校。用戶側繁簡由前端 zh() 一鍵切換，
// 數據層不隨之變（game.js 之 zh() 雙向，繁體文本過 S2T 實測變動 0 條）。

import { POS, POS_BY_NAME } from './canon.js';

/** 歸一：去校勘記、括注、空白、標點；異體字囘→迴。不作繁簡轉換。 */
const cmp = (t) => String(t || '')
  .replace(/\[[^\]]*\]/g, '')
  .replace(/[()（）\s。，、；：？！「」『』…—·]/g, '')
  .replaceAll('囘', '迴');

/** 繁體側逐字可尋（支持「……」分段） */
function verbatimIn(hay, text) {
  const H = cmp(hay);
  if (!H) return false;
  return String(text).split('……').every((seg) => !cmp(seg) || H.includes(cmp(seg)));
}

const GATE_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
const CN_NUM = '零一二三四五六七八九十百千萬万';
const POS_NAME_SET = new Set([...POS_BY_NAME.keys()]);
// 譜曰多用簡稱，且截法不一：或去後綴（「無財」之於無財鬼），或去前綴（「內院」之於彌勒內院）。
// 白話展簡稱為全名是正譯，不當報為憑空添位。判據取「全名有過半連續字見於原文」——
// 既豁免各種簡稱，又仍攔得住真憑空之位（憑空者一字不著，遑論過半）。
// 通用後綴（淨土／天／位…）諸位共有，比對前先剝去，只以區別詞計——
// 否則「常寂光淨土」須三字連續方算，而譜曰只作「寂光」，正譯反被誤報。
const CORE = (n) => {
  const c = String(n || '').replace(/(淨土|净土|三昧|地獄|地狱|天|位|地|王|洲|觀|观|禪|禅|懺|忏|戒|心|果)+$/u, '');
  return c.length >= 2 ? c : String(n || '');
};
function abbrevSeen(full, hayNorm) {
  if (!full || !hayNorm) return false;
  full = CORE(full);
  const need = Math.max(2, Math.ceil(full.length / 2));
  for (let len = full.length; len >= need; len--) {   // 起於全長：剝去通用後綴後恰等於閾值者亦須試
    for (let i = 0; i + len <= full.length; i++) {
      if (hayNorm.includes(full.slice(i, i + len))) return true;
    }
  }
  return false;
}


/**
 * @param {string} answer   答語（含 [n] 角標）
 * @param {Array}  passages 引文卡；帶 citeNo 者用預生成之簡體歸一串比對
 * @param {object} facts    定本事實（位名、門號、去向、答語級去向並集…）
 * @returns {{ok:boolean, checks:object, issues:Array}}
 */
export function verifyAnswer(answer, passages, facts) {
  const A = String(answer || '');
  const issues = [];
  // 乾草堆除引文外，另收兩樣**本路自報的確定事實**：
  //   · facts.ops    操作規則（玩法路）。非譜文，不入 passages、不受角標所指，
  //                  但答語依它而說是正當的——不收則玩法之答句句被判憑空。
  //   · 門名位名相名 查表所得。曾誤報「直引『欲界人天門』非引文所有」——
  //                  那門名正是本路親手發給模型的事實，反過來判它憑空，是自己不認自己的話。
  const F = facts || {};
  const hay = passages.map((p) => p.text).join('\n')
    + (F.ops ? '\n' + F.ops : '')
    + '\n' + [F.pos, F.to, F.gateName, F.combo, ...(F.ansDests || [])].filter(Boolean).join('\n');
  const hayN = cmp(hay);

  // ① 角標不得越界
  const tags = [...A.matchAll(/\[(\d{1,2})\]/g)].map((m) => +m[1]);
  const bad = tags.filter((n) => n < 1 || n > passages.length);
  if (bad.length) issues.push({ kind: 'cite-range', detail: `角標 [${bad.join('][')}] 越界（引文僅 ${passages.length} 條）` });

  // ② 直引須逐字對得上。引號亦用於標舉專名（位名、輪相名），是專名即非直引。
  const quotes = [...A.matchAll(/[「『]([^」』]{4,})[」』]/g)].map((m) => m[1]);
  for (const q of quotes) {
    if (POS_NAME_SET.has(q) || /^[那謨阿彌陀佛]{2,4}$/.test(q)) continue;
    if (!verbatimIn(hay, q)) issues.push({ kind: 'quote', detail: `直引「${q.slice(0, 24)}」非引文所有` });
  }

  // ③ 位名：答語所稱之位，須為**本答語所覆蓋諸格**之去向、本位，或引文所出之位。
  //    一句常管數格——「那那猶為上畜。那謨猶為畜脩。謨謨猶為有財鬼」一句管三格，
  //    只比本格去向則三分之二必誤報。故以 ansDests（答語級並集）為準。
  const allowedIdx = new Set();
  const addAllowed = (name) => { const i = POS_BY_NAME.get(name); if (i !== undefined) allowedIdx.add(i); };
  [facts.pos, facts.to, ...(facts.ansDests || [])].filter(Boolean).forEach(addAllowed);
  passages.forEach((p) => { if (p.posName) addAllowed(p.posName); });

  const stray = [];
  POS.forEach((p, i) => {
    if (p.n.length < 3 || allowedIdx.has(i)) return;
    if (!A.includes(p.n)) return;
    if (verbatimIn(hay, p.n)) return;                 // 引文原文本有者不論
    if (abbrevSeen(cmp(p.n), hayN)) return;           // 原文用簡稱、白話展全名者不論
    stray.push(p.n);
  });
  if (stray.length) issues.push({ kind: 'position', detail: `答語稱及本格所無之位「${stray.join('、')}」` });

  // ④ 門號：答語稱「第N門」者，須合本格門號
  const doors = [...A.matchAll(new RegExp(`第([${CN_NUM}\\d]{1,3})[門门]`, 'g'))].map((m) => m[1]);
  if (doors.length && facts.gate) {
    const want = new Set([String(facts.gate), GATE_CN[facts.gate]]);
    const wrong = doors.filter((d) => !want.has(d));
    if (wrong.length) issues.push({ kind: 'gate', detail: `答語稱「第${wrong.join('、')}門」，本格實為第${facts.gate}門` });
  }

  // ⑤ 裸數字：治「1368字」那類憑空之數。須能在引文或定本事實中尋得。
  // facts.nums 為該路自報之確定常數（玩法路之二十一相、二百二十位…）——
  // 中文數字本不受此閘，但模型好寫作「21」「220」，不報備即被誤判憑空。
  const nums = [...A.matchAll(/(\d{2,})/g)].map((m) => m[1]);
  const factNums = new Set([String(facts.grant || ''), String(facts.gate || ''), ...(facts.nums || []).map(String)]);
  const strayNum = nums.filter((n) => !factNums.has(n) && !hay.includes(n));
  if (strayNum.length) issues.push({ kind: 'number', detail: `答語稱數「${strayNum.join('、')}」，引文與事實中皆無` });

  return { ok: issues.length === 0, checks: { cites: tags.length, quotes: quotes.length, passages: passages.length }, issues };
}

/** 定本路由專用：核驗不過即拋——承注庫已逐字校過底本，不過就是數據壞了，不當靜默降級 */
export function assertCanon(answer, passages, facts) {
  const v = verifyAnswer(answer, passages, facts);
  if (!v.ok) {
    const e = new Error('定本核驗不過：' + v.issues.map((i) => i.detail).join('；'));
    e.verify = v;
    throw e;
  }
  return v;
}
