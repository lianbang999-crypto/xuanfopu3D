// 問譜 · Worker 入口（v3，2026-08-12 推倒重立）
// ─────────────────────────────────────────────────────────────────────────────
// 【何以推倒】舊智能體（M5.1，git 可考）是為**棋局內問答**設計的：入口先過捷徑解析
// （payload 帶位帶相即查定本）、再過意圖層（模型吐結構）、再分定本／玩法／串講／文庫諸路——
// 八路收作兩層，仍是兩層。2026-08-12 發起人拍板：學問文鈔（wenchao 之問文鈔，NotebookLM 形），
// 為《選佛譜》全書立「問譜」，推倒重做一版並**覆蓋舊問**。
//
// 【新形只一條路】問 → 檢索全書 692 塊 → 模型據文組織成話（逐句過閘）→ 帶角標的答，
// 點角標看原文。沒有意圖層（省一次模型往返），沒有定本查表路（判詞數據前端本就有，
// 位卡照舊零生成直出，不歸問譜管），沒有問文庫旁路（譜外之問據實說材料答不了，不轉他家）。
//
// 【三件舊物原樣留用】皆與「問什麼」無關，是「怎麼答得不出錯」的地基，評測釘過：
//   search.js   檢索（實體＋bigram＋問法橋，橋詞條條出自實測失敗問句）
//   compose.js  據文生成（流式句級閘：直引／位名／數字憑空即丟句；KV 答案快取）
//   guard.js    生成閘（公網直訪零生成、遊戲內轉日配額、額滿降級不拒答）
//
// 【零拒答之守】沿 2026-08-04 發起人所定「拒答率做到零」：
//   檢索有命中 → 一律據文作答，答不全則模型依鐵律三直說材料沒說到；
//   檢索零命中 → 據實說「沒找到可依的段落」（未載與未檢著是兩回事，不妄斷「譜裡沒有」）；
//   模型不可用／額滿 → 降級把檢得的原文照引直出——地基不依賴模型可用性。
//
// 【三條分寸不是拒答】（值觀層要求，與管線形態無關，故新版原樣保留）
//   身份之問 → 據實自陳（識別正則沿舊版，實測 52 問校過）
//   個人決斷 → 決定不替他做（發起人 2026-08-02 定），譜中相關次第照給
//   占卜吉凶 → 明白回絕並說破「此譜依教乘定升沉」（《敘》云「皆本教乘非出臆見」）
//
// 協議不變：ndjson 流式 meta → delta → done，欄位名與問文鈔 site/js/ai-core.js 一致。
// 舊前端（遊戲內聊天）不改一字即接上新腦；新前端（read.html 問譜抽屜）同吃這一路。

import { searchCorpus, toPassages } from './search.js';
import { streamCompose, composeFromCache, modelOf } from './compose.js';
import { genGuard, cacheKeyOf } from './guard.js';
import { CORPUS_META } from './corpus.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const NDJSON = { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

/** 一行 ndjson */
const line = (o) => new TextEncoder().encode(JSON.stringify(o) + '\n');

// ── 定句（皆中文，不洩內部欄位名）──
const SAY = {
  malformed: '请把想问的写成一句话——谱位、轮相、名相义理、这部书的来历，都可以问。',
  // 檢索全零命中：問句與全書七萬六千字無一字可搭。「未載」是妄斷（未載與未檢著兩回事），據實說沒找著。
  nomatch: '这一问我没在谱里找到可依的段落。换个说法再问，或指明某一卷、某一门、某一位试试。',
  // 身份與閒談：問的不是譜，答的正是所問——非拒答，別立 identity 一目。
  identity: '我是「问谱」——《选佛谱》的助读，只依这六卷谱文作答；答语所依的原文都列在出处里，可逐条核对。谱位、轮相行法、名相义理、这部书的来历，都可以问。',
  // 個人決斷降級頭（模型不可用時用；有檢得材料方許諾「下面」，零命中者用 bare 式免妄語）
  personalHead: '这个决定谱不替你做，也不看吉凶。谱中相关的修行次第列在下面，你自己对照着看。',
  personalBare: '这个决定谱不替你做，也不看吉凶。具体行门，宜从明师、依经论。',
  // 占卜降級頭：敘云「皆本教乘非出臆見」，此意須說破，不可默認「也許真有此事」
  divineHead: '此谱依教乘定升沉，不占吉凶、不测运气。掷得何相、往哪一位，谱上早已写定，与祸福休咎无关。',
};

