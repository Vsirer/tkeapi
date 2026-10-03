/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Typography, Space, Input, Button, Tag, Grid, List } from 'antd';
import { listPagination, useListPager } from '../../components/ListPagination';
import { SyncOutlined, SearchOutlined, GiftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { formatApiDateTime } from '../../utils/timedisplay';
import { defaultMonthRange, toTimeRangeParams } from '../../utils/dateRangeParams';
import LogDateTimeRangePicker from '../../components/LogDateTimeRangePicker';
import { rechargeTypeLabel, extractOrderNo, cleanRemark } from '../../utils/rechargeType';
import type { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

interface GiftRecord {
  id: number;
  user_id: string;
  username: string;
  uid: string;
  amount: number;
  recharge_type: string;
  order_no?: string | null;
  remark: string | null;
  operator: string | null;
  created_at: string;
  referrer_uid?: string;
  referrer_username?: string;
}

const GiftRecords: React.FC = () => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [data, setData] = useState<GiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const { page, pageSize, onChange } = useListPager();
  const [search, setSearch] = useState('');
  const [referrerSearch, setReferrerSearch] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(() => defaultMonthRange());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/finance/recharges', {
        params: {
          page,
          per_page: pageSize,
          user_id: search || undefined,
          referrer: referrerSearch || undefined,
          wallet_type: 'gift',
          ...toTimeRangeParams(dateRange),
        }
      }) as unknown as Promise<{ data: GiftRecord[]; total: number; total_amount: number }>);
      setData(resp.data);
      setTotal(resp.total);
      setTotalAmount(resp.total_amount || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, referrerSearch, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = [
    {
      title: t('finance.order_no', { defaultValue: '订单号' }),
      key: 'order_no',
      width: 220,
      render: (_: unknown, record: GiftRecord) => {
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
      render: (record: GiftRecord) => (
        <Space vertical size={0}>
          <Text strong>{record.username || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.uid ? `UID: ${record.uid}` : '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: t('finance.recharge_type', { defaultValue: '类型' }),
      dataIndex: 'recharge_type',
      key: 'recharge_type',
      render: (type: string) => (
        <Tag color="gold">🎁 {rechargeTypeLabel(type)}</Tag>
      ),
    },
    {
      title: t('finance.amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => (
        <Text strong style={{ color: val >= 0 ? '#faad14' : '#ff4d4f' }}>
          {val >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(val).toFixed(6)}
        </Text>
      ),
    },
    {
      title: t('logs.time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => formatApiDateTime(text),
    },
    {
      title: '用户推荐人',
      key: 'referrer',
      render: (record: GiftRecord) => {
        if (!record.referrer_uid) return '-';
        return (
          <Space vertical size={0}>
            <Text strong>{record.referrer_username || '-'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              UID: {record.referrer_uid}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('finance.remark', { defaultValue: '备注' }),
      dataIndex: 'remark',
      key: 'remark',
      render: (_: unknown, record: GiftRecord) => {
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
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12, alignItems: screens.xs ? 'flex-start' : 'center', gap: 16 }}>
        <Space size="small" align="center" wrap>
          <GiftOutlined style={{ fontSize: 24, color: '#faad14' }} />
          <Title level={2} style={{ margin: 0, fontSize: screens.xs ? 20 : 24 }}>{t('finance.gift_records_title')}</Title>
          <Text type="secondary" style={{ marginLeft: screens.xs ? 0 : 8 }}>
            赠送金合计: <Text strong style={{ color: '#faad14', fontSize: 16 }}>{currencySymbol}{totalAmount.toFixed(6)}</Text>
          </Text>
        </Space>
        <Space wrap style={{ width: screens.xs ? '100%' : 'auto' }}>
          <LogDateTimeRangePicker
            value={dateRange}
            onChange={setDateRange}
            isAdmin
            className="font-size-12"
          />
          <Input
            placeholder="搜索 用户名 / UID / 订单号"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 200 }}
          />
          <Input
            placeholder="搜索推荐人 用户名/UID"
            prefix={<SearchOutlined />}
            value={referrerSearch}
            onChange={e => setReferrerSearch(e.target.value)}
            onPressEnter={fetchData}
            style={{ width: 180 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchData}>{t('common.refresh')}</Button>
        </Space>
      </div>

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
          renderItem={(record) => (
            <List.Item style={{ padding: '0 0 8px 0', border: 'none' }}>
              <Card
                size="small"
                style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                title={<Text strong>{record.username || '-'}</Text>}
                extra={<Tag color="gold">🎁 {rechargeTypeLabel(record.recharge_type)}</Tag>}
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
                  <Text strong style={{ color: record.amount >= 0 ? '#faad14' : '#ff4d4f' }}>
                    {record.amount >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(record.amount).toFixed(6)}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>时间</Text>
                  <Text style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at)}</Text>
                </div>
                {record.referrer_uid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>用户推荐人</Text>
                  <Space vertical size={0} align="end">
                    <Text strong style={{ fontSize: 12 }}>{record.referrer_username || '-'}</Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>UID: {record.referrer_uid}</Text>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>操作人</Text>
                  <Text style={{ fontSize: 12 }}>{record.operator}</Text>
                </div>
                )}
              </Card>
            </List.Item>
          )}
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

export default GiftRecords;
