#!/usr/bin/env node
// 問譜 v3 評測（2026-08-12 隨管線重立；舊四評 canon-eval／intent-eval／player-eval／guard-eval
// 隨舊管線撤除，git 可考。定本數據之回歸另有前端 npm run test:verdict 五十二檢，不在此處重複。）
//
// 【五節】
//   甲 · 協議與零拒答 —— 五十二問全景（題庫承舊 player-eval，皆真實玩家問法）：
//        ndjson 三段俱全、答語非空；「未检得」只許發生在檢索零命中之問。
//   乙 · 檢索之根 —— 問法橋與簡繁歸一（谁写的→敘；见惑→見惑），引文須到位。
//   丙 · 三條分寸 —— 身份自陳／個人決斷不替決＋材料照給／占卜回絕依《敘》。
//   丁 · 生成閘 —— 公網直訪密鑰不入 env（降級 nokey）；快取鍵確定性；多輪截取。
//   戊 · 生成路（--model，須 SILICONFLOW_API_KEY 環境變量）—— 真調模型三問：
//        流式到齊、句級閘留存率、角標落在引文界內、ttft 錄檔。
//
// 用法：
//   node agent/eval/ask-eval.mjs             # 甲乙丙丁（不調模型、不花錢）
//   SILICONFLOW_API_KEY=… node agent/eval/ask-eval.mjs --model   # 併測戊
// 密鑰只從環境變量讀，不落盤、不入倉。

import worker from '../worker/src/index.js';
import { cacheKeyOf } from '../worker/src/guard.js';
import { CORPUS_META } from '../worker/src/corpus.js';

const useModel = process.argv.includes('--model');
const verbose = process.argv.includes('--verbose');
const KEY = process.env.SILICONFLOW_API_KEY || '';
if (useModel && !KEY) { console.error('✗ --model 需環境變量 SILICONFLOW_API_KEY'); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (x ? ' — ' + x : '')); } };

/** 調一問：Node 裡直調 worker.fetch，收齊 ndjson 三段 */
async function ask(question, { env = {}, trusted = true, body = {} } = {}) {
  const url = trusted ? 'https://ask.internal/v1/ask' : 'https://xuanfopu-agent-v2.workers.dev/v1/ask';
  const res = await worker.fetch(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ask-client': 'eval' },
    body: JSON.stringify({ question, ...body }),
  }), env);
  const raw = await res.text();
  const out = { meta: null, done: null, text: '', lines: 0 };
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    out.lines++;
    let j; try { j = JSON.parse(l); } catch { continue; }
    if (j.type === 'meta') out.meta = j;
    else if (j.type === 'delta') out.text += j.text || '';
    else if (j.type === 'done') out.done = j;
  }
  return out;
}

