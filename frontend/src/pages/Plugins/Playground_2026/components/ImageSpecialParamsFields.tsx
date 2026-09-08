/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { InputNumber } from '../ui';
import type { ImageSpecialParamsConfig, SchemeParam } from '../types';
import {
  clampEditedPixel,
  composeImageSpecialValues,
  isCustomSizeEnabled,
  isSmartRatio,
  lookupPixelSize,
  normalizeImageSpecialParams,
  parseImageSpecialState,
} from '../utils/imageSpecialParams';

type Props = {
  config: ImageSpecialParamsConfig;
  params?: SchemeParam[] | null;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  layerSplitOn?: boolean;
};

const ratioLabel = (opt: string, smart: string) => (opt === 'auto' ? smart : opt);

const getRatioShapeStyle = (opt: string | number, box = 15): React.CSSProperties => {
  const optStr = String(opt);
  const match = optStr.match(/(\d+(?:\.\d+)?)\s*[xX*:：×]\s*(\d+(?:\.\d+)?)/);
  const rw = match ? parseFloat(match[1]) : 1;
  const rh = match ? parseFloat(match[2]) : 1;
  const ratio = rw > 0 && rh > 0 ? rw / rh : 1;
  const minSide = 5;
  if (Math.abs(ratio - 1) < 0.001) {
    return { width: 12, height: 12, borderRadius: 2 };
  }
  if (ratio > 1) {
    const w = Math.min(16, Math.round(box * (ratio > 2 ? 1.08 : 1)));
    const h = Math.max(minSide, Math.round(w / ratio));
    return { width: w, height: h, borderRadius: 2 };
  }
  const h = Math.min(16, Math.round(box * (1 / ratio > 2 ? 1.08 : 1)));
  const w = Math.max(minSide, Math.round(h * ratio));
  return { width: w, height: h, borderRadius: 2 };
};

const SmartRatioIcon: React.FC = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
    <rect x="6.8" y="6.8" width="3.4" height="3.4" rx="0.8" fill="currentColor" stroke="none" />
  </svg>
);

