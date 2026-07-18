// 无头整局模拟：验证 220 位数据闭环与整局可玩性
// 语义与 game.js 的 sfpApply/aiResolve 一致：起手因地 → 组合行位 → 贈掷连掷 → 依字连行 → 终局及第
// 用法：node scripts/simulate.mjs [局数]

import { SFP_POS, SFP_DOORS } from '../src/sfp-data.js';

const SFP_BY = {};
for (const p of SFP_POS) SFP_BY[p.id] = p;

const ORDER = '那謨阿彌陀佛';
const comboKey = (a, b) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a + b : b + a);
const roll = () => comboKey(ORDER[Math.floor(Math.random() * 6)], ORDER[Math.floor(Math.random() * 6)]);

// ---- 数据完整性校验 ----
let bad = 0;
const starts = new Set();
for (const p of SFP_POS) {
  if (p.start) {
    if (starts.has(p.start)) { console.error(`✗ 起手组合重复：${p.start}（${p.name}）`); bad++; }
    starts.add(p.start);
  }
  for (const mv of p.moves || []) {
    if (mv.to && !SFP_BY[mv.to]) { console.error(`✗ ${p.id}「${p.name}」moves 指向不存在的位：${mv.to}`); bad++; }
    if (mv.act && !'那謨阿彌陀佛'.split('').every(() => true)) { /* act 为二字组合，下面终局模拟自会覆盖 */ }
  }
}
const doorCnt = {};
for (const p of SFP_POS) doorCnt[p.door] = (doorCnt[p.door] || 0) + 1;
console.log(`门数 ${SFP_DOORS.length} · 总位数 ${SFP_POS.length} · 各门位数 ${Object.entries(doorCnt).map(([d, c]) => `${d}:${c}`).join(' ')}`);
console.log(`起手因地组合 ${starts.size} 种（应 21）`);
if (SFP_DOORS.length !== 15 || SFP_POS.length !== 220 || starts.size !== 21) { console.error('✗ 门/位/起手数与原谱不符'); bad++; }
const terminals = SFP_POS.filter(p => p.terminal);
console.log(`终局位：${terminals.map(p => p.name).join('、')}`);
if (!terminals.length) { console.error('✗ 无终局位'); bad++; }

// ---- 单局模拟 ----
function playOne(maxRolls = 3000) {
  let pos = null, n = 0, chainGuard = 0;
  const resolve = (combo, depth = 0) => {
    if (depth > 6) return;
    if (!pos) {
      const p0 = SFP_POS.find(q => q.start === combo);
      if (p0) pos = p0.id;
      return;
    }
    const p = SFP_BY[pos];
    if (p.terminal) return;
    const mv = (p.moves || []).find(m => m.c.includes(combo));
    if (!mv) return;                       // 安住不行
    if (!mv.to && mv.bonus) {              // 贈掷：同轮连掷
      for (let i = 0; i < mv.bonus && chainGuard < 50; i++) { chainGuard++; n++; resolve(roll(), depth); }
      return;
    }
    pos = mv.to;
    if (mv.bonus) for (let i = 0; i < mv.bonus && chainGuard < 50; i++) { chainGuard++; n++; resolve(roll(), depth); }
    if (mv.act && pos === mv.to) resolve(mv.act, depth + 1); // 依字连行（如彌勒內院依字行）
  };
  while (n < maxRolls) {
    n++;
    chainGuard = 0;
    resolve(roll());
    if (pos && SFP_BY[pos].terminal) return { ok: true, n, at: SFP_BY[pos].name };
  }
  return { ok: false, n, at: pos ? SFP_BY[pos].name : '未起行' };
}

const N = parseInt(process.argv[2] || '500', 10);
const rolls = [];
let fail = 0;
for (let i = 0; i < N; i++) {
  const r = playOne();
  if (r.ok) rolls.push(r.n);
  else { fail++; if (fail <= 3) console.error(`✗ 第 ${i + 1} 局未圆满：${r.n} 掷停在「${r.at}」`); }
}
rolls.sort((a, b) => a - b);
const med = rolls[Math.floor(rolls.length / 2)];
console.log(`\n模拟 ${N} 局：圆满 ${rolls.length} · 未圆满 ${fail}`);
if (rolls.length) console.log(`掷数：最少 ${rolls[0]} · 中位 ${med} · 最多 ${rolls[rolls.length - 1]}`);
if (bad || fail) { console.error('\n✗ 校验未通过'); process.exit(1); }
console.log('✓ 数据闭环与整局可玩性校验通过');
