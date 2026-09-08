/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片生成工作区 — Higgsfield 风格
 * 模型列表与方案参数对齐画布 playground-public-config 图片模型
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { message, Modal, Tooltip } from '../ui';
import {
  PictureOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  LoadingOutlined,
  CloseOutlined,
  PlusOutlined,
} from '../ui';
import { useTranslation } from 'react-i18next';
import { loadGeneratedImagesFromServer } from '../utils/imageGenStorage';
import type { GeneratedImageItem } from '../utils/imageGenStorage';
import { isFailedOutputExpired } from '../utils/expiredOutputs';
import {
  createAssetsBatch,
  deleteAsset,
  updateAsset,
} from '../utils/assetsApi';
import type { PlaygroundModel } from '../types';
import {
  deriveAspectRatio,
  usePlaygroundImageModels,
} from '../hooks/usePlaygroundImageModels';
import { useDebouncedSearchKeyword } from '../hooks/useDebouncedSearchKeyword';
import {
  coerceSizeForLayerDecomposition,
  formatGenerationError,
  generateImagesFillingCount,
  generateLogId,
  loadApiTokens,
  pickSavedTokenKey,
  saveSelectedTokenKey,
} from '../utils/imageGenerationApi';
import type { ApiTokenItem } from '../utils/imageGenerationApi';
import { settleThenPersistBatchMedia } from '../utils/settleBatchMedia';
import { resumePendingImageItems } from '../utils/resumePendingOutputs';
import { resumeUnpersistedOutputs } from '../utils/outputPersist';
import {
  consumeImageGenSeed,
  IMAGE_GEN_SEED_EVENT,
} from '../utils/imageGenSeed';
import { saveVideoGenSeed } from '../utils/videoGenSeed';
import {
  resolveMaxReferenceImages,
  isAcceptableReferenceFile,
  filesFromClipboardData,
} from '../utils/referenceUpload';
import { ensureRemoteUrls, buildLocalFlowPicks } from '../utils/deferredLocalUpload';
import { unregisterLocalFile, isBlobUrl } from '../utils/localFileRegistry';
import { groupItemsByDay } from '../utils/groupImagesByDay';
import {
  isInsidePlaygroundSettingsLayer,
  isPlaygroundSelectMenuOpen,
} from '../utils/isInsidePlaygroundSettingsLayer';
import {
  buildGenerationParams,
  extractParamValues,
  getReferenceUrls,
} from '../utils/generationParams';
import { clampImageModelParams } from '../utils/imageSpecialParams';
import {
  loadSavedImageGenModelMid,
  resolvePreferredModelMid,
  saveImageGenModelMid,
} from '../utils/genModelPreference';
import {
  buildRefMentionAssets,
  removeAndRenumberRefMentions,
  stripMentionArtifacts,
} from '../utils/mentionPrompt';
import ImageDetailOverlay from './ImageDetailOverlay';
import MentionPromptField from './MentionPromptField';
import ModelSettingsPanel from './ModelSettingsPanel';
import TokenSelectorPop from './TokenSelectorPop';
import WorkCardChrome from './WorkCardChrome';
import FlowAssetLibraryModal, {
  type FlowAssetPickResult,
} from './flow/FlowAssetLibraryModal';
import { formatWorkCardTime } from '../utils/workCardHelpers';
import './WorksList.css';
import MasonryColumns from './MasonryColumns';
import GeneratingCardProgress from './GeneratingCardProgress';
import SmoothMediaPreview from './SmoothMediaPreview';
import { useThemeStore } from '../../../../store/theme';
import './ImageGenerateWorkspace.css';

type PopKind = 'token' | 'model' | 'params' | null;

