#!/usr/bin/env node
// 選佛譜正本 API · 數據生成器
//
// 由七處正本合成 api/src/canon.js（打進 Worker bundle，勿手改）：
//   · 正本/门NN.js          —— 白话正本 4620 格（「白话 ‖ 引文」定式）
//   · src/sfp-data.js       —— SFP_POS 220 位（moves 定去处与贈掷）、SFP_DOORS、SFP_META
//   · src/sfp-canon.js      —— 卷首卷末四篇原文、十五门总说原文
//   · src/sfp-canon-split.js—— 220 位位文切点（义解段｜行法段｜后论）
//   · src/sfp-pos-baihua.js —— 位注白话 220
//   · src/sfp-door-baihua.js—— 门义白话 15
//   · src/sfp-front-baihua.js—— 卷首卷末四篇白话 4 ＋ 位下後論白话 6
//   · 全文/corpus.json      —— 全书原文 692 块（76276 字，人工分块）
//   · 承注/rules/gNN.json   —— 只取 meta.juan 补门的卷次
//
// 判定码：0 行　1 不行　2 贈掷　3 無行法（门十五终局，本无行法，非此路不通）
// 去重：白话与引文各存一份，格只存索引——引文重复极多（通则一句常管数十格）。
//
// 用法：node api/build.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const load = (rel) => import(pathToFileURL(join(ROOT, rel)));

const { SFP_POS, SFP_DOORS, SFP_META } = await load('src/sfp-data.js');
const { ZH_T2S } = await load('src/zh-conv.js');
const { SFP_CANON_FRONT, SFP_CANON_DOORS } = await load('src/sfp-canon.js');
const { SFP_CANON_SPLIT, sfpSplitOf } = await load('src/sfp-canon-split.js');
const { SFP_POS_BAIHUA } = await load('src/sfp-pos-baihua.js');
const { SFP_DOOR_BAIHUA } = await load('src/sfp-door-baihua.js');
const { SFP_FRONT_BAIHUA, SFP_POST_BAIHUA } = await load('src/sfp-front-baihua.js');
const CORPUS = JSON.parse(readFileSync(join(ROOT, '全文/corpus.json'), 'utf8'));

// ── 繁→簡：用戶多以簡體檢索，位名底本是繁體 ────────────────────
const MAXLEN = Math.max(...Object.keys(ZH_T2S).map((k) => k.length));
function t2s(str) {
  let r = '', i = 0;
  while (i < str.length) {
    let hit = 0;
    for (let L = Math.min(MAXLEN, str.length - i); L >= 1; L -= 1) {
      const seg = str.substr(i, L);
      if (ZH_T2S[seg] !== undefined) { r += ZH_T2S[seg]; i += L; hit = 1; break; }
    }
    if (!hit) { r += str[i]; i += 1; }
  }
  return r;
}

// ── 二十一相：標準十五序 ＋ 相雜六相（與 canon-route.js、check.mjs 同序，不得改動）──
const COMBOS = [
  '那那', '那謨', '謨謨', '阿阿', '阿彌', '彌彌', '阿陀', '彌陀', '陀陀',
  '那佛', '謨佛', '阿佛', '彌佛', '陀佛', '佛佛',
  '那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀',
];
const VERDICT_GO = 0, VERDICT_STAY = 1, VERDICT_BONUS = 2, VERDICT_NONE = 3;

// ── 讀白话正本 ──────────────────────────────────────────────
const 正本 = {};
for (let d = 1; d <= 15; d += 1) {
  const mod = await load(`正本/门${String(d).padStart(2, '0')}.js`);
  Object.assign(正本, mod.default);
}
if (Object.keys(正本).length !== 4620) throw new Error(`正本格数 ${Object.keys(正本).length} ≠ 4620`);

// ── 門的卷次：取自承注庫 meta.juan ──────────────────────────
const juanOf = new Map();
for (let d = 1; d <= 15; d += 1) {
  const p = join(ROOT, '承注/rules', `g${String(d).padStart(2, '0')}.json`);
  if (!existsSync(p)) continue;
  try { juanOf.set(d, JSON.parse(readFileSync(p, 'utf8'))?.meta?.juan ?? null); } catch { /* 缺卷次不致命 */ }
}

