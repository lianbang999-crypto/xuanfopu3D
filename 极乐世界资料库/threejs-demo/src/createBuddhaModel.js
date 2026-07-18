// createBuddhaModel.js
// 结跏趺坐持莲佛 · 程序化 Three.js 工厂（stylized / 正面对称雕刻）
// 由 object-to-threejs-procedural skill 工作流产出：
//   参考图 -> gate(pass) -> assessment(ultra-complex) -> ObjectSculptSpec -> 手工雕刻 -> 渲染评审。
// 参考: threejs-demo/reference/buddha-ref.png（正面、左右对称的结跏趺坐佛，双手于腹前捧莲，通肩袈裟，身后圆头光，坐宽扁双层莲台）
//
// 说明：人物为该 skill 明确标注的“困难对象”（有机体 + 单视角），
//   故这是一个“可辨识的风格化剪影”，非写实塑像。
//   相比第 1 版修正：图像主体应为“人物”，故莲台缩小、人物放大并嵌入莲心；
//   新增圆头光、腹前捧莲、通肩红袈裟。
//
// 坐标系: y 向上，+z 朝前（看向相机），单位约等于 0.1m。
// 结构（宏观 -> 中观 -> 微观）:
//   root
//   ├─ halo             身后圆头光（盘 + 双环 + 卷云点）
//   ├─ lotusBase        复用 createLotusThroneModel（缩小的宽扁双层莲台）
//   ├─ lap              盘腿团块（石绿下裙）+ 双膝
//   ├─ robeBell         通肩红袈裟（车削钟形）+ 米白衣缘
//   ├─ torso/neck/head  上身 + 颈 + 头（微俯）
//   ├─ armsL/R + hands  两臂垂于腹前，双手捧莲
//   ├─ lotusInHands      掌中莲花
//   ├─ hair/topknot     发帽 + 高髻 + 髻饰
//   └─ jewelry          项圈璎珞 + 耳珰 + 白毫
// 运行时映射写入 root.userData.sculptRuntime。

import * as THREE from 'three';
import { createLotusThroneModel } from './createLotusThroneModel.js';

/* ---------- 调色板（自参考图取样） ---------- */
const PALETTE = {
  skin:     0xe7d2b0, // 象牙肤
  robe:     0xb4694c, // 通肩袈裟（土红）
  robeLine: 0xe6ddc6, // 米白衣缘/内衬
  lower:    0x9fb6ad, // 石绿下裙
  hair:     0x2f2a2c, // 墨发
  jewelry:  0xa9663f, // 赤铜璎珞
  urna:     0xa83f36, // 白毫
  eye:      0x3a2f2b, // 眼线
  haloDisc: 0xe0d7bc, // 头光底盘
  haloRing: 0xb4694c, // 头光外缘
  haloSwirl:0x9fb6ad, // 头光卷云
  lotusPad: 0xe7dcc4, // 掌中莲
  lotusTip: 0xc98a6a, // 莲瓣尖
};

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0.03,
    side: opts.side ?? THREE.FrontSide,
    flatShading: false,
  });
}

