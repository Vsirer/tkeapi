/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流区块 — 对齐 Imagine Flow Section：
 * 浮在上方的标题 + 16px 圆角底板；操作栏与其它节点共用 pg-flow-node-tb
 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Tooltip, Popover } from '../../ui';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import { useThemeStore } from '../../../../../store/theme';
import { CORNER_RESIZE_DIRECTIONS, ResizeHandle } from './ResizeHandle';
import type { ResizeDirection } from './ResizeHandle';
import type { CanvasNode } from '../../types';
import NodeMoreMenu, { getNodeDisplayTitle } from './shared/NodeMoreMenu';
import NodeTitleInline from './shared/NodeTitleInline';
import { useConnectDragDimClass } from '../../hooks/useConnectDragDim';

interface SectionNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  isDragging: boolean;
  activeTool: string;
  onMouseDown: (e: React.MouseEvent, id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, nodeId: string, direction: ResizeDirection) => void;
  isMobile?: boolean;
}

const COLOR_PRESETS = [
  { key: 'gray', label: '默认', color: 'rgba(255,255,255,0.3)', bgDark: '#1a1a1a', bgLight: '#f4f4f5' },
  { key: 'blue', label: '蓝', color: '#3b82f6', bgDark: 'rgba(59,130,246,0.08)', bgLight: 'rgba(59,130,246,0.06)' },
  { key: 'purple', label: '紫', color: '#a855f7', bgDark: 'rgba(168,85,247,0.08)', bgLight: 'rgba(168,85,247,0.06)' },
  { key: 'green', label: '绿', color: '#10b981', bgDark: 'rgba(16,185,129,0.08)', bgLight: 'rgba(16,185,129,0.06)' },
  { key: 'orange', label: '橙', color: '#f97316', bgDark: 'rgba(249,115,22,0.08)', bgLight: 'rgba(249,115,22,0.06)' },
  { key: 'pink', label: '粉', color: '#ec4899', bgDark: 'rgba(236,72,153,0.08)', bgLight: 'rgba(236,72,153,0.06)' },
];

