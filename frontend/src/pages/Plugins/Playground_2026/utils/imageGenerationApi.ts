/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 独立图片生成页：提交 / 轮询 / 解析结果（对齐画布 AiImageNode）
 */
import request from '../../../../utils/request';
import { coalesceAsync, invalidateCoalesce } from '../../../../utils/coalesceAsync';
import type { PlaygroundModel, SchemeParam } from '../types';
import { extractImageDisplayUrls } from './resultExtractor';
import { resolveMaxReferenceImages } from './referenceUpload';
import { imageSpecialOmitRequestKeys, applyImageSpecialRequestPack } from './imageSpecialParams';

const TOKEN_STORAGE_KEY = 'playground_2026_saved_token';

export interface ApiTokenItem {
  id?: number;
  name?: string;
  token_key: string;
  quota_limit?: number;
  /** 后端字段多为 quota_used；兼容 used_quota */
  quota_used?: number;
  used_quota?: number;
  only_playground?: number;
  only_playground_2026?: number;
  created_at?: string;
  last_used_at?: string;
  status?: number;
}

function isUsablePlayground2026Token(t: ApiTokenItem): boolean {
  return !(t.only_playground === 1 && t.only_playground_2026 !== 1);
}

const TOKENS_COALESCE_KEY = 'pg2026:api-tokens';

export async function loadApiTokens(): Promise<ApiTokenItem[]> {
  return coalesceAsync(TOKENS_COALESCE_KEY, async () => {
    try {
      const res: any = await request.get('/tokens');
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      return list.filter(isUsablePlayground2026Token);
    } catch {
      return [];
    }
  });
}

/** 创建创作中心 2026 专用令牌（POST /tokens） */
export async function createApiToken(input: {
  name: string;
  quota_limit?: number;
}): Promise<ApiTokenItem> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('请输入密钥名称');
  }
  const data = {
    name,
    quota_limit: input.quota_limit ?? -1,
    only_playground_2026: 1,
    only_playground: 0,
    allowed_models: [],
  };
  const res: any = await (request as any).post('/tokens', data, { skipErrorHandler: true });
  invalidateCoalesce(TOKENS_COALESCE_KEY);
  const created = (res?.data || res) as ApiTokenItem;
  if (created?.token_key) return created;
  const list = await loadApiTokens();
  const found = list.find((t) => t.name === name);
  if (found) return found;
  throw new Error('创建令牌成功但未返回密钥');
}

/** 删除令牌（DELETE /tokens/:id） */
export async function deleteApiToken(id: number): Promise<void> {
  await request.delete(`/tokens/${id}`);
  invalidateCoalesce(TOKENS_COALESCE_KEY);
}

export function pickSavedTokenKey(tokens: ApiTokenItem[]): string {
  const saved = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  if (saved && tokens.some((t) => t.token_key === saved)) return saved;
  return tokens[0]?.token_key || '';
}

export function saveSelectedTokenKey(tokenKey: string): void {
  if (!tokenKey) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, tokenKey);
}

export function generateLogId(): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return `tsk_${raw.replace(/-/g, '').toLowerCase().substring(0, 26)}`;
}

/** 方案扁平参数写入上游 body（嵌套字段在此展开） */
export function applyImageGenerationParam(
  body: Record<string, any>,
  key: string,
  val: unknown,
): boolean {
  const lk = key.toLowerCase();
  if (lk === 'optimize_prompt_mode') {
    const mode = String(val);
    if (mode === 'fast' || mode === 'standard') {
      body.optimize_prompt_options = { mode };
    }
    return true;
  }
  if (lk === 'variations') {
    const n = Math.max(1, Math.min(10, Number(val) || 1));
    body.n = n;
    body.variations = n;
    return true;
  }
  if (lk === 'quality') {
    const q = String(val).toLowerCase();
    body.quality = q;
    return true;
  }
  if (lk === 'prompt_enhancer') {
    body.prompt_enhancer = Boolean(val);
    return true;
  }
  return false;
}

