// 選佛譜独立阅读页（read.html）接线冒烟：真浏览器开页、两档切换、目录、路由、简繁、主题、进度、问谱。
// 页面无 WebGL——2026-08-12 阅读器迁出游戏浮层后，本测试不再需要催帧/CDP 截图那套无头工作法
// （那套坑的来历见 git 里本文件的前一版头注）。唯第八段回到游戏页验跳转，仍要催帧。
// 第九段（问谱）需要 8788 上有问谱 worker：不在则本测试自起 wrangler dev、测毕自收；
// 所发问句只用身份自陈一问（identity 路零生成），不烧模型钱。
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const UI = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (x ? ' — ' + x : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const IGNORE = /favicon\.ico/;
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.location().url || '')) errs.push(m.text()); });
const miss = [];
page.on('response', (r) => { if (r.status() >= 400 && !IGNORE.test(r.url())) miss.push(r.status() + ' ' + r.url()); });

await page.goto(UI + '/read.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.art-title', { timeout: 30000 });
await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}' });
const tap = async (sel, idx = 0) => {
  const hit = await page.evaluate(([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) return false; e.click(); return true; }, [sel, idx]);
  if (!hit) throw new Error('未找到可点元素：' + sel + '[' + idx + ']');
  await wait(200);
};

console.log('【一 · 页面骨架（wenchao 纸墨形制）】');
ok(!!await page.locator('.topbar').count(), '顶栏在');
ok((await page.locator('#topbar-title').textContent()) === '选佛谱', '题名三字「选佛谱」（2026-08-12 改，简体态）');
ok((await page.locator('.mode-bar .seg').count()) === 2, '两档开关两枚（原文／白话）');
const t0 = await page.locator('.art-title').textContent();
ok(!!t0, '节题非空：' + t0);
ok(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Noto Serif SC')), '正文宋体栈（Noto Serif SC 领队）');
ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(246, 241, 230)'), '宣纸底 #f6f1e6');

console.log('【二 · 两档切换】');
await tap('.mode-bar .seg', 0);                     // 原文
ok(await page.locator('.art-body .verse').count() > 0, '原文档有原文');
ok(await page.locator('.art-body .rdP, .art-body .rdRow').count() === 0, '原文档无白话');
await tap('.mode-bar .seg', 1);                     // 白话
ok(await page.locator('.art-body .rdP, .art-body .rdRow').count() > 0, '白话档有白话');

console.log('【三 · 位节：廿一相表只在白话档】');
await page.evaluate(() => { location.hash = '#' + encodeURIComponent('北俱盧洲'); });
await wait(300);
ok((await page.locator('.art-title').textContent() || '').includes('北俱'), '#位名 直达位节：' + await page.locator('.art-title').textContent());
ok(await page.locator('.art-body .rdV').count() === 21, '白话档廿一相表 21 行');
ok(await page.locator('.art-body .rdVq').count() === 0, '判词引文已撤（.rdVq 全无）');
await tap('.mode-bar .seg', 0);
ok(await page.locator('.art-body .rdV').count() === 0, '原文档整个不出廿一相表');
ok(await page.locator('.art-body .verse').count() > 0, '原文档照原书连读');
await tap('.mode-bar .seg', 1);

console.log('【四 · 目录抽屉与篇间导航】');
await tap('#btn-nav');
ok(await page.evaluate(() => document.querySelector('#drawer-left').classList.contains('open')), '目录抽屉已开');
ok((await page.locator('#nav-tree .nav-item').count()) === 239, '目录 239 目');
ok((await page.locator('#nav-tree .nav-item.active').count()) === 1, '当前节高亮一处');
ok((await page.locator('#nav-stats').textContent() || '').includes('239'), '抽屉头计数：' + await page.locator('#nav-stats').textContent());
await page.evaluate(() => { document.querySelector('#nav-search').value = '五戒'; document.querySelector('#nav-search').dispatchEvent(new Event('input')); });
await wait(200);
const hits = await page.locator('#nav-tree .nav-item').count();
ok(hits >= 1 && hits < 30, `搜索「五戒」命中 ${hits} 目`);
await tap('#nav-tree .nav-item', 0);
ok((await page.locator('.art-title').textContent() || '').includes('五戒'), '点目录项落到：' + await page.locator('.art-title').textContent());
ok(!await page.evaluate(() => document.querySelector('#drawer-left').classList.contains('open')), '点后抽屉自关');
const hBefore = await page.evaluate(() => location.hash);
await tap('#art-next');
ok(await page.evaluate((h) => location.hash !== h, hBefore), '下一节后 hash 已变：' + decodeURIComponent(await page.evaluate(() => location.hash)));
await page.goBack(); await wait(300);
ok((await page.locator('.art-title').textContent() || '').includes('五戒'), '浏览器返回=回上一节（hash 路由）');

console.log('【五 · 名相弹卡】');
const glsN = await page.locator('.art-body .gls').count();
ok(glsN > 0, `名相浮标 ${glsN} 枚`);
await tap('.art-body .gls');
ok(!await page.evaluate(() => document.querySelector('#sheet').hidden), '点名相开注释弹卡');
const sheetH4 = await page.locator('#sheet-body h4').textContent();
ok(!!sheetH4, '弹卡有词头：' + sheetH4);
await page.evaluate(() => document.querySelector('#sheet-backdrop').click());
await wait(150);
ok(await page.evaluate(() => document.querySelector('#sheet').hidden), '点遮罩收卡');

console.log('【六 · 底本不被简繁转换改字】');
// 〈敘選佛譜敘〉的「余年二十一歲」：余是第一人称，非剩餘。ZH_S2T 有词组「余年→餘年」，
// 底本一旦误过 S2T 即成「餘年」（名单钉在 npm run check:zh 检三）。此处两态各验一次。
await page.evaluate(() => { location.hash = '#' + encodeURIComponent('敘選佛譜敘'); });
await wait(300);
await tap('.mode-bar .seg', 0);
const rawSimp = await page.locator('.art-body .verse').first().textContent() || '';
ok(/余年二十一/.test(rawSimp), '简体态原文作「余年二十一」：' + (rawSimp.match(/.{0,4}年二十一.{0,3}/) || ['（未见）'])[0]);
await tap('.mb-aa');                                 // Aa 弹层 → 繁體
await tap('#cc-trad');
await wait(300);
const rawTrad = await page.locator('.art-body .verse').first().textContent() || '';
ok(/余年二十一/.test(rawTrad) && !/餘年二十一/.test(rawTrad),
  '繁体态原文仍作「余年」未成「餘年」：' + (rawTrad.match(/.{0,4}年二十一.{0,3}/) || ['（未见）'])[0]);
ok(/歲/.test(rawTrad), '繁体态底本正字在（歲）');
const segTrad = await page.locator('.mode-bar .seg').nth(1).textContent();
ok(segTrad === '白話', '界面文案随转繁体：' + segTrad);
await tap('#cc-simp');
await wait(300);
const segSimp = await page.locator('.mode-bar .seg').nth(1).textContent();
ok(segSimp === '白话', '切回简体：' + segSimp);

console.log('【七 · 阅读设置（字号·主题）与进度】');
await tap('.mb-aa');
await tap('#font-inc');
ok(await page.evaluate(() => document.documentElement.style.getPropertyValue('--fs')) === '18px', '字号 A＋ → 18px');
await tap('#theme-night');
ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'night', '墨夜主题已挂 data-theme');
ok(JSON.parse(await page.evaluate(() => localStorage.getItem('sfpr.theme'))) === 'night', '主题已存 sfpr.theme');
await tap('#theme-paper');
await page.evaluate(() => document.querySelector('.aa-mask').click());
const stAt = await page.evaluate(() => JSON.parse(localStorage.getItem('sfpr.at')));
const stDone = await page.evaluate(() => JSON.parse(localStorage.getItem('sfpr.done')));
ok(typeof stAt === 'number' && Array.isArray(stDone) && stDone.length > 0, `进度已存：at=${stAt} done=${stDone.length}`);

