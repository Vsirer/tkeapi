/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流自动布局（Sugiyama 分层）
 * - parentId + inputConnections 建边 → 最长路径分层
 * - 同层：提示词在上、素材在下
 * - 尺寸：DOM 实测与类型默认值取较大者（避免实测偏小导致层距不够、节点重叠）
 * - 布局后强制 AABB 分离，保证摊开
 */
import type { CanvasNode } from '../types';

const DEFAULT_W = 320;
const DEFAULT_H = 240;
const DEFAULT_AI_IMAGE_H = 440;
const DEFAULT_AI_VIDEO_H = 420;
const DEFAULT_ASSET_H = 300;
const DEFAULT_PROMPT_W = 280;
const DEFAULT_PROMPT_H = 180;
const DEFAULT_SEC_W = 400;
const DEFAULT_SEC_H = 300;

/** 列间距：必须大于连接器/标签外伸，保证左右摊开 */
const LAYER_GAP = 160;
const NODE_GAP_Y = 56;
const COMPONENT_GAP = 96;
const ORIGIN_X = 80;
const ORIGIN_Y = 80;
const SEC_PAD_X = 36;
const SEC_PAD_TOP = 56;
/** 整理后区块相对子节点至少保留的边距 */
const SECTION_FIT_PAD = 5;
const CHROME_TOP = 30;
const MIN_COL_W = 200;

export type NodeSizeMap = Map<string, { w: number; h: number }>;

export type AutoLayoutOptions = {
  sizes?: NodeSizeMap;
};

export type AutoLayoutResult = {
  nodes: CanvasNode[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
};

function nodeTypeKey(n: CanvasNode): string {
  return (n.taskData?.node_type || n.type || '').toLowerCase();
}

function chromeTopFor(n: CanvasNode): number {
  const t = nodeTypeKey(n);
  if (t === 'asset' || t === 'ai_image' || t === 'ai_video' || t === 'preview' || t === 'section') {
    return CHROME_TOP;
  }
  return 0;
}

/** 同层阅读序：提示词 → 文本 → 素材 → 预览 → 生成 */
function layerTypeRank(n: CanvasNode): number {
  const t = nodeTypeKey(n);
  if (t === 'prompt') return 0;
  if (t === 'text') return 1;
  if (t === 'asset') return 2;
  if (t === 'preview') return 3;
  if (t === 'ai_image' || t === 'ai_video' || t === 'volc_enhance') return 4;
  if (t === 'section') return 5;
  return 6;
}

function defaultSize(n: CanvasNode): { w: number; h: number } {
  if (n.type === 'section') {
    return { w: n.width || DEFAULT_SEC_W, h: n.height || DEFAULT_SEC_H };
  }
  const t = n.taskData?.node_type;
  if (t === 'prompt') {
    return { w: n.width || DEFAULT_PROMPT_W, h: n.height || DEFAULT_PROMPT_H };
  }
  if (t === 'ai_image') {
    return { w: n.width || 320, h: Math.max(n.height || 0, DEFAULT_AI_IMAGE_H) };
  }
  if (t === 'ai_video') {
    return { w: n.width || 569, h: Math.max(n.height || 0, DEFAULT_AI_VIDEO_H) };
  }
  if (t === 'asset') {
    return { w: n.width || 300, h: Math.max(n.height || 0, DEFAULT_ASSET_H) };
  }
  if (t === 'preview') {
    return { w: n.width || 280, h: Math.max(n.height || 0, 200) };
  }
  return {
    w: n.width || DEFAULT_W,
    h: Math.max(n.height || 0, DEFAULT_H),
  };
}

/**
 * 取「持久化 / 类型默认 / DOM 实测」的较大值。
 * 实测若偏小（未撑开、height:auto 瞬时值）会导致列宽过窄、节点互相压住。
 */
function nodeSize(n: CanvasNode, sizes?: NodeSizeMap): { w: number; h: number } {
  const fb = defaultSize(n);
  const measured = sizes?.get(n.id);
  if (!measured) return fb;
  return {
    w: Math.max(fb.w, measured.w || 0),
    h: Math.max(fb.h, measured.h || 0),
  };
}

function stableOrder(n: CanvasNode): number {
  const created = n.taskData?.created_at;
  if (typeof created === 'string') {
    const ms = Date.parse(created);
    if (!Number.isNaN(ms)) return ms;
  }
  const id = n.id || '';
  const m = id.match(/(\d{10,})/);
  if (m) return parseInt(m[1], 10) || 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

function compareLayerNodes(a: CanvasNode, b: CanvasNode): number {
  const tr = layerTypeRank(a) - layerTypeRank(b);
  if (tr !== 0) return tr;
  return stableOrder(a) - stableOrder(b);
}

function collectEdges(nodes: CanvasNode[]): Array<{ from: string; to: string }> {
  const idSet = new Set(nodes.map((n) => n.id));
  const edges: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>();

  const add = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    if (!idSet.has(from) || !idSet.has(to)) return;
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to });
  };

  for (const n of nodes) {
    if (n.parentId) add(n.parentId, n.id);
    const conns = n.inputConnections;
    if (conns && typeof conns === 'object') {
      Object.values(conns).forEach((pid) => {
        if (typeof pid === 'string') add(pid, n.id);
      });
    }
  }
  return edges;
}

