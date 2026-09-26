/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 工作流节点连接器：内部 handleId 保持英文（兼容已存连线），界面展示中文。
 * 可扩槽的「Prefix N」只显示汉字口名，不带序号。
 */

const EXACT: Record<string, string> = {
  Prompt: '提示词',
  'Negative Prompt': '反向提示词',
  'Reference Image': '参考图',
  'Reference Images': '参考图',
  'Reference Videos': '参考视频',
  'Reference Audio': '参考音频',
  'Start Frame': '首帧',
  'End Frame': '尾帧',
  'Source Video': '源视频',
  'Edit Video': '编辑视频',
  'Extend Video': '延长视频',
  'Last Frame': '最后一帧',
  Image: '图片',
  Video: '视频',
  File: '文件',
  Input: '输入',
  Panorama: '全景图',
  'Image output': '图片输出',
  'Video output': '视频输出',
  'Audio output': '音频输出',
};

/** 长前缀优先，避免 Reference Image 误匹配 Reference Images 的逆序问题 */
const PREFIX: Array<{ prefix: string; zh: string }> = [
  { prefix: 'Reference Images', zh: '参考图' },
  { prefix: 'Reference Image', zh: '参考图' },
  { prefix: 'Reference Videos', zh: '参考视频' },
  { prefix: 'Reference Audio', zh: '参考音频' },
  { prefix: 'Negative Prompt', zh: '反向提示词' },
  { prefix: 'Start Frame', zh: '首帧' },
  { prefix: 'End Frame', zh: '尾帧' },
  { prefix: 'Source Video', zh: '源视频' },
  { prefix: 'Edit Video', zh: '编辑视频' },
  { prefix: 'Extend Video', zh: '延长视频' },
  { prefix: 'Last Frame', zh: '最后一帧' },
  { prefix: 'Panorama', zh: '全景图' },
  { prefix: 'Prompt', zh: '提示词' },
  { prefix: 'Image', zh: '图片' },
  { prefix: 'Video', zh: '视频' },
];

/** 将内部 handleId 转为中文展示名（可扩槽序号不展示） */
export function flowSocketLabelZh(handleId: string): string {
  if (!handleId) return handleId;
  if (EXACT[handleId]) return EXACT[handleId];
  for (const { prefix, zh } of PREFIX) {
    if (handleId === prefix) return zh;
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+$`);
    if (re.test(handleId)) return zh;
  }
  return handleId;
}

/**
 * 口展示名：优先方案 label（汉字）；多槽时也不拼序号。
 * handleId 仅作无 label 时的回退映射。
 */
export function flowPortSocketLabel(portLabel: string | undefined | null, handleId: string): string {
  const named = (portLabel || '').trim();
  if (named) return named;
  return flowSocketLabelZh(handleId);
}
