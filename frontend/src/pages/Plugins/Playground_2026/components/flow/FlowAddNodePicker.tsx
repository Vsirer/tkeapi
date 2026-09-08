/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流「选择节点」菜单（左栏 / 右键 / 空态 / 连接器点击共用）
 * 分组对齐 Imagine Flow：基础 / 图片 / 视频 / 音频 / 扩展；
 * 图片·视频下再按品牌分组，悬停右侧展开模型二级菜单。
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import type { PlaygroundModel } from '../../types';
import ModelLogoIcon from '../ModelLogoIcon';
import { RightOutlined } from '../../ui';
import {
  FlowIconAssets,
  FlowIconDirector,
  FlowIconImage,
  FlowIconPrompt,
  FlowIconUpload,
  FlowIconVideo,
} from './flowIcons';
import {
  addAdvancedNodeToCanvas,
  type NodeKey,
} from './WorkflowEmptyAddNode';
import {
  compatibleKeysForConnector,
  resolveInputHandleForLink,
  type ConnectorPickDetail,
} from '../../utils/flowConnectorCompat';
import { applyBoundAssetKindsOnConnect, findFreeInputHandle, findFreeHandleOnPort, findPortByHandle, isPortCompatibleWithSource, resolveModelIo } from '../../utils/schemeIo';
import { resolveConnectSourceMedia } from '../../utils/flowConnectDragHighlight';
import type { SchemePort } from '../../types';
import { filterModelsByKind } from '../../utils/flowDefaultModel';
import {
  compareModelsByBackendOrder,
  modelBrandLabel,
  sortBrandLabelsByMaxOrder,
} from '../../utils/sortModelsByScheme';
import { resolveModelLogoSrc } from '../../utils/modelLogo';
import { buildLocalFlowPicks } from '../../utils/deferredLocalUpload';
import { insertCanvasAssetsFromPicks } from '../../utils/insertCanvasAsset';
import {
  resolveWorkflowNodeLimit,
  workflowNodeLimitMessage,
} from '../../utils/workflowNodeLimit';
import {
  isVolcEnhanceUsable,
  volcEnhanceUnavailableMessage,
} from '../../utils/volcEnhanceAvailability';
import { isDirectorStageEnabled } from '../../utils/workflowBasicNodes';
import toast from '../PlaygroundToast';

export type FlowAddNodePickerState = {
  clientX: number;
  clientY: number;
  /** 有则落到该画布坐标；无则落到视口中央 */
  canvasX?: number;
  canvasY?: number;
  /** 从连接器点出：过滤可匹配类型并自动连线 */
  connectFrom?: ConnectorPickDetail;
} | null;

type Props = {
  state: FlowAddNodePickerState;
  onClose: () => void;
};

type MenuKey = NodeKey | 'upload';

type NodeItem = {
  kind: 'node';
  key: MenuKey;
  label: string;
  icon: React.ReactNode;
};

type ModelItem = {
  kind: 'model';
  id: string;
  nodeType: 'ai_image' | 'ai_video';
  model: PlaygroundModel;
  label: string;
  icon: React.ReactNode;
};

/** 图片/视频：按方案折叠，悬停展开模型列表（对齐 Imagine 二级菜单） */
type SchemeItem = {
  kind: 'scheme';
  id: string;
  label: string;
  icon: React.ReactNode;
  models: ModelItem[];
};

type SoonItem = {
  kind: 'soon';
  id: string;
  label: string;
  icon: React.ReactNode;
};

type MenuItem = NodeItem | ModelItem | SchemeItem | SoonItem;

type MenuGroup = {
  id: string;
  title: string;
  items: MenuItem[];
};

const IconEnhance = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
  </svg>
);

const IconPreview = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconAudio = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const ModelListIcon: React.FC<{ model: PlaygroundModel; fallback: React.ReactNode }> = ({
  model,
  fallback,
}) => {
  return (
    <ModelLogoIcon
      logo={model.logo}
      fallbackLetter={model.name || model.model_id}
      className="pg-flow-add-node-pop-logo"
      size={16}
    />
  );
};

