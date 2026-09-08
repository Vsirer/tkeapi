/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 独立工具页：按方案 IO 渲染输入区（样式/交互对齐 Imagine Video 左栏）
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Upload, FolderOpen } from 'lucide-react';
import { DeleteOutlined, Dropdown, message } from '../ui';
import type { SchemeAssetKind, SchemePort } from '../types';
import FlowAssetLibraryModal, { type FlowAssetPickResult } from './flow/FlowAssetLibraryModal';
import MentionPromptField from './MentionPromptField';
import {
  buildTypedMentionAssets,
  removeAndRenumberMentions,
  type MentionMediaType,
} from '../utils/mentionPrompt';
import { buildLocalFlowPicks } from '../utils/deferredLocalUpload';
import { isBlobUrl, unregisterLocalFile } from '../utils/localFileRegistry';
import {
  getMediaInputPorts,
  getPortUrls,
  getTextInputPorts,
  portAcceptKinds,
  portMaxFiles,
  type SchemeIoToolValues,
} from '../utils/schemeIoToolValues';
import './SchemeIoComposer.css';

type MediaTab = 'frames' | 'references';

type PickerTarget =
  | {
      mode: 'port';
      portKey: string;
      kinds: SchemeAssetKind[];
      max: number;
    }
  | {
      mode: 'unified-refs';
      kinds: SchemeAssetKind[];
      max: number;
    };

function isFramePort(port: SchemePort): boolean {
  const k = (port.key || '').toLowerCase();
  const label = (port.label || '').toLowerCase();
  return (
    k === 'start_frame' ||
    k === 'end_frame' ||
    k === 'last_frame' ||
    k.includes('start_frame') ||
    k.includes('end_frame') ||
    label.includes('首帧') ||
    label.includes('尾帧') ||
    label.includes('起始帧') ||
    label.includes('结束帧') ||
    label.includes('start frame') ||
    label.includes('last frame') ||
    label.includes('end frame')
  );
}

function frameDisplayLabel(
  port: SchemePort,
  t: (key: string, fallback: string) => string,
  isSingle?: boolean,
): string {
  const k = (port.key || '').toLowerCase();
  const label = port.label || '';
  if (
    k.includes('end') ||
    k.includes('last') ||
    label.includes('尾') ||
    label.includes('结束') ||
    /last|end/i.test(label)
  ) {
    return t('playground_2026:io_last_frame', '尾帧');
  }
  if (
    k.includes('start') ||
    label.includes('首') ||
    label.includes('起始') ||
    /start/i.test(label)
  ) {
    if (isSingle) {
      return t('playground_2026:io_select_image_asset', '选择图片素材');
    }
    return t('playground_2026:io_start_frame', '首帧');
  }
  if (isSingle) {
    return t('playground_2026:io_select_image_asset', '选择图片素材');
  }
  return label || port.key;
}

function isReferencePort(port: SchemePort): boolean {
  if (isFramePort(port)) return false;
  const k = (port.key || '').toLowerCase();
  return (
    k.startsWith('reference') ||
    k === 'source_video' ||
    port.modality === 'image' ||
    port.modality === 'video' ||
    port.modality === 'audio' ||
    port.modality === 'file'
  );
}

function FrameUploadGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="23" height="23" rx="7" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M14 18.5V10.5m0 0L10.7 13.8M14 10.5l3.3 3.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V6m0 0l-3.5 3.5M12 6l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const MediaKindGlyphs: React.FC<{ kinds: SchemeAssetKind[] }> = ({ kinds }) => {
  const showImage = kinds.includes('image');
  const showVideo = kinds.includes('video');
  const showAudio = kinds.includes('audio');
  return (
  <div className="pg-sio-glyphs-stack" aria-hidden>
    <span className="pg-sio-glyph-circle">
      <UploadGlyph />
    </span>
    {showImage && (
    <span className="pg-sio-glyph-circle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <path d="M4 16l4.5-4 3 3 3.5-4.5L20 16" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
    )}
    {showVideo && (
    <span className="pg-sio-glyph-circle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16.5 10.5L20.5 8v8l-4-2.5v-3z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
    )}
    {showAudio && (
    <span className="pg-sio-glyph-circle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
    )}
  </div>
  );
};

