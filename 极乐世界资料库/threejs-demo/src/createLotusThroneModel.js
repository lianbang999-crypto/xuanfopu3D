// createLotusThroneModel.js
// 莲花宝座 · 程序化 Three.js 工厂（form/material pass 手工精修版 · 第2轮）
// 由 object-to-threejs-procedural skill 工作流产出：
//   参考图 -> ObjectSculptSpec(blockout) -> 生成器脚手架 -> 本文件手工雕刻 -> 渲染评审 -> 精修。
// 参考: threejs-demo/reference/lotus-throne-ref.png（敦煌坐像下的宽扁双层莲台）
//
// 第2轮修正要点（对照参考图评审）：
//   1) 台座“宽而扁”：矮鼓身 + 大直径底盘，而非高瘦鼓形。
//   2) 莲瓣两圈“错位直立外张”，用四元数基向量精确摆位，避免融化成碗。
//   3) 瓣缘红边：主体石绿 + 背衬放大的土红片，露出一圈红边（而非红瓣尖）。
//
// 坐标系: y 向上，+z 朝前（看向相机），单位约等于 0.1m。
// 结构（宏观 -> 中观 -> 微观）:
//   root
//   ├─ baseLip        底沿薄圈（车削 lathe）
//   ├─ plinthDrum     宽扁鼓身（车削 lathe）
//   ├─ petalRowOuter  外圈莲瓣（直立外张，instanced）
//   ├─ petalRowInner  内圈莲瓣（错位半格、更直，instanced）
//   └─ seatDisc       坐面圆盘（人物 socket）
// 运行时映射写入 root.userData.sculptRuntime。

import * as THREE from 'three';

/* ---------- 调色板（自参考图取样：敦煌石绿 / 土红 / 米白 / 米黄） ---------- */
const PALETTE = {
  petalBody: 0x8fae95, // 石绿（莲瓣主体）
  petalEdge: 0xb0563f, // 土红（瓣缘背衬）
  drum:      0xcabf9f, // 米黄鼓身/底盘
};

/* ---------- 工具：确定性伪随机（微观不均匀，避免完美对称） ---------- */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s << 13)) >>> 0;
    return (s & 0xffffff) / 0xffffff;
  };
}

/* ---------- 一片莲瓣：宽卵形、尖头、微微内凹（瓢形） ---------- */
function makePetalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  // 右半：底部略窄 -> 中段饱满 -> 收尖
  shape.bezierCurveTo(0.50, 0.15, 0.62, 0.72, 0.0, 1.3);
  // 左半镜像
  shape.bezierCurveTo(-0.62, 0.72, -0.50, 0.15, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
    curveSegments: 26,
  });
  geo.center();
  geo.translate(0, 0.65, 0); // 根部落在 y≈0，长度沿 +y（0..1.3），宽度沿 x，正面法线沿 +z
  // 瓢形内凹：瓣缘向前微翘（concave），瓣尖向前轻卷
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = Math.max(0, Math.min(1, y / 1.3));
    const edgeCup = 0.13 * (Math.abs(x) / 0.62) * (0.4 + 0.6 * t); // 两侧向前抬
    const tipCurl = 0.10 * t * t;                                   // 瓣尖前卷
    pos.setZ(i, pos.getZ(i) + edgeCup + tipCurl);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ---------- 车削一个分层圆台（用于底沿/鼓身/坐面） ---------- */
function latheTier(profilePoints, segments = 72) {
  const pts = profilePoints.map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.02,
    side: opts.side ?? THREE.FrontSide,
    flatShading: false,
  });
}

/**
 * 创建莲花宝座模型。
 * @param {object} options
 * @param {boolean} [options.wireframe]
 * @returns {{ group: THREE.Group, runtime: object }}
 */
