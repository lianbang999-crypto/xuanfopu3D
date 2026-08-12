// 《選佛譜》六卷原文阅读器 · 内容层
// ─────────────────────────────────────────────────────────────────────────────
// 缘起：「我的 › 六卷原文」旧是借道门卡（openDoor 的第三段「谱文·全文对读」），
//   那一段的形状是「查这一位」——依门切分、折叠内滚动、逐位对照；不是「从头读一部书」：
//   没有连续翻页、没有进度记忆、没有字号可调，也没有卷的概念。
//   game.js 旧注（2026-08-08 发起人立）写明「须待二百二十位白话全部译毕再动手」，
//   2026-08-11 该前提满足（门义 15/15、位注 220/220、逐组判词 4620/4620），遂立此本。
//
// 【本模块＝内容层】2026-08-12 起阅读器为独立页面 read.html（发起人拍板，
//   皮与交互延用 wenchao 纸墨形制，见 src/reader-page.js 文件头）。此处只余三件可复用的事：
//   readerNodes（六卷为经 239 节的骨架）、nodeKey（节键，进度与路由共用）、
//   nodeBodyHtml（一节正文的 HTML，样式类名由页面侧换皮）。
//   旧游戏内浮层（mountReader ＋ READER_CSS，2026-08-11–12 间的形态）随迁移撤除。
//
// 【三条定案】2026-08-11 发起人拍板：
//   ① 骨架＝**六卷为经、门为节**（非十五门为主）——书名叫「六卷原文」，读者须知自己在读第几卷。
//   ② 文白＝**三档切换**（文言／对照／白话），一个版面吃三种读法，记住上次那一档。
//   ③ 判词＝**义解连读，廿一相另作一表**（非随原文顺序穿插）。
//
// 【定案②③改立】2026-08-12 发起人拍板：**两档**（原文／白话），对照档撤。
//   ○ 原文档＝**照原书连读，整个不出廿一相表**。缘由是「承前」这件事：
//     全谱 4620 格判词里只 1786 格是本位原文，另 2834 格系承前引自他位或门首之文
//     （如门1〈見取〉一句「其餘位中。以阿彌陀善。與那謨惡相為對治」管着全谱几十位的那阿等六相）。
//     读原文时把别位的话摆进本位的表里，无论标不标「承前」都是替原书改写体例——
//     标了则一表之内七成是别人的话，不标则读者把别位的话当本位原文。今索性不出：
//     本位该有的行法之文，本就在本位原文的行法段里，连读自然读到。
//   ○ 廿一相表遂成**白话档专属**：那 4620 格白话是逐格译的，一格一相各说各话，
//     无所谓承前不承前（承前之义已在译时化入该格），故表在白话档下反而句句落在本位。
//   ○ 判词引文（.quote）与「谱曰／承前」题头随之全撤——它们本是对照档的语汇。
//
// 【两条硬约束】
//   ① 属性里只放**数字下标**，不放位名——本模块生成的整节 HTML 可能被调用方过 zh()
//      简繁转换，属性里的中文会跟着变形（AGENTS 陷阱）。glossify 的 data-g 亦只放下标，故安全。
//   ② 白话与原文都要过 glossify（名相浮标）——两个白话本的规约①明定字形用繁体，
//      正是为了让浮标的繁体词键能命中；原文本就是繁体。
//   ③ 原文一律走占位回填（rawSlot ＋ 调用方 fillRaw），不过 zh()——底本用字与
//      白话用字本不是一回事（余年/并/于等 14 处，名单钉在 npm run check:zh 检三）。
//
// 【缺白话如实标注，不伪装】
//   卷首卷末 4 篇（1908 字）尚无白话、门14 门义与 29 位标 partial（白话只述大意）。
//   这些节在白话档挂一行明说，不拿原文冒充白话，也不拿一句提要冒充全篇。
//   补译落地后标注自动消失（本模块只读数据，不写死任何缺口名单）。
import { SFP_CANON_FRONT, SFP_CANON_DOORS } from './sfp-canon.js';
import { sfpSplitOf } from './sfp-canon-split.js';
import { SFP_DOOR_BAIHUA } from './sfp-door-baihua.js';
import { SFP_POS_BAIHUA } from './sfp-pos-baihua.js';
import { SFP_FRONT_BAIHUA, SFP_POST_BAIHUA } from './sfp-front-baihua.js';
import { sfpCanonVerdict } from './sfp-verdict-canon.js';   // 只取 .plain；.quote 与 sfpQuoteKind 随对照档一并撤（见头注 2026-08-12）
import { SFP_DOORS, SFP_POS } from './sfp-data.js';

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
// 廿一相之序取谱页序（同 game.js 的 DISC_ORDER）：那那起、佛佛终，善恶由重而轻、由渐而顿。
// 不用字典序——那会把「佛佛」排到中间，与原谱谱面及全库各处的行法表都对不上。
const COMBOS = ['那那', '那謨', '謨謨', '那阿', '謨阿', '阿阿', '那彌', '謨彌', '阿彌', '彌彌',
  '那陀', '謨陀', '阿陀', '彌陀', '陀陀', '那佛', '謨佛', '阿佛', '彌佛', '陀佛', '佛佛'];