function groupModelsByBrand(
  models: PlaygroundModel[],
  nodeType: 'ai_image' | 'ai_video',
  idPrefix: string,
  fallbackIcon: React.ReactNode,
): SchemeItem[] {
  const buckets = new Map<string, ModelItem[]>();
  for (const m of models) {
    const brand = modelBrandLabel(m);
    const list = buckets.get(brand) || [];
    list.push({
      kind: 'model',
      id: `${idPrefix}:${m.mid || m.model_id || m.name}`,
      nodeType,
      model: m,
      label: m.name || m.model_id || (nodeType === 'ai_video' ? '视频模型' : '图像模型'),
      icon: <ModelListIcon model={m} fallback={fallbackIcon} />,
    });
    buckets.set(brand, list);
  }
  const rankedBrands = sortBrandLabelsByMaxOrder(models, [...buckets.keys()]);
  return rankedBrands.map((brand) => {
    const modelItems = buckets.get(brand) || [];
    const sorted = [...modelItems].sort((a, b) => compareModelsByBackendOrder(a.model, b.model));
    const label = brand || '其他';
    return {
      kind: 'scheme' as const,
      id: `scheme:${idPrefix}:${label}`,
      label,
      icon: sorted[0]?.icon ?? fallbackIcon,
      models: sorted,
    };
  });
}

