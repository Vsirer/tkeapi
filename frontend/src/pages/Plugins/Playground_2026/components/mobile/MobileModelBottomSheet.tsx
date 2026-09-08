/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CloseOutlined, SearchOutlined, CheckOutlined } from '../../ui';
import type { PlaygroundModel } from '../../types';
import {
  modelBrandLabel,
  sortBrandLabelsByMaxOrder,
  sortModelsByBrandMaxThenOrder,
} from '../../utils/sortModelsByScheme';
import ModelParamsFields from '../ModelParamsFields';
import ModelFeaturesHint from '../ModelFeaturesHint';
import ModelLogoIcon from '../ModelLogoIcon';
import useSettingsStore from '../../../../../store/settings';
import './MobileModelBottomSheet.css';

export type MobileModelBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  models: PlaygroundModel[];
  currentModel: PlaygroundModel | null;
  selectedMid?: string;
  onSelectModel: (model: PlaygroundModel) => void;
  paramValues: Record<string, any>;
  onParamChange: (key: string, value: any) => void;
  loading?: boolean;
  searchInputProps: React.InputHTMLAttributes<HTMLInputElement> & { value?: string };
  filteredModels: PlaygroundModel[];
  emptyText?: string;
  showConfig?: boolean;
  panelContent?: 'models' | 'params' | 'both';
};

function resolvePanelContent(
  panelContent?: 'models' | 'params' | 'both',
  showConfig?: boolean,
): 'models' | 'params' | 'both' {
  if (panelContent) return panelContent;
  return showConfig === false ? 'models' : 'both';
}

