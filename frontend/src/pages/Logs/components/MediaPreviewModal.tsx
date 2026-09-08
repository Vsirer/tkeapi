/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Spin, message, Tooltip, Grid } from 'antd';
import {
  Image as ImageIcon,
  Video,
  Copy,
  Check,
  Download,
  ExternalLink,
  Info,
  Clock,
  Cpu,
  Sparkles,
  Maximize2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Ratio,
  Film,
  HardDrive,
  X,
  Coins
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../../store/theme';
import useSettingsStore from '../../../store/settings';
import { formatApiDateTime } from '../../../utils/timedisplay';
import { copyToClipboard } from '../../../utils/clipboard';

const { useBreakpoint } = Grid;

interface TaskLogItem {
  id: number;
  log_id?: string;
  user_id: string;
  user_uid?: string;
  channel_id: number | null;
  model: string;
  endpoint?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  cost?: number;
  latency_ms?: number;
  status_code?: number;
  error_message?: string | null;
  request_content?: string | null;
  response_content?: string | null;
  post_response?: string | null;
  billing_detail?: string | null;
  channel_name?: string | null;
  channel_group_aid?: string | null;
  user_nickname?: string | null;
  task_id?: string | null;
  action_type?: string | null;
  preview_urls?: string[];
  created_at: string;
}

interface MediaPreviewModalProps {
  open: boolean;
  onClose: () => void;
  record: TaskLogItem | null;
  urls: string[];
  type: '图片' | '视频';
}

interface MediaAttributes {
  width?: number;
  height?: number;
  aspectRatio?: string;
  duration?: number;
  format?: string;
  fileSize?: string;
}

// 智能计算宽高比标签
function calculateAspectRatio(w: number, h: number): string {
  if (!w || !h) return '-';
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.03) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.03) return '9:16';
  if (Math.abs(ratio - 4 / 3) < 0.03) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.03) return '3:4';
  if (Math.abs(ratio - 1) < 0.03) return '1:1';
  if (Math.abs(ratio - 21 / 9) < 0.03) return '21:9';
  if (Math.abs(ratio - 3 / 2) < 0.03) return '3:2';
  if (Math.abs(ratio - 2 / 3) < 0.03) return '2:3';
  if (Math.abs(ratio - 4 / 5) < 0.03) return '4:5';

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(w), Math.round(h));
  const rw = Math.round(w / d);
  const rh = Math.round(h / d);
  if (rw <= 25 && rh <= 25) {
    return `${rw}:${rh}`;
  }
  return `${ratio.toFixed(2)}:1`;
}

// 从 URL 探测媒体文件格式扩展名
function detectFormat(url: string, fallbackType: '图片' | '视频'): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
      return ext === 'jpeg' ? 'JPG' : ext.toUpperCase();
    }
  } catch {}
  return fallbackType === '图片' ? 'IMAGE' : 'VIDEO';
}

