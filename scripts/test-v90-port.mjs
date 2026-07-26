// MakePlay V90 内容校正与既有视觉/场景移植回归。
// 先启动 `npm run dev`，再运行：
// UI_BASE=http://127.0.0.1:5173 UI_ARTIFACT_DIR=/tmp/xuanfopu-v90 npm run test:v90
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://127.0.0.1:5173';
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
  const session = await page.context().newCDPSession(page);
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(ARTIFACT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
  await session.detach();
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
  const start = page.getByRole('button', { name: '开始行谱', exact: true });
  await start.waitFor({ state: 'visible', timeout: 90_000 });
  await start.click({ force: true });
  const solo = page.locator('#pzSolo');
  await solo.waitFor({ state: 'visible', timeout: 12_000 });
  await solo.click({ force: true });
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 12_000 });
  await page.waitForTimeout(250);

  console.log('\n【须弥山环缝】');
  const seam = await page.evaluate(() => window.__sumeruSeam?.());
  ok(seam?.stitched === true, '山体环缝已执行法线焊接');
  ok((seam?.positionGap ?? 1) < 1e-6, '环缝首尾几何坐标完全闭合');
  ok((seam?.normalGap ?? 1) < 1e-6, '环缝首尾法线连续，无纵向光切口');
  ok(seam?.materialCount === 1 && seam?.colorBlend === true, '四宝山面改为连续宝色，消除蓝白材质硬切');
  await capture(page, '00-sumeru-seam-fixed');

  console.log('\n【V90 保留：左侧视角档位】');
  const tier = await page.evaluate(() => {
    const el = document.querySelector('#tierDots');
    const rect = el?.getBoundingClientRect();
    return {
      count: el?.querySelectorAll('i').length,
      label: el?.querySelector('b')?.textContent,
      active: [...(el?.querySelectorAll('i') || [])].findIndex((dot) => dot.classList.contains('on')),
      left: rect?.left,
      width: rect?.width,
    };
  });
  ok(tier.count === 3, '三点是全图／门场／星位三档指示，不是残留控件');
  ok(['全图', '门场', '星位'][tier.active] === tier.label, '当前档位有文字与亮点双重反馈');
  ok((tier.left ?? 999) < 80 && (tier.width ?? 0) > 10, '档位胶囊已归到左侧截面滑杆下方');
  await capture(page, '00b-tier-dots');

  console.log('\n【V90 保留：全局光影】');
  const lighting = await page.evaluate(() => ({
    scene: window.__lightDbg?.(),
    sky: window.__skyDbg?.(),
    wheels: window.__wheelDbg?.(),
    background: window.__backgroundDbg?.(),
  }));
  ok(lighting.scene?.fog === 0.0016 && lighting.scene?.base === 0.0016, '娑婆光境与雾参数由统一预设接管');
  ok(lighting.sky?.sunE > lighting.sky?.moonE && lighting.sky?.moonE > lighting.sky?.starE, '天体亮度保持日大于月、月大于星');
  ok(lighting.sky?.sunGlow?.[0] === 10 && lighting.sky?.moonGlow?.[0] === 7, '日月光晕沿用 V89 的收束参数');
  ok(lighting.wheels?.length === 3 && lighting.wheels.every((wheel) => wheel.env === 0), '三轮均已关闭错误环境反光');
  ok(lighting.background?.starLayers === 4, '背景仅保留 V90 的四层程序星点');
  ok(lighting.background?.backdropMeshes === 0 && lighting.background?.horizonGlows === 0, '背景没有渐变天穹与地平加色光污染');

  console.log('\n【V90 保留：欲界附位】');
  const beadInfo = await page.evaluate(() => ({
    iron: window.__sfpBead?.('鐵輪王'),
    gold: window.__sfpBead?.('金輪王'),
    immortal: window.__sfpBead?.('十種仙'),
    ironTone: window.__sfpTone?.('鐵輪王'),
    goldTone: window.__sfpTone?.('金輪王'),
    fx: window.__sfpFx?.(),
  }));
  ok(Array.isArray(beadInfo.iron) && Array.isArray(beadInfo.gold), '铁铜银金四轮王已有专属轮宝阶坐标');
  ok(beadInfo.gold[1] > beadInfo.iron[1], '轮王阶按铁至金逐级升高');
  ok(Array.isArray(beadInfo.immortal) && beadInfo.immortal[1] > beadInfo.gold[1], '十仙位于外海孤峰高处');
  ok(beadInfo.goldTone > beadInfo.ironTone, '轮王珠明度按铁至金递增');
  ok(beadInfo.fx && beadInfo.fx.beam === false, '蒙光光幢自测接口可用且初始静默');

  console.log('\n【V90 保留：行门谱页】');
  // 首掷会自动进入第一门星盘；先返回娑婆，再验证第六门的独立谱页。
  await page.evaluate(() => window.__discGo?.(false));
  await page.waitForFunction(() => !window.__discInfo?.().on, undefined, { timeout: 8_000 });
  await page.waitForFunction(() => document.querySelector('#fadeWhite')?.style.opacity !== '1', undefined, { timeout: 8_000 });
  await page.evaluate(() => window.__discGo?.(true, 6));
  await page.waitForTimeout(1_400);
  const disc = await page.evaluate(() => window.__discInfo?.());
  ok(disc?.door === 6, '第六门进入独立谱页而非铺在主图');
  ok(disc?.beads === 6, '生善灭恶谱页完整显示六位');
  await capture(page, '01-door-6-disc-page');

  console.log('\n【V90 内容校正】');
  const content = await page.evaluate(() => {
    const read = window.__sfpRead;
    const rules = read?.rules?.() || '';
    const cross = read?.cross?.() || '';
    const d1 = read?.practice?.(1) || '';
    const d2 = read?.practice?.(2) || '';
    const d15 = read?.practice?.(15) || '';
    const fo15 = read?.fo15?.() || '';
    const plain = (html) => {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      return holder.textContent || '';
    };
    return { rules, cross, crossText: plain(cross), d1, d2, d15, fo15 };
  });
  ok(content.rules.includes('卷第一 · 輪相表法第一') && content.rules.includes('若但有善無惡'), '玩法问答把释义与逐字原文、卷次出处分层');
  ok(content.crossText.includes('卷第六 · 淨土橫超門總說') && content.crossText.includes('未斷見思'), '横超问答补齐两段原文与真实出处');
  ok(content.d1.includes('置輪掌心') && !content.d1.includes('诸恶莫作'), '第一门修行说明不再借用外部偈语');
  ok(content.d2.includes('法道流弊門「破軌則」') && !content.d2.includes('解行相应'), '第二门改用本门原文，不再把自撰提法当作引文');
  ok(content.d15.includes('圓極果位門「佛」') && !content.d15.includes('心空及第'), '第十五门只引用本门「佛」位原文');
  ok(content.fo15.includes('原文说明 · 对读') && content.fo15.includes('圓極果位門「佛」') && !content.fo15.includes('輪相表法第一'), '及第说明只呈门十五原文对读，不借别门判词');

  console.log('\n【V92 内容与见闻录】');
  ok(content.rules.includes('至心称念') && !content.rules.includes('默念'), '掷轮操作统一校正为至心称念');
  const logBefore = await page.evaluate(() => window.__lgDbg?.());
  ok(logBefore?.games >= 1 && Array.isArray(logBefore?.seen), '见闻录跨局数据结构已建立并记录开局');
  await page.locator('#sfpMore').click({ force: true });
  await page.locator('#smLg').waitFor({ state: 'visible' });
  await page.locator('#smLg').click({ force: true });
  const logTitle = page.getByRole('heading', { name: '见闻录 · 历局所见' });
  await logTitle.waitFor({ state: 'visible' });
  ok(await page.locator('.lgRow').count() === 15, '见闻录按十五门显示曾见进度');
  ok((await page.locator('.lgNums').innerText()).includes('总掷数'), '见闻录显示可数行程账且不作修证判语');
  await page.locator('#lgOk').click({ force: true });

  ok(pageErrors.length === 0, `页面运行无异常${pageErrors.length ? `：${pageErrors.join(' | ')}` : ''}`);
  await context.close();
} finally {
  await browser?.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
if (ARTIFACT_DIR) console.log(`截图：${ARTIFACT_DIR}`);
if (failed) process.exitCode = 1;
