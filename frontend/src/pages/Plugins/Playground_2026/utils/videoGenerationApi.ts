/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 独立视频生成页：提交 / 轮询 / 解析结果（规则对齐图片页 + 画布视频路径）
 */
import request from '../../../../utils/request';
import type { PlaygroundModel, SchemePort } from '../types';
import { extractVideoUrl } from './resultExtractor';
import {
  formatGenerationError,
  generateLogId,
  isTransientPollError,
  loadApiTokens,
  pickSavedTokenKey,
  saveSelectedTokenKey,
} from './imageGenerationApi';
import type { ApiTokenItem } from './imageGenerationApi';
import { resolveMaxReferenceImages } from './referenceUpload';
import {
  applyIoValuesToRequestBody,
  type SchemeIoToolValues,
} from './schemeIoToolValues';

export type { ApiTokenItem };
export {
  formatGenerationError,
  generateLogId,
  loadApiTokens,
  pickSavedTokenKey,
  saveSelectedTokenKey,
};

function applySeedanceTaskType(
  body: Record<string, any>,
  model: PlaygroundModel,
  videoToolMode?: string,
) {
  if (model.scheme_id !== 'seedance2.0') return;
  if (videoToolMode === 'edit-video') body.omni_reference_task_type = 'edit';
  else if (videoToolMode === 'extend') body.omni_reference_task_type = 'extend';
}

function buildVideoGenerationBody(
  model: PlaygroundModel,
  prompt: string,
  paramValues: Record<string, any>,
  referenceUrls?: string[],
  ioValues?: SchemeIoToolValues,
  ioPorts?: SchemePort[],
  videoToolMode?: string,
): Record<string, any> {
  const body: Record<string, any> = {
    model: model.model_id,
    prompt: prompt.trim(),
  };
  Object.entries(paramValues || {}).forEach(([key, val]) => {
    if (val === undefined || val === null || val === '') return;
    if (key.startsWith('_')) return;
    const lk = key.toLowerCase();
    if (
      lk === 'prompt' ||
      lk === 'negative_prompt' ||
      lk === 'negativeprompt' ||
      lk === 'image_role' ||
      lk === 'image_url' ||
      lk === 'image_urls' ||
      lk === 'video_url' ||
      lk === 'video_urls' ||
      lk === 'audio_urls' ||
      lk === 'end_image_url' ||
      lk === 'reference_urls' ||
      lk === 'files' ||
      lk === 'links' ||
      lk === 'videos' ||
      lk === 'audios'
    ) {
      return;
    }
    body[key] = val;
  });

  if (ioValues && ioPorts && ioPorts.length > 0) {
    applyIoValuesToRequestBody(body, ioValues, ioPorts);
  } else {
    const maxRefs = resolveMaxReferenceImages(model);
    const refs = (referenceUrls || []).filter(Boolean).slice(0, maxRefs);
    if (refs.length > 0) {
      // 对齐画布 useGeneration：视频上游吃 images
      body.images = refs;
    }
  }

  if (!body.prompt && prompt.trim()) {
    body.prompt = prompt.trim();
  }
  if (
    model.scheme_id === 'openai_video' ||
    model.scheme_id === 'seedance2.0' ||
    model.scheme_id === 'seedance2' ||
    model.scheme_id === 'wan3.0' ||
    model.scheme_id === 'dashscope_video'
  ) {
    delete body.negative_prompt;
    delete body.negativePrompt;
  }
  applySeedanceTaskType(body, model, videoToolMode);
  return body;
}

function resolveVideoEndpoint(model: PlaygroundModel): string {
  const ep = (model.endpoint || '').trim();
  if (ep) {
    const normalized = ep.startsWith('/') ? ep : `/${ep}`;
    if (normalized.includes('video') || normalized.includes('contents/generations')) {
      return normalized;
    }
  }
  return '/v1/video/generations';
}

function resolvePollEndpoint(model: PlaygroundModel, taskId: string): string {
  const tmpl = (model.poll_endpoint || '').trim();
  if (tmpl) {
    if (tmpl.includes('{task_id}')) return tmpl.replace('{task_id}', taskId);
    if (tmpl.includes('{id}')) return tmpl.replace('{id}', taskId);
    return tmpl.endsWith('/') ? `${tmpl}${taskId}` : `${tmpl}/${taskId}`;
  }
  return `/v1/tasks/${taskId}`;
}

function getErrorMessage(err: any): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    (typeof err?.response?.data?.error === 'string' ? err.response.data.error : undefined) ||
    err?.message ||
    '生成失败，请重试'
  );
}

