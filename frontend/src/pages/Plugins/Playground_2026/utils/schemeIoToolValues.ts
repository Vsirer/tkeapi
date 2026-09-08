/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 独立工具页（图片/视频生成）：方案 IO 入参值与提交体组装
 * 与工作流 AiImage/AiVideo 的 bind_key 约定对齐
 */
import type { PlaygroundModel, SchemeAssetKind, SchemePort } from '../types';
import { enabledPorts, resolveModelIo, schemePortMax } from './schemeIo';

/** 工具页 IO 状态：文本为 string，媒体口为 url 列表 */
export type SchemeIoToolValues = Record<string, string | string[]>;

const IO_VALUES_STORAGE_KEY = '_io_values';

export function getToolInputPorts(model: PlaygroundModel | null | undefined): SchemePort[] {
  if (!model) return [];
  const kind =
    /video|视/.test(`${model.scheme_type || ''} ${model.type_name || ''}`) ? 'video' : 'image';
  const ports = resolveModelIo(model, kind).inputs;
  if (
    model.scheme_id === 'openai_video' ||
    model.scheme_id === 'seedance2.0' ||
    model.scheme_id === 'seedance2' ||
    model.scheme_id === 'wan3.0' ||
    model.scheme_id === 'dashscope_video'
  ) {
    return ports.filter((p) => p.key !== 'negative_prompt' && p.bind_key !== 'negative_prompt');
  }
  return ports;
}

function isStartFramePort(port: SchemePort): boolean {
  const k = (port.key || '').toLowerCase();
  const label = (port.label || '').toLowerCase();
  return (
    k === 'start_frame' ||
    k.includes('start_frame') ||
    label.includes('首帧') ||
    label.includes('起始帧') ||
    /start frame/i.test(label)
  );
}

function isEndFramePort(port: SchemePort): boolean {
  const k = (port.key || '').toLowerCase();
  const label = (port.label || '').toLowerCase();
  return (
    k === 'end_frame' ||
    k === 'last_frame' ||
    k.includes('end_frame') ||
    k.includes('last_frame') ||
    label.includes('尾帧') ||
    label.includes('结束帧') ||
    /last frame|end frame/i.test(label)
  );
}

function enableFramePort(port: SchemePort, required: boolean): SchemePort {
  return {
    ...port,
    enabled: true,
    required,
    max: port.max && port.max > 0 ? port.max : 1,
    accept_asset_kinds: port.accept_asset_kinds?.length
      ? port.accept_asset_kinds
      : (['image'] as SchemeAssetKind[]),
  };
}

/** 图生视频（首帧）：只用方案已有的首帧口 */
export function ensureFirstFramePorts(ports: SchemePort[]): SchemePort[] {
  const out = ports
    .filter((p) => p.modality === 'text' || isStartFramePort(p))
    .map((p): SchemePort => (isStartFramePort(p) ? enableFramePort(p, true) : { ...p }));
  const rank = (p: SchemePort) => {
    if (p.modality === 'text') return 0;
    if (isStartFramePort(p)) return 1;
    return 2;
  };
  return out.slice().sort((a, b) => rank(a) - rank(b));
}

/** 首尾帧：只用方案已启用的首/尾帧口，不补目录里没有的口 */
function ensureStartEndFramePorts(ports: SchemePort[]): SchemePort[] {
  const out = ports
    .filter((p) => p.modality === 'text' || isStartFramePort(p) || isEndFramePort(p))
    .map((p): SchemePort => {
      if (isStartFramePort(p)) return enableFramePort(p, true);
      if (isEndFramePort(p)) return enableFramePort(p, !!p.required);
      return { ...p };
    });
  const rank = (p: SchemePort) => {
    if (p.modality === 'text') return 0;
    if (isStartFramePort(p)) return 1;
    if (isEndFramePort(p)) return 2;
    return 3;
  };
  return out.slice().sort((a, b) => rank(a) - rank(b));
}

/** 全能参考：参考口；与首尾帧同时存在时保留全部以便切换 */
export function ensureOmniOrFramePorts(
  ports: SchemePort[],
  dualTab: boolean,
  mode: 'starting-frame' | 'reference-i2v' = 'starting-frame',
): SchemePort[] {
  if (dualTab) {
    return ports.map((p) => ({ ...p, enabled: p.enabled !== false }));
  }
  if (mode === 'starting-frame') {
    return ensureStartEndFramePorts(ports);
  }
  return ports.filter(
    (p) => p.modality === 'text' || (!isStartFramePort(p) && !isEndFramePort(p)),
  );
}

function isVideoMediaPort(port: SchemePort): boolean {
  const k = (port.key || '').toLowerCase();
  return (
    port.modality === 'video' ||
    k === 'source_video' ||
    k === 'reference_videos' ||
    (k.includes('video') && !k.includes('image'))
  );
}

