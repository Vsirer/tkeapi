/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 作品/资源卡片网格：等宽等高（auto-fill），不再按比例瀑布错落
 */
import React from 'react';

type MasonryColumnsProps = {
  minColumnWidth?: number;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

const MasonryColumns: React.FC<MasonryColumnsProps> = ({
  minColumnWidth = 220,
  gap = 12,
  className,
  style,
  children,
}) => {
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <div
      className={['pg-ig-uniform-grid', className].filter(Boolean).join(' ')}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
        gap,
        width: '100%',
        alignItems: 'stretch',
        ...style,
      }}
    >
      {items}
    </div>
  );
};

export default MasonryColumns;
