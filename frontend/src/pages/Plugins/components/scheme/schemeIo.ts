/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 创作方案工作流 IO：合并覆写、默认口、连线校验、无效连线
 */
import type {
  CanvasNode,
  PlaygroundModel,
  SchemeAssetKind,
  SchemeIoOverrides,
  SchemePort,
  SchemePortModality,
} from './types';
import { isWorkflowBasicNodeType, WORKFLOW_BASIC_NODE_TYPES } from './workflowBasicNodes';
import { flowPortSocketLabel, flowSocketLabelZh } from './flowSocketLabels';

const BIND_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const SCHEME_ASSET_KIND_OPTIONS: { value: SchemeAssetKind; label: string }[] = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'document', label: '文档' },
];

/** 按口 modality 推导默认允许的素材类型 */
export function defaultAcceptAssetKinds(modality: SchemePortModality | string): SchemeAssetKind[] {
  if (modality === 'image') return ['image'];
  if (modality === 'video') return ['video'];
  if (modality === 'audio') return ['audio'];
  if (modality === 'file') return ['image', 'video', 'audio', 'document'];
  return [];
}

const NODE_TYPE_ZH: Record<string, string> = Object.fromEntries(
  WORKFLOW_BASIC_NODE_TYPES.map((t) => [t.key, t.label]),
);
NODE_TYPE_ZH.image = '图片';
NODE_TYPE_ZH.video = '视频';
NODE_TYPE_ZH.audio = '音频';
NODE_TYPE_ZH.file = '文件';
NODE_TYPE_ZH.text = '文本';
NODE_TYPE_ZH.ai_text = '文本';

const MODALITY_ZH: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
};

function nodeTypeLabelZh(type: string): string {
  return NODE_TYPE_ZH[type] || type;
}

function modalityLabelZh(modality: string): string {
  return MODALITY_ZH[modality] || modality;
}

function isValidBindKey(key: string): boolean {
  return !!key && BIND_KEY_RE.test(key);
}

/** 图片方案默认 IO（无种子时 fallback） */
function defaultImageSchemeIo(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  return {
    inputs: [
      {
        key: 'prompt',
        label: '提示词',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Prompt',
        bind_key: 'prompt',
        accepts: ['prompt'],
        required: true,
        max: 1,
      },
      {
        key: 'reference_images',
        label: '参考图',
        enabled: true,
        modality: 'image',
        handle_prefix: 'Reference Image',
        bind_key: 'image_urls',
        accepts: ['asset', 'ai_image', 'preview', 'director'],
        accept_asset_kinds: ['image'],
        max: 7,
        expandable: true,
        default_count: 1,
      },
    ],
    outputs: [
      {
        key: 'images',
        label: '图片列表',
        enabled: true,
        modality: 'image',
        handle_prefix: 'Image',
        result_key: 'image_url',
        max: 1,
      },
    ],
  };
}

/** 视频方案默认 IO（无种子 / 非多模态时 fallback） */
function defaultVideoSchemeIo(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  return {
    inputs: [
      {
        key: 'prompt',
        label: '提示词',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Prompt',
        bind_key: 'prompt',
        accepts: ['prompt'],
        required: true,
        max: 1,
      },
      {
        key: 'negative_prompt',
        label: '反向提示词',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Negative Prompt',
        bind_key: 'negative_prompt',
        accepts: ['prompt'],
        max: 1,
      },
    ],
    outputs: [
      {
        key: 'video',
        label: '视频',
        enabled: true,
        modality: 'video',
        handle_prefix: 'Video',
        result_key: 'video_url',
        max: 1,
      },
    ],
  };
}

/** Seedance / 多模态视频模板 */
function multimodalVideoSchemeIo(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  return {
    inputs: [
      {
        key: 'prompt',
        label: '提示词',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Prompt',
        bind_key: 'prompt',
        accepts: ['prompt'],
        required: true,
        max: 1,
      },
      {
        key: 'reference_images',
        label: '参考图',
        enabled: true,
        modality: 'image',
        handle_prefix: 'Reference Images',
        bind_key: 'image_urls',
        accepts: ['asset', 'ai_image', 'preview', 'director'],
        accept_asset_kinds: ['image'],
        max: 9,
        expandable: true,
        default_count: 1,
      },
      {
        key: 'reference_videos',
        label: '参考视频',
        enabled: true,
        modality: 'video',
        handle_prefix: 'Reference Videos',
        bind_key: 'video_urls',
        accepts: ['asset', 'ai_video', 'preview'],
        accept_asset_kinds: ['video'],
        max: 3,
        expandable: true,
        default_count: 1,
      },
      {
        key: 'reference_audio',
        label: '参考音频',
        enabled: true,
        modality: 'audio',
        handle_prefix: 'Reference Audio',
        bind_key: 'audio_urls',
        accepts: ['asset'],
        accept_asset_kinds: ['audio'],
        max: 3,
        expandable: true,
        default_count: 1,
      },
    ],
    outputs: [
      {
        key: 'video',
        label: '视频',
        enabled: true,
        modality: 'video',
        handle_prefix: 'Video',
        result_key: 'video_url',
        max: 1,
      },
    ],
  };
}

/** 图片方案完整口目录（管理端始终展示） */
export function fullImageSchemeIoCatalog(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  const base = defaultImageSchemeIo();
  return {
    inputs: base.inputs.map((p) => ({
      ...p,
      accepts: p.accepts ? [...p.accepts] : undefined,
      accept_asset_kinds: p.accept_asset_kinds ? [...p.accept_asset_kinds] : undefined,
    })),
    outputs: base.outputs.map((p) => ({ ...p })),
  };
}

