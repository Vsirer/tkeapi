/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 导演台唯一 three / r3f 文件：轨道、gizmo、机器人 GLB、机位、全景、截图
 */
import React, {
  forwardRef,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import { DirectorSelectionGizmo } from './directorGizmo';
import { DIRECTOR_POSES } from './directorPoses';
import {
  actorLookAt,
  orbitCameraPosition,
  orbitDistanceLimits,
  captureSizeForAspect,
  defaultOrbitView,
  DIRECTOR_BODY_IDS,
  DIRECTOR_EDITOR_FOV,
  getOrbitCamera,
  listShotCameras,
  type DirectorActor,
  type DirectorBodyId,
  type DirectorScene,
  type DirectorShotCamera,
  type DirectorTool,
  type Vec3,
} from './directorScene';

export type DirectorStageViewportHandle = {
  capturePng: () => Promise<Blob>;
  resetView: () => void;
  frameSelection: () => void;
};

type Props = {
  scene: DirectorScene;
  tool: DirectorTool;
  livePanoramaUrl?: string;
  onSceneChange: (next: DirectorScene) => void;
  onSceneCommit: () => void;
};

const MALE_GLB = `${new URL('../../assets/director_robots/male.glb', import.meta.url).href}?v=stand-hang2`;
const ROBOT_GLB_URL: Record<DirectorBodyId, string> = {
  male: MALE_GLB,
  female: MALE_GLB,
  athletic: MALE_GLB,
  slim: MALE_GLB,
  teen: MALE_GLB,
  child: MALE_GLB,
  wide: MALE_GLB,
  chibi: MALE_GLB,
};

DIRECTOR_BODY_IDS.forEach((id) => {
  useLoader.preload(GLTFLoader, ROBOT_GLB_URL[id]);
});

function Plastic({
  color,
  roughness = 0.32,
  metalness = 0.42,
  emissive,
  emissiveIntensity = 0,
}: {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive || '#000000'}
      emissiveIntensity={emissiveIntensity}
    />
  );
}

const IMPORTED_ROBOT_HEIGHT = 1.72;

function isProceduralRobot(root: THREE.Object3D) {
  return !!root.getObjectByName('Hip') && !root.getObjectByName('Hips');
}

function fitImportedRobot(root: THREE.Object3D) {
  if (isProceduralRobot(root)) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  if (height < 1e-6) return;
  root.scale.multiplyScalar(IMPORTED_ROBOT_HEIGHT / height);
  root.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(root);
  root.position.y -= grounded.min.y;
}

class RobotLoadErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function cloneRobotScene(source: THREE.Object3D): THREE.Object3D {
  let cloned: THREE.Object3D;
  try {
    cloned = cloneSkinnedScene(source);
  } catch {
    cloned = source.clone(true);
  }
  const unique = new Map<THREE.Material, THREE.Material>();
  cloned.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((mat) => {
      let copy = unique.get(mat);
      if (!copy) {
        copy = mat.clone();
        unique.set(mat, copy);
      }
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  return cloned;
}

function applyRobotPose(root: THREE.Object3D, poseId: DirectorActor['poseId']) {
  const pose = DIRECTOR_POSES[poseId] || DIRECTOR_POSES.stand;
  const hip = root.getObjectByName('Hip');
  if (hip) hip.position.y = pose.hipY;
  const rot = (name: string, v: Vec3) => {
    const node = root.getObjectByName(name);
    if (node) node.rotation.set(v[0], v[1], v[2]);
  };
  rot('Spine', pose.spine);
  rot('Head', pose.head);
  rot('L_UpperArm', pose.lUpperArm);
  rot('L_ForeArm', pose.lForeArm);
  rot('R_UpperArm', pose.rUpperArm);
  rot('R_ForeArm', pose.rForeArm);
  rot('L_Thigh', pose.lThigh);
  rot('L_Shin', pose.lShin);
  rot('R_Thigh', pose.rThigh);
  rot('R_Shin', pose.rShin);
}

function mixamoBone(root: THREE.Object3D, name: string) {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    const bone = skinned.skeleton.bones.find((b) => b.name === name);
    if (bone) found = bone;
  });
  return found || root.getObjectByName(name);
}