// ── 去重表 ──────────────────────────────────────────────────
const plainIdx = new Map(), citeIdx = new Map();
const PLAIN = [], CITE = [];
const put = (map, arr, s) => {
  if (!map.has(s)) { map.set(s, arr.length); arr.push(s); }
  return map.get(s);
};

// 底本逐字皆以「譜曰。」領起，結構化本無之；互校前先去領起
const stripQi = (s) => String(s || '').replace(/^譜曰[。：:]\s*/, '');

// 門十五位「佛」的題下六句標目——位名之下、譜曰之前的標目句，全譜僅此一位有。
// 底本抽取把它連同位名掃進了門總說欄，故此處另立，並校底本串未變。
const DOOR15_HEADS = ['圓教究竟妙覺位', '圓滿菩提', '歸無所得', '實報寂光上上品', '身土不二', '理智一如'];
if (stripQi(SFP_CANON_DOORS[15]?.intro) !== '佛' + DOOR15_HEADS.join('')) {
  throw new Error('门15底本标目串已变，须重核 DOOR15_HEADS');
}

// 白话层通用整形：去掉空字段，省體積；rows 原样保留（{k,v} 明细行）
function bh(o) {
  if (!o) return null;
  const r = { v: o.v };
  if (o.rows?.length) r.rows = o.rows;
  if (o.src) r.src = o.src;
  if (o.ext) r.ext = o.ext;
  if (o.self) r.self = 1;          // 本項目自撰導語（門1・2・15 原譜無總說）
  if (o.partial) r.partial = 1;    // 白话只承担「这一位是什么」，原文另有长文
  if (o.q) r.q = o.q;              // 存疑留痕
  return r;
}

// ── 位 ──────────────────────────────────────────────────────
const posNo = new Map();
SFP_POS.forEach((p, i) => { posNo.set(p.name, i); posNo.set(p.id, i); });

// 位注原文兩本互校：SFP_CANON_DOORS[n].positions[].text 是底本逐字（帶「譜曰。」領起），
// SFP_POS[].note 是既有結構化本。去領起後須逐字相同——白话正本的引文皆繫於此，一旦漂移即誤。
const canonPosText = new Map();
for (const [no, g] of Object.entries(SFP_CANON_DOORS)) {
  for (const p of (g.positions || [])) canonPosText.set(`${no}|${p.name}`, stripQi(p.text));
}
// 比對前去空白：結構化本以全角空格分隔逐組輪相之文（「…故是地獄因也。　那那。則…」），
// 底本連寫無之。空白是排印之別，非文字之別，故按去空白逐字比。
const bare = (s) => String(s || '').replace(/[\s　]/g, '');

// 兩本對 CBETA **夾注**（小字注，底本作括號）的處置不同，這是編輯政策之別，非數據漂移：
//   底本 SFP_CANON_DOORS —— 括號連內容整條刪去
//   結構化本 SFP_POS.note —— 去括號而留字
// 如〈八關齋戒〉「故功行稍勝也。(初八日。十四日…)」、〈初發心住〉「亦是勝進接也。
// (從淨土來者。不行那那。下五位准知。)」、十三處「(文)」引文完結標記。
// 故 API 取結構化本：它字多而不少，且白话正本四六二〇格的引文皆繫於它。
//
// 校法三檔：① 逐字相同　② 底本為結構化本之**子序列**（＝差別純是夾注增補）
// ③ 二者皆否——必是異體字或真漂移，須在下表登記，未登記者當場報錯。
// 兩本另有二處異體字（同字異形，非異文）：〈彌勒內院〉迴／囘、〈八背捨觀〉脛／𨄔。
// 比對前先歸一，否則異體字會把該位從「夾注之別」誤判成真漂移。
const VARIANTS = [['迴', '囘'], ['脛', '𨄔']];
const norm = (s) => {
  let r = bare(s);
  for (const [std, alt] of VARIANTS) r = r.split(alt).join(std);
  return r;
};
const isSubseq = (a, b) => { let i = 0; for (const ch of b) { if (ch === a[i]) i += 1; if (i === a.length) return true; } return i === a.length; };

