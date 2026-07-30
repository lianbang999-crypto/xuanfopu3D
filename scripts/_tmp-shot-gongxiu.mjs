// 五批施工 · 双视口截图与 DOM 断言（临时脚本，验收后删除）
// 覆盖：大厅三卡（石青）/ 茶寮页（接本地 foyue 8788）/ 我的页（石青）/ 问名卡 / 等候室（石青·情境主按钮·⤢）
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT_DIR || '/tmp/gongxiu-shots';

let failed = 0;
const ok = (c, name) => { console.log(`${c ? '  ✓' : '  ✗'} ${name}`); if (!c) failed++; };

async function capture(page, name) {
  await fs.mkdir(OUT, { recursive: true });
  const s = await page.context().newCDPSession(page);
  const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
  await s.detach();
}

const browser = await chromium.launch({
  headless: true, executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  for (const [vpName, vp] of [['d', { width: 1280, height: 900 }], ['m', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport: vp });
    await context.addInitScript(() => {
      localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
      localStorage.setItem('sm10.fy.base', 'http://127.0.0.1:8788'); // 茶寮/纠错走本地 foyue worker
      localStorage.setItem('sm10.net.name', '慧安');                  // 有名号：发言与入座不再问名
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('pageerror:', String(e)));
    await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
    const start = page.getByRole('button', { name: '开始行谱', exact: true });
    await start.waitFor({ state: 'visible', timeout: 90_000 });
    await start.click({ force: true });

    // —— 大厅（三卡 · 石青） ——
    await page.locator('#pzChalou').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(400);
    ok(await page.locator('.pzMode').count() === 3, `${vpName} 大厅三卡并排`);
    const panelBg = await page.evaluate(() => getComputedStyle(document.querySelector('.pzPanel')).color);
    ok(panelBg.includes('35, 52, 60'), `${vpName} 大厅正文青墨（--aq-tx）`);
    await capture(page, `${vpName}-01-plaza`);

    // —— 茶寮 ——
    await page.locator('#pzChalou').click({ force: true });
    await page.locator('#clMsgs').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('.clM').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    ok(await page.locator('.clM').count() >= 1, `${vpName} 茶寮拉到主站留言`);
    ok((await page.locator('#clNotice').innerText()).includes('共修'), `${vpName} 茶寮呈现主站公告`);
    // 发一言（走本地 foyue，dev 为合规 g- id）
    await page.locator('#clIn').fill( `随喜赞叹（${vpName} 视口验证）`);
    await page.locator('#clGo').click({ force: true });
    await page.waitForTimeout(1200);
    ok(await page.locator('.clM.mine').count() >= 1, `${vpName} 发言即回显为右侧金泡`);
    await capture(page, `${vpName}-02-chalou`);
    await page.locator('#clBack').click({ force: true });
    await page.locator('#pzChalou').waitFor({ state: 'visible', timeout: 10_000 });

    // —— 入座 → 等候室（石青 · 情境主按钮 · ⤢） ——
    await page.locator('.pzT.s-empty').first().click({ force: true });
    await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(600);
    const startTxt = (await page.locator('#netStartBtn').innerText()).trim();
    ok(startTxt.includes('邀请莲友'), `${vpName} 独自在房主按钮＝邀请莲友（现为「${startTxt}」）`);
    ok(await page.locator('#netInvBtn').isHidden(), `${vpName} 底行邀请钮同屏收起`);
    const stateTxt = await page.locator('#netRoomState').innerText();
    ok(!stateTxt.includes('即可开局'), `${vpName} 状态行不再复述开局条件`);
    if (vp.width <= 520) {
      ok(await page.locator('#netPanel.full').count() === 1, 'm 等候室默认全高抽屉');
    } else {
      const h0 = (await page.locator('#netPanel').boundingBox())?.height || 0;
      await page.locator('#netFullBtn').click({ force: true });
      await page.waitForTimeout(300);
      const h1 = (await page.locator('#netPanel').boundingBox())?.height || 0;
      ok(h1 > h0 + 100, `d ⤢ 全屏拉高（${Math.round(h0)}→${Math.round(h1)}）`);
    }
    await capture(page, `${vpName}-03-waitroom`);
    await page.locator('#netLeaveBtn').click({ force: true });
    await page.waitForTimeout(600);

    // —— 我的页（石青） ——
    await page.locator('#mineBtn').click({ force: true });
    await page.locator('.myPanel .myGrid, .myPanel .cNote').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(500);
    ok(!!(await page.locator('.myPanel .myGrid .sub').count()), `${vpName} 我的页数字一卡`);
    await capture(page, `${vpName}-04-mine`);

    await context.close();
  }
  console.log(failed ? `\n失败 ${failed}` : '\n全部通过');
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
}
console.log('shots in', OUT);
