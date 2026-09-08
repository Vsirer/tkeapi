/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 画布生成节点：按方案口保存/限制手动参考图、参考视频、参考音频
 */
import type { SchemeAssetKind, SchemePort } from '../types';
import { isReferenceMediaPort, resolveReferencePortMax } from './schemeIo';
import { portAcceptKinds } from './schemeIoToolValues';

function isImageRefPort(port: SchemePort): boolean {
  return (
    port.key === 'reference_images' ||
    port.bind_key === 'image_urls' ||
    port.bind_key === 'reference_urls'
  );
}

function getManualUrlsForPort(taskData: any, port: SchemePort): string[] {
  const map = taskData?.io_media_urls;
  if (map && Object.prototype.hasOwnProperty.call(map, port.key) && Array.isArray(map[port.key])) {
    return (map[port.key] as string[]).filter((u) => typeof u === 'string' && !!u);
  }
  if (isImageRefPort(port) && Array.isArray(taskData?.reference_urls)) {
    return (taskData.reference_urls as string[]).filter((u) => typeof u === 'string' && !!u);
  }
  return [];
}

export function mergePortUrlsWithManual(
  port: SchemePort,
  connected: string[],
  taskData: any,
): string[] {
  const max = resolveReferencePortMax(port);
  if (max <= 0) return [];
  const manuals = getManualUrlsForPort(taskData, port);
  return Array.from(new Set([...connected, ...manuals])).slice(0, max);
}

function guessPickKind(url: string, hint?: string): SchemeAssetKind {
  const h = (hint || '').toLowerCase();
  if (h === 'image' || h === 'video' || h === 'audio' || h === 'document') return h;
  const path = url.split('?')[0].toLowerCase();
  if (/\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(path) || path.includes('/video')) return 'video';
  if (/\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(path) || path.includes('/audio')) return 'audio';
  return 'image';
}

export function remapManualMediaInTaskData(
  taskData: any,
  urlMap: Map<string, string>,
): any {
  if (!taskData || urlMap.size === 0) return taskData;
  let changed = false;
  const next = { ...taskData };

  if (Array.isArray(next.reference_urls)) {
    const mapped = (next.reference_urls as string[]).map((u) => urlMap.get(u) || u);
    if (mapped.some((u, i) => u !== next.reference_urls[i])) {
      next.reference_urls = mapped;
      changed = true;
    }
  }

  if (next.io_media_urls && typeof next.io_media_urls === 'object') {
    const mappedMap: Record<string, string[]> = {};
    for (const [k, arr] of Object.entries(next.io_media_urls)) {
      if (!Array.isArray(arr)) continue;
      const mapped = (arr as string[]).map((u) => (typeof u === 'string' && urlMap.get(u)) || u);
      mappedMap[k] = mapped;
      if (mapped.some((u, i) => u !== arr[i])) changed = true;
    }
    if (changed) next.io_media_urls = mappedMap;
  }

  return changed ? next : taskData;
}

export function collectManualMentionItems(taskData: any, ports: SchemePort[]): { url: string; type: SchemeAssetKind }[] {
  const items: { url: string; type: SchemeAssetKind }[] = [];
  const seen = new Set<string>();

  const push = (url: string, kind: SchemeAssetKind) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ url, type: kind === 'document' ? 'image' : kind });
  };

  const refPorts = (ports || []).filter(isReferenceMediaPort);
  for (const port of refPorts) {
    const kinds = portAcceptKinds(port);
    const hint = kinds[0] || guessPickKind('', port.modality);
    for (const url of getManualUrlsForPort(taskData, port)) {
      push(url, guessPickKind(url, hint));
    }
  }

  const manuals = Array.isArray(taskData?.reference_urls) ? (taskData.reference_urls as string[]) : [];
  for (const raw of manuals) {
    if (typeof raw === 'string' && raw) push(raw, 'image');
  }
  return items;
}
