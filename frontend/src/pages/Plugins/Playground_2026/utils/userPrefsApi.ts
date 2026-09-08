/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心2026 用户偏好（模型收藏 / 工作流编辑器 UI）
 * GET/PATCH /playground-2026/prefs
 */
import request from '../../../../utils/request';

export type FlowEditorPrefs = {
  showMinimap: boolean;
  emptyHintSeen: boolean;
};

export type UserPrefs = {
  favorite_mids: string[];
  flow_editor: FlowEditorPrefs;
};

const LS_FAVORITES = 'playground_2026_favorites';
const LS_FLOW_PREFS = 'playground_2026_flow_editor_prefs';

const DEFAULT_FLOW: FlowEditorPrefs = {
  showMinimap: false,
  emptyHintSeen: false,
};

const DEFAULT_PREFS: UserPrefs = {
  favorite_mids: [],
  flow_editor: { ...DEFAULT_FLOW },
};

function normalizePrefs(raw: any): UserPrefs {
  const fe = raw?.flow_editor && typeof raw.flow_editor === 'object' ? raw.flow_editor : {};
  const mids = Array.isArray(raw?.favorite_mids)
    ? raw.favorite_mids.map((x: unknown) => String(x)).filter(Boolean)
    : [];
  return {
    favorite_mids: mids,
    flow_editor: {
      showMinimap: !!fe.showMinimap,
      emptyHintSeen: !!fe.emptyHintSeen,
    },
  };
}

function readLegacyLocal(): Partial<UserPrefs> | null {
  let favorite_mids: string[] | undefined;
  let flow_editor: FlowEditorPrefs | undefined;
  try {
    const favRaw = localStorage.getItem(LS_FAVORITES);
    if (favRaw) {
      const parsed = JSON.parse(favRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        favorite_mids = parsed.map(String);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const flowRaw = localStorage.getItem(LS_FLOW_PREFS);
    if (flowRaw) {
      const parsed = JSON.parse(flowRaw);
      if (parsed && typeof parsed === 'object') {
        flow_editor = {
          showMinimap: !!parsed.showMinimap,
          emptyHintSeen: !!parsed.emptyHintSeen,
        };
      }
    }
  } catch {
    /* ignore */
  }
  if (!favorite_mids && !flow_editor) return null;
  return { favorite_mids, flow_editor };
}

function clearLegacyLocal() {
  try {
    localStorage.removeItem(LS_FAVORITES);
    localStorage.removeItem(LS_FLOW_PREFS);
  } catch {
    /* ignore */
  }
}

function serverPrefsEmpty(prefs: UserPrefs): boolean {
  const noFav = !prefs.favorite_mids.length;
  const fe = prefs.flow_editor;
  const flowDefault = !fe.showMinimap && !fe.emptyHintSeen;
  return noFav && flowDefault;
}

let migrateOnce: Promise<UserPrefs> | null = null;

/** GET prefs；若服务端为空则一次性迁入旧 localStorage */
export async function getUserPrefs(): Promise<UserPrefs> {
  if (!migrateOnce) {
    migrateOnce = (async () => {
      const res: any = await request.get('/playground-2026/prefs', {
        skipErrorHandler: true,
      } as any);
      let prefs = normalizePrefs(res?.prefs ?? res);
      if (serverPrefsEmpty(prefs)) {
        const legacy = readLegacyLocal();
        if (legacy) {
          const patch: Record<string, unknown> = {};
          if (legacy.favorite_mids?.length) patch.favorite_mids = legacy.favorite_mids;
          if (legacy.flow_editor) {
            patch.flow_editor = { ...DEFAULT_FLOW, ...legacy.flow_editor };
          }
          if (Object.keys(patch).length) {
            const saved: any = await request.patch('/playground-2026/prefs', patch, {
              skipErrorHandler: true,
            } as any);
            prefs = normalizePrefs(saved?.prefs ?? patch);
          }
          clearLegacyLocal();
        }
      } else {
        // 服务端已有数据：清掉本地残留，避免双源
        clearLegacyLocal();
      }
      return prefs;
    })().catch((err) => {
      migrateOnce = null;
      throw err;
    });
  }
  return migrateOnce;
}

async function patchUserPrefs(patch: {
  favorite_mids?: string[];
  flow_editor?: Partial<FlowEditorPrefs>;
}): Promise<UserPrefs> {
  const res: any = await request.patch('/playground-2026/prefs', patch);
  const prefs = normalizePrefs(res?.prefs ?? DEFAULT_PREFS);
  migrateOnce = Promise.resolve(prefs);
  return prefs;
}

async function addFavoriteMid(mid: string): Promise<UserPrefs> {
  const res: any = await request.put(
    `/playground-2026/prefs/favorite-mids/${encodeURIComponent(mid)}`,
  );
  const prefs = normalizePrefs(res?.prefs ?? DEFAULT_PREFS);
  migrateOnce = Promise.resolve(prefs);
  return prefs;
}

async function removeFavoriteMid(mid: string): Promise<UserPrefs> {
  const res: any = await request.delete(
    `/playground-2026/prefs/favorite-mids/${encodeURIComponent(mid)}`,
  );
  const prefs = normalizePrefs(res?.prefs ?? DEFAULT_PREFS);
  migrateOnce = Promise.resolve(prefs);
  return prefs;
}

export async function toggleFavoriteMid(mid: string, currentlyFavorited: boolean): Promise<UserPrefs> {
  return currentlyFavorited ? removeFavoriteMid(mid) : addFavoriteMid(mid);
}

export async function getFlowEditorPrefs(): Promise<FlowEditorPrefs> {
  const prefs = await getUserPrefs();
  return { ...prefs.flow_editor };
}

export async function saveFlowEditorPrefs(
  patch: Partial<FlowEditorPrefs>,
): Promise<FlowEditorPrefs> {
  const prefs = await patchUserPrefs({ flow_editor: patch });
  return { ...prefs.flow_editor };
}
