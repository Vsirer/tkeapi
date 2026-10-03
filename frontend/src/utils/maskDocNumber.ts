/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 证件号 / 税号展示脱敏。
 * 优先保留开头 4 位与末尾 4 位，中间按原长度替换为 *。
 * 长度不够同时保留首尾各 4 位时，两侧对称缩短，但至少露出 2 位（长度不足 2 时原样展示）。
 */
export function maskDocNumber(value?: string | null): string {
  if (!value) return '';
  const s = value.trim();
  const n = s.length;
  if (n <= 2) return s;

  let keep = 4;
  while (keep > 1 && keep * 2 >= n) keep -= 1;
  return s.slice(0, keep) + '*'.repeat(n - keep * 2) + s.slice(n - keep);
}
