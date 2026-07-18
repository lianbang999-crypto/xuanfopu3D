// 联机同修 · 客户端模块
// 职责：房间（开房/入房/重连）、轮次状态、行棋公报、在线聊天的连接与界面。
// 3D 远端棋子渲染在 game.js（需场景坐标），本模块只管网络与 DOM。

const NET_KEY = 'sm10.net.v1';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

export const Net = {
  active: false,          // 已入房（WebSocket 已通且已入座）
  started: false,         // 本房已开局
  myId: null,
  mySeat: -1,
  myColor: '#e8c766',
  myName: '',
  code: '',
  players: [],            // 名单 [{id,name,color,pos,n,done,online,seat}]
  turn: null,             // 当前轮到的 playerId
  ws: null,
  _manualLeave: false,
  _retry: 0,
  _unread: 0,

  // —— 由 game.js 接线的回调 ——
  onRoster: null,         // (players, turn) => void  更新远端珠与界面
  onRemoteMove: null,     // (move) => void           某同修行棋
  onStarted: null,        // () => void               开局
  onTurnChange: null,     // (myTurn) => void         轮次变化（控掷轮可用性）
  getMyState: null,       // () => ({pos, n, done})   重连时上报自身棋况
  zh: (s) => s,           // 简繁转换（由 game.js 注入）

  myTurn() { return !this.active || !this.started || this.turn === this.myId; },

  me() { return this.players.find(p => p.id === this.myId) || null; },

  // ---------------- 连接 ----------------
  _wsUrl(code) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/room/${code}/ws`;
  },

  async createRoom(name) {
    const r = await fetch('/api/room/new');
    const d = await r.json();
    if (!d.code) throw new Error('开房失败，请稍后再试');
    return this.joinRoom(d.code, name);
  },

  joinRoom(code, name, playerId = null) {
    code = code.toUpperCase();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this._wsUrl(code));
      this.ws = ws;
      this._manualLeave = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', name, playerId }));
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === 'joined') {
          this.active = true;
          this.myId = m.playerId; this.mySeat = m.seat; this.myColor = m.color;
          this.myName = name; this.code = code;
          this._retry = 0;
          try { localStorage.setItem(NET_KEY, JSON.stringify({ code, playerId: m.playerId, name })); } catch (e) {}
          // 重连续局：把本地棋况报回房间
          if (this.getMyState) {
            const st = this.getMyState();
            if (st && (st.pos || st.n)) ws.send(JSON.stringify({ type: 'move', ...st, txt: '' }));
          }
          this._uiRoomSync();
          if (!settled) { settled = true; resolve(m); }
          return;
        }
        if (m.type === 'error') {
          if (!settled) { settled = true; reject(new Error(m.text || m.code)); }
          this._toastCb && this._toastCb(m.text || m.code);
          return;
        }
        this._handle(m);
      };
      ws.onclose = () => {
        if (this._manualLeave) return;
        if (!settled) { settled = true; reject(new Error('连接未成——请确认房号或稍后再试')); return; }
        // 断线重连：指数退避，至多六次
        if (this.active && this._retry < 6) {
          this._retry++;
          const wait = Math.min(8000, 500 * Math.pow(2, this._retry));
          this._setConnState('reconnecting');
          setTimeout(() => { if (this.active && !this._manualLeave) this.joinRoom(this.code, this.myName, this.myId).catch(() => {}); }, wait);
        } else if (this.active) {
          this._setConnState('lost');
        }
      };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    });
  },

  leave() {
    this._manualLeave = true;
    try { this.ws && this.ws.send(JSON.stringify({ type: 'leave' })); } catch (e) {}
    try { this.ws && this.ws.close(); } catch (e) {}
    this.active = false; this.started = false; this.myId = null; this.players = []; this.turn = null;
    try { localStorage.removeItem(NET_KEY); } catch (e) {}
    this._uiRoomSync();
    this.onRoster && this.onRoster([], null);
    this.onTurnChange && this.onTurnChange(true);
  },

  savedRoom() {
    try { return JSON.parse(localStorage.getItem(NET_KEY) || 'null'); } catch (e) { return null; }
  },

  _send(obj) { try { this.ws && this.ws.readyState === 1 && this.ws.send(JSON.stringify(obj)); } catch (e) {} },

  start() { this._send({ type: 'start' }); },
  sendMove(m) { this._send({ type: 'move', ...m }); },
  endTurn() { this._send({ type: 'end_turn' }); },
  sendChat(text) { this._send({ type: 'chat', text }); },

  // ---------------- 消息处理 ----------------
  _handle(m) {
    switch (m.type) {
      case 'sync': {
        const prevTurn = this.turn;
        this.players = m.players || [];
        this.started = !!m.started;
        this.turn = m.turn || null;
        if (m.chat) this._chatFill(m.chat);
        this._uiRoomSync();
        this.onRoster && this.onRoster(this.players, this.turn);
        if (prevTurn !== this.turn) this.onTurnChange && this.onTurnChange(this.myTurn());
        break;
      }
      case 'started': {
        this._setConnState('ok');
        this.onStarted && this.onStarted();
        break;
      }
      case 'move': {
        this.onRemoteMove && this.onRemoteMove(m);
        break;
      }
      case 'chat': {
        this._chatPush(m);
        break;
      }
    }
  },

  // ---------------- 界面 ----------------
  _toastCb: null,
  init({ toast, zh }) {
    if (toast) this._toastCb = toast;
    if (zh) this.zh = zh;
    this._buildUi();
  },

  _connState: 'ok',
  _setConnState(s) {
    this._connState = s;
    const b = document.getElementById('netChatBtn');
    if (b) b.classList.toggle('warn', s !== 'ok');
    if (s === 'reconnecting') this._toastCb && this._toastCb('联机断线，正在重连…');
    if (s === 'lost') this._toastCb && this._toastCb('联机连接已断——点「同修」面板可重连');
  },

  _buildUi() {
    const css = document.createElement('style');
    css.textContent = `
#netChatBtn{position:fixed;left:12px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:30;width:44px;height:44px;border-radius:50%;
  background:rgba(20,24,34,.82);border:1px solid rgba(216,197,139,.4);color:#d8c58b;font-size:var(--fs-lg);letter-spacing:0;
  display:none;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(6px)}
