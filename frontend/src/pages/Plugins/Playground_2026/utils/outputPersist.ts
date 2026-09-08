/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片/视频生成页：将上游结果转存至自有存储
 * 后端路径：{path_prefix}/p2026{uid}/assets/works/{yyyy-mm-dd}/{uuid}.{ext}
 */
import request from '../../../../utils/request';
import type { GeneratedImageItem } from './imageGenStorage';
import { updateAsset } from './assetsApi';
import { formatGenerationError } from './imageGenerationApi';

const activePersists = new Set<string>();

function isOwnStandaloneOutputUrl(url: string): boolean {
  return (
    !!url &&
    url.includes('/p2026') &&
    (url.includes('/assets/works/') || url.includes('/output/'))
  );
}

function isPersistAbortError(err: any): boolean {
  return err?.name === 'AbortError' || err?.code === 'ERR_CANCELED';
}

function formatPersistError(err: any): string {
  const raw = formatGenerationError(err).trim() || '转存失败';
  return raw.startsWith('转存失败') ? raw : `转存失败：${raw}`;
}

function needsOutputPersist(item: GeneratedImageItem): boolean {
  if (item.status === 'error' || item.status === 'pending') return false;
  if (item.sourceType === 'upload') return false;
  const url = (item.previewUrl || '').trim();
  if (!url) return false;
  return !isOwnStandaloneOutputUrl(url);
}

export type PersistedOutput = {
  url: string;
  fileSize?: number;
  objectKey?: string;
};

/** 上游 URL → 自有 works 路径；已是自有路径则原样返回。失败抛错，不回退上游。 */
async function persistStandaloneOutput(
  sourceUrl: string,
  assetId?: string,
): Promise<PersistedOutput> {
  const url = (sourceUrl || '').trim();
  if (!url) throw new Error('文件地址为空');
  if (isOwnStandaloneOutputUrl(url)) return { url };

  const res: any = await request.post(
    '/playground-2026/project-assets/output-persist',
    { source_url: url, asset_id: assetId || undefined },
    { skipErrorHandler: true } as any,
  );
  const next = res?.url;
  if (!next || typeof next !== 'string') {
    throw new Error('转存成功但未返回文件地址');
  }
  return {
    url: next,
    fileSize: typeof res?.file_size === 'number' ? res.file_size : undefined,
    objectKey: typeof res?.object_key === 'string' ? res.object_key : undefined,
  };
}

async function markPersistFailed(
  item: GeneratedImageItem,
  err: any,
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void,
): Promise<GeneratedImageItem> {
  const errorMessage = formatPersistError(err);
  const next: GeneratedImageItem = {
    ...item,
    status: 'error',
    previewUrl: undefined,
    errorMessage,
    updatedAt: Date.now(),
  };
  onLocalUpdate?.(item.id, next);
  try {
    await updateAsset(item.id, {
      status: 'error',
      previewUrl: '',
      errorMessage,
    });
  } catch (e) {
    console.warn('[output-persist] 转存失败写回失败', item.id, e);
  }
  return next;
}

/** 把已回显的上游地址转存为自有存储；失败则作品卡报错并去掉上游预览。 */
export async function persistEchoedOutput(
  item: GeneratedImageItem,
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void,
): Promise<GeneratedImageItem> {
  const sourceUrl = (item.previewUrl || '').trim();
  if (!sourceUrl) return item;
  if (isOwnStandaloneOutputUrl(sourceUrl)) return item;
  if (activePersists.has(item.id)) return item;
  activePersists.add(item.id);
  try {
    const p = await persistStandaloneOutput(sourceUrl, item.id);
    if (!p.url) {
      throw new Error('转存成功但未返回文件地址');
    }
    if (p.url === sourceUrl && !isOwnStandaloneOutputUrl(p.url)) {
      throw new Error('转存未写入自有存储');
    }
    const next: GeneratedImageItem = {
      ...item,
      status: 'done',
      previewUrl: p.url,
      fileSize: p.fileSize || item.fileSize,
      errorMessage: undefined,
    };
    onLocalUpdate?.(item.id, next);
    try {
      await updateAsset(item.id, {
        status: 'done',
        previewUrl: next.previewUrl || '',
        errorMessage: '',
        fileSize: next.fileSize,
        tosObjectKey: p.objectKey,
      });
    } catch (e) {
      console.warn('[output-persist] 存储地址回填失败', item.id, e);
    }
    return next;
  } catch (e) {
    if (isPersistAbortError(e)) return item;
    return markPersistFailed(item, e, onLocalUpdate);
  } finally {
    activePersists.delete(item.id);
  }
}

/** 刷新后：已完成但仍是上游地址的作品继续转存 */
export async function resumeUnpersistedOutputs(options: {
  items: GeneratedImageItem[];
  signal?: AbortSignal;
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void;
}): Promise<void> {
  if (options.signal?.aborted) return;
  const targets = options.items.filter(needsOutputPersist);
  if (targets.length === 0) return;
  await Promise.all(
    targets.map(async (it) => {
      if (options.signal?.aborted) return;
      await persistEchoedOutput(it, options.onLocalUpdate);
    }),
  );
}