// ══ 甲 · 協議與零拒答（五十二問全景，降級路） ══
console.log('甲 · 協議與零拒答（52 問，無密鑰降級路）');
const Q52 = [
  ['玩法', ['这个游戏怎么玩', '怎么才算赢', '要掷多少次才能成佛', '掷到地狱是不是就输了', '为什么我一直在原地不动',
    '赠掷是什么意思', '两个轮子怎么算', '首掷是干嘛的', '能存档吗', '一局大概多久']],
  ['局面', ['我现在在哪', '我这一步走得好不好', '我现在掷什么最好', '我离成佛还有多远', '怎么才能出去',
    '这里危险吗', '下一步会去哪', '我刚才为什么掉下来了']],
  ['位门', ['南赡部洲是什么地方', '人道是第几门', '四洲人道门有哪些位', '成佛是哪一位', '地狱有几层',
    '圆教和别教有什么区别', '十信位是什么', '阿罗汉在哪一门']],
  ['名相', ['什么是见惑', '什么是思惑', '什么是横超', '什么是竖入', '什么是无生忏', '什么是数息',
    '五戒是哪五个', '十善业道是什么', '四谛是什么', '什么叫业力']],
  ['修学', ['怎么念佛才有效', '念佛要念多少遍', '临终怎么办', '什么是往生', '我业障重怎么办']],
  ['书志', ['这是谁写的', '蕅益大师是谁', '为什么要做这个图', '这个和大富翁有什么区别', '选佛谱是迷信吗']],
  ['决断', ['我该不该出家', '我该和他结婚吗', '我这局是不是预示我要倒霉']],
  ['闲谈', ['你是谁', '你是AI吗', '讲个笑话']],
];
{
  let total = 0, broken = 0, empty = 0, nomatch = 0, withCites = 0;
  const nomatchQ = [];
  for (const [, qs] of Q52) {
    for (const q of qs) {
      total++;
      const r = await ask(q);
      if (!r.meta || !r.done) { broken++; if (verbose) console.log('    協議殘缺：' + q); continue; }
      if (!r.text.trim()) { empty++; if (verbose) console.log('    答語為空：' + q); continue; }
      const isNomatch = r.text.includes('没在谱里找到可依的段落');
      if (isNomatch) { nomatch++; nomatchQ.push(q); }
      // 零拒答之守：說「未检得」者，meta 必須真是零引文——檢得了還說沒找到即失守
      if (isNomatch && (r.meta.passages || []).length > 0) { broken++; console.log('    檢得卻稱未检得：' + q); }
      if ((r.meta.passages || []).length > 0) withCites++;
    }
  }
  console.log(`  問 ${total}　帶引文 ${withCites}　未检得 ${nomatch}${nomatchQ.length ? '（' + nomatchQ.join('、') + '）' : ''}`);
  ok(broken === 0, '協議三段俱全、無「檢得卻稱未检得」');
  ok(empty === 0, '答語無一為空（降級亦不空手）');
  ok(nomatch <= 5, `「未检得」≤5（今 ${nomatch}——那是檢索的短處清單，不是拒答）`);
  ok(withCites >= total * 0.8, `八成以上的問帶引文（今 ${withCites}/${total}）`);
}

// ══ 乙 · 檢索之根 ══
console.log('\n乙 · 檢索之根（問法橋・簡繁歸一）');
{
  const r1 = await ask('这是谁写的');
  ok((r1.meta.passages || []).length > 0 && /蕅益|選佛譜敘|敘/.test(r1.text), '「这是谁写的」→ 檢得《敘》（問法橋）',
    r1.text.slice(0, 40));
  const r2 = await ask('什么是见惑');
  ok((r2.meta.passages || []).length > 0 && /見惑/.test(r2.text), '「什么是见惑」→ 簡體問命中繁體塊');
  const r3 = await ask('什么是横超');
  ok((r3.meta.passages || []).length > 0, '「什么是横超」→ 檢得');
  const r4 = await ask('');
  ok(r4.text.includes('把想问的写成一句话'), '空問句 → 引導語，非報錯');
}

// ══ 丙 · 三條分寸 ══
console.log('\n丙 · 三條分寸（值觀層，降級路亦須守住）');
{
  const r1 = await ask('你是谁');
  ok(/问谱|依.*谱文作答/.test(r1.text) && !/未载|未检得/.test(r1.text), '身份之問據實自陳', r1.text.slice(0, 40));
  ok(r1.meta.basis && r1.meta.basis.mode === 'identity', '身份別立一目（不計入拒答）');
  const r2 = await ask('讲个笑话');
  ok(/问谱/.test(r2.text), '閒談 → 自陳並引導，不硬答');
  const r3 = await ask('我该不该出家');
  ok(/不替你做|不替人決斷|不替人决断/.test(r3.text), '個人決斷：決定不替他做', r3.text.slice(0, 50));
  ok((r3.meta.passages || []).length > 0, '個人決斷：譜中相關次第照給（不空手）');
  const r4 = await ask('我这局是不是预示我要倒霉');
  ok(/教乘|不占|不测运气/.test(r4.text), '占卜之問明白回絕（依《敘》）', r4.text.slice(0, 50));
  const r5 = await ask('我该和他结婚吗');
  ok(/不替你做|不替人決斷|不替人决断/.test(r5.text) && !/未载/.test(r5.text), '婚嫁之問同一分寸');
}

