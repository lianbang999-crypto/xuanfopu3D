import { SFP_WHY } from './sfp-data.js';
import { SFP_CANON_DOORS } from './sfp-canon.js';
import { SFP_WHY_PLAIN } from './sfp-why-plain.js';
import { SFP_GLYPH_WHY } from './sfp-glyph-why.js'; // v389 字义解：依卷首〈輪相表法第一〉逐位生成的理解层
import { CZ, czOf } from './sfp-chengzhu.js'; // 承注库：4620 格逐格缘由（主源，取代 v390 之 SFP_REFER_WHY 为溯源主据）
import { SFP_REFER_WHY } from './sfp-refer-why.js'; // v390 旧溯源表：非相杂格处其所指仍有价值，与承注库并存（相杂格旧表误溯，不取）
// ── 手工逐组轮相说明（复刻线上 V104 正本，v417/v419 手写层 ＋ v418 话头改写层）──
// 缘起：谱主常以一句总括句管十几组（「阿彌至謨佛皆不行者」管九组），旧白话把那句原样搬给每一组，
//   玩家读不到自己这一掷是什么；且诸层文字带跨组话头（「『阿阿』以下诸组」「『阿彌』等三」），
//   玩家读到的是别组的名字。手工层逐门逐位逐相手写（门1–14 共 4352 格），
//   话头改写层再补 1151 格，去重后 4356 / 4620 格。
// 与承注库的分工：白话主句取手工层（要让玩家看得懂「当下这一掷」），逐字引文与溯源仍出承注库——
//   两层不争位，手工层只替换「释义」一项，引证一字不动；余 264 格照旧走承注白话。
import { SFP_DOOR1_WHY } from './sfp-door1-why.js';
import { SFP_DOOR2_WHY } from './sfp-door2-why.js';
import { SFP_DOOR3_WHY } from './sfp-door3-why.js';
import { SFP_DOOR4_WHY } from './sfp-door4-why.js';
import { SFP_DOOR5_WHY } from './sfp-door5-why.js';
import { SFP_DOOR6_WHY } from './sfp-door6-why.js';
import { SFP_DOOR7_WHY } from './sfp-door7-why.js';
import { SFP_DOOR8_WHY } from './sfp-door8-why.js';
import { SFP_DOOR9_WHY } from './sfp-door9-why.js';
import { SFP_DOOR10_WHY } from './sfp-door10-why.js';
import { SFP_DOOR11_WHY } from './sfp-door11-why.js';
import { SFP_DOOR12_WHY } from './sfp-door12-why.js';
import { SFP_DOOR13_WHY } from './sfp-door13-why.js';
import { SFP_DOOR14_WHY } from './sfp-door14-why.js'; // V104 增补：第十四门〈橫超淨土門〉273 格
import { SFP_COMBO_WHY } from './sfp-combo-why.js';
// v409「不行」之由：谱主于相杂诸相（那阿/那彌/那陀/謨阿/謨彌/謨陀）只以卷一〈見取〉一句通则统摄，
//   各位不另释；承注库照录那句通则，句首却带「其餘諸位中」这样的跨位话头——正是玩家读不懂的那种话。
//   本层依谱主原语逐相改写（判据仍是〈見取〉「二俱無力」、忍位「不起惡故」、淨土疑城「永離退緣」），
//   只补手工层未及之格；库值体例为「白话主句 ‖ 谱曰：引文」，取用处只取主句。
import { SFP_STAY_WHY } from './sfp-stay-why.js';
import { normWhy } from './sfp-norm.js'; // 话头归一：本组自称→「这一掷」，别组名字与枚举片段剔除，判语一字不动
import { applyCanonLead } from './sfp-lead-canon.js'; // 话头正名：上游用词归到卷首〈輪相表法第一〉定诠（本地校勘层）

// 判词证据严格分层：逐字引文、项目释义、项目操作规则不得互相冒充。
export const SFP_EVIDENCE_TYPE = Object.freeze({
  source: 'source_quote',
  interpretation: 'interpretation',
  operation: 'operational_interpretation',
  glyph: 'glyph_interpretation', // v389 字义解另立一类：界面另栏署名，不与谱注白话「释义」混排身份
});

