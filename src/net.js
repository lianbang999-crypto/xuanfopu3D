// 共修室 · 真人共同对局客户端
// 职责：连接/重连、准备与轮次状态、服务器权威掷轮、共同结算、密码邀请和聊天。
// 3D 棋珠与轮动画仍由 game.js 呈现；本模块不在客户端裁定棋况。
import { quickShare, shareUrl } from './share.js';
import { SFP_PROTOCOL_VERSION } from './sfp-engine.js';

const NET_KEY = 'sm10.net.v2';
const OLD_NET_KEY = 'sm10.net.v1';
const CLIENT_KEY = 'sm10.net.client.v1';
const TAB_KEY = 'sm10.net.tab.v1';
const ACTIVE_KEY = 'sm10.net.active.v1';
const ACTIVE_LEASE_MS = 120_000; // 后台标签页计时会被节流；两分钟租约仍可可靠阻止跨页重复占房
const ACTIVE_STALE_MS = 20_000;  // 心跳五秒一次；超过此数多半是那个页面已崩溃/强退，可提示用户接管
const CHAT_GAP_MS = 750;         // 与服务端 CHAT_GAP_MS 同刻度：在本地先拦，免得字被发丢
const CHAT_STICK_PX = 48;        // 距底不足此数即视为「正贴着底看」，新消息才自动滚

