// MakePlay V90 内容校正与既有视觉/场景移植回归。
// 先启动 `npm run dev`，再运行：
// UI_BASE=http://localhost:5930 UI_ARTIFACT_DIR=/tmp/xuanfopu-v90 npm run test:v90
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

  // 【何以放宽到 120s】dev server 把千余个模块逐个现编现供，冷启一次 domcontentloaded
  //   实测 28s——正卡在 playwright 默认 30s 的边上，机器一忙即超时，报的却是「导航超时」，
  //   看着像页面坏了，其实只是没编完。下面等主钮本就给到 90s，此处不该反倒最紧。
  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const start = page.getByRole('button', { name: '开始行谱', exact: true });
  await start.waitFor({ state: 'visible', timeout: 90_000 });
  // 2026-08-12 修：本本自 163ac9a 起就按旧流程等「共修大厅 → #pzSolo」，而 08-11 已改
  //   题屏主钮单人直开，#pzSolo 全站不存（只余大厅连不上时的兜底钮 #pzSolo2）。
  //   另：未就绪时点主钮只记心愿（__wantStart），真正起行由 bootActivate 在首帧 rAF 后代点，
  //   无头 swiftshader 下不催帧则永远停在题屏——故须先催帧等 .ready，再点。
  const pump = async (fn, rounds = 60) => {
    for (let i = 0; i < rounds; i++) {
      if (i % 4 === 0) await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
      await page.waitForTimeout(260);
      if (await page.evaluate(fn).catch(() => false)) return true;
    }
    return false;
  };
  await pump(() => document.querySelector('#boot')?.classList.contains('ready'));
  await start.click({ force: true });
  await pump(() => document.querySelector('#sfpBar')?.classList.contains('show'));
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(250);

  console.log('\n【须弥山环缝】');
  const seam = await page.evaluate(() => window.__sumeruSeam?.());
  ok(seam?.stitched === true, '山体环缝已执行法线焊接');
  ok((seam?.positionGap ?? 1) < 1e-6, '环缝首尾几何坐标完全闭合');
  ok((seam?.normalGap ?? 1) < 1e-6, '环缝首尾法线连续，无纵向光切口');
  ok(seam?.materialCount === 1 && seam?.colorBlend === true, '四宝山面改为连续宝色，消除蓝白材质硬切');
  await capture(page, '00-sumeru-seam-fixed');

  console.log('\n【左侧视角档位 · v399 已撤（改验其不在）】');
  // 2026-08-17 随现行形制重写：v399（08-15「星图极简三档」）撤了三点档位胶囊——
  //   档位本可由镜头远近自明，另立一枚常驻控件是重复告知。此处遂反过来验它确已不在，
  //   免得日后谁把它捡回来。本节三条自 08-15 起皆红，非产品之失，是尺子停在旧形制。
  const tierGone = await page.evaluate(() => !document.querySelector('#tierDots'));
  ok(tierGone, '三点档位胶囊已撤（v399：档位由镜头远近自明，不另立常驻控件）');
  await capture(page, '00b-no-tier-dots');

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

  console.log('\n【谱页深读（v364 后：220 位全归主图，谱页为可选深读）】');
  // v364 起首掷不再自动转场谱页（落位即主图铺珠）；此处验证谱页深读入口仍可用。
  await page.evaluate(() => window.__discGo?.(false));
  await page.waitForFunction(() => !window.__discInfo?.().on, undefined, { timeout: 8_000 });
  await page.waitForFunction(() => document.querySelector('#fadeWhite')?.style.opacity !== '1', undefined, { timeout: 8_000 });
  // 首掷乘光飞行（v361 长途最长约 2.9s）可能尚未收尾：入场做重试等待，免与转场赛跑
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__discGo?.(true, 6));
    try {
      await page.waitForFunction(() => window.__discInfo?.().on === true, undefined, { timeout: 3_000 });
      break;
    } catch {}
  }
  const disc = await page.evaluate(() => window.__discInfo?.());
  ok(disc?.door === 6, '第六门谱页深读可进入（主图另有铺珠）');
  ok(disc?.beads === 6, '生善灭恶谱页完整显示六位');
  await capture(page, '01-door-6-disc-page');

  console.log('\n【V90 内容校正】');
  // 【本节大半于 2026-08-12 随旧本地答语库一并退役】
  //   原有六条守的是 __sfpRead 的 rules／cross／practice 三钩所吐的手写答语——
  //   「玩法问答分层」「横超问答补齐出处」「第一门不借外部偈语」「第二门不把自撰当引文」
  //   「第十五门只引本门佛位」「掷轮是称念不是默念」。那批答语是「问」在智能体不可靠时
  //   的本地兜底，今问答一路归问谱（检索全书 692 块＋据文生成＋句级核验），本地那一路撤，
  //   六条所守之物已不存在——守一个不存在的东西，不是守，是自欺。
  //   它们防的「凭空引文／借别门原文冒充本门」今由后端 verify.js 的句级闸接手
  //   （直引逐字回查、位名越界即丢句），验在 agent/eval/ask-eval.mjs。
  //   唯 fo15（成佛面板）不属旧问答库，是活的界面，故此条留下。
  const content = await page.evaluate(() => ({ fo15: window.__sfpRead?.fo15?.() || '' }));
  ok(content.fo15.includes('圓極果位門「佛」') && !content.fo15.includes('輪相表法第一'),
    '及第说明只引门十五「佛」位原文，不借别门判词');

  console.log('\n【V92 见闻录】');
  const logBefore = await page.evaluate(() => window.__lgDbg?.());
  ok(logBefore?.games >= 1 && Array.isArray(logBefore?.seen), '见闻录跨局数据结构已建立并记录开局');
  // 见闻录已并入「我的」全屏页，入口在星图右上角（⋯ 菜单只留局务两项）
  await page.locator('#mineBtn').click({ force: true });
  await page.locator('#myLg').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#myLg').click({ force: true });
  const logTitle = page.getByRole('heading', { name: '见闻录 · 历局所见' });
  await logTitle.waitFor({ state: 'visible' });
  ok(await page.locator('.lgRow').count() === 15, '见闻录按十五门显示曾见进度');
  ok((await page.locator('.lgNums').innerText()).includes('称名'), '见闻录显示可数行程账且不作修证判语'); // v353：掷数栏依上游改题「称名」（一掷即一称名）
  await page.locator('#lgOk').click({ force: true });

  ok(pageErrors.length === 0, `页面运行无异常${pageErrors.length ? `：${pageErrors.join(' | ')}` : ''}`);
  await context.close();
} finally {
  await browser?.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
if (ARTIFACT_DIR) console.log(`截图：${ARTIFACT_DIR}`);
if (failed) process.exitCode = 1;
