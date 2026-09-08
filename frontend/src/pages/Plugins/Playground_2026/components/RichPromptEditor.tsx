import React, { useRef, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { stripMentionArtifacts } from '../utils/mentionPrompt';

interface MentionAssetInfo {
  url: string;
  type: string;
}

export interface RichPromptEditorRef {
  focus: () => void;
  blur: () => void;
  insertMention: (label: string) => void;
  getElement: () => HTMLDivElement | null;
}

interface RichPromptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  assetMap: Record<string, MentionAssetInfo>;
  isLight: boolean;
  isMobile: boolean;
  embedded?: boolean;
  /** 不写死字号/内边距，交给外部 className */
  plain?: boolean;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onMentionTrigger?: (query: string, caretPos: number) => void;
  onMentionClose?: () => void;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function chipThumbHtml(info: MentionAssetInfo): string {
  if (info.type === 'image') {
    return `<img class="mention-chip-thumb" src="${escapeHtml(info.url)}" alt="" />`;
  }
  if (info.type === 'video') {
    return `<video class="mention-chip-thumb" src="${escapeHtml(info.url)}" muted></video>`;
  }
  const mark = info.type === 'audio' ? '♪' : '📄';
  return `<span class="mention-chip-mark">${mark}</span>`;
}

function textToHtml(
  text: string,
  assetMap: Record<string, MentionAssetInfo>,
  isLight: boolean
): string {
  if (!text) return '';
  const normalized = stripMentionArtifacts(text);

  const labels = Object.keys(assetMap).sort((a, b) => b.length - a.length);
  if (labels.length === 0) {
    return escapeHtml(normalized).replace(/\n/g, '<br>');
  }

  const regex = new RegExp(
    `(@(?:${labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`,
    'g'
  );
  const parts = normalized.split(regex);

  let html = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const match = part.match(/^@(.+)$/);
    if (match && assetMap[match[1]]) {
      const label = match[1];
      const info = assetMap[label];
      const chipBg = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)';
      const chipBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.16)';
      const chipColor = isLight ? '#18181b' : '#f4f4f5';
      const thumbHtml = chipThumbHtml(info);

      html += `<span contenteditable="false" class="mention-chip" data-label="${escapeHtml(label)}" style="background:${chipBg};border-color:${chipBorder};color:${chipColor};"><span>@${escapeHtml(label)}</span>${thumbHtml}</span>`;
    } else {
      html += escapeHtml(part).replace(/\n/g, '<br>');
    }
  }
  return html;
}

function htmlToText(node: Node): string {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      text += stripMentionArtifacts(child.textContent || '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.classList.contains('mention-chip') || el.hasAttribute('data-label')) {
        const label = el.getAttribute('data-label') || el.textContent?.replace(/^@/, '') || '';
        text += `@${label}`;
      } else if (el.tagName === 'BR') {
        text += '\n';
      } else if (el.tagName === 'DIV' || el.tagName === 'P') {
        if (text.length > 0 && !text.endsWith('\n')) {
          text += '\n';
        }
        text += htmlToText(el);
      } else {
        text += htmlToText(el);
      }
    }
  }
  return text.replace(/[ ]{2,}/g, ' ');
}

function rangePrefixText(root: HTMLElement, container: Node, offset: number): string {
  const pre = document.createRange();
  pre.selectNodeContents(root);
  try {
    pre.setEnd(container, offset);
  } catch {
    return htmlToText(root);
  }
  const holder = document.createElement('div');
  holder.appendChild(pre.cloneContents());
  return htmlToText(holder);
}

function clipboardHasFiles(data: DataTransfer | null): boolean {
  if (!data) return false;
  return Array.from(data.items || []).some((it) => it.kind === 'file');
}

/** 当前文本节点里尚未结束的 `@query`。已完成的芯片不在文本节点里，不会命中。 */
function mentionTriggerInPrefix(prefix: string): { start: number; query: string } | null {
  const atIdx = prefix.lastIndexOf('@');
  if (atIdx < 0) return null;
  const query = prefix.slice(atIdx + 1);
  if (/[\s]/.test(query)) return null;
  return { start: atIdx, query };
}

