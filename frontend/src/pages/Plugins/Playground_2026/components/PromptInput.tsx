/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 底部悬浮提示词输入框（重新设计）
 * 参考现代 AI Agent 输入框设计：
 * - 上层：干净的文本输入区域
 * - 下层：功能芯片栏（模型选择、API 密钥、附加功能按钮）+ 运行按钮
 */
import React, { useState, useRef, useCallback } from 'react';
import { Input, Tooltip, Dropdown, Modal, Switch, message } from '../ui';
import toast from './PlaygroundToast';
import type { MenuProps } from '../ui';
import {
  KeyOutlined, PlayCircleOutlined, AppstoreOutlined,
  LinkOutlined, PlusOutlined, AudioOutlined,
  CloseOutlined, ThunderboltOutlined,
  PaperClipOutlined, PictureOutlined, VideoCameraOutlined,
  CloudOutlined, UploadOutlined, GlobalOutlined, PlusCircleOutlined,
} from '../ui';
import { usePlayground } from '../context/PlaygroundContext';
import { useGeneration } from '../hooks/useGeneration';
import { getCategoryLabel } from '../constants';
import MentionPromptField, { type MentionPromptFieldRef } from './MentionPromptField';
import { buildTypedMentionAssets, type MentionMediaType } from '../utils/mentionPrompt';
import AssetPickerModal from './AssetPickerModal';
import ImageEditorModal from './ImageEditorModal';
import VideoEditorModal from './VideoEditorModal';
import './MentionPromptField.css';
import AudioPreviewModal from './AudioPreviewModal';
import type { PluginAsset } from '../../../../types';
import { useThemeStore } from '../../../../store/theme';
import useAuthStore from '../../../../store/auth';
import request from '../../../../utils/request';
import { fetchActivePlugins } from '../../../../utils/activePlugins';
import { useTranslation } from 'react-i18next';
import TokenSelectorPop from './TokenSelectorPop';
import { uploadResourceFileDetailed } from '../utils/referenceUpload';
import { toResourceDisplayName } from '../utils/resourceFileName';
import {
  attachAcceptAttr,
  attachAddTooltip,
  classifyAttachKind,
  clampAttachedAssets,
  pickWithinAttachLimits,
  remainingAttachRoom,
  resolvePromptAttachMaxAll,
  skippedAttachMessage,
} from '../utils/promptAttachLimits';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const { TextArea } = Input;

/** 检测是否为 Mac 系统 */
const isMac = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }
  return false;
};

