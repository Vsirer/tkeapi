/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 资源库 API（图片/视频）
 *
 * param_values：灵活 JSON（方案可变参数）
 * - 扁平 key→value（按方案 key）
 * - `_fields: [{ key, label }]` 显示名快照
 * - `reference_urls` 参考图等扩展
 * 读取可用 extractParamValues / listGenerationDetailRows（见 generationParams.ts）
 */
import request from '../../../../utils/request';
import { coalesceAsync } from '../../../../utils/coalesceAsync';
import type { GeneratedImageItem } from './imageGenStorage';

export type AssetMediaType = 'image' | 'video' | 'audio' | 'all';
export type AssetStatus = 'pending' | 'done' | 'error';
export type AssetSourceType = 'work' | 'upload' | 'all';

interface PlaygroundAsset {
  id: string;
  media_type: AssetMediaType | string;
  source_type?: string;
  source_type_code?: number;
  status: AssetStatus;
  prompt: string;
  model?: string;
  model_name?: string;
  model_mid?: string;
  param_values?: Record<string, any>;
  preview_url?: string;
  aspect_ratio?: string;
  resolution?: string;
  error_message?: string;
  upstream_task_id?: string;
  task_id?: string;
  sys_log_id?: string;
  batch_id?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: number;
  is_favorited?: boolean;
  album_ids?: string[] | number[];
  file_size?: number;
}

function parseSourceType(raw?: string): GeneratedImageItem['sourceType'] {
  if (raw === 'upload') return 'upload';
  if (raw === 'work') return 'work';
  return undefined;
}

function extractAssetList(res: any): PlaygroundAsset[] {
  if (Array.isArray(res?.assets)) return res.assets;
  if (Array.isArray(res?.resources)) return res.resources;
  if (Array.isArray(res?.outputs)) return res.outputs;
  return [];
}

function assetToGeneratedItem(a: PlaygroundAsset): GeneratedImageItem {
  const createdTs = typeof a.createdAt === 'number'
    ? a.createdAt
    : (a.created_at ? new Date(a.created_at).getTime() : Date.now());
  const updatedTs = a.updated_at ? new Date(a.updated_at).getTime() : undefined;

  return {
    id: String(a.id),
    prompt: a.prompt || '',
    createdAt: Number.isNaN(createdTs) ? Date.now() : createdTs,
    createdAtStr: a.created_at,
    updatedAt: updatedTs && !Number.isNaN(updatedTs) ? updatedTs : undefined,
    updatedAtStr: a.updated_at,
    previewUrl: a.preview_url || undefined,
    status: (a.status as GeneratedImageItem['status']) || 'done',
    model: a.model || a.model_name || undefined,
    modelMid: a.model_mid || undefined,
    paramValues: a.param_values && typeof a.param_values === 'object' ? a.param_values : undefined,
    aspectRatio: a.aspect_ratio || undefined,
    resolution: a.resolution || undefined,
    errorMessage: a.error_message || undefined,
    taskId: a.upstream_task_id || a.task_id || undefined,
    sysLogId: a.sys_log_id || undefined,
    batchId: a.batch_id || undefined,
    mediaType: a.media_type === 'video' ? 'video' : 'image',
    isFavorited: !!a.is_favorited,
    albumIds: Array.isArray(a.album_ids)
      ? a.album_ids.map((x) => String(x))
      : undefined,
    sourceType: parseSourceType(a.source_type),
    fileSize: typeof a.file_size === 'number' && a.file_size > 0 ? a.file_size : undefined,
  };
}

