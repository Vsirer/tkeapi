/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 作品卡片共用：右上角三点菜单 + 左下角收藏
 * （作品 / 图片 / 视频列表与生成页对齐）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Dropdown,
  Input,
  Modal,
  message as appMessage,
  type MenuProps,
} from '../ui';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EllipsisOutlined,
  ExportOutlined,
  FolderAddOutlined,
  FolderOutlined,
  HeartFilled,
  HeartOutlined,
  PlusOutlined,
} from '../ui';
import { useTranslation } from 'react-i18next';
import type { GeneratedImageItem } from '../utils/imageGenStorage';
import {
  addAssetsToAlbum,
  createAlbum,
  listAlbums,
  removeAssetsFromAlbum,
  type WorkAlbum,
} from '../utils/albumsApi';
import { updateAsset } from '../utils/assetsApi';
import { downloadFileByUrl } from '../utils/downloadFile';
import { getAssetDownloadFilename, toResourceDisplayName, validateMacFileName } from '../utils/resourceFileName';
import { getSharedModalStyles } from '../utils/modalStyles';
import './WorksList.css';

export interface WorkCardChromeProps {
  item: GeneratedImageItem;
  isLight?: boolean;
  albums?: WorkAlbum[];
  onOpen?: (item: GeneratedImageItem) => void;
  onDelete?: (item: GeneratedImageItem) => void;
  /** 收藏/分类变更后回写列表项 */
  onItemChange?: (item: GeneratedImageItem) => void;
  onAlbumsChange?: () => void;
  /** 置顶菜单项（排在菜单最前，如「加入提示词」） */
  leadingMenuItems?: MenuProps['items'];
  /** 追加菜单项 */
  extraMenuItems?: MenuProps['items'];
  /** 始终显示三点（生成页暗色卡片） */
  alwaysShowActions?: boolean;
  /** 隐藏「打开」菜单项（如侧栏资源插入场景） */
  hideOpen?: boolean;
  /** 是否为列表展示模式（使用水平弹性布局） */
  listMode?: boolean;
}

const overlayBtnStyle = (isLightTheme: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 8,
  border: 'none',
  background: isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(20,20,22,0.78)',
  color: isLightTheme ? '#3f3f46' : '#f4f4f5',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: isLightTheme
    ? '0 1px 4px rgba(0,0,0,0.12)'
    : '0 1px 6px rgba(0,0,0,0.45)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  transition: 'all 0.15s ease',
  padding: 0,
});

