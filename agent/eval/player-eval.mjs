#!/usr/bin/env node
// 真實玩家問法評測
//
// 【何以立此一評】canon-eval 逐格跑 4620 格，intent-eval 測位相解析——
// 二者所問，皆是**設計者想得到的問法**。而 2026-08-04 查出的那個大患，
// 恰恰躲在這片盲區裡：前端每問都隨手帶上現居位與最近一擲，後端見 payload 即短路，
// 於是玩家在局中無論問什麼都得同一答。兩份評測俱全通，線上卻全壞。
//
// 故立此評，所問一律取自**玩家真會打的字**，並分三節：
//   甲 · 捷徑不得吞問句 —— P0 回歸，與模型無關，任何時候都須全過
//   乙 · 五十二問全景   —— 路由分佈與拒答率，作基線指標
//   丙 · 定句三類       —— 身份／個人決斷／占卜，答語須切題
//
// 用法：
//   node agent/eval/player-eval.mjs            # 降級路（不調模型、不花錢）
//   SILICONFLOW_API_KEY=… node agent/eval/player-eval.mjs --model   # 併測生成路
//
// 密鑰只從環境變量讀，**不落盤、不入倉**。

const useModel = process.argv.includes('--model');
const verbose = process.argv.includes('--verbose');
const env = useModel ? { SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY } : {};
if (useModel && !env.SILICONFLOW_API_KEY) {
  console.error('✗ --model 需環境變量 SILICONFLOW_API_KEY');
  process.exit(1);
}

const worker = (await import('../worker/src/index.js')).default;

const ask = async (body) => {
  const res = await worker.fetch(
    new Request('https://ask.internal/v1/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    env,
  );
  const msgs = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const meta = msgs.find((m) => m.type === 'meta') || {};
  const done = msgs.find((m) => m.type === 'done') || {};
  return {
    mode: (meta.basis || {}).mode || '?',
    label: (meta.basis || {}).label || '',
    n: (meta.passages || []).length,
    text: msgs.filter((m) => m.type === 'delta').map((m) => m.text).join(''),
    verify: done.verify || null,
    status: done.evidenceStatus || '',
  };
};

// 局中實境。**須自洽**：初版設「現居南贍部洲、上一擲那謨」，而南贍部洲擲那謨的去向正是中品十惡——
// 位與相對不上，模型讀了便自行推算，答出「你落到了中品十惡」而玩家明明還在南贍部洲。
// 評測的局面若不是真局面，測出來的毛病也不是真毛病。今取南贍部洲擲那謨墮十惡因地之後的實局。
const BOARD = {
  pos: '中品十惡', posName: '中品十惡', door: 1, doorTitle: '發始因地門',
  combo: '那謨', n: 7, trail: ['南贍部洲', '中品十惡'],
};

let fail = 0;
const ok = (c, s) => { console.log(`  ${c ? '✓' : '✗'} ${s}`); if (!c) fail++; };

// ══ 甲 · 捷徑不得吞問句（P0 回歸）══
//
// 帶著完整局面問一批與該格無關之事。從前這些全被判成「南贍部洲×那謨」那一格。
// 此節與模型無關（降級路亦須全過）：判據不在答得多好，而在**沒有全被吞進定本一路**。
console.log('\n甲 · 捷徑不得吞問句（P0 回歸，任何時候須全過）');
{
  const QS = ['这个游戏怎么玩', '什么是横超', '你是谁', '我该不该出家', '什么是见惑', '蕅益大师是谁'];
  const modes = [];
  for (const q of QS) {
    const r = await ask({ ...BOARD, question: q });
    modes.push(r.mode);
    if (verbose) console.log(`     [${r.mode}] ${q} → ${r.text.slice(0, 40)}`);
  }
  const canonN = modes.filter((m) => m === 'canon').length;
  ok(canonN === 0, `六個無關之問，落入定本路由者 ${canonN} 個（須 0）`);
  ok(new Set(modes).size > 1, `路由分佈 ${JSON.stringify(modes)}——不得同歸一路`);

  // 反面：明署 ask:'reading' 者仍須走捷徑，否則「AI 解讀」按鈕就壞了
  const rd = await ask({ ...BOARD, ask: 'reading', question: '此相如何走、为何如此？' });
  ok(rd.mode === 'canon', `明署 reading 者仍走定本（實得 ${rd.mode}）`);

  // 指代之問：問句自身無位相，但有「我現在這步」，須補全得中
  const de = await ask({ ...BOARD, question: '我现在这一步为什么这样走' });
  ok(de.mode === 'canon', `指代補全命中定本（實得 ${de.mode}）`);
}

// ══ 乙 · 五十二問全景 ══
console.log('\n乙 · 五十二問全景（路由分佈與拒答率）');
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
  const stat = {}; let total = 0, refused = 0, ungrounded = 0;
  for (const [cat, qs] of Q52) {
    const line = [];
    for (const q of qs) {
      const r = await ask({ ...BOARD, question: q });
      total++;
      stat[r.mode] = (stat[r.mode] || 0) + 1;
      if (r.mode === 'refuse') refused++;
      if (r.status === 'ungrounded') ungrounded++;
      const SYM = { refuse: '✗', canon: '●', rules: '◆', corpus: '○', wenku: '◇', identity: '◎', boundary: '◎', personal: '○' };
      line.push(SYM[r.mode] || '?');
      if (verbose) console.log(`     [${r.mode}] ${q}\n        ${r.text.replace(/\n/g, ' ').slice(0, 72)}`);
    }
    console.log(`  ${cat}　${line.join('')}`);
  }
  const rate = (refused / total * 100);
  console.log(`\n  路由分佈 ${JSON.stringify(stat)}`);
  console.log(`  拒答率 ${rate.toFixed(1)}%（${refused}/${total}）　無據答語 ${ungrounded}`);
  console.log('  ● 定本　◆ 玩法　○ 譜內義理　◇ 文庫　◎ 分寸（身份自陳・不占吉凶）　✗ 拒答');
  // 【口徑，2026-08-04 發起人定「拒答率做到零」時同定】
  // `identity`（你是誰）與 `boundary`（此局是否預示我倒霉）**不計入拒答**：
  // 問的本不是譜能否答，而答的正是所問——前者據實自陳，後者依《敘》「皆本教乘非出臆見」
  // 明白回絕並掛引文。把切題之答計作拒答，是拿口徑替代改進。
  // `refuse` 只餘一種：檢索全零命中，據實說沒找著。
  ok(rate <= 57.7, `拒答率不劣於 M3 基線 57.7%`);
  // 降級路（無模型）亦須近零——確定材料在手則直出，不以「未載」了事
  ok(rate <= 2, `拒答率須近零（實得 ${rate.toFixed(1)}%，${refused}/${total}）`);
  if (useModel) ok(rate === 0, `接模型後拒答率須為零（實得 ${rate.toFixed(1)}%）`);
}

