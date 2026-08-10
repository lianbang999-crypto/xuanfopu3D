// 卡制总纲 v3 验收（2026-08-08 发起人定案：词头 · 正文 · 关联）：
//   ① 五种卡型（处所／位／门／辅标／段签）同走 renderEntry，段序恒为
//      词头小字 → 正文（白态／文态原地对调）→ 关联段；
//   ② v2 的三问栏（.cQ／.qk 固定问名）、读原文钮（.cbRead）、出处抽屉（.cbSrc）、
//      深读页（.rdPage）尽数撤净——卡上不得再见其一；
//   ③ 文白是一枚切换不是两层：点 .cSwap 即原地对调，原文段带逐字正文与出处；
//   ④ 关联段超三项才折叠，且段名上的数字须与展开后实见行数相符（旧制写 6 而实列 21 行）；
//   ⑤ 位卡撤假刻度：词头不得出现「第 N/220 位」，卡内不得有上一位／下一位翻页；
//   ⑥ 行法表不带缘由（4620 格缘由归 npm run export:rules 的总表）；
//   ⑦ 手机窄屏正文须占满宽（旧制 5.9em 问名栏吃掉四成）。
// 先启动 `npm run dev`，再运行：npm run test:card
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

const browser = await chromium.launch({
  headless: true, executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error' || /Failed to load resource/.test(m.text())) return;
  errors.push(m.text());
});
await page.goto(UI_BASE, { waitUntil: 'commit' });
await page.waitForFunction(
  () => ['__selNode', '__openDoor', '__auxCard', '__tenetCard'].every((k) => typeof window[k] === 'function'),
  undefined, { timeout: 120000, polling: 500 });
await page.waitForTimeout(800);

const probe = (sel) => page.evaluate((s) => {
  const r = document.querySelector(s);
  if (!r) return null;
  return {
    head: r.querySelector('.cbMeta')?.textContent?.trim() || '',
    headLinks: [...r.querySelectorAll('.cbMeta .lnk[data-hg]')].length,
    paras: [...r.querySelectorAll('.cSec .qp')].map((x) => x.textContent.trim()),
    rows: r.querySelectorAll('.cSec .nRow').length,
    canonSegs: [...r.querySelectorAll('.cCanon')].map((x) => ({
      tag: x.querySelector('.ctag')?.textContent || '',
      txt: (x.querySelector('.ctext')?.textContent || '').trim(),
      src: (x.querySelector('.cs')?.textContent || '').trim(),
    })),
    swap: r.querySelector('.cSwap.on')?.textContent?.trim() || '',   // 当前态（点亮的那枚）
    swapN: r.querySelectorAll('.cSwap[data-m]').length,              // 两枚并列
    swapTop: (() => {                                                // 开关须在正文之上
      const sb = r.querySelector('.cSwapBar'), tx = r.querySelector('.cSec .qp,.cSec .cCanon');
      return !!(sb && tx) && sb.getBoundingClientRect().top <= tx.getBoundingClientRect().top;
    })(),
    relFold: r.querySelector('.cRel>summary')?.textContent?.trim() || '',
    relOpen: r.querySelector('.cRelOpen>.qk')?.textContent?.trim() || '',
    mvRows: r.querySelectorAll('.sfpMoves .mv').length,
    chips: r.querySelectorAll('.sfpChip').length,
    nested: [...r.querySelectorAll('details')].some((d) => !!d.querySelector('details')),
    // v2 遗物：一件都不许再有
    oldQ: r.querySelectorAll('.cQ').length,
    oldRead: r.querySelectorAll('.cbRead').length,
    oldSrc: r.querySelectorAll('.cbSrc').length,
  };
}, sel);

const open = async (fn, arg, sel) => {
  await page.evaluate(([f, a]) => window[f](a), [fn, arg]);
  await page.waitForTimeout(500);
  return probe(sel);
};
// 位卡自门卡位次一览点入（无直开钩子）
const openPos = async (dn) => {
  await page.evaluate((d) => window.__openDoor(d), dn);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#dcPos [data-pi]')?.click());
  await page.waitForTimeout(700);
  return probe('#cardBody');
};

console.log('【一 五种卡型同走一个出口，v2 遗物尽去】');
const got = {};
got['处所 · 南赡部洲'] = await open('__selNode', 'jambu', '#cardBody');
got['辅标 · 持国天王'] = await open('__auxCard', '持国天王', '#cardBody');
got['段签 · 十地'] = await open('__tenetCard', '十地', '#cardBody');
got['门 · 第四门'] = await open('__openDoor', 4, '#dcEntry');
got['位 · 门4首位'] = await openPos(4);

for (const [tag, r] of Object.entries(got)) {
  ok(!!r, `${tag}：卡已建`);
  if (!r) continue;
  ok(r.paras.length >= 1, `${tag}：正文有段落`, String(r.paras.length));
  ok(!r.oldQ && !r.oldRead && !r.oldSrc, `${tag}：无三问栏／读原文钮／出处抽屉`,
    `cQ=${r.oldQ} cbRead=${r.oldRead} cbSrc=${r.oldSrc}`);
  ok(!r.nested, `${tag}：折叠不嵌套`);
  ok(r.swapN === 2 && r.swap === '白话', `${tag}：文白开关两枚并列、白话态点亮`, `${r.swapN}枚/亮=${r.swap}`);
  ok(r.swapTop, `${tag}：开关在正文之上（位置恒定，不随正文长短浮动）`);
}

