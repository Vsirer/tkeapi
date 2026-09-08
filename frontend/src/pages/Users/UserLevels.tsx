/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Table, Button, Space, Tag, Input, message, Popconfirm, Card, Typography, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import { formatApiDateTime } from '../../utils/timedisplay';
import type { UserLevel } from '../../types';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;



const UserLevels: React.FC = () => {
  const { t } = useTranslation();
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/user_levels') as unknown as Promise<{ data: UserLevel[] }>);
      setLevels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const filteredLevels = useMemo(() => {
    if (!searchKeyword.trim()) return levels;
    const kw = searchKeyword.trim().toLowerCase();
    return levels.filter((lvl) => {
      const matchName = lvl.name?.toLowerCase().includes(kw);
      const matchId = lvl.id?.toString().includes(kw);
      const matchUlid = `ulid: ${lvl.id.toString().padStart(4, '0')}`.toLowerCase().includes(kw) ||
                        lvl.id.toString().padStart(4, '0').includes(kw);
      const matchKey = lvl.group_key?.toLowerCase().includes(kw);
      const matchDesc = lvl.description?.toLowerCase().includes(kw);
      return matchName || matchId || matchUlid || matchKey || matchDesc;
    });
  }, [levels, searchKeyword]);

  const handleAdd = () => {
    navigate(`/${adminPath}/user-levels/new`);
  };

  const handleEdit = (record: UserLevel) => {
    navigate(`/${adminPath}/user-levels/${record.id}`);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/user_levels/${id}`);
      message.success(t('user_levels.success'));
      fetchLevels();
    } catch (e: any) {
      console.error(e);
    }
  };



  const columns = [
    {
      title: t('user_levels.name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a: UserLevel, b: UserLevel) => a.name.localeCompare(b.name, 'zh'),
      render: (text: string, record: UserLevel) => (
        <div>
          <Space align="center" size={6}>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <Text strong style={{ fontSize: 13 }}>{text}</Text>
            <Tag bordered={false} style={{ margin: 0, background: 'rgba(22,119,255,0.1)', color: '#1677ff', borderRadius: 4, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>
              ULID: {record.id.toString().padStart(4, '0')}
            </Tag>
            {record.is_default === 1 && <Tag color="green" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>默认注册</Tag>}
          </Space>
          <div style={{ marginTop: 1, lineHeight: 1.3 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>标志: {record.group_key}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '用户数',
      dataIndex: 'user_count',
      key: 'user_count',
      sorter: (a: UserLevel, b: UserLevel) => (a.user_count || 0) - (b.user_count || 0),
      render: (val: number) => (
        <Tag color="blue">{val || 0}</Tag>
      ),
    },
    {
      title: t('user_levels.discount'),
      dataIndex: 'discount',
      key: 'discount',
      sorter: (a: UserLevel, b: UserLevel) => (a.discount || 0) - (b.discount || 0),
      render: (val: number, record: UserLevel) => {
        const off = Math.round((1 - val) * 100);
        const up = Math.round((val - 1) * 100);
        const dt = record.discount_type ?? 0;
        return (
          <Space wrap>
            <Text>{val.toFixed(2)}x</Text>
            {dt === 2 && <Tag color="blue">用户等级折扣</Tag>}
            {dt === 1 && <Tag color="cyan">全站折扣</Tag>}
            {dt === 0 && <Tag color="default">系统融合</Tag>}
            {off > 0 && <Tag color="green">-{off}% (优惠)</Tag>}
            {up > 0 && <Tag color="volcano">+{up}% (涨价)</Tag>}
          </Space>
        );
      },
    },
    {
      title: '返利比例',
      dataIndex: 'commission_ratio',
      key: 'commission_ratio',
      sorter: (a: UserLevel, b: UserLevel) => (a.commission_ratio || 0) - (b.commission_ratio || 0),
      render: (val: number) => {
        const percent = Math.round((val || 0) * 100);
        return <Tag color="green">{percent}%</Tag>;
      },
    },
    {
      title: '等级营销推广',
      dataIndex: 'marketing_enabled',
      key: 'marketing_enabled',
      sorter: (a: UserLevel, b: UserLevel) => (a.marketing_enabled || 0) - (b.marketing_enabled || 0),
      render: (val: number) => (
        val === 1 ? <Tag color="blue">已开启</Tag> : <Tag color="default">已关闭</Tag>
      ),
    },
    {
      title: '详细日志',
      dataIndex: 'allow_view_log_details',
      key: 'allow_view_log_details',
      sorter: (a: UserLevel, b: UserLevel) => (a.allow_view_log_details || 0) - (b.allow_view_log_details || 0),
      render: (val: number) => (
        val === 0 ? <Tag color="default">已关闭</Tag> : <Tag color="blue">已开启</Tag>
      ),
    },
    {
      title: '发票&收据',
      dataIndex: 'invoice_enabled',
      key: 'invoice_enabled',
      sorter: (a: UserLevel, b: UserLevel) => (a.invoice_enabled || 0) - (b.invoice_enabled || 0),
      render: (val: number, record: UserLevel) => (
        val === 1 ? (
          <Space size={4}>
            <Tag color="cyan">已开启</Tag>
            <Tag color={record.invoice_mode === 'china' ? 'orange' : 'purple'}>
              {record.invoice_mode === 'china' ? '境内模式' : '国际模式'}
            </Tag>
          </Space>
        ) : <Tag color="default">已关闭</Tag>
      ),
    },
    {
      title: t('user_levels.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      sorter: (a: UserLevel, b: UserLevel) => (a.sort_order || 0) - (b.sort_order || 0),
    },
    {
      title: t('user_levels.created_at'),
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a: UserLevel, b: UserLevel) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      },
      render: (text: string) => formatApiDateTime(text, 'YYYY-MM-DD'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: UserLevel) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm 
            title={t('user_levels.delete_confirm')} 
            onConfirm={() => handleDelete(record.id)}
            disabled={record.group_key === 'default'}
          >
            <Button size="small" icon={<DeleteOutlined />} danger disabled={record.group_key === 'default'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('user_levels.title')}</Title>
        <Space wrap>
          <Input.Search
            placeholder="搜索等级名称 / 等级 ID"
            allowClear
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={(val) => setSearchKeyword(val)}
            style={{ width: screens.xs ? '100%' : 220 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchLevels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('user_levels.add_level')}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={filteredLevels}
          loading={loading}
          rowKey="id"
          pagination={false}
          renderCard={(record: any) => {
            const off = Math.round((1 - record.discount) * 100);
            const up = Math.round((record.discount - 1) * 100);
            const commPercent = Math.round((record.commission_ratio || 0) * 100);
            return (
              <MobileCard
                title={
                  <div>
                    <Space align="center" size={8} wrap>
                      <TrophyOutlined style={{ color: '#faad14' }} />
                      <Text strong>{record.name}</Text>
                      <Tag bordered={false} style={{ margin: 0, background: 'rgba(22,119,255,0.1)', color: '#1677ff', borderRadius: 4 }}>
                        ULID: {record.id.toString().padStart(4, '0')}
                      </Tag>
                      {record.is_default === 1 && <Tag color="green">默认注册</Tag>}
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>标志: {record.group_key}</Text>
                    </div>
                  </div>
                }
                extra={null}
              >
                <CardRow label="用户数">
                  <Tag color="blue">{record.user_count || 0}</Tag>
                </CardRow>
                <CardRow label="用户等级折扣倍率">
                  <Space wrap>
                    <Text>{record.discount.toFixed(2)}x</Text>
                    {record.discount_type === 2 && <Tag color="blue">用户等级折扣</Tag>}
                    {record.discount_type === 1 && <Tag color="cyan">全站折扣</Tag>}
                    {record.discount_type === 0 && <Tag color="default">系统融合</Tag>}
                    {off > 0 && <Tag color="green">-{off}%</Tag>}
                    {up > 0 && <Tag color="volcano">+{up}%</Tag>}
                  </Space>
                </CardRow>
                <CardRow label="返利比例"><Tag color="green">{commPercent}%</Tag></CardRow>
                <CardRow label="等级营销推广">
                  {record.marketing_enabled === 1 ? <Tag color="blue">已开启</Tag> : <Tag color="default">已关闭</Tag>}
                </CardRow>
                <CardRow label="详细日志">
                  {record.allow_view_log_details === 0 ? <Tag color="default">已关闭</Tag> : <Tag color="blue">已开启</Tag>}
                </CardRow>
                {record.description && <CardRow label="说明"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
                <CardRow label="排序"><Text type="secondary" style={{ fontSize: 12 }}>{record.sort_order || 0}</Text></CardRow>
                <CardRow label="创建时间"><Text type="secondary" style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at, 'YYYY-MM-DD')}</Text></CardRow>
                <CardActions>
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                  <Popconfirm title={t('user_levels.delete_confirm')} onConfirm={() => handleDelete(record.id)} disabled={record.group_key === 'default'}>
                    <Button size="small" icon={<DeleteOutlined />} danger disabled={record.group_key === 'default'} />
                  </Popconfirm>
                </CardActions>
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          dataSource={filteredLevels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
          showSorterTooltip={false}
        />
      )}


    </Card>
  );
};

export default UserLevels;
