/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工具栏筛选/排序下拉：fixed portal，避免移动端 flex overflow 把选项裁没
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  onDismiss: () => void;
};

const ToolbarMenuPop: React.FC<Props> = ({ open, anchorRef, children, onDismiss }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePos = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = Math.max(160, r.width);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - menuW - 8);
    setPos({ top: r.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onDismiss();
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
  }, [open, onDismiss, anchorRef]);

  if (!open || !pos) return null;

  const theme =
    typeof document !== 'undefined' &&
    document.querySelector('.pg-ui-root[data-theme]')?.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';

  return createPortal(
    <div
      className="pg-ig pg-ui-root"
      data-theme={theme}
      style={{ background: 'transparent', position: 'static' }}
    >
      <div
        ref={menuRef}
        role="listbox"
        className="pg-ig-wf-menu-pop is-portal"
        style={{ top: pos.top, left: pos.left, minWidth: 160 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default ToolbarMenuPop;
