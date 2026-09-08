/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 视频生成工作区 — Higgsfield /ai/video 风格：左侧输入面板 + 右侧画廊
 * 模型列表与方案参数对齐画布 playground-public-config 视频模型
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { message, Modal, Tooltip } from '../ui';
import {
  VideoCameraOutlined,
  ArrowLeftOutlined,
  LoadingOutlined,
  CloseOutlined,
} from '../ui';
import { useTranslation } from 'react-i18next';
import { loadGeneratedVideosFromServer } from '../utils/videoGenStorage';
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
  getQuickBarParams,
  getNonQuickBarParams,
  usePlaygroundVideoModels,
} from '../hooks/usePlaygroundVideoModels';
import { useDebouncedSearchKeyword } from '../hooks/useDebouncedSearchKeyword';
import {
  formatGenerationError,
  generateVideosWithModel,
  generateLogId,
  loadApiTokens,
  pickSavedTokenKey,
  saveSelectedTokenKey,
} from '../utils/videoGenerationApi';
import type { ApiTokenItem } from '../utils/videoGenerationApi';
import { resumePendingVideoItems } from '../utils/resumePendingVideoOutputs';
import { resumeUnpersistedOutputs } from '../utils/outputPersist';
import {
  consumeVideoGenSeed,
  VIDEO_GEN_SEED_EVENT,
} from '../utils/videoGenSeed';
import {
  isAcceptableReferenceFile,
  filesFromClipboardData,
} from '../utils/referenceUpload';
import { ensureRemoteUrlMap, buildLocalFlowPicks } from '../utils/deferredLocalUpload';
import { isBlobUrl } from '../utils/localFileRegistry';
import { groupItemsByDay } from '../utils/groupImagesByDay';
import {
  isInsidePlaygroundSettingsLayer,
  isPlaygroundSelectMenuOpen,
} from '../utils/isInsidePlaygroundSettingsLayer';
import { settleThenPersistBatchMedia } from '../utils/settleBatchMedia';
import {
  buildGenerationParams,
  clampParamsToSchemeOptions,
  extractParamValues,
  getReferenceUrls,
} from '../utils/generationParams';
import {
  loadSavedVideoGenModelMid,
  resolvePreferredModelMid,
  saveVideoGenModelMid,
} from '../utils/genModelPreference';
import {
  collectAllMediaUrls,
  emptyIoValuesForPorts,
  ensureEditVideoPorts,
  ensureExtendVideoPorts,
  ensureFirstFramePorts,
  ensureOmniOrFramePorts,
  extractIoValuesFromStored,
  getMediaInputPorts,
  getPortUrls,
  getPromptFromIoValues,
  getToolInputPorts,
  migrateIoValuesOnModelChange,
  portAcceptKinds,
  portMaxFiles,
  remapIoMediaUrls,
  setPromptInIoValues,
  type SchemeIoToolValues,
} from '../utils/schemeIoToolValues';
import ImageDetailOverlay from './ImageDetailOverlay';
import ModelSettingsPanel from './ModelSettingsPanel';
import QuickBarParams from './QuickBarParams';
import SchemeParamFields from './SchemeParamFields';
import SchemeIoComposer from './SchemeIoComposer';
import TokenSelectorPop from './TokenSelectorPop';
import VideoToolsWheel, { buildVideoTools } from './VideoToolsWheel';
import {
  DEFAULT_VIDEO_FEATURE,
  isVideoFeatureKey,
  modelsForFeature,
  pickVideoFeatureForModel,
  videoFeatureKeysFromModel,
} from '../config/modelFeatures';
import WorkCardChrome from './WorkCardChrome';
import { formatWorkCardTime } from '../utils/workCardHelpers';
import './WorksList.css';
import MasonryColumns from './MasonryColumns';
import GeneratingCardProgress from './GeneratingCardProgress';
import SmoothMediaPreview from './SmoothMediaPreview';
import { useThemeStore } from '../../../../store/theme';
import './ImageGenerateWorkspace.css';
import './VideoGenerateWorkspace.css';

type PopKind = string | null; // 'model' | param.key

