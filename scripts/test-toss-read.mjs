// 详读卡验收（2026-08-08 重定位后）。
// 缘起：本项目是佛经教理的教学。读者读不懂判词卡才点「详读」——他要问的是
//   「当下这一位的教理、名相是什么意思」，不是「下一步去哪」。故详读卡改讲当下所在之位：
//   白话领起句 → 明细行 → 他经补注 → 本位轮相说明；本掷缘由不再重述（判词卡已说）。
// 先启动 `npm run dev`，再运行：npm run test:toss-read
import { chromium } from 'playwright-core';
import { SFP_POS_BAIHUA } from '../src/sfp-pos-baihua.js';
import { ZH_T2S } from '../src/zh-conv.js';
// 卡面文字随简繁设置折算（默认折简），而手译本以繁体存——比对前一律归简，
// 否则「八背捨觀」与屏上的「八背舍观」永远对不上，报的是假错。
const t2s = (s) => [...String(s || '')].map((c) => ZH_T2S[c] || c).join('');

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let passed = 0, failed = 0;
const ok = (c, n, x = '') => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${x ? ` — ${x}` : ''}`); } };

const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const isRes = (s) => /Failed to load resource/i.test(s);
await page.goto(UI_BASE, { waitUntil: 'commit' });
// dev 下 vite 的 HMR 可能在开局重载一次页面（实测 sfp-glyph-canon.js 触发两次 page reload），
// waitForFunction 若正撞上重载会一直悬到超时。先静置片刻让重载落定，再等钩子。
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => typeof window.__tossRead === 'function', undefined,
  { timeout: 120000, polling: 500 });

// 取三位有代表性的：补注最厚者、明细行最多者、原文最长者
const CASES = [
  { to: '下品下生', label: '有他经补注（《觀經》九品因行）' },
  { to: '八背捨觀', label: '明细四行、原文最长' },
  { to: '初信心', label: '短位注' },
];
const got = [];
for (const c of CASES) {
  const r = await page.evaluate(async (ctx) => {
    window.__tossRead({ c: '阿佛', from: '上品十惡', to: ctx.to, evidence: null });
    await new Promise((r2) => setTimeout(r2, 420));
    const panel = document.querySelector('.overlay .panel');
    if (!panel) return { open: false };
    const body = panel.querySelector('.body');
    const out = {
      open: true,
      title: (panel.querySelector('h2') || {}).textContent || '',
      meta: (body.querySelector('.cbMeta') || {}).textContent || '',
      lead: (body.querySelector('.cSec .qp') || {}).textContent || '',
      nRows: body.querySelectorAll('.cSec .nRow').length,
      nExt: body.querySelectorAll('.cSec .cExt').length,
      extTag: (body.querySelector('.cSec .cExt .ctag') || {}).textContent || '',
      gls: body.querySelectorAll('.gls').length,
      moves: body.querySelectorAll('details.sec').length,
      movesTitle: (body.querySelector('details.sec summary') || {}).textContent || '',
      movesOpen: body.querySelector('details.sec') ? body.querySelector('details.sec').open : null,
      askBtn: (panel.querySelector('#trAsk') || {}).textContent || '',
      // 本掷缘由不该再出现：去向条与分层缘由是判词卡的活
      hasRoute: !!body.querySelector('.rdRoute, .rdGlyph'),
    };
    const x = document.querySelector('.overlay .ovClose') || panel.querySelector('#trOk');
    if (x) x.click();
    await new Promise((r2) => setTimeout(r2, 200));
    return out;
  }, c);
  got.push({ ...c, ...r });
}

console.log('\n【一 详读卡讲的是「当下这一位」】');
ok(got.every((g) => g.open), '三例皆能开卡');
ok(got.every((g) => t2s(g.title).includes(t2s(g.to))), '卡题即位名（不再是「掷得某相」）',
  got.map((g) => g.title).join(' | '));
ok(got.every((g) => /第.+门/.test(g.meta) && /卷第/.test(g.meta)), '词头有门名与卷次', got.map((g) => g.meta).join(' | '));

console.log('\n【二 教理内容：领起句 → 明细行 → 补注】');
ok(got.every((g) => g.lead.length > 8), '皆有白话领起句');
const lead0 = got[0];
ok(t2s(lead0.lead).replace(/\s/g, '').startsWith(t2s(SFP_POS_BAIHUA[lead0.to].v).slice(0, 8).replace(/\s/g, '')),
  '领起句取自手译本', lead0.lead.slice(0, 20));
const rowCase = got.find((g) => g.to === '八背捨觀');
ok(rowCase && rowCase.nRows === (SFP_POS_BAIHUA['八背捨觀'].rows || []).length,
  '明细行数与手译本相符', rowCase ? `卡 ${rowCase.nRows}` : '');
const extCase = got.find((g) => g.to === '下品下生');
ok(extCase && extCase.nExt === 1, '他经补注独立成段', extCase ? `${extCase.nExt} 段` : '');
ok(extCase && /《[^》]+》/.test(extCase.extTag), '补注段题标出所引书名', extCase ? extCase.extTag : '');

console.log('\n【三 本位轮相说明已接入】');
ok(got.every((g) => g.moves === 1), '皆有轮相说明段');
ok(got.every((g) => /轮相说明/.test(g.movesTitle) && /\d+\s*组/.test(g.movesTitle)), '段题标出组数',
  got.map((g) => g.movesTitle).join(' | '));
ok(got.every((g) => g.movesOpen === false), '默认折叠——教理在前，棋制收着');

console.log('\n【四 名相可点、本掷缘由不重述】');
ok(got.every((g) => g.gls > 0), '名相浮标在详读卡上生效', got.map((g) => `${g.to}:${g.gls}`).join(' '));
ok(got.every((g) => !g.hasRoute), '不再重述本掷去向与缘由（判词卡已说）');
ok(got.every((g) => g.askBtn.includes('问')), '底部为「问 AI」', got[0].askBtn);

console.log('\n【五 无脚本报错】');
const real = errors.filter((e) => !isRes(e));
ok(real.length === 0, '全程无脚本报错', real.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
