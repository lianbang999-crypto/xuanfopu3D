// 构建配置：静态资源相对路径，方便任意路径部署（Cloudflare Workers Assets / GitHub Pages 均可）
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// 版本源唯一在 package.json（2026-08-17 安卓壳）：烧进构建供 App 与远端热更清单比对；
// v40x 编号此前只活在 commit message 里，自此机器可读（0.403.0 ↔ v403）。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5930,
    // 本地联机调试：vite 开发页的 /api 转给 wrangler dev（npm run server，端口 8787）
    proxy: {
      // 智能体单独一档（本机 8788，见 agent/worker）——须列在 '/api' 之前，前缀更长者优先
      '/api/ask': { target: 'http://localhost:8788', rewrite: (p) => p.replace(/^\/api\/ask/, '/v1/ask') },
      '/api': { target: 'http://localhost:8787', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // 双页入口：主图（游戏）＋ 六卷原文独立阅读页（2026-08-12，wenchao 纸墨形制）
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        read: fileURLToPath(new URL('./read.html', import.meta.url)),
        // 安卓版下载页（2026-08-17）：二维码＋安装引导，不引主包，独立轻量入口
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
      },
    },
  },
});