const VideoGenerateWorkspace: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
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
  const { models, videoFeatures, loading, error, getInitialParams } = usePlaygroundVideoModels();
  const videoTools = useMemo(() => buildVideoTools(videoFeatures), [videoFeatures]);

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

  const [selectedMid, setSelectedMid] = useState<string>(() => loadSavedVideoGenModelMid());
  const modelParamsHydratedRef = useRef(false);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [ioValues, setIoValues] = useState<SchemeIoToolValues>({ prompt: '' });
  const [ioStash, setIoStash] = useState<SchemeIoToolValues>({});
  const ioStashRef = useRef<SchemeIoToolValues>({});
  ioStashRef.current = ioStash;
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
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768,
  );
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [sheetClosing, setSheetClosing] = useState(false);
  const sheetCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleOpenSheet = useCallback(() => {
    if (sheetCloseTimerRef.current !== null) {
      clearTimeout(sheetCloseTimerRef.current);
      sheetCloseTimerRef.current = null;
    }
    setSheetClosing(false);
    setCreateSheetOpen(true);
  }, []);

  const handleCloseSheet = useCallback(() => {
    if (!createSheetOpen || sheetClosing) return;
    setOpenPop(null);
    setSheetClosing(true);
    if (sheetCloseTimerRef.current !== null) {
      clearTimeout(sheetCloseTimerRef.current);
    }
    sheetCloseTimerRef.current = setTimeout(() => {
      setCreateSheetOpen(false);
      setSheetClosing(false);
      sheetCloseTimerRef.current = null;
    }, 280);
  }, [createSheetOpen, sheetClosing]);

  const [videoToolMode, setVideoToolMode] = useState(DEFAULT_VIDEO_FEATURE);
  const [modeTransitioning, setModeTransitioning] = useState(false);
  const modeTransitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoGenerateOnceRef = useRef(false);
  const prevModelMidForIoRef = useRef<string | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (modeTransitionTimerRef.current !== null) {
        clearTimeout(modeTransitionTimerRef.current);
      }
      if (sheetCloseTimerRef.current !== null) {
        clearTimeout(sheetCloseTimerRef.current);
      }
    };
  }, []);

  const featureModels = useMemo(
    () => modelsForFeature(models, videoToolMode),
    [models, videoToolMode],
  );

  const handleToolModeChange = useCallback((modeId: string) => {
    setVideoToolMode(modeId);
    setModeTransitioning(true);
    if (modeTransitionTimerRef.current !== null) {
      clearTimeout(modeTransitionTimerRef.current);
    }
    modeTransitionTimerRef.current = setTimeout(() => {
      setModeTransitioning(false);
      modeTransitionTimerRef.current = null;
    }, 1000);
    const compatible = modelsForFeature(models, modeId);
    if (compatible.length === 0) return;
    const stillOk = compatible.some((m) => m.mid === selectedMid);
    if (stillOk) return;
    const next = compatible[0];
    setSelectedMid(next.mid);
    setParamValues(getInitialParams(next));
    modelParamsHydratedRef.current = true;
    saveVideoGenModelMid(next.mid);
  }, [models, selectedMid, getInitialParams]);

  const currentModel: PlaygroundModel | null = useMemo(
    () => featureModels.find((m) => m.mid === selectedMid) || featureModels[0] || null,
    [featureModels, selectedMid],
  );
  const quickBarParams = useMemo(() => getQuickBarParams(currentModel), [currentModel]);
  const restParams = useMemo(() => getNonQuickBarParams(currentModel), [currentModel]);

  const rawIoPorts = useMemo(() => getToolInputPorts(currentModel), [currentModel]);
