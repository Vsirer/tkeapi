/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作方案 IO 配置编辑器（管理端）
 * 口结构固定展示；快捷模板只切换启用/禁用
 */
import React, { useMemo } from 'react';
import {
  AutoComplete,
  Divider,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { WORKFLOW_BASIC_NODE_TYPES } from '../Playground_2026/utils/workflowBasicNodes';
import {
  fullImageSchemeIoCatalog,
  mergePortsWithCatalog,
  applyIoEnabledKeys,
  IO_TEMPLATE_ENABLE,
  defaultAcceptAssetKinds,
  defaultReferencePortMax,
  isReferenceMediaPort,
  SCHEME_ASSET_KIND_OPTIONS,
  videoSchemeIoCatalogFor,
  isWan3FamilySchemeId,
} from '../Playground_2026/utils/schemeIo';

const { Text } = Typography;

const ACCEPTS_OPTIONS = WORKFLOW_BASIC_NODE_TYPES.map((t) => ({
  label: t.label,
  value: t.key,
}));

/** 若 inputs/outputs 缺失则按类型铺齐完整目录，并套用默认启用模板 */
export function ensureSchemeIoDefaults(scheme: any): any {
  if (!scheme || scheme.type === 'chat') return scheme;
  const schemeId = String(scheme.id || '');
  const catalog =
    scheme.type === 'image'
      ? fullImageSchemeIoCatalog()
      : videoSchemeIoCatalogFor(schemeId);
  const hasInputs = Array.isArray(scheme.inputs) && scheme.inputs.length > 0;
  const hasOutputs = Array.isArray(scheme.outputs) && scheme.outputs.length > 0;

  const isNoNegVideo =
    schemeId === 'openai_video' ||
    schemeId === 'seedance2.0' ||
    schemeId === 'seedance2' ||
    isWan3FamilySchemeId(schemeId);
  const cleanCurrentInputs = isNoNegVideo && Array.isArray(scheme.inputs)
    ? scheme.inputs.filter((p: any) => p?.key !== 'negative_prompt' && p?.bind_key !== 'negative_prompt')
    : scheme.inputs;

  if (hasInputs && hasOutputs) {
    return {
      ...scheme,
      inputs: mergePortsWithCatalog(catalog.inputs, cleanCurrentInputs),
      outputs: mergePortsWithCatalog(catalog.outputs, scheme.outputs),
    };
  }

  const tplKey =
    scheme.type === 'image'
      ? schemeId === 'seedream_5_0_pro'
        ? 'image_seedream_5_0_pro'
        : 'image_default'
      : schemeId === 'seedance1.5pro' || schemeId === 'kling_video'
        ? 'video_start_end'
        : schemeId === 'minimax-h3'
          ? 'video_minimax_h3'
          : schemeId === 'dashscope_video' || schemeId === 'wan3.0'
            ? 'video_dashscope_wan3'
            : schemeId === 'seedance2.0' || schemeId === 'seedance2'
              ? 'video_seedance2'
              : schemeId === 'openai_video'
                ? 'video_openai'
                : schemeId.includes('seedance')
                  ? 'video_multimodal'
                  : 'video_text';
  const tpl = IO_TEMPLATE_ENABLE[tplKey] || IO_TEMPLATE_ENABLE.video_openai;
  const seeded = applyIoEnabledKeys(catalog, scheme, tpl.inputs, tpl.outputs);
  return {
    ...scheme,
    inputs: hasInputs ? mergePortsWithCatalog(catalog.inputs, cleanCurrentInputs) : seeded.inputs,
    outputs: hasOutputs ? mergePortsWithCatalog(catalog.outputs, scheme.outputs) : seeded.outputs,
  };
}

export type SchemeIoEditorProps = {
  schemeType: string;
  params: { key: string; label?: string }[];
  inputs: any[];
  outputs: any[];
  onChange: (next: { inputs: any[]; outputs: any[] }) => void;
  isLight?: boolean;
  /** 独立抽屉内使用：去掉顶部分隔线 */
  standalone?: boolean;
  schemeId?: string;
};

const SchemeIoEditor: React.FC<SchemeIoEditorProps> = ({
  schemeType,
  params,
  inputs,
  outputs,
  onChange,
  isLight = true,
  standalone = false,
  schemeId,
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

  const catalog = useMemo(
    () => (schemeType === 'image' ? fullImageSchemeIoCatalog() : videoSchemeIoCatalogFor(schemeId)),
    [schemeType, schemeId],
  );

  const displayInputs = useMemo(
    () => mergePortsWithCatalog(catalog.inputs, inputs),
    [catalog.inputs, inputs],
  );
  const displayOutputs = useMemo(
    () => mergePortsWithCatalog(catalog.outputs, outputs),
    [catalog.outputs, outputs],
  );

  if (schemeType === 'chat') {
    return (
      <div>
        {!standalone && (
          <Divider style={{ margin: '8px 0', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />
        )}
        <Text strong style={{ color: isLight ? '#1f2937' : '#fff', fontSize: 14 }}>
          IO 配置
        </Text>
        <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: muted }}>
          聊天方案不使用生成输入输出，可跳过本配置。
        </Text>
      </div>
    );
  }

  const bindOptions = (params || [])
    .filter((p) => p?.key)
    .map((p) => ({
      value: p.key,
      label: p.label ? `${p.key}（${p.label}）` : p.key,
    }));

  const commit = (nextInputs: any[], nextOutputs: any[]) => {
    onChange({ inputs: nextInputs, outputs: nextOutputs });
  };

  const patchInput = (idx: number, field: string, value: any) => {
    const next = displayInputs.map((p, i) => (i === idx ? { ...p, [field]: value } : p));
    commit(next, displayOutputs);
  };

  const patchOutput = (idx: number, field: string, value: any) => {
    const next = displayOutputs.map((p, i) => (i === idx ? { ...p, [field]: value } : p));
    commit(displayInputs, next);
  };

  return (
    <div>
      {!standalone && (
        <Divider style={{ margin: '8px 0', borderColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }} />
      )}

      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ color: isLight ? '#1f2937' : '#fff', fontSize: 14 }}>
          {standalone ? '输入输出配置' : 'IO 配置'}
        </Text>
      </div>
      <Text style={{ display: 'block', marginTop: 0, marginBottom: 12, fontSize: 12, color: muted }}>
        全部口固定展示；关闭「启用」后其余字段不可改。方案列表点「重置」可恢复默认参数与 IO。
      </Text>

      <div style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 13, color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>输入</Text>
      </div>

      {displayInputs.map((port: any, idx: number) => {
        const isOn = port.enabled !== false;
        const showMax = !!port.expandable || isReferenceMediaPort(port);
        const maxFallback = defaultReferencePortMax(port.key || '', schemeId);
        return (
        <div
          key={`in-${port.key}`}
          style={{
            background: isOn ? cardBg : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'),
            borderRadius: 8,
            padding: 14,
            border: cardBorder,
            marginBottom: 10,
            opacity: isOn ? 1 : 0.55,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Space>
              <Text strong style={{ fontSize: 13, color: isLight ? '#1f2937' : '#fff' }}>
                {port.label || port.key}
              </Text>
              <Switch
                size="small"
                checked={isOn}
                onChange={(v) => patchInput(idx, 'enabled', v)}
              />
              <Text style={{ fontSize: 11, color: muted }}>{isOn ? '启用' : '已禁用'}</Text>
            </Space>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <Text style={fieldHint}>绑定字段</Text>
              <AutoComplete
                size="small"
                style={{ width: '100%' }}
                options={bindOptions}
                value={port.bind_key || ''}
                onChange={(v) => patchInput(idx, 'bind_key', v)}
                placeholder="选参数键或手填"
                disabled={!isOn}
                filterOption={(input, option) =>
                  String(option?.value || '')
                    .toLowerCase()
                    .includes(input.toLowerCase()) ||
                  String(option?.label || '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </div>
            <div style={{ flex: 2, minWidth: 180 }}>
              <Text style={fieldHint}>可连接上游</Text>
              <Select
                size="small"
                mode="multiple"
                style={{ width: '100%' }}
                options={ACCEPTS_OPTIONS}
                value={port.accepts || []}
                onChange={(v) => {
                  const list = Array.isArray(v) ? v : [];
                  const hasAsset = list.includes('asset');
                  const next = displayInputs.map((p, i) => {
                    if (i !== idx) return p;
                    return {
                      ...p,
                      accepts: list,
                      accept_asset_kinds: hasAsset
                        ? p.accept_asset_kinds?.length
                          ? p.accept_asset_kinds
                          : defaultAcceptAssetKinds(p.modality)
                        : undefined,
                    };
                  });
                  commit(next, displayOutputs);
                }}
                placeholder="选择节点类型"
                disabled={!isOn}
              />
            </div>
          </div>
          {(port.accepts || []).includes('asset') && (
            <div style={{ marginBottom: 8 }}>
              <Text style={fieldHint}>
                素材类型{' '}
                <Tooltip title="勾选「素材」后生效：限制可接入的素材文件类型。未选时按口模态（图/视/音）回落。">
                  <QuestionCircleOutlined style={{ color: muted, cursor: 'help' }} />
                </Tooltip>
              </Text>
              <Select
                size="small"
                mode="multiple"
                style={{ width: '100%', maxWidth: 420 }}
                options={SCHEME_ASSET_KIND_OPTIONS}
                value={
                  port.accept_asset_kinds?.length
                    ? port.accept_asset_kinds
                    : defaultAcceptAssetKinds(port.modality)
                }
                onChange={(v) =>
                  patchInput(
                    idx,
                    'accept_asset_kinds',
                    Array.isArray(v) && v.length ? v : defaultAcceptAssetKinds(port.modality),
                  )
                }
                placeholder="选择素材文件类型"
                disabled={!isOn}
              />
            </div>
          )}
          {showMax && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 140 }}>
                <Text style={fieldHint}>
                  数量上限{' '}
                  <Tooltip title="工作流与生成工具中，该口可上传或接入的最大数量。参考图/参考视频/参考音频会同步限制用户端提示词附件。">
                    <QuestionCircleOutlined style={{ color: muted, cursor: 'help' }} />
                  </Tooltip>
                </Text>
                <InputNumber
                  size="small"
                  min={0}
                  max={64}
                  precision={0}
                  style={{ width: '100%' }}
                  value={port.max ?? maxFallback}
                  onChange={(v) => patchInput(idx, 'max', typeof v === 'number' ? v : maxFallback)}
                  disabled={!isOn}
                />
              </div>
            </div>
          )}
        </div>
        );
      })}

      <div style={{ margin: '16px 0 8px' }}>
        <Text style={{ fontSize: 13, color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>输出</Text>
      </div>

      {displayOutputs.map((port: any, idx: number) => {
        const isOn = port.enabled !== false;
        return (
        <div
          key={`out-${port.key}`}
          style={{
            background: isOn ? cardBg : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'),
            borderRadius: 8,
            padding: 14,
            border: cardBorder,
            marginBottom: 10,
            opacity: isOn ? 1 : 0.55,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Space>
              <Text strong style={{ fontSize: 13, color: isLight ? '#1f2937' : '#fff' }}>
                {port.label || port.key}
              </Text>
              <Switch
                size="small"
                checked={isOn}
                onChange={(v) => patchOutput(idx, 'enabled', v)}
              />
              <Text style={{ fontSize: 11, color: muted }}>{isOn ? '启用' : '已禁用'}</Text>
            </Space>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <Text style={fieldHint}>结果字段</Text>
              <Input
                size="small"
                value={port.result_key || ''}
                onChange={(e) => patchOutput(idx, 'result_key', e.target.value)}
                placeholder="如 image_url / video_url"
                disabled={!isOn}
              />
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
};

export default SchemeIoEditor;
