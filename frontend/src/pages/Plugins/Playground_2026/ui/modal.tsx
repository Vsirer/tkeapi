/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { createRoot, type Root } from 'react-dom/client';
import { cn } from './lib/cn';
import { Button } from './button';
import { CloseOutlined } from './icons';
import { getSharedModalStyles } from '../utils/modalStyles';

/** Portal 挂到 body 后脱离 .pg-ui-root，需自行挂载主题根以继承 CSS 变量 */
function resolvePgUiTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  const el = document.querySelector('.pg-ui-root[data-theme]');
  const theme = el?.getAttribute('data-theme');
  return theme === 'light' ? 'light' : 'dark';
}

function ThemePortalShell({ children, className }: { children: React.ReactNode; className?: string }) {
  const mode = resolvePgUiTheme();
  // 不用 display:contents：部分浏览器下自定义属性无法正确继承到 Portal 子节点
  return (
    <div className={cn('pg-ui-root', className)} data-theme={mode}>
      {children}
    </div>
  );
}

export interface ModalProps {
  open?: boolean;
  title?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode | null;
  width?: number | string;
  onCancel?: (e?: any) => void;
  onOk?: (e?: any) => void;
  confirmLoading?: boolean;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  okButtonProps?: React.ComponentProps<typeof Button> & Record<string, any>;
  cancelButtonProps?: React.ComponentProps<typeof Button> & Record<string, any>;
  closable?: boolean;
  closeIcon?: React.ReactNode | null;
  maskClosable?: boolean;
  destroyOnClose?: boolean;
  destroyOnHidden?: boolean;
  centered?: boolean;
  className?: string;
  wrapClassName?: string;
  style?: React.CSSProperties;
  styles?: {
    content?: React.CSSProperties;
    header?: React.CSSProperties;
    body?: React.CSSProperties;
    mask?: React.CSSProperties | Record<string, any>;
    footer?: React.CSSProperties;
  };
  zIndex?: number;
  afterClose?: () => void;
  /** antd 兼容占位 */
  getContainer?: any;
  forceRender?: boolean;
  keyboard?: boolean;
  mask?: boolean | { closable?: boolean };
}