const isNoNegativePromptScheme = (id?: string | null) =>
  id === 'openai_video' ||
  id === 'seedance2.0' ||
  id === 'seedance2' ||
  id === 'wan3.0' ||
  id === 'dashscope_video';

  const omniAndFrameDualTab = useMemo(() => {
    const keys = videoFeatureKeysFromModel(currentModel);
    return keys.includes('starting-frame') && keys.includes('reference-i2v');
  }, [currentModel]);

  // 按当前功能分类裁剪 IO：只展示方案里真正启用的口
  const ioPorts = useMemo(() => {
    const basePorts = isNoNegativePromptScheme(currentModel?.scheme_id)
      ? rawIoPorts.filter((p) => p.key !== 'negative_prompt' && p.bind_key !== 'negative_prompt')
      : rawIoPorts;
    if (videoToolMode === 'text-to-video') {
      return basePorts.filter((p) => p.modality === 'text' || p.key === 'prompt');
    }
    if (videoToolMode === 'image-to-video') {
      return ensureFirstFramePorts(basePorts);
    }
    if (videoToolMode === 'starting-frame' || videoToolMode === 'reference-i2v') {
      return ensureOmniOrFramePorts(
        basePorts,
        omniAndFrameDualTab,
        videoToolMode === 'reference-i2v' ? 'reference-i2v' : 'starting-frame',
      );
    }
    if (videoToolMode === 'extend') {
      return ensureExtendVideoPorts(basePorts);
    }
    if (videoToolMode === 'edit-video') {
      return ensureEditVideoPorts(basePorts);
    }
    return basePorts;
  }, [rawIoPorts, videoToolMode, omniAndFrameDualTab, currentModel?.scheme_id]);

  const prompt = getPromptFromIoValues(ioValues, ioPorts);

  // 换模 / 切功能：迁移 IO 值（同 key 保留，其余进 stash 可回切恢复）
  useEffect(() => {
    if (!currentModel) return;
    const mid = currentModel.mid;
    const ports = ioPorts;
    if (prevModelMidForIoRef.current == null) {
      setIoValues((prev) => {
        const base = emptyIoValuesForPorts(ports);
        const next: Record<string, any> = { ...base, ...prev, prompt: typeof prev.prompt === 'string' ? prev.prompt : '' };
        if (isNoNegativePromptScheme(currentModel.scheme_id)) {
          delete next.negative_prompt;
          delete next.negativePrompt;
        }
        return next;
      });
      prevModelMidForIoRef.current = mid;
      return;
    }
    setIoValues((prev) => {
      const { values, stash } = migrateIoValuesOnModelChange(
        prev,
        ports,
        ioStashRef.current,
      );
      if (isNoNegativePromptScheme(currentModel.scheme_id)) {
        delete values.negative_prompt;
        delete values.negativePrompt;
        delete stash.negative_prompt;
        delete stash.negativePrompt;
      }
      ioStashRef.current = stash;
      setIoStash(stash);
      return values;
    });
    prevModelMidForIoRef.current = mid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModel?.mid, videoToolMode]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const [list, tokens] = await Promise.all([
          loadGeneratedVideosFromServer(),
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
          resumePendingVideoItems({
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
        console.warn('[outputs] 加载/恢复视频作品失败', e);
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

  // 模型列表就绪：在当前功能特性下恢复选择；无记录或不匹配则选第一项
  useEffect(() => {
    if (featureModels.length === 0) return;
    const nextMid = resolvePreferredModelMid(
      featureModels,
      selectedMid,
      loadSavedVideoGenModelMid(),
    );
    if (!nextMid) return;
    const model = featureModels.find((m) => m.mid === nextMid);
    if (!model) return;

    if (selectedMid !== nextMid) {
      setSelectedMid(nextMid);
      setParamValues(getInitialParams(model));
      modelParamsHydratedRef.current = true;
      saveVideoGenModelMid(nextMid);
      return;
    }

    if (!modelParamsHydratedRef.current) {
      setParamValues(getInitialParams(model));
      modelParamsHydratedRef.current = true;
      saveVideoGenModelMid(nextMid);
    }
  }, [featureModels, selectedMid, getInitialParams]);

  useEffect(() => {
    if (!currentModel || !modelParamsHydratedRef.current) return;
    setParamValues((prev) => clampParamsToSchemeOptions(prev, currentModel.params));
  }, [currentModel]);

  // 从侧栏 / 列表页「重试 / 参考」带入的种子（含同页事件）
  const applyVideoGenSeed = useCallback(() => {
    if (models.length === 0) return;
    const seed = consumeVideoGenSeed();
    if (!seed) return;

    const featureKey =
      seed.featureKey && isVideoFeatureKey(seed.featureKey, videoFeatures)
        ? seed.featureKey
        : undefined;
    const scoped = featureKey ? modelsForFeature(models, featureKey) : models;

    let nextModel: PlaygroundModel | null = currentModel;
    if (seed.preferFirstModel) {
      nextModel = (scoped[0] || models[0] || nextModel) as PlaygroundModel | null;
    } else if (seed.modelMid) {
      const m =
        scoped.find((x) => x.mid === seed.modelMid) ||
        models.find((x) => x.mid === seed.modelMid);
      if (m) nextModel = m;
    }

    const nextFeature =
      featureKey ||
      (seed.preferFirstModel || seed.modelMid
        ? nextModel
          ? pickVideoFeatureForModel(nextModel)
          : DEFAULT_VIDEO_FEATURE
        : null);
    if (nextFeature) setVideoToolMode(nextFeature);

    const switchModel = !!(seed.preferFirstModel || seed.modelMid);
    if (switchModel && nextModel) {
      setSelectedMid(nextModel.mid);
      modelParamsHydratedRef.current = true;
      saveVideoGenModelMid(nextModel.mid);
      setParamValues(
        clampParamsToSchemeOptions(
          {
            ...getInitialParams(nextModel),
            ...extractParamValues(seed.paramValues),
          },
          nextModel.params,
        ),
      );
      prevModelMidForIoRef.current = nextModel.mid;
    } else if (seed.paramValues) {
      setParamValues((prev) =>
        clampParamsToSchemeOptions(
          { ...prev, ...extractParamValues(seed.paramValues) },
          currentModel?.params,
        ),
      );
    }

    const ports = getToolInputPorts(nextModel);
    const fromStored = extractIoValuesFromStored(seed.paramValues);
    let nextIo = emptyIoValuesForPorts(ports);
    if (fromStored) nextIo = { ...nextIo, ...fromStored };
    if (seed.prompt) nextIo = setPromptInIoValues(nextIo, ports, seed.prompt);

    const seedRefs = [
      ...(Array.isArray(seed.referenceUrls) ? seed.referenceUrls : []),
      ...(seed.referenceUrl ? [seed.referenceUrl] : []),
      ...getReferenceUrls(seed.paramValues),
    ].filter(Boolean);
    if (seedRefs.length > 0) {
      const mediaPorts = getMediaInputPorts(ports);
      const imagePort =
        mediaPorts.find((p) => portAcceptKinds(p).includes('image')) || mediaPorts[0];
      if (imagePort) {
        const max = portMaxFiles(imagePort);
        nextIo[imagePort.key] = Array.from(new Set(seedRefs)).slice(0, max);
      }
    }
    setIoValues(nextIo);

    if (seed.autoGenerate) {
      autoGenerateOnceRef.current = true;
    }
  }, [models, videoFeatures, getInitialParams, currentModel]);

  useEffect(() => {
    applyVideoGenSeed();
  }, [applyVideoGenSeed]);

  useEffect(() => {
    const onSeed = () => applyVideoGenSeed();
    window.addEventListener(VIDEO_GEN_SEED_EVENT, onSeed);
    return () => {
      window.removeEventListener(VIDEO_GEN_SEED_EVENT, onSeed);
    };
  }, [applyVideoGenSeed]);

  useEffect(() => {
    return () => {
      for (const c of activeAbortsRef.current) c.abort();
      activeAbortsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      popPointerDownInsideRef.current =
        isInsidePlaygroundSettingsLayer(e.target) || isPlaygroundSelectMenuOpen();
    };
    const onDocClick = (e: MouseEvent) => {
      if (popPointerDownInsideRef.current) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (dockRef.current?.contains(target)) return;
      if (isInsidePlaygroundSettingsLayer(target)) return;
      setOpenPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openPop) {
        setOpenPop(null);
        return;
      }
      if (isMobile && createSheetOpen) handleCloseSheet();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPop, isMobile, createSheetOpen, handleCloseSheet]);

  const selectModel = (model: PlaygroundModel) => {
    setSelectedMid(model.mid);
    setParamValues(getInitialParams(model));
    modelParamsHydratedRef.current = true;
    saveVideoGenModelMid(model.mid);
    setModelSearch('');
    if (isNoNegativePromptScheme(model.scheme_id)) {
      setIoValues((prev) => {
        const next = { ...prev };
        delete next.negative_prompt;
        delete next.negativePrompt;
        return next;
      });
      setIoStash((prev) => {
        const next = { ...prev };
        delete next.negative_prompt;
        delete next.negativePrompt;
        return next;
      });
    }
  };

  const selectToken = (tokenKey: string) => {
    setSelectedTokenKey(tokenKey);
    saveSelectedTokenKey(tokenKey);
    setOpenPop(null);
    // 换密钥后尝试续跑仍 pending 的任务
    const pending = items.filter((it) => it.status === 'pending');
    if (pending.length === 0) return;
    void resumePendingVideoItems({
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
    setParamValues((prev) => ({ ...prev, [key]: value }));
  };

  const resetParams = () => {
    if (!currentModel) return;
    setParamValues(getInitialParams(currentModel));
  };

  const filteredModels = useMemo(() => {
    const kw = modelSearch.trim().toLowerCase();
    if (!kw) return featureModels;
    return featureModels.filter(
      (m) =>
        m.name.toLowerCase().includes(kw) ||
        m.model_id.toLowerCase().includes(kw) ||
        (m.scheme_name || '').toLowerCase().includes(kw),
    );
  }, [featureModels, modelSearch]);


  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      message.warning(t('playground_2026:video_gen_prompt_required', '请输入提示词'));
      return;
    }
    if (!currentModel) {
      message.warning(t('playground_2026:video_gen_no_model', '暂无可用视频模型'));
      return;
    }
    if (!selectedTokenKey) {
      if (apiTokens.length === 0) {
        message.warning(t('playground_2026:no_token_create_first', '当前没有生成密钥，请先创建 API 密钥'));
      } else {
        message.warning(t('playground_2026:video_gen_no_token', '请先选择 API 密钥'));
      }
      setOpenPop('token');
      return;
    }
    for (const port of ioPorts) {
      if (!port.required) continue;
      if (port.modality === 'text') {
        const text = typeof ioValues[port.key] === 'string' ? String(ioValues[port.key]).trim() : '';
        if (!text) {
          message.warning(
            t('playground_2026:io_required_field', '请填写「{{label}}」', {
              label: port.label || port.key,
            }),
          );
          return;
        }
      } else if (getPortUrls(ioValues, port.key).length === 0) {
        message.warning(
          t('playground_2026:io_required_media', '请上传「{{label}}」', {
            label: port.label || port.key,
          }),
        );
        return;
      }
    }
    if (generatingInFlightRef.current || generating || cooldownRemaining > 0) return;

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

    const nRaw = paramValues.n ?? paramValues.batch_size ?? 1;
    const n = Math.min(4, Math.max(1, Number(nRaw) || 1));
    const aspect = deriveAspectRatio(paramValues);
    const resolution =
      paramValues.resolution != null
        ? String(paramValues.resolution)
        : typeof paramValues.size === 'string' && /[kK]$/.test(paramValues.size)
          ? paramValues.size
          : undefined;

    let batch: GeneratedImageItem[] = [];
    const sysLogId = generateLogId();

    let resolvedIo = ioValues;
    const mediaUrls = collectAllMediaUrls(ioValues, ioPorts);
    if (mediaUrls.some((u) => isBlobUrl(u))) {
      try {
        const urlMap = await ensureRemoteUrlMap(mediaUrls);
        resolvedIo = remapIoMediaUrls(ioValues, ioPorts, urlMap);
        setIoValues(resolvedIo);
      } catch (err: any) {
        activeAbortsRef.current.delete(controller);
        releaseGeneratingUi();
        message.error(
          err?.message ||
            t('playground_2026:image_ref_upload_failed', '参考媒体上传失败'),
        );
        return;
      }
    }

    const flatRefs = collectAllMediaUrls(resolvedIo, ioPorts).filter((u) =>
      /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(u) || u.includes('/image') || !/\.(mp4|webm|mov|mp3|wav|m4a)(\?|$)/i.test(u),
    );

    try {
      const created = await createAssetsBatch({
        mediaType: 'video',
        prompt: trimmed,
        modelName: currentModel.name,
        modelMid: currentModel.mid,
        paramValues: buildGenerationParams(paramValues, currentModel.params, {
          referenceUrls: flatRefs,
          ioValues: resolvedIo,
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
      if (isMobile) {
        handleCloseSheet();
      }
      // 提交生成成功且卡片进入生成中状态后，立即释放输入框与生成按钮，允许用户连续提交
      releaseGeneratingUi();
    } catch (err: any) {
      activeAbortsRef.current.delete(controller);
      releaseGeneratingUi();
      message.error(err?.message || t('playground_2026:video_gen_create_failed', '创建作品记录失败'));
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
      const result = await generateVideosWithModel({
        model: currentModel,
        prompt: trimmed,
        paramValues,
        tokenKey: selectedTokenKey,
        signal: controller.signal,
        sysLogId,
        ioValues: resolvedIo,
        ioPorts,
        videoToolMode,
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
        throw new Error(t('playground_2026:video_gen_no_url', '生成成功但未返回视频地址'));
      }
      const persistFails = settled.kept.filter((it) => it.status === 'error');
      if (persistFails.length > 0) {
        message.error(
          persistFails[0]?.errorMessage ||
            t('playground_2026:output_persist_failed', '转存失败'),
        );
      } else {
        message.success(t('playground_2026:video_gen_success', '生成成功'));
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
    const storedParams = extractParamValues(it.paramValues);
    let nextModel = currentModel;
    if (it.modelMid && models.some((m) => m.mid === it.modelMid)) {
      const m = models.find((x) => x.mid === it.modelMid)!;
      nextModel = m;
      setSelectedMid(m.mid);
      modelParamsHydratedRef.current = true;
      saveVideoGenModelMid(m.mid);
      setParamValues(
        clampParamsToSchemeOptions(
          { ...getInitialParams(m), ...storedParams },
          m.params,
        ),
      );
      prevModelMidForIoRef.current = m.mid;
    } else if (Object.keys(storedParams).length > 0) {
      setParamValues((prev) =>
        clampParamsToSchemeOptions({ ...prev, ...storedParams }, currentModel?.params),
      );
    }

    const ports = getToolInputPorts(nextModel);
    const fromStored = extractIoValuesFromStored(it.paramValues);
    let nextIo = emptyIoValuesForPorts(ports);
    if (fromStored) nextIo = { ...nextIo, ...fromStored };
    if (it.prompt) nextIo = setPromptInIoValues(nextIo, ports, it.prompt);
    const storedRefs = getReferenceUrls(it.paramValues);
    if (storedRefs.length > 0) {
      const mediaPorts = getMediaInputPorts(ports);
      const imagePort =
        mediaPorts.find((p) => portAcceptKinds(p).includes('image')) || mediaPorts[0];
      if (imagePort && getPortUrls(nextIo, imagePort.key).length === 0) {
        nextIo[imagePort.key] = storedRefs.slice(0, portMaxFiles(imagePort));
      }
    }
    setIoValues(nextIo);
  };

  const handleRecreateFromDetail = (it: GeneratedImageItem) => {
    applyItemToComposer(it);
    autoGenerateOnceRef.current = true;
  };

  const handleReferenceFromDetail = (it: GeneratedImageItem) => {
    if (!it.previewUrl) return;
    const mediaPorts = getMediaInputPorts(ioPorts);
    const target =
      mediaPorts.find((p) => portAcceptKinds(p).includes('image')) ||
      mediaPorts.find((p) => portAcceptKinds(p).includes('video')) ||
      mediaPorts[0];
    if (!target) {
      message.warning(t('playground_2026:io_no_media_port', '当前模型未启用媒体入参'));
      return;
    }
    const max = portMaxFiles(target);
    const prev = getPortUrls(ioValues, target.key);
    const limit = Math.max(1, max);
    const filtered = prev.filter((x) => x !== it.previewUrl);
    let next: string[];
    if (filtered.length >= limit) {
      next = [...filtered.slice(0, limit - 1), it.previewUrl];
    } else {
      next = [...filtered, it.previewUrl];
    }
    setIoValues({ ...ioValues, [target.key]: next });
    message.success(t('playground_2026:image_detail_reference_set', '已设为参考'));
  };

  const tryAddUrlsToPrimaryImagePort = (urls: string[]) => {
    const mediaPorts = getMediaInputPorts(ioPorts);
    const target =
      mediaPorts.find((p) => portAcceptKinds(p).includes('image')) || mediaPorts[0];
    if (!target) {
      message.warning(t('playground_2026:io_no_media_port', '当前模型未启用媒体入参'));
      return;
    }
    const max = portMaxFiles(target);
    const prev = getPortUrls(ioValues, target.key);
    const unique = urls.filter((u) => u && !prev.includes(u));
    if (!unique.length) return;
    const room = max - prev.length;
    if (room <= 0) {
      message.warning(t('playground_2026:image_ref_limit', '参考最多 {{n}} 个', { n: max }));
      return;
    }
    setIoValues({
      ...ioValues,
      [target.key]: [...prev, ...unique.slice(0, room)],
    });
  };

  const addReferenceFiles = (files: FileList | File[]) => {
    const mediaPorts = getMediaInputPorts(ioPorts);
    if (!mediaPorts.length) {
      message.warning(t('playground_2026:io_no_media_port', '当前模型未启用媒体入参'));
      return;
    }
    const target =
      mediaPorts.find((p) => portAcceptKinds(p).includes('image')) || mediaPorts[0];
    const kinds = portAcceptKinds(target);
    const constrainKind = kinds.length === 1 ? kinds[0] : 'image';
    const list = Array.from(files).filter((f) => {
      if (constrainKind === 'image') return isAcceptableReferenceFile(f);
      if (constrainKind === 'video') return f.type.startsWith('video/');
      if (constrainKind === 'audio') return f.type.startsWith('audio/');
      return true;
    });
    if (list.length === 0) {
      message.warning(t('playground_2026:image_ref_type_invalid', '请上传匹配的媒体文件'));
      return;
    }
    const max = portMaxFiles(target);
    const prev = getPortUrls(ioValues, target.key);
    const room = max - prev.length;
    if (room <= 0) {
      message.warning(t('playground_2026:image_ref_limit', '参考最多 {{n}} 个', { n: max }));
      return;
    }
    const { picks, warnings } = buildLocalFlowPicks(list.slice(0, room), {
      constrainKind: constrainKind === 'document' ? null : constrainKind,
    });
    for (const w of Array.from(new Set(warnings))) message.warning(w);
    if (picks.length) tryAddUrlsToPrimaryImagePort(picks.map((p) => p.url));
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
    const files = filesFromClipboardData(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    addReferenceFiles(files);
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

  const sheetTheme =
    typeof document !== 'undefined' &&
    document.querySelector('.pg-ui-root[data-theme]')?.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';

  const createPanel = (
    <aside
      className={`hf-vg-panel${modeTransitioning ? ' is-transitioning' : ''}`}
      ref={dockRef}
      onDragOver={onDockDragOver}
      onDrop={onDockDrop}
      onPaste={onDockPaste}
    >
      <div className="hf-vg-panel-head">
        <VideoToolsWheel
          variant={isMobile ? 'sheet' : 'wheel'}
          value={videoToolMode}
          tools={videoTools}
          isTransitionActive={modeTransitioning}
          onChange={handleToolModeChange}
        />
        <button
          type="button"
          className="hf-vg-sheet-close"
          aria-label={t('playground_2026:close', '关闭')}
          onClick={handleCloseSheet}
        >
          <CloseOutlined size={20} />
        </button>
      </div>
      <div className="hf-vg-panel-scroll">
        <div className="hf-vg-model-block">
          <ModelSettingsPanel
            open={openPop === 'model'}
            onOpenChange={(o) => setOpenPop(o ? 'model' : null)}
            models={featureModels}
            currentModel={currentModel}
            selectedMid={selectedMid}
            onSelectModel={selectModel}
            paramValues={paramValues}
            onParamChange={setParam}
            loading={loading}
            disabled={loading || featureModels.length === 0}
            searchInputProps={modelSearchInputProps}
            filteredModels={filteredModels}
            placement="right"
            summaryMode="modelOnly"
            showConfig={false}
            emptyText={
              models.length === 0
                ? t('playground_2026:video_gen_no_models', '暂无可用视频模型')
                : t('playground_2026:video_gen_no_feature_models', '暂无支持该功能的模型')
            }
          />
        </div>

        <SchemeIoComposer
          ports={ioPorts}
          values={ioValues}
          onChange={setIoValues}
          disabled={generating || cooldownRemaining > 0}
          onSubmit={() => {
            if (!generating && !generatingInFlightRef.current && cooldownRemaining <= 0) {
              void handleGenerate();
            }
          }}
          preferredMediaTab={
            omniAndFrameDualTab
              ? videoToolMode === 'starting-frame' || videoToolMode === 'image-to-video'
                ? 'frames'
                : 'references'
              : undefined
          }
          promptPlaceholder={t(
            'playground_2026:video_gen_prompt_placeholder_imagine',
            '描述你想象中的视频',
          )}
          promptFooter={
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
          }
          afterPrompt={
            <div className="hf-vg-prompt-extras">
              <QuickBarParams
                params={quickBarParams}
                values={paramValues}
                onChange={setParam}
                disabled={generating}
              />
              <SchemeParamFields
                variant="inline"
                params={restParams}
                values={paramValues}
                onChange={setParam}
                onReset={resetParams}
                schemeName={currentModel?.scheme_name}
              />
            </div>
          }
        />
      </div>

      <Tooltip
        title={
          cooldownRemaining > 0
            ? t('playground_2026:cooldown_tooltip', '操作太快了，请稍候再试 ({{n}}s)', { n: cooldownRemaining })
            : !selectedTokenKey
              ? apiTokens.length === 0
                ? t('playground_2026:no_token_create_first', '当前没有生成密钥，请先创建密钥')
                : t('playground_2026:video_gen_no_token', '请先选择 API 密钥')
              : undefined
        }
        placement="top"
      >
        <span className="hf-vg-generate-wrap">
          <button
            type="button"
            className="hf-ig-generate hf-vg-generate"
            disabled={generating || cooldownRemaining > 0 || !currentModel || !selectedTokenKey}
            onClick={() => void handleGenerate()}
          >
            <span className="hf-ig-generate-label">
              {generating
                ? t('playground_2026:video_gen_pending_short', '视频AI生成中')
                : cooldownRemaining > 0
                  ? `${t('playground_2026:video_gen_submit', '视频AI生成')} (${cooldownRemaining}s)`
                  : t('playground_2026:video_gen_submit', '视频AI生成')}
            </span>
            {generating && <LoadingOutlined className="hf-ig-generate-icon" />}
          </button>
        </span>
      </Tooltip>
    </aside>
  );

  const mobileCreateLayer =
    typeof document !== 'undefined' && isMobile
      ? createPortal(
          <>
            {!createSheetOpen && (
              <button
                type="button"
                className="hf-vg-continue"
                onClick={handleOpenSheet}
              >
                <Sparkles size={16} strokeWidth={2} />
                {t('playground_2026:ai_video_create', 'AI视频创作')}
              </button>
            )}

            {createSheetOpen && (
              <>
                <div
                  className={`hf-vg-sheet-backdrop${sheetClosing ? ' is-closing' : ''}`}
                  onClick={handleCloseSheet}
                  aria-hidden="true"
                />
                <div
                  className={`pg-ig pg-ui-root hf-vg-sheet-host${sheetClosing ? ' is-closing' : ''}`}
                  data-theme={sheetTheme}
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('playground_2026:generate_video', '生成视频')}
                >
                  <div className="hf-vg-sheet-handle" onClick={handleCloseSheet} />
                  {createPanel}
                </div>
              </>
            )}
          </>,
          document.body,
        )
      : null;

  return (
    <div className={`hf-ig-root hf-vg-root${embedded ? ' hf-ig-embedded' : ''}`}>
      {!embedded && (
      <header className="hf-ig-topbar">
        <div className="hf-ig-brand">
          <button
            type="button"
            className="hf-ig-back"
            onClick={() => navigate('/playground-2026/videos')}
          >
            <ArrowLeftOutlined />
            {t('playground_2026:videos', '视频')}
          </button>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
          <span className="hf-ig-nav-active">
            {t('playground_2026:generate_video', '生成视频')}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--hf-muted)' }}>
          {loading ? (
            <LoadingOutlined />
          ) : (
            <>
              {models.length} models · {items.length}{' '}
              {t('playground_2026:video_gen_items', '项')}
            </>
          )}
        </div>
      </header>
      )}

      <div className="hf-vg-body">
        {isMobile ? mobileCreateLayer : createPanel}

        <section ref={galleryRef} className="hf-ig-gallery">
          {!listReady ? (
            <div className="hf-ig-empty" aria-busy="true" style={{ opacity: 0.35, minHeight: 240 }} />
          ) : items.length === 0 ? (
            <div className="hf-ig-empty">
              <div className="hf-ig-empty-orb">
                <VideoCameraOutlined />
              </div>
              <h2>{t('playground_2026:video_gen_empty_title', '还没有生成视频')}</h2>
              <p>
                {error
                  ? error
                  : t(
                      'playground_2026:video_gen_empty_desc',
                      '在左侧选择视频模型与方案参数，输入提示词后点击生成。',
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
                                label={t('playground_2026:video_gen_pending', '生成中…')}
                              />
                            ) : it.status === 'error' ? (
                              <div className="hf-ig-card-placeholder hf-ig-card-placeholder-error">
                                <VideoCameraOutlined style={{ fontSize: 28, opacity: 0.45 }} />
                                <div className="hf-ig-card-placeholder-title">
                                  {it.errorMessage ||
                                    t('playground_2026:video_gen_failed', '生成失败')}
                                </div>
                              </div>
                            ) : it.previewUrl ? (
                              <SmoothMediaPreview
                                src={it.previewUrl}
                                alt={it.prompt}
                                mediaType="video"
                              />
                            ) : (
                              <div className="hf-ig-card-placeholder">
                                <VideoCameraOutlined style={{ fontSize: 28, opacity: 0.35 }} />
                                <div className="hf-ig-card-placeholder-title">
                                  {t('playground_2026:video_gen_no_preview', '暂无预览')}
                                </div>
                                <div className="hf-ig-card-placeholder-sub">
                                  {it.model || currentModel?.name || '—'}
                                </div>
                              </div>
                            )}
                            <div className="pg-ig-badge">
                              {(it.mediaType || 'video') === 'video'
                                ? t('playground_2026:videos', '视频')
                                : t('playground_2026:images', '图片')}
                            </div>
                            <WorkCardChrome
                              item={{ ...it, mediaType: it.mediaType || 'video' }}
                              isLight={isLight}
                              alwaysShowActions={false}
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
      </div>

      <ImageDetailOverlay
        open={!!detailItem}
        item={detailItem}
        mediaType="video"
        onClose={() => setDetailItem(null)}
        onRecreate={handleRecreateFromDetail}
        onReference={handleReferenceFromDetail}
      />
    </div>
  );
};

export default React.memo(VideoGenerateWorkspace);
