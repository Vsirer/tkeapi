/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Imagine.art /image Settings：模型选择 + 当前模型方案参数（左右双栏）
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseOutlined, DownOutlined, RightOutlined, SearchOutlined } from '../ui';
import { useTranslation } from 'react-i18next';
import type { PlaygroundModel } from '../types';
import { getDisplayParams } from '../hooks/usePlaygroundImageModels';
import { filterSizeOptionsForCurrentMode } from '../utils/imageGenerationApi';
import {
  modelBrandLabel,
  sortBrandLabelsByMaxOrder,
  sortModelsByBrandMaxThenOrder,
} from '../utils/sortModelsByScheme';
import { isAspectParam } from './SchemeParamFields';
import ModelParamsFields from './ModelParamsFields';
import MobileModelBottomSheet from './mobile/MobileModelBottomSheet';
import ModelFeaturesHint from './ModelFeaturesHint';
import ModelLogoIcon from './ModelLogoIcon';
import useSettingsStore from '../../../../store/settings';
import {
  formatImageParamsTriggerLabel,
  imageSpecialHasControls,
  isSmartRatio,
  parseImageSpecialState,
} from '../utils/imageSpecialParams';
import './ModelSettingsPanel.css';

export {
  isAspectParam,
  isCountParam,
  isSingleCountParam,
  formatParamLabel,
  formatParamHint,
  formatGroupLabel,
} from './SchemeParamFields';

export type ModelSettingsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: PlaygroundModel[];
  currentModel: PlaygroundModel | null;
  selectedMid?: string;
  onSelectModel: (model: PlaygroundModel) => void;
  paramValues: Record<string, any>;
  onParamChange: (key: string, value: any) => void;
  loading?: boolean;
  disabled?: boolean;
  /** 模型搜索（受控，便于外层 IME 防抖） */
  searchInputProps: React.InputHTMLAttributes<HTMLInputElement> & { value?: string };
  filteredModels: PlaygroundModel[];
  /** 面板弹出方向：底栏向上 / 左栏向右（均走 Imagine 居中浮层） */
  placement?: 'top' | 'right';
  emptyText?: string;
  /** 触发器文案：full=模型+关键参数摘要；modelOnly=仅模型名（对齐 Imagine） */
  summaryMode?: 'full' | 'modelOnly';
  /** 视频页：弹层只选模型，参数放到快捷栏下方 */
  showConfig?: boolean;
  /** models=仅列表；params=仅属性；both=双栏。未传时 showConfig===false 视为 models */
  panelContent?: 'models' | 'params' | 'both';
};

function resolvePanelContent(
  panelContent?: 'models' | 'params' | 'both',
  showConfig?: boolean,
): 'models' | 'params' | 'both' {
  if (panelContent) return panelContent;
  return showConfig === false ? 'models' : 'both';
}

function triggerAspectStyle(val: unknown): React.CSSProperties {
  const fallback: React.CSSProperties = { width: 12, height: 12 };
  if (val == null) return fallback;
  const s = String(val).trim();
  if (s === 'adaptive' || s === 'auto' || s === '相似比例') {
    return { width: 14, height: 10, borderStyle: 'dashed' };
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:xX*×：]\s*(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!(w > 0 && h > 0)) return fallback;
  const maxSide = 15;
  const minSide = 6;
  if (Math.abs(w - h) < 0.001) return fallback;
  if (w > h) {
    return {
      width: w / h < 1.35 ? 14 : maxSide,
      height: Math.max(minSide, Math.min(13, Math.round(maxSide * (h / w)))),
    };
  }
  return {
    width: Math.max(minSide, Math.min(13, Math.round(maxSide * (w / h)))),
    height: h / w < 1.35 ? 14 : maxSide,
  };
}

export function getModelTriggerSummary(
  model: PlaygroundModel | null,
  paramValues: Record<string, any>,
  fallbackName: string,
): string {
  const name = model?.name || fallbackName;
  const params = getDisplayParams(model);
  const aspect = params.find(isAspectParam);
  if (aspect) {
    const v = paramValues[aspect.key] ?? aspect.default;
    if (v !== undefined && v !== null && v !== '') return `${name} / ${v}`;
  }
  return name;
}