const ImageGenerateWorkspace: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const { t, i18n } = useTranslation();
  const dockRef = useRef<HTMLDivElement>(null);
  const popPointerDownInsideRef = useRef(false);
  const galleryRef = useRef<HTMLElement>(null);
  const activeAbortsRef = useRef<Set<AbortController>>(new Set());
  const generatingInFlightRef = useRef(false);
  const generatingEpochRef = useRef(0);
  const { models, loading, error, getInitialParams } = usePlaygroundImageModels();

  useEffect(() => {
    const id = 'hf-ig-sora-font';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  const [selectedMid, setSelectedMid] = useState<string>(() => loadSavedImageGenModelMid());
  const modelParamsHydratedRef = useRef(false);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds = 3) => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    setCooldownRemaining(seconds);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  const [openPop, setOpenPop] = useState<PopKind>(null);
  const [items, setItems] = useState<GeneratedImageItem[]>([]);
  const [listReady, setListReady] = useState(false);
  const { searchKeyword: modelSearch, searchInputProps: modelSearchInputProps, setSearchKeyword: setModelSearch } = useDebouncedSearchKeyword();
  const [apiTokens, setApiTokens] = useState<ApiTokenItem[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState('');
  const [tokensLoading, setTokensLoading] = useState(true);
  const [detailItem, setDetailItem] = useState<GeneratedImageItem | null>(null);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [refPreviewUrl, setRefPreviewUrl] = useState<string | null>(null);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const autoGenerateOnceRef = useRef(false);

  useEffect(() => {
    if (!refPreviewUrl) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRefPreviewUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [refPreviewUrl]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const [list, tokens] = await Promise.all([
          loadGeneratedImagesFromServer(),
          loadApiTokens(),
        ]);
        if (cancelled) return;
        setApiTokens(tokens);
        const token = selectedTokenKey || pickSavedTokenKey(tokens);
        if (token && !selectedTokenKey) {
          setSelectedTokenKey(token);
        }
        const filteredList = list.filter((it) => !isFailedOutputExpired(it));
        setItems(filteredList);
        setListReady(true);
        setTokensLoading(false);

        const onLocalUpdate = (id: string, next: GeneratedImageItem | null) => {
          if (cancelled) return;
          setItems((prev) => {
            if (!next) return prev.filter((it) => it.id !== id);
            return prev.map((it) => (it.id === id ? { ...it, ...next } : it));
          });
        };
        await Promise.all([
          resumePendingImageItems({
            items: filteredList,
            tokenKey: token,
            signal: controller.signal,
            onLocalUpdate,
          }),
          resumeUnpersistedOutputs({
            items: filteredList,
            signal: controller.signal,
            onLocalUpdate,
          }),
        ]);
      } catch (e) {
        if (!cancelled) {
          setListReady(true);
          setTokensLoading(false);
        }
        console.warn('[outputs] 加载/恢复图片作品失败', e);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3 分钟自洁：自动清理已超过 3 分钟且未成功生成过的失败卡片
  useEffect(() => {
    const timer = window.setInterval(() => {
      setItems((prev) => {
        const hasExpired = prev.some((it) => isFailedOutputExpired(it));
        if (!hasExpired) return prev;
        return prev.filter((it) => !isFailedOutputExpired(it));
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const currentModel: PlaygroundModel | null = useMemo(
    () => models.find((m) => m.mid === selectedMid) || models[0] || null,
    [models, selectedMid],
  );
  const layerSplitOn = !!paramValues.layer_decomposition;
  const maxReferenceImages = layerSplitOn ? 1 : resolveMaxReferenceImages(currentModel);

  useEffect(() => {
    setReferenceUrls((prev) => (prev.length > maxReferenceImages ? prev.slice(0, maxReferenceImages) : prev));
  }, [maxReferenceImages]);

  useEffect(() => {
    if (!layerSplitOn) return;
    const sizeParam = (currentModel?.params || []).find(
      (p) => (p.key || '').toLowerCase() === 'size',
    );
    const next = coerceSizeForLayerDecomposition(paramValues.size, sizeParam?.options);
    if (String(paramValues.size || '') === next) return;
    setParamValues((prev) => ({ ...prev, size: next }));
  }, [layerSplitOn, currentModel, paramValues.size]);

  // 背景透明或开启图层拆分时，图片格式自动切换为 png 且不可修改
  const isOutputFormatLocked = paramValues.background === 'transparent' || layerSplitOn;
  useEffect(() => {
    if (!isOutputFormatLocked) return;
    if (paramValues.output_format === 'png') return;
    setParamValues((prev) => ({ ...prev, output_format: 'png' }));
  }, [isOutputFormatLocked, paramValues.output_format]);

  const dayGroups = useMemo(
    () =>
      groupItemsByDay(
        [...items]
          .filter((it) => !isFailedOutputExpired(it))
          .sort((a, b) => b.createdAt - a.createdAt),
        {
          locale: i18n.language,
          order: 'desc',
          todayLabel: t('playground_2026:day_today', '今天'),
          yesterdayLabel: t('playground_2026:day_yesterday', '昨天'),
        },
      ),
    [items, i18n.language, t],
  );

  // 模型列表就绪：恢复 localStorage 选择；无记录或不匹配则选第一项
  useEffect(() => {
    if (models.length === 0) return;
    const nextMid = resolvePreferredModelMid(
      models,
      selectedMid,
      loadSavedImageGenModelMid(),
    );
    if (!nextMid) return;
    const model = models.find((m) => m.mid === nextMid);
    if (!model) return;

    if (selectedMid !== nextMid) {
      setSelectedMid(nextMid);
      setParamValues(getInitialParams(model));
      modelParamsHydratedRef.current = true;
      saveImageGenModelMid(nextMid);
      return;
    }

    if (!modelParamsHydratedRef.current) {
      setParamValues(getInitialParams(model));
      modelParamsHydratedRef.current = true;
      saveImageGenModelMid(nextMid);
    }
  }, [models, selectedMid, getInitialParams]);

  // 从侧栏 / 列表页「重试 / 参考」带入的种子（含同页事件）
  const applyImageGenSeed = useCallback(() => {
    if (models.length === 0) return;
    const seed = consumeImageGenSeed();
    if (!seed) return;
    if (seed.prompt) setPrompt(stripMentionArtifacts(seed.prompt));
    const seedRefs = [
      ...(Array.isArray(seed.referenceUrls) ? seed.referenceUrls : []),
      ...(seed.referenceUrl ? [seed.referenceUrl] : []),
      ...getReferenceUrls(seed.paramValues),
    ].filter(Boolean);
    if (seedRefs.length > 0) {
      const seedModel = seed.modelMid
        ? models.find((x) => x.mid === seed.modelMid) || currentModel
        : currentModel;
      setReferenceUrls(
        Array.from(new Set(seedRefs)).slice(0, resolveMaxReferenceImages(seedModel)),
      );
    }
    if (seed.modelMid && models.some((m) => m.mid === seed.modelMid)) {
      const m = models.find((x) => x.mid === seed.modelMid)!;
      setSelectedMid(m.mid);
      modelParamsHydratedRef.current = true;
      saveImageGenModelMid(m.mid);
      setParamValues(
        clampImageModelParams(
          {
            ...getInitialParams(m),
            ...extractParamValues(seed.paramValues),
          },
          m,
        ),
      );
    } else if (seed.paramValues) {
      setParamValues((prev) =>
        clampImageModelParams(
          { ...prev, ...extractParamValues(seed.paramValues) },
          currentModel,
        ),
      );
    }
    if (seed.autoGenerate) {
      autoGenerateOnceRef.current = true;
    }
  }, [models, getInitialParams, currentModel]);

  useEffect(() => {
    applyImageGenSeed();
  }, [applyImageGenSeed]);

  useEffect(() => {
    const onSeed = () => applyImageGenSeed();
    const handleOpenRef = () => setRefPickerOpen(true);
    window.addEventListener(IMAGE_GEN_SEED_EVENT, onSeed);
    window.addEventListener('pg-open-ref-picker', handleOpenRef);
    return () => {
      window.removeEventListener(IMAGE_GEN_SEED_EVENT, onSeed);
      window.removeEventListener('pg-open-ref-picker', handleOpenRef);
    };
  }, [applyImageGenSeed]);

  useEffect(() => {
    return () => {
      for (const c of activeAbortsRef.current) c.abort();
      activeAbortsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // 下拉展开时点面板/遮罩：本次 click 只收起下拉，不关属性面板
      popPointerDownInsideRef.current =
        isInsidePlaygroundSettingsLayer(e.target) || isPlaygroundSelectMenuOpen();
    };
    const onDocClick = (e: MouseEvent) => {
      // Select trigger 的 preventDefault 会把后续 click 打到遮罩/画布上，以 pointerdown 落点为准
      if (popPointerDownInsideRef.current) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (dockRef.current?.contains(target)) return;
      if (isInsidePlaygroundSettingsLayer(target)) return;
      setOpenPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPop(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const selectModel = (model: PlaygroundModel) => {
    setSelectedMid(model.mid);
    setParamValues(getInitialParams(model));
    modelParamsHydratedRef.current = true;
    saveImageGenModelMid(model.mid);
    // 保持模型面板打开，便于立刻改该方案参数
    setModelSearch('');
  };

  const selectToken = (tokenKey: string) => {
    setSelectedTokenKey(tokenKey);
    saveSelectedTokenKey(tokenKey);
    setOpenPop(null);
    // 换密钥后尝试续跑仍 pending 的任务
    const pending = items.filter((it) => it.status === 'pending');
    if (pending.length === 0) return;
    void resumePendingImageItems({
      items: pending,
      tokenKey,
      onLocalUpdate: (id, next) => {
        setItems((prev) => {
          if (!next) return prev.filter((it) => it.id !== id);
          return prev.map((it) => (it.id === id ? { ...it, ...next } : it));
        });
      },
    });
  };

  const setParam = (key: string, value: any) => {
    const isLocked = paramValues.background === 'transparent' || layerSplitOn;
    if (key === 'output_format' && isLocked) {
      return;
    }
    setParamValues((prev) => {
      const next = { ...prev, [key]: value };
      if ((key === 'background' && value === 'transparent') || (key === 'layer_decomposition' && value)) {
        next.output_format = 'png';
      }
      return next;
    });
  };

  const filteredModels = useMemo(() => {
    const kw = modelSearch.trim().toLowerCase();
    if (!kw) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(kw) ||
        m.model_id.toLowerCase().includes(kw) ||
        (m.scheme_name || '').toLowerCase().includes(kw),
    );
  }, [models, modelSearch]);


  const handleGenerate = async () => {
    const trimmed = stripMentionArtifacts(prompt).trim();
    if (!trimmed && !layerSplitOn) {
      message.warning(t('playground_2026:image_gen_prompt_required', '请输入提示词'));
      return;
    }
    if (!currentModel) {
      message.warning(t('playground_2026:image_gen_no_model', '暂无可用图片模型'));
      return;
    }
    if (!selectedTokenKey) {
      if (apiTokens.length === 0) {
        message.warning(t('playground_2026:no_token_create_first', '当前没有生成密钥，请先创建 API 密钥'));
      } else {
        message.warning(t('playground_2026:image_gen_no_token', '请先选择 API 密钥'));
      }
      setOpenPop('token');
      return;
    }
    if (generatingInFlightRef.current || generating || cooldownRemaining > 0) return;
    if (layerSplitOn && referenceUrls.length !== 1) {
      message.warning(
        t('playground_2026:image_layer_split_need_one_ref', '图层拆分需要恰好 1 张参考图'),
      );
      return;
    }

    generatingInFlightRef.current = true;
    const myUiEpoch = ++generatingEpochRef.current;
    let cooldownTriggered = false;
    const releaseGeneratingUi = () => {
      if (generatingEpochRef.current !== myUiEpoch) return;
      generatingInFlightRef.current = false;
      setGenerating(false);
      if (!cooldownTriggered) {
        cooldownTriggered = true;
        startCooldown(3);
      }
    };

    const controller = new AbortController();
    activeAbortsRef.current.add(controller);

    setGenerating(true);
    setOpenPop(null);

    const nRaw = paramValues.n ?? paramValues.batch_size ?? paramValues.variations ?? 1;
    const n = layerSplitOn
      ? 1
      : Math.min(4, Math.max(1, Number(nRaw) || 1));
    const aspect = deriveAspectRatio(paramValues);
    const resolution =
      paramValues.resolution != null
        ? String(paramValues.resolution)
        : typeof paramValues.size === 'string' && /[kK]$/.test(paramValues.size)
          ? paramValues.size
          : undefined;

    let batch: GeneratedImageItem[] = [];
    const sysLogId = generateLogId();

    let resolvedRefs = referenceUrls;
    if (referenceUrls.some((u) => isBlobUrl(u))) {
      try {
        resolvedRefs = await ensureRemoteUrls(referenceUrls);
        setReferenceUrls(resolvedRefs);
      } catch (err: any) {
        activeAbortsRef.current.delete(controller);
        releaseGeneratingUi();
        message.error(
          err?.message ||
            t('playground_2026:image_ref_upload_failed', '参考图上传失败'),
        );
        return;
      }
    }

    try {
      const created = await createAssetsBatch({
        mediaType: 'image',
        prompt: trimmed,
        modelName: currentModel.name,
        modelMid: currentModel.mid,
        paramValues: buildGenerationParams(paramValues, currentModel.params, {
          referenceUrls: resolvedRefs,
        }),
        aspectRatio: aspect,
        resolution,
        count: n,
        status: 'pending',
        sysLogId,
      });
      batch = created.items.map((it) => ({ ...it, sysLogId: it.sysLogId || sysLogId }));
      setItems((prev) => [...batch, ...prev]);
      requestAnimationFrame(() => {
        galleryRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
      // 提交生成成功且卡片进入生成中状态后，立即释放输入框与生成按钮，允许用户连续提交
      releaseGeneratingUi();
    } catch (err: any) {
      activeAbortsRef.current.delete(controller);
      releaseGeneratingUi();
      message.error(err?.message || t('playground_2026:image_gen_create_failed', '创建作品记录失败'));
      return;
    }

    const batchIds = new Set(batch.map((b) => b.id));
    const markBatch = (updater: (it: GeneratedImageItem) => GeneratedImageItem) => {
      setItems((prev) => prev.map((it) => (batchIds.has(it.id) ? updater(it) : it)));
    };
    const persistBatch = async (
      updater: (it: GeneratedImageItem) => GeneratedImageItem,
      patchFor: (it: GeneratedImageItem) => Parameters<typeof updateAsset>[1],
    ) => {
      markBatch(updater);
      await Promise.all(
        batch.map(async (b) => {
          const next = updater(b);
          try {
            await updateAsset(b.id, patchFor(next));
          } catch (e) {
            console.warn('[outputs] 更新作品失败', b.id, e);
          }
        }),
      );
    };

    try {
      const result = await generateImagesFillingCount({
        model: currentModel,
        prompt: trimmed,
        paramValues: layerSplitOn ? { ...paramValues, n: 1 } : paramValues,
        tokenKey: selectedTokenKey,
        count: n,
        signal: controller.signal,
        sysLogId,
        referenceUrls: resolvedRefs.length > 0 ? resolvedRefs : undefined,
        onAsyncStarted: (taskId) => {
          releaseGeneratingUi();
          markBatch((it) => ({ ...it, taskId, sysLogId }));
          void Promise.all(
            batch.map((b) =>
              updateAsset(b.id, { taskId, sysLogId }).catch(() => undefined),
            ),
          );
        },
      });

      if (result.urls.length <= 0) {
        throw new Error(t('playground_2026:image_gen_no_url', '生成成功但未返回图片地址'));
      }
      if (result.urls.length > batch.length) {
        try {
          const extra = await createAssetsBatch({
            mediaType: 'image',
            prompt: trimmed,
            modelName: currentModel.name,
            modelMid: currentModel.mid,
            paramValues: buildGenerationParams(paramValues, currentModel.params, {
              referenceUrls: resolvedRefs,
            }),
            aspectRatio: aspect,
            resolution,
            count: result.urls.length - batch.length,
            status: 'pending',
            sysLogId,
            batchId: batch[0]?.batchId,
          });
          batch = [...batch, ...extra.items];
          setItems((prev) => {
            const have = new Set(prev.map((p) => p.id));
            const add = extra.items.filter((i) => !have.has(i.id));
            return add.length ? [...add, ...prev] : prev;
          });
        } catch (e) {
          console.warn('[outputs] 补齐图层作品失败', e);
        }
      }
      const settled = await settleThenPersistBatchMedia({
        batch,
        urls: result.urls,
        taskId: result.taskId,
        sysLogId: result.sysLogId || sysLogId,
        onLocalUpdate: (id, next) => {
          setItems((prev) => {
            if (!next) return prev.filter((it) => it.id !== id);
            return prev.map((it) => (it.id === id ? next : it));
          });
        },
      });
      if (settled.returned <= 0) {
        throw new Error(t('playground_2026:image_gen_no_url', '生成成功但未返回图片地址'));
      }
      const persistFails = settled.kept.filter((it) => it.status === 'error');
      if (persistFails.length > 0) {
        message.error(
          persistFails[0]?.errorMessage ||
            t('playground_2026:output_persist_failed', '转存失败'),
        );
      } else if (settled.returned < settled.requested) {
        message.success(
          t(
            'playground_2026:image_gen_partial_success',
            '已生成 {{got}} 张（请求 {{want}} 张）',
            { got: settled.returned, want: settled.requested },
          ),
        );
      } else {
        message.success(t('playground_2026:image_gen_success', '生成成功'));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        // 页面离开/刷新中止：保持 pending，便于重新打开或异地续跑
        return;
      }
      const errMsg = formatGenerationError(err);
      if (batch.length > 1) {
        // 批次预占位失败：仅保留第 1 张占位卡片记录该次报错，其余多余预占位予以清理，避免 1 次请求报错产生多张重复错误卡片
        const [first, ...rest] = batch;
        if (first) {
          const next = { ...first, status: 'error' as const, errorMessage: errMsg };
          setItems((prev) => prev.map((it) => (it.id === first.id ? next : it)));
          try {
            await updateAsset(first.id, { status: 'error', errorMessage: errMsg });
          } catch (e) {
            console.warn('[outputs] 更新作品失败', first.id, e);
          }
        }
        if (rest.length > 0) {
          const restIds = new Set(rest.map((r) => r.id));
          setItems((prev) => prev.filter((it) => !restIds.has(it.id)));
          await Promise.all(
            rest.map((r) =>
              deleteAsset(r.id).catch((e) => {
                console.warn('[outputs] 清理失败多余占位卡片失败', r.id, e);
              }),
            ),
          );
        }
      } else {
        await persistBatch(
          (it) => ({ ...it, status: 'error', errorMessage: errMsg }),
          (it) => ({ status: 'error', errorMessage: it.errorMessage }),
        );
      }
      message.error(errMsg);
    } finally {
      activeAbortsRef.current.delete(controller);
      releaseGeneratingUi();
    }
  };

  useEffect(() => {
    if (!autoGenerateOnceRef.current) return;
    if (!selectedMid || !selectedTokenKey || !prompt.trim() || loading || tokensLoading || generating || generatingInFlightRef.current || cooldownRemaining > 0) {
      return;
    }
    autoGenerateOnceRef.current = false;
    void handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMid, selectedTokenKey, prompt, loading, tokensLoading, generating, cooldownRemaining]);

  const applyItemToComposer = (it: GeneratedImageItem) => {
    setPrompt(stripMentionArtifacts(it.prompt || ''));
    const storedParams = extractParamValues(it.paramValues);
    const storedRefs = getReferenceUrls(it.paramValues);
    if (storedRefs.length > 0) {
      setReferenceUrls(storedRefs.slice(0, maxReferenceImages));
    }
    if (it.modelMid && models.some((m) => m.mid === it.modelMid)) {
      const m = models.find((x) => x.mid === it.modelMid)!;
      setSelectedMid(m.mid);
      modelParamsHydratedRef.current = true;
      saveImageGenModelMid(m.mid);
      setParamValues(
        clampImageModelParams({ ...getInitialParams(m), ...storedParams }, m),
      );
    } else if (Object.keys(storedParams).length > 0) {
      setParamValues((prev) =>
        clampImageModelParams({ ...prev, ...storedParams }, currentModel),
      );
    }
  };

  const handleRecreateFromDetail = (it: GeneratedImageItem) => {
    applyItemToComposer(it);
    autoGenerateOnceRef.current = true;
  };

  const handleReferenceFromDetail = (it: GeneratedImageItem) => {
    const url = it.previewUrl;
    if (!url) return;
    const limit = Math.max(1, maxReferenceImages);
    setReferenceUrls((prev) => {
      const filtered = prev.filter((x) => x !== url);
      if (filtered.length >= limit) {
        return [...filtered.slice(0, limit - 1), url];
      }
      return [...filtered, url];
    });
  };

  const handleReferenceVideoFromDetail = (it: GeneratedImageItem) => {
    if (!it.previewUrl) return;
    saveVideoGenSeed({
      referenceUrls: [it.previewUrl],
      autoGenerate: false,
    });
    window.open('/playground-2026/videos', '_blank');
    message.success(
      t('playground_2026:image_detail_reference_video_opened', '已带到视频生成'),
    );
  };

  const tryAddReferenceUrls = (urls: string[]) => {
    const unique = urls.filter((u) => typeof u === 'string' && !!u && !referenceUrls.includes(u));
    if (!unique.length) return;
    const room = maxReferenceImages - referenceUrls.length;
    if (room <= 0) {
      message.warning(
        t('playground_2026:image_ref_limit', '参考图最多 {{n}} 张', {
          n: maxReferenceImages,
        }),
      );
      return;
    }
    if (unique.length > room) {
      message.warning(
        t('playground_2026:image_ref_limit', '参考图最多 {{n}} 张', {
          n: maxReferenceImages,
        }),
      );
    }
    setReferenceUrls((prev) => {
      const next = [...prev];
      for (const url of unique) {
        if (!next.includes(url) && next.length < maxReferenceImages) next.push(url);
      }
      return next;
    });
  };

  const onConfirmFromResourceModal = (picked: FlowAssetPickResult[]) => {
    const imagePicks = picked.filter((p) => p.kind === 'image' && p.url);
    if (!imagePicks.length) {
      if (picked.length) {
        message.warning(t('playground_2026:image_ref_type_invalid', '请选择图片文件'));
      }
      return;
    }
    tryAddReferenceUrls(imagePicks.map((p) => p.url));
  };

  const addReferenceFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter(isAcceptableReferenceFile);
    if (list.length === 0) {
      message.warning(t('playground_2026:image_ref_type_invalid', '请上传图片文件'));
      return;
    }
    const room = maxReferenceImages - referenceUrls.length;
    if (room <= 0) {
      message.warning(
        t('playground_2026:image_ref_limit', '参考图最多 {{n}} 张', {
          n: maxReferenceImages,
        }),
      );
      return;
    }
    const { picks, warnings } = buildLocalFlowPicks(list.slice(0, room), {
      constrainKind: 'image',
    });
    if (list.length > room) {
      message.warning(
        t('playground_2026:image_ref_limit', '参考图最多 {{n}} 张', {
          n: maxReferenceImages,
        }),
      );
    }
    for (const w of Array.from(new Set(warnings))) message.warning(w);
    if (picks.length) tryAddReferenceUrls(picks.map((p) => p.url));
  };

  const mentionAssets = useMemo(
    () => buildRefMentionAssets(referenceUrls),
    [referenceUrls],
  );

  const removeReferenceAt = (index: number) => {
    setPrompt((prev) => removeAndRenumberRefMentions(prev, index));
    setReferenceUrls((prev) => {
      const removed = prev[index];
      if (removed && isBlobUrl(removed)) unregisterLocalFile(removed);
      return prev.filter((_, i) => i !== index);
    });
  };

  const onDockDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDockDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) {
      void addReferenceFiles(e.dataTransfer.files);
    }
  };

  const onDockPaste = (e: React.ClipboardEvent) => {
    const files = filesFromClipboardData(e.clipboardData).filter(isAcceptableReferenceFile);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    addReferenceFiles(files);
  };

  const onPromptKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (generatingInFlightRef.current || generating || cooldownRemaining > 0) return;
      void handleGenerate();
    }
  };

  const removeItem = (id: string) => {
    Modal.confirm({
      title: t('playground_2026:works_delete_confirm', '确认删除此资源？'),
      okText: t('playground_2026:delete_work', '删除资源'),
      okType: 'danger',
      cancelText: t('common.cancel', '取消'),
      centered: true,
      onOk: async () => {
        setItems((prev) => prev.filter((it) => it.id !== id));
        try {
          await deleteAsset(id);
          message.success(t('playground_2026:works_deleted', '已删除'));
        } catch (e) {
          console.warn('[outputs] 删除作品失败', id, e);
          message.error(t('playground_2026:works_delete_failed', '删除失败'));
        }
      },
    });
  };

  const togglePop = (kind: Exclude<PopKind, null>, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenPop((prev) => (prev === kind ? null : kind));
  };

  return (
    <div className={`hf-ig-root${embedded ? ' hf-ig-embedded' : ''}`}>
      {!embedded && (
      <header className="hf-ig-topbar">
        <div className="hf-ig-brand">
          <button
            type="button"
            className="hf-ig-back"
            onClick={() => navigate('/playground-2026/images')}
          >
            <ArrowLeftOutlined />
            {t('playground_2026:images', '图片')}
          </button>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
          <span className="hf-ig-nav-active">
            {t('playground_2026:generate_image', '生成图片')}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--hf-muted)' }}>
          {loading ? (
            <LoadingOutlined />
          ) : (
            <>
              {models.length} models · {items.length}{' '}
              {t('playground_2026:image_gen_items', '项')}
            </>
          )}
        </div>
      </header>
      )}

      <section ref={galleryRef} className="hf-ig-gallery">
        {!listReady ? (
          <div className="hf-ig-empty" aria-busy="true" style={{ opacity: 0.35, minHeight: 240 }} />
        ) : items.length === 0 ? (
          <div className="hf-ig-empty">
            <div className="hf-ig-empty-orb">
              <PictureOutlined />
            </div>
            <h2>{t('playground_2026:image_gen_empty_title', '还没有生成图片')}</h2>
            <p>
              {error
                ? error
                : t(
                    'playground_2026:image_gen_empty_desc',
                    '在底部选择图片模型与方案参数，输入提示词后点击生成。',
                  )}
            </p>
          </div>
        ) : (
          <div className="hf-ig-day-groups">
            {dayGroups.map((group) => (
              <section key={group.key} className="hf-ig-day-group">
                <h2 className="hf-ig-day-label">{group.label}</h2>
                <MasonryColumns minColumnWidth={220} gap={14}>
                  {group.items.map((it) => {
                    return (
                      <article
                        key={it.id}
                        className="hf-ig-card hf-works-card"
                        onClick={(e) => {
                          const target = e.target as HTMLElement | null;
                          if (
                            target?.closest('.hf-works-card-actions-tr') ||
                            target?.closest('.hf-works-card-fav') ||
                            target?.closest('.pg-ui-menu') ||
                            target?.closest('.pg-ui-menu-item') ||
                            target?.closest('.pg-ui-modal') ||
                            target?.closest('.pg-ui-modal-overlay') ||
                            target?.closest('[role="menu"]') ||
                            target?.closest('[role="menuitem"]') ||
                            target?.closest('[role="dialog"]')
                          ) {
                            return;
                          }
                          if (it.status === 'done' || it.previewUrl) setDetailItem(it);
                        }}
                        style={{
                          cursor: it.status === 'done' || it.previewUrl ? 'pointer' : undefined,
                          position: 'relative',
                          width: '100%',
                        }}
                      >
                        <div className="hf-ig-card-media" style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
                          {it.status === 'pending' ? (
                            <GeneratingCardProgress
                              createdAt={it.createdAt}
                              label={t('playground_2026:image_gen_pending', '生成中…')}
                            />
                          ) : it.status === 'error' ? (
                            <div className="hf-ig-card-placeholder hf-ig-card-placeholder-error">
                              <PictureOutlined style={{ fontSize: 28, opacity: 0.45 }} />
                              <div className="hf-ig-card-placeholder-title">
                                {it.errorMessage ||
                                  t('playground_2026:image_gen_failed', '生成失败')}
                              </div>
                            </div>
                          ) : it.previewUrl ? (
                            <SmoothMediaPreview
                              src={it.previewUrl}
                              alt={it.prompt}
                              mediaType={it.mediaType || 'image'}
                            />
                          ) : (
                            <div className="hf-ig-card-placeholder">
                              <PictureOutlined style={{ fontSize: 28, opacity: 0.35 }} />
                              <div className="hf-ig-card-placeholder-title">
                                {t('playground_2026:image_gen_no_preview', '暂无预览')}
                              </div>
                              <div className="hf-ig-card-placeholder-sub">
                                {it.model || currentModel?.name || '—'}
                              </div>
                            </div>
                          )}
                          <div className="pg-ig-badge">
                            {(it.mediaType || 'image') === 'video'
                              ? t('playground_2026:videos', '视频')
                              : t('playground_2026:images', '图片')}
                          </div>
                          <WorkCardChrome
                            item={{ ...it, mediaType: it.mediaType || 'image' }}
                            isLight={isLight}
                            alwaysShowActions={false}
                            hideOpen
                            onOpen={(item) => {
                              if (item.status === 'done' || item.previewUrl) setDetailItem(item);
                            }}
                            onDelete={(item) => {
                              void removeItem(item.id);
                            }}
                            onItemChange={(next) => {
                              setItems((prev) =>
                                prev.map((x) => (x.id === next.id ? { ...x, ...next } : x)),
                              );
                            }}
                            leadingMenuItems={
                              it.previewUrl
                                ? [
                                    {
                                      key: 'reference',
                                      icon: <PictureOutlined />,
                                      label: t(
                                        'playground_2026:image_add_to_prompt',
                                        '加入提示词',
                                      ),
                                      onClick: ({ domEvent }) => {
                                        domEvent.stopPropagation();
                                        handleReferenceFromDetail(it);
                                      },
                                    },
                                  ]
                                : undefined
                            }
                          />
                        </div>
                      </article>
                    );
                  })}
                </MasonryColumns>
              </section>
            ))}
          </div>
        )}
      </section>

      <div className="hf-ig-dock-wrap">
        <div
          className="hf-ig-dock"
          ref={dockRef}
          onDragOver={onDockDragOver}
          onDrop={onDockDrop}
          onPaste={onDockPaste}
        >
          <div className="hf-ig-dock-main">
            <div
              className={`hf-ig-composer${referenceUrls.length > 0 ? ' has-refs' : ''}`}
            >
              <div className="hf-ig-ref-row">
                {referenceUrls.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="hf-ig-ref-thumb-wrap">
                    <button
                      type="button"
                      className="hf-ig-ref-thumb-btn"
                      title={t('playground_2026:image_ref_preview', '预览参考图')}
                      onClick={() => setRefPreviewUrl(url)}
                    >
                      <img src={url} alt="" className="hf-ig-ref-thumb" />
                    </button>
                    <button
                      type="button"
                      className="hf-ig-ref-clear"
                      title={t('common.delete', '删除')}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeReferenceAt(idx);
                      }}
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                ))}
                {referenceUrls.length < maxReferenceImages && (
                  <button
                    type="button"
                    className={`hf-ig-ref-add${refPickerOpen ? ' is-open' : ''}`}
                    title={t('playground_2026:image_ref_add', '添加参考图')}
                    onClick={() => setRefPickerOpen(true)}
                  >
                    <PlusOutlined />
                  </button>
                )}
                {referenceUrls.length > 0 && (
                  <span className="hf-ig-ref-label">
                    {t('playground_2026:image_detail_reference', '参考')}{' '}
                    {referenceUrls.length}/{maxReferenceImages}
                  </span>
                )}
              </div>
              <MentionPromptField
                className="hf-ig-dock-prompt"
                value={prompt}
                onChange={setPrompt}
                assets={mentionAssets}
                onKeyDown={onPromptKeyDown}
                placeholder={t(
                  'playground_2026:image_gen_prompt_ph',
                  '描述你想象中的画面',
                )}
                autoHeight
                minHeight={referenceUrls.length > 0 ? 48 : 36}
                maxHeight={referenceUrls.length > 0 ? 160 : 120}
                showResize
                isLight={false}
              />
            </div>

            <div className="hf-ig-dock-toolbar">
              <div className="hf-ig-dock-toolbar-start">
                <TokenSelectorPop
                  tokens={apiTokens}
                  selectedTokenKey={selectedTokenKey}
                  onTokensChange={setApiTokens}
                  onSelect={selectToken}
                  variant="toolbar"
                  disabled={tokensLoading}
                  open={openPop === 'token'}
                  onOpenChange={(o) => setOpenPop(o ? 'token' : null)}
                />

                <ModelSettingsPanel
                  open={openPop === 'model'}
                  onOpenChange={(o) => setOpenPop(o ? 'model' : null)}
                  models={models}
                  currentModel={currentModel}
                  selectedMid={selectedMid}
                  onSelectModel={selectModel}
                  paramValues={paramValues}
                  onParamChange={setParam}
                  loading={loading}
                  disabled={loading || models.length === 0}
                  searchInputProps={modelSearchInputProps}
                  filteredModels={filteredModels}
                  placement="top"
                  summaryMode="modelOnly"
                  panelContent="both"
                  emptyText={t('playground_2026:image_gen_no_model', '暂无可用图片模型')}
                />

                <ModelSettingsPanel
                  open={openPop === 'params'}
                  onOpenChange={(o) => setOpenPop(o ? 'params' : null)}
                  models={models}
                  currentModel={currentModel}
                  selectedMid={selectedMid}
                  onSelectModel={selectModel}
                  paramValues={paramValues}
                  onParamChange={setParam}
                  loading={loading}
                  disabled={loading || models.length === 0}
                  searchInputProps={modelSearchInputProps}
                  filteredModels={filteredModels}
                  placement="top"
                  panelContent="params"
                  emptyText={t('playground_2026:image_gen_no_model', '暂无可用图片模型')}
                />
              </div>

              <Tooltip
                title={
                  cooldownRemaining > 0
                    ? t('playground_2026:cooldown_tooltip', '操作太快了，请稍候再试 ({{n}}s)', { n: cooldownRemaining })
                    : !selectedTokenKey
                      ? apiTokens.length === 0
                        ? t('playground_2026:no_token_create_first', '当前没有生成密钥，请先创建密钥')
                        : t('playground_2026:image_gen_no_token', '请先选择 API 密钥')
                      : undefined
                }
                placement="top"
              >
                <span style={{ display: 'inline-flex' }}>
                  <button
                    type="button"
                    className="hf-ig-generate"
                    disabled={generating || cooldownRemaining > 0 || !currentModel || !selectedTokenKey}
                    onClick={() => void handleGenerate()}
                  >
                    <span className="hf-ig-generate-label">
                      {generating
                        ? t('playground_2026:image_gen_pending_short', '生成中')
                        : cooldownRemaining > 0
                          ? `${t('playground_2026:image_gen_submit', '生成')} (${cooldownRemaining}s)`
                          : t('playground_2026:image_gen_submit', '生成')}
                    </span>
                    {generating && <LoadingOutlined className="hf-ig-generate-icon" />}
                  </button>
                </span>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {refPreviewUrl &&
        createPortal(
          <div
            className="hf-ig-ref-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={t('playground_2026:image_ref_preview', '预览参考图')}
            onClick={() => setRefPreviewUrl(null)}
          >
            <button
              type="button"
              className="hf-ig-ref-lightbox-close"
              title={t('common.close', '关闭')}
              onClick={() => setRefPreviewUrl(null)}
            >
              <CloseOutlined />
            </button>
            <img
              src={refPreviewUrl}
              alt=""
              className="hf-ig-ref-lightbox-img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}

      <ImageDetailOverlay
        open={!!detailItem}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onRecreate={handleRecreateFromDetail}
        onReferenceImage={handleReferenceFromDetail}
        onReferenceVideo={handleReferenceVideoFromDetail}
      />

      <FlowAssetLibraryModal
        open={refPickerOpen}
        onClose={() => setRefPickerOpen(false)}
        constrainKind="image"
        onConfirm={onConfirmFromResourceModal}
      />
    </div>
  );
};

export default React.memo(ImageGenerateWorkspace);
