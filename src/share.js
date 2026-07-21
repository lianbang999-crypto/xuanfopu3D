// 分享卡 · 一个组件两用：带房号＝邀请莲友入局，无房号＝荐游戏
// 二维码内嵌生成（qrcode-generator，MIT，Vite 打包内联无外链）；
// 转发优先 navigator.share（系统分享面板，微信外的社交软件可直转）；
// 微信内置浏览器无 share——检测 MicroMessenger 时出「右上角 ⋯ 转发」引导＋复制文案兜底。
import qrcode from 'qrcode-generator';

export function isWeChat() { return /MicroMessenger/i.test(navigator.userAgent); }

export function shareUrl(code) {
  return `${location.origin}${location.pathname}${code ? `#r=${code}` : ''}`;
}

export function shareText(code, zh = (s) => s) {
  return code
    ? zh(`邀您同局《选佛谱》——房号 ${code}，点开即入：`)
    : zh('《选佛谱》——掷「南无阿弥陀佛」二轮，行十法界，直至选佛及第：');
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
    try { await navigator.share({ title: zh('选佛谱'), text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* 用户取消则静默 */ }
  }
  openShareCard({ code, zh, toast });
}

let cardEl = null;
export function openShareCard({ code = '', zh = (s) => s, toast = () => {} } = {}) {
  closeShareCard();
  const url = shareUrl(code);
  const text = shareText(code, zh);
  const wx = isWeChat();
  const d = document.createElement('div');
  d.id = 'shareCard';
  d.innerHTML = `
    <div class="scBox">
      <button class="scX" title="关闭">✕</button>
      <div class="scTitle">${code ? zh('邀莲友同局') : zh('分享此谱')}</div>
      ${code ? `<div class="scCode">${code}</div><div class="scSub">${zh('房号 · 口头可报')}</div>` : ''}
      <div class="scQrWrap"><canvas></canvas></div>
      <div class="scSub">${code ? zh('莲友扫码即入此房') : zh('扫码即开此谱')}</div>
      ${wx ? `<div class="scWx">${zh('微信内：点右上角 ⋯ 「转发给朋友」即可')}</div>` : ''}
      <button class="scMain">${wx ? zh('复制邀请文案') : zh('转发给莲友')}</button>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
#shareCard{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(8,10,15,.72);backdrop-filter:blur(4px)}
#shareCard .scBox{width:min(300px,86vw);background:rgba(18,21,30,.97);border:1px solid rgba(216,197,139,.4);border-radius:16px;padding:20px 18px 16px;color:#e8e2d0;text-align:center;position:relative}
#shareCard .scX{position:absolute;top:10px;right:12px;background:none;border:none;color:#9aa3b5;font-size:var(--fs-lg,16px);cursor:pointer;padding:4px}
#shareCard .scTitle{letter-spacing:3px;color:#d8c58b;font-weight:600}
#shareCard .scCode{font-size:34px;letter-spacing:14px;text-indent:14px;color:#e8c766;margin-top:8px}
#shareCard .scSub{font-size:var(--fs-xs,11px);color:#9aa3b5;letter-spacing:1px;margin-top:4px}
#shareCard .scQrWrap{display:inline-block;background:#fff;border-radius:12px;padding:8px;line-height:0;margin-top:12px}
#shareCard .scWx{margin-top:10px;font-size:var(--fs-sm,12.5px);color:#96e1d6;letter-spacing:1px}
#shareCard .scMain{display:block;width:100%;margin-top:12px;border-radius:11px;padding:12px 0;font-size:var(--fs-md,14px);letter-spacing:2px;cursor:pointer;border:1px solid rgba(232,199,102,.55);background:rgba(232,199,102,.16);color:#e8c766}`;
  d.appendChild(css);
  drawQr(d.querySelector('canvas'), url, 320);
  d.addEventListener('click', (e) => { if (e.target === d) closeShareCard(); });
  d.querySelector('.scX').addEventListener('click', closeShareCard);
  d.querySelector('.scMain').addEventListener('click', async () => {
    if (!wx && navigator.share) {
      try { await navigator.share({ title: zh('选佛谱'), text, url }); return; } catch (e) { /* 取消则留卡 */ }
    }
    try { await navigator.clipboard.writeText(`${text}${url}`); toast(zh(code ? '邀请文案已复制——发给莲友，点开即入' : '已复制——发给莲友即可')); }
    catch (e) { toast(zh('复制未成，请长按链接手动复制')); }
  });
  document.body.appendChild(d);
  cardEl = d;
}

export function closeShareCard() { if (cardEl) { cardEl.remove(); cardEl = null; } }
