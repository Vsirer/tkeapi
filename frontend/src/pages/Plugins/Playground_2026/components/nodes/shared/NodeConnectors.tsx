/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 节点连接器（统一左右插座：吸附、可点选、拖线）
 */
import React, { useCallback, useRef, useState } from 'react';
import { flowSocketLabelZh } from '../../../utils/flowSocketLabels';
import { useCanvas } from '../../../context/PlaygroundContext';
import {
  CONNECTOR_MAGNET_SCREEN_PX,
  dispatchConnectorPick,
  type ConnectorPickSide,
} from '../../../utils/flowConnectorCompat';

export type NodeConnectorSocket = {
  /** 内部 handleId（连线兼容）；展示优先 label，否则走中文映射 */
  id: string;
  /** 界面展示名（汉字）；缺省则 flowSocketLabelZh(id) */
  label?: string;
  color: string;
  connected?: boolean;
  required?: boolean;
  /** 左侧「+」增加插座 */
  onAdd?: () => void;
  /** 右侧输出：拖出连线 */
  onConnectStart?: (e: React.MouseEvent) => void;
};

type Props = {
  side: 'left' | 'right';
  sockets: NodeConnectorSocket[];
  visible: boolean;
  /** 相对节点顶边偏移；centerY 时忽略 */
  top?: number;
  gap?: number;
  /** 垂直居中（预览节点 Input） */
  centerY?: boolean;
  /** 所属节点 id（点击选择器 / 磁吸） */
  nodeId: string;
  /** 节点类型：taskData.node_type 或 type */
  nodeType: string;
};

const DRAG_THRESHOLD = 5;