function caretTextNodePrefix(range: Range): string {
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    return (startContainer.textContent || '').slice(0, startOffset);
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
    const prev = startContainer.childNodes[startOffset - 1];
    if (prev?.nodeType === Node.TEXT_NODE) return prev.textContent || '';
  }
  return '';
}

/** 只认光标所在文本节点里的 `@`，忽略前面已经变成芯片的 `@图1`。 */
function mentionTriggerAtCaret(
  root: HTMLElement,
  range: Range,
): { start: number; query: string } | null {
  const local = caretTextNodePrefix(range);
  const found = mentionTriggerInPrefix(local);
  if (!found) return null;
  const full = rangePrefixText(root, range.startContainer, range.startOffset);
  const start = Math.max(0, full.length - (local.length - found.start));
  return { start, query: found.query };
}

function rangeTouchesChip(range: Range, chip: HTMLElement): boolean {
  try {
    if (range.intersectsNode(chip)) return true;
  } catch {
    /* Safari 对未挂载节点会抛 */
  }
  const after = chip.nextSibling;
  if (!after || after.nodeType !== Node.TEXT_NODE) return false;
  if (!range.intersectsNode(after)) return false;
  const text = after.textContent || '';
  const start = range.startContainer === after ? range.startOffset : 0;
  const end = range.endContainer === after ? range.endOffset : text.length;
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return from !== to && /^\s*$/.test(text.slice(from, to));
}

function expandRangeOverChips(root: HTMLElement, range: Range): Range {
  const next = range.cloneRange();
  root.querySelectorAll('.mention-chip').forEach((node) => {
    const chip = node as HTMLElement;
    if (!rangeTouchesChip(range, chip)) return;
    const chipRange = document.createRange();
    chipRange.selectNode(chip);
    try {
      if (next.compareBoundaryPoints(Range.START_TO_START, chipRange) > 0) {
        next.setStartBefore(chip);
      }
      if (next.compareBoundaryPoints(Range.END_TO_END, chipRange) < 0) {
        next.setEndAfter(chip);
      }
    } catch {
      /* ignore */
    }
  });
  return next;
}

function syncChipSelection(root: HTMLElement) {
  const sel = window.getSelection();
  const chips = root.querySelectorAll('.mention-chip');
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || (!root.contains(sel.anchorNode) && sel.anchorNode !== root)) {
    chips.forEach((el) => el.classList.remove('is-in-selection'));
    return;
  }
  const range = sel.getRangeAt(0);
  chips.forEach((node) => {
    const chip = node as HTMLElement;
    chip.classList.toggle('is-in-selection', rangeTouchesChip(range, chip));
  });
}

function insertHtmlAtRange(range: Range, html: string) {
  const sel = window.getSelection();
  const live = range.cloneRange();
  live.deleteContents();
  if (!html) {
    live.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(live);
    return;
  }
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const frag = document.createDocumentFragment();
  let last: ChildNode | null = null;
  while (holder.firstChild) {
    last = holder.firstChild;
    frag.appendChild(holder.firstChild);
  }
  live.insertNode(frag);
  if (!last) return;
  const after = document.createRange();
  after.setStartAfter(last);
  after.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(after);
}

