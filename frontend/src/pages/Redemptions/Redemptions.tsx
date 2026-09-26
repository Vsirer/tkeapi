/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useEffect, useState } from 'react';
import {
  Table, Tag, Card, Typography, Space, Button, Modal, Form, Input, InputNumber,
  Popconfirm, Switch, App, Radio, DatePicker, Drawer, Tooltip
} from 'antd';
import { listPagination, useListPager } from '../../components/ListPagination';
import {
  SyncOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  EyeOutlined,
  CloseCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { copyToClipboard as copyToClipboardUtil } from '../../utils/clipboard';
import type { Redemption, RedemptionGroup } from '../../types';
import dayjs from 'dayjs';
import { isRedemptionExpired } from '../../utils/quotaPeriod';

const { Title, Text } = Typography;

interface GenerateResponse {
  success: boolean;
  count: number;
  codes: string[];
}

const Redemptions: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message: msgApi, modal } = App.useApp();
  const isZh = i18n.language === 'zh';
  const { settings, updateStoreSettings, fetchSettings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const quotaTz = settings?.site?.default_timezone || 'Asia/Shanghai';
  
  // Group states
  const [groups, setGroups] = useState<RedemptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { page: currentPage, pageSize, setPage: setCurrentPage, setPageSize } = useListPager();
  const [total, setTotal] = useState(0);

  // Drawer states
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [drawerCodes, setDrawerCodes] = useState<Redemption[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const { page: drawerCurrentPage, pageSize: drawerPageSize, setPage: setDrawerCurrentPage, setPageSize: setDrawerPageSize } = useListPager();
  const [drawerTotal, setDrawerTotal] = useState(0);

  const [toggleLoading, setToggleLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [form] = Form.useForm();

  const permanent = Form.useWatch('permanent', form);
  const allowMultiple = Form.useWatch('allow_multiple', form);
  const limitPerUserActivity = Form.useWatch('limit_per_user_activity', form);

  const fetchGroups = async (page = currentPage, size = pageSize, search = searchKeyword) => {
    setLoading(true);
    try {
      const queryParam = search.trim() ? `&name=${encodeURIComponent(search.trim())}` : '';
      const resp = await (request.get(`/redemptions/groups?page=${page}&page_size=${size}${queryParam}`) as unknown as Promise<{ data: RedemptionGroup[], total: number }>);
      setGroups(resp.data);
      setTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword);
    setCurrentPage(1);
    fetchGroups(1, pageSize, keyword);
  };

  const fetchDrawerCodes = async (name: string, page = drawerCurrentPage, size = drawerPageSize) => {
    setDrawerLoading(true);
    try {
      const resp = await (request.get(`/redemptions?name=${encodeURIComponent(name)}&page=${page}&page_size=${size}`) as unknown as Promise<{ data: Redemption[], total: number }>);
      setDrawerCodes(resp.data);
      setDrawerTotal(resp.total);
    } catch (e) {
      console.error(e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const openDrawer = (name: string) => {
    setSelectedGroup(name);
    setDrawerVisible(true);
    setDrawerCurrentPage(1);
    fetchDrawerCodes(name, 1, drawerPageSize);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setSelectedGroup(null);
    setDrawerCodes([]);
  };

  const loadFeatureFlag = async () => {
    try {
      const res = await (request.get('/settings/full') as any);
      const on = !!res?.marketing?.enable_redemption;
      setEnabled(on);
      if (res) {
        updateStoreSettings({
          ...(settings || {}),
          ...res,
        } as any);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleRedemption = async (checked: boolean) => {
    setToggleLoading(true);
    try {
      const res = await (request.post('/settings', {
        marketing: { enable_redemption: checked },
      }) as any);
      setEnabled(checked);
      updateStoreSettings(res);
      await fetchSettings(true);
      msgApi.success(
        checked
          ? (isZh ? '已开启兑换功能' : 'Redemption enabled')
          : (isZh ? '已关闭兑换功能' : 'Redemption disabled'),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setToggleLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    const ok = await copyToClipboardUtil(text);
    if (ok) {
      msgApi.success(t('common.copied'));
    } else {
      msgApi.error(isZh ? '复制失败，请手动选择复制' : 'Failed to copy, please select manually');
    }
  };

  const handleCreate = async (values: any) => {
    try {
      const payload = {
        name: values.name,
        count: values.count,
        quota: values.quota,
        permanent: !!values.permanent,
        expires_at: values.permanent
          ? null
          : (values.expires_at ? dayjs(values.expires_at).format('YYYY-MM-DD') : null),
        allow_multiple: !!values.allow_multiple,
        // 与活动参与次数解耦：关闭多次兑换时单码仅 1 次；开启时用自定义总次数
        max_uses: values.allow_multiple ? Number(values.max_uses ?? -1) : 1,
        // 单码单用户：关闭多次兑换固定 1；开启时不限，改由活动参与次数约束
        per_user_limit: values.allow_multiple ? -1 : 1,
        // 活动级单用户参与次数：默认不限，开启后自定义
        per_user_activity_limit: values.limit_per_user_activity
          ? Number(values.per_user_activity_limit ?? 1)
          : -1,
      };

      const resp = await (request.post('/redemptions', payload) as unknown as Promise<GenerateResponse>);
      if (resp.success) {
        msgApi.success(t('common.success'));
        setIsModalOpen(false);
        form.resetFields();
        setCurrentPage(1);
        fetchGroups(1, pageSize);

        modal.success({
          title: t('redemptions.codes_generated'),
          content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {isZh ? '您可以点击右侧按钮单独复制，或一键复制全部代码' : 'Copy individual codes or copy all at once.'}
                </Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(resp.codes.join('\n'))}
                  style={{ borderRadius: 6 }}
                >
                  {isZh ? '复制全部' : 'Copy All'}
                </Button>
              </div>
              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  borderRadius: 10,
                  border: '1px solid var(--ant-color-border-secondary)',
                  background: 'var(--ant-color-bg-layout)',
                  padding: '4px 0',
                }}
              >
                {resp.codes.map((code: string) => (
                  <div
                    key={code}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 16px',
                      borderBottom: '1px solid var(--ant-color-border-secondary)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        fontSize: 14,
                        letterSpacing: '0.5px',
                        color: 'var(--ant-color-text)',
                        userSelect: 'all',
                      }}
                    >
                      {code}
                    </span>
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      size="small"
                      onClick={() => copyToClipboard(code)}
                      style={{
                        color: '#1677ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ),
          width: 480,
          okText: t('common.ok'),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteGroup = async (name: string) => {
    try {
      await request.delete(`/redemptions/groups?name=${encodeURIComponent(name)}`);
      msgApi.success(t('common.success'));
      fetchGroups(currentPage, pageSize, searchKeyword);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSingle = async (id: number) => {
    try {
      await request.delete(`/redemptions/${id}`);
      msgApi.success(t('common.success'));
      if (selectedGroup) {
        fetchDrawerCodes(selectedGroup, drawerCurrentPage, drawerPageSize);
        fetchGroups(currentPage, pageSize, searchKeyword); // Update group stats quietly
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id: number, status: number) => {
    try {
      await request.put(`/redemptions/${id}/status`, { status });
      msgApi.success(t('common.success'));
      if (selectedGroup) {
        fetchDrawerCodes(selectedGroup, drawerCurrentPage, drawerPageSize);
      }
    } catch (e) {
      console.error(e);
    }
  };


  useEffect(() => {
    fetchGroups(1, pageSize);
    loadFeatureFlag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatExpiryGroup = (expires_at?: string | null) => {
    if (!expires_at) {
      return <Tag color="blue">{isZh ? '长期有效' : 'Permanent'}</Tag>;
    }
    const expired = isRedemptionExpired(expires_at, quotaTz);
    const dateLabel = String(expires_at).trim().slice(0, 10);
    return (
      <Tag color={expired ? 'error' : 'processing'}>
        {dateLabel}
        {expired ? (isZh ? ' · 已过期' : ' · Expired') : ''}
      </Tag>
    );
  };

  const groupColumns = [
    {
      title: isZh ? '活动名称' : 'Activity Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: isZh ? '生成数量' : 'Total Codes',
      dataIndex: 'total_count',
      key: 'total_count',
      render: (count: number) => <Tag color="geekblue">{count}</Tag>,
    },
    {
      title: isZh ? '总面额' : 'Total Quota',
      dataIndex: 'total_quota',
      key: 'total_quota',
      render: (q: number) => <Text strong>{currencySymbol}{Number(q).toFixed(6)}</Text>,
    },
    {
      title: isZh ? '已兑换(次)' : 'Total Redeemed',
      dataIndex: 'total_used_count',
      key: 'total_used_count',
    },
    {
      title: isZh ? '兑换规则' : 'Rule',
      key: 'rule',
      render: (_: unknown, record: RedemptionGroup) => {
        const max = record.max_uses ?? 1;
        const activityLimit = record.per_user_activity_limit ?? -1;
        const maxText = max === -1 || max === 0
          ? (isZh ? '无限' : 'Unlimited')
          : max;
        const activityText = activityLimit === -1 || activityLimit === 0
          ? (isZh ? '不限制' : 'Unlimited')
          : activityLimit;
        return (
          <div style={{ fontSize: '12px', color: 'var(--ant-color-text-secondary)', lineHeight: '1.5' }}>
            <div>{isZh ? '单码可兑:' : 'Per code:'} <Text strong>{maxText}</Text></div>
            <div>{isZh ? '单人活动:' : 'Per user:'} <Text strong>{activityText}</Text></div>
          </div>
        );
      },
    },
    {
      title: isZh ? '有效期' : 'Validity',
      key: 'expires_at',
      render: (_: unknown, record: RedemptionGroup) => formatExpiryGroup(record.expires_at),
    },
    {
      title: t('redemptions.created_at'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: RedemptionGroup) => (
        <Space>
          <Tooltip title={isZh ? '查看明细' : 'View Details'}>
            <Button 
              icon={<EyeOutlined />} 
              size="small" 
              onClick={() => openDrawer(record.name)} 
            />
          </Tooltip>
          <Popconfirm title={isZh ? `确定要删除活动 [${record.name}] 下的所有兑换码吗？` : `Delete all codes under [${record.name}]?`} onConfirm={() => handleDeleteGroup(record.name)}>
            <Button icon={<DeleteOutlined />} danger size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const drawerColumns = [
    {
      title: t('redemptions.code'),
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <Space>
          <Text code>{code}</Text>
          <Button type="text" icon={<CopyOutlined />} size="small" onClick={() => copyToClipboard(code)} />
        </Space>
      ),
    },
    {
      title: t('redemptions.quota'),
      dataIndex: 'quota',
      key: 'quota',
      render: (q: number) => <Text>{currencySymbol}{Number(q).toFixed(2)}</Text>,
    },
    {
      title: isZh ? '兑换人' : 'Used By',
      key: 'used_by',
      render: (_: unknown, record: Redemption) => {
        if (record.used_count && record.used_count > 1) {
          return <Text type="secondary">{isZh ? `已兑 ${record.used_count} 次` : `Redeemed ${record.used_count} times`}</Text>;
        }
        return record.used_by ? <Text>{record.used_by}</Text> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: isZh ? '兑换时间' : 'Used At',
      dataIndex: 'used_at',
      key: 'used_at',
      render: (t?: string | null) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : <Text type="secondary">-</Text>,
    },
    {
      title: isZh ? '状态' : 'Status',
      key: 'status',
      render: (_: unknown, record: Redemption) => {
        if (record.status === -1) return <Tag color="default">{isZh ? '已作废' : 'Voided'}</Tag>;
        if (record.status === 0) return <Tag color="warning">{isZh ? '已禁用' : 'Disabled'}</Tag>;
        const expired = isRedemptionExpired(record.expires_at, quotaTz);
        const max = record.max_uses ?? 1;
        const used = record.used_count ?? (record.is_used ? 1 : 0);
        const exhausted = (max > 0 && used >= max) || (!!record.is_used && max === 1);
        if (expired) return <Tag color="error">{isZh ? '已过期' : 'Expired'}</Tag>;
        if (exhausted) return <Tag color="error">{isZh ? '已用完' : 'Exhausted'}</Tag>;
        return <Tag color="success">{isZh ? '正常' : 'Active'}</Tag>;
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: Redemption) => (
        <Space>
          {record.status !== -1 && (
            <Popconfirm title={isZh ? '确定要作废该兑换码吗？作废后不可恢复使用' : 'Are you sure you want to void this code?'} onConfirm={() => handleUpdateStatus(record.id, -1)}>
              <Tooltip title={isZh ? '作废' : 'Void'}>
                <Button icon={<CloseCircleOutlined />} danger size="small" />
              </Tooltip>
            </Popconfirm>
          )}
          {record.status !== -1 && (
            <Tooltip title={record.status === 0 ? (isZh ? '启用' : 'Enable') : (isZh ? '禁用' : 'Disable')}>
              <Button 
                icon={record.status === 0 ? <CheckCircleOutlined /> : <StopOutlined />} 
                size="small" 
                onClick={() => handleUpdateStatus(record.id, record.status === 0 ? 1 : 0)}
              />
            </Tooltip>
          )}
          <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDeleteSingle(record.id)}>
            <Tooltip title={isZh ? '删除' : 'Delete'}>
              <Button icon={<DeleteOutlined />} danger size="small" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (selectedGroup) {
    return (
      <Card variant="borderless">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
          <Button onClick={closeDrawer} style={{ marginRight: 8 }}>
            {isZh ? '返回' : 'Back'}
          </Button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Title level={3} style={{ margin: 0 }}>
              {isZh ? '兑换码明细' : 'Redemption Code Details'}
            </Title>
            <Text type="secondary" style={{ marginTop: 4 }}>
              {isZh ? `活动名称: ${selectedGroup}` : `Activity Name: ${selectedGroup}`}
            </Text>
          </div>
          <div style={{ flex: 1 }} />
          <Button icon={<SyncOutlined />} onClick={() => fetchDrawerCodes(selectedGroup, drawerCurrentPage, drawerPageSize)}>
            {t('common.refresh')}
          </Button>
        </div>
        
        <Table
          dataSource={drawerCodes}
          columns={drawerColumns}
          rowKey="id"
          loading={drawerLoading}
          pagination={listPagination({
            current: drawerCurrentPage,
            pageSize: drawerPageSize,
            total: drawerTotal,
            onChange: (page, size) => {
              setDrawerCurrentPage(page);
              setDrawerPageSize(size);
              fetchDrawerCodes(selectedGroup, page, size);
            },
          })}
        />
      </Card>
    );
  }

  return (
    <Card variant="borderless">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={2} style={{ margin: 0 }}>{t('redemptions.title')}</Title>
        <Space wrap>
          <Input.Search
            placeholder={isZh ? '搜索活动名称' : 'Search activity name'}
            allowClear
            value={searchKeyword}
            onChange={(e) => {
              setSearchKeyword(e.target.value);
              if (!e.target.value) {
                handleSearch('');
              }
            }}
            onSearch={handleSearch}
            style={{ width: 220 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            {t('redemptions.add')}
          </Button>
        </Space>
      </div>

      <div
        style={{
          marginBottom: 24,
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid var(--ant-color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Text strong>{isZh ? '兑换功能' : 'Redemption Feature'}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isZh
                ? '开启后，用户可在「钱包与账户」页面使用兑换码充值余额。'
                : 'When enabled, users can redeem codes on the Wallet page.'}
            </Text>
          </div>
        </div>
        <Switch
          checked={enabled}
          loading={toggleLoading}
          onChange={handleToggleRedemption}
          checkedChildren={isZh ? '开启' : 'On'}
          unCheckedChildren={isZh ? '关闭' : 'Off'}
        />
      </div>

      <Table
        dataSource={groups}
        columns={groupColumns}
        rowKey="name"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={listPagination({
          current: currentPage,
          pageSize,
          total,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
            fetchGroups(page, size, searchKeyword);
          },
        })}
      />

      <Modal
        title={t('redemptions.add')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        okText={t('common.ok')}
        cancelText={t('common.cancel')}
        width={520}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            count: 1,
            quota: 10,
            permanent: true,
            allow_multiple: false,
            max_uses: -1,
            limit_per_user_activity: false,
            per_user_activity_limit: 1,
          }}
        >
          <Form.Item name="name" label={t('redemptions.name')} rules={[{ required: true }]}>
            <Input placeholder={t('redemptions.name')} />
          </Form.Item>
          <Form.Item name="count" label={isZh ? '生成数量' : t('common.count')} rules={[{ required: true }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quota" label={`${t('redemptions.quota')} (${currencySymbol})`} rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="permanent" label={isZh ? '有效期' : 'Validity'} rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value={true}>{isZh ? '长期有效' : 'Permanent'}</Radio>
              <Radio value={false}>{isZh ? '设置到期日' : 'Set expiry date'}</Radio>
            </Radio.Group>
          </Form.Item>
          {!permanent && (
            <Form.Item
              name="expires_at"
              label={isZh ? '到期日期' : 'Expires on'}
              rules={[{ required: true, message: isZh ? '请选择到期日期' : 'Please select expiry date' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => !!current && current < dayjs().startOf('day')}
              />
            </Form.Item>
          )}

          <Form.Item
            name="allow_multiple"
            label={isZh ? '兑换码支持多次兑换' : 'Allow multiple redemptions'}
            valuePropName="checked"
            extra={isZh ? '关闭时每个兑换码仅可兑换 1 次；与下方「单用户活动参与次数」相互独立' : 'When off, each code can only be redeemed once; independent of per-user activity limit'}
          >
            <Switch />
          </Form.Item>

          {allowMultiple && (
            <Form.Item
              name="max_uses"
              label={isZh ? '单兑换码兑换次数' : 'Uses per code'}
              rules={[{ required: true }]}
              extra={isZh ? '-1 表示不限制；对每个生成的兑换码分别生效' : '-1 = unlimited; applies to each generated code'}
            >
              <InputNumber min={-1} max={100000} style={{ width: '100%' }} />
            </Form.Item>
          )}

          <Form.Item
            name="limit_per_user_activity"
            label={isZh ? '限制单用户参与本活动次数' : 'Limit per-user activity redemptions'}
            valuePropName="checked"
            extra={isZh ? '默认不限制；开启后同一用户在本活动下最多兑换 N 次（跨多个兑换码累计）' : 'Off = unlimited; when on, each user may redeem at most N times in this activity'}
          >
            <Switch />
          </Form.Item>

          {limitPerUserActivity && (
            <Form.Item
              name="per_user_activity_limit"
              label={isZh ? '单用户可参与次数' : 'Max redemptions per user'}
              rules={[
                { required: true, message: isZh ? '请填写参与次数' : 'Please enter a limit' },
                {
                  type: 'number',
                  min: 1,
                  message: isZh ? '至少为 1 次' : 'Must be at least 1',
                },
              ]}
              extra={isZh ? '同一用户兑换本活动任意兑换码均计入次数' : 'Counts across all codes under this activity name'}
            >
              <InputNumber min={1} max={10000} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default Redemptions;
