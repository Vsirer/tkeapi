/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 上传资源展示名：去掉后缀（与后端 upload_resource_display_name 一致）
 */
export function toResourceDisplayName(fileName: string): string {
  const name = (fileName || '').trim();
  if (!name) return 'file';
  const stripped = name.replace(/\.[^./\\]+$/, '').trim();
  return stripped || name;
}

/**
 * 校验文件夹/分类名称：
 * 规则：
 * 1. 不能为空或纯空白；
 * 2. 长度不得超过 40 个字；
 * 3. 必须包含文字或数字（汉字、英文、数字），不能仅为符号或标点；
 * 4. 不能以连字符“-”或下划线“_”开头或结尾；
 * 5. 不能包含连续空格；
 * 6. 严禁特殊符号、非法标点及乱码（如 *、&、%、¥、$、#、@、!、~、^、+、=、<、>、?、|、\、/、:、;、"、'、`、括号()、省略号...等）；
 * 仅支持中文汉字、英文字母、数字、下划线(_)及短横线(-)。
 */
export function validateAlbumName(
  name: string,
  label = '文件夹名称',
): { valid: boolean; error?: string } {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { valid: false, error: `${label}不能为空` };
  }
  if (Array.from(trimmed).length > 40) {
    return { valid: false, error: `${label}不得超过 40 个字` };
  }
  if (!/[\p{Letter}\p{Number}]/u.test(trimmed)) {
    return { valid: false, error: `${label}必须包含汉字、英文字母或数字，不能全为符号` };
  }
  if (trimmed.startsWith('-') || trimmed.startsWith('_') || trimmed.endsWith('-') || trimmed.endsWith('_')) {
    return { valid: false, error: `${label}不能以连字符或下划线开头或结尾` };
  }
  if (/\s{2,}/.test(trimmed)) {
    return { valid: false, error: `${label}不能包含连续空格` };
  }
  if (!/^[\p{Letter}\p{Number}_\-\s]+$/u.test(trimmed)) {
    return {
      valid: false,
      error: `${label}仅支持中英文字母、数字、下划线及连字符，不能包含特殊符号或标点（如 *、&、%、¥、括号、省略号等）`,
    };
  }
  return { valid: true };
}

/**
 * 校验文件名/文件夹名：
 * 文件夹名称直接委托 validateAlbumName 执行严格的中英文数字校验；
 * 文件名禁止系统保留字符及纯符号。
 */
export function validateMacFileName(
  name: string,
  label = '名称',
): { valid: boolean; error?: string } {
  if (label.includes('文件夹') || label.includes('分类')) {
    return validateAlbumName(name, label);
  }
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { valid: false, error: `${label}不能为空` };
  }
  if (Array.from(trimmed).length > 40) {
    return { valid: false, error: `${label}不得超过 40 个字` };
  }
  if (trimmed.startsWith('.')) {
    return { valid: false, error: `以“.”开头的${label}是为系统保留的，请选取其他名称` };
  }
  const invalidChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
  for (const char of invalidChars) {
    if (trimmed.includes(char)) {
      return { valid: false, error: `${label}不能包含非法字符“${char}”，请选取其他名称` };
    }
  }
  if (!/[\p{Letter}\p{Number}]/u.test(trimmed)) {
    return { valid: false, error: `${label}必须包含汉字、英文字母或数字` };
  }
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) < 32) {
      return { valid: false, error: `${label}包含非法字符，请选取其他名称` };
    }
  }
  return { valid: true };
}

/**
 * 格式化日期为 YYYYMMDD
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 格式化时间为 HHmmss
 */
function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}${min}${s}`;
}

/**
 * 生成 4 位随机短码
 */
function randomShortId(len = 4): string {
  const chars = '0123456789abcdef';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * 创作中心 2026 标准生成文件名规范：
 * 格式：tke_{mediaType}_{YYYYMMDD}_{HHmmss}_{shortId}[_{index}]
 */
export function generateStandardMediaFilename(options?: {
  mediaType?: 'image' | 'video' | 'audio' | 'file' | string;
  createdAt?: number | string | Date;
  id?: string;
  index?: number;
}): string {
  const typeMap: Record<string, string> = {
    image: 'img',
    img: 'img',
    video: 'video',
    videos: 'video',
    audio: 'audio',
    audios: 'audio',
  };
  const rawType = (options?.mediaType || 'image').toLowerCase();
  const typeStr = typeMap[rawType] || 'img';

  let dateObj = new Date();
  if (options?.createdAt) {
    const parsed = new Date(options.createdAt);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
  }

  const dateStr = formatDate(dateObj);
  const timeStr = formatTime(dateObj);

  let shortId = '';
  if (options?.id) {
    const cleanId = String(options.id).replace(/[^a-zA-Z0-9]/g, '');
    shortId = cleanId.slice(-4) || randomShortId(4);
  } else {
    shortId = randomShortId(4);
  }

  let base = `tke_${typeStr}_${dateStr}_${timeStr}_${shortId}`;
  if (typeof options?.index === 'number' && options.index > 0) {
    base += `_${String(options.index).padStart(2, '0')}`;
  }
  return base;
}

/**
 * 下载用资源名（不含强制后缀；downloadFile 会按 URL/类型补全扩展名）
 * 规范：
 * 1. 用户手动上传的原文件（sourceType === 'upload'）保留原始文件名
 * 2. 创作中心 AI 生成作品一律采用标准规范命名：tke_{type}_{YYYYMMDD}_{HHmmss}_{shortId}
 */
export function getAssetDownloadFilename(item: {
  id?: string;
  prompt?: string;
  previewUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | string;
  createdAt?: number | string | Date;
  sourceType?: 'work' | 'upload' | string;
  fileName?: string;
  originalFileName?: string;
  index?: number;
}): string {
  // 如果是用户主动上传的素材，且有明确的原始文件名
  if (item.sourceType === 'upload') {
    const original = (item.originalFileName || item.fileName || '').trim();
    if (original) {
      const clean = toResourceDisplayName(original);
      if (clean && clean !== 'file') {
        return clean;
      }
    }
  }

  // 否则统一使用创作中心规范命名：tke_{type}_{YYYYMMDD}_{HHmmss}_{shortId}
  let inferredMediaType = item.mediaType;
  if (!inferredMediaType && item.previewUrl) {
    if (/\.(mp4|webm|mov)(\?|$)/i.test(item.previewUrl)) {
      inferredMediaType = 'video';
    } else if (/\.(mp3|wav|m4a|aac)(\?|$)/i.test(item.previewUrl)) {
      inferredMediaType = 'audio';
    } else {
      inferredMediaType = 'image';
    }
  }

  return generateStandardMediaFilename({
    mediaType: inferredMediaType,
    createdAt: item.createdAt,
    id: item.id,
    index: item.index,
  });
}
