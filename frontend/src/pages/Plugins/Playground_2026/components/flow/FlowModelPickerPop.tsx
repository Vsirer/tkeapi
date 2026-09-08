/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 属性面板内模型选择弹出层（对齐 Imagine：左侧弹出、搜索 + 列表）
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SearchOutlined, CheckOutlined } from '../../ui';
import type { PlaygroundModel } from '../../types';
import ModelLogoIcon from '../ModelLogoIcon';
import { useDebouncedSearchKeyword } from '../../hooks/useDebouncedSearchKeyword';
import { filterModelsByKind, type FlowModelKind } from '../../utils/flowDefaultModel';
import { resolveModelLogoSrc } from '../../utils/modelLogo';
import { sortModelsByBrandMaxThenOrder } from '../../utils/sortModelsByScheme';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  models: PlaygroundModel[];
  selectedMid?: string | null;
  kind: FlowModelKind;
  onSelect: (model: PlaygroundModel) => void;
};

const FlowModelPickerPop: React.FC<Props> = ({
  open,
  onOpenChange,
  anchorRef,
  models,
  selectedMid,
  kind,
  onSelect,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const { searchKeyword, searchInputProps, setSearchKeyword } = useDebouncedSearchKeyword();

  const pool = useMemo(() => filterModelsByKind(models, kind), [models, kind]);

  const filtered = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    const list = !q
      ? pool
      : pool.filter((m) => {
          const hay = `${m.name || ''} ${m.model_id || ''} ${m.scheme_name || ''} ${m.description || ''}`.toLowerCase();
          return hay.includes(q);
        });
    return sortModelsByBrandMaxThenOrder(list);
  }, [pool, searchKeyword]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const width = 380;
      const height = Math.min(478, window.innerHeight - 24);
      // Imagine：弹层开在属性栏左侧、锚定模型行
      let left = r.left - width - 10;
      if (left < 12) left = Math.min(r.right + 10, window.innerWidth - width - 12);
      let top = r.top - 8;
      if (top + height > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - height - 12);
      }
      setPos({ top, left, width, height });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    setSearchKeyword('');
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, anchorRef, setSearchKeyword]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="pg-flow-model-pop"
      style={{ top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
      role="listbox"
      aria-label="选择模型"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="pg-flow-model-pop-search">
        <SearchOutlined className="pg-flow-model-pop-search-icon" />
        <input
          {...searchInputProps}
          placeholder="搜索模型"
          aria-label="搜索模型"
        />
      </div>

      <div className="pg-flow-model-pop-tabs" role="tablist">
        <span className="pg-flow-model-pop-tab is-active" role="tab" aria-selected>
          {kind === 'video' ? '视频' : '生成'}
        </span>
      </div>

      <div className="pg-flow-model-pop-list">
        {filtered.length === 0 ? (
          <div className="pg-flow-model-pop-empty">暂无可用模型</div>
        ) : (
          filtered.map((m) => {
            const selected = selectedMid === m.mid;
            const logo = resolveModelLogoSrc(m.logo);
            return (
              <button
                key={m.mid}
                type="button"
                role="option"
                aria-selected={selected}
                className={`pg-flow-model-pop-item${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onSelect(m);
                  onOpenChange(false);
                }}
              >
                <span className="pg-flow-model-pop-logo">
                  <ModelLogoIcon
                    logo={m.logo}
                    fallbackLetter={m.name || m.model_id}
                    size={24}
                  />
                </span>
                <span className="pg-flow-model-pop-meta">
                  <span className="pg-flow-model-pop-name-row">
                    <span className="pg-flow-model-pop-name">{m.name || m.model_id}</span>
                    {selected && <CheckOutlined className="pg-flow-model-pop-check" />}
                  </span>
                  <span className="pg-flow-model-pop-desc">
                    {m.scheme_name || m.scheme_type || m.type_name || m.model_id || ' '}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
};

export default FlowModelPickerPop;
