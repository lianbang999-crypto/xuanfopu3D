// 莲友茶寮 · 前端（2026-08-11 与主站脱钩改版）
// 数据自立：走本站 /api/plaza/chat（worker plaza DO 自建留言），不再与 foyue.org 群互通。
// 界面极简（用户定案）：页头一行、消息流、输入行三段封顶；去气泡改「一行一言」——
// 名号小字灰、正文同行青墨，气质从 IM 转向留言簿闲话；自己的话只在名号处点一记金。
// 静默设计：无红点、无未读数、无「正在输入」、无音效——道场聊天室，不催人。
// 消息流控件（mountChalouFeed）独立可挂：全屏茶寮页与大厅右墙共用同一份逻辑与样式。

import { API_BASE } from './app-env.js'; // 安卓壳下指向站点正源；网页下空串，行为不变

const HELLO_KEY = 'sm10.cl.hello';   // 初到之约只说一次（沿用旧茶寮的记号，老莲友不再被叨扰）
const PULL_MS = 6000;                // 6 秒增量轮询，离页即停（与旧茶寮同刻度）
const KEEP_ROWS = 220;               // DOM 里留的行数上限（服务端本就只存 300）
const TS_GAP_MS = 600000;            // 10 分钟一枚时间戳（与旧茶寮同刻度）

// ---------------- 数据层 ----------------