function stableId(storage, key, prefix) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const value = `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random().toString(36).slice(2)}`}`;
    storage.setItem(key, value);
    return value;
  } catch (e) {
    return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function requestId(prefix = 'cmd') {
  if (globalThis.crypto?.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

const EMPTY_ROOM = {
  protocolVersion: SFP_PROTOCOL_VERSION,
  revision: 0,
  status: 'waiting',
  phase: 'waiting_toss',
  matchId: '',
  order: [],
  turnId: '',
  turnIdx: 0,
  round: 0,
  availableAt: 0,
  turnDeadline: 0,
  startOpenAt: 0,
  gift: null,
  pendingGrant: null,
  finishing: false,
  finishedAt: 0,
  finishReason: '',
};

export const Net = {
  active: false,
  myId: null,
  mySeat: -1,
  myColor: '#e8c766',
  myName: '',
  code: '',
  key: '',
  locked: false,
  players: [],
  room: { ...EMPTY_ROOM },
  ws: null,

  _manualLeave: false,
  _retry: 0,
  _unread: 0,
  _pendingToss: '',
  _pendingGrant: '',
  _grantTick: 0,
  _chatAt: 0,
  _chatHint: null,
  _startGate: 0,
  _pendingReady: null,
  _pendingStart: '',
  _connState: 'ok',
  _lastFocused: null,
  _joinPromise: null,
  _joinCode: '',
  _joinSeq: 0,
  _leaseTimer: 0,
  clientToken: '',
  tabToken: '',

  onRoster: null,
  onJoined: null,
  onState: null,
  onToss: null,
  onMatchStarted: null,
  onMatchFinished: null,
  onCommandError: null,
  onLocked: null,
  onHall: null,
  onLeft: null,
  zh: (s) => s,
  _toastCb: null,
  // 确认由宿主提供站内卡片（见 game.js confirmLeaveMatch）；未接线时退回原生弹窗，不至于静默放行
  _confirmCb: (what) => Promise.resolve(window.confirm(`${what}？`)),

  isHost() { return this.mySeat === 0; },
  // 房主挂机不该锁死全房：房主离线、或人已齐备等够时长，任一已准备者都可开局
  canStart() {
    if (!this.me()?.ready) return false;
    if (this.isHost()) return true;
    const openAt = Number(this.room.startOpenAt || 0);
    return !!openAt && Date.now() >= openAt;
  },
  // 全站只称「共修室N」；H1T2 这类内部码只在需要口报或手输处作次级信息
  roomLabel(code = this.code) {
    const at = /^H(\d+)T(\d+)$/i.exec(String(code || ''));
    if (!at) return code ? `房间 ${code}` : '共修室';
    const ord = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][Number(at[2]) - 1];
    return ord ? `共修室${ord}` : `共修室 ${at[2]}`;
  },
  isPlaying() { return this.room.status === 'playing'; },
  isFinished() { return this.room.status === 'finished'; },
  me() { return this.players.find((p) => p.id === this.myId) || null; },
  turnPlayer() { return this.players.find((p) => p.id === this.room.turnId) || null; },
  myTurn() { return this.isPlaying() && this.room.turnId === this.myId; },
  // 中途入室者不在本局行动序列里，只候下一局——不能拿轮次话术糊弄他
  isSpectator() { return this.isPlaying() && !!this.me()?.spectator; },
  // 「暂离」只在局中有意义：本局已结算还挂着「我回来了」，等于让人回一个已经不存在的局
  isAway() { return this.isPlaying() && !!this.me()?.away; },
  playerName(id) { return this.players.find((p) => p.id === id)?.name || '同修'; },
  // 我是否正被请去择一位受赠莲友
  myGrantChoice() {
    const pending = this.room.pendingGrant;
    if (!pending || this.room.phase !== 'choosing_grant') return null;
    return pending.giverId === this.myId ? pending : null;
  },
  // 本手是不是在用受赠之掷
  myGiftLeft() {
    const gift = this.room.gift;
    return gift && gift.recipientId === this.myId ? Math.max(0, Number(gift.remaining) || 0) : 0;
  },
  canToss() {
    return this.active
      && this._connState === 'ok'
      && this.myTurn()
      && this.room.phase === 'waiting_toss'
      && Date.now() >= Number(this.room.availableAt || 0)
      && !this._pendingToss
      && !this.me()?.done
      && !this.me()?.away
      && !this.me()?.spectator;
  },
  turnHint() {
    if (!this.active) return '请先进入共修室';
    if (this._connState !== 'ok') return '连接恢复后方可掷轮';
    if (!this.isPlaying()) {
      if (!this.isFinished()) return '请先准备，等待共同开局';
      return this.room.finishReason === 'not_enough_players'
        ? '本局已中止，请准备下一局'
        : '本局已共同结算，请准备下一局';
    }
    if (this.isSpectator()) return '本局已开局 · 您在下一局入座';
    if (this.isAway()) return '您已暂离本局 · 点此归队';
    if (this.room.phase === 'choosing_grant') {
      return this.myGrantChoice()
        ? '请择一位莲友受此贈掷'
        : `${this.playerName(this.room.pendingGrant?.giverId)}正在择人受贈`;
    }
    if (this.room.phase === 'resolving') return '上一掷正在行棋';
    if (Date.now() < Number(this.room.availableAt || 0)) return '共同开局倒计时中';
    if (!this.myTurn()) return `请候「${this.turnPlayer()?.name || '同修'}」行谱`;
    return '请稍候';
  },

  _wsUrl(code) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/room/${code}/ws`;
  },

  // 一人同时只占一座：另一个页面正在房里就不放行。
  // 但持租的页面若是崩溃/强退（pagehide 没跑到），租约会白挂两分钟——
  // 心跳是五秒一次，故超过 STALE 即视为那边已死，本页可直接接管，不叫人干等。
  _claimLocalRoom(code, force = false) {
    const now = Date.now();
    try {
      const lease = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      const age = now - Number(lease?.ts || 0);
      if (!force && lease?.tab && lease.tab !== this.tabToken && age < ACTIVE_LEASE_MS) {
        this._staleLease = age >= ACTIVE_STALE_MS;   // 供上层提示「上个页面已关闭？」
        return false;
      }
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ code, tab: this.tabToken, ts: now }));
    } catch (e) {}
    this._staleLease = false;
    return true;
  },
  // 用户确认另一页面已关闭后，强行接管本机的「在房」标记
  takeOverLocalRoom() {
    try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    this._staleLease = false;
  },
  _touchLocalRoom() {
    if (!this.code && !this._joinCode) return;
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        code: this.code || this._joinCode,
        tab: this.tabToken,
        ts: Date.now(),
      }));
    } catch (e) {}
  },
  _releaseLocalRoom() {
    try {
      const lease = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      if (!lease?.tab || lease.tab === this.tabToken) localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {}
  },

  joinRoom(code, name, playerId = null, key = '') {
    code = String(code || '').toUpperCase();
    const reconnecting = this.active && !!playerId && this.code === code;
    if (this.active && !reconnecting) {
      return Promise.reject(new Error(
        this.code === code ? '您已经在这个共修室' : `您已在${this.roomLabel()}，请先离开再换房`,
      ));
    }
    if (this._joinPromise) {
      if (this._joinCode === code) return this._joinPromise;
      return Promise.reject(new Error(`正在进入${this.roomLabel(this._joinCode)}，请稍候`));
    }
    if (!this._claimLocalRoom(code)) {
      const err = new Error('您已在另一个页面进入共修室；一个人同一时间只能进入一个房间');
      err.code = 'other_tab';
      err.stale = !!this._staleLease;   // 那个页面很可能已经关了，可询问后接管
      return Promise.reject(err);
    }

    const attempt = ++this._joinSeq;
    this._joinCode = code;
    const pending = new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this._wsUrl(code));
      this.ws = ws;
      this._manualLeave = false;

      ws.onopen = () => {
        if (attempt !== this._joinSeq) { try { ws.close(); } catch (e) {} return; }
        ws.send(JSON.stringify({
          type: 'join',
          protocolVersion: SFP_PROTOCOL_VERSION,
          name,
          playerId,
          key,
          clientToken: this.clientToken,
        }));
      };

      ws.onmessage = (event) => {
        if (attempt !== this._joinSeq) { try { ws.close(); } catch (e) {} return; }
        let message;
        try { message = JSON.parse(event.data); } catch (e) { return; }
        if (message.type === 'joined') {
          if (Number(message.protocolVersion || 0) !== SFP_PROTOCOL_VERSION) {
            if (!settled) {
              settled = true;
              reject(new Error('联机协议版本不一致，请刷新页面'));
            }
            try { ws.close(); } catch (e) {}
            return;
          }
          this.active = true;
          this.myId = message.playerId;
          this.mySeat = message.seat;
          this.myColor = message.color;
          this.myName = name;
          this.code = code;
          this.key = key || '';
          this._retry = 0;
          this._setConnState('ok');
          this._touchLocalRoom();
          try {
            localStorage.setItem(NET_KEY, JSON.stringify({ code, playerId: message.playerId, name, key }));
            localStorage.removeItem(OLD_NET_KEY);
          } catch (e) {}
          if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname);
          this._uiRoomSync();
          this.onJoined?.({ reconnecting });
          if (!settled) { settled = true; resolve(message); }
          return;
        }
        if (message.type === 'error') {
          if (!settled) { settled = true; reject(new Error(message.text || message.code)); }
          this._toastCb?.(message.text || message.code);
          try { ws.close(); } catch (e) {}
          return;
        }
        this._handle(message);
      };

      ws.onclose = () => {
        if (attempt !== this._joinSeq) {
          if (!settled) { settled = true; reject(new Error('入座已取消')); }
          return;
        }
        if (this._manualLeave) return;
        if (!this.active) {
          if (!settled) {
            settled = true;
            reject(new Error('连接未成——请确认房号或稍后再试'));
          }
          return;
        }
        if (!settled) settled = true;
        if (this._retry < 6) {
          this._retry++;
          const wait = Math.min(8000, 500 * (2 ** this._retry));
          this._setConnState('reconnecting');
          setTimeout(() => {
            if (!this.active || this._manualLeave) return;
            this.joinRoom(this.code, this.myName, this.myId, this.key).catch(() => {});
          }, wait);
        } else {
          this._setConnState('lost');
        }
      };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    });
    this._joinPromise = pending.finally(() => {
      if (attempt !== this._joinSeq) return;
      this._joinPromise = null;
      this._joinCode = '';
      if (!this.active) this._releaseLocalRoom();
    });
    return this._joinPromise;
  },

  leave({ notify = true } = {}) {
    this._manualLeave = true;
    this._joinSeq++;
    this._joinPromise = null;
    this._joinCode = '';
    this._send({ type: 'leave', requestId: requestId('leave') }, false);
    const old = this.ws;
    // 换室需要确认旧连接已经由服务器关闭，不能再猜一个固定的 260ms。
    // 普通离席仍立即清前台并回大厅；返回的 Promise 只供换室流程等待。
    const closed = old && old.readyState < WebSocket.CLOSING
      ? new Promise((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        old.addEventListener('close', done, { once: true });
        setTimeout(() => {
          try { old.close(); } catch (e) {}
          done();
        }, 1200);
      })
      : Promise.resolve();
    this.active = false;
    this.myId = null;
    this.mySeat = -1;
    this.players = [];
    this.room = { ...EMPTY_ROOM };
    this.code = '';
    this.key = '';
    this.locked = false;
    this._pendingToss = '';
    this._pendingReady = null;
    this._pendingStart = '';
    this._pendingGrant = '';
    this._grantSync();
    try {
      localStorage.removeItem(NET_KEY);
      localStorage.removeItem(OLD_NET_KEY);
    } catch (e) {}
    this._releaseLocalRoom();
    this.closePanel();
    this._uiRoomSync();
    this.onRoster?.([]);
    this.onState?.(this.room);
    if (notify) this.onLeft?.();
    return closed;
  },

  savedRoom() {
    try {
      return JSON.parse(localStorage.getItem(NET_KEY) || localStorage.getItem(OLD_NET_KEY) || 'null');
    } catch (e) {
      return null;
    }
  },

  _send(payload, notify = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (notify) this._toastCb?.('连接尚未恢复，此操作没有送出');
      return false;
    }
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      if (notify) this._toastCb?.('网络发送失败，请稍后重试');
      return false;
    }
  },

  setReady(ready) {
    if (this._pendingReady || !this.active || this.room.status === 'playing') return false;
    const id = requestId('ready');
    const value = !!ready;
    if (!this._send({ type: 'ready_set', ready: value, requestId: id })) return false;
    this._pendingReady = { id, value };
    this._uiRoomSync();
    window.setTimeout(() => {
      if (this._pendingReady?.id !== id) return;
      this._pendingReady = null;
      this._uiRoomSync();
      this._toastCb?.(this.zh('准备状态确认超时，请再点一次'));
    }, 6000);
    return true;
  },
  startMatch() {
    if (this._pendingStart || !this.active || !this.isHost() || this.room.status === 'playing') return false;
    const id = requestId('start');
    if (!this._send({ type: 'start_match', requestId: id })) return false;
    this._pendingStart = id;
    this._uiRoomSync();
    window.setTimeout(() => {
      if (this._pendingStart !== id) return;
      this._pendingStart = '';
      this._uiRoomSync();
      this._toastCb?.(this.zh('开局确认超时，请再试一次'));
    }, 8000);
    return true;
  },
  requestToss() {
    if (!this.canToss()) {
      this._toastCb?.(this.zh(this.turnHint()));
      return false;
    }
    const id = requestId('toss');
    if (!this._send({ type: 'toss_request', requestId: id })) return false;
    this._pendingToss = id;
    this._uiRoomSync();
    return true;
  },
  finishTurn() {
    return this._send({ type: 'turn_done', requestId: requestId('done') });
  },
  // 择受赠者：贈掷不归自己，由掷得者施与同席一位莲友（本项目定稿操作规则）
  chooseGrant(recipientId) {
    if (!this.myGrantChoice() || this._pendingGrant) return false;
    const id = requestId('grant');
    if (!this._send({ type: 'grant_choose', recipientId, requestId: id })) return false;
    this._pendingGrant = id;
    this._grantSync();
    window.setTimeout(() => {
      if (this._pendingGrant !== id) return;
      this._pendingGrant = '';
      this._grantSync();
    }, 6000);
    return true;
  },
  // 暂离归队：超时两手会被移出行动序列，这里给一条自助回来的路
  wakeUp() {
    if (!this.active || !this.isAway()) return false;
    return this._send({ type: 'wake', requestId: requestId('wake') });
  },
  // 服务器每 750ms 才收一条。从前前台照发不误，被拒的那条连同用户敲的字一起没了，
  // 只剩一句「说话稍慢一些」——所以限流改在发出之前判，字一直留在输入框里。
  sendChat(text) {
    const now = Date.now();
    const wait = CHAT_GAP_MS - (now - this._chatAt);
    if (wait > 0) {
      this._chatHint?.(`稍候 ${Math.ceil(wait / 100) / 10} 秒再发`);
      return false;
    }
    if (!this._send({ type: 'chat', text, requestId: requestId('chat') })) return false;
    this._chatAt = now;
    return true;
  },
  setKey(key) { return this._send({ type: 'lock', key, requestId: requestId('lock') }); },
  clearKey() { return this._send({ type: 'lock', off: true, requestId: requestId('unlock') }); },

  _applyState(message) {
    if (Array.isArray(message.players)) this.players = message.players;
    if (message.room) this.room = { ...EMPTY_ROOM, ...message.room };
    if (typeof message.locked === 'boolean') this.locked = message.locked;
    const me = this.me();
    if (me) {
      this.mySeat = me.seat;
      this.myColor = me.color || this.myColor;
      if (this._pendingReady && me.ready === this._pendingReady.value) this._pendingReady = null;
    }
    if (this.room.status === 'playing') this._pendingStart = '';
    if (this.room.phase !== 'choosing_grant') this._pendingGrant = '';
    this._uiRoomSync();
    this._grantSync();
    this._pillSync();
    this.onRoster?.(this.players);
    this.onState?.(this.room);
  },

  _handle(message) {
    switch (message.type) {
      case 'sync':
        if (message.chat) this._chatFill(message.chat);
        this._applyState(message);
        break;
      case 'locked':
        this.locked = !!message.locked;
        if (message.locked && message.key) this.key = message.key;
        if (!message.locked) this.key = '';
        try {
          const saved = this.savedRoom() || {};
          localStorage.setItem(NET_KEY, JSON.stringify({ ...saved, code: this.code, key: this.key }));
        } catch (e) {}
        this._uiRoomSync();
        this.onLocked?.(this.locked, this.key);
        break;
      case 'match_started':
        this._pendingToss = '';
        this._pendingReady = null;
        this._pendingStart = '';
        this._applyState(message);
        this._sysMsg('本局共同开局');
        this.onMatchStarted?.(message);
        break;
      case 'turn_started':
        this._pendingToss = '';
        this._applyState(message);
        break;
      case 'toss_committed':
        if (message.requestId === this._pendingToss || message.playerId === this.myId) this._pendingToss = '';
        this._applyState(message);
        this.onToss?.(message);
        if (message.playerId !== this.myId) {
          const last = message.steps?.[message.steps.length - 1];
          this._sysMsg(`${message.name}掷得「${message.combo}」${last?.text ? ` · ${last.text}` : ''}`);
        }
        break;
      case 'turn_skipped':
        this._sysMsg(`${message.name || '同修'}本手超时${message.away ? '，已暂离行动序列' : '，轮次顺延'}`);
        if (message.playerId === this.myId && message.away) {
          this._toastCb?.(this.zh('您连续两手未掷，已暂离本局——点掷轮钮即可归队，下一轮接着掷'));
        }
        break;
      case 'grant_pending':
        this._applyState(message);
        if (!this.myGrantChoice()) {
          this._sysMsg(`${this.playerName(message.room?.pendingGrant?.giverId)}正在择一位莲友受贈`);
        }
        break;
      case 'grant_given': {
        const mine = message.recipientId === this.myId;
        const byMe = message.giverId === this.myId;
        const how = message.reason === 'timeout' ? '（择人超时，按座次施与）' : '';
        this._sysMsg(`${message.giverName}将「贈${'一二三四'[Math.max(1, message.count) - 1]}掷」施与${message.recipientName}${how}`);
        if (mine) this._toastCb?.(this.zh(`${message.giverName}把贈掷施与您——请在本位续掷`));
        else if (byMe) this._toastCb?.(this.zh(`已施与${message.recipientName}`));
        break;
      }
      case 'grant_void':
        this._sysMsg(`${message.name || '同修'}掷得贈掷，然无人可施，此贈作废`);
        break;
      case 'player_back':
        this._sysMsg(`${message.name || '同修'}已归队`);
        break;
      case 'match_finished':
        this._pendingToss = '';
        this._applyState(message);
        // 结算画面由宿主给（及第面板／共同结算卡，各带下一步操作），此处不再自动掀开面板抢版面
        this.onMatchFinished?.(message);
        break;
      case 'command_error':
        if (message.requestId && message.requestId === this._pendingToss) this._pendingToss = '';
        if (message.requestId && message.requestId === this._pendingReady?.id) this._pendingReady = null;
        if (message.requestId && message.requestId === this._pendingStart) this._pendingStart = '';
        if (message.room) this._applyState(message);
        this._toastCb?.(this.zh(message.text || '此操作未成功'));
        this.onCommandError?.(message);
        break;
      case 'chat':
        this._chatPush(message);
        break;
    }
  },

  init({ toast, zh, confirm }) {
    if (toast) this._toastCb = toast;
    if (zh) this.zh = zh;
    if (confirm) this._confirmCb = confirm;
    this.clientToken = stableId(localStorage, CLIENT_KEY, 'person');
    this.tabToken = stableId(sessionStorage, TAB_KEY, 'tab');
    clearInterval(this._leaseTimer);
    this._leaseTimer = window.setInterval(() => this._touchLocalRoom(), 5000);
    window.addEventListener('pagehide', () => this._releaseLocalRoom());
    this._buildUi();
    const match = location.hash.match(/^#r=([A-Za-z0-9]{4,8})(?:\.(\d{4}))?$/);
    this.invited = match ? { code: match[1].toUpperCase(), key: match[2] || '' } : null;
  },

  async acceptInvite(name) {
    if (!this.invited) return null;
    const { code, key } = this.invited;
    await this.joinRoom(code, name, null, key);
    this.invited = null;
    return code;
  },

  _setConnState(state) {
    const changed = this._connState !== state;
    this._connState = state;
    document.querySelectorAll('.netEntry').forEach((button) => button.classList.toggle('warn', state !== 'ok'));
    if (!changed) return;
    if (state === 'reconnecting') this._toastCb?.('联机断线，正在重连…');
    if (state === 'lost') this._toastCb?.('联机连接已断——请重新进入共修室');
    this._uiRoomSync();
  },

  _buildUi() {
    const css = document.createElement('style');
    css.textContent = `
#netDismiss{position:fixed;inset:0;z-index:31;display:none;background:transparent;touch-action:manipulation}
#netDismiss.on{display:block}
#netPanel,#netKey{font-family:'SmileySans',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
#netPanel input,#netPanel button,#netKey input,#netKey button{font-family:inherit}
#netPanel{position:fixed;left:12px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:32;width:min(390px,calc(100vw - 24px));
  height:min(600px,calc(100dvh - 164px));max-height:min(600px,calc(100dvh - 164px));display:none;flex-direction:column;background:rgba(16,19,28,.97);border:1px solid rgba(216,197,139,.42);
  border-radius:16px;overflow:hidden;overscroll-behavior:contain;backdrop-filter:blur(12px);font-size:var(--fs-md);color:#e8e2d0;box-shadow:0 18px 50px rgba(0,0,0,.38)}
#netPanel.on{display:flex}
#netHead{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-bottom:1px solid rgba(216,197,139,.18);min-height:40px;flex:none}
#netHead b{letter-spacing:2px;color:#d8c58b}
#netHead .code{margin-left:auto;border:0;background:none;font:inherit;color:#96e1d6;letter-spacing:.5px;cursor:pointer;font-size:var(--fs-sm);padding:8px 4px}
#netHead .code:hover,#netHead .code:focus-visible{color:#b9f0e6}
#netLeaveBtn{min-width:60px;height:44px;flex:none;border:1px solid rgba(217,136,115,.3);background:rgba(217,136,115,.08);color:#d9a08f;border-radius:10px;cursor:pointer}
#netMinBtn{width:40px;height:40px;flex:none;border:0;background:transparent;color:#9aa3b5;border-radius:10px;cursor:pointer;font-size:20px}
#netMinBtn:hover{background:rgba(255,255,255,.06);color:#e8e2d0}
#netRoomState{flex:none;padding:8px 12px;color:#cfc7ad;line-height:1.5}
#netRoomState b{color:#e8c766}
/* 面板是定高的：名单、指引、聊天三处可压缩（flex:0 1 auto + min-height:0），
   准备/开局、聊天输入、密码邀请大厅三排永远 flex:none——空间不够时宁可挤掉说明文字，
   也不能把操作按钮挤出面板（overflow:hidden 会让它们彻底点不到）。
   指引从一个带框两步图降为按钮下的一行小字：状态行已报人数、按钮上已写「共同开局 · N 人」，
   同一件事说三遍徒占版面（§5.0b 信息只出一次）。 */
#netGuide{flex:0 1 auto;min-height:0;overflow:hidden;padding:0 12px 9px}
#netGuide[hidden]{display:none}
#netGuide p{margin:0;color:#9aa3b5;font-size:var(--fs-sm);line-height:1.5}
#netGuideAct{display:block;width:100%;min-height:44px;margin-top:8px;border-radius:10px;cursor:pointer;
  border:1px solid rgba(232,199,102,.58);background:rgba(232,199,102,.2);color:#e8c766;font:inherit;font-size:var(--fs-sm);letter-spacing:2px}
#netGuideAct[hidden]{display:none}
#netRoster{display:flex;flex:0 1 auto;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(216,197,139,.14);min-height:0;max-height:104px;overflow-y:auto;overscroll-behavior:contain}
.netP{display:flex;align-items:center;gap:5px;padding:6px 9px;min-height:30px;border-radius:15px;background:rgba(255,255,255,.05);border:1px solid transparent;max-width:100%}
.netP.turn{border-color:rgba(232,199,102,.8);box-shadow:0 0 10px rgba(232,199,102,.22)}
.netP.off{opacity:.48}.netP.away{opacity:.62}
.netP .dot{width:9px;height:9px;border-radius:50%;flex:none}
.netP .role{flex:none;font-size:var(--fs-xs);color:#e8c766;letter-spacing:1px}
.netP .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:76px}
.netP .st{color:#9aa3b5;font-size:var(--fs-xs);white-space:nowrap}
#netRoundActions{display:flex;flex:none;gap:8px;padding:9px 12px;border-bottom:1px solid rgba(216,197,139,.14)}
#netPanel.is-playing #netRoundActions{display:none}
#netRoundActions button,#netBtns button{min-height:46px;border-radius:10px;cursor:pointer;border:1px solid rgba(216,197,139,.32);background:rgba(255,255,255,.05);color:#cfc7ad}
#netRoundActions button{flex:1}
#netRoundActions button.pri,#netBtns button.pri{background:rgba(232,199,102,.2);color:#e8c766;border-color:rgba(232,199,102,.58)}
#netRoundActions button:disabled{opacity:.42;cursor:not-allowed}
/* 聊天区不再另立标题：下面就是聊天，「共修聊天」四字是废话。这一行只留隐私说明，
   翻历史时借同一位置报新消息（§5.0b 信息只出一次）。 */
#netChatHead{display:flex;align-items:center;justify-content:flex-end;flex:none;padding:6px 12px 4px;
  border-top:1px solid rgba(216,197,139,.14);color:#9aa3b5;font-size:var(--fs-xs)}
#netMsgs{flex:1 1 0;min-height:0;overflow-y:auto;padding:5px 12px 8px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch}
@media (min-height:640px){#netMsgs{min-height:70px}}
#netPanel.is-waiting #netMsgs,#netPanel.is-finished #netMsgs{min-height:64px}
.netM{display:flex;flex-direction:column;align-items:flex-start;line-height:1.45;word-break:break-word}
.netM.mine{align-items:flex-end}.netM .who{margin:0 4px 3px;color:#9aa3b5;font-size:var(--fs-xs)}
.netM .bubble{display:block;max-width:86%;padding:8px 10px;border-radius:5px 13px 13px 13px;background:rgba(255,255,255,.07);color:#e8e2d0}
.netM.mine .bubble{border-radius:13px 5px 13px 13px;background:rgba(232,199,102,.15);color:#f0e5c1}
.netM.sys{display:block;align-self:center;color:#8c93a1;font-size:var(--fs-xs);text-align:center;padding:2px 8px}
.netEmpty{margin:auto;text-align:center;color:#737986;font-size:var(--fs-sm);line-height:1.6}
#netQuick{display:flex;flex:none;gap:8px;padding:6px 12px 0;overflow-x:auto}
#netPanel.is-waiting #netQuick,#netPanel.is-finished #netQuick{display:none}
#netQuick button{min-height:44px;white-space:nowrap;border:1px solid rgba(216,197,139,.28);background:rgba(255,255,255,.04);color:#cfc7ad;border-radius:12px;padding:7px 12px;cursor:pointer}
/* 翻看历史时新消息不抢滚动：提示就借聊天标题行右端那句话的位置，不另起浮层 */
#netNew{border:0;background:none;padding:0;color:#9aa3b5;font:inherit;font-size:var(--fs-xs);cursor:default}
#netNew.has{color:#e8c766;cursor:pointer;letter-spacing:1px}
#netInput{position:relative;display:flex;flex:none;gap:8px;padding:9px 10px;border-top:1px solid rgba(216,197,139,.18)}
#netChatHint{position:absolute;left:12px;bottom:calc(100% + 2px);color:#d9a08f;font-size:var(--fs-xs);letter-spacing:.5px;pointer-events:none}
#netChatHint:empty{display:none}
#netInput input{flex:1;min-width:0;min-height:44px;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.28);border-radius:10px;color:#efe9d8;padding:9px 11px;font-size:16px;outline:none}
#netInput input:focus{border-color:rgba(232,199,102,.65);box-shadow:0 0 0 2px rgba(232,199,102,.1)}
#netInput button{min-width:64px;min-height:44px;border:1px solid rgba(216,197,139,.4);background:rgba(216,197,139,.16);color:#d8c58b;border-radius:10px;cursor:pointer}
#netBtns{display:flex;flex:none;gap:8px;padding:0 12px 10px}#netBtns button{flex:1;font-size:var(--fs-sm)}
#netGrab{display:none;height:22px;flex:none;cursor:grab;position:relative;touch-action:none}
#netGrab::after{content:'';position:absolute;left:50%;top:8px;width:44px;height:4px;border-radius:2px;background:rgba(216,197,139,.45);transform:translateX(-50%)}
#netKey{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(8,10,15,.72);backdrop-filter:blur(4px)}
#netKey.on{display:flex}
#netKeyCard{width:min(320px,88vw);background:rgba(18,21,30,.98);border:1px solid rgba(216,197,139,.4);border-radius:16px;padding:20px 18px;color:#e8e2d0}
#netKeyCard .x{float:right;min-width:44px;min-height:44px;background:none;border:none;color:#9aa3b5;font-size:var(--fs-lg);cursor:pointer}
#netKeyCard h3{margin:0 0 4px;letter-spacing:3px;color:#d8c58b}#netKeyCard .sub{color:#9aa3b5;font-size:var(--fs-sm);margin-bottom:14px;line-height:1.6}
#netKeyCard input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.3);border-radius:9px;padding:12px;color:#f0ead8;font-size:26px;letter-spacing:14px;text-indent:14px;text-align:center}
#netKeyCard .err{color:#d98873;font-size:var(--fs-sm);min-height:18px;margin-top:8px}
#netKeyCard .big{display:block;width:100%;min-height:44px;margin-top:8px;border-radius:11px;font-size:var(--fs-md);cursor:pointer;border:1px solid rgba(216,197,139,.4);background:rgba(255,255,255,.05);color:#cfc7ad}
#netKeyCard .big.pri{background:rgba(232,199,102,.2);color:#e8c766;border-color:rgba(232,199,102,.6)}
/* 择受赠者：贈掷不归自己，掷得者须择一位同席莲友受之（本项目定稿操作规则） */
#netGrant{position:fixed;inset:0;z-index:62;display:none;align-items:center;justify-content:center;
  padding:16px;background:rgba(8,10,15,.78);backdrop-filter:blur(5px);
  font-family:'SmileySans',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
#netGrant.on{display:flex}
#netGrantCard{width:min(360px,92vw);box-sizing:border-box;background:rgba(18,21,30,.98);
  border:1px solid rgba(232,199,102,.5);border-radius:16px;padding:20px 18px 16px;color:#e8e2d0}
#netGrantCard .ngEyebrow{color:#a99560;font-size:var(--fs-xs);letter-spacing:2px}
#netGrantCard h3{margin:4px 0 6px;letter-spacing:3px;color:#f0dfa8;font-size:var(--fs-lg)}
#netGrantCard .ngCount{color:#e8c766}
#netGrantCard .ngSub{color:#9aa3b5;font-size:var(--fs-sm);line-height:1.65;margin-bottom:13px}
#ngList{display:flex;flex-direction:column;gap:8px}
.ngWho{display:flex;align-items:center;gap:9px;width:100%;min-height:52px;padding:9px 12px;cursor:pointer;
  border:1px solid rgba(216,197,139,.32);border-radius:12px;background:rgba(255,255,255,.05);
  color:#e8e2d0;font:inherit;text-align:left}
.ngWho:hover:not(:disabled),.ngWho:focus-visible:not(:disabled){border-color:rgba(232,199,102,.7);background:rgba(232,199,102,.1)}
.ngWho:disabled{opacity:.5;cursor:wait}
.ngWho .dot{width:10px;height:10px;border-radius:50%;flex:none}
.ngWho .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ngWho .st{color:#9aa3b5;font-size:var(--fs-xs);white-space:nowrap}
#netGrantCard .ngNote{margin-top:11px;color:#8c93a1;font-size:var(--fs-xs);text-align:center;line-height:1.6}
#netGrantCard .ngNote b{color:#e8c766;font-weight:500;font-variant-numeric:tabular-nums}
.netDots{display:flex;gap:7px;align-items:center}.netDots .pd{width:9px;height:9px;border-radius:50%;background:currentColor;flex:none}.netDots .pd.off{opacity:.3}
.netDots .pd.turn{animation:pdPulse 1.6s ease-in-out infinite}@keyframes pdPulse{0%,100%{box-shadow:0 0 3px currentColor}50%{box-shadow:0 0 10px currentColor,0 0 16px currentColor}}
@media (prefers-reduced-motion:reduce){.netDots .pd.turn{animation:none}}
@media (max-width:520px){
  #netPanel{left:0;right:0;bottom:var(--kb,0px);width:100%;height:min(70dvh,560px);max-height:calc(100dvh - 18px);border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none}
  #netPanel.is-waiting,#netPanel.is-finished{height:min(84dvh,600px)}
  #netPanel.is-waiting #netMsgs,#netPanel.is-finished #netMsgs{min-height:36px}
  body.sfpOn #netPanel{bottom:calc(var(--kb,0px) + 92px);height:min(70dvh,520px);max-height:calc(100dvh - 112px)}
  /* 上滑全屏必须压过 body.sfpOn 的定高，否则局中「全屏」只挪了位置、高度纹丝不动，
     被挤掉的输入框和按钮也就永远回不来。两个选择器并列：局中那条特异性更高，稳赢。 */
  body.sfpOn #netPanel.full,#netPanel.full{bottom:var(--kb,0px);height:calc(100dvh - 28px);max-height:calc(100dvh - 28px)}
  #netGrab{display:block}#netInput{padding-bottom:9px}
  #netRoster{max-height:74px}
  #netBtns{padding-bottom:calc(10px + env(safe-area-inset-bottom))}
}
@media (max-width:520px) and (max-height:700px){
  #netQuick{display:none}
  #netRoster{max-height:58px;overflow-y:auto}
}`;
    document.head.appendChild(css);

    this.$dismiss = el('<div id="netDismiss" aria-hidden="true"></div>');
    document.body.appendChild(this.$dismiss);
    this.$dismiss.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closePanel();
    });

    // 兼容旧的未读徽标查询；可见入口仍由 game.js 内的 .netEntry 提供。
    this.$btn = el('<button id="netChatBtn" style="display:none!important" aria-hidden="true"><i></i></button>');
    document.body.appendChild(this.$btn);

    this.$panel = el(`<section id="netPanel" role="dialog" aria-modal="false" aria-label="真人共修室">
      <div id="netGrab" title="上滑全屏 · 下滑收起"></div>
      <div id="netHead"><b></b><button class="code" type="button" title="点按复制房号，可口头报给莲友"></button><button id="netLeaveBtn" aria-label="离开共修室" title="离席并让出座位">离席</button><button id="netMinBtn" aria-label="收起真人共修面板" title="收起">⌄</button></div>
      <div id="netRoomState" aria-live="polite"></div>
      <div id="netRoster" aria-label="本室成员"></div>
      <div id="netRoundActions"><button id="netReadyBtn"></button><button id="netStartBtn" class="pri"></button></div>
      <div id="netGuide" aria-live="polite"><p></p><button id="netGuideAct" type="button" hidden></button></div>
      <div id="netChatHead"><button id="netNew" type="button">仅本室可见</button></div>
      <div id="netMsgs" role="log" aria-live="polite" aria-relevant="additions" aria-label="聊天消息"></div>
      <div id="netQuick"><button>南無阿彌陀佛</button><button>隨喜讚歎 🙏</button></div>
      <div id="netInput"><input maxlength="200" aria-label="聊天内容" placeholder="说一句…"><button aria-label="发送聊天">发送</button><span id="netChatHint" aria-live="polite"></span></div>
      <div id="netBtns"><button id="netKeyBtn">密码</button><button id="netInvBtn" class="pri">邀请</button><button id="netHallBtn">大厅</button></div>
    </section>`);
    document.body.appendChild(this.$panel);
    this.$msgs = this.$panel.querySelector('#netMsgs');
    this.$roster = this.$panel.querySelector('#netRoster');
    this.$state = this.$panel.querySelector('#netRoomState');
    this.$guide = this.$panel.querySelector('#netGuide');
    this.$code = this.$panel.querySelector('.code');

    this.$code.addEventListener('click', (event) => {
      event.stopPropagation();
      navigator.clipboard?.writeText(this.code)
        .then(() => this._toastCb?.(this.zh(`${this.roomLabel()} 房号 ${this.code} 已复制`)))
        .catch(() => this._toastCb?.(this.zh(`${this.roomLabel()} 房号：${this.code}`)));
    });
    this.$panel.querySelector('#netMinBtn').addEventListener('click', () => this.closePanel());

    const grab = this.$panel.querySelector('#netGrab');
    let grabY = null;
    let grabMoved = false;
    grab.addEventListener('pointerdown', (event) => {
      grabY = event.clientY;
      grabMoved = false;
      grab.setPointerCapture(event.pointerId);
    });
    grab.addEventListener('pointermove', (event) => {
      if (grabY === null) return;
      const dy = event.clientY - grabY;
      if (dy < -36) {
        this.$panel.classList.add('full');
        grabY = null;
        grabMoved = true;
      } else if (dy > 36) {
        if (this.$panel.classList.contains('full')) this.$panel.classList.remove('full');
        else this.closePanel();
        grabY = null;
        grabMoved = true;
      }
    });
    grab.addEventListener('pointerup', () => {
      if (grabY !== null && !grabMoved) this.$panel.classList.toggle('full');
      grabY = null;
    });

    if (window.visualViewport) {
      const viewport = window.visualViewport;
      const adjust = () => {
        const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        this.$panel.style.setProperty('--kb', `${keyboard}px`);
        if (keyboard > 0) this.$msgs.scrollTop = this.$msgs.scrollHeight;
      };
      viewport.addEventListener('resize', adjust);
      viewport.addEventListener('scroll', adjust);
    }

    const input = this.$panel.querySelector('#netInput input');
    const hintEl = this.$panel.querySelector('#netChatHint');
    let hintTimer = 0;
    this._chatHint = (text) => {
      hintEl.textContent = this.zh(text);
      clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => { hintEl.textContent = ''; }, 1600);
    };
    const sendNow = () => {
      const text = input.value.trim();
      if (!text || !this.sendChat(text)) return;   // 送不出就把字留在框里
      input.value = '';
      hintEl.textContent = '';
    };
    this.$msgs.addEventListener('scroll', () => {
      if (this._atChatBottom() && this._chatMissed) { this._chatMissed = 0; this._chatNewSync(); }
    }, { passive: true });
    this.$panel.querySelector('#netNew').addEventListener('click', () => {
      if (!this._chatMissed) return;               // 没有新消息时这里只是一句说明，不是按钮
      this._chatMissed = 0;
      this.$msgs.scrollTop = this.$msgs.scrollHeight;
      this._chatNewSync();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') sendNow();
      event.stopPropagation();
    });
    this.$panel.querySelector('#netInput button').addEventListener('click', sendNow);
    this.$panel.querySelectorAll('#netQuick button').forEach((button) => {
      button.addEventListener('click', () => this.sendChat(button.textContent));
    });
    this.$panel.querySelector('#netGuideAct').addEventListener('click', () => {
      if (this.wakeUp()) this._toastCb?.(this.zh('已归队——下一轮轮到您时即可掷轮'));
    });
    this.$panel.querySelector('#netReadyBtn').addEventListener('click', () => this.setReady(!this.me()?.ready));
    this.$panel.querySelector('#netStartBtn').addEventListener('click', () => this.startMatch());
    this.$panel.querySelector('#netKeyBtn').addEventListener('click', () => this.openKey());
    this.$panel.querySelector('#netInvBtn').addEventListener('click', () => this._invite());
    this.$panel.querySelector('#netHallBtn').addEventListener('click', () => {
      this.closePanel();
      this.onHall?.();
    });
    this.$panel.querySelector('#netLeaveBtn').addEventListener('click', async () => {
      if (this.isPlaying() && !await this._confirmCb('离开本局并让出座位')) return;
      this.leave();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.$panel.classList.contains('on')) {
        event.preventDefault();
        event.stopPropagation();
        this.closePanel();
      }
    }, true);

    this.$key = el(`<div id="netKey"><div id="netKeyCard">
      <button class="x" title="关闭" aria-label="关闭密码设置">✕</button>
      <h3>本室密码</h3>
      <div class="sub">设了密码，只有拿到密码或邀请链接的莲友才坐得进来。</div>
      <input id="nkIn" maxlength="4" inputmode="numeric" aria-label="四位数字密码" placeholder="四位数字">
      <div class="err" aria-live="polite"></div>
      <button class="big pri" id="nkGo">设为本室密码</button>
      <button class="big" id="nkOff">撤销密码</button>
    </div></div>`);
    document.body.appendChild(this.$key);
    const keyInput = this.$key.querySelector('#nkIn');
    const keyError = this.$key.querySelector('.err');
    keyInput.addEventListener('input', () => {
      keyInput.value = keyInput.value.replace(/\D/g, '').slice(0, 4);
      keyError.textContent = '';
    });
    keyInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') setKey();
    });
    const setKey = () => {
      if (!/^\d{4}$/.test(keyInput.value)) {
        keyError.textContent = this.zh('请填四位数字');
        return;
      }
      this.setKey(keyInput.value);
      this.closeKey();
    };
    this.$key.querySelector('#nkGo').addEventListener('click', setKey);
    this.$key.querySelector('#nkOff').addEventListener('click', () => {
      this.clearKey();
      this.closeKey();
    });
    this.$key.querySelector('.x').addEventListener('click', () => this.closeKey());
    this.$key.addEventListener('pointerdown', (event) => {
      if (event.target === this.$key) this.closeKey();
    });

    // 择受赠者卡：不设关闭钮——此步非做不可，逾时服务器按座次代施，卡片随相位自行退去
    this.$grant = el(`<div id="netGrant" role="dialog" aria-modal="true" aria-labelledby="ngTitle">
      <div id="netGrantCard">
        <div class="ngEyebrow">贈掷 · 施与同席</div>
        <h3 id="ngTitle">掷得<span class="ngCount">贈掷</span>，请择一位莲友受之</h3>
        <div class="ngSub">依本项目定稿操作规则：此贈不归自己，由受赠的莲友在他所在之位续掷。</div>
        <div id="ngList"></div>
        <div class="ngNote"></div>
      </div></div>`);
    document.body.appendChild(this.$grant);
    this.$grant.querySelector('#ngList').addEventListener('click', (event) => {
      const button = event.target.closest('.ngWho');
      if (button && !button.disabled) this.chooseGrant(button.dataset.id);
    });
  },

  _grantSync() {
    const layer = this.$grant;
    if (!layer) return;
    const pending = this.myGrantChoice();
    if (!pending) {
      layer.classList.remove('on');
      if (this._grantTick) { clearInterval(this._grantTick); this._grantTick = 0; }
      return;
    }
    const count = Math.max(1, Math.min(4, Number(pending.count) || 1));
    layer.querySelector('.ngCount').textContent = this.zh(`贈${'一二三四'[count - 1]}掷`);
    const list = layer.querySelector('#ngList');
    const key = `${pending.candidateIds.join(',')}|${this._pendingGrant ? 1 : 0}`;
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = pending.candidateIds.map((id) => {
        const player = this.players.find((q) => q.id === id);
        if (!player) return '';
        const at = player.n ? this.zh(`第${player.n}掷`) : this.zh('尚未起行');
        return `<button class="ngWho" type="button" data-id="${esc(id)}"${this._pendingGrant ? ' disabled' : ''}>
          <span class="dot" style="background:${esc(player.color || '#e8c766')}"></span>
          <span class="nm">${esc(player.name)}</span><span class="st">${at}</span></button>`;
      }).join('');
    }
    const note = layer.querySelector('.ngNote');
    const paint = () => {
      if (this._pendingGrant) { note.innerHTML = this.zh('正在施与…'); return; }
      const left = Math.max(0, Math.ceil((Number(this.room.turnDeadline || 0) - Date.now()) / 1000));
      note.innerHTML = this.zh(`<b>${left}</b> 秒内未择，按座次自动施与`);
    };
    paint();
    if (!this._grantTick) this._grantTick = window.setInterval(paint, 1000);
    if (!layer.classList.contains('on')) {
      layer.classList.add('on');
      setTimeout(() => layer.querySelector('.ngWho')?.focus(), 60);
    }
  },

  inviteUrl() { return shareUrl(this.key ? `${this.code}.${this.key}` : this.code); },
  _invite() {
    quickShare({
      code: this.key ? `${this.code}.${this.key}` : this.code,
      zh: this.zh,
      toast: (text) => this._toastCb?.(text),
    });
  },

  openKey() {
    if (!this.$key || !this.isHost()) return;
    const input = this.$key.querySelector('#nkIn');
    input.value = this.key || '';
    this.$key.querySelector('.err').textContent = '';
    this.$key.querySelector('#nkOff').style.display = this.locked ? '' : 'none';
    this.$key.classList.add('on');
    setTimeout(() => input.focus(), 80);
  },
  closeKey() { this.$key?.classList.remove('on'); },

  openPanel() {
    if (!this.$panel) return;
    this._lastFocused = document.activeElement;
    this.$panel.classList.add('on');
    this.$dismiss.classList.add('on');
    document.querySelectorAll('.netEntry').forEach((button) => button.setAttribute('aria-expanded', 'true'));
    this._unread = 0;
    this._badge();
    this._uiRoomSync();
  },
  closePanel() {
    if (!this.$panel) return;
    const input = this.$panel.querySelector('input');
    input?.blur();
    this.$panel.classList.remove('on', 'full');
    this.$dismiss.classList.remove('on');
    document.querySelectorAll('.netEntry').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    if (this._lastFocused instanceof HTMLElement && this._lastFocused.isConnected) this._lastFocused.focus({ preventScroll: true });
  },
  togglePanel() {
    if (this.$panel?.classList.contains('on')) this.closePanel();
    else this.openPanel();
  },

  _pillSync() {
    const html = this.players.map((player) =>
      `<span class="pd${player.online ? '' : ' off'}${this.room.turnId === player.id ? ' turn' : ''}" style="color:${player.color}" title="${esc(player.name)}"></span>`).join('');
    document.querySelectorAll('.netDots').forEach((dots) => { dots.innerHTML = html; });
    // 局中主视图原先只有几枚 8px 小点表示「轮到谁」，太隐晦。
    // 借这枚钮已有的字位报当前操作者，不新增控件（§一1 中央永远留给星图）。
    const turn = this.turnPlayer();
    const label = this.isPlaying()
      ? (this.myTurn() ? '该您' : Array.from(turn?.name || '同修').slice(0, 4).join(''))
      : '聊';
    document.querySelectorAll('.chatLabel').forEach((el2) => {
      el2.textContent = this.zh(label);
      el2.classList.toggle('mine', this.isPlaying() && this.myTurn());
    });
  },

  _badge() {
    const value = this._unread > 9 ? '9+' : String(this._unread);
    document.querySelectorAll('.netUnread').forEach((badge) => {
      badge.textContent = value;
      badge.classList.toggle('on', this._unread > 0);
    });
    const badge = this.$btn?.querySelector('i');
    if (badge) {
      badge.textContent = value;
      badge.classList.toggle('on', this._unread > 0);
    }
  },

  _stateText() {
    if (this._connState === 'reconnecting') return '<b>连接中断</b> · 正在自动重连';
    if (this._connState === 'lost') return '<b>连接已断</b> · 请重新进入共修室';
    if (this.room.status === 'waiting') {
      const ready = this.players.filter((p) => p.ready && p.online).length;
      const online = this.players.filter((p) => p.online).length;
      return `<b>准备室</b> · ${online} 人在线 · ${ready} 人已准备 · 2 人即可开局`;
    }
    if (this.room.status === 'finished') {
      const winners = this.players.filter((p) => p.done).map((p) => p.name);
      if (this.room.finishReason === 'not_enough_players') return '<b>本局中止</b> · 有效同修不足两位';
      return `<b>共同结算</b>${winners.length ? ` · ${esc(winners.join('、'))}本局及第` : ''}`;
    }
    if (Date.now() < Number(this.room.availableAt || 0)) return '<b>共同开局</b> · 倒计时中';
    if (this.room.phase === 'choosing_grant') {
      return `<b>贈掷施与</b> · ${esc(this.playerName(this.room.pendingGrant?.giverId))}正在择人`;
    }
    const gift = this.room.gift;
    if (gift && gift.remaining > 0) {
      return `<b>受贈之掷</b> · ${esc(this.playerName(gift.recipientId))}续掷，余 ${gift.remaining} 掷`;
    }
    const turn = this.turnPlayer();
    if (this.room.finishing) return `<b>补齐本轮</b> · 现在轮到${esc(turn?.name || '同修')}`;
    return `<b>第 ${this.room.round || 1} 轮</b> · 现在轮到${esc(turn?.name || '同修')}`;
  },

  _uiRoomSync() {
    document.querySelectorAll('.netEntry').forEach((button) => {
      button.classList.toggle('on', this.active);
      button.classList.toggle('warn', this._connState !== 'ok');
      button.setAttribute('aria-expanded', this.$panel?.classList.contains('on') ? 'true' : 'false');
      button.setAttribute('aria-controls', 'netPanel');
    });
    if (!this.$panel || !this.active) {
      if (this.$panel) this.closePanel();
      return;
    }

    const waitingRoom = this.room.status === 'waiting';
    const finishedRoom = this.room.status === 'finished';
    const playingRoom = this.room.status === 'playing';
    this.$panel.classList.toggle('is-waiting', waitingRoom);
    this.$panel.classList.toggle('is-finished', finishedRoom);
    this.$panel.classList.toggle('is-playing', playingRoom);
    // 标题即室名（全站统一称谓），右侧小字才是可口报、可手输的内部房号
    this.$panel.querySelector('#netHead b').textContent = this.zh(this.roomLabel());
    this.$code.textContent = `${this.locked ? '🔒 ' : ''}${this.code}`;
    this.$code.setAttribute('aria-label', this.zh(`房号 ${this.code}，点按复制`));
    this.$state.innerHTML = this.zh(this._stateText());
    this.$roster.innerHTML = '';
    for (const player of this.players) {
      let status = '等待准备';
      if (!player.online) status = '离线';
      else if (player.spectator) status = '候下局';
      else if (player.away) status = '暂离';
      else if (this.room.status === 'finished' && player.ready) status = '下局已准备';
      else if (player.done) status = '已及第';
      else if (this.room.phase === 'choosing_grant' && this.room.pendingGrant?.giverId === player.id) status = '择人受贈';
      else if (player.bonus > 0) status = `受贈${'一二三四'[Math.min(4, player.bonus) - 1]}掷`;
      else if (this.room.status === 'playing') status = player.n ? `第${player.n}掷` : '待起行';
      else if (player.ready) status = '已准备';
      const chip = el(`<div class="netP${player.online ? '' : ' off'}${player.away ? ' away' : ''}${this.room.turnId === player.id ? ' turn' : ''}">
        <span class="dot" style="background:${player.color}"></span>
        ${player.host ? `<span class="role">${this.zh('房主')}</span>` : ''}
        <span class="nm">${esc(player.name)}${player.id === this.myId ? '（我）' : ''}</span>
        <span class="st">${this.zh(status)}</span>
      </div>`);
      this.$roster.appendChild(chip);
    }

    const me = this.me();
    const readyButton = this.$panel.querySelector('#netReadyBtn');
    const startButton = this.$panel.querySelector('#netStartBtn');
    const actionBar = this.$panel.querySelector('#netRoundActions');
    const readyCount = this.players.filter((p) => p.ready && p.online).length;
    const waiting = !playingRoom;
    const readyPending = !!this._pendingReady;
    const readyTarget = this._pendingReady?.value;
    const startPending = !!this._pendingStart;
    actionBar.hidden = !waiting;
    readyButton.style.display = waiting ? '' : 'none';
    readyButton.textContent = this.zh(readyPending
      ? (readyTarget ? '正在准备…' : '正在取消…')
      : (me?.ready ? '取消准备' : (finishedRoom ? '准备下一局' : '我已准备')));
    readyButton.classList.toggle('pri', !me?.ready);
    readyButton.disabled = readyPending || this._connState !== 'ok';
    readyButton.setAttribute('aria-busy', readyPending ? 'true' : 'false');
    readyButton.setAttribute('aria-pressed', me?.ready ? 'true' : 'false');
    readyButton.setAttribute('aria-label', this.zh(readyPending
      ? (readyTarget ? '正在确认准备状态' : '正在取消准备状态')
      : (me?.ready ? '取消准备' : (finishedRoom ? '准备下一局' : '我已准备'))));
    // 房主自然可开局；房主久未动手时，开局钮向已准备的诸位放开（服务器同一把尺子）
    const mayStart = this.isHost() || this.canStart();
    startButton.style.display = waiting && mayStart ? '' : 'none';
    startButton.textContent = this.zh(startPending
      ? '正在共同开局…'
      : (!me?.ready ? '请先准备' : (readyCount < 2 ? '还需 1 人准备' : `共同开局 · ${readyCount} 人`)));
    startButton.disabled = startPending || !me?.ready || readyCount < 2
      || this._connState !== 'ok' || !this.canStart();
    startButton.setAttribute('aria-busy', startPending ? 'true' : 'false');

    // 指引只剩一行：说「下一步做什么」，不复述状态行的人数、也不图解正上方那两个按钮。
    // 局中仍保留，专给两种「在室但不在局」的人：中途入室的旁观者、超时暂离者——
    // 从前这两种人只在名单里多两个字，主视图却照旧提示「请候某某行谱」，等于骗他等一个永不到来的轮次。
    const spectating = this.isSpectator();
    const away = this.isAway();
    const hint = this.$guide.querySelector('p');
    const guideAct = this.$guide.querySelector('#netGuideAct');
    this.$guide.hidden = !(waiting || spectating || away);
    guideAct.hidden = !away;
    if (away) {
      hint.textContent = this.zh('您已暂离本局，轮次会跳过您。');
      guideAct.textContent = this.zh('我回来了');
    } else if (spectating) {
      hint.textContent = this.zh('本局在您入座前已开始；待共同结算后一同准备即可入局。');
    }
    if (waiting) {
      const openIn = Math.ceil((Number(this.room.startOpenAt || 0) - Date.now()) / 1000);
      if (readyPending) hint.textContent = this.zh(readyTarget ? '正在确认您的准备状态…' : '正在取消准备，请稍候…');
      else if (!me?.ready) hint.textContent = this.zh('先准备，再共同开局；准备后仍可取消。');
      else if (readyCount < 2) hint.textContent = this.zh('已准备，再候一位莲友即可开局。');
      else if (mayStart) {
        hint.textContent = this.zh(this.isHost() ? '人员已齐，可以共同开局。' : '房主久未开局，您也可以开局。');
      } else if (openIn > 0) hint.textContent = this.zh(`已准备，候房主开局；${openIn} 秒后您也可以开局。`);
      else hint.textContent = this.zh('已准备，候房主开局。');
      // 开局权到点即放开：让倒计时自己走完，不必等下一条服务器消息
      window.clearTimeout(this._startGate);
      this._startGate = (!mayStart && Number(this.room.startOpenAt || 0) > Date.now())
        ? window.setTimeout(() => this._uiRoomSync(), 1000)
        : 0;
    }

    const keyButton = this.$panel.querySelector('#netKeyBtn');
    keyButton.style.display = this.isHost() ? '' : 'none';
    keyButton.textContent = this.zh(this.locked ? '改密码' : '设密码');
    this._chatEmptySync();
  },

  // 是否正贴着底看：贴底才让新消息自动滚，否则翻历史的人每来一条就被拽回去
  _atChatBottom() {
    const box = this.$msgs;
    if (!box) return true;
    return box.scrollHeight - box.scrollTop - box.clientHeight <= CHAT_STICK_PX;
  },
  _chatArrived(stick) {
    if (stick) {
      this.$msgs.scrollTop = this.$msgs.scrollHeight;
      this._chatMissed = 0;
    } else {
      this._chatMissed = (this._chatMissed || 0) + 1;
    }
    this._chatNewSync();
  },
  _chatNewSync() {
    const tag = this.$panel?.querySelector('#netNew');
    if (!tag) return;
    const missed = this._chatMissed || 0;
    tag.classList.toggle('has', missed > 0);
    tag.textContent = this.zh(missed > 0 ? `${missed > 9 ? '9+' : missed} 条新消息 ↓` : '仅本室可见');
  },
  _chatFill(list) {
    this.$msgs.innerHTML = '';
    for (const message of list) this._chatPush(message, true);
    this._chatEmptySync();
    this._chatMissed = 0;
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
    this._chatNewSync();
  },
  _chatPush(message, noCount = false) {
    const stick = this._atChatBottom();
    this.$msgs.querySelector('.netEmpty')?.remove();
    const mine = message.id === this.myId;
    const row = el(`<div class="netM${mine ? ' mine' : ''}">
      <span class="who" style="color:${message.color || '#d8c58b'}">${mine ? this.zh('我') : esc(message.name)}</span>
      <span class="bubble">${esc(message.text)}</span>
    </div>`);
    this.$msgs.appendChild(row);
    while (this.$msgs.children.length > 150) this.$msgs.removeChild(this.$msgs.firstChild);
    this._chatArrived(stick || mine);   // 自己刚发的一定滚到底
    if (!noCount && !this.$panel.classList.contains('on')) {
      this._unread++;
      this._badge();
    }
  },
  _sysMsg(text) {
    if (!this.$msgs) return;
    const stick = this._atChatBottom();
    this.$msgs.querySelector('.netEmpty')?.remove();
    const row = el(`<div class="netM sys">${esc(this.zh(text))}</div>`);
    this.$msgs.appendChild(row);
    while (this.$msgs.children.length > 150) this.$msgs.removeChild(this.$msgs.firstChild);
    this._chatArrived(stick);
  },
  _chatEmptySync() {
    if (!this.$msgs || this.$msgs.children.length) return;
    const empty = el(`<div class="netEmpty">${this.zh('还没有消息')}<br><span>${this.zh('念一句佛号，或向同修问讯')}</span></div>`);
    this.$msgs.appendChild(empty);
  },
};