/** 音频方案完整口目录（文生语音） */
export function fullAudioSchemeIoCatalog(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  return {
    inputs: [
      {
        key: 'prompt',
        label: '提示词',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Prompt',
        bind_key: 'prompt',
        accepts: ['prompt'],
        required: true,
        max: 1,
      },
    ],
    outputs: [
      {
        key: 'audio',
        label: '音频',
        enabled: true,
        modality: 'audio',
        handle_prefix: 'Audio',
        result_key: 'audio_url',
        max: 1,
      },
    ],
  };
}

const WAN3_FAMILY_SCHEME_IDS = new Set(['wan3.0', 'dashscope_video']);

export function isWan3FamilySchemeId(schemeId?: string | null): boolean {
  return !!schemeId && WAN3_FAMILY_SCHEME_IDS.has(schemeId);
}

export function isMinimaxH3SchemeId(schemeId?: string | null): boolean {
  return schemeId === 'minimax-h3';
}

export function isDoubaoSeedEvolvingSchemeId(schemeId?: string | null): boolean {
  return schemeId === 'doubao_seed_evolving';
}

/** 聊天方案完整口目录。深度思考是能力开关，目录默认关；豆包 / GLM / DeepSeek / 千问方案种子再打开。 */
export function fullChatSchemeIoCatalog(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  return {
    inputs: [
      {
        key: 'prompt',
        label: '提示词',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Prompt',
        bind_key: 'prompt',
        accepts: ['prompt'],
        required: true,
        max: 1,
      },
      {
        key: 'thinking',
        label: '深度思考',
        enabled: false,
        modality: 'text',
        handle_prefix: 'Thinking',
        bind_key: 'feature:thinking',
        max: 0,
      },
    ],
    outputs: [
      {
        key: 'message',
        label: '回复',
        enabled: true,
        modality: 'text',
        handle_prefix: 'Message',
        result_key: 'content',
        max: 1,
      },
    ],
  };
}

export function isThinkingFeaturePort(port: SchemePort | null | undefined): boolean {
  return (port?.key || '') === 'thinking';
}

/** 方案或模型 IO 打开了深度思考能力（继承方案，模型可覆写 enabled） */
export function modelThinkingIoEnabled(model: PlaygroundModel | null | undefined): boolean {
  const port = (model?.inputs || []).find((p) => isThinkingFeaturePort(p));
  return !!port && port.enabled !== false;
}

/** 视频方案完整口目录（管理端始终展示；快捷模板只改 enabled） */
function fullVideoSchemeIoCatalog(): { inputs: SchemePort[]; outputs: SchemePort[] } {
  return {
    inputs: [
      {
        key: 'prompt',
        label: '提示词',
        enabled: false,
        modality: 'text',
        handle_prefix: 'Prompt',
        bind_key: 'prompt',
        accepts: ['prompt'],
        required: true,
        max: 1,
      },
      {
        key: 'negative_prompt',
        label: '反向提示词',
        enabled: false,
        modality: 'text',
        handle_prefix: 'Negative Prompt',
        bind_key: 'negative_prompt',
        accepts: ['prompt'],
        max: 1,
      },
      {
        key: 'start_frame',
        label: '图生视频',
        enabled: false,
        modality: 'image',
        handle_prefix: 'Start Frame',
        bind_key: 'image_url',
        accepts: ['asset', 'ai_image', 'preview', 'director'],
        accept_asset_kinds: ['image'],
        max: 1,
      },
      {
        key: 'end_frame',
        label: '尾帧',
        enabled: false,
        modality: 'image',
        handle_prefix: 'End Frame',
        bind_key: 'end_image_url',
        accepts: ['asset', 'ai_image', 'preview', 'director'],
        accept_asset_kinds: ['image'],
        max: 1,
      },
      {
        key: 'reference_images',
        label: '参考图',
        enabled: false,
        modality: 'image',
        handle_prefix: 'Reference Images',
        bind_key: 'image_urls',
        accepts: ['asset', 'ai_image', 'preview', 'director'],
        accept_asset_kinds: ['image'],
        max: 9,
        expandable: true,
        default_count: 1,
      },
      {
        key: 'reference_videos',
        label: '参考视频',
        enabled: false,
        modality: 'video',
        handle_prefix: 'Reference Videos',
        bind_key: 'video_urls',
        accepts: ['asset', 'ai_video', 'preview'],
        accept_asset_kinds: ['video'],
        max: 3,
        expandable: true,
        default_count: 1,
      },
      {
        key: 'reference_audio',
        label: '参考音频',
        enabled: false,
        modality: 'audio',
        handle_prefix: 'Reference Audio',
        bind_key: 'audio_urls',
        accepts: ['asset'],
        accept_asset_kinds: ['audio'],
        max: 3,
        expandable: true,
        default_count: 1,
      },
    ],
    outputs: [
      {
        key: 'video',
        label: '视频',
        enabled: false,
        modality: 'video',
        handle_prefix: 'Video',
        result_key: 'video_url',
        max: 1,
      },
      {
        key: 'last_frame_image',
        label: '最后一帧',
        enabled: false,
        modality: 'image',
        handle_prefix: 'Last Frame',
        result_key: 'last_frame_image_url',
        max: 1,
      },
    ],
  };
}

