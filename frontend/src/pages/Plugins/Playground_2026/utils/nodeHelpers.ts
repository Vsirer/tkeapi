/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 画布节点 / 素材判定纯函数（无 React 依赖，供校验与加载复用）
 */
import type { CanvasNode } from '../types';

/** 不进入项目画布的资产：上传类（含旧 reference）与独立页旧 output；works 可进画布 */
export function isReferenceAssetUrl(url?: string | null): boolean {
  return (
    !!url &&
    (url.includes('/assets/uploads/') ||
      url.includes('/references/') ||
      url.includes('/reference/') ||
      url.includes('/output/'))
  );
}

const NON_MATERIAL_NODE_TYPES = new Set([
  'preview', 'volc_enhance', 'prompt', 'ai_image', 'ai_video', 'agent', 'asset', 'director',
]);

/** 是否计入项目素材数量上限（排除区块 / 高级编排 / 实例） */
export function isMaterialQuotaNode(n: Pick<CanvasNode, 'type' | 'isInstance' | 'taskData'>): boolean {
  if (n.type === 'section') return false;
  if (NON_MATERIAL_NODE_TYPES.has(n.taskData?.node_type)) return false;
  if (n.isInstance || n.taskData?.is_instance) return false;
  return true;
}
