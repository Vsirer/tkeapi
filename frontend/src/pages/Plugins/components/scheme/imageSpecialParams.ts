/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import type {
  ImageSpecialCustomPixels,
  ImageSpecialParamsConfig,
  ImageSpecialSizeMap,
  PlaygroundModel,
  SchemeParam,
} from './types';
import { clampParamsToSchemeOptions } from './generationParams';
import { formatShortcutSummary, getShortcutSummaryParams } from './schemeQuickBar';

const IMAGE_SPECIAL_RATIO_PRESETS = [
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '3:2',
  '2:3',
  '21:9',
] as const;

const PIXEL_SIZE_RE = /^(\d+)\s*[xX×*＊]\s*(\d+)$/;
const K_TIER_RE = /^[1-4](?:\.5)?K$/i;

/** Seedream 5.0 Pro 文档表；其它档位按 2K 比例缩放 */
const SIZE_TABLE: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1424x800',
    '9:16': '800x1424',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1568x672',
  },
  '1.5K': {
    '1:1': '1536x1536',
    '4:3': '1792x1344',
    '3:4': '1344x1792',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '3:2': '1872x1248',
    '2:3': '1248x1872',
    '21:9': '2352x1008',
  },
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2368x1776',
    '3:4': '1776x2368',
    '16:9': '2816x1584',
    '9:16': '1584x2816',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
  },
};

function roundStep(n: number, step = 32): number {
  return Math.max(step, Math.round(n / step) * step);
}

