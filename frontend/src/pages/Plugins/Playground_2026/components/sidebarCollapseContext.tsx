/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 侧栏收展状态：仅侧栏 / 顶栏开关订阅，主内容区不订阅以免重渲
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from 'react';

type SidebarCollapseContextValue = {
  collapsed: boolean;
  isMobile: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleCollapsed: () => void;
};

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null);

export function SidebarCollapseProvider({
  children,
  initialCollapsed,
  isMobile,
}: {
  children: React.ReactNode;
  initialCollapsed: boolean;
  isMobile: boolean;
}) {
  const [collapsed, setCollapsedRaw] = useState(initialCollapsed);

  useEffect(() => {
    if (isMobile) setCollapsedRaw(true);
  }, [isMobile]);

  const setCollapsed = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    startTransition(() => {
      setCollapsedRaw(v);
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => !v);
  }, [setCollapsed]);

  const value = useMemo(
    () => ({ collapsed, isMobile, setCollapsed, toggleCollapsed }),
    [collapsed, isMobile, setCollapsed, toggleCollapsed],
  );

  return (
    <SidebarCollapseContext.Provider value={value}>{children}</SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse(): SidebarCollapseContextValue {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error('useSidebarCollapse must be used within SidebarCollapseProvider');
  }
  return ctx;
}
