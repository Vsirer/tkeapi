/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useMemo, useState } from 'react';
import { Button, Input, Switch, Typography, Select, Tooltip } from 'antd';
import { QuestionCircleOutlined, SettingOutlined } from '@ant-design/icons';
import type { ImageSpecialParamsConfig, SchemeParam } from '../types';
import {
  associatedImageSizes,
  IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS,
  seedImageSpecialParams,
} from '../utils/imageSpecialParams';
import ImageSpecialOptionTags from './ImageSpecialOptionTags';
import ImageSpecialSizeMapEditor from './ImageSpecialSizeMapEditor';

const { Text } = Typography;

type Props = {
  value: ImageSpecialParamsConfig | null | undefined;
  params?: SchemeParam[];
  onChange: (next: ImageSpecialParamsConfig) => void;
  isLight: boolean;
};

const RATIO_LABELS: Record<string, string> = {
  auto: '智能',
};

function optionLabel(opt: string): string {
  return RATIO_LABELS[opt] || opt;
}

const IN_REQUEST_TIP =
  '开启后，用户选中的值会随图片生成请求发给上游接口。关闭后页面仍可选择，但该字段不会写入请求体。';

function optionsFirst(opts: string[] | undefined, fallback: string): string {
  return (opts && opts[0]) || fallback;
}

