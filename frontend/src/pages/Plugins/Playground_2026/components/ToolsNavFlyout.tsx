/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 侧栏「图片 / 视频」悬停飞出 — 对齐 imagine.art「Image Tools」
 * 标题 + Features / Models 双列列表行（图标方块 + 标题 + 描述）
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CustomIcon } from '../icons';
import type { PlaygroundModel } from '../types';
import ModelLogoIcon from './ModelLogoIcon';
import { sortModelsByBrandMaxThenOrder } from '../utils/sortModelsByScheme';
import useSettingsStore from '../../../../store/settings';
import RateDisplay from '../../../Models/RateDisplay';
import {
  DEFAULT_VIDEO_FEATURE,
  type ModelFeature,
  modelsForFeature,
  videoFeatures,
} from '../config/modelFeatures';
import { Pin, Sparkles } from 'lucide-react';
import { usePinnedShortcuts, type PinnedShortcut } from '../utils/pinnedShortcuts';
import { VideoFeatureIcon, buildVideoTools } from './VideoToolsWheel';
import './ToolsNavFlyout.css';

export type ToolsNavKind = 'image' | 'video';

type Props = {
  kind: ToolsNavKind;
  active: boolean;
  collapsed: boolean;
  models: PlaygroundModel[];
  modelsLoading?: boolean;
  features?: ModelFeature[];
  children: React.ReactElement;
  onSelectFeature: (featureKey?: string) => void;
  onSelectModel: (model: PlaygroundModel, featureKey?: string) => void;
  onAddReference?: () => void;
};

const GAP = 8;
const VIEW_PAD = 12;

interface FlyoutConfig {
  id: string;
  kind: ToolsNavKind;
  active: boolean;
  collapsed: boolean;
  models: PlaygroundModel[];
  modelsLoading?: boolean;
  features?: ModelFeature[];
  onSelectFeature: (featureKey?: string) => void;
  onSelectModel: (model: PlaygroundModel, featureKey?: string) => void;
  onAddReference?: () => void;
  getAnchorRect: () => DOMRect | null;
}

class FlyoutCoordinator {
  private activeId: string | null = null;
  private currentConfig: FlyoutConfig | null = null;
  private animState: 'closed' | 'open' | 'closing' = 'closed';
  private isGliding = false;
  private openTimer: number | null = null;
  private closeTimer: number | null = null;
  private unmountTimer: number | null = null;
  private listeners = new Set<() => void>();
  private pos = { top: 0, left: 0, maxHeight: 520 };

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getState() {
    return {
      activeId: this.activeId,
      currentConfig: this.currentConfig,
      animState: this.animState,
      isGliding: this.isGliding,
      pos: this.pos,
    };
  }

  calculatePos(rect: DOMRect | null, measuredH = 0, measuredW = 0) {
    if (!rect) return this.pos;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = measuredW || Math.min(620, vw - VIEW_PAD * 2);

    let left = rect.right + GAP;
    if (left + panelW > vw - VIEW_PAD) {
      left = rect.left - panelW - GAP;
    }
    if (left < VIEW_PAD) left = VIEW_PAD;

    let top = rect.top;
    if (measuredH > 0) {
      top = Math.max(VIEW_PAD, rect.top - 6);
      if (top + measuredH > vh - VIEW_PAD) {
        top = Math.max(VIEW_PAD, vh - VIEW_PAD - measuredH);
      }
    }

    const maxHeight = Math.max(180, vh - VIEW_PAD - top);
    return { top, left, maxHeight };
  }

  updateMeasured(panel: HTMLDivElement | null) {
    if (!this.currentConfig) return;
    const rect = this.currentConfig.getAnchorRect();
    if (!rect) return;
    const measuredH = panel?.offsetHeight || 0;
    const measuredW = panel?.offsetWidth || 0;
    const newPos = this.calculatePos(rect, measuredH, measuredW);
    this.pos = newPos;
    this.notify();
  }