// 总括句名单：谱主以此类语总括处，白话不重复含糊句，改由承注库溯源到被指位按语。
export const SFP_VAGUE_FORMS = new Set(['餘如前說。', '餘如上說。', '餘亦如前。', '餘皆例前可知。', '餘並如前。', '餘可知。', '餘准前知。', '例可知。', '餘同前釋。', '餘同前說。', '餘如前。可例知。', '餘並如前可知。', '餘同西洲。', '此中趋道之相。亦可例如前說。', '從此增進。亦可例知。', '阿阿等如前可解。']);

const SOURCE_ATTRIBUTION = '蕅益智旭《選佛譜》';

function sourceQuote(text, subtype, ref) {
  return { type: SFP_EVIDENCE_TYPE.source, subtype, text, ref, attribution: SOURCE_ATTRIBUTION };
}

function interpretation(text) {
  return { type: SFP_EVIDENCE_TYPE.interpretation, text, attribution: '本项目白话释义' };
}

function glyphInterpretation(text) {
  return { type: SFP_EVIDENCE_TYPE.glyph, text, attribution: '本项目字义解 · 依卷首〈輪相表法第一〉六字定诠' };
}

// 手工层优先于话头改写层：前者是逐位逐相手写，后者只是把生成句的话头换成当下这一相。
const MANUAL_WHY = {
  ...SFP_DOOR1_WHY, ...SFP_DOOR2_WHY, ...SFP_DOOR3_WHY, ...SFP_DOOR4_WHY, ...SFP_DOOR5_WHY,
  ...SFP_DOOR6_WHY, ...SFP_DOOR7_WHY, ...SFP_DOOR8_WHY, ...SFP_DOOR9_WHY, ...SFP_DOOR10_WHY,
  ...SFP_DOOR11_WHY, ...SFP_DOOR12_WHY, ...SFP_DOOR13_WHY, ...SFP_DOOR14_WHY,
};

// 取一格的手工白话；无则空串（调用处自落承注白话）。normWhy 归一失败时退回原句，宁可带话头也不空手。
// 三层同一取值口，序为：手工逐组 › 话头改写 › 通例改写（「不行」之由）。
// 通例层排在最后：它是一句通则的逐相化，本位若有逐组明说，自当以明说为准。
export function sfpManualWhyText(position, combo) {
  const key = `${position}|${combo}`;
  const raw = MANUAL_WHY[key] || SFP_COMBO_WHY[key]
    || (SFP_STAY_WHY[key] ? String(SFP_STAY_WHY[key]).split('‖')[0].trim() : '') || '';
  if (!raw) return '';
  return applyCanonLead(normWhy(raw, combo) || raw, position, combo);
}

export function sfpGlyphWhyText(position, combo) {
  return SFP_GLYPH_WHY[`${position}|${combo}`] || '';
}

// v389 字义解兜底证据：谱主于本位本组未另作按语时，依卷首表法与行法表去向补一层理解（另署，不冒谱曰）。
export function makeSfpGlyphEvidence(position, combo) {
  const text = sfpGlyphWhyText(position, combo);
  return text ? evidence(position, combo, [glyphInterpretation(text)]) : null;
}

function evidence(position, combo, items) {
  return { position, combo, items };
}

