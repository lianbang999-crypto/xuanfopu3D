// 临时排障脚本（用后即删）：真实运行的页面上，量题屏各件的位置与样式（不截图，免 WebGL 合成卡死）。
import { chromium } from 'playwright-core';

const EXE = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.UI_BASE || 'http://localhost:5930';
const b = await chromium.launch({
  headless: true, executablePath: EXE,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

for (const [name, w, h] of [['极短 969x360',969,360],['极短 800x300',800,300],['iPhone横 844x390',844,390]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(BASE, { waitUntil: 'commit' });
  // 等主包就绪（bootActivate 跑在首帧 rAF 里，无头下须催帧）
  for (let i = 0; i < 40; i++) {
    await Promise.race([
      p.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } }),
      new Promise((r) => setTimeout(r, 900)),
    ]).catch(() => {});
    await p.waitForTimeout(250);
    if (await p.evaluate(() => !!(history.state && history.state.sfpBack))) break;
  }
  const r = await p.evaluate(() => {
    const boot = document.querySelector('#boot');
    const nm = document.querySelector('#bootName');
    const cs = nm ? getComputedStyle(nm) : null;
    const bb = getComputedStyle(boot, '::before');
    const rect = (s) => {
      const e = document.querySelector(s); if (!e) return null;
      const q = e.getBoundingClientRect();
      return { top: Math.round(q.top), h: Math.round(q.height) };
    };
    return {
      vh: innerHeight,
      bootClass: boot ? boot.className : '(无)',
      bootDisplay: boot ? getComputedStyle(boot).display : '',
      bootOpacity: boot ? getComputedStyle(boot).opacity : '',
      nameText: nm ? nm.textContent : '(无)',
      nameRect: rect('#bootName'), nameVis: cs ? cs.visibility : '', nameOp: cs ? cs.opacity : '',
      nameDisp: cs ? cs.display : '', nameFs: cs ? cs.fontSize : '',
      subRect: rect('#bootSub'), goRect: rect('#bootGo'), seatRect: rect('#bootSeat'),
      bgImg: (bb.backgroundImage || '').replace(/.*\/assets\//, 'assets/').replace(/".*/, ''),
      bgPos: bb.backgroundPosition, bgOp: bb.opacity,
      groupPad: getComputedStyle(document.querySelector('.bGroup')).padding,
      titleEl: !!document.querySelector('#title'),
    };
  });
  console.log(`\n── ${name} ──`);
  console.log(JSON.stringify(r, null, 1));
  await p.close();
}
await b.close();