let posTextSame = 0, posTextSkipped = 0;
const posTextJiazhu = [];
for (const p of SFP_POS) {
  const c = canonPosText.get(`${p.door}|${p.name}`) ?? canonPosText.get(`${p.door}|${p.id}`);
  if (c === undefined) { posTextSkipped += 1; continue; }
  const a = norm(c), b = norm(p.note);
  if (a === b) { posTextSame += 1; continue; }
  if (isSubseq(a, b)) { posTextJiazhu.push(p.name); continue; }
  // 既非逐字相同、又非底本⊆結構本，即是真漂移，當場報錯
  throw new Error(`位注两本不符且非夹注之别：${p.name}（底本 ${a.length} 字 ／ 结构本 ${b.length} 字）`);
}

let splitAct = 0, splitPost = 0;
const POS = SFP_POS.map((p) => {
  const o = { n: p.name, g: p.door, a: p.anchor, d: p.note || '' };
  const s = t2s(p.name);
  if (s !== p.name) o.s = s;
  if (p.id !== p.name) o.f = p.id;
  if (p.start) o.start = p.start;
  if (p.pure) o.pure = 1;
  if (p.terminal) o.terminal = 1;
  // 題下標目：位名之下、譜曰之前的標目句。全譜僅門十五「佛」有六句。
  if (p.door === 15) o.heads = DOOR15_HEADS;

  // 位文切点：義解段｜行法段｜後論。存偏移而非再抄一遍正文。
  const seg = sfpSplitOf(p.name, o.d);
  if (seg.jie + seg.act + seg.post !== o.d) throw new Error(`切点拼回不符：${p.name}`);
  const at = seg.act ? seg.jie.length : -1;
  const pt = seg.post ? seg.jie.length + seg.act.length : -1;
  o.cut = [at, pt];
  if (at >= 0) splitAct += 1;
  if (pt >= 0) splitPost += 1;
  return o;
});

// 門十五之位，位表作「佛」而白话以正式全名「圓教究竟妙覺位」立鍵（同 moves.to 之例），故兩收
const POSBH = SFP_POS.map((p) => bh(SFP_POS_BAIHUA[p.name] ?? SFP_POS_BAIHUA[p.id]));
const missBH = POSBH.filter((x) => !x).length;
if (missBH) throw new Error(`位注白话缺 ${missBH} 位`);

// 位下後論白话 6 段（不屬二十一相中任何一相，是通論或自設問答）
const POSTBH = {};
for (const [k, v] of Object.entries(SFP_POST_BAIHUA)) {
  if (posNo.get(k) === undefined) throw new Error(`後論白话有位表所无之位：${k}`);
  POSTBH[String(posNo.get(k))] = bh(v);
}
for (const [i, p] of POS.entries()) {
  const hasPost = p.cut[1] >= 0, hasBH = POSTBH[String(i)] !== undefined;
  if (hasPost !== hasBH) throw new Error(`後論與白话不相配：${p.n}（原文${hasPost ? '有' : '无'}・白话${hasBH ? '有' : '无'}）`);
}

// ── 格：220 × 21 ────────────────────────────────────────────
const stat = { 行: 0, 不行: 0, 贈掷: 0, 無行法: 0 };
const CELLS = SFP_POS.map((p) => {
  const mv = new Map();
  for (const m of (p.moves || [])) for (const c of m.c) mv.set(c, m);
  return COMBOS.map((c) => {
    const raw = 正本[`${p.name}|${c}`];
    if (raw === undefined) throw new Error(`正本缺格：${p.name}|${c}`);
    const cut = raw.indexOf('‖');
    if (cut < 0) throw new Error(`格无引文分隔：${p.name}|${c}`);
    const plain = raw.slice(0, cut).trim();
    const cite = raw.slice(cut + 1).trim();

    const m = mv.get(c);
    let v, to = -1, bonus = 0;
    if (p.door === 15) { v = VERDICT_NONE; stat.無行法 += 1; }
    else if (!m) { v = VERDICT_STAY; stat.不行 += 1; }
    else if (m.bonus) { v = VERDICT_BONUS; bonus = m.bonus; stat.贈掷 += 1; }
    else {
      v = VERDICT_GO; stat.行 += 1;
      to = posNo.get(m.to);
      if (to === undefined) throw new Error(`去处不在位表：${p.name}|${c} → ${m.to}`);
    }
    return [v, to, bonus, put(plainIdx, PLAIN, plain), put(citeIdx, CITE, cite)];
  });
});

