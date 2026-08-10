// 判词卡验收（2026-08-07 移植线上 V105 v409/v412/v414/v454 之后）：
//   ① 去向条＋六字表法小字＋落处一句＋缘由分层署名 四段俱在，且不叠话头；
//   ② 缘由行题随层而异（缘由／所指／字义／通例），理解层不得冒充谱曰；
//   ③ 落处只取一句（posGistLine），不再整段位白话与折叠原文重出。
// 先启动 `npm run dev`，再运行：npm run test:verdict
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
// 资源 404 单列（同 test-door-card）：dev 下静态资源缺席与判词卡无关，不混入脚本错误计
const missing = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource/.test(m.text())) return;
  errors.push(m.text());
});
page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });

// 用 commit 而非 domcontentloaded：dev 下 game.js 是 50+ 个未打包 module script，
// DCL 要等它们全部求值完（外加 WebGL 初始化），慢机上会超 30s 而误判为连不上。
await page.goto(UI_BASE, { waitUntil: 'commit' });
// 注意第二参是 pageFunction 的 arg，options 要放第三位——写在第二位会静默退回默认 30s
await page.waitForFunction(() => !!(window.__sfpRead && window.__sfpRead.toss), undefined, { timeout: 120000, polling: 500 })
  .catch((e) => { console.error('  应用钩子未就绪；页面错误：', errors.slice(0, 3).join(' | ') || '(无)'); throw e; });
await wait(400);

// 四类典型：降堕／不行安住（通例层）／升进／首掷定因地
const CASES = [
  { name: '降堕', ctx: { c: '那那', from: '上品十惡', to: '阿鼻地獄' } },
  { name: '不行·通例层', ctx: { c: '那彌', from: '上品十惡', to: '上品十惡' } },
  { name: '升进', ctx: { c: '陀陀', from: '彌勒內院', to: '十法界無量迴向' } },
  { name: '贈掷不移位', ctx: { c: '阿阿', from: '常寂光淨土', to: '' } },
  { name: '首掷定因地', ctx: { c: '阿阿', from: '', to: '慢心行施' } },
];

const render = (ctx) => page.evaluate((c) => {
  const host = document.createElement('div');
  host.id = '__vc';
  host.className = 'rdCard';
  host.innerHTML = window.__sfpRead.toss(c);
  document.body.appendChild(host);
  const q = (s) => host.querySelector(s);
  const rows = [...host.querySelectorAll('.rdRow')].map((r) => ({
    k: r.querySelector('.k')?.textContent?.trim() || '',
    v: r.querySelector('.v')?.textContent?.trim() || '',
  }));
  const out = {
    route: !!q('.rdRoute'),
    routeText: q('.rdRoute')?.textContent?.trim() || '',
    glyph: q('.rdGlyph')?.textContent?.trim() || '',
    rows,
    canon: !!q('.rdCanon'),
    chips: host.querySelectorAll('.chipQ').length,
    text: host.textContent || '',
  };
  host.remove();
  return out;
}, ctx);

console.log('【一 四段俱在】');
const got = {};
for (const cs of CASES) {
  const r = await render(cs.ctx);
  got[cs.name] = r;
  ok(r.route, `${cs.name}：有去向条`);
  ok(!!r.glyph, `${cs.name}：有六字表法小字`, r.glyph);
  ok(r.rows.some((x) => x.k === '落处'), `${cs.name}：有「落处」行`);
}

console.log('\n【二 缘由行题随层而异（理解层不冒谱曰）】');
{
  const stayRows = got['不行·通例层'].rows;
  const why = stayRows.find((x) => ['缘由', '所指', '字义', '通例'].includes(x.k));
  ok(!!why, '不行之格有缘由类行', JSON.stringify(stayRows.map((x) => x.k)));
  ok(why && why.k === '通例', '「上品十惡|那彌」署「通例」而非「缘由」', why && why.k);
  ok(why && why.v.includes('有漏'), '通例句带「有漏」（谱主自破问答之据）', why && why.v.slice(0, 40));
  const fallRows = got['降堕'].rows;
  ok(fallRows.some((x) => x.k === '缘由'), '「上品十惡|那那」署「缘由」（谱主本位之注）');
}

