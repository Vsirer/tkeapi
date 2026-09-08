/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/** 侧栏收展按钮 — 对齐 imagine.art 侧栏 header 图标 */
import React from 'react';
import { CustomIcon } from '../icons';
import { useSidebarCollapse } from './sidebarCollapseContext';

type Props = {
  className?: string;
  title?: string;
  size?: number;
};

const SidebarToggleButton: React.FC<Props> = ({ className, title, size = 16 }) => {
  const { collapsed, toggleCollapsed } = useSidebarCollapse();

  return (
    <button
      type="button"
      className={className || 'pg-ig-sidebar-toggle'}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={title || (collapsed ? '展开侧栏' : '收起侧栏')}
      onClick={(e) => {
        e.stopPropagation();
        toggleCollapsed();
      }}
    >
      <CustomIcon name="sidebar-toggle" size={size} />
    </button>
  );
};

export default React.memo(SidebarToggleButton);
