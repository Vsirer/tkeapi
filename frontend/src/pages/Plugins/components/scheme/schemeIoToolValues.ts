/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 独立工具页（图片/视频生成）：方案 IO 入参值与提交体组装
 * 与工作流 AiImage/AiVideo 的 bind_key 约定对齐
 */
import type { PlaygroundModel, SchemeAssetKind, SchemePort } from './types';
import { enabledPorts, isFeatureTogglePort, resolveModelIo, schemePortMax } from './schemeIo';

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
    model.scheme_id === 'dashscope_video' ||
    model.scheme_id === 'minimax-h3'
  ) {
    return ports.filter((p) => p.key !== 'negative_prompt' && p.bind_key !== 'negative_prompt');
  }
  return ports;
}

export function isStartFramePort(port: SchemePort): boolean {
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

export function isEndFramePort(port: SchemePort): boolean {
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

export function isFramePort(port: SchemePort): boolean {
  return isStartFramePort(port) || isEndFramePort(port);
}

function isEditVideoPort(port: SchemePort): boolean {
  return (port.key || '').toLowerCase() === 'edit_video';
}

function isExtendVideoPort(port: SchemePort): boolean {
  return (port.key || '').toLowerCase() === 'extend_video';
}

function isMediaEditVideoPort(port: SchemePort): boolean {
  return isEditVideoPort(port) && !isFeatureTogglePort(port);
}

function isMediaExtendVideoPort(port: SchemePort): boolean {
  return isExtendVideoPort(port) && !isFeatureTogglePort(port);
}

function omniPortsForEditOrExtend(ports: SchemePort[], requireVideo: boolean): SchemePort[] {
  const text = ports
    .filter((p) => p.modality === 'text')
    .map((p) => ({ ...p, enabled: true }));
  const refs = ports
    .filter((p) => (p.key || '') === 'reference_images' || (p.key || '') === 'reference_videos' || (p.key || '') === 'reference_audio')
    .map((p) => {
      if (requireVideo && (p.key || '') === 'reference_videos') {
        return { ...p, enabled: true, required: true };
      }
      return { ...p, enabled: true };
    });
  return [...text, ...refs];
}

export function isReferencePort(port: SchemePort): boolean {
  if (isFramePort(port) || isEditVideoPort(port) || isExtendVideoPort(port)) return false;
  const k = (port.key || '').toLowerCase();
  return (
    k.startsWith('reference') ||
    k === 'source_video' ||
    port.modality === 'image' ||
    port.modality === 'video' ||
    port.modality === 'audio' ||
    port.modality === 'file'
  );
}

export type SchemeIoMediaTab = 'frames' | 'references';

function putUrlOnPort(
  values: SchemeIoToolValues,
  port: SchemePort,
  url: string,
  replaceIfFull: boolean,
): SchemeIoToolValues | null {
  const max = Math.max(1, portMaxFiles(port));
  const prev = getPortUrls(values, port.key).filter((u) => u !== url);
  if (prev.length >= max && !replaceIfFull) return null;
  const next = prev.length >= max ? [...prev.slice(0, max - 1), url] : [...prev, url];
  return { ...values, [port.key]: next };
}

function putUrlOnMatchingPorts(
  values: SchemeIoToolValues,
  ports: SchemePort[],
  url: string,
): SchemeIoToolValues | null {
  if (!ports.length) return null;
  for (const port of ports) {
    const placed = putUrlOnPort(values, port, url, false);
    if (placed) return placed;
  }
  return putUrlOnPort(values, ports[ports.length - 1], url, true);
}

/** 右侧素材「添加参考图片」：按左栏当前面板落到参考口或首/尾帧 */
function placeGalleryImageOnVideoIo(
  url: string,
  ports: SchemePort[],
  values: SchemeIoToolValues,
  mediaTab: SchemeIoMediaTab,
): SchemeIoToolValues | null {
  if (!url) return null;
  const mediaPorts = getMediaInputPorts(ports);
  const framePorts = mediaPorts.filter(isFramePort);
  const imageRefPorts = mediaPorts.filter(
    (p) => isReferencePort(p) && portAcceptKinds(p).includes('image'),
  );
  const useFrames =
    (mediaTab === 'frames' && framePorts.length > 0) ||
    (imageRefPorts.length === 0 && framePorts.length > 0);
  if (useFrames) {
    const start = framePorts.find(isStartFramePort);
    const end = framePorts.find(isEndFramePort);
    const startHas = start ? getPortUrls(values, start.key).length > 0 : false;
    const target = startHas && end ? end : start || end;
    if (!target) return null;
    return putUrlOnPort(values, target, url, true);
  }
  const targetPorts = imageRefPorts.length
    ? imageRefPorts
    : mediaPorts.filter((p) => portAcceptKinds(p).includes('image'));
  return putUrlOnMatchingPorts(values, targetPorts, url);
}

/** 按左侧功能裁剪口（dualTab=false 时不含首尾帧与全能参考并集） */
export function applyVideoFeaturePortFilter(
  ports: SchemePort[],
  mode: string,
  dualTab = false,
): SchemePort[] {
  if (mode === 'text-to-video') {
    return ports.filter((p) => p.modality === 'text' || p.key === 'prompt');
  }
  if (mode === 'image-to-video') {
    return ensureFirstFramePorts(ports);
  }
  if (mode === 'starting-frame' || mode === 'reference-i2v') {
    return ensureOmniOrFramePorts(
      ports,
      dualTab,
      mode === 'reference-i2v' ? 'reference-i2v' : 'starting-frame',
    );
  }
  if (mode === 'extend') {
    return ensureExtendVideoPorts(ports);
  }
  if (mode === 'edit-video') {
    return ensureEditVideoPorts(ports);
  }
  return ports;
}

export function videoFeatureAcceptKinds(mode: string, ports: SchemePort[]): SchemeAssetKind[] {
  const scoped = applyVideoFeaturePortFilter(ports, mode, false);
  const kinds = new Set<SchemeAssetKind>();
  for (const p of getMediaInputPorts(scoped)) {
    for (const k of portAcceptKinds(p)) kinds.add(k);
  }
  return [...kinds];
}

function portsAcceptingKind(ports: SchemePort[], kind: SchemeAssetKind): SchemePort[] {
  return getMediaInputPorts(ports).filter(
    (p) => !isFramePort(p) && portAcceptKinds(p).includes(kind),
  );
}

/**
 * 右侧素材加入参考：必须匹配左侧当前功能实际支持的类型。
 * 图生视频 / 首尾帧只收图片；延长视频只收视频；禁止把视频落到图片口。
 */
export function placeGalleryMediaOnVideoIo(
  url: string,
  kind: SchemeAssetKind,
  ports: SchemePort[],
  values: SchemeIoToolValues,
  mediaTab: SchemeIoMediaTab,
  featureKey?: string,
): SchemeIoToolValues | null {
  if (!url) return null;
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') return null;
  if (featureKey) {
    const allowed = videoFeatureAcceptKinds(featureKey, ports);
    if (!allowed.includes(kind)) return null;
  }
  if (kind === 'image') {
    return placeGalleryImageOnVideoIo(url, ports, values, mediaTab);
  }
  return putUrlOnMatchingPorts(values, portsAcceptingKind(ports, kind), url);
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
function ensureFirstFramePorts(ports: SchemePort[]): SchemePort[] {
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
      if (isEndFramePort(p)) return enableFramePort(p, true);
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
function ensureOmniOrFramePorts(
  ports: SchemePort[],
  dualTab: boolean,
  mode: 'starting-frame' | 'reference-i2v' = 'starting-frame',
): SchemePort[] {
  if (dualTab) {
    return ports
      .filter((p) => !isEditVideoPort(p) && !isExtendVideoPort(p))
      .map((p) => ({ ...p, enabled: p.enabled !== false }));
  }
  if (mode === 'starting-frame') {
    return ensureStartEndFramePorts(ports);
  }
  return ports.filter(
    (p) =>
      p.modality === 'text' ||
      (!isStartFramePort(p) && !isEndFramePort(p) && !isEditVideoPort(p) && !isExtendVideoPort(p)),
  );
}

function isVideoMediaPort(port: SchemePort): boolean {
  const k = (port.key || '').toLowerCase();
  return (
    port.modality === 'video' ||
    k === 'source_video' ||
    k === 'reference_videos' ||
    k === 'edit_video' ||
    k === 'extend_video' ||
    (k.includes('video') && !k.includes('image'))
  );
}

function findSingleSourceVideoPort(ports: SchemePort[], key: string): SchemePort | undefined {
  const wanted = key.toLowerCase();
  return ports.find((p) => (p.key || '').toLowerCase() === wanted);
}

function enableSingleSourceVideoPort(port: SchemePort): SchemePort {
  return {
    ...port,
    enabled: true,
    modality: 'video',
    accept_asset_kinds: ['video'] as SchemeAssetKind[],
    required: true,
    max: port.max && port.max > 0 ? Math.min(port.max, 1) : 1,
    expandable: false,
  };
}

/** 延长视频：独立媒体口（万相）或全能参考（Seedance） */
function ensureExtendVideoPorts(ports: SchemePort[]): SchemePort[] {
  const dedicated = findSingleSourceVideoPort(ports, 'extend_video');
  if (dedicated && isMediaExtendVideoPort(dedicated)) {
    const text = ports.filter((p) => p.modality === 'text');
    return [...text, enableSingleSourceVideoPort(dedicated)];
  }
  return omniPortsForEditOrExtend(ports, true);
}

/** 编辑视频：无独立媒体口时复用全能参考（可附带参考图/音频） */
function ensureEditVideoPorts(ports: SchemePort[]): SchemePort[] {
  const dedicated = findSingleSourceVideoPort(ports, 'edit_video');
  if (dedicated && isMediaEditVideoPort(dedicated)) {
    const text = ports
      .filter((p) => p.modality === 'text')
      .map((p) => ({ ...p, enabled: true }));
    const refs = ports
      .filter(
        (p) =>
          (p.key === 'reference_images' || p.bind_key === 'image_urls') &&
          !isStartFramePort(p) &&
          !isEndFramePort(p),
      )
      .map((p) => ({ ...p, enabled: true }));
    return [...text, enableSingleSourceVideoPort(dedicated), ...refs];
  }
  return omniPortsForEditOrExtend(ports, true);
}

export function getTextInputPorts(ports: SchemePort[]): SchemePort[] {
  return ports.filter((p) => p.modality === 'text');
}

export function getMediaInputPorts(ports: SchemePort[]): SchemePort[] {
  return ports.filter((p) => p.modality !== 'text' && !isFeatureTogglePort(p));
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

function asRoleMedia(item: unknown, role: string): unknown {
  if (typeof item === 'string' && item.trim()) {
    return { url: item.trim(), role };
  }
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const url =
      (typeof obj.url === 'string' && obj.url) ||
      (typeof obj.video_url === 'string' && obj.video_url) ||
      (typeof obj.audio_url === 'string' && obj.audio_url) ||
      (typeof obj.image_url === 'string' && obj.image_url) ||
      '';
    if (!url) return item;
    return {
      ...obj,
      url,
      role: typeof obj.role === 'string' && obj.role ? obj.role : role,
    };
  }
  return item;
}

function wrapMediaRole(list: unknown[], role: string): unknown[] {
  return list.map((item) => asRoleMedia(item, role));
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
      body.images = fromUrls.map((item: unknown) => asRoleMedia(item, 'reference_image'));
    } else if (typeof body.image_url === 'string' && body.image_url) {
      body.images = [{ url: body.image_url, role: 'first_frame' }];
    }
  }

  if (!body.videos) {
    const extras: string[] = [];
    const pushUrl = (v: unknown) => {
      if (typeof v === 'string' && v.trim()) extras.push(v.trim());
    };
    pushUrl(body.edit_video_url);
    pushUrl(body.extend_video_url);
    if (Array.isArray(body.video_urls) && body.video_urls.length) {
      body.videos = extras.length ? [...body.video_urls, ...extras] : body.video_urls;
    } else if (typeof body.video_url === 'string' && body.video_url.trim()) {
      body.videos = extras.length
        ? [body.video_url.trim(), ...extras]
        : [body.video_url.trim()];
    } else if (extras.length) {
      body.video_urls = extras;
      body.videos = extras;
    }
  }
  delete body.edit_video_url;
  delete body.extend_video_url;
  if (!body.audios && Array.isArray(body.audio_urls) && body.audio_urls.length) {
    body.audios = body.audio_urls;
  }
  if (Array.isArray(body.videos)) {
    body.videos = wrapMediaRole(body.videos, 'reference_video');
  }
  if (Array.isArray(body.audios)) {
    body.audios = wrapMediaRole(body.audios, 'reference_audio');
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
