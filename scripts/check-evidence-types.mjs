import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SFP_POS, SFP_WHY, SFP_DOORS } from '../src/sfp-data.js';
import { SFP_CANON_FRONT, SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { SFP_POS_PLAIN } from '../src/sfp-pos-plain.js';
import { SFP_DOOR_PLAIN, SFP_GLOSS } from '../src/sfp-gloss.js';
import { NODES } from '../src/data.js';
import {
  SFP_EVIDENCE_TYPE,
  SFP_WHY_EVIDENCE,
  SFP_VAGUE_FORMS,
  makeSfpOperationalEvidence,
  makeSfpGlyphEvidence,
  sfpWhyPlainText,
} from '../src/sfp-evidence.js';
import { SFP_GLYPH_WHY } from '../src/sfp-glyph-why.js';
import { SFP_REFER_WHY } from '../src/sfp-refer-why.js';   // v390 旧溯源表：已由承注库取代，保留作历史数据与自身护栏
import { CZ, CZ_ANS, CZ_CITE, czOf } from '../src/sfp-chengzhu.js';

const allowedTypes = new Set(Object.values(SFP_EVIDENCE_TYPE));
const MIXED_COMBOS = new Set(['那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀']);
// 摘引以「……」标省略（承注库体例）：逐段校验，各段皆须为逐字原文。
// 括注符号两底本处理不同（G 版繁体版存「(至誠心…)」，本工程校正本去括号），属校勘层差异非讹误，比对时归一化。
// 异体字：本工程校正层 V78 统一规范字「迴」，G 版繁体版存底本原字「囘」
// 归一化三类底本层差异（皆非讹误）：校勘标记 [A1]、括注符号、异体字囘/迴
const dropBrackets = (t) => String(t || '')
  .replace(/\[[^\]]*\]/g, '').replace(/[()（）]/g, '').replaceAll('囘', '迴');
const verbatimIn = (haystack, text) => {
  if (!haystack) return false;
  const hay = dropBrackets(haystack);
  return String(text).split('……').every((seg) => !seg.trim() || hay.includes(dropBrackets(seg)));
};
const canonByPosition = {};
for (const door of Object.values(SFP_CANON_DOORS)) {
  for (const position of door.positions) canonByPosition[position.name] = position.text.replace(/^譜曰。/, '');
}

const originalVolumes = Array.from({ length: 6 }, (_, index) =>
  fs.readFileSync(`校正原本/原文/B0136_${String(index + 1).padStart(3, '0')}.txt`, 'utf8'),
);
const original = originalVolumes.join('\n');
const citeAtDeclaredLine = (cite) => {
  const lineNo = Number(String(cite.r || '').match(/・L(\d+)/)?.[1]);
  const volume = originalVolumes[Number(cite.j) - 1];
  if (!volume || !lineNo) return false;
  return verbatimIn(volume.split(/\r?\n/u)[lineNo - 1], cite.t);
};
const ontology = JSON.parse(fs.readFileSync('data/grant-ontology-v1.json', 'utf8'));
const gameSource = fs.readFileSync('src/game.js', 'utf8');

