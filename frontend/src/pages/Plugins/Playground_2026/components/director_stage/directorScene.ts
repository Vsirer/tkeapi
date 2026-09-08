/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

const DIRECTOR_SCENE_VERSION = 3;
export const DIRECTOR_MAX_CAPTURES = 12;
export const DIRECTOR_OPEN_EVENT = 'pg-director-open';
export const DIRECTOR_PANORAMA_HANDLE = 'Panorama';
export const DIRECTOR_MAX_ACTORS = 32;
const DIRECTOR_MAX_SHOTS = 16;

/** 与目标站 OrbitControls 一致：其默认 sceneScale=3 时最近 1、最远 60 */
const DIRECTOR_ORBIT_MIN_DISTANCE = 1;
const DIRECTOR_ORBIT_MAX_DISTANCE = 60;
/** 目标站 sceneScale 0.1–10（默认 3），这边用百分数 10%–1000%（默认 100%） */
export const DIRECTOR_SCENE_SCALE_MIN = 10;
export const DIRECTOR_SCENE_SCALE_MAX = 1000;
const DIRECTOR_LIBLIB_SCENE_SCALE = 3;

/** 镜头在场景缩放组外。按目标站默认 300% 折算，缩到最小时画面大小才一致。 */
export function orbitDistanceLimits(scalePercent: number): { min: number; max: number } {
  const scale = Math.max(DIRECTOR_SCENE_SCALE_MIN / 100, (Number(scalePercent) || 100) / 100);
  const factor = scale / DIRECTOR_LIBLIB_SCENE_SCALE;
  return {
    min: DIRECTOR_ORBIT_MIN_DISTANCE * factor,
    max: DIRECTOR_ORBIT_MAX_DISTANCE * factor,
  };
}

/** 角色看点：脚点上方胸口高度 */
export const DIRECTOR_LOOK_AT_Y = 1.2;
/** 导演 / 机位默认视角 */
export const DIRECTOR_EDITOR_FOV = 50;
/** 相机相对看点：略高、正后 10 */
const DIRECTOR_EDITOR_OFFSET = { x: 0, y: 1, z: 10 };

export function actorLookAt(position: Vec3): Vec3 {
  return [position[0], position[1] + DIRECTOR_LOOK_AT_Y, position[2]];
}

export const DIRECTOR_ASPECTS = ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
export type DirectorAspect = (typeof DIRECTOR_ASPECTS)[number];
export type DirectorTool = 'translate' | 'rotate' | 'scale';
export type DirectorViewMode = 'director' | 'camera';
export type DirectorRailTab = 'scene' | 'characters' | 'cameras' | 'panorama' | 'aspect';
type DirectorActorKind = 'mannequin' | 'primitive' | 'empty';
export const DIRECTOR_PRIMITIVE_IDS = ['cube', 'sphere', 'cylinder', 'torus', 'cone', 'pyramid'] as const;
export type DirectorPrimitiveId = (typeof DIRECTOR_PRIMITIVE_IDS)[number];

export const DIRECTOR_POSE_IDS = [
  'stand',
  'walk',
  'sit',
  'squat',
  'wave',
  'look_back',
  'confront',
  'point',
  'arms_crossed',
  'think',
] as const;

export type DirectorPoseId = (typeof DIRECTOR_POSE_IDS)[number];

export const DIRECTOR_BODY_IDS = [
  'male',
  'female',
  'athletic',
  'slim',
  'teen',
  'child',
  'wide',
  'chibi',
] as const;
export type DirectorBodyId = (typeof DIRECTOR_BODY_IDS)[number];

export const DIRECTOR_SHOT_PRESET_IDS = [
  'current_view',
  'front_medium',
  'front_close',
  'front_full',
  'side_track',
  'side_close',
  'back_medium',
  'high_full',
  'high_45',
  'low_angle',
  'low_wide',
  'ots_left',
  'ots_right',
  'birds_eye',
  'dutch',
] as const;
export type DirectorShotPresetId = (typeof DIRECTOR_SHOT_PRESET_IDS)[number];

/** 与目标站 CHARACTER_COLORS 一致：每次放置按人数取模换色 */
const DIRECTOR_ACTOR_COLORS = [
  '#4F8EF7',
  '#F75353',
  '#34C759',
  '#FF9F0A',
  '#AF52DE',
  '#FF2D55',
  '#5AC8FA',
  '#FFD60A',
] as const;