// ══ 丁 · 生成閘 ══
console.log('\n丁 · 生成閘（公網零生成・快取鍵・多輪截取）');
{
  // 公網直訪：縱 env 帶密鑰也不得動模型——在配額閘前即判 public 降級，密鑰另有 E 剝除作二重保險
  const r1 = await ask('什么是见惑', { trusted: false, env: { SILICONFLOW_API_KEY: 'sk-fake' } });
  ok(r1.meta.degraded === true && r1.meta.degradedReason === 'public', '公網直訪零生成（降級 public）',
    JSON.stringify({ degraded: r1.meta.degraded, why: r1.meta.degradedReason }));
  ok((r1.meta.passages || []).length > 0 && r1.text.length > 20, '公網降級仍帶引文與原文（零生成非零服務）');
  // 快取鍵：同問同鍵、異問異鍵、含數據版次
  const k1 = await cacheKeyOf('ask', '什么是见惑', {}, CORPUS_META.builtAt);
  const k2 = await cacheKeyOf('ask', '什么是见惑', {}, CORPUS_META.builtAt);
  const k3 = await cacheKeyOf('ask', '什么是思惑', {}, CORPUS_META.builtAt);
  ok(k1 === k2 && k1 !== k3 && /^[0-9a-f]{64}$/.test(k1), '快取鍵確定且含版次');
  // 多輪：history 超長截取不炸、且不影響答問
  const r2 = await ask('横超是什么意思', { body: { history: [
    { q: 'x'.repeat(999), a: 'y'.repeat(9999) }, { q: '什么是见惑', a: '见惑是……' }, { q: '那思惑呢', a: '思惑是……' },
  ] } });
  ok(!!r2.done && r2.text.length > 0, '帶超長多輪 history 照常答（截末二輪各四百字）');
}

// ══ 戊 · 生成路（--model） ══
if (useModel) {
  console.log('\n戊 · 生成路（真調模型，計費）');
  const QS = ['什么是横超', '选佛谱是谁写的，为什么要做这个谱', '我该不该出家'];
  for (const q of QS) {
    const t0 = Date.now();
    const r = await ask(q, { env: { SILICONFLOW_API_KEY: KEY } });
    const v = r.done && r.done.verify;
    const kept = v && v.checks ? v.checks.kept : 0;
    const dropped = v && v.checks ? v.checks.dropped : 0;
    const cites = [...r.text.matchAll(/\[(\d{1,2})\]/g)].map((m) => +m[1]);
    const inRange = cites.every((n) => n >= 1 && n <= (r.meta.passages || []).length);
    ok(!r.meta.degraded && kept > 0, `生成到齊「${q}」（留 ${kept} 句、丟 ${dropped}、ttft ${r.meta.timing ? r.meta.timing.ttft : '?'}ms）`);
    ok(r.done.evidenceStatus === 'grounded', `過閘 grounded「${q}」`, r.done.evidenceStatus);
    ok(cites.length === 0 || inRange, `角標皆落引文界內「${q}」`);
    if (verbose) console.log('    ' + r.text.replace(/\n/g, ' ').slice(0, 120) + '…　' + (Date.now() - t0) + 'ms');
  }
} else {
  console.log('\n戊 · 生成路：未跑（加 --model 與 SILICONFLOW_API_KEY 環境變量以併測）');
}

console.log(`\n${fail ? '✗' : '✓'} ${fail ? '有未過' : '全通'}　通過 ${pass}　失敗 ${fail}`);
process.exit(fail ? 1 : 0);
