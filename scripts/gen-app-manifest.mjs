// 热更清单生成 · dist → dist/app-manifest.json（2026-08-17 安卓壳）
//
// 安卓 App（Capacitor + @capgo/capacitor-updater 自托管）启动时拉此单比对版本：
// 逐文件 sha256，download_url 直指站上已部署的同一份静态资源——网站发布即热更就绪，
// 零额外打包、零额外存储。字体/材质等 hash 未变者插件按本地已有复用，不重下。
// 挂在 deploy 链里（vite build 之后、wrangler deploy 之前），与站点同步出门。
//
// 结构（已按 @capgo/capacitor-updater src/definitions.ts 的 ManifestEntry 核实）：
//   { version, builtAt, manifest: [{ file_name, file_hash, download_url }] }
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const SITE = 'https://game.foyue.org';
const SELF = 'app-manifest.json'; // 清单不列自身
// 安卓安装包与其版本信息不入热更清单：它们是给「还没装 App 的人」下载的，
// 若列入，App 每次热更会把自己那 22MB 的 APK 一并拉下来（白耗流量且毫无用处）。
const SKIP_DIRS = ['download/'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const files = walk(dist)
  .map(p => relative(dist, p))
  .filter(f => f !== SELF && !f.startsWith('.') && !SKIP_DIRS.some(d => f.startsWith(d)))
  .sort();

const manifest = files.map(f => ({
  file_name: f,
  file_hash: createHash('sha256').update(readFileSync(join(dist, f))).digest('hex'),
  download_url: `${SITE}/${f.split('/').map(encodeURIComponent).join('/')}`,
}));

// 站上最新安装包的版本（2026-08-17 增）：热更只换 web 层，图标、开机屏、原生插件、
// 权限这些换不动——那些只能重装 APK。故清单须另报一个 nativeVersion，
// App 以本机内置版（CapacitorUpdater.getBuiltinVersion）与之比对，据以出「有新版可装」。
// 取自 stage-apk 落的 release.json（deploy 链中它先于本脚本跑）；未出包则不报此字段。
let nativeVersion = null;
try {
  nativeVersion = JSON.parse(readFileSync(join(dist, 'download/release.json'), 'utf8')).version || null;
} catch (e) { /* 尚未 stage APK：不报，App 侧便不提示装机 */ }

const totalBytes = files.reduce((sum, f) => sum + statSync(join(dist, f)).size, 0);
writeFileSync(join(dist, SELF), JSON.stringify({
  version, nativeVersion, builtAt: new Date().toISOString(), manifest,
}, null, 1));
console.log(`app-manifest.json：v${version} · 安装包 v${nativeVersion || '（未出包）'}`
  + ` · ${manifest.length} 文件 · 共 ${(totalBytes / 1048576).toFixed(1)}MB`);
