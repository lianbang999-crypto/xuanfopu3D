// 分享卡 · 一个组件两用：带房号＝邀请莲友入局，无房号＝荐游戏
// 二维码内嵌生成（qrcode-generator，MIT，Vite 打包内联无外链）；
// 转发优先 navigator.share（系统分享面板，微信外的社交软件可直转）；
// 微信内置浏览器无 share——检测 MicroMessenger 时出「右上角 ⋯ 转发」引导＋复制文案兜底。
import qrcode from 'qrcode-generator';

export function isWeChat() { return /MicroMessenger/i.test(navigator.userAgent); }

export function shareUrl(code) {
  return `${location.origin}${location.pathname}${code ? `#r=${code}` : ''}`;
}

// 邀请码形如 H1T2 或 H1T2.1234（后半是本室密码）：拆开呈现，不揉成一长串
export function splitCode(code) {
  const [room = '', key = ''] = String(code || '').split('.');
  const at = /^H(\d+)T(\d+)$/i.exec(room);
  const ord = at ? ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][Number(at[2]) - 1] : '';
  return { room, key, label: ord ? `共修室${ord}` : (room ? `房间 ${room}` : '') };
}

export function shareText(code, zh = (s) => s) {
  const { room, key, label } = splitCode(code);
  // 荐站文案随门面对调（2026-08-14）：荐的是「看得见的佛经宇宙」，选佛谱以附笔随行；
  // 邀请入局仍是《选佛谱》本名——邀的就是一场对局，不必绕着世界说。
  if (!room) return zh('十法界须弥山世界——看见佛经中的宇宙，处处注明经据；附蕅益大师《选佛谱》修行对局：');
  return zh(`邀您同局《选佛谱》${label ? `·${label}` : ''}——房号 ${room}${key ? `，密码 ${key}` : ''}，点开即入：`);
}

// 画二维码到 canvas：白底深模块（扫码需对比度），含静区
export function drawQr(canvas, text, px = 160) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;                       // 静区（模块数）
  const scale = Math.max(2, Math.floor(px / (n + quiet * 2)));
  const size = scale * (n + quiet * 2);
  canvas.width = size; canvas.height = size;
  canvas.style.width = canvas.style.height = `${Math.round(size / 2)}px`; // 2x 物理分辨率防糊
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#1a1628';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) g.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
}

// 一键转发：能 share 则直出系统分享面板（一步到位）；否则回退分享卡（二维码＋复制＋微信引导）
export async function quickShare({ code = '', zh = (s) => s, toast = () => {} } = {}) {
  const url = shareUrl(code);
  const text = shareText(code, zh);
  if (navigator.share && !isWeChat()) {
    try {
      // 兑现之诺加时限（2026-08-14 修）：有些环境（部分安卓 WebView、无头浏览器）
      // 声明了 navigator.share 却既不弹面板也不落定——await 就此悬住，分享卡永不出现，
      // 用户看着像「点了没反应」。故与 1.2 秒赛跑：面板真开了，本页转入后台，
      // 计时器随之冻结（后台节流），赢的一定是面板；反之赛过时限即断定其无面板可开，回退分享卡。
      const panel = navigator.share({ title: zh('十法界须弥山世界'), text, url });
      const raced = await Promise.race([
        panel.then(() => 'done'),
        new Promise((res) => setTimeout(() => res('mute'), 1200)),
      ]);
      if (raced === 'done') return;
      panel.catch(() => {});          // 迟到的拒绝不作未捕获异常
    } catch (e) { if (e && e.name === 'AbortError') return; /* 用户取消则静默 */ }
  }
  openShareCard({ code, zh, toast });
}

