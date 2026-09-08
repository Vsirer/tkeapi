/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 🎬 AI 视频生成节点
 * 从 CanvasNode.tsx 提取的独立组件
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from '../PlaygroundToast';
import generateUUID from '../../../../../utils/uuid';
import { usePlayground, useCanvas } from '../../context/PlaygroundContext';
import { LoadingOutlined, PictureOutlined, Tooltip } from '../../ui';
import { Dropdown } from '../../ui';
import axios from 'axios';
import { getResultDisplayUrl } from '../../utils/resultExtractor';
import { collectDirectorDownstreamUrls } from '../director_stage/directorScene';
import type { AdvancedNodeProps } from './shared/types';
import NodeMoreMenu, { getNodeDisplayTitle } from './shared/NodeMoreMenu';
import NodeTitleInline from './shared/NodeTitleInline';
import NodeConnectors, { type NodeConnectorSocket } from './shared/NodeConnectors';
import { pickSavedTokenKey } from '../../utils/imageGenerationApi';
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
import { normalizeVideoMediaBody } from '../../utils/schemeIoToolValues';
import { resolveConnectSourceMedia } from '../../utils/flowConnectDragHighlight';
import { flowPortSocketLabel } from '../../utils/flowSocketLabels';
import MentionPromptField from '../MentionPromptField';
import {
  buildFlowMentionAssets,
  collectGenNodeMentionItems,
} from '../../utils/flowSlotMentionAssets';

