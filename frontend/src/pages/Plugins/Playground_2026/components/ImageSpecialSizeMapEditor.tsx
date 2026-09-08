/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Typography } from 'antd';
import type { ImageSpecialSizeMap } from '../types';
import { lookupPixelSize, normalizeSizeMap } from '../utils/imageSpecialParams';

const { Text } = Typography;

type Props = {
  open: boolean;
  ratios: string[];
  resolutions: string[];
  value?: ImageSpecialSizeMap;
  isLight: boolean;
  onCancel: () => void;
  onOk: (next: ImageSpecialSizeMap | undefined) => void;
};

function usableRatios(ratios: string[]): string[] {
  return ratios.map((r) => String(r).trim()).filter((r) => r && r !== 'auto' && r !== '智能');
}

function buildDraft(
  ratios: string[],
  resolutions: string[],
  sizeMap?: ImageSpecialSizeMap,
): ImageSpecialSizeMap {
  const draft: ImageSpecialSizeMap = {};
  for (const reso of resolutions) {
    const key = String(reso).trim();
    if (!key) continue;
    draft[key] = {};
    for (const ratio of ratios) {
      draft[key][ratio] = lookupPixelSize(key, ratio, sizeMap) || '';
    }
  }
  return draft;
}

const ImageSpecialSizeMapEditor: React.FC<Props> = ({
  open,
  ratios,
  resolutions,
  value,
  isLight,
  onCancel,
  onOk,
}) => {
  const rows = useMemo(() => usableRatios(ratios), [ratios]);
  const cols = useMemo(
    () => resolutions.map((r) => String(r).trim()).filter(Boolean),
    [resolutions],
  );
  const [draft, setDraft] = useState<ImageSpecialSizeMap>({});

  useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(rows, cols, value));
  }, [open]); // 仅打开时灌入，避免输入被父级重渲染冲掉

  const muted = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const border = isLight ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.12)';
  const headBg = isLight ? '#f4f4f5' : '#27272a';
  const cellBg = isLight ? '#fff' : '#18181b';
  const empty = !rows.length || !cols.length;

  const setCell = (reso: string, ratio: string, raw: string) => {
    setDraft((prev) => ({
      ...prev,
      [reso]: { ...(prev[reso] || {}), [ratio]: raw },
    }));
  };

  const width = Math.min(920, Math.max(520, 148 + cols.length * 132));

  return (
    <Modal
      title="关联配置"
      open={open}
      onCancel={onCancel}
      width={width}
      zIndex={1200}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            disabled={empty}
            onClick={() => onOk(normalizeSizeMap(draft))}
          >
            确定
          </Button>
        </div>
      }
    >
      <Text style={{ display: 'block', marginBottom: 12, fontSize: 12, color: muted }}>
        表头为分辨率，左侧为图片比例，单元格填写对应宽高（如 2048x2048）。
      </Text>
      {empty ? (
        <Text style={{ color: muted, fontSize: 13 }}>请先在上方配置图片比例和分辨率。</Text>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              border,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    background: headBg,
                    border,
                    padding: '8px 10px',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    minWidth: 88,
                    fontWeight: 600,
                  }}
                >
                  图片比例
                </th>
                {cols.map((reso) => (
                  <th
                    key={reso}
                    style={{
                      background: headBg,
                      border,
                      padding: '8px 10px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      minWidth: 120,
                      fontWeight: 600,
                    }}
                  >
                    {reso}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((ratio) => (
                <tr key={ratio}>
                  <th
                    style={{
                      background: headBg,
                      border,
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ratio}
                  </th>
                  {cols.map((reso) => (
                    <td key={`${ratio}-${reso}`} style={{ border, padding: 6, background: cellBg }}>
                      <Input
                        size="small"
                        value={draft[reso]?.[ratio] || ''}
                        placeholder="宽x高"
                        onChange={(e) => setCell(reso, ratio, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export default ImageSpecialSizeMapEditor;
