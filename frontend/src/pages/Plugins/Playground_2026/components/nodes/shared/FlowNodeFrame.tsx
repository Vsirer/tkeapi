/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Imagine Flow 节点外框基组件
 * - 外层：定位 / 选中 / 拖拽命中 / 四角缩放手柄（在面板之下，只露出圆角外弧）
 * - 内层 panel：背景、描边、圆角、阴影
 */
import React from 'react';
import { CORNER_RESIZE_DIRECTIONS, ResizeHandle } from '../ResizeHandle';
import type { ResizeDirection } from '../ResizeHandle';
import { useConnectDragDimClass } from '../../../hooks/useConnectDragDim';

export type FlowNodeFrameProps = {
  nodeId: string;
  width?: number;
  height?: number | 'auto';
  x?: number;
  y?: number;
  zIndex?: number;
  isMobile?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  /** 透明外壳（如 prompt） */
  transparent?: boolean;
  /** 内容撑开高度（媒体节点），panel 不强制 100% */
  autoHeight?: boolean;
  hideResizeHandles?: boolean;
  showResizeHandles?: boolean;
  activeTool?: string;
  className?: string;
  panelClassName?: string;
  style?: React.CSSProperties;
  toolbar?: React.ReactNode;
  /** 渲染在 panel 外、手柄之上（连接点等） */
  overlays?: React.ReactNode;
  onSelect?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onResizeStart?: (e: React.MouseEvent, dir: ResizeDirection) => void;
  children: React.ReactNode;
};

const FlowNodeFrame = React.forwardRef<HTMLDivElement, FlowNodeFrameProps>(function FlowNodeFrame(
  {
    nodeId,
    width,
    height = 'auto',
    x,
    y,
    zIndex,
    isMobile,
    isSelected,
    isDragging,
    transparent,
    autoHeight,
    hideResizeHandles,
    showResizeHandles,
    activeTool = 'pointer',
    className,
    panelClassName,
    style,
    toolbar,
    overlays,
    onSelect,
    onMouseDown,
    onMouseEnter,
    onMouseLeave,
    onResizeStart,
    children,
  },
  ref,
) {
  const connectDimClass = useConnectDragDimClass(nodeId);
  const canResize =
    !!showResizeHandles &&
    !!isSelected &&
    !isMobile &&
    !hideResizeHandles &&
    activeTool === 'pointer' &&
    !!onResizeStart;

  const resolvedAutoHeight = autoHeight ?? height === 'auto';
  const localRef = React.useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  // 拖拽中 DOM 已跟手；若用 React 的 x/y 重绘会把节点弹回按下点
  let left: React.CSSProperties['left'] = isMobile ? undefined : x;
  let top: React.CSSProperties['top'] = isMobile ? undefined : y;
  if (!isMobile && isDragging && localRef.current) {
    const sl = localRef.current.style.left;
    const st = localRef.current.style.top;
    if (sl) left = sl;
    if (st) top = st;
  }

  return (
    <div
      ref={setRef}
      data-node-id={nodeId}
      data-flow-frame="true"
      className={[
        'pg-flow-node-frame',
        isSelected ? 'is-selected' : '',
        isDragging ? 'is-dragging' : '',
        transparent ? 'is-transparent' : '',
        resolvedAutoHeight ? 'is-auto-height' : '',
        connectDimClass,
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: isMobile ? 'relative' : 'absolute',
        left,
        top,
        width: isMobile ? '100%' : width,
        height: isMobile ? undefined : height === 'auto' ? 'auto' : height,
        zIndex: isMobile ? undefined : zIndex,
        ...style,
      }}
    >
      {/* 手柄叠在 panel 之上：整块角区可拖，视觉仍是外侧弧线 */}
      {canResize &&
        CORNER_RESIZE_DIRECTIONS.map((dir) => (
          <ResizeHandle key={dir} direction={dir} onMouseDown={onResizeStart!} />
        ))}

      <div className={['pg-flow-node-panel', panelClassName || ''].filter(Boolean).join(' ')}>
        {children}
      </div>

      {overlays}
      {toolbar}
    </div>
  );
});

FlowNodeFrame.displayName = 'FlowNodeFrame';
export default React.memo(FlowNodeFrame);
