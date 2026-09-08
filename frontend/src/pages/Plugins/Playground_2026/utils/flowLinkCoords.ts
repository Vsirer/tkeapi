/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流父子节点连线锚点（与 NodeConnectors / InfiniteCanvas 共用）
 */
import { NODE_CONNECTOR_OUTSET } from '../components/nodes/shared/NodeConnectors';
import type { SchemePort } from '../types';
import { enabledPorts, listHandlesForPort } from './schemeIo';

/** 首个插座中心相对节点顶边（top=24 + 行高 20/2） */
export const CONNECTOR_Y0 = 34;
/** 视频多插座行距（行高 20 + gap≈6） */
const CONNECTOR_VIDEO_ROW = 26;
/** 图片节点 Prompt → Reference 间距（行高 20 + gap 14） */
const CONNECTOR_IMAGE_GAP = 34;

export { NODE_CONNECTOR_OUTSET };

type LinkNode = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  type?: string;
  taskData?: {
    node_type?: string;
    scheme_id?: string;
    model?: string;
    manualSocketCounts?: Record<string, number>;
    io_inputs?: SchemePort[] | any[];
    io_outputs?: SchemePort[] | any[];
  };
  inputConnections?: Record<string, string>;
};

const SIDE_SOCKET_TYPES = new Set(['prompt', 'ai_image', 'ai_video', 'preview', 'asset']);

function nodeType(n: LinkNode): string {
  return n.taskData?.node_type || '';
}

function parentOutputAnchor(parent: LinkNode, pX: number, pY: number, pW: number, pH: number) {
  const t = nodeType(parent);
  let x1 = pX + pW;
  let y1 = pY + pH / 2;
  if (SIDE_SOCKET_TYPES.has(t)) {
    x1 = pX + pW + NODE_CONNECTOR_OUTSET;
    y1 = pY + CONNECTOR_Y0;
  }
  return { x1, y1 };
}

function aiVideoSocketList(child: LinkNode): string[] {
  const ioInputs = child.taskData?.io_inputs;
  if (Array.isArray(ioInputs) && ioInputs.length > 0) {
    const list: string[] = [];
    for (const port of enabledPorts(ioInputs as SchemePort[])) {
      list.push(
        ...listHandlesForPort(
          port,
          child.inputConnections,
          child.taskData?.manualSocketCounts,
        ),
      );
    }
    if (list.length) return list;
  }

  const isSeedanceLike =
    child.taskData?.scheme_id === 'seedance2.0' ||
    String(child.taskData?.scheme_id || '')
      .toLowerCase()
      .includes('seedance') ||
    String(child.taskData?.model || '')
      .toLowerCase()
      .includes('seedance');
  if (isSeedanceLike) {
    const list = ['Prompt'];
    const highestImg =
      [1, 2, 3, 4, 5, 6, 7, 8, 9].reverse().find((i) => child.inputConnections?.[`Reference Images ${i}`]) ||
      0;
    const manualImg = child.taskData?.manualSocketCounts?.['Reference Images'] || 1;
    const imgCount = Math.min(9, Math.max(manualImg, highestImg + 1));
    for (let i = 1; i <= imgCount; i++) list.push(`Reference Images ${i}`);

    const highestVid =
      [1, 2, 3].reverse().find((i) => child.inputConnections?.[`Reference Videos ${i}`]) || 0;
    const manualVid = child.taskData?.manualSocketCounts?.['Reference Videos'] || 1;
    const vidCount = Math.min(3, Math.max(manualVid, highestVid + 1));
    for (let i = 1; i <= vidCount; i++) list.push(`Reference Videos ${i}`);

    const highestAud =
      [1, 2, 3].reverse().find((i) => child.inputConnections?.[`Reference Audio ${i}`]) || 0;
    const manualAud = child.taskData?.manualSocketCounts?.['Reference Audio'] || 1;
    const audCount = Math.min(3, Math.max(manualAud, highestAud + 1));
    for (let i = 1; i <= audCount; i++) list.push(`Reference Audio ${i}`);
    return list;
  }
  return ['Prompt', 'Negative Prompt'];
}

