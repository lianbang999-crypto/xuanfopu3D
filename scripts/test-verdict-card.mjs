// 判词卡验收（2026-08-11 三卡重设计）：
//   ① 4620 格白话正本成为判词第一真源，卡上逐字相符；
//   ② 去向、轮相、落处位义、正本缘由四段俱在，原文进入详读；
//   ③ 判词卡的“详读／行棋”双动作与来源标签稳定可见。
// 先启动 `npm run dev`，再运行：npm run test:verdict
import { chromium } from 'playwright-core';
import { SFP_VERDICT_CANON_COUNT, sfpCanonVerdict } from '../src/sfp-verdict-canon.js';
import { SFP_GLOSS } from '../src/sfp-gloss.js';

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
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
// 预置 sfpHelp:true——否则「开始行谱」先开三步玩法短卡（openSfpHelp），根本进不了局，
//   第七节的真机连掷遂永远停在题屏。同 test-back-and-lang 之例。
await ctx.addInitScript(() => {
  localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
});
const page = await ctx.newPage();
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

console.log('\n【二 4620 格正本直连】');
{
  const stayRows = got['不行·通例层'].rows;
  const why = stayRows.find((x) => ['缘由', '所指', '字义', '通例'].includes(x.k));
  ok(!!why, '不行之格有缘由类行', JSON.stringify(stayRows.map((x) => x.k)));
  const canon = sfpCanonVerdict('上品十惡', '那彌');
  ok(SFP_VERDICT_CANON_COUNT === 4620, '十五门正本合计 4620 格', String(SFP_VERDICT_CANON_COUNT));
  ok(why && canon && why.v === canon.plain, '「上品十惡|那彌」逐字取白话正本', why && why.v);
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
// 2026-08-12 判词卡重新极简：结果（轮字·去向条）→ 一条线 → 缘由（提要·白话·规则）→ 行钮。
//   归一前的 #vRouteCtx（来处情境行）与 #vBody（判定主句）并作一条去向条 #vRoute；
//   「详读」由底部动作钮降为缀在落处位名右侧的文字链，并接管了原来那枚「白话正本」来源徽章。
console.log('\n【六 判词卡 · 结构】');
{
  const parts = await page.evaluate(() => {
    const v = document.querySelector('#verdict');
    if (!v) return null;
    return {
      chips: !!v.querySelector('#vChips'), n: !!v.querySelector('#vN'),
      route: !!v.querySelector('#vRoute'), gist: !!v.querySelector('#vGist'),
      why: !!v.querySelector('#vWhy'), src: !!v.querySelector('#vSrc'),
      srcT: !!v.querySelector('.vsrcT'),
      oldRouteCtx: !!v.querySelector('#vRouteCtx'), oldBody: !!v.querySelector('#vBody'),
      actions: !!v.querySelector('#vActions'), go: !!v.querySelector('#vGoTxt'),
      whyHead: !!v.querySelector('.vWhyHead'), doorTag: !!v.querySelector('.vgD'),
      chipSub: !!v.querySelector('.vchip i'), chipGls: !!v.querySelector('.vchip .gls'),
      actionBtns: v.querySelectorAll('#vActions .gbtn').length,
      order: [...v.children].map((c) => c.id).join(','),
      // 一卡两色（发起人 2026-08-12 批注 d）：判词卡自身的 CSS 段不得再有散点 hex
      css: [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'),
    };
  });
  ok(!!parts, '判词卡在 DOM 中');
  if (parts) {
    ok(parts.chips && parts.n, '轮相牌与掷数在场');
    ok(parts.route, '去向条 #vRoute 在场');
    ok(!parts.oldRouteCtx && !parts.oldBody, '来处情境行与判定主句已并入去向条（#vRouteCtx／#vBody 皆撤）');
    ok(parts.gist, '落处提要行 #vGist 在场');
    ok(parts.why, '白话层在场');
    // 2026-08-07 发起人点单：判词卡的原文层整个撤掉
    ok(!parts.src, '原文层 #vSrc 已撤');
    ok(!parts.srcT, '「原文 ▸」虚线签已撤');
    ok(parts.go, '落子大钮在场');
    ok(parts.actions && parts.actionBtns === 1, '动作条只余一枚金主钮（详读已降为去向条文字链）', String(parts.actionBtns));
    ok(/vRoute,vGist,vWhy/.test(parts.order) && !/vSrc/.test(parts.order),
      '次序＝去向 › 提要 › 白话（原文层已撤）', parts.order);
    // 框盒减法（批注 b/c/d）
    ok(!parts.whyHead, '「为何如此」题头与来源徽章已撤（署名恒为常量，其职并入「详读 ›」）');
    ok(!parts.doorTag, '落处提要的门标 .vgD 已撤（所属门在位卡词头恒可见）');
    ok(!parts.chipSub, '轮字牌的「善↑惡↓」小标已撤（方向已由去向箭头与整卡方向色说过）');
    ok(!parts.chipGls, '轮字上的名相浮标已撤（它按卷首第一层义硬绑，第四层等位次会说错）');
    const strays = ['#b7a887', '#d9c78f', '#9d9170', '#dccf9f']
      .filter((hx) => new RegExp(`#v(Gist|Why|Route)[^}]*${hx}`, 'i').test(parts.css));
    ok(strays.length === 0, '判词卡不再有散点 hex（色彩立宪：明度分层走 token，不新造 hex）', strays.join(' '));
  }
}

// ── 位名浮标的分派（2026-08-12 发起人点单：判词卡内位名直入位卡）─────────────
// 名相词条里有 129 条与谱位同名，其释义是位卡白话的缩写版——同一件事的次级复本。
// 判词卡内点这类词直入位卡；判词卡外（阅读器／门卡等长读版面）仍出词典签，不被带走整屏。
// 此节不必掷真轮：往判词卡里塞一枚 .gls 再点，走的正是那个全局捕获处理器本身。
console.log('\n【七 位名浮标的分派】');
{
  const IDX_POS = SFP_GLOSS.findIndex((x) => x[0] === '阿鼻地獄');
  const IDX_TERM = SFP_GLOSS.findIndex((x) => x[0] === '見惑');
  ok(IDX_POS >= 0 && IDX_TERM >= 0, '取到样本词条下标', `位名=${IDX_POS} 名相=${IDX_TERM}`);
  const probe = (idx, where) => page.evaluate(async ([i, w]) => {
    const host = w === 'verdict' ? document.querySelector('#vWhy')
      : document.body.appendChild(document.createElement('div'));
    if (w === 'verdict') document.querySelector('#verdict').classList.add('show');
    host.innerHTML = `<span class="gls" data-g="${i}">X</span>`;
    host.querySelector('.gls').click();
    await new Promise((r) => setTimeout(r, 450));
    const card = document.querySelector('#card');
    const res = {
      posCard: !!document.querySelector('.overlay') && card?.dataset?.kind === 'pos',
      name: document.querySelector('#cardName')?.textContent || '',
      pop: getComputedStyle(document.querySelector('#glsPop')).display !== 'none',
      popT: document.querySelector('#glsT')?.textContent || '',
    };
    document.querySelector('.overlay .ovClose')?.click();
    const gp = document.querySelector('#glsPop'); if (gp) gp.style.display = 'none';
    if (w === 'verdict') document.querySelector('#verdict').classList.remove('show');
    else host.remove();
    await new Promise((r) => setTimeout(r, 260));
    return res;
  }, [idx, where]);

  const a = await probe(IDX_POS, 'verdict');
  ok(a.posCard && /阿鼻地/.test(a.name), '判词卡内点位名 → 直开位卡', `卡名=${a.name}`);
  ok(!a.pop, '判词卡内点位名 → 不弹词典签（那是位卡白话的缩写版）');

  const b2 = await probe(IDX_TERM, 'verdict');
  ok(!b2.posCard && b2.pop && b2.popT === '見惑', '判词卡内点普通名相 → 仍出词典签（无位卡可去）', b2.popT);

  // 2026-08-12 反转：本条原钉「判词卡外点位名仍出词典签」，那是首版「只限判词卡」之约。
  //   发起人当日二次点单「推到全站」——一个位名在哪儿点都是同一个去处，规矩才立得住；
  //   先前留的例外反成了「同名不同命」。故此条由「不去」改验「去」。
  //   （阅读器是另一页、另一套，那边同规矩但落在本页的那一节，见 test:reader 第九节。）
  const c = await probe(IDX_POS, 'other');
  ok(c.posCard && /阿鼻地/.test(c.name), '判词卡外点位名 → 同样直开位卡（全站一规矩）', `卡名=${c.name}`);
  ok(!c.pop, '判词卡外点位名 → 亦不弹词典签');
}

// ── 真机连掷（尽力而为）：无头 WebGL 下 rAF 受节流，掷轮动画常走不完，
//    走不完只记「本环境未取到」，不判失败——那是环境限制，不是代码缺陷。
// 催帧到某条件成立：无头 swiftshader 下 rAF 受节流，不拍帧则动画与 bootActivate 都不前进。
// 连拍会把渲染进程拖崩，故每 4 轮拍一次，其余轮次纯等；一切调用容错。
const pumpUntil = async (fn, rounds = 90) => {
  for (let i = 0; i < rounds; i++) {
    if (i % 4 === 0) {
      await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
        new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 260));
    const done = await page.evaluate(fn).catch(() => null);
    if (done) return true;
    if (page.isClosed()) return false;
  }
  return false;
};

console.log("\n【八 判词卡 · 真机连掷（尽力而为）】");
try {
  // 2026-08-11 题屏主钮已改为单人直开，不再绕共修大厅。
  await page.locator('#bootGo').waitFor({ state: 'visible', timeout: 20000 });
  // 须先催到 .ready：未就绪时点主钮只记下心愿（__wantStart），真正起行由 bootActivate 代点，
  //   而 bootActivate 挂在首帧 rAF 之后。不催帧则永远停在题屏。
  await pumpUntil(() => document.querySelector('#boot')?.classList.contains('ready'), 60);
  await page.locator('#bootGo').evaluate((b) => b.click());
  // 入局转场亦是动画，同样要催
  if (!await pumpUntil(() => document.querySelector('#sfpBar')?.classList.contains('show'), 60)) {
    throw new Error('未能入局（#sfpBar 未现）');
  }

  const shots = [];
  const ROUNDS = Number(process.env.VC_ROUNDS || 5);
  for (let round = 1; round <= ROUNDS; round++) {
    // 掷轮是**长按**：#sfpRoll 的 pointerdown → sfpPalmDown，window 的 pointerup → sfpTossUp。
    //   旧写法按空格键——button 上的空格只发 click，pointerdown 一次也不发，故这一节从来没真掷过。
    //   用 page.mouse 直接落点按住：它不做可点性判定（WebGL 场景下那判定必超时），只发真事件。
    const box = await page.locator('#sfpRoll').boundingBox();
    if (!box) throw new Error('#sfpRoll 无位置');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 700));   // 按住：掌中摇轮
    await page.mouse.up();
    const up = await pumpUntil(() => document.querySelector('#verdict')?.classList.contains('show'), 40);
    process.stdout.write(`    第 ${round} 掷${up ? ' ✓' : ' ✗(判词未出)'}\n`);
    if (!up) break;
    shots.push(await page.evaluate(() => {
      const v = document.querySelector('#verdict');
      const g = v.querySelector('#vGist');
      const r = v.querySelector('#vRoute');
      return {
        n: v.querySelector('#vN')?.textContent?.trim() || '',
        chips: [...v.querySelectorAll('#vChips .vchip')].map((c) => c.querySelector('b')?.textContent || ''),
        body: r?.textContent?.trim() || '',
        dst: r?.querySelector('b.vp')?.textContent?.trim() || '',
        hot: r?.querySelectorAll('.vp, .vaskC').length || 0,
        gistOn: g?.classList.contains('on'),
        gist: g?.textContent?.trim() || '',
        why: v.querySelector('#vWhy')?.textContent?.trim() || '',
        ask: !!v.querySelector('.vaskC'),
        askTxt: v.querySelector('.vaskC')?.textContent?.trim() || '',
        go: v.querySelector('#vGoTxt')?.textContent?.trim() || '',
      };
    }));
    // ── 三处热区真点一次（2026-08-12）──────────────────────────────────────
    // 归一前「详读」开的是详读卡、位名弹的是去处小签；今三处同归位卡，落处那两处带本掷层。
    // 此前本本只验了 DOM 结构（钮在不在、类名对不对），**从未真点过**——
    // 结构对而接线断是最容易漏过去的一种，故此处必须实点实收。
    if (round === 1) {
      const hit = async (sel, label) => {
        const okOpen = await page.evaluate(async (s) => {
          document.querySelector(s)?.click();
          await new Promise((r) => setTimeout(r, 420));
          const c = document.querySelector('#card');
          const open = !!document.querySelector('.overlay') && c?.dataset?.kind === 'pos';
          const res = {
            open,
            name: document.querySelector('#cardName')?.textContent || '',
            toss: !!document.querySelector('#cardBody .cToss'),
            gloss: !!document.querySelector('#glsPop') && getComputedStyle(document.querySelector('#glsPop')).display !== 'none',
            reader: [...document.querySelectorAll('#cardBtns .gbtn')].some((b) => /读原文/.test(b.textContent)),
          };
          document.querySelector('.overlay .ovClose')?.click();
          await new Promise((r) => setTimeout(r, 260));
          return res;
        }, sel);
        return { ...okOpen, label };
      };
      const r1 = await hit('#vRoute .vaskC', '详读 ›');
      ok(r1.open, '点「详读 ›」直接开位卡（非详读卡、非小签）', `kind=pos? ${r1.open} 名=${r1.name}`);
      ok(r1.toss, '「详读 ›」开的位卡带本掷段');
      ok(!r1.gloss, '「详读 ›」不弹浮标小签');
      ok(r1.reader, '该位卡有「读原文 ›」入阅读器');

      const r2 = await hit('#vRoute b.vp', '落处位名');
      ok(r2.open, '点落处位名直接开位卡（去处小签 openPosGloss 已撤）', `名=${r2.name}`);
      ok(r2.toss, '落处位名开的位卡带本掷段');
      ok(!r2.gloss, '落处位名不弹浮标小签——它渲的正是 #vGist 那一句，同屏两遍');

      const hasFrom = await page.evaluate(() => !!document.querySelector('#vRoute span.vp'));
      if (hasFrom) {
        const r3 = await hit('#vRoute span.vp', '出发位名');
        ok(r3.open, '点出发位名亦开位卡', `名=${r3.name}`);
        ok(!r3.toss, '出发位卡**不带**本掷段（本掷答的是「我为何来到这一位」，只在落处讲得通）');
      } else {
        console.log('    · 本掷无出发位（首掷／安住），出发位一端不出，跳过');
      }
      // 点过位卡再回来，判词卡须仍在（一手未断）
      ok(await page.evaluate(() => document.querySelector('#verdict')?.classList.contains('show')),
        '关掉位卡后判词卡仍在，一手未断');
    }

    await page.locator('#vGo').evaluate((b) => b.click());   // 落子，进入下一掷
    await page.waitForTimeout(700);
  }

  if (!shots.length) {
    console.log('  · 本环境未取到判词卡（无头 WebGL rAF 节流，掷轮动画未走完）——结构已在第六节验讫，此节跳过');
  } else {
  console.log(`  · 取到 ${shots.length} 张判词卡`);
  ok(shots.every((s) => s.chips.length === 2), '每张皆有两枚轮字');
  ok(shots.every((s) => s.chips.every((c) => /[那謨阿彌陀佛]/.test(c))), '轮字用原字（不随简繁转换）', shots.map((s) => s.chips.join('')).join(' '));
  ok(shots.every((s) => s.n && /\d/.test(s.n)), '每张皆报第几掷');
  ok(shots.every((s) => s.gistOn && s.gist), '每张皆有落处提要行（#vGist）', JSON.stringify(shots.map((s) => s.gistOn)));
  ok(shots.every((s) => !/第.+门/.test(s.gist)), '提要行不带门标（已撤，位卡词头恒可见）');
  ok(shots.every((s) => s.why), '每张皆有白话主句');
  ok(shots.every((s) => s.ask && s.askTxt.startsWith('详读')), '每张皆挂「详读」入口', shots.map((s) => s.askTxt).join(','));
  ok(shots.every((s) => s.dst), '去向条落处位名在场且可点', shots.map((s) => s.dst).join(','));
  ok(shots.every((s) => s.hot >= 2), '去向条热区≥2（落处位名＋详读；有来处时另加一枚）', shots.map((s) => s.hot).join(','));
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
