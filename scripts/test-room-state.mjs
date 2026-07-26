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

console.log('\n【赠掷续手】');
{
  const room = makeRoom(['a', 'b']);
  Object.assign(room.meta, {
    status: 'playing',
    phase: 'resolving',
    order: ['a', 'b'],
    turnIdx: 0,
    round: 1,
  });
  room.players.a.bonus = 2;
  const completed = await room.completeCurrentTurn('a');
  ok(completed && room.meta.turnIdx === 0, '赠掷未尽不交给下一位');
  ok(room.meta.phase === 'waiting_toss', '同一位回到可掷阶段');
  ok(room.events.some((event) => event.type === 'turn_started' && event.continuation), '广播本手继续事件');
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
