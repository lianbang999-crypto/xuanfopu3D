// 单站深链与题屏分享自测。先启动 `npm run dev`，再运行：npm run test:tour
//
// 2026-08-18 一门而入：题屏双钮收为一枚，导览钮撤（十七站既定路线换作用户自行探索）。
//   本本原验四路，其中「无局门面双钮」「有局门面翻序」「行谱钮不入导览」三节所验之物已随入口而去，
//   一并切除；余下两节所验者仍在，故留：
//   ① 单站深链 #v=节点——**导览代码与深链皆未删**，已印出去的海报扫码仍须直落其站，
//      此节即守这份不失信；导览台（#tourBar）在深链落站时照旧出现，只是不再有题屏入口。
//   ② 题屏点分享——分享卡须压得住题屏（2026-08-14 发起人报「点分享没反应」之守）。
// 无头下 rAF 不走，沿用 1px 催帧法（见 test-boot-face）。
import { chromium } from 'playwright-core';

const EXE = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.UI_BASE || 'http://localhost:5930';
let passed = 0, failed = 0;
const ok = (c, name, extra = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${name}${c ? '' : `　—— ${extra}`}`);
  c ? passed++ : failed++;
};

const b = await chromium.launch({
  headless: true, executablePath: EXE,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

async function open(url, save) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 700 },
    permissions: ['clipboard-read', 'clipboard-write'] }); // 无头默认禁剪贴板，授权后「复制链接」才可验
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  if (save !== undefined) {
    await ctx.addInitScript((s) => {
      try { localStorage.setItem('sm10.save.v1', typeof s === 'string' ? s : JSON.stringify(s)); } catch (e) {}
    }, save);
  }
  await page.goto(url, { waitUntil: 'commit' });
  return { page, ctx, errs };
}
// 无头下 rAF 不走：催帧（1px 截图触发合成）直到 .ready 或指定条件成立
async function pump(page, cond, tries = 40) {
  for (let i = 0; i < tries; i++) {
    await Promise.race([
      page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
      new Promise((r) => setTimeout(r, 900)),
    ]).catch(() => {});
    await page.waitForTimeout(250);
    if (await page.evaluate(cond).catch(() => false)) return true;
  }
  return false;
}

// ── 一 单站深链 #v=trayastrimsa：点开即落忉利天，自动巡游不开 ──
console.log('\n【一 深链 · #v=trayastrimsa 直落忉利天】');
{
  const { page, ctx, errs } = await open(`${BASE}/#v=trayastrimsa`, { zh: 's', sfpHelp: true });
  const landed = await pump(page, () =>
    document.querySelector('#boot')?.classList.contains('bye')
    && /忉利天/.test(document.querySelector('#tourPos')?.textContent || ''));
  ok(landed, '题屏不点亮，直落忉利天站');
  const f = await page.evaluate(() => ({
    pos: document.querySelector('#tourPos')?.textContent || '',
    text: document.querySelector('#tourText')?.textContent || '',
    cardOpen: !!document.querySelector('.overlay #card'),
    auto: document.querySelector('#tourBar button[data-a="auto"]')?.classList.contains('on'),
    hash: location.hash,
  }));
  ok(/^8\/17/.test(f.pos), '导览台落 8/17 · 忉利天', f.pos);
  ok(!!f.text && !f.cardOpen, '站引已出、不压全卡（来客自己定步子）', f.text);
  ok(f.auto === false, '深链落站＝自动巡游不开');
  ok(f.hash === '', '深链用毕即清（#v 不残留）', f.hash);
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 二 题屏分享：卡须压得住题屏（2026-08-14 发起人报「点分享没反应，再点大厅才出来」）──
// 病根：分享卡 z:70 而题屏 #boot z:100——卡开在题屏底下，人只见画面不动；
// 题屏一退（点大厅）那张卡才露出来，看着像「要点两次才行」。
console.log('\n【二 题屏点分享 · 卡即刻可见（不被题屏压住）】');
{
  const { page, ctx, errs } = await open(BASE, { zh: 's', sfpHelp: true });
  ok(await pump(page, () => document.querySelector('#boot')?.classList.contains('ready')), '主包就绪');
  await page.evaluate(() => (document.querySelector('#tiShare')             )?.click());
  const shown = await pump(page, () => !!document.querySelector('#shareCard'), 12);
  ok(shown, '点「分享」即出分享卡');
  const seen = await page.evaluate(() => {
    const c = document.querySelector('#shareCard'), b2 = document.querySelector('#boot');
    if (!c || !b2) return null;
    const cz = Number(getComputedStyle(c).zIndex) || 0, bz = Number(getComputedStyle(b2).zIndex) || 0;
    // 命中测试：卡片中心那一点，落到的是不是卡自己（被题屏盖住则落到 #boot）
    const r = c.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { cz, bz, bootOn: !b2.classList.contains('bye'), hit: !!top?.closest('#shareCard') };
  });
  ok(seen && seen.bootOn, '题屏仍在场（分享不该先把题屏赶走）');
  ok(seen && seen.cz > seen.bz, `分享卡层高于题屏（卡 z:${seen?.cz} > 题屏 z:${seen?.bz}）`);
  ok(seen && seen.hit, '卡中心可触及——未被题屏遮盖（此条即本 bug 的哨兵）');
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await b.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