// 承注库取证：谱主写总括句处溯源到被指位按语；谱曰未逐相明说处出示推演答语与其所据原文。
// 引文出自本位者作 pu_explanation，出自他位者作 refer_note 并标所指——玩家不再只读到「其余如前说」而无从知前文何指。
function czEvidenceItems(position, combo, rawText) {
  const cz = czOf(position, combo);
  if (!cz) return [];
  const out = [];
  const short = String(rawText || '').trim().replace(/。$/, '');
  const refItem = (x) => {
    // 门总说等非位引文（如「四洲以见佛闻法为次第」出于门总说）不安位名——它不是可跳转的位
    const isPos = !!(x.n && CANON_BY_POSITION[x.n]);
    const base = sourceQuote(x.t, isPos && x.n === position ? 'pu_explanation' : 'refer_note',
      isPos && x.n !== position && short ? `${x.r}（本位「${short}」所指）` : x.r);
    return isPos && x.n !== position
      ? { ...base, refName: x.n, refId: x.n === '佛' ? '圓教究竟妙覺位' : x.n, refJuan: x.j }
      : base;
  };
  // 手工逐组白话优先：它写的正是「当下这一掷」，承注白话（含合成句）退为无手工格之兜底。
  const manual = sfpManualWhyText(position, combo);
  if (cz.level === '推演') {
    // 谱曰未逐相明说：答语为本项目依本谱内证推得之合成句，所据原文逐条列出。
    // 2026-08-04 发起人「轮相说明要让用户看得懂」：有判词白话者优先出白话，
    // 合成句文言退为兜底——从前此处径出合成句，玩家读到的是半文言。
    cz.cites.forEach((x) => out.push(refItem(x)));
    const plain = manual || cz.plain || cz.ans;
    if (plain) out.push(interpretation(plain));
    return out;
  }
  const other = cz.cites.filter((x) => x.n && x.n !== position);
  cz.cites.forEach((x) => { if (x.n !== position || !rawText) out.push(refItem(x)); });
  // 手工句自身已把本组因由说全，不再缀「所指即某位」的溯源尾巴（所指已写在引文条的出处里）。
  if (manual) out.push(interpretation(manual));
  else if (cz.plain) {
    out.push(interpretation(other.length && short
      ? `${cz.plain}（谱曰「${short}」——所指即「${other[0].n}」本组之注）` : cz.plain));
  }
  return out;
}

const CANON_BY_POSITION = {};
for (const door of Object.values(SFP_CANON_DOORS)) {
  for (const position of door.positions) {
    const canonical = {
      juan: door.juan,
      text: position.text.replace(/^譜曰。/, ''),
    };
    CANON_BY_POSITION[position.name] = canonical;
    // 原谱末位题名为「佛」，游戏位 ID 为「圓教究竟妙覺位」。
    if (position.name === '佛') CANON_BY_POSITION['圓教究竟妙覺位'] = canonical;
  }
}

const PLAIN_BY_NORMALIZED_TEXT = new Map();
const normalizePlainKey = (text) => String(text || '').replace(/\s+/gu, '').replaceAll('囘', '迴');
for (const [sourceText, plainText] of Object.entries(SFP_WHY_PLAIN)) {
  const key = normalizePlainKey(sourceText);
  if (key && !PLAIN_BY_NORMALIZED_TEXT.has(key)) PLAIN_BY_NORMALIZED_TEXT.set(key, plainText);
}

// 释义最终挂在稳定的「位 ID＋轮相」证据对象上；逐字原文即使只改空白或囘/迴显示字形，也不丢失既有白话。
export function sfpWhyPlainText(sourceText) {
  return SFP_WHY_PLAIN[sourceText] || PLAIN_BY_NORMALIZED_TEXT.get(normalizePlainKey(sourceText)) || '';
}

function compactWithMap(text) {
  const chars = [];
  const map = [];
  for (let index = 0; index < text.length;) {
    if (text[index] === '[') {
      const end = text.indexOf(']', index + 1);
      if (end >= 0) {
        index = end + 1;
        continue;
      }
    }
    const char = text[index];
    if (/[\s。；，、：？！「」『』（）()《》]/u.test(char)) {
      index += 1;
      continue;
    }
    chars.push(char);
    map.push(index);
    index += 1;
  }
  return { text: chars.join(''), map };
}

// 旧判词有少量去括号、去校勘号或改句读的摘录；这里反向取回校正原本中的逐字片段。
export function recoverSfpSourceQuote(rawText, canonicalText) {
  if (!rawText || !canonicalText) return '';
  if (canonicalText.includes(rawText)) return rawText;
  const source = compactWithMap(canonicalText);
  const wanted = compactWithMap(String(rawText)).text;
  if (!wanted) return '';
  const at = source.text.indexOf(wanted);
  if (at < 0) return '';
  return canonicalText.slice(source.map[at], source.map[at + wanted.length - 1] + 1);
}

const SPECIAL = {};
const setSpecial = (position, combo, items) => {
  SPECIAL[`${position}\u0000${combo}`] = evidence(position, combo, items);
};