export function createLotusThroneModel(options = {}) {
  const root = new THREE.Group();
  root.name = 'LotusThrone';

  const nodes = {};
  const meshes = {};
  const sockets = {};

  const petalBodyMat = stdMat(PALETTE.petalBody, { roughness: 0.82, side: THREE.DoubleSide });
  const petalEdgeMat = stdMat(PALETTE.petalEdge, { roughness: 0.8, side: THREE.DoubleSide });
  const drumMat = stdMat(PALETTE.drum, { roughness: 0.88 });

  if (options.wireframe) {
    [petalBodyMat, petalEdgeMat, drumMat].forEach((m) => (m.wireframe = true));
  }

  /* --- 底沿 baseLip：宽扁外沿（车削） --- */
  const lipGeo = latheTier([
    [0.0, 0.0], [2.78, 0.0], [2.9, 0.14], [2.72, 0.26], [0.0, 0.26],
  ]);
  const baseLip = new THREE.Mesh(lipGeo, drumMat);
  baseLip.name = 'baseLip';
  root.add(baseLip);
  nodes.baseLip = baseLip;
  meshes.baseLip = baseLip;

  /* --- 鼓身 plinthDrum：矮而收腰上敛 --- */
  const drumGeo = latheTier([
    [0.0, 0.26], [2.5, 0.26], [2.32, 0.5], [2.05, 0.74], [1.7, 0.86], [0.0, 0.86],
  ]);
  const plinthDrum = new THREE.Mesh(drumGeo, drumMat);
  plinthDrum.name = 'plinthDrum';
  root.add(plinthDrum);
  nodes.plinthDrum = plinthDrum;
  meshes.plinthDrum = plinthDrum;

  /* --- 花瓣几何（共享） --- */
  const petalGeo = makePetalGeometry();

  // 复用向量，减少 GC
  const radialOut = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const upWorld = new THREE.Vector3(0, 1, 0);
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const xAxis = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  /**
   * 在一圈上直立外张地实例化花瓣。用四元数基向量精确定向：
   *   y=瓣长方向（由竖直向外张 lean 度），z=瓣正面法线（朝外上），x=切向。
   * @param {string} name
   * @param {object} p count/radius/baseY/leanDeg/scale/phase/seed
   */
  function petalRing(name, {
    count, radius, baseY, leanDeg, scale, phase = 0, seed = 1,
  }) {
    const ringGroup = new THREE.Group();
    ringGroup.name = name;
    const rnd = seeded(seed);
    const lean = THREE.MathUtils.degToRad(leanDeg); // 距竖直的外张角
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * Math.PI * 2;
      radialOut.set(Math.cos(a), 0, Math.sin(a));
      tangent.set(-Math.sin(a), 0, Math.cos(a));

      // 瓣长方向：竖直向外张 lean
      yAxis.copy(upWorld).multiplyScalar(Math.cos(lean))
        .addScaledVector(radialOut, Math.sin(lean)).normalize();
      // 正面法线：朝外，且与 yAxis 正交（投影去掉 y 分量）
      zAxis.copy(radialOut).addScaledVector(yAxis, -radialOut.dot(yAxis)).normalize();
      xAxis.copy(yAxis).cross(zAxis).normalize();
      basis.makeBasis(xAxis, yAxis, zAxis);

      const s = scale * (0.95 + rnd() * 0.1);
      const jitterA = (rnd() - 0.5) * 0.05;

      // 背衬红瓣（略大、后移），露出一圈土红瓣缘
      const back = new THREE.Mesh(petalGeo, petalEdgeMat);
      back.scale.set(s * 1.1, s * 1.06, s * 1.1);
      back.position.set(Math.cos(a) * radius, baseY, Math.sin(a) * radius)
        .addScaledVector(zAxis, -0.05);
      back.setRotationFromMatrix(basis);
      back.rotateY(jitterA);
      ringGroup.add(back);

      // 主体绿瓣
      const petal = new THREE.Mesh(petalGeo, petalBodyMat);
      petal.scale.set(s, s, s);
      petal.position.set(Math.cos(a) * radius, baseY, Math.sin(a) * radius);
      petal.setRotationFromMatrix(basis);
      petal.rotateY(jitterA);
      ringGroup.add(petal);
    }
    return ringGroup;
  }

  /* --- 外圈莲瓣 petalRowOuter（直立外张，成一圈冠） --- */
  const rowOuter = petalRing('petalRowOuter', {
    count: 22, radius: 2.02, baseY: 0.62, leanDeg: 34, scale: 1.0, seed: 7,
  });
  root.add(rowOuter);
  nodes.petalRowOuter = rowOuter;

  /* --- 内圈莲瓣 petalRowInner（错位半格、更直、略高） --- */
  const rowInner = petalRing('petalRowInner', {
    count: 22, radius: 1.74, baseY: 0.78, leanDeg: 24, scale: 0.9,
    phase: Math.PI / 22, seed: 21,
  });
  root.add(rowInner);
  nodes.petalRowInner = rowInner;

  /* --- 坐面 seatDisc（人物挂点 socket） --- */
  const seatGeo = latheTier([
    [0.0, 0.86], [1.55, 0.86], [1.62, 0.96], [1.42, 1.04], [0.0, 1.04],
  ]);
  const seatDisc = new THREE.Mesh(seatGeo, drumMat);
  seatDisc.name = 'seatDisc';
  root.add(seatDisc);
  nodes.seatDisc = seatDisc;
  meshes.seatDisc = seatDisc;

  const seatSocket = new THREE.Object3D();
  seatSocket.name = 'seat';
  seatSocket.position.set(0, 1.04, 0);
  root.add(seatSocket);
  sockets.seat = seatSocket;

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
      overall: { type: 'cylinder', radius: 2.9, height: 1.04 },
    },
    destructionGroups: {},
  };
  root.userData.sculptRuntime = runtime;

  return { group: root, runtime };
}
