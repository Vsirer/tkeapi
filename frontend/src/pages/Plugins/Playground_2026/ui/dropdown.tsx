/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
import { cn } from './lib/cn';

export type MenuItemType = {
  key?: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  type?: 'divider' | 'group' | 'item';
  children?: MenuItemType[];
  onClick?: (info: { key: string; domEvent: Event }) => void;
  /** 选中后不关闭菜单（如菜单项内嵌套 Popover） */
  keepOpen?: boolean;
};

export type MenuProps = {
  items?: MenuItemType[] | null;
  onClick?: (info: { key: string; keyPath?: string[]; domEvent: Event }) => void;
  selectable?: boolean;
  selectedKeys?: string[];
};

export interface DropdownProps {
  menu?: MenuProps;
  trigger?: Array<'click' | 'hover' | 'contextMenu'>;
  placement?: string;
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
  children: React.ReactElement;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  destroyPopupOnHide?: boolean;
  dropdownRender?: (origin: React.ReactNode) => React.ReactNode;
  getPopupContainer?: (node: HTMLElement) => HTMLElement;
}

const sideMap: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
  bottom: 'bottom',
  bottomLeft: 'bottom',
  bottomRight: 'bottom',
  top: 'top',
  topLeft: 'top',
  topRight: 'top',
  left: 'left',
  leftTop: 'left',
  leftBottom: 'left',
  right: 'right',
  rightTop: 'right',
  rightBottom: 'right',
};

const alignMap: Record<string, 'start' | 'center' | 'end'> = {
  bottomLeft: 'start',
  topLeft: 'start',
  leftTop: 'start',
  rightTop: 'start',
  bottomRight: 'end',
  topRight: 'end',
  leftBottom: 'end',
  rightBottom: 'end',
};

function resolvePortalContainer(
  triggerEl: HTMLElement | null,
  getPopupContainer?: (node: HTMLElement) => HTMLElement,
): HTMLElement | undefined {
  if (!triggerEl) return undefined;
  if (getPopupContainer) return getPopupContainer(triggerEl);
  return (triggerEl.closest('.pg-ui-root') as HTMLElement | null) || undefined;
}

function renderItems(
  items: MenuItemType[] | null | undefined,
  onClick?: MenuProps['onClick'],
  overlayClassName?: string,
  portalContainer?: HTMLElement,
) {
  if (!items?.length) return null;
  return items.map((item, idx) => {
    if (!item || item.type === 'divider') {
      return <DropdownMenu.Separator key={`d-${idx}`} className="pg-ui-menu-divider" />;
    }

    const key = String(item.key ?? idx);

    if (item.type === 'group') {
      return (
        <DropdownMenu.Group key={key}>
          {item.label != null && item.label !== false ? (
            <DropdownMenu.Label className="pg-ui-menu-group-label">{item.label}</DropdownMenu.Label>
          ) : null}
          {renderItems(item.children, onClick, overlayClassName, portalContainer)}
        </DropdownMenu.Group>
      );
    }

    if (item.children && item.children.length > 0) {
      return (
        <DropdownMenu.Sub key={key}>
          <DropdownMenu.SubTrigger
            className="pg-ui-menu-item pg-ui-menu-subtrigger"
            disabled={item.disabled}
            data-danger={item.danger ? 'true' : undefined}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            <ChevronRight size={14} aria-hidden style={{ opacity: 0.55, flexShrink: 0 }} />
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal container={portalContainer}>
            <DropdownMenu.SubContent
              className={cn('pg-ui-overlay-surface', 'pg-ui-menu', overlayClassName)}
              align="start"
              sideOffset={6}
              alignOffset={-4}
              avoidCollisions
              collisionPadding={8}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {renderItems(item.children, onClick, overlayClassName, portalContainer)}
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      );
    }

    return (
      <DropdownMenu.Item
        key={key}
        className="pg-ui-menu-item"
        disabled={item.disabled}
        data-danger={item.danger ? 'true' : undefined}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onSelect={(e) => {
          const domEvent = e as unknown as Event;
          domEvent.stopPropagation?.();
          item.onClick?.({ key, domEvent });
          onClick?.({ key, keyPath: [key], domEvent });
          if (item.keepOpen) e.preventDefault();
        }}
      >
        {item.icon}
        <span style={{ flex: 1 }}>{item.label}</span>
      </DropdownMenu.Item>
    );
  });
}

export const Dropdown: React.FC<DropdownProps> = ({
  menu,
  trigger = ['click'],
  placement = 'bottom',
  overlayClassName,
  overlayStyle,
  children,
  disabled,
  open,
  onOpenChange,
  dropdownRender,
  getPopupContainer,
}) => {
  const triggers = Array.isArray(trigger) ? trigger : [trigger];
  /** 仅右键：禁止左键打开（CanvasNode 高级节点菜单依赖此语义） */
  const contextMenuOnly =
    triggers.includes('contextMenu') && !triggers.includes('click') && !triggers.includes('hover');

  const side = sideMap[placement] || 'bottom';
  const align = alignMap[placement] || 'center';
  const triggerWrapRef = React.useRef<HTMLSpanElement | null>(null);
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | undefined>();
  const [ctxAnchor, setCtxAnchor] = React.useState<{ x: number; y: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = triggerWrapRef.current;
    const triggerEl = (el?.firstElementChild as HTMLElement | null) || el;
    setPortalContainer(resolvePortalContainer(triggerEl, getPopupContainer));
  }, [getPopupContainer]);

  const itemsNode = renderItems(menu?.items, menu?.onClick, overlayClassName, portalContainer);
  const menuNode = dropdownRender ? (
    dropdownRender(<>{itemsNode}</>)
  ) : (
    itemsNode
  );

  const content = (
    <DropdownMenu.Portal container={portalContainer}>
      <DropdownMenu.Content
        side={side}
        align={align}
        sideOffset={8}
        alignOffset={0}
        avoidCollisions
        collisionPadding={8}
        sticky="partial"
        className={cn('pg-ui-overlay-surface', 'pg-ui-menu', overlayClassName)}
        style={overlayStyle}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {menuNode}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );

  if (contextMenuOnly) {
    return (
      <DropdownMenu.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) setCtxAnchor(null);
          onOpenChange?.(next);
        }}
        modal={false}
      >
        <span
          ref={triggerWrapRef}
          style={{ display: 'contents' }}
          onContextMenu={(e) => {
            if (disabled) return;
            e.preventDefault();
            e.stopPropagation();
            setCtxAnchor({ x: e.clientX, y: e.clientY });
            onOpenChange?.(true);
          }}
        >
          {children}
        </span>
        {/* 虚拟锚点：把菜单定位到右键坐标，且不劫持节点左键 */}
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <span
            aria-hidden
            style={{
              position: 'fixed',
              left: ctxAnchor?.x ?? 0,
              top: ctxAnchor?.y ?? 0,
              width: 1,
              height: 1,
              margin: 0,
              padding: 0,
              border: 'none',
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenu.Trigger>
        {content}
      </DropdownMenu.Root>
    );
  }

  // Trigger 必须是原生可聚焦 DOM 节点。若 asChild 直接套在 Tooltip 等复合组件上，
  // Radix 无法正确接收点击（工作流左上角菜单 / 工具栏「新建」等会无反应）。
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <span
          ref={triggerWrapRef}
          style={{ display: 'inline-flex', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </span>
      </DropdownMenu.Trigger>
      {content}
    </DropdownMenu.Root>
  );
};
