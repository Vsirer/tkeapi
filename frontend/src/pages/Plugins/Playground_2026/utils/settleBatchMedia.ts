/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 多图/多视频批次结果对齐：有 URL 的槽位标完成，多出来的占位删除（不标「未返回」假失败）。
 * Seedream 等上游组图张数可能少于请求 n。
 */
import type { GeneratedImageItem } from './imageGenStorage';
import { deleteAsset, updateAsset } from './assetsApi';
import { persistEchoedOutput, type PersistedOutput } from './outputPersist';

export type SettleBatchMediaResult = {
  kept: GeneratedImageItem[];
  removedIds: string[];
  returned: number;
  requested: number;
};

async function settleBatchMediaUrls(options: {
  batch: GeneratedImageItem[];
  urls: Array<string | PersistedOutput>;
  taskId?: string;
  sysLogId?: string;
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void;
}): Promise<SettleBatchMediaResult> {
  const { batch, urls, taskId, sysLogId, onLocalUpdate } = options;
  const requested = batch.length;
  const usable = urls.filter((u) => {
    if (typeof u === 'string') return u.trim().length > 0;
    return typeof u?.url === 'string' && u.url.trim().length > 0;
  });
  const returned = Math.min(usable.length, requested);

  const kept: GeneratedImageItem[] = [];
  for (let i = 0; i < returned; i += 1) {
    const it = batch[i];
    const raw = usable[i];
    const itemUrl = typeof raw === 'string' ? raw : raw.url;
    const itemFileSize = typeof raw === 'object' ? raw.fileSize : undefined;
    const itemObjectKey = typeof raw === 'object' ? raw.objectKey : undefined;

    const next: GeneratedImageItem = {
      ...it,
      status: 'done',
      previewUrl: itemUrl,
      taskId: taskId || it.taskId,
      sysLogId: sysLogId || it.sysLogId,
      errorMessage: undefined,
      fileSize: itemFileSize || it.fileSize,
    };
    kept.push(next);
    onLocalUpdate?.(it.id, next);
    try {
      await updateAsset(it.id, {
        status: 'done',
        previewUrl: next.previewUrl || '',
        errorMessage: '',
        taskId: next.taskId,
        sysLogId: next.sysLogId,
        fileSize: itemFileSize,
        tosObjectKey: itemObjectKey,
      });
    } catch (e) {
      console.warn('[settle-batch] 写回失败', it.id, e);
    }
  }

  const removedIds: string[] = [];
  for (let i = returned; i < requested; i += 1) {
    const it = batch[i];
    removedIds.push(it.id);
    onLocalUpdate?.(it.id, null);
    try {
      await deleteAsset(it.id);
    } catch (e) {
      console.warn('[settle-batch] 删除多余占位失败', it.id, e);
    }
  }

  return { kept, removedIds, returned, requested };
}

/**
 * 先用上游地址立刻回显，转存到自有存储后再把正式地址写回去。
 * 转存失败：作品卡展示转存异常，并去掉上游预览。刷新中断不记失败，下次进入继续转存。
 */
export async function settleThenPersistBatchMedia(options: {
  batch: GeneratedImageItem[];
  urls: string[];
  taskId?: string;
  sysLogId?: string;
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void;
}): Promise<SettleBatchMediaResult> {
  const settled = await settleBatchMediaUrls({
    batch: options.batch,
    urls: options.urls,
    taskId: options.taskId,
    sysLogId: options.sysLogId,
    onLocalUpdate: options.onLocalUpdate,
  });

  if (!settled.kept.length) return settled;

  for (let i = 0; i < settled.kept.length; i += 1) {
    const cur = settled.kept[i];
    if (!cur) continue;
    settled.kept[i] = await persistEchoedOutput(cur, options.onLocalUpdate);
  }

  return settled;
}