let cardEl = null;
export function openShareCard({ code = '', zh = (s) => s, toast = () => {} } = {}) {
  closeShareCard();
  const url = shareUrl(code);
  const text = shareText(code, zh);
  const wx = isWeChat();
  const { room, key, label } = splitCode(code);
  const d = document.createElement('div');
  d.id = 'shareCard';
  d.innerHTML = `
    <div class="scBox">
      <button class="scX" title="关闭">✕</button>
      <div class="scTitle">${code ? (label || zh('邀莲友同局')) : zh('分享此界')}</div>
      ${room ? `<div class="scCode">${room}</div><div class="scSub">${zh('房号 · 口头可报')}</div>` : ''}
      ${key ? `<div class="scKey"><b>${key}</b><span>${zh('本室密码')}</span></div>` : ''}
      <div class="scQrWrap"><canvas></canvas></div>
      <div class="scSub">${code ? zh('莲友扫码即入此房') : zh('扫码即入此界')}</div>
      ${wx ? `<div class="scWx">${zh('微信内：点右上角 ⋯ 「转发给朋友」即可')}</div>` : ''}
      <button class="scMain">${wx ? zh('复制邀请文案') : zh('转发给莲友')}</button>
      <button class="scPoster">${zh('生成分享海报')}</button>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
/* z:110 高过题屏（#boot z:100，2026-08-14 修）：从前作 70，题屏在场时点「分享」，
   卡就开在题屏底下——人只见画面不动，还当是没反应；点「大厅」题屏一退，那张卡才露出来。
   分享是自题屏细字行发起的，卡必须压得住发起它的那一层。 */
#shareCard{position:fixed;inset:0;z-index:110;display:flex;align-items:center;justify-content:center;background:rgba(8,10,15,.72);backdrop-filter:blur(4px)}
#shareCard .scBox{width:min(300px,86vw);background:rgba(18,21,30,.97);border:1px solid rgba(216,197,139,.4);border-radius:16px;padding:20px 18px 16px;color:#e8e2d0;text-align:center;position:relative}
#shareCard .scX{position:absolute;top:10px;right:12px;background:none;border:none;color:#9aa3b5;font-size:var(--fs-lg,16px);cursor:pointer;padding:4px}
#shareCard .scTitle{letter-spacing:3px;color:#d8c58b;font-weight:600}
/* 房号与密码分行：从前拼成「H1T3.1234」一长串，34px 字配 14px 字距在 320 宽的机器上直接溢出卡片 */
#shareCard .scCode{margin-top:8px;color:#e8c766;font-size:clamp(24px,9vw,32px);letter-spacing:.14em;
  overflow-wrap:anywhere;line-height:1.15}
#shareCard .scKey{display:flex;align-items:baseline;justify-content:center;gap:8px;margin-top:9px}
#shareCard .scKey b{color:#e8c766;font-size:22px;letter-spacing:.3em;text-indent:.3em;font-weight:500}
#shareCard .scKey span{color:#9aa3b5;font-size:var(--fs-xs,11px);letter-spacing:1px}
#shareCard .scSub{font-size:var(--fs-xs,11px);color:#9aa3b5;letter-spacing:1px;margin-top:4px}
#shareCard .scQrWrap{display:inline-block;background:#fff;border-radius:12px;padding:8px;line-height:0;margin-top:12px}
#shareCard .scWx{margin-top:10px;font-size:var(--fs-sm,12.5px);color:#96e1d6;letter-spacing:1px}
#shareCard .scMain{display:block;width:100%;margin-top:12px;border-radius:11px;padding:12px 0;font-size:var(--fs-md,14px);letter-spacing:2px;cursor:pointer;border:1px solid rgba(232,199,102,.55);background:rgba(232,199,102,.16);color:#e8c766}
#shareCard .scPoster{display:block;width:100%;margin-top:9px;border-radius:11px;padding:11px 0;font-size:var(--fs-md,14px);letter-spacing:2px;cursor:pointer;border:1px solid rgba(216,197,139,.4);background:rgba(216,197,139,.08);color:#e9dcba}`;
  d.appendChild(css);
  drawQr(d.querySelector('canvas'), url, 320);
  d.addEventListener('click', (e) => { if (e.target === d) closeShareCard(); });
  d.querySelector('.scX').addEventListener('click', closeShareCard);
  d.querySelector('.scPoster').addEventListener('click', () => {
    closeShareCard();
    openPosterCard({ zh, toast, code });  // 带房号＝海报二维码亦入此房（邀请海报）；无房号＝荐站海报
  });
  d.querySelector('.scMain').addEventListener('click', async () => {
    if (!wx && navigator.share) {
      try { await navigator.share({ title: zh('十法界须弥山世界'), text, url }); return; } catch (e) { /* 取消则留卡 */ }
    }
    try { await navigator.clipboard.writeText(`${text}${url}`); toast(zh('已复制')); } // v393 与「邀请好友，同修」一钮同口径：邀的是站外的人
    catch (e) { toast(zh('复制未成，请长按链接手动复制')); }
  });
  document.body.appendChild(d);
  cardEl = d;
}

export function closeShareCard() { if (cardEl) { cardEl.remove(); cardEl = null; } }

