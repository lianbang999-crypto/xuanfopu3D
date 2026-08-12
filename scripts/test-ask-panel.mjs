#!/usr/bin/env node
// 游戏站「问」＝问谱 · 接线冒烟（2026-08-12 重做后立此一验）
//
// 【何以另立一评】问谱之验此前只在两处：agent/eval/ask-eval.mjs（后端 52 问）与
//   test-reader.mjs 第十节（阅读页抽屉全链路）。游戏站这一路是第三处落点——
//   它与阅读页共用内核（src/ask-core.js）却各有各的皮与事件，谁也验不到谁。
//   而旧「问」正是在这里烂掉的：后端 v3 已不返回 facts、不走定本路由，
//   前端却还渲判定条、挂「再讲开一点」、并列一份本地速查——线上看着有，其实全是死件。
//   故此评钉三件：① 旧件确已撤净　② 新面板形制与交互　③ 真问一发走通全链路。
//
// 所发问句只用身份自陈（identity 路，零检索零生成零成本），不烧模型钱。
// 需要 8788 上有问谱 worker：不在则本测试自起 wrangler dev，测毕自收。
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const UI = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (x ? ' — ' + x : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 问谱 worker：不在则自起
let agentProc = null;
const agentUp = async () => {
  try { return (await (await fetch('http://localhost:8788/v1/health')).json()).ok === true; } catch { return false; }
};
if (!(await agentUp())) {
  agentProc = spawn('npx', ['wrangler', 'dev', '--config', 'agent/worker/wrangler.toml', '--port', '8788'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await wait(1000); if (await agentUp()) break; }
}
const bye = async (code) => { if (agentProc) agentProc.kill(); process.exit(code); };

const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errs.push(m.text()); });

await page.goto(UI, { waitUntil: 'commit', timeout: 60000 });
// 游戏页 WebGL 占帧，无头下须催帧（同 test-reader.mjs 第八节）
const cdp = await page.context().newCDPSession(page);
let booted = false;
for (let i = 0; i < 120; i++) {
  await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png' }), new Promise((r) => setTimeout(r, 900))]).catch(() => {});
  await wait(200);
  booted = await page.evaluate(() => typeof window.__openReader === 'function').catch(() => false);
  if (booted) break;
}
if (!booted) { console.error('✗ 主包未就绪'); await browser.close(); await bye(1); }
await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
await page.evaluate(() => document.getElementById('boot')?.classList.add('bye'));
const tap = async (sel, idx = 0) => {
  const hit = await page.evaluate(([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) return false; e.click(); return true; }, [sel, idx]);
  if (!hit) throw new Error('未找到可点元素：' + sel + '[' + idx + ']');
  await wait(260);
};

console.log('【一 · 旧「问」诸件已撤净】');
{
  // 这些是旧双轨制的构件：后端 v3 起即无从渲染，留着只会让人以为还有那回事
  const dead = await page.evaluate(() => ({
    hook: !!(window.__sfpRead && (window.__sfpRead.chat || window.__sfpRead.rules || window.__sfpRead.cross || window.__sfpRead.practice)),
    css: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /\.sfpFacts|\.sfpExpand|\.cbA\b|\.cbU\b|\.cbStage/.test(r.selectorText || '')); } catch { return false; } }),
  }));
  ok(!dead.hook, '__sfpRead 的 chat／rules／cross／practice 四钩已撤');
  ok(!dead.css, '旧样式 .sfpFacts／.sfpExpand／.cbA／.cbU／.cbStage 已撤');
  ok(await page.evaluate(() => typeof window.__sfpRead?.toss === 'function'), '判词卡的 toss 钩仍在（它归判词卡，非「问」）');
}

console.log('【二 · 面板形制（极简三件）】');
await tap('#sfpAsk');
ok(await page.locator('.askPanel').count() === 1, '问谱面板已开');
ok((await page.locator('.askPanel h2').textContent() || '').startsWith('问谱'), '题作「问谱」：' + await page.locator('.askPanel h2').textContent());
ok(await page.locator('.askHello').count() === 1, '首屏引导一段');
ok(await page.locator('.askChips .chipQ').count() === 4, '预设问四枚');
ok(await page.locator('#askQ').count() === 1 && await page.locator('#askGo2').count() === 1, '输入条一件');
ok(await page.locator('.askFoot .gbtn').count() === 2, '页脚只两钮（新对话·关闭）');
{
  // 极简之实：面板里不该再有旧那些件
  const junk = await page.evaluate(() => {
    const p = document.querySelector('.askPanel');
    return { facts: p.querySelectorAll('.sfpFacts').length, expand: p.querySelectorAll('.sfpExpand').length,
      local: p.querySelectorAll('.cbLocal, details').length, bubble: p.querySelectorAll('.cbA, .cbU').length };
  });
  ok(junk.facts === 0 && junk.expand === 0 && junk.local === 0 && junk.bubble === 0,
    '面板内无判定条／再讲开／折叠速查／旧气泡', JSON.stringify(junk));
}