  requestOpen(config: FlyoutConfig) {
    if (this.closeTimer != null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.unmountTimer != null) {
      window.clearTimeout(this.unmountTimer);
      this.unmountTimer = null;
    }

    const wasOpen = this.animState === 'open' || this.animState === 'closing';

    if (wasOpen) {
      // 已处于打开状态：在「图片」与「视频」间立即切换，无需延迟，平滑滑动定位
      if (this.openTimer != null) {
        window.clearTimeout(this.openTimer);
        this.openTimer = null;
      }
      this.isGliding = this.activeId !== config.id;
      this.activeId = config.id;
      this.currentConfig = config;
      this.animState = 'open';
      const rect = config.getAnchorRect();
      this.pos = this.calculatePos(rect);
      this.notify();
    } else {
      // 首次从关闭状态进入：100ms 防抖后平滑展开
      if (this.openTimer != null) return;
      this.openTimer = window.setTimeout(() => {
        this.openTimer = null;
        this.isGliding = false;
        this.activeId = config.id;
        this.currentConfig = config;
        const rect = config.getAnchorRect();
        this.pos = this.calculatePos(rect);
        this.animState = 'open';
        this.notify();
      }, 100);
    }
  }

  immediateOpen(config: FlyoutConfig) {
    if (this.openTimer != null) {
      window.clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    if (this.closeTimer != null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.unmountTimer != null) {
      window.clearTimeout(this.unmountTimer);
      this.unmountTimer = null;
    }

    const wasOpen = this.animState === 'open' || this.animState === 'closing';
    this.isGliding = wasOpen && this.activeId !== config.id;
    this.activeId = config.id;
    this.currentConfig = config;
    this.animState = 'open';
    const rect = config.getAnchorRect();
    this.pos = this.calculatePos(rect);
    this.notify();
  }

  syncConfig(config: FlyoutConfig) {
    if (this.activeId !== config.id || this.animState !== 'open') return;
    this.currentConfig = config;
    this.notify();
  }

  requestClose() {
    if (this.openTimer != null) {
      window.clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    if (this.closeTimer != null) return;
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = null;
      this.triggerClose();
    }, 150);
  }

  triggerClose() {
    if (this.openTimer != null) {
      window.clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    if (this.closeTimer != null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.unmountTimer != null) {
      window.clearTimeout(this.unmountTimer);
      this.unmountTimer = null;
    }
    if (this.animState === 'closed') return;

    this.animState = 'closing';
    this.isGliding = false;
    this.notify();

    this.unmountTimer = window.setTimeout(() => {
      this.unmountTimer = null;
      this.animState = 'closed';
      this.activeId = null;
      this.currentConfig = null;
      this.isGliding = false;
      this.notify();
    }, 180);
  }
}

const coordinator = new FlyoutCoordinator();

const ToolsNavFlyoutPanel: React.FC<{
  config: FlyoutConfig;
  isOpen: boolean;
  isClosing: boolean;
  isGliding: boolean;
  pos: { top: number; left: number; maxHeight: number };
}> = ({ config, isOpen, isClosing, isGliding, pos }) => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const formatPrice = (price: number | string | undefined | null) => {
    if (price === undefined || price === null || price === '') return '-';
    const num = Number(price);
    if (isNaN(num)) return String(price);
    return `${currencySymbol}${num}`;
  };
  const panelRef = useRef<HTMLDivElement | null>(null);
  const videoFeatureList = useMemo(() => {
    if (config.kind !== 'video') return [];
    return config.features && config.features.length ? config.features : videoFeatures();
  }, [config.kind, config.features]);
  const [previewFeatureKey, setPreviewFeatureKey] = useState(
    () => videoFeatureList[0]?.key || DEFAULT_VIDEO_FEATURE,
  );