/** 构建文生图请求体（模型 + 方案参数 + 提示词） */
function buildImageGenerationBody(
  model: PlaygroundModel,
  prompt: string,
  paramValues: Record<string, any>,
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
      lk === 'reference_urls'
    ) {
      return;
    }
    if (lk === 'layer_decomposition' && val !== true) return;
    // Azure / OpenAI Images 不接受 watermark 等扩展字段
    if (shouldOmitOpenAiImageExtraParam(model, key)) return;
    if (applyImageGenerationParam(body, key, val)) return;
    body[key] = val;
  });
  imageSpecialOmitRequestKeys(model.image_special_params).forEach((key) => {
    delete body[key];
  });
  applyImageSpecialRequestPack(body, model.image_special_params, paramValues);
  if (paramValues?.layer_decomposition === true) {
    body.n = 1;
    body.layer_decomposition = true;
    const sizeParam = (model.params || []).find((p) => (p.key || '').toLowerCase() === 'size');
    body.size = coerceSizeForLayerDecomposition(body.size ?? paramValues.size, sizeParam?.options);
    if (!body.prompt) delete body.prompt;
  } else if (String(body.size || '').toLowerCase() === 'auto') {
    body.size = '2K';
  }
  if (paramValues?.background === 'transparent' || paramValues?.layer_decomposition === true) {
    body.output_format = 'png';
  }
  return body;
}

const LAYER_SPLIT_SIZE_PRESET_RE = /^(auto|[1-4](?:\.5)?k)$/i;
const PIXEL_SIZE_RE = /^(\d+)\s*[xX×*＊]\s*(\d+)$/;
const LAYER_SPLIT_SIZE_FALLBACK = ['2K', '3K', '4K'];

function isLayerDecompositionSizePreset(size: unknown): boolean {
  return LAYER_SPLIT_SIZE_PRESET_RE.test(String(size ?? '').trim());
}

function normalizeLayerSplitSizePreset(raw: string): string {
  const s = raw.trim();
  if (/^auto$/i.test(s)) return 'auto';
  return s.toUpperCase();
}

function mapPixelSizeToLayerSplitPreset(raw: string): string {
  const m = raw.trim().match(PIXEL_SIZE_RE);
  if (!m) return '2K';
  const long = Math.max(Number(m[1]), Number(m[2]));
  if (long >= 3840) return '4K';
  if (long >= 2880) return '3K';
  if (long >= 1536) return '2K';
  if (long >= 1280) return '1.5K';
  return '1K';
}

/** 图层拆分只接受 2K/3K/4K/auto 等预设，不能传 2048x2048 */
export function coerceSizeForLayerDecomposition(
  size: unknown,
  allowed?: (string | number)[],
): string {
  const raw = String(size ?? '').trim();
  const mapped = isLayerDecompositionSizePreset(raw)
    ? normalizeLayerSplitSizePreset(raw)
    : mapPixelSizeToLayerSplitPreset(raw);
  const presets = (allowed || [])
    .map((o) => String(o).trim())
    .filter((o) => isLayerDecompositionSizePreset(o))
    .map(normalizeLayerSplitSizePreset);
  const clampTo = presets.length ? presets : LAYER_SPLIT_SIZE_FALLBACK;
  const hit = clampTo.find((o) => o.toUpperCase() === mapped.toUpperCase());
  if (hit) return hit;
  const twoK = clampTo.find((o) => o === '2K');
  return twoK || clampTo[0];
}

function filterSizeOptionsForLayerDecomposition<T extends Pick<SchemeParam, 'key' | 'options'>>(
  params: T[],
): T[] {
  return params.map((p) => {
    if ((p.key || '').toLowerCase() !== 'size') return p;
    const presets = (p.options || []).filter((o) => isLayerDecompositionSizePreset(o));
    return {
      ...p,
      options: presets.length ? presets : [...LAYER_SPLIT_SIZE_FALLBACK],
    };
  });
}

