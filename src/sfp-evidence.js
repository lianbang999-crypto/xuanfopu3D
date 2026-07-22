import { SFP_WHY } from './sfp-data.js';
import { SFP_CANON_DOORS } from './sfp-canon.js';
import { SFP_WHY_PLAIN } from './sfp-why-plain.js';

// 判词证据严格分层：逐字引文、项目释义、项目操作规则不得互相冒充。
export const SFP_EVIDENCE_TYPE = Object.freeze({
  source: 'source_quote',
  interpretation: 'interpretation',
  operation: 'operational_interpretation',
});

const SOURCE_ATTRIBUTION = '蕅益智旭《選佛譜》';

function sourceQuote(text, subtype, ref) {
  return { type: SFP_EVIDENCE_TYPE.source, subtype, text, ref, attribution: SOURCE_ATTRIBUTION };
}

function interpretation(text) {
  return { type: SFP_EVIDENCE_TYPE.interpretation, text, attribution: '本项目白话释义' };
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
    const plain = sfpWhyPlainText(rawText);
    if (plain) items.push(interpretation(plain));
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
  return evidence('', '', [interpretation(text)]);
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