function parseRatioPair(ratio: string): { w: number; h: number } | null {
  const m = String(ratio).trim().match(/^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

function parsePixels(raw: unknown): { w: number; h: number } | null {
  const m = String(raw ?? '').trim().match(PIXEL_SIZE_RE);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

function isKTierSize(raw: unknown): boolean {
  return K_TIER_RE.test(String(raw ?? '').trim());
}

function normalizeKTier(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!K_TIER_RE.test(s)) return s;
  return s.toUpperCase();
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function ratioFromPixels(w: number, h: number): string {
  const d = gcdInt(w, h);
  return `${w / d}:${h / d}`;
}

function longEdgeForTier(tier: string): number {
  const t = normalizeKTier(tier);
  if (t === '1K') return 1024;
  if (t === '1.5K') return 1536;
  if (t === '2K') return 2048;
  if (t === '3K') return 3072;
  if (t === '4K') return 4096;
  return 2048;
}

export function lookupPixelSize(
  resolution: string,
  ratio: string,
  sizeMap?: ImageSpecialSizeMap,
): string | null {
  const tier = normalizeKTier(resolution);
  const reso = String(resolution).trim();
  const r = String(ratio).trim();
  if (!r || r === 'auto' || r === '智能') return null;
  const mapped =
    (sizeMap && (sizeMap[reso]?.[r] || sizeMap[tier]?.[r])) || '';
  if (mapped.trim()) return mapped.trim();
  const hit = SIZE_TABLE[tier]?.[r];
  if (hit) return hit;
  const pair = parseRatioPair(r);
  if (!pair) return null;
  const long = longEdgeForTier(tier);
  const scale = pair.w >= pair.h ? long / pair.w : long / pair.h;
  const w = roundStep(pair.w * scale);
  const h = roundStep(pair.h * scale);
  return `${w}x${h}`;
}

function isUsableRatio(opt: string): boolean {
  const r = String(opt).trim();
  return !!r && r !== 'auto' && r !== '智能';
}

const DEFAULT_RESOLUTIONS = ['1K', '1.5K', '2K'];

/** Seedream 5.0 Pro 文档：方式 2 总像素 [921600, 4624220]，宽高比 [1/16, 16] */
export const IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS: Required<ImageSpecialCustomPixels> = {
  enabled: true,
  min_pixels: 921600,
  max_pixels: 4624220,
  min_aspect: '1:16',
  max_aspect: '16:1',
  step: 1,
};

export function isSmartRatio(ratio: unknown): boolean {
  const r = String(ratio ?? '').trim();
  return !r || r === 'auto' || r === '智能';
}

export function isCustomSizeEnabled(cfg: ImageSpecialParamsConfig | null | undefined): boolean {
  const size = cfg?.image_size;
  if (!size || size.enabled === false) return false;
  return size.custom?.enabled === true;
}

/** "1:16" / "1/16" / "0.0625" → 宽/高 */
function parseAspectBound(raw: unknown, fallback: number): number {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:：/]\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 0 && b > 0) return a / b;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

/**
 * 改一边、另一边不动：把正在改的边夹进总像素和宽高比，再按 step 对齐，越界再夹一次。
 * 无 paired 时只保证 ≥1。
 */
export function clampEditedPixel(opts: {
  value: number;
  paired: number;
  dimension: 'width' | 'height';
  custom?: ImageSpecialCustomPixels | null;
}): number {
  let next = Math.max(1, Math.round(Number(opts.value) || 1));
  const paired = Math.round(Number(opts.paired) || 0);
  const custom = opts.custom;
  const step = custom?.step && custom.step > 0 ? custom.step : 1;
  const minP = custom?.min_pixels && custom.min_pixels > 0 ? custom.min_pixels : undefined;
  const maxP = custom?.max_pixels && custom.max_pixels > 0 ? custom.max_pixels : undefined;
  const minA =
    custom?.min_aspect != null && String(custom.min_aspect).trim()
      ? parseAspectBound(custom.min_aspect, 1 / 16)
      : undefined;
  const maxA =
    custom?.max_aspect != null && String(custom.max_aspect).trim()
      ? parseAspectBound(custom.max_aspect, 16)
      : undefined;

  const applyBounds = (val: number) => {
    if (!(paired > 0)) return Math.max(1, val);
    let lo = 1;
    let hi = Number.POSITIVE_INFINITY;
    if (minP != null) lo = Math.max(lo, Math.ceil(minP / paired));
    if (maxP != null) hi = Math.min(hi, Math.floor(maxP / paired));
    if (opts.dimension === 'width') {
      if (minA != null) lo = Math.max(lo, Math.ceil(minA * paired));
      if (maxA != null) hi = Math.min(hi, Math.floor(maxA * paired));
    } else {
      if (maxA != null) lo = Math.max(lo, Math.ceil(paired / maxA));
      if (minA != null) hi = Math.min(hi, Math.floor(paired / minA));
    }
    if (lo > hi) return Math.max(val, lo);
    return Math.min(Math.max(val, lo), hi);
  };

  next = applyBounds(next);
  if (step > 1) {
    next = Math.max(step, Math.round(next / step) * step);
    next = applyBounds(next);
  }
  return Math.max(1, next);
}

/** Seedream 5.0 Pro 推荐宽高：缺格用文档表补齐，已填的格子保留 */
function fillSizeMap(
  existing: ImageSpecialSizeMap | undefined,
  ratios?: string[],
  resolutions?: string[],
): ImageSpecialSizeMap {
  const rs = (ratios && ratios.length ? ratios : [...IMAGE_SPECIAL_RATIO_PRESETS]).filter(isUsableRatio);
  const os = (resolutions && resolutions.length ? resolutions : DEFAULT_RESOLUTIONS)
    .map((r) => String(r).trim())
    .filter(Boolean);
  const out: ImageSpecialSizeMap = {};
  for (const reso of os) {
    out[reso] = {};
    for (const ratio of rs) {
      const px = lookupPixelSize(reso, ratio, existing);
      if (px) out[reso][ratio] = px;
    }
  }
  return out;
}

/** 当前比例 × 分辨率下的去重尺寸列表（无自定义表时用 Seedream 5.0 Pro 默认） */
export function associatedImageSizes(
  ratios: string[] | undefined,
  resolutions: string[] | undefined,
  sizeMap?: ImageSpecialSizeMap,
): string[] {
  const rs = (ratios && ratios.length ? ratios : [...IMAGE_SPECIAL_RATIO_PRESETS]).filter(isUsableRatio);
  const os = resolutions && resolutions.length ? resolutions : DEFAULT_RESOLUTIONS;
  const filled = fillSizeMap(sizeMap, rs, os);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ratio of rs) {
    for (const reso of os) {
      const px = String(filled[String(reso).trim()]?.[ratio] || '').trim();
      if (px && !seen.has(px)) {
        seen.add(px);
        out.push(px);
      }
    }
  }
  return out;
}

export function normalizeSizeMap(raw: unknown): ImageSpecialSizeMap | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: ImageSpecialSizeMap = {};
  for (const [reso, ratios] of Object.entries(raw as Record<string, unknown>)) {
    const rkey = String(reso).trim();
    if (!rkey || !ratios || typeof ratios !== 'object' || Array.isArray(ratios)) continue;
    const inner: Record<string, string> = {};
    for (const [ratio, size] of Object.entries(ratios as Record<string, unknown>)) {
      const rk = String(ratio).trim();
      const sv = String(size ?? '').trim();
      if (rk && sv) inner[rk] = sv;
    }
    if (Object.keys(inner).length) out[rkey] = inner;
  }
  return Object.keys(out).length ? out : undefined;
}

function matchPixelsInTables(
  token: string,
  resoOpts: string[],
  ratioOpts: string[],
  sizeMap?: ImageSpecialSizeMap,
): { ratio: string; resolution: string } | null {
  const tables: ImageSpecialSizeMap[] = [];
  if (sizeMap) tables.push(sizeMap);
  tables.push(SIZE_TABLE);
  for (const table of tables) {
    for (const [tier, map] of Object.entries(table)) {
      const reso =
        resoOpts.find((o) => o === tier || normalizeKTier(o) === normalizeKTier(tier)) || '';
      if (!reso) continue;
      for (const [ratio, val] of Object.entries(map)) {
        if (val === token && ratioOpts.includes(ratio)) {
          return { ratio, resolution: reso };
        }
      }
    }
  }
  return null;
}

