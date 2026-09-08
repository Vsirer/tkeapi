/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心 2026 图片/视频详情展示浮层（全新多维创作工作台设计）
 * - 左侧：超大居中预览、全屏灯箱放大、左右切换箭头
 * - 右侧：顶部 Download、作者行、Details/Comments Tabs、提示词与模型 Badge、Located 归属分类、Creation Actions (Upscale/Remove Bg/Variate/Pan)、Animate image 动效
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Layers,
  Sparkles,
  Folder,
  FolderPlus,
  Info,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Send,
  AudioLines,
} from 'lucide-react';
import { Tooltip, message } from '../ui';
import request from '../../../../utils/request';
import { coalesceAsync } from '../../../../utils/coalesceAsync';
import useAuthStore from '../../../../store/auth';
import { useThemeStore } from '../../../../store/theme';
import { solidAccent } from '../../../../theme/tokens';
import type { GeneratedImageItem } from '../utils/imageGenStorage';
import type { PlaygroundModel } from '../types';
import ModelLogoIcon from './ModelLogoIcon';
import { resolveModelLogoSrc } from '../utils/modelLogo';
import { copyToClipboard } from '../../../../utils/clipboard';
import { deriveAspectRatio } from '../hooks/usePlaygroundImageModels';
import { listGenerationDetailRows } from '../utils/generationParams';
import { downloadFileByUrl } from '../utils/downloadFile';
import { getAssetDownloadFilename } from '../utils/resourceFileName';
import { publishImageGenSeed, type ImageGenSeed } from '../utils/imageGenSeed';
import { publishVideoGenSeed, type VideoGenSeed } from '../utils/videoGenSeed';
import { listAlbums, type WorkAlbum } from '../utils/albumsApi';
import { formatFileSizeBytes } from '../utils/previewMedia';
import { getLocalFile } from '../utils/localFileRegistry';
import { RESOLUTION_MAP } from '../constants';
import './ImageDetailOverlay.css';

