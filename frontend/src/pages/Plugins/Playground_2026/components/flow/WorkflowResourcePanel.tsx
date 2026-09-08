/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流左侧「资源」面板 — Tab/筛选对齐 FlowAssetLibraryModal；
 * 单击资源直接插入画布素材节点
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines } from 'lucide-react';
import { Spin, App } from '../../ui';
import toast from '../PlaygroundToast';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import { deleteAsset, listAssets } from '../../utils/assetsApi';
import { listAlbums, type WorkAlbum } from '../../utils/albumsApi';
import type { GeneratedImageItem } from '../../utils/imageGenStorage';
import {
  insertCanvasAssetFromPick,
  insertCanvasAssetsFromPicks,
  type FlowAssetPickResult,
} from '../../utils/insertCanvasAsset';
import {
  classifyWorkflowAssetFile,
  uploadResourceFileDetailed,
  uploadWorkflowAssetFile,
  type WorkflowAssetKind,
} from '../../utils/referenceUpload';
import { toResourceDisplayName } from '../../utils/resourceFileName';
import {
  resolveWorkflowNodeLimit,
  workflowNodeLimitMessage,
} from '../../utils/workflowNodeLimit';
import { FlowIconSearch, FlowIconUpload } from './flowIcons';
import FlowAssetFilterDropdown, { type AssetMediaFilter } from './FlowAssetFilterDropdown';
import WorkCardChrome from '../WorkCardChrome';
import '../WorksList.css';

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
};

