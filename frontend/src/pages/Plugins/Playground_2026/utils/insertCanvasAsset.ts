/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 将资源库选中项插入画布为素材节点
 */
import generateUUID from '../../../../utils/uuid';
import type { WorkflowAssetKind } from './referenceUpload';
import { registerLocalFile } from './localFileRegistry';
import { toResourceDisplayName } from './resourceFileName';
import {
  DEFAULT_WORKFLOW_NODE_LIMIT,
  canAddWorkflowNodes,
  countWorkflowNodes,
} from './workflowNodeLimit';

export type FlowAssetPickResult = {
  url: string;
  kind: WorkflowAssetKind;
  /** 展示名（通常已去掉后缀） */
  fileName?: string;
  /** 选择时的原始文件名（含后缀），真实上传时使用 */
  originalFileName?: string;
  source: 'upload' | 'library';
  mime?: string;
  /** 资源库 playground_2026_assets.id */
  resourceId?: string;
  /** 本地待上传文件（弹窗选择后暂不上传，生成时再传） */
  file?: File;
  /** 已知字节大小 */
  fileSize?: number;
};

function kindToNodeType(kind: WorkflowAssetKind): 'image' | 'video' | 'audio' | 'text' {
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'audio';
  if (kind === 'document') return 'text';
  return 'image';
}

function buildResultData(kind: WorkflowAssetKind, url: string, fileName?: string, mime?: string) {
  const file = {
    id: `af_${generateUUID().replace(/-/g, '').slice(0, 12)}`,
    url,
    kind,
    file_name: fileName,
    mime,
  };
  const base =
    kind === 'video'
      ? { content: { video_url: url } }
      : kind === 'audio'
        ? { content: { audio_url: url } }
        : kind === 'document'
          ? { content: { file_url: url } }
          : { content: { image_url: url } };
  return {
    ...base,
    content: {
      ...base.content,
      files: [file],
    },
  };
}

function buildAssetNodeFromPick(
  pick: FlowAssetPickResult,
  opts: {
    x: number;
    y: number;
    zIndex: number;
    idSuffix?: string;
  },
) {
  const displayName = toResourceDisplayName(pick.originalFileName || pick.fileName || '');
  const label =
    displayName ||
    (pick.kind === 'video' ? '视频素材' : pick.kind === 'audio' ? '音频素材' : '素材');
  const originalFileName =
    pick.originalFileName ||
    pick.file?.name ||
    (pick.fileName && /\.[^./\\]+$/.test(pick.fileName) ? pick.fileName : undefined);

  const fileItem = {
    id: `af_${generateUUID().replace(/-/g, '').slice(0, 12)}`,
    url: pick.url,
    kind: pick.kind,
    fileName: displayName || pick.fileName,
    originalFileName,
    mime: pick.mime,
    source: pick.source,
    resource_id: pick.resourceId,
    fileSize: pick.fileSize || pick.file?.size || undefined,
  };

  if (pick.file && pick.url.startsWith('blob:')) {
    registerLocalFile(pick.url, pick.file, originalFileName || pick.file.name);
  }

  return {
    id: `node-${Date.now()}${opts.idSuffix ? `-${opts.idSuffix}` : ''}-${Math.floor(Math.random() * 1000)}`,
    type: kindToNodeType(pick.kind),
    status: 'completed' as const,
    resultData: buildResultData(pick.kind, pick.url, displayName || pick.fileName, pick.mime),
    x: opts.x,
    y: opts.y,
    width: 300,
    height: 260,
    zIndex: opts.zIndex,
    taskData: {
      node_type: 'asset',
      media_kind: pick.kind,
      file_name: displayName || pick.fileName,
      original_file_name: originalFileName,
      mime: pick.mime,
      source: pick.source,
      label,
      node_title: label,
      files: [fileItem],
      ...(pick.resourceId
        ? { resource_id: pick.resourceId, library_asset_id: pick.resourceId }
        : {}),
    },
  };
}

function resolveInsertNodeLimit(nodeLimit?: number): number {
  if (typeof nodeLimit === 'number' && Number.isFinite(nodeLimit) && nodeLimit > 0) {
    return Math.floor(nodeLimit);
  }
  return DEFAULT_WORKFLOW_NODE_LIMIT;
}