function aiImageSocketList(child: LinkNode): string[] {
  const ioInputs = child.taskData?.io_inputs;
  if (Array.isArray(ioInputs) && ioInputs.length > 0) {
    const list: string[] = [];
    for (const port of enabledPorts(ioInputs as SchemePort[])) {
      list.push(
        ...listHandlesForPort(
          port,
          child.inputConnections,
          child.taskData?.manualSocketCounts,
        ),
      );
    }
    if (list.length) return list;
  }
  return ['Prompt', 'Reference Image'];
}

/** 图片节点左侧插座：按 handleId 在可见列表中的下标；无 IO 时回退 Prompt/Reference 间距 */
function aiImageInputY(child: LinkNode, childY: number, parent: LinkNode, handleId?: string): number {
  const ioInputs = child.taskData?.io_inputs;
  if (Array.isArray(ioInputs) && ioInputs.length > 0) {
    const list = aiImageSocketList(child);
    let idx = handleId ? list.indexOf(handleId) : -1;
    if (idx < 0 && handleId) {
      // 兼容未编号 Reference Image vs Reference Images 1
      idx = list.findIndex(
        (h) =>
          h === handleId ||
          (handleId.includes('Reference') && h.includes('Reference')) ||
          (handleId.includes('Prompt') && h.includes('Prompt') && !handleId.includes('Reference')),
      );
    }
    if (idx < 0) {
      const parentIsPrompt = nodeType(parent) === 'prompt';
      idx = parentIsPrompt ? 0 : Math.min(1, list.length - 1);
    }
    return childY + CONNECTOR_Y0 + Math.max(0, idx) * CONNECTOR_IMAGE_GAP;
  }

  const parentIsPrompt = nodeType(parent) === 'prompt';
  // 素材/图片误挂到 Prompt 插座时，按参考图锚点绘制（与语义一致）
  if (
    handleId === 'Prompt' ||
    (handleId && handleId.includes('Prompt') && !handleId.includes('Reference'))
  ) {
    if (!parentIsPrompt) {
      return childY + CONNECTOR_Y0 + CONNECTOR_IMAGE_GAP;
    }
    return childY + CONNECTOR_Y0;
  }
  if (handleId === 'Reference Image' || (handleId && handleId.includes('Reference'))) {
    return childY + CONNECTOR_Y0 + CONNECTOR_IMAGE_GAP;
  }
  if (parentIsPrompt) {
    return childY + CONNECTOR_Y0;
  }
  return childY + CONNECTOR_Y0 + CONNECTOR_IMAGE_GAP;
}

