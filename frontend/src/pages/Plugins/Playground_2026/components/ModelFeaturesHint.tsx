/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Imagine.art Settings 模型行悬停提示：logo + 名称 / 计费
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlaygroundModel } from '../types';
import ModelLogoIcon from './ModelLogoIcon';
import RateDisplay from '../../../Models/RateDisplay';
import './ModelFeaturesHint.css';

type FormatPrice = (price: number | string | undefined | null) => string;

type Props = {
  model: PlaygroundModel;
  currencySymbol: string;
  formatPrice: FormatPrice;
  children: React.ReactNode;
};

const SIDE_OFFSET = 8;
const CARD_W = 310;
const OPEN_DELAY = 500;
const CLOSE_DELAY = 100;
const SKIP_DELAY_MS = 300;

let lastHintCloseAt = 0;

const TokenSparkleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M4.66347 12.8022C3.77885 12.6457 3.77884 11.3544 4.66347 11.1979C7.86827 10.6309 10.4173 8.14873 11.1129 4.91746L11.1662 4.66976C11.3576 3.78073 12.6024 3.7752 12.8015 4.66249L12.8662 4.95115C13.5876 8.16717 16.1372 10.6284 19.3332 11.1938C20.2223 11.3511 20.2223 12.649 19.3332 12.8063C16.1372 13.3716 13.5876 15.8329 12.8662 19.0488L12.8015 19.3375C12.6024 20.2248 11.3576 20.2192 11.1662 19.3303L11.1129 19.0826C10.4173 15.8513 7.86827 13.3691 4.66347 12.8022Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const ModelFeaturesHint: React.FC<Props> = ({ model, currencySymbol, formatPrice, children }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const hasBilling = !!model.billing;

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };

  const placeCard = () => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const card = cardRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const cardH = card?.height || 120;
    const pad = 8;
    let left = Math.round(anchor.right + SIDE_OFFSET);
    if (left + CARD_W > window.innerWidth - pad) {
      left = Math.round(anchor.left - CARD_W - SIDE_OFFSET);
    }
    left = Math.max(pad, Math.min(left, window.innerWidth - CARD_W - pad));
    let top = Math.round(anchor.top + anchor.height / 2 - cardH / 2);
    top = Math.max(pad, Math.min(top, window.innerHeight - cardH - pad));
    setPos({ top, left });
  };

  const show = () => {
    clearTimers();
    const delay = Date.now() - lastHintCloseAt < SKIP_DELAY_MS ? 0 : OPEN_DELAY;
    openTimer.current = window.setTimeout(() => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (anchor) {
        let left = Math.round(anchor.right + SIDE_OFFSET);
        if (left + CARD_W > window.innerWidth - 8) {
          left = Math.round(anchor.left - CARD_W - SIDE_OFFSET);
        }
        setPos({
          left: Math.max(8, left),
          top: Math.round(anchor.top),
        });
      }
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      lastHintCloseAt = Date.now();
    }, CLOSE_DELAY);
  };

  useLayoutEffect(() => {
    if (!open) return;
    placeCard();
  }, [open, model.mid]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => placeCard();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  const theme =
    typeof document !== 'undefined' &&
    document.querySelector('.pg-ui-root[data-theme]')?.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';

  const card = open
    ? createPortal(
        <div className="pg-ui-root" data-theme={theme}>
          <div
            ref={cardRef}
            className="hf-mfh-card"
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
            onMouseEnter={() => {
              window.clearTimeout(closeTimer.current);
            }}
            onMouseLeave={hide}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hf-mfh-head">
              <ModelLogoIcon
                logo={model.logo}
                fallbackLetter={model.name || '?'}
                className="hf-mfh-logo"
                size={24}
              />
              <p className="hf-mfh-name">{model.name}</p>
            </div>
            <div className="hf-mfh-body">
              <div className="hf-mfh-chip">
                <TokenSparkleIcon />
              </div>
              <div className="hf-mfh-billing">
                <RateDisplay
                  rule={model.billing}
                  currencySymbol={currencySymbol}
                  formatPrice={formatPrice}
                  siteDiscount={model.global_discount}
                  siteDiscountEnabled={model.global_discount_enabled}
                  hideRuleLabel
                />
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (!hasBilling) return <>{children}</>;

  return (
    <div
      ref={anchorRef}
      className="hf-mfh-anchor"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      <button
        type="button"
        className="hf-mfh-info"
        aria-label="计费信息"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearTimers();
          setOpen((v) => !v);
        }}
      >
        <TokenSparkleIcon />
      </button>
      {card}
    </div>
  );
};

export default ModelFeaturesHint;