// ── 門 ──────────────────────────────────────────────────────
// 門總說原文兩本互校：SFP_CANON_DOORS[n].intro 是底本逐字（帶「譜曰。」領起），
// SFP_DOORS[n].intro 是既有結構化本（無領起）。去領起後須逐字相同，異則報錯——
// 兩本任一漂移即當場暴露，勝過默默取其一。對外仍出無領起之形（同 v1.0，不動既有消費方）。
// 門十五是唯一例外：底本抽取把位名「佛」及其下六句標目掃進了 intro，而原譜本門**無總說**
// （同門1、門2）。六句標目是位「佛」的題下標目，不是門總說，故不在此出，另掛該位 heads 欄。
// 除此一處，兩本須逐字相同。
const DOORS = SFP_DOORS.map((d) => {
  const idx = SFP_POS.reduce((a, p, i) => (p.door === d.no ? [...a, i] : a), []);
  const canonIntro = d.no === 15 ? '' : stripQi(SFP_CANON_DOORS[d.no]?.intro);
  const plainIntro = String(d.intro || '');
  if (canonIntro !== plainIntro) {
    throw new Error(`门${d.no}总说两本不符：底本 ${canonIntro.length} 字 ／ 结构本 ${plainIntro.length} 字`);
  }
  return {
    no: d.no,
    t: d.title,
    s: t2s(d.title),
    intro: plainIntro,                 // 門首總說原文（門1・2・15 原譜無，為空串）
    juan: juanOf.get(d.no) ?? null,
    from: idx[0],
    count: idx.length,
  };
});
for (const d of DOORS) {
  const seg = SFP_POS.slice(d.from, d.from + d.count);
  if (!seg.every((p) => p.door === d.no)) throw new Error(`门${d.no}位序不连续`);
}
const DOORBH = DOORS.map((d) => bh(SFP_DOOR_BAIHUA[d.no] ?? SFP_DOOR_BAIHUA[String(d.no)]));
if (DOORBH.some((x) => !x)) throw new Error('门义白话有缺');

// ── 卷首卷末四篇：原文 ＋ 白话 ────────────────────────────────
const FRONT = SFP_CANON_FRONT.map((f) => {
  const b = SFP_FRONT_BAIHUA[f.title];
  if (!b) throw new Error(`卷首篇缺白话：${f.title}`);
  return { juan: f.juan, title: f.title, s: t2s(f.title), text: f.text, bh: bh(b) };
});

// ── 全書原文 692 塊 ─────────────────────────────────────────
// 兩塊（六妙門禪・十六特勝位注）錨句 to 為空，母本未取到正文——如實留空並標記，
// 不以位注全文冒充：位注原文另在 /v1/positions 出，此處不作偽。
let emptyText = 0;
const TEXT = CORPUS.blocks.map((b) => {
  const o = { id: b.id, juan: b.juan, line: b.line, sec: b.sec, kind: b.kind, title: b.title, text: b.text || '' };
  if (!o.text) { o.empty = 1; emptyText += 1; }
  if (b.terms?.length) o.terms = b.terms;
  if (b.note) o.note = b.note;
  const pi = posNo.get(b.sec);
  if (pi !== undefined) o.pos = pi;      // 該塊所屬之位（便於由位跳全文）
  return o;
});

