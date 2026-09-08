/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 素材节点：上传或从资源库选择，支持同类型多文件（对齐 Imagine Flow）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spin } from '../../ui';
import toast from '../PlaygroundToast';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import type { AdvancedNodeProps } from './shared/types';
import NodeMoreMenu, { getNodeDisplayTitle } from './shared/NodeMoreMenu';
import NodeTitleInline from './shared/NodeTitleInline';
import NodeConnectors from './shared/NodeConnectors';
import { getResultDisplayUrl } from '../../utils/resultExtractor';
import {
  classifyWorkflowAssetFile,
  type WorkflowAssetKind,
} from '../../utils/referenceUpload';
import { buildLocalFlowPicks } from '../../utils/deferredLocalUpload';
import { unregisterLocalFile, isBlobUrl, getLocalFile } from '../../utils/localFileRegistry';
import { toResourceDisplayName } from '../../utils/resourceFileName';
import { FlowIconAssets, FlowIconPlus, FlowIconUpload } from '../flow/flowIcons';
import generateUUID from '../../../../../utils/uuid';
import FlowAssetLibraryModal, {
  type FlowAssetPickResult,
} from '../flow/FlowAssetLibraryModal';
import { useClickUnlessDrag } from '../../utils/clickUnlessDrag';
import { SCHEME_ASSET_KIND_OPTIONS } from '../../utils/schemeIo';
import type { SchemeAssetKind } from '../../types';

const ACCEPT_ALL =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ACCEPT_BY_KIND: Record<WorkflowAssetKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document:
    '.pdf,.doc,.docx,.txt,.md,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type AssetFileItem = {
  id: string;
  url: string;
  fileName?: string;
  /** 选择时的原始文件名（含后缀），真实上传时使用 */
  originalFileName?: string;
  mime?: string;
  kind: WorkflowAssetKind;
  source?: 'upload' | 'library';
  resource_id?: string;
  /** 字节大小（本地 File / 资源库） */
  fileSize?: number;
};

function kindToNodeType(kind: WorkflowAssetKind): 'image' | 'video' | 'audio' | 'text' {
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'audio';
  if (kind === 'document') return 'text';
  return 'image';
}

function buildResultData(kind: WorkflowAssetKind, url: string) {
  if (kind === 'video') return { content: { video_url: url } };
  if (kind === 'audio') return { content: { audio_url: url } };
  if (kind === 'document') return { content: { file_url: url } };
  return { content: { image_url: url } };
}

function buildResultDataFromFiles(files: AssetFileItem[], activeFileId?: string) {
  if (!files.length) return { content: { image_url: '' } };
  const primary =
    (activeFileId ? files.find((f) => f.id === activeFileId) : null) || files[0];
  const base = buildResultData(primary.kind, primary.url);
  return {
    ...base,
    content: {
      ...base.content,
      files: files.map((f) => ({
        id: f.id,
        url: f.url,
        kind: f.kind,
        file_name: f.fileName,
        original_file_name: f.originalFileName,
        mime: f.mime,
        resource_id: f.resource_id,
        file_size: f.fileSize,
      })),
      active_file_id: primary.id,
    },
  };
}

function addMoreLabel(kind: WorkflowAssetKind): string {
  if (kind === 'image') return '添加更多图片';
  if (kind === 'video') return '添加更多视频';
  if (kind === 'audio') return '添加更多音频';
  return '添加更多文件';
}

