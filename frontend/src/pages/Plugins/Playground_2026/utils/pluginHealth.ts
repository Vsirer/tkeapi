/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 插件存活探测：固定路径 GET /playground-2026/health
 * （对齐 Dashboard 对 /metrics/live 的 5s 轮询用途）
 */
import request from '../../../../utils/request';

const PLAYGROUND_2026_HEALTH_URL = '/playground-2026/health';
export const PLAYGROUND_2026_HEALTH_POLL_MS = 5000;

/** 探测插件后端是否已就绪；瞬时 502/503/504 / 无响应时抛错 */
export async function probePlayground2026Health(): Promise<{ ok: boolean; plugin?: string }> {
  try {
    return (await request.get(PLAYGROUND_2026_HEALTH_URL, {
      skipErrorHandler: true,
      timeout: 8000,
    } as any)) as { ok: boolean; plugin?: string };
  } catch (err: any) {
    const status = err?.response?.status;
    // 后端已起来，只是未登录；不要当成编译/重启中
    if (status === 401 || status === 403) {
      return { ok: true, plugin: 'playground_2026' };
    }
    throw err;
  }
}
