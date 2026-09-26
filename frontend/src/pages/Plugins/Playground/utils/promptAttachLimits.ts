/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 提示词附件：按当前模型 IO 限制参考图 / 参考视频 / 参考音频数量
 */

export type AttachKind = 'image' | 'video' | 'audio';

export type AttachCounts = Record<AttachKind, number>;

type IoPort = {
  key?: string;
  enabled?: boolean;
  modality?: string;
  bind_key?: string;
  max?: number;
};

type IoModel = {
  inputs?: IoPort[] | null;
  max_reference_images?: number | null;
} | null | undefined;

type AttachLike = {
  asset?: { asset_type?: string; file_name?: string };
  file?: File;
};

const ZERO: AttachCounts = { image: 0, video: 0, audio: 0 };

function enabledPorts(inputs: IoPort[] | null | undefined): IoPort[] {
  return (inputs || []).filter((p) => p && p.enabled !== false);
}

function portMax(port: IoPort | undefined, fallback: number): number {
  const n = Number(port?.max);
  if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  return fallback;
}

export function classifyAttachKind(item: AttachLike | File | string | null | undefined): AttachKind {
  if (!item) return 'image';
  if (item instanceof File) {
    const name = item.name || '';
    const mime = (item.type || '').toLowerCase();
    if (mime.startsWith('video') || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(name)) return 'video';
    if (mime.startsWith('audio') || /\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(name)) return 'audio';
    return 'image';
  }
  if (typeof item === 'string') {
    const path = item.split('?')[0].toLowerCase();
    if (/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(path) || path.includes('/video')) return 'video';
    if (/\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(path) || path.includes('/audio')) return 'audio';
    return 'image';
  }
  const type = String(item.asset?.asset_type || '').toLowerCase();
  const name = String(item.asset?.file_name || item.file?.name || '');
  if (type === 'video' || type.startsWith('video') || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(name)) return 'video';
  if (type === 'audio' || type.startsWith('audio') || /\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(name)) return 'audio';
  if (item.file) return classifyAttachKind(item.file);
  return 'image';
}

function resolvePromptAttachMax(model: IoModel, kind: AttachKind): number {
  if (!model) return 0;
  const inputs = model?.inputs || [];
  const enabled = enabledPorts(inputs);
  if (kind === 'image') {
    const port = enabled.find(
      (p) =>
        p.key === 'reference_images' ||
        p.bind_key === 'image_urls' ||
        p.bind_key === 'reference_urls',
    );
    if (port) return portMax(port, 7);
    const frames = enabled.filter((p) => p.key === 'start_frame' || p.key === 'end_frame');
    if (frames.length) return frames.reduce((sum, p) => sum + portMax(p, 1), 0);
    const legacy = Number(model?.max_reference_images);
    if (Number.isFinite(legacy) && legacy >= 0) return Math.trunc(legacy);
    if (inputs.length > 0) return 0;
    return 7;
  }
  const key = kind === 'video' ? 'reference_videos' : 'reference_audio';
  const bind = kind === 'video' ? 'video_urls' : 'audio_urls';
  const port = enabled.find((p) => p.key === key || p.bind_key === bind);
  if (port) return portMax(port, 3);
  return 0;
}

export function resolvePromptAttachMaxAll(model: IoModel): AttachCounts {
  if (!model) return { ...ZERO };
  return {
    image: resolvePromptAttachMax(model, 'image'),
    video: resolvePromptAttachMax(model, 'video'),
    audio: resolvePromptAttachMax(model, 'audio'),
  };
}

function countAttachByKind(assets: AttachLike[] | null | undefined): AttachCounts {
  const counts: AttachCounts = { ...ZERO };
  for (const a of assets || []) counts[classifyAttachKind(a)] += 1;
  return counts;
}

export function remainingAttachRoom(assets: AttachLike[] | null | undefined, max: AttachCounts): AttachCounts {
  const cur = countAttachByKind(assets);
  return {
    image: Math.max(0, max.image - cur.image),
    video: Math.max(0, max.video - cur.video),
    audio: Math.max(0, max.audio - cur.audio),
  };
}

export function pickWithinAttachLimits<T>(
  existing: AttachLike[],
  incoming: T[],
  max: AttachCounts,
  classify: (item: T) => AttachKind,
): { accepted: T[]; skipped: AttachCounts } {
  const room = remainingAttachRoom(existing, max);
  const accepted: T[] = [];
  const skipped: AttachCounts = { ...ZERO };
  for (const item of incoming) {
    const kind = classify(item);
    if (room[kind] > 0) {
      accepted.push(item);
      room[kind] -= 1;
    } else {
      skipped[kind] += 1;
    }
  }
  return { accepted, skipped };
}

export function clampAttachedAssets<T extends AttachLike>(assets: T[], max: AttachCounts): T[] {
  const room = { ...max };
  const next: T[] = [];
  for (const a of assets || []) {
    const kind = classifyAttachKind(a);
    if (room[kind] > 0) {
      next.push(a);
      room[kind] -= 1;
    }
  }
  return next;
}

export function skippedAttachMessage(skipped: AttachCounts, max: AttachCounts): string | null {
  const parts: string[] = [];
  if (skipped.image) {
    parts.push(max.image <= 0 ? '当前模型未开启参考图' : `参考图最多 ${max.image} 张`);
  }
  if (skipped.video) {
    parts.push(max.video <= 0 ? '当前模型未开启参考视频' : `参考视频最多 ${max.video} 个`);
  }
  if (skipped.audio) {
    parts.push(max.audio <= 0 ? '当前模型未开启参考音频' : `参考音频最多 ${max.audio} 个`);
  }
  if (!parts.length) return null;
  return `部分未加入：${parts.join('，')}`;
}

export function attachAcceptAttr(max: AttachCounts): string {
  const parts: string[] = [];
  if (max.image > 0) parts.push('image/*');
  if (max.video > 0) parts.push('video/*');
  if (max.audio > 0) parts.push('audio/*');
  return parts.join(',');
}

export function attachAddTooltip(max: AttachCounts, room: AttachCounts, hasModel = true): string {
  if (!hasModel) {
    return '请先在右侧面板选择一个模型';
  }
  const parts: string[] = [];
  if (max.image > 0) {
    parts.push(`图 ${max.image - room.image}/${max.image}`);
  }
  if (max.video > 0) {
    parts.push(`视频 ${max.video - room.video}/${max.video}`);
  }
  if (max.audio > 0) {
    parts.push(`音频 ${max.audio - room.audio}/${max.audio}`);
  }
  if (parts.length === 0) {
    return '当前模型不支持添加参考内容';
  }
  return `添加参考  ${parts.join(' · ')}`;
}
