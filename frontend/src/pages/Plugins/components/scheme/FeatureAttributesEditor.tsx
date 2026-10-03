/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useState } from 'react';
import { Input, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { localizeSchemePhrase } from './schemeParamUtils';

const { Text } = Typography;

type Props = {
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  isLight: boolean;
};

/** 与站点模型管理「二级功能属性选择」同一套勾选 + 自定义标签 */
const FeatureAttributesEditor: React.FC<Props> = ({ value, options, onChange, isLight }) => {
  const { t } = useTranslation('playground_2026');
  const [inputValue, setInputValue] = useState('');
  const selected = Array.isArray(value) ? value : [];

  const toggleOption = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
  };

  const handleAddCustom = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !inputValue.trim()) return;
    e.preventDefault();
    const newTag = inputValue.trim();
    if (!selected.includes(newTag)) onChange([...selected, newTag]);
    setInputValue('');
  };

  const customTags = selected.filter((v) => !options.includes(v));

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>{t('admin_feature_editor_title', '二级功能属性选择')}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{t('admin_feature_editor_desc', '与站点模型管理同步，支持自定义输入添加')}</Text>
      </div>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: isLight ? '#fff' : 'rgba(255,255,255,0.02)',
          border: isLight ? '1px solid #e5e4e7' : '1px solid #303030',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((opt) => (
            <Tag.CheckableTag
              key={opt}
              checked={selected.includes(opt)}
              onChange={() => toggleOption(opt)}
              style={{
                border: '1px solid',
                borderColor: selected.includes(opt) ? 'transparent' : 'var(--border-color, rgba(128,128,128,0.2))',
                padding: '4px 12px',
                fontSize: 13,
                lineHeight: '22px',
              }}
            >
              {localizeSchemePhrase(opt)}
            </Tag.CheckableTag>
          ))}
          {customTags.map((opt) => (
            <Tag
              key={opt}
              closable
              onClose={(e) => {
                e.preventDefault();
                onChange(selected.filter((v) => v !== opt));
              }}
              color="blue"
              style={{ padding: '4px 12px', fontSize: 13, border: 'none', lineHeight: '22px' }}
            >
              {localizeSchemePhrase(opt)}
            </Tag>
          ))}
          <Input
            size="small"
            style={{ width: 140, height: 32, borderRadius: 6 }}
            placeholder={t('admin_feature_editor_ph', '+ 自定义并回车')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleAddCustom}
          />
        </div>
      </div>
    </div>
  );
};

export default FeatureAttributesEditor;