console.log('【九 · 位名浮标就地翻节（不跨页回游戏）】');
// 2026-08-12 发起人点单「位名→位卡的派发推到全站」。本页无卡制，但一位即一节
//   （239 节＝四篇＋十五门＋二百二十位），那一节就是本页的「位卡」。故点位名＝翻到那一节，
//   而不是跨页把读者拽回三维游戏（那要重载整个 WebGL 主包，长读之中最忌）。
// 反证一并留下：跳完之后注释弹卡须仍是收的——否则就成了「既翻页又弹签」两件事同时发生。
{
  // 本节须在白话档取词（前面几节切过档，位注白话里的位名只在白话档现身），
  //   且照本本通例用 location.hash 换节，不用 page.goto——同文档换 hash 不触发导航事件，
  //   waitForSelector 会空等到超时（2026-08-12 初版即栽在此）。
  const jumpFrom = async (key, re) => {
    await tap('.mode-bar .seg', 1);
    await page.evaluate((k) => { location.hash = '#' + encodeURIComponent(k); }, key);
    await wait(400);
    return page.evaluate((src) => {
      const rx = new RegExp(src);
      const before = decodeURIComponent(location.hash.slice(1));
      const hit = Array.from(document.querySelectorAll('.art-body .gls')).find((g) => rx.test(g.textContent.trim()));
      if (!hit) return { before, term: '(无)' };
      const term = hit.textContent.trim(); hit.click();
      return { before, term, after: decodeURIComponent(location.hash.slice(1)),
        samePage: location.pathname.endsWith('read.html'),
        sheetShut: document.querySelector('#sheet')?.hidden === true,
        title: (document.querySelector('.art-title')?.textContent || '').trim() };
    }, re);
  };
  // 〈根本四禪〉一节提及〈四無量心〉；第一门门义提及〈見取〉
  const a = await jumpFrom('根本四禪', '^(四无量心|四無量心|四无色定|四無色定)$');
  ok(a.term !== '(无)' && a.after && a.after !== a.before, `位节内点位名即翻到那一节：${a.before} → ${a.after}`);
  ok(a.samePage === true, '仍在 read.html，未跨页回游戏');
  ok(a.sheetShut === true, '注释弹卡未同时弹出（一击一去处）');
  ok((a.title || '').includes(a.term) || a.after === a.term, '落节标题即该位', `${a.title} / ${a.after}`);
  const b = await jumpFrom('door:1', '^(见取|見取)$');
  ok(b.term !== '(无)' && b.after === '見取' && b.samePage, `门节内点位名亦翻节：${b.before} → ${b.after}`);
}

