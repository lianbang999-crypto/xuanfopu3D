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
  days: 3,
  people: 1,
  stream: [{ name: '回归同修', tosses: 12, wins: 1, at: Date.now() }],
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
  // 2026-08-11 起题屏主钮单人直开，不再绕共修大厅（旧写法等 .pzPanel → #pzSolo 会一直超时）。
  // 未就绪时点主钮只记心愿（__wantStart），真正起行由 bootActivate 在首帧 rAF 后代点，
  //   故须先催帧等 .ready；无头 swiftshader 下不催帧则永远停在题屏。
  for (let i = 0; i < 60; i++) {
    if (i % 4 === 0) {
      await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 260));
    if (await page.evaluate(() => document.querySelector('#boot')?.classList.contains('ready')).catch(() => false)) break;
  }
  await entry.evaluate((button) => button.click());
  for (let i = 0; i < 60; i++) {
    if (i % 4 === 0) {
      await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 260));
    if (await page.evaluate(() => document.querySelector('#sfpBar')?.classList.contains('show')).catch(() => false)) break;
  }
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 30_000 });

  console.log('\n【到终点立即锁轮】');
  await page.evaluate(() => window.__sfpGo('圓教究竟妙覺位'));
  await page.waitForFunction(() => document.querySelector('#sfpRoll')?.textContent.includes('本局已结束'));
  const roll = page.locator('#sfpRoll');
  ok(await roll.evaluate((button) => button.classList.contains('dis')), '到佛位立即禁用掷轮');
  await roll.dispatchEvent('pointerdown');
  ok(await roll.evaluate((button) => !button.classList.contains('hold')), '终局后再次按掷轮不会起轮');

  console.log('\n【终局佛位 · 接正本白话】');
  // 2026-08-12：成佛面板旧制只呈逐字原文＋duiduHtml 交错对读，而 duiduHtml 走旧层 SFP_WHY_PLAIN，
  //   在佛位这 601 字里只命中 6 处——成佛这一刻人对着大段文言，白话零零星星。
  //   而位白话正本早已译毕（领起句＋七行明细＋三条他经补注），位卡一直呈着，唯独这一屏没接。
  // 成佛面板在过场（金光·莲花）之后才出，那串 setTimeout 与显隐都要帧才推得动
  for (let i = 0; i < 50; i++) {
    if (i % 4 === 0) {
      await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 260));
    if (await page.evaluate(() => !!document.querySelector('.panel.keepOv')).catch(() => false)) break;
  }
  await page.locator('.panel.keepOv').waitFor({ state: 'visible', timeout: 30_000 });
  {
    const fo = await page.evaluate(() => {
      const pan = document.querySelector('.panel.keepOv');
      const raw = pan?.querySelector('[data-fo15]');
      const intro = pan?.querySelector('[data-fo15i]');
      return {
        lead: !!pan?.querySelector('.cSec .qp'),
        rows: pan?.querySelectorAll('.cSec .nRow').length || 0,
        ext: pan?.querySelectorAll('.cSec .cExt').length || 0,
        rawLen: (raw?.textContent || '').length,
        rawHead: (raw?.textContent || '').slice(0, 8),
        introLen: (intro?.textContent || '').length,
        gls: pan?.querySelectorAll('.gls').length || 0,
        oldDuidu: pan?.querySelectorAll('.dd').length || 0,
      };
    });
    ok(fo.lead, '佛位白话领起句在场（取 SFP_POS_BAIHUA 正本，非旧层碎片）');
    ok(fo.rows === 7, `佛位明细七行俱在（实得 ${fo.rows}）`);
    ok(fo.ext === 3, `他经补注三条俱在（实得 ${fo.ext}）`);
    ok(fo.oldDuidu === 0, '旧 duiduHtml 交错对读已撤（.dd 归零）');
    ok(fo.rawLen > 500 && /佛者/.test(fo.rawHead), `谱曰原文已占位回填 ${fo.rawLen} 字`, fo.rawHead);
    ok(fo.introLen > 0, `佛位六项标目已回填 ${fo.introLen} 字`);
    ok(fo.gls > 20, `白话挂上名相浮标 ${fo.gls} 处（繁体键命中即证字形无误）`);
  }

  console.log('\n【终局自动记功课与大厅可见】');
  const resultText = await page.locator('.panel.keepOv').innerText();
  // 验实质不验措辞：这两条原先钉的是「每一掷」「无需另行上榜」两句字面，而面板文案已改作
  //   「每完成一掷……计入今日念佛功课榜」，句子在、字面不在，断言遂空红。今改按义核。
  ok(resultText.includes('本局已经结束')
    && /每.{0,4}一掷/.test(resultText) && resultText.includes('南无阿弥陀佛') && resultText.includes('功课'),
    '结算面板说明一掷一声佛号计入功课');
  const submitBtns = await page.locator('.panel.keepOv button').evaluateAll(
    (bs) => bs.map((b) => b.textContent.trim()).filter((t) => /上榜|提交|登记|及第录/.test(t)));
  ok(!resultText.includes('及第录') && submitBtns.length === 0,
    '功课自动汇入，不再出现第二套上榜操作', submitBtns.join(' / '));
  if (pageErrors.length) console.log(`  · 页面异常：${pageErrors.join(' | ')}`);
  ok(pageErrors.length === 0, '终局流程无页面脚本异常');
  console.log(`  · 自动结算动态请求 ${finishRecords} 次`);
  ok(finishRecords === 1, '及第仅自动登记一次结算动态，无需手动提交');
  await page.locator('#lbView').evaluate((button) => button.click());
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#pzRank').evaluate((button) => button.click());
  await page.locator('.pzRankList').waitFor({ state: 'visible', timeout: 20_000 });
  const rankingText = await page.locator('.fsShell').innerText();
  const rankNumbers = await page.locator('.pzRankRow .no').count();
  ok(rankingText.includes('共修动态') && rankNumbers === 0, '共修动态不列名次');
  ok(rankingText.includes('回归同修') && rankingText.includes('12 掷'), '共修动态按累计掷轮呈现');
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
