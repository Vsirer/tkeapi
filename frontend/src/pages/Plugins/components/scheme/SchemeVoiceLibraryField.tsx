/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Switch, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import {
  VOICE_CATALOG_DOUBAO_TTS_2,
  seedVoiceLibrary,
  voiceLibrarySame,
  type VoiceCatalogs,
  type VoiceLibraryBinding,
} from './voiceLibrary';

const { Text } = Typography;

type Props = {
  mode: 'scheme' | 'model';
  schemeType: string;
  value: unknown;
  inheritValue?: unknown;
  inheritSchemeName?: string;
  catalogs?: VoiceCatalogs;
  isLight?: boolean;
  onChange: (next: VoiceLibraryBinding | null) => void;
};

const CATALOG_OPTIONS = [{ value: VOICE_CATALOG_DOUBAO_TTS_2, label: '豆包语音合成 2.0' }];

const SchemeVoiceLibraryField: React.FC<Props> = ({
  mode,
  schemeType,
  value,
  inheritValue,
  inheritSchemeName,
  catalogs,
  isLight,
  onChange,
}) => {
  const muted = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const label = isLight ? '#1f2937' : '#fff';
  const inherit = useMemo(
    () => seedVoiceLibrary(inheritValue, catalogs),
    [inheritValue, catalogs],
  );
  const own = value == null ? null : seedVoiceLibrary(value, catalogs);
  const current = own ?? inherit;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<VoiceLibraryBinding>(current);
  const [baseline, setBaseline] = useState<VoiceLibraryBinding>(current);
  const [customDraft, setCustomDraft] = useState('');

  if (schemeType !== 'audio') return null;

  const commit = (next: VoiceLibraryBinding) => {
    const normalized = seedVoiceLibrary(next, catalogs);
    if (mode === 'model' && voiceLibrarySame(normalized, inherit)) {
      onChange(null);
      return;
    }
    onChange(normalized);
  };

  const openConfig = () => {
    const next = seedVoiceLibrary({ ...current, enabled: true }, catalogs);
    commit(next);
    setDraft(next);
    setBaseline(next);
    setCustomDraft('');
    setOpen(true);
  };

  const voiceOptions = useMemo(() => {
    const stock = catalogs?.[draft.catalog || VOICE_CATALOG_DOUBAO_TTS_2] || [];
    const extras = (draft.custom || []).map((c) => ({
      id: c.id,
      name: c.name,
      scene: '通用',
    }));
    const byId = new Map(stock.map((v) => [v.id, v]));
    extras.forEach((v) => {
      if (!byId.has(v.id)) byId.set(v.id, v);
    });
    return [...byId.values()].map((v) => ({
      value: v.id,
      label: `${v.name} · ${v.scene}`,
    }));
  }, [catalogs, draft.catalog, draft.custom]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ color: label, fontSize: 14 }}>音色</Text>
          <Text style={{ display: 'block', fontSize: 12, marginTop: 2, color: muted }}>
            {mode === 'scheme'
              ? '开启后，音频生成页展示音色库。目录来自官方 2.0 公版音色，不写进方案参数。'
              : `对本模型生效。未改时继承方案${inheritSchemeName ? `「${inheritSchemeName}」` : ''}。`}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {current.enabled && (
            <Button size="small" icon={<SettingOutlined />} onClick={openConfig}>
              配置
            </Button>
          )}
          <Switch
            checked={current.enabled}
            onChange={(v) => {
              if (!v) setOpen(false);
              commit(seedVoiceLibrary({ ...current, enabled: v }, catalogs));
            }}
          />
        </div>
      </div>
      <Modal
        title="音色"
        open={open}
        zIndex={1100}
        width={640}
        onCancel={() => {
          commit(baseline);
          setOpen(false);
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              onClick={() => {
                const next = seedVoiceLibrary({ enabled: true }, catalogs);
                setDraft(next);
              }}
            >
              重置
            </Button>
            <Button
              onClick={() => {
                commit(baseline);
                setOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              type="primary"
              onClick={() => {
                commit({ ...draft, enabled: true });
                setOpen(false);
              }}
            >
              完成
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text style={{ display: 'block', fontSize: 12, marginBottom: 6, color: muted }}>音色目录</Text>
            <Select
              value={draft.catalog}
              options={CATALOG_OPTIONS}
              style={{ width: '100%' }}
              onChange={(catalog) => setDraft(seedVoiceLibrary({ ...draft, catalog }, catalogs))}
            />
          </div>
          <div>
            <Text style={{ display: 'block', fontSize: 12, marginBottom: 6, color: muted }}>默认音色</Text>
            <Select
              showSearch
              optionFilterProp="label"
              value={draft.default}
              options={voiceOptions}
              style={{ width: '100%' }}
              onChange={(id) => setDraft({ ...draft, default: id })}
            />
          </div>
          <div>
            <Text style={{ display: 'block', fontSize: 12, marginBottom: 6, color: muted }}>
              可选白名单（空=目录全部）
            </Text>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              value={draft.allowlist || []}
              options={voiceOptions}
              style={{ width: '100%' }}
              placeholder="不限制"
              onChange={(allowlist) => setDraft({ ...draft, allowlist: allowlist.length ? allowlist : undefined })}
            />
          </div>
          <div>
            <Text style={{ display: 'block', fontSize: 12, marginBottom: 6, color: muted }}>
              追加自定义 speaker（仅 2.0 uranus / saturn）
            </Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={customDraft}
                placeholder="zh_female_xxx_uranus_bigtts"
                onChange={(e) => setCustomDraft(e.target.value)}
              />
              <Button
                onClick={() => {
                  const id = customDraft.trim();
                  if (!id) return;
                  const custom = [...(draft.custom || [])];
                  if (!custom.some((c) => c.id === id)) custom.push({ id, name: id });
                  setDraft(seedVoiceLibrary({ ...draft, custom }, catalogs));
                  setCustomDraft('');
                }}
              >
                添加
              </Button>
            </div>
            {(draft.custom || []).length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(draft.custom || []).map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontSize: 12, color: label }}>{c.name}</Text>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        const custom = (draft.custom || []).filter((x) => x.id !== c.id);
                        setDraft(seedVoiceLibrary({ ...draft, custom }, catalogs));
                      }}
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SchemeVoiceLibraryField;
