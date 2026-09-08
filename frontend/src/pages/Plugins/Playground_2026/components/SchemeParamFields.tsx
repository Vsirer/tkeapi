/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { InputNumber, Select, Slider, Switch } from '../ui';
import type { SchemeParam } from '../types';
import './ModelSettingsPanel.css';

export type SchemeParamFieldsProps = {
  params: SchemeParam[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset?: () => void;
  schemeName?: string;
  /** 标题行改由外层渲染时隐藏（避免专用参数下方再出一行） */
  hideTitle?: boolean;
  /** panel=设置弹层右栏；inline=视频左栏快捷栏下方 */
  variant?: 'panel' | 'inline';
};

/** 比例线框：统一装进 box×box，横/竖/方都居中对齐 */
const aspectShapeStyle = (opt: string | number, box = 14): React.CSSProperties => {
  const optStr = String(opt);
  const match = optStr.match(/(\d+)\s*[xX*:：]\s*(\d+)/);
  const rw = match ? parseInt(match[1], 10) : 1;
  const rh = match ? parseInt(match[2], 10) : 1;
  const ratio = rw > 0 && rh > 0 ? rw / rh : 1;
  const minSide = 5;
  if (Math.abs(ratio - 1) < 0.001) {
    return { width: 12, height: 12 };
  }
  if (ratio > 1) {
    return { width: box, height: Math.max(minSide, Math.round(box / ratio)) };
  }
  return { height: box, width: Math.max(minSide, Math.round(box * ratio)) };
};

export const isAspectParam = (param: SchemeParam): boolean => {
  const k = (param.key || '').toLowerCase();
  const label = (param.label || '').toLowerCase();
  if (
    k === 'size' ||
    k === 'ratio' ||
    k === 'aspect_ratio' ||
    k === 'aspectratio' ||
    k.includes('aspect') ||
    label.includes('比例') ||
    label.includes('尺寸') ||
    label.includes('aspect')
  ) {
    return true;
  }
  if (!param.options?.length) return false;
  return param.options.some((o) => /^\d+\s*[:xX*：]\s*\d+$/.test(String(o).trim()));
};

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
  layer_decomposition: '图层拆分',
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

/** 分组标题文案：包含中文直接用，英文做字典映射 */
export const formatGroupLabel = (group?: string, fallback = '更多选项'): string => {
  if (!group || !group.trim()) return fallback;
  const s = group.trim();
  if (/[\u4e00-\u9fa5]/.test(s)) return s;
  const lower = s.toLowerCase();
  return DEFAULT_GROUP_LABELS[lower] || s;
};

const ParamSliderRow: React.FC<{
  param: SchemeParam;
  value: unknown;
  onChange: (v: number) => void;
}> = ({ param, value, onChange }) => {
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const step = param.step ?? 1;
  const num = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(num) ? num : min;
  return (
    <div className="hf-msp-slider-row">
      <Slider min={min} max={max} step={step} value={safe} onChange={onChange} />
      <InputNumber
        className="hf-msp-text-input hf-msp-slider-num"
        size="small"
        min={min}
        max={max}
        step={step}
        value={safe}
        controls={false}
        onChange={(v) => {
          if (v === null) return;
          onChange(v);
        }}
      />
    </div>
  );
};

const SchemeParamFields: React.FC<SchemeParamFieldsProps> = ({
  params,
  values,
  onChange,
  onReset,
  schemeName,
  hideTitle = false,
  variant = 'panel',
}) => {
  const { t } = useTranslation();

  const orderedParams = useMemo(() => {
    const visible = params.filter((p) => !isSingleCountParam(p));
    const aspects = visible.filter(isAspectParam);
    const rest = visible.filter((p) => !isAspectParam(p));
    return [...aspects, ...rest];
  }, [params]);

  const hasAspect = orderedParams.some(isAspectParam);
  const restParams = orderedParams.filter((p) => !isAspectParam(p));

  if (!orderedParams.length) return null;

  const resetBtn = onReset ? (
    <button type="button" className="hf-msp-reset" onClick={onReset}>
      {t('playground_2026:reset_params', '重置')}
    </button>
  ) : null;

  const renderRadioSegmented = (
    param: SchemeParam,
    options: (string | number)[],
    current: unknown,
    disabled = false,
  ) => (
    <div className={`hf-msp-seg${disabled ? ' is-disabled' : ''}`} role="radiogroup" aria-label={formatParamLabel(param)}>
      <div className="hf-msp-seg-pack">
        {options.map((opt) => {
          const selected = String(current) === String(opt);
          return (
            <button
              key={String(opt)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              className={`hf-msp-seg-item${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
              onClick={() => {
                if (!disabled) onChange(param.key, opt);
              }}
            >
              {formatChoiceLabel(param, opt)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderRadioDots = (
    param: SchemeParam,
    options: (string | number)[],
    current: unknown,
    disabled = false,
  ) => (
    <div className={`hf-msp-radio-group${disabled ? ' is-disabled' : ''}`} role="radiogroup" aria-label={formatParamLabel(param)}>
      {options.map((opt) => {
        const selected = String(current) === String(opt);
        return (
          <label
            key={String(opt)}
            className={`hf-msp-radio-item${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
            onClick={() => {
              if (!disabled) onChange(param.key, opt);
            }}
          >
            <span className={`hf-msp-radio-dot${selected ? ' checked' : ''}`} aria-hidden>
              {selected && <span className="hf-msp-radio-dot-inner" />}
            </span>
            <span className="hf-msp-radio-label">{formatChoiceLabel(param, opt)}</span>
          </label>
        );
      })}
    </div>
  );

  const renderAspectGrid = (
    param: SchemeParam,
    current: unknown,
    showAspectReset: boolean,
  ) => (
    <div key={param.key} className="hf-msp-field hf-msp-field-aspect">
      {!param.hide_label && (
        <div className="hf-msp-field-head">
          <span className="hf-msp-field-label">
            {formatParamLabel(param) || t('playground_2026:select_aspect', '选择比例')}
          </span>
          {variant === 'panel' && showAspectReset ? resetBtn : null}
        </div>
      )}
      <div className="hf-msp-aspect-grid">
        {(param.options || []).map((opt) => {
          const selected = String(current) === String(opt);
          return (
            <button
              key={String(opt)}
              type="button"
              className={`hf-msp-aspect-btn${selected ? ' selected' : ''}`}
              onClick={() => onChange(param.key, opt)}
            >
              <span className="hf-msp-aspect-icon" aria-hidden>
                <span className="hf-msp-aspect-shape" style={aspectShapeStyle(opt, 14)} />
              </span>
              <span className="hf-msp-aspect-text">{String(opt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderParamBlock = (param: SchemeParam, showAspectReset = false) => {
    const paramLabel = formatParamLabel(param);
    const paramHint = formatParamHint(param);
    const isOutputFormatLocked =
      param.key === 'output_format' &&
      (values.background === 'transparent' || !!values.layer_decomposition);
    const value = isOutputFormatLocked ? 'png' : (values[param.key] ?? param.default);
    const ty = param.type;
    const lockedHint = isOutputFormatLocked ? (
      <div className="hf-msp-field-hint" style={{ color: 'rgba(234, 179, 8, 0.9)' }}>
        {values.background === 'transparent' && values.layer_decomposition
          ? '透明背景与图层拆分已开启，输出格式固定为 PNG'
          : values.background === 'transparent'
            ? '透明背景已开启，输出格式固定为 PNG'
            : '图层拆分已开启，输出格式固定为 PNG'}
      </div>
    ) : null;
    const hint = lockedHint || (paramHint ? (
      <div className="hf-msp-field-hint">{paramHint}</div>
    ) : null);

    if (ty === 'switch') {
      if (variant === 'inline') {
        return (
          <div
            key={param.key}
            className="hf-msp-field-inline-switch"
          >
            <span className="hf-msp-field-label" style={{ display: 'flex', alignItems: 'center' }}>
              {paramLabel}
              {paramHint && (
                <span title={paramHint} style={{ display: 'flex', marginLeft: 6, opacity: 0.5, cursor: 'help' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </span>
              )}
            </span>
            <Switch size="small" checked={!!value} onChange={(v) => onChange(param.key, v)} />
          </div>
        );
      }

      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">{paramLabel}</span>
            <Switch size="small" checked={!!value} onChange={(v) => onChange(param.key, v)} />
          </div>
          {hint}
        </div>
      );
    }

    if (ty === 'slider') {
      if (param.display_style === 'pill' || param.display_style === 'badge') {
        const num = typeof value === 'number' ? value : Number(value);
        const safe = Number.isFinite(num) ? num : (param.min ?? 0);
        return (
          <div key={param.key} className="hf-msp-field">
            <div className="hf-msp-field-head hf-msp-field-row" style={{ marginBottom: 8 }}>
              <span className="hf-msp-field-label">{paramLabel}</span>
              <span className="hf-msp-slider-badge">{safe}</span>
            </div>
            <div style={{ padding: '0 2px' }}>
              <Slider
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step ?? 1}
                value={safe}
                onChange={(v) => onChange(param.key, v)}
              />
            </div>
            {hint}
          </div>
        );
      }

      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head">
            <span className="hf-msp-field-label">{paramLabel}</span>
          </div>
          <ParamSliderRow param={param} value={value} onChange={(v) => onChange(param.key, v)} />
          {hint}
        </div>
      );
    }

    if (ty === 'number') {
      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">{paramLabel}</span>
            <div style={{ width: 120 }}>
              <InputNumber
                className="hf-msp-text-input"
                style={{ width: '100%' }}
                value={typeof value === 'number' ? value : Number(value) || param.min || 0}
                min={param.min}
                max={param.max}
                step={param.step ?? 1}
                onChange={(v) => {
                  if (v === null) return;
                  onChange(param.key, v);
                }}
              />
            </div>
          </div>
          {hint}
        </div>
      );
    }

    if (ty === 'select' && param.options?.length) {
      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">{paramLabel}</span>
            <Select
              className="hf-msp-select"
              size="small"
              disabled={isOutputFormatLocked}
              value={value}
              placeholder={param.placeholder || '请选择'}
              onChange={(v) => onChange(param.key, v)}
              options={param.options.map((opt) => ({
                value: opt,
                label: formatChoiceLabel(param, opt),
              }))}
            />
          </div>
          {hint}
        </div>
      );
    }

    if (ty === 'radio' && param.options?.length) {
      if (isAspectParam(param)) {
        return renderAspectGrid(param, value, showAspectReset);
      }
      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">{paramLabel}</span>
            {param.display_style === 'radio'
              ? renderRadioDots(param, param.options, value, isOutputFormatLocked)
              : renderRadioSegmented(param, param.options, value, isOutputFormatLocked)}
          </div>
          {hint}
        </div>
      );
    }

    if (ty === 'input') {
      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">{paramLabel}</span>
            <div style={{ flex: 1, maxWidth: 220 }}>
              <input
                className="hf-msp-text-input"
                value={value ?? ''}
                placeholder={param.placeholder || ''}
                onChange={(e) => onChange(param.key, e.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    /* 未标 type 的旧数据：比例格 / 有选项则分段 */
    if (isAspectParam(param) && param.options?.length) {
      return renderAspectGrid(param, value, showAspectReset);
    }

    if (param.options?.length) {
      return (
        <div key={param.key} className="hf-msp-field">
          <div className="hf-msp-field-head hf-msp-field-row">
            <span className="hf-msp-field-label">{paramLabel}</span>
            {param.display_style === 'radio'
              ? renderRadioDots(param, param.options, value, isOutputFormatLocked)
              : renderRadioSegmented(param, param.options, value, isOutputFormatLocked)}
          </div>
          {hint}
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`hf-msp-fields${variant === 'inline' ? ' is-inline' : ''}`}>
      {variant === 'panel' && !hideTitle && !hasAspect && resetBtn ? (
        <div className="hf-msp-field-head">
          <span className="hf-msp-field-label">
            {schemeName || t('playground_2026:scheme_params', '方案参数')}
          </span>
          {resetBtn}
        </div>
      ) : null}
      {orderedParams.filter(isAspectParam).map((p, i) => renderParamBlock(p, i === 0))}
      {restParams.length > 0 && (
        <div className="hf-msp-more">
          {variant === 'panel' ? (
            <div className="hf-msp-more-title">
              {formatGroupLabel(restParams[0]?.group, t('playground_2026:more_options', '更多选项'))}
            </div>
          ) : null}
          {restParams.map((p) => renderParamBlock(p))}
        </div>
      )}
    </div>
  );
};

export default SchemeParamFields;
