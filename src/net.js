// 联机同修 · 客户端模块
// 职责：房间（开房/入房/重连）、轮次状态、行棋公报、在线聊天的连接与界面。
// 3D 远端棋子渲染在 game.js（需场景坐标），本模块只管网络与 DOM。

import { quickShare, drawQr, shareUrl } from './share.js'; // 分享卡：二维码+一键转发（微信 UA 引导）

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
  onJoined: null,         // () => void               本人入房成功（深链入房时游戏侧借此自动入局）
  onRemoteMove: null,     // (move) => void           某同修行棋
  onStarted: null,        // () => void               开局
  onRestarted: null,      // () => void               房主重开——本地谱局归零回等候室
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
          this._histPush(code); // 最近的房
          if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname); // 邀请链已用毕，清参数
          // 重连续局：把本地棋况报回房间
          if (this.getMyState) {
            const st = this.getMyState();
            if (st && (st.pos || st.n)) ws.send(JSON.stringify({ type: 'move', ...st, txt: '' }));
          }
          this._uiRoomSync();
          this.onJoined && this.onJoined();
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
    this.closeWait();
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
  restart() { this._send({ type: 'restart' }); }, // 再来一局（房主）：全房清棋况回等候室
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
        this._waitSync(); this._pillSync();
        if (this.started) this.closeWait(); // 开局即散等候室（重连入已开局房同理）
        this.onRoster && this.onRoster(this.players, this.turn);
        if (prevTurn !== this.turn) this.onTurnChange && this.onTurnChange(this.myTurn());
        break;
      }
      case 'started': {
        this._setConnState('ok');
        this.closeWait(); // 等候室使命完成
        this.onStarted && this.onStarted();
        break;
      }
      case 'restarted': {
        // 房主重开：全房回等候室（座次保留）；本地谱局重置由 game.js onRestarted 处理
        this.started = false;
        this._sysMsg(this.zh(`${m.by || '房主'}已重开一局——回到等候室`));
        this.onRestarted && this.onRestarted();
        this.$panel.classList.remove('on');
        this.openWait();
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
    // 邀请链接直达：#r=CODE ——「点击接受邀请就能入局」
    // 本机存有名号→全自动入房入局（零输入）；首次→单栏名号卡（名号+「入局」一钮）
    const m = location.hash.match(/^#r=([A-Za-z0-9]{4,8})$/);
    if (m) {
      const code = m[1].toUpperCase();
      let nm = '';
      try { nm = localStorage.getItem('sm10.net.name') || (this.savedRoom() || {}).name || ''; } catch (e) {}
      if (nm) {
        this.joinRoom(code, nm).then(() => {
          this._toastCb && this._toastCb(this.zh(`已应邀入房 ${code} · ${nm}`));
          if (this.started) this.openPanel(); else this.openWait();
        }).catch((e2) => {
          this.openJoin(code); // 入不了（满/已开局/网络）退回大厅报错
          const err = this.$join.querySelector('.err');
          if (err) err.textContent = e2.message || '未能入房';
        });
      } else {
        this.openJoin(code, true);
        this._toastCb && this._toastCb(this.zh(`收到莲友邀请——房 ${code}，写下名号即入`));
      }
    }
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
#netChatBtn{position:fixed;left:12px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:30;height:40px;min-width:44px;border-radius:20px;padding:0 13px;
  background:rgba(20,24,34,.82);border:1px solid rgba(216,197,139,.4);color:#d8c58b;
  display:none;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(6px)}
/* 同修脉签：四座色点即名单——谁在房一目了然，轮到谁谁的点脉动；点开＝未开局入等候室、开局后开聊天 */
#netDots{display:flex;gap:7px;align-items:center}
#netDots .pd{width:9px;height:9px;border-radius:50%;background:currentColor;flex:none;transition:opacity .3s}
#netDots .pd.off{opacity:.3}
#netDots .pd.turn{animation:pdPulse 1.6s ease-in-out infinite}
@keyframes pdPulse{0%,100%{box-shadow:0 0 3px currentColor}50%{box-shadow:0 0 10px currentColor,0 0 16px currentColor}}
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
  padding:8px 10px;font-size:16px;outline:none;user-select:text;-webkit-user-select:text} /* ≥16px：iOS 聚焦不自动放大 */
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
#netJoinCard .big{display:block;width:100%;margin-top:14px;border-radius:11px;padding:13px 0;font-size:var(--fs-md);letter-spacing:2px;cursor:pointer;
  border:1px solid rgba(232,199,102,.55);background:rgba(232,199,102,.16);color:#e8c766}