function computePanelStyle(
  trigger: HTMLElement | null,
  placement: 'top' | 'right',
  content: 'models' | 'params' | 'both',
): React.CSSProperties {
  const panelW =
    content === 'both'
      ? Math.min(960, window.innerWidth - 24)
      : content === 'params'
        ? Math.min(520, window.innerWidth - 24)
        : Math.min(440, window.innerWidth - 24);
  let panelH = Math.min(650, Math.round(window.innerHeight * 0.8));
  const gap = 12;
  const pad = 12;

  if (placement === 'right') {
    const r = trigger?.getBoundingClientRect();
    const vg = document.querySelector('.hf-vg-panel') as HTMLElement | null;
    const vr = vg?.getBoundingClientRect();

    let left: number;
    if (vr) {
      // 优先落在左栏右侧的画廊区域；空间不够再贴视口右缘
      const prefer = Math.round(vr.right + gap);
      left =
        prefer + panelW <= window.innerWidth - pad
          ? prefer
          : Math.max(pad, window.innerWidth - panelW - pad);
    } else {
      left = r ? Math.round(r.right + gap) : pad;
      if (left + panelW > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - panelW - pad);
      }
    }

    // 垂直：尽量对齐触发器，整体钳在视口内
    let top = r ? Math.round(r.top - 8) : pad;
    if (top + panelH > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - panelH - pad);
    }
    if (top < pad) top = pad;

    return {
      position: 'fixed',
      top,
      left,
      width: panelW,
      height: panelH,
      zIndex: 1200,
    };
  }

  // 图片底栏：位于提示词输入框（.hf-ig-dock / .hf-ig-dock-wrap）正上方，水平居中对齐，不遮挡输入框
  const dock = (trigger?.closest('.hf-ig-dock, .hf-ig-dock-wrap') ||
    document.querySelector('.hf-ig-dock, .hf-ig-dock-wrap')) as HTMLElement | null;
  const r = trigger?.getBoundingClientRect();
  const dockRect = dock?.getBoundingClientRect();

  let left: number;
  let top: number;

  if (dockRect) {
    const dockCenter = dockRect.left + dockRect.width / 2;
    left = Math.round(dockCenter - panelW / 2);
    const maxH = Math.max(240, Math.round(dockRect.top - gap - pad));
    panelH = Math.min(panelH, maxH);
    top = Math.round(dockRect.top - panelH - gap);
  } else if (r) {
    left = Math.round(r.left);
    const maxH = Math.max(240, Math.round(r.top - gap - pad));
    panelH = Math.min(panelH, maxH);
    top = Math.round(r.top - panelH - gap);
  } else {
    left = Math.round((window.innerWidth - panelW) / 2);
    top = Math.round((window.innerHeight - panelH) / 2);
  }

  if (left + panelW > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - panelW - pad);
  }
  if (left < pad) left = pad;
  if (top < pad) top = pad;

  return {
    position: 'fixed',
    top,
    left,
    width: panelW,
    height: panelH,
    zIndex: 1200,
  };
}