const ImageSpecialParamsEditor: React.FC<Props> = ({ value, onChange, isLight }) => {
  const cfg = seedImageSpecialParams(value);
  const [mapOpen, setMapOpen] = useState(false);
  const muted = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const cardBg = isLight ? '#fafafa' : '#1a1a1a';
  const cardBorder = isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)';

  const patch = (next: ImageSpecialParamsConfig) => onChange({ ...cfg, ...next, enabled: true });

  const associated = useMemo(
    () =>
      associatedImageSizes(
        cfg.aspect_ratio?.options,
        cfg.resolution?.options,
        cfg.image_size?.size_map,
      ),
    [cfg.aspect_ratio?.options, cfg.resolution?.options, cfg.image_size?.size_map],
  );

  const keyRow = (
    current: string,
    placeholder: string,
    inRequest: boolean,
    onKey: (v: string) => void,
    onInRequest: (v: boolean) => void,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 12, color: muted, flexShrink: 0 }}>Key</Text>
        <Input
          size="small"
          style={{ flex: 1, minWidth: 0 }}
          value={current}
          placeholder={placeholder}
          onChange={(e) => onKey(e.target.value)}
          onBlur={() => {
            const next = current.trim();
            if (next !== current) onKey(next || placeholder);
            else if (!next) onKey(placeholder);
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 12, color: muted, flexShrink: 0 }}>接口传参</Text>
        <Tooltip title={IN_REQUEST_TIP}>
          <QuestionCircleOutlined style={{ fontSize: 13, color: muted, cursor: 'help' }} />
        </Tooltip>
        <Switch size="small" checked={inRequest} onChange={onInRequest} style={{ marginLeft: 10 }} />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Text style={{ fontSize: 12, color: muted }}>
        每一项写入对应 Key。选定比例后，尺寸按当前分辨率填入对应宽高。
      </Text>

      <div style={{ background: cardBg, borderRadius: 8, padding: 14, border: cardBorder }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong>图片比例</Text>
          <Switch
            size="small"
            checked={cfg.aspect_ratio?.enabled !== false}
            onChange={(v) => patch({ aspect_ratio: { ...cfg.aspect_ratio, enabled: v } })}
          />
        </div>
        {cfg.aspect_ratio?.enabled !== false && (
          <>
            {keyRow(
              cfg.aspect_ratio?.key || 'ratio',
              'ratio',
              cfg.aspect_ratio?.in_request !== false,
              (v) => patch({ aspect_ratio: { ...cfg.aspect_ratio, key: v } }),
              (v) => patch({ aspect_ratio: { ...cfg.aspect_ratio, in_request: v } }),
            )}
            <div style={{ marginBottom: 10 }}>
              <ImageSpecialOptionTags
                options={cfg.aspect_ratio?.options || []}
                isLight={isLight}
                labelOf={optionLabel}
                onChange={(options) => {
                  const def = options.includes(String(cfg.aspect_ratio?.default))
                    ? cfg.aspect_ratio?.default
                    : options[0];
                  patch({ aspect_ratio: { ...cfg.aspect_ratio, options, default: def } });
                }}
              />
            </div>
            {(cfg.aspect_ratio?.options || []).filter(Boolean).length > 0 && (
            <div>
              <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>默认比例</Text>
              <Select
                size="small"
                style={{ width: 160 }}
                value={cfg.aspect_ratio?.default || optionsFirst(cfg.aspect_ratio?.options, '1:1')}
                options={(cfg.aspect_ratio?.options || []).filter(Boolean).map((o) => ({
                  label: optionLabel(o),
                  value: o,
                }))}
                onChange={(v) => patch({ aspect_ratio: { ...cfg.aspect_ratio, default: v } })}
              />
            </div>
            )}
          </>
        )}
      </div>

      <div style={{ background: cardBg, borderRadius: 8, padding: 14, border: cardBorder }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong>分辨率</Text>
          <Switch
            size="small"
            checked={cfg.resolution?.enabled !== false}
            onChange={(v) => patch({ resolution: { ...cfg.resolution, enabled: v } })}
          />
        </div>
        {cfg.resolution?.enabled !== false && (
          <>
            {keyRow(
              cfg.resolution?.key || 'resolution',
              'resolution',
              cfg.resolution?.in_request !== false,
              (v) => patch({ resolution: { ...cfg.resolution, key: v } }),
              (v) => patch({ resolution: { ...cfg.resolution, in_request: v } }),
            )}
            <div style={{ marginBottom: 10 }}>
              <ImageSpecialOptionTags
                options={cfg.resolution?.options || []}
                isLight={isLight}
                onChange={(options) => {
                  const def = options.includes(String(cfg.resolution?.default))
                    ? cfg.resolution?.default
                    : options[0];
                  patch({ resolution: { ...cfg.resolution, options, default: def } });
                }}
              />
            </div>
            {(cfg.resolution?.options || []).filter(Boolean).length > 0 && (
            <div>
              <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>默认分辨率</Text>
              <Select
                size="small"
                style={{ width: 160 }}
                value={cfg.resolution?.default || optionsFirst(cfg.resolution?.options, '1.5K')}
                options={(cfg.resolution?.options || []).filter(Boolean).map((o) => ({ label: o, value: o }))}
                onChange={(v) => patch({ resolution: { ...cfg.resolution, default: v } })}
              />
            </div>
            )}
          </>
        )}
      </div>

      <div style={{ background: cardBg, borderRadius: 8, padding: 14, border: cardBorder }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong>图片尺寸</Text>
          <Switch
            size="small"
            checked={cfg.image_size?.enabled !== false}
            onChange={(v) => patch({ image_size: { ...cfg.image_size, enabled: v } })}
          />
        </div>
        {cfg.image_size?.enabled !== false && (
          <>
            {keyRow(
              cfg.image_size?.key || 'size',
              'size',
              cfg.image_size?.in_request !== false,
              (v) => patch({ image_size: { ...cfg.image_size, key: v } }),
              (v) => patch({ image_size: { ...cfg.image_size, in_request: v } }),
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 12, color: muted }}>关联配置</Text>
              <Button size="small" icon={<SettingOutlined />} onClick={() => setMapOpen(true)}>
                配置
              </Button>
            </div>
            {associated.length > 0 ? (
              <ImageSpecialOptionTags readOnly options={associated} isLight={isLight} />
            ) : (
              <Text style={{ fontSize: 12, color: muted }}>尚未关联尺寸，请点击配置</Text>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 12, color: muted }}>指定宽高</Text>
              <Switch
                size="small"
                checked={!!cfg.image_size?.custom?.enabled}
                onChange={(v) =>
                  patch({
                    image_size: {
                      ...cfg.image_size,
                      custom: {
                        ...(cfg.image_size?.custom || IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS),
                        enabled: v,
                      },
                    },
                  })
                }
              />
            </div>
            {cfg.image_size?.custom?.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>总像素下限</Text>
                  <Input
                    size="small"
                    value={String(cfg.image_size.custom.min_pixels ?? IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.min_pixels)}
                    onChange={(e) =>
                      patch({
                        image_size: {
                          ...cfg.image_size,
                          custom: { ...cfg.image_size?.custom, enabled: true, min_pixels: Number(e.target.value) || 0 },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>总像素上限</Text>
                  <Input
                    size="small"
                    value={String(cfg.image_size.custom.max_pixels ?? IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.max_pixels)}
                    onChange={(e) =>
                      patch({
                        image_size: {
                          ...cfg.image_size,
                          custom: { ...cfg.image_size?.custom, enabled: true, max_pixels: Number(e.target.value) || 0 },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>最窄比例</Text>
                  <Input
                    size="small"
                    value={cfg.image_size.custom.min_aspect || IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.min_aspect}
                    onChange={(e) =>
                      patch({
                        image_size: {
                          ...cfg.image_size,
                          custom: { ...cfg.image_size?.custom, enabled: true, min_aspect: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>最宽比例</Text>
                  <Input
                    size="small"
                    value={cfg.image_size.custom.max_aspect || IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.max_aspect}
                    onChange={(e) =>
                      patch({
                        image_size: {
                          ...cfg.image_size,
                          custom: { ...cfg.image_size?.custom, enabled: true, max_aspect: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 4, fontSize: 11, color: muted }}>步进</Text>
                  <Input
                    size="small"
                    value={String(cfg.image_size.custom.step ?? IMAGE_SPECIAL_CUSTOM_PRO_DEFAULTS.step)}
                    onChange={(e) =>
                      patch({
                        image_size: {
                          ...cfg.image_size,
                          custom: { ...cfg.image_size?.custom, enabled: true, step: Number(e.target.value) || 1 },
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
            <ImageSpecialSizeMapEditor
              open={mapOpen}
              ratios={cfg.aspect_ratio?.options || []}
              resolutions={cfg.resolution?.options || []}
              value={cfg.image_size?.size_map}
              isLight={isLight}
              onCancel={() => setMapOpen(false)}
              onOk={(size_map) => {
                patch({ image_size: { ...cfg.image_size, size_map } });
                setMapOpen(false);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ImageSpecialParamsEditor;