#netJoinCard .or{display:flex;align-items:center;gap:10px;margin:14px 0 8px;color:#9aa3b5;font-size:var(--fs-xs)}
#netJoinCard .or i{flex:1;height:1px;background:rgba(216,197,139,.18)}
#netJoinCard .joinrow{display:flex;gap:8px}
#netJoinCard .joinrow input{flex:1}
#netJoinCard .joinrow button{border-radius:9px;padding:0 18px;cursor:pointer;border:1px solid rgba(216,197,139,.34);background:rgba(255,255,255,.05);color:#cfc7ad;font-size:var(--fs-md)}
#njHist{margin-top:10px}
#njHist .njh{display:inline-flex;align-items:center;gap:7px;margin:4px 6px 0 0;padding:6px 11px;border-radius:11px;cursor:pointer;
  border:1px solid rgba(216,197,139,.25);background:rgba(255,255,255,.04);color:#cfc7ad;font-size:var(--fs-sm)}
#njHist .njh b{color:#96e1d6;letter-spacing:1px;font-weight:600}
#njHist .njh span{color:#9aa3b5;font-size:var(--fs-xs)}
/* 手机端聊天＝底部半屏抽屉：星图仍在上方可见（轮次/棋局不失联），抓手上滑全屏、下滑收起；
   键盘弹起由 visualViewport 抬底（--kb）；桌面端浮窗照旧 */
