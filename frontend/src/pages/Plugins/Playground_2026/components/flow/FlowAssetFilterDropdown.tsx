/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 资源库媒体类型筛选：下拉用 fixed portal，避免弹窗 overflow:hidden 截断导致无法点击
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type AssetMediaFilter = 'all' | 'image' | 'video' | 'audio';

type Props = {
  value: AssetMediaFilter;
  onChange: (v: AssetMediaFilter) => void;
  disabled?: boolean;
};

function IconFilter({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
    </svg>
  );
}

function IconChevron({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const OPTIONS: { key: AssetMediaFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '声音' },
];

const FlowAssetFilterDropdown: React.FC<Props> = ({ value, onChange, disabled = false }) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const label = value === 'image' ? '图片' : value === 'video' ? '视频' : value === 'audio' ? '声音' : '全部';

  const updatePos = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuW = 128;
    const left = Math.min(Math.max(8, r.right - menuW), window.innerWidth - menuW - 8);
    setPos({ top: r.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  return (
    <div className="pg-flow-assets-filter">
      <button
        ref={btnRef}
        type="button"
        className="pg-flow-assets-filter-btn"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(e) => {
          // 避免按钮抢焦点触发 scrollIntoView 带动画布位移
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <IconFilter />
        <span>{label}</span>
        <IconChevron />
      </button>
      {open &&
        !disabled &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="pg-flow-assets-filter-menu is-portal"
            role="listbox"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={value === opt.key}
                className={value === opt.key ? 'is-active' : ''}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default FlowAssetFilterDropdown;
