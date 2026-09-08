/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './lib/cn';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'default' | 'small';
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  defaultChecked,
  onChange,
  disabled,
  size = 'default',
  className,
  style,
  'aria-label': ariaLabel,
}) => (
  <SwitchPrimitive.Root
    className={cn('pg-ui-switch', size === 'small' && 'pg-ui-switch-sm', className)}
    style={style}
    checked={checked}
    defaultChecked={defaultChecked}
    disabled={disabled}
    onCheckedChange={onChange}
    aria-label={ariaLabel}
  >
    <SwitchPrimitive.Thumb className="pg-ui-switch-thumb" />
  </SwitchPrimitive.Root>
);

export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onChange?: (e: { target: { checked: boolean } }) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  indeterminate?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  defaultChecked,
  onChange,
  disabled,
  children,
  className,
  style,
  indeterminate,
}) => (
  <label className={cn('inline-flex items-center gap-2 cursor-pointer', className)} style={style}>
    <CheckboxPrimitive.Root
      className="pg-ui-checkbox"
      checked={indeterminate ? 'indeterminate' : checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(v) => onChange?.({ target: { checked: v === true } })}
    >
      <CheckboxPrimitive.Indicator>
        <Check size={12} strokeWidth={2} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    {children}
  </label>
);

export interface SliderProps {
  value?: number | [number, number];
  defaultValue?: number | [number, number];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onChangeComplete?: (value: number) => void;
  className?: string;
  style?: React.CSSProperties;
  tipFormatter?: ((v?: number) => React.ReactNode) | null;
  tooltip?: { formatter?: ((v?: number) => React.ReactNode) | null } | false;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onChange,
  onChangeComplete,
  className,
  style,
}) => {
  const toArr = (v?: number | [number, number]) =>
    v == null ? undefined : Array.isArray(v) ? v : [v];
  return (
    <SliderPrimitive.Root
      className={cn('pg-ui-slider-root', className)}
      style={style}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={toArr(value)}
      defaultValue={toArr(defaultValue) ?? [min]}
      onValueChange={(vals) => onChange?.(vals[0])}
      onValueCommit={(vals) => onChangeComplete?.(vals[0])}
    >
      <SliderPrimitive.Track className="pg-ui-slider-track">
        <SliderPrimitive.Range className="pg-ui-slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="pg-ui-slider-thumb" />
    </SliderPrimitive.Root>
  );
};

export interface SelectOption {
  label: React.ReactNode;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string | number | null;
  defaultValue?: string | number;
  options?: SelectOption[];
  onChange?: (value: any, option?: SelectOption) => void;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  allowClear?: boolean;
  showSearch?: boolean;
  style?: React.CSSProperties;
  className?: string;
  size?: 'small' | 'middle' | 'large';
  popupMatchSelectWidth?: boolean;
  popupClassName?: string;
  optionFilterProp?: string;
  filterOption?: boolean | ((input: string, option?: SelectOption) => boolean);
  children?: React.ReactNode;
  getPopupContainer?: (node: HTMLElement) => HTMLElement;
}

export const Select: React.FC<SelectProps> = ({
  value,
  defaultValue,
  options = [],
  onChange,
  placeholder = '请选择',
  disabled,
  style,
  className,
  popupClassName,
  getPopupContainer,
}) => {
  const strVal = value == null || value === '' ? undefined : String(value);
  const strDefault = defaultValue == null || defaultValue === '' ? undefined : String(defaultValue);
  // Radix：受控 value 必须命中某个 Item，否则点击无响应
  const matched = strVal != null && options.some((o) => String(o.value) === strVal);
  const safeValue = matched ? strVal : undefined;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>();
  const [menuMinWidth, setMenuMinWidth] = useState<number>();
  useLayoutEffect(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    setPortalContainer(
      getPopupContainer?.(triggerEl) ||
        (triggerEl.closest('.pg-ui-root') as HTMLElement | null) ||
        document.body,
    );
  }, [getPopupContainer]);

  return (
    <SelectPrimitive.Root
      value={safeValue}
      defaultValue={strDefault}
      disabled={disabled}
      onOpenChange={(open) => {
        if (open && triggerRef.current) {
          setMenuMinWidth(Math.max(triggerRef.current.offsetWidth, 112));
        }
      }}
      onValueChange={(v) => {
        const opt = options.find((o) => String(o.value) === v);
        const raw = opt ? opt.value : v;
        onChange?.(raw, opt);
      }}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        className={cn('pg-ui-select-trigger', className)}
        style={style}
      >
        <SelectPrimitive.Value placeholder={placeholder as string} />
        <SelectPrimitive.Icon>
          <ChevronDown size={14} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={portalContainer}>
        <SelectPrimitive.Content
          className={cn('pg-ui-select-content', popupClassName)}
          position="popper"
          sideOffset={4}
          style={{ zIndex: 6200, minWidth: menuMinWidth }}
        >
          <SelectPrimitive.Viewport>
            {options
              .filter((opt) => String(opt.value) !== '')
              .map((opt) => (
              <SelectPrimitive.Item
                key={String(opt.value)}
                value={String(opt.value)}
                disabled={opt.disabled}
                className="pg-ui-select-item"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: number | 'small' | 'default' | 'large';
  shape?: 'circle' | 'square';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = 'default',
  shape = 'circle',
  icon,
  children,
  className,
  style,
}) => {
  const px = typeof size === 'number' ? size : size === 'small' ? 24 : size === 'large' ? 40 : 32;
  return (
    <AvatarPrimitive.Root
      className={cn('pg-ui-avatar', className)}
      style={{
        width: px,
        height: px,
        fontSize: Math.round(px * 0.4),
        borderRadius: shape === 'square' ? 8 : '50%',
        ...style,
      }}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={alt} /> : null}
      <AvatarPrimitive.Fallback delayMs={src ? 200 : 0}>
        {children ?? icon}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
};
