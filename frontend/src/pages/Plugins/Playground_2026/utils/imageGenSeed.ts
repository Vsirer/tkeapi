/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

const SEED_KEY = 'playground_2026_image_gen_seed';
export const IMAGE_GEN_SEED_EVENT = 'pg2026-image-gen-seed';

export type ImageGenSeed = {
  prompt?: string;
  modelMid?: string;
  paramValues?: Record<string, any>;
  /** @deprecated 使用 referenceUrls */
  referenceUrl?: string;
  /** 参考图 URL 列表（最多 7） */
  referenceUrls?: string[];
  /** 选中的二级功能特性 key */
  featureKey?: string;
  /** 是否打开后立即生成 */
  autoGenerate?: boolean;
};

export function saveImageGenSeed(seed: ImageGenSeed): void {
  try {
    sessionStorage.setItem(SEED_KEY, JSON.stringify(seed));
  } catch {
    // ignore
  }
}

/** 写入种子并通知已打开的生成页立即应用（同页快捷切换模型） */
export function publishImageGenSeed(seed: ImageGenSeed): void {
  saveImageGenSeed(seed);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(IMAGE_GEN_SEED_EVENT));
  }
}

export function consumeImageGenSeed(): ImageGenSeed | null {
  try {
    const raw = sessionStorage.getItem(SEED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SEED_KEY);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ImageGenSeed) : null;
  } catch {
    return null;
  }
}
