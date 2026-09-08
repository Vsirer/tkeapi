/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { useEffect, useState, useCallback } from 'react';

export type PinnedShortcutType = 'feature' | 'model';
export type PinnedShortcutKind = 'image' | 'video';

export interface PinnedShortcut {
  id: string; // 唯一标识符，如 "model:image:xxx", "feature:video:text-to-video"
  type: PinnedShortcutType;
  kind: PinnedShortcutKind;
  key?: string; // 功能键名
  mid?: string; // 模型 mid
  name: string; // 显示名称
  desc?: string; // 描述
  logo?: string; // 模型 Logo
  icon?: string; // 图标标识
  createdAt?: number;
}

const STORAGE_KEY = 'playground_2026_pinned_shortcuts';
export const PINNED_SHORTCUTS_EVENT = 'pg2026-pinned-shortcuts-changed';

export function getPinnedShortcuts(): PinnedShortcut[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('[pinnedShortcuts] Failed to parse pinned shortcuts:', e);
    return [];
  }
}

export function savePinnedShortcuts(items: PinnedShortcut[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(PINNED_SHORTCUTS_EVENT));
  } catch (e) {
    console.error('[pinnedShortcuts] Failed to save pinned shortcuts:', e);
  }
}

function isShortcutPinned(id: string): boolean {
  const current = getPinnedShortcuts();
  return current.some((item) => item.id === id);
}

export function togglePinShortcut(item: PinnedShortcut): boolean {
  const current = getPinnedShortcuts();
  const index = current.findIndex((it) => it.id === item.id);
  let next: PinnedShortcut[];
  let pinned = false;

  if (index >= 0) {
    next = current.filter((it) => it.id !== item.id);
    pinned = false;
  } else {
    next = [...current, { ...item, createdAt: Date.now() }];
    pinned = true;
  }

  savePinnedShortcuts(next);
  return pinned;
}

export function unpinShortcut(id: string): void {
  const current = getPinnedShortcuts();
  const next = current.filter((it) => it.id !== id);
  if (next.length !== current.length) {
    savePinnedShortcuts(next);
  }
}

export function usePinnedShortcuts() {
  const [pinnedItems, setPinnedItems] = useState<PinnedShortcut[]>(() => getPinnedShortcuts());

  useEffect(() => {
    const handleUpdate = () => {
      setPinnedItems(getPinnedShortcuts());
    };

    window.addEventListener(PINNED_SHORTCUTS_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(PINNED_SHORTCUTS_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const toggle = useCallback((item: PinnedShortcut) => {
    return togglePinShortcut(item);
  }, []);

  const unpin = useCallback((id: string) => {
    unpinShortcut(id);
  }, []);

  const checkPinned = useCallback(
    (id: string) => pinnedItems.some((it) => it.id === id),
    [pinnedItems],
  );

  return {
    pinnedItems,
    togglePin: toggle,
    unpin,
    isPinned: checkPinned,
  };
}
