/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片 / 视频生成页：记住上次选中的模型 mid
 * 无记录或不在当前列表时，由调用方回退到第一项
 */

const IMAGE_MODEL_KEY = 'playground_2026_image_gen_model_mid';
const VIDEO_MODEL_KEY = 'playground_2026_video_gen_model_mid';

function readMid(storageKey: string): string {
  try {
    return (localStorage.getItem(storageKey) || '').trim();
  } catch {
    return '';
  }
}

function writeMid(storageKey: string, mid: string): void {
  const v = (mid || '').trim();
  if (!v) return;
  try {
    localStorage.setItem(storageKey, v);
  } catch {
    // ignore quota / private mode
  }
}

export function loadSavedImageGenModelMid(): string {
  return readMid(IMAGE_MODEL_KEY);
}

export function saveImageGenModelMid(mid: string): void {
  writeMid(IMAGE_MODEL_KEY, mid);
}

export function loadSavedVideoGenModelMid(): string {
  return readMid(VIDEO_MODEL_KEY);
}

export function saveVideoGenModelMid(mid: string): void {
  writeMid(VIDEO_MODEL_KEY, mid);
}

/** 在模型列表中解析应选 mid：优先 current → saved → 第一项 */
export function resolvePreferredModelMid(
  models: Array<{ mid: string }>,
  currentMid: string | undefined | null,
  savedMid: string | undefined | null,
): string {
  if (!models.length) return '';
  if (currentMid && models.some((m) => m.mid === currentMid)) return currentMid;
  if (savedMid && models.some((m) => m.mid === savedMid)) return savedMid;
  return models[0].mid;
}
