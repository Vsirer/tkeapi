/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 程序化打开的 API 密钥面板（Imagine 样式 + 创作中心逻辑/文案）
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlayground } from '../context/PlaygroundContext';
import TokenPanelContent from './TokenPanelContent';
import './TokenSelectorPop.css';

const TokenModal: React.FC = React.memo(() => {
  const {
    isTokenModalVisible,
    setIsTokenModalVisible,
    apiTokens,
    setApiTokens,
    selectedTokenKey,
    setSelectedTokenKey,
  } = usePlayground();

  useEffect(() => {
    if (!isTokenModalVisible) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTokenModalVisible(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTokenModalVisible, setIsTokenModalVisible]);

  if (!isTokenModalVisible) return null;

  const close = () => setIsTokenModalVisible(false);

  return createPortal(
    <div className="hf-tsp-modal-root" onMouseDown={close}>
      <div
        className="hf-tsp-panel hf-tsp-modal-panel hf-tsp-panel-rich"
        role="dialog"
        aria-label="使用创作中心请关联API密钥令牌"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <TokenPanelContent
          tokens={apiTokens}
          selectedTokenKey={selectedTokenKey}
          onTokensChange={setApiTokens}
          onSelect={setSelectedTokenKey}
          onClose={close}
        />
      </div>
    </div>,
    document.body,
  );
});

TokenModal.displayName = 'TokenModal';
export default TokenModal;
