/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 拖线时：判断节点是否可作为落点/上游，供面板变淡高亮
 */
import type { CanvasNode, PlaygroundModel, SchemePort } from '../types';
import {
  findFreeInputHandle,
  findPortByHandle,
  isPortCompatibleWithSource,
  resolveModelIo,
  type SchemeSourceMedia,
} from './schemeIo';

const CONNECT_TARGET_TYPES = new Set([
  'preview',
  'volc_enhance',
  'prompt',
  'ai_video',
  'ai_image',
]);

function nodeTypeOf(n: CanvasNode): string {
  return n.taskData?.node_type || n.type || '';
}

/** 解析上游媒体类型（与 InfiniteCanvas 连线校验对齐） */
export function resolveConnectSourceMedia(
  source: CanvasNode,
  nodes: CanvasNode[],
): SchemeSourceMedia | undefined {
  if (source.taskData?.node_type === 'asset') {
    const files = Array.isArray(source.taskData?.files) ? source.taskData.files : [];
    const usable = files.filter((f: { url?: string }) => !!f?.url);
    if (!usable.length) {
      // 空素材：无文件类型，不回落 node.type（新建/清空后常为 image）
      return undefined;
    }
    const kind = String(usable[0]?.kind || usable[0]?.asset_type || '').toLowerCase();
    if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'document') {
      return kind;
    }
    return undefined;
  }
  if (source.taskData?.node_type === 'preview') {
    const findSrc = (currId: string | undefined): CanvasNode | null => {
      if (!currId) return null;
      const p = nodes.find((n) => n.id === currId);
      if (!p || p.isHidden) return null;
      if (p.type === 'video' || p.type === 'image' || p.type === 'audio') return p;
      return findSrc(p.parentId);
    };
    const real = findSrc(source.parentId);
    if (real?.type === 'image' || real?.type === 'video' || real?.type === 'audio') {
      return real.type;
    }
  }
  if (source.type === 'image' || source.type === 'video' || source.type === 'audio') {
    return source.type;
  }
  return undefined;
}

function resolveTargetInputs(
  target: CanvasNode,
  models: PlaygroundModel[] | null | undefined,
): SchemePort[] {
  if (Array.isArray(target.taskData?.io_inputs) && target.taskData.io_inputs.length) {
    return target.taskData.io_inputs as SchemePort[];
  }
  const targetNodeType = nodeTypeOf(target);
  const kind = targetNodeType === 'ai_video' ? 'video' : 'image';
  const model = (models || []).find(
    (m) =>
      m.mid === target.taskData?.modelMid ||
      m.name === target.taskData?.model ||
      m.model_id === target.taskData?.model,
  );
  return resolveModelIo(model, kind).allInputs;
}

/** 正向拖线：目标节点能否接收该上游 */
function canAcceptConnectFromSource(
  source: CanvasNode,
  target: CanvasNode,
  nodes: CanvasNode[],
  models: PlaygroundModel[] | null | undefined,
): boolean {
  if (!source || !target || source.id === target.id || target.isHidden) return false;
  const t = nodeTypeOf(target);
  if (!CONNECT_TARGET_TYPES.has(t)) return false;
  if (t === 'volc_enhance' && source.type === 'image') return false;

  if (t === 'ai_video' || t === 'ai_image') {
    const inputs = resolveTargetInputs(target, models);
    const srcType = nodeTypeOf(source);
    const media = resolveConnectSourceMedia(source, nodes);
    return !!findFreeInputHandle(inputs, target.inputConnections, srcType, media);
  }
  return true;
}

/** 反向拖线：上游能否接到指定入参口 */
function canProvideConnectToHandle(
  source: CanvasNode,
  target: CanvasNode,
  handleId: string,
  nodes: CanvasNode[],
  models: PlaygroundModel[] | null | undefined,
): boolean {
  if (!source || !target || source.id === target.id || source.isHidden) return false;
  const t = nodeTypeOf(target);
  if (!CONNECT_TARGET_TYPES.has(t)) return false;
  if (t === 'volc_enhance' && source.type === 'image') return false;

  const srcType = nodeTypeOf(source);
  const media = resolveConnectSourceMedia(source, nodes);

  if (t === 'ai_video' || t === 'ai_image') {
    const inputs = resolveTargetInputs(target, models);
    const port = findPortByHandle(inputs, handleId);
    if (!port) return true;
    return isPortCompatibleWithSource(port, srcType, media);
  }
  return true;
}

/**
 * 拖线过程中该节点面板是否应变淡
 * - 当前拖线端点节点：不变淡
 * - 其余：不可作为合法落点/上游则变淡
 */
export function shouldDimNodeDuringConnectDrag(
  nodeId: string,
  nodes: CanvasNode[],
  models: PlaygroundModel[] | null | undefined,
  connectingSourceId: string | null,
  connectingToInput: { nodeId: string; handleId: string } | null,
): boolean {
  if (!connectingSourceId && !connectingToInput) return false;
  if (connectingSourceId === nodeId) return false;
  if (connectingToInput?.nodeId === nodeId) return false;

  const self = nodes.find((n) => n.id === nodeId);
  if (!self || self.isHidden) return false;

  if (connectingSourceId) {
    const source = nodes.find((n) => n.id === connectingSourceId);
    if (!source) return false;
    return !canAcceptConnectFromSource(source, self, nodes, models);
  }

  if (connectingToInput) {
    const target = nodes.find((n) => n.id === connectingToInput.nodeId);
    if (!target) return false;
    return !canProvideConnectToHandle(
      self,
      target,
      connectingToInput.handleId,
      nodes,
      models,
    );
  }

  return false;
}
