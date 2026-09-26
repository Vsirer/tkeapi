/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 作品生成参数（灵活 JSON）
 * - 按方案 key 存值（稳定，供上游 API / 重试回填）
 * - `_fields` 存 key + 显示名（label），详情页可显示汉字
 */
import type { SchemeParam, SchemePort } from './types';
import {
  extractIoValuesFromStored,
  getMediaInputPorts,
  getPortUrls,
  portAcceptKinds,
} from './schemeIoToolValues';

const GENERATION_PARAM_FIELDS_KEY = '_fields';
const GENERATION_PARAM_REFERENCE_URLS_KEY = 'reference_urls';
const GENERATION_PARAM_IO_VALUES_KEY = '_io_values';
const GENERATION_PARAM_SKILL_ID_KEY = '_skill_id';
const GENERATION_PARAM_SKILL_SLUG_KEY = '_skill_slug';

type GenerationParamFieldMeta = {
  key: string;
  label: string;
};

/** 写入 DB 的 generation / param_values 结构（顶层仍兼容旧的扁平 key→value） */
type GenerationParamsStored = Record<string, any> & {
  [GENERATION_PARAM_FIELDS_KEY]?: GenerationParamFieldMeta[];
  [GENERATION_PARAM_REFERENCE_URLS_KEY]?: string[];
  [GENERATION_PARAM_IO_VALUES_KEY]?: Record<string, string | string[]>;
  [GENERATION_PARAM_SKILL_ID_KEY]?: string;
  [GENERATION_PARAM_SKILL_SLUG_KEY]?: string;
};

const RESERVED_KEYS = new Set([
  GENERATION_PARAM_FIELDS_KEY,
  GENERATION_PARAM_REFERENCE_URLS_KEY,
  GENERATION_PARAM_IO_VALUES_KEY,
  'prompt',
  'negative_prompt',
  'negativeprompt',
]);

function isReservedKey(key: string): boolean {
  if (!key || key.startsWith('_')) return true;
  return RESERVED_KEYS.has(key.toLowerCase());
}

/**
 * 当前值不在 options 里时，优先用仍合法的 default，否则取列表最后一项
 *（分辨率覆写掉 1080p 后落到 720p，而不是静默留着非法默认）。
 */
export function pickSchemeOption(
  options: SchemeParam['options'],
  value: unknown,
  fallbackDefault?: unknown,
): unknown {
  if (!Array.isArray(options) || options.length === 0) return value;
  const hit = options.find((o) => String(o) === String(value));
  if (hit !== undefined) return hit;
  const defHit = options.find((o) => String(o) === String(fallbackDefault));
  if (defHit !== undefined) return defHit;
  return options[options.length - 1];
}

function clampNumericToRange(value: unknown, min?: number, max?: number): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  let v = n;
  if (typeof min === 'number' && Number.isFinite(min) && v < min) v = min;
  if (typeof max === 'number' && Number.isFinite(max) && v > max) v = max;
  return v;
}

function usesNumericRange(param: SchemeParam): boolean {
  if (param.type === 'slider') return true;
  if (param.type === 'number' && !(Array.isArray(param.options) && param.options.length > 0)) {
    return true;
  }
  return false;
}

export function clampParamsToSchemeOptions(
  values: Record<string, any>,
  params: SchemeParam[] | undefined | null,
  skipKeys?: Iterable<string> | null,
): Record<string, any> {
  let changed = false;
  const next = { ...values };
  const skip = skipKeys ? new Set(skipKeys) : null;
  for (const p of params || []) {
    if (!p?.key) continue;
    if (skip?.has(p.key)) continue;
    if (usesNumericRange(p)) {
      const clamped = clampNumericToRange(next[p.key], p.min, p.max);
      if (clamped !== undefined && clamped !== next[p.key]) {
        next[p.key] = clamped;
        changed = true;
      }
      continue;
    }
    if (!Array.isArray(p.options) || p.options.length === 0) continue;
    const picked = pickSchemeOption(p.options, next[p.key], p.default);
    if (picked === next[p.key]) continue;
    next[p.key] = picked;
    changed = true;
  }
  return changed ? next : values;
}

export function initSchemeParamDefaults(
  params: SchemeParam[] | undefined | null,
): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const p of params || []) {
    if (!p?.key) continue;
    defaults[p.key] = pickSchemeOption(p.options, p.default, p.default);
  }
  return defaults;
}

