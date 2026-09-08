/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 预览节点：解析源媒体与元数据（供节点本体 / 右侧属性面板共用）
 * 读不到真实值时统一显示「未知」，不编造数值
 */
import { useEffect, useMemo, useState } from 'react';
import type { CanvasNode } from '../types';
import { extractImageDisplayUrls, getResultDisplayUrl } from './resultExtractor';
import { getLocalFile } from './localFileRegistry';

export type PreviewMediaMeta = {
  format: string;
  fileSize: string;
  resolution: string;
  duration: string;
  bitrate: string;
};

export type PreviewMediaItem = {
  id: string;
  url: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  /** 已知字节数（本地 File / 入库 file_size）；优先于 HEAD */  
  fileSizeBytes?: number;
};

export type PreviewMediaInfo = {
  sourceNode: CanvasNode | null;
  isParentLost: boolean;
  mediaType: string;
  finalUrl: string;
  isGenerating: boolean;
  /** 源节点多文件列表（素材 files / 生成多图等） */
  items: PreviewMediaItem[];
  activeIndex: number;
  /** 当前激活文件的已知大小（字节） */
  activeFileSizeBytes?: number;
};

function formatFileSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}

export { formatFileSizeBytes };

function resolveKnownFileBytes(raw: any, url: string): number | undefined {
  const fromField = Number(raw?.fileSize ?? raw?.file_size ?? raw?.size ?? 0);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  if (url.startsWith('blob:')) {
    const f = getLocalFile(url);
    if (f?.size) return f.size;
  }
  return undefined;
}

function findSourceNode(currNode: CanvasNode, nodes: CanvasNode[]): CanvasNode | null {
  const parent = currNode.parentId ? nodes.find((n) => n.id === currNode.parentId) : null;
  if (!parent || parent.isHidden) return null;
  if (parent.taskData?.node_type === 'volc_enhance') return parent;
  const url = getResultDisplayUrl(parent.type, parent.resultData);
  if (url) return parent;
  if (parent.taskData?.node_type === 'preview') return findSourceNode(parent, nodes);
  return parent;
}

/** 从源节点收集可预览的多文件列表 */
export function listSourceMediaItems(sourceNode: CanvasNode | null): PreviewMediaItem[] {
  if (!sourceNode) return [];
  const nodeType = String(sourceNode.taskData?.node_type || sourceNode.type || '');

  if (nodeType === 'asset' || nodeType === 'director') {
    const list = Array.isArray(sourceNode.taskData?.files) ? sourceNode.taskData.files : [];
    return list
      .filter((f: any) => f?.url)
      .map((f: any) => {
        const url = String(f.url);
        return {
          id: String(f.id || f.url),
          url,
          kind: (['image', 'video', 'audio', 'document'].includes(f.kind)
            ? f.kind
            : 'image') as PreviewMediaItem['kind'],
          fileSizeBytes: resolveKnownFileBytes(f, url),
        };
      });
  }

  if (nodeType === 'ai_image' || sourceNode.type === 'image') {
    const urls = extractImageDisplayUrls(sourceNode.resultData);
    const nodeBytes = Number(sourceNode.taskData?.file_size || 0);
    return urls.map((url, i) => ({
      id: `img_${i}`,
      url,
      kind: 'image' as const,
      // 多图时单文件大小通常未知；仅一张时可用节点级 file_size
      fileSizeBytes:
        urls.length === 1 && Number.isFinite(nodeBytes) && nodeBytes > 0
          ? nodeBytes
          : resolveKnownFileBytes(null, url),
    }));
  }

  if (nodeType === 'ai_video' || sourceNode.type === 'video' || nodeType === 'volc_enhance') {
    const url = getResultDisplayUrl('video', sourceNode.resultData);
    if (url) {
      const nodeBytes = Number(sourceNode.taskData?.file_size || 0);
      return [
        {
          id: 'video_0',
          url,
          kind: 'video',
          fileSizeBytes:
            Number.isFinite(nodeBytes) && nodeBytes > 0
              ? nodeBytes
              : resolveKnownFileBytes(null, url),
        },
      ];
    }
  }

  if (sourceNode.type === 'audio') {
    const url = getResultDisplayUrl('audio', sourceNode.resultData);
    if (url) {
      const nodeBytes = Number(sourceNode.taskData?.file_size || 0);
      return [
        {
          id: 'audio_0',
          url,
          kind: 'audio',
          fileSizeBytes:
            Number.isFinite(nodeBytes) && nodeBytes > 0
              ? nodeBytes
              : resolveKnownFileBytes(null, url),
        },
      ];
    }
  }

  return [];
}

function resolveActiveIndex(sourceNode: CanvasNode | null, items: PreviewMediaItem[]): number {
  if (!items.length) return 0;
  if (!sourceNode) return 0;

  if (sourceNode.taskData?.node_type === 'asset' || sourceNode.taskData?.node_type === 'director') {
    const stored =
      (typeof sourceNode.taskData?.active_file_id === 'string' && sourceNode.taskData.active_file_id) ||
      (typeof sourceNode.resultData?.content?.active_file_id === 'string' &&
        sourceNode.resultData.content.active_file_id) ||
      '';
    const idx = items.findIndex((it) => it.id === stored);
    return idx >= 0 ? idx : 0;
  }

  const raw = Number(
    sourceNode.taskData?.active_result_index ?? sourceNode.resultData?.content?.active_index ?? 0,
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(0, Math.trunc(raw)), items.length - 1);
}

