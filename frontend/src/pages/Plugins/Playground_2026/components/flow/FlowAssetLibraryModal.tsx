/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流「我的资源」弹窗 — 样式对齐 Imagine My Assets；
 * Tab 与创作中心 2026 侧栏资源子栏目一致（作品 / 上传 / 收藏夹 / 自定义分类）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AudioLines } from 'lucide-react';
import { Spin, DeleteOutlined } from '../../ui';
import toast from '../PlaygroundToast';
import { listAssets, deleteAsset } from '../../utils/assetsApi';
import { listAlbums, type WorkAlbum } from '../../utils/albumsApi';
import type { GeneratedImageItem } from '../../utils/imageGenStorage';
import type { FlowAssetPickResult } from '../../utils/insertCanvasAsset';
import { buildLocalFlowPicks } from '../../utils/deferredLocalUpload';
import type { WorkflowAssetKind } from '../../utils/referenceUpload';
import { toResourceDisplayName } from '../../utils/resourceFileName';
import { FlowIconSearch, FlowIconUpload } from '../flow/flowIcons';
import FlowAssetFilterDropdown, { type AssetMediaFilter } from './FlowAssetFilterDropdown';
import '../../styles/imagineFlow.css';

export type { FlowAssetPickResult };

type TabKey =
  | { type: 'all' }
  | { type: 'works' }
  | { type: 'uploads' }
  | { type: 'favorites' }
  | { type: 'album'; albumId: string; name: string };

type MediaFilter = AssetMediaFilter;

type Props = {
  open: boolean;
  onClose: () => void;
  /** 多选确认（至少 1 项） */
  onConfirm: (items: FlowAssetPickResult[]) => void;
  /** 已有素材时限制同类型 */
  constrainKind?: WorkflowAssetKind | null;
  /** 本次最多可选数量；达到后不可再勾选 / 上传截断 */
  maxSelect?: number;
  projectId?: number | null;
};

