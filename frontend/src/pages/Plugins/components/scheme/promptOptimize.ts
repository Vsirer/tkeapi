/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

export const PROMPT_OPTIMIZE_CATEGORY = 'prompt-optimize';
const PROMPT_OPTIMIZE_IMAGE_SLUG = 'prompt-optimize-image';
const PROMPT_OPTIMIZE_VIDEO_SLUG = 'prompt-optimize-video';

const DEFAULT_PROMPT_OPTIMIZE_IMAGE_BODY = `你是图片提示词优化助手。用户给出想生成的画面描述时，把它扩写成更具体、可直接用于文生图的提示词。

规则：
- 只输出优化后的提示词正文，不要前言、标题、解释或 markdown 围栏。
- 保留用户的主体、风格与禁忌；信息不足时合理补全构图、光线、材质、镜头，不要改掉核心对象。
- 与用户语言一致。不要声称你能出图。`;

const DEFAULT_PROMPT_OPTIMIZE_VIDEO_BODY = `你是视频提示词优化助手。用户给出想生成的镜头或动作描述时，把它扩写成更具体、可直接用于文生视频的提示词。

规则：
- 只输出优化后的提示词正文，不要前言、标题、解释或 markdown 围栏。
- 保留用户的主体、风格与禁忌；信息不足时合理补全镜头运动、时长感、光影与节奏，不要改掉核心对象。
- 与用户语言一致。不要声称你能出视频。`;

export type PromptOptimizeBinding = {
  enabled: boolean;
  body: string;
};

export type PromptOptimizeResolved = {
  body_md: string;
};

export type PromptOptimizeLlm = {
  mid: string;
  name: string;
  model_id: string;
};

export function appliesIncludesPromptOptimize(applies: string[] | undefined): boolean {
  return (applies || []).includes(PROMPT_OPTIMIZE_CATEGORY);
}

function defaultPromptOptimizeBody(kind: 'image' | 'video'): string {
  return kind === 'video' ? DEFAULT_PROMPT_OPTIMIZE_VIDEO_BODY : DEFAULT_PROMPT_OPTIMIZE_IMAGE_BODY;
}

function isStockOptimizeBody(body: string): boolean {
  const t = (body || '').trim();
  return !t
    || t === DEFAULT_PROMPT_OPTIMIZE_IMAGE_BODY.trim()
    || t === DEFAULT_PROMPT_OPTIMIZE_VIDEO_BODY.trim();
}

function readBody(rec: Record<string, unknown>): string {
  if (typeof rec.body === 'string') return rec.body;
  if (typeof rec.body_md === 'string') return rec.body_md;
  return '';
}

export function parsePromptOptimizeBinding(raw: unknown): PromptOptimizeBinding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const body = readBody(rec);
  if (rec.enabled === false) return { enabled: false, body };
  if (rec.enabled === true) return { enabled: true, body };
  if ('skill_slug' in rec) {
    const slug = String(rec.skill_slug || '').trim();
    let nextBody = body;
    if (!nextBody.trim()) {
      if (slug === PROMPT_OPTIMIZE_IMAGE_SLUG) nextBody = DEFAULT_PROMPT_OPTIMIZE_IMAGE_BODY;
      else if (slug === PROMPT_OPTIMIZE_VIDEO_SLUG) nextBody = DEFAULT_PROMPT_OPTIMIZE_VIDEO_BODY;
    }
    return { enabled: !!slug, body: nextBody };
  }
  if ('body' in rec || 'body_md' in rec) return { enabled: true, body };
  return { enabled: false, body: '' };
}

export function seedPromptOptimize(
  raw: unknown,
  kind: 'image' | 'video',
): PromptOptimizeBinding {
  const parsed = parsePromptOptimizeBinding(raw);
  const fallback = defaultPromptOptimizeBody(kind);
  if (!parsed) return { enabled: true, body: fallback };
  if (parsed.enabled && !parsed.body.trim()) return { enabled: true, body: fallback };
  if (parsed.enabled && isStockOptimizeBody(parsed.body)) return { enabled: true, body: fallback };
  return parsed;
}

export function parsePromptOptimizeResolved(raw: unknown): PromptOptimizeResolved | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.enabled === false) return null;
  const body_md = readBody(rec).trim();
  if (!body_md) return null;
  return { body_md };
}

export function parsePromptOptimizeLlm(raw: unknown): PromptOptimizeLlm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const mid = String(rec.mid || '').trim();
  const model_id = String(rec.model_id || '').trim();
  if (!mid || !model_id) return null;
  return {
    mid,
    name: String(rec.name || model_id),
    model_id,
  };
}
