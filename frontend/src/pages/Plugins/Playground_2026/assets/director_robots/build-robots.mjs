/*
 * 生成导演台八个体型机器人 GLB（同一物种，只改比例）。
 * 在 frontend/ 下执行: node src/pages/Plugins/Playground_2026/assets/director_robots/build-robots.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (!globalThis.Blob) globalThis.Blob = Blob;
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer()).then(
        (buf) => {
          this.result = buf;
          this.onloadend?.({ target: this });
        },
        (err) => this.onerror?.(err),
      );
    }
  };
}

const OUT = dirname(fileURLToPath(import.meta.url));
const BODIES = ['male', 'female', 'athletic', 'slim', 'teen', 'child', 'wide', 'chibi'];
const CUSTOM_BODIES = new Set();

function maleShape() {
  return {
    headR: 0.145,
    headS: 1,
    neckR: 0.058,
    neckH: 0.1,
    shoulderX: 0.268,
    shoulderY: 1.34,
    chestY: 1.18,
    chest: [1.28, 1.22, 0.92],
    waistY: 0.99,
    waist: [0.68, 0.55, 0.64],
    pelvisY: 0.85,
    pelvis: [0.88, 0.64, 0.8],
    bust: 0,
    hipStance: 0.09,
    upperArmR: 0.052,
    upperArmL: 0.28,
    foreArmR: 0.045,
    foreArmL: 0.25,
    thighR: 0.06,
    thighL: 0.4,
    shinR: 0.05,
    shinL: 0.34,
    joint: 0.056,
    hipJoint: 0.058,
  };
}

function bodyShape(id) {
  const male = maleShape();
  if (id === 'female') {
    return {
      ...male,
      headR: 0.136,
      neckR: 0.038,
      neckH: 0.09,
      shoulderX: 0.188,
      chestY: 1.14,
      chest: [0.78, 0.96, 0.7],
      waistY: 1.0,
      waist: [0.5, 0.48, 0.54],
      pelvisY: 0.84,
      pelvis: [1.26, 0.84, 1.04],
      bust: 0.092,
      hipStance: 0.118,
      upperArmR: 0.04,
      foreArmR: 0.036,
      thighR: 0.054,
      shinR: 0.042,
      joint: 0.046,
      hipJoint: 0.05,
    };
  }
  if (id === 'athletic') {
    return {
      ...male,
      neckR: 0.062,
      shoulderX: 0.285,
      chest: [1.32, 1.28, 1.08],
      waist: [0.9, 0.7, 0.86],
      pelvis: [1.08, 0.8, 0.96],
      upperArmR: 0.064,
      foreArmR: 0.054,
      thighR: 0.074,
      shinR: 0.06,
      joint: 0.062,
      hipJoint: 0.068,
    };
  }
  if (id === 'slim') {
    return {
      ...male,
      neckR: 0.04,
      shoulderX: 0.2,
      chest: [0.8, 1.08, 0.7],
      waist: [0.56, 0.58, 0.6],
      pelvis: [0.78, 0.64, 0.7],
      upperArmR: 0.038,
      foreArmR: 0.034,
      thighR: 0.044,
      shinR: 0.038,
      joint: 0.046,
      hipJoint: 0.048,
    };
  }
  if (id === 'teen') {
    return { ...male, headS: 1.08, shoulderX: 0.21, chest: [0.9, 1.02, 0.8], waist: [0.7, 0.58, 0.66], pelvis: [0.9, 0.66, 0.8], upperArmL: 0.25, thighL: 0.36, shinL: 0.3 };
  }
  if (id === 'child') {
    return {
      ...male,
      headS: 1.28,
      headR: 0.155,
      neckR: 0.042,
      neckH: 0.07,
      shoulderX: 0.18,
      shoulderY: 1.22,
      chestY: 1.06,
      chest: [0.86, 0.92, 0.8],
      waistY: 0.94,
      waist: [0.7, 0.52, 0.66],
      pelvisY: 0.8,
      pelvis: [0.88, 0.62, 0.8],
      hipStance: 0.08,
      upperArmL: 0.22,
      foreArmL: 0.2,
      thighL: 0.3,
      shinL: 0.24,
    };
  }
  if (id === 'wide') {
    return { ...male, neckR: 0.06, shoulderX: 0.27, chest: [1.28, 1.05, 1.12], waist: [1.08, 0.72, 1.0], pelvis: [1.22, 0.82, 1.1], hipStance: 0.12, thighR: 0.068 };
  }
  if (id === 'chibi') {
    return {
      ...male,
      headS: 1.72,
      headR: 0.168,
      neckR: 0.038,
      neckH: 0.04,
      shoulderX: 0.155,
      shoulderY: 1.12,
      chestY: 0.98,
      chest: [0.92, 0.7, 0.86],
      waistY: 0.9,
      waist: [0.82, 0.5, 0.78],
      pelvisY: 0.78,
      pelvis: [0.95, 0.58, 0.88],
      hipStance: 0.08,
      upperArmL: 0.16,
      foreArmL: 0.14,
      thighL: 0.2,
      shinL: 0.15,
      joint: 0.05,
      hipJoint: 0.052,
    };
  }
  return male;
}

function shellMat() {
  return new THREE.MeshStandardMaterial({
    name: 'shell',
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.16,
  });
}

function jointMat() {
  return new THREE.MeshStandardMaterial({
    name: 'joint',
    color: 0xbbbbbb,
    roughness: 0.32,
    metalness: 0.28,
  });
}

function visorMat() {
  return new THREE.MeshStandardMaterial({
    name: 'visor',
    color: 0x05080c,
    roughness: 0.18,
    metalness: 0.72,
    emissive: 0x102838,
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide,
  });
}

function mesh(name, geo, mat, pos, rot, scale) {
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  return m;
}

function limb(name, radius, length, mat) {
  const h = Math.max(0.05, length);
  const cap = Math.min(radius, h * 0.35);
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.02, h - cap * 2), 8, 20);
  return mesh(name, geo, mat, [0, -h / 2, 0]);
}

function joint(name, radius, mat) {
  return mesh(name, new THREE.SphereGeometry(radius, 16, 14), mat);
}

function buildRobot(id) {
  const s = bodyShape(id);
  const female = id === 'female';
  const hipR = 0.125 * s.pelvis[0];
  const waistR = 0.092 * s.waist[0] * (female ? 0.88 : 1);
  const rib = 0.128 * s.chest[0] * (female ? 1.06 : 1);
  const pec = 0.138 * s.chest[0] * (id === 'athletic' ? 1.08 : 1);
  const shoulder = 0.118 * s.chest[0];
  const yHip = s.pelvisY;
  const pts = [
    [0.002, yHip - 0.03],
    [hipR * 0.7, yHip - 0.01],
    [hipR, yHip + 0.05],
    [waistR, s.waistY],
    [female ? rib : pec * 0.9, s.chestY - 0.12],
    [female ? rib * 1.04 : pec, s.chestY],
    [shoulder, s.shoulderY - 0.06],
    [s.neckR * 1.12, s.shoulderY],
    [s.neckR, s.shoulderY + s.neckH * 0.4],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const shell = shellMat();
  const jointM = jointMat();
  const visor = visorMat();
  const headY = s.shoulderY + s.neckH + 0.02;
  const visorW = 1.2;

  const hip = new THREE.Group();
  hip.name = 'Hip';
  const spine = new THREE.Group();
  spine.name = 'Spine';
  hip.add(spine);

  const torso = mesh('Torso', new THREE.LatheGeometry(pts, 32), shell);
  torso.scale.set(1, 1, 0.84);
  spine.add(torso);

  if (female) {
    spine.add(mesh('Bust', new THREE.SphereGeometry(0.09, 20, 16), shell, [0, s.chestY - 0.04, 0.055], null, [1.45, 0.62, 0.92]));
  }

  const collar = mesh('Collar', new THREE.TorusGeometry(s.neckR * 1.05, 0.011, 8, 20), shell, [0, s.shoulderY + s.neckH * 0.15, 0], [Math.PI / 2, 0, 0]);
  spine.add(collar);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, headY, 0);
  head.scale.set(s.headS, s.headS * 1.14, s.headS * 0.96);
  head.add(mesh('HeadMesh', new THREE.SphereGeometry(s.headR, 32, 24), shell, [0, s.headR * 0.06, 0]));
  head.add(
    mesh(
      'Visor',
      new THREE.CylinderGeometry(s.headR * 1.02, s.headR * 1.02, s.headR * 0.2, 24, 1, true, Math.PI / 2 - visorW / 2, visorW),
      visor,
      [0, s.headR * 0.08, 0],
    ),
  );
  spine.add(head);

  function arm(side, x) {
    const upper = new THREE.Group();
    upper.name = `${side}_UpperArm`;
    upper.position.set(x, s.shoulderY, 0);
    upper.add(joint(`Joint_${side}S`, s.joint, jointM));
    upper.add(limb(`UpperArm_${side}`, s.upperArmR, s.upperArmL, shell));
    const fore = new THREE.Group();
    fore.name = `${side}_ForeArm`;
    fore.position.set(0, -s.upperArmL, 0);
    fore.add(joint(`Joint_${side}E`, s.joint * 0.82, jointM));
    fore.add(limb(`ForeArm_${side}`, s.foreArmR, s.foreArmL, shell));
    fore.add(mesh(`Hand_${side}`, new THREE.SphereGeometry(s.foreArmR * 1.15, 14, 12), shell, [0, -s.foreArmL, 0]));
    upper.add(fore);
    return upper;
  }
  spine.add(arm('L', -s.shoulderX));
  spine.add(arm('R', s.shoulderX));

  function leg(side, x) {
    const thigh = new THREE.Group();
    thigh.name = `${side}_Thigh`;
    thigh.position.set(x, s.pelvisY, 0);
    thigh.add(joint(`Joint_${side}H`, s.hipJoint, jointM));
    thigh.add(limb(`Thigh_${side}`, s.thighR, s.thighL, shell));
    const shin = new THREE.Group();
    shin.name = `${side}_Shin`;
    shin.position.set(0, -s.thighL, 0);
    shin.add(joint(`Joint_${side}K`, s.hipJoint * 0.78, jointM));
    shin.add(limb(`Shin_${side}`, s.shinR, s.shinL, shell));
    shin.add(
      mesh(
        `Foot_${side}`,
        new THREE.CapsuleGeometry(s.shinR * 0.95, 0.07, 6, 12),
        shell,
        [0, -s.shinL + 0.02, 0.04],
        [1.05, 0, 0],
      ),
    );
    thigh.add(shin);
    return thigh;
  }
  hip.add(leg('L', -s.hipStance));
  hip.add(leg('R', s.hipStance));
  return hip;
}

async function exportGlb(root) {
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(root, { binary: true });
  return Buffer.from(data);
}

for (const id of BODIES) {
  if (CUSTOM_BODIES.has(id)) {
    console.log(id, 'skip custom glb');
    continue;
  }
  const root = buildRobot(id);
  const buf = await exportGlb(root);
  const file = join(OUT, `${id}.glb`);
  writeFileSync(file, buf);
  console.log(id, buf.length, 'bytes');
}
