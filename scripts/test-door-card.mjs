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

await page.goto(UI_BASE, { waitUntil: 'commit' });
// 2026-08-14 等待改稳：DCL 要等整个模块图求值完（WebGL 初始化在内），无头慢机 30s 不保——
// 改 commit＋催帧等钩子（1px 截图逼合成器走帧，同 test-boot-face 法），钩子一到即行
for (let i = 0; i < 80; i++) {
  if (await page.evaluate(() => typeof window.__openDoor === 'function').catch(() => false)) break;
  await Promise.race([
    page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
    new Promise((r) => setTimeout(r, 900)),
  ]).catch(() => {});
  await page.waitForTimeout(300);
}
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
        read: !!p.querySelector('#dcRead'),        // 2026-08-11：旧 #dcCanon 段撤，改一枚「读本门原文 ›」入阅读器
        // 2026-08-08 卡制总纲 v3：门义走正文段（#dcEntry .cSec .qp）——
        // v2 的三问栏 .cQ 已撤，旧选择器一律不再命中，故改此一处
        intro: !!p.querySelector('#dcEntry .cSec .qp'),
        posCount: p.querySelectorAll('#dcPos [data-pi]').length,
      };
    }));
    await closeAll();
  }
  ok(shape.every((s) => s && s.pos), '十五门皆有「位次一览」段');
  ok(shape.every((s) => s && s.read), '十五门皆有「读本门原文 ›」钮（入阅读器）');
  ok(shape.every((s) => s && s.intro), '十五门皆有门义（导语或谱曰总说）——归一前门1/2/15 无话可说');
  ok(shape.every((s) => s && s.posCount > 0), '十五门位次皆可点入位卡', JSON.stringify(shape.map((s) => s?.posCount)));
  const total = shape.reduce((a, s) => a + (s?.posCount || 0), 0);
  ok(total === 220, `位次合计 220 位（实得 ${total}）`);
}