const ACCEPT =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function IconClose({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconPlayMini({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.92)" />
      <path d="M20 16.5v15l12-7.5-12-7.5z" fill="#1a1a1a" />
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

const FlowAssetLibraryModal: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  constrainKind = null,
  maxSelect,
  projectId: _projectId,
}) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [albums, setAlbums] = useState<WorkAlbum[]>([]);
  const [tab, setTab] = useState<TabKey>({ type: 'all' });
  const [items, setItems] = useState<GeneratedImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(
    constrainKind === 'video' ? 'video' : constrainKind === 'image' ? 'image' : constrainKind === 'audio' ? 'audio' : 'all',
  );
  /** 跨 Tab 保留多选 */
  const [selectedMap, setSelectedMap] = useState<Record<string, GeneratedImageItem>>({});
  const requestSeq = useRef(0);
  const selectCap =
    typeof maxSelect === 'number' && Number.isFinite(maxSelect)
      ? Math.max(0, Math.trunc(maxSelect))
      : null;

  const customAlbums = useMemo(
    () => albums.filter((a) => a.kind === 'custom'),
    [albums],
  );
  const favoritesAlbum = useMemo(
    () => albums.find((a) => a.kind === 'favorites'),
    [albums],
  );

  const filterLocked = constrainKind === 'image' || constrainKind === 'video';

  useEffect(() => {
    if (!open) return;
    setKeyword('');
    setSelectedMap({});
    setTab({ type: 'all' });
    setMediaFilter(
      constrainKind === 'video' ? 'video' : constrainKind === 'image' ? 'image' : 'all',
    );
  }, [open, constrainKind]);

  // 锁滚动，避免弹窗交互时页面/画布因滚动条显隐左右跳动
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  // Esc / 返回键关闭
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listAlbums();
        if (!cancelled) setAlbums(list);
      } catch {
        if (!cancelled) setAlbums([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      let albumId: string | undefined;
      let sourceType: 'work' | 'upload' | undefined;
      if (tab.type === 'all') {
        sourceType = undefined;
      } else if (tab.type === 'works') sourceType = 'work';
      else if (tab.type === 'uploads') sourceType = 'upload';
      else if (tab.type === 'favorites') {
        albumId = favoritesAlbum?.id;
        if (!albumId) {
          if (seq === requestSeq.current) {
            setItems([]);
            setLoading(false);
          }
          return;
        }
      } else if (tab.type === 'album') {
        albumId = tab.albumId;
      }

      const mediaType =
        mediaFilter === 'all'
          ? 'all'
          : mediaFilter === 'video'
            ? 'video'
            : mediaFilter === 'audio'
              ? 'audio'
              : 'image';

      const list = await listAssets({
        mediaType,
        sourceType,
        status: 'done',
        albumId,
        sort: 'recent',
      });

      if (seq !== requestSeq.current) return;

      let next = list.filter((it) => it.status === 'done' && it.previewUrl);
      if (constrainKind === 'image') next = next.filter((it) => it.mediaType !== 'video' && it.mediaType !== 'audio');
      if (constrainKind === 'video') next = next.filter((it) => it.mediaType === 'video');
      if (constrainKind === 'audio') next = next.filter((it) => it.mediaType === 'audio');
      setItems(next);
    } catch (e: any) {
      if (seq !== requestSeq.current) return;
      toast.error(e?.message || '加载资源失败');
      setItems([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [tab, mediaFilter, favoritesAlbum?.id, constrainKind]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const visibleItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      (it) =>
        (it.prompt || '').toLowerCase().includes(kw) ||
        (it.model || '').toLowerCase().includes(kw),
    );
  }, [items, keyword]);

  const selectedItems = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectedCount = selectedItems.length;

  const toggleSelect = (it: GeneratedImageItem) => {
    setSelectedMap((prev) => {
      if (prev[it.id]) {
        const next = { ...prev };
        delete next[it.id];
        return next;
      }
      if (selectCap != null && Object.keys(prev).length >= selectCap) {
        toast.warning(
          t('playground_2026:io_select_limit', '最多再选 {{n}} 个', { n: selectCap }),
        );
        return prev;
      }
      return { ...prev, [it.id]: it };
    });
  };

  const toPickResult = (it: GeneratedImageItem): FlowAssetPickResult | null => {
    if (!it.previewUrl) return null;
    const kind: WorkflowAssetKind =
      it.mediaType === 'video' ? 'video' : it.mediaType === 'audio' ? 'audio' : 'image';
    if (constrainKind && kind !== constrainKind) return null;
    return {
      url: it.previewUrl,
      kind,
      fileName: toResourceDisplayName(it.prompt || it.id),
      source: 'library',
      resourceId: it.id,
      fileSize: it.fileSize,
    };
  };

  /** 选本地文件：不实际上传，直接应用并关闭弹窗 */
  const handleUploadFiles = (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as FileList) : [];
    if (!files.length) return;
    setUploading(true);
    try {
      const capped =
        selectCap != null && files.length > selectCap ? files.slice(0, selectCap) : files;
      if (selectCap != null && files.length > selectCap) {
        toast.warning(
          t('playground_2026:io_select_limit', '最多再选 {{n}} 个', { n: selectCap }),
        );
      }
      const { picks, warnings } = buildLocalFlowPicks(capped, {
        constrainKind,
        maxBytes: 30 * 1024 * 1024,
      });
      for (const w of Array.from(new Set(warnings))) {
        toast.warning(w);
      }
      if (!picks.length) return;
      onConfirm(picks);
      onClose();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmSelected = () => {
    let picks = selectedItems
      .map(toPickResult)
      .filter(Boolean) as FlowAssetPickResult[];
    if (!picks.length) return;
    if (constrainKind && picks.some((p) => p.kind !== constrainKind)) {
      toast.warning('请选择与当前素材相同类型的资源');
      return;
    }
    if (selectCap != null && picks.length > selectCap) {
      picks = picks.slice(0, selectCap);
      toast.warning(
        t('playground_2026:io_select_limit', '最多再选 {{n}} 个', { n: selectCap }),
      );
    }
    onConfirm(picks);
    onClose();
  };

  const tabActive = (key: TabKey) => {
    if (tab.type !== key.type) return false;
    if (key.type === 'album' && tab.type === 'album') return tab.albumId === key.albumId;
    return true;
  };

  const switchTab = (next: TabKey) => {
    setTab(next);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="pg-flow-assets-modal-root"
      role="dialog"
      aria-modal="true"
      aria-label="我的资源"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="pg-flow-assets-modal-mask" onClick={onClose} />
      <div className="pg-flow-assets-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pg-flow-assets-modal-hd">
          <h2>我的资源</h2>
          <button type="button" className="pg-flow-assets-modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>

        <div
          className={`pg-flow-assets-upload${dragOver ? ' is-dragover' : ''}${uploading ? ' is-busy' : ''}`}
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleUploadFiles(e.dataTransfer.files);
          }}
        >
          {uploading ? (
            <>
              <Spin />
              <p className="pg-flow-assets-upload-title">处理中…</p>
            </>
          ) : (
            <>
              <span className="pg-flow-assets-upload-icon" aria-hidden>
                <FlowIconUpload size={28} />
              </span>
              <p className="pg-flow-assets-upload-title">点击上传或拖拽到此处</p>
              <p className="pg-flow-assets-upload-sub">
                支持图片、视频、音频及文档，最大 30MB；先本地预览，生成时再上传
              </p>
            </>
          )}
        </div>

        <div className="pg-flow-assets-toolbar">
          <div className="pg-flow-assets-tabs">
            <button
              type="button"
              className={`pg-flow-assets-tab${tabActive({ type: 'all' }) ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab({ type: 'all' })}
            >
              {t('playground_2026:all_assets', '资产素材库')}
            </button>
            <button
              type="button"
              className={`pg-flow-assets-tab${tabActive({ type: 'works' }) ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab({ type: 'works' })}
            >
              作品
            </button>
            <button
              type="button"
              className={`pg-flow-assets-tab${tabActive({ type: 'uploads' }) ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab({ type: 'uploads' })}
            >
              上传
            </button>
            <button
              type="button"
              className={`pg-flow-assets-tab${tabActive({ type: 'favorites' }) ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => switchTab({ type: 'favorites' })}
            >
              {favoritesAlbum?.name || '收藏夹'}
            </button>
            {customAlbums.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`pg-flow-assets-tab${tabActive({ type: 'album', albumId: a.id, name: a.name }) ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => switchTab({ type: 'album', albumId: a.id, name: a.name })}
              >
                {a.name}
              </button>
            ))}
          </div>

          <div className="pg-flow-assets-tools">
            <label className="pg-flow-assets-search">
              <FlowIconSearch size={14} />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索资源"
              />
            </label>

            <FlowAssetFilterDropdown
              value={mediaFilter}
              disabled={filterLocked}
              onChange={setMediaFilter}
            />
          </div>
        </div>

        <div className={`pg-flow-assets-grid-wrap${loading ? ' is-loading' : ''}`}>
          {visibleItems.length === 0 && !loading ? (
            <div className="pg-flow-assets-empty">暂无资源</div>
          ) : visibleItems.length === 0 && loading ? (
            <div className="pg-flow-assets-empty">
              <Spin />
            </div>
          ) : (
            <div className="pg-flow-assets-grid">
              {visibleItems.map((it) => {
                const active = !!selectedMap[it.id];
                const handlePickDirect = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  const pick = toPickResult(it);
                  if (pick) {
                    onConfirm([pick]);
                    onClose();
                  }
                };
                const handleDelete = async (e: React.MouseEvent) => {
                  e.stopPropagation();
                  try {
                    await deleteAsset(it.id);
                    setItems((prev) => prev.filter((x) => x.id !== it.id));
                    setSelectedMap((prev) => {
                      if (!prev[it.id]) return prev;
                      const next = { ...prev };
                      delete next[it.id];
                      return next;
                    });
                    toast.success('已删除素材');
                  } catch (err: any) {
                    toast.error(err?.message || '删除失败');
                  }
                };

                return (
                  <div
                    key={it.id}
                    className={`pg-flow-assets-card${active ? ' is-selected' : ''}`}
                    onClick={handlePickDirect}
                  >
                    {it.mediaType === 'video' ? (
                      <>
                        <video
                          src={it.previewUrl}
                          muted
                          playsInline
                          preload="metadata"
                          disablePictureInPicture
                          controlsList="nodownload nofullscreen noremoteplayback nopictureinpicture"
                        />
                        <span className="pg-flow-assets-card-play" aria-hidden>
                          <IconPlayMini />
                        </span>
                      </>
                    ) : it.mediaType === 'audio' ? (
                      <div style={{ width: '100%', height: '100%', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
                        <AudioLines size={28} style={{ color: 'rgba(255,255,255,0.85)' }} />
                      </div>
                    ) : (
                      <img src={it.previewUrl} alt="" />
                    )}
                    <div className="pg-ig-badge">
                      {it.mediaType === 'video'
                        ? t('playground_2026:videos', '视频')
                        : it.mediaType === 'audio'
                          ? t('playground_2026:audio', '声音')
                          : t('playground_2026:images', '图片')}
                    </div>
                    <button
                      type="button"
                      className="pg-flow-assets-card-del"
                      title={t('common.delete', '删除')}
                      onClick={handleDelete}
                    >
                      <DeleteOutlined />
                    </button>
                    <div className="pg-flow-assets-card-overlay">
                      <button
                        type="button"
                        className="pg-flow-assets-card-select-btn"
                        onClick={handlePickDirect}
                      >
                        {t('playground_2026:select_resource', '选择资源')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {loading && visibleItems.length > 0 && (
            <div className="pg-flow-assets-grid-loading" aria-hidden>
              <Spin />
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={
            constrainKind === 'image'
              ? 'image/*'
              : constrainKind === 'video'
                ? 'video/*'
                : constrainKind === 'audio'
                  ? 'audio/*'
                  : constrainKind === 'document'
                    ? '.pdf,.doc,.docx,.txt,.md,.rtf,application/pdf'
                    : ACCEPT
          }
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void handleUploadFiles(e.target.files)}
        />
      </div>
    </div>,
    document.body,
  );
};

export default FlowAssetLibraryModal;