export type ImageDetailOverlayProps = {
  item: GeneratedImageItem | null;
  open: boolean;
  onClose: () => void;
  /** 媒体类型：图片/视频/声音 */
  mediaType?: 'image' | 'video' | 'audio';
  /** 重试：回填提示词/参数（由父级决定是否立即生成） */
  onRecreate?: (item: GeneratedImageItem) => void;
  /** 设为图片生成参考 */
  onReferenceImage?: (item: GeneratedImageItem) => void;
  /** 设为视频生成参考 */
  onReferenceVideo?: (item: GeneratedImageItem) => void;
  /** @deprecated 请用 onReferenceImage */
  onReference?: (item: GeneratedImageItem) => void;
  /** 删除资源回调 */
  onDelete?: (item: GeneratedImageItem) => void;
  /** 左右翻页 */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

/** 相对时间格式化（对齐参考图 Created 20 days ago） */
function formatRelativeTime(ts: number, locale: string): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - ts);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const isZh = locale.startsWith('zh');

  if (diffDay > 30) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (diffDay > 0) {
    return isZh ? `创建于 ${diffDay} 天前` : `Created ${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  }
  if (diffHour > 0) {
    return isZh ? `创建于 ${diffHour} 小时前` : `Created ${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  }
  if (diffMin > 0) {
    return isZh ? `创建于 ${diffMin} 分钟前` : `Created ${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  }
  return isZh ? '刚刚创建' : 'Created just now';
}

function formatExactTime(input?: number | string | null): string {
  if (!input) return '';
  const d = typeof input === 'number' ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

const formatCreatedAt = formatExactTime;

function pickDetailRows(
  item: GeneratedImageItem,
  locale: string,
  matchedModel?: PlaygroundModel | null,
  fileSizeStr?: string | null,
) {
  const pv = item.paramValues || {};
  const zh = locale.startsWith('zh');
  const rows: { key: string; label: string; value: string }[] = [
    {
      key: 'model',
      label: zh ? '模型 ID' : 'Model ID',
      value: matchedModel?.model_id || item.model || 'ImagineArt 2.0',
    },
  ];

  const schemeRows = listGenerationDetailRows(pv);
  for (const r of schemeRows) {
    rows.push(r);
  }

  const hasAspectLike = rows.some((r) => {
    const k = r.key.toLowerCase();
    return k === 'ratio' || k === 'size' || k === 'aspect_ratio';
  });
  if (!hasAspectLike) {
    const aspect = item.aspectRatio || deriveAspectRatio(pv);
    if (aspect) {
      rows.push({
        key: 'size',
        label: zh ? '尺寸' : 'Size',
        value: aspect,
      });
    }
  }
  if (item.resolution && !rows.some((r) => r.key.toLowerCase() === 'resolution')) {
    const q = item.resolution;
    if (!rows.some((r) => r.value === q)) {
      rows.push({
        key: 'resolution',
        label: item.mediaType === 'video' ? (zh ? '视频分辨率' : 'Video Resolution') : (zh ? '图片分辨率' : 'Image Resolution'),
        value: q,
      });
    }
  }

  if (fileSizeStr && fileSizeStr !== '未知') {
    rows.push({
      key: 'file_size',
      label: zh ? '文件大小' : 'File Size',
      value: fileSizeStr,
    });
  }

  rows.push({
    key: 'created',
    label: zh ? '创建时间' : 'Created',
    value: formatExactTime(item.createdAt),
  });
  return rows;
}

const ImageDetailOverlay: React.FC<ImageDetailOverlayProps> = ({
  item,
  open,
  onClose,
  mediaType = 'image',
  onRecreate,
  onReferenceImage,
  onReferenceVideo,
  onReference,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const { themeMode } = useThemeStore();
  const isVideo = mediaType === 'video' || item?.mediaType === 'video';
  const isAudio = mediaType === 'audio' || item?.mediaType === 'audio';
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [fullscreen, setFullscreen] = useState(false);
  const [albums, setAlbums] = useState<WorkAlbum[]>([]);
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [logoBroken, setLogoBroken] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768,
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedModelId, setCopiedModelId] = useState(false);
  const [copiedTaskId, setCopiedTaskId] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const copyModelTimerRef = useRef<number | null>(null);
  const copyTaskTimerRef = useRef<number | null>(null);
  const copyLogTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      if (copyModelTimerRef.current) window.clearTimeout(copyModelTimerRef.current);
      if (copyTaskTimerRef.current) window.clearTimeout(copyTaskTimerRef.current);
      if (copyLogTimerRef.current) window.clearTimeout(copyLogTimerRef.current);
    };
  }, []);

  const handleCopyText = async (
    e: React.MouseEvent | undefined,
    text: string,
    setFlag: React.Dispatch<React.SetStateAction<boolean>>,
    timerRef: React.MutableRefObject<number | null>,
  ) => {
    e?.stopPropagation();
    if (!text) return;
    try {
      const ok = await copyToClipboard(text);
      if (ok) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        setFlag(true);
        timerRef.current = window.setTimeout(() => {
          setFlag(false);
          timerRef.current = null;
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to copy', err);
      message.error(t('playground_2026:copy_failed', '复制失败'));
    }
  };

  const [detectedFileSize, setDetectedFileSize] = useState<string | null>(null);

  // 探测并解析真实文件大小
  useEffect(() => {
    if (!open || !item) {
      setDetectedFileSize(null);
      return;
    }

    if (typeof item.fileSize === 'number' && item.fileSize > 0) {
      setDetectedFileSize(formatFileSizeBytes(item.fileSize));
      return;
    }

    const url = item.previewUrl;
    if (!url) {
      setDetectedFileSize(null);
      return;
    }

    let active = true;

    if (url.startsWith('blob:')) {
      const f = getLocalFile(url);
      if (f?.size) {
        setDetectedFileSize(formatFileSizeBytes(f.size));
        return;
      }
    }

    // 优先从浏览器性能缓存条目读取资源字节数，无需额外网络请求
    try {
      const entries = performance.getEntriesByName(url);
      if (entries.length > 0) {
        const entry = entries[entries.length - 1] as PerformanceResourceTiming;
        const bytes = entry.encodedBodySize || entry.decodedBodySize || entry.transferSize;
        if (bytes && bytes > 0) {
          setDetectedFileSize(formatFileSizeBytes(bytes));
          return;
        }
      }
    } catch {
      /* ignore */
    }

    // 尝试 HEAD 请求获取 Content-Length
    fetch(url, { method: 'HEAD' })
      .then((res) => {
        if (!active) return;
        const len = res.headers.get('content-length');
        if (len) {
          const bytes = parseInt(len, 10);
          if (Number.isFinite(bytes) && bytes > 0) {
            setDetectedFileSize(formatFileSizeBytes(bytes));
          }
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      active = false;
    };
  }, [open, item?.id, item?.previewUrl, item?.fileSize]);

  const displayFileSize = useMemo(() => {
    if (typeof item?.fileSize === 'number' && item.fileSize > 0) {
      return formatFileSizeBytes(item.fileSize);
    }
    return detectedFileSize;
  }, [item?.fileSize, detectedFileSize]);

  const [naturalDimension, setNaturalDimension] = useState<{ width: number; height: number } | null>(null);

  // 探测真实物理像素分辨率（图片自然尺寸 / 视频真实分辨率）
  useEffect(() => {
    if (!open || !item?.previewUrl) {
      setNaturalDimension(null);
      return;
    }
    setNaturalDimension(null);
    let active = true;

    if (isVideo) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = item.previewUrl;
      v.onloadedmetadata = () => {
        if (!active) return;
        if (v.videoWidth && v.videoHeight) {
          setNaturalDimension({ width: v.videoWidth, height: v.videoHeight });
        }
      };
    } else if (!isAudio) {
      const img = new Image();
      img.src = item.previewUrl;
      img.onload = () => {
        if (!active) return;
        if (img.naturalWidth && img.naturalHeight) {
          setNaturalDimension({ width: img.naturalWidth, height: img.naturalHeight });
        }
      };
    }

    return () => {
      active = false;
    };
  }, [open, item?.id, item?.previewUrl, isVideo, isAudio]);

  const displayResolution = useMemo(() => {
    if (naturalDimension && naturalDimension.width > 0 && naturalDimension.height > 0) {
      const px = `${naturalDimension.width}×${naturalDimension.height}`;
      if (item?.resolution && !item.resolution.includes('×') && !item.resolution.includes('x')) {
        return `${px} (${item.resolution})`;
      }
      return px;
    }
    if (item?.resolution) {
      if (item.resolution.includes('×') || item.resolution.includes('x')) {
        return item.resolution;
      }
      const ratio = item.aspectRatio || '16:9';
      const mapped = RESOLUTION_MAP[item.resolution]?.[ratio];
      if (mapped) {
        return `${mapped} (${item.resolution})`;
      }
      return item.resolution;
    }
    return null;
  }, [naturalDimension, item?.resolution, item?.aspectRatio]);

  const durationText = useMemo(() => {
    if (!item) return null;
    const start = typeof item.createdAt === 'number' && item.createdAt > 0
      ? item.createdAt
      : (item.createdAtStr ? new Date(item.createdAtStr).getTime() : 0);
    const end = typeof item.updatedAt === 'number' && item.updatedAt > 0
      ? item.updatedAt
      : (item.updatedAtStr ? new Date(item.updatedAtStr).getTime() : 0);
    if (start > 0 && end > 0 && end >= start) {
      const diffSec = (end - start) / 1000;
      if (diffSec < 0.2) return null;
      if (diffSec < 60) return `${diffSec.toFixed(1)}s`;
      const min = Math.floor(diffSec / 60);
      const sec = Math.round(diffSec % 60);
      return `${min}m ${sec}s`;
    }
    return null;
  }, [item?.createdAt, item?.createdAtStr, item?.updatedAt, item?.updatedAtStr]);

  /** 写入种子；同页靠事件应用，跨页再开工作台（避免父级 onReference* 覆盖完整种子） */
  const openImageWorkbench = (seed: ImageGenSeed) => {
    publishImageGenSeed(seed);
    onClose();
    if (!/\/playground-2026\/images\/?$/.test(window.location.pathname)) {
      window.open('/playground-2026/images', '_blank');
    }
  };

  const openVideoWorkbench = (seed: VideoGenSeed) => {
    publishVideoGenSeed(seed);
    onClose();
    if (!/\/playground-2026\/videos\/?$/.test(window.location.pathname)) {
      window.open('/playground-2026/videos', '_blank');
    }
  };

  // 加载分类列表与模型列表以便显示 Located 与模型真实信息
  useEffect(() => {
    if (!open) return;
    listAlbums()
      .then((res) => setAlbums(res || []))
      .catch(() => {});

    coalesceAsync('pg2026:public-config', () =>
      request.get('/plugins/playground_2026/playground-public-config') as Promise<any>,
    )
      .then((res) => {
        if (Array.isArray(res?.models)) {
          setModels(res.models);
        }
      })
      .catch(() => {});
  }, [open]);

  // 匹配真实模型对象（获取管理后台配置的 model_id 与 logo）
  const matchedModel = useMemo(() => {
    if (!item?.model || !models.length) return null;
    const rawTarget = item.model.trim();
    const target = rawTarget.toLowerCase();
    const cleanTarget = target.replace(/[-_ \/]/g, '');

    // 1. 精确匹配
    const exact = models.find(
      (m) =>
        (m.model_id && m.model_id.trim().toLowerCase() === target) ||
        (m.mid && m.mid.trim().toLowerCase() === target) ||
        (m.name && m.name.trim().toLowerCase() === target) ||
        String(m.id) === target,
    );
    if (exact) return exact;

    // 2. 清理特殊字符后模糊匹配
    const fuzzy = models.find((m) => {
      const cMid = (m.mid || '').toLowerCase().replace(/[-_ \/]/g, '');
      const cModelId = (m.model_id || '').toLowerCase().replace(/[-_ \/]/g, '');
      const cName = (m.name || '').toLowerCase().replace(/[-_ \/]/g, '');
      const cSchemeId = (m.scheme_id || '').toLowerCase().replace(/[-_ \/]/g, '');
      const cSchemeName = (m.scheme_name || '').toLowerCase().replace(/[-_ \/]/g, '');
      return (
        cMid === cleanTarget ||
        cModelId === cleanTarget ||
        cName === cleanTarget ||
        cSchemeId === cleanTarget ||
        cSchemeName === cleanTarget ||
        (cleanTarget.length >= 3 &&
          (cMid.includes(cleanTarget) ||
            cModelId.includes(cleanTarget) ||
            cName.includes(cleanTarget) ||
            cleanTarget.includes(cMid) ||
            cleanTarget.includes(cModelId)))
      );
    });
    return fuzzy || null;
  }, [item?.model, models]);

  const displayModelId = matchedModel?.model_id || matchedModel?.mid || item?.model || 'ImagineArt 2.0';
  const modelLogoSrc = resolveModelLogoSrc(
    matchedModel?.logo || (item as any)?.modelLogo || (item as any)?.logo,
  );

  useEffect(() => {
    setLogoBroken(false);
  }, [modelLogoSrc]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) setInfoOpen(false);
  }, [open]);

  useEffect(() => {
    setInfoOpen(false);
  }, [item?.id]);

  // ESC 与键盘快捷键
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) {
          setFullscreen(false);
        } else if (infoOpen) {
          setInfoOpen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' && onPrev && hasPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext && hasNext) {
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, fullscreen, infoOpen, onPrev, onNext, hasPrev, hasNext]);

  const isLight = themeMode === 'light';
  const avatarAccent = solidAccent(isLight ? 'light' : 'dark');

  // 作者名称与头像（与右上角 UserAvatarMenu 保持一致）
  const authorName = useMemo(() => {
    return (
      user?.nickname ||
      user?.username ||
      t('playground_2026:image_detail_author_fallback', '我')
    );
  }, [user, t]);

  const authorInitial =
    user?.nickname?.charAt(0)?.toUpperCase() ||
    user?.username?.charAt(0)?.toUpperCase() ||
    '?';

  // 归属分类名称
  const locatedAlbumName = useMemo(() => {
    if (!item?.albumIds?.length) {
      return t('playground_2026:default_folder', '默认文件夹');
    }
    const found = albums.find((a) => item.albumIds?.includes(a.id));
    return found?.name || t('playground_2026:default_folder', '默认文件夹');
  }, [item, albums, t]);

  // 详情参数表格
  const detailRows = useMemo(
    () => (item ? pickDetailRows(item, i18n.language, matchedModel, displayFileSize) : []),
    [item, i18n.language, matchedModel, displayFileSize],
  );

  if (!open || !item) return null;

  // 复制提示词（在按钮上方标签提示，不弹全局 toast）
  const handleCopyPrompt = async () => {
    const ok = await copyToClipboard(item.prompt || '');
    if (ok) {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      setCopiedPrompt(true);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedPrompt(false);
        copyTimerRef.current = null;
      }, 1500);
    } else {
      message.error(t('playground_2026:image_detail_copy_failed', '复制失败'));
    }
  };

  // 复制模型 ID（在按钮上方标签提示，不弹全局 toast）
  const handleCopyModelId = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!displayModelId) return;
    const ok = await copyToClipboard(displayModelId);
    if (ok) {
      if (copyModelTimerRef.current) window.clearTimeout(copyModelTimerRef.current);
      setCopiedModelId(true);
      copyModelTimerRef.current = window.setTimeout(() => {
        setCopiedModelId(false);
        copyModelTimerRef.current = null;
      }, 1500);
    } else {
      message.error(t('playground_2026:copy_failed', '复制失败'));
    }
  };

  // 分享直链 / 提示词
  const handleShare = async () => {
    const shareText = item.previewUrl || item.prompt || window.location.href;
    const ok = await copyToClipboard(shareText);
    if (ok) {
      message.success(t('playground_2026:share_copied', '分享链接已复制到剪贴板'));
    } else {
      message.error(t('playground_2026:copy_failed', '复制失败'));
    }
  };

  // 下载文件
  const handleDownload = async () => {
    if (!item.previewUrl) {
      message.warning(
        isVideo
          ? t('playground_2026:video_gen_no_preview', '暂无预览')
          : isAudio
            ? t('playground_2026:audio_gen_no_preview', '暂无预览音频')
            : t('playground_2026:image_gen_no_preview', '暂无预览'),
      );
      return;
    }
    try {
      await downloadFileByUrl(item.previewUrl, {
        filename: getAssetDownloadFilename(item),
        mediaType: isVideo ? 'video' : isAudio ? 'audio' : 'image',
      });
      message.success(t('playground_2026:download_started', '已开始下载'));
    } catch (e: any) {
      message.error(e?.message || t('playground_2026:download_failed', '下载失败'));
    }
  };



  return createPortal(
    <div
      className={`hf-id-root pg-ig${themeMode === 'light' ? ' light' : ''}${infoOpen ? ' is-info-open' : ''}`}
      data-theme={themeMode}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="hf-id-container">
        <button
          type="button"
          className="hf-id-mobile-close"
          onClick={onClose}
          aria-label={t('common.close', '关闭')}
        >
          <X size={18} />
        </button>
        {/* 左侧主舞台：大图展示 + 悬浮工具栏 */}
        <div className="hf-id-stage-area">
          {/* 左翻页箭头 */}
          {hasPrev && onPrev && (
            <button
              type="button"
              className="hf-id-nav-btn prev"
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              aria-label="Previous"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* 媒体主容器 */}
          <div className="hf-id-media-wrapper">
            {item.previewUrl ? (
              isVideo ? (
                <video
                  className="hf-id-main-media"
                  src={item.previewUrl}
                  controls
                  controlsList="nodownload noplaybackrate"
                  playsInline
                  autoPlay
                  muted
                  disablePictureInPicture
                  onClick={(e) => e.stopPropagation()}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (v.videoWidth && v.videoHeight) {
                      setNaturalDimension({ width: v.videoWidth, height: v.videoHeight });
                    }
                  }}
                />
              ) : isAudio ? (
                <div
                  className="hf-id-audio-container"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    maxWidth: 480,
                    padding: '44px 28px',
                    borderRadius: 16,
                    background: 'rgba(28, 29, 34, 0.72)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(20px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 24,
                    userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                    }}
                  >
                    <AudioLines size={36} style={{ color: 'rgba(255, 255, 255, 0.92)' }} />
                  </div>
                  <div
                    style={{
                      color: 'rgba(255, 255, 255, 0.88)',
                      fontSize: 15,
                      fontWeight: 500,
                      textAlign: 'center',
                      maxWidth: '90%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.prompt || t('playground_2026:audio', '声音')}
                  </div>
                  <audio
                    src={item.previewUrl}
                    controls
                    autoPlay
                    style={{ width: '100%', outline: 'none' }}
                  />
                </div>
              ) : (
                <img
                  className="hf-id-main-media"
                  src={item.previewUrl}
                  alt={item.prompt || 'Generated preview'}
                  onClick={(e) => e.stopPropagation()}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setNaturalDimension({ width: img.naturalWidth, height: img.naturalHeight });
                    }
                  }}
                />
              )
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  color: 'rgba(255,255,255,0.4)',
                  padding: 48,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {isAudio ? <AudioLines size={40} /> : <Layers size={40} />}
                <span>
                  {isAudio
                    ? t('playground_2026:audio_gen_no_preview', '暂无预览音频')
                    : t('playground_2026:image_gen_no_preview', '暂无预览图片')}
                </span>
              </div>
            )}

            {/* 右上角全屏放大图标 */}
            {item.previewUrl && !isVideo && !isAudio && (
              <Tooltip title={t('playground_2026:fullscreen_preview', '全屏预览')}>
                <button
                  type="button"
                  className="hf-id-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreen(true);
                  }}
                  aria-label="Expand"
                >
                  <Maximize2 size={16} />
                </button>
              </Tooltip>
            )}
          </div>

          {/* 右翻页箭头 */}
          {hasNext && onNext && (
            <button
              type="button"
              className="hf-id-nav-btn next"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              aria-label="Next"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        {/* 右侧控制面板 */}
        <aside className="hf-id-sidebar-panel" onClick={(e) => e.stopPropagation()}>
          {/* 顶部操作条 */}
          <header className="hf-id-sidebar-top-bar">
            <button
              type="button"
              className="hf-id-download-btn"
              onClick={() => void handleDownload()}
              disabled={!item.previewUrl}
            >
              <Download size={14} />
              <span>{t('playground_2026:download', '下载')}</span>
            </button>

            <div className="hf-id-top-actions">
              <Tooltip title={t('playground_2026:share', '分享')}>
                <button
                  type="button"
                  className="hf-id-icon-btn"
                  onClick={() => void handleShare()}
                  aria-label={t('playground_2026:share', '分享')}
                >
                  <Send size={15} />
                </button>
              </Tooltip>

              <Tooltip title={t('common.close', '关闭')}>
                <button
                  type="button"
                  className="hf-id-icon-btn"
                  onClick={() => {
                    if (isMobile) setInfoOpen(false);
                    else onClose();
                  }}
                  aria-label={t('common.close', '关闭')}
                >
                  <X size={17} />
                </button>
              </Tooltip>
            </div>
          </header>

          {/* 作者与时间信息 */}
          <div className="hf-id-user-row">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={authorName}
                className="hf-id-user-avatar"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                className="hf-id-user-avatar"
                style={{
                  backgroundColor: avatarAccent.background,
                  color: avatarAccent.color,
                }}
              >
                {authorInitial}
              </div>
            )}
            <div className="hf-id-user-info">
              <div className="hf-id-user-by">
                <span className="hf-id-user-prefix">{t('playground_2026:by', '作者 ')} </span>
                <span className="hf-id-user-name">{authorName}</span>
              </div>
              <div className="hf-id-user-time">
                {formatRelativeTime(item.createdAt, i18n.language)}
              </div>
            </div>
          </div>

          {/* 可滚动的主内容面板 */}
          <div className="hf-id-scroll-body">
            {/* 模型 ID 栏与快捷复制 */}
            {displayModelId && (
              <div className="hf-id-model-row">
                <div
                  className="hf-id-model-badge"
                  title={matchedModel?.name && matchedModel.name !== displayModelId ? matchedModel.name : undefined}
                  onClick={(e) => void handleCopyModelId(e)}
                >
                  <ModelLogoIcon
                    logo={matchedModel?.logo || (item as any)?.modelLogo || (item as any)?.logo}
                    fallbackLetter={displayModelId || 'M'}
                    className="hf-id-model-logo-img"
                    size={16}
                  />
                  <span className="hf-id-model-name-text">{displayModelId}</span>
                </div>

                <Tooltip
                  title={
                    copiedModelId
                      ? t('playground_2026:image_detail_copied', '已复制')
                      : t('playground_2026:copy_model_id', '复制模型 ID')
                  }
                  open={copiedModelId ? true : undefined}
                  placement="top"
                >
                  <button
                    type="button"
                    className={`hf-id-copy-model-btn${copiedModelId ? ' copied' : ''}`}
                    onClick={(e) => void handleCopyModelId(e)}
                    aria-label={t('playground_2026:copy_model_id', '复制模型 ID')}
                  >
                    {copiedModelId ? (
                      <Check size={13} className="hf-id-copy-check-icon" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </Tooltip>
              </div>
            )}

            {/* 提示词 */}
            <div className="hf-id-prompt-box">
              <div className="hf-id-prompt-header">
                <div
                  className="hf-id-prompt-text"
                  title={t('playground_2026:click_to_copy', '点击复制提示词')}
                  onClick={() => void handleCopyPrompt()}
                >
                  {item.prompt || t('playground_2026:works_untitled', '未命名作品')}
                </div>
                {item.prompt && (
                  <Tooltip
                    title={
                      copiedPrompt
                        ? t('playground_2026:image_detail_copied', '已复制')
                        : t('common.copy_prompt', '复制提示词')
                    }
                    open={copiedPrompt ? true : undefined}
                    placement="top"
                  >
                    <button
                      type="button"
                      className={`hf-id-copy-prompt-btn${copiedPrompt ? ' copied' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyPrompt();
                      }}
                      aria-label={t('common.copy_prompt', '复制提示词')}
                    >
                      {copiedPrompt ? <Check size={13} className="hf-id-copy-check-icon" /> : <Copy size={13} />}
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>

                {/* 归属分类 Located */}
                <div className="hf-id-located-section">
                  <span className="hf-id-section-label">
                    {t('playground_2026:located_folder_title', '归属位置')}
                  </span>
                  <div className="hf-id-folder-card">
                    <div className="hf-id-folder-left">
                      <Folder size={15} className="hf-id-folder-icon" />
                      <span className="hf-id-folder-name">{locatedAlbumName}</span>
                    </div>
                    <button
                      type="button"
                      className="hf-id-folder-action-btn"
                      title={t('playground_2026:change_folder', '查看分类')}
                      onClick={() => {
                        message.info(t('playground_2026:folder_info', `当前归属：${locatedAlbumName}`));
                      }}
                    >
                      <FolderPlus size={15} />
                    </button>
                  </div>
                </div>

                {/* 属性信息面板 Properties Card */}
                <div className="hf-id-action-card">
                  <div className="hf-id-card-title">
                    {t('playground_2026:properties', '属性信息')}
                  </div>

                  {item.aspectRatio && (
                    <div className="hf-id-card-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:prop_aspect_ratio', '比例')}</span>
                      <span style={{ color: 'var(--ig-text)', fontSize: 13, userSelect: 'text' }}>{item.aspectRatio}</span>
                    </div>
                  )}

                  {displayFileSize && displayFileSize !== '未知' && (
                    <div className="hf-id-card-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:prop_file_size', '文件大小')}</span>
                      <span style={{ color: 'var(--ig-text)', fontSize: 13, userSelect: 'text' }}>{displayFileSize}</span>
                    </div>
                  )}

                  {displayResolution && !isAudio && (
                    <div className="hf-id-card-row">
                      <span className="hf-id-card-row-label">
                        {isVideo
                          ? t('playground_2026:prop_video_resolution', '视频分辨率')
                          : t('playground_2026:prop_image_resolution', '图片分辨率')}
                      </span>
                      <span style={{ color: 'var(--ig-text)', fontSize: 13, userSelect: 'text' }}>
                        {displayResolution}
                      </span>
                    </div>
                  )}

                  {item.paramValues && Object.entries(item.paramValues)
                    .filter(([k]) => {
                      if (['_fields', 'reference_urls', '_io_values'].includes(k) || k.startsWith('_')) return false;
                      const lower = k.toLowerCase();
                      if (['resolution', 'output_resolution', 'video_resolution', 'size', 'aspect_ratio', 'ratio', 'aspectratio'].includes(lower)) return false;
                      const fieldDef = item.paramValues?._fields?.find((f: any) => f.key === k);
                      const label = (fieldDef?.label || k).toLowerCase();
                      if (['输出分辨率', '视频分辨率', '图片分辨率', '分辨率', '视频尺寸', '图片尺寸', '画面比例', '比例'].includes(label)) return false;
                      return true;
                    })
                    .map(([k, v]) => {
                      if (v === null || v === undefined || v === '' || typeof v === 'object') return null;
                      const fieldDef = item.paramValues?._fields?.find((f: any) => f.key === k);
                      const label = fieldDef?.label || k;
                      return (
                        <div className="hf-id-card-row" key={k}>
                          <span className="hf-id-card-row-label">{label}</span>
                          <span style={{ color: 'var(--ig-text)', fontSize: 13, maxWidth: '65%', textAlign: 'right', wordBreak: 'break-word', userSelect: 'text' }}>
                            {String(v)}
                          </span>
                        </div>
                      );
                    })}
                </div>

                {/* 任务与执行日志追踪 Task & Log Trace Card */}
                <div className="hf-id-action-card hf-id-trace-card">
                  <div className="hf-id-card-title">
                    {t('playground_2026:task_trace_info', '任务与执行日志')}
                  </div>

                  {/* 站点任务 ID */}
                  {item.taskId && (
                    <div className="hf-id-card-row hf-id-copyable-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:trace_task_id', '站点任务 ID')}</span>
                      <div className="hf-id-row-value-with-copy">
                        <span className="hf-id-monospace-value" title={item.taskId}>{item.taskId}</span>
                        <Tooltip
                          title={copiedTaskId ? t('playground_2026:image_detail_copied', '已复制') : t('common.copy', '复制任务 ID')}
                          open={copiedTaskId ? true : undefined}
                          placement="top"
                        >
                          <button
                            type="button"
                            className={`hf-id-inline-copy-btn${copiedTaskId ? ' copied' : ''}`}
                            onClick={(e) => void handleCopyText(e, item.taskId!, setCopiedTaskId, copyTaskTimerRef)}
                            aria-label={t('common.copy', '复制')}
                          >
                            {copiedTaskId ? <Check size={11} className="hf-id-copy-check-icon" /> : <Copy size={11} />}
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )}

                  {/* 日志 ID */}
                  {item.sysLogId && (
                    <div className="hf-id-card-row hf-id-copyable-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:trace_log_id', '日志 ID')}</span>
                      <div className="hf-id-row-value-with-copy">
                        <span className="hf-id-monospace-value" title={item.sysLogId}>{item.sysLogId}</span>
                        <Tooltip
                          title={copiedLogId ? t('playground_2026:image_detail_copied', '已复制') : t('common.copy', '复制日志 ID')}
                          open={copiedLogId ? true : undefined}
                          placement="top"
                        >
                          <button
                            type="button"
                            className={`hf-id-inline-copy-btn${copiedLogId ? ' copied' : ''}`}
                            onClick={(e) => void handleCopyText(e, item.sysLogId!, setCopiedLogId, copyLogTimerRef)}
                            aria-label={t('common.copy', '复制')}
                          >
                            {copiedLogId ? <Check size={11} className="hf-id-copy-check-icon" /> : <Copy size={11} />}
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )}

                  {/* 提交 / 创建时间 */}
                  {(item.createdAtStr || item.createdAt) && (
                    <div className="hf-id-card-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:trace_created_at', '提交创建时间')}</span>
                      <span className="hf-id-monospace-value">
                        {formatExactTime(item.createdAtStr || item.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* 完成时间 */}
                  {(item.updatedAtStr || item.updatedAt) && (
                    <div className="hf-id-card-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:trace_completed_at', '生成完成时间')}</span>
                      <span className="hf-id-monospace-value">
                        {formatExactTime(item.updatedAtStr || item.updatedAt)}
                      </span>
                    </div>
                  )}

                  {/* 生成耗时 */}
                  {durationText && (
                    <div className="hf-id-card-row">
                      <span className="hf-id-card-row-label">{t('playground_2026:trace_duration', '生成耗时')}</span>
                      <span style={{ color: 'var(--ig-text)', fontSize: 12.5, userSelect: 'text' }}>
                        {durationText}
                      </span>
                    </div>
                  )}
                </div>
          </div>
        </aside>

        <button
          type="button"
          className="hf-id-info-backdrop"
          aria-label={t('common.close', '关闭')}
          onClick={() => setInfoOpen(false)}
        />

        <div className="hf-id-mobile-chrome" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="hf-id-nav-btn"
            disabled={!hasPrev || !onPrev}
            onClick={(e) => {
              e.stopPropagation();
              if (hasPrev) onPrev?.();
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="hf-id-info-btn"
            onClick={(e) => {
              e.stopPropagation();
              setInfoOpen(true);
            }}
            aria-label={t('playground_2026:asset_info', '属性信息')}
          >
            <Info size={20} />
          </button>
          <button
            type="button"
            className="hf-id-nav-btn"
            disabled={!hasNext || !onNext}
            onClick={(e) => {
              e.stopPropagation();
              if (hasNext) onNext?.();
            }}
            aria-label="Next"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      {/* 全屏大图灯箱模态 */}
      {fullscreen && item.previewUrl && (
        <div
          className="hf-id-fullscreen-modal"
          onClick={(e) => {
            e.stopPropagation();
            setFullscreen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <Tooltip title={t('playground_2026:exit_fullscreen', '退出全屏')}>
            <button
              type="button"
              className="hf-id-fullscreen-close"
              onClick={(e) => {
                e.stopPropagation();
                setFullscreen(false);
              }}
              aria-label={t('playground_2026:exit_fullscreen', '退出全屏')}
            >
              <Minimize2 size={18} />
            </button>
          </Tooltip>
          <img
            className="hf-id-fullscreen-img"
            src={item.previewUrl}
            alt={item.prompt || ''}
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(false);
            }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
};

export default React.memo(ImageDetailOverlay);

