// 據文生成層 —— 模型在輸出端組織已檢得之材料，不引入材料外一字
//
// 【2026-08-12 問譜 v3】舊管線的意圖層（intent.js，模型在輸入端吐結構）隨重立撤除——
// 問譜只一條路，無路可分，省一次模型往返。本檔遂為**模型唯一所在**：
// 它吐的是**話**，校不得欄，只能逐句回查。故本檔之要害全在 gate()。
//
// 【流式與核驗之衝突，及本檔的解法】
// verify.js 檔首記著問文鈔的教訓：那邊 validateCitations「只能作遙測信號，
// 不改寫已輸出內容」——流式吐完才檢出，來不及。那是因為它不知道答案該在哪一段。
// 我們不同：passages 在手，且是**有限集**。故可按句緩衝，每句過檢才放行——
// 既仍是流式（用戶看得見字在長出來），又不會把憑空之語吐到臉上。
//
// 【分級處置】不是所有不過都該丟句，丟多了答語即成殘篇：
//   角標越界 → 剝角標後仍吐（話沒錯，只是標錯了）
//   直引對不上・憑空位名・門號錯・憑空數字 → **丟句**（這四類是硬傷，寧缺毋濫）
// 丟句過半者，done 標 ungrounded，前臺當加警示——那已不是個別失誤，是這一問模型沒依材料答。
//
// 【思考模式】發起人定 2026-08-04：用 V4-Flash，不開思考。
// 除傳 enable_thinking:false 外，另於解析處棄 reasoning_content——
// 縱上游改了參數名，思考過程也漏不到用戶眼前。
//
// 【鐵律三之措辭，2026-08-04 實測所改】原作「谱里没有正面说」，是教模型替**整部譜**下斷言，
// 而它手上只有檢索取來的三五段。實測問成書字數，答「谱中完全没有提到」，
// 而卷六《紀事》明載「連圈計字六萬九千八百六十九箇」——是檢索沒取到那一段，非書中無此事。
// 把「我沒檢到」說成「譜裡沒有」，於用戶即是妄語，故改為只說到手上材料為止。
// 惟措辭改不了檢索之短：治本仍在補《紀事》一類書志塊之檢索標籤（見 eval 報告）。

import { verifyAnswer } from './verify.js';

const API = 'https://api.siliconflow.cn/v1/chat/completions';

// 【選型實測 2026-08-04】同一問句、流式、關思考，各取樣本：
//   V4-Flash  ttft 97.1s / 92.3s / 34.2s
//   V3.2      ttft  4.1s
//   V4-Pro    ttft  1.6s
// 名為 Flash 者反最慢，慢 Pro 二十至六十倍——新模型容量未跟上，隊列最擠。
// 前端 abort 為 45s，Flash 三次有二次逕超時。故默認取 Pro。
// 此值可由 env.COMPOSE_MODEL 覆蓋（wrangler vars 改一行即切，不必動碼）；
// 換模型後須重跑 player-eval --model，ttft 與核驗留丟數都要看。
export const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4-Pro';
export const modelOf = (env) => (env && env.COMPOSE_MODEL) || DEFAULT_MODEL;

// ── 系統提示詞 ──
// 紀律寫死在此，不隨問句變。三條鐵律是本項目的底線（見 values.md）：
// 經典原文不可篡改・不代大師立言・材料沒有的不許添。

const LAW = `鐵律（違此則答語作廢）：
一、只依【材料】作答。材料沒有的，一個字也不許添——不引他經、不憑常識補、不作發揮。
二、句末綴角標 [n]，n 為所依材料之編號。無材料可依之句，不寫。
三、材料答不了所問，就說「这几段谱文讲的是…，你问的这一点这里没有说到」，不許繞、不許猜。
　　此語只說到手上材料為止，不可寫成「谱里没有」「谱中完全没有提到」——你看見的是全書之三五段。
四、不代蕅益大師立言。只說「谱中说」「谱里讲」，不說「大师认为」「大师的意思是」。
五、講白話給今人聽，不複述文言、不掉書袋。`;

