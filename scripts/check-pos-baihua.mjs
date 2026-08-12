// 位注白话手译本核验 · 诚实闸门
// 手译最容易出的不老实：写成简体（名相浮标失效）、出处对不上卷次、缺行标或行标超宽、
//   ext 补注凭记忆冒经。本脚本逐条量给数字，不靠自觉。运行：node scripts/check-pos-baihua.mjs
// 注：「与原文字面重合度」一项 2026-08-08 起只量不判（缘由见下文该处）——
//   译得好不好，判准是读者读得懂、明白，不是这个百分数。
import { SFP_POS } from '../src/sfp-data.js';
import { SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { sfpSplitOf } from '../src/sfp-canon-split.js';
import { SFP_POS_BAIHUA } from '../src/sfp-pos-baihua.js';
import { SFP_GLOSS } from '../src/sfp-gloss.js';
import { ZH_T2S, ZH_S2T } from '../src/zh-conv.js';

const CN = '一二三四五六七八九十'.split('').concat(['十一', '十二', '十三', '十四', '十五']);
const conv = (s, d) => [...String(s)].map((c) => d[c] || c).join('');

// 义解段的切分：2026-08-12 起与游戏端同走 sfpSplitOf（220 位逐位手核的切点表，有 check:split 护栏）。
//   此前本脚本自带一份 canonPosOnly 抄件（拿证据引文反查最早出现处），游戏端改了它不改，
//   两边口径即刻漂移——护栏量的是一段，卡上呈的是另一段。今删抄件，一处定口径。
//   注：切点表按**谱面位名**索引，终位题作「佛」，故须传 canonOf 里那个 x.name。
const canonOf = (p) => {
  const d = SFP_CANON_DOORS[p.door];
  const x = ((d && d.positions) || []).find((q) => q.name === p.name || q.name === p.id || (q.name === '佛' && p.id === '圓教究竟妙覺位'));
  return {
    text: x ? String(x.text || '').replace(/^譜曰。/, '') : '',
    name: x ? x.name : p.name,
    juan: (d && d.juan) || 1,
  };
};

const BY_ID = Object.fromEntries(SFP_POS.map((p) => [p.id, p]));
// 名相浮标只认繁体键：简体正文一个也匹配不上，故白话须以繁体存
const GLS_TRAD = SFP_GLOSS.map((g) => g[0]).filter((k) => conv(k, ZH_T2S) !== k);
const norm = (s) => conv(s, ZH_T2S).replace(/[，。、；：（）「」〈〉·—…\s]/g, '');
const overlap = (a, b) => { const B = new Set(norm(b)); const A = norm(a); return A.length ? [...A].filter((c) => B.has(c)).length / A.length : 0; };

const keys = Object.keys(SFP_POS_BAIHUA);
const err = [], warn = [], partials = [], quests = [], pending = [], ready = [];

// ① 键必须真有其位
keys.forEach((k) => { if (!BY_ID[k]) err.push(`未知位 id：${k}`); });

// ② 逐条量
const stats = [];
for (const k of keys) {
  const p = BY_ID[k]; if (!p) continue;
  const e = SFP_POS_BAIHUA[k];
  const c = canonOf(p);
  const head = (sfpSplitOf(c.name, c.text).jie || c.text).trim();
  const v = String(e.v || '');
  const rows = e.rows || [];
  // 清单式内容走 rows：领起句留 v，明细入行。量重合度、查字形、判译足，一律以「领起句＋各行」合计为准；
  // 「超出常度」则只量领起句——rows 本就是拆开来给人扫的，不该按整段长度苛责。
  const full = v + rows.map((r) => String(r.k || '') + String(r.v || '')).join('');

  if (!full) { err.push(`${k}：白话为空`); continue; }
  if (!v) err.push(`${k}：只有 rows 而无领起句——明细行须有一句话领起，不可劈头就是清单`);
  if (!e.src) err.push(`${k}：缺 src 出处`);
  rows.forEach((r, i) => {
    if (!r.k) err.push(`${k}：第 ${i + 1} 行缺行标 k`);
    else if ([...String(r.k)].length > 4) err.push(`${k}：行标「${r.k}」超四字——卡上行标栏仅 3.6em`);
    if (!r.v) err.push(`${k}：行标「${r.k}」无正文`);
  });
  if (rows.length > 7) warn.push(`${k}：${rows.length} 行，超卡上 CARD_ROW_MAX=7，余行会被折叠`);

  // 出处卷次须与 canon 实际卷次相符
  const wantJuan = `卷第${CN[c.juan - 1]}`;
  if (e.src && !String(e.src).includes(wantJuan)) err.push(`${k}：出处卷次不符，应为 ${wantJuan}，实为「${e.src}」`);
  if (e.src && !String(e.src).includes(`〈${p.name}〉`)) err.push(`${k}：出处未标本位名〈${p.name}〉`);

  // 字形须繁体：折繁后若有变化，说明正文混入了简体字
  const toTrad = conv(full, ZH_S2T);
  if (toTrad !== full) {
    const bad = [...full].filter((ch, i) => toTrad[i] !== ch);
    warn.push(`${k}：混入简体字 ${[...new Set(bad)].join('')} —— 名相浮标只认繁体键，会漏标`);
  }

  // 与原文义解段的字面重合度：只量不判（2026-08-08 发起人定案，此闸作废）。
  // 原设 ≥85% 判错、≥78% 提醒，是防「抄原文充白话」。但推进到门8 见其反噬：
  //   禅法诸位（十六特勝十六目、十想十目、八背捨八目）名目本身即是原文的词，
  //   照录则重合必高，而名目又不可改——「無常想」不能译成别的说法。
  //   为压这个数字，只能往正文里灌与义理无关的虚字，那是为指标而写，不是为读者而写。
  // 判准回到本来该在的地方：读者读得懂、明白，就是好白话；数字仅供参看，不再是闸门。
  const ov = overlap(full, head);

  // 文言腔残留：句末虚字
  const tail = full.match(/[也矣焉哉]。/g) || [];
  if (tail.length) warn.push(`${k}：句末文言虚字 ${tail.join(' ')} ×${tail.length}`);

  // 长度：译足看合计，常度只量领起句（rows 拆开来扫，不按整段苛责）
  if (full.length < 30) warn.push(`${k}：仅 ${full.length} 字，恐未译足`);
  if (v.length > 160) warn.push(`${k}：领起句 ${v.length} 字，太长，宜收束或拆入 rows`);

  // partial 须名副其实：原文义解段确实远长于白话才算；长篇若已分行覆译，不因字数长就强制 partial。
  if (e.partial && head.length < full.length * 1.6) warn.push(`${k}：标了 partial，但原文义解段仅 ${head.length} 字（白话合计 ${full.length} 字），标记恐不必要`);
  if (!e.partial && head.length > 400 && full.length < head.length * 0.45)
    warn.push(`${k}：原文义解段 ${head.length} 字，白话仅 ${full.length} 字且未标 partial，恐有漏译`);

  if (e.partial) partials.push(k);
  if (e.q) quests.push(`${k}：${e.q}`);

  // ④ 他经补注：必标书名；他经逐字必带 CBETA 行号；带 verify 者为待核稿，不得上卡
  for (const x of (e.ext || [])) {
    if (!x.v) err.push(`${k}：ext 补注无正文`);
    if (!x.src) { err.push(`${k}：ext 补注缺 src，补注必标出处`); continue; }
    if (!/《[^》]+》/.test(String(x.src))) err.push(`${k}：ext 出处未标书名《…》——「${x.src}」`);
    const isSelf = String(x.src).includes('《選佛譜》'); // 本谱内证不需 CBETA 行号
    if (!x.verify) {
      if (!x.canon) err.push(`${k}：ext 已除 verify 却无 canon 逐字原文——凭释义上卡即是冒经`);
      if (!isSelf && !/[TXJ]\d+n[A-Z]?\d+_p\d{4}[a-c]\d{2}/.test(String(x.src)))
        err.push(`${k}：ext 引他经而 src 无 CBETA 行号，无从复核——「${x.src}」`);
    }
    // 补注正文同样上卡，字形须繁体
    const xt = conv(String(x.v || ''), ZH_S2T);
    if (xt !== String(x.v || '')) {
      const bad = [...String(x.v)].filter((ch, i) => xt[i] !== ch);
      warn.push(`${k}：ext 补注混入简体字 ${[...new Set(bad)].join('')}`);
    }
    if (x.verify) pending.push(`${k} → ${x.src}　｜待核：${x.verify}`);
    else ready.push(`${k} → ${x.src}`);
  }

  // 名相覆盖：白话里用到的繁体词目数（浮标能标几处）
  const hits = GLS_TRAD.filter((t) => full.includes(t)).length;
  stats.push({ k, door: p.door, len: full.length, lead: v.length, nRows: rows.length,
    ov: Math.round(ov * 100), hits, head: head.length });
}

// ③ 进度
const doneByDoor = {};
stats.forEach((s) => { doneByDoor[s.door] = (doneByDoor[s.door] || 0) + 1; });
const totByDoor = {};
SFP_POS.forEach((p) => { totByDoor[p.door] = (totByDoor[p.door] || 0) + 1; });

console.log(`── 进度 ──`);
let done = 0;
for (let d = 1; d <= 15; d++) {
  const a = doneByDoor[d] || 0, b = totByDoor[d] || 0; done += a;
  console.log(`  门${String(d).padStart(2)}　${String(a).padStart(2)}/${String(b).padStart(2)}${a === b ? '　✓' : a ? '　…在译' : ''}`);
}
console.log(`  合计 ${done}/${SFP_POS.length}　（未译者卡上回落旧本 SFP_POS_PLAIN）`);

if (stats.length) {
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  console.log(`\n── 已译部分的量 ──`);
  console.log(`  白话字数（含明细行）中位 ${med(stats.map((s) => s.len))}　最短 ${Math.min(...stats.map((s) => s.len))}　最长 ${Math.max(...stats.map((s) => s.len))}`);
  console.log(`  领起句 中位 ${med(stats.map((s) => s.lead))} 字　　走明细行的 ${stats.filter((s) => s.nRows).length} 条（共 ${stats.reduce((a, s) => a + s.nRows, 0)} 行）`);
  console.log(`  与原文重合 中位 ${med(stats.map((s) => s.ov))}%　最高 ${Math.max(...stats.map((s) => s.ov))}%　（仅供参看，不判错）`);
  console.log(`  名相浮标命中 中位 ${med(stats.map((s) => s.hits))} 处/条　零命中 ${stats.filter((s) => !s.hits).length} 条`);
}
if (ready.length) console.log(`\n── 他经补注 · 已核可上卡 ${ready.length} 条 ──\n  ${ready.join('\n  ')}`);
if (pending.length) console.log(`\n── 他经补注 · 待核不上卡 ${pending.length} 条 ──\n  ${pending.join('\n  ')}`);
if (partials.length) console.log(`\n── partial（白话只承担「这是什么」，全文另读）${partials.length} 条 ──\n  ${partials.join('、')}`);
if (quests.length) console.log(`\n── 存疑留痕 ${quests.length} 条 ──\n  ${quests.join('\n  ')}`);
if (warn.length) console.log(`\n── 提醒 ${warn.length} 条 ──\n  ${warn.join('\n  ')}`);
if (err.length) { console.log(`\n── 错 ${err.length} 条 ──\n  ${err.join('\n  ')}`); process.exit(1); }
console.log(`\n✓ 已译 ${done} 条无硬错`);