function IconClose({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const WorkflowResourcePanel: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { modal, message: appMessage } = App.useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const { nodes, setNodes, maxZIndex, setMaxZIndex, canvasTransform } = useCanvas();
  const { saveCanvasState, currentProjectId, storageStats } = usePlayground();

  const [albums, setAlbums] = useState<WorkAlbum[]>([]);
  const [tab, setTab] = useState<TabKey>({ type: 'all' });
  const [items, setItems] = useState<GeneratedImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const requestSeq = useRef(0);

  const customAlbums = useMemo(() => albums.filter((a) => a.kind === 'custom'), [albums]);
  const favoritesAlbum = useMemo(() => albums.find((a) => a.kind === 'favorites'), [albums]);

  useEffect(() => {
    if (!open) return;
    setKeyword('');
  }, [open]);

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
        mediaFilter === 'all' ? 'all' : mediaFilter === 'video' ? 'video' : mediaFilter === 'audio' ? 'audio' : 'image';

      const list = await listAssets({
        mediaType,
        sourceType,
        status: 'done',
        albumId,
        sort: 'recent',
      });

      if (seq !== requestSeq.current) return;
      setItems(list.filter((it) => it.status === 'done' && it.previewUrl));
    } catch (e: any) {
      if (seq !== requestSeq.current) return;
      toast.error(e?.message || '加载资源失败');
      setItems([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [tab, mediaFilter, favoritesAlbum?.id]);

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

  const toPickResult = (it: GeneratedImageItem): FlowAssetPickResult | null => {
    if (!it.previewUrl) return null;
    const kind: WorkflowAssetKind =
      it.mediaType === 'video' ? 'video' : it.mediaType === 'audio' ? 'audio' : 'image';
    return {
      url: it.previewUrl,
      kind,
      fileName: toResourceDisplayName(it.prompt || it.id),
      source: 'library',
      resourceId: it.id,
      fileSize: it.fileSize,
    };
  };

  const insertPick = (pick: FlowAssetPickResult) => {
    const nodeLimit = resolveWorkflowNodeLimit(storageStats);
    const ok = insertCanvasAssetFromPick({
      pick,
      nodes,
      setNodes,
      maxZIndex,
      setMaxZIndex,
      canvasTransform,
      saveCanvasState,
      nodeLimit,
    });
    if (!ok) {
      toast.warning(workflowNodeLimitMessage(nodeLimit));
      return;
    }
  };

  const handleItemClick = (it: GeneratedImageItem) => {
    const pick = toPickResult(it);
    if (!pick) return;
    insertPick(pick);
  };

  const applyItemChange = useCallback((next: GeneratedImageItem) => {
    setItems((prev) => {
      let list = prev.map((x) => (x.id === next.id ? { ...x, ...next } : x));
      if (tab.type === 'favorites' && !next.isFavorited) {
        list = list.filter((x) => x.id !== next.id);
      }
      if (tab.type === 'album' && !(next.albumIds || []).includes(tab.albumId)) {
        list = list.filter((x) => x.id !== next.id);
      }
      return list;
    });
  }, [tab]);

  const handleDelete = (item: GeneratedImageItem) => {
    modal.confirm({
      title: t('playground_2026:works_delete_confirm', '确认删除此资源？'),
      okText: t('playground_2026:delete_work', '删除资源'),
      okType: 'danger',
      cancelText: t('common.cancel', '取消'),
      centered: true,
      onOk: async () => {
        try {
          await deleteAsset(item.id);
          setItems((prev) => prev.filter((it) => it.id !== item.id));
          appMessage.success(t('playground_2026:works_deleted', '已删除'));
        } catch {
          appMessage.error(t('playground_2026:works_delete_failed', '删除失败'));
          return Promise.reject();
        }
      },
    });
  };

  const handleUploadFiles = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList as FileList) : [];
    if (!files.length) return;
    setUploading(true);
    try {
      const picks: FlowAssetPickResult[] = [];
      for (const file of files) {
        const kind = classifyWorkflowAssetFile(file);
        if (!kind) {
          toast.warning('仅支持图片、视频、音频或文档');
          continue;
        }
        if (file.size > 30 * 1024 * 1024) {
          toast.warning(`${file.name} 超过 30MB`);
          continue;
        }
        let url: string;
        let resourceId: string | undefined;
        if (kind === 'image' || kind === 'video') {
          const uploaded = await uploadResourceFileDetailed(file);
          url = uploaded.url;
          resourceId = uploaded.resourceId;
        } else {
          const uploaded = await uploadWorkflowAssetFile(file, currentProjectId);
          url = uploaded.url;
          resourceId = uploaded.resourceId;
        }
        picks.push({
          url,
          kind,
          fileName: toResourceDisplayName(file.name),
          source: 'upload',
          mime: file.type,
          resourceId,
        });
      }
      const nodeLimit = resolveWorkflowNodeLimit(storageStats);
      const { count: inserted } = insertCanvasAssetsFromPicks({
        picks,
        nodes,
        setNodes,
        maxZIndex,
        setMaxZIndex,
        canvasTransform,
        saveCanvasState,
        nodeLimit,
      });
      if (inserted === 0 && picks.length > 0) {
        toast.warning(workflowNodeLimitMessage(nodeLimit));
      } else if (inserted > 0) {
        setTab({ type: 'uploads' });
        void refresh();
      }
    } catch (e: any) {
      toast.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tabActive = (key: TabKey) => {
    if (tab.type !== key.type) return false;
    if (key.type === 'album' && tab.type === 'album') return tab.albumId === key.albumId;
    return true;
  };

  if (!open) return null;

  return (
    <aside className="pg-flow-resource-panel" aria-label="资源">
      <div className="pg-flow-resource-panel-hd">
        <h2>资源</h2>
        <button type="button" className="pg-flow-resource-panel-close" onClick={onClose} aria-label="关闭">
          <IconClose />
        </button>
      </div>

      <div className="pg-flow-resource-panel-tabs">
        <button
          type="button"
          className={`pg-flow-assets-tab${tabActive({ type: 'all' }) ? ' is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab({ type: 'all' })}
        >
          {t('playground_2026:all_assets', '资产素材库')}
        </button>
        <button
          type="button"
          className={`pg-flow-assets-tab${tabActive({ type: 'works' }) ? ' is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab({ type: 'works' })}
        >
          作品
        </button>
        <button
          type="button"
          className={`pg-flow-assets-tab${tabActive({ type: 'uploads' }) ? ' is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab({ type: 'uploads' })}
        >
          上传
        </button>
        <button
          type="button"
          className={`pg-flow-assets-tab${tabActive({ type: 'favorites' }) ? ' is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab({ type: 'favorites' })}
        >
          {favoritesAlbum?.name || '收藏夹'}
        </button>
        {customAlbums.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`pg-flow-assets-tab${tabActive({ type: 'album', albumId: a.id, name: a.name }) ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab({ type: 'album', albumId: a.id, name: a.name })}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="pg-flow-resource-panel-tools">
        <label className="pg-flow-assets-search">
          <FlowIconSearch size={14} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索资源"
          />
        </label>
        <FlowAssetFilterDropdown value={mediaFilter} onChange={setMediaFilter} />
      </div>

      <div className="pg-flow-resource-panel-upload">
        <button
          type="button"
          className="pg-flow-resource-upload-btn"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Spin size="small" /> : <FlowIconUpload size={16} />}
          <span>{uploading ? '上传中…' : '上传资源'}</span>
        </button>
      </div>

      <div className={`pg-flow-resource-panel-grid-wrap${loading ? ' is-loading' : ''}`}>
        {visibleItems.length === 0 && !loading ? (
          <div className="pg-flow-assets-empty">暂无资源</div>
        ) : visibleItems.length === 0 && loading ? (
          <div className="pg-flow-assets-empty">
            <Spin />
          </div>
        ) : (
          <div className="pg-flow-resource-panel-grid">
            {visibleItems.map((it) => (
              <div
                key={it.id}
                className="pg-flow-resource-card hf-works-card"
                title="点击插入画布"
                role="button"
                tabIndex={0}
                onClick={() => handleItemClick(it)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(it);
                  }
                }}
              >
                {it.mediaType === 'video' ? (
                  <video src={it.previewUrl} muted preload="metadata" />
                ) : it.mediaType === 'audio' ? (
                  <div style={{ width: '100%', height: '100%', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
                    <AudioLines size={24} style={{ color: 'rgba(255,255,255,0.85)' }} />
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
                <div className="pg-flow-resource-card-name" title={toResourceDisplayName(it.prompt || it.id)}>
                  {toResourceDisplayName(it.prompt || it.id)}
                </div>
                <WorkCardChrome
                  item={it}
                  isLight={false}
                  hideOpen
                  onDelete={handleDelete}
                  onItemChange={applyItemChange}
                />
              </div>
            ))}
          </div>
        )}
        {loading && visibleItems.length > 0 && (
          <div className="pg-flow-assets-grid-loading" aria-hidden>
            <Spin size="small" />
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.rtf,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void handleUploadFiles(e.target.files)}
      />
    </aside>
  );
};

export default WorkflowResourcePanel;