const PromptInput: React.FC<{ embedded?: boolean }> = React.memo(({ embedded }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [assetPickerNs, setAssetPickerNs] = useState<string>('asset_manager');

  React.useEffect(() => {
    const loadActivePlugins = async () => {
      try {
        const response: any = await fetchActivePlugins();
        if (response && response.active_plugins) {
          setActivePlugins(response.active_plugins);
        }
      } catch (error) {
        console.error('Failed to fetch active plugins', error);
      }
    };
    loadActivePlugins();
  }, []);

  const isPluginVisibleForUser = useCallback((pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    
    // 如果插件后端配置了“不在提示词输入窗口显示”，则隐藏（针对素材资产管理相关插件）
    if (plugin.show_in_playground_prompt === false) return false;

    if (plugin.allowed_levels === 'all' || user?.role === 'admin') return true;
    const allowed = plugin.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  }, [activePlugins, user]);

  const showAssetLibrary = isPluginVisibleForUser('asset_manager');
  const showAssetLibraryIntl = isPluginVisibleForUser('asset_manager_intl');

  const {
    loading,
    prompt, setPrompt,
    currentModel, activeCategory,
    selectedTokenKey, setSelectedTokenKey, apiTokens, setApiTokens,
    generating,
    setIsModelDrawerVisible,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    attachedAssets, setAttachedAssets,
    paramValues, setParamValues,
    handleSelectModel,
  } = usePlayground();
  const { handleGenerate, handleChatGenerate } = useGeneration();

  const effectiveModel = currentModel;
  const hasNoModel = !effectiveModel;
  const attachMax = React.useMemo(
    () => resolvePromptAttachMaxAll(effectiveModel),
    [effectiveModel],
  );
  const totalAttachMax = attachMax.image + attachMax.video + attachMax.audio;
  const attachRoom = React.useMemo(
    () => remainingAttachRoom(attachedAssets, attachMax),
    [attachedAssets, attachMax],
  );
  const attachFull = hasNoModel || totalAttachMax === 0 || (attachRoom.image + attachRoom.video + attachRoom.audio <= 0);
  const attachAccept = attachAcceptAttr(attachMax);

  const handleSend = async () => {
    if (!effectiveModel || !prompt.trim() || generating) return;
    if (effectiveModel.scheme_type === 'chat') {
      const ok = await handleChatGenerate();
      if (ok) setPrompt('');
    } else {
      handleGenerate();
    }
  };

  React.useEffect(() => {
    const next = clampAttachedAssets(attachedAssets, attachMax);
    if (next.length !== attachedAssets.length) {
      setAttachedAssets(next);
      if (effectiveModel) {
        toast.warning('已按当前模型 IO 上限裁剪附件');
      }
    }
    // 仅随模型 IO 上限变化裁剪
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachMax.image, attachMax.video, attachMax.audio, effectiveModel?.mid]);

  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const [isFocused, setIsFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [isAudioPreviewOpen, setIsAudioPreviewOpen] = useState(false);
  const [editingAssetIndex, setEditingAssetIndex] = useState<number | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [draggedAssetIndex, setDraggedAssetIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chatMode, setChatMode] = useState<'auto' | 'basic'>('auto');
  const editorRef = useRef<MentionPromptFieldRef>(null);
  const embeddedEditorRef = useRef<MentionPromptFieldRef>(null);

  /** 语音输入 - 聚焦输入框并提示使用系统听写 */
  const handleVoiceInput = useCallback(() => {
    const activeEditor = embedded ? embeddedEditorRef.current : editorRef.current;
    if (activeEditor) {
      activeEditor.focus();
    }

    const isMacOS = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (isMacOS) {
      toast.info('请按两次 Fn 键或点击键盘上的 🎙️ 键启动系统听写', undefined, 4000);
    } else {
      toast.info('请按 Win + H 启动系统语音输入', undefined, 4000);
    }
  }, [embedded]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (hasNoModel) {
      toast.warning('请先在右侧面板选择一个模型');
      return;
    }
    if (totalAttachMax === 0) {
      toast.warning('当前模型不支持添加参考内容');
      return;
    }
    if (attachFull) {
      toast.error('参考媒体已达上限');
      return;
    }

    const { accepted: allowedFiles, skipped } = pickWithinAttachLimits(
      attachedAssets,
      files,
      attachMax,
      classifyAttachKind,
    );
    const limitMsg = skippedAttachMessage(skipped, attachMax);
    if (limitMsg) toast.error(limitMsg);
    if (allowedFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const accepted: { asset: any; fullUrl: string; file?: File }[] = [];
    let skippedUpload = 0;

    for (const file of allowedFiles) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} 大小超过 10MB，已跳过`);
        skippedUpload += 1;
        continue;
      }
      const isVideo = file.type.startsWith('video') || /\.(mp4|webm|mov)$/i.test(file.name);
      const isAudio = file.type.startsWith('audio') || /\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(file.name);
      const assetType = isVideo ? 'video' : isAudio ? 'audio' : 'image';

      try {
        const { url, resourceId, mediaType } = await uploadResourceFileDetailed(file);
        accepted.push({
          asset: {
            id: resourceId || `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file_name: toResourceDisplayName(file.name),
            asset_type: mediaType || assetType,
            size: file.size,
            file_url: url,
          } as any,
          fullUrl: url,
          file,
        });
      } catch (err: any) {
        toast.error(err?.message || `${file.name} 上传失败`);
        skippedUpload += 1;
      }
    }

    if (accepted.length > 0) {
      setAttachedAssets((prev) => [...prev, ...accepted]);
      toast.success(`已成功附加 ${accepted.length} 个文件`);
    } else if (skippedUpload > 0 && allowedFiles.length === skippedUpload) {
      /* 错误已逐条提示 */
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleFiles(files);
  };

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    if (draggedAssetIndex !== null) return;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      setIsDraggingFile(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (draggedAssetIndex !== null) return;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (draggedAssetIndex !== null) return;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingFile(false);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (draggedAssetIndex !== null) return;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
      if (hasNoModel) {
        toast.warning('请先在右侧面板选择一个模型');
        return;
      }
      if (totalAttachMax === 0) {
        toast.warning('当前模型不支持添加参考内容');
        return;
      }
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        handleFiles(files);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      if (hasNoModel) {
        toast.warning('请先在右侧面板选择一个模型');
        return;
      }
      if (totalAttachMax === 0) {
        toast.warning('当前模型不支持添加参考内容');
        return;
      }
      handleFiles(files);
    }
  };

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    if (hasNoModel) {
      toast.warning('请先在右侧面板选择一个模型');
      return;
    }
    if (totalAttachMax === 0) {
      toast.warning('当前模型不支持添加参考内容');
      return;
    }
    if (attachFull) {
      toast.error('参考媒体已达上限');
      return;
    }
    if (e.key === 'asset-library') {
      setAssetPickerNs('asset_manager');
      setIsAssetPickerOpen(true);
    } else if (e.key === 'asset-library-intl') {
      setAssetPickerNs('asset_manager_intl');
      setIsAssetPickerOpen(true);
    } else if (e.key === 'local-upload') {
      fileInputRef.current?.click();
    }
  };

  const removeAsset = (index: number) => {
    setAttachedAssets(prev => prev.filter((_, i) => i !== index));
  };

  const dropdownItems: MenuProps['items'] = React.useMemo(() => {
    const items: MenuProps['items'] = [];

    if (showAssetLibrary) {
      items.push({
        key: 'asset-library',
        label: t('assets.pick_from_assets', '从素材库选择'),
        icon: <CloudOutlined />,
      });
    }

    if (showAssetLibraryIntl) {
      items.push({
        key: 'asset-library-intl',
        label: '从资产库选择',
        icon: <CloudOutlined />,
      });
    }

    items.push({
      key: 'local-upload',
      label: '本地上传文件',
      icon: <UploadOutlined />,
    });

    return items;
  }, [showAssetLibrary, showAssetLibraryIntl, t]);

  const modSymbol = isMac() ? '⌘' : 'Ctrl';

  const mentionAssets = React.useMemo(() => {
    const items: Array<{ url: string; type: MentionMediaType }> = [];
    attachedAssets.forEach((assetItem) => {
      const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
      const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
      const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
      const type: MentionMediaType = isAudio ? 'audio' : isVideo ? 'video' : 'image';
      items.push({ url: assetItem.fullUrl, type });
    });
    return buildTypedMentionAssets(items);
  }, [attachedAssets]);

  const hasVideoOrAudio = attachedAssets.some(a => {
    const ext = a.asset.file_name?.split('.').pop()?.toLowerCase() || '';
    return a.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext) ||
      a.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
  });
  const hasImage = attachedAssets.some(a => {
    const ext = a.asset.file_name?.split('.').pop()?.toLowerCase() || '';
    return a.asset.asset_type === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  });
  const isVideoModel = effectiveModel?.scheme_type === 'video' || effectiveModel?.type_name?.includes('视频');

  // 使用 ref 追踪最新的 attachedAssets
  const attachedAssetsRef = useRef(attachedAssets);
  attachedAssetsRef.current = attachedAssets;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();

    // 聊天模式：Enter 直接发送，Shift+Enter 换行
    if (effectiveModel?.scheme_type === 'chat' && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (effectiveModel && prompt.trim() && !generating) {
        handleSend();
      }
      return;
    }

    // 图片/视频模式：⌘+Enter 或 Ctrl+Enter 快捷发送
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (effectiveModel && prompt.trim() && !generating) {
        handleSend();
      }
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: embedded ? 'relative' : 'absolute',
          bottom: embedded ? 'auto' : (isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 24),
          left: embedded ? 'auto' : '50%',
          transform: embedded ? 'none' : 'translateX(-50%)',
          width: embedded ? '100%' : (isMobile ? 'calc(100% - 24px)' : 'calc(100% - 48px)'),
          maxWidth: embedded ? 'none' : 720,
          background: _isLight ? 'rgba(255,255,255,0.9)' : '#1e1f20',
          backdropFilter: 'blur(20px)',
          borderRadius: 24,
          border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 6px rgba(0,0,0,0.3)',
          zIndex: 1000,
          padding: isMobile ? '16px 12px 10px 12px' : '24px 20px 12px 20px',
        }}
      >
        <div style={{ height: 20, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 10, width: '30%', marginBottom: 28, animation: 'promptPulse 1.5s infinite' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ height: 30, width: 100, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 8, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 30, width: 140, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 8, animation: 'promptPulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ height: 32, width: 32, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 10, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 32, width: 32, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 10, animation: 'promptPulse 1.5s infinite' }} />
            <div style={{ height: 32, width: 80, background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'promptPulse 1.5s infinite' }} />
          </div>
        </div>
        <style>{`
          @keyframes promptPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 0.2; }
          }
        `}</style>
      </div>
    );
  }

    return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={
        embedded
          ? {
              background: isDraggingFile
                ? (_isLight ? 'rgba(22, 119, 255, 0.04)' : 'rgba(22, 119, 255, 0.08)')
                : (_isLight ? '#ffffff' : '#09090b'),
              borderRadius: 24,
              border: isDraggingFile
                ? '1.5px dashed #1677ff'
                : `1px solid ${isFocused ? (_isLight ? '#1677ff' : '#27272a') : (_isLight ? '#e4e4e7' : '#18181b')}`,
              boxShadow: isDraggingFile
                ? '0 0 0 2px rgba(22, 119, 255, 0.2), 0 4px 12px rgba(0,0,0,0.1)'
                : (isFocused ? (_isLight ? '0 4px 12px rgba(0,0,0,0.02), 0 0 0 1px #1677ff' : '0 4px 12px rgba(0,0,0,0.2), 0 0 0 1px #27272a') : 'none'),
              display: 'flex',
              flexDirection: 'column',
              padding: '12px 14px 10px',
              gap: 8,
              transition: 'all 0.2s ease',
              width: '100%',
              position: 'relative',
            }
          : {
              position: 'absolute',
              bottom: (isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 24),
              left: '50%',
              transform: 'translateX(-50%)',
              width: (isMobile ? 'calc(100% - 24px)' : 'calc(100% - 48px)'),
              maxWidth: 720,
              background: isDraggingFile
                ? (_isLight ? 'rgba(240, 247, 255, 0.95)' : 'rgba(30, 31, 32, 0.95)')
                : (_isLight ? 'rgba(255,255,255,0.9)' : '#1e1f20'),
              backdropFilter: 'blur(20px)',
              borderRadius: 24,
              border: isDraggingFile
                ? '1.5px dashed #1677ff'
                : `1px solid ${isFocused ? (_isLight ? '#1677ff' : '#A8C7FA') : (_isLight ? 'rgba(0,0,0,0.1)' : '#444746')}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'visible',
              boxShadow: isDraggingFile
                ? '0 0 0 2px rgba(22, 119, 255, 0.2), 0 8px 24px rgba(0,0,0,0.15)'
                : (isFocused
                    ? (_isLight ? '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px #1677ff' : '0 4px 6px rgba(0,0,0,0.3), 0 0 0 1px #A8C7FA')
                    : (_isLight ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 6px rgba(0,0,0,0.3)')),
              zIndex: 1000,
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease',
            }
      }
    >
      {/* 拖拽文件进入提示遮罩 */}
      {isDraggingFile && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 24,
            background: _isLight ? 'rgba(240, 247, 255, 0.92)' : 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            zIndex: 50,
            pointerEvents: 'none',
            border: '2px dashed #1677ff',
          }}
        >
          <UploadOutlined style={{ fontSize: 26, color: '#1677ff' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: _isLight ? '#1677ff' : '#60a5fa' }}>
            松开鼠标直接添加素材资源
          </span>
        </div>
      )}
      {embedded ? (
        <>
          {/* 已附加的素材预览列表 */}
          {attachedAssets.length > 0 && (() => {
            const grouped: { type: string; label: string; items: { item: any; origIndex: number }[] }[] = [];
            const typeMap: Record<string, any> = {};

            attachedAssets.forEach((assetItem, index) => {
              const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
              const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
              const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
              const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
              const typeLabel = isAudio ? '声音' : isVideo ? '视频' : '图';
              if (!typeMap[typeKey]) {
                typeMap[typeKey] = { type: typeKey, label: typeLabel, items: [] };
                grouped.push(typeMap[typeKey]);
              }
              typeMap[typeKey].items.push({ item: assetItem, origIndex: index });
            });

            return (
              <div style={{ padding: '0 0 4px 0', display: 'flex', flexDirection: 'column', gap: 6, width: '100%', boxSizing: 'border-box' }}>
                {grouped.map(group => (
                  <div
                    key={group.type}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                    }}
                  >
                    {group.items.map((entry: any, idx: number) => (
                      <div
                        key={entry.item.asset.id}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          cursor: 'pointer', minWidth: 0,
                        }}
                      >
                        <div style={{
                          position: 'relative',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                          border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255, 255, 255, 0.1)',
                          background: _isLight ? '#f4f4f5' : 'rgba(0,0,0,0.2)',
                        }}>
                          {(() => {
                            if (group.type === 'audio') {
                              return (
                                <div
                                  onClick={() => { setEditingAssetIndex(entry.origIndex); setIsAudioPreviewOpen(true); }}
                                  style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                                >
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AudioOutlined style={{ fontSize: 18, color: '#1677ff' }} />
                                  </div>
                                </div>
                              );
                            }
                            if (group.type === 'video') {
                              return (
                                <div
                                  onClick={() => { setEditingAssetIndex(entry.origIndex); setIsVideoPreviewOpen(true); }}
                                  style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                                >
                                  <video src={entry.item.fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                                </div>
                              );
                            }
                            return (
                              <div
                                onClick={() => { setEditingAssetIndex(entry.origIndex); setIsImageEditorOpen(true); }}
                                style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
                              >
                                <img src={entry.item.fullUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            );
                          })()}
                          <div
                            onClick={(e) => { e.stopPropagation(); removeAsset(entry.origIndex); }}
                            style={{
                              position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.5)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              color: '#fff', zIndex: 10,
                            }}
                          >
                            <CloseOutlined style={{ fontSize: 6 }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 输入区域 */}
          <div style={{ position: 'relative' }}>
            <MentionPromptField
              ref={embeddedEditorRef}
              value={prompt}
              onChange={setPrompt}
              assets={mentionAssets}
              placeholder="Ask anything ..."
              plain={false}
              embedded
              isLight={_isLight}
              dropdownTitle="引用素材"
              emptyText="当前没有素材可供选择"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* 底部工具栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            {/* 左侧功能区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* + 按钮 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  color: _isLight ? '#71717a' : '#a1a1aa',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>

              {/* Auto Mode Pill */}
              <div
                onClick={() => setChatMode('auto')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: chatMode === 'auto' ? (_isLight ? 'rgba(24, 144, 255, 0.08)' : '#27272a') : 'transparent',
                  border: chatMode === 'auto' ? (_isLight ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid #3f3f46') : '1px solid transparent',
                  cursor: 'pointer',
                  color: chatMode === 'auto' ? (_isLight ? '#1890ff' : '#f4f4f5') : (_isLight ? '#71717a' : '#71717a'),
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>Auto</span>
              </div>

              {/* Basic Mode Pill */}
              <div
                onClick={() => setChatMode('basic')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: chatMode === 'basic' ? (_isLight ? 'rgba(24, 144, 255, 0.08)' : '#27272a') : 'transparent',
                  border: chatMode === 'basic' ? (_isLight ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid #3f3f46') : '1px solid transparent',
                  cursor: 'pointer',
                  color: chatMode === 'basic' ? (_isLight ? '#1890ff' : '#f4f4f5') : (_isLight ? '#71717a' : '#71717a'),
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span>Basic</span>
              </div>

              {/* Mention Button (@) */}
              <div
                onClick={() => {
                  if (attachedAssets.length > 0) {
                    const activeEditor = embedded ? embeddedEditorRef.current : editorRef.current;
                    activeEditor?.openMention();
                  } else {
                    message.info('当前没有素材可供引用，请先上传素材');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: _isLight ? '#71717a' : '#71717a',
                  transition: 'all 0.15s',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#71717a'; }}
              >
                @
              </div>
            </div>

            {/* 右侧功能区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Voice Button */}
              <div
                onClick={handleVoiceInput}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: _isLight ? '#71717a' : '#a1a1aa',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </div>

              {/* Send Button */}
              <div
                onClick={() => {
                  if (!prompt.trim() && attachedAssets.length === 0) return;
                  handleSend();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: (!prompt.trim() && attachedAssets.length === 0)
                    ? (_isLight ? 'rgba(0,0,0,0.03)' : '#18181b')
                    : (_isLight ? '#18181b' : '#ffffff'),
                  color: (!prompt.trim() && attachedAssets.length === 0)
                    ? (_isLight ? '#d4d4d8' : '#3f3f46')
                    : (_isLight ? '#ffffff' : '#09090b'),
                  cursor: (!prompt.trim() && attachedAssets.length === 0) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
      {/* 已附加的素材预览列表 */}
      {attachedAssets.length > 0 && (() => {
        // 按类型分组
        const grouped: { type: string; label: string; items: { item: typeof attachedAssets[0]; origIndex: number }[] }[] = [];
        const typeMap: Record<string, typeof grouped[0]> = {};

        attachedAssets.forEach((assetItem, index) => {
          const ext = assetItem.asset.file_name.split('.').pop()?.toLowerCase() || '';
          const isVideo = assetItem.asset.asset_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);
          const isAudio = assetItem.asset.asset_type === 'audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext);
          const typeKey = isAudio ? 'audio' : isVideo ? 'video' : 'image';
          const typeLabel = isAudio ? '声音' : isVideo ? '视频' : '图';
          if (!typeMap[typeKey]) {
            typeMap[typeKey] = { type: typeKey, label: typeLabel, items: [] };
            grouped.push(typeMap[typeKey]);
          }
          typeMap[typeKey].items.push({ item: assetItem, origIndex: index });
        });

        return (
          <div style={{ padding: '12px 16px 4px 16px', display: 'flex', flexDirection: 'column', gap: 8, width: '100%', boxSizing: 'border-box' }}>
            {grouped.map(group => (
              <div
                key={group.type}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: isMobile ? 6 : 8,
                  width: '100%',
                }}
              >
                {group.items.map((entry, idx) => (
                  <div
                    key={entry.item.asset.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedAssetIndex(entry.origIndex);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedAssetIndex === null || draggedAssetIndex === entry.origIndex) return;
                      // 仅允许互换位置
                      setAttachedAssets(prev => {
                        const newAssets = [...prev];
                        const temp = newAssets[draggedAssetIndex];
                        newAssets[draggedAssetIndex] = newAssets[entry.origIndex];
                        newAssets[entry.origIndex] = temp;
                        return newAssets;
                      });
                      setDraggedAssetIndex(null);
                    }}
                    onDragEnd={() => setDraggedAssetIndex(null)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      opacity: draggedAssetIndex === entry.origIndex ? 0.4 : 1,
                      cursor: 'grab',
                      minWidth: 0,
                    }}
                  >
                    <div style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      background: 'rgba(0,0,0,0.2)',
                    }}>
                      {(() => {
                        if (group.type === 'audio') {
                          return (
                            <div
                              onClick={() => { setEditingAssetIndex(entry.origIndex); setIsAudioPreviewOpen(true); }}
                              style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                            >
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}>
                                <AudioOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                              </div>
                              <div className="hover-edit-overlay" style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                              }}>
                                <PlayCircleOutlined style={{ fontSize: 18, color: '#fff' }} />
                              </div>
                            </div>
                          );
                        }
                        if (group.type === 'video') {
                          return (
                            <div
                              onClick={() => { setEditingAssetIndex(entry.origIndex); setIsVideoPreviewOpen(true); }}
                              style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer' }}
                            >
                              <video src={entry.item.fullUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" disablePictureInPicture />
                              <div style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.5)', padding: '1px 3px', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <VideoCameraOutlined style={{ fontSize: 9, color: '#fff' }} />
                              </div>
                              <div className="hover-edit-overlay" style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                              }}>
                                <PlayCircleOutlined style={{ fontSize: 18, color: '#fff' }} />
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            onClick={() => { setEditingAssetIndex(entry.origIndex); setIsImageEditorOpen(true); }}
                            style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}
                          >
                            <img src={entry.item.fullUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div className="hover-edit-overlay" style={{
                              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s'
                            }}>
                              <PictureOutlined style={{ fontSize: 14, color: '#fff' }} />
                            </div>
                          </div>
                        );
                      })()}
                      {/* 删除按钮 */}
                      <div
                        onClick={() => removeAsset(entry.origIndex)}
                        style={{
                          position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          transition: 'all 0.2s', color: '#fff', zIndex: 10,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,77,79,0.9)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                      >
                        <CloseOutlined style={{ fontSize: 8 }} />
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, color: 'rgba(255,255,255,0.4)',
                      lineHeight: 1, whiteSpace: 'nowrap',
                    }}>
                      {group.label}{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <style>{`
              .hover-edit-overlay:hover { opacity: 1 !important; }
            `}</style>
          </div>
        );
      })()}

      {/* 输入区域 */}
      <div style={{ position: 'relative' }}>
        <MentionPromptField
          ref={editorRef}
          value={prompt}
          onChange={setPrompt}
          assets={mentionAssets}
          placeholder={
            effectiveModel
              ? (attachedAssets.length > 0
                  ? `输入提示词，使用 @ 引用素材...`
                  : `Start typing a prompt to create ${getCategoryLabel(activeCategory)}...`)
              : '请先在右侧面板选择一个模型...'
          }
          plain={false}
          isLight={_isLight}
          dropdownTitle="引用素材"
          emptyText="当前没有素材可供选择，请先添加素材"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
        />
      </div>
      {/* 底部工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isMobile ? '4px 8px 8px 8px' : '8px 12px 12px 12px',
          gap: isMobile ? 6 : 8,
        }}
      >
        {/* 左侧功能芯片区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, flexWrap: 'wrap', minWidth: 0 }}>
          {/* API 密钥芯片（Imagine 风格弹出面板） */}
          <TokenSelectorPop
            tokens={apiTokens}
            selectedTokenKey={selectedTokenKey}
            onTokensChange={setApiTokens}
            onSelect={setSelectedTokenKey}
            variant="toolbar"
          />

          {/* 模型快捷切换按钮 */}
            <Tooltip title={effectiveModel ? "模型属性配置" : "选择模型"}>
              <div
                onClick={() => {
                  if (!effectiveModel) {
                    setIsModelDrawerVisible(true);
                  } else if (!isSettingsWidgetVisible) {
                    setIsSettingsWidgetVisible(true);
                  }
                }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: 30,
                padding: '0 10px',
                background: _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.1)',
                border: _isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: _isLight ? '#1f2937' : '#fff',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                maxWidth: isMobile ? 120 : 180,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.18)';
                e.currentTarget.style.borderColor = _isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = _isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)';
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {effectiveModel?.name || '选择模型'}
              </span>
              {effectiveModel && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectModel('');
                    setIsSettingsWidgetVisible(false);
                    setIsModelDrawerVisible(true);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginLeft: 2, padding: 2, borderRadius: '50%',
                    color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = _isLight ? '#000' : '#fff';
                    e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </div>
              )}
            </div>
          </Tooltip>

          {/* 联网搜索开关 */}
          {effectiveModel?.params?.some((p: any) => p.key === 'web_search') && (
            <Tooltip title="开启后允许模型使用联网搜索能力">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 30,
                  padding: '0 10px',
                  background: paramValues.web_search ? 'rgba(82, 196, 26, 0.15)' : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)'),
                  border: `1px solid ${paramValues.web_search ? 'rgba(82, 196, 26, 0.3)' : (_isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)')}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: paramValues.web_search ? '#52c41a' : (_isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'),
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setParamValues(prev => ({ ...prev, web_search: !prev.web_search }))}
              >
                <GlobalOutlined style={{ fontSize: 13 }} />
                <span>联网搜索</span>
              </div>
            </Tooltip>
          )}

          {/* 图片角色选择器 */}
          {isVideoModel && hasImage && (
            <Dropdown
              trigger={['click']}
              onOpenChange={setIsRoleDropdownOpen}
              menu={{
                items: [
                  { key: 'auto', label: '自动' },
                  { key: 'first_frame', label: '首帧', disabled: hasVideoOrAudio },
                  { key: 'first_last_frame', label: '首尾帧', disabled: hasVideoOrAudio },
                  { key: 'reference_image', label: '参考图' },
                ],
                onClick: (e) => {
                  setParamValues(prev => ({ ...prev, image_role: e.key === 'auto' ? undefined : e.key }));
                }
              }}
            >
              <Tooltip open={isRoleDropdownOpen ? false : undefined} title="指定图片的类型用途（受约束时自动锁定参考图）">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 30,
                    padding: '0 10px',
                    background: paramValues.image_role ? (_isLight ? 'rgba(22, 119, 255, 0.15)' : 'rgba(22, 119, 255, 0.15)') : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)'),
                    border: `1px solid ${paramValues.image_role ? (_isLight ? 'rgba(22, 119, 255, 0.3)' : 'rgba(22, 119, 255, 0.3)') : (_isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)')}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    color: paramValues.image_role ? '#1677ff' : (_isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'),
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <PictureOutlined style={{ fontSize: 13 }} />
                  <span>
                    {(() => {
                      const effectiveRole = hasVideoOrAudio && paramValues.image_role !== 'reference_image' && paramValues.image_role !== undefined
                        ? 'reference_image'
                        : paramValues.image_role;

                      switch (effectiveRole) {
                        case 'first_frame': return '首帧';
                        case 'first_last_frame': return '首尾帧';
                        case 'reference_image': return '参考图';
                        default: return '自动';
                      }
                    })()}
                  </span>
                </div>
              </Tooltip>
            </Dropdown>
          )}

        </div>

        {/* 右侧操作区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, flexShrink: 0 }}>
          {/* 语音输入按钮 */}
          <Tooltip title="语音输入">
            <div
              onClick={handleVoiceInput}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 10,
                background: _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
                border: _isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.color = _isLight ? '#000' : '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = _isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)';
              }}
            >
              <AudioOutlined style={{ fontSize: 16 }} />
            </div>
          </Tooltip>

          {/* 添加按钮（聊天模式暂不可用） */}
          {/* 简单逻辑判断：聊天模式通常不直接支持复杂多素材的附件 */}
          {effectiveModel?.scheme_type !== 'chat' && (() => {
            const isOnlyLocalUpload = dropdownItems.length === 1 && dropdownItems[0]?.key === 'local-upload';
            const isAttachBlocked = hasNoModel || totalAttachMax === 0;
            const isActionDisabled = isAttachBlocked || attachFull;

            const addButtonContent = (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: attachedAssets.length > 0
                    ? 'rgba(22,119,255,0.15)'
                    : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)'),
                  border: attachedAssets.length > 0
                    ? '1px solid rgba(22,119,255,0.3)'
                    : (_isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)'),
                  cursor: isActionDisabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  color: isAttachBlocked
                    ? (_isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)')
                    : (attachedAssets.length > 0 ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)')),
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: isAttachBlocked ? 0.45 : 1,
                }}
                onClick={() => {
                  if (hasNoModel) {
                    toast.warning('请先在右侧面板选择一个模型');
                    return;
                  }
                  if (totalAttachMax === 0) {
                    toast.warning('当前模型不支持添加参考内容');
                    return;
                  }
                  if (attachFull) {
                    toast.error('参考媒体已达上限');
                    return;
                  }
                  if (isOnlyLocalUpload && !isMobile) {
                    fileInputRef.current?.click();
                  }
                }}
                onMouseEnter={(e) => {
                  if (!isActionDisabled) {
                    e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.25)' : (_isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)');
                    e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : (_isLight ? '#000' : '#fff');
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActionDisabled) {
                    e.currentTarget.style.background = attachedAssets.length > 0 ? 'rgba(22,119,255,0.15)' : (_isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)');
                    e.currentTarget.style.color = attachedAssets.length > 0 ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)');
                  }
                }}
              >
                <PlusCircleOutlined style={{ fontSize: 16 }} />
                {isOnlyLocalUpload && isMobile && !isActionDisabled && (
                  <input
                    type="file"
                    onChange={(e) => {
                      e.stopPropagation();
                      handleFileChange(e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    accept={attachAccept}
                    multiple
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                  />
                )}
              </div>
            );

            if (isOnlyLocalUpload || isAttachBlocked) {
              return (
                <Tooltip title={attachAddTooltip(attachMax, attachRoom, !hasNoModel)} placement="bottom">
                  {addButtonContent}
                </Tooltip>
              );
            }

            return (
              <Dropdown
                menu={{ items: dropdownItems, onClick: handleMenuClick }}
                trigger={['click']}
                placement="topLeft"
                disabled={isActionDisabled}
                onOpenChange={setIsAddMenuOpen}
              >
                <Tooltip title={attachAddTooltip(attachMax, attachRoom, !hasNoModel)} placement="bottom" open={isAddMenuOpen ? false : undefined}>
                  {addButtonContent}
                </Tooltip>
              </Dropdown>
            );
          })()}

          {/* 运行按钮 */}
          <div
            onClick={() => {
              if (effectiveModel && prompt.trim() && !generating) {
                handleSend();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? 0 : 8,
              padding: isMobile ? 0 : '6px 16px',
              width: isMobile ? 32 : 'auto',
              height: isMobile ? 32 : 'auto',
              borderRadius: isMobile ? 10 : 14,
              cursor: currentModel && prompt.trim() && !generating ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              background: currentModel && prompt.trim() && !generating
                ? (_isLight ? '#1677ff' : 'rgba(255, 255, 255, 0.15)')
                : 'transparent',
              border: currentModel && prompt.trim() && !generating
                ? '1px solid transparent'
                : (_isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)'),
              color: currentModel && prompt.trim() && !generating
                ? '#fff'
                : (_isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)'),
              fontSize: isMobile ? 13 : 15,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (currentModel && prompt.trim() && !generating) {
                e.currentTarget.style.background = _isLight ? '#4096ff' : 'rgba(255, 255, 255, 0.22)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentModel && prompt.trim() && !generating) {
                e.currentTarget.style.background = _isLight ? '#1677ff' : 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            {generating && (
              <>
                <ThunderboltOutlined style={{ fontSize: isMobile ? 15 : 14, animation: 'pulse 1s infinite' }} />
                {!isMobile && <span>生成中...</span>}
              </>
            )}
            {!generating && isMobile && (
              <ThunderboltOutlined style={{ fontSize: 15 }} />
            )}
            {!generating && !isMobile && (
              <>
                <span>Run</span>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 15,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontWeight: 400,
                }}>
                  {modSymbol} ↵
                </span>
              </>
            )}
          </div>
        </div>
      </div>
        </>
      )}
{/* 生成中脉冲动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes voicePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,77,79,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(255,77,79,0); }
        }
      `}</style>

      {/* 资产库选择弹窗 */}
      <AssetPickerModal
        open={isAssetPickerOpen}
        onClose={() => setIsAssetPickerOpen(false)}
        pluginNs={assetPickerNs}
        onSelect={(items) => {
          if (hasNoModel) {
            toast.warning('请先在右侧面板选择一个模型');
            return;
          }
          if (totalAttachMax === 0) {
            toast.warning('当前模型不支持添加参考内容');
            return;
          }
          const { accepted, skipped } = pickWithinAttachLimits(
            attachedAssets,
            items,
            attachMax,
            (it) => classifyAttachKind(it),
          );
          const msg = skippedAttachMessage(skipped, attachMax);
          if (msg) toast.error(msg);
          if (!accepted.length) return;
          setAttachedAssets(prev => [...prev, ...accepted]);
          toast.success(`已附加 ${accepted.length} 个素材`);
        }}
      />

      {/* 图片放大预览与编辑弹窗 */}
      {editingAssetIndex !== null && attachedAssets[editingAssetIndex]?.asset.asset_type === 'image' && (
        <ImageEditorModal
          open={isImageEditorOpen}
          imageUrl={attachedAssets[editingAssetIndex].fullUrl}
          onCancel={() => {
            setIsImageEditorOpen(false);
            setEditingAssetIndex(null);
          }}
          onSave={(newUrl, file) => {
            const index = editingAssetIndex;
            setAttachedAssets(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                asset: {
                  ...updated[index].asset,
                  file_name: toResourceDisplayName(file.name),
                  size: file.size,
                  file_url: newUrl,
                },
                fullUrl: newUrl,
                file: file
              };
              return updated;
            });
            setIsImageEditorOpen(false);
            setEditingAssetIndex(null);
            toast.success('图片编辑已保存');
          }}
        />
      )}

      {/* 视频编辑弹窗 */}
      {editingAssetIndex !== null && (attachedAssets[editingAssetIndex]?.asset.asset_type === 'video' || attachedAssets[editingAssetIndex]?.asset.file_name?.match(/\.(mp4|mov|webm|avi|mkv)$/i)) && (
        <VideoEditorModal
          open={isVideoPreviewOpen}
          videoUrl={attachedAssets[editingAssetIndex].fullUrl}
          onCancel={() => {
            setIsVideoPreviewOpen(false);
            setEditingAssetIndex(null);
          }}
          onSave={(newUrl, file) => {
            const index = editingAssetIndex;
            setAttachedAssets(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                asset: {
                  ...updated[index].asset,
                  file_name: toResourceDisplayName(file.name),
                  size: file.size,
                  file_url: newUrl,
                },
                fullUrl: newUrl,
                file: file,
              };
              return updated;
            });
            setIsVideoPreviewOpen(false);
            setEditingAssetIndex(null);
            toast.success('视频编辑已保存');
          }}
        />
      )}

      {/* 音频预览弹窗 */}
      {editingAssetIndex !== null && (attachedAssets[editingAssetIndex]?.asset.asset_type === 'audio' || attachedAssets[editingAssetIndex]?.asset.file_name?.match(/\.(mp3|wav|aac|flac|ogg|m4a)$/i)) && (
        <AudioPreviewModal
          open={isAudioPreviewOpen}
          audioUrl={attachedAssets[editingAssetIndex].fullUrl}
          fileName={attachedAssets[editingAssetIndex].asset.file_name}
          onCancel={() => {
            setIsAudioPreviewOpen(false);
            setEditingAssetIndex(null);
          }}
        />
      )}

      {/* 隐藏的本地文件上传 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept={attachAccept}
        multiple
      />
    </div>
  );
});

PromptInput.displayName = 'PromptInput';
export default PromptInput;