// 【問譜 v3，2026-08-12】提示詞隨管線一併重立：面向**讀這部書的讀者**（問文鈔之形），
// 不再是「正在下棋的玩家」。玩法／局面（rules）與定本串講（expand）二式隨舊管線撤——
// 判詞與行法表歸位卡零生成直出，不歸問譜管。個人決斷與占卜二式是值觀層要求，保留。
const SYS = {
  // 譜內之問（正路）：材料為檢得之譜內原文塊
  ask: `你是「問譜」——《選佛譜》（明·蕅益大師撰，六卷）的助讀，面向正在讀這部書的普通讀者。
讀者多半不通文言、不熟教理，你要把譜中原文講成他聽得懂的話。

${LAW}

體例：先用一兩句直接回答所問，再說譜中依據；所答頭緒多時，可用「一、」「二、」小標題分節。三百字以內。`,

  // 個人決斷之問（該不該出家／辭職／結婚）
  // 【何以不逕拒】發起人 2026-08-02 定「軟件不該替人做這個決定」——此則不動。
  // 但「不替他決定」與「不給他東西」是兩回事：他問出家，譜中門七戒學十三位
  // 正是完整的出家戒次第——譜裡明明有，不可空手打發他。
  personal: `你是「問譜」——《選佛譜》的助讀。讀者問的是他自己該不該做某個人生決定。

${LAW}

六、**這個決定不替他做**。開口即說明白：這是他自己的事，譜不替人決斷，也不看吉凶。
　　但不可空手打發他——譜中若有相關的修行次第，照講給他聽。
七、不勸他做、也不勸他不做；不揣測他的處境；不說「你應該」。
八、末了指一句：具體行門宜從明師、依經論。

體例：先一句說清「這個譜不替你決定」，再講譜中相關次第。二百字以內，語氣平實體貼。`,

  // 占卜吉凶之問：明白回絕，所依即《敘》「皆本教乘非出臆見」——非我輩立規矩，是照著敘說
  divine: `你是「問譜」——《選佛譜》的助讀。讀者把這部譜當作占卜，問吉凶禍福。

${LAW}
六、開口先說明白：此譜依教乘定升沉，不是求籤問卜之具——《敘》云「皆本教乘非出臆見」。
　　不預言吉凶、不解籤、不說某相「預示」什麼。
七、不斥責、不嘲弄。一句說破之後，可據材料講譜真正要人用它做的事。

體例：二百字以內，語氣平實。`,
};

/** 材料 → 提示詞中的【材料】段 */
function materialsOf(passages) {
  return passages.map((p, i) => `【${i + 1}】（${p.ref || p.title || '譜內'}）\n${p.text}`).join('\n\n');
}

/** 局面 → 提示詞中的【當下局面】段。無局者返回空串。 */
function situationOf(facts) {
  if (!facts) return '';
  const L = [];
  if (facts.pos) L.push(`現居位：${facts.pos}`);
  if (facts.gate) L.push(`所在門：第${facts.gate}門「${facts.gateName || ''}」`);
  // 措辭須說死：曾有模型把「最近擲得那謨」讀成「玩家正擲出那謨」，
  // 於是自行查表答「你落到了中品十惡」——而玩家其實仍在現居位，那一擲早已結算。
  if (facts.combo) L.push(`上一擲之輪相：${facts.combo}（此擲已結算完畢，現居位即結算後所在，不必再為他推算去向）`);
  if (facts.verdict) L.push(`本擲判定：${facts.verdict}${facts.to ? `，往「${facts.to}」` : ''}${facts.grant ? `，贈擲 ${facts.grant} 次` : ''}`);
  if (facts.n) L.push(`已擲次數：${facts.n}`);
  if (Array.isArray(facts.trail) && facts.trail.length) L.push(`足跡：${facts.trail.join('→')}`);
  if (Array.isArray(facts.rows) && facts.rows.length) {
    L.push(`本位行法表（擲何相往何處，皆查表所得）：\n${facts.rows
      .map((r) => `  「${r.combo}」→ ${r.verdict === '無行法' ? '本無行法' : r.verdict === '不行' ? '不行，安住原位' : r.grant ? `贈擲 ${r.grant} 次` : r.to}`)
      .join('\n')}`);
  }
  return L.length ? `【當下局面】\n${L.join('\n')}\n\n` : '';
}

// ── 句級閘 ──

// 硬傷四類：丟句。角標越界不在此列——剝了仍可用。
const FATAL = new Set(['quote', 'position', 'gate', 'number']);

/**
 * 一句過閘。
 * @returns {{text:string, dropped:boolean, issues:Array}}
 */
