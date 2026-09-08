/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './lib/cn';
import { Button } from './button';

export interface PopoverProps {
  content?: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactElement;
  trigger?: 'hover' | 'click' | 'focus' | Array<'hover' | 'click' | 'focus'>;
  placement?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
  overlayInnerStyle?: React.CSSProperties;
  styles?: { body?: React.CSSProperties; root?: React.CSSProperties; container?: React.CSSProperties };
  destroyTooltipOnHide?: boolean;
  mouseEnterDelay?: number;
  arrow?: boolean;
  align?: { offset?: number[] };
  getPopupContainer?: (node: HTMLElement) => HTMLElement;
  motion?: any;
}

const parsePlacement = (placement?: string) => {
  if (!placement) return { side: 'bottom' as const, align: 'center' as const };
  const p = placement.toLowerCase();
  let side: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
  let align: 'start' | 'center' | 'end' = 'center';

  if (p.startsWith('top')) side = 'top';
  else if (p.startsWith('bottom')) side = 'bottom';
  else if (p.startsWith('left')) side = 'left';
  else if (p.startsWith('right')) side = 'right';

  if (p.endsWith('left') || p.endsWith('start')) align = 'start';
  else if (p.endsWith('right') || p.endsWith('end')) align = 'end';

  return { side, align };
};

export const Popover: React.FC<PopoverProps> = ({
  content,
  title,
  children,
  trigger = 'hover',
  placement = 'bottom',
  open,
  onOpenChange,
  overlayClassName,
  overlayStyle,
  overlayInnerStyle,
  styles,
}) => {
  const triggers = Array.isArray(trigger) ? trigger : [trigger];
  const { side, align } = parsePlacement(placement);
  const [internalOpen, setInternalOpen] = React.useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (v: boolean) => {
    if (!controlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const hover = triggers.includes('hover');
  const click = triggers.includes('click');

  const bodyPadding =
    styles?.body?.padding !== undefined
      ? styles?.body?.padding
      : styles?.container?.padding !== undefined
        ? styles?.container?.padding
        : overlayClassName?.includes('custom-premium-popover') || overlayClassName?.includes('pg-site-notice-popover')
          ? 0
          : 12;

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        asChild
        onMouseEnter={hover ? () => setOpen(true) : undefined}
        onMouseLeave={hover ? () => setOpen(false) : undefined}
        onClick={click ? undefined : (e) => {
          if (hover && !click) e.preventDefault();
        }}
      >
        {children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          className={cn('pg-ui-overlay-surface', overlayClassName)}
          style={{ zIndex: 5300, padding: 0, ...overlayStyle, ...overlayInnerStyle, ...styles?.root, ...styles?.container }}
          onMouseEnter={hover ? () => setOpen(true) : undefined}
          onMouseLeave={hover ? () => setOpen(false) : undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {title != null && (
            <div style={{ padding: '12px 14px 0', fontWeight: 600, fontSize: 14 }}>{title}</div>
          )}
          <div style={{ padding: bodyPadding, ...styles?.container, ...styles?.body }}>{content}</div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

export interface PopconfirmProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onConfirm?: (e?: React.MouseEvent) => void;
  onCancel?: (e?: React.MouseEvent) => void;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  okButtonProps?: React.ComponentProps<typeof Button>;
  cancelButtonProps?: React.ComponentProps<typeof Button>;
  children: React.ReactElement;
  placement?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Popconfirm: React.FC<PopconfirmProps> = ({
  title,
  description,
  onConfirm,
  onCancel,
  okText = '确定',
  cancelText = '取消',
  okButtonProps,
  cancelButtonProps,
  children,
  placement = 'top',
  disabled,
  open,
  onOpenChange,
}) => {
  const [internal, setInternal] = React.useState(false);
  const isOpen = open ?? internal;
  const setOpen = (v: boolean) => {
    setInternal(v);
    onOpenChange?.(v);
  };

  if (disabled) return children;

  return (
    <Popover
      open={isOpen}
      onOpenChange={setOpen}
      trigger="click"
      placement={placement}
      content={
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 600, marginBottom: description ? 6 : 12 }}>{title}</div>
          {description && <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>{description}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              size="small"
              onClick={(e) => {
                onCancel?.(e);
                setOpen(false);
              }}
              {...cancelButtonProps}
            >
              {cancelText}
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={(e) => {
                onConfirm?.(e);
                setOpen(false);
              }}
              {...okButtonProps}
            >
              {okText}
            </Button>
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
};