type LayeredLayoutOpts = {
  startX: number;
  startY: number;
  layerGap?: number;
  nodeGapY?: number;
  sizes?: NodeSizeMap;
};

function layoutLayeredDag(
  groupNodes: CanvasNode[],
  opts: LayeredLayoutOpts,
): { laidOut: CanvasNode[]; width: number; height: number } {
  if (groupNodes.length === 0) {
    return { laidOut: [], width: 0, height: 0 };
  }

  const layerGap = opts.layerGap ?? LAYER_GAP;
  const nodeGapY = opts.nodeGapY ?? NODE_GAP_Y;
  const sizes = opts.sizes;
  const byId = new Map(groupNodes.map((n) => [n.id, n]));
  const edges = collectEdges(groupNodes);

  const undirected = new Map<string, Set<string>>();
  for (const n of groupNodes) undirected.set(n.id, new Set());
  for (const e of edges) {
    undirected.get(e.from)?.add(e.to);
    undirected.get(e.to)?.add(e.from);
  }

  const components: string[][] = [];
  const seenComp = new Set<string>();
  const sortedIds = [...groupNodes].sort(compareLayerNodes).map((n) => n.id);
  for (const id of sortedIds) {
    if (seenComp.has(id)) continue;
    const stack = [id];
    const comp: string[] = [];
    seenComp.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nb of undirected.get(cur) || []) {
        if (seenComp.has(nb)) continue;
        seenComp.add(nb);
        stack.push(nb);
      }
    }
    components.push(comp.sort((a, b) => compareLayerNodes(byId.get(a)!, byId.get(b)!)));
  }

  const layoutOneComponent = (
    ids: string[],
    startX: number,
    startY: number,
  ): { laidOut: CanvasNode[]; width: number; height: number } => {
    const nodes = ids.map((id) => byId.get(id)!);
    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    for (const id of ids) {
      children.set(id, []);
      parents.set(id, []);
    }
    for (const e of edges) {
      if (!ids.includes(e.from) || !ids.includes(e.to)) continue;
      children.get(e.from)?.push(e.to);
      parents.get(e.to)?.push(e.from);
    }

    const layer = new Map<string, number>();
    const visiting = new Set<string>();
    const dfsLayer = (id: string): number => {
      if (layer.has(id)) return layer.get(id)!;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const ps = parents.get(id) || [];
      let L = 0;
      if (ps.length) L = Math.max(...ps.map((p) => dfsLayer(p))) + 1;
      visiting.delete(id);
      layer.set(id, L);
      return L;
    };
    for (const id of ids) dfsLayer(id);

    // 无边时：按类型分成「源 | 生成 | 预览」伪层，避免全部堆在 (startX,startY)
    const hasAnyEdge = edges.some((e) => ids.includes(e.from) && ids.includes(e.to));
    if (!hasAnyEdge && ids.length > 1) {
      for (const id of ids) {
        const t = nodeTypeKey(byId.get(id)!);
        if (t === 'prompt' || t === 'asset' || t === 'text') layer.set(id, 0);
        else if (t === 'ai_image' || t === 'ai_video' || t === 'volc_enhance') layer.set(id, 1);
        else if (t === 'preview') layer.set(id, 2);
        else layer.set(id, 1);
      }
    }

    const maxLayer = Math.max(0, ...[...layer.values()]);
    const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
    for (const id of ids) layers[layer.get(id) || 0].push(id);

    const orderIndex = new Map<string, number>();
    const reindex = () => {
      orderIndex.clear();
      layers.forEach((row) => row.forEach((id, i) => orderIndex.set(id, i)));
    };
    reindex();

    const barycenter = (id: string, neighborIds: string[]): number => {
      if (!neighborIds.length) return orderIndex.get(id) ?? 0;
      return neighborIds.reduce((s, nid) => s + (orderIndex.get(nid) ?? 0), 0) / neighborIds.length;
    };

    if (hasAnyEdge) {
      for (let pass = 0; pass < 4; pass++) {
        for (let L = 1; L <= maxLayer; L++) {
          layers[L].sort((a, b) => {
            const d = barycenter(a, parents.get(a) || []) - barycenter(b, parents.get(b) || []);
            if (d !== 0) return d;
            return compareLayerNodes(byId.get(a)!, byId.get(b)!);
          });
          reindex();
        }
        for (let L = maxLayer - 1; L >= 0; L--) {
          layers[L].sort((a, b) => {
            const d = barycenter(a, children.get(a) || []) - barycenter(b, children.get(b) || []);
            if (d !== 0) return d;
            return compareLayerNodes(byId.get(a)!, byId.get(b)!);
          });
          reindex();
        }
      }
    }

    // 源层 / 同扇入：强制类型序（提示词在素材之上）
    for (let L = 0; L <= maxLayer; L++) {
      layers[L].sort((a, b) => {
        const pa = parents.get(a) || [];
        const pb = parents.get(b) || [];
        const sameFanIn = pa.length && pb.length && pa.some((p) => pb.includes(p));
        const bothSources = pa.length === 0 && pb.length === 0;
        if (sameFanIn || bothSources || L === 0 || !hasAnyEdge) {
          return compareLayerNodes(byId.get(a)!, byId.get(b)!);
        }
        return 0;
      });
    }

    const pos = new Map<string, { x: number; y: number }>();
    let cursorX = startX;
    let maxBottom = startY;
    let maxRight = startX;

    for (let L = 0; L <= maxLayer; L++) {
      const row = layers[L];
      if (!row.length) continue;
      const widths = row.map((id) => nodeSize(byId.get(id)!, sizes).w);
      const colW = Math.max(MIN_COL_W, ...widths);
      let y = startY;
      row.forEach((id) => {
        const n = byId.get(id)!;
        const { w, h } = nodeSize(n, sizes);
        const chrome = chromeTopFor(n);
        const x = cursorX + (colW - w) / 2;
        const placeY = y + chrome;
        pos.set(id, { x, y: placeY });
        y = placeY + h + nodeGapY;
        maxRight = Math.max(maxRight, x + w);
        maxBottom = Math.max(maxBottom, placeY + h);
      });
      cursorX += colW + layerGap;
    }

    for (const id of ids) {
      if (pos.has(id)) continue;
      const n = byId.get(id)!;
      const { w, h } = nodeSize(n, sizes);
      const chrome = chromeTopFor(n);
      pos.set(id, { x: cursorX, y: startY + chrome });
      cursorX += Math.max(w, MIN_COL_W) + layerGap;
      maxRight = Math.max(maxRight, cursorX - layerGap);
      maxBottom = Math.max(maxBottom, startY + chrome + h);
    }

    const laidOut = nodes.map((n) => {
      const p = pos.get(n.id)!;
      return { ...n, x: p.x, y: p.y };
    });

    return {
      laidOut,
      width: Math.max(0, maxRight - startX),
      height: Math.max(0, maxBottom - startY),
    };
  };

  const LINE_MAX = 2800;
  let packX = opts.startX;
  let packY = opts.startY;
  let rowH = 0;
  let maxRight = opts.startX;
  let maxBottom = opts.startY;
  const allLaid: CanvasNode[] = [];

  for (const comp of components) {
    const trial = layoutOneComponent(comp, 0, 0);
    const needW = Math.max(trial.width, MIN_COL_W);
    const needH = Math.max(trial.height, 1);
    if (packX > opts.startX && packX + needW > opts.startX + LINE_MAX) {
      packX = opts.startX;
      packY += rowH + COMPONENT_GAP;
      rowH = 0;
    }
    const placed = layoutOneComponent(comp, packX, packY);
    allLaid.push(...placed.laidOut);
    packX += needW + COMPONENT_GAP;
    rowH = Math.max(rowH, needH);
    maxRight = Math.max(maxRight, packX - COMPONENT_GAP);
    maxBottom = Math.max(maxBottom, packY + needH);
  }

  const separated = forceSpreadNodes(allLaid, sizes, nodeGapY, layerGap * 0.35);

  let sepMaxR = opts.startX;
  let sepMaxB = opts.startY;
  for (const n of separated) {
    const { w, h } = nodeSize(n, sizes);
    sepMaxR = Math.max(sepMaxR, n.x + w);
    sepMaxB = Math.max(sepMaxB, n.y + h);
  }

  return {
    laidOut: separated,
    width: Math.max(0, sepMaxR - opts.startX, maxRight - opts.startX),
    height: Math.max(0, sepMaxB - opts.startY, maxBottom - opts.startY),
  };
}

