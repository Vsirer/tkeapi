/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 导演台工作流节点：缩略图 / 空态 / 打开舞台。禁止 three。
 */
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from '../PlaygroundToast';
import { ExpandOutlined, Tooltip } from '../../ui';
import { useCanvas } from '../../context/PlaygroundContext';
import type { AdvancedNodeProps } from './shared/types';
import NodeMoreMenu, { getNodeDisplayTitle } from './shared/NodeMoreMenu';
import NodeTitleInline from './shared/NodeTitleInline';
import NodeConnectors from './shared/NodeConnectors';
import { FlowIconDirector } from '../flow/flowIcons';
import { useClickUnlessDrag } from '../../utils/clickUnlessDrag';
import { uploadResourceFileDetailed } from '../../utils/referenceUpload';
import generateUUID from '../../../../../utils/uuid';
import {
  DIRECTOR_MAX_CAPTURES,
  DIRECTOR_OPEN_EVENT,
  DIRECTOR_PANORAMA_HANDLE,
  cloneDirectorScene,
  collectDirectorDownstreamUrls,
  directorPanoramaSourceId,
  directorSceneEqual,
  getDirectorActiveFile,
  listDirectorFiles,
  normalizeDirectorScene,
  type DirectorCaptureFile,
  type DirectorPoseId,
  type DirectorScene,
  type DirectorStageLabels,
} from '../director_stage/directorScene';
import { getResultDisplayUrl } from '../../utils/resultExtractor';

const DirectorStageApp = React.lazy(() => import('../director_stage/DirectorStageApp'));

function newCaptureId() {
  return `df_${generateUUID().replace(/-/g, '').slice(0, 12)}`;
}

