// 生成閘 —— 限流與來源分級（設計書「前車之鑑」問題五之補；wrangler.toml 預留 RL 之兌現）
//
// 【何以至今才接】M3 只開定本與拒答，零生成零成本，無可燒；M5 開了生成三路與問文庫旁路，
// 每問皆是真金白銀（硅基流動 key／佛樂那邊的算力），而 workers.dev 與 foyue.org 路由
// 皆公網可直打、CORS 為 *——不收口即是把付費端點裸奔。
//
// 【信任判據：ask.internal，非任何頭】遊戲 Worker 經 service binding 內轉時，
// 構造的是 `https://ask.internal/v1/ask`——此 URL 只有綁定調用能出現：
// 公網打 workers.dev 或 foyue.org，Cloudflare 按 Host 路由，Host 換成 ask.internal
// 根本到不了本 Worker；跨帳號亦無法對本 Worker 建 service binding。
// 故 hostname 即是不可偽造的來源憑證，不必再與遊戲側約共享密鑰。
//
// 【分級】
//   公網直訪   → 生成四路（corpus／rules／expand／wenku）一律不開，密鑰亦不入 env——
//               行為即 M3：定本／位本／行法表照答（零成本，留作排查備路），生成降級原文直出。
//               前車之鑑第五條（換 UA 重置配額）就此堵死：直訪根本沒有配額可談。
//   遊戲內轉   → 生成四路按 x-ask-client（遊戲側 sha256(IP+UA)，不含原始 IP）行日配額。
//               玩家在真瀏覽器裡換不了 UA，繞配額須先繞出遊戲——而遊戲外即是公網直訪，無生成。
//
// 【額滿不拒答】額滿者與無密鑰同路：降級回 M3 零生成行為（原文直出／拒答定句）。
// 地基不依賴模型可用性，亦不依賴配額餘量。
//
// 【KV 缺綁放行】評測在 Node 裡直調 worker.fetch，無 RL 綁定；本機 wrangler dev 亦然。
// 缺綁時只分級不計數——收口的大頭在「公網直訪無生成」，配額是第二道。

const DAY_TTL = 100000;           // 秒。當日鍵過期即清，不留痕
export const GEN_DAILY_DEFAULT = 60;

/** 來源分級與生成配額。每請求一件，惰性取數——不用生成的路一次 KV 也不碰。 */
export function genGuard(req, env) {
  let host = '';
  try { host = new URL(req.url).hostname; } catch { /* 無效 URL 者按公網待之 */ }
  // 本機信任（2026-08-12 問譜 v3）：wrangler dev 的主機名是 localhost，非 ask.internal，
  // 開發者經 vite 代理試問永遠走降級、看不到生成路。DEV_TRUST=1（只寫在 .dev.vars，
  // 不入 wrangler.toml [vars]）時本機直訪視同內轉——線上部署無此變量，公網分級絲毫不鬆。
  const devTrust = env && env.DEV_TRUST === '1' && (host === 'localhost' || host === '127.0.0.1');
  const trusted = host === 'ask.internal' || devTrust;
  const client = String(req.headers.get('x-ask-client') || '').slice(0, 64) || 'game';
  const cap = Math.max(1, Number(env && env.ASK_GEN_DAILY) || GEN_DAILY_DEFAULT);
  return {
    trusted,
    cap,
    remaining: null,              // take() 之後方有數；未動生成者保持 null，不入回應
    /** 取一次生成額度。true＝放行。公網直訪永 false；KV 缺綁或故障放行（fail-open）。 */
    async take() {
      if (!trusted) return false;
      const kv = env && env.RL;
      if (!kv) return true;
      try {
        const day = new Date().toISOString().slice(0, 10);
        const k = `rl:${client}:${day}`;
        const n = Number(await kv.get(k)) || 0;
        if (n >= cap) { this.remaining = 0; return false; }
        this.remaining = cap - n - 1;
        await kv.put(k, String(n + 1), { expirationTtl: DAY_TTL });
        return true;
      } catch { return true; }    // 限流器故障不可反噬正常問答
    },
  };
}

/** 答案快取鍵：問句＋（expand 之位相）＋數據版次。SHA-256 十六進制。
 *  rules 路不快取——材料含活局面（已擲次數、足跡），同問不同局，快取必答錯局。 */
export async function cacheKeyOf(kind, q, body, builtAt) {
  const mat = kind === 'expand'
    ? [kind, q.trim(), body.pos || body.posName || '', body.combo || '', builtAt]
    : [kind, q.trim(), builtAt];
  const bytes = new TextEncoder().encode(JSON.stringify(mat));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
