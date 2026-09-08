/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * OpenAI 格式生成结果 URL 提取工具
 * 统一处理 OpenAI 规范的图片/视频响应格式
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** 将相对路径补全为完整 URL */
function getFullUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  if (!url.startsWith('http')) return `https://${url}`;
  return url;
}

/**
 * 从 OpenAI 格式响应中提取全部原始图片字段（url / b64_json，未做展示规范化）
 * 格式: { data: [{ url, b64_json }, ...] }
 */
export function extractImageUrls(resultData: any): string[] {
  if (!resultData) return [];
  const data = resultData?.data;
  if (Array.isArray(data) && data.length > 0) {
    return data
      .map((item: any) => {
        const u = typeof item === 'string' ? item : item?.url || item?.b64_json;
        return typeof u === 'string' && u ? u : '';
      })
      .filter(Boolean);
  }
  const contentUrl = resultData?.content?.image_url;
  if (typeof contentUrl === 'string' && contentUrl) return [contentUrl];
  return [];
}

/**
 * 从 OpenAI 格式响应中提取图片地址
 * 格式: { data: [{ url, b64_json }] }
 */
export function extractImageUrl(resultData: any): string {
  return extractImageUrls(resultData)[0] || '';
}

/**
 * 从响应中提取视频地址
 * 支持 OpenAI 格式 { data: [{ url }] } 和内部格式 { content: { video_url } }
 */
export function extractVideoUrl(resultData: any): string {
  if (!resultData) return '';
  // OpenAI 标准: data[0].url
  const d0 = resultData?.data?.[0];
  if (d0?.url && typeof d0.url === 'string') return d0.url;
  // 系统内部格式: content.video_url
  const cvUrl = resultData?.content?.video_url;
  if (cvUrl && typeof cvUrl === 'string') return cvUrl;
  // 注：火山 MediaKit 原始格式已统一至 OpenAI 任务轮询响应，在此无需冗余解析 result.video_url 字段
  // 兜底直接取根节点 video_url
  const rootUrl = resultData?.video_url;
  if (rootUrl && typeof rootUrl === 'string') return rootUrl;
  return '';
}

/** 将原始图片字段规范为可展示 URL（含相对路径 / base64） */
function normalizeImageDisplayUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return rawUrl;
  if (rawUrl.length > 100 && !rawUrl.startsWith('http') && !rawUrl.startsWith('/')) {
    return `data:image/png;base64,${rawUrl}`;
  }
  return getFullUrl(rawUrl);
}

/**
 * 从 OpenAI 格式响应中提取全部图片展示 URL
 * 格式: { data: [{ url, b64_json }, ...] }
 */
export function extractImageDisplayUrls(resultData: any): string[] {
  if (!resultData) return [];
  const data = resultData?.data;
  if (Array.isArray(data) && data.length > 0) {
    return data
      .map((item: any) => {
        const raw = typeof item === 'string' ? item : item?.url || item?.b64_json;
        return typeof raw === 'string' ? normalizeImageDisplayUrl(raw) : '';
      })
      .filter(Boolean);
  }
  const one = extractImageUrl(resultData);
  return one ? [normalizeImageDisplayUrl(one)] : [];
}

/**
 * 根据节点类型提取展示 URL
 */
export function getResultDisplayUrl(nodeType: string, resultData: any, activeIndex?: number): string {
  if (!resultData) return '';
  if (nodeType === 'image' || nodeType === 'ai_image') {
    const urls = extractImageDisplayUrls(resultData);
    if (urls.length) {
      const rawIdx =
        typeof activeIndex === 'number'
          ? activeIndex
          : Number(resultData?.content?.active_index ?? resultData?.active_index ?? 0);
      const idx = Number.isFinite(rawIdx)
        ? Math.min(Math.max(0, Math.trunc(rawIdx)), urls.length - 1)
        : 0;
      return urls[idx] || urls[0];
    }
    const contentUrl = resultData?.content?.image_url;
    if (typeof contentUrl === 'string' && contentUrl) return normalizeImageDisplayUrl(contentUrl);
    return '';
  }
  if (nodeType === 'video') return getFullUrl(extractVideoUrl(resultData));
  if (nodeType === 'audio') {
    const u = resultData?.content?.audio_url || resultData?.content?.video_url;
    return typeof u === 'string' && u ? getFullUrl(u) : '';
  }
  // 素材节点文档等：通用 file_url
  const fileUrl = resultData?.content?.file_url;
  if (typeof fileUrl === 'string' && fileUrl) return getFullUrl(fileUrl);
  return '';
}
