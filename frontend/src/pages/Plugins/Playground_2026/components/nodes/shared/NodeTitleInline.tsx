/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 节点左上角标题：单击 / 菜单触发 → Imagine 式内联重命名
 * 交互对齐界面左上角工作流改名：进入时全选，再点一下进入插入态
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from '../../PlaygroundToast';

type Props = {
  nodeId: string;
  title: string;
  onCommit: (next: string) => void;
};

/** 根据点击 X 估算 caret 位置（再点一下插入） */
function caretIndexFromClientX(input: HTMLInputElement, clientX: number): number {
  const value = input.value;
  if (!value) return 0;

  const style = window.getComputedStyle(input);
  const mirror = document.createElement('span');
  mirror.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'white-space:pre',
    `font:${style.font}`,
    `letter-spacing:${style.letterSpacing}`,
    `text-transform:${style.textTransform}`,
  ].join(';');
  document.body.appendChild(mirror);

  const rect = input.getBoundingClientRect();
  const paddingLeft = parseFloat(style.paddingLeft || '0') || 0;
  const target = clientX - rect.left - paddingLeft + input.scrollLeft;

  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    mirror.textContent = value.slice(0, mid);
    if (mirror.offsetWidth <= target) lo = mid;
    else hi = mid - 1;
  }
  document.body.removeChild(mirror);
  return Math.max(0, Math.min(value.length, lo));
}

const NodeTitleInline: React.FC<Props> = ({ nodeId, title, onCommit }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);
  /** 进入编辑后刚全选过；下一次点击改为插入态 */
  const justSelectedAllRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    const onRename = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId: string }>).detail;
      if (detail?.nodeId !== nodeId) return;
      setDraft(title);
      setEditing(true);
    };
    window.addEventListener('pg-flow-rename-node', onRename);
    return () => window.removeEventListener('pg-flow-rename-node', onRename);
  }, [nodeId, title]);

  useEffect(() => {
    if (!editing) {
      justSelectedAllRef.current = false;
      return undefined;
    }
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
      justSelectedAllRef.current = true;
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft(title);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      toast.warning('名称不能为空');
      setDraft(title);
      setEditing(false);
      return;
    }
    if (next !== title) {
      onCommit(next);
      toast.success('已重命名');
    }
    setEditing(false);
  };

  const cancel = () => {
    skipBlurCommit.current = true;
    setDraft(title);
    setEditing(false);
  };

  const handleInputMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    // 与顶栏一致：首次进入已全选，再点一下落到插入光标
    if (!justSelectedAllRef.current) return;
    justSelectedAllRef.current = false;
    const clientX = e.clientX;
    // 等浏览器处理本次 mousedown 后，若仍全选则强制折叠到点击处
    window.setTimeout(() => {
      if (inputRef.current !== el) return;
      const allSelected =
        el.selectionStart === 0 &&
        el.selectionEnd === el.value.length &&
        el.value.length > 0;
      if (!allSelected) return;
      const idx = caretIndexFromClientX(el, clientX);
      el.setSelectionRange(idx, idx);
    }, 0);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="pg-flow-node-title-input"
        value={draft}
        maxLength={64}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleInputMouseDown}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          commit();
        }}
      />
    );
  }

  return (
    <span
      className="pg-flow-node-title"
      title={`${title}（点击重命名）`}
      onClick={startEdit}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {title}
    </span>
  );
};

export default NodeTitleInline;