// 格式化时长
function formatDuration(sec?: number): string {
  if (sec === undefined || sec === null || isNaN(sec) || sec <= 0) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${sec.toFixed(1)}s`;
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 解析 request_content 中的提示词与关键生成参数
function parseTaskParams(rawJson?: string | null) {
  if (!rawJson) return { prompt: '', negativePrompt: '', extraParams: [] as { label: string; value: string }[] };

  try {
    const obj = JSON.parse(rawJson);
    let prompt = '';
    let negativePrompt = '';
    const extraParams: { label: string; value: string }[] = [];

    // 1. 尝试提取 Prompt
    if (typeof obj.prompt === 'string') {
      prompt = obj.prompt;
    } else if (Array.isArray(obj.prompt)) {
      prompt = obj.prompt.map((p: any) => (typeof p === 'string' ? p : p.text || '')).join(', ');
    } else if (obj.input?.prompt && typeof obj.input.prompt === 'string') {
      prompt = obj.input.prompt;
    } else if (obj.params?.prompt && typeof obj.params.prompt === 'string') {
      prompt = obj.params.prompt;
    } else if (Array.isArray(obj.messages)) {
      const lastUser = [...obj.messages].reverse().find((m: any) => m.role === 'user');
      if (lastUser) {
        if (typeof lastUser.content === 'string') {
          prompt = lastUser.content;
        } else if (Array.isArray(lastUser.content)) {
          const textItem = lastUser.content.find((c: any) => c.type === 'text' || typeof c === 'string');
          prompt = typeof textItem === 'string' ? textItem : textItem?.text || '';
        }
      }
    } else if (Array.isArray(obj.text_prompts)) {
      prompt = obj.text_prompts.map((p: any) => p.text || '').filter(Boolean).join(', ');
    }

    // 2. 尝试提取 Negative Prompt
    if (typeof obj.negative_prompt === 'string') {
      negativePrompt = obj.negative_prompt;
    } else if (obj.input?.negative_prompt && typeof obj.input.negative_prompt === 'string') {
      negativePrompt = obj.input.negative_prompt;
    } else if (obj.params?.negative_prompt && typeof obj.params.negative_prompt === 'string') {
      negativePrompt = obj.params.negative_prompt;
    }

    // 3. 提取常见生成参数
    const extractFields = [
      { keys: ['size', 'image_size', 'resolution'], label: '分辨率' },
      { keys: ['aspect_ratio', 'ratio'], label: '比例' },
      { keys: ['seed'], label: 'Seed' },
      { keys: ['steps', 'num_inference_steps', 'step'], label: 'Steps' },
      { keys: ['cfg_scale', 'guidance_scale', 'cfg'], label: 'CFG' },
      { keys: ['quality'], label: '画质' },
      { keys: ['style'], label: '风格' },
      { keys: ['sampler_name', 'sampler'], label: '采样器' },
      { keys: ['duration', 'video_length'], label: '生成时长' },
      { keys: ['fps'], label: 'FPS' },
      { keys: ['mode'], label: '模式' },
      { keys: ['model_version', 'version'], label: '版本' },
    ];

    const searchSource = { ...obj, ...(obj.input || {}), ...(obj.params || {}), ...(obj.parameters || {}) };

    extractFields.forEach(({ keys, label }) => {
      for (const k of keys) {
        if (searchSource[k] !== undefined && searchSource[k] !== null && searchSource[k] !== '') {
          extraParams.push({
            label,
            value: String(searchSource[k]),
          });
          break;
        }
      }
    });

    return { prompt, negativePrompt, extraParams };
  } catch {
    return { prompt: '', negativePrompt: '', extraParams: [] as { label: string; value: string }[] };
  }
}

const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  open,
  onClose,
  record,
  urls,
  type,
}) => {
  const { t } = useTranslation();
  const { themeMode } = useThemeStore();
  const { settings, fetchSettings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const isLight = themeMode === 'light';
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [mediaAttrs, setMediaAttrs] = useState<MediaAttributes>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && !settings) {
      void fetchSettings();
    }
  }, [open, settings, fetchSettings]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentUrl = urls[currentIndex] || '';

  // 切换产物或重置索引
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
    }
  }, [open, urls]);

  // 视频每次打开或切换时默认静音且不自动播放，同时支持用户在控制条上随时开启声音
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.pause();
    }
  }, [open, currentUrl]);

  // 当当前 URL 改变时重置媒体属性与加载状态
  useEffect(() => {
    if (!currentUrl) return;
    setMediaLoading(true);
    setMediaError(false);
    const format = detectFormat(currentUrl, type);
    setMediaAttrs({ format });

    // 尝试异步请求 HEAD 获取 Content-Length (文件大小)
    let isMounted = true;
    fetch(currentUrl, { method: 'HEAD' })
      .then((res) => {
        if (!isMounted) return;
        const cl = res.headers.get('content-length');
        if (cl) {
          const bytes = parseInt(cl, 10);
          if (!isNaN(bytes) && bytes > 0) {
            setMediaAttrs((prev) => ({ ...prev, fileSize: formatFileSize(bytes) }));
          }
        }
      })
      .catch(() => {
        // 跨域或安全限制时静默忽略
      });

    return () => {
      isMounted = false;
    };
  }, [currentUrl, type]);

  // 图片加载完成回调
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    setMediaLoading(false);
    setMediaAttrs((prev) => ({
      ...prev,
      width: w,
      height: h,
      aspectRatio: calculateAspectRatio(w, h),
    }));
  };

  // 视频加载元数据回调
  const handleVideoLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const dur = video.duration;
    setMediaLoading(false);
    setMediaAttrs((prev) => ({
      ...prev,
      width: w,
      height: h,
      aspectRatio: calculateAspectRatio(w, h),
      duration: dur,
    }));
  };

  // 复制文本辅助函数
  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      message.success(t('logs.copy_success', '已复制'));
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      message.error(t('logs.copy_failed', '复制失败'));
    }
  };

  // 下载文件辅助函数
  const handleDownload = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const filename = url.split('/').pop()?.split('?')[0] || (type === '图片' ? 'image_result.png' : 'video_result.mp4');
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      message.success(t('task_logs.download_started', '已开始下载'));
    } catch {
      window.open(url, '_blank');
    }
  };

  const parsedParams = useMemo(() => {
    return parseTaskParams(record?.request_content);
  }, [record?.request_content]);

  // shadcn UI 纯正黑白灰 Zinc 配色系统
  const colors = useMemo(() => {
    return {
      modalBg: isLight ? '#ffffff' : '#09090b',
      viewportBg: isLight ? '#0c0c0e' : '#050506', // 沉浸式视口，无冗余灰色大外框
      border: isLight ? '#e4e4e7' : '#27272a',
      borderSubtle: isLight ? '#f4f4f5' : '#18181b',
      cardBg: isLight ? '#f8fafc' : '#111113',
      subtleBg: isLight ? '#f4f4f5' : '#18181b',
      textPrimary: isLight ? '#09090b' : '#fafafa',
      textSecondary: isLight ? '#71717a' : '#a1a1aa',
      textMuted: isLight ? '#a1a1aa' : '#71717a',
      hoverBg: isLight ? '#f4f4f5' : '#27272a',
      badgeBg: isLight ? '#f4f4f5' : '#27272a',
      badgeText: isLight ? '#18181b' : '#f4f4f5',
    };
  }, [isLight]);

  if (!open) return null;

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      className="task-preview-modal"
      rootClassName="task-preview-modal-root"
      width={isMobile ? '95vw' : 1000}
      style={{
        maxWidth: isMobile ? '100vw' : 1000,
        padding: 0,
        margin: isMobile ? '0 auto' : undefined,
        top: isMobile ? 12 : undefined,
      }}
      destroyOnClose
      centered={!isMobile}
      styles={{
        mask: { backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)' },
        wrapper: { padding: 0 },
        body: {
          backgroundColor: 'transparent',
          background: 'transparent',
          padding: 0,
          margin: 0,
        },
      }}
    >
      <style>{`
        .task-preview-modal.ant-modal,
        .task-preview-modal-root .ant-modal {
          padding: 0 !important;
          max-width: 100vw !important;
        }
        .task-preview-modal .ant-modal-content,
        .task-preview-modal-root .ant-modal-content,
        .task-preview-modal .ant-modal-container,
        .task-preview-modal-root .ant-modal-container,
        div.task-preview-modal div.ant-modal-content {
          background: transparent !important;
          background-color: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
        }
        .task-preview-modal .ant-modal-body,
        .task-preview-modal-root .ant-modal-body,
        div.task-preview-modal div.ant-modal-body {
          padding: 0 !important;
          margin: 0 !important;
          background: transparent !important;
          background-color: transparent !important;
        }
        .task-preview-modal .ant-modal-close,
        .task-preview-modal-root .ant-modal-close,
        .task-preview-modal .ant-modal-header,
        .task-preview-modal-root .ant-modal-header {
          display: none !important;
        }
        .task-preview-modal-body {
          display: grid;
          grid-template-columns: minmax(360px, 1fr) 360px;
          height: calc(85vh - 58px);
          max-height: 720px;
          min-height: 500px;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .task-preview-modal-body {
            display: flex !important;
            flex-direction: column !important;
            height: auto !important;
            max-height: calc(88vh - 52px) !important;
            min-height: auto !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
          }
          .task-preview-media-pane {
            min-height: 220px !important;
            max-height: 320px !important;
            padding: 8px !important;
            border-right: none !important;
            border-bottom: 1px solid ${colors.border} !important;
            flex-shrink: 0;
          }
          .task-preview-info-pane {
            padding: 16px !important;
            gap: 16px !important;
          }
        }
      `}</style>

      {/* 真正且唯一的弹窗外壳：纯黑白灰 shadcn 风格 */}
      <div
        style={{
          width: '100%',
          backgroundColor: colors.modalBg,
          borderRadius: isMobile ? 12 : 16,
          border: `1px solid ${colors.border}`,
          overflow: 'hidden',
          boxShadow: isLight
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 顶部 Header：标题、模型 Tag 与快捷操作 (shadcn 纯黑白灰风格) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '10px 14px' : '12px 20px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.modalBg,
          }}
        >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              background: colors.subtleBg,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              flexShrink: 0,
            }}
          >
            {type === '图片' ? <ImageIcon size={15} /> : <Video size={15} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              {type === '图片' ? t('task_logs.image_preview', '图片产物预览') : t('task_logs.video_preview', '视频产物预览')}
            </span>
            {record?.model && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  borderRadius: 6,
                  padding: '2px 7px',
                  background: colors.badgeBg,
                  color: colors.badgeText,
                  border: `1px solid ${colors.border}`,
                  fontWeight: 500,
                  maxWidth: isMobile ? 110 : 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {record.model}
              </span>
            )}
          </div>
        </div>

        {/* 顶部操作按钮 (shadcn outline/ghost button) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Tooltip title={t('task_logs.copy_url', '复制媒体链接')}>
            <button
              onClick={() => handleCopy(currentUrl, 'url')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: isMobile ? '0 8px' : '0 10px',
                height: 28,
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: 'transparent',
                color: colors.textPrimary,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {copiedKey === 'url' ? <Check size={13} style={{ color: colors.textPrimary }} /> : <Copy size={13} />}
              {!isMobile && <span>{copiedKey === 'url' ? t('common.copied', '已复制') : t('task_logs.copy_link', '复制链接')}</span>}
            </button>
          </Tooltip>

          <Tooltip title={t('task_logs.download', '下载媒体')}>
            <button
              onClick={() => handleDownload(currentUrl)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: isMobile ? '0 8px' : '0 10px',
                height: 28,
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: 'transparent',
                color: colors.textPrimary,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Download size={13} />
              {!isMobile && <span>{t('task_logs.download_btn', '下载')}</span>}
            </button>
          </Tooltip>

          <button
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: 'transparent',
              color: colors.textSecondary,
              cursor: 'pointer',
              marginLeft: 2,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.hoverBg;
              e.currentTarget.style.color = colors.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = colors.textSecondary;
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 主内容区域：左侧纯净沉浸式媒体区（无冗余灰色外框），右侧 shadcn 属性面板 */}
      <div className="task-preview-modal-body">
        {/* 左侧媒体展示区 (沉浸式黑色底，去除厚重灰色大外框与生硬阴影) */}
        <div
          className="task-preview-media-pane"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: colors.viewportBg,
            position: 'relative',
            overflow: 'hidden',
            borderRight: `1px solid ${colors.border}`,
            padding: 16,
          }}
        >
          {mediaLoading && !mediaError && (
            <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Spin size="default" />
              <span style={{ fontSize: 12, color: '#a1a1aa', letterSpacing: '0.02em' }}>
                {t('task_logs.loading_media', '正在加载媒体...')}
              </span>
            </div>
          )}

          {mediaError ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 24,
                maxWidth: 360,
                gap: 12,
              }}
            >
              <AlertCircle size={32} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>
                {type}加载失败或链接已失效
              </span>
              <span style={{ fontSize: 11, color: '#71717a', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {currentUrl}
              </span>
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 12,
                  color: '#e4e4e7',
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                }}
              >
                <ExternalLink size={12} /> 在新窗口中尝试打开
              </a>
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              {type === '图片' ? (
                <img
                  src={currentUrl}
                  alt="preview"
                  onLoad={handleImageLoad}
                  onError={() => {
                    setMediaLoading(false);
                    setMediaError(true);
                  }}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: 6,
                    opacity: mediaLoading ? 0 : 1,
                    transition: 'opacity 0.2s ease-in-out',
                    userSelect: 'none',
                  }}
                />
              ) : (
                <video
                  ref={videoRef}
                  src={currentUrl}
                  controls
                  preload="metadata"
                  muted
                  playsInline
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onError={() => {
                    setMediaLoading(false);
                    setMediaError(true);
                  }}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    borderRadius: 6,
                    opacity: mediaLoading ? 0 : 1,
                    transition: 'opacity 0.2s ease-in-out',
                    background: '#000',
                  }}
                />
              )}
            </div>
          )}

          {/* 多媒体产物缩略图切换栏 (shadcn 悬浮胶囊设计) */}
          {urls.length > 1 && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: 'rgba(24, 24, 27, 0.85)',
                backdropFilter: 'blur(12px)',
                borderRadius: 9999,
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
                zIndex: 20,
              }}
            >
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex === 0 ? 0.3 : 1,
                  color: '#fafafa',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                }}
              >
                <ChevronLeft size={15} />
              </button>

              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: isMobile ? 200 : 280, padding: '2px 0' }}>
                {urls.map((u, idx) => {
                  const isCur = idx === currentIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isCur ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.2)',
                        opacity: isCur ? 1 : 0.5,
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                        background: '#18181b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {type === '图片' ? (
                        <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#ffffff' }}>#{idx + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                disabled={currentIndex === urls.length - 1}
                onClick={() => setCurrentIndex((prev) => Math.min(urls.length - 1, prev + 1))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: currentIndex === urls.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex === urls.length - 1 ? 0.3 : 1,
                  color: '#fafafa',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                }}
              >
                <ChevronRight size={15} />
              </button>

              <span style={{ fontSize: 11, color: '#a1a1aa', marginLeft: 4, fontFamily: 'monospace' }}>
                {currentIndex + 1}/{urls.length}
              </span>
            </div>
          )}
        </div>

        {/* 右侧属性与生成信息面板 (shadcn 纯黑白灰、极简层级排版，无厚重杂乱外框) */}
        <div
          className="task-preview-info-pane"
          style={{
            padding: '18px 20px',
            overflowY: 'auto',
            background: colors.modalBg,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* 1. 媒体基本属性 (Media Metadata) */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Info size={13} />
              <span>{t('task_logs.media_properties', '媒体基本属性')}</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
              }}
            >
              {/* 分辨率 */}
              <div
                style={{
                  background: colors.cardBg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Maximize2 size={12} />
                  <span>{t('task_logs.prop_dimensions', '分辨率')}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 3, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {mediaAttrs.width && mediaAttrs.height ? `${mediaAttrs.width} × ${mediaAttrs.height}` : '-'}
                </div>
              </div>

              {/* 宽高比 */}
              <div
                style={{
                  background: colors.cardBg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Ratio size={12} />
                  <span>{t('task_logs.prop_aspect_ratio', '宽高比')}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 3, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {mediaAttrs.aspectRatio || '-'}
                </div>
              </div>

              {/* 文件格式 */}
              <div
                style={{
                  background: colors.cardBg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Film size={12} />
                  <span>{t('task_logs.prop_format', '文件格式')}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 3, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {mediaAttrs.format || '-'}
                </div>
              </div>

              {/* 时长或大小 */}
              {type === '视频' ? (
                <div
                  style={{
                    background: colors.cardBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} />
                    <span>{t('task_logs.prop_duration', '视频时长')}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 3, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {formatDuration(mediaAttrs.duration)}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: colors.cardBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <HardDrive size={12} />
                    <span>{t('task_logs.prop_file_size', '文件大小')}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 3, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {mediaAttrs.fileSize || '-'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. 任务与生成信息 (Task Details) */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Cpu size={13} />
              <span>{t('task_logs.task_info', '任务生成信息')}</span>
            </div>

            <div
              style={{
                background: colors.cardBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '6px 12px',
                display: 'flex',
                flexDirection: 'column',
                fontSize: 12,
              }}
            >
              {/* 任务 ID */}
              {record?.task_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>
                  <span style={{ color: colors.textSecondary }}>{t('task_logs.task_id', '任务 ID')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', color: colors.textPrimary, fontSize: 11 }}>
                      {record.task_id}
                    </span>
                    <button
                      onClick={() => handleCopy(record.task_id!, 'task_id')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 2,
                        cursor: 'pointer',
                        color: colors.textMuted,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                      title={t('logs.copy', '复制')}
                    >
                      {copiedKey === 'task_id' ? <Check size={12} style={{ color: colors.textPrimary }} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}

              {/* 日志 ID */}
              {record?.log_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>
                  <span style={{ color: colors.textSecondary }}>{t('logs.log_id', '日志 ID')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', color: colors.textPrimary, fontSize: 11 }}>
                      {record.log_id}
                    </span>
                    <button
                      onClick={() => handleCopy(record.log_id!, 'log_id')}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 2,
                        cursor: 'pointer',
                        color: colors.textMuted,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                      title={t('logs.copy', '复制')}
                    >
                      {copiedKey === 'log_id' ? <Check size={12} style={{ color: colors.textPrimary }} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}

              {/* 生成耗时 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>
                <span style={{ color: colors.textSecondary }}>{t('task_logs.time_spent', '生成耗时')}</span>
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', color: colors.textPrimary, fontWeight: 500 }}>
                  {record?.latency_ms ? `${(record.latency_ms / 1000).toFixed(1)}s` : '-'}
                </span>
              </div>

              {/* 扣费消耗 */}
              {record?.cost !== undefined && record.cost > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>
                  <span style={{ color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Coins size={12} />
                    {t('task_logs.cost', '消耗费用')}
                  </span>
                  <span style={{ color: colors.textPrimary, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {currencySymbol}{record.cost.toFixed(6)}
                  </span>
                </div>
              )}

              {/* 提交时间 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span style={{ color: colors.textSecondary }}>{t('task_logs.submit_time', '提交时间')}</span>
                <span style={{ color: colors.textPrimary, fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {record?.created_at ? formatApiDateTime(record.created_at) : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. 提示词与生成参数 (Prompt & Parameters) */}
          {(parsedParams.prompt || parsedParams.extraParams.length > 0) && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={13} />
                  <span>{t('task_logs.prompt_params', '提示词与参数')}</span>
                </div>
                {parsedParams.prompt && (
                  <button
                    onClick={() => handleCopy(parsedParams.prompt, 'prompt')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      border: 'none',
                      background: 'transparent',
                      color: colors.textSecondary,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = colors.textSecondary)}
                  >
                    {copiedKey === 'prompt' ? <Check size={11} style={{ color: colors.textPrimary }} /> : <Copy size={11} />}
                    <span>{copiedKey === 'prompt' ? t('common.copied', '已复制') : t('task_logs.copy_prompt', '复制提示词')}</span>
                  </button>
                )}
              </div>

              {/* 正向提示词 */}
              {parsedParams.prompt && (
                <div
                  style={{
                    background: colors.cardBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: colors.textPrimary,
                    maxHeight: 130,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    marginBottom: 10,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  {parsedParams.prompt}
                </div>
              )}

              {/* 反向提示词 */}
              {parsedParams.negativePrompt && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
                    {t('task_logs.negative_prompt', '反向提示词 (Negative Prompt)')}
                  </div>
                  <div
                    style={{
                      background: colors.cardBg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: colors.textSecondary,
                      maxHeight: 80,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    }}
                  >
                    {parsedParams.negativePrompt}
                  </div>
                </div>
              )}

              {/* 关键参数徽章 (shadcn 纯黑白灰徽章流) */}
              {parsedParams.extraParams.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {parsedParams.extraParams.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: colors.subtleBg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: colors.textSecondary }}>{p.label}:</span>
                      <span style={{ fontWeight: 600, color: colors.textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                        {p.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </Modal>
);
};

export default MediaPreviewModal;

