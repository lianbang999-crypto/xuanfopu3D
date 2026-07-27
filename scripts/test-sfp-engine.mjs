// 浏览器与服务端共用的选佛谱纯规则引擎测试。
import {
  canonicalSfpCombo,
  emptySfpPlayerState,
  isSfpCombo,
  resolveSfpToss,
} from '../src/sfp-engine.js';

let passed = 0;
let failed = 0;
function ok(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

console.log('\n【轮相归一化】');
ok(canonicalSfpCombo('佛', '那') === '那佛', '二轮次序不影响组合键');
ok(isSfpCombo('那佛') && !isSfpCombo('佛那'), '协议只接受规范组合');

console.log('\n【起行与安住】');
const first = resolveSfpToss(emptySfpPlayerState(), '佛佛', 1000);
ok(first.state.pos === '出世慧學' && first.state.n === 1, '第一掷由發始因地起行');
const inert = resolveSfpToss({ pos: '蒙光天子', n: 4, bonus: 0 }, '那那', 1000);
ok(inert.state.pos === '蒙光天子' && inert.steps[0].kind === 'stay', '无对应行法时安住原位');

console.log('\n【贈掷队列】');
const pureGrant = resolveSfpToss({ pos: '蒙光天子', n: 5, bonus: 0 }, '彌佛', 1000);
ok(pureGrant.state.pos === '蒙光天子', '纯贈保持当前谱位');
ok(pureGrant.grant === 2 && pureGrant.state.bonus === 0, '贈二掷交由对局层分配受赠者，不归当前操作者');
const consumeOne = resolveSfpToss({ ...pureGrant.state, bonus: 2 }, '那那', 1001);
ok(consumeOne.state.bonus === 1, '受赠者下一次实际掷轮消耗一枚受赠之掷');
const moveGrant = resolveSfpToss({ pos: '圓十行位', n: 7, bonus: 0 }, '阿陀', 1000);
ok(moveGrant.state.pos === '圓十迴向位', '移位兼贈先移动到目的位');
ok(moveGrant.grant === 1 && moveGrant.state.bonus === 0, '移位后贈掷交由对局层分配受赠者');

console.log('\n【终点】');
const terminal = resolveSfpToss({ pos: '圓等覺位', n: 20, bonus: 2 }, '佛佛', 2000);
ok(terminal.state.done && terminal.state.pos === '圓教究竟妙覺位', '真实终点组合由引擎判定及第');
ok(terminal.state.bonus === 0 && terminal.state.doneAt === 2000, '及第后清空贈掷并记录结算时刻');

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
