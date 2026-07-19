// 全谱核对：现行 sfp-data.js ↔ G版 xuanfopu-h5 已人工核对数据（positions.json + aliases.json）
// h5 每位带原文行号（繁体版/B0136_00X.txt），差异处自动摘出原文行供逐字裁定。
// 用法：node scripts/crosscheck-pu.mjs [--ctx]   （--ctx 打印差异位的原文上下文）

import { readFileSync } from 'node:fs';
import { SFP_POS, SFP_DOORS } from '../src/sfp-data.js';

const G = '/Users/bincai/Downloads/选佛谱G版';
const h5 = JSON.parse(readFileSync(`${G}/xuanfopu-h5/data/positions.json`, 'utf8'));
const aliases = JSON.parse(readFileSync(`${G}/xuanfopu-h5/data/aliases.json`, 'utf8')).aliases;
const showCtx = process.argv.includes('--ctx');

// ---- 索引 ----
const h5ById = {}; const h5ByName = {};
for (const p of h5.positions) { h5ById[p.id] = p; (h5ByName[`${p.gate}|${p.name}`] = p); }
const gameByName = {};
const gameNameOfId = {};
for (const p of SFP_POS) { gameByName[`${p.door}|${p.name}`] = p; gameNameOfId[p.id] = p.name; }

// h5 目的地字串 → 规范名（先走别名表，再落 h5 位名）
function h5DestName(s) {
  const a = aliases[s];
  if (a) {
    if (a.canonical) return a.canonical;
    if (a.id && h5ById[a.id]) return h5ById[a.id].name;
  }
  if (s === '內院') { const a2 = aliases['內院']; if (a2 && h5ById[a2.id]) return h5ById[a2.id].name; }
  return s;
}

// 原文行摘取（差异裁定用）
const srcCache = {};
function srcLines(file, line, n = 2) {
  if (!srcCache[file]) srcCache[file] = readFileSync(`${G}/繁体版/${file}`, 'utf8').split('\n');
  const L = srcCache[file];
  const out = [];
  for (let i = Math.max(0, line - 1 - 1); i < Math.min(L.length, line - 1 + n); i++) out.push(`    ${file}:${i + 1}| ${L[i].slice(0, 160)}`);
  return out.join('\n');
}

let diffs = 0, checked = 0, noteDiffs = 0;
const report = [];

// ---- 门题对照 ----
for (const d of SFP_DOORS) {
  const gd = h5.gates.find(g => g.gate === d.no);
  if (!gd) { report.push(`✗ 门${d.no}：h5 无此门`); diffs++; continue; }
  const gdName = gd.name.replace(/^第?[一二三四五六七八九十]+/, '');
  if (!gd.name.includes(d.title)) {
    report.push(`✗ 门${d.no} 门题不符：游戏「${d.title}」 vs 原文「${gd.name}」`);
    diffs++;
  }
}

// ---- 逐位对照 ----
for (const hp of h5.positions) {
  const gp = gameByName[`${hp.gate}|${hp.name}`];
  if (!gp) { report.push(`✗ 缺位：门${hp.gate}「${hp.name}」（h5 ${hp.id}）游戏数据中无`); diffs++; continue; }
  checked++;
  // 起手因地
  if (hp.gate === 1) {
    if ((gp.start || '') !== (hp.combo || '')) {
      report.push(`✗ 起手组合：门1「${hp.name}」游戏=${gp.start || '无'} vs h5=${hp.combo || '无'}`);
      diffs++;
    }
  }
  // 去向表
  const gMap = {};
  for (const mv of gp.moves || []) for (const c of mv.c || []) {
    gMap[c] = { to: mv.to || null, bonus: mv.bonus || 0, act: mv.act || null };
  }
  const hMap = {};
  for (const [c, v] of Object.entries(hp.table || {})) {
    hMap[c] = { to: v.to ? h5DestName(v.to) : null, bonus: v.grant || 0, act: v.act || null };
  }
  const combos = new Set([...Object.keys(gMap), ...Object.keys(hMap)]);
  const posDiffs = [];
  for (const c of combos) {
    const g = gMap[c], h = hMap[c];
    if (!g && h) { posDiffs.push(`  组合「${c}」：游戏【不行】 vs h5【${h.to || ''}${h.bonus ? ` 贈${h.bonus}掷` : ''}${h.act ? ` 依${h.act}行` : ''}】`); continue; }
    if (g && !h) { posDiffs.push(`  组合「${c}」：游戏【${g.to || ''}${g.bonus ? ` 贈${g.bonus}掷` : ''}${g.act ? ` 依${g.act}行` : ''}】 vs h5【不行】`); continue; }
    if (!g && !h) continue;
    const gTo = g.to ? (gameNameOfId[g.to] || g.to) : '', hTo = h.to || '';
    // 目的地按显示名比（游戏 to 是位 id，先换算显示名；h5 已换算规范名）
    if (gTo !== hTo || g.bonus !== h.bonus || (g.act || '') !== (h.act || '')) {
      posDiffs.push(`  组合「${c}」：游戏【→${gTo || '（原地）'}${g.bonus ? ` 贈${g.bonus}` : ''}${g.act ? ` 依${g.act}` : ''}】 vs h5【→${hTo || '（原地）'}${h.bonus ? ` 贈${h.bonus}` : ''}${h.act ? ` 依${h.act}` : ''}】`);
    }
  }
  if (posDiffs.length) {
    diffs += posDiffs.length;
    report.push(`✗ 门${hp.gate}「${hp.name}」（原文 ${hp.source.file}:${hp.source.line}）`);
    report.push(...posDiffs);
    if (showCtx) report.push(srcLines(hp.source.file, hp.source.line, 3));
  }
  // 谱曰全文比对（净空白、剥「譜曰。」前缀；h5 为人工核对底本）
  const norm = (s) => (s || '').replace(/\s+/g, '').replace(/^譜曰。?/, '').replace(/\[[A-Z]\d+\]/g, '');
  if (hp.puyue && gp.note && norm(hp.puyue) !== norm(gp.note)) {
    noteDiffs++;
    const a = norm(hp.puyue), b = norm(gp.note);
    let k = 0; while (k < Math.min(a.length, b.length) && a[k] === b[k]) k++;
    report.push(`△ 谱曰不同 门${hp.gate}「${hp.name}」首异于第${k}字：h5「…${a.slice(Math.max(0, k - 8), k + 16)}…」 vs 游戏「…${b.slice(Math.max(0, k - 8), k + 16)}…」`);
  }
}

// 反向：游戏有而 h5 无（除程序终局位）
for (const gp of SFP_POS) {
  if (!h5ByName[`${gp.door}|${gp.name}`]) {
    report.push(`△ 游戏独有位：门${gp.door}「${gp.name}」${gp.terminal ? '（程序终局位，h5 亦有 g15-01 对齐名）' : ''}`);
  }
}

console.log(report.join('\n'));
console.log(`\n===== 汇总 =====`);
console.log(`同名对上 ${checked}/220 位 · 去向/起手/门题差异 ${diffs} 处 · 谱曰开头不一致 ${noteDiffs} 位`);
process.exit(diffs ? 1 : 0);
