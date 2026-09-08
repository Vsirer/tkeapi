/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片生成页参考图 / 资源库上传
 * 后端路径：{path_prefix}/p2026{uid}/assets/uploads/{yyyy-mm-dd}/{uuid}.{ext}
 * 数量上限优先读方案 IO reference_images.max，再回落 max_reference_images
 */
import request from '../../../../utils/request';
import type { PlaygroundModel } from '../types';
import { resolveReferenceImagesMax } from './schemeIo';

/** 从模型/方案解析最大参考图数量（非法或缺失时回落默认） */
export function resolveMaxReferenceImages(
  model?: (PlaygroundModel | { max_reference_images?: number | null; inputs?: PlaygroundModel['inputs'] }) | null,
): number {
  return resolveReferenceImagesMax(model as PlaygroundModel | null | undefined);
}

const ACCEPT_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export function isAcceptableReferenceFile(file: File): boolean {
  if (ACCEPT_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif')
  );
}

/** 粘贴截图 / 复制的图片：优先 files，再扫 items（部分浏览器只填 items） */
export function filesFromClipboardData(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const push = (file: File | null) => {
    if (!file) return;
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };
  for (const f of Array.from(data.files || [])) push(f);
  for (const item of Array.from(data.items || [])) {
    if (item.kind === 'file') push(item.getAsFile());
  }
  return out;
}

const VIDEO_UPLOAD_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const AUDIO_UPLOAD_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];

function isAcceptableVideoUploadFile(file: File): boolean {
  if (VIDEO_UPLOAD_TYPES.includes(file.type) || file.type.startsWith('video/')) return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov');
}

function isAcceptableAudioUploadFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  const name = file.name.toLowerCase();
  return AUDIO_UPLOAD_EXTS.some((e) => name.endsWith(e));
}

function isAcceptableResourceUploadFile(file: File): boolean {
  if (isAcceptableReferenceFile(file)) return true;
  if (isAcceptableVideoUploadFile(file)) return true;
  if (isAcceptableAudioUploadFile(file)) return true;
  return false;
}

async function postReferenceUpload(
  file: File,
): Promise<{ url: string; resourceId?: string; mediaType?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res: any = await request.post('/playground-2026/project-assets/reference-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    skipErrorHandler: true,
  } as any);
  const url = res?.url;
  if (!url || typeof url !== 'string') {
    throw new Error('上传成功但未返回文件地址');
  }
  const resourceId =
    res?.resource_id != null && res.resource_id !== ''
      ? String(res.resource_id)
      : undefined;
  const mediaType = typeof res?.media_type === 'string' ? res.media_type : undefined;
  return { url, resourceId, mediaType };
}

export async function uploadStandaloneReference(file: File): Promise<string> {
  if (!isAcceptableReferenceFile(file)) {
    throw new Error('仅支持 PNG / JPG / WEBP / GIF 图片');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('单张参考图不能超过 20MB');
  }
  const { url } = await postReferenceUpload(file);
  return url;
}

/** 资源库「上传」页：图片、视频与参考音频（登记为 source_type=upload） */
async function uploadResourceFile(file: File): Promise<string> {
  if (!isAcceptableResourceUploadFile(file)) {
    throw new Error('仅支持 PNG / JPG / WEBP / GIF 图片、MP4 / WEBM / MOV 视频或 MP3 / WAV / M4A 音频');
  }
  const isVideo = isAcceptableVideoUploadFile(file);
  const isAudio = !isVideo && isAcceptableAudioUploadFile(file);
  const maxBytes = isVideo ? 50 * 1024 * 1024 : isAudio ? 15 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      isVideo ? '单个视频不能超过 50MB' : isAudio ? '单个音频不能超过 15MB' : '单张图片不能超过 20MB',
    );
  }
  const { url } = await postReferenceUpload(file);
  return url;
}

