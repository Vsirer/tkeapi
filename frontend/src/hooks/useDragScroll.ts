/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { useRef, useEffect } from 'react';

interface UseDragScrollOptions {
  /**
   * 拖拽灵敏度倍率，默认 1.25
   */
  speed?: number;
  /**
   * 是否启用，默认 true
   */
  enabled?: boolean;
}

/**
 * 通用鼠标按住拖拽左右滑动 Hook
 * 保持鼠标原本样式，仅在按住鼠标左键横向拖拽时平滑滑动表格
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(options: UseDragScrollOptions = {}) {
  const { speed = 1.25, enabled = true } = options;
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;

    // 获取实际产生横向滚动的子元素（兼容 Ant Design Table 与普通容器）
    const getScrollEl = (): HTMLElement => {
      const antdContent = container.querySelector('.ant-table-content') as HTMLElement | null;
      const antdBody = container.querySelector('.ant-table-body') as HTMLElement | null;
      if (antdContent && antdContent.scrollWidth > antdContent.clientWidth) return antdContent;
      if (antdBody && antdBody.scrollWidth > antdBody.clientWidth) return antdBody;
      if (container.scrollWidth > container.clientWidth) return container;
      return antdContent || antdBody || container;
    };

    const onMouseDown = (e: MouseEvent) => {
      // 忽略鼠标右键/中键
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      // 忽略在输入框、文本域、选择器、分页器、下拉菜单、Modal 内的操作
      if (target.closest('input, textarea, select, .ant-pagination, .ant-dropdown, .ant-modal, .ant-select')) {
        return;
      }

      const scrollEl = getScrollEl();
      if (!scrollEl || scrollEl.scrollWidth <= scrollEl.clientWidth + 2) {
        return;
      }

      isDown = true;
      hasMoved = false;
      startX = e.pageX - scrollEl.getBoundingClientRect().left;
      scrollLeft = scrollEl.scrollLeft;

      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const scrollEl = getScrollEl();
      if (!scrollEl) return;

      const currentX = e.pageX - scrollEl.getBoundingClientRect().left;
      const walk = (currentX - startX) * speed;

      if (Math.abs(currentX - startX) > 4) {
        hasMoved = true;
      }

      scrollEl.scrollLeft = scrollLeft - walk;
    };

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      document.body.style.removeProperty('user-select');

      if (hasMoved) {
        // 如果产生了明显的拖拽移动，拦截当次触发的 click 事件以防误点按钮/链接
        const preventClick = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          window.removeEventListener('click', preventClick, true);
        };
        window.addEventListener('click', preventClick, true);
        setTimeout(() => {
          window.removeEventListener('click', preventClick, true);
        }, 80);
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.removeProperty('user-select');
    };
  }, [enabled, speed]);

  return containerRef;
}
