/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card, Form, Input, Button, Radio, Select, Alert, Typography,
  Row, Col, Space, Divider, Tooltip, type FormInstance
} from 'antd';
import {
  CloudServerOutlined, CheckCircleFilled,
  ApiOutlined, StarFilled, StarOutlined, LinkOutlined,
  ThunderboltOutlined, KeyOutlined, HddOutlined, GlobalOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { useThemeStore } from '../../store/theme';
import { Link } from 'react-router-dom';
import {
  STORAGE_PROVIDERS,
  getStorageProvider,
} from './providers';
import type { TestConnectionResult } from './types';
import request from '../../utils/request';

const { Text } = Typography;

export interface StorageConfigPanelProps {
  form: FormInstance;
  namePrefix?: (string | number)[];
  standalone?: boolean;
  pluginName?: string;
  onSaveStandalone?: () => Promise<void>;
  savingStandalone?: boolean;
  maskedSecrets?: Record<string, string>;
  extraBottomContent?: React.ReactNode;
  /** 站点存储已配置时传入，插件页展示「跟随站点设置」卡片（只读） */
  globalSnapshot?: {
    provider: string;
    bucket: string;
    endpoint?: string;
    pathPrefix?: string;
    region?: string;
  };
  siteSettingsHref?: string;
}

const GLOBAL_KEY = 'global';

export const StorageConfigPanel: React.FC<StorageConfigPanelProps> = ({
  form,
  namePrefix = ['storage'],
  standalone = false,
  pluginName,
  onSaveStandalone,
  savingStandalone = false,
  maskedSecrets = {},
  extraBottomContent,
  globalSnapshot,
  siteSettingsHref,
}) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  // 辅助函数：构造表单字段名
  const getFieldPath = (field: string): any => {
    return namePrefix && namePrefix.length > 0 ? [...namePrefix, field] : field;
  };

  // 安全地获取表单值
  const getStorageValue = (field: string) => {
    try {
      if (namePrefix && namePrefix.length > 0) {
        return form.getFieldValue([...namePrefix, field]);
      }
      return form.getFieldValue(field);
    } catch {
      return undefined;
    }
  };

  // 安全地设置表单值
  const setStorageValue = (field: string, val: any) => {
    try {
      if (namePrefix && namePrefix.length > 0) {
        form.setFieldValue([...namePrefix, field], val);
      } else {
        form.setFieldValue(field, val);
      }
    } catch (e) {
      console.error('setStorageValue error', e);
    }
  };

  // 监听默认提供商字段，保持响应式
  const watchedDefault = Form.useWatch(getFieldPath('default_provider'), form);
  const watchedTosAk = Form.useWatch(getFieldPath('tos_access_key'), form);
  const watchedCosId = Form.useWatch(getFieldPath('cos_secret_id'), form);
  const watchedTosEndpoint = Form.useWatch(getFieldPath('tos_endpoint'), form);
  const watchedCosEndpoint = Form.useWatch(getFieldPath('cos_endpoint'), form);

  const defaultProvider = watchedDefault || getStorageValue('default_provider') || 'tos';
  const normalizedDefault = String(defaultProvider || 'tos').toLowerCase();
  const isGlobalDefault = normalizedDefault === GLOBAL_KEY;
  const globalVendorMeta = getStorageProvider(globalSnapshot?.provider || 'tos');
  const [selectedProviderKey, setSelectedProviderKey] = useState<string>('tos');
  const userPickedPanel = useRef(false);
  const showGlobalPanel = selectedProviderKey === GLOBAL_KEY && !!globalSnapshot;

  const selectProviderPanel = (key: string) => {
    userPickedPanel.current = true;
    setSelectedProviderKey(key);
  };

  // 网络类型状态管理 (按提供商 key 隔离)
  const [networkTypes, setNetworkTypes] = useState<Record<string, 'external' | 'internal'>>({
    tos: 'external',
    cos: 'external',
  });

  // 测试连接状态与结果 (按提供商 key 隔离)
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult | null>>({});

  // 表单加载后跟到已保存的默认；用户点过卡片后不再抢选中态
  useEffect(() => {
    if (selectedProviderKey === GLOBAL_KEY && !globalSnapshot) {
      userPickedPanel.current = false;
      setSelectedProviderKey(
        defaultProvider && defaultProvider !== GLOBAL_KEY ? defaultProvider : 'tos'
      );
      return;
    }
    if (userPickedPanel.current) return;
    const next =
      defaultProvider === GLOBAL_KEY && !globalSnapshot
        ? 'tos'
        : (defaultProvider || 'tos');
    if (next !== selectedProviderKey) setSelectedProviderKey(next);
  }, [defaultProvider, globalSnapshot, selectedProviderKey]);

  // 根据当前 endpoint 自动判断初始网络类型
  useEffect(() => {
    const tosEp = watchedTosEndpoint || getStorageValue('tos_endpoint');
    const cosEp = watchedCosEndpoint || getStorageValue('cos_endpoint');

    setNetworkTypes({
      tos: tosEp && (tosEp.includes('ivolces.com') || tosEp.includes('ibytepluses.com')) ? 'internal' : 'external',
      cos: cosEp && cosEp.includes('tencentcos.cn') ? 'internal' : 'external',
    });
  }, [watchedTosEndpoint, watchedCosEndpoint]);

  // 设为默认提供商
  const handleSetDefaultProvider = (providerKey: string) => {
    setStorageValue('default_provider', providerKey);
  };

  // 切换地域时自动更新 Endpoint
  const handleRegionChange = (providerKey: string, regionValue: string) => {
    const provider = getStorageProvider(providerKey);
    const netType = networkTypes[providerKey] || 'external';
    const newEndpoint = provider.resolveEndpoint(regionValue, netType);

    if (newEndpoint) {
      setStorageValue(provider.fieldKeys.endpoint, newEndpoint);
    }
  };

  // 切换内外网类型时自动更新 Endpoint
  const handleNetworkTypeChange = (providerKey: string, netType: 'external' | 'internal') => {
    setNetworkTypes(prev => ({ ...prev, [providerKey]: netType }));
    const provider = getStorageProvider(providerKey);
    const currentRegion = getStorageValue(provider.fieldKeys.region);

    if (currentRegion) {
      const newEndpoint = provider.resolveEndpoint(currentRegion, netType);
      if (newEndpoint) {
        setStorageValue(provider.fieldKeys.endpoint, newEndpoint);
      }
    }
  };

  // 获取全部存储配置对象以供测试连接使用
  const getAllStorageValues = (): Record<string, any> => {
    try {
      if (namePrefix && namePrefix.length > 0) {
        return form.getFieldValue(namePrefix) || {};
      }
      return form.getFieldsValue(true) || {};
    } catch {
      return {};
    }
  };

  // 测试连接
  const handleTestConnection = async (providerKey: string) => {
    setTestingKey(providerKey);
    setTestResults(prev => ({ ...prev, [providerKey]: null }));

    try {
      const values = getAllStorageValues();
      let res: TestConnectionResult;

      if (pluginName) {
        // 插件独立存储测试
        res = await (request.post(`/plugins/${pluginName}/test-connection`, {
          ...values,
          provider: providerKey,
        }) as any);
      } else {
        // 系统全局存储测试
        res = await (request.post('/settings/storage/test', {
          ...values,
          provider: providerKey,
        }) as any);
      }

      setTestResults(prev => ({ ...prev, [providerKey]: res }));
    } catch (error: any) {
      const errMsg = error?.response?.data?.error?.message || error?.message || '测试连接失败';
      setTestResults(prev => ({
        ...prev,
        [providerKey]: { success: false, message: errMsg }
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const activeProvider = useMemo(() => {
    return getStorageProvider(selectedProviderKey);
  }, [selectedProviderKey]);

  const currentDefaultMeta = useMemo(() => {
    return getStorageProvider(defaultProvider);
  }, [defaultProvider]);

  // 组装存储提供商卡片列表（包含全局跟随选项与具体厂商，自适应无限扩展）
  const providerCards = useMemo(() => {
    const cards = [];

    if (globalSnapshot) {
      const isSelected = selectedProviderKey === GLOBAL_KEY;
      const isDefault = isGlobalDefault;
      cards.push({
        key: GLOBAL_KEY,
        name: '跟随站点',
        shortName: 'Global',
        brand: `站点: ${globalVendorMeta.name}${globalSnapshot.bucket ? ` · ${globalSnapshot.bucket}` : ''}`,
        tag: '免填写',
        icon: <GlobalOutlined />,
        isSelected,
        isDefault,
        isGlobal: true,
        statusDotColor: '#52c41a',
        statusText: '站点已配置',
        testResult: testResults[GLOBAL_KEY],
      });
    }

    const allValues = getAllStorageValues();

    for (const p of STORAGE_PROVIDERS) {
      const isSelected = selectedProviderKey === p.key;
      const isDefault = normalizedDefault === p.key;
      const configured = p.isConfigured(allValues);

      cards.push({
        key: p.key,
        name: p.name,
        shortName: p.shortName,
        brand: p.brand,
        tag: p.tag,
        icon: <span>{p.shortName.slice(0, 1)}</span>,
        isSelected,
        isDefault,
        isGlobal: false,
        statusDotColor: configured ? '#52c41a' : '#cbd5e1',
        statusText: configured ? '已配置凭证' : '未配置',
        testResult: testResults[p.key],
      });
    }

    return cards;
  }, [
    globalSnapshot, selectedProviderKey, isGlobalDefault,
    globalVendorMeta, normalizedDefault, watchedDefault, watchedTosAk, watchedCosId,
    watchedTosEndpoint, watchedCosEndpoint, testResults
  ]);

  const panelContent = (
    <div style={{ maxWidth: 840 }}>
      {/* 隐藏表单项，保证 default_provider 字段正常提交 */}
      <Form.Item name={getFieldPath('default_provider')} hidden initialValue="tos">
        <Input />
      </Form.Item>

      {/* 顶部：当前生效存储与多凭证策略说明 Banner */}
      <div style={{
        background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 10,
        padding: '14px 18px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            background: isLight ? '#e6f4ff' : 'rgba(22, 119, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1677ff',
            fontSize: 20
          }}>
            <CloudServerOutlined />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 14, color: isLight ? '#1e293b' : '#fff' }}>
                当前默认存储：
              </Text>
              <span style={{
                fontSize: 12,
                padding: '2px 8px',
                fontWeight: 600,
                borderRadius: 4,
                background: isLight ? '#e6f4ff' : 'rgba(22, 119, 255, 0.2)',
                color: isLight ? '#0958d9' : '#69b1ff',
                border: isLight ? '1px solid #91caff' : '1px solid rgba(22, 119, 255, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <StarFilled style={{ color: '#faad14', fontSize: 11 }} />
                {isGlobalDefault
                  ? (globalSnapshot ? `跟随站点设置（${globalVendorMeta.name}）` : '跟随站点设置')
                  : currentDefaultMeta.name}
              </span>
            </div>
            <span style={{ fontSize: 12, marginTop: 3, display: 'block', color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>
              {isGlobalDefault
                ? '新上传文件写入站点设置中的对象存储；本插件已保存的厂商凭证仍保留，历史文件按原存储桶读取与删除。'
                : '新上传文件将自动写入默认提供商；已配置的多套存储凭证均会保留，历史旧文件仍按原存储桶进行读取与删除。'}
            </span>
          </div>
        </div>
      </div>

      {/* 提供商切换卡片栏 (自适应 Grid 网格排列，多存储提供商时自适应整齐对称) */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 13, color: isLight ? '#334155' : 'rgba(255, 255, 255, 0.75)' }}>
            选择存储提供商进行配置：
          </Text>
          <span style={{ fontSize: 12, color: isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.45)' }}>
            {globalSnapshot ? '可跟随站点设置，或单独配置各存储服务' : '点击卡片切换配置，支持多提供商凭证热备'}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: 12,
        }}>
          {providerCards.map(card => {
            return (
              <div
                key={card.key}
                onClick={() => selectProviderPanel(card.key)}
                style={{
                  border: card.isSelected
                    ? (isLight ? '2px solid #1677ff' : '2px solid #3b82f6')
                    : (isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.1)'),
                  background: card.isSelected
                    ? (isLight ? 'rgba(22, 119, 255, 0.04)' : 'rgba(22, 119, 255, 0.1)')
                    : (isLight ? '#ffffff' : '#141414'),
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  boxShadow: card.isSelected ? '0 4px 14px rgba(22, 119, 255, 0.1)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 110,
                }}
              >
                <div>
                  {/* 第一行：图标 + 厂商名 + 标签 + 右侧默认状态/设为默认按钮 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        background: card.isSelected
                          ? '#1677ff'
                          : (isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.08)'),
                        color: card.isSelected ? '#fff' : (isLight ? '#475569' : '#d1d5db'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {card.icon}
                      </div>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: isLight ? '#0f172a' : '#f9fafb',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {card.name}
                      </span>
                      {card.tag && (
                        <span style={{
                          fontSize: 10,
                          lineHeight: '16px',
                          padding: '0 4px',
                          borderRadius: 3,
                          background: card.isGlobal
                            ? (isLight ? 'rgba(82, 196, 26, 0.1)' : 'rgba(82, 196, 26, 0.2)')
                            : (isLight ? 'rgba(22, 119, 255, 0.1)' : 'rgba(22, 119, 255, 0.2)'),
                          color: card.isGlobal
                            ? (isLight ? '#389e0d' : '#95de64')
                            : (isLight ? '#1677ff' : '#69b1ff'),
                          border: card.isGlobal
                            ? (isLight ? '1px solid rgba(82, 196, 26, 0.25)' : '1px solid rgba(82, 196, 26, 0.35)')
                            : (isLight ? '1px solid rgba(22, 119, 255, 0.25)' : '1px solid rgba(22, 119, 255, 0.35)'),
                          fontWeight: 500,
                          flexShrink: 0,
                        }}>
                          {card.tag}
                        </span>
                      )}
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      {card.isDefault ? (
                        <span style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          background: isLight ? '#f6ffed' : 'rgba(82, 196, 26, 0.15)',
                          color: isLight ? '#389e0d' : '#95de64',
                          border: isLight ? '1px solid #b7eb8f' : '1px solid rgba(82, 196, 26, 0.3)',
                          fontWeight: 500,
                        }}>
                          <StarFilled style={{ fontSize: 10 }} /> 默认生效
                        </span>
                      ) : (
                        <Tooltip title={card.isGlobal ? '新上传文件使用站点设置中的对象存储，无需在此填写凭证' : '点击设为新上传文件的默认对象存储'}>
                          <Button
                            size="small"
                            type="text"
                            icon={<StarOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetDefaultProvider(card.key);
                              selectProviderPanel(card.key);
                            }}
                            style={{
                              fontSize: 11,
                              height: 22,
                              padding: '0 4px',
                              color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.5)',
                            }}
                          >
                            设为默认
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* 第二行：厂商描述 / 桶信息 */}
                  <div
                    style={{
                      fontSize: 11,
                      color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingLeft: 38,
                      marginBottom: 8,
                    }}
                    title={card.brand}
                  >
                    {card.brand}
                  </div>
                </div>

                {/* 第三行：底部状态行 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  paddingTop: 8,
                  borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: 11,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: card.statusDotColor,
                      display: 'inline-block',
                    }} />
                    <span style={{
                      color: card.statusDotColor === '#52c41a'
                        ? (isLight ? '#237804' : '#73d13d')
                        : (isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.35)')
                    }}>
                      {card.statusText}
                    </span>
                  </div>

                  {card.testResult ? (
                    <span style={{
                      fontSize: 10,
                      padding: '0 5px',
                      lineHeight: '16px',
                      borderRadius: 3,
                      background: card.testResult.success
                        ? (isLight ? '#f6ffed' : 'rgba(82, 196, 26, 0.15)')
                        : (isLight ? '#fff2f0' : 'rgba(255, 77, 79, 0.15)'),
                      color: card.testResult.success
                        ? (isLight ? '#389e0d' : '#95de64')
                        : (isLight ? '#cf1322' : '#ff7875'),
                      border: card.testResult.success
                        ? (isLight ? '1px solid #b7eb8f' : '1px solid rgba(82, 196, 26, 0.3)')
                        : (isLight ? '1px solid #ffccc7' : '1px solid rgba(255, 77, 79, 0.3)'),
                    }}>
                      {card.testResult.success ? '连通正常' : '连接失败'}
                    </span>
                  ) : card.isSelected ? (
                    <span style={{
                      fontSize: 10,
                      color: isLight ? '#1677ff' : '#4096ff',
                      fontWeight: 500,
                    }}>
                      当前配置中
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 聚焦的配置面板：跟随站点时展示精简概要，厂商卡展示可编辑表单 */}
      {showGlobalPanel && globalSnapshot ? (
        <Card
          bordered={true}
          style={{
            borderRadius: 10,
            background: isLight ? '#ffffff' : '#141414',
            borderColor: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)',
          }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#52c41a'
                }} />
                <Text strong style={{ fontSize: 14, color: isLight ? '#0f172a' : '#fff' }}>
                  站点全局存储（跟随只读）
                </Text>
                {isGlobalDefault && (
                  <span style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: isLight ? '#f6ffed' : 'rgba(82, 196, 26, 0.15)',
                    color: isLight ? '#389e0d' : '#95de64',
                    border: isLight ? '1px solid #b7eb8f' : '1px solid rgba(82, 196, 26, 0.3)',
                    fontWeight: 500
                  }}>
                    默认生效中
                  </span>
                )}
              </div>
              {siteSettingsHref && (
                <Link
                  to={siteSettingsHref}
                  style={{
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: isLight ? '#1677ff' : '#4096ff',
                  }}
                >
                  <LinkOutlined /> 前往站点设置修改全局存储
                </Link>
              )}
            </div>
          }
        >
          {testResults[GLOBAL_KEY] && (
            <Alert
              type={testResults[GLOBAL_KEY]!.success ? 'success' : 'error'}
              showIcon
              style={{ marginBottom: 14, borderRadius: 6 }}
              message={testResults[GLOBAL_KEY]!.success ? '站点存储连接测试成功' : '连接测试失败'}
              description={testResults[GLOBAL_KEY]!.message}
              closable
              onClose={() => setTestResults(prev => ({ ...prev, [GLOBAL_KEY]: null }))}
            />
          )}

          {/* 精简的配置摘要条目 */}
          <div style={{
            background: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 13,
            lineHeight: 1.8,
            color: isLight ? '#334155' : 'rgba(255, 255, 255, 0.75)'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
              <div>
                <span style={{ color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>生效厂商：</span>
                <Text strong style={{ color: isLight ? '#0f172a' : '#fff' }}>{globalVendorMeta.name}</Text>
              </div>
              <div>
                <span style={{ color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>存储桶 (Bucket)：</span>
                <Text code>{globalSnapshot.bucket || '—'}</Text>
              </div>
              {globalSnapshot.region && (
                <div>
                  <span style={{ color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>地域：</span>
                  <Text code>{globalSnapshot.region}</Text>
                </div>
              )}
              {globalSnapshot.endpoint && (
                <div>
                  <span style={{ color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>Endpoint：</span>
                  <Text code>{globalSnapshot.endpoint}</Text>
                </div>
              )}
              {globalSnapshot.pathPrefix && (
                <div>
                  <span style={{ color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>路径前缀：</span>
                  <Text code>{globalSnapshot.pathPrefix}</Text>
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, marginTop: 6, color: isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.4)' }}>
              {isGlobalDefault
                ? '新上传写入站点对象存储；本插件已保存的厂商凭证仍保留，历史文件按原存储桶读取与删除。'
                : '当前为站点存储预览（只读），不会改默认。点「设为默认」后新上传才走站点桶。'}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 14,
            paddingTop: 12,
            borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div>
              {!isGlobalDefault && (
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleSetDefaultProvider(GLOBAL_KEY)}
                  style={{ borderRadius: 6 }}
                >
                  设为默认对象存储
                </Button>
              )}
            </div>
            <Space size="middle">
              <Button
                icon={<ApiOutlined />}
                onClick={() => handleTestConnection(GLOBAL_KEY)}
                loading={testingKey === GLOBAL_KEY}
                style={{ borderRadius: 6 }}
              >
                测试站点存储连接
              </Button>
              {standalone && onSaveStandalone && (
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={savingStandalone}
                  onClick={onSaveStandalone}
                  style={{ borderRadius: 6 }}
                >
                  保存存储配置
                </Button>
              )}
            </Space>
          </div>
        </Card>
      ) : (
      <Card
        bordered={true}
        style={{
          borderRadius: 10,
          background: isLight ? '#fff' : '#141414',
          borderColor: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)',
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: activeProvider.brandColor || '#1677ff'
              }} />
              <Text strong style={{ fontSize: 15, color: isLight ? '#0f172a' : '#fff' }}>
                {activeProvider.name} 配置
              </Text>
              {normalizedDefault === activeProvider.key && (
                <span style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: isLight ? '#f6ffed' : 'rgba(82, 196, 26, 0.15)',
                  color: isLight ? '#389e0d' : '#95de64',
                  border: isLight ? '1px solid #b7eb8f' : '1px solid rgba(82, 196, 26, 0.3)',
                  fontWeight: 500
                }}>
                  当前默认
                </span>
              )}
            </div>
            {activeProvider.docUrl && (
              <a
                href={activeProvider.docUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1677ff' }}
              >
                <LinkOutlined /> 控制台指引
              </a>
            )}
          </div>
        }
      >
        {/* 连接测试结果提示 */}
        {testResults[activeProvider.key] && (
          <Alert
            type={testResults[activeProvider.key]!.success ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 16, borderRadius: 6 }}
            message={testResults[activeProvider.key]!.success ? `${activeProvider.name} 连接测试成功` : '连接测试失败'}
            description={testResults[activeProvider.key]!.message}
            closable
            onClose={() => setTestResults(prev => ({ ...prev, [activeProvider.key]: null }))}
          />
        )}

        {/* 模块 1: 访问密钥凭证 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <KeyOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <Text strong style={{ fontSize: 13, color: isLight ? '#1e293b' : 'rgba(255, 255, 255, 0.85)' }}>
              1. 访问密钥凭证 (API Credentials)
            </Text>
          </div>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label={activeProvider.fieldKeys.keyIdLabel}
                name={getFieldPath(activeProvider.fieldKeys.keyId)}
              >
                <Input placeholder={activeProvider.fieldKeys.keyIdPlaceholder} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label={activeProvider.fieldKeys.keySecretLabel}
                name={getFieldPath(activeProvider.fieldKeys.keySecret)}
                extra={
                  maskedSecrets[activeProvider.fieldKeys.keySecret] ? (
                    <span style={{ fontSize: 11, color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>
                      当前: {maskedSecrets[activeProvider.fieldKeys.keySecret]}（留空不修改）
                    </span>
                  ) : undefined
                }
              >
                <Input.Password placeholder={activeProvider.fieldKeys.keySecretPlaceholder} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <Divider style={{ margin: '8px 0 16px', borderColor: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.06)' }} />

        {/* 模块 2: 数据地域与存储桶 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <HddOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <Text strong style={{ fontSize: 13, color: isLight ? '#1e293b' : 'rgba(255, 255, 255, 0.85)' }}>
              2. 存储桶与地域设置 (Bucket & Region)
            </Text>
          </div>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="数据地域"
                name={getFieldPath(activeProvider.fieldKeys.region)}
              >
                <Select
                  placeholder="选择数据地域"
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  onChange={(val: string) => handleRegionChange(activeProvider.key, val)}
                >
                  {activeProvider.regionGroups.map(g => (
                    <Select.OptGroup key={g.group} label={<span style={{ fontWeight: 600, fontSize: 12 }}>{g.group}</span>}>
                      {g.regions.map(r => (
                        <Select.Option key={r.region} value={r.region} label={`${r.label} ${r.region}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{r.label}</span>
                            <span style={{ color: isLight ? '#94a3b8' : 'rgba(255, 255, 255, 0.35)', fontSize: 11 }}>{r.region.replace(/^bp-/, '')}</span>
                          </div>
                        </Select.Option>
                      ))}
                    </Select.OptGroup>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item label="网络类型">
                <Radio.Group
                  value={networkTypes[activeProvider.key] || 'external'}
                  optionType="button"
                  buttonStyle="solid"
                  style={{ width: '100%', display: 'flex' }}
                  onChange={(e) => handleNetworkTypeChange(activeProvider.key, e.target.value)}
                >
                  <Radio.Button value="external" style={{ flex: 1, textAlign: 'center' }}>公网 / 外网</Radio.Button>
                  <Radio.Button value="internal" style={{ flex: 1, textAlign: 'center' }}>专线 / 内网</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Endpoint 节点地址"
                name={getFieldPath(activeProvider.fieldKeys.endpoint)}
                extra={<span style={{ fontSize: 11, color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>选择地域后自动填充，也可手动输入</span>}
              >
                <Input placeholder="选择地域后自动生成" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Bucket 存储桶"
                name={getFieldPath(activeProvider.fieldKeys.bucket)}
                extra={<span style={{ fontSize: 11, color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>{activeProvider.fieldKeys.bucketExtra || '对象存储桶名称'}</span>}
              >
                <Input placeholder="如 my-storage-bucket" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <Divider style={{ margin: '8px 0 16px', borderColor: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.06)' }} />

        {/* 模块 3: 访问与 CDN 加速 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <GlobalOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            <Text strong style={{ fontSize: 13, color: isLight ? '#1e293b' : 'rgba(255, 255, 255, 0.85)' }}>
              3. 访问与加速配置 (可选)
            </Text>
          </div>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="路径前缀"
                name={getFieldPath(activeProvider.fieldKeys.pathPrefix)}
                extra={<span style={{ fontSize: 11, color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>选填，如 assets/ 或 uploads/</span>}
              >
                <Input placeholder="如 assets/" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="自定义域名 / CDN 加速"
                name={getFieldPath(activeProvider.fieldKeys.customDomain)}
                extra={<span style={{ fontSize: 11, color: isLight ? '#64748b' : 'rgba(255, 255, 255, 0.45)' }}>选填，例如 https://cdn.example.com</span>}
              >
                <Input placeholder="如 https://cdn.example.com" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 底部操作工具栏 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 16,
          paddingTop: 14,
          borderTop: isLight ? '1px solid #f1f5f9' : '1px solid rgba(255, 255, 255, 0.06)',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div>
            {normalizedDefault === activeProvider.key ? (
              <span style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                background: isLight ? '#f6ffed' : 'rgba(82, 196, 26, 0.15)',
                color: isLight ? '#389e0d' : '#95de64',
                border: isLight ? '1px solid #b7eb8f' : '1px solid rgba(82, 196, 26, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 500
              }}>
                <CheckCircleFilled /> 已是系统默认对象存储
              </span>
            ) : (
              <Button
                icon={<ThunderboltOutlined />}
                onClick={() => handleSetDefaultProvider(activeProvider.key)}
                style={{ borderRadius: 6 }}
              >
                设为默认对象存储
              </Button>
            )}
          </div>

          <Space size="middle">
            <Button
              icon={<ApiOutlined />}
              onClick={() => handleTestConnection(activeProvider.key)}
              loading={testingKey === activeProvider.key}
              style={{ borderRadius: 6 }}
            >
              测试 {activeProvider.shortName} 连接
            </Button>

            {standalone && onSaveStandalone && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingStandalone}
                onClick={onSaveStandalone}
                style={{ borderRadius: 6 }}
              >
                保存存储配置
              </Button>
            )}
          </Space>
        </div>
      </Card>
      )}

      {/* 附加内容（如配额设置、CORS 指引等） */}
      {extraBottomContent}
    </div>
  );

  if (standalone) {
    return (
      <Form form={form} layout="vertical" requiredMark={false}>
        {panelContent}
      </Form>
    );
  }

  return panelContent;
};
