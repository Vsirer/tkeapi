/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 🎨 AI 图片生成节点
 * 从 CanvasNode.tsx 提取的独立组件，按 Kling 3.0 风格进行了全新设计重构
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from '../PlaygroundToast';
import generateUUID from '../../../../../utils/uuid';
import { usePlayground, useCanvas } from '../../context/PlaygroundContext';
import { LoadingOutlined, Tooltip } from '../../ui';
import request from '../../../../../utils/request';
import { extractImageDisplayUrls, getResultDisplayUrl } from '../../utils/resultExtractor';
import { collectDirectorDownstreamUrls } from '../director_stage/directorScene';
import type { AdvancedNodeProps } from './shared/types';
import NodeMoreMenu, { getNodeDisplayTitle } from './shared/NodeMoreMenu';
import NodeTitleInline from './shared/NodeTitleInline';
import NodeConnectors, { type NodeConnectorSocket } from './shared/NodeConnectors';
import { FlowIconImage } from '../flow/flowIcons';
import {
  pickSavedTokenKey,
  shouldOmitOpenAiImageExtraParam,
  applyImageGenerationParam,
  coerceSizeForLayerDecomposition,
} from '../../utils/imageGenerationApi';
import {
  applyImageSpecialRequestPack,
  imageSpecialOmitRequestKeys,
  imageSpecialParamKeys,
} from '../../utils/imageSpecialParams';
import {
  clearNodeSubmitPending,
  markNodeSubmitPending,
} from '../../hooks/useGeneration';
import {
  ensureRemoteUrlMap,
  remapUrls,
} from '../../utils/deferredLocalUpload';
import { isBlobUrl } from '../../utils/localFileRegistry';
import type { SchemePort } from '../../types';
import {
  collectUrlsForPort,
  enabledPorts,
  findStaleInputConnections,
  isReferenceMediaPort,
  listHandlesForPort,
  modalitySocketColor,
  resolveModelIo,
} from '../../utils/schemeIo';
import {
  mergePortUrlsWithManual,
  remapManualMediaInTaskData,
} from '../../utils/flowManualRefs';
import { resolveConnectSourceMedia } from '../../utils/flowConnectDragHighlight';
import { flowPortSocketLabel } from '../../utils/flowSocketLabels';
import MentionPromptField from '../MentionPromptField';
import {
  buildFlowMentionAssets,
  collectGenNodeMentionItems,
} from '../../utils/flowSlotMentionAssets';

