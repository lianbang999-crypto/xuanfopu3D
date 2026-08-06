#!/usr/bin/env node
// 位樞紐知識圖構建器（M2）
//
// 把五層資產按「位」串成一張圖——這是新智能體的地基。
//   L0 承注層   承注/expanded.json          4620 格 {verdict, 答, 引}
//   L1 位門層   xuanfopu-h5/data/positions.json  220 位譜曰全文＋判定表
//               承注/rules/g*.json          15 門門旨
//               十法界/src/sfp-pos-plain.js  220 位白話
//   L2 法界層   十法界/src/data.js           55 節點 102 引文 ＋ 入界錨點
//   L3 詞典層   十法界/src/sfp-gloss.js      名相詞典
//   六字表法    卷一〈輪相表法第一〉L29／L31
//
// 圖比原資料多出來的能力：
//   ① inbound 反向索引——「我能從哪裡來」（原資料只有去向，沒有來路）
//   ② anchor 雙向——位↔法界節點互查
//   ③ 位×相一跳可達：承注、譜曰、白話、所屬門旨、所錨法界、上下位
//
// 用法：node agent/build-hub.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHI = ROOT;   // 十法界須彌山世界工程根（正本，2026-08-04 起 agent 隨倉自足，語料工程皆在倉內）

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const FACES = ['那', '謨', '阿', '彌', '陀', '佛'];
const COMBOS21 = [];
for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) COMBOS21.push(FACES[i] + FACES[j]);
const JUAN_OF = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 5, 10: 5, 11: 5, 12: 6, 13: 6, 14: 6, 15: 6 };

// ── 六字表法：卷一〈輪相表法第一〉逐字定詮 ──────────────────────
const FACE_TABLE = {
  那: { 善惡: '惡', 表: '屬見煩惱', 別名: ['分別惑', '見惑', '見所斷惑'], 註: '邪見分別所起惑故／見真諦道時。此惑頓斷故。', line: 29 },
  謨: { 善惡: '惡', 表: '屬愛煩惱', 別名: ['俱生惑', '思惑', '修所斷惑'], 註: '不由分別。任運起故／微細難斷。須見道後修無漏道。乃漸斷故。', line: 29 },
  阿: { 善惡: '善', 表: '施善', 門: '生滅門', 漏: '有漏善', line: 31 },
  彌: { 善惡: '善', 表: '戒善', 門: '無生滅門', 漏: '有漏善', line: 31 },
  陀: { 善惡: '善', 表: '定善', 門: '次第門', 漏: '有漏善', line: 31 },
  佛: { 善惡: '善', 表: '善慧', 門: '圓頓門', 漏: '無漏善', line: 31 },
};
const FACE_THESIS = {
  總: '那謨表惡　阿彌陀佛表善',
  輪相: '輪如占察輪相。而作六面。以那謨阿彌陀佛六字。順次右旋。刻於六面。置輪掌心。仰手旁擲。表從凡入聖轉惡成善。十法界無不會歸究竟也。',
  何以用六字: '幺二三四五六。不過世間數目。是無記法。不能生善滅惡。那謨阿彌陀佛六字。乃是萬德洪名。一聞佛名。皆得不退轉於無上正等正覺。',
  何以那謨表惡: '若但有善無惡。則應有升無降。若須並表善惡。儻不借用那謨二字表惡。豈可反用阿彌陀佛表惡耶。',
  ref: '《選佛譜》卷第一・輪相表法第一・L25–L35',
};

