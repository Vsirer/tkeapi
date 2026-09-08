/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 画布交互 Hook（高性能版）
 * 
 * 核心优化：所有拖拽操作（画布平移、节点拖拽、节点缩放）使用 useRef 存储中间值，
 * 通过 requestAnimationFrame 批量更新 DOM，仅在 mouseup 时提交最终状态到 React。
 * 
 * 这样每次 mousemove 不再触发 React re-render，实现 60fps 流畅拖拽。
 */
import { useCallback, useRef, useEffect } from 'react';
import toast from '../components/PlaygroundToast';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import type { CanvasTransform, CanvasNode } from '../types';
import type { CanvasParticlesHandle } from '../components/CanvasParticles';
import type { ResizeDirection } from '../components/nodes/ResizeHandle';
import { FLOW_MEDIA_MAX_SIZE, FLOW_MEDIA_MIN_SIZE } from '../components/nodes/ResizeHandle';
import { applyCanvasVisual, readCanvasTransformFromDom } from '../utils/canvasVisual';
import { buildLinkPathData, getLinkCurveMidpoint, getLinkLineCoords } from '../utils/flowLinkCoords';
import {
  canAddWorkflowNodes,
  countWorkflowNodes,
  resolveWorkflowNodeLimit,
  workflowNodeLimitMessage,
} from '../utils/workflowNodeLimit';
import { measureNodeVisualSize, queryCanvasNodeRoot } from '../utils/flowAutoLayout';

/** 高度由预览区 aspect-ratio 撑开（仅改宽、锁比例） */
const LOCKED_ASPECT_NODE_TYPES = new Set(['ai_image', 'ai_video', 'volc_enhance']);

function isLockedAspectNode(node: CanvasNode | null | undefined): boolean {
  const t = node?.taskData?.node_type;
  return typeof t === 'string' && LOCKED_ASPECT_NODE_TYPES.has(t);
}

/**
 * 仅当节点被拖入/拖出区块时更新归属（不因缩放区块或落点几何自动全量重算）
 */
function findSectionIdForNode(node: CanvasNode, sections: CanvasNode[]): string | null {
  const nodeW = node.width || 320;
  const nodeH = node.height || 240;
  const centerX = node.x + nodeW / 2;
  const centerY = node.y + nodeH / 2;
  const sorted = [...sections].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
  for (const section of sorted) {
    const secW = section.width || 400;
    const secH = section.height || 300;
    if (
      centerX >= section.x &&
      centerX <= section.x + secW &&
      centerY >= section.y &&
      centerY <= section.y + secH
    ) {
      return section.id;
    }
  }
  return null;
}

/** 放置成功后：仅扩展有溢出的边，使节点完全落入并多留 5px */
const SECTION_FIT_PAD = 5;

function expandSectionToFitNode(
  section: CanvasNode,
  node: CanvasNode,
  footprint?: { w: number; h: number },
): CanvasNode {
  let x = section.x;
  let y = section.y;
  let w = section.width || 400;
  let h = section.height || 300;
  const nw = footprint?.w || node.width || 320;
  const nh = footprint?.h || node.height || 240;
  const nodeL = node.x;
  const nodeR = node.x + nw;
  const nodeT = node.y;
  const nodeB = node.y + nh;

  if (nodeL < x) {
    const nextX = nodeL - SECTION_FIT_PAD;
    w += x - nextX;
    x = nextX;
  }
  if (nodeR > x + w) {
    w = nodeR + SECTION_FIT_PAD - x;
  }
  if (nodeT < y) {
    const nextY = nodeT - SECTION_FIT_PAD;
    h += y - nextY;
    y = nextY;
  }
  if (nodeB > y + h) {
    h = nodeB + SECTION_FIT_PAD - y;
  }

  if (
    x === section.x &&
    y === section.y &&
    w === (section.width || 400) &&
    h === (section.height || 300)
  ) {
    return section;
  }
  return { ...section, x, y, width: w, height: h };
}

function footprintForNode(
  canvasEl: HTMLElement | null | undefined,
  node: CanvasNode,
): { w: number; h: number } {
  const el = queryCanvasNodeRoot(canvasEl, node.id);
  if (el) {
    const m = measureNodeVisualSize(el);
    if (m.w > 0 && m.h > 0) return m;
  }
  return { w: node.width || 320, h: node.height || 240 };
}

/** 按被拖动的节点更新 Section.childrenNodeIds；落入后按需撑开区块 */
const assignDraggedNodesToSections = (
  allNodes: CanvasNode[],
  movedNodeIds: string[],
  canvasEl?: HTMLElement | null,
): CanvasNode[] => {
  if (movedNodeIds.length === 0) return allNodes;
  const sections = allNodes.filter((n) => n.type === 'section' && !n.isHidden);
  const movedSet = new Set(movedNodeIds);
  const assignment = new Map<string, string | null>();

  for (const nodeId of movedNodeIds) {
    const node = allNodes.find((n) => n.id === nodeId);
    if (!node || node.type === 'section' || node.isHidden) continue;
    assignment.set(nodeId, findSectionIdForNode(node, sections));
  }
  if (assignment.size === 0) return allNodes;

  const withChildren = allNodes.map((n) => {
    if (n.type !== 'section') return n;
    const kept = (n.childrenNodeIds || []).filter((id) => !movedSet.has(id));
    const added: string[] = [];
    assignment.forEach((secId, nodeId) => {
      if (secId === n.id) added.push(nodeId);
    });
    return { ...n, childrenNodeIds: [...kept, ...added] };
  });

  const nodesBySec = new Map<string, CanvasNode[]>();
  assignment.forEach((secId, nodeId) => {
    if (!secId) return;
    const node = withChildren.find((n) => n.id === nodeId);
    if (!node) return;
    const list = nodesBySec.get(secId) || [];
    list.push(node);
    nodesBySec.set(secId, list);
  });
  if (nodesBySec.size === 0) return withChildren;

  return withChildren.map((n) => {
    if (n.type !== 'section') return n;
    const fitNodes = nodesBySec.get(n.id);
    if (!fitNodes?.length) return n;
    return fitNodes.reduce(
      (sec, node) => expandSectionToFitNode(sec, node, footprintForNode(canvasEl, node)),
      n,
    );
  });
};

/** 删除/隐藏节点后清理各区块的 childrenNodeIds */
const pruneSectionChildren = (allNodes: CanvasNode[]): CanvasNode[] => {
  const alive = new Set(allNodes.filter((n) => !n.isHidden).map((n) => n.id));
  return allNodes.map((n) => {
    if (n.type !== 'section') return n;
    const next = (n.childrenNodeIds || []).filter((id) => alive.has(id));
    if (next.length === (n.childrenNodeIds || []).length) return n;
    return { ...n, childrenNodeIds: next };
  });
};

function clearSectionDropHighlights(root: HTMLElement | null) {
  root?.querySelectorAll('.pg-flow-section-frame.is-drop-target').forEach((el) => {
    el.classList.remove('is-drop-target');
  });
}

/** 拖拽节点过程中高亮可接收的区块（中心点落入） */
function updateSectionDropHighlight(
  root: HTMLElement | null,
  allNodes: CanvasNode[],
  probe: { x: number; y: number; w: number; h: number } | null,
) {
  clearSectionDropHighlights(root);
  if (!root || !probe) return;
  const sections = allNodes.filter((n) => n.type === 'section' && !n.isHidden);
  const fakeNode = { x: probe.x, y: probe.y, width: probe.w, height: probe.h } as CanvasNode;
  const secId = findSectionIdForNode(fakeNode, sections);
  if (!secId) return;
  queryCanvasNodeRoot(root, secId)?.classList.add('is-drop-target');
}