const IconColor: React.FC = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.35249 19.5 5.25992 20.3541 4.7823 20.8317L4.70711 20.9069C4.31658 21.2974 3.68342 21.2974 3.29289 20.9069C1.8842 19.4982 1 17.5492 1 15.3957C1 14.0772 1.35338 12.8412 1.9723 11.7686" />
    <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const SectionNode: React.FC<SectionNodeProps> = React.memo(({
  node, isSelected, isDragging, activeTool,
  onMouseDown, onRemove, onSelect, onResizeStart,
  isMobile = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [toolbarReady, setToolbarReady] = useState(false);
  const taskDataSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarReadyRef = useRef(false);

  const { setNodes } = useCanvas();
  const { saveCanvasState } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const connectDimClass = useConnectDragDimClass(node.id);

  const clearToolbarTimers = () => {
    if (toolbarHoverTimerRef.current) {
      clearTimeout(toolbarHoverTimerRef.current);
      toolbarHoverTimerRef.current = null;
    }
    if (toolbarLeaveTimerRef.current) {
      clearTimeout(toolbarLeaveTimerRef.current);
      toolbarLeaveTimerRef.current = null;
    }
  };

  useEffect(() => {
    toolbarReadyRef.current = toolbarReady;
  }, [toolbarReady]);

  /**
   * 与其它节点一致：
   * - 选中：立即显示操作栏，取消选中才消失
   * - 未选中：悬停 0.8s 显示；移出延迟隐藏
   */
  useEffect(() => {
    if (isMobile) {
      clearToolbarTimers();
      setToolbarReady(false);
      return;
    }

    if (isSelected) {
      clearToolbarTimers();
      setToolbarReady(true);
      return;
    }

    if (isHovered) {
      if (toolbarLeaveTimerRef.current) {
        clearTimeout(toolbarLeaveTimerRef.current);
        toolbarLeaveTimerRef.current = null;
      }
      if (toolbarReadyRef.current) return;
      if (toolbarHoverTimerRef.current) return;
      toolbarHoverTimerRef.current = setTimeout(() => {
        setToolbarReady(true);
        toolbarHoverTimerRef.current = null;
      }, 800);
      return () => {
        if (toolbarHoverTimerRef.current) {
          clearTimeout(toolbarHoverTimerRef.current);
          toolbarHoverTimerRef.current = null;
        }
      };
    }

    if (toolbarHoverTimerRef.current) {
      clearTimeout(toolbarHoverTimerRef.current);
      toolbarHoverTimerRef.current = null;
    }
    if (toolbarLeaveTimerRef.current) return;
    toolbarLeaveTimerRef.current = setTimeout(() => {
      setToolbarReady(false);
      toolbarLeaveTimerRef.current = null;
    }, 220);
    return () => {
      if (toolbarLeaveTimerRef.current) {
        clearTimeout(toolbarLeaveTimerRef.current);
        toolbarLeaveTimerRef.current = null;
      }
    };
  }, [isSelected, isHovered, isMobile]);

  useEffect(
    () => () => {
      clearToolbarTimers();
      if (taskDataSaveTimerRef.current) clearTimeout(taskDataSaveTimerRef.current);
    },
    [],
  );

  const defaultTitle = '区块';
  const nodeTitle = getNodeDisplayTitle(node, defaultTitle);

  const updateNodeTaskData = (patch: Record<string, any>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== node.id) return n;
        const title =
          typeof patch.label === 'string'
            ? patch.label
            : typeof patch.node_title === 'string'
              ? patch.node_title
              : n.title;
        return {
          ...n,
          title,
          taskData: { ...(n.taskData || {}), ...patch },
        };
      }),
    );
    if (taskDataSaveTimerRef.current) clearTimeout(taskDataSaveTimerRef.current);
    taskDataSaveTimerRef.current = setTimeout(() => {
      taskDataSaveTimerRef.current = null;
      void saveCanvasState();
    }, 450);
  };

  const handleRename = (next: string) => {
    setNodes((prev) => {
      const updated = prev.map((n) =>
        n.id === node.id
          ? {
              ...n,
              title: next,
              taskData: {
                ...(n.taskData || {}),
                label: next,
                node_title: next,
              },
            }
          : n,
      );
      saveCanvasState(updated);
      return updated;
    });
  };

  const presetKey = node.backgroundColor || 'gray';
  const currentPreset = useMemo(
    () => COLOR_PRESETS.find((p) => p.key === presetKey) || COLOR_PRESETS[0],
    [presetKey],
  );

  const handleSelectColor = (colorKey: string) => {
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === node.id ? { ...n, backgroundColor: colorKey } : n));
      saveCanvasState(next);
      return next;
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDirection) => {
    onResizeStart?.(e, node.id, dir);
  };

  const isDefaultGray = presetKey === 'gray';
  const bodyBg = _isLight ? currentPreset.bgLight : currentPreset.bgDark;
  const accentBorder = isDefaultGray
    ? _isLight
      ? 'rgba(0,0,0,0.22)'
      : 'rgba(255,255,255,0.3)'
    : currentPreset.color;
  const showBorder = isHovered || isSelected;

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (activeTool !== 'pointer') return;
    if ((e.target as HTMLElement).dataset.sectionBody === node.id) {
      onSelect(node.id, e);
      onMouseDown(e, node.id, node.x, node.y);
    }
  };

  const moreMenuProps = {
    node,
    defaultTitle,
    onRemove,
    updateNodeTaskData,
    setNodes,
    saveCanvasState,
  } as const;

  const colorPickerContent = (
    <div className="pg-flow-section-colors" style={{ display: 'flex', gap: 6, padding: '4px 2px' }}>
      {COLOR_PRESETS.map((p) => (
        <Tooltip key={p.key} title={p.label}>
          <button
            type="button"
            className={`pg-flow-section-color-dot${presetKey === p.key ? ' is-active' : ''}`}
            style={{
              background: p.key === 'gray' ? (_isLight ? '#a1a1aa' : '#71717a') : p.color,
            }}
            onClick={() => handleSelectColor(p.key)}
            aria-label={p.label}
          />
        </Tooltip>
      ))}
    </div>
  );

  return (
    <div
      data-node-id={node.id}
      className={[
        'pg-flow-section-frame',
        isSelected ? 'is-selected' : '',
        isHovered ? 'is-hovered' : '',
        isDragging ? 'is-dragging' : '',
        toolbarReady ? 'is-tb-open' : '',
        _isLight ? 'is-light' : '',
        connectDimClass,
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: isMobile ? 'relative' : 'absolute',
        left: isMobile ? undefined : node.x,
        top: isMobile ? undefined : node.y,
        width: isMobile ? '100%' : node.width,
        height: isMobile ? undefined : node.height,
        aspectRatio: isMobile ? `${node.width || 400}/${node.height || 300}` : undefined,
        zIndex: isMobile ? undefined : Math.min(node.zIndex || 1, 9),
        pointerEvents: 'none',
      }}
    >
      {/* 顶栏：标题 + 操作栏同一命中区，避免滑向操作栏时落入空隙 */}
      <div
        className={`pg-flow-section-chrome${toolbarReady && !isMobile ? ' is-tb-open' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
      >
        <div
          className="pg-flow-section-title-bar"
          onMouseDown={(e) => {
            if (activeTool === 'pointer') {
              onSelect(node.id, e);
              onMouseDown(e, node.id, node.x, node.y);
            }
          }}
          style={{
            pointerEvents: 'auto',
            cursor: isMobile
              ? 'pointer'
              : activeTool === 'pointer'
                ? isDragging
                  ? 'grabbing'
                  : 'grab'
                : 'default',
          }}
        >
          <div
            className="pg-flow-section-title-wrap"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ color: _isLight ? '#18181b' : '#fff' }}
          >
            <NodeTitleInline nodeId={node.id} title={nodeTitle} onCommit={handleRename} />
          </div>
        </div>

        {toolbarReady && !isMobile && (
          <div
            className="pg-flow-node-tb pg-flow-section-tb"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Popover
              content={colorPickerContent}
              trigger="click"
              placement="bottom"
              overlayStyle={{ zIndex: 3100 }}
            >
              <button
                type="button"
                className="pg-flow-node-tb-btn"
                aria-label="区块颜色"
                title="区块颜色"
                onClick={(e) => e.stopPropagation()}
              >
                <IconColor />
              </button>
            </Popover>
            <NodeMoreMenu {...moreMenuProps} compact />
          </div>
        )}
      </div>

      {/* 未显示操作栏时仍挂载，供右键唤起 */}
      {(!toolbarReady || isMobile) && (
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <NodeMoreMenu {...moreMenuProps} hideTrigger />
        </div>
      )}

      <div
        data-section-body={node.id}
        className="pg-flow-section-body"
        onMouseDown={handleBodyMouseDown}
        style={{
          background: bodyBg,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: showBorder ? accentBorder : 'transparent',
          boxShadow: isDragging
            ? 'none'
            : isHovered || isSelected
              ? '0 6px 16px rgba(0,0,0,0.28)'
              : '0 4px 8px rgba(0,0,0,0.2)',
          pointerEvents: 'auto',
          cursor: isMobile
            ? 'default'
            : activeTool === 'pointer'
              ? isDragging
                ? 'grabbing'
                : 'grab'
              : 'default',
        }}
      />

      {isSelected && !isMobile && activeTool === 'pointer' && (
        <div style={{ pointerEvents: 'auto' }}>
          {CORNER_RESIZE_DIRECTIONS.map((dir) => (
            <ResizeHandle key={dir} direction={dir} onMouseDown={handleResizeMouseDown} />
          ))}
        </div>
      )}
    </div>
  );
});

SectionNode.displayName = 'SectionNode';
export default SectionNode;
