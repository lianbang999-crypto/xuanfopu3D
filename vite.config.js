// 构建配置：静态资源相对路径，方便任意路径部署（Cloudflare Workers Assets / GitHub Pages 均可）
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5930,
    // 本地联机调试：vite 开发页的 /api 转给 wrangler dev（npm run server，端口 8787）
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