let legacyCells = 0;
let evidenceCells = 0;
let sourceQuotes = 0;
let interpretations = 0;
for (const [position, combos] of Object.entries(SFP_WHY)) {
  for (const [combo, legacyText] of Object.entries(combos)) {
    legacyCells += 1;
    const value = SFP_WHY_EVIDENCE[position]?.[combo];
    assert.ok(value, `缺少证据对象：${position}/${combo}`);
    assert.ok(Array.isArray(value.items) && value.items.length, `空证据对象：${position}/${combo}`);
    assert.ok(value.items.some((item) => item.type === SFP_EVIDENCE_TYPE.source), `缺少原文证据：${position}/${combo}`);
    // 白话全覆盖硬校验：从前只计数不校验，空無邊處天/佛佛 因白话键多一尾句号静默缺格而本脚本照常通过——
    // 句读差异不许再漏网，缺一格即失败
    assert.ok(value.items.some((item) => item.type === SFP_EVIDENCE_TYPE.interpretation), `缺白话释义：${position}/${combo}`);
    evidenceCells += 1;

    for (const item of value.items) {
      assert.ok(allowedTypes.has(item.type), `未知证据类型：${position}/${combo}/${item.type}`);
      assert.ok(item.text && typeof item.text === 'string', `空证据文字：${position}/${combo}`);
      if (item.type === SFP_EVIDENCE_TYPE.source) {
        sourceQuotes += 1;
        assert.equal(item.attribution, '蕅益智旭《選佛譜》');
        if (item.subtype === 'pu_explanation') {
          assert.ok(verbatimIn(canonByPosition[position], item.text), `谱曰不是该位逐字原文：${position}/${combo}`);
        } else if (item.subtype === 'rule_fact') {
          assert.ok(original.includes(item.text), `行法引文不在校正原本：${position}/${combo}`);
        } else if (item.subtype === 'refer_note') {
          // 总括句所指位按语：须为被指位逐字原文，且与承注库该格所系引文逐字一致
          // 有所指位者，须为该位逐字原文；无所指位者（门总说等），须在校正原本中逐字寻得
          if (item.refName) assert.ok(verbatimIn(canonByPosition[item.refName], item.text), `所指位引文非其逐字原文：${position}/${combo} → ${item.refName}`);
          else assert.ok(verbatimIn(original, item.text), `引文不在校正原本：${position}/${combo}`);
          // 所指引文须有据：出于承注库，或出于 v390 旧溯源表（「另见」并存条，相杂格除外）
          const inCz = czOf(position, combo)?.cites.some((cite) => cite.t === item.text);
          const inLegacy = SFP_REFER_WHY[`${position}|${combo}`]?.t === item.text;
          assert.ok(inCz || inLegacy, `所指位引文无据（承注库与旧溯源表皆无）：${position}/${combo}`);
          if (inLegacy && !inCz) assert.ok(!MIXED_COMBOS.has(combo), `相杂格不得取旧溯源表（旧表误溯三惡相按语）：${position}/${combo}`);
        } else {
          assert.fail(`未知原文子类型：${position}/${combo}/${item.subtype}`);
        }
        assert.notEqual(item.text, legacyText.startsWith('行法原文「') ? legacyText : null, `项目解释误作原文：${position}/${combo}`);
      }
      if (item.type === SFP_EVIDENCE_TYPE.interpretation) interpretations += 1;
      if (item.type === SFP_EVIDENCE_TYPE.glyph) {
        // v389 字义解只出现在总括句无溯源的格：另署不冒谱曰
        assert.ok(SFP_VAGUE_FORMS.has(legacyText.trim()), `字义解混入有实义按语的格：${position}/${combo}`);
        assert.ok(item.attribution.includes('字义解'), `字义解署名缺失：${position}/${combo}`);
        assert.ok(!item.text.startsWith('譜曰') && !item.text.startsWith('谱曰'), `字义解冒谱曰：${position}/${combo}`);
      }
      assert.notEqual(item.type, SFP_EVIDENCE_TYPE.operation, `SFP_WHY 不应混入操作规则：${position}/${combo}`);
    }
  }
}

assert.equal(evidenceCells, legacyCells);
// V78 起按二百二十位完整行法表生成，现有 2,210 个「位 × 轮相」证据单元。
assert.equal(legacyCells, 2210);
assert.equal(SFP_POS.length, 220);
assert.deepEqual(SFP_POS.filter((position) => !SFP_POS_PLAIN[position.id]), []);
assert.equal(SFP_WHY_EVIDENCE['五停心']['謨佛'].items[0].text, '謨佛。則已得發真。猶存思惑。');

// V74 交叉核验确认的三处谱曰边界：不得带入上一格括注、下一问或后文通则。
assert.equal(SFP_WHY['邪定']['謨佛'], '謨佛愛習尚重雖聞佛法須習停心。');
assert.equal(SFP_WHY['出世戒學']['佛佛'], '佛佛頓具戒波羅密。名為無上道戒。大乘三戒大其戒也。');
assert.equal(SFP_WHY['初發心住']['佛佛'], '佛佛開麤顯妙。亦是勝進接也。');
assert.ok(!SFP_WHY['邪定']['謨佛'].includes('即非非想處天'));
assert.ok(!SFP_WHY['出世戒學']['佛佛'].includes('問。出世福業'));
assert.ok(!SFP_WHY['初發心住']['佛佛'].includes('從淨土來者'));

