/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 视频 outputs：恢复 pending（对齐图片续跑，endpoint=/v1/video/generations）
 */
import request from '../../../../utils/request';
import type { GeneratedImageItem } from './imageGenStorage';
import { updateAsset } from './assetsApi';
import { extractVideoUrl } from './resultExtractor';
import { formatGenerationError, pollVideoTaskById } from './videoGenerationApi';
import { settleThenPersistBatchMedia } from './settleBatchMedia';

const activeRecoveries = new Set<string>();

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function groupKey(it: GeneratedImageItem): string {
  if (it.taskId) return `vtask:${it.taskId}`;
  if (it.sysLogId) return `vlog:${it.sysLogId}`;
  return `vid:${it.id}`;
}

function extractVideoUrls(res: any): string[] {
  const one = extractVideoUrl(res);
  if (one) return [one];
  const list = Array.isArray(res?.data) ? res.data : [];
  return list
    .map((d: any) => (typeof d === 'string' ? d : d?.url || d?.video_url))
    .filter((u: any) => typeof u === 'string' && !!u);
}

async function recoverByLogId(
  logId: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<any> {
  return request.get('/playground-2026/recover-by-log-id', {
    params: { log_id: logId, endpoint },
    skipErrorHandler: true,
    signal,
  } as any);
}

async function applyGroupResult(
  group: GeneratedImageItem[],
  urls: string[],
  taskId: string | undefined,
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void,
): Promise<GeneratedImageItem[]> {
  const settled = await settleThenPersistBatchMedia({
    batch: group,
    urls,
    taskId,
    onLocalUpdate,
  });
  return settled.kept;
}

async function markGroupError(
  group: GeneratedImageItem[],
  errorMessage: string,
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void,
): Promise<void> {
  await Promise.all(
    group.map(async (it) => {
      const next = { ...it, status: 'error' as const, errorMessage };
      onLocalUpdate?.(it.id, next);
      try {
        await updateAsset(it.id, { status: 'error', errorMessage });
      } catch (e) {
        console.warn('[outputs] 视频标记失败写回失败', it.id, e);
      }
    }),
  );
}

async function recoverOneGroup(options: {
  group: GeneratedImageItem[];
  tokenKey: string;
  signal?: AbortSignal;
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void;
}): Promise<void> {
  const { group, tokenKey, signal, onLocalUpdate } = options;
  if (!group.length) return;

  let taskId = group.map((g) => g.taskId).find(Boolean);
  const sysLogId = group.map((g) => g.sysLogId).find(Boolean);
  const endpoint = '/v1/video/generations';

  try {
    if (!taskId && sysLogId) {
      const maxRecoverAttempts = 60;
      for (let i = 0; i < maxRecoverAttempts; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const res: any = await recoverByLogId(sysLogId, endpoint, signal);
        const status = String(res?.status || '').toLowerCase();

        if (status === 'processing') {
          await sleep(10_000, signal);
          continue;
        }
        if (status === 'failed' || status === 'error') {
          await markGroupError(group, res?.message || '生成失败', onLocalUpdate);
          return;
        }
        if (status === 'async' && res?.task_id) {
          taskId = String(res.task_id);
          await Promise.all(
            group.map(async (it) => {
              const next = { ...it, taskId };
              onLocalUpdate?.(it.id, next);
              try {
                await updateAsset(it.id, { taskId, sysLogId: it.sysLogId });
              } catch {
                // ignore
              }
            }),
          );
          break;
        }
        if (status === 'completed') {
          const urls = extractVideoUrls(res?.result_data || res);
          if (urls.length === 0) {
            await markGroupError(group, '任务完成但未返回视频地址', onLocalUpdate);
            return;
          }
          await applyGroupResult(group, urls, undefined, onLocalUpdate);
          return;
        }
        await sleep(10_000, signal);
      }
      if (!taskId) {
        await markGroupError(group, '生成超时，请稍后重试', onLocalUpdate);
        return;
      }
    }

    if (taskId) {
      if (!tokenKey) return;
      const finalRes = await pollVideoTaskById({
        taskId,
        tokenKey,
        signal,
      });
      const urls = extractVideoUrls(finalRes);
      if (urls.length === 0) {
        await markGroupError(group, '任务完成但未返回视频地址', onLocalUpdate);
        return;
      }
      await applyGroupResult(group, urls, taskId, onLocalUpdate);
      return;
    }

    await markGroupError(group, '无法恢复：缺少任务信息，请重试', onLocalUpdate);
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
    await markGroupError(group, formatGenerationError(err), onLocalUpdate);
  }
}

export async function resumePendingVideoItems(options: {
  items: GeneratedImageItem[];
  tokenKey: string;
  signal?: AbortSignal;
  onLocalUpdate?: (id: string, next: GeneratedImageItem | null) => void;
}): Promise<void> {
  const pending = options.items.filter((it) => it.status === 'pending');
  if (pending.length === 0) return;

  const groups = new Map<string, GeneratedImageItem[]>();
  for (const it of pending) {
    const key = groupKey(it);
    const list = groups.get(key) || [];
    list.push(it);
    groups.set(key, list);
  }

  await Promise.all(
    [...groups.entries()].map(async ([key, group]) => {
      if (activeRecoveries.has(key)) return;
      activeRecoveries.add(key);
      try {
        const sorted = [...group].sort(
          (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
        );
        await recoverOneGroup({
          group: sorted,
          tokenKey: options.tokenKey,
          signal: options.signal,
          onLocalUpdate: options.onLocalUpdate,
        });
      } finally {
        activeRecoveries.delete(key);
      }
    }),
  );
}
