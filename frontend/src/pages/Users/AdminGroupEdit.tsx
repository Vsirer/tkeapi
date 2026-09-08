/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
  DashboardOutlined,
  BookOutlined,
  KeyOutlined,
  HistoryOutlined,
  ControlOutlined,
  AppstoreOutlined,
  GiftOutlined,
  TeamOutlined,
  AccountBookOutlined,
  SettingOutlined,
  AppstoreAddOutlined,
  CheckOutlined,
  EyeOutlined,
  EditOutlined,
  ClearOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import request from '../../utils/request';
import { fetchActivePlugins } from '../../utils/activePlugins';
import { useNavigate, useParams } from 'react-router-dom';
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';
import { useTranslation } from 'react-i18next';
import { solidAccent } from '../../theme/tokens';
import type { AdminGroup } from '../../types';
import {
  ADMIN_MENU_PERMISSIONS,
  expandLegacyAdminMenuPermissions,
  flattenAdminMenuPermissions,
  normalizeAdminEditPermissions,
  normalizeAdminMenuPermissions,
  parseAdminGroupPermissions,
  type AdminMenuPermChild,
  type AdminMenuPermNode,
} from '../../constants/adminMenuPermissions';

const { Text, Title } = Typography;

const ALL_BASIC_PERMISSION_VALUES = flattenAdminMenuPermissions();

const MENU_ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <DashboardOutlined />,
  relay_api: <BookOutlined />,
  tokens: <KeyOutlined />,
  logs: <HistoryOutlined />,
  channels: <ControlOutlined />,
  models: <AppstoreOutlined />,
  marketing: <GiftOutlined />,
  users: <TeamOutlined />,
  finance: <AccountBookOutlined />,
  settings: <SettingOutlined />,
};