const MobileModelBottomSheet: React.FC<MobileModelBottomSheetProps> = ({
  open,
  onClose,
  models,
  currentModel,
  selectedMid,
  onSelectModel,
  paramValues,
  onParamChange,
  loading,
  searchInputProps,
  filteredModels,
  emptyText,
  showConfig = true,
  panelContent: panelContentProp,
}) => {
  const { t } = useTranslation();
  const panelContent = resolvePanelContent(panelContentProp, showConfig);
  const showModelsPane = panelContent !== 'params';
  const showParamsPane = panelContent !== 'models';
  const showTabs = panelContent === 'both';
  const [activeTab, setActiveTab] = useState<'models' | 'params'>('models');
  const [brandFilter, setBrandFilter] = useState('');
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const formatPrice = (price: number | string | undefined | null) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);
    if (isNaN(num)) return String(price);
    return `${currencySymbol}${num}`;
  };

  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const m of models) {
      const label = modelBrandLabel(m);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      list.push(label);
    }
    return sortBrandLabelsByMaxOrder(models, list);
  }, [models]);

  const brandLogoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of models) {
      const label = modelBrandLabel(m);
      if (!label) continue;
      if (!map.has(label)) {
        const logo = (m as any).provider_logo || m.logo || '';
        if (logo) map.set(label, logo);
      }
    }
    return map;
  }, [models]);

  const visibleModels = useMemo(() => {
    const base = !brandFilter
      ? filteredModels
      : filteredModels.filter((m) => modelBrandLabel(m) === brandFilter);
    return sortModelsByBrandMaxThenOrder(base);
  }, [filteredModels, brandFilter]);

  useEffect(() => {
    if (open) {
      setActiveTab(panelContent === 'params' ? 'params' : 'models');
    }
  }, [open, panelContent]);

  if (!open) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const currentY = e.touches[0].clientY;
    // 下滑超过 80px 自动收起抽屉
    if (currentY - touchStartY > 80) {
      onClose();
      setTouchStartY(null);
    }
  };

  const content = (
    <div
      className="pg-ui-root"
      data-theme={
        typeof document !== 'undefined' &&
        document.querySelector('.pg-ui-root[data-theme]')?.getAttribute('data-theme') ===
          'light'
          ? 'light'
          : 'dark'
      }
    >
      <div className="pg-mob-sheet-overlay" onClick={onClose} />
      <div
        className="pg-mob-sheet-container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 顶部抓手区（支持下滑手势） */}
        <div
          className="pg-mob-sheet-drag-handle-wrap"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          <div className="pg-mob-sheet-drag-handle" />
        </div>

        {/* 标题栏 */}
        <div className="pg-mob-sheet-header">
          <div className="pg-mob-sheet-title-wrap">
            <h3 className="pg-mob-sheet-title">
              {panelContent === 'params'
                ? t('playground_2026:tab_params', '模型属性')
                : panelContent === 'models'
                  ? t('playground_2026:tab_models', '选择模型')
                  : t('playground_2026:model_settings', '模型设置')}
            </h3>
            {currentModel && (
              <div className="pg-mob-sheet-title-model" title={currentModel.name}>
                <ModelLogoIcon
                  logo={currentModel.logo}
                  size={16}
                  fallbackLetter={currentModel.name}
                  className="pg-mob-title-model-logo"
                />
                <span className="pg-mob-title-model-name">{currentModel.name}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="pg-mob-sheet-close-btn"
            onClick={onClose}
            aria-label={t('common.close', '关闭')}
          >
            <CloseOutlined />
          </button>
        </div>

        {/* 双 Tab 切换（仅当开启参数配置时展示） */}
        {showTabs && (
          <div className="pg-mob-sheet-tabs">
            <button
              type="button"
              className={`pg-mob-sheet-tab${activeTab === 'models' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('models')}
            >
              {t('playground_2026:tab_models', '选择模型')}
            </button>
            <button
              type="button"
              className={`pg-mob-sheet-tab${activeTab === 'params' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('params')}
            >
              {t('playground_2026:tab_params', '模型属性')}
            </button>
          </div>
        )}

        {/* 内容区 */}
        <div className="pg-mob-sheet-body">
          {(showModelsPane && (!showTabs || activeTab === 'models')) && (
            <div className="pg-mob-models-pane">
              {/* 搜索栏 */}
              <div className="pg-mob-search-wrap">
                <SearchOutlined className="pg-mob-search-icon" />
                <input
                  type="text"
                  placeholder={t('playground_2026:search_models_ph', '搜索模型…')}
                  {...searchInputProps}
                  value={searchInputProps.value || ''}
                  className="pg-mob-search-input"
                />
              </div>

              {/* 服务商快捷过滤胶囊横向滚动 */}
              {brandOptions.length > 0 && (
                <div className="pg-mob-brand-scroll">
                  <button
                    type="button"
                    className={`pg-mob-brand-chip${!brandFilter ? ' is-active' : ''}`}
                    onClick={() => setBrandFilter('')}
                  >
                    {t('playground_2026:all_brands', '全部服务商')}
                  </button>
                  {brandOptions.map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      className={`pg-mob-brand-chip${brandFilter === brand ? ' is-active' : ''}`}
                      onClick={() => setBrandFilter(brandFilter === brand ? '' : brand)}
                    >
                      <ModelLogoIcon
                        logo={brandLogoMap.get(brand)}
                        size={14}
                        fallbackLetter={brand}
                      />
                      <span>{brand}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 模型单列卡片列表 */}
              <div className="pg-mob-models-list">
                {visibleModels.length === 0 ? (
                  <div className="pg-mob-empty-tip">
                    {emptyText || t('playground_2026:image_gen_no_model', '暂无匹配的模型')}
                  </div>
                ) : (
                  visibleModels.map((m) => {
                    const isSelected = selectedMid ? m.mid === selectedMid : currentModel?.mid === m.mid;
                    const desc = m.desc || m.description;
                    return (
                      <ModelFeaturesHint
                        key={m.mid || m.name}
                        model={m}
                        currencySymbol={currencySymbol}
                        formatPrice={formatPrice}
                      >
                        <button
                          type="button"
                          className={`pg-mob-model-card${isSelected ? ' is-selected' : ''}`}
                          onClick={() => {
                            onSelectModel(m);
                            if (showTabs) {
                              setActiveTab('params');
                            } else {
                              onClose();
                            }
                          }}
                        >
                          <ModelLogoIcon
                            logo={m.logo}
                            size={40}
                            fallbackLetter={m.name}
                            className="pg-mob-model-logo"
                          />
                          <div className="pg-mob-model-card-info">
                            <div className="pg-mob-model-card-title">{m.name}</div>
                            {desc && <div className="pg-mob-model-card-desc">{desc}</div>}
                          </div>
                          {isSelected && (
                            <div className="pg-mob-model-card-check">
                              <CheckOutlined />
                            </div>
                          )}
                        </button>
                      </ModelFeaturesHint>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {showParamsPane && (!showTabs || activeTab === 'params') && (
            <div className="pg-mob-params-pane">
              <ModelParamsFields
                currentModel={currentModel}
                paramValues={paramValues}
                onParamChange={onParamChange}
                emptyClassName="pg-mob-empty-tip"
              />
            </div>
          )}
        </div>

        {/* 底部固定确认栏 */}
        <div className="pg-mob-sheet-footer">
          <button type="button" className="pg-mob-sheet-submit-btn" onClick={onClose}>
            {t('common.confirm', '确定')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default MobileModelBottomSheet;
