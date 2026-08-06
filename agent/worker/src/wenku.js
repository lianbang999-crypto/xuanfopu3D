// 問道旁路 —— 譜外修行之問，轉佛樂「問文庫」（大安法師講記）
//
// foyue.org 之問道本身即 NotebookLM 式：8999 塊原文 RAG → 流式作答帶出處編號 → 點編號跳讀原文，
// 系統提示詞固守「只依原文、注明出處、不足則如實說、**不代法師說法**」——與本譜紀律同出一轍。
// 故不重建語料，直接轉呈。
//
// **分區不混編**（設計書紀律三）：轉呈之答，`basis.mode` 標為 `wenku`，
// 前臺另署「大安法師講記」。譜曰與講記各歸其主，用戶一眼看得出這句依的是哪一邊。
//
// 兩處銜接：
//   · foyue 之響應是 SSE（event/data），本譜是 ndjson——此處轉譯
//   · foyue 不發 CORS 頭，本就只能服務端調；同帳號下優先 service binding，免公網往返

const WENKU_URL = 'https://foyue.org/api/ask';

/** SSE 一段 → { event, data } */
function parseSseChunk(block) {
  let event = 'message', data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  return { event, data };
}

/** 出處卡：文庫之 sources → 本譜 passages 之形（欄位名對齊，前端內核不必分兩套） */
function toPassages(sources) {
  return (sources || []).map((s) => ({
    title: s.title || '',
    text: s.x || '',                               // 段落摘錄
    ref: `《${s.series || ''}》${s.title || ''}`,
    posName: '',                                   // 文庫無位，故不繫位名、不作跳位
    url: s.path ? `https://foyue.org${s.path}` : 'https://foyue.org/',
    from: 'wenku',
  }));
}

/**
 * 轉呈問道。返回 ReadableStream（本譜 ndjson），或 null 表不可用——
 * 不可用時上層據實答「此事《選佛譜》未載」，**不編造、不強答**。
 */
export async function streamWenku(question, env, T0, line) {
  let res;
  try {
    const req = new Request(WENKU_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: String(question).slice(0, 300) }),
    });
    // 同帳號優先走 service binding（免公網往返、免對外限流）；未綁定則走 HTTPS
    res = env.WENKU_SERVICE ? await env.WENKU_SERVICE.fetch(req) : await fetch(req);
  } catch { return null; }
  if (!res || !res.ok || !res.body) return null;

  return new ReadableStream({
    async start(c) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', sent = false, sources = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let sep;
          while ((sep = buf.indexOf('\n\n')) >= 0) {
            const { event, data } = parseSseChunk(buf.slice(0, sep));
            buf = buf.slice(sep + 2);
            if (event === 'sources') {
              try { sources = JSON.parse(data); } catch { sources = []; }
              const passages = toPassages(sources);
              c.enqueue(line({
                type: 'meta', passages,
                sources: passages.map((p) => ({ title: p.title, ref: p.ref })),
                facts: null,
                basis: { mode: 'wenku', label: '大安法师讲记' },
                timing: { ttft: Date.now() - T0 },
              }));
              sent = true;
            } else if (event === 'delta' && data) {
              // 佛樂之 delta 送 {"text":"…"} 物件（亦見送純字串者），兩式皆須解，
              // 否則吐給用戶的是一串 JSON。此病本地評測只驗 basis 而未驗文本，故線上方見。
              let t = data;
              try {
                const j = JSON.parse(data);
                if (typeof j === 'string') t = j;
                else if (j && typeof j.text === 'string') t = j.text;
                else if (j && typeof j.delta === 'string') t = j.delta;
              } catch { /* 非 JSON 則原樣 */ }
              if (t) c.enqueue(line({ type: 'delta', text: t }));
            }
          }
        }
      } catch { /* 中途斷流：已吐者留，未吐者止——不補編 */ }
      if (!sent) {
        c.enqueue(line({ type: 'meta', passages: [], sources: [], basis: { mode: 'wenku', label: '大安法师讲记' } }));
      }
      c.enqueue(line({
        type: 'done', verify: null,
        evidenceStatus: sources.length ? 'grounded' : 'ungrounded',
        timing: { total: Date.now() - T0 },
      }));
      c.close();
    },
  });
}

/**
 * 判其是否修行之問——是則值得轉問文庫，否則直接答「未載」。
 * 個人決斷（該不該辭職／出家／婚嫁）**不轉**：那不是知識不足，
 * 是軟件不該替人做這個決定（發起人已定之邊界）。
 */
const PRACTICE = /念佛|往生|淨土|净土|極樂|极乐|彌陀|弥陀|回向|迴向|修行|功課|功课|持戒|禪|禅|懺|忏|發願|发愿|信願|信愿|臨終|临终|助念|superstition|因果|業障|业障|經|经典|法門|法门|菩提心|三皈|皈依|布施|供養|供养/;
// 指名他家者（人名・典籍），問的不是本譜——縱譜內偶有沾字亦不當搶答。
// 「印光大師怎麼說念佛」譜內雖有「念佛觀」「八念」，答之即答非所問。
const OTHERS = /印光|大安|蓮池|藕益之外|文鈔|文钞|安士|徹悟|彻悟|善導|善导|法師怎麼說|法师怎么说|法師開示|法师开示/;
export function namesOthers(question) { return OTHERS.test(String(question || '')); }

const PERSONAL = /該不該|该不该|要不要|值不值得|我能不能|幫我決定|帮我决定|辭職|辞职|離婚|离婚|結婚|结婚|投資|投资|買|买房|跳槽/;

export function worthWenku(question) {
  const q = String(question || '');
  if (PERSONAL.test(q)) return false;
  return PRACTICE.test(q);
}

/** 個人決斷之問。上層須**攔在檢索之前**——否則譜內但有「出家」二字之塊即被搶去，
 *  用戶問「該不該出家」卻得一段戒學譜文，答非所問。 */
export function isPersonal(question) { return PERSONAL.test(String(question || '')); }
