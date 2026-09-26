/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card, Form, Input, Button, Radio, Select, Alert, Typography,
  Row, Col, Space, Divider, type FormInstance
} from 'antd';
import {
  ApiOutlined, LinkOutlined, SaveOutlined
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

  const rawDefault = watchedDefault !== undefined ? watchedDefault : getStorageValue('default_provider');
  const normalizedDefault = String(rawDefault ?? '').trim().toLowerCase();
  const isNoneDefault = !normalizedDefault || normalizedDefault === 'none';
  const isGlobalDefault = !isNoneDefault && normalizedDefault === GLOBAL_KEY;
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
        !isNoneDefault && normalizedDefault !== GLOBAL_KEY ? normalizedDefault : 'tos'
      );
      return;
    }
    if (userPickedPanel.current) return;
    const next =
      !isNoneDefault && normalizedDefault !== GLOBAL_KEY
        ? normalizedDefault
        : 'tos';
    if (next !== selectedProviderKey) setSelectedProviderKey(next);
  }, [isNoneDefault, normalizedDefault, globalSnapshot, selectedProviderKey]);

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
    if (isNoneDefault || isGlobalDefault) return null;
    return getStorageProvider(normalizedDefault);
  }, [isNoneDefault, isGlobalDefault, normalizedDefault]);

  // 组装存储提供商卡片列表
  const providerCards = useMemo(() => {
    const cards = [];

    if (globalSnapshot) {
      const isSelected = selectedProviderKey === GLOBAL_KEY;
      const isDefault = !isNoneDefault && isGlobalDefault;
      cards.push({
        key: GLOBAL_KEY,
        name: '跟随站点',
        shortName: 'Site',
        brand: `${globalVendorMeta.name}${globalSnapshot.bucket ? ` · ${globalSnapshot.bucket}` : ''}`,
        isSelected,
        isDefault,
        isGlobal: true,
        isConfigured: true,
        testResult: testResults[GLOBAL_KEY],
      });
    }

    const allValues = getAllStorageValues();

    for (const p of STORAGE_PROVIDERS) {
      const isSelected = selectedProviderKey === p.key;
      const isDefault = !isNoneDefault && normalizedDefault === p.key;
      const configured = p.isConfigured(allValues);

      cards.push({
        key: p.key,
        name: p.name,
        shortName: p.shortName,
        brand: p.brand,
        isSelected,
        isDefault,
        isGlobal: false,
        isConfigured: configured,
        testResult: testResults[p.key],
      });
    }

    return cards;
  }, [
    globalSnapshot, selectedProviderKey, isNoneDefault, isGlobalDefault,
    globalVendorMeta, normalizedDefault, watchedDefault, watchedTosAk, watchedCosId,
    watchedTosEndpoint, watchedCosEndpoint, testResults
  ]);

  const panelContent = (
    <div style={{ maxWidth: 840 }}>
      {/* 隐藏表单项，保证 default_provider 字段正常提交 */}
      <Form.Item name={getFieldPath('default_provider')} hidden>
        <Input />
      </Form.Item>

      {/* 顶部：当前默认存储状态栏 (shadcn 极简黑白灰) */}
      <div style={{
        background: isLight ? '#fafafa' : '#18181b',
        border: `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`,
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>
            默认存储
          </Text>
          {isNoneDefault ? (
            <span style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 6,
              background: isLight ? '#f4f4f5' : '#27272a',
              color: isLight ? '#71717a' : '#a1a1aa',
              border: `1px solid ${isLight ? '#e4e4e7' : '#3f3f46'}`,
              fontWeight: 500,
            }}>
              未设置 (停用对象存储)
            </span>
          ) : isGlobalDefault ? (
            <span style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 6,
              background: isLight ? '#18181b' : '#fafafa',
              color: isLight ? '#fafafa' : '#18181b',
              fontWeight: 600,
            }}>
              {globalSnapshot ? `跟随站点 (${globalVendorMeta.name})` : '跟随站点'}
            </span>
          ) : currentDefaultMeta ? (
            <span style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 6,
              background: isLight ? '#18181b' : '#fafafa',
              color: isLight ? '#fafafa' : '#18181b',
              fontWeight: 600,
            }}>
              {currentDefaultMeta.name}
            </span>
          ) : null}
        </div>

        {!isNoneDefault && (
          <Button
            size="small"
            type="text"
            onClick={() => handleSetDefaultProvider('none')}
            style={{
              fontSize: 12,
              height: 24,
              color: isLight ? '#71717a' : '#a1a1aa',
              padding: '0 8px',
            }}
          >
            取消默认
          </Button>
        )}
      </div>

      {/* 存储服务商切换卡片栏 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
            存储服务商
          </Text>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 10,
        }}>
          {providerCards.map(card => {
            const isSelected = card.isSelected;
            return (
              <div
                key={card.key}
                onClick={() => selectProviderPanel(card.key)}
                style={{
                  border: isSelected
                    ? (isLight ? '2px solid #18181b' : '2px solid #fafafa')
                    : (isLight ? '1px solid #e4e4e7' : '1px solid #27272a'),
                  background: isSelected
                    ? (isLight ? '#fafafa' : '#121215')
                    : (isLight ? '#ffffff' : '#09090b'),
                  borderRadius: 8,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 100,
                }}
              >
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: isLight ? '#f4f4f5' : '#27272a',
                        color: isLight ? '#18181b' : '#fafafa',
                        border: `1px solid ${isLight ? '#e4e4e7' : '#3f3f46'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {card.shortName.slice(0, 1)}
                      </div>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: isLight ? '#09090b' : '#fafafa',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {card.name}
                      </span>
                    </div>

                    <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {card.isDefault ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: isLight ? '#18181b' : '#fafafa',
                            color: isLight ? '#fafafa' : '#18181b',
                            fontWeight: 500,
                          }}>
                            默认
                          </span>
                          <Button
                            size="small"
                            type="text"
                            onClick={() => handleSetDefaultProvider('none')}
                            style={{
                              fontSize: 11,
                              height: 22,
                              padding: '0 4px',
                              color: isLight ? '#71717a' : '#a1a1aa',
                            }}
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="small"
                          onClick={() => handleSetDefaultProvider(card.key)}
                          style={{
                            fontSize: 11,
                            height: 22,
                            padding: '0 6px',
                            borderRadius: 4,
                            background: isLight ? '#ffffff' : '#18181b',
                            borderColor: isLight ? '#e4e4e7' : '#27272a',
                            color: isLight ? '#18181b' : '#fafafa',
                          }}
                        >
                          设为默认
                        </Button>
                      )}
                    </div>
                  </div>

                  <div style={{
                    fontSize: 11,
                    color: isLight ? '#71717a' : '#71717a',
                    paddingLeft: 34,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {card.brand}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px solid ${isLight ? '#f4f4f5' : '#1f1f23'}`,
                  fontSize: 11,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: card.isConfigured ? '#22c55e' : (isLight ? '#d4d4d8' : '#3f3f46'),
                      display: 'inline-block',
                    }} />
                    <span style={{
                      color: card.isConfigured
                        ? (isLight ? '#18181b' : '#fafafa')
                        : (isLight ? '#a1a1aa' : '#52525b')
                    }}>
                      {card.isConfigured ? '已配置' : '未配置'}
                    </span>
                  </div>

                  {isSelected && (
                    <span style={{
                      fontSize: 10,
                      color: isLight ? '#71717a' : '#a1a1aa',
                    }}>
                      当前配置
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 聚焦的配置面板 */}
      {showGlobalPanel && globalSnapshot ? (
        <Card
          bordered
          style={{
            borderRadius: 8,
            background: isLight ? '#ffffff' : '#09090b',
            borderColor: isLight ? '#e4e4e7' : '#27272a',
          }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong style={{ fontSize: 14, color: isLight ? '#09090b' : '#fafafa' }}>
                  站点全局存储 (跟随只读)
                </Text>
                {isGlobalDefault && (
                  <span style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: isLight ? '#18181b' : '#fafafa',
                    color: isLight ? '#fafafa' : '#18181b',
                    fontWeight: 500
                  }}>
                    默认
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
                    color: isLight ? '#18181b' : '#fafafa',
                  }}
                >
                  <LinkOutlined /> 站点设置
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
              message={testResults[GLOBAL_KEY]!.success ? '连接测试成功' : '连接测试失败'}
              description={testResults[GLOBAL_KEY]!.message}
              closable
              onClose={() => setTestResults(prev => ({ ...prev, [GLOBAL_KEY]: null }))}
            />
          )}

          <div style={{
            background: isLight ? '#fafafa' : '#18181b',
            border: `1px solid ${isLight ? '#e4e4e7' : '#27272a'}`,
            borderRadius: 6,
            padding: '12px 16px',
            fontSize: 13,
            lineHeight: 1.8,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
              <div>
                <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>生效厂商：</span>
                <Text strong style={{ color: isLight ? '#09090b' : '#fafafa' }}>{globalVendorMeta.name}</Text>
              </div>
              <div>
                <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>存储桶：</span>
                <Text code>{globalSnapshot.bucket || '—'}</Text>
              </div>
              {globalSnapshot.region && (
                <div>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>地域：</span>
                  <Text code>{globalSnapshot.region}</Text>
                </div>
              )}
              {globalSnapshot.endpoint && (
                <div>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>节点：</span>
                  <Text code>{globalSnapshot.endpoint}</Text>
                </div>
              )}
              {globalSnapshot.pathPrefix && (
                <div>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>路径前缀：</span>
                  <Text code>{globalSnapshot.pathPrefix}</Text>
                </div>
              )}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${isLight ? '#f4f4f5' : '#1f1f23'}`,
            gap: 10
          }}>
            <Space size="middle">
              <Button
                icon={<ApiOutlined />}
                onClick={() => handleTestConnection(GLOBAL_KEY)}
                loading={testingKey === GLOBAL_KEY}
                style={{
                  borderRadius: 6,
                  borderColor: isLight ? '#e4e4e7' : '#27272a',
                  color: isLight ? '#18181b' : '#fafafa',
                  background: isLight ? '#ffffff' : '#18181b',
                }}
              >
                测试连接
              </Button>
              {standalone && onSaveStandalone && (
                <Button
                  icon={<SaveOutlined />}
                  loading={savingStandalone}
                  onClick={onSaveStandalone}
                  style={{
                    borderRadius: 6,
                    background: isLight ? '#18181b' : '#fafafa',
                    borderColor: isLight ? '#18181b' : '#fafafa',
                    color: isLight ? '#fafafa' : '#18181b',
                  }}
                >
                  保存配置
                </Button>
              )}
            </Space>
          </div>
        </Card>
      ) : (
      <Card
        bordered
        style={{
          borderRadius: 8,
          background: isLight ? '#fff' : '#09090b',
          borderColor: isLight ? '#e4e4e7' : '#27272a',
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 14, color: isLight ? '#09090b' : '#fafafa' }}>
                {activeProvider.name}
              </Text>
              {normalizedDefault === activeProvider.key && (
                <span style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: isLight ? '#18181b' : '#fafafa',
                  color: isLight ? '#fafafa' : '#18181b',
                  fontWeight: 500
                }}>
                  默认
                </span>
              )}
            </div>
            {activeProvider.docUrl && (
              <a
                href={activeProvider.docUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  color: isLight ? '#71717a' : '#a1a1aa',
                }}
              >
                <LinkOutlined /> 控制台
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
            message={testResults[activeProvider.key]!.success ? '连接测试成功' : '连接测试失败'}
            description={testResults[activeProvider.key]!.message}
            closable
            onClose={() => setTestResults(prev => ({ ...prev, [activeProvider.key]: null }))}
          />
        )}

        {/* 模块 1: 访问凭证 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
              访问凭证
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
                    <span style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>
                      当前: {maskedSecrets[activeProvider.fieldKeys.keySecret]} (留空不修改)
                    </span>
                  ) : undefined
                }
              >
                <Input.Password placeholder={activeProvider.fieldKeys.keySecretPlaceholder} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <Divider style={{ margin: '8px 0 16px', borderColor: isLight ? '#f4f4f5' : '#27272a' }} />

        {/* 模块 2: 存储桶与地域 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
              存储桶与地域
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
                            <span style={{ color: isLight ? '#a1a1aa' : '#52525b', fontSize: 11 }}>{r.region.replace(/^bp-/, '')}</span>
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
                  <Radio.Button value="external" style={{ flex: 1, textAlign: 'center' }}>公网</Radio.Button>
                  <Radio.Button value="internal" style={{ flex: 1, textAlign: 'center' }}>内网</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Endpoint 节点地址"
                name={getFieldPath(activeProvider.fieldKeys.endpoint)}
              >
                <Input placeholder="选择地域后自动生成" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Bucket 存储桶"
                name={getFieldPath(activeProvider.fieldKeys.bucket)}
              >
                <Input placeholder="如 my-storage-bucket" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <Divider style={{ margin: '8px 0 16px', borderColor: isLight ? '#f4f4f5' : '#27272a' }} />

        {/* 模块 3: 域名与路径 (选填) */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
              域名与路径 (选填)
            </Text>
          </div>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="路径前缀"
                name={getFieldPath(activeProvider.fieldKeys.pathPrefix)}
              >
                <Input placeholder="如 assets/" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="自定义域名 / CDN"
                name={getFieldPath(activeProvider.fieldKeys.customDomain)}
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
          justifyContent: 'flex-end',
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${isLight ? '#f4f4f5' : '#1f1f23'}`,
          gap: 10
        }}>
          <Space size="middle">
            <Button
              icon={<ApiOutlined />}
              onClick={() => handleTestConnection(activeProvider.key)}
              loading={testingKey === activeProvider.key}
              style={{
                borderRadius: 6,
                borderColor: isLight ? '#e4e4e7' : '#27272a',
                color: isLight ? '#18181b' : '#fafafa',
                background: isLight ? '#ffffff' : '#18181b',
              }}
            >
              测试连接
            </Button>

            {standalone && onSaveStandalone && (
              <Button
                icon={<SaveOutlined />}
                loading={savingStandalone}
                onClick={onSaveStandalone}
                style={{
                  borderRadius: 6,
                  background: isLight ? '#18181b' : '#fafafa',
                  borderColor: isLight ? '#18181b' : '#fafafa',
                  color: isLight ? '#fafafa' : '#18181b',
                }}
              >
                保存配置
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
