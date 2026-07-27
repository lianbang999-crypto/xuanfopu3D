// 终局交互回归：到佛位立即锁轮、每掷自动记念佛功课、大厅只有统一功课榜。
// 用法：先启动 Vite，再 UI_BASE=http://localhost:5930 npm run test:finish
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0;
let failed = 0;
let finishRecords = 0;
function ok(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const emptyTables = Array.from({ length: 12 }, (_, index) => ({
  hall: 1,
  no: index + 1,
  code: `H1T${index + 1}`,
  ord: String(index + 1),
  seats: [],
  live: 0,
  max: 4,
  state: 'empty',
  locked: false,
}));
const plazaData = {
  hall: 1,
  tables: emptyTables,
  online: 0,
  playingTables: 0,
  tosses: 88,
  tossesToday: 12,
  wins: 3,
  winsToday: 1,
  practiceLeaders: [{ name: '回归同修', tosses: 12 }],
  practicePeople: 1,
  feed: [{ kind: 'win', text: '回归同修 第 12 掷选佛及第', ts: Date.now() }],
};

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
await context.addInitScript(() => {
  localStorage.setItem('sm10.net.name', '回归同修');
  localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
await page.route(/\/api\/plaza(?:\/.*)?(?:\?.*)?$/, async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/plaza' && request.method() === 'GET') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plazaData) });
    return;
  }
  if (path === '/api/plaza/record') finishRecords++;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, accepted: 1, wins: 4 }) });
});

try {
  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
  const entry = page.getByRole('button', { name: '开始行谱', exact: true });
  await entry.waitFor({ state: 'visible', timeout: 90_000 });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await entry.evaluate((button) => button.click());
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#pzSolo').evaluate((button) => button.click());
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 30_000 });

  console.log('\n【到终点立即锁轮】');
  await page.evaluate(() => window.__sfpGo('圓教究竟妙覺位'));
  await page.waitForFunction(() => document.querySelector('#sfpRoll')?.textContent.includes('本局已结束'));
  const roll = page.locator('#sfpRoll');
  ok(await roll.evaluate((button) => button.classList.contains('dis')), '到佛位立即禁用掷轮');
  await roll.dispatchEvent('pointerdown');
  ok(await roll.evaluate((button) => !button.classList.contains('hold')), '终局后再次按掷轮不会起轮');

  console.log('\n【终局自动记功课与大厅可见】');
  await page.locator('.panel.keepOv').waitFor({ state: 'visible', timeout: 30_000 });
  const resultText = await page.locator('.panel.keepOv').innerText();
  ok(resultText.includes('本局已经结束') && resultText.includes('每一掷') && resultText.includes('南无阿弥陀佛'), '结算面板说明一掷一声佛号');
  ok(resultText.includes('无需另行上榜') && !resultText.includes('及第录'), '功课自动汇入，不再出现第二套上榜操作');
  if (pageErrors.length) console.log(`  · 页面异常：${pageErrors.join(' | ')}`);
  ok(pageErrors.length === 0, '终局流程无页面脚本异常');
  console.log(`  · 自动结算动态请求 ${finishRecords} 次`);
  ok(finishRecords === 1, '及第仅自动登记一次结算动态，无需手动提交');
  await page.locator('#lbView').evaluate((button) => button.click());
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#pzRank').evaluate((button) => button.click());
  const rankingText = await page.locator('.pzRankCard').innerText();
  ok(rankingText.includes('念佛功课榜') && !rankingText.includes('及第录'), '大厅只呈现统一的念佛功课榜');
  ok(rankingText.includes('回归同修') && rankingText.includes('12 念'), '今日功课可在大厅核对');
} catch (error) {
  failed++;
  console.error(`  ✗ 终局回归中断：${error.message}`);
} finally {
  await page.close({ runBeforeUnload: false }).catch(() => {});
  await context.close().catch(() => {});
  await browser.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