function nearestTier(longEdge: number, options: string[]): string {
  let best = options[0] || '2K';
  let bestDiff = Infinity;
  for (const opt of options) {
    const d = Math.abs(longEdgeForTier(opt) - longEdge);
    if (d < bestDiff) {
      best = opt;
      bestDiff = d;
    }
  }
  return best;
}

function nearestRatio(w: number, h: number, options: string[]): string {
  const target = w / h;
  let best = options.find((o) => o !== 'auto') || options[0] || '1:1';
  let bestDiff = Infinity;
  for (const opt of options) {
    if (opt === 'auto') continue;
    const pair = parseRatioPair(opt);
    if (!pair) continue;
    const d = Math.abs(pair.w / pair.h - target);
    if (d < bestDiff) {
      best = opt;
      bestDiff = d;
    }
  }
  return best;
}

const OFFICIAL_RATIO_OPTIONS = ['auto', ...IMAGE_SPECIAL_RATIO_PRESETS];

const SIZE_MAP_2K_STANDARD: Record<string, string> = {
  '1:1': '2048x2048',
  '4:3': '2304x1728',
  '3:4': '1728x2304',
  '16:9': '2848x1600',
  '9:16': '1600x2848',
  '3:2': '2496x1664',
  '2:3': '1664x2496',
  '21:9': '3136x1344',
};

const SIZE_MAP_3K_LITE: Record<string, string> = {
  '1:1': '3072x3072',
  '4:3': '3456x2592',
  '3:4': '2592x3456',
  '16:9': '4096x2304',
  '9:16': '2304x4096',
  '3:2': '3744x2496',
  '2:3': '2496x3744',
  '21:9': '4704x2016',
};

const SIZE_MAP_4K_STANDARD: Record<string, string> = {
  '1:1': '4096x4096',
  '4:3': '4704x3520',
  '3:4': '3520x4704',
  '16:9': '5504x3040',
  '9:16': '3040x5504',
  '3:2': '4992x3328',
  '2:3': '3328x4992',
  '21:9': '6240x2656',
};

/** GPT Image 2 / 2.5 官方常用尺寸：边长 ≤3840、16 倍数、长短边 ≤3:1、总像素 [655360, 8294400] */
const GPT_IMAGE_2_SCHEME_ID = 'gpt-image-2';
const GPT_SIZE_MAP_1K: Record<string, string> = {
  '1:1': '1024x1024',
  '4:3': '1024x768',
  '3:4': '768x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '21:9': '1344x576',
};
const GPT_SIZE_MAP_2K: Record<string, string> = {
  '1:1': '2048x2048',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '3:2': '2048x1360',
  '2:3': '1360x2048',
  '21:9': '2016x864',
};
const GPT_SIZE_MAP_4K: Record<string, string> = {
  '1:1': '2880x2880',
  '4:3': '3264x2448',
  '3:4': '2448x3264',
  '16:9': '3840x2160',
  '9:16': '2160x3840',
  '3:2': '3504x2336',
  '2:3': '2336x3504',
  '21:9': '3840x1648',
};
const GPT_IMAGE_CUSTOM: Required<ImageSpecialCustomPixels> = {
  enabled: true,
  min_pixels: 655360,
  max_pixels: 8294400,
  min_aspect: '1:3',
  max_aspect: '3:1',
  step: 16,
};

function isGptImage2Scheme(schemeId?: string | null): boolean {
  return String(schemeId || '') === GPT_IMAGE_2_SCHEME_ID;
}

/** GPT-Image-2 创作方案：图片专用参数必须开启且不可关闭 */
export function isImageSpecialForcedOn(schemeId?: string | null): boolean {
  return isGptImage2Scheme(schemeId);
}

export function keepsSizeAuto(cfg?: ImageSpecialParamsConfig | null): boolean {
  return String(cfg?.smart_size || '').trim().toLowerCase() === 'auto';
}

function officialImageSpecialBlock(
  resolutions: string[],
  defaultResolution: string,
  sizeMap: ImageSpecialSizeMap,
  minPixels: number,
  maxPixels: number,
): ImageSpecialParamsConfig {
  return {
    enabled: true,
    aspect_ratio: {
      enabled: true,
      key: 'ratio',
      in_request: false,
      options: [...OFFICIAL_RATIO_OPTIONS],
      default: 'auto',
    },
    image_size: {
      enabled: true,
      key: 'size',
      in_request: true,
      size_map: sizeMap,
      custom: {
        enabled: true,
        min_pixels: minPixels,
        max_pixels: maxPixels,
        min_aspect: '1:16',
        max_aspect: '16:1',
        step: 1,
      },
    },
    resolution: {
      enabled: true,
      key: 'resolution',
      in_request: false,
      options: [...resolutions],
      default: defaultResolution,
    },
  };
}

