/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 节点三点菜单：删除
 * 亦可由画布右键通过 requestNodeMoreMenu 打开（菜单锚在鼠标位置）
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from '../../../ui';
import type { MenuProps } from '../../../ui';
import type { CanvasNode } from '../../../types';

const NODE_MORE_MENU_EVENT = 'pg-flow-node-more';

type NodeMoreMenuEventDetail = {
  nodeId: string;
  clientX?: number;
  clientY?: number;
};

/** 画布右键等处：打开指定节点的更多操作菜单 */
export function requestNodeMoreMenu(nodeId: string, pos?: { clientX: number; clientY: number }) {
  window.dispatchEvent(
    new CustomEvent(NODE_MORE_MENU_EVENT, {
      detail: { nodeId, clientX: pos?.clientX, clientY: pos?.clientY } satisfies NodeMoreMenuEventDetail,
    }),
  );
}

type Props = {
  node: CanvasNode;
  /** 默认标题（无自定义名时）；保留以兼容调用方 */
  defaultTitle: string;
  onRemove: (id: string) => void;
  updateNodeTaskData: (patch: Record<string, any>) => void;
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
  saveCanvasState: (nodes: CanvasNode[]) => void;
  /** 紧凑按钮（用于顶栏工具条） */
  compact?: boolean;
  /** 隐藏触发按钮但仍挂载（供右键唤起） */
  hideTrigger?: boolean;
  /** 不响应画布右键唤起（选中时由工具条菜单接管） */
  ignoreRemote?: boolean;
};

const IconMore: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M8.00016 9.3335C8.35378 9.3335 8.69292 9.19302 8.94297 8.94297C9.19302 8.69292 9.3335 8.35378 9.3335 8.00016C9.3335 7.64654 9.19302 7.3074 8.94297 7.05735C8.69292 6.80731 8.35378 6.66683 8.00016 6.66683C7.64654 6.66683 7.3074 6.80731 7.05735 7.05735C6.80731 7.3074 6.66683 7.64654 6.66683 8.00016C6.66683 8.35378 6.80731 8.69292 7.05735 8.94297C7.3074 9.19302 7.64654 9.3335 8.00016 9.3335Z"
      fill="currentColor"
    />
    <path
      d="M13.3335 9.3335C13.6871 9.3335 14.0263 9.19302 14.2763 8.94297C14.5264 8.69292 14.6668 8.35378 14.6668 8.00016C14.6668 7.64654 14.5264 7.3074 14.2763 7.05735C14.0263 6.80731 13.6871 6.66683 13.3335 6.66683C12.9799 6.66683 12.6407 6.80731 12.3907 7.05735C12.1406 7.3074 12.0002 7.64654 12.0002 8.00016C12.0002 8.35378 12.1406 8.69292 12.3907 8.94297C12.6407 9.19302 12.9799 9.3335 13.3335 9.3335Z"
      fill="currentColor"
    />
    <path
      d="M2.66683 9.3335C3.02045 9.3335 3.35959 9.19302 3.60964 8.94297C3.85969 8.69292 4.00016 8.35378 4.00016 8.00016C4.00016 7.64654 3.85969 7.3074 3.60964 7.05735C3.35959 6.80731 3.02045 6.66683 2.66683 6.66683C2.31321 6.66683 1.97407 6.80731 1.72402 7.05735C1.47397 7.3074 1.3335 7.64654 1.3335 8.00016C1.3335 8.35378 1.47397 8.69292 1.72402 8.94297C1.97407 9.19302 2.31321 9.3335 2.66683 9.3335Z"
      fill="currentColor"
    />
  </svg>
);

export function getNodeDisplayTitle(node: CanvasNode, fallback: string): string {
  const label = node.taskData?.label || node.taskData?.node_title || node.title;
  if (typeof label === 'string' && label.trim()) return label.trim();
  return fallback;
}

const NodeMoreMenu: React.FC<Props> = ({
  node,
  onRemove,
  compact,
  hideTrigger,
  ignoreRemote,
}) => {
  const [open, setOpen] = React.useState(false);
  /** 右键唤起时锚点（viewport 坐标）；点击三点按钮时为 null */
  const [cursorPos, setCursorPos] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (ignoreRemote) {
      setOpen(false);
      setCursorPos(null);
      return;
    }
    const onRequest = (ev: Event) => {
      const detail = (ev as CustomEvent<NodeMoreMenuEventDetail>).detail;
      if (detail?.nodeId === node.id) {
        if (typeof detail.clientX === 'number' && typeof detail.clientY === 'number') {
          setCursorPos({ x: detail.clientX, y: detail.clientY });
        } else {
          setCursorPos(null);
        }
        setOpen(true);
      } else {
        setOpen(false);
        setCursorPos(null);
      }
    };
    window.addEventListener(NODE_MORE_MENU_EVENT, onRequest);
    return () => window.removeEventListener(NODE_MORE_MENU_EVENT, onRequest);
  }, [node.id, ignoreRemote]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setCursorPos(null);
  };

  const items: MenuProps['items'] = [
    { key: 'delete', label: <span style={{ color: '#f87171' }}>删除</span> },
  ];

  const onClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    if (key === 'delete') onRemove(node.id);
  };

  const menuProps = { items, onClick };
  const dropdownShared = {
    menu: menuProps,
    overlayClassName: 'shadcn-dropdown dark',
    overlayStyle: { zIndex: 3200 } as React.CSSProperties,
  };

  const buttonOpen = open && !cursorPos;
  const cursorOpen = open && !!cursorPos;

  return (
    <>
      <Dropdown
        {...dropdownShared}
        trigger={['click']}
        open={buttonOpen}
        onOpenChange={(next) => {
          if (cursorPos) return;
          handleOpenChange(next);
        }}
        placement="bottomRight"
      >
        <button
          type="button"
          className={compact ? 'pg-flow-node-tb-btn' : 'pg-flow-node-more'}
          aria-label="更多操作"
          title="更多操作"
          aria-hidden={hideTrigger || undefined}
          tabIndex={hideTrigger ? -1 : undefined}
          style={hideTrigger ? { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setCursorPos(null);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <IconMore size={compact ? 16 : 14} />
        </button>
      </Dropdown>

      {cursorPos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: cursorPos.x,
              top: cursorPos.y,
              width: 1,
              height: 1,
              zIndex: 3200,
              pointerEvents: 'none',
            }}
          >
            <Dropdown
              {...dropdownShared}
              open={cursorOpen}
              onOpenChange={handleOpenChange}
              placement="bottomLeft"
              getPopupContainer={() => document.body}
            >
              <span
                aria-hidden
                style={{
                  display: 'block',
                  width: 1,
                  height: 1,
                  pointerEvents: 'none',
                }}
              />
            </Dropdown>
          </div>,
          document.body,
        )}
    </>
  );
};

export default NodeMoreMenu;
