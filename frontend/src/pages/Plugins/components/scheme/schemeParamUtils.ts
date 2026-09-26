/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import type { SchemeParam } from './types';

export const isCountParam = (param: SchemeParam): boolean => {
  const k = (param.key || '').toLowerCase();
  const label = (param.label || '').toLowerCase();
  return (
    k === 'n' ||
    k === 'batch_size' ||
    k === 'num_images' ||
    k === 'image_count' ||
    k === 'count' ||
    k === 'quantity' ||
    k === 'generate_count' ||
    k === 'candidate_count' ||
    k === 'variations' ||
    label === '生成数量' ||
    label.includes('生成数量') ||
    label.includes('图片数量') ||
    label.includes('生成张数') ||
    label.includes('变体数量')
  );
};

export const isDurationParam = (param?: SchemeParam | null): boolean => {
  if (!param) return false;
  const k = (param.key || '').toLowerCase();
  const label = (param.label || '').toLowerCase();
  return (
    k.includes('duration') ||
    k.includes('time') ||
    k.includes('second') ||
    label.includes('时长') ||
    label.includes('时间') ||
    label.includes('秒')
  );
};

/**
 * 判断生成数量参数是否固定为 1（或最大只能为 1 / 仅 1 个选项 1）
 * 当生成数量为 1 时，不需要在前端设置面板与快捷栏中显示生成数量调节
 */
export const isSingleCountParam = (param?: SchemeParam | null): boolean => {
  if (!param || !isCountParam(param)) return false;

  // 1. 若配置了 options 列表
  if (Array.isArray(param.options)) {
    if (param.options.length <= 1) return true;
    const nums = param.options
      .map((o) => {
        if (typeof o === 'number') return o;
        const m = String(o).match(/\d+/);
        return m ? parseInt(m[0], 10) : NaN;
      })
      .filter((n) => !Number.isNaN(n));
    if (nums.length > 0 && Math.max(...nums) <= 1) return true;
  }

  // 2. 若配置了数字区间 max <= 1
  if (param.type === 'number' || param.type === 'slider') {
    if (param.max !== undefined && param.max <= 1) return true;
  }

  // 3. 未配置 options 且 max 未显式指定为 > 1（例如仅默认 1）
  if ((!param.options || param.options.length === 0) && (param.max === undefined || param.max <= 1)) {
    return true;
  }

  return false;
};

/** 常用英文选项内置中文对照字典 */
export const DEFAULT_OPTION_LABELS: Record<string, string> = {
  opaque: '不透明',
  transparent: '透明',
  png: 'PNG',
  jpeg: 'JPEG',
  jpg: 'JPG',
  webp: 'WebP',
  mp4: 'MP4',
  mov: 'MOV',
  standard: '标准',
  fast: '快速',
  auto: '智能',
  adaptive: '自适应',
  high: '高清',
  ultra: '超清',
  medium: '标准',
  low: '流畅',
  quality: '画质优先',
  speed: '速度优先',
  portrait: '人像',
  landscape: '风景',
};

/** 选项文案：优先 option_labels，其次内置中文字典，时长 -1/数字加单位，其余跟方案 unit */
export const formatChoiceLabel = (param: SchemeParam, opt: string | number): string => {
  const s = String(opt).trim();
  const lower = s.toLowerCase();

  // 1. 优先使用自定义配置的 option_labels 映射
  if (param.option_labels) {
    if (param.option_labels[s]) return param.option_labels[s];
    if (param.option_labels[lower]) return param.option_labels[lower];
  }

  // 2. 针对 quality 画质参数的定制中文对照与历史值回退
  if ((param.key || '').toLowerCase() === 'quality') {
    if (lower === 'low' || s === '流畅') return '常用画质';
    if (lower === 'medium' || s === '标准') return '高画质';
    if (lower === 'high' || s === '高清') return '高精细画质';
  }

  // 3. 特殊参数逻辑：时长智能 / 单位
  if (isDurationParam(param)) {
    if (lower === '-1' || lower === 'auto' || lower === 'adaptive') {
      return '智能';
    }
    if (/^\d+(\.\d+)?$/.test(s)) return `${s}s`;
  }

  // 4. 内置常用中文字典匹配
  if (DEFAULT_OPTION_LABELS[lower]) {
    const matched = DEFAULT_OPTION_LABELS[lower];
    return param.unit ? `${matched} ${param.unit}` : matched;
  }

  return param.unit ? `${s} ${param.unit}` : s;
};

/** 常用英文参数名称内置中文对照字典 */
export const DEFAULT_PARAM_LABELS: Record<string, string> = {
  'prompt enhancer': '提示词增强',
  prompt_enhancer: '提示词增强',
  variations: '变体数量',
  variation: '变体数量',
  resolution: '分辨率',
  quality: '画质',
  watermark: '水印',
  output_format: '输出格式',
  background: '背景',
  layer_decomposition: '自动拆分图层',
  optimize_prompt_mode: '提示词优化',
  ratio: '画面比例',
  aspect_ratio: '画面比例',
  duration: '生成时长',
  size: '图片尺寸',
  style: '画面风格',
  seed: '随机种子',
};

/** 常用参数默认中文功能说明/描述文案字典（描述菜单） */
export const DEFAULT_PARAM_HINTS: Record<string, string> = {
  prompt_enhancer: '开启后智能优化与润色提示词，丰富画面细节',
  'prompt enhancer': '开启后智能优化与润色提示词，丰富画面细节',
  variations: '单次生成的图片变体数量 (1-4)',
  variation: '单次生成的图片变体数量 (1-4)',
  resolution: '设置生成图片的清晰度规格 (1K/2K/4K)',
  quality: '设置生成画面的精细度质量 (常用画质/高画质/高精细画质)',
  layer_decomposition: '把参考图拆成底图 + 透明图层；提示词可空',
};

/** 常用参数分组标题内置中文对照字典 */
export const DEFAULT_GROUP_LABELS: Record<string, string> = {
  'more options': '更多选项',
  'more settings': '更多设置',
  advanced: '高级设置',
  'advanced options': '高级选项',
};

/** 参数标签文案：优先使用已是中文的文案，否则查字典回退 */
export const formatParamLabel = (param: SchemeParam): string => {
  const lbl = (param.label || '').trim();
  const key = (param.key || '').trim().toLowerCase();
  const lowerLbl = lbl.toLowerCase();

  // 若原文本即包含中文字符，直接采用
  if (/[\u4e00-\u9fa5]/.test(lbl)) {
    return lbl;
  }

  if (DEFAULT_PARAM_LABELS[lowerLbl]) {
    return DEFAULT_PARAM_LABELS[lowerLbl];
  }
  if (DEFAULT_PARAM_LABELS[key]) {
    return DEFAULT_PARAM_LABELS[key];
  }

  return lbl || key;
};

/** 参数描述文案（描述菜单）：优先方案配置 hint/description，其次内置说明字典 */
export const formatParamHint = (param: SchemeParam): string | undefined => {
  if (param.hint && param.hint.trim()) {
    return param.hint.trim();
  }
  if (param.description && param.description.trim()) {
    return param.description.trim();
  }
  const key = (param.key || '').trim().toLowerCase();
  const lowerLbl = (param.label || '').trim().toLowerCase();
  return DEFAULT_PARAM_HINTS[key] || DEFAULT_PARAM_HINTS[lowerLbl];
};