/**
 * 模块级共享拖拽状态
 */
const sharedNodeDrag = {
  nodeId: null as string | null,
  offsetX: 0,
  offsetY: 0,
  groupNodes: [] as { id: string, offsetX: number, offsetY: number }[],
};

/** 拖拽期间禁止浏览器文字选中（避免标题/模型名被蓝选） */
let selectionLockDepth = 0;
let onSelectStartBlock: ((e: Event) => void) | null = null;

function lockCanvasTextSelection() {
  if (selectionLockDepth === 0) {
    window.getSelection()?.removeAllRanges();
    onSelectStartBlock = (e) => {
      e.preventDefault();
    };
    document.addEventListener('selectstart', onSelectStartBlock, true);
    document.body.style.userSelect = 'none';
    document.body.style.setProperty('-webkit-user-select', 'none');
  }
  selectionLockDepth += 1;
}

function unlockCanvasTextSelection() {
  if (selectionLockDepth <= 0) return;
  selectionLockDepth -= 1;
  if (selectionLockDepth > 0) return;
  if (onSelectStartBlock) {
    document.removeEventListener('selectstart', onSelectStartBlock, true);
    onSelectStartBlock = null;
  }
  document.body.style.userSelect = '';
  document.body.style.removeProperty('-webkit-user-select');
  window.getSelection()?.removeAllRanges();
}

function isEditableDragTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

/** mousedown preventDefault 会挡住输入框失焦，点节点/画布时先把焦点交回。 */
function blurActiveEditable() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return;
  if (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  ) {
    el.blur();
  }
}

/** 节点缩放最小尺寸 */
const MIN_NODE_WIDTH = 120;
const MIN_NODE_HEIGHT = 80;
/** 缩放拖拽的 window 级清理（与画布平移同理，移出节点也不中断） */
let resizeWindowCleanup: (() => void) | null = null;
/** 节点拖拽同样挂 window，避免提示词等窄命中区一出节点/画布就丢拖 */
let nodeDragWindowCleanup: (() => void) | null = null;

/** 节点 / 编组 / 缩放跟拖中（画布 mouseleave 不得当成松手） */
export function isCanvasNodeDragActive() {
  return !!(
    sharedNodeDrag.nodeId ||
    sharedNodeDrag.groupNodes.length > 0 ||
    sharedResizeDrag.nodeId
  );
}

/** 提示词节点最大尺寸 */
const MAX_PROMPT_WIDTH = 480;
const MAX_PROMPT_HEIGHT = 360;

/** 模块级共享缩放状态 */
const sharedResizeDrag = {
  nodeId: null as string | null,
  direction: '' as ResizeDirection | '',
  startMouseX: 0,
  startMouseY: 0,
  /** 按下时指针的画布坐标（与节点同空间，避免缩放后屏幕 delta 漂移） */
  startPointerX: 0,
  startPointerY: 0,
  startNodeX: 0,
  startNodeY: 0,
  startNodeW: 0,
  startNodeH: 0,
  /** height:auto 媒体节点：预览区宽高比（宽/高），图片 1、视频 16/9 */
  previewAspect: 0,
  isFlowMedia: false,
  groupStartNodes: [] as {id: string, x: number, y: number, w: number, h: number}[],
};