// ══ 丙 · 三處分寸 ══
//
// 【口徑改於 2026-08-04，發起人定「拒答率做到零」】原斷言作「個人決斷**須拒答**」，
// 是拿**形式**（mode === 'refuse'）代替**實質**（有沒有替人做決定）。而他問出家，
// 門七戒學十三位正是完整的出家戒次第——譜裡明明有，卻空手打發他，非分寸，是怠慢。
// 今改判實質三事：①不替他決定 ②不勸他做或不做 ③不空手（譜內相關次第照給）。
// 斷言由此更嚴，非更寬——從前只消回一句「未載」即過，如今須當真守住那條界又給得出東西。
console.log('\n丙 · 三處分寸（不替人決斷・不占吉凶・據實自陳；皆須切題且不空手）');
{
  const cases = [
    ['你是谁', (r) => /我是|依谱作答/.test(r.text) && !/未载/.test(r.text), '身份之問須自陳'],
    ['你是AI吗', (r) => !/未载/.test(r.text), '身份之問不得答「未載」'],
    ['我该不该出家',
      (r) => /不替你|不替人|自己/.test(r.text) && !/你应该|建议你|最好去|不要去/.test(r.text) && r.text.trim().length >= 20,
      '決定不替他做，亦不勸導，且不空手'],
    ['我该和他结婚吗',
      (r) => /不替你|不替人|自己/.test(r.text) && !/你应该|建议你/.test(r.text),
      '決定不替他做，亦不勸導'],
  ];
  for (const [q, pass, why] of cases) {
    const r = await ask({ ...BOARD, question: q });
    ok(pass(r), `「${q}」${why}　→ ${r.text.slice(0, 32)}`);
  }
  // 占卜之問：不可順著答，須有人明白回絕。有模型時由 rules 路依戒作答；
  // 無模型時走 boundary 定句並掛《敘》「皆本教乘非出臆見」為據——**非拒答，是答得有分寸**。
  const dv = await ask({ ...BOARD, question: '我这局是不是预示我要倒霉' });
  ok(dv.mode === 'rules' || dv.mode === 'boundary', `占卜之問走玩法路或分寸路回絕（實得 ${dv.mode}）`);
  ok(!/未载/.test(dv.text), '占卜之答不得以「未載」了事');
  if (useModel && dv.mode === 'rules') {
    // 初版判據為「不含吉凶等字，或含否認語」——空答語不含任何字，遂恆真而放行。
    // 而那一問的答語當真曾被句級閘全數丟盡，測出來卻是綠的。判據須先驗其有話，再驗其話對。
    ok(dv.text.trim().length >= 12, `占卜之答不得為空　→ 「${dv.text.slice(0, 40)}」`);
    ok(/不占|不測|不测|不講|不讲|不是占卜|無關|无关|不解籤|不解签|不預示|不预示/.test(dv.text),
      `占卜之答須明白否認　→ ${dv.text.slice(0, 48)}`);
  }
}

// ══ 丁 · 生成路核驗（僅 --model）══
if (useModel) {
  console.log('\n丁 · 生成路核驗（句級閘須攔住憑空之語）');
  const cases = ['什么是数息', '什么是见惑', '这个游戏怎么玩', '我离成佛还有多远'];
  for (const q of cases) {
    const r = await ask({ ...BOARD, question: q });
    const v = r.verify || {};
    const c = v.checks || {};
    console.log(`  [${r.mode}/${r.status}] ${q}　留 ${c.kept ?? '-'} 丟 ${c.dropped ?? '-'}`);
    if (verbose) console.log(`     ${r.text.replace(/\n/g, ' ').slice(0, 200)}`);
    ok(r.mode !== 'refuse', `「${q}」不當拒答`);
    ok(r.status === 'grounded', `「${q}」須有據（實得 ${r.status}）`);
    ok(r.text.trim().length >= 20, `「${q}」須確有答語（丟盡則成空篇，實得 ${r.text.trim().length} 字）`);
    ok((c.dropped || 0) <= 1, `「${q}」丟句不得過一（實丟 ${c.dropped}）`);
  }
}

console.log(fail ? `\n✗ ${fail} 項未過` : '\n✓ 全通');
process.exit(fail ? 1 : 0);