// ---------------- 分享海报（2026-08-14 教学场景一） ----------------
// 一张竖幅界画海报：题名＋价值一句＋（站名/房号）＋二维码——讲经配图、课件、朋友圈皆可直用。
// 底图即题屏立轴壁画（已在站内，零外链零新资产）；扫码三态：荐站＝进大门，带站＝#v=直落此站，带房＝#r=即入此房。
// 微信内 canvas 图不可直存文件——长按图片是唯一正路，故预览即大图、话术照实说。
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function drawSpaced(g, text, cx, y, gap) {
  // canvas 无跨端可靠的 letter-spacing：逐字排布自算总宽居中（题名字距是版面语言，不能省）
  const chars = [...String(text)];
  const ws = chars.map((c) => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  const keep = g.textAlign; g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, x, y); x += ws[i] + gap; });
  g.textAlign = keep;
}
function drawQrOn(g, text, x, y, size) {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  g.fillStyle = '#1a1628';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) g.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
  }
}
async function drawPoster({ url, zh, station, room, roomLabel }) {
  const W = 1080, H = 1620;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  try { // 底：题屏立轴壁画（cover 取中上段——殿宇与莲池都在幅内）
    const im = await loadImg('/assets/title-bg-p.webp');
    const s = Math.max(W / im.width, H / im.height);
    const dw = im.width * s, dh = im.height * s;
    g.drawImage(im, (W - dw) / 2, Math.min(0, (H - dh) * 0.25), dw, dh);
  } catch (e) { // 图未到（弱网）：题屏同款净土色晕影自持，海报照出不空底
    const bg = g.createLinearGradient(0, 0, 0, H);
    [[0, '#e2dac2'], [.24, '#b8c9bc'], [.5, '#4d989a'], [.74, '#217985'], [1, '#12626f']]
      .forEach(([p, c]) => bg.addColorStop(p, c));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
  }
  // 青墨纱与题屏同法：上下压、中段透——字立得住，画看得见
  const veil = g.createLinearGradient(0, 0, 0, H);
  [[0, .74], [.15, .4], [.3, .1], [.5, .04], [.62, .22], [.76, .6], [.9, .84], [1, .92]]
    .forEach(([p, a]) => veil.addColorStop(p, `rgba(4,26,30,${a})`));
  g.fillStyle = veil; g.fillRect(0, 0, W, H);
  const KAI = '"Kaiti SC","STKaiti","KaiTi","Songti SC",serif';
  g.textBaseline = 'middle';
  // 题名与价值一句
  g.shadowColor = 'rgba(3,20,24,.9)'; g.shadowBlur = 26; g.shadowOffsetY = 4;
  g.fillStyle = '#fbf0d4'; g.font = `500 92px ${KAI}`;
  drawSpaced(g, zh('十法界须弥山世界'), W / 2, 150, 12);
  g.shadowBlur = 14; g.fillStyle = '#f2e7c9'; g.font = `400 36px ${KAI}`;
  drawSpaced(g, zh('看见佛经中的宇宙 · 依经立象'), W / 2, 240, 6);
  // 站名（单站海报）或房号（邀请海报）
  if (station) {
    g.fillStyle = '#e8c766'; g.font = `500 56px ${KAI}`;
    drawSpaced(g, zh(`此站 · ${station.name}`), W / 2, 336, 8);
    if (station.sub) { g.fillStyle = '#e9dcba'; g.font = `400 32px ${KAI}`; drawSpaced(g, zh(station.sub), W / 2, 396, 4); }
  } else if (room) {
    g.fillStyle = '#e8c766'; g.font = `500 56px ${KAI}`;
    drawSpaced(g, zh(`共修邀请${roomLabel ? ` · ${roomLabel}` : ''}`), W / 2, 336, 8);
    g.fillStyle = '#e9dcba'; g.font = `400 34px ${KAI}`;
    drawSpaced(g, zh(`房号 ${room} · 扫码即入座`), W / 2, 396, 4);
  }
  // 底部：左字右码（白底衬码，静区即衬垫）
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  const qs = 292, qx = W - qs - 78, qy = H - qs - 104;
  g.fillStyle = '#ffffff';
  const rx = qx - 20, ry = qy - 20, rw = qs + 40, rr = 18;
  g.beginPath(); g.roundRect ? g.roundRect(rx, ry, rw, rw, rr) : g.rect(rx, ry, rw, rw); g.fill();
  drawQrOn(g, url, qx, qy, qs);
  g.textAlign = 'left';
  g.fillStyle = '#f2e7c9'; g.font = `500 42px ${KAI}`;
  g.fillText(zh(station ? '扫码 · 直入此站' : (room ? '扫码 · 即入此房' : '扫码 · 即入此界')), 76, qy + 34);
  g.fillStyle = '#cfbf92'; g.font = `400 31px ${KAI}`;
  g.fillText(zh('三界廿八天 · 处处注明经据'), 76, qy + 102);
  g.fillText(zh('附蕅益大师《选佛谱》修行对局'), 76, qy + 156);
  g.fillStyle = '#9aa3b5'; g.font = '400 27px ui-monospace,Menlo,Consolas,monospace';
  g.fillText(location.host + (location.pathname === '/' ? '' : location.pathname), 76, qy + 232);
  return cv;
}