export function nextActorColor(index: number): string {
  return DIRECTOR_ACTOR_COLORS[index % DIRECTOR_ACTOR_COLORS.length];
}

export type DirectorStageLabels = {
  title: string;
  send: string;
  sendFailed: string;
  maxCaptures: string;
  close: string;
  collapse: string;
  move: string;
  rotate: string;
  scale: string;
  frame: string;
  fov: string;
  webglError: string;
  reopen: string;
  viewDirector: string;
  viewCamera: string;
  resetView: string;
  sceneTab: string;
  searchPlaceholder: string;
  sceneSection: string;
  sceneScale: string;
  scenePan: string;
  sceneRotate: string;
  panorama: string;
  panoramaConnected: string;
  panoramaHint: string;
  skyColor: string;
  actorColor: string;
  panoramaSphere: string;
  sphereYaw: string;
  sphereRadius: string;
  labelsToggle: string;
  gridSnap: string;
  groundSnap: string;
  ground: string;
  opacity: string;
  height: string;
  promptPlaceholder: string;
  promptEmpty: string;
  promptApplied: string;
  railScene: string;
  railCharacters: string;
  railCameras: string;
  railPanorama: string;
  railAspect: string;
  railAi: string;
  railHelp: string;
  hide: string;
  lock: string;
  emptyTab: string;
  localUpload: string;
  panoramaHistory: string;
  panoramaAi: string;
  laterVersion: string;
  crowdSoon: string;
  geometrySoon: string;
  crowdTitle: string;
  crowdRows: string;
  crowdCols: string;
  crowdSpacing: string;
  crowdTotal: string;
  cancel: string;
  add: string;
  addEmpty: string;
  uploadFile: string;
  capture: string;
  helpTitle: string;
  helpBody: string;
  aiDrop: string;
  aiInsert: string;
  aiInsertHint: string;
  aiCover: string;
  aiCoverHint: string;
  aiGenerate: string;
  aiHint: string;
  maxActors: string;
  maxShots: string;
  aspect: string;
  scrubAxis: string;
  poses: Record<DirectorPoseId, string>;
  bodies: Record<DirectorBodyId, string>;
  shots: Record<DirectorShotPresetId, string>;
  aspects: Record<DirectorAspect, string>;
  primitives: Record<DirectorPrimitiveId, string>;
};

export type Vec3 = [number, number, number];

export type DirectorActor = {
  id: string;
  name: string;
  kind: DirectorActorKind;
  visible: boolean;
  locked: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  poseId: DirectorPoseId;
  color: string;
  bodyId: DirectorBodyId;
  primitiveId?: DirectorPrimitiveId;
};

export type DirectorOrbitCamera = {
  id: string;
  kind: 'orbit';
  fov: number;
  target: Vec3;
  spherical: { radius: number; phi: number; theta: number };
};

export type DirectorShotCamera = {
  id: string;
  kind: 'shot';
  name: string;
  visible: boolean;
  locked: boolean;
  position: Vec3;
  target: Vec3;
  fov: number;
  roll: number;
};

type DirectorCamera = DirectorOrbitCamera | DirectorShotCamera;

export type DirectorEnvironment = {
  skyColor: string;
  panoramaUrl: string;
  sphereYaw: number;
  sphereRadius: number;
  showLabels: boolean;
  gridSnap: boolean;
  groundSnap: boolean;
  groundVisible: boolean;
  groundOpacity: number;
  groundHeight: number;
};

export type DirectorWorld = {
  scalePercent: number;
  pan: Vec3;
  rotation: Vec3;
};

export type DirectorScene = {
  version: number;
  aspect: DirectorAspect;
  viewMode: DirectorViewMode;
  activeCameraId: string;
  selectedIds: string[];
  actors: DirectorActor[];
  cameras: DirectorCamera[];
  world: DirectorWorld;
  environment: DirectorEnvironment;
};

export type DirectorCaptureFile = {
  id: string;
  url: string;
  kind: 'image';
  fileName?: string;
  resource_id?: string;
};

