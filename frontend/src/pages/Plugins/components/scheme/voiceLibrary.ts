/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import officialVoices from './data/doubaoTts2Voices.json';
import officialVoiceMedia from './data/doubaoTts2VoiceMedia.json';

export const VOICE_CATALOG_DOUBAO_TTS_2 = 'doubao_tts_2_0';
export const DEFAULT_TTS_2_SPEAKER = 'zh_female_vv_uranus_bigtts';

export const VOICE_SCENES = ['通用', '角色', '客服', '配音', '教育', '有声', '多语种'] as const;
export type VoiceScene = (typeof VOICE_SCENES)[number];

export type VoiceCatalogItem = {
  id: string;
  name: string;
  scene: string;
  gender?: string;
  langs?: string;
  dialects?: string[];
  capabilities?: string[];
  /** 火山 ListSpeakers 官方 Avatar；缺字段则 UI 回退图标 */
  avatar?: string;
  /** 火山 ListSpeakers 官方 TrialURL；缺字段则不显示播放、不走 TTS */
  trial_url?: string;
};

export type VoiceLibraryCustom = {
  id: string;
  name: string;
};

export type VoiceLibraryBinding = {
  enabled: boolean;
  catalog: string;
  default: string;
  allowlist?: string[];
  custom?: VoiceLibraryCustom[];
};

export type VoiceCatalogs = Record<string, VoiceCatalogItem[]>;

type OfficialVoiceMedia = { avatar?: string; trial_url?: string };

function withOfficialMedia(item: VoiceCatalogItem): VoiceCatalogItem {
  const extra = (officialVoiceMedia as Record<string, OfficialVoiceMedia>)[item.id];
  if (!extra) return item;
  return {
    ...item,
    avatar: extra.avatar || item.avatar,
    trial_url: extra.trial_url || item.trial_url,
  };
}

function isStockTts2Speaker(id: string): boolean {
  const t = (id || '').trim();
  if (!t || t.startsWith('ICL_') || t.startsWith('S_')) return false;
  return t.includes('uranus_bigtts') || t.startsWith('saturn_');
}

function readCustom(raw: unknown): VoiceLibraryCustom[] {
  if (!Array.isArray(raw)) return [];
  const out: VoiceLibraryCustom[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let id = '';
    let name = '';
    if (typeof item === 'string') {
      id = item.trim();
      name = id;
    } else if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      id = String(rec.id || '').trim();
      name = String(rec.name || '').trim() || id;
    }
    if (!isStockTts2Speaker(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

export function catalogVoices(catalogs: VoiceCatalogs | undefined, catalog: string): VoiceCatalogItem[] {
  const list = catalogs?.[catalog];
  const api = Array.isArray(list) ? list : [];
  const baked = officialVoices as VoiceCatalogItem[];
  const useOfficialStock =
    (catalog === VOICE_CATALOG_DOUBAO_TTS_2 || !catalog) &&
    baked.length > 0 &&
    !api.some((v) => v.id === 'zh_female_xiaohe_uranus_bigtts');
  const source = useOfficialStock ? baked : api;
  if (source.length === 0) return [];
  return source.map(withOfficialMedia);
}

export function resolveVoiceItems(
  binding: VoiceLibraryBinding | null | undefined,
  catalogs: VoiceCatalogs | undefined,
): VoiceCatalogItem[] {
  if (!binding) return [];
  const stock = catalogVoices(catalogs, binding.catalog || VOICE_CATALOG_DOUBAO_TTS_2);
  const byId = new Map(stock.map((v) => [v.id, v]));
  for (const c of binding.custom || []) {
    if (!byId.has(c.id)) {
      byId.set(c.id, withOfficialMedia({ id: c.id, name: c.name || c.id, scene: '通用' }));
    }
  }
  const allow = (binding.allowlist || []).filter((id) => byId.has(id));
  const ids = allow.length > 0 ? allow : [...byId.keys()];
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

export function parseVoiceLibraryBinding(raw: unknown): VoiceLibraryBinding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const catalog = String(rec.catalog || '').trim() || VOICE_CATALOG_DOUBAO_TTS_2;
  const def = String(rec.default || '').trim();
  const allowlist = Array.isArray(rec.allowlist)
    ? rec.allowlist.map((x) => String(x || '').trim()).filter(Boolean)
    : undefined;
  const custom = readCustom(rec.custom);
  if (rec.enabled === false) {
    return { enabled: false, catalog, default: def, allowlist, custom };
  }
  return {
    enabled: rec.enabled !== false,
    catalog,
    default: def,
    allowlist,
    custom,
  };
}

export function seedVoiceLibrary(
  raw: unknown,
  catalogs?: VoiceCatalogs,
): VoiceLibraryBinding {
  const parsed = parseVoiceLibraryBinding(raw);
  const catalog = parsed?.catalog || VOICE_CATALOG_DOUBAO_TTS_2;
  const custom = parsed?.custom || [];
  const items = resolveVoiceItems(
    {
      enabled: true,
      catalog,
      default: parsed?.default || DEFAULT_TTS_2_SPEAKER,
      allowlist: parsed?.allowlist,
      custom,
    },
    catalogs,
  );
  const allowedIds = new Set(items.map((v) => v.id));
  const allowlist = (parsed?.allowlist || []).filter((id) => allowedIds.has(id));
  let def = parsed?.default || '';
  if (!allowedIds.has(def)) {
    def = allowedIds.has(DEFAULT_TTS_2_SPEAKER)
      ? DEFAULT_TTS_2_SPEAKER
      : (items[0]?.id || DEFAULT_TTS_2_SPEAKER);
  }
  return {
    enabled: parsed ? parsed.enabled : true,
    catalog,
    default: def,
    ...(allowlist.length > 0 ? { allowlist } : {}),
    custom,
  };
}

export function voiceLibrarySame(a: VoiceLibraryBinding | null, b: VoiceLibraryBinding | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function findVoiceItem(
  items: VoiceCatalogItem[],
  id: string | undefined,
): VoiceCatalogItem | undefined {
  const want = (id || '').trim();
  if (!want) return undefined;
  return items.find((v) => v.id === want);
}