/** 用完整目录铺齐口；结构字段以目录为准，启用/绑定等保留已有值 */
export function mergePortsWithCatalog(
  catalog: SchemePort[],
  current?: SchemePort[] | null,
): SchemePort[] {
  const map = new Map((current || []).filter((p) => p?.key).map((p) => [p.key, p]));
  return catalog.map((base) => {
    const cur = map.get(base.key);
    if (!cur) {
      return {
        ...base,
        accepts: base.accepts ? [...base.accepts] : undefined,
        accept_asset_kinds: base.accept_asset_kinds ? [...base.accept_asset_kinds] : undefined,
      };
    }
    const accepts = cur.accepts?.length ? [...cur.accepts] : base.accepts ? [...base.accepts] : undefined;
    let accept_asset_kinds =
      cur.accept_asset_kinds?.length
        ? [...cur.accept_asset_kinds]
        : base.accept_asset_kinds?.length
          ? [...base.accept_asset_kinds]
          : undefined;
    // 勾了素材但未写 kinds：按 modality 补默认，便于管理端展示
    if (accepts?.includes('asset') && !accept_asset_kinds?.length) {
      accept_asset_kinds = defaultAcceptAssetKinds(cur.modality || base.modality);
    }
    if (!accepts?.includes('asset')) {
      accept_asset_kinds = undefined;
    }
    return {
      ...base,
      enabled: cur.enabled !== undefined ? cur.enabled : base.enabled,
      label: base.key === 'start_frame' ? base.label : cur.label || base.label,
      handle_prefix: cur.handle_prefix || base.handle_prefix,
      bind_key: cur.bind_key ?? base.bind_key,
      result_key: cur.result_key ?? base.result_key,
      accepts,
      accept_asset_kinds,
      required: cur.required ?? base.required,
      max: cur.max ?? base.max,
      min: cur.min ?? base.min,
      expandable: cur.expandable ?? base.expandable,
      default_count: cur.default_count ?? base.default_count,
    };
  });
}

export function applyIoEnabledKeys(
  catalog: { inputs: SchemePort[]; outputs: SchemePort[] },
  current: { inputs?: SchemePort[] | null; outputs?: SchemePort[] | null },
  enabledInputKeys: string[],
  enabledOutputKeys: string[],
): { inputs: SchemePort[]; outputs: SchemePort[] } {
  const inSet = new Set(enabledInputKeys);
  const outSet = new Set(enabledOutputKeys);
  return {
    inputs: mergePortsWithCatalog(catalog.inputs, current.inputs).map((p) => ({
      ...p,
      enabled: inSet.has(p.key),
    })),
    outputs: mergePortsWithCatalog(catalog.outputs, current.outputs).map((p) => ({
      ...p,
      enabled: outSet.has(p.key),
    })),
  };
}

/** 快捷模板：仅指定启用的口 key */
export const IO_TEMPLATE_ENABLE: Record<
  string,
  { inputs: string[]; outputs: string[] }
> = {
  image_default: {
    inputs: ['prompt', 'reference_images'],
    outputs: ['images'],
  },
  image_seedream_5_0_pro: {
    inputs: ['prompt', 'reference_images'],
    outputs: ['images'],
  },
  video_text: {
    inputs: ['prompt', 'negative_prompt'],
    outputs: ['video'],
  },
  video_openai: {
    inputs: ['prompt', 'start_frame'],
    outputs: ['video'],
  },
  video_multimodal: {
    inputs: ['prompt', 'reference_images', 'reference_videos', 'reference_audio'],
    outputs: ['video'],
  },
  video_start_end: {
    inputs: ['prompt', 'start_frame', 'end_frame'],
    outputs: ['video'],
  },
  video_minimax_h3: {
    inputs: [
      'prompt',
      'start_frame',
      'end_frame',
      'reference_images',
      'reference_videos',
      'reference_audio',
    ],
    outputs: ['video'],
  },
  video_seedance2: {
    inputs: [
      'prompt',
      'start_frame',
      'end_frame',
      'reference_images',
      'reference_videos',
      'reference_audio',
      'edit_video',
      'extend_video',
    ],
    outputs: ['video'],
  },
  video_dashscope_wan3: {
    inputs: [
      'prompt',
      'start_frame',
      'end_frame',
      'reference_images',
      'reference_videos',
      'reference_audio',
      'edit_video',
      'extend_video',
    ],
    outputs: ['video'],
  },
  audio_tts: {
    inputs: ['prompt'],
    outputs: ['audio'],
  },
  chat_default: {
    inputs: ['prompt'],
    outputs: ['message'],
  },
  chat_doubao: {
    inputs: ['prompt', 'thinking'],
    outputs: ['message'],
  },
};

const PORT_OVERRIDE_KEYS = [
  'enabled',
  'max',
  'min',
  'expandable',
  'default_count',
  'accepts',
  'accept_asset_kinds',
  'label',
  'required',
] as const;

export function applySchemePortPatches(
  base: SchemePort[],
  modify?: Record<string, Partial<SchemePort>>,
): SchemePort[] {
  if (!modify || !Object.keys(modify).length) {
    return base.map((p) => ({ ...p, accepts: p.accepts ? [...p.accepts] : undefined }));
  }
  return base.map((p) => {
    const patch = modify[p.key];
    if (!patch) {
      return { ...p, accepts: p.accepts ? [...p.accepts] : undefined };
    }
    const next: SchemePort = { ...p, accepts: p.accepts ? [...p.accepts] : undefined };
    for (const k of PORT_OVERRIDE_KEYS) {
      if (patch[k] !== undefined) {
        (next as any)[k] = patch[k];
      }
    }
    return next;
  });
}

function mergeIoOverrides(
  inputs: SchemePort[] | undefined | null,
  outputs: SchemePort[] | undefined | null,
  overrides?: SchemeIoOverrides | null,
  kind: 'image' | 'video' = 'image',
): { inputs: SchemePort[]; outputs: SchemePort[] } {
  const fallback = kind === 'video' ? defaultVideoSchemeIo() : defaultImageSchemeIo();
  const baseIn = Array.isArray(inputs) && inputs.length ? inputs : fallback.inputs;
  const baseOut = Array.isArray(outputs) && outputs.length ? outputs : fallback.outputs;
  return {
    inputs: applySchemePortPatches(baseIn, overrides?.inputs?.modify),
    outputs: applySchemePortPatches(baseOut, overrides?.outputs?.modify),
  };
}

export function enabledPorts(ports: SchemePort[] | undefined | null): SchemePort[] {
  return (ports || []).filter((p) => p && p.enabled !== false && !isFeatureTogglePort(p));
}

