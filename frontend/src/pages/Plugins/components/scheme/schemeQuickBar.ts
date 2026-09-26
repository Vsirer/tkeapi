/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import type { SchemeParam } from './types';
import { isCountParam, isDurationParam, isSingleCountParam, DEFAULT_OPTION_LABELS, formatParamLabel } from './schemeParamUtils';
import { pickSchemeOption } from './generationParams';

export const SCHEME_QUICK_BAR_MAX = 3;

export const SCHEME_QUICK_BAR_HELP =
  `勾选后，该参数会出现在独立图片/视频/音频生成页提示词下方的快捷栏。同一方案（含该模型微调）最多开启 ${SCHEME_QUICK_BAR_MAX} 个；左右顺序与参数列表一致。仅「单选 / 下拉」且已填写选项的参数可开启。`;

/** 快捷栏只适合做成选项条的单选 / 下拉，且排除生成数量固定为 1 的参数 */
export function isQuickBarEligible(param: SchemeParam): boolean {
  if (isSingleCountParam(param)) return false;
  return (
    (param.type === 'radio' || param.type === 'select') &&
    Array.isArray(param.options) &&
    param.options.length > 0
  );
}

/** 参数选项展示文案（优先 option_labels，其次内置中文字典，时长加 s，数量加张） */
export function formatParamOptionLabel(param: SchemeParam, val: any): string {
  if (val == null || val === '') return formatParamLabel(param);
  const str = String(val).trim();
  const lower = str.toLowerCase();

  // 1. 优先自定义 option_labels
  if (param.option_labels) {
    if (param.option_labels[str]) return param.option_labels[str];
    if (param.option_labels[lower]) return param.option_labels[lower];
  }

  // 针对 quality 画质参数的定制中文对照与历史值回退
  if ((param.key || '').toLowerCase() === 'quality') {
    if (lower === 'low' || str === '流畅') return '常用画质';
    if (lower === 'medium' || str === '标准') return '高画质';
    if (lower === 'high' || str === '高清') return '高精细画质';
  }

  // 2. 时长
  if (isDurationParam(param)) {
    if (lower === '-1' || lower === 'auto' || lower === 'adaptive') {
      return '智能时长';
    }
    if (/^\d+(\.\d+)?$/.test(str)) {
      return `${str}s`;
    }
  }

  // 3. 数量
  if (isCountParam(param)) {
    if (/张/.test(str)) return str;
    if (/^\d+$/.test(str)) return `${str}张`;
  }

  // 4. 内置常用选项对照
  if (DEFAULT_OPTION_LABELS[lower]) {
    return DEFAULT_OPTION_LABELS[lower];
  }

  return str;
}

/** 底栏属性摘要：后台勾了快捷栏的参数；一个都没勾则用第一个可展示参数 */
export function getShortcutSummaryParams(
  displayParams: SchemeParam[],
  opts?: { skipFirstFallback?: boolean },
): SchemeParam[] {
  const quick = displayParams
    .filter((p) => !!p.quick && !isSingleCountParam(p))
    .slice(0, SCHEME_QUICK_BAR_MAX);
  if (quick.length > 0) return quick;
  if (opts?.skipFirstFallback) return [];
  const first = displayParams.find((p) => !isSingleCountParam(p));
  return first ? [first] : [];
}

export function formatShortcutSummary(
  params: SchemeParam[],
  values: Record<string, any>,
): string {
  return params
    .map((p) => {
      const raw = values[p.key] ?? p.default;
      const v = p.options?.length ? pickSchemeOption(p.options, raw, p.default) : raw;
      return formatParamOptionLabel(p, v);
    })
    .filter((s) => !!s)
    .join(' | ');
}

type QuickBarOverrideBundle = {
  modify?: Record<string, { quick?: boolean } & Record<string, unknown>>;
  remove?: string[];
  add?: Array<{ quick?: boolean } & Record<string, unknown>>;
};

/** 方案参数 + 模型微调合并后，已勾选快捷栏的数量 */
export function countQuickBarEnabled(
  schemeParams: Array<{ key?: string; quick?: boolean }>,
  overrides?: QuickBarOverrideBundle | null,
  skip?: { key?: string; addIndex?: number },
): number {
  const removes = new Set(overrides?.remove || []);
  const modifies = overrides?.modify || {};
  let n = 0;
  for (const p of schemeParams) {
    const key = p.key || '';
    if (!key || removes.has(key)) continue;
    if (skip?.key && key === skip.key) continue;
    const merged = { ...p, ...(modifies[key] || {}) };
    if (merged.quick) n++;
  }
  (overrides?.add || []).forEach((ap, i) => {
    if (skip?.addIndex === i) return;
    if (ap?.quick) n++;
  });
  return n;
}
