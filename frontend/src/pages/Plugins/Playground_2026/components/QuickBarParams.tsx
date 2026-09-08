/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Hourglass, RectangleHorizontal, Monitor, Copy, Minus, Plus } from 'lucide-react';
import { Dropdown, Popover, Slider, InputNumber } from '../ui';
import type { SchemeParam } from '../types';
import { isSingleCountParam, isAspectParam, isDurationParam, isCountParam, formatParamLabel } from './SchemeParamFields';
import { isResolutionParam } from '../hooks/usePlaygroundVideoModels';
import { pickSchemeOption } from '../utils/generationParams';
import { formatParamOptionLabel } from '../utils/schemeQuickBar';
import { useThemeStore } from '../../../../store/theme';
import { cn } from '../ui/lib/cn';
import './QuickBarParams.css';

type QuickBarParamsProps = {
  params: SchemeParam[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
  placement?: 'top' | 'bottom';
};

/** 解析宽高数值并返回 w 与 h */
function parseAspectDimensions(val: any): { w: number; h: number } | null {
  if (val == null) return null;
  const s = String(val).trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:xX*×：]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

/** 根据分辨率/比例数值计算中空线框图标的宽高样式 */
function getAspectShapeStyle(val: any): React.CSSProperties | null {
  if (val == null) return null;
  const str = String(val).trim().toLowerCase();
  if (str === 'adaptive' || str === 'auto' || str === '相似比例') {
    return {
      width: 14,
      height: 10,
      borderRadius: 2,
      borderStyle: 'dashed',
    };
  }

  const parsed = parseAspectDimensions(val);
  if (!parsed) return null;

  const { w, h } = parsed;
  const maxSide = 15;
  const minSide = 6;

  // 1:1 正方形
  if (Math.abs(w - h) < 0.001) {
    return {
      width: 12,
      height: 12,
      borderRadius: 2,
    };
  }

  if (w > h) {
    // 横版：高度按比例缩小
    const computedH = Math.max(minSide, Math.min(13, Math.round(maxSide * (h / w))));
    const computedW = w / h < 1.35 ? 14 : maxSide;
    return {
      width: computedW,
      height: computedH,
      borderRadius: 2,
    };
  } else {
    // 竖版：宽度按比例缩小
    const computedW = Math.max(minSide, Math.min(13, Math.round(maxSide * (w / h))));
    const computedH = h / w < 1.35 ? 14 : maxSide;
    return {
      width: computedW,
      height: computedH,
      borderRadius: 2,
    };
  }
}

/** 根据参数类别精准推导对应属性图标（对齐参考图的线框中空风格与动态比例） */
const QuickParamIcon: React.FC<{ param: SchemeParam; value: any }> = ({ param, value }) => {
  const STROKE_WIDTH = 1.5;
  const ICON_SIZE = 15;

  // 1. 时长 / 时间 (排在前面，因为 duration 单词包含 ratio，直接由精确的 Helper 处理避免冲突)
  if (isDurationParam(param)) {
    return (
      <span className="pg-qbar-icon-box" aria-hidden>
        <Hourglass size={ICON_SIZE} strokeWidth={STROKE_WIDTH} className="pg-qbar-svg" />
      </span>
    );
  }

  // 2. 生成数量 / 批次 (Count / Batch size)
  if (isCountParam(param)) {
    return (
      <span className="pg-qbar-icon-box" aria-hidden>
        <Copy size={ICON_SIZE} strokeWidth={STROKE_WIDTH} className="pg-qbar-svg" />
      </span>
    );
  }

  // 3. 尝试从具体数值（如 1024x1024, 16:9, 1424x800 等）计算出精准比例线框
  const aspectStyle = getAspectShapeStyle(value);
  if (aspectStyle) {
    return (
      <span className="pg-qbar-icon-box" aria-hidden>
        <span className="pg-qbar-aspect-shape" style={aspectStyle} />
      </span>
    );
  }

  // 4. 比例 / 尺寸类别但无法从当前值解析（如纯枚举文本）
  if (isAspectParam(param)) {
    return (
      <span className="pg-qbar-icon-box" aria-hidden>
        <span className="pg-qbar-aspect-shape" style={{ width: 14, height: 10, borderRadius: 2 }} />
      </span>
    );
  }

  // 5. 分辨率 / 画质 (如 1080p, 4K 等无明确长宽数字)
  if (isResolutionParam(param)) {
    return (
      <span className="pg-qbar-icon-box" aria-hidden>
        <Monitor size={ICON_SIZE} strokeWidth={STROKE_WIDTH} className="pg-qbar-svg" />
      </span>
    );
  }

  return null;
};

function clampSliderValue(param: SchemeParam, raw: unknown): number {
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const n = typeof raw === 'number' ? raw : Number(raw);
  const fallback = typeof param.default === 'number' ? param.default : min;
  const v = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function isRangeControlParam(param: SchemeParam): boolean {
  return param.type === 'slider' || (param.type === 'number' && !(param.options && param.options.length));
}

const QuickBarSliderChip: React.FC<{
  param: SchemeParam;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  placement?: 'top' | 'bottom';
}> = ({ param, value, onChange, disabled, placement = 'top' }) => {
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const step = param.step ?? 1;
  const label = formatParamOptionLabel(param, value);
  const minLabel = formatParamOptionLabel(param, min);
  const maxLabel = formatParamOptionLabel(param, max);
  const rangeText = min === max ? minLabel : `${minLabel} - ${maxLabel}`;
  const unit = isDurationParam(param) ? 's' : (param.unit || '');

  const [localVal, setLocalVal] = React.useState<string>(String(value));
  const isFocusedRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalVal(String(value));
    }
  }, [value]);

  const commitValue = React.useCallback(() => {
    const n = Number(localVal);
    if (!Number.isFinite(n) || localVal === '') {
      setLocalVal(String(value));
      return;
    }
    const stepped = Math.round(n / step) * step;
    const stepDecimals = (step.toString().split('.')[1] || '').length;
    const fixed = Number(stepped.toFixed(stepDecimals));
    const clamped = Math.min(max, Math.max(min, fixed));
    setLocalVal(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  }, [localVal, max, min, onChange, step, value]);

  const handleStep = (delta: number) => {
    const next = Math.min(max, Math.max(min, Math.round((value + delta) / step) * step));
    setLocalVal(String(next));
    onChange(next);
  };

  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  return (
    <Popover
      trigger="click"
      placement={placement}
      overlayClassName={cn('shadcn-dropdown', isLight ? 'light' : 'dark', 'pg-qbar-dropdown pg-qbar-slider-pop')}
      content={
        <div className="pg-qbar-slider-body" onPointerDown={(e) => e.stopPropagation()}>
          {/* 头部：图标 + 参数标题 + 支持时长范围 */}
          <div className="pg-qbar-slider-header">
            <div className="pg-qbar-slider-title">
              <QuickParamIcon param={param} value={value} />
              <span>{formatParamLabel(param)}</span>
              <span className="pg-qbar-slider-range" title={`支持范围: ${rangeText}`}>
                ({rangeText})
              </span>
            </div>
          </div>

          {/* 核心控制：减号微调 + Shadcn 滑杆 + 加号微调 */}
          <div className="pg-qbar-slider-controls">
            <button
              type="button"
              className="pg-qbar-stepper-btn"
              disabled={disabled || value <= min}
              onClick={() => handleStep(-step)}
              title="减少"
              aria-label="减少"
            >
              <Minus size={13} strokeWidth={2.2} />
            </button>

            <div className="pg-qbar-slider-track-wrap">
              <Slider
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(v) => {
                  setLocalVal(String(v));
                  onChange(v);
                }}
              />
            </div>

            <button
              type="button"
              className="pg-qbar-stepper-btn"
              disabled={disabled || value >= max}
              onClick={() => handleStep(step)}
              title="增加"
              aria-label="增加"
            >
              <Plus size={13} strokeWidth={2.2} />
            </button>
          </div>

          {/* 滑杆正下方：当前拖动时长展示与手动输入框 */}
          <div className="pg-qbar-slider-input-center">
            <div
              className="pg-qbar-slider-input-wrap"
              onClick={() => inputRef.current?.focus()}
            >
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                className="pg-qbar-slider-number-input"
                style={{ width: `${Math.max(22, (localVal || '').length * 10 + 4)}px` }}
                value={localVal}
                disabled={disabled}
                onFocus={(e) => {
                  isFocusedRef.current = true;
                  e.target.select();
                }}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const pattern = step % 1 !== 0 ? /^\d*\.?\d*$/ : /^\d*$/;
                  if (pattern.test(raw)) {
                    setLocalVal(raw);
                    if (raw !== '' && raw !== '.') {
                      const n = Number(raw);
                      if (Number.isFinite(n) && n >= min && n <= max) {
                        onChange(n);
                      }
                    }
                  }
                }}
                onBlur={() => {
                  isFocusedRef.current = false;
                  commitValue();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitValue();
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    handleStep(step);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    handleStep(-step);
                  }
                }}
                aria-label={`${formatParamLabel(param)}输入`}
              />
              {unit && <span className="pg-qbar-slider-input-unit">{unit}</span>}
            </div>
          </div>
        </div>
      }
    >
      <button
        type="button"
        className="pg-qbar-chip"
        disabled={disabled}
        title={formatParamLabel(param)}
        aria-label={formatParamLabel(param)}
      >
        <QuickParamIcon param={param} value={value} />
        <span className="pg-qbar-text">{label}</span>
      </button>
    </Popover>
  );
};