const WorkCardChrome: React.FC<WorkCardChromeProps> = ({
  item,
  isLight = false,
  albums: externalAlbums,
  onItemChange,
  onAlbumsChange,
  onOpen,
  onDelete,
  leadingMenuItems,
  extraMenuItems,
  listMode = false,
  alwaysShowActions = false,
  hideOpen = false,
}) => {
  const { t } = useTranslation();
  const isLightTheme =
    isLight ||
    (typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') === 'light');

  const [internalAlbums, setInternalAlbums] = useState<WorkAlbum[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [savingAlbums, setSavingAlbums] = useState(false);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const albums = useMemo(
    () => (externalAlbums && externalAlbums.length > 0 ? externalAlbums : internalAlbums),
    [externalAlbums, internalAlbums],
  );

  const reloadAlbums = useCallback(async () => {
    try {
      const list = await listAlbums();
      setInternalAlbums(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!externalAlbums || externalAlbums.length === 0) {
      void reloadAlbums();
    }
  }, [externalAlbums, reloadAlbums]);

  const favoritesAlbum = useMemo(
    () => albums.find((a) => a.kind === 'favorites'),
    [albums],
  );
  const customAlbums = useMemo(
    () => albums.filter((a) => a.kind === 'custom'),
    [albums],
  );

  // 临时勾选分类集合（点击确认按钮时统一提交）
  const [pendingAlbumIds, setPendingAlbumIds] = useState<Set<string>>(() => {
    const s = new Set(item.albumIds || []);
    if (favoritesAlbum?.id && item.isFavorited) s.add(favoritesAlbum.id);
    return s;
  });

  useEffect(() => {
    const s = new Set(item.albumIds || []);
    if (favoritesAlbum?.id && item.isFavorited) s.add(favoritesAlbum.id);
    setPendingAlbumIds(s);
  }, [item.albumIds, item.isFavorited, favoritesAlbum?.id]);

  const handleDropdownOpenChange = (open: boolean) => {
    setDropdownOpen(open);
    if (open) {
      const s = new Set(item.albumIds || []);
      if (favoritesAlbum?.id && item.isFavorited) s.add(favoritesAlbum.id);
      setPendingAlbumIds(s);
    }
  };

  const handleTogglePendingAlbum = (albumId: string) => {
    setPendingAlbumIds((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  };

  const handleConfirmAlbums = async () => {
    setSavingAlbums(true);
    try {
      const currentSet = new Set(item.albumIds || []);
      if (favoritesAlbum?.id && item.isFavorited) currentSet.add(favoritesAlbum.id);

      const toAdd = Array.from(pendingAlbumIds).filter((id) => !currentSet.has(id));
      const toRemove = Array.from(currentSet).filter((id) => !pendingAlbumIds.has(id));

      if (toAdd.length > 0 || toRemove.length > 0) {
        await Promise.all([
          ...toAdd.map((id) => addAssetsToAlbum(id, [item.id])),
          ...toRemove.map((id) => removeAssetsFromAlbum(id, [item.id])),
        ]);

        const finalAlbumIds = Array.from(pendingAlbumIds);
        const isFav = favoritesAlbum?.id ? pendingAlbumIds.has(favoritesAlbum.id) : !!item.isFavorited;
        patchItem({ albumIds: finalAlbumIds, isFavorited: isFav });
        void reloadAlbums().then(() => onAlbumsChange?.());
      }
      setDropdownOpen(false);
    } catch {
      appMessage.error(t('playground_2026:add_to_album_failed', '更新分类失败'));
    } finally {
      setSavingAlbums(false);
    }
  };

  const isInAlbum = (aid: string) =>
    (item.albumIds || []).includes(aid) ||
    (favoritesAlbum?.id === aid && !!item.isFavorited);

  const patchItem = (next: Partial<GeneratedImageItem>) => {
    onItemChange?.({ ...item, ...next });
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!favoritesAlbum?.id) {
      appMessage.error(t('playground_2026:favorites_missing', '收藏夹不可用'));
      return;
    }
    const next = !item.isFavorited;
    try {
      if (next) await addAssetsToAlbum(favoritesAlbum.id, [item.id]);
      else await removeAssetsFromAlbum(favoritesAlbum.id, [item.id]);
      const albumIds = new Set(item.albumIds || []);
      if (next) albumIds.add(favoritesAlbum.id);
      else albumIds.delete(favoritesAlbum.id);
      patchItem({ isFavorited: next, albumIds: Array.from(albumIds) });
      void reloadAlbums().then(() => onAlbumsChange?.());
    } catch {
      appMessage.error(t('playground_2026:favorite_failed', '收藏操作失败'));
    }
  };

  const handleDownload = async () => {
    if (!item.previewUrl) {
      appMessage.warning(t('playground_2026:image_gen_no_preview', '暂无预览'));
      return;
    }
    try {
      await downloadFileByUrl(item.previewUrl, {
        filename: getAssetDownloadFilename(item),
        mediaType: item.mediaType === 'video' ? 'video' : 'image',
      });
    } catch (e: any) {
      appMessage.error(e?.message || t('playground_2026:download_failed', '下载失败'));
    }
  };


  const handleCreateAlbum = () => {
    if (customAlbums.length >= 20) {
      appMessage.warning(t('playground_2026:album_limit_reached', '一个用户最多只可以创建20个文件夹'));
      return;
    }
    setNewAlbumName('');
    setCreateAlbumOpen(true);
  };

  const handleConfirmCreateAlbum = async () => {
    const validation = validateMacFileName(newAlbumName, t('playground_2026:album_name_label', '文件夹名称'));
    if (!validation.valid) {
      appMessage.warning(validation.error || t('playground_2026:album_name_required', '请输入分类名称'));
      return;
    }
    const trimmed = newAlbumName.trim();
    setCreatingAlbum(true);
    try {
      const album = await createAlbum(trimmed);
      setPendingAlbumIds((prev) => new Set([...prev, album.id]));
      await addAssetsToAlbum(album.id, [item.id]);
      const albumIds = new Set(item.albumIds || []);
      albumIds.add(album.id);
      patchItem({ albumIds: Array.from(albumIds) });
      await reloadAlbums();
      onAlbumsChange?.();
      appMessage.success(t('playground_2026:album_created_with_item', '已创建并加入当前资源'));
      setCreateAlbumOpen(false);
    } catch (err: any) {
      appMessage.error(
        err?.response?.data?.error?.message ||
          t('playground_2026:album_create_failed', '创建分类失败'),
      );
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleRename = () => {
    setRenameValue(toResourceDisplayName(item.prompt || ''));
    setRenameModalOpen(true);
  };

  const handleConfirmRename = async () => {
    const trimmed = renameValue.trim();
    const validation = validateMacFileName(trimmed, t('playground_2026:resource_name_label', '文件名'));
    if (!validation.valid) {
      appMessage.warning(validation.error || t('playground_2026:resource_name_required', '请输入资源名称'));
      return;
    }
    if (trimmed === (item.prompt || '').trim()) {
      setRenameModalOpen(false);
      return;
    }
    setRenaming(true);
    try {
      const updated = await updateAsset(item.id, { prompt: trimmed });
      patchItem({ prompt: updated.prompt || trimmed });
      appMessage.success(t('playground_2026:resource_renamed', '已重命名'));
      setRenameModalOpen(false);
    } catch (err: any) {
      appMessage.error(
        err?.response?.data?.error?.message ||
          t('playground_2026:resource_rename_failed', '重命名失败'),
      );
    } finally {
      setRenaming(false);
    }
  };

  const buildMenu = (): MenuProps => {
    const albumChildren: MenuProps['items'] = [];
    if (favoritesAlbum) {
      const checked = pendingAlbumIds.has(favoritesAlbum.id);
      albumChildren.push({
        key: `album-${favoritesAlbum.id}`,
        keepOpen: true,
        label: (
          <div
            className="hf-works-album-row"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleTogglePendingAlbum(favoritesAlbum.id);
            }}
          >
            <div className="hf-works-album-row-main">
              <HeartFilled style={{ color: isLightTheme ? '#71717a' : '#d4d4d8', fontSize: 15 }} />
              <div className="hf-works-album-name">
                {favoritesAlbum.name || t('playground_2026:favorites', '收藏夹')}
              </div>
            </div>
            <Checkbox checked={checked} />
          </div>
        ),
      });
    }
    if (customAlbums.length > 0) {
      albumChildren.push({
        type: 'group',
        label: t('playground_2026:private_albums', '私人文件夹'),
        children: customAlbums.map((a) => {
          const checked = pendingAlbumIds.has(a.id);
          return {
            key: `album-${a.id}`,
            keepOpen: true,
            label: (
              <div
                className="hf-works-album-row"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTogglePendingAlbum(a.id);
                }}
              >
                <div className="hf-works-album-row-main">
                  <FolderOutlined style={{ color: isLightTheme ? '#71717a' : '#d4d4d8', fontSize: 15 }} />
                  <div className="hf-works-album-name">{a.name}</div>
                </div>
                <Checkbox checked={checked} />
              </div>
            ),
          };
        }),
      });
    }
    albumChildren.push({
      key: 'create-album',
      keepOpen: true,
      label: (
        <div className="hf-works-album-create">
          <PlusOutlined />
          <span>{t('playground_2026:create_album_action', '创建新文件夹')}</span>
        </div>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        handleCreateAlbum();
      },
    });
    albumChildren.push({ type: 'divider' });
    albumChildren.push({
      key: 'confirm-album',
      label: (
        <div
          className="hf-works-album-footer"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Button
            type="primary"
            size="small"
            block
            loading={savingAlbums}
            className="hf-works-album-confirm-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleConfirmAlbums();
            }}
          >
            {t('common.confirm', '确认')}
          </Button>
        </div>
      ),
    });

    const items: MenuProps['items'] = [
      ...(leadingMenuItems || []),
      ...(!hideOpen
        ? [
            {
              key: 'open',
              icon: <ExportOutlined />,
              label: t('playground_2026:works_open', '打开'),
              onClick: ({ domEvent }: { domEvent: Event }) => {
                domEvent.stopPropagation();
                onOpen?.(item);
              },
            },
          ]
        : []),
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: t('playground_2026:rename', '重命名'),
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          handleRename();
        },
      },
      {
        key: 'add-album',
        icon: <FolderAddOutlined />,
        label: t('playground_2026:add_to_album', '添加到分类'),
        children: albumChildren,
      },
      ...(extraMenuItems || []),
      {
        key: 'download',
        icon: <DownloadOutlined />,
        label: t('playground_2026:download_file', '下载文件'),
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          void handleDownload();
        },
      },
      { type: 'divider' },
      {
        key: 'delete',
        danger: true,
        icon: <DeleteOutlined />,
        label: t('playground_2026:delete_work', '删除资源'),
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          onDelete?.(item);
        },
      },
    ];
    return { items };
  };

  return (
    <>
      {listMode ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="hf-works-card-fav"
            onClick={(e) => void handleToggleFavorite(e)}
            style={{
              ...overlayBtnStyle(isLightTheme),
              color: item.isFavorited
                ? isLightTheme
                  ? 'rgba(0, 0, 0, 0.75)'
                  : 'rgba(255, 255, 255, 0.88)'
                : isLightTheme
                  ? '#52525b'
                  : '#e4e4e7',
            }}
            aria-label="favorite"
          >
            {item.isFavorited ? <HeartFilled style={{ fontSize: 13.5 }} /> : <HeartOutlined style={{ fontSize: 13.5 }} />}
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Dropdown
              open={dropdownOpen}
              onOpenChange={handleDropdownOpenChange}
              menu={buildMenu()}
              trigger={['click']}
              placement="bottomRight"
              overlayClassName="hf-works-card-dropdown"
            >
              <button type="button" style={overlayBtnStyle(isLightTheme)} aria-label="more">
                <EllipsisOutlined style={{ fontSize: 14 }} />
              </button>
            </Dropdown>
          </div>
        </div>
      ) : (
        <>
          <div
            className="hf-works-card-actions-tr"
            style={alwaysShowActions || dropdownOpen ? { opacity: 1 } : undefined}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Dropdown
              open={dropdownOpen}
              onOpenChange={handleDropdownOpenChange}
              menu={buildMenu()}
              trigger={['click']}
              placement="rightTop"
              overlayClassName="hf-works-card-dropdown"
            >
              <button type="button" style={overlayBtnStyle(isLightTheme)} aria-label="more">
                <EllipsisOutlined style={{ fontSize: 14 }} />
              </button>
            </Dropdown>
          </div>
          <button
            type="button"
            className="hf-works-card-fav"
            onClick={(e) => void handleToggleFavorite(e)}
            style={{
              ...overlayBtnStyle(isLightTheme),
              position: 'absolute',
              left: 8,
              bottom: 8,
              zIndex: 2,
              color: item.isFavorited
                ? isLightTheme
                  ? 'rgba(0, 0, 0, 0.75)'
                  : 'rgba(255, 255, 255, 0.88)'
                : isLightTheme
                  ? '#52525b'
                  : '#e4e4e7',
            }}
            aria-label="favorite"
          >
            {item.isFavorited ? <HeartFilled style={{ fontSize: 13.5 }} /> : <HeartOutlined style={{ fontSize: 13.5 }} />}
          </button>
        </>
      )}

      <Modal
        title={t('playground_2026:rename', '重命名')}
        open={renameModalOpen}
        onCancel={() => setRenameModalOpen(false)}
        onOk={() => void handleConfirmRename()}
        confirmLoading={renaming}
        okText={t('common.ok', '确定')}
        cancelText={t('common.cancel', '取消')}
        width={380}
        zIndex={6000}
        {...getSharedModalStyles(isLightTheme)}
      >
        <div style={{ paddingTop: 12, paddingBottom: 4 }}>
          <Input
            autoFocus
            value={renameValue}
            maxLength={40}
            placeholder={t('playground_2026:resource_name_placeholder', '资源名称')}
            onChange={(e) => setRenameValue(e.target.value)}
            onPressEnter={() => void handleConfirmRename()}
          />
        </div>
      </Modal>

      <Modal
        title={t('playground_2026:create_album', '新建分类')}
        open={createAlbumOpen}
        onCancel={() => setCreateAlbumOpen(false)}
        onOk={() => void handleConfirmCreateAlbum()}
        confirmLoading={creatingAlbum}
        okText={t('common.ok', '确定')}
        cancelText={t('common.cancel', '取消')}
        width={380}
        zIndex={6000}
        {...getSharedModalStyles(isLightTheme)}
      >
        <div style={{ paddingTop: 12, paddingBottom: 4 }}>
          <Input
            autoFocus
            value={newAlbumName}
            maxLength={40}
            placeholder={t('playground_2026:album_name_placeholder', '分类名称')}
            onChange={(e) => setNewAlbumName(e.target.value)}
            onPressEnter={() => void handleConfirmCreateAlbum()}
          />
        </div>
      </Modal>
    </>
  );
};

export default WorkCardChrome;