/** 单口精确 handle 或多口 `Prefix N` */
function portMatchesHandle(port: SchemePort, handleId: string): boolean {
  if (!handleId || !port?.handle_prefix) return false;
  if (handleId === port.handle_prefix) return true;
  const re = new RegExp(
    `^${port.handle_prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`,
  );
  return re.test(handleId);
}

export function findPortByHandle(
  ports: SchemePort[] | undefined | null,
  handleId: string,
): SchemePort | undefined {
  return enabledPorts(ports).find((p) => portMatchesHandle(p, handleId));
}

export function listHandlesForPort(port: SchemePort, connectionCounts?: Record<string, string>, manualCounts?: Record<string, number>): string[] {
  const max = Math.max(1, Number(port.max) || 1);
  const expandable = !!port.expandable && max > 1;
  if (!expandable) {
    return [port.handle_prefix];
  }
  let highest = 0;
  for (let i = 1; i <= max; i++) {
    const id = `${port.handle_prefix} ${i}`;
    if (connectionCounts?.[id]) highest = i;
  }
  const manual = manualCounts?.[port.handle_prefix] || port.default_count || 1;
  const n = Math.min(max, Math.max(manual, highest, 1));
  return Array.from({ length: n }, (_, i) => `${port.handle_prefix} ${i + 1}`);
}

/** 启用入参口的全部可见 handle（含可扩槽） */
function listAllVisibleHandles(
  inputs: SchemePort[] | undefined | null,
  connections?: Record<string, string> | null,
  manualCounts?: Record<string, number>,
): string[] {
  const handles: string[] = [];
  for (const port of enabledPorts(inputs)) {
    handles.push(...listHandlesForPort(port, connections || undefined, manualCounts));
  }
  return handles;
}

export type SchemeSourceMedia = 'image' | 'video' | 'audio' | 'file' | 'document';

/** 由节点类型推断媒体（无 asset 文件信息时） */
function inferSourceMediaFromNodeType(
  sourceNodeType: string,
): SchemeSourceMedia | undefined {
  if (sourceNodeType === 'ai_image' || sourceNodeType === 'image' || sourceNodeType === 'director') return 'image';
  if (sourceNodeType === 'ai_video' || sourceNodeType === 'video') return 'video';
  if (sourceNodeType === 'audio') return 'audio';
  return undefined;
}

function assetKindLabelZh(kind: string): string {
  return SCHEME_ASSET_KIND_OPTIONS.find((o) => o.value === kind)?.label || kind;
}

function portNeedMediaLabels(port: SchemePort): string[] {
  const kinds =
    Array.isArray(port.accept_asset_kinds) && port.accept_asset_kinds.length
      ? port.accept_asset_kinds
      : defaultAcceptAssetKinds(port.modality);
  if (kinds.length) return kinds.map(assetKindLabelZh);
  if (port.modality && port.modality !== 'text') return [modalityLabelZh(port.modality)];
  return [];
}

/**
 * 连线被拒时的中文原因（优先说明文件类型不匹配）
 * 兼容时返回 null
 */
export function portConnectionRejectReason(
  port: SchemePort,
  sourceNodeType: string,
  sourceMedia?: SchemeSourceMedia,
  handleId?: string,
): string | null {
  if (isPortCompatibleWithSource(port, sourceNodeType, sourceMedia)) return null;

  const socketLabel = flowPortSocketLabel(port.label, handleId || port.handle_prefix || port.key);
  const media = sourceMedia || inferSourceMediaFromNodeType(sourceNodeType);
  const kinds =
    Array.isArray(port.accept_asset_kinds) && port.accept_asset_kinds.length
      ? port.accept_asset_kinds
      : defaultAcceptAssetKinds(port.modality);
  const needZh = portNeedMediaLabels(port).join('/');

  // 上游有明确媒体，且与口要求的素材类型不一致 → 文件类型不对
  if (
    media &&
    media !== 'file' &&
    kinds.length > 0 &&
    !kinds.includes(media as SchemeAssetKind) &&
    port.modality !== 'text'
  ) {
    return `插孔「${socketLabel}」需要${needZh}，当前是${assetKindLabelZh(media)}（文件类型不匹配）`;
  }

  if (!(port.accepts || []).includes(sourceNodeType)) {
    return `插孔「${socketLabel}」不接受「${nodeTypeLabelZh(sourceNodeType)}」节点`;
  }

  if (needZh) {
    return `插孔「${socketLabel}」需要${needZh}，素材类型不匹配`;
  }
  return `插孔「${socketLabel}」不接受该上游节点类型`;
}

/** 口是否接受该上游节点类型（preview 在 accepts 内则不限制媒体；asset 校验 kinds / modality） */
export function isPortCompatibleWithSource(
  port: SchemePort,
  sourceNodeType: string,
  sourceMedia?: SchemeSourceMedia,
): boolean {
  if (!port || port.enabled === false) return false;
  const accepts = port.accepts || [];
  if (!accepts.length) return false;
  if (
    (sourceNodeType === 'prompt' || sourceNodeType === 'ai_text') &&
    (accepts.includes('prompt') || accepts.includes('ai_text'))
  ) {
    return true;
  }
  const directorAsImage =
    sourceNodeType === 'director' &&
    !accepts.includes('director') &&
    (port.modality === 'image' || (port.accept_asset_kinds || []).includes('image')) &&
    (accepts.includes('asset') || accepts.includes('ai_image') || accepts.includes('preview'));
  if (!accepts.includes(sourceNodeType) && !directorAsImage) return false;
  // preview 上游：只要类型在 accepts 内即可（不限制媒体模态）
  if (sourceNodeType === 'preview') return true;
  // 空素材（尚无文件）：只要口接受 asset 即可，不校验 kinds
  if (sourceNodeType === 'asset' && (!sourceMedia || sourceMedia === 'file')) {
    return true;
  }
  if (sourceNodeType === 'director') {
    if (sourceMedia && sourceMedia !== 'image' && sourceMedia !== 'file') return false;
    return true;
  }
  if (sourceNodeType === 'asset' && sourceMedia) {
    const kinds =
      Array.isArray(port.accept_asset_kinds) && port.accept_asset_kinds.length
        ? port.accept_asset_kinds
        : defaultAcceptAssetKinds(port.modality);
    if (kinds.length > 0 && !kinds.includes(sourceMedia as SchemeAssetKind)) {
      return false;
    }
  }
  // ai_image / ai_video 等：与口 modality / accept_asset_kinds 对齐（避免图片生成接到参考视频）
  if (sourceNodeType === 'ai_image' || sourceNodeType === 'ai_video') {
    const kinds =
      Array.isArray(port.accept_asset_kinds) && port.accept_asset_kinds.length
        ? port.accept_asset_kinds
        : defaultAcceptAssetKinds(port.modality);
    const implied = inferSourceMediaFromNodeType(sourceNodeType);
    if (kinds.length > 0 && implied && !kinds.includes(implied as SchemeAssetKind)) {
      return false;
    }
  }
  return true;
}