// 计算最大公约数
function gcd(a: number, b: number): number {
  let x = Math.round(Math.abs(a));
  let y = Math.round(Math.abs(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

// 常见标准比例映射表
const STANDARD_RATIOS: { ratio: string; val: number }[] = [
  { ratio: '1:1', val: 1 },
  { ratio: '16:9', val: 16 / 9 },      // ~1.778
  { ratio: '9:16', val: 9 / 16 },      // ~0.5625
  { ratio: '4:3', val: 4 / 3 },        // ~1.333
  { ratio: '3:4', val: 3 / 4 },        // ~0.75
  { ratio: '3:2', val: 3 / 2 },        // ~1.5
  { ratio: '2:3', val: 2 / 3 },        // ~0.667
  { ratio: '21:9', val: 21 / 9 },      // ~2.333
  { ratio: '9:21', val: 9 / 21 },      // ~0.428
  { ratio: '5:4', val: 5 / 4 },        // ~1.25
  { ratio: '4:5', val: 4 / 5 },        // ~0.8
];

export function deriveAspectRatioFromValue(val: any): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (s === 'adaptive' || s === 'auto' || s === '相似比例') {
    return '自适应';
  }
  // 如果本身就是比例格式（如 16:9, 1:1, 4:3）
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(s)) {
    return s;
  }
  // 解析长宽数字（如 1024x1024, 1424x800, 1152*864, 864×1152）
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:xX*×：]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!(w > 0 && h > 0)) return null;

  const targetVal = w / h;
  // 优先在标准比例中寻找极度贴近的（容差 0.05）
  let bestMatch: string | null = null;
  let minDiff = 0.05;
  for (const item of STANDARD_RATIOS) {
    const diff = Math.abs(targetVal - item.val);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = item.ratio;
    }
  }
  if (bestMatch) return bestMatch;

  // 否则用最大公约数化简
  const g = gcd(w, h);
  const simW = Math.round(w / g);
  const simH = Math.round(h / g);
  if (simW <= 30 && simH <= 30) {
    return `${simW}:${simH}`;
  }
  return null;
}

