// 站点服务工 · 回访提速与断网兜底（2026-08-17 随安卓壳一并立）
//
// 保守三律：
//   一、活水不截——/api/* 与 /app-manifest.json 一律直过，不缓存（联机、问谱、热更探针恒新）。
//   二、名即版本——vite 产物带指纹（main-CQVQ-oEv.js），得一份即永新，cache-first 不复请求；
//       未带指纹者（字体/壁画/css 等 public 直拷件）即刻用旧、后台悄换（stale-while-revalidate）。
//   三、页面先网后库——navigate 恒先取网上最新，断网才回落缓存（两天一版的站，页面不可陈旧）。
// 安卓壳内不注册本工（见 index.html：资源已在本地，且与热更切包相冲）。
const VER = 'sm10-sw-v1';
const PAGES = `${VER}-pages`;
const STATIC = `${VER}-static`;

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VER)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/; // vite 指纹件：名变即新件

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/app-manifest.json') return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(PAGES)).put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        return hit || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) {
      if (!HASHED.test(url.pathname)) {
        // 后台悄换，成败皆不扰当次响应
        fetch(req).then(async (r) => { if (r.ok) (await caches.open(STATIC)).put(req, r); }).catch(() => {});
      }
      return hit;
    }
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') (await caches.open(STATIC)).put(req, res.clone());
    return res;
  })());
});
