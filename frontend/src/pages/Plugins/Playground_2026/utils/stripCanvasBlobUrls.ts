/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 画布本地 blob: URL 清理：刷新/异地打开后 registry 为空，失效地址需从节点剔除。
 */
import { getLocalFile, isBlobUrl } from './localFileRegistry';

export type BlobStripMode = 'stale' | 'all';

function shouldStripUrl(url: unknown, mode: BlobStripMode): boolean {
  if (typeof url !== 'string' || !isBlobUrl(url)) return false;
  if (mode === 'all') return true;
  return !getLocalFile(url);
}

function scrubUrl(url: unknown, mode: BlobStripMode): string {
  if (typeof url !== 'string') return '';
  return shouldStripUrl(url, mode) ? '' : url;
}

function scrubFileList(files: any[] | undefined, mode: BlobStripMode): any[] {
  if (!Array.isArray(files)) return [];
  return files
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const url = scrubUrl(f.url, mode);
      if (!url) return null;
      return { ...f, url };
    })
    .filter(Boolean);
}

function scrubUrlList(urls: any, mode: BlobStripMode): string[] | undefined {
  if (!Array.isArray(urls)) return undefined;
  const next = urls
    .map((u) => scrubUrl(u, mode))
    .filter((u): u is string => !!u);
  return next;
}

function emptyAssetResult() {
  return { content: { image_url: '' } };
}

function rebuildResultFromPrimary(primary: any) {
  const url = primary?.url || '';
  const kind = primary?.kind || 'image';
  if (kind === 'video') return { content: { video_url: url } };
  if (kind === 'audio') return { content: { audio_url: url } };
  if (kind === 'document') return { content: { file_url: url } };
  return { content: { image_url: url } };
}