/** 火山教程「图像输出尺寸」：按方案 ID 返回官方专用参数；未知方案回退 Pro。 */
export function officialImageSpecialParams(schemeId?: string | null): ImageSpecialParamsConfig {
  switch (String(schemeId || '')) {
    case 'seedream_5_0':
      return officialImageSpecialBlock(
        ['2K', '3K', '4K'],
        '2K',
        { '2K': { ...SIZE_MAP_2K_STANDARD }, '3K': { ...SIZE_MAP_3K_LITE }, '4K': { ...SIZE_MAP_4K_STANDARD } },
        3686400,
        16777216,
      );
    case 'seedream_4_5':
      return officialImageSpecialBlock(
        ['2K', '4K'],
        '2K',
        { '2K': { ...SIZE_MAP_2K_STANDARD }, '4K': { ...SIZE_MAP_4K_STANDARD } },
        3686400,
        16777216,
      );
    case 'seedream_4_0':
      return officialImageSpecialBlock(
        ['1K', '2K', '4K'],
        '1K',
        {
          '1K': {
            '1:1': '1024x1024',
            '4:3': '1152x864',
            '3:4': '864x1152',
            '16:9': '1312x736',
            '9:16': '736x1312',
            '3:2': '1248x832',
            '2:3': '832x1248',
            '21:9': '1568x672',
          },
          '2K': { ...SIZE_MAP_2K_STANDARD },
          '4K': { ...SIZE_MAP_4K_STANDARD },
        },
        921600,
        16777216,
      );
    case 'gpt-image-2': {
      const ratios = ['auto', '9:16', '3:4', '2:3', '1:1', '4:3', '3:2', '16:9', '21:9'];
      const resolutions = ['1K', '2K', '4K'];
      const block = officialImageSpecialBlock(
        resolutions,
        '1K',
        {
          '1K': { ...GPT_SIZE_MAP_1K },
          '2K': { ...GPT_SIZE_MAP_2K },
          '4K': { ...GPT_SIZE_MAP_4K },
        },
        GPT_IMAGE_CUSTOM.min_pixels,
        GPT_IMAGE_CUSTOM.max_pixels,
      );
      return {
        ...block,
        smart_size: 'auto',
        aspect_ratio: {
          ...block.aspect_ratio,
          options: ratios,
          default: 'auto',
        },
        image_size: {
          ...block.image_size,
          custom: { ...GPT_IMAGE_CUSTOM },
        },
      };
    }
    case 'seedream_5_0_pro':
    default:
      return officialImageSpecialBlock(
        [...DEFAULT_RESOLUTIONS],
        '1.5K',
        fillSizeMap(undefined, [...IMAGE_SPECIAL_RATIO_PRESETS], DEFAULT_RESOLUTIONS),
        IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.min_pixels,
        IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.max_pixels,
      );
  }
}

function cleanOptions(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const next = raw.map((v) => String(v).trim()).filter(Boolean);
  return next.length ? next : fallback;
}

function sectionKey(raw: unknown, fallback: string, legacyBind?: string): string {
  const k = typeof raw === 'string' ? raw.trim() : '';
  if (k) return k;
  if (legacyBind) return legacyBind;
  return fallback;
}

function positiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function normalizeCustom(raw: unknown): ImageSpecialCustomPixels | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    min_pixels: positiveInt(o.min_pixels, IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.min_pixels),
    max_pixels: positiveInt(o.max_pixels, IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.max_pixels),
    min_aspect: String(o.min_aspect || '').trim() || IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.min_aspect,
    max_aspect: String(o.max_aspect || '').trim() || IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.max_aspect,
    step: positiveInt(o.step, IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.step),
  };
}

