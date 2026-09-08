/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { ConfigProvider, App, theme } from './provider';
import './styles.css';

export interface PlaygroundUIProviderProps {
  mode?: 'light' | 'dark';
  children: React.ReactNode;
  token?: Record<string, any>;
}

/**
 * 插件根 UI Provider — 在 Playground / PlaygroundHome 入口挂载一次即可
 */
export const PlaygroundUIProvider: React.FC<PlaygroundUIProviderProps> = ({
  mode = 'dark',
  children,
  token,
}) => (
  <div className="pg-ui-root" data-theme={mode} style={{ width: '100%', height: '100%' }}>
    <ConfigProvider
      theme={{
        algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: mode === 'dark' ? '#fafafa' : '#18181b',
          borderRadius: 12,
          colorBgContainer: mode === 'dark' ? '#1E1F22' : '#ffffff',
          colorBorder: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
          ...token,
        },
      }}
    >
      <App>
        <TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={200}>
          {children}
        </TooltipPrimitive.Provider>
      </App>
    </ConfigProvider>
  </div>
);
