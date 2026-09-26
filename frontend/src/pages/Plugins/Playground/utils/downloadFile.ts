/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 创作中心画布下载：先 CORS 直拉；失败则走同源 /playground/download-file 中转。
 */
import request from '../../../../utils/request';

type DownloadMediaType = 'image' | 'video' | 'audio' | 'file';

export type DownloadFileOptions = {
  filename?: string;
  mediaType?: DownloadMediaType;
};

function sanitizeFilename(name: string): string {
  return (name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'file';
}

function guessExt(url: string, mediaType?: DownloadMediaType): string {
  if (mediaType === 'video') return 'mp4';
  if (mediaType === 'audio') return 'mp3';
  const m = url.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a|aac)(\?|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  if (mediaType === 'image') return 'png';
  return 'bin';
}

function resolveFilename(url: string, options?: DownloadFileOptions): string {
  const ext = guessExt(url, options?.mediaType);
  let raw = sanitizeFilename(options?.filename || 'file');
  if (/\.[a-z0-9]{1,8}$/i.test(raw)) return raw.replace(/\.jpeg$/i, '.jpg');
  return `${raw}.${ext}`;
}

function clickAnchorDownload(objectUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function saveBlobToDisk(blob: Blob, filename: string): Promise<void> {
  const safeName = sanitizeFilename(filename).replace(/\.jpeg$/i, '.jpg') || 'file.bin';
  const fileBlob = new Blob([blob], { type: 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(fileBlob);
  try {
    clickAnchorDownload(objectUrl, safeName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
  }
}

async function fetchBlobCors(url: string): Promise<Blob> {
  const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('空文件');
  return blob;
}

async function fetchBlobViaProxy(url: string, filename: string): Promise<Blob> {
  const data = await request.get('/playground/download-file', {
    params: { url, filename },
    responseType: 'blob',
    timeout: 300000,
    ...({ skipErrorHandler: true } as any),
  });
  if (!(data instanceof Blob)) throw new Error('中转返回非文件');
  if (data.type?.includes('application/json')) {
    const text = await data.text();
    let msg = '下载中转失败';
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (!data.size) throw new Error('空文件');
  return data;
}

/** 通过链接下载文件（创作中心公共方法） */
export async function downloadFileByUrl(url: string, options?: DownloadFileOptions): Promise<void> {
  const src = (url || '').trim();
  if (!src) throw new Error('下载地址为空');
  const filename = resolveFilename(src, options);

  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const res = await fetch(src);
    if (!res.ok) throw new Error('本地资源读取失败');
    await saveBlobToDisk(await res.blob(), filename);
    return;
  }

  try {
    await saveBlobToDisk(await fetchBlobCors(src), filename);
    return;
  } catch {
    /* CDN 常无 CORS，走同源中转 */
  }
  await saveBlobToDisk(await fetchBlobViaProxy(src, filename), filename);
}
