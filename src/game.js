// 选佛谱 —— 敦煌矿彩星图式佛教宇宙经纬仪，十法界为棋盘
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'; // v191 写实化：PBR 环境反射
import { NODES, REALMS, WORKS, COORD_KIND_LABEL } from './data.js';
import { SFP_DOORS, SFP_POS, SFP_META } from './sfp-data.js';
import { SFP_CANON_FRONT, SFP_CANON_DOORS } from './sfp-canon.js'; // v177 六卷原文整卷阅读（CBETA B0136 逐字）
import { SFP_EVIDENCE_TYPE, SFP_WHY_EVIDENCE, sfpWhyEvidence, sfpEvidenceItems, mergeSfpEvidence, makeSfpInterpretationEvidence, makeSfpOperationalEvidence, makeSfpSourceEvidence } from './sfp-evidence.js';
import { SFP_GLOSS, SFP_DOOR_PLAIN } from './sfp-gloss.js';
import { SFP_WHY_PLAIN } from './sfp-why-plain.js';
import { SFP_POS_PLAIN } from './sfp-pos-plain.js'; // v225 二百二十位白话简介（判词去处点读、位卡首行白话）
import { ZH_T2S, ZH_S2T } from './zh-conv.js';
import { Net } from './net.js'; // 联机同修：房间/轮次/聊天（渲染在本文件「联机同修珠」段）
import { quickShare } from './share.js'; // 分享卡：荐游戏/邀莲友（二维码+一键转发）
import * as Plaza from './plaza.js'; // 共修大厅：12 桌网格·动态广播·念佛功课榜
import { sfpDirOf as sfpDirOfRule } from './sfp-rules.js'; // 行棋升降判定（与 check-dir 核证脚本同源）
import { SFP_FACE_ORDER, canonicalSfpCombo } from './sfp-engine.js'; // 单机/联机共用轮面与组合归一化

const C = {
  bg: 0x201b2f, ink: 0x173d52, mala: 0x246b66, cinn: 0x8b3f32,
  gold: 0xd7aa45, paleGold: 0xd8c58b, paper: '#efe0b4', deep: 0x25354d,
};
const app = document.getElementById('app')               ;

// ---------------- 存档 ----------------
const SAVE_KEY = 'sm10.save.v1';
const save = {
  read: []            , fav: []            ,
  seenTut: false,
  sfp: null                                                   ,
  sfpWins: 0,
  // 见闻录（跨局累计）：只记曾见位与可数行程，不作修证高下判断
  lg: { seen: [], tos: 0, evil: 0, back: 0, up: 0, games: 0 },
  sfpFocus: true,
  sfpHelp: false,
  askq: { d: '', n: 0 }, // 问义日额（每日 100 次）
  zh: 's'             ,
  cardTheme: 'night'  , // 卡片主题：'night' 暗夜（默认）/ 'paper' 写经纸（浅底墨字，好读）
  settings: { sfx: true, ambient: true, music: true, lowPerf: false, bigFont: false, moveFx: true }, // music：及第时唱赞一遍；moveFx：行棋乘光飞行特效；关＝直达落位
};
function applyCardTheme() { document.documentElement.classList.toggle('paperCards', save.cardTheme === 'paper'); }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.read)) save.read = d.read;
    if (Array.isArray(d.fav)) save.fav = d.fav;
    save.seenTut = !!d.seenTut;
    if (d.sfp && d.sfp.pos) save.sfp = { pos: String(d.sfp.pos), n: Number(d.sfp.n) || 0, hist: Array.isArray(d.sfp.hist) ? d.sfp.hist : [], seenD: Array.isArray(d.sfp.seenD) ? d.sfp.seenD : [], trail: Array.isArray(d.sfp.trail) ? d.sfp.trail : [] };
    if (typeof d.sfpWins === 'number') save.sfpWins = d.sfpWins;
    if (d.lg && typeof d.lg === 'object') {
      save.lg.seen = Array.isArray(d.lg.seen) ? d.lg.seen.filter(x => typeof x === 'string' && SFP_BY[x]) : [];
      save.lg.tos = Number(d.lg.tos) || 0;
      save.lg.evil = Number(d.lg.evil) || 0;
      save.lg.back = Number(d.lg.back) || 0;
      save.lg.up = Number(d.lg.up) || 0;
      save.lg.games = Number(d.lg.games) || 0;
    }
    if (typeof d.sfpFocus === 'boolean') save.sfpFocus = d.sfpFocus;
    save.sfpHelp = !!d.sfpHelp;
    if (d.askq && typeof d.askq.d === 'string') save.askq = { d: d.askq.d, n: Number(d.askq.n) || 0 };
    if (d.zh === 't' || d.zh === 's') save.zh = d.zh;
    if (d.settings) Object.assign(save.settings, d.settings);
    save.settings.lowPerf = false; // v313 低性能设置行已删（粗指针自动降档制替代）：旧存档复位防辉光永关
  } catch (e) {}
}

// ---------------- 简繁转换（OpenCC 字典裁剪，仅显示层；数据 id 与存档不变） ----------------
const ZH_MAXLEN = { s: Math.max(...Object.keys(ZH_T2S).map(k => k.length)), t: Math.max(...Object.keys(ZH_S2T).map(k => k.length)) };
function zhWith(s        , dict                        , ml        )         {
  let r = '', i = 0;
  while (i < s.length) {
    let hit = '';
    for (let L = Math.min(ml, s.length - i); L >= 1; L--) {
      const seg = s.substr(i, L);
      if (dict[seg] !== undefined) { r += dict[seg]; i += L; hit = seg; break; }
    }
    if (!hit) { r += s[i]; i++; }
  }
  return r;
}
function zh(s        )         {
  return save.zh === 't' ? zhWith(s, ZH_S2T, ZH_MAXLEN.t) : zhWith(s, ZH_T2S, ZH_MAXLEN.s);
}
// 就地转换 DOM 文本节点；缓存首见原文，切换时从原文重转，避免简→繁往返损耗
const zhOrig = new WeakMap              ();
function zhDom(root      ) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n             ;
  while ((n = w.nextNode())) {
    const t = n        ;
    if (!t.nodeValue || !/[\u3400-\u9fff]/.test(t.nodeValue)) continue;
    if ((t.parentElement && t.parentElement.tagName === 'STYLE')) continue;
    let orig = zhOrig.get(t);
    if (orig === undefined) { orig = t.nodeValue; zhOrig.set(t, orig); }
    t.nodeValue = zh(orig);
  }
}

// ---------------- 音频 ----------------
let actx                      = null;
const sfxBuf                              = {};
let ambientNodes                                                      = null;
let chantBuf = null;
let chantLoad = null;
let chantUntil = 0;
window.__musicProbe = () => ({ chant: !!chantBuf, duration: chantBuf ? chantBuf.duration : 0, enabled: !!save.settings.music });
async function initAudio() {
  if (actx) return;
  try {
    actx = new AudioContext();
    // 采样变体组（木叩/磬，真实录音各 5 变体轮播防重复感）——全部事件音都走这里，不用合成音
    const groups                          = [
      ['wood_light', 'impactWood_light'], ['wood_medium', 'impactWood_medium'], ['bell_heavy', 'impactBell_heavy']];
    groups.forEach(([key, file]) => {
      for (let i = 0; i < 5; i++) {
        (async () => {
          try {
            const r = await fetch(`assets/lib/kenney-impact-sounds/audio/${file}_00${i}.mp3`);
            sfxBuf[`${key}_${i}`] = await actx .decodeAudioData(await r.arrayBuffer());
          } catch (e) {}
        })();
      }
    });
    // 环境风声：滤波噪声循环（唯一持续层，极低音量只垫底）
    const len = actx.sampleRate * 3;
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.6;
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = actx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = 0.4;
    const gain = actx.createGain(); gain.gain.value = save.settings.ambient ? 0.026 : 0;
    src.connect(filter); filter.connect(gain); gain.connect(actx.destination);
    src.start();
    ambientNodes = { gain, filter };
    void startMusic();
  } catch (e) { actx = null; }
}
async function startMusic() {
  if (!actx || chantBuf) return chantBuf;
  if (chantLoad) return chantLoad;
  chantLoad = (async () => {
    try {
      const r = await fetch('assets/bgm-amituofo-chant.mp3');
      if (!r.ok) throw new Error(`唱赞资源 ${r.status}`);
      chantBuf = await actx.decodeAudioData(await r.arrayBuffer());
      return chantBuf;
    } catch (e) {
      return null;
    } finally {
      chantLoad = null;
    }
  })();
  return chantLoad;
}
// 唱赞留着句柄才停得下来：从前起了就撒手，人离开及第面板后它还在唱，
// 除了去设置里静音别无办法。
let chantNode = null;
async function playChant() {
  if (!actx || !save.settings.music || performance.now() < chantUntil) return;
  const b = chantBuf || await startMusic();
  if (!b || !actx || !save.settings.music) return;
  chantUntil = performance.now() + b.duration * 1000;
  const s = actx.createBufferSource(); s.buffer = b;
  const g = actx.createGain(); g.gain.value = 0.42;
  s.connect(g); g.connect(actx.destination); s.start();
  s.onended = () => { if (chantNode === s) chantNode = null; };
  chantNode = s;
}
function stopChant() {
  chantUntil = 0;
  if (!chantNode) return;
  try { chantNode.stop(); } catch (e) { /* 已自然结束 */ }
  chantNode = null;
}
// 事件音映射：旧名保留，但全部落到真实采样（sfxr 合成 wav 已弃用）
const SFX_MAP                                   = {
  'sfx-tap': ['wood_light', 1.0], 'sfx-layer': ['bell_heavy', 0.85],
  'sfx-fav': ['bell_heavy', 1.35], 'sfx-done': ['bell_heavy', 1.05] };
function playSfx(name        , vol = 0.4) {
  const m = SFX_MAP[name]; if (!m) return;
  playVar(m[0], vol * 0.72, m[1]);
}
// 振动分级（手机体感；桌面/不支持则静默忽略）
function vib(p                   ) { try { (navigator       ).vibrate?.(p); } catch { /* 不支持则忽略 */ } }
function playVar(key        , vol = 0.4, rate = 1) {
  if (!actx || !save.settings.sfx) return;
  const b = sfxBuf[`${key}_${Math.floor(Math.random() * 5)}`]; if (!b) return;
  const s = actx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
  const g = actx.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(actx.destination); s.start();
}
// 旧名 playBell 保留：合成磬已改为真实磬采样（rate 随目标音高，音量换算到采样口径）
function playBell(base = 196, vol = 0.05) {
  playVar('bell_heavy', Math.min(0.3, vol * 5), Math.max(0.55, Math.min(1.7, base / 294)));
}

// ---------------- 渲染基础 ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(app.clientWidth, app.clientHeight);
const isCoarse = matchMedia('(pointer:coarse)').matches; // v221 功耗治理：触屏机（手机/平板）默认省电档
renderer.setPixelRatio(Math.min(devicePixelRatio, save.settings.lowPerf ? 1 : isCoarse ? 1.6 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22; // v210 写实CG：曝光再抬一线（ACES 曲线下亮部更透）
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.FogExp2(C.bg, 0.0016); // 开机＝LIGHT_SCENES.saha（内联因 fogBase 声明在后；改光先改预设表）

const camera = new THREE.PerspectiveCamera(52, app.clientWidth / app.clientHeight, 0.5, 4000);
camera.position.set(80, 125, 300); // 全图主视角略偏南面：正看吠琉璃主面，避免镜头正卡四宝山角而误读成左右两半

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 42, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 36; controls.maxDistance = 520;
controls.maxPolarAngle = 1.52; controls.minPolarAngle = 0.06;
controls.screenSpacePanning = false;

const hemi = new THREE.HemisphereLight(0x3d5273, 0x2a3347, 0.85); // v191 压底光抬光比；开机值＝LIGHT_SCENES.saha
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdfae, 3.0);
sun.position.set(50, 130, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02; // v210：曲面阴影去痤疮（束腰山体/球珠曲面）
const sc = sun.shadow.camera                            ;
sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 400;
scene.add(sun);
// v191 写实化：冷色轮廓光自背面提体积（不投影，不违反单投影灯）+ RoomEnvironment 供 PBR 环境反射
const rim = new THREE.DirectionalLight(0x8fb4e6, 0.85); // v210 轮廓光加一档：电影感体积分离
rim.position.set(-130, 55, -150);
scene.add(rim);

// v331 全局光影总纲（用户点单「统一思考规划全局光影」）：一场一预设，本表＝全局光路唯一真源。
// 光的竖轴叙事：幽冥暗紫（日月威光不及）→娑婆夜蓝（日月星宿所照）→星盘/谱页同天色而雾薄（观照之场去遮蒍）→极乐暖金（佛光金色，不假日月）。
// 硬红线：雾色恒等背景色（地平无缝）；全局唯一投影灯＝sun（rim/hemi 不投影）；亮度语汇走自发光阶梯（T1-T4/CHAN_HUE/SFP_BEAD_TONE）不走加灯；
// bloom 三参 0.42/0.35/0.85 只咬光源档勿松；新场景光先改表，禁止现场散设 fog/hemi
const LIGHT_SCENES = {
  saha: { bg: C.bg, fog: 0.0016, hemiC: 0x3d5273, hemiI: 0.85 },      // 全图：夜蓝基调，日暖月冷双源对峙
  sky: { bg: C.bg, fog: 0.0006, hemiC: 0x3d5273, hemiI: 0.85 },       // 星盘：同天色，雾退三档——星位逐珠必清
  disc: { bg: C.bg, fog: 0.0005, hemiC: 0x3d5273, hemiI: 0.85 },      // 谱页：雾最薄，短行阵正对镜头
  pureland: { bg: 0x2a2038, fog: 0.0014, hemiC: 0xe8c87a, hemiI: 1.1 }, // 极乐：暖金包围光，天色紫晦衽金
  nether: { bg: 0x161020, fog: 0.0022, hemiC: 0x453548, hemiI: 1.0 },   // 幽冥：暗紫压色，雾最浓——窈窈冥冥之义
}         ;
function applyLight(k                           ) {
  const p = LIGHT_SCENES[k];
  scene.fog = new THREE.FogExp2(p.bg, p.fog); fogBase = p.fog;
  scene.background = new THREE.Color(p.bg);
  hemi.color.set(p.hemiC); hemi.intensity = p.hemiI;
}
(window       ).__lightDbg = () => ({ bg: (scene.background               ).getHex(), fog: +(scene.fog                 ).density.toFixed(5), base: fogBase, hemi: hemi.color.getHex(), hi: hemi.intensity }); // 自测钩子（只读）
(window       ).__glowDbg = () => { // 自测钩子（只读）：全场发光体普查——加色叠层清单 + 过泛光阈(≥0.85)自发光清单
  const add                                  = []; const hiE                          = [];
  scene.traverseVisible(o => {
    const ms = (o       ).material; if (!ms) return;
    for (const m of Array.isArray(ms) ? ms : [ms]) {
      if (m.blending === THREE.AdditiveBlending) add.push([o.type, +(m.opacity ?? 1).toFixed(2), +Math.max(o.scale.x, o.scale.y).toFixed(1)]);
      if ((m.emissiveIntensity ?? 0) >= 0.85 && (m.emissive?.getHex?.() ?? 0) > 0) hiE.push([o.type, +m.emissiveIntensity.toFixed(2)]);
    }
  });
  return { addN: add.length, hiN: hiE.length, add, hiE };
};

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42; // v210 写实CG：反射抬一档，宝珠/金属吃环境更实
}

let composer                        = null;
let bloomPass                         = null;
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(app.clientWidth, app.clientHeight), 0.34, 0.38, 0.86); // 光噪减负：强度砍四成、阈值抬高——只最亮处泛光，余皆干净
  if (isCoarse) { // v221：手机泛光缓冲减半——全屏模糊链是发热大头，半分辨率视觉近无差
    const bs = bloomPass.setSize.bind(bloomPass);
    bloomPass.setSize = (w, h) => bs(Math.ceil(w / 2), Math.ceil(h / 2));
    bloomPass.setSize(app.clientWidth, app.clientHeight);
  }
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}
setupComposer();
// v221 DPR 统一入口：省电档/触屏档/自适应降档三者合流（降档不回升，防振荡）
let dprScale = 1;
function applyDpr() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, (save.settings.lowPerf ? 1 : isCoarse ? 1.6 : 2) * dprScale));
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(app.clientWidth, app.clientHeight); }
}
// 交互瞬时提帧：触摸/滚轮后 1s 内全帧率，静观期 30fps（见主循环节流）
let perfBoostUntil = 0;
const perfBump = () => { perfBoostUntil = performance.now() + 1000; };
renderer.domElement.addEventListener('pointerdown', perfBump);
renderer.domElement.addEventListener('pointermove', (e) => { if (e.buttons) perfBump(); });
renderer.domElement.addEventListener('wheel', perfBump, { passive: true });

const texLoader = new THREE.TextureLoader();
function loadTex(url        , repeat = 1) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; // v210 写实CG：斜视角纹理保锐
  if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
const mineralTex = loadTex('assets/tex-mineral.jpg', 3);
const mineralTexFine = loadTex('assets/tex-mineral.jpg', 8);
// v191 写实化：岩石 PBR 法线/ARM（Rock013，青绿矿脉切矿彩色谱）+ 风纹水波法线（Ground098，主循环滑 offset 作活水）——皆 CC0（ambientCG）
function loadLin(url        , repeat        ) { // 法线/ARM 图不设 colorSpace
  const t = texLoader.load(url); t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t;
}
const rockN = loadLin('assets/lib/ambientcg-materials/textures/rock/Rock013/normal.jpg', 2);
const rockA = loadLin('assets/lib/ambientcg-materials/textures/rock/Rock013/arm.jpg', 2);
const rippleN = loadLin('assets/lib/ambientcg-materials/textures/ground/Ground098/normal.jpg', 5);
const rippleNS = new THREE.Vector2(0.55, 0.55);
let windWheelM            ; // v211 风轮缓旋句柄（俱舍：业风持世——以缓旋表其恒转不息）

// 星空：对齐 V90，只保留分层锐利点星 + 淡银河带；不叠加天穹渐变或地平加色光晕
const starGroup = new THREE.Group();
starGroup.name = 'programStars';
scene.add(starGroup);
const starLayers                                                                              = [];
{
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g2 = cv.getContext('2d') ;
  const gr = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 32, 32);
  const starTex = new THREE.CanvasTexture(cv);
  // 矿彩盘取色：暖白为主，金/朱/青点缀
  const PAL = [
    [0xefe0b4, 0.52], [0xfff6dd, 0.2], [0xd7aa45, 0.14], [0xc96a4a, 0.06], [0x8fb3c4, 0.08],
  ]                           ;
  const pickCol = (c             ) => {
    let r = Math.random();
    for (const [hex, w] of PAL) { if ((r -= w) <= 0) return c.setHex(hex); }
    return c.setHex(0xefe0b4);
  };
  const bandN = new THREE.Vector3(0.52, 0.74, 0.3).normalize(); // 银河带法线（斜跨天穹）
  const mkLayer = (count        , radius        , size        , baseOp        , band         , spd        ) => {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const v = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      do { v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize();
      if (band) { // 压向银河大圆：沿法线分量压缩后重归一
        const d = v.dot(bandN);
        v.addScaledVector(bandN, -d * 0.86).normalize();
      }
      v.multiplyScalar(radius * (0.96 + Math.random() * 0.08));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      pickCol(c);
      const dim = band ? 0.4 + Math.random() * 0.35 : 0.6 + Math.random() * 0.4;
      col[i * 3] = c.r * dim; col[i * 3 + 1] = c.g * dim; col[i * 3 + 2] = c.b * dim;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size, map: starTex, vertexColors: true, transparent: true, opacity: baseOp,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    (mat       ).fog = false;
    const pts = new THREE.Points(geo, mat);
    starGroup.add(pts);
    starLayers.push({ mat, base: baseOp, spd, ph: Math.random() * Math.PI * 2 });
  };
  mkLayer(950, 1580, 5.5, 0.6, false, 0.5);   // 远层繁星（微尘）；v218 全天幕降一档降噪
  mkLayer(380, 1340, 9, 0.7, false, 0.8);     // 中层
  mkLayer(130, 1120, 14, 0.8, false, 1.3);    // 近层亮星（呼吸最明显）
  mkLayer(700, 1500, 4.5, 0.3, true, 0.35);    // 银河带：密而淡
}
(window       ).__backgroundDbg = () => ({
  starLayers: starLayers.length,
  backdropMeshes: starGroup.children.filter(o => (o       ).isMesh).length,
  horizonGlows: scene.children.filter(o => o.name === 'horizonGlow').length,
}); // 自测钩子（只读）：V90 背景仅有四层程序星点，不含天穹面与地平加色面

// ---------------- 剖面 ----------------
const SECTION_MAX = 232, SECTION_MIN = -50; // 上限罩住无色界新高（v325 四空抬升至 223）；下限留在地底面（-52）之上：免剪平面与地底盖共面 z-fight
let sectionH = SECTION_MAX;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), SECTION_MAX);
function setSection(h        ) {
  sectionH = THREE.MathUtils.clamp(h, SECTION_MIN, SECTION_MAX);
  clipPlane.constant = sectionH;
  updateSectionUI();
  if (ambientNodes) ambientNodes.filter.frequency.value = sectionH < 0 ? 200 : 380;
}
function clippable(mat                ) { (mat       ).clippingPlanes = [clipPlane]; return mat; }
// 幽冥窗（v153 用户点单：四恶趣不易看到）：镜头飞向地下目标时剖面自动缓降开窗——
// 洲下诸狱/海下修罗宫随视线自现；回望地上（target 升回）自动复原；手动拖杆即接管不再自动
let secAnimTo                = null;
let secAuto = false;
let secPrev = SECTION_MAX;
function netherOpen(ty        ) {
  if (!secAuto) secPrev = sectionH;
  secAuto = true;
  secAnimTo = Math.max(SECTION_MIN, Math.min(sectionH, Math.min(-1, ty + 10)));
}
function netherCancel() { secAnimTo = null; secAuto = false; }

// ---------------- 世界构建 ----------------
const saha = new THREE.Group(); scene.add(saha);       // 娑婆沙盘
const nodesRoot = new THREE.Group(); scene.add(nodesRoot); // 节点标记（独立于沙盘缩放）
// 幽冥家族（v171 用户定案：四恶趣不再用全局剖视）：洲下诸狱/修罗宫改挂此组，
// 全景随 saha 同隐同现（埋地下、手动剖面滑杆仍可见）；入幽冥专场时独显，配地层剖块模型
const netherScene = new THREE.Group(); scene.add(netherScene);
const mandala = new THREE.Group(); scene.add(mandala); // 心性曼荼罗
const pureLand = new THREE.Group(); pureLand.position.set(-2000, 0, 0); scene.add(pureLand);
pureLand.visible = false; // 只在极乐观照时显：程序星辰无遮挡，否则主图远望可见其背景画随视差飘移
// 色界观照场（v140，用户点单）：全景只留「色界诸天」一星一题字，双击/卡钮转场进入，
// 坛城全模型专场呈现（与极乐同一套语法）。子树留在原坐标（门5/8/10行棋数据不动），
// 整组显隐：全景默隐、行棋涉禅天自动现、入场时独显
const skyRealm = new THREE.Group(); scene.add(skyRealm);
skyRealm.visible = false;
const skyDiscMats                                           = [];
// 场内撑开（v165 用户点单，语法同菩萨道场）：入场整座坛城绕坛心等比放大——星/金环线/云盘/定梯一个变换全跟走，出场复原
let skySpread = false;
const SKY_K = 1.7, SKY_YC = 166;
function skyRelayout(on         ) {
  if (skySpread === on) return; skySpread = on;
  skyRealm.scale.setScalar(on ? SKY_K : 1);
  skyRealm.position.y = on ? SKY_YC * (1 - SKY_K) : 0; // 绕坛心 y 撑开：坛心高度不动
  skyRealm.updateMatrixWorld(true);
  // v223：云盘明暗改由帧循环「随聚显呼吸」统一驱动（本层提亮、他层退隐、全览平息），此处不再静态压暗
}
// 禅层横导航（v166 用户点单，语法同菩萨道场科名签）：点签俯冲该层环、他层题字暂退、独亮该环线；再点收回全景
let skySel = -1;
function setSkySel(l        ) {
  skySel = (l === skySel) ? -1 : l;
  skyNavSync();
  if (!inSky) return;
  playBell(skySel >= 0 ? 587 : 392, 0.04);
  if (skySel < 0) { flyTo(new THREE.Vector3(92, 222, 100), new THREE.Vector3(0, 168, 0), 1.0); return; } // 收回＝回入场全景
  const RY = [0, 149.4, 158.4, 167.4, 179.3][skySel], RR = [0, 14, 18, 22, 26][skySel];
  const yw = SKY_YC + (RY - SKY_YC) * SKY_K, rw = RR * SKY_K; // 撑开系下的环高/环径
  const az = camera.position.clone(); az.y = 0;
  if (az.lengthSq() < 1) az.set(1, 0, 0.6);
  az.normalize();
  flyTo(new THREE.Vector3(0, yw + rw * 1.05, 0).addScaledVector(az, rw * 2.0), new THREE.Vector3(0, yw, 0), 1.1); // 保持现方位角，只调高度与俯角（同道场）
}
let inSky = false;
let inBodhi = false; // 菩萨道场专场（v152 用户点单）：双击菩萨法界星转场入座，四教位次全铺
const SKY_IDS = new Set(['chan1', 'chan2', 'chan3', 'chan4',
  'brahmakayika', 'brahmapurohita', 'mahabrahma', 'parittabha', 'apramanabha', 'abhasvara',
  'parittasubha', 'apramanasubha', 'subhakrtsna',
  'punyaprasava', 'anabhraka', 'brhatphala', 'asamjnika', 'avrha', 'atapa', 'sudarsana', 'sudrsa', 'akanistha']);

// 深空云雾星云层：已撤（用户点名去除视觉噪音；assets/nebula-*.jpg 保留在盘不再加载）

function stdMat(color        , opt      = {}) {
  return clippable(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08, ...opt }));
}
function goldMat(emissiveIntensity = 0.55, opt      = {}) {
  return clippable(new THREE.MeshStandardMaterial({
    color: C.gold, emissive: C.gold, emissiveIntensity, roughness: 0.45, metalness: 0.5, ...opt,
  }));
}
function addEdges(mesh            , color = C.gold, opacity = 0.5) {
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry       , 20),
    clippable(new THREE.LineBasicMaterial({ color, transparent: true, opacity }))       
  );
  mesh.add(e);
}

// 大海基盘 + 地下
{
  // 大海顶面：径向渐深水色（近山浅碧→外缘深沉）+ 隐约同心波环；侧面仍矿彩
  const seaTopTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const g = cv.getContext('2d') ;
    const rg = g.createRadialGradient(256, 256, 30, 256, 256, 256);
    rg.addColorStop(0, '#7fb9b4'); rg.addColorStop(0.35, '#5f9aa2');
    rg.addColorStop(0.7, '#3f7484'); rg.addColorStop(1, '#28505f');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let r = 60; r < 256; r += 22) { g.lineWidth = 1 + (r % 44 === 60 % 44 ? 1 : 0); g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sea = new THREE.Mesh(new THREE.CylinderGeometry(130, 130, 12, 96), [
    stdMat(0x86b9c6, { map: mineralTex, side: THREE.DoubleSide, roughness: 0.5, emissive: 0x123239, emissiveIntensity: 0.3 }),
    stdMat(0xcfe8e2, { map: seaTopTex, roughness: 0.42, metalness: 0.05, emissive: 0x123239, emissiveIntensity: 0.28, normalMap: rippleN, normalScale: rippleNS }), // v191 活水法线；光噪减负
    stdMat(0x1c3038, { roughness: 0.9 }),
  ]);
  sea.position.y = -6; sea.receiveShadow = true; saha.add(sea);
  // v211 地大与持世三轮写实化（俱舍·世间品：持世三轮＝风/水/金，经无火轮——地水火风乃四大种，大地层即地大）：
  // 岩层 PBR、凝金法线、活水法线共享海面慢滑、风轮缓旋；v217 三轮皆不反光（envMapIntensity 0）
  const earth = new THREE.Mesh(new THREE.CylinderGeometry(130, 118, 40, 96),
    stdMat(0x4a3c58, { side: THREE.DoubleSide, map: mineralTex, roughness: 0.95, normalMap: rockN, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: rockA }));
  earth.position.y = -32; earth.receiveShadow = true; saha.add(earth);
  // 三轮持世（俱舍·世间品：风轮依空最居下而最广，次上水轮，水上凝结成金轮，九山八海依之）
  const goldWheel = new THREE.Mesh(new THREE.CylinderGeometry(132, 132, 4, 96),
    goldMat(0.3, { color: 0xcf9f4c, emissive: 0x8a682f, roughness: 0.6, metalness: 0.12, envMapIntensity: 0, map: mineralTex, normalMap: rockN, normalScale: new THREE.Vector2(0.8, 0.8) })); // v217 金轮归七金山同色系，不反光
  goldWheel.position.y = -60; saha.add(goldWheel);
  const waterWheel = new THREE.Mesh(new THREE.CylinderGeometry(132, 126, 10, 96),
    stdMat(0x2b5e77, { roughness: 0.5, metalness: 0, envMapIntensity: 0, transparent: true, opacity: 0.66, emissive: 0x123239, emissiveIntensity: 0.35, normalMap: rippleN, normalScale: rippleNS })); // 共享活水法线随海面同滑；v217 三轮皆不反光
  waterWheel.position.y = -67; saha.add(waterWheel);
  windWheelM = new THREE.Mesh(new THREE.CylinderGeometry(176, 168, 20, 96),
    stdMat(0x2a3350, { roughness: 0.75, metalness: 0, envMapIntensity: 0, transparent: true, opacity: 0.6, emissive: 0x141d38, emissiveIntensity: 0.4, normalMap: rippleN, normalScale: new THREE.Vector2(0.8, 0.8) }));
  windWheelM.position.y = -82; saha.add(windWheelM); // v329 三轮厚序勘正（俱舶风16洛叉/水8洛叉/金3.2洛叉，5:2.5:1）：旧水14>风9颠倒，今金4/水10/风20三层相接无隙 -58..-62..-72..-92；风径176最广仍存广无数之义
  (window       ).__wheelDbg = () => [goldWheel, waterWheel, windWheelM].map(w => { const m = w.material                              ; return { e: m.emissiveIntensity, ehex: m.emissive.getHex(), c: m.color.getHex(), met: m.metalness, env: m.envMapIntensity }; }); // 自测钩子（只读）：v217 三轮不反光+金轮金山色断言
  // 地下八热地狱示意（南赡部洲下）
  for (let i = 0; i < 8; i++) {
    const r = 22 - i * 1.8, y = -22 - i * 3.0;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.6, 40),
      clippable(new THREE.MeshStandardMaterial({
        color: C.cinn, emissive: 0x7a2f22, emissiveIntensity: 0.7 - i * 0.05, roughness: 0.9,
      })));
    d.position.set(8, y, 26);
    netherScene.add(d);
  }
  // 八寒地狱（俱舍：八寒在八热之傍，亦赡部洲下）：冰青色叠层，位八热之西
  for (let i = 0; i < 8; i++) {
    const r = 12 - i * 0.9, y = -22 - i * 3.0;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.4, 32),
      clippable(new THREE.MeshStandardMaterial({
        color: 0x9fc4d8, emissive: 0x3a6a86, emissiveIntensity: 0.5 - i * 0.03, roughness: 0.6,
      })));
    d.position.set(-34, y, 30);
    netherScene.add(d);
  }
  // 阿修罗宫（起世经：修罗宫在须弥山北大海之下）：海下暗铜宫城，剖面可见
  {
    const g = new THREE.Group(); g.position.set(-60, -13, -60); netherScene.add(g);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 16),
      clippable(new THREE.MeshStandardMaterial({ color: 0x7a4638, emissive: 0x552a20, emissiveIntensity: 0.5, roughness: 0.7, metalness: 0.3 })));
    g.add(wall);
    [[-5, -5], [5, 5], [-5, 5], [5, -5]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 5, 6),
        clippable(new THREE.MeshStandardMaterial({ color: 0x8b5140, emissive: 0x5e2f22, emissiveIntensity: 0.55, roughness: 0.65, metalness: 0.3 })));
      t.position.set(x, 3.5, z); g.add(t);
    });
  }
}
  // 地下八热地狱示意（南赡部洲下）
  for (let i = 0; i < 8; i++) {
    const r = 22 - i * 1.8, y = -22 - i * 3.0;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.6, 40),
      clippable(new THREE.MeshStandardMaterial({
        color: C.cinn, emissive: 0x7a2f22, emissiveIntensity: 0.7 - i * 0.05, roughness: 0.9,
      })));
    d.position.set(8, y, 26);
    saha.add(d);
  }
  // 八寒地狱（俱舍：八寒在八热之傍，亦赡部洲下）：冰青色叠层，位八热之西
  for (let i = 0; i < 8; i++) {
    const r = 12 - i * 0.9, y = -22 - i * 3.0;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.4, 32),
      clippable(new THREE.MeshStandardMaterial({
        color: 0x9fc4d8, emissive: 0x3a6a86, emissiveIntensity: 0.5 - i * 0.03, roughness: 0.6,
      })));
    d.position.set(-34, y, 30);
    saha.add(d);
  }
  // 阿修罗宫（起世经：修罗宫在须弥山北大海之下）：海下暗铜宫城，剖面可见
  {
    const g = new THREE.Group(); g.position.set(-60, -13, -60); saha.add(g);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 16),
      clippable(new THREE.MeshStandardMaterial({ color: 0x7a4638, emissive: 0x552a20, emissiveIntensity: 0.5, roughness: 0.7, metalness: 0.3 })));
    g.add(wall);
    [[-5, -5], [5, 5], [-5, 5], [5, -5]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 5, 6),
        clippable(new THREE.MeshStandardMaterial({ color: 0x8b5140, emissive: 0x5e2f22, emissiveIntensity: 0.55, roughness: 0.65, metalness: 0.3 })));
      t.position.set(x, 3.5, z); g.add(t);
    });
  }

// 须弥山（四宝四面：东白银 · 南吠琉璃 · 西颇胝迦 · 北黄金）
{
  const face = (c        ) => stdMat(c, { map: mineralTexFine, roughness: 0.7, emissive: c, emissiveIntensity: 0.18, normalMap: rockN, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: rockA });
  // BoxGeometry 面序 [+x,-x,+y,-y,+z,-z]；场景中 +x=东，+z=南
  const sumeruMats = () => {
    const top = face(0xcdb679); // 忉利金地（俱舍：山顶地平如掌，真金所成）
    const und = face(0xbcd6c8);
    return [face(0xdde2e9), face(0xd9cde6), top, und, face(0x5f93c2), face(0xe2bc60)];
  };
  // 山体（v201 模型优化，用户点单）：四段方箱阶梯 → 束腰方截面光滑放样——
  // 超椭圆截面方中带圆（四方之制仍在）、剖面束腰（出水渐敛、腰细、近顶复张，古图山形）、
  // 周向微岩理起伏破直边。v202 四宝材质如实还原（用户点单）：四向按对角分组挂四种 MeshPhysicalMaterial——
  // 东白银/北黄金＝真金属（高 metalness+环境反射），南吠琉璃/西颇胝迦＝宝石玻光（清漆高光+微内蕴光），
  // 皆保留岩石法线（斫宝成山，非镜面抛光）
  {
    const prof                          = [[-20, 27], [0, 24.5], [20, 20.5], [38, 16.8], [52, 14.8], [64, 17], [74, 20], [80, 22.6]];
    const N = 64, P = 5; // 周向段数 / 超椭圆指数
    const pos           = [], uvs           = [], colors           = [], idx             = [[], [], [], []];
    // 四宝仍各守东南西北，但不能用四套 PBR 材质在山角硬切：金属度/清漆差会形成整条竖直光缝，
    // 斜视时正落画面中央，看起来像把须弥山劈成蓝白两半。改为一套石质 PBR，宝色在山角宽缓过渡。
    const jewelColors = [new THREE.Color(0xe8edf2), new THREE.Color(0x2a5fa8), new THREE.Color(0xe4dcf0), new THREE.Color(0xe2b84f)];
    const jewelAxes = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // 东白银 · 南吠琉璃 · 西颇胝迦 · 北黄金
    for (let j = 0; j < prof.length; j++) {
      const [y, hw] = prof[j];
      for (let i = 0; i <= N; i++) {
        // 首尾点共用完全相同的几何角度；UV 仍分别保留 0/4，才能无拉伸地环绕贴图。
        // 旧写法在 2π 处经超椭圆幂运算后会留下微小坐标差，法线也因首尾顶点未焊接而断开。
        const a = i === N ? 0 : i / N * Math.PI * 2;
        const cx = Math.cos(a), cz = Math.sin(a);
        const ux = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / P);
        const uz = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / P);
        const wob = 1 + 0.02 * Math.sin(a * 5 + y * 0.23) + 0.013 * Math.sin(a * 9 - y * 0.41);
        pos.push(ux * hw * wob, y, uz * hw * wob);
        uvs.push(i / N * 4, (y + 20) / 100 * 2.6);
        let cr = 0, cg = 0, cb = 0, ws = 0;
        for (let k = 0; k < 4; k++) {
          const w = Math.pow(Math.max(0, Math.cos(a - jewelAxes[k])), 4);
          cr += jewelColors[k].r * w; cg += jewelColors[k].g * w; cb += jewelColors[k].b * w; ws += w;
        }
        colors.push(cr / ws, cg / ws, cb / ws);
      }
    }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < N; i++) {
      const ac = (i + 0.5) / N * Math.PI * 2;
      const cx = Math.cos(ac), cz = Math.sin(ac);
      const g = Math.abs(cx) >= Math.abs(cz) ? (cx > 0 ? 0 : 2) : (cz > 0 ? 1 : 3); // 0东 1南 2西 3北（+x=东 +z=南）
      const a = j * (N + 1) + i, b2 = a + N + 1;
      idx[g].push(a, b2, a + 1, b2, b2 + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const all           = [];
    idx.forEach(arr => all.push(...arr));
    geo.setIndex(all); geo.computeVertexNormals();
    // BufferGeometry 为保留 UV 环缝复制了第 0/N 个顶点，computeVertexNormals 不会跨复制点平均，
    // 定向光与 PBR 法线贴图因此会在须弥山东面形成一条纵向明暗切口，看起来像山体被劈成两半。
    // 逐层把环缝两侧法线归一化为同一值；几何和四宝分面仍保持不变。
    const normal = geo.getAttribute('normal');
    for (let j = 0; j < prof.length; j++) {
      const a = j * (N + 1), b = a + N;
      let nx = normal.getX(a) + normal.getX(b);
      let ny = normal.getY(a) + normal.getY(b);
      let nz = normal.getZ(a) + normal.getZ(b);
      const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
      nx *= inv; ny *= inv; nz *= inv;
      normal.setXYZ(a, nx, ny, nz);
      normal.setXYZ(b, nx, ny, nz);
    }
    normal.needsUpdate = true;
    geo.userData.seamStitched = true;
    const jewelMat = clippable(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true,
      normalMap: rockN, normalScale: new THREE.Vector2(0.7, 0.7),
      metalness: 0.16, roughness: 0.34, clearcoat: 0.72, clearcoatRoughness: 0.28,
      emissive: 0x101828, emissiveIntensity: 0.1, envMapIntensity: 0.82,
    }));
    const body = new THREE.Mesh(geo, jewelMat);
    body.name = 'sumeruBody';
    body.castShadow = true; body.receiveShadow = true; saha.add(body);
    (window       ).__sumeruSeam = () => {
      const position = geo.getAttribute('position');
      const normals = geo.getAttribute('normal');
      let positionGap = 0, normalGap = 0;
      for (let j = 0; j < prof.length; j++) {
        const a = j * (N + 1), b = a + N;
        positionGap = Math.max(positionGap, Math.hypot(
          position.getX(a) - position.getX(b),
          position.getY(a) - position.getY(b),
          position.getZ(a) - position.getZ(b),
        ));
        normalGap = Math.max(normalGap, Math.hypot(
          normals.getX(a) - normals.getX(b),
          normals.getY(a) - normals.getY(b),
          normals.getZ(a) - normals.getZ(b),
        ));
      }
      return {
        stitched: !!geo.userData.seamStitched,
        positionGap,
        normalGap,
        materialCount: Array.isArray(body.material) ? body.material.length : 1,
        colorBlend: !!geo.getAttribute('color'),
      };
    };
    // 顶台方盖（v204 修复，用户报缺）：v202 改写时误吞——放样上口无封，山顶与忉利天之间露出无背面空腔（黑透窟窿）。
    // 补回忉利金地方台（46.6 略宽于上口 23.05 极值，盖严岩理起伏），侧面仍循四宝色
    const capMesh = new THREE.Mesh(new THREE.BoxGeometry(46.6, 4, 46.6), sumeruMats()       );
    capMesh.name = 'sumeruCap';
    capMesh.position.y = 82; capMesh.castShadow = true; capMesh.receiveShadow = true;
    addEdges(capMesh, C.gold, 0.75); saha.add(capMesh);
  }
  // 四宝光映空（俱舍卷十一「隨寶威德。色顯於空」）：四面各起本色微光——南面琉璃映空即此洲天蓝之由
  ([[58, 0, '221,226,233'], [-58, 0, '217,205,230'], [0, 58, '95,147,194'], [0, -58, '226,188,96']]                                   ).forEach(([x, z, rgb]) => {
    const s = new THREE.Sprite(clippable(new THREE.SpriteMaterial({
      map: makeGlow(rgb), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.05, fog: false,
    }))                        ); // v214：映空宝光随山壳同剪，免剖至地底时悬浮
    s.position.set(x, 46, z); s.scale.set(46, 52, 1); saha.add(s); // v333 义保幅减（旧 85×95/0.13）；v334 用户点单山腰主发光唯日月：再收 46×52/0.05 退为气息
  });
  // 山腰四层级（俱舍卷十一颂义：妙高层有四，相去各十千，傍出十六八四二千——
  // 初级坚手天（坚首）、二级持鬘天（持华鬘）、三级恒憍天（即常放逸天）、第四级四大天王；名兼采长阿含）
  // v205 优化（用户点单）：方箱环级退役，改随山体超椭圆截面的同形环带，与放样山体贴合无缝
  const seRingPts = (hw        ) => {
    const pts                  = [];
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      pts.push(new THREE.Vector2(Math.sign(cx) * Math.pow(Math.abs(cx), 0.4) * hw, Math.sign(cz) * Math.pow(Math.abs(cz), 0.4) * hw));
    }
    return pts;
  };
  // v334 山腰重规划（用户点单：腰圈光污染收治＋呈现重设计）：金光带退役→四宝随面石阶制——
  // ①傍出半半律（俱舶十六八四二）：下宽上窄 6.4/3.2/1.6，第四级＝四天王平台其义自足；
  // ②石质去发光：随山体四宝面降饱和顺色（顶点色四向渐变无缝），靠日照投影读形，山腰不再是光带
  const JEWEL_STONE = [[0.72, 0.75, 0.78], [0.30, 0.42, 0.60], [0.66, 0.62, 0.73], [0.74, 0.62, 0.36]]; // 东白银·南吠琉璃·西颇胝迦·北黄金
  const AXE = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // 世界角：东+x、南+z、西、北（shape.y → 世界 -z）
  ([[10, 27.8, 21.4], [20, 22.6, 19.4], [30, 18.9, 17.3]]                                   ).forEach(([y, ho, hi]) => {
    const sh = new THREE.Shape(seRingPts(ho)); sh.holes.push(new THREE.Path(seRingPts(hi)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false });
    const pa = g.attributes.position; const col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const a = Math.atan2(-pa.getY(i), pa.getX(i));
      let r = 0, gr = 0, b = 0, ws = 0;
      for (let k = 0; k < 4; k++) {
        const w = Math.pow(Math.max(0, Math.cos(a - AXE[k])), 2);
        r += JEWEL_STONE[k][0] * w; gr += JEWEL_STONE[k][1] * w; b += JEWEL_STONE[k][2] * w; ws += w;
      }
      col[i * 3] = r / ws; col[i * 3 + 1] = gr / ws; col[i * 3 + 2] = b / ws;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, stdMat(0xffffff, { vertexColors: true, roughness: 0.72, metalness: 0.18, emissive: 0x26221a, emissiveIntensity: 0.6 }));
    m.rotation.x = -Math.PI / 2; m.position.y = y - 0.8;
    m.castShadow = true; m.receiveShadow = true; saha.add(m);
  });
  // 山腰诸药叉宫阁：v334 光污染收治——72座发光金箱＝腰圈主病灶，减为 36 座向面心聚拢成宫城，金身发光 0.3→0.12 如灯火气息
  {
    const halls                                                                      = [];
    ([[10, 25.6, 4], [20, 21.4, 3], [30, 18.3, 2]]                                   ).forEach(([y, hr, n]) => {
      for (let k = 0; k < 4; k++) for (let i = 0; i < n; i++) {
        const a = (k * 90 + (((i + 0.5) / n) - 0.5) * 46) * Math.PI / 180;
        const cx = Math.cos(a), cz = Math.sin(a);
        halls.push({
          x: Math.sign(cx) * Math.pow(Math.abs(cx), 0.4) * hr, y: y + 0.8,
          z: Math.sign(cz) * Math.pow(Math.abs(cz), 0.4) * hr,
          sy: 1.3 + ((i * 7 + k * 3 + y) % 5) * 0.14, yaw: -a,
        });
      }
    });
    const bodyIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1, 1.5),
      stdMat(0xbfae83, { emissive: 0x574722, emissiveIntensity: 0.12, roughness: 0.65, metalness: 0.2 }), halls.length);
    const roofIM = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 0.9, 4),
      stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.15 }), halls.length);
    const M = new THREE.Matrix4(), pv = new THREE.Vector3(), sv = new THREE.Vector3(),
      q = new THREE.Quaternion(), qr = new THREE.Quaternion(), eu = new THREE.Euler();
    halls.forEach((h, i) => {
      q.setFromEuler(eu.set(0, h.yaw, 0));
      M.compose(pv.set(h.x, h.y + h.sy / 2, h.z), q, sv.set(1, h.sy, 1));
      bodyIM.setMatrixAt(i, M);
      qr.setFromEuler(eu.set(0, h.yaw + Math.PI / 4, 0));
      M.compose(pv.set(h.x, h.y + h.sy + 0.45, h.z), qr, sv.set(1, 1, 1));
      roofIM.setMatrixAt(i, M);
    });
    bodyIM.instanceMatrix.needsUpdate = true; roofIM.instanceMatrix.needsUpdate = true;
    bodyIM.castShadow = roofIM.castShadow = true;
    saha.add(bodyIM, roofIM);
  }
  // 入水段（俱舍：出水八万由旬、入水八万由旬）——水下山体直抵金轮上际，剖面可见
  const root = new THREE.Mesh(new THREE.BoxGeometry(54, 38, 54),
    stdMat(0x35494e, { map: mineralTexFine, roughness: 0.9 }));
  root.position.y = -39; saha.add(root); // v329 补齐：旧底 -54 与金轮上际 -58 悬空一截，今实抵
  // 善见城（v203 山顶优化）：实心金箱退役——金基城垣四面留门、四门楼、四隅角楼，中央三层殊胜殿高起
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.7, 15.5), goldMat(0.3, { roughness: 0.5 }));
    base.position.y = 84.35; base.receiveShadow = true; addEdges(base, C.paleGold, 0.8); saha.add(base);
    // 四垣（高一由旬半，相对殿低）：每面两段留中门
    const wallM = () => goldMat(0.26, { color: 0xd8c58b, emissive: 0x8a6a20, roughness: 0.55 });
    ([[4.25, 7, 0], [-4.25, 7, 0], [4.25, -7, 0], [-4.25, -7, 0], [7, 4.25, 1], [7, -4.25, 1], [-7, 4.25, 1], [-7, -4.25, 1]]                                   ).forEach(([u, w, rot]) => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(rot ? 0.8 : 5.5, 2.2, rot ? 5.5 : 0.8), wallM());
      g.position.set(rot ? w : u, 85.8, rot ? u : w); g.castShadow = true; saha.add(g);
    });
    // 四门楼（当面中开）
    ([[0, 7, 0], [0, -7, 0], [7, 0, 1], [-7, 0, 1]]                                   ).forEach(([x, z, rot]) => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(rot ? 1.7 : 3, 3, rot ? 3 : 1.7), goldMat(0.32, { color: C.paleGold, emissive: 0x8a6a20 }));
      d.position.set(x, 86.2, z); d.castShadow = true; addEdges(d, C.gold, 0.55); saha.add(d);
      const r = new THREE.Mesh(new THREE.ConeGeometry(2, 1.1, 4), stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.3 }));
      r.position.set(x, 88.25, z); r.rotation.y = Math.PI / 4; saha.add(r);
    });
    // 四隅角楼
    ([[7, 7], [7, -7], [-7, 7], [-7, -7]]                           ).forEach(([x, z]) => {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 2.4), goldMat(0.3, { color: C.paleGold, emissive: 0x8a6a20 }));
      tw.position.set(x, 86.1, z); tw.castShadow = true; addEdges(tw, C.gold, 0.6); saha.add(tw);
      const tr = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.3, 4), stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.3 }));
      tr.position.set(x, 88.15, z); tr.rotation.y = Math.PI / 4; saha.add(tr);
    });
    // 殊胜殿（帝释所居，城中高广）：三层收分 + 攒尖金顶
    ([[5.6, 2.2, 85.8], [4.4, 2, 87.9], [3.2, 1.8, 89.8]]                                   ).forEach(([w, h, y]) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), goldMat(0.38, { roughness: 0.45 }));
      t.position.y = y; t.castShadow = true; addEdges(t, C.paleGold, 0.8); saha.add(t);
    });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2, 4), stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.35 }));
    roof.position.y = 91.7; roof.rotation.y = Math.PI / 4; roof.castShadow = true; saha.add(roof);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), goldMat(0.85));
    tip.position.y = 93.1; saha.add(tip);
  }
  // 四天王天宫城（v205 优化：单宫 → 天王宫城——双层台基、四隅望柱、正殿两层攒尖金刹、左右配殿）
  // 东持国/南增长/西广目/北多闻（+x=东，+z=南，与四宝面同序）
  ([[26, 0], [-26, 0], [0, 26], [0, -26]]                           ).forEach(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); saha.add(g);
    const tang = z === 0 ? 0 : 1; // 配殿沿切向摆
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 11), goldMat(0.25, { color: C.paleGold, emissive: C.paleGold }));
    b1.position.y = 40; b1.castShadow = b1.receiveShadow = true; addEdges(b1, C.gold, 0.7); g.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.8, 8.6), goldMat(0.28, { color: 0xd8c58b, emissive: 0x8a6a20 }));
    b2.position.y = 41.4; b2.receiveShadow = true; g.add(b2);
    ([[4.6, 4.6], [4.6, -4.6], [-4.6, 4.6], [-4.6, -4.6]]                           ).forEach(([dx, dz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.7, 0.55), goldMat(0.32, { color: C.paleGold, emissive: 0x8a6a20 }));
      post.position.set(dx, 41.9, dz); g.add(post);
    });
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 3.6), goldMat(0.34, { color: 0xd8c58b, emissive: 0x8a6a20 }));
    t1.position.y = 42.8; t1.castShadow = true; addEdges(t1, C.paleGold, 0.7); g.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 2.6), goldMat(0.36, { roughness: 0.5 }));
    t2.position.y = 44.55; t2.castShadow = true; g.add(t2);
    const hr = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.6, 4), stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.3 }));
    hr.position.y = 46.1; hr.rotation.y = Math.PI / 4; hr.castShadow = true; g.add(hr);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), goldMat(0.8));
    tip.position.y = 47.1; g.add(tip);
    [-3, 3].forEach(o => {
      const fh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.8), goldMat(0.3, { color: C.paleGold, emissive: 0x8a6a20 }));
      fh.position.set(tang ? o : 0, 42.55, tang ? 0 : o); fh.castShadow = true; g.add(fh);
      const fr = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.9, 4), stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.3 }));
      fr.position.set(tang ? o : 0, 43.75, tang ? 0 : o); fr.rotation.y = Math.PI / 4; g.add(fr);
    });
  });
  // 山顶三十三天布列（俱舍卷十一：四角四峰金刚手依之；三十二天宫分列四方）——v203：峰换宝质、宫加顶合批
  ([[20, 20], [20, -20], [-20, 20], [-20, -20]]                           ).forEach(([x, z]) => {
    const pk = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6, 4), clippable(new THREE.MeshPhysicalMaterial({
      color: 0xbcd6c8, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25,
      normalMap: rockN, normalScale: new THREE.Vector2(0.8, 0.8), emissive: 0x3d5a4e, emissiveIntensity: 0.15,
    }))                              ); // v214：四峰同剪（原漏包，剖底时四粒白锚悬浮）
    pk.position.set(x, 87, z); pk.castShadow = true; saha.add(pk);
  });
  {
    const pts                          = [];
    for (let i = 0; i < 8; i++) { const t = -14 + i * 4; pts.push([t, 19], [t, -19], [19, t], [-19, t]); }
    const bIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.5, 1.7), goldMat(0.28, { color: C.paleGold, emissive: C.paleGold }), pts.length);
    const rIM = new THREE.InstancedMesh(new THREE.ConeGeometry(1.35, 1, 4), stdMat(0x8b3f32, { roughness: 0.7, emissive: 0x4a1f18, emissiveIntensity: 0.3 }), pts.length);
    const M = new THREE.Matrix4(), rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      iq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    pts.forEach(([x, z], i) => {
      M.compose(pv.set(x, 85.15, z), iq, one); bIM.setMatrixAt(i, M);
      M.compose(pv.set(x, 86.4, z), rq, one); rIM.setMatrixAt(i, M);
    });
    bIM.instanceMatrix.needsUpdate = true; rIM.instanceMatrix.needsUpdate = true;
    bIM.castShadow = rIM.castShadow = true; saha.add(bIM, rIM);
  }
  // 城外四苑（俱舍卷十一：众车东/粗恶南/杂林西/喜林北，诸天游戏地）：青碧苑池四面各一，缘植宝树
  {
    const shrubs                          = [];
    ([[13.5, 0], [-13.5, 0], [0, 13.5], [0, -13.5]]                           ).forEach(([x, z]) => {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 5.2), stdMat(0x2f7a63, { roughness: 0.8, emissive: 0x1c4a3a, emissiveIntensity: 0.25 }));
      pad.position.set(x, 84.25, z); pad.receiveShadow = true; addEdges(pad, C.gold, 0.4); saha.add(pad);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 16), stdMat(0x2b5e77, { roughness: 0.25, emissive: 0x123239, emissiveIntensity: 0.45 }));
      pool.position.set(x, 84.55, z); saha.add(pool);
      ([[1.9, 1.9], [1.9, -1.9], [-1.9, 1.9], [-1.9, -1.9]]                           ).forEach(([dx, dz]) => shrubs.push([x + dx, z + dz]));
    });
    const sIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), stdMat(0x7fbf94, { roughness: 0.8, emissive: 0x2e5a40, emissiveIntensity: 0.28 }), shrubs.length);
    const M = new THREE.Matrix4(), iq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    shrubs.forEach(([x, z], i) => { M.compose(pv.set(x, 84.9, z), iq, one); sIM.setMatrixAt(i, M); });
    sIM.instanceMatrix.needsUpdate = true; sIM.castShadow = true; saha.add(sIM);
  }
  // 善法堂（俱舍卷十一：外西南角有善法堂，三十三天时集於中）——重檐圆堂，西南角（-x,+z）
  {
    const g = new THREE.Group(); g.position.set(-14, 84, 14); saha.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.4, 1, 12), goldMat(0.22, { roughness: 0.6 }));
    base.position.y = 0.5; base.castShadow = true; g.add(base);
    const hall = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 2.2, 12),
      stdMat(0xe9ddb4, { map: mineralTexFine, roughness: 0.6, emissive: 0xcbb26a, emissiveIntensity: 0.18 }));
    hall.position.y = 2.1; hall.castShadow = true; g.add(hall);
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 12), goldMat(0.35, { roughness: 0.5 }));
    roof1.position.y = 3.9; roof1.castShadow = true; g.add(roof1);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 12), goldMat(0.4, { roughness: 0.5 }));
    roof2.position.y = 5.1; g.add(roof2);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), goldMat(0.8));
    tip.position.y = 5.9; g.add(tip);
  }
  // 圓生樹（俱舍卷十一：外東北側有圓生樹）——枝条傍布，东北角（+x,-z）
  {
    const g = new THREE.Group(); g.position.set(14, 84, -14); saha.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 4, 8),
      stdMat(0x6b4a33, { roughness: 0.95 }));
    trunk.position.y = 2; trunk.castShadow = true; g.add(trunk);
    const leaf = (r        , y        , sy        ) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9),
        stdMat(0x7fbf94, { map: mineralTexFine, roughness: 0.8, emissive: 0x2e5a40, emissiveIntensity: 0.28 }));
      m.position.y = y; m.scale.set(1.55, sy, 1.55); m.castShadow = true; g.add(m);
    };
    leaf(2.6, 4.6, 0.62); leaf(2.1, 5.9, 0.6); leaf(1.4, 7, 0.62);
  }
}

// 七金山（环带）与铁围山（俱舍卷十一：持雙最高，其余六山次第递减；此处高度按景深压缩递减表其势）
// v329 半半律（用户点单经据对照；俱舶卷十一）：七金山高次第减半（持双四万→尼民达罗千二百五十），
// 场内以真半半递减+可读底垫近似（外山外海若逐字面减半将不足一像素）：律存（单调半减、内宽外窄），字面受钳
const sevenH           = Array.from({ length: 7 }, (_, i) => 14 * Math.pow(0.5, i) + 0.8);
const sevenR           = []; // 环心半径：自山外缘逐海逐山推进，海宽半半、山基宽随高同减；最外缘≈ 89.4，咸海（至铁围 127）仍为诸海最广——俱舶外海最巨之义
{
  let r = 28.5;
  for (let i = 0; i < 7; i++) {
    const sea = 16.1 * Math.pow(0.5, i) + 0.8;
    const w = sevenH[i] * 0.7;
    sevenR.push(r + sea + w / 2);
    r += sea + w;
  }
}

// v208 用户定案恢复圆环之制：《长阿含·世记经》七重金山、七重香水海次第「围绕」须弥，
// 历代须弥古图皆绘圆环；（俱舍卷十一颂「四边各三倍」之内海四方说，仅须弥本体以超椭圆表其义，环带从古图）
for (let i = 0; i < 7; i++) {
  const R = sevenR[i], h = sevenH[i];
  const t = new THREE.Mesh(new THREE.TorusGeometry(R, h * 0.35, 6, 72),
    i % 2 ? stdMat(0x8fc0ae, { map: mineralTex, roughness: 0.65, normalMap: rockN, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: rockA }) : goldMat(0.3, { color: 0xcf9f4c, emissive: 0x8a682f, roughness: 0.55, normalMap: rockN, normalScale: new THREE.Vector2(0.8, 0.8) }));
  t.rotation.x = Math.PI / 2; t.scale.z = 1.6; t.position.y = 1; t.castShadow = true; t.receiveShadow = true;
  saha.add(t);
}
// 七香水海（俱舍：七金山间七内海，八功德水盈满其中；第七山外方是鹹海）
const hsMats                               = []; // 海面呼吸：主循环微调 emissive
for (let i = 0; i < 7; i++) {
  const inner = i === 0 ? 27.5 : sevenR[i - 1] + sevenH[i - 1] * 0.35;
  const outer = sevenR[i] - sevenH[i] * 0.35;
  if (outer - inner < 0.9) continue;
  const wm = new THREE.MeshStandardMaterial({
    color: 0x7fd8c8, emissive: 0x2e7a70, emissiveIntensity: 0.3, roughness: 0.22, // 光噪减负
    transparent: true, opacity: 0.9, side: THREE.DoubleSide, normalMap: rippleN, normalScale: rippleNS,
  });
  hsMats.push(wm);
  const w = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 72), clippable(wm));
  w.rotation.x = -Math.PI / 2; w.position.y = 0.4; w.receiveShadow = true; saha.add(w);
}
{
  // v329 铁围调矮：俱舶铁围山高仅三百一十二由旬半——诸山最矮，旧版高约 12 反壮于外重金山；降至约 4.5（世界边际之读仍存，钳于可读底线）
  const iron = new THREE.Mesh(new THREE.TorusGeometry(127, 1.6, 6, 96),
    stdMat(0x3a3644, { metalness: 0.4, roughness: 0.6 }));
  iron.rotation.x = Math.PI / 2; iron.scale.z = 1.4; iron.position.y = 1.1; saha.add(iron);
}

// 水面微光：流光斑纹叠加层缓旋（大海+香水海一张大盘，极乐莲池两层金碧）——不动几何只旋纹理，代价极低
function makeWaterTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d') ;
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 26;
    g.save(); g.translate(x, y); g.rotate(Math.random() * Math.PI); g.scale(1, 0.22 + Math.random() * 0.2);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const waterSpin                                       = [];
function addShimmer(parent                , r        , y        , cx        , cz        , color        , op        , rep        , sp        , clip         ) {
  const tex = makeWaterTex(); tex.repeat.set(rep, rep);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), clip ? clippable(mat) : mat);
  m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz);
  parent.add(m); waterSpin.push({ m, sp });
}
addShimmer(saha, 128, 0.55, 0, 0, 0x9fd8cc, 0.10, 7, 0.02, true);
addShimmer(saha, 128, 0.7, 0, 0, 0x86b9c6, 0.075, 11, -0.013, true);
addShimmer(pureLand, 37.2, 1.7, 0, 30, 0xe8c766, 0.13, 4, 0.03, false);
addShimmer(pureLand, 37.2, 1.76, 0, 30, 0x7fd8c8, 0.10, 6, -0.02, false);
function waterUpdate(t        , dt        ) {
  waterSpin.forEach(w => { w.m.rotation.z += w.sp * dt; });
  hsMats.forEach((m, i) => { m.emissiveIntensity = 0.28 + 0.08 * Math.sin(t * 0.8 + i * 0.9); }); // 光噪减负：呼吸幅度减半
  rippleN.offset.x += dt * 0.0085; rippleN.offset.y += dt * 0.0052; // v191 活水：法线图慢滑，海面微波度日
  if (windWheelM) windWheelM.rotation.y += dt * 0.045; // v211 业风恒转：法线高光随旋流动
}
// 调试钩子：仅供自测断言（只读）
(window       ).__waterDbg = () => ({ spin: waterSpin.length, rot: waterSpin.map(w => w.m.rotation.z), hs: hsMats.map(m => m.emissiveIntensity) });
(window       ).__camDbg = () => camera.position.distanceTo(controls.target);
(window       ).__camGo = (px        , py        , pz        , tx        , ty        , tz        ) =>
  flyTo(new THREE.Vector3(px, py, pz), new THREE.Vector3(tx, ty, tz)); // 自测飞位（不入玩法）

// 四大洲（俱舍卷十一：东半月、南车箱、西满月圆、北方座；洲天各映本面山宝之色）
// 各洲傍二中洲（俱舍：八中洲拱四大洲）——主洲侧翼二小岛
const contDayNight                                               = [];
const CONT_DAY = new THREE.Color(0xa8d8c4), CONT_NIGHT = new THREE.Color(0x5c7089);
{
  // 各洲底色向所对山面宝色微倾（俱舍「隨寶威德。色顯於空」之意延及洲土）
  const contMat = (tint        ) => {
    const c = new THREE.Color(0xa8d8c4).lerp(new THREE.Color(tint), 0.18);
    return stdMat(c.getHex(), { map: mineralTexFine, roughness: 0.75 });
  };
  const dayFor = (tint        ) => CONT_DAY.clone().lerp(new THREE.Color(tint), 0.18);
  const bev = { depth: 3.2, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.9, bevelSegments: 2 };
  const mkExtrude = (shp             ) => { const g = new THREE.ExtrudeGeometry(shp, bev); g.rotateX(Math.PI / 2); return g; };
  // 东胜身洲：半月形（弦缘朝须弥）
  const eShp = new THREE.Shape();
  eShp.absarc(0, 0, 14, -Math.PI / 2, Math.PI / 2, false); eShp.closePath();
  // 形状系→世界系：shape +x 即世界 +x（弓背朝正东、弦缘朝须弥），无须再旋
  const east = new THREE.Mesh(mkExtrude(eShp), contMat(0xdde2e9));
  east.position.set(104, 4, 0); addEdges(east); saha.add(east);
  // 南赡部洲：车箱形（俱舍「北广南狭」，北缘朝须弥），四角微圆
  const sShp = new THREE.Shape();
  sShp.moveTo(-13.5, -12.5); sShp.lineTo(13.5, -12.5);
  sShp.quadraticCurveTo(15, -12.5, 14.6, -10.8);
  sShp.lineTo(8.9, 11.6); sShp.quadraticCurveTo(8.5, 13, 7, 13);
  sShp.lineTo(-7, 13); sShp.quadraticCurveTo(-8.5, 13, -8.9, 11.6);
  sShp.lineTo(-14.6, -10.8); sShp.quadraticCurveTo(-15, -12.5, -13.5, -12.5);
  const south = new THREE.Mesh(mkExtrude(sShp), contMat(0x5f93c2));
  south.position.set(0, 4, 104); addEdges(south); saha.add(south);
  // 南洲面细景（雪山/四河/金刚座/阎浮树）已拆（v151 用户定案）：未来各区场景待双击入区后另行规划营建，地图层只留净板
  // 西牛货洲：满月正圆
  const west = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 14.5, 4, 40), contMat(0xd9cde6));
  west.position.set(-104, 1, 0); addEdges(west); saha.add(west);
  // 北俱卢洲：方座（四缘微圆）
  const nShp = new THREE.Shape();
  const nR = 12, nC = 2.2;
  nShp.moveTo(-nR + nC, -nR); nShp.lineTo(nR - nC, -nR); nShp.quadraticCurveTo(nR, -nR, nR, -nR + nC);
  nShp.lineTo(nR, nR - nC); nShp.quadraticCurveTo(nR, nR, nR - nC, nR);
  nShp.lineTo(-nR + nC, nR); nShp.quadraticCurveTo(-nR, nR, -nR, nR - nC);
  nShp.lineTo(-nR, -nR + nC); nShp.quadraticCurveTo(-nR, -nR, -nR + nC, -nR);
  const north = new THREE.Mesh(mkExtrude(nShp), contMat(0xe2bc60));
  north.position.set(0, 4, -104); addEdges(north); saha.add(north);
  [east, south, west, north].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  // 四洲昼夜（世记经：一方日出，余方次第为中、为没）：沿日所在方位亮、背日入夜；洲色带本面宝色
  const CONT_DEFS                                                                              = [
    [east, new THREE.Vector3(1, 0, 0), 0xdde2e9], [south, new THREE.Vector3(0, 0, 1), 0x5f93c2],
    [west, new THREE.Vector3(-1, 0, 0), 0xd9cde6], [north, new THREE.Vector3(0, 0, -1), 0xe2bc60],
  ];
  CONT_DEFS.forEach(([m, dir, tint]) => contDayNight.push({ m, dir, day: dayFor(tint) }));
  // 二中洲侍立：主洲两翼各一小圆岛，随主洲同昼夜
  CONT_DEFS.forEach(([m, dir, tint]) => {
    const side = new THREE.Vector3(-dir.z, 0, dir.x); // 主洲切向
    [1, -1].forEach(s => {
      const isle = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.9, 2.6, 18), contMat(tint));
      isle.position.copy(m.position).addScaledVector(side, 24).addScaledVector(dir, 3 * s);
      isle.position.y = 1.2;
      if (s < 0) isle.position.addScaledVector(side, -48);
      isle.castShadow = true; isle.receiveShadow = true;
      addEdges(isle, C.gold, 0.35); saha.add(isle);
      contDayNight.push({ m: isle, dir, day: dayFor(tint) });
    });
  });
}

// 日月
function makeGlow(rgb        , size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d') ;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},0.95)`); gr.addColorStop(0.35, `rgba(${rgb},0.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sunMoonPivot = new THREE.Group(); saha.add(sunMoonPivot);
// v332 天体光感三档（用户点单治光污染）：日＝光源档（全天唯一允许吃 bloom 的天体，自发光 1.25）；
// 月＝清辉档（自发光 0.8 压到 bloom 阈下，晕小且淡）；星宿＝点缀档（自发光 0.7，无晕无 bloom）——
// 旧版星 1.3>月 1.1 直逼日 1.25，三者全过阈全泛光＝光噪病根；此序日>月>星为铁序，改动先查 ART_DIRECTION 天体表
{
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14),
    clippable(new THREE.MeshStandardMaterial({ color: 0xffc766, emissive: 0xffab3d, emissiveIntensity: 1.25, roughness: 0.35 }))); // v257 降级对齐
  sunBall.position.set(55, 42, 0); sunMoonPivot.add(sunBall);
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 14), // v329 月径补齐：俱舶日五十一由旬/月五十几等大，旧 2.8 偏小
    clippable(new THREE.MeshStandardMaterial({ color: 0xd9e4f4, emissive: 0xaebedd, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.1 }))); // v332 清辉档：1.1→0.8 退出 bloom
  moonBall.position.set(-55, 42, 0); sunMoonPivot.add(moonBall);
  // 月宫水精外壳已退役（v257：日月降级为单球、单层静晕）
  const sunGlow = new THREE.Sprite(clippable(new THREE.SpriteMaterial({
    map: makeGlow('246,200,95'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22,
  }))                        );
  sunGlow.scale.setScalar(10); sunGlow.position.copy(sunBall.position); sunMoonPivot.add(sunGlow); // v332 收 14/0.30；v334 用户再点单「晕小一点淡一点」→10/0.22
  sunMoonPivot.userData.sun = sunBall; // 供「日月」节点标记每帧跟随
  const moonGlow = new THREE.Sprite(clippable(new THREE.SpriteMaterial({
    map: makeGlow('190,205,235'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.14,
  }))                        );
  moonGlow.scale.setScalar(7); moonGlow.position.copy(moonBall.position); sunMoonPivot.add(moonGlow); // v332 收 9/0.20；v334 再收 7/0.14：清辉非炎
  sunMoonPivot.userData.moon = moonBall;
  (window       ).__skyDbg = () => ({ sunE: (sunBall.material                              ).emissiveIntensity,
    moonE: (moonBall.material                              ).emissiveIntensity,
    starE: (sunMoonPivot.userData.starMat                                          )?.emissiveIntensity,
    sunGlow: [sunGlow.scale.x, (sunGlow.material                        ).opacity],
    moonGlow: [moonGlow.scale.x, (moonGlow.material                        ).opacity] }); // 自测钩子（只读）：日>月>星铁序
  // v331 月相盈亏（v330）已撤——用户点单去除，勿回潮；月恒望，单球单晕（v257）
}
// 自测钩子：日轮世界方位角 atan2(z,x)——依俱舍日行东→南，角度应随时间递增（+x东→0，+z南→π/2）
(window       ).__sunDbg = () => { const s = sunMoonPivot.userData.sun                  ; const v = new THREE.Vector3(); s.getWorldPosition(v); return Math.atan2(v.z, v.x); };

// 金尘浮粒：已撤（近景方块状星点视觉噪音，用户点名去除）

// 欲界空居四天：不用轨道环——《俱舍论》卷十一「夜摩以上四天依空而居，宫殿在虚空中如云而住」；
// 每天一朵承云托一座宫殿，上天转胜故逐层略大；光明自照（起世经：夜摩诸天光明自照）
[[26, 102, 0], [-22, 114, 8], [16, 126, -14], [-12, 138, -10]].forEach(([x, y, z], i) => {
  const s = 1 + i * 0.12;
  const g = new THREE.Group(); g.position.set(x, y - 4.5, z); saha.add(g);
  const cloud = new THREE.Sprite(clippable(new THREE.SpriteMaterial({ map: makeGlow('223,185,105'),
    transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }))                        ); // v218 承云 0.5→0.35；v333 再收 0.26
  cloud.scale.set(16 * s, 4.6 * s, 1); cloud.position.y = -1.4; g.add(cloud);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5 * s, 5.5 * s, 1.4, 18), goldMat(0.3, { color: C.paleGold, emissive: C.paleGold }));
  g.add(base);
  const hall = new THREE.Mesh(new THREE.CylinderGeometry(2.3 * s, 2.7 * s, 2.1 * s, 8), goldMat(0.35));
  hall.position.y = 0.7 + 1.05 * s; g.add(hall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1 * s, 1.7 * s, 8), goldMat(0.6, { color: C.paleGold, emissive: C.paleGold }));
  roof.position.y = 0.7 + 2.1 * s + 0.85 * s; g.add(roof);
});

// 色界四禅：禅定光云层（俱舍·世间品：色界诸天宫殿依空而住，以光明胜劣分位次——愈上愈广愈净）
{
  const dhyana                                          = [
    [148, 17, '215,170,69', 0.10],    // 初禅 梵众·梵辅·大梵（星环 r14）
    [157, 21, '229,199,122', 0.115],  // 二禅 少光·无量光·光音（星环 r18，以光为语）
    [166, 25, '240,224,168', 0.13],   // 三禅 少净·无量净·遍净（星环 r22）
    [176, 29, '246,240,218', 0.15],   // 四禅 内四凡 r18 外五圣 r26 两重环，盘最广（俱舍：愈上愈广）
  ]; // v195 用户点单「色界天星云极淡」：原 0.4–0.58 压至四分之一，只留一层气息
  // 降噪（极简）：盘晕透明度下调、侧晕减半——层次由星环与题字承担，不靠大面积光斑
  dhyana.forEach(([y, r, rgb, op], di) => {
    if (di === 3) return; // v323 四禅无云（俱舍：三禅以下宫殿依云而住，第四禅首天即名「无云」）；v324 用户点单极简：双棱环亦撤，无云以纯空表，四档星体自足辨层
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48),
      clippable(new THREE.MeshBasicMaterial({ map: makeGlow(rgb), transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    disc.rotation.x = -Math.PI / 2; disc.position.y = y; skyRealm.add(disc);
    skyDiscMats.push({ m: disc.material                  , op, layer: di + 1 }); // v223 记层号：光云盘随聚显呼吸
    // 侧视可见的扁光晕（否则平盘侧看即隐）
    const halo = new THREE.Sprite(clippable(new THREE.SpriteMaterial({ map: makeGlow(rgb), transparent: true,
      opacity: op * 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))                        );
    halo.scale.set(r * 1.9, r * 0.45, 1); halo.position.y = y; skyRealm.add(halo);
    skyDiscMats.push({ m: halo.material                  , op: op * 0.5, layer: di + 1 });
  });
}
// 色界大曼陀罗环线（v137）：一环一环之「形」——每层成员星环画旋转虚线金环，
// 绽开层环线亮起；四禅内外两环反向慢旋，坐实坛城结构
// v195 用户点单「环状虚线去除」：色界大曼陀罗环线退役，层级交给极淡光云盘与成员星自身（置空即不再画）
const CHAN_RING_DEF                                 = [];
const chanRingLines                                                                                   = [];
CHAN_RING_DEF.forEach((rings, i) => rings.forEach(([ry, rr], j) => {
  const pts                  = [];
  for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr)); }
  const mat = clippable(new THREE.LineDashedMaterial({ color: C.paleGold, dashSize: 1.6, gapSize: 2.6, transparent: true, opacity: 0.11 }))                            ;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
  line.computeLineDistances();
  line.position.y = ry; skyRealm.add(line);
  chanRingLines.push({ line, mat, layer: i + 1, sp: (j % 2 ? -1 : 1) * (0.03 + i * 0.009) });
}));
// 辐条光丝已拆（v146）：原 chanSpokes 组退役
// 无色界表法辅助：虚线圆工具函数（另供曼荐罗/四圣轨用）
function dashedCircle(r        , y        , color = C.paleGold)             {
  const pts                  = [];
  for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({ color, dashSize: 2.2, gapSize: 2.2, transparent: true, opacity: 0.75 }));
  line.computeLineDistances();
  return line;
}
// 无色界四空处：《俱舍论》「无色界无处所」——不立形体，只以四点渐微之光表空无边·识无边·无所有·非想非非想次第
// （v124 坐标对齐四空处观照节点 akasa/vijnana/akimcanya/naiva：点即其天）
[[9, 202, -3, 8, 0.34], [-10, 209, 5, 6.4, 0.26], [6, 215, 5, 5, 0.18], [-4, 222, -4, 3.6, 0.12]].forEach(([x, y, z, s, op]) => {
  const g = new THREE.Sprite(clippable(new THREE.SpriteMaterial({ map: makeGlow('236,232,214'), transparent: true,
    opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }))                        );
  g.scale.setScalar(s); g.position.set(x, y, z); saha.add(g);
});

// 色无色天门 23 位真实天层坐标（娑婆世界系，v136 色界大曼陀罗；v164 用户点单重排——好看好懂）：
// 一禅一环拉平（环内不再阶梯错高，环高与金环线同高，环形一眼成立）；
// 环内按谱序等分角、各环错开起始角（竖向不叠标）；半径逐层拉开（初禅 r14→二禅 r18→三禅 r22→四禅内四凡 r18 外五圣 r26），
// 倒立圣锥愈上愈广（俱舍）；无色四天改小半径匀旋直上（无色无方所、近轴表之），钝根阿那含寄位有顶之上；
// 谱序升进以「层」严格递升（初禅→二禅→…字面向上）；坐标即各天观照节点坐标（一位一地）
const SFP_SKY_LAYOUT                                           = {
  '梵眾天': [0, 149.4, 14], '梵輔天': [-12.1, 149.4, -7], '大梵天': [12.1, 149.4, -7],
  '少光天': [15.6, 158.4, 9], '無量光天': [-15.6, 158.4, 9], '光音天': [0, 158.4, -18],
  '少淨天': [19.1, 167.4, -11], '無量淨天': [0, 167.4, 22], '徧淨天': [-19.1, 167.4, -11],
  '福生天': [12.7, 177.5, 12.7], '福愛天': [-12.7, 177.5, 12.7], '廣果天': [-12.7, 177.5, -12.7],
  '無想天': [12.7, 177.5, -12.7],
  '無煩天': [0, 181.1, 26], '無熱天': [-24.7, 181.1, 8], '善見天': [-15.3, 181.1, -21],
  '善現天': [15.3, 181.1, -21], '色究竟天': [24.7, 181.1, 8],
  '空無邊處天': [4.7, 202, 5.2], '識無邊處天': [-5.2, 209, 4.7],
  '無所有處天': [-4.7, 216, -5.2], '非想非非想處天': [5.2, 223, -4.7],
  '鈍根阿那含': [0, 226, 0],
};

// 四圣金轨（倾斜大环，虚线 = 非方所）
const sageOrbit = dashedCircle(150, 0, C.gold);
sageOrbit.position.y = 127; sageOrbit.rotation.x = 0.1; saha.add(sageOrbit);

// （原西方经门牌楼已撤——极乐以星表之，见 gate 节点极乐星）

// ---------------- 极乐观照场 ----------------
// 净土横超门十三位 · 场内经义坐标（池中九品莲台三排、池畔边地疑城、空中三土竖观）
const SFP_PURE_LAYOUT                                           = {
  '淨土疑城': [-34, 3.2, 56],
  '下品下生': [-14, 3.6, 46], '下品中生': [0, 3.6, 48], '下品上生': [14, 3.6, 46],
  '中品下生': [-13, 4.8, 30], '中品中生': [0, 4.8, 27], '中品上生': [13, 4.8, 30],
  '上品下生': [-11, 6.0, 15], '上品中生': [0, 6.2, 11], '上品上生': [11, 6.0, 15],
  '方便有餘淨土': [0, 26, -4], '實報莊嚴淨土': [0, 41, -10], '常寂光淨土': [0, 57, -16],
};
{
  // 极乐远景：敦煌矿彩壁画（用户点单换图）；平面比例跟图片 2.35:1，免拉伸变形
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(517, 220),
    new THREE.MeshBasicMaterial({ map: loadTex('assets/bg-pureland-dunhuang.jpg'), fog: false }));
  bg.position.set(0, 64, -170); pureLand.add(bg);
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 6, 64),
    new THREE.MeshStandardMaterial({ color: 0x8a6d33, roughness: 0.6, metalness: 0.3 }));
  ground.position.y = -3; ground.receiveShadow = true; pureLand.add(ground);
  // 莲池
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 2, 48),
    new THREE.MeshStandardMaterial({ color: 0x2b6d8f, emissive: 0x14344a, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.2 }));
  pond.position.set(0, 0.6, 30); pureLand.add(pond);
  for (let i = 0; i < 3; i++) {
    const ripple = new THREE.Mesh(new THREE.TorusGeometry(10 + i * 9, 0.25, 5, 48),
      new THREE.MeshBasicMaterial({ color: 0xe9d391, transparent: true, opacity: 0.6 }));
    ripple.rotation.x = Math.PI / 2; ripple.position.set(0, 1.8, 30);
    ripple.userData.ripple = i; pureLand.add(ripple);
  }
  // 莲花：四色莲华（青色青光、黄色黄光、赤色赤光、白色白光——阿弥陀经）
  const LOTUS4                             = [
    [0x5b8fd4, 0x2a5490, '91,143,212'], [0xe3c76f, 0x9a7524, '227,199,111'],
    [0xc96a4a, 0x8b3f32, '201,106,74'], [0xf2ead0, 0xb99a4d, '242,234,208'],
  ];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.35;
    const [pc, pe, rgb] = LOTUS4[i % 4];
    const x = Math.cos(a) * 21, z = 30 + Math.sin(a) * 21;
    const lotus = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 7),
      new THREE.MeshStandardMaterial({ color: pc, emissive: pe, emissiveIntensity: 0.5 }));
    lotus.rotation.x = Math.PI; lotus.position.set(x, 2.6, z);
    pureLand.add(lotus);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(rgb), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35,
    })); // v218：莲池晕 0.5→0.35
    gl.scale.setScalar(6.5); gl.position.set(x, 3.4, z); pureLand.add(gl);
  }
  // 七重栏楞：环池金栏（取其环护之相）
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb28a3e, emissive: 0x59431c, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.45 });
  [2.2, 3.4].forEach(ry => {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(41.5, 0.28, 6, 64), railMat);
    rail.rotation.x = Math.PI / 2; rail.position.set(0, ry, 30); pureLand.add(rail);
  });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 3.8, 6), railMat);
    post.position.set(Math.cos(a) * 41.5, 1.9, 30 + Math.sin(a) * 41.5); pureLand.add(post);
  }
  // 九品莲台（观经九品往生；台之大小随品第渐增为本图表法）——花瓣/台座各合批为单一实例网格
  {
    const tiers                                    = [
      [['下品下生', '下品中生', '下品上生'], 2.4, 0xf2ead0],
      [['中品下生', '中品中生', '中品上生'], 3.0, 0xe3c76f],
      [['上品下生', '上品中生', '上品上生'], 3.6, 0xe8c766],
    ];
    const lot                                                                   = [];
    tiers.forEach(([ids, r, c]) => (ids            ).forEach(id => {
      const pl_ = SFP_PURE_LAYOUT[id];
      if (pl_) lot.push({ x: pl_[0], y: pl_[1] - 1.5, z: pl_[2], r: r          , c: c           });
    }));
    const PN = 15; // 外 9 内 6 两圈瓣
    const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5),
      new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.15, emissive: 0xb99a4d, emissiveIntensity: 0.35 }), lot.length * PN);
    const daisIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.72, 1, 12),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2, emissive: 0x9a7524, emissiveIntensity: 0.3 }), lot.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
      sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
    lot.forEach((L, li) => {
      M.compose(pv.set(L.x, L.y, L.z), q.identity(), sv.set(L.r * 0.62, 0.9, L.r * 0.62));
      daisIM.setMatrixAt(li, M); daisIM.setColorAt(li, col.setHex(L.c).multiplyScalar(0.82));
      for (let k = 0; k < PN; k++) {
        const outer = k < 9;
        const a = outer ? k / 9 * Math.PI * 2 : (k - 9) / 6 * Math.PI * 2 + 0.5;
        const rr = L.r * (outer ? 0.72 : 0.4);
        e.set(-(outer ? 0.95 : 0.5), Math.PI / 2 - a, 0, 'YXZ'); q.setFromEuler(e);
        M.compose(pv.set(L.x + Math.cos(a) * rr, L.y + (outer ? 0.42 : 0.78), L.z + Math.sin(a) * rr),
          q, sv.set(L.r * 0.34, L.r * 0.13, L.r * 0.6));
        petals.setMatrixAt(li * PN + k, M); petals.setColorAt(li * PN + k, col.setHex(L.c));
      }
    });
    petals.instanceMatrix.needsUpdate = true; daisIM.instanceMatrix.needsUpdate = true;
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    if (daisIM.instanceColor) daisIM.instanceColor.needsUpdate = true;
    pureLand.add(petals); pureLand.add(daisIM);
  }
  // 天雨曼陀罗华：昼夜六时雨天曼陀罗华（缓降花粒）
  {
    const N = 130, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const CS = [[0.95, 0.88, 0.7], [0.91, 0.72, 0.79], [0.85, 0.9, 0.95]];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200; pos[i * 3 + 1] = Math.random() * 80; pos[i * 3 + 2] = (Math.random() - 0.5) * 180 + 10;
      const c = CS[i % 3]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const rain = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: makeGlow('255,255,255', 32), vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    rain.userData.flowerRain = true; pureLand.add(rain);
  }
  // 宝鸟：白鹤孔雀迦陵频伽之属，环池徐飞演畅法音
  for (let i = 0; i < 4; i++) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 5),
      new THREE.MeshStandardMaterial({ color: 0xf2ead0, emissive: 0xb99a4d, emissiveIntensity: 0.35 }));
    body.rotation.x = Math.PI / 2; bird.add(body);
    [-1, 1].forEach(s => {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 4),
        new THREE.MeshStandardMaterial({ color: 0xd8c58b, emissive: 0x8a6a20, emissiveIntensity: 0.3 }));
      wing.rotation.z = s * Math.PI / 2; wing.position.set(s * 1.1, 0, 0); bird.add(wing);
    });
    bird.userData.bird = { ph: i / 4 * Math.PI * 2, r: 30 + i * 5, h: 17 + i * 3.5, sp: 0.14 + i * 0.02 };
    pureLand.add(bird);
  }
  // 七重行树（阿弥陀经：七重行树皆是四宝周匝围绕——环池七重宝树仪仗，外重渐高如护；合批为两实例网格+一层宝珠光点）
  {
    const rowsPts                                                        = [];
    const TREE_C = [0x2c7a6d, 0x2c7a6d, 0x2c7a6d, 0x3f7f8f, 0xb28a3e]; // 琉璃碧为主，间以琉璃青与金
    for (let row = 0; row < 7; row++) {
      const R = 52 + row * 7.5;
      const cnt = Math.round(R * 0.48);
      for (let i = 0; i < cnt; i++) {
        const a = i / cnt * Math.PI * 2 + row * 0.21;
        const x = Math.cos(a) * R, z = 30 + Math.sin(a) * R;
        if (Math.hypot(x, z) > 112) continue;              // 不出金地
        if (Math.hypot(x - 46, z + 16) < 17) continue;     // 让开楼阁
        if (Math.abs(x) < 9 && z < 16) continue;           // 让开三土竖观光柱
        if (Math.hypot(x + 34, z - 56) < 9) continue;      // 让开疑城
        rowsPts.push({ x, z, h: (9 + row * 1.05) * (0.88 + Math.random() * 0.24), c: TREE_C[(Math.random() * TREE_C.length) | 0] });
      }
    }
    const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.78, 1, 7),
      new THREE.MeshStandardMaterial({ color: 0x9c7b3a, metalness: 0.4, roughness: 0.5, emissive: 0x3a2c12, emissiveIntensity: 0.3 }), rowsPts.length);
    const crownIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15, emissive: 0x184138, emissiveIntensity: 0.45, flatShading: true }), rowsPts.length * 2);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
      sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
    const jp           = [];
    rowsPts.forEach((T, i) => {
      M.compose(pv.set(T.x, T.h * 0.5, T.z), q.identity(), sv.set(1, T.h, 1));
      trunkIM.setMatrixAt(i, M);
      const r1 = 3.4 + T.h * 0.16, r2 = r1 * 0.62;
      e.set(0, Math.random() * Math.PI, 0); q.setFromEuler(e);
      M.compose(pv.set(T.x, T.h + r1 * 0.45, T.z), q, sv.set(r1, r1 * 0.8, r1));
      crownIM.setMatrixAt(i * 2, M); crownIM.setColorAt(i * 2, col.setHex(T.c));
      e.set(0, Math.random() * Math.PI, 0); q.setFromEuler(e);
      M.compose(pv.set(T.x, T.h + r1 * 0.95 + r2 * 0.5, T.z), q, sv.set(r2, r2 * 0.85, r2));
      crownIM.setMatrixAt(i * 2 + 1, M); crownIM.setColorAt(i * 2 + 1, col.setHex(T.c).multiplyScalar(1.18));
      if (i % 2 === 0) jp.push(T.x + (Math.random() - 0.5) * 2, T.h + r1 * 1.15, T.z + (Math.random() - 0.5) * 2); // 树顶宝珠
    });
    trunkIM.instanceMatrix.needsUpdate = true; crownIM.instanceMatrix.needsUpdate = true;
    if (crownIM.instanceColor) crownIM.instanceColor.needsUpdate = true;
    pureLand.add(trunkIM, crownIM);
    (window       ).__treeDbg = { n: rowsPts.length, jewels: jp.length / 3 }; // 调试钩子：仅供自测断言
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(jp), 3));
    pureLand.add(new THREE.Points(jg, new THREE.PointsMaterial({
      size: 2.6, map: makeGlow('232,199,102'), color: 0xe8c766, transparent: true, opacity: 0.4, // v218 宝树珠光
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  }
  // 谱位造景：九品莲台 / 边地疑城 / 三土光轮
  Object.keys(SFP_PURE_LAYOUT).forEach(id => {
    const [x, y, z] = SFP_PURE_LAYOUT[id];
    if (/品.生$/.test(id)) {
      const grade = id[0]; // 下粉 中金 上玉白（品位渐尊）
      const [pc, pe] = grade === '下' ? [0xe8b7c9, 0xb2637f] : grade === '中' ? [0xe3c76f, 0x9a7524] : [0xf2e6c0, 0xb99a4d];
      const petal = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: pc, emissive: pe, emissiveIntensity: 0.45 }));
      petal.rotation.x = Math.PI; petal.position.set(x, y - 1.6, z); pureLand.add(petal);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0xd7aa45, emissive: 0x8a6a20, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.4 }));
      disc.position.set(x, y - 0.4, z); pureLand.add(disc);
    } else if (id === '淨土疑城') {
      // 边地疑城：池畔半掩城郭，莲胎含苞未开之相
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.0, 2.6, 10, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x9d9170, emissive: 0x3a3324, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
      wall.position.set(x, y - 1.4, z); pureLand.add(wall);
      const bud = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 7),
        new THREE.MeshStandardMaterial({ color: 0xcfae9d, emissive: 0x6d4a4a, emissiveIntensity: 0.35 }));
      bud.position.set(x, y - 0.4, z); pureLand.add(bud);
    } else {
      // 方便·實報·寂光：空中光轮渐大渐明（横具四土之竖观）
      const s = id === '常寂光淨土' ? 22 : id === '實報莊嚴淨土' ? 17 : 13;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlow(id === '常寂光淨土' ? '244,238,214' : '239,224,180'),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
      })); // v218：三土光轮 0.85→0.55
      glow.scale.setScalar(s); glow.position.set(x, y, z);
      glow.userData.tuGlow = Math.random() * Math.PI * 2;
      pureLand.add(glow);
      // v168 四土分层可读：每一土脚下一圈淡虚环（径随土渐宽，竖观层次一眼可辨）
      const tuRing = dashedCircle(s * 0.6, 0, 0xd8c58b);
      (tuRing.material                            ).opacity = 0.3;
      tuRing.position.set(x, y - s * 0.14, z);
      pureLand.add(tuRing);
    }
  });
  // 楼阁
  const pav = new THREE.Group(); pav.position.set(46, 0, -16); pureLand.add(pav);
  [[16, 8, 16, 4], [12, 7, 12, 12], [8, 6, 8, 19]].forEach(([w, h, d2, y]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2),
      new THREE.MeshStandardMaterial({ color: 0xb28a3e, emissive: 0x59431c, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.4 }));
    b.position.y = y; b.castShadow = true; pav.add(b);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.9, 3, 4),
      new THREE.MeshStandardMaterial({ color: C.cinn, roughness: 0.7 }));
    roof.position.y = y + h / 2 + 1.4; roof.rotation.y = Math.PI / 4; pav.add(roof);
  });
}

// 净土谱位名牌（canvas sprite，随简繁切换重绘）
// v168 四土名牌带小字义读（净土横超门总说义，非原谱引文）
const PURE_CAPTION                         = {
  '凡聖同居土': '蓮池九品·帶業往生所居',
  '方便有餘淨土': '斷見思·三乘聖者所居',
  '實報莊嚴淨土': '分破無明·法身大士所居',
  '常寂光淨土': '如智不二·究竟法身所證',
};
const pureNames = new THREE.Group(); pureLand.add(pureNames);
function pureNamePlate(text        , cap               )               {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = cap ? 150 : 96;
  const cx = cv.getContext('2d') ;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.font = '600 44px "SmileySans","PingFang SC","Microsoft YaHei",sans-serif';
  cx.strokeStyle = 'rgba(32,27,47,0.9)'; cx.lineWidth = 8;
  cx.strokeText(text, 256, cap ? 52 : 48);
  cx.fillStyle = '#efe0b4'; cx.fillText(text, 256, cap ? 52 : 48);
  if (cap) {
    cx.font = '500 25px "PingFang SC","Microsoft YaHei",sans-serif';
    cx.lineWidth = 6; cx.strokeText(cap, 256, 114);
    cx.fillStyle = '#cbbb8d'; cx.fillText(cap, 256, 114);
  }
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: 0.92,
  }));
}
function refreshPureNames() {
  pureNames.clear();
  Object.keys(SFP_PURE_LAYOUT).forEach(id => {
    const [x, y, z] = SFP_PURE_LAYOUT[id];
    const big = !/品|疑城/.test(id); // 三土名牌更大更高
    const sp = pureNamePlate(zh(id), big ? zh(PURE_CAPTION[id] || '') : null);
    sp.scale.set(big ? 16 : 11, big ? 4.69 : 2.06, 1);
    sp.position.set(x, y + (big ? 6 : 2.8), z);
    pureNames.add(sp);
  });
  // 第四土补位：凡圣同居土（莲池九品与边地疑城即此土）——名牌悬莲池上空，点开四土总说卡
  const tj = pureNamePlate(zh('凡聖同居土'), zh(PURE_CAPTION['凡聖同居土']));
  tj.scale.set(14, 4.1, 1); tj.position.set(0, 15, 30);
  pureNames.add(tj);
}
refreshPureNames();
// v168 四土与诸位直点拾取（用户点单：每一土点开有说明）：名牌/莲台/光轮皆有隐形命中球
const pureHits               = [];
{
  const mkPureHit = (x        , y        , z        , r        , pid        ) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    h.position.set(x, y, z); h.userData.purePid = pid; pureLand.add(h); pureHits.push(h);
  };
  Object.keys(SFP_PURE_LAYOUT).forEach(id => {
    const [x, y, z] = SFP_PURE_LAYOUT[id];
    const big = !/品|疑城/.test(id);
    mkPureHit(x, y + (big ? 3.5 : 1.2), z, big ? 9 : 3.6, id);
  });
  mkPureHit(0, 15, 30, 5, '凡聖同居土');
}

// ---------------- 节点标记 ----------------
;                   
;                   
                                                                              
                                                                              
 
const nodeViews             = [];
const byId                           = {};
const realmOrder = REALMS.map((r     ) => r.id);

function mandalaPosFor(realmId        )                {
  const i = realmOrder.indexOf(realmId);
  const m = (REALMS       )[i].mind;
  const a = i / 10 * Math.PI * 2 - Math.PI / 2;
  const r = 12 + (1 - m.awaken) * 82;
  const y = 34 + m.awaken * 58 + (m.joy - 0.5) * 10;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

const labelLayer = document.createElement('div');
labelLayer.id = 'labels';
app.appendChild(labelLayer);

// v173 一轴一谱（统一规划十法界与十五门美术）：竖轴即升沉，法界星与门色同用一张三段色谱——
// 下段恶趣朱砂赤褐（同门1-3）、中段欲界人天青碧（同门4/6-9）、色无色石青（同门5/8）、上段四圣金白（同门10-15）；
// 器世间地标（须弥/七金山/铁围/日月/三轮）不入法界色，保持金色图注——色只标有情界升沉
const HUE_AKU = new Set(['hell', 'preta', 'animal', 'asura']);
const HUE_RT = new Set(['jambu', 'purva', 'godaniya', 'kuru', 'trayastrimsa', 'caturmaharaja', 'yama', 'tusita', 'nirmanarati', 'paranirmita']);
const HUE_SKY = new Set(['rupa', 'arupa', 'akasa', 'vijnana', 'akimcanya', 'naiva']);
// v323 四禅四档（用户点单：四层天模型色彩/大小/质感分层）：星体明度四档守 #5b93a8 色相带（同 v321 轮王明度阶梯手法），
// 俱舍·世间品「愈上愈广愈净」：初禅沉青云涌→二禅光档（光音「以光为语」发光最亮）→三禅净透→四禅素身近银白（舍念清净，对齐四圣素身制）
const CHAN_STAR_LAYER                         = {};
[['chan1', 'brahmakayika', 'brahmapurohita', 'mahabrahma'],
 ['chan2', 'parittabha', 'apramanabha', 'abhasvara'],
 ['chan3', 'parittasubha', 'apramanasubha', 'subhakrtsna'],
 ['chan4', 'punyaprasava', 'anabhraka', 'brhatphala', 'asamjnika', 'avrha', 'atapa', 'sudarsana', 'sudrsa', 'akanistha']]
  .forEach((g, i) => g.forEach(id => { CHAN_STAR_LAYER[id] = i + 1; }));
const CHAN_HUE = [0x4c7d93, 0x5b93a8, 0x74abbe, 0x9cc4d0]; // 明度四档：沉青→基准→清透→近银白
const realmHue = (d          )         =>
  HUE_AKU.has(d.id) ? 0xb05a42
    : CHAN_STAR_LAYER[d.id] ? CHAN_HUE[CHAN_STAR_LAYER[d.id] - 1]
      : (SKY_IDS.has(d.id) || HUE_SKY.has(d.id)) ? 0x5b93a8
        : HUE_RT.has(d.id) ? 0x33907c
          : C.gold;

// v192 十法界主星尺寸制度（统一规划十法界星球大小）：与三段色谱同轴，升沉即大小——
// 下段四恶趣 2.0 → 中段人天/色无色 2.4 → 上段四圣 3.0，佛法界 3.4 为极；子星两档不变（禅天层把手 2.1，tier2 1.7，tier3 1.0）
const T1_SIZE                         = {
  hell: 2.0, preta: 2.0, animal: 2.0, asura: 2.0,
  jambu: 2.4, trayastrimsa: 2.4, rupa: 2.4, arupa: 2.4,
  sravaka: 2.9, pratyeka: 3.0, bodhi: 3.6, buddha: 3.6,
};
// v213 光感阶梯（统一规划星图光感度）：与尺寸/色谱同轴，升沉即明暗——
// 恶趣 0.42 → 人天/色无色 0.52 → 四圣 0.62 → 佛 0.72，极乐星 0.85 特例；子星/层把手 0.45 辅不夺主
const LUM_T1                         = {
  hell: 0.42, preta: 0.42, animal: 0.42, asura: 0.42,
  jambu: 0.52, trayastrimsa: 0.52, rupa: 0.52, arupa: 0.52,
  sravaka: 0.52, pratyeka: 0.55, bodhi: 0.58, buddha: 0.78,
  gate: 0.85,
};

// v251（复刻 MakePlay V66）法界星质感：四段灰度行星纹理按法界调染；
// 菲涅尔壳承担贴合球体剪影的边缘光，同时压低清漆、金属度、环境反射与广告牌光环。
const starTexLoader = new THREE.TextureLoader();
const starTexOf = (name        ) => {
  const texture = starTexLoader.load(`assets/tex-star-${name}.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};
const STAR_TEX = {
  woe: starTexOf('woe'),
  cloud: starTexOf('cloud'),
  jade: starTexOf('jade'),
  liuli: starTexOf('liuli'),
};
// 灰度贴图会压低 emissive 的平均亮度，分段回补以保住原有升沉明暗阶梯。
const STAR_TEX_K = { woe: 2.0, cloud: 1.5, jade: 1.15, liuli: 1.7 }; // v333：恶趣退出泛光阈值，恢复光感阶梯
const fresnelShell = (radius        , hue        , opacity = 0.5) => {
  const material = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(hue) }, uOp: { value: opacity } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uOp; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(uC, f * uOp); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material);
};
const spinStars               = [];
// v253-v258 七宝四圣：佛金→菩萨银→缘觉琉璃→声闻頗梨（水晶）；宝色只进入星体与光。
const SAGE_GEM                         = { sravaka: 0xcfe6ea, pratyeka: 0x4c6cb4, bodhi: 0xdfe7f0, buddha: 0xe8c766 };

NODES.forEach((d          ) => {
  const group = new THREE.Group();
  const isNS = d.coordKind === 'nonspatial' || d.group === '四圣';
  const hue = realmHue(d);
  const chanL = CHAN_STAR_LAYER[d.id] || 0; // v323 四禅四档：层序入尺寸/质感
  const size = d.tier === 1 ? (T1_SIZE[d.id] ?? 2.4)
    : /^chan[1-4]$/.test(d.id) ? [1.85, 2.05, 2.25, 2.45][chanL - 1] // 层把手同梯加重一档
      : d.tier === 3 ? (chanL ? [0.85, 1.0, 1.15, 1.3][chanL - 1] : 1.0) // 成员天愈上愈广（俱舍身量渐增）
        : 1.7;
  const lum = d.tier === 1 ? (LUM_T1[d.id] ?? 0.52) : 0.45;
  let core            ;
  const texKey = HUE_AKU.has(d.id)
    ? 'woe'
    : isNS
      ? 'liuli'
      : (SKY_IDS.has(d.id) || HUE_SKY.has(d.id) || /^chan[1-4]$/.test(d.id))
        ? 'jade'
        : 'cloud';
  const texture = STAR_TEX[texKey];
  const textureLum = lum * STAR_TEX_K[texKey];
  if (d.id === 'sravaka') {
    core = new THREE.Mesh(new THREE.OctahedronGeometry(size * 1.2),
      new THREE.MeshPhysicalMaterial({
        color: 0xcfe6ea, emissive: 0x9fc0c8, emissiveIntensity: lum,
        roughness: 0.12, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.5,
      }));
  } else if (d.id === 'pratyeka') {
    core = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 1.1),
      new THREE.MeshPhysicalMaterial({
        color: 0x3a5cae, emissive: 0x3556b0, emissiveIntensity: lum * 1.15,
        roughness: 0.16, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 0.5,
      }));
  } else if (d.id === 'buddha') {
    core = new THREE.Mesh(new THREE.SphereGeometry(size, 28, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8b95a, emissive: 0xa87c2a, emissiveIntensity: lum,
        roughness: 0.22, metalness: 1,
        clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.9,
      }));
  } else if (d.id === 'bodhi') { // V71：银晶刻面更清晰，四圣星体逐阶趋圆
    const bg = new THREE.IcosahedronGeometry(size * 1.05, 1);
    bg.computeVertexNormals();
    core = new THREE.Mesh(bg,
      new THREE.MeshPhysicalMaterial({
        color: 0xdfe7f0, emissive: 0x8fa2b8, emissiveIntensity: lum,
        roughness: 0.26, metalness: 1,
        clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.9,
      }));
  } else if (isNS) {
    core = new THREE.Mesh(new THREE.OctahedronGeometry(size * 1.2),
      new THREE.MeshPhysicalMaterial({
        color: 0xe4b85c, emissive: 0x8a6a20,
        emissiveMap: texture, emissiveIntensity: textureLum,
        bumpMap: texture, bumpScale: 0.05,
        roughness: 0.34, metalness: 1,
        clearcoat: 0.5, clearcoatRoughness: 0.4, envMapIntensity: 0.8,
      }));
  } else if (chanL === 4) { // v323 四禅·舍念清净：素身无纹理（对齐四圣素身制），盎洁近银白——离八灾患、无云之地
    core = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 18),
      new THREE.MeshPhysicalMaterial({ color: hue, emissive: hue, emissiveIntensity: lum * 0.95, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.5 }));
  } else if (chanL) { // v323 一至三禅同贴图三档递净：纹理/粗糙度渐减、清漆渐起；二禅发光独亮一档（少光·无量光·光音，以光为语）
    const [bmp, rgh, cc, ei] = [[0.09, 0.62, 0.15, 0.92], [0.07, 0.48, 0.3, 1.24], [0.035, 0.26, 0.7, 1.05]][chanL - 1];
    core = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 18),
      new THREE.MeshPhysicalMaterial({ color: hue, map: texture, emissive: hue, emissiveMap: texture, emissiveIntensity: textureLum * ei, bumpMap: texture, bumpScale: bmp, roughness: rgh, metalness: 0.05, clearcoat: cc, clearcoatRoughness: 0.4, envMapIntensity: 0.4 }));
  } else {
    core = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 18),
      new THREE.MeshPhysicalMaterial({
        color: hue, map: texture,
        emissive: hue, emissiveMap: texture, emissiveIntensity: textureLum,
        bumpMap: texture, bumpScale: 0.07,
        roughness: 0.6, metalness: 0.05,
        clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.35,
      }));
  }
  group.add(core);
  const gemHue = SAGE_GEM[d.id] !== undefined ? SAGE_GEM[d.id] : (isNS ? C.paleGold : hue);
  if (d.tier === 1 || /^chan[1-4]$/.test(d.id)) {
    core.userData.spin = (0.018 + (d.pos ? Math.abs(d.pos[0] % 7) : 0) * 0.004)
      * ((d.pos && d.pos[2] < 0) ? -1 : 1);
    spinStars.push(core);
    if (d.id !== 'bodhi') group.add(fresnelShell(
      size * (d.id === 'buddha' ? 1.32 : isNS ? 1.5 : 1.18),
      gemHue,
      d.id === 'buddha' ? 0.6 : 0.5,
    ));
  }
  if (!['bodhi', 'gate', 'sravaka', 'pratyeka'].includes(d.id) && !chanL && !['akasa', 'vijnana', 'akimcanya', 'naiva'].includes(d.id)) {
    // v210 菩萨简化；v255 极乐同撤；v258 声闻缘觉不加环线圈；v324 色无色域全撤记号环（用户点单极简：禅天 22 星四档星体自足辨层，四空点本无形）
    const halo = new THREE.Mesh(new THREE.RingGeometry(size * 1.7, size * 2.0, 24),
      new THREE.MeshBasicMaterial({ color: gemHue, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    halo.userData.billboard = true;
    group.add(halo);
  }
  if (['rupa', 'hell', 'preta', 'animal', 'asura'].includes(d.id)) {
    // 四专场入口星（幽冥四星共用一场）：外加一圈细环＝「可入之场」统一记号；极乐星已有双层光晕不另叠
    const gateRing = new THREE.Mesh(new THREE.RingGeometry(size * 2.35, size * 2.5, 32),
      new THREE.MeshBasicMaterial({ color: gemHue, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
    gateRing.userData.billboard = true;
    group.add(gateRing);
  }
  const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(d.tier === 3 ? 3 : 6, size * 3), 8, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData.nodeId = d.id;
  group.add(hit);
  group.position.set(d.pos[0], d.pos[1], d.pos[2]);
  (d.pure ? pureLand : nodesRoot).add(group);

  const label = document.createElement('div');
  label.className = 'nlabel' + (d.tier === 1 ? ' t1' : '')
    + (['avrha', 'atapa', 'sudarsana', 'sudrsa', 'akanistha'].includes(d.id) ? ' pureAbode' : ''); // v222 五净居金白圣色：凡圣分界入标
  label.textContent = zh(d.labelText ?? d.name);
  if (d.tier === 1 && (d.realm || HUE_SKY.has(d.id))) { // 十法界界名题字：界色底线（同一张色谱，四圣淡金）
    label.style.borderBottom = '2px solid #' + (isNS ? C.paleGold : hue).toString(16).padStart(6, '0');
  }
  labelLayer.appendChild(label);

  const nv           = {
    d, marker: group, hit, label,
    spacePos: group.position.clone(),
    mandalaPos: d.realm ? mandalaPosFor(d.realm) : null,
    realmIdx: d.realm ? realmOrder.indexOf(d.realm) : -1,
  };
  nodeViews.push(nv); byId[d.id] = nv;
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    // 双击题字与双击星体同拍（用户定案：双击＝入场）：极乐星径入净土，余法界凑近观照
    const nowT = performance.now(); const dbl = nowT - (label       )._lt < 350; (label       )._lt = dbl ? 0 : nowT;
    if (d.id === 'gate' && !inPure) { gateTap(dbl); return; } // 极乐星专拍：单击缓一拍开卡，给双击直入留窗口
    if (d.id === 'rupa' && !inSky) { rupaTap(dbl); return; }
    if (d.id === 'rupa' && inSky) { selectNode(d.id, false); return; } // 场内点总星：只开卡，镜头留在坛城（v165 与道场同法） // 色界总星专拍：同极乐语法，双击转场入色界场
    if (d.id === 'bodhi' && !inBodhi) { bodhiTap(dbl); return; } // 菩萨星专拍：双击转场入菩萨道场
    if (d.id === 'bodhi' && inBodhi) { selectNode(d.id, false); return; } // 场内点主星：只开卡，镜头留在环列（v160 交互巡检）
    if (CHAN_LAYER[d.id] && !inPure) { chanTap(CHAN_LAYER[d.id], dbl); playSfx('sfx-tap', 0.2); return; } // 禅天主星：单击绽开/收拢星环，双击凑近开卡
    if (dbl) {
      const v = viewPosFor(byId[d.id]);
      flyTo(v.target.clone().addScaledVector(v.pos.clone().sub(v.target), 0.55), v.target, 0.9);
      return;
    }
    selectNode(d.id);
  });
  let lpTimer = 0;
  label.addEventListener('pointerdown', () => {
    lpTimer = window.setTimeout(() => { toggleFav(d.id); lpTimer = 0; }, 620);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    label.addEventListener(ev, () => { if (lpTimer) clearTimeout(lpTimer); lpTimer = 0; }));
});

// 西方极乐星：极乐不立门，以娑婆星空中最大最亮的星球表之——星即入口（视觉挂在 gate 节点上）
{
  const gnv = byId['gate'];
  if (gnv) {
    gnv.hit.geometry = new THREE.SphereGeometry(38, 8, 6); // 巨星拾取区同步放大
    const core = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8b95a, emissive: 0xc9973f, emissiveIntensity: 0.5,
        roughness: 0.26, metalness: 1, clearcoat: 0.4, clearcoatRoughness: 0.3,
        envMapIntensity: 1, fog: false,
      }));
    gnv.marker.add(core);
    const soft = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow('246,214,130', 256), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2,
    }));
    (soft.material                        ).fog = false;
    soft.scale.setScalar(58); gnv.marker.add(soft); // v333 治光污染：巨晕 78/0.3→58/0.2
  }
}

// 辅标记：一节点多处所（四天王四面平台 / 月宫），点击均选中同一节点
;                                                                                                                          
const auxViews            = [];
function addAuxMarker(nodeId        , parent                , pos               , text               , showOrb = true) {
  const g = new THREE.Group();
  if (showOrb) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12),
      new THREE.MeshStandardMaterial({ color: C.gold, emissive: C.gold, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.4 })); // v213 光感阶梯：辅标珠 1.1→0.5，辅不夺主
    g.add(core);
  }
  const hit = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData.nodeId = nodeId;
  g.add(hit);
  g.position.copy(pos);
  parent.add(g);
  let label                        = null;
  if (text) {
    label = document.createElement('div');
    label.className = 'nlabel aux'; // v206 统一标签制度：辅标=T4 幽灵细字，视觉从属于节点标
    label.textContent = zh(text);
    labelLayer.appendChild(label);
    label.addEventListener('click', (e) => { e.stopPropagation(); selectNode(nodeId); });
  }
  auxViews.push({ obj: g, hit, label, nodeId });
  return g;
}
// 四天王天：四面平台各标天王名（东持国·南增长·西广目·北多闻，守护四方）；主标记「四天王天」在南平台上方
// +x=东，+z=南（与须弥山四宝面同序）
[[26, 0, '持国天王'], [-26, 0, '广目天王'], [0, -26, '多闻天王']].forEach(([x, z, nm]) => {
  addAuxMarker('caturmaharaja', nodesRoot, new THREE.Vector3(x          , 43, z          ), nm          );
  auxViews[auxViews.length - 1].facing = true;
});
// 南平台已有主标记，天王名另置平台下缘避开「四天王天」标签
addAuxMarker('caturmaharaja', nodesRoot, new THREE.Vector3(0, 36.5, 26), '增长天王', false);
auxViews[auxViews.length - 1].facing = true;
// 七金山逐山标名（v209 用户点单，名依所示译系：双持/持轴/担木/大善见/马耳/障碍/持地；
// 《俱舍》系异译持双/持轴/檐木/善见/马耳/象鼻/持边，已录 ring7 谱注卡）——内→外沿北侧缓螺旋错列，T4 幽灵细字
['双持山', '持轴山', '担木山', '大善见山', '马耳山', '障碍山', '持地山'].forEach((nm, i) => {
  const R = 40 + i * 8, h = 15 * Math.pow(0.75, i);
  const a = -0.62 - i * 0.24;
  addAuxMarker('ring7', nodesRoot, new THREE.Vector3(Math.cos(a) * R, 1 + h * 0.8 + 1.8, Math.sin(a) * R), nm, false);
});
// 地大三轮四层 T4 幽灵标（v211，朝默认镜位东南向，金/水错开方位免叠）——挂三轮持世节点，随其门焦明暗
const WHEEL_TAGS                                          = [['大地', 126, -18, 0.93], ['金輪', 133, -57, 0.78], ['水輪', 130, -66, 1.08], ['風輪', 173, -80, 0.93]];
WHEEL_TAGS.forEach(([nm, r, y, a]) => {
  addAuxMarker('trimandala', saha, new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), nm, false);
});
// 山腰三层级天名（v205，用户点单：坚手/持鬘/常放逸诸天现名）——南缘逐级而上，与环带同位；v334 随半半律新带宽收位
([[12.4, 28.4, '坚手天'], [22.4, 23.2, '持鬘天'], [32.4, 19.5, '常放逸天']]                                   ).forEach(([y, z, nm]) => {
  addAuxMarker('caturmaharaja', nodesRoot, new THREE.Vector3(0, y, z), nm, false);
  auxViews[auxViews.length - 1].facing = true;
});
// 善见城：山顶帝释天城，标于城角（避开忉利天主标签）
addAuxMarker('trayastrimsa', nodesRoot, new THREE.Vector3(9, 84, 9), '善见城', false);
addAuxMarker('jambu', nodesRoot, new THREE.Vector3(1.2, 7.6, 106.2), '金刚座', false);
// 空居四天宫殿可点（v207 交互统一：器世间宫殿一律可点入本天卡，与善见城/天王宫同法）
([['yama', 26, 102, 0], ['tusita', -22, 114, 8], ['nirmanarati', 16, 126, -14], ['paranirmita', -12, 138, -10]]                                           ).forEach(([nid, x, y, z]) => {
  addAuxMarker(nid, saha, new THREE.Vector3(x, y - 2.5, z), null, false);
});
// 月宫：随日月枢轴运行，标「月」；主标记随日，改标「日」
{
  const moon = sunMoonPivot.userData.moon                  ;
  addAuxMarker('sunmoon', sunMoonPivot, moon.position.clone(), '月', false);
  byId['sunmoon'].d.labelText = '日';
  byId['sunmoon'].label.textContent = '日';
}
// 星宿天（v205，用户点单）：日月星宿皆四天王所统——众星依空绕山腰而行，随日月枢轴同转
{
  const nStar = 9; // v333 用户点单：16→9 减数降噪
  const starIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6),
    clippable(new THREE.MeshStandardMaterial({ color: 0xfdf6dc, emissive: 0xf2e3ad, emissiveIntensity: 0.45, roughness: 0.5 })), nStar); // v332 点缀档 0.7；v334 山腰主发光唯日月：星再降 0.45、径 0.55→0.45，退为背景疑点
  const M = new THREE.Matrix4(), iq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  let firstPos                       = null;
  for (let i = 0; i < nStar; i++) {
    const a = 0.35 + i * 2.399963; // 黄金角散布，避开日月本位
    const r = 48 + (i * 37 % 13), sy = 37 + (i * 29 % 11);
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    if (!firstPos) firstPos = new THREE.Vector3(px, sy, pz);
    M.compose(pv.set(px, sy, pz), iq, one); starIM.setMatrixAt(i, M);
  }
  starIM.instanceMatrix.needsUpdate = true; sunMoonPivot.add(starIM);
  sunMoonPivot.userData.starMat = starIM.material; // 供 __skyDbg 铁序断言
  addAuxMarker('sunmoon', sunMoonPivot, firstPos , '星宿', false);
}
// 辅标分族（标签降噪·同族同进退）：按名归族，updateLabels 按族门整族显隐——
// 免矩形避让挤出「七山只剩一山有名」的幸存者观感；族外辅标（善见城/金刚座/日/月/星宿）不入族，照旧独立避让
{
  const FAM_OF                         = {};
  ([['七金山', ['双持山', '持轴山', '担木山', '大善见山', '马耳山', '障碍山', '持地山']],
    ['四天王', ['持国天王', '广目天王', '多闻天王', '增长天王']],
    ['山腰三级', ['坚手天', '持鬘天', '常放逸天']],
    ['三轮', ['大地', '金輪', '水輪', '風輪', '金轮', '水轮', '风轮']]]                          )
    .forEach(([fam, names]) => names.forEach(nm => { FAM_OF[nm] = fam; }));
  auxViews.forEach(av => {
    const t = av.label ? av.label.textContent : '';
    if (t && FAM_OF[t]) av.fam = FAM_OF[t];
  });
}

// 曼荼罗结构线（心性层）
const mandalaLines = new THREE.Group(); mandala.add(mandalaLines);
{
  [12, 40, 68, 94].forEach(r => mandalaLines.add((() => { const l = dashedCircle(r, 0); l.position.y = 40; return l; })()));
  const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 26, 0), new THREE.Vector3(0, 104, 0)]),
    new THREE.LineBasicMaterial({ color: C.gold, transparent: true, opacity: 0.7 }));
  mandalaLines.add(axis);
  const seqPts = realmOrder.map(id => mandalaPosFor(id));
  seqPts.push(seqPts[0].clone());
  const seq = new THREE.Line(new THREE.BufferGeometry().setFromPoints(seqPts),
    new THREE.LineBasicMaterial({ color: C.gold, transparent: true, opacity: 0.55 }));
  mandalaLines.add(seq);
  const buddhaP = mandalaPosFor('buddha');
  const spokes                  = [];
  realmOrder.forEach(id => { if (id !== 'buddha') { spokes.push(mandalaPosFor(id), buddhaP); } });
  const spokeLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes),
    new THREE.LineBasicMaterial({ color: C.paleGold, transparent: true, opacity: 0.22 }));
  mandalaLines.add(spokeLines);
}
mandala.visible = false;

// ---------------- UI（DOM） ----------------
const css = document.createElement('style');
// 得意黑：异步加载，未就绪时回退系统字体，不阻塞启动；就绪后重绘画布文字贴图，全站字体统一
try {
  const ff = new FontFace('SmileySans', "url('assets/lib/smiley-sans/SmileySans-Oblique.woff2')");
  ff.load().then(f => {
    document.fonts.add(f);
    try {
      refreshPureNames();
      if (sfpWheelTex) { drawWheelFaces(sfpWheelTex.image                     ); sfpWheelTex.needsUpdate = true; }
    } catch { /* 贴图尚未建成则略过 */ }
  }).catch(() => {});
} catch { /* FontFace 不可用则用系统字体 */ }
css.textContent = `
/* ── 全局字级制（五级 + 展示级）：全站字号只取此表，不再散点取值 ── */
:root{
  --f-ui:'SmileySans',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  --f-display:'SmileySans',"Songti SC","STSong","Noto Serif SC",serif;
  --fs-xs:11px;   /* 注脚·徽标·辅助说明 */
  --fs-sm:12.5px; /* 次要正文·标签·菜单 */
  --fs-md:14px;   /* 正文·按钮 */
  --fs-lg:16px;   /* 强调·小标题 */
  --fs-xl:19px;   /* 面板标题 */
  --fs-display:22px; /* 展示级题字 */
  /* 卡片双主题（2026-07-21 用户点单）：暗夜=默认，层次靠 token 重做分明；写经纸=可切换浅主题。
     所有卡片文字与面板走这套 --ck-* token，切换只改 token、不改结构。 */
  --ck-panel:linear-gradient(168deg,#26243f 0%,#1a1830 52%,#111020 100%); /* 靛蓝漆底渐变，呼应唐卡夜空 */
  --ck-border:rgba(215,170,69,.34);   /* 金发丝描边（唯一描边语言） */
  --ck-scrim:rgba(8,7,16,.78);
  --ck-title:#f6e6ad;                 /* 面板题 */
  --ck-meta:#ecc760;                  /* 顶签金（提亮，与正文拉开） */
  --ck-plain:#fbf4da;                 /* 白话主体 · 近白暖 · 最高对比（提亮） */
  --ck-read:#bda878;                  /* 解读 · 明显降一档暖褐（与白话拉开） */
  --ck-note:#8f8460;                  /* 注脚 · 最弱 */
  --ck-link:#f2d98a;                  /* 点读链接 · 金奶白，与正文区分 */
  --ck-line:rgba(215,170,69,.18);
  --ck-yuan:#ecdca6;                  /* 原文字 · 羊皮暖 */
  --ck-yuan-bg:rgba(0,0,0,.34);       /* 原文凹槽块 · 加深，沉入更明显 */
  --ck-yuan-rule:#d7aa45;             /* 原文金线 */
  --ck-bai:#83c9a6;                   /* 白话对照 · 清透石绿（去浊，一眼分清文白） */
  --ck-btn-bg:rgba(215,170,69,.12);
  --ck-btn-br:rgba(215,170,69,.38);
  --ck-btn-tx:#f0e0b4;
  --ck-cbU:rgba(215,170,69,.16);      /* 问·我方气泡 */
  --ck-cbU-br:rgba(215,170,69,.36);
  --ck-cbU-tx:#fbf4da;
  --ck-cbA:rgba(18,19,38,.92);        /* 问·答方气泡 · 偏冷靛，与卡底分离不糊 */
  --ck-cbA-br:rgba(131,201,166,.18);  /* 石绿细边示意「另一把声音」 */
  --ck-cbA-tx:#d9e4cf;
}
/* 写经纸兜底 v2：纸主题下所有卡内浅色文字（暗底设计）在纸上浅上加浅，统一映射成纸上可读的墨/朱/绿。
   仅 html.paperCards 生效、仅命中 .panel 内；暗夜模式此段整体不触发。
   世界层（.nlabel/#compass/#ladder/#conPill 等非 .panel）与「深底白字岛」（#sfpDice/#sfpFaces/#askQ/#conMinBtn/
   .sfpChip.cur 等自带深色底者）不在此列，保持原样不压墨。 */
/* ① 内联浅色（卡片正文由 JS 内联着色）——[style*=] 命中，按语义回挂 */
html.paperCards .panel [style*="#efe0b4"],html.paperCards .panel [style*="#f0dfa8"],
html.paperCards .panel [style*="#f4e6b8"],html.paperCards .panel [style*="#e6d9ab"],
html.paperCards .panel [style*="#ffe9a8"],html.paperCards .panel [style*="#e8d9a6"],
html.paperCards .panel [style*="#e6d9ac"],html.paperCards .panel [style*="#f6f0da"],
html.paperCards .panel [style*="#efe3bb"],html.paperCards .panel [style*="#eadfb5"],
html.paperCards .panel [style*="#e9dcae"]{color:var(--ck-plain)!important}
html.paperCards .panel [style*="#dccf9f"],html.paperCards .panel [style*="#cbbb8d"],
html.paperCards .panel [style*="#c9bc8f"],html.paperCards .panel [style*="#cfc19a"],
html.paperCards .panel [style*="#c8b988"],html.paperCards .panel [style*="#c9b980"],
html.paperCards .panel [style*="#d8c58b"]{color:var(--ck-read)!important}
html.paperCards .panel [style*="#9d9170"]{color:var(--ck-note)!important}
html.paperCards .panel [style*="#d7aa45"]{color:var(--ck-meta)!important}
html.paperCards .panel [style*="#9cc3b2"],html.paperCards .panel [style*="#e8c766"]{color:var(--ck-bai)!important}
html.paperCards .panel [style*="#f08f7a"],html.paperCards .panel [style*="#f0af9e"],
html.paperCards .panel [style*="#e8b7a8"],html.paperCards .panel [style*="#e59a86"]{color:var(--ck-link)!important}
html.paperCards .panel .verse [style]{color:var(--ck-yuan)!important}
/* ② 类规则浅色（写在 class 里，[style*] 抓不到，须逐类压深）——主体墨字 */
html.paperCards #cardName{color:var(--ck-title)!important}
html.paperCards .panel .one,html.paperCards .panel .causeBox .cv,
html.paperCards .panel .citeItem.q .txt,html.paperCards .panel details.citeD.q .txt,
html.paperCards .panel .workCard b,
html.paperCards .panel #glsPop b,html.paperCards .panel #glsD,
html.paperCards .panel #sfpName,html.paperCards .panel #sfpChant,
html.paperCards .panel #peek b,html.paperCards .panel .vdst,
html.paperCards .panel .sfpChip{color:var(--ck-plain)!important}
/* 次要褐字（解读/标签/坐标/键值/表条） */
html.paperCards #cardSub,html.paperCards .panel .tag,html.paperCards .panel .tag.ns,
html.paperCards .panel .chipRow .chip,html.paperCards .panel .coordBox,
html.paperCards .panel .mindBars .row,html.paperCards .panel .citeItem .txt,
html.paperCards .panel details.citeD .txt,html.paperCards .panel .profRow .pv,
html.paperCards .panel .smStat,
html.paperCards .panel #sfpMsg,html.paperCards .panel #vWhy,html.paperCards .panel #vSrc,
html.paperCards .panel .sfpMoves .mv,html.paperCards .panel #peek,
html.paperCards .panel .vbn,html.paperCards .panel #sfpChant em,
html.paperCards .panel #chantGo{color:var(--ck-read)!important}
/* 注脚灰字 */
html.paperCards .panel .causeBox .cs,html.paperCards .panel .citeItem .kind,
html.paperCards .panel .citeD .kind,html.paperCards .panel .workCard span,
html.paperCards .panel .profRow .psrc,html.paperCards .panel .smItem .sub{color:var(--ck-note)!important}
/* 顶签金 → 纸上朱砂墨 */
html.paperCards .panel .citeItem .src,html.paperCards .panel .citeD .src,
html.paperCards .panel .profRow .pk,
html.paperCards .panel .smItem .ic,
html.paperCards .panel .vaskC,html.paperCards .panel #vX,
html.paperCards .panel .sfpTrailRow .tc,html.paperCards .panel .sfpMoves .mv b{color:var(--ck-meta)!important}
/* 朱砂警示（警示签 / 何因生此题 / 恶趣 / 惡↓ 签） */
html.paperCards .panel .tag.warn,html.paperCards .panel .causeBox .ck,
html.paperCards .panel .smItem.arm .ic,html.paperCards .panel .smItem.arm b,
html.paperCards .panel .vchip.e,html.paperCards .panel .vchip.e b,html.paperCards .panel .vchip.e i{color:var(--ck-link)!important}
/* 松绿（善↑ 签 / 白话对照） */
html.paperCards .panel .dd,html.paperCards .panel .vchip.g,
html.paperCards .panel .vchip.g b,html.paperCards .panel .vchip.g i{color:var(--ck-bai)!important}
/* 深底白字岛例外：坐在深色块上的签保持白字，勿压墨 */
html.paperCards .panel .sfpChip.cur{color:#fff!important}
/* 写经纸浅主题：暖浅底墨字，原文沉香墨、白话石绿——最好读 */
html.paperCards{
  --ck-panel:linear-gradient(170deg,#f4ecd6 0%,#eee1c2 58%,#e6d8b2 100%); /* 温麻纸暖渐变，纸有厚度；不发黄 */
  --ck-border:rgba(70,54,32,.30);     /* 墨褐发丝线（不再金线，纸上更清） */
  --ck-scrim:rgba(18,14,28,.5);
  --ck-title:#2a2417;                 /* 近黑墨题 */
  --ck-meta:#8a4630;                  /* 顶签朱砂墨（替代金字，呼应世界朱砂，纸上可读） */
  --ck-plain:#2b2a21;                 /* 白话主体 · 正墨 · 最高对比 */
  --ck-read:#56503c;                  /* 解读 · 褐灰 */
  --ck-note:#7b7057;                  /* 注脚 · 加深防失读 */
  --ck-link:#9a4626;                  /* 点读链接 · 朱砂，纸上醒目 */
  --ck-line:rgba(70,54,32,.2);
  --ck-yuan:#3a3220;                  /* 原文字 · 沉香墨（深） */
  --ck-yuan-bg:#e5d6b0;               /* 原文凹槽 · 更深纸调，靠底色分层不靠色 */
  --ck-yuan-rule:#9c6a26;             /* 原文赭线（装饰，够深看得见） */
  --ck-bai:#2f6a52;                   /* 白话对照 · 深松绿 */
  --ck-btn-bg:#ecdfbc;
  --ck-btn-br:rgba(70,54,32,.30);
  --ck-btn-tx:#4a4230;
  --ck-cbU:#ecddb4;
  --ck-cbU-br:rgba(70,54,32,.30);
  --ck-cbU-tx:#2b2a21;
  --ck-cbA:#faf3e0;
  --ck-cbA-br:rgba(70,54,32,.16);
  --ck-cbA-tx:#4a4230;
}
html.bigfont{--fs-xs:12.5px;--fs-sm:14px;--fs-md:16px;--fs-lg:18px;--fs-xl:21px;--fs-display:24px}
/* 展示级题字（面板标题/落位大字/门介/途经字幕）：得意黑未就绪时回退宋体系，气质不塌 */
.panel h2,#posReveal,#doorIntro b,#transitCap b{font-family:var(--f-display)}
#labels{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5}
.nlabel{position:absolute;transform:translate(-50%,-140%);pointer-events:auto;cursor:pointer;
  font:var(--fs-sm)/1.4 var(--f-ui);color:#e9dcae;
  background:rgba(23,20,38,.72);border:1px solid rgba(215,170,69,.4);border-radius:3px;padding:2px 7px;
  white-space:nowrap;letter-spacing:1px}
.nlabel.t1{font-size:var(--fs-md);color:#f4e6b8;border-color:rgba(215,170,69,.7)}
/* v219 标签降噪：①淡入代硬闪（display 切回时动画自重起）②远景 T2 褪胶囊为幽灵细字（300–420 段） */
.nlabel{animation:lblIn .18s ease-out}
.nlabel.dlab{text-align:center;line-height:1.32;padding:2px 5px;font-size:11px;transform:translate(-50%,0)} /* v328 微缩：同排中珠签不再被避让表杀 */
.nlabel.dlab .dcm{display:block;font-size:8.5px;letter-spacing:2px;text-indent:2px;color:#c9bc8f;opacity:.92}
.nlabel.dlab .dcm .ne{font-style:normal;color:#cf8a72} /* v328 恶面字赭红：与判词卡恶↓同带 */
.nlabel.dlab.dl1{white-space:nowrap}
.nlabel.dlab.dl1 .dcm{display:inline;margin-right:5px;text-indent:0;letter-spacing:1px;font-size:9px} /* v328 横屏单行：组合字内联名前 */
.nlabel.dlab.cur{border-color:#d7aa45;color:#f4e6b8;box-shadow:0 0 12px rgba(215,170,69,.35)}
.nlabel.dlabC{text-align:center;background:transparent;border-color:transparent;letter-spacing:4px;text-indent:4px}
.nlabel.dlabC .dcm{display:block;font-size:10px;letter-spacing:2px;text-indent:2px;color:#9d9170}
@keyframes lblIn{from{opacity:0}}
.nlabel.far{background:transparent;border-color:transparent;font-size:var(--fs-xs);opacity:.85;text-shadow:0 0 8px rgba(10,8,20,.95),0 1px 3px #000}
/* v206 标签阶梯制度：T1 法界主星 .t1 ＞ T2 处所节点 .nlabel ＞ T3 细分天层 .drl ＞ T4 器世间辅标 .aux（永远让位于节点标） */
.nlabel.aux{font-size:var(--fs-xs);color:#cfc19a;background:transparent;border-color:transparent;padding:5px 8px;/* v207 触控热区加大，透明底不改观感 */
  letter-spacing:2px;text-shadow:0 0 8px rgba(10,8,20,.95),0 1px 3px #000;opacity:.92}
.nlabel.read{opacity:.78}
.nlabel.sel{background:rgba(139,63,50,.85);border-color:#d7aa45;color:#fff}
.ui{position:absolute;font-family:'SmileySans',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#efe0b4;z-index:10}
.panel{background:var(--ck-panel);border:1px solid var(--ck-border);border-radius:14px;backdrop-filter:blur(8px);color:var(--ck-plain);
  box-shadow:inset 0 1px 0 rgba(255,235,180,.10),0 18px 50px -22px rgba(0,0,0,.7);
  transition:background .45s,border-color .45s,color .45s}
html.paperCards .panel{box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 18px 48px -22px rgba(40,28,10,.5)}
/* 卡内未指定颜色的正文（如 SFP_META.dice）默认走主题墨色，纸主题下不再继承 .ui 浅色而失读 */
.overlay .body,.overlay .panel{color:var(--ck-plain)}
.tkey{margin:-16px -16px 12px;border-radius:13px 13px 0 0;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.5);flex:none;position:relative}
.tkey img{width:100%;height:190px;object-fit:cover;object-position:center 42%;display:block}
.tkey::after{content:'';position:absolute;inset:0;box-shadow:inset 0 -56px 44px -24px rgba(26,22,44,.92);pointer-events:none}
/* v196 题屏极简：次级操作收为细字行 */
.tlink{color:#9d9170;font-size:var(--fs-sm);letter-spacing:2px;cursor:pointer;padding:8px 4px;user-select:none;-webkit-user-select:none;transition:color .2s}
.tlink:hover,.tlink:active{color:#efe0b4}
button.gbtn{background:rgba(215,170,69,.08);border:1px solid rgba(215,170,69,.34);color:#efe0b4;border-radius:9px;
  padding:9px 14px;font-size:var(--fs-md);font-family:inherit;cursor:pointer;letter-spacing:1px;min-height:40px}
button.gbtn:active{background:rgba(215,170,69,.35)}
button.gbtn.primary{background:rgba(215,170,69,.32);color:#fff}
/* 卡片内按钮跟随卡片主题（控制台/掷轮钮不在卡内，仍用暗底基础样式） */
.overlay .gbtn,.panel .gbtn{background:var(--ck-btn-bg);border-color:var(--ck-btn-br);color:var(--ck-btn-tx)}
.overlay .gbtn.primary,.panel .gbtn.primary{background:linear-gradient(180deg,#d8ac47,#b0831c);color:#2a1e08;border-color:transparent;font-weight:600}
#topbar{top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:8px 12px;
  background:linear-gradient(rgba(22,18,38,.85),transparent);pointer-events:none}
#topbar>*{pointer-events:auto}
#title{font-size:var(--fs-xl);letter-spacing:4px;color:#f0dfa8;font-weight:600;text-shadow:0 1px 6px #000}
/* 右上角大厅：与题字分踞两角，安静地待着，不与中央星图争。
   position:static 是必须的——.ui 基类是绝对定位，不还原就会掉出顶栏的 flex 流（同 #backBtn 之例）。 */
#hallBtn{position:static;flex:none;margin-left:auto;min-height:36px;padding:7px 15px;border-radius:18px;letter-spacing:2px;
  font-size:var(--fs-sm);color:#cbbb8d;border:1px solid rgba(215,170,69,.34);background:rgba(20,17,34,.62);
  backdrop-filter:blur(6px);cursor:pointer}
#hallBtn:hover,#hallBtn:focus-visible{color:#f0dfa8;border-color:rgba(232,199,102,.62);background:rgba(30,25,50,.78)}
#compass{top:58px;right:12px;width:74px;height:74px;border-radius:50%;pointer-events:none;
  border:1px solid rgba(215,170,69,.5);background:rgba(23,20,38,.5)}
#compass span{position:absolute;left:50%;top:50%;font-size:var(--fs-xs);color:#e9dcae;transform:translate(-50%,-50%)}
#compass .n{color:#f08f7a}
#freeDock{bottom:calc(18px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center}
#joy{left:calc(14px + env(safe-area-inset-left));bottom:calc(104px + env(safe-area-inset-bottom));width:108px;height:108px;border-radius:50%;display:none;z-index:12;
  background:rgba(26,22,44,.45);border:1px solid rgba(215,170,69,.45);touch-action:none}
#joy.show{display:block}
#joyKnob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
  background:rgba(215,170,69,.5);border:1px solid #d7aa45;box-shadow:0 0 10px rgba(215,170,69,.4);pointer-events:none}
#secWrap{left:14px;top:50%;transform:translateY(-50%);width:34px;height:42vh;min-height:180px;display:flex;flex-direction:column;align-items:center}
#secTrack{flex:1;width:5px;background:linear-gradient(to top,rgba(139,63,50,.34),rgba(215,170,69,.2) 45%,rgba(215,170,69,.16));border-radius:3px;position:relative;touch-action:none;cursor:pointer}
#secHandle{position:absolute;left:50%;transform:translate(-50%,50%);bottom:0;width:17px;height:17px;border-radius:50%;
  background:rgba(215,170,69,.5);border:1.5px solid rgba(244,230,184,.85);box-shadow:0 0 6px rgba(215,170,69,.35)}
#secHandle::before{content:'';position:absolute;inset:-14px;border-radius:50%}
#secZero{position:absolute;left:-6px;right:-6px;height:1px;background:rgba(240,143,122,.6)}
#secWrap{opacity:.72;transition:opacity .25s}
#secWrap:hover,#secWrap:active{opacity:1}
#secLabel{font-size:var(--fs-xs);margin-top:6px;color:#cbbb8d;writing-mode:vertical-rl;letter-spacing:2px}
#cardHead{display:flex;align-items:center;gap:10px;padding:0 42px 8px 0}
#cardName{font-size:var(--fs-xl);letter-spacing:2px;color:#f4e6b8}
#cardSub{font-size:var(--fs-sm);color:#cbbb8d;margin-top:2px}
#cardTags{display:flex;gap:6px;padding:0 0 8px;flex-wrap:wrap}
.tag{font-size:var(--fs-xs);padding:2px 8px;border-radius:9px;border:1px solid rgba(215,170,69,.5);color:#e9dcae}
.tag.warn{border-color:rgba(240,143,122,.7);color:#f0af9e}
.tag.ns{border-color:rgba(160,190,240,.6);color:#b9ccef}
#cardBody{font-size:var(--fs-md);line-height:1.85}
#cardBody details.sec,.overlay .body details.sec{border-top:1px solid var(--ck-line);padding:2px 0;margin-top:6px}
#cardBody details.sec summary,.overlay .body details.sec summary{cursor:pointer;font-size:var(--fs-sm);color:var(--ck-meta);letter-spacing:2px;padding:9px 0;
  list-style:none;display:flex;justify-content:space-between;align-items:center;user-select:none}
#cardBody details.sec summary::-webkit-details-marker,.overlay .body details.sec summary::-webkit-details-marker{display:none}
#cardBody details.sec summary::after,.overlay .body details.sec summary::after{content:'▾';color:var(--ck-note);transition:transform .2s}
#cardBody details.sec[open] summary::after,.overlay .body details.sec[open] summary::after{transform:rotate(180deg)}
.sfpChip{display:inline-block;appearance:none;-webkit-appearance:none;font-family:inherit;font-size:var(--fs-sm);padding:5px 10px;margin:2px;
  border:1px solid rgba(215,170,69,.45);border-radius:10px;color:#efe0b4;background:rgba(215,170,69,.12);cursor:pointer;line-height:1.5}
.sfpChip:active{background:rgba(215,170,69,.32)}
.sfpChip.cur{background:#8b3f32;color:#fff;border-color:#d7aa45;box-shadow:0 0 8px rgba(215,170,69,.45)}
.sfpChip.sel{border-color:#e8c766;background:rgba(215,170,69,.3)}
.inlineNote{display:none;margin:8px 2px 2px;padding:8px 10px;border:1px dashed rgba(215,170,69,.4);border-radius:8px}
.causeBox{margin:8px 0;padding:8px 10px;background:rgba(139,63,50,.18);border-left:2px solid #b0543f;border-radius:0 8px 8px 0}
.causeBox .ck{font-size:var(--fs-xs);color:#f0af9e;letter-spacing:2px;margin-bottom:3px}
.causeBox .cv{color:#eadfb5;font-size:var(--fs-md);line-height:1.7}
.causeBox .cs{font-size:var(--fs-xs);color:#9d9170;margin-top:4px}
#cardBody .one{color:#efe0b4}
.coordBox{margin:8px 0;padding:8px 10px;border:1px dashed rgba(215,170,69,.45);border-radius:8px;font-size:var(--fs-sm);color:#dccf9f}
.mindBars{margin:8px 0}
.mindBars .row{display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);margin:4px 0;color:#cbbb8d}
.mindBars .bar{flex:1;height:6px;background:rgba(215,170,69,.15);border-radius:3px;overflow:hidden}
.mindBars .fill{height:100%;background:linear-gradient(90deg,#8b3f32,#d7aa45);border-radius:3px}
#cardBtns{display:flex;gap:8px;padding:0 0 8px;flex-wrap:wrap}
#cardBtns .gbtn{padding:7px 12px;font-size:var(--fs-md);min-height:36px}
.citeItem{margin:8px 0;padding:8px 10px;background:rgba(215,170,69,.07);border-left:2px solid #d7aa45;border-radius:0 8px 8px 0}
.citeItem .src{font-size:var(--fs-sm);color:#d7aa45}
.citeItem .kind{font-size:var(--fs-xs);color:#9d9170;margin-left:6px;border:1px solid rgba(157,145,112,.5);padding:0 5px;border-radius:6px}
.citeItem .txt{margin-top:3px;color:#dccf9f}
/* 原文引文块：字族随全站统一，靠略大字号、宽行距与金线与白话概述拉开层级 */
.citeItem.q .txt,details.citeD.q .txt{font-size:1.07em;line-height:1.9;color:#efe3bb}
/* 出处条目默认只显来源行，点开展开引文 */
#workCards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.workCard{display:flex;flex-direction:column;gap:3px;padding:10px 12px;cursor:pointer;border:1px solid rgba(215,170,69,.4);border-radius:10px;background:rgba(215,170,69,.07)}
.workCard:active{background:rgba(215,170,69,.2)}
.workCard b{font-size:var(--fs-md);color:#f0dfa8;font-weight:600;line-height:1.4}
.workCard span{font-size:var(--fs-xs);color:#9d9170}
@media (max-width:520px){#workCards{grid-template-columns:1fr}}
details.citeD{margin:6px 0;padding:0 10px;background:rgba(215,170,69,.07);border-left:2px solid #d7aa45;border-radius:0 8px 8px 0}
details.citeD summary{list-style:none;cursor:pointer;padding:9px 0;display:flex;align-items:center;gap:5px;flex-wrap:wrap;user-select:none}
details.citeD summary::-webkit-details-marker{display:none}
details.citeD summary::after{content:'▾';margin-left:auto;color:#9d9170;font-size:var(--fs-xs)}
details.citeD[open] summary::after{content:'▴'}
details.citeD .txt{margin:0;padding:0 0 10px;color:#dccf9f}
.citeD .src{font-size:var(--fs-sm);color:#d7aa45}
.citeD .kind{font-size:var(--fs-xs);color:#9d9170;border:1px solid rgba(157,145,112,.5);padding:0 5px;border-radius:6px}
/* 譜曰分句：一句一行，左侧细金线如谱刻本（字族随全站统一） */
/* v228 卡片三层一序：cPlain 一句白话（这是什么）→ cRead AI 解读（为什么）→ verse 谱曰原文（依据，点开）
   v229 体例三件：cMeta 金字顶签 / cNote 灰字注脚 / lnk 点读虚线——全卡统一，字级归五档 */
.cPlain{font-size:var(--fs-md);color:var(--ck-plain);line-height:1.85;margin-top:9px;font-weight:500}
.cMeta{font-size:var(--fs-sm);color:var(--ck-meta);letter-spacing:2px;line-height:1.6;font-weight:500}
.cNote{font-size:var(--fs-xs);color:var(--ck-note);margin-top:9px;line-height:1.65}
.lnk{color:var(--ck-link);border-bottom:1px dotted var(--ck-note);cursor:pointer}
.cRead{font-size:var(--fs-sm);color:var(--ck-read);line-height:1.78;margin-top:7px}
.cRead+.cRead{margin-top:5px}
/* 键值行：标签只作一次的小金字键，值紧随——避免「所在门」「第X门」等重复叙述 */
.cKv{margin-top:9px}
.cKv .k{font-style:normal;color:var(--ck-meta);font-size:var(--fs-xs);letter-spacing:1px;margin-right:9px;opacity:.9}
/* 文白对照：原文=沉入凹槽块（宋体沉香墨），白话=石绿并标「白」——两种声音一眼分清 */
.dd{font-size:var(--fs-sm);color:var(--ck-bai);line-height:1.74;margin:5px 0 12px;padding-left:12px}
.dd::before{content:'白　';font-size:var(--fs-xs);opacity:.6;letter-spacing:1px}
.verse+.verse{margin-top:8px}
.cSrc{font-size:var(--fs-xs);color:var(--ck-note);margin-top:7px}
.verse i{display:block;font-style:normal;font-size:var(--fs-sm);color:var(--ck-meta);letter-spacing:2px;margin:8px 0 2px}
.verse{line-height:1.95;text-align:justify;padding:9px 12px;border-left:3px solid var(--ck-yuan-rule);
  border-radius:0 8px 8px 0;background:var(--ck-yuan-bg);font-family:var(--f-display);
  font-size:1.05em;color:var(--ck-yuan);box-shadow:inset 0 1px 6px rgba(0,0,0,.28)}
html.paperCards .verse{box-shadow:inset 0 1px 5px rgba(70,54,32,.22)}
/* 卡内上一位/下一位翻页（钉在弹窗底部，拇指区） */
.cardNav{display:flex;gap:8px;margin-top:10px}
.cardNav .gbtn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--fs-md)}
.cardNav .gbtn.dis{opacity:.35;pointer-events:none}
/* 大字档：只抬正文容器字号，正文随之继承放大 */
html.bigfont #cardBody,html.bigfont .overlay .body{font-size:var(--fs-lg)}
.profRow{display:flex;gap:10px;margin:7px 0;align-items:flex-start}
.profRow .pk{flex:0 0 4.6em;color:#d7aa45;font-size:var(--fs-sm);letter-spacing:1px;padding-top:1px}
.profRow .pv{flex:1;color:#dccf9f;font-size:var(--fs-md);line-height:1.65}
.profRow .psrc{margin-left:6px;font-size:var(--fs-xs);color:#9d9170;border:1px solid rgba(157,145,112,.5);padding:0 5px;border-radius:6px;white-space:nowrap}
.overlay{inset:0;background:var(--ck-scrim);display:flex;align-items:center;justify-content:center;z-index:30;animation:ovIn .18s ease}
.overlay .panel{max-width:min(560px,92vw);max-height:82vh;display:flex;flex-direction:column;padding:16px;
  position:relative;animation:pnIn .24s cubic-bezier(.2,.8,.25,1)}
@keyframes ovIn{from{opacity:0}}
@keyframes pnIn{from{opacity:0;transform:translateY(16px) scale(.97)}}
@keyframes pnRt{from{opacity:.6;transform:translateX(46%)}}
@keyframes pnUp{from{opacity:.5;transform:translateY(40%)}}
/* 手机：弹窗改右侧抽屉——全高、限宽、内滚，左侧留出星图可见；避安全区 */
@media (max-width:640px){
  .overlay{align-items:stretch;justify-content:flex-end}
  .overlay .panel{width:min(86vw,400px);max-width:86vw;box-sizing:border-box;max-height:none;height:100%;
    border-radius:14px 0 0 14px;border-top:none;border-right:none;border-bottom:none;
    padding:14px 14px calc(14px + env(safe-area-inset-bottom)) 16px;
    padding-top:calc(14px + env(safe-area-inset-top));padding-right:calc(14px + env(safe-area-inset-right));
    animation:pnRt .26s cubic-bezier(.2,.8,.25,1)}
  .ovClose{top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right))}
}
.ovClose{position:absolute;top:10px;right:10px;width:44px;height:44px;font-size:var(--fs-lg);z-index:2;padding:0!important}
/* 题屏等居中式弹窗：手机不走右抽屉，居中呈现 */
@media (max-width:640px){
  .overlay.ovc{align-items:center;justify-content:center}
  .overlay.ovc .panel{width:min(92vw,430px);height:auto;max-height:86vh;border:1px solid rgba(215,170,69,.5);border-radius:12px;
    padding:16px;animation:pnIn .24s cubic-bezier(.2,.8,.25,1)}
  /* v316 谱务类短菜单：手机改底部抽屉——拇指区内一屏掉完，不遮满屏；下滑即关 */
  .overlay.ovb{align-items:flex-end;justify-content:center}
  .overlay.ovb .panel{width:100vw;max-width:100vw;height:auto;max-height:72vh;box-sizing:border-box;
    border-radius:18px 18px 0 0;border:none;border-top:1px solid rgba(231,214,166,.2);
    padding:8px 16px calc(16px + env(safe-area-inset-bottom));animation:pnUp .26s cubic-bezier(.2,.8,.25,1)}
  .overlay.ovb .ovClose{top:14px;right:12px}
}
@keyframes pnUp{from{opacity:.5;transform:translateY(46%)}}
.sheetGrip{width:44px;height:4px;border-radius:3px;background:rgba(231,214,166,.3);margin:4px auto 10px;flex:0 0 auto}
.smCur{display:flex;align-items:center;gap:10px;padding:11px 12px;margin-bottom:10px;border:1px solid rgba(215,170,69,.28);border-radius:12px;
  background:rgba(215,170,69,.07);cursor:pointer;-webkit-tap-highlight-color:transparent}
.smCur .k{flex:0 0 auto;font-size:11px;color:#d7aa45;letter-spacing:2px;border:1px solid rgba(215,170,69,.4);border-radius:8px;padding:2px 7px}
.smCur .v{flex:1;min-width:0;font-size:14.5px;color:#efe0b4;line-height:1.5}
.smCur .v i{display:block;font-style:normal;font-size:11px;color:#9d9170;letter-spacing:1px;margin-top:1px}
.smCur .go{flex:0 0 auto;color:#9d9170;font-size:14px}
.smIt{display:flex;flex-direction:column;align-items:center;gap:3px;padding:13px 6px;min-height:60px;justify-content:center}
.smIt b{font-weight:600;font-size:15px;letter-spacing:2px}
.smIt span{font-size:11px;color:#9d9170;letter-spacing:.5px}
.overlay h2{padding-right:48px}
.overlay h2{margin:0 0 10px;font-size:17px;letter-spacing:3px;color:#f0dfa8;font-weight:600;
  padding-bottom:9px;border-bottom:1px solid transparent;
  border-image:linear-gradient(90deg,rgba(215,170,69,.45),rgba(215,170,69,.06)) 1} /* v242 题字渐变发丝线，分层第一刀 */
.overlay .body{overflow-y:auto;min-height:0;flex:1 1 auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;font-size:14.5px;line-height:1.85}
/* v302 滚动条全局一制（用户点单：右侧竖滑杆色彩统一）：夜底淡金，取「一轴一谱」金 #d7aa45；窄轨无头尾钮；左侧导航杆隐滚动条制不受影响 */
*{scrollbar-width:thin;scrollbar-color:rgba(215,170,69,.42) rgba(22,18,38,.30)}
*::-webkit-scrollbar{width:7px;height:7px}
*::-webkit-scrollbar-track{background:rgba(22,18,38,.30);border-radius:4px}
*::-webkit-scrollbar-thumb{background:rgba(215,170,69,.40);border-radius:4px}
*::-webkit-scrollbar-thumb:hover,*::-webkit-scrollbar-thumb:active{background:rgba(215,170,69,.62)}
*::-webkit-scrollbar-corner,*::-webkit-scrollbar-button{background:transparent;height:0;width:0}
.chipRow{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
.chipRow .chip{border:1px solid rgba(215,170,69,.5);border-radius:9px;padding:4px 10px;font-size:var(--fs-sm);cursor:pointer;color:#e9dcae}
.chipRow .chip.on{background:rgba(215,170,69,.35);color:#fff}
.setRow{display:flex;align-items:center;justify-content:space-between;padding:10px 2px;border-bottom:1px solid rgba(215,170,69,.18);font-size:var(--fs-md)}
.lbJoin{display:grid;gap:10px}
.lbJoin label{font-size:var(--fs-sm);color:#dccf9f}
.lbJoin input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(216,197,139,.3);border-radius:9px;color:#efe9d8;padding:12px;font-size:16px;outline:none}
.lbJoin input:focus{border-color:rgba(232,199,102,.75);box-shadow:0 0 0 2px rgba(215,170,69,.12)}
/* V92：缘起/玩法由文字墙改成四段原意 + 三步操作；见闻录沿用同一极简排版。 */
.igLead{font-size:15px;color:#f7eed6;line-height:1.9;margin:2px 0 4px}.igLead b{color:#f4e6b8}
.igMeta{font-size:11.5px;color:#9d9170;letter-spacing:1px;margin-bottom:10px}
.igOr{padding:9px 0;border-top:1px solid rgba(215,170,69,.16)}.igOr:first-of-type{border-top:0}
.igOr b.k{display:inline-block;font-size:11px;letter-spacing:3px;color:#e8c766;border:1px solid rgba(215,170,69,.4);border-radius:5px;padding:1px 7px;margin-right:8px;vertical-align:2px}
.igOr>span{font-size:13.8px;color:#e5d8b2;line-height:1.8}
.igStep{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(215,170,69,.16)}
.igStep .n{flex:0 0 22px;height:22px;border-radius:50%;border:1px solid rgba(215,170,69,.5);color:#e8c766;font-size:12px;display:flex;align-items:center;justify-content:center;margin-top:1px}
.igStep .tx{flex:1;font-size:13.8px;color:#e5d8b2;line-height:1.75}.igStep .tx b{color:#f4e6b8}
.igStep .tx i{font-style:normal;display:block;font-size:11.5px;color:#9d9170;margin-top:2px}
.igTwo{display:flex;gap:8px;margin-top:10px}.igTwo>div{flex:1;padding:9px 10px;border-radius:10px;background:rgba(239,224,180,.05);border:1px solid rgba(215,170,69,.18)}
.igTwo b{display:block;font-size:13px;letter-spacing:2px;color:#e8c766;margin-bottom:3px}.igTwo span{font-size:12.2px;color:#cdbf95;line-height:1.7}
.igBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.igBtns .wide{grid-column:1/-1}
.lgTop{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;padding:2px 0 10px}.lgTop b{font-size:30px;color:#f4e6b8;line-height:1}
.lgTop span{font-size:13px;color:#d7aa45;letter-spacing:1px}.lgTop i{flex:1 0 100%;font-style:normal;font-size:11.5px;color:#9d9170;line-height:1.6;margin-top:4px}
.lgRow{display:flex;align-items:center;gap:7px;width:100%;padding:5px 0;border:0;border-top:1px solid rgba(215,170,69,.12);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}.lgRow.z{opacity:.45}
.lgRow .d{flex:0 0 24px;font-size:11px;color:#d7aa45;text-align:center}.lgRow .t{flex:1;font-size:12.8px;color:#e5d8b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lgRow .bar{flex:0 0 58px;height:4px;border-radius:2px;background:rgba(239,224,180,.12);overflow:hidden}.lgRow .bar i{display:block;height:100%;background:linear-gradient(90deg,#8a6a2a,#e8c766)}
.lgRow .n{flex:0 0 46px;text-align:right;font-size:11px;color:#9d9170}.lgRow .go{flex:0 0 10px;text-align:right;color:#d7aa45;font-size:12px}
.lgPs{display:flex;flex-wrap:wrap;gap:4px;margin-top:9px}.lgPs .lgP{font-size:11.5px;padding:2px 7px;border-radius:8px;border:1px solid rgba(215,170,69,.16);color:#8d8368;background:rgba(239,224,180,.03)}
.lgPs .lgP.on{color:#f0dfa8;border-color:rgba(215,170,69,.5);background:rgba(215,170,69,.12)}
.lgNums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px}.lgNums>div{padding:7px 4px;border-radius:9px;background:rgba(239,224,180,.05);border:1px solid rgba(215,170,69,.16);text-align:center}
.lgNums b{display:block;font-size:17px;color:#f4e6b8;line-height:1.3}.lgNums span{font-size:11px;color:#9d9170;letter-spacing:1px}
@media(max-width:360px){.igTwo{flex-direction:column}}@media(max-height:470px){.lgTop b{font-size:24px}.lgRow{padding:4px 0}.igLead{font-size:13.8px;line-height:1.7}.igOr{padding:7px 0}.igOr>span{font-size:13px;line-height:1.7}}
#backBtn{position:static;display:none;font-size:var(--fs-sm);padding:5px 12px;min-height:0;letter-spacing:2px;border-radius:16px;flex:none}
#backBtn.show{display:block}
#sfpBar{box-sizing:border-box;bottom:calc(12px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(540px,96vw);padding:9px 12px;display:none;text-align:center} /* v327 border-box：旧 content-box 宽+padding 在竖屏撑出视口 */
#sfpBar.show{display:block}
/* 收起钮收进面板内角：原先半悬在上边框外，像一颗脱落的泡泡；
   状态行右侧留出让位，免得位名跑到它底下。 */
#conMinBtn{position:absolute;top:5px;right:7px;width:30px;height:30px;border-radius:50%;background:transparent;border:1px solid rgba(231,214,166,.22);color:#9d9170;font-size:var(--fs-md);line-height:28px;text-align:center;cursor:pointer;opacity:.75;z-index:2}
#conMinBtn:hover,#conMinBtn:focus-visible{opacity:1;color:#e8c766;border-color:rgba(232,199,102,.5)}
#conPill{position:absolute;right:calc(14px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));width:60px;height:60px;border-radius:50%;display:none;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:radial-gradient(circle at 34% 30%,#a4713a,#6b4522 58%,#4a2f16);border:2px solid rgba(215,170,69,.65);box-shadow:0 3px 14px rgba(0,0,0,.6),0 0 18px rgba(215,170,69,.25);color:#f4e6b8;font-size:var(--fs-lg);font-weight:700;letter-spacing:1px;line-height:1.15;text-shadow:0 1px 3px #000;animation:pillBreath 3.2s ease-in-out infinite}
#conPill.show{display:flex}
@keyframes pillBreath{0%,100%{box-shadow:0 3px 14px rgba(0,0,0,.6),0 0 12px rgba(215,170,69,.18)}50%{box-shadow:0 3px 14px rgba(0,0,0,.6),0 0 24px rgba(215,170,69,.4)}}
.gbtn.dis{opacity:.45;pointer-events:none}
/* 状态行：左轮相牌、右现居位名；棋讯来时借同一行说话，说完退回位名。
   十五门进度不在此处再报一遍——右侧天梯常驻且更细（§5.0b 信息只出一次）。 */
#sfpState{display:flex;align-items:center;gap:10px;text-align:left;padding:1px 40px 7px 2px}
#sfpName{flex:1;min-width:0;font-size:var(--fs-md);letter-spacing:1px;color:#f4e6b8;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sfpName.msg{color:#dccf9f;letter-spacing:.5px}
#sfpFaces{display:flex;gap:5px;align-items:center;cursor:pointer;flex:none}
#sfpFaces .fcap{writing-mode:vertical-rl;font-style:normal;font-size:9.5px;letter-spacing:2px;color:rgba(215,170,69,.5);line-height:1;margin-right:1px} /* v327 状态正名：牌非钮，点开行迹 */
.smIt[data-arm]{border-color:rgba(176,90,66,.75)!important;background:rgba(176,90,66,.12)!important} /* v327 弃局待确认态枣红警示 */
#sfpFaces b{width:26px;height:34px;display:flex;align-items:center;justify-content:center;font-size:var(--fs-lg);font-weight:700;color:#341a0e;
  background:linear-gradient(160deg,#b5793a,#8a5a2b);border:1px solid rgba(58,28,14,.85);border-radius:7px;
  box-shadow:inset 0 0 6px rgba(255,230,170,.28),0 1px 4px rgba(0,0,0,.4);text-shadow:0 1px 0 rgba(244,230,184,.35)}
#sfpFaces b:empty::before{content:'·';color:rgba(52,26,14,.55)}
#sfpBtns{display:flex;gap:8px;justify-content:center;margin-top:6px;flex-wrap:wrap}
/* 同修入口并入控制台与底坞（原为左下角浮标，会压住掷轮台，且与控制台脱节）：
   未入座时不占位，入座后现身，内嵌四座色点与未读数。 */
.netEntry{display:none;position:relative;align-items:center}
.netEntry.on{display:flex}
.netEntry .netDots{display:flex;gap:4px}
.netEntry .netDots .pd{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none;transition:opacity .3s}
.netEntry .netDots .pd.off{opacity:.3}
.netEntry .chatLabel{margin-left:6px;font-size:var(--fs-sm);color:#dccf9f;max-width:4.4em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.netEntry .chatLabel.mine{color:#e8c766}
.netEntry .netUnread{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;border-radius:8px;
  background:#d98873;color:#14161d;font-size:10px;font-style:normal;line-height:16px;text-align:center;display:none}
.netEntry .netUnread.on{display:block}
#sfpBtns .gbtn{padding:8px 14px;font-size:var(--fs-md);min-height:38px}
#sfpBtns .gbtn.primary{min-height:46px;font-size:var(--fs-lg);letter-spacing:3px}
#modeChip{display:none}
#sfpDice{top:24%;left:50%;transform:translate(-50%,-50%);display:none;gap:14px;z-index:25;flex-wrap:wrap;justify-content:center}
#sfpVeil{position:absolute;inset:0;pointer-events:none;z-index:24;opacity:0;transition:opacity .5s;
  background:radial-gradient(ellipse 66% 60% at 50% 46%,rgba(32,27,47,0) 0%,rgba(32,27,47,.05) 34%,rgba(32,27,47,.62) 72%,rgba(24,20,36,.88) 100%)}
#sfpVeil.on{opacity:1}
#askQ{width:100%;box-sizing:border-box;background:rgba(26,22,44,.8);border:1px solid rgba(215,170,69,.45);border-radius:8px;
  color:#efe0b4;font-family:inherit;font-size:var(--fs-md);padding:8px 10px;resize:vertical;min-height:52px}
#labels{transition:opacity .45s}
#sfpDice.on{display:flex}
#sfpChant{flex:0 0 100%;text-align:center;margin-top:12px;font-size:var(--fs-lg);letter-spacing:6px;color:#efe0b4;
  text-shadow:0 0 14px rgba(215,170,69,.7),0 1px 6px #000}
#sfpChant em{display:block;font-style:normal;font-size:var(--fs-sm);letter-spacing:4px;color:#c8b988;margin-bottom:7px}
#sfpChant b{font-size:27px;font-weight:600;margin:0 3px;display:inline-block;color:#f4e6b8;
  text-shadow:0 0 16px rgba(232,199,102,.75),0 1px 6px #000;animation:chantBreath 3.6s ease-in-out infinite}
#chantGo{display:block;font-style:normal;font-size:var(--fs-sm);letter-spacing:3px;color:#c8b988;margin-top:9px;opacity:.85}
@keyframes chantBreath{0%,100%{opacity:.72}50%{opacity:1}}
#sfpDice.settle #sfpChant{opacity:1;color:#f4e6b8}
#sfpDice span{width:84px;height:84px;display:flex;align-items:center;justify-content:center;font-size:48px;
  color:#f4e6b8;background:rgba(26,22,44,.94);border:2px solid #d7aa45;border-radius:16px;
  box-shadow:0 0 26px rgba(215,170,69,.45);transition:width .22s,height .22s,font-size .22s,opacity .22s}
#sfpDice.settle span{color:#fff;background:rgba(139,63,50,.94)}
#fadeWhite{position:absolute;inset:0;background:#14101f;opacity:0;pointer-events:none;transition:opacity .5s;z-index:40}
#posReveal{position:absolute;left:50%;top:32%;transform:translate(-50%,-42%) scale(.82);font-size:30px;letter-spacing:8px;
  color:#f4e6b8;text-shadow:0 0 20px rgba(215,170,69,.85),0 2px 10px #000;opacity:0;pointer-events:none;z-index:26;
  transition:opacity .35s,transform 1.4s cubic-bezier(.2,.6,.3,1);white-space:nowrap}
#posReveal.show{opacity:1;transform:translate(-50%,-72%) scale(1)}
#verdict{position:absolute;left:50%;bottom:calc(126px + env(safe-area-inset-bottom));transform:translate(-50%,14px);width:min(540px,96vw);z-index:27;
  display:none;opacity:0;transition:opacity .22s,transform .28s;text-align:left;padding:12px 14px;cursor:pointer;box-sizing:border-box;border-left:3px solid transparent}
/* ① 收光入牌：判词化一缕金光收进轮相牌，随后才起飞——行棋的承接拍 */
#verdict.show.zap{transition:transform .3s cubic-bezier(.55,-0.02,.85,.4),opacity .3s ease-in;opacity:0;pointer-events:none;
  transform:translate(calc(-50% + var(--zx,0px)),var(--zy,60px)) scale(.08)}
#sfpFaces.pulse{animation:fcPulse .5s ease-out}
@keyframes fcPulse{0%{transform:scale(1)}30%{transform:scale(1.3)}100%{transform:scale(1)}}
#verdict.show{display:block;opacity:1;transform:translate(-50%,0)}
#sfpBar.vd{opacity:.72;transition:opacity .25s}
.gls{border-bottom:1px dotted rgba(215,170,69,.6);cursor:pointer}
#glsPop{position:fixed;z-index:70;padding:10px 13px;pointer-events:auto}
#glsPop b{font-size:var(--fs-lg);color:#f0dfa8;letter-spacing:1px}
#glsPop #glsD{margin-top:5px;font-size:var(--fs-sm);line-height:1.7;color:#e6d9ac}
#glsPop #glsF{margin-top:6px;font-size:var(--fs-xs);color:#9d9170;letter-spacing:.5px}
#verdict.min #vBody,#verdict.min #vWhy,#verdict.min #vSrc,#verdict.min #vGo,#verdict.min #vX{display:none!important}
#verdict.min{padding:7px 16px;cursor:pointer;opacity:.92}
#verdict.min #vN::after{content:' ▴';opacity:.6}
#sfpBar.vd{opacity:.72;transition:opacity .25s}
#vTop{display:flex;align-items:center;gap:8px;padding-right:30px}
#vN{margin-left:auto;font-size:var(--fs-xs);color:#9d9170;letter-spacing:.5px;white-space:nowrap}
#vChips{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.vchip{display:inline-flex;align-items:center;gap:6px;border-radius:8px;padding:2px 8px;font-size:var(--fs-xs);letter-spacing:.5px}
.vchip b{font-size:var(--fs-xl);font-weight:700;cursor:pointer}
.vchip i{font-style:normal;font-size:var(--fs-xs);opacity:.85;border:1px solid currentColor;border-radius:4px;padding:0 3px;margin-left:1px}
.vchip.g{border:1.5px solid rgba(215,170,69,.75);color:#e8d9a6}.vchip.g b,.vchip.g i{color:#f4e6b8}
.vchip.e{border:1.5px solid rgba(176,84,63,.85);color:#e8b7a8}.vchip.e b,.vchip.e i{color:#f0af9e}
.vchipNote{font-size:var(--fs-xs);color:#9d9170;letter-spacing:0}
/* v226 判词工具行退役：AI 解读小签缀位名同行；谱曰原文改「点开再读」虚线签 */
.vaskC{font-size:var(--fs-xs);border:1px solid rgba(215,170,69,.5);border-radius:7px;padding:2px 9px;margin-left:9px;color:#d7aa45;cursor:pointer;vertical-align:2px;white-space:nowrap;position:relative}
.vaskC::before{content:'';position:absolute;inset:-12px -14px}
.vsrcT{cursor:pointer;color:#9d9170;border-bottom:1px dotted rgba(157,145,112,.6);white-space:nowrap}
/* v236 「问」聊天式界面：问右答左双气泡 + 快问签 */
.cbRow{display:flex;margin:4px 0}
.cbU{margin-left:auto;max-width:86%;background:var(--ck-cbU);border:1px solid var(--ck-cbU-br);border-radius:11px 11px 3px 11px;padding:7px 11px;font-size:var(--fs-sm);color:var(--ck-cbU-tx);line-height:1.65}
.cbA{margin-right:auto;max-width:94%;background:var(--ck-cbA);border:1px solid var(--ck-cbA-br);border-radius:11px 11px 11px 3px;padding:8px 11px;font-size:var(--fs-sm);color:var(--ck-cbA-tx);line-height:1.75;min-width:0;overflow-wrap:break-word}
.cbA .sec{margin-top:6px}
.chipQ{font-family:var(--f-ui);font-size:var(--fs-sm);border:1px solid var(--ck-btn-br);border-radius:9px;padding:7px 11px;color:var(--ck-meta);cursor:pointer;white-space:nowrap}
/* 问·输入框：跟随卡片主题（16px 防 iOS 聚焦缩放） */
.cbInput{flex:1;min-width:0;box-sizing:border-box;background:var(--ck-btn-bg);border:1px solid var(--ck-btn-br);border-radius:10px;color:var(--ck-plain);padding:11px 12px;font-family:var(--f-ui);font-size:16px}
.cbInput::placeholder{color:var(--ck-note);font-family:var(--f-ui);font-style:normal;letter-spacing:.2px}
/* G 版智能体检索反馈（仿文钞：正在检证→细检相关篇章→综合） */
.cbStage{font-size:var(--fs-sm);color:var(--ck-read);animation:chantBreath 1.4s ease-in-out infinite;margin:4px 0}
.cbStage b{color:var(--ck-meta);font-weight:600}
.vhd{font-style:normal;font-size:var(--fs-xs);opacity:.7;margin-left:5px;border:1px solid currentColor;border-radius:4px;padding:0 3px;vertical-align:1px}
#vSrc{display:none;margin-top:7px;font-size:var(--fs-sm);color:#cbbb8d;line-height:1.7;border-left:2px solid rgba(215,170,69,.4);padding-left:9px}
#verdict.src #vSrc{display:block}
.vdst{font-size:var(--fs-xl);letter-spacing:1px;color:#f0dfa8;font-weight:700}
.vbn{display:inline-block;margin-left:8px;font-size:var(--fs-xs);border:1px solid rgba(215,170,69,.6);border-radius:5px;padding:1px 6px;color:#e8d9a6;vertical-align:2px;font-weight:400}
#vWhy.full{display:block;-webkit-line-clamp:unset;overflow:visible}
#vGo{width:100%;margin-top:10px;min-height:44px;position:relative;overflow:hidden}
/* 联机判词卡的本手剩余时间：服务器逾时会代为交轮，读谱注的人有权知道自己还剩多久 */
#vClock{margin-left:8px;font-style:normal;font-size:var(--fs-xs);color:#b9b09a;font-variant-numeric:tabular-nums}
#vClock:empty{display:none}
#vClock.warn{color:#e8c766}
/* 站内确认卡（替代 window.confirm）：自成一层，不占 overlay */
#sfpConfirm{position:fixed;inset:0;z-index:64;display:none;align-items:center;justify-content:center;
  padding:16px;background:rgba(8,10,15,.76);backdrop-filter:blur(4px)}
#sfpConfirm.on{display:flex}
#sfpConfirm .cfCard{width:min(340px,92vw);box-sizing:border-box;padding:20px 18px 16px;color:#e8e2d0;
  background:rgba(18,21,30,.98);border:1px solid rgba(216,197,139,.42);border-radius:16px}
#sfpConfirm h3{margin:0 0 8px;letter-spacing:2px;color:#f0dfa8;font-size:var(--fs-lg)}
#sfpConfirm .cfBody{color:#b9b09a;font-size:var(--fs-sm);line-height:1.7}
#sfpConfirm .cfBody b{color:#e8c766;font-weight:500}
#sfpConfirm .gbtn{display:block;width:100%;min-height:46px;margin-top:10px}
/* 我的功课：全站与个人共用同一组列（累计／今日），上下一对照就懂 */
.myPanel .myLoad{padding:36px 0;text-align:center;color:#77705f;letter-spacing:2px}
.myPanel .myWho{display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);color:#9d9170}
.myPanel .myWho b{color:#e8c766;font-weight:500}
.myPanel .myWho .gbtn{margin-left:auto;min-height:32px;padding:5px 12px;font-size:var(--fs-xs)}
.myPanel .myGrid{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin-top:11px;
  background:rgba(215,170,69,.16);border:1px solid rgba(215,170,69,.16);border-radius:12px;overflow:hidden}
.myPanel .myGrid div{padding:12px 13px;background:#15121f}
.myPanel .myGrid.me,.myPanel .myGrid div.me{background:rgba(232,199,102,.05)}
.myPanel .myGrid i{display:block;font-style:normal;color:#8b8471;font-size:var(--fs-xs);letter-spacing:1px}
.myPanel .myGrid b{display:block;margin-top:3px;color:#e8c766;font-size:22px;font-weight:500;font-variant-numeric:tabular-nums}
.myPanel .myGrid .me b{color:#f4e6b8}
.myPanel .myLine{margin-top:9px;text-align:center;color:#a99c79;font-size:var(--fs-sm);letter-spacing:1px}
.myPanel .myLine2{margin:16px 0 7px;color:#a4936c;font-size:var(--fs-xs);letter-spacing:3px}
.myPanel .myCal{margin-top:14px;border:1px solid rgba(215,170,69,.14);border-radius:12px;padding:10px 10px 12px}
.myPanel .myCalHead{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.myPanel .myCalHead b{color:#e0d3a6;font-weight:500;font-size:var(--fs-md)}
.myPanel .myCalHead span{margin-left:auto;color:#8b8471;font-size:var(--fs-xs)}
.myPanel .myCalHead .gbtn{min-height:30px;padding:2px 11px;font-size:var(--fs-md)}
.myPanel .myWk,.myPanel .myDays{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.myPanel .myWk span{text-align:center;color:#6e685a;font-size:var(--fs-xs);padding-bottom:3px}
.myPanel .myCell{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
  min-height:40px;border-radius:8px;background:rgba(255,255,255,.025)}
.myPanel .myCell.pad{background:none}
.myPanel .myCell i{font-style:normal;font-size:var(--fs-xs);color:#7e7562}
.myPanel .myCell b{font-size:10px;font-weight:400;color:transparent;line-height:1}
.myPanel .myCell.on{background:rgba(232,199,102,.16)}
.myPanel .myCell.on i{color:#f0dfa8}
.myPanel .myCell.on b{color:#c8a94e}
.myPanel .myCell.now{outline:1px solid rgba(232,199,102,.55);outline-offset:-1px}
.myPanel .myRow{display:flex;align-items:center;gap:8px;width:100%;text-align:left;font-size:var(--fs-sm);min-height:44px}
.myPanel .myRow i{margin-left:auto;font-style:normal;color:#d7aa45}
.myPanel .myRun{display:grid;grid-template-columns:auto 1fr auto;align-items:baseline;gap:8px;
  padding:8px 2px;border-bottom:1px solid rgba(215,170,69,.1);font-size:var(--fs-sm)}
.myPanel .myRun b{color:#e0d3a6;font-weight:500;white-space:nowrap}
.myPanel .myRun span{color:#9d9170;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.myPanel .myRun em{font-style:normal;color:#6e685a;font-size:var(--fs-xs);white-space:nowrap}
/* 共同结算卡：一句结果 + 一句本座 + 同座行处，三层看完即知本局如何 */
.nsPanel .nsHead{margin-top:6px;color:#f0dfa8;font-size:var(--fs-lg);letter-spacing:2px}
.nsPanel .nsMine{margin-top:3px;color:#cfc7ad;font-size:var(--fs-sm)}
.nsPanel .nsList{margin-top:11px;border-top:1px solid rgba(216,197,139,.16)}
.nsPanel .nsRow{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:9px;
  min-height:40px;border-bottom:1px solid rgba(216,197,139,.09);font-size:var(--fs-sm)}
.nsPanel .nsRow .dot{width:10px;height:10px;border-radius:50%}
.nsPanel .nsRow b{color:#dcd0ad;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nsPanel .nsRow span{color:#9d9170;white-space:nowrap}
#vBody{margin-top:8px;font-size:var(--fs-md);line-height:1.6}
#vWhy{margin-top:6px;font-size:var(--fs-sm);color:#dccf9f;line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#verdict[data-dir="up"]{border-left-color:#e8c766}
#verdict[data-dir="down"]{border-left-color:#f08f7a;transform:translate(-50%,-14px)}
#verdict[data-dir="stay"]{border-left-color:#9d9170}
#verdict[data-dir="pure"]{border-left-color:#f6ecc8}
#verdict[data-dir="start"],#verdict[data-dir="bonus"]{border-left-color:#d7aa45}
.ladDoor.fl i{animation:ladFl .55s ease 2}
@keyframes ladFl{0%,100%{transform:scale(1)}45%{transform:scale(2.1);box-shadow:0 0 10px currentColor}}
#rollBn{position:absolute;top:-8px;right:-3px;font-size:var(--fs-xs);line-height:1;padding:3px 7px;border-radius:9px;background:#2a2416;border:1px solid rgba(232,199,102,.6);color:#e8c766;display:none;pointer-events:none;letter-spacing:1px;z-index:1}
#rollRing{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s;padding:2.5px;box-sizing:border-box;
  background:conic-gradient(rgba(232,199,102,.95) var(--p,0%),rgba(232,199,102,.14) 0);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}
#sfpRoll.hold #rollRing{opacity:1}
#sfpName .nSub{margin-left:8px;font-size:var(--fs-xs);color:#9d9170;letter-spacing:.5px;font-weight:400}
#posReveal i{display:block;font-style:normal;font-size:var(--fs-sm);letter-spacing:1px;margin-top:8px;color:#e8dcb2;text-shadow:0 1px 8px #000;opacity:.95}
#tierDots{position:absolute;left:22px;top:calc(50% + max(21vh,90px) + 14px);display:flex;flex-direction:column;gap:5px;align-items:center;padding:7px 4px;background:rgba(14,18,26,.5);border:1px solid rgba(215,170,69,.18);border-radius:9px;pointer-events:none;z-index:9} /* v328 用户误读为杂点：离开天梯右列，归左侧截面滑杆下方成控制簇，胶囊＋竖排档名自证身份 */
#tierDots i{width:6px;height:6px;border-radius:50%;background:rgba(215,170,69,.18);border:1px solid rgba(215,170,69,.3);transition:background .3s,box-shadow .3s}
#tierDots i.on{background:#e8c766;box-shadow:0 0 6px rgba(232,199,102,.7)}
#tierDots b{writing-mode:vertical-rl;font-weight:400;font-size:9.5px;letter-spacing:2px;color:rgba(215,170,69,.6);margin-top:3px;line-height:1}
#hovTag{position:absolute;display:none;padding:3px 9px;font-size:var(--fs-sm);color:#f0dfa8;background:rgba(16,22,30,.85);border:1px solid rgba(215,170,69,.35);border-radius:8px;pointer-events:none;z-index:24;letter-spacing:1px;white-space:nowrap}
#vX{position:absolute;top:6px;right:6px;width:34px;height:34px;background:rgba(215,170,69,.12);border:1px solid rgba(215,170,69,.4);
  border-radius:8px;color:#d7aa45;font-size:var(--fs-lg);line-height:1;cursor:pointer}
#transitCap{position:absolute;left:50%;top:15%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .5s;pointer-events:none;z-index:20;max-width:88vw}
#transitCap.show{opacity:1}
#transitCap b{display:block;font-size:var(--fs-lg);letter-spacing:4px;color:#f4e6b8;text-shadow:0 0 18px rgba(215,170,69,.85),0 2px 8px #000}
#transitCap i{display:block;font-style:normal;margin-top:6px;font-size:var(--fs-sm);line-height:1.6;color:#dccf9f;letter-spacing:1px;text-shadow:0 1px 6px #000}
#doorIntro{position:absolute;left:50%;top:54px;transform:translate(-50%,-8px);width:min(600px,92vw);z-index:26;opacity:0;pointer-events:none;
  transition:opacity .5s,transform .5s;background:rgba(26,22,44,.9);border:1px solid rgba(215,170,69,.45);border-radius:10px;
  padding:12px 14px;backdrop-filter:blur(6px);box-sizing:border-box}
#doorIntro.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#doorIntro b{display:block;font-size:var(--fs-md);letter-spacing:3px;color:#f0dfa8}
#doorIntro .dit{margin-top:7px;font-size:var(--fs-sm);line-height:1.78;color:#e6d9ac;max-height:36vh;overflow-y:auto;text-align:justify}
#doorIntro .dif{margin-top:8px;font-size:var(--fs-xs);color:#9d9170;letter-spacing:1px}
#ascendFx{position:absolute;inset:0;z-index:60;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden}
#ascendFx .afGlow{position:absolute;left:50%;top:50%;width:150vmax;height:150vmax;
  background:radial-gradient(circle,rgba(244,230,184,.95) 0%,rgba(232,199,102,.55) 22%,rgba(215,170,69,.22) 45%,rgba(32,27,47,0) 70%);
  animation:afGlowK 3s ease-out forwards}
#ascendFx .afLotus{position:relative;width:0;height:0}
#ascendFx .afLotus i{position:absolute;left:0;top:-96px;width:34px;height:96px;margin-left:-17px;transform-origin:50% 100%;
  background:linear-gradient(to top,rgba(232,199,102,.9),rgba(244,236,208,.95));border-radius:50% 50% 46% 46%/62% 62% 38% 38%;
  box-shadow:0 0 18px rgba(232,199,102,.6);opacity:0;animation:afPetalK 1.6s cubic-bezier(.2,.8,.3,1) forwards}
#ascendFx .afWord{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:clamp(26px,6vw,44px);color:#f4e6b8;letter-spacing:8px;
  text-shadow:0 0 26px rgba(232,199,102,.95),0 2px 12px #000;opacity:0;animation:afWordK 2.8s ease forwards .5s;white-space:nowrap}
@keyframes afGlowK{0%{opacity:0;transform:translate(-50%,-50%) scale(.12)}30%{opacity:1}78%{opacity:.95}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
@keyframes afPetalK{0%{opacity:0;transform:rotate(var(--ra)) scaleY(.1)}60%{opacity:1;transform:rotate(var(--ra)) translateY(-6px) scaleY(1.08)}100%{opacity:.95;transform:rotate(var(--ra)) translateY(-4px) scaleY(1)}}
@keyframes afWordK{0%{opacity:0;letter-spacing:20px}35%{opacity:1}80%{opacity:1}100%{opacity:0}}
#ladder{position:absolute;right:6px;top:15%;height:52vh;width:52px;z-index:14;display:none;cursor:pointer}
#ladder.show{display:block}
/* 场景导航（色界四禅/菩萨十科）：左侧极简小滑杆——细金竖轨＋沿轨色点，与右侧天梯镜像；
   文字默认隐去，仅当前层与 hover 时以小气泡浮出（不占版面、不抢星图） */
/* column-reverse：升沉轴由下至上——慧学位/初禅（低）在底、圆教六即/四禅（高）在顶，与右侧天梯同向 */
#bodhiNav,#skyNav{position:absolute;left:8px;top:50%;transform:translateY(-50%);max-height:76vh;z-index:15;display:none;
  flex-direction:column-reverse;justify-content:center;gap:13px;padding:14px 6px;overflow:visible;pointer-events:auto}
#bodhiNav::before,#skyNav::before{content:'';position:absolute;left:10px;top:9px;bottom:9px;width:2px;border-radius:1px;
  background:linear-gradient(rgba(215,170,69,.05),rgba(215,170,69,.22),rgba(215,170,69,.05))}
#bodhiNav.show,#skyNav.show{display:flex;animation:bnvIn .5s ease}
@keyframes bnvIn{from{opacity:0;transform:translate(-12px,-50%)}to{opacity:1;transform:translate(0,-50%)}}
.bnv{position:relative;display:flex;align-items:center;cursor:pointer;flex:0 0 auto;height:11px}
.bnv i{width:9px;height:9px;border-radius:50%;background:currentColor;box-shadow:0 0 5px currentColor;flex:0 0 auto;
  position:relative;z-index:1;transition:transform .2s,box-shadow .2s}
.bnv b{position:absolute;left:19px;white-space:nowrap;font-weight:400;font-size:var(--fs-xs);letter-spacing:1px;color:inherit;
  padding:3px 9px;border-radius:9px;background:rgba(22,18,38,.84);backdrop-filter:blur(6px);
  opacity:0;transform:translateX(-6px);pointer-events:none;transition:opacity .2s,transform .2s;text-shadow:0 1px 3px rgba(10,8,20,.9)}
.bnv:hover b,.bnv.on b{opacity:1;transform:translateX(0)}
/* v222 色界签禅支小字（竖杆行内缀排）；五净居金白圣色（凡圣分界） */
.bnv .bnvSub{font-size:9px;opacity:.66;letter-spacing:1.5px;margin-left:6px;font-weight:400}
.nlabel.pureAbode{color:#f6f0da;text-shadow:0 0 10px rgba(246,240,218,.35),0 1px 3px #000}
.bnv.on i{transform:scale(1.65);box-shadow:0 0 12px currentColor}
.bnv.on b{font-weight:700}
#ladTrack{position:absolute;right:16px;top:0;bottom:0;width:4px;border-radius:2px;
  background:linear-gradient(to top,rgba(176,90,66,.4),rgba(51,144,124,.34) 34%,rgba(91,147,168,.34) 56%,rgba(215,170,69,.4) 76%,rgba(246,236,200,.55))}
#ladTrack i{position:absolute;right:-2px;width:8px;height:2px;background:rgba(215,170,69,.32)}
#ladMe,#ladAi,#ladNext{display:none}
/* v151 用户定案：行棋不用球珠标位，现居门位次自身发光 */
.ladDoor.cur b{color:#ffe9a8;text-shadow:0 0 10px rgba(232,199,102,.85),0 1px 3px rgba(10,8,20,.8)}
.ladDoor.cur i{border-color:#fff;transform:scale(1.55);animation:curPulse 2.2s ease-in-out infinite}
.ladDoor.aic i{outline:2px solid rgba(150,225,214,.75);outline-offset:2px}
@keyframes curPulse{0%,100%{box-shadow:0 0 7px currentColor}50%{box-shadow:0 0 15px currentColor,0 0 24px rgba(232,199,102,.55)}}
#ladTop,#ladBot{position:absolute;right:11px;font-size:var(--fs-xs);color:#cbbb8d;letter-spacing:1px}
#ladTop{top:-20px}#ladBot{bottom:-20px}
.ladDoor{position:absolute;left:0;right:0;height:6.66%;display:flex;align-items:center;justify-content:flex-end;gap:5px;cursor:pointer;pointer-events:auto}
.ladDoor b{font-weight:400;font-size:var(--fs-xs);color:#9d9170;letter-spacing:0;white-space:nowrap;transition:color .2s;text-shadow:0 1px 3px rgba(10,8,20,.8)}
.ladDoor i{width:9px;height:9px;border-radius:50%;border:1px solid rgba(255,255,255,.28);box-shadow:0 0 5px rgba(10,8,20,.5);margin-right:11px;transition:transform .22s,box-shadow .22s;flex:0 0 auto}
.ladDoor.on b{color:#f4e6b8}
.ladDoor.on i{transform:scale(1.75);box-shadow:0 0 12px currentColor}
.ladDoor.cur i{border-color:#fff;box-shadow:0 0 9px rgba(232,199,102,.9)}
#ladName{position:absolute;right:50px;background:rgba(24,18,38,.88);border:1px solid rgba(215,170,69,.45);border-radius:8px;padding:4px 10px;font-size:var(--fs-sm);color:#efe0b4;white-space:nowrap;display:none;pointer-events:none;letter-spacing:1px}
#sfpRoll.glow{animation:rollGlow 1.6s ease-in-out infinite}
#sfpRoll.wait{opacity:.45;filter:saturate(.5)} /* 联机候轮：未轮到时压暗 */
#sfpRoll.hold{background:rgba(215,170,69,.32);box-shadow:0 0 18px rgba(232,199,102,.55);color:#f4e6b8;animation:none}
@keyframes rollGlow{0%,100%{box-shadow:0 0 5px rgba(232,199,102,.2)}50%{box-shadow:0 0 18px rgba(232,199,102,.8)}}
.sfpTrailRow{display:flex;gap:8px;align-items:baseline;font-size:var(--fs-sm);padding:5px 0;border-bottom:1px solid rgba(215,170,69,.15);text-align:left;cursor:pointer}
.sfpTrailRow .tn{flex:0 0 3.4em;color:#9d9170;font-size:var(--fs-xs)}
.sfpTrailRow .tc{flex:0 0 3em;color:#d7aa45}
.sfpMoves{margin:6px 0}
.sfpMoves .mv{display:flex;gap:8px;font-size:var(--fs-sm);margin:3px 0;color:#dccf9f;text-align:left}
.sfpMoves .mv b{color:#d7aa45;font-weight:600;flex:0 0 8.5em;text-align:right}
#toast{bottom:calc(178px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);
  background:rgba(26,22,44,.95);border:1px solid rgba(215,170,69,.6);border-radius:9px;padding:9px 16px;
  font-size:var(--fs-md);opacity:0;transition:opacity .3s;pointer-events:none;max-width:86vw;text-align:center}
#peek{position:absolute;z-index:26;pointer-events:none;max-width:272px;padding:9px 12px;font-size:var(--fs-sm);line-height:1.6;color:#dccf9f;display:none}
#peek b{color:#f4e6b8}
@media (max-width:600px){ #title{font-size:var(--fs-lg);letter-spacing:2px} .nlabel{font-size:var(--fs-xs)} .nlabel.t1{font-size:var(--fs-md)} }
.nlabel.drl{font-size:var(--fs-xs);color:#cfe0d4;opacity:.85;transform:translate(-50%,-165%)}
.nlabel.tier12{font-size:var(--fs-xs);color:#c9b980;opacity:.8;letter-spacing:2.5px;text-shadow:0 0 8px rgba(20,14,34,.9),0 1px 3px #000;pointer-events:none}
.nlabel.tier12.bcap{pointer-events:auto;cursor:pointer;font-size:var(--fs-md);opacity:.94;padding:7px 10px}
.nlabel.tier12.bcap.on{font-size:var(--fs-lg);opacity:1;text-shadow:0 0 14px currentColor,0 1px 4px #000}
.nlabel.cap4{font-size:var(--fs-sm);color:#e8c766;opacity:.9;letter-spacing:3px}
.nlabel.drl.cur{font-size:var(--fs-md);color:#ffe9a8;opacity:1;text-shadow:0 0 12px rgba(215,170,69,.85),0 1px 4px #000}
`;

/* ── 行谱菜单 · 极简 ──
   当前行处先交代上下文；高频入口成两列大触点，低频设置收成细行，危险操作独立沉底。 */
css.textContent += `
.smPanel{width:min(500px,92vw)}
.smPanel>h2{margin-bottom:12px;letter-spacing:5px}
.smPanel .body{display:grid;gap:14px;align-content:start}
.smStat{display:grid;gap:4px;padding:14px 15px;border:1px solid rgba(216,197,139,.14);border-radius:12px;
  background:rgba(255,255,255,.025);line-height:1.5}
.smStat span,.smLabel{color:#817967;font-size:var(--fs-xs);letter-spacing:2px}
.smStat b{color:#e7d9b3;font-size:var(--fs-md);font-weight:500;letter-spacing:2px}
.smStat i{font-style:normal;color:#9d9170;font-size:var(--fs-sm);letter-spacing:1px}
.smSection{display:grid;gap:7px}
.smGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.smList{display:grid;align-content:start;line-height:1.35;border-top:1px solid rgba(216,197,139,.1)}
.smRow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;line-height:1.35;
  border:1px solid transparent;border-radius:10px;padding:11px 12px;cursor:pointer;
  font-family:inherit;color:#e8e2d0;min-height:46px;box-sizing:border-box;transition:background .16s,border-color .16s}
.smGrid .smRow{display:grid;align-content:center;gap:5px;min-height:78px;background:rgba(255,255,255,.03);
  border-color:rgba(216,197,139,.14)}
.smGrid .smRow:last-child:nth-child(odd){grid-column:1/-1;min-height:64px}
.smList .smRow{border-radius:0;border-bottom-color:rgba(216,197,139,.1);background:none}
.smRow:hover,.smRow:active{background:rgba(232,199,102,.09);border-color:rgba(232,199,102,.28)}
.smRow b{font-size:var(--fs-md);font-weight:600;letter-spacing:2px;color:#f0dfa8;flex:none}
.smRow i{font-style:normal;font-size:var(--fs-xs);color:#8f8774;letter-spacing:1px;
  flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.smList .smRow i{text-align:right}
.smDanger{padding-top:2px}
.smRow.warn{min-height:42px;background:none;border-color:transparent}
.smRow.warn b{color:#b9ae93;font-weight:500}
.smRow.arm{background:rgba(217,136,115,.16)}
.smRow.arm b,.smRow.arm i{color:#f08f7a}
.smPanel .gbtn.primary{width:100%;padding:13px 0;letter-spacing:3px}
/* 抓手条：手机底部抽屉态才现 */
.panel .grab{display:none}
@media (max-width:520px){
  /* 底部抽屉：从拇指区升起，贴底不居中 */
  .overlay.ovsheet{align-items:flex-end}
  .overlay.ovsheet .panel{max-width:100vw;width:100%;border-radius:16px 16px 0 0;
    height:auto;max-height:84dvh;border:1px solid rgba(216,197,139,.28);border-bottom:none;
    padding:8px 16px calc(16px + env(safe-area-inset-bottom));animation:pnUp .26s cubic-bezier(.2,.8,.25,1)}
  .overlay.ovsheet .ovClose{top:14px;right:14px}
  .overlay.ovsheet .panel .grab{display:block;height:18px;position:relative;margin:-6px 0 2px}
  .overlay.ovsheet .panel .grab::after{content:'';position:absolute;left:50%;top:7px;width:42px;height:4px;
    border-radius:2px;background:rgba(216,197,139,.45);transform:translateX(-50%)}
  .smPanel .body{gap:11px}.smGrid .smRow{min-height:70px;padding:10px}
}
`;
css.textContent += Plaza.PLAZA_CSS + Plaza.PEER_WIN_CSS; // 共修大厅与同修及第横幅样式随主样式一并注入
document.head.appendChild(css);

function el(html        )              {
  const t = document.createElement('div'); t.innerHTML = zh(html.trim());
  return t.firstElementChild               ;
}
// 右上角常驻大厅入口：进出共修是主干节点，不该藏在底部控制台或二级菜单里。
// 题字（左）＝观照全图，大厅（右）＝进出共修，一屏两角各管一件事。
const topbar = el(`<div id="topbar" class="ui">
  <div id="title">选佛谱 <span style="font-size:11px;color:#d7aa45;opacity:.85">⊙</span></div></div>`);
app.appendChild(topbar);
// 题字即全图观照入口；题屏仍留给开局引导，「选佛」钮负责开始或续掷。
const titleEl = topbar.querySelector('#title')               ;
titleEl.style.cursor = 'pointer';
titleEl.addEventListener('click', () => browseMapMode()); // v258 用户点单：点题字直切观照全图（题屏仍留给开局引导）；v312 符号 ⌄→⊙（⌄暗示下拉而行为是观照，语义勘正）
titleEl.title = '观照全图（存局退出）';

const compass = el(`<div id="compass" class="ui">
  <span class="e">东</span><span class="s">南</span><span class="w">西</span><span class="n">北</span></div>`);
// 罗盘已撤不上屏（极简屏，用户点单）：元素保留不挂载，updateCompass 早退

const freeDock = el('<div id="freeDock" class="ui"></div>');
app.appendChild(freeDock);
const quickSfp = el('<button class="gbtn primary" style="border-radius:24px;padding:13px 30px;font-size:var(--fs-lg);letter-spacing:3px">选佛</button>');
quickSfp.addEventListener('click', () => { // 有存局直接续掷，无则入大厅（文案随之改，一钮一义）
  if (save.sfp && SFP_BY[save.sfp.pos]) startSfp(true); else openPlaza();
});
freeDock.appendChild(quickSfp);
// 底坞主钮一钮一义：有存局说「续掷」，没有才说「选佛」（大厅入口已移至右上角）
function syncFreeDock() {
  const resume = !!(save.sfp && SFP_BY[save.sfp.pos]);
  quickSfp.textContent = zh(resume ? '续掷' : '选佛');
  quickSfp.title = zh(resume ? `续上局：现居「${SFP_BY[save.sfp.pos].name}」` : '入共修大厅择一人行谱或与人共修');
}
// 单菜单原则：自由观照期底坞也带「⋯」，谱务抽屉全程可达（局中入口在 sfpBar）
const quickChat = el('<button class="gbtn netEntry" id="freeChat" style="border-radius:24px;padding:13px 15px" title="同修 · 名单与聊天"><span class="netDots"></span><i class="netUnread"></i></button>');
quickChat.addEventListener('click', () => Net.togglePanel());
freeDock.appendChild(quickChat);
const quickMore = el('<button class="gbtn" style="border-radius:24px;padding:13px 18px;font-size:var(--fs-xl)" title="谱务菜单">⋯</button>');
quickMore.addEventListener('click', () => openSfpMore());
freeDock.appendChild(quickMore);

// 神足飞行（依「神足通飞行自在」义）：默认常开——摇杆已撤不上屏（极简屏）：移动端以双击飞临/双击空处拉远/双指缩放代步，WASD 桌面巡游保留
const joyEl = el('<div id="joy" class="ui"><div id="joyKnob"></div></div>');
let flightOn = false;
const flyKeys = new Set        ();
const joyVec = { x: 0, y: 0 };
function setFlight(v         ) {
  if (flightOn === v) return;
  flightOn = v;
  joyEl.classList.toggle('show', v);
  flyKeys.clear(); joyVec.x = 0; joyVec.y = 0;
  (joyEl.querySelector('#joyKnob')               ).style.transform = '';
  if (v) cancelFly();
}
{
  let jid = -1;
  const knob = joyEl.querySelector('#joyKnob')               ;
  joyEl.addEventListener('pointerdown', (e     ) => {
    jid = e.pointerId; joyEl.setPointerCapture(jid); e.stopPropagation(); e.preventDefault();
  });
  joyEl.addEventListener('pointermove', (e     ) => {
    if (e.pointerId !== jid) return;
    const r = joyEl.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), lim = r.width / 2 - 16;
    if (m > lim) { dx *= lim / m; dy *= lim / m; }
    joyVec.x = dx / lim; joyVec.y = dy / lim;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const jEnd = (e     ) => { if (e.pointerId !== jid) return; jid = -1; joyVec.x = 0; joyVec.y = 0; knob.style.transform = ''; };
  joyEl.addEventListener('pointerup', jEnd); joyEl.addEventListener('pointercancel', jEnd);
}
flightOn = true; // 神足默认常开；摇杆未挂载故不加 show

const secWrap = el(`<div id="secWrap" class="ui"><div id="secTrack"><div id="secZero"></div><div id="secHandle"></div></div>
  <div id="secLabel">探底</div></div>`);
app.appendChild(secWrap);
// 剖面滑杆常开（一套系统：边探索边行棋）；题屏后随场景重评显现；桌面 W/S 键不受影响
let secOn = true;
secWrap.style.display = 'none';
function setSecOn(v         ) { secOn = v; secApplyVis(); }
function secApplyVis() { secWrap.style.display = secOn && !inPure && !inDoor && !inBodhi && !inSky ? '' : 'none'; } // 观照场隐探底：左杆让位场景导航
const secTrack = secWrap.querySelector('#secTrack')               ;
const secHandle = secWrap.querySelector('#secHandle')               ;
const secZero = secWrap.querySelector('#secZero')               ;

const backBtn = el('<button id="backBtn" class="ui gbtn">娑婆</button>')                     ;
// 顶栏题字旁小签（用户点单）：门观中显「全图」、极乐显「娑婆」，不再悬浮突兀
topbar.appendChild(backBtn);
// 右上角常驻大厅入口：进出共修是主干节点，不该藏在底部控制台或二级菜单里。
// 题字与状态小签在左，大厅独占右角，一屏两端各管一件事。
const hallBtn = el('<button id="hallBtn" class="ui gbtn" title="共修大厅 · 一人行谱或与人共修">大厅</button>')                     ;
hallBtn.addEventListener('click', () => { playSfx('sfx-tap', 0.22); openPlaza(); });
topbar.appendChild(hallBtn);

const card = el(`<div id="card" class="panel">
  <div id="cardHead">
    <div><div id="cardName"></div><div id="cardSub"></div></div></div>
  <div id="cardTags"></div>
  <div id="cardBtns"></div>
  <div id="cardBody" class="body"></div>
  <div id="cardNav" class="cardNav" style="display:none"></div></div>`);

const toast = el('<div id="toast" class="ui"></div>');
app.appendChild(toast);
let toastTimer = 0;
// V71：场景操作提示与首次入门总说错开，跨门时只留一层说明。
function noIntroClash() {
  if (!sfpS.active || !sfpS.pos) return true;
  if (doorIntroOn || pendingDoorIntro) return false;
  const p = SFP_BY[sfpS.pos];
  const d = p ? SFP_DOOR_BY[p.door] : null;
  return !(d && d.intro && !sfpS.seenD.includes(p.door));
}
function showToast(msg        , ms = 2600) {
  toast.style.pointerEvents = 'none'; toast.style.cursor = ''; // 默认不可点（同修播报单独开）
  toast.textContent = zh(msg); toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.style.opacity = '0'; }, ms);
}

// ── 站内确认卡 ──
// 取代 window.confirm：原生弹窗与全站自绘卡片调性割裂，手机上尤其突兀，且不受简繁转换管辖。
// 自成一层（不走 overlay），所以身后的大厅或同修面板不会被顶掉，取消即原样回去。
const confirmEl = el(`<div id="sfpConfirm" class="ui"><div class="cfCard" role="dialog" aria-modal="true" aria-labelledby="cfT">
  <h3 id="cfT"></h3><div class="cfBody"></div>
  <button class="gbtn primary" id="cfOk"></button><button class="gbtn" id="cfNo"></button></div></div>`);
app.appendChild(confirmEl);
let confirmResolve                              = null;
function closeConfirm(result         ) {
  if (!confirmResolve) return;
  const done = confirmResolve;
  confirmResolve = null;
  confirmEl.classList.remove('on');
  done(result);
}
function askConfirm(title        , body        , okText = '确定', noText = '再想想')                   {
  closeConfirm(false);                              // 同时只留一张，免叠卡
  (confirmEl.querySelector('#cfT')               ).textContent = zh(title);
  (confirmEl.querySelector('.cfBody')               ).innerHTML = zh(body);
  (confirmEl.querySelector('#cfOk')               ).textContent = zh(okText);
  (confirmEl.querySelector('#cfNo')               ).textContent = zh(noText);
  confirmEl.classList.add('on');
  setTimeout(() => (confirmEl.querySelector('#cfNo')                      )?.focus(), 60);
  return new Promise((resolve) => { confirmResolve = resolve; });
}
(confirmEl.querySelector('#cfOk')               ).addEventListener('click', () => closeConfirm(true));
(confirmEl.querySelector('#cfNo')               ).addEventListener('click', () => closeConfirm(false));
confirmEl.addEventListener('pointerdown', (e) => { if (e.target === confirmEl) closeConfirm(false); });
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !confirmResolve) return;
  e.preventDefault(); e.stopImmediatePropagation();
  closeConfirm(false);
}, true);

// 局中离席会波及全房：不足两位即中止整局。换室、改一人行谱与「离席」钮一律先问这一句。
function confirmLeaveMatch(what        )                   {
  if (!Net.active || !Net.isPlaying()) return Promise.resolve(true);
  const stillIn = Net.room.order.filter(id => !Net.players.find(p => p.id === id)?.done).length;
  const body = stillIn <= 2
    ? '您一走，本局有效同修不足两位，<b>全房这一局会立即中止</b>。'
    : '本局由其余同修继续，您的座位立即让出，本局进度不再保留。';
  return askConfirm(`${what}？`, body, '确定，让出座位', '再想想');
}

// ---------------- 状态 ----------------
let modeT = 0, modeTarget = 0;           // 0 空间 / 1 心性
let inPure = false;
let selectedId                = null;
let flyAnim                                                                                                                = null;
let tourStep = -1;                        // 导览已删；保留变量免动历史引用（恒为 -1）
const filters = { group: new Set        (), sphere: new Set        (), kind: new Set        (), work: new Set        () };
const readSet = new Set        (save.read);
const favSet = new Set        (save.fav);
function syncSave() {
  save.read = [...readSet]; save.fav = [...favSet];
  persist();
}

// ---------------- 相机飞行 ----------------
function flyTo(pos               , target               , dur = 1.3) {
  flyAnim = { p0: camera.position.clone(), p1: pos.clone(), t0: controls.target.clone(), t1: target.clone(), t: 0, dur };
  if (!inPure && !inSky && !inBodhi && !inNether && !inDisc && target.y < 1 && sectionH > target.y + 12) netherOpen(target.y); // 幽冥窗：观地下自开（幽冥专场内不叠剪切）
}
function cancelFly() { flyAnim = null; }
const VIEW_DIST                         = { sumeru: 145, ring7: 95, rupa: 86, arupa: 72, cakravada: 80, gate: 180, chan1: 56, chan2: 62, chan3: 70, chan4: 82 };
function viewPosFor(nv          )                                                {
  const wp = new THREE.Vector3(); nv.marker.getWorldPosition(wp);
  const dist = VIEW_DIST[nv.d.id] ?? (nv.d.tier === 1 ? 62 : nv.d.tier === 3 ? 26 : 46);
  const dir = wp.clone().setY(0);
  if (dir.lengthSq() < 25) dir.copy(camera.position.clone().sub(controls.target).setY(0));
  if (dir.lengthSq() < 1) dir.set(1, 0, 1);
  dir.normalize();
  const pos = wp.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, dist * 0.42, 0));
  return { pos, target: wp };
}

// ---------------- 节点选择与卡片 ----------------
const cardName = card.querySelector('#cardName')               ;
const cardSub = card.querySelector('#cardSub')               ;
const cardTags = card.querySelector('#cardTags')               ;
const cardBtns = card.querySelector('#cardBtns')               ;
const cardBody = card.querySelector('#cardBody')               ;
const cardNav = card.querySelector('#cardNav')               ;

function esc(s        ) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

function renderCard() {
  if (!selectedId) return;
  const nv = byId[selectedId]; const d = nv.d;
  cardName.textContent = zh(d.name); cardSub.textContent = zh(d.sub || '');
  const kindCls = d.coordKind === 'nonspatial' ? 'ns' : (d.coordKind === 'schematic' ? 'warn' : '');
  cardTags.innerHTML = zh(`<span class="tag">${d.group}</span><span class="tag">${d.sphere}</span>
    <span class="tag ${kindCls}">${(COORD_KIND_LABEL       )[d.coordKind]}</span>`);
  // 按钮：仅保留收藏与进入极乐世界，内容全部入单卡折叠段
  cardBtns.innerHTML = '';
  const favB = el(`<button class="gbtn${favSet.has(d.id) ? ' primary' : ''}">${favSet.has(d.id) ? '★ 已收藏' : '☆ 收藏'}</button>`);
  favB.addEventListener('click', () => toggleFav(d.id));
  cardBtns.appendChild(favB);
  if (d.id === 'rupa' && !inSky) {
    const go = el('<button class="gbtn primary">进入色界诸天</button>');
    go.addEventListener('click', () => enterSkyTransit());
    cardBtns.appendChild(go);
  }
  if (d.id === 'gate') {
    const go = el('<button class="gbtn primary">进入极乐世界</button>');
    go.addEventListener('click', () => enterPureTransit());
    cardBtns.appendChild(go);
  }
  // 正文：简介常显；详说（含何因生此）默认展开；参考段折叠
  let html = `<div class="one">${esc(d.line)}</div>`;
  let dh = '';
  if (d.detail) dh += `<div style="color:#dccf9f">${esc(d.detail)}</div>`;
  if (d.cause) dh += `<div class="causeBox"><div class="ck">何因生此</div>
    <div class="cv">${esc(d.cause.v)}</div><div class="cs">${esc(d.cause.src)}</div></div>`;
  dh += `<div class="coordBox">器世间坐标 — 方位：${esc(d.bear)}｜高度：${esc(d.elev)}</div>`;
  if (d.realm) {
    const m = (REALMS       )[nv.realmIdx].mind;
    dh += `<div class="mindBars">
      <div class="row"><span>迷执—觉照</span><div class="bar"><div class="fill" style="width:${m.awaken * 100}%"></div></div></div>
      <div class="row"><span>苦——乐</span><div class="bar"><div class="fill" style="width:${m.joy * 100}%"></div></div></div>
      <div class="row"><span>利己—利他</span><div class="bar"><div class="fill" style="width:${m.altru * 100}%"></div></div></div></div>`;
  }
  const sec = (key        , title        , inner        , open = false) =>
    `<details class="sec" data-sec="${key}"${open ? ' open' : ''}><summary>${title}</summary>${inner}</details>`;
  // 先分段构建，再按场景定序：局中且现居位挂在本节点→谱位提前并默认展开；出处是参考材料永远压底
  const secCite = sec('cite', `出处 · ${d.citations.length} 条`, d.citations.map((c     ) => `<details class="citeD${c.kind === 'quote' ? ' q' : ''}">
      <summary><span class="src">《${esc(c.work)}》${esc(c.juan)} · ${esc(c.ref)}</span>
      <span class="kind">${c.kind === 'quote' ? '经文摘录' : '义理概述'}</span></summary>
      <div class="txt">${esc(c.text)}</div></details>`).join('')
    + `<div class="cNote" style="margin-top:6px">点条目展开全文；「经文摘录」依 CBETA 通行本校写。</div>`);
  // 界相·众相
  let secProf = '';
  if (d.profile || d.figures) {
    let ph = '';
    if (d.profile) ph += (d.profile         ).map((p     ) => `<div class="profRow"><span class="pk">${esc(p.k)}</span>
        <div class="pv">${esc(p.v)}<span class="psrc">${esc(p.src)}</span></div></div>`).join('');
    if (d.figures) {
      ph += `<div class="cMeta" style="margin-top:10px">众相 · 代表人物</div>`;
      ph += (d.figures         ).map((f     ) => `<div class="citeItem"><div class="src">${esc(f.name)}</div>
        <div class="txt">${esc(f.note)}</div></div>`).join('');
    }
    ph += `<div class="cNote" style="margin-top:6px">出处带「义」字者为义理概述（本图撮述），不带者为逐字原文；寿量身量诸说以《俱舍》系为主，异说不强行统一。</div>`;
    secProf = sec('prof', '界相 · 众相', ph);
  }
  // 异说
  const secAlt = d.alt ? sec('alt', '异说并存', `<div class="citeItem"><div class="src">异说并存 <span class="kind">不强行统一</span></div><div class="txt">${esc(d.alt)}</div></div>`) : '';
  // 选佛谱位（锚在本节点的谱位）：点芯片卡内就地展开譜曰，不跳转
  const posHere = (SFP_AT[d.id] || [])         ;
  const atCur = sfpS.active && !!sfpS.pos && posHere.some((p     ) => p.id === sfpS.pos);
  let secSfp = '';
  if (posHere.length) {
    let sh = '';
    let lastDoor = -1;
    posHere.forEach((p     ) => {
      if (p.door !== lastDoor) {
        sh += `<div style="font-size:var(--fs-xs);color:#9d9170;letter-spacing:1px;margin-top:6px">第${SFP_CN[p.door - 1]}门 · ${SFP_DOOR_BY[p.door].title}</div>`;
        lastDoor = p.door;
      }
      sh += `<span class="sfpChip${sfpS.pos === p.id ? ' cur' : ''}" data-pid="${esc(p.id)}">${esc(p.name)}</span>`;
    });
    sh += `<div id="inNote" class="inlineNote"></div>`;
    sh += `<div class="cNote" style="margin-top:6px">点位名当场展开譜曰，再点收起；珠串按原谱位序盘升——低位在下，高位在上。</div>`;
    secSfp = sec('sfp', `选佛谱位 · ${posHere.length}${atCur ? ' · 现居' : ''}`, sh, atCur);
  }
  // 定序：探索时详说领首；局中现居时谱位领首、详说收起
  html += atCur ? secSfp : '';
  html += sec('detail', d.cause ? '详说 · 何因生此' : '详说', dh, !atCur);
  html += secProf + secAlt;
  html += atCur ? '' : secSfp;
  html += secCite;
  cardBody.innerHTML = zh(html);
  cardBody.querySelectorAll('.sfpChip').forEach(ch => ch.addEventListener('click', () => {
    const pid = pidOf((ch               ).dataset.pid);
    const box = cardBody.querySelector('#inNote')               ;
    const was = ch.classList.contains('sel');
    cardBody.querySelectorAll('.sfpChip').forEach(c => c.classList.remove('sel'));
    if (was || !pid || !SFP_BY[pid]) { box.style.display = 'none'; box.innerHTML = ''; return; }
    ch.classList.add('sel');
    const p = SFP_BY[pid];
    box.style.display = 'block';
    box.innerHTML = zh(`<div style="font-size:var(--fs-xs);color:#d7aa45;letter-spacing:1px">${esc(SFP_DOOR_BY[p.door].title)} · ${esc(p.name)}${p.pure ? ' · 净土' : ''}</div>
      <div class="verse">${verseHtml(p.note)}</div>
      <button class="gbtn" id="inLoc" style="font-size:var(--fs-sm);min-height:32px;padding:4px 12px">定位此珠</button>`);
    (box.querySelector('#inLoc')               ).addEventListener('click', () => { closeOverlay(); sfpLocate(pid); });
  }));
  // 卡内翻页：同层节点（婑婆/极乐各自一套）按数据序上一位/下一位
  const ring = nodeViews.filter(v => !!v.d.pure === !!d.pure);
  const ci = ring.findIndex(v => v.d.id === d.id);
  cardNav.style.display = ci >= 0 ? 'flex' : 'none';
  cardNav.innerHTML = '';
  const mkNav = (prev         ) => {
    const t = ring[ci + (prev ? -1 : 1)];
    const b = el(`<button class="gbtn${t ? '' : ' dis'}">${prev ? '‹ ' : ''}${t ? t.d.name : (prev ? '已是首位' : '已是末位')}${prev ? '' : ' ›'}</button>`);
    if (t) b.addEventListener('click', () => selectNode(t.d.id));
    cardNav.appendChild(b);
  };
  mkNav(true); mkNav(false);
}
function selectNode(id        , fly = true) {
  const nv = byId[id]; if (!nv) return;
  if (nv.d.pure && !inPure) return;
  if (!nv.d.pure && inPure) return;
  if (CHAN_OF[id] && chanOpen !== CHAN_OF[id]) { chanOpen = CHAN_OF[id]; chanRevealT = performance.now(); } // 谱注/搜索/翻页直点成员天：自动绽开其层星环，免飞向隐星
  else if (CHAN_LAYER[id] && !inSky && chanOpen !== CHAN_LAYER[id]) { chanOpen = CHAN_LAYER[id]; chanRevealT = performance.now(); } // 直点禅天主星同理：子树隐时也能飞到可见目标
  if (selectedId && byId[selectedId]) byId[selectedId].label.classList.remove('sel');
  selectedId = id;
  nv.label.classList.add('sel');
  if (!readSet.has(id)) { readSet.add(id); syncSave(); }
  nv.label.classList.add('read');
  // 统一弹窗体系：节点卡与谱注同走 overlay 抽屉；关卡（蒙层/✕）即取消选中
  overlayOnClose = null;
  openOverlay(card);
  overlayOnClose = deselectNode;
  renderCard();
  cardBody.scrollTop = 0;
  if (fly) {
    const v = viewPosFor(nv);
    const dist = v.pos.distanceTo(v.target);
    if (matchMedia('(max-width:640px)').matches) {
      // 手机右侧抽屉：视线中心右移，节点落在左侧可见区
      const fwd = new THREE.Vector3().subVectors(v.target, v.pos); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const s = dist * 0.16;
      v.pos.addScaledVector(right, s); v.target.addScaledVector(right, s);
    }
    flyTo(v.pos, v.target);
  }
  { // 点选涟漪：选中星位落一记金环（与行棋落位同语汇，轻量反馈）
    const wp = new THREE.Vector3(); nv.marker.getWorldPosition(wp);
    impactAt(wp, 0.7);
  }
  playSfx('sfx-tap', 0.35);
}
function deselectNode() {
  if (selectedId && byId[selectedId]) byId[selectedId].label.classList.remove('sel');
  selectedId = null;
}
function closeCard() {
  if (card.isConnected) { closeOverlay(); return; } // closeOverlay 的 onClose 里取消选中
  deselectNode();
}

function toggleFav(id        ) {
  if (favSet.has(id)) favSet.delete(id);
  else { favSet.add(id); playSfx('sfx-fav', 0.4); showToast('已收藏 · ' + byId[id].d.name); }
  syncSave(); updateLabelBadges();
  if (selectedId === id) renderCard();
}
function updateLabelBadges() {
  nodeViews.forEach(nv => {
    nv.label.textContent = zh((favSet.has(nv.d.id) ? '★ ' : '') + (nv.d.labelText ?? nv.d.name));
    if (readSet.has(nv.d.id)) nv.label.classList.add('read');
  });
}
updateLabelBadges();

// ---------------- 覆盖层 ----------------
let overlayEl                     = null;
let overlayOnClose                      = null;
// v220 弹窗交互统一：场景转场用软关——挂 keepOv 的重要面板（及第等）不被转场吞掉；用户手关（✕/背景/Esc/按钮）仍走 closeOverlay
function softCloseOverlay() { if (overlayEl && overlayEl.querySelector('.keepOv')) return; closeOverlay(); }
function closeOverlay() {
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  controls.autoRotate = false; // 题屏环拍只在题屏挂：任何覆盖层一收即停
  const f = overlayOnClose; overlayOnClose = null; if (f) f();
}
function openOverlay(inner             ) {
  closeOverlay();
  overlayEl = el('<div class="overlay ui"></div>');
  const isSheet = inner.classList.contains('sheet');
  const isCenter = inner.classList.contains('center');
  if (isSheet) overlayEl.classList.add('ovb');
  if (isCenter) overlayEl.classList.add('ovc');
  overlayEl.appendChild(inner);
  // 统一右上角✕，移动端不依赖点外部空白
  if (inner.classList.contains('panel') && !inner.querySelector('.ovClose')) {
    const x = el('<button class="gbtn ovClose" aria-label="关闭" title="关闭">✕</button>');
    x.addEventListener('click', closeOverlay);
    inner.appendChild(x);
  }
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeOverlay(); });
  // 手机抽屉：右滑关闭（底部抽屉改下滑关）——位移主导才接管，不干扰滚动与点按
  if (matchMedia('(max-width:640px)').matches && !isCenter) {
    let x0 = -1, y0 = 0, dx = 0, dy = 0, drag = false;
    inner.addEventListener('pointerdown', (e              ) => { x0 = e.clientX; y0 = e.clientY; dx = 0; dy = 0; drag = false; });
    inner.addEventListener('pointermove', (e              ) => {
      if (x0 < 0) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (isSheet) {
        if (!drag && dy > 16 && dy > Math.abs(dx) * 1.4) { drag = true; inner.style.transition = 'none'; }
        if (drag) inner.style.transform = `translateY(${Math.max(0, dy)}px)`;
      } else {
        if (!drag && dx > 16 && dx > Math.abs(dy) * 1.4) { drag = true; inner.style.transition = 'none'; }
        if (drag) inner.style.transform = `translateX(${Math.max(0, dx)}px)`;
      }
    });
    const fin = () => {
      if (x0 < 0) return;
      x0 = -1; inner.style.transition = ''; inner.style.transform = '';
      if (drag && (isSheet ? dy > 70 : dx > 80)) closeOverlay();
      drag = false;
    };
    inner.addEventListener('pointerup', fin);
    inner.addEventListener('pointercancel', fin);
  }
  app.appendChild(overlayEl);
}

function openLibrary(tab = 'cites') {
  // 极简化：地图筛选已撤，只留参考经典（原「引用总表」）
  void tab;
  const p = el(`<div class="panel"><h2>参考经典</h2><div id="libBody"></div></div>`);
  (p.querySelector('#libBody')               ).appendChild(buildCitesPane());
  openOverlay(p);
}
function openCitesTable() { openLibrary('cites'); }

function buildCitesPane()              {
  // 两级导览（UIUX 优化，用户点单）：经典总览卡 → 单部经条目列表——取代原全量平铺长列表
  const pane = el(`<div><div id="citeHome"></div>
    <div class="cNote">「经文摘录」依 CBETA 通行本校写；「义理概述」为白话撮要，非逐字经文。</div></div>`);
  const home = pane.querySelector('#citeHome')               ;
  const byWork                                                  = {};
  NODES.forEach((d     ) => d.citations.forEach((c     ) => { (byWork[c.work] = byWork[c.work] || []).push({ c, node: d.name }); }));
  const works = (WORKS            ).filter(w => byWork[w]);
  const total = works.reduce((a, w) => a + byWork[w].length, 0);
  const showWork = (w        ) => {
    const es = byWork[w] || [];
    let html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap"><span class="gbtn" id="citeBack" style="padding:5px 13px;cursor:pointer">‹ 经典总览</span><b style="color:#f0dfa8">《${esc(w)}》</b><span style="font-size:var(--fs-xs);color:#9d9170">${es.length} 条</span></div><div class="body">`;
    es.forEach(({ c, node }) => {
      html += `<details class="citeD${c.kind === 'quote' ? ' q' : ''}"><summary><span class="src">${esc(c.juan)} · ${esc(c.ref)}</span>
        <span class="kind">${c.kind === 'quote' ? '经文摘录' : '义理概述'}</span>
        <span class="kind">${esc(node)}</span></summary><div class="txt">${esc(c.text)}</div></details>`;
    });
    home.innerHTML = zh(html + '</div>');
    (home.querySelector('#citeBack')               ).addEventListener('click', showHome);
    home.scrollIntoView && (pane.closest('.panel') ? (pane.closest('.panel')               ).scrollTop = 0 : 0);
  };
  const showHome = () => {
    let html = `<div style="font-size:var(--fs-sm);color:#9d9170;margin-bottom:8px">本图说明皆出有据——${works.length} 部经论 · ${total} 条参照，按经典分列，点开细读</div><div id="workCards">`;
    works.forEach((w, i) => {
      const es = byWork[w]; const q = es.filter(e => e.c.kind === 'quote').length;
      html += `<div class="workCard" data-i="${i}"><b>《${esc(w)}》</b><span>${es.length} 条${q ? ` · 摘录 ${q}` : ''} ›</span></div>`;
    });
    home.innerHTML = zh(html + '</div>');
    home.querySelectorAll('.workCard').forEach(cd => cd.addEventListener('click', () => showWork(works[Number((cd               ).dataset.i)] || '')));
  };
  showHome();
  return pane;
}

function buildFiltersPane()              {
  const pane = el(`<div><div class="body" id="fbody"></div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="gbtn" id="fclear">清空</button>
    <span style="font-size:var(--fs-xs);color:#9d9170">筛选即时生效，作用于地图标签</span></div></div>`);
  const body = pane.querySelector('#fbody')               ;
  const cats                                    = [
    ['group', '界群', ['器世间', '六凡', '四圣', '净土']],
    ['sphere', '三界', ['欲界', '色界', '无色界', '非三界摄']],
    ['kind', '坐标类型', ['scripture', 'schematic', 'nonspatial']],
    ['work', '经典', WORKS            ],
  ];
  cats.forEach(([key, label, items]) => {
    const row = el(`<div><div style="font-size:var(--fs-sm);color:#d7aa45;letter-spacing:2px">${label}</div><div class="chipRow"></div></div>`);
    const cr = row.querySelector('.chipRow')               ;
    (items            ).forEach(it => {
      const set = (filters       )[key]               ;
      const disp = key === 'kind' ? (COORD_KIND_LABEL       )[it] : it;
      const c = el(`<div class="chip${set.has(it) ? ' on' : ''}">${disp}</div>`);
      c.addEventListener('click', () => { set.has(it) ? set.delete(it) : set.add(it); c.classList.toggle('on'); });
      cr.appendChild(c);
    });
    body.appendChild(row);
  });
  (pane.querySelector('#fclear')               ).addEventListener('click', () => {
    Object.values(filters).forEach(s => s.clear());
    body.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  });
  return pane;
}
function passFilter(d     )          {
  if (filters.group.size && !filters.group.has(d.group)) return false;
  if (filters.sphere.size && !filters.sphere.has(d.sphere)) return false;
  if (filters.kind.size && !filters.kind.has(d.coordKind)) return false;
  if (filters.work.size && !d.citations.some((c     ) => filters.work.has(c.work))) return false;
  return true;
}

function openSettings() {
  // v313 用户令瘦身：声音三项（音效/环境声/及第唱赞）合并一行总开关（底层三键同进退，存档兼容）；低性能行删（自动降档制替）
  const p = el(`<div class="panel"><h2>设置</h2><div class="body">
    <div class="setRow"><span>声音（音效 · 环境声 · 及第唱赞）</span><button class="gbtn" data-k="sfx"></button></div>
    <div class="setRow"><span>行棋特效（乘光飞行动画；关＝直达落位）</span><button class="gbtn" data-k="moveFx"></button></div>
    <div class="setRow"><span>大字（卡片正文加大）</span><button class="gbtn" data-k="bigFont"></button></div>
    <div class="setRow"><span>卡片主题</span><button class="gbtn" id="themeSet"></button></div>
    <div class="setRow"><span>简繁显示（OpenCC）</span><button class="gbtn" id="zhSet"></button></div>
    </div></div>`);
  const sync = () => p.querySelectorAll('button[data-k]').forEach(b => {
    const k = (b               ).dataset.k                                                        ;
    b.textContent = zh(save.settings[k] ? '开' : '关');
    b.classList.toggle('primary', save.settings[k]);
  });
  p.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = (b               ).dataset.k                                                        ;
    save.settings[k] = !save.settings[k]; persist(); sync();
    if (k === 'ambient' && ambientNodes) ambientNodes.gain.gain.value = save.settings.ambient ? 0.026 : 0;
    if (k === 'lowPerf') applyDpr();
    if (k === 'bigFont') document.documentElement.classList.toggle('bigfont', save.settings.bigFont);
  }));
  const themeBtn = p.querySelector('#themeSet')               ;
  const themeSync = () => { themeBtn.textContent = zh(save.cardTheme === 'paper' ? '写经纸' : '暗夜'); themeBtn.classList.toggle('primary', save.cardTheme === 'paper'); };
  themeBtn.addEventListener('click', () => { save.cardTheme = save.cardTheme === 'paper' ? 'night' : 'paper'; persist(); applyCardTheme(); themeSync(); });
  const zhBtn = p.querySelector('#zhSet')               ;
  const zhSync = () => { zhBtn.textContent = save.zh === 't' ? '繁體' : '简体'; };
  zhBtn.addEventListener('click', () => {
    save.zh = save.zh === 't' ? 's' : 't'; persist();
    zhDom(document.body);
    sfpStatus(); updateModeChip(); zhSync(); refreshPureNames();
    if (selectedId && card.isConnected) renderCard();
  });
  zhSync(); themeSync(); sync(); openOverlay(p);
}

function openTitle() {
  const hasSfp = !!(save.sfp && SFP_BY[save.sfp.pos]);
  const act = sfpS.active;
  const cur = act || hasSfp ? SFP_BY[(act ? sfpS.pos : save.sfp.pos)          ] : null;
  // 题屏极简（v196）：一图·一名·一句·一钮——缘起长文已迁玩法卡（细字行直达），次级操作收为细字行；题名叠图上
  const p = el(`<div class="panel" style="text-align:center;max-width:min(400px,92vw)">
    <div class="tkey"><img src="assets/title-cg.jpg" alt="">
      <div style="position:absolute;left:0;right:0;bottom:12px;font-size:36px;letter-spacing:16px;text-indent:16px;color:#f4e6b8;text-shadow:0 2px 12px rgba(0,0,0,.9),0 0 30px rgba(215,170,69,.35)">选佛谱</div></div>
    <div style="font-size:var(--fs-sm);letter-spacing:2px;color:#9d9170;margin:0 0 16px">一人或与莲友共修 · 行十法界 · 直至选佛及第</div>
    <button class="gbtn primary" id="tiSfp" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 10px"><b style="letter-spacing:4px">${act ? '回到局中' : (hasSfp ? '续掷上局' : '开始行谱')}</b>
      ${cur ? `<span style="font-size:var(--fs-xs);color:#c8b988;letter-spacing:1px">现居「${esc(cur.name)}」 · 第 ${act ? sfpS.n : save.sfp.n} 掷</span>` : ''}</button>
    <div style="display:flex;justify-content:center;gap:22px;margin-top:13px;flex-wrap:wrap">
      ${act || hasSfp ? '<span class="tlink" id="tiNew">新开一局</span>' : ''}
      <span class="tlink" id="tiHow">玩法</span>
      ${Net.active ? `<span class="tlink" id="tiNet">${esc(Net.roomLabel())}</span>`
        : (act || hasSfp ? '<span class="tlink" id="tiHall">共修大厅</span>' : '')}
      <span class="tlink" id="tiShare">分享</span></div></div>`);
  // 主钮三态：局中→回局；有存局→直接续掷；无局→全屏大厅选择一人或与人共修。
  (p.querySelector('#tiSfp')               ).addEventListener('click', () => {
    if (act) { closeOverlay(); return; }
    if (hasSfp) { closeOverlay(); startSfp(true); return; }
    openPlaza();
  });
  const thall = p.querySelector('#tiHall');
  if (thall) thall.addEventListener('click', () => openPlaza());
  const tn = p.querySelector('#tiNew');
  if (tn) tn.addEventListener('click', () => { closeOverlay(); startSfp(false); });
  (p.querySelector('#tiHow')               ).addEventListener('click', () => openSfpHelp());
  const tnet = p.querySelector('#tiNet');             // 已在房：直达同修面板
  if (tnet) tnet.addEventListener('click', () => {
    closeOverlay();
    if (!sfpS.active) startSfp(hasSfp);
    Net.openPanel();
  });
  (p.querySelector('#tiShare')               ).addEventListener('click', () => quickShare({ code: Net.active ? Net.code : '', zh, toast: showToast })); // 荐游戏；已在房则荐的即邀请
  openOverlay(p);
  if (overlayEl) overlayEl.classList.add('ovc'); // 题屏：手机居中呈现
  controls.autoRotate = true; controls.autoRotateSpeed = -0.42; // 题屏环拍：山景缓旋作活背景，任意操作即停
}

// 手势教学已撤（用户点单）：操作要领折进玩法卡

// 观照全图＝存局退出入自由观照；v258 将入口移到顶栏题字。
function browseMapMode() {
  setBrowseDoor(0);
  if (inDoor) exitDoor(false);
  const was = sfpS.active;
  if (was) endSfp('行处已存，入自由观照——点「选佛」可续掷');
  if (inPure || inSky || inBodhi || inDisc) returnSaha();
  flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
  if (!was) showToast('十五门三段安位：下环世间流转、中阶三学转身、上轨四教入圣——点门展开，双击入场：极乐星径入净土、余门俯冲贴近', 4200);
}

// ---------------- 空间/心性切换 ----------------
// setMode（渐变切换）已删：模式钮撤后无调用点，仅留 setModeInstant 供开局/收谱复位

// ---------------- 剖面滑杆 ----------------
function updateSectionUI() {
  const f = (sectionH - SECTION_MIN) / (SECTION_MAX - SECTION_MIN);
  secHandle.style.bottom = `${f * 100}%`;
  const zf = (0 - SECTION_MIN) / (SECTION_MAX - SECTION_MIN);
  secZero.style.bottom = `${zf * 100}%`;
}
{
  let dragging = false;
  const fromEvent = (e              ) => {
    const r = secTrack.getBoundingClientRect();
    const f = THREE.MathUtils.clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    setSection(SECTION_MIN + f * (SECTION_MAX - SECTION_MIN));
  };
  secTrack.addEventListener('pointerdown', (e) => { dragging = true; netherCancel(); try { secTrack.setPointerCapture(e.pointerId); } catch (err) {} fromEvent(e); });
  secTrack.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
  secTrack.addEventListener('pointerup', () => dragging = false);
  secTrack.addEventListener('pointercancel', () => dragging = false);
}
updateSectionUI();

// ---------------- 极乐世界 ----------------
let savedCam                                                       = null;
function enterPure() {
  if (inPure) return;
  inPure = true;
  cancelFly();
  savedCam = { pos: camera.position.clone(), target: controls.target.clone() };
  closeCard(); softCloseOverlay(); // v220 软关：不吞 keepOv 重要面板
  setModeInstant(0);
  saha.visible = false; mandala.visible = false;
  pureLand.visible = true;
  applyLight('pureland');
  camera.position.set(-2000 + 90, 55, 150);
  controls.target.set(-2000, 22, 0);
  controls.maxDistance = 240;
  secWrap.style.display = 'none';
  backBtn.classList.add('show');
  playBell(262, 0.06);
  if (noIntroClash()) showToast('极乐世界 · 点四土名牌与莲位可读每一土说明（不在须弥坐标系内）', 3400);
}
// 双击极乐星／卡钮「进入极乐世界」：星河转金过场径入（用户点单：直接转场进入）；
// 行棋入净土位另走 sfp 乘光链路（彼处 fadeTransit 内已含 enterPure），不走此门
function enterPureTransit() {
  if (inPure || fadeEl.style.opacity === '1') return;
  fadeTransit(() => { enterPure(); setTransit(false); }, true, 900);
}
(window       ).__pureGo = (on         ) => on ? enterPure() : returnSaha(); // 自测钩子：出入净土（音乐已撤，钩子留着自测用）
// 极乐星点击专拍（题字与星体共用）：单击开介绍卡但缓 340ms 才开——
// 否则卡一弹出就盖住星体，第二击永远落不到星上，双击直入形同虚设；
// 窗口内再点一下＝取消开卡、星河转金径入极乐
let gateCardT = 0;
function gateTap(_dbl         ) { // v163 用户定案：单击即入极乐（与道场同手感）；总星谱注从搜索/谱卡互链仍可读
  if (inPure) return;
  if (gateCardT) { clearTimeout(gateCardT); gateCardT = 0; }
  enterPureTransit(); playSfx('sfx-tap', 0.25);
}
// ---------------- 色界观照场（v140：与极乐同一套语法）----------------
function enterSky() {
  if (inSky || inPure) return;
  inSky = true;
  skyEnterAt = performance.now();
  cancelFly();
  // 入场先清门态（v146 用户报“入色界地图空”）：若正开着非色界之门（门观/全亮），
  // v143 的“无关题字全隐”会连十八天星带字一并隐掉——色界两门（5/8）保留，余门收拢
  if (inDoor) { inDoor = 0; clearDoorFocus(); backBtn.dataset.t = ''; }
  if (browseDoor && browseDoor !== 5 && browseDoor !== 8) setBrowseDoor(0);
  savedCam = { pos: camera.position.clone(), target: controls.target.clone() };
  closeCard(); softCloseOverlay(); // v220 软关：不吞 keepOv 重要面板
  setModeInstant(0);
  saha.visible = false; mandala.visible = false; nodesRoot.visible = false;
  scene.fog = new THREE.FogExp2(C.bg, 0.0006);
  fogBase = 0.0006; // ＝LIGHT_SCENES.sky；出场统一走 returnSaha 恢复光境
  skyRelayout(true); // v165：坛城撑开 ×1.7，十八天平铺看清
  skySel = skyPosLayer() || -1; // v175 对齐菩萨道场：默认收拢；现居色界位则自动定开其禅层（落位定开）
  if (skySel > 0) chanRevealT = performance.now();
  skyNavSync(); skyNav.classList.add('show'); // v166：禅层签条滑入；v174 左侧竖杆
  camera.position.set(108, 238, 118); // 揭幕后缓推入坐：转金散尽镜头自远微推，入场不生硬
  controls.target.set(0, 168, 0);
  if (skySel > 0) { // 落位定开：俯冲贴该禅层（对齐道场落位镜程），而非全景
    const RY = [0, 149.4, 158.4, 167.4, 179.3][skySel], RR = [0, 14, 18, 22, 26][skySel];
    const yw = SKY_YC + (RY - SKY_YC) * SKY_K, rw = RR * SKY_K;
    flyTo(new THREE.Vector3(0, yw + rw * 1.05, 0).addScaledVector(new THREE.Vector3(0.6, 0, 0.8).normalize(), rw * 2.0), new THREE.Vector3(0, yw, 0), 1.6);
  } else {
    flyTo(new THREE.Vector3(92, 222, 100), new THREE.Vector3(0, 168, 0), 1.6); // v164：仰角略抬；v165：撑开后同步拉远
  }
  controls.maxDistance = 280;
  secWrap.style.display = 'none';
  backBtn.classList.add('show');
  playBell(294, 0.06);
  if (noIntroClash()) showToast(skySel > 0 ? '色界 · 已聚显现居禅层（余层自隐）——点左杆签换层，点星读其天，「全图」或 Esc 返回' : '色界 · 四禅十八天——点左杆签或主星聚显其层（余层自隐），点星读其天，再点收拢回全览；「全图」或 Esc 返回', 3400);
}
// v175 现居位所在禅层：场内恒显该层（棋子悬星上不可失依托，同菩萨道场落位定开之例）
function skyPosLayer()         {
  if (sfpS.active && sfpS.pos) { const p = SFP_BY[sfpS.pos]; if (p && CHAN_OF[p.anchor]) return CHAN_OF[p.anchor]; }
  return 0;
}
function enterSkyTransit() {
  if (inSky || fadeEl.style.opacity === '1') return;
  fadeTransit(() => { enterSky(); setTransit(false); }, true, 900);
}
// 色界总星专拍（同极乐星 gateTap）：单击缓 340ms 开介绍卡留双击窗口，双击星河转金径入色界场
let rupaCardT = 0;
let skyEnterAt = 0, bodhiEnterAt = 0; // v208 交互总纲：场内再点本星＝出，入场 900ms 冷却防误触
function rupaTap(_dbl         ) { // v163 用户定案：单击即入色界诸天
  if (inSky) return;
  if (rupaCardT) { clearTimeout(rupaCardT); rupaCardT = 0; }
  enterSkyTransit(); playSfx('sfx-tap', 0.25);
}
// ===== 因地星盘专场（v314 用户定案：门1「發始因地」廿一位排成安位星环，点门转场专观）=====
// 与色界/道场同语法：单击门1直入、Esc/「全图」返回、行棋起手自动退场；安位表行法数据不动，
// 星环只是首掷安位表的空间化呈现：21 组合按轮相序一环，四类因（门1总说四分法）分段分色。
let inDisc = false;
let discBuilt = false;
let discEnterT = 0;
const discRoot = new THREE.Group();
scene.add(discRoot); discRoot.visible = false;
const DISC_C = new THREE.Vector3(0, 80, 0);
const DISC_CATS = [ // 下标段落＝门1总说四分法；段色取「一轴一谱」三段色谱＋四圣金
  { a: 0, b: 2, c: 0xb05a42, t: '惡因' },
  { a: 3, b: 9, c: 0x33907c, t: '世間雜因' },
  { a: 10, b: 14, c: 0x5b93a8, t: '禪定因' },
  { a: 15, b: 20, c: 0xd7aa45, t: '出世正因' },
];
// v322 行门四门谱页（用户点单：门6-9行门非处所不铺主图，转场进入——对齐门1星盘/菩萨道场语法）；v324 门2同制（用户定案：法道流弊五位亦行门性质，全锚人间）：
// 谱页式短行阵同 v318 制（每行≤4珠、签一律珠下、零线条）；形制 v326 用户定案：谱页珠一律球形（v147 莲台阶片退役）；
// 门2独例：行序自上而下＝谱序（流弊本义即沉降，与他页「自下而上渐善」互为镜像，同主图盘升排除之义）
const DISC_DOORS = new Set([1, 2, 6, 7, 8, 9]);
const DISC_PAGES                                                                                                                       = {
  2: { lines: [[3, 2]], ly: [[8, -8]], cats: [{ a: 0, b: 4, t: '' }], num: '五' }, // 破尸羅→增上慢：逐行逐堕
  6: { lines: [[3], [3]], ly: [[-9], [9]], cats: [{ a: 0, b: 2, t: '生善' }, { a: 3, b: 5, t: '滅惡' }], num: '六' }, // 科名即门题两分
  7: { lines: [[4, 4, 4, 1]], ly: [[-24, -8, 8, 24]], cats: [{ a: 0, b: 12, t: '' }], num: '十三' }, // 從小階大自下而上，無上道戒独居顶
  8: { lines: [[4, 4, 4, 1]], ly: [[-24, -8, 8, 24]], cats: [{ a: 0, b: 12, t: '' }], num: '十三' }, // 王三昧独居顶
  9: { lines: [[4, 4]], ly: [[-9, 9]], cats: [{ a: 0, b: 7, t: '' }], num: '八' },
};
let discDoor = 1; // 谱页当前所建之门（星盘＝门1）
// v318 谱页式短行阵（用户定案）：四类分块短行每行≤4珠正对镜头，签一律珠下；零线条只留珠与签
const DISC_ORDER = ['那那', '那謨', '謨謨', '那阿', '謨阿', '阿阿', '那彌', '謨彌', '阿彌', '彌彌', '那陀', '謨陀', '阿陀', '彌陀', '陀陀', '那佛', '謨佛', '阿佛', '彌佛', '陀佛', '佛佛'];
const discBeads                                                                                                                      = [];
const discPick                   = [];
const discLabelEls                = [];
const discCatEls                = [];
let discCenterEl                     = null;
let discCurRing                    = null;
let discLandSp                      = null; // 落珠金光（行棋落门1时一闪润开）
let discLandUntil = 0;
let discAspectCls = '';
function discTeardown() { // 横竖屏切换重建用：拆珠拆签归零
  discRoot.children.slice().forEach((c     ) => {
    discRoot.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose(); // 注：不 dispose 贴图——STAR_TEX 为全局共享
  });
  discBeads.length = 0; discPick.length = 0;
  discLabelEls.forEach(e2 => e2.remove()); discLabelEls.length = 0;
  discCatEls.forEach(e2 => e2.remove()); discCatEls.length = 0;
  if (discCenterEl) { discCenterEl.remove(); discCenterEl = null; }
  discCurRing = null; discLandSp = null;
  discBuilt = false;
}
function buildDisc(dno        ) {
  if (discBuilt && discDoor === dno) return;
  if (discBuilt) discTeardown();
  discBuilt = true; discDoor = dno;
  const pg = DISC_PAGES[dno];
  const d1 = dno === 1
    ? (SFP_POS         ).filter(p => p.door === 1).sort((x, y) => DISC_ORDER.indexOf(x.start) - DISC_ORDER.indexOf(y.start))
    : (SFP_POS         ).filter(p => p.door === dno);
  const N = d1.length;
  // v318 谱页式平面阵（极简直观）：分块自下而上，块内短行每行≤4珠——签一律珠下、永不互匟；正对镜头零遮挡
  const LINES                       = dno === 1 ? [[3], [4, 3], [3, 2], [3, 3]] : pg.lines;
  const LY                       = dno === 1 ? [[-35], [-19, -7], [8, 20], [35, 47]] : pg.ly;
  const CATS                                                        = dno === 1 ? DISC_CATS
    : pg.cats.map(cg => ({ a: cg.a, b: cg.b, t: cg.t, c: SFP_DOOR_COLOR[dno] ?? 0xd7aa45 })); // 行门页：同门同色总纲
  const DX = app.clientWidth > app.clientHeight ? 39 : 13.5; // v328 珠距按签宽反推：横屏单行签约 88px、竖屏双行签约 66px，珠距映屏後须≥签宽，同排中珠签才不被避让表杀
  discVTop = Math.max(...LY.flat()) + 10; discVBot = Math.min(...LY.flat()) - 13; // v328 本页竖向占位（顶行珠上缘/底行签下缘），供带宽取景
  discAspectCls = app.clientWidth > app.clientHeight ? 'l' : 'p';
  d1.forEach((p     , i        ) => {
    const t = i / (N - 1);
    const ci = CATS.findIndex(cg => i >= cg.a && i <= cg.b);
    const cg = CATS[ci];
    const j = i - cg.a;
    let li = 0, k = j;
    while (k >= LINES[ci][li]) { k -= LINES[ci][li]; li++; } // 多行通式（门7/8 四行）
    const m = LINES[ci][li];
    const wp = new THREE.Vector3(DISC_C.x + (k - (m - 1) / 2) * DX, DISC_C.y + LY[ci][li], DISC_C.z);
    let m2            ;
    if (dno === 1) {
      // 模型质感对齐全局行星制（v251/v213）：四段灰度纹理按段调染 + 光感阶梯；出世正因＝颇梨水晶制
      const texKey = (['woe', 'cloud', 'jade', 'liuli']         )[ci];
      const tex = (STAR_TEX       )[texKey]                 ;
      const texLum = [0.42, 0.52, 0.52, 0.62][ci] * (STAR_TEX_K       )[texKey];
      const mat = ci === 3
        ? new THREE.MeshPhysicalMaterial({ color: 0xcfe6ea, emissive: 0x9fc0c8, emissiveIntensity: 0.62, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.5 })
        : new THREE.MeshPhysicalMaterial({ color: cg.c, map: tex, emissive: cg.c, emissiveMap: tex, emissiveIntensity: texLum, bumpMap: tex, bumpScale: 0.07, roughness: 0.6, metalness: 0.05, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.35 });
      m2 = new THREE.Mesh(new THREE.SphereGeometry(1.7 + 0.9 * t, 24, 18), mat);
    } else {
      // 谱页珠一律球形（v326 用户定案「还是用球型」：v147 莲台阶片退役）：素身清漆制同主图位珠配方；
      // 尺度随谱序渐大 2.0→2.5，唯门2逆梯 2.5→2.0（流弊沉降・渐堕渐削）
      const mat = new THREE.MeshPhysicalMaterial({ color: cg.c, emissive: cg.c, emissiveIntensity: 0.36, roughness: 0.24, metalness: 0.12, clearcoat: 0.75, clearcoatRoughness: 0.28, envMapIntensity: 0.65 });
      m2 = new THREE.Mesh(new THREE.SphereGeometry(dno === 2 ? 2.5 - 0.5 * t : 2.0 + 0.5 * t, 24, 18), mat);
    }
    m2.position.copy(wp);
    m2.userData.pid = p.id;
    discRoot.add(m2); discPick.push(m2);
    discBeads.push({ pid: p.id, name: p.name, combo: p.start || '', cat: ci, wp, mesh: m2, ldy: 23 });
    const lb = document.createElement('div');
    lb.className = 'nlabel dlab' + (discAspectCls === 'l' ? ' dl1' : ''); // v328 横屏单行式：带宽取景后行距变密，双行签纵向互压致避让表滥杀
    lb.innerHTML = dno === 1
      ? `<span class="dcm">${p.start.split('').map((ch        ) => '那謨'.includes(ch) ? `<i class="ne">${esc(ch)}</i>` : esc(ch)).join('')}</span>${zh(esc(p.name))}`
      : zh(esc(p.name)); // 门1组合字＝刻面原字不随简繁；v328 恶面字（那/謨）赭红微染，与判词卡善↑恶↓语义同带
    lb.style.borderColor = '#' + cg.c.toString(16).padStart(6, '0') + '55';
    lb.style.display = 'none';
    lb.addEventListener('click', () => { playSfx('sfx-tap', 0.2); openSfpNote(p.id); });
    labelLayer.appendChild(lb); discLabelEls.push(lb);
    if (i === cg.a && cg.t) { // 类名小签：附于本层左端外侧，无线只字（无科名之页不设）
      const ce = document.createElement('div');
      ce.className = 'nlabel aux dcat';
      ce.textContent = zh(cg.t);
      ce.style.color = '#' + cg.c.toString(16).padStart(6, '0');
      ce.style.pointerEvents = 'none';
      ce.style.display = 'none';
      (ce       )._wp = new THREE.Vector3(DISC_C.x - ((LINES[ci][0] - 1) / 2) * DX - 9.5, DISC_C.y + LY[ci][0], DISC_C.z);
      labelLayer.appendChild(ce); discCatEls.push(ce);
    }
  });
  discCurRing = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.22, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xf0dfa8, emissive: 0xf0dfa8, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.2 }));
  discCurRing.visible = false; // 平面阵正对镜头：指环不再放平，直面玩家
  discRoot.add(discCurRing);
  discLandSp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlow('240,220,150', 256), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  discLandSp.scale.set(9, 9, 1); discLandSp.visible = false;
  discRoot.add(discLandSp);
  discCenterEl = document.createElement('div');
  discCenterEl.className = 'nlabel t1 dlabC';
  discCenterEl.innerHTML = dno === 1
    ? `${zh('發始因地')}<span class="dcm">${zh('首掷安位 · 廿一因')}</span>`
    : `${zh(SFP_DOOR_BY[dno].title)}<span class="dcm">${zh('譜頁 · ' + pg.num + '位')}</span>`; // 非处所之门：题签直拥门名（v324 门2入集，「行門」二字收声保中性）
  discCenterEl.style.display = 'none';
  discCenterEl.addEventListener('click', () => { if (inDisc) showDoorIntro(discDoor); });
  labelLayer.appendChild(discCenterEl);
}
function discLabelsHide() {
  discLabelEls.forEach(e2 => { if (e2.style.display !== 'none') e2.style.display = 'none'; });
  discCatEls.forEach(e2 => { if (e2.style.display !== 'none') e2.style.display = 'none'; });
  if (discCenterEl && discCenterEl.style.display !== 'none') discCenterEl.style.display = 'none';
}
const discV = new THREE.Vector3();
let discShown = false; // 隐时免逐帧扫标签（功耗制度）
function discProject(wp               )                                  {
  tmpCam.copy(wp).applyMatrix4(camera.matrixWorldInverse);
  if (tmpCam.z > -2 || tmpCam.z < -400) return null;
  discV.copy(wp).project(camera);
  const x = (discV.x * 0.5 + 0.5) * app.clientWidth, y = (-discV.y * 0.5 + 0.5) * app.clientHeight;
  if (x < -60 || x > app.clientWidth + 60 || y < -30 || y > app.clientHeight + 30) return null;
  return { x, y };
}
function updateDiscLabels() {
  if (!inDisc) { if (discShown) { discLabelsHide(); discShown = false; } return; }
  discShown = true;
  // 现居指环帖珠（局中且现居门1位才亮）
  const curPid = sfpS.active && sfpS.pos && SFP_BY[sfpS.pos] && SFP_BY[sfpS.pos].door === discDoor ? sfpS.pos : '';
  if (discCurRing) {
    const cb = curPid ? discBeads.find(b2 => b2.pid === curPid) : null;
    discCurRing.visible = !!cb;
    if (cb) discCurRing.position.copy(cb.wp);
  }
  const taken                                                        = [];
  const fit = (x        , y        , w        , h        ) => {
    for (const r of taken) { if (Math.abs(x - r.x) < (w + r.w) / 2 && Math.abs(y - r.y) < (h + r.h) / 2) return false; }
    taken.push({ x, y, w, h }); return true;
  };
  // 现居优先、近珠次之；标签锚点往环外推，钟面式散开减碰撞
  const order = discBeads.map((b2, i) => {
    tmpCam.copy(b2.wp).applyMatrix4(camera.matrixWorldInverse);
    return { i, z: tmpCam.z, cur: b2.pid === curPid };
  }).sort((p2, q2) => (q2.cur ? 1 : 0) - (p2.cur ? 1 : 0) || q2.z - p2.z);
  // 签距随镜距自适应：量 1 世界单位的屏上像素，签下沉量＝行距之半
  const p0 = discProject(DISC_C), p1 = discProject(_discApex.copy(DISC_C).setY(DISC_C.y + 1));
  const scl = p0 && p1 ? Math.max(2, p0.y - p1.y) : 5;
  const dyPx = Math.max(9, scl * 3.4); // 珠缘下的留白（dlab 顶边锚）
  for (const o of order) {
    const b2 = discBeads[o.i], e2 = discLabelEls[o.i];
    const pr = discProject(b2.wp);
    const oneLn = discAspectCls === 'l';
    const w = 20 + (Math.max(b2.name.length, 2) + (oneLn && b2.combo ? 2.2 : 0)) * 11; // v328 随签字号 11px 同步估宽；单行式计入组合字
    const bh = oneLn ? 22 : 36;
    const ly = pr ? pr.y + dyPx : 0; // 签一律珠下
    if (!pr || !fit(pr.x, ly + bh / 2, w, bh)) { if (e2.style.display !== 'none') e2.style.display = 'none'; continue; }
    e2.style.display = '';
    e2.style.left = pr.x + 'px'; e2.style.top = ly + 'px';
    e2.classList.toggle('cur', b2.pid === curPid);
  }
  discCatEls.forEach(e2 => {
    const pr = discProject((e2       )._wp);
    if (!pr) { if (e2.style.display !== 'none') e2.style.display = 'none'; return; }
    e2.style.display = '';
    e2.style.left = pr.x + 'px'; e2.style.top = pr.y + 'px';
  });
  if (discCenterEl) { // 题签悬于阵顶上方（v328 随每页实际顶行，短页不再飘远）
    const pr = discProject(_discApex.copy(DISC_C).setY(DISC_C.y + discVTop + 6));
    if (!pr) { if (discCenterEl.style.display !== 'none') discCenterEl.style.display = 'none'; }
    else { discCenterEl.style.display = ''; discCenterEl.style.left = pr.x + 'px'; discCenterEl.style.top = (pr.y - 30) + 'px'; }
  }
  if (discLandSp) { // 落珠金光：一闪润开即逸
    const lt = discLandUntil - performance.now();
    const lm = discLandSp.material                        ;
    if (lt > 0) {
      const k2 = lt / 1500;
      lm.opacity = Math.min(0.5, k2 * 0.75);
      const s2 = 8 + (1 - k2) * 8;
      discLandSp.scale.set(s2, s2, 1);
      discLandSp.visible = true;
    } else if (discLandSp.visible) { discLandSp.visible = false; lm.opacity = 0; }
  }
}
const _discApex = new THREE.Vector3();
function discLand(pid        ) { // 行棋落谱页门／定位某位：珠上金光一闪（现居指环由逐帧同步自亮）
  buildDisc(SFP_BY[pid] ? SFP_BY[pid].door : 1);
  const b2 = discBeads.find(x => x.pid === pid); if (!b2) return;
  if (discLandSp) { discLandSp.position.copy(b2.wp); discLandUntil = performance.now() + 1500; }
  playBell(392, 0.05);
}
function enterDiscCore(dno        ) {
  inDisc = true; discEnterT = performance.now();
  cancelFly();
  doorDiveSeq++; // 作废在途的俯冲/迫降定时（色界落位等延时镜头不得追进星盘抢镜）
  skyNav.classList.remove('show'); bodhiNav.classList.remove('show'); // 跨场残留签条收场
  if (inNether) netherRestore();
  if (inDoor) { inDoor = 0; clearDoorFocus(); backBtn.dataset.t = ''; }
  if (browseDoor) setBrowseDoor(0);
  savedCam = { pos: camera.position.clone(), target: controls.target.clone() };
  closeCard(); softCloseOverlay();
  setModeInstant(0);
  saha.visible = false; mandala.visible = false; nodesRoot.visible = false;
  scene.fog = new THREE.FogExp2(C.bg, 0.0005);
  fogBase = 0.0005; // ＝LIGHT_SCENES.disc（同上：只换雾，出场归表）
  buildDisc(dno);
  discRoot.visible = true;
  controls.maxDistance = 300;
  secWrap.style.display = 'none';
  backBtn.classList.add('show');
}
let discVTop = 57, discVBot = -49; // 本页竖向占位（buildDisc 刷新；默认门1）
function discFrame() { // v328 带宽取景：行阵整体映入「顶栏下沿—掷轮栏上沿」自由带，顶底行不再被吃；镜距按每页实际高度自适应
  const tf = Math.tan(camera.fov * Math.PI / 360);
  const vw = Math.max(1, app.clientWidth), vh = Math.max(1, app.clientHeight);
  const bb = sfpBar.getBoundingClientRect();
  const botPx = bb.height > 0 ? Math.max(26, vh - bb.top + 8) : (sfpS.active ? 104 : 26); // v328 转场中栏暂隐量不到高——局中恒预留栏带，免底行被掷轮栏回来后吃掉
  const topPx = 50;
  const bandH = Math.max(140, vh - topPx - botPx);
  const dV = (discVTop - discVBot) * vh / (bandH * 2 * tf); // 竖向：阵高映入带高
  const DXn = vw > vh ? 39 : 13.5, hHalf = 1.5 * DXn + 7; // 横向：最宽四珠行半宽（与 buildDisc 同源）
  const dist = Math.max(dV, hHalf / (tf * (vw / vh)), 96) * 1.04; // 96 下限：短页（门2/6）不至于贴脸
  const gC = DISC_C.y + (discVTop + discVBot) / 2;
  const ty = gC + ((topPx + (vh - botPx)) / 2 - vh / 2) * (2 * dist * tf) / vh; // 阵心投到带心
  return { pos: new THREE.Vector3(0, ty + 2, dist), target: new THREE.Vector3(DISC_C.x, ty, DISC_C.z) };
}
function discTarget() { return discFrame().target; }
function discView() { return discFrame().pos; }
function enterDisc(dno        , focus         ) {
  if (inDisc) return;
  if (inPure || inSky || inBodhi) returnSaha(); // 他专场内点谱页门：先复原娑婆坐标语境再入（同幽冥成例）
  enterDiscCore(dno);
  const v = discView();
  camera.position.set(0, v.y + 30, v.z + 48); controls.target.copy(discTarget());
  flyTo(v, discTarget(), 1.6);
  playBell(294, 0.06);
  if (focus) window.setTimeout(() => { if (inDisc) discLand(focus); }, 700); // 定位入场：镜头将定时亮珠，不另弹总说
  else window.setTimeout(() => { if (inDisc) showDoorIntro(dno); }, 1000); // v169 手动直入必呈总说（逐位读入口在其中）
}
function enterDiscTransit(dno        , focus         ) {
  if (inDisc || fadeEl.style.opacity === '1') return;
  fadeTransit(() => { enterDisc(dno, focus); setTransit(false); }, true, 900);
}
(window       ).__discGo = (on         , dno         ) => on ? enterDiscTransit(dno || 1) : returnSaha(); // 自测钩子
(window       ).__discInfo = () => ({ on: inDisc, door: discDoor, beads: discBeads.length, labelsOn: discLabelEls.filter(e2 => e2.style.display !== 'none').length, ringOn: !!(discCurRing && discCurRing.visible) });
// ===== 幽冥剖块专场（v171 用户定案：四种恶趣门不用全局剖视，改基于模型的掠角地层剖块） =====
// 大地建成一整块圆形地体模型：朝三涂方向掠开 120° 扇形切口，两面切壁真实建模地层色带，
// 八热八寒诸狱/饿鬼薜荔多按真实坐标嵌于切口内；修罗宫别居对侧海沿下小剖龛。
// 与三专场同语法：单击直入、Esc/「全图」返回、行棋落位自动入场；行棋数据不动（门3即门观，位珠/光带/足迹同坐标系）
const NETHER_IDS = new Set(['hell', 'preta', 'animal', 'asura']);
const netherBlock = new THREE.Group();
netherScene.add(netherBlock);
netherBlock.visible = false;
let inNether = false;
let netherBuilt = false;
const NETHER_R = 105, NETHER_D = 52;
const NETHER_AZ0 = 25, NETHER_AZ1 = 145; // 剖口方位角（度，atan2(z,x) 计）：含地狱73°/畜生45°/饿鬼127°/八寒139°
function netherStrataTex(flip         )                      {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const cx = cv.getContext('2d') ;
  const yOf = (d        ) => d / NETHER_D * 512;
  if (flip) { cx.translate(1024, 0); cx.scale(-1, 1); } // 对侧切壁镜像，地层/刻线对称；文字另行正向重画
  const bands                                  = [
    [0, 5, '#1e3b33'], [5, 18, '#2a2438'], [18, 36, '#382a31'], [36, NETHER_D, '#4a2c28'],
  ];
  bands.forEach(([a, b, c]) => { cx.fillStyle = c; cx.fillRect(0, yOf(a), 1024, yOf(b) - yOf(a) + 1); });
  const grd = cx.createLinearGradient(0, yOf(34), 0, 512);
  grd.addColorStop(0, 'rgba(139,63,50,0)'); grd.addColorStop(1, 'rgba(168,76,52,0.55)');
  cx.fillStyle = grd; cx.fillRect(0, yOf(34), 1024, 512 - yOf(34));
  cx.strokeStyle = 'rgba(0,0,0,0.28)'; cx.lineWidth = 2; // 岩理短划
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 1024, y = yOf(4) + Math.random() * (512 - yOf(4));
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 14 + Math.random() * 26, y + (Math.random() - 0.5) * 6); cx.stroke();
  }
  const mark = (d        , t        ) => {
    const y = yOf(d);
    cx.strokeStyle = 'rgba(216,197,139,0.5)'; cx.lineWidth = 2;
    cx.setLineDash([10, 12]); cx.beginPath(); cx.moveTo(0, y); cx.lineTo(1024, y); cx.stroke(); cx.setLineDash([]);
    cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); // 文字不随镜像
    cx.font = '600 27px "PingFang SC","Microsoft YaHei",sans-serif';
    cx.fillStyle = '#d8c58b'; cx.textBaseline = 'bottom'; cx.textAlign = flip ? 'right' : 'left';
    cx.fillText(zh(t), flip ? 1024 - 18 : 18, y - 6);
    cx.restore();
  };
  mark(1.2, '海平面');
  mark(17, '薌荔多 · 餓鬼所居');
  mark(34, '捺落迦 · 地獄所居');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function buildNetherBlock() {
  const D2R = THREE.MathUtils.degToRad;
  const rock = (c        , opt      = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide, ...opt });
  // 地体弧壁（两段，避开修罗龛口 az 217°..233°）；Cylinder θ = 90° − az
  const wallMat = rock(0x241f30);
  [[145, 217], [233, 385]].forEach(([a0, a1]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(NETHER_R, NETHER_R, NETHER_D, 96, 1, true, D2R(90 - a1), D2R(a1 - a0)), wallMat);
    w.position.y = -NETHER_D / 2; netherBlock.add(w);
  });
  // 顶盖（海底面，只覆地体扇区，剖口上方洞开）：rotation.x=+90° 时 az 即 CircleGeometry 的 θ
  const cap = new THREE.Mesh(new THREE.CircleGeometry(NETHER_R, 96, D2R(NETHER_AZ1), D2R(360 - (NETHER_AZ1 - NETHER_AZ0))),
    rock(0x14303f, { emissive: 0x173d52, emissiveIntensity: 0.3, roughness: 0.85 }));
  cap.rotation.x = Math.PI / 2; netherBlock.add(cap);
  // 底盘（全圆，兼作剖口地面）
  const base = new THREE.Mesh(new THREE.CircleGeometry(NETHER_R, 96), new THREE.MeshBasicMaterial({ color: 0x120e18, side: THREE.DoubleSide }));
  base.rotation.x = -Math.PI / 2; base.position.y = -NETHER_D; netherBlock.add(base);
  // 两面切壁：地层色带贴图（自发光读图风）；az=25° 面正朝剖口，az=145° 面背朝剖口用镜像图
  [[NETHER_AZ0, false], [NETHER_AZ1, true]].forEach(([azDeg, flip]) => {
    const az = D2R(azDeg          );
    const f = new THREE.Mesh(new THREE.PlaneGeometry(NETHER_R, NETHER_D),
      new THREE.MeshBasicMaterial({ map: netherStrataTex(flip           ), side: THREE.DoubleSide }));
    f.position.set(Math.cos(az) * NETHER_R / 2, -NETHER_D / 2, Math.sin(az) * NETHER_R / 2);
    f.rotation.y = -az;
    netherBlock.add(f);
  });
  // 须弥山根：细石柱贯地体中轴（山王入水之根），盖上留一截矮墓示意山身
  const axisM = rock(0x1f2c3e, { emissive: 0x24344a, emissiveIntensity: 0.25 });
  const root = new THREE.Mesh(new THREE.CylinderGeometry(11, 14, NETHER_D, 32), axisM);
  root.position.y = -NETHER_D / 2; netherBlock.add(root);
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(8, 11.5, 14, 32), axisM);
  stub.position.y = 7; netherBlock.add(stub);
  // 南洲虚影环：剖口上空浮一圈淡青虚线，标「隆地之处即南贍部洲」（诸狱在南洲之下，方位即教义）
  const jr = dashedCircle(10, 0, 0x2f7a6e);
  jr.position.set(0, 0.5, 104);
  netherBlock.add(jr);
  // 饿鬼域标记：幽青光晕＋虚环（现有模型只有诸狱/修罗宫，薜荔多补一处弱标）
  {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('150,190,160'), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.scale.setScalar(18); g.position.set(-26, -17, 34); netherBlock.add(g);
    const r = dashedCircle(7, 0, 0x6f8f7c); r.position.set(-26, -17, 34); netherBlock.add(r);
  }
  // 诸狱余烬：一枚暖光晕贴八热顶层（静场，不动态）
  {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('230,130,84'), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.scale.setScalar(24); g.position.set(8, -24, 26); netherBlock.add(g);
  }
  // 阿鼻极核（v200 统一后唯一残留装饰件）：无间之底暗红极盘＋红晕，阿鼻位珠落其上——
  // 文字标识不再另造（v199 三枚静态标已撤）：三狱坐标唯一真源＝谱位珠（SFP_NETHER_LAYOUT），门观自浮位名
  {
    const abi = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6.5, 2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a0f0b, emissive: 0x8b1f12, emissiveIntensity: 0.9, roughness: 0.85 }));
    abi.position.set(8, -47.2, 26); netherBlock.add(abi);
    const ag = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('200,60,36'), transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }));
    ag.scale.setScalar(15); ag.position.set(8, -47.2, 26); netherBlock.add(ag);
    (window       ).__netherMarks = () => netherBlock.children.filter(o => (o       ).isSprite && ((o       ).material       ).sizeAttenuation === false).length;
    (window       ).__hellBeads = () => ['阿鼻地獄', '無間地獄', '有間地獄'].map(id => { const v = sfpBeadLocal[id]; const a2 = byId['hell'].d.pos; return v ? [a2[0] + v.x, a2[1] + v.y, a2[2] + v.z] : null; }); // 自测钩子
  }
  // 修罗剖龛（对侧海沿下 az 225°）：弧壁留口，龛内五面暗壁围成海下宫室，铜光一点
  {
    const grp = new THREE.Group(); grp.rotation.y = -D2R(225); netherBlock.add(grp);
    const wm = rock(0x18131e, { roughness: 1 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), wm);
    back.rotation.y = Math.PI / 2; back.position.set(72, -10, 0); grp.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), wm);
    top.rotation.x = Math.PI / 2; top.position.set(89, -1, 0); grp.add(top);
    const bot = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), wm);
    bot.rotation.x = Math.PI / 2; bot.position.set(89, -19, 0); grp.add(bot);
    [-15, 15].forEach(z => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(34, 18), wm);
      s.position.set(89, -10, z); grp.add(s);
    });
    const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(NETHER_R + 0.4, -1, -15), new THREE.Vector3(NETHER_R + 0.4, -1, 15),
      new THREE.Vector3(NETHER_R + 0.4, -19, 15), new THREE.Vector3(NETHER_R + 0.4, -19, -15),
    ]), new THREE.LineBasicMaterial({ color: 0x8b5140, transparent: true, opacity: 0.7 }));
    grp.add(frame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('190,120,80'), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(16); glow.position.set(-60, -10, -60); netherBlock.add(glow);
  }
}
function netherRestore() { // 场景复原（雾/天色/灯/镜程）；门态退出交给 exitDoor 本体
  if (!inNether) return;
  inNether = false;
  netherBlock.visible = false;
  applyLight('saha');
  controls.maxDistance = 520;
  secWrap.style.display = secOn ? '' : 'none';
  backBtn.classList.remove('show');
}
function enterNether(pid         , nodeId         ) {
  if (inNether) return;
  if (inPure || inSky || inBodhi || inDisc) returnSaha();
  cancelFly();
  if (!netherBuilt) { netherBuilt = true; buildNetherBlock(); }
  inNether = true;
  closeCard(); softCloseOverlay(); // v220 软关：不吞 keepOv 重要面板
  setModeInstant(0);
  netherCancel(); setSection(SECTION_MAX); // 专场内不叠全局剪切
  netherBlock.visible = true;
  applyLight('nether');
  controls.maxDistance = 340;
  secWrap.style.display = 'none';
  backBtn.classList.add('show');
  enterDoor(3, pid, 'none'); // 门观接驳：位珠/位名/门星/光带照常（inNether 已立，不会回转场）
  const az = THREE.MathUtils.degToRad((NETHER_AZ0 + NETHER_AZ1) / 2);
  const dirV = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const tgt = new THREE.Vector3(4, -20, 30); // 三涂重心偏地狱一侧
  camera.position.copy(tgt.clone().addScaledVector(dirV, 178).add(new THREE.Vector3(0, 94, 0)));
  controls.target.copy(tgt);
  if (pid && doorPlanets[pid]) { const v = doorViewFor(pid); flyTo(v.pos, v.target, 2.0); }
  else {
    flyTo(tgt.clone().addScaledVector(dirV, 120).add(new THREE.Vector3(0, 40, 0)), tgt, 1.6);
    if (nodeId && byId[nodeId]) window.setTimeout(() => { if (inNether) selectNode(nodeId, true); }, 80);
  }
  playBell(220, 0.06);
  if (noIntroClash()) showToast('四种恶趣 · 大地掠开一角——三涂依真实深度嵌于地层剖窗，修罗宫别居对侧海下剖龛；点位珠读谱注，「全图」或 Esc 返回', 4200);
}
function enterNetherTransit(pid         , nodeId         ) {
  if (inNether) return;
  if (fadeEl.style.opacity === '1') { enterNether(pid, nodeId); return; } // 白光正盛（乘光链路中途）：直接入场不叠转场
  fadeTransit(() => { enterNether(pid, nodeId); setTransit(false); }, true, 900);
}
(window       ).__nether = () => ({ inNether, built: netherBuilt, block: netherBlock.visible, sahaVis: saha.visible, inDoor });
// ===== 菩萨道场（v152 用户点单）：双击菩萨法界星入专场——四教位次全铺，位塔为主体 =====
// 读法一眼即明：下庭三教入口（慧学/藏教/通教小位庭）、中塔别教五十二阶（六重科环）、顶冠圆教六即
const bodhiScene = new THREE.Group();
bodhiScene.visible = false;
let bodhiSceneBuilt = false;
const bodhiRingLines               = [];
function bodhiRingSync() { bodhiRingLines.forEach(r => { r.visible = r.userData.grp === bodhiGrp; }); }
// 菩萨主星旧「智慧星」金环与心光已退役：银身素净即相，减少全图视觉噪音。
// 场内环列（v154 用户定案：不做塔、主星高度居中、半径加大、位位有名）：
// 入场时按球仪式布局重排——主星居中（y=0），下三环＝慧学/藏教/通教入口，
// 中五环 r=35 ＝别教十信→十地五十位，等觉独悬其上，顶环＝圆教六即；出场复原。
// 直接改 sfpBeadLocal（棋子/光晕/标签/足迹全系统随动），矩阵就地重写
let bodhiSpread = false;
const bodhiOrigLp                                = {};
let bodhiSceneLp                                       = null;
// 科组表（v155 用户定案：默认只见科名，点科名展开该科位名，各科异色相区分）
// v255 菩萨场改用银色阶梯：位阶越高，银色越明。
const BODHI_GRPS                                         = [
  { name: '慧学位', color: 0x8fa2b8 }, { name: '藏教位', color: 0x9db0c2 }, { name: '通教位', color: 0xaebfce },
  { name: '十信', color: 0xbac8d5 }, { name: '十住', color: 0xc0cdda }, { name: '十行', color: 0xc6d3df },
  { name: '十迴向', color: 0xccd8e4 }, { name: '十地', color: 0xd2dee9 }, { name: '等覺', color: 0xe6edf5 },
  { name: '圓教六即', color: 0xf2f6fb }];
// v255 场内珠径阶梯：延续「升即大」，以子星珠基为参照。
const BODHI_BEAD_SC = [1.8, 1.9, 2.0, 2.2, 2.2, 2.2, 2.2, 2.2, 3.0, 2.6];
const bodhiGrpOf                         = {};
let bodhiGrp = -1; // 当前展开的科组（-1＝全收，只见科名）
function setBodhiGrp(g        ) {
  bodhiGrp = (g === bodhiGrp) ? -1 : g;
  bodhiNavSync();
  if (inBodhi) bodhiApplyBeads(); // 星球随科折叠/展开
  if (bodhiGrp < 0 || !inBodhi) return;
  // 展开即俯瞰该科环带：环面摊开、位名互不相压（保持现方位角，只调高度与俯角）
  const B = byId['bodhi'].marker.getWorldPosition(new THREE.Vector3());
  let ry = 0, n = 0;
  for (const pid in bodhiGrpOf) { if (bodhiGrpOf[pid] === bodhiGrp && sfpBeadLocal[pid] && SFP_BY[pid].anchor === 'bodhi') { ry += sfpBeadLocal[pid].y; n++; } }
  if (n) ry /= n;
  const az = camera.position.clone().sub(B); az.y = 0;
  if (az.lengthSq() < 1) az.set(1, 0, 0); az.normalize();
  flyTo(B.clone().addScaledVector(az, 62).add(new THREE.Vector3(0, ry + 48, 0)), B.clone().add(new THREE.Vector3(0, ry, 0)), 1.1);
}
// 环带表（也供饰环/科名取高）：门9/10/11 下庭三环，门12 五科环＋等觉，门13 顶环
const BODHI_RINGS                          = [[-26, 24], [-19, 28], [-12, 31], [-6, 35], [0, 35], [6, 35], [12, 35], [18, 35], [27, 24]];
function bodhiLayoutCompute() {
  if (bodhiSceneLp) return;
  bodhiSceneLp = {};
  const ring = (pids          , y        , r        , a0        ) => {
    const n = Math.max(1, pids.length);
    pids.forEach((pid, i) => { const a = a0 + i / n * Math.PI * 2; bodhiSceneLp [pid] = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
  };
  const of = (d        ) => (SFP_POS         ).filter((p     ) => p.door === d && p.anchor === 'bodhi').map((p     ) => p.id);
  const grp = (pids          , g        ) => pids.forEach(pid => { bodhiGrpOf[pid] = g; });
  const d9 = of(9), d10 = of(10), d11 = of(11), d13 = of(13);
  grp(d9, 0); grp(d10, 1); grp(d11, 2); grp(d13, 9);
  ring(d9, BODHI_RINGS[0][0], BODHI_RINGS[0][1], 0);
  ring(d10, BODHI_RINGS[1][0], BODHI_RINGS[1][1], 0.5);
  ring(d11, BODHI_RINGS[2][0], BODHI_RINGS[2][1], 1.0);
  const d12 = of(12); // 谱序：十信10 十住10 十行10 十回向10 十地10 等觉1
  for (let t = 0; t < 5; t++) { const sl = d12.slice(t * 10, t * 10 + 10); grp(sl, 3 + t); ring(sl, BODHI_RINGS[3 + t][0], BODHI_RINGS[3 + t][1], t * 0.31); }
  if (d12[50]) { bodhiSceneLp[d12[50]] = new THREE.Vector3(Math.cos(0.6) * 13, 22.5, Math.sin(0.6) * 13); bodhiGrpOf[d12[50]] = 8; } // 等觉独悬五环之上
  bodhiGrpOf['別教妙覺佛位'] = 8; // 妙觉伴等觉同组展示
  ring(d13, BODHI_RINGS[8][0], BODHI_RINGS[8][1], 0.15);
}
function bodhiRelayout(on         ) {
  if (on === bodhiSpread) return; bodhiSpread = on;
  bodhiLayoutCompute();
  (SFP_POS         ).forEach((p     ) => {
    if (p.anchor !== 'bodhi') return;
    const v = sfpBeadLocal[p.id]; if (!v) return;
    if (!bodhiOrigLp[p.id]) bodhiOrigLp[p.id] = v.clone();
    const t = on ? bodhiSceneLp [p.id] : bodhiOrigLp[p.id];
    if (t) v.copy(t);
  });
  bodhiApplyBeads();
  rebuildFoot(); // 足迹点随新坐标重画
}
// 星球默认折叠（v156 用户定案）：场内非展开科的位珠缩零（拾取球同缩，免点中隐珠）；现居位恒显；出场全还原
function bodhiApplyBeads() {
  bodhiRingSync();
  const M = new THREE.Matrix4();
  const col = new THREE.Color();
  [sfpBeadMeshes, sfpBeadPick].forEach((arr, ai) => arr.forEach(im => {
    const pids = im.userData.pids            ;
    if (!pids || !pids.length || SFP_BY[pids[0]].anchor !== 'bodhi') return;
    let dirty = false;
    pids.forEach((pid, k) => {
      const g = bodhiGrpOf[pid];
      if (ai === 0) { // 视觉珠随科着色（出场还门色）
        im.setColorAt(k, col.setHex(bodhiSpread && g !== undefined ? BODHI_GRPS[g].color : (SFP_DOOR_COLOR[SFP_BY[pid].door] ?? 0xd7aa45)));
      }
      const v = sfpBeadLocal[pid];
      const folded = bodhiSpread && g !== undefined && g !== bodhiGrp && pid !== sfpS.pos;
      if (folded || (ai === 0 && NODE_POS.has(pid))) { M.makeScale(0, 0, 0); M.setPosition(v.x, v.y, v.z); }
      else if (bodhiSpread && g !== undefined) {
        const sc = BODHI_BEAD_SC[g]; M.makeScale(sc, sc, sc); M.setPosition(v.x, v.y, v.z);
      }
      else M.makeTranslation(v.x, v.y, v.z);
      im.setMatrixAt(k, M); dirty = true;
    });
    if (dirty) { im.instanceMatrix.needsUpdate = true; if (ai === 0 && im.instanceColor) im.instanceColor.needsUpdate = true; }
  }));
}
function buildBodhiScene() {
  if (bodhiSceneBuilt) return; bodhiSceneBuilt = true;
  byId['bodhi'].marker.add(bodhiScene);
  // 虚环退噪（v162 用户反馈）：只有展开中的科亮出自己那圈引导环，余环全隐
  const ringGrp = [0, 1, 2, 3, 4, 5, 6, 7, 9];
  BODHI_RINGS.forEach(([y, r], i) => {
    const ring = dashedCircle(r, y, 0x9cb0c4);
    (ring.material                            ).opacity = 0.16;
    ring.visible = false;
    ring.userData.grp = ringGrp[i];
    bodhiRingLines.push(ring);
    bodhiScene.add(ring);
  });
  // 主星莲晕与顶环微晕已退役：场内只保留银珠与当前科引导环。
}
// 教名题字（同科名浮标制式）：慧学/藏教/通教三庭＋圆教顶冠，位置取各簇珠位均心
const BODHI_CAPS                                        = [
  { door: 9, name: '慧学位' }, { door: 10, name: '藏教位' }, { door: 11, name: '通教位' }, { door: 13, name: '圓教六即' }];
const BODHI_CAP_GRP = [0, 1, 2, 9]; // 教名各对应科组号
const bodhiCapEls = BODHI_CAPS.map((c, i) => {
  const e2 = document.createElement('div');
  e2.className = 'nlabel tier12 cap4'; e2.textContent = zh(c.name); e2.style.display = 'none';
  e2.addEventListener('click', () => { if (inBodhi) setBodhiGrp(BODHI_CAP_GRP[i]); });
  labelLayer.appendChild(e2); return e2;
});
const bodhiCapPos                  = [];
function bodhiCapCompute() { // 惰性：均心一次算定（bodhi 局部系）
  if (bodhiCapPos.length) return;
  BODHI_CAPS.forEach(c => {
    const g = (SFP_POS         ).filter(p => p.door === c.door && p.anchor === 'bodhi');
    const v = new THREE.Vector3();
    g.forEach(p => v.add(sfpBeadLocal[p.id]));
    v.divideScalar(Math.max(1, g.length)).y += c.door === 13 ? 3.4 : 1.9;
    bodhiCapPos.push(v);
  });
}
const _bcV = new THREE.Vector3();
function updateBodhiCaps() { // v159：教名并入右栏导航，场内轴心教名恒隐
  bodhiCapEls.forEach((e2, i) => {
    if (true || !inBodhi || modeT > 0.5) { if (e2.style.display !== 'none') e2.style.display = 'none'; return; }
    bodhiCapCompute();
    byId['bodhi'].marker.localToWorld(_bcV.copy(bodhiCapPos[i]));
    tmpCam.copy(_bcV).applyMatrix4(camera.matrixWorldInverse);
    if (tmpCam.z > -2 || tmpCam.z < -260) { e2.style.display = 'none'; return; }
    _bcV.project(camera);
    const x = (_bcV.x * 0.5 + 0.5) * app.clientWidth, y = (-_bcV.y * 0.5 + 0.5) * app.clientHeight;
    if (x < -40 || x > app.clientWidth + 40 || y < -20 || y > app.clientHeight + 20) { e2.style.display = 'none'; return; }
    e2.style.display = '';
    e2.style.left = x + 'px'; e2.style.top = y + 'px';
    e2.classList.add('bcap');
    e2.classList.toggle('on', bodhiGrp === BODHI_CAP_GRP[i]);
    e2.style.color = '#' + BODHI_GRPS[BODHI_CAP_GRP[i]].color.toString(16).padStart(6, '0');
  });
}
function buildBodhiFocus() { // 专场位名浮标（v154 用户定案：位位有名）：66 位全挂，屏幕避让近观逐一浮现
  clearDoorFocus();
  const pids = (SFP_POS         ).filter(p =>
    (p.anchor === 'bodhi' && p.door >= 9 && p.door <= 13 && !NODE_POS.has(p.id)) ||
    p.id === '別教妙覺佛位');
  pids.forEach((p     ) => {
    const wp = sfpWorldOf(p.id);
    doorPlanets[p.id] = wp;
    doorLabelPts.push({ pid: p.id, wp });
    const le = document.createElement('div');
    le.className = 'nlabel drl'; le.textContent = zh(p.name);
    le.style.display = 'none';
    const g = bodhiGrpOf[p.id];
    if (g !== undefined) le.style.color = '#' + BODHI_GRPS[g].color.toString(16).padStart(6, '0');
    le.addEventListener('click', () => openSfpNote(p.id));
    labelLayer.appendChild(le); doorLabelEls.push(le);
  });
}
let bodhiHid                   = [];
function setBodhiBackdrop(on         ) { // 专场幕布（v162 用户反馈背景噪音）：沙盘、曼荼罗、他界星一并退隐，只留星空
  if (on) {
    const keep = byId['bodhi'].marker;
    bodhiHid = nodesRoot.children.filter(m => m !== keep && m.visible); // 沙盘/曼荼罗由每帧显隐公式接管（含 !inBodhi）
    bodhiHid.forEach(m => { m.visible = false; });
  } else { bodhiHid.forEach(m => { m.visible = true; }); bodhiHid = []; }
}
function enterBodhiQuiet() { // 坐标语境切入（行棋接驳 v157）：只换布局与聚焦，镜头/转场交给调用方
  if (inBodhi || inPure || inSky) return;
  inBodhi = true;
  bodhiGrp = -1; // 默认全收：只见科名，点科名再展开
  if (inDoor) { inDoor = 0; clearDoorFocus(); backBtn.dataset.t = ''; }
  if (browseDoor) setBrowseDoor(0);
  applySfpFocus(); // 四教位次全亮
  bodhiRelayout(true); // 场内展开：主星居中、位次围绕铺开
  buildBodhiScene(); bodhiScene.visible = true;
  buildBodhiFocus();
  bodhiNav.classList.add('show'); bodhiNavSync(); // 顶部科名签条滑入（v161：签栏留在右侧，不再换班）
  setBodhiBackdrop(true);
  secApplyVis(); // 场内藏剖面滑杆（无地形可剖）
}
function bodhiGrpOpen(g        ) { // 定开（非切换、不动镜头）：落位科组自动展开
  if (g === undefined || bodhiGrp === g) return;
  bodhiGrp = g;
  bodhiNavSync();
  if (inBodhi) bodhiApplyBeads();
}
function enterBodhi() {
  if (inBodhi || inPure || inSky) return;
  bodhiEnterAt = performance.now();
  cancelFly();
  enterBodhiQuiet();
  savedCam = { pos: camera.position.clone(), target: controls.target.clone() };
  closeCard(); softCloseOverlay(); // v220 软关：不吞 keepOv 重要面板
  setModeInstant(0);
  const B = new THREE.Vector3(-120, 130, -60); // bodhi 节点坐标
  const out = B.clone().setY(0).normalize();
  const tan = new THREE.Vector3(-out.z, 0, out.x); // 切向取景（v152 修）：径向背山会令塔与须弥重影，切向让位塔衬星空
  const dir = out.clone().multiplyScalar(0.58).addScaledVector(tan, 0.81).normalize(); // 外向分量加大：须弥山退居画缘
  camera.position.copy(B.clone().addScaledVector(dir, 142).add(new THREE.Vector3(0, 30, 0))); // 自远位缓推入座（同色界成例）
  controls.target.copy(B.clone().add(new THREE.Vector3(0, 2, 0)));
  flyTo(B.clone().addScaledVector(dir, 102).add(new THREE.Vector3(0, 18, 0)), B.clone(), 1.6);
  playBell(294, 0.06);
  if (noIntroClash()) showToast('菩萨道场 · 诸位收于科下：点上方科名彩签（慧学…十信…等觉…圆教六即）展开该科星珠与位名，点珠读谱注——「全图」钮或 Esc 返回', 4800);
}
function enterBodhiTransit() {
  if (inBodhi || fadeEl.style.opacity === '1') return;
  fadeTransit(() => { enterBodhi(); setTransit(false); }, true, 900);
}
// 菩萨星专拍（同极乐/色界成例）：单击缓 340ms 开卡留双击窗口，双击转场入道场
let bodhiCardT = 0;
function bodhiTap(_dbl         ) { // v162 用户定案：单击即入道场（双击难发现）；谱卡入场后点主星可读
  if (inBodhi) return;
  if (bodhiCardT) { clearTimeout(bodhiCardT); bodhiCardT = 0; }
  enterBodhiTransit(); playSfx('sfx-tap', 0.25);
}
// 一层一坛城（v135，用户点单）：色界四禅逐层收拢——默认只见四禅天主星（坛心），
// 单击主星＝绽开该层星环（互斥单展，再点收拢），双击＝凑近并开层卡；
// 行棋涉色无色天门（现居/展开/聚焦）时四层自动全现，位珠有地可依
const CHAN_LAYER                         = { chan1: 1, chan2: 2, chan3: 3, chan4: 4 };
const CHAN_OF                         = {};
[['brahmakayika', 'brahmapurohita', 'mahabrahma'], ['parittabha', 'apramanabha', 'abhasvara'],
 ['parittasubha', 'apramanasubha', 'subhakrtsna'],
 ['punyaprasava', 'anabhraka', 'brhatphala', 'asamjnika', 'avrha', 'atapa', 'sudarsana', 'sudrsa', 'akanistha']]
  .forEach((g, i) => g.forEach(id => { CHAN_OF[id] = i + 1; }));
// 色界子树改挂观照场组（世界坐标不变，珠/光带/棋子数据照旧）
SKY_IDS.forEach(id => { if (byId[id]) skyRealm.add(byId[id].marker); });
let chanOpen = 0;
let chanRevealT = 0; // 绽放动画起拍：成员星自坛心尺度涨开
// 哪些门的位珠挂在禅天成员星上（v139：门5全层、门10三果挂无烦天）——行棋/浏览涉该门时自动强展对应层，免珠无依托
const CHAN_NEED                           = {};
(SFP_POS         ).forEach((p     ) => { const L = CHAN_OF[p.anchor]; if (L) { const a = CHAN_NEED[p.door] = CHAN_NEED[p.door] || []; if (!a.includes(L)) a.push(L); } });
CHAN_NEED[8] = [1, 2, 3, 4]; // 定学与四禅相应（v147）：定梯亮时坛城光盘全现，级高有所对
let chanHotCache           = []; // 每帧由 updateChanMandala 刷新，chanShow 高频调用只读缓存
const chanHotLayers = ()           => { const out           = []; [focusDoorA, focusDoorB, browseDoor].forEach(d => (CHAN_NEED[d] || []).forEach(L => { if (!out.includes(L)) out.push(L); })); return out; };
const CHAN_TOAST = ['', '初禅三天绽开：梵众·梵辅·大梵环拱坛心', '二禅三天绽开：少光·无量光·光音', '三禅三天绽开：少净·无量净·遍净', '四禅九天绽开：内环四凡·外环五净居'];
function chanShow(id        )          {
  const L = CHAN_OF[id]; if (!L) return true;
  if (inSky) return skySel <= 0 || L === skySel || L === skyPosLayer() || chanHotCache.includes(L); // v223 该隐去的隐：全览全现；聚显时他层整层隐（现居层/行棋涉门层除外）
  return chanOpen === L || chanHotCache.includes(L);
}
function chanTap(layer        , dbl         ) {
  const mid = 'chan' + layer;
  if (inSky) { selectNode(mid, false); return; } // 场内全展，主星单击即开层卡
  if (dbl) { chanOpen = layer; chanRevealT = performance.now(); const v = viewPosFor(byId[mid]); flyTo(v.pos, v.target, 0.9); selectNode(mid, false); return; }
  if (chanOpen === layer) { chanOpen = 0; playBell(392, 0.03); showToast('星环已收拢', 1600); return; }
  chanOpen = layer; chanRevealT = performance.now();
  playBell(587, 0.04);
  const v = viewPosFor(byId[mid]); flyTo(v.pos, v.target, 0.9);
  showToast(CHAN_TOAST[layer] + '——再点收拢，双击观其详', 3200);
}
(window       ).__chanDbg = () => ({ open: chanOpen, vis: Object.keys(CHAN_OF).filter(id => byId[id].marker.visible).map(id => byId[id].d.name) }); // 自测钩子
// 辐条光丝：主星→成员的层级可见化（坛心-把手-成员），随绽开重建，行棋涉门五时四层全画
// 辐条光丝已拆（v146 用户点名“不要太多连线”）：主星→成员十八根光线退场，层级交给环线与光云盘
function updateChanMandala(dt        ) {
  chanHotCache = chanHotLayers(); // v223：场内也按实际涉门层算（门5/8 就地亮时位珠依托层自现）
  const layers = [...chanHotCache];
  if (!inSky && chanOpen && !layers.includes(chanOpen)) layers.push(chanOpen);
  skyRealm.visible = inSky || layers.length > 0; // 全景默隐、行棋涉禅天自动现、入场独显
  chanRingLines.forEach(rl => {
    rl.line.rotation.y += rl.sp * dt;
    const on = inSky ? (skySel <= 0 || skySel === rl.layer) : layers.includes(rl.layer); // v166 场内选层＝独亮该环线
    rl.mat.opacity += ((on ? 0.5 : 0.16) - rl.mat.opacity) * Math.min(1, dt * 5);
  });
  // v223 光云盘随聚显呼吸：本层提一档、他层退隐、全览平息（我方无拖杆，无预亮项）
  skyDiscMats.forEach(({ m, op, layer }) => {
    const base = inSky ? op * 0.38 : op;
    const k = !inSky || skySel <= 0 ? 1 : (layer === skySel ? 1.7 : 0.22);
    const tgt = base * k;
    (m       ).opacity += (tgt - (m       ).opacity) * Math.min(1, dt * 4);
  });
}
function returnSaha() {
  if (!inPure && !inSky && !inBodhi && !inDisc) return;
  if (inSky) { skyRelayout(false); skySel = -1; skyNav.classList.remove('show'); } // v165 坛城复原；v166 签条收场
  if (inDisc) { inDisc = false; discRoot.visible = false; discLabelsHide(); hideDoorIntro(); } // v314 因地星盘退场
  inPure = false; inSky = false;
  if (inBodhi) { inBodhi = false; bodhiGrp = -1; bodhiScene.visible = false; bodhiRelayout(false); clearDoorFocus(); applySfpFocus(); bodhiNav.classList.remove('show'); secApplyVis(); setBodhiBackdrop(false); }
  cancelFly();
  saha.visible = true; nodesRoot.visible = true;
  pureLand.visible = false;
  applyLight('saha'); // v331 修正：旧版此处手填 0x25354d@0.9 与开机 0x3d5273@0.85 不一致——出过一次专场全图光就变色；今归预设表
  controls.maxDistance = 520;
  if (savedCam) { camera.position.copy(savedCam.pos); controls.target.copy(savedCam.target); }
  secWrap.style.display = secOn ? '' : 'none';
  backBtn.classList.remove('show');
  closeCard();
}
// 归位＝回到现居位的完整就地观照（含位名标签/光带）。
function goHome() {
  if (!sfpS.active || !sfpS.pos) return;
  const p = SFP_BY[sfpS.pos];
  if (p.pure) { sfpLocate(p.id); return; }
  if (inDoor === p.door) { const v = doorViewFor(p.id); if (doorPlanets[p.id]) flyTo(v.pos, v.target, 1.0); setConMin(false); return; }
  if (inDoor) exitDoor(false);
  enterDoor(p.door, p.id, 'fly');
}
backBtn.addEventListener('click', () => {
  if (inDoor) { // 门观「全图」＝存局退出，入自由观照（用户定案）；未在局则照旧出门拉远
    if (sfpS.active) {
      endSfp('行处已存，入自由观照——点「选佛」可续掷');
      flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
    } else exitDoor(true);
  }
  else if (inPure || inSky || inBodhi || inDisc) returnSaha(); // v212 修复：道场内按钮显「全图」却无对应分支——局中误走「归位」需按两次、局外则全无动作
  else if (sfpS.active && sfpS.pos && SFP_BY[sfpS.pos].terminal) { // v212：毕局位无「归位」可言——钮即收局返全图
    endSfp('一局功圓——已入自由观照，点「选佛」可再入选佛场');
    flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
  }
  else if (sfpS.active && sfpS.pos) goHome(); // 顶栏常驻「归位」：漫游远了一键回到现居位
});
// 返回钮按帧同步：极乐「娑婆」＞门观「全图」＞局中「归位」；无事可做则隐
function syncBackBtn() {
  const t = inPure ? '娑婆' : (inSky || inBodhi || inDoor || inDisc) ? '全图' : (sfpS.active && sfpS.pos && !sfpTransit && !starView) ? (SFP_BY[sfpS.pos].terminal ? '全图' : '归位') : ''; // v162 义理勘正：色界/道场本在娑婆（三千大千）之内，唯极乐是十万亿佛土外他方净土；v212 毕局位改显「全图」
  backBtn.classList.toggle('show', !!t); // 每帧对齐：dataset 被外部重置为空串时早退也不留残影
  if ((backBtn.dataset.t || '') === t) return;
  backBtn.dataset.t = t;
  if (t) backBtn.textContent = zh(t);
}
function setModeInstant(v        ) {
  modeTarget = v; modeT = v;
}

// ---------------- 选佛谱（蕅益大师原谱：十五门二百二十位，二轮齐掷） ----------------
const SFP_BY                      = {};
const DOOR_ANCHORS                              = {}; // 门→位珠所踞法界锚点（签栏点开时只显本门相关题字）
const doorFly                                                  = {}; // 门→位珠云重心/半径（签栏点开时镜头框云）
let ladderSync             = () => {}; // 签栏高亮同步（天梯建成后挂实，免 TDZ）
(SFP_POS         ).forEach(p => SFP_BY[p.id] = p);
// 简繁别名表：el() 对模板整体做简繁转换，data-pid 属性也会被转——查表前先归一化
const SFP_ALIAS                         = {};
(SFP_POS         ).forEach(p => {
  SFP_ALIAS[p.id] = p.id;
  SFP_ALIAS[zhWith(p.id, ZH_T2S, ZH_MAXLEN.s)] = p.id;
  SFP_ALIAS[zhWith(p.id, ZH_S2T, ZH_MAXLEN.t)] = p.id;
});
const pidOf = (s         ) => (s && SFP_ALIAS[s]) || s || '';
const SFP_ORDER = SFP_FACE_ORDER;
const SFP_DOOR_BY                      = {};
(SFP_DOORS         ).forEach(d => {
  SFP_DOOR_BY[d.no] = d;
  d.introEvidenceType = d.intro ? SFP_EVIDENCE_TYPE.source : '';
});
// v169/v172 门总说（作者自撰助读，明确标「助讀非原譜原文」不冒充谱文）：原谱门1/2/15 无总说，补此三段
SFP_DOOR_BY[1].intro = '選佛第一擲不論升降，二十一種輪相組合直定二十一種發始因地——此生從何處起步。廿一因分四類：三品十惡為惡因，多感三塗；見取、戒取、慢心行施、世間福并三品十善為世間雜因，隨業升沉人天；邪定、味禪、根本四禪、四無量心、四無色定為禪定因，多生色無色天；出世福戒定慧四學為出世正因，意見參禪與利名習教則慕道而雜染，最易轉入法道流弊。因地一定，此後每擲皆自此起行。';
SFP_DOOR_BY[2].intro = '學道而歧，其弊有五：破尸羅（毀戒行）、破軌則（壞威儀僧制）、毀正見（撥無因果）、棄多聞（恃悟輕教）、增上慢（未得謂得）。多自「意見參禪」「利名習教」兩種因地而來——離教參禪易墮暗證，逐名習教易成狂解。譜設此門，正示法門無咎、咎在用心；一念知非，懺悔還淨，仍可轉入生善滅惡與三學正軌。';
SFP_DOOR_BY[15].intro = '圓極果位，唯一位而已——圓教究竟妙覺。斷盡四十二品無明，究盡諸法實相，三覺圓、萬德備，是為選佛及第、譜之終局。前十四門諸位，或升或沉、或橫超淨土，究竟同歸此極果；藏通別三教佛果，望圓皆屬因位，唯此一位，更無可進。自鄰極諸位擲得「佛」字收尾之輪相（阿佛乃至佛佛）登此者，一局功圓。';
[1, 2, 15].forEach(no => { SFP_DOOR_BY[no].introEvidenceType = SFP_EVIDENCE_TYPE.interpretation; });
// 廿一因逐位一行义读（从各位谱注与行法去向提炼，作者自撰助读，非原谱引文）
const SFP_D1_CAPTION                         = {
  '上品十惡': '惡因熾盛·多墮地獄', '中品十惡': '惡心稍緩·多墮畜生', '下品十惡': '惡業輕微·多墮餓鬼',
  '見取': '姄執己見·鬥諹所依', '慢心行施': '挾慢行施·脩羅之因', '世間福': '施福利世·障三惡道',
  '戒取': '非因計因·無利勤苦', '下品十善': '止惡未湛·僅免三塗', '中品十善': '善念湛熟·人道之因', '上品十善': '湛善猛利·欲天之因',
  '邪定': '邪見習定·外道之類', '味禪': '味著定樂·隨禪受生', '根本四禪': '色界正定·四禪之因',
  '四無量心': '慈悲喜捨·求作梵王', '四無色定': '滅色緣空·四空之因',
  '意見參禪': '參禪雜意見·易入流弊', '利名習教': '習教牽利名·易入流弊',
  '出世福業': '施福求出離·階戒學', '出世戒學': '七眾律儀·戒為道基',
  '出世定學': '諸禪三昧·因定發慧', '出世慧學': '諦緣度觀·般若正因',
};
const SFP_D1_GROUPS                                    = [
  ['惡因', '多感三塗', ['上品十惡', '中品十惡', '下品十惡']],
  ['世間雜因', '隨業升沉人天', ['見取', '慢心行施', '世間福', '戒取', '下品十善', '中品十善', '上品十善']],
  ['禪定因', '多生色無色天', ['邪定', '味禪', '根本四禪', '四無量心', '四無色定']],
  ['出世因', '入聖道之門，雜染則流弊', ['意見參禪', '利名習教', '出世福業', '出世戒學', '出世定學', '出世慧學']],
];
const sfpS = { active: false, pos: null                 , n: 0, rolling: false, finished: false, seenD: []            , trail: []             };
// 受赠之掷余数：联机时一律镜像服务器 me.bonus（施受队列是唯一账本，本地不另记一笔）；
// 单机恒为 0——贈掷须施与同席莲友，一人行谱无人可受即作废。
let sfpBonusLeft = 0;
function netMirrorBonus() {
  const next = Net.active ? Math.max(0, Number(Net.me()?.bonus) || 0) : 0;
  if (next === sfpBonusLeft) return;
  sfpBonusLeft = next;
  syncRollGlow();
}
// 本局此刻有没有可受贈的莲友（判词措辞用；服务器另有权威候选判定）
function sfpGrantHasTaker() {
  return Net.active && Net.isPlaying()
    && Net.players.some(q => q.id !== Net.myId && q.online && !q.done && !q.away && !q.spectator);
}
// 贈掷操作规则一句话——本项目定稿操作规则（grant-ontology v2），非原谱逐字，故走 operational_interpretation
function sfpGrantRule() {
  return sfpGrantHasTaker()
    ? '此贈不归自己：由掷得者择一位同席莲友受之，受赠者在自身所在之位续掷。'
    : '此贈须施与同席莲友；无人可受时依定稿规则作废，不折回自己续掷。';
}

// —— 谱位上图：220 位以念珠环绕各自锚定的法界节点（同门同色） ——
const SFP_AT                        = {};
(SFP_POS         ).forEach(p => { (SFP_AT[p.anchor] = SFP_AT[p.anchor] || []).push(p); });
const SFP_DOOR_COLOR                         = {
  1: 0x9c8a5e, 2: 0x8a5a40, 3: 0x8b3f32, 4: 0x246b66, 5: 0x4a7d8c,
  6: 0x6f9184, 7: 0x6f9184, 8: 0x4a7d8c, 9: 0x6f9184, 10: 0xd7aa45,
  11: 0xd7aa45, 12: 0xd7aa45, 13: 0xe8c766, 14: 0xefe0b4, 15: 0xffffff,
};
const sfpBeadLocal                                = {};
// 一位即一星（v145 用户定案：220位中与法界地图重名者延用地图坐标，不再另造双重坐标与标签）：
// 门4四洲六欲天、门5色无色诸天——位名即锚点节点本身，珠隐（缩0）、拾取留在星位、题字用节点原标签；
// 棋子/现居光/光带仍悬节点上方 2.2（地图即坐标）
const NODE_POS = new Set(['北俱盧洲', '西牛貨洲', '東勝神洲', '南贍部洲', '四王天', '忉利天', '夜摩天', '兜率天', '化樂天', '他化自在天',
  '梵眾天', '梵輔天', '大梵天', '少光天', '無量光天', '光音天', '少淨天', '無量淨天', '徧淨天', '福生天', '福愛天', '廣果天',
  '無想天', '無煩天', '無熱天', '善見天', '善現天', '色究竟天', '空無邊處天', '識無邊處天', '無所有處天', '非想非非想處天']);
const NODE_POS_ANCH                              = {}; // 门→此类位所在节点（开门时节点星代珠呼吸提示）
// 甲案「界域层台」布局（v119，用户定案）：真界域为骨、谱序为脉——
// 每门位珠仍贴其经典锚点（地狱沉山根、欲天沿山腰、色无色山顶列梯、四教悬四圣星域），
// 门内高度随谱序单调上升（升＝向上字面成立）；跨锚之门由谱序光带串成一条修行路（doorThreads）。
// 特则表法：因在21环铺满洲（众生同一起点）、流弊沉洲下递降、戒梯自南洲盘旋拾级而上、定梯贴色界坛城外缘垂升（级高对四禅）、无色正轴一线直上（无色无方所）、
// 定学外螺旋绕色界（因外果内）、别敉52大螺旋渐收向顶、圆教弧朝佛法界扬起、妙觉独星立佛界之上。
const sfpBeadMeshes                        = [];
// v320 门4轮宝阶：四轮王珠径渐大（俊舍：铁铜银金王一二三四洲，转胜故形也渐胜）——唯一的逐珠尺度例外，形色仍守 v194 两形同门同色制
const SFP_BEAD_SCALE                         = { '鐵輪王': 0.82, '銅輪王': 0.95, '銀輪王': 1.08, '金輪王': 1.22 };
// v321 乙·四金属明度四档（用户点单）：铁暗沉→金亮泽，只动明度不动色相（守同门同色总纲）；
// 逐实例粗糙度三大件不支持，金属义由明度阶梯表（instanceColor 乘漫反射，自发光共享不受影响）
const SFP_BEAD_TONE                         = { '鐵輪王': 0.68, '銅輪王': 0.85, '銀輪王': 1.05, '金輪王': 1.32 };
// 拾取用隐形放大球：视觉半径 0.6 不变，命中半径 1.7（手机指尖命中率）
const sfpBeadPick                        = [];
// 源流金线（三流一超）已拆（v142 用户点名去除）：十五门谱序不再画连线，全景更净；谱序交给控制台进度与行棋本身
const doorStarBest                      = {}; // 每门选位珠最多的锚点群安门星
const _faceA = (aid        ) => { const d = byId[aid].d.pos; return Math.atan2(-d[2], -d[0]); }; // 面山方位（锚点→须弥轴）
function sfpLocalOf(aid        , dno        , gi        , G        , n        , k        )                {
  const V = (x        , y        , z        ) => new THREE.Vector3(x, y, z);
  if (aid === 'jambu' && dno === 1) { const a = k * Math.PI * 2 / n - Math.PI / 2; return V(Math.cos(a) * 7.2, 1.0 + 0.15 * k, Math.sin(a) * 7.2); }
  if (aid === 'jambu' && dno === 2) { // 沉沦链（v150 用户报不显）：五位出洲沿朝地狱法界方向逐级沉降，悬于海上而非埋于洲下；方向取 jambu[0,4,104]→hell[8,-34,26] 水平分量
    const h = 7 + 4.5 * k;
    return V(0.102 * h, 2.5 - 1.3 * k, -0.995 * h); // 世界 y 6.5→1.3，尾位贴浪不入水（海面 y=0）
  }
  if (aid === 'jambu' && dno === 7) { const a = -Math.PI / 2 + k * 0.52; return V(Math.cos(a) * 6.8, 4.5 + 1.5 * k, Math.sin(a) * 6.8); } // 戒梯（v147）：在家五戒→无上道戒，自洲面盘旋拾级增上
  if (aid === 'rupa' && dno === 5) { const a = k * Math.PI * 2 / 9 - Math.PI / 2; return V(Math.cos(a) * 5.6, -9.5 + 1.05 * k, Math.sin(a) * 5.6); }
  if (aid === 'arupa' && dno === 5) { return V(0, 3.0 + 2.2 * k, 0); }
  if (aid === 'rupa' && dno === 8) { const a = Math.PI / 2 + k * 0.16; return V(Math.cos(a) * 29, -17 + 3.25 * k, Math.sin(a) * 29); } // 定梯（v147）：六妙门起于初禅下，王三昧超四禅上——级高对齐四禅光盘，r29 让开四禅外环 r26
  if (aid === 'bodhi' && dno === 12) { // 别教位塔（v148 用户报密）：十信/住/行/回向/地各一环十珠，等觉独顶；愈上愈敛（向妙），层间错齿免贴叠
    if (k >= 50) return V(0, 28.5, 0);
    const t = Math.floor(k / 10), j = k % 10;
    const a = j * Math.PI * 2 / 10 - Math.PI / 2 + t * 0.31;
    const r = 12.4 - t * 1.9; // v149 用户点单：塔径加大（12.4→4.8），四圣星距200+无碰撞
    return V(Math.cos(a) * r, 2.5 + t * 5 + j * 0.12, Math.sin(a) * r);
  }
  if (aid === 'bodhi' && dno === 13) { const a = (k - (n - 1) / 2) * 0.5; return V(Math.cos(a) * 7.8, 34 + 1.1 * k, Math.sin(a) * 7.8); } // 圆教八位：位塔之上的顶冠弧（v149 随塔加宽），a0=0 朝佛法界(+x)扬起
  if (aid === 'buddha' && dno === 15) { return V(0, 5.2, 0); } // 妙觉独星，立佛界节点顶
  // v320 门4八附位专属坐标（十有为骨八附为缀，门总说四条安置令字面化）：
  // ①四輪王＝南洲面山「轮宝阶」斜列渐升（王一二三四洲，出俊舍）；②十仙＝外海孤峰顶（楞严「休止深山或大海島絕於人境」，
  // 峰高仅高于金輪王一籌＝「雖離人世不離人類」，谱序高度仍单调）
  if (aid === 'jambu' && dno === 4) {
    if (k === 0) return V(0, 2.2, 0); // k0=南贍部洲（asNode 自归节点，此值不用）
    if (k <= 4) { const a = _faceA(aid) + 0.55, r = 9.5 + (k - 1) * 2.6; return V(Math.cos(a) * r, 1.8 + (k - 1) * 1.15, Math.sin(a) * r); }
    const a2 = _faceA(aid) + 1.05; return V(Math.cos(a2) * 24, 6.8, Math.sin(a2) * 24);
  }
  // ③蒙光天子居兜率殿侧（华严：兜率天中闻天鼓处）、弥勒内院居殿顶正中轴高一层（上生经：内院在兜率中，补处说法处尊）
  if (aid === 'tusita' && dno === 4) { return k === 1 ? V(4.4, 1.0, 1.6) : k === 2 ? V(0, 5.0, 0) : V(0, 2.2, 0); } // k0=兜率天（节点）
  // ④魔罗天＝他化宫上别宫一珠（翻译名义集「第六天上別有魔羅所居天。他化天攝」），欲网光丝另建（见珠建处 guide）
  if (aid === 'paranirmita' && dno === 4) { return V(6.0, 8.0, 0); }
  // 通例：面山扇弧，同锚多门按门序左右错开、半径渐外，弧内依谱序渐升
  const a0 = _faceA(aid) + (gi - (G - 1) / 2) * 1.15;
  const da = Math.min(0.5, 3.4 / Math.max(1, n - 1));
  const a = a0 + (k - (n - 1) / 2) * da;
  const r = 4.4 + gi * 0.9;
  return V(Math.cos(a) * r, 1.6 + gi * 1.6 + k * Math.min(0.7, 8 / n), Math.sin(a) * r);
}
Object.keys(SFP_AT).forEach(aid => {
  const nv = byId[aid]; if (!nv) return;
  const list = SFP_AT[aid];
  const doors = [...new Set(list.map((p     ) => p.door))].sort((a     , b     ) => a - b);
  // 每（锚点×门）一对 InstancedMesh（视觉+拾取），便于按门聚焦显隐
  doors.forEach((dno     , gi        ) => {
    const g = list.filter((p     ) => p.door === dno);
    const n = g.length;
    if (dno === 1) { // v316 因地无地理坐标（用户定案）：门1不在主图铺珠——廿一因安居星盘专场；
      // 行棋接驳（起飞点/足迹/同修）一律取「门户点」＝南贍部洲上空（發心在人道）
      const jd = byId['jambu'].d.pos;
      g.forEach((p     ) => { sfpBeadLocal[p.id] = new THREE.Vector3(jd[0] - nv.d.pos[0], jd[1] + 7.5 - nv.d.pos[1], jd[2] - nv.d.pos[2]); });
      (DOOR_ANCHORS[1] = DOOR_ANCHORS[1] || new Set()).add('jambu');
      return;
    }
    if (DISC_DOORS.has(dno)) { // v322 行门四门＋v324 门2（用户点单）：行门非处所，主图不铺珠——
      // 观照/落位一律转场谱页专场（对齐门1星盘语法）；门户点＝各自锚上空（听法在人间、修禅对色界、发心对四圣），飞行足迹由此起讫
      g.forEach((p     ) => { sfpBeadLocal[p.id] = new THREE.Vector3(0, 7.5, 0); });
      return;
    }
    const isMethod = false; // v326 用户定案「谱页珠还是用球型」：v147 莲台阶片退役（门7/8/9 已入谱页专场早退，本支不再命中；留式以防回流）
    // v194/v326 二百二十位珠制度：处所位与谱页位统一为 PBR 清漆球形，
    // 门色即判词不变、同门同色，自发光压低保读性。
    const doorHex = SFP_DOOR_COLOR[dno] ?? 0xd7aa45;
    const im = new THREE.InstancedMesh(
      isMethod ? new THREE.CylinderGeometry(1.0, 1.3, 0.22, 24) : new THREE.SphereGeometry(0.62, 20, 14),
      new THREE.MeshPhysicalMaterial({
        // 位珠即位次坐标标记，可读性优先：自发光提到俯瞰暗处也看得清（清漆质感保留、门色不洗白）
        transparent: true, opacity: 0.96, roughness: 0.26, metalness: 0.1,
        clearcoat: 0.7, clearcoatRoughness: 0.3, envMapIntensity: 0.55,
        emissive: doorHex, emissiveIntensity: 0.62, // 位次仍清晰可辨，去掉多余辉光
      }), n);
    const pk = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1.7, 6, 4),
      new THREE.MeshBasicMaterial({ visible: false }), n);
    const M = new THREE.Matrix4(); const col = new THREE.Color();
    const pids           = [];
    g.forEach((p     , k        ) => {
      let v = sfpLocalOf(aid, dno, gi, doors.length, n, k);
      const pl_ = SFP_PURE_LAYOUT[p.id]; // 净土十三位用极乐场经义坐标（换算为锚点局部系）
      if (pl_) v = new THREE.Vector3(pl_[0] - nv.d.pos[0], pl_[1] - nv.d.pos[1], pl_[2] - nv.d.pos[2]);
      const sk_ = SFP_SKY_LAYOUT[p.id]; // 色无色 23 位用真实禅天层坐标（v124，同法换算）
      if (sk_) v = new THREE.Vector3(sk_[0] - nv.d.pos[0], sk_[1] - nv.d.pos[1], sk_[2] - nv.d.pos[2]);
      // 一位一地（v132）：位珠与所锨细分天层节点同坐标时，珠悬节点上方 2.2（地图即坐标，珠标位次）
      if (sk_ && v.lengthSq() < 0.04) v.set(0, 2.2, 0);
      const asNode = NODE_POS.has(p.id); // 一位即一星（v145）：坐标归一到节点，珠不再现形
      if (asNode) { v.set(0, 2.2, 0); (NODE_POS_ANCH[dno] = NODE_POS_ANCH[dno] || new Set()).add(nv.d.id); }
      sfpBeadLocal[p.id] = v;
      M.makeTranslation(v.x, v.y, v.z);
      if (asNode) { M.makeScale(0, 0, 0); im.setMatrixAt(k, M); M.makeTranslation(v.x, v.y, v.z); }
      else if (SFP_BEAD_SCALE[p.id]) { M.compose(v, new THREE.Quaternion(), new THREE.Vector3().setScalar(SFP_BEAD_SCALE[p.id])); im.setMatrixAt(k, M); M.makeTranslation(v.x, v.y, v.z); }
      else im.setMatrixAt(k, M);
      pk.setMatrixAt(k, M);
      im.setColorAt(k, col.setHex(SFP_DOOR_COLOR[p.door] ?? 0xd7aa45).multiplyScalar(SFP_BEAD_TONE[p.id] || 1));
      pids[k] = p.id;
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    pk.instanceMatrix.needsUpdate = true;
    im.userData.pids = pids; im.userData.door = dno;
    pk.userData.pids = pids; pk.userData.door = dno;
    (DOOR_ANCHORS[dno] = DOOR_ANCHORS[dno] || new Set()).add(nv.d.id);
    nv.marker.add(im); nv.marker.add(pk);
    if ((dno === 7 && aid === 'jambu') || (dno === 8 && aid === 'rupa')) { // 戒梯/定梯的极淡引导虚线：仅本门亮时随阶现，读出拾级次序
      const pts = pids.map(pid => sfpBeadLocal[pid].clone());
      const gm = clippable(new THREE.LineDashedMaterial({ color: SFP_DOOR_COLOR[dno] ?? 0xd7aa45, dashSize: 0.9, gapSize: 1.5, transparent: true, opacity: 0.22, depthWrite: false }))                            ;
      const gl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gm);
      gl.computeLineDistances(); gl.visible = false;
      nv.marker.add(gl); im.userData.guide = gl;
    }
    if (dno === 4 && aid === 'paranirmita') { // v320 欲网光丝：魔罗别宫垂连他化——谱曰「不出欲網還屬他化自在天攝」字面化，仅本门亮时现
      const mp = sfpBeadLocal['魔羅天'];
      const gm = clippable(new THREE.LineDashedMaterial({ color: 0x6f9184, dashSize: 0.45, gapSize: 0.7, transparent: true, opacity: 0.3, depthWrite: false }))                            ;
      const gl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(mp.x, mp.y - 0.6, mp.z), new THREE.Vector3(0, 1.0, 0)]), gm);
      gl.computeLineDistances(); gl.visible = false;
      nv.marker.add(gl); im.userData.guide = gl;
    }
    sfpBeadMeshes.push(im); sfpBeadPick.push(pk);
    const candRec = { nv, dno, n, pids, pure: !!SFP_PURE_LAYOUT[g[0].id], star: null                      };
    if (!doorStarBest[dno] || doorStarBest[dno].n < n) doorStarBest[dno] = candRec;
  });
});
// v320 十仙孤岛（楞严卷八「休止深山。或大海島。絕於人境」）：南洲外海一座孤峰自海而起，十仙珠悬峰顶——
// 剪影级 primitives 同一只手（岩 #4f5a68＋雪顶），常驻器世间装点（同承云宫殿例）
{
  const jm = byId['jambu'];
  if (jm) {
    const a2 = _faceA('jambu') + 1.05;
    const isl = new THREE.Group();
    isl.position.set(Math.cos(a2) * 24, 0, Math.sin(a2) * 24);
    const rockM = clippable(new THREE.MeshStandardMaterial({ color: 0x4f5a68, roughness: 0.92, metalness: 0.04, emissive: 0x1a2230, emissiveIntensity: 0.3 }))                  ;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(3.2, 10.5, 7), rockM);
    peak.position.y = -4 + 5.25; isl.add(peak); // 海面（锚点局部 y-4）起峰，峰尖局部 y≈6.5，仙珠悬 6.8
    const side = new THREE.Mesh(new THREE.ConeGeometry(1.8, 5.5, 6), rockM);
    side.position.set(2.3, -4 + 2.75, 1.3); isl.add(side);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.0, 7), clippable(new THREE.MeshStandardMaterial({ color: 0xdfe7ee, roughness: 0.7, emissive: 0x9aa8b8, emissiveIntensity: 0.22 }))                  );
    cap.position.y = -4 + 9.6; isl.add(cap);
    jm.marker.add(isl);
  }
}
// 定梯级高对四禅（v147）：门8亮时初禅～四禅主星题字不随“无关全隐”隐去，梯级所对可读
['chan1', 'chan2', 'chan3', 'chan4'].forEach(id => (DOOR_ANCHORS[8] = DOOR_ANCHORS[8] || new Set()).add(id)); // v322 门8珠已离主图，防空集
// 全景星图只呈十五门星（用户定案）：每门一星，置于该门位珠最多的锚点珠环之上；
// 点门星＝展开该门全部位次（位珠坐标依经典锚点），再点收拢；双击门星＝入门内观照场
// v120「一门一法相」：统一竖立细光环为骨（环即门，十五门同一剪影），环心各悬一件按门义参数化建模的徽体：
// 种子/断环/四棘/登阶/叠环一点/升沉二珠/戒坛方界/双环互旋/慧剑/一台·二台·螺阶·八辐法轮/莲台/满月轮。
// 全部代码几何，门色加法发光；徽体缓旋，展开/现居之门环亮。
const doorStarPick               = [];
let doorLabelCullFn             = () => {}; // 门题字防叠（块内定义，渲染环调用）
const doorStarAnim                                                                                                                           = [];
{
  const geoP = new THREE.SphereGeometry(3.8, 6, 4);
  const makeDoorStar = (dno        )              => {
    const C = SFP_DOOR_COLOR[dno] ?? 0xd7aa45;
    const g = new THREE.Group();
    const mat = (o = 0.92, c         = C) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o });
    const lmat = (o = 0.7, c         = C) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringMat = lmat(0.55);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.09, 6, 40), ringMat);
    g.add(ring);
    const sill = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(0.9)); // 门槛一粒
    sill.position.y = -2.5; g.add(sill);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('215,170,69'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    gl.scale.set(5.5, 5.5, 1); g.add(gl);
    const em = new THREE.Group(); g.add(em);
    let items                                                          = [];
    const lotusTier = (y        , rTop        , rBot        ) => { // 四教共用莲座层
      const t = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 0.34, 8), mat(0.9));
      t.position.y = y; em.add(t); return t;
    };
    switch (dno) {
      case 1: { // 發始因地：种子含舒（一念将萌）
        em.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), lmat(0.4)));
        em.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.42), mat(1)));
        break;
      }
      case 2: { // 法道流弊：断环垂滴（道有缺口，漏而下注）
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 6, 24, Math.PI * 1.45), mat(0.9));
        arc.rotation.z = Math.PI * 0.78; em.add(arc);
        items = [{ o: arc, ax: 'z', sp: 0.45 }]; // 缺口缓转，垂滴不动
        const drop = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), mat(0.85));
        drop.position.set(0.4, -1.25, 0); drop.rotation.x = Math.PI; em.add(drop);
        break;
      }
      case 3: { // 四種惡趣：四棘下指（四趣下坠之相）
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 5), mat(0.9));
          sp.position.set(Math.cos(a) * 0.6, -0.15, Math.sin(a) * 0.6);
          sp.rotation.x = Math.PI;
          em.add(sp);
        }
        break;
      }
      case 4: { // 欲界人天：三级登阶（登天之阶）
        for (let i = 0; i < 3; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.85 - i * 0.16, 0.2, 0.5), mat(0.92));
          st.position.set(-0.5 + i * 0.5, -0.6 + i * 0.55, 0); em.add(st);
        }
        break;
      }
      case 5: { // 色無色天：叠环渐上，顶余一点（禅天层级，无色唯一点）
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.88 - i * 0.26, 0.07, 5, 22), lmat(0.85));
          r.rotation.x = Math.PI / 2; r.position.y = -0.62 + i * 0.58; em.add(r);
        }
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), mat(1));
        dot.position.y = 1.3; em.add(dot);
        break;
      }
      case 6: { // 生善滅惡：善珠升、惡滌沉，一线相悬
        const up = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), mat(1, 0xefe0b4));
        up.position.y = 0.72; em.add(up);
        const dn = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mat(0.45, 0x8b3f32));
        dn.position.y = -0.85; em.add(dn);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.55, 4), lmat(0.5));
        rod.position.y = -0.06; em.add(rod);
        break;
      }
      case 7: { // 增上戒學：戒坛方界（坛场方正，棱线分明）
        em.add(new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), lmat(0.16)));
        em.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.35, 1.35, 1.35)),
          new THREE.LineBasicMaterial({ color: C, transparent: true, opacity: 0.95 })));
        break;
      }
      case 8: { // 增上定學：双环互旋（定如环持）
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 5, 26), mat(0.85));
        const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 5, 26), mat(0.85));
        const g1 = new THREE.Group(), g2v = new THREE.Group();
        r1.rotation.x = Math.PI / 2; r2.rotation.x = Math.PI / 2;
        g1.rotation.z = 0.6; g2v.rotation.z = -0.6;
        g1.add(r1); g2v.add(r2); em.add(g1, g2v);
        items = [{ o: g1, ax: 'y', sp: 0.9 }, { o: g2v, ax: 'y', sp: -0.9 }];
        em.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(1)));
        break;
      }
      case 9: { // 增上慧學：慧剑竖立（剑断惑网）
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.9, 4), mat(0.95));
        blade.position.y = 0.45; em.add(blade);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.09, 0.18), mat(0.9));
        guard.position.y = -0.52; em.add(guard);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 5), mat(0.85));
        grip.position.y = -0.85; em.add(grip);
        break;
      }
      case 10: { // 藏教位次：一台（初入位次之座）
        lotusTier(-0.35, 0.55, 0.9);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(1));
        dot.position.y = 0.25; em.add(dot);
        break;
      }
      case 11: { // 通教位次：二台相叠（通前通后）
        lotusTier(-0.6, 0.62, 0.95);
        lotusTier(-0.15, 0.4, 0.62);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), mat(1));
        dot.position.y = 0.42; em.add(dot);
        break;
      }
      case 12: { // 別教位次：螺阶升顶（五十二位大螺旋的微缩）
        for (let i = 0; i < 8; i++) {
          const a = i * 0.85;
          const bd = new THREE.Mesh(new THREE.SphereGeometry(0.11 + i * 0.008, 6, 5), mat(0.95));
          bd.position.set(Math.cos(a) * (0.72 - i * 0.055), -0.85 + i * 0.26, Math.sin(a) * (0.72 - i * 0.055));
          em.add(bd);
        }
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), mat(1));
        top.position.y = 1.32; em.add(top);
        break;
      }
      case 13: { // 圓教位次：八辐法轮（圆顿一乘）
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 5, 28), mat(0.95));
        em.add(wheel);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.92, 4), mat(0.85));
          spk.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
          spk.rotation.z = a + Math.PI / 2;
          em.add(spk);
        }
        em.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat(1)));
        items = [{ o: em, ax: 'z', sp: 0.4 }]; // 法轮面内自旋，始终正面
        break;
      }
      case 14: { // 淨土橫超：八瓣莲台（往生之莲）
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          const petal = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 5), mat(0.9, 0xefe0b4));
          petal.position.set(Math.cos(a) * 0.66, -0.3, Math.sin(a) * 0.66);
          petal.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
          em.add(petal);
        }
        const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(1, 0xffffff));
        pearl.position.y = 0.15; em.add(pearl);
        break;
      }
      default: { // 15 圓極果位：满月轮（妙觉如满月）
        const moon = new THREE.Mesh(new THREE.CircleGeometry(0.85, 26), lmat(0.8, 0xffffff));
        (moon.material                           ).side = THREE.DoubleSide;
        em.add(moon);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 5, 30), lmat(0.7, 0xefe0b4));
        em.add(halo);
        items = [{ o: halo, ax: 'z', sp: 0.5 }]; // 月面不动，光环缓转
        break;
      }
    }
    if (!items.length) items = [{ o: em, ax: 'y', sp: 0.35 }];
    doorStarAnim.push({ dno, ringMat, items });
    return g;
  };
  // 门星安位（v123）：一门一真位——门星悬于本门全部位珠的世界重心，坐标即教义：
  // 矮铺之门（因地铺洲）悬珠顶；跨锚长路之门悬修行路中途如关口（人天门在登天阶半空、慧学门被西方拉偏、
  // 流弊门沉洲下）；同高相挤者以水平斥力让开（不动高度：高度即位阶语义）。
  const starW                                = {};
  Object.keys(doorStarBest).forEach(k => {
    const dno = Number(k); const b = doorStarBest[dno];
    const list = (SFP_POS         ).filter(p => p.door === dno && (!!SFP_PURE_LAYOUT[p.id]) === !!b.pure);
    const c = new THREE.Vector3(); let yMin = 1e9, yMax = -1e9;
    list.forEach((p     ) => {
      const a = byId[p.anchor].d.pos, v = sfpBeadLocal[p.id];
      c.x += a[0] + v.x; c.y += a[1] + v.y; c.z += a[2] + v.z;
      yMin = Math.min(yMin, a[1] + v.y); yMax = Math.max(yMax, a[1] + v.y);
    });
    c.divideScalar(Math.max(1, list.length));
    c.y = (yMax - yMin < 12) ? yMax + (b.pure ? 7.5 : 5) : c.y + 3;
    starW[dno] = c;
  });
  // 门星退场（v143 用户定案）：十五门示签不再入法界地图，改由右侧天梯签栏承载——
  // 此处只留每门位珠云的重心与半径（签栏点开时镜头框位珠云用）；
  // v125 三段一流手定坐标、v141 双重避让随星体一并退役
  Object.keys(doorStarBest).forEach(k => {
    const dno = Number(k); const b = doorStarBest[dno];
    const w = starW[dno];
    const list = (SFP_POS         ).filter(p => p.door === dno && (!!SFP_PURE_LAYOUT[p.id]) === !!b.pure);
    let r = 6;
    list.forEach((p     ) => {
      const a = byId[p.anchor].d.pos, v = sfpBeadLocal[p.id];
      r = Math.max(r, Math.hypot(a[0] + v.x - w.x, a[1] + v.y - w.y, a[2] + v.z - w.z));
    });
    doorFly[dno] = { c: w.clone(), r };
  });
  // 源流线（世间流/三学流/圣道流/横超线）已拆（v142 用户点名）：十五门之间不再连线
  // 门题字防叠（屏幕空间）：现居/展开门必留、近者优先，相叠隐远——转动视角自会轮换浮现
  const _dcV = new THREE.Vector3();
  const _dcA                                                                              = [];
  const doorLabelCull = () => {
    _dcA.length = 0;
    const W = renderer.domElement.clientWidth || 640, H = renderer.domElement.clientHeight || 400;
    const hw = H * 0.05 + 10, hh = 12;
    Object.keys(doorStarBest).forEach(k => {
      const dno = Number(k); const b = doorStarBest[dno]; if (!b.labelSp) return;
      if (!!b.pure !== inPure) { b.labelSp.visible = true; return; } // 异帧门不参与（本帧看不见）
      if (inDoor && dno !== inDoor) { b.labelSp.visible = false; return; } // 门内观照沉浸：余门题字暂隐，出门即回（极简）
      b.labelSp.getWorldPosition(_dcV);
      _dcV.project(camera);
      if (_dcV.z > 1) { b.labelSp.visible = false; return; }
      _dcA.push({
        sp: b.labelSp, x: (_dcV.x * 0.5 + 0.5) * W, y: (-_dcV.y * 0.5 + 0.5) * H, d: dno,
        keep: dno === browseDoor || dno === focusDoorA || dno === inDoor,
      });
    });
    // 现居/展开门必留；余按谱序早者优先（因地等基础之门恒在目，胜于忽近忽远的距离优先）
    _dcA.sort((a, b2) => ((b2.keep ? 1 : 0) - (a.keep ? 1 : 0)) || a.d - b2.d);
    for (let i = 0; i < _dcA.length; i++) {
      let vis = true;
      for (let j = 0; j < i; j++) {
        if (!_dcA[j].sp.visible) continue;
        if (Math.abs(_dcA[i].x - _dcA[j].x) < hw * 2 && Math.abs(_dcA[i].y - _dcA[j].y) < hh * 2) { vis = false; break; }
      }
      _dcA[i].sp.visible = vis;
    }
  };
  (window       ).__doorLabelCull = doorLabelCull;
  doorLabelCullFn = doorLabelCull;
  // 门名标签：等字体就绪再绘 canvas，免退回黑体；门题用原字不随简繁转换
  const drawDoorLabels = () => Object.keys(doorStarBest).forEach(k => {
    const dno = Number(k); const b = doorStarBest[dno]; if (!b.star) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 80;
    const g2 = c.getContext('2d') ;
    g2.font = '44px "Smiley Sans",sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.shadowColor = 'rgba(10,8,20,.9)'; g2.shadowBlur = 10;
    g2.fillStyle = '#efe0b4';
    g2.fillText(SFP_DOOR_BY[dno].title, 256, 40); // 去序数只留门名（用户定案）：序号不助空间理解，谱序自有光带与控制台进度点
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0.92 }));
    sp.scale.set(0.17, 0.0266, 1); sp.position.set(0, 3.9, 0); sp.renderOrder = 8; // 恒定屏幕尺寸，远观也读得清（环顶之上）
    b.labelSp = sp; // 存引用：门题字屏幕矩形命中用（看得清的字也要点得中）
    b.star.add(sp);
  });
  if ((document       ).fonts?.ready) (document       ).fonts.ready.then(drawDoorLabels).catch(() => drawDoorLabels());
  else drawDoorLabels();
}
// 门星徽体缓旋＋门环高亮：展开/现居之门环亮且呼吸，余门常明微光
function doorStarsUpdate(t        ) {
  for (const rec of doorStarAnim) {
    for (const it of rec.items) {
      if (it.ax === 'y') it.o.rotation.y = t * it.sp + rec.dno;
      else it.o.rotation.z = t * it.sp + rec.dno;
    }
    const hot = rec.dno === focusDoorA || rec.dno === focusDoorB || rec.dno === browseDoor;
    rec.ringMat.opacity = hot ? 0.8 + Math.sin(t * 2.4) * 0.18 : 0.5;
  }
}
// 谱序单调兜底（v128）：四教位次回归四圣锚点后，跨锚之门（藏、别贯声闻→佛）个别位珠可能倒挂——
// 按谱序小步上提（每步至少 +0.8），「升＝向上」字面恒成立；净土门经义坐标不动
{
  const lift                         = {};
  // 高峰位（v139）：生天高位自身可高悬，但不抬后续底线——后位回落人间/圣域皆经义
  // （护法八部天、请法梵王后三忏回人间行；三果寄净居后四果出三界入声闻星域）
  const SFP_MONO_PEAK = new Set(['護法八部', '請法梵王', '三果阿那含']);
  for (let dno = 1; dno <= 15; dno++) {
    if (dno === 14 || dno === 12 || dno === 2 || dno === 5 || DISC_DOORS.has(dno)) continue; // 净土经义坐标、别教位塔（科环同高）、法道流弊门（v150：流弊本义即沉降）与色无色天门（v164：一禅一环拉平，环同高即经义，层间自升）不参与盘升；v322 谱页门门户点本一点不盘升
    let prev = -Infinity;
    (SFP_POS         ).filter((p     ) => p.door === dno).forEach((p     ) => {
      const nv = byId[p.anchor]; const v = sfpBeadLocal[p.id]; if (!nv || !v) return;
      let wy = nv.d.pos[1] + v.y;
      if (wy <= prev + 0.4) { const dd = prev + 0.8 - wy; v.y += dd; wy += dd; lift[p.id] = dd; }
      if (!SFP_MONO_PEAK.has(p.id)) prev = wy;
    });
  }
  if (Object.keys(lift).length) {
    const M = new THREE.Matrix4();
    sfpBeadMeshes.concat(sfpBeadPick).forEach(im => {
      const pids = im.userData.pids            ; let dirty = false;
      pids.forEach((pid, k) => {
        if (lift[pid] !== undefined) { const v = sfpBeadLocal[pid]; M.makeTranslation(v.x, v.y, v.z); im.setMatrixAt(k, M); dirty = true; }
      });
      if (dirty) im.instanceMatrix.needsUpdate = true;
    });
  }
}
// 门谱序光带：每门一条细光线按谱序串起全门位珠（门色加法），展开该门才显——
// 跨锚之门（欲界人天＝登天阶、慧学一位遥指西方）由光带串成一条修行路
const doorThreads                             = {};
{
  const byDoor                        = {};
  (SFP_POS         ).forEach(p => { (byDoor[p.door] = byDoor[p.door] || []).push(p); });
  Object.keys(byDoor).forEach(ds => {
    const dno = Number(ds); const g = byDoor[dno];
    if (g.length < 2 || DISC_DOORS.has(dno) || dno === 5) return; // v322 谱页门无主图珠；门5光带撤（用户点单：色无色少连线——谱序已由禅天层高自表，线赘）
    const pure = !!SFP_PURE_LAYOUT[g[0].id];
    let pts = g.map((p     ) => {
      const A = byId[p.anchor].d.pos, lp = sfpBeadLocal[p.id];
      return new THREE.Vector3(A[0] + lp.x, A[1] + lp.y, A[2] + lp.z);
    });
    if (dno === 4) { // v320 登天阶重修：四洲段贴海绕行（北→西→东→南＝「今依見佛聞法以為次第」），
      // 西→东取外圈经南半海（r132 略高，与东→南内圈 r106 分轨不叠线）；再经轮宝阶、仙岛、沿山升四王忉利、
      // 空居逐层，终于魔宫——欲界之巅即魔，蕣益排魔罗于门末之深意，路径自身即法义
      const Wp = (pid        ) => { const p2 = g.find((q     ) => q.id === pid); const A = byId[p2.anchor].d.pos, lp = sfpBeadLocal[pid]; return new THREE.Vector3(A[0] + lp.x, A[1] + lp.y, A[2] + lp.z); };
      const P                  = [];
      const arc = (a0        , a1        , r        , y        , nseg        ) => { for (let i2 = 1; i2 < nseg; i2++) { const a = a0 + (a1 - a0) * i2 / nseg; P.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); } };
      P.push(Wp('北俱盧洲'));
      arc(-Math.PI / 2, -Math.PI, 106, 6.5, 6);          // 北→西：西北象限贴海
      P.push(Wp('西牛貨洲'));
      arc(-Math.PI, -Math.PI * 2, 132, 9.5, 10);         // 西→东：外圈经南半海遠航
      P.push(Wp('東勝神洲'));
      arc(0, Math.PI / 2, 106, 6.5, 5);                  // 东→南：内圈归泊
      ['南贍部洲', '鐵輪王', '銅輪王', '銀輪王', '金輪王', '十種仙', '四王天', '忉利天', '夜摩天', '兜率天', '蒙光天子', '彌勒內院', '化樂天', '他化自在天', '魔羅天'].forEach(pid => P.push(Wp(pid)));
      pts = P;
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.42);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(g.length * 7)),
      new THREE.LineBasicMaterial({ color: SFP_DOOR_COLOR[dno] ?? 0xd7aa45, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.visible = false; line.renderOrder = 2;
    (pure ? pureLand : nodesRoot).add(line);
    doorThreads[dno] = line;
  });
}
// 本门聚焦＋观照展开：全图默认只显十五门星与当下门位珠；点门星另展一门（0=无）
let focusDoorA = 0, focusDoorB = 0;
let browseDoor = 0;
function applySfpFocus() {
  // 极简呈现（用户定案）：看哪门只见哪门——
  // 主动展开/入门时屏上只留本门（位珠全亮放大＋门星＋光带），余十四门星连题字整体暂隐；
  // 无主动展开时全图只见十五门星，现居门（focusDoorA/B）位珠保亮
  const on = (d        ) => inBodhi ? (d >= 9 && d <= 13) // 菩萨道场：四教并慧学位次全亮（9~13 门），门禁让位于专场
    : browseDoor ? d === browseDoor : (d === focusDoorA || d === focusDoorB);
  const M = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s3 = new THREE.Vector3(); const v3 = new THREE.Vector3();
  sfpBeadMeshes.forEach(m => {
    const hot = on(m.userData.door);
    m.visible = hot;
    if (m.userData.guide) m.userData.guide.visible = hot;
    if (!hot) return;
    (m.material                           ).opacity = 0.95;
    (m.material                           ).depthWrite = true;
    const sc = 1.7;
    if (m.userData.sc !== sc) {
      m.userData.sc = sc;
      s3.setScalar(sc);
      (m.userData.pids            ).forEach((pid, i) => {
        if (NODE_POS.has(pid)) return; // 一位即一星：珠保持缩0，节点星即位
        const v = sfpBeadLocal[pid];
        M.compose(v3.set(v.x, v.y, v.z), q, s3.setScalar(sc * (SFP_BEAD_SCALE[pid] || 1))); // v320 轮宝阶逐珠尺度
        m.setMatrixAt(i, M);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  });
  sfpBeadPick.forEach(m => { m.visible = on(m.userData.door); });
  Object.keys(doorThreads).forEach(ds => { doorThreads[Number(ds)].visible = Number(ds) === browseDoor; }); // v151：光带只随主动观照亮，行棋被动聚焦不铺线
  // 门星同步显隐：展开时余门星（含题字）整体暂隐，收拢即回；隐星不参与拾取（看不见则点不中）
  Object.keys(doorStarBest).forEach(k => {
    const dno = Number(k); const b = doorStarBest[dno]; if (!b || !b.star) return;
    b.star.visible = !browseDoor || dno === browseDoor;
  });
}
function setSfpFocus(a        , b = 0) { focusDoorA = a; focusDoorB = b; applySfpFocus(); }
function setBrowseDoor(d        ) { browseDoor = d; applySfpFocus(); ladderSync(); }
applySfpFocus(); // 初始即收拢：未开局也只见门星
const sfpGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow('215,170,69'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
sfpGlow.visible = false;
scene.add(sfpGlow);
const _glowV = new THREE.Vector3();
function sfpGlowUpdate(t        ) {
  if (sfpTransit || starView) { sfpGlow.visible = false; return; }
  const p = sfpS.pos ? SFP_BY[sfpS.pos] : null;
  const nv = p ? byId[p.anchor] : null;
  const lp = p ? sfpBeadLocal[p.id] : null;
  if (!p || !nv || !lp || (!!p.pure !== inPure)) { sfpGlow.visible = false; return; }
  sfpGlow.visible = true;
  sfpGlow.position.copy(nv.marker.localToWorld(_glowV.copy(lp)));
  const burst = Math.max(0, (sfpFlashUntil - performance.now()) / 1100); // 落位爆闪
  sfpGlow.scale.setScalar(5.5 + Math.sin(t * 2.6) * 1.3 + burst * 9);
  (sfpGlow.material                        ).opacity = Math.min(1, (sfpS.active ? 0.95 : 0.5) + burst * 0.6);
}

// 升降判定通用：入净土=横超；入流弊/恶趣门=降；门序递进=升；同门比谱序（判词用）
// 升降判定已抽入 src/sfp-rules.js（游戏与核证脚本共用单一真源，免逻辑分叉两份）
const SFP_POS_ORDER = (SFP_POS         ).map((q     ) => q.id); // 同门谱序索引（原先每次 findIndex 全表扫）
function sfpDirOf(p     , dest     , combo         )         {
  return sfpDirOfRule(p, dest, combo, SFP_POS_ORDER);
}
const _rw = new THREE.Vector3();
function sfpWorldOf(pid        )                { // 位珠世界坐标（含极乐场偏移）
  const p = SFP_BY[pid];
  return byId[p.anchor].marker.localToWorld(_rw.copy(sfpBeadLocal[pid])).clone();
}

// ── 足迹星座（v119 盘面化②）：走过的位珠留淡金常明光点，并按实际行迹连细线——一局下来自成一座星座，随存档持久
const footGroup = new THREE.Group(); nodesRoot.add(footGroup);
const footPure = new THREE.Group(); pureLand.add(footPure);
const footPtMat = new THREE.PointsMaterial({ color: 0xd8c58b, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
function rebuildFoot() {
  [footGroup, footPure].forEach(gr => gr.children.slice().forEach(o => { const m = o       ; if (m.geometry) m.geometry.dispose(); gr.remove(o); }));
  if (!sfpS.trail.length) return;
  const inFrame = (pid        ) => { // 帧内坐标（nodesRoot 或 pureLand 局部系）
    const p = SFP_BY[pid]; const A = byId[p.anchor].d.pos; const lp = sfpBeadLocal[pid];
    return new THREE.Vector3(A[0] + lp.x, A[1] + lp.y, A[2] + lp.z);
  };
  // 光点：去重后每位一点
  const seen = new Set        (); const ptsS           = []; const ptsP           = [];
  sfpS.trail.forEach(pid => {
    if (seen.has(pid) || !SFP_BY[pid]) return; seen.add(pid);
    const v = inFrame(pid); (SFP_BY[pid].pure ? ptsP : ptsS).push(v.x, v.y, v.z);
  });
  ([[ptsS, footGroup], [ptsP, footPure]]                                  ).forEach(([arr, gr]) => {
    if (!arr.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    gr.add(new THREE.Points(geo, footPtMat));
  });
  // 行迹细线已拆（v151 行棋静场）：足迹只留淡金光点，脉络回看走「行迹」面板
}
// 调试钩子：行棋静场自测（只读）
(window       ).__quietDbg = () => ({
  skySel, inSky,
  threadsOn: Object.keys(doorThreads).filter(d => doorThreads[Number(d)].visible).map(Number),
  footLines: footGroup.children.filter(o => (o       ).isLine).length + footPure.children.filter(o => (o       ).isLine).length,
  footPts: footGroup.children.length + footPure.children.length,
  jambuDetail: !!saha.userData.jambuDetail,
  sectionH, secAuto, inBodhi, bodhiSpread, bodhiGrp, grpOf: (pid        ) => bodhiGrpOf[pid], setGrp: (g        ) => setBodhiGrp(g), // v153-155 验收
  sahaVis: saha.visible, ringsOn: bodhiRingLines.filter(r => r.visible).length, hidN: bodhiHid.length, // v162 验收
  wp: (pid        ) => { const w = sfpWorldOf(pid); return [w.x, w.y, w.z]; },
  lp: (pid        ) => { const v = sfpBeadLocal[pid]; return v ? [v.x, v.y, v.z] : null; },
  relayout: (on         ) => bodhiRelayout(on),
  beadScale: (pid        ) => { // 验收：位珠实例缩放（视觉网格）
    for (const im of sfpBeadMeshes) { const pids = im.userData.pids            ; const k = pids ? pids.indexOf(pid) : -1;
      if (k >= 0) { const M = new THREE.Matrix4(); im.getMatrixAt(k, M); const sc = new THREE.Vector3(); M.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc); return +sc.x.toFixed(3); } }
    return null; },
  beadColor: (pid        ) => {
    for (const im of sfpBeadMeshes) { const pids = im.userData.pids            ; const k = pids ? pids.indexOf(pid) : -1;
      if (k >= 0 && im.instanceColor) { const c = new THREE.Color(); c.fromBufferAttribute(im.instanceColor       , k); return '#' + c.getHexString(); } }
    return null; },
});
function sfpTrailPush(pid        ) {
  const t = sfpS.trail;
  if (t[t.length - 1] !== pid) { t.push(pid); if (t.length > 200) t.splice(0, t.length - 200); }
}

// 定位闪光：全谱总览点位飞往时的临时金光
const locGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow('239,224,180'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
locGlow.visible = false;
let locUntil = 0;
function locGlowUpdate(t        ) {
  if (!locGlow.visible) return;
  const left = locUntil - performance.now();
  if (left <= 0) { locGlow.visible = false; return; }
  locGlow.scale.setScalar(4.5 + Math.sin(t * 5) * 1.4);
  (locGlow.material                        ).opacity = Math.min(1, left / 900);
}

// 行棋光点：旧珠→新珠的彗星动画（升弧上扬、坠弧下压），带拖尾连线与来位残影
const cometSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow('244,230,184'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
cometSprite.visible = false; scene.add(cometSprite);

// ===== 就地观照（v121，用户定案）：门＝地图上的实处，无独立场景 =====
// 掷定入位后镜头俯冲进本门位珠簇：本门位珠放大全亮、逐珠浮出位名标签、谱序光带亮起，
// 无关之门整门隐藏——位珠/足迹/光带永远同一坐标系，地狱门俯进山根、天门贴上山腰，空间即教义。
let inDoor = 0;
const doorPlanets                                = {}; // 聚焦门位珠的世界坐标（沿用旧名，命名从旧链路）
const nodeLabelRects                                                   = {}; // v320 节点题字屏区（逐帧写）：门观附位签避让主星名用
let doorLabelPts                                            = [];
let doorLabelEls                = [];
function clearDoorFocus() {
  doorLabelEls.forEach(e2 => e2.remove());
  doorLabelEls = []; doorLabelPts = [];
  Object.keys(doorPlanets).forEach(k => delete doorPlanets[k]);
}
function buildDoorFocus(dno        ) {
  clearDoorFocus();
  const list = (SFP_POS         ).filter(p => p.door === dno && !SFP_PURE_LAYOUT[p.id]);
  list.forEach((p     ) => {
    const wp = sfpWorldOf(p.id);
    doorPlanets[p.id] = wp;
    if (NODE_POS.has(p.id)) return; // 一位即一星（v145）：题字用节点原标签，不另造位名浮标
    doorLabelPts.push({ pid: p.id, wp });
    const le = document.createElement('div');
    le.className = 'nlabel drl'; le.textContent = zh(p.name);
    le.style.display = 'none';
    le.addEventListener('click', () => openSfpNote(p.id));
    labelLayer.appendChild(le); doorLabelEls.push(le);
  });
}
function doorClusterView(dno        )                                                       {
  const pts = Object.keys(doorPlanets).map(k => doorPlanets[k]);
  if (!pts.length) return null;
  const c = new THREE.Vector3(); pts.forEach(v => c.add(v)); c.divideScalar(pts.length);
  let r = 0; pts.forEach(v => { r = Math.max(r, c.distanceTo(v)); });
  const out = c.clone().setY(0);
  if (out.lengthSq() < 1) out.set(0.6, 0, 1);
  out.normalize();
  return { pos: c.clone().addScaledVector(out, r * 1.7 + 16).add(new THREE.Vector3(0, r * 0.55 + 7, 0)), target: c };
}
function doorViewFor(pid        )                                                {
  const wp = doorPlanets[pid].clone();
  const out = wp.clone().setY(0); // 自山轴向外取景，背山面珠
  if (out.lengthSq() < 1) out.set(1, 0, 0);
  out.normalize();
  return { pos: wp.clone().addScaledVector(out, 14).add(new THREE.Vector3(0, 5.5, 0)), target: wp };
}
function enterDoor(dno        , pid         , cam                          = 'jump') {
  if (DISC_DOORS.has(dno)) { // v316/v322 门1及行门四门观照一律入谱页专场（无地理坐标，主图无珠可观）：归位/巡游/旧链路皆改道
    if (inDisc) { buildDisc(dno); if (pid) discLand(pid); }
    else enterDiscTransit(dno, pid);
    return;
  }
  if (dno === 3 && !inNether) { enterNetherTransit(pid); return; } // v171 恶趣门一律走幽冥剖块专场
  if (inNether && dno !== 3) netherRestore(); // 幽冥场内转入他门：先复原地表场景（门态由下文重建）
  if (inPure || inSky || inBodhi || inDisc) returnSaha();
  setConMin(false); // 俯冲入门＝回到局面，收起的控制台恢复
  if (inDoor !== dno) {
    buildDoorFocus(dno);
    inDoor = dno;
    closeCard();
    setModeInstant(0);
    setBrowseDoor(dno); // 本门全亮放大＋光带显，余门整门隐藏
    backBtn.dataset.t = ''; // 交给按帧同步重算
    // V71：门总说已承担入门解释，旧的短 toast 退役，避免两段介绍叠出。
    if (cam !== 'none') {
      const v = (pid && doorPlanets[pid]) ? doorViewFor(pid) : doorClusterView(dno);
      if (v) {
        if (cam === 'jump') { cancelFly(); camera.position.copy(v.pos); controls.target.copy(v.target); }
        else flyTo(v.pos, v.target, 1.3);
      }
    }
    // 入门总说待呈：行棋初入本门，落定后稍驻再呈浮文（白光正散、位名已报）
    // v80 对齐 makeplay：仅当待呈的入门总说正属本位（pid 匹配）才呈，免呈错/呈陈
    if (pendingDoorIntro && pid && pendingDoorIntro.pid === pid) {
      const pd = pendingDoorIntro ; pendingDoorIntro = null;
      window.setTimeout(() => {
        if (sfpS.active && sfpS.pos === pd.pid && inDoor === pd.door) { markDoorSeen(pd.door); showDoorIntro(pd.door); }
      }, 900);
    }
    return;
  }
  if (pid && doorPlanets[pid] && cam !== 'none') { const v = doorViewFor(pid); flyTo(v.pos, v.target, 1.0); }
}
// 点门（星体或题字）通用一拍：短按展开/收拢，双击进入观照（净土门另走极乐链路不在此）；
// 交互标准（用户定案）：单击一律只展开/收拢，双击＝入场俯冲就地观照
function doorTap(dno        , isDbl         , wp               ) {
  if (isDbl && dno !== 14) {
    enterDoor(dno, sfpS.pos && SFP_BY[sfpS.pos].door === dno ? sfpS.pos : undefined, 'fly');
    playSfx('sfx-tap', 0.25); return;
  }
  if (inDoor === dno) { exitDoor(true); playSfx('sfx-tap', 0.25); return; } // 门观中再点本门＝出门观全图（免收拢/门观状态错位）
  if (browseDoor === dno) { setBrowseDoor(0); showToast(`「${SFP_DOOR_BY[dno].title}」位次已收拢`); }
  else {
    setBrowseDoor(dno);
    const dir2 = camera.position.clone().sub(wp).setY(0); if (dir2.lengthSq() < 1) dir2.set(1, 0, 1); dir2.normalize();
    flyTo(wp.clone().addScaledVector(dir2, 36).add(new THREE.Vector3(0, 13, 0)), wp, 1.0);
    showToast(`「${SFP_DOOR_BY[dno].title}」展开——位次依经典坐标布于诸界；点小珠读谱注，双击门星俯冲贴近`, 3800);
  }
  playSfx('sfx-tap', 0.25);
  if (DISC_DOORS.has(dno)) { // v314/v322 谱页专场：点门转场入页，场内再点本门＝出；场内点他页门＝就地换页
    if (inDisc) {
      if (discDoor === dno) { if (performance.now() - discEnterT > 600) returnSaha(); }
      else { buildDisc(dno); showDoorIntro(dno); discEnterT = performance.now(); }
    }
    else enterDiscTransit(dno);
    return;
  }
  if (dno === 3) { // 幽冥剖块专场
    if (inNether) { if (performance.now() - doorEnterT > 600) exitDoor(true); }
    else enterNetherTransit(sfpS.pos && SFP_BY[sfpS.pos].door === 3 ? sfpS.pos : undefined);
    return;
  }
  if (dno === 14) { // 极乐场内的净土门星：场即其门，星＝展开/收拢十三正因珠
    if (browseDoor === 14) setBrowseDoor(0); else setBrowseDoor(14);
    return;
  }
  if (inDoor === dno) { if (performance.now() - doorEnterT > 600) exitDoor(true); return; }
  enterDoor(dno, sfpS.pos && SFP_BY[sfpS.pos].door === dno ? sfpS.pos : undefined, 'fly');
  void wp;
}
function exitDoor(fly = true) {
  if (!inDoor) return;
  exitStarView(false); // 门观中观星：先还镜头距离限制
  inDoor = 0;
  clearDoorFocus();
  setBrowseDoor(0); // 收拢：本门隐去（现居门仍由 focusDoorA 保亮）
  backBtn.dataset.t = ''; // 交给按帧同步重算
  // 一图一局后位珠就在脚下：「全图」应拉远观全貌（原地收标签镜头不动＝按了没反应）
  if (fly) flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
}
// 别教位塔科名（v148）：门12亮时六重环心各浮一枚科题——五十一珠的密度靠科层结构化解读，而非逐珠认字
const TIER12 = ['十信', '十住', '十行', '十迴向', '十地', '等覺'];
const tier12Els = TIER12.map((t, i) => {
  const e2 = document.createElement('div');
  e2.className = 'nlabel tier12'; e2.textContent = zh(t); e2.style.display = 'none';
  e2.addEventListener('click', () => { if (inBodhi) setBodhiGrp(3 + i); }); // 场内点科名展开该科位名
  labelLayer.appendChild(e2); return e2;
});
const tier12V = new THREE.Vector3();
function updateTier12() {
  const on = (browseDoor === 12 || inDoor === 12) && !inBodhi && !inPure && !inSky && modeT < 0.5; // v159：场内科名走右栏导航，轴心题字不再挂屏
  const bod = byId['bodhi'];
  tier12Els.forEach((e2, t) => {
    if (!on || !bod) { if (e2.style.display !== 'none') e2.style.display = 'none'; return; }
    // 场内球仪环列：科名浮在各科环带轴心；门观塔式沿旧高
    tier12V.set(0, inBodhi ? (t < 5 ? -3.6 + t * 6 : 24.6) : (t < 5 ? 3.6 + t * 5 : 26.6), 0);
    bod.marker.localToWorld(tier12V);
    tmpCam.copy(tier12V).applyMatrix4(camera.matrixWorldInverse);
    if (tmpCam.z > -2 || tmpCam.z < -320) { e2.style.display = 'none'; return; }
    tier12V.project(camera);
    const x = (tier12V.x * 0.5 + 0.5) * app.clientWidth, y = (-tier12V.y * 0.5 + 0.5) * app.clientHeight;
    if (x < -40 || x > app.clientWidth + 40 || y < -20 || y > app.clientHeight + 20) { e2.style.display = 'none'; return; }
    e2.style.display = '';
    e2.style.left = x + 'px'; e2.style.top = y + 'px';
    e2.classList.toggle('bcap', inBodhi);
    e2.classList.toggle('on', inBodhi && bodhiGrp === 3 + t);
    e2.style.color = inBodhi ? '#' + BODHI_GRPS[3 + t].color.toString(16).padStart(6, '0') : '';
  });
}
function updateDoorLabels() {
  updateTier12(); updateBodhiCaps(); updateDiscLabels();
  if ((!inDoor && !inBodhi) || modeT > 0.05) { doorLabelEls.forEach(e2 => { if (e2.style.display !== 'none') e2.style.display = 'none'; }); return; }
  const w = app.clientWidth, h = app.clientHeight;
  // 避让：现居位最优先、近珠次之；屏幕矩形重叠即隐（远观不成堆，推进自然逐珠浮现）
  const order = doorLabelPts.map((pt, i) => {
    tmpCam.copy(pt.wp).applyMatrix4(camera.matrixWorldInverse);
    return { i, z: tmpCam.z, cur: pt.pid === sfpS.pos };
  }).sort((a, b) => (b.cur ? 1 : 0) - (a.cur ? 1 : 0) || b.z - a.z); // z 负向远：大者近
  const placed                                          = [];
  // v320 门签让节点签：节点题字（兜率天/他化自在天…）已占屏区先记入，附位签不再压主星名（两套标签系互避）
  for (const k in nodeLabelRects) { const r = nodeLabelRects[k]; placed.push([r[0] + r[2] / 2, r[1] + r[3] * 1.4, r[2], r[3] * 1.6]); }
  order.forEach(({ i, z }) => {
    const pt = doorLabelPts[i]; const le = doorLabelEls[i]; if (!le) return;
    // 场内科组门禁（v155）：默认全收只见科名，点开科名才显该科位名；现居位恒显
    if (inBodhi && bodhiGrpOf[pt.pid] !== bodhiGrp && pt.pid !== sfpS.pos) { le.style.display = 'none'; return; }
    if (z > -1 || z < -360) { le.style.display = 'none'; return; }
    tmpV.copy(pt.wp).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
    if (x < -50 || x > w + 50 || y < -10 || y > h + 10) { le.style.display = 'none'; return; }
    const lw = (le.textContent || '').length * 13 + 14, lh = 20;
    const hit = placed.some(r => Math.abs(x - r[0]) * 2 < lw + r[2] && Math.abs(y - r[1]) * 2 < lh + r[3]);
    if (hit) { le.style.display = 'none'; return; }
    placed.push([x, y, lw, lh]);
    le.style.display = '';
    le.style.left = x + 'px'; le.style.top = y + 'px';
    le.classList.toggle('cur', pt.pid === sfpS.pos);
  });
}
const TRAIL_N = 24;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailCol = new Float32Array(TRAIL_N * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
  color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
}));
trailLine.visible = false; trailLine.frustumCulled = false; scene.add(trailLine);
const trailGlows                 = [];
if (!isCoarse) for (let i = 0; i < 7; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('232,199,102'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.15 }));
  sp.scale.setScalar(0); scene.add(sp); trailGlows.push(sp);
}
function trailGlowsOff() { for (const g of trailGlows) g.scale.setScalar(0); }
const landRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRingTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
landRing.scale.setScalar(0); scene.add(landRing);
let landUntil = 0;
let cometNextCols                          = null;
let cometNextQuick = false;
const flownSegs = new Set        ();
const ghostGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow('215,170,69'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
ghostGlow.visible = false; scene.add(ghostGlow);
let ghostUntil = 0;
let ghostRef                                             = null;
// v320 蒙光时刻（华严·光幢王：兜率宫菩萨放大光明照阿鼻，狱众蒙光命终生兜率）：
// 阿鼻/无间掷佛佛→蒙光天子这一手，自兜率垂一道金白光幢直贯幽得——仅此一手现 4.6s，非常驻光效；
// depthTest 关＝光穿山体而过（经云光照地狱，山石不能障）
const mgBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.6, 1, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xf4e6b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
mgBeam.visible = false; mgBeam.renderOrder = 3; mgBeam.frustumCulled = false; scene.add(mgBeam);
let mgBeamUntil = 0; const MG_BEAM_MS = 4600;
function mengGuangBeam(fromPid        ) {
  const a = sfpWorldOf('蒙光天子'), b = sfpWorldOf(fromPid);
  if (!a || !b) return;
  const dir = b.clone().sub(a); const len = dir.length(); if (len < 1) return;
  mgBeam.position.copy(a).addScaledVector(dir, 0.5);
  mgBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mgBeam.scale.set(1, len, 1);
  (mgBeam.material                           ).opacity = 0;
  mgBeam.visible = true; mgBeamUntil = performance.now() + MG_BEAM_MS;
}
let sfpTransit = false;
// 谱局聚焦雾：落定观位时收紧雾距，背后法界退隐（近清远隐，似景深）
let fogBase = 0.0016;
let focusHazeOn = false;
function setTransit(v         ) {
  sfpTransit = v;
  labelLayer.style.opacity = v ? '0.15' : ''; // v319 飞行静场：乘光途中星名标签压暗，落定回满（同掷轮纱之例）
  const b = sfpBar.querySelector('#sfpRoll')               ;
  b.classList.toggle('dis', v || sfpS.rolling);
  (b.querySelector('#rollTxt')               ).textContent = zh(v ? '行棋中…' : '长按掷轮');
  syncRollGlow();
}
// ── 本手限时呈现 ──
// 服务器给每一手 turnDeadline（在线一分钟、断线三十秒、判词兜底一分钟、择人三十秒），
// 逾时即代为跳手或交轮。从前这个刻度前台一处都没用，人读着谱注忽然就被跳了，事后才在聊天里看到一行。
let netClockTimer = 0;
function netTurnLeft() {
  if (!Net.active || !Net.isPlaying()) return -1;
  const deadline = Number(Net.room.turnDeadline || 0);
  if (!deadline) return -1;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
function netVerdictClock() {
  const clock = verdictEl.querySelector('#vClock')                      ;
  if (!clock) return;
  const mine = verdictFn && Net.active && Net.isPlaying()
    && Net.room.phase === 'resolving' && Net.room.turnId === Net.myId;
  const left = mine ? netTurnLeft() : -1;
  if (left < 0 || left > 30) { clock.textContent = ''; clock.classList.remove('warn'); return; }
  clock.textContent = zh(`剩 ${left} 秒`);
  clock.classList.toggle('warn', left <= 10);
}
function netClockSync() {
  const on = Net.active && Net.isPlaying() && sfpS.active;
  if (on && !netClockTimer) netClockTimer = window.setInterval(() => { syncRollGlow(); netVerdictClock(); }, 1000);
  if (!on && netClockTimer) { clearInterval(netClockTimer); netClockTimer = 0; }
  if (!on) netVerdictClock();
}
function syncRollGlow() {
  const terminal = sfpS.finished || !!(sfpS.pos && SFP_BY[sfpS.pos]?.terminal);
  const localReady = sfpS.active && !terminal && !sfpS.rolling && !sfpTransit && !verdictFn;
  const canRoll = localReady && (!Net.active || Net.canToss());
  const waiting = localReady && Net.active && !canRoll;
  const button = sfpBar.querySelector('#sfpRoll')               ;
  button.classList.toggle('glow', canRoll);
  button.classList.toggle('wait', waiting);
  button.classList.toggle('dis', !canRoll && !sfpS.rolling);
  const txt = button.querySelector('#rollTxt')               ;
  if (!sfpS.rolling && !sfpTransit) {
    let label = terminal
      ? (Net.active && !Net.isFinished() ? '本座已及第 · 等待结算' : '本局已结束')
      : (waiting ? Net.turnHint() : '长按掷轮');
    if (canRoll && Net.active) {
      const left = netTurnLeft();                       // 只在快到点时提示，平时不催人
      if (left >= 0 && left <= 20) label = `${label} · 剩 ${left} 秒`;
    }
    txt.textContent = zh(label);
  }
  const bn = sfpBar.querySelector('#rollBn')               ;
  const on = sfpS.active && sfpBonusLeft > 0;
  bn.style.display = on ? '' : 'none';
  if (on) bn.textContent = zh(`贈×${sfpBonusLeft}`);
}
let comet                                                                                                                                                                                                             = null;
// 途经门次字幕：跨门乘光时，每越一门浮现该门名目与原谱门介摘句（无介者只报门名）
const transitCap = el('<div id="transitCap" class="ui"><b></b><i></i></div>');
app.appendChild(transitCap);
let transitCapT = 0;
const DOOR_HINT                         = {};
// V90：门一、二、十五的导语是项目白话，并非原谱门总说；不可放进「谱曰」式途经字幕。
const DOOR_HINT_SELF = new Set([1, 2, 15]);
(SFP_DOORS         ).forEach(d => {
  if (!d.intro || DOOR_HINT_SELF.has(d.no)) return;
  const parts = (d.intro          ).split('。').filter(Boolean);
  let s = '';
  for (const q of parts) { s += q + '。'; if (s.length >= 14) break; }
  if (s.length > 34) s = s.slice(0, 33) + '…';
  DOOR_HINT[d.no] = { text: s, type: d.introEvidenceType };
});
function showTransitCap(v                                 ) {
  (transitCap.querySelector('b')               ).textContent = zh(`途經 ${v.title}`);
  const i = transitCap.querySelector('i')               ;
  const hint = v.hint && typeof v.hint === 'object' ? v.hint : { text: v.hint || '', type: v.hintType || SFP_EVIDENCE_TYPE.source };
  i.textContent = hint.text ? zh(`${hint.type === SFP_EVIDENCE_TYPE.source ? '谱曰原文' : '释义'}：${hint.text}`) : '';
  i.style.display = v.hint ? '' : 'none';
  transitCap.classList.add('show');
  clearTimeout(transitCapT);
}
function hideTransitCap(delay = 0) {
  clearTimeout(transitCapT);
  transitCapT = window.setTimeout(() => transitCap.classList.remove('show'), delay);
}
let trailFadeUntil = 0;
let rideAbort = false; // 乘光随行：行棋时相机跟飞；玩家一碰屏幕即交还镜头
const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cp = new THREE.Vector3();
const _fr = new THREE.Vector3(), _fm = new THREE.Vector3(), _rd = new THREE.Vector3();
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3();
function cometCancel() {
  comet = null; cometSprite.visible = false; trailLine.visible = false; ghostGlow.visible = false;
  mgBeamUntil = 0; mgBeam.visible = false;
  trailGlowsOff(); landUntil = 0; landRing.scale.setScalar(0);
  hideTransitCap();
  setTransit(false);
}
function cometUpdate(dt        ) {
  if (mgBeamUntil) { // v320 蒙光幢淡入驻定淡出
    const left = mgBeamUntil - performance.now();
    if (left <= 0) { mgBeamUntil = 0; mgBeam.visible = false; }
    else { const t = 1 - left / MG_BEAM_MS; (mgBeam.material                           ).opacity = (t < 0.18 ? t / 0.18 : t > 0.62 ? Math.max(0, (1 - t) / 0.38) : 1) * 0.3; }
  }
  if (ghostGlow.visible && ghostRef) {
    const left = ghostUntil - performance.now();
    if (left <= 0) ghostGlow.visible = false;
    else {
      ghostGlow.position.copy(ghostRef.nv.marker.localToWorld(_cp.copy(ghostRef.lp)));
      ghostGlow.scale.setScalar(3.4);
      (ghostGlow.material                        ).opacity = Math.min(0.5, left / 4000 * 0.85);
    }
  }
  if (linkUntil) {
    const left = linkUntil - performance.now();
    if (left <= 0) { linkUntil = 0; linkLine.visible = false; linkMat.opacity = 0; }
    else linkMat.opacity = Math.min(0.5, left / 2200 * 0.8);
  }
  if (landUntil) {
    const left = landUntil - performance.now();
    if (left <= 0) { landUntil = 0; landRing.scale.setScalar(0); (landRing.material                        ).opacity = 0; }
    else { const kk = 1 - left / 700; landRing.scale.setScalar(2.2 + kk * 7.5); (landRing.material                        ).opacity = 0.6 * (1 - kk); }
  }
  if (!comet) {
    if (trailLine.visible && trailFadeUntil) {
      const left = trailFadeUntil - performance.now();
      if (left <= 0) { trailFadeUntil = 0; (trailLine.material                           ).opacity = 0.16; }
      else (trailLine.material                           ).opacity = 0.16 + 0.39 * left / 1600;
    }
    return;
  }
  comet.t += dt / comet.dur;
  const k = Math.min(comet.t, 1);
  if (comet.via && comet.via.length) { // 途经字幕随飞行进度逐门切换
    const n = comet.via.length;
    const idx = Math.min(n - 1, Math.floor(k * n));
    if (idx !== comet.viaIdx) { comet.viaIdx = idx; showTransitCap(comet.via[idx]); }
  }
  const e = comet.dir === 'down' ? Math.pow(k, 2.05) : k * k * k * (k * (6 * k - 15) + 10);
  const a = comet.fromNv.marker.localToWorld(_ca.copy(comet.fromLp));
  const b = comet.toNv.marker.localToWorld(_cb.copy(comet.toLp));
  const span = a.distanceTo(b);
  const arcH = comet.dir === 'down' ? -Math.min(13, span * 0.28 + 3) : Math.min(20, span * 0.34 + 4);
  const inv = 1 - e;
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 + arcH, cz = (a.z + b.z) / 2;
  _cp.set(
    inv * inv * a.x + 2 * inv * e * cx + e * e * b.x,
    inv * inv * a.y + 2 * inv * e * cy + e * e * b.y,
    inv * inv * a.z + 2 * inv * e * cz + e * e * b.z);
  if (comet.dir === 'up' || comet.dir === 'start') { // 升：螺旋上扬，侧向盘旋幅度两端收零
    _h1.subVectors(b, a); _h2.set(0, 1, 0); _h1.cross(_h2);
    if (_h1.lengthSq() > 0.001) {
      _h1.normalize();
      const amp = Math.min(6, span * 0.09) * Math.sin(k * Math.PI);
      _cp.addScaledVector(_h1, Math.sin(k * Math.PI * 3) * amp);
      _cp.y += (1 + Math.cos(k * Math.PI * 3)) * amp * 0.18;
    }
  }
  cometSprite.position.copy(_cp);
  cometSprite.scale.setScalar(4.2 + Math.sin(performance.now() * 0.022) * 0.8);
  // 乘光随行：相机在光点后上方跟飞，把每一掷变成一段小飞行
  if (!rideAbort) {
    _rd.subVectors(b, a).normalize();
    const back = THREE.MathUtils.clamp(span * 0.6, 18, 42);
    const hOff = comet.dir === 'down' ? 16 : (comet.dir === 'up' || comet.dir === 'start') ? 8 : 11;
    _rd.set(_cp.x - _rd.x * back, _cp.y - _rd.y * back * 0.4 + hOff, _cp.z - _rd.z * back);
    camera.position.lerp(_rd, Math.min(1, dt * 2.6));
  }
  for (let i = TRAIL_N - 1; i > 0; i--) {
    trailPos[i * 3] = trailPos[(i - 1) * 3];
    trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
    trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
  }
  trailPos[0] = _cp.x; trailPos[1] = _cp.y; trailPos[2] = _cp.z;
  trailGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < trailGlows.length; i++) {
    const j = Math.min(TRAIL_N - 1, i * 3 + 1);
    trailGlows[i].position.set(trailPos[j * 3], trailPos[j * 3 + 1], trailPos[j * 3 + 2]);
    trailGlows[i].scale.setScalar(1.7);
  }
  controls.target.lerp(_cp, 0.12);
  if (comet.t >= 1) {
    const done = comet.onDone; comet = null;
    cometSprite.visible = false;
    trailGlowsOff();
    landRing.position.copy(b);
    (landRing.material                        ).color.setRGB(trailCol[0], trailCol[1], trailCol[2]);
    landUntil = performance.now() + 700;
    hideTransitCap(900);
    trailFadeUntil = performance.now() + 1600;
    done();
  }
}
function cometStart(fromNv          , fromLp               , toNv          , toLp               , dir        , span        , onDone            , durOv         , via                                    ) {
  let dur = durOv ?? Math.min(1.6, 0.7 + span * 0.008);
  if (via && via.length) dur = Math.max(dur, Math.min(4.4, 1.0 + 1.1 * via.length)); // 越门多则飞得久，字幕来得及读
  if (cometNextQuick) dur *= 0.72;
  cometNextQuick = false;
  comet = { t: 0, dur, dir, fromNv, fromLp, toNv, toLp, onDone, via, viaIdx: -1 };
  cometTint(dir);
  {
    const c = DIR_COMET[dir] || DIR_COMET.up;
    const cf = new THREE.Color(cometNextCols ? cometNextCols[0] : c[1]);
    const ct = new THREE.Color(cometNextCols ? cometNextCols[1] : c[1]);
    cometNextCols = null;
    const tc = new THREE.Color();
    for (let i = 0; i < TRAIL_N; i++) {
      const t = i / (TRAIL_N - 1);
      tc.copy(ct).lerp(cf, t).multiplyScalar(1.15 - t * 0.72);
      if (i < 3) tc.lerp(new THREE.Color(0xffffff), 0.3 * (1 - i / 3));
      trailCol[i * 3] = tc.r; trailCol[i * 3 + 1] = tc.g; trailCol[i * 3 + 2] = tc.b;
    }
    trailGeo.attributes.color.needsUpdate = true;
    for (const g of trailGlows) (g.material                        ).color.setHex(c[1]);
  }
  rideAbort = false; cancelFly();
  const a = fromNv.marker.localToWorld(_ca.copy(fromLp));
  for (let i = 0; i < TRAIL_N; i++) { trailPos[i * 3] = a.x; trailPos[i * 3 + 1] = a.y; trailPos[i * 3 + 2] = a.z; }
  trailGeo.attributes.position.needsUpdate = true;
  (trailLine.material                           ).opacity = 0.55;
  cometSprite.visible = true; trailLine.visible = true;
}
// 乘光随行的交还：行棋中玩家一碰画面即停止跟飞，镜头交回玩家
renderer.domElement.addEventListener('pointerdown', () => { rideAbort = true; });

// ===== 莲台棋子：玩家的棋是一枚常驻莲台，行棋时腾起化光、落位莲瓣一开一合 =====
const pawnG = new THREE.Group();
const pawnMats                               = [];
const pawnPetals                = [];
let pawnHaloMat                      ;
{
  const petalGeo = new THREE.SphereGeometry(1, 7, 5);
  petalGeo.scale(0.34, 0.13, 0.62);
  petalGeo.translate(0, 0, 0.58);
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 7 : 5, rr = ring === 0 ? 1 : 0.64;
    for (let i = 0; i < n; i++) {
      const piv = new THREE.Group();
      piv.rotation.y = (i / n) * Math.PI * 2 + ring * 0.45;
      const tilt = new THREE.Group();
      tilt.userData.ring = ring;
      const m = new THREE.MeshStandardMaterial({
        color: 0xefe0b4, emissive: 0xd7aa45, emissiveIntensity: ring === 0 ? 0.38 : 0.52,
        roughness: 0.55, metalness: 0.1, transparent: true,
      });
      const pt = new THREE.Mesh(petalGeo, m);
      pt.scale.setScalar(rr);
      tilt.position.y = ring * 0.12;
      tilt.add(pt); piv.add(tilt); pawnG.add(piv);
      pawnPetals.push(tilt); pawnMats.push(m);
    }
  }
  const coreM = new THREE.MeshStandardMaterial({
    color: 0xe8c766, emissive: 0xe8c766, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3, transparent: true,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), coreM);
  core.position.y = 0.18; pawnG.add(core); pawnMats.push(coreM);
  pawnHaloMat = new THREE.SpriteMaterial({ map: makeGlow('239,224,180'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 });
  const halo = new THREE.Sprite(pawnHaloMat);
  halo.scale.setScalar(2.8); halo.position.y = 0.35; pawnG.add(halo);
}
pawnG.visible = false; scene.add(pawnG);
function pawnSetOpen(k        ) { // 0=合拢 1=盛开（允微过冲）
  for (const tilt of pawnPetals) {
    const open = tilt.userData.ring === 0 ? -0.30 : -0.62, closed = -1.35;
    tilt.rotation.x = closed + (open - closed) * k;
  }
}
pawnSetOpen(1);
let pawnMode                                       = 'idle';
let pawnT = 0, pawnLandPending = false;
let pawnLandDir = '';      // 落位方向：涧漪金/暗红色语
let hitStopT = 0;          // ③ 落位顿帧（hit-stop）剩余秒数
const _pw = new THREE.Vector3(), _pw0 = new THREE.Vector3();
function pawnSpot()                                          { // 与当前位光晕同一套可见性规则（唯观星不隐：棋子是实体，近观应在场）
  if (!sfpS.pos || sfpTransit) return null;
  const p = SFP_BY[sfpS.pos];
  const nv = byId[p.anchor], lp = sfpBeadLocal[p.id];
  if (!nv || !lp || (!!p.pure !== inPure)) return null;
  nv.marker.localToWorld(_pw.copy(lp)); _pw.y += 0.9;
  return { wp: _pw, s: 1.0 };
}
function pawnHide() { pawnMode = 'gone'; pawnG.visible = false; pawnMats.forEach(m => { m.opacity = 1; }); pawnHaloMat.opacity = 0.5; }
function pawnTakeoff() { // 腾起：莲瓣合拢、旋升化光（随后彗星即是它的光身）
  if (!pawnG.visible || pawnMode === 'takeoff') { if (pawnMode !== 'takeoff') pawnHide(); return; }
  _pw0.copy(pawnG.position);
  pawnMode = 'takeoff'; pawnT = 0;
}
function pawnUpdate(t        , dt        ) {
  if (pawnMode === 'takeoff') {
    pawnT += dt; const k = Math.min(1, pawnT / 0.55);
    pawnG.visible = true;
    pawnG.position.copy(_pw0); pawnG.position.y += k * k * 3.2;
    pawnG.rotation.y += dt * (0.4 + k * 8);
    pawnSetOpen(1 - k);
    const fade = 1 - k * 0.92;
    pawnMats.forEach(m => { m.opacity = fade; });
    pawnHaloMat.opacity = 0.5 * fade + k * 0.5; // 身隐光盛：化光而行
    if (k >= 1) pawnHide();
    return;
  }
  const spot = pawnSpot();
  if (!spot) { pawnG.visible = false; return; }
  if (pawnLandPending) {
    pawnLandPending = false;
    pawnMode = 'land'; pawnT = 0;
    impactAt(spot.wp, spot.s, pawnLandDir === 'down');
    pawnLandDir = '';
    hitStopT = 0.09; // ③ 顿帧一记，落得有分量
    vib(18);
    playVar('wood_medium', 0.18, 0.8);
  }
  pawnG.visible = true;
  let openK = 1, sc = 1, bob = Math.sin(t * 1.7) * 0.22;
  if (pawnMode === 'land') { // 落位：合瓣而降、落稳舒展微过冲
    pawnT += dt; const k = Math.min(1, pawnT / 0.75);
    const c1 = 1.70158, kk = k - 1;
    const back = 1 + (c1 + 1) * kk * kk * kk + c1 * kk * kk;
    openK = 0.08 + 0.92 * Math.max(0, back);
    sc = 0.55 + 0.45 * (1 - Math.pow(1 - k, 3));
    bob = 0;
    if (k >= 1) pawnMode = 'idle';
  } else openK = 1 + Math.sin(t * 1.8) * 0.045; // 安坐微息
  pawnSetOpen(Math.min(openK, 1.18));
  pawnG.position.copy(spot.wp); pawnG.position.y += bob * spot.s;
  pawnG.rotation.y += dt * 0.35;
  pawnG.scale.setScalar(spot.s * sc);
}

// ===== 落位冲击：涟漪扩散 + 尘光溅起 + 镜头微顿 =====
function makeRingTex(size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d') ;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0.55, 'rgba(239,224,180,0)');
  gr.addColorStop(0.72, 'rgba(239,224,180,0.9)');
  gr.addColorStop(0.85, 'rgba(232,199,102,0.35)');
  gr.addColorStop(1, 'rgba(232,199,102,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ringTex = makeRingTex();
const sparkTex = makeGlow('244,230,184', 64);
const impacts                                                                                                            = [];
const impactPool                 = [];
function impactSprite(tex               ) {
  let spr = impactPool.pop();
  if (!spr) {
    spr = new THREE.Sprite(new THREE.SpriteMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    scene.add(spr);
  }
  (spr.material                        ).map = tex;
  spr.visible = true;
  return spr;
}
let fovPunchT = 0;
function impactAt(wp               , s = 1, down = false) {
  const tint = down ? 0xe0704e : 0xffffff; // ③ 降位涧漪暗红，升位金白，不看字也知升降
  const ring = impactSprite(ringTex);
  (ring.material                        ).color.setHex(tint);
  ring.position.copy(wp);
  impacts.push({ spr: ring, t: 0, dur: 0.55, kind: 'ring', s });
  for (let i = 0; i < 10; i++) {
    const sp = impactSprite(sparkTex);
    (sp.material                        ).color.setHex(tint);
    sp.position.copy(wp);
    const a = Math.random() * Math.PI * 2;
    impacts.push({
      spr: sp, t: 0, dur: 0.45 + Math.random() * 0.3, kind: 'spark', s,
      vel: new THREE.Vector3(Math.cos(a) * (3 + Math.random() * 7), 4 + Math.random() * 9, Math.sin(a) * (3 + Math.random() * 7)).multiplyScalar(s),
      g: 30 * s,
    });
  }
  fovPunchT = 0.16; // 镜头微顿半拍
}
function impactUpdate(dt        ) {
  if (fovPunchT > 0) {
    fovPunchT = Math.max(0, fovPunchT - dt);
    const k = 1 - fovPunchT / 0.16;
    camera.fov = 52 - Math.sin(k * Math.PI) * 2.2;
    camera.updateProjectionMatrix();
  }
  for (let i = impacts.length - 1; i >= 0; i--) {
    const im = impacts[i];
    im.t += dt; const k = im.t / im.dur;
    if (k >= 1) { im.spr.visible = false; impactPool.push(im.spr); impacts.splice(i, 1); continue; }
    const mat = im.spr.material                        ;
    if (im.kind === 'ring') {
      im.spr.scale.setScalar((1.6 + k * 11) * im.s);
      mat.opacity = (1 - k) * 0.85;
    } else {
      im.vel .y -= im.g  * dt;
      im.spr.position.addScaledVector(im.vel , dt);
      im.spr.scale.setScalar((1.1 - k * 0.7) * im.s);
      mat.opacity = (1 - k) * 0.95;
    }
  }
}
// 升降语汇：彗星光色随判词方向变表情（升=金、降=赤、横超=白金、安住=灰金）
const DIR_COMET                                   = {
  up: [0xffedb0, 0xe8c766], start: [0xffedb0, 0xe8c766],
  down: [0xff8668, 0xc75840], stay: [0xcfc4a0, 0x9d9170], pure: [0xfff8e2, 0xefe0b4],
};
function cometTint(dir        ) {
  const c = DIR_COMET[dir] || DIR_COMET.up;
  (cometSprite.material                        ).color.setHex(c[0]);
}

function sfpWorldPos(id        , out               ) {
  const p = SFP_BY[id]; const nv = byId[p.anchor]; const lp = sfpBeadLocal[p.id];
  nv.marker.localToWorld(out.copy(lp)); out.y += 1.6; return out;
}
// ---------------- 联机同修珠（至多三位远端莲友，色随座次） ----------------
// 真人远端棋珠沿谱位坐标滑行，不抢本地行棋镜头。
const netBeads = {}; // playerId → { sprite, glide, labelEl, color, pos }
const netLabelLayer = document.createElement('div');
netLabelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden';
app.appendChild(netLabelLayer);
function netBeadOf(p                                            ) {
  let b = netBeads[p.id];
  if (!b) {
    const rgb = (() => { const c = new THREE.Color(p.color || '#96e1d6'); return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`; })();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(rgb), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    sprite.scale.setScalar(2.8); sprite.visible = false; scene.add(sprite);
    const labelEl = document.createElement('div');
    labelEl.style.cssText = `position:absolute;transform:translate(-50%,-140%);font-size:var(--fs-xs);letter-spacing:1px;color:${p.color};text-shadow:0 1px 4px #000;white-space:nowrap;display:none`;
    netLabelLayer.appendChild(labelEl);
    b = netBeads[p.id] = { sprite, glide: null, labelEl, color: p.color, pos: null };
  }
  b.labelEl.textContent = zh(p.name || '同修');
  return b;
}
function netSyncBeads() {
  const seen = new Set        ();
  for (const p of Net.players) {
    if (p.id === Net.myId) continue;
    seen.add(p.id);
    const b = netBeadOf(p);
    if (!p.pos || !SFP_BY[p.pos]) { b.sprite.visible = false; b.labelEl.style.display = 'none'; b.pos = p.pos || null; continue; }
    const to = sfpWorldPos(p.pos, new THREE.Vector3());
    if (b.pos && b.pos !== p.pos && b.sprite.visible) {
      const from = b.sprite.position.clone();
      const d = from.distanceTo(to);
      if (d > 0.5 && d < 900) b.glide = { t: 0, dur: Math.min(2.1, 0.9 + d * 0.004), a: from, b: to, hop: Math.min(15, 4 + d * 0.06) };
      else b.sprite.position.copy(to);
    } else if (!b.glide) b.sprite.position.copy(to);
    b.sprite.visible = true;
    b.pos = p.pos;
  }
  for (const id of Object.keys(netBeads)) {
    if (!seen.has(id)) { // 离房者收珠
      scene.remove(netBeads[id].sprite); netBeads[id].labelEl.remove(); delete netBeads[id];
    }
  }
}
const _nb = new THREE.Vector3();
function netBusy() { // v221 节流的动势判定：远端莲友珠滑行期间放行全帧率（上游无联机，本地补）
  for (const id of Object.keys(netBeads)) if (netBeads[id].glide) return true;
  return false;
}
function netFrame(dt        ) {
  for (const id of Object.keys(netBeads)) {
    const b = netBeads[id];
    if (b.glide) {
      b.glide.t += dt / b.glide.dur;
      const k = Math.min(b.glide.t, 1), ek = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      b.sprite.position.lerpVectors(b.glide.a, b.glide.b, ek);
      b.sprite.position.y += Math.sin(ek * Math.PI) * b.glide.hop;
      if (b.glide.t >= 1) b.glide = null;
    } else if (b.sprite.visible && b.pos && SFP_BY[b.pos]) {
      sfpWorldPos(b.pos, b.sprite.position); // 随锚跟位（沙盘缩放/切场景不掉队）
    }
    // 名牌投影
    if (b.sprite.visible) {
      _nb.copy(b.sprite.position).project(camera);
      const on = _nb.z < 1 && Math.abs(_nb.x) < 1.05 && Math.abs(_nb.y) < 1.05;
      b.labelEl.style.display = on ? '' : 'none';
      if (on) {
        b.labelEl.style.left = ((_nb.x * 0.5 + 0.5) * app.clientWidth) + 'px';
        b.labelEl.style.top = ((-_nb.y * 0.5 + 0.5) * app.clientHeight) + 'px';
      }
    } else b.labelEl.style.display = 'none';
  }
}
// 净土横超／跨门换场：转场页——程序星辰（每次随机生成一页星空，代纯色白光）
const fadeEl = el('<div id="fadeWhite"></div>');
app.appendChild(fadeEl);
const fadeCv = document.createElement('canvas');
fadeCv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
fadeEl.appendChild(fadeCv);
let fadeStars                                                                               = [];
let fadeDots                                                                                           = [];
let fadeAnim = 0, fadeT0 = 0;
let fadeGold = false; // 横超生西：星河转金
const FADE_TINTS = ['#efe0b4', '#f4e6b8', '#e8c766', '#7fb4c9', '#d98873', '#cfd8e3'];
const FADE_GOLD = ['#fff8e2', '#f4e6b8', '#e8c766', '#efe0b4', '#d7aa45', '#ffd98c'];
function fadeStarsGen() {
  const w = fadeEl.clientWidth || 2, h = fadeEl.clientHeight || 2;
  fadeCv.width = w; fadeCv.height = h;
  // 星流：自中心向外加速拉线，转场即穿行星河
  fadeStars = [];
  const tints = fadeGold ? FADE_GOLD : FADE_TINTS;
  const n = Math.round(100 + Math.random() * 40);
  for (let i = 0; i < n; i++) fadeStars.push({
    ang: Math.random() * Math.PI * 2, r0: Math.random(),
    sp: 0.3 + Math.random() * 0.45, ln: 0.6 + Math.random() * 1.2,
    wd: 0.6 + Math.random() * 1.1,
    c: tints[(Math.random() * tints.length) | 0],
  });
  // 远星底：静星微闪，少数带十字苒
  fadeDots = [];
  for (let i = 0; i < 26; i++) fadeDots.push({
    x: Math.random() * w, y: Math.random() * h,
    r: 0.5 + Math.random() * 1.2,
    c: tints[(Math.random() * tints.length) | 0],
    ph: Math.random() * Math.PI * 2, sp: 1.5 + Math.random() * 3,
    glint: Math.random() < 0.18,
  });
}
function fadeStarsDraw() {
  const g = fadeCv.getContext('2d'); if (!g) return;
  const w = fadeCv.width, h = fadeCv.height, t = (performance.now() - fadeT0) / 1000;
  const cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) * 0.62;
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
  if (fadeGold) { rg.addColorStop(0, '#4a3517'); rg.addColorStop(1, '#221708'); }
  else { rg.addColorStop(0, '#2a2340'); rg.addColorStop(1, '#14101f'); }
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  for (const s of fadeDots) {
    const tw = 0.4 + 0.35 * Math.sin(s.ph + t * s.sp);
    g.globalAlpha = tw; g.fillStyle = s.c;
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
    if (s.glint) {
      g.globalAlpha = tw * 0.5;
      g.fillRect(s.x - s.r * 4, s.y - 0.4, s.r * 8, 0.8);
      g.fillRect(s.x - 0.4, s.y - s.r * 4, 0.8, s.r * 8);
    }
  }
  g.lineCap = 'round';
  for (const s of fadeStars) {
    const prog = (s.r0 + t * s.sp) % 1;
    const r = prog * prog; // 由中心向外渐加速
    const dx = Math.cos(s.ang), dy = Math.sin(s.ang);
    const x = cx + dx * r * R, y = cy + dy * r * R;
    const tail = (3 + r * R * 0.09) * s.ln; // 越快尾迹越长
    g.globalAlpha = Math.min(1, 0.1 + r * 1.6);
    g.strokeStyle = s.c; g.lineWidth = s.wd;
    g.beginPath();
    g.moveTo(x - dx * tail, y - dy * tail);
    g.lineTo(x, y);
    g.stroke();
  }
  g.globalAlpha = 1;
}
function fadeStarsLoop() { fadeStarsDraw(); fadeAnim = requestAnimationFrame(fadeStarsLoop); }
// 监听 opacity 开关：亮起时生成并开画，隐去后停画（淡出期间继续画，免星空冻结）
new MutationObserver(() => {
  const on = fadeEl.style.opacity === '1';
  if (on && !fadeAnim) { fadeT0 = performance.now(); fadeStarsGen(); fadeStarsLoop(); }
  else if (!on && fadeAnim) {
    window.setTimeout(() => {
      if (fadeEl.style.opacity !== '1' && fadeAnim) { cancelAnimationFrame(fadeAnim); fadeAnim = 0; fadeGold = false; }
    }, 560);
  }
}).observe(fadeEl, { attributes: true, attributeFilter: ['style'] });
function fadeTransit(mid            , gold = false, hold = 560) {
  setTransit(true);
  fadeGold = gold;
  fadeEl.style.opacity = '1';
  playBell(524, 0.05);
  setTimeout(() => { mid(); fadeEl.style.opacity = '0'; }, hold);
}
// 落位时位名屏中浮现一秒
const posRevealEl = el('<div id="posReveal" class="ui"></div>');
app.appendChild(posRevealEl);
let posRevealT = 0;
function posReveal(name        , dir         , pid         ) {
  void pid; // v319 行棋减噪：白话小句撤（判词卡已讲过，100% 重复）——只留位名大字+方向箭头
  const arrow = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : dir === 'pure' ? '' : dir === 'start' ? '' : '';
  posRevealEl.innerHTML = zh(esc(arrow + name));
  posRevealEl.style.color = dir === 'down' ? '#f0a08c' : '#f4e6b8';
  posRevealEl.style.textShadow = dir === 'down'
    ? '0 0 20px rgba(240,143,122,.85),0 2px 10px #000' : '0 0 20px rgba(215,170,69,.85),0 2px 10px #000';
  posRevealEl.classList.add('show');
  clearTimeout(posRevealT);
  posRevealT = window.setTimeout(() => posRevealEl.classList.remove('show'), 1400);
}

// ── 行棋判词卡（白话优先）：玩家玩游戏不读谱——主句用白话直告，谱曰逐字原文退居「出处」一点即达；不自动关 ──
const verdictEl = el(`<div id="verdict" class="ui panel"><button id="vX" title="收起（棋照行）">✕</button><div id="vTop"><div id="vChips"></div><span id="vN"></span></div><div id="vBody"></div><div id="vWhy"></div><div id="vSrc"></div><button class="gbtn primary" id="vGo"><span id="vGoTxt"></span><i id="vClock"></i></button></div>`);
app.appendChild(verdictEl);
let verdictFn                      = null;
let vdAskCtx                                                                 = null;
let vdOnAsk = false;
function sfpEvidenceLabel(item     )         {
  if (item.type === SFP_EVIDENCE_TYPE.operation) return '本项目操作规则';
  if (item.type === SFP_EVIDENCE_TYPE.interpretation) return '释义';
  return item.subtype === 'rule_fact' ? '行法原文' : '谱曰原文';
}
function sfpEvidencePlainHtml(value     )         {
  return sfpEvidenceItems(value).filter(item => item.type !== SFP_EVIDENCE_TYPE.source).map(item =>
    `<div><b style="color:#d7aa45">${sfpEvidenceLabel(item)}：</b>${glossify(esc(item.text))}</div>`
  ).join('');
}
function sfpEvidenceSourceHtml(value     )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.source).map(item =>
    `<div><b style="color:#d7aa45">${sfpEvidenceLabel(item)}：</b>${glossify(esc(item.text))}` +
      `<span style="display:block;color:#9d9170">——${esc(item.attribution || '蕅益智旭《選佛譜》')}${item.ref ? `；${esc(item.ref)}` : ''}</span></div>`
  ).join('');
}
function sfpEvidenceCompactHtml(value     )         {
  return sfpEvidenceItems(value).map(item =>
    `<small style="display:block;font-size:var(--fs-xs);color:#9d9170;line-height:1.55"><b style="color:#bda660">${sfpEvidenceLabel(item)}：</b>${esc(item.text)}</small>`
  ).join('');
}
function sfpEvidenceInterpretationText(value     )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.interpretation).map(item => item.text).join(' ');
}
function sfpEvidenceOperationText(value     )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.operation).map(item => item.text).join(' ');
}
function sfpEvidenceCites(value     , pid        , juan        )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.source).map(item =>
    rdCite(`${sfpEvidenceLabel(item)}${item.ref ? ` · ${item.ref}` : ''}`, pid, item.text, juan)
  );
}
function showVerdict(body        , why                                      , goLabel        , fn            , combo         , destId         , askQ         , dirKey         , light          ) {
  void light;
  if (dirKey) verdictEl.dataset.dir = dirKey; else delete verdictEl.dataset.dir;
  if (destId && SFP_BY[destId] && SFP_BY[destId].door !== (sfpS.pos && SFP_BY[sfpS.pos] ? SFP_BY[sfpS.pos].door : -1)) { // v264 天梯联动；v319 只跨门时闪（闪的本义是提示空间跨越，同门位移不闪）
    const lr = ladder.querySelector(`.ladDoor[data-d="${SFP_BY[destId].door}"]`)                      ;
    if (lr) { lr.classList.remove('fl'); void lr.offsetWidth; lr.classList.add('fl'); window.setTimeout(() => lr.classList.remove('fl'), 1400); }
  }
  // 拆字字牌：只留轮字＋善惡小标；卷首通义收进点击（点字弹词典）——六字诸门诸位取义各异，取义以谱曰/谱注为准
  const chipsEl = verdictEl.querySelector('#vChips')               ;
  if (combo) {
    chipsEl.innerHTML = combo.split('').map((ch, i) => {
      const good = !'那謨'.includes(ch);
      const lbl = (SFP_PLAIN[ch] || '').replace(/^表/, '').replace(/（.*）/, '');
      const gi = GLS_IDX[lbl];
      return `<span class="vchip ${good ? 'g' : 'e'}"><b${gi !== undefined ? ` class="gls" data-g="${gi}"` : ''} data-i="${i}"></b><i>${zh(good ? '善 ↑' : '惡 ↓')}</i></span>`;
    }).join('');
    chipsEl.querySelectorAll('b').forEach((b, i) => { b.textContent = combo[i]; }); // 轮字用原字，不随简繁转换
    chipsEl.style.display = 'flex';
  } else chipsEl.style.display = 'none';
  (verdictEl.querySelector('#vN')               ).textContent = zh(`第 ${sfpS.n} 掷`);
  (verdictEl.querySelector('#vBody')               ).innerHTML = zh(body);
  // v225 用户定案：白话为主体（永不以原文当主句），原文小字直陈卡内作依据
  const wEl = verdictEl.querySelector('#vWhy')               ;
  const sEl = verdictEl.querySelector('#vSrc')               ;
  verdictEl.classList.remove('src');
  const whyEvidence = typeof why === 'string' ? makeSfpInterpretationEvidence(why) : why;
  const plain = sfpEvidencePlainHtml(whyEvidence);
  const orig = sfpEvidenceSourceHtml(whyEvidence);
  // v226 用户点单：去处白话句撤（位名可点弹签已覆盖）；谱曰原文收进「点开再读」
  const srcT = orig ? `<span class="vsrcT">原文 ▸</span>` : '';
  wEl.innerHTML = zh(plain ? `${plain}${srcT ? ' ' + srcT : ''}` : srcT);
  wEl.style.display = (plain || orig) ? '' : 'none';
  wEl.classList.remove('full');
  const tEl = wEl.querySelector('.vsrcT')                      ;
  if (tEl) tEl.onclick = (e) => { e.stopPropagation(); verdictEl.classList.toggle('src'); wEl.classList.add('full'); };
  sEl.innerHTML = orig ? zh(orig) : '';
  // v226 位名可点弹白话小签（签内可入原文说明）；AI 解读小签缀在位名同行——工具行退役
  const bEl = verdictEl.querySelector('#vBody')               ;
  vdAskCtx = askQ ? { c: combo || '', from: sfpS.pos || '', to: destId || '', evidence: whyEvidence || null } : null;
  if (askQ) {
    const chip = document.createElement('span');
    chip.className = 'vaskC'; chip.textContent = zh('AI 解读');
    bEl.appendChild(chip);
  }
  verdictEl.querySelectorAll('#vBody .vdst').forEach(v => {
    (v               ).style.cssText += ';border-bottom:1px dotted rgba(215,170,69,.55);cursor:pointer';
    (v               ).onclick = destId ? (e) => { e.stopPropagation(); openPosGloss(destId, (v               ).getBoundingClientRect()); } : null;
  });
  (verdictEl.querySelector('#vGoTxt')               ).textContent = zh(goLabel);
  // 停靠在控制台正上方（实测控制台高度），不遮掷轮钮
  verdictEl.style.bottom = `calc(${20 + sfpBar.offsetHeight}px + env(safe-area-inset-bottom))`;
  sfpBar.classList.add('vd');
  verdictEl.classList.remove('min');
  verdictEl.classList.add('show');
  verdictFn = fn;
  // v319：判词木鱼撤——每掷双响合并为一响（方向音在行棋提交时 sfpShowMsg 处播）
}
function pauseVerdict() { // 点面板正文＝展开白话全句＋谱曰原文细读（判词不自动关，想看多久看多久）
  (verdictEl.querySelector('#vWhy')               ).classList.add('full');
  if ((verdictEl.querySelector('#vSrc')               ).innerHTML) verdictEl.classList.add('src');
}
function commitVerdict() {
  const f = verdictFn; verdictFn = null;
  sfpBar.classList.remove('vd');
  if (!f) { verdictEl.classList.remove('show', 'paused', 'min', 'src'); return; }
  // ① 承接拍：判词窗收光入轮相牌、牌面脉冲一记，再起飞（不再瞬切）
  const vr = verdictEl.getBoundingClientRect();
  const fp = sfpFaceEls[0].parentElement               ;
  const fr = fp.getBoundingClientRect();
  verdictEl.style.setProperty('--zx', ((fr.left + fr.width / 2) - (vr.left + vr.width / 2)) + 'px');
  verdictEl.style.setProperty('--zy', ((fr.top + fr.height / 2) - (vr.top + vr.height / 2)) + 'px');
  verdictEl.classList.add('zap');
  window.setTimeout(() => {
    verdictEl.classList.remove('show', 'paused', 'min', 'zap', 'src');
    verdictEl.style.removeProperty('--zx'); verdictEl.style.removeProperty('--zy');
    fp.classList.remove('pulse'); void fp.offsetWidth; fp.classList.add('pulse');
    f();
  }, 300);
}
function cancelVerdict() {
  verdictFn = null; verdictEl.classList.remove('show', 'paused', 'min', 'zap', 'src');
  verdictEl.style.removeProperty('--zx'); verdictEl.style.removeProperty('--zy');
  sfpBar.classList.remove('vd');
}
let vdY0 = -1, vdSwipeT = 0;
verdictEl.addEventListener('pointerdown', (e) => {
  vdY0 = e.clientY;
  const t = e.target               ; vdOnAsk = !!(t.closest && t.closest('.vaskC'));
});
verdictEl.addEventListener('pointerup', (e) => { // 下滑收成一条细签，上滑/点签唤回（判词仍不自动关）
  if (vdY0 < 0) return;
  const dy = e.clientY - vdY0; vdY0 = -1;
  if (vdOnAsk) {
    vdOnAsk = false;
    if (Math.abs(dy) < 36 && vdAskCtx) { vdSwipeT = performance.now(); playSfx('sfx-tap', 0.25); openTossReading(vdAskCtx); }
    return;
  }
  if (dy > 36) { verdictEl.classList.add('min'); vdSwipeT = performance.now(); vib(6); }
  else if (dy < -36) { verdictEl.classList.remove('min'); vdSwipeT = performance.now(); }
});
verdictEl.addEventListener('click', (e) => {
  e.stopPropagation();
  if ((e.target               ).closest && (e.target               ).closest('.vaskC')) return;
  if (performance.now() - vdSwipeT < 400) return;
  if (verdictEl.classList.contains('min')) { verdictEl.classList.remove('min'); return; }
  pauseVerdict();
});
(verdictEl.querySelector('#vGo')               ).addEventListener('click', (e) => { e.stopPropagation(); commitVerdict(); });
(verdictEl.querySelector('#vX')               ).addEventListener('click', (e) => { e.stopPropagation(); commitVerdict(); });
// v225 谱曰出处钮退役：原文小字直陈判词卡内（白话在上、原文为据）

// ── 成佛天梯：十五门竖向刻度，金珠=您、青珠=同修；点开全谱 ──
const ladder = el(`<div id="ladder" class="ui" title="十五门 · 成佛天梯"><span id="ladTop">佛</span><div id="ladTrack">${Array.from({ length: 16 }, (_, i) => `<i style="bottom:${(i * 100 / 15).toFixed(2)}%"></i>`).join('')}</div>${Array.from({ length: 15 }, (_, i) => {
  const n = i + 1;
  const col = '#' + new THREE.Color(SFP_DOOR_COLOR[n] ?? 0xd7aa45).lerp(new THREE.Color(0xfaf3da), i / 14 * 0.42).getHexString();
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'][i];
  return `<div class="ladDoor" data-d="${n}" title="${SFP_DOOR_BY[n] ? SFP_DOOR_BY[n].title : ''}" style="bottom:${(i * 100 / 15).toFixed(2)}%"><b>${cn}</b><i style="background:${col};color:${col}"></i></div>`;
}).join('')}<div id="ladName"></div><span id="ladBot">因</span></div>`);
app.appendChild(ladder);
ladder.classList.add('show'); // 签栏常驻（v143）：十五门标识不入地图，就在此栏
// 科名导航（v161 用户反馈右杆难发现：改顶部横排彩签条，转场滑入、居中显眼、窄屏横滑）——只在菩萨道场显示
const BODHI_NAV_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 自左而右由低到高：慧学位→圆教六即
const bodhiNav = el(`<div id="bodhiNav" class="ui">${BODHI_NAV_ORDER.map(g =>
  `<div class="bnv" data-g="${g}" style="color:#${BODHI_GRPS[g].color.toString(16).padStart(6, '0')}"><b>${zh(BODHI_GRPS[g].name)}</b><i></i></div>`).join('')}</div>`);
app.appendChild(bodhiNav);
function bodhiNavSync() {
  bodhiNav.querySelectorAll('.bnv').forEach(n => n.classList.toggle('on', Number((n               ).dataset.g) === bodhiGrp));
  const on = bodhiNav.querySelector('.bnv.on');
  if (on) try { on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch { }
}
bodhiNav.querySelectorAll('.bnv').forEach(n => n.addEventListener('click', () => {
  setBodhiGrp(Number((n               ).dataset.g));
}));
// 色界禅层签条（v166）：四签自左而右由低到高，签色取各层云盘色
const SKY_NAV_DEF                                  = [['初禅', '#d7aa45', '离生喜乐'], ['二禅', '#e5c77a', '定生喜乐'], ['三禅', '#f0e0a8', '离喜妙乐'], ['四禅', '#f6f0da', '舍念清净']]; // v223 签名极简：只写初禅…四禅；禅支小字随签（竖杆内改行内缀排，不作块级）
const skyNav = el(`<div id="skyNav" class="ui">${SKY_NAV_DEF.map(([nm, c, sub], i) =>
  `<div class="bnv" data-g="${i + 1}" style="color:${c}"><b>${zh(nm)}<span class="bnvSub">${zh(sub)}</span></b><i></i></div>`).join('')}</div>`);
app.appendChild(skyNav);
function skyNavSync() {
  skyNav.querySelectorAll('.bnv').forEach(n => n.classList.toggle('on', Number((n               ).dataset.g) === skySel));
}
skyNav.querySelectorAll('.bnv').forEach(n => n.addEventListener('click', () => { playSfx('sfx-tap', 0.2); setSkySel(Number((n               ).dataset.g)); }));
// 签栏点门：单击＝本门全亮（镜头框位珠云、无关题字全隐），再点＝收拢；双击＝入门内观照；净土门＝极乐链路
let railLT = 0, railLD = 0;
function railDoorTap(dno        , dbl         ) {
  playSfx('sfx-tap', 0.22);
  if (DISC_DOORS.has(dno)) { // v315/v322 谱页专场：签栏点门同样转场；场内再点本门＝出，点他页门＝就地换页
    if (inDisc) {
      if (discDoor === dno) { if (performance.now() - discEnterT > 600) returnSaha(); return; }
      buildDisc(dno); showDoorIntro(dno); discEnterT = performance.now();
      return;
    }
    enterDiscTransit(dno);
    return;
  }
  if (dno === 14) { // 净土门签＝入极乐并亮十三正因；场内再点＝收/展（场即其门）
    if (!inPure) { if (inSky || inBodhi) returnSaha(); enterPureTransit(); setBrowseDoor(14); }
    else if (browseDoor === 14) setBrowseDoor(0); else setBrowseDoor(14);
    return;
  }
  if (dbl) { enterDoor(dno, sfpS.pos && SFP_BY[sfpS.pos].door === dno ? sfpS.pos : undefined, 'fly'); return; }
  if (inDoor === dno) { exitDoor(true); return; }
  if (browseDoor === dno) { setBrowseDoor(0); showToast(`「${SFP_DOOR_BY[dno].title}」已收拢`); return; }
  if (inPure) returnSaha();
  if (inSky && dno !== 5 && dno !== 8) returnSaha(); // 色界两门在场内看亦通，余门先回娑婆
  setBrowseDoor(dno);
  const f = doorFly[dno];
  if (f) {
    const dir2 = camera.position.clone().sub(f.c).setY(0); if (dir2.lengthSq() < 1) dir2.set(1, 0, 1); dir2.normalize();
    const dist = THREE.MathUtils.clamp(f.r * 2.1, 34, 300);
    flyTo(f.c.clone().addScaledVector(dir2, dist).add(new THREE.Vector3(0, dist * 0.32, 0)), f.c, 1.1);
  }
  showToast(`「${SFP_DOOR_BY[dno].title}」全亮——位次依经典坐标布于诸界；点小珠读谱注，双击门签入门内观照`, 3600);
}
ladder.querySelectorAll('.ladDoor').forEach(item => {
  const dno = Number((item               ).dataset.d);
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = performance.now(); const dbl = dno === railLD && t - railLT < 350;
    railLT = dbl ? 0 : t; railLD = dno;
    railDoorTap(dno, dbl);
  });
});
function updateLadder() {
  const act = inDoor || browseDoor;
  const cur = sfpS.active && sfpS.pos ? SFP_BY[sfpS.pos].door : 0;
  ladder.querySelectorAll('.ladDoor').forEach(e2 => {
    const dn = Number((e2               ).dataset.d);
    e2.classList.toggle('on', dn === act);
    e2.classList.toggle('cur', dn === cur);
    e2.classList.remove('aic');
  });
  const nameEl = ladder.querySelector('#ladName')               ;
  if (act && SFP_DOOR_BY[act]) {
    nameEl.style.display = 'block';
    nameEl.style.bottom = `calc(${((act - 0.5) * 100 / 15).toFixed(2)}% - 11px)`;
    nameEl.textContent = SFP_DOOR_BY[act].title; // 门题用原字不随简繁转换（同旧门题字定案）
  } else nameEl.style.display = 'none';
}
ladder.addEventListener('click', () => { if (sfpS.active) openSfpMap(); });
ladderSync = updateLadder;
updateLadder();

function sfpLocate(pid        ) {
  const p = SFP_BY[pid]; if (!p) return;
  if (DISC_DOORS.has(p.door) && !p.pure) { // v316/v322 定位谱页门位＝入页亮珠（无地理坐标）
    if (inDisc) discLand(pid); else enterDiscTransit(p.door, pid);
    return;
  }
  if (inBodhi || inDisc) returnSaha(); // 专场内定位他界：先回娑婆坐标语境
  setConMin(false);
  exitStarView(false);
  // 门内：同门位直接门内飞近；别门位先出门回星图再定位
  if (inDoor) {
    if (!p.pure && p.door === inDoor && doorPlanets[p.id]) { const v = doorViewFor(p.id); flyTo(v.pos, v.target, 1.0); return; }
    exitDoor(false);
  }
  // 定位别门位：顺手展开该门（展开常驻，点门星可收）
  if (!p.pure && p.door !== focusDoorA && p.door !== browseDoor) setBrowseDoor(p.door);
  if (p.pure && !inPure) enterPure();
  if (!p.pure && inPure) returnSaha();
  if (inSky && !SKY_IDS.has(p.anchor)) returnSaha(); // 色界场内定位非色界珠：先回娑婆
  const nv = byId[p.anchor]; const lp = sfpBeadLocal[pid];
  if (!nv || !lp) return;
  nv.marker.add(locGlow);
  locGlow.position.copy(lp);
  locGlow.visible = true; locUntil = performance.now() + 3200;
  const wp = nv.marker.localToWorld(lp.clone());
  const dir = camera.position.clone().sub(wp).setY(0);
  if (dir.lengthSq() < 1) dir.set(1, 0, 1);
  dir.normalize();
  flyTo(wp.clone().addScaledVector(dir, 30).add(new THREE.Vector3(0, 9, 0)), wp);
  showToast(`已定位「${p.name}」——第${SFP_CN[p.door - 1]}门；点小珠可读谱注`);
}

// 控制台＝两行制（2026-07-28 重设计）：
//   行一「状态」——左轮相牌（点开行迹）、右现居位名与掷数（点开位卡，长按飞回棋子）；棋讯瞬时借用同一行。
//   行二「操作」——掷轮为主，聊／问／⋯ 为辅。
// 原先六层里有四层是死的：#sfpTop 被 display:none!important 钉死、#sfpDoors 与右侧天梯重复报十五门、
// #sfpName 与 #sfpMsg 从未显示（sfpShowMsg 一直在往看不见的元素里写，连「消息回看」都点不到）。
const sfpBar = el(`<div id="sfpBar" class="ui panel">
  <div id="sfpState" style="display:none">
    <div id="sfpFaces" title="上一掷轮相 · 点看本局行迹" style="display:none"><i class="fcap">上一掷</i><b></b><b></b></div>
    <div id="sfpName" title="点击读本位谱注 · 长按飞回棋子"></div>
  </div>
  <div id="sfpBtns">
    <button class="gbtn primary" id="sfpRoll" style="flex:1;min-height:52px;font-size:var(--fs-lg);font-weight:700;letter-spacing:2px;position:relative"><span id="rollTxt">长按掷轮</span><span id="rollBn"></span><span id="rollRing"></span></button>
    <button class="gbtn netEntry" id="sfpChat" style="min-height:52px;padding:8px 11px" title="同修 · 名单与聊天" aria-label="打开共修聊天与成员"><span class="netDots"></span><span class="chatLabel">聊</span><i class="netUnread"></i></button>
    <button class="gbtn" id="sfpAsk" style="min-height:52px;padding:8px 15px;font-size:var(--fs-lg)" title="问 · 与本谱对话（本地检证）">问</button>
    <button class="gbtn" id="sfpMore" style="min-height:52px;padding:8px 15px;font-size:var(--fs-xl)" title="谱务菜单">⋯</button></div>
  <div id="conMinBtn" title="收起控制台（缩为右下角掷轮钮）">—</div></div>`);
app.appendChild(sfpBar);
(sfpBar.querySelector('#sfpChat')               ).addEventListener('click', () => Net.togglePanel());
const conPill = el('<div id="conPill" class="ui" title="展开掷轮控制台"><span>掷</span><span>轮</span></div>');
app.appendChild(conPill);
// 控制台收起态两轨（v158 用户点单）：conMin＝观全图自动收起（归位/落位即自动恢复）；
// conUser＝手动收纳成右下角「掷轮」圆徽（持久存档，只有再点圆徽才展开）
let conMin = false;
let conUser = localStorage.getItem('sfp_con_min') === '1';
function applyConVis() {
  const hid = conMin || conUser;
  if (sfpS.active) {
    sfpBar.classList.toggle('show', !hid);
    conPill.classList.toggle('show', hid);
  } else conPill.classList.remove('show');
}
function setConMin(v         ) {
  conMin = v;
  applyConVis();
}
(sfpBar.querySelector('#sfpFaces')               ).addEventListener('click', () => { // v327 轮相牌从伪钮正名为真钮：点开本局行迹
  if (sfpS.rolling || sfpTransit) return;
  playSfx('sfx-tap', 0.2); openSfpTrail();
});
(sfpBar.querySelector('#conMinBtn')               ).addEventListener('click', (e) => {
  e.stopPropagation();
  conUser = true; localStorage.setItem('sfp_con_min', '1');
  applyConVis();
  showToast('控制台已收起——点右下角「掷轮」随时展开', 2600);
});
conPill.addEventListener('click', () => {
  conUser = false; conMin = false; localStorage.setItem('sfp_con_min', '0');
  applyConVis();
});
const sfpDice = el('<div id="sfpDice" class="ui"><i id="sfpChant" style="font-style:normal"></i></div>');
app.appendChild(sfpDice);

// ---- 占察木轮（依卷首「輪相表法第一」：輪如占察輪相而作六面，
// 以那謨阿彌陀佛六字顺次右旋刻于六面，置輪掌心仰手旁掷） ----
function drawWheelFaces(cv                   ) {
  const cx = cv.getContext('2d') ;
  for (let k = 0; k < 6; k++) {
    const x0 = k * 128;
    // 木色基底，逐面明暗微变（棱面光影烙进贴图）
    const shade = 0.82 + 0.18 * Math.abs(Math.sin(k * 1.1 + 0.6));
    cx.fillStyle = `rgb(${Math.round(158 * shade)},${Math.round(104 * shade)},${Math.round(46 * shade)})`;
    cx.fillRect(x0, 0, 128, 256);
    cx.strokeStyle = 'rgba(90,56,22,0.5)'; cx.lineWidth = 2;
    for (let g = 0; g < 4; g++) { // 木纹
      cx.beginPath(); cx.moveTo(x0 + 14 + g * 30 + Math.sin(k + g) * 6, 0);
      cx.bezierCurveTo(x0 + 10 + g * 30, 90, x0 + 22 + g * 30, 170, x0 + 14 + g * 30, 256); cx.stroke();
    }
    cx.strokeStyle = 'rgba(58,28,14,0.85)'; cx.lineWidth = 3;
    cx.strokeRect(x0 + 1.5, 1.5, 125, 253); // 棱缝
    // 刻字（正立——轮竖立时字端正朝外）
    cx.save(); cx.translate(x0 + 64, 128);
    cx.font = '600 88px "SmileySans","PingFang SC","Microsoft YaHei",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = 'rgba(244,230,184,0.45)'; cx.fillText(SFP_ORDER[k], 2, 3); // 刻痕高光
    cx.fillStyle = '#341a0e'; cx.fillText(SFP_ORDER[k], 0, 0);
    cx.restore();
  }
}
let sfpWheelTex                             = null;
function makeWheelTexture()                      {
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 256;
  drawWheelFaces(cv);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  sfpWheelTex = tex;
  return tex;
}
scene.add(camera); // 轮在相机空间投掷（HUD 物体）
const sfpWheelGroup = new THREE.Group();
sfpWheelGroup.visible = false;
camera.add(sfpWheelGroup);
sfpWheelGroup.position.set(0, 0.1, -8.5);
                                                                                                        
const sfpWheels             = [];
sfpWheelGroup.scale.setScalar(0.85); // 掷时轮相要看得清楚（静场暗纱中心已透，轮体适当放大）
{
  const tex = makeWheelTexture();
  const endMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, emissive: 0x5a3a1c, emissiveIntensity: 0.6, flatShading: true, roughness: 0.7 });
  // 上锥：中身：下锥 = 1:1:1（正中方平刻字、两头斜渐去之——占察轮制，三段等分）
  const SEG = 1.3;
  [-1.75, 1.75].forEach(x => {
    const w = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, SEG, 6, 1, true),
      new THREE.MeshBasicMaterial({ map: tex }));
    w.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.62, SEG, 6), endMat);
    top.position.y = SEG; w.add(top);
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.62, SEG, 6), endMat);
    bot.rotation.x = Math.PI; bot.position.y = -SEG; w.add(bot);
    w.position.x = x;
    sfpWheelGroup.add(w);
    sfpWheels.push({ mesh: w, axis: new THREE.Vector3(1, 0, 0), speed: 0, targetQ: new THREE.Quaternion() });
  });
}
// 掌心光（置轮掌心时的托轮）
const palmGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow('232,200,122', 256), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
}));
palmGlow.scale.set(8, 3.2, 1); palmGlow.position.set(0, -1.55, -0.5); palmGlow.visible = false;
sfpWheelGroup.add(palmGlow);
// 定相金光：轮相落定一瞬的微光润开
const settleGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow('232,200,122', 256), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
}));
settleGlow.scale.set(7, 4, 1); settleGlow.position.set(0, 0, -0.6); settleGlow.visible = false;
sfpWheelGroup.add(settleGlow);
// 轮竖立：绕竖轴旋至第 face 面正对观者
function wheelFaceQuat(face        )                   {
  const th = (face + 0.5) * Math.PI / 3;
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -th);
}
let wheelAnim                                                                                 = null;
// v315 竖屏适配：双轮阵半宽≈轮心1.75＋轮体对角 0.95；按横向视野收敛组缩放，两轮始终全入镜不裁边
function wheelFitScale() {
  const cvs = renderer.domElement;
  const aspect = cvs.clientWidth / Math.max(1, cvs.clientHeight);
  const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 8.5 * aspect;
  const s = Math.min(0.85, (halfW * 0.72) / 2.7); // 0.72＝竖屏留边余量（轮面近端透视放大＋起手侧移都吃不穿）
  wheelLat = Math.max(0.12, Math.min(0.9, halfW - 2.7 * s - 0.05)); // 起手侧倾的横移余量同步收敛
  return s;
}
let wheelLat = 0.9;
// 置轮掌心：二轮竖立掌上微息，至心称念
let palmY = -1.45;
function startWheelPalm() {
  playVar('wood_light', 0.3, 1.12); // 置轮入掌：木质轻叩
  sfpWheelGroup.scale.setScalar(wheelFitScale());
  // 掌心高度：动态置于行动栏顶边之上（免被栏遮）
  const r = renderer.domElement.getBoundingClientRect();
  const b = sfpBar.getBoundingClientRect();
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 8.5;
  const barTop = (1 - 2 * ((b.top - r.top) / Math.max(1, r.height))) * half;
  palmY = Math.max(-half + 1.4, Math.min(-0.3, barTop + 2.0));
  sfpWheels.forEach(w => {
    w.mesh.quaternion.copy(wheelFaceQuat(Math.floor(Math.random() * 6)));
    w.mesh.position.y = 0;
  });
  sfpWheelGroup.position.set(0, palmY, -8.5);
  sfpWheelGroup.rotation.z = 0;
  sfpWheelGroup.visible = true;
  palmGlow.visible = true;
  settleGlow.visible = false; (settleGlow.material                        ).opacity = 0;
  wheelAnim = { phase: 'palm', t: 0, fired: false, done: () => {} };
}
// 仰手旁掷：轮竖立，依「六字順次右旋」——绕竖轴自左向右徐徐旋转减速，停在得字面
function startWheelToss(fa        , fb        , done            ) {
  playVar('wood_light', 0.34, 0.88); // 旁掷起转
  window.setTimeout(() => playVar('wood_medium', 0.3, 1.05), 1450); // 轮相落定轻叩
  [fa, fb].forEach((f, i) => {
    const w = sfpWheels[i];
    w.targetQ = wheelFaceQuat(f);
    // 总旋角取正：随缓动归零即反向回收——观者所见面从左向右转过（右旋）；二轮同向微差
    w.speed = (Math.PI * 2) * (2.2 + i * 0.45 + Math.random() * 0.5);
    w.mesh.position.y = 0;
  });
  sfpWheelGroup.visible = true;
  sfpWheelGroup.scale.setScalar(wheelFitScale()); // 旁掷时再同步一次（掌上旋转中用户可能转屏）
  wheelAnim = { phase: 'toss', t: 0, fired: false, done };
}
const _wq = new THREE.Quaternion();
const _wy = new THREE.Vector3(0, 1, 0);
function updateWheelToss(dt        ) {
  if (!wheelAnim) return;
  wheelAnim.t += dt;
  const t = wheelAnim.t;
  if (wheelAnim.phase === 'palm') {
    // 掌上微息：轮身轻浮微转（活物感），掌心光随念呼吸
    sfpWheels.forEach((w, i) => {
      w.mesh.position.y = Math.abs(Math.sin(t * 2.2 + i * 1.7)) * 0.1;
      _wq.setFromAxisAngle(_wy, dt * (0.3 + i * 0.12));
      w.mesh.quaternion.premultiply(_wq);
    });
    (palmGlow.material                        ).opacity =
      Math.min(0.3 + t * 0.1, 0.5) + Math.sin(t * 2.2) * 0.12;
    return;
  }
  const T2 = 1.5;
  const p = Math.min(t / T2, 1), ep = 1 - Math.pow(1 - p, 3);
  // 位移：自掌心缓缓浮升至帧心，微弧而不甩；落定后带一丝阻尼余沉
  const st = Math.max(0, t - T2);
  const dip = st > 0 ? -0.06 * Math.exp(-6 * st) * Math.sin(14 * st) : 0;
  const lift = Math.sin(Math.min(t / 0.5, 1) * Math.PI) * 0.35;
  sfpWheelGroup.position.set(-wheelLat * (1 - ep), palmY + (0.05 - palmY) * ep + lift + dip, -8.5);
  sfpWheelGroup.rotation.z = 0.15 * (1 - ep); // 旁掷腕势：起手侧倾，随定住回正
  (palmGlow.material                        ).opacity = Math.max(0, 0.5 - t * 1.6);
  if (t > 0.4) palmGlow.visible = false;
  // 落定余振：得字面定住后绕竖轴轻轻一颌即止（幅度极小，不改得面）
  const wob = st > 0 ? 0.09 * Math.exp(-5 * st) * Math.sin(16 * st) : 0;
  sfpWheels.forEach((w, i) => {
    w.mesh.position.y *= Math.max(0, 1 - t * 4);
    // 令使易转：剩余旋角随缓动归零，轮身始终竖立右旋，不乱翻
    _wq.setFromAxisAngle(_wy, w.speed * (1 - ep) + wob * (i === 0 ? 1 : -1));
    w.mesh.quaternion.copy(w.targetQ).premultiply(_wq);
  });
  if (p >= 1 && !wheelAnim.fired) {
    wheelAnim.fired = true;
    settleGlow.visible = true; settleGlow.scale.set(7, 4, 1);
    wheelAnim.done();
  }
  if (wheelAnim.fired) { // 定相金光润开即逸
    (settleGlow.material                        ).opacity = Math.max(0, 0.42 - st * 0.9);
    settleGlow.scale.set(7 + st * 7, 4 + st * 3.5, 1);
  }
  if (t >= T2 + 0.85) {
    sfpWheelGroup.visible = false; sfpWheelGroup.rotation.z = 0;
    settleGlow.visible = false; (settleGlow.material                        ).opacity = 0;
    wheelAnim = null;
  }
}
const sfpStateEl = sfpBar.querySelector('#sfpState')               ;
const sfpNameEl = sfpBar.querySelector('#sfpName')               ;
const sfpFaceEls = sfpBar.querySelectorAll('#sfpFaces b')                           ;

function sfpComboKey(a        , b        ) {
  return canonicalSfpCombo(a, b);
}
const SFP_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
// 状态行：现居位名＋掷数。门名不在此复述——右侧天梯常驻报十五门，位卡里也有。
let sfpMsgHold = 0;
function sfpNameHtml() {
  const p = sfpS.pos ? SFP_BY[sfpS.pos] : null;
  return p
    ? zh(`${esc(p.name)}<span class="nSub">第 ${sfpS.n} 掷</span>`)
    : zh('未起行<span class="nSub">先掷發始因地</span>');
}
function sfpStatus() {
  sfpStateEl.style.display = sfpS.active ? '' : 'none';
  if (!sfpMsgHold) {                       // 棋讯正占着这一行时不抢回去
    sfpNameEl.classList.remove('msg');
    sfpNameEl.innerHTML = sfpNameHtml();
  }
  updateLadder();
  syncRollGlow();
  updateModeChip();
}
function updateModeChip() { /* 模式钮已删，题字即总入口；保留空函数免动各调用点 */ }
function sfpSave() {
  if (Net.active) return; // 联机棋况只认服务器快照，不写入/恢复个人本地谱局
  save.sfp = sfpS.pos && !SFP_BY[sfpS.pos].terminal
    ? { pos: sfpS.pos, n: sfpS.n, hist: sfpHist.slice(-40), seenD: sfpS.seenD.slice(), trail: sfpS.trail.slice(-200) }
    : null;
  persist();
}
// 行迹：本局每一掷的升沉记录
let sfpHist                                                                                 = [];
function sfpLog(combo        , txt        , dir         , f         , to         ) {
  sfpHist.push({ n: sfpS.n, c: combo, t: txt, d: dir || '', f, to }); // f/to 存位 id，供问义还原「从 A 到 B」语境
}
// V90 行迹走势引文：逐字取自本项目 canon；走势只陈述可数事实，义理与出处另层呈现。
const JOURNEY_CITE                                                        = {
  heng: {
    t: '是故設依自修行力。則四教並名豎入。唯依阿彌陀佛願力。始可橫超也。',
    p: '若依自己修行之力，藏、通、别、圆四教都叫「竖入」（逐位拾登）；唯有依阿弥陀佛愿力，才能「横超」。',
    src: '卷第六 · 淨土橫超門總說',
  },
  tui: {
    t: '然亦永離退緣。遠勝非非想處多矣。',
    p: '（生彼国者）永远离了退堕之缘，远胜于非想非非想处。',
    src: '卷第六 · 淨土疑城譜注',
  },
  you: {
    t: '深念此圖利益。能使人即遊戲間。頓知六道往還之疲苦。三乘出要之差別。誠為不可思議。',
    p: '深思此图的利益：能让人就在游戏之间，顿时知道六道往还的疲苦、三乘出离要道的差别，实在不可思议。',
    src: '卷第一 · 敘選佛譜敘',
  },
  ming: {
    t: '一聞佛名。皆得不退轉於無上正等正覺。一稱佛名。能滅八十億劫生死重罪。',
    p: '一听闻佛名，就于无上正等正觉得不退转；一声称念佛名，能灭八十亿劫生死重罪。',
    src: '卷第一 · 輪相表法第一',
  },
};
function sfpJourneySummary() {
  if (sfpHist.length < 4) return '';
  const H = sfpHist.slice(-12);
  let up = 0, down = 0, stay = 0, pure = 0, bonus = 0;
  H.forEach(h => {
    if (h.d === 'up') up++; else if (h.d === 'down') down++;
    else if (h.d === 'stay') stay++; else if (h.d === 'pure') pure++;
    else if (!h.d) bonus++;
  });
  let upStk = 0, dnStk = 0;
  for (let i = H.length - 1; i >= 0; i--) {
    const d = H[i].d; if (!d) continue;
    if (d === 'up' && dnStk === 0) upStk++;
    else if (d === 'down' && upStk === 0) dnStk++;
    else break;
  }
  const seen                         = {}; let loopName = '';
  H.forEach(h => { if (h.to) { seen[h.to] = (seen[h.to] || 0) + 1; if (seen[h.to] >= 2 && !loopName && SFP_BY[h.to]) loopName = SFP_BY[h.to].name; } });
  const fo = H.filter(h => h.c && h.c.includes('佛')).length;
  const foUp = H.filter(h => h.c && h.c.includes('佛') && (h.d === 'up' || h.d === 'pure' || h.d === 'start')).length;
  const cur = sfpS.pos ? SFP_BY[sfpS.pos] : null;
  const L           = [];
  L.push(`最近 ${H.length} 掷：升 ${up} · 退 ${down} · 安住 ${stay}${bonus ? ` · 贈掷 ${bonus}` : ''}${pure ? ' · 横超 1' : ''}。`);
  const cites           = [];
  if ((cur && cur.pure) || pure) { L.push('已横超入净土。'); cites.push('heng', 'tui'); }
  else {
    if (dnStk >= 2) { L.push(`眼下连退 ${dnStk} 掷。`); cites.push('you'); }
    else if (upStk >= 3) L.push(`眼下连升 ${upStk} 掷，行进得势。`);
    if (loopName) { L.push(`「${loopName}」已不止一次经过。`); cites.push('heng'); }
    if (fo) { L.push(`含「佛」字的轮相掷得 ${fo} 次，其中 ${foUp} 次带来上进或转机。`); cites.push('ming'); }
  }
  const seenC = new Set        ();
  const cHtml = cites.filter(k => !seenC.has(k) && (seenC.add(k), true)).map(k => {
    const c = JOURNEY_CITE[k];
    return `<div class="verse" style="margin-top:6px"><i class="duL">谱曰原文</i>${verseHtml(c.t)}<span class="cSrc" style="display:block">《選佛譜》${esc(c.src)}</span></div>`
      + `<div class="dd"><i class="duL b">白话文</i>${glossify(esc(c.p))}</div>`;
  }).join('');
  return L.map(t => `<div class="cRead" style="margin:4px 0">${glossify(esc(t))}</div>`).join('') + cHtml;
}
(window       ).__sfpRead = {
  journey: () => sfpJourneySummary(),
  hist: () => sfpHist,
  push: (h     ) => sfpHist.push(h),
  toss: (c     ) => sfpTossAnswerHtml(c),
  chat: (q        ) => sfpChatAnswer(q),
  trail: () => sfpS.trail,
  fo15: () => fo15Html(),
  practice: (dn        ) => sfpPracticeAnswerHtml(dn),
  rules: () => SFP_RULES_A,
  cross: () => sfpCrossAnswerHtml(),
};
function openSfpTrail() {
  const rows = [...sfpHist].reverse().map((h, ri) =>
    `<div class="sfpTrailRow" data-i="${sfpHist.length - 1 - ri}"><span class="tn">第${h.n}掷</span><span class="tc">${esc(h.c)}</span><span>${h.d ? SFP_DIR_BADGE[h.d] || '' : ''}${esc(h.t)}</span></div>`).join('');
  const jr = sfpJourneySummary();
  const p = el(`<div class="panel"><h2>行迹 · 本局升沉</h2><div class="body">
    <div class="cMeta" style="margin-bottom:4px">${sfpS.pos ? `第 ${sfpS.n} 掷 · 现居「${esc(SFP_BY[sfpS.pos].name)}」` : '未起局'}</div>
    ${jr ? `<div style="margin:2px 0 9px;padding:8px 11px;border:1px solid rgba(215,170,69,.28);border-radius:10px;background:rgba(215,170,69,.06)"><div class="cMeta" style="margin-bottom:2px">这一程走势</div>${jr}</div>` : ''}
    ${rows || '<div style="color:#9d9170">尚未掷轮——行迹从第一掷开始记。</div>'}
    <div class="cNote">只记最近四十掷；升沉皆依本位行法表与轮面字定。</div>
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="trOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  (p.querySelector('#trOk')               ).addEventListener('click', closeOverlay);
  p.addEventListener('click', (e) => {
    const row = (e.target               ).closest ? (e.target               ).closest('.sfpTrailRow')                : null;
    if (!row || row.dataset.i === undefined) return;
    const h = sfpHist[Number(row.dataset.i)];
    if (h && h.f && h.to && showTrailLink(h.f, h.to)) { playSfx('sfx-tap', 0.22); closeOverlay(); }
  });
  openOverlay(p);
}
const linkGeo = new THREE.BufferGeometry();
linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const linkMat = new THREE.LineDashedMaterial({ color: 0xe8c766, dashSize: 1.6, gapSize: 1.1, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const linkLine = new THREE.Line(linkGeo, linkMat);
linkLine.visible = false; linkLine.frustumCulled = false; scene.add(linkLine);
let linkUntil = 0;
function showTrailLink(fid        , tid        )          {
  const A = SFP_BY[fid], B = SFP_BY[tid];
  if (!A || !B || A.pure || B.pure) return false;
  const an = byId[A.anchor], bn = byId[B.anchor];
  const al = sfpBeadLocal[fid], bl = sfpBeadLocal[tid];
  if (!an || !bn || !al || !bl) return false;
  const a = an.marker.localToWorld(al.clone()), b = bn.marker.localToWorld(bl.clone());
  const arr = linkGeo.attributes.position.array                ;
  arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
  linkGeo.attributes.position.needsUpdate = true;
  linkLine.computeLineDistances();
  linkLine.visible = true; linkUntil = performance.now() + 2200;
  bn.marker.add(locGlow); locGlow.position.copy(bl); locGlow.visible = true; locUntil = performance.now() + 2200;
  return true;
}
let doorDiveSeq = 0; // 信忝：新行棋/收谱时作废未完成的俯冲入门
// 转场直达：「直达落位」悬浮钮已撤（用户点单）——改为设置里「行棋特效」开关：关时起飞后自动直达
let skipFn                      = null;
function setSkip(fn                     ) {
  skipFn = fn;
  if (fn && !save.settings.moveFx) { skipFn = null; window.setTimeout(fn, 420); } // 留一拍起飞感再直达，免瞬移突兀
  else if (fn && !localStorage.getItem('sfp_skiphint')) { localStorage.setItem('sfp_skiphint', '1'); showToast('乘光飞行中——点一下屏幕可直达落位', 3200); }
}
renderer.domElement.addEventListener('pointerdown', () => {
  if (!sfpTransit || !skipFn) return;
  const f = skipFn; skipFn = null; f();
}, true);
void skipFn;
function sfpFlyAnchor(p     ) {
  // 掷定入位：就地观照——本门位珠就地全亮放大、标签浮出，镜头俯冲贴近珠位（无场景切换）
  if (!p.pure) {
    if (DISC_DOORS.has(p.door)) { // v316/v322 谱页门无地理坐标：落位/续局一律入页亮珠
      if (inDisc) discLand(p.id); else enterDiscTransit(p.door, p.id);
      return;
    }
    if (inPure) returnSaha();
    if (inSky && !SKY_IDS.has(p.anchor)) returnSaha(); // 色界场内落位非色界珠：先回娑婆再俯冲
    if (p.anchor === 'bodhi') { // 道场落位（v157）：不开门观，改展开落点科组＋俯冲贴珠
      if (!inBodhi) enterBodhiQuiet();
      bodhiGrpOpen(bodhiGrpOf[p.id]);
      doorDiveSeq++;
      const nv = byId[p.anchor], lp = sfpBeadLocal[p.id];
      if (nv && lp) {
        const wp = nv.marker.localToWorld(lp.clone());
        const bd = camera.position.clone().sub(wp).setY(0);
        if (bd.lengthSq() < 1) bd.set(0.5, 0, 1);
        bd.normalize();
        flyTo(wp.clone().addScaledVector(bd, 16).add(new THREE.Vector3(0, 6, 0)), wp, 1.4);
      }
      return;
    }
    doorDiveSeq++;
    enterDoor(p.door, p.id, 'none'); // 先就地展开本门（标签/聚焦/光带），镜头交给下面的俯冲
    const nv = byId[p.anchor], lp = sfpBeadLocal[p.id];
    if (nv && lp) {
      const wp = nv.marker.localToWorld(lp.clone());
      const bd = camera.position.clone().sub(wp).setY(0);
      if (bd.lengthSq() < 1) bd.set(0.5, 0, 1);
      bd.normalize();
      flyTo(wp.clone().addScaledVector(bd, 14).add(new THREE.Vector3(0, 5.5, 0)), wp, 1.4);
    }
    return;
  }
  if (inDoor) exitDoor(false);
  sfpFlyAnchorMap(p);
}
function sfpFlyAnchorMap(p     ) {
  setConMin(false); // 落位/归位＝回到局面，收起的控制台恢复
  if (p.pure && !inPure) enterPure();
  if (!p.pure && inPure) returnSaha();
  if (inSky && !SKY_IDS.has(p.anchor)) returnSaha();
  const nv = byId[p.anchor]; if (!nv) return;
  const lp = sfpBeadLocal[p.id];
  if (p.pure && lp) {
    // 净土位：直接取景莲台/光轮本位（锚点视角会落在楼阁上）
    const wp = nv.marker.localToWorld(lp.clone());
    const dir = camera.position.clone().sub(wp).setY(0);
    if (dir.lengthSq() < 1) dir.set(0.4, 0, 1);
    dir.normalize();
    if (pureGrand) { // 横超入西：镜头自高远天际徐徐降向莲池，宝土全景入目后方抵本位
      pureGrand = false; pureGrandUntil = performance.now() + 4800;
      camera.position.copy(wp.clone().addScaledVector(dir, 205).add(new THREE.Vector3(0, 105, 0)));
      controls.target.copy(wp);
      flyTo(wp.clone().addScaledVector(dir, 32).add(new THREE.Vector3(0, 11, 0)), wp, 4.6);
      return;
    }
    flyTo(wp.clone().addScaledVector(dir, 34).add(new THREE.Vector3(0, 12, 0)), wp);
    return;
  }
  const v = viewPosFor(nv); flyTo(v.pos, v.target);
}
// ── 入门总说浮文：本局初次跨入某门，落定后以整段浮文呈示原谱「總說」（不弹窗不拦掷，顶替原入门短提示），
// 掷轮或任何触碰即隐；同门反复进出不重呈，重读走谱注卡 ──
const doorIntroEl = el('<div id="doorIntro" class="ui"><b></b><div class="dit"></div><div class="dif">掷轮或点画面即收 · 点位名可重读</div></div>');
app.appendChild(doorIntroEl);
let doorIntroOn = false;
function showDoorIntro(doorNo        ) {
  const dd = SFP_DOOR_BY[doorNo]; if (!dd || !dd.intro) return;
  (doorIntroEl.querySelector('b')               ).textContent = zh(`入 ${dd.title} · 第${SFP_CN[doorNo - 1]}門總說`);
  const body = doorIntroEl.querySelector('.dit')               ;
  const dPlain = (SFP_DOOR_PLAIN       )[doorNo];
  const selfIntro = DOOR_HINT_SELF.has(doorNo);
  body.innerHTML = dPlain
    ? zh(`<div><b style="color:#d7aa45">释义：</b>${glossify(esc(dPlain))}</div><div style="margin-top:7px;font-size:var(--fs-xs);color:#c9bc8f"><b>${selfIntro ? '本门导语（原谱无此门总说）' : '谱曰原文'}：</b>${glossify(esc(dd.intro))}</div>`)
    : zh(`<div><b style="color:#d7aa45">${dd.introEvidenceType === SFP_EVIDENCE_TYPE.source ? '谱曰原文' : '释义'}：</b>${glossify(esc(dd.intro))}</div>`);
  if (doorNo === 1) { // v169 因地门总说带廿一因逐位读入口
    const c = document.createElement('button');
    c.className = 'sfpChip'; c.style.marginTop = '9px';
    c.textContent = zh('廿一因逐位读 ›');
    c.addEventListener('click', (e) => { e.stopPropagation(); hideDoorIntro(); openD1Card(); });
    body.appendChild(c);
  }
  body.scrollTop = 0;
  doorIntroEl.classList.add('show'); doorIntroOn = true;
  playVar('wood_light', 0.2, 0.95);
}
function hideDoorIntro() {
  if (!doorIntroOn) return;
  doorIntroOn = false; doorIntroEl.classList.remove('show');
}
// 任何触碰（浮文自身内滚动除外）即收——据获阶段优先于各控件自身响应
window.addEventListener('pointerdown', (e) => {
  if (doorIntroOn && !doorIntroEl.contains(e.target        )) hideDoorIntro();
}, true);
function maybeDoorIntro(prevDoor               , p     ) {
  if (!sfpS.active || p.terminal) return;
  if (prevDoor === p.door) return;
  const dd = SFP_DOOR_BY[p.door];
  if (!dd || !dd.intro || sfpS.seenD.includes(p.door)) return;
  if (p.pure) { // 净土位无入门俯冲，白光转场定、莲池取景稳后再呈（接引式入场则等徐降抵位）
    const delay = performance.now() < pureGrandUntil ? 5200 : 1900;
    window.setTimeout(() => {
      if (sfpS.active && sfpS.pos === p.id) { markDoorSeen(p.door); showDoorIntro(p.door); }
    }, delay);
    return;
  }
  // 非净土位：登记待呈，等俯冲入门、白光散尽真正落定（enterDoor 完成）后再呈
  pendingDoorIntro = { door: p.door, pid: p.id };
}
let pendingDoorIntro                                       = null;
function markDoorSeen(doorNo        ) {
  if (!sfpS.seenD.includes(doorNo)) { sfpS.seenD.push(doorNo); sfpSave(); }
}
const SFP_DIR_BADGE                         = {
  up: '<b style="color:#e8c766">▲ 升</b>｜', down: '<b style="color:#f08f7a">▼ 降</b>｜',
  stay: '<b style="color:#9d9170">● 安住</b>｜', pure: '<b style="color:#efe0b4">横超</b>｜', start: '<b style="color:#e8c766">起行</b>｜',
};
let sfpMsgLog           = [];
const SFP_DIR_SND                             = {
  up: () => playVar('bell_heavy', 0.26, 1.18),
  start: () => playVar('bell_heavy', 0.24, 1.0),
  down: () => playVar('wood_medium', 0.42, 0.72),
  stay: () => playVar('wood_light', 0.3, 0.8),
  pure: () => playVar('bell_heavy', 0.3, 0.9),
};
function sfpShowMsg(msg        , dir         , combo         ) {
  if (dir && SFP_DIR_SND[dir]) SFP_DIR_SND[dir]();
  // v319 行棋减噪：短式棋讯「第N掷 · 轮字 ▲ 升｜去处」——不再整句复述判词卡
  const h = (combo ? `<span style="color:#9d9170">第 ${sfpS.n} 掷 · </span><b style="color:#efe0b4;letter-spacing:2px">${combo}</b>　` : '') + (dir ? SFP_DIR_BADGE[dir] || '' : '') + esc(msg);
  // 棋讯借状态行说一会儿话，说完退回位名——不为它单开一层常驻栏。
  // （从前写进一个 display:none 的元素，等于没说；连「消息回看」也因此点不到。）
  sfpNameEl.innerHTML = zh(h);
  sfpNameEl.classList.add('msg');
  window.clearTimeout(sfpMsgHold);
  sfpMsgHold = window.setTimeout(() => { sfpMsgHold = 0; sfpStatus(); }, 5200);
  sfpMsgLog.push(h); if (sfpMsgLog.length > 12) sfpMsgLog.shift();
}
function openSfpMsgLog() {
  const rows = [...sfpMsgLog].reverse().map(h => `<div class="sfpTrailRow"><span>${h}</span></div>`).join('');
  const p = el(`<div class="panel"><h2>消息回看</h2><div class="body">
    <div class="cMeta" style="margin-bottom:4px">棋讯播报 · 最近十二条</div>
    ${rows || '<div style="color:#9d9170">还没有消息。</div>'}
    <div class="cNote">完整升沉脉络见「行迹」。</div>
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="mlOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  (p.querySelector('#mlOk')               ).addEventListener('click', closeOverlay);
  openOverlay(p);
}
let sfpFlashUntil = 0;
let pureGrand = false, pureGrandUntil = 0; // 横超生西的接引式入场（仅首次跨入净土的那一手）
let sfpMoveSeq = 0;
function sfpGoto(id        , msg        , dir         , combo         ) {
  const p = SFP_BY[id]; if (!p) return;
  if (inDisc && !(DISC_DOORS.has(p.door) && !p.pure && p.door === discDoor)) returnSaha(); // 谱页内起手往他门/他页：先退专场，飞行在全图坐标系上走；同页内位移则原地亮珠
  // 行棋接驳道场（v157 用户报）：落点是菩萨位则留在/切入道场坐标系乘光，不再退回旧位塔；行门页位（门9发心等）不入此接驳，归谱页链路
  if (inBodhi && (p.anchor !== 'bodhi' || DISC_DOORS.has(p.door))) returnSaha(); // 场内起手往场外：先复原坐标语境
  else if (!inBodhi && !inPure && !inSky && p.anchor === 'bodhi' && !DISC_DOORS.has(p.door)) enterBodhiQuiet(); // 娑婆起手落菩萨位：先入环列坐标系
  
  exitStarView(false);
  hideDoorIntro();
  pendingDoorIntro = null; // 新一手行棋：作废上手未呈的入门总说（未呈即未记 seen，下次初入仍弹）
  const prev = sfpS.pos ? SFP_BY[sfpS.pos] : null;
  doorDiveSeq++; // 作废上一手未完成的俯冲入门
  setSkip(null);
  // 直达：作废全部在途动画与定时器，白光一闪直接落位入门
  const doSkip = () => {
    sfpMoveSeq++; doorDiveSeq++;
    cometCancel(); cancelFly();
    pawnHide();
    locGlow.visible = false;
    fadeEl.style.opacity = '1';
    window.setTimeout(() => {
      if (!sfpS.active) return;
      setTransit(false);
      pawnLandPending = true; pawnLandDir = dir || '';
      if (save.sfpFocus) setSfpFocus(p.door);
      if (p.pure) { if (inDoor) exitDoor(false); sfpFlyAnchorMap(p); }
      else if (p.anchor === 'bodhi' && !DISC_DOORS.has(p.door)) { if (inPure) returnSaha(); sfpFlyAnchor(p); } // 直达菩萨位：同走道场接驳；行门页位走 enterDoor 改道谱页
      else { if (inPure) returnSaha(); enterDoor(p.door, p.id); }
      fadeEl.style.opacity = '0';
      sfpFlashUntil = performance.now() + 1100;
      rebuildFoot();
      posReveal(p.name, dir, p.id);
      maybeDoorIntro(prev ? prev.door : null, p);
      if (p.terminal) setTimeout(sfpVictory, 1200);
    }, 380);
  };
  sfpS.pos = id;
  if (p.terminal) {
    sfpS.finished = true;
    sfpBonusLeft = 0;
    palmHeld = false;
    sfpRollBtn.classList.add('dis');
  }
  lgMark(id, dir);
  sfpTrailPush(id); // 足迹星座：记实际行迹（落定时才重建可见层）
  if (save.sfpFocus) setSfpFocus(p.door, prev ? prev.door : 0); // 跨门行棋：新旧两门短暂同显
  const seq = ++sfpMoveSeq;
  sfpStatus(); sfpShowMsg(msg, dir, combo);
  sfpSave();
  // v316/v322 谱页门无地理坐标（用户定案）：凡落门1及行门四门一律转场入谱页亮珠——首掷安位即「掷轮后直接进第一门」；
  // 不走彗星（两坐标系不同，同净土跨界转场同法）
  if (DISC_DOORS.has(p.door) && !p.pure) {
    cometCancel(); cancelFly(); pawnHide();
    trailLine.visible = false; trailGlowsOff();
    locGlow.visible = false;
    setSkip(null);
    if (inDisc) { // 同页内位移：原地亮珠换环（discLand 自按目的门重建）
      discLand(p.id);
      maybeDoorIntro(prev ? prev.door : null, p);
      return;
    }
    pawnLandPending = false;
    fadeTransit(() => {
      if (!sfpS.active) return;
      enterDiscCore(p.door);
      const v = discView();
      camera.position.set(0, v.y + 26, v.z + 40); controls.target.copy(discTarget());
      flyTo(v, discTarget(), 1.4);
      discLand(p.id);
      setTransit(false);
      sfpFlashUntil = performance.now() + 1100;
      rebuildFoot();
      maybeDoorIntro(prev ? prev.door : null, p);
    }, true, 900);
    return;
  }
  // 途经门字幕已拆（v151 行棋静场）：飞行中不再逐门弹门介，飞时不再因字幕拉长
  const arrive = () => {
    setSkip(null);
    setTransit(false);
    pawnLandPending = true; pawnLandDir = dir || '';
    if (save.sfpFocus) setSfpFocus(p.door); // 落定后收敛到本门
    sfpFlyAnchor(p);
    sfpFlashUntil = performance.now() + 1100;
    rebuildFoot();
    posReveal(p.name, dir, p.id);
    maybeDoorIntro(prev ? prev.door : null, p);
    if (p.terminal) setTimeout(sfpVictory, 2800);
  };
  // 净土横超/返娑婆：白光渐隐转场（不走彗星，两界不同坐标系）；生西走金色星河、接引式入场
  if (prev && !!p.pure !== !!prev.pure) {
    trailLine.visible = false; trailGlowsOff();
    pawnTakeoff();
    if (p.pure) { pureGrand = true; fadeTransit(arrive, true, 1600); }
    else fadeTransit(arrive);
    return;
  }
  // 就地观照后娑婆界内一律走同一套地图乘光链路（同门短跃与跨门长飞同坐标系，无需出门转场）
  const fromNv = prev ? byId[prev.anchor] : null;
  const fromLp = prev ? sfpBeadLocal[prev.id] : null;
  const toNv = byId[p.anchor];
  const toLp = sfpBeadLocal[p.id];
  if (!prev || !fromNv || !fromLp || !toNv || !toLp) { arrive(); return; }
  if (inDoor && prev.door !== p.door) exitDoor(false); // v151 行棋静场：跨门起飞即收拢来处门观（光带/浮标不随飞行挂屏）
  setTransit(true);
  pawnTakeoff();
  setSkip(doSkip);
  if (prev && (prev.id === '阿鼻地獄' || prev.id === '無間地獄') && id === '蒙光天子') mengGuangBeam(prev.id); // v320 蒙光时刻：全谱最壮一跃
  // 目标预示：新珠先亮一拍
  toNv.marker.add(locGlow);
  locGlow.position.copy(toLp);
  locGlow.visible = true; locUntil = performance.now() + 450; // v319 预示减半
  const a = fromNv.marker.localToWorld(fromLp.clone());
  const b = toNv.marker.localToWorld(toLp.clone());
  const span = a.distanceTo(b);
  cometNextCols = [SFP_DOOR_COLOR[prev.door] ?? 0xd7aa45, SFP_DOOR_COLOR[p.door] ?? 0xd7aa45];
  const segK = prev.id + '>' + p.id;
  cometNextQuick = flownSegs.has(segK); flownSegs.add(segK);
  let delay = 380;
  if (span > 55) {
    // 大跨度先拉后进：新旧两位同框半秒，看清跨了多远
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const hd = camera.position.clone().sub(mid).setY(0);
    if (hd.lengthSq() < 1) hd.set(1, 0, 1);
    hd.normalize();
    flyTo(mid.clone().addScaledVector(hd, span * 0.95 + 30).add(new THREE.Vector3(0, span * 0.4 + 16, 0)), mid, 0.85);
    delay = 820;
  }
  window.setTimeout(() => {
    if (seq !== sfpMoveSeq || !sfpS.active) return;
    ghostRef = { nv: fromNv, lp: fromLp };
    ghostGlow.visible = true; ghostUntil = performance.now() + 800; // v151 行棋静场；v319 残光减半
    cometStart(fromNv, fromLp, toNv, toLp, dir || 'up', span, arrive);
  }, delay);
}
function sfpApply(combo        , chain = false) {
  // 控制台两枚占察轮小牌：显本掷得字（刻面原字，不随简繁转换）；首掷前空牌不呈（免空框惑人）
  sfpFaceEls[0].textContent = combo[0]; sfpFaceEls[1].textContent = combo[1];
  (sfpFaceEls[0].parentElement               ).style.display = '';
  const done = (moreAutomatic = false) => { // 判词已行：解锁掷轮（行棋中仍禁）
    sfpS.rolling = false;
    sfpRollBtn.classList.toggle('dis', sfpTransit || sfpS.finished);
    syncRollGlow();
    if (moreAutomatic) return;
    // 判词行毕即交回服务器裁夺：是续掷（受赠之掷未尽）、是择人施贈、还是轮转下一位，
    // 一律由服务器判。从前这里因本地 sfpBonusLeft 扣着不发，服务器只能等兜底闹钟，白晾一分钟。
    if (Net.active) Net.finishTurn();
  };
  if (!sfpS.pos) {
    const p0 = (SFP_POS         ).find(p => p.start === combo);
    if (p0) {
      vib(15);
      showVerdict(`${SFP_DIR_BADGE.start}因地<b class="vdst">「${p0.name}」</b>，自此起行`, '', '行 ▸', () => {
        sfpLog(combo, `起行 · 因地「${p0.name}」`, 'start', undefined, p0.id);
        sfpGoto(p0.id, `因地「${p0.name}」`, 'start', combo);
        done();
      }, combo, p0.id, askQFor(combo, 'start', undefined, p0.id), 'start');
    } else done();
    return;
  }
  const p = SFP_BY[sfpS.pos];
  // 「不行」兜底通例分层（引文均为原谱逐字，出处标在 src）：
  // 圣位/伏断惑之位——恶轮已无行处（moves 中无任一纯恶组合），不行因「不起惡/能伏惑」；净土位因「永離退緣」；
  // 圣位之前（恶轮仍能行）才适用見取位「善惡相治」通例。
  const MIX6 = ['那阿', '謨阿', '那彌', '謨彌', '那陀', '謨陀'];
  const MIX6_WHY = '其餘位中。以阿彌陀善。與那謨惡相為對治。二俱無力。所以並不行也。';
  const EVIL2 = ['那那', '那謨', '謨謨'];
  const evilInert = !(p.moves         ).some((m     ) => (m.c            ).some(c => EVIL2.includes(c)));
  const why = (id        , c        ) => {
    const w = sfpWhyEvidence(id, c);
    if (w) return w;
    if (evilInert && /[那謨]/.test(c)) {
      if (p.pure) return makeSfpSourceEvidence('永離退緣。', 'pu_explanation', '《選佛譜》卷第六 · 淨土橫超門「淨土疑城」譜注（通例）');
      return makeSfpSourceEvidence('那那等不行者。不起惡故。', 'pu_explanation', '《選佛譜》卷第五 · 藏教位次門「忍位」譜注（通例）');
    }
    if (!evilInert && MIX6.includes(c)) return makeSfpSourceEvidence(MIX6_WHY, 'pu_explanation', '《選佛譜》卷第一 · 發始因地門「見取」譜注（通例）');
    return undefined;
  };
  const mv = (p.moves         ).find(m => m.c.includes(combo));
  if (!mv) {
    const w = why(p.id, combo);
    vib(10);
    showVerdict(`${SFP_DIR_BADGE.stay}此位不行，安住<b class="vdst">「${p.name}」</b>`, w || makeSfpInterpretationEvidence('原谱于本位未列此组合，依谱例安住不行。'), '知道了', () => {
      sfpLog(combo, `安住「${p.name}」`, 'stay', p.id, p.id);
      sfpShowMsg(`安住「${p.name}」`, 'stay', combo); // 谱曰缘由判词卡已呈，消息栏短式不复述（v151/v319 静场）
      sfpStatus(); sfpSave();
      done();
    }, combo, p.id, askQFor(combo, 'stay', p.id, p.id), 'stay', true);
    return;
  }
  if (!mv.to && mv.bonus) {
    vib([15, 60, 15]);
    const grantEvidence = mergeSfpEvidence(
      why(p.id, combo),
      makeSfpOperationalEvidence(sfpGrantRule()),
    );
    const cn = '一二三四'[mv.bonus - 1];
    const head = sfpGrantHasTaker()
      ? `掷得<b class="vdst">贈${cn}掷</b> · 请施与一位莲友`
      : `掷得<b class="vdst">贈${cn}掷</b> · 无人可施，此贈作废`;
    showVerdict(head, grantEvidence, sfpGrantHasTaker() ? '择人 ▸' : '知道了', () => {
      sfpLog(combo, sfpGrantHasTaker() ? `贈${cn}掷 · 施与同席` : `贈${cn}掷 · 无人可施作废`);
      sfpShowMsg(sfpGrantHasTaker() ? `贈${cn}掷，请择一位莲友受之` : `贈${cn}掷，无人可施，此贈作废`, undefined, combo);
      playSfx('sfx-fav', 0.4); sfpStatus(); sfpSave();
      done();
    }, combo, undefined, askQFor(combo, '', undefined, undefined), 'bonus', true);
    return;
  }
  const dest = SFP_BY[mv.to];
  let msg = `「${dest.name}」`;
  if (mv.bonus) msg += `，贈${'一二三四'[mv.bonus - 1]}掷`;
  let w = why(p.id, combo); // 原文、释义与操作规则只呈于判词卡，消息栏不复述（v151 静场）
  if (mv.bonus) w = mergeSfpEvidence(w, makeSfpOperationalEvidence(`先移至目的位，${sfpGrantRule()}`));
  // 升降判定（通例）
  const dir = sfpDirOf(p, dest, combo);
  vib(dir === 'down' ? 110 : dir === 'pure' ? [20, 50, 20, 50, 80] : [15, 45, 15]); // 降一记长振，升短双振，横超一串
  showVerdict(`${SFP_DIR_BADGE[dir] || ''}往<b class="vdst">「${dest.name}」</b>${mv.bonus ? `<span class="vbn">贈${'一二三四'[mv.bonus - 1]}掷</span>` : ''}`, w || '', '行 ▸', () => {
    sfpLog(combo, `「${p.name}」→「${dest.name}」${mv.bonus ? `，贈${'一二三四'[mv.bonus - 1]}掷` : ''}`, dir, p.id, mv.to);
    sfpGoto(mv.to, msg, dir, combo);
    if (dir === 'pure') setTimeout(() => { // 横超落定后点明净土行法（「永離退緣」为净土疑城谱注原文；净土诸位行法确无下行）
      if (sfpS.active && sfpS.pos && SFP_BY[sfpS.pos] && SFP_BY[sfpS.pos].pure)
        showToast('已入净土——谱曰「然亦永離退緣。遠勝非非想處多矣」（卷第六·淨土疑城譜注）；续掷即依净土诸位行法而行', 5600);
    }, 3400);
    if (mv.act) {
      setTimeout(() => {
        if (!sfpS.active || sfpS.pos !== mv.to) return;
        sfpShowMsg(`至彌勒内院，依「${mv.act}」字行…`);
        setTimeout(() => { if (sfpS.active) sfpApply(mv.act, true); }, 1200);
      }, 1400);
    }
    done(!!mv.act);
  }, combo, mv.to, askQFor(combo, dir, p.id, mv.to), dir);
}
let sfpTimer = 0;
let palmHeld = false;
let ringIt = 0;
const sfpRollBtn = sfpBar.querySelector('#sfpRoll')               ;
const sfpVeil = el('<div id="sfpVeil" class="ui"></div>');
app.appendChild(sfpVeil);
function sfpQuiet(on         ) { // 掷轮静场：暗纱罩景、星名隐去，只留轮与念文
  sfpVeil.classList.toggle('on', on);
  labelLayer.style.opacity = on ? '0.08' : '';
}
// 依「置輪掌心，仰手旁擲」：按住→置輪掌心至心称念；松手→旁掷
function sfpPalmDown() {
  if (!sfpS.active || sfpS.rolling || sfpTransit) return;
  if (sfpS.finished) {
    showToast(zh(Net.active && !Net.isFinished()
      ? '本座已经及第，正等待本轮补齐并共同结算'
      : '本局已经结束，请从结算面板开始下一局'), 3000);
    syncRollGlow();
    return;
  }
  // 暂离者点掷轮即视为自请归队：从前这里只反复提示「请候某某行谱」，
  // 而暂离者永远等不到轮次，唯一出路是刷新页面重进——没人猜得到。
  if (Net.active && Net.isAway()) {
    if (Net.wakeUp()) showToast(zh('已归队——下一轮轮到您时即可掷轮'), 3200);
    syncRollGlow();
    return;
  }
  if (Net.active && !Net.canToss()) {
    showToast(zh(Net.turnHint()), 2600);
    syncRollGlow();
    return;
  }
  if (starView) exitStarView();
  sfpS.rolling = true; palmHeld = true;
  syncRollGlow();
  playSfx('sfx-tap', 0.25);
  vib(8);
  sfpRollBtn.classList.add('hold');
  (sfpRollBtn.querySelector('#rollTxt')               ).textContent = zh('松手旁掷');
  {
    const ring = sfpRollBtn.querySelector('#rollRing')               ;
    ring.style.setProperty('--p', '0%');
    window.clearInterval(ringIt);
    const rt0 = performance.now();
    ringIt = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - rt0) / 2400);
      ring.style.setProperty('--p', (k * 100).toFixed(1) + '%');
      if (k >= 1) { window.clearInterval(ringIt); vib(6); }
    }, 60);
  }
  sfpDice.classList.add('on'); sfpDice.classList.remove('settle');
  sfpQuiet(true);
  // 置轮掌心：六字静静呈现，不计时、不出声——念佛节奏由用户自己把握，何时松手都可
  const chantEl = sfpDice.querySelector('#sfpChant')               ;
  chantEl.innerHTML = `<em>${zh('置轮掌心 · 至心称念')}</em>` +
    '南无阿弥陀佛'.split('').map(c => `<b>${zh(c)}</b>`).join('') +
    `<i id="chantGo">${zh('念毕松手旁掷')}</i>`;
  startWheelPalm();
}
function sfpPrepareTossRelease() {
  palmHeld = false;
  sfpRollBtn.classList.remove('hold');
  window.clearInterval(ringIt);
  (sfpRollBtn.querySelector('#rollTxt')               ).textContent = zh('长按掷轮');
  sfpRollBtn.classList.add('dis');
  (sfpDice.querySelector('#sfpChant')               ).textContent = ''; // 松手后轮已离掌，不再挂提示，留白看轮相
}
function sfpAnimateCommittedToss(combo        , authoritativeN                ) {
  if (Number.isFinite(authoritativeN)) sfpS.n = Number(authoritativeN);
  else sfpS.n++;
  save.lg.tos++;
  persist();
  void Plaza.tick(1); // 只计服务器已承诺或单机已落定的真实一掷
  // 受赠之掷的扣减由服务器施受队列记账，前台只镜像，不自行加减（免两本账对不上）
  const ia = SFP_ORDER.indexOf(combo[0]), ib = SFP_ORDER.indexOf(combo[1]);
  if (ia < 0 || ib < 0) {
    sfpS.rolling = false;
    sfpDice.classList.remove('on');
    sfpQuiet(false);
    syncRollGlow();
    return;
  }
  startWheelToss(ia, ib, () => {
    sfpDice.classList.add('settle');
    playBell(294, 0.045);
    sfpTimer = window.setTimeout(() => {
      sfpDice.classList.remove('on');
      sfpQuiet(false);
      // rolling 保持到判词卡 commit，防判词未行又起新掷
      sfpApply(combo);
    }, 620);
  });
}
function sfpTossUp() {
  if (!palmHeld) return;
  sfpPrepareTossRelease();
  if (Net.active) {
    if (Net.requestToss()) return;
    sfpS.rolling = false;
    sfpDice.classList.remove('on');
    sfpQuiet(false);
    syncRollGlow();
    return;
  }
  const ia = Math.floor(Math.random() * 6), ib = Math.floor(Math.random() * 6);
  sfpAnimateCommittedToss(sfpComboKey(SFP_ORDER[ia], SFP_ORDER[ib]));
}
sfpRollBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); sfpPalmDown(); });
window.addEventListener('pointerup', sfpTossUp);
window.addEventListener('pointercancel', sfpTossUp);
// 极简行动栏：左「⋯」谱务 · 中掷轮 · 右「问」问义；谱注走点位名，观星入口已撤
// v316 手机改底部抽屉（拇指区）：现居卡可点开位卡，四事大按钮，下滑即关
function openSfpMore() {
  // 单菜单原则：全站只有此处承载次级功能。高频入口给大触点，低频入口与危险操作分层。
  const row = (id, t, note = '', cls = '') =>
    `<button class="smRow ${cls}" id="${id}"><b>${t}</b>${note ? `<i>${note}</i>` : ''}</button>`;
  const cur = sfpS.pos ? SFP_BY[sfpS.pos] : null;
  const hasSaved = !sfpS.active && !!(save.sfp && SFP_BY[save.sfp.pos]);
  const currentName = cur ? `现居「${esc(cur.name)}」`
    : (hasSaved ? `行处已存 · 现居「${esc(SFP_BY[save.sfp.pos].name)}」` : '尚未起行');
  const currentMeta = cur
    ? `第 ${sfpS.n} 掷 · 第${SFP_CN[cur.door - 1]}门「${SFP_DOOR_BY[cur.door].title}」`
    : (hasSaved ? '可从题屏继续上局' : '先掷發始因地');
  const p = el(`<div class="panel smPanel"><div class="grab"></div><h2>行谱菜单</h2><div class="body">
    <div class="smStat"><span>当前行处</span><b>${currentName}</b><i>${currentMeta}</i></div>
    <div class="smSection">
      <div class="smList">
      ${row('smMine', '我的', '功课 · 日历 · 行谱记录')}
      ${Net.active ? row('smNet', '同修面板', `${Net.locked ? '🔒 ' : ''}名单与聊天`) : ''}
      ${row('smCanon', '原文', '六卷谱文逐字')}
      ${row('smSet', '设置', '声音 · 简繁 · 卡片')}
      ${row('smNew', '重开一局', '从头掷', 'warn')}
      ${row('smExit', '退出', Net.active ? '离席并回题屏' : '行处已存 · 回题屏', 'warn')}
      </div>
    </div>
    <button class="gbtn primary" id="smBack">回到局中</button></div></div>`);
  const on = (id, fn) => { const b = p.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
  on('smBack', closeOverlay);
  on('smMine', () => { closeOverlay(); openMine(); });
  on('smCanon', () => { closeOverlay(); openCanon(cur ? cur.door : 1, cur ? cur.name : undefined); });
  on('smNet', () => { closeOverlay(); Net.openPanel(); });
  on('smSet', () => { closeOverlay(); openSettings(); });
  // 从前全站没有一处「退出」：局中只能靠及第或离席，观照期只能关标签页。
  // 单机行处本就随时存档，退出即回题屏，随时可从「续掷」接上。
  on('smExit', async () => {
    if (Net.active && !await confirmLeaveMatch('离席并退出')) return;
    closeOverlay();
    if (Net.active) Net.leave({ notify: false });
    endSfp('行处已存——回到题屏，点「续掷」可接上');
    plazaStop();
    openTitle();
  });
  const newButton = p.querySelector('#smNew')               ;
  if (newButton) newButton.addEventListener('click', function (                 ) {
    if (sfpS.rolling || sfpTransit) { closeOverlay(); showToast('行棋中，稍候再新开'); return; }
    if (this.dataset.arm) {
      closeOverlay(); cancelVerdict();
      startSfp(false); showToast('已新开一局——先掷發始因地'); return;
    }
    this.dataset.arm = '1'; // 两击确认：误点不至于丢局
    this.classList.add('arm');
    (this.querySelector('b')               ).textContent = zh('确认重开？');
    (this.querySelector('i')               ).textContent = zh('再点一次 · 行处弃置');
  });
  openOverlay(p);
  if (overlayEl) overlayEl.classList.add('ovsheet'); // 手机：底部抽屉呈现
}
(sfpBar.querySelector('#sfpMore')               ).addEventListener('click', () => openSfpMore());
(sfpBar.querySelector('#sfpAsk')               ).addEventListener('click', () => openSfpReading());
let nmHoldT = 0, nmHeldFired = false;
sfpNameEl.addEventListener('pointerdown', () => {
  nmHeldFired = false; clearTimeout(nmHoldT);
  nmHoldT = window.setTimeout(() => {
    nmHeldFired = true;
    if (sfpS.active && sfpS.pos && !sfpTransit) { vib(10); playSfx('sfx-tap', 0.2); sfpFlyAnchor(SFP_BY[sfpS.pos]); }
  }, 550);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => sfpNameEl.addEventListener(ev, () => clearTimeout(nmHoldT)));
// 这一行身兼两职：显位名时点开位卡，显棋讯时点开消息回看（回看从前根本无处可点）
sfpNameEl.addEventListener('click', () => {
  if (nmHeldFired) { nmHeldFired = false; return; }
  if (sfpNameEl.classList.contains('msg')) { openSfpMsgLog(); return; }
  if (sfpS.pos) openSfpNote();
});

// 第一视角观星：相机入驻当前珠位，锁定距离环顾四周（OrbitControls 近距定点技巧）
let starView = false;
let svSaved                                                                                                 = null;
function enterStarView() {
  if (!sfpS.active || !sfpS.pos || starView || sfpTransit) return;
  const p = SFP_BY[sfpS.pos];
  let wp               , center               ;
  if (inDoor) {
    // 门观中观星：站上本位珠，环顾本门就地铺展的位阶与星空
    const dp = doorPlanets[p.id]; if (!dp) return;
    wp = dp.clone().add(new THREE.Vector3(0, 1.4, 0));
    center = new THREE.Vector3(0, wp.y * 0.6 + 12, 0);
  } else {
    if (!!p.pure !== inPure) return;
    const nv = byId[p.anchor]; const lp = sfpBeadLocal[p.id];
    if (!nv || !lp) return;
    wp = nv.marker.localToWorld(lp.clone()).add(new THREE.Vector3(0, 1.4, 0));
    center = inPure ? new THREE.Vector3(-2000, 30, 0) : new THREE.Vector3(0, wp.y * 0.6 + 12, 0);
  }
  starView = true;
  cancelFly();
  svSaved = { pos: camera.position.clone(), target: controls.target.clone(), minD: controls.minDistance, maxD: controls.maxDistance, pan: controls.enablePan };
  const dir = center.sub(wp);
  if (dir.lengthSq() < 1) dir.set(1, 0, 0);
  dir.normalize();
  camera.position.copy(wp);
  controls.target.copy(wp).addScaledVector(dir, 3);
  controls.minDistance = 3; controls.maxDistance = 3; controls.enablePan = false;
  closeCard();
  showToast(`第一视角 · 从「${p.name}」环顾${inDoor ? '本门星域' : '星系'}：拖动看四周`, 3200);
  playBell(330, 0.04);
}
function exitStarView(flyBack = true) {
  if (!starView) return;
  starView = false;
  if (svSaved) {
    controls.minDistance = svSaved.minD; controls.maxDistance = svSaved.maxD; controls.enablePan = svSaved.pan;
    if (flyBack) flyTo(svSaved.pos, svSaved.target, 0.9);
  }
}

// 十五门全图：每门坐标（棋盘界域）+ 展开位次，点位飞往对应珠
function openSfpMap() {
  const curDoor = sfpS.pos ? SFP_BY[sfpS.pos].door : 0;
  let bodyH = '';
  (SFP_DOORS         ).forEach(d => {
    const g = (SFP_POS         ).filter(p => p.door === d.no);
    const anchors = [...new Set(g.map((p     ) => p.anchor))].map((a     ) => byId[a]?.d.name || a);
    const anchorsTxt = anchors.length > 8 ? anchors.slice(0, 8).join('、') + `等${anchors.length}处` : anchors.join('、');
    const chips = g.map((p     , k        ) =>
      `<button class="sfpChip${p.id === sfpS.pos ? ' cur' : ''}" data-pid="${esc(p.id)}">${k + 1}·${esc(p.name)}</button>`).join('');
    bodyH += `<details class="sec"${d.no === curDoor ? ' open' : ''}><summary><span>
      <i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#${(SFP_DOOR_COLOR[d.no] ?? 0xd7aa45).toString(16).padStart(6, '0')};margin-right:7px"></i>第${SFP_CN[d.no - 1]}门 · ${esc(d.title)}</span><span style="font-size:var(--fs-xs);color:#9d9170">${g.length}位${d.no === curDoor ? ' · 现居' : ''}</span></summary>
      <div style="font-size:var(--fs-xs);color:#9d9170;margin:3px 0 7px">门坐标 · 界域：${esc(anchorsTxt)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${chips}</div></details>`;
  });
  const curP = sfpS.pos ? SFP_BY[sfpS.pos] : null;
  const p = el(`<div class="panel"><h2>选佛谱 · 十五门全图</h2><div class="body">
    <div class="cMeta">十五门 · 二百二十位${curP ? ` · 现居「${esc(curP.name)}」` : ''}</div>
    <div class="cNote" style="margin:4px 0 6px">每门的坐标即其位次在十法界棋盘上的界域；展开一门，点任一位即飞往该珠。</div>${bodyH}
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="mapOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  (p.querySelector('#mapOk')               ).addEventListener('click', closeOverlay);
  p.querySelectorAll('.sfpChip').forEach(c => c.addEventListener('click', () => {
    const pid = pidOf((c               ).dataset.pid);
    closeOverlay(); sfpLocate(pid);
  }));
  openOverlay(p);
}

// V92 见闻录：跨局只记可数事件（曾见位／总掷／入恶趣／升沉），不作任何判语。
function lgMark(id        , dir         ) {
  const lg = save.lg;
  const p = SFP_BY[id];
  if (!p) return;
  if (!lg.seen.includes(id)) lg.seen.push(id);
  if (dir === 'down') lg.back++;
  if (dir === 'up' || dir === 'pure') lg.up++;
  if (p.door === 3) lg.evil++;
  persist();
}
function lgSeenByDoor() {
  const out                         = {};
  for (const id of save.lg.seen) {
    const p = SFP_BY[id];
    if (p) out[p.door] = (out[p.door] || 0) + 1;
  }
  return out;
}
const SFP_DOOR_TOTAL = (() => {
  const out                         = {};
  for (const p of (SFP_POS         )) out[p.door] = (out[p.door] || 0) + 1;
  return out;
})();
function openLogbook() {
  const lg = save.lg;
  const by = lgSeenByDoor();
  const total = (SFP_POS         ).length;
  const rows = (SFP_DOORS         ).map(d => {
    const n = by[d.no] || 0;
    const t = SFP_DOOR_TOTAL[d.no] || 0;
    const pc = t ? Math.round(n / t * 100) : 0;
    return `<button class="lgRow${n ? '' : ' z'}" data-dn="${d.no}" type="button">
      <span class="d">${SFP_CN[d.no - 1]}</span><span class="t">${esc(d.title)}</span>
      <span class="bar"><i style="width:${pc}%"></i></span><span class="n">${n}/${t}</span><span class="go">›</span></button>`;
  }).join('');
  const p = el(`<div class="panel"><h2>见闻录 · 历局所见</h2><div class="body">
    <div class="lgTop"><b>${lg.seen.length}</b><span>/ ${total} 位</span><i>全谱十五门二百二十位；每落一位、每途经一位即记，跨局只增不减</i></div>
    <div class="lgWrap">${rows}</div>
    <div class="lgNums">
      <div><b>${lg.games}</b><span>开局</span></div><div><b>${lg.tos}</b><span>总掷数</span></div>
      <div><b>${lg.up}</b><span>升</span></div><div><b>${lg.back}</b><span>沉</span></div>
      <div><b>${lg.evil}</b><span>入恶趣</span></div><div><b>${save.sfpWins || 0}</b><span>及第</span></div>
    </div>
    <div class="verse" style="margin-top:10px"><i class="duL">敘</i>能使人即遊戲間。頓知六道往還之疲苦。三乘出要之差別。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div>
    <div class="cNote">只记掷数、升沉次数和曾见之位；不计先后，不判高下。</div></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="gbtn primary" id="lgGo" style="flex:1 0 100%">${sfpS.active ? '回到局中' : '入选佛场'}</button>
      <button class="gbtn" id="lgMap" style="flex:1">十五门全图</button>
      <button class="gbtn" id="lgOk" style="flex:1">关闭</button></div></div>`);
  (p.querySelector('#lgGo')               ).addEventListener('click', () => {
    closeOverlay();
    if (!sfpS.active) openSfpIntro();
  });
  (p.querySelector('#lgMap')               ).addEventListener('click', () => { closeOverlay(); openSfpMap(); });
  (p.querySelector('#lgOk')               ).addEventListener('click', closeOverlay);
  p.querySelectorAll('.lgRow').forEach(row => row.addEventListener('click', () => {
    closeOverlay();
    openDoorBrief(Number((row               ).dataset.dn));
  }));
  openOverlay(p);
}
function openDoorBrief(dn        ) {
  const door = SFP_DOOR_BY[dn];
  if (!door) return;
  const cn = (SFP_CANON_DOORS       )[dn];
  const seen = lgSeenByDoor()[dn] || 0;
  const total = SFP_DOOR_TOTAL[dn] || 0;
  const plain = (SFP_DOOR_PLAIN       )[dn];
  const originalIntro = cn && cn.intro && ![1, 2, 15].includes(dn);
  const names = (SFP_POS         ).filter(x => x.door === dn);
  const listHtml = names.map(x => `<span class="lgP${save.lg.seen.includes(x.id) ? ' on' : ''}">${esc(x.name)}</span>`).join('');
  const p = el(`<div class="panel"><h2>第${SFP_CN[dn - 1]}门 · ${esc(door.title)}</h2><div class="body">
    <div class="cMeta">本门 ${total} 位，已见 ${seen} 位${cn ? ` · 原文见卷第${SFP_CN[cn.juan - 1]}` : ''}</div>
    ${plain ? `<div class="cPlain" style="margin:6px 0">${glossify(esc(plain))}</div>` : ''}
    ${originalIntro ? `<div class="verse" style="margin-top:6px"><i class="duL">譜曰</i>${verseHtml(cn.intro)}<span class="cSrc" style="display:block">《選佛譜》卷第${SFP_CN[cn.juan - 1]} · ${esc(door.title)}總說</span></div>`
      : '<div class="cNote" style="margin-top:6px">本门原谱无总说一篇（谱文直列位次），可入全门谱文逐位读原文。</div>'}
    <div class="lgPs">${listHtml}</div>
    <div class="cNote">上列为本门诸位，已见者亮显；见闻录只记曾见。</div></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="gbtn primary" id="dbCanon" style="flex:1 0 100%">读本门谱文原文</button>
      <button class="gbtn" id="dbBack" style="flex:1">回见闻录</button>
      <button class="gbtn" id="dbOk" style="flex:1">关闭</button></div></div>`);
  (p.querySelector('#dbCanon')               ).addEventListener('click', () => { closeOverlay(); openCanon(dn); });
  (p.querySelector('#dbBack')               ).addEventListener('click', () => { closeOverlay(); openLogbook(); });
  (p.querySelector('#dbOk')               ).addEventListener('click', closeOverlay);
  openOverlay(p);
}

// 轮相表法：依原谱卷一「輪相表法第一」原文，不加今解
const SFP_PLAIN                         = {
  '那': '表見惑（屬見煩惱）', '謨': '表思惑（屬愛煩惱）',
  '阿': '表施善', '彌': '表戒善', '陀': '表定善', '佛': '表善慧（無漏善）',
};
const sfpPlain = (combo        ) => combo.split('').map(ch => `「${ch}」${SFP_PLAIN[ch] || ''}`).join(' + ');
function openSfpHelp() {
  const row = (ch        , good         ) => `<div style="display:flex;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(215,170,69,.15)">
    <span style="width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center;font-size:var(--fs-xl);
      border:1.5px solid ${good ? '#d7aa45' : '#b0543f'};border-radius:8px;color:${good ? '#f4e6b8' : '#f0af9e'}">${ch}</span>
    <span style="font-size:var(--fs-md);color:#e6d9ab">${SFP_PLAIN[ch]}</span>
    <span style="margin-left:auto;font-size:var(--fs-xs);color:#9d9170">${good ? '善 ↑' : '惡 ↓'}</span></div>`;
  const h = (t        ) => `<div class="cMeta" style="margin:12px 0 5px;border-bottom:1px solid rgba(215,170,69,.3);padding-bottom:3px">${t}</div>`;
  // 依原谱卷首（敘·輪相表法第一·紀事）重述缘起与规则（v193）；引文皆逐字原文，出蕅益大师《選佛譜》公版
  const p = el(`<div class="panel"><h2>选佛谱 · 谱意与玩法</h2><div class="body">
    ${h('缘 起 —— 大 师 初 心')}
    <div style="font-size:var(--fs-md);color:#dccf9f;line-height:1.75">蕅益大师见法友耽嗜博弈，思以选佛之图易之；五十五岁单丁行脚至歙浦，十三日成谱。自敘其愿：<b style="color:#f4e6b8">「能使人即遊戲間，頓知六道往還之疲苦，三乘出要之差別，誠為不可思議。」</b>谱中一切升沉去向，「皆本教乘，非出臆見」——这局游戏的每一步，都踏在经论上。</div>
    ${h('轮 相 —— 为 何 恭 敬 对 待 掷 轮')}
    <div style="font-size:var(--fs-md);color:#dccf9f;line-height:1.75"><b style="color:#d7aa45">谱曰原文：</b>「輪如占察輪相。而作六面。以那謨阿彌陀佛六字。順次右旋。刻於六面。」又问何不用幺二三四五六，答曰：「幺二三四五六。不過世間數目。是無記法。不能生善滅惡。那謨阿彌陀佛六字。乃是萬德洪名。……<b style="color:#f4e6b8">一稱佛名。能滅八十億劫生死重罪。</b>」<br><b style="color:#d7aa45">释义：</b>原谱以佛号六字取代世间数目，使每次掷轮都表持名与善恶升沉之义。<br><b style="color:#d7aa45">本项目操作规则：</b>长按掷轮时至心称念一句佛号，念毕松手旁掷；请如持名般恭敬对待。</div>
    <div style="margin:8px 0">${row('那', false)}${row('謨', false)}${row('阿', true)}${row('彌', true)}${row('陀', true)}${row('佛', true)}</div>
    ${h('规 则')}
    <div style="font-size:var(--fs-md);color:#dccf9f;line-height:1.75">
    · 每掷二轮，得两字组合：<b>善字多则升，恶字多则降</b>；何组合往何处，逐位皆依原谱行法表。判词窗分别标示「行法原文」「谱曰原文」「释义」「本项目操作规则」；原谱未单释缘由时，不补作「谱曰」。<br>
    · 十五门二百二十位为一局：自發始因地入局，历恶趣、人天、色无色、生善灭恶、戒定慧三学、藏通别圆四教位次、净土横超，至圆极果位<b>「选佛及第」</b>为毕局。<br>
    · <b>没有输</b>：坠地狱饿鬼非失败，只是看清业果——谱云「逆惡猛心，準觀經而許歸淨土」，原谱本无绝路，续掷总能回升。</div>
    ${h('一 分 钟 上 手')}
    <div style="font-size:var(--fs-md);color:#dccf9f;line-height:1.75">
    ① <b>长按掷钮</b>＝谱曰「置輪掌心」——按自己的节奏至心称念一句「南无阿弥陀佛」；<b>念毕松手</b>＝「仰手旁擲」。<br>
    ② 判词窗先读白话判定，需要时展开逐字原文，点<b>「行」</b>落子；下滑可收成细签（桌面：空格＝掷、回车＝行）。<br>
    ③ 判词里点位名读白话与原文；掷钮右侧「问」可与本谱对话（问谱位·名相·行法，接 G 版选佛谱智能体依经检证）；最右「⋯」有全谱与行迹。<br>
    ④ 星图常开可自由观照：点顶栏题字直览全图；单击门星／门签入门，位珠位名点之读谱注，长按速览、双击飞临；Esc／「全图」返回。</div></div>
    <div style="margin-top:12px"><button class="gbtn primary" id="sfpHelpOk" style="width:100%">敬领谱意 · 恭敬开掷</button></div></div>`);
  (p.querySelector('#sfpHelpOk')               ).addEventListener('click', () => {
    closeOverlay();
    if (sfpS.active && sfpS.n === 0) showToast('第一掷定「发始因地」：长按掷钮，至心称念一句佛号，念毕松手旁掷', 4800);
  });
  openOverlay(p);
}

function startSfp(resume         ) {
  closeOverlay(); closeCard();
  // 调试钩子：仅供自测驱动（不影响玩法）
  (window       ).__sfpGo = (id        ) => { if (sfpS.active) sfpGoto(id, '调试移位'); };
  (window       ).__lgDbg = (patch      ) => {
    if (patch) { Object.assign(save.lg, patch); persist(); }
    return JSON.parse(JSON.stringify(save.lg));
  };
  (window       ).__sfpInert = (id        ) => { const p = (SFP_BY       )[id]; return p ? { pos: sfpS.pos, pure: !!p.pure, inert: !p.moves.some((m     ) => m.c.some((c        ) => ['那那', '那謨', '謨謨'].includes(c))), mv: p.moves.map((m     ) => m.c.join('/')) } : null; };
  (window       ).__sfpBead = (pid        ) => { const v = sfpBeadLocal[pid]; return v ? [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100] : null; }; // 自测：位珠锚点局部坐标
  (window       ).__sfpTone = (pid        ) => { for (const m of sfpBeadMeshes) { const i = (m.userData.pids             || []).indexOf(pid); if (i >= 0 && m.instanceColor) { const a = m.instanceColor.array                ; return Math.round((a[i * 3] + a[i * 3 + 1] + a[i * 3 + 2]) * 100) / 100; } } return null; }; // 自测：位珠实例色三通道和（明度档差用）
  (window       ).__sfpFx = () => ({ beam: mgBeam.visible, beamOp: Math.round((mgBeam.material                           ).opacity * 1000) / 1000 }); // 自测：蒙光光幢状态
  (window       ).__sfpFocus = () => [focusDoorA, focusDoorB, browseDoor, sfpBeadMeshes.filter(m => m.visible).length, sfpBeadMeshes.length];
  (window       ).__sfpWorldY = (dno        ) => (SFP_POS         ).filter(p => p.door === dno && !SFP_PURE_LAYOUT[p.id])
    .map(p => Math.round((byId[p.anchor].d.pos[1] + sfpBeadLocal[p.id].y) * 100) / 100);
  (window       ).__foot = () => ({ trail: sfpS.trail.length, objs: footGroup.children.length + footPure.children.length });
  (window       ).__thread = (dno        ) => doorThreads[dno] ? doorThreads[dno].visible : null;
  (window       ).__doorXY = (dno        ) => { // 门题字屏幕坐标（自测用）
    const b = doorStarBest[dno]; if (!b || !b.labelSp) return null;
    const v = b.labelSp.getWorldPosition(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, z: v.z, vis: b.labelSp.visible };
  };
  (window       ).__pureXY = (pid        ) => { // 极乐四土/诸位命中球屏幕坐标（v168 自测用）
    const h = pureHits.find(m => m.userData.purePid === pid); if (!h) return null;
    const wp = h.getWorldPosition(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (wp.x + 1) / 2 * r.width, y: r.top + (1 - (wp.y + 1) / 2) * r.height, z: wp.z, n: pureHits.length };
  };
  (window       ).__door = () => ({ inDoor, labels: doorLabelEls.length, saha: saha.visible, browse: browseDoor,
    othersHidden: sfpBeadMeshes.filter(m => m.userData.door !== focusDoorA && m.userData.door !== focusDoorB && m.userData.door !== browseDoor).every(m => !m.visible),
    starsOn: Object.keys(doorStarBest).filter(k => doorStarBest[Number(k)].star && doorStarBest[Number(k)].star.visible).map(Number),
    hotSc: sfpBeadMeshes.find(m => m.userData.door === (browseDoor || focusDoorA))?.userData.sc });
  (window       ).__doorStarXY = (dno        ) => {
    const b = doorStarBest[dno]; if (!b || !b.star) return null;
    const wp = (b.star              ).getWorldPosition(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (wp.x + 1) / 2 * r.width, y: r.top + (1 - (wp.y + 1) / 2) * r.height, z: wp.z };
  };
  if (tourStep >= 0) { tourStep = -1; }
  stopChant();                       // 上一局的唱赞不带进新局
  cometCancel();
  setModeInstant(0);
  sfpS.active = true; sfpS.rolling = false; sfpS.finished = false;
  sfpVictoryHandled = false;
  sfpBonusLeft = 0;
  sfpMsgLog = [];
  sfpFaceEls.forEach(f => { f.textContent = ''; });
  (sfpFaceEls[0].parentElement               ).style.display = 'none';
  if (resume && save.sfp && SFP_BY[save.sfp.pos]) {
    sfpS.pos = save.sfp.pos; sfpS.n = save.sfp.n;
    sfpS.seenD = Array.isArray((save.sfp       ).seenD) ? (save.sfp       ).seenD.slice() : [];
    sfpS.trail = Array.isArray((save.sfp       ).trail) ? (save.sfp       ).trail.slice() : [save.sfp.pos]; // 旧档无足迹：至少点亮现居
    sfpHist = Array.isArray(save.sfp.hist) ? save.sfp.hist.slice() : [];
    const p = SFP_BY[sfpS.pos];
    sfpFlyAnchor(p); sfpStatus();
    rebuildFoot();
    sfpShowMsg(`续掷：现居「${p.name}」`);
  } else {
    sfpS.pos = null; sfpS.n = 0;
    save.lg.games++;
    persist();
    sfpS.seenD = [];
    sfpS.trail = [];
    rebuildFoot();
    pawnHide(); pawnLandPending = false; pawnLandDir = '';
    sfpHist = [];
    if (inPure || inSky) returnSaha();
    if (inDoor) exitDoor(false); // 新开局若身在门内：先出门再呈全图
    sfpStatus();
    sfpShowMsg('先掷發始因地：二十一种组合，二十一种起点业因');
    // 开局白：第一次面对發始因地，一句说清这一掷在掷什么（首次开局由玩法卡收尾语代为交代）
    if ((save       ).sfpHelp) showToast('第一掷定「发始因地」——此生从何处起步，掷了便知', 4200);
    // 开局先呈十法界全图（用户点单）：不跳南洲，第一掷落定后随行棋飞位
    flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0));
  }
  document.body.classList.add('sfpOn'); // 局中：聊天面板据此抬到掷轮台之上
  conMin = false; applyConVis();
  setSfpFocus(save.sfpFocus ? (sfpS.pos ? SFP_BY[sfpS.pos].door : 0) : 0);
  setFlight(false);
  setSecOn(true); // 探底竖杆常开（一套系统）
  freeDock.style.display = 'none';
  updateModeChip();
  playBell(196, 0.05);
  // 首次开局：自动弹白话玩法速览。
  // 但联机已开局时绝不弹——共同开局后轮次限时立刻开始跑，满屏教程压在掷轮台上，
  // 新人读完往往已超时被跳，两次即被移出行动序列。联机的教程改在准备室里出（见 Net.onJoined）。
  if (!(save       ).sfpHelp && !(Net.active && Net.isPlaying())) {
    (save       ).sfpHelp = true; persist(); openSfpHelp();
  }
}
function endSfp(msg = '选佛谱已收起，行处已存；点「选佛」可续掷') {
  if (!sfpS.active && !sfpS.finished) return;
  stopChant();                       // 收局即止唱赞，免得人已离场声音还在
  document.body.classList.remove('sfpOn');
  sfpS.active = false;
  sfpS.finished = false;
  pendingDoorIntro = null;
  hideDoorIntro();
  sfpBar.classList.remove('show'); conPill.classList.remove('show'); sfpDice.classList.remove('on');
  sfpWheelGroup.visible = false; wheelAnim = null; palmHeld = false; sfpBonusLeft = 0;
  sfpQuiet(false);
  setSfpFocus(0);
  if (sfpTimer) clearInterval(sfpTimer);
  cometCancel();
  doorDiveSeq++;
  cancelVerdict();
  setSkip(null);
  exitDoor(false);
  exitStarView(false);
  posRevealEl.classList.remove('show');
  sfpS.rolling = false;
  netClockSync();
  (sfpBar.querySelector('#sfpRoll')               ).classList.remove('dis');
  freeDock.style.display = ''; syncFreeDock();
  setFlight(true);
  updateLadder(); syncRollGlow();
  updateModeChip();
  sfpSave();
  showToast(msg);
}
let sfpVictoryHandled = false;
function sfpVictory(settled = false) {
  if (!sfpS.active || sfpVictoryHandled) return;
  if (Net.active && !settled && !Net.isFinished()) {
    vib([30, 60, 30, 60, 140]);
    playBell(524, 0.06);
    sfpS.rolling = false;
    sfpS.finished = true;
    syncRollGlow();
    showToast(Net.room.finishing
      ? '本座已选佛及第——正补齐本轮，随后共同结算'
      : '本座已选佛及第——等待共同结算', 5200);
    return;
  }
  sfpVictoryHandled = true;
  vib([30, 60, 30, 60, 140]); // 及第庆祝振
  save.sfpWins = (save.sfpWins || 0) + 1;
  save.sfp = null; persist();
  const n = sfpS.n;
  const trailSnapshot = sfpS.trail.slice();
  sfpS.active = false; sfpS.finished = true; sfpS.pos = null;
  document.body.classList.remove('sfpOn');
  sfpBar.classList.remove('show'); conPill.classList.remove('show');
  setSfpFocus(0);
  sfpDice.classList.remove('on');
  freeDock.style.display = ''; syncFreeDock();
  setFlight(true);
  updateLadder();
  updateModeChip();
  playBell(524, 0.06);
  // 成佛过场：金光遍照·莲花绽放，后出及第面板
  const fx = document.createElement('div'); fx.id = 'ascendFx';
  fx.innerHTML = `<div class="afGlow"></div><div class="afLotus">${Array.from({ length: 10 }, (_, i) =>
    `<i style="--ra:${i * 36}deg;animation-delay:${120 + i * 70}ms"></i>`).join('')}</div><div class="afWord">${zh('圓滿菩提 · 歸無所得')}</div>`;
  app.appendChild(fx);
  window.setTimeout(() => playVar('bell_heavy', 0.26, 1.2), 950);
  window.setTimeout(() => { void playChant(); }, 1400);
  fx.style.transition = 'opacity .7s';
  window.setTimeout(() => { fx.style.opacity = '0'; }, 2900);
  window.setTimeout(() => fx.remove(), 3700);
  // V90：成佛一刻只呈门十五「佛」位逐字原文与对读，不借别门引文拼成判词。
  const p = el(`<div class="panel keepOv"><h2>选佛及第 · 佛</h2><div class="body">
    <div class="cMeta">第 ${n} 掷，登第十五门「圓極果位」——圓教究竟妙覺位</div>
    ${fo15Html()}
    <div class="lgNums" style="margin-top:12px">
      <div><b>${n}</b><span>本局掷数</span></div><div><b>${save.lg.tos}</b><span>历局总掷</span></div>
      <div><b>${save.lg.evil}</b><span>历局入恶趣</span></div><div><b>${save.lg.seen.length}/${(SFP_POS         ).length}</b><span>见闻录</span></div>
      <div><b>${save.lg.back}</b><span>历局下沉</span></div><div><b>${save.sfpWins}</b><span>及第</span></div>
    </div>
    <div class="verse" style="margin-top:10px"><i class="duL">紀事</i>願以此功德。普施法界有情。同開妙解。深知法界事理性相。同發大願速生西方極樂世界。<span class="cSrc" style="display:block">《選佛譜》卷末 · 紀事（卷第六後）</span></div>
    ${Net.active ? '<div class="cNote">及第后本座留十分钟；久不再掷则自动让座给候着的莲友。</div>' : ''}
    <div id="lbLine" style="margin-top:10px;font-size:var(--fs-sm);color:#dccf9f">
      <div style="margin-bottom:5px"><b>${zh('本局已经结束')}</b> · ${zh(`本机已选佛 ${save.sfpWins} 次`)}</div>
      <div class="cNote" style="margin-bottom:7px">${zh(`本局共 ${n} 掷；每一掷记一声「南无阿弥陀佛」，共 ${n} 声。已自动汇入今日念佛功课榜，无需另行上榜。`)}</div>
      <button class="gbtn" id="lbView" style="width:100%">${zh('查看念佛功课榜')}</button>
    </div>
    ${(() => { // 同座现况：只陈述各人行处，不排名次——本谱纯由掷相所至，比快慢无义
      if (!Net.active) return '';
      const o = Net.players.filter(q => q.id !== Net.myId);
      if (!o.length) return '';
      return `<div style="margin-top:8px;font-size:var(--fs-sm);color:#9d9170">同座：` +
        o.map(q => `<span style="color:${q.color}">${esc(q.name)}</span> ${q.done ? `已及第（第 ${q.n} 掷）` : (q.n ? `第 ${q.n} 掷行谱中` : '未起行')}`).join(' · ') +
        `</div>`;
    })()}</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="gbtn primary" id="sfpAgain" style="flex:1;min-width:110px">${Net.active ? '准备下一局<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">等莲友共同准备</i>' : '再入选佛场'}</button>
      <button class="gbtn" id="sfpLg" style="flex:1;min-width:110px">见闻录</button>
      ${Net.active ? '<button class="gbtn" id="sfpLeave" style="flex:1;min-width:110px">离席回大厅<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">让座给莲友</i></button>' : ''}
      <button class="gbtn" id="sfpFree" style="flex:1;min-width:110px">观照星图${Net.active ? '<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">留座旁观</i>' : ''}</button></div></div>`);
  // 及第面板和别的卡一样可以被 ✕／点背景／滑动关掉，但从前只有卡上那几个钮会收尾——
  // 手关就什么都不清：唱赞照唱、乘光流星挂在天上、局面停在「活局在终点」的僵尸态。
  // 现在把「关掉这张卡」一律解释为「入自由观照」，与「观照星图」同一个出口。
  const leaveVictory = (msg = '一局功圓——已入自由观照，点「选佛」可再入选佛场') => {
    stopChant();
    cometCancel();
    endSfp(msg);
    flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
  };
  const takeAction = (fn) => () => { overlayOnClose = null; closeOverlay(); fn(); };
  const leaveBtn = p.querySelector('#sfpLeave')                      ;
  if (leaveBtn) leaveBtn.addEventListener('click', takeAction(() => { // 让座给候着的莲友
    stopChant();
    cometCancel();
    Net.leave();                       // onLeft 会收局并开大厅
  }));
  const againBtn = p.querySelector('#sfpAgain')                      ;
  if (againBtn) againBtn.addEventListener('click', takeAction(() => {
    stopChant();
    if (Net.active) {
      Net.setReady(true);
      Net.openPanel();
      showToast('已准备下一局——待至少两位准备后由房主共同开局', 4200);
    } else startSfp(false);
  }));
  (p.querySelector('#sfpLg')               ).addEventListener('click', takeAction(() => openLogbook()));
  (p.querySelector('#lbView')               ).addEventListener('click', takeAction(() => openPlaza()));
  (p.querySelector('#sfpFree')               ).addEventListener('click', takeAction(() => leaveVictory()));
  // v220：等落位俯冲收尾再弹（原定时与门观转场赛跑，慢机上面板会被转场收窗吞掉）
  // 兜底：转场若因故迟迟不结束，最多等六秒也要把面板放出来，不能让人对着一颗流星干瞪眼。
  const openedAt = Date.now();
  const openV = () => {
    if (sfpTransit && Date.now() - openedAt < 6000) { window.setTimeout(openV, 400); return; }
    if (sfpTransit) cometCancel();
    openOverlay(p);
    overlayOnClose = () => leaveVictory();
  };
  window.setTimeout(openV, 2300);
  void Plaza.flush(); // 终局即补送不足十掷的尾数；上榜无需用户再操作
  // 及第只自动登记为大厅结算动态与“今日及第”统计，不形成第二套榜单或手动上榜步骤。
  // 联机局的及第由本室服务器出具（掷数取权威棋况），前台不再自报——自报的房间战绩无从核实。
  if (Net.active) return;
  const depthOf = (pid) => {
    const anchor = SFP_BY[pid] && byId[SFP_BY[pid].anchor];
    return anchor ? anchor.d.pos[1] : NaN;
  };
  void Plaza.record({
    ...Plaza.runSummary(trailSnapshot, SFP_BY, n, 'solo', depthOf),
    name: Plaza.practiceName(),
  });
}
// 共同结算卡：本局了结时，未及第者与旁观者也该看到一张交代结果的卡。
// 从前只有及第者有面板，其余人只在掷轮钮下多一行小字，共修最该共有的一刻反而没有画面。
function openNetSettle(message         ) {
  if (!Net.active) return;
  const aborted = message?.reason === 'not_enough_players';
  const winners = Net.players.filter(q => q.done);
  const me = Net.me();
  const mine = me?.done
    ? `本座第 ${me.n} 掷选佛及第`
    : (me?.spectator ? '本局您在旁观，下一局即可入座'
      : (me?.n ? `本座行至第 ${me.n} 掷${sfpS.pos && SFP_BY[sfpS.pos] ? `，现居「${esc(SFP_BY[sfpS.pos].name)}」` : ''}` : '本座本局未起行'));
  const roster = Net.players.map(q => `<div class="nsRow">
      <span class="dot" style="background:${esc(q.color || '#e8c766')}"></span>
      <b>${esc(q.name)}${q.id === Net.myId ? '（我）' : ''}</b>
      <span>${q.done ? `第 ${q.n} 掷及第` : (q.spectator ? '候下局' : (q.n ? `第 ${q.n} 掷` : '未起行'))}</span>
    </div>`).join('');
  const head = aborted ? '本局中止' : (winners.length
    ? `${winners.map(q => esc(q.name)).join('、')}本局及第`
    : '本局已共同结算');
  const p = el(`<div class="panel nsPanel"><h2>共同结算</h2><div class="body">
    <div class="cMeta">${esc(Net.roomLabel())} · 第 ${Net.room.round || 1} 轮</div>
    <div class="nsHead">${head}</div>
    <div class="nsMine">${mine}</div>
    ${aborted ? '<div class="cNote">有效同修不足两位，本局未及结算即止。</div>' : ''}
    <div class="nsList">${roster}</div>
    <div class="cNote">本谱纯由掷相所至，同座只陈行处，不较先后。</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="gbtn primary" id="nsAgain" style="flex:1;min-width:110px">准备下一局</button>
      <button class="gbtn" id="nsLeave" style="flex:1;min-width:110px">离席回大厅</button>
      <button class="gbtn" id="nsFree" style="flex:1;min-width:110px">观照星图</button>
    </div></div></div>`);
  // 与及第面板同例：手关这张卡＝入自由观照，不留半死不活的局面
  const settleFree = () => { stopChant(); cometCancel(); endSfp('已入自由观照——留座旁观，点「选佛」可回局中'); };
  const act = (fn) => () => { overlayOnClose = null; closeOverlay(); fn(); };
  (p.querySelector('#nsAgain')               ).addEventListener('click', act(() => {
    Net.setReady(true);
    Net.openPanel();
  }));
  (p.querySelector('#nsLeave')               ).addEventListener('click', act(() => Net.leave()));
  (p.querySelector('#nsFree')               ).addEventListener('click', act(settleFree));
  openOverlay(p);
  overlayOnClose = settleFree;
  zhDom(p);
}
// 同修及第：金色横幅一记磬声，不弹窗不打断——您可能正握着轮，及第是可随喜之事，不是要处理之事
let peerWinT = 0;
const peerWinEl = el('<div id="peerWin" class="ui"></div>');
app.appendChild(peerWinEl);
function sfpPeerWin(name, n) {
  peerWinEl.innerHTML = `<b>${esc(name)}</b>${zh(n ? ` 第 ${n} 掷选佛及第` : ' 选佛及第')}<i>${zh('随喜')}</i>`;
  peerWinEl.classList.add('show');
  playBell(440, 0.05);
  clearTimeout(peerWinT);
  peerWinT = window.setTimeout(() => peerWinEl.classList.remove('show'), 5200);
}

// ---------------- 共修大厅 ----------------
// 一排排桌子＋动态广播；两个去处：一人行谱（不占座）与入座共修室（准备后共同开局，桌号可发给莲友）。
let plazaTimer = 0;
let plazaJoining = false;
function plazaStop() { if (plazaTimer) { clearInterval(plazaTimer); plazaTimer = 0; } }
function plazaSetJoining(on) {
  plazaJoining = !!on;
  const panel = document.querySelector('.pzPanel');
  if (!panel) return;
  panel.classList.toggle('joining', plazaJoining);
  panel.setAttribute('aria-busy', plazaJoining ? 'true' : 'false');
  panel.querySelectorAll('#pzSolo,#pzQuick').forEach((button) => { button.disabled = plazaJoining; });
  panel.querySelectorAll('.pzT').forEach((button) => {
    button.disabled = plazaJoining || (button.classList.contains('s-full') && !button.classList.contains('mine'));
  });
  const label = panel.querySelector('#pzQuick em');
  if (label) label.textContent = zh(plazaJoining ? '正在入座…' : '随喜入座');
}

async function plazaSit(code, nameArg = '', needKey = false, keyArg = '') {
  const name = nameArg || Plaza.savedName();
  if (!name) { openPlazaSitName(code, keyArg); return; }      // 无存名：只问这一次
  if (needKey && !keyArg) { openPlazaSitKey(code); return; }  // 上锁之室：先问密码
  if (plazaJoining) { showToast(zh('正在入座，请稍候'), 1800); return; }
  const ord = Plaza.TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
  if (Net.active) {
    if (Net.code === code) { plazaStop(); closeOverlay(); Net.openPanel(); return; } // 点的就是自己那室
    // 换室＝先让出原座。正在行谱时这一走可能中止全房的局，不能无声无息。
    if (!await confirmLeaveMatch(`离开本局，换到共修室${ord}`)) return;
  }
  plazaSetJoining(true);
  try {
    if (Net.active) await Net.leave({ notify: false });        // 一人只在一室：旧座释放后才能换房
    await Net.joinRoom(code, name, null, keyArg);
    plazaStop(); closeOverlay();
    Net.openPanel();
    // 中途入室是旁观，不是入局：别拿「两位准备即可开局」糊弄他等一个不属于他的轮次
    showToast(zh(Net.isSpectator()
      ? `已入共修室${ord}——本局已开始，您在下一局入座`
      : `已入共修室${ord}——两位准备即可开局`), 4200);
  } catch (e) {
    const msg = (e && e.message) || '';
    if (/密码|上锁/.test(msg)) { openPlazaSitKey(code, msg); return; } // 密码错：留在密码卡上重填
    // 另一个页面持着「在别室」标记。微信里从聊天点开就是一个新 WebView，
    // 旧的常留在后台不发 pagehide——所以一律问一句就放行，不叫人对着一句拒绝干等。
    if (e?.code === 'other_tab') {
      plazaSetJoining(false);
      const go = await askConfirm(
        '另一个页面还占着座位',
        '本机另一个页面登记为「在别的共修室中」。<b>若那个页面已经关了</b>，可以从这里接管入座。',
        '已关闭，接管入座', '再想想',
      );
      if (!go) { openPlaza(); return; }
      Net.takeOverLocalRoom();
      return plazaSit(code, nameArg, needKey, keyArg);
    }
    showToast(zh(msg || '此室暂时坐不下，请换一室'), 3200);
    openPlaza();                                    // 满座/断线：退回大厅重看桌况
  } finally {
    plazaSetJoining(false);
  }
}

function openPlazaSitName(code, keyArg = '') {
  plazaStop();
  const returnToPlaza = () => {
    overlayOnClose = null;
    openPlaza();
  };
  const p = Plaza.renderSitName(code, {
    el, esc,
    onSit: (c, name) => {
      overlayOnClose = null;
      return plazaSit(c, name, false, keyArg);
    },
    onBack: returnToPlaza,
  });
  openOverlay(p);
  overlayOnClose = returnToPlaza;
  zhDom(p);
}

// ── 我的功课 ──
// 全站与个人用同一组列（累计 / 今日），上下一对照就懂——这是「一眼看懂」的机关所在。
// 月历沿用念佛计数器的做法：格里是日期，格下是当日掷数，能直接读出数，不只看深浅。
const MY_WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const dayKeyOf = (d          ) => {
  const bj = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000); // 北京时区日界，与服务器同口径
  return `${bj.getFullYear()}-${String(bj.getMonth() + 1).padStart(2, '0')}-${String(bj.getDate()).padStart(2, '0')}`;
};
function myMonthHtml(daily                          , year        , month        ) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;                 // 周一起头
  const last = new Date(year, month + 1, 0).getDate();
  const today = dayKeyOf(new Date());
  let sum = 0;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="myCell pad"></span>';
  for (let d = 1; d <= last; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = Number(daily[key] || 0);
    sum += n;
    cells += `<span class="myCell${n ? ' on' : ''}${key === today ? ' now' : ''}">
      <i>${d}</i><b>${n || ''}</b></span>`;
  }
  return { html: cells, sum };
}
function openMine() {
  const lg = save.lg;
  const p = el(`<div class="panel myPanel"><h2>我的功课</h2><div class="body">
    <div class="myLoad">正在取功课……</div></div></div>`);
  openOverlay(p);
  zhDom(p);
  const body = p.querySelector('.body')               ;
  let cursor = new Date();                            // 月历当前月
  let mine                    = null;

  const paint = () => {
    if (!mine) return;
    const { html, sum } = myMonthHtml(mine.daily || {}, cursor.getFullYear(), cursor.getMonth());
    const runs = (mine.runs || []).slice(0, 8).map(r => `<div class="myRun">
      <b>第 ${r.n} 掷及第</b>
      <span>${r.path === 'pure' ? '横超净土' : '竖出'}${r.lowest ? ` · 最深 ${esc(r.lowest)}` : ''}${r.doors?.length ? ` · 历 ${r.doors.length} 门` : ''}</span>
      <em>${r.seat === 'solo' ? '一人行谱' : '共修室'}</em>
    </div>`).join('');
    body.innerHTML = `
      <div class="myWho"><span>功课记在</span><b>${esc(Plaza.practiceName())}</b><button class="gbtn" id="myRename">改名号</button></div>
      <div class="myGrid">
        <div><i>全站累计</i><b>${myNum(mine.siteTosses)}</b></div>
        <div><i>全站今日</i><b>${myNum(mine.siteToday)}</b></div>
        <div class="me"><i>我的累计</i><b>${myNum(mine.tosses)}</b></div>
        <div class="me"><i>我的今日</i><b>${myNum(mine.today)}</b></div>
      </div>
      <div class="myLine">共修 ${myNum(mine.days)} 天 · 连续 ${myNum(mine.streak)} 日 · 及第 ${myNum(mine.wins)}</div>
      <div class="myCal">
        <div class="myCalHead">
          <button class="gbtn" id="myPrev" aria-label="上一月">‹</button>
          <b>${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月</b>
          <button class="gbtn" id="myNext" aria-label="下一月">›</button>
          <span>本月 ${myNum(sum)}</span>
        </div>
        <div class="myWk">${MY_WEEK.map(w => `<span>${w}</span>`).join('')}</div>
        <div class="myDays">${html}</div>
      </div>
      <div class="myLine2">行谱见闻 · 本机</div>
      <button class="gbtn myRow" id="myLg">
        <span>开局 ${lg.games} · 升 ${lg.up} · 沉 ${lg.back} · 见 ${lg.seen.length}/${(SFP_POS         ).length} 位</span><i>›</i></button>
      ${runs ? `<div class="myLine2">我的行谱记录</div><div class="myRuns">${runs}</div>` : ''}
      <div class="cNote">一掷一称念「南无阿弥陀佛」，只作随喜记录，不作修证高下。功课记在本机莲号下，换设备会另计。</div>
      <button class="gbtn primary" id="myOk" style="margin-top:12px;width:100%">${sfpS.active ? '回到局中' : '关闭'}</button>`;
    zhDom(p);
    (body.querySelector('#myPrev')               ).addEventListener('click', () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); paint(); });
    (body.querySelector('#myNext')               ).addEventListener('click', () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); paint(); });
    (body.querySelector('#myOk')               ).addEventListener('click', closeOverlay);
    (body.querySelector('#myLg')               ).addEventListener('click', () => { closeOverlay(); openLogbook(); });
    (body.querySelector('#myRename')               ).addEventListener('click', () => { closeOverlay(); openPlazaRename(); });
  };

  (async () => {
    try {
      await Plaza.flush();                            // 先把本机未送达的掷数补上，数字才是最新的
      const [me, site] = await Promise.all([Plaza.fetchMine(), Plaza.fetchPlaza()]);
      if (!p.isConnected) return;
      mine = { ...me, siteTosses: site.tosses, siteToday: site.tossesToday };
      paint();
    } catch (e) {
      if (!p.isConnected) return;
      body.innerHTML = `<div class="cNote">${zh('功课暂时取不到，请稍后再看。')}</div>`
        + `<button class="gbtn primary" id="myOk" style="margin-top:10px;width:100%">${zh('关闭')}</button>`;
      (body.querySelector('#myOk')               ).addEventListener('click', closeOverlay);
    }
  })();
}
const myNum = (n         ) => Number(n || 0).toLocaleString('en-US');

// 取名／改名（从「我的」进）：只存本机名号，不涉入座
function openPlazaRename() {
  plazaStop();
  const back = () => { overlayOnClose = null; openPlaza(); };
  const p = Plaza.renderSitName('', {
    el, esc, rename: true,
    onSit: async (_c, name) => {
      Plaza.saveName(name);
      // 先把改名送达再重开大厅，否则大厅那一拉取比改名快，榜上还是旧名
      await Plaza.flush();
      await Plaza.pushName();
      overlayOnClose = null;
      openPlaza();
      showToast(zh(`功课自此记在「${name}」名下`), 3600);
    },
    onBack: back,
  });
  openOverlay(p);
  overlayOnClose = back;
  zhDom(p);
}

function openPlazaSitKey(code, errText = '') {
  plazaStop();
  const p = Plaza.renderSitKey(code, {
    el,
    onKey: (c, key) => plazaSit(c, '', false, key),
    onBack: () => openPlaza(),
  }, errText);
  openOverlay(p); zhDom(p);
}

function plazaRender(data) {
  const p = Plaza.renderPlaza(data, {
    el, esc, zh,
    seatedAt: Net.active ? Net.code : '',
    backText: sfpS.active ? '回到局中' : '返回',
    onSolo: async () => {                           // 一人行谱：不占座，若在房先离席
      if (!await confirmLeaveMatch('离开本局，改为一人行谱')) return;
      plazaStop(); closeOverlay();
      if (Net.active) Net.leave({ notify: false });
      startSfp(false);
    },
    onSit: (code, _n, locked) => plazaSit(code, '', !!locked),
    onQuick: (code) => {
      if (!code) { showToast(zh('本厅诸室皆满——请稍候或一人行谱'), 3200); return; }
      plazaSit(code);
    },
    onClose: () => { plazaStop(); closeOverlay(); if (!sfpS.active) openTitle(); },
  });
  zhDom(p);
  return p;
}

async function openPlaza() {
  plazaStop();
  const loading = el(`<div class="panel pzPanel pzLoading"><div class="pzLoadingInner">
    <span>选佛谱</span><h2>共修大厅</h2><div class="body"><div class="cbStage">正在入大厅……</div></div>
  </div></div>`);
  openOverlay(loading); zhDom(loading);
  let panel = null;
  const draw = async () => {
    try {
      const data = await Plaza.fetchPlaza();
      if (!loading.isConnected && !(panel && panel.isConnected)) { plazaStop(); return; } // 已离开大厅
      if (!panel) {
        panel = plazaRender(data);
        openOverlay(panel);
      } else {
        // 定时刷新只补写数字与桌况：不重开覆盖层，保住滚动、焦点与已展开的功课榜。
        Plaza.updatePlaza(panel, data, {
          ...panel._plazaUi,
          seatedAt: Net.active ? Net.code : '',
          backText: sfpS.active ? '回到局中' : '返回',
        });
        zhDom(panel);
      }
    } catch (e) {
      plazaStop();
      if (!loading.isConnected) return;
      loading.querySelector('.body').innerHTML =
        `<div class="cNote">${zh('大厅暂时连接不上，请稍后再试')}</div>` +
        `<button class="gbtn primary" id="pzRetry" style="margin-top:10px;width:100%">${zh('重试')}</button>` +
        `<button class="gbtn" id="pzSolo2" style="margin-top:8px;width:100%">${zh('一人行谱')}</button>`;
      loading.querySelector('#pzRetry').addEventListener('click', () => openPlaza());
      loading.querySelector('#pzSolo2').addEventListener('click', () => { closeOverlay(); startSfp(false); });
    }
  };
  await draw();
  plazaTimer = window.setInterval(draw, 8000);      // 桌况随人来人往变，八秒一refresh
}
function sfpMovesHtml(p     )         {
  if (!p.moves.length) return '<div style="color:#9d9170;font-size:var(--fs-sm)">此位为究竟果位，无升降。</div>';
  const whyMap = ((SFP_WHY_EVIDENCE       )[p.id] || {})                          ;
  const listed = new Set        ();
  const rows = (p.moves         ).map(mv => {
    let to = mv.to ? `往「${mv.to}」` : '';
    if (mv.bonus) to += (to ? '，' : '') + `贈${'一二三四'[mv.bonus - 1]}掷`;
    if (mv.act) to += `，依「${mv.act}」行`;
    const w = (mv.c            ).map(c => { listed.add(c); return whyMap[c]; }).find(x => x);
    return `<div class="mv"><b>${mv.c.join(' · ')}</b><span>${to}${w ? sfpEvidenceCompactHtml(w) : ''}</span></div>`;
  }).join('');
  // 不行之组：原谱注中有说明缘由者一并列出
  const stayRows = Object.keys(whyMap).filter(c => !listed.has(c)).map(c =>
    `<div class="mv"><b>${c}</b><span style="color:#9d9170">不行${sfpEvidenceCompactHtml(whyMap[c])}</span></div>`).join('');
  return '<div class="sfpMoves">' + rows + stayRows + '<div class="cNote" style="margin-top:6px">未列组合：不行（安住本位）；小字已按“行法原文／谱曰原文／释义”分层。</div></div>';
}
// 譜曰排版：整段连排便于阅读（用户点单，原一句一行已撤）；只改排版不动原文，名相词典照过
const verseHtml = (t        ) => glossify(esc(t));
// V90 成佛原文说明：及第面板只呈门十五「佛」位逐字原文、白话对读及本门图注。
function fo15Html() {
  const cn15 = (SFP_CANON_DOORS       )[15]                                                                                                 ;
  const t = String(cn15?.positions?.[0]?.text || SFP_BY['圓教究竟妙覺位'].note).replace(/^譜曰。/, '');
  const cut = t.indexOf('故曰歸無所得也。');
  const head = cut > 0 ? t.slice(0, cut + 8) : t;
  const rest = cut > 0 ? t.slice(cut + 8) : '';
  return `<details class="sec" open style="margin-top:8px"><summary>原文说明 · 对读</summary>${duiduHtml(head)}
      <div class="cSrc">《選佛譜》卷第${SFP_CN[((cn15?.juan) || 6) - 1]} · 圓極果位門「佛」；${esc(SFP_META.source)}</div></details>
    ${rest ? `<details class="sec"><summary>原文说明 · 余文（顺修之极以下）</summary>${duiduHtml(rest)}</details>` : ''}
    ${cn15?.intro ? `<details class="sec"><summary>本门图注（原谱谱面题字，无句读）</summary><div class="verse" style="margin-top:6px">${verseHtml(cn15.intro)}</div></details>` : ''}`;
}
// ── 名相小词典（白话助读层，与原文分层）：命中词加虚线下划，点开小签；每段只标首次出现，免满屏碎线 ──
const GLS_IDX                         = {};
(SFP_GLOSS         ).forEach((g, i) => { GLS_IDX[g[0]] = i; });
const GLS_RE = new RegExp((SFP_GLOSS         ).map(g => g[0]          ).sort((a, b) => b.length - a.length).join('|'), 'g');
function glossify(html        )         {
  const seen = new Set        ();
  return html.split(/(<[^>]*>)/).map(seg => {
    if (seg.startsWith('<')) return seg;
    return seg.replace(GLS_RE, (m) => {
      if (seen.has(m)) return m;
      seen.add(m);
      return `<span class="gls" data-g="${GLS_IDX[m]}">${m}</span>`;
    });
  }).join('');
}
const glsPop = el('<div id="glsPop" class="ui panel" style="display:none"><b id="glsT"></b><div id="glsD"></div><div id="glsF"></div></div>');
app.appendChild(glsPop);
function openPosGloss(pid        , anchor          ) { // v225 去处白话小签：位名＋一句简介＋入原文
  const pl = (SFP_POS_PLAIN       )[pid]; const p = SFP_BY[pid]; if (!pl || !p) return;
  (glsPop.querySelector('#glsT')               ).textContent = p.name;
  (glsPop.querySelector('#glsD')               ).innerHTML = zh(esc(pl));
  const f = glsPop.querySelector('#glsF')               ;
  f.innerHTML = zh('<span class="lnk">原文说明 ▸</span>');
  (f.firstElementChild               ).onclick = (e) => { e.stopPropagation(); glsPop.style.display = 'none'; openSfpNote(pid); };
  placeGlsPop(anchor);
}
function placeGlsPop(anchor          ) {
  glsPop.style.display = 'block';
  const w = Math.min(272, window.innerWidth - 20);
  glsPop.style.width = w + 'px';
  let x = 12, y = 80;
  if (anchor) {
    x = Math.min(Math.max(8, anchor.left + anchor.width / 2 - w / 2), window.innerWidth - w - 8);
    const h = glsPop.offsetHeight;
    y = anchor.bottom + 8;
    if (y + h > window.innerHeight - 10) y = Math.max(8, anchor.top - h - 8);
  }
  glsPop.style.left = x + 'px'; glsPop.style.top = y + 'px';
  playVar('wood_light', 0.15, 1.1);
}
function openGloss(idx        , anchor          ) {
  const g = (SFP_GLOSS         )[idx]; if (!g) return;
  (glsPop.querySelector('#glsT')               ).textContent = g[0]; // 名相标题用原文繁体
  (glsPop.querySelector('#glsD')               ).innerHTML = zh(esc(g[1]));
  const fEl = glsPop.querySelector('#glsF')               ;
  fEl.innerHTML = g[2] ? zh(esc(g[2])) : ''; // v224：脚注只留经据出处
  fEl.onclick = null;
  placeGlsPop(anchor);
}
// 点词开签——据获阶段截住，免触发判词展开/面板自身点击逻辑
 document.addEventListener('click', (e) => {
  const t = (e.target               ).closest ? (e.target               ).closest('.gls') : null;
  if (t) { e.stopPropagation(); e.preventDefault(); openGloss(Number((t               ).dataset.g), t.getBoundingClientRect()); }
}, true);
document.addEventListener('pointerdown', (e) => {
  const t = e.target               ;
  if (glsPop.style.display !== 'none' && !glsPop.contains(t) && !(t.closest && t.closest('.gls'))) glsPop.style.display = 'none';
}, true);
// v168 极乐四土总说卡（净土横超门总说义，参天台教判；不冒充原谱原文）：点场内「凡圣同居土」名牌开启
function openFourLands() {
  const tuIds = ['方便有餘淨土', '實報莊嚴淨土', '常寂光淨土'];
  const tuRow = (nm        , cap        ) =>
    `<button class="gbtn tuBtn" style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;box-sizing:border-box"><span><b>${nm}</b><span style="margin-left:8px;font-size:var(--fs-xs);color:#9d9170">${cap}</span></span><span style="color:#d7aa45;font-size:var(--fs-xs);white-space:nowrap">谱注 ›</span></button>`;
  const inner = el(`<div class="panel"><h2>极乐四土</h2><div class="body">
    <div class="cMeta">第十四门 · 净土横超门</div>
    <div style="margin-top:7px">天台判一切佛土为四：凡圣同居、方便有余、实报庄严、常寂光。他方四土竖分——断惑方能升进；极乐则<b>横具四土</b>：信愿持名、带业往生同居土，即已横超三界，与诸上善人俱会一处。此同居之胜，为十方佛土所难有。</div>
    <div style="display:flex;flex-direction:column;gap:7px;margin-top:10px">
      <div style="border:1px solid rgba(215,170,69,.35);border-radius:8px;padding:8px 10px"><b>凡圣同居土</b><span style="margin-left:8px;font-size:var(--fs-xs);color:#9d9170">莲池九品·带业往生所居</span>
        <div style="margin-top:4px;font-size:var(--fs-sm);color:#cbbb8d">场中莲池九品与池畔边地疑城即此土——凡夫带业往生，与补处菩萨同居。</div>
        <div style="display:flex;gap:6px;margin-top:6px"><button class="gbtn" id="tuYc" style="font-size:var(--fs-sm);padding:6px 10px;min-height:34px">边地疑城</button><button class="gbtn" id="tuJp" style="font-size:var(--fs-sm);padding:6px 10px;min-height:34px">九品莲位</button></div></div>
      ${tuRow('方便有余净土', '断见思·三乘圣者所居')}
      ${tuRow('实报庄严净土', '分破无明·法身大士所居')}
      ${tuRow('常寂光净土', '如智不二·究竟法身所证')}
    </div>
    <div class="cNote">三土谱注点各行开读，原文依本项目校正原本逐字收录。</div>
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="tuOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  inner.querySelectorAll('.tuBtn').forEach((b, i) => b.addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpNote(tuIds[i]); }));
  (inner.querySelector('#tuYc')               ).addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpNote('淨土疑城'); });
  (inner.querySelector('#tuJp')               ).addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpNote('下品下生'); });
  (inner.querySelector('#tuOk')               ).addEventListener('click', closeOverlay);
  openOverlay(inner);
}
// v177 六卷原文整卷阅读器（CBETA 補編 B0136 逐字）：原文按门分挂——卷首敘/表法/升降见门1，卷末紀事见门15
function openCanon(doorNo        , jumpName         ) {
  const d = (SFP_CANON_DOORS       )[doorNo]                                                                                                 ;
  if (!d) return;
  const door = SFP_DOOR_BY[doorNo];
  const frontHtml = doorNo === 1 ? (SFP_CANON_FRONT         ).filter(f => f.juan === 1).map(f =>
    `<details class="sec"><summary>卷首 · ${esc(f.title)}</summary><div class="verse" style="margin-top:6px">${verseHtml(f.text)}</div></details>`).join('') : '';
  const jiHtml = doorNo === 15 ? (SFP_CANON_FRONT         ).filter(f => f.juan === 6).map(f =>
    `<details class="sec" open><summary>卷末 · ${esc(f.title)}</summary><div class="verse" style="margin-top:6px">${verseHtml(f.text)}</div></details>`).join('') : '';
  const introHtml = d.intro ? `<div class="verse" style="margin-top:8px"><i>${doorNo === 15 ? '圖注' : '本門總說'}</i>${verseHtml(d.intro)}</div>`
    : ''; // v224：無總說之門不再掛說明行（引文才標出處，白话直说）
  const posHtml = d.positions.map((cp                                , ci        ) =>
    `<div data-ci="${ci}" style="margin-top:12px;border-top:1px solid rgba(215,170,69,.18);padding-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <b style="color:#f0dfa8;font-size:var(--fs-md);letter-spacing:2px">${esc(cp.name)}</b>
        <button class="gbtn cnCard" data-ci="${ci}" style="font-size:var(--fs-xs);padding:3px 10px;min-height:28px">譜注卡 ›</button>
      </div>
      <div class="verse" style="margin-top:4px">${verseHtml(cp.text.replace(/^譜曰。/, ''))}</div>
    </div>`).join('');
  const inner = el(`<div class="panel" style="max-width:min(680px,94vw)"><h2>選佛譜 · 卷第${SFP_CN[d.juan - 1]} · ${esc(door.title)}</h2><div class="body">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="cMeta">第${SFP_CN[doorNo - 1]}門 · 原文（校正原本 B0136 逐字轉寫）</span><button class="gbtn" id="cnLib" style="font-size:var(--fs-xs);padding:3px 10px;min-height:28px;flex:none">所据经论 ›</button></div>
    ${frontHtml}${introHtml}${posHtml}${jiHtml}
    <div class="cNote" style="margin-top:10px">六卷原文按門分挂：卷首三篇見第一門，卷末紀事見第十五門；原刻缺字依《靈峰宗論》及文内互证定字。</div>
    <div class="cardNav"><button class="gbtn${doorNo > 1 ? '' : ' dis'}" id="cnPrev">‹ 上一門</button><button class="gbtn${doorNo < 15 ? '' : ' dis'}" id="cnNext">下一門 ›</button></div>
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="cnOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  inner.querySelectorAll('.cnCard').forEach(b => b.addEventListener('click', () => {
    playSfx('sfx-tap', 0.25);
    const cp = d.positions[Number((b               ).dataset.ci)];
    const sp = cp && (SFP_POS         ).find(x => x.name === cp.name || (cp.name === '佛' && x.id === '圓教究竟妙覺位'));
    if (sp) openSfpNote(sp.id);
  }));
  const pv = inner.querySelector('#cnPrev')                      ;
  if (pv && doorNo > 1) pv.addEventListener('click', () => { playSfx('sfx-tap', 0.25); openCanon(doorNo - 1); });
  const nx = inner.querySelector('#cnNext')                      ;
  if (nx && doorNo < 15) nx.addEventListener('click', () => { playSfx('sfx-tap', 0.25); openCanon(doorNo + 1); });
  (inner.querySelector('#cnOk')               ).addEventListener('click', closeOverlay);
  // 参考经典并为原文顶签（单菜单原则：原☰「参考经典」条目迁此）
  (inner.querySelector('#cnLib')               ).addEventListener('click', () => { closeOverlay(); openLibrary(); });
  openOverlay(inner);
  if (jumpName) {
    const ji = d.positions.findIndex(x => x.name === jumpName || (x.name === '佛' && jumpName === '圓教究竟妙覺位'));
    const t = ji >= 0 ? inner.querySelector(`[data-ci="${ji}"]`)                       : null;
    if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 80);
  }
}
// v169 發始因地廿一因总览（作者自撰助读，非原谱原文）：四类分组、逐位互链谱注——入口在门1总说浮文
function openD1Card() {
  const ids           = [];
  const html = SFP_D1_GROUPS.map(([gn, gd, gids]) => {
    const rows = gids.map(pid => {
      ids.push(pid);
      const p = SFP_BY[pid];
      return `<button class="gbtn d1Btn" style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;box-sizing:border-box;padding:7px 12px;min-height:36px"><span><b>${esc(p.name)}</b><span style="margin-left:8px;font-size:var(--fs-xs);color:#9d9170">${esc(SFP_D1_CAPTION[pid] || '')}</span></span><span style="color:#d7aa45;font-size:var(--fs-xs);white-space:nowrap">谱注 ›</span></button>`;
    }).join('');
    return `<div style="margin-top:10px;font-size:var(--fs-sm);color:#d7aa45;letter-spacing:2px">${gn} <span style="color:#9d9170;font-size:var(--fs-xs);letter-spacing:0">${gd}</span></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${rows}</div>`;
  }).join('');
  const inner = el(`<div class="panel"><h2>發始因地 · 廿一因</h2><div class="body">
    <div class="cMeta">第一门 · 發始因地门</div>
    <div style="margin-top:7px">第一掷不论升降，廿一种轮相组合定廿一种起点业因——此生从何处起步。点各位可入谱注原文。</div>
    ${html}
    <div class="cNote">原文依本项目校正原本逐字收录。</div>
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="d1Ok">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  inner.querySelectorAll('.d1Btn').forEach((b, i) => b.addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpNote(ids[i]); }));
  (inner.querySelector('#d1Ok')               ).addEventListener('click', closeOverlay);
  openOverlay(inner);
}
function duiduHtml(text        )         {
  // v228 对读本：白话库键逐字嵌于完整谱注原文；未覆盖段仍显示原文，不删减 CBETA 字符。
  const marks                                             = [];
  for (const k of Object.keys(SFP_WHY_PLAIN       )) {
    const at = text.indexOf(k);
    if (at >= 0) marks.push({ s: at, e: at + k.length, p: (SFP_WHY_PLAIN       )[k] });
  }
  marks.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const segs                                   = [];
  let cur = 0;
  for (const m of marks) {
    if (m.s < cur) continue;
    if (m.s > cur) segs.push({ t: text.slice(cur, m.s) });
    segs.push({ t: text.slice(m.s, m.e), p: m.p });
    cur = m.e;
  }
  if (cur < text.length) segs.push({ t: text.slice(cur) });
  return segs.filter(sg => sg.t.trim()).map(sg =>
    `<div class="verse">${verseHtml(sg.t)}</div>${sg.p ? `<div class="dd">${glossify(esc(sg.p))}</div>` : ''}`).join('');
}
function openSfpNote(pid         ) {
  const p = pid ? SFP_BY[pid] : (sfpS.pos ? SFP_BY[sfpS.pos] : null);
  const door = p ? SFP_DOOR_BY[p.door] : null;
  const idx = p ? (SFP_POS         ).findIndex((x     ) => x.id === p.id) : -1;
  const prev = idx > 0 ? (SFP_POS         )[idx - 1] : null;
  const next = idx >= 0 && idx < (SFP_POS         ).length - 1 ? (SFP_POS         )[idx + 1] : null;
  const canonP = p ? (((SFP_CANON_DOORS       )[p.door]?.positions || [])                                         )
    .find(x => x.name === p.name || x.name === p.id || (x.name === '佛' && p.id === '圓教究竟妙覺位')) : undefined;
  const juanCn = p ? SFP_CN[(((SFP_CANON_DOORS       )[p.door]?.juan) || 1) - 1] : '';
  const dPlain = p ? (SFP_DOOR_PLAIN       )[p.door] : '';
  // v228 卡片三层一序：一句白话（这是什么）→ AI 解读（在何门何界）→ 谱曰原文对读（依据）
  const inner = el(`<div class="panel"><h2>${p ? esc(p.name) : '發始因地'} · 原文说明</h2><div class="body">
    ${door ? `<div class="cMeta">${esc(door.title)}${p.pure ? ' · 净土' : ''}${idx >= 0 ? ` · 第${idx + 1}/220位` : ''} <span id="spCanon" class="lnk">卷第${juanCn} · 本門譜文 ›</span></div>` : ''}
    ${p && (SFP_POS_PLAIN       )[p.id] ? `<div class="cPlain">${glossify(esc((SFP_POS_PLAIN       )[p.id]))}</div>` : ''}
    ${p ? `<details class="sec" open><summary>AI 解读</summary>
      ${dPlain ? `<div class="cRead">所在门：第${SFP_CN[p.door - 1]}门「${esc(door.title)}」——${glossify(esc(dPlain))}</div>` : ''}
      ${byId[p.anchor] ? `<div class="cRead">所在法界：<span id="spAnchor" class="lnk">${esc(byId[p.anchor].d.name)}</span>　<span style="font-size:11px;color:#9d9170">点法界名观其界相·众相·出处</span></div>` : ''}
      ${p.terminal ? `<div class="cRead">此为全谱毕局之位——升沉至此，无复行处。</div>` : ''}
      ${SFP_DOOR_PRACTICE[p.door] ? `<div class="cRead">修行：${glossify(esc(SFP_DOOR_PRACTICE[p.door]))}</div>${doorCiteHtml(p.door)}` : ''}</details>` : ''}
    ${p && !p.terminal ? `<details class="sec"><summary>升降行法 · 二十一组轮相</summary>${sfpMovesHtml(p)}</details>` : ''}
    ${p ? `<details class="sec" open><summary>原文 · 白话文对照</summary>${duiduHtml((canonP ? canonP.text : p.note).replace(/^譜曰。/, ''))}
      <div class="cSrc">《選佛譜》卷第${juanCn}；${esc(SFP_META.source)}。本栏依校正原本逐字收录，保留原括注与校勘标记。</div></details>` : `<div style="margin-top:6px">${esc(SFP_META.dice)}</div>`}</div>
    ${p ? `<div class="cardNav"><button class="gbtn${prev ? '' : ' dis'}" id="spPrev">‹ ${prev ? esc(prev.name) : '已是首位'}</button><button class="gbtn${next ? '' : ' dis'}" id="spNext">${next ? esc(next.name) : '已是末位'} ›</button></div>` : ''}
    <div style="margin-top:10px;display:flex;gap:8px">${p ? '<button class="gbtn" id="sfpNoteLoc">定位此位</button>' : '<button class="gbtn" id="spCanon2">譜文原文</button>'}<button class="gbtn primary" id="sfpNoteOk" style="flex:1">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  const pv = inner.querySelector('#spPrev')                      ;
  const nx = inner.querySelector('#spNext')                      ;
  if (pv && prev) pv.addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpNote(prev.id); });
  if (nx && next) nx.addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpNote(next.id); });
  const loc = inner.querySelector('#sfpNoteLoc')                      ;
  if (loc && p) loc.addEventListener('click', () => { closeOverlay(); sfpLocate(p.id); });
  const openCn = () => { playSfx('sfx-tap', 0.25); openCanon(p ? p.door : (sfpS.pos ? SFP_BY[sfpS.pos].door : 1), p ? p.name : undefined); };
  const cnBtn = inner.querySelector('#spCanon')                      ;
  if (cnBtn) cnBtn.addEventListener('click', openCn);
  const cnBtn2 = inner.querySelector('#spCanon2')                      ;
  if (cnBtn2) cnBtn2.addEventListener('click', openCn);
  const anc = inner.querySelector('#spAnchor')                      ;
  if (anc && p) anc.addEventListener('click', () => { // 互链：谱位→所在法界卡片（卡内又有「选佛谱位」段链回诸位）
    closeOverlay();
    if (p.pure && !inPure) enterPure();
    if (!p.pure && inPure) returnSaha();
    if (inSky && !SKY_IDS.has(p.anchor)) returnSaha();
    selectNode(p.anchor);
  });
  (inner.querySelector('#sfpNoteOk')               ).addEventListener('click', closeOverlay); // v228 卡片归一：位的解读就在位卡里，问义钮退役
  openOverlay(inner);
}
// —— 「问」＝与本谱对话：每一问直接接 G 版选佛谱智能体
// （/api/ask → xuanfopu-evidence-agent，G 版 RAG 经据库），明标「AI 生成」与引文出处；
// 本地结构化检证同时生成，作为智能体等待期间的速查及网络故障时的兜底。
const SFP_ASK_API = '/api/ask';
const ASK_LIMIT = 100;
function askQuotaLeft()         {
  const today = new Date().toISOString().slice(0, 10);
  if (save.askq.d !== today) save.askq = { d: today, n: 0 };
  return Math.max(0, ASK_LIMIT - save.askq.n);
}
const ASK_CONF                         = { high: '高', medium: '中', low: '低' };
function askQFor(c        , d        , fId         , toId         )         {
  const at = (x     ) => `第${SFP_CN[x.door - 1]}门「${x.name}」位`;
  const b = toId ? SFP_BY[toId] : null;
  if (!b) return `掷得「${c}」为何获贈掷？`;
  if (d === 'stay') return `在${at(b)}掷得「${c}」为何不行（安住原位）？`;
  if (d === 'start') return `第一掷得「${c}」，为何因地定于${at(b)}？`;
  const verb = d === 'pure' ? `横超至净土「${b.name}」位` : `${d === 'down' ? '降至' : '升至'}${at(b)}`;
  return `从${fId && SFP_BY[fId] ? at(SFP_BY[fId]) : '前位'}掷得「${c}」，为何${verb}？`;
}
function canonOf(pid        )                                        {
  const p = SFP_BY[pid]; if (!p) return null;
  const d = (SFP_CANON_DOORS       )[p.door];
  const c = d ? ((d.positions || [])         ).find((x     ) => x.name === p.name || x.name === p.id || (x.name === '佛' && p.id === '圓教究竟妙覺位')) : null;
  return { text: String((c ? c.text : (p       ).note) || '').replace(/^譜曰。/, ''), juan: d ? d.juan : 1 };
}
function rdCite(label        , pid        , text        , juan        )         {
  const ci = (SFP_POS         ).findIndex((x     ) => x.id === pid); // 数字下标防 zh() 变形（AGENTS 陷阱）
  let body = text;
  if (body.length > 240) { const cut = body.indexOf('。', 220); if (cut > 0 && cut < body.length - 2) body = body.slice(0, cut + 1) + '……'; }
  let du = duiduHtml(body.replace(/^譜曰。/, ''));
  if (!du.includes('<div class="dd">')) {
    const pl = (SFP_POS_PLAIN       )[pid];
    if (pl) du += `<div class="dd">${glossify(esc(String(pl)))}</div>`;
  }
  // V69：节标题用大白话，出处小注保留书名卷次
  return `<details class="sec"><summary>${esc(label)}<span style="opacity:.65;font-weight:400"> · 出自《选佛谱》第${SFP_CN[juan - 1]}卷</span></summary>
    <div style="margin-top:5px">${du}</div>
    ${ci >= 0 ? `<span class="rdMore lnk" data-ci="${ci}" style="margin-top:5px;font-size:var(--fs-xs);display:inline-block">阅读原文 ▸</span>` : ''}</details>`;
}
const RD_DIR_VERB                         = { up: '升往', down: '降往', pure: '横超至', side: '转往' };
// V90：各门「修行」栏的白话只说本门修法要点；逐字引文另层列出，不把项目释义写成谱曰。
const SFP_DOOR_PRACTICE                         = {
  1: '首掷所定只是起修的因地，无关高下：轮面六字本表善恶升沉，从任何一位起，此后皆依本位行法表升降。',
  2: '此门五位皆是学法走偏之相：破戒、破威仪、毁正见、弃多闻、增上慢；对治在依律说悔、深思对治、勤修出世福业，乃至一心念佛求带业往生。',
  3: '三品十恶招感地狱畜生饿鬼；离恶趣之道在断恶修忏，恶趣诸位遇「佛」字多得转机。',
  4: '五戒感人身、十善生天，然饮食男女睡眠三事未离，福尽仍轮；宜进受戒闻法，念佛求生净土。',
  5: '修四禅八定所感，同属天趣、同名定地；凡夫天是有漏定，报尽仍轮（五净居专为那含圣者寄居），定须与戒慧同学。',
  6: '听法、护法、请法生出世善；作法、取相、无生三忏灭三障重罪——是入佛法之初门。',
  7: '学道以戒为首：从三皈五戒、八戒十戒到具足戒、菩萨戒，从小阶大、从浅阶深。',
  8: '成就功德、发无漏慧必藉禅定之力，故次戒学须明定学：从数息等门摄心，次第修诸禅。',
  9: '戒定慧如捉贼缚贼杀贼：外道乏出世慧，虽修戒定不出生死；二乘无中道慧，虽出生死不达法源。',
  10: '藏教之路：修析空观、断见思惑、出三界、证偏真——三乘位次俱在此门。',
  11: '通教之路：直明因缘生法当体即空，三乘同皆体色入空；利根人见空即见不空，受别圆来接。',
  12: '别教之路：先信中道佛性，然后次第修三观以剋证之——独菩萨法，五十二位从浅阶深。',
  13: '圆教之路：一切因缘所生法无不即空假中，三谛圆融；迷之不减，悟之不增。',
  14: '信愿持名：仗弥陀愿力，未断见思即能出娑婆秽、生极乐净，是全谱唯一的横超之路。',
  15: '果位无别修：三惑净尽、福慧圆满名之为佛，所谓究竟只是证得本具理体，未曾增一丝毫。',
};
const SFP_DOOR_CITE                                             = {
  1: { t: '置輪掌心。仰手旁擲。表從凡入聖轉惡成善。十法界無不會歸究竟也。', src: '卷第一 · 輪相表法第一' },
  2: { t: '阿彌等三。並知依律說悔。以求滅罪。為作法懺。彌陀等二。能於小罪懷懼。深思對治。為取相懺。', src: '卷第二 · 法道流弊門「破軌則」' },
  3: { t: '三品十惡。招感地獄畜生餓鬼。名三惡趣。', src: '卷第二 · 四種惡趣門總說' },
  4: { t: '人天并前脩羅鬼畜皆有飲食男女睡眠三事。皆具色聲香味觸之五欲。故總名欲界也。', src: '卷第二 · 欲界人天門總說' },
  5: { t: '然同屬天趣。同名定地。故合為一門也。', src: '卷第三 · 色無色天門總說' },
  6: { t: '聽法。護法。請法。令六道凡夫生出世善。作法取相無生三懺。令三障重罪皆得滅除。故為入佛法之初門。', src: '卷第三 · 生善滅惡門總說' },
  7: { t: '因戒生定。因定發慧。斯則名為三無漏學。故學道人以戒為首。', src: '卷第三 · 增上戒學門總說' },
  8: { t: '學佛之人。若欲成就一切功德。若欲發生無漏智慧。必藉禪定之力。故次戒學須明定學。', src: '卷第四 · 增上定學門總說' },
  9: { t: '戒如捉賊。定如縛賊。慧如殺賊。故次定之後。應明慧學。', src: '卷第五 · 增上慧學門總說' },
  10: { t: '同修析觀同斷見思。同出三界。同證偏真。', src: '卷第五 · 藏教位次門總說' },
  11: { t: '又三乘之人。同皆體色入空。故名通教。', src: '卷第五 · 通教位次門總說' },
  12: { t: '行人先信中道佛性。然後次第修行三觀以剋證之。此是獨菩薩法。', src: '卷第六 · 別教位次門總說' },
  13: { t: '一切因緣所生法。無不即空假中。三諦圓融。不可思議。', src: '卷第六 · 圓教位次門總說' },
  14: { t: '是故設依自修行力。則四教並名豎入。唯依阿彌陀佛願力。始可橫超也。', src: '卷第六 · 淨土橫超門總說' },
  15: { t: '唯圓妙覺。乃能究盡諸法實相。乃能徹證本源心地。故名圓滿菩提。', src: '卷第六 · 圓極果位門「佛」' },
};
function doorCiteHtml(dn        ) {
  const c = SFP_DOOR_CITE[dn]; if (!c) return '';
  return `<div class="verse" style="margin-top:6px"><i class="duL">谱曰原文</i>${verseHtml(c.t)}<span class="cSrc" style="display:block">《選佛譜》${esc(c.src)}</span></div>`;
}
function sfpPracticeAnswerHtml(dn        , pHit      )         {
  const door = SFP_DOOR_BY[dn];
  const parts = [
    `<div class="cPlain" style="margin:4px 0">${pHit ? `「${esc(pHit.name)}」属第${SFP_CN[dn - 1]}门「${esc(door.title)}」` : `第${SFP_CN[dn - 1]}门「${esc(door.title)}」`}——<b>释义：</b>${glossify(esc(SFP_DOOR_PRACTICE[dn] || ''))}</div>`,
  ];
  parts.push(doorCiteHtml(dn));
  if (door.intro) parts.push(`<details class="sec"><summary>${DOOR_HINT_SELF.has(dn) ? '本门导语（原谱无此门总说）' : '本门总说（原文）'}</summary><div class="cRead" style="color:#cbbb8d">${glossify(esc(door.intro))}</div></details>`);
  parts.push('<div class="cNote" style="margin-top:4px">此为本谱所示之教路；具体行门宜从明师、依经论。</div>');
  return parts.join('');
}
function sfpLocalSearch(qRaw        )         {
  const q0 = qRaw.trim(); if (!q0) return '';
  const qs = [...new Set([q0, zhWith(q0, ZH_S2T, ZH_MAXLEN.t), zhWith(q0, ZH_T2S, ZH_MAXLEN.s)])];
  const parts           = [];
  const gls = (SFP_GLOSS         ).map((g, i) => [g, i]         ).filter(([g]) => qs.some(q => String(g[0]).includes(q) || String(g[1]).includes(q))).slice(0, 4);
  if (gls.length) parts.push(gls.map(([g]) => `<div style="margin:5px 0"><b style="color:#efe0b4">${esc(g[0])}</b>　${esc(g[1])}${g[2] ? `<span style="color:#9d9170;font-size:var(--fs-xs)">（${esc(g[2])}）</span>` : ''}</div>`).join(''));
  const posHit = (SFP_POS         ).map((x, i) => [x, i]         ).filter(([x]) => qs.some(q => x.name.includes(q) || x.id.includes(q))).slice(0, 3);
  if (posHit.length) parts.push(posHit.map(([x, i]) => `<div style="margin:5px 0">位 <span class="rdMore lnk" data-ci="${i}">${esc(x.name)}</span>　${esc((SFP_POS_PLAIN       )[x.id] || '')}</div>`).join(''));
  const snips           = [];
  for (let i = 0; i < (SFP_POS         ).length && snips.length < 3; i++) {
    const x = (SFP_POS         )[i]; const cn = canonOf(x.id); if (!cn) continue;
    for (const q of qs) {
      const at = cn.text.indexOf(q);
      if (at >= 0) {
        snips.push(`<div style="margin:5px 0;font-size:var(--fs-sm);color:#cbbb8d">「…${esc(cn.text.slice(Math.max(0, at - 26), at + q.length + 44))}…」——<span class="rdMore lnk" data-ci="${i}">${esc(x.name)}</span> · 卷第${SFP_CN[cn.juan - 1]}</div>`);
        break;
      }
    }
  }
  if (snips.length) parts.push(`<div style="font-size:var(--fs-xs);color:#d7aa45;margin-top:6px">谱文检得</div>` + snips.join(''));
  return parts.length ? parts.join('') : '<div style="color:#9d9170;font-size:var(--fs-sm);margin-top:5px">谱内与词典未检得此词——可换更短的词，或试原文用字（繁体）。</div>';
}
const sfpChat                                  = [];
const SFP_ORD = '那謨阿彌陀佛';
const SFP_CHAT_HELLO = '<div class="cRead" style="margin:4px 0">南无阿弥陀佛。这里可与本谱对话——可以问我：<br>· 谱位：如「無想天」「上品上生」<br>· 行法：如「在南贍部洲掷得彌陀会怎样」<br>· 名相：如「八背捨」「四如意足」<br>· 某一门：如「第八门」；修行：如「圆教怎么修」<br>· 或「这局怎么玩」。<br>每次提问都会交由 G 版选佛谱智能体依经据库检证；本地谱内速查同时保留，等待或离线时也可继续阅读。</div>';
const askCite = (t        , src        ) => `<div class="verse" style="margin-top:6px"><i class="duL">谱曰原文</i>${verseHtml(t)}<span class="cSrc" style="display:block">《選佛譜》${esc(src)}</span></div>`;
const SFP_RULES_A = '<div class="cPlain" style="margin:4px 0">两枚轮相各刻「那·謨·阿·彌·陀·佛」，合读正是「南无阿弥陀佛」——掷轮即是称名。长按掷钮至心称念一句佛号、念毕松手即掷；第一掷定「發始因地」，此后每掷依当位行法表升降，判词窗点「行」落子。那謨二字下坠、阿彌陀佛四字上升；堕三途亦不出谱，仍依本位行法续掷。</div>' + askCite('那謨表惡阿彌陀佛表善', '卷第一 · 輪相表法第一') + askCite('若但有善無惡。則應有升無降。', '卷第一 · 輪相表法第一');
const SFP_WHEEL_A = '<div class="cPlain" style="margin:4px 0">两轮合读即「南无阿弥陀佛」，掷轮即称名。六字各有表法：那表见惑、謨表思惑（二恶）；阿表布施、彌表持戒、陀表禅定、佛表善慧（四善）——诸门诸位取义各异，以当位谱注为准。</div>' + askCite('那謨表惡阿彌陀佛表善那表屬見煩惱', '卷第一 · 輪相表法第一') + askCite('阿表施善彌表戒善陀表定善佛表善慧', '卷第一 · 輪相表法第一');
function sfpTossAnswerHtml(ctx                                                         )         {
  const F = ctx.from ? SFP_BY[ctx.from] : null;
  const T = ctx.to ? SFP_BY[ctx.to] : null;
  const stay = !!(F && T && F.id === T.id);
  let tossEvidence = ctx.evidence || (F && ctx.c ? sfpWhyEvidence(F.id, ctx.c) : null);
  const tossMove = F && ctx.c ? (F.moves         ).find(m => (m.c            ).includes(ctx.c)) : null;
  if (tossMove && tossMove.bonus && !sfpEvidenceItems(tossEvidence, SFP_EVIDENCE_TYPE.operation).length) {
    tossEvidence = mergeSfpEvidence(tossEvidence, makeSfpOperationalEvidence(
      tossMove.to ? '先移至目的位，再由当前操作者从目的位立即续掷。' : '棋子保持本位，仍由当前操作者立即续掷。',
    ));
  }
  const paras           = []; const cites           = [];
  paras.push(`此掷两轮得「${ctx.c}」：${ctx.c.split('').map(ch => `「${ch}」${(SFP_PLAIN       )[ch] || ''}`).join('；')}。`);
  if (!F && T) paras.push(`第一掷不论升降——二十一种轮相组合各定一种「發始因地」（此生起点的业因）。「${ctx.c}」所定因地为「${T.name}」：${(SFP_POS_PLAIN       )[T.id] || ''}`);
  else if (stay && F) { const fSeen = sfpS.trail.filter(x => x === F.id).length; paras.push(`现居「${F.name}」——${fSeen > 1 ? '' : (SFP_POS_PLAIN       )[F.id] || ''}依本位行法，「${ctx.c}」于此位无行处，故安住不动。`); }
  else if (F && T) {
    const dir = sfpDirOf(F, T, ctx.c);
    const fSeen = sfpS.trail.filter(x => x === F.id).length;
    const tSeen = sfpS.trail.filter(x => x === T.id).length;
    paras.push(`现居「${F.name}」——${fSeen > 1 ? '' : (SFP_POS_PLAIN       )[F.id] || ''}依本位行法，「${ctx.c}」${RD_DIR_VERB[dir] || '往'}「${T.name}」${tSeen >= 1 ? `——本局第 ${tSeen + 1} 次到此位，位义前已读过（下方原文可回看），这次不同的只在来路与轮相。` : `——${(SFP_POS_PLAIN       )[T.id] || ''}`}`);
  }
  else paras.push('此组合依本位行法为「贈掷」：棋子不移位，增加的掷数以本位行法表所记为准。');
  const wp = sfpEvidenceInterpretationText(tossEvidence);
  const op = sfpEvidenceOperationText(tossEvidence);
  if (wp) paras.push(`释义：${wp}`);
  if (op) paras.push(`本项目操作规则：${op}`);
  if (F && ctx.c) {
    const prev = [...sfpHist].reverse().find(h => h.c === ctx.c && h.f && h.f !== F.id && SFP_BY[h.f] && (h.to || '') !== (ctx.to || ''));
    if (prev) {
      const PF = SFP_BY[prev.f          ]; const PT = prev.to ? SFP_BY[prev.to] : null;
      paras.push(`同一轮相，因位异行：第${prev.n}掷也曾掷得「${ctx.c}」——那时在「${PF.name}」，${PT ? (PT.id === PF.id ? '安住不动' : `走向「${PT.name}」`) : '得的是贈掷'}；这次在「${F.name}」，去向不同。谱的行法系于「位」：同一轮相，所居之位不同，行法即不同——逐位读谱注，读的正是这一点。`);
    }
  }
  const pDoor = (T || F) ? (T || F) .door : 0; // 「怎么修行」随去处之门；安住、贈掷则随本位门
  const tgt = T || F;
  const tgtOld = tgt ? sfpS.trail.filter(x => x === tgt.id).length >= ((stay || !T) ? 2 : 1) : false;
  if (pDoor && SFP_DOOR_PRACTICE[pDoor] && !tgtOld) {
    paras.push(`修行：${SFP_DOOR_PRACTICE[pDoor]}`);
    cites.push(doorCiteHtml(pDoor));
  }
  if (tossEvidence && F) { const cn = canonOf(F.id); cites.push(...sfpEvidenceCites(tossEvidence, F.id, cn ? cn.juan : 1)); }
  if (F) { const cn = canonOf(F.id); if (cn && cn.text) cites.push(rdCite(`现在的位置「${F.name}」原文怎么说`, F.id, cn.text, cn.juan)); }
  if (T && !stay) { const cn = canonOf(T.id); if (cn && cn.text) cites.push(rdCite(`要去的位置「${T.name}」原文怎么说`, T.id, cn.text, cn.juan)); }
  return paras.map((t, i) => `<div class="${i === 0 ? 'cPlain' : 'cRead'}" style="margin:4px 0">${glossify(esc(t))}</div>`).join('') + cites.join('');
}
function sfpPosAnswerHtml(p     )         {
  const cn = canonOf(p.id);
  const door = SFP_DOOR_BY[p.door];
  const ci = (SFP_POS         ).findIndex((x     ) => x.id === p.id);
  const parts = [
    `<div class="cPlain" style="margin:4px 0">「${esc(p.name)}」——${glossify(esc((SFP_POS_PLAIN       )[p.id] || ''))}</div>`,
    `<div class="cRead" style="margin:4px 0">属第${SFP_CN[p.door - 1]}门「${esc(door ? door.title : '')}」${p.pure ? '（净土）' : ''}，全谱第${ci + 1}/220位${byId[p.anchor] ? `，所在法界：${esc(byId[p.anchor].d.name)}` : ''}${p.terminal ? '——此为全谱毕局之位，无复行处' : ''}。</div>`];
  if (SFP_DOOR_PRACTICE[p.door]) parts.push(`<div class="cRead" style="margin:4px 0">修行：${glossify(esc(SFP_DOOR_PRACTICE[p.door]))}</div>${doorCiteHtml(p.door)}`);
  if (cn && cn.text) parts.push(rdCite('这个位置原文怎么说', p.id, cn.text, cn.juan));
  parts.push(`<div class="cNote" style="margin-top:4px">可追问「在${esc(p.name)}掷得彌陀会怎样」「${esc(SFP_DOOR_BY[p.door].title)}怎么修」；点上方「阅读原文」入位卡看全部行法与白话文对照。</div>`);
  return parts.join('');
}
function sfpMoveAnswerHtml(p     , combo        )         {
  const mv = (p.moves         ).find((m     ) => (m.c            ).includes(combo));
  let moveEvidence = sfpWhyEvidence(p.id, combo);
  if (mv && mv.bonus) moveEvidence = mergeSfpEvidence(moveEvidence, makeSfpOperationalEvidence(
    mv.to ? '先移至目的位，再由当前操作者从目的位立即续掷。' : '棋子保持本位，仍由当前操作者立即续掷。',
  ));
  const whyP = sfpEvidenceInterpretationText(moveEvidence);
  const operation = sfpEvidenceOperationText(moveEvidence);
  const paras           = [];
  if (!(p.moves         ).length) paras.push(`<div class="cPlain" style="margin:4px 0">「${esc(p.name)}」为究竟果位，无升降——任何轮相皆无行处。</div>`);
  else if (mv) {
    let s = mv.to ? `往「${mv.to}」` : '';
    if (mv.bonus) s += (s ? '，' : '') + `贈${'一二三四'[mv.bonus - 1]}掷`;
    if (mv.act) s += `，依「${mv.act}」行`;
    const dest = mv.to ? SFP_BY[mv.to] : null;
    paras.push(`<div class="cPlain" style="margin:4px 0">在「${esc(p.name)}」掷得「${combo}」：${esc(s)}。${dest && dest.id !== p.id ? glossify(esc(`去处「${dest.name}」——${(SFP_POS_PLAIN       )[dest.id] || ''}`)) : ''}</div>`);
  } else paras.push(`<div class="cPlain" style="margin:4px 0">在「${esc(p.name)}」掷得「${combo}」：本位行法未列此组合——依谱例安住本位、不行棋。</div>`);
  paras.push(`<div class="cRead" style="margin:4px 0">「${combo}」：${sfpPlain(combo)}。</div>`);
  if (whyP) paras.push(`<div class="cRead" style="margin:4px 0"><b>释义：</b>${glossify(esc(whyP))}</div>`);
  if (operation) paras.push(`<div class="cRead" style="margin:4px 0"><b>本项目操作规则：</b>${glossify(esc(operation))}</div>`);
  const cn = canonOf(p.id);
  const cites           = [];
  if (moveEvidence) cites.push(...sfpEvidenceCites(moveEvidence, p.id, cn ? cn.juan : 1));
  if (cn && cn.text) cites.push(rdCite(`这个位置「${p.name}」原文怎么说`, p.id, cn.text, cn.juan));
  return paras.join('') + cites.join('');
}
function sfpUpwardAnswerHtml(p     , rescue          )         {
  if (p.terminal) return `<div class="cPlain" style="margin:4px 0">「${esc(p.name)}」为全谱毕局之位——选佛及第，无复行处，亦无所谓上进。</div>`;
  const line = (m     ) => `「${(m.c            ).join('」「')}」${m.to && SFP_BY[m.to] ? `→${esc(SFP_BY[m.to].name)}` : ''}${m.bonus ? `（贈${'一二三四'[m.bonus - 1]}掷）` : ''}`;
  const ups           = [], pures           = [], downs           = [], stays           = [], bonuses           = [], lighters           = [];
  for (const m of (p.moves         )) {
    const dest = m.to ? SFP_BY[m.to] : null;
    if (!dest) { (m.bonus ? bonuses : stays).push(line(m)); continue; }
    if (dest.id === p.id) { stays.push(line(m)); continue; }
    const d = sfpDirOf(p, dest, m.c[0]);
    if (d === 'up' && (dest.door === 2 || dest.door === 3)) { lighters.push(line(m)); continue; }
    (d === 'pure' ? pures : d === 'up' ? ups : downs).push(line(m));
  }
  const paras           = [];
  if (rescue) paras.push(`<div class="cPlain" style="margin:4px 0">堕在「${esc(p.name)}」不是终局——本位行法表里就写着出路：</div>`);
  else paras.push(`<div class="cPlain" style="margin:4px 0">在「${esc(p.name)}」，行法表定死了每种轮相的去向：</div>`);
  if (pures.length) paras.push(`<div class="cRead" style="margin:4px 0">横超净土：${esc(pures.join('；'))}。</div>`);
  if (ups.length) paras.push(`<div class="cRead" style="margin:4px 0">上进：${esc(ups.join('；'))}。</div>`);
  if (lighters.length) paras.push(`<div class="cRead" style="margin:4px 0">渐出转轻（仍在恶趣，殃报渐消）：${esc(lighters.join('；'))}。</div>`);
  if (!ups.length && !pures.length && !lighters.length) paras.push(`<div class="cRead" style="margin:4px 0">本位行法表中没有直接上进的组合——${p.pure ? '净土诸位有进无退，安住不动亦不退。' : '依表所列，或安住、或得贈掷，皆非下坠。'}</div>`);
  if (bonuses.length) paras.push(`<div class="cRead" style="margin:4px 0">贈掷得势：${esc(bonuses.join('；'))}。</div>`);
  if (downs.length) paras.push(`<div class="cRead" style="margin:4px 0">下坠之组：${esc(downs.join('；'))}。</div>`);
  if (stays.length) paras.push(`<div class="cRead" style="margin:4px 0">安住不动：${esc(stays.join('；'))}；其余组合于此位「不行」。</div>`);
  if (rescue && SFP_DOOR_PRACTICE[p.door]) paras.push(`<div class="cRead" style="margin:4px 0">修行：${glossify(esc(SFP_DOOR_PRACTICE[p.door]))}</div>${doorCiteHtml(p.door)}`);
  const cn = canonOf(p.id);
  return paras.join('') + (cn && cn.text ? rdCite(`这个位置「${p.name}」原文怎么说`, p.id, cn.text, cn.juan) : '');
}
function sfpCrossAnswerHtml()         {
  const parts = [`<div class="cPlain" style="margin:4px 0"><b>释义：</b>「横超」是本谱的眼目：不必一门一位向上爬（那叫「竖入」，路极迂远），而是仗阿弥陀佛愿力，自当下之位横身超入西方净土——净土诸位永离退缘，有进无退，直至选佛及第。</div>`,
    askCite('是故設依自修行力。則四教並名豎入。唯依阿彌陀佛願力。始可橫超也。', '卷第六 · 淨土橫超門總說')
      + askCite('若仗阿彌陀佛願力。未斷見思。即能出娑婆穢。生極樂淨。', '卷第六 · 淨土橫超門總說'),
    `<div class="cRead" style="margin:4px 0"><b>本项目操作说明：</b>谱中第十四门「淨土橫超門」即是此路；哪些轮相能横超，各位行法表不同——点下方签看您现在这一位的路。</div>`];
  if (sfpS.active && sfpS.pos) parts.push('<div id="cbXChip" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="chipQ">现在掷得什么才能上进</span></div>');
  return parts.join('');
}
function sfpDoorAnswerHtml(dn        )         {
  const d = SFP_DOOR_BY[dn]; if (!d) return '';
  const names = (SFP_POS         ).map((x, i) => [x, i]         ).filter(([x]) => x.door === dn);
  const doorPlain = (SFP_DOOR_PLAIN       )[dn] || '';
  const parts = [`<div class="cPlain" style="margin:4px 0">第${SFP_CN[dn - 1]}门「${esc(d.title)}」共${names.length}位。${doorPlain ? `<b>释义：</b>${glossify(esc(doorPlain))}` : ''}</div>`,
    `<div class="cRead" style="margin:4px 0">诸位：${names.map(([x, i]) => `<span class="rdMore lnk" data-ci="${i}">${esc(x.name)}</span>`).join('、')}</div>`];
  if (d.intro) {
    const isSource = d.introEvidenceType === SFP_EVIDENCE_TYPE.source;
    parts.push(`<details class="sec"><summary>本门总说（${isSource ? '谱曰原文' : '释义'}）</summary><div style="font-size:var(--fs-sm);color:#cbbb8d;line-height:1.75;border-left:2px solid rgba(215,170,69,.4);padding-left:9px;margin-top:5px">${esc(String(d.intro).slice(0, 260))}${String(d.intro).length > 260 ? '……' : ''}</div></details>`);
  }
  return parts.join('');
}
function sfpPlainLibSearch(qs          )         {
  const hits           = [];
  for (const [k, v] of Object.entries(SFP_WHY_PLAIN                          )) {
    if (hits.length >= 2) break;
    const q = qs.find(x => x && v.includes(x)); if (!q) continue;
    let ci = -1;
    for (let i = 0; i < (SFP_POS         ).length; i++) { const cn = canonOf((SFP_POS         )[i].id); if (cn && cn.text.includes(k)) { ci = i; break; } }
    const at = v.indexOf(q);
    hits.push(`<div style="margin:5px 0;font-size:var(--fs-sm);color:#9cc3b2">白话文对照：「…${esc(v.slice(Math.max(0, at - 20), at + q.length + 50))}…」${ci >= 0 ? `——<span class="rdMore lnk" data-ci="${ci}">${esc((SFP_POS         )[ci].name)}</span>` : ''}</div>`);
  }
  return hits.join('');
}
let SFP_CORPUS = '';
function sfpCorpus()         {
  if (!SFP_CORPUS) {
    const parts           = [];
    for (const x of (SFP_POS         )) { const cn = canonOf(x.id); if (cn) parts.push(cn.text); }
    parts.push(Object.values(SFP_WHY_PLAIN                          ).join('\n'));
    parts.push((SFP_GLOSS         ).map((g     ) => String(g[0]) + String(g[1])).join('\n'));
    parts.push((SFP_POS         ).map((x     ) => x.name).join('\n'));
    SFP_CORPUS = parts.join('\n');
  }
  return SFP_CORPUS;
}
// 问句取词：剥疑问浮词后，在全语料（谱文+白话库+词典+位名）中找最长命中子串作检索词
function sfpBestTerm(qRaw        )         {
  const r0 = qRaw.trim().replace(/[?？。，,、！!\s]|是什么|什么是|什么意思|是什麼|什麼是|什麼意思|是啥|啥是|何义|何義|何时|何時|什么时候|什麼時候|会怎样|會怎樣|怎么样|怎麼樣|有哪些|哪些|请问|請問|一下|意思|解释|解釋|吗|嗎|呢|了|的/g, '');
  if (!r0) return '';
  const corp = sfpCorpus();
  const cands = [...new Set([r0, zhWith(r0, ZH_S2T, ZH_MAXLEN.t), zhWith(r0, ZH_T2S, ZH_MAXLEN.s)])];
  for (const r of cands) if (corp.indexOf(r) >= 0) return r;
  for (let L = Math.min(r0.length - 1, 8); L >= 2; L--)
    for (const r of cands) {
      if (r.length < L) continue;
      for (let i = 0; i + L <= r.length; i++) { const t = r.slice(i, i + L); if (corp.indexOf(t) >= 0) return t; }
    }
  return r0;
}
function sfpChatAnswer(qRaw        )         {
  const q0 = qRaw.trim(); if (!q0) return '';
  const qT = zhWith(q0, ZH_S2T, ZH_MAXLEN.t);
  const qq = q0 + ' ' + qT;
  if (/怎麼玩|怎么玩|玩法|規則|规则|怎麼擲|怎么掷|輸贏|输赢/.test(qq)) return SFP_RULES_A;
  let pHit      = null;
  for (const x of (SFP_POS         )) if (qT.includes(x.name) && (!pHit || x.name.length > pHit.name.length)) pHit = x;
  if (!pHit && /現居|现居|我在哪|當前位|当前位/.test(qq) && sfpS.active && sfpS.pos) pHit = SFP_BY[sfpS.pos];
  const qC = pHit ? qT.split(pHit.name).join(' ') : qT;
  const toks = qC.replace(/[^那謨阿彌陀佛]/g, ' ').split(' ').filter(t => t.length === 2);
  const combo = toks.length ? (SFP_ORD.indexOf(toks[0][0]) <= SFP_ORD.indexOf(toks[0][1]) ? toks[0] : toks[0][1] + toks[0][0]) : '';
  if (combo && (pHit || (sfpS.active && sfpS.pos))) return sfpMoveAnswerHtml(pHit || SFP_BY[sfpS.pos          ], combo);
  if (combo) return `<div class="cPlain" style="margin:4px 0">「${combo}」：${sfpPlain(combo)}。</div><div class="cRead" style="margin:4px 0">升降要看所在位的行法表——可这样问：「在南贍部洲掷得${combo}会怎样」。</div>`;
  if (/怎麼修|怎么修|如何修|怎樣修|怎样修/.test(qq)) {
    let dn = 0;
    for (let i = 1; i <= 15; i++) {
      const t = SFP_DOOR_BY[i] ? SFP_DOOR_BY[i].title : '';
      if (t && (qT.includes(t) || t.includes(qT.replace(/怎麼修|怎么修|如何修|怎樣修|怎样修|[?？。]/g, '')))) { dn = i; break; }
    }
    const dmp = qq.match(/第?([一二三四五六七八九十]{1,2})[门門]/);
    if (!dn && dmp) { const n2 = SFP_CN.indexOf(dmp[1]) + 1; if (n2 >= 1 && n2 <= 15) dn = n2; }
    if (!dn && pHit) dn = pHit.door;
    if (!dn && sfpS.active && sfpS.pos) dn = SFP_BY[sfpS.pos].door;
    if (dn) return sfpPracticeAnswerHtml(dn, pHit);
  }
  if (/橫超|横超/.test(qq)) return sfpCrossAnswerHtml();
  if (/還有救|还有救|有救嗎|有救吗|怎麼辦|怎么办|能出來|能出来/.test(qq)) { const p2 = pHit || (sfpS.active && sfpS.pos ? SFP_BY[sfpS.pos] : null); if (p2) return sfpUpwardAnswerHtml(p2, true); }
  if (/上進|上进|才能升|怎麼升|怎么升|升上去|向上走/.test(qq)) { const p2 = pHit || (sfpS.active && sfpS.pos ? SFP_BY[sfpS.pos] : null); if (p2) return sfpUpwardAnswerHtml(p2); }
  if (pHit) return sfpPosAnswerHtml(pHit);
  if (/輪相|轮相|六字|南無|南无/.test(qq)) return SFP_WHEEL_A;
  const dm = qq.match(/第?([一二三四五六七八九十]{1,2})[门門]/);
  if (dm) { const dn = SFP_CN.indexOf(dm[1]) + 1; if (dn >= 1 && dn <= 15) return sfpDoorAnswerHtml(dn); }
  const term = sfpBestTerm(q0) || q0;
  const base = sfpLocalSearch(term);
  const plainHits = sfpPlainLibSearch([...new Set([term, zhWith(term, ZH_S2T, ZH_MAXLEN.t), zhWith(term, ZH_T2S, ZH_MAXLEN.s)])]);
  const empty = base.indexOf('未检得') >= 0;
  const note = term !== q0.trim() && (!empty || plainHits) ? `<div class="cNote" style="margin:2px 0">依「${esc(term)}」检得：</div>` : '';
  if (empty && !plainHits) return '<div class="cRead" style="margin:4px 0">本地谱内、词典与白话库未检到这个词；G 版选佛谱智能体仍会继续依经据库检证。也可换更短的词、试繁体原文用字，或问某一谱位、轮相行法与门类。</div>';
  return note + (empty ? '' : base) + plainHits;
}
// —— G 版选佛谱智能体：AI 生成 + 依经检证 + 引文可核对；同问缓存即答不耗额度。
function agentAnswerHtml(d     , cacheSource         )         {
  const paras = String(d.answer).split(/\n+/).filter((s        ) => s.trim())
    .map((s        ) => `<div class="cRead" style="margin:4px 0">${esc(s)}</div>`).join('');
  const conf = d.confidence ? `<span class="kind">可信度：${esc(ASK_CONF[d.confidence] || String(d.confidence))}</span>` : '';
  const basis = d.basis && d.basis.label ? `<div class="cNote" style="margin:6px 0 0">依据：${esc(d.basis.label)} ${conf}</div>` : (conf ? `<div style="margin:6px 0 0">${conf}</div>` : '');
  const cites = Array.isArray(d.citations) ? d.citations.map((c     ) => `
      <details class="sec"><summary>《${esc(c.title || c.sourceId || '')}》${esc(c.ref || '')}</summary>
        <div class="citeItem">${c.supports ? `<div class="src">${esc(c.supports)}</div>` : ''}
        <div class="txt">${esc(String(c.quote || '').slice(0, 420))}${String(c.quote || '').length > 420 ? '……' : ''}</div>
        ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" style="color:#d7aa45;font-size:var(--fs-xs)">CBETA 原文 ↗</a>` : ''}</div></details>`).join('') : '';
  const cacheTag = cacheSource === 'local'
    ? '<div class="cNote" style="margin-top:4px">（本机缓存·即答，不计生成次数）</div>'
    : cacheSource === 'edge'
      ? '<div class="cNote" style="margin-top:4px">（云端经据缓存·即答，不计生成次数）</div>'
      : '';
  return `<div class="cMeta" style="margin-bottom:2px">选佛谱智能体 · G 版经据检证（AI 生成，仅供参考）</div>${paras}${basis}${cites ? `<div class="cMeta" style="margin:6px 0 2px">出处</div>${cites}` : ''}${cacheTag}<div class="cNote" style="margin-top:4px">引文出处可点开核对 CBETA 原文；今日剩余 ${askQuotaLeft()}/${ASK_LIMIT} 次。</div>`;
}
function agentLocalAnswerHtml(localHtml        , opened = false)         {
  if (!localHtml) return '';
  return `<details class="sec cbLocal"${opened ? ' open' : ''}><summary>本谱本地速查</summary><div style="margin-top:5px">${localHtml}</div></details>`;
}
async function agentAskRun(q        , msg                              , rerender            , localHtml = '') {
  const localOpen = agentLocalAnswerHtml(localHtml, true);
  const localFolded = agentLocalAnswerHtml(localHtml);
  const hitCache = askCacheGet(q);
  if (hitCache) { msg.a = agentAnswerHtml(hitCache, 'local') + localFolded; rerender(); return; }
  if (askQuotaLeft() <= 0) { msg.a = '<div style="color:#f08f7a">今日智能体问答已满一百次，明日再来；本谱本地速查仍可继续使用。</div>' + localOpen; rerender(); return; }
  // 三段式检索反馈（仿文钞）：检索常需十余秒，静句易被当成卡死——过 5 秒换一句仍然诚实的等待语
  msg.a = '<div class="cbStage">选佛谱智能体正在检证 G 版经据库……约十余秒，请稍候</div>' + localOpen;
  rerender();
  const slowTimer = setTimeout(() => { msg.a = '<div class="cbStage">经论浩繁，正在<b>细检 G 版相关篇章</b>并综合……</div>' + localOpen; rerender(); }, 5000);
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 45000);
    const r = await fetch(SFP_ASK_API, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: q }), signal: ctl.signal,
    });
    clearTimeout(to); clearTimeout(slowTimer);
    const d = await r.json();
    if (!r.ok || !d || !d.answer) throw new Error(d && d.message ? d.message : 'empty');
    const edgeHit = d.cacheStatus === 'hit';
    if (!edgeHit) {
      save.askq.n = Number.isInteger(d.remaining)
        ? Math.max(save.askq.n, ASK_LIMIT - d.remaining)
        : save.askq.n + 1;
      persist(); // 只计真正生成的一次；云端缓存命中不耗生成额度
    }
    askCachePut(q, d);
    msg.a = agentAnswerHtml(d, edgeHit ? 'edge' : '') + localFolded;
  } catch (e) {
    clearTimeout(slowTimer);
    const limited = e instanceof Error && e.message.includes('今日问义生成次数已满');
    msg.a = limited
      ? '<div style="color:#f08f7a">今日智能体生成次数已满；本机及云端已缓存的问答仍可继续查看。</div>' + localOpen
      : '<div class="cNote" style="margin:4px 0">智能体暂未连接（网络或服务未就绪）；以下为本谱本地速查，稍后可重问。</div>' + localOpen;
  }
  rerender();
}
// 智能体回答本机缓存：同一问题只请一次，之后秒回且不耗额度
const ASK_CACHE_KEY = 'sm10.askCache.v1';
function askCacheGet(q        )             {
  try { const m = JSON.parse(localStorage.getItem(ASK_CACHE_KEY) || '{}'); return m[q] ? m[q].a : null; } catch { return null; }
}
function askCachePut(q        , a     ) {
  try {
    const m = JSON.parse(localStorage.getItem(ASK_CACHE_KEY) || '{}');
    m[q] = { a, t: Date.now() };
    const ks = Object.keys(m);
    if (ks.length > 120) ks.sort((x, y) => m[x].t - m[y].t).slice(0, ks.length - 120).forEach(k => delete m[k]);
    localStorage.setItem(ASK_CACHE_KEY, JSON.stringify(m));
  } catch { }
}
// v243：AI 解读与「问」分家——解读直开本掷的既定内容卡；「问」才进入聊天模式。
function openTossReading(ctx                                                         ) {
  const F = ctx.from ? SFP_BY[ctx.from] : null;
  const inner = el(`<div class="panel"><h2>AI 解读 · 掷得「${esc(ctx.c)}」</h2><div class="body">
    ${F ? `<div class="cMeta">现居「${esc(F.name)}」 · 第${SFP_CN[F.door - 1]}门「${esc(SFP_DOOR_BY[F.door].title)}」</div>` : ''}
    <div class="cbA" style="margin-top:8px">${sfpTossAnswerHtml({ c: ctx.c, from: ctx.from, to: ctx.to, evidence: ctx.evidence })}</div>
    ${(() => { const j = sfpJourneySummary(); return j ? `<details class="sec"><summary>这一程走势</summary><div style="margin-top:4px">${j}</div></details>` : ''; })()}
    <div id="trChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${(() => { const P0 = (ctx.to ? SFP_BY[ctx.to] : null) || F; if (!P0) return ''; const pred = P0.pure ? '什么是横超' : (P0.door === 2 || P0.door === 3) ? '堕到这里还有救吗' : '现在掷得什么才能上进'; return [`${P0.name}是什么`, `${SFP_DOOR_BY[P0.door].title}怎么修`, pred].map(c2 => `<span class="chipQ">${esc(c2)}</span>`).join(''); })()}</div>
    <div class="cNote">本地解读：由本谱结构化语料逐条检证拼证，不联网、不生成；引文皆逐字原文。解读未尽，点下方签或「问」追问。</div></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="gbtn" id="trAsk">问</button><button class="gbtn primary" id="trOk" style="flex:1">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  inner.addEventListener('click', (e) => { // 情境签带着问题进入「问」；AI 解读本身仍是固定内容卡
    const ch = (e.target               ).closest ? (e.target               ).closest('.chipQ')                : null;
    if (ch) { playSfx('sfx-tap', 0.25); openSfpReading({ ask: ch.textContent || '' }); return; }
    const m = (e.target               ).closest ? (e.target               ).closest('.rdMore')                : null;
    if (m) { const x = (SFP_POS         )[Number(m.dataset.ci)]; if (x) { closeOverlay(); openSfpNote(x.id); } }
  });
  (inner.querySelector('#trAsk')               ).addEventListener('click', () => { playSfx('sfx-tap', 0.25); openSfpReading(); });
  (inner.querySelector('#trOk')               ).addEventListener('click', closeOverlay);
  openOverlay(inner);
}
function openSfpReading(ctx                                                                         ) {
  if (ctx && ctx.pos && !ctx.c) { openSfpNote(ctx.pos); return; } // v228 卡片归一：位的解读就在位卡里
  if (!sfpChat.length) sfpChat.push({ u: '', a: SFP_CHAT_HELLO });
  const seedToss = (c        , f         , to         ) => {
    const F = f ? SFP_BY[f] : null; const T = to ? SFP_BY[to] : null;
    const stay = !!(F && T && F.id === T.id);
    const dir = !F ? 'start' : stay ? 'stay' : (T ? sfpDirOf(F, T, c) : 'bonus');
    const evidence = f && c ? sfpWhyEvidence(f, c) : null;
    const q = askQFor(c, dir === 'bonus' ? '' : dir, f, to);
    if (sfpChat.length && sfpChat[sfpChat.length - 1].u === q) return;
    sfpChat.push({ u: q, a: sfpTossAnswerHtml({ c, from: f, to, evidence }) });
  };
  if (ctx && ctx.c) seedToss(ctx.c, ctx.from, ctx.to);
  // 开「问」不再自动灌入上一掷解读；快捷签只呈现当下最可能追问的三件事。
  const chips           = [];
  if (sfpS.active && sfpS.pos) {
    const cur = SFP_BY[sfpS.pos];
    chips.push(`${cur.name}是什么`);
    const last = sfpHist[sfpHist.length - 1];
    chips.push(last && last.c ? `掷得${last.c}会怎样` : '六字轮相何义');
    chips.push(cur.pure ? '什么是横超' : (cur.door === 2 || cur.door === 3) ? '堕到这里还有救吗' : '现在掷得什么才能上进');
    chips.push(`${SFP_DOOR_BY[cur.door].title}有哪些位`);
  } else chips.push('这局怎么玩', '六字轮相何义', '上品上生是什么');
  const pnl = el(`<div class="panel"><h2>问 · 与本谱对话</h2>
    <div class="body" id="cbLog" style="display:flex;flex-direction:column"></div>
    <div id="cbChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${chips.map(c => `<span class="chipQ">${esc(c)}</span>`).join('')}</div>
    <div style="display:flex;gap:6px;margin-top:7px"><input id="cbQ" class="cbInput" type="text" placeholder="问谱位·名相·行法…"><button class="gbtn primary" id="cbGo" style="min-height:46px;padding:0 18px">问</button></div>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="gbtn" id="cbClr">清空对话</button><button class="gbtn primary" id="cbOk" style="flex:1">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  const log = pnl.querySelector('#cbLog')               ;
  const render = () => {
    log.innerHTML = zh(sfpChat.map(m => `${m.u ? `<div class="cbRow"><div class="cbU">${esc(m.u)}</div></div>` : ''}<div class="cbRow"><div class="cbA">${m.a}</div></div>`).join(''));
    log.scrollTop = log.scrollHeight;
  };
  const send = (qGiven         ) => {
    const inp = pnl.querySelector('#cbQ')                    ;
    const q = (qGiven !== undefined ? qGiven : inp.value).trim();
    if (!q) return;
    if (qGiven === undefined) inp.value = '';
    playSfx('sfx-tap', 0.25);
    const msg = { u: q, a: '' };
    sfpChat.push(msg);
    if (sfpChat.length > 30) sfpChat.splice(0, sfpChat.length - 30);
    void agentAskRun(q, msg, render, sfpChatAnswer(q));
  };
  (pnl.querySelector('#cbGo')               ).addEventListener('click', () => send());
  (pnl.querySelector('#cbQ')                    ).addEventListener('keydown', (e) => { if ((e                 ).key === 'Enter') send(); });
  (pnl.querySelector('#cbClr')               ).addEventListener('click', () => { sfpChat.length = 0; sfpChat.push({ u: '', a: SFP_CHAT_HELLO }); render(); });
  pnl.addEventListener('click', (e) => {
    const chip = (e.target               ).closest ? (e.target               ).closest('.chipQ')                : null;
    if (chip) { send(chip.textContent || ''); return; }
    const m = (e.target               ).closest ? (e.target               ).closest('.rdMore')                : null;
    if (m) { const x = (SFP_POS         )[Number((m               ).dataset.ci)]; if (x) { closeOverlay(); openSfpNote(x.id); } }
  });
  (pnl.querySelector('#cbOk')               ).addEventListener('click', closeOverlay);
  openOverlay(pnl);
  render();
  if (ctx && ctx.ask) send(ctx.ask); // V67：情境签进入聊天后自动提交该问
}
function openSfpIntro() {
  // 调试钩子：仅供自测驱动（不影响玩法）
  (window       ).__sfpGo = (id        ) => { if (sfpS.active) sfpGoto(id, '调试移位'); };
  const hasSave = !!(save.sfp && SFP_BY[save.sfp.pos]);
  const p = el(`<div class="panel"><h2>选佛谱 · 缘起与玩法</h2><div class="body">
    <div class="igLead">明末蕅益大师五十五岁手定的一部<b>掷轮图谱</b>：两枚轮相刻「那·謨·阿·彌·陀·佛」，掷之即在十法界二百二十位间升沉——从地狱到成佛，一图备见。</div>
    <div class="igMeta">釋智旭（蕅益大師）述 · 六卷 · 癸巳（1653）歙浦迴龍精舍 · CBETA B0136</div>
    <div class="igOr"><b class="k">缘起</b><span>大师见同参耽于博弈，想拿一张能长智慧的图替下赌局；旧传的选佛图或失传、或理路不通，遂自己重制。</span>
      <div class="verse"><i class="duL">敘</i>見諸法友眈嗜博奕。思易之以幽溪之圖。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div></div>
    <div class="igOr"><b class="k">初心</b><span>要让人在游戏之间，亲眼看见六道往还有多苦、三乘出离有何差别。</span>
      <div class="verse"><i class="duL">敘</i>能使人即遊戲間。頓知六道往還之疲苦。三乘出要之差別。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div></div>
    <div class="igOr"><b class="k">精神</b><span>图中一切升沉判语皆依经论教乘而定，不出自己的猜想；三十余年反复改图，只为「易于行」。</span>
      <div class="verse"><i class="duL">敘</i>皆本教乘非出臆見。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div></div>
    <details class="sec"><summary>怎么掷 · 三步</summary>
      <div class="igStep"><span class="n">1</span><span class="tx"><b>长按掷轮</b>，至心称念一句佛号，念毕松手即掷<i>两轮合读即「南无阿弥陀佛」——掷轮即是称名</i></span></div>
      <div class="igStep"><span class="n">2</span><span class="tx"><b>首掷定發始因地</b>，此后每掷依当位行法表升降<i>那·謨二字下坠，阿·彌·陀·佛四字上升</i></span></div>
      <div class="igStep"><span class="n">3</span><span class="tx"><b>判词窗点「行」落子</b>，行至圆教究竟妙觉即选佛及第<i>无输局：堕三途亦不出谱，仍依本位行法续掷</i></span></div>
      <div class="igTwo"><div><b>豎入</b><span>依自力沿藏通別圓四教位次拾级而登</span></div>
        <div><b>橫超</b><span>念佛往生净土，径趋毕局——第十四门「淨土橫超門」</span></div></div></details></div>
    <div class="igBtns">
      ${hasSave ? '<button class="gbtn primary wide" id="sfpResume">续掷上局</button>' : ''}
      <button class="gbtn ${hasSave ? '' : 'primary wide'}" id="sfpNew">新开一局</button>
      <button class="gbtn" id="sfpLog">见闻录</button>
      <button class="gbtn" id="sfpMapB">十五门全图</button>
      <button class="gbtn wide" id="sfpBack">再看看</button></div></div>`);
  const rs = p.querySelector('#sfpResume');
  if (rs) rs.addEventListener('click', () => startSfp(true));
  (p.querySelector('#sfpNew')               ).addEventListener('click', () => startSfp(false));
  (p.querySelector('#sfpLog')               ).addEventListener('click', () => { closeOverlay(); openLogbook(); });
  (p.querySelector('#sfpMapB')               ).addEventListener('click', () => openSfpMap());
  (p.querySelector('#sfpBack')               ).addEventListener('click', closeOverlay);
  openOverlay(p);
}

// ---------------- 导览（已删除：十界导览整体下线，引用总表改由 ☰ 菜单直达） ----------------

// ---------------- 拾取 ----------------
const raycaster = new THREE.Raycaster();
const _bpM4 = new THREE.Matrix4(); const _bpV = new THREE.Vector3();
function beadScreenPick(px        , py        , maxPx        )                {
  const rect = renderer.domElement.getBoundingClientRect();
  let best                = null, bd = maxPx;
  for (const b of sfpBeadPick) {
    let o                        = b, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (!vis) continue;
    const im = b                       ;
    const pids = (b.userData.pids            ) || [];
    for (let i = 0; i < pids.length; i++) {
      if (!pids[i]) continue;
      im.getMatrixAt(i, _bpM4); _bpV.setFromMatrixPosition(_bpM4); im.localToWorld(_bpV); _bpV.project(camera);
      if (_bpV.z > 1) continue;
      const d = Math.hypot(px - (_bpV.x * 0.5 + 0.5) * rect.width, py - (-_bpV.y * 0.5 + 0.5) * rect.height);
      if (d < bd) { bd = d; best = pids[i]; }
    }
  }
  return best;
}
function doorScreenPick(px        , py        , maxPx        )                                              {
  const rect = renderer.domElement.getBoundingClientRect();
  let best                                              = null, bd = maxPx;
  for (const k of Object.keys(doorStarBest)) {
    const b = doorStarBest[Number(k)];
    if (!b || !b.star || !b.star.visible || !!b.pure !== inPure) continue;
    b.star.getWorldPosition(_bpV).project(camera);
    if (_bpV.z > 1) continue;
    const d = Math.hypot(px - (_bpV.x * 0.5 + 0.5) * rect.width, py - (-_bpV.y * 0.5 + 0.5) * rect.height);
    if (d < bd) { bd = d; best = { door: Number(k), pos: b.star.getWorldPosition(new THREE.Vector3()) }; }
  }
  return best;
}
let downPos = { x: 0, y: 0, t: 0 };
let lastTap = { t: 0, x: 0, y: 0 };
let beadNoteTimer = 0;
// 长按谱位珠＝速览气泡（松手即散，不开整张笺纸卡）
const peekEl = el('<div id="peek" class="ui panel"></div>');
app.appendChild(peekEl);
let peekTimer = 0, peekOn = false;
function showPeek(pid        , x        , y        ) {
  const p = SFP_BY[pid]; if (!p) return;
  const note = String(p.note || '').replace(/\s+/g, ' ').trim();
  const snip = note.length > 64 ? note.slice(0, 64) + '…' : note;
  peekEl.innerHTML = zh(`<b>${esc(p.name)}</b> · 第${SFP_CN[p.door - 1]}门${p.pure ? ' · 净土' : ''}<div style="margin-top:3px">${esc(snip)}</div><div style="margin-top:4px;font-size:var(--fs-xs);color:#9d9170">松手即散 · 短按读全文 · 双击飞临</div>`);
  peekEl.style.display = 'block';
  const r = app.getBoundingClientRect();
  const w = peekEl.offsetWidth, h = peekEl.offsetHeight;
  peekEl.style.left = Math.min(Math.max(8, x - r.left - w / 2), Math.max(8, r.width - w - 8)) + 'px';
  peekEl.style.top = Math.max(8, y - r.top - h - 20) + 'px';
  peekOn = true; vib(6);
}
function hidePeek() { peekEl.style.display = 'none'; peekOn = false; }
renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
  cancelFly();
  clearTimeout(peekTimer); peekTimer = 0; hidePeek();
  if (!inDoor) { // 按下即拾珠：静持 420ms 弹速览
    const rect0 = renderer.domElement.getBoundingClientRect();
    const nd0 = new THREE.Vector2(((e.clientX - rect0.left) / rect0.width) * 2 - 1, -((e.clientY - rect0.top) / rect0.height) * 2 + 1);
    raycaster.setFromCamera(nd0, camera);
    const vb0 = sfpBeadPick.filter(b => { let o                        = b; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
    const bh0 = raycaster.intersectObjects(vb0, false);
    let pid0                = null;
    if (bh0.length && bh0[0].instanceId !== undefined) pid0 = (bh0[0].object.userData.pids            )[bh0[0].instanceId ];
    if (!pid0) pid0 = beadScreenPick(e.clientX - rect0.left, e.clientY - rect0.top, 34);
    if (pid0) { const pf = pid0; peekTimer = window.setTimeout(() => { peekTimer = 0; showPeek(pf, e.clientX, e.clientY); }, 420); }
  }
});
renderer.domElement.addEventListener('pointermove', (e) => { // 拖动即散/取消待弹
  if ((peekTimer || peekOn) && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 9) {
    clearTimeout(peekTimer); peekTimer = 0; hidePeek();
  }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  clearTimeout(peekTimer); peekTimer = 0;
  if (peekOn) { hidePeek(); lastTap = { t: 0, x: 0, y: 0 }; return; } // 速览中松手＝只散气泡
  const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
  const held = performance.now() - downPos.t;
  if (Math.hypot(dx, dy) > 9 || held > 900) return;
  const nowT = performance.now();
  const isDbl = nowT - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 26;
  lastTap = isDbl ? { t: 0, x: 0, y: 0 } : { t: nowT, x: e.clientX, y: e.clientY };
  const zoomOutDbl = () => { // 双击空处＝拉远一档；两场内改为复位场内取景（v208 对齐：免拉出场外悬着）
    if (inDisc) {
      flyTo(discView(), discTarget(), 1.0);
      playSfx('sfx-tap', 0.18);
      return;
    }
    if (inSky) {
      flyTo(new THREE.Vector3(92, 222, 100), new THREE.Vector3(0, 168, 0), 1.0);
      playSfx('sfx-tap', 0.18);
      return;
    }
    if (inBodhi) {
      const B = byId['bodhi'].marker.getWorldPosition(new THREE.Vector3());
      const az = camera.position.clone().sub(B); az.y = 0;
      if (az.lengthSq() < 1) az.set(1, 0, 0); az.normalize();
      flyTo(B.clone().addScaledVector(az, 102).add(new THREE.Vector3(0, 18, 0)), B.clone(), 1.0);
      playSfx('sfx-tap', 0.18);
      return;
    }
    const dir = camera.position.clone().sub(controls.target), len = dir.length();
    flyTo(controls.target.clone().addScaledVector(dir.normalize(), Math.min(len * 1.85, inDoor ? 300 : 430)), controls.target.clone(), 0.85);
    playSfx('sfx-tap', 0.18);
  };
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (inDisc) { // v314 星盘专场：珠体拾取开谱注（标签另有 click，此为珠本体兕底）
    const dh = raycaster.intersectObjects(discPick, false);
    if (dh.length && held <= 420) {
      const pid = dh[0].object.userData.pid          ;
      if (pid) { playSfx('sfx-tap', 0.2); openSfpNote(pid); return; }
    }
  }
  // 就地观照：门观中位珠点击交给下方通用念珠拾取（同一套拾取体，无需单独射线）
  // 先试选佛谱念珠：短按读谱注，长按飞往定位
  const visBeads = sfpBeadPick.filter(b => { let o                        = b; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
  const bh = raycaster.intersectObjects(visBeads, false);
  if (bh.length && bh[0].instanceId !== undefined) {
    const pid = (bh[0].object.userData.pids            )[bh[0].instanceId];
    if (pid) { // 双击珠＝飞临定位；长按＝速览气泡（pointerdown 侧）；短按延迟开谱注给双击留窗口
      if (isDbl) { clearTimeout(beadNoteTimer); sfpLocate(pid); }
      else if (held <= 420) beadNoteTimer = window.setTimeout(() => openSfpNote(pid), 270);
      return;
    }
  }
  if (held > 380) return;
  // 门题字命中（恒定屏幕尺寸的字看得清也要点得中）：按屏幕矩形试各门题字，命中即视同点门星
  if (!inPure && !starView && modeT < 0.05) {
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const hw = rect.height * 0.055 + 12, hh = 18; // 去序后门名更短，命中矩形随之收窄免误命中邻门
    for (const k of Object.keys(doorStarBest)) {
      const b = doorStarBest[Number(k)]; if (!b || !b.labelSp || !b.star) continue;
      if (!!b.pure !== inPure) continue;
      if (!b.star.visible) continue; // 展开态下暂隐的余门星：题字也不参与命中
      if (!b.labelSp.visible) continue; // 防叠隐去的题字不参与命中（免点中看不见的门）
      b.labelSp.getWorldPosition(tmpV).project(camera);
      if (tmpV.z > 1) continue;
      const sx = (tmpV.x * 0.5 + 0.5) * rect.width, sy = (-tmpV.y * 0.5 + 0.5) * rect.height;
      if (Math.abs(px - sx) < hw && Math.abs(py - sy) < hh) {
        doorTap(Number(k), isDbl, b.star.getWorldPosition(new THREE.Vector3()));
        return;
      }
    }
  }
  // 门星：短按展开/收拢该门位次，双击俯冲贴近就地观照
  const vds = doorStarPick.filter(b => { let o                        = b; while (o) { if (o.visible === false) return false; o = o.parent; } return true; });
  const dsh = raycaster.intersectObjects(vds, false);
  if (dsh.length) {
    doorTap((dsh[0].object.userData       ).door          , isDbl, (dsh[0].object              ).getWorldPosition(new THREE.Vector3()));
    return;
  }
  // v168 极乐四土与诸位直点：名牌/莲台/光轮短按开该土该位说明，双击凑近观照
  if (inPure && !sfpTransit) {
    const ph = raycaster.intersectObjects(pureHits, false);
    if (ph.length) {
      const pid = (ph[0].object.userData       ).purePid          ;
      const wp = (ph[0].object              ).getWorldPosition(new THREE.Vector3());
      playSfx('sfx-tap', 0.2);
      if (isDbl) {
        clearTimeout(beadNoteTimer);
        const az = camera.position.clone().sub(wp); az.y = 0;
        if (az.lengthSq() < 1) az.set(0, 0, 1); az.normalize();
        flyTo(wp.clone().addScaledVector(az, 32).add(new THREE.Vector3(0, 8, 0)), wp.clone(), 0.9);
      } else beadNoteTimer = window.setTimeout(() => { if (pid === '凡聖同居土') openFourLands(); else openSfpNote(pid); }, 270);
      return;
    }
  }
  // 选佛局中收紧节点拾取：只响应当前位锚定的法界，免转视角时误弹卡片
  let cand = nodeViews.filter(nv => nv.label.style.display !== 'none' || nv.marker.visible)
    .filter(nv => (inPure ? nv.d.pure : inSky ? SKY_IDS.has(nv.d.id) : !nv.d.pure))
    .filter(nv => modeTarget === 0 || nv.d.realm);
  const hits = cand.map(nv => nv.hit)
    .concat(inSky ? [] : auxViews.filter(av => av.obj.visible).map(av => av.hit)); // 一套系统：局中也可自由点阅全图法界（边探索边学习边行棋）
  const isects = raycaster.intersectObjects(hits, false);
  if (isects.length) {
    const nid = (isects[0].object.userData       ).nodeId;
    if (nid === 'gate' && !inPure) { gateTap(isDbl); return; } // 极乐星专拍：缓开卡留双击直入窗口
    if (nid === 'rupa' && !inSky) { rupaTap(isDbl); return; } // 色界总星专拍：单击转场入色界场
    if (nid === 'rupa' && inSky) { // v208 交互总纲：场内再点本星＝出（与「场内再点本门＝出」同法，900ms 冷却）
      if (performance.now() - skyEnterAt > 900) { returnSaha(); playSfx('sfx-tap', 0.2); }
      return;
    }
    if (nid === 'rupa' && inSky) { selectNode(nid, false); return; } // 场内点总星：只开卡不拽镜头
    if (nid === 'bodhi' && !inBodhi) { bodhiTap(isDbl); return; } // 菩萨星专拍：双击转场入菩萨道场
    if (nid === 'bodhi' && inBodhi) { // v208 同法：场内再点道场主星＝出
      if (performance.now() - bodhiEnterAt > 900) { returnSaha(); playSfx('sfx-tap', 0.2); }
      return;
    }
    if (CHAN_LAYER[nid] && !inPure) { chanTap(CHAN_LAYER[nid], isDbl); return; } // 禅天主星：单击绽开/收拢，双击凑近开卡
    if (isDbl) { // 双击法界＝凑近观照（用户定案：双击＝入场）
      const v = viewPosFor(byId[nid]);
      flyTo(v.target.clone().addScaledVector(v.pos.clone().sub(v.target), 0.55), v.target, 0.9);
    } else selectNode(nid);
  } else {
    const px2 = e.clientX - rect.left, py2 = e.clientY - rect.top;
    const pid2 = beadScreenPick(px2, py2, 40);
    if (pid2) {
      if (isDbl) { clearTimeout(beadNoteTimer); sfpLocate(pid2); }
      else if (held <= 420) beadNoteTimer = window.setTimeout(() => openSfpNote(pid2), 270);
      return;
    }
    if (!inPure && !starView && modeT < 0.05) {
      const dh2 = doorScreenPick(px2, py2, 44);
      if (dh2) { doorTap(dh2.door, isDbl, dh2.pos); return; }
    }
    if (!isDbl && !comet && trailLine.visible && vdAskCtx && sfpS.active) {
      for (let i = 0; i < TRAIL_N; i += 2) {
        _bpV.set(trailPos[i * 3], trailPos[i * 3 + 1], trailPos[i * 3 + 2]).project(camera);
        if (_bpV.z > 1) continue;
        const dtr = Math.hypot(px2 - (_bpV.x * 0.5 + 0.5) * rect.width, py2 - (-_bpV.y * 0.5 + 0.5) * rect.height);
        if (dtr < 20) { playSfx('sfx-tap', 0.25); openTossReading(vdAskCtx); return; }
      }
    }
    if (isDbl) zoomOutDbl();
  }
});

const hovEl = el('<div id="hovTag" class="ui"></div>');
app.appendChild(hovEl);
let hovLast = 0;
const isFinePtr = matchMedia('(pointer:fine)').matches;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!isFinePtr || e.pointerType === 'touch') return;
  if (e.buttons) { hovEl.style.display = 'none'; return; }
  const nowH = performance.now(); if (nowH - hovLast < 90) return; hovLast = nowH;
  if (sfpTransit || overlayEl || sfpS.rolling || starView) { hovEl.style.display = 'none'; return; }
  const rect = renderer.domElement.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  let nm = '';
  const pidH = beadScreenPick(px, py, 22);
  if (pidH && SFP_BY[pidH]) nm = SFP_BY[pidH].name;
  else { const dh = doorScreenPick(px, py, 22); if (dh && SFP_DOOR_BY[dh.door]) nm = `第${SFP_CN[dh.door - 1]}门 · ${SFP_DOOR_BY[dh.door].title}`; }
  if (!nm) { hovEl.style.display = 'none'; return; }
  hovEl.textContent = zh(nm);
  hovEl.style.display = 'block';
  hovEl.style.left = Math.min(px + 14, rect.width - 130) + 'px';
  hovEl.style.top = (py + 16) + 'px';
});
let wheelBackAt = 0;
renderer.domElement.addEventListener('wheel', (e) => {
  if (e.deltaY <= 0 || sfpTransit || overlayEl || starView) return;
  const nowW = performance.now(); if (nowW - wheelBackAt < 1400) return;
  if (camera.position.distanceTo(controls.target) < controls.maxDistance * 0.965) return;
  if (inSky || inBodhi || inPure) { wheelBackAt = nowW; returnSaha(); playSfx('sfx-tap', 0.18); }
  else if (inDoor) { wheelBackAt = nowW; exitDoor(true); playSfx('sfx-tap', 0.18); }
}, { passive: true });

// 键盘
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') sfpTossUp(); // 空格松开＝旁掷（palmHeld 内部把关）
  flyKeys.delete(e.key.toLowerCase());
});
window.addEventListener('keydown', (e) => {
  const tgt = e.target               ;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return; // 问义输入框打字不触快捷键
  if (e.code === 'Space' && !e.repeat) { // 空格按住＝念佛蓄势，松开＝旁掷（与长按同构）
    if (sfpS.active && !overlayEl) { e.preventDefault(); sfpPalmDown(); return; }
  }
  if (e.key === 'Enter' && verdictEl.classList.contains('show') && verdictFn) { e.preventDefault(); commitVerdict(); return; } // 回车＝判词「行」
  const kl = e.key.toLowerCase();
  if (flightOn && kl.length === 1 && 'wasd'.includes(kl)) { flyKeys.add(kl); return; } // 飞行时 WASD 不再切剖面
  if (!overlayEl) { // v220：弹窗开着时读卡按键不误切剖面
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') setSection(sectionH + 8);
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setSection(sectionH - 8);
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !sfpTransit && !starView) {
      const cur = inDoor || browseDoor || (sfpS.active && sfpS.pos ? SFP_BY[sfpS.pos].door : 1);
      const nxt = Math.min(15, Math.max(1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      if (nxt !== cur) railDoorTap(nxt, false);
    }
    if ((e.key === 'f' || e.key === 'F') && !sfpTransit) browseMapMode();
  }
  if (e.key === 'Escape') {
    if (overlayEl) closeOverlay();
    else if (card.isConnected) closeCard();
    else if (inBodhi && bodhiGrp >= 0) setBodhiGrp(bodhiGrp); // 先收展开的科组（v160 交互巡检）
    else if (inSky && skySel > 0) setSkySel(skySel); // 色界同法（v166）：先收选层再退场
    else if (inPure || inSky || inBodhi || inDisc) returnSaha();
    else if (inDoor) exitDoor(true); // v169 门观也入剥洋葱链（因地门单击直入后 Esc 退全图）
  }
});

// v266 档位指示：三粒小点亮当前观照档（全图/门·场/星位），迷路感即除
const tierDotsEl = el('<div id="tierDots" class="ui"><i title="全图"></i><i title="门·场"></i><i title="星位"></i><b></b></div>');
app.appendChild(tierDotsEl);
let tierCur = -1;
function updateTierDots() {
  const t = starView ? 2 : (inDoor || inNether || inSky || inBodhi || inPure || inDisc) ? 1 : 0;
  if (t === tierCur) return;
  tierCur = t;
  tierDotsEl.querySelectorAll('i').forEach((d2, i) => d2.classList.toggle('on', i === t));
  (tierDotsEl.querySelector('b')               ).textContent = zh(['全图', '门场', '星位'][t]); // v328 档名自证：三点旁竖排现档
}
updateTierDots(); // 慢网时首帧循环可能延后：控件挂载即呈档名与亮点，避免短暂显示成三个无义杂点
// ---------------- 标签投影 ----------------
const tmpV = new THREE.Vector3();
const tmpCam = new THREE.Vector3();
function updateLabels() {
  updateTierDots();
  const w = app.clientWidth, h = app.clientHeight;
  const camDist = camera.position.distanceTo(controls.target);
  // 矩形避让：已占屏幕区域记入 rects，后来者重叠则隐（选中位与 tier1 优先）
  const rects                                          = [];
  // 同节点主标签占区：副标签（善见城/天王名/月）遇自家主标重叠时让位——免「善见城」压住「忉利天」
  for (const k in nodeLabelRects) delete nodeLabelRects[k]; // v320：提升为模块级，门观附位签同查
  const mainRect = nodeLabelRects;
  // 禅天主星是层把手、色界诸天是唯一门户（v140）：避让优先级提半档，免被鄰星题字挤掉后无处可点
  // v219 在位者优先（滞回）：上帧已显的标签在避让竞争中占先，杜绝两标来回闪切拉锯
  const _tw = (nv          ) => { const d = nv.d       ; return ((CHAN_LAYER[d.id] || d.id === 'rupa') ? d.tier - 0.5 : d.tier) - (nv.label.style.display !== 'none' ? 0.2 : 0); };
  const ordered = [...nodeViews].sort((a, b) =>
    (a.d.id === selectedId ? -1 : b.d.id === selectedId ? 1 :
      (_tw(a) - _tw(b)) || (((b       ).realmIdx ?? -1) - ((a       ).realmIdx ?? -1))));
  ordered.forEach(nv => {
    const d = nv.d;
    let vis = true;
    // 就地观照：门观中不再隐法界标签——位珠就铺在法界上，锚点名正是空间语境
    if (inPure) vis = !!d.pure;
    else if (d.pure) vis = false;
    if (inDisc) vis = false; // v314 因地星盘专场：主图题字全隐（星环自有标签层）
    // 色界观照场门禁（v140）：子树整组隐时题字同隐；入场后只显色界题字（全场模型无噪）
    if (SKY_IDS.has(d.id) && !skyRealm.visible) vis = false;
    if (inSky && !SKY_IDS.has(d.id)) vis = false;
    // v223：他层星隐已由 chanShow 整层裁决；题字门禁移入下方 CHAN_OF 块（全览只留星核·天名随聚显层出）
    if (inBodhi && d.id !== 'bodhi' && d.id !== 'buddha') vis = false; // 菩萨道场：只留本星与佛星题字（妙觉遥归佛界），余字不扰塔
    // 签栏点开哪门＝哪门全亮、无关全隐（v143 用户定案）：只留本门位珠所踞锚点的题字（正开着卡的节点仍显）；
    // 色界场内不叠此门禁（v146）：场内已由 SKY 规则独显坛城，再叠会把十八天隐成空场
    // v325 门5观照补签（用户反馈色界哑签）：层把手 chan1-4 虽非锚点亦放行；本门锚点/把手的距隐阈放宽至 540（门观全景距必超旧阈，原规则把禅天签全隐成哑场）
    const actD = inDoor || browseDoor;
    const doorHot = !!(actD && ((DOOR_ANCHORS[actD] && DOOR_ANCHORS[actD].has(d.id)) || (actD === 5 && /^chan[1-4]$/.test(d.id))));
    if (!inSky && actD && vis && d.id !== selectedId && !doorHot) vis = false;
    if (vis && !inPure) {
      if (modeTarget === 1 || modeT > 0.5) vis = !!d.realm;
      else {
        if (!passFilter(d)) vis = false;
        if (d.tier === 2 && camDist > (doorHot ? 540 : 380)) vis = false; // 门观放宽；普通远景继续降噪
        if (d.tier === 3 && camDist > (doorHot ? 540 : 300) && !inSky) vis = false; // 细分天层节点（一位一地）：近观才现，全景不扰十五门星；门观锚点例外；色界场内恒现
        if (d.tier === 3 && !chanShow(d.id)) vis = false; // 坛城收拢：未绽开层的成员天隐（行棋涉门五时全现）
        nv.marker.getWorldPosition(tmpV);
        if (tmpV.y > sectionH + 3 && !inSky) vis = false;
      }
    }
    nv.marker.visible = vis;
    if (!vis) { nv.label.style.display = 'none'; return; }
    if (CHAN_OF[d.id]) { // 绽放动画：刚绽开的层，成员星自小涨到满尺（半秒）
      const L = CHAN_OF[d.id];
      const k = L === (inSky ? skySel : chanOpen) ? Math.min(1, (performance.now() - chanRevealT) / 480) : 1;
      // v223 场内两态（该显的显、该隐的隐）：全览轻显 0.72 / 聚显层满尺（他层已由 chanShow 整层隐）
      const foc = !inSky ? 1 : (skySel <= 0 ? 0.72 : 1);
      nv.marker.scale.setScalar((0.25 + 0.75 * (1 - (1 - k) * (1 - k))) * foc);
      const haloM = nv.marker.children.find(c => c.userData.billboard);
      if (haloM) haloM.visible = !inSky || L === skySel; // v223 光晕环只随聚显层出：全览只留星核
      if (inSky) {
        const posAnchor = sfpS.pos ? (SFP_BY[sfpS.pos]       ).anchor : '';
        if (!((skySel > 0 && L === skySel) || d.id === selectedId || d.id === posAnchor)) { nv.label.style.display = 'none'; return; } // 天名只随聚显层出；现居/选中例外
      }
    }
    nv.marker.getWorldPosition(tmpV);
    const distC = focusHazeOn ? tmpV.distanceTo(camera.position) : 0;
    tmpCam.copy(tmpV).applyMatrix4(camera.matrixWorldInverse);
    if (tmpCam.z > -1) { nv.label.style.display = 'none'; return; }
    tmpV.project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
    // 标签盒估算（translate(-50%,-140%)：盒在锚点上方）
    const fs = d.tier === 1 ? 14 : 11.5;
    const lw = d.name.length * fs + 22, lh = fs + 13;
    const x0 = x - lw / 2, y0 = y - lh * 1.4;
    // 贴边即隐，不留剪断半截标签
    if (x0 < 2 || x0 + lw > w - 2 || y0 < 2 || y > h - 4) { nv.label.style.display = 'none'; return; }
    const sel = d.id === selectedId;
    // 近距中心区避让加大：贴近看山时标签疏一档，免堤在一起
    const pad = camDist < 260 ? 4 + (260 - camDist) * 0.09 : 4;
    if (!sel && rects.some(r => x0 < r[0] + r[2] + pad && x0 + lw + pad > r[0] && y0 < r[1] + r[3] + pad * 0.75 && y0 + lh + pad * 0.75 > r[1])) {
      nv.label.style.display = 'none'; return;
    }
    rects.push([x0, y0, lw, lh]);
    mainRect[d.id] = [x0, y0, lw, lh];
    nv.label.style.display = '';
    nv.label.classList.toggle('far', d.tier === 2 && camDist > 240 && !sel); // 三段式：240 内胶囊→240–380 幽灵→380 外隐（门槛下移，避开常用视距的跳变带）
    // 聚焦雾开启时，远处法界标签同步退隐
    nv.label.style.opacity = focusHazeOn && !sel && distC > camDist * 1.9 ? '0.22' : '';
    nv.label.style.left = `${Math.round(x)}px`; nv.label.style.top = `${Math.round(y)}px`; // v219 取整消亚像素抖动
  });
  // 同族同进退（标签降噪）：族内标签要么全显要么全隐，按族设距离门——
  // 免「七座金山只剩一座有名」这类避让幸存者，既省噪音又不误导；近观才逐一现名
  const AUX_FAM_DIST                         = { 七金山: 240, 四天王: 265, 山腰三级: 240, 三轮: 200 };
  const auxFamOK = {};
  for (const k in AUX_FAM_DIST) auxFamOK[k] = camDist <= AUX_FAM_DIST[k];
  // 辅标记（四天王平台球 / 月宫标签）：只在辅标签之间避让，不被节点标签挤掉
  const rectsAux                                          = [];
  auxViews.forEach(av => {
    const nv = byId[av.nodeId];
    let vis = !inPure && !inDoor && !browseDoor && !inSky && !inBodhi && !inDisc && modeTarget === 0 && modeT <= 0.5 && camDist <= 380 && passFilter(nv.d); // 签栏开门/色界场/菩萨道场/因地星盘中辅标同隐（v143/v314）
    if (vis) {
      av.obj.getWorldPosition(tmpV);
      if (tmpV.y > sectionH + 3) vis = false;
    }
    av.obj.visible = vis;
    if (!av.label) return;
    if (!vis) { av.label.style.display = 'none'; return; }
    av.obj.getWorldPosition(tmpV);
    const distA = focusHazeOn ? tmpV.distanceTo(camera.position) : 0;
    // 四面天王标签：平台转到山体背面时隐去，免得透山错标到对面平台上
    if (av.facing) {
      const dn = Math.hypot(tmpV.x, tmpV.z) * Math.hypot(camera.position.x, camera.position.z) || 1;
      if ((tmpV.x * camera.position.x + tmpV.z * camera.position.z) / dn < -0.1) { av.label.style.display = 'none'; return; }
    }
    tmpCam.copy(tmpV).applyMatrix4(camera.matrixWorldInverse);
    if (tmpCam.z > -1) { av.label.style.display = 'none'; return; }
    tmpV.project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
    const lw = ((av.label.textContent || '').length) * 11.5 + 22, lh = 24;
    const x0 = x - lw / 2, y0 = y - lh * 1.4;
    const mr = mainRect[av.nodeId];
    if (mr && x0 < mr[0] + mr[2] + 4 && x0 + lw + 4 > mr[0] && y0 < mr[1] + mr[3] + 3 && y0 + lh + 3 > mr[1]) {
      av.label.style.display = 'none'; return;
    }
    if (x0 < 2 || x0 + lw > w - 2 || y0 < 2 || y > h - 4) { av.label.style.display = 'none'; return; }
    if (rectsAux.some(r => x0 < r[0] + r[2] + 4 && x0 + lw + 4 > r[0] && y0 < r[1] + r[3] + 3 && y0 + lh + 3 > r[1])) {
      av.label.style.display = 'none'; return;
    }
    rectsAux.push([x0, y0, lw, lh]);
    av.label.style.display = '';
    av.label.style.opacity = focusHazeOn && distA > camDist * 1.9 ? '0.22' : '';
    av.label.style.left = `${x}px`; av.label.style.top = `${y}px`;
  });
}
function updateCompass() {
  if (!compass.isConnected) return; // 罗盘已撤
  const f = new THREE.Vector3().subVectors(controls.target, camera.position); f.y = 0;
  if (f.lengthSq() < 0.001) return;
  f.normalize();
  const dirs                                  = [['e', 1, 0], ['s', 0, 1], ['w', -1, 0], ['n', 0, -1]];
  dirs.forEach(([cls, dx, dz]) => {
    const dot = f.x * dx + f.z * dz, cross = f.x * dz - f.z * dx;
    const th = Math.atan2(cross, dot);
    const sp = compass.querySelector('.' + cls)               ;
    const r = 26;
    sp.style.transform = `translate(${-50 + Math.sin(th) * 0 }%,-50%) translate(${Math.sin(th) * r}px,${-Math.cos(th) * r}px)`;
  });
}

// ---------------- 主循环 ----------------
// ② 缓起—巡航—缓落：五次 smootherstep，两端更缓、中段近匀速，落位前自带悬停半拍
const ease = (t        ) => t * t * t * (t * (6 * t - 15) + 10);
let last = performance.now();
let elapsed = 0;
let lastDraw = 0, perfAcc = 0, perfN = 0;
function frame(now        ) {
  requestAnimationFrame(frame);
  // v221 功耗治理（手机发热）：触屏机静观期 30fps；飞行/转场/掷轮/触控等动势期放行全帧率
  if (isCoarse) {
    const busy = flyAnim || sfpTransit || comet || hitStopT > 0 || sfpS.rolling || starView
      || (flightOn && (flyKeys.size > 0 || joyVec.x !== 0 || joyVec.y !== 0)) // 神足默认常开：只在真有输入时才算动势
      || secAnimTo !== null || Math.abs(modeTarget - modeT) > 0.0005 || now < perfBoostUntil || netBusy();
    if (!busy && now - lastDraw < 31) return;
  }
  lastDraw = now;
  let dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (isCoarse && dprScale > 0.7) { // 自适应：连 30fps 都撑不住（帧距>45ms 持续约 7 秒）则分辨率降一档
    perfAcc += dt; perfN++;
    if (perfN >= 210) { if (perfAcc / perfN > 0.045) { dprScale -= 0.15; applyDpr(); } perfAcc = 0; perfN = 0; }
  }
  if (hitStopT > 0) { hitStopT = Math.max(0, hitStopT - dt); dt *= 0.06; } // ③ 顿帧：全世界凝一口气
  elapsed += dt;

  // 飞行
  if (flyAnim) {
    flyAnim.t += dt / flyAnim.dur;
    const k = ease(Math.min(flyAnim.t, 1));
    camera.position.lerpVectors(flyAnim.p0, flyAnim.p1, k);
    controls.target.lerpVectors(flyAnim.t0, flyAnim.t1, k);
    if (flyAnim.t >= 1) flyAnim = null;
  }
  // 神足飞行：摇杆/键位合成移动向量，相机与取景点同平移（拖动转向仍由 OrbitControls 接管）
  if (flightOn && !flyAnim && !comet) {
    const fy = (flyKeys.has('w') ? 1 : 0) - (flyKeys.has('s') ? 1 : 0) - joyVec.y;
    const fx = (flyKeys.has('d') ? 1 : 0) - (flyKeys.has('a') ? 1 : 0) + joyVec.x;
    if (fx || fy) {
      camera.getWorldDirection(_fm);
      _fr.crossVectors(_fm, camera.up).normalize();
      _fm.multiplyScalar(fy).addScaledVector(_fr, fx);
      const sp = 58 * dt;
      camera.position.addScaledVector(_fm, sp);
      controls.target.addScaledVector(_fm, sp);
      // 界域约束：不飞出铁围山外太远，不钻地底
      const cx0 = inPure ? -2000 : 0;
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, -58, 400);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, -58, 400);
      const dxz = Math.hypot(camera.position.x - cx0, camera.position.z);
      if (dxz > 680) {
        const s = 680 / dxz;
        camera.position.x = cx0 + (camera.position.x - cx0) * s; camera.position.z *= s;
        controls.target.x = cx0 + (controls.target.x - cx0) * s; controls.target.z *= s;
      }
    }
  }
  controls.update();

  // 聚焦雾：谱局落定且非飞行/掷轮/观星时，雾密度随取景距收紧；其余回归基准
  {
    const fog = scene.fog                 ;
    const camD = camera.position.distanceTo(controls.target);
    focusHazeOn = sfpS.active && !!sfpS.pos && !inPure && !sfpTransit && !starView && !flyAnim && !sfpS.rolling
      && modeTarget === 0 && modeT < 0.5;
    const ft = focusHazeOn ? Math.min(0.006, Math.max(fogBase, 0.42 / Math.max(camD, 20))) : fogBase;
    fog.density += (ft - fog.density) * Math.min(1, dt * 2.2);
  }

  // 空间⇄心性过渡
  const dm = modeTarget - modeT;
  if (Math.abs(dm) > 0.0005) {
    modeT += dm * Math.min(1, dt * 3.2);
    if (Math.abs(modeTarget - modeT) < 0.004) modeT = modeTarget;
  }
  const k = ease(THREE.MathUtils.clamp(modeT, 0, 1));
  saha.scale.setScalar(1 - k * 0.82);
  saha.position.y = -k * 60;
  saha.visible = !inPure && !inSky && !inBodhi && !inNether && !inDisc && k < 0.995; // v162：道场专场幕布；v171 幽冥专场同幕；v314 因地星盘同幕
  netherScene.visible = inNether || saha.visible; // 幽冥家族：随沙盘同隐现，专场内独显
  nodesRoot.visible = !inPure && !inSky && !inDisc;
  mandala.visible = !inPure && !inSky && !inBodhi && !inDisc && k > 0.6;
  mandalaLines.scale.setScalar(0.6 + k * 0.4);
  (mandalaLines.children         ).forEach(c => { if (c.material) c.material.opacity = (c.material.userData?.base ?? 0.5) * k; });
  nodeViews.forEach(nv => {
    if (nv.mandalaPos && !nv.d.pure) {
      nv.marker.position.lerpVectors(nv.spacePos, nv.mandalaPos, k);
      const m = (REALMS       )[nv.realmIdx].mind;
      const s = 1 + k * (0.25 + m.altru * 0.75);
      nv.marker.scale.setScalar(s);
    }
  });

  // 日月 / 涟漪 / 广告牌光环
  // 日行方向依《俱舍论》卷十一四洲时分：南洲日中时东洲日没、西洲日出——故日必东→南→西→北（俯瞰顺时针右繞）；
  // 本场景 +x=东 +z=南，three 绕 y 正旋是东→北，故取负向（四洲昼夜染色按日实际方位算，自动跟随）
  sunMoonPivot.rotation.y -= dt * 0.06;
  {
    // 「日月」节点标记跟随太阳运行，不再停在固定空点
    const smNv = byId['sunmoon'];
    const sb = sunMoonPivot.userData.sun                              ;
    if (smNv && sb) { sb.getWorldPosition(tmpV); smNv.marker.position.copy(tmpV); }
    // 四洲昼夜：依日所在方位渐亮渐暗（世记经：一方日出，余方次第为中、为没）
    if (sb) {
      tmpV.y = 0;
      if (tmpV.lengthSq() > 0.001) {
        tmpV.normalize();
        for (const { m, dir, day } of contDayNight) {
          const t = THREE.MathUtils.clamp((tmpV.dot(dir) + 0.55) / 1.1, 0, 1);
          const mat = m.material                              ;
          mat.color.copy(CONT_NIGHT).lerp(day || CONT_DAY, t); // 昼色带本面宝色（东银/南琉璃/西颇胝迦/北金）
          mat.emissive.setHex(0xf6c85f); mat.emissiveIntensity = t * 0.2;
        }
      }
    }
  }
  starGroup.position.copy(camera.position); // 天穹随相机：门内星域/极乐也在同一片星空下
  starGroup.rotation.y += dt * 0.0035;      // 天球周旋
  if (nodesRoot.visible || inPure) {
    for (const star of spinStars) star.rotation.y += dt * (star.userData.spin || 0.02);
  }
  const twT = elapsed;
  starLayers.forEach(L => { L.mat.opacity = L.base * (0.82 + 0.18 * Math.sin(twT * L.spd + L.ph)); });
  updateWheelToss(dt);
  pureLand.children.forEach(c => {
    if ((c       ).userData?.ripple !== undefined) {
      const ph = (elapsed * 0.4 + (c       ).userData.ripple / 3) % 1;
      c.scale.setScalar(0.5 + ph * 1.1);
      ((c              ).material                           ).opacity = 0.55 * (1 - ph);
    } else if ((c       ).userData?.tuGlow !== undefined) {
      ((c                ).material                        ).opacity =
        0.7 + Math.sin(elapsed * 0.8 + (c       ).userData.tuGlow) * 0.18;
    } else if ((c       ).userData?.flowerRain && inPure) {
      const arr = ((c                ).geometry.getAttribute('position')                         );
      for (let i = 0; i < arr.count; i++) {
        let y = arr.getY(i) - dt * (2.2 + (i % 5) * 0.5);
        if (y < -2) y = 80;
        arr.setY(i, y);
        arr.setX(i, arr.getX(i) + Math.sin(elapsed * 0.7 + i) * dt * 1.2);
      }
      arr.needsUpdate = true;
    } else if ((c       ).userData?.bird && inPure) {
      const b = (c       ).userData.bird;
      const a = elapsed * b.sp + b.ph;
      c.position.set(Math.cos(a) * b.r, b.h + Math.sin(elapsed * 0.9 + b.ph) * 2.2, 30 + Math.sin(a) * b.r);
      c.lookAt(pureLand.position.x + Math.cos(a + 0.12) * b.r, b.h, 30 + Math.sin(a + 0.12) * b.r);
      c.children.forEach((w, wi) => { if (wi > 0) w.rotation.x = Math.sin(elapsed * 7 + b.ph) * 0.5; });
    }
  });
  nodeViews.forEach(nv => {
    nv.marker.children.forEach(ch => { if (ch.userData.billboard) ch.quaternion.copy(camera.quaternion); });
    if (nv.d.id === selectedId) {
      const p = 1 + Math.sin(elapsed * 5) * 0.18;
      nv.marker.children[0].scale.setScalar(p);
    } else {
      const actD = inDoor || browseDoor; // 一位即一星：开门时充位的节点星轻呼吸，代位珠亮相
      if (actD && NODE_POS_ANCH[actD] && NODE_POS_ANCH[actD].has(nv.d.id)) nv.marker.children[0].scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.12);
      else nv.marker.children[0].scale.setScalar(1);
    }
  });
  sageOrbit.rotation.y += dt * 0.03;
  if (secAnimTo !== null) { // 幽冥窗缓降/缓合
    const nh = THREE.MathUtils.lerp(sectionH, secAnimTo, Math.min(1, dt * 3.2));
    if (Math.abs(nh - secAnimTo) < 0.4) { setSection(secAnimTo); secAnimTo = null; }
    else setSection(nh);
  } else if (secAuto && controls.target.y > 18) { secAnimTo = secPrev; secAuto = false; } // 回望地上即复原
  updateChanMandala(dt);
  sfpGlowUpdate(elapsed);
  doorStarsUpdate(elapsed);
  locGlowUpdate(elapsed);  cometUpdate(dt);
  doorStarsUpdate(elapsed);
  pawnUpdate(elapsed, dt);
  waterUpdate(elapsed, dt);
  impactUpdate(dt);
  // 就地观照后真人同修珠全图常见（同一坐标系，无门内隐珠之分）
  netFrame(dt); // 联机同修珠：滑行与名牌投影

  updateLabels();
  updateDoorLabels();
  doorLabelCullFn();
  syncBackBtn();
  updateCompass();

  if (composer && !save.settings.lowPerf) composer.render();
  else renderer.render(scene, camera);
}

// 尺寸
function onResize() {
  const w = app.clientWidth, h = app.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  // 星盘平面阵 DX 依宽高比定：横竖屏切换时重建
  const dc = w > h ? 'l' : 'p';
  if (discBuilt && dc !== discAspectCls) {
    const dd = discDoor;
    discTeardown();
    if (inDisc) { buildDisc(dd); flyTo(discView(), discTarget(), 0.7); }
  }
}
window.addEventListener('resize', onResize);

// 首次手势 → 音频
window.addEventListener('pointerdown', () => { initAudio(); }, { once: true });

// ---------------- 启动 ----------------
(async () => {
  try { await (window       ).gp?.player?.ready; } catch (e) {}
  loadSave();
  if (save.zh === 't') { zhDom(document.body); sfpStatus(); updateModeChip(); refreshPureNames(); }
  applyDpr();
  applyCardTheme();
  document.documentElement.classList.toggle('bigfont', !!save.settings.bigFont);
  if (ambientNodes) (ambientNodes       ).gain.gain.value = save.settings.ambient ? 0.035 : 0;
  updateLabelBadges();
  (window       ).__dbg = { camera, controls, renderer, get inPure() { return inPure; }, get modeT() { return modeT; }, get perf() { return { isCoarse, dprScale, pr: renderer.getPixelRatio() }; } };
  // 首帧着色器编译很重（软渲染环境可达数秒），推迟到 load 之后启动以免阻塞页面 load 事件
  const startLoop = () => requestAnimationFrame(frame);
  if (document.readyState === 'complete') startLoop();
  else window.addEventListener('load', () => setTimeout(startLoop, 50), { once: true });
  (window       ).__gpReady = true;
  // ---------------- 联机接线 ----------------
  Net.init({ toast: showToast, zh, confirm: confirmLeaveMatch });
  let netHydrateMode = '';
  let netTurnWake = 0;
  const hydrateNetGame = (force = false) => {
    const me = Net.me();
    if (!me || (!Net.isPlaying() && !(Net.isFinished() && me.done))) return;
    const serverPos = me.pos && SFP_BY[me.pos] ? me.pos : null;
    const serverN = Number(me.n) || 0;
    if (!force && sfpS.active && sfpS.pos === serverPos && sfpS.n === serverN) return;
    if (!sfpS.active) startSfp(false);
    else {
      cancelVerdict();
      cometCancel();
      cancelFly();
      if (sfpTimer) clearTimeout(sfpTimer);
      wheelAnim = null;
      palmHeld = false;
      sfpS.rolling = false;
      sfpDice.classList.remove('on', 'settle');
      sfpQuiet(false);
      setTransit(false);
    }
    sfpS.pos = serverPos;
    sfpS.n = serverN;
    sfpS.finished = !!me.done;
    sfpBonusLeft = Number(me.bonus) || 0;
    sfpS.trail = sfpS.pos ? [sfpS.pos] : [];
    sfpS.seenD = sfpS.pos ? [SFP_BY[sfpS.pos].door] : [];
    sfpHist = [];
    rebuildFoot();
    if (sfpS.pos) {
      sfpFlyAnchor(SFP_BY[sfpS.pos]);
      sfpShowMsg(`已从服务器恢复：现居「${SFP_BY[sfpS.pos].name}」`);
    } else {
      pawnHide();
      sfpShowMsg('本局尚未起行');
    }
    sfpStatus();
  };
  const scheduleNetTurnUi = () => {
    clearTimeout(netTurnWake);
    const wait = Number(Net.room.availableAt || 0) - Date.now();
    if (wait > 0) netTurnWake = window.setTimeout(() => syncRollGlow(), wait + 40);
    syncRollGlow();
  };
  Net.onJoined = ({ reconnecting = false } = {}) => {
    netHydrateMode = reconnecting ? 'drift' : 'force';
    if (!reconnecting) {
      closeOverlay();
      Net.openPanel();
      // 首次入座：趁准备室还没有任何计时，把玩法速览看完；开局后就不再打断了
      if (!(save       ).sfpHelp) {
        (save       ).sfpHelp = true;
        persist();
        setTimeout(() => { if (Net.active && !Net.isPlaying()) openSfpHelp(); }, 400);
      }
    }
  };
  let rosterRoom = '';
  let wasHost = false;
  Net.onRoster = () => {
    netSyncBeads();
    if (netHydrateMode) {
      hydrateNetGame(netHydrateMode === 'force');
      netHydrateMode = '';
    }
    // 房主离席后由最早仍在室者递补；前台不再显示东南西北方位。
    if (Net.active) {
      if (rosterRoom === Net.code && !wasHost && Net.isHost()) {
        showToast(zh('原房主已离开——您现在是房主，可邀请莲友并开始下一局'), 5200);
      }
      rosterRoom = Net.code;
      wasHost = Net.isHost();
    } else {
      rosterRoom = '';
      wasHost = false;
    }
  };
  Net.onState = () => {
    netMirrorBonus();
    netClockSync();
    netVerdictClock();
    scheduleNetTurnUi();
    if (Net.isFinished() && Net.me()?.done && sfpS.active) sfpVictory(true);
  };
  Net.onMatchStarted = () => {
    closeOverlay();
    Net.closePanel();
    startSfp(false);
    showToast('真人共修共同开局——依入座次序轮流掷轮', 4200);
    netClockSync();
    scheduleNetTurnUi();
  };
  Net.onToss = (message) => {
    netSyncBeads();
    if (message.playerId !== Net.myId) {
      if (message.player?.done) sfpPeerWin(message.name, message.player.n);
      return;
    }
    if (!sfpS.active) startSfp(false);
    sfpS.rolling = true;
    sfpDice.classList.add('on');
    sfpQuiet(true);
    sfpAnimateCommittedToss(message.combo, Number(message.player?.n));
  };
  Net.onMatchFinished = (message) => {
    sfpS.rolling = false;
    sfpS.finished = !!Net.me()?.done;
    syncRollGlow();
    const winners = (message.winners || [])
      .map(id => Net.players.find(p => p.id === id)?.name)
      .filter(Boolean);
    sfpShowMsg(message.reason === 'not_enough_players'
      ? '有效同修不足两位，本局已中止'
      : (winners.length ? `${winners.join('、')}本局及第——已共同结算` : '本局已共同结算'));
    // 及第者走及第面板（内含同座现况）；其余人与旁观者走共同结算卡，两者不并出
    if (Net.me()?.done) sfpVictory(true);
    else openNetSettle(message);
  };
  Net.onCommandError = () => {
    if (!palmHeld && sfpS.rolling && !verdictFn && !sfpTransit) {
      sfpS.rolling = false;
      sfpDice.classList.remove('on');
      sfpQuiet(false);
      syncRollGlow();
    }
  };
  Net.onHall = () => openPlaza();                 // 在座也能回大厅看看/换室（不离席）
  Net.onLeft = () => {
    if (sfpS.active) endSfp('已离开真人共修室');
    plazaStop();                                  // 即使旧大厅定时器还挂着，也以这次显式离席为准
    openPlaza();
  };
  Net.onLocked = (locked, key) => {
    showToast(zh(locked ? `本室密码已设为 ${key}——点「邀请」转发，莲友点开即入座` : '本室密码已撤，诸位莲友皆可入座'), 4200);
    playSfx('sfx-done', 0.35);
  };
  // 邀请链接直达：#r=桌号 或 #r=桌号.密码 ——密码由链接带着，莲友点开即入座
  if (Net.invited) {
    const { code: iCode, key: iKey } = Net.invited;
    Net.invited = null;
    history.replaceState(null, '', location.pathname); // 链接已用毕，清掉免刷新重入
    plazaSit(iCode, '', false, iKey);
  } else {
    openTitle();
    // 刷新或浏览器短暂重启后，凭本机保存的 playerId 回到原座；
    // 只读服务器快照恢复棋况，绝不把本机旧进度上传覆盖房间。
    const savedNet = Net.savedRoom();
    if (savedNet?.code && savedNet?.playerId && savedNet?.name) {
      Net.joinRoom(savedNet.code, savedNet.name, savedNet.playerId, savedNet.key || '')
        .then(() => showToast(zh(`已重回${Net.roomLabel()}`), 3600))
        // 据实报因：满座、密码、协议不符、另一页面占着——从前一律塌缩成「连不上」，
        // 用户照着提示反复重试，其实原因根本不在网络。
        .catch((e) => showToast(zh((e && e.message) || '原共修室暂时连不上，可从大厅重新入座'), 4600));
    }
  }
  setInterval(persist, 10000);
  window.addEventListener('beforeunload', persist);
  // 关页面时把未送达的掷数用 beacon 送走（fetch 会被中断，beacon 不会）
  window.addEventListener('pagehide', () => { persist(); Plaza.flushOnExit(); });
})();
