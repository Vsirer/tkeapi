import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface MentionAssetInfo {
  url: string;
  type: string;
}

export interface RichPromptEditorRef {
  focus: () => void;
  blur: () => void;
  insertMention: (label: string) => void;
}

interface RichPromptEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  assetMap: Record<string, MentionAssetInfo>;
  isLight: boolean;
  isMobile: boolean;
  embedded?: boolean;
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

export function textToHtml(
  text: string,
  assetMap: Record<string, MentionAssetInfo>,
  isLight: boolean
): string {
  if (!text) return '';
  // 过滤历史残留的零宽空格与全角空格，归一化多余连续空格
  const normalized = text
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ');

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

      let thumbHtml = '';
      if (info.type === 'image') {
        thumbHtml = `<img src="${info.url}" alt="" style="width:16px;height:16px;border-radius:3px;object-fit:cover;display:inline-block;vertical-align:middle;border:1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'};" />`;
      } else if (info.type === 'video') {
        thumbHtml = `<video src="${info.url}" muted style="width:16px;height:16px;border-radius:3px;object-fit:cover;display:inline-block;vertical-align:middle;border:1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'};"></video>`;
      } else {
        thumbHtml = `<span style="font-size:11px;color:${isLight ? '#71717a' : '#a1a1aa'};line-height:1;">🎵</span>`;
      }

      html += `<span contenteditable="false" class="mention-chip" data-label="${escapeHtml(label)}" style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;padding:1px 5px;border-radius:4px;font-size:13px;line-height:1.2;margin:0 2px;background:${chipBg};border:1px solid ${chipBorder};color:${chipColor};font-weight:500;user-select:none;"><span>@${escapeHtml(label)}</span>${thumbHtml}</span>`;
    } else {
      html += escapeHtml(part).replace(/\n/g, '<br>');
    }
  }
  return html;
}

export function htmlToText(node: Node): string {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      text += (child.textContent || '').replace(/[\u200B\uFEFF]/g, '').replace(/\u3000/g, ' ');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.classList.contains('mention-chip') || el.hasAttribute('data-label')) {
        const label = el.getAttribute('data-label') || el.textContent?.replace(/^@/, '') || '';
        text += `@${label} `;
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
      onFocus,
      onBlur,
      onKeyDown,
      onPaste,
      onMentionTrigger,
      onMentionClose,
      id = 'playground-prompt-input',
      className = '',
      style = {},
    },
    ref
  ) => {
    const divRef = useRef<HTMLDivElement>(null);
    const lastValRef = useRef<string>(value);
    const isComposingRef = useRef<boolean>(false);

    // 暴露给父组件的实例方法
    useImperativeHandle(ref, () => ({
      focus: () => {
        if (divRef.current) {
          divRef.current.focus();
        }
      },
      blur: () => {
        if (divRef.current) {
          divRef.current.blur();
        }
      },
      insertMention: (label: string) => {
        if (!divRef.current) return;
        const currentText = htmlToText(divRef.current);
        const atMatch = /@([^\s@]*)$/.exec(currentText);
        let newText = '';
        if (atMatch) {
          const atPos = currentText.lastIndexOf(atMatch[0]);
          newText = currentText.substring(0, atPos) + `@${label} `;
        } else {
          newText = currentText.trimEnd() + (currentText.length > 0 ? ' ' : '') + `@${label} `;
        }
        newText = newText
          .replace(/[\u200B\uFEFF]/g, '')
          .replace(/\u3000/g, ' ')
          .replace(/[ ]{2,}/g, ' ');
        lastValRef.current = newText;
        onChange(newText);
        divRef.current.innerHTML = textToHtml(newText, assetMap, isLight);

        setTimeout(() => {
          if (divRef.current) {
            divRef.current.focus();
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(divRef.current);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }, 0);
      },
    }));

    // 仅在外部传入的 value 发生变更时（例如 reset 或选中预设 prompt）同步到 innerHTML
    useEffect(() => {
      if (!divRef.current) return;
      if (value === lastValRef.current) return;
      lastValRef.current = value;
      divRef.current.innerHTML = textToHtml(value, assetMap, isLight);
    }, [value, assetMap, isLight]);

    // 初始化内容
    useEffect(() => {
      if (divRef.current && !divRef.current.innerHTML && value) {
        divRef.current.innerHTML = textToHtml(value, assetMap, isLight);
      }
    }, []);

    const checkMention = useCallback(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !divRef.current) {
        onMentionClose?.();
        return;
      }
      const range = sel.getRangeAt(0);
      const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || '';
      const atIdx = textBefore.lastIndexOf('@');
      if (atIdx >= 0) {
        const query = textBefore.slice(atIdx + 1);
        if (!query.includes(' ') && !query.includes('\n')) {
          onMentionTrigger?.(query, atIdx);
          return;
        }
      }
      onMentionClose?.();
    }, [onMentionTrigger, onMentionClose]);

    const handleInput = () => {
      if (!divRef.current || isComposingRef.current) return;
      const text = htmlToText(divRef.current);
      lastValRef.current = text;
      onChange(text);
      checkMention();
    };

    const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.isDefaultPrevented()) return;

      // 检测 @ 输入
      if (e.key === '@' || (e.key === '2' && e.shiftKey)) {
        setTimeout(checkMention, 0);
      }
    };

    const isEmpty = !value || value.trim().length === 0;

    return (
      <div
        ref={divRef}
        id={id}
        contentEditable={true}
        suppressContentEditableWarning={true}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-placeholder={placeholder || ''}
        data-empty={isEmpty ? 'true' : 'false'}
        onInput={handleInput}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onPaste={onPaste}
        onKeyDown={handleInternalKeyDown}
        onKeyUp={checkMention}
        onClick={checkMention}
        className={`prompt-contenteditable ${embedded ? 'prompt-contenteditable-embedded' : ''} ${className}`}
        style={{
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
          cursor: 'text',
          position: 'relative',
          ...style,
        }}
      />
    );
  }
);
