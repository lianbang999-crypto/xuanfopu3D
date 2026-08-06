// 选佛谱智能体 · NotebookLM 式问答内核（渲染与流式，与页面 DOM 无关的纯逻辑）
//
// 形态取法《印光法师文钞》「问文钞」（lianbang999/wenchao/site/js/ai-core.js）：
// ndjson 逐行流式、行内角标 [n]、角标点开出处卡、轻量 Markdown 分节。
//
// 与文钞的两处不同——
//   一、出处卡不跳文章页，跳**棋盘上那一位**。引文所出之位可再点进去看，
//       这是位枢纽图的用处：引文不是死的脚注，能把人带到谱里的另一处。
//   二、我们多一样文钞没有的东西：facts（判定・去向・赠数）。定本路由是查表得来的
//       确定事实，故可渲成可点的去向按钮，不与「AI 生成的话」混同。
//
// 繁简：一律跟随用户设置（游戏设定里那一个 OpenCC 开关统管全站），此处不作处理。

export const AGENT_BASIS = Object.freeze({
  canon: '谱内定本',      // 位×相精确命中，零检索零生成
  refuse: '谱外',         // 定句拒答，不调生成
});

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * ndjson 流式问答：逐行 meta / delta / done，边收边渲。
 * handlers: { onMeta(meta), onDelta(full, delta), onDone(done) }
 * 返回完整答语文本。非流式响应与错误体 {message} 亦兼容，不吞成「无回复」。
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
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (line) try { onMsg(JSON.parse(line)); } catch { /* 半行，待下一片 */ }
      }
    }
    if (buf.trim()) try { onMsg(JSON.parse(buf.trim())); } catch { /* 末行无换行者 */ }
  } else {
    (await res.text()).split('\n').forEach((l) => { if (l.trim()) try { onMsg(JSON.parse(l)); } catch {} });
  }
  return full;
}

/**
 * 答语排版：轻量 Markdown（小标题／有序无序列表／段落）＋ 行内角标。
 * 角标只在该条引文确实存在时才成按钮——越界的 [n] 原样留字，不装作有出处。
 */
export function formatAnswer(text, passages) {
  const t = esc(text);
  let html = '', list = '', liOpen = false;
  const closeLi = () => { if (liOpen) { html += '</li>'; liOpen = false; } };
  const closeList = () => { closeLi(); if (list) { html += `</${list}>`; list = ''; } };
  for (const raw of t.split('\n')) {
    const ln = raw.trim();
    if (!ln) continue;
    let m;
    if ((m = ln.match(/^○\s*(.+)$/))) {                       // 位义附注：另起一行，弱化
      closeList(); html += `<div class="cNote" style="margin:6px 0 0">${m[1]}</div>`;
    } else if ((m = ln.match(/^(.+?)\s·\s掷得(.+)$/))) {       // 判词首行：位・相・去向
      closeList(); html += `<div class="cMeta" style="margin:0 0 4px">${ln}</div>`;
    } else if ((m = ln.match(/^(\d+)[.、)]\s*(.+)$/))) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } else closeLi();
      html += `<li>${m[2]}`; liOpen = true;
    } else if ((m = ln.match(/^[-*•·]\s+(.+)$/))) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } else closeLi();
      html += `<li>${m[1]}`; liOpen = true;
    } else {
      closeList(); html += `<div class="cRead" style="margin:4px 0">${ln}</div>`;
    }
  }
  closeList();
  if (passages && passages.length) {
    html = html.replace(/\[(\d{1,2})\]/g, (whole, n) => (passages[+n - 1]
      ? `<button type="button" class="sfpCite" data-n="${n}" title="点开看出处">${n}</button>`
      : whole));
  }
  return html;
}

/**
 * 出处卡：逐字原文 ＋ 出处串 ＋ 跳位。
 * 引的是本位还是他位，看出处串上的位名即知——不加类型标签，出处本身把分量说尽。
 */
export function citationHtml(p, { curPos } = {}) {
  if (!p) return '';
  const other = p.posName && p.posName !== curPos;
  const jump = other
    ? `<button type="button" class="sfpCiteGo" data-pos="${esc(p.posName)}">去「${esc(p.posName)}」看 ›</button>`
    : '';
  return `<div class="sfpCiteCard">
    <div class="cMeta">${esc(p.ref || '')}</div>
    <div class="txt">${esc(p.text || '')}</div>
    ${jump}</div>`;
}

/** 定本事实条：判定与去向。这是查表得来的确定事实，与答语分栏呈现，不相混同。 */
export function factsHtml(facts) {
  if (!facts) return '';
  const verdict = facts.verdict === '無行法'
    ? '<span class="kind">已至究竟，本无行法</span>'
    : facts.verdict === '不行'
      ? '<span class="kind">不行 · 安住原位</span>'
      : facts.grant
        ? `<span class="kind">赠掷 ${facts.grant} 次</span>`
        : '';
  const to = facts.to && facts.verdict === '行'
    ? `<button type="button" class="sfpFactGo" data-pos="${esc(facts.to)}">→ ${esc(facts.to)}</button>`
    : '';
  if (!verdict && !to) return '';
  return `<div class="sfpFacts">${verdict}${to}</div>`;
}

/** 拒答与故障的定句：一律中文，不泄漏内部字段名（设计书纪律三） */
export const AGENT_TEXT = Object.freeze({
  offline: '智能体暂未连接（网络或服务未就绪）；以下为本谱本地速查，稍后可重问。',
  thinking: '正在据谱作答……',
});
