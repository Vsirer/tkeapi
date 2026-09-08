/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import {
  DIRECTOR_EDITOR_FOV,
  DIRECTOR_LOOK_AT_Y,
  DIRECTOR_MAX_ACTORS,
  actorLookAt,
  canAddActor,
  canAddShot,
  createDefaultDirectorScene,
  findActor,
  getOrbitCamera,
  listShotCameras,
  makeActorId,
  makeShotId,
  nextActorColor,
  nextActorName,
  nextActorPosition,
  nextShotName,
  type DirectorActor,
  type DirectorBodyId,
  type DirectorPrimitiveId,
  type DirectorScene,
  type DirectorShotCamera,
  type DirectorShotPresetId,
  type Vec3,
} from './directorScene';

const DIRECTOR_BODY_PRESETS: Record<DirectorBodyId, { scale: Vec3 }> = {
  male: { scale: [1.03, 1.03, 1.03] },
  female: { scale: [0.94, 0.94, 0.94] },
  athletic: { scale: [1.14, 1.14, 1.14] },
  slim: { scale: [0.97, 0.97, 0.97] },
  teen: { scale: [0.86, 0.86, 0.86] },
  child: { scale: [0.63, 0.63, 0.63] },
  wide: { scale: [1, 1, 1] },
  chibi: { scale: [0.46, 0.46, 0.46] },
};

type ShotRecipe = { dist: number; height: number; azimuth: number; fov: number; roll: number };

const LEVEL_CAM_SLOPE = 1 / 10;

/** 水平机位：看胸口，沿默认俯角略高于看点 */
function levelCamY(dist: number): number {
  return DIRECTOR_LOOK_AT_Y + dist * LEVEL_CAM_SLOPE;
}

