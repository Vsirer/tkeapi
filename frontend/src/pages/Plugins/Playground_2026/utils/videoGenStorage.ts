/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 视频作品列表加载（复用 outputs API，media_type=video）
 */
import type { GeneratedImageItem } from './imageGenStorage';
import { listAssets } from './assetsApi';

export async function loadGeneratedVideosFromServer(): Promise<GeneratedImageItem[]> {
  return listAssets({ mediaType: 'video', sort: 'recent', sourceType: 'work' });
}
