/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThemeStore } from '../../../../store/theme';
import {
  type ModelFeature,
  DEFAULT_VIDEO_FEATURE,
  videoFeatures,
} from '../config/modelFeatures';
import './VideoToolsWheel.css';

export type VideoTool = {
  id: string;
  label: string;
  desc: string;
  videoUrl?: string;
  posterUrl?: string;
  glowColor: string;
};

type VideoToolExtra = Omit<VideoTool, 'id' | 'label'>;

/** 图标/说明装饰；列表 key 与文案以后台功能特性为准 */
const VIDEO_TOOL_EXTRAS: Record<string, VideoToolExtra> = {
  'text-to-video': {
    desc: '根据文本提示词生成高品质 AI 视频',
    videoUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/t2v1.mp4',
    posterUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/t2v.webp',
    glowColor: '#845ba1',
  },
  'image-to-video': {
    desc: '上传首帧图片，让静态画面生成动态视频',
    videoUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/i2v1.mp4',
    posterUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/i2v.webp',
    glowColor: '#e85d04',
  },
  'starting-frame': {
    desc: '上传首尾帧图片，赋予 AI 动态运镜效果',
    videoUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/i2v1.mp4',
    posterUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/i2v.webp',
    glowColor: '#ff006e',
  },
  'reference-i2v': {
    desc: '基于参考图像、视频等多模态素材保持主体一致性生成视频',
    videoUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/ref_i2v1.mp4',
    posterUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/ref_i2v.webp',
    glowColor: '#cfca9b',
  },
  'edit-video': {
    desc: '输入文本描述修改并重绘现有视频内容',
    glowColor: '#dbc5af',
  },
  extend: {
    desc: '无缝扩展现有视频时长与镜头内容',
    videoUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/extend1.mp4',
    posterUrl: 'https://cdn.web.imagine.art/imagine-one/home/video_modes/extend.webp',
    glowColor: '#08a7f3',
  },
};

const FALLBACK_EXTRA: VideoToolExtra = { desc: '', glowColor: '#845ba1' };

export function buildVideoTools(features?: ModelFeature[]): VideoTool[] {
  const list = features && features.length ? features.filter((f) => f.kind === 'video') : videoFeatures();
  return list.map((f) => {
    const extra = VIDEO_TOOL_EXTRAS[f.key] || FALLBACK_EXTRA;
    return { id: f.key, label: f.label, ...extra };
  });
}

const VIDEO_TOOLS: VideoTool[] = buildVideoTools();

/** 官方原始常数规范 (Imagine.art Exact Constants) */
const TOOLS_PANE_DRAG_PIXELS_PER_ITEM = 28;
const TOOLS_PANE_WHEEL_DEGREES_PER_SLOT = 35;
const TOOLS_PANE_SCROLL_UNLOCK_DELAY_MS = 200;
const TOOLS_PANE_MAX_RENDERED_SLOT = 2.5;

type SlotKeyframe = {
  centerY: number;
  left: number;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  contentAlpha: number;
  blur: number;
};

const CENTER_KEYFRAME: SlotKeyframe = {
  centerY: 50,
  left: 65,
  fontSize: 16,
  lineHeight: 20,
  fontWeight: 500,
  contentAlpha: 1,
  blur: 0,
};

const SLOT_KEYFRAMES: Record<number, SlotKeyframe> = {
  [-2]: { centerY: 0, left: 38, fontSize: 12, lineHeight: 16, fontWeight: 400, contentAlpha: 0.3, blur: 1.5 },
  [-1]: { centerY: 22, left: 57, fontSize: 12, lineHeight: 16, fontWeight: 400, contentAlpha: 0.3, blur: 0 },
  0: CENTER_KEYFRAME,
  1: { centerY: 78, left: 57, fontSize: 12, lineHeight: 16, fontWeight: 400, contentAlpha: 0.3, blur: 0 },
  2: { centerY: 106, left: 38, fontSize: 12, lineHeight: 16, fontWeight: 400, contentAlpha: 0.3, blur: 1.5 },
};

/** 官方插槽连续平滑插值算法 */
function interpolateSlot(offset: number): SlotKeyframe {
  const clamped = Math.max(-2, Math.min(2, offset));
  const floor = Math.floor(clamped);
  const ceil = Math.ceil(clamped);
  if (floor === ceil) {
    return SLOT_KEYFRAMES[floor] || CENTER_KEYFRAME;
  }
  const factor = clamped - floor;
  const k1 = SLOT_KEYFRAMES[floor] || CENTER_KEYFRAME;
  const k2 = SLOT_KEYFRAMES[ceil] || CENTER_KEYFRAME;
  return {
    centerY: k1.centerY + (k2.centerY - k1.centerY) * factor,
    left: k1.left + (k2.left - k1.left) * factor,
    fontSize: k1.fontSize + (k2.fontSize - k1.fontSize) * factor,
    lineHeight: k1.lineHeight + (k2.lineHeight - k1.lineHeight) * factor,
    fontWeight: Math.round(k1.fontWeight + (k2.fontWeight - k1.fontWeight) * factor),
    contentAlpha: k1.contentAlpha + (k2.contentAlpha - k1.contentAlpha) * factor,
    blur: Math.max(0, k1.blur + (k2.blur - k1.blur) * factor),
  };
}

