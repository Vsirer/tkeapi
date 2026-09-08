/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import type { ReactNode } from 'react';
import React from 'react';
import globalToast, { type ToastType } from '../../../../components/GlobalToast';

type Content = ReactNode;
type MessageArg = Content | { content?: Content; key?: string; duration?: number; type?: string };

const toText = (content: Content): string => {
  if (typeof content === 'string' || typeof content === 'number') return String(content);
  if (React.isValidElement(content)) {
    // 提取简单文本或以空兜底
    return typeof (content.props as any)?.children === 'string'
      ? (content.props as any).children
      : '';
  }
  return content ? String(content) : '';
};

const resolve = (arg: MessageArg): { text: string; duration?: number; key?: string } => {
  if (arg != null && typeof arg === 'object' && !React.isValidElement(arg) && 'content' in (arg as object)) {
    const o = arg as { content?: Content; duration?: number; key?: string };
    return { text: toText(o.content), duration: o.duration, key: o.key };
  }
  return { text: toText(arg as Content) };
};

/** antd message 兼容层（底层直接使用全站统一的居中黑底 GlobalToast） */
export const message = {
  success: (content: MessageArg, duration?: number) => {
    const { text, duration: d, key } = resolve(content);
    return globalToast.success(text, undefined, (d ?? duration) != null ? (d ?? duration)! * 1000 : undefined, key);
  },
  error: (content: MessageArg, duration?: number) => {
    const { text, duration: d, key } = resolve(content);
    return globalToast.error(text, undefined, (d ?? duration) != null ? (d ?? duration)! * 1000 : undefined, key);
  },
  warning: (content: MessageArg, duration?: number) => {
    const { text, duration: d, key } = resolve(content);
    return globalToast.warning(text, undefined, (d ?? duration) != null ? (d ?? duration)! * 1000 : undefined, key);
  },
  info: (content: MessageArg, duration?: number) => {
    const { text, duration: d, key } = resolve(content);
    return globalToast.info(text, undefined, (d ?? duration) != null ? (d ?? duration)! * 1000 : undefined, key);
  },
  loading: (content: MessageArg, duration?: number) => {
    const { text, duration: d, key } = resolve(content);
    return globalToast.info(text, undefined, (d ?? duration) != null ? (d ?? duration)! * 1000 : undefined, key);
  },
  open: (config: { type?: string; content?: Content; duration?: number; key?: string }) => {
    const type = ((config.type as ToastType) || 'info');
    const text = toText(config.content);
    const dur = config.duration != null ? config.duration * 1000 : undefined;
    return globalToast[type] ? globalToast[type](text, undefined, dur, config.key) : globalToast.info(text, undefined, dur, config.key);
  },
  destroy: (key?: string) => globalToast.destroy(key),
};

export type MessageApi = typeof message;