const SHOT_RECIPES: Record<Exclude<DirectorShotPresetId, 'current_view'>, ShotRecipe> = {
  front_medium: { dist: 2.4, height: levelCamY(2.4), azimuth: 0, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  front_close: { dist: 1.15, height: levelCamY(1.15), azimuth: 0, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  front_full: { dist: 4.2, height: levelCamY(4.2), azimuth: 0, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  side_track: { dist: 2.6, height: levelCamY(2.6), azimuth: Math.PI / 2, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  side_close: { dist: 1.4, height: levelCamY(1.4), azimuth: Math.PI / 2, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  back_medium: { dist: 2.4, height: levelCamY(2.4), azimuth: Math.PI, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  high_full: { dist: 5.2, height: 4.4, azimuth: 0.35, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  high_45: { dist: 3.4, height: 3.1, azimuth: 0.55, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  low_angle: { dist: 2.2, height: 0.28, azimuth: 0.15, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  low_wide: { dist: 2.8, height: 0.22, azimuth: 0.2, fov: 62, roll: 0 },
  ots_left: { dist: 1.7, height: levelCamY(1.7), azimuth: -0.55, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  ots_right: { dist: 1.7, height: levelCamY(1.7), azimuth: 0.55, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  birds_eye: { dist: 0.35, height: 6.4, azimuth: 0, fov: DIRECTOR_EDITOR_FOV, roll: 0 },
  dutch: { dist: 2.3, height: levelCamY(2.3), azimuth: 0.22, fov: DIRECTOR_EDITOR_FOV, roll: 0.38 },
};

function focusActor(scene: DirectorScene): DirectorActor | undefined {
  const sel = findActor(scene, scene.selectedIds[0] || '');
  if (sel && sel.visible !== false) return sel;
  return scene.actors.find((a) => a.visible !== false);
}

function secondActor(scene: DirectorScene, primary?: DirectorActor): DirectorActor | undefined {
  return scene.actors.find((a) => a.visible !== false && a.id !== primary?.id);
}

function orbitWorldPosition(scene: DirectorScene): { position: Vec3; target: Vec3 } {
  const orbit = getOrbitCamera(scene);
  const scale = scene.world.scalePercent / 100 || 1;
  const rx = (scene.world.rotation[0] * Math.PI) / 180;
  const ry = (scene.world.rotation[1] * Math.PI) / 180;
  const rz = (scene.world.rotation[2] * Math.PI) / 180;
  const sinPhi = Math.sin(orbit.spherical.phi);
  const world: Vec3 = [
    orbit.target[0] + sinPhi * Math.sin(orbit.spherical.theta) * orbit.spherical.radius,
    orbit.target[1] + Math.cos(orbit.spherical.phi) * orbit.spherical.radius,
    orbit.target[2] + sinPhi * Math.cos(orbit.spherical.theta) * orbit.spherical.radius,
  ];
  const px = world[0] - scene.world.pan[0];
  const py = world[1] - scene.world.pan[1];
  const pz = world[2] - scene.world.pan[2];
  const cy = Math.cos(-ry);
  const sy = Math.sin(-ry);
  const cx = Math.cos(-rx);
  const sx = Math.sin(-rx);
  const cz = Math.cos(-rz);
  const sz = Math.sin(-rz);
  let x = px * cy + pz * sy;
  let z = -px * sy + pz * cy;
  let y = py;
  const y2 = y * cx - z * sx;
  z = y * sx + z * cx;
  y = y2;
  const x2 = x * cz - y * sz;
  y = x * sz + y * cz;
  x = x2;
  const inv = 1 / scale;
  const localPos: Vec3 = [x * inv, y * inv, z * inv];
  const localTarget: Vec3 = [
    (orbit.target[0] - scene.world.pan[0]) * inv,
    (orbit.target[1] - scene.world.pan[1]) * inv,
    (orbit.target[2] - scene.world.pan[2]) * inv,
  ];
  return { position: localPos, target: localTarget };
}

function placeAround(
  target: Vec3,
  yaw: number,
  recipe: ShotRecipe,
): { position: Vec3; target: Vec3; fov: number; roll: number } {
  const heading = yaw + recipe.azimuth;
  return {
    position: [
      target[0] + Math.sin(heading) * recipe.dist,
      Math.max(0.08, recipe.height + (target[1] - DIRECTOR_LOOK_AT_Y)),
      target[2] + Math.cos(heading) * recipe.dist,
    ],
    target,
    fov: recipe.fov,
    roll: recipe.roll,
  };
}

const PRIMITIVE_META: Record<DirectorPrimitiveId, { scale: Vec3; color: string }> = {
  cube: { scale: [1, 1, 1], color: '#94a3b8' },
  sphere: { scale: [1, 1, 1], color: '#60a5fa' },
  cylinder: { scale: [1, 1, 1], color: '#34d399' },
  torus: { scale: [1, 1, 1], color: '#f472b6' },
  cone: { scale: [1, 1, 1], color: '#fbbf24' },
  pyramid: { scale: [1, 1, 1], color: '#a78bfa' },
};

function nextNamed(scene: DirectorScene, base: string): string {
  const used = new Set(scene.actors.map((a) => a.name));
  if (!used.has(base)) return base;
  for (let i = 2; i < 99; i += 1) {
    const name = `${base}${i}`;
    if (!used.has(name)) return name;
  }
  return `${base}${scene.actors.length + 1}`;
}

export function addActorFromBody(scene: DirectorScene, bodyId: DirectorBodyId): DirectorScene | null {
  if (!canAddActor(scene)) return null;
  const preset = DIRECTOR_BODY_PRESETS[bodyId];
  const actor: DirectorActor = {
    id: makeActorId(scene),
    name: nextActorName(scene),
    kind: 'mannequin',
    visible: true,
    locked: false,
    position: nextActorPosition(scene),
    rotation: [0, 0.2, 0],
    scale: [...preset.scale],
    poseId: 'stand',
    color: nextActorColor(scene.actors.length),
    bodyId,
  };
  return {
    ...scene,
    actors: [...scene.actors, actor],
    selectedIds: [actor.id],
  };
}

function yawFacingCamera(from: Vec3, camera: Vec3): number {
  const dx = camera[0] - from[0];
  const dz = camera[2] - from[2];
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return Math.atan2(dx, dz);
}

export function addCrowd(
  scene: DirectorScene,
  rows: number,
  cols: number,
  spacing: number,
): DirectorScene | null {
  const r = Math.max(1, Math.min(8, Math.round(rows)));
  const c = Math.max(1, Math.min(8, Math.round(cols)));
  const gap = Math.max(0.4, Math.min(6, spacing));
  const room = DIRECTOR_MAX_ACTORS - scene.actors.length;
  if (room <= 0) return null;
  const n = Math.min(r * c, room);
  const preset = DIRECTOR_BODY_PRESETS.male;
  const cam = orbitWorldPosition(scene).position;
  const y = scene.environment.groundHeight;
  const actors = [...scene.actors];
  for (let i = 0; i < n; i += 1) {
    const col = i % c;
    const row = Math.floor(i / c);
    const x = n > 1 ? (col - (c - 1) / 2) * gap : 0;
    const z = r > 1 ? (row - (r - 1) / 2) * gap : 0;
    const position: Vec3 = [x, y, z];
    const draft: DirectorScene = { ...scene, actors };
    actors.push({
      id: makeActorId(draft),
      name: nextActorName(draft),
      kind: 'mannequin',
      visible: true,
      locked: false,
      position,
      rotation: [0, yawFacingCamera(position, cam), 0],
      scale: [...preset.scale],
      poseId: 'stand',
      color: nextActorColor(actors.length),
      bodyId: 'male',
    });
  }
  const last = actors[actors.length - 1];
  return {
    ...scene,
    actors,
    selectedIds: last ? [last.id] : scene.selectedIds,
  };
}

export function addPrimitive(
  scene: DirectorScene,
  primitiveId: DirectorPrimitiveId,
  label: string,
): DirectorScene | null {
  if (!canAddActor(scene)) return null;
  const meta = PRIMITIVE_META[primitiveId];
  const actor: DirectorActor = {
    id: makeActorId(scene),
    name: nextNamed(scene, label),
    kind: 'primitive',
    visible: true,
    locked: false,
    position: nextActorPosition(scene),
    rotation: [0, 0, 0],
    scale: [...meta.scale],
    poseId: 'stand',
    color: meta.color,
    bodyId: 'male',
    primitiveId,
  };
  return {
    ...scene,
    actors: [...scene.actors, actor],
    selectedIds: [actor.id],
  };
}

export function addEmptyObject(scene: DirectorScene, label: string): DirectorScene | null {
  if (!canAddActor(scene)) return null;
  const actor: DirectorActor = {
    id: makeActorId(scene),
    name: nextNamed(scene, label),
    kind: 'empty',
    visible: true,
    locked: false,
    position: nextActorPosition(scene),
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    poseId: 'stand',
    color: '#e5e5e5',
    bodyId: 'male',
  };
  return {
    ...scene,
    actors: [...scene.actors, actor],
    selectedIds: [actor.id],
  };
}

export function applyAiImport(scene: DirectorScene, url: string, mode: 'insert' | 'cover'): DirectorScene {
  if (mode === 'insert') {
    return { ...scene, environment: { ...scene.environment, panoramaUrl: url } };
  }
  const next = createDefaultDirectorScene();
  return {
    ...next,
    aspect: scene.aspect,
    environment: { ...next.environment, panoramaUrl: url },
  };
}

export function addShotFromPreset(scene: DirectorScene, presetId: DirectorShotPresetId): DirectorScene | null {
  if (!canAddShot(scene)) return null;
  const primary = focusActor(scene);
  const partner = secondActor(scene, primary);
  let pose: { position: Vec3; target: Vec3; fov: number; roll: number };

  if (presetId === 'current_view') {
    pose = { ...orbitWorldPosition(scene), fov: getOrbitCamera(scene).fov, roll: 0 };
  } else {
    const recipe = SHOT_RECIPES[presetId];
    let target: Vec3;
    let yaw = 0;
    if ((presetId === 'ots_left' || presetId === 'ots_right') && primary && partner) {
      const look = actorLookAt(partner.position);
      const shoulder = presetId === 'ots_left' ? -0.42 : 0.42;
      const dx = partner.position[0] - primary.position[0];
      const dz = partner.position[2] - primary.position[2];
      yaw = Math.atan2(dx, dz);
      target = look;
      pose = placeAround(
        [
          primary.position[0] + Math.cos(yaw) * shoulder,
          primary.position[1] + DIRECTOR_LOOK_AT_Y,
          primary.position[2] - Math.sin(yaw) * shoulder,
        ],
        yaw,
        { ...recipe, dist: recipe.dist * 0.55, height: recipe.height },
      );
      pose = { ...pose, target };
    } else {
      const actor = primary;
      target = actor ? actorLookAt(actor.position) : [0, DIRECTOR_LOOK_AT_Y, 0];
      yaw = actor?.rotation[1] || 0;
      pose = placeAround(target, yaw, recipe);
    }
  }

  const shot: DirectorShotCamera = {
    id: makeShotId(scene),
    kind: 'shot',
    name: nextShotName(scene),
    visible: true,
    locked: false,
    position: pose.position,
    target: pose.target,
    fov: pose.fov,
    roll: pose.roll,
  };
  return {
    ...scene,
    cameras: [...scene.cameras, shot],
    selectedIds: [shot.id],
    activeCameraId: shot.id,
  };
}

export function patchActorFlag(
  scene: DirectorScene,
  id: string,
  patch: Partial<Pick<DirectorActor, 'visible' | 'locked'>>,
): DirectorScene {
  return {
    ...scene,
    actors: scene.actors.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  };
}

export function patchShotFlag(
  scene: DirectorScene,
  id: string,
  patch: Partial<Pick<DirectorShotCamera, 'visible' | 'locked'>>,
): DirectorScene {
  return {
    ...scene,
    cameras: scene.cameras.map((c) => (c.id === id && c.kind === 'shot' ? { ...c, ...patch } : c)),
  };
}