/** 图层拆分：只留档位；普通生成：去掉仅图层拆分可用的 auto */
export function filterSizeOptionsForCurrentMode<T extends Pick<SchemeParam, 'key' | 'options'>>(
  params: T[],
  layerSplitOn: boolean,
): T[] {
  if (layerSplitOn) return filterSizeOptionsForLayerDecomposition(params);
  return params.map((p) => {
    if ((p.key || '').toLowerCase() !== 'size' || !p.options) return p;
    const next = p.options.filter((o) => String(o).trim().toLowerCase() !== 'auto');
    return next.length === p.options.length ? p : { ...p, options: next };
  });
}

/** gpt-image / Azure / DALL·E 等 OpenAI Images 上游会拒收的扩展参数 */
export function shouldOmitOpenAiImageExtraParam(
  model: Pick<PlaygroundModel, 'model_id' | 'name' | 'endpoint'> & { scheme_id?: string },
  key: string,
): boolean {
  const lk = key.toLowerCase();
  if (lk !== 'watermark' && lk !== 'prompt_extend') return false;
  const hay = `${model.model_id || ''} ${model.name || ''} ${model.scheme_id || ''} ${model.endpoint || ''}`.toLowerCase();
  // 国产通道需要 watermark，不要误剥
  if (
    /jimeng|dashscope|volc|seedream|kling|minimax|wanx|qwen|bytefor|tencent/.test(hay)
  ) {
    return false;
  }
  return /azure|gpt-image|dall-?e|openai|\/v1\/images/.test(hay) || !hay.trim();
}