const FlowAddNodePicker: React.FC<Props> = ({ state, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{
    placeAt?: { x: number; y: number };
    connectFrom?: ConnectorPickDetail;
  } | null>(null);
  const { nodes, setNodes, maxZIndex, setMaxZIndex, canvasTransform } = useCanvas();
  const { saveCanvasState, advancedNodesConfig, models, storageStats } = usePlayground();
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [openSchemeId, setOpenSchemeId] = React.useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = React.useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!state) {
      setOpenSchemeId(null);
      setSubmenuPos(null);
    }
  }, [state]);

  const groups = useMemo((): MenuGroup[] => {
    const assetEnabled = advancedNodesConfig?.asset_enabled !== false;
    const allow = state?.connectFrom
      ? new Set(
          compatibleKeysForConnector(
            state.connectFrom.side,
            state.connectFrom.nodeType,
            state.connectFrom.handleId,
          ),
        )
      : null;

    const allowNode = (key: MenuKey) => {
      if (!allow) return true;
      if (key === 'upload') return allow.has('asset');
      return allow.has(key);
    };

    const addItems: MenuItem[] = (
      [
        {
          kind: 'node' as const,
          key: 'ai_video' as MenuKey,
          label: 'AI 视频生成',
          icon: <FlowIconVideo size={16} />,
          enabled: advancedNodesConfig?.ai_video_enabled !== false,
        },
        {
          kind: 'node' as const,
          key: 'ai_image' as MenuKey,
          label: 'AI 图像生成',
          icon: <FlowIconImage size={16} />,
          enabled: advancedNodesConfig?.ai_image_enabled !== false,
        },
        {
          kind: 'node' as const,
          key: 'asset' as MenuKey,
          label: '素材',
          icon: <FlowIconAssets size={16} />,
          enabled: assetEnabled,
        },
        {
          kind: 'node' as const,
          key: 'director' as MenuKey,
          label: '导演台',
          icon: <FlowIconDirector size={16} />,
          enabled: isDirectorStageEnabled(advancedNodesConfig),
        },
        {
          kind: 'node' as const,
          key: 'prompt' as MenuKey,
          label: '提示词',
          icon: <FlowIconPrompt size={16} />,
          enabled: advancedNodesConfig?.prompt_enabled !== false,
        },
        {
          kind: 'node' as const,
          key: 'preview' as MenuKey,
          label: '预览',
          icon: <IconPreview />,
          enabled: advancedNodesConfig?.preview_enabled !== false,
        },
      ] as Array<NodeItem & { enabled: boolean }>
    )
      .filter((it) => it.enabled && allowNode(it.key))
      .map(({ enabled: _e, ...rest }) => rest);

    const extensionItems: MenuItem[] = (
      [
        {
          kind: 'node' as const,
          key: 'upload' as MenuKey,
          label: '上传',
          icon: <FlowIconUpload size={16} />,
          enabled: assetEnabled,
        },
        {
          kind: 'node' as const,
          key: 'volc_enhance' as MenuKey,
          label: '火山画质增强',
          icon: <IconEnhance />,
          enabled: isVolcEnhanceUsable(advancedNodesConfig),
        },
      ] as Array<NodeItem & { enabled: boolean }>
    )
      .filter((it) => it.enabled && allowNode(it.key))
      .map(({ enabled: _e, ...rest }) => rest);

    const imageEnabled = advancedNodesConfig?.ai_image_enabled !== false && allowNode('ai_image');
    const videoEnabled = advancedNodesConfig?.ai_video_enabled !== false && allowNode('ai_video');
    const showAudio = !allow;

    const imageItems: MenuItem[] = imageEnabled
      ? groupModelsByBrand(
          filterModelsByKind(models || [], 'image'),
          'ai_image',
          'img',
          <FlowIconImage size={16} />,
        )
      : [];

    const videoItems: MenuItem[] = videoEnabled
      ? groupModelsByBrand(
          filterModelsByKind(models || [], 'video'),
          'ai_video',
          'vid',
          <FlowIconVideo size={16} />,
        )
      : [];

    const audioItems: MenuItem[] = showAudio
      ? [
          {
            kind: 'soon',
            id: 'audio_soon',
            label: '即将支持',
            icon: <IconAudio />,
          },
        ]
      : [];

    const next: MenuGroup[] = [];
    if (addItems.length) next.push({ id: 'add', title: '基础', items: addItems });
    if (imageEnabled) next.push({ id: 'image', title: '图片', items: imageItems });
    if (videoEnabled) next.push({ id: 'video', title: '视频', items: videoItems });
    if (showAudio) next.push({ id: 'audio', title: '音频', items: audioItems });
    if (extensionItems.length) next.push({ id: 'extension', title: '扩展', items: extensionItems });
    return next;
  }, [state?.connectFrom, advancedNodesConfig, models]);

  const openScheme = (schemeId: string, anchorEl: HTMLElement | null) => {
    setOpenSchemeId(schemeId);
    if (!anchorEl) {
      setSubmenuPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const submenuW = 248;
    const gap = 6;
    const spaceRight = window.innerWidth - rect.right;
    const openLeft = spaceRight < submenuW + 12;
    const left = openLeft
      ? Math.max(8, rect.left - submenuW - gap)
      : Math.min(window.innerWidth - submenuW - 8, rect.right + gap);
    const maxHeight = Math.min(360, window.innerHeight - 24);
    let top = rect.top;
    if (top + 120 > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - maxHeight - 12);
    }
    setSubmenuPos({ top, left, maxHeight });
  };

  const closeScheme = () => {
    setOpenSchemeId(null);
    setSubmenuPos(null);
  };
  const itemCount = useMemo(
    () => groups.reduce((n, g) => n + Math.max(g.items.length, 1), 0),
    [groups],
  );

  useLayoutEffect(() => {
    if (!state) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const w = 260;
      const h = 40 + groups.length * 26 + Math.max(itemCount, 1) * 36;
      let left = state.clientX;
      let top = state.clientY;
      if (left + w > window.innerWidth - 12) left = Math.max(12, window.innerWidth - w - 12);
      if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
      setPos({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [state, groups.length, itemCount]);

  useEffect(() => {
    if (!state) return undefined;
    const onDoc = (e: Event) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('.pg-flow-add-node-pop-submenu')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 捕获阶段：画布 mousedown 常 stopPropagation，冒泡监听收不到
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc, true);
      document.addEventListener('pointerdown', onDoc, true);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, onClose]);

  const buildLinkFn = (connectFrom?: ConnectorPickDetail) => {
    if (!connectFrom) return undefined;
    return ({ nodes: list, primaryId }: { nodes: any[]; primaryId: string }) => {
      const sourceNode = list.find((n) => n.id === connectFrom.nodeId);
      const sourceType =
        sourceNode?.taskData?.node_type ||
        sourceNode?.type ||
        connectFrom.nodeType;
      const created = list.find((n) => n.id === primaryId);
      const createdType = created?.taskData?.node_type || 'asset';

      const resolveSourceMedia = (n: any): 'image' | 'video' | 'audio' | 'file' | undefined => {
        if (!n) return undefined;
        const m = resolveConnectSourceMedia(n, list);
        return m === 'document' ? 'file' : m;
      };

      const resolveTargetInputs = (target: any, targetType: string): SchemePort[] => {
        if (Array.isArray(target?.taskData?.io_inputs) && target.taskData.io_inputs.length) {
          return target.taskData.io_inputs as SchemePort[];
        }
        if (targetType !== 'ai_image' && targetType !== 'ai_video') return [];
        const kind = targetType === 'ai_video' ? 'video' : 'image';
        const model =
          (models || []).find(
            (m) =>
              m.mid === target?.taskData?.modelMid ||
              m.name === target?.taskData?.model ||
              m.model_id === target?.taskData?.model,
          ) || null;
        return resolveModelIo(model, kind).allInputs;
      };

      const pickHandle = (
        target: any,
        targetType: string,
        preferred: string,
        srcType: string,
        srcMedia?: 'image' | 'video' | 'audio' | 'file',
      ) => {
        const inputs = resolveTargetInputs(target, targetType);
        if (inputs.length) {
          // 用户点了具体入参口：只落在该口，禁止跨口抢到「参考图」等
          const preferredPort = preferred ? findPortByHandle(inputs, preferred) : undefined;
          if (preferredPort) {
            const softEmptyAsset =
              srcType === 'asset' &&
              !srcMedia &&
              (preferredPort.accepts || []).includes('asset');
            if (
              softEmptyAsset ||
              isPortCompatibleWithSource(preferredPort, srcType, srcMedia)
            ) {
              return (
                findFreeHandleOnPort(
                  preferredPort,
                  target?.inputConnections,
                  preferred,
                  target?.taskData?.manualSocketCounts,
                ) || preferred
              );
            }
            // 点了该口但不兼容：不要改连到别的口
            return null;
          }
          const free = findFreeInputHandle(
            inputs,
            target?.inputConnections,
            srcType,
            srcMedia,
          );
          if (free) return free;
        }
        return resolveInputHandleForLink(String(targetType), preferred, String(srcType));
      };

      const linkTargetToSource = (n: any, handle: string, sourceId: string) => {
        const prevConns = { ...(n.inputConnections || {}) };
        const displacedParent = prevConns[handle];
        prevConns[handle] = sourceId;
        const parents = Object.values(prevConns).filter(Boolean) as string[];
        let parentId = n.parentId as string | undefined;
        if (!parentId || parentId === displacedParent || !parents.includes(parentId)) {
          parentId = sourceId;
        }
        return {
          ...n,
          parentId,
          inputConnections: prevConns,
        };
      };

      let next = list.map((n) => {
        if (connectFrom.side === 'right') {
          if (n.id !== primaryId) return n;
          const handle = pickHandle(
            n,
            String(createdType),
            connectFrom.handleId,
            String(sourceType),
            resolveSourceMedia(sourceNode),
          );
          if (!handle) return n;
          return linkTargetToSource(n, handle, connectFrom.nodeId);
        }
        if (n.id !== connectFrom.nodeId) return n;
        const handle = pickHandle(
          n,
          connectFrom.nodeType,
          connectFrom.handleId,
          String(createdType),
          resolveSourceMedia(created),
        );
        if (!handle) return n;
        return linkTargetToSource(n, handle, primaryId);
      });

      // 空素材连入 IO 口后写入文件类型限制
      if (connectFrom.side === 'left') {
        const target = next.find((n) => n.id === connectFrom.nodeId);
        const handle = connectFrom.handleId;
        const inputs = resolveTargetInputs(target, connectFrom.nodeType);
        if (handle && inputs.length && primaryId) {
          next = applyBoundAssetKindsOnConnect(next, primaryId, inputs, handle);
        }
      } else if (connectFrom.side === 'right') {
        const createdNode = next.find((n) => n.id === primaryId);
        const handle =
          createdNode?.inputConnections &&
          Object.entries(createdNode.inputConnections).find(([, sid]) => sid === connectFrom.nodeId)?.[0];
        const inputs = resolveTargetInputs(createdNode, String(createdType));
        if (handle && inputs.length) {
          next = applyBoundAssetKindsOnConnect(next, connectFrom.nodeId, inputs, handle);
        }
      }
      return next;
    };
  };

  const handleUploadFiles = (fileList: FileList | null) => {
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    const files = fileList ? Array.from(fileList) : [];
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;

    const { picks, warnings } = buildLocalFlowPicks(files);
    for (const w of Array.from(new Set(warnings))) toast.warning(w);
    if (!picks.length) return;

    const nodeLimit = resolveWorkflowNodeLimit(storageStats);
    const { count } = insertCanvasAssetsFromPicks({
      picks,
      nodes,
      setNodes,
      maxZIndex,
      setMaxZIndex,
      canvasTransform,
      saveCanvasState,
      nodeLimit,
      placeAt: pending?.placeAt,
      link: buildLinkFn(pending?.connectFrom),
    });

    if (count === 0) {
      toast.warning(workflowNodeLimitMessage(nodeLimit));
      return;
    }
  };

  const placeOpts = () => {
    if (!state) return {};
    return {
      placeAt:
        state.canvasX != null && state.canvasY != null
          ? { x: state.canvasX, y: state.canvasY }
          : undefined,
      connectFrom: state.connectFrom,
    };
  };

  const createNode = (type: NodeKey, preferredModel?: PlaygroundModel | null) => {
    if (!state) return;
    const { placeAt, connectFrom } = placeOpts();
    addAdvancedNodeToCanvas({
      type,
      nodes,
      setNodes,
      maxZIndex,
      setMaxZIndex,
      canvasTransform,
      saveCanvasState,
      models,
      preferredModel,
      placeAt,
      link: buildLinkFn(connectFrom),
      nodeLimit: resolveWorkflowNodeLimit(storageStats),
    });
    onClose();
  };

  const handlePick = (item: MenuItem) => {
    if (!state) return;
    if (item.kind === 'soon') {
      toast.info('音频节点即将支持');
      return;
    }
    if (item.kind === 'scheme') {
      // 方案行仅展开二级菜单，不直接创建
      return;
    }
    if (item.kind === 'model') {
      createNode(item.nodeType, item.model);
      return;
    }
    if (item.key === 'upload') {
      const { placeAt, connectFrom } = placeOpts();
      pendingUploadRef.current = { placeAt, connectFrom };
      onClose();
      window.setTimeout(() => fileRef.current?.click(), 0);
      return;
    }
    if (item.key === 'volc_enhance' && !isVolcEnhanceUsable(advancedNodesConfig)) {
      toast.warning(volcEnhanceUnavailableMessage(advancedNodesConfig));
      return;
    }
    if (item.key === 'director' && !isDirectorStageEnabled(advancedNodesConfig)) {
      return;
    }
    createNode(item.key);
  };

  const title = state?.connectFrom ? '选择可匹配节点' : '选择节点';
  const menuOpen = !!(state && pos);

  const openSchemeItem = useMemo(() => {
    if (!openSchemeId) return null;
    for (const g of groups) {
      for (const it of g.items) {
        if (it.kind === 'scheme' && it.id === openSchemeId) return it;
      }
    }
    return null;
  }, [groups, openSchemeId]);

  const renderLeafItem = (it: Exclude<MenuItem, SchemeItem>) => {
    const key = it.kind === 'node' ? it.key : it.id;
    return (
      <button
        key={key}
        type="button"
        className={`pg-flow-add-node-pop-item${it.kind === 'soon' ? ' is-soon' : ''}`}
        role="menuitem"
        onMouseEnter={closeScheme}
        onClick={() => handlePick(it)}
      >
        <span className="pg-flow-add-node-pop-icon">{it.icon}</span>
        <span className="pg-flow-add-node-pop-label">{it.label}</span>
      </button>
    );
  };

  const renderSchemeItem = (it: SchemeItem) => {
    const isOpen = openSchemeId === it.id;
    return (
      <div
        key={it.id}
        className={`pg-flow-add-node-pop-scheme${isOpen ? ' is-open' : ''}`}
        onMouseEnter={(e) => openScheme(it.id, e.currentTarget)}
      >
        <button
          type="button"
          className={`pg-flow-add-node-pop-item is-scheme${isOpen ? ' is-open' : ''}`}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onFocus={(e) => openScheme(it.id, e.currentTarget.parentElement)}
          onClick={(e) => {
            e.preventDefault();
            openScheme(it.id, e.currentTarget.parentElement);
          }}
        >
          <span className="pg-flow-add-node-pop-icon">{it.icon}</span>
          <span className="pg-flow-add-node-pop-label">{it.label}</span>
          <RightOutlined className="pg-flow-add-node-pop-chevron" />
        </button>
      </div>
    );
  };

  return createPortal(
    <>
      {menuOpen && (
        <div
          ref={panelRef}
          className="pg-flow-add-node-pop"
          style={{ top: pos!.top, left: pos!.left }}
          role="menu"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          onMouseLeave={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && (e.currentTarget.contains(next) || (next as Element).closest?.('.pg-flow-add-node-pop-submenu'))) {
              return;
            }
            closeScheme();
          }}
        >
          <div className="pg-flow-add-node-pop-title">{title}</div>
          <div
            className="pg-flow-add-node-pop-list"
            onScroll={closeScheme}
          >
            {groups.length === 0 ? (
              <div className="pg-flow-add-node-pop-empty">暂无可匹配节点类型</div>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="pg-flow-add-node-pop-group">
                  <div className="pg-flow-add-node-pop-group-title">{group.title}</div>
                  {group.items.length === 0 ? (
                    <div className="pg-flow-add-node-pop-empty">暂无可用模型</div>
                  ) : (
                    group.items.map((it) =>
                      it.kind === 'scheme' ? renderSchemeItem(it) : renderLeafItem(it),
                    )
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {menuOpen && openSchemeItem && submenuPos && (
        <div
          className="pg-flow-add-node-pop-submenu"
          style={{
            top: submenuPos.top,
            left: submenuPos.left,
            maxHeight: submenuPos.maxHeight,
          }}
          role="menu"
          aria-label={openSchemeItem.label}
          onMouseEnter={() => setOpenSchemeId(openSchemeItem.id)}
          onMouseLeave={closeScheme}
          onClick={(e) => e.stopPropagation()}
        >
          {openSchemeItem.models.map((m) => (
            <button
              key={m.id}
              type="button"
              className="pg-flow-add-node-pop-item"
              role="menuitem"
              onClick={() => handlePick(m)}
            >
              <span className="pg-flow-add-node-pop-icon">{m.icon}</span>
              <span className="pg-flow-add-node-pop-label">{m.label}</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.rtf,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleUploadFiles(e.target.files)}
      />
    </>,
    document.body,
  );
};

export default FlowAddNodePicker;

/** 触发节点标题进入内联重命名（AiImage/AiVideo 监听） */
export function requestNodeInlineRename(nodeId: string) {
  window.dispatchEvent(new CustomEvent('pg-flow-rename-node', { detail: { nodeId } }));
}
