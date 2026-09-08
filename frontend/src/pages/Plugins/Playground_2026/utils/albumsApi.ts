/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 作品分类 API（收藏夹 + 自定义分类）
 */
import request from '../../../../utils/request';
import { coalesceAsync } from '../../../../utils/coalesceAsync';

export type WorkAlbum = {
  id: string;
  name: string;
  kind: 'favorites' | 'custom' | string;
  is_system: boolean;
  can_rename: boolean;
  can_delete: boolean;
  sort_order: number;
  item_count: number;
  created_at?: string;
  updated_at?: string;
};

export async function listAlbums(): Promise<WorkAlbum[]> {
  return coalesceAsync(
    'pg2026:albums',
    async () => {
      const res: any = await request.get('/playground-2026/albums');
      const list = Array.isArray(res?.albums) ? res.albums : [];
      return list.map((a: any) => ({
        id: String(a.id),
        name: a.name || '',
        kind: a.kind || 'custom',
        is_system: !!a.is_system,
        can_rename: a.can_rename !== false && !a.is_system,
        can_delete: a.can_delete !== false && !a.is_system,
        sort_order: Number(a.sort_order) || 0,
        item_count: Number(a.item_count) || 0,
        created_at: a.created_at,
        updated_at: a.updated_at,
      })) as WorkAlbum[];
    },
    { recentMs: 0 },
  );
}

export async function createAlbum(name: string): Promise<WorkAlbum> {
  const res: any = await request.post('/playground-2026/albums', { name });
  const a = res?.album || {};
  return {
    id: String(a.id),
    name: a.name || name,
    kind: a.kind || 'custom',
    is_system: false,
    can_rename: true,
    can_delete: true,
    sort_order: Number(a.sort_order) || 0,
    item_count: Number(a.item_count) || 0,
  };
}

export async function renameAlbum(id: string, name: string): Promise<WorkAlbum> {
  const res: any = await request.patch(`/playground-2026/albums/${id}`, { name });
  const a = res?.album || {};
  return {
    id: String(a.id || id),
    name: a.name || name,
    kind: a.kind || 'custom',
    is_system: !!a.is_system,
    can_rename: a.can_rename !== false && !a.is_system,
    can_delete: a.can_delete !== false && !a.is_system,
    sort_order: Number(a.sort_order) || 0,
    item_count: Number(a.item_count) || 0,
  };
}

export async function deleteAlbum(id: string): Promise<void> {
  await request.delete(`/playground-2026/albums/${id}`);
}

export async function reorderAlbums(albumIds: string[]): Promise<void> {
  await request.post('/playground-2026/albums/reorder', { album_ids: albumIds });
}

export async function addAssetsToAlbum(albumId: string, assetIds: string[]): Promise<number> {
  const res: any = await request.post(`/playground-2026/albums/${albumId}/items`, {
    asset_ids: assetIds,
  });
  return Number(res?.added) || 0;
}

export async function removeAssetsFromAlbum(albumId: string, assetIds: string[]): Promise<number> {
  const res: any = await request.post(`/playground-2026/albums/${albumId}/items/remove`, {
    asset_ids: assetIds,
  });
  return Number(res?.removed) || 0;
}