/** 同上，额外返回 resource_id（Prompt 附件等需要） */
export async function uploadResourceFileDetailed(
  file: File,
): Promise<{ url: string; resourceId?: string; mediaType: 'image' | 'video' | 'audio' }> {
  if (!isAcceptableResourceUploadFile(file)) {
    throw new Error('仅支持 PNG / JPG / WEBP / GIF 图片、MP4 / WEBM / MOV 视频或 MP3 / WAV / M4A 音频');
  }
  const isVideo = isAcceptableVideoUploadFile(file);
  const isAudio = !isVideo && isAcceptableAudioUploadFile(file);
  const maxBytes = isVideo ? 50 * 1024 * 1024 : isAudio ? 15 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      isVideo ? '单个视频不能超过 50MB' : isAudio ? '单个音频不能超过 15MB' : '单张图片不能超过 20MB',
    );
  }
  const { url, resourceId, mediaType } = await postReferenceUpload(file);
  const kind: 'image' | 'video' | 'audio' =
    mediaType === 'video' || isVideo
      ? 'video'
      : mediaType === 'audio' || isAudio
        ? 'audio'
        : 'image';
  return { url, resourceId, mediaType: kind };
}

/** 工作流「素材」节点支持的种类 */
export type WorkflowAssetKind = 'image' | 'video' | 'audio' | 'document';

const DOC_EXTS = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
  '.rtf',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
];

export function classifyWorkflowAssetFile(file: File): WorkflowAssetKind | null {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (isAcceptableReferenceFile(file) || mime.startsWith('image/')) return 'image';
  if (
    VIDEO_UPLOAD_TYPES.includes(mime) ||
    mime.startsWith('video/') ||
    name.endsWith('.mp4') ||
    name.endsWith('.webm') ||
    name.endsWith('.mov')
  ) {
    return 'video';
  }
  if (mime.startsWith('audio/') || AUDIO_UPLOAD_EXTS.some((e) => name.endsWith(e))) return 'audio';
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('msword') ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    DOC_EXTS.some((e) => name.endsWith(e))
  ) {
    return 'document';
  }
  return null;
}

/** 项目关联上传（音频 / 文档等；后端不限 MIME） */
async function postProjectAssetUpload(
  file: File,
  projectId: number,
): Promise<{ url: string; resourceId?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', String(projectId));
  const res: any = await request.post('/playground-2026/project-assets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    skipErrorHandler: true,
  } as any);
  const url = res?.file_url || res?.url;
  if (!url || typeof url !== 'string') {
    throw new Error('上传成功但未返回文件地址');
  }
  const resourceId =
    res?.library_asset_id != null && res.library_asset_id !== ''
      ? String(res.library_asset_id)
      : res?.resource_id != null && res.resource_id !== ''
        ? String(res.resource_id)
        : undefined;
  return { url, resourceId };
}

/**
 * 工作流素材节点统一上传：
 * - 图片/视频 → 独立 uploads（进资源库）
 * - 音频：独立页无 project_id 时走 reference-upload；工作流内挂到项目
 * - 文档 → 项目 uploads 并挂 library_asset_id
 */
export async function uploadWorkflowAssetFile(
  file: File,
  projectId?: number | null,
): Promise<{ url: string; kind: WorkflowAssetKind; resourceId?: string }> {
  const kind = classifyWorkflowAssetFile(file);
  if (!kind) {
    throw new Error('仅支持图片、视频、音频或 PDF/Word 等文档');
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('单个文件不能超过 50MB');
  }
  if (kind === 'image' || kind === 'video') {
    const { url, resourceId } = await uploadResourceFileDetailed(file);
    return { url, kind, resourceId };
  }
  if (kind === 'audio' && !projectId) {
    const { url, resourceId } = await uploadResourceFileDetailed(file);
    return { url, kind, resourceId };
  }
  if (!projectId) {
    throw new Error('无法关联当前工作流，请刷新后重试');
  }
  const { url, resourceId } = await postProjectAssetUpload(file, projectId);
  return { url, kind, resourceId };
}
