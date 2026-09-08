/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 导演台移动手柄：粗碰撞拾取 + 射线对轴拖。旋转/缩放仍走 TransformControls。
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { listShotCameras, type DirectorScene, type DirectorTool, type Vec3 } from './directorScene';

const AXIS_X = '#ff0000';
const AXIS_Y = '#00ff00';
const AXIS_Z = '#0000ff';
const AXIS_HOT = '#ffff00';
const AXIS_CENTER = '#f4f4f5';

const SHAFT_LEN = 0.72;
const SHAFT_R = 0.012;
const CONE_LEN = 0.18;
const CONE_R = 0.055;
const PICK_R = 0.1;
const CENTER_R = 0.042;
const CENTER_PICK_R = 0.09;
const ARM_PX_SQ = 9;

type AxisName = 'X' | 'Y' | 'Z' | 'XYZ';

const WORLD_DIR: Record<'X' | 'Y' | 'Z', THREE.Vector3> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

const _offsetA = new THREE.Vector3();
const _offsetB = new THREE.Vector3();
const _world = new THREE.Vector3();
const _local = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _dragPlane = new THREE.Plane();
const _hit = new THREE.Vector3();

/** drei AxisArrow.calculateOffset：射线与轴最近点，按下位移为 0。 */
function axisDragOffset(clickPoint: THREE.Vector3, axisDir: THREE.Vector3, rayOrigin: THREE.Vector3, rayDir: THREE.Vector3) {
  const e1 = axisDir.dot(axisDir);
  const e2 = axisDir.dot(clickPoint) - axisDir.dot(rayOrigin);
  const e3 = axisDir.dot(rayDir);
  if (Math.abs(e3) < 1e-8) return e1 === 0 ? 0 : -e2 / e1;
  _offsetA.copy(rayDir).multiplyScalar(e1 / e3).sub(axisDir);
  _offsetB.copy(rayDir).multiplyScalar(e2 / e3).add(rayOrigin).sub(clickPoint);
  const denom = _offsetA.dot(_offsetA);
  if (denom < 1e-10) return 0;
  return -_offsetA.dot(_offsetB) / denom;
}

/** 吸附位移增量，不把物体本身吸到格点上。 */
function snapAlong(current: number, start: number, enabled: boolean, step = 0.25) {
  if (!enabled) return current;
  return start + Math.round((current - start) / step) * step;
}

function gizmoAxisIsHorizontal(axis: string | null | undefined) {
  return axis === 'X' || axis === 'Z' || axis === 'XZ';
}

function snapLocalPosition(obj: THREE.Object3D, start: THREE.Vector3, axis: AxisName, enabled: boolean) {
  if (axis === 'XYZ' || axis.includes('X')) obj.position.x = snapAlong(obj.position.x, start.x, enabled);
  if (axis === 'XYZ' || axis.includes('Y')) obj.position.y = snapAlong(obj.position.y, start.y, enabled);
  if (axis === 'XYZ' || axis.includes('Z')) obj.position.z = snapAlong(obj.position.z, start.z, enabled);
}

function applyWorldPosition(obj: THREE.Object3D, world: THREE.Vector3) {
  const parent = obj.parent;
  obj.position.copy(parent ? parent.worldToLocal(_local.copy(world)) : world);
}

function paintAxis(mat: THREE.MeshBasicMaterial, base: string, hot: boolean) {
  mat.color.set(hot ? AXIS_HOT : base);
}

function AxisVisual({
  rotation,
  material,
}: {
  rotation: [number, number, number];
  material: THREE.MeshBasicMaterial;
}) {
  return (
    <group rotation={rotation}>
      <mesh position={[0, SHAFT_LEN / 2, 0]} material={material} renderOrder={1200} raycast={() => {}}>
        <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_LEN, 10]} />
      </mesh>
      <mesh position={[0, SHAFT_LEN + CONE_LEN / 2, 0]} material={material} renderOrder={1200} raycast={() => {}}>
        <coneGeometry args={[CONE_R, CONE_LEN, 12]} />
      </mesh>
    </group>
  );
}

