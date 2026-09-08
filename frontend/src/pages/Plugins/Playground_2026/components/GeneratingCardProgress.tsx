/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useRef } from 'react';
import './GeneratingCardProgress.css';

export type GeneratingCardProgressProps = {
  /** 任务创建时间戳（毫秒数），用于精准推算已有进度 */
  createdAt?: number;
  /** 提示文案，默认「生成中…」 */
  label?: string;
  className?: string;
};

// SVG 环形参数
const RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 约 144.513

/**
 * 自然平滑的拟真进度算法（Simulated Progress Curve）
 * @param elapsedMs 任务已运行毫秒数
 */
function calculateSimulatedProgress(elapsedMs: number): number {
  const sec = Math.max(0, elapsedMs / 1000);
  if (sec <= 0) return 3;

  // 0 ~ 2s: 快速起跑到 28%
  if (sec <= 2) {
    return 3 + (sec / 2) * 25;
  }
  // 2s ~ 8s: 匀速推进到 62%
  if (sec <= 8) {
    const p = (sec - 2) / 6;
    return 28 + p * 34;
  }
  // 8s ~ 20s: 推进到 86%
  if (sec <= 20) {
    const p = (sec - 8) / 12;
    return 62 + p * 24;
  }
  // 20s ~ 45s: 逼近到 94%
  if (sec <= 45) {
    const p = (sec - 20) / 25;
    return 86 + p * 8;
  }
  // 45s 以上: 极慢渐近线逼近 98.8%
  const extraSec = sec - 45;
  const asymptotic = 94 + (4.8 * (1 - Math.exp(-extraSec / 40)));
  return Math.min(98.8, asymptotic);
}

export const GeneratingCardProgress: React.FC<GeneratingCardProgressProps> = ({
  createdAt,
  label = '生成中…',
  className = '',
}) => {
  // 记录组件挂载时的基准时间
  const mountTimeRef = useRef<number>(Date.now());
  const initialTime = createdAt && createdAt > 0 ? createdAt : mountTimeRef.current;

  const [progress, setProgress] = useState<number>(() => {
    const initialElapsed = Math.max(0, Date.now() - initialTime);
    return calculateSimulatedProgress(initialElapsed);
  });

  useEffect(() => {
    let animId: number;
    let lastUpdate = performance.now();

    const tick = (now: number) => {
      // 约每 80ms 更新一次，避免不必要的过度重绘
      if (now - lastUpdate >= 75) {
        lastUpdate = now;
        const currentElapsed = Math.max(0, Date.now() - initialTime);
        const target = calculateSimulatedProgress(currentElapsed);

        setProgress((prev) => {
          // 保证百分比始终平滑递增且不会突跳回退
          if (target > prev) {
            const step = (target - prev) * 0.35 + 0.08;
            return Math.min(target, prev + step);
          }
          // 极慢的微小蠕动 (+0.04%)
          return Math.min(98.8, prev + 0.04);
        });
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [initialTime]);

  const displayPercent = Math.min(99, Math.max(1, Math.floor(progress)));
  const strokeOffset = CIRCUMFERENCE * (1 - progress / 100);

  return (
    <div className={`pg-card-progress-wrap ${className}`} role="progressbar" aria-valuenow={displayPercent} aria-valuemin={0} aria-valuemax={100}>
      <div className="pg-card-progress-dial">
        {/* 外圈微光慢旋虚线环 */}
        <div className="pg-card-progress-glow-ring" />

        {/* 核心 SVG 环形进度条 */}
        <svg className="pg-card-progress-svg" viewBox="0 0 58 58">
          <defs>
            {/* 暗色模式高级渐变 */}
            <linearGradient id="pgProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.35)" />
              <stop offset="60%" stopColor="rgba(255, 255, 255, 0.85)" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            {/* 亮色模式高级渐变 */}
            <linearGradient id="pgProgressGradientLight" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(0, 0, 0, 0.35)" />
              <stop offset="60%" stopColor="rgba(0, 0, 0, 0.8)" />
              <stop offset="100%" stopColor="#111111" />
            </linearGradient>
          </defs>

          {/* 底圈轨道 */}
          <circle
            className="pg-card-progress-track"
            cx="29"
            cy="29"
            r={RADIUS}
          />

          {/* 动态进度环 */}
          <circle
            className="pg-card-progress-bar"
            cx="29"
            cy="29"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeOffset}
          />
        </svg>

        {/* 中心百分比数值 */}
        <span className="pg-card-progress-num">
          {displayPercent}%
        </span>
      </div>

      {/* 底部生成中提示文案 */}
      <span className="pg-card-progress-label">
        {label}
      </span>
    </div>
  );
};

export default React.memo(GeneratingCardProgress);