function aimBoneWorld(bone: THREE.Object3D, worldDir: THREE.Vector3) {
  if (!bone.parent) return;
  bone.updateWorldMatrix(true, false);
  const child = bone.children.find((c) => c.position.lengthSq() > 1e-8);
  if (!child) return;
  const from = child.position.clone().normalize().transformDirection(bone.matrixWorld);
  if (from.lengthSq() < 1e-8) return;
  from.normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(from, worldDir.clone().normalize());
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  worldQ.premultiply(align);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(worldQ);
  bone.updateMatrix();
  bone.updateWorldMatrix(false, true);
}

function hangMixamoStand(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const leftSh = mixamoBone(root, 'LeftShoulder');
  const rightSh = mixamoBone(root, 'RightShoulder');
  const out = new THREE.Vector3(1, 0, 0);
  if (leftSh && rightSh) {
    out.copy(leftSh.getWorldPosition(new THREE.Vector3())).sub(rightSh.getWorldPosition(new THREE.Vector3()));
    out.y = 0;
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
    else out.normalize();
  }
  const down = new THREE.Vector3(0, -1, 0);
  const rest = (side: number, outW: number, downW: number) =>
    out.clone().multiplyScalar(side * outW).addScaledVector(down, downW).normalize();
  const chain: [string, THREE.Vector3][] = [
    ['LeftShoulder', rest(1, 0.92, 0.4)],
    ['LeftArm', rest(1, 0.1, 1)],
    ['LeftForeArm', rest(1, 0.08, 1)],
    ['RightShoulder', rest(-1, 0.92, 0.4)],
    ['RightArm', rest(-1, 0.1, 1)],
    ['RightForeArm', rest(-1, 0.08, 1)],
  ];
  for (const [name, dir] of chain) {
    const bone = mixamoBone(root, name);
    if (bone) aimBoneWorld(bone, dir);
  }
  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.update();
  });
}

function tintRobot(root: THREE.Object3D, hex: string) {
  const shell = new THREE.Color(hex);
  const joint = shell.clone().multiplyScalar(0.7);
  const keepAlbedo = shell.r > 0.96 && shell.g > 0.96 && shell.b > 0.96;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.color || std.name === 'visor') continue;
      if (std.userData.directorAlbedo === undefined && std.map) {
        std.userData.directorAlbedo = std.map;
      }
      const albedo = std.userData.directorAlbedo as THREE.Texture | undefined;
      if (albedo) std.map = keepAlbedo ? albedo : null;
      std.color.copy(std.name === 'joint' && !albedo ? joint : shell);
      std.needsUpdate = true;
    }
  });
}

function RobotGlb({ actor }: { actor: DirectorActor }) {
  const gltf = useLoader(GLTFLoader, ROBOT_GLB_URL[actor.bodyId]);
  const clips = gltf.animations;
  const root = useMemo(() => {
    const cloned = cloneRobotScene(gltf.scene);
    fitImportedRobot(cloned);
    return cloned;
  }, [actor.id, gltf.scene]);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useLayoutEffect(() => {
    tintRobot(root, actor.color || '#4F8EF7');
    root.traverse((obj) => {
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) skinned.skeleton.pose();
    });
    const walk = actor.poseId === 'walk' && clips.length > 0;
    const mixer = walk ? new THREE.AnimationMixer(root) : null;
    mixerRef.current = mixer;
    if (mixer) mixer.clipAction(clips[0]).reset().play();
    else if (actor.poseId === 'stand' && !isProceduralRobot(root)) hangMixamoStand(root);
    else if (isProceduralRobot(root)) applyRobotPose(root, actor.poseId);
    return () => {
      mixer?.stopAllAction();
      mixer?.uncacheRoot(root);
      mixerRef.current = null;
    };
  }, [actor.color, actor.poseId, clips, root]);

  useFrame((_, dt) => {
    mixerRef.current?.update(dt);
  });

  return <primitive object={root} />;
}

function StageLights() {
  return (
    <>
      <hemisphereLight args={['#d5e4f7', '#161820', 1.05]} />
      <directionalLight
        position={[3.2, 6.5, 4]}
        intensity={1.35}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 3.4, -2.2]} intensity={0.42} />
      <pointLight position={[0.2, 2.5, 2.4]} intensity={0.4} color="#9bd7ff" />
    </>
  );
}

