/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Playground 双 Context 状态管理
 * 
 * 性能关键设计：将状态拆分为两个 Context
 * - CanvasContext: 高频变化（画布变换、拖拽状态）—— 仅画布相关组件订阅
 * - PlaygroundContext: 低频变化（模型、参数、token）—— 面板等 UI 组件订阅
 * 
 * 拖拽操作（画布/节点/面板）已改为 ref+DOM 驱动，不再于拖拽期间更新 Context
 */
import React, { createContext, useContext, useState, useMemo, useCallback, useRef } from 'react';
import type { CanvasNode, CanvasTransform, ActiveTool, Point, PlaygroundModel, SchemeParam, PlaygroundProject } from '../types';
import request from '../../../../utils/request';
import { extractImageUrl, extractVideoUrl } from '../utils/resultExtractor';
import { isReferenceAssetUrl } from '../utils/nodeHelpers';
import useSettingsStore from '../../../../store/settings';
import { message } from '../ui';
import toast from '../components/PlaygroundToast';
import { parseApiTimeAsUtc } from '../../../../utils/timedisplay';
import { loadApiTokens, pickSavedTokenKey } from '../utils/imageGenerationApi';
import { clampParamsToSchemeOptions, initSchemeParamDefaults } from '../utils/generationParams';
import {
  getUserPrefs,
  toggleFavoriteMid,
} from '../utils/userPrefsApi';
import { buildModelTaskDefaults, pickDefaultModel } from '../utils/flowDefaultModel';
import { sortModelsByBackendOrder } from '../utils/sortModelsByScheme';
import {
  autoLayoutCanvasNodes,
  boundsFromCanvasNodes,
  centerLayoutAroundOrigin,
  fitTransformToBounds,
  isTransformShowingBounds,
  isValidCanvasTransform,
  measureNodeBoundsFromDom,
  measureNodeSizesFromDom,
  refitSectionBoundsUsingDom,
} from '../utils/flowAutoLayout';
import { applyCanvasVisual, readCanvasTransformFromDom } from '../utils/canvasVisual';
import {
  canvasHasStaleBlobUrls,
  stripBlobUrlsFromNodes,
} from '../utils/stripCanvasBlobUrls';
import { flushSync } from 'react-dom';
const safeParseDate = (dateStr?: string | null): Date => {
  return parseApiTimeAsUtc(dateStr) ?? new Date(NaN);
};

/** 撤销/重做历史深度（past / future 各自上限） */
const HISTORY_LIMIT = 40;

