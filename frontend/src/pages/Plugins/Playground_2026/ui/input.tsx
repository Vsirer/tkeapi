/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { cn } from './lib/cn';
import { CloseOutlined } from './icons';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'small' | 'middle' | 'large';
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  allowClear?: boolean;
  onPressEnter?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const InputBase = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      style,
      size = 'middle',
      prefix,
      suffix,
      allowClear,
      disabled,
      value,
      onChange,
      onPressEnter,
      onKeyDown,
      ...rest
    },
    ref,
  ) => {
    const showClear = allowClear && value != null && String(value).length > 0 && !disabled;
    return (
      <span
        className={cn(
          'pg-ui-input-wrap',
          size === 'small' && 'pg-ui-input-sm',
          size === 'large' && 'pg-ui-input-lg',
          className,
        )}
        style={style}
        data-disabled={disabled ? 'true' : undefined}
      >
        {prefix}
        <input
          ref={ref}
          className="pg-ui-input"
          disabled={disabled}
          value={value}
          onChange={onChange}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.key === 'Enter') onPressEnter?.(e);
          }}
          {...rest}
        />
        {showClear && (
          <button
            type="button"
            aria-label="clear"
            className="pg-ui-btn pg-ui-btn-text pg-ui-btn-sm"
            style={{ width: 20, height: 20, padding: 0 }}
            onClick={(e) => {
              e.preventDefault();
              onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
            }}
          >
            <CloseOutlined size={12} />
          </button>
        )}
        {suffix}
      </span>
    );
  },
);
InputBase.displayName = 'Input';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  rows?: number;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  variant?: string;
  bordered?: boolean;
}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, style, rows = 3, autoSize, variant: _variant, bordered, ...rest }, ref) => {
    const minRows = typeof autoSize === 'object' ? autoSize.minRows : undefined;
    return (
      <span
        className={cn('pg-ui-input-wrap', className)}
        style={{
          ...(bordered === false ? { border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 } : null),
          ...style,
        }}
      >
        <textarea
          ref={ref}
          className="pg-ui-textarea"
          rows={minRows ?? rows}
          {...rest}
        />
      </span>
    );
  },
);
TextArea.displayName = 'Input.TextArea';

type InputComponent = typeof InputBase & { TextArea: typeof TextArea };
export const Input = InputBase as InputComponent;
Input.TextArea = TextArea;

export interface InputNumberProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'value'> {
  value?: number | null;
  min?: number;
  max?: number;
  step?: number;
  size?: 'small' | 'middle' | 'large';
  onChange?: (value: number | null) => void;
  controls?: boolean;
}

export const InputNumber = React.forwardRef<HTMLInputElement, InputNumberProps>(
  ({ value, min, max, step = 1, onChange, className, style, size = 'middle', disabled, ...rest }, ref) => {
    return (
      <Input
        ref={ref}
        type="number"
        size={size}
        className={className}
        style={style}
        disabled={disabled}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange?.(null);
            return;
          }
          const n = Number(raw);
          if (Number.isNaN(n)) return;
          let next = n;
          if (min != null) next = Math.max(min, next);
          if (max != null) next = Math.min(max, next);
          onChange?.(next);
        }}
        {...rest}
      />
    );
  },
);
InputNumber.displayName = 'InputNumber';