export function chalouApi(actorId) {
  return {
    // 增量拉取：after=0 取尾部 50 条；带 actor 让服务端标出「我」的行（莲号不外发）
    async pull(after = 0) {
      const r = await fetch(`${API_BASE}/api/plaza/chat?after=${after}&actor=${encodeURIComponent(actorId)}`);
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      return data.items || [];
    },
    // 发言：错误一律取 json.error 中文短句直接呈给用户
    async send(name, text) {
      const r = await fetch(`${API_BASE}/api/plaza/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: actorId, name, text }),
      });
      if (r.ok) return { ok: true };
      let msg = '';
      try { msg = String((await r.json()).error || ''); } catch (e) {}
      return { ok: false, error: msg || '留言未送出，请稍后再试' };
    },
  };
}

// ---------------- 消息流控件（全屏页与大厅右墙共用） ----------------

// host：一个空容器（控件在其内建 .clMsgs 滚动流并自管轮询）；返回 { start, stop, push }。
// ctx：{ esc, zh, api, compact }——compact 是右墙紧凑形态（首拉后不出「暂静」空语，行距略收）。
export function mountChalouFeed(host, ctx) {
  const { esc, zh, api } = ctx;
  host.classList.add('clFeed');
  if (ctx.compact) host.classList.add('compact');
  host.innerHTML = `<div class="clMsgs" role="log" aria-live="polite" aria-relevant="additions" aria-label="${zh('茶寮留言')}"></div>`;
  const msgs = host.querySelector('.clMsgs');
  msgs.innerHTML = `<div class="clEmpty">${zh('正在取莲友留言……')}</div>`;
  let timer = 0;
  let lastId = 0;
  let lastTs = 0;
  let first = true;

  const atBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight <= 48;
  const stick = () => { msgs.scrollTop = msgs.scrollHeight; };
  const when = (ts) => { // 10 分钟一枚时间戳，本机时区呈现；跨日带月日
    const d = new Date(Number(ts) || Date.now());
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  };
  // 一行一言：名号｜正文同行。正文是莲友自由文本：只转义不简繁转换（内容区不转换，旧茶寮同则）
  const rowHtml = (c) => {
    let html = '';
    if (Number(c.ts) - lastTs > TS_GAP_MS) html += `<div class="clTs">${when(c.ts)}</div>`;
    lastTs = Number(c.ts) || lastTs;
    html += `<div class="clRow${c.mine ? ' mine' : ''}"><span class="who">${c.mine ? zh('我') : esc(c.name || '莲友')}</span><span class="tx">${esc(c.text || '')}</span></div>`;
    return html;
  };
  const append = (items) => {
    if (!items?.length) return;
    msgs.querySelector('.clEmpty')?.remove();
    const keep = atBottom();
    // 首批 50 条不逐行动画（那是开屏不是新话）；此后新来的行才 8px 上移淡入一次
    msgs.classList.toggle('noAnim', first);
    for (const c of items) { msgs.insertAdjacentHTML('beforeend', rowHtml(c)); lastId = Math.max(lastId, Number(c.id) || 0); }
    while (msgs.children.length > KEEP_ROWS) msgs.removeChild(msgs.firstChild);
    if (keep || first) stick();
  };
  const pull = async () => {
    try {
      const items = await api.pull(lastId);
      if (!host.isConnected) { stop(); return; }
      append(items);
      if (first && !ctx.compact && !msgs.querySelector('.clRow')) {
        msgs.innerHTML = `<div class="clEmpty">${zh('茶寮暂静——念一句佛号，或与莲友问讯')}</div>`;
      }
      first = false;
    } catch (e) {
      if (first && host.isConnected && !ctx.compact) {
        msgs.innerHTML = `<div class="clEmpty">${zh('茶寮暂时连接不上，请稍后再来')}</div>`;
      }
    }
  };
  const start = () => { pull().then(() => { if (host.isConnected && !timer) timer = window.setInterval(pull, PULL_MS); }); };
  const stop = () => { window.clearInterval(timer); timer = 0; };
  return { start, stop, pull, stick, msgs };
}

// ---------------- 输入行（同样共用） ----------------

// host：空容器；ctx：{ esc, zh, api, savedName, onNeedName(draft), afterSend }。
// 首次发言无名号：把草稿交给 onNeedName 转去取名卡，回来经 draft 参数还回，不丢字。
export function mountChalouInput(host, ctx, draft = '') {
  const { zh, api } = ctx;
  host.classList.add('clInput');
  host.innerHTML = `<span class="clHint" aria-live="polite"></span>
    <input maxlength="150" aria-label="${zh('留言内容')}" placeholder="${zh('说一句…')}">
    <button type="button" aria-label="${zh('发送留言')}">${zh('发送')}</button>`;
  const input = host.querySelector('input');
  const goBtn = host.querySelector('button');
  const hintEl = host.querySelector('.clHint');
  if (draft) input.value = draft;
  let hintTimer = 0;
  const hintSay = (t) => {
    hintEl.textContent = zh(t);
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => { hintEl.textContent = ''; }, 2600);
  };
  const send = async (raw) => {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const name = ctx.savedName();
    if (!name) { ctx.onNeedName(input.value); return; }   // 草稿随往返保留
    goBtn.disabled = true;
    try {
      const res = await api.send(name.slice(0, 12), text);
      if (res.ok) { input.value = ''; await ctx.afterSend?.(); }
      else hintSay(res.error);
    } catch (e) { hintSay('网络不通，留言未送出'); }
    finally { if (host.isConnected) goBtn.disabled = false; }
  };
  goBtn.addEventListener('click', () => send(input.value));
  input.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') send(input.value); });
  return { send, input };
}

// ---------------- 全屏茶寮页 ----------------

// ctx：{ el, esc, zh, zhDom, actorId, savedName, onNeedName(draft), onBack }
// 返回 { root, start, stop }——overlay 的开合仍归宿主（game.js）管。
export function mountChalou(ctx, draft = '') {
  const { el, zh } = ctx;
  let firstVisit = false;
  try { firstVisit = !localStorage.getItem(HELLO_KEY); } catch (e) {}
  const root = el(`<div class="panel pzPanel"><div class="fsShell">
    <header class="pzTop"><div><span class="pzEyebrow">选佛谱</span><h2>莲友茶寮</h2></div></header>
    <div class="fsBody" style="overflow:hidden"><div class="fsWrap clWrap" style="height:100%">
      ${firstVisit ? `<div class="clHello" id="clHello"><span>初到茶寮——此处莲友同座闲话，请轻声慢语。</span><button id="clHelloX" type="button">知道了</button></div>` : ''}
      <div class="clFeedHost"></div>
      <div class="clQuick"><button type="button" data-nozh>南無阿彌陀佛</button></div>
      <div class="clInputHost"></div>
      <button class="pzBack" id="clBack" type="button" style="margin-top:10px;flex:none">回大厅</button>
    </div></div>
  </div></div>`);
  const hello = root.querySelector('#clHelloX');
  if (hello) hello.addEventListener('click', () => {
    try { localStorage.setItem(HELLO_KEY, '1'); } catch (e) {}
    root.querySelector('#clHello')?.remove();
  });
  const api = chalouApi(ctx.actorId);
  const feed = mountChalouFeed(root.querySelector('.clFeedHost'), { ...ctx, api });
  const inputCtl = mountChalouInput(root.querySelector('.clInputHost'), {
    ...ctx, api,
    afterSend: async () => { await feed.pull(); feed.stick(); },   // 自己的话随增量带回（mine=true）
  }, draft);
  // quick 一枚（极简定案：三钮撤二留一）——佛号即最常说的那句
  root.querySelectorAll('.clQuick button').forEach(b => b.addEventListener('click', () => inputCtl.send(b.textContent || '')));
  root.querySelector('#clBack').addEventListener('click', () => { feed.stop(); ctx.onBack(); });
  return { root, start: feed.start, stop: feed.stop };
}

// ---------------- 样式 ----------------

// 全屏壳（fsShell/pzTop/pzBack）与石青底沿用 plaza.js 的 PLAZA_CSS；此处只有茶寮自己的皮。
export const CHALOU_CSS = `
/* 莲友茶寮（2026-08-11 脱钩极简版）：一行一言的留言簿，不是 IM——
   名号小字灰、正文同行青墨；自己的话不换色块，只在名号处点一记金。 */
.clWrap{display:flex;flex-direction:column;min-height:100%}
.clFeed{flex:1;min-height:0;display:flex;flex-direction:column}
.clFeed .clMsgs{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  touch-action:pan-y;display:flex;flex-direction:column;gap:7px;padding:4px 2px 10px}
.clTs{align-self:center;font-size:var(--fs-xs,11px);color:var(--aq-note);opacity:.85;padding:2px 0}
.clRow{display:flex;gap:9px;align-items:baseline;line-height:1.6;animation:clIn .2s ease-out}
.clMsgs.noAnim .clRow{animation:none}   /* 首批 50 条是开屏不是新话，不逐行动画 */
@keyframes clIn{from{opacity:0;transform:translateY(8px)}}
.clRow .who{flex:none;max-width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--aq-note);font-size:var(--fs-xs,11px);letter-spacing:.5px}
.clRow.mine .who{color:var(--aq-gold);font-weight:600}
.clRow .tx{min-width:0;word-break:break-word;color:var(--aq-tx);font-size:var(--fs-md,14px)}
.clEmpty{margin:auto;text-align:center;color:var(--aq-note);font-size:var(--fs-sm,12.5px);line-height:1.7;padding:34px 0}
/* 初到之约：说一次，记住即不再叨扰 */
.clHello{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:9px 12px;border:1px solid var(--aq-goldline);
  border-radius:10px;background:var(--aq-goldwash);color:var(--aq-tx);font-size:var(--fs-sm,12.5px);line-height:1.6}
.clHello span{flex:1;min-width:0}
.clHello button{flex:none;min-height:34px;padding:5px 12px;border:1px solid var(--aq-goldline);border-radius:9px;
  background:rgba(255,255,255,.55);color:var(--aq-tx);font:inherit;font-size:var(--fs-xs,11px);letter-spacing:1px;cursor:pointer}
.clQuick{display:flex;flex:none;gap:8px;padding:2px 0 8px}
.clQuick button{min-height:40px;white-space:nowrap;border:1px solid var(--aq-line);background:rgba(255,255,255,.5);
  color:var(--aq-tx);border-radius:12px;padding:7px 12px;cursor:pointer;font:inherit;font-size:var(--fs-sm)}
.clQuick button:hover{border-color:var(--aq-goldline);background:rgba(176,131,28,.07)}
.clInput{position:relative;display:flex;flex:none;gap:8px;padding:9px 0 0;border-top:1px solid var(--aq-line)}
.clInput input{flex:1;min-width:0;min-height:44px;box-sizing:border-box;background:rgba(255,255,255,.7);
  border:1px solid var(--aq-line);border-radius:10px;color:var(--aq-tx);padding:9px 11px;font-family:inherit;font-size:var(--fs-lg);outline:none}
.clInput input:focus{border-color:rgba(150,112,32,.6);box-shadow:0 0 0 2px rgba(176,131,28,.1)}
.clInput button{min-width:64px;min-height:44px;border:1px solid var(--aq-goldline);background:var(--aq-goldwash);
  color:var(--aq-tx);border-radius:10px;cursor:pointer;font:inherit;font-weight:600}
.clHint{position:absolute;left:2px;bottom:calc(100% + 3px);color:var(--aq-woe);font-size:var(--fs-xs,11px);pointer-events:none}
.clHint:empty{display:none}
/* 右墙紧凑形态（大厅桌面双栏用）：行距收一档，空语交由右墙自己的留白 */
.clFeed.compact .clMsgs{gap:5px;padding:2px 0 6px}
.clFeed.compact .clRow .tx{font-size:var(--fs-sm,12.5px)}
@media (prefers-reduced-motion:reduce){.clRow{animation:none}}
`;
