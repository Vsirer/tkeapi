/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines } from 'lucide-react';
import './SmoothMediaPreview.css';

export type SmoothMediaPreviewProps = {
  src: string;
  mediaType?: 'image' | 'video' | 'audio';
  alt?: string;
  className?: string;
  autoPlayOnHover?: boolean;
};

/**
 * 基于 URL 生成确定性随机动效参数（快速错峰入场 + 错峰灰度呼吸）
 */
function getDeterministicStaggerParams(src: string): { staggerDelay: number; pulseDelay: number } {
  if (!src) return { staggerDelay: 0, pulseDelay: 0 };
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash) + src.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash);
  const bucket = abs % 6; // 6 档离散延迟
  const staggerDelay = 15 + bucket * 32; // 15ms, 47ms, 79ms, 111ms, 143ms, 175ms
  const pulseDelay = -((abs % 8) * 0.22); // -0.0s ~ -1.54s 呼吸相位错开
  return { staggerDelay, pulseDelay };
}

export const SmoothMediaPreview: React.FC<SmoothMediaPreviewProps> = ({
  src,
  mediaType = 'image',
  alt = '',
  className = '',
  autoPlayOnHover = true,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 确定性随机快速交错延迟与呼吸相位
  const { staggerDelay, pulseDelay } = useMemo(() => getDeterministicStaggerParams(src), [src]);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);

    if (mediaType === 'audio') {
      setLoaded(true);
    } else if (mediaType !== 'video' && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src, mediaType]);

  const handleMouseEnter = () => {
    if (mediaType === 'video' && autoPlayOnHover && videoRef.current) {
      const v = videoRef.current;
      v.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (mediaType === 'video' && autoPlayOnHover && videoRef.current) {
      const v = videoRef.current;
      v.pause();
      v.currentTime = 0;
    }
  };

  return (
    <div
      className={`pg-smooth-media-wrap ${className}`}
      style={
        {
          '--pg-stagger-delay': `${staggerDelay}ms`,
          '--pg-pulse-delay': `${pulseDelay}s`,
        } as React.CSSProperties
      }
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 纯净灰度骨架屏（错峰快速入场 + 异步微呼吸） */}
      <div className={`pg-smooth-media-skeleton ${loaded ? 'is-hidden' : ''}`} />

      {mediaType === 'video' ? (
        <video
          ref={videoRef}
          src={src}
          className={`pg-smooth-media-el ${loaded ? 'is-loaded' : ''}`}
          muted
          playsInline
          loop
          disablePictureInPicture
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
          onCanPlay={() => setLoaded(true)}
          onError={() => setHasError(true)}
        />
      ) : mediaType === 'audio' ? (
        <div
          className={`pg-smooth-media-el ${loaded ? 'is-loaded' : ''}`}
          style={{
            width: '100%',
            height: '100%',
            minHeight: 180,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'linear-gradient(135deg, rgba(28, 29, 34, 0.95) 0%, rgba(18, 18, 22, 0.98) 100%)',
            padding: '24px 16px',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            <AudioLines size={24} style={{ color: 'rgba(255, 255, 255, 0.88)' }} />
          </div>
          {alt ? (
            <span
              style={{
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.65)',
                maxWidth: '90%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              {alt}
            </span>
          ) : null}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`pg-smooth-media-el ${loaded ? 'is-loaded' : ''}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
};

export default React.memo(SmoothMediaPreview);
