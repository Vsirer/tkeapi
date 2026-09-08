/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工具 · 工作流列表（Imagine.art 暗色 L1，数据走 /playground-2026/workflows）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../../../store/auth';
import { useThemeStore } from '../../../../store/theme';
import { solidAccent } from '../../../../theme/tokens';
import { useDebouncedSearchKeyword } from '../hooks/useDebouncedSearchKeyword';
import { formatApiDateTime, parseApiTimeAsUtc } from '../../../../utils/timedisplay';
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  renameWorkflow,
  type WorkflowItem,
} from '../utils/workflowsApi';
import { openWorkflowInNewTab } from '../utils/openWorkflowTab';
import { Modal } from '../ui';
import toast from './PlaygroundToast';
import ToolbarMenuPop from './ToolbarMenuPop';
import '../styles/imagineShell.css';

const formatDateZh = (dateStr: string) => formatApiDateTime(dateStr, 'YYYY年M月D日');

const getRelativeTimeAgo = (dateStr: string, currentLang: string, nowMs = Date.now()) => {
  const date = parseApiTimeAsUtc(dateStr);
  if (!date) return '';
  const diffMs = Math.max(0, nowMs - date.getTime());
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isZh = currentLang.toLowerCase().startsWith('zh');
  if (diffMins < 1) return isZh ? '刚刚' : 'just now';
  if (diffMins < 60) {
    return isZh
      ? `${diffMins} 分钟前`
      : `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return isZh
      ? `${diffHours} 小时前`
      : `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 30) {
    return isZh
      ? `${diffDays} 天前`
      : `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  return formatDateZh(dateStr);
};

type MenuKey = 'rename' | 'delete';

/** 对齐 Imagine Flow Projects：封面约 4:3 */
const WF_CARD_MEDIA_ASPECT = '4 / 3';

const resolveCoverUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http')) return url;
  if (url.startsWith('/')) {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || '';
    return `${base}${url}`;
  }
  return `https://${url}`;
};

const WorkflowList: React.FC<{
  /** 创建/删除等工作流数量变化时回调（刷新侧栏额度） */
  onWorkflowsChange?: () => void | Promise<void>;
  workflowMenuTitle?: string;
}> = ({ onWorkflowsChange, workflowMenuTitle }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const avatarAccent = solidAccent(isLight ? 'light' : 'dark');
  const { searchKeyword, searchInputProps } = useDebouncedSearchKeyword();
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const creatingLockRef = React.useRef(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const isMobile = viewportWidth <= 768;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!sortOpen && menuOpenId == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const inPop = t instanceof Element && t.closest('.pg-ig-wf-menu-pop');
      if (sortOpen && !inPop && sortRef.current && !sortRef.current.contains(t)) {
        setSortOpen(false);
      }
      if (menuOpenId != null && menuRef.current && !menuRef.current.contains(t)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sortOpen, menuOpenId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listWorkflows();
      setItems(list);
      void onWorkflowsChange?.();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ||
          t('playground_2026:workflow_load_failed', '加载工作流失败'),
      );
    } finally {
      setLoading(false);
    }
  }, [t, onWorkflowsChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (creatingLockRef.current || isCreating) return;
    creatingLockRef.current = true;
    setIsCreating(true);
    try {
      const created = await createWorkflow(
        t('playground_2026:untitled_workflow', '未命名工作流'),
      );
      await refresh();
      // 新标签打开；会同步 session 登录态（代理登录），避免「工作流不存在」
      openWorkflowInNewTab(`/playground-2026/workflows/${created.id}`);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ||
          e?.message ||
          t('playground_2026:workflow_create_failed', '创建工作流失败'),
      );
    } finally {
      creatingLockRef.current = false;
      setIsCreating(false);
    }
  };

  const handleOpen = (id: number) => {
    openWorkflowInNewTab(`/playground-2026/workflows/${id}`);
  };

  const handleRename = async (id: number) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      await renameWorkflow(id, name);
      await refresh();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.error?.message ||
          t('playground_2026:workflow_rename_failed', '重命名失败'),
      );
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: t('playground_2026:workflow_delete_confirm', '确认删除此工作流？'),
      okText: t('playground_2026:delete', '删除'),
      okType: 'danger',
      cancelText: t('common.cancel', '取消'),
      centered: true,
      onOk: async () => {
        try {
          await deleteWorkflow(id);
          await refresh();
        } catch (e: any) {
          toast.error(
            e?.response?.data?.error?.message ||
              t('playground_2026:workflow_delete_failed', '删除失败'),
          );
          return Promise.reject();
        }
      },
    });
  };

  const onMenuAction = (key: MenuKey, item: WorkflowItem) => {
    setMenuOpenId(null);
    if (key === 'rename') {
      setEditingId(item.id);
      setEditingName(item.name);
    } else if (key === 'delete') handleDelete(item.id);
  };

  const filtered = useMemo(() => {
    const list = items.filter(
      (p) => !searchKeyword || p.name.toLowerCase().includes(searchKeyword.toLowerCase()),
    );
    if (sortBy === 'recent') {
      return list.sort((a, b) => {
        const getMs = (dateStr: string) => parseApiTimeAsUtc(dateStr)?.getTime() ?? 0;
        return getMs(b.updated_at || b.created_at) - getMs(a.updated_at || a.created_at);
      });
    }
    if (sortBy === 'oldest') {
      return list.sort((a, b) => {
        const getMs = (dateStr: string) => parseApiTimeAsUtc(dateStr)?.getTime() ?? 0;
        return getMs(a.created_at) - getMs(b.created_at);
      });
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
  }, [items, searchKeyword, sortBy]);

  const sortLabel =
    sortBy === 'recent'
      ? t('playground_2026:sort_recent_short', '最近')
      : sortBy === 'oldest'
        ? t('playground_2026:sort_oldest_short', '最早')
        : t('playground_2026:sort_name_short', '名称');

  const userLabel = user?.nickname || user?.username || 'User';
  const userInitial = user?.nickname?.[0] || user?.username?.[0] || 'U';

  const renderMenu = (item: WorkflowItem) => (
    <div
      ref={menuOpenId === item.id ? menuRef : undefined}
      style={{ position: 'relative' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="pg-ig-icon-btn"
        aria-label={t('common.more', '更多')}
        aria-expanded={menuOpenId === item.id}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpenId((id) => (id === item.id ? null : item.id));
          setSortOpen(false);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpenId === item.id ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 'calc(100% + 6px)',
            zIndex: 20,
            minWidth: 160,
            padding: 6,
            borderRadius: 12,
            border: '1px solid var(--ig-border, rgba(255,255,255,0.08))',
            background: 'var(--ig-bg-elevated, #121214)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          }}
        >
          {(
            [
              [
                'rename',
                t('playground_2026:rename', '重命名'),
                <Pencil size={14} key="rename" />,
              ],
              [
                'delete',
                t('common.delete', '删除'),
                <Trash2 size={14} key="delete" />,
              ],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onMenuAction(key, item);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                background: 'transparent',
                color: key === 'delete' ? '#f87171' : 'var(--ig-text, #f5f5f6)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ig-surface-hover, #1c1c1f)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderNameEdit = (item: WorkflowItem, compact?: boolean) =>
    editingId === item.id ? (
      <input
        className="pg-ig-input"
        value={editingName}
        autoFocus
        maxLength={24}
        onChange={(e) => setEditingName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleRename(item.id);
          if (e.key === 'Escape') setEditingId(null);
        }}
        onBlur={() => void handleRename(item.id)}
        onClick={(e) => e.stopPropagation()}
        style={{
          height: 28,
          fontSize: 14,
          marginBottom: compact ? 0 : 2,
          maxWidth: compact ? 200 : undefined,
        }}
      />
    ) : (
      <div className="pg-ig-card-title pg-ig-wf-title" style={{ marginBottom: compact ? 0 : 8 }}>
        {item.name}
      </div>
    );

  const renderCoverMedia = (item: WorkflowItem, opts?: { compact?: boolean }) => {
    const cover = resolveCoverUrl(item.cover_url);
    const isVideo = cover ? /\.(mp4|webm|mov)(\?|$)/i.test(cover) : false;
    if (cover) {
      if (isVideo) {
        return (
          <video
            src={cover}
            muted
            playsInline
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        );
      }
      return (
        <img
          src={cover}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      );
    }
    return (
      <Workflow size={opts?.compact ? 14 : 28} style={{ opacity: 0.35 }} />
    );
  };

  const renderUserAvatar = (size = 20) =>
    user?.avatar ? (
      <img
        src={user.avatar}
        alt=""
        className="pg-ig-wf-avatar"
        style={{ width: size, height: size }}
      />
    ) : (
      <span 
        className="pg-ig-wf-avatar pg-ig-wf-avatar--fallback" 
        style={{ 
          width: size, 
          height: size, 
          fontSize: size * 0.45,
          backgroundColor: avatarAccent.background,
          color: avatarAccent.color,
        }}
      >
        {userInitial}
      </span>
    );

  const workCountOf = (item: WorkflowItem) => item.work_count ?? item.asset_count ?? 0;

  const renderGridItem = (item: WorkflowItem) => {
    const works = workCountOf(item);
    return (
      <div key={item.id} className="pg-ig-card pg-ig-wf-card" onClick={() => handleOpen(item.id)}>
        <div className="pg-ig-card-media pg-ig-wf-media" style={{ aspectRatio: WF_CARD_MEDIA_ASPECT }}>
          {renderCoverMedia(item)}
        </div>
        <div className="pg-ig-card-body pg-ig-wf-card-body">
          {renderNameEdit(item)}
          <div className="pg-ig-card-meta pg-ig-wf-work-count">
            {t('playground_2026:wf_works_count', '{{count}} 个作品', { count: works })}
          </div>
          <div className="pg-ig-wf-card-footer">
            <div className="pg-ig-wf-owner">
              {renderUserAvatar(20)}
              <span className="pg-ig-wf-owner-text">
                {userLabel}
                <span className="pg-ig-wf-owner-sep"> - </span>
                {getRelativeTimeAgo(item.updated_at || item.created_at, i18n.language, nowMs)}
              </span>
            </div>
            {renderMenu(item)}
          </div>
        </div>
      </div>
    );
  };

  const renderListRow = (item: WorkflowItem) => (
    <div
      key={item.id}
      className="pg-ig-card pg-ig-wf-list-row"
      onClick={() => handleOpen(item.id)}
    >
      <div className="pg-ig-wf-list-main">
        <div className="pg-ig-card-media pg-ig-wf-list-thumb">
          {renderCoverMedia(item, { compact: true })}
        </div>
        <div className="pg-ig-wf-list-info">
          {editingId === item.id ? (
            renderNameEdit(item, true)
          ) : (
            <div className="pg-ig-card-title pg-ig-wf-title" style={{ marginBottom: 0 }}>
              <span>{item.name}</span>
            </div>
          )}
          <div className="pg-ig-card-meta">
            {t('playground_2026:wf_works_count', '{{count}} 个作品', {
              count: workCountOf(item),
            })}
            {' · '}
            {getRelativeTimeAgo(item.updated_at || item.created_at, i18n.language, nowMs)}
          </div>
        </div>
      </div>
      {!isMobile ? (
        <>
          <div className="pg-ig-wf-owner">
            {renderUserAvatar(18)}
            <span>{userLabel}</span>
          </div>
          <div className="pg-ig-wf-list-date">
            {formatApiDateTime(item.created_at, 'YYYY年MM月DD日 HH:mm:ss')}
          </div>
        </>
      ) : null}
      <div className="pg-ig-wf-list-actions">{renderMenu(item)}</div>
    </div>
  );

  const createCard = (
    <div
      className="pg-ig-card pg-ig-wf-card pg-ig-wf-create"
      onClick={() => {
        if (!isCreating) void handleCreate();
      }}
      style={{
        cursor: isCreating ? 'not-allowed' : 'pointer',
        opacity: isCreating ? 0.65 : 1,
      }}
    >
      {/* 与项目卡同构占位，保证网格等高；内容叠层居中 */}
      <div
        className="pg-ig-card-media pg-ig-wf-media pg-ig-wf-create-media"
        style={{ aspectRatio: WF_CARD_MEDIA_ASPECT }}
        aria-hidden
      />
      <div className="pg-ig-card-body pg-ig-wf-card-body pg-ig-wf-create-body" aria-hidden>
        <div className="pg-ig-card-title pg-ig-wf-title">&nbsp;</div>
        <div className="pg-ig-card-meta pg-ig-wf-work-count">&nbsp;</div>
        <div className="pg-ig-wf-card-footer">
          <div className="pg-ig-wf-owner">
            <span className="pg-ig-wf-avatar" style={{ width: 20, height: 20 }} />
            <span className="pg-ig-wf-owner-text">&nbsp;</span>
          </div>
        </div>
      </div>
      <div className="pg-ig-wf-create-inner">
        {isCreating ? (
          <Loader2 size={22} className="pg-ig-wf-create-spinner" />
        ) : (
          <div className="pg-ig-wf-create-plus">
            <Plus size={20} strokeWidth={2.25} color="#0a0a0a" />
          </div>
        )}
        <div className="pg-ig-wf-create-label">
          {isCreating
            ? t('playground_2026:workflow_creating', '正在创建...')
            : t('playground_2026:create_workflow', '创建工作流')}
        </div>
      </div>
    </div>
  );

  const gridItems = filtered;

  return (
    <div className="pg-ig-wf-page">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="pg-ig-wf-header">
        <div className="pg-ig-wf-header-text">
          <h1 className="pg-ig-page-title">{workflowMenuTitle || t('playground_2026:workflows', '工作流')}</h1>
          <p className="pg-ig-page-desc">
            {t(
              'playground_2026:workflows_desc',
              '用节点串联图片、视频与文案步骤，编排可复用的创意工作流。',
            )}
          </p>
        </div>
      </div>

      <div className="pg-ig-toolbar pg-ig-wf-toolbar">
        <div className="pg-ig-search pg-ig-wf-search">
          <Search aria-hidden />
          <input
            type="search"
            placeholder={t('playground_2026:search_placeholder_short', '搜索...')}
            {...searchInputProps}
          />
        </div>

        <div ref={sortRef} className="pg-ig-wf-sort" style={{ position: 'relative' }}>
          <button
            type="button"
            className="pg-ig-wf-sort-btn"
            onClick={() => {
              setSortOpen((v) => !v);
              setMenuOpenId(null);
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

      {loading && items.length === 0 ? (
        <div className="pg-ig-empty">
          <p>{t('common.loading', '加载中...')}</p>
        </div>
      ) : filtered.length === 0 && searchKeyword ? (
        <div className="pg-ig-empty">
          <Workflow size={32} style={{ opacity: 0.45, marginBottom: 12 }} />
          <h3>{t('playground_2026:workflow_search_empty', '没有匹配的工作流')}</h3>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="pg-ig-wf-grid">
          {!searchKeyword && createCard}
          {gridItems.map(renderGridItem)}
        </div>
      ) : (
        <div className="pg-ig-wf-list">
          {!isMobile ? (
            <div className="pg-ig-wf-list-head">
              <div>{i18n.language === 'zh' ? '名称' : 'Name'}</div>
              <div>{i18n.language === 'zh' ? '创建者' : 'Created By'}</div>
              <div>{i18n.language === 'zh' ? '创建时间' : 'Created At'}</div>
              <div />
            </div>
          ) : null}
          {gridItems.map(renderListRow)}
        </div>
      )}
    </div>
  );
};

export default WorkflowList;
