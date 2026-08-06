// 選佛譜智能體 · Worker 入口（M5）
//
// 【M3 → M5 之變】M3 只開定本①與拒答④，無密鑰、零生成。那一版守得住準確，
// 卻守成了一部檢索工具：實測 52 個真實玩家問法，拒答 57.7%，檢得者又直吐文言原文，
// 玩家看見的是「譜曰。五停心者。一多貪眾生。用不淨觀…」——檢索是對的，等於沒答。
// 故本版開據文生成（compose.js），模型從**只在輸入端**（intent 吐結構）
// 進到**輸出端**（組織已檢得之材料成白話）。
//
// 【但生成只開在該開之處】定本 4620 格仍零生成——那是承注庫逐格審定、canon-eval
// 逐格回歸的確定事實，模型重述只會讓硬指標失去意義，且 ttft 從 0.1ms 變 2s。
// 玩家要深入，另有「再講開」一路（ask:'expand'）走生成。此係發起人 2026-08-04 之裁定。
//
// 【M5.1 · 極簡與零拒答，發起人 2026-08-04 定「學 NotebookLM，拒答率做到零」】
//
// 對外只一件事：**問 → 帶引文的答 → 點引文看原文**。NotebookLM 之形。
// 對內收為兩層，不再是八條並列的路：
//
//   ① 定本層（查表直出，0ms，零生成）　canon 位×相／position 位本體／table 行法表
//        三者同源：皆是承注庫逐格審定、canon-eval 逐格回歸的**確定事實**，
//        模型重述只會令硬指標失去意義。玩家要深入，走 expand。
//
//   ② 據文層（檢索譜內 692 塊 → 模型據文組織成話，逐句掛角標）
//        corpus 名相義理／rules 玩法與局面／expand 追問串講／personal 個人決斷
//        └ 指名他家或譜內無著落之淨土修學問 → 轉佛樂問文庫（署「大安法師講記」）
//
//   拒答**不再是一條路**。從前有三重閾值（≥40 強命中／worthWenku／≥24 弱命中），
//   不中者答「此事《選佛譜》未載」——實測 52 問拒答 26.9%，而逐條核對底本，
//   九條是**譜裡明明有卻檢索評分不足**。拿檢索的短處去做「譜中有無」的判詞，本就錯位。
//   今一律據文作答：答得了就答，答不了模型依鐵律三直說「这几段谱文讲的是…，
//   你问的这一点这里没有说到」。只餘檢索全零命中一種，據實說沒找著，請其換個說法。
//
//   兩條分寸不是拒答，是答得有分寸——仍給譜內材料：
//     · 個人決斷（該不該出家）→ 決定不替他做（2026-08-02 已定），而門七戒學次第照給
//     · 占卜吉凶 → 明白回絕，並說破「此譜依教乘定升沉」（敘云「皆本教乘非出臆見」）
//     · 身份之問 → 據實自陳，別立 identity 一目，**不計入拒答**（問的不是譜，答的正是所問）
//
// 生成諸路一律過句級核驗（compose.gate）。無密鑰／上游故障時降級——**降級亦不拒答**：
// 譜文照引、行法表照列、分寸話照說（streamGrounded），話生硬些，事實一件不少。
// 地基不依賴模型可用性，密鑰失效之日，定本路由仍須照常答得出。
//
// 協議：ndjson 流式 meta → delta → done，欄位名與問文鈔 site/js/ai-core.js 一致，
// 前端可直接複用那套內核（streamAsk / aiFormat / citationExcerpt）。

import { parseTarget, lookup, lookupPosition, lookupTable, toPassages, composeAnswer, toFacts, toVerifyFacts } from './canon-route.js';
import { resolveIntent } from './intent.js';
import { streamWenku, worthWenku, isPersonal, namesOthers } from './wenku.js';
import { searchCorpus, toPassages as corpusPassages } from './search.js';
import { assertCanon } from './verify.js';
import { streamCompose, composeFromCache, modelOf } from './compose.js';
import { genGuard, cacheKeyOf } from './guard.js';
import { worthRules, buildRules, isDivine } from './rules.js';
import { META } from './canon.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const NDJSON = { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