/** 单节点：去掉失效/全部 blob 引用，素材节点回退为空态 */
function stripBlobUrlsFromNode<T extends Record<string, any>>(
  node: T,
  mode: BlobStripMode = 'stale',
): T {
  let changed = false;
  const taskData = node.taskData ? { ...node.taskData } : undefined;
  let resultData = node.resultData;

  if (taskData) {
    if (Array.isArray(taskData.files)) {
      const nextFiles = scrubFileList(taskData.files, mode);
      if (nextFiles.length !== taskData.files.length) changed = true;
      taskData.files = nextFiles;
    }

    if (typeof taskData.attached_url === 'string' && shouldStripUrl(taskData.attached_url, mode)) {
      taskData.attached_url = '';
      changed = true;
    }

    const nextAttached = scrubUrlList(taskData.attached_urls, mode);
    if (Array.isArray(taskData.attached_urls) && nextAttached) {
      if (nextAttached.length !== taskData.attached_urls.length) changed = true;
      taskData.attached_urls = nextAttached;
    }

    const nextRefs = scrubUrlList(taskData.reference_urls, mode);
    if (Array.isArray(taskData.reference_urls) && nextRefs) {
      if (nextRefs.length !== taskData.reference_urls.length) changed = true;
      taskData.reference_urls = nextRefs;
    }

    if (taskData.local_blob && (!Array.isArray(taskData.files) || taskData.files.length === 0)) {
      delete taskData.local_blob;
      changed = true;
    } else if (Array.isArray(taskData.files)) {
      const stillLocal = taskData.files.some((f: any) => isBlobUrl(f?.url));
      if (taskData.local_blob && !stillLocal) {
        delete taskData.local_blob;
        changed = true;
      }
    }
  }

  if (resultData && typeof resultData === 'object') {
    const nextResult = { ...resultData };
    const content =
      nextResult.content && typeof nextResult.content === 'object'
        ? { ...nextResult.content }
        : undefined;

    if (content) {
      for (const key of ['image_url', 'video_url', 'audio_url', 'file_url'] as const) {
        if (typeof content[key] === 'string' && shouldStripUrl(content[key], mode)) {
          content[key] = '';
          changed = true;
        }
      }
      if (Array.isArray(content.files)) {
        const nextFiles = scrubFileList(content.files, mode);
        if (nextFiles.length !== content.files.length) changed = true;
        content.files = nextFiles;
      }
      nextResult.content = content;
    }

    if (Array.isArray(nextResult.data)) {
      const nextData = nextResult.data.map((item: any) => {
        if (!item || typeof item !== 'object') return item;
        if (typeof item.url === 'string' && shouldStripUrl(item.url, mode)) {
          changed = true;
          return { ...item, url: '' };
        }
        return item;
      });
      nextResult.data = nextData;
    }

    resultData = nextResult;
  }

  // 素材节点：files 被清空后回到空态，避免残留坏链预览
  if (taskData?.node_type === 'asset') {
    const files = Array.isArray(taskData.files) ? taskData.files : [];
    if (files.length === 0) {
      const wasDirty =
        !!taskData.media_kind ||
        !!taskData.file_name ||
        !!taskData.local_blob ||
        (resultData &&
          (resultData.content?.image_url ||
            resultData.content?.video_url ||
            resultData.content?.audio_url ||
            resultData.content?.file_url ||
            resultData.data?.[0]?.url));
      if (wasDirty) changed = true;
      delete taskData.media_kind;
      delete taskData.file_name;
      delete taskData.mime;
      delete taskData.source;
      delete taskData.local_blob;
      delete taskData.active_file_id;
      taskData.files = [];
      resultData = emptyAssetResult() as any;
    } else {
      const primary =
        (typeof taskData.active_file_id === 'string' &&
          files.find((f: any) => f.id === taskData.active_file_id)) ||
        files[0];
      const rebuilt = rebuildResultFromPrimary(primary);
      resultData = {
        ...rebuilt,
        content: {
          ...rebuilt.content,
          files: files.map((f: any) => ({
            id: f.id,
            url: f.url,
            kind: f.kind,
            file_name: f.fileName || f.file_name,
            mime: f.mime,
            resource_id: f.resource_id,
          })),
          active_file_id: primary?.id,
        },
      };
      taskData.media_kind = primary?.kind;
      taskData.file_name = primary?.fileName || primary?.file_name;
      taskData.mime = primary?.mime;
      taskData.source = primary?.source;
      taskData.active_file_id = primary?.id;
      taskData.local_blob = files.some((f: any) => isBlobUrl(f?.url)) || undefined;
    }
  }

  if (!changed && mode === 'stale') {
    // 再扫一遍是否仍有未登记 blob（非 asset 节点）
    const hasStale =
      (typeof taskData?.attached_url === 'string' && shouldStripUrl(taskData.attached_url, mode)) ||
      (Array.isArray(taskData?.files) &&
        taskData.files.some((f: any) => shouldStripUrl(f?.url, mode)));
    if (!hasStale) return node;
  }

  return {
    ...node,
    ...(taskData ? { taskData } : {}),
    ...(resultData !== undefined ? { resultData } : {}),
  };
}

export function stripBlobUrlsFromNodes<T extends Record<string, any>>(
  nodes: T[],
  mode: BlobStripMode = 'stale',
): T[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  let changed = false;
  const next = nodes.map((n) => {
    const scrubbed = stripBlobUrlsFromNode(n, mode);
    if (scrubbed !== n) changed = true;
    return scrubbed;
  });
  return changed ? next : nodes;
}

/** 是否仍含有失效 blob（用于加载后决定是否回写画布） */
export function canvasHasStaleBlobUrls(nodes: any[]): boolean {
  if (!Array.isArray(nodes)) return false;
  const walk = (v: unknown): boolean => {
    if (typeof v === 'string') return shouldStripUrl(v, 'stale');
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === 'object') return Object.values(v as object).some(walk);
    return false;
  };
  return nodes.some(walk);
}
