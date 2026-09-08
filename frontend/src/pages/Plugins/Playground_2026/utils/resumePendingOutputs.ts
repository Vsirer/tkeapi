/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片 outputs：恢复 pending（对齐画布 task_id / recover-by-log-id）
 */
import request from '../../../../utils/request';
import type { GeneratedImageItem } from './imageGenStorage';
import { updateAsset } from './assetsApi';
import { extractImageDisplayUrls } from './resultExtractor';
import { formatGenerationError, pollImageTaskById } from './imageGenerationApi';
import { settleThenPersistBatchMedia } from './settleBatchMedia';

/** 模块级锁，避免列表/生成页同时重复恢复同一批 */
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
  if (it.taskId) return `task:${it.taskId}`;
  if (it.sysLogId) return `log:${it.sysLogId}`;
  return `id:${it.id}`;
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
        console.warn('[outputs] 标记失败写回失败', it.id, e);
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
  const endpoint =
    group.some((g) => Array.isArray(g.paramValues?.image_urls) && g.paramValues.image_urls.length) ||
    group.some((g) => g.paramValues?.image_url)
      ? '/v1/images/edits'
      : '/v1/images/generations';

  try {
    // 1) 无 task_id：先用 sys_log_id 查日志
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
          const urls = extractImageDisplayUrls(res?.result_data || res);
          if (urls.length === 0) {
            await markGroupError(group, '任务完成但未返回图片地址', onLocalUpdate);
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

    // 2) 有 task_id：轮询（需要 API 密钥）
    if (taskId) {
      if (!tokenKey) {
        // 已写入 taskId，异地暂无密钥时保持 pending，待用户选密钥后再续
        return;
      }
      const finalRes = await pollImageTaskById({
        taskId,
        tokenKey,
        signal,
      });
      const urls = extractImageDisplayUrls(finalRes);
      if (urls.length === 0) {
        await markGroupError(group, '任务完成但未返回图片地址', onLocalUpdate);
        return;
      }
      await applyGroupResult(group, urls, taskId, onLocalUpdate);
      return;
    }

    // 3) 既无 task 也无 log：无法恢复
    await markGroupError(group, '无法恢复：缺少任务信息，请重试', onLocalUpdate);
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
    await markGroupError(group, formatGenerationError(err), onLocalUpdate);
  }
}

/**
 * 恢复 pending 作品：有 taskId 续轮询；仅有 sysLogId 则走 recover-by-log-id。
 * 同 batch / 同 task 只恢复一次，结果按顺序分发到多张卡片。
 */
export async function resumePendingImageItems(options: {
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