const AdminGroupEdit: React.FC = () => {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const { themeMode } = useThemeStore();
  const solid = solidAccent(themeMode);
  const isDark = themeMode === 'dark';
  const muted = isDark ? '#a1a1aa' : '#71717a';

  const { actionId } = useParams<{ actionId: string }>();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const isAdd = actionId === 'new';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);

  const permissionsWatch: string[] = Form.useWatch('permissions', form) || [];
  const editPermissionsWatch: string[] = Form.useWatch('edit_permissions', form) || [];
  const pluginPermissionsWatch: string[] = Form.useWatch('plugin_permissions', form) || [];

  // 加载数据
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const pluginsResp = await fetchActivePlugins();
        if (pluginsResp.active_plugins) {
          setActivePlugins(pluginsResp.active_plugins);
        }

        if (isAdd) {
          form.setFieldsValue({
            name: '',
            description: '',
            sort_order: 0,
            permissions: [],
            edit_permissions: [],
            plugin_permissions: [],
          });
          return;
        }

        const groupsResp = await (request.get('/admin_groups') as any);
        const group: AdminGroup | undefined = (groupsResp.data || []).find(
          (g: AdminGroup) => String(g.id) === actionId,
        );
        if (!group) {
          message.error('未找到对应管理员等级');
          navigate(`/${adminPath}/admin-groups`);
          return;
        }

        const policy = parseAdminGroupPermissions(group.permissions);
        const basicView = expandLegacyAdminMenuPermissions(
          policy.view.filter((p) => !p.startsWith('plugin:')),
        );
        const pluginPerms = policy.view.filter((p) => p.startsWith('plugin:'));
        const basicEdit = expandLegacyAdminMenuPermissions(
          policy.edit.filter((p) => !p.startsWith('plugin:')),
        );
        const pluginEdit = policy.edit.filter((p) => p.startsWith('plugin:'));
        form.setFieldsValue({
          name: group.name,
          description: group.description,
          sort_order: group.sort_order || 0,
          permissions: basicView,
          edit_permissions: [...basicEdit, ...pluginEdit],
          plugin_permissions: pluginPerms,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [actionId, adminPath, form, isAdd, navigate]);

  // 权限同步辅助
  const commitViewEdit = (view: string[], edit: string[]) => {
    form.setFieldsValue({
      permissions: view,
      edit_permissions: normalizeAdminEditPermissions(
        [...view, ...pluginPermissionsWatch],
        edit,
      ),
    });
  };

  const toggleEditKey = (key: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...editPermissionsWatch, key]))
      : editPermissionsWatch.filter((p) => p !== key);
    commitViewEdit(permissionsWatch, next);
  };

  const toggleParent = (
    parentValue: string,
    children: { value: string }[] | undefined,
    checked: boolean,
  ) => {
    const childValues = children?.map((c) => c.value) || [];
    const related = [parentValue, ...childValues];
    if (checked) {
      commitViewEdit(
        Array.from(new Set([...permissionsWatch, ...related])),
        Array.from(new Set([...editPermissionsWatch, ...related])),
      );
    } else {
      commitViewEdit(
        permissionsWatch.filter((p) => !related.includes(p)),
        editPermissionsWatch.filter((p) => !related.includes(p)),
      );
    }
  };

  const toggleChild = (
    parentValue: string,
    childValue: string,
    allChildren: string[],
    checked: boolean,
  ) => {
    let next = checked
      ? Array.from(new Set([...permissionsWatch, childValue, parentValue]))
      : permissionsWatch.filter((p) => p !== childValue);

    const remainingChildren = allChildren.filter((c) => next.includes(c));
    if (remainingChildren.length === 0) {
      next = next.filter((p) => p !== parentValue);
    } else if (!next.includes(parentValue)) {
      next = [...next, parentValue];
    }
    const nextEdit = checked
      ? Array.from(new Set([...editPermissionsWatch, childValue, parentValue]))
      : editPermissionsWatch.filter(
          (p) => p !== childValue && (remainingChildren.length > 0 || p !== parentValue),
        );
    commitViewEdit(next, nextEdit);
  };

  const toggleGroupEdit = (group: AdminMenuPermNode, checked: boolean) => {
    const keys = group.children?.length
      ? [group.value, ...group.children.map((c) => c.value)].filter((k) =>
          permissionsWatch.includes(k),
        )
      : permissionsWatch.includes(group.value)
        ? [group.value]
        : [];
    if (keys.length === 0) return;
    const next = checked
      ? Array.from(new Set([...editPermissionsWatch, ...keys]))
      : editPermissionsWatch.filter((p) => !keys.includes(p));
    commitViewEdit(permissionsWatch, next);
  };

  // 统计数据
  const basicSelectAllChecked = useMemo(
    () => ALL_BASIC_PERMISSION_VALUES.every((v) => permissionsWatch.includes(v)),
    [permissionsWatch],
  );

  const selectedMenuCount = useMemo(() => {
    let count = 0;
    for (const group of ADMIN_MENU_PERMISSIONS) {
      if (!group.children?.length) {
        if (permissionsWatch.includes(group.value)) count += 1;
      } else {
        count += group.children.filter((c) => permissionsWatch.includes(c.value)).length;
      }
    }
    return count;
  }, [permissionsWatch]);

  const selectedEditCount = useMemo(() => {
    let count = 0;
    for (const group of ADMIN_MENU_PERMISSIONS) {
      if (!group.children?.length) {
        if (
          permissionsWatch.includes(group.value) &&
          editPermissionsWatch.includes(group.value)
        ) {
          count += 1;
        }
      } else {
        count += group.children.filter(
          (c) =>
            permissionsWatch.includes(c.value) && editPermissionsWatch.includes(c.value),
        ).length;
      }
    }
    return count;
  }, [permissionsWatch, editPermissionsWatch]);

  const totalMenuCount = useMemo(() => {
    let count = 0;
    for (const group of ADMIN_MENU_PERMISSIONS) {
      count += group.children?.length || 1;
    }
    return count;
  }, []);

  // 基础菜单快捷操作
  const handleBasicSelectAll = () => {
    form.setFieldsValue({
      permissions: [...ALL_BASIC_PERMISSION_VALUES],
      edit_permissions: Array.from(
        new Set([
          ...editPermissionsWatch.filter((p) => p.startsWith('plugin:')),
          ...ALL_BASIC_PERMISSION_VALUES,
        ]),
      ),
    });
  };

  const handleBasicReadOnly = () => {
    form.setFieldsValue({
      permissions: [...ALL_BASIC_PERMISSION_VALUES],
      edit_permissions: editPermissionsWatch.filter((p) => p.startsWith('plugin:')),
    });
  };

  const handleBasicAllEditable = () => {
    const keep = editPermissionsWatch.filter((p) => p.startsWith('plugin:'));
    form.setFieldsValue({
      edit_permissions: Array.from(new Set([...keep, ...permissionsWatch])),
    });
  };

  const handleBasicClearAll = () => {
    form.setFieldsValue({
      permissions: [],
      edit_permissions: editPermissionsWatch.filter((p) => p.startsWith('plugin:')),
    });
  };

  // 插件快捷操作
  const pluginSelectAllChecked =
    activePlugins.length > 0 &&
    activePlugins.every((p) => pluginPermissionsWatch.includes(`plugin:${p.name}`));

  const handlePluginSelectAll = () => {
    const pluginKeys = activePlugins.map((p) => `plugin:${p.name}`);
    form.setFieldsValue({
      plugin_permissions: pluginKeys,
      edit_permissions: Array.from(new Set([...editPermissionsWatch, ...pluginKeys])),
    });
  };

  const handlePluginReadOnly = () => {
    const pluginKeys = activePlugins.map((p) => `plugin:${p.name}`);
    form.setFieldsValue({
      plugin_permissions: pluginKeys,
      edit_permissions: editPermissionsWatch.filter((p) => !p.startsWith('plugin:')),
    });
  };

  const handlePluginAllEditable = () => {
    form.setFieldsValue({
      edit_permissions: Array.from(
        new Set([...editPermissionsWatch, ...pluginPermissionsWatch]),
      ),
    });
  };

  const handlePluginClearAll = () => {
    form.setFieldsValue({
      plugin_permissions: [],
      edit_permissions: editPermissionsWatch.filter((p) => !p.startsWith('plugin:')),
    });
  };

  // 提交保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const basicPerms = normalizeAdminMenuPermissions(values.permissions || []);
      const viewPerms = [...basicPerms, ...(values.plugin_permissions || [])];
      const payload = {
        name: values.name,
        description: values.description,
        sort_order: values.sort_order ?? 0,
        permissions: viewPerms,
        edit_permissions: normalizeAdminEditPermissions(
          viewPerms,
          values.edit_permissions || [],
        ),
      };

      if (isAdd) {
        await request.post('/admin_groups', payload);
        message.success('创建成功');
      } else {
        await request.put(`/admin_groups/${actionId}`, payload);
        message.success('保存成功');
      }
      navigate(`/${adminPath}/admin-groups`);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // 徽标指示器
  const renderCountBadge = (
    selected: number,
    total: number,
    active: boolean,
    editCount?: number,
  ) => {
    const isFull = selected === total && total > 0;
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '18px',
          padding: '1px 7px',
          borderRadius: 10,
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: isFull ? solid.color : active ? token.colorPrimary : muted,
          background: isFull
            ? solid.background
            : active
              ? isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.05)'
              : isDark
                ? 'rgba(255, 255, 255, 0.04)'
                : 'rgba(0, 0, 0, 0.03)',
          border: `1px solid ${
            isFull
              ? 'transparent'
              : active
                ? isDark
                  ? 'rgba(255, 255, 255, 0.15)'
                  : 'rgba(0, 0, 0, 0.1)'
                : 'transparent'
          }`,
        }}
      >
        <span>{selected}/{total}</span>
        {editCount !== undefined && editCount > 0 && (
          <span style={{ opacity: 0.85, fontSize: 10 }}>
            ({editCount} {t('admin_perm.editable')})
          </span>
        )}
      </span>
    );
  };

  // 单个模块卡片渲染
  const renderMenuGroupCard = (group: AdminMenuPermNode) => {
    const childValues = group.children?.map((c) => c.value) || [];
    const hasChildren = childValues.length > 0;

    const selectedChildren = childValues.filter((v) => permissionsWatch.includes(v));
    const parentChecked = hasChildren
      ? selectedChildren.length === childValues.length
      : permissionsWatch.includes(group.value);
    const parentIndeterminate =
      hasChildren &&
      selectedChildren.length > 0 &&
      selectedChildren.length < childValues.length;
    const isActive = parentChecked || parentIndeterminate;

    const childSelectedCount = hasChildren ? selectedChildren.length : parentChecked ? 1 : 0;
    const childTotalCount = hasChildren ? childValues.length : 1;

    const groupEditKeys = hasChildren
      ? selectedChildren
      : parentChecked
        ? [group.value]
        : [];
    const groupEditSelectedCount = hasChildren
      ? childValues.filter(
          (v) => permissionsWatch.includes(v) && editPermissionsWatch.includes(v),
        ).length
      : parentChecked && editPermissionsWatch.includes(group.value)
        ? 1
        : 0;
    const groupEditAll =
      groupEditKeys.length > 0 &&
      groupEditKeys.every((k) => editPermissionsWatch.includes(k));
    const groupEditSome =
      groupEditKeys.some((k) => editPermissionsWatch.includes(k)) && !groupEditAll;

    const moduleIcon = MENU_ICON_MAP[group.value] || <SettingOutlined />;

    return (
      <Col xs={24} sm={12} lg={8} key={group.value}>
        <div
          style={{
            borderRadius: 8,
            border: `1px solid ${
              isActive
                ? isDark
                  ? 'rgba(255, 255, 255, 0.16)'
                  : 'rgba(0, 0, 0, 0.14)'
                : token.colorBorderSecondary
            }`,
            background: token.colorBgContainer,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            transition: 'all 0.2s ease',
            boxShadow: isActive
              ? isDark
                ? '0 2px 8px rgba(0, 0, 0, 0.25)'
                : '0 2px 8px rgba(0, 0, 0, 0.04)'
              : 'none',
          }}
        >
          {/* 卡片头部 */}
          <div
            style={{
              padding: '8px 12px',
              background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Checkbox
              checked={parentChecked}
              indeterminate={parentIndeterminate}
              onChange={(e) =>
                toggleParent(group.value, group.children, e.target.checked)
              }
              style={{ minWidth: 0, flex: 1 }}
            >
              <Space size={6} style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 14,
                    color: isActive ? token.colorPrimary : muted,
                    display: 'inline-flex',
                  }}
                >
                  {moduleIcon}
                </span>
                <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  {t(group.labelKey, group.label)}
                </Text>
              </Space>
            </Checkbox>

            <Space size={6} align="center">
              <Checkbox
                checked={groupEditAll}
                indeterminate={groupEditSome}
                disabled={groupEditKeys.length === 0}
                onChange={(e) => toggleGroupEdit(group, e.target.checked)}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: groupEditKeys.length > 0 ? undefined : muted,
                    userSelect: 'none',
                  }}
                >
                  {t('admin_perm.editable')}
                </span>
              </Checkbox>
              {renderCountBadge(
                childSelectedCount,
                childTotalCount,
                isActive,
                groupEditSelectedCount,
              )}
            </Space>
          </div>

          {/* 卡片内容：多子项列表或单项控制 */}
          <div style={{ padding: hasChildren ? '4px 6px' : '10px 12px', flex: 1 }}>
            {hasChildren ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.children!.map((child: AdminMenuPermChild) => {
                  const visible = permissionsWatch.includes(child.value);
                  const editable = visible && editPermissionsWatch.includes(child.value);

                  return (
                    <div
                      key={child.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        borderRadius: 6,
                        background: visible
                          ? isDark
                            ? 'rgba(255, 255, 255, 0.04)'
                            : 'rgba(0, 0, 0, 0.02)'
                          : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      className="admin-perm-item-row"
                    >
                      <Checkbox
                        checked={visible}
                        onChange={(e) =>
                          toggleChild(
                            group.value,
                            child.value,
                            childValues,
                            e.target.checked,
                          )
                        }
                        style={{ marginInlineEnd: 0, flex: 1, minWidth: 0 }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: visible ? undefined : muted,
                            fontWeight: visible ? 500 : 400,
                          }}
                        >
                          {t(child.labelKey, child.label)}
                        </span>
                      </Checkbox>

                      <Checkbox
                        checked={editable}
                        disabled={!visible}
                        onChange={(e) => toggleEditKey(child.value, e.target.checked)}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: visible ? (editable ? undefined : muted) : muted,
                            userSelect: 'none',
                          }}
                        >
                          {t('admin_perm.editable')}
                        </span>
                      </Checkbox>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 2px',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {parentChecked ? '已授予该单页功能访问权限' : '未开启该功能访问权限'}
                </Text>
                <Checkbox
                  checked={parentChecked && editPermissionsWatch.includes(group.value)}
                  disabled={!parentChecked}
                  onChange={(e) => toggleEditKey(group.value, e.target.checked)}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: parentChecked ? undefined : muted,
                      userSelect: 'none',
                    }}
                  >
                    {t('admin_perm.editable')}
                  </span>
                </Checkbox>
              </div>
            )}
          </div>
        </div>
      </Col>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', paddingBottom: 24 }}>
      <Card
        size="small"
        bordered={false}
        styles={{
          body: { padding: '16px 20px 10px' },
          header: { minHeight: 48, padding: '8px 20px' },
        }}
        title={
          <Space size={10} align="center">
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/${adminPath}/admin-groups`)}
            />
            <SafetyCertificateOutlined style={{ fontSize: 16, color: token.colorPrimary }} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {isAdd ? '添加管理员等级' : '编辑管理员等级'}
            </span>
          </Space>
        }
        extra={
          <Space size={8}>
            <Button size="small" onClick={() => navigate(`/${adminPath}/admin-groups`)}>
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" size="small" requiredMark="optional">
          <Form.Item name="permissions" initialValue={[]} hidden>
            <Checkbox.Group options={[]} />
          </Form.Item>
          <Form.Item name="edit_permissions" initialValue={[]} hidden>
            <Checkbox.Group options={[]} />
          </Form.Item>
          <Form.Item name="plugin_permissions" initialValue={[]} hidden>
            <Checkbox.Group options={[]} />
          </Form.Item>

          {/* 基本信息 */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
              marginBottom: 16,
            }}
          >
            <Title level={5} style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
              基本信息
            </Title>
            <Row gutter={[12, 0]}>
              <Col xs={24} sm={10} md={8}>
                <Form.Item
                  name="name"
                  label={<span style={{ fontWeight: 500 }}>分组名称</span>}
                  style={{ marginBottom: 4 }}
                  rules={[{ required: true, message: '请输入分组名称' }]}
                >
                  <Input placeholder="例如：高级运营、客服主管" maxLength={64} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6} md={4}>
                <Form.Item
                  name="sort_order"
                  label={<span style={{ fontWeight: 500 }}>排序</span>}
                  tooltip="数字越大在列表中越靠前"
                  initialValue={0}
                  style={{ marginBottom: 4 }}
                >
                  <InputNumber style={{ width: '100%' }} placeholder="0" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={12}>
                <Form.Item
                  name="description"
                  label={<span style={{ fontWeight: 500 }}>描述说明</span>}
                  style={{ marginBottom: 4 }}
                >
                  <Input placeholder="说明该管理员等级的适用场景与职责范围" maxLength={200} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 可见基础菜单 */}
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: `1px solid ${token.colorBorderSecondary}`,
                marginBottom: 12,
              }}
            >
              <Space size={8} align="center" wrap>
                <Title level={5} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  {t('admin_perm.basic_menus')}
                </Title>
                {renderCountBadge(
                  selectedMenuCount,
                  totalMenuCount,
                  selectedMenuCount > 0,
                  selectedEditCount,
                )}
                <Tooltip title="勾选菜单可进入查看；再勾选「可编辑」才能保存、添加或删除相关配置">
                  <span style={{ fontSize: 12, color: muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <InfoCircleOutlined />
                    {t('admin_perm.menu_hint')}
                  </span>
                </Tooltip>
              </Space>

              {/* 快捷批量设置按钮组 */}
              <Space size={6} wrap>
                <span style={{ fontSize: 12, color: muted, marginRight: 2 }}>
                  {t('admin_perm.quick_presets', '快捷操作')}:
                </span>
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={handleBasicSelectAll}
                  type={basicSelectAllChecked ? 'dashed' : 'default'}
                >
                  {t('admin_perm.full_access', '全选所有')}
                </Button>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={handleBasicReadOnly}
                >
                  {t('admin_perm.readonly_only', '仅只读')}
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  disabled={permissionsWatch.length === 0}
                  onClick={handleBasicAllEditable}
                >
                  {t('admin_perm.all_editable', '全部可编辑')}
                </Button>
                <Button
                  size="small"
                  icon={<ClearOutlined />}
                  disabled={permissionsWatch.length === 0}
                  onClick={handleBasicClearAll}
                >
                  {t('admin_perm.clear_all', '清空')}
                </Button>
              </Space>
            </div>

            <Row gutter={[10, 10]}>{ADMIN_MENU_PERMISSIONS.map(renderMenuGroupCard)}</Row>
          </div>

          {/* 插件权限 */}
          {activePlugins.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  border: `1px solid ${token.colorBorderSecondary}`,
                  marginBottom: 12,
                }}
              >
                <Space size={8} align="center">
                  <AppstoreAddOutlined style={{ fontSize: 15, color: token.colorPrimary }} />
                  <Title level={5} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                    {t('admin_perm.plugin_perms')}
                  </Title>
                  {renderCountBadge(
                    pluginPermissionsWatch.length,
                    activePlugins.length,
                    pluginPermissionsWatch.length > 0,
                  )}
                </Space>

                <Space size={6} wrap>
                  <Button
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={handlePluginSelectAll}
                    type={pluginSelectAllChecked ? 'dashed' : 'default'}
                  >
                    {t('admin_perm.select_all')}
                  </Button>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={handlePluginReadOnly}
                  >
                    {t('admin_perm.readonly_only', '仅只读')}
                  </Button>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={pluginPermissionsWatch.length === 0}
                    onClick={handlePluginAllEditable}
                  >
                    {t('admin_perm.all_editable')}
                  </Button>
                  <Button
                    size="small"
                    icon={<ClearOutlined />}
                    disabled={pluginPermissionsWatch.length === 0}
                    onClick={handlePluginClearAll}
                  >
                    {t('admin_perm.clear_all', '清空')}
                  </Button>
                </Space>
              </div>

              <Row gutter={[10, 10]}>
                {activePlugins.map((p) => {
                  const value = `plugin:${p.name}`;
                  const visible = pluginPermissionsWatch.includes(value);
                  const editable = visible && editPermissionsWatch.includes(value);

                  return (
                    <Col xs={24} sm={12} md={8} lg={6} key={p.name}>
                      <div
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${
                            visible
                              ? isDark
                                ? 'rgba(255, 255, 255, 0.16)'
                                : 'rgba(0, 0, 0, 0.14)'
                              : token.colorBorderSecondary
                          }`,
                          background: token.colorBgContainer,
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          transition: 'all 0.2s ease',
                          boxShadow: visible
                            ? isDark
                              ? '0 2px 6px rgba(0, 0, 0, 0.2)'
                              : '0 2px 6px rgba(0, 0, 0, 0.03)'
                            : 'none',
                        }}
                      >
                        <Checkbox
                          checked={visible}
                          onChange={(e) => {
                            const set = new Set(pluginPermissionsWatch);
                            if (e.target.checked) set.add(value);
                            else set.delete(value);
                            form.setFieldsValue({
                              plugin_permissions: Array.from(set),
                              edit_permissions: e.target.checked
                                ? Array.from(new Set([...editPermissionsWatch, value]))
                                : editPermissionsWatch.filter((k) => k !== value),
                            });
                          }}
                          style={{ marginInlineEnd: 0, flex: 1, minWidth: 0 }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: visible ? 500 : 400,
                              color: visible ? undefined : muted,
                              wordBreak: 'break-all',
                            }}
                          >
                            {String(
                              t(`plugin_titles.${p.name}`, {
                                defaultValue: p.title || p.name,
                              }),
                            )}
                          </span>
                        </Checkbox>

                        <Checkbox
                          checked={editable}
                          disabled={!visible}
                          onChange={(e) => toggleEditKey(value, e.target.checked)}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: visible ? (editable ? undefined : muted) : muted,
                              userSelect: 'none',
                            }}
                          >
                            {t('admin_perm.editable')}
                          </span>
                        </Checkbox>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </div>
          )}

          {/* 底部保存条 */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              paddingBottom: 4,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              position: 'sticky',
              bottom: 0,
              background: token.colorBgContainer,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              zIndex: 10,
            }}
          >
            <Button size="middle" onClick={() => navigate(`/${adminPath}/admin-groups`)}>
              取消
            </Button>
            <Button
              size="middle"
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存配置
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default AdminGroupEdit;
