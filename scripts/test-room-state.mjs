// 真人共修房间状态机单测：无需等待真实 WebSocket/闹钟，专测开局、赠掷与共同结算边界。
import { RoomDO } from '../worker/index.js';

let passed = 0;
let failed = 0;
function ok(condition, name) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function makeRoom(ids = ['a', 'b', 'c', 'd']) {
  const sockets = ids.map((id) => ({
    deserializeAttachment: () => ({ playerId: id }),
    send() {},
  }));
  const state = {
    storage: {
      async put() {},
      async setAlarm() {},
    },
    getWebSockets: () => sockets,
    waitUntil() {},
  };
  const room = new RoomDO(state, {});
  room.players = Object.fromEntries(ids.map((id, seat) => [id, {
    id,
    name: id.toUpperCase(),
    seat,
    color: '#e8c766',
    ready: false,
    spectator: false,
    away: false,
    skips: 0,
    pos: null,
    n: 0,
    bonus: 0,
    done: false,
    doneAt: 0,
  }]));
  room.meta = room.freshRoomMeta({ code: 'TEST' });
  room.chat = [];
  room.events = [];
  room.broadcast = (event) => room.events.push(event);
  return room;
}

console.log('\n【共同开局】');
{
  const room = makeRoom(['a', 'b', 'c']);
  room.meta.status = 'finished';
  room.meta.starterSeat = 0;
  room.players.a.ready = true;
  room.players.b.ready = true;
  const started = await room.startMatch();
  ok(started && room.meta.status === 'playing', '两位在线同修可开始下一局');
  ok(room.meta.order.join(',') === 'b,a', '下一局首位按座次轮换');
  ok(room.players.c.spectator && !room.meta.order.includes('c'), '未准备者留为旁观');
  ok(Object.values(room.players).every((player) => !player.ready), '开局后清空准备状态');
}

console.log('\n【房主挂机不锁死开局】');
{
  const room = makeRoom(['a', 'b', 'c']);
  room.players.b.ready = true;
  room.players.c.ready = true;
  room.syncReadyGate();
  ok(!!room.meta.readySince, '两位准备即记下齐备时刻');
  ok(!room.canStartMatch('b'), '刚齐备时仍由房主开局');
  room.meta.readySince = Date.now() - 46_000;
  ok(room.canStartMatch('b'), '房主久未开局后，已准备者也可开局');
  ok(!room.canStartMatch('a'), '未准备者任何时候都不能开局');

  room.players.b.ready = false;
  room.syncReadyGate();
  ok(!room.meta.readySince, '人数退回一位即清掉齐备时刻');
}
{
  // 房主离线：不必再等，剩下的人可以立刻开局
  const room = makeRoom(['a', 'b', 'c']);
  room.state.getWebSockets = () => [
    { deserializeAttachment: () => ({ playerId: 'b' }), send() {} },
    { deserializeAttachment: () => ({ playerId: 'c' }), send() {} },
  ];
  room.players.b.ready = true;
  room.players.c.ready = true;
  room.syncReadyGate();
  ok(room.canStartMatch('b'), '房主离线时无需等待即可开局');
}

console.log('\n【贈掷施与他人】');
{
  // 三人局：掷得贈掷者须在两位莲友中择一位受之（定稿操作规则 giver_selects_other_player）
  const room = makeRoom(['a', 'b', 'c']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'resolving', order: ['a', 'b', 'c'], turnIdx: 0, round: 1, actorId: 'a',
  });
  room.players.a.pendingGrantCount = 2;
  const completed = await room.completeCurrentTurn('a');
  ok(completed && room.meta.phase === 'choosing_grant', '两位以上可施者时先请掷得者择人');
  ok(room.meta.pendingGrant?.giverId === 'a' && room.meta.pendingGrant.count === 2, '待施之贈记名记数');
  ok(room.meta.pendingGrant.candidateIds.join(',') === 'b,c', '候选只列在局且未及第者');
  ok(room.currentPlayerId() === 'a', '择人期间当前操作者仍是施者');

  await room.assignGrant('a', 'c', 2, 'chosen');
  ok(room.meta.turnIdx === 0 && room.currentPlayerId() === 'c', '施与后即由受赠者接掷，轮次未推进');
  ok(room.players.c.bonus === 2 && room.players.a.bonus === 0, '受赠之掷记在受赠者身上，不归施者');
}
{
  // 二人局无可择者：径直施与那一位，不多问一步
  const room = makeRoom(['a', 'b']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'resolving', order: ['a', 'b'], turnIdx: 0, round: 1, actorId: 'a',
  });
  room.players.a.pendingGrantCount = 3;
  await room.completeCurrentTurn('a');
  ok(room.meta.phase === 'waiting_toss' && room.currentPlayerId() === 'b', '只剩一位可施者时径直施与');
  ok(room.players.b.bonus === 3, '受赠三掷记在对方身上');
  ok(room.events.some((e) => e.type === 'grant_given' && e.reason === 'only_candidate'), '施与出公报');
}
{
  // 无人可施：依定稿规则作废，不折回自己续掷
  const room = makeRoom(['a', 'b']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'resolving', order: ['a', 'b'], turnIdx: 0, round: 1, actorId: 'a',
  });
  room.players.b.done = true;
  room.players.a.pendingGrantCount = 2;
  await room.completeCurrentTurn('a');
  ok(room.events.some((e) => e.type === 'grant_void'), '无人可施则此贈作废');
  ok(room.players.a.bonus === 0, '作废之贈不折回施者自己');
}
{
  // 受赠者续掷：队列未尽仍归他，尽了才交下一位
  const room = makeRoom(['a', 'b']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'resolving', order: ['a', 'b'], turnIdx: 0, round: 1, actorId: 'b',
    giftQueue: [{ giverId: 'a', recipientId: 'b', remaining: 1 }],
  });
  const done = await room.completeCurrentTurn('b');
  ok(done && room.meta.phase === 'waiting_toss' && room.currentPlayerId() === 'b', '受赠之掷未尽仍归受赠者');
  ok(room.events.some((event) => event.type === 'turn_started' && event.continuation), '广播本手继续事件');
}
{
  const room = makeRoom(['a', 'b']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'resolving', order: ['a', 'b'], turnIdx: 0, round: 1, actorId: 'b', giftQueue: [],
  });
  await room.completeCurrentTurn('b');
  ok(room.meta.turnIdx === 1, '受赠之掷用尽后轮转到下一位');
}
{
  // 择人超时：按座次取施者之后最近的一位，规则可预期
  const room = makeRoom(['a', 'b', 'c']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'choosing_grant', order: ['a', 'b', 'c'], turnIdx: 0, round: 1, actorId: 'a',
    pendingGrant: { giverId: 'a', count: 1, candidateIds: ['b', 'c'] },
  });
  await room.autoAssignGrant();
  ok(room.currentPlayerId() === 'b', '择人超时按座次施与最近的一位');
  ok(room.events.some((e) => e.type === 'grant_given' && e.reason === 'timeout'), '自动施与也出公报');
}
{
  // 施者离席：待施之贈随之作废，不把全房卡在择人相位
  const room = makeRoom(['a', 'b', 'c']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'choosing_grant', order: ['a', 'b', 'c'], turnIdx: 0, round: 1, actorId: 'a',
    pendingGrant: { giverId: 'a', count: 2, candidateIds: ['b', 'c'] },
  });
  await room.dropPlayer('a', null);
  ok(!room.meta.pendingGrant && room.meta.phase !== 'choosing_grant', '施者离席后不再停在择人相位');
}

