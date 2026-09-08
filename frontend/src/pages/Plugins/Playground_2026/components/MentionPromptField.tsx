/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../../../store/theme';
import { stripMentionArtifacts, type MentionAsset } from '../utils/mentionPrompt';
import { RichPromptEditor, type RichPromptEditorRef } from './RichPromptEditor';
import './MentionPromptField.css';

export type MentionPromptFieldRef = {
  focus: () => void;
  insertMention: (label: string) => void;
  openMention: () => void;
  getElement: () => HTMLDivElement | null;
};

export type MentionPromptFieldProps = {
  value: string;
  onChange: (next: string) => void;
  assets: MentionAsset[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  dropdownTitle?: string;
  emptyText?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** 画布底栏沿用旧输入框字号/内边距；工具页与节点用 plain */
  plain?: boolean;
  embedded?: boolean;
  autoHeight?: boolean;
  minHeight?: number;
  maxHeight?: number;
  showResize?: boolean;
  /** 覆盖主题：Imagine 工具页/节点为深色底 */
  isLight?: boolean;
};

const MentionThumb: React.FC<{ url: string; type: MentionAsset['type'] }> = ({ url, type }) => {
  if (type === 'image') return <img src={url} alt="" />;
  if (type === 'video') return <video src={url} muted playsInline preload="metadata" />;
  return <span className={`hf-mpf-inline-fallback is-${type}`} />;
};

type DropdownPos = {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  placement: 'above' | 'below';
};

const MentionPromptField = forwardRef<MentionPromptFieldRef, MentionPromptFieldProps>(({
  value,
  onChange,
  assets,
  className,
  placeholder,
  disabled,
  dropdownTitle,
  emptyText,
  onKeyDown: onKeyDownProp,
  onPaste,
  onFocus,
  onBlur,
  plain = true,
  embedded = false,
  autoHeight = false,
  minHeight = 36,
  maxHeight = 160,
  showResize = false,
  isLight: isLightProp,
}, ref) => {
  const { t } = useTranslation();
  const { themeMode } = useThemeStore();
  const isLight = isLightProp ?? themeMode === 'light';
  const editorRef = useRef<RichPromptEditorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null);

  const assetMap = useMemo(() => {
    const map: Record<string, { url: string; type: string }> = {};
    assets.forEach((a) => {
      map[a.label] = { url: a.url, type: a.type };
    });
    return map;
  }, [assets]);

  const filteredOptions = useMemo(() => {
    if (!mentionFilter) return assets;
    return assets.filter((a) => a.label.includes(mentionFilter));
  }, [assets, mentionFilter]);

  const commitChange = useCallback(
    (next: string) => {
      onChange(stripMentionArtifacts(next));
    },
    [onChange],
  );

  const insertMention = useCallback((label: string) => {
    editorRef.current?.insertMention(label);
    setMentionOpen(false);
    setMentionFilter('');
  }, []);

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionFilter('');
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    insertMention,
    openMention: () => {
      editorRef.current?.focus();
      setMentionFilter('');
      setMentionIndex(0);
      setMentionOpen(true);
    },
    getElement: () => editorRef.current?.getElement() ?? null,
  }), [insertMention]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFilter, assets.length]);

  const handleMentionTrigger = (query: string) => {
    setMentionFilter(query);
    setMentionOpen(true);
  };

  useLayoutEffect(() => {
    if (!autoHeight) return;
    const el = editorRef.current?.getElement();
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)}px`;
  }, [autoHeight, value, minHeight, maxHeight, assets.length]);

  useLayoutEffect(() => {
    if (!mentionOpen) {
      setDropdownPos(null);
      return undefined;
    }
    const update = () => {
      const anchor = editorRef.current?.getElement() || rootRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const gap = 6;
      const maxWidth = Math.min(Math.max(r.width, 200), Math.min(320, window.innerWidth - 16));
      const minWidth = Math.round(maxWidth * 0.6);
      const spaceAbove = r.top - 8;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const preferAbove = spaceAbove >= 120 || spaceAbove >= spaceBelow;
      const nextMaxHeight = Math.min(240, preferAbove ? spaceAbove - gap : spaceBelow - gap);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - maxWidth - 8));
      if (preferAbove) {
        setDropdownPos({
          top: Math.max(8, r.top - gap),
          left,
          minWidth,
          maxWidth,
          maxHeight: Math.max(96, nextMaxHeight),
          placement: 'above',
        });
      } else {
        setDropdownPos({
          top: r.bottom + gap,
          left,
          minWidth,
          maxWidth,
          maxHeight: Math.max(96, nextMaxHeight),
          placement: 'below',
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [mentionOpen, value, filteredOptions.length, assets.length]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filteredOptions.length > 0) {
        e.preventDefault();
        insertMention(filteredOptions[mentionIndex]?.label || filteredOptions[0].label);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
    onKeyDownProp?.(e);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = editorRef.current?.getElement();
    if (!el) return;

    const startY = e.clientY;
    const startHeight = el.getBoundingClientRect().height;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const cap = Math.max(minHeight, Math.min(maxHeight, Math.floor(window.innerHeight * 0.5)));
      const nextHeight = Math.min(cap, Math.max(minHeight, startHeight + delta));
      el.style.height = `${nextHeight}px`;
      el.style.maxHeight = `${cap}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const dropdown =
    mentionOpen && dropdownPos
      ? createPortal(
          <div
            className={`hf-mpf-dropdown hf-mpf-dropdown-portal${dropdownPos.placement === 'above' ? ' is-above' : ' is-below'}`}
            role="listbox"
            style={{
              position: 'fixed',
              left: dropdownPos.left,
              width: 'fit-content',
              minWidth: dropdownPos.minWidth,
              maxWidth: dropdownPos.maxWidth,
              maxHeight: dropdownPos.maxHeight,
              zIndex: 1300,
              ...(dropdownPos.placement === 'above'
                ? { top: 'auto', bottom: window.innerHeight - dropdownPos.top }
                : { top: dropdownPos.top, bottom: 'auto' }),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="hf-mpf-dropdown-title">
              {assets.length > 0
                ? dropdownTitle || t('playground_2026:mention_title', '引用参考图')
                : t('playground_2026:mention_tip', '提示')}
            </div>
            {assets.length === 0 ? (
              <div className="hf-mpf-dropdown-empty">
                {emptyText || t('playground_2026:mention_empty', '暂无参考图，请先上传')}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="hf-mpf-dropdown-empty">
                {t('playground_2026:mention_no_match', '没有匹配的参考图')}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => (
                <div
                  key={`${opt.type}-${opt.label}-${opt.url}`}
                  role="option"
                  aria-selected={idx === mentionIndex}
                  className={`hf-mpf-dropdown-item${idx === mentionIndex ? ' is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(opt.label);
                  }}
                  onMouseEnter={() => setMentionIndex(idx)}
                >
                  <span className="hf-mpf-dropdown-thumb">
                    <MentionThumb url={opt.url} type={opt.type} />
                  </span>
                  <span className="hf-mpf-dropdown-label">@{opt.label}</span>
                </div>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="hf-mpf-root" ref={rootRef}>
      <RichPromptEditor
        ref={editorRef}
        value={value}
        onChange={commitChange}
        placeholder={placeholder}
        assetMap={assetMap}
        isLight={isLight}
        isMobile={false}
        embedded={embedded}
        plain={plain}
        disabled={disabled}
        className={className}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={() => {
          window.setTimeout(() => closeMention(), 180);
          onBlur?.();
        }}
        onMentionTrigger={handleMentionTrigger}
        onMentionClose={closeMention}
      />
      {showResize && (
        <div
          className="hf-mpf-resize-handle"
          title={t('playground_2026:resize_prompt', '拖拽调整高度')}
          onMouseDown={handleResizeStart}
          role="button"
          tabIndex={-1}
          aria-label="Resize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M8.5 2.5L2.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8.5 6.5L6.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
      {dropdown}
    </div>
  );
});

MentionPromptField.displayName = 'MentionPromptField';

export default MentionPromptField;