#netGrab{display:none;height:20px;flex:none;cursor:grab;position:relative;touch-action:none}
#netGrab::after{content:'';position:absolute;left:50%;top:8px;width:44px;height:4px;border-radius:2px;background:rgba(216,197,139,.45);transform:translateX(-50%)}
@media (max-width:520px){
  #netPanel{left:0;right:0;bottom:var(--kb,0px);width:100%;max-height:62dvh;border-radius:16px 16px 0 0;
    border-left:none;border-right:none;border-bottom:none;transition:max-height .22s ease}
  #netPanel.full{max-height:calc(100dvh - 30px);height:calc(100dvh - 30px)} /* 全屏态真撑满，消息区随之扩张 */
  #netMsgs{min-height:110px}
  #netGrab{display:block}
  #netInput{padding-bottom:calc(9px + env(safe-area-inset-bottom))}
}
/* 等候室：入房未开局的主场景——房号大字、四座横排、情境主按钮、细字行 */
#netWait{position:fixed;inset:0;z-index:59;display:none;align-items:center;justify-content:center;background:rgba(8,10,15,.6);backdrop-filter:blur(4px)}
#netWait.on{display:flex}
#netWaitCard{width:min(380px,92vw);background:rgba(18,21,30,.97);border:1px solid rgba(216,197,139,.3);border-radius:16px;padding:22px 20px 16px;color:#e8e2d0;text-align:center}
#nwCodeSub{font-size:var(--fs-xs);color:#9aa3b5;letter-spacing:2px}
#nwCode{font-size:30px;letter-spacing:12px;text-indent:12px;color:#e8c766;cursor:pointer;margin-top:3px;user-select:none;-webkit-user-select:none}
#nwQr{display:inline-block;background:#fff;border-radius:10px;padding:6px;line-height:0;margin-top:12px}
#nwQrSub{font-size:var(--fs-xs);color:#9aa3b5;letter-spacing:2px;margin-top:5px}
#nwSeats{display:flex;justify-content:center;gap:16px;margin:20px 0 4px}
.nwSeat{display:flex;flex-direction:column;align-items:center;gap:8px;width:66px}
.nwSeat .orb{width:32px;height:32px;border-radius:50%;position:relative}
.nwSeat.fill .orb{background:currentColor;box-shadow:0 0 12px currentColor}
.nwSeat.empty .orb{border:1.5px dashed rgba(216,197,139,.35)}
.nwSeat.off .orb{opacity:.35;box-shadow:none}
.nwSeat b{font-size:var(--fs-xs);font-weight:400;color:#cfc7ad;max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nwSeat.empty b{color:#6f7787}
.nwSeat .host{position:absolute;top:-5px;right:-7px;font-size:10px;line-height:1.4;background:#e8c766;color:#14161d;border-radius:7px;padding:0 4px}
#nwMain{display:block;width:100%;margin-top:15px;border-radius:11px;padding:13px 0;font-size:var(--fs-md);letter-spacing:2px;cursor:pointer;border:1px solid rgba(232,199,102,.55);background:rgba(232,199,102,.16);color:#e8c766}
#nwMain.dis{opacity:.5;pointer-events:none}
#nwLinks{display:flex;justify-content:center;gap:22px;margin-top:11px}
#nwLinks span{color:#9aa3b5;font-size:var(--fs-sm);letter-spacing:1px;cursor:pointer;padding:7px 4px;transition:color .2s}
#nwLinks span:hover,#nwLinks span:active{color:#efe0d8}
/* 快语行：共修常用语一键发（手机免打字） */
#netQuick{display:flex;gap:8px;padding:7px 12px 0}
#netQuick button{border:1px solid rgba(216,197,139,.28);background:rgba(255,255,255,.04);color:#cfc7ad;border-radius:12px;padding:5px 11px;cursor:pointer;font-size:var(--fs-sm)}
`;
    document.head.appendChild(css);

    // 同修脉签（原「聊」浮钮升级）：四座色点即名单，轮到谁谁的点脉动
    this.$btn = el('<button id="netChatBtn" title="同修 · 聊天"><span id="netDots"></span><i></i></button>');
    document.body.appendChild(this.$btn);
    this.$btn.addEventListener('click', () => {
      if (this.active && !this.started) this.openWait(); // 未开局：回等候室
      else this.togglePanel();                            // 局中：开聊天
    });

    // 同修面板（名单 + 聊天）
    this.$panel = el(`<div id="netPanel">
      <div id="netGrab" title="上滑全屏 · 下滑收起"></div>
      <div id="netHead"><b>同修在此</b><span class="code" title="点按复制房号"></span></div>
      <div id="netRoster"></div>
      <div id="netMsgs"></div>
      <div id="netQuick"><button>南無阿彌陀佛</button><button>隨喜讚歎 🙏</button></div>
      <div id="netInput"><input maxlength="200" placeholder="与同修讨论…（回车发送）"><button>发</button></div>
      <div id="netBtns"><button id="netStartBtn" class="pri">开局</button><button id="netInvBtn">邀请</button><button id="netLeaveBtn">离房</button></div>
    </div>`);
    document.body.appendChild(this.$panel);
    this.$msgs = this.$panel.querySelector('#netMsgs');
    this.$roster = this.$panel.querySelector('#netRoster');
    this.$code = this.$panel.querySelector('.code');
    this.$code.addEventListener('click', () => {
      try { navigator.clipboard.writeText(this.code); this._toastCb && this._toastCb(`房号 ${this.code} 已复制——发给莲友即可入房`); } catch (e) {}
    });
    // 抓手：上滑全屏、下滑收起（全屏态先退半屏再收）；点按切换全屏
    const grab = this.$panel.querySelector('#netGrab');
    let gY = null, gMoved = false;
    grab.addEventListener('pointerdown', (e) => { gY = e.clientY; gMoved = false; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => {
      if (gY === null) return;
      const dy = e.clientY - gY;
      if (dy < -36) { this.$panel.classList.add('full'); gY = null; gMoved = true; }
      else if (dy > 36) { if (this.$panel.classList.contains('full')) this.$panel.classList.remove('full'); else this.togglePanel(); gY = null; gMoved = true; }
    });
    grab.addEventListener('pointerup', () => { if (gY !== null && !gMoved) this.$panel.classList.toggle('full'); gY = null; });
    // 键盘弹起：visualViewport 抬底（iOS fixed 元素不随键盘，须手动垫高）
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const adj = () => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        this.$panel.style.setProperty('--kb', `${kb}px`);
        if (kb > 0) this.$msgs.scrollTop = this.$msgs.scrollHeight;
      };
      vv.addEventListener('resize', adj);
      vv.addEventListener('scroll', adj);
    }
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
    this.$panel.querySelector('#netInvBtn').addEventListener('click', () => this._invite());
    this.$panel.querySelector('#netLeaveBtn').addEventListener('click', () => {
      if (confirm('离开此房？（棋况已存在本机，可再入房续行）')) this.leave();
    });
    this.$panel.querySelectorAll('#netQuick button').forEach(b =>
      b.addEventListener('click', () => this.sendChat(b.textContent)));

    // 等候室：入房未开局的主场景——四座可视化 + 情境主按钮（独自→邀请；房主≥2→开局；非房主→候开局）
    this.$wait = el(`<div id="netWait"><div id="netWaitCard">
      <div id="nwCodeSub">同修等候室 · 点房号复制</div>
      <div id="nwCode">····</div>
      <div id="nwQr"><canvas></canvas></div>
      <div id="nwQrSub">莲友扫码即入</div>
      <div id="nwSeats"></div>
      <button id="nwMain">邀请莲友</button>
      <div id="nwLinks"><span id="nwChat">聊天</span><span id="nwLeave">离房</span><span id="nwHide">收起</span></div>
    </div></div>`);
    document.body.appendChild(this.$wait);
    this.$wait.addEventListener('click', (e) => { if (e.target === this.$wait) this.closeWait(); });
    this.$wait.querySelector('#nwCode').addEventListener('click', () => {
      try { navigator.clipboard.writeText(this.code); this._toastCb && this._toastCb(this.zh(`房号 ${this.code} 已复制——发给莲友即可入房`)); } catch (e) {}
    });
    this.$wait.querySelector('#nwMain').addEventListener('click', () => {
      const act = this.$wait.querySelector('#nwMain').dataset.act;
      if (act === 'start') this.start(); else this._invite();
    });
    this.$wait.querySelector('#nwChat').addEventListener('click', () => { this.closeWait(); this.openPanel(); });
    this.$wait.querySelector('#nwHide').addEventListener('click', () => this.closeWait());
    this.$wait.querySelector('#nwLeave').addEventListener('click', () => {
      if (confirm('离开此房？（棋况已存在本机，可再入房续行）')) { this.closeWait(); this.leave(); }
    });

    // 大厅（极简）：名号常记 · 开新房 · 房号入房 · 最近的房（实时在线数）· 邀请链接直达
    this.$join = el(`<div id="netJoin"><div id="netJoinCard">
      <button class="x" title="关闭">✕</button>
      <h3>联机同修</h3>
      <div class="sub">至多四位同修同局行谱，按座次轮掷，聊天随时可用。开房后一键转发邀请，莲友点开即入。</div>
      <label>您的名号</label><input id="njName" maxlength="12" placeholder="如：慧明">
      <button class="big pri" id="njNew">开新房 · 得房号邀莲友</button>
      <div class="or"><i></i><span>或入已有房</span><i></i></div>
      <div class="joinrow"><input id="njCode" maxlength="8" placeholder="房号，如 AB3D" style="text-transform:uppercase"><button id="njGo">入房</button></div>
      <div id="njHist"></div>
      <div class="err"></div>
    </div></div>`);
    document.body.appendChild(this.$join);
    const err = this.$join.querySelector('.err');
    const nameIn = this.$join.querySelector('#njName');
    const codeIn = this.$join.querySelector('#njCode');
    ;[nameIn, codeIn].forEach(i => { i.addEventListener('pointerdown', (e) => e.stopPropagation()); i.addEventListener('keydown', (e) => e.stopPropagation()); });
    nameIn.addEventListener('input', () => { try { localStorage.setItem('sm10.net.name', nameIn.value.trim()); } catch (e) {} });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(false); });
    this.$join.querySelector('.x').addEventListener('click', () => this.$join.classList.remove('on'));
    this.$join.addEventListener('click', (e) => { if (e.target === this.$join) this.$join.classList.remove('on'); });
    const doJoin = async (create, code0) => {
      const name = nameIn.value.trim() || '同修';
      const code = (code0 || codeIn.value.trim()).toUpperCase();
      err.textContent = '';
      try {
        if (create) await this.createRoom(name);
        else {
          if (!code) { err.textContent = '请填写房号'; return; }
          await this.joinRoom(code, name);
        }
        this.$join.classList.remove('on');
        if (this.started) this.openPanel(); else this.openWait(); // 未开局→等候室为主场景
        this._sysMsg(create ? `已开房「${this.code}」——点「邀请」转发给莲友，点开即入` : `已入房「${this.code}」`);
      } catch (e2) {
        err.textContent = e2.message || '未能入房';
      }
    };
    this._doJoin = doJoin;
    this.$join.querySelector('#njNew').addEventListener('click', () => (this._lite ? doJoin(false, this._lite) : doJoin(true)));
    this.$join.querySelector('#njGo').addEventListener('click', () => doJoin(false));
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && this._lite) doJoin(false, this._lite); });
  },

  // 最近的房：入房成功即记（去重、留三个）；大厅里带实时在线数，点即再入
  _histPush(code) {
    try {
      const h = JSON.parse(localStorage.getItem('sm10.net.hist') || '[]').filter((x) => x.code !== code);
      h.unshift({ code, ts: Date.now() });
      localStorage.setItem('sm10.net.hist', JSON.stringify(h.slice(0, 3)));
    } catch (e) {}
  },

  _histRender() {
    const box = this.$join.querySelector('#njHist');
    let h = [];
    try { h = JSON.parse(localStorage.getItem('sm10.net.hist') || '[]'); } catch (e) {}
    box.innerHTML = h.length ? `<label>最近的房</label>` : '';
    for (const { code } of h) {
      const chip = el(`<button class="njh"><b>${esc(code)}</b><span>…</span></button>`);
      chip.addEventListener('click', () => this._doJoin(false, code));
      box.appendChild(chip);
      fetch(`/api/room/${code}`).then(r => r.json()).then(st => {
        chip.querySelector('span').textContent = st.started ? '已开局' : (st.count ? `${st.online || 0}/${st.count}人在房` : '空房');
      }).catch(() => { chip.querySelector('span').textContent = ''; });
    }
  },

  inviteUrl() { return shareUrl(this.code); },

  // 邀请：能 share 一键出系统分享面板；否则分享卡（二维码＋复制＋微信「右上⋯转发」引导）
  _invite() { quickShare({ code: this.code, zh: this.zh, toast: (t) => this._toastCb && this._toastCb(t) }); },

  // ── 等候室 ──
  openWait() { if (!this.$wait) return; this._waitSync(); this.$wait.classList.add('on'); },
  closeWait() { this.$wait && this.$wait.classList.remove('on'); },
  _waitSync() {
    if (!this.$wait) return;
    this.$wait.querySelector('#nwCode').textContent = this.code || '';
    if (this.code && this._qrCode !== this.code) { // 等候室常显小二维码：面对面莲友扫屏即入，零输入
      this._qrCode = this.code;
      try { drawQr(this.$wait.querySelector('#nwQr canvas'), this.inviteUrl(), 220); } catch (e) {}
    }
    const seats = this.$wait.querySelector('#nwSeats');
    seats.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const q = this.players.find(x => x.seat === i);
      seats.appendChild(el(q
        ? `<div class="nwSeat fill${q.online ? '' : ' off'}" style="color:${q.color}"><span class="orb">${q.seat === 0 ? '<span class="host">主</span>' : ''}</span><b>${esc(q.name)}${q.id === this.myId ? this.zh('（我）') : ''}</b></div>`
        : `<div class="nwSeat empty"><span class="orb"></span><b>${this.zh('虚位')}</b></div>`));
    }
    const main = this.$wait.querySelector('#nwMain');
    const n = this.players.length;
    main.classList.remove('dis');
    if (this.mySeat === 0) {
      if (n >= 2) { main.dataset.act = 'start'; main.textContent = this.zh(`开局 · ${n} 位同修`); }
      else { main.dataset.act = 'invite'; main.textContent = this.zh('邀请莲友 · 点开即入'); }
    } else if (n < 4) { main.dataset.act = 'invite'; main.textContent = this.zh('候房主开局 · 可先邀莲友'); }
    else { main.dataset.act = ''; main.textContent = this.zh('四座已齐 · 候房主开局'); main.classList.add('dis'); }
  },
  // 脉签同步：四座色点（座次序），轮到者脉动，离线者淡去
  _pillSync() {
    const dots = document.getElementById('netDots');
    if (!dots) return;
    dots.innerHTML = '';
    this.players.forEach(q => {
      dots.appendChild(el(`<span class="pd${q.online ? '' : ' off'}${this.started && q.id === this.turn ? ' turn' : ''}" style="color:${q.color}" title="${esc(q.name)}"></span>`));
    });
  },

  openJoin(prefillCode = '', lite = false) {
    const saved = this.savedRoom();
    let nm = '';
    try { nm = localStorage.getItem('sm10.net.name') || ''; } catch (e) {}
    this.$join.querySelector('#njName').value = nm || (saved && saved.name) || '';
    this.$join.querySelector('#njCode').value = prefillCode || (saved && saved.code) || '';
    // lite＝受邀首次：单栏名号卡（隐去开房/房号/最近的房，一钮「入局」）
    this._lite = lite ? String(prefillCode).toUpperCase() : '';
    this.$join.querySelector('.sub').textContent = this._lite
      ? this.zh(`莲友邀您同局《选佛谱》——房 ${this._lite}，写下名号即入。`)
      : this.zh('至多四位同修同局行谱，按座次轮掷，聊天随时可用。开房后一键转发邀请，莲友点开即入。');
    this.$join.querySelector('#njNew').textContent = this.zh(this._lite ? '入局' : '开新房 · 得房号邀莲友');
    for (const sel of ['.or', '.joinrow', '#njHist']) {
      const n = this.$join.querySelector(sel);
      if (n) n.style.display = this._lite ? 'none' : '';
    }
    if (!this._lite) this._histRender();
    this.$join.classList.add('on');
  },

  openPanel() { this.$panel.classList.add('on'); this._unread = 0; this._badge(); },
  togglePanel() {
    const on = !this.$panel.classList.contains('on');
    this.$panel.classList.toggle('on', on);
    if (!on) this.$panel.classList.remove('full'); // 收起时退全屏，下次半屏开
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
    const invBtn = this.$panel.querySelector('#netInvBtn');
    if (invBtn) invBtn.style.display = this.started ? 'none' : ''; // 开局后服务端拒新入，邀请钮退场
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
