/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 作品页：所有作品 / 收藏夹 / 自定义分类（Imagine.art 暗色 L1）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, LayoutGrid, List, Image, Video, Upload, ChevronDown, AudioLines } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../../../store/theme';
import type { GeneratedImageItem } from '../utils/imageGenStorage';
import { deleteAsset, listAssets, type AssetMediaType } from '../utils/assetsApi';
import { resumeUnpersistedOutputs } from '../utils/outputPersist';
import { uploadResourceFileDetailed } from '../utils/referenceUpload';
import { listAlbums, addAssetsToAlbum, type WorkAlbum } from '../utils/albumsApi';
import MasonryColumns from './MasonryColumns';
import GeneratingCardProgress from './GeneratingCardProgress';
import SmoothMediaPreview from './SmoothMediaPreview';
import ImageDetailOverlay from './ImageDetailOverlay';
import { groupItemsByDay } from '../utils/groupImagesByDay';
import { formatWorkCardTime } from '../utils/workCardHelpers';
import WorkCardChrome from './WorkCardChrome';
import ToolbarMenuPop from './ToolbarMenuPop';
import { saveImageGenSeed } from '../utils/imageGenSeed';
import { saveVideoGenSeed } from '../utils/videoGenSeed';
import { useDebouncedSearchKeyword } from '../hooks/useDebouncedSearchKeyword';
import { Modal, message } from '../ui';
import '../styles/imagineShell.css';
import './WorksList.css';

export type WorksListMode = 'all' | 'favorites' | 'album';

type WorksListProps = {
  mode: WorksListMode;
  sourceType?: 'work' | 'upload';
  albumId?: string;
  albums?: WorkAlbum[];
  title: string;
  description?: string;
  /** 侧栏分类变更后回调（新建分类等） */
  onAlbumsChange?: () => void;
};

type SortBy = 'recent' | 'oldest' | 'name';
type ViewMode = 'grid' | 'list';
type MediaFilter = AssetMediaType;

