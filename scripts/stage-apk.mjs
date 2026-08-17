// 安卓包发布归位 · android 产物 → dist/download/（2026-08-17）
//
// 把 gradle 出的签名 APK 拷进 dist/download/sumeru.apk（固定名：二维码与外发链接自此永不变，
// 中文下载名由 worker 的 Content-Disposition 另给），并出一份 release.json 供下载页显示版本与大小。
// APK 与 release.json 皆不入库（.gitignore），故此脚本要在每次发版前先跑。
//
// 落点为何是 dist 而非 public（2026-08-17 改）：public 下之物 vite 每次 build 都复制进 dist，
// 而 `cap sync` 又把整个 dist 搬进 APK 的 assets——APK 遂把上一版 APK 自己裹了进去，
// 包体自 23.85 MiB 翻倍到 46.36 MiB。故 APK 只落 dist（build 之后、deploy 之前注入），
// 不经 public；安卓侧因此永不见 download/，自嵌之患根除。
// 代价：`npm run build` 会清空 dist，故此脚本须在 build 之后跑（deploy 链已按此序）。
//
// 用法：node scripts/stage-apk.mjs        （先 cd android && ./gradlew assembleRelease）
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const outDir = join(root, 'dist/download');
const dest = join(outDir, 'sumeru.apk');

if (!existsSync(src)) {
  console.error('未见 APK：请先在 android/ 下跑 ./gradlew assembleRelease');
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
mkdirSync(outDir, { recursive: true });
copyFileSync(src, dest);

const bytes = statSync(dest).size;
const sha256 = createHash('sha256').update(readFileSync(dest)).digest('hex');
// 25 MiB 是 Cloudflare Workers 静态资源的单文件硬上限，超之 deploy 即失败——过 23 MiB 先出声
const MIB = 1048576;
const LIMIT = 25 * MIB;
writeFileSync(join(outDir, 'release.json'), JSON.stringify({
  version, bytes, sha256,
  sizeText: `${(bytes / MIB).toFixed(1)} MB`,
  builtAt: new Date().toISOString(),
}, null, 1));

console.log(`sumeru.apk：v${version} · ${(bytes / MIB).toFixed(2)} MiB · sha256 ${sha256.slice(0, 16)}…`);
if (bytes > 23 * MIB) {
  console.warn(`⚠️ 已用 ${(bytes / MIB).toFixed(2)} MiB / 上限 25 MiB（Cloudflare 静态资源单文件硬限）——`);
  console.warn('   逼近上限：可减开屏图、材质或字体子集；超限则 deploy 会被拒，须改走 R2 或 GitHub Releases。');
}
