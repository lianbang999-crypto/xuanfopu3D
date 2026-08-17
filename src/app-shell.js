// 安卓壳启动务 · 热更检查与回滚安全网（2026-08-17）
//
// 仅 IS_APP 时由 game.js 动态 import——独立 chunk，网页用户永不下载此件与插件。
// 热更之路（@capgo/capacitor-updater 自托管，autoUpdate:false 全权在此）：
//   启动报到 → 静默拉站上 app-manifest.json → 版本异则增量下载（逐文件 sha256 比对，
//   字体/材质等本地已有者不重下）→ next() 待下次启动生效——绝不打断当局。
// 推坏了的救生索：notifyAppReady 不报，插件 appReadyTimeout(10s) 后自动回滚上一可用包。
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { API_BASE } from './app-env.js';

const PENDING_KEY = 'sm10.app.pending'; // 已备妥待启的版本，防同版重复下载

export async function currentVersion() {
  try {
    const { bundle } = await CapacitorUpdater.current();
    if (bundle?.version && bundle.id !== 'builtin') return bundle.version; // 热更包在跑
  } catch (e) {}
  return __APP_VERSION__; // 内置包在跑（vite define 烧入，与 package.json 同源）
}

export async function bootAppShell() {
  try { await CapacitorUpdater.notifyAppReady(); } catch (e) {}
  try {
    // 走 /api/app-manifest（worker 内转生成件附 CORS）：直取 /app-manifest.json 不进 worker，无跨域头
    const res = await fetch(`${API_BASE}/api/app-manifest`, { cache: 'no-store' });
    if (!res.ok) return;
    const remote = await res.json();
    const cur = await currentVersion();
    if (!remote?.version || !Array.isArray(remote.manifest)) return;
    if (remote.version === cur) { try { localStorage.removeItem(PENDING_KEY); } catch (e) {} return; }
    if (localStorage.getItem(PENDING_KEY) === remote.version) return; // 已备待启
    const bundle = await CapacitorUpdater.download({
      version: remote.version,
      url: `${API_BASE}/app-manifest.json`, // manifest 模式逐文件走 download_url；url 为必填形参
      manifest: remote.manifest,
    });
    await CapacitorUpdater.next({ id: bundle.id });
    try { localStorage.setItem(PENDING_KEY, remote.version); } catch (e) {}
  } catch (e) { /* 弱网或离线：下次启动再探，不扰局不提示 */ }
}

// 「我的」页自救钮：退回 APK 内置版（热更包出问题时的用户侧后门）
export async function resetToBuiltin() {
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  try { await CapacitorUpdater.reset(); return true; } catch (e) { return false; }
}
