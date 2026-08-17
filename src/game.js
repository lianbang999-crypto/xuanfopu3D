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
import { SFP_CANON_DOORS } from './sfp-canon.js'; // 六卷原文（CBETA B0136 逐字）；卷首卷末四篇今归阅读器，此处不再引
import { sfpEvidenceReady, sfpEvidenceDeepBuilt, SFP_EVIDENCE_TYPE, SFP_WHY_EVIDENCE, sfpWhyEvidence, sfpEvidenceItems, mergeSfpEvidence, makeSfpInterpretationEvidence, makeSfpOperationalEvidence, makeSfpSourceEvidence, makeSfpGlyphEvidence, sfpManualWhyText, sfpWhyLayered, SFP_WHY_LAYER_LABEL } from './sfp-evidence.js'; // sfpManualWhyText：手工逐组轮相说明（复刻线上 V104），白话主句以它为先
import { streamAsk, askFormat, historyOf } from './ask-core.js'; // 问谱客户端内核（与阅读页 reader-ask.js 共用）
import { czOf, czReady, czLoaded } from './sfp-chengzhu-lazy.js'; // 承注库懒壳（2026-08-14 切库）：判词卡与智能体同据此一份，口径不二；831KB 生成件出首包，收口见 showVerdict 竞速门
import { SFP_GLOSS, SFP_DOOR_PLAIN } from './sfp-gloss.js';
import { SFP_DOOR_BAIHUA } from './sfp-door-baihua.js'; // 十五门门义白话（繁体本，浮标可标）；旧本 SFP_DOOR_PLAIN 系简体，仅作回落
// 卡制总纲 v2「三问」六库（移植线上 V106 v474–v478）：门卡／辅标／段签／器世间／量数词／处所白话覆盖
import { SFP_CAUSE } from './sfp-cause.js';
import { KOSA_Q, KOSA_ROWS } from './sfp-kosa.js';
import { SFP_DOOR_QA } from './sfp-door-qa.js';
import { SFP_AUX } from './sfp-aux.js';
import { SFP_TENET } from './sfp-tenet.js';
import { SFP_VESSEL } from './sfp-vessel.js';
import { SFP_MEASURE } from './sfp-measure.js';
import { SFP_PLACE_PLAIN } from './sfp-place-plain.js';
// 2026-08-12「正本为准，旧数据下线」：sfp-why-plain.js（437 KB · 1462 键的旧对读本）与
//   sfp-pos-plain.js（39 KB · 旧本文言缩写）两份旧白话已撤出主包，文件同删。
//   下线的实据：位白话正本 220/220 全备、发布判词正本 4620/4620 全备，两份旧本的每一处
//   取值点都测得不可达；留着不是保险，是让同一句谱注在站内并存两副白话。
import { SFP_POS_BAIHUA } from './sfp-pos-baihua.js'; // 二百二十位位注白话手译本（220/220 已译毕）：领起句 v ＋明细行 rows ＋他经补注 ext
import { ZH_T2S, ZH_S2T } from './zh-conv.js';
import { Net } from './net.js'; // 联机同修：房间/轮次/聊天（渲染在本文件「联机同修珠」段）
import { quickShare, openPosterCard } from './share.js'; // 分享卡＋分享海报：荐此界/邀莲友/单站海报（二维码+一键转发）
import * as Plaza from './plaza.js'; // 共修大厅：12 桌网格·动态广播·念佛功课榜
import { mountChalou, chalouApi, mountChalouFeed, mountChalouInput, CHALOU_CSS } from './chalou.js'; // 莲友茶寮（2026-08-11 与主站脱钩）：本站自建留言，全屏页与大厅右墙共用
import { IS_APP, API_BASE, INSTALL_KIND, IS_IOS_SAFARI, IS_WECHAT } from './app-env.js'; // 安卓壳（2026-08-17）：一份构建网页/壳运行时分辨；壳下 API 指站点正源、启动挂热更壳
// 六卷原文阅读器已迁独立页面 read.html（2026-08-12，src/reader-page.js）——本文件不再 import sfp-reader，openReader 只作跳转
import { ico, ICON_CSS } from './icons.js'; // 内联 SVG 图标：去处与行项先认形，再认字
import { sfpDirOf as sfpDirOfRule } from './sfp-rules.js'; // 行棋升降判定（与 check-dir 核证脚本同源）
import { SFP_FACE_ORDER, canonicalSfpCombo } from './sfp-engine.js'; // 单机/联机共用轮面与组合归一化
import { sfpCanonVerdict, sfpQuoteKind, SFP_VERDICT_CANON_COUNT, sfpVerdictCanonReady, sfpVerdictCanonLoaded, sfpVerdictCanonSeed } from './sfp-verdict-canon.js'; // 正本/门01–15：4620 格发布判词（2026-08-14 切库：内部动态装载，1.6MB 出首包），及「谱曰／承前」判分
import { sfpSplitOf } from './sfp-canon-split.js'; // 位文切点表（220 位逐位手核）：义解｜行法｜后论

const C = {
  bg: 0x201b2f, ink: 0x173d52, mala: 0x246b66, cinn: 0x8b3f32,
  gold: 0xd7aa45, paleGold: 0xd8c58b, paper: '#efe0b4', deep: 0x25354d,
};
const app = document.getElementById('app')               ;

// 安卓壳启动务（2026-08-17）：报到（不报则插件 10s 自动回滚）＋静默热更探针。
// 动态 import 自成 chunk，网页用户永不下载；失败静默——壳的事不扰网页一分。
if (IS_APP) import('./app-shell.js').then((m) => m.bootAppShell()).catch(() => {});

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
  cardTheme: 'night'  , // 卡片主题：'night' 暗夜（默认，2026-07-31 用户定案改回）/ 'paper' 青纸（可切）
  settings: { sfx: true, ambient: true, music: true, lowPerf: false, bigFont: false, moveFx: true }, // music：成佛时唱赞一遍；moveFx：行棋乘光飞行特效；关＝直达落位
};
function applyCardTheme() { document.documentElement.classList.toggle('paperCards', save.cardTheme === 'paper'); }
let persistLast = ''; // v392 脏比对：定时兜底存档没变就不写（localStorage 写是同步 IO）
function persist() { try { const s = JSON.stringify(save); if (s !== persistLast) { persistLast = s; localStorage.setItem(SAVE_KEY, s); } } catch (e) {} }
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
    if (d.cardTheme === 'paper' || d.cardTheme === 'night') save.cardTheme = d.cardTheme; // 从前漏读此键：写经纸主题一刷新即回落暗夜
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
// 属性同转（title/aria-label/placeholder）：tooltip 与读屏名也是显示层，不该停在开机语言。
// 属性元素长命（不像文本节点随 innerHTML 重建即弃），故记「原文＋我们上次写出的值」两份——
// 现值若不等于上次写出值，说明程序另行改写过（如 quickSfp.title 随行处变），以新值为原文，勿用陈值覆盖。
const ZH_ATTRS = ['title', 'aria-label', 'placeholder'];
const zhAttrOrig = new WeakMap                                                       ();
function zhAttrs(el2         ) {
  let rec = zhAttrOrig.get(el2);
  for (const a of ZH_ATTRS) {
    const cur = el2.getAttribute(a);
    if (!cur || !/[㐀-鿿]/.test(cur)) continue;
    if (!rec) { rec = {}; zhAttrOrig.set(el2, rec); }
    let ent = rec[a];
    if (!ent || ent.out !== cur) ent = rec[a] = { orig: cur, out: cur };
    ent.out = zh(ent.orig);
    if (ent.out !== cur) el2.setAttribute(a, ent.out);
  }
}
function zhDom(root      ) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n             ;
  while ((n = w.nextNode())) {
    const t = n        ;
    if (!t.nodeValue || !/[\u3400-\u9fff]/.test(t.nodeValue)) continue;
    if ((t.parentElement && t.parentElement.tagName === 'STYLE')) continue;
    if (t.parentElement && t.parentElement.closest('[data-nozh]')) continue; // \u4e13\u540d\u8c41\u514d\uff1a\u8f6e\u76f8\u516d\u5b57\u300c\u5357\u7121\u963f\u5f4c\u9640\u4f5b\u300d\u7b49\u539f\u8c31\u523b\u6587\uff0c\u4e0d\u968f\u7b80\u7e41\u8f6c\u6362

    let orig = zhOrig.get(t);
    if (orig === undefined) { orig = t.nodeValue; zhOrig.set(t, orig); }
    t.nodeValue = zh(orig);
  }
  if (root instanceof Element) { // 属性层：根自身与其内所有带译注属性的元素
    zhAttrs(root       );
    (root       ).querySelectorAll(`[${ZH_ATTRS.join('],[')}]`).forEach(e2 => zhAttrs(e2));
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
async function preloadAudio() { // v392 提前解码：load 后即建 ctx（自动播放策略下为 suspended，解码照常）——首掷不再因解码未毕而无声
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
    // 唱赞懒加载（v392）：开着音乐才预热——关着的用户不再白付 917KB 下载与整段 PCM 解码内存；
    // playChant 需要时会自行 startMusic()
    if (save.settings.music) void startMusic();
  } catch (e) { actx = null; }
}
function initAudio() { // 首手势：预载已就绪只需唤醒；极早点击或预载未跑/失败则当场建（手势内新建即 running）
  if (!actx) { void preloadAudio(); return; }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
}
async function startMusic() {
  if (!actx || chantBuf) return chantBuf;
  if (chantLoad) return chantLoad;
  chantLoad = (async () => {
    try {
      // v393 成佛曲改《奇哉奇哉》（发起人定案）：佛陀成道初唱「奇哉奇哉！一切眾生皆具如來智慧德相」，
      // 与成佛一刻的义理正对——旧弥陀唱赞归极乐一路，此处要的是「本自具足，今始证得」这一句。
      // 入库走流拷贝（-c:a copy）：只剥夹带的 360×360 封面图，音频比特流原样不动——
      // 与原件 MD5 逐字节相同（184k/48kHz 立体声，945KB→917KB）。
      // 勿再「转码换小」：源本是有损 mp3，再编一遍即二次生成损失，音质只会更差。
      const r = await fetch('assets/bgm-qizai.mp3');
      if (!r.ok) throw new Error(`成佛曲资源 ${r.status}`);
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
// 唱赞留着句柄才停得下来：从前起了就撒手，人离开成佛面板后它还在唱，
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
// v393 复归默认高清（发起人定案）：AA 一律开着，不再按档关（v392 曾因「composer 路径下画布 MSAA 不生效」
// 而只在直渲档开——省的那点带宽换不来画质上的任何好处，反落个「画质被动过」的疑）。
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(app.clientWidth, app.clientHeight);
const isCoarse = matchMedia('(pointer:coarse)').matches; // v221 功耗治理：触屏机（手机/平板）默认省电档
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches; // v392 系统减弱动效：飞行缩时去跟飞、顿帧震屏皆息（防晕与无障碍）
// v392 壁画光总开关（美术定案「石窟两极」：夜境参榆林窟西夏水月观音、净土参莫高盛唐宝池经变）——
// 默认即壁画档；?art=cg 回旧写实档对照（光比/墨影/石青轮廓/反射/法线/绢纹六处随此旗）
const ART_MURAL = new URLSearchParams(location.search).get('art') !== 'cg';
renderer.setPixelRatio(Math.min(devicePixelRatio, save.settings.lowPerf ? 1 : isCoarse ? 1.6 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// v392 阴影冻结：投影体全是静态山体殿宇（castShadow 清单尽在建山段），日灯亦不动——
// 深度图只在山体形态/各场显隐变化时重烘一帧（键控见主循环 shadowPrev），静观期省掉整个 shadow pass
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
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

const hemi = new THREE.HemisphereLight(0x3d5273, 0x2a3347, 0.85 * (ART_MURAL ? 1.25 : 1)); // v191 压底光抬光比；开机值＝LIGHT_SCENES.saha；v392 壁画档环境光抬档补直射之降（满堂平光）
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdfae, ART_MURAL ? 2.2 : 3.0); // v392 壁画光：直射压档，形体交给色阶（光比自 ~3.5:1 收向 ~1.6:1）
sun.position.set(50, 130, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02; // v210：曲面阴影去痤疮（束腰山体/球珠曲面）
sun.shadow.intensity = ART_MURAL ? 0.55 : 1; // v392 壁画光：实影化淡墨——影是晕染不是 CG 投影
const sc = sun.shadow.camera                            ;
sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 400;
scene.add(sun);
// v191 写实化：冷色轮廓光自背面提体积（不投影，不违反单投影灯）+ RoomEnvironment 供 PBR 环境反射
const rim = new THREE.DirectionalLight(ART_MURAL ? 0x6f9ec9 : 0x8fb4e6, ART_MURAL ? 0.95 : 0.85); // v210 轮廓光加一档；v392 壁画光换石青（水月观音夜色托形之法），直射既降、托形略升
rim.position.set(-130, 55, -150);
scene.add(rim);

// v392 壁画光修正案（美术定案）：风格定「石窟两极」——夜境以榆林窟西夏《水月观音》石青夜色为体，
// 净土以莫高盛唐宝池经变为归；饱和度不降级、行「矿彩预算制」（大面低中饱和底＋小面高饱和点睛）。
// 落地六处（皆随 ART_MURAL 旗，?art=cg 回写实档对照）：直射 3.0→2.2、环境光 ×1.25（光比压平）、
// 影 intensity 0.55（淡墨）、rim 换石青 0x6f9ec9、环境反射 0.42→0.32、法线 ×0.65（晕染化，见 boot 段）＋桌面绢纹。
// 三禁增补：禁纯黑纯白（暗部下限靛褐）、禁镜面高光（金玉宝性走自发光不走反射）、禁写实投影浓影。
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
  hemi.color.set(p.hemiC); hemi.intensity = p.hemiI * (ART_MURAL ? 1.25 : 1); // v392 壁画档系数一处收口（表值不动，改光仍只改表）
  // v393 两质金（壁画光第三期）：娑婆金＝烛火金，极乐金＝琉璃金（偏白偏静，「彼土不假日月」）——
  // UI 金随场上移半阶，一处收口在光路总入口，CSS 只认 .pureTone 换 token
  document.documentElement.classList.toggle('pureTone', k === 'pureland');
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
  scene.environmentIntensity = ART_MURAL ? 0.32 : 0.42; // v210 写实CG：反射抬一档；v392 壁画档收一档——矿彩无镜面，宝性交给自发光阶梯
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
let dprScale = 1; // v393 恒为 1：自适应降档已撤（见主循环注），此量只留作调试钩子的读数与将来手动档的接口
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
  // v393 构图勘正（发起人：底轮偏大不协调）：风轮 176→152——仍最广（广无数之义在「最广」不在具体数），
  // 底盘外扩自 +44 收为 +20，山与轮的画面权重回衡；厚序 5:2.5:1（v329 经义勘正）不动
  windWheelM = new THREE.Mesh(new THREE.CylinderGeometry(152, 146, 20, 96),
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
    d.position.set(0, y, 88); // v393 随地狱锚点同迁赡部洲下（旧 8,26 在须弥山脚）
    netherScene.add(d);
  }
  // 八寒地狱（俱舍：八寒在八热之傍，亦赡部洲下）：冰青色叠层，位八热之西
  for (let i = 0; i < 8; i++) {
    const r = 12 - i * 0.9, y = -22 - i * 3.0;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.4, 32),
      clippable(new THREE.MeshStandardMaterial({
        color: 0x9fc4d8, emissive: 0x3a6a86, emissiveIntensity: 0.5 - i * 0.03, roughness: 0.6,
      })));
    d.position.set(-30, y, 82); // v393 仍居八热之西侧近旁（俱舍「八寒在八热之傍」），随八热同迁洲下
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
// v393 删旧挂：洲下诸狱与修罗宫曾有两套同坐标几何——v171「改挂 netherScene」时只加了新的，
// 旧的这一套仍挂在 saha 未删。两套共面既 z-fighting，又在「空间⇄心性」过渡里分家
// （saha 会缩至 0.18 并下沉 60，netherScene 不缩），故按 v171 本意删净，只留 netherScene 一套。

// 须弥山（四宝四面：东白银 · 南吠琉璃 · 西颇胝迦 · 北黄金）
{
  const face = (c        ) => stdMat(c, { map: mineralTexFine, roughness: 0.7, emissive: c, emissiveIntensity: 0.18, normalMap: rockN, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: rockA });
  // BoxGeometry 面序 [+x,-x,+y,-y,+z,-z]；场景中 +x=东，+z=南
  const sumeruMats = () => {
    const top = face(0xccbe9b); // 忉利金地（俱舍：山顶地平如掌，真金所成）
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
      stdMat(0xbfb69b, { emissive: 0x574f43, emissiveIntensity: 0.12, roughness: 0.65, metalness: 0.2 }), halls.length);
    const roofIM = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 0.9, 4),
      stdMat(0x85655e, { roughness: 0.78, emissive: 0x000000, emissiveIntensity: 0 }), halls.length);
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
      const r = new THREE.Mesh(new THREE.ConeGeometry(2, 1.1, 4), stdMat(0x916960, { roughness: 0.7, emissive: 0x40302d, emissiveIntensity: 0.12 }));
      r.position.set(x, 88.25, z); r.rotation.y = Math.PI / 4; saha.add(r);
    });
    // 四隅角楼
    ([[7, 7], [7, -7], [-7, 7], [-7, -7]]                           ).forEach(([x, z]) => {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 2.4), goldMat(0.3, { color: C.paleGold, emissive: 0x8a6a20 }));
      tw.position.set(x, 86.1, z); tw.castShadow = true; addEdges(tw, C.gold, 0.6); saha.add(tw);
      const tr = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.3, 4), stdMat(0x916960, { roughness: 0.7, emissive: 0x40302d, emissiveIntensity: 0.12 }));
      tr.position.set(x, 88.15, z); tr.rotation.y = Math.PI / 4; saha.add(tr);
    });
    // 殊胜殿（帝释所居，城中高广）：三层收分 + 攒尖金顶
    ([[5.6, 2.2, 85.8], [4.4, 2, 87.9], [3.2, 1.8, 89.8]]                                   ).forEach(([w, h, y]) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), goldMat(0.38, { roughness: 0.45 }));
      t.position.y = y; t.castShadow = true; addEdges(t, C.paleGold, 0.8); saha.add(t);
    });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2, 4), stdMat(0x916960, { roughness: 0.7, emissive: 0x40302d, emissiveIntensity: 0.35 }));
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
    const hr = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.6, 4), stdMat(0x916960, { roughness: 0.7, emissive: 0x40302d, emissiveIntensity: 0.12 }));
    hr.position.y = 46.1; hr.rotation.y = Math.PI / 4; hr.castShadow = true; g.add(hr);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), goldMat(0.8));
    tip.position.y = 47.1; g.add(tip);
    [-3, 3].forEach(o => {
      const fh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.8), goldMat(0.3, { color: C.paleGold, emissive: 0x8a6a20 }));
      fh.position.set(tang ? o : 0, 42.55, tang ? 0 : o); fh.castShadow = true; g.add(fh);
      const fr = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.9, 4), stdMat(0x916960, { roughness: 0.7, emissive: 0x40302d, emissiveIntensity: 0.12 }));
      fr.position.set(tang ? o : 0, 43.75, tang ? 0 : o); fr.rotation.y = Math.PI / 4; g.add(fr);
    });
  });
  // 山顶三十三天布列（俱舍卷十一：四角四峰金刚手依之；三十二天宫分列四方）——v203：峰换宝质、宫加顶合批
  ([[20, 20], [20, -20], [-20, 20], [-20, -20]]                           ).forEach(([x, z]) => {
    const pk = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6, 4), clippable(new THREE.MeshPhysicalMaterial({
      color: 0xc1d6ce, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25,
      normalMap: rockN, normalScale: new THREE.Vector2(0.8, 0.8), emissive: 0x475450, emissiveIntensity: 0.15,
    }))                              ); // v214：四峰同剪（原漏包，剖底时四粒白锚悬浮）
    pk.position.set(x, 87, z); pk.castShadow = true; saha.add(pk);
  });
  {
    const pts                          = [];
    for (let i = 0; i < 8; i++) { const t = -14 + i * 4; pts.push([t, 19], [t, -19], [19, t], [-19, t]); }
    const bIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.5, 1.7), goldMat(0.28, { color: C.paleGold, emissive: C.paleGold }), pts.length);
    const rIM = new THREE.InstancedMesh(new THREE.ConeGeometry(1.35, 1, 4), stdMat(0x916960, { roughness: 0.7, emissive: 0x40302d, emissiveIntensity: 0.12 }), pts.length);
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
      const pad = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 5.2), stdMat(0x587a71, { roughness: 0.8, emissive: 0x36473f, emissiveIntensity: 0.25 }));
      pad.position.set(x, 84.25, z); pad.receiveShadow = true; addEdges(pad, C.gold, 0.4); saha.add(pad);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 16), stdMat(0x546e78, { roughness: 0.25, emissive: 0x2b3538, emissiveIntensity: 0.45 }));
      pool.position.set(x, 84.55, z); saha.add(pool);
      ([[1.9, 1.9], [1.9, -1.9], [-1.9, 1.9], [-1.9, -1.9]]                           ).forEach(([dx, dz]) => shrubs.push([x + dx, z + dz]));
    });
    const sIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), stdMat(0x95bfa5, { roughness: 0.8, emissive: 0x44514a, emissiveIntensity: 0.28 }), shrubs.length);
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
      stdMat(0xe9ddb4, { map: mineralTexFine, roughness: 0.6, emissive: 0xbfb392, emissiveIntensity: 0.18 }));
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
      stdMat(0x6b5a4e, { roughness: 0.95 }));
    trunk.position.y = 2; trunk.castShadow = true; g.add(trunk);
    const leaf = (r        , y        , sy        ) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9),
        stdMat(0x95bfa5, { map: mineralTexFine, roughness: 0.8, emissive: 0x44514a, emissiveIntensity: 0.28 }));
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
// 倒立圣锥愈上愈广（俱舍）；无色四天改小半径匀旋直上（无色无方所、近轴表之）；
// 钝根阿那含侧置四空群旁（2026-08-12 坐标勘正：母本「此即四空界攝，無別處所」——非四空之上第五天，
// 故不得高居有顶之上；侧置齐四空中腰，表「寄四空处」而无别方所）；
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
  '鈍根阿那含': [12, 213, 0],
};

// 四圣金轨（倾斜大环，虚线 = 非方所）
const sageOrbit = dashedCircle(150, 0, C.gold);
sageOrbit.position.y = 127; sageOrbit.rotation.x = 0.1; saha.add(sageOrbit);

// （原西方经门牌楼已撤——极乐以星表之，见 gate 节点极乐星）

// ---------------- 极乐观照场 ----------------
// 净土横超门十三位 · 场内经义坐标（池中九品莲台三排、池畔边地疑城、空中三土竖观）
// 一品一高（2026-08-12 坐标勘正）：品内三生同高、以前后深度分上中下——
// 原上品中生独高 6.2 造成「上品上生反低于上品中生」的小倒挂，今归齐 6.0，与下品/中品同一排序语言
const SFP_PURE_LAYOUT                                           = {
  '淨土疑城': [-34, 3.2, 56],
  '下品下生': [-14, 3.6, 46], '下品中生': [0, 3.6, 48], '下品上生': [14, 3.6, 46],
  '中品下生': [-13, 4.8, 30], '中品中生': [0, 4.8, 27], '中品上生': [13, 4.8, 30],
  '上品下生': [-11, 6.0, 15], '上品中生': [0, 6.0, 11], '上品上生': [11, 6.0, 15],
  '方便有餘淨土': [0, 26, -4], '實報莊嚴淨土': [0, 41, -10], '常寂光淨土': [0, 57, -16],
};
{
  // 极乐远景：西方三圣海会图（v192 用户上传定案）；竖幅 3:4 比例跟图，四边已羽化融入场底色
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(174, 232),
    new THREE.MeshBasicMaterial({ map: loadTex('assets/bg-pureland-sanhui.webp'), fog: false, transparent: true, depthWrite: false })); // v392 转 WebP：2.45MB→399KB，肉眼无差（原 PNG 存 outputs/assets-orig）
  bg.position.set(-82, 96, -137); bg.rotation.y = 0.54; pureLand.add(bg); // 对正入场镜位：沿默认视线方向立在池后，面向入场相机
  (window       ).__pureBgDbg = () => { const m = bg.material                           ; const im      = m.map?.image; return { src: im && im.src ? String(im.src).split('/').pop() : null, w: im?.width || 0, h: im?.height || 0 }; }; // 自测钩子
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
    // 【环带透明度宪（2026-08-14 档二⑤成文）】星面装饰环带常态 α ≤ .35、选中/热态 ≤ .55。
    // 现存诸环审计皆在宪内（此环 .18、专场入口环 .2、禅环 .10）；后来者依此，勿越。
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
  // 界色底线已撤（2026-07-29 色彩立宪）：法界配色只在珠色与色点上出现，界色由星珠本体承担；
  // 标签胶囊统一走 .nlabel/.t1 金边档，层级用透明度与发光表达、不用边框色
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
  if (text) hit.userData.auxName = text; // v475 拾取球点中亦开辅标卡
  g.add(hit);
  g.position.copy(pos);
  parent.add(g);
  let label                        = null;
  if (text) {
    label = document.createElement('div');
    label.className = 'nlabel aux'; // v206 统一标签制度：辅标=T4 幽灵细字，视觉从属于节点标
    label.textContent = zh(text);
    labelLayer.appendChild(label);
    // v475 辅标有自己的卡：备了三问的开卡，未备的照旧跳所属处所
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      if (text && (SFP_AUX       )[text]) openAuxCard(text); else selectNode(nodeId);
    });
  }
  auxViews.push({ obj: g, hit, label, nodeId, rawName: text || '' }); // rawName＝zh() 前原名：族表按原名归族，繁体模式不失配
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
    const t = av.rawName || ''; // 用 zh() 前原名查族：textContent 在繁体模式已转「雙持山」等，族门会整族失效
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
  /* ── 转场节奏三档（2026-08-12 批）：页面级转场唯一取时处——快·开合 / 中·换页 / 慢·横幅，
     缓动统一柔出。微交互（hover 等）各留原值不入此表；行棋演出（fadeWhite 等）属演出层豁免。 ── */
  --t-fast:.18s;
  --t-mid:.24s;
  --t-slow:.36s;
  --ease-out:cubic-bezier(.22,.7,.35,1);
  /* ── 色彩立宪（2026-07-29 提案 §一.1）：全站色 token 唯一取色处；明度分层用透明度档，不再新造 hex。
     注：JS 内联着色暂留字面 hex（写经纸兜底按 [style*="#…"] 字面匹配，token 化须与兜底改造同批，见提案）；
     canvas/three.js 侧色值（轮面/星流/珠色）属数据层豁免，归 JS 常量不入此表。 ── */
  --gold:#d7aa45;        /* 结构线·强调·金字（#d8ac47 等近似值归此） */
  --gold-deep:#b0831c;   /* 主钮渐变深端 · 唯一保留处 */
  --gold-hi:#e8c766;     /* 辉光/hover 亮态（rgba 基座 232,199,102 与此同源） */
  --paper:#efe0b4;       /* 正文 */
  --note:#9d9170;        /* 次文/注脚（net.js 蓝灰族并入此） */
  --teal:#96e1d6;        /* 联机/提示专用 */
  --woe:#b05a42;         /* 恶趣语义深基（rgba 基座 176,90,66；#b0543f/#8b3f32 归此） */
  --woe-tx:#f0af9e;      /* 恶/警红字亮档 · 暗底可读的唯一红字色（#f08f7a/#e8b7a8/#d98873 等归此） */
  --ink-on-gold:#2a1e08; /* 金底上的墨字 · 主钮专用 */
  /* ── 石青·晓（2026-07-30 定稿 §七之十一）：社交与个人面浅色 token 族——
     大厅/共修动态/我的/茶寮/等候室面板（含聊天）走此族；星图世界与局中控制台仍暗夜。
     敦煌同窟颜料：石青作底、泥金作线与形（不作小字）、石绿作提示、土红作恶趣语义。 ── */
  --aq-bg:#e0e8ec;                 /* 页底 · 低饱和石青 */
  --aq-panel:#eff3f5;              /* 面板 · 浮于页底之上（层次靠明度差） */
  --aq-tx:#39322a;                 /* 正文沉香暖墨 11.3:1（2026-07-30 用户定案「青纸墨书泥金题」：字与泥金同暖族，青底作衬） */
  --aq-title:#4a3d28;              /* 题字 · 沉香深 */
  --aq-strong:#8a6414;             /* 泥金深 · 数字/强调（4.8:1，只用于加粗或大字） */
  --aq-note:#5f574a;               /* 次文/注脚 · 暖灰墨 6.3:1 */
  --aq-gold:#a8811f;               /* 泥金 · 线/形/图标专用，不作小字（3.2:1） */
  --aq-goldline:rgba(150,112,32,.46);  /* 金描边 */
  --aq-goldwash:rgba(176,131,28,.13);  /* 金洗底 · 主钮/选中态 */
  --aq-line:rgba(112,96,64,.26);   /* 暖墨结构线（随墨书同族） */
  --aq-wash:rgba(57,50,42,.05);    /* 暖墨洗底 · 卡/气泡 */
  --aq-wash2:rgba(57,50,42,.08);   /* 暖墨洗底 · 深一档 */
  --aq-green:#2f6a5e;              /* 石绿 · 联机/提示 */
  --aq-woe:#8b4a3a;                /* 土红 · 恶趣/警示语义 */
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
  --ck-yuan-rule:var(--gold);             /* 原文金线 */
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
html.paperCards .panel .citeItem .txt,
html.paperCards .panel details.citeD .txt,html.paperCards .panel .profRow .pv,
html.paperCards .panel .smStat,
html.paperCards .panel #sfpMsg,html.paperCards .panel #vWhy,
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
/* 青纸浅主题（2026-07-30 用户定案「青纸墨书泥金题」，即日起为默认卡面）：
   石青纸底＋沉香墨书＋泥金顶签——与大厅/我的（--aq-* 石青·晓）同一窟壁画语言；
   原「写经纸」暖麻纸调整体转青纸，白话石绿不变、警示转土红族；暗夜仍可在设置切回。 */
html.paperCards{
  --ck-panel:linear-gradient(170deg,#f2f6f7 0%,#e9eff1 58%,#e0e8ec 100%); /* 青纸渐变，纸有厚度 */
  --ck-border:rgba(150,112,32,.42);   /* 泥金发丝线（题以金，线亦金） */
  --ck-scrim:rgba(18,14,28,.5);
  --ck-title:#4a3d28;                 /* 题字 · 沉香深 */
  --ck-meta:#8a6414;                  /* 顶签泥金深（「泥金题」落在顶签与眉行） */
  --ck-plain:#332d23;                 /* 白话主体 · 沉香正墨 · 最高对比 */
  --ck-read:#574f3f;                  /* 解读 · 暖褐灰 */
  --ck-note:#6c644f;                  /* 注脚 · 加深防失读 */
  --ck-link:#8b4a3a;                  /* 点读链接 · 土红（恶趣/警示同族） */
  --ck-line:rgba(112,96,64,.24);
  --ck-yuan:#3a3220;                  /* 原文字 · 沉香墨（深） */
  --ck-yuan-bg:#dde5e9;               /* 原文凹槽 · 青纸深一档，靠底色分层不靠色 */
  --ck-yuan-rule:#9c7a26;             /* 原文泥金线 */
  --ck-bai:#2f6a52;                   /* 白话对照 · 深松绿 */
  --ck-btn-bg:#e9eef0;
  --ck-btn-br:rgba(150,112,32,.4);
  --ck-btn-tx:#39322a;
  --ck-cbU:#ece3cb;                   /* 我方气泡 · 金洗暖点（冷底暖点即生机） */
  --ck-cbU-br:rgba(150,112,32,.4);
  --ck-cbU-tx:#332d23;
  --ck-cbA:#f4f7f8;
  --ck-cbA-br:rgba(47,106,82,.2);
  --ck-cbA-tx:#4a4437;
}
html.bigfont{--fs-xs:12.5px;--fs-sm:14px;--fs-md:16px;--fs-lg:18px;--fs-xl:21px;--fs-display:24px}
/* 展示级题字（面板标题/落位大字/门介/途经字幕）：得意黑未就绪时回退宋体系，气质不塌 */
.panel h2,#posReveal,#doorIntro b,#transitCap b{font-family:var(--f-display)}
#labels{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5}
.nlabel{position:absolute;left:0;top:0;transform:translate(-50%,-140%);pointer-events:auto;cursor:pointer; /* v392 定位改走 translate 属性（合成器），left/top 归零作原点 */
  font:var(--fs-sm)/1.4 var(--f-ui);color:rgba(239,224,180,.92);
  background:rgba(23,20,38,.72);border:1px solid rgba(215,170,69,.4);border-radius:3px;padding:2px 7px;
  white-space:nowrap;letter-spacing:1px}
.nlabel.t1{font-size:var(--fs-md);color:var(--paper);border-color:rgba(215,170,69,.7)}
/* v219 标签降噪：①淡入代硬闪（display 切回时动画自重起）②远景 T2 褪胶囊为幽灵细字（300–420 段） */
.nlabel{animation:lblIn .18s ease-out}
.nlabel.dlab{text-align:center;line-height:1.32;padding:2px 5px;font-size:var(--fs-xs);transform:translate(-50%,0)} /* v328 微缩：同排中珠签不再被避让表杀 */
.nlabel.dlab .dcm{display:block;font-size:8.5px;letter-spacing:2px;text-indent:2px;color:#c9bc8f;opacity:.92}
.nlabel.dlab .dcm .ne{font-style:normal;color:var(--woe-tx)} /* v328 恶面字赭红：与判词卡恶↓同带 */
.nlabel.dlab.dl1{white-space:nowrap}
.nlabel.dlab.dl1 .dcm{display:inline;margin-right:5px;text-indent:0;letter-spacing:1px;font-size:9px} /* v328 横屏单行：组合字内联名前 */
.nlabel.dlab.cur{border-color:var(--gold);color:#f4e6b8;box-shadow:0 0 12px rgba(215,170,69,.35)}
.nlabel.dlabC{text-align:center;background:transparent;border-color:transparent;letter-spacing:4px;text-indent:4px}
.nlabel.dlabC .dcm{display:block;font-size:10px;letter-spacing:2px;text-indent:2px;color:var(--note)}
@keyframes lblIn{from{opacity:0}}
.nlabel.far{background:transparent;border-color:transparent;font-size:var(--fs-xs);opacity:.85;text-shadow:0 0 8px rgba(10,8,20,.95),0 1px 3px #000}
/* v206 标签阶梯制度：T1 法界主星 .t1 ＞ T2 处所节点 .nlabel ＞ T3 细分天层 .drl ＞ T4 器世间辅标 .aux（永远让位于节点标） */
.nlabel.aux{font-size:var(--fs-xs);color:rgba(239,224,180,.8);background:transparent;border-color:transparent;padding:5px 8px;/* v207 触控热区加大，透明底不改观感 */
  letter-spacing:2px;text-shadow:0 0 8px rgba(10,8,20,.95),0 1px 3px #000;opacity:.92}
.nlabel.read{opacity:.78}
.nlabel.sel{background:rgba(176,90,66,.85);border-color:var(--gold);color:#fff}
.ui{position:absolute;font-family:'SmileySans',-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--paper);z-index:10}
.panel{background:var(--ck-panel);border:1px solid var(--ck-border);border-radius:14px;backdrop-filter:blur(8px);color:var(--ck-plain);
  box-shadow:inset 0 1px 0 rgba(255,235,180,.10),0 18px 50px -22px rgba(0,0,0,.7);
  transition:background .45s,border-color .45s,color .45s}
html.paperCards .panel{box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 18px 48px -22px rgba(40,28,10,.5)}
/* 卡内未指定颜色的正文（如 SFP_META.dice）默认走主题墨色，纸主题下不再继承 .ui 浅色而失读 */
.overlay .body,.overlay .panel{color:var(--ck-plain)}
/* 题屏＝#boot（2026-08-11 四改：封面与开机屏并入题屏，壁画随屏向取立轴/横卷；
   不透山的自足设计底，样式主体连同两屏向版式在 index.html 内联）。
   此处只持就绪态交互区的主题化——在场句、细字 hover、✕ hover（依赖主包变量或悬停语言）。
   主钮样式已归内联自足（第一毫秒即金钮），此处不再重复定义。 */
/* v393 在场一行改静示（发起人定案）：只报「多少人在线」，不点、不跳转、不带去处箭头——
   知道有人同在即可。位次已移至副题下（见 index.html 布局注）。 */
/* 这一行落在殿脊斗栱一带（画最繁处），与副题同境——故用与副题同一套三层影（近影托边·中影分离·远影压底）；
   字色取落款档（较副题暗一阶）：读得清，又不与题名副题争先后 */
#bootPresence{margin-top:13px;align-items:center;gap:7px;
  color:#e9dcba;font-size:var(--fs-xs);letter-spacing:2px;
  text-shadow:0 1px 3px rgba(3,20,24,1),0 2px 14px rgba(3,20,24,.95),0 0 30px rgba(3,20,24,.75)}
#bootPresence i{width:6px;height:6px;border-radius:50%;background:var(--teal);
  box-shadow:0 0 7px var(--teal);animation:bootLive 2.4s ease-in-out infinite}
@keyframes bootLive{0%,100%{opacity:.55}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){#bootPresence i{animation:none}}
#bootX:hover{color:#f0dfa8;border-color:rgba(232,199,102,.62)}
/* v196 题屏极简：次级操作收为细字行 */
.tlink{color:var(--note);font-size:var(--fs-sm);letter-spacing:2px;cursor:pointer;padding:8px 4px;user-select:none;-webkit-user-select:none;transition:color .2s}
.tlink:hover,.tlink:active{color:var(--paper)}
/* 移动端系统点按高亮关（2026-08-12 用户报「点一下蓝框一闪」）：安卓/iOS WebView 对可点元素
   自带半透明高亮框；属性可继承，根上一处即全站——按压反馈已由 :active 轻缩承担，
   键盘用户的 :focus-visible 金圈不受此影响。 */
html{-webkit-tap-highlight-color:transparent}
button.gbtn{background:rgba(215,170,69,.08);border:1px solid rgba(215,170,69,.34);color:var(--paper);border-radius:9px;
  padding:9px 14px;font-size:var(--fs-md);font-family:inherit;cursor:pointer;letter-spacing:1px;min-height:40px}
button.gbtn:active{background:rgba(215,170,69,.35)}
button.gbtn.primary{background:rgba(215,170,69,.32);color:#fff}
/* 卡片内按钮跟随卡片主题（控制台/掷轮钮不在卡内，仍用暗底基础样式） */
.overlay .gbtn,.panel .gbtn{background:var(--ck-btn-bg);border-color:var(--ck-btn-br);color:var(--ck-btn-tx)}
.overlay .gbtn.primary,.panel .gbtn.primary{background:linear-gradient(180deg,var(--gold),var(--gold-deep));color:var(--ink-on-gold);border-color:transparent;font-weight:600}
#topbar{top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:8px 12px;
  background:linear-gradient(rgba(22,18,38,.85),transparent);pointer-events:none}
#topbar>*{pointer-events:auto}
#title{font-size:var(--fs-xl);letter-spacing:4px;color:#f0dfa8;font-weight:600;text-shadow:0 1px 6px #000}
/* 右上角两枚去处（大厅｜我的）：与题字分踞两角，安静地待着，不与中央星图争。
   position:relative 是必须的——.ui 基类是绝对定位，不还原就会掉出顶栏的 flex 流（同 #backBtn 之例）；
   取 relative 而非 static，是给窄屏 ::after 热区当定位基。 */
#hallBtn,#mineBtn{position:relative;flex:none;display:inline-flex;align-items:center;gap:6px;
  min-height:36px;padding:7px 14px;border-radius:18px;letter-spacing:2px;
  font-size:var(--fs-sm);color:#cbbb8d;border:1px solid rgba(215,170,69,.34);background:rgba(20,17,34,.62);
  backdrop-filter:blur(6px);cursor:pointer}
#hallBtn .btTx,#mineBtn .btTx{margin-right:-2px}   /* 抵掉字尾多出的一格字距，图标与字看着才等距 */
#hallBtn{margin-left:auto}
#mineBtn{margin-left:8px}
#hallBtn:hover,#hallBtn:focus-visible,#mineBtn:hover,#mineBtn:focus-visible{color:#f0dfa8;border-color:rgba(232,199,102,.62);background:rgba(30,25,50,.78)}
/* 浮层期两钮压暗禁点（视觉与行为一致）：disabled 同时断 Tab 可达，见 topNavLock */
.ovOn #hallBtn,.ovOn #mineBtn{opacity:.25;pointer-events:none}
/* 窄屏收起字，只留形：两枚去处收成等宽圆钮，把顶栏让回给题字 */
@media (max-width:380px){
  #hallBtn,#mineBtn{padding:0;width:36px;justify-content:center}
  #hallBtn::after,#mineBtn::after{content:'';position:absolute;inset:-4px} /* 视觉 36px，热区补足 44px 触控惯例 */
  #hallBtn .btTx,#mineBtn .btTx{display:none}
  #hallBtn .ico,#mineBtn .ico{width:1.35em;height:1.35em}
  #title{letter-spacing:2px}
}
/* 罗盘已撤（极简屏定案）：元素、样式与 updateCompass 一并清除——若复用须重算与 #topbar 右上两钮的位置关系 */
#freeDock{bottom:calc(18px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center}
#joy{left:calc(14px + env(safe-area-inset-left));bottom:calc(104px + env(safe-area-inset-bottom));width:108px;height:108px;border-radius:50%;display:none;z-index:12;
  background:rgba(26,22,44,.45);border:1px solid rgba(215,170,69,.45);touch-action:none}
#joy.show{display:block}
#joyKnob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
  background:rgba(215,170,69,.5);border:1px solid var(--gold);box-shadow:0 0 10px rgba(215,170,69,.4);pointer-events:none}
#secWrap{left:14px;top:50%;transform:translateY(-50%);width:34px;height:42vh;min-height:180px;display:flex;flex-direction:column;align-items:center}
#secTrack{flex:1;width:5px;background:linear-gradient(to top,rgba(176,90,66,.34),rgba(215,170,69,.2) 45%,rgba(215,170,69,.16));border-radius:3px;position:relative;touch-action:none;cursor:pointer}
#secHandle{position:absolute;left:50%;transform:translate(-50%,50%);bottom:0;width:17px;height:17px;border-radius:50%;
  background:rgba(215,170,69,.5);border:1.5px solid rgba(244,230,184,.85);box-shadow:0 0 6px rgba(215,170,69,.35)}
#secHandle::before{content:'';position:absolute;inset:-14px;border-radius:50%}
#secZero{position:absolute;left:-6px;right:-6px;height:1px;background:rgba(176,90,66,.6)}
#secWrap{opacity:.72;transition:opacity .25s}
#secWrap:hover,#secWrap:active{opacity:1}
#secLabel{font-size:var(--fs-xs);margin-top:6px;color:#cbbb8d;writing-mode:vertical-rl;letter-spacing:2px}
#cardHead{display:flex;align-items:center;gap:10px;padding:0 42px 8px 0}
#cardKicker{font-size:var(--fs-xs);color:var(--ck-meta);letter-spacing:3px;margin-bottom:3px;text-transform:uppercase}
#cardName{font-size:var(--fs-xl);letter-spacing:2px;color:#f4e6b8}
#cardSub{font-size:var(--fs-sm);color:#cbbb8d;margin-top:2px}
#cardTags{display:flex;gap:6px;padding:0 0 8px;flex-wrap:wrap}
#cardTags:empty{display:none}   /* 无类标者不留那 8px 的空档（位卡／辅标卡撤类标后即此形） */
.tag{font-size:var(--fs-xs);padding:2px 8px;border-radius:9px;border:1px solid rgba(215,170,69,.5);color:#e9dcae}
.tag.warn{border-color:rgba(176,90,66,.85);color:var(--woe-tx)}
.tag.ns{border-color:rgba(157,145,112,.6);color:var(--note)}
/* 收藏由正文之后的按钮改为词头标签行的一枚标签（2026-08-08 发起人点单）：
   ·「收藏」是状态不是动作——它与「群组」「界」同属这一处所的属别，合该并列在词头一眼看见；
   · 留在 #cardBtns 里，读者要读完整卡、跨过正文才够得着，而多数卡按钮区仅此一枚，
     为它单开一行殊不值当。移走后 #cardBtns:empty 自动隐藏，只余「进入色界诸天」等真动作按钮。
   仍用 <button> 承之（标签只是外观）：键盘可达、读屏可辨，故须把 button 的默认底色字体一并抹平。 */
.tagFav{background:none;font-family:inherit;line-height:inherit;margin:0;cursor:pointer}
.tagFav.on{background:rgba(215,170,69,.22);border-color:rgba(215,170,69,.9);color:#f3e6bb}
#cardBody{font-size:var(--fs-md);line-height:1.85}
#cardBody details.sec,.overlay .body details.sec{border-top:1px solid var(--ck-line);padding:2px 0;margin-top:6px}
#cardBody details.sec summary,.overlay .body details.sec summary{cursor:pointer;font-size:var(--fs-sm);color:var(--ck-meta);letter-spacing:2px;padding:9px 0;
  list-style:none;display:flex;justify-content:space-between;align-items:center;user-select:none}
#cardBody details.sec summary::-webkit-details-marker,.overlay .body details.sec summary::-webkit-details-marker{display:none}
#cardBody details.sec summary::after,.overlay .body details.sec summary::after{content:'▾';color:var(--ck-note);transition:transform .2s}
#cardBody details.sec[open] summary::after,.overlay .body details.sec[open] summary::after{transform:rotate(180deg)}
.sfpChip{display:inline-block;appearance:none;-webkit-appearance:none;font-family:inherit;font-size:var(--fs-sm);padding:5px 10px;margin:2px;
  border:1px solid rgba(215,170,69,.45);border-radius:10px;color:var(--paper);background:rgba(215,170,69,.12);cursor:pointer;line-height:1.5}
.sfpChip:active{background:rgba(215,170,69,.32)}
.sfpChip.cur{background:var(--woe);color:#fff;border-color:var(--gold);box-shadow:0 0 8px rgba(215,170,69,.45)}
.sfpChip.sel{border-color:var(--gold-hi);background:rgba(215,170,69,.3)}
.inlineNote{display:none;margin:8px 2px 2px;padding:8px 10px;border:1px dashed rgba(215,170,69,.4);border-radius:8px}
.causeBox{margin:8px 0;padding:8px 10px;background:rgba(176,90,66,.15);border-left:2px solid var(--woe);border-radius:0 8px 8px 0}
.causeBox .ck{font-size:var(--fs-xs);color:var(--woe-tx);letter-spacing:2px;margin-bottom:3px}
.causeBox .cv{color:#eadfb5;font-size:var(--fs-md);line-height:1.7}
.causeBox .cs{font-size:var(--fs-xs);color:var(--note);margin-top:4px}
#cardBody .one{color:var(--paper)}
.coordBox{margin:8px 0;padding:8px 10px;border:1px dashed rgba(215,170,69,.45);border-radius:8px;font-size:var(--fs-sm);color:#dccf9f}
/* v363 位卡地理坐标行：方位＋高下依经直陈；.gk 类型小标（依经有处/非方所摄） */
.geoLn{margin:7px 0 0;padding:6px 9px;font-size:var(--fs-sm);line-height:1.55;display:flex;flex-wrap:wrap;gap:5px;align-items:baseline}
.geoLn b{font-weight:600;color:var(--gold);letter-spacing:1px;flex:0 0 auto}
.geoLn .gk{font-style:normal;font-size:var(--fs-xs);padding:1px 5px;border:1px solid rgba(215,170,69,.4);border-radius:5px;color:#c3ad74;flex:0 0 auto}
.geoLn .gk.ns{border-color:rgba(150,160,175,.4);color:#98a2b0}
.geoLn span{color:#cbbb8d;flex:1 1 160px;min-width:0}
/* v365 极简：多位锚芯片区限高内滚 */
.chipScroll{max-height:168px;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:2px}
/* v355 谱文页位名目录：单行横滑（换行铺开时窄屏占 41% 视野，把正文挤出去） */
/* .cnToc／.cnT（门卡谱文段的位名快跳条）随第三段撤于 2026-08-11——
   卷内跳位今归阅读器的目录抽屉（.rdIdxPop），不再有段内快跳。 */
/* v348 解读卡极简：去向条＋标签短行（长段白话退役），色阶仍从三层一序 */
.rdRoute{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:2px 0 9px}
.rdRoute .p{font-size:var(--fs-lg);color:#f4e6b8;letter-spacing:1px;cursor:pointer;border-bottom:1px dotted rgba(215,170,69,.45)}
.rdRoute .ar{font-size:var(--fs-sm);letter-spacing:2px;color:var(--gold);white-space:nowrap}
.rdRoute .ar.up{color:var(--gold-hi)}.rdRoute .ar.down{color:var(--woe-tx)}.rdRoute .ar.pure{color:var(--paper)}.rdRoute .ar.stay{color:var(--note)}
.rdRoute .p .ag{font-weight:400;font-size:var(--fs-xs);color:var(--note);margin-left:3px}
/* v351/v454 轮相表法小字：去向条之下一行细字，说明这一掷的六字各表何义；
   含「佛」字者另点明第二重表法（阿彌陀有漏善·佛无漏善）——「那佛／謨佛能行、阿佛能升」的关窍全在此。 */
.rdGlyph{font-size:var(--fs-xs);color:#9d9170;letter-spacing:1px;padding:0 0 8px}
/* 层署小字：缀在缘由行末，说明这一句出自哪一层（所指之位／本项目理解层），不与判语抢字号 */
.rdSub{display:block;margin-top:3px;font-size:var(--fs-xs);color:var(--note);opacity:.72;line-height:1.6}
.rdRow{display:flex;gap:10px;padding:8px 0;border-top:1px solid rgba(215,170,69,.13)}
.rdRow .k{flex:0 0 2.6em;font-size:var(--fs-xs);color:var(--gold);letter-spacing:1px;padding-top:3px}
.rdRow .v{flex:1;min-width:0;font-size:var(--fs-md);color:#dccf9f;line-height:1.78}
.rdRow.m .v{color:#f7eed6}
.rdRow .v i{font-style:normal;color:var(--note);font-size:var(--fs-xs);margin-left:6px}
.rdGlyph{font-size:var(--fs-xs);color:var(--note);letter-spacing:1px;padding:0 0 8px}
/* 心相量表已撤（v365：数值系自撰非经论所载），样式一并清除 */
#cardBtns{display:flex;gap:8px;padding:10px 0 0;flex-wrap:wrap;flex:0 0 auto} /* 移到正文之后，故上留白下不留 */
#cardBtns:empty{display:none}
#cardBtns .gbtn{padding:7px 12px;font-size:var(--fs-md);min-height:36px}
.citeItem{margin:8px 0;padding:8px 10px;background:rgba(215,170,69,.07);border-left:2px solid var(--gold);border-radius:0 8px 8px 0}
.citeItem .src{font-size:var(--fs-sm);color:var(--gold)}
.citeItem .kind{font-size:var(--fs-xs);color:var(--note);margin-left:6px;border:1px solid rgba(157,145,112,.5);padding:0 5px;border-radius:6px}
.citeItem .txt{margin-top:3px;color:#dccf9f}
/* 原文引文块：字族随全站统一，靠略大字号、宽行距与金线与白话概述拉开层级 */
.citeItem.q .txt,details.citeD.q .txt{font-size:1.07em;line-height:1.9;color:#efe3bb}
/* 出处条目默认只显来源行，点开展开引文 */
#workCards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.workCard{display:flex;flex-direction:column;gap:3px;padding:10px 12px;cursor:pointer;border:1px solid rgba(215,170,69,.4);border-radius:10px;background:rgba(215,170,69,.07)}
.workCard:active{background:rgba(215,170,69,.2)}
.workCard b{font-size:var(--fs-md);color:#f0dfa8;font-weight:600;line-height:1.4}
.workCard span{font-size:var(--fs-xs);color:var(--note)}
@media (max-width:520px){#workCards{grid-template-columns:1fr}}
details.citeD{margin:6px 0;padding:0 10px;background:rgba(215,170,69,.07);border-left:2px solid var(--gold);border-radius:0 8px 8px 0}
details.citeD summary{list-style:none;cursor:pointer;padding:9px 0;display:flex;align-items:center;gap:5px;flex-wrap:wrap;user-select:none}
details.citeD summary::-webkit-details-marker{display:none}
details.citeD summary::after{content:'▾';margin-left:auto;color:var(--note);font-size:var(--fs-xs)}
details.citeD[open] summary::after{content:'▴'}
details.citeD .txt{margin:0;padding:0 0 10px;color:#dccf9f}
.citeD .src{font-size:var(--fs-sm);color:var(--gold)}
.citeD .kind{font-size:var(--fs-xs);color:var(--note);border:1px solid rgba(157,145,112,.5);padding:0 5px;border-radius:6px}
/* 譜曰分句：一句一行，左侧细金线如谱刻本（字族随全站统一） */
/* v228 卡片三层一序：cPlain 一句白话（这是什么）→ cRead AI 解读（为什么）→ verse 谱曰原文（依据，点开）
   v229 体例三件：cMeta 金字顶签 / cNote 灰字注脚 / lnk 点读虚线——全卡统一，字级归五档 */
.cPlain{font-size:var(--fs-md);color:var(--ck-plain);line-height:1.85;margin-top:9px;font-weight:500}
.cMeta{font-size:var(--fs-sm);color:var(--ck-meta);letter-spacing:2px;line-height:1.6;font-weight:500}
.cNote{font-size:var(--fs-xs);color:var(--ck-note);margin-top:9px;line-height:1.65}
.lnk{color:var(--ck-link);border-bottom:1px dotted var(--ck-note);cursor:pointer}
.cRead{font-size:var(--fs-sm);color:var(--ck-read);line-height:1.78;margin-top:7px}
.cRead+.cRead{margin-top:5px}
/* ══ 卡制总纲 v2（移植线上 V106 v474，2026-08-07）：形状唯一 ══
   一屏：卡头小字（元数据）→ 来处→此位→去处 → 三问 → 读原文 → 底部出处（纯折叠）。
   层级封到两层：卡（此处）→ 深读页（逐字原文·文白对照）；卡内折叠只许并列不许嵌套。
   可点视觉只一种（金色虚下划线＝点开有释义），另加一枚「读原文」与一处「出处」折叠头。
   元数据（门/法界/位次）一律收进卡头，正文只讲义理——旧制把「属第十四门·第208位·所在法界」
   夹在义理句中间，读者要先跨过一串标签才见正文，这是「读不懂」的第一道坎。
   ── 与线上的四处更名（本地同名类已被占用，语义不同，故加前缀；日后再复刻照此对回）──
     线上 .cMeta（卡头元数据） → 本地 .cbMeta   （本地 .cMeta 是顶签金小字，14 处在用）
     线上 .cRead（读原文钮）   → 本地 .cbRead   （本地 .cRead 是解读正文段，35 处在用）
     线上 .cSrc （出处折叠）   → 本地 .cbSrc    （本地 .cSrc 是出处小字 span）
     线上 .rdCanon（深读页原文）→ 本地 .rpCanon （本地 .rdCanon 是判词卡谱曰段）
   色与字级一律走本地 token（色彩立宪／五级字表），不新造 hex——泥金与暗夜两档才都成立。 */
.cbMeta{font-size:var(--fs-xs);color:var(--ck-note);letter-spacing:1.5px;padding-bottom:5px}
.cChain{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:var(--fs-sm);color:var(--ck-note);padding:2px 0 7px}
.cChain b{color:var(--ck-title);font-weight:600}
.cChain i{color:var(--ck-meta);font-style:normal;opacity:.8}
/* ── 卡制 v3：正文段（白态／文态）· 文白切换 · 关联段 ────────────────────────
   旧制 .cQ 三问栏（左 5.9em 固定问名 ＋ 右正文）已撤：问名占宽、槽位固定、无料也得填。
   今正文满宽直陈，明细行仍走 .nRow。 */
.cSec{padding:2px 0}
.cSectionK{font-size:var(--fs-xs);color:var(--ck-meta);letter-spacing:2px;margin:1px 0 7px;padding-bottom:6px;border-bottom:1px solid var(--ck-line)}
.cSec .qp{color:var(--ck-plain);font-size:var(--fs-md);line-height:1.9;margin-bottom:7px}
/* 如实告白（自撰导语／白话待补一类）：与正文分明但不喧宾——它是实话，不是警告 */
.cSec .cGap{font-size:var(--fs-xs);color:var(--ck-note);line-height:1.75;margin-bottom:9px;
  padding:6px 10px;border-radius:8px;background:rgba(239,224,180,.045);border:1px solid rgba(215,170,69,.16)}
.cSec .qp:last-of-type{margin-bottom:2px}
.cCanon{padding:7px 0;border-top:1px dashed rgba(215,170,69,.18)}
.cCanon:first-child{border-top:none;padding-top:1px}
.cCanon .ctag{font-size:var(--fs-xs);color:var(--ck-meta);letter-spacing:2px;margin-bottom:3px}
/* 他经补注段：谱主说得简处从别经补足者，缀于明细行之后。左侧一道细金线与谱主的话分界，
   段题即所引书名——不冒「谱曰」，也不与位注并排（2026-08-08 发起人定）。 */
.cExt{margin-top:9px;padding:6px 0 2px 10px;border-left:2px solid rgba(215,170,69,.34)}
.cExt .ctag{font-size:var(--fs-xs);color:var(--ck-meta);letter-spacing:1px;margin-bottom:3px}
.cExt .v{font-size:var(--fs-sm);line-height:1.85;color:var(--ck-plain)}
.cCanon .ctext{color:var(--ck-yuan);font-size:var(--fs-md);line-height:2;font-family:var(--f-display)}
/* 原文页的出处行（2026-08-08 发起人指出「出处抢镜」）。病根是漏配：.cs 此前只在
   .causeBox 与 .nRow 下定过样式，.cCanon 段没有，于是出处继承正文的 14px 与卡面字色，
   与经文正文一般大小、一般明暗——注脚喧宾夺主。今归入全站注脚既定语汇（同 .cSrc）：
   · 11px、注脚色，与同段的 .ctag 齐平，退到经文之后；
   · 字族改取 --f-ui 而不随经文用 --f-display——出处是界面信息不是经文，
     字族一分，「哪句是经、哪行是注」不必靠字号也认得出；CBETA 行号一类拉丁数字亦更清晰。 */
.cCanon .cs{font-family:var(--f-ui);font-size:var(--fs-xs);color:var(--ck-note);line-height:1.7;margin-top:5px;letter-spacing:.2px}
/* ── 本掷段（2026-08-12 三卡归一）：从判词卡／去向条位名／行迹线进来时才出 ──────
   置于文白开关之下、位义之上——先答「我为什么来到这一位」，再答「这一位是什么」。
   不用框盒：左一道方向色细线承担分界（同 .cExt 之法），善恶由线色与字色分，不另加边。
   段末不留出处署名的空槽——白话态署来源层，原文态署「谱曰／承前 · 本掷」＋出发位出处。 */
/* .cToss* 一族已随本掷段撤于 2026-08-12（位卡只答「这一位是什么」，本掷之判归判词卡） */
/* 文白开关：两枚小字并列、当前态点亮，与「简 · 繁」同一语汇（将来可并排） */
.cSwapBar{display:flex;align-items:center;gap:7px;padding:1px 0 7px}
.cSwap{font-size:var(--fs-xs);color:var(--ck-note);letter-spacing:2px;cursor:pointer;padding:3px 1px;
  border-bottom:1px solid transparent;-webkit-tap-highlight-color:transparent}
.cSwap.on{color:var(--ck-title);border-bottom-color:rgba(215,170,69,.7)}
.cSwap:not(.on):active{color:var(--ck-plain)}
.cSwapBar>i{font-style:normal;font-size:var(--fs-xs);color:var(--ck-meta);opacity:.55}
/* 关联段：三项以内直陈（.cRelOpen），多则折叠（.cRel） */
.cRel,.cRelOpen{border-top:1px solid var(--ck-line);margin-top:8px;padding-top:2px}
.cRel>summary{cursor:pointer;font-size:var(--fs-xs);color:var(--ck-note);letter-spacing:2px;padding:8px 0;list-style:none}
.cRel>summary::-webkit-details-marker{display:none}
.cRel>summary::after{content:' ▾';color:var(--ck-meta)}
.cRel[open]>summary::after{content:' ▴'}
.cRelOpen>.qk{font-size:var(--fs-xs);color:var(--ck-meta);letter-spacing:2px;padding:6px 0 3px}
.cMore{margin-top:2px}
.cMore>summary{cursor:pointer;font-size:var(--fs-xs);color:var(--ck-note);letter-spacing:1px;list-style:none;padding:3px 0}
.cMore>summary::-webkit-details-marker{display:none}
.cMore>summary::after{content:' ▾';color:var(--ck-meta)}
.cMore[open]>summary::after{content:' ▴'}
/* .cQ／.qk 固定问名栏、.cReadBar／.cbRead 读原文钮、.cbSrc 出处抽屉、
   .rdPage 全套深读页样式，随卡制 v3 一并撤——问名栏已无问、原文已在卡上、
   出处已随原文段走、深读页整层已归卡内切换。 */
/* 明细行：正文段内的键值明细与出处小字，全站同一节奏（v471 两签归一之理） */
.nRow{display:flex;gap:9px;padding:6px 0;border-top:1px solid rgba(215,170,69,.10)}
.nRow:first-child{border-top:none;padding-top:1px}
.nRow>.k{flex:0 0 3.6em;font-size:var(--fs-xs);color:var(--ck-meta);letter-spacing:1px;text-align:right;padding-top:2px}
.nRow>.b{flex:1;min-width:0}
.nRow .v{color:var(--ck-plain);font-size:var(--fs-sm);line-height:1.8}
.nRow .cs{font-size:var(--fs-xs);color:var(--ck-note);margin-top:2px}
.nRow .dtxt{color:var(--ck-read);margin-bottom:2px}
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
.profRow .pk{flex:0 0 4.6em;color:var(--gold);font-size:var(--fs-sm);letter-spacing:1px;padding-top:1px}
.profRow .pv{flex:1;color:#dccf9f;font-size:var(--fs-md);line-height:1.65}
.profRow .psrc{margin-left:6px;font-size:var(--fs-xs);color:var(--note);border:1px solid rgba(157,145,112,.5);padding:0 5px;border-radius:6px;white-space:nowrap}
.overlay{inset:0;background:var(--ck-scrim);display:flex;align-items:center;justify-content:center;z-index:30;animation:ovIn var(--t-fast) var(--ease-out)}
/* 浮层退场与入场同一口呼吸（2026-08-12 批）：closeOverlay 先挂 .bye 淡出再摘——
   暗星图与浅大厅两域切换从硬切改为交叠淡化，其余浮层关闭的生硬感一并消。 */
.overlay.bye{opacity:0;transition:opacity var(--t-fast) var(--ease-out);pointer-events:none}
@media (prefers-reduced-motion:reduce){.overlay.bye{transition:none}}
/* 按压反馈（2026-08-12 批）：触屏无 hover，按下轻缩即「按到了」的肉感——全站按钮统一。
   :where 零特异性：已自带 transition/transform 的按钮（.pzMode 等）照旧压过此默认。 */
:where(button:not(:disabled)){transition-property:transform;transition-duration:.12s}
button:not(:disabled):active{transform:scale(.97)}
@media (prefers-reduced-motion:reduce){button:not(:disabled):active{transform:none}}
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
  .overlay.ovb .panel{width:100vw;max-width:100vw;height:auto;box-sizing:border-box;
    border-radius:18px 18px 0 0;border:none;border-top:1px solid rgba(231,214,166,.2);
    padding:8px 16px calc(16px + env(safe-area-inset-bottom));animation:pnUp .26s cubic-bezier(.2,.8,.25,1)}
  .overlay.ovb .ovClose{top:14px;right:12px}
  /* v468 节点卡改底部抽屉（移植线上 V106）：随内容收——上限 80vh（菩萨法界 66 位之类内滚），
     下限 30vh 免短卡缩成一条；上方星图仍可见，且拇指区内一屏接完。
     2026-08-08 卡窗归一：此度由 #card 一家扩到凡 .sheet 者（处所/位/门/辅标/段签＋深读页），
     从前位卡门卡走右抽屉（86vw 满高）、处所卡走底抽屉（100vw 随内容），同是一套卡制却两种窗、
     两种进场动画、两种关法（右滑／下滑）——「大大小小不统一」的根即在此。 */
  .overlay.ovb .panel{max-height:80vh;min-height:30vh}
}
@keyframes pnUp{from{opacity:.5;transform:translateY(46%)}}
/* 抽屉把手：只在手机（底部抽屉、可下滑关）才是有效示能；桌面居中窗无从下滑，故不出 */
.sheetGrip{display:none;width:44px;height:4px;border-radius:3px;background:rgba(231,214,166,.3);margin:4px auto 10px;flex:0 0 auto}
@media (max-width:640px){.sheetGrip{display:block}}
.smCur{display:flex;align-items:center;gap:10px;padding:11px 12px;margin-bottom:10px;border:1px solid rgba(215,170,69,.28);border-radius:12px;
  background:rgba(215,170,69,.07);cursor:pointer;-webkit-tap-highlight-color:transparent}
.smCur .k{flex:0 0 auto;font-size:var(--fs-xs);color:var(--gold);letter-spacing:2px;border:1px solid rgba(215,170,69,.4);border-radius:8px;padding:2px 7px}
.smCur .v{flex:1;min-width:0;font-size:var(--fs-md);color:var(--paper);line-height:1.5}
.smCur .v i{display:block;font-style:normal;font-size:var(--fs-xs);color:var(--note);letter-spacing:1px;margin-top:1px}
.smCur .go{flex:0 0 auto;color:var(--note);font-size:var(--fs-md)}
.smIt{display:flex;flex-direction:column;align-items:center;gap:3px;padding:13px 6px;min-height:60px;justify-content:center}
.smIt b{font-weight:600;font-size:var(--fs-lg);letter-spacing:2px}
.smIt span{font-size:var(--fs-xs);color:var(--note);letter-spacing:.5px}
.overlay h2{padding-right:48px}
.overlay h2{margin:0 0 10px;font-size:var(--fs-xl);letter-spacing:3px;color:#f0dfa8;font-weight:600;
  padding-bottom:9px;border-bottom:1px solid transparent;
  border-image:linear-gradient(90deg,rgba(215,170,69,.45),rgba(215,170,69,.06)) 1} /* v242 题字渐变发丝线，分层第一刀 */
.overlay .body{overflow-y:auto;min-height:0;flex:1 1 auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;font-size:var(--fs-md);line-height:1.85}
/* 位卡的阅读尺寸：比普通提示更宽，长句不被迫切成狭窄诗行（本掷层今亦并入此卡）。 */
/* 卡上正文可选可复制（2026-08-15 发起人点单）：全站卡片文字放开选择，长按/拖选即可摘句；
   钮与折叠摘要行仍不可选，免点按误成选字。画布、掷轮台、聊天等操作面维持全局 none。 */
.overlay{user-select:text;-webkit-user-select:text;-webkit-touch-callout:default}
.overlay button,.overlay summary{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#verdict{user-select:text;-webkit-user-select:text}
#verdict button{user-select:none;-webkit-user-select:none}
.overlay #card[data-kind="pos"]{width:min(680px,92vw);max-width:min(680px,92vw)}
#card[data-kind="pos"] #cardHead{padding-bottom:10px}
#card[data-kind="pos"] #cardName{font-family:var(--f-display);font-size:var(--fs-display);letter-spacing:3px}
#card[data-kind="pos"] #cardBody{padding-top:3px}
#card[data-kind="pos"] #cardBtns{border-top:1px solid var(--ck-line);margin-top:8px;padding-top:10px}
/* v302 滚动条全局一制（用户点单：右侧竖滑杆色彩统一）：夜底淡金，取「一轴一谱」金 var(--gold)；窄轨无头尾钮；左侧导航杆隐滚动条制不受影响 */
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
.lbJoin input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(215,170,69,.3);border-radius:9px;color:#efe9d8;padding:12px;font-size:var(--fs-lg);outline:none}
.lbJoin input:focus{border-color:rgba(232,199,102,.75);box-shadow:0 0 0 2px rgba(215,170,69,.12)}
/* V92：缘起/玩法由文字墙改成四段原意 + 三步操作；见闻录沿用同一极简排版。 */
.igLead{font-size:var(--fs-lg);color:#f7eed6;line-height:1.9;margin:2px 0 4px}.igLead b{color:#f4e6b8}
.igMeta{font-size:var(--fs-xs);color:var(--note);letter-spacing:1px;margin-bottom:10px}
.igOr{padding:9px 0;border-top:1px solid rgba(215,170,69,.16)}.igOr:first-of-type{border-top:0}
.igOr b.k{display:inline-block;font-size:var(--fs-xs);letter-spacing:3px;color:var(--gold-hi);border:1px solid rgba(215,170,69,.4);border-radius:5px;padding:1px 7px;margin-right:8px;vertical-align:2px}
.igOr>span{font-size:var(--fs-md);color:#e5d8b2;line-height:1.8}
.igStep{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(215,170,69,.16)}
.igStep .n{flex:0 0 22px;height:22px;border-radius:50%;border:1px solid rgba(215,170,69,.5);color:var(--gold-hi);font-size:var(--fs-sm);display:flex;align-items:center;justify-content:center;margin-top:1px}
.igStep .tx{flex:1;font-size:var(--fs-md);color:#e5d8b2;line-height:1.75}.igStep .tx b{color:#f4e6b8}
.igStep .tx i{font-style:normal;display:block;font-size:var(--fs-xs);color:var(--note);margin-top:2px}
.igTwo{display:flex;gap:8px;margin-top:10px}.igTwo>div{flex:1;padding:9px 10px;border-radius:10px;background:rgba(239,224,180,.05);border:1px solid rgba(215,170,69,.18)}
.igTwo b{display:block;font-size:var(--fs-sm);letter-spacing:2px;color:var(--gold-hi);margin-bottom:3px}.igTwo span{font-size:var(--fs-sm);color:#cdbf95;line-height:1.7}
.igBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.igBtns .wide{grid-column:1/-1}
.lgTop{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;padding:2px 0 10px}.lgTop b{font-size:30px;color:#f4e6b8;line-height:1}
.lgTop span{font-size:var(--fs-sm);color:var(--gold);letter-spacing:1px}.lgTop i{flex:1 0 100%;font-style:normal;font-size:var(--fs-xs);color:var(--note);line-height:1.6;margin-top:4px}
.lgRow{display:flex;align-items:center;gap:7px;width:100%;padding:5px 0;border:0;border-top:1px solid rgba(215,170,69,.12);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}.lgRow.z{opacity:.45}
/* v353 一屏可见：门表两列紧排（原十五行竖排把行程账挤出视野） */
.lgG2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
@media (max-width:520px){.lgG2{grid-template-columns:1fr}}
.lgG2 .lgRow{padding:4px 0}
.lgG2 .lgRow .bar{flex:0 0 34px}
.lgG2 .lgRow .n{flex:0 0 40px}
.lgRow .d{flex:0 0 24px;font-size:var(--fs-xs);color:var(--gold);text-align:center}.lgRow .t{flex:1;font-size:var(--fs-sm);color:#e5d8b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lgRow .bar{flex:0 0 58px;height:4px;border-radius:2px;background:rgba(239,224,180,.12);overflow:hidden}.lgRow .bar i{display:block;height:100%;background:linear-gradient(90deg,#8a6a2a,var(--gold-hi))}
.lgRow .n{flex:0 0 46px;text-align:right;font-size:var(--fs-xs);color:var(--note)}.lgRow .go{flex:0 0 10px;text-align:right;color:var(--gold);font-size:var(--fs-sm)}
.lgPs{display:flex;flex-wrap:wrap;gap:4px;margin-top:9px}.lgPs .lgP{font-size:var(--fs-xs);padding:2px 7px;border-radius:8px;border:1px solid rgba(215,170,69,.16);color:#8d8368;background:rgba(239,224,180,.03)}
.lgPs .lgP.on{color:#f0dfa8;border-color:rgba(215,170,69,.5);background:rgba(215,170,69,.12)}
/* v391 门卡位次一览：位名从死标签改为可点入位卡（归一前通用门要卡的位名点不动，看得见进不去） */
.lgPs button.lgP{font-family:inherit;line-height:1.6;cursor:pointer}
.lgPs button.lgP:active{background:rgba(215,170,69,.2);border-color:rgba(215,170,69,.6)}
/* 分组头与组说明：门1廿一因四类、门14极乐四土同用一套（分组是数据，不是某门的特权） */
.dpG{display:flex;align-items:baseline;gap:8px;margin-top:11px;font-size:var(--fs-sm);color:var(--gold);letter-spacing:2px}
.dpG i{font-style:normal;font-size:var(--fs-xs);color:var(--note);letter-spacing:0}
.dpD{margin-top:3px;font-size:var(--fs-sm);color:#cbbb8d;line-height:1.65}
/* 带一行义读的位（门1廿一因）：一行一位，位名与义读同栏，右缀入位卡 */
.dpRow{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;box-sizing:border-box;padding:7px 12px;min-height:36px;margin-top:6px}
.dpRow>span:first-child{display:flex;align-items:baseline;gap:8px;min-width:0}
.dpRow b{color:#e5d8b2}.dpRow.on b{color:#f4e6b8}
.dpRow i{font-style:normal;font-size:var(--fs-xs);color:var(--note);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpRow .go{color:var(--gold);font-size:var(--fs-xs);white-space:nowrap;flex:none}
.lgNums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px}.lgNums>div{padding:7px 4px;border-radius:9px;background:rgba(239,224,180,.05);border:1px solid rgba(215,170,69,.16);text-align:center}
.lgNums b{display:block;font-size:var(--fs-xl);color:#f4e6b8;line-height:1.3}.lgNums span{font-size:var(--fs-xs);color:var(--note);letter-spacing:1px}
@media(max-width:360px){.igTwo{flex-direction:column}}@media(max-height:470px){.lgTop b{font-size:24px}.lgRow{padding:4px 0}.igLead{font-size:var(--fs-md);line-height:1.7}.igOr{padding:7px 0}.igOr>span{font-size:var(--fs-sm);line-height:1.7}}
#backBtn{position:static;display:none;font-size:var(--fs-sm);padding:5px 12px;min-height:0;letter-spacing:2px;border-radius:16px;flex:none}
#backBtn.show{display:block}
#sfpBar{box-sizing:border-box;bottom:calc(12px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);width:min(540px,96vw);padding:9px 12px;display:none;text-align:center;
  box-shadow:inset 0 1px 0 rgba(232,199,102,.13)} /* v327 border-box：旧 content-box 宽+padding 在竖屏撑出视口；2026-08-11 顶衬一线泥金（浅纸主题下自弱不扰） */
#sfpBar.show{display:block}
/* 收起钮收进面板内角：原先半悬在上边框外，像一颗脱落的泡泡；
   状态行右侧留出让位，免得位名跑到它底下。 */
#conMinBtn{position:absolute;top:5px;right:7px;width:30px;height:30px;border-radius:50%;background:transparent;border:1px solid rgba(231,214,166,.22);color:var(--note);font-size:var(--fs-md);line-height:28px;text-align:center;cursor:pointer;opacity:.75;z-index:2}
#conMinBtn:hover,#conMinBtn:focus-visible{opacity:1;color:var(--gold-hi);border-color:rgba(232,199,102,.5)}
#conPill{position:absolute;right:calc(14px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));width:60px;height:60px;border-radius:50%;display:none;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:rgba(20,17,34,.78);backdrop-filter:blur(6px);border:2px solid rgba(215,170,69,.65);box-shadow:0 3px 14px rgba(0,0,0,.6),0 0 18px rgba(215,170,69,.25);color:#f4e6b8;font-size:var(--fs-lg);font-weight:700;letter-spacing:1px;line-height:1.15;text-shadow:0 1px 3px #000;animation:pillBreath 3.2s ease-in-out infinite}
#conPill.show{display:flex}
@keyframes pillBreath{0%,100%{box-shadow:0 3px 14px rgba(0,0,0,.6),0 0 12px rgba(215,170,69,.18)}50%{box-shadow:0 3px 14px rgba(0,0,0,.6),0 0 24px rgba(215,170,69,.4)}}
.gbtn.dis{opacity:.45;pointer-events:none}
/* 状态行：左轮相牌、右现居位名；棋讯来时借同一行说话，说完退回位名。
   十五门进度不在此处再报一遍——右侧天梯常驻且更细（§5.0b 信息只出一次）。 */
#sfpState{display:flex;align-items:center;gap:10px;text-align:left;padding:1px 40px 7px 2px}
#sfpName{flex:1;min-width:0;font-size:var(--fs-md);letter-spacing:1px;color:#f4e6b8;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sfpName.msg{color:#dccf9f;letter-spacing:.5px}
#sfpFaces{display:flex;gap:5px;align-items:center;cursor:pointer;flex:none} /* 竖排题头「上一掷」已撤（2026-08-12）：两枚轮字自明 */
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
.netEntry .chatLabel.mine{color:var(--gold-hi)}
.netEntry .netUnread{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;border-radius:8px;
  background:var(--woe-tx);color:#14161d;font-size:10px;font-style:normal;line-height:16px;text-align:center;display:none}
.netEntry .netUnread.on{display:block}
#sfpBtns .gbtn{padding:8px 14px;font-size:var(--fs-md);min-height:38px}
#sfpBtns .gbtn.primary{min-height:46px;font-size:var(--fs-lg);letter-spacing:3px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.30)} /* 泥金钮内高光；glow/hold 态各有 box-shadow 动画，届时以彼为准 */
#modeChip{display:none}
#sfpDice{top:24%;left:50%;transform:translate(-50%,-50%);display:none;gap:14px;z-index:25;flex-wrap:wrap;justify-content:center}
#sfpVeil{position:absolute;inset:0;pointer-events:none;z-index:24;opacity:0;transition:opacity .5s;
  background:radial-gradient(ellipse 66% 60% at 50% 46%,rgba(32,27,47,0) 0%,rgba(32,27,47,.05) 34%,rgba(32,27,47,.62) 72%,rgba(24,20,36,.88) 100%)}
#sfpVeil.on{opacity:1}
#askQ{width:100%;box-sizing:border-box;background:rgba(26,22,44,.8);border:1px solid rgba(215,170,69,.45);border-radius:8px;
  color:var(--paper);font-family:inherit;font-size:var(--fs-md);padding:8px 10px;resize:vertical;min-height:52px}
#labels{transition:opacity .45s}
#sfpDice.on{display:flex}
/* v386 掷轮念文（用户令）：一句「至心称念」引领＋六字静置不动——字不呼吸不闪，不给用户节拍压力 */
#sfpChant{flex:0 0 100%;text-align:center;margin-top:22px;color:var(--paper);white-space:nowrap} /* 六字成一行不折（2026-07-30 用户令），窄屏按视宽收字号 */
#sfpChant em{display:block;font-style:normal;font-size:var(--fs-sm);letter-spacing:4px;color:#c8b988;margin-bottom:10px;opacity:.9;white-space:normal}
#sfpChant b{font-size:min(29px,7.4vw);font-weight:600;margin:0 min(6px,1.1vw);display:inline-block;color:#f4e6b8;
  text-shadow:0 0 18px rgba(232,199,102,.8),0 1px 6px #000}
@keyframes chantBreath{0%,100%{opacity:.72}50%{opacity:1}}
/* 静场敛景：顶栏·门梯·控制台上部（门阵/位名/上一掷/问/⋯）一并压暗，屏上只留轮 */
#topbar.hush,#ladder.hush{opacity:.1;transition:opacity .5s;pointer-events:none}
#sfpBar.hush #sfpTop,#sfpBar.hush #sfpDoors,#sfpBar.hush #sfpName,#sfpBar.hush #sfpMsg,
#sfpBar.hush #sfpFaces,#sfpBar.hush #sfpAsk,#sfpBar.hush #sfpMore,#sfpBar.hush #conMinBtn{
  opacity:.08;transition:opacity .45s;pointer-events:none}
#sfpDice.settle #sfpChant{opacity:1;color:#f4e6b8}
#sfpDice span{width:84px;height:84px;display:flex;align-items:center;justify-content:center;font-size:48px;
  color:#f4e6b8;background:rgba(26,22,44,.94);border:2px solid var(--gold);border-radius:16px;
  box-shadow:0 0 26px rgba(215,170,69,.45);transition:width .22s,height .22s,font-size .22s,opacity .22s}
#sfpDice.settle span{color:#fff;background:rgba(176,90,66,.94)}
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
#glsPop #glsF{margin-top:6px;font-size:var(--fs-xs);color:var(--note);letter-spacing:.5px}
#verdict.min #vRoute,#verdict.min #vGist,#verdict.min #vWhy,#verdict.min #vRule,
#verdict.min #vActions,#verdict.min #vX,#verdict.min .vEyebrow{display:none!important}
#verdict.min{padding:7px 16px;cursor:pointer;opacity:.92}
#verdict.min #vN::after{content:' ▴';opacity:.6}
#sfpBar.vd{opacity:.72;transition:opacity .25s}
#vTop{display:flex;align-items:center;gap:8px;padding-right:30px}
#vN{margin-left:auto;font-size:var(--fs-xs);color:var(--ck-note);letter-spacing:.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
/* 轮字：只留字，不做牌（2026-08-12）。善恶由字色分——金／赤两色即是全卡仅有的两种色相；
   边框与「善↑惡↓」小标皆撤：那是把同一件事说第二、第三遍。间距 7→12px 代边框作分隔。 */
#vChips{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.vchip{display:inline-flex;align-items:baseline}
.vchip b{font-family:var(--f-display);font-size:var(--fs-display);font-weight:500;letter-spacing:2px}
.vchip.g b{color:var(--ck-title)}
.vchip.e b{color:var(--woe-tx)}
/* 详读：原是底部动作条上的一枚描边钮，今降为缀在落处位名右侧的文字链（发起人 2026-08-12）。
   它同时接管了原来那枚「白话正本」来源徽章的位置——署名恒为常量，不提供信息，其职并入此链。 */
.vaskC{font-size:var(--fs-xs);margin-left:10px;color:var(--ck-link);cursor:pointer;white-space:nowrap;
  position:relative;letter-spacing:1px;align-self:center}
.vaskC::before{content:'';position:absolute;inset:-12px -14px}
/* 纠错（批E）2026-07-31 整体下线，用户定案：报文的「定位」只有机器串（问答那一路更几乎为空），
   管理处收到即不知所纠何处；送出后又无交代只闪一句 toast。功能连同 .rpKinds/.rpKind/.rpText/.cbFix
   一并撤除，待定位串改为人读得懂的形制（位名·门·轮相·原文摘录）后再议重启。 */
/* ── 问谱面板（2026-08-12 重做，接问谱 v3；旧「问」双气泡＋本地速查双轨一并撤）──
   极简三件：预设问 chips ／ 问答流 ／ 输入条。与阅读页问谱抽屉同一形制，
   只是着色走本站暗夜卡面 token（那边是纸墨）。答语的 .ai-h／.ai-cite 由共用内核
   src/ask-core.js 吐出，两处同名同构，故此处所写与 reader-page.css 那份是同一套语言。 */
.askPanel h2{display:flex;align-items:baseline;gap:9px}
.askPanel h2>i{font-style:normal;font-size:var(--fs-xs);color:var(--ck-note);letter-spacing:1px;font-weight:400}
.askLog{min-height:38vh}
.askHello{font-size:var(--fs-sm);color:var(--ck-read);line-height:1.85;padding:10px 12px;margin:2px 0 4px;
  border-left:2px solid var(--ck-btn-br);background:var(--ck-btn-bg);border-radius:0 8px 8px 0}
.askHello>i{display:block;font-style:normal;margin-top:5px;font-size:var(--fs-xs);color:var(--ck-note);line-height:1.7}
/* 问：右对齐一行，不作气泡——一句话而已，框起来反重 */
.askU{margin:14px 0 6px;text-align:right;font-size:var(--fs-sm);color:var(--ck-meta);line-height:1.6}
.askU::before{content:'问　';font-size:var(--fs-xs);color:var(--ck-note)}
/* 答：素底直陈，只以左侧一道金线示意「这是答」 */
.askA{font-size:var(--fs-sm);color:var(--ck-plain);line-height:1.85;min-width:0;overflow-wrap:break-word;
  padding-left:11px;border-left:2px solid var(--ck-line)}
.askA>p{margin:0 0 8px}
.askA>p:last-child{margin-bottom:0}
.askA>ol,.askA>ul{margin:6px 0;padding-left:20px}
.askA>li,.askA li{margin:4px 0}
.askA li::marker{color:var(--ck-meta)}
.askA strong{color:var(--ck-title);font-weight:600}
.askA .ai-h{margin:12px 0 6px;padding-top:9px;border-top:1px solid var(--ck-line);
  font-family:var(--f-display);font-size:var(--fs-lg);color:var(--ck-title);font-weight:600}
.askA .ai-h:first-child{margin-top:0;padding-top:0;border-top:0}
/* 行内角标：点开即在本条答语之下展出那一条出处，再点即收 */
.ai-cite{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;margin:0 2px;padding:0 3px;
  font-family:var(--f-ui);font-size:10px;line-height:1;vertical-align:2px;
  background:var(--ck-btn-bg);border:1px solid var(--ck-btn-br);border-radius:4px;color:var(--ck-meta);cursor:pointer}
.ai-cite:hover,.ai-cite.on{color:var(--ck-link);border-color:var(--ck-link)}
.askCiteCard{margin-top:8px;padding:8px 10px;border:1px solid var(--ck-btn-br);border-radius:8px;background:var(--ck-btn-bg)}
.askCiteCard .cMeta{font-size:var(--fs-xs);color:var(--ck-note)}
.askCiteCard .txt{font-size:var(--fs-sm);color:var(--ck-read);line-height:1.7;margin-top:3px;overflow-wrap:break-word}
.askGo{margin-top:6px;font-family:var(--f-ui);font-size:var(--fs-xs);background:none;border:none;padding:0;color:var(--ck-link);cursor:pointer}
.askGo:hover{text-decoration:underline}
/* 核验一行小字：引文已逐句核验／有句被剔除／降级直出。不作徽章，一行字足矣 */
.askChk{margin-top:7px;font-family:var(--f-ui);font-size:var(--fs-xs);letter-spacing:.3px}
.askChk.ok{color:#83c9a6}
.askChk.warn{color:var(--ck-link)}
/* 检书中：三点 */
.askDots{display:flex;gap:5px;align-items:center}
.askDots>i{font-style:normal;font-size:var(--fs-xs);color:var(--ck-note);margin-right:4px}
.askDots>span{width:5px;height:5px;border-radius:50%;background:var(--ck-note);animation:askDot 1s infinite ease-in-out}
.askDots>span:nth-child(3){animation-delay:.15s}
.askDots>span:nth-child(4){animation-delay:.3s}
@keyframes askDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.askChips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.askBar{display:flex;gap:6px;margin-top:8px}
.askBar .gbtn{min-height:46px;padding:0 18px}
.askFoot{display:flex;gap:8px;margin-top:8px}
.askFoot .gbtn:last-child{flex:1}
.chipQ{font-family:var(--f-ui);font-size:var(--fs-sm);border:1px solid var(--ck-btn-br);border-radius:9px;padding:7px 11px;color:var(--ck-meta);cursor:pointer;white-space:nowrap}
/* 问·输入框：跟随卡片主题（16px 防 iOS 聚焦缩放） */
.cbInput{flex:1;min-width:0;box-sizing:border-box;background:var(--ck-btn-bg);border:1px solid var(--ck-btn-br);border-radius:10px;color:var(--ck-plain);padding:11px 12px;font-family:var(--f-ui);font-size:var(--fs-lg)}
.cbInput::placeholder{color:var(--ck-note);font-family:var(--f-ui);font-style:normal;letter-spacing:.2px}
.vhd{font-style:normal;font-size:var(--fs-xs);opacity:.7;margin-left:5px;border:1px solid currentColor;border-radius:4px;padding:0 3px;vertical-align:1px}
/* NotebookLM 式判词：行内角标 → 下方出处逐条直列，点角标即高亮其所指那一条。
   角标一律用数字，不加类型标签、不加免责句——引的是本位还是他位，看出处串上的位名即知。 */
.sfpCite{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;margin:0 2px;padding:0 3px;
  font-family:var(--f-ui);font-size:10px;line-height:1;vertical-align:2px;
  background:var(--ck-btn-bg);border:1px solid var(--ck-btn-br);border-radius:4px;color:var(--ck-meta);cursor:pointer}
.sfpCite:hover{color:var(--ck-link);border-color:var(--ck-link)}
/* v400 判詞卡改制：判定一行・白話・文白對照。原文直陳不折疊——
   用戶要知譜中怎麼講，藏起來反多一次點擊；出處只留位名，卷行去之。 */
.rdVerdict{font-family:var(--f-ui);font-size:var(--fs-sm);color:var(--ck-meta);padding-bottom:5px;border-bottom:1px solid var(--ck-line);margin-bottom:2px}
.rdCanon{margin-top:8px}
.rdCanon>.cMeta{font-size:var(--fs-xs);color:var(--ck-note);margin-bottom:3px}
/* 位名钮对齐**末行**（原 baseline＝对齐首行）：引文一折行，钮就卡在句子中间，
   读起来像「百千萬劫。[上品十惡] 難得出期。」把句子劈开。改 flex-end 后钮落在引文尾部。 */
.rdCanonRow{display:flex;align-items:flex-end;gap:5px;padding:3px 0;border-radius:6px;transition:background .18s}
.rdCanonRow>.sfpCiteN{align-self:flex-start}   /* 序号仍钉首行——它标的是第几条，不是句尾 */
.rdCanonRow.on{background:var(--ck-btn-bg)}
.rdCanonRow>.t{flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ck-read);line-height:1.7;overflow-wrap:break-word}
.rdCanonRow>.sfpCiteGo{flex:0 0 auto;margin-top:0;white-space:nowrap;font-size:var(--fs-xs);color:var(--ck-note)}
.rdCanonRow>.sfpCiteGo.oth{color:var(--ck-link)}   /* 引自別位者顯眼——此判從彼處承來 */
.rdChips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.rdRule{display:flex;gap:8px;margin-top:9px;padding:8px 10px;border-left:2px solid var(--ck-meta);border-radius:0 8px 8px 0;background:var(--ck-btn-bg)}
.rdRule b{flex:none;font-size:var(--fs-xs);color:var(--ck-meta);font-weight:500}.rdRule span{font-size:var(--fs-sm);color:var(--ck-read);line-height:1.7}

/* 出處默認收起：前臺以極簡為要，必要者先給，餘者點開再看 */
/* .sfpCiteBox／.sfpCites／.sfpCiteRow／.sfpCiteBody／.sfpCiteCard 随旧「问」答语卡撤
   （2026-08-12）；判词卡的正本引文行仍用 .sfpCiteN 与 .sfpCiteGo，故此二者留。 */
.sfpCiteN{flex:0 0 auto;font-family:var(--f-ui);font-size:10px;color:var(--ck-note);padding-top:2px}
/* 引文所出之位、判词去向之位皆可点——引文不是死脚注，能把人带到谱里那一处 */
.sfpCiteGo{margin-top:4px;font-family:var(--f-ui);font-size:var(--fs-xs);background:none;border:none;padding:0;color:var(--ck-link);cursor:pointer}
.sfpCiteGo:hover{text-decoration:underline}
/* .sfpExpand（再讲开一点）与 .sfpFacts（定本事实条）2026-08-12 撤：
   问谱 v3 无定本路由，不再返回 facts，二者本已无从渲染。 */
.vdst{font-size:var(--fs-xl);letter-spacing:1px;color:#f0dfa8;font-weight:700}
.vbn{display:inline-block;margin-left:8px;font-size:var(--fs-xs);border:1px solid rgba(215,170,69,.6);border-radius:5px;padding:1px 6px;color:#e8d9a6;vertical-align:2px;font-weight:400}
#vWhy.full{display:block;-webkit-line-clamp:unset;overflow:visible}
#vGo{width:100%;margin-top:10px;min-height:44px;position:relative;overflow:hidden}
/* 联机判词卡的本手剩余时间：服务器逾时会代为交轮，读谱注的人有权知道自己还剩多久 */
#vClock{margin-left:8px;font-style:normal;font-size:var(--fs-xs);color:#b9b09a;font-variant-numeric:tabular-nums}
#vClock:empty{display:none}
#vClock.warn{color:var(--gold-hi)}
/* 站内确认卡（替代 window.confirm）：自成一层，不占 overlay */
/* z:120＝全站绝顶（题屏 #boot 是 z:100）：确认卡是打断性的最后一问，连题屏都不得压它——
   题屏「新开一局」的确认从前就弹在 #boot 背后，看着像「点了没反应」（用户 2026-08-12 报）。 */
#sfpConfirm{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;
  padding:16px;background:rgba(8,10,15,.76);backdrop-filter:blur(4px)}
#sfpConfirm.on{display:flex}
#sfpConfirm .cfCard{width:min(340px,92vw);box-sizing:border-box;padding:20px 18px 16px;color:#e8e2d0;
  background:rgba(18,21,30,.98);border:1px solid rgba(215,170,69,.42);border-radius:16px}
#sfpConfirm h3{margin:0 0 8px;letter-spacing:2px;color:#f0dfa8;font-size:var(--fs-lg)}
#sfpConfirm .cfBody{color:#b9b09a;font-size:var(--fs-sm);line-height:1.7}
#sfpConfirm .cfBody b{color:var(--gold-hi);font-weight:500}
#sfpConfirm .gbtn{display:block;width:100%;min-height:46px;margin-top:10px}
/* 单钮告知卡（noText 传空）：display:block 会盖过 hidden 属性，须显式收起，
   否则留一枚无字空钮杵在下面——看着像卡没画完 */
#sfpConfirm .gbtn[hidden]{display:none}
/* 我的功课（2026-08-05 极简改版 · 用户点单）：一页只答一问——「我修了多少、连了几天、还能去哪」。
   此前四格卡把全站与我的两组数摆成平级，可这是「我的」页，全站数在大厅顶条已有一份，
   平级即是稀释主角；月历又占去 ~640px，把唯一的功能入口挤出屏外。故三处收束：
     一、我的数字独占一卡（大数＋一行副文），全站降为卡下一行注脚；
     二、全月月历移入 .myCalPop 弹窗，主页面只留「近七日」一条迷你格，一眼见连续；
     三、名号收进页头右上 .myName，点即改名，省下整整一行。
   页高由 ~1460px 收到 ~600px，390×844 一屏看完。
   2026-08-16 三之改（发起人点单「名号卡放进我的页，随时可改」）：页头右上那枚「…」小钮撤，
   名号升为页首一张卡（.myId，皮与行为在 plaza.js，与入座问名卡同源）——那枚小钮省下的是一行，
   代价却是「我是谁」无处可看、要改还得跳出整页；今就地一卡，看与改都在这一页上。 */
.myPanel .myLoad{padding:36px 0;text-align:center;color:var(--aq-note);letter-spacing:2px}
.myPanel .pzTop{padding-right:52px;gap:10px}
/* 主数字卡：一个大数说「我修了多少」，一行小字说其余四项——不再四格平分注意力 */
.myPanel .myCard{padding:15px 16px 14px;border:1px solid var(--aq-line);border-radius:12px;background:rgba(176,131,28,.1)}
.myPanel .myCard i{display:block;font-style:normal;color:var(--aq-note);font-size:var(--fs-xs);letter-spacing:1px}
.myPanel .myCard b{display:block;margin-top:2px;color:var(--aq-title);font-size:var(--fs-display);font-weight:500;
  letter-spacing:1px;line-height:1.15;font-variant-numeric:tabular-nums}
.myPanel .myCard span{display:block;margin-top:7px;color:var(--aq-note);font-size:var(--fs-sm);
  letter-spacing:1px;font-variant-numeric:tabular-nums}
.myPanel .mySite{margin-top:7px;text-align:center;color:var(--aq-note);opacity:.85;
  font-size:var(--fs-xs);letter-spacing:1px;font-variant-numeric:tabular-nums}
/* 近七日：一行七格深浅，末格是今日（描圈）。整条即「全月」按钮，点开弹窗 */
.myPanel .myWeek{display:flex;align-items:center;gap:10px;width:100%;margin-top:12px;min-height:46px;
  padding:0 13px;text-align:left;font-size:var(--fs-sm);border-radius:12px}
.myPanel .myWeek em{flex:none;font-style:normal;color:var(--aq-note);font-size:var(--fs-xs);letter-spacing:1px}
.myPanel .myWkBar{display:flex;gap:4px;flex:1 1 auto;min-width:0}
.myPanel .myWkBar i{flex:1 1 auto;max-width:20px;height:20px;border-radius:5px;background:var(--aq-wash)}
.myPanel .myWeek>i{flex:none;margin-left:auto;font-style:normal;color:var(--aq-strong);white-space:nowrap}
.myPanel .myList{margin-top:12px;border:1px solid var(--aq-line);border-radius:12px;background:rgba(255,255,255,.6);overflow:hidden}
.myPanel .myList .gbtn{border:0;border-radius:0;background:transparent;padding:0 13px}
.myPanel .myList .gbtn+.gbtn{border-top:1px solid var(--aq-line)}
/* 月历弹窗：踞「我的」整页之上自成一层（非 openOverlay，故不把「我的」顶掉） */
.myPanel .myCalPop{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:16px;
  box-sizing:border-box;background:rgba(24,32,34,.42);backdrop-filter:blur(2px);animation:ovIn .18s ease}
.myPanel .myCalCard{width:min(360px,100%);box-sizing:border-box;padding:12px 12px 10px;border-radius:16px;
  border:1px solid var(--aq-goldline);background:linear-gradient(160deg,#eef3f5,#e2eaee);
  box-shadow:0 18px 44px rgba(20,28,30,.28);animation:pnIn .24s cubic-bezier(.2,.8,.25,1)}
.myPanel .myCalHead{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.myPanel .myCalHead b{color:var(--aq-title);font-weight:500;font-size:var(--fs-md);letter-spacing:1px}
.myPanel .myCalHead .gbtn{min-height:32px;padding:2px 11px;font-size:var(--fs-md)}
.myPanel .myCalHead .myCalX{margin-left:auto}
.myPanel .myCalFoot{display:flex;align-items:center;gap:10px;margin-top:9px;min-height:20px;
  color:var(--aq-note);font-size:var(--fs-xs);letter-spacing:1px;font-variant-numeric:tabular-nums}
.myPanel .myCalFoot i{margin-left:auto;font-style:normal;color:var(--aq-strong)}
.myPanel .myWk,.myPanel .myDays{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.myPanel .myWk span{text-align:center;color:var(--aq-note);opacity:.7;font-size:var(--fs-xs);padding-bottom:3px}
.myPanel .myCell{display:flex;align-items:center;justify-content:center;min-height:38px;padding:0;
  border:0;border-radius:8px;background:rgba(255,255,255,.42);font:inherit;cursor:pointer}
.myPanel .myCell.pad{background:none;pointer-events:none}
.myPanel .myCell i{font-style:normal;font-size:var(--fs-xs);color:var(--aq-note)}
/* 深浅四档：满档＝本月最高一日，任谁的掷数量级都自适应；格内不再重复写数，点格才报数。
   最淡一档须与「没修」一眼分得开——月历要答的正是「哪天修了」，故 lv1 起手就见得着金意，
   空日则退成近白，二者不靠细微差别相区分。 */
.myPanel .myCell.lv1{background:rgba(176,131,28,.22)}
.myPanel .myCell.lv2{background:rgba(176,131,28,.38)}
.myPanel .myCell.lv3{background:rgba(176,131,28,.54)}
.myPanel .myCell.lv4{background:rgba(176,131,28,.72)}
.myPanel .myCell.lv1 i,.myPanel .myCell.lv2 i{color:var(--aq-title)}
.myPanel .myCell.lv3 i,.myPanel .myCell.lv4 i{color:#3a2c06}
/* 未到之日：空到近乎无格，只留一个淡日期——尚未发生，不作「没修」计 */
.myPanel .myCell.fut{background:none;opacity:.45}
.myPanel .myCell.now{outline:2px solid rgba(150,112,32,.75);outline-offset:-2px;opacity:1}
.myPanel .myWkBar i.lv1{background:rgba(176,131,28,.22)}
.myPanel .myWkBar i.lv2{background:rgba(176,131,28,.38)}
.myPanel .myWkBar i.lv3{background:rgba(176,131,28,.54)}
.myPanel .myWkBar i.lv4{background:rgba(176,131,28,.72)}
.myPanel .myWkBar i.now{outline:2px solid rgba(150,112,32,.75);outline-offset:-2px}
.myPanel .myRow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;font-size:var(--fs-sm);min-height:44px}
.myPanel .myRow .ico{color:var(--aq-gold);opacity:.92}   /* 行首的形只作辨识：泥金作形不作字 */
.myPanel .myRow>span{min-width:0;flex:1 1 auto}
.myPanel .myRow i{margin-left:auto;font-style:normal;color:var(--aq-strong);white-space:nowrap}
/* 共同结算卡：一句结果 + 一句本座 + 同座行处，三层看完即知本局如何 */
.nsPanel .nsHead{margin-top:6px;color:#f0dfa8;font-size:var(--fs-lg);letter-spacing:2px}
.nsPanel .nsMine{margin-top:3px;color:#cfc7ad;font-size:var(--fs-sm)}
.nsPanel .nsList{margin-top:11px;border-top:1px solid rgba(215,170,69,.16)}
.nsPanel .nsRow{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:9px;
  min-height:40px;border-bottom:1px solid rgba(215,170,69,.09);font-size:var(--fs-sm)}
.nsPanel .nsRow .dot{width:10px;height:10px;border-radius:50%}
.nsPanel .nsRow b{color:#dcd0ad;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nsPanel .nsRow span{color:var(--note);white-space:nowrap}
/* 落处提要：取**去处之位**——掷毕这一刻要知道的是要去的那一位是何修行，出发位上一张卡刚读过；
   安住／贈掷无去处，仍标本位。门标（.vgD）已撤于 2026-08-12：所属门在位卡词头恒可见。
   位名亦不再重印——它就在上方去向条的落处那一端。 */
#vGist{display:none;font-size:var(--fs-xs);color:var(--ck-read);line-height:1.65}
#vGist.on{display:block}
#vWhy{font-size:var(--fs-sm);color:var(--ck-plain);line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#verdict[data-dir="up"]{border-left-color:var(--gold-hi)}
#verdict[data-dir="down"]{border-left-color:var(--woe-tx);transform:translate(-50%,-14px)}
#verdict[data-dir="stay"]{border-left-color:var(--note)}
#verdict[data-dir="pure"]{border-left-color:#f6ecc8}
#verdict[data-dir="start"],#verdict[data-dir="bonus"]{border-left-color:var(--gold)}
/* ══ 掷后判词卡 v2：结果先读、正本理由次读、操作规则另栏、动作最后。 ══ */
#verdict{padding:0;border-left:1px solid var(--ck-border);border-radius:18px;overflow:hidden;cursor:default;
  box-shadow:0 24px 70px -28px rgba(0,0,0,.78),inset 0 1px 0 rgba(255,255,255,.08)}
#verdict::before{content:'';display:block;height:3px;background:var(--gold);opacity:.9}
#verdict[data-dir="up"]::before{background:var(--gold-hi)}
#verdict[data-dir="down"]::before{background:var(--woe-tx)}
#verdict[data-dir="stay"]::before{background:var(--note)}
#verdict[data-dir="pure"]::before{background:linear-gradient(90deg,var(--gold),var(--ck-bai),var(--gold))}
#verdict.show[data-dir="down"]{transform:translate(-50%,0)}
#vTop{min-height:34px;padding:7px 48px 7px 15px;gap:9px}
.vEyebrow{font-size:var(--fs-xs);letter-spacing:3px;color:var(--ck-meta);white-space:nowrap}
/* 轮字紧随题头靠左：掷毕这一刻最要紧的是「我掷到了什么」，它该是左侧的视觉主角。
   （旧制 #vChips 与 #vN 各带一个 margin-left:auto，剩余空间被均分，轮字遂飘到正中——
   那是轮字还做「牌」时的残留：一对紧凑带框的小牌居中尚可，放大成展示级字就散了。） */
#vChips{margin-left:2px}
/* ── 去向条：来处 → 落处，两端皆可点入位卡；「详读 ›」缀落处之右 ────────────────
   归一前是两行——一行「由「X」判此一掷」，一行判定主句里又写一遍去处位名。
   v400 在详读卡早已裁过同一刀：去向条给的是可点的两枚位签与升降箭头，一眼看出方向，且省一行。 */
#vRoute{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px;margin:11px 16px 0}
#vRoute .vp{cursor:pointer}
#vRoute>span.vp{font-size:var(--fs-sm);color:var(--ck-note);border-bottom:1px dotted var(--ck-line)}
#vRoute>span.vp:active{color:var(--ck-read)}
#vRoute .var{font-style:normal;color:var(--ck-meta);font-size:var(--fs-md);opacity:.85}
#verdict[data-dir="down"] #vRoute .var{color:var(--woe-tx)}
#vRoute>b{font-family:var(--f-display);font-size:var(--fs-display);color:var(--ck-title);font-weight:600;letter-spacing:1px}
#vRoute>b.vp{border-bottom:1px dotted rgba(215,170,69,.55)}
/* 结果（轮字·去向）与缘由（提要·白话·规则）之间只此一条线——
   2026-08-10 那套把七层框一次拔光却没留承担层次的东西，卡遂糊成一片，故回滚。
   今以一条线代七个框：结构在，噪音去。 */
#vGist{margin:12px 16px 0;padding-top:11px;border-top:1px solid var(--ck-line)}
#vWhy{display:block;margin:7px 16px 0;color:var(--ck-plain);font-size:var(--fs-sm);line-height:1.75;overflow:visible}
.vWhyText{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
#vWhy.full .vWhyText{display:block;overflow:visible}
/* 操作规则：本项目自撰，非谱文，故字色退到 read 一档；不加框、不加底，靠字色与字号分层 */
#vRule{display:flex;margin:7px 16px 0;gap:7px;font-size:var(--fs-xs);line-height:1.65;color:var(--ck-read)}
#vRule b{flex:none;color:var(--ck-meta);font-weight:500}#vRule span{min-width:0}
/* 动作条只余一枚金主钮（详读已降为去向条上的文字链）——合「一屏一枚金主钮」 */
#vActions{display:flex;margin-top:13px;padding:10px 14px 12px}
#vActions .gbtn{min-height:44px;margin:0}
#vGo{flex:1;width:auto;margin:0;min-height:44px}
#verdict #vX{top:7px;right:8px;border:0;background:transparent;color:var(--ck-note)}
#verdict #vX:hover,#verdict #vX:focus-visible{color:var(--ck-title);background:var(--ck-btn-bg)}
@media (max-width:640px){
  #verdict{width:calc(100vw - 16px);bottom:calc(118px + env(safe-area-inset-bottom));border-radius:16px}
  .vEyebrow{letter-spacing:2px}#vTop{padding-left:12px}#vRoute,#vGist,#vWhy,#vRule{margin-left:12px;margin-right:12px}
  .vWhyText{-webkit-line-clamp:2}#vActions{padding:9px 11px 10px}
  .overlay.ovb #card[data-kind="pos"]{width:100vw;max-width:100vw}
}
.ladDoor.fl i{animation:ladFl .55s ease 2}
@keyframes ladFl{0%,100%{transform:scale(1)}45%{transform:scale(2.1);box-shadow:0 0 10px currentColor}}
#rollBn{position:absolute;top:-8px;right:-3px;font-size:var(--fs-xs);line-height:1;padding:3px 7px;border-radius:9px;background:#2a2416;border:1px solid rgba(232,199,102,.6);color:var(--gold-hi);display:none;pointer-events:none;letter-spacing:1px;z-index:1}
#rollRing{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s;padding:2.5px;box-sizing:border-box;
  background:conic-gradient(rgba(232,199,102,.95) var(--p,0%),rgba(232,199,102,.14) 0);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}
#sfpRoll.hold #rollRing{opacity:1}
#sfpName .nSub{margin-left:8px;font-size:var(--fs-xs);color:var(--note);letter-spacing:.5px;font-weight:400}
#posReveal i{display:block;font-style:normal;font-size:var(--fs-sm);letter-spacing:1px;margin-top:8px;color:#e8dcb2;text-shadow:0 1px 8px #000;opacity:.95}
/* #tierDots 三点档皮已随装置撤（2026-08-14 档二④，缘由见原挂载处注） */
#hovTag{position:absolute;display:none;padding:3px 9px;font-size:var(--fs-sm);color:#f0dfa8;background:rgba(16,22,30,.85);border:1px solid rgba(215,170,69,.35);border-radius:8px;pointer-events:none;z-index:24;letter-spacing:1px;white-space:nowrap}
#vX{position:absolute;top:6px;right:6px;width:34px;height:34px;background:rgba(215,170,69,.12);border:1px solid rgba(215,170,69,.4);
  border-radius:8px;color:var(--gold);font-size:var(--fs-lg);line-height:1;cursor:pointer}
#transitCap{position:absolute;left:50%;top:15%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .5s;pointer-events:none;z-index:20;max-width:88vw}
#transitCap.show{opacity:1}
#transitCap b{display:block;font-size:var(--fs-lg);letter-spacing:4px;color:#f4e6b8;text-shadow:0 0 18px rgba(215,170,69,.85),0 2px 8px #000}
#transitCap i{display:block;font-style:normal;margin-top:6px;font-size:var(--fs-sm);line-height:1.6;color:#dccf9f;letter-spacing:1px;text-shadow:0 1px 6px #000}
/* v391 修「点右侧门梯无反应、地图变空」：本卡居中时宽 min(600px,92vw)，640 宽视口下右边缘正好盖死门梯
   （right:6px、宽52px）——点门被本卡吞掉，inDoor 停在前一门而门珠已按新门隐去→满屏空。
   为门梯让位（右置 64px＝6+52+6），不靠提升门梯层级互盖。 */
#doorIntro{position:absolute;left:auto;right:64px;top:54px;transform:translateY(-8px);width:min(600px,calc(100vw - 80px));z-index:26;opacity:0;pointer-events:none;
  transition:opacity .5s,transform .5s;background:rgba(26,22,44,.9);border:1px solid rgba(215,170,69,.45);border-radius:10px;
  padding:12px 14px;backdrop-filter:blur(6px);box-sizing:border-box}
#doorIntro.show{opacity:1;transform:translateY(0);pointer-events:auto}
#doorIntro b{display:block;font-size:var(--fs-md);letter-spacing:3px;color:#f0dfa8}
#doorIntro .dit{margin-top:7px;font-size:var(--fs-sm);line-height:1.78;color:#e6d9ac;max-height:36vh;overflow-y:auto;text-align:justify}
#doorIntro .dif{margin-top:8px;font-size:var(--fs-xs);color:var(--note);letter-spacing:1px}
/* 门总说极简（2026-08-08 发起人点单「极简方案·原文折叠」）。旧制把「释义」与「谱曰原文」
   两段平铺，而门总说原文最长者 966 字（门14）、754 字（门13），一点开就是一大坨文言，
   36vh 的框里只能内滚——提要与原文两头都不落实。今改：白话为正文（领起句＋明细行，
   与卡片 .nRow 同语汇），原文收进折叠，想对读再点开。
   门1/2/15 原谱无总说，其导语系本项目自撰，故不设折叠（无谱文可对），只缀一行说明。 */
#doorIntro .diV{color:#ecdca6}
#doorIntro .nRow{border-top-color:rgba(215,170,69,.14)}
#doorIntro .nRow>.k{color:var(--ck-meta,#ecc760)}
#doorIntro .nRow .v{font-size:var(--fs-sm);color:#e6d9ac}
#doorIntro .diMore{margin-top:9px;border-top:1px solid rgba(215,170,69,.18);padding-top:6px}
#doorIntro .diMore>summary{font-size:var(--fs-xs);color:#c9bc8f;letter-spacing:1px;cursor:pointer;list-style:none}
#doorIntro .diMore>summary::-webkit-details-marker{display:none}
#doorIntro .diMore>summary::before{content:'▸ ';color:rgba(215,170,69,.8)}
#doorIntro .diMore[open]>summary::before{content:'▾ '}
#doorIntro .diC{margin-top:6px;font-size:var(--fs-xs);line-height:1.95;color:#c9bc8f;font-family:var(--f-display)}
#doorIntro .diSelf{margin-top:9px;font-size:var(--fs-xs);color:var(--note);letter-spacing:.5px}
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
/* 菩萨十科签三改（2026-08-14 发起人点单）：v393 曾十签全显（触屏无 hover，圆点无名）——
   实测局中十签字幅压到底部轮相牌上。今改「静显当下、触显全档」：
   平时只现当前科一签（不占版面不挡轮相）；手指落到滑杆上（.bnvAll）十签齐现以供择科，
   离手片刻自敛。字仍可点（pointer-events:auto 保留——现字而不受点，是残缺）。
   只治 #bodhiNav：色界四禅签（#skyNav）签少色分明，不在此例。 */
#bodhiNav .bnv b{opacity:0;transform:none;pointer-events:auto;transition:opacity .25s}
#bodhiNav .bnv.on b{opacity:1}
#bodhiNav.bnvAll .bnv b{opacity:.62}
#bodhiNav.bnvAll .bnv.on b,#bodhiNav .bnv:hover b{opacity:1}
/* v222 色界签禅支小字（竖杆行内缀排）；五净居金白圣色（凡圣分界） */
.bnv .bnvSub{font-size:9px;opacity:.66;letter-spacing:1.5px;margin-left:6px;font-weight:400}
.nlabel.pureAbode{color:#f6f0da;text-shadow:0 0 10px rgba(246,240,218,.35),0 1px 3px #000}
.bnv.on i{transform:scale(1.65);box-shadow:0 0 12px currentColor}
.bnv.on b{font-weight:700}
#ladTrack{position:absolute;right:16px;top:0;bottom:0;width:4px;border-radius:2px;
  background:linear-gradient(to top,rgba(176,90,66,.4),rgba(51,144,124,.34) 34%,rgba(91,147,168,.34) 56%,rgba(215,170,69,.4) 76%,rgba(246,236,200,.55))}
/* 十六根刻度已撤（2026-08-14 十界导航极简）：十五枚门点本身即是刻度，第二套齐平短线是重复装置 */
#ladMe,#ladAi,#ladNext{display:none}
/* v151 用户定案：行棋不用球珠标位，现居门位次自身发光 */
.ladDoor.cur b{color:#ffe9a8;text-shadow:0 0 10px rgba(232,199,102,.85),0 1px 3px rgba(10,8,20,.8)}
.ladDoor.cur i{border-color:#fff;transform:scale(1.55);animation:curPulse 2.2s ease-in-out infinite}
.ladDoor.aic i{outline:2px solid rgba(150,225,214,.75);outline-offset:2px}
@keyframes curPulse{0%,100%{box-shadow:0 0 7px currentColor}50%{box-shadow:0 0 15px currentColor,0 0 24px rgba(232,199,102,.55)}}
#ladTop,#ladBot{position:absolute;right:11px;font-size:var(--fs-xs);color:#cbbb8d;letter-spacing:1px;text-shadow:0 0 6px rgba(10,8,20,.95),0 0 2px #000}
#ladTop{top:-20px}#ladBot{bottom:-20px}
.ladDoor{position:absolute;left:0;right:0;height:6.66%;display:flex;align-items:center;justify-content:flex-end;gap:5px;cursor:pointer;pointer-events:auto}
/* 门号静显当下（2026-08-14 十界导航极简，与菩萨十科签同一语汇）：十五个竖排门号常显是
   右缘最大的字面噪音——平时只现当前门（.cur）与展开门（.on），手指落杆全现供跳门，离手自敛；
   桌面 hover 逐门自现。色点与「佛—因」两端字常在：结构在，字才敢退。 */
.ladDoor b{font-weight:400;font-size:var(--fs-xs);color:var(--note);letter-spacing:0;white-space:nowrap;
  opacity:0;transition:color .2s,opacity .25s;text-shadow:0 0 6px rgba(10,8,20,.95),0 0 2px #000,0 1px 3px rgba(10,8,20,.8)} /* 四向暗晕：窄屏亮金光带上门号仍可辨 */
.ladDoor.cur b,.ladDoor.on b,.ladDoor:hover b{opacity:1}
#ladder.ladAll .ladDoor b{opacity:.62}
#ladder.ladAll .ladDoor.cur b,#ladder.ladAll .ladDoor.on b{opacity:1}
.ladDoor i{width:9px;height:9px;border-radius:50%;border:1px solid rgba(255,255,255,.28);box-shadow:0 0 5px rgba(10,8,20,.5);margin-right:11px;transition:transform .22s,box-shadow .22s;flex:0 0 auto}
.ladDoor.on b{color:#f4e6b8}
.ladDoor .ladPeer{position:absolute;top:50%;width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 4px currentColor;transform:translateY(-50%);pointer-events:none} /* v392 联机同修现居门座色小刻 */
/* v393 两质金（壁画光第三期）：入极乐场（applyLight('pureland') 挂 html.pureTone）UI 金上移半阶——
   娑婆烛火金 #d7aa45/#e8c766 → 极乐琉璃金 #e8c766/#f4e6b8（偏白偏静，「彼土不假日月」佛光恒明） */
.pureTone{--gold:#e8c766;--gold-hi:#f4e6b8}
/* v393 夜↔晓明适应缓坡：暗夜星图上骤开石青晓浅色面板晃眼——浮层入场给视网膜 220ms 亮度坡 */
.overlay{animation:ovDawn .22s ease-out}
@keyframes ovDawn{from{opacity:0}}
.ladDoor.on i{transform:scale(1.75);box-shadow:0 0 12px currentColor}
.ladDoor.cur i{border-color:#fff;box-shadow:0 0 9px rgba(232,199,102,.9)}
#ladName{position:absolute;right:50px;background:rgba(24,18,38,.88);border:1px solid rgba(215,170,69,.45);border-radius:8px;padding:4px 10px;font-size:var(--fs-sm);color:var(--paper);white-space:nowrap;display:none;pointer-events:none;letter-spacing:1px}
#sfpRoll.glow{animation:rollGlow 1.6s ease-in-out infinite}
#sfpRoll.wait{opacity:.45;filter:saturate(.5)} /* 联机候轮：未轮到时压暗 */
#sfpRoll.hold{background:rgba(215,170,69,.32);box-shadow:0 0 18px rgba(232,199,102,.55);color:#f4e6b8;animation:none}
@keyframes rollGlow{0%,100%{box-shadow:0 0 5px rgba(232,199,102,.2)}50%{box-shadow:0 0 18px rgba(232,199,102,.8)}}
.sfpTrailRow{display:flex;gap:8px;align-items:baseline;font-size:var(--fs-sm);padding:5px 0;border-bottom:1px solid rgba(215,170,69,.15);text-align:left;cursor:pointer}
.sfpTrailRow:hover{background:rgba(215,170,69,.06)}
.sfpTrailRow>span:nth-child(3){flex:1;min-width:0}
.sfpTrailRow .tgo{font-style:normal;color:var(--note);opacity:.7;align-self:center} /* 行尾 ›：此行可点开落处位卡 */
.sfpTrailRow .tn{flex:0 0 3.4em;color:var(--note);font-size:var(--fs-xs)}
.sfpTrailRow .tc{flex:0 0 3em;color:var(--gold)}
.sfpMoves{margin:6px 0}
.sfpMoves .mv{display:flex;gap:8px;font-size:var(--fs-sm);margin:3px 0;color:#dccf9f;text-align:left}
.sfpMoves .mv b{color:var(--gold);font-weight:600;flex:0 0 8.5em;text-align:right}
#toast{bottom:calc(178px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:120;
  background:rgba(26,22,44,.95);border:1px solid rgba(215,170,69,.6);border-radius:9px;padding:9px 16px;
  font-size:var(--fs-md);opacity:0;transition:opacity var(--t-mid) var(--ease-out);pointer-events:none;max-width:86vw;text-align:center}
  /* z:120 与确认卡同层：toast 是全局旁白（pointer-events:none 不挡点），题屏上的重连报因等语从前被 #boot(z:100) 盖住 */
#peek{position:absolute;z-index:26;pointer-events:none;max-width:272px;padding:9px 12px;font-size:var(--fs-sm);line-height:1.6;color:#dccf9f;display:none}
#peek b{color:#f4e6b8}
@media (max-width:600px){ #title{font-size:var(--fs-lg);letter-spacing:2px} .nlabel{font-size:var(--fs-xs)} .nlabel.t1{font-size:var(--fs-md)} }
.nlabel.drl{font-size:var(--fs-xs);color:var(--paper);opacity:.85;transform:translate(-50%,-165%)}
.nlabel.tier12{font-size:var(--fs-xs);color:var(--paper);opacity:.8;letter-spacing:2.5px;text-shadow:0 0 8px rgba(20,14,34,.9),0 1px 3px #000;pointer-events:none}
.nlabel.tier12.bcap{pointer-events:auto;cursor:pointer;font-size:var(--fs-md);opacity:.94;padding:7px 10px}
.nlabel.tier12.bcap.on{font-size:var(--fs-lg);opacity:1;text-shadow:0 0 14px currentColor,0 1px 4px #000}
.nlabel.cap4{font-size:var(--fs-sm);color:var(--gold-hi);opacity:.9;letter-spacing:3px}
.nlabel.drl.cur{font-size:var(--fs-md);color:#ffe9a8;opacity:1;text-shadow:0 0 12px rgba(215,170,69,.85),0 1px 4px #000}
`;

/* ── 行谱菜单 · 极简 ──
   当前行处先交代上下文；高频入口成两列大触点，低频设置收成细行，危险操作独立沉底。 */
css.textContent += `
.smPanel{width:min(500px,92vw)}
.smPanel>h2{margin-bottom:12px;letter-spacing:5px}
.smPanel .body{display:grid;gap:14px;align-content:start}
.smStat{display:grid;gap:4px;padding:14px 15px;border:1px solid rgba(215,170,69,.14);border-radius:12px;
  width:100%;box-sizing:border-box;font:inherit;text-align:left;cursor:pointer;
  background:rgba(255,255,255,.025);line-height:1.5}
.smStat:hover,.smStat:focus-visible{border-color:rgba(215,170,69,.4);background:rgba(215,170,69,.06)}
.smStat span,.smLabel{color:#817967;font-size:var(--fs-xs);letter-spacing:2px}
.smStat b{color:#e7d9b3;font-size:var(--fs-md);font-weight:500;letter-spacing:2px}
.smStat i{font-style:normal;color:var(--note);font-size:var(--fs-sm);letter-spacing:1px}
.smSection{display:grid;gap:7px}
.smGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.smList{display:grid;align-content:start;line-height:1.35;border-top:1px solid rgba(215,170,69,.1)}
.smRow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;line-height:1.35;
  border:1px solid transparent;border-radius:10px;padding:11px 12px;cursor:pointer;
  font-family:inherit;color:#e8e2d0;min-height:46px;box-sizing:border-box;transition:background .16s,border-color .16s}
.smGrid .smRow{display:grid;align-content:center;gap:5px;min-height:78px;background:rgba(255,255,255,.03);
  border-color:rgba(215,170,69,.14)}
.smGrid .smRow:last-child:nth-child(odd){grid-column:1/-1;min-height:64px}
.smList .smRow{border-radius:0;border-bottom-color:rgba(215,170,69,.1);background:none}
.smRow:hover,.smRow:active{background:rgba(232,199,102,.09);border-color:rgba(232,199,102,.28)}
.smRow b{font-size:var(--fs-md);font-weight:600;letter-spacing:2px;color:#f0dfa8;flex:none}
.smRow i{font-style:normal;font-size:var(--fs-xs);color:#8f8774;letter-spacing:1px;
  flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.smList .smRow i{text-align:right}
.smDanger{padding-top:2px}
.smRow.warn{min-height:42px;background:none;border-color:transparent}
.smRow.warn b{color:#b9ae93;font-weight:500}
.smRow.arm{background:rgba(176,90,66,.16)}
.smRow.arm b,.smRow.arm i{color:var(--woe-tx)}
.smPanel .gbtn.primary{width:100%;padding:13px 0;letter-spacing:3px}
/* 抓手条：手机底部抽屉态才现 */
.panel .grab{display:none}
@media (max-width:520px){
  /* 底部抽屉：从拇指区升起，贴底不居中 */
  .overlay.ovsheet{align-items:flex-end}
  .overlay.ovsheet .panel{max-width:100vw;width:100%;border-radius:16px 16px 0 0;
    height:auto;max-height:84dvh;border:1px solid rgba(215,170,69,.28);border-bottom:none;
    padding:8px 16px calc(16px + env(safe-area-inset-bottom));animation:pnUp .26s cubic-bezier(.2,.8,.25,1)}
  .overlay.ovsheet .ovClose{top:14px;right:14px}
  .overlay.ovsheet .panel .grab{display:block;height:18px;position:relative;margin:-6px 0 2px}
  .overlay.ovsheet .panel .grab::after{content:'';position:absolute;left:50%;top:7px;width:42px;height:4px;
    border-radius:2px;background:rgba(215,170,69,.45);transform:translateX(-50%)}
  .smPanel .body{gap:11px}.smGrid .smRow{min-height:70px;padding:10px}
}
`;
css.textContent += Plaza.PLAZA_CSS + CHALOU_CSS + Plaza.PEER_WIN_CSS + ICON_CSS; // 共修大厅、茶寮、同修成佛横幅与图标样式随主样式一并注入（阅读器已迁独立页面，皮在 src/reader-page.css）
document.head.appendChild(css);

function el(html        )              {
  const t = document.createElement('div'); t.innerHTML = zh(html.trim());
  return t.firstElementChild               ;
}
// 右上角常驻大厅入口：进出共修是主干节点，不该藏在底部控制台或二级菜单里。
// 题字（左）＝观照全图，大厅（右）＝进出共修，一屏两角各管一件事。
const topbar = el(`<div id="topbar" class="ui">
  <div id="title">十法界须弥山世界 <span style="font-size:var(--fs-xs);color:#d7aa45;opacity:.85">⊙</span></div></div>`);
app.appendChild(topbar);
// 题字即全图观照入口；题屏仍留给开局引导，「选佛」钮负责开始或续掷。
const titleEl = topbar.querySelector('#title')               ;
titleEl.style.cursor = 'pointer';
titleEl.addEventListener('click', () => browseMapMode()); // v258 用户点单：点题字直切观照全图（题屏仍留给开局引导）；v312 符号 ⌄→⊙（⌄暗示下拉而行为是观照，语义勘正）
titleEl.title = '观照全图（一人行谱存局退出；共修中只拉远，本局仍在）';

// 罗盘已撤（极简屏，用户点单）：死代码清除——按遗留坐标重挂会紧贴顶栏两钮（52px vs 58px），复用须重算

const freeDock = el('<div id="freeDock" class="ui"></div>');
app.appendChild(freeDock);
// 共修回局：本机不留联机棋况（sfpSave 遇 Net.active 即早退），故一律按服务器快照回位。
// 挂实见「联机接线」段；未在座或本局不在进行时返回 false，由本机存局链路接手。
let netRejoin = ()          => false;
const quickSfp = el('<button class="gbtn primary" style="border-radius:24px;padding:13px 30px;font-size:var(--fs-lg);letter-spacing:3px">选佛</button>');
quickSfp.addEventListener('click', () => { // 共修在座＝回局中；否则有存局直接续掷，无则入大厅（一钮一义）
  if (netRejoin()) return;
  if (save.sfp && SFP_BY[save.sfp.pos]) startSfp(true); else openPlaza();
});
freeDock.appendChild(quickSfp);
// 底坞主钮一钮一义：有存局说「续掷」，没有才说「选佛」（大厅入口已移至右上角）
function syncFreeDock() {
  if (Net.active && Net.isPlaying()) { // 共修局中：钮即回局中（本机存局与本局无关，不得据以标名）
    quickSfp.textContent = zh('回局中');
    quickSfp.title = zh('回到共修局中（棋况以共修室为准）');
    return;
  }
  const resume = !!(save.sfp && SFP_BY[save.sfp.pos]);
  quickSfp.textContent = zh(resume ? '续掷' : '选佛');
  quickSfp.title = zh(resume ? `续上局：现居「${SFP_BY[save.sfp.pos].name}」` : '共修大厅 · 一人可自修，莲友来即共修');
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
// 右上角两枚常驻去处：「大厅」＝公共面（共修），「我的」＝个人面（功课）。
// 两者平级，故并排；不把「我的」塞进大厅——那会让个人面成为公共面的子页，语义拧了。
// 题字与状态小签在左，两枚去处在右，一屏两端各管一件事。
// 两枚去处：图标在前、字在后；窄屏收起字只留形（aria-label 仍在，读屏与长按提示不受影响）
const hallBtn = el(`<button id="hallBtn" class="ui gbtn" aria-label="共修大厅" title="共修大厅 · 一人可自修，莲友来即共修">${ico('hall')}<span class="btTx">大厅</span></button>`)                     ;
hallBtn.addEventListener('click', () => { playSfx('sfx-tap', 0.22); openPlaza(); });
topbar.appendChild(hallBtn);
const mineBtn = el(`<button id="mineBtn" class="ui gbtn" aria-label="我的功课" title="我的功课 · 日历 · 原文与设置">${ico('person')}<span class="btTx">我的</span></button>`)                     ;
mineBtn.addEventListener('click', () => { playSfx('sfx-tap', 0.22); openMine(); });
topbar.appendChild(mineBtn);

// 卡壳次序（v3）：名 → 类标 → 词头·正文·关联 → 操作 → 同层翻页。
// 归一前 cardBtns 夹在卡名与正文之间，读者要先跨过两个按钮才见第一句话——
// 操作是读完之后的事，不该插在名与义中间。
const card = el(`<div id="card" class="panel sheet">
  <div class="sheetGrip"></div>
  <div id="cardHead">
    <div><div id="cardKicker"></div><div id="cardName"></div><div id="cardSub"></div></div></div>
  <div id="cardTags"></div>
  <div id="cardBody" class="body"></div>
  <div id="cardBtns"></div>
  <div id="cardNav" class="cardNav" style="display:none"></div></div>`);

const toast = el('<div id="toast" class="ui"></div>');
app.appendChild(toast);
let toastTimer = 0;
// 排队防覆盖（2026-08-12 批）：来人＋房主易主等连发时，从前后到直接吞先到——
// 今改小队列：有后续时当前条压缩至 1.6s，淡隐一口气后放下一条；连发同文去重，积压逾三条丢最旧。
const toastQ                                   = [];
let toastBusy = false;
function toastPump() {
  if (toastBusy || !toastQ.length) return;
  const { msg, ms } = toastQ.shift()      ;
  toastBusy = true;
  toast.style.pointerEvents = 'none'; toast.style.cursor = ''; // 默认不可点（同修播报单独开）
  toast.textContent = zh(msg); toast.style.opacity = '1';
  const hold = toastQ.length ? Math.min(ms, 1600) : ms;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.style.opacity = '0';
    window.setTimeout(() => { toastBusy = false; toastPump(); }, 260);
  }, hold);
}
// 即时换话（2026-08-14，门签门义提示所用）：「当前所指」型提示后点立换前话——
// 排队制只适合互不相干的播报；门3 长义九秒占屏，门8 的话排队一秒六才上，指东话西。
function showToastNow(msg        , ms = 2600) {
  toastQ.length = 0;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
  toastBusy = true;
  toast.style.pointerEvents = 'none'; toast.style.cursor = '';
  toast.textContent = zh(msg); toast.style.opacity = '1';
  toastTimer = window.setTimeout(() => {
    toast.style.opacity = '0';
    window.setTimeout(() => { toastBusy = false; toastPump(); }, 260);
  }, ms);
}
// v393 即刻收话：话说到一半而其所指已撤时（如门义正报着、门却被收拢），
// 该让它当场淡去，而不是另说一句「已收拢」把它顶掉——收起本是无声的事。
function hideToast() {
  toastQ.length = 0;
  if (!toastBusy) return;
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
  toast.style.opacity = '0';
  window.setTimeout(() => { toastBusy = false; toastPump(); }, 260);
}
// 教学句全撤（2026-08-15 发起人定「提示语三刀」）：逻辑既极简，画面自明处不出说明书——teachOnce 机制随之退役。
function showToast(msg        , ms = 2600) {
  if (toastQ.length && toastQ[toastQ.length - 1].msg === msg) return;
  toastQ.push({ msg, ms });
  if (toastQ.length > 3) toastQ.shift();
  toastPump();
}

// ── 站内确认卡 ──
// 取代 window.confirm：原生弹窗与全站自绘卡片调性割裂，手机上尤其突兀，且不受简繁转换管辖。
// 自成一层（不走 overlay），所以身后的大厅或同修面板不会被顶掉，取消即原样回去。
const confirmEl = el(`<div id="sfpConfirm" class="ui"><div class="cfCard" role="dialog" aria-modal="true" aria-labelledby="cfT">
  <h3 id="cfT"></h3><div class="cfBody"></div>
  <button class="gbtn primary" id="cfOk"></button><button class="gbtn" id="cfNo"></button></div></div>`);
// 挂 body 而非 #app：#app 是 position:fixed 的层叠上下文，其内 z-index 再高也压不过
// body 下 z:32 的同修面板——局中点「离席」，确认卡被面板整个盖住（用户 2026-08-12 报）。
document.body.appendChild(confirmEl);
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
  // noText 传空＝单钮告知卡（无可否之事，只须「知道了」）：取消钮整枚隐去，
  //   否则留一枚无字空钮，且焦点还落在它上面。焦点随之改投确定钮。
  const noBtn = (confirmEl.querySelector('#cfNo')               )                     ;
  noBtn.textContent = zh(noText);
  noBtn.hidden = !noText;
  confirmEl.classList.add('on');
  setTimeout(() => (confirmEl.querySelector(noText ? '#cfNo' : '#cfOk')                      )?.focus(), 60);
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

// 局中离席只让出自己的座：其余同修照常续行（v396 起室内剩一人亦可续局），
// 唯室内无人续行时本局方收。换室与「离席」钮一律先问这一句。
function confirmLeaveMatch(what        )                   {
  if (!Net.active || !Net.isPlaying()) return Promise.resolve(true);
  const stillIn = Net.room.order.filter(id => !Net.players.find(p => p.id === id)?.done).length;
  const body = stillIn <= 1
    ? '您一走，本局无人续行，<b>这一局就此收去</b>。'
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
const cardKicker = card.querySelector('#cardKicker')               ;
const cardSub = card.querySelector('#cardSub')               ;
const cardTags = card.querySelector('#cardTags')               ;
const cardBtns = card.querySelector('#cardBtns')               ;
const cardBody = card.querySelector('#cardBody')               ;
const cardNav = card.querySelector('#cardNav')               ;

function esc(s        ) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); } // 引号也转：esc 结果常落入属性位（data-code/style 等），收窄注入面

/* ══ 卡制总纲 v3（2026-08-08 发起人定案）══════════════════════════════════════
   一张卡只有三段：**词头 · 正文 · 关联**。这不是新发明的框架，是文本自己的骨架——
   《選佛譜》每一位下面一段谱注，前半讲这名目什么意思（义解），后半讲掷什么去哪（行法）；
   前面冠以位名与所属门。名·义·行，如是而已。

   v2 的「三问」（这位在修什么／怎么到这位／从这位往哪）今撤。三问本是为处所卡设计的：
   一个地方有位置、有居民、有景象，三问天然成立。位不是地方，是修行阶位——阶位没有
   「光景」，也没有「怎么来的」（谁掷到都一样来，判词卡刚说过）。槽位固定而无料可填，
   就只能注水：v2 的位卡第②问答「全谱 34 位可掷入此位」，正是凑数凑出来的。
   「词头·正文·关联」不设固定槽位，有几段填几段，五种卡型皆能罩住：
     位＝位名·门／义解／升降行法　　处所＝地名·界／简介·界相／此处谱位
     门＝门名／门义／位次一览　　　　辅标＝标名／释义／所属处所　　段签＝段名／释义／所属门

   文白不再分两层：卡上一枚切换，白话与逐字原文原地对调（旧制的深读页整层已撤）。
   关联段超过 CARD_REL_MAX 项才折叠——折叠是例外，不是常态。 */
const CARD_ROW_MAX = 7;   // 正文明细行：超此数者余行折叠
const CARD_REL_MAX = 3;   // 关联项：超此数者整段折叠，三项以内直陈
let cardCanon = false;    // 文白态（会话级全局）：true＝逐字原文，false＝白话。一处切、处处同。
function cardRowHtml(r         )         {
  return `<div class="nRow">${r.k ? `<div class="k">${esc(r.k)}</div>` : ''}<div class="b"><div class="v">${glossify(esc(r.v))}</div>${r.src ? `<div class="cs">${esc(r.src)}</div>` : ''}</div></div>`;
}
// 出处按书目归并：书名一行领起，其下列各引——同书不再重印书名
// cardCiteHtml（底部「出处」抽屉，按书目归并）已撤：出处今随其原文段走（canon[].src），
//   一段原文一个出处，就地可见；旧制把全卡引文再归并一遍另开抽屉，是同一批文字的第二个入口。
// 统一出口：五种卡型唯一的 body 生成处——词头 · 正文 · 关联，段序与层级从此不可能各自跑偏。
//   卡对象规格：{ kind, id, name, head[], body[], canon[], rel? }
//     head  词头小字，'字符串' 或 { t, go } 可点项（门名入门卡、法界名入处所卡）
//     body  白态正文：{ v } 作段落、{ k, v, src? } 作明细行
//     canon 文态正文：{ tag, text, src }，逐字原文，走占位回填（不可过 zh() 折简）
//     rel   关联段：{ k, html, n }——n 为项数，超 CARD_REL_MAX 才折叠
// 白话正文一副形状：段落 → 明细行 → 他经补注段。卡壳 renderEntry 与详读卡共用此函数，
//   两处若各写一遍，日后改一处必漏一处。
//   次序有讲究：补注须在明细行之后（2026-08-08 发起人定），而 body 里段落与明细行本是混排的，
//   故此处按 kind 分三批渲染，不依数组原序。
function plainBodyHtml(body        , rowMax         = CARD_ROW_MAX)         {
  const arr = ((body || [])         ).filter((x     ) => x && (x.v || x.k));
  const rows = arr.filter((x     ) => x.k);
  let h = '';
  // kind:'note'＝如实告白（如门1/2/15「原谱无此门总说，以下系自撰导语」）。
  //   与正文分明但不喧宾——它是实话，不是警告；同阅读器 .rdGap 之意。
  arr.filter((x     ) => !x.k && x.kind === 'note').forEach((x     ) => { h += `<div class="cGap">${esc(x.v)}</div>`; });
  arr.filter((x     ) => !x.k && !x.kind).forEach((x     ) => { h += `<div class="qp">${glossify(esc(x.v))}</div>`; }); // 白话带浮标：难词点开即释
  h += rows.slice(0, rowMax).map(cardRowHtml).join('');
  if (rows.length > rowMax) h += `<details class="cMore"><summary>余 ${rows.length - rowMax} 项</summary>${rows.slice(rowMax).map(cardRowHtml).join('')}</details>`;
  // 他经补注：谱主说得简处从别经补足者三十条（如九品往生补《觀經》的「什么样的人生这一品」、
  //   〈四燄慧地〉补《成唯識論》节引时略去的「慧焰增故」）。独立成段、段题标所引书名——
  //   先前混作 { k:'补注' } 与谱主的话并排，多条时行标全是「补注」二字，看不出引的哪部书。
  arr.filter((x     ) => !x.k && x.kind === 'ext').forEach((x     ) => {
    h += `<div class="cExt">${x.src ? `<div class="ctag">${esc(x.src)}</div>` : ''}`
      + `<div class="v">${glossify(esc(x.v))}</div></div>`;
  });
  return h;
}
function renderEntry(o         )         {
  let h = '';
  // ① 词头：门/界/位次等元数据一律收在此，正文只讲义理
  const head = ((o.head || [])         ).filter(Boolean);
  if (head.length) {
    h += `<div class="cbMeta">` + head.map((x     , i        ) => (typeof x === 'string'
      ? esc(x)
      : `<span class="lnk" data-hg="${i}">${esc(x.t)} ›</span>`)).join(' · ') + `</div>`;
  }

  // ② 正文：白态与文态同一段位原地对调，不另开一层
  const body = ((o.body || [])         ).filter((x     ) => x && (x.v || x.k));
  const canon = ((o.canon || [])         ).filter((x     ) => x && x.text);
  const showCanon = cardCanon && canon.length;
  if (body.length || canon.length) {
    h += '<div class="cSec">';
    // 文白开关置于正文之首、词头之下：位置恒定（不随正文长短浮动）、状态自明（当前态点亮）、
    //   读之前就能选。旧制置于段末右下角，想读原文的人得先滑过整段白话才发现有这一枚，
    //   且它随正文高度上下漂，每张卡都在不同位置。两态皆有料才出——只有一面时切了是空卡。
    if (body.length && canon.length) {
      h += `<div class="cSwapBar"><span class="cSwap${showCanon ? '' : ' on'}" data-m="plain">白话</span>`
        + `<i>·</i><span class="cSwap${showCanon ? ' on' : ''}" data-m="canon">原文</span></div>`;
    }
    // 本掷段（2026-08-12 上午加、当日下午撤）：它曾在此呈「来处 · 轮相 → 落处 · 白话说明 · 正本」。
    //   撤的缘由是发起人一句话点破的：那三行说的是**这一掷**，不是**这一位**——而这一掷的判词
    //   判词卡上刚看过，一字不差；位卡再复述一遍，等于同一句话在一屏之内说两遍。
    //   更露怯的是那行去向条尾巴上的落处位名，与卡题逐字相同，读者一眼看见自己的名字写了两回。
    //   撤掉之后位卡只答一件事——「这一位是什么」，故「详读」与任何一处点位名进来，所见皆同一张卡。
    if (o.kind === 'pos') h += `<div class="cSectionK">${showCanon ? '谱曰原文' : '本位义解'}</div>`;
    if (showCanon) {
      h += canon.map((c     , i        ) => `<div class="cCanon">${c.tag ? `<div class="ctag">${esc(c.tag)}</div>` : ''}`
        + `<div class="ctext" data-cn="${i}"></div>${c.src ? `<div class="cs" data-cs="${i}"></div>` : ''}</div>`).join('');
    } else {
      // 门卡不折明细行（2026-08-12 发起人点单「放宽」）：门义那几行是「何以稱惡」这类逐问逐答，
      //   一行一问，本就是要通读的一份；折起来反而把门14（十三行·四土各摄何位）拦腰截断。
      //   余卡型仍守 CARD_ROW_MAX=7——位卡明细行是同类项罗列，多则宜折。
      h += plainBodyHtml(body, o.kind === 'door' ? Infinity : CARD_ROW_MAX);
    }
    h += '</div>';
  }

  // ③ 关联：升降行法／此处谱位／位次一览／所属处所——三项以内直陈，多则折叠
  const rel = o.rel         ;
  if (rel && rel.html) {
    // k 由 provider 写全（含量词），此处只据 n 定折不折——段名上的数字须与展开后实见的行数相符
    h += (rel.n > CARD_REL_MAX)
      ? `<details class="cRel"><summary>${esc(rel.k)}</summary>${rel.html}</details>`
      : `<div class="cRelOpen"><div class="qk">${esc(rel.k)}</div>${rel.html}</div>`;
  }
  return h;
}
// 原文显示态：简体态折简、繁体态原字。逐字引文一律走占位回填——
//   el() 会对整串跑 zh()，原文若随 innerHTML 一同过去就被折简了，校勘即失据。
function rawShow(t        )         { return save.zh === 't' ? t : zhWith(t, ZH_T2S, ZH_MAXLEN.s); }
function fillRaw(root      , o         ) {
  const canon = ((o && o.canon) || [])         ;
  root.querySelectorAll('[data-cn]').forEach((e2) => {
    const c = canon[+((e2               ).dataset.cn || '-1')];
    if (c) e2.textContent = rawShow(c.text);
  });
  root.querySelectorAll('[data-cs]').forEach((e2) => {
    const c = canon[+((e2               ).dataset.cs || '-1')];
    if (c && c.src) e2.textContent = c.src; // 出处是本项目所写，不是逐字经文，照常折简
  });
}
// 深读页（openReadPage）已撤（2026-08-08）：它是一整层界面——三态切换＋原字开关＋分段对照，
//   而位卡的 read 只有一段，为一段内容开一整页，配重完全不对。文白对照之职今归卡上一枚切换，
//   原地对调，层级由两层收成一层。校勘用的「原字」逐字态仍在谱文页（openDoor 文态）可得。

// place provider（移植线上 V106 v474/v475）：节点卡走统一出口——
//   料全取现成真源，一字不新造：line／SFP_CAUSE／KOSA_ROWS／profile／figures／citations。
//   ① 这是哪＝简介（极乐等以经文原句充简介者，由 SFP_PLACE_PLAIN 覆一句白话——
//      第①问的职责是让人一眼看明白这是哪，读者不该在第一行先读古文，原引文移入深读页对读）；
//   ② 怎么生到这＝何因生此（器世间无受生之事，改问「因何成此」，答俱舍「亦諸有情業增上力」）；
//   ③ 这里什么光景＝方位·高下·经量·界相·众相，逐条一行。
function placeCardObj(d     , navHtml        , navN         = 0)          {
  const cz = (SFP_CAUSE       )[d.id];
  const kr = ((KOSA_ROWS       )[d.id] || [])         ;
  const kSet = new Set(kr.map((r     ) => r.k));
  const rows            = [];
  if (d.bear) rows.push({ k: '方位', v: d.bear });
  if (d.elev) rows.push({ k: '高下', v: d.elev });
  kr.forEach((r     ) => rows.push({ k: r.k, v: r.v }));
  ((d.profile         ) || []).filter((x     ) => !kSet.has(x.k)).forEach((x     ) => rows.push({ k: x.k, v: x.v, src: x.src }));
  ((d.figures         ) || []).forEach((f     ) => rows.push({ k: f.name, v: f.note }));
  const read            = [];
  const pl = (SFP_PLACE_PLAIN       )[d.id];
  if (pl) read.push({ tag: '经证 · 此名之出', canon: pl.canon, plain: pl.v, src: pl.src });
  const ves = (SFP_VESSEL       )[d.id];
  if (ves) ((ves.read || [])         ).forEach((r     , i        ) => read.push({ tag: r.tag, canon: r.canon, plain: i === 0 ? ves.v : '', src: r.src }));
  if (cz) {
    const q = ((cz.q || [])         ).filter(Boolean).join('');
    if (q) read.push({ tag: '谱曰', canon: q, plain: cz.v, src: '《選佛譜》' + cz.qs });
    if (cz.sq) read.push({ tag: '经证', canon: cz.sq, src: cz.ss });
  }
  kr.forEach((r     ) => {
    const Q = (KOSA_Q       )[r.qid];
    if (Q) read.push({ tag: '经证 · ' + r.k, canon: Q.q, plain: r.v, src: Q.s });
  });
  // 何因生此／因何成此：器世间无受生之事，其成由「諸有情業增上力」，与有情之受生不同科，
  //   但同属「这地方缘何而有」一事，今不再各占一问，接在简介之后作第二段白话。
  const cause = cz ? cz.v : ves ? ves.v : (d.cause ? d.cause.v : '');
  const body            = [{ v: pl ? pl.v : d.line }];
  if (cause) body.push({ v: cause });
  rows.forEach((r     ) => body.push(r));
  return {
    kind: 'place', id: d.id, name: d.name,
    // 处所卡的壳已有胶囊标（群·界·坐标据），词头不再重印一遍——同一件事一屏只说一次。
    head: [],
    body,
    canon: read.map((r     ) => ({ tag: r.tag, text: r.canon, src: r.src })),
    rel: navHtml ? { k: `此处谱位 · ${navN} 位`, html: navHtml, n: navN || 0 } : null,
  };
}
// aux provider（移植线上 V106 v475）：辅标 22 枚（四天王·四层级天·七金山·三轮与大地·善见城·金刚座·月·星宿）
//   本地此前辅标只是标签、点了只跳所属处所；今各有自己的卡，释义＋逐字经据。
//   旧制的 cites 是拿正则从 src 字符串里反解书名卷号（一旦写法有变体就解出脏字），
//   今出处随原文段走（canon[].src），不再二次解析。
function auxCardObj(name        )                  {
  const e = ((SFP_AUX       )[name]);
  if (!e) return null;
  const pn = byId[e.parent] ? byId[e.parent].d.name : '';
  const rd = ((e.read || [])         );
  const body            = [];
  if (e.q1) body.push({ v: e.q1 });
  if (e.q2) body.push({ v: e.q2 });
  ((e.q3 || [])         ).forEach((r     ) => body.push({ k: r.k, v: r.v }));
  return {
    kind: 'aux', id: 'aux:' + name, name,
    head: [pn ? { t: pn, go: () => selectNode(e.parent) } : ''].filter(Boolean),
    body,
    canon: rd.map((r     ) => ({ tag: r.tag, text: r.canon, src: r.src })),
    rel: null, // 所属处所已在词头可点，不另立一段
  };
}
// ── 统一开卡：五种卡型共一副壳 ────────────────────────────────────────────────
// 归一前四个开卡函数（aux/tenet/door/pos）各自把 cardName/cardSub/cardTags/cardBtns/cardNav
// 重写一遍，形状跑偏正是这么来的。今壳只此一处：各型只管在 provider 里出料、在 cfg 里给副题与按钮。
// paintEntry 单独抽出，是为文白切换只重绘正文——整卡重建会把滚动位置与折叠态一并弹掉。
function bindEntry(root      , o         , repaint          ) {
  ((o.head || [])         ).forEach((x     , i        ) => {
    if (!x || typeof x === 'string' || !x.go) return;
    const s = root.querySelector(`.lnk[data-hg="${i}"]`)                      ;
    if (s) s.addEventListener('click', () => { playSfx('sfx-tap', 0.25); x.go(); });
  });
  // 两枚并列各表一态，点即定态（非切换）——点已亮的那枚是空操作，不闪不跳
  root.querySelectorAll('.cSwap[data-m]').forEach((s) => s.addEventListener('click', () => {
    const want = (s               ).dataset.m === 'canon';
    if (want === cardCanon) return;
    playSfx('sfx-tap', 0.25); cardCanon = want; repaint();
  }));
}
function paintEntry(root      , o         , after                       ) {
  const again = () => paintEntry(root, o, after);
  root.innerHTML = zh(renderEntry(o));
  fillRaw(root, o);                       // 逐字原文走占位回填，不随 innerHTML 过 zh()
  bindEntry(root, o, again);
  if (after) after(root);
}
function mountEntry(o         , cfg      = {}) {
  if (selectedId && byId[selectedId] && cfg.keepSel !== true) byId[selectedId].label.classList.remove('sel');
  if (cfg.keepSel !== true) selectedId = null;
  cardName.textContent = zh(o.name);
  card.dataset.kind = o.kind || 'entry';
  card.dataset.pid = o.id || ''; // 供名相浮标自指守卫：已在本位卡上，点自己的名字不再重开本卡
  // 词眉「谱位详解／界相／图中辅标／位次段」撤于 2026-08-12（发起人点单「极简，只说必要的」）：
  //   它报的是卡的**类别**，而读者是自己点进来的，本就知道点的是什么；那一行不含关于
  //   这一位（这一处、这一标）的任何消息，却占着卡题之上最醒目的一行。
  //   其下的词头行（门名／所属处所／所属门）本就把身份说清了——同一件事，留说得实的那一句。
  //   cfg.kicker 仍留：日后若有卡需在题上另题一句实话（不是类别名），此口还在。
  cardKicker.textContent = zh(cfg.kicker || '');
  cardKicker.style.display = cfg.kicker ? '' : 'none';
  cardSub.textContent = zh(cfg.sub || '');
  cardTags.innerHTML = cfg.tags ? zh(cfg.tags) : '';
  cardBtns.innerHTML = '';
  ((cfg.btns || [])         ).forEach((b     ) => cardBtns.appendChild(b));
  cardNav.innerHTML = '';
  const nav = (cfg.nav || [])         ;
  cardNav.style.display = nav.length ? 'flex' : 'none'; // 无同层翻页者空容器不占高
  nav.forEach((b     ) => cardNav.appendChild(b));
  paintEntry(cardBody       , o, cfg.afterPaint);
  // 返程回调必须挂在 openOverlay **之后**：openOverlay 头一件事是 closeOverlay()（一屏一窗），
  //   而 closeOverlay 会取出并执行 overlayOnClose。若先赋值，本层的返程回调会在自己这张卡
  //   还没挂上时就被误发——f() 开出新层，递归返回后外层继续 overlayEl = el(...) 把新层的句柄
  //   覆盖掉，那一层遂成孤儿，✕／Esc／点背景全关不掉。同 selectNode 与 openDoor 之例。
  overlayOnClose = null;
  openOverlay(card);
  overlayOnClose = cfg.onClose || null;
  cardBody.scrollTop = 0;
}
function openAuxCard(name        ) {
  const o = auxCardObj(name);
  if (!o) return;
  const e = ((SFP_AUX       )[name]);
  const pn = byId[e.parent] ? byId[e.parent].d.name : '';
  // 副题撤（2026-08-12 同位卡之例）：「辅标」复述词眉「图中辅标」，所属处所又已在词头可点，
  //   整条无一字新料。辅标不入收藏（收藏册以处所与谱位为单位）。
  void pn;
  mountEntry(o, {});
}
(window       ).__auxCard = (n        ) => { openAuxCard(n); return !!(SFP_AUX       )[n]; }; // 自测入口
// tenet provider（移植线上 V106 v475）：段签 10 枚＝菩萨法界场内十科组题字
//   （慧学·藏教·通教／别教六科／圆教六即）——与本地 BODHI_GRPS 十科同名同序。
function tenetCardObj(name        )                  {
  const e = ((SFP_TENET       )[name]);
  if (!e) return null;
  const dt = SFP_DOOR_BY[e.door];
  const rd = ((e.read || [])         );
  const body            = [];
  if (e.q1) body.push({ v: e.q1 });
  if (e.q2) body.push({ v: e.q2 });
  ((e.q3 || [])         ).forEach((r     ) => body.push({ k: r.k, v: r.v }));
  return {
    kind: 'tenet', id: 'tenet:' + name, name,
    head: [dt ? { t: `第${SFP_CN[e.door - 1]}门 · ${dt.title}`, go: () => { closeOverlay(); openDoor(e.door); } } : ''].filter(Boolean),
    body,
    canon: rd.map((r     ) => ({ tag: r.tag, text: r.canon, src: r.src })),
    rel: null, // 所属门已在词头可点
  };
}
function openTenetCard(name        ) {
  const o = tenetCardObj(name);
  if (!o) return;
  mountEntry(o, { sub: '菩萨法界' }); // 副题即其身份（词眉已于当日撤，见 mountEntry）
}
(window       ).__tenetCard = (n        ) => { openTenetCard(n); return !!(SFP_TENET       )[n]; }; // 自测入口
function renderCard() {
  if (!selectedId) return;
  const nv = byId[selectedId]; const d = nv.d;
  card.dataset.kind = 'place'; cardKicker.textContent = ''; cardKicker.style.display = 'none'; // 词眉同撤（见 mountEntry）
  cardName.textContent = zh(d.name); cardSub.textContent = zh(d.sub || '');
  // 「坐标据」第三枚胶囊标撤（2026-08-08 发起人点单）。核过：
  //   ·「依经有处」占 55 节点中的 46 个——标签只标例外，不标常态，说了等于没说；
  //   ·「非方所摄」那 9 个（四空天与四圣法界）也不必——它们的方位行本就写着
  //     「无方所（图位仅为教学惯例）」「非方所 · 金轨示意」，在正文里说得比一枚标更清楚且有上下文。
  //   COORD_KIND_LABEL 仍留给筛选面板的「坐标类型」——在那里它是检索维度，不是卡面装饰。
  cardTags.innerHTML = zh(`<span class="tag">${d.group}</span><span class="tag">${d.sphere}</span>`);
  // 收藏并入词头标签行，与「群组」「界」并列（详见 .tagFav 样式处的缘由）
  const fav = favSet.has(d.id);
  const favB = el(`<button class="tag tagFav${fav ? ' on' : ''}" aria-pressed="${fav}">${fav ? '★ 已收藏' : '☆ 收藏'}</button>`);
  favB.addEventListener('click', () => toggleFav(d.id));
  cardTags.appendChild(favB);
  // 按钮区只余真动作按钮（进入色界诸天／极乐世界）；无则 #cardBtns:empty 自隐
  cardBtns.innerHTML = '';
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
  if (d.id === 'bodhi' && !inBodhi) { // 2026-08-13 单击改开卡后，卡上须有「进入」——与色界/极乐同例
    const go = el('<button class="gbtn primary">进入菩萨道场</button>');
    go.addEventListener('click', () => enterBodhiTransit());
    cardBtns.appendChild(go);
  }
  // 关联段「此处谱位」：锚在本节点的谱位，点芯片卡内就地展开譜曰，不跳转。
  // v365 极简：多位锚（菩萨法界 66 位）芯片区限高内滚（.chipScroll），免一段吃掉整卡
  const posHere = (SFP_AT[d.id] || [])         ;
  const atCur = sfpS.active && !!sfpS.pos && posHere.some((p     ) => p.id === sfpS.pos);
  let secSfp = '';
  if (posHere.length) {
    let sh = '';
    // 十五门分段小标已撤（2026-08-14 发起人点单）：芯片平铺即可——所属门在点开的弹注里
    // 本就写着（「门题 · 位名」），分段标题在此只是重复的导航噪音。
    posHere.forEach((p     ) => {
      sh += `<span class="sfpChip${sfpS.pos === p.id ? ' cur' : ''}" data-pid="${esc(p.id)}">${esc(p.name)}</span>`;
    });
    sh += `<div id="inNote" class="inlineNote"></div>`;
    secSfp = (posHere.length > 18 ? `<div class="chipScroll">${sh}</div>` : sh);
  }
  const cObj = placeCardObj(d, secSfp, posHere.length)         ;
  if (cObj.rel && atCur) cObj.rel.k += ' · 现居';
  paintEntry(cardBody       , cObj, (root      ) => {
    root.querySelectorAll('.sfpChip').forEach(ch => ch.addEventListener('click', () => {
      const pid = pidOf((ch               ).dataset.pid);
      const box = root.querySelector('#inNote')               ;
      const was = ch.classList.contains('sel');
      root.querySelectorAll('.sfpChip').forEach(c => c.classList.remove('sel'));
      if (was || !pid || !SFP_BY[pid]) { box.style.display = 'none'; box.innerHTML = ''; return; }
      ch.classList.add('sel');
      const p = SFP_BY[pid];
      box.style.display = 'block';
      box.innerHTML = zh(`<div style="font-size:var(--fs-xs);color:#d7aa45;letter-spacing:1px">${esc(SFP_DOOR_BY[p.door].title)} · ${esc(p.name)}${p.pure ? ' · 净土' : ''}</div>
        <div class="verse">${verseHtml(p.note)}</div>
        <button class="gbtn" id="inLoc" style="font-size:var(--fs-sm);min-height:32px;padding:4px 12px">定位此珠</button>`);
      (box.querySelector('#inLoc')               ).addEventListener('click', () => { closeOverlay(); sfpLocate(pid); });
    }));
  });
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

// ---------------- 导览模式（2026-08-14 门面对调 · 教学线） ----------------
// 十七站自须弥总览沉入地狱、升经人天、出至四圣、终归极乐——顺序即教义（先知苦、次识升进、后明出离、末指归途）。
// 站站皆是既有节点卡（selectNode）：经证、出处、此处谱位全是现成真源，导览只出「线」与「腿」，一字不新造。
// 导览条 z:34 压在浮层纱（.overlay z:30）之上：卡开着时上一站/下一站仍可点，不必先关卡再走。
const TOUR_STOPS = ['sumeru', 'hell', 'preta', 'animal', 'asura', 'jambu',
  'caturmaharaja', 'trayastrimsa', 'tusita', 'paranirmita', 'rupa', 'arupa',
  'sravaka', 'pratyeka', 'bodhi', 'buddha', 'gate'];
const TOUR_DWELL = 15000;  // 自动巡游每站停留：读得完卡上一段经证的时长，不是幻灯片节奏
let deepVisit = (/^#v=([a-z0-9-]+)$/i.exec(location.hash || '') || [])[1] || ''; // 单站深链 #v=节点id（bootActivate 消化）
let tourOn = false, tourI = 0, tourAuto = false, tourT = 0;
let tourEl                     = null;
let tourWired = false;   // controls「start」驻足钩只挂一次（挂上后凭 tourOn 自守，退场不必拆）
function tourBar() {
  if (tourEl) return tourEl;
  // 导览台（2026-08-14 二改·极简，发起人点单）：一行无框字幕＋一枚小胶囊，不再整块压底。
  // 字幕行＝站标·站引一句·「读经证›」文字链（深读入口降为链，看景为主）；
  // 胶囊只五钮皆图标（✕ ‹ ▶ › 分享），无字无框内聚一体；窄屏卡开（底部抽屉在场）时暂避让位。
  const d = el(`<div id="tourBar">
    <div class="tgLine"><b id="tourPos"></b><span id="tourText"></span><u data-a="card" role="button" tabindex="0"></u></div>
    <div class="tgRow">
      <button data-a="exit" title="退出导览" aria-label="退出导览">✕</button>
      <button data-a="prev" title="上一站" aria-label="上一站">‹</button>
      <button data-a="auto"></button>
      <button data-a="next" title="下一站" aria-label="下一站">›</button>
      <button data-a="share" title="分享此站" aria-label="分享此站">${ico('share')}</button>
    </div>
  </div>`);
  const css = document.createElement('style');
  css.textContent = `
#tourBar{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);
  z-index:34;width:min(640px,94vw);display:flex;flex-direction:column;align-items:center;gap:8px;
  pointer-events:none;transition:opacity .25s ease,transform .25s ease}
/* 字幕行：无框浮字，靠投影立住（题屏字影同语汇）——底下是 3D 景，不再垫一块底色 */
#tourBar .tgLine{pointer-events:auto;max-width:100%;text-align:center;line-height:1.65;
  font-size:var(--fs-sm,12.5px);letter-spacing:.5px;color:#e9dcba;
  text-shadow:0 1px 4px rgba(4,10,14,.95),0 2px 14px rgba(4,10,14,.85),0 0 26px rgba(4,10,14,.6)}
#tourBar #tourPos{color:#e8c766;font-weight:600;margin-right:8px}
#tourBar u[data-a="card"]{margin-left:8px;color:#e8c766;text-decoration:none;border-bottom:1px dotted rgba(232,199,102,.55);
  cursor:pointer;white-space:nowrap}
/* 胶囊：一体一框，钮皆无框图标位 */
#tourBar .tgRow{pointer-events:auto;display:inline-flex;gap:2px;padding:4px;border-radius:13px;
  background:rgba(10,14,20,.78);border:1px solid rgba(216,197,139,.34);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 8px 26px -14px rgba(0,0,0,.85)}
#tourBar .tgRow button{min-width:42px;min-height:38px;padding:4px 8px;border:none;border-radius:10px;cursor:pointer;
  font-family:inherit;font-size:15px;color:#e9dcba;background:none;display:flex;align-items:center;justify-content:center}
#tourBar .tgRow button:hover{background:rgba(216,197,139,.12)}
#tourBar .tgRow button[data-a="auto"].on{color:#e8c766;background:rgba(232,199,102,.14)}
/* 驻足态 ▶ 轻呼吸相邀（交互即驻足之后，「续走」要被看见）；动效敏感者不扰 */
#tourBar .tgRow button[data-a="auto"].breath{animation:tgBreath 2.2s ease-in-out infinite}
@keyframes tgBreath{0%,100%{box-shadow:0 0 0 0 rgba(232,199,102,0)}50%{box-shadow:0 0 0 5px rgba(232,199,102,.14)}}
@media (prefers-reduced-motion:reduce){#tourBar .tgRow button[data-a="auto"].breath{animation:none}}
/* 行棋中：让位于底部行棋条，抬到其上 */
#tourBar.lift{bottom:calc(118px + env(safe-area-inset-bottom))}
/* 窄屏卡开（底部抽屉在场，html.ovOn 由浮层统一置起）：导览台暂避——读卡即驻足，收卡即回 */
@media (max-width:640px){html.ovOn #tourBar{opacity:0;pointer-events:none;transform:translate(-50%,12px)}}`;
  d.appendChild(css);
  d.querySelectorAll('[data-a]').forEach((bn) => bn.addEventListener('click', () => {
    const a = (bn               ).dataset.a;
    if (a === 'exit') tourExit();
    else if (a === 'prev') tourGo(tourI - 1);
    else if (a === 'next') tourGo(tourI + 1);
    else if (a === 'auto') { tourAuto = !tourAuto; tourPlan(); tourPaint(); }
    else if (a === 'card') { tourHold(); selectNode(TOUR_STOPS[tourI], false); }
    else if (a === 'share') tourShare();
  }));
  document.body.appendChild(d);
  tourEl = d;
  return d;
}
function tourPaint() {
  if (!tourEl) return;
  const d = byId[TOUR_STOPS[tourI]]?.d;
  (tourEl.querySelector('#tourPos')               ).textContent = zh(`${tourI + 1}/${TOUR_STOPS.length} · ${d ? d.name : ''}`);
  (tourEl.querySelector('#tourText')               ).textContent = zh(d ? (d.line || d.sub || '') : '');
  (tourEl.querySelector('u[data-a="card"]')               ).textContent = zh('读经证 ›');
  const ab = tourEl.querySelector('button[data-a="auto"]')               ;
  ab.innerHTML = ico(tourAuto ? 'pause' : 'play');
  ab.title = zh(tourAuto ? '暂停自动巡游' : '自动巡游');
  ab.setAttribute('aria-label', ab.title);
  ab.classList.toggle('on', tourAuto);
  ab.classList.toggle('breath', !tourAuto && tourI < TOUR_STOPS.length - 1);
  tourEl.classList.toggle('lift', !!sfpS.active);
}
// 交互即驻足（2026-08-14 档一①）：读卡、拖镜头、出海报，任一主动动作即停自动巡游的钟——
// 巡游是陪读不是赶路；「续走」由 ▶ 轻呼吸相邀，不自作主张再开。
function tourHold() {
  if (tourOn && tourAuto) { tourAuto = false; tourPlan(); tourPaint(); }
}
// 自动巡游的钟：后台页、题屏在场、入了专场（极乐/色界/道场/幽冥）都原地候着不翻站——
// 巡游是陪读不是赶路；终站（极乐）到达即歇，归途之后没有下一站可赶。
function tourPlan() {
  if (tourT) { clearTimeout(tourT); tourT = 0; }
  if (!tourOn || !tourAuto) return;
  tourT = window.setTimeout(() => {
    tourT = 0;
    if (!tourOn || !tourAuto) return;
    if (document.hidden || titleOn || artOn || inPure || inSky || inBodhi || inNether) { tourPlan(); return; }  // 观画期同候（档三）：静观此站，不背着人翻站
    if (tourI >= TOUR_STOPS.length - 1) { tourAuto = false; tourPaint(); return; }
    tourGo(tourI + 1);
  }, TOUR_DWELL);
}
function tourGo(i        ) {
  if (!tourOn) return;
  if (inPure || inSky || inBodhi || inNether) { showToast(zh('请先退出本景（✕ 或返回），再继续导览'), 3200); return; }
  tourI = Math.max(0, Math.min(TOUR_STOPS.length - 1, i));
  const id = TOUR_STOPS[tourI];
  const nv = byId[id]; if (!nv) return;
  // 档一②：默认只走镜头＋站引一句（看景为主）；全卡是「读经证」点开的深读。
  // 卡若正开着（读卡中翻站），就地换成本站内容，镜头照飞——阅读节奏不断。
  if (overlayEl === card && selectedId) selectNode(id, false);
  else {
    if (!readSet.has(id)) { readSet.add(id); syncSave(); }
    nv.label.classList.add('read');
    const wp = new THREE.Vector3(); nv.marker.getWorldPosition(wp); impactAt(wp, 0.7);
    playSfx('sfx-tap', 0.3);
  }
  const v = viewPosFor(nv);
  flyTo(v.pos, v.target);
  tourPaint(); tourPlan();
}
function tourStart(atId         = '', opts       = {}) {
  tourOn = true;
  tourAuto = opts.auto !== false;
  // 拖镜头＝驻足（档一①）：flyTo 直驱相机不经 controls，只有真人捏拖才触「start」，不误停
  if (!tourWired) { tourWired = true; controls.addEventListener('start', tourHold); }
  tourBar().style.display = '';
  tourGo(Math.max(0, TOUR_STOPS.indexOf(atId || 'sumeru')));
}
function tourExit() {
  tourOn = false; tourAuto = false;
  if (tourT) { clearTimeout(tourT); tourT = 0; }
  if (tourEl) tourEl.style.display = 'none';
  closeCard();
}
function tourShare() {
  const id = TOUR_STOPS[tourI];
  const d = byId[id]?.d; if (!d) return;
  tourHold();  // 出海报即是驻足：钟先停，免得海报开着背后翻站
  openPosterCard({ zh, toast: showToast, station: { id, name: d.name, sub: d.sub || '' } });
}

// ---------------- 覆盖层 ----------------
let overlayEl                     = null;
let overlayOnClose                      = null;
// 「我的」页内的功课月历弹窗（见 openMyCal）：踞浮层之上自成一层，故句柄与浮层并列存放，
// 好让 closeOverlay 一并收尾——弹窗开着时若整页被转场软关，句柄与 keydown 监听会留成孤儿，
// 其后一按 Esc 便被这只死闭包吞掉。声明置于此处亦避开 openOverlay 早于定义处执行的 TDZ。
let myCalClose                       = null;
let vdAutoMin = false; // 判词因浮层自动收签的旗标：只有本次收起过才在关层时还原（勿覆盖用户自己下滑收签的状态）
// 浮层期顶栏「大厅/我的」压暗禁点（含断 Tab 可达）：从前两钮隔着薄纱清晰可见、样子可点，
// 点击却落在 overlay 背景上＝关掉当前层，是无提示的隐形二段式操作——视觉与行为在此统一
function topNavLock(on         ) {
  document.documentElement.classList.toggle('ovOn', on);
  hallBtn.disabled = on; mineBtn.disabled = on;
}
// v220 弹窗交互统一：场景转场用软关——挂 keepOv 的重要面板（成佛等）不被转场吞掉；用户手关（✕/背景/Esc/按钮）仍走 closeOverlay
function softCloseOverlay() { if (overlayEl && overlayEl.querySelector('.keepOv')) return; closeOverlay(); }
function closeOverlay() {
  myCalClose?.();   // 页内弹窗随母页一同收：句柄与 keydown 监听不留孤儿
  if (overlayEl) {
    // 退场与入场同一口呼吸（2026-08-12 批）：挂 .bye 淡出 0.18s 再摘——开新层时新旧交叠淡化，
    // 暗星图与浅大厅两域不再硬切。凡「大厅是否在场」的判定须查 .overlay:not(.bye)，勿把将逝者当在场。
    const old = overlayEl;
    overlayEl = null;
    old.classList.add('bye');
    old.setAttribute('aria-hidden', 'true');   // 视觉淡出 190ms，但读屏与角色查询即时退场——
    old.setAttribute('inert', '');             // 免旧✕/旧输入框在窗口期与新层双双在场（a11y 树只留一份）
    window.setTimeout(() => old.remove(), 190);
  }
  topNavLock(false);
  if (vdAutoMin) { vdAutoMin = false; if (verdictEl.classList.contains('show')) verdictEl.classList.remove('min'); } // 关层还原被自动收起的判词
  controls.autoRotate = false; // 题屏环拍只在题屏挂：任何覆盖层一收即停
  const f = overlayOnClose; overlayOnClose = null; if (f) f();
}
function openOverlay(inner             ) {
  if (titleOn) titleHide();   // 题屏已非浮层（并入 #boot）：任何浮层上场先收题屏，一屏一窗之约不破
  closeOverlay();
  // 一屏一窗：判词在场时开浮层，判词先自动收成细签（信息不丢、金色大钮不再隔纱争焦点），关层还原
  if (verdictEl.classList.contains('show') && !verdictEl.classList.contains('min')) { verdictEl.classList.add('min'); vdAutoMin = true; }
  overlayEl = el('<div class="overlay ui"></div>');
  const isSheet = inner.classList.contains('sheet');
  const isCenter = inner.classList.contains('center');
  if (isSheet) overlayEl.classList.add('ovb');
  if (isCenter) overlayEl.classList.add('ovc');
  overlayEl.appendChild(inner);
  armBackGuard(); // 返回键接管：有浮层在场即武装哨兵（安卓返回＝先关浮层，不离站）
  // 统一右上角✕，移动端不依赖点外部空白
  if (inner.classList.contains('panel') && !inner.querySelector('.ovClose')) {
    const x = el('<button class="gbtn ovClose" aria-label="关闭" title="关闭">✕</button>');
    x.addEventListener('click', closeOverlay);
    inner.appendChild(x);
  }
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeOverlay(); });
  // 手机抽屉：右滑关闭（底部抽屉改下滑关）——位移主导才接管，不干扰滚动与点按
  if (matchMedia('(max-width:640px)').matches && !isCenter) {
    let x0 = -1, y0 = 0, dx = 0, dy = 0, drag = false, held = false;
    // v468 卡内正文可滚（节点卡改底部抽屉后尤其）：下滑关闭只在正文已到顶或手指未落在滚区时接管，
    //   否则一边原生滚一边面板平移，长卡（菩萨法界 66 位）根本滚不动。
    const scrollEl = inner.querySelector('.body')                      ;
    inner.addEventListener('pointerdown', (e              ) => {
      x0 = e.clientX; y0 = e.clientY; dx = 0; dy = 0; drag = false;
      held = !!scrollEl && scrollEl.contains(e.target        ) && scrollEl.scrollTop > 1;
    });
    inner.addEventListener('pointermove', (e              ) => {
      if (x0 < 0 || inner.classList.contains('subOn')) return;   // 页内弹窗在场时不接管手势：右滑本该翻月，不该把整页甩掉
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (isSheet) {
        if (held || (scrollEl && scrollEl.contains(e.target        ) && scrollEl.scrollTop > 1)) return;
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
  topNavLock(true);
}

// ── 安卓返回键（及 iOS 侧滑返回）接管：返回＝逐层退出，不再一键离站 ──
// 首个可退层（浮层/聊天面板/场景/行谱局）出现时压一枚哨兵历史项（不改 URL）；
// 返回键弹出哨兵触发 popstate，按「确认卡→浮层→聊天面板→门观→专场→局中缓退」次序消费一层，
// 仍有可退层则重新武装。退无可退时不再武装——下一次返回键自然离开（数据早已随手持久化）。
// Esc/✕ 关层不回收哨兵：其后首次返回键只是空转一格，第二次才离开，属可接受的一格冗余。
let backGuardOn = false;
let backLeaveAt = 0;
function armBackGuard() {
  if (backGuardOn) return;
  backGuardOn = true;
  try { history.pushState({ sfpBack: 1 }, '', location.href); } catch (e) { backGuardOn = false; }
}
window.addEventListener('popstate', (e) => {
  if (e.state && (e.state       ).sfpBack) { backGuardOn = true; return; } // 前进键回到哨兵项：只复位旗标，不消费层
  backGuardOn = false;
  if (confirmResolve) { closeConfirm(false); armBackGuard(); return; }     // 确认卡＝最上层，返回即「再想想」
  if (myCalClose) { myCalClose(); armBackGuard(); return; }                // 功课月历弹窗踞浮层之上：先收它，勿连「我的」整页一并关掉
  if (overlayEl) {
    closeOverlay();   // 手关回调可连锁开新层（如大厅✕→题屏）——openOverlay 会自行再武装
    if (overlayEl || titleOn || inDoor || inPure || inSky || inBodhi || inDisc || inNether || sfpS.active) armBackGuard();
    return;
  }
  if (titleOn) { titleHide(); armBackGuard(); return; }   // 题屏在场：返回＝收题屏看山（原 overlay 时代同义），不离站
  if (Net.isPanelOpen()) { Net.closePanel(); armBackGuard(); return; }
  if (inDoor) { exitDoor(true); armBackGuard(); return; }
  if (inNether || inPure || inSky || inBodhi || inDisc) { returnSaha(); armBackGuard(); return; }
  // 判词在场：返回＝落子收层（与掷钮 v360「按掷＝先落子」同义），不离站——
  // 否则「行处已存」失实：功课已计一掷而判定未行，离站后本掷蒸发、两本账对不上
  if (verdictFn && verdictMine()) { commitVerdict(); armBackGuard(); return; }
  if (sfpS.active) {   // 局中裸退：先告知已存档，短窗内再按一次才真离开
    // 掷轮动画窗（功课已计而判词未出，约 1.3–2.1s）不受理离站：此刻「行处已存」不实，离站会丢本掷
    if (sfpS.rolling && !verdictFn) { showToast(zh('本掷正在落定，稍候'), 1600); armBackGuard(); return; }
    const nowB = Date.now();
    if (nowB - backLeaveAt > 2600) {
      backLeaveAt = nowB;
      showToast(zh('行处已存——再按一次返回即离开'), 2600);
      armBackGuard();
      return;
    }
    history.back();    // 第二次：越过本站入口项真正离开（根页无处可退则留守）
    return;
  }
  // 娑婆自由观照且无局：哨兵已消费、不再武装——再按一次返回即离开
});

function openLibrary(tab = 'cites') {
  // 极简化：地图筛选已撤，只留参考经典（原「引用总表」）
  void tab;
  const p = el(`<div class="panel"><h2>参考经典</h2><div id="libBody"></div></div>`);
  (p.querySelector('#libBody')               ).appendChild(buildCitesPane());
  openOverlay(p);
}

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
    ['kind', '坐标类型', ['scripture', 'nonspatial']], // v366 两名制：schematic 已并入 scripture（同标签），芯片去重
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
  // v366 两名制：schematic 已并入「依经有处」，过滤时同 scripture 论（否则选依经有处会漏掉阿修罗）
  if (filters.kind.size && !filters.kind.has(d.coordKind === 'schematic' ? 'scripture' : d.coordKind)) return false;
  if (filters.work.size && !d.citations.some((c     ) => filters.work.has(c.work))) return false;
  return true;
}

// 简繁一扳，全站随之改字形。设置里那枚开关与自测钩子共走此一路——
//   两处各写一遍，日后添一件该刷新的东西必漏其一。
//   （阅读器已迁独立页面 read.html，简繁自持；本页存的 save.zh 只在读者首访 read.html 时被迁走作初值。）
function applyZhMode(v        ) {
  save.zh = v === 't' ? 't' : 's'; persist();
  zhDom(document.body);
  sfpStatus(); updateModeChip(); refreshPureNames();
  sfpLabelSync();   // 存局的现居位名随之改字形，免下次开站首帧留在旧字形
  if (selectedId && card.isConnected) renderCard();
}
(window       ).__setZh = (v        ) => applyZhMode(v);  // 自测钩子

function openSettings(backTo        ) { // backTo：同路往返（如「我的→设置」关卡回「我的」，与 openPlazaRename 同构）
  // v313 用户令瘦身：声音三项（音效/环境声/成佛唱赞）合并一行总开关（底层三键同进退，存档兼容）；低性能行删（自动降档制替）
  const p = el(`<div class="panel"><h2>设置</h2><div class="body">
    <div class="setRow"><span>声音（音效 · 环境声 · 成佛唱赞）</span><button class="gbtn" data-k="sfx"></button></div>
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
  const themeSync = () => { themeBtn.textContent = zh(save.cardTheme === 'paper' ? '青纸' : '暗夜'); themeBtn.classList.toggle('primary', save.cardTheme === 'paper'); };
  themeBtn.addEventListener('click', () => { save.cardTheme = save.cardTheme === 'paper' ? 'night' : 'paper'; persist(); applyCardTheme(); themeSync(); });
  const zhBtn = p.querySelector('#zhSet')               ;
  const zhSync = () => { zhBtn.textContent = save.zh === 't' ? '繁體' : '简体'; };
  zhBtn.addEventListener('click', () => { applyZhMode(save.zh === 't' ? 's' : 't'); zhSync(); });
  zhSync(); themeSync(); sync(); openOverlay(p);
  if (backTo) overlayOnClose = () => { overlayOnClose = null; backTo(); };
}

// 题屏并入开机屏（2026-08-11 终案）：#boot 即唯一门面——不再建浮层，原地点亮。
// 开机态骨架在 index.html 内联（题名/副题/钮位六字）；此处只填就绪态动态区并接交互：
// 主钮三态、在场句、细字行、✕。回题屏＝再点亮，离开＝titleHide 淡出（不移除，还要回来）。
let titleOn = false;
let titleGen = 0;   // 点亮代号：连开两次时旧一代的在场句 fetch 迟到不落笔
let titlePresenceT = 0;        // 在场句轻刷定时器：题屏亮着才走，titleHide 即停
let titlePresencePaint = null; // 当代在场句画笔：回前台立即补一拍（见启动段 visibilitychange）
function openTitle() {
  const b = document.getElementById('boot');
  if (!b) return;
  const gen = ++titleGen;
  const hasSfp = !!(save.sfp && SFP_BY[save.sfp.pos]);
  const act = sfpS.active;
  const cur = act || hasSfp ? SFP_BY[(act ? sfpS.pos : save.sfp.pos)          ] : null;
  // 回到门面＝导览收队（2026-08-14）：题屏 z:100 全盖，导览条留在底下只会背着人自动翻站
  if (tourOn) tourExit();
  // 主钮三态：局中→回局；有存局→直接续掷；无局→直开新局（单人零阻力，共修入口另在）。
  const go = b.querySelector('#bootGo')               ;
  go.innerHTML = `<b>${act ? '回到局中' : (hasSfp ? '续掷上局' : '开始行谱')}</b>`
    + (cur ? `<span>现居「${esc(cur.name)}」 · 第 ${act ? sfpS.n : save.sfp.n} 掷</span>` : '');
  // 门面对调（2026-08-14）：金主位随存局易主——无局＝导览为主（教学模型是门面），
  // 有局/局中＝行谱回主位（修行人回来第一眼要的还是续掷）。元素语义不动，主次全由 .hasSave 说话
  // （翻序换色皆在 index.html 的 CSS：column-reverse 与金/纱两皮）。字面与 index.html 静态骨架
  // 及内联读档脚本逐字同文——就绪重写写的是同一句话，屏上零翻面。
  b.classList.toggle('hasSave', act || hasSfp);
  const tb = b.querySelector('#bootTour')               ;
  tb.innerHTML = (act || hasSfp) ? '<b>导览十法界</b>'
    : '<b>进入十法界</b><span>依经导览 · 从地狱到佛</span>';
  tb.onclick = () => { titleHide(); tourStart(); };
  go.onclick = () => {
    if (act) { titleHide(); return; }
    if (netRejoin()) { titleHide(); return; }   // 共修在座：回服务器棋况，不落到本机旧存局
    // 初次行谱先看三步短卡；看懂后由卡底主钮真正开局。回访者仍保持直达。
    if (!hasSfp && !(save       ).sfpHelp) {
      openSfpHelp({ backTo: () => openTitle() });
      return;
    }
    titleHide();
    startSfp(hasSfp);
  };
  // 细字行：整行重建重绑（onclick 直挂，天然幂等——回题屏时 Net/存局状态可能已变）
  // 细字行四项而止（2026-08-14 发起人点单）：新开一局（有局才出）·玩法·大厅·分享——
  // 「我的」撤出门面（入界后右上角常在），共修大厅缩称「大厅」；已在房则大厅位换本室名。
  const links = b.querySelector('#bootLinks')               ;
  links.innerHTML = `${act || hasSfp ? '<span class="tlink" id="tiNew">新开一局</span>' : ''}
    <span class="tlink" id="tiHow">玩法</span>
    ${Net.active ? `<span class="tlink" id="tiNet">${esc(Net.roomLabel())}</span>`
      : '<span class="tlink" id="tiHall">大厅</span>'}
    <span class="tlink" id="tiShare">分享</span>`;
  const thall = links.querySelector('#tiHall');
  if (thall) (thall               ).onclick = () => openPlaza();
  const tn = links.querySelector('#tiNew');
  // 弃档三入口统一确认等级（⋯菜单两击、大厅 askConfirm）：题屏最显眼，不该唯一零确认
  if (tn) (tn               ).onclick = async () => {
    if (!await newRound()) return;   // 三态一线（见 newRound）：单机本地重开／一人在房请服务端收局再开／共修局中不可单独重开
    titleHide();
  };
  (links.querySelector('#tiHow')               ).onclick = () => openSfpHelp({ backTo: () => openTitle() });
  const tnet = links.querySelector('#tiNet');         // 已在房：直达同修面板
  if (tnet) (tnet               ).onclick = () => {
    titleHide();
    if (!sfpS.active && !netRejoin()) startSfp(hasSfp); // 在座且本局在进行＝按服务器快照回位
    Net.openPanel();
  };
  (links.querySelector('#tiShare')               ).onclick = () =>
    quickShare({ code: Net.active ? Net.code : '', zh, toast: showToast }); // 荐游戏；已在房则荐的即邀请
  // 在场一句（活封面）：没人时整句不出现——不留空盒，也不假装热闹。
  // 显示方案三改（2026-08-13 用户点单优化）：
  //   ① 去己——本机心跳在服务端 presence 窗内时自减一（Plaza.selfOnline）：「莲友」专指同修他人，
  //      独自在站整句不出，不再见「1 位莲友在线」的假热闹（那一位就是自己）；
  //   ② 常新——题屏亮着每 60 秒轻刷一拍（后台页不拉，回前台由启动段补拍）：
  //      从前只在点亮那一刻取一次，在题屏停留多久数字就死多久；
  //   ③ 不闪——回题屏不再先藏后现，旧句原位换字（dataset.raw 比对，同值不动 DOM），
  //      无→有才走入场动画，拉取失败保持上一句不清空。
  const presence = b.querySelector('#bootPresence')               ;
  const paintPresence = () => {
    // 首拍在 titleOn 置真之前同步发出，此处不查 titleOn（查了首拍必被自己拦下，
    // 在场句要空等 60 秒）；题屏已收的迟到回包由 .then 里的双守卫拦。
    if (gen !== titleGen || document.hidden) return;
    Plaza.fetchPlaza().then((data) => {
      if (gen !== titleGen || !titleOn) return;   // 已离开或已重点亮：迟到的在场句不落笔
      // v393 在线人数合一：单机联机不再分说两句——服务端 onlineNow 已并计（旧服务端回退逐级兼容）
      const raw = Number(data.onlineNow
        ?? Math.max(Number(data.onlineAll ?? data.online ?? 0),
          (data.stream || []).filter(r => Date.now() - Number(r.at || 0) < 600000).length));
      const n = raw - (Plaza.selfOnline() ? 1 : 0);
      const html = n > 0 ? `<i></i>${zh(`${n} 位莲友在线`)}` : ''; // 无人则整行不出——不报零
      if (presence.dataset.raw === html) return;
      presence.dataset.raw = html;
      presence.innerHTML = html;
      presence.hidden = !html;
    }).catch(() => {});
  };
  paintPresence();
  titlePresencePaint = paintPresence;
  if (titlePresenceT) clearInterval(titlePresenceT);
  titlePresenceT = window.setInterval(paintPresence, 60000);
  (b.querySelector('#bootX')               ).onclick = () => titleHide(); // ✕＝收题屏观照全图（原 ovClose 语义）
  b.classList.remove('bye');
  b.classList.add('ready');
  b.setAttribute('aria-hidden', 'false');
  titleOn = true;
  topNavLock(true);    // 与浮层同则：题屏在场时顶栏「大厅/我的」压暗禁点（细字行里已有同门）
  armBackGuard();      // 安卓返回＝先收题屏看山，不离站
  zhDom(b);
  // 环拍已随「不透山」二改撤除：题屏是自足设计底，山被整层盖住，背后空转徒耗电
}
// 「新开一局」唯一去处（2026-08-15 发起人点单：一人掷轮时亦接入题屏这条线）。
// 三态一线：单机＝本地重开；一人在房＝请服务端收去本局、随即开新局（Net.restartSolo，
// 收局静默不掀结算卡）；共修局中（二人以上）＝不可单独重开，据实相告。
// 从前一人在房点题屏「新开一局」会本地强开一局，与服务端房态成两本账——此为病根，今归一。
async function newRound({ confirm = true } = {})                    {
  if (Net.active && Net.isPlaying() && !Net.isAlone()) {
    showToast(zh('共修局进行中不可单独重开——结算后全房共同准备下一局'), 3600);
    return false;
  }
  if (sfpTransit || (sfpS.rolling && !(verdictFn && !Net.active))) { showToast('行棋中，稍候再新开'); return false; } // 单机判词期放行（cancelVerdict 在后善后）
  if (confirm && !await askConfirm('重开一局？', '当前行处将弃置，从头掷起。', '重开', '再想想')) return false;
  cancelVerdict();
  if (Net.active) return Net.restartSolo();   // 新局由 match_started 兑现（onMatchStarted 里 startSfp＋开局仪式）
  startSfp(false);
  return true;
}

function titleHide() {
  const b = document.getElementById('boot');
  titleOn = false;
  topNavLock(false);
  controls.autoRotate = false;
  if (titlePresenceT) { clearInterval(titlePresenceT); titlePresenceT = 0; } // 在场句随题屏同休
  titlePresencePaint = null;
  if (b) { b.classList.add('bye'); b.setAttribute('aria-hidden', 'true'); }
}

// 手势教学已撤（用户点单）：操作要领折进玩法卡

// 共修在座且本局仍在进行：棋况归服务器，本机不得作「存局退出」。
// 退了则轮次照跑而人已不在局（白等到超时被跳手）；回局时本机又只剩上一局的单机存局可依，
// 一点「续掷」就把人送回上局停的那一门重新掷——「点全图后跳到某门开始掷轮」即出于此。
function netSeatedInPlay()          { return Net.active && Net.isPlaying(); }
// 观照全图＝拉远自由观照（单机顺带存局退出）；v258 将入口移到顶栏题字。
function browseMapMode() {
  setBrowseDoor(0);
  if (inDoor) exitDoor(false);
  const was = sfpS.active;
  if (was && !netSeatedInPlay()) endSfp('行处已存，入自由观照——点「选佛」可续掷');
  else if (was) showToast('本局仍在——轮到您时照常掷轮', 3200); // 共修中只换镜头，不收局
  // 幽冥专场（恶趣门三涂：地狱/饿鬼/畜生诸位）先复原地表——saha 在幽冥场整体隐藏，
  // 而 returnSaha 对 inNether 是早退不管的；漏此则拉远后全图只剩星球与标签
  // （2026-08-11 用户报修：现居中品畜生点全图，山不见）
  if (inNether) netherRestore();
  if (inPure || inSky || inBodhi || inDisc) returnSaha();
  flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
  // 「十五门三段安位…」首见长提示已撤（2026-08-14 发起人点单）：拉远即观全图，画面自明，不加解说
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
  armBackGuard(); // 返回键＝退回娑婆
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
  // 进景解说 toast 已撤（2026-08-15 提示语三刀）：四土名牌与莲位可点，画面自明
}
// 双击极乐星／卡钮「进入极乐世界」：星河转金过场径入（用户点单：直接转场进入）；
// 行棋入净土位另走 sfp 乘光链路（彼处 fadeTransit 内已含 enterPure），不走此门
function enterPureTransit() {
  if (inPure || fadeEl.style.opacity === '1') return;
  fadeTransit(() => { enterPure(); setTransit(false); }, true, 900);
}
(window       ).__pureGo = (on         ) => on ? enterPure() : returnSaha(); // 自测钩子：出入净土（音乐已撤，钩子留着自测用）
// 极乐星点击专拍（题字与星体共用）：单击开门义卡但缓 360ms 才开——
// 否则卡一弹出就盖住星体，第二击永远落不到星上，双击直入形同虚设；
// 窗口内再点一下＝取消开卡、星河转金径入极乐。
// v163 曾改「单击即入」；2026-08-13 用户定案改回：单击＝门义卡（卡上有「进入」钮），双击方转场。
let gateCardT = 0;
function gateTap(dbl         ) {
  if (inPure) return;
  if (gateCardT) { clearTimeout(gateCardT); gateCardT = 0; }
  if (dbl) { enterPureTransit(); playSfx('sfx-tap', 0.25); return; }
  gateCardT = window.setTimeout(() => { gateCardT = 0; selectNode('gate', false); }, 360);
  playSfx('sfx-tap', 0.2);
}
// ---------------- 色界观照场（v140：与极乐同一套语法）----------------
function enterSky() {
  armBackGuard(); // 返回键＝退回娑婆
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
  // 进景解说 toast 已撤（2026-08-15 三刀）：杆签与星可点，画面自明
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
// 色界总星专拍（同极乐星 gateTap）：单击缓 360ms 开门义卡留双击窗口，双击星河转金径入色界场
// （v163 曾改「单击即入」；2026-08-13 用户定案改回：单击＝卡，双击方转场）
let rupaCardT = 0;
let skyEnterAt = 0, bodhiEnterAt = 0; // v208 交互总纲：场内再点本星＝出，入场 900ms 冷却防误触
function rupaTap(dbl         ) {
  if (inSky) return;
  if (rupaCardT) { clearTimeout(rupaCardT); rupaCardT = 0; }
  if (dbl) { enterSkyTransit(); playSfx('sfx-tap', 0.25); return; }
  rupaCardT = window.setTimeout(() => { rupaCardT = 0; selectNode('rupa', false); }, 360);
  playSfx('sfx-tap', 0.2);
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
// v364 用户定案「220 位全归主图」：谱页专场退为可选深读（天梯久按/门要卡入），不再是落位必经的转场。
// 分界曾按位数密度切（21/52 位塞不进星图就转场），与义理无关且与「有无地理方所」几乎反着——
// 门1 廿一因、门2 流弊、门6/7 戒学本在南赡部洲人间实地，理应铺珠可点可飞临。
// 集合留空＝全门铺珠；DISC_PAGES 页面数据仍在（深读入口用），故谱页一览不失。
const DISC_DOORS = new Set([]);
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
    e2.style.translate = `${pr.x}px ${ly}px`; // v392 合成器定位
    e2.classList.toggle('cur', b2.pid === curPid);
  }
  discCatEls.forEach(e2 => {
    const pr = discProject((e2       )._wp);
    if (!pr) { if (e2.style.display !== 'none') e2.style.display = 'none'; return; }
    e2.style.display = '';
    e2.style.translate = `${pr.x}px ${pr.y}px`; // v392 合成器定位
  });
  if (discCenterEl) { // 题签悬于阵顶上方（v328 随每页实际顶行，短页不再飘远）
    const pr = discProject(_discApex.copy(DISC_C).setY(DISC_C.y + discVTop + 6));
    if (!pr) { if (discCenterEl.style.display !== 'none') discCenterEl.style.display = 'none'; }
    else { discCenterEl.style.display = ''; discCenterEl.style.translate = `${pr.x}px ${pr.y - 30}px`; } // v392 合成器定位
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
  armBackGuard(); // 返回键＝退回娑婆
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
(window       ).__openDoor = (dn        , opts     ) => openDoor(dn, opts || {}); // 自测钩子：门卡（test-door-card.mjs）
(window       ).__selNode = (id        ) => { selectNode(id); return !!byId[id]; };            // 自测钩子：直开某法界节点卡（不依赖投影拾取）
(window       ).__discInfo = () => ({ on: inDisc, door: discDoor, beads: discBeads.length, labelsOn: discLabelEls.filter(e2 => e2.style.display !== 'none').length, ringOn: !!(discCurRing && discCurRing.visible) });
// ===== 幽冥剖块专场（v171 用户定案：四种恶趣门不用全局剖视，改基于模型的掠角地层剖块） =====
// 大地建成一整块圆形地体模型：朝三涂方向掠开 120° 扇形切口，两面切壁真实建模地层色带，
// 八热八寒诸狱/饿鬼薜荔多按真实坐标嵌于切口内；修罗宫别居对侧海沿下小剖龛。
// 与三专场同语法：单击直入、Esc/「全图」返回、行棋落位自动入场；行棋数据不动（门3即门观，位珠/足迹同坐标系）
const NETHER_IDS = new Set(['hell', 'preta', 'animal', 'asura']);
const netherBlock = new THREE.Group();
netherScene.add(netherBlock);
netherBlock.visible = false;
let inNether = false;
let netherBuilt = false;
// v393 剖块半径 105→118：地狱依经归赡部洲下（z=88）后，八热层（半径 22）外缘达 112，旧壁 105 兜不住；
// 118 仍在地体盘（半径 130）之内。赡部洲在 z=104，从此稳稳落在剖块之中而非骑在壁沿上。
const NETHER_R = 118, NETHER_D = 52;
const NETHER_AZ0 = 25, NETHER_AZ1 = 145; // 剖口方位角（度，atan2(z,x) 计）：含地狱90°/饿鬼90°/八寒110°/畜生45°——四趣皆在窗内
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
  grd.addColorStop(0, 'rgba(176,90,66,0)'); grd.addColorStop(1, 'rgba(168,76,52,0.55)');
  cx.fillStyle = grd; cx.fillRect(0, yOf(34), 1024, 512 - yOf(34));
  cx.strokeStyle = 'rgba(0,0,0,0.28)'; cx.lineWidth = 2; // 岩理短划
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 1024, y = yOf(4) + Math.random() * (512 - yOf(4));
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 14 + Math.random() * 26, y + (Math.random() - 0.5) * 6); cx.stroke();
  }
  const mark = (d        , t        ) => {
    const y = yOf(d);
    cx.strokeStyle = 'rgba(215,170,69,0.5)'; cx.lineWidth = 2;
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
    g.scale.setScalar(18); g.position.set(0, -17, 96); netherBlock.add(g); // v393 随饿鬼锚点同迁洲下
    const r = dashedCircle(7, 0, 0x6f8f7c); r.position.set(0, -17, 96); netherBlock.add(r);
  }
  // 诸狱余烬：一枚暖光晕贴八热顶层（静场，不动态）
  {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('230,130,84'), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.scale.setScalar(24); g.position.set(0, -24, 88); netherBlock.add(g); // v393 随八热同迁洲下
  }
  // 阿鼻极核（v200 统一后唯一残留装饰件）：无间之底暗红极盘＋红晕，阿鼻位珠落其上——
  // 文字标识不再另造（v199 三枚静态标已撤）：三狱坐标唯一真源＝谱位珠（SFP_NETHER_LAYOUT），门观自浮位名
  {
    const abi = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6.5, 2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a0f0b, emissive: 0x8b1f12, emissiveIntensity: 0.9, roughness: 0.85 }));
    abi.position.set(0, -47.2, 88); netherBlock.add(abi); // v393 随地狱同迁洲下
    const ag = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('200,60,36'), transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }));
    ag.scale.setScalar(15); ag.position.set(0, -47.2, 88); netherBlock.add(ag);
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
  armBackGuard(); // 返回键＝退回娑婆
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
  enterDoor(3, pid, 'none'); // 门观接驳：位珠/位名/门星照常（inNether 已立，不会回转场）
  const az = THREE.MathUtils.degToRad((NETHER_AZ0 + NETHER_AZ1) / 2);
  const dirV = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const tgt = new THREE.Vector3(14, -20, 78); // 三涂重心偏地狱一侧（v393 依经正位后地狱/饿鬼南移至洲下，重心随之南移）
  camera.position.copy(tgt.clone().addScaledVector(dirV, 178).add(new THREE.Vector3(0, 94, 0)));
  controls.target.copy(tgt);
  if (pid && doorPlanets[pid]) { const v = doorViewFor(pid); flyTo(v.pos, v.target, 2.0); }
  else {
    flyTo(tgt.clone().addScaledVector(dirV, 120).add(new THREE.Vector3(0, 40, 0)), tgt, 1.6);
    if (nodeId && byId[nodeId]) window.setTimeout(() => { if (inNether) selectNode(nodeId, true); }, 80);
  }
  playBell(220, 0.06);
  // 进景解说 toast 已撤（2026-08-15 三刀）：剖窗与位珠可点，画面自明
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
    e2.style.translate = `${x}px ${y}px`; // v392 合成器定位
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
  armBackGuard(); // 返回键＝退回娑婆
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
  // 进景解说 toast 已撤（2026-08-15 三刀）：科名彩签可点，画面自明
}
function enterBodhiTransit() {
  if (inBodhi || fadeEl.style.opacity === '1') return;
  fadeTransit(() => { enterBodhi(); setTransit(false); }, true, 900);
}
// 菩萨星专拍（同极乐/色界成例）：单击缓 360ms 开门义卡留双击窗口，双击转场入道场
// （v162 曾改「单击即入」；2026-08-13 用户定案改回：单击＝卡，双击方转场）
let bodhiCardT = 0;
function bodhiTap(dbl         ) {
  if (inBodhi) return;
  if (bodhiCardT) { clearTimeout(bodhiCardT); bodhiCardT = 0; }
  if (dbl) { enterBodhiTransit(); playSfx('sfx-tap', 0.25); return; }
  bodhiCardT = window.setTimeout(() => { bodhiCardT = 0; selectNode('bodhi', false); }, 360);
  playSfx('sfx-tap', 0.2);
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
// 色界子树改挂观照场组（世界坐标不变，珠/棋子数据照旧）
SKY_IDS.forEach(id => { if (byId[id]) skyRealm.add(byId[id].marker); });
let chanOpen = 0;
let chanRevealT = 0; // 绽放动画起拍：成员星自坛心尺度涨开
// 哪些门的位珠挂在禅天成员星上（v139：门5全层、门10三果挂无烦天）——行棋/浏览涉该门时自动强展对应层，免珠无依托
const CHAN_NEED                           = {};
(SFP_POS         ).forEach((p     ) => { const L = CHAN_OF[p.anchor]; if (L) { const a = CHAN_NEED[p.door] = CHAN_NEED[p.door] || []; if (!a.includes(L)) a.push(L); } });
CHAN_NEED[8] = [1, 2, 3, 4]; // 定学与四禅相应（v147）：定梯亮时坛城光盘全现，级高有所对
let chanHotCache           = []; // 每帧由 updateChanMandala 刷新，chanShow 高频调用只读缓存
const chanHotLayers = ()           => { const out           = []; [focusDoorA, focusDoorB, browseDoor].forEach(d => (CHAN_NEED[d] || []).forEach(L => { if (!out.includes(L)) out.push(L); })); return out; };
function chanShow(id        )          {
  const L = CHAN_OF[id]; if (!L) return true;
  if (inSky) return skySel <= 0 || L === skySel || L === skyPosLayer() || chanHotCache.includes(L); // v223 该隐去的隐：全览全现；聚显时他层整层隐（现居层/行棋涉门层除外）
  return chanOpen === L || chanHotCache.includes(L);
}
function chanTap(layer        , dbl         ) {
  const mid = 'chan' + layer;
  if (inSky) { selectNode(mid, false); return; } // 场内全展，主星单击即开层卡
  if (dbl) { chanOpen = layer; chanRevealT = performance.now(); const v = viewPosFor(byId[mid]); flyTo(v.pos, v.target, 0.9); selectNode(mid, false); return; }
  if (chanOpen === layer) { chanOpen = 0; playBell(392, 0.03); return; } // 收拢无声（2026-08-15 三刀）：环收画面自明
  chanOpen = layer; chanRevealT = performance.now();
  playBell(587, 0.04);
  const v = viewPosFor(byId[mid]); flyTo(v.pos, v.target, 0.9);
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
// 归位＝回到现居位的完整就地观照（含位名标签）。
function goHome() {
  if (!sfpS.active || !sfpS.pos) return;
  const p = SFP_BY[sfpS.pos];
  if (p.pure) { sfpLocate(p.id); return; }
  if (inDoor === p.door) { const v = doorViewFor(p.id); if (doorPlanets[p.id]) flyTo(v.pos, v.target, 1.0); setConMin(false); return; }
  if (inDoor) exitDoor(false);
  enterDoor(p.door, p.id, 'fly', true); // 主动观门：呈本门总说
}
backBtn.addEventListener('click', () => {
  if (inDoor) { // 门观「全图」＝存局退出，入自由观照（用户定案）；未在局则照旧出门拉远
    if (sfpS.active && !netSeatedInPlay()) {
      endSfp('行处已存，入自由观照——点「选佛」可续掷');
      flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
    } else if (sfpS.active) { // 共修在座：只出门观拉远，本局照旧（收局会让轮次照跑而人不在局）
      exitDoor(false);
      flyTo(new THREE.Vector3(80, 125, 300), new THREE.Vector3(0, 42, 0), 1.4);
      showToast('本局仍在——轮到您时照常掷轮', 3200);
    } else exitDoor(true);
  }
  else if (inPure || inSky || inBodhi || inDisc) returnSaha(); // v212 修复：道场内按钮显「全图」却无对应分支——局中误走「归位」需按两次、局外则全无动作
  else if (sfpS.active && sfpS.pos && SFP_BY[sfpS.pos].terminal) { // v212：毕局位无「归位」可言——钮即收局返全图
    if (!netSeatedInPlay()) endSfp('本局至此选佛及第——已入自由观照，点「选佛」可再入选佛场');
    else showToast('本局仍在——等候共同结算', 3200); // 共修成佛者留座待结算，不自行收局
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
SFP_DOOR_BY[1].intro = '選佛第一擲，二十一種輪相組合直定二十一種發始因地——此生從何處起步。廿一因分四類：三品十惡為惡因，多感三塗；見取、戒取、慢心行施、世間福并三品十善為世間雜因，隨業升沉世間諸趣；邪定、味禪、根本四禪、四無量心、四無色定為禪定因，多生色無色天；出世福戒定慧四學為出世正因，意見參禪與利名習教則慕道而雜染，最易轉入法道流弊。因地一定，此後每擲皆自此起行。';
SFP_DOOR_BY[2].intro = '學道而歧，其弊有五：破尸羅（毀戒行）、破軌則（壞威儀僧制）、毀正見（撥無因果）、棄多聞（恃悟輕教）、增上慢（未得謂得）。多自「意見參禪」「利名習教」兩種因地而來——離教參禪易墮暗證，逐名習教易成狂解。譜設此門，正示法門無咎、咎在用心；一念知非，懺悔還淨，仍可轉入生善滅惡與三學正軌。';
SFP_DOOR_BY[15].intro = '圓極果位，唯一位而已——圓教究竟妙覺。斷盡四十二品無明，究盡諸法實相，三覺圓、萬德備，是為成佛、譜之終局。前十四門諸位，或升或沉、或橫超淨土，究竟同歸此極果；藏通別三教佛果，望圓皆屬因位，唯此一位，更無可進。凡各出發位譜表明確判入極果者，依該位阿佛、彌佛、陀佛或佛佛等含「佛」字的輪相進入本位；具體須依出發位判定。本局至此選佛及第。';
[1, 2, 15].forEach(no => { SFP_DOOR_BY[no].introEvidenceType = SFP_EVIDENCE_TYPE.interpretation; });
// 廿一因逐位一行义读（从各位谱注与行法去向提炼，作者自撰助读，非原谱引文）
const SFP_D1_CAPTION                         = {
  '上品十惡': '惡因熾盛·多墮地獄', '中品十惡': '惡心稍緩·多墮畜生', '下品十惡': '惡業輕微·多墮餓鬼',
  '見取': '妄執己見·鬥諍所依', '慢心行施': '挾慢行施·脩羅之因', '世間福': '施福利世·障三惡道',
  '戒取': '非因計因·無利勤苦', '下品十善': '止惡未淳·僅免三塗', '中品十善': '善念淳熟·人道之因', '上品十善': '淳善猛利·欲天之因',
  '邪定': '邪見習定·外道之類', '味禪': '味著定樂·隨禪受生', '根本四禪': '色界正定·四禪之因',
  '四無量心': '慈悲喜捨·求作梵王', '四無色定': '滅色緣空·四空之因',
  '意見參禪': '參禪雜意見·易入流弊', '利名習教': '習教牽利名·易入流弊',
  '出世福業': '施福求出離·階戒學', '出世戒學': '七眾律儀·戒為道基',
  '出世定學': '諸禪三昧·因定發慧', '出世慧學': '諦緣度觀·般若正因',
};
const SFP_D1_GROUPS                                    = [
  ['惡因', '多感三塗', ['上品十惡', '中品十惡', '下品十惡']],
  ['世間雜因', '隨業升沉世間諸趣', ['見取', '慢心行施', '世間福', '戒取', '下品十善', '中品十善', '上品十善']],
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
// 棋子/现居光仍悬节点上方 2.2（地图即坐标）
const NODE_POS = new Set(['北俱盧洲', '西牛貨洲', '東勝神洲', '南贍部洲', '四王天', '忉利天', '夜摩天', '兜率天', '化樂天', '他化自在天',
  '梵眾天', '梵輔天', '大梵天', '少光天', '無量光天', '光音天', '少淨天', '無量淨天', '徧淨天', '福生天', '福愛天', '廣果天',
  '無想天', '無煩天', '無熱天', '善見天', '善現天', '色究竟天', '空無邊處天', '識無邊處天', '無所有處天', '非想非非想處天']);
const NODE_POS_ANCH                              = {}; // 门→此类位所在节点（开门时节点星代珠呼吸提示）
// 甲案「界域层台」布局（v119，用户定案）：真界域为骨、谱序为脉——
// 每门位珠仍贴其经典锚点（地狱沉山根、欲天沿山腰、色无色山顶列梯、四教悬四圣星域），
// 门内高度随谱序单调上升（升＝向上字面成立）；谱序光带已拆（2026-08-12 星图去位次连线，极简）。
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
    const h = 9.4 + 4.5 * k; // v364 全铺后门1 因地环（洲面 r7.2）已在此，起点外推让开（流弊本义即出洲沉沦，推远更合）
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
  // 别教妙觉高置（2026-08-12 坐标勘正）：原落通例环（世界 y≈140.8），致门12第51→52位「等觉→妙觉」明显向下、
  // 与本门从浅阶深冲突；今升至世界 y≈160.5（等觉 158.5 之上），门内谱序字面向上，仍踞佛法界（别教之佛果）
  if (aid === 'buddha' && dno === 12) { return V(0, 24.5, 0); }
  // v364 门9 慧学发心＝各法界「前庭」低弧：发心尚未入位次，故列于该界诸位次之下（义理：闻慧发心在证位之前），
  // 同时让开通例扇弧首环（原与门10 藏教位最近 1.47）
  if (dno === 9) { const a = _faceA(aid) + (k - (n - 1) / 2) * 0.62; return V(Math.cos(a) * 6.2, -2.6 + k * 0.5, Math.sin(a) * 6.2); }
  // v320 门4八附位专属坐标（十有为骨八附为缀，门总说四条安置令字面化）：
  // ①四輪王＝南洲面山「轮宝阶」斜列渐升（王一二三四洲，出俊舍）；②十仙＝外海孤峰顶（楞严「休止深山或大海島絕於人境」，
  // 峰高仅高于金輪王一籌＝「雖離人世不離人類」，谱序高度仍单调）
  if (aid === 'jambu' && dno === 4) {
    if (k === 0) return V(0, 2.2, 0); // k0=南贍部洲（asNode 自归节点，此值不用）
    if (k <= 4) { const a = _faceA(aid) + 0.55, r = 9.5 + (k - 1) * 2.6; return V(Math.cos(a) * r, 2.6 + (k - 1) * 1.15, Math.sin(a) * r); } // v361 起点抬过洲心 2.2：门内谱序字面单调（轮王出南洲、居洲面山道）
    const a2 = _faceA(aid) + 1.05; return V(Math.cos(a2) * 24, 6.8, Math.sin(a2) * 24);
  }
  // ③蒙光天子居兜率殿侧（华严：兜率天中闻天鼓处）、弥勒内院居殿顶正中轴高一层（上生经：内院在兜率中，补处说法处尊）
  if (aid === 'tusita' && dno === 4) { return k === 1 ? V(4.4, 2.6, 1.6) : k === 2 ? V(0, 5.0, 0) : V(0, 2.2, 0); } // k0=兜率天（节点）；v361 蒙光天子 1.0→2.6：仍居殿侧、但高过兜率节点，门内谱序字面单调（内院 5.0 仍最尊）
  // ④魔罗天＝他化宫上别宫一珠（翻译名义集「第六天上別有魔羅所居天。他化天攝」；欲网光丝已拆——摄属之义存于判词与居他化上方本身）
  if (aid === 'paranirmita' && dno === 4) { return V(6.0, 8.0, 0); }
  // 通例：面山扇弧，同锚多门按门序左右错开、半径渐外，弧内依谱序渐升
  const a0 = _faceA(aid) + (gi - (G - 1) / 2) * 1.15;
  const da = Math.min(0.5, 3.4 / Math.max(1, n - 1));
  const a = a0 + (k - (n - 1) / 2) * da;
  // 2026-08-12 坐标勘正：拾取球半径 1.7（中心距须 ≥3.4 方不相交），声闻锚藏10/通11 两环原跨门最近 1.802
  // （二果斯陀含↔三八人地、四果阿罗汉↔四见地），点击区严重相交易点错位——声闻锚基径 6.0、门距 3.6 专门拉开；
  // 余锚沿用 v360（基径 4.4、步进 1.25，邻珠 ≥2.0 视觉不粘连）
  const r = (aid === 'sravaka' ? 6.0 : 4.4) + gi * (aid === 'sravaka' ? 3.6 : 1.25);
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
    // v364 门1特判删：廿一因随 jambu 因地环铺回主图（sfpLocalOf 洲面 r7.2 环），星盘专场退为深读
    if (DISC_DOORS.has(dno)) { // v322 行门四门＋v324 门2（用户点单）曾不铺珠——v364 集合已清空，本支不再命中（留式以防回流）
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
    // 戒梯/定梯引导虚线与门4欲网光丝已拆（2026-08-12 用户点单：星图去位次连线，极简）——
    // 拾级次序由珠高自表；魔罗摄属他化之义存于判词与位珠居他化上方本身
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
    g2.fillText(SFP_DOOR_BY[dno].title, 256, 40); // 去序数只留门名（用户定案）：序号不助空间理解，谱序自有控制台进度点
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
  // （护法八部天、请法梵王后三忏回人间行；三果阿那含 2026-08-12 改锚声闻法界后已随环序自升，不复为峰）
  const SFP_MONO_PEAK = new Set(['護法八部', '請法梵王']);
  for (let dno = 1; dno <= 15; dno++) {
    if (dno === 14 || dno === 12 || dno === 2 || dno === 5 || dno === 3 || DISC_DOORS.has(dno)) continue; // 净土经义坐标、别教位塔（科环同高）、法道流弊门（v150：流弊本义即沉降）与色无色天门（v164：一禅一环拉平，环同高即经义，层间自升）不参与盘升；v322 谱页门门户点本一点不盘升；门3四恶趣（2026-08-12 坐标勘正：全门抬升曾把饿鬼拉到 y≈0.8~2.4、修罗拉到 y≈3.2~5.6，明显脱离本趣锚点——今各归本趣，趣内自升，地狱→畜生→饿鬼→修罗谱序由行棋与控制台进度承担，不篡改法界高度）
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
// 门谱序光带已拆（2026-08-12 用户点单：星图去位次连线，极简）——展开一门不再串线；
// 谱序自有位珠高度、控制台进度与行棋本身承担（同 v142 源流金线、v151 行迹细线、v322 门5光带先例）；
// 门4登天阶贴海绕行路径随光带一并退役。
// 本门聚焦＋观照展开：全图默认只显十五门星与当下门位珠；点门星另展一门（0=无）
let focusDoorA = 0, focusDoorB = 0;
let browseDoor = 0;
function applySfpFocus() {
  // 极简呈现（用户定案）：看哪门只见哪门——
  // 主动展开/入门时屏上只留本门（位珠全亮放大＋门星），余十四门星连题字整体暂隐；
  // 无主动展开时全图只见十五门星，现居门（focusDoorA/B）位珠保亮
  const on = (d        ) => inBodhi ? (d >= 9 && d <= 13) // 菩萨道场：四教并慧学位次全亮（9~13 门），门禁让位于专场
    : browseDoor ? d === browseDoor : (d === focusDoorA || d === focusDoorB);
  const M = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s3 = new THREE.Vector3(); const v3 = new THREE.Vector3();
  sfpBeadMeshes.forEach(m => {
    const hot = on(m.userData.door);
    m.visible = hot;
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
// 掷定入位后镜头俯冲进本门位珠簇：本门位珠放大全亮、逐珠浮出位名标签，
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
  // v391 修「点门梯进门场、图上是空的」：旧制只取一个各向同一的半径 r，又只水平后退（out.setY(0)），
  // 遇门 5 这种沿 Y 轴竖排二十一天的门，竖向跨度被水平半径辗平，顶上诸天直接出画面。
  // 改法：水平/竖向半径分算，取景距离取两者所需之大者（各自按相应 fov 换算）；竖排门压低仰角。
  let rH = 0, rV = 0;
  pts.forEach(v => {
    rH = Math.max(rH, Math.hypot(v.x - c.x, v.z - c.z));
    rV = Math.max(rV, Math.abs(v.y - c.y));
  });
  const out = c.clone().setY(0);
  if (out.lengthSq() < 1) out.set(0.6, 0, 1);
  out.normalize();
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = Math.max((rV * 1.25 + 6) / Math.tan(vFov / 2), (rH * 1.25 + 6) / Math.tan(hFov / 2), 18);
  const tall = rV > rH * 0.8; // 竖排门（诸天/四空）：俯角压低，不然一条竖线俯视成一点
  const lift = tall ? rV * 0.12 + 4 : rH * 0.55 + 7;
  return { pos: c.clone().addScaledVector(out, dist).add(new THREE.Vector3(0, lift, 0)), target: c };
}
// 只读探针：门簇几何与取景（v391 校准用，不改画面）
(window       ).__doorGeo = () => {
  const ks = Object.keys(doorPlanets);
  if (!ks.length) return null;
  const c = new THREE.Vector3(); ks.forEach(k => c.add(doorPlanets[k])); c.divideScalar(ks.length);
  let rH = 0, rV = 0, ymin = Infinity, ymax = -Infinity;
  ks.forEach(k => { const v = doorPlanets[k];
    rH = Math.max(rH, Math.hypot(v.x - c.x, v.z - c.z)); rV = Math.max(rV, Math.abs(v.y - c.y));
    ymin = Math.min(ymin, v.y); ymax = Math.max(ymax, v.y); });
  const v2 = doorClusterView(inDoor);
  return { n: ks.length, center: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)],
    rH: +rH.toFixed(1), rV: +rV.toFixed(1), ySpan: [+ymin.toFixed(1), +ymax.toFixed(1)],
    camPos: v2 ? [+v2.pos.x.toFixed(1), +v2.pos.y.toFixed(1), +v2.pos.z.toFixed(1)] : null,
    camTarget: v2 ? [+v2.target.x.toFixed(1), +v2.target.y.toFixed(1), +v2.target.z.toFixed(1)] : null,
    dist: v2 ? +v2.pos.distanceTo(v2.target).toFixed(1) : null, inDoor };
};
function doorViewFor(pid        )                                                {
  const wp = doorPlanets[pid].clone();
  const out = wp.clone().setY(0); // 自山轴向外取景，背山面珠
  if (out.lengthSq() < 1) out.set(1, 0, 0);
  out.normalize();
  return { pos: wp.clone().addScaledVector(out, 14).add(new THREE.Vector3(0, 5.5, 0)), target: wp };
}
function enterDoor(dno        , pid         , cam                          = 'jump', manual = false) { // v386 manual＝用户主动点门观看（才呈门总说；行棋跨门不呈）
  if (DISC_DOORS.has(dno)) { // v316/v322 门1及行门四门观照一律入谱页专场（无地理坐标，主图无珠可观）：归位/巡游/旧链路皆改道
    if (inDisc) { buildDisc(dno); if (pid) discLand(pid); }
    else enterDiscTransit(dno, pid);
    return;
  }
  if (dno === 3 && !inNether) { enterNetherTransit(pid); return; } // v171 恶趣门一律走幽冥剖块专场
  if (inNether && dno !== 3) netherRestore(); // 幽冥场内转入他门：先复原地表场景（门态由下文重建）
  if (inPure || inSky || inBodhi || inDisc) returnSaha();
  armBackGuard(); // 返回键＝出门观回全图
  setConMin(false); // 俯冲入门＝回到局面，收起的控制台恢复
  if (inDoor !== dno) {
    buildDoorFocus(dno);
    inDoor = dno;
    closeCard();
    setModeInstant(0);
    setBrowseDoor(dno); // 本门全亮放大，余门整门隐藏（光带已拆，2026-08-12 星图去连线）
    backBtn.dataset.t = ''; // 交给按帧同步重算
    // V71：门总说已承担入门解释，旧的短 toast 退役，避免两段介绍叠出。
    if (cam !== 'none') {
      const v = (pid && doorPlanets[pid]) ? doorViewFor(pid) : doorClusterView(dno);
      if (v) {
        if (cam === 'jump') { cancelFly(); camera.position.copy(v.pos); controls.target.copy(v.target); }
        else flyTo(v.pos, v.target, 1.3);
      }
    }
    // v386 跳门不显总说（用户令）：行棋自动入门不再呈浮文；用户**主动**点门观看（manual）才呈
    if (pendingDoorIntro) { pendingDoorIntro = null; }
    else if (manual && SFP_DOOR_BY[dno] && SFP_DOOR_BY[dno].intro) { markDoorSeen(dno); showDoorIntro(dno); } // 主动观门：本门总说随入呈一次（门1廿一因入口在其中）
    return;
  }
  if (pid && doorPlanets[pid] && cam !== 'none') { const v = doorViewFor(pid); flyTo(v.pos, v.target, 1.0); }
}
// 点门（星体或题字）通用一拍：短按展开/收拢，双击进入观照（净土门另走极乐链路不在此）；
// 交互标准（用户定案）：单击一律只展开/收拢，双击＝入场俯冲就地观照
function doorTap(dno        , isDbl         , wp               ) {
  if (isDbl && dno !== 14) {
    enterDoor(dno, sfpS.pos && SFP_BY[sfpS.pos].door === dno ? sfpS.pos : undefined, 'fly', true); // 主动观门
    playSfx('sfx-tap', 0.25); return;
  }
  if (inDoor === dno) { exitDoor(true); playSfx('sfx-tap', 0.25); return; } // 门观中再点本门＝出门观全图（免收拢/门观状态错位）
  if (browseDoor === dno) { setBrowseDoor(0); hideToast(); } // v393 同签栏一例：收拢无声，门义那条话随门收去
  else {
    setBrowseDoor(dno);
    const dir2 = camera.position.clone().sub(wp).setY(0); if (dir2.lengthSq() < 1) dir2.set(1, 0, 1); dir2.normalize();
    flyTo(wp.clone().addScaledVector(dir2, 36).add(new THREE.Vector3(0, 13, 0)), wp, 1.0);
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
  enterDoor(dno, sfpS.pos && SFP_BY[sfpS.pos].door === dno ? sfpS.pos : undefined, 'fly', true); // 主动观门
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
    e2.style.translate = `${x}px ${y}px`; // v392 合成器定位
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
    le.style.translate = `${x}px ${y}px`; // v392 合成器定位
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
let vClockWarned = false; // v392 末十秒预警只响一记
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
  if (left < 0 || left > 30) { clock.textContent = ''; clock.classList.remove('warn'); vClockWarned = false; return; }
  clock.textContent = zh(`剩 ${left} 秒`);
  const warn = left <= 10;
  clock.classList.toggle('warn', warn);
  if (warn && !vClockWarned) { vClockWarned = true; playBell(660, 0.04); vib(20); } // 末十秒一记轻磬＋短振：低头读谱注的人也知快到点（v392）
  if (!warn) vClockWarned = false;
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
  const vdGo = verdictMine(); // v360 掷钮＝同一动作：判词等本座落子时，掷钮亮着、题「行」字（点即落子）
  const button = sfpBar.querySelector('#sfpRoll')               ;
  button.classList.toggle('glow', canRoll || vdGo);
  button.classList.toggle('wait', waiting);
  button.classList.toggle('dis', !canRoll && !sfpS.rolling && !vdGo);
  const txt = button.querySelector('#rollTxt')               ;
  if (vdGo) {
    txt.textContent = (verdictEl.querySelector('#vGoTxt')               ).textContent || zh('行 ▸');
  } else if (!sfpS.rolling && !sfpTransit) {
    let label = terminal
      ? (Net.active && !Net.isFinished() ? '本座已达本局终位 · 同修行谱中' : '本局已结束') // v393 称谓规矩：局中语称同修（见文案约定）
      : (waiting ? Net.turnHint() : '长按掷轮');
    if (canRoll && Net.active) {
      const left = netTurnLeft();                       // 只在快到点时提示，平时不催人
      if (left >= 0 && left <= 20) label = `${label} · 剩 ${left} 秒`;
    }
    const tp = waiting ? Net.turnPlayer() : null;       // v392 候轮带座色小点：名·色·珠三者互认
    if (tp && tp.color) txt.innerHTML = `<i style="font-style:normal;color:${esc(tp.color)}">●</i> ${zh(esc(label))}`;
    else txt.textContent = zh(label);
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
  const e = comet.dir === 'down' ? Math.pow(k, 2.05) : k * k * k * (k * (6 * k - 15) + 10);
  if (comet.via && comet.via.length) { // 途经字幕随飞行进度逐门切换（v392 按缓动 e 对拍：字幕与实际所过之门空间对齐，不再按线性 k 抢先/滞后）
    const n = comet.via.length;
    const idx = Math.min(n - 1, Math.floor(e * n));
    if (idx !== comet.viaIdx) { comet.viaIdx = idx; showTransitCap(comet.via[idx]); }
  }
  const a = comet.fromNv.marker.localToWorld(_ca.copy(comet.fromLp));
  const b = comet.toNv.marker.localToWorld(_cb.copy(comet.toLp));
  const span = a.distanceTo(b);
  // v361 弧高随跨距续增（旧式封顶后，长途弧线相对跨距被压平成直线）：改用 sqrt 增长＋更高的上限
  const arcH = comet.dir === 'down' ? -Math.min(30, 3 + Math.sqrt(span) * 1.9) : Math.min(46, 4 + Math.sqrt(span) * 2.6);
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
    // v393 潜行改俯瞰：落点没入海面/地下时（修罗 −5.4、诸狱更深），旧式平视镜头终点恰在 y≈+1——
    // 贴着海皮看，剖窗被压成一条线，珠虽在窗内也看不见（发起人报「跳到修罗界要自己挪图才看得到」）。
    // 今依没入深度抬镜并收近，落地即成一个能望进窗里的俯角。
    const sink = Math.max(0, -_cp.y);
    const back = THREE.MathUtils.clamp(span * 0.6, 18, 78) * (sink > 1 ? 0.62 : 1); // v361 长途放宽；v393 潜行收近以拔仰角
    const hOff = (comet.dir === 'down' ? 16 : (comet.dir === 'up' || comet.dir === 'start') ? 8 : 11) + sink * 2.2;
    _rd.set(_cp.x - _rd.x * back, _cp.y - _rd.y * back * 0.4 + hOff, _cp.z - _rd.z * back);
    camera.position.lerp(_rd, 1 - Math.exp(-2.6 * dt)); // v392 帧率无关跟随：30/120fps 松紧一致
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
  controls.target.lerp(_cp, 1 - Math.exp(-7.2 * dt)); // v392 帧率无关（旧 0.12/帧在 60fps ≈ λ7.2，高低刷新率取景不再松紧不一）
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
  // v361 长途不再「嗖一下直线闪过」：旧式 dur 在 span≥112 封顶 1.6s，260 跨距速度达 163 单位/s（20 跨距的 6 倍）；
  // 改分段——近程仍轻快（手感不拖），远程按 sqrt 增长，速度上限压到约 95 单位/s，升沉看得清
  let dur = durOv ?? Math.min(2.9, 0.42 + Math.sqrt(span) * 0.155);
  if (via && via.length) dur = Math.max(dur, Math.min(4.4, 1.0 + 1.1 * via.length)); // 越门多则飞得久，字幕来得及读
  if (cometNextQuick) dur *= 0.72;
  cometNextQuick = false;
  if (REDUCED_MOTION) dur = Math.min(dur, 0.9); // 减弱动效：短程即达，不久悬空中
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
  rideAbort = REDUCED_MOTION; cancelFly(); // 减弱动效：不跟飞，镜头留在原地看光点走
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
    if (!REDUCED_MOTION) { hitStopT = 0.09; vib(18); } // ③ 顿帧一记，落得有分量（减弱动效则免）
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
  fovPunchT = REDUCED_MOTION ? 0 : 0.16; // 镜头微顿半拍（减弱动效则免）
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
    labelEl.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-140%);font-size:var(--fs-xs);letter-spacing:1px;color:${p.color};text-shadow:0 1px 4px #000;white-space:nowrap;display:none`;
    netLabelLayer.appendChild(labelEl);
    let ph = 0; for (const c of p.id) ph = (ph + c.charCodeAt(0)) % 220; // v392 呼吸相位按人散列：免全房齐刷刷同拍如节拍器
    b = netBeads[p.id] = { sprite, glide: null, labelEl, color: p.color, pos: null, ph: ph / 100, off: new THREE.Vector3(), chipT: 0, name: '' };
  }
  b.name = p.name || '同修';
  b.color = p.color || b.color;
  if (!b.chipT) b.labelEl.textContent = zh(b.name); // 轮相小签占牌期间不覆写
  return b;
}
function netSyncBeads() {
  const seen = new Set        ();
  const occ                          = {}; // v392 同位共住计数：本座莲台居中，远端按座次绕小环错开（Net.players 序全端一致，各端算得同样的位）
  if (sfpS.pos) occ[sfpS.pos] = 1;
  const myArrived = (sfpS.pos || '') !== netMyPosLast; netMyPosLast = sfpS.pos || ''; // ⑥ 我新至此位这一拍
  for (const p of Net.players) {
    if (p.id === Net.myId) continue;
    seen.add(p.id);
    const b = netBeadOf(p);
    b.online = p.online !== false; // R3″：离线珠不脉动、只淡显
    b.sprite.material.opacity = b.online ? 0.9 : 0.45;
    if (!p.pos || !SFP_BY[p.pos]) { b.sprite.visible = false; b.labelEl.style.display = 'none'; b.pos = p.pos || null; continue; }
    const kk = occ[p.pos] = (occ[p.pos] || 0) + 1;
    if (kk > 1) { const a = (kk - 1) * 2.4; b.off.set(Math.cos(a), 0, Math.sin(a)); } else b.off.set(0, 0, 0); // 独占居中；同位则金环距一珠
    if (b.glide && b.glide.path) { b.pos = p.pos; b.sprite.visible = true; continue; } // 逐位滑行在途：终点即快照位，别再叠一段直线滑
    const to = sfpWorldPos(p.pos, new THREE.Vector3()).add(b.off);
    if (b.pos && b.pos !== p.pos && b.sprite.visible) {
      const from = b.sprite.position.clone();
      const d = from.distanceTo(to);
      if (d > 0.5 && d < 900) b.glide = { t: 0, dur: Math.min(2.1, 0.9 + d * 0.004), a: from, b: to, hop: Math.min(15, 4 + d * 0.06) };
      else b.sprite.position.copy(to);
    } else if (!b.glide) b.sprite.position.copy(to);
    // ⑥ 同位相遇一拍（彼新至或我新至皆算）：一句轻报＋其座色涟漪一记；分开即解锁，重聚再报
    if (sfpS.active && sfpS.pos && p.pos === sfpS.pos && b.metPos !== p.pos && (b.pos !== p.pos || myArrived)) {
      b.metPos = p.pos;
      showToast(zh(`「${p.name || '同修'}」同居此位——同修相聚`), 3600);
      netBeadLand(b);
    } else if (p.pos !== sfpS.pos && b.metPos) b.metPos = '';
    b.sprite.visible = true;
    b.pos = p.pos;
  }
  for (const id of Object.keys(netBeads)) {
    if (!seen.has(id)) { // 离房者收珠（v392 连材质与光晕贴图一并释放——换室频繁不留 GPU 残渣）
      const bm = netBeads[id].sprite.material                        ;
      scene.remove(netBeads[id].sprite); if (bm.map) bm.map.dispose(); bm.dispose();
      clearTimeout(netBeads[id].chipT);
      netBeads[id].labelEl.remove(); delete netBeads[id];
    }
  }
}
const _nb = new THREE.Vector3();
function netBusy() { // v221 节流的动势判定：远端莲友珠滑行期间放行全帧率（上游无联机，本地补）
  for (const id of Object.keys(netBeads)) if (netBeads[id].glide) return true;
  return false;
}
// R3″ 位置点脉动（批C，2026-07-30 用户定案）：远端珠轻缓呼吸（~2.2s 周期、幅度小），
// 星图上一眼可寻；看全房位置＝点既有「全图」观照。守 §四「禁常亮大光斑」（±6% 微幅）、
// §七之二（不入 netBusy，静观 30fps 照常）；系统减弱动效则静止。
const netPulseOff = REDUCED_MOTION;
let netPulseT = 0;
function netFrame(dt        ) {
  netPulseT += dt;
  for (const id of Object.keys(netBeads)) {
    const b = netBeads[id];
    if (b.glide && b.glide.path) { // v392 逐位滑行：远端一掷沿 steps 实际路径经停（数据链路早已全量广播，此前只演首尾直线）
      const g = b.glide;
      g.t += dt / g.durs[g.seg];
      const k = Math.min(g.t, 1), ek = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      b.sprite.position.lerpVectors(g.pts[g.seg], g.pts[g.seg + 1], ek);
      b.sprite.position.y += Math.sin(ek * Math.PI) * g.hops[g.seg];
      if (g.t >= 1) {
        g.t = 0; g.seg++;
        if (g.seg >= g.pts.length - 1) { b.glide = null; netBeadLand(b); }
      }
    } else if (b.glide) {
      b.glide.t += dt / b.glide.dur;
      const k = Math.min(b.glide.t, 1), ek = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      b.sprite.position.lerpVectors(b.glide.a, b.glide.b, ek);
      b.sprite.position.y += Math.sin(ek * Math.PI) * b.glide.hop;
      if (b.glide.t >= 1) b.glide = null;
    } else if (b.sprite.visible && b.pos && SFP_BY[b.pos]) {
      sfpWorldPos(b.pos, b.sprite.position).add(b.off); // 随锚跟位（沙盘缩放/切场景不掉队）＋同位环距
    }
    const pulse = (netPulseOff || b.online === false) ? 1 : 1 + 0.06 * Math.sin((netPulseT + b.ph) * (Math.PI * 2) / 2.2); // v392 相位按人散列
    b.sprite.scale.setScalar(2.8 * pulse);
    // 名牌投影
    if (b.sprite.visible) {
      _nb.copy(b.sprite.position).project(camera);
      const on = _nb.z < 1 && Math.abs(_nb.x) < 1.05 && Math.abs(_nb.y) < 1.05;
      b.labelEl.style.display = on ? '' : 'none';
      if (on) b.labelEl.style.translate = `${(_nb.x * 0.5 + 0.5) * app.clientWidth}px ${(-_nb.y * 0.5 + 0.5) * app.clientHeight}px`; // v392 合成器定位
    } else b.labelEl.style.display = 'none';
  }
  netTurnBeamSync(dt);
}
// v392 远端行棋沿谱路重演：steps（服务器对全房广播的逐步棋录）→ 逐段小弧滑行＋轮相小签＋落位轻响。
// 恪守「小一号、淡一档」：不劫持镜头、不占判词层，主角永远是本座这一手。
function netBeadPath(playerId        , steps       , combo        ) {
  const b = netBeads[playerId]; if (!b || !Array.isArray(steps) || !steps.length) return;
  const ids           = [];
  const first = steps[0] && (steps[0]       ).from;
  if (first && SFP_BY[first]) ids.push(first);
  for (const s of steps) { const t = s && (s       ).to; if (t && SFP_BY[t] && ids[ids.length - 1] !== t) ids.push(t); }
  if (ids.length < 2) return;
  const pts = ids.map(pid => sfpWorldPos(pid, new THREE.Vector3()).clone().add(b.off));
  const durs           = []; const hops           = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pts[i].distanceTo(pts[i + 1]);
    durs.push(REDUCED_MOTION ? 0.3 : Math.min(1.9, 0.5 + Math.sqrt(d) * 0.09));
    hops.push(Math.min(13, 3.5 + d * 0.05));
  }
  b.sprite.position.copy(pts[0]); b.sprite.visible = true;
  b.glide = { path: true, t: 0, seg: 0, pts, durs, hops };
  // 轮相小签：滑行期名牌带上这一掷的组合字，事毕复名（下一拍 roster 覆写由 chipT 挡住）
  clearTimeout(b.chipT);
  b.labelEl.textContent = zh(`${b.name} · 「${combo || ''}」`);
  b.chipT = window.setTimeout(() => { b.chipT = 0; if (netBeads[playerId]) b.labelEl.textContent = zh(b.name); }, 4200);
}
function netBeadLand(b     ) { // 落位轻响：小号座色涧漪＋依远近减音的一记轻磬——不看屏也知道谁落在哪个方向
  const ring = impactSprite(ringTex);
  (ring.material                        ).color.set(b.color || '#96e1d6');
  ring.position.copy(b.sprite.position);
  impacts.push({ spr: ring, t: 0, dur: 0.5, kind: 'ring', s: 0.45 });
  const dist = camera.position.distanceTo(b.sprite.position);
  playBell(392, Math.min(0.035, 9 / Math.max(dist, 60)));
}
// v392 当轮光幢：轮到哪位远端莲友，其珠脚下起一道细座色光柱——全房一眼知道在等谁。
// 守光影总纲「禁常亮大光斑」：0.1 级微光、只随轮次在，轮走即收。
const netTurnBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.7, 26, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x96e1d6, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
netTurnBeam.visible = false; scene.add(netTurnBeam);
function netTurnBeamSync(dt        ) {
  const tid = Net.active && Net.isPlaying() ? Net.room.turnId : '';
  const b = tid && tid !== Net.myId ? netBeads[tid] : null;
  if (!b || !b.sprite.visible) { netTurnBeam.visible = false; return; }
  netTurnBeam.visible = true;
  netTurnBeam.position.copy(b.sprite.position); netTurnBeam.position.y += 11;
  (netTurnBeam.material                        ).color.set(b.color || '#96e1d6');
  (netTurnBeam.material                        ).opacity = 0.09 + (netPulseOff ? 0 : 0.04 * Math.sin(netPulseT * 2.6));
  netTurnBeam.rotation.y += dt * 0.4;
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
  posRevealEl.style.color = dir === 'down' ? '#f0af9e' : '#f4e6b8'; // 红字唯一亮档（--woe-tx 同值，内联守兜底字面）
  posRevealEl.style.textShadow = dir === 'down'
    ? '0 0 20px rgba(240,175,158,.85),0 2px 10px #000' : '0 0 20px rgba(215,170,69,.85),0 2px 10px #000';
  posRevealEl.classList.add('show');
  clearTimeout(posRevealT);
  posRevealT = window.setTimeout(() => posRevealEl.classList.remove('show'), 1400);
}

// ── 行棋判词卡（2026-08-12 重新极简）─────────────────────────────────────────
// 形＝两段式：**结果**（轮字 · 去向条）→ 一条分隔线 → **缘由**（落处提要 · 判词白话 · 操作规则）→ 行钮。
//
// 归一前是六行内容压着七层框（轮字牌、善↑惡↓小标、提要框、门标、来源徽章、详读钮、操作规则），
// 其中两处还是框中套框。2026-08-10 曾试过「框盒全去、改文字链」，发起人不满意、全部回滚——
// 病根在于：一次拔光所有框之后没有任何东西承担层次，卡上只剩一摊平铺的字，扫一眼抓不住重点。
// 今改由**一条分隔线**承担结构，框遂可尽去而层次仍在。
//
// 四条批注（2026-08-12 发起人）：
//   a 去向条两端位名皆可点入位卡——落处带本掷层，出发位不带（本掷答的是「我为何来到这里」）；
//   b 门标撤——所属门在位卡词头恒可见，此处是第二遍；
//   c 来源徽章「白话正本」改题「详读」，移到落处右侧。该署名恒为常量（4620 格 100% 命中，
//     SFP_CARD_BASIS 另三种标签永不出现），一个不变的徽章不提供信息；且判词卡只出白话不出
//     原文，无「冒谱曰」之虞——出处声明的职责整个交给位卡与阅读器，那里才有逐字原文；
//   d 一卡只两种色相（金与赤，赤只承担「恶／降」一件事），散点 hex 一律收归 --ck-* 五档。
const verdictEl = el(`<div id="verdict" class="ui panel" role="region" aria-label="本掷判词" aria-live="polite">
  <button id="vX" title="收起并依判词行棋" aria-label="收起并行棋">✕</button>
  <div id="vTop"><span class="vEyebrow">本掷判词</span><div id="vChips"></div><span id="vN"></span></div>
  <div id="vRoute"></div><div id="vGist"></div><div id="vWhy"></div><div id="vRule"></div>
  <div id="vActions"><button class="gbtn primary" id="vGo"><span id="vGoTxt"></span><i id="vClock"></i></button></div></div>`);
app.appendChild(verdictEl);
let verdictFn                      = null;
let vdAskCtx                                                                 = null;
let vdOnAsk = false;
function sfpEvidenceLabel(item     )         {
  if (item.type === SFP_EVIDENCE_TYPE.operation) return '本项目操作规则';
  if (item.type === SFP_EVIDENCE_TYPE.interpretation) return '释义';
  if (item.type === SFP_EVIDENCE_TYPE.glyph) return '字义解'; // v389 另栏署名：本项目依卷首表法的理解层，不冒谱曰
  if (item.subtype === 'refer_note') return '所指位谱曰';     // v390 总括句所指位的按语（仍是谱主逐字原文，ref 标所指）
  return item.subtype === 'rule_fact' ? '行法原文' : '谱曰原文';
}
function sfpEvidencePlainHtml(value     )         {
  // 空 text 项过滤：mergeSfpEvidence 等入口混入空项时不渲出光秃「释义：」标签
  return sfpEvidenceItems(value).filter(item => item.type !== SFP_EVIDENCE_TYPE.source)
    .filter(item => item.text && String(item.text).trim()).map(item =>
    `<div><b style="color:#d7aa45">${sfpEvidenceLabel(item)}：</b>${glossify(esc(item.text))}</div>`
  ).join('');
}
// 出处归一（2026-08-07 发起人点单「是不是重复多余了」）：
//   旧样「——蕅益智旭《選佛譜》；《選佛譜》卷第一・見取・L57」一行印两遍书名，还缀校勘行号；
//   经 rdCite 时更缀一次「· 出自《选佛谱》第一卷」，书名三遍、卷次两遍。
//   上游 ref 又有三种体例并存：
//     ①《選佛譜》卷第一・見取・L57（承注库 841 条）
//     ②《選佛譜》卷1 · 上品十惡譜曰（生成）
//     ③ B0136_002.txt:121 · 銀輪王行法（CBETA 源文件名，本不该上屏）
//   此处一次拆为「卷次／出处位」两件，书名与行号一概不带——书名由署名或容器给出；
//   行号只对校勘有用、于读者无益（同 v400 对判词卡出处的裁定：只留位名，卷号行号去之）。
const CITE_JUAN_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function citeParts(ref         )                                    {
  let r = String(ref || '').trim();
  if (!r) return { juan: '', where: '' };
  const bm = r.match(/^B0136_0*(\d+)\.txt:\d+\s*[·・]\s*(.*)$/);
  if (bm) return { juan: CITE_JUAN_CN[+bm[1] - 1] || bm[1], where: bm[2].trim() };
  r = r.replace(/[・·]\s*L\d+(?:\s*[,，]\s*\d+)*/g, '');            // 校勘行号
  r = r.replace(/^《[^》]*》/, '').replace(/^\s*[・·]\s*/, '');      // 书名
  let juan = '';
  r = r.replace(/^卷第?([一二三四五六七八九十]+|\d+)\s*[・·]?\s*/, (m        , n        ) => {
    juan = /^\d+$/.test(n) ? (CITE_JUAN_CN[+n - 1] || n) : n; return '';
  });
  // 尾缀「譜曰／行法」与题头标签（谱曰原文／行法原文）重出，去之——两者的分别由标签担着
  r = r.replace(/(譜曰|谱曰|行法)$/, '');
  return { juan, where: r.replace(/\s*·\s*/g, '・').replace(/^・+|・+$/g, '').trim() };
}
// sfpEvidenceSourceHtml 与 sfpEvidenceCompactHtml 已撤于 2026-08-12：
//   前者久无调用点；后者唯二调用点在 sfpMovesHtml 的 withWhy 分支内，随详读卡一并成孤儿。
//   （citeParts 不可连坐——sfpEvidenceCites 仍在用。）
function sfpEvidenceInterpretationText(value     )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.interpretation).map(item => item.text).join(' ');
}
function sfpEvidenceGlyphText(value     )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.glyph).map(item => item.text).join(' ');
}
function sfpEvidenceOperationText(value     )         {
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.operation).map(item => item.text).join(' ');
}
function sfpEvidenceCites(value     , pid        , juan        )         {
  // v390 所指位引文的折叠与「阅读原文」须落到被指位（refId/refJuan），不落回本位
  // 出处只留位名：rdCite 的题头自带「· 出自《选佛谱》第N卷」，此处再带书名与卷次即三遍重出。
  // 且位名只在**引自别位**时才标（v400 之意：位名是为一眼看出此判从何处承来；就是本位则无话可说）。
  const selfName = (SFP_BY       )[pid] ? (SFP_BY       )[pid].name : '';
  return sfpEvidenceItems(value, SFP_EVIDENCE_TYPE.source).map(item => {
    const where = citeParts((item       ).ref).where;
    const show = where && where !== selfName ? where : '';
    return rdCite(`${sfpEvidenceLabel(item)}${show ? ` · ${show}` : ''}`, (item       ).refId || pid, item.text, (item       ).refJuan || juan);
  });
}
const SFP_CARD_BASIS                         = {
  canon: ['白话正本', '正本逐格校审'], refer: ['所指谱文', '依本谱承前所指'],
  glyph: ['卷首字义', '依〈轮相表法第一〉'], stay: ['谱内通例', '依本谱不行通则'],
};
// 三张卡共用的本掷数据模型：4620 格正本判词、原文引句、项目操作规则与
// 220 位白话在这里分槽，任何一张卡都不再各自猜“该取哪一层”。
function sfpTossCardModel(ctx                                                         ) {
  const combo = String(ctx.c || '');
  const from = ctx.from && SFP_BY[ctx.from] ? SFP_BY[ctx.from] : null;
  const to = ctx.to && SFP_BY[ctx.to] ? SFP_BY[ctx.to] : null;
  const stay = !!(from && to && from.id === to.id);
  const dir = !from ? 'start' : stay ? 'stay' : to ? sfpDirOf(from, to, combo) : 'bonus';
  const evidence = ctx.evidence || (from && combo ? sfpWhyEvidence(from.id, combo) : null);
  const layer = from && combo ? sfpWhyLayered(from.id, combo) : { text: '', kind: '' };
  const position = to || from;
  const basis = SFP_CARD_BASIS[layer.kind] || ['白话说明', '依本掷数据'];
  return {
    combo, from, to, stay, dir, position, evidence, layer,
    basis: { label: basis[0], note: basis[1] },
    operation: sfpEvidenceOperationText(evidence),
    positionBody: position ? posBodyOf(position.id) : [],
    canon: from && combo ? sfpCanonVerdict(from.id, combo) : null,
  };
}
(window       ).__sfpCardModel = (ctx     ) => sfpTossCardModel(ctx); // 三卡接线验收钩子
(window       ).__sfpCanonCount = SFP_VERDICT_CANON_COUNT;
// ── 深库竞速门（2026-08-14 切库治本）────────────────────────────────────
// 正本（1.6MB）与承注（0.83MB）已出首包（sfp-verdict-canon 内部动态装载＋chengzhu 懒壳）。
// 判词是二库唯一的硬消费点，收口在此：深库未至则三路竞速——①整块 chunk（闲时早已预取）
// ②正本 API（api.foyue.org）单位取格籽 ③1.6 秒底线；见者先得，全败则降级出卡
// （why 家族白话仍在首包，不空手）。掷轮动画本身即是等待的掩护。
function sfpDeepReady() { return Promise.all([sfpVerdictCanonReady(), czReady(), sfpEvidenceReady()]); }
let sfpSeedBusy                       = null;
function sfpDeepSeed(posName        ) {
  if (!posName || sfpVerdictCanonLoaded()) return Promise.resolve();
  return sfpSeedBusy ||= fetch(`https://api.foyue.org/v1/positions/${encodeURIComponent(posName)}`,
    { signal: AbortSignal.timeout(1400) })
    .then((r) => r.json())
    .then((d     ) => {
      const cells                          = {};
      (d.rules || []).forEach((r2     ) => {
        cells[`${d.name}|${r2.combo}`] = r2.cite ? `${r2.plain}‖${r2.cite}` : String(r2.plain || '');
      });
      sfpVerdictCanonSeed(cells);
    })
    .catch(() => {})
    .finally(() => { sfpSeedBusy = null; });
}
let showVerdictGen = 0;
function showVerdict(...args       ) {
  const g = ++showVerdictGen;
  if (sfpVerdictCanonLoaded() && czLoaded() && sfpEvidenceDeepBuilt()) { showVerdictNow(...args); return; }
  const from = sfpS.pos && SFP_BY[sfpS.pos];
  Promise.race([
    sfpDeepReady(),
    sfpDeepSeed(from ? from.name : ''),
    new Promise((res) => setTimeout(res, 1600)),
  ]).then(() => { if (g === showVerdictGen) showVerdictNow(...args); });
}
function showVerdictNow(body        , why                                      , goLabel        , fn            , combo         , destId         , askQ         , dirKey         , light          ) {
  void light;
  if (dirKey) verdictEl.dataset.dir = dirKey; else delete verdictEl.dataset.dir;
  if (destId && SFP_BY[destId] && SFP_BY[destId].door !== (sfpS.pos && SFP_BY[sfpS.pos] ? SFP_BY[sfpS.pos].door : -1)) { // v264 天梯联动；v319 只跨门时闪（闪的本义是提示空间跨越，同门位移不闪）
    const lr = ladder.querySelector(`.ladDoor[data-d="${SFP_BY[destId].door}"]`)                      ;
    if (lr) { lr.classList.remove('fl'); void lr.offsetWidth; lr.classList.add('fl'); window.setTimeout(() => lr.classList.remove('fl'), 1400); }
  }
  // 轮字：只留字，不做牌。善恶由字色承担（.vchip.g/.e 本就已分金赤），边框是第二次说同一件事；
  //   「善↑／惡↓」小标亦撤——方向已由去向条箭头与整卡 data-dir 说过两遍，那是第三遍。
  //   轮字上的名相浮标一并撤：它把「那」硬绑到卷首第一层义「見煩惱」，而 v454（见 rdGlyph 处）
  //   已裁定「旧小字恒套『那＝见惑』会在第四层等位次说错，字义交给正本判词」——小字改了，
  //   这条按第一层义硬绑的浮标当时漏改。字义今由下方判词白话承担，那是逐格校审过的。
  const chipsEl = verdictEl.querySelector('#vChips')               ;
  if (combo) {
    chipsEl.innerHTML = combo.split('').map((ch, i) =>
      `<span class="vchip ${!'那謨'.includes(ch) ? 'g' : 'e'}"><b data-i="${i}"></b></span>`).join('');
    chipsEl.querySelectorAll('b').forEach((b, i) => { b.textContent = combo[i]; }); // 轮字用原字，不随简繁转换
    chipsEl.style.display = 'flex';
  } else chipsEl.style.display = 'none';
  (verdictEl.querySelector('#vN')               ).textContent = zh(`第 ${sfpS.n} 掷`);
  const whyEvidence = typeof why === 'string' ? makeSfpInterpretationEvidence(why) : why;
  const readingCtx = { c: combo || '', from: sfpS.pos || '', to: destId || '', evidence: whyEvidence || null };
  const cardModel = sfpTossCardModel(readingCtx);
  // ── 去向条（并 v226 的来处行与判定主句为一）──────────────────────────────
  // 归一前一行说「由「上品十惡」判此一掷」，另一行的判定主句里又写一遍去处位名。
  // 详读卡在 v400 早已裁过同一刀：「去向条给的是可点的两枚位签与升降箭头，读者一眼看出方向，
  // 且省一行」——判词卡当时没跟上，今补。两端位名皆可点入位卡，落处带本掷层。
  {
    const rEl = verdictEl.querySelector('#vRoute')               ;
    const F = cardModel.from, T = (destId && SFP_BY[destId]) ? SFP_BY[destId] : null;
    const arrow = { up: '↑', down: '↓', pure: '⇧', bonus: '＋', stay: '·' }[dirKey || ''] || '→';
    const here = T || F;
    rEl.innerHTML = zh(
      (F && T && T.id !== F.id ? `<span class="vp" data-go="from">${esc(F.name)}</span><i class="var">${arrow}</i>` : '')
      + (here ? `<b class="vp vdst" data-go="to">${esc(here.name)}</b>` : `<b>${esc(body).replace(/<[^>]*>/g, '')}</b>`)
      + (askQ ? '<span class="vaskC" id="vRead" role="button" tabindex="0">详读 ›</span>' : ''));
    rEl.style.display = (F || T) ? '' : 'none';
    // 首掷无出发位时只余落处一端；安住／贈掷 T===F，亦只出一端。
    if (!F && !T) rEl.innerHTML = zh(body), rEl.style.display = '';
  }
  // ── 落处提要（门标已撤：所属门在位卡词头恒可见，此处是第二遍）──────────────
  // 取**去处之位**：掷毕这一刻玩家要知道的是「要去的那一位是何修行」，出发位的位义上一张卡刚读过。
  // 安住／贈掷无去处，仍标本位。
  {
    const gEl = verdictEl.querySelector('#vGist')               ;
    const gid = (destId && SFP_BY[destId]) ? destId : (sfpS.pos || '');
    const gist = (SFP_BY       )[gid] ? posGist(gid) : '';
    // 提要不上名相浮标：判词卡上只留一处浮标源（下方判词白话），免同屏碎线、免开签遮判词
    gEl.innerHTML = gist ? zh(esc(gist)) : '';
    gEl.classList.toggle('on', !!gist);
  }
  // 2026-08-07 发起人点单：判词卡的原文层整个撤掉。
  //   掷毕这一刻要的是「去哪、这位修什么、为什么这样走」三句话；逐字原文与出处属深读，
  //   「详读」卡与位卡、谱文页各有一份，判词卡上再挂一层只是把卡撑高。
  //   故此处只出白话主句：无「原文 ▸」虚线签、无 #vSrc 层、无 .src 展开态。
  const wEl = verdictEl.querySelector('#vWhy')               ;
  // v409/v415/v416（移植线上 V105）：主句一律纯白话。
  //   调用方自带白话者（如贈掷之操作说明）以其为准，不夺其文；分层栈取不到时才落证据链。
  // 名相浮标：判词白话与操作规则共用一个 seen——各自新建会让同一名相在同屏标两遍。
  const vSeen = new Set        ();
  let plain = '';
  if (typeof why === 'string' && why) {
    plain = glossify(esc(stripGist(why)), vSeen);
  } else {
    const L = cardModel.layer;
    plain = L.text ? glossify(esc(stripGist(L.text)), vSeen) : sfpEvidencePlainHtml(whyEvidence);
  }
  // 「为何如此」题头与来源徽章一并撤：题头是废话（这一段本就在缘由区），徽章恒为常量
  //   （4620 格 100% 命中，SFP_CARD_BASIS 另三种标签永不出现），其职并入去向条的「详读 ›」。
  wEl.innerHTML = plain ? zh(`<div class="vWhyText">${plain}</div>`) : '';
  wEl.style.display = plain ? '' : 'none';
  wEl.classList.remove('full');
  const ruleEl = verdictEl.querySelector('#vRule')               ;
  ruleEl.innerHTML = cardModel.operation
    ? zh(`<b>本项目操作规则</b><span>${glossify(esc(cardModel.operation), vSeen)}</span>`)
    : '';
  ruleEl.style.display = cardModel.operation ? '' : 'none';
  vdAskCtx = askQ ? readingCtx : null;
  // 去向条三处热区同归位卡（归一前：位名弹小签＝#vGist 那句话的第二遍，详读开详读卡）。
  //   落处带本掷层——本掷答的是「我为何来到这一位」，只在落处讲得通；
  //   出发位不带——它的谱曰位注在自己卡上原文态本就全有。
  //   三处各自 stopPropagation：否则冒泡到 verdictEl 的 click 会走 pauseVerdict。
  verdictEl.querySelectorAll('#vRoute .vp, #vRoute .vaskC').forEach((v) => {
    const go = (v               ).dataset.go;
    (v               ).onclick = (e) => {
      e.stopPropagation();
      playSfx('sfx-tap', 0.25);
      if (go === 'from' && cardModel.from) openSfpNote(cardModel.from.id);
      else if (readingCtx.to || sfpS.pos) openSfpNote(readingCtx.to || sfpS.pos);
    };
  });
  (verdictEl.querySelector('#vGoTxt')               ).textContent = zh(goLabel);
  // 停靠在控制台正上方（实测控制台高度），不遮掷轮钮
  verdictEl.style.bottom = `calc(${20 + sfpBar.offsetHeight}px + env(safe-area-inset-bottom))`;
  sfpBar.classList.add('vd');
  verdictEl.classList.remove('min');
  verdictEl.classList.add('show');
  vdAutoMin = false; // 新判词一出即是全展态，旧的自动收签旗标作废
  verdictFn = fn;
  sfpStatus(); // 状态行随判词口径（勿滞留「未起行·先掷」祈使）＋ v360 掷钮题「行」字亮起
  // v319：判词木鱼撤——每掷双响合并为一响（方向音在行棋提交时 sfpShowMsg 处播）
}
function pauseVerdict() { // 点面板正文＝展开白话全句（判词不自动关，想看多久看多久）
  // 2026-08-07 原文层已撤，此处不再有 .src 展开态
  (verdictEl.querySelector('#vWhy')               ).classList.add('full');
}
function commitVerdict() {
  const f = verdictFn; verdictFn = null;
  vdAutoMin = false; // 判词行毕，自动收签旗标一并清（防 closeOverlay 事后摸空还原）
  sfpBar.classList.remove('vd');
  syncRollGlow(); // v360 掷钮题字随判词退场即时复位（勿滞留「行 ▸」）
  if (!f) { verdictEl.classList.remove('show', 'paused', 'min'); return; }
  // ① 承接拍：判词窗收光入轮相牌、牌面脉冲一记，再起飞（不再瞬切）
  const vr = verdictEl.getBoundingClientRect();
  const fp = sfpFaceEls[0].parentElement               ;
  const fr = fp.getBoundingClientRect();
  verdictEl.style.setProperty('--zx', ((fr.left + fr.width / 2) - (vr.left + vr.width / 2)) + 'px');
  verdictEl.style.setProperty('--zy', ((fr.top + fr.height / 2) - (vr.top + vr.height / 2)) + 'px');
  verdictEl.classList.add('zap');
  window.setTimeout(() => {
    verdictEl.classList.remove('show', 'paused', 'min', 'zap');
    verdictEl.style.removeProperty('--zx'); verdictEl.style.removeProperty('--zy');
    fp.classList.remove('pulse'); void fp.offsetWidth; fp.classList.add('pulse');
    f();
  }, 300);
}
function cancelVerdict() {
  showVerdictGen++;   // 深库竞速门在途者作废：收谱/重开时迟到的判词不再落笔
  verdictFn = null; vdAutoMin = false;
  verdictEl.classList.remove('show', 'paused', 'min', 'zap');
  verdictEl.style.removeProperty('--zx'); verdictEl.style.removeProperty('--zy');
  sfpBar.classList.remove('vd');
  sfpStatus(); // 状态行随判词退场复位（含 v360 题字复位），免滞留「待行」口径
}
let vdY0 = -1, vdSwipeT = 0;
verdictEl.addEventListener('pointerdown', (e) => {
  vdY0 = e.clientY;
  // 去向条三处热区（两端位名与「详读 ›」）皆走各自的 onclick，滑动手势不接管
  const t = e.target               ;
  vdOnAsk = !!(t.closest && (t.closest('.vaskC') || t.closest('.vp')));
});
verdictEl.addEventListener('pointerup', (e) => { // 下滑收成一条细签，上滑/点签唤回（判词仍不自动关）
  if (vdY0 < 0) return;
  const dy = e.clientY - vdY0; vdY0 = -1;
  if (vdOnAsk) { vdOnAsk = false; if (Math.abs(dy) < 36) vdSwipeT = performance.now(); return; }
  if (dy > 36) { verdictEl.classList.add('min'); vdSwipeT = performance.now(); vib(6); }
  else if (dy < -36) { verdictEl.classList.remove('min'); vdSwipeT = performance.now(); }
});
verdictEl.addEventListener('click', (e) => {
  e.stopPropagation();
  const t0 = e.target               ;
  if (t0.closest && (t0.closest('.vaskC') || t0.closest('.vp'))) return;
  if (performance.now() - vdSwipeT < 400) return;
  if (verdictEl.classList.contains('min')) { verdictEl.classList.remove('min'); return; }
  pauseVerdict();
});
(verdictEl.querySelector('#vGo')               ).addEventListener('click', (e) => { e.stopPropagation(); commitVerdict(); });
(verdictEl.querySelector('#vX')               ).addEventListener('click', (e) => { e.stopPropagation(); commitVerdict(); });
// v225 谱曰出处钮退役：原文小字直陈判词卡内（白话在上、原文为据）

// ── 成佛天梯：十五门竖向刻度，金珠=您、青珠=同修；点开全谱 ──
const ladder = el(`<div id="ladder" class="ui" title="十五门 · 成佛天梯"><span id="ladTop">佛</span><div id="ladTrack"></div>${Array.from({ length: 15 }, (_, i) => {
  const n = i + 1;
  const col = '#' + new THREE.Color(SFP_DOOR_COLOR[n] ?? 0xd7aa45).lerp(new THREE.Color(0xfaf3da), i / 14 * 0.42).getHexString();
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'][i];
  return `<div class="ladDoor" data-d="${n}" title="${SFP_DOOR_BY[n] ? SFP_DOOR_BY[n].title : ''}" style="bottom:${(i * 100 / 15).toFixed(2)}%"><b>${cn}</b><i style="background:${col};color:${col}"></i></div>`;
}).join('')}<div id="ladName"></div><span id="ladBot">因</span></div>`);
app.appendChild(ladder);
ladder.classList.add('show'); // 签栏常驻（v143）：十五门标识不入地图，就在此栏
// 触显全档（2026-08-14 十界导航极简，与菩萨十科签同案）：手指落杆十五号齐现、离手 1.6s 自敛
{
  let ladT = 0;
  const ladAll = () => {
    ladder.classList.add('ladAll');
    if (ladT) clearTimeout(ladT);
    ladT = window.setTimeout(() => { ladT = 0; ladder.classList.remove('ladAll'); }, 1600);
  };
  ladder.addEventListener('pointerdown', ladAll);
  ladder.addEventListener('pointermove', ladAll);
}
// 科名导航（v161 用户反馈右杆难发现：改顶部横排彩签条，转场滑入、居中显眼、窄屏横滑）——只在菩萨道场显示
const BODHI_NAV_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 自左而右由低到高：慧学位→圆教六即
const bodhiNav = el(`<div id="bodhiNav" class="ui">${BODHI_NAV_ORDER.map(g =>
  `<div class="bnv" data-g="${g}" style="color:#${BODHI_GRPS[g].color.toString(16).padStart(6, '0')}"><b>${zh(BODHI_GRPS[g].name)}</b><i></i></div>`).join('')}</div>`);
app.appendChild(bodhiNav);
// 触显全档（与上方 CSS 三改同案）：手指落杆十签齐现、离手 1.6s 自敛；hover 环境无此需（有逐签 hover）
{
  let bnvT = 0;
  const bnvAll = () => {
    bodhiNav.classList.add('bnvAll');
    if (bnvT) clearTimeout(bnvT);
    bnvT = window.setTimeout(() => { bnvT = 0; bodhiNav.classList.remove('bnvAll'); }, 1600);
  };
  bodhiNav.addEventListener('pointerdown', bnvAll);
  bodhiNav.addEventListener('pointermove', bnvAll);
}
function bodhiNavSync() {
  bodhiNav.querySelectorAll('.bnv').forEach(n => n.classList.toggle('on', Number((n               ).dataset.g) === bodhiGrp));
  const on = bodhiNav.querySelector('.bnv.on');
  if (on) try { on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch { }
}
bodhiNav.querySelectorAll('.bnv').forEach(n => n.addEventListener('click', () => {
  const g = Number((n               ).dataset.g);
  // v475 段签有自己的卡：场外直开；场内先切科、再点同科即开卡（免夺走「展开该科」这一主用法）
  const nm = (BODHI_GRPS[g] || {}).name;
  if (nm && (SFP_TENET       )[nm] && (!inBodhi || bodhiGrp === g)) { openTenetCard(nm); return; }
  setBodhiGrp(g);
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
// 点门签弹的那一枚提示（2026-08-12 发起人点单）：旧文只报操作——「全亮／点小珠读谱注／双击入门内观照」，
//   门门一个样，看十五遍是十五遍废话。今改报本门门义白话领起句（SFP_DOOR_BAIHUA，与门卡同一份正本），
//   点一门即知这门讲的是什么。不新造版面——仍是那枚 toast，只换里头的话。
// 操作尾巴（双击入门）已全撤（2026-08-15 提示语三刀）：门义正文是内容不是提示，故留；说明书尾巴不留。
function showDoorTip(dno        ) {
  const title = SFP_DOOR_BY[dno] ? SFP_DOOR_BY[dno].title : '';
  const b = (SFP_DOOR_BAIHUA         )[dno];
  const gist = String((b && b.v) || (SFP_DOOR_PLAIN         )[dno] || '').trim();
  const txt = gist ? `「${title}」${gist}` : `「${title}」全亮`;
  // 停留时长随字数走：门13 十八字与门8 八十八字若同用 3.6 秒，后者读不完。
  // 即时换话（非排队）：连点两签，后签门义立顶前签——所指已换，话不该还在排队。
  showToastNow(txt, Math.min(9000, 2200 + txt.length * 90));
}
// 签栏点门：单击＝本门全亮（镜头框位珠云、无关题字全隐），再点＝收拢；双击＝入门内观照；净土门＝极乐链路
let railLT = 0, railLD = 0, railCardT = 0;
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
  if (dno === 14) { // 净土门签（2026-08-13 用户定案）：单击＝门义卡缓一拍留双击窗口（卡上有「进入极乐世界」钮），
    // 双击方转场入极乐并亮十三正因——从前单击即转场，想读门义反而无处下手；场内再点＝收/展（场即其门）
    if (railCardT) { clearTimeout(railCardT); railCardT = 0; }
    if (!inPure) {
      if (dbl) { if (inSky || inBodhi) returnSaha(); enterPureTransit(); setBrowseDoor(14); return; }
      railCardT = window.setTimeout(() => { railCardT = 0; openDoor(14); }, 360);
    }
    else if (browseDoor === 14) setBrowseDoor(0); else setBrowseDoor(14);
    return;
  }
  if (dbl) { enterDoor(dno, sfpS.pos && SFP_BY[sfpS.pos].door === dno ? sfpS.pos : undefined, 'fly', true); return; } // 主动观门（门梯点击）
  if (inDoor === dno) { exitDoor(true); return; }
  // 再点即收（v393 发起人定案）：门义那条话随门一并收去，不另报「已收拢」——
  // 收起是自明之事，画面上门已暗、位珠已隐，无须再用一句话复述一遍
  if (browseDoor === dno) { setBrowseDoor(0); hideToast(); return; }
  if (inPure) returnSaha();
  if (inSky && dno !== 5 && dno !== 8) returnSaha(); // 色界两门在场内看亦通，余门先回娑婆
  setBrowseDoor(dno);
  const f = doorFly[dno];
  if (f) {
    const dir2 = camera.position.clone().sub(f.c).setY(0); if (dir2.lengthSq() < 1) dir2.set(1, 0, 1); dir2.normalize();
    const dist = THREE.MathUtils.clamp(f.r * 2.1, 34, 300);
    flyTo(f.c.clone().addScaledVector(dir2, dist).add(new THREE.Vector3(0, dist * 0.32, 0)), f.c, 1.1);
  }
  showDoorTip(dno);
}
ladder.querySelectorAll('.ladDoor').forEach(item => {
  const dno = Number((item               ).dataset.d);
  // v364 谱页退为可选深读：短按/双击照旧走聚焦与门观（220 位已全在主图），久按 460ms 入本门谱页
  let ldHold = 0, ldFired = false;
  const ldDown = () => {
    if (!DISC_PAGES[dno]) return;
    ldFired = false;
    ldHold = window.setTimeout(() => { ldFired = true; playSfx('sfx-tap', 0.24); enterDiscTransit(dno); }, 460);
  };
  const ldUp = () => { if (ldHold) { clearTimeout(ldHold); ldHold = 0; } };
  item.addEventListener('pointerdown', ldDown);
  item.addEventListener('pointerup', ldUp);
  item.addEventListener('pointercancel', ldUp);
  item.addEventListener('pointerleave', ldUp);
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ldFired) { ldFired = false; return; } // 久按已入谱页：不再触发聚焦/门观
    const t = performance.now(); const dbl = dno === railLD && t - railLT < 350;
    railLT = dbl ? 0 : t; railLD = dno;
    railDoorTap(dno, dbl);
  });
});
function updateLadder() {
  const act = inDoor || browseDoor;
  const cur = sfpS.active && sfpS.pos ? SFP_BY[sfpS.pos].door : 0;
  // v392 天梯座色刻：各同修现居门缀座色小点——右栏一眼览全房分布（本座已有 cur 金标，不另点）
  const peerDoor                          = {};
  if (Net.active) for (const p of Net.players) {
    if (p.id === Net.myId || !p.pos || !SFP_BY[p.pos]) continue;
    (peerDoor[SFP_BY[p.pos].door] || (peerDoor[SFP_BY[p.pos].door] = [])).push(p.color || '#96e1d6');
  }
  ladder.querySelectorAll('.ladDoor').forEach(e2 => {
    const dn = Number((e2               ).dataset.d);
    e2.classList.toggle('on', dn === act);
    e2.classList.toggle('cur', dn === cur);
    e2.classList.remove('aic');
    const cols = peerDoor[dn] || [];
    const key = cols.join(',');
    if ((e2               ).dataset.peers !== key) {
      (e2               ).dataset.peers = key;
      e2.querySelectorAll('.ladPeer').forEach(x => x.remove());
      cols.slice(0, 3).forEach((c, i) => {
        const dot = document.createElement('span');
        dot.className = 'ladPeer';
        dot.style.left = `${2 + i * 7}px`; dot.style.color = c;
        e2.appendChild(dot);
      });
    }
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
  // 定位句只报果（何位何门是本次信息）；教学尾巴已撤（2026-08-15 三刀）
  showToast(`已定位「${p.name}」——第${SFP_CN[p.door - 1]}门`);
}

// 控制台＝两行制（2026-07-28 重设计）：
//   行一「状态」——左轮相牌（点开行迹）、右现居位名与掷数（点开位卡，长按飞回棋子）；棋讯瞬时借用同一行。
//   行二「操作」——掷轮为主，聊／问／⋯ 为辅。
// 原先六层里有四层是死的：#sfpTop 被 display:none!important 钉死、#sfpDoors 与右侧天梯重复报十五门、
// #sfpName 与 #sfpMsg 从未显示（sfpShowMsg 一直在往看不见的元素里写，连「消息回看」都点不到）。
const sfpBar = el(`<div id="sfpBar" class="ui panel">
  <div id="sfpState" style="display:none">
    <div id="sfpFaces" title="轮相 · 点看本局升沉" style="display:none"><b></b><b></b></div>
    <div id="sfpName" title="点击读本位谱注 · 长按飞回棋子"></div>
  </div>
  <div id="sfpBtns">
    <button class="gbtn primary" id="sfpRoll" style="flex:1;min-height:52px;font-size:var(--fs-lg);font-weight:700;letter-spacing:2px;position:relative"><span id="rollTxt">长按掷轮</span><span id="rollBn"></span><span id="rollRing"></span></button>
    <button class="gbtn netEntry" id="sfpChat" style="min-height:52px;padding:8px 11px" title="同修 · 名单与聊天" aria-label="打开共修聊天与成员"><span class="netDots"></span><span class="chatLabel">聊</span><i class="netUnread"></i></button>
    <button class="gbtn" id="sfpAsk" style="min-height:52px;padding:8px 15px;font-size:var(--fs-lg)" title="问 · 与本谱对话（本地检证）">问</button>
    <button class="gbtn" id="sfpMore" style="min-height:52px;padding:8px 15px;font-size:var(--fs-xl)" title="谱务菜单">⋯</button></div>
  <div id="conMinBtn" title="收起控制台（缩为右下角掷轮钮）">—</div></div>`);
app.appendChild(sfpBar);
// 轮相牌竖排题头「上一掷／本掷」已撤（2026-08-12 用户点单）：两枚轮字自明，题头是第二遍
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
  if (sfpTransit || (sfpS.rolling && !verdictFn)) return; // 判词期放行看行迹（静止等待态非行棋中，无副作用）
  playSfx('sfx-tap', 0.2); openSfpTrail();
});
(sfpBar.querySelector('#conMinBtn')               ).addEventListener('click', (e) => {
  e.stopPropagation();
  conUser = true; localStorage.setItem('sfp_con_min', '1');
  applyConVis();
  // 收起无声（2026-08-15 三刀）：右下角「掷轮」丸即刻现身，画面自明
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
  playVar('wood_light', 0.34, 0.88); // 旁掷起转（落定轻叩改在 fired 一拍同步发——旧固定 1450ms 在疾旋档〔T2=0.95s〕会迟半秒）
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
  const T2 = tossFastOn() ? 0.95 : 1.5; // v360 连掷节奏：熟手（第6掷起）缩旋时，仪轨不减（仍是掌心→旁掷→定相）
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
    playVar('wood_medium', 0.3, 1.05); // 轮相落定轻叩：与定相同拍（常速/疾旋皆准）
    vib(10);                           // 掷定轻振：掷—定—落三拍触感闭环
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
  if (verdictFn) { // 判词在场：同屏勿再祈使「先掷」——判词卡已题「第 n 掷」，状态行随其口径
    return p
      ? zh(`${esc(p.name)}<span class="nSub">第 ${sfpS.n} 掷待行</span>`)
      : zh(`第 ${sfpS.n} 掷已定<span class="nSub">点「行」起行</span>`);
  }
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
    // label＝已过简繁的现居位名，专为 index.html 的内联脚本备（见其「首帧即照实」一段）：
    //   题屏主钮的三态本要等 openTitle，而 openTitle 卡在首帧 rAF 之后（着色器编译可达数秒），
    //   于是静态门面会先写「开始行谱」再改口「续掷上局」。存局本在 localStorage、解析 HTML
    //   即可同步读到，与 3D 毫无关系；只是位名要过简繁转换，而转换表在主包里内联脚本背不动，
    //   故此处顺手存一枚转好的。简繁一切换即刷新（见 zhSet 处的 sfpLabelSync）。
    ? { pos: sfpS.pos, n: sfpS.n, label: zh(SFP_BY[sfpS.pos].name),
      // 行迹帽 40→400（2026-08-14 修行手册所需）：手册要回顾全局升沉，40 掷只剩尾巴；
      // 每掷约 80 字节，400 掷 32KB，localStorage 放得起。400 是护栏不是常态（常局几十掷）。
      hist: sfpHist.slice(-400), seenD: sfpS.seenD.slice(), trail: sfpS.trail.slice(-200) }
    : null;
  persist();
}
// 简繁切换后重写存局的 label：切了简繁却未再掷时，题屏首帧会留在旧字形。
function sfpLabelSync() {
  const s = (save       ).sfp;
  if (s && s.pos && SFP_BY[s.pos]) { s.label = zh(SFP_BY[s.pos].name); persist(); }
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
  trail: () => sfpS.trail,
  fo15: () => fo15Html(),
  // chat／practice／rules／cross 四钩随旧本地答语库一并撤（2026-08-12，见 game.js 内那方墓碑）：
  //   它们暴露的是「本地按正则分派的手写答语」，那一路已让位于问谱。
  //   问答之验今在 agent/eval/ask-eval.mjs（后端 52 问）与 test-reader.mjs 第十节（前端全链路）。
  palm: () => { sfpPalmDown(); }, // v385 掷轮静场自测钩子，只读驱动无副作用
  quiet: (on         ) => sfpQuiet(on),
};
// 2026-08-12 用户点单三改：面板正名「本局升沉」；「这一程走势」段撤
// （sfpJourneySummary 仍供问义与 __sfpRead.journey，只是不再上此屏）；
// 点任一掷改开落处位卡（原「星图画链线」一路太隐晦——线画在面板背后，关卡才看见）。
// 修行手册（2026-08-14 发起人定案）：局终回顾走问谱管线据文生成——不写谱传，
// 手册只答一件事：这一局里，做了什么会升、做了什么会降，即修行次第，供回顾与学习。
// 行迹是本机真数据（第几掷·何位·何相·何向），升沉之理由检索的谱文与大师论著作答，
// 逐句角标可核对；生成闸（额度/降级）与问谱同一道，不另开口子。
function sfpManualQuestion(done = false) {
  if (!sfpHist.length) return '';
  const nameOf = (id        ) => (id && SFP_BY[id] ? SFP_BY[id].name : id || '');
  // 主题式而非逐掷式（2026-08-14 真机端到端校出）：逐掷「各因何行」是定本判词的事，
  // 行迹面板本就逐格零生成直出，不必让模型复述；手册要模型讲的是这一局显出的**次第之理**——
  // 何以退、退了怎么忏、何行感升、横超凭什么。位名只列诸处（入检索实体），问在主题。
  const falls = sfpHist.filter((h) => h.d === 'down' && h.f).slice(-12);
  const rises = sfpHist.filter((h) => h.d === 'up' && h.f).slice(-8);
  const pure = sfpHist.some((h) => h.d === 'pure');
  // 位名各限三处：位名是强实体，列多了检索前排全是位块，忏法/横超/外典主题块反被挤出材料窗
  const uniq = (xs        ) => [...new Set(xs)].slice(0, 3).map((n) => `「${n}」`).join('');
  const cur = !done && sfpS.pos && SFP_BY[sfpS.pos] ? SFP_BY[sfpS.pos].name : '';
  return `本局共${sfpS.n}掷${done ? '，已选佛及第' : (cur ? `，现居「${cur}」` : '')}。`
    + (falls.length ? `其间于${uniq(falls.map((h) => nameOf(h.f)))}诸位掷得恶相退堕。` : '本局未曾退位。')
    + (rises.length ? `于${uniq(rises.map((h) => nameOf(h.f)))}诸位掷得善相升进。` : '')
    + (pure ? '并曾以念佛横超净土。' : '')
    + '请依谱文与蕅益大师论著，为此局总说修行次第：修行何以有退、退时如何忏悔对治；何行感升；'
    + (pure ? '念佛横超之理何在；' : '')
    + '末以一句作勉。';
}
function openSfpTrail() {
  const rows = [...sfpHist].reverse().map((h, ri) =>
    `<div class="sfpTrailRow" data-i="${sfpHist.length - 1 - ri}"><span class="tn">第${h.n}掷</span><span class="tc">${esc(h.c)}</span><span>${h.d ? SFP_DIR_BADGE[h.d] || '' : ''}${esc(h.t)}</span><i class="tgo">›</i></div>`).join('');
  const p = el(`<div class="panel"><h2>本局升沉</h2><div class="body">
    <div class="cMeta" style="margin-bottom:4px">${sfpS.pos ? `第 ${sfpS.n} 掷 · 现居「${esc(SFP_BY[sfpS.pos].name)}」` : '未起局'}</div>
    ${rows || '<div style="color:#9d9170">尚未掷轮——升沉从第一掷开始记。</div>'}
    <div class="cNote">点任一掷可读落处位卡；存档保留最近四百掷，升沉皆依本位行法表与轮面字定。</div>
    ${sfpHist.length >= 4 ? `<button class="gbtn" style="margin-top:10px;width:100%" id="trManual">修行手册 · 问谱结此局升沉之理</button>` : ''}
    <button class="gbtn primary" style="margin-top:${sfpHist.length >= 4 ? '8px' : '10px'};width:100%" id="trOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  const tm = p.querySelector('#trManual')                      ;
  if (tm) tm.addEventListener('click', () => { overlayOnClose = null; openSfpReading(sfpManualQuestion()); });
  (p.querySelector('#trOk')               ).addEventListener('click', closeOverlay);
  p.addEventListener('click', (e) => {
    const row = (e.target               ).closest ? (e.target               ).closest('.sfpTrailRow')                : null;
    if (!row || row.dataset.i === undefined) return;
    const h = sfpHist[Number(row.dataset.i)];
    const pid = h && (h.to || h.f);
    if (pid && SFP_BY[pid]) { playSfx('sfx-tap', 0.22); openSfpNote(pid); }
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
}
renderer.domElement.addEventListener('pointerdown', () => {
  if (!sfpTransit || !skipFn) return;
  const f = skipFn; skipFn = null; f();
}, true);
void skipFn;
// 转场收尾一处收口：彗星、直达钩子、转场页与 sfpTransit 一并归零。
// 凡「局已收而动画还在途」的分叉都必须走这里——在途回调若只是 return 走人，
// 转场页(#fadeWhite z-40)会永远停在满不透明，盖住成佛面板(z-30)，人只见星河不见卡（联机成佛卡死即此）。
function clearTransit() {
  cometCancel();              // 内含 setTransit(false)
  setSkip(null);
  fadeEl.style.opacity = '0';
}
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
      // v393 水下/地下位加抬：旧固定抬 5.5，落到修罗（−5.4）时镜头恰卡在海面（y≈0.1）——
      // 与海皮齐平便望不进剖窗。今按没入深度补抬，务使镜头出水、俯角看得进去。
      const lift = 5.5 + Math.max(0, -wp.y) * 0.9;
      flyTo(wp.clone().addScaledVector(bd, 14).add(new THREE.Vector3(0, lift, 0)), wp, 1.4);
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
const doorIntroEl = el('<div id="doorIntro" class="ui"><b></b><div class="dit"></div><div class="dif">点画面即收 · 点位名可重读</div></div>');
app.appendChild(doorIntroEl);
let doorIntroOn = false;
function showDoorIntro(doorNo        ) {
  const dd = SFP_DOOR_BY[doorNo]; if (!dd || !dd.intro) return;
  (doorIntroEl.querySelector('b')               ).textContent = zh(`${dd.title} · 第${SFP_CN[doorNo - 1]}門總說`); // v386 只在主动观门时呈，「入」字去（非跨门播报）
  const body = doorIntroEl.querySelector('.dit')               ;
  const selfIntro = DOOR_HINT_SELF.has(doorNo);
  // 极简：白话为正文，原文折叠（详见 #doorIntro .diMore 样式处的缘由）。
  // 门义白话取繁体本 SFP_DOOR_BAIHUA——旧本 SFP_DOOR_PLAIN 是简体，而此处对它调 glossify，
  //   名相浮标的键全是繁体词形，简体正文一个也匹配不上，门义这一层的浮标从来没生效过。
  const bh = (SFP_DOOR_BAIHUA       )[doorNo];
  if (bh) {
    let h = `<div class="diV">${glossify(esc(String(bh.v)))}</div>`;
    ((bh.rows || [])         ).forEach((r     ) => {
      h += `<div class="nRow"><div class="k">${esc(r.k)}</div><div class="b"><div class="v">${glossify(esc(r.v))}</div></div></div>`;
    });
    // 门1/2/15 原谱无总说：其导语系本项目自撰，无谱文可折叠对读，只缀一行说明，不冒「谱曰」
    h += selfIntro
      ? `<div class="diSelf">原谱无此门总说——以上系本项目自撰导语，非谱主原文。</div>`
      : `<details class="diMore"><summary>谱曰原文 · ${String(dd.intro).length} 字</summary>`
        + `<div class="diC">${glossify(esc(String(dd.intro)))}</div></details>`;
    body.innerHTML = zh(h);
  } else { // 兜底：门义白话缺位时回落旧本，不开天窗
    const dPlain = (SFP_DOOR_PLAIN       )[doorNo];
    body.innerHTML = dPlain
      ? zh(`<div class="diV">${glossify(esc(dPlain))}</div><details class="diMore"><summary>${selfIntro ? '本门导语（原谱无此门总说）' : '谱曰原文'}</summary><div class="diC">${glossify(esc(dd.intro))}</div></details>`)
      : zh(`<div class="diV">${glossify(esc(dd.intro))}</div>`);
  }
  if (doorNo === 1) { // v169 因地门总说带廿一因逐位读入口
    const c = document.createElement('button');
    c.className = 'sfpChip'; c.style.marginTop = '9px';
    c.textContent = zh('廿一因逐位读 ›');
    c.addEventListener('click', (e) => { e.stopPropagation(); hideDoorIntro(); openDoor(1, { focus: 'pos' }); }); // 廿一因＝门1位次一览段
    body.appendChild(c);
  }
  body.scrollTop = 0;
  doorIntroEl.classList.add('show'); doorIntroOn = true;
  playVar('wood_light', 0.2, 0.95);
}
(window       ).__doorIntro = (dn        ) => { showDoorIntro(dn); return doorIntroOn; }; // 自测钩子：门总说浮层（极简·原文折叠）
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
  // v386 用户令：跳门时不显门总说——行棋至新门不再自动弹浮文（总说仍可主动点门/谱页读）；
  // 仍登记 seenD（见闻录·行迹账依此计历门数），只不呈屏
  if (SFP_DOOR_BY[p.door]) markDoorSeen(p.door);
  pendingDoorIntro = null;
}
let pendingDoorIntro                                       = null;
function markDoorSeen(doorNo        ) {
  if (!sfpS.seenD.includes(doorNo)) { sfpS.seenD.push(doorNo); sfpSave(); }
}
const SFP_DIR_BADGE                         = {
  up: '<b style="color:#e8c766">▲ 升</b>｜', down: '<b style="color:#f0af9e">▼ 降</b>｜',
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
    <div class="cNote">完整升沉脉络见「本局升沉」（⋯ 菜单或轮相牌点开）。</div>
    <button class="gbtn primary" style="margin-top:10px;width:100%" id="mlOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  (p.querySelector('#mlOk')               ).addEventListener('click', closeOverlay);
  openOverlay(p);
}
// R1 远端播报（批C）：同修掷轮借状态行说 5.2 秒——单槽避让：本人判词/棋讯在场则只入消息回看，不抢槽
function netPeerMsg(name        , combo        , lastText        ) {
  const h = `<b style="color:var(--gold-hi)">${esc(name)}</b><span style="color:#9d9170"> 掷得 </span><b style="letter-spacing:2px">「${esc(combo)}」</b>${lastText ? `<span style="color:#9d9170"> · ${esc(lastText)}</span>` : ''}`;
  sfpMsgLog.push(h); if (sfpMsgLog.length > 12) sfpMsgLog.shift();
  if (verdictFn || sfpMsgHold || !sfpS.active) return;
  sfpNameEl.innerHTML = zh(h);
  sfpNameEl.classList.add('msg');
  sfpMsgHold = window.setTimeout(() => { sfpMsgHold = 0; sfpStatus(); }, 5200);
}
// 行棋公事（贈掷施与等）同走状态行＋消息回看——聊天室只留人语与人事（2026-07-30 用户定案）
function netPeerNotice(text        ) {
  const h = esc(text);
  sfpMsgLog.push(h); if (sfpMsgLog.length > 12) sfpMsgLog.shift();
  if (verdictFn || sfpMsgHold || !sfpS.active) return;
  sfpNameEl.innerHTML = zh(h);
  sfpNameEl.classList.add('msg');
  sfpMsgHold = window.setTimeout(() => { sfpMsgHold = 0; sfpStatus(); }, 5200);
}
// ── 同修气象（2026-08-14 发起人拍板④⑤⑥；①②③星标/座色行棋/当轮光幢 v392 已备，不重做）──
// 极简纪律：零协议改动、零新色新形——涟漪即落位语、金线即定位语、磬即方位语，
// 随喜走聊天快捷语原文（话在聊天室落行，光在星图上绽放，同一句致意两处兑现）。

// ④ 随喜一按：同修升位/横超/及第的一刻，浮一枚小钮六秒；一按全房其珠绽金三环
let cheerTarget = { id: '', until: 0 };
let cheerChipT = 0;
const cheerChip = el('<button id="cheerChip" class="ui" hidden>🙏 随喜</button>');
app.appendChild(cheerChip);
{
  const c2 = document.createElement('style');
  c2.textContent = `
#cheerChip{left:50%;transform:translateX(-50%);bottom:calc(154px + env(safe-area-inset-bottom));z-index:26;
  padding:8px 18px;border-radius:20px;cursor:pointer;font-family:inherit;font-size:var(--fs-sm);letter-spacing:2px;
  border:1px solid rgba(232,199,102,.5);background:rgba(20,17,34,.84);color:#e8c766;
  -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}
#cheerChip[hidden]{display:none}
#peerWin{pointer-events:auto;cursor:pointer}
#conPill.calm{animation:none;opacity:.6;border-color:rgba(215,170,69,.35)}`;   /* 及第横幅可按随喜；候轮胶囊静息 */
  document.head.appendChild(c2);
}
cheerChip.addEventListener('click', () => {
  cheerChip.hidden = true;
  if (Net.active) { Net.sendChat('隨喜讚歎 🙏'); playSfx('sfx-tap', 0.22); }
});
let netMyPosLast = '';   // ⑥ 相遇判据：上一拍我居何位（我新至或彼新至皆算一拍相聚）
function cheerOffer(playerId        ) {
  cheerTarget = { id: playerId, until: Date.now() + 45000 };
  if (!Net.active || playerId === Net.myId) return;
  cheerChip.hidden = false;
  (cheerChip       ).textContent = zh('🙏 随喜');
  if (cheerChipT) clearTimeout(cheerChipT);
  cheerChipT = window.setTimeout(() => { cheerChipT = 0; cheerChip.hidden = true; }, 6000);
}
function cheerBloom(atId        ) {
  const b = netBeads[atId];
  const wp = b && b.sprite.visible ? b.sprite.position.clone()
    : (atId === Net.myId && sfpS.pos ? sfpWorldPos(sfpS.pos, new THREE.Vector3()) : null);
  if (!wp) return;
  [0, 220, 440].forEach((delay, i) => window.setTimeout(() => {
    const ring = impactSprite(ringTex);
    (ring.material                        ).color.set(i === 1 && b ? (b.color || '#f4e6b8') : '#f4e6b8');
    ring.position.copy(wp);
    impacts.push({ spr: ring, t: 0, dur: 0.6, kind: 'ring', s: 0.5 + i * 0.16 });
  }, delay));
  playBell(523, 0.05);
}

// ⑤ 贈掷光缯：施与既定，一道金线自施者位弧到受者位——布施全场看得见（线即既有定位语汇）
let lastGrantGiver = '', lastGiftKey = '';
function netGiftBeam(room     ) {
  if (room.pendingGrant && room.pendingGrant.giverId) lastGrantGiver = room.pendingGrant.giverId;
  const g = room.gift;
  const key = g && g.recipientId ? `${g.recipientId}|${Number(g.remaining) || 0}` : '';
  if (g && g.recipientId && key !== lastGiftKey && lastGrantGiver) {
    if (!lastGiftKey || lastGiftKey.split('|')[0] !== g.recipientId) {   // 只在「定人」那一拍画线，扣掷数不重画
      const gp = Net.players.find((p) => p.id === lastGrantGiver);
      const rp = Net.players.find((p) => p.id === g.recipientId);
      if (gp?.pos && rp?.pos && SFP_BY[gp.pos] && SFP_BY[rp.pos] && gp.pos !== rp.pos) showTrailLink(gp.pos, rp.pos);
    }
    lastGiftKey = key;
  } else if (!g) { lastGiftKey = ''; lastGrantGiver = ''; }
}

// 控制台呼吸纪律（联机极简）：掷轮胶囊只在「真轮到您」时呼吸；候轮/结算期静息压暗——
// 呼吸是行动之邀，不该整局都在喘
function conPillCalm() {
  conPill.classList.toggle('calm', Net.active && !Net.canToss());
}

// R1 之二：脉签该座色点闪一记（_pillSync 每拍重绘 innerHTML，闪记是瞬态类，重绘吞掉也无妨）
function netDotFlash(playerId        ) {
  const idx = Net.players.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  document.querySelectorAll('.netDots').forEach(dots => {
    const pd = dots.querySelectorAll('.pd')[idx];
    if (pd) { pd.classList.add('flash'); window.setTimeout(() => pd.classList.remove('flash'), 950); }
  });
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
      if (!sfpS.active) { clearTransit(); return; } // 局在直达途中被收（联机共同结算插进来）：转场页须自收，否则星河满屏不退
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
      if (!sfpS.active) { setTransit(false); return; } // 同上：局已收也要把 sfpTransit 放掉（fadeTransit 自会收转场页）
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
    if (seq !== sfpMoveSeq) return;                  // 新一手已接管转场，勿代收
    if (!sfpS.active) { clearTransit(); return; }    // 局已收而彗星未起：转场自收，免掷钮永远停在「行棋中…」
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
    // 成佛的一手不发：服务器在掷落定时已当即代为交轮（无贈可择、无后续可确认），
    // 此刻再发只会换来一句「当前没有待确认的本手」。
    if (Net.active && !sfpS.finished) Net.finishTurn();
  };
  if (!sfpS.pos) {
    const p0 = (SFP_POS         ).find(p => p.start === combo);
    if (p0) {
      vib(15);
      // 首掷判词释义＝廿一因义读＋本位白话（从前传空串，卡上渲出光秃「释义：」标签）
      const d1w = [SFP_D1_CAPTION[p0.id], posGist(p0.id)].filter(Boolean).join('——');
      showVerdict(`${SFP_DIR_BADGE.start}因地<b class="vdst">「${p0.name}」</b>，自此起行`, d1w, '行 ▸', () => {
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
    // v389 字义解末位兜底：谱注与通例引文皆无时，依卷首表法给逐位字义解（另栏署名，不冒谱曰）
    return makeSfpGlyphEvidence(id, c) || undefined;
  };
  const mv = (p.moves         ).find(m => m.c.includes(combo));
  if (!mv) {
    const w = why(p.id, combo);
    vib(10);
    showVerdict(`${SFP_DIR_BADGE.stay}此位不行，安住<b class="vdst">「${p.name}」</b>`, w || makeSfpInterpretationEvidence('原谱于本位未列此组合，依谱例安住不行。'), '安住 ▸', () => {
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
    if (dir === 'pure') setTimeout(() => { // 横超落定只留经证一句（2026-08-15 三刀剪尾）：「永離退緣」为疑城谱注原文；行法解说不缀
      if (sfpS.active && sfpS.pos && SFP_BY[sfpS.pos] && SFP_BY[sfpS.pos].pure)
        showToast('已入净土——谱曰「然亦永離退緣。」（卷第六·淨土疑城譜注）', 4200);
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
function sfpQuiet(on         ) { // 掷轮静场：暗纱罩景、星名隐去，只留轮与六字
  sfpVeil.classList.toggle('on', on);
  labelLayer.style.opacity = on ? '0.08' : '';
  // v385 敛景（用户令去视觉噪音）：顶栏、门梯、控制台上部一并压暗——掷轮一刻屏上只余轮
  topbar.classList.toggle('hush', on);
  ladder.classList.toggle('hush', on);
  sfpBar.classList.toggle('hush', on);
}
// v360 行棋节奏：前五掷完整仪轨（初学者看清掌心→旁掷→定相），第六掷起旋时/停留收紧——
// 一局常几十掷，固定 2.12s 前摇是后期最实的摩擦；义理不减（仍长按称名、仍判词点行）
function tossFastOn()          { return sfpS.n > 5; }
// 判词是否正等本座落子。判词卡只为本座的一手而出（远端行棋不落判词），联机下亦然——
// 服务器可能已代为交轮（成佛手当即交轮、兜底闹钟代收），相位早不在 resolving，
// 判词仍归本座行毕：本地落子与服务器已裁的去处同源同果，不会两本账。
function verdictMine()          {
  return sfpS.active && !!verdictFn && !sfpTransit;
}
// 依「置輪掌心，仰手旁擲」：按住→置輪掌心至心称念；松手→旁掷
function sfpPalmDown() {
  // v360 连掷一手：判词在场时按掷钮＝先落子再起新掷（守「判词不自动关」——此关闭由用户按下所发起，
  // 非计时自动收；只在掷钮上生效，判词窗自身仍等用户点「行 ▸」或下滑收签）
  if (verdictMine()) { commitVerdict(); return; }
  if (!sfpS.active || sfpS.rolling || sfpTransit) return;
  if (sfpS.finished) {
    showToast(zh(Net.active && !Net.isFinished()
      ? '本座已达本局终位——其余莲友继续行谱，最后一位莲友到达终局后共同结算'
      : '本局已经结束，请从结算面板开始下一局'), 3000);
    syncRollGlow();
    return;
  }
  // 暂离者点掷轮即视为自请归队：从前这里只反复提示「请候某某行谱」，
  // 而暂离者永远等不到轮次，唯一出路是刷新页面重进——没人猜得到。
  if (Net.active && Net.isAway()) {
    if (Net.wakeUp()) showToast(zh('已归队'), 2200);
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
  (sfpRollBtn.querySelector('#rollTxt')               ).textContent = zh('松手即掷');
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
  // v386 用户令：引领一句「至心称念」＋六字（六字静置不作呼吸动画，不给用户节拍压力）
  const chantEl = sfpDice.querySelector('#sfpChant')               ;
  chantEl.innerHTML = `<em>${zh('至心称念')}</em>` + '南无阿弥陀佛'.split('').map(c => `<b>${zh(c)}</b>`).join('');
  startWheelPalm();
}
function sfpPalmAbort() { // 掌心态中断（松手旁掷/endSfp/联机强制水合共用）：撤 hold 金底、清进度环、复位钮文与称念行
  palmHeld = false;
  sfpRollBtn.classList.remove('hold');
  window.clearInterval(ringIt);
  (sfpRollBtn.querySelector('#rollTxt')               ).textContent = zh('长按掷轮');
  // 称念不在此清（2026-07-30 用户令：第一次掷轮也要看得见「至心称念」六字）——
  // 快速点按者掌心态一闪而过，称念随轮旋一路挂到定相，在 settle 回调处退场
}
function sfpPrepareTossRelease() {
  sfpPalmAbort();
  sfpRollBtn.classList.add('dis');
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
    (sfpDice.querySelector('#sfpChant')               ).textContent = ''; // 轮停定相，称念退场留白看轮相
    playBell(294, 0.045);
    sfpTimer = window.setTimeout(() => {
      sfpDice.classList.remove('on');
      sfpQuiet(false);
      // rolling 保持到判词卡 commit，防判词未行又起新掷
      sfpApply(combo);
    }, tossFastOn() ? 380 : 620); // v360 定相停留同步收紧
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
// ── 观画档（2026-08-14 档三，发起人定案）：隐一切界面与题字，整屏即一幅壁画 ──
// 讲经投屏、截图取景、海报素材皆用此档。出入极简：谱务菜单一行进、右上一枚 ✕ 出；
// 只动显隐不动状态——转场/联机/巡游照常在底下走（导览的钟在观画期原地候着，见 tourPlan），
// 回界面一切如旧。#artX 不入 .ui（否则把自己也藏了）。
let artOn = false;
const artX = el('<button id="artX" type="button" title="回界面" aria-label="退出观画">✕</button>');
{
  const acss = document.createElement('style');
  acss.textContent = `
#artX{display:none;position:fixed;top:calc(12px + env(safe-area-inset-top));right:calc(14px + env(safe-area-inset-right));
  width:44px;height:44px;border:1px solid rgba(255,240,200,.3);border-radius:10px;background:rgba(4,26,30,.42);
  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:#e9dcba;font-size:17px;cursor:pointer;z-index:36}
body.artView #artX{display:block}
body.artView .ui,body.artView #labels,body.artView #tourBar{display:none!important}`;
  document.head.appendChild(acss);
  document.body.appendChild(artX);
  artX.addEventListener('click', () => setArtView(false));
}
function setArtView(on         ) {
  artOn = !!on;
  if (artOn) { closeOverlay(); hideToast(); }   // 卡与话皆不入画
  document.body.classList.toggle('artView', artOn);
  playSfx('sfx-tap', 0.2);
}
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
    <button class="smStat" id="smTrail"><span>本局升沉</span><b>${currentName}</b><i>${cur ? `第 ${sfpS.n} 掷 · 逐掷回看 ›` : currentMeta}</i></button>
    <div class="smSection">
      <div class="smList">
      ${Net.active ? row('smNet', '同修面板', `${Net.locked ? '🔒 ' : ''}名单与聊天`) : ''}
      ${row('smArt', '观画', '隐一切界面 · 整屏即画')}
      ${Net.active && Net.isPlaying() && !Net.isAlone()
        ? ''  /* 共修局中（二人以上）无单人重开：本局是全房的，下一局走结算后共同准备 */
        : row('smNew', '重开一局', Net.active && Net.isPlaying() ? '从头掷 · 本室唯您一人' : '从头掷', 'warn')}
      ${row('smExit', '退出', Net.active ? '离席并回题屏' : '行处已存 · 回题屏', 'warn')}
      </div>
    </div>
    <button class="gbtn primary" id="smBack">回到局中</button></div></div>`);
  const on = (id, fn) => { const b = p.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
  // 全谱走右侧天梯、大厅与我的在右上角、原文与设置收在「我的」里——屏幕上已有的入口
  // 不在菜单里再来一遍。本局升沉例外双入口（菜单＋轮相牌）：牌上题头撤后牌义转隐，菜单补明入口。
  on('smBack', closeOverlay);
  // 「当前行处」纯展示条换「本局升沉」入口（2026-08-12 用户点单）：点开逐掷回看
  on('smTrail', () => { closeOverlay(); openSfpTrail(); });
  on('smArt', () => { closeOverlay(); setArtView(true); });
  on('smNet', () => { closeOverlay(); Net.openPanel(); });
  // 从前全站没有一处「退出」：局中只能靠成佛或离席，观照期只能关标签页。
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
    if (Net.active && Net.isPlaying() && !Net.isAlone()) { closeOverlay(); showToast(zh('共修局进行中不可单独重开——结算后全房共同准备下一局'), 3600); return; } // 一人局照开（见 newRound）
    if (sfpTransit || (sfpS.rolling && !(verdictFn && !Net.active))) { closeOverlay(); showToast('行棋中，稍候再新开'); return; } // 单机判词期放行（cancelVerdict 在后善后）
    if (this.dataset.arm) {
      closeOverlay();
      newRound({ confirm: false });   // 两击已是确认，不再叠一层卡；棋盘当即归零，「已新开一局」那句回执随之撤
      return;
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
function openLogbook(backTo        ) { // backTo：同路往返（「我的→见闻录」关卡回「我的」）
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
    <div class="lgNums">
      <div><b>${lg.games}</b><span>开局</span></div><div><b>${lg.tos}</b><span>称名</span></div>
      <div><b>${lg.up}</b><span>升</span></div><div><b>${lg.back}</b><span>沉</span></div>
      <div><b>${lg.evil}</b><span>入恶趣</span></div><div><b>${save.sfpWins || 0}</b><span>成佛</span></div>
    </div>
    <div class="lgWrap lgG2">${rows}</div>
    <details class="sec"><summary>谱主作谱之意</summary>
      <div class="verse" style="margin-top:6px"><i class="duL">敘</i>能使人即遊戲間。頓知六道往還之疲苦。三乘出要之差別。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div>
      <div class="cNote">只记掷数、升沉次数和曾见之位；不计先后，不判高下。</div></details></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="gbtn primary" id="lgGo" style="flex:1 0 100%">${sfpS.active ? '回到局中' : '入选佛场'}</button>
      <button class="gbtn" id="lgMap" style="flex:1">十五门全图</button>
      <button class="gbtn" id="lgOk" style="flex:1">关闭</button></div></div>`);
  // 内部跳转先解除返程回调（plazaNavAway 同构）：否则 closeOverlay 会把 backTo 误发、连锁重开旧页
  (p.querySelector('#lgGo')               ).addEventListener('click', () => {
    overlayOnClose = null; closeOverlay();
    if (!sfpS.active) openSfpIntro();
  });
  (p.querySelector('#lgMap')               ).addEventListener('click', () => { overlayOnClose = null; closeOverlay(); openSfpMap(); });
  (p.querySelector('#lgOk')               ).addEventListener('click', closeOverlay);
  p.querySelectorAll('.lgRow').forEach(row => row.addEventListener('click', () => {
    overlayOnClose = null; closeOverlay();
    // 关门卡即回见闻录（同路往返，与「我的→设置」同构）——归一前的「回见闻录」钮遂免
    openDoor(Number((row               ).dataset.dn), { backTo: () => openLogbook() });
  }));
  openOverlay(p);
  if (backTo) overlayOnClose = () => { overlayOnClose = null; backTo(); };
}
// v391 归一：门要卡（原 openDoorBrief）已并入门卡 openDoor 的第一、二段（门义＋位次一览）。

// 轮相表法：依原谱卷一「輪相表法第一」原文，不加今解
const SFP_PLAIN                         = {
  '那': '是見煩惱（分別惑）', '謨': '是愛煩惱（俱生惑）',
  '阿': '表布施', '彌': '表持戒', '陀': '表禪定', '佛': '表無漏善慧',
};
const sfpPlain = (combo        ) => combo.split('').map(ch => `「${ch}」${SFP_PLAIN[ch] || ''}`).join(' + ');
function openSfpHelp({ backTo = null } = {}) {
  const hasSave = !!(save.sfp && SFP_BY[save.sfp.pos]);
  const canStart = !sfpS.active && !Net.active;
  const cta = sfpS.active ? '回到局中' : Net.active ? '我明白了，返回等候'
    : hasSave ? '我明白了，续掷上局' : '我明白了，开始行谱';
  const row = (ch        , good         ) => `<div style="display:flex;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(215,170,69,.15)">
    <span style="width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center;font-size:var(--fs-xl);
      border:1.5px solid ${good ? '#d7aa45' : '#b05a42'};border-radius:8px;color:${good ? '#f4e6b8' : '#f0af9e'}">${ch}</span>
    <span style="font-size:var(--fs-md);color:#e6d9ab">${SFP_PLAIN[ch]}</span>
    <span style="margin-left:auto;font-size:var(--fs-xs);color:#9d9170">${good ? '表善' : '表惡'}</span></div>`;
  const h = (t        ) => `<div class="cMeta" style="margin:12px 0 5px;border-bottom:1px solid rgba(215,170,69,.3);padding-bottom:3px">${t}</div>`;
  // 初学者先会操作，再按需展开原谱依据；逐字引文、释义、项目规则与现实修证边界分栏陈列。
  const p = el(`<div class="panel"><h2>选佛谱 · 谱意与玩法</h2><div class="body">
    <div class="igLead">《选佛谱》用两枚六面轮，把十法界因果与佛法修学次第呈现在一张行谱图中。<b>它不是占卜</b>：本局位次不代表玩家现实中的根机、业力、吉凶、证位或未来去处。</div>
    <div class="cNote">“轮相”是两枚轮各落出一个字所成的组合；“判词”说明这次从哪里到哪里，以及为什么这样判。</div>
    ${h('三 步 开 始')}
    <div class="igStep"><span class="n">1</span><span class="tx"><b>长按“掷轮”</b>，称念一声“南无阿弥陀佛”；念完松手，两枚轮各落出一个字。</span></div>
    <div class="igStep"><span class="n">2</span><span class="tx"><b>先看判词</b>：第一掷只决定本局起点“发始因地”；以后每掷都按当前位的原谱行法表判定。</span></div>
    <div class="igStep"><span class="n">3</span><span class="tx"><b>点“行”确认</b>，棋子才移动。位名看不懂可直接点开；要核对依据，可展开原文。</span></div>
    ${h('怎 样 判 定')}
    <div style="font-size:var(--fs-md);color:#dccf9f;line-height:1.75">
    · 全谱共有十五门、二百二十位；同一轮相在不同位，可能上进、下沉、安住、不行或赠掷，<b>一律以当前位的判词为准</b>。<br>
    · “不行”是本次不移动；“赠掷”是按判词提示再掷一次或数次。<br>
    · 落入地狱、饿鬼等位不是淘汰，也不立即判负；后来如何，以实际轮相为准。<br>
    · 游戏内到达“佛”位，即为选佛及第、本局结束；<b>这只是图谱行棋结果，不等同现实修证成佛</b>。</div>
    <details class="sec"><summary>六字如何表法</summary>
      <div class="cNote">“那、謨表恶；阿、彌、陀、佛表善”是总表法，不是六个固定的升降按钮。实际去向仍以本位行法表为准。</div>
      <div style="margin:8px 0">${row('那', false)}${row('謨', false)}${row('阿', true)}${row('彌', true)}${row('陀', true)}${row('佛', true)}</div>
      <div class="cRead" style="margin:5px 0"><b>四层义：</b>① 那謨表恶，阿彌陀佛表善；② 那是见烦恼，謨是爱烦恼；③ 阿表布施、彌表持戒、陀表禅定、佛表无漏善慧，另以阿彌陀表有漏善、佛表无漏善；④ 约出世慧，阿表生灭门、彌表无生门、陀表次第门、佛表圆顿门。具体到某一位采用哪一层，以本位谱注为准。</div>
    </details>
    <details class="sec"><summary>原谱为何使用佛号六字</summary>
      <div class="verse" style="margin-top:6px"><i class="duL">谱曰原文</i>輪如占察輪相。而作六面。以那謨阿彌陀佛六字。順次右旋。刻於六面。置輪掌心。仰手旁擲。<span class="cSrc" style="display:block">《選佛譜》卷第一 · 輪相表法第一</span></div>
      <div class="cRead" style="margin-top:6px">原谱以佛号六字代替普通数字。原谱的实物掷法是“置轮掌心，仰手旁掷”；本项目将它转化为长按、松手的数字操作。（长按掷轮时称念一声“南无阿弥陀佛”，念完松手掷出。请以恭敬心操作。）</div>
      <div class="cNote">原谱所说的功德在闻名、称名，不在按钮或随机结果本身。</div>
    </details>
    <details class="sec"><summary>什么是竖入与横超</summary>
      <div class="igTwo"><div><b>豎入</b><span>依所修教法，按断惑证位的次第进修。</span></div>
        <div><b>橫超</b><span>依阿弥陀佛愿力，发愿往生极乐净土；入净土位后仍依本位行法继续，并非立即毕局。</span></div></div>
      <div class="cNote">第十四门呈现净土横超之路；游戏操作不等同现实往生。</div>
    </details>
    <details class="sec"><summary>蕅益大师为何作此谱</summary>
      <div class="cRead" style="margin-top:6px">蕅益大师见法友耽嗜博弈，思以选佛之图代替；五十五岁行至歙浦，十三日成谱。大师希望人在游戏之间，看见六道往还的疲苦与三乘出离要道的差别；谱中升沉去向皆依教乘，不出臆见。</div>
      <div class="verse" style="margin-top:6px"><i class="duL">敘</i>能使人即遊戲間。頓知六道往還之疲苦。三乘出要之差別。<span class="cSrc" style="display:block">《選佛譜》卷第一 · 敘選佛譜敘</span></div>
      <!-- 二轮定本缘起（2026-08-13 发起人拍板加入）：与 sfp-data SFP_META.preface 同源——
           一轮之隔、六轮之苦、二轮定本三折，把「为什么是您手上这两枚轮」交了底。 -->
      <div class="cRead" style="margin-top:8px"><b>二轮定本的由来：</b>幽溪大师旧图只用一枚佛骰，“升沉迴隔”难以贯通；蕅益大师先制六轮之图，又见“六字纷陈”，粗心浮气的人每以为苦；辛卯年冬归卧灵峰，才改定为两枚轮——既容易上手，变化仍足。您此刻手中的两枚轮，正是那次改定的形制。</div>
      <div class="verse" style="margin-top:6px"><i class="duL">大師自敘</i>爰思但用二輪。以為擲行方便。既易於行。仍多轉變。<span class="cSrc" style="display:block">《選佛譜》卷第一 · 大師自敘</span></div>
    </details>
    <details class="sec"><summary>更多操作</summary>
      <div class="cRead" style="margin-top:6px">判词里点位名可读白话与原文；点“问”可询问谱位、名相和行法；“⋯”中可回看本局升沉。桌面可用空格掷轮、回车确认“行”。</div>
    </details></div>
    <div style="margin-top:12px"><button class="gbtn primary" id="sfpHelpOk" style="width:100%">${cta}</button></div></div>`);
  (p.querySelector('#sfpHelpOk')               ).addEventListener('click', () => {
    if (canStart) {
      overlayOnClose = null;
      closeOverlay();
      (save       ).sfpHelp = true; persist();
      titleHide();
      startSfp(hasSave);
      return;
    }
    if (sfpS.active) overlayOnClose = null; // 主钮「回到局中」不应把题屏重新点亮
    closeOverlay();
  });
  openOverlay(p);
  if (backTo) overlayOnClose = () => { overlayOnClose = null; backTo(); };
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
  clearTransit();                    // 上一局若有未收的转场页/彗星，开局即断
  setModeInstant(0);
  sfpS.active = true; sfpS.rolling = false; sfpS.finished = false;
  armBackGuard(); // 局中返回键＝缓退（先提示行处已存，再按一次才离开）
  sfpVictoryHandled = false;
  sfpVictoryWait = 0;
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
    sfpShowMsg('先掷發始因地');
    // 首掷 toast 已撤（2026-08-15 提示语三刀）：讯息行已示「先掷發始因地」，掷法首识卡已教，不再叠说
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
  // v352 开局动线去重：题屏引导卡已含缘起/主旨＋掷法三步＋轮相六字，首局不再自动叠一张
  // 「谱意与玩法」全卡（原三遍重复：题屏卡→谱意卡→toast）；全卡仍可从谱务菜单读。
  // 联机已开局时同理（轮次限时立刻开始跑，教程改在准备室里出，见 Net.onJoined）。
  if (!(save       ).sfpHelp && !(Net.active && Net.isPlaying())) { (save       ).sfpHelp = true; persist(); } // 首掷教学 toast 已撤（2026-08-15 三刀），只记「已识途」档
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
  sfpWheelGroup.visible = false; wheelAnim = null; sfpPalmAbort(); sfpBonusLeft = 0; // 中途散局若正长按：hold 金底与进度环一并撤
  sfpQuiet(false);
  setSfpFocus(0);
  if (sfpTimer) clearInterval(sfpTimer);
  clearTransit(); // 含 cometCancel/setSkip(null)，并把转场页收回——中途散局不留满屏星河
  doorDiveSeq++;
  cancelVerdict();
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
let sfpVictoryWait = 0; // 收局等落定的起表时刻（0＝未在等）
function sfpVictory(settled = false) {
  if (!sfpS.active || sfpVictoryHandled) return;
  // 共修终局规则（2026-08-04 用户定案）：先成佛者当下即演成佛过场、出成佛面板，留座随喜；
  // 其余莲友继续行谱，直到末位成佛服务器才共同结算（届时本座看共同结算卡，不再重演庆祝）。
  // 收局须等本手乘光落定。联机的「共同结算」常在本座这一手飞行途中送达（末位成佛时服务器当即收局），
  // 半途把 sfpS.active 置 false，在途的直达/彗星回调便全数早退——转场页与 sfpTransit 再无人收，
  // 人就一直卡在星河转场里。故先候落定，再收局；转场若久不结束（六秒）则强收兜底。
  if (sfpTransit) {
    if (!sfpVictoryWait) sfpVictoryWait = Date.now();
    if (Date.now() - sfpVictoryWait < 6000) { window.setTimeout(() => sfpVictory(settled), 300); return; }
    clearTransit();
  }
  sfpVictoryWait = 0;
  sfpVictoryHandled = true;
  vib([30, 60, 30, 60, 140]); // 成佛庆祝振
  save.sfpWins = (save.sfpWins || 0) + 1;
  if (!Net.active) save.sfp = null; // 单机存局功成即了；共修局从不写本机存局，也不得清别局的档
  persist();
  const n = sfpS.n;
  const trailSnapshot = sfpS.trail.slice();
  sfpS.active = false; sfpS.finished = true; sfpS.pos = null;
  clearTransit(); // 收局即断一切在途转场：成佛面板不该被残留的星河页盖住
  document.body.classList.remove('sfpOn');
  sfpBar.classList.remove('show'); conPill.classList.remove('show');
  setSfpFocus(0);
  sfpDice.classList.remove('on');
  freeDock.style.display = ''; syncFreeDock();
  setFlight(true);
  updateLadder();
  updateModeChip();
  playBell(524, 0.06);
  // 成佛过场：金光遍照·莲花绽放，后出成佛面板
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
      <div><b>${save.lg.back}</b><span>历局下沉</span></div><div><b>${save.sfpWins}</b><span>历局及第</span></div>
    </div>
    <div class="verse" style="margin-top:10px"><i class="duL">紀事</i>願以此功德。普施法界有情。同開妙解。深知法界事理性相。同發大願速生西方極樂世界。<span class="cSrc" style="display:block">《選佛譜》卷末 · 紀事（卷第六後）</span></div>
    ${Net.active && !Net.isFinished() ? '<div class="cNote">本座已达本局终位，留座随喜——其余莲友继续行谱，待最后一位莲友到达终局即共同结算。</div>' : ''}
    <div id="lbLine" style="margin-top:10px;font-size:var(--fs-sm);color:#dccf9f">
      <div style="margin-bottom:5px"><b>${zh('本局已经结束')}</b> · ${zh(`本机已完成选佛 ${save.sfpWins} 局`)}</div>
      <div class="cNote" style="margin-bottom:7px">${zh(`本项目统计规则：每完成一掷，系统按一声「南无阿弥陀佛」计入今日念佛功课榜；本局共 ${n} 掷，记 ${n} 声。此为游戏记录口径。`)}</div>
      <button class="gbtn" id="lbView" style="width:100%">${zh('查看念佛功课榜')}</button>
    </div>
    ${(() => { // 同座现况：只陈述各人行处，不排名次——本谱纯由掷相所至，比快慢无义
      if (!Net.active) return '';
      const o = Net.players.filter(q => q.id !== Net.myId);
      if (!o.length) return '';
      return `<div style="margin-top:8px;font-size:var(--fs-sm);color:#9d9170">同座：` +
        o.map(q => `<span style="color:${q.color}">${esc(q.name)}</span> ${q.done ? `已选佛及第（第 ${q.n} 掷）` : (q.n ? `第 ${q.n} 掷行谱中` : '未起行')}`).join(' · ') +
        `</div>`;
    })()}</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="gbtn primary" id="sfpAgain" style="flex:1;min-width:110px">${Net.active ? '准备下一局<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">等莲友共同准备</i>' : '再入选佛场'}</button>
      <button class="gbtn" id="sfpManual" style="flex:1;min-width:110px">修行手册<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">问谱结此局升沉</i></button>
      <button class="gbtn" id="sfpLg" style="flex:1;min-width:110px">见闻录</button>
      ${Net.active ? '<button class="gbtn" id="sfpLeave" style="flex:1;min-width:110px">离席回大厅<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">让座给莲友</i></button>' : ''}
      <button class="gbtn" id="sfpFree" style="flex:1;min-width:110px">观照星图${Net.active ? '<i style="display:block;font-size:var(--fs-xs);font-style:normal;opacity:.7">留座旁观</i>' : ''}</button></div></div>`);
  fo15Fill(p);   // 佛位逐字原文占位回填（须在 el() 跑完 zh() 之后）
  // 成佛面板和别的卡一样可以被 ✕／点背景／滑动关掉，但从前只有卡上那几个钮会收尾——
  // 手关就什么都不清：唱赞照唱、乘光流星挂在天上、局面停在「活局在终点」的僵尸态。
  // 现在把「关掉这张卡」一律解释为「入自由观照」，与「观照星图」同一个出口。
  const leaveVictory = (msg = '本局至此选佛及第——已入自由观照，点「选佛」可再入选佛场') => {
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
      // 一人室「再开一局」＝一个动作直接开（2026-08-15 一动作原则）：soloStart 内含先准备后开局
      if (!Net.isPlaying() && Net.players.filter((q) => q.online).length <= 1) { Net.openPanel(); Net.soloStart(); return; }
      const sent = Net.setReady(true);   // 新局已在他人之间开打时 setReady 静默拒发——不可假报「已准备」
      Net.openPanel();
      showToast(sent ? '已准备下一局' : '本局已在进行，您先旁观——本局结束后再点准备', 4200);
    } else startSfp(false);
  }));
  (p.querySelector('#sfpManual')               ).addEventListener('click', takeAction(() => openSfpReading(sfpManualQuestion(true))));
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
  // 成佛只自动登记为大厅结算动态与“今日成佛”统计，不形成第二套榜单或手动上榜步骤。
  // 联机局的成佛由本室服务器出具（掷数取权威棋况），前台不再自报——自报的房间战绩无从核实。
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
// 共同结算卡：本局了结时，未成佛者与旁观者也该看到一张交代结果的卡。
// 从前只有成佛者有面板，其余人只在掷轮钮下多一行小字，共修最该共有的一刻反而没有画面。
function openNetSettle(message         ) {
  if (!Net.active) return;
  const aborted = message?.reason === 'not_enough_players';
  // 成佛名录以服务器快照为先（含结算前已离席的成佛者），在座名单只作旧协议兜底
  const winners = (Array.isArray(message?.champions) && message.champions.length
    ? message.champions
    : Net.players.filter(q => q.done)).filter(q => q && q.name);
  const me = Net.me();
  const mine = me?.done
    ? `本座第 ${me.n} 掷选佛及第`
    : (me?.spectator ? '本局您在旁观，下一局即可入座'
      : (me?.n ? `本座行至第 ${me.n} 掷${sfpS.pos && SFP_BY[sfpS.pos] ? `，现居「${esc(SFP_BY[sfpS.pos].name)}」` : ''}` : '本座本局未起行'));
  const roster = Net.players.map(q => `<div class="nsRow">
      <span class="dot" style="background:${esc(q.color || '#e8c766')}"></span>
      <b>${esc(q.name)}${q.id === Net.myId ? '（我）' : ''}</b>
      <span>${q.done ? `第 ${q.n} 掷选佛及第` : (q.spectator ? '候下局' : (q.n ? `第 ${q.n} 掷` : '未起行'))}</span>
    </div>`).join('');
  const head = aborted ? '本局中止' : (winners.length
    ? `${winners.map(q => esc(q.name)).join('、')}本局选佛及第`
    : '本局已共同结算');
  const p = el(`<div class="panel nsPanel"><h2>共同结算</h2><div class="body">
    <div class="cMeta">${esc(Net.roomLabel())} · 第 ${Net.room.round || 1} 轮</div>
    <div class="nsHead">${head}</div>
    <div class="nsMine">${mine}</div>
    ${aborted ? '<div class="cNote">室内无人续行，本局未及结算即止。</div>' : ''}
    <div class="nsList">${roster}</div>
    <div class="cNote">本谱纯由掷相所至，同座只陈行处，不较先后。</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="gbtn primary" id="nsAgain" style="flex:1;min-width:110px">准备下一局</button>
      <button class="gbtn" id="nsLeave" style="flex:1;min-width:110px">离席回大厅</button>
      <button class="gbtn" id="nsFree" style="flex:1;min-width:110px">观照星图</button>
    </div></div></div>`);
  // 与成佛面板同例：手关这张卡＝入自由观照，不留半死不活的局面
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
// 同修成佛：金色横幅一记磬声，不弹窗不打断——您可能正握着轮，成佛是可随喜之事，不是要处理之事
let peerWinT = 0;
const peerWinEl = el('<div id="peerWin" class="ui"></div>');
app.appendChild(peerWinEl);
// ④ 及第横幅即随喜之门：横幅上本就题着「随喜」，点它即致意（样式侧已放开 pointer-events）
peerWinEl.addEventListener('click', () => { if (Net.active) { Net.sendChat('隨喜讚歎 🙏'); playSfx('sfx-tap', 0.22); } });
// 共同开局金横幅（2026-08-12 批）：开局是全局最有仪式感的一刻，从 toast 升格为金字幕＋磬。
// 与成佛横幅分立两元素：先成佛者的横幅与下一局开局可能相近出现，不互相吞。
let matchBeginT = 0;
const matchBeginEl = el('<div id="matchBegin" class="ui"></div>');
app.appendChild(matchBeginEl);
function sfpMatchBegin() {
  matchBeginEl.innerHTML = `<b>${zh('共同开局')}</b><i>${zh('依入座次序轮流掷轮')}</i>`;
  matchBeginEl.classList.add('show');
  playBell(524, 0.06);
  vib(30);
  clearTimeout(matchBeginT);
  matchBeginT = window.setTimeout(() => matchBeginEl.classList.remove('show'), 3600);
}
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
// 大厅内程序化转场必经此口：先解除手关回调再停表——否则 closeOverlay/openOverlay 连锁会把
// 「✕＝回题屏」的回调在转场中误发（openOverlay 入口先关旧层，旧层回调即刻执行，题屏会盖住新页）。
let plazaSideCtl = null;   // 大厅右墙茶寮的轮询句柄：离开大厅必停（host 断连虽会自停一拍，显式停更稳）
function plazaSideStop() { plazaSideCtl?.stop(); plazaSideCtl = null; }
function plazaNavAway() { overlayOnClose = null; plazaStop(); plazaSideStop(); }
let plazaGen = 0; // openPlaza 重入护栏：并发两次开厅时，旧一代的 draw/interval 见代号不符即退位（修幽灵 interval 泄漏）
function plazaSetJoining(on, code = '') {
  plazaJoining = !!on;
  const panel = document.querySelector('.pzPanel');
  if (!panel) return;
  panel.classList.toggle('joining', plazaJoining);
  panel.setAttribute('aria-busy', plazaJoining ? 'true' : 'false');
  const quick = panel.querySelector('#pzQuick');
  if (quick) quick.disabled = plazaJoining;
  // 入座途中九格一并禁点；点的那一间标 .sitting 亮着（原位即答「正入此室」），其余随面板压暗。
  panel.querySelectorAll('.pzR').forEach((button) => {
    button.disabled = plazaJoining || (button.classList.contains('s-full') && !button.classList.contains('mine'));
    button.classList.toggle('sitting', plazaJoining && !!code && button.dataset.code === code);
  });
  const label = panel.querySelector('#pzQuick em');
  if (label) label.textContent = zh(plazaJoining ? '正在入座…' : '随喜入座');
}

async function plazaSit(code, nameArg = '', needKey = false, keyArg = '') {
  const name = nameArg || Plaza.savedName();
  if (!name) { openPlazaSitName(code, keyArg, needKey); return; }   // 无存名：只问这一次（needKey 随行，免问完名先白打一次注定失败的请求）
  if (needKey && !keyArg) { openPlazaSitKey(code); return; }  // 上锁之室：先问密码
  if (plazaJoining) { showToast(zh('正在入座，请稍候'), 1800); return; }
  const ord = Plaza.TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
  if (Net.active) {
    if (Net.code === code) {   // 点的就是自己那室：召回面板。等候期大厅留在背后（等人是大厅的事），行谱中才切星图
      if (Net.isPlaying()) { plazaNavAway(); closeOverlay(); }
      Net.openPanel();
      return;
    }
    // 换室＝先让出原座。正在行谱时这一走可能中止全房的局，不能无声无息。
    if (!await confirmLeaveMatch(`离开本局，换到共修室${ord}`)) return;
  }
  plazaSetJoining(true, code);
  try {
    if (Net.active) await Net.leave({ notify: false });        // 一人只在一室：旧座释放后才能换房
    await Net.joinRoom(code, name, null, keyArg);
    // 等候室入厅（2026-08-11）：等人是大厅的事，行谱才是星图的事——
    // 等候/结算期面板浮于大厅之上（桌面居中如展开的房间卡），本局行谱中（含旁观）才关厅切星图。
    // 此判定必须在 joinRoom 兑现之后：承诺在首拍房态落地后才兑现，isPlaying 至此方可靠。
    if (Net.isPlaying()) { plazaNavAway(); closeOverlay(); }
    else if (!document.querySelector('.overlay:not(.bye) .pzPanel')) openPlaza(); // 从问名/密码卡或邀请链接来：先铺开大厅作等候的底（:not(.bye) 免把淡出中的旧厅当在场）
    Net.openPanel();
    // 中途入室是旁观，不是入局：这一句要说明白，免得他等一个不属于他的轮次
    showToast(zh(Net.isSpectator()
      ? `已入共修室${ord}——本局已开始，您在下一局入座`
      : `已入共修室${ord}`), 4200);
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

function openPlazaSitName(code, keyArg = '', locked = false) {
  plazaNavAway();
  const returnToPlaza = () => {
    overlayOnClose = null;
    openPlaza();
  };
  const p = Plaza.renderSitName(code, {
    el, esc, zh,
    onSit: (c, name) => {
      overlayOnClose = null;
      return plazaSit(c, name, locked, keyArg);   // locked 原样带回：上锁室问完名接着问密码，不先发注定失败的请求
    },
    onBack: returnToPlaza,
  });
  openOverlay(p);
  overlayOnClose = returnToPlaza;
  zhDom(p);
}

// ── 我的功课 ──
// 全站与个人用同一组列（累计 / 今日），上下一对照就懂——这是「一眼看懂」的机关所在。
// 月历原样是「格里日期、格下掷数」，一屏三十一个重复数字成了噪声——要看的本是「哪天修了、连了几天」，
// 不是每天精确几掷。故 2026-08-05 改念佛计数器的老规矩为深浅四档：格里只留日期，掷数以底色轻重说；
// 要精确数就点那一格，浮出「8月3日 · 3 掷」。满档以本月最高一日为准，任谁的掷数量级都自适应。
const MY_WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const dayKeyOf = (d          ) => {
  const bj = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000); // 北京时区日界，与服务器同口径
  return `${bj.getFullYear()}-${String(bj.getMonth() + 1).padStart(2, '0')}-${String(bj.getDate()).padStart(2, '0')}`;
};
const myKey = (y        , m        , d        ) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const myLvl = (n        , max        ) => (!n ? 0 : max <= 0 ? 1 : Math.max(1, Math.min(4, Math.ceil((n * 4) / max))));
function myMonthHtml(daily                          , year        , month        ) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;                 // 周一起头
  const last = new Date(year, month + 1, 0).getDate();
  const today = dayKeyOf(new Date());
  let sum = 0;
  let max = 0;
  for (let d = 1; d <= last; d++) { const n = Number(daily[myKey(year, month, d)] || 0); sum += n; if (n > max) max = n; }
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="myCell pad"></span>';
  for (let d = 1; d <= last; d++) {
    const key = myKey(year, month, d);
    const n = Number(daily[key] || 0);
    // 未到之日单列一档：否则本月才起头，剩下二十几格与「没修」同色，一开月历满眼荒废——失实且丧气
    const fut = key > today ? ' fut' : '';
    // button 而非 span：点得着即须可聚焦、可读屏；掷数另进 aria-label，不靠颜色独传信息
    cells += `<button type="button" class="myCell lv${myLvl(n, max)}${fut}${key === today ? ' now' : ''}"`
      + ` data-d="${month + 1}月${d}日" data-n="${n}" aria-label="${month + 1}月${d}日 ${n} 掷"><i>${d}</i></button>`;
  }
  return { html: cells, sum };
}
// 近七日迷你条：主页面上唯一留下的月历痕迹——一眼见连续，点开才是全月。
// 日界一律以北京今日为锚再逐日回推：若拿本机午夜去过 dayKeyOf，等于把时区偏移算了两遍，
// 东十三区之类会整条错开一日，与月历（cell 用 myKey、今日用 dayKeyOf(now)）对不上账。
function myWeekHtml(daily                          ) {
  const [ty, tm, td] = dayKeyOf(new Date()).split('-').map(Number);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(ty, tm - 1, td - i);
    days.push({ n: Number(daily[myKey(d.getFullYear(), d.getMonth(), d.getDate())] || 0), isToday: i === 0 });
  }
  const max = days.reduce((a, b) => Math.max(a, b.n), 0);
  return days.map(v => `<i class="lv${myLvl(v.n, max)}${v.isToday ? ' now' : ''}"></i>`).join('');
}
function openMine() {
  plazaNavAway();            // 全屏页入口通例（openStream/openPlaza 同构）：解除旧层回调，免 openOverlay 连锁产出孤儿浮层
  Net.closePanel();          // 同上：全屏页期间收起同修面板，看完再点「聊」唤回
  const lg = save.lg;
  const p = el(`<div class="panel pzPanel myPanel"><div class="fsShell">
    <header class="pzTop"><div><span class="pzEyebrow">选佛谱</span><h2>我的</h2></div></header>
    <div class="fsBody"><div class="fsWrap body"><div id="myMain"><div class="myLoad">正在取功课……</div></div></div></div>
  </div></div>`);
  openOverlay(p);
  zhDom(p);
  const body = p.querySelector('.body')               ;
  const main = p.querySelector('#myMain')               ;
  let mine                    = null;

  // 名号卡立在页首，只建一次、不随 paint 重绘（重绘会把正在输入的半个名号冲掉）。
  // 2026-08-16 发起人点单「放在我的页里，随时可改」：从前名号是页头右上一枚「…」小钮，
  // 点它先关掉整张「我的」再开一层全屏卡——今就地展开就地记下，改完还在这一页上。
  const idCard = Plaza.renderIdentity({
    el, zh,
    onSave: async (name) => {
      await Plaza.flush();      // 先把未送达的掷数送走，再推新名——否则那一拉取比改名快，动态上还是旧名
      await Plaza.pushName();
      showToast(zh(`功课自此记在「${name}」名下`), 3600);
    },
  });
  body.insertBefore(idCard, main);
  zhDom(idCard);

  const paint = () => {
    // 2026-08-05 极简收束（用户点单）：主页面只留「我的一张卡＋近七日一条＋三行去处」，
    // 全月月历移入弹窗（原占 ~640px，是全页最重一块）；名号收进页头右上，点即改名。
    // 全站两数降为卡下一行注脚——同一组数在大厅顶条已有一份，此处是「我的」页，主角不该是全站。
    // 2026-08-14 本地骨架即刻上屏（三失败修其三）：见闻/原文/设置皆本机之事，不该被功课取数绑架——
    // 从前整页只挂「正在取功课…」，断网或本地单跑（无 /api/plaza）时连设置都点不开。
    // 今功课卡自成一格：先占位、取到补数、取不到卡内如实说并可点重试，页其余照常可用。
    // 只重绘 #myMain：页首名号卡自管自的两态，不该被一次取数冲掉半截输入。
    main.innerHTML = `
      <div class="myCard">${mine ? `
        <i>我的累计</i><b>${myNum(mine.tosses)}</b>
        <span>今日 ${myNum(mine.today)} · 共修 ${myNum(mine.days)} 天 · 连续 ${myNum(mine.streak)} 日 · 成佛 ${myNum(mine.wins)}</span>`
    : `<i>我的累计</i><b>…</b><span id="myCardHint">正在取功课……</span>`}
      </div>
      ${mine ? `<div class="mySite">全站 ${myNum(mine.siteTosses)} · 今日 ${myNum(mine.siteToday)}</div>` : ''}
      <button class="gbtn myWeek" id="myCal"><em>近七日</em><span class="myWkBar">${myWeekHtml((mine && mine.daily) || {})}</span><i>全月 ›</i></button>
      <div class="myList">
        <button class="gbtn myRow" id="myLg">${ico('eye')}<span>行谱见闻</span><i>见 ${lg.seen.length}/${(SFP_POS         ).length} 位 ›</i></button>
        <button class="gbtn myRow" id="myCanon">${ico('scroll')}<span>六卷原文</span><i>›</i></button>
        <button class="gbtn myRow" id="myBo">${ico('sound')}<span>净土法音</span><i>听经 · 念佛 ›</i></button>
        <button class="gbtn myRow" id="myWenchao">${ico('book')}<span>印光法师文钞</span><i>文白对照 ›</i></button>
        ${INSTALL_KIND ? `<button class="gbtn myRow" id="myInstall">${ico('install')}<span>${INSTALL_KIND === 'apk' ? '装到手机' : '添加到主屏幕'}</span><i>${INSTALL_KIND === 'apk' ? '安卓版 ›' : 'iPhone ›'}</i></button>` : ''}
        <button class="gbtn myRow" id="mySet">${ico('sliders')}<span>设置</span><i>›</i></button>
      </div>
      <div class="cNote">一掷一称念「南无阿弥陀佛」，只作随喜记录，不作修证高下。功课记在本机莲号下，换设备会另计。</div>
      ${IS_APP ? `<div class="cNote" id="myAppRow">App 版本查询中……</div>` : ''}
      <button class="gbtn primary" id="myOk" style="margin-top:14px;margin-bottom:4px;width:100%">${sfpS.active ? '回到局中' : '关闭'}</button>`;
    zhDom(main);
    (main.querySelector('#myCal')               ).addEventListener('click', () => openMyCal(p, mine.daily || {}));
    (main.querySelector('#myOk')               ).addEventListener('click', closeOverlay);
    // 子页一律同路往返回「我的」（原先唯改名号能回，设置/原文/见闻三条单程出走落裸场景）
    (main.querySelector('#myLg')               ).addEventListener('click', () => { closeOverlay(); openLogbook(openMine); });
    // 「六卷原文」入独立阅读器（2026-08-11 上线，src/sfp-reader.js）。
    // 2026-08-08 所立的待办已了：那时说「须待二百二十位白话全部译毕再动手」，
    //   今门义 15/15、位注 220/220、逐组判词 4620/4620、卷首卷末四篇与位下后论六段皆译毕。
    // 不带 pos：从「我的」进来是「读书」，该续上次读到的那一节（save.reader.at），
    //   不是跳到棋子当前所在之位——那是位卡「读原文」的来路（见 posCardObj）。
    (main.querySelector('#myCanon')               ).addEventListener('click', () => {
      closeOverlay();
      openReader({ backTo: openMine });
    });
    (main.querySelector('#mySet')               ).addEventListener('click', () => { closeOverlay(); openSettings(openMine); });
    // 同门两站（2026-08-17 发起人点单接入）：净土法音（bo，听经念佛电台）与印光法师文钞（wenchao，文白对照）。
    // 皆是站外去处：网页开新页；安卓壳内 Capacitor 对外域一律转系统浏览器，App 不被顶走。
    // 不收 closeOverlay——看完回来，「我的」还在原处，与站内子页「同路往返」是两种去向两种礼数。
    (main.querySelector('#myBo')               ).addEventListener('click', () => { window.open('https://bo.foyue.org/', '_blank', 'noopener'); });
    (main.querySelector('#myWenchao')               ).addEventListener('click', () => { window.open('https://wenchao.foyue.org/', '_blank', 'noopener'); });
    // 装机（2026-08-17）：只两路——安卓径去下载页；iPhone 无从程序化触发（iOS 从不支持
    //   beforeinstallprompt），唯有引一句手动之法。极简：一句话说完，不列步骤条、不配图。
    //   微信内置浏览器至今不能添加到主屏幕，故先请其转 Safari，免得照做无果反疑站坏。
    const installBtn = main.querySelector('#myInstall');
    if (installBtn) installBtn.addEventListener('click', () => {
      if (INSTALL_KIND === 'apk') { window.open('/app', '_blank', 'noopener'); return; }
      askConfirm('添加到主屏幕',
        IS_IOS_SAFARI
          ? '点下方工具栏的<b>分享</b>钮，选<b>添加到主屏幕</b>。此后从图标进来即是全屏，断网亦可行谱与读原文。'
          : (IS_WECHAT
            ? '微信内不能添加。请点右上角<b>⋯</b>，选<b>在 Safari 中打开</b>，再点分享钮选「添加到主屏幕」。'
            : '请以 <b>Safari</b> 打开本页，点分享钮，选<b>添加到主屏幕</b>。'),
        '知道了', '');
    });
    // 安卓壳（2026-08-17）：版本行＋「回到内置版」文字链——热更包出问题时的用户侧后门；
    // 排查前提也在此（先知用户跑的是哪个包）。守金钮唯一律，不另立大钮。
    if (IS_APP) {
      const row = main.querySelector('#myAppRow');
      if (row) import('./app-shell.js').then(async (shell) => {
        const v = await shell.currentVersion();
        row.innerHTML = `${zh('App 版本')} ${v} · <span id="myAppReset" style="text-decoration:underline;cursor:pointer">${zh('回到内置版')}</span>`;
        (row.querySelector('#myAppReset')               ).addEventListener('click', async () => {
          showToast(zh('正在退回内置版……'), 2000);
          const ok = await shell.resetToBuiltin();  // 成则插件即刻重载内置包，无需善后
          if (!ok) showToast(zh('退回未成，请重试'), 3000);
        });
      }).catch(() => { row.textContent = ''; });
    }
  };

  paint();   // 本地骨架不等网：设置/见闻/原文即点即用，功课卡随后补数
  const load = async () => {
    try {
      await Plaza.flush();                            // 先把本机未送达的掷数补上，数字才是最新的
      const [me, site] = await Promise.all([Plaza.fetchMine(), Plaza.fetchPlaza()]);
      if (!p.isConnected) return;
      mine = { ...me, siteTosses: site.tosses, siteToday: site.tossesToday };
      paint();
    } catch (e) {
      if (!p.isConnected) return;
      // 失败态收进功课卡一格（从前整页换成重试钮，本地三行去处陪葬）：如实说、点即重试
      const hint = main.querySelector('#myCardHint')                    ;
      if (hint) {
        hint.textContent = zh('功课暂取不到——点此重试（本机记录仍在）');
        hint.style.cursor = 'pointer';
        hint.onclick = () => { hint.onclick = null; hint.style.cursor = ''; hint.textContent = zh('正在取功课……'); void load(); };
      }
    }
  };
  void load();
}
const myNum = (n         ) => Number(n || 0).toLocaleString('en-US');

// 功课月历弹窗：不走 openOverlay（那是「一屏一窗」的整页层，开新层会把「我的」顶掉），
// 而是在 .myPanel 内自成一层浮卡——与确认卡同理，凌驾于当前浮层之上。
// 关法四条同归：✕ / 点背景 / Esc / 安卓返回，返回键次序见 popstate（须排在 overlayEl 之前，
// 否则安卓返回会越过弹窗直接把整张「我的」关掉）。
function openMyCal(host             , daily                          ) {
  myCalClose?.();
  let cursor = new Date();
  const lay = el(`<div class="myCalPop"><div class="myCalCard">
    <div class="myCalHead">
      <button class="gbtn" id="myPrev" aria-label="上一月">‹</button>
      <b></b>
      <button class="gbtn" id="myNext" aria-label="下一月">›</button>
      <button class="gbtn myCalX" id="myCalX" aria-label="关闭">✕</button>
    </div>
    <div class="myWk">${MY_WEEK.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="myDays" id="myDays"></div>
    <div class="myCalFoot"><span id="myCalSum"></span><i id="myCalTip"></i></div>
  </div></div>`);
  const title = lay.querySelector('b')               ;
  const days = lay.querySelector('#myDays')               ;
  const sumEl = lay.querySelector('#myCalSum')               ;
  const tipEl = lay.querySelector('#myCalTip')               ;
  const draw = () => {
    const { html, sum } = myMonthHtml(daily, cursor.getFullYear(), cursor.getMonth());
    title.textContent = zh(`${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`);
    days.innerHTML = html;
    sumEl.textContent = zh(`本月 ${myNum(sum)} 掷`);
    tipEl.textContent = '';
  };
  const close = () => {
    myCalClose = null;
    host.classList.remove('subOn');
    document.removeEventListener('keydown', onKey, true);
    lay.remove();
  };
  function onKey(e               ) {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();   // 抢在全局 Esc 之前：先收弹窗，勿连「我的」一并关掉
    close();
  }
  (lay.querySelector('#myPrev')               ).addEventListener('click', () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); draw(); });
  (lay.querySelector('#myNext')               ).addEventListener('click', () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); draw(); });
  (lay.querySelector('#myCalX')               ).addEventListener('click', close);
  lay.addEventListener('click', (e) => { if (e.target === lay) close(); });   // 点卡外的暗处即收
  // 深浅只说轻重，精确掷数点格才出——颜色不独传信息（aria-label 里也各有一份）
  days.addEventListener('click', (e) => {
    const c = (e.target               ).closest('.myCell')               ;
    if (!c) return;
    tipEl.textContent = zh(`${c.dataset.d} · ${myNum(Number(c.dataset.n))} 掷`);
  });
  // 捕获相登记：全局 Esc 挂在 window 冒泡相（末位），document 捕获相在其之前，
  // 故此处 stopImmediatePropagation 拦得住——否则一按 Esc 连「我的」整页一并收掉。
  document.addEventListener('keydown', onKey, true);
  host.classList.add('subOn');   // 弹窗在场：抑制整页的右滑关闭手势（见 openOverlay 抽屉拖拽）
  host.appendChild(lay);
  zhDom(lay);
  draw();
  myCalClose = close;
  armBackGuard();                // 安卓返回先消费本弹窗
}

// ───────── 莲友茶寮（2026-08-11 与主站脱钩）：本站自建留言，逻辑与皮都在 chalou.js ─────────
let chalouCtl = null;
let chalouDraft = '';      // 首次发言转去取名卡时暂存草稿，回来不丢字
function openChalou() {
  plazaNavAway();
  Net.closePanel();        // 全屏页与同修面板不并存（三页通例，茶寮为第四页）
  chalouCtl?.stop();
  const back = () => { chalouCtl?.stop(); chalouCtl = null; overlayOnClose = null; openPlaza(); };
  const ctl = mountChalou({
    el, esc, zh, zhDom,
    actorId: Plaza.practiceId(),
    savedName: () => Plaza.savedName(),
    onNeedName: (draft) => {              // 首次发言先取名（同路往返回茶寮，草稿不丢）
      chalouDraft = draft;
      chalouCtl?.stop(); chalouCtl = null;
      closeOverlay(); openPlazaRename(openChalou);
    },
    onBack: back,
  }, chalouDraft);
  chalouDraft = '';
  chalouCtl = ctl;
  openOverlay(ctl.root);
  overlayOnClose = back;
  zhDom(ctl.root);
  ctl.start();
}

// 共修动态：独立全屏页（从大厅顶条进），关闭即回大厅——一层，一条退路
async function openStream() {
  plazaNavAway();
  Net.closePanel();          // 全屏页与同修面板不并存：面板 z 更高，会盖住整页
  const back = () => { overlayOnClose = null; openPlaza(); };
  try {
    const data = await Plaza.fetchPlaza();
    const p = Plaza.renderStream(data, { el, esc, onBack: back });
    openOverlay(p);
    overlayOnClose = back;
    zhDom(p);
  } catch (e) {
    showToast(zh('共修动态暂时取不到，请稍后再看'), 3200);
    openPlaza();
  }
}

// 取名／改名（从「我的」进）：只存本机名号，不涉入座。
// 同路往返（个人面发起回个人面，勿落公共面）：默认回「我的」，将来若从大厅进可传 backTo。
function openPlazaRename(backTo = openMine) {
  plazaNavAway();
  const back = () => { overlayOnClose = null; backTo(); };
  const p = Plaza.renderSitName('', {
    el, esc, zh, rename: true,
    onSit: async (_c, name) => {
      Plaza.saveName(name);
      // 先把改名送达再回页，否则那一拉取比改名快，动态上还是旧名
      await Plaza.flush();
      await Plaza.pushName();
      overlayOnClose = null;
      backTo();
      showToast(zh(`功课自此记在「${name}」名下`), 3600);
    },
    onBack: back,
  });
  openOverlay(p);
  overlayOnClose = back;
  zhDom(p);
}

function openPlazaSitKey(code, errText = '') {
  plazaNavAway();
  const returnToPlaza = () => { overlayOnClose = null; openPlaza(); };
  const p = Plaza.renderSitKey(code, {
    el,
    onKey: (c, key) => { overlayOnClose = null; plazaSit(c, '', false, key); },
    onBack: returnToPlaza,
  }, errText);
  openOverlay(p); zhDom(p);
  overlayOnClose = returnToPlaza; // ✕/Esc/背景与「返回大厅」同去向：密码卡上一手滑不该丢整条入座路
}

function plazaRender(data) {
  const p = Plaza.renderPlaza(data, {
    el, esc, zh,
    seatedAt: Net.active ? Net.code : '',
    justLeft: Net.justLeft, // 离席遮罩：快照未及更新时先抹掉桌上自己（见 plaza.js scrubJustLeft）
    backText: sfpS.active ? '回到局中' : '回题屏', // 钮上写去处（✕ 同去向）：无局关大厅回题屏，不落裸场景
    // onSolo 已撤（2026-08-11 大厅重排）：「一人行谱」卡不再立于大厅——单人入口在题屏主钮；
    // 大厅连不上时的兜底「一人行谱」钮（pzSolo2）自带同套护栏，不经此处。
    onSit: (code, _n, locked) => plazaSit(code, '', !!locked),
    onStream: () => openStream(),
    onChalou: () => openChalou(),                   // 手机茶寮入口：独立全屏页（桌面为右墙，此卡自藏）
    onQuick: (code, t) => {
      if (!code) { showToast(zh('本厅诸室皆满或已上锁——请稍候片刻，或回题屏开始行谱'), 3200); return; }
      // 随喜入座透明化：系统替用户挑了哪间、那间什么光景，说出来——不让人进了门才知道进的是哪间
      const ord = Plaza.TABLE_ORD[Number(String(code).split('T')[1]) - 1] || '';
      if (t) {
        showToast(zh(t.state === 'waiting' ? `已为您选共修室${ord}——${t.live} 位莲友在候`
          : (t.state === 'empty' ? `已为您开共修室${ord}——此室尚无人，一人即可开局`
            : `已为您选共修室${ord}——本局行谱中，可先入座同观`)), 3600);
      }
      plazaSit(code);
    },
    // 桌面右墙茶寮（2026-08-11 大厅即茶寮）：与全屏茶寮同一份数据与皮（chalou.js）。
    mountSide: (aside) => {
      // 窄屏这面墙 display:none：不渲染也不轮询——看不见的墙拉数据是白花流量
      if (!matchMedia('(min-width:981px)').matches) return;
      plazaSideStop();
      const api = chalouApi(Plaza.practiceId());
      const feed = mountChalouFeed(aside.querySelector('.pzSideFeed'), { esc, zh, api, compact: true });
      mountChalouInput(aside.querySelector('.pzSideInput'), {
        esc, zh, api,
        savedName: () => Plaza.savedName(),
        onNeedName: (draft) => {                    // 右墙首次发言同走取名卡，草稿经 chalouDraft 中转不丢
          chalouDraft = draft;
          plazaNavAway(); closeOverlay(); openPlazaRename(openPlaza);
        },
        afterSend: async () => { await feed.pull(); feed.stick(); },
      }, chalouDraft);
      chalouDraft = '';
      feed.start();
      plazaSideCtl = feed;
    },
    onClose: () => closeOverlay(),                  // 手关回调（overlayOnClose）统一善后：停表，无局回题屏
  });
  zhDom(p);
  return p;
}

async function openPlaza() {
  const gen = ++plazaGen;    // 本代代号：并发重入时旧代自退（勿两套定时器互踩）
  plazaNavAway();
  Net.closePanel();          // 同上：全屏页与同修面板不并存
  // 手关（✕/Esc/背景/右滑）与底部「返回」同去向：停表，无局回题屏——两个退出一个去处
  const handClose = () => { plazaStop(); plazaSideStop(); if (!sfpS.active) openTitle(); };
  // 加载骨架（2026-08-12 批）：与终局同形的九宫格灰卡轻呼吸，数据到即原位换真——版面零跳变。
  // 失败时骨架让位（.err），居中错误卡带重试与一人行谱兜底（pzLoadingInner 承旧职）。
  const loading = el(`<div class="panel pzPanel pzLoading"><div class="pzShell pzSkShell" aria-hidden="true">
      <header class="pzTop"><div><span class="pzEyebrow">选佛谱</span><h2>共修大厅</h2></div></header>
      <span class="pzSk skT"></span>
      <span class="pzSk skM"></span>
      <div class="pzGrid">${'<span class="pzSk skC"></span>'.repeat(9)}</div>
      <span class="pzSk skSide"></span>
    </div>
    <div class="pzLoadingInner" hidden><span>选佛谱</span><h2>共修大厅</h2><div class="body"></div></div></div>`);
  openOverlay(loading); zhDom(loading);
  overlayOnClose = handClose;
  let panel = null;
  const draw = async () => {
    if (gen !== plazaGen) return;                   // 已被后来者接管
    try {
      const data = await Plaza.fetchPlaza();
      if (gen !== plazaGen) return;
      if (!loading.isConnected && !(panel && panel.isConnected)) { plazaStop(); return; } // 已离开大厅
      if (!panel) {
        panel = plazaRender(data);
        overlayOnClose = null;                      // openOverlay 会先关 loading 层：解除回调免误发
        openOverlay(panel);
        overlayOnClose = handClose;
      } else {
        // 定时刷新只补写数字与桌况：不重开覆盖层，保住滚动、焦点与已展开的功课榜。
        Plaza.updatePlaza(panel, data, {
          ...panel._plazaUi,
          seatedAt: Net.active ? Net.code : '',
          justLeft: Net.justLeft, // 每拍带最新值：遮罩窗口过期或重新入座即自然失效
          backText: sfpS.active ? '回到局中' : '回题屏', // 钮上写去处（✕ 同去向）：无局关大厅回题屏，不落裸场景
        });
        zhDom(panel);
      }
    } catch (e) {
      console.warn('plaza draw:', e);   // 渲染链路的异常别静默吞掉：页面上只报「连接不上」，控制台留真凶
      if (gen !== plazaGen) return;
      // 大厅已在场时的偶发失败：保住定时器，下一拍自愈（旧式一失即 plazaStop，桌况从此冻结且无提示）
      if (panel && panel.isConnected) return;
      plazaStop();
      if (!loading.isConnected) return;
      loading.classList.add('err');                       // 骨架让位，错误卡居中
      (loading.querySelector('.pzSkShell')               ).hidden = true;
      (loading.querySelector('.pzLoadingInner')               ).hidden = false;
      loading.querySelector('.body').innerHTML =
        `<div class="cNote">${zh('大厅暂时连接不上，请稍后再试')}</div>` +
        `<button class="gbtn primary" id="pzRetry" style="margin-top:10px;width:100%">${zh('重试')}</button>` +
        `<button class="gbtn" id="pzSolo2" style="margin-top:8px;width:100%">${zh('开始行谱')}</button>`;
      loading.querySelector('#pzRetry').addEventListener('click', () => openPlaza());
      loading.querySelector('#pzSolo2').addEventListener('click', async () => { // 与大厅 onSolo 同护栏：此兜底钮同样不该是丢局旁路
        if (sfpTransit || (sfpS.rolling && !(verdictFn && !Net.active))) { showToast(zh('本掷落定后再换'), 2200); return; } // 单机判词期放行
        if ((sfpS.active || (save.sfp && SFP_BY[save.sfp.pos])) && !Net.active && !await askConfirm('重开一局？', '当前行处将弃置，从头掷起。', '重开', '再想想')) return;
        cancelVerdict();
        overlayOnClose = null; closeOverlay(); startSfp(false);
      });
    }
  };
  await draw();
  if (gen !== plazaGen) return;                     // 转场/重入已发生：定时器归新代管
  plazaTimer = window.setInterval(draw, 8000);      // 桌况随人来人往变，八秒一refresh
  // 刚离席进来的这一趟：首拍多半还跑在服务器处理离席之前（前台有遮罩顶着），
  // 两秒半后补拉一拍拿服务器真况，不必干等八秒——遮罩窗口一过即以真况为准
  if (Net.justLeft && Date.now() - Net.justLeft.at < 10000) {
    window.setTimeout(() => { if (gen === plazaGen) void draw(); }, 2500);
  }
  // 切回页面立即刷一拍（比缩短轮询省）：手机切走再回，桌况最多陈旧 8 秒也嫌久。
  // 监听自清理：代号不符或大厅已不在场，第一次触发即自摘，不必与关厅路径缠绕。
  const onVis = () => {
    if (gen !== plazaGen || (!panel?.isConnected && !loading.isConnected)) {
      document.removeEventListener('visibilitychange', onVis);
      return;
    }
    if (document.visibilityState === 'visible') draw();
  };
  document.addEventListener('visibilitychange', onVis);
}
// 卡上只答「掷什么·去哪」（2026-08-08 发起人定案）：4620 格缘由天然是一张表，不是 220 张卡的附件。
//   逐行挂缘由小字的 withWhy 分支已随详读卡撤于 2026-08-12——那是它唯一的调用者。
//   要读全 21 组的判词白话与引文，去阅读器本位节的「行法 · 二十一相」表（位卡底部「读原文 ›」直达）：
//   那里恒 21 行、无遗漏，且逐条分判「譜曰／承前」。此栏合并同去处之组，故行数少于 21。
function sfpMovesHtml(p     )         {
  if (!p.moves.length) return '<div style="color:var(--ck-note);font-size:var(--fs-sm)">此位为究竟极果，原谱不列轮相；到此不再掷轮，也没有升降。</div>';
  const whyMap = ((SFP_WHY_EVIDENCE       )[p.id] || {})                          ;
  const listed = new Set        ();
  const rows = (p.moves         ).map(mv => {
    let to = mv.to ? `往「${mv.to}」` : '';
    if (mv.bonus) to += (to ? '，' : '') + `贈${'一二三四'[mv.bonus - 1]}掷`;
    if (mv.act) to += `，依「${mv.act}」行`;
    (mv.c            ).forEach(c => listed.add(c));  // 无条件登记：漏了 stayRows 会把已列组当「不行」再印一遍
    return `<div class="mv"><b>${mv.c.join(' · ')}</b><span>${to}</span></div>`;
  }).join('');
  // 不行之组：原谱注中有说明缘由者一并列出
  const stayRows = Object.keys(whyMap).filter(c => !listed.has(c)).map(c =>
    `<div class="mv"><b>${c}</b><span style="color:var(--ck-note)">不行</span></div>`).join('');
  return '<div class="sfpMoves">' + rows + stayRows
    + '<div class="cNote" style="margin-top:6px">未列组合：不行（安住本位）。逐组缘由见本位原文的「行法 · 二十一相」。</div></div>';
}
// 譜曰排版：整段连排便于阅读（用户点单，原一句一行已撤）；只改排版不动原文，名相词典照过
const verseHtml = (t        ) => glossify(esc(t));
// 成佛面板的佛位内容 · 2026-08-12 改接正本
// ─────────────────────────────────────────────────────────────────────────────
// 旧制（V90）只呈逐字原文＋duiduHtml 交错对读，而 duiduHtml 走的是旧层 SFP_WHY_PLAIN。
// 【2026-08-12 更正本注】初版此处写「601 字里只命中 6 处，白话零零星星」——数字没错、话说错了：
//   那 6 枚键是 147／89／57／135／105／68 字的整段键，六段接起来正是 601 字，覆盖率 100%。
//   旧制并非缺白话，它缺的是**别的**：白话另出一本（与位卡所呈不是同一份译文）、名相无浮标。
//   改接正本的真正理由是归一——同一位，成佛面板与位卡不该各说各的。
// 位白话正本（领起句＋七行明细＋三条他经补注，SFP_POS_BAIHUA['圓教究竟妙覺位']）位卡上一直呈着，
// 唯独这一屏没接。今与位卡同源：白话走 posBodyOf→plainBodyHtml，
// 原文退为折叠（走占位回填，不随 innerHTML 过 zh()——校勘之本不因显示层改字）。
// 佛位六项标目仍留：那是原谱谱面题字，别处无第二处可得。
const FO15_PID = '圓教究竟妙覺位';
function fo15Html() {
  const cn15 = (SFP_CANON_DOORS       )[15]                                                                                                 ;
  const juan = SFP_CN[((cn15?.juan) || 6) - 1];
  const plain = plainBodyHtml(posBodyOf(FO15_PID));
  return `${plain ? `<div class="cSec" style="margin-top:8px">${plain}</div>` : ''}
    <details class="sec"><summary>谱曰原文 · 卷第${juan}</summary>
      <div class="verse" style="margin-top:6px" data-fo15></div>
      <div class="cSrc">《選佛譜》卷第${juan} · 圓極果位門「佛」；${esc(SFP_META.source)}</div></details>
    ${cn15?.intro ? `<details class="sec"><summary>佛位六项标目（原谱谱面题字）</summary><div class="verse" style="margin-top:6px" data-fo15i></div></details>` : ''}`;
}
// 逐字原文占位回填：与卡制的 fillRaw 同法——el() 会对整串跑 zh()，原文若随 innerHTML
//   一同过去就被折简（繁体态更会跑 S2T 误转），校勘即失据。名相浮标照上。
function fo15Fill(root      ) {
  const cn15 = (SFP_CANON_DOORS       )[15]                                                                                                 ;
  const t = String(cn15?.positions?.[0]?.text || SFP_BY[FO15_PID].note).replace(/^譜曰。/, '');
  root.querySelectorAll('[data-fo15]').forEach((e2) => { e2.innerHTML = glossify(esc(rawShow(t))); });
  root.querySelectorAll('[data-fo15i]').forEach((e2) => { e2.innerHTML = glossify(esc(rawShow(String(cn15?.intro || '')))); });
}
// ── 名相小词典（白话助读层，与原文分层）：命中词加虚线下划，点开小签；每段只标首次出现，免满屏碎线 ──
const GLS_IDX                         = {};
(SFP_GLOSS         ).forEach((g, i) => { GLS_IDX[g[0]] = i; });
const GLS_RE = new RegExp((SFP_GLOSS         ).map(g => g[0]          ).sort((a, b) => b.length - a.length).join('|'), 'g');
// seen 可由调用方传入共用：一张卡上分数处调 glossify 时，各自新建 seen 会让同一名相
//   在同屏被标两三次——注释说的「每段只标首次出现，免满屏碎线」意在于此，作用域却漏了。
//   位卡与阅读器整段一次渲完，不必传；判词卡分处渲染，共用一个。
function glossify(html        , seen                )         {
  seen = seen || new Set        ();
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
// v471（移植线上 V106）两签归一：同一词再点则收起（开关同位），收签只此一口
let glsKey = '';
function glsHide() { glsPop.style.display = 'none'; glsKey = ''; }
// openPosGloss（v225 去处白话小签）已撤于 2026-08-12：它渲的是 posGist(destId)，
//   而判词卡的落处提要行（#vGist）渲的是同一函数、同一入参——同一句话在同一屏印了两遍，
//   小签只是那句话的第二个入口，末尾还挂一枚「原文说明 ▸」把人送去位卡。今位名直入位卡。
//   placeGlsPop 仍留：名相签（openGloss）也从判词卡内触发，那段避让判词的定位逻辑照旧要用。
function placeGlsPop(anchor          ) {
  glsPop.style.display = 'block';
  const w = Math.min(272, window.innerWidth - 20);
  glsPop.style.width = w + 'px';
  let x = 12, y = 80;
  if (anchor) {
    x = Math.min(Math.max(8, anchor.left + anchor.width / 2 - w / 2), window.innerWidth - w - 8);
    const h = glsPop.offsetHeight;
    y = anchor.bottom + 8;
    // v471 不遮判词正文：去处名就在判词卡内，签落下方正好盖住「缘由/通例」那几行——
    //   若下方会压到当下可见面板，改放锚点上方；上方也不够才落回下方。
    const host = [...document.querySelectorAll('#verdict.show')]
      .map((e2       ) => e2.getBoundingClientRect()).find((r     ) => r.height > 0);
    const clash = !!host && y < host.bottom && y + h > host.top;
    if (y + h > window.innerHeight - 10 || clash) {
      const up = anchor.top - h - 8;
      y = up >= 8 ? up : Math.max(8, Math.min(y, window.innerHeight - h - 10));
    }
  }
  glsPop.style.left = x + 'px'; glsPop.style.top = y + 'px';
  playVar('wood_light', 0.15, 1.1);
}
function openGloss(idx        , anchor          ) {
  const g = (SFP_GLOSS         )[idx]; if (!g) return;
  if (glsKey === 'g:' + idx && glsPop.style.display !== 'none') { glsHide(); return; }
  glsKey = 'g:' + idx;
  (glsPop.querySelector('#glsT')               ).textContent = g[0]; // 名相标题用原文繁体
  (glsPop.querySelector('#glsD')               ).innerHTML = zh(esc(g[1]));
  const fEl = glsPop.querySelector('#glsF')               ;
  fEl.innerHTML = g[2] ? zh(esc(g[2])) : ''; // v224：脚注只留经据出处
  fEl.onclick = null;
  placeGlsPop(anchor);
}
// 名相词条里有 129 条与谱位同名（阿鼻地獄／初歡喜地／常寂光淨土…全谱 220 位中的 129 位）。
//   这类词条的释义是位卡白话的缩写版（实比：位卡另有谱曰原文、升降行法、读原文入口），
//   即同一件事的次级复本。故点到这类位名，直入位卡，不再弹那枚缩写签
//   ——与去向条两端位名、「详读 ›」三处同归一处（2026-08-12 发起人点单）。
// 2026-08-12 二次点单：由「只限判词卡」推至全站——一个位名在哪儿点都是同一个去处，
//   规矩才立得住；先前留的例外（阅读器与门卡长读版面就地释义）反成了「同名不同命」。
//   唯留一处例外，见下 self 守卫：已站在该位卡上，点它自己的名字仍弹签，不重开本卡。
const GLS_POS_NAME                         = {};
(SFP_POS         ).forEach((p     ) => { GLS_POS_NAME[p.name] = p.id; });
// 点词开签——据获阶段截住，免触发判词展开/面板自身点击逻辑
 document.addEventListener('click', (e) => {
  const t = (e.target               ).closest ? (e.target               ).closest('.gls') : null;
  if (!t) return;
  e.stopPropagation(); e.preventDefault();
  const idx = Number((t               ).dataset.g);
  const term = ((SFP_GLOSS         )[idx] || [])[0];
  const pid = GLS_POS_NAME[term         ];
  // 自指守卫：正开着的就是这一位的卡，点它自己的名字只弹签——否则是原地重开本卡，白闪一下
  // 自指守卫：位卡对象的 id 带 'pos:' 前缀（posCardObj），故比较时须剥去
  const self = pid && t.closest('#card') && card.dataset.pid === `pos:${pid}`;
  if (pid && !self) {   // 位名：直入位卡（判词卡内另带本掷层）
    playSfx('sfx-tap', 0.25); glsHide();
    openSfpNote(pid);
    return;
  }
  openGloss(idx, t.getBoundingClientRect());
}, true);
document.addEventListener('pointerdown', (e) => {
  const t = e.target               ;
  if (glsPop.style.display !== 'none' && !glsPop.contains(t) && !(t.closest && t.closest('.gls'))) glsHide();
}, true);
// v471 Esc 收签（桌面）：签是最轻的一层，不应还要去点空处关
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && glsPop.style.display !== 'none') { e.stopPropagation(); glsHide(); }
}, true);
// v391 归一：极乐四土总说卡（原 openFourLands）、六卷原文阅读器（原 openCanon）、發始因地廿一因总览（原 openD1Card）
// 三卡已并入门卡 openDoor——四土与廿一因降为 SFP_DOOR_GROUPS 数据的门内分组，谱文全文成门卡第三段（lazy 建 DOM）。
// duiduHtml（v228 逐段交错对读）已撤于 2026-08-12：它把旧层 SFP_WHY_PLAIN 的 1462 枚键
//   逐一在谱注原文里找位置，命中处白话紧随其后——覆盖率其实是满的（220 位 49803 字全覆盖），
//   撤它不是因为它漏，是因为**它是另一份白话**。发起人定：正本为准，旧数据下线；
//   同一句谱注，判词卡呈正本白话、此处呈旧层白话，两副说法并陈，读者无从知道该信哪一份。
//   且卡制总纲 v3 早已定「文白不再分两层，一枚开关原地对调」——交错对读是旧模型最后一处遗留。
//   今 rdCite 改「白话在前（正本）· 原文在后」，与位卡、阅读器同一副形状。
// canonPosOnly（v354 位注／行法按语切分）已撤于 2026-08-12：它拿证据层的逐字引文在谱文里
//   反查最早出现处作切点，会被两类引法拖偏——引整段者（〈戒取〉〈邪定〉的那那条把定义句
//   一并引了）与承前引者（〈見取〉六相引「其餘位中…」），见 sfp-canon-split.js:14-20 的 v4 之评。
//   今改走 sfpSplitOf（220 位逐位手核的切点表，有 npm run check:split 护栏），
//   且它另能切出「谱主后论」段（全谱 6 位），旧法连同那 516 字一并丢了。

// ── 六卷原文阅读器（2026-08-12 独立页面）────────────────────────────────
// 「我的 › 六卷原文」两迁：先借道门卡第三段（查这一位，不合从头读一部书）；
// 2026-08-11 立游戏内浮层阅读器（.rdPanel）；2026-08-12 发起人拍板迁出为独立页面
// read.html——UI/UX 延用 wenchao（印光法师文钞）的纸墨形制，逻辑在 src/reader-page.js。
// 此处只剩一件事：带着落点跳过去（门号走 door:N 键，位名直接作键，皆是 read.html 的 hash 路由）。
// 进度与简繁选择由 read.html 首访时自 save.reader / save.zh 迁走，此后两页各自持有。
function openReader(opts      = {}) {
  const key = opts.door ? `door:${opts.door}` : opts.pos ? String(opts.pos) : '';
  location.assign('read.html' + (key ? '#' + encodeURIComponent(key) : ''));
}
(window       ).__openReader = (o     ) => openReader(o || {});   // 自测钩子（scripts/test-reader.mjs 第八段）

// ── 门卡 · 一门一处（v391 归一）──────────────────────────────────────
// 归一前一门散作四张卡：门要卡（摘要）／廿一因卡（门1定制）／四土卡（门14定制）／谱文原文卡（全文）。
// 三宗弊病：① 同一门要在两三张卡间跳；② 门1门14的界面与其余十三门不同形，认路成本白付；
// ③ 总说在门要卡与谱文卡各说一遍。今归一为「门义 → 位次一览 → 谱文全文」一个形状，十五门同形。
// 门1廿一因四类、门14极乐四土降为下方数据——openDoor 里不留 if (dn===1)；
// 将来任何门要分组（如门12十地），加一条配置即可，不必再做一张卡。
const SFP_DOOR_GROUPS                         = {
  1: {
    label: '廿一因',
    lead: '第一掷定发始因地：廿一种轮相对应本门廿一种因地，掷得何因，本局即自何位起行。',
    caption: SFP_D1_CAPTION,                    // 有逐位义读者一行一位，无则位名芯片网格
    groups: SFP_D1_GROUPS.map(([n, cap, ids]) => ({ n, cap, ids })),
  },
  14: {
    label: '极乐四土',
    lead: '天台判一切佛土为四：凡圣同居、方便有余、实报庄严、常寂光。他方四土竖分——断惑方能升进；极乐则<b>横具四土</b>：信愿持名、带业往生同居土，即已横超三界，与诸上善人俱会一处。此同居之胜，为十方佛土所难有。',
    groups: [
      { n: '凡圣同居土', cap: '莲池九品·带业往生所居', desc: '场中莲池九品与池畔边地疑城即此土——凡夫带业往生，与补处菩萨同居。',
        ids: ['淨土疑城', '下品下生', '下品中生', '下品上生', '中品下生', '中品中生', '中品上生', '上品下生', '上品中生', '上品上生'] },
      { n: '方便有余净土', cap: '断见思·三乘圣者所居', ids: ['方便有餘淨土'] },
      { n: '实报庄严净土', cap: '分破无明·法身大士所居', ids: ['實報莊嚴淨土'] },
      { n: '常寂光净土', cap: '如智不二·究竟法身所证', ids: ['常寂光淨土'] },
    ],
  },
};
// 位次一览：有分组配置则按组，无则全门一组（匿名）。
// data-pi 记 SFP_POS 全局下标而非位名——el() 会把整段 HTML 过一遍简繁转换，属性里的位名会跟着变形（AGENTS 陷阱）。
function doorPosListHtml(dn        )         {
  const cfg = (SFP_DOOR_GROUPS       )[dn];
  const all = (SFP_POS         ).filter((x     ) => x.door === dn);
  const groups                = cfg ? cfg.groups : [{ ids: all.map((x     ) => x.id) }];
  const cap = cfg && cfg.caption;
  const idxOf = (id        ) => (SFP_POS         ).findIndex((x     ) => x.id === id);
  const rowsOf = (ids           ) => {
    const items = ids.map(id => ({ p: SFP_BY[id], i: idxOf(id), on: save.lg.seen.includes(id) })).filter(it => it.p && it.i >= 0);
    return cap
      ? items.map(it => `<button class="gbtn dpRow${it.on ? ' on' : ''}" data-pi="${it.i}" type="button">
          <span><b>${esc(it.p.name)}</b><i>${esc(cap[it.p.id] || '')}</i></span><span class="go">谱注 ›</span></button>`).join('')
      : `<div class="lgPs">${items.map(it =>
          `<button class="lgP${it.on ? ' on' : ''}" data-pi="${it.i}" type="button">${esc(it.p.name)}</button>`).join('')}</div>`;
  };
  return groups.map((g     ) => (g.n
    ? `<div class="dpG"><b>${esc(g.n)}</b>${g.cap ? `<i>${esc(g.cap)}</i>` : ''}</div>${g.desc ? `<div class="dpD">${esc(g.desc)}</div>` : ''}`
    : '') + rowsOf(g.ids)).join('');
}
// doorCanonHtml（门卡第三段「谱文·全文对读」的正文）已撤于 2026-08-11：
//   同一份原文不该有两个家。全文阅读归 src/sfp-reader.js，门卡只留一枚「读本门原文 ›」。
//   随之失去调用的 canonPosOf 亦撤（它只为那一段的「位卡 ›」按钮而设）。
//   （其时留下的 duiduHtml 与 SFP_WHY_PLAIN 已于 2026-08-12「正本为准」一并撤。）
// opts.focus='pos'＝落到位次一览段（门1导语「廿一因逐位读 ›」、场中「凡圣同居土」来路）。
// opts.backTo＝同路往返（见闻录／「我的」来路），与 openSfpNote、openSettings 同构。
//
// door provider · 2026-08-12 改用门义白话正本 SFP_DOOR_BAIHUA
// ─────────────────────────────────────────────────────────────────────────────
// 归一前门卡正文取的是 SFP_DOOR_QA 的 q1/q2/q3——那是卡制 v2「三问」的料库（自动生成，
// 真源 tools/data/door-spec.mjs），简体。而 2026-08-10 手译的门义白话正本 15/15 齐、
// 48 行明细，此前只在场景门总说浮文与阅读器 door 节出现，**门卡是唯一没吃到它的地方**。
// 三重后果：
//   ① 门13 少 6 行、门14 少 13 行（四土各自净秽／竖与横／藏通别圆四教各自去处／横超之名／
//      三则问答）。QA 三问只给约 130 字大意，而门14 原文 966 字。
//   ② **门卡门义段的名相浮标一条也标不上**：正文过 glossify，而词键全是繁体字形（GLS_RE），
//      简体正文一个也命中不了。同一份繁体本在场景浮文与阅读器里是生效的
//      （scripts/test-door-intro.mjs 有断言「简体旧本此处恒为 0」）。这正是重译此本的第一条缘由。
//   ③ 卡制 v3 已明撤「三问」（见卡制总纲 v3 第二条），门卡的视觉是撤了（q1/q2/q3 渲成三个平
//      段落），料却没换。今料与形俱归 v3。
// canon（逐字总说）仍走 SFP_DOOR_QA 的 read[]——那是谱据，不是三问，与本次无关。
// self:true 者（门1/2/15，原谱无总说）须标明自撰，不冒「谱曰」：此界线 sfp-door-baihua.js:27-32
//   与 scripts/check-door-baihua.mjs 都在守，门卡不得例外。
function doorCardObj(dn        )                  {
  const door = SFP_DOOR_BY[dn]; if (!door) return null;
  const e = ((SFP_DOOR_QA       )[dn] || {})         ;
  const cn = (SFP_CANON_DOORS       )[dn];
  const seen = lgSeenByDoor()[dn] || 0, tot = SFP_DOOR_TOTAL[dn] || 0;
  const bh = (SFP_DOOR_BAIHUA       )[dn];
  const selfIntro = [1, 2, 15].includes(dn); // 原谱无总说，其白话系本项目自撰导语
  const body            = [];
  if (bh) {
    if (bh.self) body.push({ v: '本门原谱无总说，以下是本项目自撰的助读导语，非谱主原文。', kind: 'note' });
    if (bh.v) body.push({ v: String(bh.v) });
    ((bh.rows || [])         ).forEach((r     ) => body.push({ k: r.k, v: r.v }));
  } else {
    // 兜底（现全 15 门齐备，此路不会走到）：door-qa 三问 → 旧本一两句 → 原谱总说
    const q1 = e.q1 || (SFP_DOOR_PLAIN       )[dn] || (selfIntro ? String(door.intro || '') : '');
    if (q1) body.push({ v: q1 });
    if (e.q2) body.push({ v: e.q2 });
    if (e.q3) body.push({ v: e.q3 });
  }
  // 「修行」一句（SFP_DOOR_PRACTICE）从前只在位卡的门义折叠里，门卡反而没有——
  // 门义归门卡后，它须随门卡呈，否则撤掉那个折叠就把这句话一并丢了。
  if ((SFP_DOOR_PRACTICE       )[dn]) body.push({ k: '修行', v: (SFP_DOOR_PRACTICE       )[dn] });
  const read = ((e.read || [])         ).map((r     ) => ({
    tag: r.tag, canon: r.canon, src: r.src }));
  return {
    kind: 'door', id: 'door:' + dn, name: `第${SFP_CN[dn - 1]}门 · ${door.title}`,
    head: [`本门 ${tot} 位`, `已见 ${seen} 位`, cn ? `卷第${SFP_CN[cn.juan - 1]}` : ''].filter(Boolean),
    body,
    canon: read.map((r     ) => ({ tag: r.tag, text: r.canon, src: r.src })),
    // 门卡的关联段是位次一览，但它同时兼任本卷的卷读器（谱文全卷对读＋落位滚动），
    // 那一段有自己的 lazy 与直达机制，仍留在 openDoor 里，不入 rel——门卡是唯一的例外，
    // 因为它承担的不只是一个词条，还是一卷原文的入口。
    rel: null,
  };
}
function openDoor(dn        , opts      = {}) {
  const door = SFP_DOOR_BY[dn];
  if (!door) return;
  const cn = (SFP_CANON_DOORS       )[dn];
  const cfg = (SFP_DOOR_GROUPS       )[dn];
  const seen = lgSeenByDoor()[dn] || 0;
  const total = SFP_DOOR_TOTAL[dn] || 0;
  // 门白话／导语／谱曰总说三者已全归 doorCardObj（见其内的兜底：门1/2/15 无总说者落白话导语），
  // 此处不再各取一份——同一句话不在门卡说两遍。
  const backTo = opts.backTo;
  const inner = el(`<div class="panel sheet"><div class="sheetGrip"></div><h2>第${SFP_CN[dn - 1]}门 · ${esc(door.title)}</h2><div class="body">
    <div id="dcEntry"></div>
    <details class="sec" id="dcPos" open><summary>位次一览${cfg ? ` · ${cfg.label}` : ` · ${total} 位`}</summary>
      ${cfg && cfg.lead ? `<div class="cRead" style="margin:6px 0">${cfg.lead}</div>` : ''}
      ${doorPosListHtml(dn)}
      <div class="cNote">点各位入位卡读本位原文与升降行法；已见者亮显。</div></details>
    ${cn ? `<button class="gbtn" id="dcRead" style="width:100%;margin-top:10px">读本门原文 · 卷第${SFP_CN[cn.juan - 1]} ›</button>` : ''}
    </div>
    <div class="cardNav"><button class="gbtn${dn > 1 ? '' : ' dis'}" id="dcPrev">‹ 上一门</button><button class="gbtn${dn < 15 ? '' : ' dis'}" id="dcNext">下一门 ›</button></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="gbtn" id="dcLib" style="flex:1">所据经论</button>
      ${DISC_PAGES[dn] ? '<button class="gbtn" id="dcDisc" style="flex:1">本门谱页</button>' : ''}
      ${dn === 14 && !inPure ? '<button class="gbtn" id="dcPure" style="flex:1">进入极乐世界</button>' : ''}
      <button class="gbtn primary" id="dcOk" style="flex:1 0 100%">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  // 门义走统一出口（词头·正文），文白就地切换；逐字总说由 paintEntry 内的 fillRaw 占位回填
  paintEntry(inner.querySelector('#dcEntry')       , doorCardObj(dn)         );
  const sc = inner.querySelector('.body')                      ;
  const goPos = (pi        ) => {                 // 入位卡：先解返程回调，免 closeOverlay 误发 backTo 连锁重开
    const x = (SFP_POS         )[pi];
    if (!x) return;
    playSfx('sfx-tap', 0.25);
    overlayOnClose = null;
    openSfpNote(x.id);
  };
  inner.querySelectorAll('#dcPos [data-pi]').forEach(b =>
    b.addEventListener('click', () => goPos(Number((b               ).dataset.pi))));
  // 谱文入阅读器（2026-08-11）：旧第三段「谱文·全文对读」已撤——同一份原文不该有两个家。
  //   那一段是 lazy 建段＋段内滚动定位，合于「查这一位」；「从头读一部书」归 openReader。
  //   随之撤去的还有 buildCanon／scrollToCi／opts.jump 三套机关，与 doorCanonHtml 一函数。
  { const rd = inner.querySelector('#dcRead')                      ;
    if (rd) rd.addEventListener('click', () => {
      playSfx('sfx-tap', 0.25); overlayOnClose = null; closeOverlay();
      openReader({ door: dn, backTo: () => openDoor(dn, { backTo }) });
    }); }
  const pv = inner.querySelector('#dcPrev')                      ;
  if (pv && dn > 1) pv.addEventListener('click', () => { playSfx('sfx-tap', 0.25); overlayOnClose = null; openDoor(dn - 1, { backTo }); });
  const nx = inner.querySelector('#dcNext')                      ;
  if (nx && dn < 15) nx.addEventListener('click', () => { playSfx('sfx-tap', 0.25); overlayOnClose = null; openDoor(dn + 1, { backTo }); });
  (inner.querySelector('#dcLib')               ).addEventListener('click', () => { overlayOnClose = null; closeOverlay(); openLibrary(); });
  { const dd = inner.querySelector('#dcDisc')                      ; // v364 谱页深读入口（220 位已全在主图，谱页转为可选一览）
    if (dd) dd.addEventListener('click', () => { overlayOnClose = null; closeOverlay(); enterDiscTransit(dn); }); }
  { const dp = inner.querySelector('#dcPure')                      ; // 2026-08-13 单击门签改开卡后，入极乐的门路随卡呈
    if (dp) dp.addEventListener('click', () => { overlayOnClose = null; closeOverlay(); if (inSky || inBodhi) returnSaha(); enterPureTransit(); setBrowseDoor(14); }); }
  (inner.querySelector('#dcOk')               ).addEventListener('click', () => {
    if (sfpS.active) overlayOnClose = null;      // 题「回到局中」时要真回局中，解除 backTo；题「关闭」时仍同路往返
    closeOverlay();
  });
  // 双击门义即收（2026-08-14 发起人点单）：卡面空处双击＝关卡——开卡的手势反着来就是关。
  // 钮、链、芯片、折叠标题上双击不夺（那是人在快点操作，不是要关卡）。
  inner.addEventListener('dblclick', (e) => {
    if ((e.target               ).closest?.('button,a,u,input,summary,.sfpChip,[data-pi]')) return;
    overlayOnClose = null;
    closeOverlay();
  });
  openOverlay(inner);
  if (backTo) overlayOnClose = () => { overlayOnClose = null; backTo(); };
  // opts.jump（旧「直奔这一位的谱文」来路）已撤：那是段内滚动定位，随第三段一并归 openReader。
  //   今欲直奔某位原文者，径调 openReader({ pos })——一节一屏，无须算 scrollTop，也就无从踩
  //   那三处坑（旧注记：setTimeout 被回流吞掉、rAF 被主图 WebGL 占帧拖迟一拍）。
  if (opts.focus === 'pos') {
    // 同 jump：同步落位＋两拍校正，不等 rAF（主图 WebGL 占帧时会迟到一拍）。
    // 门14 门义含天台四土判教一段，首屏不止一屏，从场中名牌进来须真滚到位次才见四土。
    const ps = inner.querySelector('#dcPos')                      ;
    const toPos = () => { if (ps && sc) sc.scrollTop += ps.getBoundingClientRect().top - sc.getBoundingClientRect().top - 6; };
    toPos();
    window.setTimeout(toPos, 60);
    window.setTimeout(toPos, 240);
  }
}
// v363 用户定案「坐标＝地理坐标」：位卡标本位在器世间的依经处所（方位＋高下，真源 data.js 节点 bear/elev/coordKind），
// 不标 x/y/z 数值（那是排布参数）。四圣/四空 coordKind=nonspatial：不伪造方所，照实说「非方所·以断惑浅深论」。
// 净土诸位另有横超一路，取极乐国土之说。
// eslint-disable-next-line no-unused-vars -- 暂留：位卡地理坐标框已撤（讲的是所锚法界而非本位，
//   且处所卡第③段已排过方位/高下）。函数留档，待处所卡若需独立坐标行时可复用。
function sfpGeoLineHtml(p     )         {
  const nd = byId[p.anchor]; if (!nd) return '';
  const d = nd.d       ;
  const ns = d.coordKind === 'nonspatial';
  const kind = (COORD_KIND_LABEL       )[d.coordKind] || '依经有处'; // v365 三名与 data.js 单一真源归一（勿再自造别名）
  const bear = String(d.bear || '').trim();
  let elev = String(d.elev || '').trim();
  // 色界诸天的 elev 多写作「色界 · <与 bear 同语>」：同语则不复述（免一行说两遍）
  if (elev === '—' || !elev) elev = '';
  else { const tail = elev.replace(/^色界\s*·\s*/, '').trim(); if (tail === bear || bear.indexOf(tail) >= 0 || tail.indexOf(bear) >= 0) elev = elev.startsWith('色界') ? '色界' : ''; }
  if (!bear && !elev) return '';
  return zh(`<div class="coordBox geoLn"><b>地理坐标</b><i class="gk${ns ? ' ns' : ''}">${esc(kind)}</i>` +
    `<span>${esc(d.name)}${bear ? ` · 方位 ${esc(bear)}` : ''}${elev ? ` · 高下 ${esc(elev)}` : ''}</span></div>`);
}
// pos provider：位卡 220 —— 名 · 义 · 行，即谱注自身的骨架。
//   词头＝位名所属之门（可点入门卡）＋位的性质（净土／起始／毕局）。
//     「第 X/220 位」已撤：SFP_POS 严格按门序排，门12 独占 52 位、门15 只 1 位，
//     第 110 位「師子奮迅三昧」与第 111 位分属慧学、藏教，义理上并不相邻——
//     这个序号读不出进度，是假刻度。同理卡内「上一位／下一位」一并撤（跨门即错邻居）。
//   义＝本位白话（文态即位注逐字，一枚切换原地对调）。
//   行＝升降行法全表，关联段折叠；逐组缘由不上卡（见 sfpMovesHtml 注）。
//   chain 只呈当下这一掷的实际来处（取 sfpS.trail），不在局中或非当下之位者整段不呈——不臆造行迹。
// ── 位白话取值口（2026-08-08 接线）──────────────────────────────────────────
// 手译本 SFP_POS_BAIHUA 译毕 220/220 后接入。全库先前只认旧本 SFP_POS_PLAIN（十处），
// 那是文言缩写：162 位与位注原文字面重合 ≥85%，读它不如读原著。今一律改走此二口。
// 2026-08-12 旧本 sfp-pos-plain.js 已随「正本为准、旧数据下线」一并撤——它的两处兜底
//   （此处与 posGistLine）实测 220/220 皆不可达，留着只是把一份作废的译文继续打进包里。
//   posGist(pid)  ＝一句话（判词落处、去处小签、门1逐位读、详读卡位命中）
//   posBodyOf(pid)＝卡上正文数组（领起句＋明细行），直接就是卡制 v3 的 body 形状
// 手译本在后续校审中会为生僻名相补足解释，领起段不再保证恒短；
// 卡片正文仍完整呈现 v，判词落处与小签则只从中择一句，避免把整段位义塞进提要行。
function posGist(pid        )         {
  const b = (SFP_POS_BAIHUA       )[pid];
  return b && b.v ? compactPosGist(String(b.v)) : '';
}
function posBodyOf(pid        )        {
  const b = (SFP_POS_BAIHUA       )[pid];
  if (b) {
    const rows = ((b.rows || [])         ).map((r     ) => ({ k: r.k, v: r.v }));
    // 他经补注：kind:'ext' 者由 renderEntry 独立成段、缀于明细行之后，段题取所引书名
    //（其逐字原文与 CBETA 行号另入 canon，见 posCardObj）
    const ext = ((b.ext || [])         ).map((x     ) => ({
      v: String(x.v), kind: 'ext',
      src: '补注 · ' + (String(x.src || '').match(/《[^》]+》[^（·]*/) || ['他经'])[0].trim(),
    }));
    return [{ v: String(b.v) }, ...rows, ...ext];
  }
  return [];
}
function posCardObj(pid        )                  {
  const p = (SFP_BY       )[pid]; if (!p) return null;
  const door = SFP_DOOR_BY[p.door];
  const cnD = (SFP_CANON_DOORS       )[p.door];
  const canonP = (((cnD && cnD.positions) || [])         )
    .find((x     ) => x.name === p.name || x.name === p.id || (x.name === '佛' && p.id === '圓教究竟妙覺位'));
  const juanCn = SFP_CN[(((cnD && cnD.juan) || 1)) - 1];
  // 位文切分改走切点表（sfp-canon-split.js，220 位逐位手核＋check:split 护栏），
  //   不再用 canonPosOnly 拿证据引文反查——那法会被「引整段」与「承前引」两类引法拖偏
  //   （见 sfp-canon-split.js:14-20 的 v4 之评）。键是**谱面位名**，终位在表里题作「佛」。
  const canonName = canonP ? canonP.name : p.name;
  const posText = String((canonP ? canonP.text : p.note) || '').replace(/^譜曰。/, '');
  const seg = sfpSplitOf(canonName, posText);
  const full = (seg.jie || posText).trim();   // 兜底：canon 空则文白开关整枚消失（test-card-v2:100）
  const bh = (SFP_POS_BAIHUA       )[p.id];
  // 来处链（.cChain）与本掷层（.cToss）双双撤于 2026-08-12（发起人点单「极简，只说必要的」）：
  //   两段说的都是**这一掷**——从哪来、掷出什么、判成什么——而这些判词卡上刚看过，一字不差。
  //   且两段的落处位名都与卡题逐字相同：一屏之内把读者要看的那个名字写了两三遍。
  //   位卡自此只答一件事：「这一位是什么」。故「详读」不再是另一种开法，与点位名进来所见全同。
  // 行法表实见行数＝有去向之组 ＋ 谱注另有说明的「不行」之组（与 sfpMovesHtml 同口径）。
  // 旧写法拿 moves.length 当行数，段名遂写「6」而展开是 21 行，数字与所见不符。
  const listed = new Set((p.moves         ).flatMap((m     ) => m.c         ));
  const nRows = (p.moves         ).length
    + Object.keys((SFP_WHY_EVIDENCE       )[p.id] || {}).filter((c        ) => !listed.has(c)).length;
  return {
    kind: 'pos', id: 'pos:' + p.id, name: p.name,
    // 词头一行讲完（2026-08-12）：门名（可点直达门卡）＋ 本位身份标。
    //   「卷第X」已撤——同一件事这一屏说三遍：此处一遍、原文段的出处一遍、「读原文 · 卷第X ›」钮一遍。
    head: [
      door ? { t: `第${SFP_CN[p.door - 1]}门 · ${door.title}`, go: () => { overlayOnClose = null; openDoor(p.door); } } : '',
      p.pure ? '净土' : '', p.start ? '起始位' : '', p.terminal ? '毕局' : '',
    ].filter(Boolean),
    body: posBodyOf(p.id),
    // 原文页：本位谱曰在前，他经补注逐字随后——补注一律另立门户、各标出处，不混进「谱曰」一栏。
    //   带 verify 者为待核稿，check-pos-baihua.mjs 拦在库里不上卡，此处不必再滤。
    canon: [
      full ? { tag: '谱曰 · 本位', text: full, src: `《選佛譜》卷第${juanCn} · 〈${p.name}〉位注` } : null,
      // 后论：全谱 6 位（見取／戒取／根本四禪／四無色定／意見參禪／光音天，共 516 字）
      //   不属任何一相的总结或问答。旧制的 canonPosOnly 切在最早引文处，把它一并丢了；
      //   切点表能切出来，故随本位谱曰之后补上（与阅读器 sfp-reader.js 的处置一致）。
      seg.post && seg.post.trim()
        ? { tag: '谱主后论', text: seg.post.trim(), src: `《選佛譜》卷第${juanCn} · 〈${p.name}〉位注` } : null,
      ...(((bh && bh.ext) || [])         ).map((x     ) => ({
        tag: '补注 · ' + (String(x.src).match(/《[^》]+》/) || ['他经'])[0],
        text: String(x.canon || ''), src: String(x.src || ''),
      })).filter((x     ) => x.text),
    ].filter(Boolean),
    rel: p.terminal
      ? { k: '毕局', html: '<div class="cNote">谱曰「歸無所得」——行法表不复列去向，此为全谱终位。</div>', n: 0 }
      : { k: `升降行法 · ${nRows} 组`, html: sfpMovesHtml(p), n: nRows },
  };
}
// 位卡今与处所／辅标／段签同走 mountEntry 一副壳。较归一前撤去六件：
//   ① 副题「· 原文说明」——卡上主体是白话，原文一枚切换即得，旧题把预期带偏；
//   ② 链接行三条——「卷第X·本門譜文」与「讀本位全文」原是同一个 openDoor(jump)，
//      两种措辞一个去处；本位原文今在卡上文态即得，两条俱不必；
//   ③ 地理坐标框——取的是所锚法界的方位高下，与这一位无关，处所卡已排过一遍；
//   ④ 门义折叠——门卡是正主，词头门名可点直达（SFP_DOOR_PRACTICE 修行一句已随门卡呈）；
//   ⑤ 上一位／下一位——按 SFP_POS 全表序翻，跨门即错邻居，有序浏览归门卡位次一览；
//   ⑥ 「回到局中」钮——关卡即回局中，✕ 与下滑皆可，不必再占一行。
//   所留者惟「定位此位」（飞到本位之珠），与所锚法界一并作按钮。
// 自测钩子：位卡（test-pos-card.mjs 验收白话手译本接线）——不开卡，只取卡对象，免受浮层动画干扰
(window       ).__posCardObj = (pid        ) => posCardObj(pid);
(window       ).__posGist = (pid        ) => posGist(pid);
(window       ).__openSfpNote = (pid        ) => openSfpNote(pid); // 实开位卡：验收浮标须数卡面 DOM，不查库
function openSfpNote(pid         ) {
  const p = pid ? SFP_BY[pid] : (sfpS.pos ? SFP_BY[sfpS.pos] : null);
  if (!p) { openDoor(sfpS.pos ? SFP_BY[sfpS.pos].door : 1); return; } // 未入局无本位可呈，径入门卡
  const o = posCardObj(p.id)         ;
  const btns        = [];
  const loc = el('<button class="gbtn">定位此位</button>');
  loc.addEventListener('click', () => { closeOverlay(); sfpLocate(p.id); });
  btns.push(loc);
  if (byId[p.anchor]) { // 互链：谱位→所在法界卡（那卡内又有「此处谱位」段链回诸位）
    const anc = el(`<button class="gbtn">${zh(byId[p.anchor].d.name)}界相</button>`);
    anc.addEventListener('click', () => {
      closeOverlay();
      if (p.pure && !inPure) enterPure();
      if (!p.pure && inPure) returnSaha();
      if (inSky && !SKY_IDS.has(p.anchor)) returnSaha();
      selectNode(p.anchor);
    });
    btns.push(anc);
  }
  // 「读原文 ›」——位卡到六卷阅读器的升级出口（2026-08-12 补此断链）。
  //   卡上原文只是本位义解一段；阅读器那一节另有廿一相全表（21 格判词白话＋引文）、
  //   后论段与前后节连读，是同一位的完整读法。
  //   backTo 只做一级：位卡从局中开，本无来路，不必再往里套第三层。
  //   openReader 内的 plazaNavAway() 会先清 overlayOnClose，故不会与本卡返程叠链。
  {
    const cnD = (SFP_CANON_DOORS       )[p.door];
    const canonP = (((cnD && cnD.positions) || [])         )
      .find((x     ) => x.name === p.name || x.name === p.id || (x.name === '佛' && p.id === '圓教究竟妙覺位'));
    const juanCn = SFP_CN[(((cnD && cnD.juan) || 1)) - 1];
    const rd = el(`<button class="gbtn">${zh(`读原文 · 卷第${juanCn}`)} ›</button>`);
    rd.addEventListener('click', () => {
      playSfx('sfx-tap', 0.25);
      overlayOnClose = null;
      openReader({ pos: canonP ? canonP.name : p.name, backTo: () => openSfpNote(pid) });
    });
    btns.push(rd);
  }
  // 顶部两层撤于 2026-08-12（发起人：主次分不清、太密）——两组皆是同一件事说两遍：
  //   ① 副题「二百二十位之一」：不报关于这一位的任何事，只说「这是个谱位」，而词眉已题
  //      「谱位详解」。它还是 v391 撤掉的那把假刻度（「第 N/220 位」，见本文件上方裁定
  //      「这个序号读不出进度」）的另一种说法——不带数字，同样不带信息。
  //   ② 类标「本位白话 · 可对读谱曰原文」：正是其下「白话 · 原文」开关所说的事，
  //      而开关可点、类标只是旁白。信息只出一次，留可操作的那一个。
  // 撤后顶部＝词眉·位名 → 门·卷 → 白话/原文开关，三层，主次自明。
  mountEntry(o, { btns });
}
// 「问」的落点：游戏 Worker 收到 /api/ask 即经 service binding 内转问谱
// （xuanfopu-agent-v2，源随仓 agent/worker/）。面板在本文件下方 openSfpReading。
// 客户端日配额（ASK_LIMIT／askQuotaLeft／save.askq）2026-08-12 撤：
//   配额之事归后端一处管（guard.js 按客户端指纹行日配额，额满降级原文直出不拒答），
//   前端另记一份既拦不住绕行者，又与后端各说各话，读者看见的余量还未必是真的。
const SFP_ASK_API = `${API_BASE}/api/ask`;
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
  // 截断：交错对读撤后不再有「对读键边界」可依，回到句界求截口（原文长引只作旁证，不是读本——
  //   要通读整位原文，白话在上、「阅读原文 ▸」在下，两条路都在这张抽屉里）
  if (body.length > 240) {
    const cut = body.indexOf('。', 220);
    if (cut > 0 && cut < body.length - 2) body = body.slice(0, cut + 1) + '……';
  }
  // 白话在前、原文在后（2026-08-12 正本归一）：白话取 posGist——它本身已是「正本优先」的取值口。
  const pl = posGist(pid);
  const du = (pl ? `<div class="dd">${glossify(esc(String(pl)))}</div>` : '')
    + `<div class="verse">${verseHtml(body.replace(/^譜曰。/, ''))}</div>`;
  // V69：节标题用大白话，出处小注保留书名卷次
  return `<details class="sec"><summary>${esc(label)}<span style="opacity:.65;font-weight:400"> · 出自《选佛谱》第${SFP_CN[juan - 1]}卷</span></summary>
    <div style="margin-top:5px">${du}</div>
    ${ci >= 0 ? `<span class="rdMore lnk" data-ci="${ci}" style="margin-top:5px;font-size:var(--fs-xs);display:inline-block">阅读原文 ▸</span>` : ''}</details>`;
}
const RD_DIR_VERB                         = { up: '升往', down: '降往', pure: '横超至', side: '转往' };
// V90：各门「修行」栏的白话只说本门修法要点；逐字引文另层列出，不把项目释义写成谱曰。
const SFP_DOOR_PRACTICE                         = {
  1: '首掷所定只是本局起修的因地，无关高下：轮面六字虽有四层表法，却不是固定的升降方向；从任何一位起，此后皆依本位行法表判定。',
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
// ── 旧「问」的本地答语库（2026-08-12 作废，随问谱接入一并撤除）────────────────
// 从前每问双轨：一路发智能体，一路在本地按正则分派到十来个手写答语函数（玩法／轮相／
//   位义／行法／上进／横超／门类／名相检索／白话库检索），答案在同一条对话里并列两份，
//   下面还压一段折叠的「本谱本地速查」。那是智能体尚不可靠时的兜底之制。
// 今问谱 v3（agent/worker，检索全书 692 块＋据文生成＋句级核验）已是唯一之路：
//   它检的是同一部书，且逐句挂角标可核对——本地那一路既非更准，又与之各说各话，
//   两份答案摆在一处，读者无从取舍。故一律撤去，问答只此一路。
// 撤除者：doorCiteHtml／sfpPracticeAnswerHtml／sfpLocalSearch／sfpWhyAnswerHtml／
//   sfpPosAnswerHtml／sfpMoveAnswerHtml／sfpUpwardAnswerHtml／sfpCrossAnswerHtml／
//   sfpDoorAnswerHtml／sfpPlainLibSearch／sfpCorpus／sfpBestTerm／sfpChatAnswer，
//   及 SFP_CHAT_HELLO／SFP_RULES_A／SFP_WHEEL_A 三则定稿答语。git 可考。
const sfpChat                                  = [];
const SFP_ORD = '那謨阿彌陀佛';
// v348 解读卡极简（上游用户点单）：去向条（谁→谁）＋标签短行制——长段白话与「位义前已读过」类元话术退役；
// 引文仍分层折叠压底（逐字引文／项目释义／操作规则不得互相冒充，与 sfp-evidence 同则）
const RD_ARROW                         = { up: '升 ↑', down: '降 ↓', pure: '横超 ⇢', stay: '安住 ·', start: '因地 ◇', bonus: '贈掷 ✦', side: '转 →' };
function rdRow(k        , v        , main          )         {
  return `<div class="rdRow${main ? ' m' : ''}"><span class="k">${zh(esc(k))}</span><span class="v">${v}</span></div>`;
}
// v412/v414 本位提要（判词卡「落处」一行）：位白话动辄七八十字，与折叠原文逐词重出；
//   此处只择一句答「到了哪一位、这一位在修什么」，深读仍归位卡与谱文页。
//   择句序：先取「何业所感／修何法」，次取「证悟断惑立名」，方位·寿量·名义训释与转折残句退后。
//   2026-08-07 注：本地位白话是全文本（线上于 45 位删了两成以上），极简靠这里择句达成，不靠削薄底本。
// v412：位提要已独立成行（判词卡 #vGist），说明句里的「本位…；此掷」前缀就成了重复，剥掉。
const stripGist = (s        )         => String(s || '').replace(/^本位[^；]{0,40}；此掷/, '');
function compactPosGist(text        )         {
  const t = String(text || '').trim();
  if (!t) return '';
  const segs = t.split(/[；。]/).map(x => x.trim()).filter(Boolean);
  const CAUSE = /(所感|所寄|所修|修[^，]{0,8}(定|觀|观|禪|禅|懺|忏|行)|兼[學学习習]|善[所業业]|十善|懺|忏)/;
  const MERIT = /(證|证|斷|断|發|发|故名|即[^，]{0,4}佛|觀|观|念|三昧|無明|无明|惑)/;
  const SITE = /^(离|離)[^，]*由旬|^梵語|^梵语|此翻|寿|壽|由旬|大劫|歲|岁/;
  const FRAG = /^(然|而|或|亦|並|并|又|唯|但)/;
  const ok = (x        ) => !SITE.test(x) && !FRAG.test(x);
  let g = segs.find(x => CAUSE.test(x) && ok(x)) || segs.find(x => MERIT.test(x) && ok(x)) || segs.find(ok) || segs[0] || '';
  g = g.split(/，或[是亦]/)[0];
  if (g.length > 32) { const cut = g.slice(0, 32); const i = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、')); g = i > 12 ? cut.slice(0, i) : cut; }
  return g;
}
// posGistLine 已并入 posGist（2026-08-12）：它是旧本 SFP_POS_PLAIN 的取值口，
//   而旧本 220/220 皆有正本可代，故不再另立一口——一句话的位白话只此 posGist 一处出。
function rdRouteHtml(F     , T     , dir        , again         )         {
  const chip = (p     , mark         ) => p ? `<span class="p rdMore" data-ci="${(SFP_POS         ).findIndex((x     ) => x.id === p.id)}">${esc(p.name)}${mark ? `<b class="ag">${zh(mark)}</b>` : ''}</span>` : '';
  const ar = `<span class="ar ${dir}">${zh(RD_ARROW[dir] || '往')}</span>`;
  if (!F && T) return `<div class="rdRoute">${ar}${chip(T, again)}</div>`;
  if (!T || (F && T.id === F.id)) return `<div class="rdRoute">${chip(F, again)}${ar}</div>`;
  return `<div class="rdRoute">${chip(F)}${ar}${chip(T, again)}</div>`;
}
// v400 判詞卡改制（發起人定 2026-08-04）：判定壓成一行，白話居中，原文緊隨其下作**文白對照**。
// 出處只留位名——譜中引文常出自別位（承注），位名一望即知此判從何處繼承而來；
// 卷號行號則只對校勘有用，於讀者無益，故去之。位名可點即跳。
function rdCanonHtml(F     , combo        )         {
  // 详读首先展示与白话正本同条保存的引句，避免“卡上白话来自正本，点开却跳回旧承注引文”的双轨。
  const published = F && combo ? sfpCanonVerdict(F.id, combo) : null;
  if (published && published.quote) {
    return `<div class="rdCanon" data-source="verdict-canon"><div class="cMeta">正本所引 · 谱曰原文</div>`
      + `<div class="rdCanonRow"><span class="t">${esc(published.quote)}</span></div></div>`;
  }
  const cz = F && combo ? czOf(F.name, combo) : null;
  if (!cz || !cz.cites.length) return '';
  const many = cz.cites.length > 1;
  const rows = cz.cites.map((x     , i        ) => {
    const other = x.n && F && x.n !== F.name;
    return `<div class="rdCanonRow" data-i="${i + 1}">`
      + (many ? `<span class="sfpCiteN">${i + 1}</span>` : '')
      + `<span class="t">${esc(x.t)}</span>`
      + (x.n ? `<button type="button" class="sfpCiteGo${other ? ' oth' : ''}" data-pos="${esc(x.n)}">${esc(x.n)}</button>` : '')
      + '</div>';
  }).join('');
  return `<div class="rdCanon"><div class="cMeta">谱曰</div>${rows}</div>`;
}

// 四類簽自機生成，每格切題，不硬編：名相／引文所出之位／行法表／門
// v473（移植线上 V106）详读卡的追问签：旧四枚里两枚与正文重复（「X是什么」＝正文首段），
//   一枚「X掷别的相会怎样」还是棋制话（行法去向详读卡本就已呈）。
//   今改问正文之外、且逐位不同的三事——本位六字定诠 › 本位当机之问（按位类分）› 净土去路。
//   签面只留短语，实际问句另存 data-ask 带上位名：「问」那侧靠位名/名相命中，指代「此位」问不出东西。
//   用语一律取谱内明文：「散善」只是门12 初歡喜地用词，别门不得借，故门1 那枚另拟。
//   门1＝發始因地門（造因位），故按位名再分三档；门4＝欲界人天門（受报位，四洲并非得定），
//   故一律问「受报由何善招」——勿把东胜神洲问作「既得定境」。
function tossChipsHtml(F     , T     , combo        = '')         {
  const P = T || F;
  if (!P) return '';
  const n = P.name, d = P.door;
  const rows                          = P.terminal
    ? [['本掷为何入极果', `从「${F ? F.name : n}」掷得「${combo}」，为何能入「${n}」？`],
      ['何谓归无所得', `「${n}」谱曰「歸無所得」，是何义？`],
      ['身土不二如何理解', `「${n}」佛位标目所说的身土不二，应如何理解？`]]
    : [['六字在此位何义', `在「${n}」，那謨阿彌陀佛六字各表何义？`]];
  if (P.terminal) return rows.map(([lbl, q]) => `<span class="chipQ" data-ask="${esc(q)}">${esc(lbl)}</span>`).join('');
  else if (P.pure) rows.push(['带业往生何以不退', `「${n}」既是带业往生，何以永离退缘？`]);
  else if (d === 2 || d === 3) rows.push(['此位苦报由何业招', `「${n}」的苦报由何业所招？`]);
  else if (d === 1) {
    if (/十惡/.test(n)) rows.push(['此惡可依何法忏', `「${n}」之惡，可依何法忏除？`]);
    else if (/禪|定|無色|無量/.test(n)) rows.push(['定境为何仍在三界', `「${n}」既得定境，为何仍属三界？`]);
    else if (/出世/.test(n)) rows.push(['出世三学何次第', `「${n}」在出世戒定慧三学中居何次第？`]);
    else rows.push(['此善为何仍属世间', `「${n}」所修之善，为何仍属世间？`]);
  } else if (d === 4) rows.push(['此位受报由何善招', `「${n}」的受报由何善所招？`]);
  else if (d >= 5 && d <= 9) rows.push(['此位所断何惑', `「${n}」所断是见惑还是思惑？`]);
  else rows.push(['此位断惑证何位', `「${n}」断何惑、证何位？`]);
  rows.push(P.pure ? ['极乐四土何别', '极乐四土有何别？'] : ['从此位可否横超', `从「${n}」可否横超净土？`]);
  return rows.map(([lbl, q]) => `<span class="chipQ" data-ask="${esc(q)}">${esc(lbl)}</span>`).join('');
}

function sfpTossAnswerHtml(ctx                                                         )         {
  const M = sfpTossCardModel(ctx);
  const F = M.from;
  const T = M.to;
  const stay = M.stay;
  const dir = M.dir;
  const cz = F && ctx.c ? czOf(F.name, ctx.c) : null;
  const rows           = [];

  // ① 去向条：谁 → 谁（位名可点即入位卡），重访缀「第N次」。
  //    v400 的一行判定文字（「上品十惡 · 掷得「那那」→ 阿鼻地獄」）退役——同样的信息，
  //    去向条给的是可点的两枚位签与升降箭头，读者一眼看出方向，且省一行。
  const tgt = T && !stay ? T : F;
  const tSeen = tgt ? sfpS.trail.filter(x => x === tgt.id).length : 0;
  // v351 三层收作两层：轮相表法并入去向条下小字。
  // v454 补第二重表法：旧只给四善（佛＝善慧），而「那佛／謨佛能行、阿佛能升」之关窍
  //   正在「佛＝无漏善」——「有漏惡劣。不能障無漏善令總不行」，故含佛字时点明无漏。
  // 六字在各门各位可能当令于善恶、二惑、四善、四门四层。旧小字恒套“那=见惑、阿=施善”
  // 会在第四层等位次说错；正本已逐格写明当令义，故这里只报轮相，具体字义紧随正本判词读取。
  const glyph = M.canon
    ? (M.to?.terminal
      ? `${ctx.c.split('').join(' · ')}　（本次轮相依出发位「${M.from.name}」判义；第十五门佛位本身不再列轮相）`
      : `${ctx.c.split('').join(' · ')}　（本位字义依当令层，见下方正本判词）`)
    : ctx.c.split('').map(ch => `${ch}＝${String((SFP_PLAIN       )[ch] || '').replace(/^表/, '').replace(/（[^）]*）/g, '')}`).join('　');
  // 不在此处套 zh()：轮相六字与表义皆是数据，简繁一律交 zhDom 统一折算
  //（模板内只对固定 UI 串如行题、箭头用 zh()，与 rdRow／rdRouteHtml 同例）。
  rows.push(rdRouteHtml(F, T, dir, tSeen >= 1 ? `第${tSeen + 1}次` : '')
    + `<div class="rdGlyph">${esc(glyph)}</div>`);

  // ② 落处：只答「到了哪、这位在修什么」一句（v412/v414 取**去处之位**——
  //    出发位的位义上一张卡刚读过，此刻要知道的是要去的那一位是何修行）。
  let head = '';
  if (!F && T) head = `首掷定其發始因地，「${ctx.c}」安位于此。${posGist(T.id)}`;
  else if (stay) head = `仍住「${F ? F.name : ''}」，不移位。`;
  else if (!T) head = '本位行法于此组「可贈而不可行」：得贈掷数而不移位。';
  else if (T) head = posGist(T.id);
  if (head) rows.push(rdRow('落处', glossify(esc(head))));

  // ③ 缘由：逐层各自署名（v409）——理解层若不另署，读者会当成谱曰。
  //    「缘由」＝谱主本位之注；「所指」＝谱主作「餘如前說」而溯到被指位之注；
  //    「字义」＝本项目依卷首六字定诠所补；「通例」＝不行之由，谱主通例原语的逐相化。
  const L = M.layer;
  const many = !!(cz && cz.cites.length > 1);
  const cite = (t        ) => glossify(esc(t)).replace(/\[(\d{1,2})\]/g,
    (mm, n) => (many && cz.cites[+n - 1]
      ? `<button type="button" class="sfpCite" data-n="${n}" title="点开看这一条">${n}</button>` : ''));
  if (L.text && L.kind === 'refer') {
    rows.push(rdRow(SFP_WHY_LAYER_LABEL.refer, `${cite(L.text)}<span class="rdSub">（谱主于本位作「餘如前說」等语——所指即「${esc(L.src || '')}」本组之注，仍是谱文）</span>`, true));
  } else if (L.text && L.kind === 'glyph') {
    rows.push(rdRow(SFP_WHY_LAYER_LABEL.glyph, `${cite(L.text)}<span class="rdSub">（依卷首〈輪相表法第一〉六字定诠——本项目理解层，非谱曰按语）</span>`, true));
  } else if (L.text) {
    rows.push(rdRow(SFP_WHY_LAYER_LABEL[L.kind] || '缘由', cite(L.text), true));
  } else {
    // 谱主于本位本组无按语、诸层亦不摄者（实测 21 格）：落承注库，仍不空手。
    const wp = (cz && cz.plain) || sfpEvidenceInterpretationText(
      M.evidence);
    if (wp) rows.push(rdRow('缘由', cite(wp), true));
  }

  // ④ 贈掷之操作规则（此非谱曰，是本项目定稿之操作解释，故另作细字不入缘由行）
  const mv = F && ctx.c ? (F.moves         ).find(m => (m.c            ).includes(ctx.c)) : null;
  if (M.operation) rows.push(`<div class="rdRule"><b>本项目操作规则</b><span>${glossify(esc(M.operation))}</span></div>`);
  else if (mv && mv.bonus) rows.push(`<div class="rdRule"><b>本项目操作规则</b><span>${mv.to ? '先移至目的位，再从目的位续掷。' : '棋子不移位，立即续掷。'}</span></div>`);

  return rows.join('') + rdCanonHtml(F, ctx.c) + `<div id="trChips" class="rdChips">${tossChipsHtml(F, T, ctx.c)}</div>`;
}

// ── 问谱 · 游戏站的「问」（2026-08-12 重做，接问谱 v3；旧的一并作废）───────────────
//
// 【旧貌与何以废】从前这一路叫「G 版选佛谱智能体」，一问双答：一路发后端，一路在本地
//   按正则分派手写答语，两份并列在同一条对话里，下面还压一段折叠的「本谱本地速查」；
//   答语之上另有判定条（facts）、「再讲开一点」、「（本机缓存·即答）」诸件。
//   那是后端只会查表、尚不能成话时的形制。今后端已是问谱 v3（检索全书 692 块 → 据文
//   生成 → 逐句挂角标可核对），它不再返回 facts、不再有定本路由，故那些件本已成死肉；
//   本地那一路检的是同一部书，既非更准，又与之各说各话，两份答案并列，读者无从取舍。
//
// 【今制 · 极简】与阅读页的问谱抽屉（src/reader-ask.js）同一形制、同一内核
//   （src/ask-core.js：流式解析与答语排版两处共用），只是着色走本站暗夜卡面 token。
//   一屏之内只三件：预设问 chips ／ 问答流 ／ 输入条。答语之下只两样——
//     · 行内角标 [n]：点开即展出处原文，可再点跳到谱里那一位（这是本站独有的去处）
//     · 一行核验小字：引文已逐句核验／有句未过被剔除／降级直出
//   撤：本地速查双轨、判定条、再讲开、缓存标记、日配额计数（后端自有配额与快取）。
// 四枚预设问二设（2026-08-14 发起人点单重设计）：从「介绍这部书」转向「陪人修行」——
// 入门（怎么玩）→ 机制（六字表法）→ 修行（退了怎么忏，三忏材料随外典入库已最扎实）→
// 归宿（念佛横超净土，谱内横超门＋《弥陀要解》两路材料）。「谁写的」出列：题屏玩法卡
// 与《敘》已载，打字可问；四枚要各占一层，不为身世留席。
const SFP_ASK_CHIPS = [
  ['这局怎么玩', '选佛谱这局是怎么玩的？'],
  ['六字何义', '轮相六字「那謨阿彌陀佛」各表什么？'],
  ['退了怎么办', '退堕了怎么办？如何忏悔对治？'],
  ['何谓横超', '什么是念佛横超净土？'],
];
const sfpAskLog                                                    = [];
let sfpAskBusy = false;

/** 一条答语的正文：排版＋角标（角标点开即出处，见面板事件委托） */
function askBodyHtml(m     )         {
  const n = (m.p || []).length;
  if (!m.a) return `<div class="askDots"><i>${zh('检书中')}</i><span></span><span></span><span></span></div>`;
  const badge = !m.done ? ''
    : m.deg ? `<div class="askChk warn">${zh('模型暂不可用，以下为检得原文直出')}</div>`
      : m.drop ? `<div class="askChk warn">${zh(`有 ${m.drop} 句未过核验，已剔除`)}</div>`
        : n ? `<div class="askChk ok">${zh('引文已逐句核验')}</div>` : '';
  return askFormat(m.a, n) + badge;
}

/** 出处卡：逐字原文＋出处串＋跳位。引文不是死脚注，能把人带到谱里那一处。
 *
 * 【本函数自理简繁，调用处不得再包一层 zh()】两处都会坏（2026-08-12 实测）：
 *   ① 引文正文是 CBETA 底本逐字原文，须走 rawShow（繁体态原样、简体态折简）——
 *      过 zh() 则繁体态跑 S2T，「余年」成「餘年」之类改字十四处（见 npm run check:zh 检三）。
 *   ② data-pos 里是位名，整段 HTML 过 zh() 连属性一起折简，pidOf 遂查无此位、跳位失灵。
 *      这正是 sfp-reader.js 头注所记「属性里只放数字下标」那条陷阱的同一个坑。
 */
function askCiteHtml(p     )         {
  if (!p) return '';
  const t = askCiteTarget(p);
  const jump = t
    ? `<button type="button" class="askGo" data-kind="${t.kind}" data-key="${esc(t.key)}">${zh(`去「${t.name}」看`)} ›</button>` : '';
  return `<div class="askCiteCard"><div class="cMeta">${esc(zh(String(p.ref || '')))}</div>
    <div class="txt">${esc(rawShow(String(p.text || '')))}</div>${jump}</div>`;
}

/** 引文块 → 谱里的去处。问谱的引文来自全文 692 块，块题（p.title）或是位名、或是门题
 *  （如「第十四淨土橫超門」）、或是卷首篇名（敘／紀事／輪相表法）。前二者谱里有卡可去，
 *  故各自解析；卷首篇无卡，返 null 即不出跳位钮——没有去处而挂个钮，是骗一次点击。
 *  （後端 toPassages 的 posName 於全文塊恆為空串，跳位全靠此处解析，勿倚赖它。） */
function askCiteTarget(p     )                                                        {
  const raw = String(p.posName || p.title || '').trim();
  if (!raw) return null;
  const pid = pidOf(raw);
  if (SFP_BY[pid]) return { kind: 'pos', key: pid, name: SFP_BY[pid].name };
  const bare = raw.replace(/^第?[一二三四五六七八九十]+/, '');      // 「第十四淨土橫超門」→「淨土橫超門」
  for (const d of (SFP_DOORS         )) {
    if (d.title === raw || (bare.length >= 3 && d.title.includes(bare))) {
      return { kind: 'door', key: String(d.no), name: d.title };
    }
  }
  return null;
}

async function askSend(q        , rerender            ) {
  q = String(q || '').trim();
  if (!q || sfpAskBusy) return;
  sfpAskBusy = true;
  playSfx('sfx-tap', 0.25);
  const m                                                  = { u: q, a: '', p: [], done: false, deg: false, drop: 0 };
  sfpAskLog.push(m);
  if (sfpAskLog.length > 20) sfpAskLog.splice(0, sfpAskLog.length - 20);
  rerender();
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 45000);
  try {
    await streamAsk(SFP_ASK_API, { question: q, history: historyOf(sfpAskLog.slice(0, -1)) }, {
      onMeta: (d) => { m.p = d.passages || []; m.deg = !!d.degraded; },
      onDelta: (full) => { m.a = full; rerender(); },
      onDone: (d) => { m.drop = (d.verify && d.verify.checks && d.verify.checks.dropped) || 0; },
    }, ctl.signal);
    if (!m.a.trim()) throw new Error('empty');
  } catch {
    // 连不上即据实说，不拿别的东西冒充答案（本地那一路已废，见上文）
    m.a = m.a || '这会儿没连上问谱。稍后再问，或到「六卷原文」里翻目录查。';
    m.deg = true;
  }
  clearTimeout(to);
  m.done = true;
  sfpAskBusy = false;
  rerender();
}

// 「问」＝与本谱对话：每问经游戏 Worker 的 service binding 内转问谱
// （/api/ask → xuanfopu-agent-v2），答语逐句挂角标，出处可核对、可跳位。
function openSfpReading(prefillQ         = '') {
  const chips = SFP_ASK_CHIPS.map(([lbl, q]) =>
    `<span class="chipQ" data-ask="${esc(q)}">${esc(lbl)}</span>`).join('');
  const pnl = el(`<div class="panel askPanel"><h2>问谱<i>依六卷谱文作答</i></h2>
    <div class="body askLog" id="askLog"></div>
    <div class="askChips">${chips}</div>
    <div class="askBar">
      <input id="askQ" class="cbInput" type="text" placeholder="问谱位·名相·行法·这局怎么玩…">
      <button class="gbtn primary" id="askGo2">问</button>
    </div>
    <div class="askFoot"><button class="gbtn" id="askNew">新对话</button><button class="gbtn" id="askOk">${sfpS.active ? '回到局中' : '关闭'}</button></div></div>`);
  const log = pnl.querySelector('#askLog')               ;
  const render = () => {
    log.innerHTML = zh(sfpAskLog.length
      ? sfpAskLog.map((m, i) => `<div class="askU">${esc(m.u)}</div>`
        + `<div class="askA" data-mi="${i}">${askBodyHtml(m)}</div>`).join('')
      : `<div class="askHello">南无阿弥陀佛。此谱之事皆可相问——谱位、名相、行法去向、教路次第，或此局如何玩。<i>答语只依六卷谱文，逐句带出处，点角标可核对原文。</i></div>`);
    log.scrollTop = log.scrollHeight;
  };
  const send = (qGiven         ) => {
    const inp = pnl.querySelector('#askQ')                    ;
    const q = (qGiven !== undefined ? qGiven : inp.value).trim();
    if (!q) return;
    if (qGiven === undefined) inp.value = '';
    void askSend(q, render);
  };
  (pnl.querySelector('#askGo2')               ).addEventListener('click', () => send());
  (pnl.querySelector('#askQ')                    ).addEventListener('keydown', (e) => { if ((e                 ).key === 'Enter') send(); });
  (pnl.querySelector('#askNew')               ).addEventListener('click', () => { sfpAskLog.length = 0; render(); });
  (pnl.querySelector('#askOk')               ).addEventListener('click', closeOverlay);
  pnl.addEventListener('click', (e) => {
    const tg = e.target               ;
    if (!tg.closest) return;
    const chip = tg.closest('.chipQ')                ;
    if (chip) { send((chip               ).dataset.ask || chip.textContent || ''); return; }
    // 角标：点开即在本条答语之下展出那一条出处（同屏对读，不另开层）
    const cite = tg.closest('.ai-cite')                ;
    if (cite) {
      const wrap = cite.closest('.askA')                ;
      const m = sfpAskLog[Number(wrap.dataset.mi)];
      const p = m && m.p && m.p[Number((cite               ).dataset.n) - 1];
      if (!p) return;
      wrap.querySelectorAll('.askCiteCard').forEach((x) => x.remove());
      const on = cite.classList.contains('on');
      wrap.querySelectorAll('.ai-cite.on').forEach((x) => x.classList.remove('on'));
      if (on) return;                                  // 再点即收
      cite.classList.add('on');
      wrap.insertAdjacentHTML('beforeend', askCiteHtml(p));   // 自理简繁，勿包 zh（见其头注）
      (wrap.querySelector('.askCiteCard')               ).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    // 出处所出之处：点了就跳到谱里那一位／那一门
    const go = tg.closest('.askGo')                ;
    if (go) {
      const d = (go               ).dataset;
      if (d.kind === 'pos' && SFP_BY[d.key || '']) { closeOverlay(); openSfpNote(d.key         ); }
      else if (d.kind === 'door') { closeOverlay(); openDoor(Number(d.key)); }
    }
  });
  (window       ).__askProbe = { log: () => sfpAskLog, render };   // 自测钩子（scripts/test-ask-panel.mjs 第四节种引文）
  openOverlay(pnl);
  render();
  if (prefillQ) send(prefillQ);   // 修行手册等预置之问：开面板即代问一句，答语与手问同一条流、同一套角标
}
function openSfpIntro() {
  // 调试钩子：仅供自测驱动（不影响玩法）
  (window       ).__sfpGo = (id        ) => { if (sfpS.active) sfpGoto(id, '调试移位'); };
  const hasSave = !!(save.sfp && SFP_BY[save.sfp.pos]);
  const p = el(`<div class="panel"><h2>选佛谱 · 缘起与玩法</h2><div class="body">
    <div class="igLead">明末蕅益大师五十五岁手定的一部<b>掷轮图谱</b>：全谱十五门、二百二十位，以两枚六面轮呈现十法界因果与修学次第。它不是占卜；本局位次不代表玩家现实中的业力、吉凶或证位。</div>
    <div class="igMeta">釋智旭（蕅益大師）述 · 六卷 · 癸巳（1653）歙浦迴龍精舍 · CBETA B0136</div>
    <div class="igOr"><b class="k">缘起</b><span>大师见同参耽于博弈，想拿一张能长智慧的图替下赌局；旧传的选佛图或失传、或理路不通，遂自己重制。</span>
      <div class="verse"><i class="duL">敘</i>見諸法友眈嗜博奕。思易之以幽溪之圖。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div></div>
    <div class="igOr"><b class="k">初心</b><span>要让人在游戏之间，亲眼看见六道往还有多苦、三乘出离有何差别。</span>
      <div class="verse"><i class="duL">敘</i>能使人即遊戲間。頓知六道往還之疲苦。三乘出要之差別。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div></div>
    <div class="igOr"><b class="k">精神</b><span>图中一切升沉判语皆依经论教乘而定，不出自己的猜想；三十余年反复改图，只为「易于行」。</span>
      <div class="verse"><i class="duL">敘</i>皆本教乘非出臆見。<span class="cSrc" style="display:block">《選佛譜》卷首 · 敘選佛譜敘</span></div></div>
    <div class="igOr"><b class="k">愿力</b><span>十三日成稿后，蕅益大师将这份功德普施法界有情，愿众生同开妙解、同发大愿、速生西方极乐世界。</span>
      <div class="verse"><i class="duL">紀事</i>願以此功德。普施法界有情。同開妙解。深知法界事理性相。同發大願速生西方極樂世界。<span class="cSrc" style="display:block">《選佛譜》卷末 · 紀事（卷第六後）</span></div></div>
    <details class="sec"><summary>怎么掷 · 三步</summary>
      <div class="cNote">原谱以佛号六字代替普通数字。原谱的实物掷法是“置轮掌心，仰手旁掷”；本项目将它转化为长按、松手的数字操作。（长按掷轮时称念一声“南无阿弥陀佛”，念完松手掷出。请以恭敬心操作。）</div>
      <div class="igStep"><span class="n">1</span><span class="tx"><b>长按掷轮</b>，称念一声佛号，念完松手；两枚轮各落出一个字，合成这次轮相。</span></div>
      <div class="igStep"><span class="n">2</span><span class="tx"><b>首掷定發始因地</b>，只决定本局起点；以后每掷依当前位的原谱行法表判定。</span></div>
      <div class="igStep"><span class="n">3</span><span class="tx"><b>判词窗点“行”确认</b>，棋子才移动；到达“佛”位即本局选佛及第，不等同现实修证成佛。</span></div>
      <div class="igTwo"><div><b>豎入</b><span>依所修教法，按断惑证位的次第进修。</span></div>
        <div><b>橫超</b><span>依阿弥陀佛愿力，发愿往生极乐；进入净土位后仍按本位行法继续。</span></div></div></details>
    <details class="sec"><summary>轮相六字 · 四层表法</summary>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:8px 0 3px">${[['那', '見煩惱', 0], ['謨', '愛煩惱', 0], ['阿', '布施', 1], ['彌', '持戒', 1], ['陀', '禪定', 1], ['佛', '無漏善慧', 1]].map(([ch, sub, good]) => `<div style="text-align:center;border:1.5px solid ${good ? 'rgba(215,170,69,.6)' : 'rgba(176,90,66,.7)'};border-radius:9px;padding:7px 2px 5px;background:${good ? 'rgba(215,170,69,.07)' : 'rgba(176,90,66,.08)'}"><div style="font-size:var(--fs-xl);line-height:1.25;color:${good ? '#f4e6b8' : '#f0af9e'}">${ch}</div><div style="font-size:var(--fs-xs);color:#c9bd93;margin-top:1px">${sub}</div><div style="font-size:var(--fs-xs);letter-spacing:1px;color:${good ? '#d7aa45' : '#f0af9e'};margin-top:2px">${good ? '表善' : '表惡'}</div></div>`).join('')}</div>
      <div class="cNote">这是卷首总表法，不是固定升降方向；同一轮相在不同位去向不同，以当前位判词为准。六字另有有漏无漏与生灭、无生、次第、圆顿等层义，具体采用哪一层，以本位谱注为准。</div></details></div>
    <div class="igBtns">
      ${hasSave ? '<button class="gbtn primary wide" id="sfpResume">续掷上局</button>' : ''}
      <button class="gbtn ${hasSave ? '' : 'primary wide'}" id="sfpNew">新开一局</button>
      <button class="gbtn" id="sfpLog">见闻录</button>
      <button class="gbtn" id="sfpMapB">十五门全图</button>
      <button class="gbtn wide" id="sfpBack">关闭</button></div></div>`);
  const rs = p.querySelector('#sfpResume');
  // 共修在座＝一律回服务器棋况（netRejoin），不落到本机旧存局、更不本地强开新局与服务器两本账
  if (rs) rs.addEventListener('click', () => { if (netRejoin()) { closeOverlay(); return; } startSfp(true); });
  (p.querySelector('#sfpNew')               ).addEventListener('click', () => {
    // 共修局中（二人以上）仍是「带您回局中」——本局是全房的，不由一人重开；一人在房则走 newRound 就地重开
    if (Net.active && Net.isPlaying() && !Net.isAlone() && netRejoin()) {
      closeOverlay(); showToast(zh('共修局进行中——已带您回局中；下一局待全房结算后共同开'), 3600); return;
    }
    closeOverlay();
    newRound({ confirm: false });   // 卡上并列「续掷上局／新开一局」，点的即是明确选择
  });
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
      } else beadNoteTimer = window.setTimeout(() => { if (pid === '凡聖同居土') openDoor(14, { focus: 'pos' }); else openSfpNote(pid); }, 270); // 四土＝门14位次一览段
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
    if (nid === 'rupa' && !inSky) { rupaTap(isDbl); return; } // 色界总星专拍：缓开卡留双击直入窗口
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
        // 点行迹线＝重看这一掷，与判词卡「详读 ›」同归位卡本掷态（2026-08-12 详读卡撤后改道）
        if (dtr < 20) {
          playSfx('sfx-tap', 0.25);
          openSfpNote(vdAskCtx.to || sfpS.pos);
          return;
        }
      }
    }
    if (isDbl) zoomOutDbl();
  }
});

const hovEl = el('<div id="hovTag" class="ui"></div>');
app.appendChild(hovEl);
let hovLast = 0;
const isFinePtr = matchMedia('(pointer:fine)').matches;
// v362 位珠可辨识：全谱只标「哪颗珠是哪一位」，绝不标坐标数值（坐标是实现细节，非谱相）。
// 触屏首局引导 toast 已撤（2026-08-15 三刀）：珠有亮态可点，画面自明；桌面掠过仍浮名签（下方 hovTag）。
// 悬停名签驻留 120ms（2026-08-14 档一②）：扫视一圈不再一路频闪，指针停驻方出名签；
// 已示者同珠微移只随行不重弹。拾取皆屏空间（beadScreenPick），一移一拾不入回流。
let hovShownNm = '', hovT = 0;
function hovPickAt(px        , py        ) {
  let nm = '', sub = '', col = '';
  const pidH = beadScreenPick(px, py, 22);
  if (pidH && SFP_BY[pidH]) { // v362 位珠名签补门属：全图观照时「哪一位·属哪门」一眼即得（坐标数值不呈——非谱相）
    const pp = SFP_BY[pidH]; nm = pp.name;
    const an = byId[pp.anchor];
    sub = `第${SFP_CN[pp.door - 1]}门${an ? ' · ' + an.d.name : ''}${pp.id === sfpS.pos ? ' · 现居' : ''}`; // v363 掠过即知在何天何洲（地理处所），非坐标数值
    col = '#' + (SFP_DOOR_COLOR[pp.door] ?? 0xd7aa45).toString(16).padStart(6, '0');
  } else { const dh = doorScreenPick(px, py, 22); if (dh && SFP_DOOR_BY[dh.door]) nm = `第${SFP_CN[dh.door - 1]}门 · ${SFP_DOOR_BY[dh.door].title}`; }
  return { nm, sub, col };
}
function hovPlace(px        , py        , rect                 ) {
  hovEl.style.left = Math.min(px + 14, rect.width - 130) + 'px';
  hovEl.style.top = (py + 16) + 'px';
}
function hovShowAt(px        , py        , rect                 ) {
  const { nm, sub, col } = hovPickAt(px, py);
  if (!nm) { hovEl.style.display = 'none'; hovShownNm = ''; return; }
  hovShownNm = nm;
  hovEl.innerHTML = zh(`${esc(nm)}${sub ? `<i style="font-style:normal;opacity:.72;font-size:var(--fs-xs);margin-left:6px;color:${col}">${esc(sub)}</i>` : ''}`);
  hovEl.style.display = 'block';
  hovPlace(px, py, rect);
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!isFinePtr || e.pointerType === 'touch') return;
  if (e.buttons) { hovEl.style.display = 'none'; hovShownNm = ''; return; }
  const nowH = performance.now(); if (nowH - hovLast < 90) return; hovLast = nowH;
  if (sfpTransit || overlayEl || sfpS.rolling || starView) { hovEl.style.display = 'none'; hovShownNm = ''; return; }
  const rect = hovRect || (hovRect = renderer.domElement.getBoundingClientRect()); // v392 画布矩形缓存（resize 失效）：悬停不再逐次强制回流
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const cur = hovPickAt(px, py);
  if (cur.nm && cur.nm === hovShownNm) { hovPlace(px, py, rect); return; }  // 同珠随行，不闪
  hovEl.style.display = 'none'; hovShownNm = '';
  if (hovT) { clearTimeout(hovT); hovT = 0; }
  if (cur.nm) hovT = window.setTimeout(() => { hovT = 0; hovShowAt(px, py, rect); }, 120);
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
  if (e.key === 'Enter' && !overlayEl && verdictEl.classList.contains('show') && verdictFn) { e.preventDefault(); commitVerdict(); return; } // 回车＝判词「行」；浮层开着时不隐提交（与 Space/方向键同守卫）
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
    else if (verdictEl.classList.contains('show') && !verdictEl.classList.contains('min')) verdictEl.classList.add('min'); // Esc＝判词收签（与下滑同义，判词不自动关；Enter 落子仍在）
    else if (inBodhi && bodhiGrp >= 0) setBodhiGrp(bodhiGrp); // 先收展开的科组（v160 交互巡检）
    else if (inSky && skySel > 0) setSkySel(skySel); // 色界同法（v166）：先收选层再退场
    else if (inPure || inSky || inBodhi || inDisc) returnSaha();
    else if (inDoor) exitDoor(true); // v169 门观也入剥洋葱链（因地门单击直入后 Esc 退全图）
  }
});

// v266 三点档位指示已撤（2026-08-14 档二④，发起人定案）：视距本由捏合/滚轮手势直接表达，
// 与右侧天梯并立的第二套「导航感」装置徒占左下一角——画面还给画。
// ---------------- 标签投影 ----------------
const tmpV = new THREE.Vector3();
const tmpCam = new THREE.Vector3();
let labelTick = 0, labelCamStamp = NaN;          // v392 标签静观降频戳
let railRects                                                  = null; // v392 导航栏避让矩形缓存（resize 失效）
let hovRect                  = null;             // v392 悬停用画布矩形缓存
function updateLabels() {
  // v392 静观降频：相机/取景/形态/剖面未动时，标签的投影·排序·避让隔拍再算（每 12 帧兜底一算接住纯状态变化）——
  // 这是静止画面里每帧 CPU 的最大一块，白算即白热
  labelTick++;
  const camStamp = camera.position.x + camera.position.y * 7 + camera.position.z * 13
    + controls.target.x + controls.target.y * 7 + controls.target.z * 13 + camera.fov + modeT * 997 + sectionH * 3;
  if (camStamp === labelCamStamp && labelTick % 12 !== 0) return;
  labelCamStamp = camStamp;
  const w = app.clientWidth, h = app.clientHeight;
  const camDist = camera.position.distanceTo(controls.target);
  // 矩形避让：已占屏幕区域记入 rects，后来者重叠则隐（选中位与 tier1 优先）
  const rects                                          = [];
  // 保留导航区占位（2026-07-29 标签避让补盲）：右天梯/左档位簇/左探底杆在场时其矩形先入避让集，
  // 标签不再挤入竖沟、不再压「因/佛」顶底签；v392 半秒一取——取实时 DOM 矩形是强制回流，导航栏又不逐帧挪窝
  if (!railRects || labelTick % 32 === 0) {
    railRects = [];
    for (const rail of [ladder, secWrap]) {
      if (!rail) continue;
      const rr = rail.getBoundingClientRect();
      if (rr.width < 1 || rr.height < 1) continue;
      const padV = rail === ladder ? 22 : 0; // 天梯顶底签（#ladTop/#ladBot 各越界 20px）并入矩形高度
      railRects.push([rr.left, rr.top - padV, rr.width, rr.height + padV * 2]);
    }
  }
  for (const rr of railRects) rects.push(rr);
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
    nv.label.style.translate = `${Math.round(x)}px ${Math.round(y)}px`; // v219 取整消亚像素抖动；v392 改 translate（合成器路径）——left/top 逐帧改布局，是标签层回流抖动之源
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
    // 辅标近景才现（2026-08-14 档一①：380→240）：善见城/金刚座等十一枚小字，中远景只是碎点噪音
    let vis = !inPure && !inDoor && !browseDoor && !inSky && !inBodhi && !inDisc && modeTarget === 0 && modeT <= 0.5 && camDist <= 240
      && (!av.fam || auxFamOK[av.fam]) // 同族同进退接线（原 auxFamOK 算完从未使用）：远于族门整族隐，免「七山只剩一山有名」
      && passFilter(nv.d); // 签栏开门/色界场/菩萨道场/因地星盘中辅标同隐（v143/v314）
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
    // 辅让主全局化（原只查自家节点 mainRect，跨节点如「增长天王」压「七金山与七香水海」漏防）：
    // 全部节点标签矩形与保留导航区都在 rects 里，一并避让——T4 永远让位于节点标
    if (rects.some(r => x0 < r[0] + r[2] + 4 && x0 + lw + 4 > r[0] && y0 < r[1] + r[3] + 3 && y0 + lh + 3 > r[1])) {
      av.label.style.display = 'none'; return;
    }
    if (x0 < 2 || x0 + lw > w - 2 || y0 < 2 || y > h - 4) { av.label.style.display = 'none'; return; }
    if (rectsAux.some(r => x0 < r[0] + r[2] + 4 && x0 + lw + 4 > r[0] && y0 < r[1] + r[3] + 3 && y0 + lh + 3 > r[1])) {
      av.label.style.display = 'none'; return;
    }
    rectsAux.push([x0, y0, lw, lh]);
    av.label.style.display = '';
    av.label.style.opacity = focusHazeOn && distA > camDist * 1.9 ? '0.22' : '';
    av.label.style.translate = `${x}px ${y}px`; // v392 合成器定位
  });
}
// updateCompass 已随罗盘一并清除（见顶部注）

// ---------------- 主循环 ----------------
// ② 缓起—巡航—缓落：五次 smootherstep，两端更缓、中段近匀速，落位前自带悬停半拍
const ease = (t        ) => t * t * t * (t * (6 * t - 15) + 10);
let last = performance.now();
let elapsed = 0;
let lastDraw = 0;
let ovRef                     = null, ovPz = false; // v392 遮景层是否大厅面板（每层查一次）
let shadowPrev = '';              // v392 阴影重烘键：山体形态/各场显隐一变才重画深度图
let morphKApplied = -1;           // v392 空间⇄心性稳态跳写
function frame(now        ) {
  requestAnimationFrame(frame);
  // 全屏页遮景休帧（2026-07-30 发热治理追加）：大厅/动态/我的/茶寮把星图整页盖住时，
  // 画布降到约 4fps 空转——盖着仍整帧渲染是发热一大来源；转场/飞行在途时放行，关页即恢复
  if (overlayEl !== ovRef) { ovRef = overlayEl; ovPz = !!(overlayEl && overlayEl.querySelector('.pzPanel')); } // v392 每层只查一次 DOM，不再逐帧 querySelector
  if (overlayEl && ovPz && !sfpTransit && !flyAnim && now - lastDraw < 240) return;
  // v221 功耗治理（手机发热）：静观期 30fps；飞行/转场/掷轮/触控等动势期放行全帧率。
  // v392 扩至全端：桌面静止画面同样半帧——星摇/呼吸 30fps 无感，笔记本风扇与电池立静
  {
    const busy = flyAnim || sfpTransit || comet || hitStopT > 0 || sfpS.rolling || starView
      || (flightOn && (flyKeys.size > 0 || joyVec.x !== 0 || joyVec.y !== 0)) // 神足默认常开：只在真有输入时才算动势
      || secAnimTo !== null || Math.abs(modeTarget - modeT) > 0.0005 || now < perfBoostUntil || netBusy();
    if (!busy) {
      const deep = isCoarse && now > perfBoostUntil + 8000; // v392 深静观：触屏静置九秒后 15fps 入定——静观重绘正是发热大头，一碰即满帧
      if (now - lastDraw < (deep ? 66 : 31)) return;
    }
  }
  lastDraw = now;
  let dt = Math.min((now - last) / 1000, 0.05); last = now;
  // v393 自适应降分辨率已整体撤除（发起人定案）：画质是这个作品的本体，不拿它换帧——
  // 从前撑不住 30fps 便自降 DPR（最低 0.7 档），画面一糊人却不知何故。发热改由不损画质的几路担：
  // 静观限帧、阴影冻结、标签降频、泛光半分辨率、遮景休帧。DPR 从此恒为本档（桌面 2 / 触屏 1.6）。
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
  if (k !== morphKApplied) { // v392 稳态跳写：形态未在渐变时不再逐星重写同值坐标
    morphKApplied = k;
    nodeViews.forEach(nv => {
      if (nv.mandalaPos && !nv.d.pure) {
        nv.marker.position.lerpVectors(nv.spacePos, nv.mandalaPos, k);
        const m = (REALMS       )[nv.realmIdx].mind;
        const s = 1 + k * (0.25 + m.altru * 0.75);
        nv.marker.scale.setScalar(s);
      }
    });
  }

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
  {
    const actD = inDoor || browseDoor; // 一位即一星：开门时充位的节点星轻呼吸，代位珠亮相
    nodeViews.forEach(nv => {
      nv.marker.children.forEach(ch => { if (ch.userData.billboard) ch.quaternion.copy(camera.quaternion); });
      const s = nv.d.id === selectedId ? 1 + Math.sin(elapsed * 5) * 0.18
        : (actD && NODE_POS_ANCH[actD] && NODE_POS_ANCH[actD].has(nv.d.id)) ? 1 + Math.sin(elapsed * 2.4) * 0.12 : 1;
      const c0 = nv.marker.children[0];
      if (c0.scale.x !== s) c0.scale.setScalar(s); // v392 稳态跳写：无选中无门观时不逐帧重写 scale(1)
    });
  }
  sageOrbit.rotation.y += dt * 0.03;
  if (secAnimTo !== null) { // 幽冥窗缓降/缓合
    const nh = THREE.MathUtils.lerp(sectionH, secAnimTo, Math.min(1, dt * 3.2));
    if (Math.abs(nh - secAnimTo) < 0.4) { setSection(secAnimTo); secAnimTo = null; }
    else setSection(nh);
  } else if (secAuto && controls.target.y > 18) { secAnimTo = secPrev; secAuto = false; } // 回望地上即复原
  updateChanMandala(dt);
  sfpGlowUpdate(elapsed);
  doorStarsUpdate(elapsed); // v392：旧日此调用重复了两次，白算一遍门星自旋——删其一
  locGlowUpdate(elapsed);  cometUpdate(dt);
  pawnUpdate(elapsed, dt);
  waterUpdate(elapsed, dt);
  impactUpdate(dt);
  // 就地观照后真人同修珠全图常见（同一坐标系，无门内隐珠之分）
  netFrame(dt); // 联机同修珠：滑行与名牌投影

  updateLabels();
  updateDoorLabels();
  doorLabelCullFn();
  syncBackBtn();

  { // v392 阴影按需重烘：山体缩放（空间⇄心性）、专场显隐、剖面切换一变即重画一帧深度图
    const sk = `${saha.visible}|${netherScene.visible}|${inPure}|${inNether}|${modeT > 0.995 ? 1 : modeT.toFixed(3)}`;
    if (sk !== shadowPrev) { shadowPrev = sk; renderer.shadowMap.needsUpdate = true; }
  }
  if (composer && !save.settings.lowPerf) composer.render();
  else renderer.render(scene, camera);
}

// 尺寸
function onResize() {
  hovRect = null; railRects = null; // v392 各矩形缓存随尺寸失效
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

// 首次手势 → 音频唤醒（v392：解码已提前，此处只 resume；有的浏览器首次未生效则多试几拍，醒了即撤）
window.addEventListener('pointerdown', function audioWake() {
  initAudio();
  if (actx && actx.state === 'running') window.removeEventListener('pointerdown', audioWake);
});

// ---------------- 启动 ----------------
(async () => {
  try { await (window       ).gp?.player?.ready; } catch (e) {}
  loadSave();
  if (save.zh === 't') { zhDom(document.body); sfpStatus(); updateModeChip(); refreshPureNames(); }
  applyDpr();
  // v392 着色器预热：并行编译（KHR_parallel_shader_compile）把首帧数秒的同步编译摊到题屏亮着的后台
  try { void renderer.compileAsync(scene, camera); } catch (e) {}
  // v392 音频提前解码：load 后空闲期即建 ctx＋解码（非手势也合法，只是 suspended）；首手势只需唤醒
  setTimeout(() => { void preloadAudio(); }, 400);
  // v393 在场心跳：页面开着（且在前台）每三分钟报一记 n=0 tick——「在线人数」由此立得住；
  // 切后台不跳（挂后台的标签页不算「在站」），回前台立即补一跳
  const presenceBeat = () => { if (!document.hidden) void Plaza.pushName(); };
  setTimeout(presenceBeat, 12000);
  setInterval(presenceBeat, 180000);
  // 回前台：补一记心跳，题屏亮着则顺手把在场句刷新（后台期间它不拉数）
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { presenceBeat(); titlePresencePaint?.(); } });
  if (ART_MURAL) {
    // v392 壁画光·颜料化：写实法线整体减弱成晕染（山石/殿宇/水皆是）——共享材质只乘一次
    const seenM = new Set       ();
    scene.traverse(o => {
      const m = (o       ).material;
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
        if (mm.normalScale && !seenM.has(mm)) { seenM.add(mm); mm.normalScale.multiplyScalar(0.65); }
      }
    });
    if (!isCoarse) {
      // 绢纹：静态一层中性噪点作底纹（overlay 混合 5%），画即有绢——移动端为省热不叠
      const gc = document.createElement('canvas'); gc.width = gc.height = 256;
      const gcx = gc.getContext('2d')  ;
      const gim = gcx.createImageData(256, 256);
      for (let i = 0; i < gim.data.length; i += 4) {
        const v = 118 + ((Math.random() * 20) | 0);
        gim.data[i] = gim.data[i + 1] = gim.data[i + 2] = v; gim.data[i + 3] = 255;
      }
      gcx.putImageData(gim, 0, 0);
      const grain = document.createElement('div');
      grain.id = 'silkGrain';
      grain.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:1;opacity:.05;mix-blend-mode:overlay;background:url(${gc.toDataURL()}) repeat`;
      app.appendChild(grain);
    }
  }
  applyCardTheme();
  document.documentElement.classList.toggle('bigfont', !!save.settings.bigFont);
  if (ambientNodes) (ambientNodes       ).gain.gain.value = save.settings.ambient ? 0.035 : 0;
  updateLabelBadges();
  (window       ).__dbg = { camera, controls, renderer, get inPure() { return inPure; }, get modeT() { return modeT; }, get perf() { return { isCoarse, dprScale, pr: renderer.getPixelRatio() }; } };
  // 首帧着色器编译很重（软渲染环境可达数秒），推迟到 load 之后启动以免阻塞页面 load 事件
  // 题屏接活（2026-08-11 四改：#boot 即唯一门面，已无「开机屏」这一幕可点亮）：首帧真渲完才动——
  // frame 首次返回时着色器已编译、山景已在画布上。常态即 openTitle 原地接活（画面一动不动，
  // 只是钮文案校准、细字行亮起、✕ 与在场句浮现——就绪是无声的）；
  // 邀请链接等场景已有浮层/面板在场，则 boot 让位淡出（不移除，回题屏再点亮）。
  const bootActivate = () => {
    if (titleOn) return;
    // 导览深链（#v=节点 id）：分享出去的「单站链接」，点开即落此站——题屏不点亮，直入其境。
    // 巡游站开导览条（自动巡游不开，来客自己定步子）；非巡游站径开节点卡。
    // 邀请链接（#r=）已在联机段先行消化；有浮层/在局/在座者不夺——链接让给人的现场。
    if (deepVisit && byId[deepVisit] && !overlayEl && !sfpS.active && !Net.isPanelOpen()) {
      const vid = deepVisit; deepVisit = '';
      history.replaceState(history.state, '', location.pathname); // 链接用毕即清，免刷新重入
      titleHide();
      if (TOUR_STOPS.includes(vid)) tourStart(vid, { auto: false });
      else selectNode(vid);
      return;
    }
    deepVisit = '';
    if (!overlayEl && !sfpS.active && !Net.isPanelOpen()) {
      openTitle();
      // 兑现就绪前记下的心愿（内联脚本 __wantStart：true＝行谱主钮、'tour'＝导览钮）——
      // 各自复用本钮 onclick 的现成逻辑：有存局续掷、在座回局、无局新开／起导览，与亲手点无异
      if ((window       ).__wantStart) {
        const w = (window       ).__wantStart;
        (window       ).__wantStart = false;
        (document.getElementById('boot')?.querySelector(w === 'tour' ? '#bootTour' : '#bootGo')               )?.click();
      }
    } else titleHide();
  };
  const startLoop = () => requestAnimationFrame((t) => {
    frame(t); bootActivate();
    // 深库闲时预取（2026-08-14 切库）：首帧站稳即取正本＋承注两块——常人首掷之前块已在手，
    // 竞速门形同虚设；取失败无妨（掷时门内自有 API 籽与降级两路）
    window.setTimeout(() => { sfpDeepReady().then(() => { (window       ).__sfpDeep = true; }).catch(() => {}); }, 900);
  });
  if (document.readyState === 'complete') startLoop();
  else window.addEventListener('load', () => setTimeout(startLoop, 50), { once: true });
  (window       ).__gpReady = true;
  // ---------------- 联机接线 ----------------
  Net.init({ toast: showToast, zh, confirm: confirmLeaveMatch, armBack: armBackGuard });
  let netHydrateMode = '';
  let netTurnWake = 0;
  const hydrateNetGame = (force = false) => {
    const me = Net.me();
    if (!me || (!Net.isPlaying() && !(Net.isFinished() && me.done))) return false;
    const serverPos = me.pos && SFP_BY[me.pos] ? me.pos : null;
    const serverN = Number(me.n) || 0;
    if (!force && sfpS.active && sfpS.pos === serverPos && sfpS.n === serverN) return true;
    if (!sfpS.active) startSfp(false);
    else {
      cancelVerdict();
      cometCancel();
      cancelFly();
      if (sfpTimer) clearTimeout(sfpTimer);
      wheelAnim = null;
      sfpPalmAbort(); // 强制水合若正长按：掷轮钮不再滞留「按住」态与满格进度环
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
    return true;
  };
  // 挂实「共修回局」：底坞主钮与题屏主钮据此回到服务器棋况，不落到本机旧存局
  netRejoin = () => (Net.isPlaying() ? hydrateNetGame(true) : false); // 已结算的房只该走「准备下一局」，不再复活旧局
  const scheduleNetTurnUi = () => {
    clearTimeout(netTurnWake);
    const wait = Number(Net.room.availableAt || 0) - Date.now();
    if (wait > 0) netTurnWake = window.setTimeout(() => syncRollGlow(), wait + 40);
    syncRollGlow();
  };
  Net.onJoined = ({ reconnecting = false } = {}) => {
    netHydrateMode = reconnecting ? 'drift' : 'force';
    // 首次入座自动开全屏玩法卡已撤（2026-08-16 发起人点单「首次进房不要被全屏说明遮住」）：
    // 旧法趁「准备室还没有任何计时」把速览塞给人看，出发点是不打断局中——代价却是打断入房，
    // 而那一刻正是最该看清房间的时候（谁在、我该按哪一枚）。今降为指引行末一枚「玩法速览 ›」
    // 文字链（见 net.js #netGuideHelp）：入口显眼、零打断，要读自己点。
    // save.sfpHelp 那面旗不再在此处落——题屏「开始行谱」仍会为首次单人行谱者开卡，那是合宜的时机。
  };
  // 房内「玩法速览」：卡是全屏层，看毕回等候面板（面板与全屏层不并存，故先收后开）
  Net.onHelp = () => {
    Net.closePanel();
    openSfpHelp();
    overlayOnClose = () => { if (Net.active) Net.openPanel(); };
  };
  let rosterRoom = '';
  let wasHost = false;
  Net.onRoster = () => {
    netSyncBeads();
    updateLadder(); // v392 天梯座色刻随名册即时更新
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
  // 「轮到您」声振提醒（2026-08-11 批）：多人轮流制里这是核心感知，从前只有钮发光——
  // 切去微信再回来，早被 turn_skipped 跳过两手转「暂离」。轮次落到本座那一拍：一记磬＋
  // 短振动；页面在后台则给标签页改题（PC 切走可见），回页时若仍轮到本座再补一记
  // （后台标签的磬常被浏览器压住，回来那记才是听得见的）。
  // v392 局中持屏（Wake Lock）：轮流制一手可等一分钟，手机息屏即断线、两手后被记「暂离」——
  // 行局期间不让屏睡；局终/离席/切后台即放（不支持的浏览器静默跳过）
  let wakeLock                    = null, wakeBusy = false;
  const wakeSync = () => {
    const want = Net.active && Net.isPlaying() && !document.hidden;
    if (want && !wakeLock && !wakeBusy && (navigator       ).wakeLock) {
      wakeBusy = true;
      (navigator       ).wakeLock.request('screen')
        .then((wl       ) => { wakeLock = wl; wl.addEventListener('release', () => { wakeLock = null; }); })
        .catch(() => {})
        .finally(() => { wakeBusy = false; });
    } else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  };
  // v392 「轮到您」favicon 徽标：多标签页只看图标时也有感——金点亮起，回页或轮走即复原
  let favEl                          = null, favOn = false;
  const favSync = (on         ) => {
    if (on === favOn) return; favOn = on;
    if (!favEl) {
      favEl = document.querySelector('link[rel="icon"]');
      if (!favEl) { favEl = document.createElement('link'); favEl.rel = 'icon'; document.head.appendChild(favEl); }
      favEl.dataset.base = favEl.href || '';
    }
    if (on) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32;
      const g = cv.getContext('2d')  ;
      g.fillStyle = '#171426'; g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8c766'; g.beginPath(); g.arc(16, 16, 9, 0, Math.PI * 2); g.fill();
      favEl.href = cv.toDataURL('image/png');
    } else if (favEl.dataset.base) favEl.href = favEl.dataset.base;
  };
  let turnWasMine = false;
  const baseTitle = document.title;
  const turnAlertSync = () => {
    const me = Net.me();
    const mine = Net.active && Net.isPlaying() && Net.room.turnId === Net.myId
      && !!me && !me.done && !me.away && !me.spectator;
    if (mine && !turnWasMine) {
      playBell(587, 0.05);
      vib([40, 60, 40]);
      if (document.hidden) document.title = `${zh('【轮到您】')}${baseTitle}`;
    }
    if (!mine && document.title !== baseTitle) document.title = baseTitle;
    favSync(mine && document.hidden); // v392 图标徽标与标题改题同进退
    turnWasMine = mine;
  };
  document.addEventListener('visibilitychange', () => {
    wakeSync(); // v392 切后台释放持屏，回前台若仍在局中续持
    if (document.visibilityState !== 'visible') return;
    document.title = baseTitle;
    favSync(false);
    if (turnWasMine && Net.active && Net.myTurn() && !sfpS.rolling) { playBell(587, 0.05); vib(40); }
  });
  Net.onState = () => {
    conPillCalm();            // 控制台呼吸纪律：轮到您才喘（同修气象随批）
    netGiftBeam(Net.room);    // ⑤ 贈掷光缯：施与既定即画线
    netMirrorBonus();
    netClockSync();
    netVerdictClock();
    scheduleNetTurnUi();
    turnAlertSync();
    wakeSync(); // v392 房态每拍校持屏：开局即持、局终即放
    if (Net.isFinished() && Net.me()?.done && sfpS.active) sfpVictory(true);
  };
  Net.onMatchStarted = () => {
    // 等候室入厅后开局时大厅常在场：先解除手关回调再关厅，
    // 免 closeOverlay 触发 handClose 把题屏顶在开局转场上（共修转场卡死史之鉴）
    plazaNavAway();
    closeOverlay();
    Net.closePanel();
    startSfp(false);
    sfpMatchBegin();   // 金横幅＋磬代 toast（2026-08-12 批）：开局的话由仪式说，不再两处各说一遍
    netClockSync();
    scheduleNetTurnUi();
    wakeSync(); // v392 开局持屏
  };
  Net.onNotice = (text) => netPeerNotice(text);   // 行棋公事播报归状态行（聊天室只留人语与人事）
  // ④ 随喜之光：谁按了随喜，全房在被贺者珠上绽金三环（话在聊天室，光在星图）；
  // 致意目标 45s 有效，过期则光落在致意者自己珠上（迟到的随喜也有着落）
  Net.onCheer = (who, pid) => { void who; const t = Date.now() < cheerTarget.until && cheerTarget.id ? cheerTarget.id : pid; if (t) cheerBloom(t); };
  // 等候期来人/离席一记轻磬（2026-08-11 批）：toast 与系统行由 Net 自报，这里只补声——
  // 来人高一度、离席低一度，不看屏也分得出进出。
  Net.onSeat = ({ kind }) => { playBell(kind === 'join' ? 524 : 392, 0.045); };
  Net.onToss = (message) => {
    netSyncBeads();
    if (message.playerId !== Net.myId) {
      // 批C R1：远端掷轮上状态行播报＋脉签闪记（数据链路本就全量广播，缺的只是呈现）
      const last = message.steps?.[message.steps.length - 1];
      netPeerMsg(message.name || '同修', message.combo || '', last?.text || '');
      netDotFlash(message.playerId);
      netBeadPath(message.playerId, message.steps || [], message.combo || ''); // v392 星图本体同步重演这一掷（逐位经停）
      { // ④ 喜时刻：末段升进/横超或及第 → 浮随喜钮（六秒自敛），并记为致意目标供全房绽放定位
        const st = message.steps || []; const ls = st[st.length - 1];
        const d2 = ls && (ls       ).from && (ls       ).to && SFP_BY[(ls       ).from] && SFP_BY[(ls       ).to]
          ? sfpDirOfRule((ls       ).from, (ls       ).to, message.combo || '', SFP_POS_ORDER) : '';
        if (message.player?.done || d2 === 'up' || d2 === 'pure') cheerOffer(message.playerId);
      }
      if (message.player?.done) sfpPeerWin(message.name, message.player.n);
      return;
    }
    if (!sfpS.active) {
      // 曾退到自由观照又轮到本座：新开的空局会把本掷当作首掷「發始因地」，人被打回门一重新起行。
      // 故先按服务器给的本掷起手位（steps[0].from＝掷前所居）回局，再照常演这一掷。
      startSfp(false);
      const from = message.steps?.[0]?.from;
      if (from && SFP_BY[from]) {
        sfpS.pos = from;
        sfpS.trail = [from];
        sfpS.seenD = [SFP_BY[from].door];
        rebuildFoot();
        sfpFlyAnchor(SFP_BY[from]);
      }
    }
    sfpS.rolling = true;
    sfpDice.classList.add('on');
    sfpQuiet(true);
    sfpAnimateCommittedToss(message.combo, Number(message.player?.n));
  };
  Net.onMatchFinished = (message) => {
    sfpS.rolling = false;
    sfpS.finished = !!Net.me()?.done;
    syncRollGlow();
    // 成佛者名录以服务器快照为准（含已离席者）；名单里找不到的名字不再凭空消失
    const winners = (Array.isArray(message.champions) && message.champions.length
      ? message.champions.map(c => c?.name)
      : (message.winners || []).map(id => Net.players.find(p => p.id === id)?.name))
      .filter(Boolean);
    sfpShowMsg(message.reason === 'not_enough_players'
      ? '室内无人续行，本局已中止'
      : (winners.length ? `${winners.join('、')}本局成佛——已共同结算` : '本局已共同结算'));
    // 末位成佛者此刻才走成佛面板；先成佛者早在成佛一刻已庆祝过（sfpVictoryHandled），
    // 与未成佛者、旁观者同看共同结算卡，两者不并出
    if (Net.me()?.done && sfpS.active && !sfpVictoryHandled) sfpVictory(true);
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
  Net.onLeft = () => {
    wakeSync(); // v392 离席放屏
    if (sfpS.active) endSfp('已离开真人共修室');
    plazaStop();                                  // 即使旧大厅定时器还挂着，也以这次显式离席为准
    openPlaza();
  };
  Net.onLocked = (locked, key) => {
    showToast(zh(locked ? `本室密码已设为 ${key}` : '本室密码已撤'), 3200);
    playSfx('sfx-done', 0.35);
  };
  // 邀请链接直达：#r=桌号 或 #r=桌号.密码 ——密码由链接带着，莲友点开即入座
  if (Net.invited) {
    const { code: iCode, key: iKey } = Net.invited;
    Net.invited = null;
    history.replaceState(history.state, '', location.pathname); // 链接已用毕，清掉免刷新重入（state 原样保留，勿抹返回键哨兵标记）
    plazaSit(iCode, '', false, iKey);
  } else {
    // 题屏接活已归首帧回调 bootActivate（2026-08-11 #boot 即题屏）：此处不再抢先——
    // 首帧未渲时接活只会让题屏提前具备「可离开」之相，一退即露还没画的黑画布
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