export function normalizeImageSpecialParams(raw: unknown): ImageSpecialParamsConfig {
  if (!raw || typeof raw !== 'object') return { enabled: false };
  const o = raw as Record<string, unknown>;
  const aspect = (o.aspect_ratio && typeof o.aspect_ratio === 'object'
    ? o.aspect_ratio
    : {}) as Record<string, unknown>;
  const size = (o.image_size && typeof o.image_size === 'object'
    ? o.image_size
    : {}) as Record<string, unknown>;
  const reso = (o.resolution && typeof o.resolution === 'object'
    ? o.resolution
    : {}) as Record<string, unknown>;
  const legacyBind =
    typeof o.bind_key === 'string' && o.bind_key.trim() ? o.bind_key.trim() : '';
  const hasSectionKey = !!(
    (typeof aspect.key === 'string' && aspect.key.trim()) ||
    (typeof size.key === 'string' && size.key.trim()) ||
    (typeof reso.key === 'string' && reso.key.trim())
  );
  const sharedLegacy = !hasSectionKey && legacyBind ? legacyBind : '';
  const ratioOpts = cleanOptions(aspect.options, [...IMAGE_SPECIAL_RATIO_PRESETS]);
  const resoOpts = cleanOptions(reso.options, DEFAULT_RESOLUTIONS);
  const smartSize = typeof o.smart_size === 'string' ? o.smart_size.trim() : '';
  return {
    enabled: o.enabled === true,
    ...(smartSize ? { smart_size: smartSize } : {}),
    aspect_ratio: {
      enabled: aspect.enabled !== false,
      key: sectionKey(aspect.key, 'ratio', sharedLegacy),
      in_request: aspect.in_request !== false,
      options: ratioOpts,
      default: String(aspect.default || '1:1'),
    },
    image_size: {
      enabled: size.enabled !== false,
      key: sectionKey(size.key, 'size', sharedLegacy),
      in_request: size.in_request !== false,
      size_map: fillSizeMap(normalizeSizeMap(size.size_map), ratioOpts, resoOpts),
      custom: normalizeCustom(size.custom),
    },
    resolution: {
      enabled: reso.enabled !== false,
      key: sectionKey(reso.key, 'resolution', sharedLegacy),
      in_request: reso.in_request !== false,
      options: resoOpts,
      default: String(reso.default || '1.5K'),
    },
  };
}

/** 打开/启用专用参数时补齐 Seedream 5.0 Pro 默认关联表 */
export function seedImageSpecialParams(raw: unknown): ImageSpecialParamsConfig {
  return {
    ...normalizeImageSpecialParams(
      raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>), enabled: true } : { enabled: true },
    ),
    enabled: true,
  };
}

function isImageSpecialEnabled(cfg: unknown): boolean {
  return !!(cfg && typeof cfg === 'object' && (cfg as ImageSpecialParamsConfig).enabled === true);
}

export function imageSpecialHasControls(cfg: unknown): boolean {
  if (!isImageSpecialEnabled(cfg)) return false;
  const n = normalizeImageSpecialParams(cfg);
  return !!(n.aspect_ratio?.enabled || n.image_size?.enabled || n.resolution?.enabled);
}

function resolveSectionKey(
  section: { key?: string } | null | undefined,
  fallback: string,
): string {
  const k = String(section?.key || '').trim();
  return k || fallback;
}

export function imageSpecialParamKeys(cfg: ImageSpecialParamsConfig | null | undefined): string[] {
  if (!imageSpecialHasControls(cfg)) return [];
  const n = normalizeImageSpecialParams(cfg);
  const keys: string[] = [];
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  if (n.aspect_ratio?.enabled) push(resolveSectionKey(n.aspect_ratio, 'ratio'));
  if (n.image_size?.enabled) push(resolveSectionKey(n.image_size, 'size'));
  if (n.resolution?.enabled) push(resolveSectionKey(n.resolution, 'resolution'));
  return keys;
}

/** 关闭「接口传参」的字段：页面可选手值，但不写入上游请求 */
export function imageSpecialOmitRequestKeys(cfg: ImageSpecialParamsConfig | null | undefined): string[] {
  if (!imageSpecialHasControls(cfg)) return [];
  const n = normalizeImageSpecialParams(cfg);
  const pass = new Map<string, boolean[]>();
  const add = (enabled: boolean | undefined, key: string, inRequest: boolean | undefined) => {
    if (!enabled) return;
    const k = key.trim();
    if (!k) return;
    const list = pass.get(k) || [];
    list.push(inRequest !== false);
    pass.set(k, list);
  };
  add(n.aspect_ratio?.enabled, resolveSectionKey(n.aspect_ratio, 'ratio'), n.aspect_ratio?.in_request);
  add(n.image_size?.enabled, resolveSectionKey(n.image_size, 'size'), n.image_size?.in_request);
  add(n.resolution?.enabled, resolveSectionKey(n.resolution, 'resolution'), n.resolution?.in_request);
  const omit: string[] = [];
  pass.forEach((flags, key) => {
    if (flags.every((v) => !v)) omit.push(key);
  });
  return omit;
}

/** @deprecated 兼容旧调用；现为尺寸项 key */
function resolveImageSpecialBindKey(
  cfg: ImageSpecialParamsConfig | null | undefined,
  _params?: Array<{ key?: string }> | null,
): string {
  const n = normalizeImageSpecialParams(cfg);
  return resolveSectionKey(n.image_size, 'size');
}

function imageSpecialSkipKeys(model?: PlaygroundModel | null): string[] {
  return imageSpecialParamKeys(model?.image_special_params);
}

export function clampImageModelParams(
  values: Record<string, any>,
  model?: PlaygroundModel | null,
): Record<string, any> {
  return clampParamsToSchemeOptions(values, model?.params, imageSpecialSkipKeys(model));
}

