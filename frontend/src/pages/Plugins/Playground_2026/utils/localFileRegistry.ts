/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 本地待上传文件登记：弹窗/素材先用 blob URL 预览，真正生成任务时再上传。
 * key 为 blob: URL（内存级，刷新页面后失效属预期）。
 * 同时记住原文件名，供真实上传 multipart / 资源展示名使用。
 */
type LocalFileEntry = {
  file: File;
  /** 选择时的原始文件名（含后缀） */
  originalFileName: string;
};

const localFileByBlobUrl = new Map<string, LocalFileEntry>();

function normalizeOriginalName(file: File, originalFileName?: string): string {
  const fromArg = (originalFileName || '').trim();
  if (fromArg) return fromArg;
  const fromFile = (file.name || '').trim();
  if (fromFile) return fromFile;
  return `file_${Date.now()}`;
}

export function registerLocalFile(
  blobUrl: string,
  file: File,
  originalFileName?: string,
): void {
  if (!blobUrl.startsWith('blob:') || !file) return;
  localFileByBlobUrl.set(blobUrl, {
    file,
    originalFileName: normalizeOriginalName(file, originalFileName),
  });
}

export function getLocalFile(blobUrl: string): File | undefined {
  return localFileByBlobUrl.get(blobUrl)?.file;
}

export function getLocalOriginalFileName(blobUrl: string): string | undefined {
  return localFileByBlobUrl.get(blobUrl)?.originalFileName;
}

/**
 * 取出带原文件名的 File，供真实上传使用。
 * 若登记里 File.name 与原名不一致，会包装成新 File（内容不变）。
 */
export function resolveLocalFileForUpload(blobUrl: string): File | undefined {
  const entry = localFileByBlobUrl.get(blobUrl);
  if (!entry) return undefined;
  const name = entry.originalFileName || entry.file.name;
  if (entry.file.name === name) return entry.file;
  return new File([entry.file], name, {
    type: entry.file.type,
    lastModified: entry.file.lastModified,
  });
}

export function unregisterLocalFile(blobUrl: string): void {
  if (!blobUrl.startsWith('blob:')) return;
  localFileByBlobUrl.delete(blobUrl);
  try {
    URL.revokeObjectURL(blobUrl);
  } catch {
    /* ignore */
  }
}

export function isBlobUrl(url?: string | null): boolean {
  return !!url && url.startsWith('blob:');
}
