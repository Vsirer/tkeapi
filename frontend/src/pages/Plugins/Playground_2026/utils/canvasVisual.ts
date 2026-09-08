/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/** Imagine Flow 点阵基准间距（随 scale 放大） */
const FLOW_GRID_BASE = 24;

type ParticlesLike = {
  updateTransform: (x: number, y: number, scale: number) => void;
} | null | undefined;

/**
 * 同步画布变换层 + 无限点阵背景（无边界；点阵随平移/缩放移动）。
 */
export function applyCanvasVisual(
  canvasEl: HTMLElement | null | undefined,
  transformLayer: HTMLElement | null | undefined,
  x: number,
  y: number,
  scale: number,
  particles?: ParticlesLike,
): void {
  if (transformLayer) {
    transformLayer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  if (canvasEl) {
    const g = FLOW_GRID_BASE * scale;
    canvasEl.style.backgroundSize = `${g}px ${g}px`;
    canvasEl.style.backgroundPosition = `${x}px ${y}px`;
  }
  particles?.updateTransform(x, y, scale);
}

/** 从变换层 DOM 读取当前视角（手势中 React state 可能尚未防抖同步） */
export function readCanvasTransformFromDom(
  transformLayer: HTMLElement | null | undefined,
): { x: number; y: number; scale: number } | null {
  if (!transformLayer) return null;
  const raw = transformLayer.style.transform || '';
  const m = raw.match(
    /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/,
  );
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  const scale = Number(m[3]);
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) return null;
  return { x, y, scale };
}
