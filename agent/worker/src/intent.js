// 意圖理解層 —— LLM 只吐結構，不吐話
//
// 發起人裁定（2026-08-02）：模型用在**輸入端**（理解用戶想問什麼），不在輸出端。
// 好處有四：
//   · 幻覺進不到答案裡——答案全是已審定的語料
//   · 出錯立刻知道——pos 不在 220 位裡、combo 不在 21 相裡，一驗即知
//   · 便宜——理解一句問句比生成一段話省一個量級
//   · 可全量評測——4620 格能造出幾千道題自動跑
//
// **降級鏈是本檔的要害**：模型不可用（無密鑰／超時／格式錯／校驗不過）時，
// 一律退回 M3 的正則解析。智能體的地基不可依賴模型可用性——
// 密鑰失效之日，定本路由仍須照常答得出「某位擲某相如何走」。

import { POS, POS_BY_NAME, ALIAS, GATES } from './canon.js';
import { parseTarget, COMBOS } from './canon-route.js';

export const INTENTS = ['lookup', 'explain', 'position', 'table', 'compare', 'path', 'glossary', 'offtopic'];

const COMBO_SET = new Set(COMBOS);
const S2T_COMBO = { 谟: '謨', 弥: '彌' };
const toTrad = (s) => String(s || '').replace(/[谟弥]/g, (c) => S2T_COMBO[c]);

// 位名解析：繁簡與別名兼收（同 canon-route，此處只認全等，不作問句掃描）
const NAME2NO = new Map();
POS.forEach((p, i) => { NAME2NO.set(p.n, i); if (p.s) NAME2NO.set(p.s, i); });
for (const [a, no] of Object.entries(ALIAS)) if (!NAME2NO.has(a)) NAME2NO.set(a, no);

const SYSTEM = `你是《選佛譜》的問句解析器。只輸出 JSON，不作任何解釋、不答問題本身。

《選佛譜》體例：十五門、二百二十位，每位擲二十一種輪相。
二十一相：那那 那謨 謨謨 阿阿 阿彌 彌彌 阿陀 彌陀 陀陀 那佛 謨佛 阿佛 彌佛 陀佛 佛佛 那阿 謨阿 那彌 謨彌 那陀 謨陀

把用戶問句歸為下列之一：
- lookup    問某位擲某相如何走（去哪一位／行不行）
- explain   問某位擲某相為何如此
- position  問某一位是什麼、什麼意思
- table     問某一位擲各相分別如何走（只給位、未指明輪相者多屬此）
- compare   問兩處有何不同
- path      問從某位到某位怎麼走、要經過哪些位
- glossary  問某個名相何義（橫超、見惑、無生懺之類）
- offtopic  譜外之問（個人決斷、他典、閒談）

輸出格式（只此一個 JSON，無 markdown 圍欄）：
{"intent":"…","targets":[{"pos":"位名","combo":"輪相"}],"term":"名相","from":"位名","to":"位名"}

規則：
- 位名用譜中原名（如「圓十信位」「初發心住」「南贍部洲」），不確定就留空字串
- 輪相用上列二十一相之一，不確定就留空字串
- targets 至多兩項；compare 須兩項
- 只有 glossary 填 term；只有 path 填 from/to
- 用戶說「這一位」「現在這步」等指代，用所給的當前局面補全`;