/** 口允许的素材文件类型 */
function portAcceptAssetKinds(port: SchemePort): SchemeAssetKind[] {
  if (Array.isArray(port.accept_asset_kinds) && port.accept_asset_kinds.length) {
    return [...port.accept_asset_kinds];
  }
  return defaultAcceptAssetKinds(port.modality);
}

/** 交集；任一侧为空则返回另一侧 */
function intersectAssetKinds(
  a: SchemeAssetKind[] | undefined,
  b: SchemeAssetKind[],
): SchemeAssetKind[] {
  if (!a?.length) return [...b];
  if (!b.length) return [...a];
  return a.filter((k) => b.includes(k));
}

/**
 * 空素材连入某口后：写入 bound_asset_kinds，限制后续可选文件类型。
 * 已有文件的素材不写入（类型已由内容决定）。
 */
export function applyBoundAssetKindsOnConnect(
  nodes: CanvasNode[],
  sourceId: string,
  targetInputs: SchemePort[],
  handleId: string,
): CanvasNode[] {
  const source = nodes.find((n) => n.id === sourceId);
  if (!source || source.taskData?.node_type !== 'asset') return nodes;
  const files = Array.isArray(source.taskData?.files) ? source.taskData.files : [];
  if (files.some((f: any) => f?.url)) return nodes;

  const port = findPortByHandle(targetInputs, handleId);
  if (!port || !(port.accepts || []).includes('asset')) return nodes;
  const kinds = portAcceptAssetKinds(port);
  if (!kinds.length) return nodes;

  return nodes.map((n) => {
    if (n.id !== sourceId) return n;
    const prev = Array.isArray(n.taskData?.bound_asset_kinds)
      ? (n.taskData.bound_asset_kinds as SchemeAssetKind[])
      : undefined;
    const next = intersectAssetKinds(prev, kinds);
    return {
      ...n,
      taskData: {
        ...(n.taskData || {}),
        bound_asset_kinds: next.length ? next : kinds,
      },
    };
  });
}

/** 找第一个空闲且兼容的入参 handle（可扩槽可开到 max） */
export function findFreeInputHandle(
  inputs: SchemePort[] | undefined | null,
  connections: Record<string, string> | null | undefined,
  sourceNodeType: string,
  sourceMedia?: SchemeSourceMedia,
): string | null {
  const conns = connections || {};
  for (const port of enabledPorts(inputs)) {
    if (!isPortCompatibleWithSource(port, sourceNodeType, sourceMedia)) continue;
    const max = Math.max(1, Number(port.max) || 1);
    const expandable = !!port.expandable && max > 1;
    if (!expandable) {
      if (!conns[port.handle_prefix]) return port.handle_prefix;
      continue;
    }
    const visible = listHandlesForPort(port, conns);
    for (const h of visible) {
      if (!conns[h]) return h;
    }
    if (visible.length < max) {
      return `${port.handle_prefix} ${visible.length + 1}`;
    }
  }
  return null;
}

/**
 * 仅在指定口上找空闲 handle（用户点了某入参口时用，禁止跨口抢到参考图等）
 * 该口已满时回落 preferred / 首个可见槽（允许覆盖）
 */
export function findFreeHandleOnPort(
  port: SchemePort,
  connections: Record<string, string> | null | undefined,
  preferredHandle?: string,
  manualCounts?: Record<string, number>,
): string | null {
  if (!port || port.enabled === false) return null;
  const conns = connections || {};
  if (
    preferredHandle &&
    portMatchesHandle(port, preferredHandle) &&
    !conns[preferredHandle]
  ) {
    return preferredHandle;
  }
  const max = Math.max(1, Number(port.max) || 1);
  const expandable = !!port.expandable && max > 1;
  if (!expandable) {
    if (!conns[port.handle_prefix]) return port.handle_prefix;
    return preferredHandle && portMatchesHandle(port, preferredHandle)
      ? preferredHandle
      : port.handle_prefix;
  }
  const visible = listHandlesForPort(port, conns, manualCounts);
  for (const h of visible) {
    if (!conns[h]) return h;
  }
  if (visible.length < max) {
    return `${port.handle_prefix} ${visible.length + 1}`;
  }
  if (preferredHandle && portMatchesHandle(port, preferredHandle)) {
    return preferredHandle;
  }
  return visible[0] || null;
}