export type ImageSpecialUiState = {
  ratio: string;
  resolution: string;
  width: number;
  height: number;
  customPixels: boolean;
};

function defaultImageSpecialUiState(cfg: ImageSpecialParamsConfig): ImageSpecialUiState {
  const n = normalizeImageSpecialParams(cfg);
  const ratioOpts = n.aspect_ratio?.options || [...IMAGE_SPECIAL_RATIO_PRESETS];
  const resoOpts = n.resolution?.options || [...DEFAULT_RESOLUTIONS];
  const ratioRaw = String(n.aspect_ratio?.default || '');
  const ratio = n.aspect_ratio?.enabled
    ? ratioOpts.includes(ratioRaw)
      ? ratioRaw
      : ratioOpts[0] || 'auto'
    : 'auto';
  const resoRaw = String(n.resolution?.default || '');
  const resolution = n.resolution?.enabled
    ? resoOpts.includes(resoRaw)
      ? resoRaw
      : resoOpts[0] || '2K'
    : '2K';
  const ratioKey = isSmartRatio(ratio) ? 'auto' : ratio;
  if (isSmartRatio(ratioKey)) {
    return { ratio: 'auto', resolution, width: 0, height: 0, customPixels: false };
  }
  const parsed = parsePixels(lookupPixelSize(resolution, ratioKey, n.image_size?.size_map));
  return {
    ratio: ratioKey,
    resolution,
    width: parsed?.w || 0,
    height: parsed?.h || 0,
    customPixels: false,
  };
}

export function composeImageSpecialDefaults(cfg: ImageSpecialParamsConfig): Record<string, string> {
  return composeImageSpecialValues(defaultImageSpecialUiState(cfg), cfg);
}

function pickImageSpecialDefault(cfg: ImageSpecialParamsConfig): string {
  const n = normalizeImageSpecialParams(cfg);
  const reso = n.resolution?.enabled
    ? String(n.resolution.default || n.resolution.options?.[0] || '2K')
    : '';
  const ratio = n.aspect_ratio?.enabled
    ? String(n.aspect_ratio.default || n.aspect_ratio.options?.[0] || 'auto')
    : 'auto';
  if (n.resolution?.enabled && (!n.aspect_ratio?.enabled || ratio === 'auto')) {
    return reso || '2K';
  }
  if (n.resolution?.enabled && ratio && ratio !== 'auto') {
    return lookupPixelSize(reso || '2K', ratio, n.image_size?.size_map) || `${reso}`;
  }
  if (ratio && ratio !== 'auto') return ratio;
  return reso || '2K';
}

