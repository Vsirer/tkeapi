/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 左侧导航侧栏 — Imagine.art 暗色样式（无 Ant Design）
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  Star,
  List,
  Plus,
  HardDrive,
  MoreHorizontal,
  Pencil,
  Trash2,
  Wrench,
  Upload,
  Layers,
  Terminal,
  Pin,
  Sparkles,
  Palette,
  Brush,
  Maximize2,
  Shirt,
  ScanFace,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useSettingsStore from '../../../../store/settings';
import { normalizeTitleHref } from '../../../../layouts/AuthLayout';
import {
  createAlbum,
  deleteAlbum,
  renameAlbum,
  reorderAlbums,
  type WorkAlbum,
} from '../utils/albumsApi';
import { uploadResourceFileDetailed } from '../utils/referenceUpload';
import { validateMacFileName } from '../utils/resourceFileName';
import { CustomIcon } from '../icons';
import { useSidebarCollapse } from './sidebarCollapseContext';
import ToolsNavFlyout from './ToolsNavFlyout';
import ModelLogoIcon from './ModelLogoIcon';
import { VideoFeatureIcon } from './VideoToolsWheel';
import { usePlaygroundImageModels } from '../hooks/usePlaygroundImageModels';
import { usePlaygroundVideoModels } from '../hooks/usePlaygroundVideoModels';
import { publishImageGenSeed } from '../utils/imageGenSeed';
import { publishVideoGenSeed } from '../utils/videoGenSeed';
import { usePinnedShortcuts, type PinnedShortcut } from '../utils/pinnedShortcuts';
import {
  loadSavedImageGenModelMid,
  loadSavedVideoGenModelMid,
} from '../utils/genModelPreference';
import type { PlaygroundModel } from '../types';
import {
  DEFAULT_VIDEO_FEATURE,
  pickVideoFeatureForModel,
} from '../config/modelFeatures';
import toast from './PlaygroundToast';
import { Modal, Tooltip, Dropdown, Input } from '../ui';
import { getSharedModalStyles } from '../utils/modalStyles';
import '../styles/imagineShell.css';

export const MAX_CUSTOM_ALBUMS = 20;

type Props = {
  activeTab:
    | 'assets-all'
    | 'assets-works'
    | 'assets-uploads'
    | 'assets-favorites'
    | 'assets-album'
    | 'images'
    | 'videos'
    | 'workflows';
  activeAlbumId: string;
  albums: WorkAlbum[];
  storageStats: any;
  siteName: string;
  siteLogo: string;
  onAlbumsChange: () => void | Promise<void>;
};

