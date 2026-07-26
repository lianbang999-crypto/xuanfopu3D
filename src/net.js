// 共修室 · 真人共同对局客户端
// 职责：连接/重连、准备与轮次状态、服务器权威掷轮、共同结算、密码邀请和聊天。
// 3D 棋珠与轮动画仍由 game.js 呈现；本模块不在客户端裁定棋况。
import { quickShare, shareUrl } from './share.js';
import { SFP_PROTOCOL_VERSION } from './sfp-engine.js';

const NET_KEY = 'sm10.net.v2';
const OLD_NET_KEY = 'sm10.net.v1';

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
  finishing: false,
  finishedAt: 0,
  finishReason: '',
};

export const Net = {
  active: false,
  myId: null,
  mySeat: -1,
  myDir: '',
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
  _connState: 'ok',
  _lastFocused: null,

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

  isHost() { return this.mySeat === 0; },
  isPlaying() { return this.room.status === 'playing'; },
  isFinished() { return this.room.status === 'finished'; },
  me() { return this.players.find((p) => p.id === this.myId) || null; },
  turnPlayer() { return this.players.find((p) => p.id === this.room.turnId) || null; },
  myTurn() { return this.isPlaying() && this.room.turnId === this.myId; },
  canToss() {
    return this.active
      && this._connState === 'ok'
      && this.myTurn()
      && this.room.phase === 'waiting_toss'
      && Date.now() >= Number(this.room.availableAt || 0)
      && !this._pendingToss
      && !this.me()?.done
      && !this.me()?.away;
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
    if (this.room.phase === 'resolving') return '上一掷正在行棋';
    if (Date.now() < Number(this.room.availableAt || 0)) return '共同开局倒计时中';
    if (!this.myTurn()) return `请候「${this.turnPlayer()?.name || '同修'}」行谱`;
    return '请稍候';
  },

  _wsUrl(code) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/room/${code}/ws`;
  },

  joinRoom(code, name, playerId = null, key = '') {
    code = String(code || '').toUpperCase();
    return new Promise((resolve, reject) => {
      let settled = false;
      const reconnecting = this.active && !!playerId;
      const ws = new WebSocket(this._wsUrl(code));
      this.ws = ws;
      this._manualLeave = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'join',
          protocolVersion: SFP_PROTOCOL_VERSION,
          name,
          playerId,
          key,
        }));
      };

      ws.onmessage = (event) => {
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
          this.myDir = message.dir || '';
          this.myName = name;
          this.code = code;
          this.key = key || '';
          this._retry = 0;
          this._setConnState('ok');
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
          return;
        }
        this._handle(message);
      };

      ws.onclose = () => {
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
  },

  leave({ notify = true } = {}) {
    this._manualLeave = true;
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
    this.myDir = '';
    this.players = [];
    this.room = { ...EMPTY_ROOM };
    this.code = '';
    this.key = '';
    this.locked = false;
    this._pendingToss = '';
    try {
      localStorage.removeItem(NET_KEY);
      localStorage.removeItem(OLD_NET_KEY);
    } catch (e) {}
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
    return this._send({ type: 'ready_set', ready: !!ready, requestId: requestId('ready') });
  },
  startMatch() {
    return this._send({ type: 'start_match', requestId: requestId('start') });
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
  sendChat(text) {
    return this._send({ type: 'chat', text, requestId: requestId('chat') });
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
      this.myDir = me.dir || '';
      this.myColor = me.color || this.myColor;
    }
    this._uiRoomSync();
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
        break;
      case 'match_finished':
        this._pendingToss = '';
        this._applyState(message);
        this.openPanel();
        this.onMatchFinished?.(message);
        break;
      case 'command_error':
        if (message.requestId && message.requestId === this._pendingToss) this._pendingToss = '';
        if (message.room) this._applyState(message);
        this._toastCb?.(this.zh(message.text || '此操作未成功'));
        this.onCommandError?.(message);
        break;
      case 'chat':
        this._chatPush(message);
        break;
    }
  },

  init({ toast, zh }) {
    if (toast) this._toastCb = toast;
    if (zh) this.zh = zh;
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
#netPanel{position:fixed;left:12px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:32;width:min(370px,calc(100vw - 24px));
  max-height:min(620px,calc(100dvh - 164px));display:none;flex-direction:column;background:rgba(16,19,28,.97);border:1px solid rgba(216,197,139,.42);
  border-radius:16px;overflow:hidden;overscroll-behavior:contain;backdrop-filter:blur(12px);font-size:var(--fs-md);color:#e8e2d0;box-shadow:0 18px 50px rgba(0,0,0,.38)}
#netPanel.on{display:flex}
#netHead{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-bottom:1px solid rgba(216,197,139,.18);cursor:pointer;min-height:36px}
#netHead b{letter-spacing:2px;color:#d8c58b}
#netHead .code{margin-left:auto;color:#96e1d6;letter-spacing:1px;cursor:pointer}
#netMinBtn{width:40px;height:40px;flex:none;border:0;background:transparent;color:#9aa3b5;border-radius:10px;cursor:pointer;font-size:20px}
#netMinBtn:hover{background:rgba(255,255,255,.06);color:#e8e2d0}
#netRoomState{padding:9px 12px;border-bottom:1px solid rgba(216,197,139,.14);color:#cfc7ad;line-height:1.5}
#netRoomState b{color:#e8c766}
#netRoster{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(216,197,139,.14)}
.netP{display:flex;align-items:center;gap:5px;padding:6px 9px;min-height:30px;border-radius:15px;background:rgba(255,255,255,.05);border:1px solid transparent;max-width:100%}
.netP.turn{border-color:rgba(232,199,102,.8);box-shadow:0 0 10px rgba(232,199,102,.22)}
.netP.off{opacity:.48}.netP.away{opacity:.62}
.netP .dot{width:9px;height:9px;border-radius:50%;flex:none}
.netP .dir{flex:none;font-size:var(--fs-xs);color:#9d9170;letter-spacing:1px}
.netP .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:76px}
.netP .st{color:#9aa3b5;font-size:var(--fs-xs);white-space:nowrap}
#netRoundActions{display:flex;gap:8px;padding:9px 12px;border-bottom:1px solid rgba(216,197,139,.14)}
#netRoundActions button,#netBtns button{min-height:44px;border-radius:10px;cursor:pointer;border:1px solid rgba(216,197,139,.32);background:rgba(255,255,255,.05);color:#cfc7ad}
#netRoundActions button{flex:1}
#netRoundActions button.pri,#netBtns button.pri{background:rgba(232,199,102,.2);color:#e8c766;border-color:rgba(232,199,102,.58)}
#netRoundActions button:disabled{opacity:.42;cursor:not-allowed}
#netMsgs{flex:1;min-height:100px;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:7px;-webkit-overflow-scrolling:touch}
.netM{line-height:1.45;word-break:break-word}.netM b{font-weight:600;margin-right:5px}.netM.sys{color:#9aa3b5;font-size:var(--fs-sm)}
#netQuick{display:flex;gap:8px;padding:7px 12px 0}
#netQuick button{min-height:36px;border:1px solid rgba(216,197,139,.28);background:rgba(255,255,255,.04);color:#cfc7ad;border-radius:12px;padding:5px 11px;cursor:pointer}
#netInput{display:flex;gap:8px;padding:9px 10px;border-top:1px solid rgba(216,197,139,.18)}
#netInput input{flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.28);border-radius:9px;color:#efe9d8;padding:9px 10px;font-size:16px;outline:none}
#netInput button{min-width:48px;border:1px solid rgba(216,197,139,.4);background:rgba(216,197,139,.16);color:#d8c58b;border-radius:9px;cursor:pointer}
#netBtns{display:flex;gap:8px;padding:0 12px 10px}#netBtns button{flex:1;font-size:var(--fs-sm)}
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
.netDots{display:flex;gap:7px;align-items:center}.netDots .pd{width:9px;height:9px;border-radius:50%;background:currentColor;flex:none}.netDots .pd.off{opacity:.3}
.netDots .pd.turn{animation:pdPulse 1.6s ease-in-out infinite}@keyframes pdPulse{0%,100%{box-shadow:0 0 3px currentColor}50%{box-shadow:0 0 10px currentColor,0 0 16px currentColor}}
@media (prefers-reduced-motion:reduce){.netDots .pd.turn{animation:none}}
@media (max-width:520px){
  #netPanel{left:0;right:0;bottom:var(--kb,0px);width:100%;max-height:64dvh;border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none}
  body.sfpOn #netPanel{bottom:calc(var(--kb,0px) + 92px);max-height:min(64dvh,calc(100dvh - 112px))}
  body.sfpOn #netPanel.full{bottom:var(--kb,0px)}
  #netPanel.full{max-height:calc(100dvh - 28px);height:calc(100dvh - 28px)}
  #netGrab{display:block}#netInput{padding-bottom:calc(9px + env(safe-area-inset-bottom))}
}
@media (max-width:520px) and (max-height:700px){
  #netQuick{display:none}
  #netMsgs{min-height:72px}
  #netRoster{max-height:72px;overflow-y:auto}
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
      <div id="netHead"><b>真人共修</b><span class="code" title="点按复制房号"></span><button id="netMinBtn" aria-label="收起真人共修面板" title="收起">⌄</button></div>
      <div id="netRoomState" aria-live="polite"></div>
      <div id="netRoster"></div>
      <div id="netRoundActions"><button id="netReadyBtn"></button><button id="netStartBtn" class="pri"></button></div>
      <div id="netMsgs" role="log" aria-live="polite" aria-relevant="additions" aria-label="聊天消息"></div>
      <div id="netQuick"><button>南無阿彌陀佛</button><button>隨喜讚歎 🙏</button></div>
      <div id="netInput"><input maxlength="200" aria-label="聊天内容" placeholder="与同修讨论…（回车发送）"><button aria-label="发送聊天">发</button></div>
      <div id="netBtns"><button id="netKeyBtn">密码</button><button id="netInvBtn" class="pri">邀请</button><button id="netHallBtn">大厅</button><button id="netLeaveBtn">离席</button></div>
    </section>`);
    document.body.appendChild(this.$panel);
    this.$msgs = this.$panel.querySelector('#netMsgs');
    this.$roster = this.$panel.querySelector('#netRoster');
    this.$state = this.$panel.querySelector('#netRoomState');
    this.$code = this.$panel.querySelector('.code');

    this.$code.addEventListener('click', (event) => {
      event.stopPropagation();
      navigator.clipboard?.writeText(this.code)
        .then(() => this._toastCb?.(this.zh(`桌号 ${this.code} 已复制`)))
        .catch(() => this._toastCb?.(this.zh(`桌号：${this.code}`)));
    });
    this.$panel.querySelector('#netHead').addEventListener('pointerdown', (event) => {
      if (event.target === this.$code || event.target.closest?.('#netMinBtn')) return;
      event.preventDefault();
      event.stopPropagation();
      this.closePanel();
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
    const sendNow = () => {
      const text = input.value.trim();
      if (!text || !this.sendChat(text)) return;
      input.value = '';
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') sendNow();
      event.stopPropagation();
    });
    this.$panel.querySelector('#netInput button').addEventListener('click', sendNow);
    this.$panel.querySelectorAll('#netQuick button').forEach((button) => {
      button.addEventListener('click', () => this.sendChat(button.textContent));
    });
    this.$panel.querySelector('#netReadyBtn').addEventListener('click', () => this.setReady(!this.me()?.ready));
    this.$panel.querySelector('#netStartBtn').addEventListener('click', () => this.startMatch());
    this.$panel.querySelector('#netKeyBtn').addEventListener('click', () => this.openKey());
    this.$panel.querySelector('#netInvBtn').addEventListener('click', () => this._invite());
    this.$panel.querySelector('#netHallBtn').addEventListener('click', () => {
      this.closePanel();
      this.onHall?.();
    });
    this.$panel.querySelector('#netLeaveBtn').addEventListener('click', () => {
      if (this.isPlaying()) {
        const activePlayers = this.room.order.filter((id) => !this.players.find((player) => player.id === id)?.done).length;
        const text = activePlayers <= 2
          ? '离席后有效同修不足两位，本局会立即中止。确定离席并让出座位吗？'
          : '离席后本局由其余同修继续，您的座位会立即让出。确定离席吗？';
        if (!window.confirm(this.zh(text))) return;
      }
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
      return `<b>准备室</b> · ${ready}/${this.players.filter((p) => p.online).length} 位已准备`;
    }
    if (this.room.status === 'finished') {
      const winners = this.players.filter((p) => p.done).map((p) => p.name);
      if (this.room.finishReason === 'not_enough_players') return '<b>本局中止</b> · 有效同修不足两位';
      return `<b>共同结算</b>${winners.length ? ` · ${esc(winners.join('、'))}本局及第` : ''}`;
    }
    if (Date.now() < Number(this.room.availableAt || 0)) return '<b>共同开局</b> · 倒计时中';
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

    this.$code.textContent = `${this.locked ? '🔒 ' : ''}${this.code}`;
    this.$state.innerHTML = this.zh(this._stateText());
    this.$roster.innerHTML = '';
    for (const player of this.players) {
      let status = '未准备';
      if (!player.online) status = '离线';
      else if (player.spectator) status = '候下局';
      else if (player.away) status = '暂离';
      else if (this.room.status === 'finished' && player.ready) status = '下局已准备';
      else if (player.done) status = '已及第';
      else if (this.room.status === 'playing') status = player.n ? `第${player.n}掷` : '待起行';
      else if (player.ready) status = '已准备';
      const chip = el(`<div class="netP${player.online ? '' : ' off'}${player.away ? ' away' : ''}${this.room.turnId === player.id ? ' turn' : ''}">
        <span class="dot" style="background:${player.color}"></span>
        <span class="dir">${this.zh(player.dir || '')}${player.host ? this.zh('·主') : ''}</span>
        <span class="nm">${esc(player.name)}${player.id === this.myId ? '（我）' : ''}</span>
        <span class="st">${this.zh(status)}</span>
      </div>`);
      this.$roster.appendChild(chip);
    }

    const me = this.me();
    const readyButton = this.$panel.querySelector('#netReadyBtn');
    const startButton = this.$panel.querySelector('#netStartBtn');
    const readyCount = this.players.filter((p) => p.ready && p.online).length;
    const waiting = this.room.status !== 'playing';
    readyButton.style.display = waiting ? '' : 'none';
    readyButton.textContent = this.zh(me?.ready ? '取消准备' : (this.room.status === 'finished' ? '准备下一局' : '我已准备'));
    readyButton.classList.toggle('pri', !me?.ready);
    startButton.style.display = waiting && this.isHost() ? '' : 'none';
    startButton.textContent = this.zh(readyCount >= 2 ? '共同开局' : '等候两人准备');
    startButton.disabled = !me?.ready || readyCount < 2 || this._connState !== 'ok';

    const keyButton = this.$panel.querySelector('#netKeyBtn');
    keyButton.style.display = this.isHost() ? '' : 'none';
    keyButton.textContent = this.zh(this.locked ? '改密码' : '设密码');
  },

  _chatFill(list) {
    this.$msgs.innerHTML = '';
    for (const message of list) this._chatPush(message, true);
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
  },
  _chatPush(message, noCount = false) {
    const row = el(`<div class="netM"><b style="color:${message.color || '#d8c58b'}">${esc(message.name)}</b>${esc(message.text)}</div>`);
    this.$msgs.appendChild(row);
    while (this.$msgs.children.length > 150) this.$msgs.removeChild(this.$msgs.firstChild);
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
    if (!noCount && !this.$panel.classList.contains('on')) {
      this._unread++;
      this._badge();
    }
  },
  _sysMsg(text) {
    if (!this.$msgs) return;
    const row = el(`<div class="netM sys">${esc(this.zh(text))}</div>`);
    this.$msgs.appendChild(row);
    while (this.$msgs.children.length > 150) this.$msgs.removeChild(this.$msgs.firstChild);
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
  },
};
