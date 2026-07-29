// CBETA XML P5 → 带页行号纯文本转换器
// 原则（铁律）：正文取底本（校勘舍 rdg 取 lem 所在正文流），脚注 note 一律剔除，缺字以〔id〕占位。
// 输出格式与 cbeta/text/ 既有语料一致：每行 `[T0001_p0114a07] 正文…`
// 用法：node scripts/xml2text.mjs cbeta/xml/T01n0001.xml T0001
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , xmlPath, sourceId] = process.argv;
if (!xmlPath || !sourceId) {
  console.error("用法：node scripts/xml2text.mjs <xml路径> <典籍ID，如 T0001>");
  process.exit(1);
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] || `&${entity};`;
  });
}

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1] || "";

const xml = await readFile(xmlPath, "utf8");
const body = xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
if (!body) throw new Error(`${sourceId} 找不到 TEI body`);

const prepared = body
  .replace(/<!--([\s\S]*?)-->/g, "")
  .replace(/<note\b[^>]*>[\s\S]*?<\/note>/gi, "")
  .replace(/<rdg\b[^>]*>[\s\S]*?<\/rdg>/gi, "")
  .replace(/<g\b[^>]*ref=["']#([^"']+)["'][^>]*\/>/gi, "〔$1〕")
  .replace(/<(?:space|caesura)\b[^>]*\/>/gi, " ");

const lines = [];
let anchor = "0000a00";
let text = "";
const flush = () => {
  const normalized = decodeEntities(text).replace(/[\t\r\n ]+/g, "").trim();
  if (normalized) lines.push({ anchor, text: normalized });
  text = "";
};
for (const token of prepared.matchAll(/<lb\b[^>]*\/?\s*>|<[^>]+>|[^<]+/gi)) {
  const value = token[0];
  if (/^<lb\b/i.test(value)) {
    flush();
    anchor = attribute(value, "n") || anchor;
  } else if (!value.startsWith("<")) {
    text += value;
  } else if (/^<\/(?:p|head|item|l|lg|div)>/i.test(value)) {
    text += "　";
  }
}
flush();

const out = lines.map((l) => `[${sourceId}_p${l.anchor}] ${l.text}`).join("\n");
const outPath = path.join(path.dirname(xmlPath), "..", "text", `${sourceId}.txt`);
await writeFile(outPath, `${out}\n`, "utf8");
console.log(`${sourceId}：${lines.length} 行 → ${outPath}`);
