/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, message, Card, Typography, Grid, Tag, Popconfirm, Input } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { fetchActivePlugins } from '../../utils/activePlugins';
import { formatApiDateTime } from '../../utils/timedisplay';
import useSettingsStore from '../../store/settings';
import { useTranslation } from 'react-i18next';
import type { AdminGroup } from '../../types';
import {
  ADMIN_MENU_PERMISSIONS,
  expandLegacyAdminMenuPermissions,
  flattenAdminMenuPermissions,
  getAdminMenuPermissionLabel,
  parseAdminGroupPermissions,
} from '../../constants/adminMenuPermissions';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const ALL_BASIC_PERMISSION_VALUES = flattenAdminMenuPermissions();

const AdminGroups: React.FC = () => {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await (request.get('/admin_groups') as any);
      setGroups(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadActivePlugins = async () => {
    try {
      const response = await fetchActivePlugins();
      if (response.active_plugins) {
        setActivePlugins(response.active_plugins);
      }
    } catch (error) {
      console.error('获取插件失败', error);
    }
  };

  useEffect(() => {
    fetchGroups();
    loadActivePlugins();
  }, []);

  const filteredGroups = useMemo(() => {
    if (!searchKeyword.trim()) return groups;
    const kw = searchKeyword.trim().toLowerCase();
    return groups.filter((g) => {
      const matchName = g.name?.toLowerCase().includes(kw);
      const matchId = g.id?.toString().includes(kw);
      const matchPadId = `id: ${g.id.toString().padStart(4, '0')}`.toLowerCase().includes(kw) ||
                         g.id.toString().padStart(4, '0').includes(kw);
      const matchDesc = g.description?.toLowerCase().includes(kw);
      return matchName || matchId || matchPadId || matchDesc;
    });
  }, [groups, searchKeyword]);

  const handleCreate = () => {
    navigate(`/${adminPath}/admin-groups/new`);
  };

  const handleEdit = (group: AdminGroup) => {
    navigate(`/${adminPath}/admin-groups/${group.id}`);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/admin_groups/${id}`);
      message.success('删除成功');
      fetchGroups();
    } catch (error) {
      console.error(error);
    }
  };

  const renderPermissionsTags = (permissionsStr?: string) => {
    const policy = parseAdminGroupPermissions(permissionsStr);
    const perms = policy.view;
    const basicPerms = perms.filter((p) => !p.startsWith('plugin:'));
    const expandedBasic = expandLegacyAdminMenuPermissions(basicPerms);
    const hasAllBasic = ALL_BASIC_PERMISSION_VALUES.every((item) => expandedBasic.includes(item));
    const hasAllPlugins =
      activePlugins.length === 0 ||
      activePlugins.every((plugin) => perms.includes(`plugin:${plugin.name}`));

    const hasFullEdit = perms.length > 0 && perms.every((p) => policy.edit.includes(p));
    if (hasAllBasic && hasAllPlugins) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <Tag color="success" style={{ fontSize: '11px', margin: 0, padding: '0 4px', fontWeight: 'bold' }}>
            {t('admin_perm.all_features')}
          </Tag>
          {!hasFullEdit && (
            <Tag style={{ fontSize: '11px', margin: 0, padding: '0 4px' }}>
              {t('admin_perm.partial_readonly')}
            </Tag>
          )}
        </div>
      );
    }

    const displayKeys: string[] = [];
    for (const group of ADMIN_MENU_PERMISSIONS) {
      if (!group.children?.length) {
        if (expandedBasic.includes(group.value)) displayKeys.push(group.value);
        continue;
      }
      const selectedChildren = group.children.filter((c) => expandedBasic.includes(c.value));
      if (selectedChildren.length === 0) continue;
      if (selectedChildren.length === group.children.length) {
        displayKeys.push(group.value);
      } else {
        selectedChildren.forEach((c) => displayKeys.push(c.value));
      }
    }
    perms.filter((p) => p.startsWith('plugin:')).forEach((p) => displayKeys.push(p));

    const permLabels = displayKeys.map((p) => {
      if (p.startsWith('plugin:')) {
        const pName = p.substring(7);
        const foundPlugin = activePlugins.find((ap) => ap.name === pName);
        return `${t('admin_perm.plugin_prefix')}${foundPlugin ? t(`plugin_titles.${pName}`, foundPlugin.title || pName) : pName}`;
      }
      return getAdminMenuPermissionLabel(p, t);
    });

    if (permLabels.length === 0) {
      return <Text type="secondary" style={{ fontSize: '11px' }}>{t('admin_perm.none')}</Text>;
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {permLabels.map((label) => (
          <Tag color="blue" style={{ fontSize: '11px', margin: 0, padding: '0 4px' }} key={label}>
            {label}
          </Tag>
        ))}
        {!hasFullEdit && perms.length > 0 && (
          <Tag style={{ fontSize: '11px', margin: 0, padding: '0 4px' }}>
            {t('admin_perm.partial_readonly')}
          </Tag>
        )}
      </div>
    );
  };

  const columns = [
    { 
      title: '名称', 
      dataIndex: 'name', 
      key: 'name', 
      width: 180, 
      sorter: (a: AdminGroup, b: AdminGroup) => a.name.localeCompare(b.name, 'zh'),
      render: (text: string, record: AdminGroup) => (
        <Space align="center" size={6}>
          <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 13 }}>{text}</Text>
          <Tag bordered={false} style={{ margin: 0, background: 'rgba(22,119,255,0.1)', color: '#1677ff', borderRadius: 4, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>
            ID: {record.id.toString().padStart(4, '0')}
          </Tag>
        </Space>
      ),
    },
    { title: '用户数', dataIndex: 'user_count', key: 'user_count', width: 80, sorter: (a: AdminGroup, b: AdminGroup) => (a.user_count || 0) - (b.user_count || 0), render: (val: number) => <Tag color="blue">{val || 0}</Tag> },
    { 
      title: '权限详细', 
      key: 'permissions_detail', 
      width: 500,
      render: (_: any, record: AdminGroup) => renderPermissionsTags(record.permissions)
    },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 80, sorter: (a: AdminGroup, b: AdminGroup) => (a.sort_order || 0) - (b.sort_order || 0) },
    { 
      title: '创建时间', 
      dataIndex: 'created_at', 
      key: 'created_at', 
      sorter: (a: AdminGroup, b: AdminGroup) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      },
      render: (text: string) => formatApiDateTime(text) 
    },
    { 
      title: '操作', 
      key: 'action', 
      width: 160,
      render: (_: any, record: AdminGroup) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确认删除该管理员等级？" onConfirm={() => handleDelete(record.id)}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>管理员等级</Title>
        <Space wrap>
          <Input.Search
            placeholder="搜索等级名称 / 等级 ID"
            allowClear
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={(val) => setSearchKeyword(val)}
            style={{ width: screens.xs ? '100%' : 220 }}
          />
          <Button icon={<SyncOutlined />} onClick={fetchGroups}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            添加管理员等级
          </Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={filteredGroups}
          loading={loading}
          rowKey="id"
          pagination={false}
          renderCard={(record: any) => (
            <MobileCard
              title={
                <Space align="center" size={8} wrap>
                  <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
                  <Text strong>{record.name}</Text>
                  <Tag bordered={false} style={{ margin: 0, background: 'rgba(22,119,255,0.1)', color: '#1677ff', borderRadius: 4 }}>
                    ID: {record.id.toString().padStart(4, '0')}
                  </Tag>
                </Space>
              }
              extra={null}
            >
              <CardRow label="权限详细">{renderPermissionsTags(record.permissions)}</CardRow>
              <CardRow label="用户数"><Tag color="blue">{record.user_count || 0}</Tag></CardRow>
              {record.description && <CardRow label="描述"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
              <CardRow label="排序"><Text type="secondary" style={{ fontSize: 12 }}>{record.sort_order || 0}</Text></CardRow>
              <CardRow label="创建时间"><Text type="secondary" style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at)}</Text></CardRow>
              <CardActions>
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Popconfirm title="确认删除该管理员等级？" onConfirm={() => handleDelete(record.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </CardActions>
            </MobileCard>
          )}
        />
      ) : (
        <Table 
          columns={columns} 
          dataSource={filteredGroups} 
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

export default AdminGroups;