setSpecial('銀輪王', '謨佛', [
  sourceQuote('謨佛。辟支佛', 'rule_fact', 'B0136_002.txt:121 · 銀輪王行法'),
  interpretation('行法表直定银轮王掷得「謨佛」往辟支佛果；本位谱曰没有另释这一轮相的缘由。'),
]);

setSpecial('上品上生', '佛佛', [
  sourceQuote('佛佛。寂光上上', 'rule_fact', 'B0136_006.txt:305 · 上品上生行法'),
  sourceQuote('佛佛即證寂光上上品者。至圓至頓。不思議故。', 'pu_explanation', 'B0136_006.txt:307 · 上品上生譜曰'),
  interpretation('依本谱第十四、十五门的位次结构，寂光上上品归入圆教究竟妙觉位。'),
]);

setSpecial('實報莊嚴淨土', '阿佛', [
  sourceQuote('阿佛。寂光淨土', 'rule_fact', 'B0136_006.txt:313 · 實報莊嚴淨土行法'),
  interpretation('行法表直定由实报庄严净土转往常寂光净土；本位谱曰没有另释这一轮相的缘由。'),
]);

for (const combo of ['彌佛', '陀佛', '佛佛']) {
  setSpecial('實報莊嚴淨土', combo, [
    sourceQuote('彌佛　陀佛　佛佛。皆實報上上品', 'rule_fact', 'B0136_006.txt:313 · 實報莊嚴淨土行法'),
    sourceQuote('今但除上上品入極果位。餘之八品。束為此位。表其至圓頓故。', 'pu_explanation', 'B0136_006.txt:315 · 實報莊嚴淨土譜曰'),
    interpretation('实报上上品不再束入本位，而归入第十五门圆极果位。'),
  ]);
}

for (const combo of ['阿佛', '彌佛', '陀佛', '佛佛']) {
  setSpecial('常寂光淨土', combo, [
    sourceQuote('阿佛　彌佛　陀佛　佛佛。皆寂光上上品', 'rule_fact', 'B0136_006.txt:317 · 常寂光淨土行法'),
    sourceQuote('今亦但除上上一品入極果位。束餘八品。總為此位。表其至頓至圓故也。', 'pu_explanation', 'B0136_006.txt:319 · 常寂光淨土譜曰'),
    interpretation('寂光上上品不再束入本位，而归入第十五门圆极果位。'),
  ]);
}

