/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 导演台全屏舞台入口：Portal 到 document.body；open=false 不挂载
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRightOutlined,
  BorderOutlined,
  Button,
  CloseOutlined,
  DragMoveOutlined,
  ExpandOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  LockOutlined,
  MenuOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  RotateRightOutlined,
  SearchOutlined,
  Slider,
  StarOutlined,
  Switch,
  Tooltip,
  UndoOutlined,
  UnlockOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '../../ui';
import toast from '../PlaygroundToast';
import './director_stage.css';
import { applyDirectorPrompt } from './directorPrompt';
import {
  addActorFromBody,
  addCrowd,
  addEmptyObject,
  addPrimitive,
  addShotFromPreset,
  applyAiImport,
  patchActorFlag,
  patchShotFlag,
} from './directorPresets';
import {
  DIRECTOR_ASPECTS,
  DIRECTOR_BODY_IDS,
  DIRECTOR_MAX_CAPTURES,
  DIRECTOR_SCENE_SCALE_MAX,
  DIRECTOR_SCENE_SCALE_MIN,
  DIRECTOR_POSE_IDS,
  DIRECTOR_PRIMITIVE_IDS,
  DIRECTOR_SHOT_PRESET_IDS,
  cloneDirectorScene,
  defaultOrbitView,
  directorSceneEqual,
  findActor,
  findShot,
  getOrbitCamera,
  listShotCameras,
  normalizeDirectorScene,
  type DirectorBodyId,
  type DirectorCaptureFile,
  type DirectorEnvironment,
  type DirectorPoseId,
  type DirectorPrimitiveId,
  type DirectorRailTab,
  type DirectorScene,
  type DirectorShotPresetId,
  type DirectorStageLabels,
  type DirectorTool,
  type DirectorViewMode,
  type DirectorWorld,
  type Vec3,
} from './directorScene';
import DirectorStageViewport, {
  type DirectorStageViewportHandle,
} from './DirectorStageViewport';

type Props = {
  open: boolean;
  theme: 'light' | 'dark';
  scene: DirectorScene;
  capturesPreview?: DirectorCaptureFile[];
  livePanoramaUrl?: string;
  onSceneChange?: (scene: DirectorScene) => void;
  onUploadPanorama?: (file: File) => Promise<string>;
  onSendToCanvas: (file: File, scene: DirectorScene) => void | Promise<void>;
  onClose: (scene: DirectorScene) => void;
  t: DirectorStageLabels;
};

const UNDO_MAX = 20;
const RAILS: Array<{ id: DirectorRailTab; Icon: React.FC<{ size?: number }> }> = [
  { id: 'scene', Icon: UnorderedListOutlined },
  { id: 'characters', Icon: UserOutlined },
  { id: 'cameras', Icon: VideoCameraOutlined },
  { id: 'panorama', Icon: PictureOutlined },
  { id: 'aspect', Icon: ExpandOutlined },
];

type ErrorBoundaryState = { hasError: boolean };

class StageErrorBoundary extends React.Component<
  { labels: DirectorStageLabels; onClose: () => void; children: React.ReactNode },
  ErrorBoundaryState & { nonce: number }
