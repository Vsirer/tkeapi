/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import request from '../../../../utils/request';
import { coalesceAsync } from '../../../../utils/coalesceAsync';
import type { PlaygroundModel, SchemeParam } from '../types';
import { initSchemeParamDefaults } from '../utils/generationParams';
import { clampImageModelParams } from '../utils/imageSpecialParams';
import { SCHEME_QUICK_BAR_MAX, isQuickBarEligible } from '../utils/schemeQuickBar';
import { sortModelsByBrandMaxThenOrder } from '../utils/sortModelsByScheme';

import { isSingleCountParam } from '../components/SchemeParamFields';

function isImagePlaygroundModel(m: PlaygroundModel): boolean {
  const t = (m.scheme_type || m.type_name || '').toLowerCase();
  return t === 'image' || t.includes('image') || t.includes('图');
}

function isPromptLikeParam(p: SchemeParam): boolean {
  const k = (p.key || '').toLowerCase();
  return (
    k === 'prompt' ||
    k === 'negative_prompt' ||
    k === 'negativeprompt' ||
    (p as { type?: string }).type === 'textarea'
  );
}

/** 方案控件参数（排除提示词类） */
export function getDisplayParams(model?: PlaygroundModel | null): SchemeParam[] {
  if (!model?.params || !Array.isArray(model.params)) return [];
  return model.params.filter((p) => !isPromptLikeParam(p));
}

/** 快捷栏参数：方案勾选 + 可做成选项条，顺序即 params 列表顺序，最多 3 个 */
function getQuickBarParams(model?: PlaygroundModel | null): SchemeParam[] {
  return getDisplayParams(model)
    .filter((p) => !!p.quick && isQuickBarEligible(p) && !isSingleCountParam(p))
    .slice(0, SCHEME_QUICK_BAR_MAX);
}

/** 未进快捷栏的方案参数（独立页不再重复展示，且过滤数量为1的参数） */
function getNonQuickBarParams(model?: PlaygroundModel | null): SchemeParam[] {
  const quickKeys = new Set(getQuickBarParams(model).map((p) => p.key));
  return getDisplayParams(model).filter((p) => !quickKeys.has(p.key) && !isSingleCountParam(p));
}

function initParamDefaults(params: SchemeParam[]): Record<string, any> {
  return initSchemeParamDefaults(params);
}

/** 从参数值推导展示用比例（卡片 aspect-ratio） */
export function deriveAspectRatio(paramValues: Record<string, any>): string {
  const candidates = [
    paramValues.size,
    paramValues.ratio,
    paramValues.aspect_ratio,
    paramValues.aspectRatio,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^\d+\s*:\s*\d+$/.test(c.trim())) {
      return c.trim().replace(/\s/g, '');
    }
    if (typeof c === 'string') {
      const m = c.match(/(\d+)\s*[xX*]\s*(\d+)/);
      if (m) {
        const w = Number(m[1]);
        const h = Number(m[2]);
        if (w > 0 && h > 0) {
          const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
          const d = g(w, h);
          return `${w / d}:${h / d}`;
        }
      }
    }
  }
  return '1:1';
}

export function usePlaygroundImageModels() {
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [defaultModelMids, setDefaultModelMids] = useState<string[]>([]);
  const [modelConfigs, setModelConfigs] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, configsRes] = await coalesceAsync('pg2026:image-models', () =>
        Promise.all([
          request.get('/plugins/playground_2026/playground-public-config') as Promise<any>,
          request.get('/playground-2026/model-configs').catch(() => ({ configs: [] })) as Promise<any>,
        ]),
      );

      const rawDefaultModelMids = configRes?.default_model_mids;
      let midsArray: string[] = [];
      if (Array.isArray(rawDefaultModelMids)) {
        midsArray = rawDefaultModelMids;
      } else if (typeof rawDefaultModelMids === 'object' && rawDefaultModelMids !== null) {
        midsArray = Object.values(rawDefaultModelMids).filter((v) => typeof v === 'string') as string[];
      }
      const defaultMidsSet = new Set(midsArray.map(String));

      const enabled: PlaygroundModel[] = Array.isArray(configRes?.models)
        ? configRes.models.map((m: any) => ({
            ...m,
            is_default: typeof m.is_default === 'boolean' ? m.is_default : defaultMidsSet.has(String(m.mid)),
          }))
        : [];
      const imageModels = sortModelsByBrandMaxThenOrder(
        enabled.filter(isImagePlaygroundModel),
      );

      const configMap: Record<string, Record<string, any>> = {};
      if (Array.isArray(configsRes?.configs)) {
        for (const item of configsRes.configs) {
          try {
            configMap[item.model_mid] = JSON.parse(item.param_values);
          } catch {
            // ignore bad lock payload
          }
        }
      }

      setModels(imageModels);
      setDefaultModelMids(midsArray);
      setModelConfigs(configMap);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || '加载模型失败');
      setModels([]);
      setDefaultModelMids([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const getInitialParams = useCallback(
    (model: PlaygroundModel): Record<string, any> => {
      const locked = modelConfigs[model.mid];
      const base = initParamDefaults(model.params || []);
      const merged =
        locked && typeof locked === 'object'
          ? clampImageModelParams({ ...base, ...locked }, model)
          : base;
      if (merged.background === 'transparent' || !!merged.layer_decomposition) {
        merged.output_format = 'png';
      }
      return merged;
    },
    [modelConfigs],
  );

  return useMemo(
    () => ({ models, defaultModelMids, modelConfigs, loading, error, reload, getInitialParams }),
    [models, defaultModelMids, modelConfigs, loading, error, reload, getInitialParams],
  );
}
