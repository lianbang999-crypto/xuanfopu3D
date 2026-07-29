import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SFP_POS, SFP_WHY } from '../src/sfp-data.js';
import { SFP_CANON_FRONT, SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { SFP_POS_PLAIN } from '../src/sfp-pos-plain.js';
import { SFP_DOOR_PLAIN, SFP_GLOSS } from '../src/sfp-gloss.js';
import { NODES } from '../src/data.js';
import {
  SFP_EVIDENCE_TYPE,
  SFP_WHY_EVIDENCE,
  makeSfpOperationalEvidence,
  sfpWhyPlainText,
} from '../src/sfp-evidence.js';

const allowedTypes = new Set(Object.values(SFP_EVIDENCE_TYPE));
const canonByPosition = {};
for (const door of Object.values(SFP_CANON_DOORS)) {
  for (const position of door.positions) canonByPosition[position.name] = position.text.replace(/^譜曰。/, '');
}

const original = Array.from({ length: 6 }, (_, index) =>
  fs.readFileSync(`校正原本/原文/B0136_${String(index + 1).padStart(3, '0')}.txt`, 'utf8'),
).join('\n');
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
    evidenceCells += 1;

    for (const item of value.items) {
      assert.ok(allowedTypes.has(item.type), `未知证据类型：${position}/${combo}/${item.type}`);
      assert.ok(item.text && typeof item.text === 'string', `空证据文字：${position}/${combo}`);
      if (item.type === SFP_EVIDENCE_TYPE.source) {
        sourceQuotes += 1;
        assert.equal(item.attribution, '蕅益智旭《選佛譜》');
        if (item.subtype === 'pu_explanation') {
          assert.ok(canonByPosition[position]?.includes(item.text), `谱曰不是该位逐字原文：${position}/${combo}`);
        } else if (item.subtype === 'rule_fact') {
          assert.ok(original.includes(item.text), `行法引文不在校正原本：${position}/${combo}`);
        } else {
          assert.fail(`未知原文子类型：${position}/${combo}/${item.subtype}`);
        }
        assert.notEqual(item.text, legacyText.startsWith('行法原文「') ? legacyText : null, `项目解释误作原文：${position}/${combo}`);
      }
      if (item.type === SFP_EVIDENCE_TYPE.interpretation) interpretations += 1;
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
assert.ok(SFP_POS_PLAIN['中品十善'].includes('是人道因'));
assert.ok(SFP_POS_PLAIN['四無量心'].includes('四禅天王'));
assert.ok(SFP_POS_PLAIN['有間地獄'].includes('九分情、一分想'));
assert.ok(SFP_POS_PLAIN['無想天'].includes('五百大劫'));
assert.ok(SFP_DOOR_PLAIN[3].includes('上品感地狱、中品畜生、下品饿鬼'));
assert.ok(SFP_DOOR_PLAIN[5].includes('五净居是三果圣者所居'));
const glossByName = Object.fromEntries(SFP_GLOSS.map(([name, plain]) => [name, plain]));
assert.ok(glossByName['寂光'].includes('下下至上中八品'));
assert.ok(glossByName['四無量心'].includes('四禅天王'));

const operation = makeSfpOperationalEvidence('由赠者选择同席他人，受赠者即时于自身所在位行谱。').items[0];
assert.equal(operation.type, SFP_EVIDENCE_TYPE.operation);
assert.equal(operation.authority, 'operational_interpretation');
assert.equal(operation.attribution, '本项目定稿操作规则');
assert.deepEqual(ontology.evidenceBoundary.uiEvidenceTypes, {
  sourceQuote: SFP_EVIDENCE_TYPE.source,
  sourceSubtypes: ['rule_fact', 'pu_explanation'],
  interpretation: SFP_EVIDENCE_TYPE.interpretation,
  operationRule: SFP_EVIDENCE_TYPE.operation,
});
assert.ok(!/import\s*\{[^}]*\bSFP_WHY\b[^}]*\}\s*from\s*['"]\.\/sfp-data\.js['"]/.test(gameSource), '游戏层不得绕过证据对象直接读取 SFP_WHY');
for (const label of ['行法原文', '谱曰原文', '释义', '本项目操作规则']) {
  assert.ok(gameSource.includes(label), `游戏界面缺少证据标签：${label}`);
}

// V98 采纳版（2026-07-29）：位白话整库换为上游全量校对底本＋本地 87 处裁定修正；
// 快照钉改为关键判语守卫——守谱明去向事实，不冻结文风。
assert.ok(SFP_POS_PLAIN['中品十惡'].includes('是畜生因'));
assert.ok(SFP_POS_PLAIN['下品十惡'].includes('是饿鬼因'));
assert.ok(SFP_POS_PLAIN['下品十善'].includes('是阿修罗道因'));
assert.ok(SFP_POS_PLAIN['出世福業'].includes('布施作福、求出生死'));
assert.ok(SFP_POS_PLAIN['常寂光淨土'].includes('上上一品归入极果位'));
assert.ok(SFP_POS_PLAIN['常寂光淨土'].includes('其余八品总摄于本位'));

console.log(`证据类型校验通过：${evidenceCells} 格、${sourceQuotes} 条逐字原文、${interpretations} 条释义；操作规则独立为 ${SFP_EVIDENCE_TYPE.operation}`);
