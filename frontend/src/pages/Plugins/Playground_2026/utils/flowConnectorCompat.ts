/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 连接器点击「选择节点」兼容规则（对齐 Imagine：只展示可匹配类型）
 */
import type { NodeKey } from '../components/flow/WorkflowEmptyAddNode';

export type ConnectorPickSide = 'left' | 'right';

export type ConnectorPickDetail = {
  clientX: number;
  clientY: number;
  canvasX: number;
  canvasY: number;
  nodeId: string;
  handleId: string;
  side: ConnectorPickSide;
  /** 源节点 node_type / type */
  nodeType: string;
};

/** 从输出插座点出时，可新建的下游节点 */
function compatibleTargetsFromOutput(sourceType: string, handleId: string): NodeKey[] {
  const t = (sourceType || '').toLowerCase();
  const h = handleId || '';

  if (t === 'prompt') {
    return ['ai_image', 'ai_video'];
  }
  if (t === 'ai_image' || t === 'asset' || t === 'director' || t === 'image' || h.includes('Image')) {
    return ['ai_image', 'ai_video', 'preview'];
  }
  if (t === 'ai_video' || t === 'video' || h.includes('Video')) {
    return ['preview', 'volc_enhance', 'ai_video'];
  }
  if (t === 'preview') {
    return ['ai_image', 'ai_video', 'preview'];
  }
  if (t === 'audio') {
    return ['ai_video'];
  }
  return ['ai_image', 'ai_video', 'preview', 'prompt', 'asset'];
}

/** 从输入插座点出时，可新建的上游节点 */
function compatibleSourcesForInput(targetType: string, handleId: string): NodeKey[] {
  const t = (targetType || '').toLowerCase();
  const h = (handleId || '').toLowerCase();

  if (h.includes('prompt')) {
    return ['prompt'];
  }
  // 先匹配 video，避免被泛化的 image 规则误伤（以及将来 prefix 命名变化）
  if (
    /reference\s*videos?/.test(h) ||
    (h.includes('video') && !h.includes('image'))
  ) {
    return ['asset', 'ai_video', 'preview'];
  }
  if (
    /reference\s*images?/.test(h) ||
    (h.includes('image') && !h.includes('video')) ||
    h.includes('start frame') ||
    h.includes('end frame')
  ) {
    return ['asset', 'ai_image', 'preview', 'director'];
  }
  if (h.includes('audio')) {
    return ['asset'];
  }
  if (t === 'preview') {
    return ['asset', 'ai_image', 'ai_video', 'volc_enhance', 'director'];
  }
  if (t === 'director') {
    return ['asset', 'ai_image', 'preview'];
  }
  if (t === 'ai_image') {
    return ['prompt', 'asset', 'ai_image', 'preview', 'director'];
  }
  if (t === 'ai_video') {
    return ['prompt', 'asset', 'ai_image', 'ai_video', 'preview', 'director'];
  }
    return ['prompt', 'asset', 'ai_image', 'ai_video', 'preview', 'director'];
}

export function compatibleKeysForConnector(
  side: ConnectorPickSide,
  nodeType: string,
  handleId: string,
): NodeKey[] {
  return side === 'right'
    ? compatibleTargetsFromOutput(nodeType, handleId)
    : compatibleSourcesForInput(nodeType, handleId);
}

/** 新节点接到目标输入时使用的 handle 名（优先 preferred；否则按默认 IO 启发式） */
export function resolveInputHandleForLink(
  targetType: string,
  preferredHandle: string,
  sourceType: string,
): string {
  // 输出侧手柄不是目标入参口名
  const outputOnly = new Set(['File', 'Image', 'Video', 'Image output', 'Video output', 'Audio output']);
  if (preferredHandle && !outputOnly.has(preferredHandle)) {
    return preferredHandle;
  }
  const t = (targetType || '').toLowerCase();
  const s = (sourceType || '').toLowerCase();
  if (t === 'ai_image') {
    if (s === 'prompt') return 'Prompt';
    // 默认图片 IO：reference_images 可扩槽 → Reference Image 1
    return 'Reference Image 1';
  }
  if (t === 'ai_video') {
    if (s === 'prompt') return 'Prompt';
    if (s === 'audio') return 'Reference Audio 1';
    if (s === 'video' || s === 'ai_video') return 'Reference Videos 1';
    return 'Reference Images 1';
  }
  if (t === 'preview') return 'Input';
  if (t === 'director') return 'Panorama';
  return preferredHandle || 'Input';
}

export const CONNECTOR_PICK_EVENT = 'pg-flow-connector-pick';

export function dispatchConnectorPick(detail: ConnectorPickDetail) {
  window.dispatchEvent(new CustomEvent(CONNECTOR_PICK_EVENT, { detail }));
}

/** 拖线磁吸半径（屏幕像素） */
export const CONNECTOR_MAGNET_SCREEN_PX = 28;
