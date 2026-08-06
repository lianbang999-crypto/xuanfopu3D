#!/usr/bin/env node
// 定本路由全量回歸（M3 驗收）
//
// 設計書第九節：「文鈔的評測要人工標 expectArticles。我們的 4620 格本身就是標準答案。」
// 故此處不抽樣、不人工標——逐格跑一遍，對比 Worker 輸出與承注庫源數據。
//
// 四項全過方為合格：
//   ① 命中率      4620 格皆須命中定本，一格不中即是索引壞了
//   ② 核驗通過率  斷言級核驗（角標越界／直引對不上／位名門號自造／裸數字）
//   ③ 引文一致率  Worker 所出引文須與承注庫逐字相同
//   ④ 去向一致率  Worker 所報去向須與承注庫相同
//
// 另跑問句解析：不傳 pos/combo，只給自然問句，看能否解出位相。
//
// 用法：node agent/eval/canon-eval.mjs [--verbose]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const hub = JSON.parse(readFileSync(join(HERE, '../index/hub.json'), 'utf8'));
const worker = (await import(join(HERE, '../worker/src/index.js'))).default;
const verbose = process.argv.includes('--verbose');

const ask = async (body) => {
  const res = await worker.fetch(new Request('https://ask.internal/v1/ask', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  const msgs = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  return {
    meta: msgs.find((x) => x.type === 'meta'),
    done: msgs.find((x) => x.type === 'done'),
    text: msgs.filter((x) => x.type === 'delta').map((x) => x.text).join(''),
  };
};

const norm = (t) => String(t || '').replace(/\s+/g, '');

// ── 一 · 全量 4620 格 ──
let n = 0, miss = [], badVerify = [], badCite = [], badTo = [], ttftSum = 0;
for (const p of Object.values(hub.positions)) {
  for (const [c, cl] of Object.entries(p.cells)) {
    n++;
    // ask:'reading' ＝「AI 解讀」按鈕之調用約定（2026-08-04 立）：問句由模板生成、位相明傳，
    // 問的必是那一格，故許走 payload 捷徑。自由提問**不得**帶此標——
    // 何以然，見 player-eval.mjs「捷徑不得吞問句」一節。
    const { meta, done, text } = await ask({ ask: 'reading', question: '此相如何走、为何如此？', posName: p.name, combo: c });
    const key = `${p.name}|${c}`;
    if (!meta || meta.basis.mode !== 'canon') { miss.push(key); continue; }
    ttftSum += meta.timing.ttft || 0;
    if (!done.verify || !done.verify.ok) badVerify.push([key, done.verify && done.verify.issues]);
    // 引文逐字對比
    const want = (cl.引 || []).map((x) => norm(x.text));
    const got = meta.passages.map((x) => norm(x.text));
    if (want.length !== got.length || want.some((w, i) => w !== got[i])) badCite.push(key);
    // 去向對比
    const wantTo = cl.to ? hub.positions[cl.to].name : null;
    if ((meta.facts.to || null) !== wantTo) badTo.push([key, meta.facts.to, wantTo]);
    // 答語須含承注庫白話之實質（去角標比對）
    if (cl.白話 && !norm(text).includes(norm(cl.白話).replace(/\[\d\]/g, ''))) {
      if (verbose) console.log('  白話未原樣輸出：' + key);
    }
  }
}

const pct = (bad) => ((100 * (n - bad) / n).toFixed(2) + '%');
console.log(`\n定本路由全量回歸：${n} 格\n`);
console.log(`① 命中率　　${pct(miss.length)}　　未命中 ${miss.length}`);
console.log(`② 核驗通過　${pct(badVerify.length)}　　不通過 ${badVerify.length}`);
console.log(`③ 引文一致　${pct(badCite.length)}　　不一致 ${badCite.length}`);
console.log(`④ 去向一致　${pct(badTo.length)}　　不一致 ${badTo.length}`);
console.log(`　 平均 ttft ${(ttftSum / Math.max(n, 1)).toFixed(1)} ms`);
[['未命中', miss], ['核驗不過', badVerify], ['引文不一致', badCite], ['去向不一致', badTo]]
  .forEach(([label, list]) => {
    if (!list.length) return;
    console.log(`\n【${label}】前 5 例`);
    list.slice(0, 5).forEach((x) => console.log('  ' + JSON.stringify(x)));
  });

// ── 二 · 問句解析（不傳 pos/combo，只給自然問句）──
const QCASES = [
  ['在九法王子住掷得那那为什么不行？', '九法王子住', '那那'],
  ['圆十信位掷得阿佛怎么走', '圓十信位', '阿佛'],
  ['上品十恶掷出那那会怎样', '上品十惡', '那那'],
  ['南赡部洲掷得佛佛', '南贍部洲', '佛佛'],
  ['初住掷得谟谟为何不行', '初發心住', '謨謨'],          // 別名 ＋ 簡體輪相
  ['廣果天擲得阿阿', '廣果天', '阿阿'],
];
let qok = 0;
console.log('\n\n問句解析（無 pos/combo，純自然問句）');
for (const [q, wantPos, wantCombo] of QCASES) {
  const { meta } = await ask({ question: q });
  const ok = meta.basis.mode === 'canon' && meta.facts.pos === wantPos && meta.facts.combo === wantCombo;
  if (ok) qok++;
  console.log(`  ${ok ? '✓' : '✗'} ${q}` + (ok ? '' : `　→ 解出 ${meta.facts ? meta.facts.pos + '×' + meta.facts.combo : '無'}，應為 ${wantPos}×${wantCombo}`));
}
console.log(`  解析率 ${qok}/${QCASES.length}`);

// ── 三 · 拒答路由 ──
// 【2026-08-04 發起人定「拒答率做到零」後，此節只餘真無可依者】
// 個人決斷已移出拒答：決定仍不替他做（2026-08-02 之裁定不動），而譜內相關次第照給，
// 走 personal 路，見 player-eval 丙節。此處只留「問句本身無從著手」一種。
const RCASES = [
  ['', '请指明位次与轮相'],   // 沒問清楚者仍須請其指明——那不是「未載」
];
let rok = 0;
console.log('\n拒答路由（真無可依者，須拒答、不掛引文、且答語切題）');
for (const [q, want] of RCASES) {
  const { meta, done, text } = await ask({ question: q });
  const ok = meta.basis.mode === 'refuse' && done.evidenceStatus === 'refused'
    && meta.passages.length === 0 && text.includes(want);
  if (ok) rok++;
  console.log(`  ${ok ? '✓' : '✗'} 「${q || '(空)'}」　${meta.basis.label}／${done.evidenceStatus}／引文 ${meta.passages.length}` + (ok ? '' : `　答語未含「${want}」`));
}
console.log(`  拒答率 ${rok}/${RCASES.length}`);

// ── 四 · 意圖分派（有位無相者不再一律拒答）──
const ICASES = [
  ['圆十信位掷得什么', 'canon', '二十一轮相行法'],
  ['圆十信位是什么意思', 'canon', '第13门'],
];
let iok = 0;
console.log('\n意圖分派');
for (const [q, mode, want] of ICASES) {
  const { meta, text } = await ask({ question: q });
  const ok = meta.basis.mode === mode && text.includes(want);
  if (ok) iok++;
  console.log(`  ${ok ? '✓' : '✗'} 「${q}」　${meta.basis.label}` + (ok ? '' : `　答語未含「${want}」`));
}
console.log(`  分派 ${iok}/${ICASES.length}`);

// ── 四之二 · 譜內全文檢索（692 塊，全書七萬六千字）──
// 此類問句向來答「未載」，而答案原在譜中。
// 命中譜內即可，不拘 canon 或 corpus——「無生懺」走位路由（位義白話＋本位譜曰）
// 較走檢索更佳，不當因路由不同而判錯。
const CCASES = [
  ['什么是见惑', '那表屬見煩惱'],
  ['什么是横超', '橫'],
  ['什么是无生忏', '觀罪性空'],
  ['选佛谱是谁写的', '選佛圖'],   // 命中敘文（作譜緣起）。撰述題記在別塊，
                                  // 「誰寫的」對不上「撰述時地」——此係檢索之語義鴻溝，
                                  // 待模型意圖層補（無密鑰時答敘文亦不失為正答）。
  ['为什么用那谟阿弥陀佛六字', '萬德洪名'],
];
let cok = 0;
console.log('\n譜內全文檢索');
for (const [q, want] of CCASES) {
  const { meta, text } = await ask({ question: q });
  const ok = (meta.basis.mode === 'corpus' || meta.basis.mode === 'canon') && text.includes(want);
  if (ok) cok++;
  console.log(`  ${ok ? '✓' : '✗'} 「${q}」　${meta.basis.label}／引文 ${meta.passages.length}` + (ok ? '' : `　答語未含「${want}」`));
}
console.log(`  檢索 ${cok}/${CCASES.length}`);

// ── 五 · 問道旁路（走網絡，故單列一組，--no-net 可略）──
// 譜外而屬淨土修學者轉佛樂問文庫；個人決斷不轉——那不是知識不足，
// 是軟件不該替人做這個決定。
let wok = 0, WCASES = [];
if (!process.argv.includes('--no-net')) {
  WCASES = [
    ['印光大师怎么说念佛', 'wenku'],      // 修行之問 → 轉文庫
    ['临终助念要注意什么', 'wenku'],
    // 個人決斷**不轉文庫**（發起人 2026-08-02 定：軟件不該替人做這個決定），
    // 但亦不空手拒答——走 personal 路，決定不替他做而譜內次第照給（2026-08-04 定）。
    ['我该不该辞职去出家', 'personal'],
  ];
  console.log('\n問道旁路（譜外淨土修學之問轉佛樂問文庫）');
  for (const [q, mode] of WCASES) {
    const { meta, text } = await ask({ question: q });
    // 亦驗文本：只驗 basis 而不驗文本，曾令「delta 未解物件」之病漏到線上
    const clean = mode !== 'wenku' || (text.length > 10 && !text.includes('{"text"'));
    const ok = meta.basis.mode === mode && clean;
    if (ok) wok++;
    console.log(`  ${ok ? '✓' : '✗'} 「${q}」　${meta.basis.label}／引文 ${meta.passages.length}` + (ok ? '' : (meta.basis.mode === mode ? '　答語未解（含 JSON 殘骸）' : `　應為 ${mode}`)));
  }
  console.log(`  旁路 ${wok}/${WCASES.length}`);
}

const pass = !miss.length && !badVerify.length && !badCite.length && !badTo.length
  && qok === QCASES.length && rok === RCASES.length && iok === ICASES.length && cok === CCASES.length && wok === WCASES.length;
console.log(`\n${pass ? '✓ M3 驗收全通' : '✗ 未過'}`);
process.exit(pass ? 0 : 1);