const AiImageNode: React.FC<AdvancedNodeProps> = ({
  node,
  nodes,
  isLight,
  onRemove,
  updateNodeTaskData,
  setNodes,
  saveCanvasState,
  selectedTokenKey: selectedTokenKeyProp,
  isSelected,
}) => {
  const { models, selectedTokenKey: contextTokenKey, apiTokens, currentProjectId } = usePlayground();
  const { connectingSourceId, setConnectingSourceId, setConnectingMousePos, canvasRef, canvasTransform } = useCanvas();
  const [enhanceProcessing, setEnhanceProcessing] = useState(false);
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const showSockets =
    !!isSelected ||
    isNodeHovered ||
    !!(connectingSourceId && connectingSourceId !== node.id);

  /** 底栏密钥优先，其次 props / localStorage / 节点上次使用 */
  const resolveTokenKey = () =>
    contextTokenKey ||
    selectedTokenKeyProp ||
    pickSavedTokenKey(apiTokens || []) ||
    (typeof node.taskData?.token_key === 'string' ? node.taskData.token_key : '') ||
    '';

  const defaultTitle = `图片 ${node.id.split('-').pop()?.slice(-3) || '1'}`;
  const nodeTitle = getNodeDisplayTitle(node, defaultTitle);
  const modelName = node.taskData?.modelName || node.taskData?.model || '未选择模型';
  const modelObj = (models || []).find(m => m.mid === node.taskData?.modelMid || m.name === node.taskData?.model || m.model_id === node.taskData?.model);

  const io = useMemo(() => resolveModelIo(modelObj, 'image'), [modelObj]);

  useEffect(() => {
    if (!modelObj) return;
    const nextInputs = io.allInputs;
    const nextOutputs = io.allOutputs;
    const prevInputs = node.taskData?.io_inputs;
    const prevOutputs = node.taskData?.io_outputs;
    const sameInputs = JSON.stringify(prevInputs ?? null) === JSON.stringify(nextInputs);
    const sameOutputs = JSON.stringify(prevOutputs ?? null) === JSON.stringify(nextOutputs);
    const sameScheme = node.taskData?.scheme_id === modelObj.scheme_id;
    if (sameInputs && sameOutputs && sameScheme) return;
    updateNodeTaskData({
      io_inputs: nextInputs,
      io_outputs: nextOutputs,
      scheme_id: modelObj.scheme_id,
    });
  }, [modelObj?.mid, modelObj?.scheme_id, io.allInputs, io.allOutputs]);

  const effectiveInputs: SchemePort[] = useMemo(() => {
    if (Array.isArray(node.taskData?.io_inputs) && node.taskData.io_inputs.length) {
      return node.taskData.io_inputs as SchemePort[];
    }
    return io.allInputs;
  }, [node.taskData?.io_inputs, io.allInputs]);

  const effectiveOutputs: SchemePort[] = useMemo(() => {
    if (Array.isArray(node.taskData?.io_outputs) && node.taskData.io_outputs.length) {
      return node.taskData.io_outputs as SchemePort[];
    }
    return io.allOutputs;
  }, [node.taskData?.io_outputs, io.allOutputs]);

  const displayParams = useMemo(() => {
    if (!modelObj?.params || !Array.isArray(modelObj.params)) return [];
    return modelObj.params.filter((p: any) => 
      p.key !== 'prompt' && 
      p.key !== 'negative_prompt' && 
      p.key !== 'negativePrompt' &&
      p.type !== 'textarea'
    );
  }, [modelObj]);

  const promptPort = useMemo(
    () =>
      enabledPorts(effectiveInputs).find(
        (p) => p.key === 'prompt' || p.bind_key === 'prompt',
      ) ||
      enabledPorts(effectiveInputs).find((p) => p.modality === 'text'),
    [effectiveInputs],
  );
  const promptHandlePrefix = promptPort?.handle_prefix || 'Prompt';

  const referencePort = useMemo(
    () =>
      enabledPorts(effectiveInputs).find(
        (p) =>
          p.key === 'reference_images' ||
          p.bind_key === 'image_urls' ||
          p.bind_key === 'reference_urls',
      ) ||
      enabledPorts(effectiveInputs).find((p) => p.modality === 'image'),
    [effectiveInputs],
  );
  const referenceEnabled = !!referencePort;

  // 1. 解析提示词：优先插座连线，再回退 parent/同级（旧树结构）
  const connectedPromptNode = useMemo(() => {
    const connectedId =
      node.inputConnections?.[promptHandlePrefix] ||
      node.inputConnections?.['Prompt'];
    if (!connectedId) return null;
    return (nodes || []).find(n => n.id === connectedId && n.taskData?.node_type === 'prompt' && !n.isHidden) || null;
  }, [nodes, node.inputConnections, promptHandlePrefix]);

  const parentPromptNode = useMemo(() => {
    if (!node.parentId) return null;
    return (nodes || []).find(n => n.id === node.parentId && n.taskData?.node_type === 'prompt' && !n.isHidden) || null;
  }, [nodes, node.parentId]);

  const siblingPromptNode = useMemo(() => {
    if (!node.parentId) return null;
    return (nodes || []).find(n => n.parentId === node.parentId && n.taskData?.node_type === 'prompt' && !n.isHidden) || null;
  }, [nodes, node.parentId]);

  const externalPromptNode = connectedPromptNode || parentPromptNode || siblingPromptNode;
  const effectivePrompt =
    (typeof externalPromptNode?.taskData?.prompt === 'string' ? externalPromptNode.taskData.prompt : '') ||
    (typeof node.taskData?.prompt === 'string' ? node.taskData.prompt : '') ||
    '';

  // 2. 递归寻找输入源图片 (用于图生图 / UI 连线态)
  const findSourceImageNode = useCallback((currNodeId: string | undefined): any => {
    if (!currNodeId) return null;
    const parent = (nodes || []).find(n => n.id === currNodeId);
    if (!parent || parent.isHidden) return null;
    const url = getResultDisplayUrl(parent.type, parent.resultData);
    if (url && (parent.type === 'image' || parent.taskData?.node_type === 'ai_image' || parent.taskData?.node_type === 'asset' || parent.taskData?.node_type === 'director')) return parent;
    // 素材节点可能只有 files、主 URL 尚未写入
    if (parent.taskData?.node_type === 'asset' && Array.isArray(parent.taskData?.files) && parent.taskData.files.length > 0) {
      return parent;
    }
    if (parent.taskData?.node_type === 'director' && Array.isArray(parent.taskData?.files) && parent.taskData.files.length > 0) {
      return parent;
    }
    return findSourceImageNode(parent.parentId);
  }, [nodes]);

  const absoluteUrl = (raw: string): string => {
    if (!raw) return '';
    if (
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:') ||
      raw.startsWith('blob:')
    ) {
      return raw;
    }
    return `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
  };

  /** 从一个源节点展开全部图片 URL（素材多图全部带上） */
  const collectUrlsFromSourceNode = useCallback((src: any): string[] => {
    if (!src) return [];
    if (src.taskData?.node_type === 'director') {
      return collectDirectorDownstreamUrls(src, absoluteUrl);
    }
    const urls: string[] = [];

    const filesFromTask = Array.isArray(src.taskData?.files) ? src.taskData.files : [];
    const filesFromResult = Array.isArray(src.resultData?.content?.files)
      ? src.resultData.content.files
      : [];
    const fileList = filesFromTask.length > 0 ? filesFromTask : filesFromResult;

    if (fileList.length > 0) {
      for (const f of fileList) {
        const kind = (f.kind || f.asset_type || '').toLowerCase();
        if (kind && kind !== 'image' && !String(f.mime || '').startsWith('image/')) continue;
        const u = absoluteUrl(f.url || f.file_url || '');
        if (u) urls.push(u);
      }
    }

    if (urls.length === 0) {
      const displayUrl = getResultDisplayUrl(src.type, src.resultData);
      const u = absoluteUrl(displayUrl);
      if (u) urls.push(u);
    }

    return urls;
  }, []);

  const resolveUrlFromNodeId = useCallback(
    (nodeId: string): string | string[] | null => {
      const resolved = findSourceImageNode(nodeId);
      if (!resolved) return null;
      const urls = collectUrlsFromSourceNode(resolved);
      return urls.length ? urls : null;
    },
    [findSourceImageNode, collectUrlsFromSourceNode],
  );

  // 参考图：优先读参考口 handles，再回退 parentId（避免 Prompt 占死 parent 时丢参考图）
  const refHandleConnected = useMemo(() => {
    if (!referencePort) return false;
    const handles = listHandlesForPort(referencePort, node.inputConnections);
    return handles.some((h) => !!node.inputConnections?.[h]) || !!node.inputConnections?.['Reference Image'];
  }, [referencePort, node.inputConnections]);

  const referenceConnectionId =
    (referencePort &&
      listHandlesForPort(referencePort, node.inputConnections)
        .map((h) => node.inputConnections?.[h])
        .find(Boolean)) ||
    node.inputConnections?.['Reference Image'] ||
    (!parentPromptNode ? node.parentId : undefined);
  const sourceNode = referenceEnabled ? findSourceImageNode(referenceConnectionId) : null;

  const hasPromptConnection = !!externalPromptNode;
  const mentionAssets = useMemo(
    () => buildFlowMentionAssets(collectGenNodeMentionItems(node, nodes || [])),
    [node, nodes],
  );
  const hasManualRefs =
    (Array.isArray(node.taskData?.reference_urls) && node.taskData.reference_urls.length > 0) ||
    (node.taskData?.io_media_urls &&
      Object.values(node.taskData.io_media_urls as Record<string, unknown>).some(
        (v) => Array.isArray(v) && v.length > 0,
      ));
  const hasSourceImage = referenceEnabled && (!!sourceNode || hasManualRefs || refHandleConnected);
  const hasChildConnection = useMemo(() => {
    return (nodes || []).some(n => n.parentId === node.id && !n.isHidden);
  }, [nodes, node.id]);

  const resolveSourceType = useCallback(
    (nodeId: string) => {
      const n = (nodes || []).find((x) => x.id === nodeId);
      if (!n || n.isHidden) return undefined;
      return n.taskData?.node_type || n.type;
    },
    [nodes],
  );

  const resolveSourceMedia = useCallback(
    (nodeId: string): 'image' | 'video' | 'audio' | 'file' | undefined => {
      const n = (nodes || []).find((x) => x.id === nodeId);
      if (!n) return undefined;
      const media = resolveConnectSourceMedia(n, nodes || []);
      if (media === 'document') return 'file';
      return media;
    },
    [nodes],
  );

  const staleConnections = useMemo(
    () =>
      findStaleInputConnections({
        inputConnections: node.inputConnections,
        inputs: effectiveInputs,
        resolveSourceType,
        resolveSourceMedia,
      }),
    [node.inputConnections, effectiveInputs, resolveSourceType, resolveSourceMedia],
  );

  const clearStaleConnections = useCallback(() => {
    if (!staleConnections.length) return;
    const drop = new Set(staleConnections.map((s) => s.handleId));
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id !== node.id || !n.inputConnections) return n;
        const nextConns = { ...n.inputConnections };
        for (const h of drop) delete nextConns[h];
        return { ...n, inputConnections: nextConns };
      });
      saveCanvasState(updated);
      return updated;
    });
    toast.success('已清理无效连线');
  }, [staleConnections, node.id, setNodes, saveCanvasState]);

  // 3. 构建参数 payload（按方案 IO bind_key）
  const getRequestPayload = () => {
    const payload: Record<string, any> = {
      model: modelObj?.model_id || node.taskData?.model || 'sdxl',
    };

    if (displayParams.length > 0) {
      displayParams.forEach((p: any) => {
        const val = node.taskData?.[p.key] ?? node.taskData?.[p.key === 'aspect_ratio' ? 'aspectRatio' : ''] ?? p.default;
        if (val === undefined || val === null || val === '') return;
        const modelHint = {
          model_id: modelObj?.model_id || node.taskData?.model || '',
          name: modelObj?.name || node.taskData?.modelName || '',
          endpoint: modelObj?.endpoint || '',
          scheme_id: (modelObj as any)?.scheme_id || node.taskData?.scheme_id || '',
        };
        if (shouldOmitOpenAiImageExtraParam(modelHint, p.key)) return;
        if (applyImageGenerationParam(payload, p.key, val)) return;
        payload[p.key] = val;
      });
    }

    const isp = (modelObj as { image_special_params?: any } | undefined)?.image_special_params;
    imageSpecialParamKeys(isp).forEach((key) => {
      const val = node.taskData?.[key];
      if (val === undefined || val === null || val === '') return;
      payload[key] = val;
    });
    imageSpecialOmitRequestKeys(isp).forEach((key) => {
      delete payload[key];
    });
    applyImageSpecialRequestPack(payload, isp, node.taskData);

    // 数量参数兜底：即使方案 params 未声明，也把节点上的 n / batch_size 等带上
    for (const key of ['n', 'batch_size', 'num_images', 'image_count'] as const) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') continue;
      const raw = node.taskData?.[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const num = Number(raw);
      payload[key] = Number.isFinite(num) ? num : raw;
    }
    // OpenAI / Azure Images 统一用 n
    if (payload.n == null) {
      const alt = payload.batch_size ?? payload.num_images ?? payload.image_count;
      if (alt != null && alt !== '') {
        const num = Number(alt);
        if (Number.isFinite(num) && num > 0) payload.n = num;
      }
    } else {
      const num = Number(payload.n);
      if (Number.isFinite(num)) payload.n = num;
    }

    const ARRAY_BIND_KEYS = new Set(['image_urls', 'video_urls', 'audio_urls', 'reference_urls']);

    for (const port of enabledPorts(effectiveInputs)) {
      const bindKey = port.bind_key;
      if (!bindKey) continue;

      if (port.modality === 'text') {
        if (bindKey === 'prompt' || port.key === 'prompt') {
          payload[bindKey] = effectivePrompt.trim();
          continue;
        }
        const handles = listHandlesForPort(port, node.inputConnections);
        let textVal = '';
        for (const h of handles) {
          const srcId = node.inputConnections?.[h];
          if (!srcId) continue;
          const src = (nodes || []).find((n) => n.id === srcId);
          if (src?.taskData?.node_type === 'prompt' && typeof src.taskData?.prompt === 'string') {
            textVal = src.taskData.prompt;
            break;
          }
        }
        if (!textVal && typeof node.taskData?.[bindKey] === 'string') {
          textVal = node.taskData[bindKey];
        }
        if (textVal) payload[bindKey] = textVal;
        continue;
      }

      // 参考口：连线 handles + 手动参考文件
      const isRefPort = isReferenceMediaPort(port);

      let urls = collectUrlsForPort(port, node.inputConnections, resolveUrlFromNodeId);

      // 兼容旧单槽 Reference Image + parent 链
      if (isRefPort && !urls.length && sourceNode) {
        urls = collectUrlsFromSourceNode(sourceNode);
      }

      if (isRefPort) {
        urls = mergePortUrlsWithManual(port, urls, node.taskData);
      }

      if (!urls.length) continue;
      const max = isRefPort ? urls.length : Math.max(1, Number(port.max) || 1);
      if (ARRAY_BIND_KEYS.has(bindKey) || max > 1 || port.expandable || urls.length > 1) {
        payload[bindKey] = urls;
      } else {
        payload[bindKey] = urls[0];
      }
    }

    if (!payload.prompt) {
      payload.prompt = effectivePrompt.trim();
    }
    if (payload.layer_decomposition === true) {
      if (!String(payload.prompt || '').trim()) delete payload.prompt;
      const sizeParam = (modelObj?.params || []).find(
        (p: { key?: string }) => (p.key || '').toLowerCase() === 'size',
      );
      payload.size = coerceSizeForLayerDecomposition(payload.size, sizeParam?.options);
    } else if (String(payload.size || '').toLowerCase() === 'auto') {
      payload.size = '2K';
    }

    return payload;
  };

  // 4. 立即生成请求处理
  const handleSubmit = async () => {
    // 仅本地提交中、或真正 loading 时拦截；超时/失败后 enhance_status 可能仍为 processing，必须允许重试
    if (enhanceProcessing) return;
    if (node.status === 'loading' && node.taskData?.enhance_status === 'processing') return;

    if (!node.taskData?.model && !modelObj) {
      toast.warning('请先选择生成大模型！');
      return;
    }

    if (staleConnections.length) {
      toast.warning(
        `存在无效连线：${staleConnections.map((s) => `${s.label}（${s.reason}）`).join('；')}`,
      );
      return;
    }

    const layerSplitOn = !!node.taskData?.layer_decomposition;
    if (!effectivePrompt.trim() && !layerSplitOn) {
      toast.warning('请输入提示词，或将提示词节点连接到「提示词」插孔！');
      return;
    }

    const effectiveToken = resolveTokenKey();
    if (!effectiveToken) {
      toast.warning('请先在底部操作栏选择 API 密钥');
      return;
    }

    const payload = getRequestPayload();
    // 参考口禁用时不带 image_urls
    if (!referenceEnabled && payload.image_urls) {
      delete payload.image_urls;
    }
    const hasReferenceImage = !!payload.image_urls && payload.image_urls.length > 0;
    const blobCandidates = [
      ...(payload.image_urls || []),
      ...(payload.video_urls || []),
      ...(payload.audio_urls || []),
    ].filter(Boolean);
    const endpoint = hasReferenceImage ? '/v1/images/edits' : '/v1/images/generations';

    const sysLogId = 'tsk_' + generateUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    setEnhanceProcessing(true);
    markNodeSubmitPending(node.id);

    // 本地 blob 参考图：生成前先真实上传，再用远程地址请求
    if (blobCandidates.some((u) => isBlobUrl(u))) {
      try {
        const urlMap = await ensureRemoteUrlMap(blobCandidates, currentProjectId);
        if (payload.image_urls) payload.image_urls = remapUrls(payload.image_urls, urlMap);
        if (payload.video_urls) payload.video_urls = remapUrls(payload.video_urls, urlMap);
        if (payload.audio_urls) payload.audio_urls = remapUrls(payload.audio_urls, urlMap);

        setNodes((prev) => {
          const updated = prev.map((n) => {
            // 更新本节点手动参考
            if (n.id === node.id) {
              return {
                ...n,
                taskData: remapManualMediaInTaskData(n.taskData || {}, urlMap),
              };
            }
            // 更新连线素材节点中的 blob 文件
            if (n.taskData?.node_type === 'asset' && Array.isArray(n.taskData?.files)) {
              let changed = false;
              const nextFiles = (n.taskData.files as any[]).map((f) => {
                const nextUrl = f?.url && urlMap.has(f.url) ? urlMap.get(f.url)! : f.url;
                if (nextUrl !== f.url) changed = true;
                return nextUrl !== f.url ? { ...f, url: nextUrl } : f;
              });
              if (!changed) return n;
              const primary = nextFiles[0];
              const resultData = primary
                ? primary.kind === 'video'
                  ? { content: { video_url: primary.url, files: nextFiles } }
                  : primary.kind === 'audio'
                    ? { content: { audio_url: primary.url, files: nextFiles } }
                    : { content: { image_url: primary.url, files: nextFiles } }
                : n.resultData;
              return {
                ...n,
                resultData,
                taskData: {
                  ...(n.taskData || {}),
                  files: nextFiles,
                  local_blob: nextFiles.some((f: any) => isBlobUrl(f.url)) || undefined,
                },
              };
            }
            return n;
          });
          saveCanvasState(updated);
          return updated;
        });
      } catch (e: any) {
        setEnhanceProcessing(false);
        clearNodeSubmitPending(node.id);
        toast.error(e?.message || '参考图上传失败，请重试');
        return;
      }
    }

    const attachedUrls = [
      ...(payload.image_urls || []),
      ...(payload.video_urls || []),
      ...(payload.audio_urls || []),
    ].filter(Boolean);

    // 更新当前节点状态为 processing/loading
    setNodes((prev) => {
      const updated = prev.map(n => {
        if (n.id === node.id) {
          const prevTask = { ...(n.taskData || {}) };
          // 清掉超时/旧轮询残留，避免再次被当成「进行中」拦死
          delete prevTask.poll_timeout;
          delete prevTask.poll_exhausted;
          delete prevTask.task_id;
          delete prevTask.poll_endpoint;
          delete prevTask.is_sync_completed;
          // 二次生成必须清掉旧入库地址，否则保存画布会用旧 tos_url 盖住新结果
          delete prevTask.tos_url;
          delete prevTask.persist_failed;
          delete prevTask.persist_error;
          delete prevTask.last_persisted_asset_id;
          prevTask.active_result_index = 0;
          return {
            ...n,
            status: 'loading' as const,
            resultData: null,
            taskData: {
              ...prevTask,
              enhance_status: 'processing',
              sys_log_id: sysLogId,
              token_key: effectiveToken,
              model_id: modelObj?.model_id || node.taskData?.model || 'sdxl',
              created_at: new Date().toISOString(),
              attached_urls: attachedUrls,
            }
          };
        }
        return n;
      });
      saveCanvasState(updated);
      return updated;
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Playground-2026': '1',
        'X-Log-Id': sysLogId,
        'Authorization': `Bearer ${effectiveToken}`,
      };

      const res: any = await request.post(endpoint, payload, {
        headers,
        baseURL: '',
        skipErrorHandler: true,
      } as any);

      const taskId = res?.id || res?.task_id;
      const status = String(res?.status || '').toLowerCase();
      const isAsyncTask = !!taskId && (
        status === 'pending' ||
        status === 'in_progress' ||
        status === 'queued' ||
        status === 'processing'
      );

      if (isAsyncTask) {
        const pollEndpoint = `/v1/tasks/${taskId}`;
        setNodes((prev) => {
          const updated = prev.map(n => {
            if (n.id === node.id) {
              return {
                ...n,
                status: 'loading' as const,
                taskData: {
                  ...(n.taskData || {}),
                  task_id: taskId,
                  poll_endpoint: pollEndpoint,
                  enhance_status: 'processing',
                  submit_response: res
                }
              };
            }
            return n;
          });
          saveCanvasState(updated);
          return updated;
        });
        toast.success('已提交 AI 图片生成任务（异步处理中）');
      } else {
        // Seedream 等：n/max_images 仅为上限，可能少返回；按期望张数补请求（对齐独立图片页）
        const requested = Math.min(
          4,
          Math.max(1, Math.floor(Number(payload.n) || 1)),
        );
        let urls = extractImageDisplayUrls(res);
        let mergedRes = res;
        let attempts = 1;
        const maxAttempts = requested + 2;
        while (urls.length < requested && attempts < maxAttempts) {
          attempts += 1;
          const need = requested - urls.length;
          const more: any = await request.post(
            endpoint,
            { ...payload, n: need },
            {
              headers,
              baseURL: '',
              skipErrorHandler: true,
            } as any,
          );
          const moreTaskId = more?.id || more?.task_id;
          const moreStatus = String(more?.status || '').toLowerCase();
          const moreAsync =
            !!moreTaskId &&
            (moreStatus === 'pending' ||
              moreStatus === 'in_progress' ||
              moreStatus === 'queued' ||
              moreStatus === 'processing');
          if (moreAsync) break;
          const moreUrls = extractImageDisplayUrls(more);
          if (!moreUrls.length) break;
          urls = [...urls, ...moreUrls];
          mergedRes = more;
        }
        urls = urls.slice(0, requested);

        if (!urls.length) {
          const errMsg = '生成成功但未返回图片地址';
          setNodes((prev) => {
            const updated = prev.map(n => {
              if (n.id === node.id) {
                return {
                  ...n,
                  status: 'error' as const,
                  resultData: { message: errMsg },
                  taskData: {
                    ...(n.taskData || {}),
                    enhance_status: 'failed',
                  }
                };
              }
              return n;
            });
            saveCanvasState(updated);
            return updated;
          });
          toast.error(errMsg);
        } else {
          // 同步直接完成：立刻用上游结果刷新节点；入库由全局 persist 处理
          setNodes((prev) => {
            const updated = prev.map(n => {
              if (n.id === node.id) {
                return {
                  ...n,
                  status: 'completed' as const,
                  resultData: {
                    ...mergedRes,
                    data: urls.map((url) => ({ url })),
                    content: {
                      ...(typeof mergedRes?.content === 'object' && mergedRes.content
                        ? mergedRes.content
                        : {}),
                      active_index: 0,
                    },
                  },
                  taskData: {
                    ...(n.taskData || {}),
                    enhance_status: 'completed',
                    is_sync_completed: true,
                    active_result_index: 0,
                  }
                };
              }
              return n;
            });
            saveCanvasState(updated);
            return updated;
          });
          toast.success(urls.length > 1 ? `AI 图片生成成功（${urls.length} 张）` : 'AI 图片生成成功');
        }
      }
    } catch (err: any) {
      console.error('AI 图片生成失败', err);
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || '生成失败，请重试';
      setNodes((prev) => {
        const updated = prev.map(n => {
          if (n.id === node.id) {
            return {
              ...n,
              status: 'error' as const,
              resultData: { message: errMsg },
              taskData: {
                ...(n.taskData || {}),
                enhance_status: 'failed',
              }
            };
          }
          return n;
        });
        saveCanvasState(updated);
        return updated;
      });
      toast.error(`生成失败: ${errMsg}`);
    } finally {
      setEnhanceProcessing(false);
      clearNodeSubmitPending(node.id);
    }
  };

  const handleEnhancePrompt = () => {
    const currentPrompt = node.taskData?.prompt || '';
    if (!currentPrompt.trim()) {
      toast.info('请先输入提示词再优化');
      return;
    }
    updateNodeTaskData({ prompt: currentPrompt.trim() + ', photorealistic, 8k resolution, highly detailed, masterpiece' });
    toast.success('已使用智能魔法优化提示词！');
  };

  const isGenerating =
    enhanceProcessing ||
    node.status === 'loading' ||
    (node.taskData?.enhance_status === 'processing' &&
      node.status !== 'completed' &&
      node.status !== 'error');


  const resultUrls = node.resultData ? extractImageDisplayUrls(node.resultData) : [];
  const activeResultIndex = (() => {
    const raw = Number(
      node.taskData?.active_result_index ??
        node.resultData?.content?.active_index ??
        0,
    );
    if (!resultUrls.length) return 0;
    if (!Number.isFinite(raw)) return 0;
    return Math.min(Math.max(0, Math.trunc(raw)), resultUrls.length - 1);
  })();
  const resultUrl = resultUrls[activeResultIndex] || '';

  const setActiveResultIndex = (next: number) => {
    if (!resultUrls.length) return;
    const idx = Math.min(Math.max(0, next), resultUrls.length - 1);
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id !== node.id) return n;
        return {
          ...n,
          resultData: {
            ...(n.resultData || {}),
            content: {
              ...(typeof n.resultData?.content === 'object' && n.resultData.content
                ? n.resultData.content
                : {}),
              active_index: idx,
            },
          },
          taskData: {
            ...(n.taskData || {}),
            active_result_index: idx,
          },
        };
      });
      saveCanvasState(updated);
      return updated;
    });
  };

  const handleAddSocket = (prefix: string, max: number) => {
    const currentCounts = node.taskData?.manualSocketCounts || {};
    const handles = listHandlesForPort(
      { handle_prefix: prefix, max, expandable: true, enabled: true, modality: 'image', key: prefix, label: prefix } as SchemePort,
      node.inputConnections,
      currentCounts,
    );
    const currentCount = handles.length;
    if (currentCount >= max) return;
    const newCounts = { ...currentCounts, [prefix]: currentCount + 1 };
    setNodes((prevNodes) => {
      const updated = prevNodes.map((n) => {
        if (n.id === node.id) {
          return {
            ...n,
            taskData: {
              ...(n.taskData || {}),
              manualSocketCounts: newCounts,
            },
          };
        }
        return n;
      });
      saveCanvasState(updated);
      return updated;
    });
  };

  const leftSockets: NodeConnectorSocket[] = useMemo(() => {
    const list: NodeConnectorSocket[] = [];
    for (const port of enabledPorts(effectiveInputs)) {
      const handles = listHandlesForPort(
        port,
        node.inputConnections,
        node.taskData?.manualSocketCounts,
      );
      const max = Math.max(1, Number(port.max) || 1);
      const expandable = !!port.expandable && max > 1;
      handles.forEach((label, i) => {
        const isPromptLike =
          port.modality === 'text' &&
          (port.key === 'prompt' || port.bind_key === 'prompt' || label === 'Prompt');
        const isRefLike =
          port.modality === 'image' ||
          port.key === 'reference_images' ||
          label.includes('Reference');
        const connected =
          !!node.inputConnections?.[label] ||
          (isPromptLike && hasPromptConnection && (label === promptHandlePrefix || label === 'Prompt')) ||
          (isRefLike && hasSourceImage && (label === 'Reference Image' || i === 0));
        list.push({
          id: label,
          label: flowPortSocketLabel(port.label, label),
          color: modalitySocketColor(port.modality),
          connected,
          required: !!port.required,
          onAdd:
            expandable && i === handles.length - 1 && handles.length < max
              ? () => handleAddSocket(port.handle_prefix, max)
              : undefined,
        });
      });
    }
    return list;
  }, [
    effectiveInputs,
    node.inputConnections,
    node.taskData?.manualSocketCounts,
    hasPromptConnection,
    promptHandlePrefix,
    hasSourceImage,
  ]);

  const startConnectOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingSourceId(node.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setConnectingMousePos({
        x: (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
        y: (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
      });
    }
  };

  const rightSockets: NodeConnectorSocket[] = useMemo(() => {
    const outs = enabledPorts(effectiveOutputs);
    if (!outs.length) {
      return [
        {
          id: 'Image',
          label: '图片',
          color: '#f59e0b',
          connected: !!resultUrl || hasChildConnection,
          onConnectStart: startConnectOut,
        },
      ];
    }
    return outs.map((port) => ({
      id: port.handle_prefix || 'Image',
      label: flowPortSocketLabel(port.label, port.handle_prefix || 'Image'),
      color: modalitySocketColor(port.modality),
      connected: !!resultUrl || hasChildConnection,
      onConnectStart: startConnectOut,
    }));
  }, [effectiveOutputs, resultUrl, hasChildConnection]);

  const staleTooltip = staleConnections.map((s) => `${s.label}: ${s.reason}`).join('\n');

  return (
    <div
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        color: '#fff',
        overflow: 'visible',
      }}
    >
      {staleConnections.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Tooltip title={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{staleTooltip}</pre>}>
            <span
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(245, 158, 11, 0.9)',
                color: '#111',
                fontWeight: 600,
                cursor: 'default',
              }}
            >
              无效连线 {staleConnections.length}
            </span>
          </Tooltip>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearStaleConnections();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            清理无效连线
          </button>
        </div>
      )}

      {/* 节点外面顶部的标题与三点菜单 */}
      <div style={{
        position: 'absolute',
        top: -28,
        left: 4,
        right: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {/* 左上角外面：图片图标 + 节点标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 400, color: '#fff', minWidth: 0, pointerEvents: 'auto' }}>
          <span style={{ display: 'inline-flex', color: 'rgba(255,255,255,0.85)' }}>
            <FlowIconImage size={14} />
          </span>
          <NodeTitleInline
            nodeId={node.id}
            title={nodeTitle}
            onCommit={(next) => updateNodeTaskData({ label: next, node_title: next })}
          />
        </div>

        {/* 右上角：模型名（更多改由顶部操作栏 / 右键） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.5)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {modelName}
          </div>
          {/* 仅挂载以响应画布右键，不渲染可见触发器 */}
          <NodeMoreMenu
            hideTrigger
            node={node}
            defaultTitle={defaultTitle}
            onRemove={onRemove}
            updateNodeTaskData={updateNodeTaskData}
            setNodes={setNodes}
            saveCanvasState={saveCanvasState}
          />
        </div>
      </div>

      {/* 统一左右连接器（由方案 IO 驱动） */}
      <NodeConnectors
        side="left"
        visible={showSockets}
        gap={14}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'ai_image'}
        sockets={leftSockets}
      />
      <NodeConnectors
        side="right"
        visible={showSockets}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'ai_image'}
        sockets={rightSockets}
      />

      <div className="pg-flow-ai-body">
        {/* 中间图片预览/占位区 */}
        <div className="pg-flow-ai-preview">
          {resultUrl ? (
            <>
              <img
                src={resultUrl}
                alt="Generated Media"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'inherit' }}
              />
              {resultUrls.length > 1 && (
                <div
                  className="pg-flow-asset-switcher"
                  style={{ position: 'absolute', left: 8, right: 8, bottom: 8 }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="pg-flow-asset-switcher-row">
                    <button
                      type="button"
                      className="pg-flow-asset-switcher-nav"
                      disabled={activeResultIndex <= 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveResultIndex(activeResultIndex - 1);
                      }}
                    >
                      ‹
                    </button>
                    <div className="pg-flow-asset-switcher-thumbs">
                      {resultUrls.map((url, i) => (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          className={`pg-flow-asset-switcher-thumb${i === activeResultIndex ? ' is-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveResultIndex(i);
                          }}
                        >
                          <img src={url} alt="" draggable={false} />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="pg-flow-asset-switcher-nav"
                      disabled={activeResultIndex >= resultUrls.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveResultIndex(activeResultIndex + 1);
                      }}
                    >
                      ›
                    </button>
                  </div>
                  <div className="pg-flow-asset-switcher-meta">
                    {activeResultIndex + 1} / {resultUrls.length}
                  </div>
                </div>
              )}
            </>
          ) : isGenerating ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255, 255, 255, 0.5)' }}>
              <LoadingOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }} />
              <span style={{ fontSize: 14, fontWeight: 400 }}>正在生成图片…</span>
            </div>
          ) : node.status === 'error' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#ef4444', padding: '0 20px', textAlign: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{node.resultData?.message || '生成失败，请重试'}</span>
            </div>
          ) : (
            <div className="pg-flow-ai-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2.5" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span>结果将显示在这里</span>
            </div>
          )}
        </div>

        {/* 底部控制区（含提示词、控制条）；外接提示词时不显示本地面板输入 */}
        <div className="pg-flow-ai-footer">
          {!hasPromptConnection && (
            <MentionPromptField
              value={node.taskData?.prompt || ''}
              onChange={(next) => updateNodeTaskData({ prompt: next })}
              assets={mentionAssets}
              placeholder="输入提示词…"
              disabled={isGenerating}
              className="pg-flow-ai-prompt"
              dropdownTitle="引用文件"
              emptyText="暂无参考文件，请先连接或上传"
              isLight={false}
            />
          )}

          <div className="pg-flow-ai-toolbar">
            <div className="pg-flow-ai-toolbar-right">
              <Tooltip title="优化提示词">
                <button
                  type="button"
                  className="pg-flow-ai-icon-btn"
                  disabled={isGenerating || hasPromptConnection}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEnhancePrompt();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="优化提示词"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    <path d="M5 3v4" />
                    <path d="M19 17v4" />
                    <path d="M3 5h4" />
                    <path d="M17 19h4" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip title={isGenerating ? '生成中…' : '生成图片'}>
                <button
                  type="button"
                  className={`pg-flow-ai-run-btn${isGenerating ? ' is-busy' : ''}`}
                  disabled={isGenerating}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSubmit();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="生成图片"
                >
                  {isGenerating ? (
                    <LoadingOutlined style={{ fontSize: 12 }} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

AiImageNode.displayName = 'AiImageNode';
export default React.memo(AiImageNode);
