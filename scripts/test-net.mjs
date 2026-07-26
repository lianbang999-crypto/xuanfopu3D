// 真人共修协议测试：对 wrangler dev 跑共同准备、权威掷轮、轮次与重连。
// 用法：先 `npx wrangler dev --port 8787`，再 `node scripts/test-net.mjs`
const BASE = process.env.NET_BASE || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const TABLE = 'H3T8';

let passed = 0;
let failed = 0;
function ok(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function connect(code) {
  const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const index = waiters.findIndex((waiter) => waiter.test(message));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
    else inbox.push(message);
  });
  const next = (test, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const index = inbox.findIndex(test);
    if (index >= 0) {
      resolve(inbox.splice(index, 1)[0]);
      return;
    }
    const waiter = { test, resolve };
    waiters.push(waiter);
    setTimeout(() => {
      const pending = waiters.indexOf(waiter);
      if (pending >= 0) {
        waiters.splice(pending, 1);
        reject(new Error('等消息超时'));
      }
    }, timeoutMs);
  });
  return {
    ws,
    inbox,
    next,
    send: (message) => ws.send(JSON.stringify(message)),
    opened: new Promise((resolve) => ws.addEventListener('open', resolve)),
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rid = (prefix) => `${prefix}:${crypto.randomUUID()}`;
async function join(code, name, playerId = null, key = '', clientToken = '') {
  const client = connect(code);
  await client.opened;
  client.send({ type: 'join', protocolVersion: 2, name, playerId, key, clientToken });
  const joined = await client.next((message) => message.type === 'joined' || message.type === 'error');
  if (joined.type === 'joined') {
    client.playerId = joined.playerId;
    client.joined = joined;
    client.sync = await client.next((message) => message.type === 'sync');
  }
  return { client, joined };
}

console.log('\n【入座与准备室】');
const clients = [];
for (const name of ['慧明', '慧安', '慧净', '慧觉']) {
  const { client, joined } = await join(TABLE, name);
  ok(joined.type === 'joined', `${name}真人入座`);
  clients.push(client);
}
const [east, south, west, north] = clients;
ok(east.joined.seat === 0 && east.joined.host, '最先入室者是真人房主');
ok(east.sync.protocolVersion === 2 && east.sync.room.status === 'waiting', '同步采用 v2 准备室协议');
ok(east.sync.players.every((player) => player.n === 0 && !player.ready), '入座不会自动开始个人谱局');

east.send({ type: 'ready_set', ready: true, requestId: rid('ready') });
south.send({ type: 'ready_set', ready: true, requestId: rid('ready') });
const readySync = await east.next((message) =>
  message.type === 'sync' && message.players.filter((player) => player.ready).length === 2);
ok(readySync.players.find((player) => player.id === east.playerId).ready, '房主准备状态广播');
ok(readySync.players.find((player) => player.id === south.playerId).ready, '成员准备状态广播');

west.send({ type: 'start_match', requestId: rid('start') });
const hostOnly = await west.next((message) => message.type === 'command_error');
ok(hostOnly.code === 'host_only', '非房主不能强行开局');

east.send({ type: 'start_match', requestId: rid('start') });
const started = await east.next((message) => message.type === 'match_started');
ok(started.room.status === 'playing' && started.room.round === 1, '两位准备后共同开局');
ok(started.room.order.length === 2, '未准备者不进入本局行动序列');
ok(started.players.filter((player) => player.spectator).length === 2, '未准备者留室旁观');
const firstId = started.room.turnId;
const first = clients.find((client) => client.playerId === firstId);
const second = first === east ? south : east;

console.log('\n【服务器权威轮次】');
await wait(Math.max(0, Number(started.room.availableAt) - Date.now()) + 80);
second.inbox.length = 0;
second.send({ type: 'toss_request', requestId: rid('wrong-turn') });
const denied = await second.next((message) => message.type === 'command_error');
ok(denied.code === 'not_your_turn', '非当前同修掷轮被服务器拒绝');

first.send({ type: 'move', pos: '圓教究竟妙覺位', n: 999, done: true, requestId: rid('old') });
const oldProtocol = await first.next((message) => message.type === 'command_error' && message.code === 'old_protocol');
ok(!!oldProtocol, '客户端不能自行上报位置或及第');

const tossId = rid('toss');
first.send({ type: 'toss_request', requestId: tossId });
const toss = await first.next((message) => message.type === 'toss_committed' && message.requestId === tossId);
ok(/^[那謨阿彌陀佛]{2}$/.test(toss.combo), '轮相由服务器生成并承诺');
ok(toss.player.n === 1 && toss.players.find((player) => player.id === firstId).n === 1, '服务器权威增加掷数');
ok(Array.isArray(toss.steps) && toss.steps.length >= 1, '服务器同时给出规则步骤');

first.send({ type: 'toss_request', requestId: tossId });
const duplicate = await first.next((message) => message.type === 'toss_committed' && message.requestId === tossId);
ok(duplicate.combo === toss.combo && duplicate.player.n === 1, '重复 requestId 返回原结果，不会重复行棋');

first.send({ type: 'turn_done', requestId: rid('done') });
const nextTurn = await first.next((message) => message.type === 'turn_started');
if (toss.player.bonus > 0 && !toss.player.done) {
  ok(nextTurn.room.turnId === firstId && nextTurn.continuation, '贈掷仍由当前操作者即时续掷');
} else {
  ok(nextTurn.room.turnId === second.playerId, '完整一手结束后才交下一位');
}

console.log('\n【断线重连与服务器快照】');
const reconnectTarget = south;
const oldId = reconnectTarget.playerId;
try { reconnectTarget.ws.close(); } catch {}
await wait(250);
const { client: reconnected, joined: rejoined } = await join(TABLE, '慧安', oldId);
ok(rejoined.type === 'joined' && rejoined.playerId === oldId, '持 playerId 断线重连回原座');
const restored = reconnected.sync.players.find((player) => player.id === oldId);
ok(restored && restored.n === (south === first ? 1 : 0), '重连只读取服务器棋况，不上传本地位置');
const sameName = await join('H3T9', '同名');
const sameName2 = await join('H3T9', '同名');
ok(sameName.joined.playerId !== sameName2.joined.playerId, '同名玩家不会冒名接管旧座');

console.log('\n【同一人只占一座】');
const repeatToken = `person:${crypto.randomUUID()}`;
const repeatedA = await join('H3T11', '重复点击者', null, '', repeatToken);
const repeatedB = await join('H3T11', '重复点击者', null, '', repeatToken);
ok(repeatedA.joined.playerId === repeatedB.joined.playerId, '同一浏览器令牌重复入座复用原身份');
ok(repeatedB.client.sync.players.length === 1, '重复点击不会把一间房占成多人');

console.log('\n【三人局离开后继续】');
const leaveHost = await join('H3T12', '先入房主');
const leaveMemberA = await join('H3T12', '成员甲');
const leaveMemberB = await join('H3T12', '成员乙');
for (const entry of [leaveHost, leaveMemberA, leaveMemberB]) {
  entry.client.send({ type: 'ready_set', ready: true, requestId: rid('ready') });
}
await leaveHost.client.next((message) => message.type === 'sync'
  && message.players.filter((player) => player.ready).length === 3);
leaveHost.client.send({ type: 'start_match', requestId: rid('start') });
await leaveMemberA.client.next((message) => message.type === 'match_started');
leaveHost.client.send({ type: 'leave', requestId: rid('leave') });
const afterHostLeaves = await leaveMemberA.client.next((message) => message.type === 'sync'
  && message.players.length === 2);
ok(afterHostLeaves.room.status === 'playing' && afterHostLeaves.room.order.length === 2,
  '三人局一人离开后其余两人继续');
ok(afterHostLeaves.players.some((player) => player.host), '原房主离开后自动递补新房主');

console.log('\n【聊天与历史分离】');
east.inbox.length = 0;
east.send({ type: 'chat', text: '随喜同修', requestId: rid('chat') });
const chat = await north.next((message) => message.type === 'chat' && message.text === '随喜同修');
ok(chat.name === '慧明', '聊天广播到达');
const historyJoin = await join('H3T10', '甲');
historyJoin.client.send({ type: 'chat', text: '历史一句', requestId: rid('chat') });
await historyJoin.client.next((message) => message.type === 'chat');
const later = await join('H3T10', '乙');
ok(later.client.sync.chat.some((message) => message.text === '历史一句'), '后来者首份同步带聊天历史');
historyJoin.client.inbox.length = 0;
later.client.send({ type: 'ready_set', ready: true, requestId: rid('ready') });
const rosterOnly = await historyJoin.client.next((message) => message.type === 'sync');
ok(rosterOnly.chat === undefined, '日常名单同步不重复下发整段聊天');

console.log('\n【密码与满座】');
east.send({ type: 'lock', key: '12', requestId: rid('lock') });
const badKey = await east.next((message) => message.type === 'error' || message.type === 'command_error');
ok(badKey.code === 'badkey', '密码必须为四位数字');
east.send({ type: 'lock', key: '8412', requestId: rid('lock') });
const locked = await east.next((message) => message.type === 'locked');
ok(locked.locked && locked.key === '8412', '房主可设置邀请密码');
const fifth = await join(TABLE, '第五人', null, '8412');
ok(fifth.joined.type === 'error' && fifth.joined.code === 'full', '四个真人座位坐满后拒绝第五人');

// 收摊：断线者使用重连连接离席，其余显式离席，避免污染下一次本地测试。
for (const client of [east, west, north, reconnected, sameName.client, sameName2.client,
  repeatedA.client, repeatedB.client, leaveMemberA.client, leaveMemberB.client,
  historyJoin.client, later.client]) {
  try { client.send({ type: 'leave', requestId: rid('leave') }); } catch {}
}
await wait(350);
for (const client of [...clients, reconnected, sameName.client, sameName2.client,
  repeatedA.client, repeatedB.client, leaveHost.client, leaveMemberA.client, leaveMemberB.client,
  historyJoin.client, later.client, fifth.client]) {
  try { client.ws.close(); } catch {}
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