export const SFP_WHY_EVIDENCE = {};
for (const [position, combos] of Object.entries(SFP_WHY)) {
  const canonical = CANON_BY_POSITION[position];
  SFP_WHY_EVIDENCE[position] = {};
  for (const [combo, rawText] of Object.entries(combos)) {
    const special = SPECIAL[`${position}\u0000${combo}`];
    if (special) {
      // 手工逐组说明须盖过 SPECIAL 里「本位谱曰没有另释这一轮相的缘由」的旧话——今已逐组手写，
      // 那句已不成立（此十格中八格属第十四门净土，正是玩家最要读懂之处）。
      // SPECIAL 的行法表逐字引文照留（那是依据），位次归属之注亦留（那是本项目的位次交代，非轮相缘由）。
      const manual = sfpManualWhyText(position, combo);
      SFP_WHY_EVIDENCE[position][combo] = manual
        ? evidence(position, combo, [
          ...special.items.filter((it) => it.type !== SFP_EVIDENCE_TYPE.interpretation),
          interpretation(manual),
          ...special.items.filter((it) => it.type === SFP_EVIDENCE_TYPE.interpretation && !it.text.includes('没有另释')),
        ])
        : special;
      continue;
    }
    const quote = recoverSfpSourceQuote(rawText, canonical ? canonical.text : '');
    if (!quote) throw new Error(`判词无法回溯校正原本：${position}/${combo}`);
    const items = [sourceQuote(quote, 'pu_explanation', `《選佛譜》卷${canonical.juan} · ${position}譜曰`)];
    // 承注库展开：谱注是「餘如前說」类指代句时，溯源到被指位同组按语（仍是谱主的话）并标所指。
    const czItems = czEvidenceItems(position, combo, rawText);
    const hasRefer = czItems.some((it) => it.type === SFP_EVIDENCE_TYPE.source && it.subtype === 'refer_note');
    if (hasRefer) {
      czItems.forEach((it) => items.push(it));
      // 承注库该格无白话时，仍以本位按语之白话补足——白话全覆盖不许因换源而漏格
      if (!czItems.some((it) => it.type === SFP_EVIDENCE_TYPE.interpretation)) {
        const plain = sfpManualWhyText(position, combo) || sfpWhyPlainText(rawText);
        if (plain) items.push(interpretation(plain));
      }
    } else {
      // 此分支不取 czItems（无溯源可标），故手工白话须在此另取一次，否则 4356 格手写会在这里漏掉
      const plain = sfpManualWhyText(position, combo) || sfpWhyPlainText(rawText);
      if (plain) items.push(interpretation(plain));
    }
    // v390 旧溯源表所指若与承注库不同，仍列一条并存——两者皆谱主之言，只是所承之位远近不同。
    // 相杂格除外：旧表误溯到三惡相按语，实应依卷一〈見取〉通则（承注库已正之）。
    const MIXED = new Set(['那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀']);
    const legacy = SFP_REFER_WHY[`${position}|${combo}`];
    if (legacy && !MIXED.has(combo)) {
      const lc = CANON_BY_POSITION[legacy.s];
      const seen = items.some((it) => it.text && (it.text.includes(legacy.t) || legacy.t.includes(it.text)));
      if (lc && lc.text.includes(legacy.t) && !seen) {
        items.push({
          ...sourceQuote(legacy.t, 'refer_note', `《選佛譜》卷${lc.juan} · ${legacy.s}譜曰（另見）`),
          refName: legacy.s, refId: legacy.s === '佛' ? '圓教究竟妙覺位' : legacy.s, refJuan: lc.juan,
        });
      }
    }
    // v389 原意：总括句「无溯源可依」时才补字义解坐实所指（另栏署名；有溯源则不赘）。
    // 判据改看最终有无 refer_note，而非走了哪个分支——免因换源而漏格，亦不因换源而滥加。
    if (SFP_VAGUE_FORMS.has(rawText.trim())
      && !items.some((it) => it.subtype === 'refer_note')
      && !items.some((it) => it.type === SFP_EVIDENCE_TYPE.glyph)) {
      const gw = sfpGlyphWhyText(position, combo);
      if (gw) items.push(glyphInterpretation(gw));
    }
    SFP_WHY_EVIDENCE[position][combo] = evidence(position, combo, items);
  }
}

// 承注补格：SFP_WHY 只载有按语之格（2210），承注库覆盖全部 4620 格。
// 余下 2410 格（其中「行」格 1158）此前无缘由可示，今由承注库补足——纯增益，不改既有格。
for (const key of Object.keys(CZ)) {
  const at = key.lastIndexOf('|');
  const position = key.slice(0, at), combo = key.slice(at + 1);
  if (SFP_WHY_EVIDENCE[position] && SFP_WHY_EVIDENCE[position][combo]) continue;
  const items = czEvidenceItems(position, combo, '');
  if (!items.length) continue;
  if (!SFP_WHY_EVIDENCE[position]) SFP_WHY_EVIDENCE[position] = {};
  SFP_WHY_EVIDENCE[position][combo] = evidence(position, combo, items);
}

export function sfpWhyEvidence(position, combo) {
  return SFP_WHY_EVIDENCE[position]?.[combo] || null;
}

export function sfpEvidenceItems(value, type) {
  const items = value && Array.isArray(value.items) ? value.items : [];
  return type ? items.filter((item) => item.type === type) : items;
}

export function mergeSfpEvidence(...values) {
  return evidence('', '', values.flatMap((value) => sfpEvidenceItems(value)));
}

export function makeSfpInterpretationEvidence(text) {
  // 空文本不造释义项：否则判词卡渲出只剩「释义：」标签的空行（首掷与无谱注行棋必现）
  return evidence('', '', text && String(text).trim() ? [interpretation(text)] : []);
}

export function makeSfpSourceEvidence(text, subtype, ref) {
  return evidence('', '', [sourceQuote(text, subtype, ref)]);
}

export function makeSfpOperationalEvidence(text) {
  return evidence('', '', [{
    type: SFP_EVIDENCE_TYPE.operation,
    text,
    authority: 'operational_interpretation',
    attribution: '本项目定稿操作规则',
  }]);
}