// ── 落盤 ────────────────────────────────────────────────────
const banner = `// 選佛譜正本 · API 內建數據（由 api/build.mjs 生成，勿手改）
//
// 底本：蕅益智旭《選佛譜》六卷 · 大藏經補編第24冊 No.136（CBETA 電子佛典，公版古籍）
// 白话正本：正本/门01.js…门15.js　位注白话：src/sfp-pos-baihua.js
// 門義白话：src/sfp-door-baihua.js　卷首卷末與後論白话：src/sfp-front-baihua.js
// 位文切点：src/sfp-canon-split.js　全書原文：全文/corpus.json
//
// 結構：
//   POS[i]    位 { n 繁名, s 簡名, f 正式全名, g 門號, a 法界錨點, d 位注原文全文,
//                 cut [行法段起, 後論起]（-1 表無，皆為 d 之偏移） }
//   POSBH[i]  位注白话 { v, rows, src, ext, partial, q }（與 POS 同序）
//   POSTBH    位下後論白话，鍵為位序串（全譜 6 位）
//   DOORS[i]  門 { no, t 門名, s 簡名, intro 門首總說原文, juan 卷次, from 起始位序, count 位數 }
//   DOORBH[i] 門義白话（與 DOORS 同序；self=1 者為本項目自撰導語，原譜無此門總說）
//   FRONT[i]  卷首卷末四篇 { juan, title, text 原文, bh 白话 }
//   TEXT[i]   全書原文塊 { id, juan, line, sec, kind, title, text, terms, note, pos 所屬位序 }
//   CELLS[位序][相序] = [判定, 去向位序, 贈數, 白话→PLAIN, 引文→CITE]
//     判定 0＝行　1＝不行　2＝贈擲　3＝無行法（門十五終局：本無行法，非此路不通）
//
// 生成統計：格 4620（行 ${stat.行}・不行 ${stat.不行}・贈擲 ${stat.贈掷}・無行法 ${stat.無行法}）
//           位注切点：有行法段 ${splitAct}・另有後論 ${splitPost}・無行法段 ${220 - splitAct}
//           全書原文 ${TEXT.length} 塊 ${TEXT.reduce((a, b) => a + b.text.length, 0)} 字（${emptyText} 塊母本未取到正文）
`;

const out = [
  banner,
  `export const META = ${JSON.stringify(SFP_META)};`,
  `export const COMBOS = ${JSON.stringify(COMBOS)};`,
  `export const DOORS = ${JSON.stringify(DOORS)};`,
  `export const DOORBH = ${JSON.stringify(DOORBH)};`,
  `export const POS = ${JSON.stringify(POS)};`,
  `export const POSBH = ${JSON.stringify(POSBH)};`,
  `export const POSTBH = ${JSON.stringify(POSTBH)};`,
  `export const FRONT = ${JSON.stringify(FRONT)};`,
  `export const TEXT = ${JSON.stringify(TEXT)};`,
  `export const PLAIN = ${JSON.stringify(PLAIN)};`,
  `export const CITE = ${JSON.stringify(CITE)};`,
  `export const CELLS = ${JSON.stringify(CELLS)};`,
  `export const STAT = ${JSON.stringify({
    doors: DOORS.length,
    positions: POS.length,
    cells: 4620,
    ...stat,
    text_blocks: TEXT.length,
    text_chars: TEXT.reduce((a, b) => a + b.text.length, 0),
    front_sections: FRONT.length,
    postscripts: Object.keys(POSTBH).length,
  })};`,
  '',
].join('\n');

mkdirSync(join(HERE, 'src'), { recursive: true });
writeFileSync(join(HERE, 'src/canon.js'), out);

console.log('✓ api/src/canon.js');
console.log(`  門 ${DOORS.length}　位 ${POS.length}　格 4620`);
console.log(`  判定：行 ${stat.行}・不行 ${stat.不行}・贈擲 ${stat.贈掷}・無行法 ${stat.無行法}`);
console.log(`  白话：位注 ${POSBH.length}　門義 ${DOORBH.length}　卷首卷末 ${FRONT.length}　後論 ${Object.keys(POSTBH).length}`);
console.log(`  互校：位注两本逐字相同 ${posTextSame} 位・夹注之别 ${posTextJiazhu.length} 位（底本删夹注，API 取字多之结构本）`);
console.log(`  切点：有行法段 ${splitAct}　另有後論 ${splitPost}　無行法段 ${220 - splitAct}`);
console.log(`  全書原文：${TEXT.length} 塊 ${TEXT.reduce((a, b) => a + b.text.length, 0)} 字（${emptyText} 塊母本未取到正文）`);
console.log(`  去重：白话 ${PLAIN.length} 條・引文 ${CITE.length} 條`);
console.log(`  體積 ${(out.length / 1024).toFixed(0)} KB（未壓縮）`);
