/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/** 管理端未配置时的默认：单个工作流节点上限 */
export const DEFAULT_WORKFLOW_NODE_LIMIT = 200;

export function resolveWorkflowNodeLimit(
  storageStats?: { workflow_node_limit?: number | null } | null,
): number {
  const n = Number(storageStats?.workflow_node_limit);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return DEFAULT_WORKFLOW_NODE_LIMIT;
}

/** 当前画布节点数（不含已隐藏） */
export function countWorkflowNodes(nodes: Array<{ isHidden?: boolean } | null | undefined>): number {
  return nodes.filter((n) => n && !n.isHidden).length;
}

export function canAddWorkflowNodes(
  currentCount: number,
  addCount: number,
  limit: number,
): boolean {
  if (addCount <= 0) return true;
  if (limit <= 0) return false;
  return currentCount + addCount <= limit;
}

export function workflowNodeLimitMessage(limit: number): string {
  return `单个工作流节点数量已达上限（最多 ${limit} 个）`;
}
