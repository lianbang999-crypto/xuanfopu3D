// CBETA 逐字取经 · 补注取证工具
// ─────────────────────────────────────────────────────────────────────────────
// 用处：位注白话手译（src/sfp-pos-baihua.js）遇《選佛譜》说得简、须引他经说详者，
//   由此取逐字原文与 CBETA 行号，补注方可去掉 verify 上卡。不得凭记忆写经文。
//
// 取径（2026-08-08 实测）：DILA 的 cbetaonline.dila.edu.tw / cbdata.dila.edu.tw 本机不可达
//   （DNS 落在 198.18.0.0/15 假 IP 段，代理亦连不上）；CBETA 官方 XML-P5 仓库的
//   GitHub raw 可达，且那才是逐字底本（带 <lb/> 行号），故径取之。
//
// 注意：本机 curl/fetch 走系统代理（127.0.0.1:7897），沙箱内不通，
//   故本脚本须在沙箱外运行。缓存落 scripts/.cbeta-cache/，取过一次即不再联网。
//
// 用法：
//   node scripts/cbeta-fetch.mjs get T12n0365            # 取回并缓存
//   node scripts/cbeta-fetch.mjs find T12n0365 上品中生    # 逐字检索，出原文＋CBETA 行号
//   node scripts/cbeta-fetch.mjs quote T12n0365 上品中生 240  # 自命中处取 240 字，供补注引用
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cbeta-cache');
const RAW = 'https://raw.githubusercontent.com/cbeta-org/xml-p5/master';

// T12n0365 → T/T12/T12n0365.xml；X80n1567 → X/X80/X80n1567.xml
function pathOf(id) {
  const m = /^([A-Z]+)(\d+)n(\w+)$/.exec(id);
  if (!m) throw new Error(`经号格式不认得：${id}（应如 T12n0365）`);
  const [, coll, vol] = m;
  return `${coll}/${coll}${vol}/${id}.xml`;
}

export async function getXml(id) {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, `${id}.xml`);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const url = `${RAW}/${pathOf(id)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`取 ${id} 失败：HTTP ${r.status}　${url}`);
  const x = await r.text();
  writeFileSync(f, x);
  return x;
}

// 抽成「逐字正文 + 每字对应的 CBETA 行号」。行号取自 <lb n="0345c06"/>，
// 即页0345·栏c·行06，合经号即成 T12n0365_p0345c06 —— 与本项目既有引文体例同。
export function flatten(id, xml) {
  const body = xml.slice(xml.indexOf('<body>'), xml.lastIndexOf('</body>'));
  let text = '', refs = [], cur = '';
  const re = /<lb\b[^>]*n="([^"]+)"[^>]*\/>|<[^>]+>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) { cur = m[1]; continue; }          // 行号推进
    if (m[2] === undefined) continue;                           // 其余标签跳过
    // 注释号、校勘符、空白一律剔除，只留经文本字
    const seg = m[2].replace(/[\s　]+/g, '').replace(/[\[\]（）()０-９0-9]/g, '');
    for (const ch of seg) { text += ch; refs.push(cur); }
  }
  return { id, text, refs };
}

export function find(flat, needle, span = 200) {
  const i = flat.text.indexOf(needle);
  if (i < 0) return null;
  return {
    ref: `${flat.id}_p${flat.refs[i]}`,
    text: flat.text.slice(i, i + span),
    before: flat.text.slice(Math.max(0, i - 60), i),
  };
}

if (process.argv[1] && process.argv[1].endsWith('cbeta-fetch.mjs')) {
  const [, , cmd, id, arg, n] = process.argv;
  if (!cmd || !id) { console.log('用法见文件头'); process.exit(1); }
  const xml = await getXml(id);
  if (cmd === 'get') { console.log(`${id} 已缓存　${xml.length} 字节`); process.exit(0); }
  const flat = flatten(id, xml);
  if (cmd === 'find' || cmd === 'quote') {
    const hit = find(flat, arg, Number(n) || 200);
    if (!hit) { console.error(`未检得「${arg}」`); process.exit(1); }
    console.log(`出处：${hit.ref}`);
    console.log(`上文：…${hit.before}`);
    console.log(`原文：${hit.text}`);
  } else { console.error(`不认得的命令：${cmd}`); process.exit(1); }
}
