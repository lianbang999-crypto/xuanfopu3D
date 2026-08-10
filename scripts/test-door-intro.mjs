// 门总说浮层（极简 · 原文折叠）验收。
// 旧制把「释义」与「谱曰原文」两段平铺，门14 的原文有 966 字，一点开即一大坨；
// 且释义取的是简体旧本 SFP_DOOR_PLAIN，而此处对它调 glossify——浮标键全是繁体，
// 简体正文一个也匹配不上，门义这一层的名相浮标从来没生效过。本脚本盯住这两条。
// 先启动 `npm run dev`，再运行：npm run test:door-intro
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let passed = 0, failed = 0;
const ok = (c, n, x = '') => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${x ? ` — ${x}` : ''}`); } };

const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
// 生产包与开发态都可能在慢机上超过默认 30 秒才触发 DOMContentLoaded；
// 这里只需要应用钩子就绪，不应把模块求值耗时误报成门义错误。
await page.goto(UI_BASE, { waitUntil: 'commit' });
await page.waitForFunction(() => typeof window.__doorIntro === 'function', undefined,
  { timeout: 120000, polling: 500 });

console.log('\n【一 十五门皆能呈，且皆有白话正文】');
const all = [];
for (let n = 1; n <= 15; n++) {
  const r = await page.evaluate((dn) => {
    window.__doorIntro(dn);
    const el = document.querySelector('#doorIntro');
    const dit = el && el.querySelector('.dit');
    return {
      on: !!(el && el.classList.contains('show')),
      lead: dit && dit.querySelector('.diV') ? dit.querySelector('.diV').innerText.trim().length : 0,
      rows: dit ? dit.querySelectorAll('.nRow').length : 0,
      gloss: dit ? dit.querySelectorAll('.gls').length : 0,       // 名相浮标锚点
      more: dit ? dit.querySelectorAll('details.diMore').length : 0,
      selfNote: dit ? dit.querySelectorAll('.diSelf').length : 0,
      canonLen: dit && dit.querySelector('.diC') ? dit.querySelector('.diC').innerText.trim().length : 0,
      openByDefault: dit && dit.querySelector('details.diMore') ? dit.querySelector('details.diMore').open : null,
    };
  }, n);
  all.push({ n, ...r });
}
ok(all.every((r) => r.on), '十五门总说皆能呈现');
ok(all.every((r) => r.lead > 0), '十五门皆有白话领起句', all.filter((r) => !r.lead).map((r) => '门' + r.n).join('、'));

console.log('\n【二 名相浮标——重译的头一条缘由】');
ok(all.every((r) => r.gloss > 0), '十五门门义皆有浮标命中（简体旧本此处恒为 0）',
  all.filter((r) => !r.gloss).map((r) => '门' + r.n).join('、'));
console.log(`    浮标数：${all.map((r) => `门${r.n}:${r.gloss}`).join(' ')}`);

console.log('\n【三 原文折叠——极简的要害】');
const SELF = [1, 2, 15];
const hasCanon = all.filter((r) => !SELF.includes(r.n));
ok(hasCanon.every((r) => r.more === 1), '谱文十二门皆把原文收进折叠');
ok(hasCanon.every((r) => r.openByDefault === false), '折叠默认闭合——不再一开就是一大坨文言');
ok(hasCanon.every((r) => r.canonLen === 0), '闭合时原文不占版面（innerText 为空）');
const d14 = all.find((r) => r.n === 14);
ok(d14 && d14.more === 1, '门14（原文 966 字，最长者）确已折叠');

console.log('\n【四 自撰导语不冒谱曰】');
const selfRows = all.filter((r) => SELF.includes(r.n));
ok(selfRows.every((r) => r.selfNote === 1), '门1/2/15 缀「原谱无此门总说」说明');
ok(selfRows.every((r) => r.more === 0), '门1/2/15 不设「谱曰原文」折叠（无谱文可对）');

console.log('\n【五 无脚本报错】');
ok(errors.length === 0, '全程无脚本报错', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