export function parseImageSpecialState(
  values: Record<string, any> | unknown,
  cfg: ImageSpecialParamsConfig,
): ImageSpecialUiState {
  const n = normalizeImageSpecialParams(cfg);
  const ratioOpts = n.aspect_ratio?.options || [...IMAGE_SPECIAL_RATIO_PRESETS];
  const resoOpts = n.resolution?.options || ['1K', '1.5K', '2K'];
  const defaultRatio = ratioOpts.includes(String(n.aspect_ratio?.default))
    ? String(n.aspect_ratio?.default)
    : ratioOpts[0] || 'auto';
  const defaultReso = resoOpts.includes(String(n.resolution?.default))
    ? String(n.resolution?.default)
    : resoOpts[0] || '2K';
  const ratioKey = resolveSectionKey(n.aspect_ratio, 'ratio');
  const sizeKey = resolveSectionKey(n.image_size, 'size');
  const resoKey = resolveSectionKey(n.resolution, 'resolution');
  const vals =
    values && typeof values === 'object' && !Array.isArray(values)
      ? (values as Record<string, any>)
      : {};

  const ratioRaw = String(vals[ratioKey] ?? '').trim();
  const resoRaw = String(vals[resoKey] ?? '').trim();
  const sizeRaw = String(vals[sizeKey] ?? '').trim();
  const merged = sizeRaw || resoRaw || ratioRaw;

  const sizeMap = n.image_size?.size_map;
  const fromSingle = (raw: string): ImageSpecialUiState | null => {
    if (isKTierSize(raw)) {
      const resolution = resoOpts.find((o) => normalizeKTier(o) === normalizeKTier(raw)) || defaultReso;
      const px = lookupPixelSize(resolution, defaultRatio === 'auto' ? '1:1' : defaultRatio, sizeMap) || '2048x2048';
      const parsed = parsePixels(px) || { w: 2048, h: 2048 };
      return {
        ratio: ratioOpts.includes('auto') ? 'auto' : defaultRatio,
        resolution,
        width: parsed.w,
        height: parsed.h,
        customPixels: false,
      };
    }
    const pixels = parsePixels(raw);
    if (pixels) {
      const token = `${pixels.w}x${pixels.h}`;
      const hit = matchPixelsInTables(token, resoOpts, ratioOpts, sizeMap);
      if (hit) {
        return {
          ratio: hit.ratio,
          resolution: hit.resolution,
          width: pixels.w,
          height: pixels.h,
          customPixels: false,
        };
      }
      return {
        ratio: nearestRatio(pixels.w, pixels.h, ratioOpts),
        resolution: nearestTier(Math.max(pixels.w, pixels.h), resoOpts),
        width: pixels.w,
        height: pixels.h,
        customPixels: true,
      };
    }
    if (raw && (parseRatioPair(raw) || raw === 'auto' || raw === '智能') && (ratioOpts.includes(raw) || raw === '智能')) {
      const ratio = raw === '智能' ? 'auto' : raw;
      const px = lookupPixelSize(defaultReso, ratio === 'auto' ? '1:1' : ratio, sizeMap) || '2048x2048';
      const parsed = parsePixels(px) || { w: 2048, h: 2048 };
      return {
        ratio,
        resolution: defaultReso,
        width: parsed.w,
        height: parsed.h,
        customPixels: false,
      };
    }
    return null;
  };

  let state = fromSingle(merged) || {
    ratio: defaultRatio,
    resolution: defaultReso,
    width: 2048,
    height: 2048,
    customPixels: false,
  };

  if (ratioRaw && (ratioOpts.includes(ratioRaw) || ratioRaw === '智能')) {
    state = { ...state, ratio: ratioRaw === '智能' ? 'auto' : ratioRaw };
  }
  if (resoRaw) {
    const hit = resoOpts.find((o) => normalizeKTier(o) === normalizeKTier(resoRaw) || o === resoRaw);
    if (hit) state = { ...state, resolution: hit };
  }
  const sizePixels = parsePixels(sizeRaw);
  if (sizePixels && sizeKey !== resoKey) {
    state = { ...state, width: sizePixels.w, height: sizePixels.h, customPixels: !fromSingle(sizeRaw) || isKTierSize(sizeRaw) === false };
    if (!isKTierSize(sizeRaw)) {
      const token = `${sizePixels.w}x${sizePixels.h}`;
      const tableHit = !!matchPixelsInTables(token, resoOpts, ratioOpts, sizeMap);
      state = { ...state, customPixels: !tableHit };
    }
  }
  if (isSmartRatio(state.ratio) && !state.customPixels) {
    return { ...state, width: 0, height: 0 };
  }
  return state;
}

function composeImageSpecialSize(state: ImageSpecialUiState, cfg: ImageSpecialParamsConfig): string {
  const n = normalizeImageSpecialParams(cfg);
  if (state.customPixels && n.image_size?.enabled) {
    return `${Math.round(state.width)}x${Math.round(state.height)}`;
  }
  const smart = isSmartRatio(state.ratio);
  if (smart && n.smart_size) {
    return n.smart_size;
  }
  if (n.resolution?.enabled && (smart || !n.aspect_ratio?.enabled)) {
    return state.resolution;
  }
  if (n.aspect_ratio?.enabled && !smart && n.resolution?.enabled) {
    return lookupPixelSize(state.resolution, state.ratio, n.image_size?.size_map)
      || `${Math.round(state.width)}x${Math.round(state.height)}`;
  }
  if (n.aspect_ratio?.enabled && !smart) return state.ratio;
  if (n.resolution?.enabled) return state.resolution;
  if (n.image_size?.enabled && state.width > 0 && state.height > 0) {
    return `${Math.round(state.width)}x${Math.round(state.height)}`;
  }
  return state.resolution || '2K';
}

function pixelToken(state: ImageSpecialUiState): string {
  return `${Math.round(state.width)}x${Math.round(state.height)}`;
}

export function composeImageSpecialValues(
  state: ImageSpecialUiState,
  cfg: ImageSpecialParamsConfig,
): Record<string, string> {
  const n = normalizeImageSpecialParams(cfg);
  const ratioKey = resolveSectionKey(n.aspect_ratio, 'ratio');
  const sizeKey = resolveSectionKey(n.image_size, 'size');
  const resoKey = resolveSectionKey(n.resolution, 'resolution');
  const composed = composeImageSpecialSize(state, n);
  const smart = isSmartRatio(state.ratio);
  const custom = !!state.customPixels && !!n.image_size?.enabled;
  const out: Record<string, string> = {};
  if (n.aspect_ratio?.enabled) out[ratioKey] = smart ? 'auto' : state.ratio;
  if (n.resolution?.enabled) out[resoKey] = state.resolution;
  if (n.image_size?.enabled) {
    if (custom) out[sizeKey] = pixelToken(state);
    else if (smart) out[sizeKey] = n.smart_size || state.resolution || composed;
    else {
      out[sizeKey] =
        lookupPixelSize(state.resolution, state.ratio, n.image_size?.size_map) || pixelToken(state);
    }
  }

  const activeKeys = [
    n.aspect_ratio?.enabled ? ratioKey : '',
    n.image_size?.enabled ? sizeKey : '',
    n.resolution?.enabled ? resoKey : '',
  ].filter(Boolean);
  const unique = new Set(activeKeys);
  if (unique.size === 1 && activeKeys[0]) {
    out[activeKeys[0]] = composed;
  } else if (n.image_size?.enabled && n.resolution?.enabled && sizeKey === resoKey) {
    out[sizeKey] = composed;
  }
  return out;
}

