// 世界模型文档生成器：从 src/data.js（55 节点·102 引文）与 src/sfp-data.js（15 门 220 位）
// 生成 docs/世界模型·经证总表.md —— 须弥山十法界世界模型 + 选佛谱位次入界映射
// 用法：npm run gen:docs

import { writeFileSync } from 'node:fs';
import { NODES, REALMS, COORD_KIND_LABEL } from '../src/data.js';
import { SFP_POS, SFP_DOORS, SFP_META } from '../src/sfp-data.js';

const lines = [];
const P = (s = '') => lines.push(s);

P('# 须弥山十法界世界模型 · 经证总表');
P();
P('> 本表由 `scripts/gen-worldmodel.mjs` 从游戏数据自动生成，与游戏内呈现严格同源。');
P('> 数据依 CBETA 电子佛典结构化；引文条目 kind 标注：**quote**＝经文摘录（依 CBETA 通行本校写），**para**＝义理概述（非逐字经文）。');
P('> 空间定位性质：' + Object.entries(COORD_KIND_LABEL).map(([k, v]) => `**${k}**＝${v}`).join('；') + '。');
P();
P(`选佛谱底本：${SFP_META.source}`);
P();

// ---- 十法界总纲 ----
P('## 一 · 十法界总纲');
P();
P('| 法界 | 心性刻画（觉/喜/利他，游戏内心性曼荼罗参数） |');
P('|---|---|');
for (const r of [...REALMS].reverse()) {
  P(`| ${r.name} | 觉 ${r.mind.awaken} · 喜 ${r.mind.joy} · 利他 ${r.mind.altru} |`);
}
P();

// ---- 世界结构 ----
P('## 二 · 世界结构（依经论所述空间次第）');
P();
const groups = [];
for (const n of NODES) if (!groups.includes(n.group)) groups.push(n.group);
for (const g of groups) {
  const ns = NODES.filter(n => n.group === g);
  P(`### ${g}（${ns.length} 处）`);
  P();
  P('| 名称 | 简注 | 界属 | 定位性质 | 方位 | 高程（经说） |');
  P('|---|---|---|---|---|---|');
  for (const n of ns) {
    P(`| **${n.name}** | ${n.sub || ''} | ${n.sphere || ''} | ${COORD_KIND_LABEL[n.coordKind] || n.coordKind} | ${n.bear || '—'} | ${n.elev || '—'} |`);
  }
  P();
}

// ---- 逐节点经证 ----
P('## 三 · 逐节点经证（102 条）');
P();
for (const n of NODES) {
  const cs = n.citations || [];
  if (!cs.length) continue;
  P(`### ${n.name}`);
  if (n.line) P(`> ${n.line}`);
  P();
  for (const c of cs) {
    const tag = c.kind === 'quote' ? '摘录' : '概述';
    P(`- 【${tag}】《${c.work}》${c.juan || ''}（${c.ref || ''}）：${c.text}`);
  }
  P();
}

// ---- 选佛谱 220 位入界映射 ----
P('## 四 · 选佛谱十五门二百二十位 · 入界映射');
P();
P('> 每一位以 `anchor` 锚入世界模型节点；行棋时棋子即在该节点星域中落位。');
P();
const byDoor = {};
for (const p of SFP_POS) (byDoor[p.door] = byDoor[p.door] || []).push(p);
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
for (const d of SFP_DOORS) {
  const ps = byDoor[d.no] || [];
  P(`### 第${CN[d.no - 1]}${d.title}（${ps.length} 位）`);
  P();
  // 按锚点聚合
  const byAnchor = {};
  for (const p of ps) (byAnchor[p.anchor] = byAnchor[p.anchor] || []).push(p.name);
  P('| 世界锚点 | 所摄位次 |');
  P('|---|---|');
  for (const [a, names] of Object.entries(byAnchor)) {
    P(`| \`${a}\` | ${names.join('、')} |`);
  }
  P();
}

// ---- 尾注 ----
P('---');
P();
P(`统计：世界节点 ${NODES.length} · 经证引文 ${NODES.reduce((s, n) => s + (n.citations || []).length, 0)} 条 · 门 ${SFP_DOORS.length} · 位 ${SFP_POS.length} · 世界锚点 ${new Set(SFP_POS.map(p => p.anchor)).size} 处`);
P();
P('数据源文件：`src/data.js`（世界模型）· `src/sfp-data.js`（选佛谱谱位）。修改数据后重跑 `npm run gen:docs` 即可同步本表。');

writeFileSync(new URL('../docs/世界模型·经证总表.md', import.meta.url), lines.join('\n'), 'utf8');
console.log(`✓ docs/世界模型·经证总表.md 已生成（${lines.length} 行）`);
