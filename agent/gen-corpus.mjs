#!/usr/bin/env node
// 譜內全文檢索數據生成器
//
// 由 全文/corpus.json（692 塊，人工分塊）生成 agent/worker/src/corpus.js。
//
// **不建倒排索引。** 全書切完僅 692 塊、四百餘 KB，Worker 內遍歷一遍是毫秒級；
// 倒排省下的那點時間，抵不過它自身的體積與維護成本（承注庫一改就得重建同步）。
// 佛樂問文庫 8999 塊故須向量庫，本譜少一個數量級——語料小到可以整個裝進去，
// 就不必為「像個檢索系統」而引入一整套概率機制。
//
// 用法：node agent/gen-corpus.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(join(HERE, '../全文/corpus.json'), 'utf8'));
const { ZH_S2T, ZH_T2S, ZH_COMBO_S2T, ZH_COMBO_T2S } = await import(new URL('../src/zh-conv.js', import.meta.url));
const hub = JSON.parse(readFileSync(join(HERE, 'index/hub.json'), 'utf8'));

// ── 塊：只留檢索與呈現所需 ──
// t 正文、i 題（義理提要，檢索之最要）、m 名相、k 型、j 卷、l 行、s 章節
const KIND = ['xu', 'biaofa', 'qa', 'mulu', 'gate', 'table', 'puyue', 'puyue-rule', 'end', 'shizhu'];
const BLOCKS = src.blocks.map((b) => ({
  id: b.id,
  j: b.juan, l: b.line, s: b.sec,
  k: KIND.indexOf(b.kind),
  i: b.title,
  m: b.terms || [],
  n: b.note || '',
  t: b.text,
}));

// ── 外典補充（2026-08-14 發起人定：蕅益大師論著入庫）──
// 塊由 agent/gen-aux-corpus.mjs 自 CBETA 底本切成（agent/index/aux-corpus.json）。
// 塊型 shizhu（大師他著），多 src（書名）與 cb（CBETA 經號行位）二欄——
// search.js 憑塊型降權（譜內人工塊恆先），toPassages 憑 src 落「大師他著」之標（紀律三）。
// 缺檔不阻斷：庫仍以譜內 692 塊自足。
for (const f of ['index/aux-corpus.json', 'index/aux-zonglun.json']) {
  try {
    const aux = JSON.parse(readFileSync(join(HERE, f), 'utf8'));
    for (const b of aux.blocks) {
      BLOCKS.push({ id: b.id, j: 0, l: 0, s: b.src, k: KIND.indexOf('shizhu'), i: b.i, m: [], n: '', t: b.t, src: b.src, cb: b.cb });
    }
    console.log(`  外典補充　${f}：${aux.blocks.length} 塊（${[...new Set(aux.blocks.map((b) => b.src))].join('・')}）`);
  } catch { console.log(`  外典補充　${f} 缺——庫以現有塊自足`); }
}

// ── 實體表：位名・門名・詞條・別名 → 可精確命中之鍵 ──
// 「能查表的絕不檢索，能精確匹配的絕不用向量」——設計書語。
const ENTITY = {};
const put = (k, v) => { if (k && k.length >= 2) (ENTITY[k] ||= []).push(v); };
Object.values(hub.positions).forEach((p) => put(p.name, { t: 'pos', v: p.name }));
Object.values(hub.gates).forEach((g) => put(g.title, { t: 'gate', v: g.no }));
for (const term of Object.keys(hub.gloss || {})) put(term, { t: 'term', v: term });
try {
  const alias = JSON.parse(readFileSync(join(HERE, '../xuanfopu-h5/data/aliases.json'), 'utf8')).aliases;
  for (const [a, v] of Object.entries(alias)) {
    const p = hub.positions[v.id];
    if (p) put(a, { t: 'pos', v: p.name });
  }
} catch { /* 別名表缺失不阻斷 */ }
// 塊自帶之名相亦入實體表——「見惑」「無生懺」「橫超」之屬，正在此
BLOCKS.forEach((b, idx) => b.m.forEach((t) => put(t, { t: 'blk', v: idx })));

// ── 簡→繁：用戶打簡體、語料存底本形（繁），不歸一則「见惑」永遠匹配不上「見惑」。
// 只留**書中實際出現之字**，故表極小（全表數千項，此處僅數百）。
const inBook = new Set([...BLOCKS.map((b) => b.t + b.i + b.m.join('') + b.n).join('')]);
const S2T = {};
for (const [s2, t2] of Object.entries(ZH_S2T)) {
  if (s2.length === 1 && t2.length === 1 && inBook.has(t2) && s2 !== t2) S2T[s2] = t2;
  else if (s2.length > 1 && [...t2].every((c) => inBook.has(c)) && s2 !== t2) S2T[s2] = t2;
}