// ============================================================
// Canvas Context — 高频交互状态
// ============================================================
interface CanvasContextValue {
  // 画布变换
  canvasTransform: CanvasTransform;
  setCanvasTransform: React.Dispatch<React.SetStateAction<CanvasTransform>>;
  // 活跃工具
  activeTool: ActiveTool;
  setActiveTool: React.Dispatch<React.SetStateAction<ActiveTool>>;
  // 键盘状态
  isSpaceDown: boolean;
  // 画布拖拽中标记（用于 cursor 样式）
  isDraggingCanvas: boolean;
  setIsDraggingCanvas: React.Dispatch<React.SetStateAction<boolean>>;
  // 节点拖拽
  draggingNodeId: string | null;
  setDraggingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  // 节点数据
  nodes: CanvasNode[];
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
  // zIndex
  maxZIndex: number;
  setMaxZIndex: React.Dispatch<React.SetStateAction<number>>;
  // ref
  canvasRef: React.RefObject<HTMLDivElement>;
  // 悬浮面板位置（仅初始化和 mouseup 时写入）
  settingsWidgetPos: Point;
  setSettingsWidgetPos: React.Dispatch<React.SetStateAction<Point>>;
  modelWidgetPos: Point;
  setModelWidgetPos: React.Dispatch<React.SetStateAction<Point>>;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedNodeIds: string[];
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
  connectingSourceId: string | null;
  setConnectingSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  /** 从入参口反向拖线：目标节点 + handle */
  connectingToInput: { nodeId: string; handleId: string } | null;
  setConnectingToInput: React.Dispatch<
    React.SetStateAction<{ nodeId: string; handleId: string } | null>
  >;
  connectingMousePos: Point | null;
  setConnectingMousePos: React.Dispatch<React.SetStateAction<Point | null>>;
  handleRearrange: (overrideNodes?: CanvasNode[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export const useCanvas = () => {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used within CanvasProvider');
  return ctx;
};

// ============================================================
// Playground Context — 低频业务状态
// ============================================================
interface PlaygroundContextValue {
  loading: boolean;
  models: PlaygroundModel[];
  selectedMid: string;
  setSelectedMid: React.Dispatch<React.SetStateAction<string>>;
  currentModel: PlaygroundModel | null;
  categories: string[];
  activeCategory: string;
  setActiveCategory: React.Dispatch<React.SetStateAction<string>>;
  modelsInCategory: PlaygroundModel[];
  searchModelKeyword: string;
  setSearchModelKeyword: React.Dispatch<React.SetStateAction<string>>;
  // 参数
  paramValues: Record<string, any>;
  setParamValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  initParamDefaults: (params: SchemeParam[]) => void;
  // 模型配置锁
  modelConfigs: Record<string, Record<string, any>>;
  saveModelConfig: (mid: string, values: Record<string, any>, notify?: boolean) => Promise<void>;
  deleteModelConfig: (mid: string) => Promise<void>;
  // prompt
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  // 生成
  generating: boolean;
  setGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  taskPollingNodes: string[];
  setTaskPollingNodes: React.Dispatch<React.SetStateAction<string[]>>;
  // token
  apiTokens: any[];
  setApiTokens: React.Dispatch<React.SetStateAction<any[]>>;
  selectedTokenKey: string;
  setSelectedTokenKey: React.Dispatch<React.SetStateAction<string>>;
  // UI 开关
  isModelDrawerVisible: boolean;
  setIsModelDrawerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isTokenModalVisible: boolean;
  setIsTokenModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsCollapsed: boolean;
  setIsSettingsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsWidgetVisible: boolean;
  setIsSettingsWidgetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isGenLogVisible: boolean;
  setIsGenLogVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isGenLogPinned: boolean;
  setIsGenLogPinned: React.Dispatch<React.SetStateAction<boolean>>;
  pageMode: 'normal' | 'node';
  setPageMode: React.Dispatch<React.SetStateAction<'normal' | 'node'>>;
  autoDisplayAssetDetails: boolean;
  setAutoDisplayAssetDetails: React.Dispatch<React.SetStateAction<boolean>>;
  autoDisplayPreviewDetails: boolean;
  setAutoDisplayPreviewDetails: React.Dispatch<React.SetStateAction<boolean>>;
  canvasSaveStatus: 'saved' | 'saving' | 'error';
  // 操作
  handleCategoryChange: (cat: string) => void;
  handleSelectModel: (mid: string) => void;
  // 项目管理
  projects: PlaygroundProject[];
  currentProjectId: number | null;
  setCurrentProjectId: React.Dispatch<React.SetStateAction<number | null>>;
  loadProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<number | null>;
  duplicateProject: (projectId: number, newName: string) => Promise<number | null>;
  saveCanvasState: (overrideNodes?: CanvasNode[]) => Promise<void>;
  // 素材附件
  attachedAssets: { asset: any; fullUrl: string; file?: File; options?: { role?: string } }[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<{ asset: any; fullUrl: string; file?: File }[]>>;
  // 存储统计
  storageStats: any;
  loadStorageStats: () => Promise<void>;
  // 聊天消息（与画布 nodes 隔离，但可内嵌 nodeId 渲染多媒体）
  chatMessages: { role: 'user' | 'assistant'; content: string; timestamp: number; nodeId?: string }[];
  setChatMessages: React.Dispatch<React.SetStateAction<{ role: 'user' | 'assistant'; content: string; timestamp: number; nodeId?: string }[]>>;
  streamingContent: string;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  defaultModelMids: string[];
  favorites: string[];
  toggleFavorite: (mid: string | number) => void;
  advancedNodesConfig: {
    enabled: boolean;
    preview_enabled: boolean;
    volc_enhance_enabled: boolean;
    volc_enhance_plugin_active: boolean;
    prompt_enabled?: boolean;
    ai_video_enabled?: boolean;
    ai_image_enabled?: boolean;
    asset_enabled?: boolean;
    director_enabled?: boolean;
    unified_limit_enabled?: boolean;
    unified_limit_value?: number;
    preview_limit?: number;
    volc_enhance_limit?: number;
    prompt_limit?: number;
    ai_video_limit?: number;
    ai_image_limit?: number;
    instance_limit?: number;
  } | null;
  activeSelectorNodeId: string | null;
  setActiveSelectorNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  openModelSelectorForNode: (nodeId: string) => void;
  activeSelectorNodeSelectedMid: string | number | null;
  /** 画布实体类型（已统一为 workflow；保留字段兼容顶栏文案分支） */
  entityKind: 'project' | 'workflow';
  entityApiBase: string;
  entityListPath: string;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export const usePlayground = () => {
  const ctx = useContext(PlaygroundContext);
  if (!ctx) throw new Error('usePlayground must be used within PlaygroundProvider');
  return ctx;
};

// ============================================================
// Combined Provider
// ============================================================
export const PlaygroundProvider: React.FC<{
  children: React.ReactNode;
  projectId: number;
  entityKind?: 'project' | 'workflow';
}> = ({ children, projectId, entityKind = 'workflow' }) => {
  const { settings } = useSettingsStore();
  const entityApiBase = '/playground-2026/workflows';
  const entityListPath = '/playground-2026/workflows';
  const entityLsPrefix = 'playground_2026_wf';

  // --- 低频业务状态 ---
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [selectedMid, setSelectedMid] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [searchModelKeyword, setSearchModelKeyword] = useState('');
  const [activeSelectorNodeId, setActiveSelectorNodeId] = useState<string | null>(null);
  const saveCanvasStateRef = React.useRef<any>(null);
  // 聊天消息状态（与画布 nodes 完全隔离）
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; timestamp: number; nodeId?: string }[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [modelConfigs, setModelConfigs] = useState<Record<string, Record<string, any>>>({});
  const [defaultModelMids, setDefaultModelMids] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [advancedNodesConfig, setAdvancedNodesConfig] = useState<{
    enabled: boolean;
    preview_enabled: boolean;
    volc_enhance_enabled: boolean;
    volc_enhance_plugin_active: boolean;
    prompt_enabled?: boolean;
    ai_video_enabled?: boolean;
    ai_image_enabled?: boolean;
    asset_enabled?: boolean;
    director_enabled?: boolean;
    unified_limit_enabled?: boolean;
    unified_limit_value?: number;
    preview_limit?: number;
    volc_enhance_limit?: number;
    prompt_limit?: number;
    ai_video_limit?: number;
    ai_image_limit?: number;
    instance_limit?: number;
  } | null>(null);

  const [canvasSaveStatus, setCanvasSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [generating, setGenerating] = useState(false);
  const [taskPollingNodes, setTaskPollingNodes] = useState<string[]>([]);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [isModelDrawerVisible, setIsModelDrawerVisible] = useState(() => {
    // 工作流画布（Imagine Flow）不自动弹出旧版模型抽屉，避免盖住左侧栏
    if (entityKind === 'workflow') return false;
    try {
      const savedModelMid = localStorage.getItem(`${entityLsPrefix}_selected_model_${projectId}`);
      if (savedModelMid) {
        return false;
      }
    } catch (e) {}
    return window.innerWidth > 768;
  });
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [isSettingsWidgetVisible, setIsSettingsWidgetVisible] = useState(false);
  const [isGenLogVisible, setIsGenLogVisible] = useState(false);
  const [isGenLogPinned, setIsGenLogPinned] = useState(false);
  const [autoDisplayAssetDetails, setAutoDisplayAssetDetailsState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pg2026_auto_display_asset_details');
      return saved !== 'false';
    } catch (e) {
      return true;
    }
  });

  const setAutoDisplayAssetDetails = useCallback((action: React.SetStateAction<boolean>) => {
    setAutoDisplayAssetDetailsState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem('pg2026_auto_display_asset_details', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const [autoDisplayPreviewDetails, setAutoDisplayPreviewDetailsState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pg2026_auto_display_preview_details');
      return saved !== 'false';
    } catch (e) {
      return true;
    }
  });

  const setAutoDisplayPreviewDetails = useCallback((action: React.SetStateAction<boolean>) => {
    setAutoDisplayPreviewDetailsState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem('pg2026_auto_display_preview_details', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const [pageMode, setPageModeState] = useState<'normal' | 'node'>(() => {
    // 工作流固定节点模式，不再提供「正常模式」
    if (entityKind === 'workflow') {
      return 'node';
    }
    try {
      const saved = localStorage.getItem(`${entityLsPrefix}_page_mode_${projectId}`);
      if (saved === 'node' || saved === 'normal') {
        return saved;
      }
    } catch (e) {}
    return 'normal';
  });

  const setPageMode = useCallback((action: React.SetStateAction<'normal' | 'node'>) => {
    setPageModeState(prev => {
      let next = typeof action === 'function' ? action(prev) : action;
      if (entityKind === 'workflow' && next === 'normal') {
        next = 'node';
      }
      try {
        localStorage.setItem(`${entityLsPrefix}_page_mode_${projectId}`, next);
      } catch (e) {}
      if (next === 'node') {
        setIsSettingsWidgetVisible(false);
        setIsModelDrawerVisible(false);
      }
      return next;
    });
  }, [projectId, entityKind, entityLsPrefix, setIsSettingsWidgetVisible, setIsModelDrawerVisible]);

  // 工作流进入画布时强制节点模式（清理历史 localStorage 的 normal）
  React.useEffect(() => {
    if (entityKind === 'workflow' && pageMode === 'normal') {
      setPageMode('node');
    }
  }, [entityKind, pageMode, setPageMode]);

  // 工作流壳下默认收起旧版模型抽屉（避免 relative 定位叠在左上角）
  React.useEffect(() => {
    if (entityKind === 'workflow') {
      setIsModelDrawerVisible(false);
      setIsSettingsWidgetVisible(false);
    }
  }, [entityKind, projectId, setIsModelDrawerVisible, setIsSettingsWidgetVisible]);

  const [attachedAssets, setAttachedAssets] = useState<{ asset: any; fullUrl: string; file?: File; options?: { role?: string } }[]>([]);

  // --- 项目管理 ---
  const [projects, setProjects] = useState<PlaygroundProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);

  // --- 高频画布状态 ---
  const [nodes, setNodesState] = useState<CanvasNode[]>([]);
  const nodesRef = useRef(nodes);

  // --- 撤销/重做历史状态管理 ---
  const pastRef = useRef<CanvasNode[][]>([]);
  const futureRef = useRef<CanvasNode[][]>([]);
  const lastSavedNodesRef = useRef<CanvasNode[] | null>(null);
  const historySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const cloneNodes = (ns: CanvasNode[]): CanvasNode[] => {
    return JSON.parse(JSON.stringify(ns));
  };

  const updateUndoRedoStates = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushToHistory = useCallback((newNodes: CanvasNode[]) => {
    const currentSaved = lastSavedNodesRef.current || [];
    if (JSON.stringify(currentSaved) === JSON.stringify(newNodes)) {
      return;
    }

    if (lastSavedNodesRef.current) {
      pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), lastSavedNodesRef.current];
    }
    
    lastSavedNodesRef.current = cloneNodes(newNodes);
    futureRef.current = [];
    
    updateUndoRedoStates();
  }, [updateUndoRedoStates]);

  const pushToHistoryDebounced = useCallback((newNodes: CanvasNode[]) => {
    if (historySaveTimerRef.current) {
      clearTimeout(historySaveTimerRef.current);
    }
    historySaveTimerRef.current = setTimeout(() => {
      pushToHistory(newNodes);
    }, 400);
  }, [pushToHistory]);

  const flushDebounce = useCallback(() => {
    if (historySaveTimerRef.current) {
      clearTimeout(historySaveTimerRef.current);
      historySaveTimerRef.current = null;
      pushToHistory(nodesRef.current);
    }
  }, [pushToHistory]);

  const undo = useCallback(() => {
    flushDebounce();
    if (pastRef.current.length === 0) return;

    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);

    if (lastSavedNodesRef.current) {
      futureRef.current = [...futureRef.current.slice(-(HISTORY_LIMIT - 1)), lastSavedNodesRef.current];
    }

    lastSavedNodesRef.current = cloneNodes(prev);
    setNodesState(prev);
    nodesRef.current = prev;
    saveCanvasStateRef.current?.(prev);

    updateUndoRedoStates();
  }, [flushDebounce, updateUndoRedoStates]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;

    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);

    if (lastSavedNodesRef.current) {
      pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), lastSavedNodesRef.current];
    }

    lastSavedNodesRef.current = cloneNodes(next);
    setNodesState(next);
    nodesRef.current = next;
    saveCanvasStateRef.current?.(next);

    updateUndoRedoStates();
  }, [updateUndoRedoStates]);