const POS_BY_NAME = {};
for (const p of SFP_POS) POS_BY_NAME[p.name] = p;
const DOOR_BY_NO = {};
for (const d of SFP_DOORS) DOOR_BY_NO[d.no] = d;

// ---------------- 骨架：六卷为经，239 节 ----------------

// 卷首 3 篇 ＋ 15 门 ＋ 220 位 ＋ 卷末 1 篇 ＝ 239 节。
// SFP_CANON_FRONT 里 juan=1 的三篇系卷首（排在门一之前），juan=6 的〈紀事〉系卷末（排在门十五之后）——
// 全谱只此两处散篇，故此处按卷号直判，不另立字段。
export function readerNodes() {
  const nodes = [];
  const doorsOfJuan = (j) => Object.keys(SFP_CANON_DOORS).map(Number)
    .filter((n) => SFP_CANON_DOORS[n].juan === j).sort((a, b) => a - b);
  for (let juan = 1; juan <= 6; juan++) {
    for (const f of SFP_CANON_FRONT) {
      if (f.juan === juan && juan !== 6) nodes.push({ kind: 'front', juan, title: f.title, text: f.text });
    }
    for (const dn of doorsOfJuan(juan)) {
      nodes.push({ kind: 'door', juan, door: dn, title: `第${CN[dn - 1]}門 · ${DOOR_BY_NO[dn].title}` });
      for (const p of SFP_CANON_DOORS[dn].positions) {
        nodes.push({ kind: 'pos', juan, door: dn, title: p.name, text: p.text });
      }
    }
    for (const f of SFP_CANON_FRONT) {
      if (f.juan === juan && juan === 6) nodes.push({ kind: 'front', juan, title: f.title, text: f.text });
    }
  }
  return nodes;
}
// 节键：进度记忆与目录高亮用。篇名与位名在全谱内唯一，门另加前缀免与同名位相撞。
export function nodeKey(n) { return n.kind === 'door' ? `door:${n.door}` : n.title; }

// ---------------- 取值口 ----------------