function createDefaultDirectorEnvironment(): DirectorEnvironment {
  return {
    skyColor: '#060608',
    panoramaUrl: '',
    sphereYaw: 3,
    sphereRadius: 60,
    showLabels: true,
    gridSnap: false,
    groundSnap: true,
    groundVisible: true,
    groundOpacity: 0.4,
    groundHeight: 0,
  };
}

function createDefaultDirectorWorld(): DirectorWorld {
  return {
    scalePercent: 100,
    pan: [0, 0, 0],
    rotation: [0, 0, 0],
  };
}

function defaultOrbit(scalePercent = 100): DirectorOrbitCamera {
  const off = DIRECTOR_EDITOR_OFFSET;
  const unscaled = Math.hypot(off.x, off.y, off.z);
  const lim = orbitDistanceLimits(scalePercent);
  return {
    id: 'director',
    kind: 'orbit',
    fov: DIRECTOR_EDITOR_FOV,
    target: [0, DIRECTOR_LOOK_AT_Y, 0],
    spherical: {
      radius: unscaled * (lim.max / DIRECTOR_ORBIT_MAX_DISTANCE),
      phi: Math.acos(off.y / unscaled),
      theta: 0,
    },
  };
}

function defaultShots(): DirectorShotCamera[] {
  return [
    {
      id: 'shot-1',
      kind: 'shot',
      name: '机位1',
      visible: true,
      locked: false,
      position: [2.4, 1.61, 3.6],
      target: [0.2, DIRECTOR_LOOK_AT_Y, 0.1],
      fov: DIRECTOR_EDITOR_FOV,
      roll: 0,
    },
    {
      id: 'shot-2',
      kind: 'shot',
      name: '机位2',
      visible: true,
      locked: false,
      position: [0.2, 1.42, 2.15],
      target: [0.35, DIRECTOR_LOOK_AT_Y, 0],
      fov: DIRECTOR_EDITOR_FOV,
      roll: 0,
    },
  ];
}

function defaultActors(): DirectorActor[] {
  return [
    {
      id: 'actor-1',
      name: '角色A',
      kind: 'mannequin',
      visible: true,
      locked: false,
      position: [-0.55, 0, 0.35],
      rotation: [0, 0.35, 0],
      scale: [1.03, 1.03, 1.03],
      poseId: 'stand',
      color: nextActorColor(0),
      bodyId: 'male',
    },
    {
      id: 'actor-2',
      name: '角色B',
      kind: 'mannequin',
      visible: true,
      locked: false,
      position: [2.15, 0, 0.15],
      rotation: [0, -0.55, 0],
      scale: [0.94, 0.94, 0.94],
      poseId: 'walk',
      color: nextActorColor(1),
      bodyId: 'female',
    },
    {
      id: 'actor-3',
      name: '角色C',
      kind: 'mannequin',
      visible: true,
      locked: false,
      position: [0.35, 0, 0],
      rotation: [0, 0.08, 0],
      scale: [1.14, 1.14, 1.14],
      poseId: 'stand',
      color: nextActorColor(2),
      bodyId: 'athletic',
    },
    {
      id: 'actor-4',
      name: '角色D',
      kind: 'mannequin',
      visible: true,
      locked: false,
      position: [-2.05, 0, 0.2],
      rotation: [0, 0.7, 0],
      scale: [0.63, 0.63, 0.63],
      poseId: 'stand',
      color: nextActorColor(3),
      bodyId: 'child',
    },
  ];
}

export function createDefaultDirectorScene(): DirectorScene {
  const actors = defaultActors();
  return {
    version: DIRECTOR_SCENE_VERSION,
    aspect: '16:9',
    viewMode: 'director',
    activeCameraId: 'director',
    selectedIds: [actors[0].id],
    actors,
    cameras: [defaultOrbit(), ...defaultShots()],
    world: createDefaultDirectorWorld(),
    environment: createDefaultDirectorEnvironment(),
  };
}

function asVec3(v: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length < 3) return [...fallback] as Vec3;
  return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
}

function asPoseId(v: unknown): DirectorPoseId {
  return DIRECTOR_POSE_IDS.includes(v as DirectorPoseId) ? (v as DirectorPoseId) : 'stand';
}

function asAspect(v: unknown): DirectorAspect {
  return DIRECTOR_ASPECTS.includes(v as DirectorAspect) ? (v as DirectorAspect) : '16:9';
}

