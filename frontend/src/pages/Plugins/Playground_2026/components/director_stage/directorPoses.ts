/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import type { DirectorPoseId, Vec3 } from './directorScene';

export type MannequinBones = {
  /** 相对站立髋高的下沉（坐下/蹲） */
  hipY: number;
  spine: Vec3;
  head: Vec3;
  lUpperArm: Vec3;
  lForeArm: Vec3;
  rUpperArm: Vec3;
  rForeArm: Vec3;
  lThigh: Vec3;
  lShin: Vec3;
  rThigh: Vec3;
  rShin: Vec3;
};

const Z: Vec3 = [0, 0, 0];

export const DIRECTOR_POSES: Record<DirectorPoseId, MannequinBones> = {
  stand: {
    hipY: 0,
    spine: Z,
    head: Z,
    lUpperArm: [0, 0, 0.18],
    lForeArm: [0, 0, 0.08],
    rUpperArm: [0, 0, -0.18],
    rForeArm: [0, 0, -0.08],
    lThigh: Z,
    lShin: Z,
    rThigh: Z,
    rShin: Z,
  },
  walk: {
    hipY: 0.02,
    spine: [0.04, 0.2, 0],
    head: [0, 0.1, 0],
    lUpperArm: [0.7, 0, 0.2],
    lForeArm: [0.35, 0, 0],
    rUpperArm: [-0.55, 0, -0.2],
    rForeArm: [0.2, 0, 0],
    lThigh: [-0.55, 0, 0],
    lShin: [0.45, 0, 0],
    rThigh: [0.45, 0, 0],
    rShin: [0.15, 0, 0],
  },
  sit: {
    hipY: -0.42,
    spine: [0.12, 0, 0],
    head: [0.08, 0, 0],
    lUpperArm: [0.2, 0, 0.35],
    lForeArm: [0.9, 0, 0],
    rUpperArm: [0.2, 0, -0.35],
    rForeArm: [0.9, 0, 0],
    lThigh: [1.35, 0.08, 0],
    lShin: [-1.2, 0, 0],
    rThigh: [1.35, -0.08, 0],
    rShin: [-1.2, 0, 0],
  },
  squat: {
    hipY: -0.55,
    spine: [0.28, 0, 0],
    head: [0.12, 0, 0],
    lUpperArm: [0.5, 0, 0.4],
    lForeArm: [0.7, 0, 0],
    rUpperArm: [0.5, 0, -0.4],
    rForeArm: [0.7, 0, 0],
    lThigh: [1.5, 0.12, 0],
    lShin: [-1.55, 0, 0],
    rThigh: [1.5, -0.12, 0],
    rShin: [-1.55, 0, 0],
  },
  wave: {
    hipY: 0,
    spine: [0, -0.12, 0],
    head: [0, -0.2, 0],
    lUpperArm: [0.15, 0, 0.25],
    lForeArm: [0.2, 0, 0],
    rUpperArm: [-2.4, 0, -0.2],
    rForeArm: [-0.4, 0.6, 0],
    lThigh: Z,
    lShin: Z,
    rThigh: Z,
    rShin: Z,
  },
  look_back: {
    hipY: 0,
    spine: [0, 0.55, 0],
    head: [0.1, 0.7, 0],
    lUpperArm: [0.25, 0.2, 0.25],
    lForeArm: [0.3, 0, 0],
    rUpperArm: [0.1, 0.15, -0.2],
    rForeArm: [0.15, 0, 0],
    lThigh: [0.08, 0.1, 0],
    lShin: Z,
    rThigh: [0.08, -0.05, 0],
    rShin: Z,
  },
  confront: {
    hipY: 0.02,
    spine: [0.08, 0, 0],
    head: [0.05, 0, 0],
    lUpperArm: [0.85, 0, 0.55],
    lForeArm: [0.7, 0, 0],
    rUpperArm: [0.85, 0, -0.55],
    rForeArm: [0.7, 0, 0],
    lThigh: [0.12, 0.08, 0],
    lShin: Z,
    rThigh: [-0.05, -0.08, 0],
    rShin: Z,
  },
  point: {
    hipY: 0,
    spine: [0, -0.15, 0],
    head: [0, -0.2, 0],
    lUpperArm: [0.2, 0, 0.22],
    lForeArm: [0.15, 0, 0],
    rUpperArm: [1.15, -0.35, -0.15],
    rForeArm: [0.05, 0, 0],
    lThigh: Z,
    lShin: Z,
    rThigh: Z,
    rShin: Z,
  },
  arms_crossed: {
    hipY: 0,
    spine: [0.06, 0, 0],
    head: [0.04, 0, 0],
    lUpperArm: [1.05, 0.35, 0.55],
    lForeArm: [1.35, 0.2, 0],
    rUpperArm: [1.05, -0.35, -0.55],
    rForeArm: [1.35, -0.2, 0],
    lThigh: [0.05, 0.06, 0],
    lShin: Z,
    rThigh: [0.05, -0.06, 0],
    rShin: Z,
  },
  think: {
    hipY: 0,
    spine: [0.08, 0.12, 0],
    head: [0.15, 0.2, 0],
    lUpperArm: [0.2, 0, 0.2],
    lForeArm: [0.25, 0, 0],
    rUpperArm: [1.15, -0.55, 0.15],
    rForeArm: [1.5, 0.35, 0],
    lThigh: Z,
    lShin: Z,
    rThigh: Z,
    rShin: Z,
  },
};