/** 智能计算父子节点连线起终点（画布坐标，未加 SVG 偏移） */
export function getLinkLineCoords(parent: LinkNode, child: LinkNode, handleId?: string) {
  const pX = parent.x;
  const pY = parent.y;
  const pW =
    nodeType(parent) === 'prompt' ? parent.width || 280 : parent.width || 320;
  const pH =
    nodeType(parent) === 'prompt' ? parent.height || 180 : parent.height || 320;

  const cX = child.x;
  const cY = child.y;
  const cW = child.width || 280;
  const cH = child.height || 200;
  const parentT = nodeType(parent);
  const childT = nodeType(child);
  const hasSideSocket = SIDE_SOCKET_TYPES.has(parentT);

  if (handleId && childT === 'ai_video') {
    const list = aiVideoSocketList(child);
    let socketIndex = list.indexOf(handleId);
    if (socketIndex === -1) socketIndex = 0;

    const x2 = cX - NODE_CONNECTOR_OUTSET;
    const y2 = cY + CONNECTOR_Y0 + socketIndex * CONNECTOR_VIDEO_ROW;
    let { x1, y1 } = parentOutputAnchor(parent, pX, pY, pW, pH);
    if (cX + cW < pX) x1 = hasSideSocket ? x1 : pX;
    return { x1, y1, x2, y2 };
  }

  if (childT === 'ai_image') {
    const x2 = cX - NODE_CONNECTOR_OUTSET;
    const y2 = aiImageInputY(child, cY, parent, handleId);
    let { x1, y1 } = parentOutputAnchor(parent, pX, pY, pW, pH);
    if (cX + cW < pX) x1 = hasSideSocket ? x1 : pX;
    return { x1, y1, x2, y2 };
  }

  if (parentT === 'prompt' && childT === 'ai_video') {
    const x2 = cX - NODE_CONNECTOR_OUTSET;
    const y2 = cY + CONNECTOR_Y0;
    let { x1, y1 } = parentOutputAnchor(parent, pX, pY, pW, pH);
    if (cX + cW < pX) x1 = hasSideSocket ? x1 : pX;
    return { x1, y1, x2, y2 };
  }

  if (childT === 'preview') {
    const x2 = cX - NODE_CONNECTOR_OUTSET;
    const y2 = cY + (child.height || 240) / 2;
    let { x1, y1 } = parentOutputAnchor(parent, pX, pY, pW, pH);
    if (cX + cW < pX) x1 = hasSideSocket ? x1 : pX;
    return { x1, y1, x2, y2 };
  }

  let { x1, y1 } = parentOutputAnchor(parent, pX, pY, pW, pH);
  let x2 = cX;
  let y2 = cY + cH / 2;

  if (cX + cW < pX) {
    x1 = hasSideSocket ? x1 : pX;
    x2 = cX + cW;
  } else if (cY + cH < pY) {
    if (!hasSideSocket) {
      x1 = pX + pW / 2;
      y1 = pY;
    }
    x2 = cX + cW / 2;
    y2 = cY + cH;
  } else if (pY + pH < cY) {
    if (!hasSideSocket) {
      x1 = pX + pW / 2;
      y1 = pY + pH;
    }
    x2 = cX + cW / 2;
    y2 = cY;
  }

  return { x1, y1, x2, y2 };
}

/** 由锚点生成 SVG path（已含 +10000 偏移） */
export function buildLinkPathData(x1: number, y1: number, x2: number, y2: number): string {
  const visualX1 = x1 + 10000;
  const visualY1 = y1 + 10000;
  const visualX2 = x2 + 10000;
  const visualY2 = y2 + 10000;
  const isHorizontal = Math.abs(visualX2 - visualX1) > Math.abs(visualY2 - visualY1);
  if (isHorizontal) {
    const ctrlX = (visualX1 + visualX2) / 2;
    return `M ${visualX1} ${visualY1} C ${ctrlX} ${visualY1}, ${ctrlX} ${visualY2}, ${visualX2} ${visualY2}`;
  }
  const ctrlY = (visualY1 + visualY2) / 2;
  return `M ${visualX1} ${visualY1} C ${visualX1} ${ctrlY}, ${visualX2} ${ctrlY}, ${visualX2} ${visualY2}`;
}

/** 曲线中点（画布坐标，无 SVG 偏移）— 断开按钮兜底位置 */
export function getLinkCurveMidpoint(x1: number, y1: number, x2: number, y2: number) {
  const isHorizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
  if (isHorizontal) {
    const ctrlX = (x1 + x2) / 2;
    // t=0.5 三次贝塞尔
    const t = 0.5;
    const u = 1 - t;
    const x = u * u * u * x1 + 3 * u * u * t * ctrlX + 3 * u * t * t * ctrlX + t * t * t * x2;
    const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    return { x, y };
  }
  const ctrlY = (y1 + y2) / 2;
  const t = 0.5;
  const u = 1 - t;
  const x = u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2;
  const y = u * u * u * y1 + 3 * u * u * t * ctrlY + 3 * u * t * t * ctrlY + t * t * t * y2;
  return { x, y };
}
