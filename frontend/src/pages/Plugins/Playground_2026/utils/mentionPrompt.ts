/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

export type MentionMediaType = 'image' | 'video' | 'audio' | 'file';

export type MentionAsset = {
  label: string;
  url: string;
  type: MentionMediaType;
};

const MENTION_LABEL_PREFIX: Record<MentionMediaType, string> = {
  image: '图',
  video: '视频',
  audio: '声音',
  file: '文件',
};

/** 去掉覆盖层时代写入的零宽/全角占位，以及多余空白 */
export function stripMentionArtifacts(prompt: string): string {
  if (!prompt) return prompt;
  return prompt
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** 按类型各自编号：图1 / 视频1 / 声音1 / 文件1 */
export function buildTypedMentionAssets(
  items: Array<{ url: string; type: MentionMediaType }>,
): MentionAsset[] {
  const counts: Record<MentionMediaType, number> = {
    image: 0,
    video: 0,
    audio: 0,
    file: 0,
  };
  return items.map((item) => {
    counts[item.type] += 1;
    return {
      label: `${MENTION_LABEL_PREFIX[item.type]}${counts[item.type]}`,
      url: item.url,
      type: item.type,
    };
  });
}

/** 参考图 URL 列表 → @mention 资产（图1、图2…） */
export function buildRefMentionAssets(urls: string[]): MentionAsset[] {
  return buildTypedMentionAssets(urls.map((url) => ({ url, type: 'image' as const })));
}

/**
 * 删除某类型第 removedIndex 个参考后，同步清理 / 重编号 prompt 中的 @图N 等。
 * removedIndex 为 0-based。
 */
export function removeAndRenumberMentions(
  prompt: string,
  type: MentionMediaType,
  removedIndex: number,
): string {
  if (!prompt || removedIndex < 0) return prompt;
  const prefix = MENTION_LABEL_PREFIX[type];
  const removedNum = removedIndex + 1;
  const re = new RegExp(`@${prefix}(\\d+)`, 'g');
  return stripMentionArtifacts(prompt)
    .replace(re, (full, numStr: string) => {
      const n = Number(numStr);
      if (!Number.isFinite(n)) return full;
      if (n === removedNum) return '';
      if (n > removedNum) return `@${prefix}${n - 1}`;
      return full;
    })
    .replace(/ {2,}/g, ' ');
}

/** 删除第 removedIndex 张参考图后，同步清理 / 重编号 prompt 中的 @图N。 */
export function removeAndRenumberRefMentions(prompt: string, removedIndex: number): string {
  return removeAndRenumberMentions(prompt, 'image', removedIndex);
}