/** 从方案参数构建 label 元数据 */
function buildParamFieldMetas(
  schemeParams: SchemeParam[] | undefined | null,
): GenerationParamFieldMeta[] {
  const out: GenerationParamFieldMeta[] = [];
  for (const p of schemeParams || []) {
    const key = String(p?.key || '').trim();
    if (!key || isReservedKey(key)) continue;
    const label = String(p?.label || '').trim() || key;
    out.push({ key, label });
  }
  return out;
}

/**
 * 组装写入 outputs.param_values 的 JSON：
 * 扁平 key→value + `_fields`（显示名）+ 可选 reference_urls
 */
export function buildGenerationParams(
  values: Record<string, any> | undefined | null,
  schemeParams?: SchemeParam[] | null,
  extras?: {
    referenceUrls?: string[];
    ioValues?: Record<string, string | string[]>;
    skillId?: string;
    skillSlug?: string;
  },
): GenerationParamsStored {
  const stored: GenerationParamsStored = {};
  const src = values && typeof values === 'object' ? values : {};

  Object.entries(src).forEach(([key, val]) => {
    if (isReservedKey(key)) return;
    if (val === undefined) return;
    stored[key] = val;
  });

  const fields = buildParamFieldMetas(schemeParams);
  if (fields.length > 0) {
    stored[GENERATION_PARAM_FIELDS_KEY] = fields;
  }

  const refs = (extras?.referenceUrls || []).filter((u) => typeof u === 'string' && !!u.trim());
  if (refs.length > 0) {
    stored[GENERATION_PARAM_REFERENCE_URLS_KEY] = refs;
    const hasRefMeta = fields.some((f) => f.key === GENERATION_PARAM_REFERENCE_URLS_KEY);
    if (!hasRefMeta) {
      const next = [...(stored[GENERATION_PARAM_FIELDS_KEY] || [])];
      next.push({ key: GENERATION_PARAM_REFERENCE_URLS_KEY, label: '参考图' });
      stored[GENERATION_PARAM_FIELDS_KEY] = next;
    }
  }

  if (extras?.ioValues && typeof extras.ioValues === 'object') {
    const clean: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(extras.ioValues)) {
      if (typeof v === 'string' && v.trim()) clean[k] = v;
      else if (Array.isArray(v) && v.length) clean[k] = v.filter(Boolean);
    }
    if (Object.keys(clean).length) {
      stored[GENERATION_PARAM_IO_VALUES_KEY] = clean;
    }
  }

  const skillId = String(extras?.skillId || '').trim();
  if (skillId) {
    stored[GENERATION_PARAM_SKILL_ID_KEY] = skillId;
    const slug = String(extras?.skillSlug || '').trim();
    if (slug) stored[GENERATION_PARAM_SKILL_SLUG_KEY] = slug;
  }

  return stored;
}

/** 取出可回填表单 / 发给上游的扁平参数（去掉元数据） */
export function extractParamValues(
  stored: Record<string, any> | undefined | null,
): Record<string, any> {
  const out: Record<string, any> = {};
  if (!stored || typeof stored !== 'object') return out;
  Object.entries(stored).forEach(([key, val]) => {
    if (isReservedKey(key)) return;
    if (val === undefined) return;
    out[key] = val;
  });
  return out;
}

function getParamFieldMetas(
  stored: Record<string, any> | undefined | null,
): GenerationParamFieldMeta[] {
  const raw = stored?.[GENERATION_PARAM_FIELDS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => ({
      key: String(f?.key || '').trim(),
      label: String(f?.label || '').trim(),
    }))
    .filter((f) => !!f.key);
}

export function getReferenceUrls(stored: Record<string, any> | undefined | null): string[] {
  const raw = stored?.[GENERATION_PARAM_REFERENCE_URLS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && !!u.trim());
}

export type UsedReferenceKind = 'image' | 'video' | 'audio';

export type UsedReferenceItem = {
  url: string;
  kind: UsedReferenceKind;
  groupKey: string;
  groupLabel: string;
  badge: string;
};

const REF_BADGE_PREFIX: Record<UsedReferenceKind, string> = {
  image: '图',
  video: '视频',
  audio: '音频',
};

function isTextIoKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'prompt' || k.includes('prompt') || k.startsWith('_');
}

function guessRefKind(url: string, preferred?: UsedReferenceKind): UsedReferenceKind {
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || url.includes('/video')) return 'video';
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url) || url.includes('/audio')) return 'audio';
  return preferred || 'image';
}

