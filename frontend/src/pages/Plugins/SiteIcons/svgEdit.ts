export interface SvgMeta {
  width: number;
  height: number;
  background: string | null;
}

export interface SvgEdits {
  width: number;
  height: number;
  background: string | null;
  iconColor: string | null;
}

const BG_ATTR = 'data-tb-bg';
const SHAPES = new Set(['path', 'circle', 'ellipse', 'polygon', 'polyline', 'rect', 'line', 'text']);

function parseSvg(source: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
  if (doc.querySelector('parsererror')) return null;
  return root as unknown as SVGSVGElement;
}

function viewBoxSize(el: SVGSVGElement): { width: number; height: number } {
  const parts = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }
  return { width: 24, height: 24 };
}

function readLength(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const matched = raw.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (!matched) return fallback;
  const n = Number(matched[1]);
  return n > 0 ? n : fallback;
}

function colorToken(value: string): string {
  return value.replace(/!important/gi, '').trim().replace(/^['"]|['"]$/g, '');
}

function luma(value: string): number | null {
  const s = colorToken(value).toLowerCase();
  if (!s || s === 'none' || s.startsWith('url(')) return null;
  if (s === 'currentcolor' || s === 'black') return 0;
  if (s === 'white') return 255;
  let hex = '';
  if (/^#[0-9a-f]{3}$/.test(s)) hex = s.slice(1).split('').map((c) => c + c).join('');
  else if (/^#[0-9a-f]{6}$/.test(s) || /^#[0-9a-f]{8}$/.test(s)) hex = s.slice(1, 7);
  else {
    const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!rgb) return null;
    return 0.299 * Number(rgb[1]) + 0.587 * Number(rgb[2]) + 0.114 * Number(rgb[3]);
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isDarkColor(value: string): boolean {
  const n = luma(value);
  return n != null && n < 60;
}

function recolorCss(css: string, color: string): string {
  return css.replace(/(fill|stroke|stop-color)\s*:\s*([^;}{]+)/gi, (all, prop: string, value: string) => {
    if (!isDarkColor(value)) return all;
    return `${prop}: ${color}`;
  });
}

function ensureViewBox(el: SVGSVGElement, width: number, height: number) {
  const parts = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return { x: 0, y: 0, w: width, h: height };
}

function applyBackground(el: SVGSVGElement, color: string | null, width: number, height: number) {
  const existing = el.querySelector(`[${BG_ATTR}]`);
  if (!color) {
    existing?.remove();
    return;
  }
  const box = ensureViewBox(el, width, height);
  const doc = el.ownerDocument;
  let rect = existing as SVGRectElement | null;
  if (!rect) {
    rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute(BG_ATTR, '1');
    el.insertBefore(rect, el.firstChild);
  }
  rect.setAttribute('x', String(box.x));
  rect.setAttribute('y', String(box.y));
  rect.setAttribute('width', String(box.w));
  rect.setAttribute('height', String(box.h));
  rect.setAttribute('fill', color);
}

function recolorDark(el: SVGSVGElement, color: string) {
  el.querySelectorAll('style').forEach((node) => {
    node.textContent = recolorCss(node.textContent || '', color);
  });
  [el, ...Array.from(el.querySelectorAll('*'))].forEach((node) => {
    if (node.getAttribute(BG_ATTR) != null) return;
    for (const attr of ['fill', 'stroke', 'stop-color']) {
      const value = node.getAttribute(attr);
      if (value && isDarkColor(value)) node.setAttribute(attr, color);
    }
    const style = node.getAttribute('style');
    if (style) node.setAttribute('style', recolorCss(style, color));
    const tag = node.tagName.toLowerCase();
    if (!SHAPES.has(tag)) return;
    const fill = node.getAttribute('fill');
    const hasFill = !!fill || /fill\s*:/i.test(node.getAttribute('style') || '') || node.hasAttribute('class');
    if (!hasFill) node.setAttribute('fill', color);
  });
}

export function readSvgMeta(source: string): SvgMeta {
  const el = parseSvg(source);
  if (!el) return { width: 24, height: 24, background: null };
  const vb = viewBoxSize(el);
  const bg = el.querySelector(`[${BG_ATTR}]`)?.getAttribute('fill') || null;
  return {
    width: Math.round(readLength(el.getAttribute('width'), vb.width)),
    height: Math.round(readLength(el.getAttribute('height'), vb.height)),
    background: bg,
  };
}

export function applySvgEdits(source: string, edits: SvgEdits): string {
  const el = parseSvg(source);
  if (!el) return source;
  const width = Math.round(edits.width);
  const height = Math.round(edits.height);
  if (width > 0) el.setAttribute('width', String(width));
  if (height > 0) el.setAttribute('height', String(height));
  applyBackground(el, edits.background, width > 0 ? width : 24, height > 0 ? height : 24);
  if (edits.iconColor) recolorDark(el, edits.iconColor);
  return new XMLSerializer().serializeToString(el);
}

export function fitSvgPreview(source: string): string {
  return source.replace(/<svg\b([^>]*)>/i, (_all, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth\s*=\s*(['"]).*?\1/i, '')
      .replace(/\sheight\s*=\s*(['"]).*?\1/i, '')
      .replace(/\sstyle\s*=\s*(['"]).*?\1/i, '');
    return `<svg${cleaned} width="56" height="56" style="display:block">`;
  });
}
