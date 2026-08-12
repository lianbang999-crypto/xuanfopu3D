// 位注白话手译本接线验收（2026-08-08）。
// 缘起：SFP_POS_BAIHUA 译毕 220/220 之后，game.js 里对它零引用——位卡、判词卡、详读卡、
//   去处小签十处仍读旧本 SFP_POS_PLAIN。此本盯住的正是「译了却没上卡」这一类事：
//   数据在库里是一回事，读者在卡上看得见是另一回事。
// 先启动 `npm run dev`，再运行：npm run test:pos-card
import { chromium } from 'playwright-core';
import { SFP_POS_BAIHUA } from '../src/sfp-pos-baihua.js';
import { SFP_POS } from '../src/sfp-data.js';
import { SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { sfpCanonVerdict, sfpQuoteKind } from '../src/sfp-verdict-canon.js';

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
// 资源 404 单列（同 test-door-card）：题图等静态资源在 dev 下可能缺席，与白话接线无关，不混入脚本错误计
const missing = [];
page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
const isRes = (s) => /Failed to load resource/i.test(s);
await page.goto(UI_BASE, { waitUntil: 'commit' });
await page.waitForFunction(() => typeof window.__posCardObj === 'function', undefined,
  { timeout: 120000, polling: 500 });

const ids = SFP_POS.map((p) => p.id);
const got = await page.evaluate((list) => list.map((id) => {
  const o = window.__posCardObj(id);
  if (!o) return { id, missing: true };
  const body = o.body || [], canon = o.canon || [];
  return {
    id,
    lead: body.length && !body[0].k ? String(body[0].v || '') : '',
    nRows: body.filter((x) => x.k).length,
    // 补注 2026-08-08 起独立成段（kind:'ext'），不再混作 { k:'补注' } 明细行
    nExt: body.filter((x) => x.kind === 'ext').length,
    extSrcs: body.filter((x) => x.kind === 'ext').map((x) => String(x.src || '')),
    canonTags: canon.map((c) => String(c.tag || '')),
    canonSrcs: canon.map((c) => String(c.src || '')),
    gist: window.__posGist(id),
  };
}), ids);

console.log('\n【一 二百二十位皆已换上手译本】');
const miss = got.filter((g) => g.missing);
ok(miss.length === 0, '位卡对象皆能取得', miss.map((g) => g.id).join('、'));
const noLead = got.filter((g) => !g.missing && !g.lead);
ok(noLead.length === 0, '二百二十位皆有白话领起句', noLead.map((g) => g.id).join('、'));
// 逐位比对：卡上领起句须与库中 v 逐字相同——凡不同者，即是还在走旧本
const drift = got.filter((g) => !g.missing && SFP_POS_BAIHUA[g.id] && g.lead !== String(SFP_POS_BAIHUA[g.id].v));
ok(drift.length === 0, '卡上领起句与手译本逐字相符（不相符即仍走旧本）', drift.slice(0, 4).map((g) => g.id).join('、'));

console.log('\n【二 明细行数与库一致】');
const rowBad = got.filter((g) => !g.missing && SFP_POS_BAIHUA[g.id]
  && g.nRows !== ((SFP_POS_BAIHUA[g.id].rows || []).length));
ok(rowBad.length === 0, '明细行逐位对数', rowBad.slice(0, 4).map((g) => `${g.id}(卡${g.nRows}/库${(SFP_POS_BAIHUA[g.id].rows || []).length})`).join('、'));
const totRows = got.reduce((a, g) => a + (g.nRows || 0), 0);
console.log(`    卡上明细行合计 ${totRows} 行`);

console.log('\n【三 他经补注上卡，且不冒「谱曰」】');
const libExt = ids.filter((id) => (SFP_POS_BAIHUA[id] || {}).ext);
const cardExt = got.filter((g) => g.nExt > 0);
ok(cardExt.length === libExt.length, `补注位数相符（库 ${libExt.length} 位）`,
  `卡 ${cardExt.length} 位`);
const totExt = got.reduce((a, g) => a + (g.nExt || 0), 0);
const libExtN = libExt.reduce((a, id) => a + SFP_POS_BAIHUA[id].ext.length, 0);
ok(totExt === libExtN, `补注条数相符（库 ${libExtN} 条 / 卡 ${totExt} 条）`);
// 要害：补注的逐字原文须自成一栏，绝不可混进「谱曰 · 本位」
const mixed = got.filter((g) => (g.canonTags || []).filter((t) => t.startsWith('谱曰')).length > 1);
ok(mixed.length === 0, '「谱曰 · 本位」每位至多一栏，补注另立门户', mixed.map((g) => g.id).join('、'));
const extNoSrc = got.filter((g) => (g.canonTags || []).some((t, i) => t.startsWith('补注') && !g.canonSrcs[i]));
ok(extNoSrc.length === 0, '补注逐字原文皆标出处', extNoSrc.map((g) => g.id).join('、'));
const extTagged = got.filter((g) => (g.canonTags || []).some((t) => t.startsWith('补注 · 《')));
ok(extTagged.length > 0, '补注栏题标出所引书名', '');
// 白话页：补注须独立成段并标书名——不与谱主的话并排作明细行（2026-08-08 发起人定）
const extNoBook = got.filter((g) => (g.extSrcs || []).some((s) => !/《[^》]+》/.test(s)));
ok(extNoBook.length === 0, '白话页补注段题标出所引书名', extNoBook.map((g) => g.id).join('、'));

console.log('\n【四 判词卡落处取手译本领起句】');
// posGist 是判词落处、去处小签、门1逐位读的共用取值口；校审补足名相后 v 可为多句，
// 此处应从 v 中择一句短提要，而非把整段位义原样塞进判词卡。
const gistBad = got.filter((g) => !g.missing && SFP_POS_BAIHUA[g.id]
  && (!g.gist || !String(SFP_POS_BAIHUA[g.id].v).includes(g.gist) || g.gist.length > 60));
ok(gistBad.length === 0, 'posGist 从手译本领起段择取短句（不另造义）',
  gistBad.slice(0, 4).map((g) => g.id).join('、'));

console.log('\n【五 名相浮标在位卡上真的生效】');
// 手译本以繁体存，正为浮标而设（旧本若写简体，浮标键全是繁体词形，一个也匹配不上）。
// 故不查库、不查探针，一律实开位卡，数卡面 DOM 里的 .gls 锚点——读者点得开才算数。
const glsProbe = [];
for (const id of ['八背捨觀', '體空觀', '無上道戒', '初歡喜地']) {
  const n = await page.evaluate(async (pid) => {
    window.__openSfpNote ? window.__openSfpNote(pid) : null;
    await new Promise((r) => setTimeout(r, 260));
    const box = document.querySelector('#cardBody') || document.querySelector('.overlay .body');
    const hit = box ? box.querySelectorAll('.gls').length : -1;
    const close = document.querySelector('.overlay .ovClose');
    if (close) close.click();
    await new Promise((r) => setTimeout(r, 160));
    return hit;
  }, id);
  glsProbe.push({ id, n });
}
const glsOK = glsProbe.filter((x) => x.n > 0);
ok(glsOK.length === glsProbe.length, '位卡白话挂上名相浮标（繁体键生效）',
  glsProbe.map((x) => `${x.id}:${x.n}`).join(' '));

// ── 本掷态（2026-08-12 三卡归一：详读卡撤，本掷层并入位卡）──────────────────
// 从判词卡「详读 ›」／去向条位名／3D 行迹线进来时，位卡多一段「这一掷为什么这样判」。
// 三件要守：① 判词逐字取自 4620 格正本；② 「谱曰／承前」判分以**出发位**位文为基准
//（引文系于出发位，拿落处位文去比几乎全判承前）；③ 不带 toss 时本掷层根本不出。
console.log('\n【六 位卡 · 本掷态】');
{
  const TOSS = { c: '那那', from: '上品十惡', to: '阿鼻地獄', evidence: null };
  const withToss = await page.evaluate((t) => {
    const o = window.__posCardObj('阿鼻地獄', t);
    return o && o.toss ? { ...o.toss } : null;
  }, TOSS);
  const without = await page.evaluate(() => {
    const o = window.__posCardObj('阿鼻地獄');
    return o ? !!o.toss : null;
  });
  const canon = sfpCanonVerdict('上品十惡', '那那') || {};
  const fromText = String((SFP_CANON_DOORS['1'].positions.find((x) => x.name === '上品十惡') || {}).text || '')
    .replace(/^譜曰。/, '');

  ok(!!withToss, '带 toss 时位卡对象有本掷层');
  if (withToss) {
    ok(withToss.plain === canon.plain, '本掷判词逐字取自 4620 格正本', (withToss.plain || '').slice(0, 28));
    ok(withToss.quote === canon.quote, '本掷引文逐字取自同一格', (withToss.quote || '').slice(0, 28));
    ok(withToss.kind === sfpQuoteKind(fromText, canon.quote),
      '「谱曰／承前」判分与共用判分口一致', `${withToss.kind}`);
    ok(withToss.from === '上品十惡' && withToss.here === '阿鼻地獄', '路由行两端＝出发位→落处');
    ok(/〈上品十惡〉/.test(withToss.src || ''), '出处署**出发位**名（引文系于出发位，非落处）', withToss.src);
  }
  ok(without === false, '不带 toss 时本掷层不出（非本掷不做空槽）');

  // 错配挡：toss 的落处与 pid 对不上时须丢弃（防返程闭包捕获的旧 toss）
  const mism = await page.evaluate((t) => {
    const o = window.__posCardObj('無間地獄', t);   // 落处是阿鼻，卡是无间
    return o ? !!o.toss : null;
  }, TOSS);
  ok(mism === false, 'toss 与 pid 错配时丢弃本掷层');

  // 实开卡：本掷段在文白开关**之下**（开关位置恒定是卡制 v3 明定之形）
  const dom = await page.evaluate(async (t) => {
    window.__openSfpNote('阿鼻地獄', t);
    await new Promise((r) => setTimeout(r, 320));
    const sec = document.querySelector('#cardBody .cSec');
    const bar = sec?.querySelector('.cSwapBar');
    const toss = sec?.querySelector('.cToss');
    const pos = bar && toss ? (bar.compareDocumentPosition(toss) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : null;
    const rd = [...document.querySelectorAll('#cardBtns .gbtn')].map((b) => b.textContent.trim());
    document.querySelector('.overlay .ovClose')?.click();
    await new Promise((r) => setTimeout(r, 160));
    return { hasToss: !!toss, tossN: sec ? sec.querySelectorAll('.cToss').length : -1, barBeforeToss: pos, btns: rd };
  }, TOSS);
  ok(dom.hasToss, '实开卡：本掷段在场');
  ok(dom.tossN === 1, '本掷段恰一段', String(dom.tossN));
  ok(dom.barBeforeToss === true, '文白开关在本掷段之上（开关位置恒定，不随内容浮动）');
  ok(dom.btns.some((b) => /读原文/.test(b)), '位卡有「读原文 ›」入阅读器（补此前的断链）', dom.btns.join(' / '));
}

console.log('\n【八 位名浮标：位卡内点别位之名即换位；上限 7 仍守】');
// 2026-08-12 发起人二次点单：位名→位卡的派发由「只限判词卡」推至全站。此处验位卡这一路
//   （门卡那一路在 test:door 第八节，阅读器那一路在 test:reader 第九节）。
// 同时验「门放位不放」：门卡明细行已放开不折，位卡仍守 CARD_ROW_MAX=7。
{
  const openNote = async (id) => { await page.evaluate((i) => window.__openSfpNote(i), id);
    await new Promise((r) => setTimeout(r, 320)); };
  const closeAll = () => page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));

  // 〈根本四禪〉白话提及〈四無量心〉〈四無色定〉——两位皆在 129 条同名词条内
  await openNote('根本四禪');
  const jump = await page.evaluate(() => {
    const c = document.querySelector('#card');
    const from = c?.dataset.pid || '';
    const hit = Array.from(c ? c.querySelectorAll('.gls') : [])
      .find((g) => /^(四无量心|四無量心|四无色定|四無色定)$/.test(g.textContent.trim()));
    if (!hit) return { from, term: '(无)' };
    const term = hit.textContent.trim(); hit.click();
    return { from, term, to: document.querySelector('#card')?.dataset.pid || '',
      kind: document.querySelector('#card')?.dataset.kind || '',
      popShut: (document.querySelector('#glsPop')?.style.display || 'none') === 'none' };
  });
  ok(jump.term !== '(无)', '位卡白话里的别位之名确已成浮标', JSON.stringify(jump));
  ok(jump.kind === 'pos' && /^pos:/.test(jump.to) && jump.to !== jump.from,
    '点它即换到那一位的卡（不再弹缩写签）', `${jump.from} → ${jump.to}`);
  ok(jump.popShut, '缩写签未同时弹出（一击一去处）');
  await closeAll();

  // 上限对照：〈八背捨觀〉十行、〈根本四禪〉与〈八勝處觀〉各八行——皆须折起超出的部分
  const caps = [];
  for (const id of ['八背捨觀', '根本四禪', '八勝處觀']) {
    await openNote(id);
    caps.push(await page.evaluate((i) => { const c = document.querySelector('#card');
      return { id: i, head: c.querySelectorAll('.cSec .nRow:not(.cMore .nRow)').length,
        folded: c.querySelectorAll('.cMore .nRow').length }; }, id));
    await closeAll();
  }
  ok(caps.every((c) => c.head === 7 && c.folded > 0), '位卡明细行仍守上限 7，余行折起', JSON.stringify(caps));
}

console.log('\n【七 无脚本报错】');
const real = errors.filter((e) => !isRes(e));
ok(real.length === 0, '全程无脚本报错（资源 404 单列）', real.slice(0, 3).join(' | '));
if (missing.length) console.log(`    资源缺失 ${missing.length} 项（dev 环境静态资源，与本次接线无关）`);

await browser.close();
console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