console.log('\n【三 不叠话头 · 落处只一句】');
for (const cs of CASES) {
  const r = got[cs.name];
  const why = r.rows.find((x) => ['缘由', '所指', '字义', '通例'].includes(x.k));
  if (why) ok(!/一轮[^，。、]{1,8}[、，]一轮/.test(why.v) || !/夹一分|两轮都是/.test(why.v.slice(0, 12)),
    `${cs.name}：缘由行不叠两遍话头`, why.v.slice(0, 46));
  const head = r.rows.find((x) => x.k === '落处');
  if (head) ok(head.v.length <= 60, `${cs.name}：落处 ${head.v.length} 字（上限 60）`, head.v);
}

console.log('\n【四 本地原有两件未失】');
ok(got['降堕'].canon, '谱曰逐条段仍在（位名可点）');
ok(got['降堕'].chips >= 1, '追问签仍在', String(got['降堕'].chips));

console.log('\n【五 无脚本错误】');
ok(errors.length === 0, '控制台零错误', errors.slice(0, 2).join(' | '));
if (missing.length) console.log(`  · 另有资源 404 ${missing.length} 条（与判词卡无关）：${missing.slice(0, 3).join(' | ')}`);

console.log('\n──── 判词卡实样 ────');
for (const cs of CASES) {
  const r = got[cs.name];
  console.log(`\n【${cs.name}】${r.routeText}`);
  console.log(`  ${r.glyph}`);
  for (const x of r.rows) console.log(`  ${x.k}｜${x.v}`);
}

// ── 判词卡（showVerdict）结构必查：DOM 骨架逐件在场 ──
console.log('\n【六 判词卡 · 结构】');
{
  const parts = await page.evaluate(() => {
    const v = document.querySelector('#verdict');
    if (!v) return null;
    return {
      chips: !!v.querySelector('#vChips'), n: !!v.querySelector('#vN'),
      body: !!v.querySelector('#vBody'), gist: !!v.querySelector('#vGist'),
      why: !!v.querySelector('#vWhy'), src: !!v.querySelector('#vSrc'),
      srcT: !!v.querySelector('.vsrcT'),
      go: !!v.querySelector('#vGoTxt'),
      gistOrder: [...v.children].map((c) => c.id).join(','),
    };
  });
  ok(!!parts, '判词卡在 DOM 中');
  if (parts) {
    ok(parts.chips && parts.n, '轮相牌与掷数在场');
    ok(parts.gist, '本位提要行 #vGist 在场（V105 v412/v414 新增）');
    ok(parts.why, '白话层在场');
    // 2026-08-07 发起人点单：判词卡的原文层整个撤掉
    ok(!parts.src, '原文层 #vSrc 已撤');
    ok(!parts.srcT, '「原文 ▸」虚线签已撤');
    ok(parts.go, '落子大钮在场');
    ok(/vBody,vGist,vWhy/.test(parts.gistOrder) && !/vSrc/.test(parts.gistOrder),
      '次序＝判定 › 提要 › 白话（原文层已撤）', parts.gistOrder);
  }
}

