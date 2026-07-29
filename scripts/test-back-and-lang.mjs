// 返回键逐层退出 + 简繁属性同转 回归。
// 先启动 `npm run server` 与 `npm run dev`，再运行：
// node scripts/test-back-and-lang.mjs
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0;
let failed = 0;
function ok(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1200, height: 820 } });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });

  const entry = page.getByRole('button', { name: '开始行谱', exact: true });
  await entry.waitFor({ state: 'visible', timeout: 90_000 });

  console.log('\n【返回键接管：哨兵历史项逐层退出】');
  ok(await page.evaluate(() => !!(history.state && history.state.sfpBack)), '题屏在场即压入哨兵历史项');
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('.overlay'), undefined, { timeout: 8_000 });
  ok(true, '返回键关闭题屏浮层而非离开页面');
  ok(await page.evaluate(() => !!document.querySelector('#hallBtn')), '页面本体仍在（未导航离站）');

  // 大厅 → 返回键：应回题屏（handClose 链），而非离站
  await page.locator('#hallBtn').evaluate((b) => b.click()); // WebGL 场景下跳过可点性检查（仓库成例）
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 30_000 });
  ok(await page.evaluate(() => !!(history.state && history.state.sfpBack)), '大厅在场重新武装哨兵');
  await page.goBack();
  await entry.waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, '大厅上按返回＝关大厅回题屏（✕ 同去向）');

  console.log('\n【简繁切换：title/aria-label 属性同转】');
  const titleS = await page.evaluate(() => document.querySelector('#hallBtn')?.title || '');
  ok(titleS.includes('共修大厅'), `初始简体 tooltip 正确（${titleS.slice(0, 12)}…）`);
  await page.goBack(); // 关题屏，让出右上两钮
  await page.waitForFunction(() => !document.querySelector('.overlay'), undefined, { timeout: 8_000 });
  await page.locator('#mineBtn').evaluate((b) => b.click());
  await page.locator('#mySet').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#mySet').evaluate((b) => b.click());
  await page.locator('#zhSet').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#zhSet').evaluate((b) => b.click());
  await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => ({
    title: document.querySelector('#hallBtn')?.title || '',
    aria: document.querySelector('#hallBtn')?.getAttribute('aria-label') || '',
    mine: document.querySelector('#mineBtn')?.title || '',
  }));
  ok(t1.title.includes('共修大廳') && t1.title.includes('行譜'), `切繁后 title 随转（${t1.title.slice(0, 12)}…）`);
  ok(t1.aria.includes('共修大廳'), '切繁后 aria-label 随转（读屏不再停在开机语言）');
  ok(t1.mine.includes('功課'), '「我的」钮 tooltip 亦随转');
  await page.locator('#zhSet').evaluate((b) => b.click());
  await page.waitForTimeout(400);
  const t2 = await page.evaluate(() => document.querySelector('#hallBtn')?.title || '');
  ok(t2.includes('共修大厅'), '切回简体完整还原（原文缓存往返无损）');
} catch (error) {
  failed++;
  console.error(`  ✗ 验收中断：${error.message}`);
} finally {
  await browser?.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