/** 按口收集已连线 handle 上的 URL（可扩槽）；兼容旧裸 handle_prefix 连线 */
export function collectUrlsForPort(
  port: SchemePort,
  inputConnections: Record<string, string> | null | undefined,
  resolveUrlFromNodeId: (nodeId: string) => string | string[] | null | undefined,
): string[] {
  const urls: string[] = [];
  const conns = inputConnections || {};
  const handles = listHandlesForPort(port, conns);
  const handleSet = new Set(handles);
  // 旧画布 / 选节点菜单可能连在裸 prefix 上（可扩槽实际展示为 Prefix N）
  if (port.handle_prefix && conns[port.handle_prefix] && !handleSet.has(port.handle_prefix)) {
    handles.push(port.handle_prefix);
  }
  for (const h of handles) {
    const srcId = conns[h];
    if (!srcId) continue;
    const resolved = resolveUrlFromNodeId(srcId);
    if (!resolved) continue;
    if (Array.isArray(resolved)) {
      for (const u of resolved) {
        if (u) urls.push(u);
      }
    } else {
      urls.push(resolved);
    }
  }
  const max = schemePortMax(port);
  return max <= 0 ? [] : urls.slice(0, max);
}

export function resolveModelIo(model: PlaygroundModel | null | undefined, kind: 'image' | 'video') {
  const merged = mergeIoOverrides(model?.inputs, model?.outputs, null, kind);
  const isNoNegScheme =
    model?.scheme_id === 'openai_video' ||
    model?.scheme_id === 'seedance2.0' ||
    model?.scheme_id === 'seedance2' ||
    isWan3FamilySchemeId(model?.scheme_id) ||
    isMinimaxH3SchemeId(model?.scheme_id);
  const filterNeg = (ports: SchemePort[]) =>
    isNoNegScheme
      ? ports.filter((p) => p.key !== 'negative_prompt' && p.bind_key !== 'negative_prompt')
      : ports;

  // 模型下发时后端已合并；若仍空则 fallback
  if (model?.inputs?.length || model?.outputs?.length) {
    const rawIn = model.inputs?.length ? model.inputs : merged.inputs;
    const finalIn = filterNeg(rawIn);
    return {
      inputs: enabledPorts(finalIn),
      outputs: enabledPorts(model.outputs?.length ? model.outputs : merged.outputs),
      allInputs: finalIn,
      allOutputs: model.outputs?.length ? model.outputs : merged.outputs,
    };
  }
  const finalIn = filterNeg(merged.inputs);
  return {
    inputs: enabledPorts(finalIn),
    outputs: enabledPorts(merged.outputs),
    allInputs: finalIn,
    allOutputs: merged.outputs,
  };
}

/** 口数量上限：允许 0（表示不可上传/接入） */
export function schemePortMax(port: SchemePort | null | undefined, fallback = 1): number {
  const n = Number(port?.max);
  if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  return fallback;
}

export function isSeedance2SchemeId(schemeId?: string | null): boolean {
  return schemeId === 'seedance2.0' || schemeId === 'seedance2';
}

/** Seedance / 万相 3.0 编辑/延长是全能参考的子能力开关，不是独立上传口 */
export function isFeatureTogglePort(port: SchemePort | null | undefined): boolean {
  const k = port?.key || '';
  const bind = port?.bind_key || '';
  if (k === 'thinking') return !bind || bind.startsWith('feature:');
  return (k === 'edit_video' || k === 'extend_video') && (!bind || bind.startsWith('feature:'));
}

export type SeedanceEdition = '2.0' | '2.5';

export const SEEDANCE_EDITION_LIMITS: Record<
  SeedanceEdition,
  { images: number; videos: number; audios: number; durationMax: number }
> = {
  '2.0': { images: 9, videos: 3, audios: 3, durationMax: 15 },
  '2.5': { images: 30, videos: 10, audios: 10, durationMax: 30 },
};

export function inferSeedanceEdition(inputs?: SchemePort[] | null): SeedanceEdition {
  const maxOf = (key: string) => {
    const p = (inputs || []).find((x) => x.key === key);
    const n = Number(p?.max);
    return Number.isFinite(n) ? n : 0;
  };
  if (maxOf('reference_images') >= 30 || maxOf('reference_videos') >= 10 || maxOf('reference_audio') >= 10) {
    return '2.5';
  }
  return '2.0';
}

export function applySeedanceEditionToInputs(
  inputs: SchemePort[],
  edition: SeedanceEdition,
): SchemePort[] {
  const lim = SEEDANCE_EDITION_LIMITS[edition];
  return inputs.map((p) => {
    if (p.key === 'reference_images') return { ...p, max: lim.images };
    if (p.key === 'reference_videos') return { ...p, max: lim.videos };
    if (p.key === 'reference_audio') return { ...p, max: lim.audios };
    return p;
  });
}

export function applySeedanceEditionToParams(
  params: { key?: string; max?: number; hint?: string }[],
  edition: SeedanceEdition,
): { key?: string; max?: number; hint?: string }[] {
  const lim = SEEDANCE_EDITION_LIMITS[edition];
  return (params || []).map((p) => {
    if ((p.key || '').toLowerCase() !== 'duration') return p;
    return {
      ...p,
      max: lim.durationMax,
      hint:
        edition === '2.5'
          ? '文生/图生/全能参考 4–30 秒。编辑由模型自选时长（请求传 -1）'
          : '文生/图生/全能参考 4–15 秒。编辑由模型自选时长（请求传 -1）',
    };
  });
}

export type MinimaxH3Edition = 'h3' | 'h3-max';

export const MINIMAX_H3_EDITION: Record<
  MinimaxH3Edition,
  {
    images: number;
    videos: number;
    audios: number;
    durationMin: number;
    durationMax: number;
    resolution: string[];
    resolutionDefault: string;
    omni: boolean;
  }
> = {
  h3: {
    images: 9,
    videos: 3,
    audios: 3,
    durationMin: 4,
    durationMax: 15,
    resolution: ['768P', '2K'],
    resolutionDefault: '2K',
    omni: true,
  },
  'h3-max': {
    images: 9,
    videos: 3,
    audios: 3,
    durationMin: 5,
    durationMax: 15,
    resolution: ['480P', '768P'],
    resolutionDefault: '768P',
    omni: false,
  },
};