function extractVideoUrls(res: any): string[] {
  const one = extractVideoUrl(res);
  if (one) return [one];
  const list = Array.isArray(res?.data) ? res.data : [];
  const urls = list
    .map((d: any) => (typeof d === 'string' ? d : d?.url || d?.video_url))
    .filter((u: any) => typeof u === 'string' && !!u);
  return urls;
}

export interface GenerateVideosResult {
  urls: string[];
  raw: any;
  taskId?: string;
  sysLogId: string;
}

/**
 * 提交视频生成；异步任务则轮询至完成（默认最长约 60 分钟）。
 */
export async function generateVideosWithModel(options: {
  model: PlaygroundModel;
  prompt: string;
  paramValues: Record<string, any>;
  tokenKey: string;
  signal?: AbortSignal;
  sysLogId?: string;
  onAsyncStarted?: (taskId: string) => void;
  referenceUrls?: string[];
  /** 方案 IO 入参（工具页）；有则按 bind_key 写入 body */
  ioValues?: SchemeIoToolValues;
  ioPorts?: SchemePort[];
  videoToolMode?: string;
}): Promise<GenerateVideosResult> {
  const {
    model,
    prompt,
    paramValues,
    tokenKey,
    signal,
    onAsyncStarted,
    referenceUrls,
    ioValues,
    ioPorts,
    videoToolMode,
  } = options;
  if (!tokenKey) {
    throw new Error('请先选择 API 密钥');
  }
  if (!prompt.trim()) {
    throw new Error('请输入提示词');
  }

  const endpoint = resolveVideoEndpoint(model);
  const body = buildVideoGenerationBody(
    model,
    prompt,
    paramValues,
    referenceUrls,
    ioValues,
    ioPorts,
    videoToolMode,
  );
  const sysLogId = options.sysLogId || generateLogId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Playground-2026': '1',
    'X-Log-Id': sysLogId,
    Authorization: `Bearer ${tokenKey}`,
  };

  const res: any = await request.post(endpoint, body, {
    headers,
    baseURL: '',
    skipErrorHandler: true,
    signal,
  } as any);

  const taskId = res?.id || res?.task_id;
  const isVideoEndpoint = endpoint.includes('video') || endpoint.includes('contents/generations');
  const isAsyncTask =
    !!taskId &&
    (isVideoEndpoint ||
      res?.status === 'pending' ||
      res?.status === 'in_progress' ||
      res?.status === 'queued' ||
      res?.status === 'processing');

  if (!isAsyncTask) {
    const urls = extractVideoUrls(res);
    if (urls.length === 0) {
      throw new Error('生成成功但未返回视频地址');
    }
    return { urls, raw: res, taskId: taskId || undefined, sysLogId };
  }

  onAsyncStarted?.(String(taskId));
  const finalRes = await pollVideoTaskById({
    taskId: String(taskId),
    tokenKey,
    model,
    signal,
  });
  const urls = extractVideoUrls(finalRes);
  if (urls.length === 0) {
    throw new Error('任务完成但未返回视频地址');
  }
  return { urls, raw: finalRes, taskId: String(taskId), sysLogId };
}

/** 按 task_id 轮询异步视频任务（生成页续跑 / 异地恢复共用） */
export async function pollVideoTaskById(options: {
  taskId: string;
  tokenKey: string;
  model?: PlaygroundModel;
  pollUrl?: string;
  signal?: AbortSignal;
}): Promise<any> {
  const { taskId, tokenKey, model, signal } = options;
  const pollUrl = options.pollUrl || (model ? resolvePollEndpoint(model, taskId) : `/v1/tasks/${taskId}`);
  // 对齐画布视频：最长约 60 分钟
  const maxAttempts = 720;
  const intervalMs = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let res: any;
    try {
      res = await request.get(pollUrl, {
        headers: {
          'X-Playground-2026': '1',
          Authorization: `Bearer ${tokenKey}`,
        },
        timeout: 15000,
        baseURL: '',
        skipErrorHandler: true,
        signal,
      } as any);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') throw err;
      if (!isTransientPollError(err) || attempt >= maxAttempts - 1) {
        throw new Error(getErrorMessage(err));
      }
      await sleep(intervalMs, signal);
      continue;
    }

    const taskStatus = String(res?.status || '').toLowerCase();
    if (['succeeded', 'completed', 'success'].includes(taskStatus)) {
      return res;
    }
    if (['failed', 'fail', 'error', 'cancelled', 'canceled'].includes(taskStatus)) {
      throw new Error(
        res?.error?.message || res?.message || res?.error || '视频生成任务失败',
      );
    }

    await sleep(intervalMs, signal);
  }

  throw new Error('生成超时，请稍后在任务列表查看或重试');
}

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