/** 延长视频：方案已有的参考视频口 */
export function ensureExtendVideoPorts(ports: SchemePort[]): SchemePort[] {
  const text = ports.filter((p) => p.modality === 'text');
  const refVideo = ports.find((p) => (p.key || '').toLowerCase() === 'reference_videos');
  if (refVideo) {
    return [
      ...text,
      {
        ...refVideo,
        enabled: true,
        modality: 'video' as const,
        accept_asset_kinds: ['video'] as SchemeAssetKind[],
      },
    ];
  }
  const videos = ports
    .filter((p) => p.modality !== 'text' && isVideoMediaPort(p))
    .map((p) => ({
      ...p,
      enabled: true,
      modality: 'video' as const,
      accept_asset_kinds: ['video'] as SchemeAssetKind[],
    }));
  return [...text, ...videos];
}

/** 编辑视频：方案已有的参考视频 + 可选参考图 */
export function ensureEditVideoPorts(ports: SchemePort[]): SchemePort[] {
  const text = ports
    .filter((p) => p.modality === 'text')
    .map((p) => ({ ...p, enabled: true }));
  const video = ports.find((p) => (p.key || '').toLowerCase() === 'reference_videos');
  const refs = ports
    .filter(
      (p) =>
        (p.key === 'reference_images' || p.bind_key === 'image_urls') &&
        !isStartFramePort(p) &&
        !isEndFramePort(p),
    )
    .map((p) => ({ ...p, enabled: true }));
  const out = [...text];
  if (video) {
    out.push({
      ...video,
      enabled: true,
      modality: 'video',
      accept_asset_kinds: ['video'] as SchemeAssetKind[],
    });
  }
  out.push(...refs);
  return out;
}

export function getTextInputPorts(ports: SchemePort[]): SchemePort[] {
  return ports.filter((p) => p.modality === 'text');
}

export function getMediaInputPorts(ports: SchemePort[]): SchemePort[] {
  return ports.filter((p) => p.modality !== 'text');
}

export function portAcceptKinds(port: SchemePort): SchemeAssetKind[] {
  if (Array.isArray(port.accept_asset_kinds) && port.accept_asset_kinds.length) {
    return port.accept_asset_kinds;
  }
  if (port.modality === 'image') return ['image'];
  if (port.modality === 'video') return ['video'];
  if (port.modality === 'audio') return ['audio'];
  if (port.modality === 'file') return ['image', 'video', 'audio', 'document'];
  return [];
}

export function portMaxFiles(port: SchemePort): number {
  return schemePortMax(port, 1);
}

export function getPortUrls(values: SchemeIoToolValues, portKey: string): string[] {
  const raw = values[portKey];
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string' && !!u.trim());
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

export function getPromptFromIoValues(
  values: SchemeIoToolValues,
  ports: SchemePort[],
): string {
  const promptPort =
    ports.find((p) => p.key === 'prompt' || p.bind_key === 'prompt') ||
    ports.find((p) => p.modality === 'text');
  if (promptPort) {
    const v = values[promptPort.key];
    return typeof v === 'string' ? v : '';
  }
  const fallback = values.prompt;
  return typeof fallback === 'string' ? fallback : '';
}

export function setPromptInIoValues(
  values: SchemeIoToolValues,
  ports: SchemePort[],
  prompt: string,
): SchemeIoToolValues {
  const promptPort =
    ports.find((p) => p.key === 'prompt' || p.bind_key === 'prompt') ||
    ports.find((p) => p.modality === 'text');
  const key = promptPort?.key || 'prompt';
  return { ...values, [key]: prompt };
}

/** 换模：同 key 保留；新模型没有的口移入 stash */
export function migrateIoValuesOnModelChange(
  prev: SchemeIoToolValues,
  nextPorts: SchemePort[],
  stash: SchemeIoToolValues,
): { values: SchemeIoToolValues; stash: SchemeIoToolValues } {
  const nextKeys = new Set(nextPorts.map((p) => p.key));
  // 若方案未声明 prompt 口，工具页仍保留提示词
  if (![...nextKeys].some((k) => k === 'prompt')) {
    nextKeys.add('prompt');
  }
  const values: SchemeIoToolValues = {};
  const nextStash: SchemeIoToolValues = { ...stash };

  for (const port of nextPorts) {
    if (prev[port.key] !== undefined) {
      values[port.key] = prev[port.key];
      delete nextStash[port.key];
    } else if (nextStash[port.key] !== undefined) {
      values[port.key] = nextStash[port.key];
      delete nextStash[port.key];
    } else if (port.modality === 'text') {
      values[port.key] = '';
    } else {
      values[port.key] = [];
    }
  }

  if (values.prompt === undefined) {
    if (typeof prev.prompt === 'string') values.prompt = prev.prompt;
    else if (typeof nextStash.prompt === 'string') {
      values.prompt = nextStash.prompt;
      delete nextStash.prompt;
    } else values.prompt = '';
  }

  for (const [key, val] of Object.entries(prev)) {
    if (nextKeys.has(key)) continue;
    if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) continue;
    nextStash[key] = val;
  }

  return { values, stash: nextStash };
}

