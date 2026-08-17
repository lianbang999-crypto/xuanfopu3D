// 应用环境层 · 网页与安卓壳（Capacitor）同一份构建，运行时分辨（2026-08-17）
//
// 为何不用构建期环境变量分双包：热更新的 download_url 指向网站已部署的静态资源，
// App 热更后拉到的就是网站那份构建——两份构建若不同，热更即毒化（API_BASE 烧空、
// fetch 全退回 https://localhost 而断网）。一份构建同时服务网站、APK 内置包与热更新，
// 三者代码恒同，此患根除。
//
// 判据：Capacitor 原生壳会向 WebView 自动注入 window.Capacitor（native-bridge，
// 不依赖我们的包引入），网页环境恒无此物。网页下 API_BASE 为空串，
// `${API_BASE}/api/...` 即原相对路径，行为逐字节不变。
export const IS_APP = !!(globalThis.Capacitor?.isNativePlatform?.());

// 站点正源：App 壳内 location.origin 是 https://localhost（本地资源服务器），
// 发 API、拼分享链接、落海报款识都不可用它，一律以此为准。
export const SITE_ORIGIN = 'https://game.foyue.org';

export const API_BASE = IS_APP ? SITE_ORIGIN : '';

// ── 装机之判（2026-08-17）：只分安卓与 iPhone 两路，余者一概不劝装 ──
// 已在壳内、已添加到主屏幕者不劝（再劝是噪音）；桌面不劝（下载页自有二维码）。
const UA = () => (globalThis.navigator?.userAgent || '');
// 已添到主屏幕：iOS 用 navigator.standalone，安卓 PWA 用 display-mode 媒体查询
export const IS_STANDALONE = !IS_APP && !!(
  globalThis.navigator?.standalone
  || globalThis.matchMedia?.('(display-mode: standalone)')?.matches
);
export const IS_ANDROID = /Android/i.test(UA());
// iPadOS 13+ 报的是 Macintosh，须以触点数补判
export const IS_IOS = /iPhone|iPad|iPod/i.test(UA())
  || (/Macintosh/.test(UA()) && (globalThis.navigator?.maxTouchPoints || 0) > 1);
export const IS_WECHAT = /MicroMessenger/i.test(UA());
// 站外浏览器（非 Safari）在 iOS 16.4 前不能添加到主屏幕；微信内置浏览器至今不能
export const IS_IOS_SAFARI = IS_IOS && !IS_WECHAT && !/CriOS|FxiOS|EdgiOS/i.test(UA());

// 装机去处：'apk'＝安卓下载页，'ios'＝添加到主屏幕引导，''＝不劝装
export const INSTALL_KIND = (IS_APP || IS_STANDALONE) ? ''
  : IS_ANDROID ? 'apk'
  : IS_IOS ? 'ios' : '';
// globalThis.location?.：测试脚本在 Node 里直 import 本层（test-plaza-client 等），无 location 不可掷错
export const PUBLIC_ORIGIN = IS_APP ? SITE_ORIGIN : (globalThis.location?.origin || SITE_ORIGIN);