async function main() {
  // ── 讀取 ────────────────────────────────────────────────
  const EXP = load(join(ROOT, '承注/expanded.json')).gates;
  const POS = load(join(ROOT, 'xuanfopu-h5/data/positions.json')).positions;
  const shi = await import(join(SHI, 'src/sfp-data.js'));
  const world = await import(join(SHI, 'src/data.js'));
  const plainMod = await import(join(SHI, 'src/sfp-pos-plain.js'));
  const whyPlainMod = await import(join(SHI, 'src/sfp-why-plain.js'));   // 逐句白話對讀庫（鍵＝譜曰原文句）
  const glyphMod = await import(join(SHI, 'src/sfp-glyph-why.js'));      // 字義解（鍵＝位|相）
  // 舊庫（未審）＋承注庫補譯（118 條，見 sfp-why-plain-cz.js）
  const czPlainMod = await import(join(SHI, 'src/sfp-why-plain-cz.js')).catch(() => ({}));
  const WHY_PLAIN = { ...(whyPlainMod.SFP_WHY_PLAIN || {}), ...(czPlainMod.SFP_WHY_PLAIN_CZ || {}) };
  // 白話歸一化查表：底本層差異（空白／校勘標記／括注／異體字囘迴）不應令白話失聯——
  // 前端 sfp-evidence.js 之 normalizePlainKey 即此意，構建器須同。
  const nkey = (t) => String(t || '').replace(/\s+/gu, '').replace(/\[[^\]]*\]/g, '')
    .replace(/[()（）]/g, '').replaceAll('囘', '迴');
  const PLAIN_BY_KEY = new Map();
  for (const [src, txt] of Object.entries(WHY_PLAIN)) {
    const k = nkey(src);
    if (k && !PLAIN_BY_KEY.has(k)) PLAIN_BY_KEY.set(k, txt);
  }
  // ── 判詞白話層（2026-08-04 發起人：「輪相說明要讓用戶看得懂，說清行/不行的原因」）──
  // 對讀庫（sfp-why-plain*）是逐句忠實翻譯，譜文頁對讀所用；判詞卡要的是一眼看懂的因果。
  // 兩種文體不可共用一份文本，故另立此層：鍵＝答語原文（一字不動），值＝判詞形態白話
  // （開篇即因果・≤120字・生僻名相隨手一釋・無注疏腔）。有此值者優先取之，
  // 經 hub → sfp-chengzhu（判詞卡）與 canon.js（智能體）同源生效；對讀庫不動、對讀不受影響。
  // 載入即機校：空值、過長、注疏腔禁語——壞值當場報錯，不容帶病入庫。
  let PANCI = {};
  try { PANCI = load(join(ROOT, '承注/判词白话.json')); } catch { /* 尚未建層時照舊走對讀庫 */ }
  {
    const BAN = ['見門總說', '见门总说', '詳見', '详见', '參見', '参见', '一往是大略之辭', '可例知', '餘如前說', '如前可解', '大略之辭', '大略之辞'];
    const bad = [];
    for (const [k, v] of Object.entries(PANCI)) {
      if (typeof v !== 'string' || !v.trim()) { bad.push(`空值：${k.slice(0, 24)}…`); continue; }
      if (v.length > 120) bad.push(`過長 ${v.length} 字：${k.slice(0, 24)}…`);
      for (const b of BAN) if (v.includes(b)) bad.push(`禁語「${b}」：${k.slice(0, 24)}…`);
    }
    if (bad.length) throw new Error(`判詞白話機校不過 ${bad.length} 條：\n` + bad.slice(0, 20).join('\n'));
    if (Object.keys(PANCI).length) console.log(`　判詞白話層 ${Object.keys(PANCI).length} 條（機校過）`);
  }
  const PANCI_BY_KEY = new Map();
  for (const [src, txt] of Object.entries(PANCI)) { const k = nkey(src); if (k && !PANCI_BY_KEY.has(k)) PANCI_BY_KEY.set(k, txt); }
  const plainOf = (ans) => PANCI[ans] || PANCI_BY_KEY.get(nkey(ans)) || WHY_PLAIN[ans] || PLAIN_BY_KEY.get(nkey(ans)) || null;
  const GLYPH = glyphMod.SFP_GLYPH_WHY || {};
  const glossMod = await import(join(SHI, 'src/sfp-gloss.js'));
  const POS_PLAIN = plainMod.SFP_POS_PLAIN || plainMod.default || {};
  const GLOSS = glossMod.SFP_GLOSS || glossMod.default || [];

  // 兩邊位名逐位對齊（構建前先驗；不合即中止，不容默默錯位）
  const byGateG = {}, byGateS = {};
  POS.forEach((p) => (byGateG[p.gate] ||= []).push(p));
  shi.SFP_POS.forEach((p) => (byGateS[p.door] ||= []).push(p));
  const anchorOf = new Map();
  for (let g = 1; g <= 15; g++) {
    const a = byGateG[g] || [], b = byGateS[g] || [];
    if (a.length !== b.length) throw new Error(`門${g} 位數不等：${a.length} / ${b.length}`);
    a.forEach((p, i) => {
      if (p.name !== b[i].name) throw new Error(`門${g} 第${i + 1}位名不合：${p.name} ≠ ${b[i].name}`);
      anchorOf.set(p.id, b[i].anchor);
    });
  }

  // ── 門 ──────────────────────────────────────────────────
  const gates = {};
  for (let g = 1; g <= 15; g++) {
    let R = null;
    try { R = load(join(ROOT, `承注/rules/g${String(g).padStart(2, '0')}.json`)); } catch { }
    const ps = byGateG[g].map((p) => p.id);
    gates[g] = {
      no: g,
      title: R?.meta?.gateName || '',
      juan: JUAN_OF[g],
      positions: ps,
      thesis: R?.gateThesis || null,
      note: R?.meta?.note || '',
      order: R?.order21 ? '二十一序' : '十五序',
      orderEvidence: R?.order21Evidence || R?.order15Evidence || [],
    };
  }

  // ── 位 ──────────────────────────────────────────────────
  const positions = {};
  const inbound = {};          // 反向索引：目的位 → [{from, combo}]
  const aliasToId = new Map(POS.map((p) => [p.name, p.id]));
  const ALIAS = load(join(ROOT, 'xuanfopu-h5/data/aliases.json')).aliases;
  const resolve = (name) => (ALIAS[name]?.id) || aliasToId.get(name) || null;

  for (const p of POS) {
    const cells = {};
    const gcells = EXP[String(p.gate)]?.[p.id] || {};
    for (const c of COMBOS21) {
      const rec = gcells[c];
      const e = p.table?.[c] || null;
      const toId = e?.to ? resolve(e.to) : null;
      cells[c] = {
        verdict: rec?.verdict || (e ? '行' : '不行'),
        答: rec?.答 || null,
        白話: plainOf(rec?.答),                     // 舊庫逐句白話對讀（歸一化查表，見上）
        字義解: GLYPH[`${p.name}|${c}`] || null,   // 舊庫字義解，另層另署，不與譜注混
        引: rec?.引 || [],
        level: rec?.level || null,      // 僅供審計，前臺不出
        ruleId: rec?.ruleId || null,
        to: toId, toName: e?.to || null,
        grant: e?.grant ?? null,
        act: e?.act ?? null,            // 連鎖（唯 g09-07 願升內院）
      };
      if (toId) (inbound[toId] ||= []).push({ from: p.id, fromName: p.name, combo: c });
    }
    const idx = byGateG[p.gate].findIndex((x) => x.id === p.id);
    positions[p.id] = {
      id: p.id, name: p.name, gate: p.gate, gateName: gates[p.gate].title,
      juan: JUAN_OF[p.gate], line: p.source?.line ?? null,
      combo: p.combo || null,           // 門一：本位所配之起手相
      ordinal: idx + 1,
      prev: idx > 0 ? byGateG[p.gate][idx - 1].id : null,
      next: idx < byGateG[p.gate].length - 1 ? byGateG[p.gate][idx + 1].id : null,
      anchor: anchorOf.get(p.id) || null,
      puyue: p.puyue || '',
      plain: POS_PLAIN[p.name] || POS_PLAIN[p.id] || '',
      cells,
    };
  }
  for (const [id, list] of Object.entries(inbound)) if (positions[id]) positions[id].inbound = list;
  for (const p of Object.values(positions)) p.inbound ||= [];

  // ── 法界節點 ────────────────────────────────────────────
  const nodes = {};
  for (const n of world.NODES) {
    nodes[n.id] = {
      id: n.id, name: n.name, sub: n.sub || '', group: n.group || '', sphere: n.sphere || '',
      coordKind: n.coordKind || '', bear: n.bear || '', elev: n.elev || '',
      line: n.line || '', detail: n.detail || '', alt: n.alt || '',
      profile: n.profile || [], citations: n.citations || [],
      positions: [],
    };
  }
  for (const p of Object.values(positions)) if (p.anchor && nodes[p.anchor]) nodes[p.anchor].positions.push(p.id);

  // ── 詞典 ────────────────────────────────────────────────
  const gloss = {};
  for (const g of GLOSS) {
    if (!Array.isArray(g) || !g[0]) continue;
    gloss[g[0]] = { def: g[1] || '', note: g[2] || '' };
  }

  // ── 出圖 ────────────────────────────────────────────────
  const hub = {
    meta: {
      built: new Date().toISOString().slice(0, 10),
      note: '位樞紐知識圖：五層資產按「位」串成。由 agent/build-hub.mjs 生成，勿手改。',
      sources: {
        L0: '承注/expanded.json（4620 格）',
        L1: 'xuanfopu-h5/data/positions.json（220 位）＋ 承注/rules/g*.json（15 門）＋ 十法界/src/sfp-pos-plain.js（位白話）',
        L2: '十法界/src/data.js（55 節點 102 引文）',
        L3: '十法界/src/sfp-gloss.js（名相詞典）＋ sfp-why-plain.js（逐句白話）＋ sfp-glyph-why.js（字義解）',
        底本: '繁体版/B0136_001～006.txt（CBETA 補編 No.136）',
      },
      counts: {},
    },
    faces: { table: FACE_TABLE, thesis: FACE_THESIS },
    gates, positions, nodes, gloss,
  };
  hub.meta.counts = {
    位: Object.keys(positions).length,
    格: Object.keys(positions).length * 21,
    門: Object.keys(gates).length,
    法界節點: Object.keys(nodes).length,
    詞條: Object.keys(gloss).length,
    反向邊: Object.values(inbound).reduce((a, b) => a + b.length, 0),
  };

  mkdirSync(join(HERE, 'index'), { recursive: true });
  const out = join(HERE, 'index/hub.json');
  writeFileSync(out, JSON.stringify(hub, null, 1) + '\n');

  // ── 自檢 ────────────────────────────────────────────────
  const errs = [];
  let noAns = 0, noAnchor = 0, deadEnd = 0, noPlain = 0;
  for (const p of Object.values(positions)) {
    if (!p.anchor) { noAnchor++; errs.push(`${p.id} ${p.name} 無入界錨點`); }
    for (const c of COMBOS21) {
      const cl = p.cells[c];
      if (!cl.答) { noAns++; errs.push(`${p.id}·${c} 無答語`); }
      if (!cl.白話) noPlain++;
      if (cl.toName && !cl.to) { deadEnd++; errs.push(`${p.id}·${c} 去向「${cl.toName}」無法解析`); }
    }
  }
  console.log(`\n位樞紐知識圖已出：agent/index/hub.json  ${(JSON.stringify(hub).length / 1048576).toFixed(2)} MB`);
  console.log(Object.entries(hub.meta.counts).map(([k, v]) => `　${k} ${v}`).join('\n'));
  const ans = new Set(); for (const p of Object.values(positions)) for (const c of COMBOS21) ans.add(p.cells[c].答);
  const hit = [...ans].filter((a) => plainOf(a)).length;
  console.log(`\n白話覆蓋：${4620 - noPlain}/4620 格（${((4620 - noPlain) / 46.2).toFixed(1)}%）　相異答語 ${ans.size} 條中已有白話 ${hit} 條，尚缺 ${ans.size - hit} 條`);
  console.log(`自檢：無答語 ${noAns}　無錨點 ${noAnchor}　去向不可解 ${deadEnd}`);
  if (errs.length) { console.log('前 10 條：'); errs.slice(0, 10).forEach((e) => console.log('　' + e)); }
  else console.log('✓ 全通');
}

main().catch((e) => { console.error('構建失敗：', e.message); process.exit(1); });
