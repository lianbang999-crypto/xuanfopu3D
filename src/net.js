// 共修室 · 客户端模块
// 职责：入座/重连、密码（东位者可设）、行棋公报、在线聊天的连接与界面。
// 各人自由掷、互不阻塞：无轮次制，故无「开局」「等候室」之说——入座即行。
// 择室在共修大厅（plaza.js），本模块只管入座之后的事。
// 3D 远端棋子渲染在 game.js（需场景坐标），本模块只管网络与 DOM。

import { quickShare, drawQr, shareUrl } from './share.js'; // 分享卡：二维码+一键转发（微信 UA 引导）

const NET_KEY = 'sm10.net.v1';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

export const Net = {
  active: false,          // 已入座（WebSocket 已通且已落座）
  myId: null,
  mySeat: -1,
  myDir: '',              // 东/南/西/北——座次即方位，东位者即房主
  myColor: '#e8c766',
  myName: '',
  code: '',               // 共修室桌号，如 H1T3
  key: '',                // 本室密码（若有）：仅供生成邀请链接与重连，不外传
  locked: false,
  players: [],            // 名单 [{id,name,color,pos,n,done,online,seat,dir,host}]
  ws: null,
  _manualLeave: false,
  _retry: 0,
  _unread: 0,

  // —— 由 game.js 接线的回调 ——
  onRoster: null,         // (players) => void        更新远端珠与界面
  onJoined: null,         // () => void               本人入座成功（深链入座时游戏侧借此自动入局）
  onRemoteMove: null,     // (move) => void           某同修行棋
  onLocked: null,         // (locked, key) => void     本室密码变动
  onHall: null,           // () => void               请求回共修大厅（不离席）
  onLeft: null,           // () => void               已离席（游戏侧据此回大厅）
  getMyState: null,       // () => ({pos, n, done})   重连时上报自身棋况
  zh: (s) => s,           // 简繁转换（由 game.js 注入）

  isHost() { return this.mySeat === 0; }, // 东位者即房主

  me() { return this.players.find(p => p.id === this.myId) || null; },

  // ---------------- 连接 ----------------
  _wsUrl(code) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/room/${code}/ws`;
  },

  joinRoom(code, name, playerId = null, key = '') {
    code = code.toUpperCase();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this._wsUrl(code));
      this.ws = ws;
      this._manualLeave = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', name, playerId, key }));
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === 'joined') {
          this.active = true;
          this.myId = m.playerId; this.mySeat = m.seat; this.myColor = m.color;
          this.myDir = m.dir || ''; this.myName = name; this.code = code; this.key = key || '';
          this._retry = 0;
          try { localStorage.setItem(NET_KEY, JSON.stringify({ code, playerId: m.playerId, name, key })); } catch (e) {}
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
    this.active = false; this.myId = null; this.mySeat = -1; this.myDir = '';
    this.players = []; this.code = ''; this.key = ''; this.locked = false;
    try { localStorage.removeItem(NET_KEY); } catch (e) {}
    this._uiRoomSync();
    this.onRoster && this.onRoster([]);
    this.onLeft && this.onLeft();
  },

  savedRoom() {
    try { return JSON.parse(localStorage.getItem(NET_KEY) || 'null'); } catch (e) { return null; }
  },

  _send(obj) { try { this.ws && this.ws.readyState === 1 && this.ws.send(JSON.stringify(obj)); } catch (e) {} },

  restartSelf() { this._send({ type: 'restart_self' }); }, // 个人重开：只清自己，同桌他人行处不动
  sendMove(m) { this._send({ type: 'move', ...m }); },
  sendChat(text) { this._send({ type: 'chat', text }); },
  setKey(key) { this._send({ type: 'lock', key }); },      // 东位者设四位数密码
  clearKey() { this._send({ type: 'lock', off: true }); }, // 东位者撤密码

  // ---------------- 消息处理 ----------------
  _handle(m) {
    switch (m.type) {
      case 'sync': {
        this.players = m.players || [];
        this.locked = !!m.locked;
        const me = this.me();
        if (me) { this.mySeat = me.seat; this.myDir = me.dir || ''; } // 东位空出后可能改坐东位＝接房主
        if (m.chat) this._chatFill(m.chat);
        this._uiRoomSync();
        this._pillSync();
        this.onRoster && this.onRoster(this.players);
        break;
      }
      case 'locked': {
        this.locked = !!m.locked;
        if (m.locked && m.key) this.key = m.key; // 只有设密码者收得到明文
        if (!m.locked) this.key = '';
        try { // 密码随房号一并留存，重连时带上，免得自己被自己的密码挡在外面
          const saved = this.savedRoom() || {};
          localStorage.setItem(NET_KEY, JSON.stringify({ ...saved, code: this.code, key: this.key }));
        } catch (e) {}
        this._uiRoomSync();
        this.onLocked && this.onLocked(this.locked, this.key);
        break;
      }
      case 'restarted_self': {
        if (m.playerId !== this.myId) this._sysMsg(this.zh(`${m.name || '同修'}再入选佛场`));
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
    // 邀请链接直达：#r=桌号 或 #r=桌号.密码 ——「点开即入座」，密码由链接带着，无须手输
    const m = location.hash.match(/^#r=([A-Za-z0-9]{4,8})(?:\.(\d{4}))?$/);
    this.invited = m ? { code: m[1].toUpperCase(), key: m[2] || '' } : null;
  },

  // 应邀入座：有名号即自动落座；无名号交由大厅问名后再调（game.js 接线）
  async acceptInvite(name) {
    if (!this.invited) return null;
    const { code, key } = this.invited;
    await this.joinRoom(code, name, null, key);
    this.invited = null;
    return code;
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
.netDots .pd{width:9px;height:9px;border-radius:50%;background:currentColor;flex:none;transition:opacity .3s}
.netDots .pd.off{opacity:.3}
#netDots .pd.turn{animation:pdPulse 1.6s ease-in-out infinite}
@keyframes pdPulse{0%,100%{box-shadow:0 0 3px currentColor}50%{box-shadow:0 0 10px currentColor,0 0 16px currentColor}}
#netChatBtn.on{display:flex}
#netChatBtn.warn{border-color:#d98873;color:#d98873}
#netChatBtn i{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;border-radius:9px;background:#d98873;color:#14161d;
  font-style:normal;font-size:var(--fs-xs);line-height:17px;text-align:center;padding:0 4px;display:none}
#netChatBtn i.on{display:block}
#netPanel,#netKey{font-family:'SmileySans',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
#netPanel input,#netPanel button,#netKey input,#netKey button{font-family:inherit}
#netPanel input::placeholder,#netKey input::placeholder{color:#7d8496;font-family:inherit;letter-spacing:1px}
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
/* 手机端聊天＝底部半屏抽屉：星图仍在上方可见（轮次/棋局不失联），抓手上滑全屏、下滑收起；
   键盘弹起由 visualViewport 抬底（--kb）；桌面端浮窗照旧 */
#netGrab{display:none;height:20px;flex:none;cursor:grab;position:relative;touch-action:none}
#netGrab::after{content:'';position:absolute;left:50%;top:8px;width:44px;height:4px;border-radius:2px;background:rgba(216,197,139,.45);transform:translateX(-50%)}
@media (max-width:520px){
  #netPanel{left:0;right:0;bottom:var(--kb,0px);width:100%;max-height:62dvh;border-radius:16px 16px 0 0;
    border-left:none;border-right:none;border-bottom:none;transition:max-height .22s ease,bottom .22s ease}
  /* 局中：抬到掷轮台之上——聊天再要紧，也不该压住掷钮让人掷不成轮 */
  body.sfpOn #netPanel{bottom:calc(var(--kb,0px) + 92px);max-height:50dvh}
  body.sfpOn #netPanel.full{bottom:var(--kb,0px)}
  #netPanel.full{max-height:calc(100dvh - 30px);height:calc(100dvh - 30px)} /* 全屏态真撑满，消息区随之扩张 */
  #netMsgs{min-height:110px}
  #netGrab{display:block}
  #netInput{padding-bottom:calc(9px + env(safe-area-inset-bottom))}
}
/* 密码卡：东位者为本室设四位数密码 */
#netKey{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(8,10,15,.72);backdrop-filter:blur(4px)}
#netKey.on{display:flex}
#netKeyCard{width:min(320px,88vw);background:rgba(18,21,30,.97);border:1px solid rgba(216,197,139,.4);border-radius:16px;padding:20px 18px;color:#e8e2d0}
#netKeyCard h3{margin:0 0 4px;letter-spacing:3px;color:#d8c58b;font-weight:600}
#netKeyCard .sub{color:#9aa3b5;font-size:var(--fs-sm);margin-bottom:14px;line-height:1.6}
#netKeyCard .x{float:right;background:none;border:none;color:#9aa3b5;font-size:var(--fs-lg);cursor:pointer;padding:0 2px}
#netKeyCard input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.3);border-radius:9px;
  padding:12px;color:#f0ead8;font-size:26px;letter-spacing:14px;text-indent:14px;text-align:center;outline:none}
#netKeyCard .err{color:#d98873;font-size:var(--fs-sm);min-height:16px;margin-top:8px}
#netKeyCard .big{display:block;width:100%;margin-top:8px;border-radius:11px;padding:12px 0;font-size:var(--fs-md);letter-spacing:2px;cursor:pointer;
  border:1px solid rgba(216,197,139,.4);background:rgba(255,255,255,.05);color:#cfc7ad}
#netKeyCard .big.pri{background:rgba(232,199,102,.2);color:#e8c766;border-color:rgba(232,199,102,.6)}
.netP .dir{flex:none;font-size:var(--fs-xs);color:#9d9170;letter-spacing:1px;min-width:30px}
/* 快语行：共修常用语一键发（手机免打字） */
#netQuick{display:flex;gap:8px;padding:7px 12px 0}
#netQuick button{border:1px solid rgba(216,197,139,.28);background:rgba(255,255,255,.04);color:#cfc7ad;border-radius:12px;padding:5px 11px;cursor:pointer;font-size:var(--fs-sm)}
`;
    document.head.appendChild(css);

    // 同修脉签不再浮在屏上——已并入掷轮控制台与底坞（见 game.js #sfpChat / #freeChat）。
    // 此处只留一个隐藏的兼容锚点，供旧逻辑取用，不占版面。
    this.$btn = el('<button id="netChatBtn" style="display:none!important"><span class="netDots"></span><i></i></button>');
    document.body.appendChild(this.$btn);

    // 同修面板（名单 + 聊天）
    this.$panel = el(`<div id="netPanel">
      <div id="netGrab" title="上滑全屏 · 下滑收起"></div>
      <div id="netHead"><b>同修在此</b><span class="code" title="点按复制房号"></span></div>
      <div id="netRoster"></div>
      <div id="netMsgs"></div>
      <div id="netQuick"><button>南無阿彌陀佛</button><button>隨喜讚歎 🙏</button></div>
      <div id="netInput"><input maxlength="200" placeholder="与同修讨论…（回车发送）"><button>发</button></div>
      <div id="netBtns"><button id="netKeyBtn">密码</button><button id="netInvBtn" class="pri">邀请</button><button id="netHallBtn">大厅</button><button id="netLeaveBtn">离席</button></div>
    </div>`);
    document.body.appendChild(this.$panel);
    this.$msgs = this.$panel.querySelector('#netMsgs');
    this.$roster = this.$panel.querySelector('#netRoster');
    this.$code = this.$panel.querySelector('.code');
    this.$code.addEventListener('click', () => {
      try { navigator.clipboard.writeText(this.code); this._toastCb && this._toastCb(this.zh(`桌号 ${this.code} 已复制`)); } catch (e) {}
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
    this.$panel.querySelector('#netKeyBtn').addEventListener('click', () => this.openKey());
    this.$panel.querySelector('#netHallBtn').addEventListener('click', () => { this.closePanel(); this.onHall && this.onHall(); });
    this.$panel.querySelector('#netInvBtn').addEventListener('click', () => this._invite());
    this.$panel.querySelector('#netLeaveBtn').addEventListener('click', () => {
      this.leave(); // 不设确认：离席即回大厅，随时可再坐，行处也已存在本机——多一道弹窗只是摩擦
    });
    this.$panel.querySelectorAll('#netQuick button').forEach(b =>
      b.addEventListener('click', () => this.sendChat(b.textContent)));

    // 密码卡：东位者（房主）为本室设四位数密码，邀熟人同座
    this.$key = el(`<div id="netKey"><div id="netKeyCard">
      <button class="x" title="关闭">✕</button>
      <h3>本室密码</h3>
      <div class="sub">设了密码，只有拿到密码或邀请链接的莲友才坐得进来。</div>
      <input id="nkIn" maxlength="4" inputmode="numeric" placeholder="四位数字">
      <div class="err"></div>
      <button class="big pri" id="nkGo">设为本室密码</button>
      <button class="big" id="nkOff">撤销密码</button>
    </div></div>`);
    document.body.appendChild(this.$key);
    const kin = this.$key.querySelector('#nkIn');
    const kerr = this.$key.querySelector('.err');
    ;[kin].forEach(i => { i.addEventListener('pointerdown', (e) => e.stopPropagation()); i.addEventListener('keydown', (e) => e.stopPropagation()); });
    kin.addEventListener('input', () => { kin.value = kin.value.replace(/\D/g, '').slice(0, 4); kerr.textContent = ''; });
    const setKey = () => {
      if (!/^\d{4}$/.test(kin.value)) { kerr.textContent = this.zh('请填四位数字'); return; }
      this.setKey(kin.value);
      this.closeKey();
    };
    this.$key.querySelector('#nkGo').addEventListener('click', setKey);
    kin.addEventListener('keydown', (e) => { if (e.key === 'Enter') setKey(); });
    this.$key.querySelector('#nkOff').addEventListener('click', () => { this.clearKey(); this.closeKey(); });
    this.$key.querySelector('.x').addEventListener('click', () => this.closeKey());
    this.$key.addEventListener('click', (e) => { if (e.target === this.$key) this.closeKey(); });
  },

  // 邀请链接：桌号＋密码（若有）——莲友点开即入座，无须手输密码
  inviteUrl() { return shareUrl(this.key ? `${this.code}.${this.key}` : this.code); },

  // 邀请：能 share 一键出系统分享面板；否则分享卡（二维码＋复制＋微信「右上⋯转发」引导）
  _invite() {
    quickShare({ code: this.key ? `${this.code}.${this.key}` : this.code, zh: this.zh,
      toast: (t) => this._toastCb && this._toastCb(t) });
  },

  // ── 密码卡 ──
  openKey() {
    if (!this.$key || !this.isHost()) return;
    const kin = this.$key.querySelector('#nkIn');
    kin.value = this.key || '';
    this.$key.querySelector('.err').textContent = '';
    this.$key.querySelector('#nkOff').style.display = this.locked ? '' : 'none';
    this.$key.classList.add('on');
    setTimeout(() => kin.focus(), 80);
  },
  closeKey() { this.$key && this.$key.classList.remove('on'); },

  // 脉签同步：四座色点（座次即东南西北），离线者淡去。挂到所有 .netDots 宿主（控制台/底坞）
  _pillSync() {
    const html = this.players.map(q =>
      `<span class="pd${q.online ? '' : ' off'}" style="color:${q.color}" title="${esc(q.name)}"></span>`).join('');
    document.querySelectorAll('.netDots').forEach(d => { d.innerHTML = html; });
  },

  openPanel() { this.$panel.classList.add('on'); this._unread = 0; this._badge(); },
  closePanel() { this.$panel.classList.remove('on'); this.$panel.classList.remove('full'); },
  togglePanel() {
    const on = !this.$panel.classList.contains('on');
    this.$panel.classList.toggle('on', on);
    if (!on) this.$panel.classList.remove('full'); // 收起时退全屏，下次半屏开
    if (on) { this._unread = 0; this._badge(); }
  },

  _badge() {
    const n = this._unread > 9 ? '9+' : String(this._unread);
    document.querySelectorAll('.netUnread').forEach(i => {
      i.textContent = n; i.classList.toggle('on', this._unread > 0);
    });
    const i = this.$btn.querySelector('i');
    i.textContent = n;
    i.classList.toggle('on', this._unread > 0);
  },

  _uiRoomSync() {
    const zh = this.zh;
    document.querySelectorAll('.netEntry').forEach(b => b.classList.toggle('on', this.active));
    if (!this.active) { this.$panel.classList.remove('on'); return; }
    this.$code.textContent = `${this.locked ? '🔒 ' : ''}${this.code}`;
    // 名单
    this.$roster.innerHTML = '';
    for (const p of this.players) {
      const st = p.done ? '已及第' : (p.pos ? '' : '未起行');
      const chip = el(`<div class="netP${p.online ? '' : ' off'}" title="${esc(p.name)}${p.online ? '' : '（离线）'}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="dir">${zh(p.dir || '')}${p.host ? zh('·主') : ''}</span>
        <span class="nm">${esc(p.name)}${p.id === this.myId ? '（我）' : ''}</span>
        <span class="st">${zh(st)}</span></div>`);
      this.$roster.appendChild(chip);
    }
    // 密码钮只给东位者（房主）
    const keyBtn = this.$panel.querySelector('#netKeyBtn');
    keyBtn.style.display = this.isHost() ? '' : 'none';
    keyBtn.textContent = zh(this.locked ? '改密码' : '设密码');
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
