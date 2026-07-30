// 名号填写与“我已准备”交互回归。
// 先启动 `npm run server` 与 `npm run dev`，再运行：
// UI_ARTIFACT_DIR=/tmp/xuanfopu-name-ready npm run test:name-ready
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACT_DIR = process.env.UI_ARTIFACT_DIR || '';

let passed = 0;
let failed = 0;
function ok(condition, name) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function capture(page, name) {
  if (!ARTIFACT_DIR) return;
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    animations: 'disabled',
  });
}

async function freezeVisuals(page) {
  await page.addStyleTag({
    content: 'canvas{visibility:hidden!important}*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
}

let browser;
let context;
let page;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  context = await browser.newContext({ viewport: { width: 1200, height: 820 } });
  await context.addInitScript(() => {
    localStorage.removeItem('sm10.net.name');
    localStorage.removeItem('sm10.net.v2');
    localStorage.removeItem('sm10.net.active.v1');
    localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
  });
  page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000);
  const testHall = 100 + (Date.now() % 800);
  await page.route('**/api/plaza', async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('hall')) url.searchParams.set('hall', String(testHall));
    await route.continue({ url: url.toString() });
  });

  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
  const entry = page.getByRole('button', { name: '开始行谱', exact: true });
  await entry.waitFor({ state: 'visible', timeout: 90_000 });
  await freezeVisuals(page);
  await entry.evaluate((button) => button.click());
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 30_000 });

  const tables = page.locator('.pzT.s-empty:not(:disabled)');
  const tableCount = await tables.count();
  ok(tableCount > 0, '大厅有空共修室可验收');
  const table = tables.nth(tableCount - 1);
  const code = await table.getAttribute('data-code');
  await table.evaluate((button) => button.click());

  const dialog = page.getByRole('dialog', { name: '留下共修名号' });
  await dialog.waitFor({ state: 'visible' });
  const input = page.locator('#pzName');
  ok(await dialog.isVisible(), '未存名号时先打开独立填写对话框');
  ok((await page.locator('#pzNameScope').innerText()).includes('本室名单与共修动态'), '明确说明名号的展示范围'); // 口径随页面现名「共修动态」（原「念佛功课榜」旧称已清）
  ok(await input.getAttribute('autocomplete') === 'nickname'
    && (await input.getAttribute('aria-describedby'))?.includes('pzNameScope'), '输入框具备标签、自动填充与用途说明关联');
  await page.waitForTimeout(120);
  ok(await input.evaluate((element) => document.activeElement === element), '桌面端打开后直接聚焦名号输入框');

  await input.fill('甲乙丙丁戊己庚辛壬癸子丑寅');
  const trimmedValue = await input.inputValue();
  ok(Array.from(trimmedValue).length === 12
    && (await page.locator('#pzNameCount').innerText()).includes('12 / 12'), '超过十二字时即时截断并显示字数');

  // force：无头环境有断帧窗口（rAF 长时间不来），非 force 点击等「连续两帧盒对比」会悬死；
  // 应用行为已单独验证无恙（✕ 直发 click 正常关卡回大厅），与本套件其余点击同口径
  await page.getByRole('button', { name: '关闭', exact: true }).click({ force: true });
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 15_000 });
  ok(await page.locator(`.pzT[data-code="${code}"]`).isVisible(), '关闭名号框返回大厅，不会掉回游戏底层');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(`.pzT[data-code="${code}"]`).evaluate((button) => button.click());
  await dialog.waitFor({ state: 'visible' });
  const mobileDialog = await dialog.boundingBox();
  const mobileInput = await input.boundingBox();
  ok(!!mobileDialog
    && mobileDialog.x >= 8
    && mobileDialog.x + mobileDialog.width <= 382
    && mobileDialog.y >= 24
    && mobileDialog.y + mobileDialog.height <= 820
    && mobileDialog.height < 760, '手机端名号框居中且不再变成整屏侧栏');
  ok(!!mobileInput && mobileInput.height >= 44, '手机名号输入达到合适触控高度');
  await page.waitForTimeout(120);
  ok(await input.evaluate((element) => document.activeElement !== element), '手机端不强制弹出键盘，先让用户看清说明');

  await input.fill('慧明');
  ok((await page.locator('#pzNameCount').innerText()).includes('2 / 12')
    && await page.getByRole('button', { name: '以「慧明」入座', exact: true }).isVisible(), '输入后同步显示字数与将要使用的名号');
  await capture(page, 'name-entry-mobile');

  const joiningUi = await page.locator('#pzNameSubmit').evaluate((button) => {
    button.click();
    return {
      text: button.textContent,
      disabled: button.disabled,
      busy: button.closest('form')?.getAttribute('aria-busy'),
    };
  });
  ok(joiningUi.disabled && joiningUi.busy === 'true' && joiningUi.text.includes('正在入座'), '提交后立即锁定表单，避免重复入座');
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 15_000 });
  ok(await page.evaluate(() => localStorage.getItem('sm10.net.name') === '慧明'), '入座成功后在本机保存名号');

  // 情境主按钮（2026-07-30 §七落地）：独自在房时主按钮＝邀请，不再让人盯着灰掉的开局钮
  ok((await page.locator('#netStartBtn').innerText()).includes('邀请莲友'), '独自在房时主按钮＝邀请莲友（情境主按钮）');
  const readyPending = await page.locator('#netReadyBtn').evaluate((button) => {
    for (let index = 0; index < 6; index++) button.click();
    return {
      text: button.textContent,
      disabled: button.disabled,
      busy: button.getAttribute('aria-busy'),
      guide: document.querySelector('#netGuide')?.textContent || '',
    };
  });
  ok(readyPending.disabled && readyPending.busy === 'true' && readyPending.text.includes('正在准备'), '快速连点“我已准备”只进入一次待确认状态');
  ok(readyPending.guide.includes('正在确认您的准备状态'), '确认期间引导文案与按钮状态一致');
  await page.waitForFunction(() => document.querySelector('#netReadyBtn')?.textContent.includes('取消准备'));
  ok(await page.locator('#netReadyBtn').getAttribute('aria-pressed') === 'true'
    && (await page.locator('#netRoster').innerText()).includes('已准备'), '服务端确认后名单和按钮统一显示已准备');
  ok((await page.locator('#netStartBtn').innerText()).includes('邀请莲友')
    && (await page.locator('#netGuide').innerText()).includes('两位准备即可开局'), '独自已准备仍以邀请为主行动，指引明说两位即可开局');
  await capture(page, 'ready-confirmed-mobile');

  const cancelPending = await page.locator('#netReadyBtn').evaluate((button) => {
    for (let index = 0; index < 6; index++) button.click();
    return {
      text: button.textContent,
      disabled: button.disabled,
      busy: button.getAttribute('aria-busy'),
    };
  });
  ok(cancelPending.disabled && cancelPending.busy === 'true' && cancelPending.text.includes('正在取消'), '快速连点取消也只进入一次待确认状态');
  await page.waitForFunction(() => document.querySelector('#netReadyBtn')?.textContent.includes('我已准备'));
  ok(await page.locator('#netReadyBtn').getAttribute('aria-pressed') === 'false'
    && (await page.locator('#netRoster').innerText()).includes('等待准备'), '取消确认后按钮与名单恢复未准备状态');

  await page.locator('#netLeaveBtn').click({ force: true });
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 15_000 });
} catch (error) {
  failed++;
  console.error(`  ✗ 名号/准备验收中断：${error.stack || error.message}`);
} finally {
  if (page && !page.isClosed()) {
    try {
      const leave = page.locator('#netLeaveBtn');
      if (await leave.isVisible()) await leave.click({ force: true, timeout: 1500 });
    } catch {}
  }
  if (context) {
    try { await context.close(); } catch {}
  }
  if (browser) await browser.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
if (ARTIFACT_DIR) console.log(`截图：${ARTIFACT_DIR}`);
process.exit(failed ? 1 : 0);
