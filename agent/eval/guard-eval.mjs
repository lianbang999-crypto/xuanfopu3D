#!/usr/bin/env node
// 生成閘評測（P1：限流・來源分級・答案快取）—— 無密鑰、無網絡、無 KV 綁定亦全跑
//
// 【何以立此一評】2026-08-04 審出：M5 生成三路與問文庫已上線，而 wrangler.toml 預留的
// RL 限流仍註釋著——付費端點在 workers.dev 與 foyue.org 路由上裸奔。guard.js 兌現後，
// 此處把三件事釘死：
//   甲 · 公網直訪零生成 —— 縱 env 帶密鑰，非 ask.internal 來源不得動模型、不得轉文庫
//   乙 · 配額之數 —— 額內遞減、額滿即拒、KV 缺綁放行（評測與 wrangler dev 之路）
//   丙 · 快取回放 —— 命中者 meta/done 標 cacheStatus:hit、文本逐字回放、不扣額

import { genGuard, cacheKeyOf } from '../worker/src/guard.js';
import { META } from '../worker/src/canon.js';

const worker = (await import('../worker/src/index.js')).default;

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '　' + extra : ''}`); }
};

/** 模擬 KV：get/put 足矣 */
const mockKV = () => {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v == null ? null : (type === 'json' ? JSON.parse(v) : v); },
    async put(k, v) { m.set(k, String(v)); },
  };
};

const ask = async (url, body, env) => {
  const res = await worker.fetch(new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env);
  const msgs = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return {
    meta: msgs.find((m) => m.type === 'meta') || {},
    done: msgs.find((m) => m.type === 'done') || {},
    text: msgs.filter((m) => m.type === 'delta').map((m) => m.text).join(''),
  };
};

// ── 甲 · 公網直訪零生成 ──────────────────────────────────────
console.log('甲 · 公網直訪零生成（env 帶假密鑰，模型若被調必炸網絡——不許走到那一步）');
{
  // 假密鑰＋公網 host：意圖層與生成層皆須被剝鑰降級，全程不出網。
  // fetch 一旦被調即計失敗（本評無網絡之約）。
  const origFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = async (...a) => { outboundCalls++; throw new Error('外呼被禁：' + a[0]); };
  try {
    const r = await ask('https://xuanfopu-agent-v2.example.workers.dev/v1/ask',
      { question: '什么是见惑' }, { SILICONFLOW_API_KEY: 'sk-fake', RL: mockKV() });
    ok(r.meta.basis && r.meta.basis.label === '谱内原文', '名相之問降級原文直出', JSON.stringify(r.meta.basis));
    ok(outboundCalls === 0, '全程零外呼（意圖層未動模型）', `外呼 ${outboundCalls} 次`);

    const r2 = await ask('https://foyue.org/xuanfopu/ask/api',
      { question: '念佛如何得力' }, { SILICONFLOW_API_KEY: 'sk-fake' });
    ok(r2.done.evidenceStatus === 'refused' || (r2.meta.basis && r2.meta.basis.mode !== 'wenku'),
      '淨土修學之問不轉文庫（公網無旁路）', JSON.stringify(r2.meta.basis));
    ok(outboundCalls === 0, '文庫零外呼', `外呼 ${outboundCalls} 次`);

    // 定本三路照答——直訪備路之所以留得住
    const r3 = await ask('https://xuanfopu-agent-v2.example.workers.dev/v1/ask',
      { question: 'AI解读', pos: '圓五品位', combo: '阿彌', ask: 'reading' }, {});
    ok(r3.meta.basis && r3.meta.basis.mode === 'canon', '定本路照答（零成本零鑰）', JSON.stringify(r3.meta.basis));
  } finally { globalThis.fetch = origFetch; }
}

// ── 乙 · 配額之數 ──────────────────────────────────────────
console.log('乙 · 配額之數');
{
  const kv = mockKV();
  const req = (h = {}) => new Request('https://ask.internal/v1/ask', { method: 'POST', headers: h });
  const g = genGuard(req({ 'x-ask-client': 'abc' }), { RL: kv, ASK_GEN_DAILY: '2' });
  ok(g.trusted === true, 'ask.internal 判信任');
  ok((await g.take()) === true && g.remaining === 1, '第一取放行，餘 1', `餘 ${g.remaining}`);
  ok((await g.take()) === true && g.remaining === 0, '第二取放行，餘 0', `餘 ${g.remaining}`);
  ok((await g.take()) === false && g.remaining === 0, '第三取拒（額滿）');

  const g2 = genGuard(req(), { ASK_GEN_DAILY: '2' });          // 無 KV 綁定
  ok((await g2.take()) === true, 'KV 缺綁放行（評測與 dev 之路）');

  const g3 = genGuard(new Request('https://foyue.org/xuanfopu/ask/api', { method: 'POST' }), { RL: kv });
  ok(g3.trusted === false && (await g3.take()) === false, '公網 host 永不放行生成');
}

// ── 丙 · 快取回放 ──────────────────────────────────────────
console.log('丙 · 快取回放');
{
  const kv = mockKV();
  const q = '什么是见惑';
  const ckey = await cacheKeyOf('corpus', q, {}, META.builtAt);
  const model = 'deepseek-ai/DeepSeek-V4-Pro';
  await kv.put(`ans:${model}:${ckey}`, JSON.stringify({
    text: '見惑者，見解上之迷惑也[1]。', kind: 'corpus', label: '谱内义理',
    passages: [{ title: '見惑', ref: '《選佛譜》卷一', text: '…' }],
    verify: { ok: true, checks: {}, issues: [] }, evidenceStatus: 'grounded',
  }));
  // 有快取即回放——縱無密鑰（keyless 之日快取仍活）
  const r = await ask('https://ask.internal/v1/ask', { question: q },
    { RL: kv, COMPOSE_MODEL: model, ASK_GEN_DAILY: '5' });
  ok(r.meta.cacheStatus === 'hit' && r.done.cacheStatus === 'hit', '命中標 cacheStatus:hit',
    JSON.stringify({ meta: r.meta.cacheStatus, done: r.done.cacheStatus }));
  ok(r.text.includes('見惑者，見解上之迷惑也'), '文本逐字回放');
  ok(![...kv.m.keys()].some((k) => k.startsWith('rl:')), '命中不扣額（rl: 鍵未生）');

  // 公網直訪連快取也不給（免探庫）
  const r2 = await ask('https://foyue.org/xuanfopu/ask/api', { question: q }, { RL: kv, COMPOSE_MODEL: model });
  ok(r2.meta.cacheStatus !== 'hit', '公網不回放快取', JSON.stringify(r2.meta.basis));
}

console.log(`\n${fail ? '✗' : '✓'} 生成閘 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