export const useCanvasInteraction = (particlesRef?: React.RefObject<CanvasParticlesHandle> | React.MutableRefObject<CanvasParticlesHandle | null>) => {
  const {
    canvasTransform, setCanvasTransform,
    activeTool, isSpaceDown,
    setIsDraggingCanvas,
    setDraggingNodeId,
    nodes, setNodes,
    maxZIndex, setMaxZIndex,
    canvasRef,
    selectedNodeIds, setSelectedNodeIds,
    setSelectedNodeId,
    setActiveTool,
  } = useCanvas();

  const { saveCanvasState, storageStats } = usePlayground();

  // --- Ref-based 拖拽中间状态（不触发 React 渲染） ---
  const canvasDragRef = useRef({
    isDragging: false,
    startX: 0, startY: 0,
    startTransformX: 0, startTransformY: 0,
  });
  const rafRef = useRef<number>(0);
  const wheelTimeoutRef = useRef<number | null>(null);
  /** 滚轮/捏合进行中：避免 React 用旧 transform 盖掉即时 DOM */
  const isGesturingRef = useRef(false);
  /** 画布平移时挂在 window 上，移出视口也不中断 */
  const panWindowCleanupRef = useRef<(() => void) | null>(null);
  // 缓存最新的 canvasTransform；手势中以 DOM/手势更新为准，禁止被旧 React state 盖掉
  const transformRef = useRef<CanvasTransform>(canvasTransform);
  useEffect(() => {
    if (isGesturingRef.current) return;
    transformRef.current = canvasTransform;
  }, [canvasTransform]);

  const getLiveTransform = useCallback((): CanvasTransform => {
    const layer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
    const fromDom = readCanvasTransformFromDom(layer);
    if (fromDom) {
      transformRef.current = fromDom;
      return fromDom;
    }
    return transformRef.current;
  }, [canvasRef]);

  const paintTransform = useCallback((x: number, y: number, scale: number) => {
    const transformLayer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
    applyCanvasVisual(
      canvasRef.current,
      transformLayer,
      x,
      y,
      scale,
      particlesRef?.current ?? null,
    );
  }, [canvasRef, particlesRef]);

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => () => {
    panWindowCleanupRef.current?.();
    panWindowCleanupRef.current = null;
    nodeDragWindowCleanup?.();
    nodeDragWindowCleanup = null;
    if (wheelTimeoutRef.current) window.clearTimeout(wheelTimeoutRef.current);
  }, []);

  const updateConnectionLines = useCallback((nodeId: string) => {
    if (!canvasRef.current) return;
    const paths = canvasRef.current.querySelectorAll(
      `path[data-parent-id="${nodeId}"], path[data-child-id="${nodeId}"]`
    );
    if (paths.length === 0) return;

    const processedLinks = new Set<string>();

    const getNodeCurrentPos = (id: string, stateNode: any) => {
      const el = queryCanvasNodeRoot(canvasRef.current, id);
      const isPrompt = stateNode.taskData?.node_type === 'prompt';
      const defaultW = isPrompt ? 280 : 320;
      const defaultH = isPrompt ? 180 : 200;
      if (el) {
        const leftVal = parseFloat(el.style.left || '');
        const topVal = parseFloat(el.style.top || '');
        const widthVal = parseFloat(el.style.width || '');
        const heightVal = parseFloat(el.style.height || '');
        return {
          x: isNaN(leftVal) ? stateNode.x : leftVal,
          y: isNaN(topVal) ? stateNode.y : topVal,
          width: isNaN(widthVal) ? (stateNode.width || defaultW) : widthVal,
          height: isNaN(heightVal) ? (stateNode.height || defaultH) : heightVal,
        };
      }
      return {
        x: stateNode.x,
        y: stateNode.y,
        width: stateNode.width || defaultW,
        height: stateNode.height || defaultH,
      };
    };

    paths.forEach(p => {
      const parentId = p.getAttribute('data-parent-id');
      const childId = p.getAttribute('data-child-id');
      const handleId = p.getAttribute('data-handle-id') || undefined;
      if (!parentId || !childId) return;
      const linkKey = `${parentId}-${childId}-${handleId || 'default'}`;
      if (processedLinks.has(linkKey)) return;
      processedLinks.add(linkKey);

      const parentNode = nodesRef.current.find(n => n.id === parentId);
      const childNode = nodesRef.current.find(n => n.id === childId);
      if (!parentNode || !childNode) return;

      const parentPos = getNodeCurrentPos(parentId, parentNode);
      const childPos = getNodeCurrentPos(childId, childNode);

      const parent = { ...parentNode, ...parentPos };
      const child = { ...childNode, ...childPos };
      const { x1, y1, x2, y2 } = getLinkLineCoords(parent, child, handleId || undefined);
      const pathData = buildLinkPathData(x1, y1, x2, y2);

      const currentLinkPaths = canvasRef.current?.querySelectorAll(`path[data-link-id="${linkKey}"]`);
      currentLinkPaths?.forEach(path => {
        path.setAttribute('d', pathData);
      });

      const mid = getLinkCurveMidpoint(x1, y1, x2, y2);
      const btn = canvasRef.current?.querySelector(`[data-disconnect-id="${linkKey}"]`) as HTMLElement | null;
      if (btn) {
        btn.style.left = `${mid.x - 16}px`;
        btn.style.top = `${mid.y - 16}px`;
      }
    });
  }, [canvasRef]);

  const marqueeDragRef = useRef({
    isDragging: false,
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
  });

  // Esc 取消区块绘制（含拖拽中途）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeTool !== 'section') return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable ||
          activeEl.closest('[contenteditable="true"]'))
      ) {
        return;
      }
      e.preventDefault();
      marqueeDragRef.current.isDragging = false;
      const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
      if (marqueeEl) marqueeEl.style.display = 'none';
      const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
      if (previewEl) previewEl.style.display = 'none';
      setActiveTool('pointer');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, setActiveTool, canvasRef]);

  /** 滚轮缩放与平移（兼容原生 WheelEvent 和 React.WheelEvent） */
  const handleWheel = useCallback((e: WheelEvent | React.WheelEvent) => {
    const ct = transformRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // e.ctrlKey 表示触控板捏合 (Pinch) 或按住 Ctrl 滚轮
    // e.metaKey (Mac ⌘) 和 e.altKey 也常用于缩放
    if (e.ctrlKey || e.metaKey || e.altKey) {
      // 放大 / 缩小：使用指数级缩放以获得平滑体验
      let delta = 'deltaY' in e ? e.deltaY : 0;
      
      // 抹平不同输入设备的差异
      if ('deltaMode' in e && e.deltaMode === 1) { // Line mode
        delta *= 20;
      }
      
      // 针对 Mac 触控板 Pinch 手势（ctrlKey 为 true）大幅优化灵敏度
      // Pinch 的 delta 物理感更强，需要更灵敏的反馈
      const sensitivity = e.ctrlKey ? 0.04 : 0.01;
      const zoomFactor = Math.pow(1.1, -delta * sensitivity);
      let newScale = ct.scale * zoomFactor;
      
      // 限制缩放范围：0.05x 到 5x
      newScale = Math.min(Math.max(0.05, newScale), 5);
      
      if (newScale === ct.scale) return;

      isGesturingRef.current = true;

      // 计算鼠标相对于画布的位置
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      
      // 以鼠标位置为中心计算新的平移量
      const ratio = newScale / ct.scale;
      const newX = pointerX - (pointerX - ct.x) * ratio;
      const newY = pointerY - (pointerY - ct.y) * ratio;
      
      // 性能优化：直接更新 DOM
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        paintTransform(newX, newY, newScale);
      });

      // 更新引用缓存，保证后续事件能读到最新值
      transformRef.current = { x: newX, y: newY, scale: newScale };

      // 防抖同步到 React State
      if (wheelTimeoutRef.current) window.clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = window.setTimeout(() => {
        isGesturingRef.current = false;
        setCanvasTransform({ x: transformRef.current.x, y: transformRef.current.y, scale: transformRef.current.scale });
      }, 80);
    } else {
      // 平移 (双指滑动 或 普通滚轮) — 无边界，1:1 映射
      let dx = e.deltaX;
      let dy = e.deltaY;
      // 部分鼠标仅有纵向滚轮：Shift+滚轮当作横向
      if (dx === 0 && e.shiftKey && dy !== 0) {
        dx = dy;
        dy = 0;
      }
      if ('deltaMode' in e && e.deltaMode === 1) {
        dx *= 20;
        dy *= 20;
      }
      if (dx === 0 && dy === 0) return;

      isGesturingRef.current = true;
      const newX = ct.x - dx;
      const newY = ct.y - dy;
      
      // 使用 RAF 立即更新 DOM
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        paintTransform(newX, newY, ct.scale);
      });
      
      transformRef.current = { ...ct, x: newX, y: newY };
      
      // 防抖同步到 React State
      if (wheelTimeoutRef.current) window.clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = window.setTimeout(() => {
        isGesturingRef.current = false;
        setCanvasTransform({ x: transformRef.current.x, y: transformRef.current.y, scale: transformRef.current.scale });
      }, 80);
    }
  }, [canvasRef, setCanvasTransform, paintTransform]);

  /** 画布鼠标按下 */
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // 允许通过手形工具、空格键或鼠标中键(button 1)进行平移
    if (activeTool === 'hand' || isSpaceDown || e.button === 1) {
      blurActiveEditable();
      e.preventDefault();
      lockCanvasTextSelection();
      canvasDragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startTransformX: transformRef.current.x,
        startTransformY: transformRef.current.y,
      };
      setIsDraggingCanvas(true);
      
      // 如果是中键，防止触发浏览器默认行为（如自动滚动）
      if (e.button === 1) {
        e.preventDefault();
      }

      // window 级跟拖：移出画布/窗口边缘也不中断（无限画布）
      panWindowCleanupRef.current?.();
      const onWinMove = (ev: MouseEvent) => {
        const cd = canvasDragRef.current;
        if (!cd.isDragging) return;
        const newX = cd.startTransformX + (ev.clientX - cd.startX);
        const newY = cd.startTransformY + (ev.clientY - cd.startY);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          paintTransform(newX, newY, transformRef.current.scale);
        });
        transformRef.current = { ...transformRef.current, x: newX, y: newY };
      };
      const onWinUp = () => {
        panWindowCleanupRef.current?.();
        panWindowCleanupRef.current = null;
        if (!canvasDragRef.current.isDragging) {
          unlockCanvasTextSelection();
          return;
        }
        setCanvasTransform({
          x: transformRef.current.x,
          y: transformRef.current.y,
          scale: transformRef.current.scale,
        });
        canvasDragRef.current.isDragging = false;
        setIsDraggingCanvas(false);
        unlockCanvasTextSelection();
      };
      panWindowCleanupRef.current = () => {
        window.removeEventListener('mousemove', onWinMove);
        window.removeEventListener('mouseup', onWinUp);
      };
      window.addEventListener('mousemove', onWinMove);
      window.addEventListener('mouseup', onWinUp);
    } else if ((activeTool === 'marquee' || activeTool === 'pointer' || activeTool === 'section') && !isSpaceDown && e.button !== 1) {
      blurActiveEditable();
      e.preventDefault();
      lockCanvasTextSelection();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        marqueeDragRef.current = {
          isDragging: true,
          startX: e.clientX - rect.left,
          startY: e.clientY - rect.top,
          currentX: e.clientX - rect.left,
          currentY: e.clientY - rect.top,
        };
        if (!e.shiftKey) {
          setSelectedNodeIds([]);
          setSelectedNodeId(null);
        }
        
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
          if (marqueeEl) {
            marqueeEl.style.display = 'block';
            marqueeEl.style.left = `${marqueeDragRef.current.startX}px`;
            marqueeEl.style.top = `${marqueeDragRef.current.startY}px`;
            marqueeEl.style.width = `0px`;
            marqueeEl.style.height = `0px`;
          }
        });
      }
    }
  }, [activeTool, isSpaceDown, setIsDraggingCanvas, setSelectedNodeIds, setSelectedNodeId, canvasRef, paintTransform, setCanvasTransform]);

  /** 画布鼠标移动 — 全部通过 RAF + 直接 DOM 更新 */
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const cd = canvasDragRef.current;
    const nd = sharedNodeDrag;

    if (cd.isDragging) {
      // 画布平移：直接计算新位置，通过 RAF 更新 transform 层 DOM（window 监听为主，此处兜底）
      const newX = cd.startTransformX + (e.clientX - cd.startX);
      const newY = cd.startTransformY + (e.clientY - cd.startY);

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        paintTransform(newX, newY, transformRef.current.scale);
      });

      // 缓存最新位置供 mouseup 使用
      transformRef.current = { ...transformRef.current, x: newX, y: newY };

    } else if (marqueeDragRef.current.isDragging) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        marqueeDragRef.current.currentX = e.clientX - rect.left;
        marqueeDragRef.current.currentY = e.clientY - rect.top;
        const { startX, startY, currentX, currentY } = marqueeDragRef.current;

        if (activeTool === 'section') {
          const ct = transformRef.current;
          const startX_canvas = (startX - ct.x) / ct.scale;
          const startY_canvas = (startY - ct.y) / ct.scale;
          const currentX_canvas = (marqueeDragRef.current.currentX - ct.x) / ct.scale;
          const currentY_canvas = (marqueeDragRef.current.currentY - ct.y) / ct.scale;

          const dragW = Math.abs(currentX_canvas - startX_canvas);
          const dragH = Math.abs(currentY_canvas - startY_canvas);
          // 未拉开时保持默认尺寸预览（左上角锚定在按下点）；拉开后按拖拽框
          const useDefault = dragW < 20 && dragH < 20;
          const x = useDefault ? startX_canvas : Math.min(startX_canvas, currentX_canvas);
          const y = useDefault ? startY_canvas : Math.min(startY_canvas, currentY_canvas);
          const w = useDefault ? 400 : dragW;
          const h = useDefault ? 300 : dragH;

          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
            if (previewEl) {
              previewEl.style.left = `${x}px`;
              previewEl.style.top = `${y}px`;
              previewEl.style.width = `${w}px`;
              previewEl.style.height = `${h}px`;
              previewEl.style.display = 'block';
            }
          });
        } else {
          const x = Math.min(startX, currentX);
          const y = Math.min(startY, currentY);
          const w = Math.abs(currentX - startX);
          const h = Math.abs(currentY - startY);

          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
            if (marqueeEl) {
              marqueeEl.style.display = 'block';
              marqueeEl.style.left = `${x}px`;
              marqueeEl.style.top = `${y}px`;
              marqueeEl.style.width = `${w}px`;
              marqueeEl.style.height = `${h}px`;
            }
          });
        }
      }
    } else if (sharedResizeDrag.nodeId) {
      // 节点缩放：用画布坐标算 delta（对齐 xyflow screen→flow），拉远后仍贴鼠标
      const rd = sharedResizeDrag;
      const ct = getLiveTransform();
      const rect = canvasRef.current?.getBoundingClientRect();
      const pointerX = rect
        ? (e.clientX - rect.left - ct.x) / ct.scale
        : (e.clientX - ct.x) / ct.scale;
      const pointerY = rect
        ? (e.clientY - rect.top - ct.y) / ct.scale
        : (e.clientY - ct.y) / ct.scale;
      const deltaX = pointerX - rd.startPointerX;
      const deltaY = pointerY - rd.startPointerY;

      let newX = rd.startNodeX;
      let newY = rd.startNodeY;
      let newW = rd.startNodeW;
      let newH = rd.startNodeH;

      // 根据方向计算新的尺寸和位置
      const targetNode = rd.nodeId !== 'group' ? nodesRef.current.find(n => n.id === rd.nodeId) : null;
      const isPrompt = targetNode?.taskData?.node_type === 'prompt';
      const isAsset = targetNode?.taskData?.node_type === 'asset';
      const isLockedAspect = isLockedAspectNode(targetNode);
      const assetMin = 160;
      const minW = rd.nodeId === 'group'
        ? 20
        : (isLockedAspect ? FLOW_MEDIA_MIN_SIZE : isAsset ? assetMin : MIN_NODE_WIDTH);
      const minH = rd.nodeId === 'group'
        ? 20
        : (isLockedAspect ? FLOW_MEDIA_MIN_SIZE : isAsset ? assetMin : MIN_NODE_HEIGHT);
      const maxSide = isLockedAspect || isAsset ? FLOW_MEDIA_MAX_SIZE : Number.POSITIVE_INFINITY;

      if (rd.direction.includes('e')) {
        const val = rd.startNodeW + deltaX;
        newW = Math.max(minW, Math.min(maxSide, isPrompt ? Math.min(val, MAX_PROMPT_WIDTH) : val));
      }
      if (rd.direction.includes('s')) {
        const val = rd.startNodeH + deltaY;
        newH = Math.max(minH, Math.min(maxSide, isPrompt ? Math.min(val, MAX_PROMPT_HEIGHT) : val));
      }
      if (rd.direction.includes('w')) {
        let dw = Math.min(deltaX, rd.startNodeW - minW);
        if (isPrompt) {
          dw = Math.max(dw, -(MAX_PROMPT_WIDTH - rd.startNodeW));
        }
        if (Number.isFinite(maxSide)) {
          dw = Math.max(dw, rd.startNodeW - maxSide);
        }
        newW = rd.startNodeW - dw;
        newX = rd.startNodeX + dw;
      }
      if (rd.direction.includes('n')) {
        let dh = Math.min(deltaY, rd.startNodeH - minH);
        if (isPrompt) {
          dh = Math.max(dh, -(MAX_PROMPT_HEIGHT - rd.startNodeH));
        }
        if (Number.isFinite(maxSide)) {
          dh = Math.max(dh, rd.startNodeH - maxSide);
        }
        newH = rd.startNodeH - dh;
        newY = rd.startNodeY + dh;
      }

      if (rd.nodeId !== 'group' && targetNode) {
        if (isLockedAspect && rd.startNodeW > 0) {
          // AI 图/视频：只缩放宽度；预览用 CSS aspect-ratio；北向拖动时上移以钉住底边
          let dW = 0;
          if (rd.direction.includes('e')) dW = deltaX;
          if (rd.direction.includes('w')) dW = -deltaX;
          if (rd.direction.includes('n') || rd.direction.includes('s')) {
            const dH = rd.direction.includes('s') ? deltaY : -deltaY;
            const aspect = rd.previewAspect > 0 ? rd.previewAspect : 1;
            const dFromH = dH * aspect;
            if (Math.abs(dFromH) > Math.abs(dW)) dW = dFromH;
          }
          newW = Math.min(
            FLOW_MEDIA_MAX_SIZE,
            Math.max(FLOW_MEDIA_MIN_SIZE, rd.startNodeW + dW),
          );
          newX = rd.direction.includes('w')
            ? rd.startNodeX + rd.startNodeW - newW
            : rd.startNodeX;
          const aspect = rd.previewAspect > 0 ? rd.previewAspect : 1;
          const oldPreviewH = rd.startNodeW / aspect;
          const newPreviewH = newW / aspect;
          newY = rd.direction.includes('n')
            ? rd.startNodeY - (newPreviewH - oldPreviewH)
            : rd.startNodeY;
          newH = rd.startNodeH; // 占位；DOM 使用 height:auto
        } else if (
          // 仅旧版纯素材卡（无 node_type）保持等比；预览/素材等高级节点可自由改比例
          !targetNode.taskData?.node_type &&
          (targetNode.type === 'image' || targetNode.type === 'video') &&
          rd.startNodeW > 0 &&
          rd.startNodeH > 0
        ) {
          const aspectRatio = rd.startNodeW / rd.startNodeH;
          if (rd.direction === 'e' || rd.direction === 'w') {
            newH = newW / aspectRatio;
          } else if (rd.direction === 'n' || rd.direction === 's') {
            newW = newH * aspectRatio;
          } else {
            const scaleW = newW / rd.startNodeW;
            const scaleH = newH / rd.startNodeH;
            if (Math.abs(scaleW - 1) > Math.abs(scaleH - 1)) {
              newH = newW / aspectRatio;
            } else {
              newW = newH * aspectRatio;
            }
          }
          if (rd.direction.includes('w')) {
            newX = rd.startNodeX + rd.startNodeW - newW;
          }
          if (rd.direction.includes('n')) {
            newY = rd.startNodeY + rd.startNodeH - newH;
          }
        }
      }

      const scaleX = rd.startNodeW > 0 ? newW / rd.startNodeW : 1;
      const scaleY = rd.startNodeH > 0 ? newH / rd.startNodeH : 1;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (rd.nodeId === 'group') {
          const groupEl = canvasRef.current?.querySelector('.group-bounding-box') as HTMLElement | null;
          if (groupEl) {
            groupEl.style.left = `${newX}px`;
            groupEl.style.top = `${newY}px`;
            groupEl.style.width = `${newW}px`;
            groupEl.style.height = `${newH}px`;
          }
          rd.groupStartNodes.forEach(gn => {
            const nodeEl = queryCanvasNodeRoot(canvasRef.current, gn.id);
            if (nodeEl) {
              const nx = newX + (gn.x - rd.startNodeX) * scaleX;
              const ny = newY + (gn.y - rd.startNodeY) * scaleY;
              const nw = gn.w * scaleX;
              const nh = gn.h * scaleY;
              nodeEl.style.left = `${nx}px`;
              nodeEl.style.top = `${ny}px`;
              nodeEl.style.width = `${nw}px`;
              nodeEl.style.height = `${nh}px`;
            }
            updateConnectionLines(gn.id);
          });
        } else {
          const nodeEl = rd.nodeId ? queryCanvasNodeRoot(canvasRef.current, rd.nodeId) : null;
          if (nodeEl) {
            nodeEl.style.left = `${newX}px`;
            nodeEl.style.top = `${newY}px`;
            nodeEl.style.width = `${newW}px`;
            if (isLockedAspect) {
              nodeEl.style.height = 'auto';
            } else {
              nodeEl.style.height = `${newH}px`;
            }
          }
          if (rd.nodeId) updateConnectionLines(rd.nodeId);
        }
      });
    } else if (nd.groupNodes.length > 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const ct = transformRef.current;
        const pointerX = (e.clientX - rect.left - ct.x) / ct.scale;
        const pointerY = (e.clientY - rect.top - ct.y) / ct.scale;

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          nd.groupNodes.forEach(g => {
            const nodeEl = queryCanvasNodeRoot(canvasRef.current, g.id);
            if (nodeEl) {
              nodeEl.style.left = `${pointerX - g.offsetX}px`;
              nodeEl.style.top = `${pointerY - g.offsetY}px`;
            }
            updateConnectionLines(g.id);
          });

          // 仅拖普通节点时高亮可接收区块（拖区块本身不高亮）
          const probeIds = nd.groupNodes
            .map((g) => g.id)
            .filter((id) => nodesRef.current.find((n) => n.id === id)?.type !== 'section');
          if (probeIds.length > 0) {
            const primary = nodesRef.current.find((n) => n.id === probeIds[0]);
            const el = queryCanvasNodeRoot(canvasRef.current, probeIds[0]);
            const x = el ? parseFloat(el.style.left) : primary?.x ?? 0;
            const y = el ? parseFloat(el.style.top) : primary?.y ?? 0;
            updateSectionDropHighlight(canvasRef.current, nodesRef.current, {
              x,
              y,
              w: primary?.width || 320,
              h: primary?.height || 240,
            });
          } else {
            clearSectionDropHighlights(canvasRef.current);
          }
        });
      }
    } else if (nd.nodeId) {
      // 节点拖拽：直接操作节点 DOM
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const ct = transformRef.current;
        const pointerX = (e.clientX - rect.left - ct.x) / ct.scale;
        const pointerY = (e.clientY - rect.top - ct.y) / ct.scale;
        const newNodeX = pointerX - nd.offsetX;
        const newNodeY = pointerY - nd.offsetY;

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const nodeEl = nd.nodeId ? queryCanvasNodeRoot(canvasRef.current, nd.nodeId) : null;
          if (nodeEl) {
            nodeEl.style.left = `${newNodeX}px`;
            nodeEl.style.top = `${newNodeY}px`;
          }
          if (nd.nodeId) updateConnectionLines(nd.nodeId);

          const dragged = nodesRef.current.find((n) => n.id === nd.nodeId);
          if (dragged && dragged.type !== 'section') {
            updateSectionDropHighlight(canvasRef.current, nodesRef.current, {
              x: newNodeX,
              y: newNodeY,
              w: dragged.width || 320,
              h: dragged.height || 240,
            });
          } else {
            clearSectionDropHighlights(canvasRef.current);
          }
        });
      }
    } else {
      // 区块工具：随动预览，鼠标锚定在待放置区域左上角（对齐 Imagine）
      if (activeTool === 'section') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const ct = transformRef.current;
          const mouseX = (e.clientX - rect.left - ct.x) / ct.scale;
          const mouseY = (e.clientY - rect.top - ct.y) / ct.scale;

          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
            if (previewEl) {
              previewEl.style.left = `${mouseX}px`;
              previewEl.style.top = `${mouseY}px`;
              previewEl.style.width = '400px';
              previewEl.style.height = '300px';
              previewEl.style.display = 'block';
            }
          });
        }
      }
    }
  }, [canvasRef, activeTool, paintTransform, getLiveTransform]);

  /** 鼠标松开 — 将最终位置一次性提交到 React state */
  const handleCanvasMouseUp = useCallback(() => {
    nodeDragWindowCleanup?.();
    nodeDragWindowCleanup = null;
    const cd = canvasDragRef.current;
    const nd = sharedNodeDrag;
    const hadGesture =
      cd.isDragging ||
      marqueeDragRef.current.isDragging ||
      !!nd.nodeId ||
      nd.groupNodes.length > 0 ||
      !!sharedResizeDrag.nodeId;

    if (cd.isDragging) {
      panWindowCleanupRef.current?.();
      panWindowCleanupRef.current = null;
      // 提交最终画布位置到 React state
      setCanvasTransform({
        x: transformRef.current.x,
        y: transformRef.current.y,
        scale: transformRef.current.scale,
      });
      cd.isDragging = false;
      setIsDraggingCanvas(false);
    }

    if (marqueeDragRef.current.isDragging) {
      marqueeDragRef.current.isDragging = false;
      
      const { startX, startY, currentX, currentY } = marqueeDragRef.current;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      // 隐藏选框
      const marqueeEl = canvasRef.current?.querySelector('.marquee-box') as HTMLElement | null;
      if (marqueeEl) {
        marqueeEl.style.display = 'none';
      }

      if (activeTool === 'section') {
        const nodeLimit = resolveWorkflowNodeLimit(storageStats);
        if (!canAddWorkflowNodes(countWorkflowNodes(nodes), 1, nodeLimit)) {
          toast.warning(workflowNodeLimitMessage(nodeLimit));
          setActiveTool('pointer');
          // 隐藏随动预览框
          const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
          if (previewEl) {
            previewEl.style.display = 'none';
          }
          return;
        }

        const ct = transformRef.current;
        const clickX = (x - ct.x) / ct.scale;
        const clickY = (y - ct.y) / ct.scale;

        let finalW = w / ct.scale;
        let finalH = h / ct.scale;
        let finalX = clickX;
        let finalY = clickY;

        // 点击（拖动很小）：默认落位 1600×1200（预备预览仍为 400×300），左上角落在点击点
        if (w < 20 || h < 20) {
          finalW = 1600;
          finalH = 1200;
          finalX = clickX;
          finalY = clickY;
        }

        const newSection: CanvasNode = {
          id: `section-${Date.now()}`,
          type: 'section',
          status: 'completed',
          title: `Section ${nodes.filter(n => n.type === 'section').length + 1}`,
          x: finalX,
          y: finalY,
          width: finalW,
          height: finalH,
          zIndex: maxZIndex + 1,
          taskData: {},
          resultData: null,
          childrenNodeIds: []
        };

        setNodes(prev => {
          const next = [...prev, newSection];
          saveCanvasState(next);
          return next;
        });

        setMaxZIndex(maxZIndex + 1);
        setActiveTool('pointer');

        // 隐藏随动预览框
        const previewEl = canvasRef.current?.querySelector('.section-preview-box') as HTMLElement | null;
        if (previewEl) {
          previewEl.style.display = 'none';
        }
        return;
      }

      // 计算碰撞
      if (w > 5 && h > 5) {
        const ct = transformRef.current;
        // 将选框坐标转换为画布内容坐标
        const contentBox = {
          x: (x - ct.x) / ct.scale,
          y: (y - ct.y) / ct.scale,
          w: w / ct.scale,
          h: h / ct.scale,
        };

        const newSelectedIds: string[] = [];
        nodes.forEach(n => {
          if (n.isHidden) return;
          // 矩形相交检测
          if (
            n.x < contentBox.x + contentBox.w &&
            n.x + n.width > contentBox.x &&
            n.y < contentBox.y + contentBox.h &&
            n.y + n.height > contentBox.y
          ) {
            newSelectedIds.push(n.id);
          }
        });

        // 取旧的选择 + 新选择 (为了支持 shift 多选可以未来扩展)
        setSelectedNodeIds(prev => {
          // 如果没有按 shift, 就是 newSelectedIds
          // 这里简化处理，直接覆盖
          return newSelectedIds;
        });
        if (newSelectedIds.length === 1) {
          setSelectedNodeId(newSelectedIds[0]);
        } else {
          setSelectedNodeId(null); // 多选时隐藏详情面板
        }
        
        // 如果成功选中了内容，自动切换回指针工具，方便后续拖拽和缩放
        if (newSelectedIds.length > 0) {
          setActiveTool('pointer');
        }
      }
    }

    if (sharedResizeDrag.nodeId) {
      // 提交最终缩放结果到 React state
      const rd = sharedResizeDrag;
      if (rd.nodeId === 'group') {
        setNodes(prev => {
          const next = prev.map(n => {
            const g = rd.groupStartNodes.find(gn => gn.id === n.id);
            if (g) {
              const nodeEl = queryCanvasNodeRoot(canvasRef.current, n.id);
              if (nodeEl) {
                return { 
                  ...n, 
                  x: parseFloat(nodeEl.style.left), 
                  y: parseFloat(nodeEl.style.top),
                  width: parseFloat(nodeEl.style.width),
                  height: parseFloat(nodeEl.style.height),
                };
              }
            }
            return n;
          });
          saveCanvasState(next);
          return next;
        });
      } else {
        const nodeEl = rd.nodeId ? queryCanvasNodeRoot(canvasRef.current, rd.nodeId) : null;
        if (nodeEl) {
          const finalX = parseFloat(nodeEl.style.left);
          const finalY = parseFloat(nodeEl.style.top);
          const finalW = parseFloat(nodeEl.style.width) || nodeEl.offsetWidth;
          const finalH = nodeEl.offsetHeight || parseFloat(nodeEl.style.height) || 0;
          const resizedId = rd.nodeId;
          nodeEl.classList.remove('is-resizing');
          setNodes(prev => {
            const next = prev.map(n => {
              if (n.id !== resizedId) return n;
              if (isLockedAspectNode(n)) {
                return { ...n, x: finalX, y: finalY, width: finalW, height: finalH || n.height };
              }
              return { ...n, x: finalX, y: finalY, width: finalW, height: finalH };
            });
            // 缩放不改变区块归属，仅拖入/拖出才绑定
            saveCanvasState(next);
            return next;
          });
        }
      }
      rd.nodeId = null;
      rd.direction = '';
      rd.isFlowMedia = false;
      rd.previewAspect = 0;
      resizeWindowCleanup?.();
      resizeWindowCleanup = null;
    }

    if (nd.groupNodes.length > 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const draggedIds = nd.groupNodes.map((g) => g.id);
        setNodes(prev => {
          const next = prev.map(n => {
            const g = nd.groupNodes.find(gn => gn.id === n.id);
            if (g) {
              const nodeEl = queryCanvasNodeRoot(canvasRef.current, n.id);
              if (nodeEl) {
                return { ...n, x: parseFloat(nodeEl.style.left), y: parseFloat(nodeEl.style.top) };
              }
            }
            return n;
          });
          // 拖区块只更新位置并保持原 children；拖普通节点才按落点绑定/解绑
          const movingSection = draggedIds.some((id) => next.find((n) => n.id === id)?.type === 'section');
          const assignIds = movingSection
            ? []
            : draggedIds.filter((id) => next.find((n) => n.id === id)?.type !== 'section');
          const withAssign = assignIds.length > 0
            ? assignDraggedNodesToSections(next, assignIds, canvasRef.current)
            : next;
          saveCanvasState(withAssign);
          return withAssign;
        });
      }
      nd.groupNodes = [];
      setDraggingNodeId(null);
      clearSectionDropHighlights(canvasRef.current);
    }

    if (nd.nodeId) {
      // 提交最终节点位置到 React state
      const rect = canvasRef.current?.getBoundingClientRect();
      const nodeEl = queryCanvasNodeRoot(canvasRef.current, nd.nodeId);
      if (nodeEl && rect) {
        const finalX = parseFloat(nodeEl.style.left);
        const finalY = parseFloat(nodeEl.style.top);
        const draggedId = nd.nodeId;
        setNodes(prev => {
          const next = prev.map(n =>
            n.id === draggedId ? { ...n, x: finalX, y: finalY } : n
          );
          const dragged = next.find((n) => n.id === draggedId);
          const withAssign =
            dragged && dragged.type !== 'section'
              ? assignDraggedNodesToSections(next, [draggedId], canvasRef.current)
              : next;
          saveCanvasState(withAssign);
          return withAssign;
        });
      }
      nd.nodeId = null;
      setDraggingNodeId(null);
      clearSectionDropHighlights(canvasRef.current);
    }

    cancelAnimationFrame(rafRef.current);
    if (hadGesture) unlockCanvasTextSelection();
  }, [canvasRef, setCanvasTransform, setIsDraggingCanvas, setNodes, setDraggingNodeId, setActiveTool, setSelectedNodeIds, setSelectedNodeId, nodes, maxZIndex, saveCanvasState, activeTool, storageStats]);

  /** 画布指针 → 内容坐标（须与 mousemove 拖拽同一公式，否则按下瞬间会跳） */
  const clientToCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const ct = getLiveTransform();
    if (!rect) {
      return { x: (clientX - ct.x) / ct.scale, y: (clientY - ct.y) / ct.scale };
    }
    return {
      x: (clientX - rect.left - ct.x) / ct.scale,
      y: (clientY - rect.top - ct.y) / ct.scale,
    };
  }, [canvasRef, getLiveTransform]);

  /** 读取节点当前 left/top：优先 DOM（拖拽中可能已偏离 React state） */
  const readNodeCanvasPos = useCallback((id: string, fallbackX: number, fallbackY: number) => {
    const el = queryCanvasNodeRoot(canvasRef.current, id);
    if (!el) return { x: fallbackX, y: fallbackY };
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    return {
      x: Number.isFinite(left) ? left : fallbackX,
      y: Number.isFinite(top) ? top : fallbackY,
    };
  }, [canvasRef]);

  /** 节点鼠标按下（启动节点拖拽并置顶） */
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number) => {
    // 空格 / 手形 / 中键：在节点上也应平移画布，不拖节点
    if (isSpaceDown || activeTool === 'hand' || e.button === 1) {
      e.stopPropagation();
      handleCanvasMouseDown(e);
      return;
    }

    if (activeTool === 'pointer') {
      e.stopPropagation();
      // 非输入框上按下时禁止拖出文字选区
      if (!isEditableDragTarget(e.target)) {
        blurActiveEditable();
        e.preventDefault();
        lockCanvasTextSelection();
      }
      setDraggingNodeId(nodeId);

      const { x: startX, y: startY } = clientToCanvasPoint(e.clientX, e.clientY);

      const targetNode = nodes.find(n => n.id === nodeId);
      const isSection = targetNode?.type === 'section';

      if (isSection) {
        const newZ = maxZIndex + 1;
        setMaxZIndex(newZ);
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, zIndex: newZ } : n));

        const childIds = targetNode.childrenNodeIds || [];
        const dragGroupIds = [nodeId, ...childIds];
        sharedNodeDrag.groupNodes = dragGroupIds.map(id => {
          const n = nodes.find(n => n.id === id);
          const pos = readNodeCanvasPos(id, n?.x || 0, n?.y || 0);
          return {
            id,
            offsetX: startX - pos.x,
            offsetY: startY - pos.y,
          };
        });
        sharedNodeDrag.nodeId = null;
      } else if (nodeId === 'group' || (selectedNodeIds.includes(nodeId) && selectedNodeIds.length > 1)) {
        // Dragging a group
        let minX = Infinity, minY = Infinity;
        selectedNodeIds.forEach(id => {
          const n = nodes.find(node => node.id === id);
          if (n) {
            const pos = readNodeCanvasPos(id, n.x, n.y);
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
          }
        });

        const dragGroup = selectedNodeIds.map(id => {
          const n = nodes.find(n => n.id === id);
          const pos = readNodeCanvasPos(id, n?.x || 0, n?.y || 0);
          return {
            id,
            offsetX: startX - pos.x,
            offsetY: startY - pos.y,
          };
        });

        // Add the group box itself so it moves with the selection during drag
        if (minX !== Infinity && minY !== Infinity) {
          dragGroup.push({
            id: 'group',
            offsetX: startX - minX,
            offsetY: startY - minY
          });
        }

        sharedNodeDrag.groupNodes = dragGroup;
        sharedNodeDrag.nodeId = null;
      } else {
        // Dragging a single node (or multi-selecting via ctrl/meta key)
        const newZ = maxZIndex + 1;
        setMaxZIndex(newZ);
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, zIndex: newZ } : n));

        const isMultiSelect = e.ctrlKey || e.metaKey;
        const live = readNodeCanvasPos(nodeId, nodeX, nodeY);

        if (isMultiSelect) {
          const isSelected = selectedNodeIds.includes(nodeId);
          const nextSelectedIds = isSelected 
            ? selectedNodeIds.filter(id => id !== nodeId)
            : [...selectedNodeIds, nodeId];

          if (nextSelectedIds.length > 1) {
            // 如果多选后有多个，按拖拽组处理
            let minX = Infinity, minY = Infinity;
            nextSelectedIds.forEach(id => {
              const n = nodes.find(node => node.id === id);
              if (n) {
                const pos = readNodeCanvasPos(id, n.x, n.y);
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
              }
            });

            const dragGroup = nextSelectedIds.map(id => {
              const n = nodes.find(node => node.id === id);
              const pos = readNodeCanvasPos(id, n?.x || 0, n?.y || 0);
              return {
                id,
                offsetX: startX - pos.x,
                offsetY: startY - pos.y,
              };
            });

            if (minX !== Infinity && minY !== Infinity) {
              dragGroup.push({
                id: 'group',
                offsetX: startX - minX,
                offsetY: startY - minY
              });
            }

            sharedNodeDrag.groupNodes = dragGroup;
            sharedNodeDrag.nodeId = null;
          } else {
            // 如果多选后只剩 1 个或没有，按单节点处理
            sharedNodeDrag.nodeId = nextSelectedIds[0] || null;
            sharedNodeDrag.offsetX = startX - live.x;
            sharedNodeDrag.offsetY = startY - live.y;
            sharedNodeDrag.groupNodes = [];
          }

          setSelectedNodeIds(nextSelectedIds);
          if (nextSelectedIds.length === 1) {
            setSelectedNodeId(nextSelectedIds[0]);
          } else {
            setSelectedNodeId(null);
          }
        } else {
          // 默认单选模式
          sharedNodeDrag.nodeId = nodeId;
          sharedNodeDrag.offsetX = startX - live.x;
          sharedNodeDrag.offsetY = startY - live.y;
          sharedNodeDrag.groupNodes = [];

          // If clicking a new single node, select it
          if (!selectedNodeIds.includes(nodeId) || selectedNodeIds.length > 1) {
            setSelectedNodeIds([nodeId]);
            setSelectedNodeId(nodeId);
          }
        }
      }

      nodeDragWindowCleanup?.();
      const onWinMove = (ev: MouseEvent) => {
        if (!sharedNodeDrag.nodeId && sharedNodeDrag.groupNodes.length === 0) return;
        handleCanvasMouseMove({
          clientX: ev.clientX,
          clientY: ev.clientY,
          preventDefault() {},
          stopPropagation() {},
        } as React.MouseEvent);
      };
      const onWinUp = () => {
        nodeDragWindowCleanup?.();
        nodeDragWindowCleanup = null;
        handleCanvasMouseUp();
      };
      nodeDragWindowCleanup = () => {
        window.removeEventListener('mousemove', onWinMove);
        window.removeEventListener('mouseup', onWinUp);
      };
      window.addEventListener('mousemove', onWinMove);
      window.addEventListener('mouseup', onWinUp);
    }
  }, [
    activeTool,
    isSpaceDown,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    maxZIndex,
    setDraggingNodeId,
    setMaxZIndex,
    setNodes,
    selectedNodeIds,
    nodes,
    setSelectedNodeIds,
    setSelectedNodeId,
    clientToCanvasPoint,
    readNodeCanvasPos,
  ]);

  /** 开始缩放节点 */
  const handleResizeStart = useCallback((e: React.MouseEvent, nodeId: string, direction: ResizeDirection) => {
    e.stopPropagation();
    blurActiveEditable();
    e.preventDefault();
    lockCanvasTextSelection();
    sharedResizeDrag.direction = direction;
    sharedResizeDrag.startMouseX = e.clientX;
    sharedResizeDrag.startMouseY = e.clientY;
    const startPtr = clientToCanvasPoint(e.clientX, e.clientY);
    sharedResizeDrag.startPointerX = startPtr.x;
    sharedResizeDrag.startPointerY = startPtr.y;
    sharedResizeDrag.previewAspect = 0;
    sharedResizeDrag.isFlowMedia = false;

    if (nodeId === 'group') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const groupNodes = nodes.filter(n => selectedNodeIds.includes(n.id) && !n.isHidden);
      if (groupNodes.length === 0) return;
      groupNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      });
      sharedResizeDrag.nodeId = 'group';
      sharedResizeDrag.startNodeX = minX;
      sharedResizeDrag.startNodeY = minY;
      sharedResizeDrag.startNodeW = maxX - minX;
      sharedResizeDrag.startNodeH = maxY - minY;
      sharedResizeDrag.groupStartNodes = groupNodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height }));
    } else {
      const targetNode = nodes.find(n => n.id === nodeId);
      if (!targetNode) return;
      const nodeEl = queryCanvasNodeRoot(canvasRef.current, nodeId);
      const measuredW = nodeEl?.offsetWidth || targetNode.width || 320;
      const measuredH = nodeEl?.offsetHeight || targetNode.height || 240;
      sharedResizeDrag.nodeId = nodeId;
      sharedResizeDrag.startNodeX = targetNode.x;
      sharedResizeDrag.startNodeY = targetNode.y;
      sharedResizeDrag.startNodeW = measuredW;
      sharedResizeDrag.startNodeH = measuredH;
      sharedResizeDrag.groupStartNodes = [];
      sharedResizeDrag.isFlowMedia = isLockedAspectNode(targetNode);
      if (sharedResizeDrag.isFlowMedia) {
        sharedResizeDrag.previewAspect =
          targetNode.taskData?.node_type === 'ai_video' ? 16 / 9 : 1;
      }
      nodeEl?.classList.add('is-resizing');
    }

    // window 级跟拖：移出节点/画布也不中断（原先只靠 canvas onMouseMove，角上手柄很容易丢事件）
    resizeWindowCleanup?.();
    const onWinMove = (ev: MouseEvent) => {
      if (!sharedResizeDrag.nodeId) return;
      // 复用画布 move 逻辑：构造最小事件对象
      handleCanvasMouseMove({
        clientX: ev.clientX,
        clientY: ev.clientY,
        preventDefault() {},
        stopPropagation() {},
      } as React.MouseEvent);
    };
    const onWinUp = () => {
      resizeWindowCleanup?.();
      resizeWindowCleanup = null;
      const el = sharedResizeDrag.nodeId && sharedResizeDrag.nodeId !== 'group'
        ? queryCanvasNodeRoot(canvasRef.current, sharedResizeDrag.nodeId)
        : null;
      el?.classList.remove('is-resizing');
      handleCanvasMouseUp();
    };
    resizeWindowCleanup = () => {
      window.removeEventListener('mousemove', onWinMove);
      window.removeEventListener('mouseup', onWinUp);
    };
    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mouseup', onWinUp);
  }, [nodes, selectedNodeIds, canvasRef, handleCanvasMouseMove, handleCanvasMouseUp, clientToCanvasPoint]);

  /** 移除节点 */
  const removeNode = useCallback((idOrIds: string | string[]) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return;

    setNodes(prev => {
      // 彻底移除所有选中的节点
      const filtered = prev.filter(n => !ids.includes(n.id));

      // 清理子节点的 parentId 如果其父节点被移除了
      const nextNodes = filtered.map(n => {
        let changed = false;
        const next = { ...n };

        if (next.parentId && ids.includes(next.parentId)) {
          next.parentId = undefined;
          changed = true;
        }

        if (next.inputConnections) {
          const nextConns = { ...next.inputConnections };
          let connsChanged = false;
          for (const [handleId, pId] of Object.entries(nextConns)) {
            if (typeof pId === 'string' && ids.includes(pId)) {
              delete nextConns[handleId];
              connsChanged = true;
            }
          }
          if (connsChanged) {
            next.inputConnections = nextConns;
            changed = true;
          }
        }

        return changed ? next : n;
      });

      const withClean = pruneSectionChildren(nextNodes);
      saveCanvasState(withClean);
      return withClean;
    });
  }, [setNodes, saveCanvasState]);

  /** 重置视图 */
  const resetView = useCallback(() => {
    setCanvasTransform({ x: 0, y: 0, scale: 1 });
  }, [setCanvasTransform]);

  /** 放大 — 以视口中心为锚点 */
  const zoomIn = useCallback(() => {
    const ct = transformRef.current;
    const newScale = Math.min(ct.scale * 1.25, 3);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = newScale / ct.scale;
      setCanvasTransform({ x: cx - (cx - ct.x) * ratio, y: cy - (cy - ct.y) * ratio, scale: newScale });
    } else {
      setCanvasTransform({ ...ct, scale: newScale });
    }
  }, [canvasRef, setCanvasTransform]);

  /** 缩小 — 以视口中心为锚点 */
  const zoomOut = useCallback(() => {
    const ct = transformRef.current;
    const newScale = Math.max(ct.scale / 1.25, 0.1);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = newScale / ct.scale;
      setCanvasTransform({ x: cx - (cx - ct.x) * ratio, y: cy - (cy - ct.y) * ratio, scale: newScale });
    } else {
      setCanvasTransform({ ...ct, scale: newScale });
    }
  }, [canvasRef, setCanvasTransform]);

  /** 缩放到 100% — 以视口中心为锚点 */
  const zoomTo100 = useCallback(() => {
    const ct = transformRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const ratio = 1 / ct.scale;
      setCanvasTransform({ x: cx - (cx - ct.x) * ratio, y: cy - (cy - ct.y) * ratio, scale: 1 });
    } else {
      setCanvasTransform({ x: 0, y: 0, scale: 1 });
    }
  }, [canvasRef, setCanvasTransform]);

  /** 将给定节点包围盒适配进视口 */
  const fitNodesIntoView = useCallback((targetNodes: typeof nodes) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || targetNodes.length === 0) {
      setCanvasTransform({ x: 0, y: 0, scale: 1 });
      return;
    }
    const padding = 80;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of targetNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    const viewW = rect.width - padding * 2;
    const viewH = rect.height - padding * 2;
    const newScale = Math.min(Math.max(Math.min(viewW / contentW, viewH / contentH), 0.1), 3);
    const newX = (rect.width - contentW * newScale) / 2 - minX * newScale;
    const newY = (rect.height - contentH * newScale) / 2 - minY * newScale;
    setCanvasTransform({ x: newX, y: newY, scale: newScale });
  }, [canvasRef, setCanvasTransform]);

  /** 缩放到适合所有节点 */
  const zoomToFit = useCallback(() => {
    fitNodesIntoView(nodes);
  }, [nodes, fitNodesIntoView]);

  /** 缩放到选中节点；无选中时回退为适应全部 */
  const zoomToSelection = useCallback(() => {
    const selected = selectedNodeIds.length > 0
      ? nodes.filter((n) => selectedNodeIds.includes(n.id) && !n.isHidden)
      : [];
    if (selected.length === 0) {
      fitNodesIntoView(nodes);
      return;
    }
    fitNodesIntoView(selected);
  }, [nodes, selectedNodeIds, fitNodesIntoView]);

  return {
    handleWheel,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleNodeMouseDown,
    handleResizeStart,
    removeNode,
    resetView,
    zoomIn,
    zoomOut,
    zoomTo100,
    zoomToFit,
    zoomToSelection,
    isGesturingRef,
  };
};
