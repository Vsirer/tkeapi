/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片作品前端模型 + localStorage 迁移辅助
 * 持久化以 /playground-2026/outputs 为准
 */
import { importAssets, listAssets } from './assetsApi';

export interface GeneratedImageItem {
  id: string;
  prompt: string;
  createdAt: number;
  previewUrl?: string;
  status: 'pending' | 'done' | 'error';
  model?: string;
  modelMid?: string;
  /**
   * 生成参数快照（灵活 JSON）
   * 扁平 key→value + `_fields: [{key,label}]` 显示名；可选 `reference_urls`
   */
  paramValues?: Record<string, any>;
  /** 展示用比例，如 1:1 */
  aspectRatio?: string;
  resolution?: string;
  /** 失败原因 */
  errorMessage?: string;
  /** 异步任务 id（便于排查 / 异地续轮询） */
  taskId?: string;
  /** 提交时的 X-Log-Id（无 task_id 时走 recover-by-log-id） */
  sysLogId?: string;
  /** 同一批生成的批次 id */
  batchId?: string;
  /** 媒体类型（作品页混合列表） */
  mediaType?: 'image' | 'video' | 'audio';
  /** 是否在收藏夹 */
  isFavorited?: boolean;
  /** 所属分类 id 列表 */
  albumIds?: string[];
  /** 资源来源：生成作品 / 手动上传 */
  sourceType?: 'work' | 'upload';
  /** 文件字节大小（资源库） */
  fileSize?: number;
  /** 具体创建时间字符串（ISO 或格式化文本） */
  createdAtStr?: string;
  /** 完成时间毫秒时间戳 */
  updatedAt?: number;
  /** 具体完成时间字符串 */
  updatedAtStr?: string;
  /** 对象存储 key */
  tosObjectKey?: string;
}

const STORAGE_KEY = 'playground_2026_generated_images';
const MIGRATED_FLAG = 'playground_2026_outputs_migrated_v1';

/** 防止列表页 + 生成页并发触发导致重复导入 */
let migrateInFlight: Promise<GeneratedImageItem[]> | null = null;

/** 读取尚未迁移的本地缓存（仅迁移用） */
function peekLocalGeneratedImages(): GeneratedImageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GeneratedImageItem[]) : [];
  } catch {
    return [];
  }
}

function clearLocalGeneratedImages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 拉取服务端作品列表；若本地仍有旧数据则一次性导入后清空。
 */
export async function loadGeneratedImagesFromServer(): Promise<GeneratedImageItem[]> {
  if (migrateInFlight) return migrateInFlight;

  migrateInFlight = (async () => {
    const remote = await listAssets({ mediaType: 'image', sort: 'recent', sourceType: 'work' });

    if (localStorage.getItem(MIGRATED_FLAG)) {
      return remote;
    }

    const local = peekLocalGeneratedImages().filter(
      (it) => it.status === 'done' && !!it.previewUrl,
    );
    if (local.length === 0) {
      try {
        localStorage.setItem(MIGRATED_FLAG, '1');
      } catch {
        // ignore
      }
      return remote;
    }

    // 服务端已有数据时不再导入，避免重复；仅清本地并打标
    if (remote.length > 0) {
      clearLocalGeneratedImages();
      try {
        localStorage.setItem(MIGRATED_FLAG, '1');
      } catch {
        // ignore
      }
      return remote;
    }

    // 先打标，避免另一标签页/并发请求再跑一遍导入
    try {
      localStorage.setItem(MIGRATED_FLAG, '1');
    } catch {
      // ignore
    }

    try {
      const chunkSize = 50;
      for (let i = 0; i < local.length; i += chunkSize) {
        const chunk = local.slice(i, i + chunkSize);
        await importAssets(
          chunk.map((it) => ({
            media_type: 'image',
            prompt: it.prompt || '',
            model_name: it.model,
            model_mid: it.modelMid,
            param_values: it.paramValues || {},
            aspect_ratio: it.aspectRatio || '',
            resolution: it.resolution || '',
            status: it.status === 'error' ? 'error' : 'done',
            preview_url: it.previewUrl || '',
            error_message: it.errorMessage || '',
            task_id: it.taskId || '',
            created_at_ms: it.createdAt,
          })),
        );
      }
      clearLocalGeneratedImages();
    } catch (e) {
      console.warn('[outputs] localStorage 迁移失败，将在下次重试', e);
      try {
        localStorage.removeItem(MIGRATED_FLAG);
      } catch {
        // ignore
      }
      return remote;
    }

    return listAssets({ mediaType: 'image', sort: 'recent', sourceType: 'work' });
  })().finally(() => {
    migrateInFlight = null;
  });

  return migrateInFlight;
}
