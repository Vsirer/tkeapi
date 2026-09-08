/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 无限画布容器
 * 负责粒子背景、变换层、鼠标事件代理
 * 
 * 性能关键：使用原生 addEventListener({ passive: false }) 挂载 wheel 事件
 * React 的 onWheel 是 passive 的，preventDefault() 不生效，
 * 导致 Mac 触控板的双指缩放会触发浏览器原生页面缩放。
 */
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Typography, Spin } from '../ui';
import toast from './PlaygroundToast';
import { CompassOutlined } from '../ui';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { useCanvasInteraction, isCanvasNodeDragActive } from '../hooks/useCanvasInteraction';
import CanvasNode from './nodes/CanvasNode';
import { CORNER_RESIZE_DIRECTIONS, ResizeHandle } from './nodes/ResizeHandle';
import CanvasParticles from './CanvasParticles';
import type { CanvasParticlesHandle } from './CanvasParticles';
import WorkflowEmptyAddNode from './flow/WorkflowEmptyAddNode';
import FlowAddNodePicker, { type FlowAddNodePickerState } from './flow/FlowAddNodePicker';
import { requestNodeMoreMenu } from './nodes/shared/NodeMoreMenu';
import { CONNECTOR_MAGNET_SCREEN_PX, CONNECTOR_PICK_EVENT, type ConnectorPickDetail } from '../utils/flowConnectorCompat';
import {
  canAddWorkflowNodes,
  countWorkflowNodes,
  resolveWorkflowNodeLimit,
  workflowNodeLimitMessage,
} from '../utils/workflowNodeLimit';
import {
  isVolcEnhanceUsable,
  volcEnhanceUnavailableMessage,
} from '../utils/volcEnhanceAvailability';
import { useThemeStore } from '../../../../store/theme';
import { buildModelTaskDefaults, pickDefaultModel } from '../utils/flowDefaultModel';
import { applyCanvasVisual } from '../utils/canvasVisual';
import {
  CONNECTOR_Y0,
  NODE_CONNECTOR_OUTSET,
  buildLinkPathData,
  getLinkCurveMidpoint,
  getLinkLineCoords,
} from '../utils/flowLinkCoords';
import type { SchemePort } from '../types';
import {
  applyBoundAssetKindsOnConnect,
  enabledPorts,
  findFreeInputHandle,
  findPortByHandle,
  findStaleInputConnections,
  portConnectionRejectReason,
  resolveModelIo,
} from '../utils/schemeIo';
import { resolveConnectSourceMedia } from '../utils/flowConnectDragHighlight';

const VideoIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
);
const ImageIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
);
const SparklesIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
);
const ZapIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const EyeIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>
);

const { Title, Text } = Typography;