let posterEl = null;
export function closePosterCard() { if (posterEl) { posterEl.remove(); posterEl = null; } }
export async function openPosterCard({ zh = (s) => s, toast = () => {}, station = null, code = '' } = {}) {
  closePosterCard();
  const { room, label } = splitCode(code);
  const url = shareUrl(code) + (station && !code ? `#v=${station.id}` : '');
  let cv;
  try { cv = await drawPoster({ url, zh, station, room, roomLabel: room ? zh(label || '') : '' }); }
  catch (e) { toast(zh('海报生成未成，请稍后再试')); return; }
  const wx = isWeChat();
  const d = document.createElement('div');
  d.id = 'posterCard';
  d.innerHTML = `
    <div class="pcBox">
      <button class="pcX" title="关闭">✕</button>
      <img alt="${zh('分享海报')}">
      <div class="pcHint">${wx ? zh('长按图片即可保存，或转发给朋友') : zh('保存图片，或复制链接转发')}</div>
      <div class="pcRow">${wx ? '' : `<button class="pcSave">${zh('保存海报')}</button>`}<button class="pcLink">${zh('复制链接')}</button></div>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
/* 海报卡踞分享卡之上一层（同随 z:71→111 抬过题屏，缘由见 #shareCard 处） */
#posterCard{position:fixed;inset:0;z-index:111;display:flex;align-items:center;justify-content:center;background:rgba(8,10,15,.78);backdrop-filter:blur(4px)}
#posterCard .pcBox{width:min(340px,88vw);max-height:92vh;overflow:auto;background:rgba(18,21,30,.97);border:1px solid rgba(216,197,139,.4);border-radius:16px;padding:16px 14px 14px;text-align:center;position:relative}
#posterCard .pcX{position:absolute;top:8px;right:10px;z-index:2;width:34px;height:34px;background:rgba(8,10,15,.5);border:none;border-radius:9px;color:#e8e2d0;font-size:var(--fs-lg,16px);cursor:pointer}
#posterCard img{display:block;width:100%;border-radius:10px;-webkit-touch-callout:default;user-select:auto;-webkit-user-select:auto}
#posterCard .pcHint{margin-top:9px;font-size:var(--fs-xs,11px);color:#9aa3b5;letter-spacing:1px}
#posterCard .pcRow{display:flex;gap:8px;margin-top:10px}
#posterCard .pcRow button{flex:1;border-radius:11px;padding:11px 0;font-size:var(--fs-md,14px);letter-spacing:2px;cursor:pointer;border:1px solid rgba(232,199,102,.55);background:rgba(232,199,102,.16);color:#e8c766}
#posterCard .pcRow .pcLink{border-color:rgba(216,197,139,.4);background:rgba(216,197,139,.08);color:#e9dcba}`;
  d.appendChild(css);
  (d.querySelector('img')                  ).src = cv.toDataURL('image/jpeg', 0.9);
  d.addEventListener('click', (e) => { if (e.target === d) closePosterCard(); });
  d.querySelector('.pcX').addEventListener('click', closePosterCard);
  const sv = d.querySelector('.pcSave');
  if (sv) sv.addEventListener('click', () => cv.toBlob(async (blob) => {
    if (!blob) { toast(zh('生成未成，请长按图片保存')); return; }
    const file = new File([blob], 'shifajie-xumishan.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      try { await navigator.share({ files: [file], title: zh('十法界须弥山世界') }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; /* 面板不支持文件则落回下载 */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'shifajie-xumishan.jpg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(zh('海报已存至下载'));
  }, 'image/jpeg', 0.9));
  d.querySelector('.pcLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast(zh('已复制')); }
    catch (e) { toast(zh('复制未成，请手动复制地址')); }
  });
  document.body.appendChild(d);
  posterEl = d;
}
