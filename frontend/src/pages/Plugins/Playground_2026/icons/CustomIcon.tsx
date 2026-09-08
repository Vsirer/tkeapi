/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 插件自定义图标组件 — 引用 Playground_2026/icons/svg 中与 Imagine 对齐的图标
 *
 * @example
 * <CustomIcon name="image" size={16} />
 * <CustomIcon name="workflow" size={20} className="nav-icon" />
 */
import React from 'react';
import { CUSTOM_ICON_DEFS, type CustomIconName } from './defs';

export type CustomIconProps = {
  name: CustomIconName;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** 无障碍：装饰性图标默认 aria-hidden */
  decorative?: boolean;
};

const CustomIcon: React.FC<CustomIconProps> = ({
  name,
  size = 16,
  className,
  style,
  title,
  decorative = true,
}) => {
  const def = CUSTOM_ICON_DEFS[name];
  if (!def) {
    if (import.meta.env.DEV) {
      console.warn(`[CustomIcon] unknown icon: ${name}`);
    }
    return null;
  }

  const dim = typeof size === 'number' ? `${size}px` : size;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={dim}
      height={dim}
      viewBox={def.viewBox}
      fill="none"
      className={className}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
      role={decorative && !title ? undefined : 'img'}
      aria-hidden={decorative && !title ? true : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {def.children}
    </svg>
  );
};

export default React.memo(CustomIcon);
