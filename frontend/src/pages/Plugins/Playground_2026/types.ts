/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Playground 类型定义中心
 * 所有模块从此处 import 类型，避免循环依赖
 */

/** 方案参数定义 */
export interface SchemeParam {
  key: string;
  label: string;
  type: 'radio' | 'select' | 'switch' | 'number' | 'input' | 'slider';
  options?: (string | number)[];
  default: any;
  unit?: string;
  hint?: string;
  /** 参数功能描述或菜单说明 */
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** 选项展示文案映射，例如 { "opaque": "不透明", "transparent": "透明" } */
  option_labels?: Record<string, string>;
  /** 独立图片/视频生成页提示词下快捷栏；最多 3 个，顺序即 params 数组顺序 */
  quick?: boolean;
  /** 展示风格：segmented=分段按钮（默认），radio=圆点单选，pill=胶囊数值 */
  display_style?: 'segmented' | 'radio' | 'pill' | string;
  /** 参数分组标题，如 "More options" */
  group?: string;
  /** 是否隐藏参数头部标签（如比例网格自说明） */
  hide_label?: boolean;
}

/** 图片方案专用：比例、宽高、分辨率档位（默认关闭） */
type ImageSpecialSection = {
  enabled?: boolean;
  /** 写入请求 / 方案参数的字段名 */
  key?: string;
  /** 是否把该字段写入上游接口；默认 true */
  in_request?: boolean;
  options?: string[];
  default?: string;
};

/** 分辨率 → 比例 → 宽高（如 2048x2048） */
export type ImageSpecialSizeMap = Record<string, Record<string, string>>;

/** 指定宽高像素值（方式 2）：总像素与宽高比区间 */
export type ImageSpecialCustomPixels = {
  enabled?: boolean;
  min_pixels?: number;
  max_pixels?: number;
  /** 如 1:16，表示宽/高下限 */
  min_aspect?: string;
  /** 如 16:1，表示宽/高上限 */
  max_aspect?: string;
  /** 边长倍数，官方文档未要求对齐，默认 1 */
  step?: number;
};

type ImageSpecialSizeSection = {
  enabled?: boolean;
  key?: string;
  in_request?: boolean;
  /** 关联配置：分辨率 × 比例 对应的像素尺寸 */
  size_map?: ImageSpecialSizeMap;
  custom?: ImageSpecialCustomPixels;
};

export type ImageSpecialParamsConfig = {
  enabled?: boolean;
  /** @deprecated 旧配置单字段；新配置用各项 key */
  bind_key?: string;
  aspect_ratio?: ImageSpecialSection;
  image_size?: ImageSpecialSizeSection;
  resolution?: ImageSpecialSection;
};

/** 方案工作流插槽（input / output） */
export type SchemePortModality = 'text' | 'image' | 'video' | 'audio' | 'file';

/** 素材节点可限制的文件类型（accepts 含 asset 时生效） */
export type SchemeAssetKind = 'image' | 'video' | 'audio' | 'document';

export interface SchemePort {
  key: string;
  label: string;
  enabled: boolean;
  modality: SchemePortModality;
  handle_prefix: string;
  /** input：写入 taskData / 请求的字段；可选手填或与 params.key 一致 */
  bind_key?: string;
  /** output：写入 resultData 的字段 */
  result_key?: string;
  accepts?: string[];
  /**
   * 当 accepts 含 asset 时：允许的素材文件类型。
   * 未配置时运行时回落为口 modality（image/video/audio）。
   */
  accept_asset_kinds?: SchemeAssetKind[];
  required?: boolean;
  max?: number;
  min?: number;
  expandable?: boolean;
  default_count?: number;
}

/** 模型级 IO 覆写：按口 key 打补丁 */
export type SchemeIoOverrides = {
  inputs?: { modify?: Record<string, Partial<SchemePort>> };
  outputs?: { modify?: Record<string, Partial<SchemePort>> };
};

/** 体验模型定义 */
export interface PlaygroundModel {
  id?: number;
  mid: string;
  name: string;
  model_id: string;
  description?: string;
  desc?: string;
  logo?: string;
  type_name: string;
  /** 模型品牌（model_providers.name） */
  provider_id?: number | null;
  provider_name?: string;
  scheme_id: string;
  scheme_name: string;
  scheme_type: string;
  /** 方案固定字段：最大参考图数量（兼容旧配置；优先读 inputs.reference_images.max） */
  max_reference_images?: number;
  endpoint?: string;
  poll_endpoint?: string;
  params: SchemeParam[];
  /** 合并后的工作流入参口 */
  inputs?: SchemePort[];
  /** 合并后的工作流出参口 */
  outputs?: SchemePort[];
  billing?: any;
  global_discount?: number;
  global_discount_enabled?: number;
  /** 排序权重 */
  sort_order?: number;
  /** 创作中心2026 功能特性 key（playground-public-config） */
  feature_keys?: string[];
  /** 后台是否设为默认展示 */
  is_default?: boolean;
  /** 图片方案「图片专用参数配置」（比例 / 尺寸 / 分辨率） */
  image_special_params?: ImageSpecialParamsConfig;
}

/** 画布节点定义 */
export interface CanvasNode {
  id: string;
  type: 'video' | 'image' | 'text' | 'audio' | 'section';
  status: 'loading' | 'completed' | 'error';
  taskData: any;
  resultData: any;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isHidden?: boolean;
  parentId?: string;
  isInstance?: boolean;
  childrenNodeIds?: string[];
  title?: string;
  backgroundColor?: string;
  inputConnections?: Record<string, string>;
}

/** 画布变换状态 */
export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

/** 活跃工具类型 */
export type ActiveTool = 'pointer' | 'hand' | 'marquee' | 'section';

/** 二维坐标 */
export interface Point {
  x: number;
  y: number;
}

/** 体验中心项目 */
export interface PlaygroundProject {
  id: number;
  uid: string;
  name: string;
  description: string;
  cover_url: string;
  canvas_data: string;
  created_at: string;
  updated_at: string;
  asset_count?: number;
  work_count?: number;
}

/** 体验中心资源 */
interface PlaygroundAsset {
  id: number;
  asset_type: 'image' | 'video' | 'text' | 'audio';
  file_name: string;
  file_size: number;
  file_url: string;
  thumbnail_url: string;
  prompt: string;
  model_id: string;
  model_name: string;
  canvas_node_data: string;
  duration_seconds: number;
  width: number;
  height: number;
  created_at: string;
}