/** 小圆点相对槽位序列 */
const DOT_SLOTS = [-3, -2, -1, 0, 1, 2, 3];

/* —— 专属矢量图标集 —— */

const PhotoImageIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
    <path
      d="M21 15L15.5 9.5L5 20"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ExtendLoopIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 8H18M18 8L14 4M18 8L14 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 16H6M6 16L10 12M6 16L10 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ReferenceI2vIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <rect x="3" y="3" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
    <path d="M18 13L13.5 8.5L5 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 19L19 15M17 17L21 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const EditVideoIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M12 20H21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M16.5 3.5C17.33 2.67 18.67 2.67 19.5 3.5C20.33 4.33 20.33 5.67 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SeeAllIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

export const VideoFeatureIcon: React.FC<{ id: string; size?: number; className?: string }> = ({
  id,
  size = 18,
  className,
}) => {
  switch (id) {
    case 'text-to-video':
      return <PhotoImageIcon size={size} className={className} />;
    case 'image-to-video':
      return <PhotoImageIcon size={size} className={className} />;
    case 'starting-frame':
      return <PhotoImageIcon size={size} className={className} />;
    case 'extend':
      return <ExtendLoopIcon size={size} className={className} />;
    case 'reference-i2v':
    case 'reference-video':
      return <ReferenceI2vIcon size={size} className={className} />;
    case 'edit-video':
      return <EditVideoIcon size={size} className={className} />;
    default:
      return <PhotoImageIcon size={size} className={className} />;
  }
};

const InfoIcon: React.FC = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" className="hf-vg-tw-info" aria-hidden>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.923 16.154h4.154m-2.077 0v-4.846h-1.385M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m-.23-12.807a.577.577 0 1 1 0-1.154.577.577 0 0 1 0 1.154"
    />
  </svg>
);

const ChevronDownBold: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
    <path
      d="M5 7.5L10 12.5L15 7.5"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const MENU_WIDTH = 256;
const MENU_GAP = 4;