function isGridOptionParam(param: SchemeParam): boolean {
  if (param.type === 'slider' || (param.type === 'number' && !(param.options && param.options.length))) {
    return false;
  }
  if (!param.options || param.options.length === 0) return false;
  // 比例/尺寸类参数强制使用网格
  if (isAspectParam(param) || isResolutionParam(param)) return true;
  // 检查 options 里是否有尺寸模式（包含 x, :, ×, *）
  const hasDimensions = param.options.some((opt) => {
    const s = String(opt);
    return /\d+\s*[:xX*×：]\s*\d+/.test(s);
  });
  if (hasDimensions) return true;
  if (param.options.length >= 4) return true;
  return false;
}

/** 3列网格尺寸/选项选择面板 (Shadcn UI 风格) */
const QuickBarGridChip: React.FC<{
  param: SchemeParam;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  placement?: 'top' | 'bottom';
}> = ({ param, value, onChange, disabled, placement = 'top' }) => {
  const [open, setOpen] = React.useState(false);
  const label = formatParamOptionLabel(param, value);
  const currentRatio = deriveAspectRatioFromValue(value);

  const handleSelect = (opt: any) => {
    onChange(opt);
    setOpen(false);
  };

  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      overlayClassName={cn('shadcn-dropdown', isLight ? 'light' : 'dark', 'pg-qbar-dropdown pg-qbar-grid-pop')}
      content={
        <div className="pg-qbar-grid-body" onPointerDown={(e) => e.stopPropagation()}>
          {/* 头部：标题 + 当前选中的尺寸与比例 */}
          <div className="pg-qbar-grid-header">
            <div className="pg-qbar-grid-title">
              <QuickParamIcon param={param} value={value} />
              <span>{formatParamLabel(param)}</span>
            </div>
            <div className="pg-qbar-grid-badge">
              <span className="pg-qbar-grid-badge-text">{label}</span>
              {currentRatio && currentRatio !== label && (
                <span className="pg-qbar-grid-badge-ratio">{currentRatio}</span>
              )}
            </div>
          </div>

          {/* 3列网格尺寸选择 */}
          <div className="pg-qbar-grid-matrix">
            {(param.options || []).map((opt) => {
              const isSelected = String(opt) === String(value);
              const optLabel = formatParamOptionLabel(param, opt);
              const ratio = deriveAspectRatioFromValue(opt);
              return (
                <button
                  key={String(opt)}
                  type="button"
                  className={`pg-qbar-grid-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleSelect(opt)}
                  disabled={disabled}
                >
                  <div className="pg-qbar-grid-card-icon">
                    <QuickParamIcon param={param} value={opt} />
                  </div>
                  <div className="pg-qbar-grid-card-val">{optLabel}</div>
                  {ratio && (
                    <div className="pg-qbar-grid-card-ratio">
                      {ratio}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      <button
        type="button"
        className="pg-qbar-chip"
        disabled={disabled}
        title={formatParamLabel(param)}
        aria-label={formatParamLabel(param)}
      >
        <QuickParamIcon param={param} value={value} />
        <span className="pg-qbar-text">{label}</span>
      </button>
    </Popover>
  );
};

const QuickBarParams: React.FC<QuickBarParamsProps> = ({
  params,
  values,
  onChange,
  disabled,
  placement = 'top',
}) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  const visibleParams = React.useMemo(
    () => params.filter((p) => !isSingleCountParam(p)),
    [params],
  );
  if (!visibleParams.length) return null;

  return (
    <div className="pg-qbar" role="group" aria-label="快捷栏">
      {visibleParams.map((param) => {
        const isParamLocked =
          param.key === 'output_format' &&
          (values.background === 'transparent' || !!values.layer_decomposition);
        const effectiveDisabled = disabled || isParamLocked;

        if (isRangeControlParam(param)) {
          const value = clampSliderValue(param, isParamLocked ? 'png' : (values[param.key] ?? param.default));
          return (
            <QuickBarSliderChip
              key={param.key}
              param={param}
              value={value}
              onChange={(v) => onChange(param.key, v)}
              disabled={effectiveDisabled}
              placement={placement}
            />
          );
        }
        const raw = isParamLocked ? 'png' : (values[param.key] ?? param.default);
        const value = pickSchemeOption(param.options, raw, param.default);
        const label = formatParamOptionLabel(param, value);

        if (isGridOptionParam(param)) {
          return (
            <QuickBarGridChip
              key={param.key}
              param={param}
              value={value}
              onChange={(v) => onChange(param.key, v)}
              disabled={effectiveDisabled}
              placement={placement}
            />
          );
        }

        return (
          <Dropdown
            key={param.key}
            disabled={effectiveDisabled}
            trigger={['click']}
            placement={placement}
            overlayClassName={cn('shadcn-dropdown', isLight ? 'light' : 'dark', 'pg-qbar-dropdown')}
            menu={{
              selectable: true,
              selectedKeys: [String(value)],
              items: [
                {
                  key: 'group_header',
                  type: 'group',
                  label: formatParamLabel(param),
                },
                ...(param.options || []).map((opt) => {
                  const isSelected = String(opt) === String(value);
                  const optLabel = formatParamOptionLabel(param, opt);
                  return {
                    key: String(opt),
                    label: (
                      <div className={`pg-qbar-menu-item ${isSelected ? 'is-selected' : ''}`}>
                        <QuickParamIcon param={param} value={opt} />
                        <span className="pg-qbar-menu-text">{optLabel}</span>
                      </div>
                    ),
                    onClick: () => onChange(param.key, opt),
                  };
                }),
              ],
            }}
          >
            <button
              type="button"
              className="pg-qbar-chip"
              disabled={effectiveDisabled}
              title={formatParamLabel(param)}
              aria-label={formatParamLabel(param)}
            >
              <QuickParamIcon param={param} value={value} />
              <span className="pg-qbar-text">{label}</span>
            </button>
          </Dropdown>
        );
      })}
    </div>
  );
};

export default React.memo(QuickBarParams);