export function emptyIoValuesForPorts(ports: SchemePort[]): SchemeIoToolValues {
  const out: SchemeIoToolValues = { prompt: '' };
  for (const port of ports) {
    out[port.key] = port.modality === 'text' ? '' : [];
  }
  return out;
}

/** 收集所有媒体 url（上传前解析 blob 用） */
export function collectAllMediaUrls(values: SchemeIoToolValues, ports: SchemePort[]): string[] {
  const urls: string[] = [];
  for (const port of getMediaInputPorts(ports)) {
    urls.push(...getPortUrls(values, port.key));
  }
  return Array.from(new Set(urls));
}

/** 将 remap 后的 url 写回各媒体口 */
export function remapIoMediaUrls(
  values: SchemeIoToolValues,
  ports: SchemePort[],
  urlMap: Map<string, string>,
): SchemeIoToolValues {
  if (!urlMap.size) return values;
  const next = { ...values };
  for (const port of getMediaInputPorts(ports)) {
    const urls = getPortUrls(values, port.key);
    if (!urls.length) continue;
    next[port.key] = urls.map((u) => urlMap.get(u) || u);
  }
  return next;
}

/**
 * 将 IO 写出的 image_url / end_image_url / *_urls 归一成上游常用的 images/videos/audios。
 * 首尾帧带 role；纯参考图显式 reference_image，避免 1–2 张被推断为首尾帧。
 */
export function normalizeVideoMediaBody(body: Record<string, any>): void {
  const start =
    typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : '';
  const end =
    typeof body.end_image_url === 'string' && body.end_image_url.trim()
      ? body.end_image_url.trim()
      : '';

  if (start || end) {
    const images: Array<{ url: string; role: string }> = [];
    if (start) images.push({ url: start, role: 'first_frame' });
    if (end) images.push({ url: end, role: 'last_frame' });
    body.images = images;
  } else if (!body.images) {
    const fromUrls = body.image_urls;
    if (Array.isArray(fromUrls) && fromUrls.length) {
      body.images = fromUrls.map((item: unknown) => {
        if (typeof item === 'string') {
          return { url: item, role: 'reference_image' };
        }
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const url =
            (typeof obj.url === 'string' && obj.url) ||
            (typeof obj.image_url === 'string' && obj.image_url) ||
            '';
          if (!url) return item;
          return {
            ...obj,
            url,
            role: typeof obj.role === 'string' && obj.role ? obj.role : 'reference_image',
          };
        }
        return item;
      });
    } else if (typeof body.image_url === 'string' && body.image_url) {
      body.images = [{ url: body.image_url, role: 'first_frame' }];
    }
  }

  if (!body.videos) {
    if (Array.isArray(body.video_urls) && body.video_urls.length) {
      body.videos = body.video_urls;
    } else if (typeof body.video_url === 'string' && body.video_url.trim()) {
      body.videos = [{ url: body.video_url.trim(), role: 'reference_video' }];
    }
  }
  if (!body.audios && Array.isArray(body.audio_urls) && body.audio_urls.length) {
    body.audios = body.audio_urls;
  }
}

/**
 * 按口 bind_key 写入 API body（对齐工作流节点）
 * 单值口写 string，数组口 / max>1 / expandable 写 string[]
 */
export function applyIoValuesToRequestBody(
  body: Record<string, any>,
  values: SchemeIoToolValues,
  ports: SchemePort[],
): void {
  const ARRAY_BIND_KEYS = new Set([
    'image_urls',
    'video_urls',
    'audio_urls',
    'reference_urls',
    'images',
    'videos',
    'audios',
    'files',
    'links',
  ]);

  for (const port of enabledPorts(ports)) {
    const bindKey = (port.bind_key || port.key || '').trim();
    if (!bindKey) continue;

    if (port.modality === 'text') {
      const text = typeof values[port.key] === 'string' ? (values[port.key] as string).trim() : '';
      if (text) body[bindKey] = text;
      continue;
    }

    const urls = getPortUrls(values, port.key);
    if (!urls.length) continue;
    const max = portMaxFiles(port);
    const sliced = urls.slice(0, max);
    if (ARRAY_BIND_KEYS.has(bindKey) || max > 1 || port.expandable) {
      body[bindKey] = sliced;
    } else {
      body[bindKey] = sliced[0];
    }
  }

  normalizeVideoMediaBody(body);

  if (!body.prompt) {
    const prompt = getPromptFromIoValues(values, ports).trim();
    if (prompt) body.prompt = prompt;
  }
}

export function extractIoValuesFromStored(
  stored: Record<string, any> | undefined | null,
): SchemeIoToolValues | null {
  if (!stored || typeof stored !== 'object') return null;
  const raw = stored[IO_VALUES_STORAGE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const out: SchemeIoToolValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((u) => typeof u === 'string' && !!u);
  }
  return out;
}
