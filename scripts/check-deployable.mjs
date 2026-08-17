#!/usr/bin/env node
// 出门前一照镜子 · dist 齐备否（2026-08-17 立）
//
// 立此闸的由来：08-17 一次手动 `npx wrangler deploy` 绕过了 npm run deploy 的整条链，
// 而此前为跑测试反复 `npm run build`（build 清空 dist），清单遂未再生成——
// 部署上去的 dist 无 app-manifest.json，**线上所有已装 App 的热更新静默全废**：
// App 启动拉清单得 404，既不更新也不报错，用户与发布者皆无从察觉。
// 站是好的、首页正常，唯独那一条路断了——最难发现的正是这种。
//
// 故凡部署前必过此闸：缺件即以非零退出挡下，不让残缺的 dist 出门。
// 挂在 deploy 链末、wrangler deploy 之前。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const bad = [];
const need = [
  ['index.html', '题屏与主图'],
  ['read.html', '六卷阅读页'],
  ['app.html', '安卓下载页'],
  ['app-manifest.json', '热更清单——缺此则已装 App 的热更新全废'],
  ['manifest.webmanifest', 'PWA 清单'],
  ['sw.js', 'Service Worker'],
  ['icons/icon-512.png', 'PWA 图标'],
];
for (const [f, why] of need) {
  if (!existsSync(join(dist, f))) bad.push(`缺 dist/${f}　（${why}）`);
}

// 清单不只要在，还须与本次构建同版、且真指得到东西
if (existsSync(join(dist, 'app-manifest.json'))) {
  try {
    const m = JSON.parse(readFileSync(join(dist, 'app-manifest.json'), 'utf8'));
    if (m.version !== pkgVersion) {
      bad.push(`热更清单版本 ${m.version} ≠ package.json ${pkgVersion}　（清单是上一次构建留下的，须重跑 gen-app-manifest）`);
    }
    if (!Array.isArray(m.manifest) || m.manifest.length < 50) {
      bad.push(`热更清单只列 ${m.manifest?.length ?? 0} 项，显然不全`);
    }
    // 抽验三条：清单所列之件须真在 dist 里（download_url 指向站上同一份）
    for (const e of [m.manifest[0], m.manifest[Math.floor(m.manifest.length / 2)], m.manifest.at(-1)]) {
      if (e && !existsSync(join(dist, e.file_name))) bad.push(`清单列了 ${e.file_name}，dist 里却没有`);
    }
  } catch (e) {
    bad.push(`热更清单读不动：${e.message}`);
  }
}

// APK 若在，须与本版同号——版本对不上会让「有新安装包」提示指向旧包
const rel = join(dist, 'download/release.json');
if (existsSync(rel)) {
  try {
    const r = JSON.parse(readFileSync(rel, 'utf8'));
    if (r.version !== pkgVersion) bad.push(`安装包 v${r.version} ≠ package.json v${pkgVersion}　（须重出 APK 并 stage-apk）`);
    const apk = join(dist, 'download/sumeru.apk');
    if (!existsSync(apk)) bad.push('有 release.json 却无 sumeru.apk');
    else if (statSync(apk).size > 25 * 1048576) bad.push('APK 超 25 MiB，Cloudflare 静态资源单文件硬限，deploy 必被拒');
  } catch (e) { bad.push(`release.json 读不动：${e.message}`); }
}

if (bad.length) {
  console.error('✘ dist 未齐备，不可部署：');
  for (const b of bad) console.error(`   · ${b}`);
  console.error('\n  正道是跑 `npm run deploy`（build → stage-apk → 清单 → 本闸 → wrangler deploy），');
  console.error('  勿单跑 wrangler deploy——那会绕过前面几步，把残缺的 dist 送上线。');
  process.exit(1);
}
console.log(`✓ dist 齐备可出门（v${pkgVersion}）`);