const AiVideoNode: React.FC<AdvancedNodeProps> = ({
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

  const defaultTitle = `视频 ${node.id.split('-').pop()?.slice(-3) || '1'}`;
  const nodeTitle = getNodeDisplayTitle(node, defaultTitle);
  const modelName = node.taskData?.modelName || node.taskData?.model || '未选择模型';
  const modelObj = (models || []).find(m => m.mid === node.taskData?.modelMid || m.name === node.taskData?.model || m.model_id === node.taskData?.model);

  const io = useMemo(() => resolveModelIo(modelObj, 'video'), [modelObj]);

  // 模型切换时同步方案 IO 快照到 taskData
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

  // 1. 解析提示词：优先插座连线（handle_prefix / 兼容 Prompt），再回退 parent/同级
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

  // 2. 递归寻找输入源媒体节点 (用于图生视频、视频生视频)
  const findSourceMediaNode = useCallback((currNodeId: string | undefined): any => {
    if (!currNodeId) return null;
    const parent = (nodes || []).find(n => n.id === currNodeId);
    if (!parent || parent.isHidden) return null;
    const url = getResultDisplayUrl(parent.type, parent.resultData);
    if (url && ((parent.type as string) === 'image' || (parent.type as string) === 'ai_image' || parent.type === 'video' || parent.type === 'audio')) return parent;
    if (parent.taskData?.node_type === 'asset' && Array.isArray(parent.taskData?.files) && parent.taskData.files.length > 0) {
      return parent;
    }
    if (parent.taskData?.node_type === 'director' && Array.isArray(parent.taskData?.files) && parent.taskData.files.length > 0) {
      return parent;
    }
    return findSourceMediaNode(parent.parentId);
  }, [nodes]);

  const sourceNode = findSourceMediaNode(node.parentId);

  const hasPromptConnection = !!externalPromptNode;
  const mentionAssets = useMemo(
    () => buildFlowMentionAssets(collectGenNodeMentionItems(node, nodes || [])),
    [node, nodes],
  );
  const hasSourceMedia = !!sourceNode;
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
    setNodes((prev: any) => {
      const updated = prev.map((n: any) => {
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

  const resolveUrlFromNodeId = useCallback(
    (nodeId: string): string | string[] | null => {
      const resolved = findSourceMediaNode(nodeId);
      if (!resolved) return null;
      if (resolved.taskData?.node_type === 'director') {
        const urls = collectDirectorDownstreamUrls(resolved, absoluteUrl);
        return urls.length ? urls : null;
      }
      const files = Array.isArray(resolved.taskData?.files)
        ? resolved.taskData.files
        : Array.isArray(resolved.resultData?.content?.files)
          ? resolved.resultData.content.files
          : [];
      if (files.length > 0) {
        return files
          .map((f: any) => absoluteUrl(f.url || f.file_url || ''))
          .filter(Boolean);
      }
      const displayUrl = getResultDisplayUrl(resolved.type, resolved.resultData);
      const u = absoluteUrl(displayUrl || '');
      return u || null;
    },
    [findSourceMediaNode],
  );

  // 4. 构建参数 payload（按方案 IO bind_key）
  const getRequestPayload = () => {
    const payload: Record<string, any> = {
      model: modelObj?.model_id || node.taskData?.model || 'kling',
    };

    if (displayParams.length > 0) {
      displayParams.forEach((p: any) => {
        const val = node.taskData?.[p.key] ?? node.taskData?.[p.key === 'aspect_ratio' ? 'aspectRatio' : ''] ?? p.default;
        payload[p.key] = val;
      });
    }

    const ARRAY_BIND_KEYS = new Set([
      'image_urls',
      'video_urls',
      'audio_urls',
      'reference_urls',
      'files',
      'links',
    ]);

    for (const port of enabledPorts(effectiveInputs)) {
      const bindKey = port.bind_key;
      if (!bindKey) continue;

      if (port.modality === 'text') {
        if (bindKey === 'prompt' || port.key === 'prompt') {
          payload[bindKey] = effectivePrompt.trim();
          continue;
        }
        // 反向提示词等：优先连线 prompt 节点，再 taskData
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

      const urls = isReferenceMediaPort(port)
        ? mergePortUrlsWithManual(
            port,
            collectUrlsForPort(port, node.inputConnections, resolveUrlFromNodeId),
            node.taskData,
          )
        : collectUrlsForPort(port, node.inputConnections, resolveUrlFromNodeId);
      const max = urls.length;
      if (!urls.length) continue;

      if (ARRAY_BIND_KEYS.has(bindKey) || max > 1 || port.expandable) {
        payload[bindKey] = urls;
      } else if (max === 1) {
        payload[bindKey] = urls[0];
      } else {
        payload[bindKey] = urls;
      }
    }

    // 兼容：已启用媒体口但未连线时，回退 parent 链上的源媒体
    const enabledMediaBinds = new Set(
      enabledPorts(effectiveInputs)
        .filter((p) => {
          return (
            p.modality === 'image' ||
            p.modality === 'video' ||
            p.modality === 'audio' ||
            p.modality === 'file'
          );
        })
        .map((p) => p.bind_key)
        .filter(Boolean),
    );
    if (
      sourceNode &&
      !payload.image_urls &&
      !payload.video_urls &&
      !payload.audio_urls &&
      !payload.images &&
      !payload.videos &&
      !payload.audios &&
      !payload.files &&
      !payload.links
    ) {
      const displayUrl = getResultDisplayUrl(sourceNode.type, sourceNode.resultData);
      const sourceUrl = absoluteUrl(displayUrl || '');
      if (sourceUrl) {
        if (sourceNode?.type === 'video' && (enabledMediaBinds.has('video_urls') || enabledMediaBinds.has('videos'))) {
          const key = enabledMediaBinds.has('videos') ? 'videos' : 'video_urls';
          payload[key] = [sourceUrl];
        } else if (sourceNode?.type === 'audio' && (enabledMediaBinds.has('audio_urls') || enabledMediaBinds.has('audios'))) {
          const key = enabledMediaBinds.has('audios') ? 'audios' : 'audio_urls';
          payload[key] = [sourceUrl];
        } else if (
          sourceNode?.type !== 'video' &&
          sourceNode?.type !== 'audio' &&
          (enabledMediaBinds.has('image_urls') || enabledMediaBinds.has('images') || enabledMediaBinds.has('reference_urls'))
        ) {
          const key = enabledMediaBinds.has('images')
            ? 'images'
            : enabledMediaBinds.has('reference_urls')
              ? 'reference_urls'
              : 'image_urls';
          payload[key] = [sourceUrl];
        }
      }
    }

    if (!payload.prompt) {
      payload.prompt = effectivePrompt.trim();
    }

    if (node.taskData?.image_role && payload.image_urls?.length) {
      payload.image_role = node.taskData.image_role;
    }

    if (
      modelObj?.scheme_id === 'openai_video' ||
      modelObj?.scheme_id === 'seedance2.0' ||
      modelObj?.scheme_id === 'seedance2' ||
      modelObj?.scheme_id === 'wan3.0' ||
      modelObj?.scheme_id === 'dashscope_video'
    ) {
      delete payload.negative_prompt;
      delete payload.negativePrompt;
    }

    normalizeVideoMediaBody(payload);

    return payload;
  };

  // 5. 立即生成请求处理
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

    if (!effectivePrompt.trim()) {
      toast.warning('请输入提示词，或将提示词节点连接到「提示词」插孔！');
      return;
    }

    const effectiveToken =
      contextTokenKey ||
      selectedTokenKeyProp ||
      pickSavedTokenKey(apiTokens || []) ||
      (typeof node.taskData?.token_key === 'string' ? node.taskData.token_key : '') ||
      '';
    if (!effectiveToken) {
      toast.warning('请先在底部操作栏选择 API 密钥');
      return;
    }

    const payload = getRequestPayload();
    const blobCandidates = [
      ...(payload.image_urls || []),
      ...(payload.video_urls || []),
      ...(payload.audio_urls || []),
    ].filter((u: string) => isBlobUrl(u));

    const sysLogId = 'tsk_' + generateUUID().replace(/-/g, '').toLowerCase().substring(0, 26);
    setEnhanceProcessing(true);
    markNodeSubmitPending(node.id);

    // 本地 blob 参考：生成前先真实上传，再用远程地址请求
    if (blobCandidates.length) {
      try {
        const urlMap = await ensureRemoteUrlMap(blobCandidates, currentProjectId);
        if (payload.image_urls) payload.image_urls = remapUrls(payload.image_urls, urlMap);
        if (payload.video_urls) payload.video_urls = remapUrls(payload.video_urls, urlMap);
        if (payload.audio_urls) payload.audio_urls = remapUrls(payload.audio_urls, urlMap);

        setNodes((prev: any) => {
          const updated = prev.map((n: any) => {
            if (n.id === node.id) {
              return {
                ...n,
                taskData: remapManualMediaInTaskData(n.taskData || {}, urlMap),
              };
            }
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
        toast.error(e?.message || '参考素材上传失败，请重试');
        return;
      }
    }

    const hasReferenceImage = !!payload.image_urls && payload.image_urls.length > 0;
    const sourceUrl = hasReferenceImage ? payload.image_urls[0] : '';

    // 更新当前节点状态为 processing/loading
    setNodes((prev: any) => {
      const updated = prev.map((n: any) => {
        if (n.id === node.id) {
          const prevTask = { ...(n.taskData || {}) };
          delete prevTask.poll_timeout;
          delete prevTask.poll_exhausted;
          delete prevTask.task_id;
          delete prevTask.poll_endpoint;
          delete prevTask.is_sync_completed;
          delete prevTask.tos_url;
          delete prevTask.persist_failed;
          delete prevTask.persist_error;
          return {
            ...n,
            status: 'loading' as const,
            resultData: null,
            taskData: {
              ...prevTask,
              enhance_status: 'processing',
              sys_log_id: sysLogId,
              token_key: effectiveToken,
              model_id: modelObj?.model_id || node.taskData?.model || 'kling',
              created_at: new Date().toISOString(),
              attached_urls: payload.image_urls && payload.image_urls.length > 0
                ? payload.image_urls 
                : (sourceUrl ? [sourceUrl] : [])
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

      const endpoint = '/v1/video/generations'; // 视频生成接口

      const res: any = await axios.post(endpoint, payload, { headers }).then(r => r.data);

      const taskId = res?.id || res?.task_id;
      const isAsyncTask = taskId && (
        res?.status === 'pending' ||
        res?.status === 'in_progress'
      );

      if (isAsyncTask) {
        const pollEndpoint = `/v1/tasks/${taskId}`;
        setNodes((prev: any) => {
          const updated = prev.map((n: any) => {
            if (n.id === node.id) {
              return {
                ...n,
                taskData: {
                  ...(n.taskData || {}),
                  task_id: taskId,
                  poll_endpoint: pollEndpoint,
                  submit_response: res
                }
              };
            }
            return n;
          });
          saveCanvasState(updated);
          return updated;
        });
        toast.success('已提交 AI 视频生成任务（异步处理中）');
      } else {
        // 同步直接完成
        setNodes((prev: any) => {
          const updated = prev.map((n: any) => {
            if (n.id === node.id) {
              return {
                ...n,
                status: 'completed' as const,
                resultData: res,
                taskData: {
                  ...(n.taskData || {}),
                  enhance_status: 'completed',
                  is_sync_completed: true,
                }
              };
            }
            return n;
          });
          saveCanvasState(updated);
          return updated;
        });
        toast.success('AI 视频生成成功');
      }
    } catch (err: any) {
      console.error('AI 视频生成失败', err);
      const errMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || '生成失败，请重试';
      setNodes((prev: any) => {
        const updated = prev.map((n: any) => {
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

  const isGenerating =
    enhanceProcessing ||
    node.status === 'loading' ||
    (node.taskData?.enhance_status === 'processing' &&
      node.status !== 'completed' &&
      node.status !== 'error');
  
  const resultUrl = node.resultData ? getResultDisplayUrl('video', node.resultData) : '';

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
        const connected =
          !!node.inputConnections?.[label] ||
          (isPromptLike && hasPromptConnection && (label === promptHandlePrefix || label === 'Prompt'));
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
  ]);

  const rightSockets: NodeConnectorSocket[] = useMemo(() => {
    const outs = enabledPorts(effectiveOutputs);
    if (!outs.length) {
      return [
        {
          id: 'Video',
          label: '视频',
          color: '#4ade80',
          connected: !!resultUrl || hasChildConnection,
          onConnectStart: undefined as any,
        },
      ];
    }
    return outs.map((port) => ({
      id: port.handle_prefix || 'Video',
      label: flowPortSocketLabel(port.label, port.handle_prefix || 'Video'),
      color: modalitySocketColor(port.modality),
      connected: !!resultUrl || hasChildConnection,
    }));
  }, [effectiveOutputs, resultUrl, hasChildConnection]);

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

  const rightSocketsWithStart = rightSockets.map((s) => ({
    ...s,
    onConnectStart: startConnectOut,
  }));

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 400, color: '#fff', minWidth: 0, pointerEvents: 'auto' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <NodeTitleInline
            nodeId={node.id}
            title={nodeTitle}
            onCommit={(next) => updateNodeTaskData({ label: next, node_title: next })}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.5)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {modelName}
          </div>
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

      <NodeConnectors
        side="left"
        visible={showSockets}
        gap={6}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'ai_video'}
        sockets={leftSockets}
      />
      <NodeConnectors
        side="right"
        visible={showSockets}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'ai_video'}
        sockets={rightSocketsWithStart}
      />

      <div className="pg-flow-ai-body">
        <div className="pg-flow-ai-preview is-video">
          {resultUrl ? (
            <video
              src={resultUrl}
              controls
              autoPlay
              loop
              muted
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : isGenerating ? (
            <div className="pg-flow-ai-empty">
              <LoadingOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }} />
              <span>正在生成视频…</span>
            </div>
          ) : node.status === 'error' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#ef4444', padding: '0 20px', textAlign: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{node.resultData?.message || '生成失败，请重试'}</span>
            </div>
          ) : (
            <div className="pg-flow-ai-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span>结果将显示在这里</span>
            </div>
          )}
        </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {hasSourceMedia && sourceNode?.type === 'image' && (
                <Dropdown
                  menu={{
                    items: [
                      { key: 'auto', label: '自动' },
                      { key: 'start_frame', label: '首帧' },
                      { key: 'start_end_frame', label: '首尾帧' },
                      { key: 'reference_image', label: '参考图' },
                    ],
                    onClick: (e) => {
                      setNodes(prev => {
                        const updated = prev.map(n => {
                          if (n.id === node.id) {
                            return { ...n, taskData: { ...(n.taskData || {}), image_role: e.key } };
                          }
                          return n;
                        });
                        saveCanvasState(updated);
                        return updated;
                      });
                    }
                  }}
                  trigger={['click']}
                >
                  <button
                    type="button"
                    className="pg-flow-ai-ref-btn"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <PictureOutlined style={{ fontSize: 12 }} />
                    <span>
                      {{
                        'auto': '自动',
                        'start_frame': '首帧',
                        'start_end_frame': '首尾帧',
                        'reference_image': '参考图'
                      }[node.taskData?.image_role as string || 'auto']}
                    </span>
                  </button>
                </Dropdown>
              )}
            </div>

            <div className="pg-flow-ai-toolbar-right">
              <button
                type="button"
                className={`pg-flow-ai-run-btn${isGenerating ? ' is-busy' : ''}`}
                disabled={isGenerating}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSubmit();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                aria-label="生成视频"
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

AiVideoNode.displayName = 'AiVideoNode';
export default React.memo(AiVideoNode);
