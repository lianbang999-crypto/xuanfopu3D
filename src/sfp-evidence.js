import { SFP_WHY } from './sfp-data.js';
import { SFP_CANON_DOORS } from './sfp-canon.js';
import { SFP_WHY_PLAIN } from './sfp-why-plain.js';
import { SFP_GLYPH_WHY } from './sfp-glyph-why.js'; // v389 字义解：依卷首〈輪相表法第一〉逐位生成的理解层
import { SFP_REFER_WHY } from './sfp-refer-why.js'; // v390 总括句溯源：「餘如前說」类谱注所指位之按语

// 判词证据严格分层：逐字引文、项目释义、项目操作规则不得互相冒充。
export const SFP_EVIDENCE_TYPE = Object.freeze({
  source: 'source_quote',
  interpretation: 'interpretation',
  operation: 'operational_interpretation',
  glyph: 'glyph_interpretation', // v389 字义解另立一类：界面另栏署名，不与谱注白话「释义」混排身份
});

// v390 总括句名单：谱主以此类语总括处，白话不重复含糊句，改由 SFP_REFER_WHY 溯源到被指位按语。
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
      SFP_WHY_EVIDENCE[position][combo] = special;
      continue;
    }
    const quote = recoverSfpSourceQuote(rawText, canonical ? canonical.text : '');
    if (!quote) throw new Error(`判词无法回溯校正原本：${position}/${combo}`);
    const items = [sourceQuote(quote, 'pu_explanation', `《選佛譜》卷${canonical.juan} · ${position}譜曰`)];
    // v390 总括句展开：谱注是「餘如前說」类指代句时，白话取被指位同组按语（仍是谱主的话），
    // 被指位逐字引文另列一条并标所指——玩家不再只读到「其余如前说」而无从知前文何指。
    const refer = SFP_REFER_WHY[`${position}|${combo}`];
    const referCanon = refer ? CANON_BY_POSITION[refer.s] : null;
    if (refer && referCanon && referCanon.text.includes(refer.t)) {
      const short = rawText.trim().replace(/。$/, '');
      items.push({
        ...sourceQuote(refer.t, 'refer_note', `《選佛譜》卷${referCanon.juan} · ${refer.s}譜曰（本位「${short}」所指）`),
        refName: refer.s,
        refId: refer.s === '佛' ? '圓教究竟妙覺位' : refer.s,
        refJuan: referCanon.juan,
      });
      items.push(interpretation(`${sfpWhyPlainText(refer.t) || refer.p}（谱曰「${short}」——所指即「${refer.s}」本组之注）`));
    } else {
      const plain = sfpWhyPlainText(rawText);
      if (plain) items.push(interpretation(plain));
      // v389：总括句无溯源可依时，补字义解层坐实所指（另栏署名；谱主有实义按语处不加）
      if (SFP_VAGUE_FORMS.has(rawText.trim())) {
        const gw = sfpGlyphWhyText(position, combo);
        if (gw) items.push(glyphInterpretation(gw));
      }
    }
    SFP_WHY_EVIDENCE[position][combo] = evidence(position, combo, items);
  }
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