function ioGroupLabel(key: string, portLabel?: string): string {
  if (portLabel?.trim()) return portLabel.trim();
  const k = key.toLowerCase();
  if (k.includes('start_frame') || k.includes('first_frame')) return '首帧';
  if (k.includes('end_frame') || k.includes('last_frame')) return '尾帧';
  if (k.includes('video')) return '参考视频';
  if (k.includes('audio')) return '参考音频';
  return '参考图';
}

function preferredKindFromPort(port: SchemePort): UsedReferenceKind | undefined {
  const kinds = portAcceptKinds(port);
  if (kinds.length === 1 && (kinds[0] === 'image' || kinds[0] === 'video' || kinds[0] === 'audio')) {
    return kinds[0];
  }
  return undefined;
}

/** 详情页用：IO 口（首尾帧 / 参考图视频音频）+ 旧的 reference_urls */
export function listUsedReferenceMedia(
  stored: Record<string, any> | undefined | null,
  ports?: SchemePort[] | null,
): UsedReferenceItem[] {
  const items: UsedReferenceItem[] = [];
  const seen = new Set<string>();
  const push = (
    url: string,
    kind: UsedReferenceKind,
    groupKey: string,
    groupLabel: string,
    badge: string,
  ) => {
    const id = `${groupKey}\0${url}`;
    if (!url || seen.has(id)) return;
    seen.add(id);
    items.push({ url, kind, groupKey, groupLabel, badge });
  };

  const io = extractIoValuesFromStored(stored);
  if (io) {
    const portByKey = new Map((ports || []).map((p) => [p.key, p]));
    const keys: string[] = [];
    if (ports?.length) {
      for (const p of getMediaInputPorts(ports)) keys.push(p.key);
    }
    for (const key of Object.keys(io)) {
      if (isTextIoKey(key) || keys.includes(key)) continue;
      keys.push(key);
    }
    for (const key of keys) {
      const urls = getPortUrls(io, key);
      if (!urls.length) continue;
      const port = portByKey.get(key);
      const groupLabel = ioGroupLabel(key, port?.label);
      const preferred = port ? preferredKindFromPort(port) : undefined;
      const frameOnly = urls.length === 1 && (groupLabel === '首帧' || groupLabel === '尾帧');
      urls.forEach((url, i) => {
        const kind = guessRefKind(url, preferred);
        push(
          url,
          kind,
          key,
          groupLabel,
          frameOnly ? groupLabel : `${REF_BADGE_PREFIX[kind]}${i + 1}`,
        );
      });
    }
  }

  if (items.length) return items;

  getReferenceUrls(stored).forEach((url, i) => {
    const kind = guessRefKind(url);
    push(url, kind, 'reference_urls', '参考图', `${REF_BADGE_PREFIX[kind]}${i + 1}`);
  });
  return items;
}

export function getStoredSkillId(stored: Record<string, any> | undefined | null): string {
  const raw = stored?.[GENERATION_PARAM_SKILL_ID_KEY];
  return typeof raw === 'string' ? raw.trim() : '';
}

export function getStoredSkillSlug(stored: Record<string, any> | undefined | null): string {
  const raw = stored?.[GENERATION_PARAM_SKILL_SLUG_KEY];
  return typeof raw === 'string' ? raw.trim() : '';
}

/** 详情 DETAILS 行：优先用方案 label 显示 */
export function listGenerationDetailRows(
  stored: Record<string, any> | undefined | null,
  options?: { skipKeys?: string[] },
): { key: string; label: string; value: string }[] {
  const skip = new Set((options?.skipKeys || []).map((k) => k.toLowerCase()));
  skip.add('n');
  skip.add('batch_size');
  skip.add('prompt');
  skip.add('negative_prompt');

  const values = extractParamValues(stored);
  const metas = getParamFieldMetas(stored);
  const metaByKey = new Map(metas.map((m) => [m.key, m.label]));
  const rows: { key: string; label: string; value: string }[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string, raw: any) => {
    if (seen.has(key)) return;
    if (skip.has(key.toLowerCase())) return;
    if (raw === undefined || raw === null || raw === '') return;
    const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
    if (!value) return;
    seen.add(key);
    rows.push({ key, label: label || key, value });
  };

  for (const { key, label } of metas) {
    if (key === GENERATION_PARAM_REFERENCE_URLS_KEY) {
      const refs = getReferenceUrls(stored);
      if (refs.length) push(key, label || '参考图', `${refs.length} 张`);
      continue;
    }
    push(key, label || key, values[key]);
  }

  for (const [key, val] of Object.entries(values)) {
    push(key, metaByKey.get(key) || key, val);
  }

  return rows;
}