export function gate(sentence, passages, facts) {
  const v = verifyAnswer(sentence, passages, facts || {});
  if (v.ok) return { text: sentence, dropped: false, issues: [] };
  if (v.issues.some((i) => FATAL.has(i.kind))) {
    return { text: '', dropped: true, issues: v.issues };
  }
  // 只餘角標越界：剝之。話是依材料說的，只是標號寫錯了。
  return {
    text: sentence.replace(/\[(\d{1,2})\]/g, (whole, n) => (+n >= 1 && +n <= passages.length ? whole : '')),
    dropped: false,
    issues: v.issues,
  };
}

// 句末標點後若緊跟角標，並入本句——否則角標會落到下句開頭，雖不誤核驗，讀來卻是斷的
const SENT = /^[\s\S]*?[。！？；\n](?:\[\d{1,2}\])?/;

/** 從緩衝中切出所有完整句子，餘者留在緩衝 */
function cut(buf) {
  const out = [];
  let rest = buf;
  for (;;) {
    const m = rest.match(SENT);
    if (!m || !m[0]) break;
    out.push(m[0]);
    rest = rest.slice(m[0].length);
  }
  return { sents: out, rest };
}

/**
 * 答案快取命中即回放（meta＋整段 delta＋done，cacheStatus:'hit'）。
 * 只服務遊戲內轉（guard.trusted）——公網直訪連快取也不給，免被探庫；
 * 命中零成本，故置於配額之前、不扣額（見 index.js tryCompose 之序）。
 * 鍵含模型名與數據版次（builtAt），換模型或重建數據即自然失效。
 */
