import assert from 'node:assert/strict';
import { SFP_GLOSS } from '../src/sfp-gloss.js';
import { 门01 } from '../正本/门01.js';
import { 门02 } from '../正本/门02.js';

const byName = new Map();
for (const [index, row] of SFP_GLOSS.entries()) {
  assert.ok(Array.isArray(row) && (row.length === 2 || row.length === 3), `词条结构异常：#${index}`);
  const [name, plain, source] = row;
  assert.ok(typeof name === 'string' && name.length >= 2, `词名异常：#${index}`);
  assert.ok(typeof plain === 'string' && plain.trim(), `释义为空：${name}`);
  if (source !== undefined) assert.ok(typeof source === 'string' && source.trim(), `出处为空：${name}`);
  assert.ok(!byName.has(name), `重复词名：${name}`);
  assert.ok(!/[.*+?^${}()|[\]\\]/u.test(name), `词名含正则特殊字符，game.js 须先转义：${name}`);
  assert.ok(!plain.includes('**'), `释义混入 Markdown 标记：${name}`);
  byName.set(name, row);
}

const plain = (name) => {
  assert.ok(byName.has(name), `缺少词条：${name}`);
  return byName.get(name)[1];
};
const hasAll = (name, parts) => parts.forEach((part) =>
  assert.ok(plain(name).includes(part), `词条「${name}」缺少关键义「${part}」`));

// 本谱已明定、且曾发生实错的法数与名相，逐条锁定。
hasAll('善慧', ['无漏善慧']);
hasAll('離欲', ['离开欲染', '离欲地']);
for (const name of ['乾慧', '乾慧地']) {
  hasAll(name, ['智慧深利', '相似理水']);
  assert.ok(!plain(name).includes('定水'), `词条「${name}」误把相似理水写成定水`);
}
hasAll('總相念', ['四境', '四观', '四倒']);
hasAll('十一切處', ['青、黄、赤、白、地、水、火、风、空、识']);
hasAll('八關齋', ['不歌舞倡伎及往观听', '不非时食', '前七名戒，第八名斋']);
hasAll('八關戒齋', ['不歌舞倡伎及往观听', '不非时食', '前七名戒，第八名斋']);
hasAll('不相應行', ['假立', '没有离开色心等另有实体']);
assert.ok(!/无明、掉、慢/u.test(plain('不相應行')), '不相应行误列心所法为例');
hasAll('常樂我淨', ['四倒', '四德']);

const door1Terms = [
  '上品十惡', '中品十惡', '下品十惡', '見取', '慢心行施', '世間福', '戒取',
  '下品十善', '中品十善', '上品十善', '邪定', '味禪', '根本四禪', '四無量心',
  '四無色定', '意見參禪', '利名習教', '出世福業', '出世戒學', '出世定學', '出世慧學',
  '阿鼻地獄', '無間地獄', '有間地獄', '下品畜生', '中品畜生', '上品畜生',
  '無財鬼', '少財鬼', '有財鬼', '畜脩羅', '鬼脩羅', '人脩羅', '天脩羅', '聽法雜眾',
];
const door2Terms = ['破尸羅', '破軌則', '毀正見', '棄多聞', '增上慢'];
for (const name of [...door1Terms, ...door2Terms]) assert.ok(byName.has(name), `门一、二专名漏收：${name}`);

const terms = [...byName.keys()].sort((a, b) => b.length - a.length);
const coverage = (door) => {
  const rows = Object.values(door).map((value) => String(value).split('‖')[0]);
  const missed = rows.filter((text) => !terms.some((term) => text.includes(term)));
  return { rows: rows.length, marked: rows.length - missed.length, used: terms.filter((term) => rows.some((text) => text.includes(term))).length };
};
const d1 = coverage(门01); const d2 = coverage(门02);

console.log(`名相小词典 ${SFP_GLOSS.length} 条：结构、重复、显示标记与高风险法数检查通过`);
console.log(`  第一门：${d1.marked}/${d1.rows} 格含需标名相，命中 ${d1.used} 个不同词条；其余为普通判定语`);
console.log(`  第二门：${d2.marked}/${d2.rows} 格含需标名相，命中 ${d2.used} 个不同词条；其余为普通判定语`);
