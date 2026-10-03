/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag, Select, Grid, List } from 'antd';
import { listPagination, useListPager } from '../../components/ListPagination';
import { SyncOutlined, SearchOutlined, AccountBookOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { formatApiDateTime } from '../../utils/timedisplay';
import { defaultMonthRange, toTimeRangeParams } from '../../utils/dateRangeParams';
import LogDateTimeRangePicker from '../../components/LogDateTimeRangePicker';
import { cleanRemark, extractOrderNo } from '../../utils/rechargeType';
import type { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

interface CommissionRecord {
  id: string;
  username: string;
  uid: string;
  from_username?: string | null;
  from_uid?: string | null;
  amount: number;
  ratio?: number | null;
  source: string;
  wallet: string;
  order_no?: string | null;
  remark?: string | null;
  operator?: string | null;
  created_at: string;
}

const SOURCE_OPTIONS = [
  { value: 'consumption', label: '消费返佣', color: 'blue' },
  { value: 'recharge', label: '充值返佣', color: 'green' },
  { value: 'system_award', label: '系统赠送', color: 'gold' },
  { value: 'invite_gift', label: '邀请赠送', color: 'magenta' },
  { value: 'transfer', label: '佣金结转', color: 'cyan' },
  { value: 'video', label: '视频返佣', color: 'purple' },
  { value: 'refund', label: '退款回冲', color: 'red' },
  { value: 'clawback', label: '佣金扣回', color: 'orange' },
  { value: 'system_clawback', label: '系统钱包扣回', color: 'volcano' },
  { value: 'other', label: '其他', color: 'default' },
] as const;

const WALLET_LABEL: Record<string, string> = {
  commission: '佣金钱包',
  gift: '赠送钱包',
  system: '系统钱包',
};

function sourceMeta(source: string) {
  return SOURCE_OPTIONS.find((item) => item.value === source) || { value: source, label: source, color: 'default' };
}

function formatRatio(ratio?: number | null) {
  if (ratio == null || Number.isNaN(ratio)) return '-';
  return `${parseFloat((ratio * 100).toFixed(2))}%`;
}

const CommissionRecords: React.FC = () => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [data, setData] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const { page, pageSize, onChange } = useListPager();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string | undefined>();
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(() => defaultMonthRange());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/commissions', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
          source: source || undefined,
          ...toTimeRangeParams(dateRange),
        }
      }) as unknown as Promise<{ data: CommissionRecord[]; total: number; total_amount: number }>);
      setData(resp.data);
      setTotal(resp.total);
      setTotalAmount(resp.total_amount || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, source, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const amountText = (val: number) => (
    <Text strong style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
      {val >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(val).toFixed(6)}
    </Text>
  );

  const columns = [
    {
      title: t('finance.order_no', { defaultValue: '订单号' }),
      key: 'order_no',
      width: 220,
      render: (_: unknown, record: CommissionRecord) => {
        const orderNo = extractOrderNo(record);
        if (orderNo) {
          return (
            <Text
              copyable
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                letterSpacing: '-0.2px',
              }}
            >
              {orderNo}
            </Text>
          );
        }
        return <Text type="secondary" style={{ fontSize: 11 }}>-</Text>;
      },
    },
    {
      title: t('finance.user_info'),
      key: 'user',
      render: (record: CommissionRecord) => (
        <Space vertical size={0}>
          <Text strong>{record.username || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.uid ? `UID: ${record.uid}` : '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: '来源类型',
      dataIndex: 'source',
      key: 'source',
      width: 140,
      render: (value: string) => {
        const meta = sourceMeta(value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: t('finance.amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => amountText(val),
    },
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => formatApiDateTime(text),
    },
    {
      title: '来源用户',
      key: 'from_user',
      render: (record: CommissionRecord) => {
        if (!record.from_uid && !record.from_username) return '-';
        return (
          <Space vertical size={0}>
            <Text strong>{record.from_username || '-'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.from_uid ? `UID: ${record.from_uid}` : '-'}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('finance.remark', { defaultValue: '备注' }),
      dataIndex: 'remark',
      key: 'remark',
      render: (_: unknown, record: CommissionRecord) => {
        const cleaned = cleanRemark(record.remark, record.order_no);
        return <Text style={{ fontSize: 12 }}>{cleaned || '-'}</Text>;
      },
    },
    {
      title: t('finance.operator'),
      dataIndex: 'operator',
      key: 'operator',
      render: (text: string) => text || '-',
    },
    {
      title: '比例',
      dataIndex: 'ratio',
      key: 'ratio',
      width: 90,
      render: (value: number | null) => formatRatio(value),
    },
    {
      title: '入账钱包',
      dataIndex: 'wallet',
      key: 'wallet',
      width: 110,
      render: (value: string) => WALLET_LABEL[value] || value || '-',
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12, alignItems: screens.xs ? 'flex-start' : 'center', gap: 16 }}>
        <Space size="small" align="center" wrap>
          <AccountBookOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={2} style={{ margin: 0, fontSize: screens.xs ? 20 : 24 }}>{t('menu.finance_commissions', '佣金明细')}</Title>
          <Text type="secondary" style={{ marginLeft: screens.xs ? 0 : 8 }}>
            当前合计: <Text strong style={{ color: totalAmount >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 16 }}>{totalAmount >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(totalAmount).toFixed(6)}</Text>
          </Text>
        </Space>
        <Space wrap style={{ width: screens.xs ? '100%' : 'auto' }}>
          <LogDateTimeRangePicker
            value={dateRange}
            onChange={setDateRange}
            isAdmin
            className="font-size-12"
          />
          <Select
            allowClear
            placeholder="来源类型"
            value={source}
            onChange={(value) => setSource(value || undefined)}
            style={{ width: 160 }}
            options={SOURCE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />
          <Input
            placeholder="搜索 用户名 / UID / 订单号"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 220 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchData}>{t('common.refresh')}</Button>
        </Space>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        含佣金钱包流水。系统赠送是管理端给系统钱包加款后联动写入佣金钱包的记录；邀请赠送是注册邀请奖励，入账赠送钱包。
      </Text>

      {screens.xs ? (
        <List
          dataSource={data}
          loading={loading}
          pagination={listPagination({
            total,
            current: page,
            pageSize,
            onChange,
            size: 'small'
          })}
          renderItem={(record) => {
            const meta = sourceMeta(record.source);
            return (
              <List.Item style={{ padding: '0 0 8px 0', border: 'none' }}>
                <Card
                  size="small"
                  style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  title={<Text strong>{record.username || '-'}</Text>}
                  extra={<Tag color={meta.color}>{meta.label}</Tag>}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>UID</Text>
                    <Text style={{ fontSize: 12 }}>{record.uid || '-'}</Text>
                  </div>
                  {extractOrderNo(record) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('finance.order_no', { defaultValue: '订单号' })}</Text>
                      <Text
                        copyable
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          whiteSpace: 'nowrap',
                          fontSize: 11,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          letterSpacing: '-0.2px',
                        }}
                      >
                        {extractOrderNo(record)}
                      </Text>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>金额</Text>
                    {amountText(record.amount)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>时间</Text>
                    <Text style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at)}</Text>
                  </div>
                  {(record.from_uid || record.from_username) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>来源用户</Text>
                      <Space vertical size={0} align="end">
                        <Text strong style={{ fontSize: 12 }}>{record.from_username || '-'}</Text>
                        <Text type="secondary" style={{ fontSize: 10 }}>{record.from_uid ? `UID: ${record.from_uid}` : ''}</Text>
                      </Space>
                    </div>
                  )}
                  {cleanRemark(record.remark, record.order_no) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('finance.remark', { defaultValue: '备注' })}</Text>
                      <Text style={{ fontSize: 12, wordBreak: 'break-all', maxWidth: '60%', textAlign: 'right' }}>
                        {cleanRemark(record.remark, record.order_no)}
                      </Text>
                    </div>
                  )}
                  {record.operator && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>操作人</Text>
                      <Text style={{ fontSize: 12 }}>{record.operator}</Text>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>比例</Text>
                    <Text style={{ fontSize: 12 }}>{formatRatio(record.ratio)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>入账钱包</Text>
                    <Text style={{ fontSize: 12 }}>{WALLET_LABEL[record.wallet] || record.wallet || '-'}</Text>
                  </div>
                </Card>
              </List.Item>
            );
          }}
        />
      ) : (
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          className="compact-table"
          loading={loading}
          pagination={listPagination({
            total,
            current: page,
            pageSize,
            onChange,
          })}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}
    </Card>
  );
};

export default CommissionRecords;
