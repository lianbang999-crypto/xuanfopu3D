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

  // 钮可见 ≠ 题屏已接活。#boot 是 index.html 里的静态门面，`开始行谱` 在 DCL 时就在场了；
  // 而 openTitle()（连同 armBackGuard 压哨兵）挂在 **首帧 rAF 回调**里（game.js 的
  // `requestAnimationFrame((t) => { frame(t); bootActivate(); })`），首帧要等着色器编译完
  // ——那一段注释自己写着「软渲染环境可达数秒」。无头 swiftshader 下 rAF 受节流，
  // 这一等可达十余秒，且不催帧就可能一直不来。故此处：连拍 1×1 像素催帧 ＋ 轮询等哨兵，
  // 不再拿「钮可见」当「已就绪」。等不到仍算失败，不是放行。
  let armed = false;
  for (let i = 0; i < 40 && !armed; i++) {
    await Promise.race([
      page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
      new Promise((r) => setTimeout(r, 1200)),
    ]).catch(() => {});
    await page.waitForTimeout(250);
    armed = await page.evaluate(() => !!(history.state && history.state.sfpBack));
  }

  console.log('\n【返回键接管：哨兵历史项逐层退出】');
  ok(armed, '题屏接活即压入哨兵历史项');
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

  console.log('\n【「我的」子页同路往返 + 判词在场按返回＝落子收层】');
  // 此刻设置卡开着（我的→设置进入）：关卡应回「我的」而非落裸场景
  await page.goBack();
  await page.locator('#mySet').waitFor({ state: 'visible', timeout: 30_000 });
  ok(true, '设置关卡同路往返回「我的」');
  await page.goBack(); // 关「我的」回裸场景
  await page.waitForFunction(() => !document.querySelector('.overlay'), undefined, { timeout: 8_000, polling: 250 });
  // 起一局单机：大厅→一人行谱。「一人行谱」卡已撤出大厅正例（plaza.js「单人是玩法不是共修去处」定案），
  // 本测试环境（vite 单跑、无房间服务）走的正是「大厅连不上」兜底钮 #pzSolo2——顺带把该兜底也测在内；
  // 若日后在有房服环境跑，正例入口如有恢复亦兼容（两选择器取先见者）。
  await page.locator('#hallBtn').evaluate((b) => b.click());
  const solo = page.locator('#pzSolo, #pzSolo2').first();
  await solo.waitFor({ state: 'visible', timeout: 45_000 });
  await solo.evaluate((b) => b.click());
  await page.waitForFunction(() => document.querySelector('#sfpBar')?.classList.contains('show'), undefined, { timeout: 30_000, polling: 250 });
  // 掷轮（空格按住→松开），连拍截图催帧兜底（无头 rAF 节流环境）
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  // 动画窗双按返回：功课已计而判词未出的 1.3–2.1s 内连按两次返回，不得离站丢本掷
  await page.goBack();
  await page.waitForTimeout(250);
  await page.goBack();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!document.querySelector('#hallBtn')), '掷轮动画窗内双按返回不离站（行处已存不作假承诺）');
  for (let i = 0; i < 50 && !(await page.evaluate(() => document.querySelector('#verdict')?.classList.contains('show'))); i++) {
    await page.screenshot().catch(() => {});
    await page.waitForTimeout(400);
  }
  ok(await page.evaluate(() => document.querySelector('#verdict')?.classList.contains('show')), '首掷判词在场');
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#verdict')?.classList.contains('show'), undefined, { timeout: 8_000, polling: 250 });
  ok(true, '判词在场按返回＝落子收层（本掷不蒸发）');
  ok(await page.evaluate(() => !!document.querySelector('#hallBtn')), '未离站');
  ok(await page.evaluate(() => ((window.__sfpRead?.hist() || []).length) >= 1), '本掷判定已入行谱');
  ok(await page.evaluate(() => !!(history.state && history.state.sfpBack)), '返回后哨兵重新武装');
} catch (error) {
  failed++;
  console.error(`  ✗ 验收中断：${error.message}`);
} finally {
  await browser?.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
