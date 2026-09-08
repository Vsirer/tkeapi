/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/** 作品卡片时间：YYYY年MM月DD日 HH:mm:ss（中文） */
export function formatWorkCardTime(ts: number, locale = 'zh'): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  if (String(locale).toLowerCase().startsWith('zh')) {
    return `${y}年${m}月${day}日 ${h}:${min}:${s}`;
  }
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}