  const setNodes = useCallback((action: React.SetStateAction<CanvasNode[]>) => {
    setNodesState(prev => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      if (!Array.isArray(next)) return next;

      let currentMaxZ = Math.max(...prev.map(n => n.zIndex || 0), 10);
      let needsZUpdate = false;

      const cleaned = next.map((n: CanvasNode) => {
        const prevNode = prev.find(p => p.id === n.id);
        const isNewlyCompleted = n.status === 'completed' && (!prevNode || prevNode.status !== 'completed');

        let updatedTaskData = n.taskData;
        if ((n.status === 'completed' || n.status === 'error') && n.taskData?.token_key) {
          const { token_key, ...restTaskData } = n.taskData;
          updatedTaskData = restTaskData;
        }

        if (isNewlyCompleted) {
          needsZUpdate = true;
          currentMaxZ += 1;
          return {
            ...n,
            zIndex: currentMaxZ,
            taskData: updatedTaskData
          };
        }

        if (updatedTaskData !== n.taskData) {
          return { ...n, taskData: updatedTaskData };
        }
        return n;
      });

      if (needsZUpdate) {
        setMaxZIndex(currentMaxZ);
      }

      nodesRef.current = cleaned;

      // 自动维护撤销/重做历史基准
      if (lastSavedNodesRef.current === null) {
        lastSavedNodesRef.current = cloneNodes(cleaned);
      } else {
        pushToHistoryDebounced(cleaned);
      }

      return cleaned;
    });
  }, [pushToHistoryDebounced]);
  const [canvasTransform, setCanvasTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState<ActiveTool>('pointer');
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [settingsWidgetPos, setSettingsWidgetPos] = useState<Point>({ x: window.innerWidth - 440, y: 32 });
  const [modelWidgetPos, setModelWidgetPos] = useState<Point>({ x: window.innerWidth - 480, y: 100 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [connectingToInput, setConnectingToInput] = useState<{
    nodeId: string;
    handleId: string;
  } | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState<Point | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null!);

  // --- 派生数据 ---
  const currentModel = useMemo(() => models.find(m => m.mid === selectedMid) || null, [selectedMid, models]);

  const categories = useMemo(() => {
    let cats = [...new Set(models.map(m => m.scheme_type || m.type_name))].filter(Boolean);
    
    const activeSelectorNode = nodes.find(n => n.id === activeSelectorNodeId);
    if (
      activeSelectorNode?.taskData?.node_type === 'ai_image' ||
      activeSelectorNode?.taskData?.node_type === 'ai_video'
    ) {
      cats = cats.filter(
        cat =>
          cat.toLowerCase().includes('image') ||
          cat.includes('图') ||
          cat.toLowerCase().includes('video') ||
          cat.includes('视')
      );
    }

    const getWeight = (cat: string) => {
      const lower = cat.toLowerCase();
      if (lower.includes('图') || lower.includes('image')) return 100;
      if (lower.includes('视') || lower.includes('video')) return 90;
      if (lower.includes('聊') || lower.includes('对话') || lower.includes('chat') || lower.includes('文本') || lower.includes('text')) return 80;
      return 0;
    };
    cats.sort((a, b) => getWeight(b) - getWeight(a));
    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    if (mids.length > 0 || favorites.length > 0) {
      return ['默认展示', ...cats];
    }
    return cats;
  }, [models, defaultModelMids, favorites, activeSelectorNodeId, nodes]);

  const modelsInCategory = useMemo(() => {
    if (activeCategory === '默认展示') {
      const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
      const combinedMidsStr = Array.from(new Set([...mids, ...favorites])).map(String);
      let list = models.filter(m => combinedMidsStr.includes(String(m.mid)));
      
      // 如果正在为节点配置模型，在“默认展示”里只保留图片或视频类型
      if (activeSelectorNodeId) {
        list = list.filter(m => {
          const lowerType = (m.scheme_type || m.type_name || '').toLowerCase();
          return lowerType.includes('image') || lowerType.includes('图') || lowerType.includes('video') || lowerType.includes('视');
        });
      }

      return sortModelsByBackendOrder(
        list.filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase())),
      );
    }
    return sortModelsByBackendOrder(
      models
        .filter(m => (m.scheme_type || m.type_name) === activeCategory)
        .filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase())),
    );
  }, [models, activeCategory, searchModelKeyword, defaultModelMids, favorites, activeSelectorNodeId]);

  // --- Favorites（服务端 prefs，localStorage 仅作一次性迁移源）---
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await getUserPrefs();
        if (!cancelled) setFavorites(prefs.favorite_mids.map(String));
      } catch (e) {
        console.warn('[playground_2026] 加载模型收藏失败', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = useCallback((mid: string | number) => {
    const midStr = String(mid);
    const prevStrs = favorites.map(String);
    const currentlyFavorited = prevStrs.includes(midStr);
    const next = currentlyFavorited
      ? prevStrs.filter((id) => id !== midStr)
      : [...prevStrs, midStr];
    setFavorites(next);
    void toggleFavoriteMid(midStr, currentlyFavorited)
      .then((prefs) => {
        setFavorites(prefs.favorite_mids.map(String));
      })
      .catch((e) => {
        setFavorites(prevStrs);
        toast.error(e?.message || '收藏同步失败');
      });
  }, [favorites]);

  // --- 回调 ---
  const initParamDefaults = useCallback((params: SchemeParam[]) => {
    setParamValues(initSchemeParamDefaults(params));
  }, []);

  const applyModelParamValues = useCallback((model: PlaygroundModel, mid: string) => {
    const locked = modelConfigs[mid];
    if (locked && typeof locked === 'object') {
      setParamValues(
        clampParamsToSchemeOptions(
          { ...initSchemeParamDefaults(model.params), ...locked },
          model.params,
        ),
      );
      return;
    }
    initParamDefaults(model.params);
  }, [modelConfigs, initParamDefaults]);

  const handleCategoryChange = useCallback((cat: string) => {
    setActiveCategory(cat);
    if (cat === '默认展示') {
      const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
      const combinedMidsStr = Array.from(new Set([...mids, ...favorites])).map(String);
      const first = models.find(m => combinedMidsStr.includes(String(m.mid)));
      if (first) {
        setSelectedMid(first.mid);
        applyModelParamValues(first, first.mid);
      }
      return;
    }

    const typeModels = models.filter(m => (m.scheme_type || m.type_name) === cat);
    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    const combinedMidsStr = Array.from(new Set([...mids, ...favorites])).map(String);
    const defModel = typeModels.find(m => combinedMidsStr.includes(String(m.mid)));
    if (defModel) {
      setSelectedMid(defModel.mid);
      applyModelParamValues(defModel, defModel.mid);
    } else {
      const first = models.find(m => (m.scheme_type || m.type_name) === cat);
      if (first) {
        setSelectedMid(first.mid);
        applyModelParamValues(first, first.mid);
      }
    }
  }, [models, defaultModelMids, favorites, applyModelParamValues]);

  const handleSelectModel = useCallback((mid: string) => {
    const prevModel = models.find(m => m.mid === selectedMid);
    const nextModel = models.find(m => m.mid === mid);

    // 确定是否正在为当前选中的节点（或者由节点输入框调起的节点）更改模型
    const activeNodeId = activeSelectorNodeId || (isSettingsWidgetVisible ? selectedNodeId : null);
    let activeNode = null;
    let isTargetGeneratorNode = false;
    if (activeNodeId) {
      activeNode = nodes.find(n => n.id === activeNodeId);
      if (activeNode?.taskData?.node_type === 'ai_image' || activeNode?.taskData?.node_type === 'ai_video') {
        isTargetGeneratorNode = true;
      }
    }

    if (isTargetGeneratorNode && activeNodeId) {
      if (nextModel) {
        const modelCat = (nextModel.scheme_type || nextModel.type_name || '').toLowerCase();
        let targetNodeType = activeNode?.taskData?.node_type;
        let targetType: "video" | "image" | "text" | "audio" | "section" = activeNode?.type || 'video';
        if (modelCat.includes('video') || modelCat.includes('视')) {
          targetNodeType = 'ai_video';
          targetType = 'video';
        } else if (modelCat.includes('image') || modelCat.includes('图')) {
          targetNodeType = 'ai_image';
          targetType = 'image';
        }

        const modelDefaults = buildModelTaskDefaults(nextModel);
        const aspect_ratio = modelDefaults.aspect_ratio || modelDefaults.aspectRatio || '16:9 宽屏宽幅';
        const duration = modelDefaults.duration || '5秒';
        const motion = modelDefaults.motion || '中 (推荐)';

        const isBatch = selectedNodeIds.includes(activeNodeId) && selectedNodeIds.length > 1;
        const targetNodeIds = isBatch
          ? selectedNodeIds.filter(id => {
              const n = nodes.find(item => item.id === id);
              return n?.taskData?.node_type === 'ai_image' || n?.taskData?.node_type === 'ai_video';
            })
          : [activeNodeId];

        const nextNodes = nodes.map(n => {
          if (targetNodeIds.includes(n.id)) {
            let itemNodeType = n.taskData?.node_type;
            let itemType = n.type || 'video';
            if (modelCat.includes('video') || modelCat.includes('视')) {
              itemNodeType = 'ai_video';
              itemType = 'video';
            } else if (modelCat.includes('image') || modelCat.includes('图')) {
              itemNodeType = 'ai_image';
              itemType = 'image';
            }

            // 切换模型：用新方案默认参数+IO 覆盖旧方案字段，保留 prompt / 连线数据
            const isNoNegModel =
              nextModel.scheme_id === 'openai_video' ||
              nextModel.scheme_id === 'seedance2.0' ||
              nextModel.scheme_id === 'seedance2' ||
              nextModel.scheme_id === 'wan3.0' ||
              nextModel.scheme_id === 'dashscope_video';
            const keepPrompt = n.taskData?.prompt;
            const keepNeg = isNoNegModel ? undefined : (n.taskData?.negative_prompt ?? n.taskData?.negativePrompt);
            const keepManualSockets = n.taskData?.manualSocketCounts;
            return {
              ...n,
              type: itemType,
              taskData: {
                ...modelDefaults,
                node_type: itemNodeType,
                aspect_ratio,
                duration,
                motion,
                ...(keepPrompt != null ? { prompt: keepPrompt } : {}),
                ...(keepNeg != null ? { negative_prompt: keepNeg } : {}),
                ...(keepManualSockets ? { manualSocketCounts: keepManualSockets } : {}),
              }
            };
          }
          if (n.parentId && targetNodeIds.includes(n.parentId) && n.taskData?.node_type === 'preview') {
            let itemType = n.type;
            if (modelCat.includes('video') || modelCat.includes('视')) {
              itemType = 'video';
            } else if (modelCat.includes('image') || modelCat.includes('图')) {
              itemType = 'image';
            }
            return {
              ...n,
              type: itemType
            };
          }
          return n;
        });
        setNodes(nextNodes);
        saveCanvasStateRef.current?.(nextNodes);
        toast.success(`已为选择的节点更改大模型: ${nextModel.name || nextModel.model_id}`);
        setSelectedMid(mid);
        applyModelParamValues(nextModel, mid);
      }
      setActiveSelectorNodeId(null);
      setIsModelDrawerVisible(false);
      setIsSettingsWidgetVisible(true);
      return;
    }

    setSelectedMid(mid);
    if (mid) {
      localStorage.setItem(`${entityLsPrefix}_selected_model_${projectId}`, mid);
    } else {
      localStorage.removeItem(`${entityLsPrefix}_selected_model_${projectId}`);
    }
    if (nextModel) {
      applyModelParamValues(nextModel, mid);
      setIsSettingsWidgetVisible(true);
    } else {
      setIsSettingsWidgetVisible(false);
    }
    setIsModelDrawerVisible(false);
    // 跨类型切换时清空聊天消息
    if (prevModel?.scheme_type !== nextModel?.scheme_type) {
      setChatMessages([]);
      setStreamingContent('');
    }
  }, [models, selectedMid, applyModelParamValues, setChatMessages, setStreamingContent, setIsSettingsWidgetVisible, projectId, activeSelectorNodeId, selectedNodeId, isSettingsWidgetVisible, nodes, setNodes, selectedNodeIds]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await request.get(entityApiBase) as any;
      const list = Array.isArray(res?.workflows)
        ? res.workflows
        : Array.isArray(res?.projects)
          ? res.projects
          : null;
      if (Array.isArray(list)) {
        setProjects(list);
      }
    } catch (e) {
      console.error(entityKind === 'workflow' ? '加载工作流列表失败' : '加载项目列表失败', e);
    }
  }, [entityApiBase, entityKind]);

  const saveModelConfig = useCallback(async (mid: string, values: Record<string, any>, notify = true) => {
    try {
      await request.post('/playground-2026/model-configs', {
        model_mid: mid,
        param_values: JSON.stringify(values),
        is_locked: 1
      });
      setModelConfigs(prev => ({
        ...prev,
        [mid]: values
      }));
    } catch (e) {
      console.error('保存模型配置失败', e);
    }
  }, []);

  const deleteModelConfig = useCallback(async (mid: string) => {
    try {
      await request.delete(`/playground-2026/model-configs/${mid}`);
      setModelConfigs(prev => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });
      // 恢复系统默认值
      const model = models.find(m => m.mid === mid);
      if (model) {
        const defaults: Record<string, any> = {};
        for (const p of model.params) defaults[p.key] = p.default;
        setParamValues(defaults);
      }
    } catch (e) {
      console.error('删除模型配置失败', e);
    }
  }, [models]);

  const loadStorageStats = useCallback(async () => {
    try {
      const res = await request.get('/playground-2026/storage-stats') as any;
      setStorageStats(res);
    } catch (e) {
      console.error('加载存储统计失败', e);
    }
  }, []);

  const createProject = useCallback(async (name?: string): Promise<number | null> => {
    try {
      const defaultName =
        entityKind === 'workflow' ? '未命名工作流' : '未命名项目';
      const res = await request.post(entityApiBase, { name: name || defaultName }) as any;
      if (res?.id) {
        setCurrentProjectId(res.id);
        await loadProjects();
        return res.id;
      }
    } catch (e) {
      console.error(entityKind === 'workflow' ? '创建工作流失败' : '创建项目失败', e);
    }
    return null;
  }, [loadProjects, entityApiBase, entityKind]);

  const duplicateProject = useCallback(async (projectId: number, newName: string): Promise<number | null> => {
    try {
      const resGet = await request.get(`${entityApiBase}/${projectId}`) as any;
      const canvasData = resGet?.project?.canvas_data || resGet?.workflow?.canvas_data;

      const resCreate = await request.post(entityApiBase, { name: newName }) as any;
      if (resCreate?.id) {
        const newPid = resCreate.id;
        if (canvasData) {
          await request.post(`${entityApiBase}/${newPid}/save-canvas`, { canvas_data: canvasData });
        }
        await loadProjects();
        return newPid;
      }
    } catch (e) {
      console.error(entityKind === 'workflow' ? '复制工作流失败' : '复制项目失败', e);
    }
    return null;
  }, [loadProjects, entityApiBase, entityKind]);


  const transformRef2 = React.useRef(canvasTransform);
  transformRef2.current = canvasTransform;
  const projectIdRef = React.useRef(currentProjectId);
  projectIdRef.current = currentProjectId;

  /** 保存时优先读 DOM 视角，避免滚轮/平移防抖窗口内写入旧 transform */
  const resolvePersistTransform = useCallback(() => {
    const layer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
    const live = readCanvasTransformFromDom(layer);
    if (live && isValidCanvasTransform(live)) {
      transformRef2.current = live;
      return live;
    }
    return transformRef2.current;
  }, []);

  /**
   * 加载后校验节点是否在视口内；坏视角或缺失 transform 时自动 fit。
   * 等画布尺寸就绪后再测，避免进场 splash / 布局未完成时误判。
   */
  const ensureNodesVisibleInViewport = useCallback((
    loadedNodes: CanvasNode[],
    savedTransform?: { x?: number; y?: number; scale?: number } | null,
  ) => {
    let attempts = 0;
    const apply = () => {
      attempts += 1;
      const canvasEl = canvasRef.current;
      const rect = canvasEl?.getBoundingClientRect();
      const vw = rect?.width || 0;
      const vh = rect?.height || 0;
      if ((vw < 80 || vh < 80) && attempts < 24) {
        requestAnimationFrame(apply);
        return;
      }

      const viewport = {
        width: vw || Math.max(window.innerWidth - 57, 320),
        height: vh || window.innerHeight,
      };
      const bounds =
        measureNodeBoundsFromDom(canvasEl) || boundsFromCanvasNodes(loadedNodes);
      if (!bounds) return;

      const keepSaved =
        isValidCanvasTransform(savedTransform) &&
        isTransformShowingBounds(savedTransform, bounds, viewport);

      const next = keepSaved
        ? savedTransform
        : fitTransformToBounds(bounds, viewport, {
            padding: 64,
            insets: { top: 48, bottom: 56, left: 24, right: 24 },
            contentOverhang: { top: 28, bottom: 8, left: 8, right: 8 },
            maxScale: 1,
          });

      transformRef2.current = next;
      setCanvasTransform(next);
      const layer = canvasEl?.querySelector('.transform-layer') as HTMLElement | null;
      applyCanvasVisual(canvasEl, layer, next.x, next.y, next.scale);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });
  }, [setCanvasTransform]);

  const saveCanvasState = useCallback(async (overrideNodes?: CanvasNode[]) => {
    const pid = projectIdRef.current;
    if (!pid) return;

    // 异步 setState 未落盘时，调用方可能误传 []，禁止用空数组覆盖当前画布
    if (
      Array.isArray(overrideNodes) &&
      overrideNodes.length === 0 &&
      nodesRef.current.length > 0
    ) {
      console.warn('[saveCanvasState] 拒绝用空节点列表覆盖当前画布，避免刷新后工作流丢失');
      return;
    }

    setCanvasSaveStatus('saving');
    try {
      const targetNodes = stripBlobUrlsFromNodes(
        overrideNodes || nodesRef.current,
        'all',
      );
      const persistTransform = resolvePersistTransform();
      const canvasData = JSON.stringify({
        nodes: targetNodes.filter(n => !n.id.startsWith('local-asset-')).map(n => {
          let savedResultData = n.resultData;
          let savedTaskData = n.taskData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              // 优先 resultData（含多图）；仅无结果时回退旧 tos_url，避免二次生成被旧入库地址盖住
              const fromResult = (() => {
                const data = n.resultData?.data;
                if (Array.isArray(data) && data.length > 0) {
                  const urls = data
                    .map((item: any) => (typeof item === 'string' ? item : item?.url || item?.b64_json))
                    .filter((u: any): u is string => typeof u === 'string' && !!u);
                  if (urls.length) return urls;
                }
                const one = extractImageUrl(n.resultData);
                return one ? [one] : [];
              })();
              const urls = fromResult.length
                ? fromResult
                : n.taskData?.tos_url
                  ? [n.taskData.tos_url]
                  : [];
              const activeIndex = Number(
                n.resultData?.content?.active_index ?? n.taskData?.active_result_index ?? 0,
              );
              savedResultData = urls.length
                ? {
                    data: urls.map((url: string) => ({ url })),
                    content: {
                      ...(typeof n.resultData?.content === 'object' && n.resultData.content
                        ? n.resultData.content
                        : {}),
                      active_index: Number.isFinite(activeIndex) ? activeIndex : 0,
                    },
                  }
                : null;
              if (savedTaskData && 'tos_url' in savedTaskData) {
                const { tos_url, ...rest } = savedTaskData;
                savedTaskData = rest;
              }
            } else if (n.type === 'video') {
              const videoUrl = extractVideoUrl(n.resultData);
              const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
              // 同图片：优先本次结果，避免旧 tos_url 覆盖新视频
              const finalVideoUrl = videoUrl || n.taskData?.tos_url;
              savedResultData = finalVideoUrl ? { content: { video_url: finalVideoUrl, last_frame_url: lastFrameUrl } } : null;
              if (savedTaskData && 'tos_url' in savedTaskData) {
                const { tos_url, ...rest } = savedTaskData;
                savedTaskData = rest;
              }
            } else {
              // 文本类型保留原始数据
              savedResultData = n.resultData;
            }
          }
          return {
            id: n.id, type: n.type, status: n.status,
            x: n.x, y: n.y, width: n.width, height: n.height, zIndex: n.zIndex,
            taskData: savedTaskData, resultData: savedResultData,
            parentId: n.parentId,
            isHidden: n.isHidden,
            inputConnections: n.inputConnections,
            childrenNodeIds: n.childrenNodeIds,
            title: n.title,
            backgroundColor: n.backgroundColor,
            isInstance: n.isInstance,
          };
        }),
        transform: persistTransform,
      });
      await request.post(`${entityApiBase}/${pid}/save-canvas`, { canvas_data: canvasData });
      setCanvasSaveStatus('saved');
    } catch (e) {
      console.warn('画布状态保存失败', e);
      setCanvasSaveStatus('error');
    }
  }, [entityApiBase, resolvePersistTransform]);
  saveCanvasStateRef.current = saveCanvasState;

  const handleRearrange = useCallback((targetNodesList?: CanvasNode[]) => {
    const currentNodes = targetNodesList || nodesRef.current;
    const visible = currentNodes.filter((n) => !n.isHidden);
    if (visible.length === 0) {
      setCanvasTransform({ x: 0, y: 0, scale: 1 });
      toast.info('画布无内容，已重置视角');
      return;
    }

    // 布局前用当前 DOM 真实宽高（修正 asset / ai_* 的 height:auto 低估）
    const sizes = measureNodeSizesFromDom(canvasRef.current);
    const laidOut = autoLayoutCanvasNodes(currentNodes, { sizes });
    // 先按估算包围盒挪到原点附近，便于后续 DOM 测量
    let nextNodes = centerLayoutAroundOrigin(laidOut.nodes, laidOut.bounds).nodes;

    flushSync(() => {
      setNodes(nextNodes);
    });

    const applyCenteredView = () => {
      const canvasEl = canvasRef.current;
      const rect = canvasEl?.getBoundingClientRect();
      const viewport = {
        width: rect?.width || Math.max(window.innerWidth - 57, 320),
        height: rect?.height || window.innerHeight,
      };

      // 渲染后再用含缩略 tab 的真实占位撑开区块
      nextNodes = refitSectionBoundsUsingDom(nextNodes, canvasEl);
      flushSync(() => {
        setNodes(nextNodes);
      });

      // 用真实渲染尺寸再居中一次（修正 ai_image 等 height:auto 的偏差）
      const measured = measureNodeBoundsFromDom(canvasEl);
      let bounds = measured || laidOut.bounds;
      if (measured) {
        const recentered = centerLayoutAroundOrigin(nextNodes, measured);
        nextNodes = recentered.nodes;
        bounds = recentered.bounds;
        flushSync(() => {
          setNodes(nextNodes);
        });
      }

      const nextTransform = fitTransformToBounds(bounds, viewport, {
        padding: 64,
        insets: { top: 48, bottom: 56, left: 24, right: 24 },
        contentOverhang: { top: 28, bottom: 8, left: 8, right: 8 },
        maxScale: 1,
      });
      transformRef2.current = nextTransform;
      setCanvasTransform(nextTransform);
      const layer = canvasEl?.querySelector('.transform-layer') as HTMLElement | null;
      applyCanvasVisual(
        canvasEl,
        layer,
        nextTransform.x,
        nextTransform.y,
        nextTransform.scale,
      );
      void saveCanvasState(nextNodes);
    };

    requestAnimationFrame(() => {
      // 再等一帧，让 height:auto 节点完成布局后再测包围盒
      requestAnimationFrame(() => {
        applyCenteredView();
      });
    });
    toast.success('已整理布局');
  }, [setNodes, saveCanvasState, setCanvasTransform]);

  // --- Tab Title Synchronization ---
  React.useEffect(() => {
    const siteName = settings?.site?.name || 'AI 创作中心2026';
    const currentProject = projects.find(p => p.id === currentProjectId);
    const projectName = currentProject?.name || '未命名项目';
    document.title = `${projectName}-${siteName}`;
  }, [settings, projects, currentProjectId]);

  // --- 1秒防抖后台自动同步模型配置参数 ---
  React.useEffect(() => {
    if (!selectedMid || !modelConfigs[selectedMid]) return;
    const timer = setTimeout(() => {
      if (JSON.stringify(paramValues) !== JSON.stringify(modelConfigs[selectedMid])) {
        saveModelConfig(selectedMid, paramValues, false); // 静默后台保存，不弹出提示
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [paramValues, selectedMid, modelConfigs, saveModelConfig]);

  // --- 初始化数据加载 ---
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [configRes, tokens, configsRes] = await Promise.all([
          request.get('/plugins/playground_2026/playground-public-config') as Promise<any>,
          loadApiTokens(),
          request.get('/playground-2026/model-configs').catch(() => ({ configs: [] })) as Promise<any>
        ]);

        const configMap: Record<string, Record<string, any>> = {};
        if (configsRes?.configs && Array.isArray(configsRes.configs)) {
          for (const item of configsRes.configs) {
            try {
              configMap[item.model_mid] = JSON.parse(item.param_values);
            } catch (e) {
              console.error('解析锁定的模型配置参数失败', e);
            }
          }
          setModelConfigs(configMap);
        }

        const enabledModels: PlaygroundModel[] = configRes?.models || [];
        const rawDefaultModelMids = configRes?.default_model_mids;
        let midsArray: string[] = [];
        if (Array.isArray(rawDefaultModelMids)) {
          midsArray = rawDefaultModelMids;
        } else if (typeof rawDefaultModelMids === 'object' && rawDefaultModelMids !== null) {
          midsArray = Object.values(rawDefaultModelMids).filter(v => typeof v === 'string') as string[];
        }
        setModels(enabledModels);
        setDefaultModelMids(midsArray);

        if (configRes?.advanced_nodes) {
          setAdvancedNodesConfig(configRes.advanced_nodes);
        }

        if (enabledModels.length > 0) {
          const cats = [...new Set(enabledModels.map(m => m.scheme_type || m.type_name))].filter(Boolean);
          const getWeight = (cat: string) => {
            const lower = cat.toLowerCase();
            if (lower.includes('图') || lower.includes('image')) return 100;
            if (lower.includes('视') || lower.includes('video')) return 90;
            if (lower.includes('聊') || lower.includes('对话') || lower.includes('chat') || lower.includes('文本') || lower.includes('text')) return 80;
            return 0;
          };
          cats.sort((a, b) => getWeight(b) - getWeight(a));

          let firstCat = cats[0] || '';
          let defaultModel: PlaygroundModel | null = null;

          let storedFavorites: string[] = [];
          try {
            const prefs = await getUserPrefs();
            storedFavorites = prefs.favorite_mids.map(String);
            setFavorites(storedFavorites);
          } catch (e) {
            console.warn('[playground_2026] 初始化读取模型收藏失败', e);
          }

          if (midsArray.length > 0 || storedFavorites.length > 0) {
            firstCat = '默认展示';
            const combinedMidsStr = [...midsArray, ...storedFavorites].map(String);
            defaultModel = enabledModels.find(m => combinedMidsStr.includes(String(m.mid))) || null;
          }

          // 一进入项目，检查是否有先前退出时选中的模型
          const savedModelMid = localStorage.getItem(`${entityLsPrefix}_selected_model_${projectId}`);
          const isNodeMode =
            entityKind === 'workflow' ||
            localStorage.getItem(`${entityLsPrefix}_page_mode_${projectId}`) === 'node';
          if (savedModelMid && enabledModels.some(m => m.mid === savedModelMid)) {
            setSelectedMid(savedModelMid);
            const matchedModel = enabledModels.find(m => m.mid === savedModelMid);
            if (matchedModel) {
              const matchedCat = matchedModel.scheme_type || matchedModel.type_name || '';
              if (matchedCat) {
                setActiveCategory(matchedCat);
              }
              if (configMap[savedModelMid]) {
                setParamValues(configMap[savedModelMid]);
              } else {
                const defaults: Record<string, any> = {};
                for (const p of matchedModel.params) defaults[p.key] = p.default;
                setParamValues(defaults);
              }
            }
            if (isNodeMode) {
              setIsSettingsWidgetVisible(false);
              setIsModelDrawerVisible(false);
            } else {
              setIsSettingsWidgetVisible(true);
              setIsModelDrawerVisible(false);
            }
          } else {
            setSelectedMid('');
            setActiveCategory(firstCat);
            setIsSettingsWidgetVisible(false);
            // 工作流 / 节点模式：不自动打开模型抽屉
            setIsModelDrawerVisible(isNodeMode ? false : window.innerWidth > 768);
          }
        }

        if (Array.isArray(tokens)) {
          setApiTokens(tokens);
          const preferred = pickSavedTokenKey(tokens);
          if (preferred) {
            setSelectedTokenKey(preferred);
          }
        }
      } catch (e) {
        console.error('Data initialization failed', e);
      } finally {
        setLoading(false);
      }
      loadStorageStats();
    })();
  }, [loadStorageStats]);

  // 监听 isModelDrawerVisible 改变，当关闭时清空 activeSelectorNodeId
  React.useEffect(() => {
    if (!isModelDrawerVisible) {
      setActiveSelectorNodeId(null);
    }
  }, [isModelDrawerVisible]);

  // 打开节点模型选择器
  const openModelSelectorForNode = useCallback((nodeId: string) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return;

    setActiveSelectorNodeId(nodeId);
    // 工作流属性面板与模型抽屉可并存（抽屉 fixed 盖在属性上方）
    setIsSettingsWidgetVisible(true);

    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    if (mids.length > 0 || favorites.length > 0) {
      setActiveCategory('默认展示');
    } else {
      let targetCat = '';
      const cats = [...new Set(models.map(m => m.scheme_type || m.type_name))].filter(Boolean);
      if (targetNode.taskData?.node_type === 'ai_image') {
        targetCat = cats.find(cat => cat.toLowerCase().includes('image') || cat.includes('图')) || '';
      } else if (targetNode.taskData?.node_type === 'ai_video') {
        targetCat = cats.find(cat => cat.toLowerCase().includes('video') || cat.includes('视')) || '';
      }

      if (targetCat) {
        setActiveCategory(targetCat);
      }
    }
    setIsModelDrawerVisible(true);
  }, [nodes, models, defaultModelMids, favorites, setIsModelDrawerVisible, setIsSettingsWidgetVisible, setActiveCategory]);

  const activeSelectorNodeSelectedMid = useMemo(() => {
    if (!activeSelectorNodeId) return null;
    const node = nodes.find(n => n.id === activeSelectorNodeId);
    return node?.taskData?.modelMid || null;
  }, [nodes, activeSelectorNodeId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNodeModelMid = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find(n => n.id === selectedNodeId);
    return node?.taskData?.modelMid || null;
  }, [nodes, selectedNodeId]);

  const modelConfigsRef = useRef(modelConfigs);
  modelConfigsRef.current = modelConfigs;
  const paramValuesRef = useRef(paramValues);
  paramValuesRef.current = paramValues;
  const prevSelectedNodeIdForSettingsRef = useRef<string | null>(null);

  // 监听选中的节点：图片/视频自动打开右侧属性；预览仅在「切换选中」时关闭（属性由操作栏「信息」打开）
  // 注意：不把 modelConfigs 放进依赖，避免静默保存配置后反复 setParamValues 形成更新风暴
  React.useEffect(() => {
    const selectionChanged = prevSelectedNodeIdForSettingsRef.current !== selectedNodeId;
    prevSelectedNodeIdForSettingsRef.current = selectedNodeId;

    if (selectedNodeId) {
      const node = nodesRef.current.find(n => n.id === selectedNodeId);
      if (node?.taskData?.node_type === 'ai_image' || node?.taskData?.node_type === 'ai_video') {
        // 工作流：选中 AI 节点始终打开右侧属性面板（模型+参数）
        setIsModelDrawerVisible(false);
        if (selectionChanged) {
          setIsSettingsWidgetVisible(true);
        }

        const kind = node.taskData.node_type === 'ai_video' ? 'video' as const : 'image' as const;
        let modelMid = node.taskData?.modelMid as string | undefined;

        // 未设置模型时尝试默认；无可选模型则留空
        if (!modelMid) {
          const def = pickDefaultModel(models, kind);
          if (def) {
            const defaults = buildModelTaskDefaults(def);
            modelMid = def.mid;
            const nextNodes = nodesRef.current.map((n) => {
              if (n.id !== selectedNodeId) return n;
              return {
                ...n,
                taskData: {
                  ...(n.taskData || {}),
                  ...defaults,
                },
              };
            });
            setNodes(nextNodes);
            saveCanvasStateRef.current?.(nextNodes);
          }
        }

        if (modelMid) {
          setSelectedMid(modelMid);

          let initialParams: Record<string, any> = {};
          const locked = modelConfigsRef.current[modelMid];
          if (locked) {
            initialParams = { ...locked };
          } else {
            const modelObj = models.find(m => m.mid === modelMid);
            if (modelObj && Array.isArray(modelObj.params)) {
              for (const p of modelObj.params) initialParams[p.key] = p.default;
            }
          }

          const latestNode = nodesRef.current.find(n => n.id === selectedNodeId) || node;
          const modelObj = models.find(m => m.mid === modelMid);
          if (modelObj && Array.isArray(modelObj.params)) {
            for (const p of modelObj.params) {
              const nodeVal = latestNode.taskData?.[p.key] ?? latestNode.taskData?.[p.key === 'aspect_ratio' ? 'aspectRatio' : ''];
              if (nodeVal !== undefined) {
                initialParams[p.key] = nodeVal;
                if (p.key === 'aspect_ratio') {
                  initialParams.aspectRatio = nodeVal;
                }
              }
            }
          }

          if (JSON.stringify(paramValuesRef.current) !== JSON.stringify(initialParams)) {
            setParamValues(initialParams);
          }
        } else {
          setSelectedMid('');
          if (Object.keys(paramValuesRef.current).length > 0) {
            setParamValues({});
          }
        }
      } else if (node?.taskData?.node_type === 'asset') {
        if (selectionChanged) {
          setIsSettingsWidgetVisible(autoDisplayAssetDetails);
        }
      } else if (node?.taskData?.node_type === 'preview') {
        if (selectionChanged) {
          setIsSettingsWidgetVisible(autoDisplayPreviewDetails);
        }
      } else if (node?.taskData?.node_type === 'prompt') {
        // 提示词属性仍由操作栏「信息」手动打开
        if (selectionChanged) {
          setIsSettingsWidgetVisible(false);
        }
      } else if (selectionChanged && pageMode === 'node') {
        setIsSettingsWidgetVisible(false);
      }
    } else if (selectionChanged && pageMode === 'node') {
      setIsSettingsWidgetVisible(false);
    }
  }, [
    selectedNodeId,
    selectedNodeModelMid,
    models,
    pageMode,
    autoDisplayAssetDetails,
    autoDisplayPreviewDetails,
    setIsModelDrawerVisible,
    setSelectedMid,
    setParamValues,
    setIsSettingsWidgetVisible,
    setNodes,
  ]);

  // 监听配置栏参数改动并将其双向写回节点卡片，且支持 1 秒防抖保存
  React.useEffect(() => {
    if (selectedNodeId && Object.keys(paramValues).length > 0) {
      const targetNode = nodesRef.current.find(n => n.id === selectedNodeId);
      if (targetNode?.taskData?.node_type === 'ai_image' || targetNode?.taskData?.node_type === 'ai_video') {
        let hasDifference = false;
        const nextTaskData = { ...(targetNode.taskData || {}) };

        Object.entries(paramValues).forEach(([key, val]) => {
          if (nextTaskData[key] !== val) {
            nextTaskData[key] = val;
            hasDifference = true;
          }
        });

        if (paramValues.aspectRatio && nextTaskData.aspect_ratio !== paramValues.aspectRatio) {
          nextTaskData.aspect_ratio = paramValues.aspectRatio;
          hasDifference = true;
        }
        if (paramValues.aspect_ratio && nextTaskData.aspectRatio !== paramValues.aspect_ratio) {
          nextTaskData.aspectRatio = paramValues.aspect_ratio;
          hasDifference = true;
        }

        if (hasDifference) {
          const nextNodes = nodesRef.current.map(n => {
            if (n.id === selectedNodeId) {
              return {
                ...n,
                taskData: nextTaskData
              };
            }
            return n;
          });

          setNodes(nextNodes);

          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            saveCanvasStateRef.current?.(nextNodes);
          }, 1000);
        }
      }
    }
  }, [paramValues, selectedNodeId, setNodes]);

  // --- 加载当前项目的画布数据 ---
  React.useEffect(() => {
    const projectIdNum = projectId;
    setCurrentProjectId(projectIdNum);

    // 重置撤销/重做历史栈与状态
    pastRef.current = [];
    futureRef.current = [];
    lastSavedNodesRef.current = null;
    setCanUndo(false);
    setCanRedo(false);

    (async () => {
      try {
        const res = await request.get(`${entityApiBase}/${projectIdNum}`) as any;
        const assets = res?.assets || [];
        const rawCanvas =
          res?.workflow?.canvas_data ?? res?.project?.canvas_data ?? null;
        // 尝试从 canvas_data 恢复
        if (rawCanvas) {
          try {
            const canvasData = typeof rawCanvas === 'string' ? JSON.parse(rawCanvas) : rawCanvas;
            if (canvasData?.nodes?.length > 0) {
              // 回填缺失的 resultData
              // 建立 asset 索引：按 ID 和按 prompt 分组（prompt 组内按时间排序以便精确匹配）
              const assetById = new Map<number, any>();
              const assetByPrompt = new Map<string, any[]>();
              for (const a of assets) {
                assetById.set(a.id, a);
                if (a.prompt) {
                  if (!assetByPrompt.has(a.prompt)) assetByPrompt.set(a.prompt, []);
                  assetByPrompt.get(a.prompt)!.push(a);
                }
              }
              // 按创建时间排序，确保时间匹配的准确性
              assetByPrompt.forEach(arr => arr.sort((a: any, b: any) =>
                safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime()
              ));
              // 记录已被匹配过的 asset ID，防止一个 asset 被多个节点重复匹配
              const matchedAssetIds = new Set<number>();

              const fixedNodes = canvasData.nodes.map((n: any) => {
                // 有 task_id 的 loading 节点 → 交给自动轮询恢复
                if (n.status === 'loading' && n.taskData?.task_id) return n;
                // 无 task_id 的 loading 节点 → 检查创建时间
                if (n.status === 'loading' && !n.taskData?.task_id) {
                  const createdAt = safeParseDate(n.taskData?.created_at).getTime();
                  const elapsedMs = Date.now() - createdAt;
                  if (elapsedMs < 30 * 60 * 1000) return { ...n, status: 'loading' };
                  return {
                    ...n,
                    status: 'error',
                    resultData: { message: '生成任务超时，请重新生成' },
                    taskData: {
                      ...(n.taskData || {}),
                      enhance_status: 'failed',
                      poll_timeout: undefined,
                    },
                  };
                }

                // 已完成且有 tos_url：仅在 resultData 无可用图片时用 tos_url 回填（勿盖住多图结果）
                if (n.status === 'completed' && n.taskData?.tos_url) {
                  if (n.type === 'image') {
                    const existing = Array.isArray(n.resultData?.data) ? n.resultData.data : [];
                    const hasUrls = existing.some(
                      (item: any) =>
                        (typeof item === 'string' && item) ||
                        (typeof item?.url === 'string' && item.url) ||
                        (typeof item?.b64_json === 'string' && item.b64_json),
                    );
                    if (!hasUrls) {
                      n.resultData = { data: [{ url: n.taskData.tos_url }] };
                    }
                  } else if (n.type === 'video') {
                    const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
                    const hasVideo = !!extractVideoUrl(n.resultData);
                    if (!hasVideo) {
                      n.resultData = { content: { video_url: n.taskData.tos_url, last_frame_url: lastFrameUrl } };
                    }
                  }
                  // 同步在内存中删除已映射的临时字段，保证内存干净无冗余
                  const { tos_url, ...rest } = n.taskData;
                  n.taskData = rest;
                }

                // 检测已完成节点是否需要从 assets 回填
                const needsFix = (() => {
                  if (!n.taskData?.model_id) return true;
                  if (n.status !== 'completed') return false;
                  if (!n.resultData) return true;
                  if (n.type === 'image' && !extractImageUrl(n.resultData)) return true;
                  if (n.type === 'video' && !extractVideoUrl(n.resultData)) return true;
                  return false;
                })();

                const needsCreatedAt = n.status === 'completed' && !n.taskData?.created_at;

                if (!needsFix && !needsCreatedAt) return n;

                // 策略1：按节点 ID 精确匹配（asset-{id} 形式）
                let match: any = null;
                const idMatch = n.id?.match(/^asset-(\d+)$/);
                if (idMatch) {
                  const candidate = assetById.get(Number(idMatch[1]));
                  if (candidate && candidate.file_url && !matchedAssetIds.has(candidate.id)) {
                    match = candidate;
                  }
                }

                // 策略2：按 created_at 时间戳最近匹配同 prompt 的 asset
                if (!match) {
                  const candidates = assetByPrompt.get(n.taskData?.prompt || '');
                  if (candidates) {
                    const nodeTime = safeParseDate(n.taskData?.created_at).getTime();
                    let bestDiff = Infinity;
                    for (const c of candidates) {
                      if (!c.file_url || matchedAssetIds.has(c.id)) continue;
                      const diff = Math.abs(safeParseDate(c.created_at).getTime() - nodeTime);
                      if (diff < bestDiff) { bestDiff = diff; match = c; }
                    }
                  }
                }

                if (!match || !match.file_url) return n;
                matchedAssetIds.add(match.id);

                return {
                  ...n,
                  status: 'completed',
                  taskData: {
                    ...n.taskData,
                    created_at: match.created_at || n.taskData?.created_at,
                    model_id: match.model_id || n.taskData?.model_id,
                    model_name: match.model_name || n.taskData?.model_name,
                    file_size: match.file_size || n.taskData?.file_size,
                    width: match.width || n.taskData?.width,
                    height: match.height || n.taskData?.height,
                  },
                  resultData: n.resultData || (match.asset_type === 'image'
                    ? { data: [{ url: match.file_url }] }
                    : { content: { video_url: match.file_url } }),
                };
              });

              // 补充 canvas_data 中缺失但 assets 表中存在的记录
              const existingAssetIds = new Set(
                fixedNodes.map((n: any) => n.id).filter((id: string) => id.startsWith('asset-'))
              );
              // 收集已有节点的 URL 用于去重
              const existingUrls = new Set<string>();
              fixedNodes.forEach((n: any) => {
                if (n.type === 'image') {
                  const url = extractImageUrl(n.resultData);
                  if (url) existingUrls.add(url);
                } else if (n.type === 'video') {
                  const url = extractVideoUrl(n.resultData);
                  if (url) existingUrls.add(url);
                }
              });
              const missingAssets = assets.filter((a: any) => {
                if (a.asset_type !== 'image' && a.asset_type !== 'video') return false;
                if (!a.file_url) return false;
                if (isReferenceAssetUrl(a.file_url)) return false;
                if (existingAssetIds.has(`asset-${a.id}`)) return false;
                if (existingUrls.has(a.file_url)) return false;
                if (matchedAssetIds.has(a.id)) return false;
                return true;
              });
              if (missingAssets.length > 0) {
                const TARGET_HEIGHT = 320;
                const GAP = 5;
                const maxZIndex = Math.max(...fixedNodes.map((n: any) => n.zIndex || 0), 0);

                // 寻找现有的最右边界
                let currentX = Math.max(...fixedNodes.map((n: any) => (n.x || 0) + (n.width || 480)), 600) + GAP;
                // 尝试对齐到最后一行的 Y
                let currentY = 100;
                if (fixedNodes.length > 0) {
                  currentY = fixedNodes[fixedNodes.length - 1].y || 100;
                }

                missingAssets.forEach((asset: any, idx: number) => {
                  let pos = { x: currentX, y: currentY };
                  let savedPosFound = false;
                  try {
                    const nd = JSON.parse(asset.canvas_node_data);
                    if (nd?.x !== undefined) {
                      pos = { x: nd.x, y: nd.y };
                      savedPosFound = true;
                    }
                  } catch { }

                  const origW = asset.width || 480;
                  const origH = asset.height || 320;
                  const targetWidth = (origW / origH) * TARGET_HEIGHT;

                  fixedNodes.push({
                    id: `asset-${asset.id}`,
                    type: asset.asset_type,
                    status: 'completed' as const,
                    taskData: {
                      prompt: asset.prompt,
                      created_at: asset.created_at,
                      model_id: asset.model_id,
                      model_name: asset.model_name,
                      file_size: asset.file_size,
                      width: asset.width,
                      height: asset.height,
                      ...(asset.library_asset_id
                        ? {
                            resource_id: String(asset.library_asset_id),
                            library_asset_id: String(asset.library_asset_id),
                          }
                        : {}),
                    },
                    resultData: asset.asset_type === 'image'
                      ? { data: [{ url: asset.file_url }] }
                      : { content: { video_url: asset.file_url } },
                    x: pos.x, y: pos.y,
                    width: targetWidth, height: TARGET_HEIGHT,
                    zIndex: maxZIndex + idx + 1,
                  });

                  if (!savedPosFound) {
                    currentX += targetWidth + GAP;
                  }
                });
              }

              // 剔除误挂到项目的独立生成页作品（asset-* + /output|/reference）
              let canvasNodes = fixedNodes.filter((n: any) => {
                if (!String(n.id || '').startsWith('asset-')) return true;
                if (n.type !== 'image' && n.type !== 'video') return true;
                const url =
                  n.type === 'image'
                    ? extractImageUrl(n.resultData)
                    : extractVideoUrl(n.resultData);
                return !isReferenceAssetUrl(url);
              });

              // 刷新/异地打开：清理未登记的本地 blob:（失效地址）
              const hadStaleBlobs = canvasHasStaleBlobUrls(canvasNodes);
              if (hadStaleBlobs) {
                canvasNodes = stripBlobUrlsFromNodes(canvasNodes, 'stale');
              }

              setNodes(canvasNodes);
              const maxZ = Math.max(...canvasNodes.map((n: any) => n.zIndex || 0), 10);
              setMaxZIndex(maxZ);
              // 先应用已存视角，再异步校验是否落在视口内（坏 transform / 窗口尺寸变化时自动 fit）
              if (isValidCanvasTransform(canvasData.transform)) {
                transformRef2.current = canvasData.transform;
                setCanvasTransform(canvasData.transform);
              }
              ensureNodesVisibleInViewport(canvasNodes, canvasData.transform);
              if (hadStaleBlobs) {
                // 回写清理后的画布，避免其它端再次读到失效 blob
                void saveCanvasStateRef.current?.(canvasNodes);
              }
              return; // 恢复成功，直接返回
            }
          } catch { }
        }

        // canvas_data 为空但有 assets，从 assets 重建节点
        if (assets.length > 0) {
          const TARGET_HEIGHT = 320;
          const GAP = 5;
          const validAssets = assets.filter((a: any) =>
            (a.asset_type === 'image' || a.asset_type === 'video') && !isReferenceAssetUrl(a.file_url)
          );
          const COLS = Math.max(3, Math.ceil(Math.sqrt(validAssets.length)));

          let currentX = 0;
          let currentY = 0;

          const rebuiltNodes = validAssets.map((asset: any, idx: number) => {
            const origW = asset.width || 480;
            const origH = asset.height || 320;
            const targetWidth = (origW / origH) * TARGET_HEIGHT;

            if (idx > 0 && idx % COLS === 0) {
              currentX = 0;
              currentY += TARGET_HEIGHT + GAP;
            }

            const node = {
              id: `asset-${asset.id}`,
              type: asset.asset_type,
              status: 'completed' as const,
              taskData: {
                prompt: asset.prompt,
                created_at: asset.created_at,
                model_id: asset.model_id,
                model_name: asset.model_name,
                file_size: asset.file_size,
                width: asset.width,
                height: asset.height,
                ...(asset.library_asset_id
                  ? {
                      resource_id: String(asset.library_asset_id),
                      library_asset_id: String(asset.library_asset_id),
                    }
                  : {}),
              },
              resultData: asset.asset_type === 'image'
                ? { data: [{ url: asset.file_url }] }
                : { content: { video_url: asset.file_url } },
              x: currentX, y: currentY,
              width: targetWidth, height: TARGET_HEIGHT,
              zIndex: idx + 1,
            };

            currentX += targetWidth + GAP;

            return node;
          });

          if (rebuiltNodes.length > 0) {
            setNodes(rebuiltNodes);
            const maxZ = Math.max(...rebuiltNodes.map((n: any) => n.zIndex || 0), 10);
            setMaxZIndex(maxZ);
            ensureNodesVisibleInViewport(rebuiltNodes, null);
          }
        }
        
        // 如果项目既没有画布数据也没有关联素材，则设为空节点以建立历史记录基准
        if (!rawCanvas && assets.length === 0) {
          setNodes([]);
        } else if (rawCanvas) {
          // canvas_data 存在但 nodes 为空：显式清空，避免残留
          try {
            const parsed = typeof rawCanvas === 'string' ? JSON.parse(rawCanvas) : rawCanvas;
            if (!parsed?.nodes?.length && assets.length === 0) {
              setNodes([]);
            }
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        console.warn('加载项目画布数据失败', e);
        setNodes([]);
      }
    })();
  }, [projectId, setNodes, entityApiBase, ensureNodesVisibleInViewport]);

  // --- 离开页面时自动保存画布 ---
  React.useEffect(() => {
    const doSave = () => {
      const pid = projectIdRef.current;
      const currentNodes = nodesRef.current;
      if (!pid || currentNodes.length === 0) return;
      const canvasData = JSON.stringify({
        nodes: stripBlobUrlsFromNodes(
          currentNodes.filter(n => !n.id.startsWith('local-asset-')),
          'all',
        ).map(n => {
          let savedResultData = n.resultData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const url = extractImageUrl(n.resultData);
              savedResultData = url ? { data: [{ url }] } : null;
            } else if (n.type === 'video') {
              const videoUrl = extractVideoUrl(n.resultData);
              const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
              savedResultData = videoUrl ? { content: { video_url: videoUrl, last_frame_url: lastFrameUrl } } : null;
            }
          }
          return {
            id: n.id, type: n.type, status: n.status,
            x: n.x, y: n.y, width: n.width, height: n.height, zIndex: n.zIndex,
            taskData: n.taskData, resultData: savedResultData,
            parentId: n.parentId,
            isHidden: n.isHidden,
            inputConnections: n.inputConnections,
          };
        }),
        transform: (() => {
          const layer = canvasRef.current?.querySelector('.transform-layer') as HTMLElement | null;
          const live = readCanvasTransformFromDom(layer);
          return (live && isValidCanvasTransform(live) ? live : transformRef2.current);
        })(),
      });
      // 使用 fetch+keepalive 保证页面关闭时也能发送（含 Auth header）
      const token = localStorage.getItem('token');
      const baseURL = (request.defaults?.baseURL || '/api/v1') as string;
      fetch(`${baseURL}${entityApiBase}/${pid}/save-canvas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ canvas_data: canvasData }),
        keepalive: true,
      }).catch(() => { }); // 静默失败
    };

    window.addEventListener('beforeunload', doSave);
    return () => {
      window.removeEventListener('beforeunload', doSave);
      // 组件卸载时保存（如返回项目列表）
      doSave();
    };
  }, [entityApiBase]);

  // --- 空格键 & 撤销/重做全局监听 ---
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInputActive = !!(activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        !!activeEl.closest('[contenteditable="true"]')
      ));

      const isMacOS = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      const mod = isMacOS ? e.metaKey : e.ctrlKey;

      if (!isInputActive) {
        if (e.code === 'Space') {
          setIsSpaceDown(true);
          e.preventDefault();
          return;
        }

        // Cmd/Ctrl + Z -> 撤销
        if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }

        // Cmd + Shift + Z 或者 Ctrl + Y -> 重做
        if (
          (mod && e.shiftKey && e.key.toLowerCase() === 'z') ||
          (mod && e.key.toLowerCase() === 'y')
        ) {
          e.preventDefault();
          redo();
          return;
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undo, redo]);

  // --- 构造 Context Values ---
  const canvasValue = useMemo<CanvasContextValue>(() => ({
    canvasTransform, setCanvasTransform,
    activeTool, setActiveTool,
    isSpaceDown,
    isDraggingCanvas, setIsDraggingCanvas,
    draggingNodeId, setDraggingNodeId,
    nodes, setNodes,
    maxZIndex, setMaxZIndex,
    canvasRef,
    settingsWidgetPos, setSettingsWidgetPos,
    modelWidgetPos, setModelWidgetPos,
    selectedNodeId, setSelectedNodeId,
    selectedNodeIds, setSelectedNodeIds,
    connectingSourceId, setConnectingSourceId,
    connectingToInput, setConnectingToInput,
    connectingMousePos, setConnectingMousePos,
    handleRearrange,
    undo, redo, canUndo, canRedo,
  }), [
    canvasTransform, activeTool, isSpaceDown, isDraggingCanvas,
    draggingNodeId, nodes, maxZIndex, settingsWidgetPos, modelWidgetPos, selectedNodeId, selectedNodeIds,
    connectingSourceId, connectingToInput, connectingMousePos, handleRearrange,
    undo, redo, canUndo, canRedo
  ]);

  const playgroundValue = useMemo<PlaygroundContextValue>(() => ({
    loading, models, selectedMid, setSelectedMid,
    currentModel, categories, activeCategory, setActiveCategory,
    modelsInCategory, searchModelKeyword, setSearchModelKeyword,
    paramValues, setParamValues, initParamDefaults,
    modelConfigs, saveModelConfig, deleteModelConfig,
    prompt, setPrompt,
    generating, setGenerating,
    taskPollingNodes, setTaskPollingNodes,
    apiTokens, setApiTokens, selectedTokenKey, setSelectedTokenKey,
    isModelDrawerVisible, setIsModelDrawerVisible,
    isTokenModalVisible, setIsTokenModalVisible,
    isSettingsCollapsed, setIsSettingsCollapsed,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    isGenLogVisible, setIsGenLogVisible,
    isGenLogPinned, setIsGenLogPinned,
    pageMode, setPageMode,
    autoDisplayAssetDetails, setAutoDisplayAssetDetails,
    autoDisplayPreviewDetails, setAutoDisplayPreviewDetails,
    handleCategoryChange, handleSelectModel,
    projects, currentProjectId, setCurrentProjectId,
    loadProjects, createProject, duplicateProject, saveCanvasState, canvasSaveStatus,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
    chatMessages, setChatMessages, streamingContent, setStreamingContent,
    defaultModelMids, favorites, toggleFavorite, advancedNodesConfig,
    activeSelectorNodeId, setActiveSelectorNodeId, openModelSelectorForNode, activeSelectorNodeSelectedMid,
    entityKind, entityApiBase, entityListPath,
  }), [
    loading, models, selectedMid, currentModel, categories,
    activeCategory, modelsInCategory, searchModelKeyword,
    paramValues, modelConfigs, saveModelConfig, deleteModelConfig, prompt, generating, taskPollingNodes,
    apiTokens, setApiTokens, selectedTokenKey,
    isModelDrawerVisible, isTokenModalVisible, isSettingsCollapsed, isSettingsWidgetVisible, isGenLogVisible, isGenLogPinned,
    pageMode, setPageMode,
    autoDisplayAssetDetails, setAutoDisplayAssetDetails,
    autoDisplayPreviewDetails, setAutoDisplayPreviewDetails,
    handleCategoryChange, handleSelectModel, initParamDefaults,
    projects, currentProjectId, loadProjects, createProject, duplicateProject, saveCanvasState, canvasSaveStatus,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
    chatMessages, streamingContent, defaultModelMids, favorites, toggleFavorite, advancedNodesConfig,
    activeSelectorNodeId, openModelSelectorForNode, activeSelectorNodeSelectedMid,
    entityKind, entityApiBase, entityListPath,
  ]);

  return (
    <CanvasContext.Provider value={canvasValue}>
      <PlaygroundContext.Provider value={playgroundValue}>
        {children}
      </PlaygroundContext.Provider>
    </CanvasContext.Provider>
  );
};