function ShotFrustum() {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, 0, -0.55, 0.32, -1.4, 0, 0, 0, 0.55, 0.32, -1.4, 0, 0, 0, -0.55, -0.32, -1.4, 0, 0, 0, 0.55, -0.32,
          -1.4, -0.55, 0.32, -1.4, 0.55, 0.32, -1.4, 0.55, 0.32, -1.4, 0.55, -0.32, -1.4, 0.55, -0.32, -1.4, -0.55,
          -0.32, -1.4, -0.55, -0.32, -1.4, -0.55, 0.32, -1.4,
        ]),
        3,
      ),
    );
    return g;
  }, []);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#60a5fa" />
    </lineSegments>
  );
}

function lookAtQuaternion(position: THREE.Vector3, target: THREE.Vector3, roll = 0): THREE.Quaternion {
  const m = new THREE.Matrix4();
  m.lookAt(position, target, new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  return q;
}

function ShotRig({
  shot,
  selected,
  hideHelpers,
  suppressTransform,
  onSelect,
  register,
  gizmoRef,
}: {
  shot: DirectorShotCamera;
  selected: boolean;
  hideHelpers: boolean;
  suppressTransform: boolean;
  onSelect: () => void;
  register: (id: string, obj: THREE.Object3D | null) => void;
  gizmoRef: React.MutableRefObject<TransformControls | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pos = new THREE.Vector3(...shot.position);
  const tgt = new THREE.Vector3(...shot.target);
  const q = lookAtQuaternion(pos, tgt, shot.roll || 0);
  const accent = selected ? '#fde047' : '#d4a017';

  useLayoutEffect(() => {
    register(shot.id, groupRef.current);
    return () => {
      const gizmo = gizmoRef.current;
      if (gizmo?.object === groupRef.current) gizmo.detach();
      register(shot.id, null);
    };
  }, [gizmoRef, register, shot.id]);

  return (
    <group
      ref={groupRef}
      visible={!!shot.visible && !hideHelpers}
      {...(suppressTransform ? {} : { position: shot.position, quaternion: q })}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.18, 0.4]} />
        <Plastic color={accent} roughness={0.38} metalness={0.35} />
      </mesh>
      <mesh position={[0.12, 0.02, 0.02]} castShadow>
        <boxGeometry args={[0.08, 0.14, 0.28]} />
        <Plastic color="#1c1c22" roughness={0.42} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.16, 0.04]}>
        <boxGeometry args={[0.12, 0.08, 0.16]} />
        <Plastic color="#2a2a32" roughness={0.4} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0, -0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.1, 0.22, 20]} />
        <Plastic color="#2f3138" roughness={0.28} metalness={0.62} />
      </mesh>
      <mesh position={[0, 0, -0.44]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.08, 20]} />
        <Plastic color="#67e8f9" roughness={0.12} metalness={0.85} emissive="#164e63" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0.1, 0.12, -0.04]}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <Plastic color="#ef4444" roughness={0.3} metalness={0.2} emissive="#ef4444" emissiveIntensity={0.9} />
      </mesh>
      {selected ? <ShotFrustum /> : null}
    </group>
  );
}

function PrimitiveMesh({ actor }: { actor: DirectorActor }) {
  const c = actor.color || '#7dd3fc';
  const id = actor.primitiveId || 'cube';
  if (id === 'sphere') {
    return (
      <mesh castShadow position={[0, 0.48, 0]}>
        <sphereGeometry args={[0.48, 32, 24]} />
        <Plastic color={c} roughness={0.26} metalness={0.48} />
      </mesh>
    );
  }
  if (id === 'cylinder') {
    return (
      <mesh castShadow position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 1.04, 32]} />
        <Plastic color={c} roughness={0.28} metalness={0.46} />
      </mesh>
    );
  }
  if (id === 'torus') {
    return (
      <mesh castShadow position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.13, 18, 48]} />
        <Plastic color={c} roughness={0.26} metalness={0.5} />
      </mesh>
    );
  }
  if (id === 'cone') {
    return (
      <mesh castShadow position={[0, 0.52, 0]}>
        <coneGeometry args={[0.42, 1.04, 28]} />
        <Plastic color={c} roughness={0.3} metalness={0.44} />
      </mesh>
    );
  }
  if (id === 'pyramid') {
    return (
      <mesh castShadow position={[0, 0.52, 0]}>
        <coneGeometry args={[0.5, 1.04, 4]} />
        <Plastic color={c} roughness={0.32} metalness={0.4} />
      </mesh>
    );
  }
  return (
    <mesh castShadow position={[0, 0.38, 0]}>
      <boxGeometry args={[0.76, 0.76, 0.76]} />
      <Plastic color={c} roughness={0.3} metalness={0.46} />
    </mesh>
  );
}