// ── 分寸識別（正則沿舊版原樣，實測 52 問校過；此三類攔在檢索之前）──
const IDENTITY = /^(你是誰|你是谁|你叫什麼|你叫什么|你是什麼|你是什么|你是不是[Aa][Ii]|你是[Aa][Ii][嗎吗]?|你是人工智能[嗎吗]?|你是機器人[嗎吗]?|你是机器人[嗎吗]?|你是人[嗎吗])[?？。！]?$/;
const CHITCHAT = /講個笑話|讲个笑话|說個笑話|说个笑话|陪我聊|你好嗎|你好吗|吃了嗎|吃了吗|唱首歌|寫首詩|写首诗/;
const PERSONAL = /該不該|该不该|要不要|值不值得|我能不能|幫我決定|帮我决定|辭職|辞职|離婚|离婚|結婚|结婚|投資|投资|買|买房|跳槽/;
const DIVINE = /預示|预示|預兆|预兆|徵兆|征兆|運氣|运气|倒霉|倒楣|吉凶|凶吉|算命|占卜|求籤|求签|抽籤|抽签|命運|命运|是不是說明我|是不是说明我/;

/** 一句定語直出（身份自陳等；亦作問句空時的引導） */
function streamSay(text, T0, mode, label, status = 'grounded') {
  return new ReadableStream({
    start(c) {
      c.enqueue(line({ type: 'meta', passages: [], sources: [], facts: null, basis: { mode, label } }));
      c.enqueue(line({ type: 'delta', text }));
      c.enqueue(line({ type: 'done', verify: null, evidenceStatus: status, timing: { total: Date.now() - T0 } }));
      c.close();
    },
  });
}

/**
 * 降級直出 —— 模型不可用（無密鑰／上游拒／額滿）時把檢得的原文照引給他。
 * 從前降級即拒答；但上游忙不等於譜裡沒有——材料都在手上，只是沒人組織成話。
 * 話是生硬些，事實一件不少；地基不依賴模型可用性。
 */
