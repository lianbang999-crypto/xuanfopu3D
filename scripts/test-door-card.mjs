// 门卡（v391 归一）验收：门要卡／廿一因卡／四土卡／谱文原文卡四合一后的形状、lazy 与来路。
// 先启动 `npm run dev`，再运行：npm run test:door
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
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'], // 同 test-ui-e2e：无显卡也要出 WebGL
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// 资源 404 单列：本项目题图等静态资源在 dev 下可能缺席，与门卡归一无关，不混入脚本错误计
const missing = [];
page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });

await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__openDoor === 'function', { timeout: 30000 });
await wait(600);

const openDoor = async (dn, opts) => {
  await page.evaluate(([d, o]) => { window.__openDoor(d, o); }, [dn, opts || {}]);
  await wait(220);
};
const closeAll = () => page.evaluate(() => {
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
});

console.log('【一形状 · 十五门同形】');
{
  const shape = [];
  for (let dn = 1; dn <= 15; dn++) {
    await openDoor(dn);
    shape.push(await page.evaluate(() => {
      const p = document.querySelector('.overlay .panel');
      if (!p) return null;
      return {
        h2: p.querySelector('h2')?.textContent || '',
        pos: !!p.querySelector('#dcPos'),
        canon: !!p.querySelector('#dcCanon'),
        // 2026-08-08 卡制总纲 v3：门义走正文段（#dcEntry .cSec .qp）——
        // v2 的三问栏 .cQ 已撤，旧选择器一律不再命中，故改此一处
        intro: !!p.querySelector('#dcEntry .cSec .qp'),
        posCount: p.querySelectorAll('#dcPos [data-pi]').length,
      };
    }));
    await closeAll();
  }
  ok(shape.every((s) => s && s.pos), '十五门皆有「位次一览」段');
  ok(shape.every((s) => s && s.canon), '十五门皆有「谱文·全文对读」段');
  ok(shape.every((s) => s && s.intro), '十五门皆有门义（导语或谱曰总说）——归一前门1/2/15 无话可说');
  ok(shape.every((s) => s && s.posCount > 0), '十五门位次皆可点入位卡', JSON.stringify(shape.map((s) => s?.posCount)));
  const total = shape.reduce((a, s) => a + (s?.posCount || 0), 0);
  ok(total === 220, `位次合计 220 位（实得 ${total}）`);
}

console.log('【二 lazy · 首屏不因合并变重】');
{
  await openDoor(12); // 门12 位多，最能显出差别
  const before = await page.evaluate(() => {
    const b = document.querySelector('#dcCanonBody');
    return { html: (b?.innerHTML || '').length, nodes: document.querySelectorAll('.overlay .panel *').length };
  });
  ok(before.html === 0, '谱文段折叠时 #dcCanonBody 为空（未建 DOM）', `实得 ${before.html} 字符`);
  await page.evaluate(() => { document.querySelector('#dcCanon').open = true; document.querySelector('#dcCanon').dispatchEvent(new Event('toggle')); });
  await wait(400);
  const after = await page.evaluate(() => {
    const b = document.querySelector('#dcCanonBody');
    return {
      html: (b?.innerHTML || '').length,
      toc: b?.querySelectorAll('.cnT').length || 0,
      cards: b?.querySelectorAll('.cnCard').length || 0,
      nodes: document.querySelectorAll('.overlay .panel *').length,
    };
  });
  ok(after.html > 2000, '展开后谱文正文建出', `${after.html} 字符`);
  ok(after.toc > 3, `位名目录建出（${after.toc} 条）`);
  ok(after.cards > 3, `逐位「位卡 ›」建出（${after.cards} 枚）`);
  ok(after.nodes > before.nodes * 2, `展开前后 DOM 结点 ${before.nodes} → ${after.nodes}（折叠态确实轻）`);
  await closeAll();
}

console.log('【三来路 · jump 一步到位】');
{
  // 门6 第 5 位「取相懺」——取靠后之位，落位若不生效则须自行下滚，正是要防的中间态
  const JUMP_DOOR = 6, JUMP_NAME = '取相懺', JUMP_CI = 4;
  await openDoor(JUMP_DOOR, { jump: JUMP_NAME });
  await wait(700); // 落位是 smooth 滚动，等其走完
  const r = await page.evaluate((ci) => {
    const sec = document.querySelector('#dcCanon');
    const b = document.querySelector('#dcCanonBody');
    const body = document.querySelector('.overlay .panel .body');
    const tgt = b?.querySelector(`div[data-ci="${ci}"]`);
    return {
      open: !!sec?.open,
      built: (b?.innerHTML || '').length > 1000,
      exists: !!tgt,
      delta: tgt && body ? Math.round(tgt.getBoundingClientRect().top - body.getBoundingClientRect().top) : null,
      scrolled: Math.round(body?.scrollTop || 0),
      max: body ? Math.round(body.scrollHeight - body.clientHeight) : 0,
    };
  }, JUMP_CI);
  ok(r.open, 'jump 来路：谱文段自动展开');
  ok(r.built, 'jump 来路：正文已建');
  ok(r.exists, `jump 来路：目标位 ci=${JUMP_CI} 在场`);
  ok(r.scrolled > 100, `jump 来路：确实滚动了（${r.scrolled}px）`);
  // 同上：落到位顶 或 已至底（末位之后无内容可让其到顶）
  ok(r.delta !== null && (Math.abs(r.delta) < 40 || r.max - r.scrolled <= 2),
    `jump 来路：目标位落到视口顶（偏 ${r.delta}px）——不留「先看门义再自己找」的中间态`);
  await closeAll();
}

