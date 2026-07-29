// 经证逐字核证器（铁律执行器）
// 规则：
//   1. 每条 claim.text 必须是 cbeta/text/{source}.txt 语料正文的逐字连续子串（跨行拼接后匹配）
//   2. claim.ref 必须等于引文起始字符所在行的页行号锚点（SOURCE_pXXXXxNN）
//   3. status=verified 的条目任一规则不过即整体失败（exit 1）
// 用法：node scripts/verify-claims.mjs [--fix]   --fix 将 ref 自动改正为实测锚点后回写
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fix = process.argv.includes("--fix");
const world = JSON.parse(await readFile(path.join(root, "data", "world.json"), "utf8"));

// 读语料：拼接全文并建立 字符偏移→行锚点 映射
const corpusCache = new Map();
async function loadCorpus(sourceId) {
  if (corpusCache.has(sourceId)) return corpusCache.get(sourceId);
  const raw = await readFile(path.join(root, "cbeta", "text", `${sourceId}.txt`), "utf8");
  const anchors = []; // 每行 { anchor, start } —— start 为该行正文在拼接串中的起始偏移
  let joined = "";
  for (const line of raw.split("\n")) {
    const m = line.match(/^\[([A-Z]+\d+_p[0-9a-z]+)\]\s?(.*)$/);
    if (!m) continue;
    anchors.push({ anchor: m[1], start: joined.length });
    joined += m[2];
  }
  const corpus = { joined, anchors };
  corpusCache.set(sourceId, corpus);
  return corpus;
}

function anchorAt(corpus, offset) {
  let lo = 0, hi = corpus.anchors.length - 1, ans = corpus.anchors[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (corpus.anchors[mid].start <= offset) { ans = corpus.anchors[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans.anchor;
}

function allOccurrences(haystack, needle) {
  const out = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) { out.push(i); i = haystack.indexOf(needle, i + 1); }
  return out;
}

let failures = 0, warnings = 0, checked = 0, fixed = 0;

// 结构完整性
const layerIds = new Set(world.layers.map((l) => l.id));
const locusTypes = new Set(Object.keys(world.meta.locusTypes));
for (const node of world.nodes) {
  if (node.layer !== null && !layerIds.has(node.layer)) {
    console.error(`✗ [结构] 节点 ${node.id} 引用不存在的层 ${node.layer}`); failures++;
  }
  if (!locusTypes.has(node.locus.type)) {
    console.error(`✗ [结构] 节点 ${node.id} 使用未定义的 locus 类型 ${node.locus.type}`); failures++;
  }
  for (const claim of node.claims) {
    if (!world.sources[claim.source]) {
      console.error(`✗ [结构] 节点 ${node.id} 引用未登记典籍 ${claim.source}`); failures++;
    }
  }
}

// 引文逐字核证
for (const node of world.nodes) {
  for (const claim of node.claims) {
    checked++;
    const tag = `${node.id} ← ${claim.source}「${claim.text.slice(0, 14)}…」`;
    let corpus;
    try { corpus = await loadCorpus(claim.source); }
    catch { console.error(`✗ [语料缺失] ${tag}`); failures++; continue; }

    const hits = allOccurrences(corpus.joined, claim.text);
    if (hits.length === 0) {
      console.error(`✗ [引文不符] ${tag} —— 语料中找不到该逐字连续子串`);
      failures++; continue;
    }
    const hitAnchors = hits.map((off) => `${anchorAt(corpus, off)}`);
    if (hitAnchors.includes(claim.ref)) {
      if (hits.length > 1) { console.warn(`△ [多处命中] ${tag} 共 ${hits.length} 处，ref 命中其一`); warnings++; }
    } else {
      if (fix) {
        claim.ref = hitAnchors[0];
        fixed++;
        console.warn(`✎ [已改正] ${tag} ref → ${hitAnchors[0]}`);
      } else {
        console.error(`✗ [行号不符] ${tag} 存 ${claim.ref}，实测 ${hitAnchors.join(" / ")}`);
        failures++;
      }
    }
  }
}

if (fix && fixed > 0) {
  await writeFile(path.join(root, "data", "world.json"), JSON.stringify(world, null, 2) + "\n", "utf8");
  console.log(`已回写 ${fixed} 处 ref 改正`);
}

console.log(`\n核证完毕：引文 ${checked} 条，失败 ${failures}，多处命中提示 ${warnings}${fix ? `，改正 ${fixed}` : ""}`);
if (failures > 0) process.exit(1);
