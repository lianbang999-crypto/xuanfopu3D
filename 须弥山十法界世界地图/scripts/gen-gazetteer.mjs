// 由 data/world.json 生成《世界志·经证辑要》——文档与数据严格同源，防止漂移
// 用法：node scripts/gen-gazetteer.mjs   （先跑 verify-claims.mjs 确认全绿再生成）
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const world = JSON.parse(await readFile(path.join(root, "data", "world.json"), "utf8"));

const groups = ["总纲", "器世间", "六凡", "四圣", "净土"];
const lines = [];
lines.push(`# 须弥山十法界 · 世界志（经证辑要）`);
lines.push(``);
lines.push(`> 本文档由 \`scripts/gen-gazetteer.mjs\` 从 \`data/world.json\` 自动生成，与地图呈现严格同源。`);
lines.push(`> 每条引文均经 \`scripts/verify-claims.mjs\` 逐字核证（引文为语料连续子串且行号一致方标「已核」）。`);
lines.push(`> 「今注」为白话导读，非经文；一切示意安排标【今设】。`);
lines.push(``);
lines.push(`版本：${world.meta.version}（${world.meta.date}）`);
lines.push(``);
lines.push(`## 立项铁律`);
lines.push(``);
for (const p of world.meta.principles) lines.push(`- ${p}`);
lines.push(``);
lines.push(`## 典籍底本`);
lines.push(``);
lines.push(`| 编号 | 典籍 | 出处 | 译撰者 |`);
lines.push(`|---|---|---|---|`);
for (const [id, s] of Object.entries(world.sources)) {
  lines.push(`| ${id} | 《${s.title}》 | ${s.canon} | ${s.translator} |`);
}
lines.push(``);

let claimCount = 0;
for (const g of groups) {
  const nodes = world.nodes.filter((n) => n.group === g);
  if (nodes.length === 0) continue;
  lines.push(`## ${g}（${nodes.length} 处）`);
  lines.push(``);
  for (const n of nodes) {
    lines.push(`### ${n.name}`);
    lines.push(``);
    lines.push(`- 界属：${n.realm}｜定位性质：${world.meta.locusTypes[n.locus.type]}`);
    if (n.locus.position && n.locus.position !== "—") lines.push(`- 方位：${n.locus.position}`);
    if (n.locus.extent && n.locus.extent !== "—") lines.push(`- 量度（经说）：${n.locus.extent}`);
    lines.push(`- 今注（非经文）：${n.summary}`);
    lines.push(``);
    for (const c of n.claims) {
      claimCount++;
      const src = world.sources[c.source];
      const mark = c.status === "verified" ? "已核·逐字" : "待核";
      lines.push(`> 「${c.text}」`);
      lines.push(`> —— 《${src.title}》${c.locator}（[${c.ref}](https://cbetaonline.dila.edu.tw/zh/${c.ref})）【${mark}】`);
      lines.push(``);
    }
  }
}
lines.push(`---`);
lines.push(``);
lines.push(`统计：节点 ${world.nodes.length} 处 · 经证引文 ${claimCount} 条 · 层域 ${world.layers.length} 层`);
lines.push(``);

await writeFile(path.join(root, "docs", "世界志·经证辑要.md"), lines.join("\n"), "utf8");
console.log(`已生成 docs/世界志·经证辑要.md：节点 ${world.nodes.length}，引文 ${claimCount}`);