// 拒答定句：一律中文，不洩漏內部欄位名（紀律三）
// 答不了就說「此事《選佛譜》未載」，不必多言（發起人裁定 2026-08-02）。
// 只一處例外：用戶確係沒問清楚時，仍須請其指明——那不是「未載」，是「未讀出」。
// 【2026-08-04 發起人定「拒答率做到零」之後】此表已幾乎用不著——
// 譜內檢得幾分是幾分，一律交模型據文作答（見 handleAsk 尾段）。餘此數句者，
// 皆是**模型不可用時的降級**，或問句本身無從著手，非「譜中無此事」之判。
const REFUSE = {
  notYet: '此事《选佛谱》未载。',
  offTable: '此事《选佛谱》未载。',
  offBook: '此事《选佛谱》未载。',
  malformed: '请指明位次与轮相，或从棋局中点选。',
  // 檢索全零命中：問句與全書七萬六千字無一字可搭。此時說「譜中未載」是妄斷——
  // 未載與未檢著是兩回事，據實說我沒找著，請他換個說法。
  nomatch: '这一问我没在谱里找到可依的段落。换个说法再问，或从棋局里点一位试试。',
  // 個人決斷之分寸話。模型可用時由 compose 之 personal 提示詞說（活話），
  // 不可用時用此定句起頭，其下仍引譜內相關次第——決定不替他做，東西照給。
  // **兩式**：檢索有著落者許以「列在下面」，零命中者不可如此說——
  // 說了「下面」而下面是空的，是又一種妄語（實測「我該不該辭職」譜內零命中即如此）。
  personalHead: '这个决定谱不替你做，也不看吉凶。谱中相关的修行次第列在下面，你自己对照着看。',
  personalBare: '这个决定谱不替你做，也不看吉凶——这部谱讲的是修行次第，不是替人拿主意的。具体行门宜从明师、依经论。',
  // 問「你是誰」而答「此事《選佛譜》未載」，是答非所問——那不是譜裡沒有，是問的不是譜。
  // 據實自陳即可，不必扮人、更不扮大師。
  identity: '我是这部《选佛谱》的问答，依谱作答——谱位、轮相行法、名相义理、这局怎么玩，都可以问。谱外之事与我自己的事，答不了。',
  // 占卜之問須有人明白回絕。順著答固然不可，答一句「未載」亦不足——
  // 那等於默認「譜裡沒說，也許真有此事」。敘云「皆本教乘非出臆見」，此意須說破。
  divine: '此谱依教乘定升沉，不占吉凶、不测运气。掷得何相、往哪一位，行法表上早已写定，与祸福休咎无关。',
};

// 身份與閒談之問。攔在檢索之前：問句裡的「佛」「譜」二字最易誤中譜內塊，
// 答出一段譜文來，比拒答更不知所云。
// 大小寫與繁簡皆須收全——曾漏「你是AI吗」（大寫 AI 配簡體吗）而落入拒答。
const IDENTITY = /^(你是誰|你是谁|你叫什麼|你叫什么|你是什麼|你是什么|你是不是[Aa][Ii]|你是[Aa][Ii][嗎吗]?|你是人工智能[嗎吗]?|你是機器人[嗎吗]?|你是机器人[嗎吗]?|你是人[嗎吗])[?？。！]?$/;
const CHITCHAT = /講個笑話|讲个笑话|說個笑話|说个笑话|陪我聊|你好嗎|你好吗|吃了嗎|吃了吗|唱首歌|寫首詩|写首诗/;

/** 一行 ndjson */
const line = (o) => new TextEncoder().encode(JSON.stringify(o) + '\n');