export async function listAssets(options?: {
  mediaType?: AssetMediaType;
  sourceType?: AssetSourceType;
  /** 资源库传 done；生成页不传或 all 以包含 pending */
  status?: AssetStatus | 'all';
  albumId?: string;
  keyword?: string;
  sort?: 'recent' | 'oldest' | 'name';
}): Promise<GeneratedImageItem[]> {
  const mediaType = options?.mediaType || 'image';
  const sourceType = options?.sourceType;
  const status = options?.status;
  const albumId = options?.albumId || '';
  const keyword = options?.keyword || '';
  const sort = options?.sort || 'recent';
  return coalesceAsync(
    `pg2026:assets:${mediaType}:${sourceType || 'all'}:${status || 'any'}:${albumId}:${keyword}:${sort}`,
    async () => {
      const res: any = await request.get('/playground-2026/assets', {
        params: {
          media_type: mediaType,
          source_type: sourceType && sourceType !== 'all' ? sourceType : undefined,
          status: status && status !== 'all' ? status : undefined,
          album_id: albumId || undefined,
          keyword: keyword || undefined,
          sort,
        },
      });
      return extractAssetList(res).map(assetToGeneratedItem);
    },
  );
}

export async function createAssetsBatch(input: {
  mediaType?: AssetMediaType;
  prompt: string;
  modelName?: string;
  modelMid?: string;
  paramValues?: Record<string, any>;
  aspectRatio?: string;
  resolution?: string;
  count?: number;
  status?: AssetStatus;
  sysLogId?: string;
  batchId?: string;
}): Promise<{ items: GeneratedImageItem[]; batchId: string }> {
  const res: any = await request.post('/playground-2026/assets', {
    media_type: input.mediaType || 'image',
    source_type: 'work',
    prompt: input.prompt,
    model_name: input.modelName,
    model_mid: input.modelMid,
    param_values: input.paramValues || {},
    aspect_ratio: input.aspectRatio || '',
    resolution: input.resolution || '',
    count: input.count ?? 1,
    status: input.status || 'pending',
    sys_log_id: input.sysLogId || '',
    batch_id: input.batchId || undefined,
  });
  const list = extractAssetList(res);
  return {
    items: list.map(assetToGeneratedItem),
    batchId: res?.batch_id || list[0]?.batch_id || '',
  };
}

export async function updateAsset(
  id: string,
  patch: {
    status?: AssetStatus;
    previewUrl?: string;
    errorMessage?: string;
    taskId?: string;
    sysLogId?: string;
    aspectRatio?: string;
    resolution?: string;
    paramValues?: Record<string, any>;
    /** 资源展示名（上传文件名 / 作品标题，存 prompt） */
    prompt?: string;
    fileSize?: number;
    tosObjectKey?: string;
  },
): Promise<GeneratedImageItem> {
  const res: any = await request.patch(`/playground-2026/assets/${id}`, {
    status: patch.status,
    preview_url: patch.previewUrl,
    error_message: patch.errorMessage,
    upstream_task_id: patch.taskId,
    sys_log_id: patch.sysLogId,
    aspect_ratio: patch.aspectRatio,
    resolution: patch.resolution,
    param_values: patch.paramValues,
    prompt: patch.prompt,
    file_size: patch.fileSize,
    tos_object_key: patch.tosObjectKey,
  });
  return assetToGeneratedItem(res?.asset || res?.resource || res?.output || { id, ...patch });
}

export async function deleteAsset(id: string): Promise<void> {
  await request.delete(`/playground-2026/assets/${id}`);
}

/** 批量导入（localStorage 迁移） */
export async function importAssets(
  items: Array<{
    media_type?: string;
    source_type?: string;
    prompt: string;
    model_name?: string;
    model_mid?: string;
    param_values?: Record<string, any>;
    aspect_ratio?: string;
    resolution?: string;
    status?: string;
    preview_url?: string;
    error_message?: string;
    task_id?: string;
    batch_id?: string;
    created_at_ms?: number;
  }>,
): Promise<GeneratedImageItem[]> {
  if (!items.length) return [];
  const res: any = await request.post('/playground-2026/assets', {
    items: items.map((item) => ({
      ...item,
      source_type: item.source_type || 'work',
    })),
  });
  return extractAssetList(res).map(assetToGeneratedItem);
}
