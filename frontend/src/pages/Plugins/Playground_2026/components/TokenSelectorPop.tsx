/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * API 密钥选择器 — Imagine 居中弹窗；内容逻辑对齐创作中心
 * 仅 playground_2026 使用
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DownOutlined } from '../ui';
import type { ApiTokenItem } from '../utils/imageGenerationApi';
import { FlowIconKey } from './flow/flowIcons';
import TokenPanelContent from './TokenPanelContent';
import './TokenSelectorPop.css';

export type TokenSelectorPopProps = {
  tokens: ApiTokenItem[];
  selectedTokenKey: string;
  onTokensChange: (tokens: ApiTokenItem[]) => void;
  onSelect: (tokenKey: string) => void;
  /** 触发器外观：工具栏芯片 / 节点内紧凑芯片 / 底部操作栏图标按钮 */
  variant?: 'toolbar' | 'node' | 'opbar';
  className?: string;
  disabled?: boolean;
  /** 受控打开（可选） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const TokenSelectorPop: React.FC<TokenSelectorPopProps> = ({
  tokens,
  selectedTokenKey,
  onTokensChange,
  onSelect,
  variant = 'toolbar',
  className = '',
  disabled = false,
  open: openProp,
  onOpenChange,
}) => {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const current = tokens.find((t) => t.token_key === selectedTokenKey);
  const defaultNoKeyLabel = tokens.length === 0
    ? t('playground_2026:create_token_short', '创建密钥')
    : t('playground_2026:image_gen_no_token_short', 'API 密钥');
  const label = current?.name || (selectedTokenKey ? `${selectedTokenKey.slice(0, 8)}…` : defaultNoKeyLabel);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      const el = target instanceof Element ? target : (target as Node).parentElement;
      if (el?.closest?.('[data-radix-popper-content-wrapper], [data-radix-portal]')) return;
      // 点遮罩关闭（面板本身已 stopPropagation）
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={`hf-tsp-wrap${open ? ' is-open' : ''} hf-tsp-${variant}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className={`hf-tsp-trigger${open ? ' active' : ''}${!selectedTokenKey ? ' warn' : ''}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title={variant === 'opbar' ? (label || '选择 API 密钥') : '选择 API 密钥'}
        aria-label="选择 API 密钥"
      >
        <FlowIconKey size={variant === 'node' ? 14 : 18} />
        {variant !== 'opbar' && (
          <>
            <span className="hf-tsp-trigger-label">{label}</span>
            <DownOutlined className="hf-tsp-caret" />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="hf-tsp-modal-root"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={panelRef}
              className="hf-tsp-panel hf-tsp-modal-panel hf-tsp-panel-rich"
              role="dialog"
              aria-label="使用创作中心请关联API密钥令牌"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <TokenPanelContent
                tokens={tokens}
                selectedTokenKey={selectedTokenKey}
                onTokensChange={onTokensChange}
                onSelect={onSelect}
                onClose={() => setOpen(false)}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default TokenSelectorPop;