function guessUrlKind(url: string): SchemeAssetKind {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('/video')) return 'video';
  if (/\.(mp3|wav|m4a|aac)(\?|$)/i.test(url) || url.includes('/audio')) return 'audio';
  return 'image';
}

function toMentionType(kind: SchemeAssetKind): MentionMediaType {
  if (kind === 'document') return 'file';
  return kind;
}

function acceptAttr(kinds: SchemeAssetKind[]): string {
  const parts: string[] = [];
  if (kinds.includes('image')) parts.push('image/*');
  if (kinds.includes('video')) parts.push('video/*');
  if (kinds.includes('audio')) parts.push('audio/*');
  return parts.join(',') || 'image/*';
}

export type SchemeIoComposerProps = {
  ports: SchemePort[];
  values: SchemeIoToolValues;
  onChange: (next: SchemeIoToolValues) => void;
  disabled?: boolean;
  enableMentions?: boolean;
  className?: string;
  /** 提示词占位；默认对齐 Imagine */
  promptPlaceholder?: string;
  /** 提示词下方插槽（快捷栏等） */
  afterPrompt?: React.ReactNode;
  /** 提示词卡片内部左下角插槽（如 Token 选择器） */
  promptFooter?: React.ReactNode;
  /** 切到首尾帧等模式时默认选中 Frames */
  preferredMediaTab?: MediaTab;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onSubmit?: () => void;
};