// 白话正文一副形状：领起段 ＋ 明细行 ＋ 他经补注。三个白话本（门义／位注）同构，故共用此函数。
// 与 game.js 的 plainBodyHtml 同一形状，但不共享代码——那边挂在卡制 v3 的 .cSec 语汇下，
// 此处是长读版面，行距与字号另有一套（见 READER_CSS）。
function baihuaHtml(b, esc, glossify) {
  if (!b) return '';
  let h = '';
  if (b.v) h += `<div class="rdP">${glossify(esc(String(b.v)))}</div>`;
  for (const r of b.rows || []) {
    h += `<div class="rdRow"><i>${esc(r.k || '')}</i><span>${glossify(esc(String(r.v || '')))}</span></div>`;
  }
  for (const x of b.ext || []) {
    const src = (String(x.src || '').match(/《[^》]+》[^（·]*/) || ['他经'])[0].trim();
    h += `<div class="rdExt"><i>补注 · ${esc(src)}</i><span>${glossify(esc(String(x.v || '')))}</span></div>`;
  }
  return h;
}
// 原文段：**不与白话同过 zh()**，改走占位回填（调用方渲染完整节后，对 [data-raw] 以
//   rawShow(t) 回填——read.html 侧见 src/reader-page.js 的 render 尾段）。
//
// 【何以必须隔离】原文是 CBETA B24n0136 逐字底本，本就是繁体，繁体态下理应恒等。
//   但 zh() 在繁体态跑的是 ZH_S2T（简→繁），一简对多繁处会误转——2026-08-11 全书
//   55867 字实扫，被改动者 7 种 21 处，其中 4 种**义已变**：
//     〈敘選佛譜敘〉「余年二十一歲」→「餘年」（余是第一人称，非剩餘）
//     〈敘選佛譜敘〉「逮乙丑年」→「乙醜年」（丑是地支，非醜陋）
//     〈敘選佛譜敘〉「復於松陵」→「鬆陵」（松陵是地名）
//     〈東勝神洲〉「梵語弗于逮」→「弗於逮」（音译词，改字即失音）
//   另 3 种系字形变：并→並(10)、况→況(4)、义→義(3，「式义摩那」亦音译)。
//   全名单钉死在护栏 npm run check:zh 检三（今 14 处，数目一变即报）。
//   校勘之本不可因显示层而改字，故原文一律经 rawShow 取当前显示态的正字
//   （繁体态原样返回、简体态折简），再 glossify 上浮标，整段绕过 zh()。
//
// 【data-nozh】读者页（read.html）无 zhDom，此属性在彼处无用武之地；保留它是给
//   任何「把这段 HTML 摆进带 zhDom 环境」的调用方留的闩——game.js 的 zhDom 见此属性即绕行。
function rawSlot(t, raws) { const i = raws.push(String(t)) - 1; return `<div class="verse" data-raw="${i}" data-nozh></div>`; }

// 缺白话之告白：不同缺法说不同的话，不拿一句「暂缺」蒙混。
// 三种缺法（2026-08-11 盘点）：卷首卷末四篇全缺 1908 字；后论段六位全缺 516 字；
//   门14 门义与 11 位标 partial（白话只述大意，长篇修法详文仍在原文）。
const GAP_SAY = {
  none: '本篇白话待补，此处只出原文。',
  post: '本段白话待补，此处只出原文。',
  partial: '白话只述大意，逐条详文仍请读原文。',
};
function gapHtml(kind, esc) { return `<div class="rdGap">${esc(GAP_SAY[kind] || GAP_SAY.none)}</div>`; }

// ---------------- 廿一相表（白话档专属） ----------------

// 一行「轮相 · 去处 · 白话」。去处四种情形，皆据 SFP_POS.moves 与原谱：
//   ① {to}        → 去某位
//   ② {bonus:N}   → 赠 N 掷（原谱「贈一」「贈二」，不移位）
//   ③ 不在 moves  → 不行（安住本位）
//   ④ terminal 位 → 整表不出（〈佛〉位原谱本无轮相行法表，见 正本/门15.js 文件头）
// 判词白话取 sfpCanonVerdict(位名, 轮相).plain——那 4620 格是逐门校审的发布数据。
// 原文一律不入此表（2026-08-12 定案，缘由见文件头）：本位该有的行法之文在原文档连读时自见。
function combosTableHtml(name, esc, glossify, zh) {
  const pos = POS_BY_NAME[name];
  if (!pos || pos.terminal) return '';
  const dest = {}, bonus = {};
  for (const m of pos.moves || []) {
    for (const c of m.c || []) { if (m.to) dest[c] = m.to; else if (m.bonus) bonus[c] = m.bonus; }
  }
  const rows = COMBOS.map((c) => {
    const v = sfpCanonVerdict(name, c) || {};
    const go = dest[c] ? esc(dest[c])
      : bonus[c] ? `贈${CN[bonus[c] - 1]}擲`
        : '<em>不行</em>';
    const plain = v.plain ? `<span class="rdVp">${glossify(esc(String(v.plain)))}</span>` : '';
    return `<div class="rdV"><b>${esc(c)}</b><i>${go}</i><div>${plain}</div></div>`;
  }).join('');
  return `<div class="rdTbl"><div class="rdTh">${zh('行法 · 二十一相')}</div>${rows}</div>`;
}

// ---------------- 一节的正文 ----------------

