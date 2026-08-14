// 题屏门面验收：首帧即照实，且此后不改口。
//
// 缘起（2026-08-12 发起人报）：打开网站先见金钮「开始行谱」，过一会儿变「续掷上局 · 现居「X」·第N掷」，
//   细字行也多出「新开一局」。成因是静态门面写死了无存局之形，而三态由 openTitle 按存档改写，
//   openTitle 又卡在首帧 rAF 之后（着色器编译可达数秒）。存局本在 localStorage、解析 HTML 即可读到，
//   这个等待纯属无谓。今由 index.html 的内联脚本自行读档。
//
// 本本盯的就是「不等」与「不改口」两件，故第一条断言**不催帧、不等 .ready**——
//   若谁把读档挪回主包，这一条立刻红。
// 先启动 `npm run dev`，再运行：npm run test:boot
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let passed = 0, failed = 0;
const ok = (c, n, x = '') => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${x ? ` — ${x}` : ''}`); } };

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const snap = (page) => page.evaluate(() => ({
  go: (document.querySelector('#bootGo')?.innerText || '').replace(/\s+/g, ' ').trim(),
  links: (document.querySelector('#bootLinks')?.innerText || '').replace(/\s+/g, ' ').trim(),
}));

// 无头 swiftshader 下 rAF 受节流，须偶尔拍一帧催醒合成器（仓库成例）。
// 但连拍会把渲染进程拖崩（实测 "Target page has been closed"），故只每 6 轮拍一次，
// 其余轮次纯等；且一切调用都容错——催帧失败不该算作被测代码的错。
const pumpToReady = async (page, rounds = 140) => {
  for (let i = 0; i < rounds; i++) {
    if (i % 6 === 0) {
      await Promise.race([
        page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1500)),
      ]).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 400));
    const done = await page.evaluate(() => document.querySelector('#boot')?.classList.contains('ready'))
      .catch(() => null);
    if (done) return true;
    if (done === null && page.isClosed()) return false;
  }
  return false;
};

const open = async (saveObj) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript((s) => {
    localStorage.clear();
    if (s !== null) localStorage.setItem('sm10.save.v1', typeof s === 'string' ? s : JSON.stringify(s));
  }, saveObj);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  // 用 commit 而非 domcontentloaded：dev 下主包是 50+ 个未打包 module script，
  //   DCL 要等它们全部求值完（外加 WebGL 初始化），慢机上会超时。
  //   而本本要验的恰是「主包未到时门面已照实」，故落地即取，只等静态标记解析出来。
  await page.goto(UI_BASE, { waitUntil: 'commit' });
  await page.locator('#bootGo').waitFor({ state: 'attached', timeout: 30000 });
  return { page, ctx, errs };
};

// ── 一 有存局：首帧即「续掷上局」，不等主包 ──────────────────────────────
console.log('\n【一 有存局 · 首帧即照实（不催帧、不等 ready）】');
{
  const { page, ctx, errs } = await open({
    zh: 's', sfpHelp: true,
    sfp: { pos: '圓頓妙觀', n: 16, label: '圆顿妙观', hist: [], seenD: [], trail: ['圓頓妙觀'] },
  });
  const first = await snap(page);
  const ready0 = await page.evaluate(() => document.querySelector('#boot')?.classList.contains('ready'));
  ok(ready0 === false, '此刻主包尚未就绪（.ready 未加）——下面几条才有意义');
  ok(/续掷上局/.test(first.go), '钮已题「续掷上局」', first.go);
  ok(/第 ?16 ?掷/.test(first.go), '钮已报第 16 掷', first.go);
  ok(/圆顿妙观/.test(first.go), '钮已报现居位名（取已转简繁的 label）', first.go);
  ok(/^新开一局/.test(first.links), '细字行首项＝新开一局', first.links);

  console.log('\n【二 零翻面 · 就绪前后逐字相同】（本次的要害）');
  const gotReady = await pumpToReady(page);
  ok(gotReady, '主包已就绪（.ready 已加）');
  const after = await snap(page);
  ok(first.go === after.go, '主钮文案就绪前后逐字相同', `前=[${first.go}] 后=[${after.go}]`);
  ok(first.links === after.links, '细字行就绪前后逐字相同', `前=[${first.links}] 后=[${after.links}]`);
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 三 无存局：静态文案本就对，同样不得改口 ────────────────────────────
console.log('\n【三 无存局 · 亦零翻面】');
{
  const { page, ctx, errs } = await open({ zh: 's', sfpHelp: true });
  const first = await snap(page);
  ok(/开始行谱/.test(first.go), '钮题「开始行谱」', first.go);
  ok(!/新开一局/.test(first.links), '细字行无「新开一局」（无局可弃）', first.links);
  const gotReady = await pumpToReady(page);
  ok(gotReady, '主包已就绪');
  const after = await snap(page);
  ok(first.go === after.go, '主钮文案就绪前后逐字相同', `前=[${first.go}] 后=[${after.go}]`);
  ok(first.links === after.links, '细字行就绪前后逐字相同', `前=[${first.links}] 后=[${after.links}]`);
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 四 档坏不炸：内联读档一律 try/catch，坏档退回无存局之形 ──────────────
console.log('\n【四 档坏 · 页面照常起】');
{
  const { page, ctx, errs } = await open('{{{ 这不是 JSON');
  const first = await snap(page);
  ok(/开始行谱/.test(first.go), '坏档退回「开始行谱」，不空钮不报错', first.go);
  ok(errs.length === 0, '无脚本报错', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 五 繁体设置：静态字面亦须首帧即繁 ───────────────────────────────────
// 位名靠 label（sfpSave 存时已转），钮上的固定字面与题名／副题／细字行靠 data-t 那一份。
// 二者缺一，繁体用户就绪时都会看见一次简→繁的当众改口。
console.log('\n【五 繁体设置 · 首帧即繁，亦零翻面】');
{
  const { page, ctx } = await open({
    zh: 't', sfpHelp: true,
    sfp: { pos: '圓頓妙觀', n: 3, label: '圓頓妙觀', hist: [], seenD: [], trail: ['圓頓妙觀'] },
  });
  const first = await page.evaluate(() => ({
    go: (document.querySelector('#bootGo')?.innerText || '').replace(/\s+/g, ' ').trim(),
    links: (document.querySelector('#bootLinks')?.innerText || '').replace(/\s+/g, ' ').trim(),
    name: document.querySelector('#bootName')?.textContent || '',
    sub: document.querySelector('#bootSub')?.textContent || '',
  }));
  ok(/圓頓妙觀/.test(first.go), '首帧即繁体位名（label）', first.go);
  ok(/續擲上局/.test(first.go) && /現居/.test(first.go) && /擲$/.test(first.go), '钮上固定字面亦繁', first.go);
  ok(/新開一局/.test(first.links) && /大廳/.test(first.links), '细字行亦繁（data-t）', first.links);
  ok(first.name === '十法界須彌山世界', '题名亦繁', first.name);
  ok(/佛經中的宇宙/.test(first.sub) && /修行對局/.test(first.sub), '副题亦繁', first.sub);
  const gotReady = await pumpToReady(page);
  const after = await page.evaluate(() => ({
    go: (document.querySelector('#bootGo')?.innerText || '').replace(/\s+/g, ' ').trim(),
    links: (document.querySelector('#bootLinks')?.innerText || '').replace(/\s+/g, ' ').trim(),
    name: document.querySelector('#bootName')?.textContent || '',
    sub: document.querySelector('#bootSub')?.textContent || '',
  }));
  // 未取到就绪态时不得拿「就绪前 vs 就绪前」当零翻面报过——那是空转，比红还坏
  if (!gotReady) {
    console.log('  · 本环境未取到就绪态（无头 WebGL 首帧受阻）——此节零翻面比对跳过，不计通过');
  } else {
    ok(first.go === after.go, '繁体档主钮零翻面', `前=[${first.go}] 后=[${after.go}]`);
    ok(first.links === after.links, '繁体档细字行零翻面', `前=[${first.links}] 后=[${after.links}]`);
    ok(first.name === after.name && first.sub === after.sub, '繁体档题名与副题零翻面',
      `前=[${first.name}/${first.sub}] 后=[${after.name}/${after.sub}]`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