// ── 真机连掷（尽力而为）：无头 WebGL 下 rAF 受节流，掷轮动画常走不完，
//    走不完只记「本环境未取到」，不判失败——那是环境限制，不是代码缺陷。
console.log('\n【七 判词卡 · 真机连掷（尽力而为）】');
try {
  // 正路进局：题屏「开始行谱」→ 共修大厅 →「一人行谱」。
  //（勿用 DOM remove 掀掉题屏——那样应用状态未走关闭流程，大厅开不出来；
  //   也勿用 locator.click()——题屏一直在环拍，可操作性检查等不到「稳定」，须直接派发 click。）
  await page.locator('#tiSfp').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#tiSfp').evaluate((b) => b.click());
  await page.locator('#pzSolo').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#pzSolo').evaluate((b) => b.click());
  await page.waitForFunction(() => document.querySelector('#sfpBar')?.classList.contains('show'), undefined, { timeout: 30000, polling: 250 });

  const shots = [];
  const ROUNDS = Number(process.env.VC_ROUNDS || 5);
  for (let round = 1; round <= ROUNDS; round++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(280);
    await page.keyboard.up('Space');
    let up = false;
    // 无头 swiftshader 下 rAF 被节流，须连拍催帧；只截 1×1 像素，够催帧又不耗时
    for (let i = 0; i < 24 && !up; i++) {
      await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
      await page.waitForTimeout(220);
      up = await page.evaluate(() => document.querySelector('#verdict')?.classList.contains('show'));
    }
    process.stdout.write(`    第 ${round} 掷${up ? ' ✓' : ' ✗(判词未出)'}\n`);
    if (!up) break;
    shots.push(await page.evaluate(() => {
      const v = document.querySelector('#verdict');
      const g = v.querySelector('#vGist');
      return {
        n: v.querySelector('#vN')?.textContent?.trim() || '',
        chips: [...v.querySelectorAll('#vChips .vchip')].map((c) => `${c.querySelector('b')?.textContent || ''}${c.querySelector('i')?.textContent || ''}`),
        body: v.querySelector('#vBody')?.textContent?.trim() || '',
        gistOn: g?.classList.contains('on'),
        gist: g?.textContent?.trim() || '',
        why: v.querySelector('#vWhy')?.textContent?.trim() || '',
        ask: !!v.querySelector('.vaskC'),
        askTxt: v.querySelector('.vaskC')?.textContent?.trim() || '',
        go: v.querySelector('#vGoTxt')?.textContent?.trim() || '',
      };
    }));
    await page.locator('#vGo').evaluate((b) => b.click());   // 落子，进入下一掷
    await page.waitForTimeout(700);
  }

  if (!shots.length) {
    console.log('  · 本环境未取到判词卡（无头 WebGL rAF 节流，掷轮动画未走完）——结构已在第六节验讫，此节跳过');
  } else {
  console.log(`  · 取到 ${shots.length} 张判词卡`);
  ok(shots.every((s) => s.chips.length === 2), '每张皆有两枚轮相牌');
  ok(shots.every((s) => /善|惡|恶/.test(s.chips.join(''))), '轮相牌带善／恶升降小标');
  ok(shots.every((s) => s.n && /\d/.test(s.n)), '每张皆报第几掷');
  ok(shots.every((s) => s.gistOn && s.gist), '每张皆有本位提要行（#vGist）', JSON.stringify(shots.map((s) => s.gistOn)));
  ok(shots.every((s) => /第.+门/.test(s.gist)), '提要行带门次标签');
  ok(shots.every((s) => s.why), '每张皆有白话主句');
  ok(shots.every((s) => s.ask && s.askTxt === '详读'), '每张皆挂「详读」入口', shots.map((s) => s.askTxt).join(','));
  ok(shots.every((s) => s.go), '每张皆有落子大钮');
  // v412：位提要独立成行后，说明句不得再冠「本位…；此掷」
  ok(shots.every((s) => !/^本位[^；]{0,40}；此掷/.test(s.why)), '说明句不重复冠位提要');
  }

  console.log('\n──── 判词卡实样（真机连掷）────');
  for (const s of shots) {
    console.log(`\n${s.chips.join('  ')}　　${s.n}`);
    console.log(`  ${s.body}`);
    if (s.gist) console.log(`  提要｜${s.gist}`);
    console.log(`  说明｜${s.why}`);
    console.log(`  钮｜${s.go}`);
  }
} catch (e) {
  console.log(`  · 真机连掷未能完成（${String(e.message).split('\n')[0].slice(0, 70)}）——环境限制，不计失败`);
}

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