console.log('【八 · 游戏侧入口跳转（门卡「读本门原文」）】');
// 游戏页有 WebGL：无头下主包就绪须催帧（CDP 直取，缘由见 scripts/_boot.mjs 与旧版本文件头注）
const game = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await game.goto(UI, { waitUntil: 'commit', timeout: 60000 });
const cdp = await game.context().newCDPSession(game);
let booted = false;
for (let i = 0; i < 120; i++) {
  await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png' }), new Promise((r) => setTimeout(r, 900))]).catch(() => {});
  await wait(200);
  booted = await game.evaluate(() => typeof window.__openDoor === 'function').catch(() => false);
  if (booted) break;
}
ok(booted, '游戏主包就绪');
if (booted) {
  await game.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await game.evaluate(() => document.getElementById('boot')?.classList.add('bye'));
  await game.evaluate(() => window.__openDoor(2, {}));
  await wait(400);
  ok(await game.locator('#dcRead').count() === 1, '门卡「读本门原文」钮在');
  await game.evaluate(() => document.querySelector('#dcRead')?.click());
  // 先等新页渲染成，再验 URL——游戏页 WebGL 占帧，导航提交会迟；提交前 page.url() 还是旧页。
  // 给到 120s：这一跳要 dev server 现编 read.html 那一支模块图，冷启实测可近半分钟
  //   （同 test-v90-port／test-ui-e2e 之放宽，报「超时」看着像页面坏了，其实只是没编完）。
  await game.waitForSelector('.art-title', { timeout: 120_000 });
  // hash 里的 door:2 何形皆认——%3A 与冒号两种呈现是同一 URL
  ok(/read\.html#door(%3A|:)2$/.test(game.url()), '点钮跳独立页并带门锚：' + game.url().split('/').pop());
  ok((await game.locator('.art-title').textContent() || '').includes('法道流弊'), '落在第二门：' + await game.locator('.art-title').textContent());
}
await game.close();

console.log('【十 · 问谱抽屉（wenchao 问文钞形制）】');
// 问谱 worker：8788 不在则自起 wrangler dev（读 agent/worker/.dev.vars），测毕自收
let agentProc = null;
const agentUp = async () => {
  try { const r = await fetch('http://localhost:8788/v1/health'); return (await r.json()).ok === true; } catch { return false; }
};
if (!(await agentUp())) {
  agentProc = spawn('npx', ['wrangler', 'dev', '--config', 'agent/worker/wrangler.toml', '--port', '8788'],
    { stdio: 'ignore', detached: false });
  let up = false;
  for (let i = 0; i < 40; i++) { await wait(1000); if (await agentUp()) { up = true; break; } }
  ok(up, '问谱 worker 已自起（wrangler dev :8788）');
}
{
  // 预种一轮已答会话（带引文卡）：验渲染回放、角标、出处卡与「读原文」跳节——纯前端，零模型开销
  await page.evaluate(() => {
    localStorage.setItem('sfpr.aiSession', JSON.stringify([{
      u: '上品十恶是什么', a: '按谱曰，纯从分别见惑所发恶业，名为上品十恶，是地狱因[1]。', done: true, d: false, v: null,
      p: [{ title: '上品十惡', text: '譜曰。十惡者。一殺生。二偷盜。三邪淫。……純從分別見惑所發惡業。名為上品十惡。故是地獄因也。', ref: '《選佛譜》卷第一・上品十惡・L45' }],
    }]));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.art-title', { timeout: 30000 });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}' });
  await tap('#btn-ask');
  ok(await page.evaluate(() => document.querySelector('#drawer-ask').classList.contains('open')), '问谱抽屉已开');
  ok((await page.locator('#ai-chips .chip-btn').count()) === 4, '预设问 chips 四枚');
  ok(await page.locator('.ai-welcome').count() === 1, '欢迎引导在');
  ok((await page.locator('.ai-msg.bot').count()) === 1 && (await page.locator('.ai-cite').count()) === 1, '预种会话已回放，角标 [1] 在');
  await tap('.ai-cite');
  ok(!await page.evaluate(() => document.querySelector('#sheet').hidden), '点角标开出处卡');
  ok(/純從分別見惑/.test(await page.locator('#sheet-body .cite-text').textContent() || ''), '出处卡是逐字原文');
  ok(await page.locator('#cite-go').count() === 1, '出处卡有「读原文」跳节钮');
  await tap('#cite-go');
  await wait(400);
  ok((await page.locator('.art-title').textContent() || '').includes('上品十恶'), '跳到〈上品十恶〉本节：' + await page.locator('.art-title').textContent());
  ok(!await page.evaluate(() => document.querySelector('#drawer-ask').classList.contains('open')), '跳节后抽屉自收');
  // 真问一发（identity 路零生成、零成本）：验 vite 代理 → wrangler dev → ndjson 流式全链路
  await tap('#btn-ask');
  await page.evaluate(() => { const t = document.querySelector('#ai-text'); t.value = '你是谁'; });
  await page.evaluate(() => document.querySelector('#ai-form').dispatchEvent(new Event('submit')));
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('.ai-msg.bot')].pop();
    return b && /问谱/.test(b.textContent || '');
  }, null, { timeout: 30000 }).catch(() => {});
  const lastBot = await page.evaluate(() => ([...document.querySelectorAll('.ai-msg.bot')].pop() || {}).textContent || '');
  ok(/问谱|依.*谱文作答/.test(lastBot), '真问「你是谁」经全链路答自陈：' + lastBot.slice(0, 30));
  const sessStored = await page.evaluate(() => JSON.parse(localStorage.getItem('sfpr.aiSession') || '[]'));
  ok(sessStored.length === 2 && sessStored[1].done, '会话已存续（sfpr.aiSession 两轮）');
}
if (agentProc) { agentProc.kill(); }

console.log('\n资源 404：' + (miss.length ? miss.join(', ') : '无'));
console.log('错误：' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : '无'));
console.log(`\n${fail ? '✗' : '✓'} 通过 ${pass}　失败 ${fail}`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
