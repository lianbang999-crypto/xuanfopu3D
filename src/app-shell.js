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

// 更新之况：供「我的」页取用，不主动弹卡（静默设计：无红点、无未读数、不催人）。
//   pending＝web 层新包已下好，下次启动即用（热更能办的）
//   apkNew ＝站上安装包比本机新，须重装（热更办不到的：图标、开机屏、原生插件与权限）
export const updateState = { pending: '', apkNew: '', builtin: '' };

// 版本比较（0.406.0 式三段数字，段数不齐者短的补零）：不引 semver，此处够用
function newerThan(a, b) {
  if (!a || !b) return false;
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0; const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// 本机 APK 自带的版本。不可用 __APP_VERSION__ 代替——那是 vite 烧进 JS 的，
// 热更换掉 JS 后它就变成新 web 包的版本了，不再代表原生层。
async function builtinVersion() {
  try {
    const r = await CapacitorUpdater.getBuiltinVersion();
    return r?.version || r?.builtinVersion || '';
  } catch (e) { return ''; }
}

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

    // 一、原生层：站上安装包比本机新即记下，「我的」页据此现「有新版可装」。
    //     此路与热更无涉——图标、开机屏、原生插件热更换不动，唯重装可得。
    updateState.builtin = await builtinVersion();
    updateState.apkNew = newerThan(remote.nativeVersion, updateState.builtin) ? remote.nativeVersion : '';

    // 二、web 层：热更能办的
    if (remote.version === cur) {
      updateState.pending = '';
      try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
      return;
    }
    if (localStorage.getItem(PENDING_KEY) === remote.version) { // 已备待启
      updateState.pending = remote.version;
      return;
    }
    const bundle = await CapacitorUpdater.download({
      version: remote.version,
      url: `${API_BASE}/app-manifest.json`, // manifest 模式逐文件走 download_url；url 为必填形参
      manifest: remote.manifest,
    });
    await CapacitorUpdater.next({ id: bundle.id });
    updateState.pending = remote.version;
    try { localStorage.setItem(PENDING_KEY, remote.version); } catch (e) {}
  } catch (e) { /* 弱网或离线：下次启动再探，不扰局不提示 */ }
}

// 「我的」页自救钮：退回 APK 内置版（热更包出问题时的用户侧后门）
export async function resetToBuiltin() {
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  try { await CapacitorUpdater.reset(); return true; } catch (e) { return false; }
}
