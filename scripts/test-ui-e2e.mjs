// 真人共修前台端到端验收。
// 先启动 `npm run server` 与 `npm run dev`，再运行：
// UI_ARTIFACT_DIR=/tmp/xuanfopu-ui npm run test:ui
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { SFP_PROTOCOL_VERSION } from '../src/sfp-engine.js';

const UI_BASE = process.env.UI_BASE || 'http://localhost:5930'; // 与 vite.config.js 的 server.port 一致
const WS_BASE = (process.env.NET_BASE || 'http://127.0.0.1:8787').replace(/^http/, 'ws');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACT_DIR = process.env.UI_ARTIFACT_DIR || '';

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Peer {
  constructor(code, name) {
    this.code = code;
    this.name = name;
    this.ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
    this.inbox = [];
    this.waiters = [];
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const index = this.waiters.findIndex((entry) => entry.test(message));
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(message);
      else this.inbox.push(message);
    });
  }

  async open() {
    if (this.ws.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.ws.addEventListener('open', resolve, { once: true });
        this.ws.addEventListener('error', reject, { once: true });
      });
    }
    this.send({ type: 'join', protocolVersion: SFP_PROTOCOL_VERSION, name: this.name });
    this.joined = await this.next((message) => message.type === 'joined');
    this.sync = await this.next((message) => message.type === 'sync');
    return this;
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  next(test, timeout = 8000) {
    const index = this.inbox.findIndex(test);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { test, resolve };
      this.waiters.push(entry);
      setTimeout(() => {
        const current = this.waiters.indexOf(entry);
        if (current >= 0) {
          this.waiters.splice(current, 1);
          reject(new Error(`${this.name} 等消息超时`));
        }
      }, timeout);
    });
  }

  leave() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave', requestId: `leave:${this.name}:${Date.now()}` });
    }
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function openPeer(code, name) {
  return new Peer(code, name).open();
}

// 注意调用时机（2026-08-12 踩过）：本函数把 requestAnimationFrame 整个换成空函数，
//   而 bootActivate（题屏三态改写、细字行 #tiHall 的重建重绑）就跑在首帧 rAF 里。
//   若在题屏就绪之前冻，那一帧永远不来，题屏停在静态门面上，#tiHall 一辈子不出现。
//   故一律「先催帧等 .ready，再冻」。
async function freezeVisuals(page) {
  await page.addStyleTag({
    content: 'canvas{visibility:hidden!important}*,*::before,*::after{animation:none!important;transition:none!important}',
  });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
}