function IconTrash({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function buildResultData(files: DirectorCaptureFile[], activeId?: string) {
  if (!files.length) return { content: { image_url: '' } };
  const primary = (activeId ? files.find((f) => f.id === activeId) : null) || files[0];
  return {
    content: {
      image_url: primary.url,
      files: files.map((f) => ({
        id: f.id,
        url: f.url,
        kind: 'image' as const,
        file_name: f.fileName,
        resource_id: f.resource_id,
      })),
      active_file_id: primary.id,
    },
  };
}

const DirectorNode: React.FC<AdvancedNodeProps> = ({
  node,
  nodes,
  isLight,
  onRemove,
  updateNodeTaskData,
  setNodes,
  saveCanvasState,
  isSelected,
}) => {
  const { t } = useTranslation();
  const {
    connectingSourceId,
    setConnectingSourceId,
    setConnectingMousePos,
    canvasRef,
    canvasTransform,
  } = useCanvas();
  const [stageOpen, setStageOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const snapshotRef = useRef<DirectorScene>(normalizeDirectorScene(node.taskData?.scene));

  const defaultTitle = `导演台 ${node.id.split('-').pop()?.slice(-3) || '1'}`;
  const nodeTitle = getNodeDisplayTitle(node, defaultTitle);
  const files = useMemo(
    () => listDirectorFiles(node.taskData as Record<string, unknown> | undefined),
    [node.taskData],
  );
  const active = getDirectorActiveFile(
    node.taskData as Record<string, unknown> | undefined,
    node.resultData as Record<string, unknown> | undefined,
  );
  const activeFileId = active?.id || '';
  const activeIndex = Math.max(0, files.findIndex((f) => f.id === activeFileId));
  const hasMedia = files.length > 0;

  const showSockets =
    !!isSelected || hovered || !!(connectingSourceId && connectingSourceId !== node.id);
  const childConnected = useMemo(
    () => (nodes || []).some((n) => n.parentId === node.id && !n.isHidden),
    [nodes, node.id],
  );

  const panoramaSourceId = directorPanoramaSourceId(node);
  const panoramaConnected = useMemo(
    () => !!(panoramaSourceId && (nodes || []).some((n) => n.id === panoramaSourceId && !n.isHidden)),
    [nodes, panoramaSourceId],
  );

  const livePanoramaUrl = useMemo(() => {
    if (!panoramaSourceId) return '';
    const src = (nodes || []).find((n) => n.id === panoramaSourceId && !n.isHidden);
    if (!src) return '';
    const abs = (raw: string) => {
      if (!raw) return '';
      if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:') || raw.startsWith('blob:')) {
        return raw;
      }
      return `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
    };
    if (src.taskData?.node_type === 'director') {
      return collectDirectorDownstreamUrls(src, abs)[0] || '';
    }
    const files = Array.isArray(src.taskData?.files) ? src.taskData.files : [];
    for (const f of files) {
      const kind = String(f?.kind || f?.asset_type || '').toLowerCase();
      if (kind && kind !== 'image' && !String(f?.mime || '').startsWith('image/')) continue;
      const u = abs(String(f?.url || f?.file_url || ''));
      if (u) return u;
    }
    return abs(getResultDisplayUrl(src.type, src.resultData) || '');
  }, [nodes, panoramaSourceId]);

  const labels: DirectorStageLabels = useMemo(
    () => ({
      title: t('playground_2026:director_stage_title', '3D导演台'),
      send: t('playground_2026:director_send', '发送到画布'),
      sendFailed: t('playground_2026:director_send_failed', '发送失败'),
      maxCaptures: t('playground_2026:director_max', '最多 12 张构图'),
      close: t('playground_2026:director_close', '关闭'),
      collapse: t('playground_2026:director_collapse', '收起侧栏'),
      move: t('playground_2026:director_move', '移动'),
      rotate: t('playground_2026:director_rotate', '旋转'),
      scale: t('playground_2026:director_scale', '缩放'),
      frame: t('playground_2026:director_frame', '对准选中'),
      fov: t('playground_2026:director_fov', 'FOV'),
      webglError: t('playground_2026:director_webgl_error', '3D 舞台无法显示，请重新打开导演台'),
      reopen: t('playground_2026:director_open', '打开导演台'),
      viewDirector: t('playground_2026:director_view_director', '导演视角'),
      viewCamera: t('playground_2026:director_view_camera', '机位视角'),
      resetView: t('playground_2026:director_reset_view', '重置视角'),
      sceneTab: t('playground_2026:director_scene_tab', '场景'),
      searchPlaceholder: t('playground_2026:director_search', '请输入搜索内容'),
      sceneSection: t('playground_2026:director_scene_section', '3D场景'),
      sceneScale: t('playground_2026:director_scene_scale', '场景缩放'),
      scenePan: t('playground_2026:director_scene_pan', '场景平移'),
      sceneRotate: t('playground_2026:director_scene_rotate', '场景旋转'),
      panorama: t('playground_2026:director_panorama', '全景背景'),
      panoramaConnected: t('playground_2026:director_panorama_on', '已连接全景图'),
      panoramaHint: t('playground_2026:director_panorama_hint', '请将图片节点连接到导演台左侧输入口'),
      skyColor: t('playground_2026:director_sky', '天空颜色'),
      actorColor: t('playground_2026:director_actor_color', '角色颜色'),
      panoramaSphere: t('playground_2026:director_sphere', '全景球'),
      sphereYaw: t('playground_2026:director_sphere_yaw', '水平旋转'),
      sphereRadius: t('playground_2026:director_sphere_radius', '球形半径'),
      labelsToggle: t('playground_2026:director_labels', '角色标签'),
      gridSnap: t('playground_2026:director_grid_snap', '网格吸附'),
      groundSnap: t('playground_2026:director_ground_snap', '高斯地面吸附'),
      ground: t('playground_2026:director_ground', '地面'),
      opacity: t('playground_2026:director_opacity', '透明度'),
      height: t('playground_2026:director_height', '高度'),
      promptPlaceholder: t('playground_2026:director_prompt_ph', '描述想搭建的场景'),
      promptEmpty: t('playground_2026:director_prompt_empty', '未识别到可应用的场景描述'),
      promptApplied: t('playground_2026:director_prompt_ok', '已应用到舞台'),
      railScene: t('playground_2026:director_rail_scene', '场景'),
      railCharacters: t('playground_2026:director_rail_chars', '添加角色'),
      railCameras: t('playground_2026:director_rail_cams', '添加机位'),
      railPanorama: t('playground_2026:director_rail_pano', '全景图'),
      railAspect: t('playground_2026:director_aspect', '选择画幅比例'),
      railAi: t('playground_2026:director_rail_ai', 'AI 识图导入'),
      railHelp: t('playground_2026:director_rail_help', '帮助'),
      hide: t('playground_2026:director_hide', '隐藏'),
      lock: t('playground_2026:director_lock', '锁定'),
      emptyTab: t('playground_2026:director_empty_tab', '本页将在后续版本提供'),
      localUpload: t('playground_2026:director_local_upload', '本地上传'),
      panoramaHistory: t('playground_2026:director_pano_history', '历史记录'),
      panoramaAi: t('playground_2026:director_pano_ai', 'AI生成'),
      laterVersion: t('playground_2026:director_empty_tab', '本页将在后续版本提供'),
      crowdSoon: t('playground_2026:director_crowd', '群众 (3x3)'),
      geometrySoon: t('playground_2026:director_geometry', '几何模型'),
      crowdTitle: t('playground_2026:director_crowd_title', '添加群众阵列'),
      crowdRows: t('playground_2026:director_crowd_rows', '行数'),
      crowdCols: t('playground_2026:director_crowd_cols', '列数'),
      crowdSpacing: t('playground_2026:director_crowd_gap', '间距'),
      crowdTotal: t('playground_2026:director_crowd_total', '共{n}人'),
      cancel: t('playground_2026:director_cancel', '取消'),
      add: t('playground_2026:director_add', '添加'),
      addEmpty: t('playground_2026:director_empty_obj', '添加空对象'),
      uploadFile: t('playground_2026:director_upload_file', '上传文件'),
      capture: t('playground_2026:director_capture', '截图'),
      helpTitle: t('playground_2026:director_help_title', '帮助'),
      helpBody: t(
        'playground_2026:director_help_body',
        'Esc 关闭　V 移动　R 旋转　S 缩放　Delete 隐藏选中　⌘Z 撤销',
      ),
      aiDrop: t(
        'playground_2026:director_ai_drop',
        '点击上传图片或拖拽本地图片至此上传。上传后作为站位参考层插入导演台，不调用外部识图接口。',
      ),
      aiInsert: t('playground_2026:director_ai_insert', '插入当前导演台'),
      aiInsertHint: t(
        'playground_2026:director_ai_insert_hint',
        '作为站位参考层插入，不覆盖当前全景、角色和机位',
      ),
      aiCover: t('playground_2026:director_ai_cover', '覆盖当前导演台'),
      aiCoverHint: t(
        'playground_2026:director_ai_cover_hint',
        '作为站位参考层插入，覆盖当前全景、角色和机位',
      ),
      aiGenerate: t('playground_2026:director_ai_generate', '生成站位参考'),
      aiHint: t('playground_2026:director_ai_hint', '关闭不会中断上传。本版用本地图片作为全景参考，不调用外部识图。'),
      maxActors: t('playground_2026:director_max_actors', '角色数量已达上限'),
      maxShots: t('playground_2026:director_max_shots', '机位数量已达上限'),
      aspect: t('playground_2026:director_aspect', '选择画幅比例'),
      scrubAxis: t('playground_2026:director_scrub_axis', '左右拖动调整 {axis} 轴'),
      poses: {
        stand: t('playground_2026:director_pose_stand', '站立'),
        walk: t('playground_2026:director_pose_walk', '行走'),
        sit: t('playground_2026:director_pose_sit', '坐下'),
        squat: t('playground_2026:director_pose_squat', '蹲'),
        wave: t('playground_2026:director_pose_wave', '举手'),
        look_back: t('playground_2026:director_pose_look_back', '回头'),
        confront: t('playground_2026:director_pose_confront', '对峙'),
        point: t('playground_2026:director_pose_point', '指向'),
        arms_crossed: t('playground_2026:director_pose_arms_crossed', '抱臂'),
        think: t('playground_2026:director_pose_think', '思考'),
      } as Record<DirectorPoseId, string>,
      bodies: {
        male: t('playground_2026:director_body_male', '标准男性'),
        female: t('playground_2026:director_body_female', '标准女性'),
        athletic: t('playground_2026:director_body_athletic', '健硕'),
        slim: t('playground_2026:director_body_slim', '纤细'),
        teen: t('playground_2026:director_body_teen', '少年'),
        child: t('playground_2026:director_body_child', '儿童'),
        wide: t('playground_2026:director_body_wide', '宽厚'),
        chibi: t('playground_2026:director_body_chibi', '二头身'),
      },
      shots: {
        current_view: t('playground_2026:director_shot_current', '当前视角'),
        front_medium: t('playground_2026:director_shot_front_mid', '正面中景'),
        front_close: t('playground_2026:director_shot_front_close', '正面特写'),
        front_full: t('playground_2026:director_shot_front_full', '正面全景'),
        side_track: t('playground_2026:director_shot_side_track', '侧面跟拍'),
        side_close: t('playground_2026:director_shot_side_close', '侧面近景'),
        back_medium: t('playground_2026:director_shot_back_mid', '背面中景'),
        high_full: t('playground_2026:director_shot_high_full', '俯拍全景'),
        high_45: t('playground_2026:director_shot_high_45', '45° 俯拍'),
        low_angle: t('playground_2026:director_shot_low', '低角度仰拍'),
        low_wide: t('playground_2026:director_shot_low_wide', '低角度广角'),
        ots_left: t('playground_2026:director_shot_ots_l', '过肩镜头'),
        ots_right: t('playground_2026:director_shot_ots_r', '过肩镜头（右）'),
        birds_eye: t('playground_2026:director_shot_birds', '鸟瞰'),
        dutch: t('playground_2026:director_shot_dutch', '荷兰角'),
      },
      aspects: {
        auto: t('playground_2026:director_aspect_auto', '自适应'),
        '21:9': '21:9',
        '16:9': '16:9',
        '4:3': '4:3',
        '1:1': '1:1',
        '3:4': '3:4',
        '9:16': '9:16',
      },
      primitives: {
        cube: t('playground_2026:director_prim_cube', '立方体'),
        sphere: t('playground_2026:director_prim_sphere', '球体'),
        cylinder: t('playground_2026:director_prim_cylinder', '圆柱体'),
        torus: t('playground_2026:director_prim_torus', '环状体'),
        cone: t('playground_2026:director_prim_cone', '圆锥'),
        pyramid: t('playground_2026:director_prim_pyramid', '棱锥'),
      },
    }),
    [t],
  );

  const persistNode = useCallback(
    (
      patch: {
        files?: DirectorCaptureFile[];
        activeId?: string;
        scene?: DirectorScene;
      },
      save: boolean,
    ) => {
      setNodes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== node.id) return n;
          const prevFiles = listDirectorFiles(n.taskData as Record<string, unknown> | undefined);
          const nextFiles = patch.files !== undefined ? patch.files : prevFiles;
          const nextActive =
            patch.activeId ||
            (typeof n.taskData?.active_file_id === 'string' ? n.taskData.active_file_id : '') ||
            nextFiles[0]?.id ||
            '';
          const primary =
            (nextActive ? nextFiles.find((f) => f.id === nextActive) : null) || nextFiles[0] || null;
          const scene =
            patch.scene ||
            normalizeDirectorScene(n.taskData?.scene);
          return {
            ...n,
            type: 'image' as const,
            status: 'completed' as const,
            resultData: buildResultData(nextFiles, primary?.id),
            taskData: {
              ...(n.taskData || {}),
              node_type: 'director',
              files: nextFiles,
              active_file_id: primary?.id,
              scene,
              file_name: primary?.fileName,
              resource_id: primary?.resource_id,
            },
          };
        });
        if (save) saveCanvasState(next);
        return next;
      });
    },
    [node.id, saveCanvasState, setNodes],
  );

  const openStage = useCallback(() => {
    snapshotRef.current = cloneDirectorScene(normalizeDirectorScene(node.taskData?.scene));
    setStageOpen(true);
  }, [node.taskData?.scene]);

  const closeStage = useCallback(
    (nextScene: DirectorScene) => {
      setStageOpen(false);
      const normalized = normalizeDirectorScene(nextScene);
      if (!directorSceneEqual(normalized, snapshotRef.current)) {
        persistNode({ scene: normalized }, true);
      }
    },
    [persistNode],
  );

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (id === node.id) openStage();
    };
    window.addEventListener(DIRECTOR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DIRECTOR_OPEN_EVENT, onOpen);
  }, [node.id, openStage]);

  const handleSend = async (file: File, nextScene: DirectorScene) => {
    if (files.length >= DIRECTOR_MAX_CAPTURES) {
      toast.warning(t('playground_2026:director_max', '最多 12 张构图'));
      throw new Error('max');
    }
    const uploaded = await uploadResourceFileDetailed(file);
    if (!uploaded?.url) {
      toast.error(t('playground_2026:director_send_failed', '发送失败'));
      throw new Error('upload');
    }
    const item: DirectorCaptureFile = {
      id: newCaptureId(),
      url: uploaded.url,
      kind: 'image',
      fileName: file.name,
      resource_id: uploaded.resourceId,
    };
    persistNode(
      {
        files: [...files, item],
        activeId: item.id,
        scene: normalizeDirectorScene(nextScene),
      },
      true,
    );
    toast.success(t('playground_2026:director_sent', '已发送到画布'));
    setStageOpen(false);
  };

  const handleUploadPanorama = async (file: File) => {
    const uploaded = await uploadResourceFileDetailed(file);
    if (!uploaded?.url) {
      toast.error(t('playground_2026:director_send_failed', '发送失败'));
      throw new Error('upload');
    }
    return uploaded.url;
  };

  const selectActiveFile = (fileId: string) => {
    if (!fileId || fileId === activeFileId) return;
    persistNode({ activeId: fileId }, true);
  };

  const stepActiveFile = (dir: number) => {
    if (files.length < 2) return;
    const next = (activeIndex + dir + files.length) % files.length;
    selectActiveFile(files[next].id);
  };

  const removeItem = (id: string) => {
    const nextFiles = files.filter((f) => f.id !== id);
    const nextActive =
      id === activeFileId ? nextFiles[Math.min(activeIndex, nextFiles.length - 1)]?.id : activeFileId;
    persistNode({ files: nextFiles, activeId: nextActive }, true);
  };

  const startConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingSourceId(node.id);
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectingMousePos({
        x: (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
        y: (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
      });
    }
  };

  const openClick = useClickUnlessDrag(openStage);
  const theme = isLight ? 'light' : 'dark';

  return (
    <div
      className="pg-flow-asset-node"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="pg-flow-asset-node-chrome">
        <div className="pg-flow-asset-node-title-row">
          <FlowIconDirector size={14} />
          <NodeTitleInline
            nodeId={node.id}
            title={nodeTitle}
            onCommit={(next) => updateNodeTaskData({ label: next, node_title: next })}
          />
        </div>
        <NodeMoreMenu
          hideTrigger
          node={node}
          defaultTitle={defaultTitle}
          onRemove={onRemove}
          updateNodeTaskData={updateNodeTaskData}
          setNodes={setNodes}
          saveCanvasState={saveCanvasState}
        />
      </div>

      <NodeConnectors
        side="left"
        visible={showSockets}
        nodeId={node.id}
        nodeType="director"
        sockets={[
          {
            id: DIRECTOR_PANORAMA_HANDLE,
            label: t('playground_2026:director_panorama_socket', '全景图'),
            color: '#3b82f6',
            connected: panoramaConnected,
          },
        ]}
      />
      <NodeConnectors
        side="right"
        visible={showSockets}
        nodeId={node.id}
        nodeType="director"
        sockets={[
          {
            id: 'Image',
            color: '#f59e0b',
            connected: childConnected,
            onConnectStart: startConnect,
          },
        ]}
      />

      <div className={`pg-flow-asset-body${hasMedia ? ' has-media' : ''}`}>
        {hasMedia && active ? (
          <div className="pg-flow-asset-filled">
            <div className="pg-flow-asset-stack">
              <div
                className="pg-flow-asset-media"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  openStage();
                }}
              >
                <img src={active.url} alt="" draggable={false} />
                <div className="pg-flow-asset-media-actions">
                  <Tooltip title={t('playground_2026:director_open', '打开导演台')}>
                    <button
                      type="button"
                      aria-label={t('playground_2026:director_open', '打开导演台')}
                      onClick={(e) => {
                        e.stopPropagation();
                        openStage();
                      }}
                    >
                      <ExpandOutlined size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip title={t('playground_2026:director_delete_capture', '删除构图')}>
                    <button
                      type="button"
                      aria-label={t('playground_2026:director_delete_capture', '删除构图')}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(active.id);
                      }}
                    >
                      <IconTrash />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
            <button type="button" className="pg-flow-asset-add-more" {...openClick}>
              <FlowIconDirector size={16} />
              <span>{t('playground_2026:director_open', '打开导演台')}</span>
            </button>
          </div>
        ) : (
          <div className="pg-flow-asset-empty">
            <p className="pg-flow-asset-empty-title">
              {t('playground_2026:director_empty_hint', '在 3D 片场摆好构图后发送到画布')}
            </p>
            <p className="pg-flow-asset-empty-sub">
              {t('playground_2026:director_empty_sub', '可先连到参考图，发送后才会出现画面')}
            </p>
            <button type="button" className="pg-flow-asset-library-btn" {...openClick}>
              {t('playground_2026:director_open', '打开导演台')}
            </button>
          </div>
        )}
      </div>

      {files.length > 1 && (
        <div
          className="pg-flow-asset-switcher"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pg-flow-asset-switcher-row">
            <button
              type="button"
              className="pg-flow-asset-switcher-nav"
              aria-label="上一个"
              onClick={(e) => {
                e.stopPropagation();
                stepActiveFile(-1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="pg-flow-asset-switcher-thumbs">
              {files.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className={`pg-flow-asset-switcher-thumb${item.id === activeFileId ? ' is-active' : ''}`}
                  aria-label={`构图 ${idx + 1}`}
                  aria-pressed={item.id === activeFileId}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectActiveFile(item.id);
                  }}
                >
                  <img src={item.url} alt="" draggable={false} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pg-flow-asset-switcher-nav"
              aria-label="下一个"
              onClick={(e) => {
                e.stopPropagation();
                stepActiveFile(1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <div className="pg-flow-asset-switcher-meta">
            {activeIndex + 1} of {files.length}
          </div>
        </div>
      )}

      {stageOpen ? (
        <Suspense fallback={null}>
          <DirectorStageApp
            open
            theme={theme}
            scene={normalizeDirectorScene(node.taskData?.scene)}
            capturesPreview={files}
            livePanoramaUrl={livePanoramaUrl}
            onUploadPanorama={handleUploadPanorama}
            onSendToCanvas={handleSend}
            onClose={closeStage}
            t={labels}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default DirectorNode;