export function DirectorSelectionGizmo({
  scene,
  tool,
  hideHelpers,
  objectMap,
  gizmoRef,
  onSceneChange,
  onSceneCommit,
  onDragging,
  busyRef,
}: {
  scene: DirectorScene;
  tool: DirectorTool;
  hideHelpers: boolean;
  objectMap: React.MutableRefObject<Record<string, THREE.Object3D>>;
  gizmoRef: React.MutableRefObject<TransformControls | null>;
  onSceneChange: (next: DirectorScene) => void;
  onSceneCommit: () => void;
  onDragging: (v: boolean) => void;
  busyRef: React.MutableRefObject<boolean>;
}) {
  const { camera, gl, scene: threeScene } = useThree();
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const hideRef = useRef(hideHelpers);
  hideRef.current = hideHelpers;
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;
  const onSceneCommitRef = useRef(onSceneCommit);
  onSceneCommitRef.current = onSceneCommit;
  const onDraggingRef = useRef(onDragging);
  onDraggingRef.current = onDragging;

  const rootRef = useRef<THREE.Group>(null);
  const pickerRef = useRef<THREE.Group>(null);
  const mats = React.useMemo(() => {
    const mk = (color: string) =>
      new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false });
    return { x: mk(AXIS_X), y: mk(AXIS_Y), z: mk(AXIS_Z), c: mk(AXIS_CENTER) };
  }, []);
  useEffect(
    () => () => {
      mats.x.dispose();
      mats.y.dispose();
      mats.z.dispose();
      mats.c.dispose();
    },
    [mats],
  );
  const raycaster = useRef(new THREE.Raycaster());
  const drag = useRef<{
    id: string;
    axis: AxisName;
    pointerId: number;
    armed: boolean;
    sx: number;
    sy: number;
    startLocal: THREE.Vector3;
    startWorld: THREE.Vector3;
    clickPoint: THREE.Vector3;
    axisDir: THREE.Vector3;
    planeHit: THREE.Vector3;
  } | null>(null);
  const hoverAxis = useRef<AxisName | null>(null);
  const tcListenRef = useRef(false);

  const targetObject = useCallback(() => {
    const id = sceneRef.current.selectedIds[0];
    return id ? objectMap.current[id] || null : null;
  }, [objectMap]);

  const writeObject = useCallback((id: string, obj: THREE.Object3D, axis: AxisName, start: THREE.Vector3) => {
    const s = sceneRef.current;
    const env = s.environment;
    const isActor = s.actors.some((a) => a.id === id);
    let x = start.x;
    let y = start.y;
    let z = start.z;
    if (axis === 'XYZ' || axis.includes('X')) x = obj.position.x;
    if (axis === 'XYZ' || axis.includes('Y')) y = obj.position.y;
    if (axis === 'XYZ' || axis.includes('Z')) z = obj.position.z;
    obj.position.set(x, y, z);
    snapLocalPosition(obj, start, axis, env.gridSnap);
    if (env.groundSnap && isActor && gizmoAxisIsHorizontal(axis)) obj.position.y = env.groundHeight;
    x = obj.position.x;
    y = obj.position.y;
    z = obj.position.z;

    const actor = s.actors.find((a) => a.id === id);
    if (actor) {
      onSceneChangeRef.current({
        ...s,
        actors: s.actors.map((a) =>
          a.id === id
            ? {
                ...a,
                position: [obj.position.x, obj.position.y, obj.position.z],
                rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                scale: [obj.scale.x, obj.scale.y, obj.scale.z],
              }
            : a,
        ),
      });
      onSceneCommitRef.current();
      return;
    }
    const shot = listShotCameras(s).find((c) => c.id === id);
    if (!shot) return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.quaternion);
    const dist = Math.max(0.4, new THREE.Vector3(...shot.position).distanceTo(new THREE.Vector3(...shot.target)));
    const target: Vec3 = [
      obj.position.x + forward.x * dist,
      obj.position.y + forward.y * dist,
      obj.position.z + forward.z * dist,
    ];
    onSceneChangeRef.current({
      ...s,
      cameras: s.cameras.map((c) =>
        c.id === id && c.kind === 'shot'
          ? { ...c, position: [obj.position.x, obj.position.y, obj.position.z], target }
          : c,
      ),
    });
    onSceneCommitRef.current();
  }, []);

  const setPointerRay = useCallback(
    (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      _ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.current.setFromCamera(_ndc, camera);
    },
    [camera, gl],
  );

  const hitPicker = useCallback(
    (ev: PointerEvent): { axis: AxisName; point: THREE.Vector3 } | null => {
      const pickers = pickerRef.current;
      if (!pickers || !rootRef.current?.visible) return null;
      setPointerRay(ev);
      const hits = raycaster.current.intersectObject(pickers, true);
      const hit = hits[0];
      const axis = hit?.object.userData.axis;
      if (axis !== 'X' && axis !== 'Y' && axis !== 'Z' && axis !== 'XYZ') return null;
      return { axis, point: hit.point.clone() };
    },
    [setPointerRay],
  );

  const paintHover = useCallback(
    (axis: AxisName | null) => {
      hoverAxis.current = axis;
      paintAxis(mats.x, AXIS_X, axis === 'X');
      paintAxis(mats.y, AXIS_Y, axis === 'Y');
      paintAxis(mats.z, AXIS_Z, axis === 'Z');
      paintAxis(mats.c, AXIS_CENTER, axis === 'XYZ');
    },
    [mats],
  );

  useEffect(() => {
    const gizmo = new TransformControls(camera);
    gizmo.setSize(0.85);
    gizmo.setColors(AXIS_X, AXIS_Y, AXIS_Z, AXIS_HOT);
    gizmo.showXY = false;
    gizmo.showYZ = false;
    gizmo.showXZ = false;
    const helper = gizmo.getHelper();
    threeScene.add(helper);
    gizmoRef.current = gizmo;

    const applyDrag = (session: NonNullable<typeof drag.current>, obj: THREE.Object3D) => {
      const env = sceneRef.current.environment;
      const isActor = sceneRef.current.actors.some((a) => a.id === session.id);
      snapLocalPosition(obj, session.startLocal, session.axis, env.gridSnap);
      if (env.groundSnap && isActor && gizmoAxisIsHorizontal(session.axis)) obj.position.y = env.groundHeight;
    };

    const endMove = () => {
      const session = drag.current;
      if (!session) return;
      drag.current = null;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      try {
        gl.domElement.releasePointerCapture(session.pointerId);
      } catch {
        /* already released */
      }
      paintHover(null);
      const obj = objectMap.current[session.id];
      if (obj && session.armed && obj.position.distanceToSquared(session.startLocal) > 1e-8) {
        writeObject(session.id, obj, session.axis, session.startLocal);
      } else if (obj) {
        obj.position.copy(session.startLocal);
      }
      onDraggingRef.current(false);
      queueMicrotask(() => {
        busyRef.current = false;
      });
    };

    const onMove = (ev: PointerEvent) => {
      const session = drag.current;
      if (!session) return;
      const obj = objectMap.current[session.id];
      if (!obj) return;
      if (!session.armed) {
        const dx = ev.clientX - session.sx;
        const dy = ev.clientY - session.sy;
        if (dx * dx + dy * dy < ARM_PX_SQ) return;
        session.armed = true;
      }
      setPointerRay(ev);
      const ray = raycaster.current.ray;
      if (session.axis === 'X' || session.axis === 'Y' || session.axis === 'Z') {
        const offset = axisDragOffset(session.clickPoint, session.axisDir, ray.origin, ray.direction);
        applyWorldPosition(obj, _world.copy(session.startWorld).addScaledVector(session.axisDir, offset));
      } else if (ray.intersectPlane(_dragPlane, _hit)) {
        applyWorldPosition(obj, _world.copy(session.startWorld).add(_hit).sub(session.planeHit));
      }
      applyDrag(session, obj);
    };

    const onUp = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      endMove();
    };

    const startMove = (ev: PointerEvent, hit: { axis: AxisName; point: THREE.Vector3 }, obj: THREE.Object3D, id: string) => {
      setPointerRay(ev);
      const ray = raycaster.current.ray;
      obj.getWorldPosition(_world);
      const startWorld = _world.clone();
      const axis = hit.axis;
      const axisDir = (axis === 'X' || axis === 'Y' || axis === 'Z' ? WORLD_DIR[axis] : WORLD_DIR.Y).clone();
      const clickPoint = startWorld.clone().addScaledVector(axisDir, hit.point.clone().sub(startWorld).dot(axisDir));
      const session = {
        id,
        axis,
        pointerId: ev.pointerId,
        armed: false,
        sx: ev.clientX,
        sy: ev.clientY,
        startLocal: obj.position.clone(),
        startWorld,
        clickPoint,
        axisDir,
        planeHit: new THREE.Vector3(),
      };
      if (axis === 'X' || axis === 'Y' || axis === 'Z') {
        session.axisDir.copy(axisDir);
      } else {
        camera.getWorldDirection(_camDir);
        _dragPlane.setFromNormalAndCoplanarPoint(_camDir, startWorld);
        if (!ray.intersectPlane(_dragPlane, session.planeHit)) session.planeHit.copy(hit.point);
        session.clickPoint.copy(session.planeHit);
      }
      drag.current = session;
      busyRef.current = true;
      paintHover(axis);
      onDraggingRef.current(true);
      try {
        gl.domElement.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    };

    const tcStart = {
      pos: new THREE.Vector3(),
      rot: new THREE.Euler(),
      scale: new THREE.Vector3(),
    };
    const onTcDragging = (event: { value?: unknown }) => {
      const dragging = !!event.value;
      onDraggingRef.current(dragging);
      const obj = gizmo.object;
      if (dragging && obj) {
        busyRef.current = true;
        tcStart.pos.copy(obj.position);
        tcStart.rot.copy(obj.rotation);
        tcStart.scale.copy(obj.scale);
        return;
      }
      queueMicrotask(() => {
        busyRef.current = false;
      });
      const id = sceneRef.current.selectedIds[0];
      if (!obj || !id || toolRef.current === 'translate') return;
      const moved =
        obj.position.distanceToSquared(tcStart.pos) > 1e-8 ||
        Math.abs(obj.rotation.x - tcStart.rot.x) +
          Math.abs(obj.rotation.y - tcStart.rot.y) +
          Math.abs(obj.rotation.z - tcStart.rot.z) >
          1e-6 ||
        obj.scale.distanceToSquared(tcStart.scale) > 1e-8;
      if (moved) writeObject(id, obj, 'XYZ', tcStart.pos);
    };
    gizmo.addEventListener('dragging-changed', onTcDragging);

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const s = sceneRef.current;
      if (s.viewMode === 'camera' || hideRef.current) return;
      if (toolRef.current !== 'translate') return;
      const obj = targetObject();
      const id = s.selectedIds[0];
      if (!obj || !id) return;
      const hit = hitPicker(ev);
      if (!hit) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      startMove(ev, hit, obj, id);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (drag.current) return;
      if (toolRef.current !== 'translate') return;
      paintHover(hitPicker(ev)?.axis || null);
    };

    const onClick = (ev: MouseEvent) => {
      if (!busyRef.current && !drag.current) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    gl.domElement.addEventListener('pointerdown', onPointerDown, true);
    gl.domElement.addEventListener('pointermove', onPointerMove);
    gl.domElement.addEventListener('click', onClick, true);

    return () => {
      endMove();
      gl.domElement.removeEventListener('pointerdown', onPointerDown, true);
      gl.domElement.removeEventListener('pointermove', onPointerMove);
      gl.domElement.removeEventListener('click', onClick, true);
      gizmo.removeEventListener('dragging-changed', onTcDragging);
      if (tcListenRef.current) {
        gizmo.disconnect();
        tcListenRef.current = false;
      }
      gizmo.detach();
      helper.removeFromParent();
      gizmo.dispose();
      gizmoRef.current = null;
    };
  }, [busyRef, camera, gl, gizmoRef, hitPicker, objectMap, paintHover, setPointerRay, targetObject, threeScene, writeObject]);

  useFrame(() => {
    const s = sceneRef.current;
    const id = s.selectedIds[0] || '';
    const actor = s.actors.find((a) => a.id === id);
    const shot = listShotCameras(s).find((c) => c.id === id);
    const locked = !!(actor?.locked || shot?.locked);
    const hidden = actor?.visible === false || shot?.visible === false;
    const obj = id ? objectMap.current[id] : null;
    const show = !!obj && !!obj.parent && !hideHelpers && !locked && !hidden && s.viewMode !== 'camera';
    const mode = tool === 'rotate' ? 'rotate' : tool === 'scale' ? 'scale' : 'translate';

    const root = rootRef.current;
    if (root) {
      const moveOn = show && mode === 'translate';
      root.visible = moveOn;
      if (moveOn && obj) {
        obj.getWorldPosition(root.position);
        root.quaternion.identity();
        const persp = camera as THREE.PerspectiveCamera;
        const dist = camera.position.distanceTo(root.position);
        const factor = dist * Math.min((1.9 * Math.tan(THREE.MathUtils.degToRad(persp.fov * 0.5))) / persp.zoom, 7);
        root.scale.setScalar((factor * 0.85) / 4);
      }
    }

    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    const helper = gizmo.getHelper?.();
    if (helper && helper.parent !== threeScene) threeScene.add(helper);
    if (mode === 'translate') {
      if (tcListenRef.current) {
        gizmo.disconnect();
        tcListenRef.current = false;
      }
      if (gizmo.object) gizmo.detach();
      gizmo.enabled = false;
      if (helper) helper.visible = false;
      return;
    }
    gizmo.setMode(mode);
    gizmo.setSpace('local');
    if (!tcListenRef.current) {
      gizmo.connect(gl.domElement);
      tcListenRef.current = true;
    }
    gizmo.setTranslationSnap(0);
    gizmo.setRotationSnap(s.environment.gridSnap ? Math.PI / 12 : 0);
    gizmo.setScaleSnap(s.environment.gridSnap ? 0.1 : 0);
    if (show && obj) {
      if (gizmo.object !== obj) gizmo.attach(obj);
    } else if (gizmo.object) {
      gizmo.detach();
    }
    if (helper) helper.visible = show;
    gizmo.enabled = show;
  });

  return (
    <group ref={rootRef} visible={false} frustumCulled={false}>
      <AxisVisual rotation={[0, 0, -Math.PI / 2]} material={mats.x} />
      <AxisVisual rotation={[0, 0, 0]} material={mats.y} />
      <AxisVisual rotation={[Math.PI / 2, 0, 0]} material={mats.z} />
      <mesh material={mats.c} renderOrder={1201} raycast={() => {}}>
        <octahedronGeometry args={[CENTER_R, 0]} />
      </mesh>
      <group ref={pickerRef}>
        <mesh userData={{ axis: 'X' }} rotation={[0, 0, -Math.PI / 2]} position={[(SHAFT_LEN + CONE_LEN) / 2, 0, 0]}>
          <cylinderGeometry args={[PICK_R, PICK_R, SHAFT_LEN + CONE_LEN, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh userData={{ axis: 'Y' }} position={[0, (SHAFT_LEN + CONE_LEN) / 2, 0]}>
          <cylinderGeometry args={[PICK_R, PICK_R, SHAFT_LEN + CONE_LEN, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh userData={{ axis: 'Z' }} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (SHAFT_LEN + CONE_LEN) / 2]}>
          <cylinderGeometry args={[PICK_R, PICK_R, SHAFT_LEN + CONE_LEN, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh userData={{ axis: 'XYZ' }}>
          <sphereGeometry args={[CENTER_PICK_R, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