export const RichPromptEditor = forwardRef<RichPromptEditorRef, RichPromptEditorProps>(
  (
    {
      value,
      onChange,
      placeholder,
      assetMap,
      isLight,
      isMobile,
      embedded = false,
      plain = false,
      disabled = false,
      onFocus,
      onBlur,
      onKeyDown,
      onPaste,
      onMentionTrigger,
      onMentionClose,
      id,
      className = '',
      style = {},
    },
    ref
  ) => {
    const divRef = useRef<HTMLDivElement>(null);
    const lastValRef = useRef<string>(value);
    const isComposingRef = useRef<boolean>(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isComposing, setIsComposing] = useState(false);
    const assetMapRef = useRef(assetMap);
    const mentionTriggerRef = useRef<{ start: number } | null>(null);
    const suppressInputRef = useRef(false);
    assetMapRef.current = assetMap;

    const applyHtml = (html: string) => {
      if (!divRef.current) return;
      suppressInputRef.current = true;
      divRef.current.innerHTML = html;
      queueMicrotask(() => {
        suppressInputRef.current = false;
      });
    };

    useImperativeHandle(ref, () => ({
      focus: () => {
        divRef.current?.focus();
      },
      blur: () => {
        divRef.current?.blur();
      },
      getElement: () => divRef.current,
      insertMention: (label: string) => {
        if (!divRef.current || disabled) return;
        const root = divRef.current;
        const sel = window.getSelection();
        let range: Range;
        if (sel && sel.rangeCount > 0 && (root.contains(sel.anchorNode) || sel.anchorNode === root)) {
          range = sel.getRangeAt(0).cloneRange();
          const localFound = mentionTriggerInPrefix(caretTextNodePrefix(range));
          if (localFound && range.startContainer.nodeType === Node.TEXT_NODE) {
            range.setStart(range.startContainer, localFound.start);
          }
        } else {
          range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
        }
        mentionTriggerRef.current = null;
        suppressInputRef.current = true;
        insertHtmlAtRange(range, textToHtml(`@${label} `, assetMapRef.current, isLight));
        const next = htmlToText(root);
        lastValRef.current = next;
        onChange(next);
        root.focus();
        queueMicrotask(() => {
          suppressInputRef.current = false;
        });
      },
    }));

    useLayoutEffect(() => {
      if (!divRef.current) return;
      const hasDom = divRef.current.childNodes.length > 0;
      if (value === lastValRef.current && hasDom) return;
      lastValRef.current = value;
      applyHtml(textToHtml(value, assetMap, isLight));
    }, [value, assetMap, isLight]);

    useEffect(() => {
      const onSel = () => {
        if (divRef.current) syncChipSelection(divRef.current);
      };
      document.addEventListener('selectionchange', onSel);
      return () => document.removeEventListener('selectionchange', onSel);
    }, []);

    const checkMention = useCallback(() => {
      if (disabled) {
        mentionTriggerRef.current = null;
        onMentionClose?.();
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !divRef.current) {
        mentionTriggerRef.current = null;
        onMentionClose?.();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!divRef.current.contains(range.startContainer) && range.startContainer !== divRef.current) {
        mentionTriggerRef.current = null;
        onMentionClose?.();
        return;
      }
      const found = mentionTriggerAtCaret(divRef.current, range);
      if (found) {
        mentionTriggerRef.current = { start: found.start };
        onMentionTrigger?.(found.query, found.start);
        return;
      }
      mentionTriggerRef.current = null;
      onMentionClose?.();
    }, [disabled, onMentionTrigger, onMentionClose]);

    const handleInput = () => {
      if (!divRef.current || isComposingRef.current || disabled || suppressInputRef.current) return;
      const text = htmlToText(divRef.current);
      lastValRef.current = text;
      onChange(text);
      checkMention();
    };

    const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.isDefaultPrevented() || disabled) return;
      if (e.key === '@' || (e.key === '2' && e.shiftKey)) {
        window.setTimeout(checkMention, 0);
      }
    };

    const handleInternalKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'Enter' ||
        e.key === 'Escape'
      ) {
        return;
      }
      checkMention();
    };

    const commitFromDom = () => {
      if (!divRef.current) return;
      const text = htmlToText(divRef.current);
      lastValRef.current = text;
      onChange(text);
    };

    const handleCut = (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!divRef.current || disabled) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const expanded = expandRangeOverChips(divRef.current, sel.getRangeAt(0));
      const holder = document.createElement('div');
      holder.appendChild(expanded.cloneContents());
      const text = htmlToText(holder);
      if (!text) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
      suppressInputRef.current = true;
      expanded.deleteContents();
      sel.removeAllRanges();
      sel.addRange(expanded);
      commitFromDom();
      queueMicrotask(() => {
        suppressInputRef.current = false;
      });
    };

    const handleInternalPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(e);
      if (e.defaultPrevented || disabled || !divRef.current) return;
      if (clipboardHasFiles(e.clipboardData)) {
        e.preventDefault();
        return;
      }
      const pasted = e.clipboardData.getData('text/plain');
      if (!pasted) return;
      e.preventDefault();
      const sel = window.getSelection();
      let range: Range;
      if (sel && sel.rangeCount > 0 && (divRef.current.contains(sel.anchorNode) || sel.anchorNode === divRef.current)) {
        const raw = sel.getRangeAt(0);
        range = sel.isCollapsed ? raw.cloneRange() : expandRangeOverChips(divRef.current, raw);
      } else {
        range = document.createRange();
        range.selectNodeContents(divRef.current);
        range.collapse(false);
      }
      suppressInputRef.current = true;
      insertHtmlAtRange(range, textToHtml(pasted, assetMapRef.current, isLight));
      commitFromDom();
      queueMicrotask(() => {
        suppressInputRef.current = false;
      });
    };

    const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!divRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const holder = document.createElement('div');
      holder.appendChild(expandRangeOverChips(divRef.current, sel.getRangeAt(0)).cloneContents());
      const text = htmlToText(holder);
      if (!text) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
    };

    const stopDrag = (e: React.SyntheticEvent) => {
      e.stopPropagation();
    };

    const isEmpty = !value || value.trim().length === 0;
    const chromeStyle: React.CSSProperties = plain
      ? {
          minHeight: 0,
          maxHeight: 'none',
          overflowY: 'auto',
          padding: 0,
          fontSize: 'inherit',
          lineHeight: 'inherit',
          fontFamily: 'inherit',
          fontWeight: 'inherit',
          letterSpacing: 'inherit',
          color: 'inherit',
          caretColor: 'inherit',
          outline: 'none',
          border: 'none',
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          cursor: disabled ? 'default' : 'text',
          position: 'relative',
          width: '100%',
          ...style,
        }
      : {
          minHeight: embedded ? 40 : isMobile ? 48 : 56,
          maxHeight: embedded ? 140 : isMobile ? 160 : 220,
          overflowY: 'auto',
          padding: embedded ? 0 : isMobile ? '8px 12px' : '10px 18px',
          fontSize: embedded ? 14 : isMobile ? 14 : 15,
          lineHeight: '1.6',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: isLight ? '#1f2937' : '#E8EAED',
          caretColor: isLight ? '#1f2937' : '#E8EAED',
          outline: 'none',
          border: 'none',
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          cursor: disabled ? 'default' : 'text',
          position: 'relative',
          ...style,
        };

    return (
      <div
        ref={divRef}
        id={id}
        contentEditable={!disabled}
        suppressContentEditableWarning={true}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-placeholder={placeholder || ''}
        data-empty={isEmpty ? 'true' : 'false'}
        data-focused={isFocused ? 'true' : 'false'}
        data-composing={isComposing ? 'true' : 'false'}
        onInput={handleInput}
        onCompositionStart={() => {
          isComposingRef.current = true;
          setIsComposing(true);
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          setIsComposing(false);
          handleInput();
        }}
        onFocus={() => {
          setIsFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setIsFocused(false);
          onBlur?.();
        }}
        onPaste={handleInternalPaste}
        onCopy={handleCopy}
        onCut={handleCut}
        onKeyDown={handleInternalKeyDown}
        onKeyUp={handleInternalKeyUp}
        onClick={checkMention}
        onMouseDown={stopDrag}
        onPointerDown={stopDrag}
        className={`prompt-contenteditable ${embedded ? 'prompt-contenteditable-embedded' : ''} ${className}`}
        style={chromeStyle}
      />
    );
  }
);