#netChatBtn.on{display:flex}
#netChatBtn.warn{border-color:#d98873;color:#d98873}
#netChatBtn i{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;border-radius:9px;background:#d98873;color:#14161d;
  font-style:normal;font-size:var(--fs-xs);line-height:17px;text-align:center;padding:0 4px;display:none}
#netChatBtn i.on{display:block}
#netPanel{position:fixed;left:12px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:31;width:min(320px,calc(100vw - 24px));
  max-height:min(430px,60vh);display:none;flex-direction:column;background:rgba(16,19,28,.94);border:1px solid rgba(216,197,139,.35);
  border-radius:14px;overflow:hidden;backdrop-filter:blur(10px);font-size:var(--fs-md);color:#e8e2d0}
#netPanel.on{display:flex}
#netHead{padding:10px 12px 8px;border-bottom:1px solid rgba(216,197,139,.18)}
#netHead b{letter-spacing:2px;color:#d8c58b}
#netHead .code{float:right;color:#96e1d6;letter-spacing:1px;cursor:pointer}
#netRoster{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(216,197,139,.14)}
.netP{display:flex;align-items:center;gap:6px;padding:4px 9px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid transparent;max-width:100%}
.netP.turn{border-color:rgba(232,199,102,.75);box-shadow:0 0 9px rgba(232,199,102,.25)}
.netP.off{opacity:.45}
.netP .dot{width:9px;height:9px;border-radius:50%;flex:none}
.netP .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72px}
.netP .st{color:#9aa3b5;font-size:var(--fs-xs);white-space:nowrap}
#netMsgs{flex:1;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:7px;-webkit-overflow-scrolling:touch}
.netM{line-height:1.45;word-break:break-word}
.netM b{font-weight:600;margin-right:5px}
.netM.sys{color:#9aa3b5;font-size:var(--fs-sm)}
#netInput{display:flex;gap:8px;padding:9px 10px;border-top:1px solid rgba(216,197,139,.18)}
#netInput input{flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.25);border-radius:9px;color:#efe9d8;
  padding:8px 10px;font-size:var(--fs-md);outline:none;user-select:text;-webkit-user-select:text}
#netInput button{background:rgba(216,197,139,.16);border:1px solid rgba(216,197,139,.4);color:#d8c58b;border-radius:9px;padding:0 14px;cursor:pointer}
#netBtns{display:flex;gap:8px;padding:0 12px 10px}
#netBtns button{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(216,197,139,.3);color:#cfc7ad;border-radius:9px;padding:7px 0;cursor:pointer;font-size:var(--fs-sm)}
#netBtns button.pri{background:rgba(232,199,102,.18);color:#e8c766;border-color:rgba(232,199,102,.55)}
#netJoin{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(8,10,15,.72);backdrop-filter:blur(4px)}
#netJoin.on{display:flex}
#netJoinCard{width:min(360px,90vw);background:rgba(18,21,30,.97);border:1px solid rgba(216,197,139,.4);border-radius:16px;padding:20px 18px;color:#e8e2d0}
#netJoinCard h3{margin:0 0 4px;letter-spacing:3px;color:#d8c58b;font-weight:600}
#netJoinCard .sub{color:#9aa3b5;font-size:var(--fs-sm);margin-bottom:14px;line-height:1.6}
#netJoinCard label{display:block;font-size:var(--fs-sm);color:#9aa3b5;margin:10px 0 4px}
#netJoinCard input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.3);border-radius:9px;
  color:#efe9d8;padding:9px 10px;font-size:var(--fs-md);outline:none;user-select:text;-webkit-user-select:text;letter-spacing:1px}
#netJoinCard .row{display:flex;gap:9px;margin-top:16px}
#netJoinCard .row button{flex:1;border-radius:10px;padding:10px 0;font-size:var(--fs-md);cursor:pointer;border:1px solid rgba(216,197,139,.4);
  background:rgba(255,255,255,.05);color:#cfc7ad}
#netJoinCard .row button.pri{background:rgba(232,199,102,.2);color:#e8c766;border-color:rgba(232,199,102,.6)}
#netJoinCard .err{color:#d98873;font-size:var(--fs-sm);min-height:16px;margin-top:8px}
#netJoinCard .x{float:right;background:none;border:none;color:#9aa3b5;font-size:var(--fs-lg);cursor:pointer;padding:0 2px}
@media (max-width:520px){#netPanel{bottom:calc(132px + env(safe-area-inset-bottom))}}
`;
    document.head.appendChild(css);

    // 聊天浮钮
    this.$btn = el('<button id="netChatBtn" title="同修 · 聊天">聊<i></i></button>');
    document.body.appendChild(this.$btn);
    this.$btn.addEventListener('click', () => this.togglePanel());

    // 同修面板（名单 + 聊天）
    this.$panel = el(`<div id="netPanel">
      <div id="netHead"><b>同修在此</b><span class="code" title="点按复制房号"></span></div>
      <div id="netRoster"></div>
      <div id="netMsgs"></div>
      <div id="netInput"><input maxlength="200" placeholder="与同修讨论…（回车发送）"><button>发</button></div>
      <div id="netBtns"><button id="netStartBtn" class="pri">开局</button><button id="netLeaveBtn">离房</button></div>
    </div>`);
    document.body.appendChild(this.$panel);
    this.$msgs = this.$panel.querySelector('#netMsgs');
    this.$roster = this.$panel.querySelector('#netRoster');
    this.$code = this.$panel.querySelector('.code');
    this.$code.addEventListener('click', () => {
      try { navigator.clipboard.writeText(this.code); this._toastCb && this._toastCb(`房号 ${this.code} 已复制——发给莲友即可入房`); } catch (e) {}
    });
    const input = this.$panel.querySelector('input');
    const sendNow = () => {
      const t = input.value.trim();
      if (!t) return;
      this.sendChat(t);
      input.value = '';
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendNow(); e.stopPropagation(); });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.$panel.querySelector('#netInput button').addEventListener('click', sendNow);
    this.$panel.querySelector('#netStartBtn').addEventListener('click', () => this.start());
    this.$panel.querySelector('#netLeaveBtn').addEventListener('click', () => {
      if (confirm('离开此房？（棋况已存在本机，可再入房续行）')) this.leave();
    });

    // 入房弹窗
    this.$join = el(`<div id="netJoin"><div id="netJoinCard">
      <button class="x" title="关闭">✕</button>
      <h3>联机同修</h3>
      <div class="sub">至多四位同修同局行谱——开房后把房号发给莲友；轮到谁掷轮，谁的名字会亮起。聊天随时可用。</div>
      <label>您的名号</label><input id="njName" maxlength="12" placeholder="如：慧明">
      <label>房号（入已有房时填写）</label><input id="njCode" maxlength="8" placeholder="如：AB3D" style="text-transform:uppercase">
      <div class="err"></div>
      <div class="row"><button class="pri" id="njNew">开新房</button><button id="njGo">入此房</button></div>
    </div></div>`);
    document.body.appendChild(this.$join);
    const err = this.$join.querySelector('.err');
    const nameIn = this.$join.querySelector('#njName');
    const codeIn = this.$join.querySelector('#njCode');
    ;[nameIn, codeIn].forEach(i => { i.addEventListener('pointerdown', (e) => e.stopPropagation()); i.addEventListener('keydown', (e) => e.stopPropagation()); });
    this.$join.querySelector('.x').addEventListener('click', () => this.$join.classList.remove('on'));
    this.$join.addEventListener('click', (e) => { if (e.target === this.$join) this.$join.classList.remove('on'); });
    const doJoin = async (create) => {
      const name = nameIn.value.trim() || '同修';
      const code = codeIn.value.trim().toUpperCase();
      err.textContent = '';
      try {
        if (create) await this.createRoom(name);
        else {
          if (!code) { err.textContent = '请填写房号'; return; }
          await this.joinRoom(code, name);
        }
        this.$join.classList.remove('on');
        this.openPanel();
        this._sysMsg(create ? `已开房「${this.code}」——点右上房号可复制，发给莲友入房` : `已入房「${this.code}」`);
      } catch (e2) {
        err.textContent = e2.message || '未能入房';
      }
    };
    this.$join.querySelector('#njNew').addEventListener('click', () => doJoin(true));
    this.$join.querySelector('#njGo').addEventListener('click', () => doJoin(false));
  },

  openJoin(prefillName = '') {
    const saved = this.savedRoom();
    if (prefillName || saved) this.$join.querySelector('#njName').value = prefillName || (saved && saved.name) || '';
    if (saved) this.$join.querySelector('#njCode').value = saved.code || '';
    this.$join.classList.add('on');
  },

  openPanel() { this.$panel.classList.add('on'); this._unread = 0; this._badge(); },
  togglePanel() {
    const on = !this.$panel.classList.contains('on');
    this.$panel.classList.toggle('on', on);
    if (on) { this._unread = 0; this._badge(); }
  },

  _badge() {
    const i = this.$btn.querySelector('i');
    i.textContent = this._unread > 9 ? '9+' : String(this._unread);
    i.classList.toggle('on', this._unread > 0);
  },

  _uiRoomSync() {
    const zh = this.zh;
    this.$btn.classList.toggle('on', this.active);
    if (!this.active) { this.$panel.classList.remove('on'); return; }
    this.$code.textContent = `房 ${this.code}`;
    // 名单
    this.$roster.innerHTML = '';
    for (const p of this.players) {
      const st = p.done ? '已及第' : (p.pos ? '' : '未起行');
      const chip = el(`<div class="netP${p.id === this.turn ? ' turn' : ''}${p.online ? '' : ' off'}" title="${esc(p.name)}${p.online ? '' : '（离线）'}">
        <span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.name)}${p.id === this.myId ? '（我）' : ''}</span>
        <span class="st">${zh(st)}</span></div>`);
      this.$roster.appendChild(chip);
    }
    // 开局钮：房主未开局才见
    const startBtn = this.$panel.querySelector('#netStartBtn');
    startBtn.style.display = (!this.started && this.mySeat === 0) ? '' : 'none';
    startBtn.textContent = this.players.length >= 2 ? zh(`开局（${this.players.length}人）`) : zh('候莲友入房…');
  },

  _chatFill(list) {
    this.$msgs.innerHTML = '';
    for (const m of list) this._chatPush(m, true);
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
  },

  _chatPush(m, noCount = false) {
    const d = el(`<div class="netM"><b style="color:${m.color || '#d8c58b'}">${esc(m.name)}</b>${esc(m.text)}</div>`);
    this.$msgs.appendChild(d);
    while (this.$msgs.children.length > 150) this.$msgs.removeChild(this.$msgs.firstChild);
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
    if (!noCount && !this.$panel.classList.contains('on')) { this._unread++; this._badge(); }
  },

  _sysMsg(text) {
    const d = el(`<div class="netM sys">${esc(text)}</div>`);
    this.$msgs.appendChild(d);
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
  },
};
