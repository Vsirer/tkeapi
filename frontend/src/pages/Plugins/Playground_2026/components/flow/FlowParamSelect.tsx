/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流属性面板参数下拉（对齐 Imagine Aspect Ratio：触发器 + 带标题列表 + 比例形状图标）
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownOutlined } from '../../ui';

export type FlowParamOption = {
  value: string | number;
  label: React.ReactNode;
};

type Props = {
  label: string;
  /** 弹出层顶部小标题，如「画面比例」 */
  menuTitle?: string;
  value: string | number | null | undefined;
  options: FlowParamOption[];
  disabled?: boolean;
  onChange: (value: string | number) => void;
  /** 选项左侧显示比例形状图标（尺寸/比例类） */
  showShapeIcon?: boolean;
  hint?: string;
};

function parseAspect(opt: string | number): { w: number; h: number } | null {
  const s = String(opt).trim();
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:xX*×：]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

function shapeStyle(opt: string | number, max = 14): React.CSSProperties {
  const parsed = parseAspect(opt);
  const minSide = 6;
  if (!parsed) {
    return { width: max, height: Math.round(max * 0.7), borderRadius: 2 };
  }
  const { w, h } = parsed;
  if (Math.abs(w - h) < 0.001) {
    return { width: 12, height: 12, borderRadius: 2 };
  }
  if (w > h) {
    return { width: max, height: Math.max(minSide, Math.round(max * (h / w))), borderRadius: 2 };
  }
  return { height: max, width: Math.max(minSide, Math.round(max * (w / h))), borderRadius: 2 };
}

const FlowParamSelect: React.FC<Props> = ({
  label,
  menuTitle,
  value,
  options,
  disabled,
  onChange,
  showShapeIcon,
  hint,
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value],
  );
  const displayText = selected?.label ?? (value != null && value !== '' ? String(value) : '请选择');
  const displayShapeSrc = selected?.value ?? value;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.max(r.width, 220);
      let left = r.left;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12);
      }
      let top = r.bottom + 6;
      const approxH = Math.min(360, 44 + options.length * 36);
      if (top + approxH > window.innerHeight - 12) {
        top = Math.max(12, r.top - approxH - 6);
      }
      setPos({ top, left, width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="pg-flow-props-field">
      <label className="pg-flow-props-label">{label}</label>
      <button
        ref={btnRef}
        type="button"
        className={`pg-flow-props-select${open ? ' is-open' : ''}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="pg-flow-props-select-left">
          {showShapeIcon && displayShapeSrc != null && displayShapeSrc !== '' && (
            <span className="pg-flow-param-shape-wrap" aria-hidden>
              <span className="pg-flow-param-shape" style={shapeStyle(displayShapeSrc, 14)} />
            </span>
          )}
          <span className="pg-flow-props-select-text">{displayText}</span>
        </span>
        <DownOutlined
          style={{
            fontSize: 12,
            opacity: 0.7,
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.15s',
          }}
        />
      </button>
      {hint ? <div className="pg-flow-props-hint">{hint}</div> : null}

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="pg-flow-param-pop"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            role="listbox"
            aria-label={menuTitle || label}
          >
            {(menuTitle || label) && (
              <div className="pg-flow-param-pop-title">{menuTitle || label}</div>
            )}
            <div className="pg-flow-param-pop-list">
              {options.map((opt) => {
                const active = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`pg-flow-param-pop-item${active ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {showShapeIcon && (
                      <span className="pg-flow-param-shape-wrap" aria-hidden>
                        <span className="pg-flow-param-shape" style={shapeStyle(opt.value, 14)} />
                      </span>
                    )}
                    <span className="pg-flow-param-pop-item-text">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default FlowParamSelect;
