/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import {
  cloneDirectorScene,
  defaultOrbitView,
  DIRECTOR_POSE_IDS,
  type DirectorPoseId,
  type DirectorScene,
} from './directorScene';

const POSE_ALIASES: Array<{ id: DirectorPoseId; keys: string[] }> = [
  { id: 'stand', keys: ['站立', '站着', 'stand'] },
  { id: 'walk', keys: ['行走', '走路', '步行', 'walk'] },
  { id: 'sit', keys: ['坐下', '坐着', 'sit'] },
  { id: 'squat', keys: ['蹲', '蹲下', 'squat'] },
  { id: 'wave', keys: ['举手', '挥手', 'wave'] },
  { id: 'look_back', keys: ['回头', '转身看', 'look back'] },
  { id: 'confront', keys: ['对峙', '对打', '对视', 'confront'] },
  { id: 'point', keys: ['指向', '指着', 'point'] },
  { id: 'arms_crossed', keys: ['抱臂', '抱胸', '叉腰', 'arms'] },
  { id: 'think', keys: ['思考', '沉思', 'think'] },
];

function countFromText(text: string): number | null {
  if (/一人|单人|1人|one person/.test(text)) return 1;
  if (/两人|双人|2人|two/.test(text)) return 2;
  if (/三人|3人|three/.test(text)) return 3;
  if (/四人|全员|4人|four/.test(text)) return 4;
  return null;
}

function poseFromText(text: string): DirectorPoseId | null {
  const hit = POSE_ALIASES.find((p) => p.keys.some((k) => text.includes(k)));
  return hit?.id || null;
}

/**
 * 把自然语言描述映射到当前 scene（站位/人数/姿态/机位远近），不调用生图。
 */
export function applyDirectorPrompt(scene: DirectorScene, raw: string): DirectorScene | null {
  const text = raw.trim().toLowerCase();
  const orig = raw.trim();
  if (!orig) return null;

  const next = cloneDirectorScene(scene);
  let changed = false;

  const count = countFromText(orig) ?? countFromText(text);
  if (count != null) {
    next.actors = next.actors.map((a, i) => ({ ...a, visible: i < count }));
    changed = true;
  }

  const pose = poseFromText(orig) || poseFromText(text);
  if (pose && DIRECTOR_POSE_IDS.includes(pose)) {
    next.actors = next.actors.map((a) => (a.visible === false ? a : { ...a, poseId: pose }));
    if (pose === 'confront') {
      const vis = next.actors.filter((a) => a.visible !== false);
      if (vis.length >= 2) {
        next.actors = next.actors.map((a) => {
          if (a.id === vis[0].id) return { ...a, rotation: [0, 0.9, 0], position: [-0.7, a.position[1], 0] };
          if (a.id === vis[1].id) return { ...a, rotation: [0, -0.9, 0], position: [0.7, a.position[1], 0] };
          return a;
        });
      }
    }
    changed = true;
  }

  const orbit = next.cameras.find((c) => c.kind === 'orbit');
  if (orbit && orbit.kind === 'orbit') {
    if (/特写|近景|close/.test(orig) || /特写|近景|close/.test(text)) {
      orbit.spherical = { ...orbit.spherical, radius: 3.2, phi: 1.22 };
      changed = true;
    } else if (/远景|全景|wide/.test(orig) || /远景|全景|wide/.test(text)) {
      orbit.spherical = { ...orbit.spherical, radius: 9.5, phi: 1.05 };
      changed = true;
    }
    if (/俯视|overhead|top/.test(orig) || /俯视|overhead/.test(text)) {
      orbit.spherical = { ...orbit.spherical, phi: 0.45, radius: Math.max(orbit.spherical.radius, 7) };
      changed = true;
    } else if (/平视|eye level/.test(orig) || /平视/.test(text)) {
      orbit.spherical = { ...orbit.spherical, phi: defaultOrbitView().spherical.phi };
      changed = true;
    }
  }

  return changed ? next : null;
}
