/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 插件内存活门禁：进入页面时探测 /playground-2026/health；
 * 仅在编译/重启等失败时每 5s 重试，成功后立刻停掉，不再轮询。
 */
import React from 'react';
import { Spin } from '../ui';
import {
  PLAYGROUND_2026_HEALTH_POLL_MS,
  probePlayground2026Health,
} from '../utils/pluginHealth';

const PlaygroundHealthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [phase, setPhase] = React.useState<'loading' | 'waiting' | 'ready'>('loading');

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopPoll = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const ensurePoll = () => {
      if (!timer) {
        timer = setInterval(() => {
          void check();
        }, PLAYGROUND_2026_HEALTH_POLL_MS);
      }
    };

    const check = async () => {
      try {
        await probePlayground2026Health();
        if (cancelled) return;
        setPhase('ready');
        stopPoll();
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        // 有 HTTP 应答说明进程已起来；401/403 只是登录态问题，不要伪装成「后端连接中」
        if (status === 401 || status === 403) {
          setPhase('ready');
          stopPoll();
          return;
        }
        setPhase('waiting');
        ensurePoll();
      }
    };

    void check();
    return () => {
      cancelled = true;
      stopPoll();
    };
  }, []);

  if (phase === 'loading' || phase === 'waiting') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
        }}
      >
        <Spin size="large" />
        <div style={{ fontSize: 13, opacity: 0.65, textAlign: 'center' }}>
          {phase === 'waiting' ? '后端服务连接中，请稍候…' : '加载中…'}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PlaygroundHealthGate;