console.log('\n【暂离与归队】');
{
  // 连续两手未掷即暂离，轮次跳过；从前只能刷新页面才回得来，现在可自请归队
  const room = makeRoom(['a', 'b', 'c']);
  Object.assign(room.meta, {
    status: 'playing', phase: 'waiting_toss', order: ['a', 'b', 'c'], turnIdx: 0, round: 2,
  });
  room.players.a.away = true;
  room.players.a.skips = 2;
  await room.advanceTurn();
  ok(room.currentPlayerId() === 'b', '暂离者不进入轮次');

  const ws = { deserializeAttachment: () => ({ playerId: 'a' }), send() {} };
  await room.webSocketMessage(ws, JSON.stringify({ type: 'wake', requestId: 'wake:1' }));
  ok(!room.players.a.away && room.players.a.skips === 0, '自请归队即清暂离与超时计数');
  ok(room.events.some((e) => e.type === 'player_back' && e.playerId === 'a'), '归队出公报');
  await room.advanceTurn();
  await room.advanceTurn();
  ok(room.currentPlayerId() === 'a', '归队后下一轮即可接掷');
}

console.log('\n【共同结算】');
{
  const room = makeRoom();
  Object.assign(room.meta, {
    status: 'playing',
    phase: 'resolving',
    order: ['a', 'b', 'c', 'd'],
    turnIdx: 2,
    round: 3,
    finishing: true,
  });
  room.players.c.done = true;
  await room.advanceTurn();
  ok(room.meta.status === 'playing' && room.meta.turnIdx === 3, '首位及第后仍补齐本轮未行动者');
  await room.advanceTurn();
  ok(room.meta.status === 'finished' && room.meta.finishReason === 'completed', '轮次回到首位前统一结算');
  const result = room.events.find((event) => event.type === 'match_finished');
  ok(result?.winners?.join(',') === 'c', '共同结果只列服务器确认的及第者');
}

{
  const room = makeRoom();
  Object.assign(room.meta, {
    status: 'playing',
    phase: 'resolving',
    order: ['a', 'b', 'c', 'd'],
    turnIdx: 0,
    round: 5,
    finishing: true,
  });
  room.players.a.done = true;
  await room.advanceTurn();
  await room.advanceTurn();
  await room.advanceTurn();
  ok(room.meta.status === 'playing' && room.meta.turnIdx === 3, '本轮首位及第时其余三位仍各有一手');
  await room.advanceTurn();
  ok(room.meta.status === 'finished', '完整补齐本轮后结束，不多开下一轮');
}

console.log('\n【断线轮次】');
{
  const room = makeRoom(['a', 'b']);
  room.state.getWebSockets = () => [{
    deserializeAttachment: () => ({ playerId: 'a' }),
    send() {},
  }];
  Object.assign(room.meta, {
    status: 'playing',
    phase: 'resolving',
    order: ['a', 'b'],
    turnIdx: 0,
    round: 1,
  });
  const before = Date.now();
  await room.advanceTurn();
  const wait = room.meta.turnDeadline - before;
  ok(wait >= 29_000 && wait <= 31_000, '轮到已断线同修时只保留三十秒重连窗口');
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
process.exit(failed ? 1 : 0);
