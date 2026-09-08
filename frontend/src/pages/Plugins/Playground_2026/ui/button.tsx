/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { cn } from './lib/cn';
import { LoadingOutlined } from './icons';

export type ButtonType = 'default' | 'primary' | 'dashed' | 'link' | 'text';
export type ButtonSize = 'small' | 'middle' | 'large';
export type ButtonShape = 'default' | 'circle' | 'round';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  type?: ButtonType;
  size?: ButtonSize;
  shape?: ButtonShape;
  icon?: React.ReactNode;
  loading?: boolean;
  danger?: boolean;
  block?: boolean;
  ghost?: boolean;
  htmlType?: 'button' | 'submit' | 'reset';
  /** antd 兼容：渲染为链接按钮 */
  href?: string;
  target?: string;
}

const sizeClass: Record<ButtonSize, string> = {
  small: 'pg-ui-btn-sm',
  middle: 'pg-ui-btn-md',
  large: 'pg-ui-btn-lg',
};

const typeClass: Record<ButtonType, string> = {
  default: 'pg-ui-btn-default',
  primary: 'pg-ui-btn-primary',
  dashed: 'pg-ui-btn-dashed',
  link: 'pg-ui-btn-link',
  text: 'pg-ui-btn-text',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      type = 'default',
      size = 'middle',
      shape = 'default',
      icon,
      loading,
      danger,
      block,
      className,
      children,
      disabled,
      htmlType = 'button',
      href,
      target,
      onClick,
      style,
      ...rest
    },
    ref,
  ) => {
    const iconOnly = !children && !!icon;
    const cls = cn(
      'pg-ui-btn',
      sizeClass[size],
      typeClass[type],
      shape === 'circle' && 'pg-ui-btn-circle',
      shape === 'round' && 'rounded-full',
      block && 'pg-ui-btn-block',
      iconOnly && 'pg-ui-btn-icon-only',
      danger && type !== 'primary' && 'pg-ui-btn-danger',
      className,
    );

    if (href) {
      return (
        <a
          href={href}
          target={target}
          rel={target === '_blank' ? 'noopener noreferrer' : undefined}
          className={cls}
          style={{ textDecoration: 'none', ...style }}
          onClick={onClick as any}
        >
          {loading ? <LoadingOutlined spin size={14} /> : icon}
          {children}
        </a>
      );
    }

    return (
      <button
        ref={ref}
        type={htmlType}
        disabled={disabled || loading}
        data-danger={danger ? 'true' : undefined}
        className={cls}
        style={style}
        onClick={onClick}
        {...rest}
      >
        {loading ? <LoadingOutlined spin size={14} /> : icon}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