/** 定本路由：命中即流式吐出。答語為承注庫已審定之白話，故 ttft 近乎為零。 */
function streamCanon(hit, T0, by = 'regex') {
  const passages = toPassages(hit);
  const facts = toFacts(hit);
  const { head, body } = composeAnswer(hit);

  // 斷言級核驗：承注庫已逐字校過底本，此處不過即是數據壞了
  let verify;
  try { verify = assertCanon(body, passages, toVerifyFacts(hit)); }
  catch (e) { verify = e.verify || { ok: false, issues: [{ kind: 'fatal', detail: String(e.message) }] }; }

  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((p) => ({ title: p.title, ref: p.ref })),
        facts,                                   // 定本事實：前端據此渲去向按鈕
        basis: { mode: 'canon', label: '谱内定本' },
        parse: by,                               // payload／model／regex——遙測用，看模型到底幫上多少忙
        timing: { ttft: Date.now() - T0 },
      }));
      // 標題行與正文分段吐出：協議與將來的模型路由一致，前端渲染邏輯只需一套
      c.enqueue(line({ type: 'delta', text: head + '\n\n' }));
      for (const seg of body.split(/(?<=[。；！？])/)) {
        if (seg.trim()) c.enqueue(line({ type: 'delta', text: seg }));
      }
      // 位義附註：用戶多半也想知道「這一位是什麼」
      if (hit.posPlain) c.enqueue(line({ type: 'delta', text: `\n\n○ ${hit.posName}：${hit.posPlain}` }));
      c.enqueue(line({
        type: 'done', verify,
        evidenceStatus: verify.ok ? 'grounded' : 'ungrounded',
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

/** 位本體路由：答「這一位是什麼」。材料為位義白話（已審）＋ 本位譜曰逐字原文。 */
function streamPosition(posNo, T0, by = 'regex') {
  const p = lookupPosition(posNo);
  if (!p) return streamRefuse('offTable', T0);
  const passages = p.puyue ? [{
    title: p.posName, text: p.puyue,
    ref: `《選佛譜》・${p.posName}・本位譜曰`,
    posName: p.posName, url: `#pos=${encodeURIComponent(p.posName)}`,
  }] : [];
  const body = (p.plain || '') + (passages.length ? '[1]' : '');
  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((x) => ({ title: x.title, ref: x.ref })),
        facts: { pos: p.posName, posId: p.posId, gate: p.gate, gateName: p.gateName, anchor: p.anchor },
        basis: { mode: 'canon', label: '谱内定本' }, parse: by,
        timing: { ttft: Date.now() - T0 },
      }));
      c.enqueue(line({ type: 'delta', text: `${p.posName} · 第${p.gate}门「${p.gateName}」\n\n` }));
      if (body.trim()) c.enqueue(line({ type: 'delta', text: body }));
      c.enqueue(line({
        type: 'done', verify: { ok: true, checks: { passages: passages.length }, issues: [] },
        evidenceStatus: passages.length ? 'grounded' : 'ungrounded',
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

/** 行法表路由：答「某位擲各相分別如何走」。二十一相逐條列去向，皆查表所得。 */
function streamTable(posNo, T0, by = 'regex') {
  const t = lookupTable(posNo);
  if (!t) return streamRefuse('offTable', T0);
  const passages = t.puyue ? [{
    title: t.posName, text: t.puyue,
    ref: `《選佛譜》・${t.posName}・本位譜曰`,
    posName: t.posName, url: `#pos=${encodeURIComponent(t.posName)}`,
  }] : [];
  const fmt = (r) => (r.verdict === '無行法' ? '本无行法'
    : r.verdict === '不行' ? '不行'
      : r.grant ? `赠掷 ${r.grant} 次` : r.to || '');
  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((x) => ({ title: x.title, ref: x.ref })),
        facts: { pos: t.posName, posId: t.posId, gate: t.gate, gateName: t.gateName, anchor: t.anchor, rows: t.rows },
        basis: { mode: 'canon', label: '谱内定本' }, parse: by,
        timing: { ttft: Date.now() - T0 },
      }));
      c.enqueue(line({ type: 'delta', text: `${t.posName} · 第${t.gate}门「${t.gateName}」· 二十一轮相行法\n\n` }));
      if (t.plain) c.enqueue(line({ type: 'delta', text: `${t.plain}${passages.length ? '[1]' : ''}\n\n` }));
      for (const r of t.rows) c.enqueue(line({ type: 'delta', text: `- 「${r.combo}」→ ${fmt(r)}\n` }));
      c.enqueue(line({
        type: 'done', verify: { ok: true, checks: { passages: passages.length, rows: t.rows.length }, issues: [] },
        evidenceStatus: 'grounded', timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

/** 譜內全文路由：檢索 692 塊，直出原文與出處。名相之問（見惑・橫超・數息）多歸此。
 *  呈現體例：**原文在前，出處在後**——原文自己會說話，不必我輩轉述。 */
function streamCorpus(hits, T0, by = 'regex') {
  const passages = corpusPassages(hits);
  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((p) => ({ title: p.title, ref: p.ref })),
        facts: null,
        basis: { mode: 'corpus', label: '谱内原文' }, parse: by,
        timing: { ttft: Date.now() - T0 },
      }));
      hits.forEach((h, i) => {
        const b = h.block;
        c.enqueue(line({ type: 'delta', text: (i ? '\n\n' : '') + b.t + `[${i + 1}]` }));
      });
      c.enqueue(line({
        type: 'done',
        verify: { ok: true, checks: { passages: passages.length }, issues: [] },
        evidenceStatus: 'grounded', timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

/**
 * 降級直出 —— 模型不可用（無密鑰／上游限流／超時）時，把**手上的確定材料**直接給他。
 *
 * 【何以必立此】從前生成路降級即落定句「此事《選佛譜》未載」。但上游忙不等於譜裡沒有，
 * 把「我這會兒答不了」說成「譜中無此事」，於用戶即是妄語——與 2026-08-04 所修
 * 「答語替整部譜下斷言」同屬一病。實測連打五十二問觸發上游限流，四條落此，而其中
 * 「下一步會去哪」行法表現成、「我該不該出家」門七戒學現成——**材料都在手上，只是沒人組織成話**。
 *
 * 故降級不再拒答：譜文照引、行法表照列、分寸話照說。話是生硬些，事實一件不少。
 */
function streamGrounded(head, passages, facts, T0, label, mode = 'corpus', reason = '') {
  const fmt = (r) => (r.verdict === '無行法' ? '本无行法'
    : r.verdict === '不行' ? '不行，安住原位'
      : r.grant ? `赠掷 ${r.grant} 次` : r.to || '');
  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((p) => ({ title: p.title, ref: p.ref })),
        facts: facts && facts.pos ? facts : null,
        basis: { mode, label }, degraded: true, degradedReason: reason,
        timing: { ttft: Date.now() - T0 },
      }));
      if (head) c.enqueue(line({ type: 'delta', text: head + '\n\n' }));
      if (facts && Array.isArray(facts.rows) && facts.rows.length) {
        c.enqueue(line({ type: 'delta', text: `${facts.pos || '本位'} · 二十一轮相行法\n` }));
        for (const r of facts.rows) c.enqueue(line({ type: 'delta', text: `- 「${r.combo}」→ ${fmt(r)}\n` }));
        c.enqueue(line({ type: 'delta', text: '\n' }));
      }
      passages.forEach((p, i) => {
        c.enqueue(line({ type: 'delta', text: (i ? '\n\n' : '') + p.text + `[${i + 1}]` }));
      });
      c.enqueue(line({
        type: 'done',
        verify: { ok: true, checks: { passages: passages.length }, issues: [] },
        evidenceStatus: (passages.length || (facts && facts.rows)) ? 'grounded' : 'ungrounded',
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

// 占卜之問所依：《敘》自言「皆本教乘非出臆見」——大師造此圖時已把話說在前頭，
// 此圖依教乘而定升沉，不是求籤問卜之具。回絕占卜非我輩立規矩，是照著敘說。
// 惰性取一次，此後常駐。
let DIVINE_CITE = null;
function divineCite() {
  if (!DIVINE_CITE) {
    const h = searchCorpus('皆本教乘非出臆見', { k: 1 });
    DIVINE_CITE = h.length ? corpusPassages(h) : [];
  }
  return DIVINE_CITE;
}

/** 身份自陳：問的不是譜，答的正是所問——**非拒答**，故別立一目，不計入拒答率。 */
function streamIdentity(T0) {
  return new ReadableStream({
    start(c) {
      c.enqueue(line({ type: 'meta', passages: [], sources: [], basis: { mode: 'identity', label: '关于我' } }));
      c.enqueue(line({ type: 'delta', text: REFUSE.identity }));
      c.enqueue(line({ type: 'done', verify: null, evidenceStatus: 'grounded', timing: { total: Date.now() - T0 } }));
      c.close();
    },
  });
}

/** 拒答路由：定句直出，不調生成。evidenceStatus 為 refused，且不掛引文。
 *  2026-08-04 起只剩兩種真無可依者：問句空／檢索全零命中。餘皆據文作答。 */
function streamRefuse(reason, T0) {
  return new ReadableStream({
    start(c) {
      c.enqueue(line({ type: 'meta', passages: [], sources: [], basis: { mode: 'refuse', label: '谱外' } }));
      c.enqueue(line({ type: 'delta', text: REFUSE[reason] || REFUSE.offTable }));
      c.enqueue(line({ type: 'done', verify: null, evidenceStatus: 'refused', timing: { total: Date.now() - T0 } }));
      c.close();
    },
  });
}

/** 據文生成，不可用則降級。降級之路由調用者給——地基不依賴模型可用性。
 *  次序：快取（零成本，不扣額）→ 配額（額滿／公網直訪即降級）→ 生成。 */
async function tryCompose(o, fallback) {
  const s0 = await composeFromCache(o);
  if (s0) return new Response(s0, { headers: NDJSON });
  if (!(await o.guard.take())) return new Response(fallback('quota'), { headers: NDJSON });
  const s = await streamCompose(o);
  return new Response(s || fallback(o.degradedReason || 'unknown'), { headers: NDJSON });
}

async function handleAsk(req, env) {
  const T0 = Date.now();
  let body;
  try { body = await req.json(); } catch { body = null; }
  if (!body || typeof body.question !== 'string' || !body.question.trim()) {
    return new Response(streamRefuse('malformed', T0), { headers: NDJSON });
  }
  // 來源分級（guard.js）：遊戲內轉（ask.internal）方開生成；公網直訪密鑰不入 env——
  // 意圖層與生成層自然降級（正則路／原文直出），行為即 M3，付費端點不裸奔。
  const guard = genGuard(req, env || {});
  const E = guard.trusted ? (env || {}) : { ...(env || {}), SILICONFLOW_API_KEY: undefined };
  const q = String(body.question || '');

  // ── 攔在檢索之前的兩類 ──

  // 個人決斷（該不該出家／辭職／婚嫁）：決定不替他做（發起人 2026-08-02 定），
  // 但譜中相關次第照給——「不替他決定」與「不給他東西」是兩回事。
  if (isPersonal(q)) {
    const hits = searchCorpus(q, { k: 3 });
    return tryCompose(
      { question: q, passages: corpusPassages(hits), facts: {}, kind: 'personal', label: '谱内义理',
        env: E, T0, line, guard, ckey: await cacheKeyOf('personal', q, body, META.builtAt) },
      // 降級亦不空手：分寸話照說，譜內相關次第照引（零命中者換一句不許諾「下面」的話）
      (why) => streamGrounded(hits.length ? REFUSE.personalHead : REFUSE.personalBare,
        corpusPassages(hits), null, T0, '谱内义理', 'personal', why),
    );
  }
  // 身份與閒談：據實自陳，不扮人、不扮大師。**此非拒答**——問的不是譜，
  // 答的正是所問，故 basis 別立 identity 一目，不與「譜外」混計。
  if (IDENTITY.test(q.trim()) || CHITCHAT.test(q)) {
    return new Response(streamIdentity(T0), { headers: NDJSON });
  }

  // ── 明署之路 ──
  // 「再講開一點」：玩家已看過某格判詞，追問所以然。首答仍是定本（零生成），
  // 惟此追問方調模型串講，且材料限定為該格引文與本位譜曰。（發起人裁定 2026-08-04）
  if (body.ask === 'expand') {
    const t0 = parseTarget({ ...body, ask: 'reading' });
    const hit = lookup(t0.posNo, t0.combo);
    if (hit) {
      const ps = toPassages(hit);
      return tryCompose(
        { question: q, passages: ps, facts: toVerifyFacts(hit), kind: 'expand', label: '谱内串讲', env: E, T0, line,
          guard, ckey: await cacheKeyOf('expand', q, body, META.builtAt) },
        () => streamCanon(hit, T0, 'payload'),      // 模型不可用則仍給定本，不至於空手
      );
    }
  }

  // ── 定本快查 ──
  // **須先於玩法路**：「我現在這步為何這樣走」既合指代補全、又合局面之問，
  // 兩路皆欲取之。而那一問的最好答案本就是那一格的定本判詞（已審定、可核、零延遲），
  // 玩法路反倒要調模型去講一遍查表即得之事。故定本命中者先走定本。
  const quick = parseTarget(body);
  const quickHit = lookup(quick.posNo, quick.combo);
  if (quickHit && (quick.from === 'question' || quick.from === 'deictic')) {
    return new Response(streamCanon(quickHit, T0, quick.from), { headers: NDJSON });
  }

  // ── 玩法與局面 ──
  // 此路在 M3 全落拒答（實測 52 問中佔三分之一），而答案遊戲自己全知道：
  // 規則是定的，局面在 payload 裡，行法表查表即得。
  const hasBoard = !!(body.posName || body.pos);
  if (worthRules(q, hasBoard)) {
    const { passages, facts, label } = buildRules(q, body);
    // rules 路不快取（材料含活局面），只過配額
    return tryCompose(
      { question: q, passages, facts, kind: 'rules', label, env: E, T0, line, guard },
      // 降級（模型不可用時）：占卜之問須明白回絕（給譜文等於默認其事）；
      // 餘者把規則綱要與行法表**直出**——那些本就是查表得來的確定事實，不待模型組織。
      (why) => {
        // 占卜之問明白回絕，並掛《敘》「皆本教乘非出臆見」為據——**非拒答，是答得有分寸**
        if (isDivine(q)) return streamGrounded(REFUSE.divine, divineCite(), null, T0, '此谱不占吉凶', 'boundary', why);
        // mode 須仍作 rules——降級是「話沒人組織」，不是換了條路。
        // 標成 corpus 會令遙測失真：實測一輪 52 問，rules 路盡數降級卻報作 corpus，
        // 看上去像玩法之問全走了譜內義理，而其實是上游限流。
        return streamGrounded('', passages, facts, T0, label, 'rules', why);
      },
    );
  }

  // ── 快取前置探取 ──
  // 意圖層一問模型即是三四秒（實測 V4-Pro ttft 4.3s）——同問句既有已過閘之譜內義理
  // 答案者，逕行回放，不勞意圖層。鍵＝問句＋數據版次，命中即上次同問所走之路，無誤放。
  {
    const s0 = await composeFromCache({
      env: E, T0, line, guard, kind: 'corpus', label: '谱内义理',
      ckey: await cacheKeyOf('corpus', q, body, META.builtAt),
    });
    if (s0) return new Response(s0, { headers: NDJSON });
  }

  // ── 意圖理解 ──
  // 模型只吐結構。無密鑰／超時／校驗不過者，一律降級到正則——
  // 故本段之行為，在無密鑰時與 M3 全同，定本路由不因模型不可用而失守。
  const it = await resolveIntent(body, E);
  const first = it.targets && it.targets[0];

  // 定本三路：查表直出，零生成（4620 格已逐格審定，模型重述只會添亂）
  if (it.intent === 'lookup' || it.intent === 'explain') {
    const hit = lookup(first.posNo, first.combo);
    if (hit) return new Response(streamCanon(hit, T0, it.by), { headers: NDJSON });
  }
  if (it.intent === 'position' && first && first.posNo >= 0) {
    return new Response(streamPosition(first.posNo, T0, it.by), { headers: NDJSON });
  }
  if (it.intent === 'table' && first && first.posNo >= 0) {
    return new Response(streamTable(first.posNo, T0, it.by), { headers: NDJSON });
  }

  // 定本殿後一取：模型未判出意圖，而問句自身解得位相者（quick 已算過，此處不重解）
  if (quickHit) return new Response(streamCanon(quickHit, T0, it.by), { headers: NDJSON });

  // ── 據文作答（唯一去路）──
  //
  // 【2026-08-04 發起人定「拒答率做到零」，此段遂由三重閾值收為一條】
  // 從前這裡有三道分水：強命中 ≥40 走生成、worthWenku 轉文庫、弱命中 ≥24 再走生成，
  // 皆不中者答「此事《選佛譜》未載」。實測五十二問拒答 26.9%，而逐條核對底本，
  // **九條是譜裡明明有卻檢索評分不足**——閾值攔下的不是「譜外之問」，是「檢索沒檢好」。
  // 拿檢索的短處去做「譜中有無」的判詞，本就錯位。
  //
  // 今改：檢得幾分是幾分，一律交模型看著答。答得了就答；答不了，模型依鐵律三
  // 直說「这几段谱文讲的是…，你问的这一点这里没有说到」——**這正是 NotebookLM 之法**：
  // 不說「我答不了」，只說資料講到哪裡。玩家至少知道譜裡挨著的是什麼，而非吃一句閉門羹。
  //
  // 拒答只餘一種：檢索全零命中（問句與全書七萬六千字無一字可搭）。實測 52 問中為 0。
  const corp = searchCorpus(q, { k: 3 });

  // 指名他家者（「印光大師怎麼說念佛」）不由譜內搶答，逕轉問文庫——
  // 譜內雖有「念佛觀」「八念」沾字，答之即答非所問。
  //
  // 【此處仍留一道分數，然其義與從前不同】從前的閾值判「答不答」，故攔下來就是拒答；
  // 這一道判「**由誰來答**」——譜內夠強者本譜答，否則修學之問轉文庫，兩邊都答，不生拒答。
  // 「臨終助念要注意什麼」譜內雖沾「臨終」二字（36 分）而助念行儀實在大安法師講記，
  // 由譜內搶答即答非所問。譜內夠強者如「什麼是橫超」（57 分）則本譜自答，不勞外求。
  const strongEnough = corp.length && corp[0].score >= 40;
  const toWenku = namesOthers(q)
    || (!strongEnough && worthWenku(q) && quick.posNo < 0 && !quick.combo);
  if (toWenku && (await guard.take())) {
    const sw = await streamWenku(q, E, T0, line);
    if (sw) return new Response(sw, { headers: NDJSON });
  }

  if (corp.length) {
    return tryCompose(
      { question: q, passages: corpusPassages(corp), facts: {}, kind: 'corpus', label: '谱内义理', env: E, T0, line,
        guard, ckey: await cacheKeyOf('corpus', q, body, META.builtAt) },
      () => streamCorpus(corp, T0, it.by),
    );
  }

  // 全零命中：問句與全書無一字可搭。請其換個說法，不謊稱「譜中未載」。
  return new Response(streamRefuse('nomatch', T0), { headers: NDJSON });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // 路徑三式並認：workers.dev 直訪、遊戲 Worker 之 service binding 內轉、
    // 以及 foyue.org/xuanfopu/ask/api 之對外正式路由。
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const isAsk = p === '/v1/ask' || p === '/api/ask' || p === '/xuanfopu/ask/api' || p.endsWith('/xuanfopu/ask/api');
    const isHealth = p === '/health' || p === '/' || p === '/xuanfopu/ask' || p === '/xuanfopu/ask/api/health';

    if (isHealth) {
      return json({
        ok: true, service: 'xuanfopu-agent-v2',
        routes: ['canon', 'position', 'table', 'corpus', 'rules', 'expand', 'wenku', 'refuse'],
        compose: { model: modelOf(env), keyed: !!(env && env.SILICONFLOW_API_KEY) },
        // 生成閘：公網直訪零生成（M3 行為）；遊戲內轉按 x-ask-client 行日配額＋答案快取
        guard: { kv: !!(env && env.RL), genDaily: Math.max(1, Number(env && env.ASK_GEN_DAILY) || 60), publicGen: false },
        endpoints: ['/v1/ask', '/api/ask', '/xuanfopu/ask/api'],
        canon: META,
      });
    }
    if (isAsk) {
      if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      return handleAsk(req, env);
    }
    return json({ error: 'not found' }, 404);
  },
};