> {
  state: ErrorBoundaryState & { nonce: number } = { hasError: false, nonce: 0 };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="pg-ds-err">
          <p>{this.props.labels.webglError}</p>
          <Button
            type="primary"
            shape="round"
            size="middle"
            onClick={() => this.setState((s) => ({ hasError: false, nonce: s.nonce + 1 }))}
          >
            {this.props.labels.reopen}
          </Button>
        </div>
      );
    }
    return <React.Fragment key={this.state.nonce}>{this.props.children}</React.Fragment>;
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function XyzFields({
  value,
  onChange,
  onCommit,
  axisLabel,
}: {
  value: Vec3;
  onChange: (next: Vec3) => void;
  onCommit: () => void;
  axisLabel: (axis: string) => string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const dragRef = useRef<{ i: number; x: number; start: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next: Vec3 = [...valueRef.current];
      next[drag.i] = Math.round((drag.start + (e.clientX - drag.x) * 0.02) * 1000) / 1000;
      onChangeRef.current(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      onCommitRef.current();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <div className="pg-ds-xyz">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <React.Fragment key={axis}>
          <button
            type="button"
            className="pg-ds-scrub"
            aria-label={axisLabel(axis)}
            onPointerDown={(e) => {
              e.preventDefault();
              dragRef.current = { i, x: e.clientX, start: value[i] };
            }}
          >
            {axis}
          </button>
          <input
            type="number"
            step={0.1}
            value={round3(value[i])}
            onChange={(e) => {
              const next: Vec3 = [...value];
              next[i] = Number(e.target.value) || 0;
              onChange(next);
            }}
            onBlur={onCommit}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

function ScaleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 14v6h6" />
      <path d="M20 10V4h-6" />
      <path d="M4 20 20 4" />
    </svg>
  );
}

const DirectorStageApp: React.FC<Props> = ({
  open,
  theme,
  scene: sceneProp,
  capturesPreview,
  livePanoramaUrl,
  onSceneChange,
  onUploadPanorama,
  onSendToCanvas,
  onClose,
  t,
}) => {
  const [scene, setScene] = useState<DirectorScene>(() => normalizeDirectorScene(sceneProp));
  const [tool, setTool] = useState<DirectorTool>('translate');
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [rail, setRail] = useState<DirectorRailTab>('scene');
  const [query, setQuery] = useState('');
  const [prompt, setPrompt] = useState('');
  const [crowdOpen, setCrowdOpen] = useState(false);
  const [crowdRows, setCrowdRows] = useState(3);
  const [crowdCols, setCrowdCols] = useState(3);
  const [crowdGap, setCrowdGap] = useState(1.6);
  const [geoOpen, setGeoOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'insert' | 'cover'>('insert');
  const [aiBusy, setAiBusy] = useState(false);
  const viewportRef = useRef<DirectorStageViewportHandle>(null);
  const undoRef = useRef<DirectorScene[]>([]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    if (!open) return;
    const next = normalizeDirectorScene(sceneProp);
    setScene(next);
    undoRef.current = [cloneDirectorScene(next)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pushLive = useCallback(
    (next: DirectorScene) => {
      sceneRef.current = next;
      setScene(next);
      onSceneChange?.(next);
    },
    [onSceneChange],
  );

  const commitUndo = useCallback(() => {
    const cur = sceneRef.current;
    const stack = undoRef.current;
    const last = stack[stack.length - 1];
    if (last && directorSceneEqual(last, cur)) return;
    undoRef.current = [...stack, cloneDirectorScene(cur)].slice(-UNDO_MAX);
  }, []);

  const undo = useCallback(() => {
    const stack = undoRef.current;
    if (stack.length < 2) return;
    stack.pop();
    const prev = stack[stack.length - 1];
    if (prev) pushLive(cloneDirectorScene(prev));
  }, [pushLive]);

  const replaceScene = useCallback(
    (next: DirectorScene, commit = true) => {
      pushLive(next);
      if (commit) commitUndo();
    },
    [commitUndo, pushLive],
  );

  const patchEnv = (patch: Partial<DirectorEnvironment>, commit = true) => {
    replaceScene(
      { ...sceneRef.current, environment: { ...sceneRef.current.environment, ...patch } },
      commit,
    );
  };

  const patchWorld = (patch: Partial<DirectorWorld>, commit = true) => {
    replaceScene({ ...sceneRef.current, world: { ...sceneRef.current.world, ...patch } }, commit);
  };

  const setViewMode = (viewMode: DirectorViewMode) => {
    const s = sceneRef.current;
    if (s.viewMode === viewMode) return;
    let selectedIds = s.selectedIds;
    let activeCameraId = s.activeCameraId;
    if (viewMode === 'camera') {
      const shots = listShotCameras(s);
      const current = shots.find((c) => selectedIds.includes(c.id)) || shots[0];
      if (current) {
        selectedIds = [current.id];
        activeCameraId = current.id;
      }
    }
    replaceScene({ ...s, viewMode, selectedIds, activeCameraId });
  };

  const selectId = (id: string) => {
    const s = sceneRef.current;
    const shot = findShot(s, id);
    replaceScene({
      ...s,
      selectedIds: [id],
      activeCameraId: shot ? shot.id : s.activeCameraId,
    });
  };

  const setActorColor = (color: string, commit = false) => {
    const s = sceneRef.current;
    const id = s.selectedIds[0];
    const actor = findActor(s, id);
    if (!actor) return;
    replaceScene({
      ...s,
      actors: s.actors.map((a) => (a.id === actor.id ? { ...a, color } : a)),
    }, commit);
  };

  const setActorPose = (poseId: DirectorPoseId) => {
    const s = sceneRef.current;
    const id = s.selectedIds[0];
    const actor = findActor(s, id) || s.actors.find((a) => a.visible !== false);
    if (!actor) return;
    replaceScene({
      ...s,
      actors: s.actors.map((a) => (a.id === actor.id ? { ...a, poseId } : a)),
    });
  };

  const addBody = (bodyId: DirectorBodyId) => {
    const next = addActorFromBody(sceneRef.current, bodyId);
    if (!next) {
      toast.warning(t.maxActors);
      return;
    }
    replaceScene(next);
  };

  const addShot = (presetId: DirectorShotPresetId) => {
    const next = addShotFromPreset(sceneRef.current, presetId);
    if (!next) {
      toast.warning(t.maxShots);
      return;
    }
    replaceScene(next);
  };

  const addGeo = (id: DirectorPrimitiveId) => {
    const next = addPrimitive(sceneRef.current, id, t.primitives[id]);
    if (!next) {
      toast.warning(t.maxActors);
      return;
    }
    replaceScene(next);
  };

  const addEmpty = () => {
    const next = addEmptyObject(sceneRef.current, t.addEmpty);
    if (!next) {
      toast.warning(t.maxActors);
      return;
    }
    replaceScene(next);
  };

  const confirmCrowd = () => {
    const next = addCrowd(sceneRef.current, crowdRows, crowdCols, crowdGap);
    if (!next) {
      toast.warning(t.maxActors);
      return;
    }
    replaceScene(next);
    setCrowdOpen(false);
  };

  const later = () => toast.warning(t.laterVersion);

  const panoFileRef = useRef<HTMLInputElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);
  const uploadPano = async (file: File | undefined) => {
    if (!file || !onUploadPanorama) {
      later();
      return;
    }
    try {
      const url = await onUploadPanorama(file);
      if (!url) throw new Error('upload');
      patchEnv({ panoramaUrl: url });
    } catch {
      toast.error(t.sendFailed);
    }
  };

  const runAiImport = async (file: File | undefined) => {
    if (!file || !onUploadPanorama) {
      later();
      return;
    }
    setAiBusy(true);
    try {
      const url = await onUploadPanorama(file);
      if (!url) throw new Error('upload');
      replaceScene(applyAiImport(sceneRef.current, url, aiMode));
      setAiOpen(false);
    } catch {
      toast.error(t.sendFailed);
    }
    setAiBusy(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (aiOpen) {
          setAiOpen(false);
          return;
        }
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (crowdOpen) {
          setCrowdOpen(false);
          return;
        }
        onClose(sceneRef.current);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        e.stopPropagation();
        setTool('translate');
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        e.stopPropagation();
        setTool('rotate');
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        e.stopPropagation();
        setTool('scale');
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = sceneRef.current;
        const id = s.selectedIds[0];
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!id) return;
        if (findActor(s, id)) {
          replaceScene({
            ...s,
            actors: s.actors.filter((a) => a.id !== id),
            selectedIds: [],
          });
        } else if (findShot(s, id)) {
          replaceScene({
            ...s,
            cameras: s.cameras.filter((c) => c.id !== id),
            selectedIds: [],
          });
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, replaceScene, undo, aiOpen, helpOpen, crowdOpen]);

  const handleSend = async () => {
    if (sending) return;
    if ((capturesPreview?.length || 0) >= DIRECTOR_MAX_CAPTURES) {
      toast.warning(t.maxCaptures);
      return;
    }
    setSending(true);
    try {
      const blob = await viewportRef.current?.capturePng();
      if (!blob) throw new Error('截图失败');
      const file = new File([blob], `director-${scene.aspect.replace(':', 'x')}-${Date.now()}.png`, {
        type: 'image/png',
      });
      await onSendToCanvas(file, sceneRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg !== 'max' && msg !== 'upload') {
        toast.error(t.sendFailed);
      }
      setSending(false);
      return;
    }
    setSending(false);
  };

  const runPrompt = () => {
    const next = applyDirectorPrompt(sceneRef.current, prompt);
    if (!next) {
      toast.warning(t.promptEmpty);
      return;
    }
    replaceScene(next);
    toast.success(t.promptApplied);
  };

  const setCubeView = (phi: number, theta: number) => {
    const s = sceneRef.current;
    const orbit = defaultOrbitView(s.world.scalePercent);
    replaceScene({
      ...s,
      viewMode: 'director',
      cameras: s.cameras.map((c) =>
        c.kind === 'orbit'
          ? { ...c, spherical: { ...orbit.spherical, phi, theta }, target: orbit.target }
          : c,
      ),
    });
  };

  const shots = listShotCameras(scene);
  const q = query.trim().toLowerCase();
  const treeCameras = shots.filter((c) => !q || c.name.toLowerCase().includes(q));
  const treeActors = scene.actors.filter((a) => !q || a.name.toLowerCase().includes(q));
  const selectedActor = findActor(scene, scene.selectedIds[0] || '');
  const selectedShot = findShot(scene, scene.selectedIds[0] || '');
  const panoramaOn = !!(livePanoramaUrl || scene.environment.panoramaUrl);
  const railLabel: Record<DirectorRailTab, string> = {
    scene: t.railScene,
    characters: t.railCharacters,
    cameras: t.railCameras,
    panorama: t.railPanorama,
    aspect: t.railAspect,
  };
  const axisLabel = (axis: string) => t.scrubAxis.replace('{axis}', axis);

  if (!open) return null;

  return createPortal(
    <div className="pg-ds-root" data-theme={theme}>
      <div className="pg-ds-stage">
        <header className="pg-ds-header">
          <div className="pg-ds-header-left">
            <Tooltip title={t.close}>
              <button type="button" className="pg-ds-icon-btn" aria-label={t.close} onClick={() => onClose(sceneRef.current)}>
                <CloseOutlined size={16} />
              </button>
            </Tooltip>
            <span className="pg-ds-title">{t.title}</span>
            <Tooltip title={t.collapse}>
              <button
                type="button"
                className={`pg-ds-icon-btn${collapsed ? ' is-active' : ''}`}
                aria-label={t.collapse}
                onClick={() => setCollapsed((v) => !v)}
              >
                <MenuOutlined size={16} />
              </button>
            </Tooltip>
          </div>
          <div className="pg-ds-seg">
            <button
              type="button"
              className={scene.viewMode === 'director' ? 'is-active' : ''}
              onClick={() => setViewMode('director')}
            >
              {t.viewDirector}
            </button>
            <button
              type="button"
              className={scene.viewMode === 'camera' ? 'is-active' : ''}
              onClick={() => setViewMode('camera')}
            >
              {t.viewCamera}
            </button>
          </div>
          <div className="pg-ds-header-right">
            <Tooltip title={t.resetView}>
              <button
                type="button"
                className="pg-ds-icon-btn"
                aria-label={t.resetView}
                onClick={() => viewportRef.current?.resetView()}
              >
                <ReloadOutlined size={15} />
              </button>
            </Tooltip>
          </div>
        </header>

        <div className="pg-ds-body">
          <nav className="pg-ds-rail">
            {RAILS.map(({ id, Icon }) => (
              <Tooltip key={id} title={railLabel[id]} placement="right">
                <button
                  type="button"
                  className={rail === id && !aiOpen ? 'is-active' : ''}
                  aria-label={railLabel[id]}
                  onClick={() => {
                    setAiOpen(false);
                    setHelpOpen(false);
                    setRail(id);
                    if (collapsed) setCollapsed(false);
                  }}
                >
                  <Icon size={16} />
                </button>
              </Tooltip>
            ))}
            <Tooltip title={t.railAi} placement="right">
              <button
                type="button"
                className={aiOpen ? 'is-active' : ''}
                aria-label={t.railAi}
                onClick={() => {
                  setHelpOpen(false);
                  setAiOpen((v) => !v);
                  if (collapsed) setCollapsed(false);
                }}
              >
                <StarOutlined size={16} />
              </button>
            </Tooltip>
            <div className="pg-ds-rail-end">
              <Tooltip title={t.railHelp} placement="right">
                <button
                  type="button"
                  className={helpOpen ? 'is-active' : ''}
                  aria-label={t.railHelp}
                  aria-expanded={helpOpen}
                  onClick={() => {
                    setAiOpen(false);
                    setHelpOpen((v) => !v);
                  }}
                >
                  <InfoCircleOutlined size={16} />
                </button>
              </Tooltip>
            </div>
          </nav>

          {!collapsed ? (
            <aside className="pg-ds-tree">
              <div className="pg-ds-tree-head">{railLabel[rail]}</div>
              {rail === 'scene' ? (
                <>
                  <div className="pg-ds-search-wrap">
                    <input
                      className="pg-ds-search"
                      value={query}
                      placeholder={t.searchPlaceholder}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span className="pg-ds-search-icon">
                      <SearchOutlined size={14} />
                    </span>
                  </div>
                  <div className="pg-ds-tree-list">
                    {treeCameras.map((c) => (
                      <div
                        key={c.id}
                        className={`pg-ds-tree-row${c.visible === false ? ' is-hidden' : ''}`}
                      >
                        <button
                          type="button"
                          className={`pg-ds-tree-item${scene.selectedIds.includes(c.id) ? ' is-active' : ''}`}
                          onClick={() => selectId(c.id)}
                        >
                          <span className="pg-ds-tree-ico">
                            <VideoCameraOutlined size={14} />
                          </span>
                          {c.name}
                        </button>
                        <button
                          type="button"
                          className={`pg-ds-tree-mini${c.visible === false ? ' is-on' : ''}`}
                          aria-label={t.hide}
                          onClick={() => replaceScene(patchShotFlag(sceneRef.current, c.id, { visible: c.visible === false }))}
                        >
                          {c.visible === false ? <EyeInvisibleOutlined size={13} /> : <EyeOutlined size={13} />}
                        </button>
                        <button
                          type="button"
                          className={`pg-ds-tree-mini${c.locked ? ' is-on' : ''}`}
                          aria-label={t.lock}
                          onClick={() => replaceScene(patchShotFlag(sceneRef.current, c.id, { locked: !c.locked }))}
                        >
                          {c.locked ? <LockOutlined size={13} /> : <UnlockOutlined size={13} />}
                        </button>
                      </div>
                    ))}
                    {treeActors.map((a) => (
                      <div
                        key={a.id}
                        className={`pg-ds-tree-row${a.visible === false ? ' is-hidden' : ''}`}
                      >
                        <button
                          type="button"
                          className={`pg-ds-tree-item${scene.selectedIds.includes(a.id) ? ' is-active' : ''}`}
                          onClick={() => selectId(a.id)}
                        >
                          <span className="pg-ds-tree-ico">
                            {a.kind === 'primitive' || a.kind === 'empty' ? (
                              <BorderOutlined size={14} />
                            ) : (
                              <UserOutlined size={14} />
                            )}
                          </span>
                          {a.name}
                        </button>
                        <button
                          type="button"
                          className={`pg-ds-tree-mini${a.visible === false ? ' is-on' : ''}`}
                          aria-label={t.hide}
                          onClick={() => replaceScene(patchActorFlag(sceneRef.current, a.id, { visible: a.visible === false }))}
                        >
                          {a.visible === false ? <EyeInvisibleOutlined size={13} /> : <EyeOutlined size={13} />}
                        </button>
                        <button
                          type="button"
                          className={`pg-ds-tree-mini${a.locked ? ' is-on' : ''}`}
                          aria-label={t.lock}
                          onClick={() => replaceScene(patchActorFlag(sceneRef.current, a.id, { locked: !a.locked }))}
                        >
                          {a.locked ? <LockOutlined size={13} /> : <UnlockOutlined size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {rail === 'characters' ? (
                <div className="pg-ds-lib">
                  <button type="button" className="pg-ds-lib-row" onClick={later}>
                    <span className="pg-ds-tree-ico">
                      <UploadOutlined size={14} />
                    </span>
                    {t.localUpload}
                  </button>
                  {DIRECTOR_BODY_IDS.map((id) => (
                    <button key={id} type="button" className="pg-ds-lib-row" onClick={() => addBody(id)}>
                      <span className="pg-ds-tree-ico">
                        <UserOutlined size={14} />
                      </span>
                      {t.bodies[id]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`pg-ds-lib-row${crowdOpen ? ' is-active' : ''}`}
                    onClick={() => {
                      setGeoOpen(false);
                      setCrowdOpen((v) => !v);
                    }}
                  >
                    <span className="pg-ds-tree-ico">
                      <UserOutlined size={14} />
                    </span>
                    {t.crowdSoon}
                  </button>
                  {crowdOpen ? (
                    <div className="pg-ds-dialog" role="dialog" aria-labelledby="pg-ds-crowd-title">
                      <h3 id="pg-ds-crowd-title">{t.crowdTitle}</h3>
                      <div className="pg-ds-dialog-row">
                        <label>{t.crowdRows}</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={crowdRows}
                          onChange={(e) => setCrowdRows(Number(e.target.value) || 1)}
                        />
                      </div>
                      <div className="pg-ds-dialog-row">
                        <label>{t.crowdCols}</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={crowdCols}
                          onChange={(e) => setCrowdCols(Number(e.target.value) || 1)}
                        />
                      </div>
                      <div className="pg-ds-dialog-row">
                        <label>{t.crowdSpacing}</label>
                        <input
                          type="number"
                          min={0.4}
                          max={6}
                          step={0.1}
                          value={crowdGap}
                          onChange={(e) => setCrowdGap(Number(e.target.value) || 1.6)}
                        />
                      </div>
                      <p>{t.crowdTotal.replace('{n}', String(Math.max(1, crowdRows) * Math.max(1, crowdCols)))}</p>
                      <div className="pg-ds-dialog-actions">
                        <button type="button" onClick={() => setCrowdOpen(false)}>
                          {t.cancel}
                        </button>
                        <button type="button" className="is-primary" onClick={confirmCrowd}>
                          {t.add}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`pg-ds-lib-row${geoOpen ? ' is-active' : ''}`}
                    onClick={() => {
                      setCrowdOpen(false);
                      setGeoOpen((v) => !v);
                    }}
                  >
                    <span className="pg-ds-tree-ico">
                      <BorderOutlined size={14} />
                    </span>
                    {t.geometrySoon}
                  </button>
                  {geoOpen ? (
                    <div className="pg-ds-lib-sub">
                      <button type="button" className="pg-ds-lib-row" onClick={later}>
                        <span className="pg-ds-tree-ico">
                          <UploadOutlined size={14} />
                        </span>
                        {t.uploadFile}
                      </button>
                      {DIRECTOR_PRIMITIVE_IDS.map((id) => (
                        <button key={id} type="button" className="pg-ds-lib-row" onClick={() => addGeo(id)}>
                          <span className="pg-ds-tree-ico">
                            <BorderOutlined size={14} />
                          </span>
                          {t.primitives[id]}
                        </button>
                      ))}
                      <button type="button" className="pg-ds-lib-row" onClick={addEmpty}>
                        <span className="pg-ds-tree-ico">
                          <BorderOutlined size={14} />
                        </span>
                        {t.addEmpty}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {rail === 'cameras' ? (
                <div className="pg-ds-lib">
                  <div className="pg-ds-lib-grid">
                    {DIRECTOR_SHOT_PRESET_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`pg-ds-lib-card${id === 'current_view' ? ' is-on' : ''}`}
                        onClick={() => addShot(id)}
                      >
                        <VideoCameraOutlined size={14} />
                        {t.shots[id]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {rail === 'panorama' ? (
                <div className="pg-ds-lib">
                  <input
                    ref={panoFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      void uploadPano(file);
                    }}
                  />
                  <button
                    type="button"
                    className="pg-ds-lib-row"
                    onClick={() => (onUploadPanorama ? panoFileRef.current?.click() : later())}
                  >
                    <span className="pg-ds-tree-ico">
                      <UploadOutlined size={14} />
                    </span>
                    {t.localUpload}
                  </button>
                  <button type="button" className="pg-ds-lib-row" onClick={later}>
                    <span className="pg-ds-tree-ico">
                      <HistoryOutlined size={14} />
                    </span>
                    {t.panoramaHistory}
                  </button>
                  <button type="button" className="pg-ds-lib-row" onClick={later}>
                    <span className="pg-ds-tree-ico">
                      <StarOutlined size={14} />
                    </span>
                    {t.panoramaAi}
                  </button>
                </div>
              ) : null}

              {rail === 'aspect' ? (
                <div className="pg-ds-lib">
                  {DIRECTOR_ASPECTS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`pg-ds-lib-row${scene.aspect === id ? ' is-active' : ''}`}
                      onClick={() => replaceScene({ ...sceneRef.current, aspect: id })}
                    >
                      {t.aspects[id]}
                    </button>
                  ))}
                </div>
              ) : null}
            </aside>
          ) : null}

          <div className="pg-ds-center">
            <StageErrorBoundary labels={t} onClose={() => onClose(sceneRef.current)}>
              <DirectorStageViewport
                ref={viewportRef}
                scene={scene}
                tool={tool}
                livePanoramaUrl={livePanoramaUrl}
                onSceneChange={pushLive}
                onSceneCommit={commitUndo}
              />
            </StageErrorBoundary>

            <div className="pg-ds-viewcube">
              <div className="pg-ds-cube">
                <span />
                <button type="button" onClick={() => setCubeView(0.28, getOrbitCamera(scene).spherical.theta)}>
                  Y
                </button>
                <span />
                <button type="button" onClick={() => setCubeView(defaultOrbitView().spherical.phi, Math.PI / 2)}>
                  −X
                </button>
                <button type="button" onClick={() => setCubeView(defaultOrbitView().spherical.phi, 0)}>
                  Z
                </button>
                <button type="button" onClick={() => setCubeView(defaultOrbitView().spherical.phi, -Math.PI / 2)}>
                  X
                </button>
                <span />
                <button type="button" onClick={() => setCubeView(defaultOrbitView().spherical.phi, Math.PI)}>
                  −Z
                </button>
                <span />
              </div>
            </div>

            <div className="pg-ds-gizmo-bar">
              <Tooltip title={t.move} placement="left">
                <button
                  type="button"
                  className={`pg-ds-icon-btn${tool === 'translate' ? ' is-active' : ''}`}
                  onClick={() => setTool('translate')}
                >
                  <DragMoveOutlined size={16} />
                </button>
              </Tooltip>
              <Tooltip title={t.frame} placement="left">
                <button type="button" className="pg-ds-icon-btn" onClick={() => viewportRef.current?.frameSelection()}>
                  <SearchOutlined size={16} />
                </button>
              </Tooltip>
              <Tooltip title={t.rotate} placement="left">
                <button
                  type="button"
                  className={`pg-ds-icon-btn${tool === 'rotate' ? ' is-active' : ''}`}
                  onClick={() => setTool('rotate')}
                >
                  <RotateRightOutlined size={16} />
                </button>
              </Tooltip>
              <Tooltip title={t.scale} placement="left">
                <button
                  type="button"
                  className={`pg-ds-icon-btn${tool === 'scale' ? ' is-active' : ''}`}
                  onClick={() => setTool('scale')}
                >
                  <ScaleIcon />
                </button>
              </Tooltip>
            </div>

            <div className="pg-ds-dock">
              <div className="pg-ds-dock-tools">
                <Tooltip title={t.move}>
                  <button type="button" className="pg-ds-icon-btn" onClick={() => setTool('translate')}>
                    <DragMoveOutlined size={16} />
                  </button>
                </Tooltip>
                <Tooltip title={t.capture}>
                  <button
                    type="button"
                    className="pg-ds-icon-btn"
                    disabled={sending}
                    onClick={() => void handleSend()}
                  >
                    <VideoCameraOutlined size={16} />
                  </button>
                </Tooltip>
                <Tooltip title="Undo">
                  <button type="button" className="pg-ds-icon-btn" onClick={undo}>
                    <UndoOutlined size={16} />
                  </button>
                </Tooltip>
              </div>
              <form
                className="pg-ds-prompt"
                onSubmit={(e) => {
                  e.preventDefault();
                  runPrompt();
                }}
              >
                <PlusOutlined size={14} />
                <input
                  value={prompt}
                  placeholder={t.promptPlaceholder}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <button type="submit" className="pg-ds-prompt-send" aria-label={t.promptPlaceholder}>
                  <ArrowRightOutlined size={16} />
                </button>
              </form>
            </div>
          </div>

          <aside className="pg-ds-inspector">
            <div className="pg-ds-insp-block">
              <div className="pg-ds-insp-title">{t.sceneSection}</div>
              <div className="pg-ds-row">
                <label>{t.sceneScale}</label>
                <Slider
                  min={DIRECTOR_SCENE_SCALE_MIN}
                  max={DIRECTOR_SCENE_SCALE_MAX}
                  step={1}
                  value={scene.world.scalePercent}
                  onChange={(v) => patchWorld({ scalePercent: v }, false)}
                  onChangeComplete={commitUndo}
                  style={{ width: 120 }}
                />
                <span>{Math.round(scene.world.scalePercent)}%</span>
              </div>
              <div className="pg-ds-row">
                <label>{t.scenePan}</label>
              </div>
              <XyzFields
                value={scene.world.pan}
                onChange={(pan) => patchWorld({ pan }, false)}
                onCommit={commitUndo}
                axisLabel={axisLabel}
              />
              <div className="pg-ds-row">
                <label>{t.sceneRotate}</label>
              </div>
              <XyzFields
                value={scene.world.rotation}
                onChange={(rotation) => patchWorld({ rotation }, false)}
                onCommit={commitUndo}
                axisLabel={axisLabel}
              />
            </div>

            <div className="pg-ds-insp-block">
              <div className="pg-ds-insp-title">{t.panorama}</div>
              <div className={`pg-ds-drop${panoramaOn ? ' is-on' : ''}`}>
                {panoramaOn ? t.panoramaConnected : t.panoramaHint}
              </div>
              <div className="pg-ds-row">
                <label>{t.skyColor}</label>
                <input
                  type="color"
                  className="pg-ds-color"
                  value={scene.environment.skyColor}
                  onChange={(e) => patchEnv({ skyColor: e.target.value })}
                />
              </div>
            </div>

            <div className="pg-ds-insp-block">
              <div className="pg-ds-insp-title">{t.panoramaSphere}</div>
              <div className="pg-ds-row">
                <label>{t.sphereYaw}</label>
                <input
                  type="number"
                  value={Math.round(scene.environment.sphereYaw)}
                  onChange={(e) => patchEnv({ sphereYaw: Number(e.target.value) || 0 }, false)}
                  onBlur={commitUndo}
                  style={{ width: 64, height: 28, background: '#111', color: '#eee', border: '1px solid #2e2e2e', borderRadius: 4 }}
                />
              </div>
              <div className="pg-ds-row">
                <label>{t.sphereRadius}</label>
                <Slider
                  min={8}
                  max={120}
                  step={1}
                  value={scene.environment.sphereRadius}
                  onChange={(v) => patchEnv({ sphereRadius: v }, false)}
                  onChangeComplete={commitUndo}
                  style={{ width: 120 }}
                />
              </div>
            </div>

            <div className="pg-ds-insp-block">
              <div className="pg-ds-row">
                <label>{t.labelsToggle}</label>
                <Switch
                  size="small"
                  aria-label={t.labelsToggle}
                  checked={scene.environment.showLabels}
                  onChange={(v) => patchEnv({ showLabels: v })}
                />
              </div>
              <div className="pg-ds-row">
                <label>{t.gridSnap}</label>
                <Switch
                  size="small"
                  aria-label={t.gridSnap}
                  checked={scene.environment.gridSnap}
                  onChange={(v) => patchEnv({ gridSnap: v })}
                />
              </div>
              <div className="pg-ds-row">
                <label>{t.groundSnap}</label>
                <Switch
                  size="small"
                  aria-label={t.groundSnap}
                  checked={scene.environment.groundSnap}
                  onChange={(v) => patchEnv({ groundSnap: v })}
                />
              </div>
            </div>

            <div className="pg-ds-insp-block">
              <div className="pg-ds-row">
                <label>{t.ground}</label>
                <Switch
                  size="small"
                  aria-label={t.ground}
                  checked={scene.environment.groundVisible}
                  onChange={(v) => patchEnv({ groundVisible: v })}
                />
              </div>
              <div className="pg-ds-row">
                <label>{t.opacity}</label>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={scene.environment.groundOpacity}
                  onChange={(v) => patchEnv({ groundOpacity: v }, false)}
                  onChangeComplete={commitUndo}
                  style={{ width: 120 }}
                />
              </div>
              <div className="pg-ds-row">
                <label>{t.height}</label>
                <Slider
                  min={-2}
                  max={2}
                  step={0.05}
                  value={scene.environment.groundHeight}
                  onChange={(v) => patchEnv({ groundHeight: v }, false)}
                  onChangeComplete={commitUndo}
                  style={{ width: 120 }}
                />
              </div>
            </div>

            {selectedActor && selectedActor.kind === 'mannequin' ? (
              <div className="pg-ds-insp-block">
                <div className="pg-ds-insp-title">{selectedActor.name}</div>
                <div className="pg-ds-row">
                  <label>{t.actorColor}</label>
                  <input
                    type="color"
                    className="pg-ds-color"
                    value={selectedActor.color || '#4F8EF7'}
                    onChange={(e) => setActorColor(e.target.value)}
                    onBlur={commitUndo}
                  />
                </div>
                <div className="pg-ds-poses">
                  {DIRECTOR_POSE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`pg-ds-pose${selectedActor.poseId === id ? ' is-active' : ''}`}
                      onClick={() => setActorPose(id)}
                    >
                      {t.poses[id]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedShot ? (
              <div className="pg-ds-insp-block">
                <div className="pg-ds-insp-title">{selectedShot.name}</div>
                <div className="pg-ds-row">
                  <label>{t.fov}</label>
                  <Slider
                    min={20}
                    max={90}
                    step={1}
                    value={selectedShot.fov}
                    onChange={(v) => {
                      const s = sceneRef.current;
                      pushLive({
                        ...s,
                        cameras: s.cameras.map((c) => (c.id === selectedShot.id && c.kind === 'shot' ? { ...c, fov: v } : c)),
                      });
                    }}
                    onChangeComplete={commitUndo}
                    style={{ width: 120 }}
                  />
                  <span>{Math.round(selectedShot.fov)}</span>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
        {aiOpen ? (
          <div className="pg-ds-overlay" onClick={() => setAiOpen(false)}>
            <div
              className="pg-ds-sheet"
              role="dialog"
              aria-label={t.railAi}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pg-ds-insp-title">{t.railAi}</div>
              <input
                ref={aiFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void runAiImport(file);
                }}
              />
              <button type="button" className="pg-ds-lib-row" onClick={() => aiFileRef.current?.click()}>
                <span className="pg-ds-tree-ico">
                  <UploadOutlined size={14} />
                </span>
                {t.localUpload}
              </button>
              <button type="button" className="pg-ds-lib-row" onClick={later}>
                <span className="pg-ds-tree-ico">
                  <HistoryOutlined size={14} />
                </span>
                {t.panoramaHistory}
              </button>
              <button
                type="button"
                className="pg-ds-dropzone"
                onClick={() => aiFileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void runAiImport(e.dataTransfer.files?.[0]);
                }}
              >
                {t.aiDrop}
              </button>
              <button
                type="button"
                className={`pg-ds-choice${aiMode === 'insert' ? ' is-on' : ''}`}
                onClick={() => setAiMode('insert')}
              >
                {t.aiInsert}
                <small>{t.aiInsertHint}</small>
              </button>
              <button
                type="button"
                className={`pg-ds-choice${aiMode === 'cover' ? ' is-on' : ''}`}
                onClick={() => setAiMode('cover')}
              >
                {t.aiCover}
                <small>{t.aiCoverHint}</small>
              </button>
              <p>{t.aiHint}</p>
              <button
                type="button"
                className="pg-ds-lib-row is-active"
                disabled={aiBusy}
                onClick={() => aiFileRef.current?.click()}
              >
                {t.aiGenerate}
              </button>
              <button type="button" className="pg-ds-lib-row" onClick={() => setAiOpen(false)}>
                {t.close}
              </button>
            </div>
          </div>
        ) : null}
        {helpOpen ? (
          <div className="pg-ds-overlay" onClick={() => setHelpOpen(false)}>
            <div
              className="pg-ds-sheet pg-ds-help"
              role="dialog"
              aria-label={t.helpTitle}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pg-ds-insp-title">{t.helpTitle}</div>
              <p>{t.helpBody}</p>
              <button type="button" className="pg-ds-lib-row" onClick={() => setHelpOpen(false)}>
                {t.close}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export default DirectorStageApp;
