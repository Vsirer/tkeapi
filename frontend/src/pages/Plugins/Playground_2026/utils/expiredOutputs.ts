/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import type { GeneratedImageItem } from './imageGenStorage';

const FAILED_OUTPUT_EXPIRATION_MS = 3 * 60 * 1000;

/**
 * 判断某条生成记录是否为超过 3 分钟且未成功生成过的失败项
 */
export function isFailedOutputExpired(
  item: Pick<GeneratedImageItem, 'status' | 'previewUrl' | 'createdAt' | 'updatedAt'>,
  now = Date.now(),
): boolean {
  if (item.status !== 'error') return false;
  if (item.previewUrl && item.previewUrl.trim()) return false;
  const ts =
    typeof item.updatedAt === 'number' && item.updatedAt > 0 ? item.updatedAt : item.createdAt;
  if (typeof ts !== 'number' || ts <= 0) return false;
  return now - ts >= FAILED_OUTPUT_EXPIRATION_MS;
}
