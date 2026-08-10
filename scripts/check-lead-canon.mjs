// 轮相话头正名校验 —— 守住三条底线：
//   ① 无遗漏：上游每一格的话头都在 KNOWN_LEADS 内（新话头混入即报，免得静默漏改）
//   ② 已正名：改后话头逐格等于 canonLeadOf（含门5 鈍根阿那含、门8 八背捨觀两处明文改判）
//   ③ 判语一字不动：话头之后的文字与上游逐字相同（通例 80 格例外，那一整句依谱重写）
// 用法：node scripts/check-lead-canon.mjs
import assert from 'node:assert/strict';
import { CZ } from '../src/sfp-chengzhu.js';
import { normWhy } from '../src/sfp-norm.js';
import { SFP_COMBO_WHY } from '../src/sfp-combo-why.js';
import { SFP_STAY_WHY } from '../src/sfp-stay-why.js';
import { SFP_DOOR1_WHY } from '../src/sfp-door1-why.js';
import { SFP_DOOR2_WHY } from '../src/sfp-door2-why.js';
import { SFP_DOOR3_WHY } from '../src/sfp-door3-why.js';
import { SFP_DOOR4_WHY } from '../src/sfp-door4-why.js';
import { SFP_DOOR5_WHY } from '../src/sfp-door5-why.js';
import { SFP_DOOR6_WHY } from '../src/sfp-door6-why.js';
import { SFP_DOOR7_WHY } from '../src/sfp-door7-why.js';
import { SFP_DOOR8_WHY } from '../src/sfp-door8-why.js';
import { SFP_DOOR9_WHY } from '../src/sfp-door9-why.js';
import { SFP_DOOR10_WHY } from '../src/sfp-door10-why.js';
import { SFP_DOOR11_WHY } from '../src/sfp-door11-why.js';
import { SFP_DOOR12_WHY } from '../src/sfp-door12-why.js';
import { SFP_DOOR13_WHY } from '../src/sfp-door13-why.js';
import { SFP_DOOR14_WHY } from '../src/sfp-door14-why.js';
import { KNOWN_LEADS, canonLeadOf, applyCanonLead, CANON_GLYPH, POS_GLYPH } from '../src/sfp-lead-canon.js';
import { sfpManualWhyText } from '../src/sfp-evidence.js';

const MANUAL = {
  ...SFP_DOOR1_WHY, ...SFP_DOOR2_WHY, ...SFP_DOOR3_WHY, ...SFP_DOOR4_WHY, ...SFP_DOOR5_WHY,
  ...SFP_DOOR6_WHY, ...SFP_DOOR7_WHY, ...SFP_DOOR8_WHY, ...SFP_DOOR9_WHY, ...SFP_DOOR10_WHY,
  ...SFP_DOOR11_WHY, ...SFP_DOOR12_WHY, ...SFP_DOOR13_WHY, ...SFP_DOOR14_WHY,
};

// 上游原样（未经本地校勘层）
function upstream(position, combo) {
  const key = `${position}|${combo}`;
  const raw = MANUAL[key] || SFP_COMBO_WHY[key]
    || (SFP_STAY_WHY[key] ? String(SFP_STAY_WHY[key]).split('‖')[0].trim() : '') || '';
  return raw ? (normWhy(raw, combo) || raw) : '';
}

// 通例整句依谱重写者（判语不逐字比对）：旧式＝「正好相抵…」；
// V105 v409 改写后的「善惑对治」式亦然（见 src/sfp-lead-canon.js 之 STAY_V105_DUIZHI）。
// 其余三式（伏惑／净土／未遇佛字）判语一字不动，仍走逐字比对。
const STAY_OLD = /^(?:[^，。]*，一轮[^，。]*、一轮[^，。]*之善，正好相抵。|一轮[^，。、]{1,8}[、，]一轮[^，。、]{1,10}，善与惑彼此对治，)/;
const split = (t) => { const at = t.search(/[，。]/); return at < 0 ? [t, ''] : [t.slice(0, at), t.slice(at)]; };

let cells = 0; let rewritten = 0; let stayFixed = 0;
const unknownLeads = new Set();
for (const key of Object.keys(CZ)) {
  const at = key.lastIndexOf('|');
  const position = key.slice(0, at); const combo = key.slice(at + 1);
  const before = upstream(position, combo);
  if (!before) continue;
  cells += 1;
  const after = sfpManualWhyText(position, combo);
  const [leadBefore, tailBefore] = split(before);

  // ① 无遗漏
  if (!KNOWN_LEADS.has(leadBefore)) { unknownLeads.add(leadBefore); continue; }

  // ② 已正名
  const [leadAfter] = split(after);
  assert.equal(leadAfter, canonLeadOf(position, combo), `话头未正名：${key}\n  ${after}`);

  // ③ 判语一字不动（通例 80 格依谱重写，另计）
  if (STAY_OLD.test(before)) { stayFixed += 1; continue; }
  const [, tailAfter] = split(after);
  assert.equal(tailAfter, tailBefore, `判语被改动：${key}\n  上游：${before}\n  改后：${after}`);
  if (leadAfter !== leadBefore) rewritten += 1;
}
assert.equal(unknownLeads.size, 0, `出现未登录的话头（须补入 KNOWN_LEADS 或另行判读）：\n  ${[...unknownLeads].join('\n  ')}`);

