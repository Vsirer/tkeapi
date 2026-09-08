/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import type { PlaygroundModel, SchemeParam } from '../types';
import { resolveModelIo } from './schemeIo';
import { sortModelsByBrandMaxThenOrder } from './sortModelsByScheme';

export type FlowModelKind = 'image' | 'video';

function schemeLooksLike(m: PlaygroundModel, kind: FlowModelKind): boolean {
  const t = `${m.scheme_type || ''} ${m.type_name || ''}`.toLowerCase();
  if (kind === 'image') {
    return t.includes('image') || t.includes('图');
  }
  return t.includes('video') || t.includes('视');
}

/** 按节点类型筛选可用模型 */
export function filterModelsByKind(models: PlaygroundModel[], kind: FlowModelKind): PlaygroundModel[] {
  const matched = models.filter((m) => schemeLooksLike(m, kind));
  return matched.length > 0 ? matched : models.filter((m) => {
    const t = `${m.scheme_type || ''} ${m.type_name || ''}`.toLowerCase();
    // 兜底：排除明显另一类
    if (kind === 'image') return !t.includes('video') && !t.includes('视') && !t.includes('chat');
    return !t.includes('image') && !t.includes('图') && !t.includes('chat');
  });
}

/** 取默认模型；无可选时返回 null（节点留空） */
export function pickDefaultModel(
  models: PlaygroundModel[] | undefined | null,
  kind: FlowModelKind,
): PlaygroundModel | null {
  if (!models?.length) return null;
  const list = sortModelsByBrandMaxThenOrder(filterModelsByKind(models, kind));
  return list[0] || null;
}

export function buildModelTaskDefaults(model: PlaygroundModel | null): Record<string, any> {
  if (!model) {
    return { model: '', modelName: '', modelMid: undefined, scheme_id: undefined };
  }
  const defaults: Record<string, any> = {};
  if (Array.isArray(model.params)) {
    for (const p of model.params as SchemeParam[]) {
      defaults[p.key] = p.default;
    }
  }
  const kind: FlowModelKind = schemeLooksLike(model, 'video') ? 'video' : 'image';
  const io = resolveModelIo(model, kind);
  return {
    model: model.model_id || model.name,
    modelName: model.name || model.model_id,
    modelMid: model.mid,
    scheme_id: model.scheme_id,
    io_inputs: io.allInputs,
    io_outputs: io.allOutputs,
    ...defaults,
  };
}