export function insertCanvasAssetFromPick(opts: {
  pick: FlowAssetPickResult;
  nodes: any[];
  setNodes: (fn: (prev: any) => any) => void;
  maxZIndex: number;
  setMaxZIndex: (z: number) => void;
  canvasTransform: { x: number; y: number; scale: number };
  saveCanvasState: (nodes?: any) => void;
  /** 画布坐标落点；缺省为视口中央 */
  placeAt?: { x: number; y: number };
  /** 单个工作流可见节点总数上限 */
  nodeLimit?: number;
}): boolean {
  const {
    pick,
    nodes,
    setNodes,
    maxZIndex,
    setMaxZIndex,
    canvasTransform,
    saveCanvasState,
    placeAt,
  } = opts;

  const limit = resolveInsertNodeLimit(opts.nodeLimit);
  const currentCount = countWorkflowNodes(nodes);
  if (!canAddWorkflowNodes(currentCount, 1, limit)) {
    return false;
  }

  const newZ = maxZIndex + 1;
  setMaxZIndex(newZ);

  const rect = document.body.getBoundingClientRect();
  const stagger = currentCount % 8;
  const x =
    placeAt?.x ??
    (rect.width / 2 - canvasTransform.x) / canvasTransform.scale - 150 + stagger * 28;
  const y =
    placeAt?.y ??
    (rect.height / 2 - canvasTransform.y) / canvasTransform.scale - 130 + stagger * 28;

  const node = buildAssetNodeFromPick(pick, { x, y, zIndex: newZ });

  setNodes((prev: any) => {
    const next = [...prev, node];
    saveCanvasState(next);
    return next;
  });
  return true;
}

/** 批量插入（上传多文件时避免闭包态过期） */
export function insertCanvasAssetsFromPicks(opts: {
  picks: FlowAssetPickResult[];
  nodes: any[];
  setNodes: (fn: (prev: any) => any) => void;
  maxZIndex: number;
  setMaxZIndex: (z: number) => void;
  canvasTransform: { x: number; y: number; scale: number };
  saveCanvasState: (nodes?: any) => void;
  /** 单个工作流可见节点总数上限 */
  nodeLimit?: number;
  /** 指定落点（画布坐标）；多文件时相对首个节点错开 */
  placeAt?: { x: number; y: number };
  /** 在同一 setNodes 事务内连线；primaryId 为首个插入节点 */
  link?: (args: { nodes: any[]; primaryId: string }) => any[];
}): { count: number; primaryId: string | null } {
  const {
    picks,
    nodes,
    setNodes,
    maxZIndex,
    setMaxZIndex,
    canvasTransform,
    saveCanvasState,
    placeAt,
    link,
  } = opts;

  if (!picks.length) return { count: 0, primaryId: null };

  const limit = resolveInsertNodeLimit(opts.nodeLimit);
  let nodeCount = countWorkflowNodes(nodes);
  let z = maxZIndex;
  const rect = document.body.getBoundingClientRect();
  const newNodes: any[] = [];

  for (let i = 0; i < picks.length; i++) {
    if (!canAddWorkflowNodes(nodeCount, 1, limit)) break;
    z += 1;
    const stagger = nodeCount % 8;
    const baseX =
      placeAt?.x ??
      (rect.width / 2 - canvasTransform.x) / canvasTransform.scale - 150;
    const baseY =
      placeAt?.y ??
      (rect.height / 2 - canvasTransform.y) / canvasTransform.scale - 130;
    const x = baseX + stagger * 28;
    const y = baseY + stagger * 28;
    newNodes.push(buildAssetNodeFromPick(picks[i], { x, y, zIndex: z, idSuffix: String(i) }));
    nodeCount += 1;
  }

  if (!newNodes.length) return { count: 0, primaryId: null };
  const primaryId = newNodes[0].id as string;
  setMaxZIndex(z);
  setNodes((prev: any) => {
    let next = [...prev, ...newNodes];
    if (link) next = link({ nodes: next, primaryId });
    saveCanvasState(next);
    return next;
  });
  return { count: newNodes.length, primaryId };
}