export function inferMinimaxH3Edition(
  inputs?: SchemePort[] | null,
  params?: { key?: string; options?: unknown[] }[] | null,
): MinimaxH3Edition {
  const res = (params || []).find((p) => (p.key || '').toLowerCase() === 'resolution');
  const opts = (res?.options || []).map((o) => String(o));
  if (opts.includes('480P') && !opts.includes('2K')) return 'h3-max';
  if (opts.includes('2K')) return 'h3';
  const refs = (inputs || []).filter((p) => {
    const k = p.key || '';
    return k === 'reference_images' || k === 'reference_videos' || k === 'reference_audio';
  });
  if (refs.length > 0 && refs.every((p) => p.enabled === false)) return 'h3-max';
  return 'h3';
}

export function applyMinimaxH3EditionToInputs(
  inputs: SchemePort[],
  edition: MinimaxH3Edition,
): SchemePort[] {
  const lim = MINIMAX_H3_EDITION[edition];
  return inputs.map((p) => {
    if (p.key === 'reference_images') return { ...p, enabled: lim.omni, max: lim.images };
    if (p.key === 'reference_videos') return { ...p, enabled: lim.omni, max: lim.videos };
    if (p.key === 'reference_audio') return { ...p, enabled: lim.omni, max: lim.audios };
    return p;
  });
}

export function applyMinimaxH3EditionToParams(
  params: Record<string, any>[],
  edition: MinimaxH3Edition,
): Record<string, any>[] {
  const lim = MINIMAX_H3_EDITION[edition];
  return (params || []).map((p) => {
    const k = (p.key || '').toLowerCase();
    const label = String(p.label || '');
    if (k === 'duration' || k.includes('second') || label.includes('时长')) {
      let def = Number(p.default);
      if (!Number.isFinite(def)) def = lim.durationMin;
      if (def < lim.durationMin) def = lim.durationMin;
      if (def > lim.durationMax) def = lim.durationMax;
      return {
        ...p,
        min: lim.durationMin,
        max: lim.durationMax,
        default: def,
        hint: edition === 'h3-max' ? 'MiniMax-H3-Max：5–15 秒' : 'MiniMax-H3：4–15 秒',
      };
    }
    if (k === 'resolution') {
      let def = String(p.default || lim.resolutionDefault);
      if (!lim.resolution.includes(def)) def = lim.resolutionDefault;
      return {
        ...p,
        options: [...lim.resolution],
        default: def,
        hint: edition === 'h3-max' ? 'MiniMax-H3-Max：480P / 768P' : 'MiniMax-H3：768P / 2K',
      };
    }
    return p;
  });
}

export function normalizeOmniCapabilityPorts(inputs: SchemePort[]): SchemePort[] {
  return inputs.map((p) => {
    if (p.key !== 'edit_video' && p.key !== 'extend_video') return p;
    return {
      ...p,
      bind_key: p.key === 'edit_video' ? 'feature:edit_video' : 'feature:extend_video',
      max: 0,
      accepts: undefined,
      accept_asset_kinds: undefined,
      expandable: false,
      required: false,
    };
  });
}

function isSingleSourceVideoPort(port: SchemePort | null | undefined): boolean {
  if (isFeatureTogglePort(port)) return false;
  const k = port?.key || '';
  return k === 'edit_video' || k === 'extend_video';
}

function singleSourceVideoCatalogPort(kind: 'edit' | 'extend', enabled: boolean): SchemePort {
  if (kind === 'edit') {
    return {
      key: 'edit_video',
      label: '编辑视频',
      enabled,
      modality: 'video',
      handle_prefix: 'Edit Video',
      bind_key: 'edit_video_url',
      accepts: ['asset', 'ai_video', 'preview'],
      accept_asset_kinds: ['video'],
      max: 1,
    };
  }
  return {
    key: 'extend_video',
    label: '延长视频',
    enabled,
    modality: 'video',
    handle_prefix: 'Extend Video',
    bind_key: 'extend_video_url',
    accepts: ['asset', 'ai_video', 'preview'],
    accept_asset_kinds: ['video'],
    max: 1,
  };
}

function omniFeatureTogglePort(kind: 'edit' | 'extend', enabled: boolean): SchemePort {
  if (kind === 'edit') {
    return {
      key: 'edit_video',
      label: '编辑视频',
      enabled,
      modality: 'video',
      handle_prefix: 'Edit Video',
      bind_key: 'feature:edit_video',
      max: 0,
    };
  }
  return {
    key: 'extend_video',
    label: '延长视频',
    enabled,
    modality: 'video',
    handle_prefix: 'Extend Video',
    bind_key: 'feature:extend_video',
    max: 0,
  };
}

export function defaultReferencePortMax(portKey: string, schemeId?: string | null): number {
  if (portKey === 'edit_video' || portKey === 'extend_video') return 1;
  if (isWan3FamilySchemeId(schemeId)) {
    if (portKey === 'reference_images') return 10;
    if (portKey === 'reference_videos' || portKey === 'reference_audio') return 5;
    return 1;
  }
  if (isMinimaxH3SchemeId(schemeId)) {
    if (portKey === 'reference_images') return 9;
    if (portKey === 'reference_videos' || portKey === 'reference_audio') return 3;
    return 1;
  }
  if (isSeedance2SchemeId(schemeId)) {
    if (portKey === 'reference_images') return 9;
    if (portKey === 'reference_videos' || portKey === 'reference_audio') return 3;
    return 1;
  }
  if (portKey === 'reference_images') return 7;
  if (portKey === 'reference_videos' || portKey === 'reference_audio') return 3;
  return 1;
}