  useEffect(() => {
    if (isOpen && config.kind === 'video') {
      setPreviewFeatureKey(videoFeatureList[0]?.key || DEFAULT_VIDEO_FEATURE);
    }
  }, [isOpen, config.kind, config.id, videoFeatureList]);

  const videoToolById = useMemo(() => {
    const map = new Map<string, { desc: string }>();
    for (const tool of buildVideoTools(videoFeatureList)) {
      map.set(tool.id, { desc: tool.desc });
    }
    return map;
  }, [videoFeatureList]);
  const scopedModels = useMemo(() => {
    if (config.kind !== 'video') return config.models;
    return modelsForFeature(config.models, previewFeatureKey);
  }, [config.kind, config.models, previewFeatureKey]);
  const sortedModels = useMemo(
    () => sortModelsByBrandMaxThenOrder(scopedModels),
    [scopedModels],
  );

  useLayoutEffect(() => {
    coordinator.updateMeasured(panelRef.current);
    const raf = window.requestAnimationFrame(() => coordinator.updateMeasured(panelRef.current));
    const onScrollOrResize = () => coordinator.updateMeasured(panelRef.current);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [config.models.length, config.modelsLoading, videoFeatureList.length, previewFeatureKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') coordinator.triggerClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toolsTitle =
    config.kind === 'image'
      ? t('playground_2026:image_tools', '图片工具')
      : t('playground_2026:video_tools', '视频工具');

  const featureLabel =
    config.kind === 'image'
      ? t('playground_2026:create_image', '生成图片')
      : t('playground_2026:create_video', '生成视频');
  const featureDesc =
    config.kind === 'image'
      ? t('playground_2026:create_image_desc', '用提示词创建图片')
      : t('playground_2026:create_video_desc', '用提示词创建视频');

  const { isPinned, togglePin } = usePinnedShortcuts();

  const handleTogglePin = useCallback(
    (e: React.MouseEvent, item: PinnedShortcut) => {
      e.stopPropagation();
      e.preventDefault();
      togglePin(item);
    },
    [togglePin],
  );

  const handleFeature = useCallback((featureKey?: string) => {
    coordinator.triggerClose();
    config.onSelectFeature(featureKey);
  }, [config]);

  const imageFeatureList = useMemo(
    () => [
      {
        key: 'create-image',
        label: t('playground_2026:create_image', '生成图片'),
        desc: t('playground_2026:create_image_desc', '用提示词创建图片'),
        icon: <CustomIcon name="image" size={18} />,
        iconName: 'image',
        action: () => handleFeature('create-image'),
      },
      {
        key: 'edit-image',
        label: t('playground_2026:edit_image', '编辑图片'),
        desc: t('playground_2026:edit_image_desc', '无缝图像微调与修改'),
        icon: <Sparkles size={18} />,
        iconName: 'edit-image',
        action: () => handleFeature('edit-image'),
      },
    ],
    [t, handleFeature],
  );

  const handleModel = useCallback(
    (model: PlaygroundModel) => {
      coordinator.triggerClose();
      config.onSelectModel(
        model,
        config.kind === 'video' ? previewFeatureKey : undefined,
      );
    },
    [config, previewFeatureKey],
  );

  return createPortal(
    <div
      ref={panelRef}
      className={`pg-ig-tools-flyout${config.collapsed ? ' is-collapsed-side' : ''}${isOpen ? ' is-open' : ''}${isClosing ? ' is-closing' : ''}${isGliding ? ' is-gliding' : ''}`}
      role="menu"
      aria-label={toolsTitle}
      style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
      onMouseEnter={() => coordinator.immediateOpen(config)}
      onMouseLeave={() => coordinator.requestClose()}
    >
      <div key={config.kind} className="pg-ig-tools-flyout-content">
        <div className="pg-ig-tools-flyout-title">{toolsTitle}</div>

        <div className="pg-ig-tools-flyout-columns">
          <section className="pg-ig-tools-flyout-col">
            <div className="pg-ig-tools-flyout-label">
              {t('playground_2026:features', '功能')}
            </div>
            <div className="pg-ig-tools-flyout-list">
              {config.kind === 'video' ? (
                videoFeatureList.map((feature) => {
                  const desc = videoToolById.get(feature.key)?.desc || '';
                  const pinnedId = `feature:video:${feature.key}`;
                  const pinned = isPinned(pinnedId);
                  return (
                    <button
                      key={feature.key}
                      type="button"
                      className={`pg-ig-tools-flyout-row${previewFeatureKey === feature.key ? ' is-active' : ''}`}
                      onMouseEnter={() => setPreviewFeatureKey(feature.key)}
                      onFocus={() => setPreviewFeatureKey(feature.key)}
                      onClick={() => handleFeature(feature.key)}
                    >
                      <span className="pg-ig-tools-flyout-row-icon" aria-hidden>
                        <VideoFeatureIcon id={feature.key} size={18} />
                      </span>
                      <span className="pg-ig-tools-flyout-row-meta">
                        <strong>{feature.label}</strong>
                        {desc ? <span>{desc}</span> : null}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={`pg-ig-tools-flyout-pin-btn${pinned ? ' is-pinned' : ''}`}
                        title={
                          pinned
                            ? t('playground_2026:unpin_from_sidebar', '取消固定')
                            : t('playground_2026:pin_to_sidebar', '固定到侧栏')
                        }
                        onClick={(e) =>
                          handleTogglePin(e, {
                            id: pinnedId,
                            type: 'feature',
                            kind: 'video',
                            key: feature.key,
                            name: feature.label,
                            desc,
                            icon: feature.key,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleTogglePin(e as any, {
                              id: pinnedId,
                              type: 'feature',
                              kind: 'video',
                              key: feature.key,
                              name: feature.label,
                              desc,
                              icon: feature.key,
                            });
                          }
                        }}
                      >
                        <Pin size={13} className="pg-ig-tools-flyout-pin-icon" />
                      </span>
                    </button>
                  );
                })
              ) : (
                imageFeatureList.map((feature) => {
                  const pinnedId = `feature:image:${feature.key}`;
                  const pinned = isPinned(pinnedId);
                  return (
                    <button
                      key={feature.key}
                      type="button"
                      className="pg-ig-tools-flyout-row"
                      onClick={feature.action}
                    >
                      <span className="pg-ig-tools-flyout-row-icon" aria-hidden>
                        {feature.icon}
                      </span>
                      <span className="pg-ig-tools-flyout-row-meta">
                        <strong>{feature.label}</strong>
                        <span>{feature.desc}</span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={`pg-ig-tools-flyout-pin-btn${pinned ? ' is-pinned' : ''}`}
                        title={
                          pinned
                            ? t('playground_2026:unpin_from_sidebar', '取消固定')
                            : t('playground_2026:pin_to_sidebar', '固定到侧栏')
                        }
                        onClick={(e) =>
                          handleTogglePin(e, {
                            id: pinnedId,
                            type: 'feature',
                            kind: 'image',
                            key: feature.key,
                            name: feature.label,
                            desc: feature.desc,
                            icon: feature.iconName,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleTogglePin(e as any, {
                              id: pinnedId,
                              type: 'feature',
                              kind: 'image',
                              key: feature.key,
                              name: feature.label,
                              desc: feature.desc,
                              icon: feature.iconName,
                            });
                          }
                        }}
                      >
                        <Pin size={13} className="pg-ig-tools-flyout-pin-icon" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="pg-ig-tools-flyout-col">
            <div className="pg-ig-tools-flyout-label">
              {t('playground_2026:models', '模型')}
            </div>
            {config.modelsLoading && sortedModels.length === 0 ? (
              <div className="pg-ig-tools-flyout-empty">
                {t('common.loading', '加载中…')}
              </div>
            ) : sortedModels.length === 0 ? (
              <div className="pg-ig-tools-flyout-empty">
                {config.kind === 'image'
                  ? t('playground_2026:image_gen_no_model', '暂无默认展示的图片模型')
                  : t('playground_2026:video_gen_no_feature_models', '暂无默认展示的视频模型')}
              </div>
            ) : (
              <div className="pg-ig-tools-flyout-list">
                {sortedModels.map((m) => {
                  const desc = (m.description || '').trim();
                  const pinnedId = `model:${config.kind}:${m.mid}`;
                  const pinned = isPinned(pinnedId);
                  return (
                    <button
                      key={m.mid}
                      type="button"
                      className="pg-ig-tools-flyout-row"
                      title={desc || m.name}
                      onClick={() => handleModel(m)}
                    >
                      <div className="pg-ig-tools-flyout-row-icon-wrap">
                        <span className="pg-ig-tools-flyout-row-icon pg-ig-tools-flyout-row-icon--logo">
                          <ModelLogoIcon
                            logo={m.logo}
                            fallbackLetter={m.name}
                            className="pg-ig-tools-flyout-model-img"
                            size={20}
                          />
                        </span>
                      </div>
                      <span className="pg-ig-tools-flyout-row-meta">
                        <strong>{m.name}</strong>
                        {desc ? <span>{desc}</span> : null}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={`pg-ig-tools-flyout-pin-btn${pinned ? ' is-pinned' : ''}`}
                        title={
                          pinned
                            ? t('playground_2026:unpin_from_sidebar', '取消固定')
                            : t('playground_2026:pin_to_sidebar', '固定到侧栏')
                        }
                        onClick={(e) =>
                          handleTogglePin(e, {
                            id: pinnedId,
                            type: 'model',
                            kind: config.kind,
                            mid: m.mid,
                            name: m.name,
                            desc,
                            logo: m.logo,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleTogglePin(e as any, {
                              id: pinnedId,
                              type: 'model',
                              kind: config.kind,
                              mid: m.mid,
                              name: m.name,
                              desc,
                              logo: m.logo,
                            });
                          }
                        }}
                      >
                        <Pin size={13} className="pg-ig-tools-flyout-pin-icon" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const ToolsNavFlyout: React.FC<Props> = (props) => {
  const { kind, active, collapsed, children } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const id = `${kind}-${collapsed ? 'collapsed' : 'expanded'}`;

  const [state, setState] = useState(() => coordinator.getState());

  useEffect(() => {
    return coordinator.subscribe(() => {
      setState(coordinator.getState());
    });
  }, []);

  const getConfig = useCallback((): FlyoutConfig => {
    return {
      ...props,
      id,
      getAnchorRect: () => rootRef.current?.getBoundingClientRect() || null,
    };
  }, [props, id]);

  useEffect(() => {
    coordinator.syncConfig(getConfig());
  }, [getConfig]);

  const handleMouseEnter = useCallback(() => {
    coordinator.requestOpen(getConfig());
  }, [getConfig]);

  const handleMouseLeave = useCallback(() => {
    coordinator.requestClose();
  }, []);

  const isCurrentActive = state.activeId === id;
  const isMounted = state.animState !== 'closed' && isCurrentActive && state.currentConfig != null;

  return (
    <div
      ref={rootRef}
      className={`pg-ig-tools-flyout-anchor${isCurrentActive && state.animState === 'open' ? ' is-open' : ''}${active ? ' is-active' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
    >
      {children}
      {isMounted && state.currentConfig && (
        <ToolsNavFlyoutPanel
          config={state.currentConfig!}
          isOpen={state.animState === 'open'}
          isClosing={state.animState === 'closing'}
          isGliding={state.isGliding}
          pos={state.pos}
        />
      )}
    </div>
  );
};

export default React.memo(ToolsNavFlyout);
