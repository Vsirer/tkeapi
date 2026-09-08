/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';

/** 缩放手柄方向 */
export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Imagine Flow 选中缩放仅四角 */
export const CORNER_RESIZE_DIRECTIONS: ResizeDirection[] = ['nw', 'ne', 'se', 'sw'];

/** Imagine：媒体节点最小/最大边长（预览盒） */
export const FLOW_MEDIA_MIN_SIZE = 320;
export const FLOW_MEDIA_MAX_SIZE = 1280;

/**
 * Imagine 四角手柄：
 * - 定位用 left/top = 0% 或 100%（不用 right/bottom）
 * - 命中区叠在 panel 之上（CSS z-index），弧线仍只露在圆角外侧
 */
const CORNER_STYLE: Record<
  'nw' | 'ne' | 'se' | 'sw',
  { className: string }
> = {
  nw: { className: 'pg-flow-resize-handle dir-nw' },
  ne: { className: 'pg-flow-resize-handle dir-ne' },
  se: { className: 'pg-flow-resize-handle dir-se' },
  sw: { className: 'pg-flow-resize-handle dir-sw' },
};

/** Imagine 风格四角缩放手柄 */
export const ResizeHandle: React.FC<{
  direction: ResizeDirection;
  onMouseDown: (e: React.MouseEvent, dir: ResizeDirection) => void;
}> = ({ direction, onMouseDown }) => {
  const isCorner = direction === 'nw' || direction === 'ne' || direction === 'se' || direction === 'sw';
  if (!isCorner) return null;

  return (
    <div
      className={CORNER_STYLE[direction].className}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onMouseDown(e, direction);
      }}
      aria-hidden
    />
  );
};