console.log('【三 · 真问一发（identity 路，零成本）】');
await page.evaluate(() => { document.querySelector('#askQ').value = '你是谁'; });
await tap('#askGo2');
await page.waitForFunction(() => /问谱/.test(document.querySelector('.askA')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
const ans = await page.evaluate(() => document.querySelector('.askA')?.textContent || '');
ok(/问谱|依.*谱文作答/.test(ans), '答语经全链路到达：' + ans.slice(0, 28));
ok(await page.locator('.askU').count() === 1, '问句一行在（右对齐，非气泡）');
ok(await page.locator('.askHello').count() === 0, '有问之后引导段让位');

console.log('【四 · 角标 → 出处 → 跳位】');
{
  // 种一条带引文的答语，验渲染与三段交互（不真问，省一次生成）
  await page.evaluate(() => document.querySelector('#askNew').click());
  await wait(200);
  await page.evaluate(() => {
    const g = window.__askProbe;
    g.log().push({ u: '上品十恶是什么', done: true, deg: false, drop: 0,
      a: '纯从分别见惑所发恶业，名为上品十恶，是地狱因[1]。',
      p: [{ title: '上品十惡', posName: '上品十惡', text: '譜曰。純從分別見惑所發惡業。名為上品十惡。故是地獄因也。', ref: '《選佛譜》卷第一・上品十惡・L45' }] });
    g.render();
  });
  ok(await page.locator('.ai-cite').count() === 1, '行内角标 [1] 已成按钮');
  await tap('.ai-cite');
  ok(await page.locator('.askCiteCard').count() === 1, '点角标即在本条答语下展出处');
  // 简体态下底本经 rawShow 折简（繁→简一对一，不改字）；繁体态则原样。两形皆收。
  const citeTxt = await page.locator('.askCiteCard .txt').textContent() || '';
  ok(/純從分別見惑|纯从分别见惑/.test(citeTxt), '出处是逐字原文（走 rawShow，非 zh）', citeTxt.slice(0, 24));
  ok(await page.locator('.askGo').count() === 1, '出处带跳位钮');
  await tap('.ai-cite');
  ok(await page.locator('.askCiteCard').count() === 0, '再点角标即收（同一枚开合）');
  await tap('.ai-cite');
  await tap('.askGo');
  await wait(400);
  // 位卡的题在 #cardName（非 .panel h2——那是各式浮层面板的题）
  const jumped = await page.evaluate(() => ({
    ask: !!document.querySelector('.askPanel'),
    kind: document.querySelector('#card')?.dataset?.kind || '',
    head: document.querySelector('#cardName')?.textContent || '',
  }));
  ok(!jumped.ask, '跳位时问谱面板已收');
  ok(jumped.kind === 'pos' && /上品十恶|上品十惡/.test(jumped.head), '跳到该位的位卡：' + jumped.head);
}

console.log('【五 · 出处的去处：位、门、无处可去三种】');
{
  // 上一节点了跳位，面板已收——先开回来
  await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
  await tap('#sfpAsk');
  // 后端 toPassages 于全文块的 posName 恒为空串，跳位全靠块题解析（askCiteTarget）。
  // 三种块题各验一次——位名／门题／卷首篇名（无卡可去者不得挂钮）。
  const probe = await page.evaluate(() => {
    const g = window.__askProbe;
    const mk = (title) => ({ title, posName: '', text: '譜曰。試文。', ref: '《選佛譜》・' + title });
    g.log().length = 0;
    g.log().push({ u: '试', a: '甲[1]乙[2]丙[3]。', done: true, deg: false, drop: 0,
      p: [mk('上品十惡'), mk('第十四淨土橫超門'), mk('敘選佛譜敘')] });
    g.render();
    const cites = [...document.querySelectorAll('.ai-cite')];
    const out = [];
    for (const c of cites) {
      c.click();
      const b = document.querySelector('.askCiteCard .askGo');
      out.push(b ? (b.dataset.kind + ':' + b.dataset.key) : '（无）');
      c.click();
    }
    return out;
  });
  ok(probe[0].startsWith('pos:'), '块题是位名 → 跳位卡：' + probe[0]);
  ok(probe[1] === 'door:14', '块题是门题 → 跳门卡（剥「第十四」后包含比对）：' + probe[1]);
  ok(probe[2] === '（无）', '卷首篇无卡可去 → 不挂跳位钮（不骗点击）：' + probe[2]);
}

console.log('\n错误：' + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : '无'));
console.log(`\n${fail ? '✗' : '✓'} 通过 ${pass}　失败 ${fail}`);
await browser.close();
await bye(fail || errs.length ? 1 : 0);
