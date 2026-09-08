/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 资源弹窗本地选文件：先 blob 预览，真正生成任务时再上传。
 */
import type { FlowAssetPickResult } from './insertCanvasAsset';
import {
  getLocalOriginalFileName,
  isBlobUrl,
  registerLocalFile,
  resolveLocalFileForUpload,
  unregisterLocalFile,
} from './localFileRegistry';
import {
  classifyWorkflowAssetFile,
  uploadResourceFileDetailed,
  uploadStandaloneReference,
  uploadWorkflowAssetFile,
  type WorkflowAssetKind,
} from './referenceUpload';
import { toResourceDisplayName } from './resourceFileName';

function guessExtFromMime(mime: string): string {
  if (mime.includes('video')) return 'mp4';
  if (mime.includes('audio')) return 'mp3';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'bin';
}

/** 将本地 File 转为 pick（登记 blob + 原文件名，不上传） */
export function buildLocalFlowPicks(
  files: File[],
  options?: {
    constrainKind?: WorkflowAssetKind | null;
    maxBytes?: number;
  },
): { picks: FlowAssetPickResult[]; warnings: string[] } {
  const constrainKind = options?.constrainKind ?? null;
  const maxBytes = options?.maxBytes ?? 30 * 1024 * 1024;
  const picks: FlowAssetPickResult[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const kind = classifyWorkflowAssetFile(file);
    if (!kind) {
      warnings.push('仅支持图片、视频、音频或文档');
      continue;
    }
    if (constrainKind && kind !== constrainKind) {
      warnings.push('请选择与当前要求相同类型的文件');
      continue;
    }
    if (file.size > maxBytes) {
      warnings.push(`${file.name} 超过 ${Math.round(maxBytes / (1024 * 1024))}MB`);
      continue;
    }
    const url = URL.createObjectURL(file);
    const originalFileName = file.name;
    registerLocalFile(url, file, originalFileName);
    picks.push({
      url,
      kind,
      fileName: toResourceDisplayName(originalFileName),
      originalFileName,
      source: 'upload',
      mime: file.type,
      file,
      fileSize: file.size,
    });
  }
  return { picks, warnings };
}

async function resolveOneBlobUrl(
  blobUrl: string,
  projectId?: number | null,
): Promise<string> {
  let file = resolveLocalFileForUpload(blobUrl);
  if (!file) {
    const blob = await fetch(blobUrl).then((r) => r.blob());
    const original =
      getLocalOriginalFileName(blobUrl) ||
      `local_${Date.now()}.${guessExtFromMime(blob.type || '')}`;
    file = new File([blob], original, {
      type: blob.type || 'application/octet-stream',
    });
  }
  const kind = classifyWorkflowAssetFile(file);
  let remote: string;
  if (kind === 'image') {
    remote = await uploadStandaloneReference(file);
  } else if (kind === 'video' || kind === 'audio') {
    const res = await uploadResourceFileDetailed(file);
    remote = res.url;
  } else {
    const res = await uploadWorkflowAssetFile(file, projectId);
    remote = res.url;
  }
  // 真实上传完成：清理本地 blob 与原文件名登记
  unregisterLocalFile(blobUrl);
  return remote;
}

/**
 * 将 URL 列表中的 blob: 上传为远程地址；已是 http(s) 的原样返回。
 * 返回替换后的列表；若有失败则抛错。
 */
export async function ensureRemoteUrls(
  urls: string[],
  projectId?: number | null,
): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    const u = (url || '').trim();
    if (!u) continue;
    if (!isBlobUrl(u)) {
      out.push(u);
      continue;
    }
    out.push(await resolveOneBlobUrl(u, projectId));
  }
  return out;
}

/** 旧 URL → 新 URL 映射（便于同步改节点 / 参考列表） */
export async function ensureRemoteUrlMap(
  urls: string[],
  projectId?: number | null,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(urls.filter(Boolean)));
  for (const url of unique) {
    if (!isBlobUrl(url)) {
      map.set(url, url);
      continue;
    }
    map.set(url, await resolveOneBlobUrl(url, projectId));
  }
  return map;
}

export function remapUrls(urls: string[], map: Map<string, string>): string[] {
  return urls.map((u) => map.get(u) || u);
}