function resolveImageEndpoint(model: PlaygroundModel, hasReference?: boolean): string {
  if (hasReference) return '/v1/images/edits';
  const ep = (model.endpoint || '').trim();
  if (ep) return ep.startsWith('/') ? ep : `/${ep}`;
  return '/v1/images/generations';
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

/** 轮询可重试：无 HTTP 状态（断网/超时）或 429/5xx；4xx 业务失败立刻停 */
export function isTransientPollError(err: any): boolean {
  const status = err?.response?.status;
  if (typeof status !== 'number') return true;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export interface GenerateImagesResult {
  urls: string[];
  raw: any;
  taskId?: string;
  sysLogId: string;
}

/**
 * 提交图片生成；若为异步任务则轮询至完成。
 * signal 可用于页面卸载时中止等待。
 */
async function generateImagesWithModel(options: {
  model: PlaygroundModel;
  prompt: string;
  paramValues: Record<string, any>;
  tokenKey: string;
  signal?: AbortSignal;
  /** 预先创建并已写入 outputs 的 log id；不传则内部生成 */
  sysLogId?: string;
  onAsyncStarted?: (taskId: string) => void;
  /** 参考图 URL 列表；有则走 /v1/images/edits */
  referenceUrls?: string[];
}): Promise<GenerateImagesResult> {
  const { model, prompt, paramValues, tokenKey, signal, onAsyncStarted, referenceUrls } = options;
  if (!tokenKey) {
    throw new Error('请先选择 API 密钥');
  }
  if (!prompt.trim() && paramValues?.layer_decomposition !== true) {
    throw new Error('请输入提示词');
  }

  const maxRefs =
    paramValues?.layer_decomposition === true ? 1 : resolveMaxReferenceImages(model);
  const refs = (referenceUrls || []).filter(Boolean).slice(0, maxRefs);
  const endpoint = resolveImageEndpoint(model, refs.length > 0);
  const body = buildImageGenerationBody(model, prompt, paramValues);
  if (refs.length > 0) {
    body.image_urls = refs;
  }
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
  const isAsyncTask =
    !!taskId &&
    (res?.status === 'pending' ||
      res?.status === 'in_progress' ||
      res?.status === 'queued' ||
      res?.status === 'processing');

  if (!isAsyncTask) {
    const urls = extractImageDisplayUrls(res);
    if (urls.length === 0) {
      throw new Error('生成成功但未返回图片地址');
    }
    return { urls, raw: res, taskId: taskId || undefined, sysLogId };
  }

  onAsyncStarted?.(String(taskId));
  const finalRes = await pollImageTaskById({
    taskId: String(taskId),
    tokenKey,
    model,
    signal,
  });
  const urls = extractImageDisplayUrls(finalRes);
  if (urls.length === 0) {
    throw new Error('任务完成但未返回图片地址');
  }
  return { urls, raw: finalRes, taskId: String(taskId), sysLogId };
}

/**
 * 按期望张数补齐结果。
 * Seedream 等上游在 sequential_image_generation=auto 时，max_images 仅为上限，
 * 模型可能只返回 1 张；不足时用剩余数量继续请求补齐。
 */
export async function generateImagesFillingCount(options: {
  model: PlaygroundModel;
  prompt: string;
  paramValues: Record<string, any>;
  tokenKey: string;
  count: number;
  signal?: AbortSignal;
  sysLogId?: string;
  onAsyncStarted?: (taskId: string) => void;
  referenceUrls?: string[];
}): Promise<GenerateImagesResult & { requested: number }> {
  const requested = Math.min(4, Math.max(1, Math.floor(Number(options.count) || 1)));
  if (options.paramValues?.layer_decomposition === true) {
    const result = await generateImagesWithModel({
      model: options.model,
      prompt: options.prompt,
      paramValues: { ...options.paramValues, n: 1 },
      tokenKey: options.tokenKey,
      signal: options.signal,
      sysLogId: options.sysLogId,
      onAsyncStarted: options.onAsyncStarted,
      referenceUrls: options.referenceUrls,
    });
    if (result.urls.length === 0) {
      throw new Error('生成成功但未返回图片地址');
    }
    return {
      urls: result.urls,
      raw: result.raw,
      taskId: result.taskId,
      sysLogId: result.sysLogId,
      requested: result.urls.length,
    };
  }
  const urls: string[] = [];
  let raw: any;
  let taskId: string | undefined;
  const primaryLogId = options.sysLogId || generateLogId();
  let attempts = 0;
  const maxAttempts = requested + 2;

  while (urls.length < requested && attempts < maxAttempts) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    attempts += 1;
    const need = requested - urls.length;
    const isFirst = attempts === 1;
    const result = await generateImagesWithModel({
      model: options.model,
      prompt: options.prompt,
      paramValues: { ...options.paramValues, n: need },
      tokenKey: options.tokenKey,
      signal: options.signal,
      sysLogId: isFirst ? primaryLogId : generateLogId(),
      onAsyncStarted: isFirst ? options.onAsyncStarted : undefined,
      referenceUrls: options.referenceUrls,
    });
    if (!result.urls.length) break;
    urls.push(...result.urls);
    raw = result.raw;
    if (result.taskId) taskId = result.taskId;
    // 上游若无视 n、始终只回 1 张，继续循环补齐
  }

  if (urls.length === 0) {
    throw new Error('生成成功但未返回图片地址');
  }
  return {
    urls: urls.slice(0, requested),
    raw,
    taskId,
    sysLogId: primaryLogId,
    requested,
  };
}

/** 按 task_id 轮询异步图片任务（生成页续跑 / 异地恢复共用） */
export async function pollImageTaskById(options: {
  taskId: string;
  tokenKey: string;
  model?: PlaygroundModel;
  pollUrl?: string;
  signal?: AbortSignal;
}): Promise<any> {
  const { taskId, tokenKey, model, signal } = options;
  const pollUrl = options.pollUrl || (model ? resolvePollEndpoint(model, taskId) : `/v1/tasks/${taskId}`);
  const maxAttempts = 180;
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
        res?.error?.message || res?.message || res?.error || '图片生成任务失败',
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

export function formatGenerationError(err: any): string {
  if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
    return '已取消';
  }
  return getErrorMessage(err);
}
