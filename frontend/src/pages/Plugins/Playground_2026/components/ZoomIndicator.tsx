/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 画布左下角：撤销/重做 + 缩放比例指示器（页面设置已迁至左侧栏齿轮）
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../context/PlaygroundContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useThemeStore } from '../../../../store/theme';

/** 检测是否为 Mac 系统 */
const isMac = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }
  return false;
};

/** 根据平台返回修饰键符号 */
const getModKey = (): string => (isMac() ? '⌘' : 'Ctrl');
const getShiftKey = (): string => (isMac() ? '⇧' : 'Shift');

interface ZoomMenuItem {
  label: string;
  shortcut: string;
  action: () => void;
  dividerAfter?: boolean;
}

const ZoomIndicator: React.FC<{ flowEditor?: boolean }> = React.memo(({ flowEditor = false }) => {
  const { canvasTransform, undo, redo, canUndo, canRedo } = useCanvas();
  const { zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection } = useCanvasInteraction();
  const { themeMode } = useThemeStore();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const percent = Math.round(canvasTransform.scale * 100);
  const _isLight = themeMode === 'light';

  const bg = _isLight ? 'rgba(255,255,255,0.75)' : 'rgba(20,20,22,0.8)';
  const border = _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)';
  const shadow = _isLight
    ? '0 10px 40px -10px rgba(0,0,0,0.1)'
    : '0 15px 50px -12px rgba(0,0,0,0.5)';
  const textColor = _isLight ? '#09090b' : '#f4f4f5';
  const textMuted = _isLight ? '#71717a' : '#a1a1aa';
  const hoverBg = _isLight ? '#f4f4f5' : '#27272a';
  const dividerBg = _isLight ? '#e4e4e7' : '#27272a';

  const modKey = getModKey();
  const shiftKey = getShiftKey();

  const menuItems: ZoomMenuItem[] = [
    { label: '放大', shortcut: `${modKey} +`, action: zoomIn },
    { label: '缩小', shortcut: `${modKey} -`, action: zoomOut, dividerAfter: true },
    { label: '缩放到 100%', shortcut: `${shiftKey} 0`, action: zoomTo100 },
    { label: '缩放适应画布', shortcut: `${shiftKey} 1`, action: zoomToFit },
    { label: '缩放到选区', shortcut: `${shiftKey} 2`, action: zoomToSelection },
  ];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable || target?.closest?.('[contenteditable="true"]')) return;

      const isMacOS = isMac();
      const mod = isMacOS ? e.metaKey : e.ctrlKey;

      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.shiftKey && !mod && e.key === ')') {
        e.preventDefault();
        zoomTo100();
        return;
      }
      if (e.shiftKey && !mod && e.code === 'Digit0') {
        e.preventDefault();
        zoomTo100();
        return;
      }
      if (e.shiftKey && !mod && (e.key === '!' || e.code === 'Digit1')) {
        e.preventDefault();
        zoomToFit();
        return;
      }
      if (e.shiftKey && !mod && (e.key === '@' || e.code === 'Digit2')) {
        e.preventDefault();
        zoomToSelection();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, zoomTo100, zoomToFit, zoomToSelection]);

  const handleItemClick = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  if (isMobile) return null;

  return (
    <div
      className={flowEditor ? 'pg-flow-bottom-left' : undefined}
      style={
        flowEditor
          ? undefined
          : {
              position: 'absolute',
              left: 24,
              bottom: 24,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }
      }
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 撤销 / 重做 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 28,
          background: bg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 14,
          border,
          boxShadow: _isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.4)',
          padding: '0 4px',
          userSelect: 'none',
        }}
      >
        <button
          onClick={undo}
          disabled={!canUndo}
          title={`撤销 (${modKey}Z)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 24,
            border: 'none',
            background: 'transparent',
            borderRadius: 8,
            cursor: canUndo ? 'pointer' : 'default',
            color: canUndo
              ? _isLight
                ? 'rgba(0,0,0,0.7)'
                : 'rgba(255,255,255,0.7)'
              : _isLight
                ? 'rgba(0,0,0,0.2)'
                : 'rgba(255,255,255,0.2)',
            transition: 'all 0.15s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            if (canUndo) {
              e.currentTarget.style.background = _isLight
                ? 'rgba(0,0,0,0.06)'
                : 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = _isLight ? '#000' : '#fff';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = canUndo
              ? _isLight
                ? 'rgba(0,0,0,0.7)'
                : 'rgba(255,255,255,0.7)'
              : _isLight
                ? 'rgba(0,0,0,0.2)'
                : 'rgba(255,255,255,0.2)';
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 2.9L3 13" />
          </svg>
        </button>

        <div
          style={{
            width: 1,
            height: 14,
            background: _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
            margin: '0 1px',
          }}
        />

        <button
          onClick={redo}
          disabled={!canRedo}
          title={`重做 (${modKey}Shift+Z)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 24,
            border: 'none',
            background: 'transparent',
            borderRadius: 8,
            cursor: canRedo ? 'pointer' : 'default',
            color: canRedo
              ? _isLight
                ? 'rgba(0,0,0,0.7)'
                : 'rgba(255,255,255,0.7)'
              : _isLight
                ? 'rgba(0,0,0,0.2)'
                : 'rgba(255,255,255,0.2)',
            transition: 'all 0.15s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            if (canRedo) {
              e.currentTarget.style.background = _isLight
                ? 'rgba(0,0,0,0.06)'
                : 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = _isLight ? '#000' : '#fff';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = canRedo
              ? _isLight
                ? 'rgba(0,0,0,0.7)'
                : 'rgba(255,255,255,0.7)'
              : _isLight
                ? 'rgba(0,0,0,0.2)'
                : 'rgba(255,255,255,0.2)';
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 2.9L21 13" />
          </svg>
        </button>
      </div>

      {/* 缩放百分比 */}
      <div ref={containerRef} style={{ position: 'relative' }}>
        {open && (
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 0,
              minWidth: 220,
              background: bg,
              backdropFilter: 'blur(30px) saturate(180%)',
              WebkitBackdropFilter: 'blur(30px) saturate(180%)',
              borderRadius: 20,
              border,
              boxShadow: shadow,
              padding: '8px',
              animation: 'zoomMenuFadeIn 0.15s ease-out',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1001,
            }}
          >
            {menuItems.map((item, idx) => (
              <React.Fragment key={idx}>
                <div onClick={() => handleItemClick(item.action)} className="pg-settings-menu-item">
                  <span>{item.label}</span>
                  <span
                    style={{
                      color: textMuted,
                      fontSize: 12,
                      fontWeight: 400,
                      letterSpacing: '0.5px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      marginLeft: 24,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.shortcut}
                  </span>
                </div>
                {item.dividerAfter && (
                  <div
                    style={{
                      height: 1,
                      background: dividerBg,
                      margin: '2px 0',
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        <div
          onClick={() => setOpen((prev) => !prev)}
          title="缩放控制"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 40,
            height: 28,
            padding: '0 6px',
            background: open
              ? _isLight
                ? 'rgba(240,241,243,0.95)'
                : 'rgba(30, 32, 36, 0.95)'
              : _isLight
                ? 'rgba(255,255,255,0.85)'
                : 'rgba(20, 21, 23, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 14,
            border: `1px solid ${
              open
                ? _isLight
                  ? 'rgba(0,0,0,0.15)'
                  : 'rgba(255,255,255,0.15)'
                : _isLight
                  ? 'rgba(0,0,0,0.08)'
                  : 'rgba(255,255,255,0.08)'
            }`,
            boxShadow: _isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: open
              ? _isLight
                ? '#000'
                : '#fff'
              : _isLight
                ? 'rgba(0,0,0,0.85)'
                : 'rgba(255,255,255,0.7)',
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.5px',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            if (!open) {
              e.currentTarget.style.background = _isLight
                ? 'rgba(240,241,243,0.95)'
                : 'rgba(30, 32, 36, 0.95)';
              e.currentTarget.style.borderColor = _isLight
                ? 'rgba(0,0,0,0.15)'
                : 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = _isLight ? '#000' : '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (!open) {
              e.currentTarget.style.background = _isLight
                ? 'rgba(255,255,255,0.85)'
                : 'rgba(20, 21, 23, 0.85)';
              e.currentTarget.style.borderColor = _isLight
                ? 'rgba(0,0,0,0.08)'
                : 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = _isLight
                ? 'rgba(0,0,0,0.6)'
                : 'rgba(255,255,255,0.7)';
            }
          }}
        >
          {percent}%
        </div>
      </div>

      <style>{`
        @keyframes zoomMenuFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .pg-settings-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          color: ${textColor};
          font-size: 13px;
          font-weight: 400;
          line-height: 18px;
          transition: background 0.12s ease;
          user-select: none;
          background: transparent;
        }
        .pg-settings-menu-item:hover {
          background: ${hoverBg};
        }
      `}</style>
    </div>
  );
});

ZoomIndicator.displayName = 'ZoomIndicator';
export default ZoomIndicator;
