/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流 API（/playground-2026/workflows）
 */
import request from '../../../../utils/request';

export type WorkflowItem = {
  id: number;
  uid: string;
  name: string;
  description: string;
  cover_url: string;
  canvas_data: string;
  created_at: string;
  updated_at: string;
  asset_count?: number;
  work_count?: number;
  is_pinned?: number;
};

export async function listWorkflows(): Promise<WorkflowItem[]> {
  const res = (await request.get('/playground-2026/workflows')) as any;
  return Array.isArray(res?.workflows) ? res.workflows : [];
}

export async function createWorkflow(name?: string, description?: string): Promise<WorkflowItem> {
  const res = (await request.post(
    '/playground-2026/workflows',
    {
      name: name || '未命名工作流',
      description: description || '',
    },
    { skipErrorHandler: true } as any,
  )) as any;
  if (!res?.id) {
    throw new Error(res?.error?.message || res?.message || '创建工作流失败');
  }
  return {
    id: res.id,
    uid: res.uid || '',
    name: res.name || name || '未命名工作流',
    description: res.description || '',
    cover_url: '',
    canvas_data: '{}',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_pinned: 0,
    asset_count: 0,
    work_count: 0,
  };
}

export async function renameWorkflow(id: number, name: string): Promise<void> {
  await request.put(`/playground-2026/workflows/${id}`, { name });
}

export async function deleteWorkflow(id: number): Promise<void> {
  await request.delete(`/playground-2026/workflows/${id}`);
}
