/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 火山画质增强节点：管理端未开启或依赖插件未启用时，不出现在添加列表，已有节点也不可提交。
 */

export type VolcEnhanceConfigLike = {
  volc_enhance_enabled?: boolean;
  volc_enhance_plugin_active?: boolean;
} | null | undefined;

export function isVolcEnhanceUsable(cfg: VolcEnhanceConfigLike): boolean {
  return !!(cfg?.volc_enhance_enabled && cfg?.volc_enhance_plugin_active);
}

/** 不可用原因文案；可用时返回空串 */
export function volcEnhanceUnavailableMessage(cfg: VolcEnhanceConfigLike): string {
  if (isVolcEnhanceUsable(cfg)) return '';
  if (!cfg?.volc_enhance_plugin_active) {
    return '尚未启用「火山画质增强」插件，请联系管理员开启后再使用';
  }
  if (!cfg?.volc_enhance_enabled) {
    return '当前创作中心未开启火山画质增强，请联系管理员开启后再使用';
  }
  return '火山画质增强暂不可用';
}