// V78 校正层统一规范字「迴」；白话释义仍能以稳定证据对象命中。
assert.equal(SFP_WHY['彌勒內院']['陀陀'], '陀陀。則有功用行已極。故為第十迴向。');
assert.equal(
  sfpWhyPlainText(SFP_WHY['彌勒內院']['陀陀']),
  // 2026-08-07 移植线上 V105 后，白话库底本形由繁改简（谱曰引文仍逐字保繁，不在此列）。
  // 用户侧繁简仍由 game.js 之 zh() 一键切换，且简体作底本更稳：zh() 是双向的，
  // 繁体底本在繁体模式下会被「简→繁」再套一遍，简体底本无此虞。
  '陀陀则有功用之行已至其极，故进为第十回向。',
);

// V78 校正原本的篇名与缺字标记须完整保留。
assert.equal(SFP_CANON_FRONT[0].title, '敘選佛譜敘');
assert.ok(SFP_CANON_FRONT[0].text.includes('捺麻僧'));
assert.ok(SFP_CANON_FRONT.some((item) => item.title === '輪相表法第一'));
assert.equal(SFP_CANON_DOORS[15].positions[0].name, '佛');

// V74 世界数据及补充白话必须与谱文明确因行一致。
const nodeById = Object.fromEntries(NODES.map((node) => [node.id, node]));
assert.ok(nodeById.preta.cause.v.startsWith('下品十恶'));
assert.ok(nodeById.animal.cause.v.startsWith('中品十恶'));
assert.ok(nodeById.asura.cause.v.startsWith('下品十善'));
assert.ok(nodeById.caturmaharaja.cause.v.startsWith('上品十善'));
assert.ok(nodeById.trayastrimsa.cause.v.startsWith('亦上品十善'));
assert.ok(nodeById.yama.cause.v.startsWith('上品十善兼学坐禅'));
// 白話庫已統一底本形（繁），用戶側繁簡由 game.js 之 zh() 一鍵切換。
// 斷言故作繁簡無關：兩側歸簡再比——如此數據層無論存繁存簡，斷言皆不失效。
const { ZH_T2S: _T2S } = await import('../src/zh-conv.js');
const _ML = Math.max(...Object.keys(_T2S).map((k) => k.length));
const toS = (x) => { let r = '', i = 0; const t = String(x || '');
  while (i < t.length) { let h = 0;
    for (let L = Math.min(_ML, t.length - i); L >= 1; L--) { const g = t.substr(i, L);
      if (_T2S[g] !== undefined) { r += _T2S[g]; i += L; h = 1; break; } }
    if (!h) { r += t[i]; i++; } }
  return r; };
const hasZh = (hay, needle) => toS(hay).includes(toS(needle));

assert.ok(hasZh(SFP_POS_PLAIN['中品十善'], '是人道因'));
assert.ok(hasZh(SFP_POS_PLAIN['四無量心'], '四禅天王'));
// 2026-08-07 移植 V105 时复核：位白话仍用本地全文本（V105 于 45 位删去两成以上，
// 其中常寂光淨土整段九品分判被删，而那正是门14「上上一品入极果、其余八品得贈掷」的义理依据）。
// 判词卡的「极简」改由 posGistLine 逐位择一句达成，不靠削薄底本。
assert.ok(hasZh(SFP_POS_PLAIN['有間地獄'], '九分情、一分想'));
assert.ok(hasZh(SFP_POS_PLAIN['無想天'], '五百大劫'));
// V99 门导语随上游改写为更贴谱文的全文（v387-v391 批）：快照钉改关键判语守卫
assert.ok(SFP_DOOR_PLAIN[3].includes('招感地狱、畜生、饿鬼'));
assert.ok(SFP_DOOR_PLAIN[5].includes('同属天趣、同名定地'));
const glossByName = Object.fromEntries(SFP_GLOSS.map(([name, plain]) => [name, plain]));
assert.ok(glossByName['寂光'].includes('下下至上中八品'));
assert.ok(glossByName['四無量心'].includes('四禅天王'));