function asBodyId(v: unknown): DirectorBodyId {
  return DIRECTOR_BODY_IDS.includes(v as DirectorBodyId) ? (v as DirectorBodyId) : 'male';
}

function asActorKind(v: unknown): DirectorActorKind {
  if (v === 'primitive' || v === 'empty') return v;
  return 'mannequin';
}

function asPrimitiveId(v: unknown): DirectorPrimitiveId {
  return DIRECTOR_PRIMITIVE_IDS.includes(v as DirectorPrimitiveId) ? (v as DirectorPrimitiveId) : 'cube';
}

function asHexColor(v: unknown, fallback: string): string {
  if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  return fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isShotCamera(cam: DirectorCamera): cam is DirectorShotCamera {
  return cam.kind === 'shot';
}

function isOrbitCamera(cam: DirectorCamera): cam is DirectorOrbitCamera {
  return cam.kind === 'orbit';
}

export function getOrbitCamera(scene: DirectorScene): DirectorOrbitCamera {
  const found = scene.cameras.find(isOrbitCamera);
  return found || defaultOrbit();
}

export function listShotCameras(scene: DirectorScene): DirectorShotCamera[] {
  return scene.cameras.filter(isShotCamera);
}

export function findActor(scene: DirectorScene, id: string): DirectorActor | undefined {
  return scene.actors.find((a) => a.id === id);
}

export function findShot(scene: DirectorScene, id: string): DirectorShotCamera | undefined {
  return listShotCameras(scene).find((c) => c.id === id);
}

function normalizeActor(raw: Partial<DirectorActor> | undefined, index: number): DirectorActor {
  const fallback = defaultActors()[Math.min(index, defaultActors().length - 1)];
  const kind = asActorKind(raw?.kind);
  return {
    id: String(raw?.id || `actor-${index + 1}`),
    name: String(raw?.name || `角色${String.fromCharCode(65 + index)}`),
    kind,
    visible: raw?.visible !== false,
    locked: !!raw?.locked,
    position: asVec3(raw?.position, fallback?.position || [index, 0, 0]),
    rotation: asVec3(raw?.rotation, [0, 0, 0]),
    scale: asVec3(raw?.scale, fallback?.scale || [1, 1, 1]),
    poseId: asPoseId(raw?.poseId),
    color: asHexColor(raw?.color, DIRECTOR_ACTOR_COLORS[index % DIRECTOR_ACTOR_COLORS.length]),
    bodyId: asBodyId(raw?.bodyId),
    primitiveId: kind === 'primitive' ? asPrimitiveId(raw?.primitiveId) : undefined,
  };
}

function normalizeShot(raw: Partial<DirectorShotCamera>, index: number): DirectorShotCamera {
  const fallback = defaultShots()[Math.min(index, defaultShots().length - 1)];
  return {
    id: String(raw.id || `shot-${index + 1}`),
    kind: 'shot',
    name: String(raw.name || `机位${index + 1}`),
    visible: raw.visible !== false,
    locked: !!raw.locked,
    position: asVec3(raw.position, fallback?.position || [2, 1.2, 3]),
    target: asVec3(raw.target, fallback?.target || [0, DIRECTOR_LOOK_AT_Y, 0]),
    fov: clamp(Number(raw.fov) || fallback?.fov || DIRECTOR_EDITOR_FOV, 20, 90),
    roll: Number(raw.roll) || 0,
  };
}

function normalizeOrbit(
  raw: Partial<DirectorOrbitCamera> | undefined,
  scalePercent: number,
): DirectorOrbitCamera {
  const base = defaultOrbit(scalePercent);
  const lim = orbitDistanceLimits(scalePercent);
  return {
    id: 'director',
    kind: 'orbit',
    fov: clamp(Number(raw?.fov) || base.fov, 20, 80),
    target: asVec3(raw?.target, base.target),
    spherical: {
      radius: clamp(Number(raw?.spherical?.radius) || base.spherical.radius, lim.min, lim.max),
      phi: Number(raw?.spherical?.phi) || base.spherical.phi,
      theta: Number(raw?.spherical?.theta) || base.spherical.theta,
    },
  };
}

function normalizeEnvironment(raw: Partial<DirectorEnvironment> | undefined): DirectorEnvironment {
  const base = createDefaultDirectorEnvironment();
  return {
    skyColor: asHexColor(raw?.skyColor, base.skyColor),
    panoramaUrl: typeof raw?.panoramaUrl === 'string' ? raw.panoramaUrl : '',
    sphereYaw: Number(raw?.sphereYaw) || 0,
    sphereRadius: clamp(Number(raw?.sphereRadius) || base.sphereRadius, 8, 120),
    showLabels: asBool(raw?.showLabels, true),
    gridSnap: asBool(raw?.gridSnap, false),
    groundSnap: asBool(raw?.groundSnap, true),
    groundVisible: asBool(raw?.groundVisible, true),
    groundOpacity: clamp(Number(raw?.groundOpacity ?? base.groundOpacity), 0, 1),
    groundHeight: Number(raw?.groundHeight) || 0,
  };
}

function normalizeWorld(raw: Partial<DirectorWorld> | undefined): DirectorWorld {
  const base = createDefaultDirectorWorld();
  return {
    scalePercent: clamp(
      Number(raw?.scalePercent) || base.scalePercent,
      DIRECTOR_SCENE_SCALE_MIN,
      DIRECTOR_SCENE_SCALE_MAX,
    ),
    pan: asVec3(raw?.pan, base.pan),
    rotation: asVec3(raw?.rotation, base.rotation),
  };
}

export function normalizeDirectorScene(raw: unknown): DirectorScene {
  const base = createDefaultDirectorScene();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<DirectorScene> & { cameras?: Array<Partial<DirectorCamera>> };
  const actorsIn = Array.isArray(s.actors) ? s.actors : null;
  const actors: DirectorActor[] = actorsIn
    ? actorsIn.slice(0, DIRECTOR_MAX_ACTORS).map((a, i) => normalizeActor(a, i))
    : base.actors;

  const camIn = Array.isArray(s.cameras) ? s.cameras : [];
  const orbitRaw = camIn.find((c) => !c || c.kind !== 'shot') as Partial<DirectorOrbitCamera> | undefined;
  const shotRaws = camIn.filter((c) => c && (c.kind === 'shot' || (c.id && c.id !== 'director' && c.kind !== 'orbit')));
  const shots =
    shotRaws.length > 0
      ? shotRaws.slice(0, DIRECTOR_MAX_SHOTS).map((c, i) => normalizeShot(c as Partial<DirectorShotCamera>, i))
      : defaultShots();

  const world = normalizeWorld(s.world);
  if (world.scalePercent === 140) world.scalePercent = 100;
  const cameras: DirectorCamera[] = [
    normalizeOrbit(orbitRaw || (camIn[0] as Partial<DirectorOrbitCamera>), world.scalePercent),
    ...shots,
  ];

  const validIds = new Set<string>([
    ...actors.map((a) => a.id),
    ...shots.map((c) => c.id),
  ]);
  const selectedIds = Array.isArray(s.selectedIds)
    ? s.selectedIds.map(String).filter((id) => validIds.has(id))
    : [];
  const viewMode: DirectorViewMode = s.viewMode === 'camera' ? 'camera' : 'director';
  const activeCameraId =
    typeof s.activeCameraId === 'string' && cameras.some((c) => c.id === s.activeCameraId)
      ? s.activeCameraId
      : 'director';
  const fallbackId =
    actors.find((a) => a.visible !== false)?.id || shots.find((c) => c.visible !== false)?.id || '';

  return {
    version: DIRECTOR_SCENE_VERSION,
    aspect: asAspect(s.aspect),
    viewMode,
    activeCameraId,
    selectedIds: selectedIds.length ? selectedIds : fallbackId ? [fallbackId] : [],
    actors,
    cameras,
    world,
    environment: normalizeEnvironment(s.environment),
  };
}

export function directorSceneEqual(a: DirectorScene, b: DirectorScene): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneDirectorScene(scene: DirectorScene): DirectorScene {
  return JSON.parse(JSON.stringify(scene)) as DirectorScene;
}

export function captureSizeForAspect(aspect: DirectorAspect): { width: number; height: number } {
  if (aspect === '21:9') return { width: 1680, height: 720 };
  if (aspect === '4:3') return { width: 1024, height: 768 };
  if (aspect === '1:1') return { width: 1024, height: 1024 };
  if (aspect === '3:4') return { width: 768, height: 1024 };
  if (aspect === '9:16') return { width: 720, height: 1280 };
  return { width: 1280, height: 720 };
}

function nextIndexedId(prefix: string, ids: string[]): string {
  let max = 0;
  for (const id of ids) {
    const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

export function nextActorName(scene: DirectorScene): string {
  const used = new Set(scene.actors.map((a) => a.name));
  for (let i = 0; i < 26; i += 1) {
    const name = `角色${String.fromCharCode(65 + i)}`;
    if (!used.has(name)) return name;
  }
  return `角色${scene.actors.length + 1}`;
}

export function nextShotName(scene: DirectorScene): string {
  return `机位${listShotCameras(scene).length + 1}`;
}

export function nextActorPosition(scene: DirectorScene): Vec3 {
  const vis = scene.actors.filter((a) => a.visible !== false);
  const n = vis.length;
  const ang = n * 0.85;
  return [Math.sin(ang) * 1.4, scene.environment.groundHeight, Math.cos(ang) * 0.55];
}

export function canAddActor(scene: DirectorScene): boolean {
  return scene.actors.length < DIRECTOR_MAX_ACTORS;
}

export function canAddShot(scene: DirectorScene): boolean {
  return listShotCameras(scene).length < DIRECTOR_MAX_SHOTS;
}

export function makeActorId(scene: DirectorScene): string {
  return nextIndexedId(
    'actor',
    scene.actors.map((a) => a.id),
  );
}

export function makeShotId(scene: DirectorScene): string {
  return nextIndexedId(
    'shot',
    listShotCameras(scene).map((c) => c.id),
  );
}

export function defaultOrbitView(scalePercent = 100): DirectorOrbitCamera {
  return defaultOrbit(scalePercent);
}

export function orbitCameraPosition(orbit: DirectorOrbitCamera): Vec3 {
  const { radius, phi, theta } = orbit.spherical;
  const sinPhi = Math.sin(phi);
  return [
    orbit.target[0] + sinPhi * Math.sin(theta) * radius,
    orbit.target[1] + Math.cos(phi) * radius,
    orbit.target[2] + sinPhi * Math.cos(theta) * radius,
  ];
}

export function listDirectorFiles(taskData: Record<string, unknown> | undefined): DirectorCaptureFile[] {
  const raw = taskData?.files;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && typeof f === 'object' && typeof (f as DirectorCaptureFile).url === 'string')
    .map((f) => {
      const item = f as DirectorCaptureFile;
      return {
        id: String(item.id || item.url),
        url: item.url,
        kind: 'image' as const,
        fileName: item.fileName,
        resource_id: item.resource_id != null ? String(item.resource_id) : undefined,
      };
    })
    .filter((f) => !!f.url);
}

export function getDirectorActiveFile(
  taskData: Record<string, unknown> | undefined,
  resultData?: Record<string, unknown>,
): DirectorCaptureFile | null {
  const files = listDirectorFiles(taskData);
  if (!files.length) return null;
  const stored =
    (typeof taskData?.active_file_id === 'string' && taskData.active_file_id) ||
    (typeof (resultData?.content as { active_file_id?: string } | undefined)?.active_file_id === 'string' &&
      (resultData?.content as { active_file_id?: string }).active_file_id) ||
    '';
  return files.find((f) => f.id === stored) || files[0];
}

/** 下游只出当前 active 一张 */
export function collectDirectorDownstreamUrls(
  src: { taskData?: Record<string, unknown>; resultData?: Record<string, unknown>; type?: string } | null | undefined,
  absoluteUrl: (raw: string) => string,
): string[] {
  if (!src || src.taskData?.node_type !== 'director') return [];
  const active = getDirectorActiveFile(src.taskData, src.resultData);
  if (!active?.url) return [];
  const u = absoluteUrl(active.url);
  return u ? [u] : [];
}

export function directorPanoramaSourceId(
  node: { parentId?: string; inputConnections?: Record<string, string> } | null | undefined,
): string {
  if (!node) return '';
  const fromHandle = node.inputConnections?.[DIRECTOR_PANORAMA_HANDLE];
  if (fromHandle) return fromHandle;
  return node.parentId || '';
}
