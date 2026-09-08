/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/** 创作中心2026 功能特性目录。用户端视频分类按模型绑定方案的 IO 启用口展示。 */

export type ModelFeatureKind = 'image' | 'video' | 'chat';

export type ModelFeature = {
  key: string;
  label: string;
  kind: ModelFeatureKind;
};

const MODEL_FEATURES: ModelFeature[] = [
  { key: 'create-image', label: '创建图片', kind: 'image' },
  { key: 'edit-image', label: '编辑图片', kind: 'image' },
  { key: 'upscale-image', label: '放大图片', kind: 'image' },
  { key: 'reference-i2v', label: '全能参考生视频', kind: 'video' },
  { key: 'text-to-video', label: '文生视频', kind: 'video' },
  { key: 'image-to-video', label: '图生视频', kind: 'video' },
  { key: 'starting-frame', label: '首尾帧生视频', kind: 'video' },
  { key: 'edit-video', label: '编辑视频', kind: 'video' },
  { key: 'extend', label: '延长视频', kind: 'video' },
];

export function featureKindFromTypeName(typeName?: string | null): ModelFeatureKind | null {
  const n = typeName || '';
  if (n.includes('图片')) return 'image';
  if (n.includes('聊天')) return 'chat';
  if (n.includes('视频')) return 'video';
  return null;
}

