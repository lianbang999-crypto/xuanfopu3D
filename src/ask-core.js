// 問譜 · 前端共用內核（與頁面 DOM 無關的純邏輯）
// ─────────────────────────────────────────────────────────────────────────────
// 【何以立此】2026-08-12 問譜 v3 上線後，前端有兩處要接同一個後端：
//   ① read.html 的問譜抽屜（src/reader-ask.js）　② 遊戲站的「問」（src/game.js）
// 二者各寫一份 ndjson 解析與答語排版，是同一件事抄兩遍——排版規則一改必漏其一。
// 今收作一處：流式解析與答語排版在此，兩邊只管各自的 DOM 與皮。
//
// 【輸出的 class 名兩處共用】.ai-h（小標題）／.ai-cite（行內角標）——
// 名取自問文鈔（wenchao ai-core），兩處各自按本家主題着色（閱讀頁紙墨、遊戲站暗夜），
// 但結構同一。同名同構，才談得上「一套設計語言」。

const ESC = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * ndjson 流式問答：逐行 meta / delta / done，邊收邊渲。
 * 協議與 wenchao 問文鈔一致，故那邊的內核與此可互換。
 * handlers: { onMeta(meta), onDelta(full, delta), onDone(done) }
 * 返回完整答語文本。非流式響應與錯誤體 {message} 亦兼容，不吞成「無回覆」。
 */
export async function streamAsk(endpoint, payload, handlers = {}, signal) {
  const { onMeta, onDelta, onDone } = handlers;
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  let full = '';
  const onMsg = (m) => {
    if (!m) return;
    if (m.type === 'meta') { if (onMeta) onMeta(m); }
    else if (m.type === 'delta') { full += m.text || ''; if (onDelta) onDelta(full, m.text || ''); }
    else if (m.type === 'done') { if (onDone) onDone(m); }
    else if (typeof m.message === 'string' && m.message) { full += m.message; if (onDelta) onDelta(full, m.message); }
  };
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (l) try { onMsg(JSON.parse(l)); } catch { /* 半行，待下一片 */ }
      }
    }
    if (buf.trim()) try { onMsg(JSON.parse(buf.trim())); } catch { /* 末行無換行者 */ }
  } else {
    (await res.text()).split('\n').forEach((l) => { if (l.trim()) try { onMsg(JSON.parse(l)); } catch { /* 略 */ } });
  }
  return full;
}

/**
 * 答語排版：輕量 Markdown（小標題／有序無序列表／段落）＋ 行內角標。
 * 角標只在該條引文確實存在時才成按鈕——越界的 [n] 原樣留字，不裝作有出處。
 * @param {string} text   答語原文（模型所吐）
 * @param {number} nCites 引文條數
 */
export function askFormat(text, nCites = 0) {
  const t = ESC(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  let html = '', list = '', liOpen = false;
  const closeLi = () => { if (liOpen) { html += '</li>'; liOpen = false; } };
  const closeList = () => { closeLi(); if (list) { html += `</${list}>`; list = ''; } };
  for (const raw of t.split('\n')) {
    const ln = raw.trim();
    if (!ln) continue;
    let m;
    // 小標題：markdown # ／「一、…」「（一）…」（獨佔一行、較短）
    if ((m = ln.match(/^#{1,4}\s*(.+)$/))
      || (m = ln.match(/^(?:<strong>)?\s*((?:[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）)[^<\n]{0,40})(?:<\/strong>)?$/))) {
      closeList(); html += `<h4 class="ai-h">${m[1]}</h4>`;
    } else if ((m = ln.match(/^(\d+)[.、)]\s*(.+)$/))) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } else closeLi();
      html += `<li>${m[2]}`; liOpen = true;
    } else if ((m = ln.match(/^[-*●·•]\s+(.+)$/))) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } else closeLi();
      html += `<li>${m[1]}`; liOpen = true;
    } else {
      closeList(); html += `<p>${ln}</p>`;
    }
  }
  closeList();
  if (nCites > 0) {
    html = html.replace(/\[(\d{1,2})\]/g, (whole, n) => (+n >= 1 && +n <= nCites
      ? `<button type="button" class="ai-cite" data-n="${n}" title="点开看出处">${n}</button>`
      : whole));
  }
  return html;
}

/** 末二輪作續問上下文（答語截四百字）。後端另有一道截取，此處先省流量。 */
export function historyOf(list) {
  return (list || []).filter((x) => x && x.u && x.a).slice(-2).map((x) => ({ q: x.u, a: String(x.a).slice(0, 400) }));
}