console.log('\n【二 文白是一枚切换，不是两层】');
{
  const before = got['位 · 门4首位'];
  ok(before.canonSegs.length === 0 && before.paras.length >= 1, '白态：只见白话');
  await page.evaluate(() => document.querySelector('#cardBody .cSwap[data-m="canon"]').click());
  await page.waitForTimeout(400);
  const after = await probe('#cardBody');
  ok(after.canonSegs.length >= 1, '文态：原文段已现', String(after.canonSegs.length));
  ok(after.paras.length === 0, '文态：白话已退场（原地对调，不并置）');
  const seg = after.canonSegs[0] || {};
  ok((seg.txt || '').length > 8, '文态：逐字原文已回填（未随 innerHTML 折简）', (seg.txt || '').slice(0, 20));
  ok(/選佛譜|选佛谱/.test(seg.src || ''), '文态：出处随原文段就地可见', seg.src);
  ok(after.swap === '原文', '开关高亮随态而移（点亮的是「原文」）', after.swap);
  const hasRd = await page.evaluate(() => !!document.querySelector('.rdPage'));
  ok(!hasRd, '深读页整层已撤（无 .rdPage）');
  await page.evaluate(() => document.querySelector('#cardBody .cSwap[data-m="plain"]').click());
  await page.waitForTimeout(350);
}

console.log('\n【三 关联段：超三项才折，段名数字须与实见行数相符】');
{
  const pos = await probe('#cardBody');
  const m = /(\d+)\s*组/.exec(pos.relFold || '');
  ok(!!pos.relFold, '位卡关联段折叠', pos.relFold);
  ok(m && Number(m[1]) === pos.mvRows, '「升降行法 · N 组」与展开后实见行数相符',
    `段名 ${m ? m[1] : '?'} vs 实见 ${pos.mvRows}`);
  const place = got['处所 · 南赡部洲'];
  const pm = /(\d+)\s*位/.exec(place.relFold || '');
  ok(pm && Number(pm[1]) === place.chips, '「此处谱位 · N 位」与芯片数相符',
    `段名 ${pm ? pm[1] : '?'} vs 实见 ${place.chips}`);
  ok(!got['辅标 · 持国天王'].relFold && !got['段签 · 十地'].relFold,
    '辅标／段签所属只一项，不折叠（已收进词头可点）');
}

console.log('\n【四 位卡撤假刻度与错邻居翻页】');
{
  const pos = await probe('#cardBody');
  ok(!/\d+\/220/.test(pos.head), '词头无「第 N/220 位」——门序偏移非修行进度', pos.head);
  ok(pos.headLinks >= 1, '词头门名可点入门卡', String(pos.headLinks));
  const navHidden = await page.evaluate(() => getComputedStyle(document.querySelector('#cardNav')).display === 'none');
  ok(navHidden, '位卡无上一位／下一位（跨门即错邻居）');
  const noGeo = await page.evaluate(() => !document.querySelector('#cardBody .coordBox'));
  ok(noGeo, '地理坐标框已撤（讲的是所锚法界，非本位）');
}

console.log('\n【五 行法表不带缘由】');
{
  const n = await page.evaluate(() => {
    const d = document.querySelector('#cardBody .cRel');
    if (d) d.open = true;
    return document.querySelectorAll('#cardBody .sfpMoves .evd,#cardBody .sfpMoves .evTag,#cardBody .sfpMoves .cSrc').length;
  });
  ok(n === 0, '逐组缘由不上卡（归〈选佛谱·轮相说明总表〉）', String(n));
}

console.log('\n【六 窄屏正文满宽】');
{
  const w = await page.evaluate(() => {
    const p = document.querySelector('#cardBody .cSec .qp,#cardBody .cSec .cCanon .ctext');
    return p ? Math.round(p.getBoundingClientRect().width / innerWidth * 100) : 0;
  });
  ok(w >= 80, `正文占视口 ${w}%（旧制三问栏下约 60%）`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!over, '无横向溢出');
}

console.log('\n【七 处所卡类标只留「界群 · 三界」两枚，收藏另作状态签】');
{
  const tags = await page.evaluate(() => {
    window.__selNode('jambu');
    return null;
  });
  void tags;
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => [...document.querySelectorAll('#cardTags .tag')].map((x) => ({
    text: x.textContent.trim(), fav: x.classList.contains('tagFav'),
  })));
  const cls = t.filter((x) => !x.fav).map((x) => x.text);
  const fav = t.filter((x) => x.fav).map((x) => x.text);
  ok(cls.length === 2, `类标两枚（坐标据已撤）`, cls.join('/'));
  ok(fav.length === 1 && fav[0].includes('收藏'), '收藏是并列的状态签，不计入处所类标', fav.join('/'));
  ok(!cls.some((x) => /依经有处|非方所摄/.test(x)), '「依经有处／非方所摄」不再上卡——常态不必标，例外方位行里已说得更清楚');
}

console.log('\n【八 卡壳次序：名 → 类标 → 正文 → 操作 → 翻页】');
{
  const ids = await page.evaluate(() => [...document.querySelector('#card').children].map((c) => c.id).filter(Boolean));
  const iBody = ids.indexOf('cardBody'), iBtns = ids.indexOf('cardBtns');
  ok(iBody >= 0 && iBtns > iBody, '操作钮在正文之后（不再夹在卡名与首句之间）', ids.join('→'));
}

ok(errors.length === 0, '无脚本错误', errors.slice(0, 3).join(' | '));
console.log(`\n${failed ? '✗' : '✓'} 通过 ${passed}　失败 ${failed}`);
await browser.close();
process.exit(failed ? 1 : 0);
