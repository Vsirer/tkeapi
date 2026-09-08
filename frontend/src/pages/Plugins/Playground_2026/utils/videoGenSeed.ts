/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

const SEED_KEY = 'playground_2026_video_gen_seed';
export const VIDEO_GEN_SEED_EVENT = 'pg2026-video-gen-seed';

export type VideoGenSeed = {
  prompt?: string;
  modelMid?: string;
  paramValues?: Record<string, any>;
  /** 功能特性 key，如 text-to-video */
  featureKey?: string;
  /** 侧栏进入：忽略上次模型，选该特性下第一个 */
  preferFirstModel?: boolean;
  /** @deprecated 使用 referenceUrls */
  referenceUrl?: string;
  /** 参考图 URL 列表（最多 7） */
  referenceUrls?: string[];
  /** 是否打开后立即生成 */
  autoGenerate?: boolean;
};

export function saveVideoGenSeed(seed: VideoGenSeed): void {
  try {
    sessionStorage.setItem(SEED_KEY, JSON.stringify(seed));
  } catch {
    // ignore
  }
}

/** 写入种子并通知已打开的生成页立即应用（同页快捷切换模型） */
export function publishVideoGenSeed(seed: VideoGenSeed): void {
  saveVideoGenSeed(seed);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VIDEO_GEN_SEED_EVENT));
  }
}

export function consumeVideoGenSeed(): VideoGenSeed | null {
  try {
    const raw = sessionStorage.getItem(SEED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SEED_KEY);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as VideoGenSeed) : null;
  } catch {
    return null;
  }
}
