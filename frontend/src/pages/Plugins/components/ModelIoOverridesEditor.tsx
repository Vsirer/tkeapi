/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 模型级工作流 IO 覆写编辑器（仅 patch 与方案基线不同的字段）
 */
import React from 'react';
import { InputNumber, Select, Switch, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { WORKFLOW_BASIC_NODE_TYPES } from '../Playground_2026/utils/workflowBasicNodes';
import type { SchemeIoOverrides, SchemePort } from '../Playground_2026/types';
import {
  defaultAcceptAssetKinds,
  defaultReferencePortMax,
  isReferenceMediaPort,
  SCHEME_ASSET_KIND_OPTIONS,
} from '../Playground_2026/utils/schemeIo';

const { Text } = Typography;

const ACCEPTS_OPTIONS = WORKFLOW_BASIC_NODE_TYPES.map((t) => ({
  label: t.label,
  value: t.key,
}));

const PATCHABLE_KEYS = ['enabled', 'max', 'accepts', 'accept_asset_kinds'] as const;

type PatchableKey = (typeof PATCHABLE_KEYS)[number];

function sameValue(a: any, b: any): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function baseEnabled(port: SchemePort): boolean {
  return port.enabled !== false;
}

function getBaseField(port: SchemePort, field: PatchableKey): any {
  switch (field) {
    case 'enabled':
      return baseEnabled(port);
    case 'max':
      return port.max ?? 1;
    case 'accepts':
      return port.accepts || [];
    case 'accept_asset_kinds':
      return port.accept_asset_kinds?.length
        ? port.accept_asset_kinds
        : (port.accepts || []).includes('asset')
          ? defaultAcceptAssetKinds(port.modality)
          : [];
    default:
      return undefined;
  }
}

function getEffectiveField(
  port: SchemePort,
  modify: Record<string, Partial<SchemePort>> | undefined,
  field: PatchableKey,
): any {
  const patch = modify?.[port.key];
  if (patch && (patch as any)[field] !== undefined) return (patch as any)[field];
  return getBaseField(port, field);
}

function buildCleanOverrides(
  schemeInputs: SchemePort[],
  schemeOutputs: SchemePort[],
  raw: SchemeIoOverrides | null | undefined,
): SchemeIoOverrides | null {
  const out: SchemeIoOverrides = {};
  const cleanSide = (
    ports: SchemePort[],
    side: 'inputs' | 'outputs',
  ) => {
    const modifySrc = raw?.[side]?.modify || {};
    const nextModify: Record<string, Partial<SchemePort>> = {};
    for (const port of ports || []) {
      const patch = modifySrc[port.key];
      if (!patch) continue;
      const cleaned: Partial<SchemePort> = {};
      for (const k of PATCHABLE_KEYS) {
        if ((patch as any)[k] === undefined) continue;
        if (!sameValue((patch as any)[k], getBaseField(port, k))) {
          (cleaned as any)[k] = (patch as any)[k];
        }
      }
      if (Object.keys(cleaned).length) nextModify[port.key] = cleaned;
    }
    if (Object.keys(nextModify).length) {
      out[side] = { modify: nextModify };
    }
  };
  cleanSide(schemeInputs || [], 'inputs');
  cleanSide(schemeOutputs || [], 'outputs');
  return Object.keys(out).length ? out : null;
}

export type ModelIoOverridesEditorProps = {
  schemeInputs: SchemePort[];
  schemeOutputs: SchemePort[];
  overrides: SchemeIoOverrides | null | undefined;
  onChange: (next: SchemeIoOverrides | null) => void;
  isLight?: boolean;
};

const ModelIoOverridesEditor: React.FC<ModelIoOverridesEditorProps> = ({
  schemeInputs,
  schemeOutputs,
  overrides,
  onChange,
  isLight = true,
}) => {
  const muted = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  const cardBg = isLight ? '#fafafa' : '#1a1a1a';
  const cardBorder = isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)';
  const fieldHint: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: 11,
    color: muted,
  };

  const inputs = schemeInputs || [];
  const outputs = schemeOutputs || [];
  const current = overrides || { inputs: { modify: {} }, outputs: { modify: {} } };

  const patchPortFields = (
    side: 'inputs' | 'outputs',
    port: SchemePort,
    fields: Partial<Record<PatchableKey, any>>,
  ) => {
    const modify = { ...(current[side]?.modify || {}) };
    const existing = { ...(modify[port.key] || {}) };
    for (const [field, value] of Object.entries(fields) as [PatchableKey, any][]) {
      const base = getBaseField(port, field);
      if (sameValue(value, base)) {
        delete (existing as any)[field];
      } else {
        (existing as any)[field] = value;
      }
    }
    if (Object.keys(existing).length === 0) delete modify[port.key];
    else modify[port.key] = existing;

    const next: SchemeIoOverrides = {
      inputs: { modify: { ...(current.inputs?.modify || {}) } },
      outputs: { modify: { ...(current.outputs?.modify || {}) } },
    };
    next[side] = { modify };
    onChange(buildCleanOverrides(inputs, outputs, next));
  };

  const patchPort = (
    side: 'inputs' | 'outputs',
    port: SchemePort,
    field: PatchableKey,
    value: any,
  ) => {
    patchPortFields(side, port, { [field]: value });
  };

  const renderPortCard = (side: 'inputs' | 'outputs', port: SchemePort) => {
    const modify = current[side]?.modify;
    const enabled = getEffectiveField(port, modify, 'enabled');
    const max = getEffectiveField(port, modify, 'max');
    const accepts = getEffectiveField(port, modify, 'accepts');
    const assetKinds = getEffectiveField(port, modify, 'accept_asset_kinds');
    const isInput = side === 'inputs';
    const isOn = !!enabled;
    const hasAsset = Array.isArray(accepts) && accepts.includes('asset');
    const showMax = isInput && (isReferenceMediaPort(port) || !!port.expandable);
    const maxFallback = defaultReferencePortMax(port.key);

    return (
      <div
        key={`${side}-${port.key}`}
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: isOn ? cardBg : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'),
          border: cardBorder,
          marginBottom: 8,
          opacity: isOn ? 1 : 0.55,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <Text strong style={{ fontSize: 13, color: isLight ? '#1f2937' : '#fff' }}>
              {port.label || port.key}
            </Text>
            <Text style={{ fontSize: 11, color: muted, marginLeft: 8 }}>{port.key}</Text>
            <Text style={{ fontSize: 11, color: muted, marginLeft: 8 }}>
              {{
                text: '文本',
                image: '图片',
                video: '视频',
                audio: '音频',
                file: '文件',
              }[port.modality as string] || port.modality}
            </Text>
          </div>
          <Switch
            size="small"
            checked={isOn}
            onChange={(v) => patchPort(side, port, 'enabled', v)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {showMax && (
            <div style={{ width: 140 }}>
              <Text style={fieldHint}>
                数量上限{' '}
                <Tooltip title="图片/视频工具与工作流中，该口可上传或接入的最大数量。参考图/参考视频/参考音频会同步限制用户端提示词附件。">
                  <QuestionCircleOutlined style={{ color: muted, cursor: 'help' }} />
                </Tooltip>
              </Text>
              <InputNumber
                size="small"
                min={0}
                max={64}
                precision={0}
                style={{ width: '100%' }}
                value={typeof max === 'number' ? max : maxFallback}
                onChange={(v) =>
                  patchPort(side, port, 'max', typeof v === 'number' ? v : maxFallback)
                }
                disabled={!isOn}
              />
            </div>
          )}
          {isInput && (
            <div style={{ flex: 1, minWidth: 200 }}>
              <Text style={fieldHint}>可连接上游</Text>
              <Select
                size="small"
                mode="multiple"
                style={{ width: '100%' }}
                options={ACCEPTS_OPTIONS}
                value={Array.isArray(accepts) ? accepts : []}
                onChange={(v) => {
                  const list = Array.isArray(v) ? v : [];
                  if (list.includes('asset')) {
                    const curKinds = getEffectiveField(port, modify, 'accept_asset_kinds');
                    patchPortFields(side, port, {
                      accepts: list,
                      accept_asset_kinds:
                        Array.isArray(curKinds) && curKinds.length
                          ? curKinds
                          : defaultAcceptAssetKinds(port.modality),
                    });
                  } else {
                    patchPortFields(side, port, {
                      accepts: list,
                      accept_asset_kinds: [],
                    });
                  }
                }}
                disabled={!isOn}
              />
            </div>
          )}
        </div>
        {isInput && hasAsset && (
          <div style={{ marginTop: 8 }}>
            <Text style={fieldHint}>素材类型</Text>
            <Select
              size="small"
              mode="multiple"
              style={{ width: '100%', maxWidth: 420 }}
              options={SCHEME_ASSET_KIND_OPTIONS}
              value={
                Array.isArray(assetKinds) && assetKinds.length
                  ? assetKinds
                  : defaultAcceptAssetKinds(port.modality)
              }
              onChange={(v) =>
                patchPort(
                  side,
                  port,
                  'accept_asset_kinds',
                  Array.isArray(v) && v.length ? v : defaultAcceptAssetKinds(port.modality),
                )
              }
              disabled={!isOn}
            />
          </div>
        )}
      </div>
    );
  };

  if (!inputs.length && !outputs.length) {
    return <Text type="secondary">该方案未配置工作流 IO</Text>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Text style={{ color: muted, fontSize: 12, marginBottom: 8 }}>
        仅覆写与方案基线不同的字段；未改动的口不会写入 io_overrides。
      </Text>
      {inputs.length > 0 && (
        <>
          <Text style={{ fontSize: 13, color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
            入参口覆写
          </Text>
          {inputs.map((p) => renderPortCard('inputs', p))}
        </>
      )}
      {outputs.length > 0 && (
        <>
          <Text
            style={{
              fontSize: 13,
              color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)',
              marginTop: 8,
              marginBottom: 4,
            }}
          >
            出参口覆写
          </Text>
          {outputs.map((p) => renderPortCard('outputs', p))}
        </>
      )}
    </div>
  );
};

export default ModelIoOverridesEditor;
