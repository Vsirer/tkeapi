/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import axios from 'axios';
import useAuthStore from '../store/auth';

const AWAITING_SETUP_KEY = 'tokensbyte_awaiting_setup';
export const DEFAULT_ADMIN_PATH = 'admin1688';

export function isAwaitingFreshSetup(): boolean {
  return sessionStorage.getItem(AWAITING_SETUP_KEY) === '1';
}

export function clearAwaitingFreshSetup(): void {
  sessionStorage.removeItem(AWAITING_SETUP_KEY);
}

/** 带超时，避免后端退出后 Vite 代理把探测请求挂死 */
export async function fetchAdminInitStatus(timeoutMs = 4000): Promise<boolean> {
  const response = await axios.get<{ initialized?: boolean }>('/api/v1/auth/admin/init-status', {
    timeout: timeoutMs,
  });
  const value = response.data?.initialized;
  if (typeof value === 'boolean') return value;
  throw new Error('invalid init-status');
}

/** 清空登录态并整页进入管理员初始化（与全新安装同一入口） */
export function enterFreshSetup(): void {
  const { setToken, setUser } = useAuthStore.getState();
  setToken(null);
  setUser(null);
  localStorage.setItem('tokensbyte_admin_path', DEFAULT_ADMIN_PATH);
  sessionStorage.setItem(AWAITING_SETUP_KEY, '1');
  window.location.replace(`/${DEFAULT_ADMIN_PATH}`);
}
