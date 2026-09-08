/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import type { CanvasNode, SchemePort } from '../types';
import { getResultDisplayUrl } from './resultExtractor';
import {
  buildTypedMentionAssets,
  type MentionAsset,
  type MentionMediaType,
} from './mentionPrompt';
import {
  collectManualMentionItems,
} from './flowManualRefs';
import { enabledPorts, listHandlesForPort } from './schemeIo';

type MentionFileItem = { url: string; type: MentionMediaType };

function absoluteUrl(raw: string): string {
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }
  return `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function guessMentionMediaType(url: string, hint?: string): MentionMediaType {
  const h = (hint || '').toLowerCase();
  if (h === 'image' || h === 'video' || h === 'audio' || h === 'file') return h;
  if (h === 'document') return 'file';
  const path = url.split('?')[0].toLowerCase();
  if (/\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(path) || path.includes('/video')) return 'video';
  if (/\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(path) || path.includes('/audio')) return 'audio';
  if (/\.(pdf|doc|docx|txt|md)$/i.test(path) || path.includes('/file')) return 'file';
  return 'image';
}

function fileKindFromMeta(file: any): string {
  return String(file?.kind || file?.asset_type || file?.mime || '').toLowerCase();
}

/** 从素材 / 结果节点抽出全部文件（不去类型） */
function collectFilesFromMediaNode(src: CanvasNode | null | undefined): MentionFileItem[] {
  if (!src) return [];
  const items: MentionFileItem[] = [];
  const seen = new Set<string>();
  const push = (raw: string, hint?: string) => {
    const url = absoluteUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ url, type: guessMentionMediaType(url, hint) });
  };

  const filesFromTask = Array.isArray(src.taskData?.files) ? src.taskData.files : [];
  const filesFromResult = Array.isArray(src.resultData?.content?.files)
    ? src.resultData.content.files
    : [];
  const fileList = filesFromTask.length > 0 ? filesFromTask : filesFromResult;

  if (fileList.length > 0) {
    for (const f of fileList) {
      const kind = fileKindFromMeta(f);
      const hint = kind.startsWith('image/')
        ? 'image'
        : kind.startsWith('video/')
          ? 'video'
          : kind.startsWith('audio/')
            ? 'audio'
            : kind;
      push(f.url || f.file_url || '', hint);
    }
    if (items.length) return items;
  }

  const nodeType = String(src.taskData?.node_type || src.type || '');
  const displayUrl = getResultDisplayUrl(src.type, src.resultData);
  if (displayUrl) {
    const hint =
      nodeType.includes('video') || src.type === 'video'
        ? 'video'
        : nodeType.includes('audio') || src.type === 'audio'
          ? 'audio'
          : nodeType.includes('image') || src.type === 'image'
            ? 'image'
            : undefined;
    push(displayUrl, hint);
  }
  return items;
}

/** 沿 parent 链找到带文件的上游媒体节点 */
function findUpstreamMediaNode(
  nodeId: string | undefined,
  nodes: CanvasNode[],
): CanvasNode | null {
  if (!nodeId) return null;
  const parent = nodes.find((n) => n.id === nodeId);
  if (!parent || parent.isHidden) return null;
  const files = collectFilesFromMediaNode(parent);
  if (files.length) return parent;
  return findUpstreamMediaNode(parent.parentId, nodes);
}

function isGenNode(n: CanvasNode): boolean {
  const t = n.taskData?.node_type;
  return t === 'ai_image' || t === 'ai_video';
}

function genNodeInputs(n: CanvasNode): SchemePort[] {
  return Array.isArray(n.taskData?.io_inputs) ? (n.taskData.io_inputs as SchemePort[]) : [];
}

/** 生成节点插槽上已接入的上游文件 + 手动参考图 */
export function collectGenNodeMentionItems(
  genNode: CanvasNode,
  nodes: CanvasNode[],
): MentionFileItem[] {
  const items: MentionFileItem[] = [];
  const seen = new Set<string>();
  const pushAll = (next: MentionFileItem[]) => {
    for (const it of next) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      items.push(it);
    }
  };

  const conns = genNode.inputConnections || {};
  const inputs = genNodeInputs(genNode);
  const mediaPorts = enabledPorts(inputs).filter((p) => p.modality !== 'text');

  if (mediaPorts.length > 0) {
    for (const port of mediaPorts) {
      const handles = listHandlesForPort(port, conns);
      const handleSet = new Set(handles);
      if (port.handle_prefix && conns[port.handle_prefix] && !handleSet.has(port.handle_prefix)) {
        handles.push(port.handle_prefix);
      }
      for (const h of handles) {
        const srcId = conns[h];
        if (!srcId) continue;
        const src = findUpstreamMediaNode(srcId, nodes);
        if (!src) continue;
        const files = collectFilesFromMediaNode(src).map((f) => ({
          url: f.url,
          type:
            f.type !== 'image'
              ? f.type
              : guessMentionMediaType(f.url, port.modality === 'file' ? 'file' : port.modality),
        }));
        pushAll(files);
      }
    }
  } else {
    for (const [handle, srcId] of Object.entries(conns)) {
      if (!srcId) continue;
      if (handle === 'Prompt' || handle.toLowerCase().includes('prompt')) continue;
      const src = findUpstreamMediaNode(srcId, nodes);
      if (!src) continue;
      pushAll(collectFilesFromMediaNode(src));
    }
  }

  const manuals = collectManualMentionItems(genNode.taskData, inputs);
  for (const it of manuals) {
    const url = absoluteUrl(it.url);
    if (!url) continue;
    const type = it.type === 'document' ? 'file' : it.type;
    pushAll([{ url, type }]);
  }

  return items;
}

function genHasOwnPromptConnection(gen: CanvasNode, nodes: CanvasNode[], promptId: string): boolean {
  const conns = gen.inputConnections || {};
  return Object.values(conns).some((id) => {
    if (id === promptId) return true;
    const src = nodes.find((n) => n.id === id);
    return src?.taskData?.node_type === 'prompt';
  });
}

/** 提示词节点关联的下游图片/视频生成节点 */
function findDownstreamGenNodes(promptId: string, nodes: CanvasNode[]): CanvasNode[] {
  const prompt = nodes.find((n) => n.id === promptId);
  return nodes.filter((n) => {
    if (n.isHidden || n.id === promptId || !isGenNode(n)) return false;
    const conns = n.inputConnections || {};
    if (Object.values(conns).includes(promptId)) return true;
    if (n.parentId === promptId) return true;
    if (prompt?.parentId && n.parentId === prompt.parentId && !genHasOwnPromptConnection(n, nodes, promptId)) {
      return true;
    }
    return false;
  });
}

export function collectPromptNodeMentionItems(
  promptId: string,
  nodes: CanvasNode[],
): MentionFileItem[] {
  const seen = new Set<string>();
  const items: MentionFileItem[] = [];
  for (const gen of findDownstreamGenNodes(promptId, nodes)) {
    for (const it of collectGenNodeMentionItems(gen, nodes)) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      items.push(it);
    }
  }
  return items;
}

export function buildFlowMentionAssets(items: MentionFileItem[]): MentionAsset[] {
  return buildTypedMentionAssets(items);
}