console.log('【四来路 · focus 落到位次一览】');
{
  await openDoor(1, { focus: 'pos' });
  const d1 = await page.evaluate(() => {
    const p = document.querySelector('.overlay .panel');
    return {
      label: p.querySelector('#dcPos summary')?.textContent || '',
      groups: p.querySelectorAll('#dcPos .dpG').length,
      rows: p.querySelectorAll('#dcPos .dpRow').length,
      caption: p.querySelector('#dcPos .dpRow i')?.textContent || '',
    };
  });
  ok(/廿一因/.test(d1.label), '门1 段题保留「廿一因」原名（可寻性不失）', d1.label);
  ok(d1.groups === 4, `门1 四类分组在场（${d1.groups}）`);
  ok(d1.rows === 21, `门1 廿一位一行一位（${d1.rows}）`);
  ok(d1.caption.length > 0, '门1 逐位义读保留', d1.caption);
  await closeAll();

  await openDoor(14, { focus: 'pos' });
  const d14 = await page.evaluate(() => {
    const p = document.querySelector('.overlay .panel');
    return {
      label: p.querySelector('#dcPos summary')?.textContent || '',
      groups: [...p.querySelectorAll('#dcPos .dpG b')].map((b) => b.textContent),
      desc: p.querySelectorAll('#dcPos .dpD').length,
      pos: p.querySelectorAll('#dcPos [data-pi]').length,
      lead: (p.querySelector('#dcPos .cRead')?.textContent || '').includes('横具四土') || (p.querySelector('#dcPos .cRead')?.textContent || '').includes('橫具四土'),
    };
  });
  // 门14 门义含天台四土判教一段，首屏不止一屏——从场中名牌进来须真滚到位次段，否则四土不在眼前。
  // 判据是「落到段顶 或 已滚到底」：位次段之后的内容不足一屏时，段顶物理上到不了视口顶，滚到底即是尽头。
  await wait(400); // 落位有 240ms 的末次校正，等其走完再量
  const d14pos = await page.evaluate(() => {
    const body = document.querySelector('.overlay .panel .body');
    const ps = document.querySelector('#dcPos');
    return {
      scrolled: Math.round(body.scrollTop),
      max: Math.round(body.scrollHeight - body.clientHeight),
      delta: Math.round(ps.getBoundingClientRect().top - body.getBoundingClientRect().top),
    };
  });
  const atEnd = d14pos.max - d14pos.scrolled <= 2;
  ok(Math.abs(d14pos.delta) < 40 || atEnd,
    `门14 focus 落到位次段（滚 ${d14pos.scrolled}/${d14pos.max}px，偏 ${d14pos.delta}px${atEnd ? '，已至底' : ''}）`);
  ok(/四土/.test(d14.label), '门14 段题保留「极乐四土」原名', d14.label);
  ok(d14.groups.length === 4, `门14 四土分组在场（${d14.groups.join('、')}）`);
  ok(d14.pos === 13, `门14 十三位全在（${d14.pos}）`);
  ok(d14.lead, '门14 天台四土判教正文保留');
  ok(d14.desc >= 1, '门14 同居土组说明保留');
  await closeAll();
}

console.log('【五 出口 · 位次入位卡】');
{
  await openDoor(3);
  await page.evaluate(() => document.querySelector('#dcPos [data-pi]').click());
  await wait(320);
  // v3：位卡与处所／辅标／段签同走 #card 一副壳，不再自建带「· 原文说明」的 h2 面板；
  // 认卡改看卡名＋副题「谱位」＋词头门链，三者俱在方算真进了位卡
  const noteOpen = await page.evaluate(() => ({
    name: document.querySelector('#cardName')?.textContent || '',
    sub: document.querySelector('#cardSub')?.textContent || '',
    doorLink: !!document.querySelector('#cardBody .cbMeta .lnk[data-hg]'),
  }));
  ok(!!noteOpen.name && /谱位/.test(noteOpen.sub) && noteOpen.doorLink,
    '点位次即入位卡', `${noteOpen.name}/${noteOpen.sub}/门链=${noteOpen.doorLink}`);
  await closeAll();
}

console.log('【六 旧卡确已退场】');
{
  const gone = await page.evaluate(() => ({
    brief: typeof window.openDoorBrief,
    canon: typeof window.openCanon,
    d1: typeof window.openD1Card,
    four: typeof window.openFourLands,
  }));
  ok(Object.values(gone).every((t) => t === 'undefined'), '四个旧卡函数不再暴露', JSON.stringify(gone));
}

const scriptErrors = errors.filter((e) => !/Failed to load resource/.test(e));
ok(scriptErrors.length === 0, '全程无脚本报错', scriptErrors.slice(0, 3).join(' | '));
if (missing.length) console.log(`  · 静态资源缺失 ${missing.length} 项（与门卡无关）：${missing.slice(0, 4).join(' , ')}`);

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
