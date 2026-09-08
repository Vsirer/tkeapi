/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { cn } from './lib/cn';
import { Inbox } from 'lucide-react';

export const Spin: React.FC<{
  spinning?: boolean;
  size?: 'small' | 'default' | 'large';
  tip?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ spinning = true, size = 'default', tip, children, className, style }) => {
  const sizeCls = size === 'small' ? 'pg-ui-spin-sm' : size === 'large' ? 'pg-ui-spin-lg' : 'pg-ui-spin-md';
  if (!children) {
    return (
      <div className={cn('pg-ui-spin', sizeCls, className)} style={style}>
        {spinning && <span className="pg-ui-spin-dot" />}
        {tip && <span style={{ fontSize: 13 }}>{tip}</span>}
      </div>
    );
  }
  return (
    <div className={cn('relative', className)} style={style}>
      {children}
      {spinning && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 8,
          }}
        >
          <div className={cn('pg-ui-spin', sizeCls)}>
            <span className="pg-ui-spin-dot" />
            {tip && <span style={{ fontSize: 13 }}>{tip}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export const Space: React.FC<{
  size?: number | 'small' | 'middle' | 'large' | [number, number];
  align?: 'start' | 'end' | 'center' | 'baseline';
  direction?: 'horizontal' | 'vertical';
  wrap?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 'small', align = 'center', direction = 'horizontal', wrap, children, className, style }) => {
  const gap =
    typeof size === 'number'
      ? size
      : Array.isArray(size)
        ? size[0]
        : size === 'large'
          ? 16
          : size === 'middle'
            ? 12
            : 8;
  return (
    <div
      className={cn('pg-ui-space', className)}
      style={{
        display: 'inline-flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
        gap,
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Badge = React.forwardRef<
  HTMLSpanElement,
  {
    count?: number;
    overflowCount?: number;
    offset?: [number, number];
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    dot?: boolean;
    showZero?: boolean;
    [key: string]: any;
  }
>(({ count = 0, overflowCount = 99, offset, children, className, style, dot, showZero, ...restProps }, ref) => {
  const show = showZero ? count >= 0 : count > 0;
  const text = count > overflowCount ? `${overflowCount}+` : String(count);
  return (
    <span ref={ref} className={cn('pg-ui-badge', className)} style={style} {...restProps}>
      {children}
      {show && (
        <span
          className="pg-ui-badge-count"
          style={
            offset
              ? { transform: `translate(${offset[0]}px, ${offset[1]}px)` }
              : undefined
          }
        >
          {dot ? '' : text}
        </span>
      )}
    </span>
  );
});
Badge.displayName = 'Badge';

export const Tag: React.FC<{
  color?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bordered?: boolean;
  icon?: React.ReactNode;
}> = ({ color, children, className, style, icon }) => (
  <span
    className={cn('pg-ui-tag', className)}
    style={{
      ...(color
        ? {
            background: color.startsWith('#') || color.startsWith('rgb') ? `${color}22` : undefined,
            borderColor: color,
            color,
          }
        : null),
      ...style,
    }}
  >
    {icon}
    {children}
  </span>
);

export const Empty: React.FC<{
  description?: React.ReactNode;
  image?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> & { PRESENTED_IMAGE_SIMPLE: React.ReactNode } = ({
  description = '暂无数据',
  image,
  children,
  className,
  style,
}) => (
  <div className={cn('pg-ui-empty', className)} style={style}>
    {image === Empty.PRESENTED_IMAGE_SIMPLE || image == null ? (
      <Inbox size={40} strokeWidth={1.25} opacity={0.45} />
    ) : (
      image
    )}
    <div style={{ fontSize: 13 }}>{description}</div>
    {children}
  </div>
);
Empty.PRESENTED_IMAGE_SIMPLE = true;

export const Segmented: React.FC<{
  options: Array<string | { label: React.ReactNode; value: string | number; disabled?: boolean }>;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string | number) => void;
  size?: 'small' | 'middle' | 'large';
  block?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ options, value, defaultValue, onChange, block, className, style }) => {
  const [inner, setInner] = React.useState(defaultValue ?? (typeof options[0] === 'object' ? options[0].value : options[0]));
  const current = value ?? inner;
  return (
    <div className={cn('pg-ui-segmented', block && 'w-full', className)} style={style}>
      {options.map((opt) => {
        const item = typeof opt === 'object' ? opt : { label: opt, value: opt };
        const active = current === item.value;
        return (
          <button
            key={String(item.value)}
            type="button"
            className="pg-ui-segmented-item"
            data-active={active ? 'true' : 'false'}
            disabled={item.disabled}
            style={block ? { flex: 1 } : undefined}
            onClick={() => {
              setInner(item.value);
              onChange?.(item.value);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
};

export interface TableColumn<T = any> {
  title?: React.ReactNode;
  dataIndex?: string;
  key?: string;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  width?: number | string;
}

export const Table = <T extends Record<string, any>>({
  dataSource = [],
  columns = [],
  pagination = false,
  size,
  className,
  style,
  rowKey,
}: {
  dataSource?: T[];
  columns?: TableColumn<T>[];
  pagination?: false | object;
  size?: 'small' | 'middle' | 'large';
  className?: string;
  style?: React.CSSProperties;
  rowKey?: string | ((r: T) => string);
}) => {
  void pagination;
  void size;
  return (
    <table className={cn('pg-ui-table', className)} style={style}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={c.key || c.dataIndex || i} style={{ width: c.width }}>
              {c.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dataSource.map((row, idx) => {
          const key =
            typeof rowKey === 'function'
              ? rowKey(row)
              : String((rowKey && row[rowKey]) || row.key || idx);
          return (
            <tr key={key}>
              {columns.map((c, i) => {
                const val = c.dataIndex ? row[c.dataIndex] : undefined;
                return (
                  <td key={c.key || c.dataIndex || i}>
                    {c.render ? c.render(val, row, idx) : val}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export const List: React.FC<{
  dataSource?: any[];
  renderItem?: (item: any, index: number) => React.ReactNode;
  itemLayout?: 'horizontal' | 'vertical';
  split?: boolean;
  size?: 'small' | 'default' | 'large';
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  locale?: { emptyText?: React.ReactNode };
  header?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
}> = ({ dataSource = [], renderItem, className, style, header, footer }) => (
  <div className={className} style={style}>
    {header}
    {dataSource.map((item, i) => (
      <React.Fragment key={item?.id ?? item?.key ?? i}>
        {renderItem ? renderItem(item, i) : null}
      </React.Fragment>
    ))}
    {footer}
  </div>
);

const Text: React.FC<{
  type?: 'secondary' | 'success' | 'warning' | 'danger';
  ellipsis?: boolean | { rows?: number };
  strong?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
}> = ({ type, ellipsis, strong, children, className, style, onClick }) => (
  <span
    className={cn('pg-ui-typography-text', className)}
    data-type={type}
    data-ellipsis={ellipsis ? 'true' : undefined}
    style={{ fontWeight: strong ? 600 : undefined, ...style }}
    onClick={onClick}
  >
    {children}
  </span>
);

const Title: React.FC<{
  level?: 1 | 2 | 3 | 4 | 5;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ level = 3, children, className, style }) => {
  const sizes = { 1: 28, 2: 22, 3: 18, 4: 16, 5: 14 };
  const styleMerged = { fontSize: sizes[level], ...style };
  if (level === 1) return <h1 className={cn('pg-ui-typography-title', className)} style={styleMerged}>{children}</h1>;
  if (level === 2) return <h2 className={cn('pg-ui-typography-title', className)} style={styleMerged}>{children}</h2>;
  if (level === 4) return <h4 className={cn('pg-ui-typography-title', className)} style={styleMerged}>{children}</h4>;
  if (level === 5) return <h5 className={cn('pg-ui-typography-title', className)} style={styleMerged}>{children}</h5>;
  return <h3 className={cn('pg-ui-typography-title', className)} style={styleMerged}>{children}</h3>;
};

const Paragraph: React.FC<{
  children?: React.ReactNode;
  type?: 'secondary';
  className?: string;
  style?: React.CSSProperties;
  ellipsis?: boolean;
}> = ({ children, type, className, style, ellipsis }) => (
  <p
    className={cn('pg-ui-typography-text', className)}
    data-type={type}
    data-ellipsis={ellipsis ? 'true' : undefined}
    style={{ margin: 0, ...style }}
  >
    {children}
  </p>
);

export const Typography = { Text, Title, Paragraph };
