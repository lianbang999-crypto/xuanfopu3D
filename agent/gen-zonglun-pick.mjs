#!/usr/bin/env node
// 宗論向量選料器（2026-08-14 發起人授鑰）
//
// 《靈峰宗論》J36nB348 逾百萬字，設計書判「全系統唯一真需向量檢索者」。但 Worker 裝不下
// 整部（塊＋向量皆超體積），為它另起向量服務又违「小語料強結構」之判。故取中道：
// **向量只用在建庫期**——全書機切逐塊嵌入（bge-m3），與二十六條譜內修行主題相似度配對，
// 每題取其最貼切之塊，去重合為六十四塊以內入 shizhu 語料。運行期仍是零向量零新依賴：
// 主題詞寫進塊提要（i），檢索層的 title 權重自然接得住玩家的白話問法。
//
// 主題出自譜之十五門修行骨架（懺・戒・禪・發心・淨土・十善十惡諸行），非憑空擬定。
//
// 密鑰只從環境變量 SILICONFLOW_API_KEY 讀，不落盤、不入倉（與 ask-eval 同規）。
// 用法：SILICONFLOW_API_KEY=… node agent/gen-zonglun-pick.mjs
//   → agent/index/aux-zonglun.json，再跑 gen-corpus.mjs 併入 corpus.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getXml, flatten } from '../scripts/cbeta-fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.SILICONFLOW_API_KEY || '';
if (!KEY) { console.error('须以环境变量 SILICONFLOW_API_KEY 供鑰（不落盘不入仓）'); process.exit(1); }

const API = 'https://api.siliconflow.cn/v1/embeddings';
const MODEL = 'BAAI/bge-m3';
const PICK_TOTAL = 64;      // 入庫上限：宗論是補充不是主體，庫仍以譜內自足
const PER_THEME = 3;        // 每題先取三，全局去重後按分裁至上限

// 譜內修行主題（門六懺・門七戒・門八禪・門九發心・門十四淨土・十善十惡諸行）。
// 一律繁體正字：主題詞要寫進塊提要（i）供運行期檢索，而語料底本形是繁——
// 首評實測簡體提要「忏悔灭罪」永難被歸一後的問句（懺悔）命中，故此表不得存簡。
const THEMES = [
  '十善生天之行', '五戒得人身', '十惡墮三塗之報', '懺悔滅罪之法', '念佛往生淨土',
  '信願行三資糧', '持戒功德', '禪定修法', '退轉之病與對治', '疑悔之障',
  '發菩提心', '布施功德', '精進不放逸', '般若觀空', '輪迴生死之苦',
  '橫超與豎出', '六度萬行', '淨土疑問決擇', '觀心法門', '名利心之害',
  '瞋恚對治', '貪欲對治', '妄語惡口之過', '善知識之要', '臨終正念', '真實用功之法',
];

async function embed(inputs, tag) {
  for (let tryN = 0; tryN < 3; tryN++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, input: inputs }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
      const j = await r.json();
      return j.data.map((d) => d.embedding);
    } catch (e) {
      if (tryN === 2) throw new Error(`${tag} 嵌入失败：${e.message}`);
      await new Promise((res) => setTimeout(res, 1200 * (tryN + 1)));
    }
  }
}
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return s / Math.sqrt(na * nb); };

// 機切：句斷聚塊 ~420 字（與 gen-aux-corpus 同法，稍長——宗論書札體，語段成篇）
function chunk(flat) {
  const out = [];
  let buf = '', startRef = '';
  for (let i = 0; i < flat.text.length; i++) {
    if (!buf) startRef = flat.refs[i] || '';
    const ch = flat.text[i];
    buf += ch;
    if (buf.length >= 420 && '。？！'.includes(ch)) { out.push({ t: buf, ref: startRef }); buf = ''; }
  }
  if (buf.trim().length >= 80) out.push({ t: buf, ref: startRef });
  return out;
}

console.log('取《靈峰宗論》底本…');
const flat = flatten('J36nB348', await getXml('J36nB348'));
const blocks = chunk(flat);
console.log(`  正文 ${flat.text.length} 字 → 機切 ${blocks.length} 塊，逐塊嵌入（${MODEL}）…`);

const vecs = [];
const B = 32;
for (let i = 0; i < blocks.length; i += B) {
  vecs.push(...await embed(blocks.slice(i, i + B).map((b) => b.t), `塊 ${i}-${i + B}`));
  if ((i / B) % 10 === 0) console.log(`  …已嵌 ${Math.min(i + B, blocks.length)}/${blocks.length}`);
}
console.log('  主題嵌入…');
const tvecs = await embed(THEMES, '主題');

// 每題取其最貼者，全局去重、按分裁員
const cand = new Map();   // blockIdx -> { score, theme }
THEMES.forEach((theme, ti) => {
  const scored = vecs.map((v, bi) => ({ bi, s: cos(tvecs[ti], v) }))
    .sort((a, b) => b.s - a.s).slice(0, PER_THEME);
  for (const { bi, s } of scored) {
    const old = cand.get(bi);
    if (!old || s > old.score) cand.set(bi, { score: s, theme });
  }
});
const picked = [...cand.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, PICK_TOTAL)
  .sort((a, b) => a[0] - b[0]);   // 出檔按原書序，讀著不跳

const out = picked.map(([bi, { theme, score }], n) => ({
  id: `J36nB348-v${String(n + 1).padStart(3, '0')}`,
  src: '靈峰宗論',
  cb: `J36nB348_p${blocks[bi].ref}`,
  i: `${theme} · ${blocks[bi].t.slice(0, 10)}`,   // 主題詞入提要——運行期白話問法靠它命中
  t: blocks[bi].t,
  _s: Math.round(score * 1000) / 1000,            // 留檔備審，gen-corpus 不讀
}));

mkdirSync(join(HERE, 'index'), { recursive: true });
const file = join(HERE, 'index/aux-zonglun.json');
writeFileSync(file, JSON.stringify({
  builtAt: new Date().toISOString().slice(0, 10),
  note: `宗論向量選料：${blocks.length} 塊全嵌，${THEMES.length} 題各配其最貼者，去重取 ${out.length} 塊入庫（bge-m3，建庫期一次性）`,
  blocks: out,
}, null, 1));
console.log(`已生成 ${file}　選 ${out.length} 塊 · ${out.reduce((a, b) => a + b.t.length, 0)} 字（全書 ${blocks.length} 塊中）`);