// 四、话头不得再出现非卷首用词
const BAD = ['夹一分', '正好相抵', '布施', '持戒', '禅定', '智慧引导', '之善'];
for (const key of Object.keys(CZ)) {
  const at = key.lastIndexOf('|');
  const position = key.slice(0, at); const combo = key.slice(at + 1);
  const t = sfpManualWhyText(position, combo);
  if (!t) continue;
  const [lead] = split(t);
  for (const w of BAD) assert.ok(!lead.includes(w), `话头仍含非卷首用词「${w}」：${key} → ${lead}`);
}

// 五、两处明文改判须落到实处
assert.equal(canonLeadOf('鈍根阿那含', '那那'), '「那那」二字俱表界外见惑');
assert.equal(canonLeadOf('鈍根阿那含', '那謨'), '「那」表界外见惑、「謨」表界外爱惑');
// 八背捨觀「那謨表法執」限于那佛、謨佛（同段明写「謨謨鈍根那含者，思惑未盡」）
assert.equal(canonLeadOf('八背捨觀', '那佛'), '「那」表法执、「佛」表无漏善慧');
assert.equal(canonLeadOf('八背捨觀', '謨佛'), '「謨」表法执、「佛」表无漏善慧');
assert.equal(canonLeadOf('八背捨觀', '謨謨'), '「謨謨」二字俱表爱烦恼');
assert.equal(canonLeadOf('八背捨觀', '那阿'), '「那」表见烦恼、「阿」表施善');
// 未改判之位仍依卷首通表
assert.equal(canonLeadOf('上品十惡', '那那'), '「那那」二字俱表见烦恼');
assert.equal(canonLeadOf('上品十惡', '那彌'), '「那」表见烦恼、「彌」表戒善');
// 话头内不得出现「，」——它是话头与判语的分界，出现即切错
for (const key of Object.keys(CZ)) {
  const at2 = key.lastIndexOf('|');
  assert.ok(!canonLeadOf(key.slice(0, at2), key.slice(at2 + 1)).includes('，'), `话头内含「，」：${key}`);
}
assert.deepEqual(Object.keys(POS_GLYPH).sort(), ['八背捨觀', '鈍根阿那含'].sort());
assert.equal(CANON_GLYPH.阿, '施善');
assert.equal(CANON_GLYPH.彌, '戒善');
assert.equal(CANON_GLYPH.陀, '定善');
assert.equal(CANON_GLYPH.佛, '无漏善慧');

// 六、通例句须带「有漏」与「二俱无力」，不得再有等量对消之说
const stay = sfpManualWhyText('上品十惡', '那彌');
assert.ok(stay.includes('有漏'), `通例句缺「有漏」：${stay}`);
assert.ok(stay.includes('二俱无力'), `通例句缺「二俱无力」：${stay}`);
assert.ok(!stay.includes('相抵'), `通例句仍作等量对消：${stay}`);

// 七、盲区补正（2026-08-08）：本闸先前只校验「已改写的格」——话头落进 KNOWN_LEADS 的那些；
//   凡话头不在白名单者，applyCanonLead 原样返回，闸门便当它不存在，于是「该改而没改的」
//   一格也报不出来。「布施兼一分禅定」二十三格就是这样漏到屏上的（发起人 2026-08-08 指出）。
//   今反过来查结果：校勘之后凡仍带「一分」者即是漏网。谱中「一分」三见，与轮相无涉，逐一豁免：
//     · 智少一分（通教八人地，谱主原语）
//     · 各增一分三德（天台三德渐增）
//     · 别有一分下劣脩罗 / 一分想（《楞严》情想说原文）
const FEN_OK = /智少一分|各增一分三德|下劣脩羅|下劣修羅|一分想/;
const leaks = [];
// 要害在遍历范围：上面各条都只走 CZ（承注库）登记的键，而上游 door*-why／combo-why 里
//   尚有 CZ 之外的格，从来没进过任何一条检查——「布施兼一分禅定」二十三格正藏身于此。
//   故此处改遍上游全部键，逐格取校勘后的成文来查。
const ALL_UPSTREAM = { ...MANUAL, ...SFP_COMBO_WHY };
for (const key of Object.keys(ALL_UPSTREAM)) {
  const at3 = key.lastIndexOf('|');
  if (at3 < 0) continue;
  const pos = key.slice(0, at3), combo = key.slice(at3 + 1);
  if (combo.length !== 2) continue;
  const out = String(sfpManualWhyText(pos, combo) || applyCanonLead(String(ALL_UPSTREAM[key] || ''), pos, combo));
  if (/一分/.test(out) && !FEN_OK.test(out)) leaks.push(`${key} → ${out.slice(0, 42)}`);
}
assert.equal(leaks.length, 0,
  `校勘后仍有 ${leaks.length} 格带「一分」（轮相话头不当用此语，谱主表法是一轮一字）：\n  ${leaks.slice(0, 6).join('\n  ')}`);

console.log(`话头正名校验通过：${cells} 格；改写话头 ${rewritten} 格、依谱重写通例 ${stayFixed} 格；判语零改动`);
console.log(`「一分」漏网校验通过：0 格（豁免谱语三处：智少一分／各增一分三德／下劣脩羅・一分想）`);
