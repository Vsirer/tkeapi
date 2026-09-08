/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 可拖动画布节点上的按钮：mousedown 不拦截拖拽，但拖动后松手产生的 click 应忽略。
 */
import { useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';

const DEFAULT_THRESHOLD_PX = 5;

export type ClickUnlessDragHandlers = {
  onMouseDown: (e: ReactMouseEvent) => void;
  onClick: (e: ReactMouseEvent) => void;
};

/** 稳定 handlers；onActivate 经 ref 始终最新 */
export function useClickUnlessDrag(
  onActivate: (e: ReactMouseEvent) => void,
  thresholdPx: number = DEFAULT_THRESHOLD_PX,
): ClickUnlessDragHandlers {
  const draggedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  return useMemo(
    () => ({
      onMouseDown: (e: ReactMouseEvent) => {
        // 不 stopPropagation：允许节点拖动从该区域开始
        draggedRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };
        const onMove = (ev: MouseEvent) => {
          const s = startRef.current;
          if (Math.hypot(ev.clientX - s.x, ev.clientY - s.y) >= thresholdPx) {
            draggedRef.current = true;
          }
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
      onClick: (e: ReactMouseEvent) => {
        e.stopPropagation();
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onActivateRef.current(e);
      },
    }),
    [thresholdPx],
  );
}
