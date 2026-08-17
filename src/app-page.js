// 安卓版下载页（app.html）· 二维码与版本信息（2026-08-17）
//
// 全页只此一段脚本：画码、填版本、断网兜底。不引主包与 three——
// 这是「还没装 App 的人」看见的第一屏，须轻、须快。
import qrcode from 'qrcode-generator';

const APK = '/download/sumeru.apk';

// 二维码内容取本页地址而非 APK 直链：扫码人先落到这一页，能看见安装引导与校验码；
// 直接扫成下载会让人对着一个陌生的 apk 发愣，也没处看「未知来源」怎么开。
const target = `${location.origin}${location.pathname.replace(/\/index\.html$/, '/')}`;

const cv = document.getElementById('qr');
const qr = qrcode(0, 'M');
qr.addData(target);
qr.make();
const n = qr.getModuleCount();
const quiet = 2;
const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
const cssSize = 150;
const scale = Math.max(2, Math.floor((cssSize * dpr) / (n + quiet * 2)));
const size = scale * (n + quiet * 2);
cv.width = cv.height = size;
cv.style.width = cv.style.height = `${cssSize}px`;
const g = cv.getContext('2d');
g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
g.fillStyle = '#1a1628';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (qr.isDark(r, c)) g.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
}

// 版本信息由发布脚本随 APK 一并生成（scripts/stage-apk.mjs）
const metaEl = document.getElementById('meta');
const shaEl = document.getElementById('sha');
fetch('/download/release.json', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((info) => {
    const day = String(info.builtAt || '').slice(0, 10);
    metaEl.textContent = `版本 ${info.version} · ${info.sizeText}${day ? ` · ${day}` : ''}`;
    if (info.sha256) shaEl.textContent = `SHA-256 ${info.sha256}`;
  })
  .catch(() => { metaEl.textContent = '安装包尚未发布，请稍后再来'; });
