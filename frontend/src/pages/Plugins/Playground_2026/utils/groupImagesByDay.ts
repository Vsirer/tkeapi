/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片列表按天分组（对齐 Higgsfield Assets：Today / Yesterday / 日期）
 */

export type DayGroup<T> = {
  /** 本地日历日 YYYY-MM-DD */
  key: string;
  label: string;
  items: T[];
};

/** 本地时区日历日键 */
function getDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayGroupLabel(
  dayKey: string,
  options?: {
    locale?: string;
    todayLabel?: string;
    yesterdayLabel?: string;
  },
): string {
  const locale = options?.locale || 'zh';
  const isZh = locale.toLowerCase().startsWith('zh');
  const todayLabel = options?.todayLabel || (isZh ? '今天' : 'Today');
  const yesterdayLabel = options?.yesterdayLabel || (isZh ? '昨天' : 'Yesterday');

  const [y, m, d] = dayKey.split('-').map(Number);
  const today = new Date();
  const todayKey = getDayKey(today.getTime());
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yesterdayKey = getDayKey(yest.getTime());

  if (dayKey === todayKey) return todayLabel;
  if (dayKey === yesterdayKey) return yesterdayLabel;

  if (isZh) {
    if (y === today.getFullYear()) return `${m}月${d}日`;
    return `${y}年${m}月${d}日`;
  }

  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale.startsWith('en') ? 'en-US' : locale, {
    month: 'short',
    day: 'numeric',
    ...(y === today.getFullYear() ? {} : { year: 'numeric' as const }),
  });
}

/**
 * 按日历日分组；组顺序默认新→旧。
 * 组内保持传入数组的相对顺序。
 */
export function groupItemsByDay<T extends { createdAt: number }>(
  items: T[],
  options?: {
    locale?: string;
    order?: 'desc' | 'asc';
    todayLabel?: string;
    yesterdayLabel?: string;
  },
): DayGroup<T>[] {
  const order = options?.order || 'desc';
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = getDayKey(it.createdAt || Date.now());
    const bucket = map.get(key);
    if (bucket) bucket.push(it);
    else map.set(key, [it]);
  }

  const keys = [...map.keys()].sort((a, b) =>
    order === 'desc' ? b.localeCompare(a) : a.localeCompare(b),
  );

  return keys.map((key) => ({
    key,
    label: formatDayGroupLabel(key, options),
    items: map.get(key) || [],
  }));
}
