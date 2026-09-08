/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { clsx, type ClassValue } from 'clsx';

/** Imagine / shadcn 风格 class 合并 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
