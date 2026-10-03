/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useMemo, useState } from 'react';
import { Button, Input, Modal, Switch, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  parsePromptOptimizeBinding,
  seedPromptOptimize,
  type PromptOptimizeBinding,
} from './promptOptimize';

const { Text } = Typography;
const { TextArea } = Input;

type Props = {
  mode: 'scheme' | 'model';
  schemeType: string;
  value: unknown;
  inheritValue?: unknown;
  inheritSchemeName?: string;
  isLight?: boolean;
  onChange: (next: PromptOptimizeBinding | null) => void;
};

const SchemePromptOptimizeField: React.FC<Props> = ({
  mode,
  schemeType,
  value,
  inheritValue,
  inheritSchemeName,
  isLight,
  onChange,
}) => {
  const { t } = useTranslation('playground_2026');
  const kind = schemeType === 'video' ? 'video' : schemeType === 'image' ? 'image' : '';
  const muted = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const label = isLight ? '#1f2937' : '#fff';
  const own = parsePromptOptimizeBinding(value);
  const inherit = useMemo(
    () => (kind ? seedPromptOptimize(inheritValue, kind) : { enabled: false, body: '' }),
    [inheritValue, kind],
  );
  const current = own ?? inherit;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current.body);
  const [baseline, setBaseline] = useState(current.body);

  if (kind !== 'image' && kind !== 'video') return null;

  const commit = (next: PromptOptimizeBinding) => {
    if (mode === 'model'
      && next.enabled === inherit.enabled
      && next.body === inherit.body) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  const openConfig = () => {
    const next = seedPromptOptimize(own ?? inherit, kind);
    commit({ ...next, enabled: true });
    setDraft(next.body);
    setBaseline(next.body);
    setOpen(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ color: label, fontSize: 14 }}>{t('admin_po_title', '优化指令')}</Text>
          <Text style={{ display: 'block', fontSize: 12, marginTop: 2, color: muted }}>
            {mode === 'scheme'
              ? t('admin_po_desc_scheme', '开启后，前台星星按钮用这段约束配合 LLM 扩写用户输入，不会发给图片/视频上游。')
              : t('admin_po_desc_model', '对本模型生效。未改时继承方案{{name}}。', { name: inheritSchemeName ? `「${inheritSchemeName}」` : '' })}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {current.enabled && (
            <Button size="small" icon={<SettingOutlined />} onClick={openConfig}>
              {t('admin_isp_btn_config', '配置')}
            </Button>
          )}
          <Switch
            checked={current.enabled}
            onChange={(v) => {
              if (!v) setOpen(false);
              const body = (own ?? inherit).body;
              commit(seedPromptOptimize({ enabled: v, body }, kind));
            }}
          />
        </div>
      </div>
      <Modal
        title={t('admin_po_title', '优化指令')}
        open={open}
        zIndex={1100}
        width={640}
        onCancel={() => {
          commit({ enabled: true, body: baseline });
          setOpen(false);
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              onClick={() => {
                const next = seedPromptOptimize({ enabled: true, body: '' }, kind);
                setDraft(next.body);
              }}
            >
              {t('admin_reset', '重置')}
            </Button>
            <Button
              onClick={() => {
                commit({ enabled: true, body: baseline });
                setOpen(false);
              }}
            >
              {t('admin_cancel', '取消')}
            </Button>
            <Button
              type="primary"
              onClick={() => {
                commit({ enabled: true, body: draft });
                setOpen(false);
              }}
            >
              {t('admin_done', '完成')}
            </Button>
          </div>
        }
      >
        <Text style={{ display: 'block', fontSize: 12, marginBottom: 8, color: muted }}>
          {t('admin_po_modal_hint', '填写提示词约束，类似 Skill 正文。前台会把它作为系统指令，配合 LLM 改写用户输入。')}
        </Text>
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoSize={{ minRows: 10, maxRows: 22 }}
          placeholder={t('admin_po_modal_ph', '例如：只输出优化后的提示词正文；保留主体与风格；信息不足时补全构图与光线。')}
        />
      </Modal>
    </div>
  );
};

export default SchemePromptOptimizeField;