export function resolvePreviewMediaInfo(
  node: CanvasNode,
  displayNode: CanvasNode,
  nodes: CanvasNode[],
): PreviewMediaInfo {
  const parentNode = node.parentId ? nodes.find((n) => n.id === node.parentId) : null;
  const isParentLost = !parentNode || !!parentNode.isHidden;
  const sourceNode = !isParentLost ? findSourceNode(node, nodes) || parentNode || null : null;

  const items = listSourceMediaItems(sourceNode);
  const activeIndex = resolveActiveIndex(sourceNode, items);
  const activeItem = items[activeIndex] || items[0] || null;

  const selfType = displayNode.type || (sourceNode ? sourceNode.type : 'image');
  const selfUrl = getResultDisplayUrl(selfType, displayNode.resultData);

  const mediaType = selfUrl
    ? selfType
    : activeItem?.kind === 'document'
      ? 'text'
      : activeItem?.kind || (sourceNode ? sourceNode.type : 'image');

  const finalUrl = selfUrl || activeItem?.url || '';

  const isGenerating =
    displayNode.status === 'loading' ||
    (!!sourceNode && sourceNode.taskData?.enhance_status === 'processing');

  const activeFileSizeBytes = activeItem?.fileSizeBytes;

  return {
    sourceNode,
    isParentLost,
    mediaType,
    finalUrl,
    isGenerating,
    items,
    activeIndex,
    activeFileSizeBytes,
  };
}

export function usePreviewMediaMeta(
  finalUrl: string,
  mediaType: string,
  disabled?: boolean,
  knownBytes?: number,
): PreviewMediaMeta | null {
  const [metadata, setMetadata] = useState<PreviewMediaMeta | null>(null);

  useEffect(() => {
    if (!finalUrl || disabled) {
      setMetadata(null);
      return;
    }

    let active = true;

    const loadMeta = async () => {
      let format = '未知';
      try {
        const cleanUrl = finalUrl.split('?')[0].split('#')[0];
        const parts = cleanUrl.split('.');
        if (parts.length > 1) {
          const ext = parts[parts.length - 1].toUpperCase();
          if (ext && ext.length <= 5) format = ext;
        }
      } catch {
        /* ignore */
      }

      let sizeInBytes =
        typeof knownBytes === 'number' && Number.isFinite(knownBytes) && knownBytes > 0
          ? knownBytes
          : 0;

      if (!sizeInBytes && finalUrl.startsWith('blob:')) {
        sizeInBytes = getLocalFile(finalUrl)?.size || 0;
      }

      if (!sizeInBytes) {
        try {
          const res = await fetch(finalUrl, { method: 'HEAD' });
          const contentLength = res.headers.get('content-length');
          if (contentLength) sizeInBytes = parseInt(contentLength, 10);
        } catch {
          /* CORS / 无 Content-Length 时保持未知 */
        }
      }

      const fileSize = formatFileSizeBytes(sizeInBytes);

      if (mediaType === 'image') {
        const img = new Image();
        img.onload = () => {
          if (!active) return;
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          setMetadata({
            format,
            fileSize,
            resolution: w && h ? `${w}x${h}` : '未知',
            duration: '未知',
            bitrate: '未知',
          });
        };
        img.onerror = () => {
          if (!active) return;
          setMetadata({ format, fileSize, resolution: '未知', duration: '未知', bitrate: '未知' });
        };
        img.src = finalUrl;
      } else if (mediaType === 'video' || mediaType === 'audio') {
        const media = document.createElement(mediaType === 'video' ? 'video' : 'audio');
        media.onloadedmetadata = () => {
          if (!active) return;
          const durationSec = media.duration;
          const durationStr =
            Number.isFinite(durationSec) && durationSec > 0
              ? `${durationSec.toFixed(1)}s`
              : '未知';
          let resolution = '未知';
          if (mediaType === 'video') {
            const videoMedia = media as HTMLVideoElement;
            const w = videoMedia.videoWidth;
            const h = videoMedia.videoHeight;
            if (w && h) resolution = `${w}x${h}`;
          }
          let bitrate = '未知';
          if (sizeInBytes && Number.isFinite(durationSec) && durationSec > 0) {
            bitrate = `${Math.round((sizeInBytes * 8) / durationSec / 1000)} kbps`;
          }
          setMetadata({ format, fileSize, resolution, duration: durationStr, bitrate });
        };
        media.onerror = () => {
          if (!active) return;
          setMetadata({
            format,
            fileSize,
            resolution: '未知',
            duration: '未知',
            bitrate: '未知',
          });
        };
        media.src = finalUrl;
      } else {
        setMetadata({ format, fileSize, resolution: '未知', duration: '未知', bitrate: '未知' });
      }
    };

    loadMeta();
    return () => {
      active = false;
    };
  }, [finalUrl, mediaType, disabled, knownBytes]);

  return metadata;
}

export function usePreviewMediaInfo(
  node: CanvasNode,
  displayNode: CanvasNode,
  nodes: CanvasNode[],
): PreviewMediaInfo {
  return useMemo(
    () => resolvePreviewMediaInfo(node, displayNode, nodes),
    [node, displayNode, nodes],
  );
}
