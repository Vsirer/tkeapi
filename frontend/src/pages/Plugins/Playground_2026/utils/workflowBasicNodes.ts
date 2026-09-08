/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流「基础」节点类型清单（节点列表基础组 / 方案 IO accepts 同源）
 */
export type WorkflowBasicNodeType =
  | 'ai_image'
  | 'ai_video'
  | 'asset'
  | 'director'
  | 'prompt'
  | 'volc_enhance'
  | 'preview';

export type WorkflowBasicNodeDef = {
  key: WorkflowBasicNodeType;
  label: string;
};

export const WORKFLOW_BASIC_NODE_TYPES: WorkflowBasicNodeDef[] = [
  { key: 'ai_video', label: 'AI 视频生成' },
  { key: 'ai_image', label: 'AI 图像生成' },
  { key: 'asset', label: '素材' },
  { key: 'director', label: '导演台' },
  { key: 'prompt', label: '提示词' },
  { key: 'preview', label: '预览' },
  { key: 'volc_enhance', label: '火山画质增强' },
];

const WORKFLOW_BASIC_NODE_TYPE_SET = new Set(
  WORKFLOW_BASIC_NODE_TYPES.map((t) => t.key),
);

export function isWorkflowBasicNodeType(v: string): v is WorkflowBasicNodeType {
  return WORKFLOW_BASIC_NODE_TYPE_SET.has(v as WorkflowBasicNodeType);
}

export function isDirectorStageEnabled(cfg?: { director_enabled?: boolean } | null): boolean {
  return !!cfg?.director_enabled;
}
