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

const INSTALL_KEY = 'sm10.app.install'; // 本机安装串：随机生成，不含账号、IP、设备标识

// 装机报到之身（2026-08-17）：与广场匿名莲号同法（随机 12 字节，i_ 前缀），
// 只为数「装在多少台上」，认不出是谁。卸载重装即另起一串——故所数是安装实例，
// 非物理设备；此数天然偏保守，不虚高。真设备级去重须取系统标识，与本站口径相违，不取。
function installId() {
  try {
    const old = localStorage.getItem(INSTALL_KEY) || '';
    if (/^i_[a-f0-9]{24}$/.test(old)) return old;
    const b = new Uint8Array(12);
    (globalThis.crypto?.getRandomValues)
      ? globalThis.crypto.getRandomValues(b)
      : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
    const id = `i_${[...b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    localStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch (e) { return ''; }
}

// ── 更新检查（2026-08-17 重构为可重入）：冷启一次、回前台节流一次、「我的」页手动随时 ──
// 从前只在冷启查一次，而安卓 App 常驻后台可达数日不冷启——网站日日更新，App 却一直旧着。
// 今三路同归此函数：结果三态 'latest' | 'ready' | 'apk'（另 'offline' 弱网），
// 皆静默备妥（next() 下次启动生效，绝不打断当局）；提示与否由调用处定（自动路不吱声，
// 手动路 toast 一句）。防并发：查询进行中再触发即复用同一承诺。
let checking = null;
export function checkForUpdate() {
  return checking ||= (async () => {
    try {
      // 走 /api/app-manifest（worker 内转生成件附 CORS）：直取 /app-manifest.json 不进 worker，无跨域头
      const res = await fetch(`${API_BASE}/api/app-manifest`, { cache: 'no-store' });
      if (!res.ok) return 'offline';
      const remote = await res.json();
      const cur = await currentVersion();
      if (!remote?.version || !Array.isArray(remote.manifest)) return 'offline';

      // 一、原生层：站上安装包比本机新即记下，「我的」页据此现「有新版可装」。
      //     此路与热更无涉——图标、开机屏、原生插件热更换不动，唯重装可得。
      updateState.builtin = await builtinVersion();
      updateState.apkNew = newerThan(remote.nativeVersion, updateState.builtin) ? remote.nativeVersion : '';

      // 二、web 层：热更能办的
      if (remote.version === cur) {
        updateState.pending = '';
        try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
        return updateState.apkNew ? 'apk' : 'latest';
      }
      if (localStorage.getItem(PENDING_KEY) !== remote.version) { // 未备则下载备妥
        const bundle = await CapacitorUpdater.download({
          version: remote.version,
          url: `${API_BASE}/app-manifest.json`, // manifest 模式逐文件走 download_url；url 为必填形参
          manifest: remote.manifest,
        });
        await CapacitorUpdater.next({ id: bundle.id });
        try { localStorage.setItem(PENDING_KEY, remote.version); } catch (e) {}
      }
      updateState.pending = remote.version;
      return 'ready';
    } catch (e) { return 'offline'; /* 弱网或离线：下回再探，不扰局不提示 */ }
    finally { checking = null; }
  })();
}

const RECHECK_GAP_MS = 10 * 60 * 1000; // 回前台节流：十分钟内不重查（发版以日计，再密是白问）
let lastCheckAt = 0;

export async function bootAppShell() {
  try { await CapacitorUpdater.notifyAppReady(); } catch (e) {}
  lastCheckAt = Date.now();
  checkForUpdate();

  // 装机报到：与首查同一趟启动里捎带，不另起一次唤醒。失手即罢，不重试不扰用户。
  const install = installId();
  if (install) {
    currentVersion().then((cur) => fetch(`${API_BASE}/api/app/hello`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ install, plat: 'android', ver: cur, nat: updateState.builtin }),
    })).catch(() => {});
  }

  // 回前台即查（发起人点单「网站一更新 App 就能收到并下载」）：安卓 App 常驻后台，
  // 冷启动可数日不遇一回；WebView 的 visibilitychange 在壳内可靠，不需再引原生插件。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheckAt < RECHECK_GAP_MS) return;
    lastCheckAt = Date.now();
    checkForUpdate();
  });
}

// 「我的」页自救钮：退回 APK 内置版（热更包出问题时的用户侧后门）
export async function resetToBuiltin() {
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  try { await CapacitorUpdater.reset(); return true; } catch (e) { return false; }
}
