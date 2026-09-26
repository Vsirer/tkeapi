/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useEffect, useRef, useState } from 'react';
import type Artplayer from 'artplayer';
import type { Option } from 'artplayer';
import './ArtPlayerPreview.css';

type ArtPlayerPreviewProps = {
  url: string;
  className?: string;
  autoplay?: boolean;
  muted?: boolean;
  theme?: string;
  locale?: string;
  onReady?: () => void;
  onError?: () => void;
  onLoadedMetadata?: (info: { width: number; height: number; duration?: number }) => void;
};

function artLang(locale?: string): NonNullable<Option['lang']> {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('zh')) {
    return l.includes('tw') || l.includes('hk') || l.includes('hant') ? 'zh-tw' : 'zh-cn';
  }
  return 'en';
}

/** 默认按视频像素展示；超出可用区域才等比缩小，不放大。 */
function fitContain(
  videoW: number,
  videoH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } | null {
  if (videoW <= 0 || videoH <= 0 || maxW <= 0 || maxH <= 0) return null;
  const scale = Math.min(1, maxW / videoW, maxH / videoH);
  return {
    width: Math.max(1, Math.round(videoW * scale)),
    height: Math.max(1, Math.round(videoH * scale)),
  };
}

const ArtPlayerPreview: React.FC<ArtPlayerPreviewProps> = ({
  url,
  className,
  autoplay = true,
  muted = true,
  theme = '#e4e4e7',
  locale,
  onReady,
  onError,
  onLoadedMetadata,
}) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const videoSizeRef = useRef<{ width: number; height: number } | null>(null);
  const applyFitRef = useRef<() => void>(() => {});
  const callbacksRef = useRef({ onReady, onError, onLoadedMetadata });
  callbacksRef.current = { onReady, onError, onLoadedMetadata };
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [fallbackNative, setFallbackNative] = useState(false);

  applyFitRef.current = () => {
    const parent = shellRef.current?.parentElement;
    const vs = videoSizeRef.current;
    if (!parent || !vs) return;
    const next = fitContain(vs.width, vs.height, parent.clientWidth, parent.clientHeight);
    if (!next) return;
    setBox((prev) =>
      prev && prev.width === next.width && prev.height === next.height ? prev : next,
    );
  };

  useEffect(() => {
    videoSizeRef.current = null;
    setBox(null);
  }, [url]);

  useEffect(() => {
    const parent = shellRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => applyFitRef.current());
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const art = artRef.current;
    if (!art || !box) return;
    art.emit('resize');
  }, [box]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !url) return;

    let cancelled = false;
    let art: Artplayer | null = null;

    const reportSize = (player: Artplayer) => {
      const v = player.video;
      if (!v?.videoWidth || !v.videoHeight) return;
      const size = { width: v.videoWidth, height: v.videoHeight };
      videoSizeRef.current = size;
      applyFitRef.current();
      const duration = Number.isFinite(v.duration) ? v.duration : undefined;
      callbacksRef.current.onLoadedMetadata?.({ ...size, duration });
    };

    void import('artplayer').then(({ default: Artplayer }) => {
      if (cancelled || !containerRef.current) return;

      Artplayer.CONTEXTMENU = false;

      const player = new Artplayer({
        container: containerRef.current,
        url,
        theme,
        lang: artLang(locale),
        volume: 0.7,
        autoplay,
        muted,
        autoSize: false,
        autoMini: false,
        playbackRate: true,
        aspectRatio: true,
        flip: true,
        screenshot: false,
        setting: true,
        hotkey: true,
        pip: false,
        mutex: true,
        backdrop: true,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        playsInline: true,
        lock: true,
        fastForward: true,
        autoOrientation: true,
        moreVideoAttr: {
          playsInline: true,
          preload: 'metadata',
          disablePictureInPicture: true,
        },
      });
      if (cancelled) {
        player.destroy(false);
        return;
      }
      art = player;
      artRef.current = player;
      player.proxy(player.template.$player, 'contextmenu', (event: any) => {
        event.preventDefault();
      });

      player.on('ready', () => {
        reportSize(player);
        callbacksRef.current.onReady?.();
      });
      player.on('video:loadedmetadata', () => {
        reportSize(player);
        callbacksRef.current.onReady?.();
      });
      player.on('video:canplay', () => callbacksRef.current.onReady?.());
      player.on('error', () => callbacksRef.current.onError?.());
      player.on('video:error', () => callbacksRef.current.onError?.());
    }).catch((err) => {
      console.warn('[ArtPlayerPreview] Failed to load artplayer, falling back to native video:', err);
      if (!cancelled) {
        setFallbackNative(true);
      }
    });

    return () => {
      cancelled = true;
      artRef.current = null;
      art?.destroy(false);
    };
  }, [url, autoplay, muted, theme, locale]);

  return (
    <div
      ref={shellRef}
      className={`tb-artplayer-shell ${className ?? ''}`.trim()}
      style={box ? { width: box.width, height: box.height } : undefined}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {fallbackNative ? (
        <video
          src={url}
          autoPlay={autoplay}
          muted={muted}
          controls
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            videoSizeRef.current = { width: v.videoWidth, height: v.videoHeight };
            applyFitRef.current();
            callbacksRef.current.onLoadedMetadata?.({
              width: v.videoWidth,
              height: v.videoHeight,
              duration: v.duration,
            });
          }}
          onCanPlay={() => callbacksRef.current.onReady?.()}
          onError={() => callbacksRef.current.onError?.()}
        />
      ) : (
        <div ref={containerRef} className="tb-artplayer" />
      )}
    </div>
  );
};

export default React.memo(ArtPlayerPreview);
