// 导览模式自测（2026-08-14 门面对调随行）：门面双钮＋导览巡游＋单站深链＋分享海报 四路真机走查。
// 先启动 `npm run dev`，再运行：npm run test:tour
// 四路各验一事：①无局门面（导览为主、行谱仍在、点导览入巡游、卡开着导览条仍可点、海报即出且驻足）
// ②深链 #v=节点（不亮题屏直落该站、自动巡游不开、hash 用毕即清）③有局门面（.hasSave 首帧即在、零翻面）
// ④行谱钮职守不变（点「开始行谱」入局不入导览）。无头下 rAF 不走，沿用 1px 催帧法（见 test-boot-face）。
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

// ── 一 无存局门面：导览钮为主、行谱钮仍在，点导览入巡游 ──
console.log('\n【一 无存局 · 导览钮为主，点入巡游】');
{
  const { page, ctx, errs } = await open(BASE, { zh: 's', sfpHelp: true });
  const ready = await pump(page, () => document.querySelector('#boot')?.classList.contains('ready'));
  ok(ready, '主包就绪');
  const f = await page.evaluate(() => ({
    tour: (document.querySelector('#bootTour')?.innerText || '').replace(/\s+/g, ' ').trim(),
    go: (document.querySelector('#bootGo')?.innerText || '').replace(/\s+/g, ' ').trim(),
    hasSave: document.querySelector('#boot').classList.contains('hasSave'),
    name: document.querySelector('#bootName')?.textContent || '',
  }));
  ok(/进入十法界/.test(f.tour) && /依经导览/.test(f.tour), '导览钮题「进入十法界 · 依经导览」', f.tour);
  ok(f.go === '开始行谱', '行谱钮仍题「开始行谱」', f.go);
  ok(!f.hasSave, '无存局不带 hasSave（导览金钮在上）');
  ok(f.name === '十法界须弥山世界', '题名已对调', f.name);
  await page.click('#bootTour');
  const started = await pump(page, () =>
    document.querySelector('#boot')?.classList.contains('bye')
    && !!document.querySelector('#tourBar')
    && (document.querySelector('#tourText')?.textContent || '') !== '', 20);
  ok(started, '点导览：题屏退场、导览台现身、站引已题字');
  const t1 = await page.evaluate(() => ({
    pos: document.querySelector('#tourPos')?.textContent || '',
    text: document.querySelector('#tourText')?.textContent || '',
    cardOpen: !!document.querySelector('.overlay #card'),
    auto: document.querySelector('#tourBar button[data-a="auto"]')?.classList.contains('on'),
  }));
  ok(/^1\/17/.test(t1.pos) && /须弥山/.test(t1.pos), '站标 1/17 · 须弥山', t1.pos);
  ok(!!t1.text, '站引一句已出（看景为主）', t1.text);
  ok(!t1.cardOpen, '默认不压全卡（档一②）');
  ok(t1.auto === true, '入口起步＝自动巡游开');
  await page.click('#tourBar button[data-a="next"]');
  const t2ok = await pump(page, () => /^2\/17/.test(document.querySelector('#tourPos')?.textContent || ''), 10);
  const t2 = await page.evaluate(() => ({ pos: document.querySelector('#tourPos')?.textContent || '' }));
  ok(t2ok && /地狱/.test(t2.pos), '下一站＝2/17 地狱法界', t2.pos);
  // 读经证 → 全卡深读，开卡即驻足（档一①）
  await page.click('#tourBar [data-a="card"]');
  const cardOk = await pump(page, () => /地狱/.test(document.querySelector('#cardName')?.textContent || ''), 10);
  ok(cardOk, '「读经证」开全卡＝地狱法界');
  ok(await page.evaluate(() => !document.querySelector('#tourBar button[data-a="auto"]')?.classList.contains('on')),
    '开卡即驻足（自动巡游停）');
  // 分享此站 → 海报
  await page.click('#tourBar button[data-a="share"]');
  const posterOk = await pump(page, () => {
    const im = document.querySelector('#posterCard img');
    return !!im && (im.getAttribute('src') || '').length > 50000;
  }, 15);
  ok(posterOk, '「分享此站」出海报（图已画成，非空底）');
  const pv = await page.evaluate(() => ({
    autoOff: !document.querySelector('#tourBar button[data-a="auto"]')?.classList.contains('on'),
    hint: document.querySelector('#posterCard .pcHint')?.textContent || '',
  }));
  ok(pv.autoOff, '出海报即驻足（自动巡游已停）');
  await page.click('#posterCard .pcLink');
  const link = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/#v=hell$/.test(link), '复制的是本站深链 #v=hell', link);
  await page.click('#posterCard .pcX');
  await page.click('#tourBar button[data-a="exit"]');
  const exited = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('#tourBar')).display,
  }));
  ok(exited.bar === 'none', '退出导览：条已收');
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 二 单站深链 #v=trayastrimsa：点开即落忉利天，自动巡游不开 ──
console.log('\n【二 深链 · #v=trayastrimsa 直落忉利天】');
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

// ── 三 有存局门面：续掷回主位，导览钮收短形 ──
console.log('\n【三 有存局 · 续掷为主，导览为附】');
{
  const { page, ctx, errs } = await open(BASE, {
    zh: 's', sfpHelp: true,
    sfp: { pos: '圓頓妙觀', n: 3, label: '圆顿妙观', hist: [], seenD: [], trail: ['圓頓妙觀'] },
  });
  const first = await page.evaluate(() => ({
    hasSave: document.querySelector('#boot').classList.contains('hasSave'),
    tour: (document.querySelector('#bootTour')?.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
  ok(first.hasSave, '首帧即 hasSave（续掷金钮在上，内联同步写）');
  ok(first.tour === '导览十法界', '导览钮首帧即短形「导览十法界」', first.tour);
  const ready = await pump(page, () => document.querySelector('#boot')?.classList.contains('ready'));
  ok(ready, '主包就绪');
  const after = await page.evaluate(() => ({
    hasSave: document.querySelector('#boot').classList.contains('hasSave'),
    tour: (document.querySelector('#bootTour')?.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
  ok(after.hasSave && after.tour === first.tour, '就绪后零翻面（hasSave 与导览钮字面不变）', `${after.tour}`);
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 四 行谱钮职守不变：点「开始行谱」入局不入导览 ──
console.log('\n【四 行谱钮 · 仍直入对局】');
{
  const { page, ctx, errs } = await open(BASE, { zh: 's', sfpHelp: true });
  await pump(page, () => document.querySelector('#boot')?.classList.contains('ready'));
  await page.click('#bootGo');
  const inGame = await pump(page, () =>
    document.querySelector('#boot')?.classList.contains('bye') && !document.querySelector('#tourBar'), 15);
  ok(inGame, '题屏退场且未出导览条（走的是行谱路）');
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 五 题屏分享：卡须压得住题屏（2026-08-14 发起人报「点分享没反应，再点大厅才出来」）──
// 病根：分享卡 z:70 而题屏 #boot z:100——卡开在题屏底下，人只见画面不动；
// 题屏一退（点大厅）那张卡才露出来，看着像「要点两次才行」。
console.log('\n【五 题屏点分享 · 卡即刻可见（不被题屏压住）】');
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
