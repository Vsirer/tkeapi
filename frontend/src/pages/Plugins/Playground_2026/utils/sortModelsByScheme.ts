/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import type { PlaygroundModel } from '../types';

/** 模型品牌：管理端「模型品牌」分类名 */
export function modelBrandLabel(m: PlaygroundModel): string {
  return (m.provider_name || '').trim();
}

function backendSortValue(m: PlaygroundModel): number {
  return m.sort_order ?? 0;
}

/** 与后台「创作模型管理」一致：pg_sort_order 降序；相同则保持原相对顺序 */
export function compareModelsByBackendOrder(
  a: PlaygroundModel,
  b: PlaygroundModel,
): number {
  return backendSortValue(b) - backendSortValue(a);
}

export function sortModelsByBackendOrder(
  models: PlaygroundModel[],
): PlaygroundModel[] {
  return [...models].sort(compareModelsByBackendOrder);
}

export function sortModelsByBrandMaxThenOrder(
  models: PlaygroundModel[],
): PlaygroundModel[] {
  return sortModelsByBackendOrder(models);
}

/** 品牌 Tab 顺序：按后台模型列表中首次出现的品牌（即该品牌最高排序值） */
export function sortBrandLabelsByMaxOrder(
  models: PlaygroundModel[],
  labels: string[],
): string[] {
  const want = new Set(labels);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of sortModelsByBackendOrder(models)) {
    const brand = modelBrandLabel(m);
    if (!brand || !want.has(brand) || seen.has(brand)) continue;
    seen.add(brand);
    out.push(brand);
  }
  for (const label of labels) {
    if (!seen.has(label)) out.push(label);
  }
  return out;
}