const SchemeIoComposer: React.FC<SchemeIoComposerProps> = ({
  ports,
  values,
  onChange,
  disabled,
  enableMentions = true,
  className,
  promptPlaceholder,
  afterPrompt,
  promptFooter,
  preferredMediaTab,
  onKeyDown,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<PickerTarget | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [mediaTab, setMediaTab] = useState<MediaTab>('references');
  const textPorts = useMemo(() => getTextInputPorts(ports), [ports]);
  const mediaPorts = useMemo(() => getMediaInputPorts(ports), [ports]);
  const framePorts = useMemo(() => mediaPorts.filter(isFramePort), [mediaPorts]);
  const referencePorts = useMemo(() => mediaPorts.filter(isReferencePort), [mediaPorts]);
  const hasFrames = framePorts.length > 0;
  const hasRefs = referencePorts.length > 0;
  /** 仅首尾帧+参考同时存在时才显示切换；单槽不渲染多余 tab */
  const showTabBar = hasFrames && hasRefs;
  const activeTab: MediaTab =
    mediaTab === 'references' && hasRefs
      ? 'references'
      : mediaTab === 'frames' && hasFrames
        ? 'frames'
        : hasRefs
          ? 'references'
          : 'frames';

  useEffect(() => {
    if (mediaTab === 'references' && !hasRefs && hasFrames) setMediaTab('frames');
    if (mediaTab === 'frames' && !hasFrames && hasRefs) setMediaTab('references');
  }, [mediaTab, hasFrames, hasRefs]);

  useEffect(() => {
    if (preferredMediaTab === 'frames' && hasFrames) setMediaTab('frames');
    if (preferredMediaTab === 'references' && hasRefs) setMediaTab('references');
  }, [preferredMediaTab, hasFrames, hasRefs]);

  /** 参考区始终走 Imagine 横向条（多口合并 / 单口同款） */
  const showRefsPanel = activeTab === 'references' && hasRefs;
  const showFramesPanel = activeTab === 'frames' && hasFrames;

  const promptPort =
    textPorts.find((p) => p.key === 'prompt' || p.bind_key === 'prompt') || textPorts[0];
  const otherTextPorts = textPorts.filter((p) => p !== promptPort);
  const promptKey = promptPort?.key || 'prompt';
  const promptValue =
    promptPort && typeof values[promptPort.key] === 'string'
      ? (values[promptPort.key] as string)
      : typeof values.prompt === 'string'
        ? values.prompt
        : '';

  const mentionAssets = useMemo(() => {
    if (!enableMentions) return [];
    const items: Array<{ url: string; type: MentionMediaType }> = [];
    for (const p of mediaPorts) {
      const kinds = portAcceptKinds(p);
      for (const url of getPortUrls(values, p.key)) {
        const kind = kinds[0] || guessUrlKind(url);
        items.push({ url, type: toMentionType(kind) });
      }
    }
    return buildTypedMentionAssets(items);
  }, [enableMentions, mediaPorts, values]);

  const unifiedItems = useMemo(() => {
    if (!showRefsPanel) return [];
    return referencePorts.flatMap((port) =>
      getPortUrls(values, port.key).map((url, idx) => ({
        portKey: port.key,
        url,
        idx,
        kind: portAcceptKinds(port)[0] || guessUrlKind(url),
      })),
    );
  }, [showRefsPanel, referencePorts, values]);

  const imageItems = useMemo(
    () => unifiedItems.filter((it) => it.kind === 'image'),
    [unifiedItems],
  );
  const videoItems = useMemo(
    () => unifiedItems.filter((it) => it.kind === 'video'),
    [unifiedItems],
  );
  const audioItems = useMemo(
    () => unifiedItems.filter((it) => it.kind === 'audio'),
    [unifiedItems],
  );

  const activeTypeGroups = useMemo(() => {
    const groups: { kind: SchemeAssetKind; items: typeof unifiedItems }[] = [];
    if (imageItems.length > 0) groups.push({ kind: 'image', items: imageItems });
    if (videoItems.length > 0) groups.push({ kind: 'video', items: videoItems });
    if (audioItems.length > 0) groups.push({ kind: 'audio', items: audioItems });
    return groups;
  }, [imageItems, videoItems, audioItems]);

  const unifiedOptional = showRefsPanel && referencePorts.every((p) => !p.required);
  const unifiedKinds = useMemo(() => {
    const set = new Set<SchemeAssetKind>();
    for (const p of referencePorts) for (const k of portAcceptKinds(p)) set.add(k);
    return Array.from(set);
  }, [referencePorts]);

  const hasImage = unifiedKinds.includes('image');
  const hasVideo = unifiedKinds.includes('video');
  const hasAudio = unifiedKinds.includes('audio');

  const unifiedRoom = useMemo(() => {
    return referencePorts.reduce((sum, p) => {
      const max = portMaxFiles(p);
      const cur = getPortUrls(values, p.key).length;
      return sum + Math.max(0, max - cur);
    }, 0);
  }, [referencePorts, values]);

  // 超限裁剪（换模 / 旧数据），避免列表超过方案 max
  const needsClamp = useMemo(
    () =>
      mediaPorts.some(
        (p) => p.modality !== 'text' && getPortUrls(values, p.key).length > portMaxFiles(p),
      ),
    [mediaPorts, values],
  );
  useEffect(() => {
    if (!needsClamp) return;
    let changed = false;
    const next: SchemeIoToolValues = { ...values };
    for (const port of mediaPorts) {
      if (port.modality === 'text') continue;
      const urls = getPortUrls(next, port.key);
      const max = portMaxFiles(port);
      if (urls.length > max) {
        next[port.key] = urls.slice(0, max);
        changed = true;
      }
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsClamp, mediaPorts]);

  const setText = (key: string, text: string) => onChange({ ...values, [key]: text });
  const setPortUrls = (key: string, urls: string[]) => onChange({ ...values, [key]: urls });

  const removePortUrl = (key: string, url: string) => {
    if (url && isBlobUrl(url)) unregisterLocalFile(url);
    const port = mediaPorts.find((p) => p.key === key);
    const kinds = port ? portAcceptKinds(port) : [];
    const type = toMentionType(kinds[0] || guessUrlKind(url));
    const sameType: string[] = [];
    for (const p of mediaPorts) {
      const kindsOfPort = portAcceptKinds(p);
      for (const u of getPortUrls(values, p.key)) {
        const k = kindsOfPort[0] || guessUrlKind(u);
        if (toMentionType(k) !== type) continue;
        sameType.push(u);
      }
    }
    const idx = sameType.indexOf(url);
    const next = getPortUrls(values, key).filter((u) => u !== url);
    const patch: SchemeIoToolValues = { ...values, [key]: next };
    if (idx >= 0) {
      patch[promptKey] = removeAndRenumberMentions(promptValue, type, idx);
    }
    onChange(patch);
  };

  const applyLocalFiles = (
    target: { portKey: string; kinds: SchemeAssetKind[]; max: number },
    files: FileList | File[],
  ) => {
    const list = Array.from(files);
    const prev = getPortUrls(values, target.portKey);
    const room = target.max - prev.length;
    if (room <= 0) {
      message.warning(t('playground_2026:io_port_limit', '已达上限，未加入 {{n}} 个', { n: 1 }));
      return;
    }
    const constrainKind = target.kinds.length === 1 ? target.kinds[0] : null;
    const { picks, warnings } = buildLocalFlowPicks(list.slice(0, room), {
      constrainKind: constrainKind === 'document' ? null : constrainKind,
    });
    for (const w of Array.from(new Set(warnings))) message.warning(w);
    const urls = picks.map((p) => p.url).filter(Boolean);
    if (!urls.length) {
      if (!warnings.length) {
        message.warning(t('playground_2026:image_ref_type_invalid', '请上传匹配的媒体文件'));
      }
      return;
    }
    const nextUrls = Array.from(new Set([...prev, ...urls])).slice(0, target.max);
    const skipped = Math.max(0, prev.length + urls.length - nextUrls.length);
    for (const p of picks) {
      if (p.url && !nextUrls.includes(p.url) && isBlobUrl(p.url)) unregisterLocalFile(p.url);
    }
    setPortUrls(target.portKey, nextUrls);
    if (skipped > 0) {
      message.warning(
        t('playground_2026:io_port_limit', '已达上限，未加入 {{n}} 个', { n: skipped }),
      );
    }
  };

  const applyUnifiedPicks = (picks: FlowAssetPickResult[]) => {
    let next: SchemeIoToolValues = { ...values };
    let added = 0;
    let skipped = 0;
    for (const pick of picks) {
      if (!pick.url?.trim()) {
        skipped += 1;
        continue;
      }
      const kind = (pick.kind as SchemeAssetKind) || guessUrlKind(pick.url);
      const port = referencePorts.find(
        (p) =>
          portAcceptKinds(p).includes(kind) &&
          getPortUrls(next, p.key).length < portMaxFiles(p),
      );
      if (!port) {
        if (isBlobUrl(pick.url)) unregisterLocalFile(pick.url);
        skipped += 1;
        continue;
      }
      const prev = getPortUrls(next, port.key);
      if (prev.includes(pick.url)) {
        skipped += 1;
        continue;
      }
      next = { ...next, [port.key]: [...prev, pick.url] };
      added += 1;
    }
    if (added > 0) onChange(next);
    if (skipped > 0) {
      message.warning(
        t(
          'playground_2026:io_ref_limit_skip',
          '部分未加入：对应类型已达上限或不支持该格式（{{n}}）',
          { n: skipped },
        ),
      );
    }
  };

  const applyUnifiedLocalFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (unifiedRoom <= 0) {
      message.warning(t('playground_2026:io_refs_full', '参考媒体已达上限'));
      return;
    }
    const constrainKind = unifiedKinds.length === 1 ? unifiedKinds[0] : null;
    const { picks, warnings } = buildLocalFlowPicks(list.slice(0, unifiedRoom), {
      constrainKind: constrainKind === 'document' ? null : constrainKind,
    });
    for (const w of Array.from(new Set(warnings))) message.warning(w);
    const allowed = new Set(unifiedKinds);
    const usable: FlowAssetPickResult[] = [];
    for (const p of picks) {
      const kind = p.kind as SchemeAssetKind | undefined;
      if (allowed.size && kind && !allowed.has(kind)) {
        if (p.url && isBlobUrl(p.url)) unregisterLocalFile(p.url);
        continue;
      }
      usable.push(p);
    }
    if (!usable.length) {
      if (!warnings.length) {
        message.warning(t('playground_2026:image_ref_type_invalid', '请上传匹配的媒体文件'));
      }
      return;
    }
    applyUnifiedPicks(usable);
  };

  const clickHiddenFileInput = (kinds: SchemeAssetKind[], multiple: boolean) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = acceptAttr(kinds);
    input.multiple = multiple;
    input.click();
  };

  const openLocalUpload = (port: SchemePort) => {
    if (disabled) return;
    const max = portMaxFiles(port);
    const kinds = portAcceptKinds(port);
    if (getPortUrls(values, port.key).length >= max) return;
    uploadTargetRef.current = { mode: 'port', portKey: port.key, kinds, max };
    clickHiddenFileInput(kinds, max - getPortUrls(values, port.key).length > 1);
  };

  const openUnifiedLocalUpload = (specificKind?: SchemeAssetKind) => {
    const kinds: SchemeAssetKind[] = specificKind
      ? [specificKind]
      : unifiedKinds.length
        ? unifiedKinds
        : ['image', 'video', 'audio'];
    const targetPorts = specificKind
      ? referencePorts.filter((p) => portAcceptKinds(p).includes(specificKind))
      : referencePorts;
    const room = targetPorts.reduce((sum, p) => {
      const max = portMaxFiles(p);
      const cur = getPortUrls(values, p.key).length;
      return sum + Math.max(0, max - cur);
    }, 0);
    if (disabled || room <= 0) {
      if (room <= 0) {
        message.warning(t('playground_2026:io_refs_full', '参考媒体已达上限'));
      }
      return;
    }
    uploadTargetRef.current = { mode: 'unified-refs', kinds, max: room };
    clickHiddenFileInput(kinds, room > 1);
  };

  const openPicker = (port: SchemePort) => {
    if (disabled) return;
    const max = portMaxFiles(port);
    if (getPortUrls(values, port.key).length >= max) return;
    setPicker({ mode: 'port', portKey: port.key, kinds: portAcceptKinds(port), max });
  };

  const openUnifiedPicker = (specificKind?: SchemeAssetKind) => {
    if (disabled) return;
    const kinds: SchemeAssetKind[] = specificKind
      ? [specificKind]
      : unifiedKinds.length
        ? unifiedKinds
        : (['image', 'video', 'audio'] as SchemeAssetKind[]);
    const targetPorts = specificKind
      ? referencePorts.filter((p) => portAcceptKinds(p).includes(specificKind))
      : referencePorts;
    const room = targetPorts.reduce((sum, p) => {
      const max = portMaxFiles(p);
      const cur = getPortUrls(values, p.key).length;
      return sum + Math.max(0, max - cur);
    }, 0);
    if (room <= 0) {
      message.warning(t('playground_2026:io_refs_full', '参考媒体已达上限'));
      return;
    }
    setPicker({
      mode: 'unified-refs',
      kinds,
      max: room,
    });
  };

  const onConfirmPicks = (picks: FlowAssetPickResult[]) => {
    if (!picker) return;
    if (picker.mode === 'port') {
      const urls = picks.map((p) => p.url).filter(Boolean);
      const prev = getPortUrls(values, picker.portKey);
      const nextUrls = Array.from(new Set([...prev, ...urls])).slice(0, picker.max);
      const skipped = Math.max(0, prev.length + urls.length - nextUrls.length);
      setPortUrls(picker.portKey, nextUrls);
      if (skipped > 0) {
        message.warning(
          t('playground_2026:io_port_limit', '已达上限，未加入 {{n}} 个', { n: skipped }),
        );
      }
      setPicker(null);
      return;
    }

    applyUnifiedPicks(picks);
    setPicker(null);
  };

  const constrainKind: SchemeAssetKind | null = (() => {
    if (!picker) return null;
    if (picker.kinds.length === 1) return picker.kinds[0];
    return null;
  })();

  const renderDropzone = (port: SchemePort, compact?: boolean) => {
    const max = portMaxFiles(port);
    const urls = getPortUrls(values, port.key);
    const kinds = portAcceptKinds(port);
    const primaryKind = kinds[0] || 'image';
    const optional = !port.required;
    const isSingle = framePorts.length <= 1;
    const title = isFramePort(port)
      ? frameDisplayLabel(port, t, isSingle)
      : isSingle && primaryKind === 'image'
        ? t('playground_2026:io_select_image_asset', '选择图片素材')
        : port.label || port.key;

    if (urls.length > 0) {
      const url = urls[0];
      const isVideo =
        primaryKind === 'video' ||
        /\.(mp4|webm|mov)(\?|$)/i.test(url) ||
        url.includes('/video');
      const isAudio = primaryKind === 'audio' || /\.(mp3|wav|m4a|aac)(\?|$)/i.test(url);
      return (
        <div key={port.key} className={`pg-sio-frame-filled${compact ? ' is-compact' : ''}`}>
          {optional && (
            <span className="pg-sio-badge-optional">
              {t('playground_2026:io_optional', '可选')}
            </span>
          )}
          <button
            type="button"
            className="pg-sio-frame-cover"
            disabled={isAudio}
            onClick={() => {
              if (!isAudio) setPreviewUrl(url);
            }}
          >
            {isVideo ? (
              <video
                src={url}
                muted
                playsInline
                preload="metadata"
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback nopictureinpicture"
              />
            ) : isAudio ? (
              <span className="pg-sio-thumb-audio">♪</span>
            ) : (
              <img src={url} alt="" draggable={false} />
            )}
          </button>
          <button
            type="button"
            className="pg-sio-thumb-remove is-on-cover"
            disabled={disabled}
            onClick={() => removePortUrl(port.key, url)}
          >
            <DeleteOutlined />
          </button>
          {urls.length < max && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'local',
                    icon: <Upload size={14} />,
                    label: t('playground_2026:io_upload_local', '上传本地文件'),
                    onClick: () => openLocalUpload(port),
                  },
                  {
                    key: 'library',
                    icon: <FolderOpen size={14} />,
                    label: t('playground_2026:io_select_from_library', '从素材库选择'),
                    onClick: () => openPicker(port),
                  },
                ],
              }}
              trigger={['click']}
              placement="bottomLeft"
            >
              <button
                type="button"
                className="pg-sio-frame-add-more"
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('playground_2026:io_upload_media', '添加媒体资源')}
              >
                +
              </button>
            </Dropdown>
          )}
        </div>
      );
    }

    return (
      <div
        key={port.key}
        className={`pg-sio-frame-zone${compact ? ' is-compact' : ''}${disabled ? ' is-disabled' : ''}${optional ? ' is-muted' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => openLocalUpload(port)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLocalUpload(port);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled || !e.dataTransfer.files?.length) return;
          applyLocalFiles(
            { portKey: port.key, kinds, max },
            Array.from(e.dataTransfer.files),
          );
        }}
      >
        {optional && (
          <span className="pg-sio-badge-optional">
            {t('playground_2026:io_optional', '可选')}
          </span>
        )}
        <span className="pg-sio-frame-ico">
          {isFramePort(port) ? <FrameUploadGlyph /> : <UploadGlyph />}
        </span>
        <span className="pg-sio-frame-title">{title}</span>
        <span className="pg-sio-frame-or">
          {t('playground_2026:io_or', '或')}{' '}
          <button
            type="button"
            className="pg-sio-frame-select-btn"
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openPicker(port);
            }}
          >
            {t('playground_2026:io_select', '素材库')}
          </button>
        </span>
      </div>
    );
  };

  const renderRefsStrip = () => {
    const kindHint = (() => {
      const hasImg = unifiedKinds.includes('image');
      const hasVid = unifiedKinds.includes('video');
      const hasAud = unifiedKinds.includes('audio');
      if (hasImg && hasVid && hasAud) {
        return t('playground_2026:io_upload_media_hint', '图片、视频或音频');
      }
      if (hasImg && hasVid) return t('playground_2026:io_upload_iv_hint', '图片或视频');
      if (hasImg) return t('playground_2026:io_upload_image_hint', '图片');
      if (hasVid) return t('playground_2026:io_upload_video_hint', '视频');
      return t('playground_2026:io_upload_media_hint', '图片、视频或音频');
    })();

    if (unifiedItems.length === 0) {
      return (
        <div
          className={`pg-sio-frame-zone is-unified${disabled ? ' is-disabled' : ''}`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => openUnifiedLocalUpload()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openUnifiedLocalUpload();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabled || !e.dataTransfer.files?.length) return;
            applyUnifiedLocalFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {unifiedOptional && (
            <span className="pg-sio-badge-optional">
              {t('playground_2026:io_optional', '可选')}
            </span>
          )}
          <MediaKindGlyphs kinds={unifiedKinds} />
          <span className="pg-sio-frame-title">
            {t('playground_2026:io_upload_media', '上传素材')}
          </span>
          <span className="pg-sio-frame-hint">{kindHint}</span>
          <span className="pg-sio-frame-or">
            {t('playground_2026:io_or', '或')}{' '}
            <button
              type="button"
              className="pg-sio-frame-select-btn"
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openUnifiedPicker();
              }}
            >
              {t('playground_2026:io_select', '素材库')}
            </button>
          </span>
        </div>
      );
    }

    const showCategoryTabs = unifiedKinds.length > 1;

    const renderThumbItem = (
      it: { portKey: string; url: string; idx: number; kind: SchemeAssetKind },
      order: number,
    ) => {
      const isVideo = it.kind === 'video';
      const isAudio = it.kind === 'audio';
      return (
        <div key={`${it.portKey}-${it.idx}`} className="pg-sio-thumb is-square">
          <button
            type="button"
            className="pg-sio-thumb-main"
            disabled={isAudio}
            onClick={() => {
              if (!isAudio) setPreviewUrl(it.url);
            }}
            title={
              isVideo
                ? t('playground_2026:preview_video', '预览视频')
                : isAudio
                  ? t('playground_2026:audio_asset', '音频素材')
                  : t('playground_2026:preview_image', '预览图片')
            }
          >
            {isVideo ? (
              <div className="pg-sio-thumb-video-wrap">
                <video
                  src={it.url}
                  muted
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  controlsList="nodownload nofullscreen noremoteplayback nopictureinpicture"
                />
                <span className="pg-sio-thumb-video-badge">▶</span>
              </div>
            ) : isAudio ? (
              <div className="pg-sio-thumb-audio">
                <span>♪</span>
              </div>
            ) : (
              <img src={it.url} alt="" draggable={false} />
            )}
          </button>
          <span className="pg-sio-thumb-idx">{order + 1}</span>
          <button
            type="button"
            className="pg-sio-thumb-remove"
            disabled={disabled}
            onClick={() => removePortUrl(it.portKey, it.url)}
            title={t('common.delete', '删除')}
          >
            <DeleteOutlined />
          </button>
        </div>
      );
    };

    return (
      <div className="pg-sio-refs-container">
        <div
          className="pg-sio-refs-strip"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabled || !e.dataTransfer.files?.length) return;
            applyUnifiedLocalFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {unifiedRoom > 0 && (
            <div className="pg-sio-thumb-add-dual">
              <button
                type="button"
                className="pg-sio-thumb-add-btn"
                disabled={disabled}
                onClick={() => openUnifiedLocalUpload()}
                title={t('playground_2026:io_upload_local', '上传本地文件')}
              >
                <Upload size={11} />
                <span>{t('playground_2026:io_local_short', '本地')}</span>
              </button>
              <button
                type="button"
                className="pg-sio-thumb-add-btn"
                disabled={disabled}
                onClick={() => openUnifiedPicker()}
                title={t('playground_2026:io_select_from_library', '从素材库选择')}
              >
                <FolderOpen size={11} />
                <span>{t('playground_2026:io_library_short', '素材库')}</span>
              </button>
            </div>
          )}

          {activeTypeGroups.length > 0 &&
            activeTypeGroups.map((group, groupIdx) => (
              <React.Fragment key={group.kind}>
                {groupIdx > 0 && <div className="pg-sio-ref-type-divider" aria-hidden />}
                {group.items.map((it, order) => renderThumbItem(it, order))}
              </React.Fragment>
            ))}
        </div>
      </div>
    );
  };

  const framesSideBySide =
    showFramesPanel &&
    framePorts.length === 2 &&
    framePorts.every((p) => portMaxFiles(p) === 1 && portAcceptKinds(p).includes('image'));

  return (
    <div className={`pg-sio-composer${className ? ` ${className}` : ''}`}>
      {mediaPorts.length > 0 && (
        <div className="pg-sio-media">
          {showTabBar && (
            <div className={`pg-sio-tabs${hasFrames && hasRefs ? '' : ' is-single'}`} role="tablist">
              {hasRefs && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'references'}
                  className={`pg-sio-tab${activeTab === 'references' ? ' is-active' : ''}`}
                  onClick={() => setMediaTab('references')}
                >
                  <span className="pg-sio-tab-ico" aria-hidden>@</span>
                  <span>{t('playground_2026:io_tab_references', '参考素材')}</span>
                </button>
              )}
              {hasFrames && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'frames'}
                  className={`pg-sio-tab${activeTab === 'frames' ? ' is-active' : ''}`}
                  onClick={() => setMediaTab('frames')}
                >
                  <span className="pg-sio-tab-ico" aria-hidden>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" />
                      <path d="M2 11.5l3.2-3 2.3 2.2 2.6-3.2L14 11.5" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                  <span>{t('playground_2026:io_tab_frames', '首尾帧')}</span>
                </button>
              )}
            </div>
          )}

          {showRefsPanel && <div className="pg-sio-media-body is-stack">{renderRefsStrip()}</div>}

          {showFramesPanel && (
            <div
              className={`pg-sio-media-body${framesSideBySide ? ' is-pair' : ' is-stack'}`}
            >
              {framePorts.map((port) => renderDropzone(port, framesSideBySide))}
            </div>
          )}
        </div>
      )}

      <div className="pg-sio-prompt-wrap">
        <div className="pg-sio-prompt-card">
          <div className="pg-sio-prompt-header">
            <span className="pg-sio-prompt-head-title">{t('playground_2026:prompt', '提示词')}</span>
          </div>
          <MentionPromptField
            className="pg-sio-prompt"
            value={promptValue}
            onChange={(v) => setText(promptKey, v)}
            assets={mentionAssets}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSubmit?.();
              }
              onKeyDown?.(e);
            }}
            placeholder={
              promptPlaceholder ||
              t(
                'playground_2026:video_gen_prompt_placeholder_imagine',
                '描述你想象中的视频',
              )
            }
            autoHeight
            minHeight={112}
            maxHeight={280}
            disabled={disabled}
            isLight={false}
          />
          {promptFooter && (
            <div className="pg-sio-prompt-footer">
              {promptFooter}
            </div>
          )}
        </div>
      </div>

      {afterPrompt}

      {otherTextPorts.map((port) => (
        <div key={port.key} className="pg-sio-prompt-wrap">
          <div className="pg-sio-prompt-label">{port.label || port.key}</div>
          <div className="pg-sio-prompt-card is-secondary">
            <textarea
              className="pg-sio-prompt pg-sio-prompt-plain"
              value={typeof values[port.key] === 'string' ? (values[port.key] as string) : ''}
              onChange={(e) => setText(port.key, e.target.value)}
              disabled={disabled}
              rows={3}
              placeholder={port.label || port.key}
            />
          </div>
        </div>
      ))}

      {previewUrl &&
        createPortal(
          <div className="pg-sio-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewUrl(null)}>
            <button type="button" className="pg-sio-lightbox-close" onClick={() => setPreviewUrl(null)}>
              ×
            </button>
            {/\.(mp4|webm|mov)(\?|$)/i.test(previewUrl) || previewUrl.includes('/video') ? (
              <video
                src={previewUrl}
                controls
                autoPlay
                disablePictureInPicture
                controlsList="nodownload nopictureinpicture"
                className="pg-sio-lightbox-media"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={previewUrl}
                alt=""
                className="pg-sio-lightbox-media"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>,
          document.body,
        )}

      <FlowAssetLibraryModal
        open={!!picker}
        onClose={() => setPicker(null)}
        constrainKind={constrainKind}
        maxSelect={picker?.max}
        onConfirm={onConfirmPicks}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="pg-sio-frame-file"
        title=""
        tabIndex={-1}
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          e.target.value = '';
          const target = uploadTargetRef.current;
          uploadTargetRef.current = null;
          if (!list.length || !target) return;
          if (target.mode === 'port') applyLocalFiles(target, list);
          else applyUnifiedLocalFiles(list);
        }}
      />
    </div>
  );
};

export default React.memo(SchemeIoComposer);