const WorksList: React.FC<WorksListProps> = ({
  mode,
  sourceType,
  albumId,
  albums,
  title,
  description,
  onAlbumsChange,
}) => {
  const { themeMode } = useThemeStore();
  const { t, i18n } = useTranslation();
  const [albumsState, setAlbumsState] = useState<WorkAlbum[]>(albums || []);
  const isLight = themeMode === 'light';
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const isMobile = viewportWidth <= 768;
  const [items, setItems] = useState<GeneratedImageItem[]>([]);
  const [listReady, setListReady] = useState(false);
  const { searchKeyword, searchInputProps } = useDebouncedSearchKeyword();
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [detailItem, setDetailItem] = useState<GeneratedImageItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!sortOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const inPop = t instanceof Element && t.closest('.pg-ig-wf-menu-pop');
      if (inPop) return;
      if (sortOpen && sortRef.current && !sortRef.current.contains(t)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sortOpen]);

  useEffect(() => {
    if (albums && albums.length > 0) {
      setAlbumsState(albums);
    }
  }, [albums]);

  const refresh = useCallback(async () => {
    try {
      const albumList = await listAlbums();
      setAlbumsState(albumList);
      const fav = albumList.find((a) => a.kind === 'favorites');
      const resolvedAlbumId =
        mode === 'favorites' ? fav?.id : mode === 'album' ? albumId : undefined;
      if (mode === 'favorites' && !fav?.id) {
        setItems([]);
        return;
      }
      if (mode === 'album' && !albumId) {
        setItems([]);
        return;
      }
      const list = await listAssets({
        mediaType: mediaFilter,
        sourceType: sourceType || undefined,
        status: 'done',
        albumId: resolvedAlbumId,
        sort: 'recent',
      });
      setItems(list);
      void resumeUnpersistedOutputs({
        items: list,
        onLocalUpdate: (id, next) => {
          setItems((prev) => {
            if (!next || next.status !== 'done' || !next.previewUrl) {
              return prev.filter((it) => it.id !== id);
            }
            return prev.map((it) => (it.id === id ? { ...it, ...next } : it));
          });
        },
      });
    } catch (e) {
      console.warn('[works] 加载资源失败', e);
    } finally {
      setListReady(true);
    }
  }, [mode, albumId, sourceType, mediaFilter]);

  useEffect(() => {
    setListReady(false);
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    let list = items.filter((it) => {
      if (!kw) return true;
      return it.prompt.toLowerCase().includes(kw) || (it.model || '').toLowerCase().includes(kw);
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return a.prompt.localeCompare(b.prompt);
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      return b.createdAt - a.createdAt;
    });
    return list;
  }, [items, searchKeyword, sortBy]);

  const dayGroups = useMemo(
    () =>
      groupItemsByDay(filtered, {
        locale: i18n.language,
        order: 'desc',
        todayLabel: t('playground_2026:day_today', '今天'),
        yesterdayLabel: t('playground_2026:day_yesterday', '昨天'),
      }),
    [filtered, i18n.language, t],
  );

  const formatTime = (ts: number) => formatWorkCardTime(ts, i18n.language);

  const canUpload = mode === 'all' || sourceType === 'upload' || mode === 'album';

  useEffect(() => {
    const handleAssetsRefresh = (e: any) => {
      if (e?.detail?.source === 'works-list') return;
      void refresh();
    };
    window.addEventListener('pg-assets-refresh', handleAssetsRefresh);
    return () => {
      window.removeEventListener('pg-assets-refresh', handleAssetsRefresh);
    };
  }, [refresh]);

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !canUpload) return;
      setUploading(true);
      try {
        const uploadedAssetIds: string[] = [];
        for (const file of Array.from(files)) {
          const res = await uploadResourceFileDetailed(file);
          if (res.resourceId) {
            uploadedAssetIds.push(res.resourceId);
          }
        }
        if (mode === 'album' && albumId && uploadedAssetIds.length > 0) {
          await addAssetsToAlbum(albumId, uploadedAssetIds);
          onAlbumsChange?.();
        }
        await refresh();
        window.dispatchEvent(
          new CustomEvent('pg-assets-refresh', { detail: { source: 'works-list' } }),
        );
        message.success(t('playground_2026:upload_success', '上传成功'));
      } catch (e: any) {
        message.error(e?.message || t('playground_2026:upload_failed', '上传失败'));
      } finally {
        setUploading(false);
        if (uploadInputRef.current) uploadInputRef.current.value = '';
      }
    },
    [refresh, canUpload, mode, albumId, onAlbumsChange, t],
  );

  const searchPlaceholder = t('playground_2026:search_placeholder_short', '搜索...');

  const emptyTitle =
    searchKeyword
      ? sourceType === 'upload'
        ? t('playground_2026:uploads_search_empty', '没有匹配的上传')
        : sourceType === 'work'
          ? t('playground_2026:works_search_empty', '没有匹配的作品')
          : mode === 'album'
            ? t('playground_2026:album_search_empty', '该分类下没有匹配的资源')
            : t('playground_2026:assets_search_empty', '没有匹配的资源')
      : sourceType === 'upload'
        ? t('playground_2026:uploads_empty', '暂无上传')
        : sourceType === 'work'
          ? t('playground_2026:works_empty', '暂无作品')
          : mode === 'album'
            ? t('playground_2026:album_empty', '当前分类暂无资源')
            : t('playground_2026:assets_empty', '暂无资源');

  const sortLabel =
    sortBy === 'recent'
      ? t('playground_2026:sort_recent_short', '最近')
      : sortBy === 'oldest'
        ? t('playground_2026:sort_oldest_short', '最早')
        : t('playground_2026:sort_name_short', '名称');


  const handleDelete = (e: React.MouseEvent | null, id: string) => {
    e?.stopPropagation();
    Modal.confirm({
      title: t('playground_2026:works_delete_confirm', '确认删除此资源？'),
      okText: t('playground_2026:delete_work', '删除资源'),
      okType: 'danger',
      cancelText: t('common.cancel', '取消'),
      centered: true,
      onOk: async () => {
        try {
          await deleteAsset(id);
          setItems((prev) => prev.filter((it) => it.id !== id));
          message.success(t('playground_2026:works_deleted', '已删除'));
        } catch {
          message.error(t('playground_2026:works_delete_failed', '删除失败'));
          return Promise.reject();
        }
      },
    });
  };

  const applyItemChange = useCallback(
    (next: GeneratedImageItem) => {
      setItems((prev) => {
        let list = prev.map((x) => (x.id === next.id ? { ...x, ...next } : x));
        if (mode === 'favorites' && !next.isFavorited) {
          list = list.filter((x) => x.id !== next.id);
        }
        if (mode === 'album' && albumId && !(next.albumIds || []).includes(albumId)) {
          list = list.filter((x) => x.id !== next.id);
        }
        return list;
      });
    },
    [mode, albumId],
  );

  const renderMediaPreview = (it: GeneratedImageItem) => {
    if (it.status === 'pending') {
      return (
        <GeneratingCardProgress
          createdAt={it.createdAt}
          label={
            it.mediaType === 'video'
              ? t('playground_2026:video_gen_pending', '生成中…')
              : it.mediaType === 'audio'
                ? t('playground_2026:audio_gen_pending', '音频生成中…')
                : t('playground_2026:image_gen_pending', '生成中…')
          }
        />
      );
    }
    if (!it.previewUrl) {
      return it.mediaType === 'video' ? (
        <Video size={28} style={{ opacity: 0.45 }} />
      ) : it.mediaType === 'audio' ? (
        <AudioLines size={28} style={{ opacity: 0.45 }} />
      ) : (
        <Image size={28} style={{ opacity: 0.45 }} />
      );
    }
    return (
      <SmoothMediaPreview
        src={it.previewUrl}
        alt={it.prompt}
        mediaType={it.mediaType || 'image'}
      />
    );
  };

  const renderGridCard = (it: GeneratedImageItem) => {
    const canOpen = it.status === 'done' || !!it.previewUrl;
    return (
      <article
        key={it.id}
        className="hf-ig-card hf-works-card"
        onClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (
            target?.closest('.hf-works-card-actions-tr') ||
            target?.closest('.hf-works-card-fav') ||
            target?.closest('.pg-ui-menu') ||
            target?.closest('.pg-ui-menu-item') ||
            target?.closest('.pg-ui-modal') ||
            target?.closest('.pg-ui-modal-overlay') ||
            target?.closest('[role="menu"]') ||
            target?.closest('[role="menuitem"]') ||
            target?.closest('[role="dialog"]')
          ) {
            return;
          }
          if (canOpen) setDetailItem(it);
        }}
        style={{ cursor: canOpen ? 'pointer' : 'default', position: 'relative', width: '100%' }}
      >
        <div className="hf-ig-card-media" style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
          {renderMediaPreview(it)}

          <div className="pg-ig-badge">
            {it.mediaType === 'video'
              ? t('playground_2026:videos', '视频')
              : it.mediaType === 'audio'
                ? t('playground_2026:audio', '声音')
                : t('playground_2026:images', '图片')}
          </div>

          <WorkCardChrome
            item={it}
            isLight={isLight}
            albums={albumsState}
            alwaysShowActions={false}
            onOpen={(item) => {
              if (item.status === 'done' || item.previewUrl) setDetailItem(item);
            }}
            onDelete={(item) => handleDelete(null, item.id)}
            onAlbumsChange={onAlbumsChange}
            onItemChange={applyItemChange}
          />
        </div>
      </article>
    );
  };

  const currentDetailIndex = detailItem ? filtered.findIndex((it) => it.id === detailItem.id) : -1;
  const hasPrevDetail = currentDetailIndex > 0;
  const hasNextDetail = currentDetailIndex >= 0 && currentDetailIndex < filtered.length - 1;

  return (
    <div
      className="pg-ig-works"
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div className="pg-ig-wf-header">
        <div className="pg-ig-wf-header-text">
          <h1 className="pg-ig-page-title">{title}</h1>
          {description ? <p className="pg-ig-page-desc">{description}</p> : null}
        </div>
      </div>

      <div className="pg-ig-toolbar pg-ig-wf-toolbar">
        <div className="pg-ui-segmented" style={{ marginRight: 'auto' }}>
          {(
            [
              ['all', t('playground_2026:filter_all', '全部')],
              ['image', t('playground_2026:images', '图片')],
              ['video', t('playground_2026:videos', '视频')],
              ['audio', t('playground_2026:audio', '声音')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="pg-ui-segmented-item"
              data-active={mediaFilter === key}
              onClick={() => setMediaFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pg-ig-search pg-ig-wf-search">
          <Search aria-hidden />
          <input
            type="search"
            placeholder={searchPlaceholder}
            {...searchInputProps}
          />
        </div>

        {canUpload ? (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void handleUploadFiles(e.target.files)}
            />
            <button
              type="button"
              className="pg-ig-wf-sort-btn"
              disabled={uploading}
              style={{ opacity: uploading ? 0.6 : 1 }}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={16} strokeWidth={1.75} />
              {uploading
                ? t('common.loading', '加载中...')
                : t('playground_2026:upload_resource', '上传文件')}
            </button>
          </>
        ) : null}

        <div ref={sortRef} className="pg-ig-wf-sort" style={{ position: 'relative' }}>
          <button
            type="button"
            className="pg-ig-wf-sort-btn"
            onClick={() => {
              setSortOpen((v) => !v);
            }}
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
          >
            {sortLabel}
            <ChevronDown size={14} strokeWidth={1.75} />
          </button>
          <ToolbarMenuPop
            open={sortOpen}
            anchorRef={sortRef}
            onDismiss={() => setSortOpen(false)}
          >
            {(
              [
                ['recent', t('playground_2026:sort_recent', '最近更新')],
                ['oldest', t('playground_2026:sort_oldest', '最早创建')],
                ['name', t('playground_2026:sort_name', '名称排序')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={sortBy === key}
                className={sortBy === key ? 'is-active' : undefined}
                onClick={() => {
                  setSortBy(key);
                  setSortOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </ToolbarMenuPop>
        </div>

        <div className="pg-ig-seg">
          <button
            type="button"
            className={viewMode === 'grid' ? 'is-active' : undefined}
            title={t('playground_2026:grid_layout', '网格布局')}
            aria-label={t('playground_2026:grid_layout', '网格布局')}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'is-active' : undefined}
            title={t('playground_2026:list_layout', '列表布局')}
            aria-label={t('playground_2026:list_layout', '列表布局')}
            onClick={() => setViewMode('list')}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {!listReady ? (
        <div className="pg-ig-empty">
          <p>{t('common.loading', '加载中...')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="pg-ig-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <h3 style={{ margin: 0 }}>{emptyTitle}</h3>
          {canUpload && (
            <button
              type="button"
              className="pg-ig-wf-sort-btn"
              disabled={uploading}
              style={{
                opacity: uploading ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 16px',
                cursor: 'pointer',
              }}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={16} strokeWidth={1.75} />
              {uploading
                ? t('common.loading', '加载中...')
                : t('playground_2026:upload_resource', '上传文件')}
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {dayGroups.map((g) => (
            <div key={g.key}>
              <div className="pg-ig-day">{g.label}</div>
              <MasonryColumns minColumnWidth={isMobile ? 140 : 220} gap={isMobile ? 8 : 14}>
                {g.items.map((it) => renderGridCard(it))}
              </MasonryColumns>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {filtered.map((it) => {
            const canOpen = it.status === 'done' || !!it.previewUrl;
            return (
              <div
                key={it.id}
                className="pg-ig-card"
                onClick={(e) => {
                  const target = e.target as HTMLElement | null;
                  if (
                    target?.closest('.hf-works-card-actions-tr') ||
                    target?.closest('.hf-works-card-fav') ||
                    target?.closest('.pg-ui-menu') ||
                    target?.closest('.pg-ui-menu-item') ||
                    target?.closest('.pg-ui-modal') ||
                    target?.closest('.pg-ui-modal-overlay') ||
                    target?.closest('[role="menu"]') ||
                    target?.closest('[role="menuitem"]') ||
                    target?.closest('[role="dialog"]')
                  ) {
                    return;
                  }
                  if (canOpen) setDetailItem(it);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? 'minmax(0, 1fr) auto'
                    : 'minmax(240px, 3fr) 1fr 1fr 100px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  marginBottom: 6,
                  borderRadius: 5,
                  transform: 'none',
                  cursor: canOpen ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div
                    className="pg-ig-card-media"
                    style={{
                      width: 54,
                      height: 32,
                      borderRadius: 5,
                      flexShrink: 0,
                    }}
                  >
                    {renderMediaPreview(it)}
                  </div>
                  <span className="pg-ig-card-title" style={{ marginBottom: 0, WebkitLineClamp: 1 }}>
                    {it.prompt || t('playground_2026:works_untitled', '未命名作品')}
                  </span>
                </div>
                {!isMobile ? (
                  <>
                    <div className="pg-ig-card-meta">
                      {it.mediaType === 'video'
                        ? t('playground_2026:videos', '视频')
                        : it.mediaType === 'audio'
                          ? t('playground_2026:audio', '声音')
                          : t('playground_2026:images', '图片')}
                    </div>
                    <div className="pg-ig-card-meta">{formatTime(it.createdAt)}</div>
                  </>
                ) : null}
                <div
                  style={{
                    position: 'relative',
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <WorkCardChrome
                    item={it}
                    isLight={isLight}
                    albums={albumsState}
                    alwaysShowActions
                    listMode
                    onOpen={(item) => {
                      if (item.status === 'done' || item.previewUrl) setDetailItem(item);
                    }}
                    onDelete={(item) => handleDelete(null, item.id)}
                    onAlbumsChange={onAlbumsChange}
                    onItemChange={applyItemChange}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ImageDetailOverlay
        item={detailItem}
        open={!!detailItem}
        mediaType={
          detailItem?.mediaType === 'video'
            ? 'video'
            : detailItem?.mediaType === 'audio'
              ? 'audio'
              : 'image'
        }
        onClose={() => setDetailItem(null)}
        hasPrev={hasPrevDetail}
        hasNext={hasNextDetail}
        onPrev={() => {
          if (hasPrevDetail) setDetailItem(filtered[currentDetailIndex - 1]);
        }}
        onNext={() => {
          if (hasNextDetail) setDetailItem(filtered[currentDetailIndex + 1]);
        }}
        onDelete={(it) => handleDelete(null, it.id)}
        onReferenceImage={(it) => {
          if (!it.previewUrl) return;
          saveImageGenSeed({
            referenceUrls: [it.previewUrl],
            autoGenerate: false,
          });
          window.open('/playground-2026/images', '_blank');
        }}
        onReferenceVideo={(it) => {
          if (!it.previewUrl) return;
          saveVideoGenSeed({
            referenceUrls: [it.previewUrl],
            autoGenerate: false,
          });
          window.open('/playground-2026/videos', '_blank');
        }}
      />
    </div>
  );
};

export default React.memo(WorksList);