function streamGrounded(head, passages, T0, mode, label, reason = '') {
  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((p) => ({ title: p.title, ref: p.ref })),
        facts: null, basis: { mode, label }, degraded: true, degradedReason: reason,
        timing: { ttft: Date.now() - T0 },
      }));
      if (head) c.enqueue(line({ type: 'delta', text: head + '\n\n' }));
      passages.forEach((p, i) => {
        c.enqueue(line({ type: 'delta', text: (i ? '\n\n' : '') + p.text + `[${i + 1}]` }));
      });
      c.enqueue(line({
        type: 'done',
        verify: { ok: true, checks: { passages: passages.length }, issues: [] },
        evidenceStatus: passages.length ? 'grounded' : 'ungrounded',
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

// 占卜之問所依：《敘》自言「皆本教乘非出臆見」。惰性檢一次，此後常駐。
let DIVINE_CITE = null;
function divineCite() {
  if (!DIVINE_CITE) {
    const h = searchCorpus('皆本教乘非出臆見', { k: 1 });
    DIVINE_CITE = h.length ? toPassages(h) : [];
  }
  return DIVINE_CITE;
}

/** 據文生成，不可用則降級。次序：快取（零成本，不扣額）→ 配額 → 生成。
 *  降級原因分三：public（公網直訪，本無生成之份）／quota（額滿）／compose 自報（nokey 等）。 */
async function tryCompose(o, fallback) {
  const s0 = await composeFromCache(o);
  if (s0) return new Response(s0, { headers: NDJSON });
  if (!(await o.guard.take())) return new Response(fallback(o.guard.trusted ? 'quota' : 'public'), { headers: NDJSON });
  const s = await streamCompose(o);
  return new Response(s || fallback(o.degradedReason || 'unknown'), { headers: NDJSON });
}

/** 多輪：客戶端送 history:[{q,a}]，取末二輪、答語截四百字——只作續問的上下文，不入快取鍵 */
function historyOf(body) {
  if (!Array.isArray(body.history)) return [];
  return body.history.slice(-2)
    .filter((h) => h && typeof h.q === 'string' && typeof h.a === 'string' && h.q.trim() && h.a.trim())
    .map((h) => ({ q: String(h.q).slice(0, 200), a: String(h.a).slice(0, 400) }));
}

async function handleAsk(req, env) {
  const T0 = Date.now();
  let body;
  try { body = await req.json(); } catch { body = null; }
  const q = body && typeof body.question === 'string' ? body.question.trim() : '';
  if (!q) return new Response(streamSay(SAY.malformed, T0, 'refuse', '未成问'), { headers: NDJSON });

  // 來源分級（guard.js）：遊戲／閱讀頁內轉（ask.internal）方開生成；公網直訪密鑰不入 env，
  // 一律降級原文直出——付費端點不裸奔，配額亦無從繞。
  const guard = genGuard(req, env || {});
  const E = guard.trusted ? (env || {}) : { ...(env || {}), SILICONFLOW_API_KEY: undefined };
  const history = historyOf(body);

  // ── 三條分寸，攔在檢索之前 ──
  // 身份與閒談：問句裡的「佛」「譜」最易誤中譜內塊，答出一段譜文比答非所問更不知所云。
  if (IDENTITY.test(q) || CHITCHAT.test(q)) {
    return new Response(streamSay(SAY.identity, T0, 'identity', '关于问谱'), { headers: NDJSON });
  }
  // 占卜吉凶：明白回絕，所依即《敘》——非我輩立規矩，是照著敘說。
  if (DIVINE.test(q)) {
    const ps = divineCite();
    return tryCompose(
      { question: q, passages: ps, history, kind: 'divine', label: '谱内义理', env: E, T0, line, guard,
        ckey: history.length ? '' : await cacheKeyOf('divine', q, {}, CORPUS_META.builtAt) },
      (why) => streamGrounded(SAY.divineHead, ps, T0, 'divine', '谱内义理', why),
    );
  }
  // 個人決斷：決定不替他做，譜中相關次第照給——「不替他決定」與「不給他東西」是兩回事。
  if (PERSONAL.test(q)) {
    const ps = toPassages(searchCorpus(q, { k: 3 }));
    return tryCompose(
      { question: q, passages: ps, history, kind: 'personal', label: '谱内义理', env: E, T0, line, guard,
        ckey: history.length ? '' : await cacheKeyOf('personal', q, {}, CORPUS_META.builtAt) },
      (why) => streamGrounded(ps.length ? SAY.personalHead : SAY.personalBare, ps, T0, 'personal', '谱内义理', why),
    );
  }

  // ── 正路：檢書 → 據文作答 ──
  // 长问多题（如局终「修行手册」列诸升降处）材料窗随之放宽：六段盖不住多主题，
  // 模型只得依铁律说「材料没说到」——诚实而空手。k 上限 10，塊皆谱内已筛，不虚胖。
  const hits = searchCorpus(q, { k: q.length > 90 ? 10 : 6 });
  if (!hits.length) {
    return new Response(streamSay(SAY.nomatch, T0, 'refuse', '未检得', 'refused'), { headers: NDJSON });
  }
  const passages = toPassages(hits);
  return tryCompose(
    { question: q, passages, history, kind: 'ask', label: '谱内全文', env: E, T0, line, guard,
      ckey: history.length ? '' : await cacheKeyOf('ask', q, {}, CORPUS_META.builtAt) },
    (why) => streamGrounded('', passages, T0, 'ask', '谱内全文', why),
  );
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/v1/health') {
      return json({
        ok: true, name: 'wenpu-v3',
        corpus: { blocks: CORPUS_META.blocks, chars: CORPUS_META.chars, builtAt: CORPUS_META.builtAt },
        compose: { model: modelOf(env), keyed: !!(env && env.SILICONFLOW_API_KEY) },
      });
    }
    if (url.pathname === '/v1/ask' && req.method === 'POST') return handleAsk(req, env);
    return json({ message: '问谱只应 POST /v1/ask 与 GET /v1/health。' }, 404);
  },
};