function parseLookup(px: string | null): { w: number; h: number } | null {
  if (!px) return null;
  const [w, h] = px.split(/[xX]/).map(Number);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

const ImageSpecialParamsFields: React.FC<Props> = ({
  config,
  values,
  onChange,
  layerSplitOn = false,
}) => {
  const { t } = useTranslation();
  const cfg = useMemo(() => normalizeImageSpecialParams(config), [config]);
  const state = parseImageSpecialState(values, cfg);
  const smartLabel = t('playground_2026:image_special_smart', '智能');
  const sizeLocked = layerSplitOn;
  const customOn = isCustomSizeEnabled(cfg) && !sizeLocked;
  const ratioOpts = cfg.aspect_ratio?.options || [];
  const resoOpts = cfg.resolution?.options || [];
  const fillRatio =
    ratioOpts.find((o) => !isSmartRatio(o)) ||
    (isSmartRatio(cfg.aspect_ratio?.default) ? '1:1' : String(cfg.aspect_ratio?.default || '1:1'));

  const [draftW, setDraftW] = useState<number | null | undefined>(undefined);
  const [draftH, setDraftH] = useState<number | null | undefined>(undefined);

  const commit = (next: typeof state) => {
    const patch = composeImageSpecialValues(next, cfg);
    Object.entries(patch).forEach(([key, val]) => onChange(key, val));
  };

  const pairedFromTable = (resolution: string) =>
    parseLookup(lookupPixelSize(resolution, fillRatio, cfg.image_size?.size_map)) || {
      w: 2048,
      h: 2048,
    };

  const applyWidth = (v: number) => {
    if (!customOn) return;
    const table = pairedFromTable(state.resolution);
    const h = state.height > 0 ? state.height : table.h;
    const w = clampEditedPixel({
      value: v,
      paired: h,
      dimension: 'width',
      custom: cfg.image_size?.custom,
    });
    commit({ ...state, width: w, height: h, customPixels: true });
  };

  const applyHeight = (v: number) => {
    if (!customOn) return;
    const table = pairedFromTable(state.resolution);
    const w = state.width > 0 ? state.width : table.w;
    const h = clampEditedPixel({
      value: v,
      paired: w,
      dimension: 'height',
      custom: cfg.image_size?.custom,
    });
    commit({ ...state, width: w, height: h, customPixels: true });
  };

  const finishWidth = () => {
    const v = draftW;
    setDraftW(undefined);
    if (v == null) return;
    applyWidth(v);
  };

  const finishHeight = () => {
    const v = draftH;
    setDraftH(undefined);
    if (v == null) return;
    applyHeight(v);
  };

  const showWidth = state.customPixels || (!isSmartRatio(state.ratio) && state.width > 0);
  const showHeight = state.customPixels || (!isSmartRatio(state.ratio) && state.height > 0);

  return (
    <div className="hf-msp-fields hf-isp">
      {cfg.aspect_ratio?.enabled && (
        <div className="hf-msp-field">
          <div className="hf-msp-field-head">
            <span className="hf-msp-field-label">
              {t('playground_2026:image_special_ratio', '图片比例')}
            </span>
          </div>
          <div className="hf-isp-ratio-group" role="radiogroup" aria-label={t('playground_2026:image_special_ratio', '图片比例')}>
            {ratioOpts.map((opt) => {
              const smart = opt === 'auto' || opt === '智能';
              const selected = !state.customPixels && (smart ? isSmartRatio(state.ratio) : state.ratio === opt);
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`hf-isp-ratio-card${selected ? ' selected' : ''}`}
                  disabled={sizeLocked && !smart}
                  onClick={() => {
                    if (smart) {
                      commit({ ...state, ratio: 'auto', width: 0, height: 0, customPixels: false });
                      return;
                    }
                    const px = parseLookup(lookupPixelSize(state.resolution, opt, cfg.image_size?.size_map));
                    commit({
                      ...state,
                      ratio: opt,
                      width: px?.w || state.width,
                      height: px?.h || state.height,
                      customPixels: false,
                    });
                  }}
                >
                  <span className="hf-isp-ratio-icon-slot" aria-hidden>
                    {smart ? (
                      <SmartRatioIcon />
                    ) : (
                      <span className="hf-isp-ratio-shape" style={getRatioShapeStyle(opt, 15)} />
                    )}
                  </span>
                  <span className="hf-isp-ratio-text">{ratioLabel(opt, smartLabel)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cfg.resolution?.enabled && (
        <div className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">
              {t('playground_2026:image_special_resolution', '分辨率')}
            </span>
            <div className="hf-msp-seg" role="radiogroup" aria-label={t('playground_2026:image_special_resolution', '分辨率')}>
              <div className="hf-msp-seg-pack">
                {resoOpts.map((opt) => {
                  const selected = state.resolution === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`hf-msp-seg-item${selected ? ' selected' : ''}`}
                      onClick={() => {
                        if (isSmartRatio(state.ratio)) {
                          commit({
                            ...state,
                            resolution: opt,
                            width: 0,
                            height: 0,
                            customPixels: false,
                          });
                          return;
                        }
                        const px = parseLookup(lookupPixelSize(opt, state.ratio, cfg.image_size?.size_map));
                        commit({
                          ...state,
                          resolution: opt,
                          width: px?.w || state.width,
                          height: px?.h || state.height,
                          customPixels: false,
                        });
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {cfg.image_size?.enabled && (
        <div className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">
              {t('playground_2026:image_special_size', '图片尺寸')}
            </span>
            <div className="hf-isp-size">
              <InputNumber
                className="hf-msp-text-input hf-isp-dim"
                size="small"
                step={cfg.image_size.custom?.step || 1}
                disabled={sizeLocked || !customOn}
                placeholder="--"
                value={draftW !== undefined ? draftW : showWidth ? state.width : null}
                onChange={setDraftW}
                onBlur={finishWidth}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <span className="hf-isp-times" aria-hidden>×</span>
              <InputNumber
                className="hf-msp-text-input hf-isp-dim"
                size="small"
                step={cfg.image_size.custom?.step || 1}
                disabled={sizeLocked || !customOn}
                placeholder="--"
                value={draftH !== undefined ? draftH : showHeight ? state.height : null}
                onChange={setDraftH}
                onBlur={finishHeight}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              {customOn && (
                <span
                  className="hf-isp-lock is-on is-static"
                  aria-hidden
                  title={t('playground_2026:image_special_lock', '指定宽高')}
                >
                  <Link2 size={14} />
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageSpecialParamsFields;