function lathe(points, segments = 48) {
  const pts = points.map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

function tube(pointsArr, radius, seg = 24, rad = 10) {
  const curve = new THREE.CatmullRomCurve3(
    pointsArr.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  );
  return new THREE.TubeGeometry(curve, seg, radius, rad, false);
}

/**
 * 创建结跏趺坐持莲佛模型。
 * @param {object} options
 * @param {boolean} [options.wireframe]
 * @returns {{ group: THREE.Group, runtime: object }}
 */
export function createBuddhaModel(options = {}) {
  const root = new THREE.Group();
  root.name = 'SeatedBuddha';

  const nodes = {};
  const meshes = {};
  const sockets = {};

  const skinMat = stdMat(PALETTE.skin, { roughness: 0.6 });
  const robeMat = stdMat(PALETTE.robe, { roughness: 0.86, side: THREE.DoubleSide });
  const robeLineMat = stdMat(PALETTE.robeLine, { roughness: 0.85, side: THREE.DoubleSide });
  const lowerMat = stdMat(PALETTE.lower, { roughness: 0.85, side: THREE.DoubleSide });
  const hairMat = stdMat(PALETTE.hair, { roughness: 0.55 });
  const jewelryMat = stdMat(PALETTE.jewelry, { roughness: 0.4, metalness: 0.35 });
  const urnaMat = stdMat(PALETTE.urna, { roughness: 0.5 });
  const eyeMat = stdMat(PALETTE.eye, { roughness: 0.5 });
  const haloDiscMat = stdMat(PALETTE.haloDisc, { roughness: 0.92, side: THREE.DoubleSide });
  const haloRingMat = stdMat(PALETTE.haloRing, { roughness: 0.7 });
  const haloSwirlMat = stdMat(PALETTE.haloSwirl, { roughness: 0.8 });
  const lotusPadMat = stdMat(PALETTE.lotusPad, { roughness: 0.75, side: THREE.DoubleSide });
  const lotusTipMat = stdMat(PALETTE.lotusTip, { roughness: 0.7, side: THREE.DoubleSide });

  if (options.wireframe) {
    [skinMat, robeMat, robeLineMat, lowerMat, hairMat, jewelryMat, haloDiscMat].forEach(
      (m) => (m.wireframe = true),
    );
  }

  const add = (mesh, name, bag = meshes) => {
    mesh.name = name;
    root.add(mesh);
    nodes[name] = mesh;
    if (bag) bag[name] = mesh;
    return mesh;
  };

  /* ==================== 圆头光 halo（身后） ==================== */
  const haloGroup = new THREE.Group();
  haloGroup.name = 'halo';
  const haloDisc = new THREE.Mesh(new THREE.CircleGeometry(1.02, 64), haloDiscMat);
  haloGroup.add(haloDisc);
  const haloOuter = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.06, 12, 64), haloRingMat);
  haloGroup.add(haloOuter);
  const haloInner = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 12, 56), haloSwirlMat);
  haloGroup.add(haloInner);
  // 卷云点
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), haloSwirlMat);
    swirl.position.set(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.02);
    haloGroup.add(swirl);
  }
  haloGroup.position.set(0, 2.72, -0.42);
  root.add(haloGroup);
  nodes.halo = haloGroup;

  /* ==================== 莲座（复用，缩小并下沉） ==================== */
  const lotus = createLotusThroneModel({ wireframe: options.wireframe });
  lotus.group.name = 'lotusBase';
  lotus.group.scale.setScalar(0.62);
  lotus.group.position.y = 0;
  root.add(lotus.group);
  nodes.lotusBase = lotus.group;
  // 缩放后莲台坐面约 y≈0.64，外径≈1.8。人物盘腿嵌于莲心。

  /* ==================== 盘腿团块 lap（石绿下裙） ==================== */
  const lapGroup = new THREE.Group();
  lapGroup.name = 'lap';
  const lapCore = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), lowerMat);
  lapCore.scale.set(1.5, 0.52, 1.28);
  lapCore.position.set(0, 0.92, 0.1);
  lapGroup.add(lapCore);
  for (const sx of [-1, 1]) {
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), lowerMat);
    knee.scale.set(1.0, 0.72, 1.05);
    knee.position.set(sx * 0.92, 0.78, 0.42);
    lapGroup.add(knee);
  }
  // 交脚（裙下微露肤色）
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skinMat);
    foot.scale.set(1.1, 0.55, 1.3);
    foot.position.set(sx * 0.14, 0.82, 0.74);
    lapGroup.add(foot);
  }
  root.add(lapGroup);
  nodes.lap = lapGroup;

  // 下裙红缘（腰带）
  const waistBand = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 12, 40), robeMat);
  waistBand.rotation.x = Math.PI / 2;
  waistBand.position.set(0, 1.16, 0.18);
  add(waistBand, 'waistBand');

  /* ==================== 上身 torso（部分袒露） ==================== */
  const torso = new THREE.Mesh(lathe([
    [0.0, 1.15], [0.5, 1.2], [0.54, 1.5], [0.6, 1.85],
    [0.54, 2.08], [0.42, 2.2], [0.0, 2.24],
  ]), skinMat);
  torso.position.z = 0.04;
  add(torso, 'torso');

  /* ==================== 通肩红袈裟 robeBell（钟形，覆两肩与背） ==================== */
  const robeBell = new THREE.Mesh(lathe([
    [0.4, 2.18], [0.56, 2.05], [0.58, 1.72], [0.6, 1.4], [0.58, 1.2], [0.46, 1.12],
  ], 56), robeMat);
  robeBell.position.z = -0.05;
  add(robeBell, 'robeBell');
  // 前胸 V 形米白内衬（左肩斜披露出的里衣）
  const innerV = new THREE.Mesh(lathe([
    [0.0, 2.16], [0.34, 2.1], [0.4, 1.75], [0.36, 1.5], [0.0, 1.46],
  ], 40), robeLineMat);
  innerV.position.z = 0.16;
  innerV.scale.z = 1.05;
  add(innerV, 'innerV');
  // 袈裟下摆米白衣缘（垂在莲台上）
  const hem = new THREE.Mesh(lathe([
    [0.5, 1.16], [0.82, 1.12], [0.9, 0.98], [0.78, 0.82], [0.0, 0.8],
  ], 56), robeLineMat);
  add(hem, 'hem');

  /* ==================== 双臂 + 腹前捧莲 hands ==================== */
  const handsCenter = [0, 1.4, 0.86];
  // 上臂（红袖，贴身向两侧下垂）
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(tube([
      [side * 0.52, 2.02, 0.0],
      [side * 0.6, 1.72, 0.14],
      [side * 0.5, 1.48, 0.4],
      [side * 0.3, 1.4, 0.66],
    ], 0.14, 22, 12), robeMat);
    add(sleeve, side < 0 ? 'sleeveR' : 'sleeveL');
    // 前臂（肤色，聚拢到腹前）
    const forearm = new THREE.Mesh(tube([
      [side * 0.3, 1.4, 0.66],
      [side * 0.2, 1.36, 0.78],
      [handsCenter[0] + side * 0.12, handsCenter[1], handsCenter[2]],
    ], 0.11, 16, 10), skinMat);
    add(forearm, side < 0 ? 'forearmR' : 'forearmL');
  }
  // 双手合捧成钵（半球开口朝上）
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), skinMat);
  hands.scale.set(1.2, 0.6, 1.0);
  hands.position.set(handsCenter[0], handsCenter[1] - 0.02, handsCenter[2]);
  add(hands, 'hands');
  const handsSocket = new THREE.Object3D();
  handsSocket.name = 'hands';
  handsSocket.position.set(handsCenter[0], handsCenter[1], handsCenter[2]);
  root.add(handsSocket);
  sockets.hands = handsSocket;

  /* ==================== 掌中莲 lotusInHands ==================== */
  const lotusGroup = new THREE.Group();
  lotusGroup.name = 'lotusInHands';
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), lotusPadMat);
  bud.scale.set(1, 1.2, 1);
  lotusGroup.add(bud);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), lotusTipMat);
    petal.scale.set(0.5, 1.1, 0.3);
    petal.position.set(Math.cos(a) * 0.14, 0.02, Math.sin(a) * 0.14);
    petal.lookAt(Math.cos(a) * 0.6, 0.4, Math.sin(a) * 0.6);
    lotusGroup.add(petal);
  }
  lotusGroup.position.set(handsCenter[0], handsCenter[1] + 0.16, handsCenter[2]);
  lotusGroup.scale.setScalar(1.25);
  root.add(lotusGroup);
  nodes.lotusInHands = lotusGroup;

  /* ==================== 颈 / 头 head ==================== */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.28, 20), skinMat);
  neck.position.set(0, 2.32, 0.04);
  add(neck, 'neck');

  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  headGroup.position.set(0, 2.72, 0.06);
  headGroup.rotation.x = THREE.MathUtils.degToRad(10); // 微俯（低眉垂目）

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 24), skinMat);
  face.scale.set(0.9, 1.0, 0.95);
  headGroup.add(face);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.43, 28, 20), hairMat);
  hairCap.scale.set(0.98, 1.0, 0.98);
  hairCap.position.set(0, 0.06, -0.08);
  headGroup.add(hairCap);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), eyeMat);
    eye.scale.set(1.6, 0.32, 0.4);
    eye.position.set(sx * 0.14, 0.0, 0.36);
    headGroup.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skinMat);
    ear.scale.set(0.5, 1.15, 0.7);
    ear.position.set(sx * 0.38, -0.04, 0.0);
    headGroup.add(ear);
  }
  const urna = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), urnaMat);
  urna.position.set(0, 0.12, 0.38);
  headGroup.add(urna);
  root.add(headGroup);
  nodes.head = headGroup;
  const headSocket = new THREE.Object3D();
  headSocket.name = 'head';
  headSocket.position.copy(headGroup.position);
  root.add(headSocket);
  sockets.head = headSocket;

  /* ==================== 发髻 topknot + 髻饰 ==================== */
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), hairMat);
  bun.scale.set(0.95, 1.15, 0.95);
  bun.position.set(0, 3.18, -0.02);
  add(bun, 'topknot');
  const crownFlower = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 10, 20), jewelryMat);
  crownFlower.position.set(0, 3.06, 0.22);
  add(crownFlower, 'crownFlower');

  /* ==================== 璎珞 jewelry：项圈 + 坠 + 耳珰 ==================== */
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 12, 40), jewelryMat);
  collar.rotation.x = Math.PI / 2.3;
  collar.position.set(0, 2.2, 0.16);
  add(collar, 'collar');
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), jewelryMat);
  pendant.position.set(0, 1.98, 0.3);
  add(pendant, 'pendant');
  for (const side of [-1, 1]) {
    const earring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 18), jewelryMat);
    earring.position.set(side * 0.44, 2.62, 0.06);
    earring.rotation.y = Math.PI / 2;
    add(earring, side < 0 ? 'earringR' : 'earringL');
  }

  /* ==================== 阴影 + 运行时 ==================== */
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const runtime = {
    nodes,
    meshes,
    sockets,
    colliders: {
      overall: { type: 'cylinder', radius: 1.8, height: 3.4 },
    },
    destructionGroups: {},
  };
  root.userData.sculptRuntime = runtime;

  return { group: root, runtime };
}
