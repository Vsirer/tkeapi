/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 节点操作栏（复制 / 下载 / 信息 / 更多）
 * - 选中：立即显示，取消选中才消失
 * - 未选中悬停约 0.8s：显示；移出隐藏
 * 位置在节点名称/模型名行上方
 */
import React from 'react';
import { Tooltip } from '../../../ui';

interface NodeToolbarProps {
  onDuplicate?: () => void;
  /** 下载当前预览媒体（blob 优先，避免新标签打开） */
  onDownload?: () => void;
  /** 打开右侧属性面板（如预览节点媒体信息） */
  onShowInfo?: () => void;
  canDownload?: boolean;
  /** 末尾三点菜单（重命名/复制/删除） */
  moreMenu?: React.ReactNode;
}

const iconProps = {
  width: 20,
  height: 20,
  fill: 'none' as const,
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** 复制实例 — 与其它工具栏图标同视觉重量、圆角风格 */
const IconDuplicate: React.FC = () => (
  <svg {...iconProps}>
    <rect x="8.25" y="8.25" width="12.5" height="12.5" rx="3.25" />
    <path d="M6.5 16H5.5C3.843 16 2.5 14.657 2.5 13V5.5C2.5 3.843 3.843 2.5 5.5 2.5H13C14.657 2.5 16 3.843 16 5.5V6.5" />
  </svg>
);

const IconDownload: React.FC = () => (
  <svg {...iconProps}>
    <path d="M12 4v10" />
    <path d="M8 10l4 4 4-4" />
    <path d="M5 18h14" />
  </svg>
);

const IconInfo: React.FC = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const NodeToolbar: React.FC<NodeToolbarProps> = ({
  onDuplicate,
  onDownload,
  onShowInfo,
  moreMenu,
}) => {
  return (
    <div
      className="pg-flow-node-tb"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {onDuplicate && (
        <Tooltip title="复制实例">
          <button
            type="button"
            className="pg-flow-node-tb-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            aria-label="复制实例"
          >
            <IconDuplicate />
          </button>
        </Tooltip>
      )}
      {onDownload && (
        <Tooltip title="下载">
          <button
            type="button"
            className="pg-flow-node-tb-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            aria-label="下载"
          >
            <IconDownload />
          </button>
        </Tooltip>
      )}
      {onShowInfo && (
        <Tooltip title="属性信息">
          <button
            type="button"
            className="pg-flow-node-tb-btn"
            onClick={(e) => {
              e.stopPropagation();
              onShowInfo();
            }}
            aria-label="属性信息"
          >
            <IconInfo />
          </button>
        </Tooltip>
      )}
      {moreMenu}
    </div>
  );
};

export default React.memo(NodeToolbar);
