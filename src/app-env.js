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
// globalThis.location?.：测试脚本在 Node 里直 import 本层（test-plaza-client 等），无 location 不可掷错
export const PUBLIC_ORIGIN = IS_APP ? SITE_ORIGIN : (globalThis.location?.origin || SITE_ORIGIN);