/** 请求组包：智能不传比例；手填只传 WxH；尺寸已是像素时丢掉档位关键字 */
export function applyImageSpecialRequestPack(
  body: Record<string, any>,
  cfg: ImageSpecialParamsConfig | null | undefined,
  values: Record<string, any> | undefined,
): void {
  if (!imageSpecialHasControls(cfg)) return;
  const n = normalizeImageSpecialParams(cfg);
  const state = parseImageSpecialState(values || {}, n);
  const ratioKey = resolveSectionKey(n.aspect_ratio, 'ratio');
  const sizeKey = resolveSectionKey(n.image_size, 'size');
  const resoKey = resolveSectionKey(n.resolution, 'resolution');
  const sizeIn = !!(n.image_size?.enabled && n.image_size.in_request !== false);
  const resoIn = !!(n.resolution?.enabled && n.resolution.in_request !== false);
  const custom = !!state.customPixels && !!n.image_size?.enabled;
  const smart = isSmartRatio(state.ratio);
  const sizeWhenSmart = n.smart_size || state.resolution || '2K';

  if (custom) {
    delete body[ratioKey];
    if (resoKey !== sizeKey) delete body[resoKey];
    if (sizeIn) body[sizeKey] = pixelToken(state);
    else if (sizeKey !== resoKey) delete body[sizeKey];
    return;
  }
  if (smart) {
    delete body[ratioKey];
    if (sizeIn) body[sizeKey] = sizeWhenSmart;
    if (resoIn && resoKey !== sizeKey) body[resoKey] = n.smart_size || state.resolution || '2K';
    return;
  }
  if (sizeIn) {
    const px =
      lookupPixelSize(state.resolution, state.ratio, n.image_size?.size_map) || pixelToken(state);
    body[sizeKey] = px;
    if (PIXEL_SIZE_RE.test(px)) {
      if (resoKey !== sizeKey) delete body[resoKey];
      if (ratioKey !== sizeKey) delete body[ratioKey];
    }
  }
  if (isSmartRatio(body[ratioKey])) delete body[ratioKey];
}

function formatImageSpecialSummary(
  cfg: ImageSpecialParamsConfig | null | undefined,
  values: Record<string, any>,
  _params?: SchemeParam[] | null,
): string {
  if (!imageSpecialHasControls(cfg)) return '';
  const n = normalizeImageSpecialParams(cfg);
  const state = parseImageSpecialState(values, n);
  const parts: string[] = [];
  if (state.customPixels && n.image_size?.enabled) {
    parts.push(`${state.width}×${state.height}`);
    return parts.join(' | ');
  }
  if (n.aspect_ratio?.enabled) {
    parts.push(isSmartRatio(state.ratio) ? '智能' : state.ratio);
  }
  if (n.image_size?.enabled && !isSmartRatio(state.ratio) && state.width > 0 && state.height > 0) {
    parts.push(`${state.width}×${state.height}`);
  }
  if (n.resolution?.enabled) {
    parts.push(state.resolution);
  }
  return parts.filter(Boolean).join(' | ');
}

export function formatImageParamsTriggerLabel(
  model: PlaygroundModel | null | undefined,
  displayParams: SchemeParam[],
  values: Record<string, any>,
  fallback: string,
): string {
  const cfg = model?.image_special_params;
  if (!imageSpecialHasControls(cfg)) {
    return formatShortcutSummary(getShortcutSummaryParams(displayParams), values) || fallback;
  }
  const skip = new Set(imageSpecialParamKeys(cfg));
  const special = formatImageSpecialSummary(cfg, values, model?.params || displayParams);
  const quick = getShortcutSummaryParams(displayParams, { skipFirstFallback: true }).filter(
    (p) => !skip.has(p.key),
  );
  const quickText = formatShortcutSummary(quick, values);
  return [special, quickText].filter(Boolean).join(' | ') || fallback;
}

export function imageSpecialRestParams(
  displayParams: SchemeParam[],
  model?: PlaygroundModel | null,
): SchemeParam[] {
  if (!imageSpecialHasControls(model?.image_special_params)) return displayParams;
  const skip = new Set(imageSpecialParamKeys(model?.image_special_params));
  return displayParams.filter((p) => !skip.has(p.key));
}