const NodeConnectors: React.FC<Props> = ({
  side,
  sockets,
  visible,
  top = 24,
  gap = 14,
  centerY = false,
  nodeId,
  nodeType,
}) => {
  const {
    connectingSourceId,
    setConnectingSourceId,
    connectingToInput,
    setConnectingToInput,
    setConnectingMousePos,
    canvasRef,
    canvasTransform,
  } = useCanvas();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pressRef = useRef<{
    socketId: string;
    x: number;
    y: number;
    dragged: boolean;
    onConnectStart?: (e: React.MouseEvent) => void;
  } | null>(null);

  const anyConnected = sockets.some((s) => s.connected);
  const show = visible || anyConnected || !!connectingSourceId || !!connectingToInput;

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
        y: (clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
      };
    },
    [canvasRef, canvasTransform],
  );

  const openPicker = useCallback(
    (socketId: string, clientX: number, clientY: number) => {
      const c = toCanvas(clientX, clientY);
      // 新节点落在插座外侧
      const offset = side === 'right' ? 48 : -320;
      dispatchConnectorPick({
        clientX,
        clientY,
        canvasX: c.x + offset,
        canvasY: c.y - 40,
        nodeId,
        handleId: socketId,
        side: side as ConnectorPickSide,
        nodeType,
      });
    },
    [nodeId, nodeType, side, toCanvas],
  );

  const onDotMouseDown = (e: React.MouseEvent, s: NodeConnectorSocket) => {
    e.stopPropagation();
    e.preventDefault();
    pressRef.current = {
      socketId: s.id,
      x: e.clientX,
      y: e.clientY,
      dragged: false,
      onConnectStart: s.onConnectStart,
    };

    const onMove = (ev: MouseEvent) => {
      const p = pressRef.current;
      if (!p) return;
      const dx = ev.clientX - p.x;
      const dy = ev.clientY - p.y;
      if (!p.dragged && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        p.dragged = true;
        if (p.onConnectStart) {
          setConnectingToInput(null);
          setConnectingSourceId(nodeId);
          const c = toCanvas(ev.clientX, ev.clientY);
          setConnectingMousePos(c);
        } else if (side === 'left') {
          // 从入参口反向拖线：松手落到上游节点输出/节点体上完成连线
          setConnectingSourceId(null);
          setConnectingToInput({ nodeId, handleId: p.socketId });
          const c = toCanvas(ev.clientX, ev.clientY);
          setConnectingMousePos(c);
        }
      } else if (p.dragged) {
        const c = toCanvas(ev.clientX, ev.clientY);
        setConnectingMousePos(c);
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const p = pressRef.current;
      pressRef.current = null;
      if (!p) return;
      if (!p.dragged) {
        openPicker(p.socketId, ev.clientX, ev.clientY);
      }
      // 拖线松手由 InfiniteCanvas 全局 mouseup 完成连线
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!sockets.length) return null;

  const magnetActive =
    (!!connectingSourceId && connectingSourceId !== nodeId) ||
    (!!connectingToInput && connectingToInput.nodeId !== nodeId);

  return (
    <>
      <div
        aria-hidden
        className={`pg-flow-connectors-bridge is-${side}`}
        style={{ pointerEvents: show ? 'auto' : 'none' }}
      />
      <div
        className={`pg-flow-connectors is-${side}${centerY ? ' is-center-y' : ''}${magnetActive ? ' is-magnet-ready' : ''}`}
        style={{
          ...(centerY ? {} : { top }),
          gap,
          opacity: show ? 1 : 0,
          pointerEvents: show ? 'auto' : 'none',
        }}
        role="group"
        aria-label={side === 'left' ? '输入连接' : '输出连接'}
        data-connector-node={nodeId}
      >
        {sockets.map((s) => {
          const labelVisible = visible || !!s.connected || hoverId === s.id || magnetActive;
          const isHover = hoverId === s.id;
          const displayLabel = (s.label || '').trim() || flowSocketLabelZh(s.id);
          return (
            <div
              key={s.id}
              className={`pg-flow-connector-row${isHover ? ' is-hover' : ''}${s.connected ? ' is-connected' : ''}`}
              data-handle-id={s.id}
              data-node-id={nodeId}
              data-connector-side={side}
            >
              {side === 'left' && s.onAdd && (
                <button
                  type="button"
                  className="pg-flow-connector-add"
                  style={{ opacity: visible || isHover ? 1 : 0 }}
                  title="增加插座"
                  onClick={(e) => {
                    e.stopPropagation();
                    s.onAdd?.();
                  }}
                >
                  +
                </button>
              )}
              {side === 'left' && (
                <span
                  className="pg-flow-connector-label"
                  style={{ color: s.color, opacity: labelVisible ? 1 : 0 }}
                >
                  {displayLabel}
                  {s.required ? <span style={{ color: s.color }}> *</span> : null}
                </span>
              )}
              <button
                type="button"
                className={`pg-flow-connector-dot${isHover ? ' is-hover' : ''}${s.connected ? ' is-filled' : ''}${magnetActive ? ' is-magnet-target' : ''}`}
                style={
                  {
                    '--dot-color': s.color,
                    borderColor: s.color,
                    background: s.connected || isHover ? s.color : '#1b1b1f',
                  } as React.CSSProperties
                }
                aria-label={`${displayLabel}：${side === 'left' ? '拖到上游节点或点击选择' : '拖动连线或点击选择节点'}`}
                title={
                  side === 'left'
                    ? '拖到上游节点完成连线 · 点击选择可匹配节点'
                    : '点击选择可匹配节点 · 拖动连线'
                }
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId((cur) => (cur === s.id ? null : cur))}
                onMouseDown={(e) => onDotMouseDown(e, s)}
                onClick={(e) => e.stopPropagation()}
              />
              {side === 'right' && (
                <span
                  className="pg-flow-connector-label"
                  style={{ color: s.color, opacity: labelVisible ? 1 : 0 }}
                >
                  {displayLabel}
                  {s.required ? <span style={{ color: s.color }}> *</span> : null}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default NodeConnectors;

/** 连线锚点：插座中心相对节点边的外偏（与 CSS 一致） */
export const NODE_CONNECTOR_OUTSET = 11;

export { CONNECTOR_MAGNET_SCREEN_PX };