interface InfiniteCanvasProps {
  isMobile?: boolean;
  /** Imagine Flow 风格壳：点阵背景 + 空态添加节点 + 由外层 Splash 处理 loading */
  flowEditor?: boolean;
}

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = React.memo(({ isMobile = false, flowEditor = false }) => {
  const {
    canvasTransform, canvasRef,
    activeTool, isSpaceDown, isDraggingCanvas,
    nodes, setSelectedNodeId,
    selectedNodeIds, setSelectedNodeIds,
    draggingNodeId,
    maxZIndex, setMaxZIndex,
    connectingSourceId, setConnectingSourceId,
    connectingToInput, setConnectingToInput,
    connectingMousePos, setConnectingMousePos,
    setNodes,
  } = useCanvas();
  const {
    loading,
    currentModel,
    setIsGenLogVisible,
    isGenLogPinned,
    saveCanvasState,
    advancedNodesConfig,
    autoDisplayAssetDetails,
    models,
    storageStats,
  } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const particlesRef = React.useRef<CanvasParticlesHandle>(null);
  const mobileContainerRef = React.useRef<HTMLDivElement>(null);

  /** 选中节点：关 GenLog；旧版无 node_type 结果卡在「素材属性自动显示」开启时开 GenLog */
  const applyAutoDisplayOnSelect = React.useCallback((id: string) => {
    const targetNode = nodes.find((n) => n.id === id);
    const nodeType = targetNode?.taskData?.node_type;
    const isSection = targetNode?.type === 'section';

    if (nodeType === 'ai_image' || nodeType === 'ai_video') {
      setIsGenLogVisible(false);
      return;
    }

    if (nodeType === 'asset' || nodeType === 'preview' || nodeType === 'prompt') {
      setIsGenLogVisible(false);
      return;
    }

    if (nodeType || isSection) {
      setIsGenLogVisible(false);
      return;
    }

    // 旧版无 node_type 的图/视频结果卡 → GenLog
    if (autoDisplayAssetDetails) {
      setIsGenLogVisible(true);
    }
  }, [
    nodes,
    autoDisplayAssetDetails,
    setIsGenLogVisible,
  ]);

  const [contextMenuPos, setContextMenuPos] = React.useState<{ clientX: number; clientY: number; canvasX: number; canvasY: number } | null>(null);
  const [connectorPicker, setConnectorPicker] = React.useState<FlowAddNodePickerState>(null);

  React.useEffect(() => {
    if (!flowEditor) return undefined;
    const onPick = (ev: Event) => {
      const detail = (ev as CustomEvent<ConnectorPickDetail>).detail;
      if (!detail) return;
      setContextMenuPos(null);
      setConnectorPicker({
        clientX: detail.clientX,
        clientY: detail.clientY,
        canvasX: detail.canvasX,
        canvasY: detail.canvasY,
        connectFrom: detail,
      });
    };
    window.addEventListener(CONNECTOR_PICK_EVENT, onPick as EventListener);
    return () => window.removeEventListener(CONNECTOR_PICK_EVENT, onPick as EventListener);
  }, [flowEditor]);

  React.useEffect(() => {
    if (!flowEditor) return undefined;
    const handleCloseMenu = () => {
      setContextMenuPos(null);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, [flowEditor]);

  React.useEffect(() => {
    if (flowEditor) return undefined;
    const handleCloseMenu = () => {
      setContextMenuPos(null);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, [flowEditor]);

  const handleContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 输入框保留系统菜单（复制/粘贴）
    if (target.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }

    // —— 工作流编辑器：完全接管右键 ——
    if (flowEditor) {
      e.preventDefault();
      e.stopPropagation();

      // 点在节点上：打开该节点「更多操作」；选框/浮层只屏蔽系统菜单
      const nodeEl = target.closest('[data-node-id]');
      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-node-id');
        if (nodeId && nodeId !== 'group') {
          const foundNode = nodes.find((n) => n.id === nodeId);
          if (foundNode) {
            setContextMenuPos(null);
            setConnectorPicker(null);
            setSelectedNodeId(foundNode.id);
            setSelectedNodeIds([foundNode.id]);
            // 选中后部分节点才把 NodeMoreMenu 挂到工具条，等 commit 再打开
            window.setTimeout(() => {
              requestNodeMoreMenu(foundNode.id, { clientX: e.clientX, clientY: e.clientY });
            }, 0);
            return;
          }
        }
      }
      if (
        target.closest('.group-bounding-box') ||
        target.closest('.section-preview-box') ||
        target.closest('.marquee-box') ||
        target.closest('.pg-flow-add-node-pop') ||
        target.closest('.pg-flow-opbar') ||
        target.closest('.pg-flow-bottom-left') ||
        target.closest('.pg-flow-top-left') ||
        target.closest('.pg-flow-top-right') ||
        target.closest('.pg-flow-props')
      ) {
        setContextMenuPos(null);
        return;
      }

      // 空白画布：与左侧栏相同的「选择节点」列表
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
      const canvasY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
      setConnectorPicker(null);
      setContextMenuPos({
        clientX: e.clientX,
        clientY: e.clientY,
        canvasX,
        canvasY,
      });
      return;
    }

    // —— 旧版创作中心画布 ——
    if (!advancedNodesConfig?.enabled) return;

    const nodeEl = target.closest('[data-node-id]');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id');
      const foundNode = nodes.find(n => n.id === nodeId);
      if (!foundNode || foundNode.type !== 'section') {
        return;
      }
    }

    if (
      target.closest('.group-bounding-box') ||
      target.closest('.section-preview-box') ||
      target.closest('.marquee-box')
    ) {
      return;
    }

    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const canvasX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
      const canvasY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
      setContextMenuPos({
        clientX: e.clientX,
        clientY: e.clientY,
        canvasX,
        canvasY
      });
    }
  };

  const handleAddStandaloneNode = (
    type: 'preview' | 'volc_enhance' | 'prompt' | 'ai_video' | 'ai_image',
    canvasX: number,
    canvasY: number
  ) => {
    if (type === 'volc_enhance' && !isVolcEnhanceUsable(advancedNodesConfig)) {
      toast.warning(volcEnhanceUnavailableMessage(advancedNodesConfig));
      return;
    }

    const nodeLimit = resolveWorkflowNodeLimit(storageStats);
    const addCount = type === 'volc_enhance' ? 2 : 1;
    if (!canAddWorkflowNodes(countWorkflowNodes(nodes), addCount, nodeLimit)) {
      toast.warning(workflowNodeLimitMessage(nodeLimit));
      return;
    }

    const newZIndex = maxZIndex + 1;
    setMaxZIndex(newZIndex);

    const newNodesToPush: any[] = [];

    if (type === 'preview') {
      const newNode = {
        id: `node-${Date.now()}`,
        type: 'image',
        status: 'completed',
        resultData: { content: '[预览节点] 尚未关联素材' },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 200,
        zIndex: newZIndex,
        taskData: {
          node_type: 'preview'
        }
      };
      newNodesToPush.push(newNode);
    } else if (type === 'volc_enhance') {
      const volcNodeId = `node-${Date.now()}`;
      const volcNode = {
        id: volcNodeId,
        type: 'video',
        status: 'completed',
        resultData: { content: { video_url: '' } },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 240,
        zIndex: newZIndex,
        taskData: {
          node_type: 'volc_enhance',
          model: '火山画质增强 - 标准版',
          scene: 'AI 生成 (AIGC)',
          resolution: '保持原分辨率',
          fps: '保持原帧率'
        }
      };
      newNodesToPush.push(volcNode);

      const previewNodeId = `node-${Date.now() + 1}`;
      const previewNode = {
        id: previewNodeId,
        type: 'video',
        status: 'completed',
        resultData: { content: `[预览节点] 关联至素材: ${volcNodeId}` },
        x: canvasX + 280 + 40,
        y: canvasY,
        width: 280,
        height: 200,
        zIndex: newZIndex + 1,
        parentId: volcNodeId,
        taskData: {
          node_type: 'preview'
        }
      };
      newNodesToPush.push(previewNode);
    } else if (type === 'prompt') {
      const promptNode = {
        id: `node-${Date.now()}`,
        type: 'text',
        status: 'completed',
        resultData: { content: '' },
        x: canvasX,
        y: canvasY,
        width: 280,
        height: 180,
        zIndex: newZIndex,
        taskData: {
          node_type: 'prompt',
          prompt: '',
        }
      };
      newNodesToPush.push(promptNode);
    } else if (type === 'ai_video') {
      const modelDefaults = buildModelTaskDefaults(pickDefaultModel(models, 'video'));
      const videoNode = {
        id: `node-${Date.now()}`,
        type: 'video',
        status: 'completed',
        resultData: { content: { video_url: '' } },
        x: canvasX,
        y: canvasY,
        width: 569,
        height: 440,
        zIndex: newZIndex,
        taskData: {
          node_type: 'ai_video',
          duration: '5秒',
          motion: '中 (推荐)',
          prompt: '',
          ...modelDefaults,
        }
      };
      newNodesToPush.push(videoNode);
    } else if (type === 'ai_image') {
      const modelDefaults = buildModelTaskDefaults(pickDefaultModel(models, 'image'));
      const imageNode = {
        id: `node-${Date.now()}`,
        type: 'image',
        status: 'completed',
        resultData: { content: { image_url: '' } },
        x: canvasX,
        y: canvasY,
        width: 320,
        height: 440,
        zIndex: newZIndex,
        taskData: {
          node_type: 'ai_image',
          aspect_ratio: modelDefaults.aspect_ratio || modelDefaults.aspectRatio || '1:1',
          prompt: '',
          ...modelDefaults,
        }
      };
      newNodesToPush.push(imageNode);
    }

    setNodes((prev: any) => {
      const next = [...prev, ...newNodesToPush];
      saveCanvasState(next);
      return next;
    });
  };

  const [hoveredLinkId, setHoveredLinkId] = React.useState<string | null>(null);
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredLinkIdRef = React.useRef<string | null>(null);

  const clientToCanvasPoint = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: (clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
        y: (clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
      };
    },
    [canvasRef, canvasTransform.x, canvasTransform.y, canvasTransform.scale],
  );

  const placeDisconnectBtn = React.useCallback((linkId: string, x: number, y: number) => {
    const btn = canvasRef.current?.querySelector(
      `[data-disconnect-id="${CSS.escape(linkId)}"]`,
    ) as HTMLElement | null;
    if (!btn) return;
    const half = 16;
    btn.style.left = `${x - half}px`;
    btn.style.top = `${y - half}px`;
  }, [canvasRef]);

  const handleMouseEnterLink = React.useCallback(
    (linkId: string, e?: React.MouseEvent) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      hoveredLinkIdRef.current = linkId;
      setHoveredLinkId(linkId);
      if (e) {
        const pt = clientToCanvasPoint(e.clientX, e.clientY);
        if (pt) placeDisconnectBtn(linkId, pt.x, pt.y);
      }
    },
    [clientToCanvasPoint, placeDisconnectBtn],
  );

  const handleMouseMoveLink = React.useCallback(
    (linkId: string, e: React.MouseEvent) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (hoveredLinkIdRef.current !== linkId) {
        hoveredLinkIdRef.current = linkId;
        setHoveredLinkId(linkId);
      }
      const pt = clientToCanvasPoint(e.clientX, e.clientY);
      if (pt) placeDisconnectBtn(linkId, pt.x, pt.y);
    },
    [clientToCanvasPoint, placeDisconnectBtn],
  );

  const handleMouseLeaveLink = React.useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // 给指针从线移到断开按钮的缓冲时间
    hoverTimeoutRef.current = setTimeout(() => {
      hoveredLinkIdRef.current = null;
      setHoveredLinkId(null);
    }, 360);
  }, []);

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // 自动平滑滚动到最新内容
  useEffect(() => {
    if (isMobile && mobileContainerRef.current) {
      const container = mobileContainerRef.current;
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }, 150);
    }
  }, [nodes, isMobile]);

  // 保持粒子背景与画布变换同步（解决按钮放大缩小不跟随问题）
  useEffect(() => {
    if (particlesRef.current) {
      particlesRef.current.updateTransform(canvasTransform.x, canvasTransform.y, canvasTransform.scale);
    }
  }, [canvasTransform]);

  const {
    handleWheel, handleCanvasMouseDown,
    handleCanvasMouseMove, handleCanvasMouseUp,
    handleNodeMouseDown, handleResizeStart, removeNode,
    isGesturingRef,
  } = useCanvasInteraction(particlesRef); // 将 particlesRef 传给 hook

  const transformLayerRef = useRef<HTMLDivElement>(null);

  // 空闲时用 React state 同步变换；手势中由 hook 直接改 DOM，避免旧值回弹
  useLayoutEffect(() => {
    if (isDraggingCanvas || isGesturingRef.current) return;
    applyCanvasVisual(
      canvasRef.current,
      transformLayerRef.current,
      canvasTransform.x,
      canvasTransform.y,
      canvasTransform.scale,
      particlesRef.current,
    );
  }, [canvasTransform, isDraggingCanvas, canvasRef, isGesturingRef]);

  // 点击画布空白区域时取消节点选中并关闭面板
  const handleCanvasMouseDownWithDeselect = (e: React.MouseEvent) => {
    // 如果点击的不是节点区域，则取消选中
    // 如果点击的不是节点区域，且不是用选框工具拖拽，则取消选中
    const target = e.target as HTMLElement;
    if (!target.closest('[data-node-id]') && activeTool !== 'marquee') {
      if (!isGenLogPinned) {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setIsGenLogVisible(false);
      }
    }
    handleCanvasMouseDown(e);
  };

  // 全局 document 级 wheel 拦截（非 passive）
  // Mac 触控板双指缩放 = ctrlKey + wheel，必须在 document 级别 preventDefault 才能阻止浏览器原生缩放
  useEffect(() => {
    const nativeWheelHandler = (e: WheelEvent) => {
      const el = canvasRef.current;
      // 在 Playground 页面内，拦截缩放相关的修饰键 + 滚轮（防止触发浏览器缩放或前进后退）
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }

      // 判断事件目标是否在画布容器内
      if (el && el.contains(e.target as Node)) {
        e.preventDefault();
        handleWheel(e as any);
      }
    };

    document.addEventListener('wheel', nativeWheelHandler, { passive: false });
    return () => document.removeEventListener('wheel', nativeWheelHandler);
  }, [canvasRef, handleWheel]);

  // 切换工具时隐藏区块随动预览框
  useEffect(() => {
    if (activeTool !== 'section') {
      const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
      if (previewEl) {
        previewEl.style.display = 'none';
      }
    }
  }, [activeTool, canvasRef]);

  // 监听键盘 Backspace 和 Delete 键以删除选中节点
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInputActive = !!(activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        !!activeEl.closest('[contenteditable="true"]')
      ));
      if (isInputActive) return;
      if (document.querySelector('.pg-ds-root')) return;

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedNodeIds.length > 0) {
        e.preventDefault();
        removeNode(selectedNodeIds);
        setSelectedNodeIds([]);
        setSelectedNodeId(null);
        toast.success(`已删除 ${selectedNodeIds.length} 个节点`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodeIds, removeNode, setSelectedNodeIds, setSelectedNodeId]);

  // --- 节点连接器拖拽连接逻辑（正向：输出→入参；反向：入参→上游） ---
  useEffect(() => {
    if (!connectingSourceId && !connectingToInput) return;

    const reverseTarget = connectingToInput;
    const forwardSourceId = connectingSourceId;
    const magnetSide = reverseTarget ? 'right' : 'left';
    const excludeNodeId = reverseTarget?.nodeId || forwardSourceId;

    const clearConnecting = () => {
      setConnectingSourceId(null);
      setConnectingToInput(null);
      setConnectingMousePos(null);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      let clientX = e.clientX;
      let clientY = e.clientY;
      const magnet = { el: null as Element | null, dist: 0, cx: 0, cy: 0 };
      const selector = reverseTarget
        ? '.pg-flow-connector-row[data-connector-side="right"] .pg-flow-connector-dot'
        : '.pg-flow-connector-dot[data-magnet], .pg-flow-connector-row[data-connector-side="left"] .pg-flow-connector-dot';
      document.querySelectorAll(selector).forEach((el) => {
        if (el.closest('.is-connect-incompatible')) return;
        const row = el.closest('[data-node-id]');
        const nid = row?.getAttribute('data-node-id');
        if (!nid || nid === excludeNodeId) return;
        const side =
          row?.getAttribute('data-connector-side') ||
          el.closest('[data-connector-side]')?.getAttribute('data-connector-side');
        if (side && side !== magnetSide) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (dist <= CONNECTOR_MAGNET_SCREEN_PX && (!magnet.el || dist < magnet.dist)) {
          magnet.el = el;
          magnet.dist = dist;
          magnet.cx = cx;
          magnet.cy = cy;
        }
      });

      document.querySelectorAll('.pg-flow-connector-dot.is-magnet-snap').forEach((el) => {
        el.classList.remove('is-magnet-snap');
      });

      if (magnet.el) {
        clientX = magnet.cx;
        clientY = magnet.cy;
        magnet.el.classList.add('is-magnet-snap');
      }

      const mouseX = (clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
      const mouseY = (clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
      setConnectingMousePos({ x: mouseX, y: mouseY });
    };

    const handleGlobalMouseUp = async (e: MouseEvent) => {
      document.querySelectorAll('.pg-flow-connector-dot.is-magnet-snap').forEach((el) => {
        el.classList.remove('is-magnet-snap');
      });
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        clearConnecting();
        return;
      }

      const hitElement = document.elementFromPoint(e.clientX, e.clientY);
      const hitNodeEl = hitElement?.closest('[data-node-id]');
      const hitNodeId = hitNodeEl?.getAttribute('data-node-id');
      const hitHandleEl = hitElement?.closest('[data-handle-id]');
      const hitHandleId = hitHandleEl?.getAttribute('data-handle-id');

      let sourceId: string | null = null;
      let targetNodeId: string | null = null;
      let targetHandleId: string | null = null;

      if (reverseTarget) {
        sourceId = hitNodeId && hitNodeId !== reverseTarget.nodeId && hitNodeId !== 'group' ? hitNodeId : null;
        targetNodeId = reverseTarget.nodeId;
        targetHandleId = reverseTarget.handleId;
      } else if (forwardSourceId) {
        sourceId = forwardSourceId;
        targetNodeId =
          hitNodeId && hitNodeId !== forwardSourceId && hitNodeId !== 'group' ? hitNodeId : null;
        targetHandleId = hitHandleId ?? null;
      }

      if (sourceId && targetNodeId) {
        const targetNode = nodes.find((n) => n.id === targetNodeId);
        const sourceNode = nodes.find((n) => n.id === sourceId);

        if (targetNode && sourceNode) {
          const hasActiveParent =
            targetNode.parentId &&
            (() => {
              const p = nodes.find((n) => n.id === targetNode.parentId);
              return p && !p.isHidden;
            })();

          const isTargetAvailableAdvanced = [
            'preview',
            'volc_enhance',
            'prompt',
            'ai_video',
            'ai_image',
            'director',
          ].includes(targetNode.taskData?.node_type || '');

          if (isTargetAvailableAdvanced) {
            if (targetNode.taskData?.node_type === 'volc_enhance' && sourceNode.type === 'image') {
              toast.warning('火山画质增强仅支持视频素材！');
            } else {
              const targetNodeType = targetNode.taskData?.node_type || '';
              const isIoTarget = targetNodeType === 'ai_video' || targetNodeType === 'ai_image';

              const resolveTargetInputs = (): SchemePort[] => {
                if (Array.isArray(targetNode.taskData?.io_inputs) && targetNode.taskData.io_inputs.length) {
                  return targetNode.taskData.io_inputs as SchemePort[];
                }
                const kind = targetNodeType === 'ai_video' ? 'video' : 'image';
                const model = (models || []).find(
                  (m) =>
                    m.mid === targetNode.taskData?.modelMid ||
                    m.name === targetNode.taskData?.model ||
                    m.model_id === targetNode.taskData?.model,
                );
                return resolveModelIo(model, kind).allInputs;
              };

              const targetInputs = isIoTarget ? resolveTargetInputs() : [];
              const enabledIn = enabledPorts(targetInputs);
              const isMultiInput =
                enabledIn.some((p) => !!p.expandable && (Number(p.max) || 1) > 1) ||
                enabledIn.length > 1;

              if (!targetHandleId && hasActiveParent && !isMultiInput) {
                toast.warning('只能连接到没有父节点的高级处理节点！(或连接到指定插孔)');
              } else {
                let connectionFailedReason = '';
                let connectedHandleId: string | null = null;

                const sourceNodeType = sourceNode.taskData?.node_type || sourceNode.type || '';
                const sourceMedia = resolveConnectSourceMedia(sourceNode, nodes);

                const applyHandle = (updated: any, resolvedHandleId: string) => {
                  connectedHandleId = resolvedHandleId;
                  const prevConns = { ...(updated.inputConnections || {}) };
                  const displacedParent = prevConns[resolvedHandleId];
                  prevConns[resolvedHandleId] = sourceId;
                  updated.inputConnections = prevConns;

                  // 重连已占用插孔时：若 parentId 仍指向被顶替/已不在连线表中的上游，会多画一条无 handle 幽灵线
                  const parents = Object.values(prevConns).filter(Boolean) as string[];
                  if (
                    !updated.parentId ||
                    updated.parentId === displacedParent ||
                    !parents.includes(updated.parentId)
                  ) {
                    updated.parentId = sourceId;
                  }

                  const prefix = resolvedHandleId.replace(/\s\d+$/, '');
                  const countMatch = resolvedHandleId.match(/\d+$/);
                  if (countMatch) {
                    const countNum = parseInt(countMatch[0], 10);
                    const currentCounts = updated.taskData?.manualSocketCounts || {};
                    updated.taskData = {
                      ...(updated.taskData || {}),
                      manualSocketCounts: {
                        ...currentCounts,
                        [prefix]: Math.max(currentCounts[prefix] || 1, countNum),
                      },
                    };
                  }
                  return updated;
                };

                let updatedNodes = nodes.map((n) => {
                  if (n.id !== targetNodeId) return n;
                  let updated = { ...n };
                  let resolvedHandleId = targetHandleId || undefined;

                  if (isIoTarget) {
                    if (resolvedHandleId) {
                      const port = findPortByHandle(targetInputs, resolvedHandleId);
                      if (port) {
                        const reject = portConnectionRejectReason(
                          port,
                          sourceNodeType,
                          sourceMedia,
                          resolvedHandleId,
                        );
                        if (reject) {
                          connectionFailedReason = reject;
                          return n;
                        }
                      }
                      return applyHandle(updated, resolvedHandleId);
                    }

                    const free = findFreeInputHandle(
                      targetInputs,
                      updated.inputConnections,
                      sourceNodeType,
                      sourceMedia,
                    );
                    if (!free) {
                      const typedReject = enabledPorts(targetInputs)
                        .map((p) =>
                          portConnectionRejectReason(p, sourceNodeType, sourceMedia),
                        )
                        .find((r) => r?.includes('文件类型不匹配'));
                      connectionFailedReason =
                        typedReject || '没有可用的入参插孔，或类型不兼容 / 已满';
                      return n;
                    }
                    return applyHandle(updated, free);
                  }

                  const isImageLikeSource = (() => {
                    const t = sourceNode.taskData?.node_type;
                    if (t === 'asset' || t === 'ai_image' || t === 'preview' || t === 'director') return true;
                    return sourceNode.type === 'image';
                  })();
                  const isPromptLikeSource = sourceNode.taskData?.node_type === 'prompt';
                  if (updated.taskData?.node_type === 'director') {
                    if (!isImageLikeSource) {
                      connectionFailedReason = '请将图片节点连接到导演台左侧输入口';
                      return n;
                    }
                    resolvedHandleId = resolvedHandleId || 'Panorama';
                  }
                  if (updated.taskData?.node_type === 'ai_image') {
                    if (!resolvedHandleId) {
                      resolvedHandleId = isPromptLikeSource ? 'Prompt' : 'Reference Image 1';
                    } else if (
                      resolvedHandleId === 'Prompt' &&
                      isImageLikeSource &&
                      !isPromptLikeSource
                    ) {
                      resolvedHandleId = 'Reference Image 1';
                    }
                  }
                  if (resolvedHandleId) {
                    return applyHandle(updated, resolvedHandleId);
                  }
                  updated.parentId = sourceId;
                  return updated;
                });

                if (connectionFailedReason) {
                  toast.warning(connectionFailedReason);
                } else {
                  if (isIoTarget && sourceId && connectedHandleId) {
                    updatedNodes = applyBoundAssetKindsOnConnect(
                      updatedNodes,
                      sourceId,
                      targetInputs,
                      connectedHandleId,
                    );
                  }
                  setNodes(updatedNodes);
                  await saveCanvasState(updatedNodes);
                  toast.success('节点连接成功！');
                }
              }
            }
          } else {
            toast.warning('只能连接到高级处理节点！');
          }
        }
      }

      clearConnecting();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [
    connectingSourceId,
    connectingToInput,
    canvasTransform,
    nodes,
    setNodes,
    saveCanvasState,
    setConnectingMousePos,
    setConnectingSourceId,
    setConnectingToInput,
    canvasRef,
    models,
  ]);

  if (loading) {
    // 工作流编辑器由外层 WorkflowLoadingSplash 负责进场动画
    if (flowEditor) {
      return <div className="pg-flow-canvas-bg" style={{ position: 'absolute', inset: 0 }} />;
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div
        ref={mobileContainerRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          background: _isLight ? '#ffffff' : '#131314',
          padding: '80px 16px 240px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {nodes.filter(node => !node.isHidden).length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: '60vh',
            textAlign: 'center',
            padding: '0 24px',
            color: _isLight ? '#3c4043' : '#e8eaed',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '20px',
              background: _isLight ? 'linear-gradient(135deg, #e8f0fe, #d2e3fc)' : 'linear-gradient(135deg, #2d3038, #1a233a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              <CompassOutlined style={{ fontSize: 32, color: '#1677ff' }} />
            </div>
            <h1 style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '1px',
              margin: '0 0 12px 0',
              background: 'linear-gradient(135deg, #1677ff, #87d068)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {currentModel ? currentModel.name : 'AI 智能多模态工坊'}
            </h1>
            <p style={{
              fontSize: 14,
              color: _isLight ? '#5f6368' : '#9aa0a6',
              maxWidth: 280,
              lineHeight: 1.6,
              margin: 0,
              fontWeight: 300,
            }}>
              {currentModel
                ? '在下方输入你的创意灵感，生成的精彩内容将以瀑布流形式流转呈现。'
                : '请先在下方点击“选择模型”或配置各项参数，开启你的首个创作吧！'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {nodes.filter(node => !node.isHidden).map(node => (
              <div key={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* 1. 用户提示词气泡 */}
                {node.taskData?.prompt && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #a8c7fa, #7cacf8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: '#04285b',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                      }}>
                        U
                      </div>
                      <span style={{ color: _isLight ? '#5f6368' : '#9aa0a6', fontSize: 12, fontWeight: 500 }}>
                        我
                      </span>
                    </div>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '4px 16px 16px 16px',
                      background: _isLight ? '#f0f4f9' : '#1e1f20',
                      border: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)',
                      color: _isLight ? '#1f2937' : '#e3e3e3',
                      fontSize: 14,
                      lineHeight: 1.5,
                      maxWidth: '90%',
                      alignSelf: 'flex-start',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      wordBreak: 'break-word',
                    }}>
                      {node.taskData.prompt}
                    </div>
                  </div>
                )}

                {/* 2. AI 成果卡片 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', paddingLeft: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #a8fab4, #7cf8a1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: '#045b1d',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                    }}>
                      AI
                    </div>
                    <span style={{ color: '#1677ff', fontSize: 12, fontWeight: 500 }}>
                      {node.taskData?.model_name || currentModel?.name || 'AI 模型'}
                    </span>
                  </div>
                  <div style={{ width: '100%', maxWidth: '100%', overflow: 'visible' }}>
                    <CanvasNode
                      node={node}
                      isSelected={selectedNodeIds.includes(node.id)}
                      isDragging={false}
                      activeTool={activeTool}
                      onMouseDown={() => {}}
                      onRemove={removeNode}
                      onSelect={(id) => {
                        setSelectedNodeId(id);
                        applyAutoDisplayOnSelect(id);
                      }}
                      onResizeStart={handleResizeStart}
                      isMobile={true}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const dataStr = e.dataTransfer.getData('application/json');
          if (!dataStr) return;
          const data = JSON.parse(dataStr);
          if (data.type === 'resource' && data.resource) {
            const nodeLimit = resolveWorkflowNodeLimit(storageStats);
            if (!canAddWorkflowNodes(countWorkflowNodes(nodes), 1, nodeLimit)) {
              toast.warning(workflowNodeLimitMessage(nodeLimit));
              return;
            }

            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
              const canvasX = (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale;
              const canvasY = (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale;
              
              const newZIndex = maxZIndex + 1;
              setMaxZIndex(newZIndex);
              
              const res = data.resource;
              const newNode = {
                ...res,
                id: `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                x: canvasX,
                y: canvasY,
                zIndex: newZIndex,
                isHidden: false,
                parentId: undefined,
                isInstance: true,
              };
              
              setNodes((prev: any) => {
                const next = [...prev, newNode];
                saveCanvasState(next);
                return next;
              });
            }
          }
        } catch (err) {
          console.error('Drop error:', err);
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
        cursor: activeTool === 'hand' || isSpaceDown ? (isDraggingCanvas ? 'grabbing' : 'grab') : (activeTool === 'section' ? 'crosshair' : 'default'),
        background: flowEditor ? undefined : (_isLight ? '#ffffff' : '#131314'),
      }}
      className={flowEditor ? 'pg-flow-canvas-bg' : undefined}
      onMouseDown={handleCanvasMouseDownWithDeselect}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onContextMenu={handleContextMenu}
      onMouseLeave={() => {
        // 平移 / 节点 / 缩放跟拖都在 window 上，移出画布不要松手中断
        if (isDraggingCanvas || isCanvasNodeDragActive()) return;
        handleCanvasMouseUp();
        const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
        if (previewEl) {
          previewEl.style.display = 'none';
        }
      }}
    >
      {/* 动态粒子背景层（Imagine Flow 壳改用点阵，不再叠粒子） */}
      {!flowEditor && <CanvasParticles ref={particlesRef} />}

      {/* 变换层：transform 由 applyCanvasVisual / 手势 DOM 更新，避免 React 旧值覆盖 */}
      <div
        ref={transformLayerRef}
        className="transform-layer"
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
        }}
      >
        {[
          ...nodes.filter(node => node.type === 'section' && !node.isHidden),
          ...nodes.filter(node => node.type !== 'section' && !node.isHidden)
        ].map(node => (
          <CanvasNode
            key={node.id}
            node={node}
            isSelected={selectedNodeIds.includes(node.id)}
            isDragging={
              draggingNodeId === node.id
              || (!!draggingNodeId && selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id))
            }
            activeTool={activeTool}
            hideResizeHandles={selectedNodeIds.length > 1}
            onMouseDown={handleNodeMouseDown}
            onRemove={removeNode}
            onSelect={(id, e) => {
              const isMultiSelect = e ? (e.ctrlKey || e.metaKey) : false;
              if (isMultiSelect) {
                // 多选模式下由 handleNodeMouseDown 直接控制选中状态，在此拦截 click 时的退化
                return;
              }
              // 如果当前是多选状态，不因为简单的 onClick 就退化为单选
              if (selectedNodeIds.length <= 1) {
                setSelectedNodeId(id);
                setSelectedNodeIds([id]);
                applyAutoDisplayOnSelect(id);
              }
            }}
            onResizeStart={handleResizeStart}
          />
        ))}

        {/* 动态绘制父子高级节点的连接线 */}
        {(() => {
          const allLinks: { parentId: string, childId: string, handleId?: string }[] = [];
          nodes.forEach(node => {
            if (node.isHidden || node.type === 'section') return;

            const conns = node.inputConnections || {};
            const connEntries = Object.entries(conns).filter(([, pId]) => !!pId);

            // 已有插孔连线时只画 inputConnections，避免 parentId 残留画出无 handle 幽灵线
            if (connEntries.length > 0) {
              connEntries.forEach(([hId, pId]) => {
                allLinks.push({ parentId: pId, childId: node.id, handleId: hId });
              });
              return;
            }

            // 旧节点：仅 parentId、无插孔表
            if (node.parentId) {
              allLinks.push({ parentId: node.parentId, childId: node.id });
            }
          });

          if (
            allLinks.length === 0 &&
            !(
              (connectingSourceId || connectingToInput) &&
              connectingMousePos
            )
          ) {
            return null;
          }

          return (
            <>
              <svg
                style={{
                  position: 'absolute',
                  left: -10000,
                  top: -10000,
                  width: 30000,
                  height: 30000,
                  pointerEvents: 'none',
                  overflow: 'visible',
                  /* 必须低于节点（≥10），否则会盖住连接点名称 */
                  zIndex: 1,
                }}
              >
                {allLinks.map(({ parentId, childId, handleId }, index) => {
                  const parent = nodes.find(n => n.id === parentId);
                  const child = nodes.find(n => n.id === childId);
                  if (!parent || parent.isHidden || !child) return null;

                  // 无效连线不绘制（数据保留，由节点内「清理无效连线」处理）
                  const childType = child.taskData?.node_type;
                  if (
                    handleId &&
                    (childType === 'ai_video' || childType === 'ai_image')
                  ) {
                    const inputs: SchemePort[] =
                      Array.isArray(child.taskData?.io_inputs) && child.taskData.io_inputs.length
                        ? (child.taskData.io_inputs as SchemePort[])
                        : resolveModelIo(
                            (models || []).find(
                              (m) =>
                                m.mid === child.taskData?.modelMid ||
                                m.name === child.taskData?.model ||
                                m.model_id === child.taskData?.model,
                            ),
                            childType === 'ai_video' ? 'video' : 'image',
                          ).allInputs;
                    const stale = findStaleInputConnections({
                      inputConnections: child.inputConnections,
                      inputs,
                      resolveSourceType: (id) => {
                        const sn = nodes.find((x) => x.id === id);
                        if (!sn || sn.isHidden) return undefined;
                        return sn.taskData?.node_type || sn.type;
                      },
                      resolveSourceMedia: (id) => {
                        const sn = nodes.find((x) => x.id === id);
                        if (!sn) return undefined;
                        const m = resolveConnectSourceMedia(sn, nodes);
                        return m === 'document' ? 'file' : m;
                      },
                    });
                    if (stale.some((s) => s.handleId === handleId)) return null;
                  }

                  const rawCoords = getLinkLineCoords(parent, child, handleId);
                  const pathData = buildLinkPathData(rawCoords.x1, rawCoords.y1, rawCoords.x2, rawCoords.y2);

                  let lineColor = _isLight ? '#cbd5e1' : '#ffffff';
                  if (handleId) {
                    const promptHandle =
                      handleId.includes('Prompt') && !handleId.includes('Reference');
                    const promptFromPromptNode =
                      promptHandle && parent.taskData?.node_type === 'prompt';
                    if (handleId.includes('Reference Videos')) lineColor = '#4ade80';
                    else if (handleId.includes('Reference Audio')) lineColor = '#f472b6';
                    else if (promptFromPromptNode) lineColor = '#38bdf8';
                    else if (
                      handleId.includes('Reference') ||
                      (promptHandle && parent.taskData?.node_type !== 'prompt')
                    )
                      lineColor = '#fbbf24';
                    else if (promptHandle) lineColor = '#38bdf8';
                  } else {
                    const isPromptLink = parent.taskData?.node_type === 'prompt' && (child.taskData?.node_type === 'ai_image' || child.taskData?.node_type === 'ai_video');
                    const isPreviewLink = child.taskData?.node_type === 'preview';
                    const isRefImageLink = child.taskData?.node_type === 'ai_image' && parent.taskData?.node_type !== 'prompt';
                    
                    if (isPromptLink) {
                      lineColor = '#38bdf8';
                    } else if (parent.taskData?.node_type === 'preview') {
                      const getPreviewMediaType = (node: any, nodesList: any[]) => {
                        const findSrc = (curr: any): any => {
                          if (!curr) return null;
                          const p = curr.parentId ? nodesList.find(n => n.id === curr.parentId) : null;
                          if (!p || p.isHidden) return null;
                          if (p.taskData?.node_type === 'volc_enhance') return p;
                          if (p.type === 'video' || p.type === 'image' || p.type === 'audio') return p;
                          if (p.taskData?.node_type === 'preview') return findSrc(p);
                          return p;
                        };
                        const pNode = node.parentId ? nodesList.find(n => n.id === node.parentId) : null;
                        const sNode = pNode && !pNode.isHidden ? (findSrc(node) || pNode) : null;
                        return sNode ? sNode.type : 'image';
                      };
                      const mediaType = getPreviewMediaType(parent, nodes);
                      lineColor = mediaType === 'video' ? '#4ade80' : mediaType === 'audio' ? '#f472b6' : '#f59e0b';
                    } else if (parent.taskData?.node_type === 'asset' || parent.taskData?.node_type === 'director') {
                      lineColor = '#f59e0b';
                    } else if (isPreviewLink) {
                      lineColor = '#10b981';
                    } else if (isRefImageLink) {
                      lineColor = '#f59e0b';
                    } else {
                      lineColor = _isLight ? '#cbd5e1' : '#ffffff';
                    }
                  }

                  const lineOpacity = 0.95;
                  const linkId = `${parent.id}-${child.id}-${handleId || 'default'}`;
                  const isLinkHovered = hoveredLinkId === linkId;

                  return (
                    <g key={`link-${linkId}-${index}`} style={{ opacity: lineOpacity }}>
                      {/* 视觉导线 */}
                      <path
                        data-link-id={linkId}
                        data-parent-id={parent.id}
                        data-child-id={child.id}
                        data-handle-id={handleId}
                        d={pathData}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth={isLinkHovered ? 2.5 : 1.5}
                        style={{ transition: 'stroke-width 0.12s ease' }}
                      />
                      {/* 宽感应区：non-scaling-stroke 保证缩放下仍好点 */}
                      <path
                        data-link-id={linkId}
                        data-parent-id={parent.id}
                        data-child-id={child.id}
                        data-handle-id={handleId}
                        d={pathData}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth={22}
                        strokeOpacity={0}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        onMouseEnter={(e) => handleMouseEnterLink(linkId, e)}
                        onMouseMove={(e) => handleMouseMoveLink(linkId, e)}
                        onMouseLeave={handleMouseLeaveLink}
                      />
                    </g>
                  );
                })}

                {/* 动态绘制拖动中的连接虚线 */}
                {connectingSourceId && connectingMousePos && (() => {
                  const sourceNode = nodes.find(n => n.id === connectingSourceId);
                  if (!sourceNode) return null;

                  const pX = sourceNode.x;
                  const pY = sourceNode.y;
                  const pW = sourceNode.taskData?.node_type === 'prompt' ? (sourceNode.width || 280) : (sourceNode.width || 320);
                  const pH = sourceNode.taskData?.node_type === 'prompt' ? (sourceNode.height || 180) : (sourceNode.height || 200);

                  let x1 = pX + pW + 10000;
                  let y1 = pY + pH / 2 + 10000;
                  if (sourceNode.taskData?.node_type === 'ai_image' || sourceNode.taskData?.node_type === 'ai_video') {
                    x1 = pX + pW + NODE_CONNECTOR_OUTSET + 10000;
                    y1 = pY + CONNECTOR_Y0 + 10000;
                  } else if (sourceNode.taskData?.node_type === 'preview' || sourceNode.taskData?.node_type === 'asset' || sourceNode.taskData?.node_type === 'director') {
                    x1 = pX + pW + NODE_CONNECTOR_OUTSET + 10000;
                    y1 = pY + CONNECTOR_Y0 + 10000;
                  } else if (sourceNode.taskData?.node_type === 'prompt') {
                    x1 = pX + pW + NODE_CONNECTOR_OUTSET + 10000;
                    y1 = pY + CONNECTOR_Y0 + 10000;
                  }

                  const x2 = connectingMousePos.x + 10000;
                  const y2 = connectingMousePos.y + 10000;

                  let dragLineColor = _isLight ? '#cbd5e1' : '#ffffff';
                  if (sourceNode.taskData?.node_type === 'prompt') dragLineColor = '#38bdf8';
                  else if (sourceNode.taskData?.node_type === 'ai_image') dragLineColor = '#f59e0b';
                  else if (sourceNode.taskData?.node_type === 'asset' || sourceNode.taskData?.node_type === 'director') dragLineColor = '#f59e0b';
                  else if (sourceNode.taskData?.node_type === 'ai_video') dragLineColor = '#4ade80';
                  else if (sourceNode.type === 'audio') dragLineColor = '#f472b6';
                  else if (sourceNode.taskData?.node_type === 'preview') {
                    const getPreviewMediaType = (node: any, nodesList: any[]) => {
                      const findSrc = (curr: any): any => {
                        if (!curr) return null;
                        const p = curr.parentId ? nodesList.find(n => n.id === curr.parentId) : null;
                        if (!p || p.isHidden) return null;
                        if (p.taskData?.node_type === 'volc_enhance') return p;
                        if (p.type === 'video' || p.type === 'image' || p.type === 'audio') return p;
                        if (p.taskData?.node_type === 'preview') return findSrc(p);
                        return p;
                      };
                      const pNode = node.parentId ? nodesList.find(n => n.id === node.parentId) : null;
                      const sNode = pNode && !pNode.isHidden ? (findSrc(node) || pNode) : null;
                      return sNode ? sNode.type : 'image';
                    };
                    const mediaType = getPreviewMediaType(sourceNode, nodes);
                    dragLineColor = mediaType === 'video' ? '#4ade80' : mediaType === 'audio' ? '#f472b6' : '#f59e0b';
                  }

                  const isHorizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
                  let pathData = '';
                  if (isHorizontal) {
                    const ctrlX = (x1 + x2) / 2;
                    pathData = `M ${x1} ${y1} C ${ctrlX} ${y1}, ${ctrlX} ${y2}, ${x2} ${y2}`;
                  } else {
                    const ctrlY = (y1 + y2) / 2;
                    pathData = `M ${x1} ${y1} C ${x1} ${ctrlY}, ${x2} ${ctrlY}, ${x2} ${y2}`;
                  }

                  return (
                    <g>
                      <path
                        d={pathData}
                        fill="none"
                        stroke={dragLineColor}
                        strokeWidth="1.5"
                        strokeDasharray="5 3"
                      />
                      <circle cx={x2} cy={y2} r="4" fill={dragLineColor} />
                    </g>
                  );
                })()}

                {/* 从入参口反向拖线的橡皮筋 */}
                {connectingToInput && connectingMousePos && (() => {
                  const targetNode = nodes.find((n) => n.id === connectingToInput.nodeId);
                  if (!targetNode) return null;
                  const fakeParent = {
                    x: connectingMousePos.x - 40,
                    y: connectingMousePos.y - 20,
                    width: 40,
                    height: 40,
                    taskData: { node_type: 'asset' as const },
                  };
                  const coords = getLinkLineCoords(
                    fakeParent,
                    targetNode,
                    connectingToInput.handleId,
                  );
                  const x1 = coords.x2 + 10000;
                  const y1 = coords.y2 + 10000;
                  const x2 = connectingMousePos.x + 10000;
                  const y2 = connectingMousePos.y + 10000;
                  const dragLineColor = _isLight ? '#cbd5e1' : '#ffffff';
                  const isHorizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
                  const pathData = isHorizontal
                    ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
                    : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
                  return (
                    <g>
                      <path
                        d={pathData}
                        fill="none"
                        stroke={dragLineColor}
                        strokeWidth="1.5"
                        strokeDasharray="5 3"
                      />
                      <circle cx={x2} cy={y2} r="4" fill={dragLineColor} />
                    </g>
                  );
                })()}
              </svg>

              {/* 连线断开按钮层：跟鼠标，落在悬停点附近 */}
              {allLinks.map(({ parentId, childId, handleId }, index) => {
                const parent = nodes.find(n => n.id === parentId);
                const child = nodes.find(n => n.id === childId);
                if (!parent || parent.isHidden || !child) return null;

                const rawCoords = getLinkLineCoords(parent, child, handleId);
                const mid = getLinkCurveMidpoint(rawCoords.x1, rawCoords.y1, rawCoords.x2, rawCoords.y2);
                const linkId = `${parent.id}-${child.id}-${handleId || 'default'}`;
                const isHovered = hoveredLinkId === linkId;
                const btnSize = 32;

                return (
                  <div
                    key={`disconnect-${linkId}-${index}`}
                    data-disconnect-id={linkId}
                    title="断开连接"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const updatedNodes = nodes.map(n => {
                        if (n.id === child.id) {
                          let updated = { ...n };
                          if (handleId && updated.inputConnections) {
                            const newConns = { ...updated.inputConnections };
                            const disconnectedParentId = newConns[handleId];
                            delete newConns[handleId];
                            updated.inputConnections = newConns;
                            if (updated.parentId === disconnectedParentId) {
                              const hasOtherConnsToParent = Object.values(newConns).some(pid => pid === disconnectedParentId);
                              if (!hasOtherConnsToParent) {
                                updated.parentId = undefined;
                              }
                            }
                          } else {
                            updated.parentId = undefined;
                          }
                          return updated;
                        }
                        return n;
                      });
                      setNodes(updatedNodes);
                      await saveCanvasState(updatedNodes);
                      hoveredLinkIdRef.current = null;
                      setHoveredLinkId(null);
                    }}
                    onMouseEnter={() => {
                      handleMouseEnterLink(linkId);
                    }}
                    onMouseLeave={handleMouseLeaveLink}
                    style={{
                      position: 'absolute',
                      left: mid.x - btnSize / 2,
                      top: mid.y - btnSize / 2,
                      width: btnSize,
                      height: btnSize,
                      borderRadius: '50%',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 2000,
                      pointerEvents: isHovered ? 'auto' : 'none',
                      opacity: isHovered ? 1 : 0,
                      transform: isHovered ? 'scale(1)' : 'scale(0.85)',
                      transition: 'opacity 0.15s ease, transform 0.15s ease',
                    }}
                  >
                    <span
                      className="pg-flow-link-disconnect"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#ff4d4f',
                        border: '1px solid #fff',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: 1,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                        pointerEvents: 'none',
                      }}
                    >
                      ✕
                    </span>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* 组包围盒（多选时显示） */}
        {selectedNodeIds.length > 1 && (() => {
          const groupNodes = nodes.filter(n => selectedNodeIds.includes(n.id) && !n.isHidden);
          if (groupNodes.length === 0) return null;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          groupNodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
            maxY = Math.max(maxY, n.y + n.height);
          });
          const width = maxX - minX;
          const height = maxY - minY;
          return (
            <div
              className={`group-bounding-box pg-flow-node-frame${activeTool === 'pointer' ? ' is-selected' : ''}`}
              data-node-id="group"
              style={{
                position: 'absolute',
                left: minX,
                top: minY,
                width,
                height,
                border: '1px dashed #1677ff',
                background: 'rgba(22, 119, 255, 0.05)',
                pointerEvents: 'none',
                zIndex: maxZIndex + 2,
              }}
            >
              {activeTool === 'pointer' && (
                <div 
                  style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'relative', cursor: 'move' }}
                  onMouseDown={(e) => handleNodeMouseDown(e, 'group', minX, minY)}
                >
                  {CORNER_RESIZE_DIRECTIONS.map((dir) => (
                    <ResizeHandle key={dir} direction={dir} onMouseDown={(e) => handleResizeStart(e, 'group', dir)} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* 空画布引导（非 Flow 壳） */}
        {!flowEditor && nodes.filter(node => !node.isHidden).length === 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            width: window.innerWidth, height: window.innerHeight,
            pointerEvents: 'none', opacity: 0.8
          }}>
            <CompassOutlined style={{ fontSize: 64, color: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)', marginBottom: 24 }} />
            <Title level={1} style={{ color: _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', letterSpacing: '2px', margin: '0 0 16px 0', fontWeight: 600 }}>
              {currentModel ? currentModel.name : '无限创作空间'}
            </Title>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', fontSize: 16, maxWidth: 440, textAlign: 'center', lineHeight: 1.6, fontWeight: 300 }}>
              {currentModel
                ? '拖滑视图，无限蔓延。你可以在这里将所有的创意编织流转成多模态宇宙。'
                : '请在侧边栏选择模型体验，生成的内容将汇聚在无限画布中。'}
            </Text>
          </div>
        )}

        {/* 新建区块随动预览 — 对齐 Imagine：左上角锚定 + 橙色角标 */}
        {activeTool === 'section' && (
          <div
            className="section-preview-box pg-flow-section-preview"
            style={{ display: 'none', width: 400, height: 300 }}
          >
            <div className="pg-flow-section-preview-anchor" aria-hidden />
            <div className="pg-flow-section-preview-label">新建区块</div>
          </div>
        )}
      </div>

      {/* Imagine Flow 空态：固定视口中央，不跟随画布缩放 */}
      {flowEditor && (
        <WorkflowEmptyAddNode visible={nodes.filter(node => !node.isHidden).length === 0} />
      )}

      {/* 选框层：独立于 transform-layer，坐标系为外层容器 */}
      <div 
        className="marquee-box"
        style={{
          position: 'absolute',
          display: 'none',
          background: 'rgba(22, 119, 255, 0.2)',
          border: '1px solid #1677ff',
          pointerEvents: 'none',
          zIndex: 9999,
        }} 
      />

      {/* 画布自定义右键菜单 */}
      {flowEditor ? (
        <FlowAddNodePicker
          state={
            connectorPicker ||
            (contextMenuPos
              ? {
                  clientX: contextMenuPos.clientX,
                  clientY: contextMenuPos.clientY,
                  canvasX: contextMenuPos.canvasX,
                  canvasY: contextMenuPos.canvasY,
                }
              : null)
          }
          onClose={() => {
            setContextMenuPos(null);
            setConnectorPicker(null);
          }}
        />
      ) : (
        contextMenuPos && (
        <div
          style={{
            position: 'fixed',
            left: contextMenuPos.clientX,
            top: contextMenuPos.clientY,
            zIndex: 9999,
            minWidth: 160,
            background: _isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(20, 20, 22, 0.85)',
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            borderRadius: 16,
            border: _isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: _isLight ? '0 10px 40px -10px rgba(0,0,0,0.1)' : '0 15px 50px -12px rgba(0,0,0,0.5)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            animation: 'zoomMenuFadeIn 0.12s ease-out'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            padding: '4px 8px 6px 8px',
            fontSize: 11,
            fontWeight: 500,
            color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
            borderBottom: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            marginBottom: 4,
            userSelect: 'none'
          }}>
            新建高级节点
          </div>

          {/* AI 视频 */}
          {advancedNodesConfig?.ai_video_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('ai_video', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <VideoIcon />
              <span>AI 视频生成</span>
            </div>
          )}

          {/* AI 图片 */}
          {advancedNodesConfig?.ai_image_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('ai_image', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <ImageIcon />
              <span>AI 图像生成</span>
            </div>
          )}

          {/* 提示词优化 */}
          {advancedNodesConfig?.prompt_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('prompt', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <SparklesIcon />
              <span>提示词优化</span>
            </div>
          )}

          {/* 火山画质增强 */}
          {isVolcEnhanceUsable(advancedNodesConfig) && (
          <div
            className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
            onClick={() => {
              handleAddStandaloneNode('volc_enhance', contextMenuPos.canvasX, contextMenuPos.canvasY);
              setContextMenuPos(null);
            }}
          >
            <ZapIcon />
            <span>火山画质增强</span>
          </div>
          )}

          {/* 预览节点 */}
          {advancedNodesConfig?.preview_enabled !== false && (
            <div
              className={`pg-context-menu-item ${_isLight ? 'light' : 'dark'}`}
              onClick={() => {
                handleAddStandaloneNode('preview', contextMenuPos.canvasX, contextMenuPos.canvasY);
                setContextMenuPos(null);
              }}
            >
              <EyeIcon />
              <span>预览节点</span>
            </div>
          )}
        </div>
        )
      )}
    </div>
  );
});

InfiniteCanvas.displayName = 'InfiniteCanvas';
export default InfiniteCanvas;