const operation = makeSfpOperationalEvidence('由赠者选择同席他人，受赠者即时于自身所在位行谱。').items[0];
assert.equal(operation.type, SFP_EVIDENCE_TYPE.operation);
assert.equal(operation.authority, 'operational_interpretation');
assert.equal(operation.attribution, '本项目定稿操作规则');
assert.deepEqual(ontology.evidenceBoundary.uiEvidenceTypes, {
  sourceQuote: SFP_EVIDENCE_TYPE.source,
  sourceSubtypes: ['rule_fact', 'pu_explanation', 'refer_note'],
  interpretation: SFP_EVIDENCE_TYPE.interpretation,
  operationRule: SFP_EVIDENCE_TYPE.operation,
  glyphInterpretation: SFP_EVIDENCE_TYPE.glyph,
});
assert.ok(!/import\s*\{[^}]*\bSFP_WHY\b[^}]*\}\s*from\s*['"]\.\/sfp-data\.js['"]/.test(gameSource), '游戏层不得绕过证据对象直接读取 SFP_WHY');
for (const label of ['行法原文', '谱曰原文', '释义', '本项目操作规则', '字义解', '所指位谱曰']) {
  assert.ok(gameSource.includes(label), `游戏界面缺少证据标签：${label}`);
}

// V99 两个生成层（v389 字义解 / v390 总括句溯源）的数据护栏：
// ① 溯源表逐格：被指位存在、引文为其逐字原文、本格谱注确为总括式指代句；
// ② 字义解逐格：所称去向与本位行法表零差异（门内/跨门/门名全核）；不覆盖谱主实义按语的显示层由证据层构建顺序保证。
const doorTitleByNo = {};
SFP_DOORS.forEach((door, index) => { doorTitleByNo[door.no ?? index + 1] = door.title; });
const positionById = Object.fromEntries(SFP_POS.map((position) => [position.id, position]));
const positionByName = Object.fromEntries(SFP_POS.map((position) => [position.name, position]));
positionByName['佛'] = positionById['圓教究竟妙覺位'];
let referCells = 0;
for (const [key, refer] of Object.entries(SFP_REFER_WHY)) {
  referCells += 1;
  const [pid, combo] = key.split('|');
  const from = positionById[pid] || positionByName[pid];
  assert.ok(from, `溯源表位不存在：${key}`);
  assert.ok(SFP_WHY[from.id]?.[combo] !== undefined, `溯源格无谱注：${key}`);
  const target = positionByName[refer.s] || positionById[refer.s];
  assert.ok(target, `被指位不存在：${key} → ${refer.s}`);
  assert.ok(canonByPosition[target.name]?.includes(refer.t), `所指引文非被指位逐字原文：${key}`);
}
assert.equal(referCells, 387);

// 承注库护栏（取代 v390 溯源表之数据护栏，覆盖 387 → 4620 格）：
// ① 逐格键为「位|相」且位存在；② 引文皆为所署位之逐字原文（门总说别论）；
// ③ 非推演格之答语须为原文（可在校正原本中逐字寻得）；④ 层级只此五值。
const CZ_LEVELS = new Set(['直說', '承注', '攜帶', '通則', '推演']);
let czCells = 0, czInferred = 0, czCites = 0;
for (const [key, row] of Object.entries(CZ)) {
  czCells += 1;
  const at = key.lastIndexOf('|');
  const pname = key.slice(0, at), combo = key.slice(at + 1);
  assert.ok(positionByName[pname] || positionById[pname], `承注库位不存在：${key}`);
  const [ansIdx, citeIdxs, level] = row;
  assert.ok(CZ_LEVELS.has(level), `承注库层级未收录：${key}/${level}`);
  const ans = CZ_ANS[ansIdx];
  assert.ok(ans && typeof ans === 'string', `承注库空答语：${key}`);
  if (level === '推演') {
    czInferred += 1;
    assert.ok(citeIdxs.length >= 1, `推演格无所据引文：${key}`);
  } else {
    // 非推演格之答语即谱曰逐字原文
    assert.ok(verbatimIn(original, ans), `承注库答语非逐字原文：${key}`);
  }
  for (const ci of citeIdxs) {
    czCites += 1;
    const cite = CZ_CITE[ci];
    assert.ok(cite && cite.t && cite.r, `承注库引文残缺：${key}`);
    assert.ok(verbatimIn(original, cite.t), `承注库引文不在校正原本：${key}`);
    if (cite.n && canonByPosition[cite.n]) {
      // 所署位的原文包括本位「譜曰」義解與其上方行法輪相表。
      // 後者不在 SFP_CANON_DOORS 的譜曰段內，故改以「卷次＋L行號」反查原本，
      // 仍須在所署行逐字命中，不放寬為全書任意出處。
      assert.ok(
        verbatimIn(canonByPosition[cite.n], cite.t) || citeAtDeclaredLine(cite),
        `承注库引文非所署位逐字原文：${key} → ${cite.n}`,
      );
    }
  }
}
assert.equal(czCells, 4620);
assert.equal(czInferred, 343);
assert.equal(CZ_ANS.length, 842);
assert.equal(CZ_CITE.length, 858);
// 承注库补足 SFP_WHY 未载之格，证据对象由 2210 增至 4620
let evidenceTotal = 0;
for (const combos of Object.values(SFP_WHY_EVIDENCE)) evidenceTotal += Object.keys(combos).length;
assert.equal(evidenceTotal, 4620);
// 抽查：相杂格依卷一〈見取〉通则，不再误溯三惡相按语
assert.equal(czOf('中品畜生', '那阿').level, '通則');
assert.ok(czOf('中品畜生', '那阿').cites[0].n === '見取');
// 抽查：承注格答语取被承位实质按语，不停在总括句
assert.equal(czOf('味禪', '阿佛').ans, '阿佛等三即世間定堪通出世間定。');
let glyphCells = 0;
for (const [key, text] of Object.entries(SFP_GLYPH_WHY)) {
  glyphCells += 1;
  const [pid, combo] = key.split('|');
  const from = positionById[pid] || positionByName[pid];
  assert.ok(from, `字义解位不存在：${key}`);
  const move = (from.moves || []).find((item) => item.c.includes(combo));
  let match;
  if ((match = text.match(/本位行法列此组于本门内往「([^」]+)」/))) {
    const dest = positionByName[match[1]] || positionById[match[1]];
    assert.ok(move && move.to === (dest ? dest.id : match[1]), `字义解去向不符行法表：${key}`);
    assert.ok(dest && dest.door === from.door, `字义解称本门内而实跨门：${key}`);
  } else if ((match = text.match(/本位行法列此组出「([^」]+)」而入「([^」]+)」的「([^」]+)」/))) {
    const dest = positionByName[match[3]] || positionById[match[3]];
    assert.ok(move && move.to === (dest ? dest.id : match[3]), `字义解去向不符行法表：${key}`);
    assert.ok(doorTitleByNo[from.door] === match[1], `字义解出门名不符：${key}`);
    assert.ok(dest && doorTitleByNo[dest.door] === match[2], `字义解入门名不符：${key}`);
  } else {
    assert.fail(`字义解句式未收录（去向不可核）：${key}`);
  }
}
assert.equal(glyphCells, 1369);
// 抽查：总括句展开取被指位同组按语（味禪·佛佛 ← 邪定），字义解兜底证据另署
assert.equal(SFP_REFER_WHY['味禪|佛佛'].s, '邪定');
assert.equal(SFP_REFER_WHY['味禪|佛佛'].t, '佛佛純慧照了邪相便可通達正相矣。');
assert.ok(SFP_WHY_EVIDENCE['味禪']['佛佛'].items.some((item) => item.subtype === 'refer_note'));
const glyphEvidence = makeSfpGlyphEvidence('中品畜生', '佛佛');
assert.ok(glyphEvidence && glyphEvidence.items[0].type === SFP_EVIDENCE_TYPE.glyph);
assert.ok(glyphEvidence.items[0].attribution.includes('輪相表法'));

// V98 采纳版（2026-07-29）：位白话整库换为上游全量校对底本＋本地 87 处裁定修正；
// 快照钉改为关键判语守卫——守谱明去向事实，不冻结文风。
assert.ok(hasZh(SFP_POS_PLAIN['中品十惡'], '是畜生因'));
assert.ok(hasZh(SFP_POS_PLAIN['下品十惡'], '是饿鬼因'));
assert.ok(hasZh(SFP_POS_PLAIN['下品十善'], '是阿修罗道因'));
assert.ok(hasZh(SFP_POS_PLAIN['出世福業'], '布施作福、求出生死'));
assert.ok(hasZh(SFP_POS_PLAIN['常寂光淨土'], '上上一品归入极果位'));
assert.ok(hasZh(SFP_POS_PLAIN['常寂光淨土'], '其余八品总摄于本位'));

console.log(`证据类型校验通过：${evidenceCells} 格、${sourceQuotes} 条逐字原文、${interpretations} 条释义；操作规则独立为 ${SFP_EVIDENCE_TYPE.operation}`);