const ModelSettingsPanel: React.FC<ModelSettingsPanelProps> = ({
  open,
  onOpenChange,
  models,
  currentModel,
  selectedMid,
  onSelectModel,
  paramValues,
  onParamChange,
  loading,
  disabled,
  searchInputProps,
  filteredModels,
  placement = 'top',
  emptyText,
  summaryMode = 'full',
  showConfig = true,
  panelContent: panelContentProp,
}) => {
  const { t } = useTranslation();
  const panelContent = resolvePanelContent(panelContentProp, showConfig);
  const showModels = panelContent !== 'params';
  const showParams = panelContent !== 'models';
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const brandFilterRef = useRef<HTMLDivElement>(null);
  const [fixedStyle, setFixedStyle] = useState<React.CSSProperties | undefined>();
  const [brandFilter, setBrandFilter] = useState('');
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const formatPrice = (price: number | string | undefined | null) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);
    if (isNaN(num)) return String(price);
    return `${currencySymbol}${num}`;
  };

  const displayParams = useMemo(() => {
    const params = getDisplayParams(currentModel);
    return filterSizeOptionsForCurrentMode(params, !!paramValues?.layer_decomposition);
  }, [currentModel, paramValues?.layer_decomposition]);

  const specialOn = imageSpecialHasControls(currentModel?.image_special_params);
  const paramsTriggerLabel = useMemo(
    () =>
      formatImageParamsTriggerLabel(
        currentModel,
        displayParams,
        paramValues,
        t('playground_2026:tab_params', '模型属性'),
      ),
    [currentModel, displayParams, paramValues, t],
  );
  const paramsAspectVal = useMemo(() => {
    if (specialOn && currentModel) {
      const state = parseImageSpecialState(
        paramValues,
        currentModel.image_special_params || {},
      );
      if (state.customPixels) return `${state.width}x${state.height}`;
      if (isSmartRatio(state.ratio)) return t('playground_2026:image_special_smart', '智能');
      return state.ratio;
    }
    const aspect = displayParams.find(isAspectParam) || displayParams[0];
    if (!aspect) return undefined;
    return paramValues[aspect.key] ?? aspect.default;
  }, [specialOn, currentModel, displayParams, paramValues]);

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

  const noModelLabel = emptyText || t('playground_2026:image_gen_no_model', '无模型');
  const triggerLabel =
    summaryMode === 'modelOnly'
      ? currentModel?.name || noModelLabel
      : getModelTriggerSummary(currentModel, paramValues, noModelLabel);

  useLayoutEffect(() => {
    if (!open) {
      setFixedStyle(undefined);
      return undefined;
    }
    const update = () => {
      setFixedStyle(computePanelStyle(wrapRef.current, placement, panelContent));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, placement, panelContent]);

  useEffect(() => {
    if (!open) {
      setBrandFilter('');
      setBrandMenuOpen(false);
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (brandMenuOpen) {
          setBrandMenuOpen(false);
          return;
        }
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, brandMenuOpen]);

  useEffect(() => {
    if (!brandMenuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (brandFilterRef.current?.contains(target)) return;
      setBrandMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [brandMenuOpen]);

  const panelBody = (
    <>
      <header className="hf-msp-header">
        <h3 className="hf-msp-header-title">
          {panelContent === 'params'
            ? t('playground_2026:tab_params', '模型属性')
            : panelContent === 'models'
              ? t('playground_2026:tab_models', '选择模型')
              : t('playground_2026:model_settings', '设置')}
        </h3>
        <button
          type="button"
          className="hf-msp-close"
          onClick={() => onOpenChange(false)}
          aria-label={t('playground_2026:close', '关闭')}
          title={t('playground_2026:close', '关闭')}
        >
          <CloseOutlined />
        </button>
      </header>
      <div
        className={`hf-msp-body${panelContent === 'models' ? ' is-models-only' : ''}${panelContent === 'params' ? ' is-params-only' : ''}`}
      >
        {showModels ? (
        <aside className="hf-msp-models">
          <div className="hf-msp-search-row">
            <div className="hf-msp-search">
              <SearchOutlined className="hf-msp-search-icon" />
              <input
                {...searchInputProps}
                placeholder={t('playground_2026:search_model', '搜索模型')}
              />
            </div>
            {brandOptions.length > 0 && (
              <div className="hf-msp-scheme-filter" ref={brandFilterRef}>
                <button
                  type="button"
                  className={`hf-msp-filter-btn${brandFilter ? ' is-active' : ''}${brandMenuOpen ? ' is-open' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={brandMenuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBrandMenuOpen((v) => !v);
                  }}
                >
                  {brandFilter && (
                    <ModelLogoIcon
                      logo={brandLogoMap.get(brandFilter)}
                      size={16}
                      fallbackLetter={brandFilter}
                    />
                  )}
                  <span className="hf-msp-filter-btn-text">
                    {brandFilter || t('playground_2026:brand_filter', '模型服务商')}
                  </span>
                  <DownOutlined className="hf-msp-filter-caret" />
                </button>
                {brandMenuOpen && (
                  <div className="hf-msp-filter-menu" role="listbox">
                    <button
                      type="button"
                      role="option"
                      aria-selected={!brandFilter}
                      className={`hf-msp-filter-option${!brandFilter ? ' selected' : ''}`}
                      onClick={() => {
                        setBrandFilter('');
                        setBrandMenuOpen(false);
                      }}
                    >
                      <span className="hf-msp-filter-option-all-icon" aria-hidden>☰</span>
                      <span>{t('playground_2026:brand_filter_all', '全部服务商')}</span>
                    </button>
                    {brandOptions.map((label) => (
                      <button
                        key={label}
                        type="button"
                        role="option"
                        aria-selected={brandFilter === label}
                        className={`hf-msp-filter-option${brandFilter === label ? ' selected' : ''}`}
                        title={label}
                        onClick={() => {
                          setBrandFilter(label);
                          setBrandMenuOpen(false);
                        }}
                      >
                        <ModelLogoIcon
                          logo={brandLogoMap.get(label)}
                          size={16}
                          fallbackLetter={label}
                        />
                        <span className="hf-msp-filter-option-label">{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="hf-msp-models-list">
            {visibleModels.length === 0 ? (
              <div className="hf-msp-empty">
                {emptyText || t('playground_2026:image_gen_no_model', '暂无可用模型')}
              </div>
            ) : (
              visibleModels.map((m) => {
                const selected = selectedMid === m.mid || currentModel?.mid === m.mid;
                const desc = (m.description || '').trim();
                return (
                  <ModelFeaturesHint
                    key={m.mid}
                    model={m}
                    currencySymbol={currencySymbol}
                    formatPrice={formatPrice}
                  >
                    <button
                      type="button"
                      className={`hf-msp-model-card${selected ? ' selected' : ''}`}
                      onClick={() => {
                        onSelectModel(m);
                        if (!showParams) onOpenChange(false);
                      }}
                    >
                      <div className="hf-msp-model-logo-wrap">
                        <span className="hf-msp-model-logo-box">
                          <ModelLogoIcon
                            logo={m.logo}
                            className="hf-msp-model-logo"
                            size={20}
                            fallbackLetter={m.name || '?'}
                          />
                        </span>
                      </div>
                      <div className="hf-msp-model-meta">
                        <strong className="hf-msp-model-name">{m.name}</strong>
                        {desc ? <span className="hf-msp-model-desc">{desc}</span> : null}
                      </div>
                    </button>
                  </ModelFeaturesHint>
                );
              })
            )}
          </div>
        </aside>
        ) : null}

        {showParams ? (
          <section className="hf-msp-config">
            <ModelParamsFields
              currentModel={currentModel}
              paramValues={paramValues}
              onParamChange={onParamChange}
            />
          </section>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={`hf-msp-wrap${open ? ' is-open' : ''}${placement === 'right' ? ' place-right' : ''}${panelContent === 'params' ? ' is-params' : ''}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className={`hf-ig-chip hf-msp-trigger${open ? ' active-pop' : ''}${panelContent === 'params' ? ' is-params' : ''}`}
        disabled={disabled || loading || models.length === 0}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        title={panelContent === 'params' ? paramsTriggerLabel : triggerLabel}
      >
        {panelContent === 'params' ? (
          <span className="hf-ig-chip-shape" style={triggerAspectStyle(paramsAspectVal)} aria-hidden />
        ) : (
          <ModelLogoIcon
            logo={currentModel?.logo}
            size={16}
            fallbackLetter={currentModel?.name || '?'}
          />
        )}
        <span className="hf-msp-trigger-text">
          {loading
            ? t('common.loading', '加载中…')
            : panelContent === 'params'
              ? paramsTriggerLabel
              : triggerLabel}
        </span>
        {placement === 'right' ? (
          <RightOutlined className="hf-ig-chip-caret hf-msp-trigger-chevron" />
        ) : (
          <DownOutlined className="hf-ig-chip-caret" />
        )}
      </button>

      {open &&
        (isMobile ? (
          <MobileModelBottomSheet
            open={open}
            onClose={() => onOpenChange(false)}
            models={models}
            currentModel={currentModel}
            selectedMid={selectedMid}
            onSelectModel={onSelectModel}
            paramValues={paramValues}
            onParamChange={onParamChange}
            loading={loading}
            searchInputProps={searchInputProps}
            filteredModels={filteredModels}
            emptyText={emptyText}
            showConfig={showParams}
            panelContent={panelContent}
          />
        ) : (
          createPortal(
            // Portal 挂到 body 会脱离 .pg-ui-root，需自带主题根以继承 Switch 等 CSS 变量
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
              <div className="hf-msp-overlay" aria-hidden="true" />
              <div
                ref={panelRef}
                className="hf-msp-panel hf-msp-panel-portal"
                style={fixedStyle}
                role="dialog"
                aria-label={
                  panelContent === 'params'
                    ? t('playground_2026:tab_params', '模型属性')
                    : panelContent === 'models'
                      ? t('playground_2026:tab_models', '选择模型')
                      : t('playground_2026:model_settings', '设置')
                }
                onMouseDown={(e) => {
                  if (brandMenuOpen) {
                    const target = e.target as Node;
                    if (!brandFilterRef.current?.contains(target)) {
                      setBrandMenuOpen(false);
                    }
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {panelBody}
              </div>
            </div>,
            document.body,
          )
        ))}
    </div>
  );
};

export default ModelSettingsPanel;