function newItemId() {
  return `af_${generateUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** 左右对调箭头（更换） */
function IconReplace({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7h11l-3-3" />
      <path d="M19 7l-3 3" />
      <path d="M16 17H5l3 3" />
      <path d="M5 17l3-3" />
    </svg>
  );
}

function IconTrash({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function IconPlay({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.92)" />
      <path d="M20 16.5v15l12-7.5-12-7.5z" fill="#1a1a1a" />
    </svg>
  );
}

const AssetMediaCard: React.FC<{
  item: AssetFileItem;
  onReplace: () => void;
  onRemove: () => void;
}> = ({ item, onReplace, onRemove }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // 切换文件时只换源，不卸载卡片，避免节点面板闪白
  useEffect(() => {
    setPlaying(false);
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, [item.url, item.kind]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="pg-flow-asset-media">
      {item.kind === 'image' && <img src={item.url} alt={item.fileName || '素材'} draggable={false} />}
      {item.kind === 'video' && (
        <>
          <video
            ref={videoRef}
            src={item.url}
            playsInline
            preload="metadata"
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
          />
          {!playing && (
            <button type="button" className="pg-flow-asset-play" onClick={togglePlay} aria-label="播放">
              <IconPlay />
            </button>
          )}
          {playing && (
            <button type="button" className="pg-flow-asset-play is-playing" onClick={togglePlay} aria-label="暂停" />
          )}
        </>
      )}
      {item.kind === 'audio' && (
        <div className="pg-flow-asset-doc">
          <audio src={item.url} controls preload="metadata" onClick={(e) => e.stopPropagation()} />
          <span>{item.fileName || '音频'}</span>
        </div>
      )}
      {item.kind === 'document' && (
        <div className="pg-flow-asset-doc">
          <FlowIconUpload size={28} />
          <span>{item.fileName || '文档'}</span>
          <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            打开
          </a>
        </div>
      )}
      <div className="pg-flow-asset-media-actions">
        <button type="button" title="更换" aria-label="更换" onClick={(e) => { e.stopPropagation(); onReplace(); }}>
          <IconReplace />
        </button>
        <button type="button" title="删除" aria-label="删除" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <IconTrash />
        </button>
      </div>
    </div>
  );
};

const AssetNode: React.FC<AdvancedNodeProps> = ({
  node,
  nodes,
  onRemove,
  updateNodeTaskData,
  setNodes,
  saveCanvasState,
  isSelected,
}) => {
  const {
    connectingSourceId,
    setConnectingSourceId,
    setConnectingMousePos,
    canvasRef,
    canvasTransform,
  } = useCanvas();
  const { currentProjectId } = usePlayground();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileIntentRef = useRef<'seed' | 'append' | `replace:${string}`>('seed');
  const switchSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  /** 仅用于驱动 input.accept / multiple 重渲染 */
  const [fileIntent, setFileIntent] = useState<'seed' | 'append' | `replace:${string}`>('seed');

  const defaultTitle = `素材 ${node.id.split('-').pop()?.slice(-3) || '1'}`;
  const nodeTitle = getNodeDisplayTitle(node, defaultTitle);

  const files: AssetFileItem[] = useMemo(() => {
    const isUsable = (url?: string) => {
      if (!url) return false;
      if (!isBlobUrl(url)) return true;
      // 刷新后 registry 为空：失效 blob 不展示
      return !!getLocalFile(url);
    };
    const stored = node.taskData?.files as AssetFileItem[] | undefined;
    if (Array.isArray(stored) && stored.length > 0) {
      return stored
        .filter((f) => isUsable(f?.url))
        .map((f) => ({
          ...f,
          fileSize:
            f.fileSize ||
            (typeof (f as any).file_size === 'number' ? (f as any).file_size : undefined) ||
            (isBlobUrl(f.url) ? getLocalFile(f.url)?.size : undefined),
        }));
    }
    const kind = (node.taskData?.media_kind as WorkflowAssetKind) || 'image';
    let url = '';
    if (kind === 'document') {
      url = node.resultData?.content?.file_url || '';
    } else {
      const t = node.type === 'text' ? 'image' : node.type;
      url = getResultDisplayUrl(t, node.resultData) || node.resultData?.content?.file_url || '';
    }
    if (!isUsable(url)) return [];
    return [
      {
        id: `legacy_${node.id}`,
        url,
        fileName: node.taskData?.file_name as string | undefined,
        originalFileName: node.taskData?.original_file_name as string | undefined,
        mime: node.taskData?.mime as string | undefined,
        kind,
        source: node.taskData?.source as 'upload' | 'library' | undefined,
      },
    ];
  }, [node.id, node.type, node.resultData, node.taskData]);

  const mediaKind: WorkflowAssetKind = files[0]?.kind || (node.taskData?.media_kind as WorkflowAssetKind) || 'image';
  const hasMedia = files.length > 0;
  /** 空素材连口后写入的可选文件类型；有内容后以内容为准；清空内容后清除 */
  const boundKinds = useMemo((): SchemeAssetKind[] | null => {
    if (hasMedia) return null;
    const raw = node.taskData?.bound_asset_kinds;
    if (!Array.isArray(raw) || !raw.length) return null;
    return raw.filter((k): k is SchemeAssetKind =>
      ['image', 'video', 'audio', 'document'].includes(String(k)),
    );
  }, [hasMedia, node.taskData?.bound_asset_kinds]);

  const kindLabel = (k: string) =>
    SCHEME_ASSET_KIND_OPTIONS.find((o) => o.value === k)?.label || k;

  const acceptFromKinds = (kinds: SchemeAssetKind[]) =>
    kinds.map((k) => ACCEPT_BY_KIND[k as WorkflowAssetKind] || '').filter(Boolean).join(',');
  const activeFileId = useMemo(() => {
    const stored =
      (typeof node.taskData?.active_file_id === 'string' && node.taskData.active_file_id) ||
      (typeof node.resultData?.content?.active_file_id === 'string' &&
        node.resultData.content.active_file_id) ||
      '';
    if (stored && files.some((f) => f.id === stored)) return stored;
    return files[0]?.id || '';
  }, [files, node.taskData?.active_file_id, node.resultData?.content?.active_file_id]);
  const activeIndex = Math.max(0, files.findIndex((f) => f.id === activeFileId));
  const activeItem = files[activeIndex] || files[0] || null;
  const showSockets =
    !!isSelected || isNodeHovered || !!(connectingSourceId && connectingSourceId !== node.id);

  const childConnected = useMemo(
    () => (nodes || []).some((n) => n.parentId === node.id && !n.isHidden),
    [nodes, node.id],
  );

  const persistFiles = (nextFiles: AssetFileItem[], preferredActiveId?: string) => {
    setNodes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== node.id) return n;
        if (!nextFiles.length) {
          return {
            ...n,
            type: 'image' as const,
            status: 'completed' as const,
            resultData: { content: { image_url: '' } },
            taskData: {
              ...(n.taskData || {}),
              node_type: 'asset',
              media_kind: undefined,
              file_name: undefined,
              mime: undefined,
              source: undefined,
              local_blob: undefined,
              files: [],
              active_file_id: undefined,
              // 清空内容后取消插槽文件类型限制
              bound_asset_kinds: undefined,
            },
          };
        }
        const prevActive =
          preferredActiveId ||
          (typeof n.taskData?.active_file_id === 'string' ? n.taskData.active_file_id : '') ||
          '';
        const primary =
          (prevActive ? nextFiles.find((f) => f.id === prevActive) : null) || nextFiles[0];
        return {
          ...n,
          type: kindToNodeType(primary.kind),
          status: 'completed' as const,
          resultData: buildResultDataFromFiles(nextFiles, primary.id),
          taskData: {
            ...(n.taskData || {}),
            node_type: 'asset',
            media_kind: primary.kind,
            file_name: primary.fileName,
            original_file_name: primary.originalFileName,
            mime: primary.mime,
            source: primary.source,
            local_blob: nextFiles.some((f) => f.url.startsWith('blob:')) || undefined,
            files: nextFiles,
            active_file_id: primary.id,
            ...(primary.resource_id
              ? { resource_id: primary.resource_id, library_asset_id: primary.resource_id }
              : {}),
          },
        };
      });
      saveCanvasState(next);
      return next;
    });
  };

  const selectActiveFile = (fileId: string) => {
    if (!fileId || fileId === activeFileId) return;
    const target = files.find((f) => f.id === fileId);
    if (!target) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== node.id) return n;
        // 同类型切换不改 node.type，减少外层按 type 分支重挂
        const nextType = kindToNodeType(target.kind);
        return {
          ...n,
          type: n.type === nextType ? n.type : nextType,
          resultData: buildResultDataFromFiles(files, target.id),
          taskData: {
            ...(n.taskData || {}),
            media_kind: target.kind,
            file_name: target.fileName,
            mime: target.mime,
            source: target.source,
            active_file_id: target.id,
          },
        };
      }),
    );
    // 切换预览不立刻 save，避免 saving 状态触发整画布闪烁
    if (switchSaveTimerRef.current) clearTimeout(switchSaveTimerRef.current);
    switchSaveTimerRef.current = setTimeout(() => {
      switchSaveTimerRef.current = null;
      void saveCanvasState();
    }, 450);
  };

  useEffect(
    () => () => {
      if (switchSaveTimerRef.current) clearTimeout(switchSaveTimerRef.current);
    },
    [],
  );

  const stepActiveFile = (delta: number) => {
    if (files.length < 2) return;
    const nextIndex = (activeIndex + delta + files.length) % files.length;
    selectActiveFile(files[nextIndex].id);
  };

  const setIntent = (intent: typeof fileIntent) => {
    fileIntentRef.current = intent;
    setFileIntent(intent);
  };

  const openFileDialog = (intent: typeof fileIntent) => {
    setIntent(intent);
    const el = fileInputRef.current;
    if (!el) return;
    let accept = ACCEPT_ALL;
    if (intent === 'append' || intent.startsWith('replace:')) {
      accept = ACCEPT_BY_KIND[mediaKind];
    } else if (boundKinds?.length) {
      accept = acceptFromKinds(boundKinds);
    }
    el.accept = accept;
    el.multiple = intent === 'append' || intent === 'seed';
    el.value = '';
    el.click();
  };

  const handleFiles = async (
    fileList: FileList | File[] | null,
    intentOverride?: typeof fileIntent,
  ) => {
    const list = fileList ? Array.from(fileList as FileList) : [];
    if (!list.length) return;

    const intent = intentOverride ?? fileIntentRef.current;
    const constrainKind: WorkflowAssetKind | null =
      intent === 'append' || intent.startsWith('replace:')
        ? mediaKind
        : boundKinds?.length === 1
          ? (boundKinds[0] as WorkflowAssetKind)
          : null;
    const allowedKinds: SchemeAssetKind[] | null =
      intent === 'append' || intent.startsWith('replace:')
        ? [mediaKind]
        : boundKinds;

    const prepared: { file: File; kind: WorkflowAssetKind }[] = [];
    for (const file of list) {
      const kind = classifyWorkflowAssetFile(file);
      if (!kind) {
        toast.warning('仅支持图片、视频、音频或 PDF/Word 等文档');
        continue;
      }
      if (allowedKinds?.length && !allowedKinds.includes(kind)) {
        toast.warning(
          `当前插槽仅支持${allowedKinds.map(kindLabel).join('/')}，请选择对应类型文件`,
        );
        continue;
      }
      if (constrainKind && kind !== constrainKind) {
        toast.warning(`请选择${kindLabel(constrainKind)}文件`);
        continue;
      }
      if (file.size > 30 * 1024 * 1024) {
        toast.warning(`${file.name} 超过 30MB，已跳过`);
        continue;
      }
      if (!constrainKind && !allowedKinds?.length && prepared.length > 0 && prepared[0].kind !== kind) {
        toast.warning('一次只能添加同类型文件');
        continue;
      }
      prepared.push({ file, kind });
    }
    if (!prepared.length) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const { picks, warnings } = buildLocalFlowPicks(
        prepared.map((p) => p.file),
        { constrainKind: constrainKind || null },
      );
      for (const w of Array.from(new Set(warnings))) toast.warning(w);
      const uploaded: AssetFileItem[] = picks.map((picked) => ({
        id: newItemId(),
        url: picked.url,
        kind: picked.kind,
        fileName: picked.fileName || toResourceDisplayName(picked.originalFileName || picked.fileName || ''),
        originalFileName: picked.originalFileName || picked.file?.name,
        mime: picked.mime,
        source: 'upload' as const,
        resource_id: picked.resourceId,
        fileSize: picked.fileSize || picked.file?.size || undefined,
      }));
      if (!uploaded.length) return;

      if (intent.startsWith('replace:')) {
        const rid = intent.slice('replace:'.length);
        const replacement = uploaded[0];
        if (replacement) {
          persistFiles(files.map((f) => (f.id === rid ? { ...replacement, id: f.id } : f)));
          toast.success('已更换素材');
        }
      } else if (intent === 'append') {
        persistFiles([...files, ...uploaded]);
        toast.success(uploaded.length > 1 ? `已添加 ${uploaded.length} 个文件` : '已添加');
      } else {
        persistFiles(uploaded);
        toast.success(uploaded.length > 1 ? `已添加 ${uploaded.length} 个素材` : '已添加本地素材');
      }
    } catch (e: any) {
      toast.error(e?.message || '添加失败');
    } finally {
      setUploading(false);
      setIntent('seed');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openPicker = (intent: typeof fileIntent = 'seed') => {
    // 资源库暂仅图片/视频；音频与文档仍走本地上传
    const seedBound = !hasMedia && boundKinds?.length ? boundKinds : null;

    if (intent.startsWith('replace:') || intent === 'append') {
      if (mediaKind !== 'image' && mediaKind !== 'video') {
        toast.info('资源库暂仅支持图片与视频，请使用本地上传');
        openFileDialog(intent);
        return;
      }
      setIntent(intent);
      setPickerOpen(true);
      return;
    }
    if (seedBound?.length && seedBound.every((k) => k !== 'image' && k !== 'video')) {
      toast.info('资源库暂仅支持图片与视频，请使用本地上传');
      openFileDialog('seed');
      return;
    }
    if (hasMedia && mediaKind !== 'image' && mediaKind !== 'video') {
      toast.info('资源库暂仅支持图片与视频，请使用本地上传');
      openFileDialog('append');
      return;
    }
    setIntent(hasMedia ? 'append' : 'seed');
    setPickerOpen(true);
  };

  const addMoreClick = useClickUnlessDrag(() => openPicker('append'));
  const libraryClick = useClickUnlessDrag(() => openPicker('seed'));
  const dropzoneClick = useClickUnlessDrag(() => openFileDialog('seed'));

  const applyPickResults = (pickedList: FlowAssetPickResult[]) => {
    if (!pickedList.length) return;
    const allowed = hasMedia
      ? [mediaKind]
      : boundKinds;
    const filtered = allowed?.length
      ? pickedList.filter((p) => allowed.includes(p.kind as SchemeAssetKind))
      : pickedList;
    if (!filtered.length) {
      toast.warning(
        allowed?.length
          ? `当前插槽仅支持${allowed.map(kindLabel).join('/')}，请选择对应类型`
          : '没有可用素材',
      );
      return;
    }
    if (filtered.length < pickedList.length) {
      toast.warning(`已过滤不符合插槽要求的文件（仅保留${allowed!.map(kindLabel).join('/')}）`);
    }
    const nextItems: AssetFileItem[] = filtered.map((picked) => ({
      id: newItemId(),
      url: picked.url,
      kind: picked.kind,
      fileName: picked.fileName,
      originalFileName: picked.originalFileName || picked.file?.name,
      mime: picked.mime,
      source: (picked.source as 'upload' | 'library') || 'library',
      resource_id: picked.resourceId,
      fileSize: picked.fileSize || picked.file?.size || undefined,
    }));
    const intent = fileIntentRef.current;
    if (intent.startsWith('replace:')) {
      const rid = intent.slice('replace:'.length);
      const replacement = nextItems[0];
      if (replacement) {
        const prev = files.find((f) => f.id === rid);
        if (prev?.url && isBlobUrl(prev.url)) unregisterLocalFile(prev.url);
        persistFiles(files.map((f) => (f.id === rid ? { ...replacement, id: f.id } : f)));
        toast.success('已更换素材');
      }
    } else if (intent === 'append' || hasMedia) {
      persistFiles([...files, ...nextItems]);
      toast.success(nextItems.length > 1 ? `已添加 ${nextItems.length} 个文件` : '已添加');
    } else {
      persistFiles(nextItems);
      toast.success(
        nextItems.length > 1
          ? `已选择 ${nextItems.length} 个资源`
          : nextItems[0]?.source === 'library'
            ? '已从资源中选择'
            : '已添加本地素材',
      );
    }
    setIntent('seed');
  };

  const removeItem = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target?.url && isBlobUrl(target.url)) unregisterLocalFile(target.url);
    persistFiles(files.filter((f) => f.id !== id));
  };

  const socketColor =
    mediaKind === 'video' ? '#4ade80' : mediaKind === 'audio' ? '#f472b6' : '#f59e0b';

  const startConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingSourceId(node.id);
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectingMousePos({
        x: (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
        y: (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
      });
    }
  };

  const fileAccept =
    fileIntent === 'append' || fileIntent.startsWith('replace:')
      ? ACCEPT_BY_KIND[mediaKind]
      : boundKinds?.length
        ? acceptFromKinds(boundKinds)
        : ACCEPT_ALL;

  const multi = fileIntent === 'append' || fileIntent === 'seed';

  return (
    <div
      className="pg-flow-asset-node"
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
    >
      <div className="pg-flow-asset-node-chrome">
        <div className="pg-flow-asset-node-title-row">
          <FlowIconAssets size={14} />
          <NodeTitleInline
            nodeId={node.id}
            title={nodeTitle}
            onCommit={(next) => updateNodeTaskData({ label: next, node_title: next })}
          />
        </div>
        <NodeMoreMenu
          hideTrigger
          node={node}
          defaultTitle={defaultTitle}
          onRemove={onRemove}
          updateNodeTaskData={updateNodeTaskData}
          setNodes={setNodes}
          saveCanvasState={saveCanvasState}
        />
      </div>

      <NodeConnectors
        side="right"
        visible={showSockets}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'asset'}
        sockets={[
          {
            id: 'File',
            color: socketColor,
            connected: childConnected,
            onConnectStart: startConnect,
          },
        ]}
      />

      <div
        className={`pg-flow-asset-body${hasMedia ? ' has-media' : ''}${dragOver ? ' is-dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const intent = hasMedia ? 'append' : 'seed';
          setIntent(intent);
          void handleFiles(e.dataTransfer.files, intent);
        }}
      >
        {uploading ? (
          <div className="pg-flow-asset-empty">
            <Spin />
            <p className="pg-flow-asset-empty-title">上传中…</p>
          </div>
        ) : hasMedia && activeItem ? (
          <div className="pg-flow-asset-filled">
            <div className="pg-flow-asset-stack">
              <AssetMediaCard
                item={activeItem}
                onReplace={() => openPicker(`replace:${activeItem.id}`)}
                onRemove={() => removeItem(activeItem.id)}
              />
            </div>
            <button
              type="button"
              className="pg-flow-asset-add-more"
              {...addMoreClick}
            >
              <FlowIconPlus size={16} />
              <span>{addMoreLabel(mediaKind)}</span>
            </button>
          </div>
        ) : (
          <div className="pg-flow-asset-empty">
            <button
              type="button"
              className="pg-flow-asset-dropzone"
              {...dropzoneClick}
            >
              <span className="pg-flow-asset-drop-icon" aria-hidden>
                <FlowIconUpload size={32} />
              </span>
              <span className="pg-flow-asset-empty-title">上传素材或拖拽至此</span>
              <span className="pg-flow-asset-empty-sub">
                {boundKinds?.length ? (
                  <>
                    当前插槽需要<em>{boundKinds.map(kindLabel).join('、')}</em>
                    ，大小不超过 30MB
                  </>
                ) : (
                  <>
                    <em>图片</em>、<em>视频</em>、<em>音频</em>和<em>文档</em>，大小不超过 30MB
                  </>
                )}
              </span>
            </button>
            <span className="pg-flow-asset-or">或</span>
            <button
              type="button"
              className="pg-flow-asset-library-btn"
              {...libraryClick}
            >
              从资源中选择
            </button>
          </div>
        )}
      </div>

      {files.length > 1 && (
        <div
          className="pg-flow-asset-switcher"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pg-flow-asset-switcher-row">
            <button
              type="button"
              className="pg-flow-asset-switcher-nav"
              aria-label="上一个"
              onClick={(e) => {
                e.stopPropagation();
                stepActiveFile(-1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="pg-flow-asset-switcher-thumbs">
              {files.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className={`pg-flow-asset-switcher-thumb${item.id === activeFileId ? ' is-active' : ''}`}
                  aria-label={`素材 ${idx + 1}`}
                  aria-pressed={item.id === activeFileId}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectActiveFile(item.id);
                  }}
                >
                  {item.kind === 'image' ? (
                    <img src={item.url} alt="" draggable={false} />
                  ) : item.kind === 'video' ? (
                    <video src={item.url} muted playsInline preload="metadata" draggable={false} />
                  ) : (
                    <span className="pg-flow-asset-switcher-thumb-fallback">
                      {item.kind === 'audio' ? '♪' : 'DOC'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pg-flow-asset-switcher-nav"
              aria-label="下一个"
              onClick={(e) => {
                e.stopPropagation();
                stepActiveFile(1);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <div className="pg-flow-asset-switcher-meta">
            {activeIndex + 1} of {files.length}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        multiple={multi}
        style={{ display: 'none' }}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <FlowAssetLibraryModal
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setIntent('seed');
        }}
        onConfirm={applyPickResults}
        constrainKind={
          hasMedia && (mediaKind === 'image' || mediaKind === 'video')
            ? mediaKind
            : !hasMedia && boundKinds?.length === 1 && (boundKinds[0] === 'image' || boundKinds[0] === 'video')
              ? boundKinds[0]
              : null
        }
        projectId={currentProjectId}
      />
    </div>
  );
};

export default AssetNode;
