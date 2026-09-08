/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Modal, type ConfirmConfig } from './modal';
import { message, type MessageApi } from './message';

export type ThemeMode = 'light' | 'dark';

export interface DesignToken {
  colorPrimary: string;
  colorBgContainer: string;
  colorBgElevated: string;
  colorBorder: string;
  colorText: string;
  colorTextSecondary: string;
  borderRadius: number;
}

const darkToken: DesignToken = {
  colorPrimary: '#ffffff',
  colorBgContainer: '#171717',
  colorBgElevated: '#212121',
  colorBorder: 'rgba(255,255,255,0.08)',
  colorText: '#ffffff',
  colorTextSecondary: '#bdbdbd',
  borderRadius: 12,
};

const lightToken: DesignToken = {
  colorPrimary: '#18181b',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBorder: 'rgba(0,0,0,0.08)',
  colorText: '#09090b',
  colorTextSecondary: '#52525b',
  borderRadius: 12,
};

type ThemeContextValue = {
  mode: ThemeMode;
  token: DesignToken;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  mode: 'dark',
  token: darkToken,
});

export const theme = {
  darkAlgorithm: 'dark' as const,
  defaultAlgorithm: 'light' as const,
  useToken: () => {
    const ctx = React.useContext(ThemeContext);
    return { token: ctx.token, theme: ctx };
  },
};

export interface ConfigProviderProps {
  theme?: {
    algorithm?: typeof theme.darkAlgorithm | typeof theme.defaultAlgorithm | Array<any>;
    token?: Partial<DesignToken>;
  };
  children?: React.ReactNode;
  wave?: any;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ theme: themeCfg, children }) => {
  const algo = themeCfg?.algorithm;
  const isDark =
    algo === theme.darkAlgorithm ||
    (Array.isArray(algo) && algo.includes(theme.darkAlgorithm));
  const mode: ThemeMode = isDark ? 'dark' : 'light';
  const token = { ...(mode === 'dark' ? darkToken : lightToken), ...themeCfg?.token };
  const parent = React.useContext(ThemeContext);

  return (
    <ThemeContext.Provider value={{ mode, token: { ...parent.token, ...token } }}>
      <div className="pg-ui-root" data-theme={mode} style={{ display: 'contents' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

type AppContextValue = {
  message: MessageApi;
  modal: { confirm: (config: ConfirmConfig) => ReturnType<typeof Modal.confirm> };
};

const AppContext = React.createContext<AppContextValue>({
  message,
  modal: { confirm: Modal.confirm },
});

export const App: React.FC<{ children?: React.ReactNode }> & {
  useApp: () => AppContextValue;
} = ({ children }) => (
  <AppContext.Provider value={{ message, modal: { confirm: Modal.confirm } }}>
    {children}
  </AppContext.Provider>
);

App.useApp = () => React.useContext(AppContext);

/** antd Grid.useBreakpoint 兼容 */
export function useBreakpoint() {
  const calc = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return {
      xs: w >= 0,
      sm: w >= 576,
      md: w >= 768,
      lg: w >= 992,
      xl: w >= 1200,
      xxl: w >= 1600,
    };
  };
  const [screens, setScreens] = React.useState(calc);
  React.useEffect(() => {
    const onResize = () => setScreens(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return screens;
}

export const Grid = { useBreakpoint };