const PlaygroundSidebar: React.FC<Props> = ({
  activeTab,
  activeAlbumId,
  albums,
  storageStats,
  siteName,
  siteLogo,
  onAlbumsChange,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { collapsed, isMobile, setCollapsed } = useSidebarCollapse();
  const imageModelsApi = usePlaygroundImageModels();
  const videoModelsApi = usePlaygroundVideoModels();
  const defaultImageModels = useMemo(
    () => imageModelsApi.models.filter((m) => !!m.is_default),
    [imageModelsApi.models],
  );
  const defaultVideoModels = useMemo(
    () => videoModelsApi.models.filter((m) => !!m.is_default),
    [videoModelsApi.models],
  );
  const { settings } = useSettingsStore();
  const site = settings?.site;
  const headerTitle = (site?.name || siteName || 'Tkeapi').trim() || 'Tkeapi';
  const headerLogo = (site?.logo || siteLogo || '').trim();
  const logoTitleHref = normalizeTitleHref(site?.logo_title_url);
  const goLogoTitle = () => {
    const target = logoTitleHref || '/dashboard';
    if (target.startsWith('/') || target.startsWith('#') || target.startsWith('?')) {
      navigate(target);
    } else {
      window.location.href = target;
    }
  };

  const createAlbumSubmittingRef = useRef(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null);
  const [renamingAlbumName, setRenamingAlbumName] = useState('');

  const cancelCreateAlbum = useCallback(() => {
    if (createAlbumSubmittingRef.current) return;
    setCreatingAlbum(false);
    setNewAlbumName('');
  }, []);

  const handleCreateAlbum = useCallback(async () => {
    const currentCustomCount = albums.filter((a) => a.kind === 'custom').length;
    if (currentCustomCount >= MAX_CUSTOM_ALBUMS) {
      toast.warning(t('playground_2026:album_limit_reached', '一个用户最多只可以创建20个文件夹'));
      return;
    }
    const validation = validateMacFileName(newAlbumName, t('playground_2026:album_name_label', '文件夹名称'));
    if (!validation.valid) {
      toast.warning(validation.error || t('playground_2026:album_name_required', '请输入分类名称'));
      return;
    }
    const name = newAlbumName.trim();
    if (createAlbumSubmittingRef.current) return;
    createAlbumSubmittingRef.current = true;
    try {
      const album = await createAlbum(name);
      setCreatingAlbum(false);
      setNewAlbumName('');
      await onAlbumsChange();
      navigate(`/playground-2026/assets/albums/${album.id}`);
      if (isMobile) setCollapsed(true);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ||
          t('playground_2026:album_create_failed', '创建分类失败'),
      );
    } finally {
      window.setTimeout(() => {
        createAlbumSubmittingRef.current = false;
      }, 0);
    }
  }, [newAlbumName, onAlbumsChange, navigate, isMobile, setCollapsed, t]);

  const handleRenameAlbum = useCallback(
    async (id: string) => {
      const name = renamingAlbumName.trim();
      if (!name) {
        setRenamingAlbumId(null);
        return;
      }
      const currentAlbum = albums.find((a) => a.id === id);
      if (currentAlbum && currentAlbum.name === name) {
        setRenamingAlbumId(null);
        return;
      }
      const validation = validateMacFileName(renamingAlbumName, t('playground_2026:album_name_label', '文件夹名称'));
      if (!validation.valid) {
        toast.warning(validation.error || t('playground_2026:album_name_required', '请输入分类名称'));
        return;
      }
      try {
        await renameAlbum(id, name);
        setRenamingAlbumId(null);
        await onAlbumsChange();
      } catch (e: any) {
        toast.error(
          e?.response?.data?.error?.message ||
            t('playground_2026:album_rename_failed', '重命名失败'),
        );
      }
    },
    [renamingAlbumName, albums, onAlbumsChange, t],
  );

  const isLightTheme =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light';

  const [deleteModalAlbum, setDeleteModalAlbum] = useState<WorkAlbum | null>(null);
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);

  const [renameModalAlbum, setRenameModalAlbum] = useState<WorkAlbum | null>(null);
  const [renameModalValue, setRenameModalValue] = useState('');
  const [renameModalLoading, setRenameModalLoading] = useState(false);

  const handleDeleteAlbum = useCallback(
    (album: WorkAlbum) => {
      if (!album.can_delete) {
        toast.warning(t('playground_2026:album_system_locked', '系统分类不可删除'));
        return;
      }
      setDeleteModalAlbum(album);
    },
    [t],
  );

  const handleConfirmDeleteModal = useCallback(async () => {
    if (!deleteModalAlbum) return;
    setDeleteModalLoading(true);
    try {
      await deleteAlbum(deleteModalAlbum.id);
      await onAlbumsChange();
      if (activeAlbumId === deleteModalAlbum.id) {
        navigate('/playground-2026/assets/all');
      }
      setDeleteModalAlbum(null);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ||
          t('playground_2026:album_delete_failed', '删除失败'),
      );
    } finally {
      setDeleteModalLoading(false);
    }
  }, [deleteModalAlbum, onAlbumsChange, activeAlbumId, navigate, t]);

  const handleConfirmRenameModal = useCallback(async () => {
    if (!renameModalAlbum) return;
    const name = renameModalValue.trim();
    if (!name) {
      toast.warning(t('playground_2026:album_name_required', '请输入分类名称'));
      return;
    }
    if (renameModalAlbum.name === name) {
      setRenameModalAlbum(null);
      return;
    }
    const validation = validateMacFileName(name, t('playground_2026:album_name_label', '文件夹名称'));
    if (!validation.valid) {
      toast.warning(validation.error || t('playground_2026:album_name_required', '请输入分类名称'));
      return;
    }
    setRenameModalLoading(true);
    try {
      await renameAlbum(renameModalAlbum.id, name);
      setRenameModalAlbum(null);
      await onAlbumsChange();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ||
          t('playground_2026:album_rename_failed', '重命名失败'),
      );
    } finally {
      setRenameModalLoading(false);
    }
  }, [renameModalAlbum, renameModalValue, onAlbumsChange, t]);

  const go = useCallback((to: string) => {
    navigate(to);
    if (isMobile) setCollapsed(true);
  }, [navigate, isMobile, setCollapsed]);

  const sidebarUploadInputRef = useRef<HTMLInputElement>(null);
  const [sidebarUploading, setSidebarUploading] = useState(false);

  const handleSidebarUpload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || sidebarUploading) return;
      setSidebarUploading(true);
      try {
        for (const file of Array.from(files)) {
          await uploadResourceFileDetailed(file);
        }
        toast.success(t('playground_2026:upload_success', '上传成功'));
        window.dispatchEvent(new CustomEvent('pg-assets-refresh'));
        go('/playground-2026/assets/all');
      } catch (e: any) {
        toast.error(e?.message || t('playground_2026:upload_failed', '上传失败'));
      } finally {
        setSidebarUploading(false);
        if (sidebarUploadInputRef.current) sidebarUploadInputRef.current.value = '';
      }
    },
    [sidebarUploading, t, go],
  );

  const openImageFeature = useCallback(() => {
    go('/playground-2026/images');
  }, [isMobile, setCollapsed, navigate]);

  const openVideoFeature = useCallback(
    (featureKey?: string) => {
      publishVideoGenSeed({
        featureKey: featureKey || DEFAULT_VIDEO_FEATURE,
        preferFirstModel: true,
      });
      go('/playground-2026/videos');
    },
    [isMobile, setCollapsed, navigate],
  );

  const openImageModel = useCallback(
    (model: PlaygroundModel) => {
      publishImageGenSeed({
        modelMid: model.mid,
        paramValues: imageModelsApi.getInitialParams(model),
      });
      go('/playground-2026/images');
    },
    [imageModelsApi, isMobile, setCollapsed, navigate],
  );

  const openVideoModel = useCallback(
    (model: PlaygroundModel, featureKey?: string) => {
      publishVideoGenSeed({
        modelMid: model.mid,
        paramValues: videoModelsApi.getInitialParams(model),
        featureKey: pickVideoFeatureForModel(model, featureKey),
      });
      go('/playground-2026/videos');
    },
    [videoModelsApi, isMobile, setCollapsed, navigate],
  );

  const { pinnedItems, unpin } = usePinnedShortcuts();

  const renderShortcutIcon = useCallback((item: PinnedShortcut, size = 16) => {
    if (item.type === 'model') {
      return (
        <ModelLogoIcon
          logo={item.logo}
          fallbackLetter={item.name}
          size={size}
        />
      );
    }
    if (item.kind === 'video') {
      return <VideoFeatureIcon id={item.key || ''} size={size} />;
    }
    switch (item.key) {
      case 'create-image':
        return <CustomIcon name="image" size={size} />;
      case 'references':
        return <CustomIcon name="assets" size={size} />;
      case 'edit-image':
        return <Sparkles size={size} />;
      case 'style-reference':
        return <Palette size={size} />;
      case 'inpaint':
        return <Brush size={size} />;
      case 'upscale':
        return <Maximize2 size={size} />;
      case 'ai-clothes-changer':
        return <Shirt size={size} />;
      case 'ai-background-changer':
        return <Layers size={size} />;
      case 'ai-face-swap':
        return <ScanFace size={size} />;
      default:
        return <CustomIcon name="image" size={size} />;
    }
  }, []);

  const handleShortcutClick = useCallback(
    (item: PinnedShortcut) => {
      if (item.type === 'model') {
        if (item.kind === 'image') {
          const model = imageModelsApi.models.find((m) => m.mid === item.mid);
          if (model) {
            openImageModel(model);
          } else {
            publishImageGenSeed({ modelMid: item.mid });
            go('/playground-2026/images');
          }
        } else {
          const model = videoModelsApi.models.find((m) => m.mid === item.mid);
          if (model) {
            openVideoModel(model);
          } else {
            publishVideoGenSeed({ modelMid: item.mid });
            go('/playground-2026/videos');
          }
        }
        return;
      }

      // Feature shortcut
      if (item.kind === 'video') {
        openVideoFeature(item.key);
        return;
      }

      if (item.key === 'references') {
        go('/playground-2026/images');
        window.dispatchEvent(new CustomEvent('pg-open-ref-picker'));
      } else {
        publishImageGenSeed({ featureKey: item.key });
        go('/playground-2026/images');
      }
    },
    [imageModelsApi.models, videoModelsApi.models, openImageModel, openVideoModel, openVideoFeature, go],
  );

  const isShortcutActive = useCallback(
    (item: PinnedShortcut) => {
      if (item.type === 'model') {
        if (item.kind === 'image') {
          return activeTab === 'images' && loadSavedImageGenModelMid() === item.mid;
        }
        if (item.kind === 'video') {
          return activeTab === 'videos' && loadSavedVideoGenModelMid() === item.mid;
        }
      }
      return false;
    },
    [activeTab],
  );

  const favoritesAlbum = albums.find((a) => a.kind === 'favorites');
  const customAlbums = albums.filter((a) => a.kind === 'custom');

  const [localCustomAlbums, setLocalCustomAlbums] = useState<WorkAlbum[]>(customAlbums);
  const [dragState, setDragState] = useState<{
    album: WorkAlbum;
    index: number;
  } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragReadyId, setDragReadyId] = useState<string | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ index: number; placement: 'top' | 'bottom' } | null>(null);

  const pressTimerRef = useRef<number | null>(null);
  const pressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const pointerMovedRef = useRef<boolean>(false);
  const dragStateRef = useRef<{ album: WorkAlbum; index: number } | null>(null);
  const dragOverInfoRef = useRef<{ index: number; placement: 'top' | 'bottom' } | null>(null);
  const localAlbumsRef = useRef<WorkAlbum[]>(customAlbums);
  const albumItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPositionsRef = useRef<Map<string, number> | null>(null);
  const sidebarNavSubRef = useRef<HTMLDivElement | null>(null);

  dragStateRef.current = dragState;
  dragOverInfoRef.current = dragOverInfo;
  localAlbumsRef.current = localCustomAlbums;

  const clearLongPress = useCallback(() => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    pressStartPosRef.current = null;
  }, []);

  useEffect(() => {
    if (!dragState) {
      setLocalCustomAlbums(albums.filter((a) => a.kind === 'custom'));
    }
  }, [albums, dragState]);

  // FLIP (First, Last, Invert, Play) 平滑过渡动画：放手后列表各项平滑滑入新位置
  useLayoutEffect(() => {
    if (!prevPositionsRef.current) return;
    const prevPositions = prevPositionsRef.current;
    prevPositionsRef.current = null;

    albumItemRefs.current.forEach((el, id) => {
      const prevTop = prevPositions.get(id);
      if (prevTop === undefined) return;
      const currentTop = el.getBoundingClientRect().top;
      const deltaY = prevTop - currentTop;

      if (deltaY !== 0) {
        // Invert: 瞬时位移到原位置，临时关闭 transition 避免瞬闪
        el.style.transform = `translateY(${deltaY}px)`;
        el.style.transition = 'none';

        // Play: 下一帧恢复位置，启动贝塞尔弹性平滑曲线
        requestAnimationFrame(() => {
          el.style.transition =
            'transform 0.35s cubic-bezier(0.2, 0.85, 0.2, 1), background 0.35s ease, box-shadow 0.35s ease';
          el.style.transform = '';

          const cleanup = () => {
            el.style.transition = '';
            el.removeEventListener('transitionend', cleanup);
          };
          el.addEventListener('transitionend', cleanup);
        });
      }
    });
  }, [localCustomAlbums]);

  const calculateDropTarget = useCallback(
    (clientY: number): { index: number; placement: 'top' | 'bottom' } | null => {
      const list = localAlbumsRef.current;
      if (list.length === 0) return null;

      const firstEl = albumItemRefs.current.get(list[0].id);
      if (firstEl) {
        const firstRect = firstEl.getBoundingClientRect();
        if (clientY < firstRect.top) {
          return { index: 0, placement: 'top' };
        }
      }

      const lastEl = albumItemRefs.current.get(list[list.length - 1].id);
      if (lastEl) {
        const lastRect = lastEl.getBoundingClientRect();
        if (clientY > lastRect.bottom) {
          return { index: list.length - 1, placement: 'bottom' };
        }
      }

      let bestIndex = 0;
      let bestPlacement: 'top' | 'bottom' = 'top';
      let bestDist = Infinity;

      for (let i = 0; i < list.length; i++) {
        const el = albumItemRefs.current.get(list[i].id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          const placement: 'top' | 'bottom' = clientY > rect.top + rect.height / 2 ? 'bottom' : 'top';
          return { index: i, placement };
        }
        const midY = rect.top + rect.height / 2;
        const dist = Math.abs(clientY - midY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
          bestPlacement = clientY > midY ? 'bottom' : 'top';
        }
      }

      return { index: bestIndex, placement: bestPlacement };
    },
    [],
  );

  const startDragSession = useCallback(
    (album: WorkAlbum, index: number, x: number, y: number) => {
      longPressTriggeredRef.current = true;
      pointerMovedRef.current = false;
      setDragReadyId(album.id);
      setDragState({ album, index });
      setCursorPos({ x, y });
      document.body.classList.add('pg-ig-is-reordering');
    },
    [],
  );

  const cancelDrag = useCallback(() => {
    document.body.classList.remove('pg-ig-is-reordering');
    clearLongPress();
    setDragState(null);
    setDragReadyId(null);
    setDragOverInfo(null);
  }, [clearLongPress]);

  const executeDrop = useCallback(async () => {
    const currentDrag = dragStateRef.current;
    const currentOver = dragOverInfoRef.current;

    document.body.classList.remove('pg-ig-is-reordering');
    clearLongPress();

    if (!currentDrag) {
      setDragState(null);
      setDragReadyId(null);
      setDragOverInfo(null);
      return;
    }

    const { album: movedAlbum, index: originIndex } = currentDrag;

    if (!currentOver) {
      setDragState(null);
      setDragReadyId(null);
      setDragOverInfo(null);
      return;
    }

    const targetIndex = currentOver.index;
    const placement = currentOver.placement;

    let insertIndex = placement === 'bottom' ? targetIndex + 1 : targetIndex;
    if (originIndex < insertIndex) {
      insertIndex -= 1;
    }

    if (originIndex === insertIndex) {
      setDragState(null);
      setDragReadyId(null);
      setDragOverInfo(null);
      return;
    }

    // 记录 FLIP 初始屏幕坐标 (First)
    const positions = new Map<string, number>();
    albumItemRefs.current.forEach((node, id) => {
      positions.set(id, node.getBoundingClientRect().top);
    });
    prevPositionsRef.current = positions;

    const next = [...localAlbumsRef.current];
    const [moved] = next.splice(originIndex, 1);
    next.splice(insertIndex, 0, moved);
    setLocalCustomAlbums(next);
    setJustDroppedId(moved.id);

    setDragState(null);
    setDragReadyId(null);
    setDragOverInfo(null);

    window.setTimeout(() => {
      setJustDroppedId((curr) => (curr === moved.id ? null : curr));
    }, 500);

    try {
      await reorderAlbums(next.map((a) => a.id));
      await onAlbumsChange();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message ||
          t('playground_2026:reorder_failed', '文件夹排序保存失败'),
      );
      void onAlbumsChange();
    }
  }, [clearLongPress, onAlbumsChange, t]);

  useEffect(() => {
    if (!dragState) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      pointerMovedRef.current = true;
      setCursorPos({ x: e.clientX, y: e.clientY });

      const navSubEl = sidebarNavSubRef.current;
      if (navSubEl) {
        const rect = navSubEl.getBoundingClientRect();
        if (e.clientX < rect.left - 50 || e.clientX > rect.right + 90) {
          setDragOverInfo(null);
          return;
        }
      }

      const target = calculateDropTarget(e.clientY);
      setDragOverInfo(target);
    };

    const handleGlobalPointerUp = () => {
      if (pointerMovedRef.current) {
        void executeDrop();
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrag();
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [dragState, calculateDropTarget, executeDrop, cancelDrag]);

  useEffect(() => {
    return () => {
      clearLongPress();
      document.body.classList.remove('pg-ig-is-reordering');
    };
  }, [clearLongPress]);

  const handleItemPointerDown = useCallback(
    (e: React.PointerEvent, album: WorkAlbum, idx: number) => {
      if (e.button !== 0) return;
      if (renamingAlbumId === album.id || creatingAlbum) return;

      // 如果当前正处于拾取拖动中（点击落位模式），再次点击即刻落位
      if (dragStateRef.current) {
        e.stopPropagation();
        e.preventDefault();
        void executeDrop();
        return;
      }

      longPressTriggeredRef.current = false;
      pressStartPosRef.current = { x: e.clientX, y: e.clientY };

      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
      }

      const startX = e.clientX;
      const startY = e.clientY;

      // 按住 0.5 秒（500ms）后变为手掌，直接绑定到鼠标标签上
      pressTimerRef.current = window.setTimeout(() => {
        pressTimerRef.current = null;
        startDragSession(album, idx, startX, startY);
      }, 500);
    },
    [renamingAlbumId, creatingAlbum, executeDrop, startDragSession],
  );

  const handleItemPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pressTimerRef.current && pressStartPosRef.current) {
        const dist = Math.hypot(
          e.clientX - pressStartPosRef.current.x,
          e.clientY - pressStartPosRef.current.y,
        );
        // 若 0.5 秒内发生较大幅度移动（>18px），说明用户是在快速滑动或滚动，取消长按
        if (dist > 18) {
          clearLongPress();
        }
      }
    },
    [clearLongPress],
  );

  const handleItemPointerUp = useCallback(() => {
    if (pressTimerRef.current) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const handleAlbumClick = useCallback((albumId: string) => {
    if (longPressTriggeredRef.current || dragStateRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    go(`/playground-2026/assets/albums/${albumId}`);
  }, [go]);

  const assetsActive =
    activeTab === 'assets-all' ||
    activeTab === 'assets-works' ||
    activeTab === 'assets-uploads' ||
    activeTab === 'assets-favorites' ||
    activeTab === 'assets-album';

  const isWorkflowEnabled = !!storageStats?.workflow_enabled;
  const workflowMenuTitle =
    (typeof storageStats?.workflow_menu_title === 'string' && storageStats.workflow_menu_title.trim()) ||
    t('playground_2026:workflows', '工作流');

  const navClass = (active: boolean) =>
    `pg-ig-nav-item ${active ? 'active is-active' : ''}`;

  const sidebarStyle: React.CSSProperties | undefined = isMobile
    ? {
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        width: collapsed ? 0 : undefined,
        borderRight: collapsed ? 'none' : undefined,
        overflow: 'hidden',
      }
    : undefined;

  return (
    <>
      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 70,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <aside
        className={`pg-ig-sidebar${collapsed ? ' is-collapsed' : ''}`}
        style={sidebarStyle}
      >
        <div className="pg-ig-sidebar-logo" title={headerTitle}>
          <div
            className="pg-ig-sidebar-logo-mark"
            role="link"
            tabIndex={0}
            onClick={goLogoTitle}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goLogoTitle();
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            {headerLogo ? (
              <img src={headerLogo} alt="logo" />
            ) : (
              <span className="pg-ig-sidebar-logo-fallback" aria-hidden>
                <Terminal size={12} />
              </span>
            )}
          </div>
          {!collapsed && (
            <span
              className="pg-ig-sidebar-logo-text"
              role="link"
              tabIndex={0}
              onClick={goLogoTitle}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goLogoTitle();
                }
              }}
              style={{
                cursor: 'pointer',
                fontSize: headerTitle.length > 12 ? 14 : headerTitle.length > 8 ? 16 : 18,
              }}
            >
              {headerTitle}
            </span>
          )}
        </div>

        <div className="pg-ig-nav-scroll">
          {collapsed ? (
            <>
              <ToolsNavFlyout
                kind="image"
                active={activeTab === 'images'}
                collapsed
                models={defaultImageModels}
                modelsLoading={imageModelsApi.loading}
                onSelectFeature={openImageFeature}
                onSelectModel={openImageModel}
              >
                <button
                  type="button"
                  className={navClass(activeTab === 'images')}
                  title={t('playground_2026:images', '图片')}
                  onClick={() => go('/playground-2026/images')}
                >
                  <span className="pg-ig-nav-icon-box">
                    <CustomIcon name="image" size={20} />
                  </span>
                  <span className="pg-ig-nav-caption">{t('playground_2026:images', '图片')}</span>
                </button>
              </ToolsNavFlyout>
              <ToolsNavFlyout
                kind="video"
                active={activeTab === 'videos'}
                collapsed
                models={defaultVideoModels}
                modelsLoading={videoModelsApi.loading}
                features={videoModelsApi.videoFeatures}
                onSelectFeature={openVideoFeature}
                onSelectModel={openVideoModel}
              >
                <button
                  type="button"
                  className={navClass(activeTab === 'videos')}
                  title={t('playground_2026:videos', '视频')}
                  onClick={() => openVideoFeature()}
                >
                  <span className="pg-ig-nav-icon-box">
                    <CustomIcon name="video" size={20} />
                  </span>
                  <span className="pg-ig-nav-caption">{t('playground_2026:videos', '视频')}</span>
                </button>
              </ToolsNavFlyout>
              {isWorkflowEnabled && (
                <Tooltip title={workflowMenuTitle} placement="right">
                  <button
                    type="button"
                    className={navClass(activeTab === 'workflows')}
                    onClick={() => go('/playground-2026/workflows')}
                  >
                    <span className="pg-ig-nav-icon-box">
                      <CustomIcon name="workflow" size={20} />
                    </span>
                    <span className="pg-ig-nav-caption">
                      {workflowMenuTitle}
                    </span>
                  </button>
                </Tooltip>
              )}
              {pinnedItems.map((item) => (
                <Tooltip key={item.id} title={item.name} placement="right">
                  <button
                    type="button"
                    className={navClass(isShortcutActive(item))}
                    onClick={() => handleShortcutClick(item)}
                  >
                    <span className="pg-ig-nav-icon-box">
                      {renderShortcutIcon(item, 20)}
                    </span>
                    <span className="pg-ig-nav-caption">{item.name}</span>
                  </button>
                </Tooltip>
              ))}
              <Tooltip title={t('playground_2026:assets', '资产')} placement="right">
                <button
                  type="button"
                  className={navClass(assetsActive)}
                  onClick={() => go('/playground-2026/assets/all')}
                >
                  <span className="pg-ig-nav-icon-box">
                    <Layers size={20} />
                  </span>
                  <span className="pg-ig-nav-caption">{t('playground_2026:assets', '资产')}</span>
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <div className="pg-ig-nav-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Wrench size={12} />
                  {t('playground_2026:tools', 'AI创作中心')}
                </span>
              </div>
              <div className="pg-ig-nav-sub">
                <ToolsNavFlyout
                  kind="image"
                  active={activeTab === 'images'}
                  collapsed={false}
                  models={defaultImageModels}
                  modelsLoading={imageModelsApi.loading}
                  onSelectFeature={openImageFeature}
                  onSelectModel={openImageModel}
                >
                  <button
                    type="button"
                    className={navClass(activeTab === 'images')}
                    onClick={() => go('/playground-2026/images')}
                  >
                    <CustomIcon name="image" size={16} />
                    <span>{t('playground_2026:images', '图片')}</span>
                  </button>
                </ToolsNavFlyout>
                <ToolsNavFlyout
                  kind="video"
                  active={activeTab === 'videos'}
                  collapsed={false}
                  models={defaultVideoModels}
                  modelsLoading={videoModelsApi.loading}
                  features={videoModelsApi.videoFeatures}
                  onSelectFeature={openVideoFeature}
                  onSelectModel={openVideoModel}
                >
                  <button
                    type="button"
                    className={navClass(activeTab === 'videos')}
                    onClick={() => openVideoFeature()}
                  >
                    <CustomIcon name="video" size={16} />
                    <span>{t('playground_2026:videos', '视频')}</span>
                  </button>
                </ToolsNavFlyout>
                {isWorkflowEnabled && (
                  <button
                    type="button"
                    className={navClass(activeTab === 'workflows')}
                    onClick={() => go('/playground-2026/workflows')}
                  >
                    <CustomIcon name="workflow" size={16} />
                    <span>{workflowMenuTitle}</span>
                  </button>
                )}
                {pinnedItems.map((item) => {
                  const isActive = isShortcutActive(item);
                  return (
                    <div
                      key={item.id}
                      className={`pg-ig-pinned-row ${navClass(isActive)}`}
                    >
                      <button
                        type="button"
                        className="pg-ig-pinned-action-btn"
                        onClick={() => handleShortcutClick(item)}
                        title={item.name}
                      >
                        <span className="pg-ig-pinned-icon-box">
                          {renderShortcutIcon(item, 16)}
                        </span>
                        <span className="pg-ig-pinned-name">{item.name}</span>
                      </button>
                      <button
                        type="button"
                        className="pg-ig-pinned-unpin-btn"
                        title={t('playground_2026:unpin_from_sidebar', '取消固定')}
                        onClick={(e) => {
                          e.stopPropagation();
                          unpin(item.id);
                        }}
                      >
                        <Pin size={12} className="pg-ig-pinned-unpin-icon" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="pg-ig-nav-label">{t('playground_2026:library', '资料库')}</div>

              <div ref={sidebarNavSubRef} className="pg-ig-nav-sub">
                <button
                  type="button"
                  className={navClass(activeTab === 'assets-works')}
                  onClick={() => go('/playground-2026/assets/works')}
                >
                  <List />
                  <span>{t('playground_2026:works', '作品')}</span>
                </button>
                <div
                  className={navClass(activeTab === 'assets-all')}
                  style={{ position: 'relative', paddingRight: 4, display: 'flex', alignItems: 'center' }}
                >
                  <button
                    type="button"
                    onClick={() => go('/playground-2026/assets/all')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      textAlign: 'left',
                    }}
                  >
                    <Layers size={18} />
                    <span>{t('playground_2026:all_assets', '资产素材库')}</span>
                  </button>
                  <input
                    ref={sidebarUploadInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => void handleSidebarUpload(e.target.files)}
                  />
                  <button
                    type="button"
                    className="pg-ig-icon-btn"
                    title={t('playground_2026:upload_resource', '上传文件')}
                    disabled={sidebarUploading}
                    onClick={(e) => {
                      e.stopPropagation();
                      sidebarUploadInputRef.current?.click();
                    }}
                  >
                    <Upload size={14} />
                  </button>
                  <button
                    type="button"
                    className="pg-ig-icon-btn"
                    title={t('playground_2026:create_album', '新建分类')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (customAlbums.length >= MAX_CUSTOM_ALBUMS) {
                        toast.warning(t('playground_2026:album_limit_reached', '一个用户最多只可以创建20个文件夹'));
                        return;
                      }
                      setCreatingAlbum(true);
                      setNewAlbumName('');
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {localCustomAlbums.map((album, idx) => {
                  const isDragging = dragState?.album.id === album.id;
                  const isDragReady = dragReadyId === album.id;
                  const isJustDropped = justDroppedId === album.id;
                  const isOver = dragOverInfo?.index === idx && dragState !== null && dragState.index !== idx;
                  const overClass = isOver
                    ? dragOverInfo.placement === 'bottom'
                      ? ' is-drag-over-bottom'
                      : ' is-drag-over-top'
                    : '';
                  const readyClass = isDragReady ? ' is-drag-ready' : '';
                  const droppedClass = isJustDropped ? ' is-just-dropped' : '';
                  return (
                    <div
                      key={album.id}
                      ref={(node) => {
                        if (node) {
                          albumItemRefs.current.set(album.id, node);
                        } else {
                          albumItemRefs.current.delete(album.id);
                        }
                      }}
                      onPointerDown={(e) => handleItemPointerDown(e, album, idx)}
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      onDragStart={(e) => e.preventDefault()}
                      className={`pg-ig-album-item${isDragging ? ' is-dragging' : ''}${readyClass}${overClass}${droppedClass} ${navClass(
                        activeTab === 'assets-album' && activeAlbumId === album.id,
                      )}`}
                      style={{
                        position: 'relative',
                        paddingRight: 4,
                      }}
                    >
                      {renamingAlbumId === album.id ? (
                        <input
                          className="pg-ig-input"
                          value={renamingAlbumName}
                          autoFocus
                          maxLength={40}
                          onChange={(e) => setRenamingAlbumName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRenameAlbum(album.id);
                            if (e.key === 'Escape') setRenamingAlbumId(null);
                          }}
                          onBlur={() => void handleRenameAlbum(album.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ height: 28 }}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAlbumClick(album.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              flex: 1,
                              minWidth: 0,
                              border: 'none',
                              background: 'transparent',
                              color: 'inherit',
                              font: 'inherit',
                              padding: 0,
                              textAlign: 'left',
                            }}
                          >
                            <Folder size={18} style={{ flexShrink: 0 }} />
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {album.name}
                            </span>
                          </button>
                          <div
                            style={{ position: 'relative' }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              clearLongPress();
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Dropdown
                              placement="bottomLeft"
                              menu={{
                                items: [
                                  {
                                    key: 'rename',
                                    icon: <Pencil size={14} />,
                                    label: t('playground_2026:rename', '重命名'),
                                    onClick: ({ domEvent }) => {
                                      domEvent.stopPropagation();
                                      setRenameModalAlbum(album);
                                      setRenameModalValue(album.name);
                                    },
                                  },
                                  {
                                    key: 'delete',
                                    danger: true,
                                    icon: <Trash2 size={14} />,
                                    label: t('playground_2026:delete_album', '删除分类'),
                                    onClick: ({ domEvent }) => {
                                      domEvent.stopPropagation();
                                      handleDeleteAlbum(album);
                                    },
                                  },
                                ],
                              }}
                              trigger={['click']}
                            >
                              <button
                                type="button"
                                className="pg-ig-icon-btn"
                                title={t('playground_2026:more', '更多')}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </Dropdown>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {creatingAlbum && (
                  <div style={{ padding: '4px 0' }}>
                    <input
                      className="pg-ig-input"
                      autoFocus
                      maxLength={40}
                      placeholder={t('playground_2026:album_name_placeholder', '分类名称')}
                      value={newAlbumName}
                      onChange={(e) => setNewAlbumName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleCreateAlbum();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelCreateAlbum();
                        }
                      }}
                      onBlur={() => cancelCreateAlbum()}
                    />
                  </div>
                )}

                <button
                  type="button"
                  className={navClass(activeTab === 'assets-favorites')}
                  onClick={() => go('/playground-2026/assets/favorites')}
                >
                  <Star />
                  <span>
                    {favoritesAlbum?.name || t('playground_2026:favorites', '收藏夹')}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        {storageStats ? (
          collapsed ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '12px 0 16px',
              }}
            >
              {isWorkflowEnabled && (
                <Tooltip
                  title={`${workflowMenuTitle}${t('playground_2026:quota_suffix', '额度')}: ${storageStats.project_count} / ${storageStats.max_projects}`}
                  placement="right"
                >
                  <button
                    type="button"
                    className={navClass(activeTab === 'workflows')}
                    onClick={() => go('/playground-2026/workflows')}
                  >
                    <span className="pg-ig-nav-icon-box">
                      <CustomIcon name="workflow" size={20} />
                    </span>
                    <span className="pg-ig-nav-caption">
                      {t('playground_2026:workflow_quota', '额度')}
                    </span>
                  </button>
                </Tooltip>
              )}
              <Tooltip
                title={`${t('playground_2026:storage_quota', '存储容量')}: ${(storageStats.total_size_mb || 0).toFixed(1)} / ${storageStats.quota_mb} MB`}
                placement="right"
              >
                <button
                  type="button"
                  className={navClass(assetsActive)}
                  onClick={() => go('/playground-2026/assets/all')}
                >
                  <span className="pg-ig-nav-icon-box">
                    <HardDrive size={20} strokeWidth={1.5} />
                  </span>
                  <span className="pg-ig-nav-caption">
                    {t('playground_2026:storage_quota', '存储')}
                  </span>
                </button>
              </Tooltip>
            </div>
          ) : (
            <div className="pg-ig-quota">
              {isWorkflowEnabled && (
                <div
                  role="button"
                  tabIndex={0}
                  className="pg-ig-quota-section"
                  onClick={() => go('/playground-2026/workflows')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      go('/playground-2026/workflows');
                    }
                  }}
                  style={{ cursor: 'pointer', marginBottom: 12 }}
                  title={`${workflowMenuTitle}${t('playground_2026:quota_suffix', '额度')}: ${storageStats.project_count} / ${storageStats.max_projects}`}
                >
                  <div className="pg-ig-quota-title">
                    <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t('playground_2026:workflow_limit_custom', { title: workflowMenuTitle, defaultValue: `可创建${workflowMenuTitle}数` })}</span>
                      <span>
                        {storageStats.project_count} / {storageStats.max_projects}
                      </span>
                    </span>
                  </div>
                  <div className="pg-ig-quota-bar">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          (storageStats.project_count / (storageStats.max_projects || 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                className="pg-ig-quota-section"
                onClick={() => go('/playground-2026/assets/all')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go('/playground-2026/assets/all');
                  }
                }}
                style={{ cursor: 'pointer' }}
                title={`${t('playground_2026:storage_quota', '存储容量')}: ${(storageStats.total_size_mb || 0).toFixed(1)} / ${storageStats.quota_mb} MB`}
              >
                <div className="pg-ig-quota-title">
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('playground_2026:storage_limit', '空间大小限制')}</span>
                    <span>
                      {(storageStats.total_size_mb || 0).toFixed(1)} / {storageStats.quota_mb} MB
                    </span>
                  </span>
                </div>
                <div className="pg-ig-quota-bar">
                  <i
                    style={{
                      width: `${Math.min(100, storageStats.usage_percent || 0)}%`,
                      background:
                        (storageStats.usage_percent || 0) > 90
                          ? 'linear-gradient(90deg, #ef4444, #f87171)'
                          : undefined,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        ) : (
          !collapsed && (
            <div className="pg-ig-quota">
              <div
                style={{
                  height: 10,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)',
                  marginBottom: 8,
                }}
              />
              <div className="pg-ig-quota-bar" style={{ marginBottom: 12 }} />
              <div
                style={{
                  height: 10,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)',
                  marginBottom: 8,
                }}
              />
              <div className="pg-ig-quota-bar" />
            </div>
          )
        )}
      </aside>

      {/* 分类重命名 Modal */}
      <Modal
        title={t('playground_2026:rename', '重命名')}
        open={!!renameModalAlbum}
        onCancel={() => setRenameModalAlbum(null)}
        onOk={() => void handleConfirmRenameModal()}
        confirmLoading={renameModalLoading}
        okText={t('common.ok', '确定')}
        cancelText={t('common.cancel', '取消')}
        width={380}
        zIndex={6000}
        {...getSharedModalStyles(isLightTheme)}
      >
        <div style={{ paddingTop: 12, paddingBottom: 4 }}>
          <Input
            autoFocus
            value={renameModalValue}
            maxLength={40}
            placeholder={t('playground_2026:album_name_placeholder', '分类名称')}
            onChange={(e) => setRenameModalValue(e.target.value)}
            onPressEnter={() => void handleConfirmRenameModal()}
          />
        </div>
      </Modal>

      {/* 分类删除确认 Modal */}
      <Modal
        title={t('playground_2026:album_delete_confirm', '确认删除此分类？')}
        open={!!deleteModalAlbum}
        onCancel={() => setDeleteModalAlbum(null)}
        onOk={() => void handleConfirmDeleteModal()}
        confirmLoading={deleteModalLoading}
        okText={t('playground_2026:delete', '删除')}
        cancelText={t('common.cancel', '取消')}
        width={380}
        zIndex={6000}
        {...getSharedModalStyles(isLightTheme)}
        okButtonProps={{
          ...getSharedModalStyles(isLightTheme).okButtonProps,
          danger: true,
        }}
      >
        <div
          style={{
            paddingTop: 12,
            paddingBottom: 6,
            color: isLightTheme ? '#52525b' : '#a1a1aa',
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          {t(
            'playground_2026:album_delete_hint',
            '仅删除分类，资源本身不会被删除。',
          )}
        </div>
      </Modal>

      {dragState &&
        createPortal(
          <div
            className="pg-ig-drag-mouse-tag"
            style={{
              transform: `translate3d(${cursorPos.x + 14}px, ${
                cursorPos.y + 44 > window.innerHeight ? cursorPos.y - 34 : cursorPos.y + 14
              }px, 0)`,
            }}
          >
            <Folder size={14} className="pg-ig-drag-mouse-tag-icon" />
            <span className="pg-ig-drag-mouse-tag-name">{dragState.album.name}</span>
            <span className="pg-ig-drag-mouse-tag-badge">
              {t('playground_2026:reorder_drop_hint', '松开或点击放置')}
            </span>
          </div>,
          document.body,
        )}
    </>
  );
};

export default React.memo(PlaygroundSidebar);
