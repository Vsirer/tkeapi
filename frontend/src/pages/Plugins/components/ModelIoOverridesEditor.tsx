/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

/**
 * 模型级工作流 IO 覆写编辑器（仅 patch 与方案基线不同的字段）
 * 页面与方案 IO 配置同一套布局
 */
import React, { useMemo } from 'react';
import { Typography } from 'antd';
import type { SchemeIoOverrides, SchemePort } from './scheme/types';
import { applySchemePortPatches, defaultAcceptAssetKinds } from './scheme/schemeIo';
import SchemeIoEditor from './SchemeIoEditor';

const { Text } = Typography;

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

function getNextField(port: SchemePort, field: PatchableKey): any {
  switch (field) {
    case 'enabled':
      return port.enabled !== false;
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

function diffSide(
  basePorts: SchemePort[],
  nextPorts: SchemePort[],
): Record<string, Partial<SchemePort>> | undefined {
  const nextMap = new Map((nextPorts || []).filter((p) => p?.key).map((p) => [p.key, p]));
  const modify: Record<string, Partial<SchemePort>> = {};
  for (const port of basePorts || []) {
    const next = nextMap.get(port.key);
    if (!next) continue;
    const cleaned: Partial<SchemePort> = {};
    for (const k of PATCHABLE_KEYS) {
      if (!sameValue(getNextField(next, k), getBaseField(port, k))) {
        (cleaned as any)[k] = getNextField(next, k);
      }
    }
    if (Object.keys(cleaned).length) modify[port.key] = cleaned;
  }
  return Object.keys(modify).length ? modify : undefined;
}

function overridesFromPorts(
  baseInputs: SchemePort[],
  baseOutputs: SchemePort[],
  nextInputs: SchemePort[],
  nextOutputs: SchemePort[],
): SchemeIoOverrides | null {
  const out: SchemeIoOverrides = {};
  const inMod = diffSide(baseInputs, nextInputs);
  const outMod = diffSide(baseOutputs, nextOutputs);
  if (inMod) out.inputs = { modify: inMod };
  if (outMod) out.outputs = { modify: outMod };
  return Object.keys(out).length ? out : null;
}

export type ModelIoOverridesEditorProps = {
  schemeInputs: SchemePort[];
  schemeOutputs: SchemePort[];
  overrides: SchemeIoOverrides | null | undefined;
  onChange: (next: SchemeIoOverrides | null) => void;
  isLight?: boolean;
  schemeId?: string;
  schemeType?: string;
  schemeParams?: { key: string; label?: string }[];
};

const ModelIoOverridesEditor: React.FC<ModelIoOverridesEditorProps> = ({
  schemeInputs,
  schemeOutputs,
  overrides,
  onChange,
  isLight = true,
  schemeId,
  schemeType = 'video',
  schemeParams = [],
}) => {
  const muted = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  const inputs = useMemo(
    () => applySchemePortPatches(schemeInputs || [], overrides?.inputs?.modify),
    [schemeInputs, overrides],
  );
  const outputs = useMemo(
    () => applySchemePortPatches(schemeOutputs || [], overrides?.outputs?.modify),
    [schemeOutputs, overrides],
  );

  if (!schemeInputs?.length && !schemeOutputs?.length) {
    return <Text type="secondary">该方案未配置工作流 IO</Text>;
  }

  return (
    <div>
      <Text style={{ color: muted, fontSize: 12, display: 'block', marginBottom: 4 }}>
        布局与方案 IO 配置相同；只写入与方案基线不同的字段。
      </Text>
      <SchemeIoEditor
        standalone
        bindKeyDisabled
        schemeId={schemeId}
        schemeType={schemeType}
        params={schemeParams}
        inputs={inputs}
        outputs={outputs}
        onChange={({ inputs: nextIn, outputs: nextOut }) => {
          onChange(overridesFromPorts(schemeInputs || [], schemeOutputs || [], nextIn, nextOut));
        }}
        isLight={isLight}
      />
    </div>
  );
};

export default ModelIoOverridesEditor;