// ── 名相反查表（2026-08-04 補）──
// 【何以必補】通用簡繁表不收「舍→捨」——「舍」簡繁同形，是「捨」被併入其中，
// 一對多故通用表避之。於是玩家打「八背舍」，歸一後仍是「八背舍」，
// 與書中「八背捨」對不上：實測評分 9.6，而打繁體「八背捨」得 60.6，相差六倍。
// 分數卡在生成閾值（20／24）之下，遂被判「此事《選佛譜》未載」——**譜裡明明有**。
// 「十一切處」「捨念清淨」「慈悲喜捨」諸名相同罹此病。
//
// 【解法零歧義】不去補通用單字表（那才會引出歧義），而是拿**書中實有之名相**
// 逐條轉簡，反建「簡→繁」。鍵皆書中真有之詞，長度≥2，故不生歧義：
// 「八背捨」→「八背舍」入表，而「舍利」「精舍」之「舍」不受影響。
{
  const ML_T = Math.max(1, ...Object.keys(ZH_T2S).map((k) => k.length));
  const toSimp = (s) => {
    let r = '', i = 0;
    while (i < s.length) {
      let hit = 0;
      for (let L = Math.min(ML_T, s.length - i); L >= 1; L--) {
        const g = s.substr(i, L);
        if (ZH_T2S[g] !== undefined) { r += ZH_T2S[g]; i += L; hit = 1; break; }
      }
      if (!hit) { r += s[i]; i++; }
    }
    return r;
  };
  const names = new Set();
  BLOCKS.forEach((b) => { (b.m || []).forEach((t) => names.add(t)); if (b.s) names.add(b.s); if (b.i) names.add(b.i); });
  Object.keys(ENTITY).forEach((e) => names.add(e));
  let added = 0;
  for (const t of names) {
    if (!t || t.length < 2) continue;
    const s = toSimp(t);
    if (s !== t && S2T[s] === undefined) { S2T[s] = t; added++; }
  }
  console.log(`  名相反查　書中 ${names.size} 條，補簡→繁 ${added} 條（八背舍→${S2T['八背舍'] || '（未補）'}）`);
}

const out = `// 選佛譜 · 譜內全文（Worker 內建）
// 由 agent/gen-corpus.mjs 從 全文/corpus.json 生成，勿手改。
//
// 全書六卷 76308 字，人工分塊 ${BLOCKS.length} 塊，覆蓋率 100%（見 全文/README.md）。
// **不建倒排索引**：塊數少，Worker 內遍歷一遍即可，詳見生成器頭注。
//
// BLOCKS[i] = { id, j 卷, l 行, s 章節, k 型索引, i 義理提要, m 名相, n 按語, t 逐字原文 }
// KIND[k]   塊型：${KIND.join('・')}
// ENTITY[名] = [{ t: 'pos'|'gate'|'term'|'blk', v }]　精確命中之表

export const KIND = ${JSON.stringify(KIND)};

export const BLOCKS = ${JSON.stringify(BLOCKS)};

export const ENTITY = ${JSON.stringify(ENTITY)};

// 簡→繁（只含書中出現之字詞）：用戶打簡體，語料存底本形，檢索前須歸一
export const S2T = ${JSON.stringify(S2T)};

// 輪相六字（那謨阿彌陀佛）之簡繁微表 —— 派生自 src/zh-conv.js 的 ZH_COMBO_*，勿手改。
// intent.js／canon-route.js 從此處取，不再各自硬編碼（2026-08-12 微表歸一，護欄 npm run check:zh）。
export const COMBO_S2T = ${JSON.stringify(ZH_COMBO_S2T)};
export const COMBO_T2S = ${JSON.stringify(ZH_COMBO_T2S)};

export const CORPUS_META = ${JSON.stringify({
  builtAt: new Date().toISOString().slice(0, 10),
  blocks: BLOCKS.length,
  chars: BLOCKS.reduce((a, b) => a + b.t.length, 0),
  entities: Object.keys(ENTITY).length,
  source: 'CBETA 補編 No.136《選佛譜》六卷全文人工分塊；外典補充（大師他著）由 gen-aux-corpus.mjs 機切',
})};
`;

const file = join(HERE, 'worker/src/corpus.js');
writeFileSync(file, out);
console.log(`已生成 ${file}`);
console.log(`  塊 ${BLOCKS.length}　正文 ${BLOCKS.reduce((a, b) => a + b.t.length, 0)} 字　實體 ${Object.keys(ENTITY).length}　簡繁 ${Object.keys(S2T).length}`);
console.log(`  體積 ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
const byKind = {};
BLOCKS.forEach((b) => { byKind[KIND[b.k]] = (byKind[KIND[b.k]] || 0) + 1; });
console.log('  ' + Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join('　'));
