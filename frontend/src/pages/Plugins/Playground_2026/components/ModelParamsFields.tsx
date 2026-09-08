/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaygroundModel } from '../types';
import { getDisplayParams } from '../hooks/usePlaygroundImageModels';
import { filterSizeOptionsForCurrentMode } from '../utils/imageGenerationApi';
import {
  composeImageSpecialDefaults,
  imageSpecialHasControls,
  imageSpecialParamKeys,
  imageSpecialRestParams,
} from '../utils/imageSpecialParams';
import SchemeParamFields from './SchemeParamFields';
import ImageSpecialParamsFields from './ImageSpecialParamsFields';
import './ModelSettingsPanel.css';

export type ModelParamsFieldsProps = {
  currentModel: PlaygroundModel | null;
  paramValues: Record<string, any>;
  onParamChange: (key: string, value: any) => void;
  emptyClassName?: string;
};

const ModelParamsFields: React.FC<ModelParamsFieldsProps> = ({
  currentModel,
  paramValues,
  onParamChange,
  emptyClassName = 'hf-msp-empty',
}) => {
  const { t } = useTranslation();
  const displayParams = useMemo(() => {
    const params = getDisplayParams(currentModel);
    return filterSizeOptionsForCurrentMode(params, !!paramValues?.layer_decomposition);
  }, [currentModel, paramValues?.layer_decomposition]);
  const specialOn = imageSpecialHasControls(currentModel?.image_special_params);
  const restParams = useMemo(
    () => imageSpecialRestParams(displayParams, currentModel),
    [displayParams, currentModel],
  );

  const resetParams = () => {
    if (!currentModel) return;
    const skip = new Set(imageSpecialParamKeys(currentModel.image_special_params));
    for (const p of getDisplayParams(currentModel)) {
      if (skip.has(p.key)) continue;
      onParamChange(p.key, p.default);
    }
    if (specialOn && currentModel.image_special_params) {
      const patch = composeImageSpecialDefaults(currentModel.image_special_params);
      Object.entries(patch).forEach(([key, val]) => onParamChange(key, val));
    }
  };

  if (!currentModel) {
    return (
      <div className={emptyClassName}>
        {t('playground_2026:select_model_first', '请先选择模型')}
      </div>
    );
  }
  if (!specialOn && displayParams.length === 0) {
    return (
      <div className={emptyClassName}>
        {t('playground_2026:no_scheme_params', '该方案暂无可配置参数')}
      </div>
    );
  }

  return (
    <>
      <div className="hf-msp-field-head">
        <span className="hf-msp-field-label">{currentModel.name}</span>
        <button type="button" className="hf-msp-reset" onClick={resetParams}>
          {t('playground_2026:reset_params', '重置')}
        </button>
      </div>
      {specialOn && currentModel.image_special_params ? (
        <ImageSpecialParamsFields
          config={currentModel.image_special_params}
          params={currentModel.params}
          values={paramValues}
          onChange={onParamChange}
          layerSplitOn={!!paramValues?.layer_decomposition}
        />
      ) : null}
      {restParams.length > 0 ? (
        <SchemeParamFields
          params={restParams}
          values={paramValues}
          onChange={onParamChange}
          hideTitle
          schemeName={currentModel.name}
        />
      ) : null}
    </>
  );
};

export default ModelParamsFields;
