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
import { clampParamsToSchemeOptions, initSchemeParamDefaults } from '../utils/generationParams';
import {
  type ModelFeature,
  videoFeatures,
  videoFeaturesFromCatalog,
} from '../config/modelFeatures';
import { SCHEME_QUICK_BAR_MAX, isQuickBarEligible } from '../utils/schemeQuickBar';
import { sortModelsByBrandMaxThenOrder } from '../utils/sortModelsByScheme';
import { isSingleCountParam, isDurationParam, isAspectParam } from '../components/SchemeParamFields';

export { deriveAspectRatio } from './usePlaygroundImageModels';

function isVideoPlaygroundModel(m: PlaygroundModel): boolean {
  const t = (m.scheme_type || m.type_name || '').toLowerCase();
  return t === 'video' || t.includes('video') || t.includes('视频');
}

function initParamDefaults(params: PlaygroundModel['params']): Record<string, any> {
  return initSchemeParamDefaults(params);
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

export const isResolutionParam = (param: SchemeParam): boolean => {
  const k = (param.key || '').toLowerCase();
  const label = (param.label || '').toLowerCase();
  return (
    k.includes('res') ||
    k.includes('qual') ||
    label.includes('清晰度') ||
    label.includes('分辨率') ||
    label.includes('画质') ||
    (Array.isArray(param.options) &&
      param.options.some((o) => /(480p|720p|1080p|2k|4k|hd|sd)/i.test(String(o))))
  );
};

/** 滑块不吃 options：后台从下拉改成滑块后，残留选项会把时长又渲染成下拉并丢掉 max */
function normalizeVideoParam(p: SchemeParam): SchemeParam {
  if ((p.type === 'slider' || p.type === 'number') && Array.isArray(p.options) && p.options.length > 0) {
    return { ...p, options: undefined };
  }
  return p;
}

function isDurationRangeParam(p: SchemeParam): boolean {
  return isDurationParam(p) && (p.type === 'slider' || p.type === 'number');
}

/** 视频方案控件参数（排除提示词类，并规范化时长参数） */
function getVideoDisplayParams(model?: PlaygroundModel | null): SchemeParam[] {
  if (!model?.params || !Array.isArray(model.params)) return [];
  return model.params
    .filter((p) => !isPromptLikeParam(p))
    .map(normalizeVideoParam);
}

/** 视频快捷栏：时长（滑块或下拉）始终上栏；其余仅方案勾选的单选/下拉。时长优先，再到比例、清晰度，最多 3 个 */
export function getQuickBarParams(model?: PlaygroundModel | null): SchemeParam[] {
  const display = getVideoDisplayParams(model);
  const eligible = display.filter((p) => {
    if (isSingleCountParam(p)) return false;
    if (isDurationRangeParam(p)) return true;
    if (isDurationParam(p) && isQuickBarEligible(p)) return true;
    return !!p.quick && isQuickBarEligible(p);
  });

  const getPriority = (p: SchemeParam): number => {
    if (isDurationParam(p)) return 0;
    if (isAspectParam(p)) return 1;
    if (isResolutionParam(p)) return 2;
    return 3;
  };

  return eligible
    .slice()
    .sort((a, b) => getPriority(a) - getPriority(b))
    .slice(0, SCHEME_QUICK_BAR_MAX);
}

/** 未进快捷栏的视频方案参数（避免下方表单重复展示） */
export function getNonQuickBarParams(model?: PlaygroundModel | null): SchemeParam[] {
  const quickKeys = new Set(getQuickBarParams(model).map((p) => p.key));
  return getVideoDisplayParams(model).filter(
    (p) => !quickKeys.has(p.key) && !isSingleCountParam(p),
  );
}

export function usePlaygroundVideoModels() {
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [defaultModelMids, setDefaultModelMids] = useState<string[]>([]);
  const [videoFeaturesList, setVideoFeaturesList] = useState<ModelFeature[]>(() => videoFeatures());
  const [modelConfigs, setModelConfigs] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, configsRes] = await coalesceAsync('pg2026:video-models', () =>
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
      const videoModels = sortModelsByBrandMaxThenOrder(
        enabled
          .filter(isVideoPlaygroundModel)
          .map((m) => ({
            ...m,
            feature_keys: Array.isArray(m.feature_keys) ? m.feature_keys : [],
          })),
      );
      setVideoFeaturesList(videoFeaturesFromCatalog(configRes?.feature_catalog));

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

      setModels(videoModels);
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
      if (locked && typeof locked === 'object') {
        return clampParamsToSchemeOptions({ ...base, ...locked }, model.params);
      }
      return base;
    },
    [modelConfigs],
  );

  return useMemo(
    () => ({
      models,
      defaultModelMids,
      videoFeatures: videoFeaturesList,
      modelConfigs,
      loading,
      error,
      reload,
      getInitialParams,
    }),
    [models, defaultModelMids, videoFeaturesList, modelConfigs, loading, error, reload, getInitialParams],
  );
}