export const Modal: React.FC<ModalProps> & {
  confirm: (config: ConfirmConfig) => { destroy: () => void; update: (c: ConfirmConfig) => void };
} = ({
  open = false,
  title,
  children,
  footer,
  width = 520,
  onCancel,
  onOk,
  confirmLoading,
  okText = '确定',
  cancelText = '取消',
  okButtonProps,
  cancelButtonProps,
  closable = true,
  maskClosable = true,
  destroyOnClose,
  destroyOnHidden,
  className,
  wrapClassName,
  styles,
  zIndex,
  style,
  closeIcon,
  mask,
}) => {
  const [mountedOnce, setMountedOnce] = React.useState(open);
  React.useEffect(() => {
    if (open) setMountedOnce(true);
  }, [open]);

  const shouldDestroy = destroyOnClose || destroyOnHidden;
  if (shouldDestroy && !open && !mountedOnce) return null;
  if (shouldDestroy && !open) return null;

  const resolvedMaskClosable =
    typeof mask === 'object' && mask ? mask.closable !== false : maskClosable;

  const defaultFooter = (
    <>
      <Button type="default" onClick={onCancel} {...cancelButtonProps}>
        {cancelText}
      </Button>
      <Button type="primary" loading={confirmLoading} onClick={onOk} {...okButtonProps}>
        {okText}
      </Button>
    </>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel?.();
      }}
    >
      <Dialog.Portal>
        <ThemePortalShell className={wrapClassName}>
          <Dialog.Overlay
            className="pg-ui-modal-overlay"
            style={{ zIndex, ...(styles?.mask as React.CSSProperties | undefined) }}
            onClick={(e) => {
              e.stopPropagation();
              if (!resolvedMaskClosable) e.preventDefault();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <Dialog.Content
            className={cn('pg-ui-modal', className)}
            style={{
              width: typeof width === 'number' ? width : width,
              zIndex: (zIndex ?? 5400) + 1,
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              maxHeight: '90vh',
              overflow: 'auto',
              ...style,
              ...styles?.content,
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onInteractOutside={(e) => {
              if (!resolvedMaskClosable) e.preventDefault();
            }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {(title != null || closable) && (
              <div className="pg-ui-modal-header" style={styles?.header}>
                <Dialog.Title asChild>
                  <div style={{ flex: 1 }}>{title}</div>
                </Dialog.Title>
                {closable && (
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="pg-ui-btn pg-ui-btn-text pg-ui-btn-sm pg-ui-btn-circle"
                      aria-label="Close"
                      onClick={onCancel}
                    >
                      {closeIcon === null ? null : closeIcon ?? <CloseOutlined size={14} />}
                    </button>
                  </Dialog.Close>
                )}
              </div>
            )}
            <div className="pg-ui-modal-body" style={styles?.body}>
              {children}
            </div>
            {footer !== null && (
              <div className="pg-ui-modal-footer" style={styles?.footer}>
                {footer === undefined ? defaultFooter : footer}
              </div>
            )}
          </Dialog.Content>
        </ThemePortalShell>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export interface ConfirmConfig {
  title?: React.ReactNode;
  content?: React.ReactNode;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  okType?: 'primary' | 'default' | 'dashed' | 'link' | 'text' | 'danger';
  okButtonProps?: React.ComponentProps<typeof Button> & Record<string, any>;
  cancelButtonProps?: React.ComponentProps<typeof Button> & Record<string, any>;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  centered?: boolean;
  width?: number | string;
  icon?: React.ReactNode;
  danger?: boolean;
  wrapClassName?: string;
  className?: string;
  styles?: ModalProps['styles'];
  zIndex?: number;
}

type ConfirmHostState = ConfirmConfig & { open: boolean };

const ConfirmHost: React.FC<{
  initial: ConfirmConfig;
  onDone: () => void;
}> = ({ initial, onDone }) => {
  const [state, setState] = React.useState<ConfirmHostState>({ ...initial, open: true });
  const [loading, setLoading] = React.useState(false);

  const close = () => {
    setState((s) => ({ ...s, open: false }));
    setTimeout(onDone, 180);
  };

  const isLight = resolvePgUiTheme() === 'light';
  const shared = getSharedModalStyles(isLight);

  return (
    <Modal
      open={state.open}
      title={
        state.icon == null ? (
          state.title
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {state.icon}
            <span>{state.title}</span>
          </div>
        )
      }
      width={state.width ?? 380}
      zIndex={state.zIndex ?? 6000}
      className={state.className}
      wrapClassName={state.wrapClassName}
      confirmLoading={loading}
      okText={state.okText ?? '确定'}
      cancelText={state.cancelText ?? '取消'}
      styles={{
        ...shared.styles,
        ...state.styles,
      }}
      okButtonProps={{
        danger: state.danger || state.okType === 'danger' || state.okButtonProps?.danger,
        type: state.okType === 'danger' ? 'primary' : state.okType || 'primary',
        ...shared.okButtonProps,
        ...state.okButtonProps,
      }}
      cancelButtonProps={state.cancelButtonProps}
      onCancel={() => {
        state.onCancel?.();
        close();
      }}
      onOk={async () => {
        try {
          setLoading(true);
          await state.onOk?.();
          close();
        } catch {
          // 保留弹窗，便于用户修正后重试（如校验失败）
        } finally {
          setLoading(false);
        }
      }}
    >
      <div style={{ paddingTop: 12, paddingBottom: 6, color: isLight ? '#52525b' : '#a1a1aa', fontSize: 13.5, lineHeight: 1.6 }}>
        {state.content}
      </div>
    </Modal>
  );
};

Modal.confirm = (config: ConfirmConfig) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  let latest = config;
  let hostKey = 0;

  const render = (cfg: ConfirmConfig, remount = false) => {
    latest = cfg;
    if (remount) hostKey += 1;
    root?.render(
      <ConfirmHost
        key={hostKey}
        initial={cfg}
        onDone={() => {
          root?.unmount();
          root = null;
          container.remove();
        }}
      />,
    );
  };

  render(config);
  return {
    destroy: () => {
      root?.unmount();
      root = null;
      container.remove();
    },
    update: (c: ConfirmConfig) => render({ ...latest, ...c }, true),
  };
};