/** 官方 1:1 浮动下拉列表 (Dropdown Menu) */
const DropdownMenu: React.FC<{
  tools: VideoTool[];
  activeId: string;
  onSelect: (id: string) => void;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  style?: React.CSSProperties;
}> = ({ tools, activeId, onSelect, menuRef, className, style }) => {
  return (
    <div
      className={`hf-vg-dropdown-menu${className ? ` ${className}` : ''}`}
      role="menu"
      ref={menuRef}
      style={style}
    >
      <div className="hf-vg-dropdown-kicker">AI 视频生成</div>
      <div className="hf-vg-dropdown-list">
        {tools.map((tool) => {
          const isSelected = tool.id === activeId;
          return (
            <button
              key={tool.id}
              type="button"
              role="menuitem"
              className={`hf-vg-dropdown-item${isSelected ? ' is-active' : ''}`}
              onClick={() => onSelect(tool.id)}
            >
              <span className="hf-vg-dropdown-ico">
                <VideoFeatureIcon id={tool.id} size={18} />
              </span>
              <span className="hf-vg-dropdown-label">{tool.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const posMod = (n: number, m: number) => ((n % m) + m) % m;
const shortestDiff = (from: number, to: number, total: number) => {
  const d = ((to - from) % total + total) % total;
  return d > total / 2 ? d - total : d;
};

type VideoToolsWheelProps = {
  variant?: 'wheel' | 'sheet';
  value?: string;
  onChange?: (toolId: string) => void;
  isTransitionActive?: boolean;
  tools?: VideoTool[];
};

const VideoToolsWheel: React.FC<VideoToolsWheelProps> = ({
  variant = 'wheel',
  value,
  onChange,
  isTransitionActive: externalIsTransitionActive,
  tools: toolsProp,
}) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const tools = toolsProp && toolsProp.length > 0 ? toolsProp : VIDEO_TOOLS;
  const uid = useId().replace(/:/g, '');
  const [internalActiveId, setInternalActiveId] = useState(DEFAULT_VIDEO_FEATURE);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [infoTooltipOpen, setInfoTooltipOpen] = useState(false);
  const [infoTooltipPos, setInfoTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const paneRootRef = useRef<HTMLDivElement>(null);
  const crumbRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPos = useCallback(() => {
    const el = crumbRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, r.right - width),
      window.innerWidth - width - 8,
    );
    setMenuPos({
      top: Math.round(r.bottom + MENU_GAP),
      left: Math.round(left),
      width: Math.round(width),
    });
  }, []);

  useLayoutEffect(() => {
    if (variant !== 'sheet' || !dropdownOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [variant, dropdownOpen, updateMenuPos]);

  // 官方 1:1 模式切换 1s (1000ms) 加载过渡与 Hold 锁定机制
  const [internalTransitionActive, setInternalTransitionActive] = useState(false);
  const isTransitionActive = externalIsTransitionActive !== undefined ? externalIsTransitionActive : internalTransitionActive;
  const isTransitioningRef = useRef(false);
  isTransitioningRef.current = isTransitionActive;
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 处于 1s 过渡状态时待确认的目标虚拟坐标 (Hold 机制)
  const [pendingVirtualPos, setPendingVirtualPos] = useState<number | null>(null);
  const pendingVirtualPosRef = useRef<number | null>(null);
  pendingVirtualPosRef.current = pendingVirtualPos;
  const lastHandledKeyRef = useRef<string | null>(null);

  const startTransition = useCallback(() => {
    setInternalTransitionActive(true);
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      setInternalTransitionActive(false);
      transitionTimerRef.current = null;
    }, 1000);
  }, []);

  // 官方 1:1 核心：当 1 秒加载过渡彻底结束时，指针与滚动列表才复位入中！
  useEffect(() => {
    if (isTransitionActive) return;
    if (pendingVirtualPosRef.current !== null) {
      const targetPos = pendingVirtualPosRef.current;
      pendingVirtualPosRef.current = null;
      setPendingVirtualPos(null);
      virtualPosRef.current = targetPos;
      setVirtualPos(targetPos);
      setDragSlotOffset(0);
    }
  }, [isTransitionActive]);

  // 官方真实拖拽滑动状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragSlotOffset, setDragSlotOffset] = useState(0);
  const isPointerDownRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartOffsetRef = useRef(0);

  const activeId = value || internalActiveId;
  const initialActiveIndex = Math.max(
    0,
    tools.findIndex((t) => t.id === activeId),
  );

  // 无限循环虚拟坐标索引 (Virtual Position)
  const [virtualPos, setVirtualPos] = useState(() => initialActiveIndex);
  const virtualPosRef = useRef(virtualPos);
  virtualPosRef.current = virtualPos;

  const activeIndex = posMod(virtualPos, tools.length);
  const active = tools[activeIndex] || tools[0];

  // 外部 value 变化时同步虚拟坐标 (非过渡加载期间，过滤已由组件内部处理的 key，防止二次跳位)
  useEffect(() => {
    if (isTransitionActive || pendingVirtualPosRef.current !== null || !value || value === lastHandledKeyRef.current) return;
    lastHandledKeyRef.current = value;
    const targetRealIdx = tools.findIndex((t) => t.id === value);
    if (targetRealIdx === -1) return;
    const currentRealIdx = posMod(virtualPosRef.current, tools.length);
    if (currentRealIdx === targetRealIdx) return;
    const diff = shortestDiff(currentRealIdx, targetRealIdx, tools.length);
    const nextPos = virtualPosRef.current + diff;
    virtualPosRef.current = nextPos;
    setVirtualPos(nextPos);
  }, [value, isTransitionActive, tools]);

  const gradId = `hfVgTwStar-${uid}`;
  const clipId = `hfVgTwClip-${uid}`;

  useEffect(() => {
    if (!dropdownOpen && !infoTooltipOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (paneRootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setDropdownOpen(false);
      setInfoTooltipOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setInfoTooltipOpen(false);
      }
    };
    const onReposition = () => {
      if (variant === 'sheet' && dropdownOpen) updateMenuPos();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      if (transitionTimerRef.current !== null) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, [dropdownOpen, infoTooltipOpen, variant, updateMenuPos]);

  const selectToolByPos = useCallback((targetPos: number) => {
    const diff = targetPos - virtualPosRef.current;
    const targetRealIdx = posMod(targetPos, tools.length);
    const targetTool = tools[targetRealIdx];
    if (!targetTool) return;

    lastHandledKeyRef.current = targetTool.id;

    if (diff !== 0) {
      const clamped = Math.max(-1, Math.min(1, diff));
      // 官方 1:1：在 1 秒加载期间指针固定指向目标选项 (-35° 或 +35°)，列表保持原位
      setDragSlotOffset(clamped);
      setPendingVirtualPos(targetPos);
      pendingVirtualPosRef.current = targetPos;
      startTransition();
    } else {
      setDragSlotOffset(0);
      setPendingVirtualPos(null);
      pendingVirtualPosRef.current = null;
    }

    if (onChange) {
      onChange(targetTool.id);
    } else {
      setInternalActiveId(targetTool.id);
    }
    setDropdownOpen(false);
    setInfoTooltipOpen(false);
  }, [onChange, startTransition, tools]);

  // 从下拉列表中选择分类：无转盘和滚动动画，等待 1 秒加载效果完成后直接转换过去
  const selectToolFromDropdown = useCallback((id: string) => {
    const targetRealIdx = tools.findIndex((t) => t.id === id);
    if (targetRealIdx === -1) return;
    const currentRealIdx = posMod(virtualPosRef.current, tools.length);
    const diff = shortestDiff(currentRealIdx, targetRealIdx, tools.length);
    const targetPos = virtualPosRef.current + diff;

    lastHandledKeyRef.current = id;
    setDropdownOpen(false);
    setInfoTooltipOpen(false);

    if (diff !== 0) {
      // 下拉菜单切换：指针保持水平 (0°)，不转动转盘，直接等待 1s 加载完成后直接转换
      setDragSlotOffset(0);
      setPendingVirtualPos(targetPos);
      pendingVirtualPosRef.current = targetPos;
      startTransition();
    } else {
      setDragSlotOffset(0);
      setPendingVirtualPos(null);
      pendingVirtualPosRef.current = null;
    }

    if (onChange) {
      onChange(id);
    } else {
      setInternalActiveId(id);
    }
  }, [onChange, startTransition, tools]);

  const selectTool = useCallback((id: string) => {
    const targetRealIdx = tools.findIndex((t) => t.id === id);
    if (targetRealIdx === -1) return;
    const currentRealIdx = posMod(virtualPosRef.current, tools.length);
    const diff = shortestDiff(currentRealIdx, targetRealIdx, tools.length);
    selectToolByPos(virtualPosRef.current + diff);
  }, [selectToolByPos, tools]);

  // —— 整个面板上滑/下滑/拖拽滑动 ——
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isTransitioningRef.current) return;
    if ((e.target as HTMLElement).closest('.hf-vg-tw-expand, .hf-vg-dropdown-menu, .hf-vg-tw-info-wrap')) {
      return;
    }
    isPointerDownRef.current = true;
    hasDraggedRef.current = false;
    dragStartYRef.current = e.clientY;
    dragStartOffsetRef.current = dragSlotOffset;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current) return;
    const deltaY = e.clientY - dragStartYRef.current;
    if (Math.abs(deltaY) > 4) {
      hasDraggedRef.current = true;
      setIsDragging(true);
      const deltaSlots = deltaY / TOOLS_PANE_DRAG_PIXELS_PER_ITEM;
      const newOffset = Math.max(-1.5, Math.min(1.5, dragStartOffsetRef.current + deltaSlots));
      setDragSlotOffset(newOffset);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // 仅在真实发生拖拽移动 (> 4px) 时由 pointerUp 提交位移；点击则交由文字标签自身的 onClick 处理
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      const shift = Math.round(dragSlotOffset);
      selectToolByPos(virtualPosRef.current + shift);
    }
  };

  const twPanelRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  const selectToolByPosRef = useRef(selectToolByPos);
  selectToolByPosRef.current = selectToolByPos;

  const WHEEL_STEP_THRESHOLD = 95; // 舒适灵敏的物理滚动行程
  const wheelAccumRef = useRef(0);
  const lastSwitchTimestampRef = useRef(0);
  const wheelSpringTimerRef = useRef<NodeJS.Timeout | null>(null);

  // —— 滚动与转盘实时联动 (基于绝对时间戳冷却，0卡死，随时随地即滚即应) ——
  useEffect(() => {
    const el = twPanelRef.current;
    if (!el) return;

    const onNativeWheel = (e: WheelEvent) => {
      // 拦截默认页面/侧边栏滚动，阻断事件向上冒泡
      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY === 0 || isDraggingRef.current || isTransitioningRef.current) return;

      const now = Date.now();
      // 官方 1:1 1s (1000ms) 模式切换保护期：过滤残余惯性，锁定单次手势，严防多项连跳
      if (now - lastSwitchTimestampRef.current < 1000) {
        wheelAccumRef.current = 0;
        return;
      }

      // 1. 累加滚轮位移，实时驱动转盘平滑慢慢转动与列表跟手移动
      wheelAccumRef.current += e.deltaY;
      const progress = Math.max(-1.1, Math.min(1.1, wheelAccumRef.current / WHEEL_STEP_THRESHOLD));
      setDragSlotOffset(progress);

      if (wheelSpringTimerRef.current !== null) {
        clearTimeout(wheelSpringTimerRef.current);
      }

      // 2. 达到充足的物理滚动距离 (±95px) 时触发无限循环切换与 1s 过渡锁定
      if (Math.abs(wheelAccumRef.current) >= WHEEL_STEP_THRESHOLD) {
        const shift = wheelAccumRef.current > 0 ? 1 : -1;
        const targetPos = virtualPosRef.current + shift;

        // 记录切换时间戳，重置累加值，激活 1000ms 模式切换过渡
        lastSwitchTimestampRef.current = now;
        wheelAccumRef.current = 0;

        selectToolByPosRef.current(targetPos);
        return;
      }

      // 3. 未达到阈值且停止滚动时，平滑回弹复位
      wheelSpringTimerRef.current = setTimeout(() => {
        wheelAccumRef.current = 0;
        setDragSlotOffset(0);
        wheelSpringTimerRef.current = null;
      }, 120);
    };

    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onNativeWheel);
      if (wheelSpringTimerRef.current !== null) {
        clearTimeout(wheelSpringTimerRef.current);
        wheelSpringTimerRef.current = null;
      }
    };
  }, []);

  // 当前齿轮旋转角度 (跟随鼠标拖拽同向旋转)
  const rotationDegrees = Math.max(-1, Math.min(1, dragSlotOffset)) * TOOLS_PANE_WHEEL_DEGREES_PER_SLOT;

  if (variant === 'sheet') {
    const sheetActive = tools.find((t) => t.id === activeId) || active;
    const sheetMenu =
      dropdownOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <DropdownMenu
              tools={tools}
              activeId={activeId}
              onSelect={selectToolFromDropdown}
              menuRef={menuRef}
              className="is-fixed"
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            />,
            document.body,
          )
        : null;

    return (
      <div className="hf-vg-tw-sheet" ref={paneRootRef}>
        <span className="hf-vg-tw-crumb hf-vg-tw-crumb-static">
          <span>AI 视频</span>
        </span>
        <span className="hf-vg-tw-slash">/</span>
        <button
          ref={crumbRef}
          type="button"
          className="hf-vg-tw-crumb"
          aria-expanded={dropdownOpen}
          aria-haspopup="menu"
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <VideoFeatureIcon id={sheetActive.id} size={14} />
          <span className="hf-vg-tw-crumb-label">{sheetActive.label}</span>
          <ChevronDownBold className="hf-vg-tw-crumb-chev" />
        </button>
        {sheetMenu}
      </div>
    );
  }

  // 渲染无限循环插槽列表 (Virtual Position Modulo)
  const centerF = virtualPos + dragSlotOffset;
  const minRenderPos = Math.ceil(centerF - TOOLS_PANE_MAX_RENDERED_SLOT);
  const maxRenderPos = Math.floor(centerF + TOOLS_PANE_MAX_RENDERED_SLOT);
  const renderedPositions: number[] = [];
  for (let pos = minRenderPos; pos <= maxRenderPos; pos++) {
    renderedPositions.push(pos);
  }

  return (
    <div className="hf-vg-tw-wrap" ref={paneRootRef}>
      {/* 整个面板支持直接抓取、滑动与独立原生非被动滚轮 */}
      <div
        ref={twPanelRef}
        className={`hf-vg-tw${isDragging ? ' is-dragging' : ''}${isTransitionActive ? ' is-transitioning' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* 官方 1:1 0.5s 模式切换发光进度指示条 */}
        {isTransitionActive && <div className="hf-vg-tw-shimmer" />}
        {/* 文字列表层 (无限循环插槽) */}
        <div className="hf-vg-tw-labels-stage">
          {renderedPositions.map((pos) => {
            const realIdx = posMod(pos, tools.length);
            const tool = tools[realIdx];
            const offset = pos - virtualPos;
            const dynamicOffset = pos - (virtualPos + dragSlotOffset);
            const slotPos = interpolateSlot(offset);
            const slotStyle = interpolateSlot(dynamicOffset);
            const isTargetOrCenter = Math.abs(dynamicOffset) < 0.01;

            return (
              <button
                key={`slot-${pos}`}
                type="button"
                aria-pressed={isTargetOrCenter}
                className={`hf-vg-tw-label${isTargetOrCenter ? ' is-selected' : ''}`}
                style={{
                  top: slotPos.centerY,
                  left: slotPos.left,
                  fontSize: slotStyle.fontSize,
                  lineHeight: `${slotStyle.lineHeight}px`,
                  fontWeight: slotStyle.fontWeight,
                  color: isTargetOrCenter
                    ? (isLight ? '#09090b' : '#ffffff')
                    : (isLight
                        ? `rgba(9, 9, 11, ${slotStyle.contentAlpha})`
                        : `rgba(255, 255, 255, ${slotStyle.contentAlpha})`),
                  filter: slotStyle.blur > 0 ? `blur(${slotStyle.blur}px)` : 'none',
                  transition: isDragging
                    ? 'none'
                    : 'top 220ms cubic-bezier(0.16, 1, 0.3, 1), left 220ms cubic-bezier(0.16, 1, 0.3, 1), font-size 220ms ease, color 220ms ease, filter 220ms ease',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isTransitioningRef.current) {
                    selectToolByPos(pos);
                  }
                }}
              >
                <span>{tool.label}</span>
                {isTargetOrCenter && tool.desc ? (
                  <div
                    className="hf-vg-tw-info-wrap"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setInfoTooltipPos({
                        top: rect.bottom + 8,
                        left: rect.left + rect.width / 2,
                      });
                      setInfoTooltipOpen(true);
                    }}
                    onMouseLeave={() => setInfoTooltipOpen(false)}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setInfoTooltipPos({
                        top: rect.bottom + 8,
                        left: rect.left + rect.width / 2,
                      });
                      setInfoTooltipOpen((v) => !v);
                    }}
                  >
                    <InfoIcon />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* 左侧轮盘组合 */}
        <div className="hf-vg-tw-wheel-container">
          <div className="hf-vg-tw-stage">
            {/* 紫色高光 Blob */}
            <div className="hf-vg-tw-blob hf-vg-tw-blob-a" />

            {/* 外圈波浪轮盘 */}
            <div
              className="hf-vg-tw-ring"
              style={{
                transform: `rotate(${rotationDegrees}deg)`,
                transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <svg viewBox="0 0 101.856 101.856" fill="none" preserveAspectRatio="none" className="hf-vg-tw-ring-svg">
                <path
                  d="M48.8048 0.739377C50.145 0.0870691 51.7107 0.0870692 53.0509 0.739377L56.9933 2.65832C57.9493 3.1236 59.0223 3.29368 60.0753 3.1466L64.4181 2.53918C65.8942 2.33303 67.3832 2.81722 68.4562 3.85168L71.6124 6.89465C72.3778 7.63259 73.3458 8.1261 74.3927 8.31164L78.7101 9.07629C80.1777 9.3363 81.4448 10.2569 82.1456 11.5724L84.2072 15.4415C84.7071 16.38 85.4757 17.1486 86.4142 17.6486L90.2833 19.7101C91.5988 20.4109 92.5194 21.678 92.7794 23.1456L93.5441 27.463C93.7296 28.5099 94.2231 29.4779 94.9611 30.2433L98.004 33.3995C99.0385 34.4725 99.5227 35.9615 99.3165 37.4376L98.7091 41.7804C98.562 42.8334 98.7321 43.9064 99.1974 44.8624L101.116 48.8048C101.769 50.145 101.769 51.7107 101.116 53.0509L99.1974 56.9933C98.7321 57.9493 98.562 59.0223 98.7091 60.0753L99.3165 64.4181C99.5227 65.8942 99.0385 67.3832 98.004 68.4562L94.9611 71.6124C94.2231 72.3778 93.7296 73.3458 93.5441 74.3927L92.7794 78.7101C92.5194 80.1777 91.5988 81.4448 90.2833 82.1456L86.4142 84.2072C85.4757 84.7071 84.7071 85.4757 84.2072 86.4142L82.1456 90.2833C81.4448 91.5988 80.1777 92.5194 78.7101 92.7794L74.3927 93.5441C73.3458 93.7296 72.3778 94.2231 71.6124 94.9611L68.4562 98.004C67.3832 99.0385 65.8942 99.5227 64.4181 99.3165L60.0753 98.7091C59.0223 98.562 57.9493 98.7321 56.9933 99.1974L53.0509 101.116C51.7107 101.769 50.145 101.769 48.8048 101.116L44.8624 99.1974C43.9064 98.7321 42.8334 98.562 41.7804 98.7091L37.4376 99.3165C35.9615 99.5227 34.4725 99.0385 33.3995 98.004L30.2433 94.9611C29.4779 94.2231 28.5099 93.7296 27.463 93.5441L23.1456 92.7794C21.678 92.5194 20.4109 91.5988 19.7101 90.2833L17.6486 86.4142C17.1486 85.4757 16.38 84.7071 15.4415 84.2072L11.5724 82.1456C10.2569 81.4448 9.3363 80.1777 9.07629 78.7101L8.31164 74.3927C8.1261 73.3458 7.63259 72.3778 6.89465 71.6124L3.85168 68.4562C2.81722 67.3832 2.33303 65.8942 2.53918 64.4181L3.1466 60.0753C3.29368 59.0223 3.12361 57.9493 2.65832 56.9933L0.739377 53.0509C0.0870691 51.7107 0.0870692 50.145 0.739377 48.8048L2.65832 44.8624C3.1236 43.9064 3.29368 42.8334 3.1466 41.7804L2.53918 37.4376C2.33303 35.9615 2.81722 34.4725 3.85168 33.3995L6.89465 30.2433C7.63259 29.4779 8.1261 28.5099 8.31164 27.463L9.07629 23.1456C9.3363 21.678 10.2569 20.4109 11.5724 19.7101L15.4415 17.6486C16.38 17.1486 17.1486 16.38 17.6486 15.4415L19.7101 11.5724C20.4109 10.2569 21.678 9.3363 23.1456 9.07629L27.463 8.31164C28.5099 8.1261 29.4779 7.63259 30.2433 6.89465L33.3995 3.85168C34.4725 2.81722 35.9615 2.33303 37.4376 2.53918L41.7804 3.1466C42.8334 3.29368 43.9064 3.12361 44.8624 2.65832L48.8048 0.739377Z"
                  opacity="0.5"
                  stroke="currentColor"
                  strokeOpacity="0.3"
                  strokeWidth="0.5"
                />
              </svg>
            </div>

            {/* 内层立体星形齿轮 */}
            <div
              className="hf-vg-tw-star"
              style={{
                transform: `rotate(${rotationDegrees}deg)`,
                transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="hf-vg-tw-star-inner">
                <svg viewBox="0 0 108.011 116.422" fill="none" preserveAspectRatio="none" className="hf-vg-tw-star-svg">
                  <path
                    d="M50.5916 9.40263C52.6755 8.08024 55.3357 8.08024 57.4196 9.40263L58.7388 10.2398C60.2242 11.1824 62.0332 11.4689 63.7372 11.0314L65.2506 10.6429C67.6412 10.0292 70.1711 10.8513 71.7444 12.7529L72.7404 13.9568C73.8618 15.3122 75.4938 16.1437 77.2495 16.2543L78.8089 16.3524C81.2721 16.5075 83.4242 18.0711 84.3328 20.3658L84.9081 21.8185C85.5557 23.4542 86.8508 24.7493 88.4865 25.397L89.9392 25.9722C92.2339 26.8809 93.7975 29.033 93.9526 31.4962L94.0508 33.0555C94.1613 34.8113 94.9928 36.4432 96.3483 37.5646L97.5521 38.5606C99.4538 40.1339 100.276 42.6639 99.6621 45.0544L99.2736 46.5678C98.8362 48.2718 99.1227 50.0808 100.065 51.5662L100.902 52.8854C102.225 54.9694 102.225 57.6295 100.902 59.7135L100.065 61.0327C99.1227 62.5181 98.8362 64.3271 99.2736 66.0311L99.6621 67.5445C100.276 69.935 99.4538 72.465 97.5521 74.0383L96.3483 75.0343C94.9928 76.1557 94.1613 77.7876 94.0508 79.5434L93.9526 81.1027C93.7975 83.5659 92.2339 85.7181 89.9392 86.6267L88.4865 87.2019C86.8508 87.8496 85.5557 89.1447 84.9081 90.7804L84.3328 92.2331C83.4242 94.5278 81.2721 96.0914 78.8089 96.2465L77.2495 96.3446C75.4938 96.4552 73.8618 97.2867 72.7404 98.6421L71.7444 99.846C70.1711 101.748 67.6412 102.57 65.2506 101.956L63.7372 101.567C62.0332 101.13 60.2242 101.417 58.7388 102.359L57.4196 103.196C55.3357 104.519 52.6755 104.519 50.5916 103.196L49.2723 102.359C47.7869 101.417 45.9779 101.13 44.274 101.567L42.7606 101.956C40.37 102.57 37.84 101.748 36.2668 99.846L35.2708 98.6422C34.1494 97.2867 32.5174 96.4552 30.7617 96.3446L29.2023 96.2465C26.7391 96.0914 24.587 94.5278 23.6783 92.2331L23.1031 90.7804C22.4554 89.1447 21.1603 87.8496 19.5247 87.2019L18.072 86.6267C15.7772 85.7181 14.2136 83.5659 14.0586 81.1027L13.9604 79.5434C13.8499 77.7876 13.0184 76.1557 11.6629 75.0343L10.459 74.0383C8.55741 72.465 7.73537 69.935 8.34907 67.5445L8.73758 66.0311C9.17502 64.3271 8.8885 62.5181 7.94591 61.0327L7.10877 59.7135C5.78638 57.6295 5.78638 54.9694 7.10877 52.8854L7.94591 51.5662C8.8885 50.0808 9.17502 48.2718 8.73758 46.5678L8.34907 45.0545C7.73537 42.6639 8.55741 40.1339 10.459 38.5606L11.6629 37.5646C13.0184 36.4432 13.8499 34.8113 13.9604 33.0555L14.0586 31.4962C14.2136 29.033 15.7772 26.8809 18.072 25.9722L19.5247 25.397C21.1603 24.7493 22.4554 23.4542 23.1031 21.8185L23.6783 20.3658C24.587 18.0711 26.7391 16.5075 29.2023 16.3524L30.7617 16.2543C32.5174 16.1437 34.1494 15.3122 35.2708 13.9568L36.2668 12.7529C37.84 10.8513 40.37 10.0292 42.7606 10.6429L44.2739 11.0314C45.9779 11.4689 47.7869 11.1824 49.2723 10.2398L50.5916 9.40263Z"
                    fill={`url(#${gradId})`}
                    fillOpacity="0.8"
                    shapeRendering="crispEdges"
                  />
                  <path
                    d="M50.5916 9.40263C52.6755 8.08024 55.3357 8.08024 57.4196 9.40263L58.7388 10.2398C60.2242 11.1824 62.0332 11.4689 63.7372 11.0314L65.2506 10.6429C67.6412 10.0292 70.1711 10.8513 71.7444 12.7529L72.7404 13.9568C73.8618 15.3122 75.4938 16.1437 77.2495 16.2543L78.8089 16.3524C81.2721 16.5075 83.4242 18.0711 84.3328 20.3658L84.9081 21.8185C85.5557 23.4542 86.8508 24.7493 88.4865 25.397L89.9392 25.9722C92.2339 26.8809 93.7975 29.033 93.9526 31.4962L94.0508 33.0555C94.1613 34.8113 94.9928 36.4432 96.3483 37.5646L97.5521 38.5606C99.4538 40.1339 100.276 42.6639 99.6621 45.0544L99.2736 46.5678C98.8362 48.2718 99.1227 50.0808 100.065 51.5662L100.902 52.8854C102.225 54.9694 102.225 57.6295 100.902 59.7135L100.065 61.0327C99.1227 62.5181 98.8362 64.3271 99.2736 66.0311L99.6621 67.5445C100.276 69.935 99.4538 72.465 97.5521 74.0383L96.3483 75.0343C94.9928 76.1557 94.1613 77.7876 94.0508 79.5434L93.9526 81.1027C93.7975 83.5659 92.2339 85.7181 89.9392 86.6267L88.4865 87.2019C86.8508 87.8496 85.5557 89.1447 84.9081 90.7804L84.3328 92.2331C83.4242 94.5278 81.2721 96.0914 78.8089 96.2465L77.2495 96.3446C75.4938 96.4552 73.8618 97.2867 72.7404 98.6421L71.7444 99.846C70.1711 101.748 67.6412 102.57 65.2506 101.956L63.7372 101.567C62.0332 101.13 60.2242 101.417 58.7388 102.359L57.4196 103.196C55.3357 104.519 52.6755 104.519 50.5916 103.196L49.2723 102.359C47.7869 101.417 45.9779 101.13 44.274 101.567L42.7606 101.956C40.37 102.57 37.84 101.748 36.2668 99.846L35.2708 98.6422C34.1494 97.2867 32.5174 96.4552 30.7617 96.3446L29.2023 96.2465C26.7391 96.0914 24.587 94.5278 23.6783 92.2331L23.1031 90.7804C22.4554 89.1447 21.1603 87.8496 19.5247 87.2019L18.072 86.6267C15.7772 85.7181 14.2136 83.5659 14.0586 81.1027L13.9604 79.5434C13.8499 77.7876 13.0184 76.1557 11.6629 75.0343L10.459 74.0383C8.55741 72.465 7.73537 69.935 8.34907 67.5445L8.73758 66.0311C9.17502 64.3271 8.8885 62.5181 7.94591 61.0327L7.10877 59.7135C5.78638 57.6295 5.78638 54.9694 7.10877 52.8854L7.94591 51.5662C8.8885 50.0808 9.17502 48.2718 8.73758 46.5678L8.34907 45.0545C7.73537 42.6639 8.55741 40.1339 10.459 38.5606L11.6629 37.5646C13.0184 36.4432 13.8499 34.8113 13.9604 33.0555L14.0586 31.4962C14.2136 29.033 15.7772 26.8809 18.072 25.9722L19.5247 25.397C21.1603 24.7493 22.4554 23.4542 23.1031 21.8185L23.6783 20.3658C24.587 18.0711 26.7391 16.5075 29.2023 16.3524L30.7617 16.2543C32.5174 16.1437 34.1494 15.3122 35.2708 13.9568L36.2668 12.7529C37.84 10.8513 40.37 10.0292 42.7606 10.6429L44.2739 11.0314C45.9779 11.4689 47.7869 11.1824 49.2723 10.2398L50.5916 9.40263Z"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.3"
                    strokeWidth="0.5"
                    clipPath={`url(#${clipId})`}
                  />
                  <defs>
                    <linearGradient id={gradId} x1="54.0056" y1="7.23621" x2="54.0056" y2="105.363" gradientUnits="userSpaceOnUse">
                      <stop stopColor={isLight ? '#ffffff' : '#171717'} />
                      <stop offset="1" stopColor={isLight ? '#e4e4e7' : '#292929'} />
                    </linearGradient>
                    <clipPath id={clipId}>
                      <rect x="0" y="72" width="108.011" height="44.422" />
                    </clipPath>
                  </defs>
                </svg>
              </div>
            </div>

            {/* 随转盘旋转的小圆点序列 */}
            <div
              className="hf-vg-tw-dots-ring"
              style={{
                transform: `rotate(${rotationDegrees}deg)`,
                transformOrigin: '67px 49px',
                transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {DOT_SLOTS.map((slotIdx) => {
                const rad = (slotIdx * TOOLS_PANE_WHEEL_DEGREES_PER_SLOT * Math.PI) / 180;
                const dotLeft = 67 + 35 * Math.cos(rad) - 3.5;
                const dotTop = 49 + 35 * Math.sin(rad) - 3.5;
                const isCenter = slotIdx === 0;
                return (
                  <span
                    key={`dot-${slotIdx}`}
                    className="hf-vg-tw-dot"
                    style={{
                      left: dotLeft,
                      top: dotTop,
                      opacity: isCenter && !isDragging ? 0 : 0.5,
                      transition: isDragging ? 'none' : 'opacity 220ms ease',
                    }}
                  />
                );
              })}
            </div>

            {/* 随转盘旋转的紫色高亮指示药丸图层 (同心 67px 49px 旋转) */}
            <div
              className="hf-vg-tw-pill-layer"
              style={{
                transform: `rotate(${rotationDegrees}deg)`,
                transformOrigin: '67px 49px',
                transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="hf-vg-tw-pill" />
            </div>

            {/* 左侧突出半胶囊 (静止动态图标) */}
            <div className="hf-vg-tw-chip">
              <div className="hf-vg-tw-chip-blob" />
              <span className="hf-vg-tw-chip-ico">
                <VideoFeatureIcon id={activeId} size={16} />
              </span>
            </div>
          </div>
        </div>

        {/* 官方 1:1 右上角 视频 徽标 */}
        <div className="hf-vg-tw-badge">
          <span>视频</span>
        </div>

        {/* 官方 1:1 右下角大圆角下拉展开按钮 */}
        <button
          type="button"
          className={`hf-vg-tw-expand${dropdownOpen ? ' is-open' : ''}`}
          aria-label="切换视频模式菜单"
          onClick={(e) => {
            e.stopPropagation();
            setDropdownOpen((v) => !v);
          }}
        >
          <ChevronDownBold className="hf-vg-tw-expand-chev" />
        </button>
        <div className="hf-vg-tw-inset" />
      </div>

      {/* 官方 1:1 模式说明气泡 (精确锚定于 (i) 图标正下方，绝对不被截断) */}
      {infoTooltipOpen && active.desc && infoTooltipPos && (
        <div
          className="hf-vg-tw-tooltip-portal"
          style={{
            position: 'fixed',
            top: infoTooltipPos.top,
            left: infoTooltipPos.left,
            transform: 'translateX(-50%)',
            zIndex: 99999,
          }}
          role="tooltip"
        >
          <div className="hf-vg-tw-tooltip-box">{active.desc}</div>
        </div>
      )}

      {/* 官方 1:1 浮动下拉列表 */}
      {dropdownOpen && (
        <DropdownMenu
          tools={tools}
          activeId={activeId}
          onSelect={selectToolFromDropdown}
        />
      )}
    </div>
  );
};

export default React.memo(VideoToolsWheel);