async function capture(page, name) {
  if (!ARTIFACT_DIR) return;
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const session = await page.context().newCDPSession(page);
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(ARTIFACT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
  await session.detach();
}

async function waitEnabled(page, selector, timeout = 8000) {
  await page.waitForFunction((value) => {
    const element = document.querySelector(value);
    return element && !element.disabled;
  }, selector, { timeout });
}

// 离席确认已由原生 window.confirm 改为站内卡片 #sfpConfirm：接下这张卡并回传它的原话
async function takeLeaveConfirm(page) {
  await page.locator('#sfpConfirm.on').waitFor({ state: 'visible', timeout: 12_000 });
  const text = await page.locator('#sfpConfirm .cfCard').innerText();
  await page.locator('#cfOk').evaluate((button) => button.click());
  await page.locator('#sfpConfirm').waitFor({ state: 'hidden', timeout: 8_000 });
  return text;
}

// 2026-08-12 修：本函数自 65cfc8b 起就按旧流程「点主钮＝进共修大厅」，
//   而 08-11 已改题屏主钮单人直开——点它是入局，不是入厅，旧写法遂空等 .pzPanel 到超时。
//   大厅今由题屏细字行的「共修大厅」（#tiHall）入。那一行由 openTitle 重建重绑，
//   而 openTitle 挂在首帧 rAF 之后（着色器编译可达数秒），故须先催帧等 .ready 再点。
async function pumpUntil(page, fn, rounds = 60) {
  for (let i = 0; i < rounds; i++) {
    if (i % 4 === 0) await Promise.race([page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
      new Promise((r) => setTimeout(r, 1200))]).catch(() => {});
    await page.waitForTimeout(260);
    if (await page.evaluate(fn).catch(() => false)) return true;
  }
  return false;
}
async function enterPlaza(page) {
  const entry = page.getByRole('button', { name: '开始行谱', exact: true });
  await entry.waitFor({ state: 'visible', timeout: 90_000 });
  const ready = await pumpUntil(page, () => document.querySelector('#boot')?.classList.contains('ready'));
  if (!ready) throw new Error('题屏未就绪（首帧 rAF 未到）——大厅入口 #tiHall 由 openTitle 建，此时尚不存在');
  await freezeVisuals(page);   // 冻在就绪之后：早冻则 rAF 被换成空函数，bootActivate 永不执行
  await page.locator('#tiHall').evaluate((b) => b.click());
  await page.locator('.pzPanel:not(.pzLoading)').waitFor({ state: 'visible', timeout: 30_000 });
}

const peers = [];
let browser;
let context;
let page;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('sm10.net.name', '甲同修');
    localStorage.setItem('sm10.save.v1', JSON.stringify({ sfpHelp: true, zh: 's' }));
  });
  page = await context.newPage();
  page.setDefaultNavigationTimeout(90_000); // 首次需编译 WebGL 着色器；软件渲染/并行验收时 30 秒会产生假超时
  // 每次验收使用独立厅，避开上一次异常中断留下的 90 秒断线保座；产品逻辑仍走真实广场与真实房间。
  const testHall = Number(process.env.UI_TEST_HALL) || 100 + (Date.now() % 800); // TABLE_RE 允许 1–999 厅
  await page.route('**/api/plaza', async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('hall')) url.searchParams.set('hall', String(testHall));
    await route.continue({ url: url.toString() });
  });
  // 全站不应再出现原生弹窗；留个探针，出现即判失败
  let nativeDialogSeen = '';
  page.on('dialog', async (dialog) => {
    nativeDialogSeen = dialog.message();
    await dialog.accept();
  });

  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
  await enterPlaza(page);
  const hallBox = await page.locator('.pzPanel').boundingBox();
  ok(hallBox.width >= 1400 && hallBox.height >= 880, '共修大厅完整占据桌面视口');
  ok(await page.locator('#pzSolo').isVisible() && await page.locator('#pzQuick').isVisible(), '大厅顶部同时提供单人与多人入口');
  ok((await page.locator('.pzRoomsNote').innerText()).includes('两位准备即可开局'), '大厅准确说明准备后共同开局');
  ok(await page.locator('#pzQuick').evaluate((element) => element.classList.contains('primary')), '多人随喜入座保持主操作层级');
  ok(await page.locator('.pzTickerTrack').isVisible(), '共修动态在大厅顶部滚动区域呈现');
  // 共修动态已由大厅内层弹层改为独立全屏页：进去一层，回来一条路
  await page.locator('#pzRank').click({ force: true });
  await page.locator('.pzRankList').waitFor({ state: 'visible', timeout: 20_000 });
  ok((await page.locator('.pzTop h2').innerText()).includes('共修动态'), '点顶条进入共修动态全屏页');
  ok(await page.locator('.pzRankRow .no').count() === 0, '共修动态不列名次');
  await page.locator('#pzStreamBack').evaluate((button) => button.click());
  await page.locator('.pzPanel:not(.pzLoading) .pzRooms').waitFor({ state: 'visible', timeout: 30_000 });
  ok(true, '从共修动态可回到大厅');
  // 桌况刷新必须就地补写：整段重绘会把焦点掀回 body，键盘与读屏用户选不中房间，点击也会落空
  const focusKept = await page.evaluate(async () => {
    const cell = document.querySelector('.pzR,.pzE');
    cell.focus();
    const before = document.activeElement?.getAttribute('aria-label') || '';
    await new Promise((resolve) => setTimeout(resolve, 9000));
    return {
      before,
      after: document.activeElement?.getAttribute('aria-label') || '',
      sameNode: document.querySelector('.pzR,.pzE') === cell,
    };
  });
  ok(!!focusKept.before && focusKept.before === focusKept.after && focusKept.sameNode,
    '大厅定时刷新就地补写桌况，不夺走键盘焦点');
  await capture(page, '00-plaza-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHallBox = await page.locator('.pzPanel').boundingBox();
  ok(mobileHallBox.width >= 389 && mobileHallBox.height >= 843, '共修大厅在手机端同样占满视口');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '手机大厅没有横向溢出');
  ok(await page.locator('#pzSolo').isVisible() && await page.locator('#pzQuick').isVisible(), '手机首屏保留单人与多人入口');
  await capture(page, '00b-plaza-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  const openTables = page.locator('.pzE:not(:disabled)');
  const openCount = await openTables.count();
  ok(openCount >= 3, '大厅至少有三张空共修桌可供独立验收');
  // 从末尾取桌，避开本地反复调试时仍处于九十秒保座期的前几桌。
  const tableA = await openTables.nth(openCount - 3).getAttribute('data-code');
  const tableB = await openTables.nth(openCount - 2).getAttribute('data-code');
  const tableC = await openTables.nth(openCount - 1).getAttribute('data-code');

  console.log('\n【准备室与共同开局】');
  await page.locator(`.pzR[data-code="${tableA}"],.pzE[data-code="${tableA}"]`).evaluate((button) => {
    for (let index = 0; index < 6; index++) button.click();
  });
  try {
    await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 12_000 });
  } catch (error) {
    const joinState = await page.evaluate(() => ({
      toast: document.querySelector('#toast')?.textContent || '',
      plazaBusy: document.querySelector('.pzPanel')?.getAttribute('aria-busy') || '',
      quickDisabled: !!document.querySelector('#pzQuick')?.disabled,
      lease: localStorage.getItem('sm10.net.active.v1'),
      savedRoom: localStorage.getItem('sm10.net.v2'),
    }));
    console.error(`  入座诊断：${JSON.stringify(joinState)}`);
    throw error;
  }
  await page.waitForTimeout(350);
  ok(await page.locator('#netRoster .netP').count() === 1, '重复点击入座仍只生成一个自己');
  ok((await page.locator('#netRoster').innerText()).includes('房主')
    && !/[东南西北]·主/.test(await page.locator('#netRoster').innerText()), '房间只显示房主，不再显示方位座次');
  ok((await page.locator('#netRoomState').innerText()).includes('准备室'), '入座后进入准备室而非直接开局');
  // W3（2026-07-30）：状态行只报人数，开局条件由指引句说一次
  ok((await page.locator('#netRoomState').innerText()).includes('人在线')
    && (await page.locator('#netGuide').innerText()).includes('两位准备即可开局'), '开局条件由指引句说一次：两位准备即可开局');
  ok((await page.locator('#netGuide').innerText()).includes('邀请莲友入座')
    && (await page.locator('#netGuide').innerText()).includes('两位准备即可开局'), '准备室指引一句说清下一步（独自＝邀请，两位准备即可开局）');
  await page.setViewportSize({ width: 375, height: 667 });
  ok(await page.locator('#netReadyBtn').isVisible()
    && await page.locator('#netStartBtn').isVisible()
    && await page.locator('#netLeaveBtn').isVisible(), 'iPhone 小屏准备室首屏看得到准备、开始和离开');
  const waitingPanelBox = await page.locator('#netPanel').boundingBox();
  const waitingFooterBox = await page.locator('#netBtns').boundingBox();
  ok(!!waitingPanelBox && !!waitingFooterBox
    && waitingPanelBox.y >= 0 && waitingPanelBox.y + waitingPanelBox.height <= 668
    && waitingFooterBox.y + waitingFooterBox.height <= 668, '小屏准备室工具栏没有被游戏底栏裁掉');
  await capture(page, '01a-waiting-room-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });

  const peerB = await openPeer(tableA, '乙同修'); peers.push(peerB);
  const peerC = await openPeer(tableA, '丙同修'); peers.push(peerC);
  await page.waitForFunction(() => document.querySelectorAll('#netRoster .netP').length === 3);
  ok(await page.locator('#netRoster .netP').count() === 3, '前台名单显示三位真人同修');
  const desktopRoomBox = await page.locator('#netPanel').boundingBox();
  const desktopToolButtons = page.locator('#netBtns button:visible');
  let desktopToolsFit = !!desktopRoomBox && await desktopToolButtons.count() >= 2;
  for (let index = 0; index < await desktopToolButtons.count(); index++) {
    const box = await desktopToolButtons.nth(index).boundingBox();
    if (!box || box.height < 43
      || box.y + box.height > desktopRoomBox.y + desktopRoomBox.height + 1) desktopToolsFit = false;
  }
  ok(desktopToolsFit, '桌面准备室的密码、邀请和大厅工具完整留在面板内');
  await capture(page, '01-waiting-room-desktop');

  await page.locator('#netReadyBtn').evaluate((button) => button.click());
  peerB.send({ type: 'ready_set', ready: true, requestId: 'ui:b-ready' });
  peerC.send({ type: 'ready_set', ready: true, requestId: 'ui:c-ready' });
  await waitEnabled(page, '#netStartBtn');
  ok((await page.locator('#netStartBtn').innerText()).includes('共同开局'), '三人准备后房主主按钮明确显示共同开局');
  await page.locator('#netStartBtn').click({ force: true });
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 12_000 });
  ok(!await page.locator('#netPanel').isVisible(), '共同开局后房间面板自动收起，不遮挡棋盘');

  console.log('\n【聊天与即时收起】');
  await page.locator('#sfpChat').click({ force: true });
  await page.locator('#netPanel.on').waitFor({ state: 'visible' });
  ok(await page.locator('#netGuide').isHidden() && await page.locator('#netRoundActions').isHidden(), '开局后自动切换为聊天视图，不再保留准备操作');
  let remoteChatSeen = false;
  for (let attempt = 0; attempt < 3 && !remoteChatSeen; attempt++) {
    peerB.send({ type: 'chat', text: '乙同修已到', requestId: `ui:b-chat:${attempt}` });
    try {
      await page.waitForFunction(
        () => (document.querySelector('#netMsgs')?.textContent || '').includes('乙同修已到'),
        undefined,
        { timeout: 6_000 },
      );
      remoteChatSeen = true;
    } catch {}
  }
  ok(remoteChatSeen, '远端聊天即时显示');
  if (!remoteChatSeen) throw new Error('远端聊天三次均未到达');

  await page.locator('#netInput input').fill('甲同修回应');
  await page.getByRole('button', { name: '发送聊天', exact: true }).click({ force: true });
  const browserChat = await peerB.next((message) => message.type === 'chat' && message.text === '甲同修回应');
  ok(browserChat.name === '甲同修', '前台发送聊天可被其他玩家收到');
  await page.waitForFunction(() => document.querySelectorAll('#netMsgs .netM.mine').length > 0);
  ok(await page.locator('#netMsgs .netM.mine .bubble').last().innerText() === '甲同修回应', '自己的消息右对齐成独立气泡，收发更易辨认');
  await capture(page, '02-chat-desktop');

  await page.locator('#netDismiss').click({ position: { x: 1200, y: 50 }, force: true });
  await page.locator('#netPanel').waitFor({ state: 'hidden' });
  ok(!await page.locator('#sfpRoll').evaluate((element) => element.classList.contains('hold')), '点聊天外部立即收起且不误触掷轮');

  await page.locator('#sfpChat').click({ force: true });
  await page.setViewportSize({ width: 375, height: 667 });
  const mobileBox = await page.locator('#netPanel').boundingBox();
  ok(!!mobileBox && mobileBox.x >= 0 && mobileBox.y >= 0 && mobileBox.x + mobileBox.width <= 376
    && mobileBox.y + mobileBox.height <= 668, 'iPhone 小屏下面板完整留在可视区');
  ok(await page.locator('#netLeaveBtn').isVisible()
    && await page.locator('#netInput').isVisible()
    && await page.locator('#netBtns').isVisible(), '小屏行谱中始终看得到离开、聊天和房间工具');
  // 面板 overflow:hidden，固定行一旦超出定高就被裁掉且无法滚出来——曾令小屏根本点不到邀请与聊天输入
  const inGamePanel = await page.locator('#netPanel').boundingBox();
  const inGameInput = await page.locator('#netInput').boundingBox();
  const inGameFooter = await page.locator('#netBtns').boundingBox();
  ok(!!inGamePanel && !!inGameInput && !!inGameFooter
    && inGameInput.y + inGameInput.height <= inGamePanel.y + inGamePanel.height + 1
    && inGameFooter.y + inGameFooter.height <= inGamePanel.y + inGamePanel.height + 1,
    '小屏行谱中聊天输入与房间工具完整留在面板内，不被裁掉');
  const mobileButtons = page.locator('#netBtns button');
  const buttonCount = await mobileButtons.count();
  let touchTargetsOk = true;
  for (let index = 0; index < buttonCount; index++) {
    const box = await mobileButtons.nth(index).boundingBox();
    if (!box || box.height < 43) touchTargetsOk = false;
  }
  const leaveBox = await page.locator('#netLeaveBtn').boundingBox();
  const roundButtons = page.locator('#netRoundActions button:visible');
  const roundButtonCount = await roundButtons.count();
  for (let index = 0; index < roundButtonCount; index++) {
    const box = await roundButtons.nth(index).boundingBox();
    if (!box || box.height < 43) touchTargetsOk = false;
  }
  ok(touchTargetsOk && leaveBox?.height >= 43, '手机关键操作均达到约44px触控高度');
  await capture(page, '03-chat-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('\n【进行中主动离席】');
  // 动态面板在确认卡出现前可能被外部点按层先收起；直接触发按钮语义，稳定覆盖真正的离席流程。
  await page.locator('#netLeaveBtn').evaluate((button) => button.click());
  const confirmText = await takeLeaveConfirm(page);
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 20_000 });
  ok(confirmText.includes('其余同修继续') && confirmText.includes('立即让出'), '三人局离席前明确告知其余玩家继续及立即让座');
  ok(!nativeDialogSeen, '离席确认走站内卡片，不再弹原生对话框');
  const continued = await peerB.next((message) => message.type === 'sync'
    && message.room?.status === 'playing' && message.players.length === 2);
  ok(continued.room.order.length === 2, '一人离席后其余两位继续本局');
  peerB.leave();
  peerC.leave();
  await wait(300);

  console.log('\n【刷新重连、房主递补与人数不足】');
  const host = await openPeer(tableB, '原房主'); peers.push(host);
  await page.locator(`.pzR[data-code="${tableB}"],.pzE[data-code="${tableB}"]`).evaluate((button) => button.click());
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 12_000 });
  const tail = await openPeer(tableB, '后位同修'); peers.push(tail);
  await page.waitForFunction(() => document.querySelectorAll('#netRoster .netP').length === 3);
  ok(!(await page.locator('#netRoster').innerText()).includes('甲同修（我）房主')
    && (await page.locator('#netRoster').innerText()).includes('甲同修'), '后进入者显示为普通成员，不暴露方位座次');

  await page.locator('#netReadyBtn').evaluate((button) => button.click());
  host.send({ type: 'ready_set', ready: true, requestId: 'ui:host-ready' });
  tail.send({ type: 'ready_set', ready: true, requestId: 'ui:tail-ready' });
  await host.next((message) => message.type === 'sync'
    && message.players.filter((player) => player.ready).length === 3);
  host.send({ type: 'start_match', requestId: 'ui:host-start' });
  await host.next((message) => message.type === 'match_started');
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 12_000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  // 刷新即重来一遍首帧：自动回座要等 bootActivate，而它在首帧 rAF 之后；
  //   无头 swiftshader 下 rAF 受节流，须催帧（同 enterPlaza，2026-08-12）。
  await pumpUntil(page, () => document.querySelector('#netPanel')?.classList.contains('on'), 90);
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 90_000 });
  await freezeVisuals(page);   // 同前：冻在就绪之后
  ok((await page.locator('#netRoomState').innerText()).includes('第 1 轮'), '刷新页面后自动回原座并恢复进行中的共同轮次');

  host.leave();
  await page.waitForFunction(() => {
    const roster = document.querySelector('#netRoster')?.textContent || '';
    return roster.includes('房主') && roster.includes('甲同修');
  });
  await page.locator('#netKeyBtn').waitFor({ state: 'visible', timeout: 3000 });
  ok(true, '原房主离席后下一位前台立即获得房主操作');
  ok((await page.locator('#netRoomState').innerText()).includes('第 1 轮'), '三人局房主离席后剩余两人继续而非误结算');
  await capture(page, '04-promoted-host');

  tail.leave();
  await page.waitForFunction(() => (document.querySelector('#netRoomState')?.textContent || '').includes('本局中止'));
  ok((await page.locator('#netRoomState').innerText()).includes('有效同修不足两位'), '只剩一人时前台显示本局中止原因');
  ok((await page.locator('#netReadyBtn').innerText()).includes('准备下一局'), '中止后可直接准备下一局');
  ok((await page.locator('#rollTxt').innerText()).includes('本局已中止'), '棋盘行动栏与中止结果用语一致');
  await capture(page, '05-match-aborted');

  await page.locator('#netLeaveBtn').click({ force: true });
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 12_000 });
  ok(true, '结算后离席无需二次确认并返回大厅');

  console.log('\n【两人局主动离席】');
  const twoPlayerHost = await openPeer(tableC, '两人局房主'); peers.push(twoPlayerHost);
  await page.locator(`.pzR[data-code="${tableC}"],.pzE[data-code="${tableC}"]`).evaluate((button) => button.click());
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('#netReadyBtn').evaluate((button) => button.click());
  twoPlayerHost.send({ type: 'ready_set', ready: true, requestId: 'ui:two-host-ready' });
  await twoPlayerHost.next((message) => message.type === 'sync'
    && message.players.filter((player) => player.ready).length === 2);
  twoPlayerHost.send({ type: 'start_match', requestId: 'ui:two-host-start' });
  await twoPlayerHost.next((message) => message.type === 'match_started');
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('#sfpChat').click({ force: true });
  await page.locator('#netLeaveBtn').evaluate((button) => button.click());
  const twoPlayerConfirm = await takeLeaveConfirm(page);
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 20_000 });
  ok(twoPlayerConfirm.includes('不足两位') && twoPlayerConfirm.includes('立即中止'), '两人局离席前明确告知本局将立即中止');
  const twoPlayerFinish = await twoPlayerHost.next((message) => message.type === 'match_finished');
  ok(twoPlayerFinish.reason === 'not_enough_players', '两人局一方主动离席后服务器共同中止');
  twoPlayerHost.leave();
  await context.close();
} catch (error) {
  failed++;
  console.error(`  ✗ UI 验收中断：${error.stack || error.message}`);
} finally {
  if (page && !page.isClosed()) {
    try {
      const leaveButton = page.locator('#netLeaveBtn');
      if (await leaveButton.isVisible()) {
        await leaveButton.click({ force: true, timeout: 2000 });
        await wait(150);
      }
    } catch {}
  }
  for (const peer of peers) {
    peer.leave();
    peer.close();
  }
  if (context) {
    try { await context.close(); } catch {}
  }
  if (browser) await browser.close();
}

console.log(`\n通过 ${passed} · 失败 ${failed}`);
if (ARTIFACT_DIR) console.log(`截图：${ARTIFACT_DIR}`);
process.exit(failed ? 1 : 0);