/**
 * 强制摊开：任意两节点（含标题外伸）若 AABB 相交或间距不足，则下推或右推。
 */
function forceSpreadNodes(
  nodes: CanvasNode[],
  sizes: NodeSizeMap | undefined,
  gapY: number,
  gapX: number,
): CanvasNode[] {
  if (nodes.length < 2) return nodes;

  type Item = {
    id: string;
    n: CanvasNode;
    w: number;
    h: number;
    chrome: number;
    x: number;
    y: number;
  };

  const items: Item[] = nodes.map((n) => {
    const { w, h } = nodeSize(n, sizes);
    return { id: n.id, n, w, h, chrome: chromeTopFor(n), x: n.x, y: n.y };
  });

  for (let pass = 0; pass < 16; pass++) {
    items.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
    let moved = false;

    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = items[i];
        const b = items[j];

        const aTop = a.y - a.chrome;
        const aBottom = a.y + a.h;
        const aLeft = a.x;
        const aRight = a.x + a.w;
        const bTop = b.y - b.chrome;
        const bBottom = b.y + b.h;
        const bLeft = b.x;
        const bRight = b.x + b.w;

        const sepX = Math.min(aRight - bLeft, bRight - aLeft);
        const sepY = Math.min(aBottom - bTop, bBottom - aTop);
        // 需要的最小间距
        const needX = gapX;
        const needY = gapY;

        const overlapX = aLeft < bRight + needX && aRight + needX > bLeft;
        const overlapY = aTop < bBottom + needY && aBottom + needY > bTop;
        if (!overlapX || !overlapY) continue;

        // 同列（水平重叠多）→ 下推；否则 → 右推
        const xOverlapAmt = Math.max(0, sepX);
        const yOverlapAmt = Math.max(0, sepY);
        const sameColumn = xOverlapAmt > Math.min(a.w, b.w) * 0.35;

        if (sameColumn || yOverlapAmt <= xOverlapAmt) {
          const nextY = bBottom + needY + a.chrome;
          if (nextY > a.y + 0.5) {
            a.y = nextY;
            moved = true;
          }
        } else {
          const nextX = bRight + needX;
          if (nextX > a.x + 0.5) {
            a.x = nextX;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }

  const byId = new Map(items.map((it) => [it.id, it]));
  return nodes.map((n) => {
    const it = byId.get(n.id);
    return it ? { ...n, x: it.x, y: it.y } : n;
  });
}

function membershipFromChildrenIds(
  sections: CanvasNode[],
  normalNodes: CanvasNode[],
): Map<string, string> {
  const normalIds = new Set(normalNodes.map((n) => n.id));
  const map = new Map<string, string>();
  const sorted = [...sections].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
  for (const sec of sorted) {
    for (const id of sec.childrenNodeIds || []) {
      if (normalIds.has(id) && !map.has(id)) {
        map.set(id, sec.id);
      }
    }
  }
  return map;
}

/**
 * 推挤防重叠时把区块当作整体：只推区块与区外节点；
 * 区块位移时子节点同步平移，避免整理布局拆散绑定关系。
 */
function forceSpreadPreservingSections(
  nodes: CanvasNode[],
  membership: Map<string, string>,
  sizes: NodeSizeMap | undefined,
  gapY: number,
  gapX: number,
): CanvasNode[] {
  const childIds = new Set(membership.keys());
  const topLevel = nodes.filter((n) => n.type === 'section' || !childIds.has(n.id));
  if (topLevel.length < 2) return nodes;

  const before = new Map(topLevel.map((n) => [n.id, { x: n.x, y: n.y }]));
  const spreadTop = forceSpreadNodes(topLevel, sizes, gapY, gapX);
  const byId = new Map(spreadTop.map((n) => [n.id, n]));

  const sectionDelta = new Map<string, { dx: number; dy: number }>();
  for (const n of spreadTop) {
    if (n.type !== 'section') continue;
    const prev = before.get(n.id);
    if (!prev) continue;
    const dx = n.x - prev.x;
    const dy = n.y - prev.y;
    if (dx !== 0 || dy !== 0) sectionDelta.set(n.id, { dx, dy });
  }

  return nodes.map((n) => {
    const sid = membership.get(n.id);
    if (sid) {
      const d = sectionDelta.get(sid);
      return d ? { ...n, x: n.x + d.dx, y: n.y + d.dy } : n;
    }
    return byId.get(n.id) || n;
  });
}

/** 区块包不住子节点时，只扩有溢出的边，并留 SECTION_FIT_PAD */
function expandSectionToContainChildren(
  section: CanvasNode,
  children: CanvasNode[],
  sizes?: NodeSizeMap,
  pad: number = SECTION_FIT_PAD,
): CanvasNode {
  if (!children.length) return section;
  let x = section.x;
  let y = section.y;
  let w = section.width || DEFAULT_SEC_W;
  let h = section.height || DEFAULT_SEC_H;

  for (const child of children) {
    const { w: cw, h: ch } = nodeSize(child, sizes);
    const nodeL = child.x;
    const nodeR = child.x + cw;
    const nodeT = child.y - chromeTopFor(child);
    const nodeB = child.y + ch;

    if (nodeL < x + pad) {
      const nextX = nodeL - pad;
      w += x - nextX;
      x = nextX;
    }
    if (nodeR > x + w - pad) {
      w = nodeR + pad - x;
    }
    if (nodeT < y + pad) {
      const nextY = nodeT - pad;
      h += y - nextY;
      y = nextY;
    }
    if (nodeB > y + h - pad) {
      h = nodeB + pad - y;
    }
  }

  if (
    x === section.x &&
    y === section.y &&
    w === (section.width || DEFAULT_SEC_W) &&
    h === (section.height || DEFAULT_SEC_H)
  ) {
    return section;
  }
  return { ...section, x, y, width: w, height: h };
}

function refitSectionsToBoundChildren(
  nodes: CanvasNode[],
  membership: Map<string, string>,
  sizes?: NodeSizeMap,
): CanvasNode[] {
  const kidsBySec = new Map<string, CanvasNode[]>();
  for (const n of nodes) {
    const sid = membership.get(n.id);
    if (!sid) continue;
    const list = kidsBySec.get(sid) || [];
    list.push(n);
    kidsBySec.set(sid, list);
  }
  if (kidsBySec.size === 0) return nodes;

  return nodes.map((n) => {
    if (n.type !== 'section') return n;
    const kids = kidsBySec.get(n.id);
    if (!kids?.length) return n;
    return expandSectionToContainChildren(n, kids, sizes);
  });
}

/** 布局落盘后再用 DOM 实测（含缩略 tab）撑一次区块 */
export function refitSectionBoundsUsingDom(
  nodes: CanvasNode[],
  canvasEl: HTMLElement | null | undefined,
): CanvasNode[] {
  const sizes = measureNodeSizesFromDom(canvasEl);
  const visible = nodes.filter((n) => !n.isHidden);
  const sections = visible.filter((n) => n.type === 'section');
  if (!sections.length) return nodes;
  const normalNodes = visible.filter((n) => n.type !== 'section');
  const membership = membershipFromChildrenIds(sections, normalNodes);
  return refitSectionsToBoundChildren(nodes, membership, sizes);
}

/** 由节点数据估算包围盒（DOM 尚未就绪时用） */
export function boundsFromCanvasNodes(
  nodes: CanvasNode[],
): AutoLayoutResult['bounds'] | null {
  const visible = nodes.filter((n) => !n.isHidden && n.id !== 'group');
  if (!visible.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of visible) {
    const { w, h } = defaultSize(n);
    const x = Number.isFinite(n.x) ? (n.x as number) : 0;
    const y = Number.isFinite(n.y) ? (n.y as number) : 0;
    const top = y - chromeTopFor(n);
    minX = Math.min(minX, x);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function isValidCanvasTransform(
  t: { x?: unknown; y?: unknown; scale?: unknown } | null | undefined,
): t is { x: number; y: number; scale: number } {
  if (!t) return false;
  const { x, y, scale } = t;
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    typeof scale === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(scale) &&
    scale >= 0.05 &&
    scale <= 8
  );
}

/**
 * 判断当前 transform 下内容是否大致落在视口内。
 * 用于刷新后纠正「节点群在视口外」的坏视角。
 */
export function isTransformShowingBounds(
  transform: { x: number; y: number; scale: number },
  bounds: AutoLayoutResult['bounds'],
  viewport: { width: number; height: number },
): boolean {
  const { x, y, scale } = transform;
  if (!isValidCanvasTransform(transform)) return false;

  const left = bounds.minX * scale + x;
  const right = bounds.maxX * scale + x;
  const top = bounds.minY * scale + y;
  const bottom = bounds.maxY * scale + y;
  const { width: vw, height: vh } = viewport;
  if (vw < 40 || vh < 40) return false;

  const ix = Math.max(0, Math.min(right, vw) - Math.max(left, 0));
  const iy = Math.max(0, Math.min(bottom, vh) - Math.max(top, 0));
  // 至少露出一小块内容
  if (ix < 40 || iy < 40) return false;

  const cx = ((bounds.minX + bounds.maxX) / 2) * scale + x;
  const cy = ((bounds.minY + bounds.maxY) / 2) * scale + y;
  const marginX = vw * 0.75;
  const marginY = vh * 0.75;
  return cx > -marginX && cx < vw + marginX && cy > -marginY && cy < vh + marginY;
}

export function fitTransformToBounds(
  bounds: AutoLayoutResult['bounds'],
  viewport: { width: number; height: number },
  paddingOrOptions:
    | number
    | {
        padding?: number;
        insets?: { top?: number; right?: number; bottom?: number; left?: number };
        maxScale?: number;
        contentOverhang?: { top?: number; bottom?: number; left?: number; right?: number };
      } = 72,
): { x: number; y: number; scale: number } {
  const opts = typeof paddingOrOptions === 'number'
    ? { padding: paddingOrOptions }
    : paddingOrOptions || {};
  const padding = opts.padding ?? 72;
  const insets = opts.insets || {};
  const overhang = opts.contentOverhang || {};
  const topInset = insets.top ?? 0;
  const bottomInset = insets.bottom ?? 0;
  const leftInset = insets.left ?? 0;
  const rightInset = insets.right ?? 0;

  const minX = bounds.minX - (overhang.left ?? 0);
  const minY = bounds.minY - (overhang.top ?? 0);
  const maxX = bounds.maxX + (overhang.right ?? 0);
  const maxY = bounds.maxY + (overhang.bottom ?? 0);
  const contentW = Math.max(maxX - minX, 1);
  const contentH = Math.max(maxY - minY, 1);

  const availW = Math.max(viewport.width - leftInset - rightInset - padding * 2, 120);
  const availH = Math.max(viewport.height - topInset - bottomInset - padding * 2, 120);
  const maxScale = opts.maxScale ?? 1;
  const scale = Math.min(Math.max(Math.min(availW / contentW, availH / contentH), 0.12), maxScale);

  const x = leftInset + padding + (availW - contentW * scale) / 2 - minX * scale;
  const y = topInset + padding + (availH - contentH * scale) / 2 - minY * scale;
  return { x, y, scale };
}

/** 与 CSS `.pg-flow-asset-switcher { top: calc(100% + 10px) }` 对齐 */
const ASSET_SWITCHER_GAP = 10;

/** 节点根：FlowNodeFrame / Section，排除连接器上复用的 data-node-id */
function isCanvasNodeRootEl(el: HTMLElement): boolean {
  return (
    el.getAttribute('data-flow-frame') === 'true' ||
    el.classList.contains('pg-flow-section-frame')
  );
}

/**
 * 节点视觉占位（含卡片外绝对定位的缩略 tab）
 * 缩略切换条不在 offsetHeight 内，区块包裹必须把它算进去
 */
export function measureNodeVisualSize(el: HTMLElement): { w: number; h: number } {
  const w = el.offsetWidth || parseFloat(el.style.width) || 0;
  const baseH = el.offsetHeight || 0;
  const switcher = el.querySelector('.pg-flow-asset-switcher') as HTMLElement | null;
  let h = baseH;
  if (switcher) {
    const style = window.getComputedStyle(switcher);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      const swH = switcher.offsetHeight || 0;
      if (swH > 0) {
        h = baseH + ASSET_SWITCHER_GAP + swH;
      }
    }
  }
  return { w, h };
}

export function queryCanvasNodeRoot(
  canvasEl: HTMLElement | null | undefined,
  nodeId: string,
): HTMLElement | null {
  if (!canvasEl || !nodeId) return null;
  const direct = canvasEl.querySelector(
    `[data-node-id="${CSS.escape(nodeId)}"][data-flow-frame="true"], [data-node-id="${CSS.escape(nodeId)}"].pg-flow-section-frame`,
  ) as HTMLElement | null;
  if (direct) return direct;
  const all = canvasEl.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
  for (const el of all) {
    if (isCanvasNodeRootEl(el)) return el;
  }
  return null;
}

export function measureNodeSizesFromDom(
  canvasEl: HTMLElement | null | undefined,
): NodeSizeMap {
  const map: NodeSizeMap = new Map();
  if (!canvasEl) return map;
  const els = canvasEl.querySelectorAll<HTMLElement>('[data-node-id]');
  els.forEach((el) => {
    const id = el.getAttribute('data-node-id');
    if (!id || id === 'group') return;
    if (!isCanvasNodeRootEl(el)) return;
    const { w, h } = measureNodeVisualSize(el);
    if (w > 0 && h > 0) map.set(id, { w, h });
  });
  return map;
}

export function measureNodeBoundsFromDom(
  canvasEl: HTMLElement | null | undefined,
): AutoLayoutResult['bounds'] | null {
  if (!canvasEl) return null;
  const els = canvasEl.querySelectorAll<HTMLElement>('[data-node-id]');
  if (!els.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  els.forEach((el) => {
    const id = el.getAttribute('data-node-id');
    if (id === 'group') return;
    if (!isCanvasNodeRootEl(el)) return;
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const { w, h } = measureNodeVisualSize(el);
    if (w <= 0 || h <= 0) return;
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  if (!count || !Number.isFinite(minX)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function centerLayoutAroundOrigin(
  nodes: CanvasNode[],
  bounds: AutoLayoutResult['bounds'],
): AutoLayoutResult {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return { nodes, bounds };
  }
  if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) {
    return { nodes, bounds };
  }
  const nextNodes = nodes.map((n) =>
    n.isHidden ? n : { ...n, x: (n.x || 0) - cx, y: (n.y || 0) - cy },
  );
  return {
    nodes: nextNodes,
    bounds: {
      minX: bounds.minX - cx,
      minY: bounds.minY - cy,
      maxX: bounds.maxX - cx,
      maxY: bounds.maxY - cy,
      width: bounds.width,
      height: bounds.height,
    },
  };
}

export function autoLayoutCanvasNodes(
  allNodes: CanvasNode[],
  options: AutoLayoutOptions = {},
): AutoLayoutResult {
  const sizes = options.sizes;
  const visible = allNodes.filter((n) => !n.isHidden);
  const hidden = allNodes.filter((n) => n.isHidden);

  if (visible.length === 0) {
    return {
      nodes: allNodes,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  const sections = visible.filter((n) => n.type === 'section');
  const normalNodes = visible.filter((n) => n.type !== 'section');
  const membership = membershipFromChildrenIds(sections, normalNodes);

  const sectionChildren = new Map<string, CanvasNode[]>();
  sections.forEach((s) => sectionChildren.set(s.id, []));
  const outside: CanvasNode[] = [];
  for (const n of normalNodes) {
    const sid = membership.get(n.id);
    if (sid) sectionChildren.get(sid)?.push(n);
    else outside.push(n);
  }

  const sectionLocalChildren = new Map<string, CanvasNode[]>();
  const resizedSections: CanvasNode[] = [];

  for (const sec of sections) {
    const kids = sectionChildren.get(sec.id) || [];
    if (!kids.length) {
      resizedSections.push({
        ...sec,
        width: Math.max(sec.width || DEFAULT_SEC_W, DEFAULT_SEC_W),
        height: Math.max(sec.height || DEFAULT_SEC_H, DEFAULT_SEC_H),
      });
      sectionLocalChildren.set(sec.id, []);
      continue;
    }
    const local = layoutLayeredDag(kids, {
      startX: SEC_PAD_X,
      startY: SEC_PAD_TOP,
      layerGap: 120,
      nodeGapY: 40,
      sizes,
    });
    const maxX = Math.max(...local.laidOut.map((n) => n.x + nodeSize(n, sizes).w), SEC_PAD_X);
    const maxY = Math.max(...local.laidOut.map((n) => n.y + nodeSize(n, sizes).h), SEC_PAD_TOP);
    resizedSections.push({
      ...sec,
      width: Math.max(DEFAULT_SEC_W, maxX + SECTION_FIT_PAD),
      height: Math.max(DEFAULT_SEC_H, maxY + SECTION_FIT_PAD),
    });
    sectionLocalChildren.set(sec.id, local.laidOut);
  }

  const topLayout = layoutLayeredDag(outside, {
    startX: ORIGIN_X,
    startY: ORIGIN_Y,
    sizes,
  });

  const laidTopIds = new Set(topLayout.laidOut.map((n) => n.id));
  const missingOutside = outside.filter((n) => !laidTopIds.has(n.id));

  const sectionStartX =
    topLayout.width > 0 ? ORIGIN_X + topLayout.width + COMPONENT_GAP : ORIGIN_X;
  let packX = sectionStartX;
  let packY = ORIGIN_Y;
  let rowH = 0;
  const LINE_MAX = 2800;
  const sectionPlaced: CanvasNode[] = [];

  const sortedSecs = [...resizedSections].sort((a, b) => stableOrder(a) - stableOrder(b));
  for (const sec of sortedSecs) {
    const { w, h } = nodeSize(sec, sizes);
    if (packX > sectionStartX && packX + w > ORIGIN_X + LINE_MAX) {
      packX = sectionStartX;
      packY += rowH + COMPONENT_GAP;
      rowH = 0;
    }
    sectionPlaced.push({ ...sec, x: packX, y: packY });
    packX += w + COMPONENT_GAP;
    rowH = Math.max(rowH, h);
  }

  let isoX = ORIGIN_X;
  let isoY = ORIGIN_Y + (topLayout.height > 0 ? topLayout.height + COMPONENT_GAP : 0);
  if (sectionPlaced.length && topLayout.width === 0) {
    const secBottom = Math.max(...sectionPlaced.map((s) => s.y + nodeSize(s, sizes).h), ORIGIN_Y);
    isoY = Math.max(isoY, secBottom + COMPONENT_GAP);
  }
  let isoRowH = 0;
  const isoLaid: CanvasNode[] = [];
  for (const n of missingOutside) {
    const { w, h } = nodeSize(n, sizes);
    if (isoX > ORIGIN_X && isoX + w > ORIGIN_X + LINE_MAX) {
      isoX = ORIGIN_X;
      isoY += isoRowH + NODE_GAP_Y;
      isoRowH = 0;
    }
    isoLaid.push({ ...n, x: isoX, y: isoY + chromeTopFor(n) });
    isoX += w + LAYER_GAP;
    isoRowH = Math.max(isoRowH, h + chromeTopFor(n));
  }

  const finalVisible: CanvasNode[] = [];
  for (const n of topLayout.laidOut) finalVisible.push(n);
  for (const n of isoLaid) finalVisible.push(n);

  for (const sec of sectionPlaced) {
    const locals = sectionLocalChildren.get(sec.id) || [];
    for (const child of locals) {
      finalVisible.push({
        ...child,
        x: sec.x + child.x,
        y: sec.y + child.y,
      });
    }
    finalVisible.push({
      ...sec,
      childrenNodeIds: (sectionChildren.get(sec.id) || []).map((c) => c.id),
    });
  }

  let separatedVisible = refitSectionsToBoundChildren(
    forceSpreadPreservingSections(
      finalVisible,
      membership,
      sizes,
      NODE_GAP_Y,
      LAYER_GAP * 0.4,
    ),
    membership,
    sizes,
  );

  const finalIds = new Set(separatedVisible.map((n) => n.id));
  // 漏排节点也强制排到右侧，避免残留旧坐标叠在已布局节点上
  const leftovers = visible.filter((n) => !finalIds.has(n.id));
  let leftoverX = ORIGIN_X;
  let leftoverY = ORIGIN_Y;
  if (separatedVisible.length) {
    leftoverX = Math.max(...separatedVisible.map((n) => n.x + nodeSize(n, sizes).w)) + COMPONENT_GAP;
    leftoverY = Math.min(...separatedVisible.map((n) => n.y));
  }
  const leftoverLaid = leftovers.map((n, i) => {
    const { w, h } = nodeSize(n, sizes);
    const node = {
      ...n,
      x: leftoverX,
      y: leftoverY + i * (h + NODE_GAP_Y) + chromeTopFor(n),
    };
    return node;
  });

  const allPlaced = refitSectionsToBoundChildren(
    forceSpreadPreservingSections(
      [...separatedVisible, ...leftoverLaid],
      membership,
      sizes,
      NODE_GAP_Y,
      LAYER_GAP * 0.4,
    ),
    membership,
    sizes,
  );
  const merged = [...allPlaced, ...hidden];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of allPlaced) {
    const { w, h } = nodeSize(n, sizes);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y - chromeTopFor(n));
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    nodes: merged,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}
