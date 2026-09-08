/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Playground_2026 根 UI 库
 *
 * 对齐 imagine.art 公开栈：Radix + lucide + clsx
 * 对外导出保持 antd 兼容面，便于插件内渐进替换。
 */

import './styles.css';

export { Button } from './button';
export { Input, InputNumber } from './input';
export { Tooltip } from './tooltip';
export { Modal } from './modal';
export { Dropdown } from './dropdown';
export type { MenuProps } from './dropdown';
export { Popover, Popconfirm } from './popover';
export { Switch, Checkbox, Slider, Select } from './controls';
export {
  Spin,
  Space,
  Badge,
  Tag,
  Empty,
  Segmented,
  Table,
  List,
  Typography,
} from './display';
export { message } from './message';
export { App, Grid } from './provider';

export * from './icons';

/** 根 Provider：主题 + App context */
export { PlaygroundUIProvider } from './playground-ui-provider';