/** 從模型回覆中摳出 JSON（容忍 markdown 圍欄與前後綴文字） */
function extractJson(text) {
  const t = String(text || '').trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * 校驗並歸一模型所吐之結構。**每個欄位都對著表校**——
 * 這正是把模型放在輸入端的好處：憑空捏造的位名一驗即現，不必讀一段話去分辨。
 * @returns {object|null} 校驗不過返回 null，交由上層降級
 */
export function validateIntent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const intent = INTENTS.includes(raw.intent) ? raw.intent : null;
  if (!intent) return null;

  const one = (t) => {
    if (!t || typeof t !== 'object') return null;
    const posNo = NAME2NO.has(t.pos) ? NAME2NO.get(t.pos) : -1;
    const combo = COMBO_SET.has(toTrad(t.combo)) ? toTrad(t.combo) : '';
    if (posNo < 0 && !combo) return null;
    return { posNo, posName: posNo >= 0 ? POS[posNo].n : '', combo };
  };
  const targets = (Array.isArray(raw.targets) ? raw.targets : []).map(one).filter(Boolean).slice(0, 2);

  const out = { intent, targets };
  if (intent === 'glossary') {
    const term = String(raw.term || '').trim();
    if (!term) return null;
    out.term = term;
  }
  if (intent === 'path') {
    const f = NAME2NO.has(raw.from) ? NAME2NO.get(raw.from) : -1;
    const t = NAME2NO.has(raw.to) ? NAME2NO.get(raw.to) : -1;
    if (f < 0 && t < 0) return null;
    out.from = f >= 0 ? { posNo: f, posName: POS[f].n } : null;
    out.to = t >= 0 ? { posNo: t, posName: POS[t].n } : null;
  }
  // 該有標的者必須有：lookup／explain 須位相俱全方能查表
  if ((intent === 'lookup' || intent === 'explain') && !(targets[0] && targets[0].posNo >= 0 && targets[0].combo)) return null;
  if ((intent === 'position' || intent === 'table') && !(targets[0] && targets[0].posNo >= 0)) return null;
  if (intent === 'compare' && targets.length < 2) return null;
  return out;
}

/** 正則降級：用 M3 已有的 parseTarget，能解出位相即作 explain，否則交拒答 */
export function fallbackIntent(body) {
  const t = parseTarget(body);
  if (t.posNo >= 0 && t.combo) {
    return { intent: 'explain', targets: [{ posNo: t.posNo, posName: POS[t.posNo].n, combo: t.combo }], _by: 'regex' };
  }
  if (t.posNo >= 0) {
    // 有位無相：問「擲得什麼」者求行法表，問「是什麼」者求位義
    const asksThrow = /擲|掷|輪相|轮相|怎麼走|怎么走|如何走|去哪/.test(String(body.question || ''));
    return { intent: asksThrow ? 'table' : 'position',
      targets: [{ posNo: t.posNo, posName: POS[t.posNo].n, combo: '' }], _by: 'regex' };
  }
  return null;
}

/**
 * 解析用戶問句。無密鑰、超時、格式錯、校驗不過——一律降級到正則。
 * @param {object} body   請求體（question／pos／combo／trail…）
 * @param {object} env    Worker env（SILICONFLOW_API_KEY 可缺）
 * @param {object} opt    { timeoutMs, model }
 */
export async function resolveIntent(body, env, opt = {}) {
  const q = String(body.question || '').trim();
  if (!q) return { intent: null, by: 'empty' };

  // 前端明傳位相者（「AI 解讀」按鈕），無須勞動模型——這是遊戲內提問的大宗
  const direct = parseTarget(body);
  if (direct.from === 'payload') {
    return { intent: 'explain', targets: [{ posNo: direct.posNo, posName: POS[direct.posNo].n, combo: direct.combo }], by: 'payload' };
  }

  const key = env && env.SILICONFLOW_API_KEY;
  if (key) {
    try {
      // 模型優先序：調用方顯式指定 > wrangler vars INTENT_MODEL > 碼中默認
      const parsed = await callModel(q, body, key, { ...opt, model: opt.model || (env && env.INTENT_MODEL) });
      const v = validateIntent(parsed);
      if (v) return { ...v, by: 'model' };
    } catch { /* 超時、網絡、上游故障——皆降級，不驚動用戶 */ }
  }

  const fb = fallbackIntent(body);
  return fb ? { ...fb, by: 'regex' } : { intent: null, by: 'none' };
}

async function callModel(q, body, key, opt) {
  const model = opt.model || 'deepseek-ai/DeepSeek-V3';
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), opt.timeoutMs || 6000);
  // 當前局面隨問帶上——用戶說「這一位」「現在這步」時，模型據此補全
  const cur = [
    body.posName ? `現居位：${body.posName}` : '',
    body.doorTitle ? `所在門：${body.doorTitle}` : '',
    body.combo ? `最近擲得：${body.combo}` : '',
    Array.isArray(body.trail) && body.trail.length ? `足跡：${body.trail.slice(-5).join('→')}` : '',
  ].filter(Boolean).join('　');
  try {
    const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: (cur ? `【當前局面】${cur}\n` : '') + `【問句】${q}` },
        ],
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error('upstream ' + res.status);
    const d = await res.json();
    return extractJson(d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
  } finally { clearTimeout(to); }
}
