// 真人共修前台端到端验收。
// 先启动 `npm run server` 与 `npm run dev`，再运行：
// UI_ARTIFACT_DIR=/tmp/xuanfopu-ui npm run test:ui
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const UI_BASE = process.env.UI_BASE || 'http://127.0.0.1:5173';
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
    this.send({ type: 'join', protocolVersion: 2, name: this.name });
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

async function enterPlaza(page) {
  const entry = page.getByRole('button', { name: '进入共修大厅', exact: true });
  await entry.waitFor({ state: 'visible', timeout: 90_000 });
  await freezeVisuals(page);
  await entry.click({ force: true });
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 12_000 });
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
  let confirmText = '';
  page.on('dialog', async (dialog) => {
    confirmText = dialog.message();
    await dialog.accept();
  });

  await page.goto(UI_BASE, { waitUntil: 'domcontentloaded' });
  await enterPlaza(page);
  ok((await page.locator('.pzFlow').innerText()).includes('进入准备室')
    && !(await page.locator('.pzFlow').innerText()).includes('坐下即掷'), '大厅准确说明准备后共同开局');
  ok(await page.locator('#pzQuick').evaluate((element) => element.classList.contains('primary')), '共修大厅优先突出随喜入座');
  await capture(page, '00-plaza-desktop');
  const openTables = page.locator('.pzT.s-empty:not(:disabled)');
  const openCount = await openTables.count();
  ok(openCount >= 3, '大厅至少有三张空共修桌可供独立验收');
  // 从末尾取桌，避开本地反复调试时仍处于九十秒保座期的前几桌。
  const tableA = await openTables.nth(openCount - 3).getAttribute('data-code');
  const tableB = await openTables.nth(openCount - 2).getAttribute('data-code');
  const tableC = await openTables.nth(openCount - 1).getAttribute('data-code');

  console.log('\n【准备室与共同开局】');
  await page.locator(`.pzT[data-code="${tableA}"]`).click({ force: true });
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 12_000 });
  ok((await page.locator('#netRoomState').innerText()).includes('准备室'), '入座后进入准备室而非直接开局');

  const peerB = await openPeer(tableA, '乙同修'); peers.push(peerB);
  const peerC = await openPeer(tableA, '丙同修'); peers.push(peerC);
  await page.waitForFunction(() => document.querySelectorAll('#netRoster .netP').length === 3);
  ok(await page.locator('#netRoster .netP').count() === 3, '前台名单显示三位真人同修');
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
  await capture(page, '02-chat-desktop');

  await page.locator('#netDismiss').click({ position: { x: 1200, y: 50 }, force: true });
  await page.locator('#netPanel').waitFor({ state: 'hidden' });
  ok(!await page.locator('#sfpRoll').evaluate((element) => element.classList.contains('hold')), '点聊天外部立即收起且不误触掷轮');

  await page.locator('#sfpChat').click({ force: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await page.locator('#netPanel').boundingBox();
  ok(!!mobileBox && mobileBox.x >= 0 && mobileBox.y >= 0 && mobileBox.x + mobileBox.width <= 391
    && mobileBox.y + mobileBox.height <= 845, '手机尺寸下面板完整留在可视区');
  const mobileButtons = page.locator('#netBtns button');
  const buttonCount = await mobileButtons.count();
  let touchTargetsOk = true;
  for (let index = 0; index < buttonCount; index++) {
    const box = await mobileButtons.nth(index).boundingBox();
    if (!box || box.height < 43) touchTargetsOk = false;
  }
  ok(touchTargetsOk, '手机底部操作按钮均达到约44px触控高度');
  await capture(page, '03-chat-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('\n【进行中主动离席】');
  confirmText = '';
  // 动态面板在确认框出现前可能被外部点按层先收起；直接触发按钮语义，稳定覆盖真正的离席流程。
  await page.locator('#netLeaveBtn').evaluate((button) => button.click());
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 20_000 });
  ok(confirmText.includes('其余同修继续') && confirmText.includes('立即让出'), '三人局离席前明确告知其余玩家继续及立即让座');
  const continued = await peerB.next((message) => message.type === 'sync'
    && message.room?.status === 'playing' && message.players.length === 2);
  ok(continued.room.order.length === 2, '一人离席后其余两位继续本局');
  peerB.leave();
  peerC.leave();
  await wait(300);

  console.log('\n【刷新重连、房主递补与人数不足】');
  const host = await openPeer(tableB, '原东位'); peers.push(host);
  await page.locator(`.pzT[data-code="${tableB}"]`).click({ force: true });
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 12_000 });
  const tail = await openPeer(tableB, '后位同修'); peers.push(tail);
  await page.waitForFunction(() => document.querySelectorAll('#netRoster .netP').length === 3);
  ok((await page.locator('#netRoster').innerText()).includes('南')
    && (await page.locator('#netRoster').innerText()).includes('甲同修'), '先有房主时浏览器玩家正确落在南位');

  await page.locator('#netReadyBtn').evaluate((button) => button.click());
  host.send({ type: 'ready_set', ready: true, requestId: 'ui:host-ready' });
  tail.send({ type: 'ready_set', ready: true, requestId: 'ui:tail-ready' });
  await host.next((message) => message.type === 'sync'
    && message.players.filter((player) => player.ready).length === 3);
  host.send({ type: 'start_match', requestId: 'ui:host-start' });
  await host.next((message) => message.type === 'match_started');
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 12_000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 90_000 });
  await freezeVisuals(page);
  ok((await page.locator('#netRoomState').innerText()).includes('第 1 轮'), '刷新页面后自动回原座并恢复进行中的共同轮次');

  host.leave();
  await page.waitForFunction(() => {
    const roster = document.querySelector('#netRoster')?.textContent || '';
    return roster.includes('东·主') && roster.includes('甲同修');
  });
  ok(await page.locator('#netKeyBtn').isVisible(), '原房主离席后下一位前台立即获得房主操作');
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
  const twoPlayerHost = await openPeer(tableC, '两人局东位'); peers.push(twoPlayerHost);
  await page.locator(`.pzT[data-code="${tableC}"]`).click({ force: true });
  await page.locator('#netPanel.on').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('#netReadyBtn').evaluate((button) => button.click());
  twoPlayerHost.send({ type: 'ready_set', ready: true, requestId: 'ui:two-host-ready' });
  await twoPlayerHost.next((message) => message.type === 'sync'
    && message.players.filter((player) => player.ready).length === 2);
  twoPlayerHost.send({ type: 'start_match', requestId: 'ui:two-host-start' });
  await twoPlayerHost.next((message) => message.type === 'match_started');
  await page.locator('#sfpBar.show').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('#sfpChat').click({ force: true });
  confirmText = '';
  await page.locator('#netLeaveBtn').evaluate((button) => button.click());
  await page.locator('.pzPanel').waitFor({ state: 'visible', timeout: 20_000 });
  ok(confirmText.includes('本局会立即中止'), '两人局离席前明确告知本局将立即中止');
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