export async function composeFromCache(o) {
  const { env, T0, line } = o;
  if (!o.guard || !o.guard.trusted || !o.ckey) return null;
  const kv = env && env.RL;
  if (!kv) return null;
  let hit = null;
  try { hit = await kv.get(`ans:${modelOf(env)}:${o.ckey}`, 'json'); } catch { /* 快取故障視同未中 */ }
  if (!hit || !hit.text) return null;
  return new ReadableStream({
    start(c) {
      c.enqueue(line({
        type: 'meta', passages: hit.passages || [],
        sources: (hit.passages || []).map((p) => ({ title: p.title, ref: p.ref })),
        facts: hit.facts || null,
        basis: { mode: hit.kind || o.kind, label: hit.label || o.label },
        model: modelOf(env), cacheStatus: 'hit',
        timing: { ttft: Date.now() - T0 },
      }));
      c.enqueue(line({ type: 'delta', text: hit.text }));
      c.enqueue(line({
        type: 'done',
        verify: hit.verify || { ok: true, checks: {}, issues: [] },
        evidenceStatus: hit.evidenceStatus || 'grounded',
        cacheStatus: 'hit',
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

/**
 * 據文生成，流式吐 ndjson。
 *
 * @param {object} o
 * @param {string} o.question   問句
 * @param {Array}  o.passages   材料（引文卡形）
 * @param {object} o.facts      定本／局面事實；核驗用，亦入提示詞
 * @param {string} o.kind       corpus｜rules｜expand
 * @param {string} o.label      basis.label，前臺分區署名用
 * @param {object} o.env        Worker env
 * @param {number} o.T0         起算時刻
 * @param {Function} o.line     ndjson 編碼器
 * @returns {ReadableStream|null}  null 表不可用（無密鑰／上游拒），由上層降級
 */
export async function streamCompose(o) {
  const { question, passages, facts, kind, label, env, T0, line } = o;
  const key = env && env.SILICONFLOW_API_KEY;
  // 降級原因掛回 o，供上層寫入 meta.degradedReason——實測一輪 52 問有二成走降級，
  // 而降級之由（無鑰／上游拒／斷流）從外面全然看不出，無從診治。故留此一線遙測。
  if (!key) { o.degradedReason = 'nokey'; return null; }                      // 無密鑰：上層降級到原文直出，地基不依賴模型

  let sys = SYS[kind] || SYS.ask;
  const mat = passages.length ? `【材料】\n${materialsOf(passages)}\n\n` : '';
  const sit = situationOf(facts);
  if (!mat && !sit) { o.degradedReason = 'nomaterial'; return null; }   // 材料與局面俱空，無可依據——不許憑空生成
  // 無引文而仍令綴角標，模型必編一個 [1] 出來，然後被角標閘剝掉——
  // 與其事後剝，不如先不要它寫。（實測「我離成佛還有多遠」即如此，引文 0 條而答語三處 [1]）
  if (!passages.length) {
    sys += '\n\n※ 本次沒有引文材料，全篇不得寫任何角標 [n]。所答只依【當下局面】所列之確定事實。';
  }

  const model = modelOf(env);
  // 多輪（問譜 v3）：前二輪問答作上下文入 messages——續問（「再講細些」「那第二種呢」）
  // 方接得上茬。前答截四百字（index.js 已截），材料段只掛本輪檢得者，不累積。
  const turns = [];
  for (const h of (Array.isArray(o.history) ? o.history : [])) {
    turns.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a });
  }
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 800,
        stream: true,
        enable_thinking: false,               // 發起人定：不開思考。另於解析處棄 reasoning_content 為二重保險
        messages: [
          { role: 'system', content: sys },
          ...turns,
          { role: 'user', content: `${mat}${sit}【讀者問】${question}` },
        ],
      }),
    });
  } catch (e) { o.degradedReason = 'fetch:' + String(e && e.message || e).slice(0, 40); return null; }
  if (!res) { o.degradedReason = 'nores'; return null; }
  if (!res.ok) { o.degradedReason = 'upstream:' + res.status; return null; }
  if (!res.body) { o.degradedReason = 'nobody'; return null; }

  return new ReadableStream({
    async start(c) {
      c.enqueue(line({
        type: 'meta', passages,
        sources: passages.map((p) => ({ title: p.title, ref: p.ref })),
        facts: facts && facts.pos ? facts : null,
        basis: { mode: kind, label },
        model,
        timing: { ttft: Date.now() - T0 },
      }));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let sse = '', buf = '', kept = 0, dropped = 0, out = '';   // out＝實際吐出全文，快取回放所本
      const issues = [];

      const flush = (sents) => {
        for (const s of sents) {
          if (!s.trim()) { out += s; c.enqueue(line({ type: 'delta', text: s })); continue; }
          const g = gate(s, passages, facts);
          if (g.dropped) { dropped++; issues.push(...g.issues); continue; }
          kept++;
          if (g.issues.length) issues.push(...g.issues);
          out += g.text;
          c.enqueue(line({ type: 'delta', text: g.text }));
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          sse += dec.decode(value, { stream: true });
          let sep;
          while ((sep = sse.indexOf('\n\n')) >= 0) {
            const block = sse.slice(0, sep); sse = sse.slice(sep + 2);
            const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;
            const data = dataLine.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let j; try { j = JSON.parse(data); } catch { continue; }
            const d = j.choices && j.choices[0] && j.choices[0].delta;
            if (!d) continue;
            // reasoning_content 一概棄之——不開思考是已定之事，縱上游自作主張亦不外露
            const t = typeof d.content === 'string' ? d.content : '';
            if (!t) continue;
            buf += t;
            const { sents, rest } = cut(buf);
            buf = rest;
            if (sents.length) flush(sents);
          }
        }
      } catch { /* 中途斷流：已吐者留，未吐者止——不補編 */ }

      if (buf.trim()) flush([buf]);           // 末句無標點者亦須過閘

      // 丟句過半：已非個別失誤，是這一問模型沒依材料答。據實標記，前臺當加警示。
      const grounded = kept > 0 && dropped <= kept;
      // 全過閘者方存快取（丟過句的殘篇不配回放）；寫失敗不反噬答問
      if (o.ckey && dropped === 0 && kept > 0 && env && env.RL) {
        try {
          await env.RL.put(`ans:${model}:${o.ckey}`, JSON.stringify({
            text: out, kind, label,
            passages, facts: facts && facts.pos ? facts : null,
            verify: { ok: true, checks: { kept, dropped, passages: passages.length }, issues: [] },
            evidenceStatus: 'grounded',
          }), { expirationTtl: 604800 });   // 七日；鍵含 builtAt，數據更新即自然換代
        } catch { /* 快取寫失敗不反噬答問 */ }
      }
      c.enqueue(line({
        type: 'done',
        verify: { ok: dropped === 0, checks: { kept, dropped, passages: passages.length }, issues: issues.slice(0, 8) },
        evidenceStatus: grounded ? 'grounded' : 'ungrounded',
        ...(o.guard && o.guard.remaining != null ? { remaining: o.guard.remaining } : {}),
        ...(o.ckey ? { cacheStatus: 'miss' } : {}),
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}