// 【二 lazy】与【三 jump】两组共 9 项撤于 2026-08-11：所测的「谱文·全文对读」第三段已撤，
//   全文阅读归 src/sfp-reader.js（一节一屏，无 lazy 建段、无段内滚动定位，故那两组无对象可测）。
//   门卡今只余一枚入口钮，验其在场与去处即可；阅读器自身另有 scripts/test-reader.mjs 二十一项。
console.log('【二 · 谱文入阅读器】');
{
  await openDoor(12); // 门12 位多，从前最能显出 lazy 的差别，今验入口
  const r = await page.evaluate(() => {
    const p = document.querySelector('.overlay .panel');
    return {
      gone: !p.querySelector('#dcCanon'),
      btn: (p.querySelector('#dcRead')?.textContent || '').trim(),
      nodes: document.querySelectorAll('.overlay .panel *').length,
    };
  });
  ok(r.gone, '旧「谱文·全文对读」段已撤');
  ok(/读本门原文|讀本門原文/.test(r.btn), `入口钮题字带卷次：${r.btn}`);
  ok(r.nodes < 900, `门12 首屏 DOM 结点 ${r.nodes}（撤段后不再因合并变重）`);
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
  // v3：位卡与处所／辅标／段签同走 #card 一副壳，不再自建带「· 原文说明」的 h2 面板。
  // 认卡＝卡名 ＋ **卡型 data-kind** ＋ 词头门链，三者俱在方算真进了位卡。
  //   从前认的是副题文案（「谱位」／「二百二十位之一」），而副题已撤于 2026-08-12
  //   （它不报关于这一位的任何事，只说「这是个谱位」）。词眉「谱位详解」同日下午亦撤，
  //   缘由同类：那一行报的是卡的类别，不是这一位——验在 test:pos-card 第六节。
  //   卡型是结构信号、不是措辞，日后再改文案也不会误伤此条。
  const noteOpen = await page.evaluate(() => ({
    name: document.querySelector('#cardName')?.textContent || '',
    kind: document.querySelector('#card')?.dataset?.kind || '',
    doorLink: !!document.querySelector('#cardBody .cbMeta .lnk[data-hg]'),
  }));
  ok(!!noteOpen.name && noteOpen.kind === 'pos' && noteOpen.doorLink,
    '点位次即入位卡', `${noteOpen.name}/kind=${noteOpen.kind}/门链=${noteOpen.doorLink}`);
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

console.log('【七 门义明细行不折】');
// 2026-08-12 发起人点单「门卡 CARD_ROW_MAX=7 放宽」：门义那几行是「何以稱惡」这类逐问逐答，
//   一行一问，本就是要通读的一份；先前与位卡共守上限 7，门14（四土各摄何位）十四行被折起六行。
//   位卡不放宽——那边明细行是同类项罗列，多则宜折，故此处一并验「门放位不放」。
{
  const rows = [];
  for (let dn = 1; dn <= 15; dn++) {
    await openDoor(dn);
    rows.push(await page.evaluate(() => {
      const e2 = document.querySelector('.overlay .panel #dcEntry');
      return e2 ? { n: e2.querySelectorAll('.nRow').length, more: e2.querySelectorAll('.cMore').length } : null;
    }));
    await closeAll();
  }
  ok(rows.every((r) => r && r.more === 0), '十五门门义无一处折叠',
    JSON.stringify(rows.map((r, i) => (r && r.more ? `门${i + 1}折${r.more}` : null)).filter(Boolean)));
  const max = Math.max(...rows.map((r) => (r ? r.n : 0)));
  ok(max > 7, `最长一门明细行 ${max} 行全呈（放宽前此数会被截到 7）`);
}

console.log('【八 位名浮标：全站点开即入位卡】');
// 名相词条有 129 条与谱位同名，其释义是位卡白话的缩写版。2026-08-12 发起人二次点单：
//   由「只限判词卡」推至全站——一个位名在哪儿点都是同一个去处。此处验门卡这一路。
{
  // 门1 门义提及「見取」等位名；门9 提及「十六特勝」。页面简体态，故位名两形皆认。
  const probe = [];
  for (const dn of [1, 9]) {
    await openDoor(dn);
    probe.push(await page.evaluate(() => {
      const c = document.querySelector('.overlay .panel');
      const hit = Array.from(c ? c.querySelectorAll('#dcEntry .gls') : [])
        .find((g) => /^(见取|見取|十六特胜|十六特勝)$/.test(g.textContent.trim()));
      if (!hit) return { term: '(无)' };
      hit.click();
      return { term: hit.textContent.trim(),
        kind: document.querySelector('#card')?.dataset.kind || '',
        pid: document.querySelector('#card')?.dataset.pid || '',
        popShut: (document.querySelector('#glsPop')?.style.display || 'none') === 'none' };
    }));
    await closeAll();
  }
  ok(probe.every((r) => r.kind === 'pos'), '门义里的位名点开＝位卡（不再是缩写签）', JSON.stringify(probe));
  ok(probe.every((r) => /^pos:/.test(r.pid)), '落到的正是该位之卡', probe.map((r) => r.pid).join(' / '));
  ok(probe.every((r) => r.popShut), '缩写签未同时弹出（一击一去处）');
}

console.log('【九 天梯点门 · 报门义白话而非操作说明】');
// 旧文门门一个样：「全亮——位次依经典坐标布于诸界；点小珠读谱注，双击门签入门内观照」，
//   看十五遍是十五遍废话。今报本门门义领起句（SFP_DOOR_BAIHUA，与门卡同一份正本）。
{
  await closeAll();
  const tips = [];
  for (const dn of [3, 8, 13]) {
    tips.push(await page.evaluate(async (d) => {
      const it = document.querySelector(`#ladder .ladDoor[data-d="${d}"]`);
      it && it.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 90));
      const t = document.querySelector('#toast');
      return { txt: (t?.textContent || '').trim(), on: t?.style.opacity };
    }, dn));
    await wait(260);
  }
  ok(tips.every((t) => t.on === '1'), '点门签即弹提示');
  ok(!tips.some((t) => /位次依经典坐标布于诸界/.test(t.txt)), '旧操作说明已不再复述');
  ok(/三恶趣|三惡趣/.test(tips[0].txt) && /毗婆沙/.test(tips[0].txt), '门3 报的是四种恶趣门门义', tips[0].txt.slice(0, 40));
  ok(/无漏智慧|無漏智慧/.test(tips[1].txt) && /增上/.test(tips[1].txt), '门8 报的是增上定学门门义', tips[1].txt.slice(0, 40));
  ok(/圆妙|圓妙/.test(tips[2].txt), '门13 报的是圆教位次门门义', tips[2].txt.slice(0, 40));
  // 操作尾巴已全撤（2026-08-15 提示语三刀）：任何一次点签都不得再出「双击门签」教学句。
  const opCount = tips.filter((t) => /双击门签|雙擊門籤/.test(t.txt)).length;
  ok(opCount === 0, '操作教学句全撤，任一签不复述', `命中 ${opCount} 次`);
  await closeAll();
}

console.log('【十 卡上文字可选可复制】');
{
  const sel = await page.evaluate(() => {
    const d = document.createElement('div'); d.className = 'overlay'; document.body.appendChild(d);
    const ov = getComputedStyle(d).userSelect; d.remove();
    return { ov, vd: getComputedStyle(document.querySelector('#verdict')).userSelect };
  });
  ok(sel.ov === 'text' && sel.vd === 'text', '卡与判词正文 user-select:text（发起人点单：卡片文字允许复制）', JSON.stringify(sel));
}

const scriptErrors = errors.filter((e) => !/Failed to load resource/.test(e));
ok(scriptErrors.length === 0, '全程无脚本报错', scriptErrors.slice(0, 3).join(' | '));
if (missing.length) console.log(`  · 静态资源缺失 ${missing.length} 项（与门卡无关）：${missing.slice(0, 4).join(' , ')}`);

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