function EmptyMarker() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.055, 14, 12]} />
        <meshBasicMaterial color="#f4f4f5" />
      </mesh>
      <group rotation={[0, 0, -Math.PI / 2]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.36, 8]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <coneGeometry args={[0.04, 0.1, 10]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      </group>
      <group>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.36, 8]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <coneGeometry args={[0.04, 0.1, 10]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      </group>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.36, 8]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <coneGeometry args={[0.04, 0.1, 10]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
      </group>
    </group>
  );
}

function SelectionRing({ actor, groundY }: { actor: DirectorActor; groundY: number }) {
  const footprint = Math.max(actor.scale[0], actor.scale[2]);
  const r = Math.max(
    0.16,
    actor.kind === 'empty' ? 0.22 * footprint : actor.kind === 'primitive' ? 0.48 * footprint : 0.4 * footprint,
  );
  return (
    <group position={[actor.position[0], groundY + 0.014, actor.position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[r * 0.78, r, 64]} />
        <meshBasicMaterial color="#5b9fff" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <circleGeometry args={[r * 0.78, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ActorRig({
  actor,
  selected,
  hideHelpers,
  suppressTransform,
  onSelect,
  register,
  gizmoRef,
}: {
  actor: DirectorActor;
  selected: boolean;
  hideHelpers: boolean;
  suppressTransform: boolean;
  onSelect: () => void;
  register: (id: string, obj: THREE.Object3D | null) => void;
  gizmoRef: React.MutableRefObject<TransformControls | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    register(actor.id, groupRef.current);
    return () => {
      const gizmo = gizmoRef.current;
      if (gizmo?.object === groupRef.current) gizmo.detach();
      register(actor.id, null);
    };
  }, [actor.id, gizmoRef, register]);

  return (
    <group
      ref={groupRef}
      visible={actor.visible !== false}
      {...(suppressTransform
        ? {}
        : { position: actor.position, rotation: actor.rotation, scale: actor.scale })}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {actor.kind === 'primitive' ? (
        <PrimitiveMesh actor={actor} />
      ) : actor.kind === 'empty' ? (
        <EmptyMarker />
      ) : (
        <RobotLoadErrorBoundary>
          <Suspense fallback={null}>
            <RobotGlb key={`${actor.bodyId}-${actor.poseId}`} actor={actor} />
          </Suspense>
        </RobotLoadErrorBoundary>
      )}
      {selected && !hideHelpers && actor.kind !== 'mannequin' ? (
        <mesh position={[0, actor.kind === 'empty' ? 0.12 : 0.42, 0]}>
          <boxGeometry args={actor.kind === 'empty' ? [0.55, 0.55, 0.55] : [0.9, 0.9, 0.9]} />
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.45} />
        </mesh>
      ) : null}
    </group>
  );
}

function PanoramaSphere({
  url,
  yawDeg,
  radius,
}: {
  url: string;
  yawDeg: number;
  radius: number;
}) {
  const [map, setMap] = React.useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setMap(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    let cancelled = false;
    loader.load(
      url,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        setMap(tex);
      },
      undefined,
      () => {
        if (!cancelled) setMap(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    return () => {
      map?.dispose();
    };
  }, [map]);

  if (!map) return null;
  const yaw = (yawDeg * Math.PI) / 180;
  return (
    <mesh scale={[-1, 1, 1]} rotation={[0, yaw, 0]}>
      <sphereGeometry args={[Math.max(8, radius), 48, 32]} />
      <meshBasicMaterial map={map} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

function ActorLabels({
  scene,
  hideHelpers,
  overlayRef,
}: {
  scene: DirectorScene;
  hideHelpers: boolean;
  overlayRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { camera, gl } = useThree();
  const world = scene.world;
  const scale = world.scalePercent / 100;
  const euler = new THREE.Euler(
    (world.rotation[0] * Math.PI) / 180,
    (world.rotation[1] * Math.PI) / 180,
    (world.rotation[2] * Math.PI) / 180,
  );

  useFrame(() => {
    const root = overlayRef.current;
    if (!root) return;
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    const show = scene.environment.showLabels && !hideHelpers;
    root.querySelectorAll<HTMLElement>('[data-actor-label]').forEach((el) => {
      const id = el.getAttribute('data-actor-label') || '';
      const actor = scene.actors.find((a) => a.id === id);
      if (!show || !actor || actor.visible === false) {
        el.style.display = 'none';
        return;
      }
      const v = new THREE.Vector3(
        actor.position[0],
        actor.position[1] + 1.85 * actor.scale[1],
        actor.position[2],
      );
      v.multiplyScalar(scale);
      v.applyEuler(euler);
      v.add(new THREE.Vector3(world.pan[0], world.pan[1], world.pan[2]));
      v.project(camera);
      if (v.z > 1) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.style.transform = `translate(-50%, -120%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
    });
  });

  return null;
}

function OrbitRig({
  scene,
  gizmoDragging,
  onSceneChange,
  onSceneCommit,
  resetRef,
  frameRef,
}: {
  scene: DirectorScene;
  gizmoDragging: boolean;
  onSceneChange: (next: DirectorScene) => void;
  onSceneCommit: () => void;
  resetRef: React.MutableRefObject<(() => void) | null>;
  frameRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const userOrbitRef = useRef(false);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;
  const onSceneCommitRef = useRef(onSceneCommit);
  onSceneCommitRef.current = onSceneCommit;
  const locked = scene.viewMode === 'camera';
  const lastOrbitKeyRef = useRef('');
  const skipApplyRef = useRef(false);
  const settlingRef = useRef(false);
  const prevCamRef = useRef(new THREE.Vector3());
  const commitCameraRef = useRef<() => void>(() => {});

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.92;
    controls.panSpeed = 0.85;
    controls.zoomSpeed = 1.7;
    const lim = orbitDistanceLimits(sceneRef.current.world.scalePercent);
    controls.minDistance = lim.min;
    controls.maxDistance = lim.max;
    controls.enablePan = true;
    controls.zoomToCursor = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controlsRef.current = controls;

    const orbitKeyFrom = (target: THREE.Vector3, sph: THREE.Spherical, fov: number) =>
      `${target.x},${target.y},${target.z}|${sph.radius}|${sph.phi}|${sph.theta}|${fov}`;

    const commitCamera = () => {
      const s = sceneRef.current;
      if (s.viewMode === 'camera') return;
      const orbit = getOrbitCamera(s);
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      skipApplyRef.current = true;
      lastOrbitKeyRef.current = orbitKeyFrom(controls.target, sph, (camera as THREE.PerspectiveCamera).fov);
      onSceneChangeRef.current({
        ...s,
        cameras: s.cameras.map((c) =>
          c.kind === 'orbit'
            ? {
                ...c,
                target: [controls.target.x, controls.target.y, controls.target.z],
                spherical: { radius: sph.radius, phi: sph.phi, theta: sph.theta },
              }
            : c,
        ),
        activeCameraId: orbit.id,
      });
      onSceneCommitRef.current();
    };
    commitCameraRef.current = commitCamera;

    const onStart = () => {
      userOrbitRef.current = true;
      settlingRef.current = false;
    };
    const onEnd = () => {
      userOrbitRef.current = false;
      settlingRef.current = true;
      prevCamRef.current.copy(camera.position);
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    resetRef.current = () => {
      const s = sceneRef.current;
      const def = defaultOrbitView(s.world.scalePercent);
      skipApplyRef.current = false;
      lastOrbitKeyRef.current = '';
      onSceneChangeRef.current({
        ...s,
        viewMode: 'director',
        cameras: s.cameras.map((c) => (c.kind === 'orbit' ? { ...c, ...def } : c)),
      });
      onSceneCommitRef.current();
    };

    frameRef.current = () => {
      const s = sceneRef.current;
      const sel = s.selectedIds[0];
      const actor = s.actors.find((a) => a.id === sel);
      const shot = listShotCameras(s).find((c) => c.id === sel);
      const target = actor
        ? actorLookAt(actor.position)
        : shot
          ? shot.target
          : defaultOrbitView(s.world.scalePercent).target;
      skipApplyRef.current = false;
      lastOrbitKeyRef.current = '';
      onSceneChangeRef.current({
        ...s,
        viewMode: 'director',
        cameras: s.cameras.map((c) => (c.kind === 'orbit' ? { ...c, target } : c)),
      });
      onSceneCommitRef.current();
    };

    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.dispose();
      controlsRef.current = null;
      resetRef.current = null;
      frameRef.current = null;
    };
  }, [camera, frameRef, gl, resetRef]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enabled = !gizmoDragging && !locked;
  }, [gizmoDragging, locked]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const lim = orbitDistanceLimits(scene.world.scalePercent);
    controls.minDistance = lim.min;
    controls.maxDistance = lim.max;
  }, [scene.world.scalePercent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls || locked) return;
      if (e.code === 'Space') {
        e.preventDefault();
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      if (e.code === 'Space') {
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [locked]);

  useFrame(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const s = sceneRef.current;
    const controls = controlsRef.current;
    if (s.viewMode === 'camera') {
      const shots = listShotCameras(s);
      const selShot =
        shots.find((c) => s.selectedIds.includes(c.id)) ||
        shots.find((c) => c.id === s.activeCameraId) ||
        shots[0];
      if (selShot) {
        persp.fov = selShot.fov;
        persp.position.set(...selShot.position);
        persp.lookAt(...selShot.target);
        if (selShot.roll) persp.rotateZ(selShot.roll);
        persp.updateProjectionMatrix();
      }
      if (controls) controls.enabled = false;
      lastOrbitKeyRef.current = '';
      settlingRef.current = false;
      return;
    }
    const orbit = getOrbitCamera(s);
    if (persp.fov !== orbit.fov) {
      persp.fov = orbit.fov;
      persp.updateProjectionMatrix();
    }
    if (!controls) return;

    controls.update();

    if (settlingRef.current) {
      const moved = camera.position.distanceToSquared(prevCamRef.current);
      prevCamRef.current.copy(camera.position);
      if (moved < 1e-8) {
        settlingRef.current = false;
        commitCameraRef.current();
      }
    }

    const orbitKey = `${orbit.target.join(',')}|${orbit.spherical.radius}|${orbit.spherical.phi}|${orbit.spherical.theta}|${orbit.fov}`;
    if (
      !userOrbitRef.current &&
      !settlingRef.current &&
      !gizmoDragging &&
      lastOrbitKeyRef.current !== orbitKey
    ) {
      if (skipApplyRef.current) {
        skipApplyRef.current = false;
        lastOrbitKeyRef.current = orbitKey;
      } else {
        controls.target.set(...orbit.target);
        const offset = new THREE.Vector3().setFromSpherical(
          new THREE.Spherical(orbit.spherical.radius, orbit.spherical.phi, orbit.spherical.theta),
        );
        camera.position.copy(controls.target).add(offset);
        lastOrbitKeyRef.current = orbitKey;
      }
    }
  });

  return null;
}


function CaptureBridge({
  apiRef,
  skyColor,
  aspect,
}: {
  apiRef: React.MutableRefObject<{ capturePng: () => Promise<Blob> } | null>;
  skyColor: string;
  aspect: DirectorScene['aspect'];
}) {
  const { gl, scene, camera, size } = useThree();

  useEffect(() => {
    gl.setClearColor(skyColor, 1);
  }, [gl, skyColor]);

  useEffect(() => {
    apiRef.current = {
      capturePng: () =>
        new Promise<Blob>((resolve, reject) => {
          const { width, height } = captureSizeForAspect(aspect);
          const prevPr = gl.getPixelRatio();
          const prevW = size.width;
          const prevH = size.height;
          const persp = camera as THREE.PerspectiveCamera;
          const prevAspect = persp.aspect;
          const prevPreserve = (gl as any).preserveDrawingBuffer;

          (gl as any).preserveDrawingBuffer = true;
          gl.setPixelRatio(1);
          gl.setSize(width, height, false);
          persp.aspect = width / height;
          persp.updateProjectionMatrix();
          gl.setClearColor(skyColor, 1);
          gl.clear();
          gl.render(scene, camera);

          gl.domElement.toBlob((blob) => {
            (gl as any).preserveDrawingBuffer = prevPreserve;
            gl.setPixelRatio(prevPr);
            gl.setSize(prevW, prevH, false);
            persp.aspect = prevAspect;
            persp.updateProjectionMatrix();
            gl.setClearColor(skyColor, 1);
            if (blob) resolve(blob);
            else reject(new Error('截图失败'));
          }, 'image/png');
        }),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, aspect, camera, gl, scene, size.height, size.width, skyColor]);

  return null;
}

function StageWorld({
  scene,
  tool,
  hideHelpers,
  livePanoramaUrl,
  onSceneChange,
  onSceneCommit,
  captureApiRef,
  overlayRef,
  resetRef,
  frameRef,
  gizmoBusyRef,
}: Props & {
  hideHelpers: boolean;
  captureApiRef: React.MutableRefObject<{ capturePng: () => Promise<Blob> } | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  resetRef: React.MutableRefObject<(() => void) | null>;
  frameRef: React.MutableRefObject<(() => void) | null>;
  gizmoBusyRef: React.MutableRefObject<boolean>;
}) {
  const [gizmoDragging, setGizmoDragging] = React.useState(false);
  const objectMap = useRef<Record<string, THREE.Object3D>>({});
  const worldGroupRef = useRef<THREE.Group>(null);
  const gizmoRef = useRef<TransformControls | null>(null);
  const register = useCallback((id: string, obj: THREE.Object3D | null) => {
    if (obj) objectMap.current[id] = obj;
    else delete objectMap.current[id];
  }, []);

  const selectId = useCallback(
    (id: string) => {
      if (scene.selectedIds.length === 1 && scene.selectedIds[0] === id) return;
      const isShot = listShotCameras(scene).some((c) => c.id === id);
      onSceneChange({
        ...scene,
        selectedIds: [id],
        activeCameraId: isShot ? id : scene.activeCameraId,
      });
      onSceneCommit();
    },
    [onSceneChange, onSceneCommit, scene],
  );

  const world = scene.world;
  const scale = world.scalePercent / 100;
  const worldRot: Vec3 = [
    (world.rotation[0] * Math.PI) / 180,
    (world.rotation[1] * Math.PI) / 180,
    (world.rotation[2] * Math.PI) / 180,
  ];
  const panoramaUrl = livePanoramaUrl || scene.environment.panoramaUrl;
  const shots = listShotCameras(scene);
  const liveId = gizmoDragging ? scene.selectedIds[0] || '' : '';

  return (
    <>
      <color attach="background" args={[scene.environment.skyColor]} />
      <StageLights />
      <group ref={worldGroupRef} position={world.pan} rotation={worldRot} scale={scale}>
        <PanoramaSphere
          url={panoramaUrl}
          yawDeg={scene.environment.sphereYaw}
          radius={scene.environment.sphereRadius}
        />
        {!hideHelpers && (
          <gridHelper args={[20, 20, '#1d4a7a', '#163252']} position={[0, scene.environment.groundHeight + 0.002, 0]} />
        )}
        {scene.environment.groundVisible ? (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, scene.environment.groundHeight, 0]} receiveShadow>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial
              color="#0c1220"
              roughness={1}
              metalness={0}
              transparent
              opacity={scene.environment.groundOpacity}
              depthWrite={scene.environment.groundOpacity > 0.85}
            />
          </mesh>
        ) : null}
        {scene.actors.map((actor) => (
          <ActorRig
            key={actor.id}
            actor={actor}
            selected={scene.selectedIds.includes(actor.id)}
            hideHelpers={hideHelpers}
            suppressTransform={liveId === actor.id}
            onSelect={() => selectId(actor.id)}
            register={register}
            gizmoRef={gizmoRef}
          />
        ))}
        {!hideHelpers
          ? scene.actors
              .filter((a) => a.visible !== false && scene.selectedIds.includes(a.id))
              .map((a) => (
                <SelectionRing key={`ring-${a.id}`} actor={a} groundY={scene.environment.groundHeight} />
              ))
          : null}
        {shots.map((shot) => (
          <ShotRig
            key={shot.id}
            shot={shot}
            selected={scene.selectedIds.includes(shot.id)}
            hideHelpers={hideHelpers}
            suppressTransform={liveId === shot.id}
            onSelect={() => selectId(shot.id)}
            register={register}
            gizmoRef={gizmoRef}
          />
        ))}
      </group>
      <DirectorSelectionGizmo
        scene={scene}
        tool={tool}
        hideHelpers={hideHelpers}
        objectMap={objectMap}
        gizmoRef={gizmoRef}
        onSceneChange={onSceneChange}
        onSceneCommit={onSceneCommit}
        onDragging={setGizmoDragging}
        busyRef={gizmoBusyRef}
      />
      <OrbitRig
        scene={scene}
        gizmoDragging={gizmoDragging}
        onSceneChange={onSceneChange}
        onSceneCommit={onSceneCommit}
        resetRef={resetRef}
        frameRef={frameRef}
      />
      <ActorLabels scene={scene} hideHelpers={hideHelpers} overlayRef={overlayRef} />
      <CaptureBridge apiRef={captureApiRef} skyColor={scene.environment.skyColor} aspect={scene.aspect} />
    </>
  );
}

const DirectorStageViewport = forwardRef<DirectorStageViewportHandle, Props>(
  function DirectorStageViewport(
    { scene, tool, livePanoramaUrl, onSceneChange, onSceneCommit },
    ref,
  ) {
    const [hideHelpers, setHideHelpers] = React.useState(false);
    const captureApiRef = useRef<{ capturePng: () => Promise<Blob> } | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const resetRef = useRef<(() => void) | null>(null);
    const frameRef = useRef<(() => void) | null>(null);
    const gizmoBusyRef = useRef(false);

    useImperativeHandle(
      ref,
      () => ({
        capturePng: async () => {
          setHideHelpers(true);
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          const api = captureApiRef.current;
          if (!api) {
            setHideHelpers(false);
            throw new Error('舞台未就绪');
          }
          try {
            return await api.capturePng();
          } finally {
            setHideHelpers(false);
          }
        },
        resetView: () => resetRef.current?.(),
        frameSelection: () => frameRef.current?.(),
      }),
      [],
    );

    const labels = useMemo(
      () => scene.actors.filter((a) => a.visible !== false),
      [scene.actors],
    );
    const orbit = getOrbitCamera(scene);

    return (
      <div className="pg-ds-viewport">
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: false }}
          camera={{
            fov: orbit.fov || DIRECTOR_EDITOR_FOV,
            near: 0.1,
            far: 200,
            position: orbitCameraPosition(orbit),
          }}
          onPointerMissed={() => {
            if (gizmoBusyRef.current) return;
            if (!scene.selectedIds.length) return;
            onSceneChange({ ...scene, selectedIds: [] });
            onSceneCommit();
          }}
          shadows
        >
          <StageWorld
            scene={scene}
            tool={tool}
            livePanoramaUrl={livePanoramaUrl}
            hideHelpers={hideHelpers}
            onSceneChange={onSceneChange}
            onSceneCommit={onSceneCommit}
            captureApiRef={captureApiRef}
            overlayRef={overlayRef}
            resetRef={resetRef}
            frameRef={frameRef}
            gizmoBusyRef={gizmoBusyRef}
          />
        </Canvas>
        <div className="pg-ds-labels" ref={overlayRef} aria-hidden>
          {labels.map((a) => (
            <div key={a.id} className="pg-ds-label" data-actor-label={a.id}>
              {a.name}
            </div>
          ))}
        </div>
      </div>
    );
  },
);

export default DirectorStageViewport;
