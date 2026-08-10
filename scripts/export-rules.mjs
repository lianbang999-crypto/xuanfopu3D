// 导出「二百二十位 × 廿一轮相」全表为 CSV（4620 格逐格一行）。
// 取值口与游戏完全同源：白话走 sfpManualWhyText（含本地话头校勘），引文走承注库，
// 升降走 sfp-rules.js —— 表里看到的就是卡面上看到的，不另起一套。
// 用法：npm run export:rules  [输出路径]
//
// 【2026-08-10 起只产 CSV，不再产 xlsx】用户令「excel 表删除，留一份 csv 就行」。
//   xlsx 由本仓自写的写入器生成，两份等价数据分处两种格式，改一处忘一处即成两个真源。
//   〈六字定诠〉原是 xlsx 的第二张表，今随之另出一个 CSV（同名加「·六字定诠」）。
//
// 【注意：本脚本产出的不是仓库根那张总表】
//   仓库根 选佛谱·轮相说明总表.csv 是 26 列——除本脚本的 22 列外，另有母本补齐工序
//   逐格实核的「当令层」「层次依据」，与 scripts/sync-canon-to-csv.mjs 追加的
//   「白话说明（正本）」「引文（正本）」。那张表勿用本脚本覆盖，
//   要更新正本判词请跑 node scripts/sync-canon-to-csv.mjs。
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SFP_POS, SFP_DOORS, SFP_WHY } from '../src/sfp-data.js';
import { SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { czOf } from '../src/sfp-chengzhu.js';
import { sfpDirOf } from '../src/sfp-rules.js';
import { sfpManualWhyText } from '../src/sfp-evidence.js';
import { glyphMeaningOf, CANON_GLYPH, POS_GLYPH } from '../src/sfp-lead-canon.js';
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
// （2026-08-10 起不再产 xlsx，故不引 ./lib/xlsx-min.mjs；该写入器仍留供他处用）

const MANUAL = {
  ...SFP_DOOR1_WHY, ...SFP_DOOR2_WHY, ...SFP_DOOR3_WHY, ...SFP_DOOR4_WHY, ...SFP_DOOR5_WHY,
  ...SFP_DOOR6_WHY, ...SFP_DOOR7_WHY, ...SFP_DOOR8_WHY, ...SFP_DOOR9_WHY, ...SFP_DOOR10_WHY,
  ...SFP_DOOR11_WHY, ...SFP_DOOR12_WHY, ...SFP_DOOR13_WHY, ...SFP_DOOR14_WHY,
};

// 廿一相：谱中轮面次第「那謨阿彌陀佛」，两两组合不计先后
const FACES = ['那', '謨', '阿', '彌', '陀', '佛'];
const COMBOS = [];
for (let i = 0; i < 6; i += 1) for (let j = i; j < 6; j += 1) COMBOS.push(FACES[i] + FACES[j]);

const BY_ID = Object.fromEntries(SFP_POS.map((p) => [p.id, p]));
const DOOR = Object.fromEntries(SFP_DOORS.map((d) => [d.no, d]));
const JUAN = {};
const CANON_TEXT = {};
for (const d of Object.values(SFP_CANON_DOORS)) for (const p of d.positions) {
  JUAN[p.name] = d.juan;
  CANON_TEXT[p.name] = p.text;
}

const DIR_LABEL = { up: '升', down: '降', pure: '横超', side: '转', stay: '安住' };
const ORDER = SFP_POS.map((p) => p.id); // 同门内依谱序定升降，与 scripts/check-dir.mjs 同源

function layerOf(position, combo) {
  const k = `${position}|${combo}`;
  if (MANUAL[k]) return '手工逐组（门1–14 手写）';
  if (SFP_COMBO_WHY[k]) return '话头改写层';
  if (SFP_STAY_WHY[k]) return '通例·不行之由';
  return '承注库';
}

const rows = [[
  '序号', '门次', '门名', '卷次', '位次', '轮相',
  '首字', '首字表义', '次字', '次字表义',
  '判定', '去处', '去处门次', '升降', '贈掷',
  '白话说明', '说明来源', '承注层级',
  '谱曰原文（本位按语）', '引文', '引文出处', '引文所出之位',
]];

let n = 0;
for (const p of SFP_POS) {
  for (const combo of COMBOS) {
    n += 1;
    const mv = (p.moves || []).find((m) => m.c.includes(combo));
    const dest = mv && mv.to ? BY_ID[mv.to] : null;

    let verdict; let dir = '';
    const terminal = p.door === 15 && !(p.moves || []).length;
    if (terminal) { verdict = '终局·不再掷轮'; dir = '终局'; }
    else if (!mv) { verdict = '不行·安住本位'; dir = '安住'; }
    else if (!mv.to && mv.bonus) { verdict = '贈掷·不移位'; dir = '贈掷'; }
    else if (dest && dest.id === p.id) { verdict = '不行·安住本位'; dir = '安住'; }
    else { verdict = '行'; dir = DIR_LABEL[sfpDirOf(p, dest, combo, ORDER)] || ''; }

    const cz = czOf(p.name, combo) || czOf(p.id, combo);
    const cites = cz ? cz.cites : [];
    rows.push([
      n,
      `第${p.door}门`, DOOR[p.door] ? DOOR[p.door].title : '',
      JUAN[p.name] ? `卷${JUAN[p.name]}` : '',
      p.name, combo,
      combo[0], glyphMeaningOf(p.id, combo[0], combo),
      combo[1], glyphMeaningOf(p.id, combo[1], combo),
      verdict,
      dest && dest.id !== p.id ? dest.name : '',
      dest && dest.id !== p.id ? `第${dest.door}门` : '',
      dir,
      mv && mv.bonus ? `贈${'一二三四'[mv.bonus - 1]}掷` : '',
      sfpManualWhyText(p.id, combo) || (cz && cz.plain) || '',
      layerOf(p.id, combo),
      cz ? cz.level : '',
      (SFP_WHY[p.id] && SFP_WHY[p.id][combo])
        || (p.id === '三等一切佛迴向' ? '三世佛法。一切時行。故名等一切佛也。' : '')
        || (terminal ? (CANON_TEXT[p.name] || '') : ''),
      cites.map((x) => x.t).join('\n'),
      cites.map((x) => x.r).join('\n'),
      [...new Set(cites.map((x) => x.n).filter(Boolean))].join('、'),
    ]);
  }
}

// 第二张表：卷首〈輪相表法第一〉四重定诠 ＋ 诸门明文改判，供查表时对照
const ref = [['层次', '轮字', '所表', '谱曰逐字（卷首〈輪相表法第一〉）']];
const FIRST = {
  那: ['見煩惱', '那表屬見煩惱。亦名分別惑。亦名見惑。邪見分別所起惑故。亦名見所斷惑。見真諦道時。此惑頓斷故。'],
  謨: ['愛煩惱', '謨表屬愛煩惱。亦名俱生惑。亦名思惑。不由分別。任運起故。亦名修所斷惑。微細難斷。須見道後修無漏道。乃漸斷故。'],
  阿: ['施善', '阿表施善。'],
  彌: ['戒善', '彌表戒善。'],
  陀: ['定善', '陀表定善。'],
  佛: ['善慧', '佛表善慧。'],
};
for (const [ch, [meaning, quote]] of Object.entries(FIRST)) ref.push(['第一重·惑与善', ch, meaning, quote]);
ref.push(['第二重·有漏无漏', '阿彌陀', '有漏善', '或阿彌陀。表有漏善。佛表無漏善。']);
ref.push(['第二重·有漏无漏', '佛', '无漏善', '布施。持戒。禪定。設無出世智慧。並名有漏。故惟智慧名無漏善。當知以慧導施戒禪。則施戒禪亦無漏矣。']);
for (const [ch, m] of [['阿', '生滅門（藏）'], ['彌', '無生滅門（通）'], ['陀', '次第門（別）'], ['佛', '圓頓門（圓）']]) {
  ref.push(['第三重·四教门', ch, m, '又阿表生滅門。彌表無生滅門。陀表次第門。佛表圓頓門。約出世慧。法爾有此四門。初是三乘鈍根。二是三乘利根。三是大乘鈍根。四是大乘利根。故順次表之也。']);
}
ref.push(['诸门改判·鈍根阿那含（全位）', '那／謨', '界外见惑／界外爱惑', '問。那謨二字既表見愛。若有見愛。何成四果。答。界內見惑。初果先已斷盡。界內愛染。四空之所存者無幾。今遇佛字。安得不斷。此那謨字。正表界外見愛。所謂無明別惑。']);
ref.push(['诸门改判·八背捨觀（限那佛謨佛）', '那／謨', '法执', '那佛謨佛皆四果者。無漏定力。但遇佛字。必出生死。那謨以表法執。故為定性聲聞也。（同段又云「謨謨鈍根那含者。思惑未盡。生四空天故」，可见三惡相在本位仍是思惑，故此改判不通全位。）']);
ref.push(['本表用词', '——', Object.entries(CANON_GLYPH).map(([k, v]) => `${k}＝${v}`).join('，'), `话头依卷首体例「X表Y」立文；门位改判者：${Object.keys(POS_GLYPH).join('、')}`]);

// 加 BOM，Excel 才认 UTF-8（否则中文成乱码）；换行用 CRLF。
const csvCell = (v) => {
  const t = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCSV = (rs) => `﻿${rs.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

const out = (process.argv[2] || join(homedir(), 'Downloads', '选佛谱·轮相说明总表.csv'))
  .replace(/\.xlsx$/i, '.csv');
const csv = toCSV(rows);
writeFileSync(out, csv, 'utf8');

// 〈六字定诠〉原为 xlsx 第二张表，今另出一个 CSV
const outRef = out.replace(/\.csv$/i, '·六字定诠.csv');
const refCsv = toCSV(ref);
writeFileSync(outRef, refCsv, 'utf8');

console.log(`已导出 ${rows.length - 1} 行（220 位 × 21 相）`);
console.log(`  总表    ${out}  （${(Buffer.byteLength(csv) / 1024 / 1024).toFixed(2)} MB）`);
console.log(`  六字定诠 ${outRef}  （${ref.length - 1} 行）`);