export function parseFeatureAttrList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const x of raw) {
      if (typeof x !== 'string') continue;
      const t = x.trim();
      if (!t || out.includes(t)) continue;
      out.push(t);
    }
    return out;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseFeatureAttrList(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function featureLabel(key: string): string {
  return MODEL_FEATURES.find((f) => f.key === key)?.label || key;
}

export const DEFAULT_VIDEO_FEATURE = 'reference-i2v';

export function videoFeatures(): ModelFeature[] {
  return MODEL_FEATURES.filter((f) => f.kind === 'video');
}

/** 用户端 public-config.feature_catalog.groups[].items */
export function videoFeaturesFromCatalog(catalog: unknown): ModelFeature[] {
  const fallback = videoFeatures();
  if (!catalog || typeof catalog !== 'object') return fallback;
  const groups = (catalog as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return fallback;
  const video = groups.find(
    (g) => g && typeof g === 'object' && (g as { kind?: string }).kind === 'video',
  );
  const items =
    video && typeof video === 'object' ? (video as { items?: unknown }).items : null;
  if (!Array.isArray(items) || items.length === 0) return fallback;
  const parsed: ModelFeature[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const key = (item as { key?: unknown }).key;
    if (typeof key !== 'string' || !key) continue;
    const label = (item as { label?: unknown }).label;
    parsed.push({
      key,
      label: typeof label === 'string' && label ? label : featureLabel(key),
      kind: 'video',
    });
  }
  return parsed.length ? parsed : fallback;
}

export function isVideoFeatureKey(key: string, features?: ModelFeature[]): boolean {
  const list = features && features.length ? features : videoFeatures();
  return list.some((f) => f.key === key);
}

/** 方案 IO 启用口 → 用户端视频功能分类 */
const VIDEO_MODE_FROM_IO: Array<{ key: string; ports: string[] }> = [
  {
    key: 'reference-i2v',
    ports: ['reference_images', 'reference_videos', 'reference_audio', 'reference_file'],
  },
  { key: 'text-to-video', ports: ['prompt'] },
  { key: 'image-to-video', ports: ['start_frame'] },
  { key: 'starting-frame', ports: ['end_frame'] },
  { key: 'edit-video', ports: ['reference_videos'] },
  { key: 'extend', ports: ['reference_videos'] },
];

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/** 把启用口归到目录 key，供功能分类判断（含 bind_key / 文案别名） */
function canonicalVideoIoKeys(port: Record<string, unknown>): string[] {
  if (port.enabled === false) return [];
  const k = strField(port.key);
  const bind = strField(port.bind_key);
  const label = strField(port.label);
  const modality = strField(port.modality);
  if (!k && !bind && !modality) return [];

  const keys: string[] = [];
  const isNegPrompt = k === 'negative_prompt' || bind === 'negative_prompt';
  const isStart =
    k === 'start_frame' ||
    k === 'first_frame' ||
    k.includes('start_frame') ||
    bind === 'image_url' ||
    bind === 'first_frame' ||
    label.includes('首帧') ||
    label.includes('起始帧');
  const isEnd =
    k === 'end_frame' ||
    k === 'last_frame' ||
    k.includes('end_frame') ||
    k.includes('last_frame') ||
    bind === 'end_image_url' ||
    bind === 'last_frame' ||
    label.includes('尾帧') ||
    label.includes('结束帧');
  const isRefImg =
    !isStart &&
    !isEnd &&
    (k === 'reference_images' || bind === 'image_urls' || bind === 'reference_urls');
  const isRefVid =
    k === 'reference_videos' ||
    k === 'source_video' ||
    bind === 'video_urls' ||
    (modality === 'video' && !isStart && !isEnd);
  const isRefAud = k === 'reference_audio' || bind === 'audio_urls' || modality === 'audio';
  const isOmniFile =
    k === 'reference_file' ||
    k === 'webpage_link' ||
    k === 'files' ||
    k === 'links' ||
    modality === 'file';
  const isPrompt = !isNegPrompt && (k === 'prompt' || bind === 'prompt' || modality === 'text');

  if (isPrompt) keys.push('prompt');
  if (isStart) keys.push('start_frame');
  if (isEnd) keys.push('end_frame');
  if (isRefImg) keys.push('reference_images');
  if (isRefVid) keys.push('reference_videos');
  if (isRefAud) keys.push('reference_audio');
  if (isOmniFile) keys.push('reference_file');
  if (k) keys.push(k);
  return keys;
}

function enabledSchemeInputKeys(scheme: { inputs?: unknown }): Set<string> {
  const out = new Set<string>();
  const inputs = Array.isArray(scheme.inputs) ? scheme.inputs : [];
  for (const p of inputs) {
    if (!p || typeof p !== 'object') continue;
    for (const key of canonicalVideoIoKeys(p as Record<string, unknown>)) {
      out.add(key);
    }
  }
  return out;
}

/** 视频方案当前 IO 实际支持的生成方式（仅已启用口） */
export function videoGenerationModesFromScheme(scheme: {
  type?: string;
  inputs?: unknown;
}): ModelFeature[] {
  if (scheme?.type && scheme.type !== 'video') return [];
  const enabled = enabledSchemeInputKeys(scheme);
  if (enabled.size === 0) return [];
  return VIDEO_MODE_FROM_IO.filter((row) => row.ports.some((k) => enabled.has(k)))
    .map((row) => MODEL_FEATURES.find((f) => f.key === row.key))
    .filter((f): f is ModelFeature => !!f);
}

/** 用户端模型：按绑定方案（含 IO 覆写）的启用口推导功能分类 */
export function videoFeatureKeysFromModel(m: { inputs?: unknown } | null | undefined): string[] {
  if (!m) return [];
  return videoGenerationModesFromScheme({ type: 'video', inputs: m.inputs }).map((f) => f.key);
}

function modelSupportsVideoFeature(m: { inputs?: unknown }, key: string): boolean {
  return videoFeatureKeysFromModel(m).includes(key);
}

export function modelsForFeature<T extends { inputs?: unknown }>(models: T[], key: string): T[] {
  return models.filter((m) => modelSupportsVideoFeature(m, key));
}

export function pickVideoFeatureForModel(
  m: { inputs?: unknown },
  preferred?: string,
): string {
  const keys = videoFeatureKeysFromModel(m);
  if (preferred && keys.includes(preferred)) return preferred;
  if (keys.includes(DEFAULT_VIDEO_FEATURE)) return DEFAULT_VIDEO_FEATURE;
  return keys[0] || DEFAULT_VIDEO_FEATURE;
}