// 三类节各有形状，但共一副骨架：原文段 ／ 白话段 ／（位节另有）廿一相表 ／ 后论段。
// 两档只管「哪些段出、哪些段不出」，不改段序——读者切档时看到的是同一篇文章的两个面，
// 不是两篇不同的东西。
// raws：原文槽。本函数把每段原文推进 raws 并留下 <div data-raw="i">，
//   由调用方在整节渲染**之后**以 rawShow 回填——原文遂不受简繁转换之扰。
export function nodeBodyHtml(n, mode, ctx, raws = []) {
  const { esc, glossify, zh } = ctx;
  const raw = (t) => rawSlot(t, raws);
  const W = mode === 'wenyan';       // 原文档：照原书连读，不出表
  const B = !W;                      // 白话档：白话 ＋ 廿一相表
  let h = '';

  if (n.kind === 'front') {
    // 卷首卷末四篇（sfp-front-baihua.js，2026-08-11 补译）。未补者才挂告白——
    // 本模块不写死缺口名单，补一篇即少一处告白。
    const b = SFP_FRONT_BAIHUA[n.title];
    if (B) {
      if (!b) { h += gapHtml('none', esc); h += raw(n.text); return h; }  // 白话未补者照实给原文，不留空屏
      if (b.partial) h += gapHtml('partial', esc);
      h += baihuaHtml(b, esc, glossify);
      return h;
    }
    h += raw(n.text);
    return h;
  }

  if (n.kind === 'door') {
    const b = SFP_DOOR_BAIHUA[n.door];
    const intro = String((DOOR_BY_NO[n.door] || {}).intro || '');
    if (B) {
      // 门1／2／15 原谱无总说，其白话系本项目自撰导语（b.self），须标明不冒「谱曰」。
      if (b && b.self) h += `<div class="rdGap">${esc('本门原谱无总说，以下是本项目自撰的助读导语，非谱主原文。')}</div>`;
      else if (b && b.partial) h += gapHtml('partial', esc);
      if (b) h += baihuaHtml(b, esc, glossify);
      else { h += gapHtml('none', esc); if (intro) h += raw(intro); }
      return h;
    }
    h += intro ? raw(intro) : `<div class="rdGap">${esc('原谱本门无总说。')}</div>`;
    return h;
  }

  // 位节：切点表把位文切成「义解｜行法｜后论」三段（src/sfp-canon-split.js，220 位逐位手核）。
  const s = sfpSplitOf(n.title, String(n.text).replace(/^譜曰。/, ''));
  if (W) {
    // 原文档：义解 → 行法 → 后论，三段连读，一段不落。
    //   行法段过去被拆进廿一相表（对照档之制），今照原书归还正文——它本就是本位原文的一部分。
    if (s.jie.trim()) h += raw(s.jie);
    if (s.act.trim()) h += raw(s.act);
    if (s.post.trim()) { h += `<div class="rdPostK">${zh('谱主后论')}</div>`; h += raw(s.post); }
    return h;
  }
  const b = SFP_POS_BAIHUA[(POS_BY_NAME[n.title] || {}).id] || SFP_POS_BAIHUA[n.title];
  if (!b) h += gapHtml('none', esc);
  else if (b.partial) h += gapHtml('partial', esc);
  h += baihuaHtml(b, esc, glossify);
  if (!b && s.jie.trim()) h += raw(s.jie);        // 位注未补者照实给原文义解段
  h += combosTableHtml(n.title, esc, glossify, zh);
  // 后论：全谱 6 位（〈見取〉〈戒取〉〈根本四禪〉〈四無色定〉〈意見參禪〉〈光音天〉），
  //   不属任何一相的总结或问答，故排在表后、另立小题——不切出来就会被误算作末相的续文。
  //   白话见 sfp-front-baihua.js 的 SFP_POST_BAIHUA（2026-08-11 补译）；未补者才挂告白并照实给原文。
  if (s.post.trim()) {
    h += `<div class="rdPostK">${zh('谱主后论')}</div>`;
    const pb = SFP_POST_BAIHUA[n.title];
    if (pb) h += baihuaHtml(pb, esc, glossify);
    else { h += gapHtml('post', esc); h += raw(s.post); }
  }
  return h;
}


// ---------------- 主体与皮（已迁） ----------------
// mountReader（游戏内浮层）与 READER_CSS 于 2026-08-12 随「阅读器独立页面」迁移撤除：
//   皮＝src/reader-page.css（wenchao 纸墨形制），交互＝src/reader-page.js（read.html）。
//   本模块自此只出内容层三件：readerNodes / nodeKey / nodeBodyHtml。
