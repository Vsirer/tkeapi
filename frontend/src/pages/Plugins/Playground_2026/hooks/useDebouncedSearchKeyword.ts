/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from 'react';

const DEFAULT_DELAY_MS = 300;

/**
 * 列表搜索：输入框即时回显 + 防抖过滤；
 * 中文等 IME 组字过程中不触发搜索，组字结束后再防抖。
 */
export function useDebouncedSearchKeyword(delayMs = DEFAULT_DELAY_MS) {
  const [inputValue, setInputValue] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const commit = useCallback(
    (value: string, immediate = false) => {
      clearTimer();
      if (immediate) {
        setSearchKeyword(value);
        return;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setSearchKeyword(value);
      }, delayMs);
    },
    [clearTimer, delayMs],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      const ne = e.nativeEvent as InputEvent & { isComposing?: boolean };
      if (composingRef.current || ne.isComposing) {
        return;
      }
      commit(value);
    },
    [commit],
  );

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false;
      const value = (e.target as HTMLInputElement).value;
      setInputValue(value);
      commit(value);
    },
    [commit],
  );

  /** 程序化赋值（清空等）：立即同步过滤词 */
  const setKeyword = useCallback(
    (value: string) => {
      composingRef.current = false;
      setInputValue(value);
      commit(value, true);
    },
    [commit],
  );

  return {
    /** 输入框展示值 */
    inputValue,
    /** 防抖后的过滤关键字 */
    searchKeyword,
    setSearchKeyword: setKeyword,
    searchInputProps: {
      value: inputValue,
      onChange,
      onCompositionStart,
      onCompositionEnd,
    },
  };
}
