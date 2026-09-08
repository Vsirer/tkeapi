/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from './lib/cn';

export interface TooltipProps {
  title?: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right' | string;
  children: React.ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  mouseEnterDelay?: number;
  overlayClassName?: string;
  className?: string;
  /** antd 兼容 */
  color?: string;
  overlayStyle?: React.CSSProperties;
  overlayInnerStyle?: React.CSSProperties;
  arrow?: boolean;
  destroyTooltipOnHide?: boolean;
  getPopupContainer?: (node: HTMLElement) => HTMLElement;
}

const sideMap: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
  topLeft: 'top',
  topRight: 'top',
  bottomLeft: 'bottom',
  bottomRight: 'bottom',
};

export const Tooltip = React.forwardRef<any, TooltipProps>(
  (
    {
      title,
      placement = 'top',
      children,
      open,
      defaultOpen,
      onOpenChange,
      mouseEnterDelay = 0.1,
      overlayClassName,
      color,
      overlayStyle,
      overlayInnerStyle,
      ...restProps
    },
    ref
  ) => {
    if (title == null || title === false) return children;
    const side = sideMap[placement] || 'top';
    return (
      <TooltipPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        delayDuration={Math.round(mouseEnterDelay * 1000)}
      >
        <TooltipPrimitive.Trigger asChild ref={ref} {...restProps}>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn('pg-ui-tooltip', overlayClassName)}
            style={{
              background: color,
              ...overlayStyle,
              ...overlayInnerStyle,
            }}
          >
            {title}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    );
  }
);
Tooltip.displayName = 'Tooltip';
