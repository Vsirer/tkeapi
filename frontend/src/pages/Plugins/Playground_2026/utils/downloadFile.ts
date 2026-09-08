/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 统一文件下载
 *
 * 流程：
 * 1) 能 CORS → fetch/XHR 拉成 Blob → 本地 <a download>（不新开标签）
 * 2) CDN 无 CORS（如 s3.artsapi.com）→ 同源中转 /playground-2026/download-file
 *    （仅字节转发 + Content-Disposition: attachment，无业务逻辑）
 *
 * 禁止 window.open / target=_blank / 对跨域直链裸点 <a>（会被当成预览打开）。
 */
import request from '../../../../utils/request';
import { generateStandardMediaFilename } from './resourceFileName';

type DownloadMediaType = 'image' | 'video' | 'audio' | 'file';

export type DownloadFileOptions = {
  filename?: string;
  mediaType?: DownloadMediaType;
};

function sanitizeFilename(name: string): string {
  return (name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120);
}

function guessExt(url: string, mediaType?: DownloadMediaType): string {
  if (mediaType === 'video') return 'mp4';
  if (mediaType === 'audio') return 'mp3';
  const m = url.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a|aac|pdf|zip)(\?|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  if (mediaType === 'image') return 'png';
  return 'bin';
}

function resolveFilename(url: string, options?: DownloadFileOptions): string {
  const ext = guessExt(url, options?.mediaType);
  let raw = sanitizeFilename(options?.filename || '');
  if (!raw || raw === 'file' || raw === 'download') {
    raw = generateStandardMediaFilename({
      mediaType: options?.mediaType || (ext === 'mp4' ? 'video' : ext === 'mp3' ? 'audio' : 'image'),
    });
  }
  raw = raw.replace(/\.jpeg$/i, '.jpg');
  if (/\.[a-z0-9]{1,8}$/i.test(raw)) {
    return raw.replace(/\.jpeg$/i, '.jpg');
  }
  return `${raw}.${ext}`;
}

function asAttachmentBlob(blob: Blob): Blob {
  return new Blob([blob], { type: 'application/octet-stream' });
}

/** 本地 blob: URL + <a download>（同源，download 一定生效） */
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
  const fileBlob = new File([asAttachmentBlob(blob)], safeName, {
    type: 'application/octet-stream',
  });

  const nav = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
  };
  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(fileBlob, safeName);
    return;
  }

  const objectUrl = URL.createObjectURL(fileBlob);
  try {
    clickAnchorDownload(objectUrl, safeName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
  }
}

async function fetchBlobCors(url: string): Promise<Blob> {
  const res = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('空文件');
  return blob;
}

function xhrBlobCors(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.withCredentials = false;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        const blob = xhr.response as Blob;
        if (!blob.size) reject(new Error('空文件'));
        else resolve(blob);
      } else {
        reject(new Error(`HTTP ${xhr.status || 0}`));
      }
    };
    xhr.onerror = () => reject(new Error('CORS/网络错误'));
    xhr.send();
  });
}

/** 同源中转：绕过 CDN 无 CORS */
async function fetchBlobViaSameOriginProxy(url: string, filename: string): Promise<Blob> {
  try {
    const data = await request.get('/playground-2026/download-file', {
      params: { url, filename },
      responseType: 'blob',
      timeout: 300000,
      ...({ skipErrorHandler: true } as any),
    });
    if (!(data instanceof Blob)) throw new Error('中转返回非文件');
    if (data.type && data.type.includes('application/json')) {
      const text = await data.text();
      let msg = '下载中转失败';
      try {
        const j = JSON.parse(text);
        msg = j?.error?.message || j?.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    if (!data.size) throw new Error('空文件');
    return data;
  } catch (e: any) {
    const errBlob = e?.response?.data;
    if (errBlob instanceof Blob) {
      try {
        const text = await errBlob.text();
        const j = JSON.parse(text);
        throw new Error(j?.error?.message || j?.message || '下载中转失败');
      } catch (inner: any) {
        if (inner?.message) throw inner;
      }
    }
    throw new Error(e?.message || '下载中转失败');
  }
}

/**
 * 通过链接下载文件（创作中心2026 公共方法）。
 */
export async function downloadFileByUrl(
  url: string,
  options?: DownloadFileOptions,
): Promise<void> {
  const src = (url || '').trim();
  if (!src) throw new Error('下载地址为空');

  const filename = resolveFilename(src, options);

  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const res = await fetch(src);
    if (!res.ok) throw new Error('本地资源读取失败');
    await saveBlobToDisk(await res.blob(), filename);
    return;
  }

  // 1) 直连 CORS
  try {
    const blob = await fetchBlobCors(src);
    await saveBlobToDisk(blob, filename);
    return;
  } catch {
    /* try xhr */
  }
  try {
    const blob = await xhrBlobCors(src);
    await saveBlobToDisk(blob, filename);
    return;
  } catch {
    /* CDN 通常无 CORS，走同源中转 */
  }

  // 2) 同源中转（解决 s3.artsapi.com 等无 ACAO 头）
  const blob = await fetchBlobViaSameOriginProxy(src, filename);
  await saveBlobToDisk(blob, filename);
}