/** 万相 3.0 / DashScope 视频、OpenAI 视频、Seedance 2.0 视频：无反向提示词；全模态参考上限对齐 docs/wan3.md */
export function videoSchemeIoCatalogFor(schemeId?: string | null): {
  inputs: SchemePort[];
  outputs: SchemePort[];
} {
  const catalog = fullVideoSchemeIoCatalog();
  const isOpenAiVideo = schemeId === 'openai_video';
  const isWan3 = isWan3FamilySchemeId(schemeId);
  const isSeedance2 = isSeedance2SchemeId(schemeId);
  const isMinimaxH3 = isMinimaxH3SchemeId(schemeId);
  if (!isOpenAiVideo && !isWan3 && !isSeedance2 && !isMinimaxH3) return catalog;
  const inputs = catalog.inputs
    .filter((p) => p.key !== 'negative_prompt' && p.bind_key !== 'negative_prompt')
    .map((p) => {
      if (isWan3) {
        if (p.key === 'reference_images') return { ...p, max: 10 };
        if (p.key === 'reference_videos' || p.key === 'reference_audio') return { ...p, max: 5 };
      }
      if (isSeedance2 || isMinimaxH3) {
        if (p.key === 'reference_images') return { ...p, max: 9 };
        if (p.key === 'reference_videos' || p.key === 'reference_audio') return { ...p, max: 3 };
      }
      return { ...p };
    });
  if (isWan3 || isSeedance2) {
    inputs.push(omniFeatureTogglePort('edit', true), omniFeatureTogglePort('extend', true));
  }
  return {
    inputs,
    outputs: catalog.outputs.map((p) => ({ ...p })),
  };
}

export function isReferenceMediaPort(port: SchemePort | null | undefined): boolean {
  const k = port?.key || '';
  return k === 'reference_images' || k === 'reference_videos' || k === 'reference_audio';
}

export function portShowsMaxCount(port: SchemePort | null | undefined): boolean {
  if (!port || isFeatureTogglePort(port)) return false;
  return !!port.expandable || isReferenceMediaPort(port) || isSingleSourceVideoPort(port);
}

export function resolveReferencePortMax(port: SchemePort | null | undefined): number {
  if (!port) return 1;
  return schemePortMax(port, defaultReferencePortMax(port.key));
}

/** 参考图上限：优先 reference_images.max */
export function resolveReferenceImagesMax(model?: PlaygroundModel | null): number {
  if (!model) return 0;
  const port = (model?.inputs || []).find(
    (p) => p.key === 'reference_images' || p.bind_key === 'image_urls' || p.bind_key === 'reference_urls',
  );
  if (port && port.enabled !== false) {
    return resolveReferencePortMax(port);
  }
  const legacy = Number(model?.max_reference_images);
  if (Number.isFinite(legacy) && legacy >= 0) return legacy;
  if ((model?.inputs || []).length > 0) return 0;
  return 7;
}

export type StaleConnection = {
  handleId: string;
  /** 界面展示名（汉字） */
  label: string;
  reason: string;
};

export function findStaleInputConnections(opts: {
  inputConnections?: Record<string, string> | null;
  inputs: SchemePort[];
  resolveSourceType: (nodeId: string) => string | undefined;
  resolveSourceMedia?: (nodeId: string) => 'image' | 'video' | 'audio' | 'file' | undefined;
}): StaleConnection[] {
  const { inputConnections, inputs, resolveSourceType, resolveSourceMedia } = opts;
  if (!inputConnections) return [];
  const enabled = enabledPorts(inputs);
  const stale: StaleConnection[] = [];

  for (const [handleId, sourceId] of Object.entries(inputConnections)) {
    if (!sourceId) continue;
    const port = enabled.find((p) => portMatchesHandle(p, handleId));
    const label = port
      ? flowPortSocketLabel(port.label, handleId)
      : flowSocketLabelZh(handleId);
    if (!port) {
      stale.push({ handleId, label, reason: '当前模型未启用该入参口' });
      continue;
    }
    const srcType = resolveSourceType(sourceId);
    if (!srcType) {
      stale.push({ handleId, label, reason: '上游节点已不存在' });
      continue;
    }
    const media = resolveSourceMedia?.(sourceId);
    if (!isPortCompatibleWithSource(port, srcType, media)) {
      const detail = portConnectionRejectReason(port, srcType, media, handleId);
      const reason = detail?.replace(/^插孔「[^」]+」/, '') || '上游类型不兼容';
      stale.push({ handleId, label, reason });
    }
  }
  return stale;
}

export function validateSchemeIoForSave(scheme: {
  params?: { key?: string }[];
  inputs?: SchemePort[];
  outputs?: SchemePort[];
}): string | null {
  const inputs = scheme.inputs || [];
  const outputs = scheme.outputs || [];
  const bindSeen = new Set<string>();

  for (const p of inputs) {
    if (p.enabled === false) continue;
    if (!p.bind_key?.trim()) return `入参「${p.label || p.key}」启用后必须填写绑定字段`;
    if (!isValidBindKey(p.bind_key)) return `入参「${p.label || p.key}」绑定字段格式无效`;
    if (bindSeen.has(p.bind_key)) return `绑定字段「${p.bind_key}」被多个入参占用`;
    bindSeen.add(p.bind_key);
    if (!p.accepts?.length) return `入参「${p.label || p.key}」必须选择可连接的上游节点`;
    for (const a of p.accepts) {
      if (!isWorkflowBasicNodeType(a)) return `入参「${p.label || p.key}」含非法上游类型：${a}`;
    }
  }
  for (const p of outputs) {
    if (p.enabled === false) continue;
    if (!p.result_key?.trim()) return `出参「${p.label || p.key}」启用后必须填写结果字段`;
    if (!isValidBindKey(p.result_key)) return `出参「${p.label || p.key}」结果字段格式无效`;
  }
  return null;
}

export function modalitySocketColor(modality: SchemePort['modality']): string {
  switch (modality) {
    case 'text':
      return '#38bdf8';
    case 'image':
      return '#fbbf24';
    case 'video':
      return '#4ade80';
    case 'audio':
      return '#f472b6';
    default:
      return '#94a3b8';
  }
}
