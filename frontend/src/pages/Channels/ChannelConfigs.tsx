/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Switch, Segmented, message, Popconfirm, Card, Typography, AutoComplete, Grid, Tooltip, Progress, Select, Divider, TimePicker, Popover, Checkbox } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { listPagination } from '../../components/ListPagination';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, ClearOutlined, StopOutlined, PlayCircleOutlined, SettingOutlined, CheckSquareOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import request from '../../utils/request';
import { formatApiDateTime, timedisplayOffsetSuffix } from '../../utils/timedisplay';
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';
import type { ChannelConfig, ChannelCategory, Upstream } from '../../types';
import ChannelCategoryManager from '../../components/Channels/ChannelCategoryManager';
import { channelEditPath } from './channelPaths';
import {
  formatQuotaLimitDisplay,
  parseQuotaLimitInput,
  validateQuotaHierarchy,
  isFiniteQuotaLimit,
  compareChannelQuota,
  quotaPeriodItems,
  quotaRingPercent,
  QUOTA_SORT_METRICS,
  QUOTA_RING_BLUE,
  type QuotaSortPeriod,
  type QuotaSortMetric,
} from '../../utils/quotaPeriod';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const UPSTREAM_SYSTEM_OPTIONS = [
  { value: '兼容', label: '兼容' },
  { value: '官方', label: '官方' },
  { value: 'newapi', label: 'newapi' },
  { value: 'Tkeapi', label: 'Tkeapi' },
  { value: '火山引擎', label: '火山引擎' },
  { value: '阿里云', label: '阿里云' },
];

const UPSTREAM_CURRENCY_OPTIONS = [
  { value: 'CNY', label: 'CNY (人民币 ¥ / RMB)' },
  { value: 'USD', label: 'USD (美元 $)' },
  { value: '', label: '同本站 / 无需换算' },
];

const SITE_CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD (美元 $)' },
  { value: 'CNY', label: 'CNY (人民币 ¥ / RMB)' },
];

type UpstreamGroupOption = { name: string; ratio: number; label: string };

function convertCurrencyRatio(
  groupRatio: number,
  upstreamCurrency?: string,
  siteCurrency?: string,
  currencyRate?: number,
): number {
  const u = (upstreamCurrency || '').trim();
  const s = (siteCurrency || '').trim();
  if (!u || !s || u.toLowerCase() === s.toLowerCase()) {
    return groupRatio;
  }
  const rate = Number(currencyRate) > 0 ? Number(currencyRate) : 1.0;
  const isCny = (c: string) => {
    const lower = c.toLowerCase();
    return lower === 'cny' || lower === 'rmb' || lower === '人民币' || lower === '元';
  };
  const isUsd = (c: string) => {
    const lower = c.toLowerCase();
    return lower === 'usd' || lower === '美元' || lower === '$';
  };

  if (isCny(u) && isUsd(s)) {
    return groupRatio / rate;
  } else if (isUsd(u) && isCny(s)) {
    return groupRatio * rate;
  }
  return groupRatio / rate;
}

function appliedChannelRate(
  groupRatio: number,
  add: number,
  upstreamCurrency?: string,
  siteCurrency?: string,
  currencyRate?: number,
) {
  const extra = Number(add);
  const ratio = Number(groupRatio) || 0;
  const converted = convertCurrencyRatio(ratio, upstreamCurrency, siteCurrency, currencyRate);
  const total = Math.max(0, converted + (Number.isFinite(extra) && extra > 0 ? extra : 0));
  return Number(total.toFixed(4));
}

function renderUpstreamSyncInline(record: ChannelConfig) {
  const system = (record.upstream_system || '').trim();
  const group = (record.upstream_group || '').trim();
  if (!system || !group) return null;
  const interval = Number(record.upstream_sync_interval_minutes) || 0;
  const add = Number(record.upstream_sync_rate_add) || 0;
  const rate = record.rate ?? 1;
  const upCurr = (record.upstream_currency || '').trim();
  const stCurr = (record.site_currency || '').trim();
  const hasConversion = Boolean(upCurr && stCurr && upCurr.toLowerCase() !== stCurr.toLowerCase());
  const currRate = Number(record.upstream_currency_rate) > 0 ? Number(record.upstream_currency_rate) : 7.2;

  const tip = [
    `上游 ${system}`,
    `分组 ${group}（渠道倍率 ${rate}x）`,
    hasConversion ? `货币换算: ${upCurr} → ${stCurr} (汇率 ${currRate})` : null,
    interval > 0 ? `每 ${interval} 分钟同步` : '不自动同步',
    add > 0 ? `同步增量 +${add}` : null,
    record.upstream_synced_at ? `上次同步 ${formatApiDateTime(record.upstream_synced_at)}` : null,
  ].filter(Boolean).join('\n');
  const tagStyle: React.CSSProperties = { margin: 0, padding: '0 5px', fontSize: 11, height: 19, lineHeight: '17px', borderRadius: 4 };
  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tip}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
        <Tag color="blue" style={tagStyle}>{system}</Tag>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <Tag style={tagStyle}>{group} {rate}x</Tag>
          {hasConversion ? <Tag color="geekblue" style={tagStyle}>{upCurr}→{stCurr}</Tag> : null}
          {interval > 0 ? <Tag color="cyan" style={tagStyle}>每{interval}分</Tag> : null}
          {add > 0 ? <Tag color="orange" style={tagStyle}>+{add}</Tag> : null}
        </div>
      </div>
    </Tooltip>
  );
}

/** 紧凑展示在「日额度」标签后：01:00 (UTC+8) · 冷30分 */
function formatDailyResetInline(
  hour: number,
  minute: number,
  cooldown: number,
  tzSuffix: string,
): string {
  const hh = String(Math.min(23, Math.max(0, hour))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, minute))).padStart(2, '0');
  const cool = Math.max(0, cooldown);
  const timeText = `${hh}:${mm}${tzSuffix}`;
  return cool > 0 ? `${timeText} · 冷${cool}分` : timeText;
}

const ChannelConfigs: React.FC = () => {
  const { t } = useTranslation();
  const screens = useBreakpoint();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const { settings } = useSettingsStore();
  const quotaTz = settings?.site?.default_timezone || 'Asia/Shanghai';
  const adminPath = localStorage.getItem('tokensbyte_admin_path') || 'admin1688';
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ChannelConfig | null>(null);
  const [upstreams, setUpstreams] = useState<{ id: number, name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all' | 'unclassified'>('all');
  const [enableQuota, setEnableQuota] = useState(false);
  const [isCategoryManagerVisible, setIsCategoryManagerVisible] = useState(false);
  const [dailyResetModalOpen, setDailyResetModalOpen] = useState(false);
  const [dailyResetDraft, setDailyResetDraft] = useState({ hour: 0, minute: 0, cooldown: 0 });
  const [upstreamGroups, setUpstreamGroups] = useState<UpstreamGroupOption[]>([]);
  const [selectedGroupRatio, setSelectedGroupRatio] = useState<number | null>(null);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [syncAddEnabled, setSyncAddEnabled] = useState(false);
  const [quotaSortPeriod, setQuotaSortPeriod] = useState<QuotaSortPeriod>('auto');
  const [quotaSortMetric, setQuotaSortMetric] = useState<QuotaSortMetric>('rate');
  const [quotaSortOrder, setQuotaSortOrder] = useState<'ascend' | 'descend' | null>(null);
  const [form] = Form.useForm();
  const upstreamSystem = Form.useWatch('upstream_system', form);
  const upstreamGroup = Form.useWatch('upstream_group', form);
  const upstreamCurrency = Form.useWatch('upstream_currency', form);
  const siteCurrency = Form.useWatch('site_currency', form);
  const upstreamCurrencyRate = Form.useWatch('upstream_currency_rate', form);
  const upstreamSyncRateAdd = Form.useWatch('upstream_sync_rate_add', form);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/channel-configs') as unknown as Promise<{ data: ChannelConfig[] }>);
      setConfigs(resp.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const resp = await (request.get('/channel-categories') as any);
      setCategories(Array.isArray(resp) ? resp : (resp?.data || []));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUpstreams = async () => {
    try {
      const pResp = await (request.get('/upstreams') as unknown as Promise<Upstream[]>);
      setUpstreams(pResp || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchCategories();
    fetchUpstreams();
  }, []);

  const resolveCategoryName = (categoryId?: number | null) => {
    if (!categoryId) return '';
    return categories.find(c => c.id === categoryId)?.name || '';
  };

  const activeCategories = categories.filter(c => c.is_active === 1 || c.is_active === true);

  const updateCalculatedRate = (
    groupName?: string,
    addValue?: number,
    upCurr?: string,
    stCurr?: string,
    cRate?: number,
    syncEnabledOverride?: boolean,
    ratioOverride?: number,
  ) => {
    const name = groupName !== undefined ? groupName : form.getFieldValue('upstream_group');
    const hit = name ? upstreamGroups.find(g => g.name === name) : undefined;

    let ratio = 3.0;
    if (ratioOverride !== undefined && Number.isFinite(ratioOverride) && ratioOverride > 0) {
      ratio = ratioOverride;
    } else if (hit && typeof hit.ratio === 'number') {
      ratio = hit.ratio;
      setSelectedGroupRatio(hit.ratio);
    } else if (selectedGroupRatio !== null && selectedGroupRatio !== undefined && selectedGroupRatio > 0) {
      ratio = selectedGroupRatio;
    }

    const isSyncAddOn = syncEnabledOverride !== undefined ? syncEnabledOverride : syncAddEnabled;
    const add = isSyncAddOn ? (addValue !== undefined ? addValue : Number(form.getFieldValue('upstream_sync_rate_add') || 0)) : 0;
    const uCurr = upCurr !== undefined ? upCurr : form.getFieldValue('upstream_currency');
    const sCurr = stCurr !== undefined ? stCurr : form.getFieldValue('site_currency');
    const rawRate = cRate !== undefined ? cRate : form.getFieldValue('upstream_currency_rate');
    const currRate = Number(rawRate) > 0 ? Number(rawRate) : 7.2;

    const nextRate = appliedChannelRate(ratio, add, uCurr, sCurr, currRate);
    form.setFieldsValue({ rate: nextRate });
  };

  const loadUpstreamGroups = async (cfg?: ChannelConfig, silent = false) => {
    const activeConfig = cfg || editingConfig;
    const baseUrl = String(cfg?.base_url || form.getFieldValue('base_url') || '').trim();
    const apiKey = String(cfg?.api_key || form.getFieldValue('api_key') || '');
    if (!baseUrl) {
      if (!silent) message.warning('请先填写端点基础地址');
      return;
    }
    if (!apiKey && !activeConfig?.id) {
      if (!silent) message.warning('请先填写请求鉴权密钥');
      return;
    }
    setFetchingGroups(true);
    try {
      const resp = await (request.post('/channel-configs/upstream-groups', {
        config_id: activeConfig?.id,
        base_url: baseUrl,
        api_key: apiKey,
        upstream_system: 'newapi',
      }) as Promise<{ data?: UpstreamGroupOption[] }>);
      const list = resp.data || [];
      setUpstreamGroups(list);
      const current = cfg?.upstream_group || form.getFieldValue('upstream_group');
      if (current && list.some(g => g.name === current)) {
        const hit = list.find(g => g.name === current);
        if (hit) {
          setSelectedGroupRatio(hit.ratio);
          if (!silent) {
            updateCalculatedRate(current, undefined, undefined, undefined, undefined, undefined, hit.ratio);
          }
        }
      }
      if (!silent) {
        if (list.length === 0) {
          message.info('上游未返回分组倍率');
        } else {
          message.success(`已拉取 ${list.length} 个分组`);
        }
      }
    } catch (e) {
      if (!silent) console.error(e);
    } finally {
      setFetchingGroups(false);
    }
  };

  const handleAdd = () => {
    setEditingConfig(null);
    setEnableQuota(false);
    form.resetFields();
    const defaultSiteCurrency = settings?.currency?.default_currency || 'USD';
    form.setFieldsValue({
      sort_order: 0,
      rate: 1.0,
      priority: 0,
      weight: 1,
      status: 1,
      category_id: null,
      quota_limit: -1,
      daily_quota_limit: -1,
      weekly_quota_limit: -1,
      monthly_quota_limit: -1,
      daily_reset_hour: 0,
      daily_reset_minute: 0,
      daily_reset_cooldown_minutes: 0,
      upstream_system: undefined,
      upstream_group: undefined,
      upstream_sync_interval_minutes: 0,
      upstream_sync_rate_add: 0,
      upstream_currency: 'CNY',
      site_currency: defaultSiteCurrency,
      upstream_currency_rate: 7.2,
    });
    setUpstreamGroups([]);
    setSelectedGroupRatio(null);
    setSyncAddEnabled(false);
    setIsModalVisible(true);
  };

  const handleEdit = (record: ChannelConfig) => {
    setEditingConfig(record);
    const q = record.quota_limit ?? -1;
    const dq = record.daily_quota_limit ?? -1;
    const wq = record.weekly_quota_limit ?? -1;
    const mq = record.monthly_quota_limit ?? -1;
    setEnableQuota(q >= 0 || dq >= 0 || wq >= 0 || mq >= 0);
    form.resetFields();
    const defaultSiteCurrency = settings?.currency?.default_currency || 'USD';
    const rawRate = Number(record.rate ?? 1);
    const safeRate = Number.isFinite(rawRate) ? Number(rawRate.toFixed(4)) : 1;
    form.setFieldsValue({
      ...record,
      rate: safeRate,
      status: record.status ?? 1,
      category_id: record.category_id ?? null,
      quota_limit: record.quota_limit ?? -1,
      daily_quota_limit: record.daily_quota_limit ?? -1,
      weekly_quota_limit: record.weekly_quota_limit ?? -1,
      monthly_quota_limit: record.monthly_quota_limit ?? -1,
      daily_reset_hour: record.daily_reset_hour ?? 0,
      daily_reset_minute: record.daily_reset_minute ?? 0,
      daily_reset_cooldown_minutes: record.daily_reset_cooldown_minutes ?? 0,
      upstream_system: record.upstream_system || undefined,
      upstream_group: record.upstream_group || undefined,
      upstream_sync_interval_minutes: record.upstream_sync_interval_minutes ?? 0,
      upstream_sync_rate_add: record.upstream_sync_rate_add ?? 0,
      upstream_currency: record.upstream_currency || (record.upstream_system === 'newapi' ? 'CNY' : undefined),
      site_currency: record.site_currency || defaultSiteCurrency,
      upstream_currency_rate: (record.upstream_currency_rate && record.upstream_currency_rate > 0) ? record.upstream_currency_rate : 7.2,
    });
    setUpstreamGroups([]);
    setSelectedGroupRatio(null);
    setSyncAddEnabled((record.upstream_sync_rate_add ?? 0) > 0);
    setIsModalVisible(true);
    if (record.upstream_system === 'newapi' && record.base_url) {
      loadUpstreamGroups(record, true);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/channel-configs/${id}`);
      message.success(t('common.success'));
      fetchConfigs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStatus = async (record: ChannelConfig) => {
    try {
      const newStatus = (record.status ?? 1) === 1 ? 0 : 1;
      await request.put(`/channel-configs/${record.id}`, { status: newStatus });
      setConfigs(prev => prev.map(c => c.id === record.id ? { ...c, status: newStatus } : c));
      message.success(newStatus === 1 ? '已启用上游渠道' : '已禁用上游渠道');
    } catch (e) {
      console.error(e);
    }
  };

  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchCategoryKey, setBatchCategoryKey] = useState(0);

  const batchChecked = (id: number) => selectedRowKeys.some(k => Number(k) === id);

  const toggleBatchKey = (id: number, checked: boolean) => {
    setSelectedRowKeys(prev => {
      const has = prev.some(k => Number(k) === id);
      if (checked) return has ? prev : [...prev, id];
      return prev.filter(k => Number(k) !== id);
    });
  };

  const handleBatchChangeStatus = async (status: number) => {
    const idSet = new Set(selectedRowKeys.map(k => Number(k)));
    const targets = configs.filter(c => idSet.has(c.id));
    if (targets.length === 0) return;
    setBatchLoading(true);
    try {
      await Promise.all(targets.map(c => request.put(`/channel-configs/${c.id}`, { status })));
      const done = new Set(targets.map(c => c.id));
      setConfigs(prev => prev.map(c => done.has(c.id) ? { ...c, status } : c));
      message.success(status === 1 ? `已激活 ${targets.length} 个上游渠道` : `已禁用 ${targets.length} 个上游渠道`);
    } catch (e) {
      console.error(e);
      fetchConfigs();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchChangeCategory = async (categoryId: number | null) => {
    const idSet = new Set(selectedRowKeys.map(k => Number(k)));
    const targets = configs.filter(c => idSet.has(c.id));
    if (targets.length === 0) return;
    setBatchLoading(true);
    try {
      await Promise.all(targets.map(c => request.put(`/channel-configs/${c.id}`, { category_id: categoryId })));
      const done = new Set(targets.map(c => c.id));
      setConfigs(prev => prev.map(c => done.has(c.id) ? { ...c, category_id: categoryId } : c));
      const name = categoryId == null ? '未分类' : (categories.find(c => c.id === categoryId)?.name || '所选分类');
      message.success(`已将 ${targets.length} 个上游渠道改为「${name}」`);
    } catch (e) {
      console.error(e);
      fetchConfigs();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    const ids = configs.filter(c => batchChecked(c.id)).map(c => c.id);
    if (ids.length === 0) return;
    setBatchLoading(true);
    try {
      await Promise.all(ids.map(id => request.delete(`/channel-configs/${id}`)));
      message.success(`已删除 ${ids.length} 个上游渠道`);
      setSelectedRowKeys([]);
      setConfigs(prev => prev.filter(c => !ids.includes(c.id)));
    } catch (e) {
      console.error(e);
      fetchConfigs();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleResetQuota = async (id: number) => {
    try {
      await request.post(`/channel-configs/${id}/quota/reset`);
      message.success('已清零上游预设已用额度');
      fetchConfigs();
    } catch (e) {
      console.error(e);
    }
  };

  const openDailyResetModal = () => {
    setDailyResetDraft({
      hour: Number(form.getFieldValue('daily_reset_hour') ?? 0),
      minute: Number(form.getFieldValue('daily_reset_minute') ?? 0),
      cooldown: Number(form.getFieldValue('daily_reset_cooldown_minutes') ?? 0),
    });
    setDailyResetModalOpen(true);
  };

  const saveDailyResetModal = () => {
    form.setFieldsValue({
      daily_reset_hour: Math.min(23, Math.max(0, Number(dailyResetDraft.hour) || 0)),
      daily_reset_minute: Math.min(59, Math.max(0, Number(dailyResetDraft.minute) || 0)),
      daily_reset_cooldown_minutes: Math.max(0, Number(dailyResetDraft.cooldown) || 0),
    });
    setDailyResetModalOpen(false);
  };

  const closeConfigModal = () => {
    setDailyResetModalOpen(false);
    setIsModalVisible(false);
    setUpstreamGroups([]);
    setSelectedGroupRatio(null);
    setFetchingGroups(false);
  };

  const handleSave = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        base_url: values.base_url ? values.base_url.trim() : values.base_url,
        sort_order: Number(values.sort_order) || 0,
        rate: values.rate !== undefined && values.rate !== null ? Number(Number(values.rate).toFixed(4)) : 1.0,
        priority: values.priority !== undefined && values.priority !== null ? Number(values.priority) : 0,
        weight: values.weight !== undefined && values.weight !== null ? Number(values.weight) : 1,
        status: values.status === 0 ? 0 : 1,
        category_id: values.category_id ?? null,
        quota_limit: (!enableQuota || values.quota_limit === undefined || values.quota_limit === null) ? -1 : Number(values.quota_limit),
        daily_quota_limit: (!enableQuota || values.daily_quota_limit === undefined || values.daily_quota_limit === null) ? -1 : Number(values.daily_quota_limit),
        weekly_quota_limit: (!enableQuota || values.weekly_quota_limit === undefined || values.weekly_quota_limit === null) ? -1 : Number(values.weekly_quota_limit),
        monthly_quota_limit: (!enableQuota || values.monthly_quota_limit === undefined || values.monthly_quota_limit === null) ? -1 : Number(values.monthly_quota_limit),
        daily_reset_hour: Math.min(23, Math.max(0, Number(values.daily_reset_hour) || 0)),
        daily_reset_minute: Math.min(59, Math.max(0, Number(values.daily_reset_minute) || 0)),
        daily_reset_cooldown_minutes: Math.max(0, Number(values.daily_reset_cooldown_minutes) || 0),
        upstream_system: values.upstream_system || '',
        upstream_group: values.upstream_system === 'newapi' ? (values.upstream_group || '') : '',
        upstream_sync_interval_minutes: values.upstream_system === 'newapi'
          ? Math.max(0, Number(values.upstream_sync_interval_minutes) || 0)
          : 0,
        upstream_sync_rate_add: values.upstream_system === 'newapi' && syncAddEnabled
          ? Number((Math.max(0, Number(values.upstream_sync_rate_add) || 0)).toFixed(4))
          : 0,
        upstream_currency: values.upstream_system === 'newapi' ? (values.upstream_currency || '') : '',
        site_currency: values.upstream_system === 'newapi' ? (values.site_currency || '') : '',
        upstream_currency_rate: values.upstream_system === 'newapi'
          ? (Number(values.upstream_currency_rate) > 0 ? Number(Number(values.upstream_currency_rate).toFixed(4)) : 1.0)
          : 1.0,
      };
      if (enableQuota) {
        const hierarchyErr = validateQuotaHierarchy(payload);
        if (hierarchyErr) {
          message.error(hierarchyErr);
          setSubmitting(false);
          return;
        }
      }
      if (editingConfig) {
        // 密钥未修改（与加载时原值相同）时或未填写时不提交，防止覆盖；但如果显式清空(等于空字符串)，则提交给后端处理
        if (payload.api_key === undefined || payload.api_key === editingConfig.api_key) {
          delete payload.api_key;
        } else if (typeof payload.api_key === 'string') {
          payload.api_key = payload.api_key.trim();
        }
        await request.put(`/channel-configs/${editingConfig.id}`, payload);
        message.success(t('common.success'));
      } else {
        if (typeof payload.api_key === 'string') {
          payload.api_key = payload.api_key.trim();
        }
        await request.post('/channel-configs', payload);
        message.success(t('common.success'));
      }
      setIsModalVisible(false);
      setDailyResetModalOpen(false);
      fetchConfigs();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const applyQuotaSort = (period: QuotaSortPeriod, metric = quotaSortMetric) => {
    if (quotaSortPeriod === period && quotaSortMetric === metric && quotaSortOrder) {
      setQuotaSortOrder(quotaSortOrder === 'ascend' ? 'descend' : 'ascend');
      return;
    }
    setQuotaSortPeriod(period);
    setQuotaSortMetric(metric);
    setQuotaSortOrder(metric === 'remain' || metric === 'limit' ? 'ascend' : 'descend');
  };

  const quotaMetricLabel = QUOTA_SORT_METRICS.find((m) => m.key === quotaSortMetric)!.label;
  const quotaSortMark = (period: QuotaSortPeriod) =>
    quotaSortOrder && quotaSortPeriod === period ? (quotaSortOrder === 'ascend' ? '↑' : '↓') : '';

  const renderQuotaCell = (record: ChannelConfig) => {
    const items = quotaPeriodItems(record, quotaTz);
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(6));
    const hasAnyConfigured = items.some((item) => item.limit >= 0);

    const slotWidth = 28;
    const ringSize = 24;
    const ringStroke = 5;

    const slotStyle: React.CSSProperties = {
      width: slotWidth,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 1,
      cursor: 'default',
    };
    const labelStyle: React.CSSProperties = {
      fontSize: 9,
      color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.45)',
      lineHeight: 1,
      transform: 'scale(0.92)',
    };

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(4, ${slotWidth}px)`,
          gap: 3,
          alignItems: 'center',
          justifyContent: 'start',
          width: 122,
        }}
      >
        {items.map((item, index) => {
          const configured = item.limit >= 0;
          const showUnlimited = !hasAnyConfigured && index === 0;
          const showRing = configured || showUnlimited;
          const mark = quotaSortMark(item.key);

          if (!showRing) {
            return (
              <div key={item.key} style={{ ...slotStyle, visibility: 'hidden' }} aria-hidden>
                <div style={{ width: ringSize, height: ringSize }} />
                <span style={labelStyle}>{item.label}</span>
              </div>
            );
          }

          const pct = configured ? quotaRingPercent(item.used, item.limit) : 0;
          const tip = showUnlimited
            ? `额度：${fmt(item.used)} / ∞（无限） · 点击按总·${quotaMetricLabel}排序`
            : `${item.label}额度：${fmt(item.used)} / ${fmt(Number(item.limit))}（${pct}%） · 点击按${item.label}·${quotaMetricLabel}排序`;
          const stroke = showUnlimited
            ? (isLight ? '#a1a1aa' : 'rgba(255,255,255,0.28)')
            : (pct >= 100 ? '#ef4444' : QUOTA_RING_BLUE[item.key]);

          return (
            <Tooltip key={item.key} title={tip}>
              <div
                style={{ ...slotStyle, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  applyQuotaSort(item.key);
                }}
              >
                <Progress
                  type="circle"
                  percent={showUnlimited ? 100 : pct}
                  size={ringSize}
                  strokeWidth={ringStroke}
                  strokeColor={stroke}
                  trailColor={isLight ? '#e4e4e7' : 'rgba(255,255,255,0.12)'}
                  format={() => (
                    <span
                      style={{
                        fontSize: showUnlimited ? 9 : 8,
                        fontWeight: 600,
                        color: isLight ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.88)',
                        lineHeight: 1,
                      }}
                    >
                      {showUnlimited ? '∞' : `${pct}%`}
                    </span>
                  )}
                />
                <span style={{
                  ...labelStyle,
                  color: mark ? '#1677ff' : labelStyle.color,
                  fontWeight: mark ? 700 : undefined,
                }}>
                  {showUnlimited ? '无限' : item.label}{mark}
                </span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  const renderStatusBadge = (status?: number) => {
    const active = (status ?? 1) === 1;
    return (
      <Space size={5} style={{ color: active ? '#52c41a' : '#ff4d4f' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: active ? '#52c41a' : '#ff4d4f' }} />
        <span style={{ fontSize: 12 }}>{active ? t('common.active') : t('common.disabled')}</span>
      </Space>
    );
  };

  const filteredConfigs = configs.filter(config => {
    if (statusFilter !== 'all' && (config.status ?? 1) !== statusFilter) {
      return false;
    }
    if (categoryFilter === 'unclassified') {
      if (config.category_id) return false;
    } else if (categoryFilter !== 'all') {
      if (config.category_id !== categoryFilter) return false;
    }
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const nameMatch = config.name?.toLowerCase().includes(searchLower);
      const yidMatch = config.yid?.toLowerCase().includes(searchLower);
      const providerMatch = config.provider_type?.toLowerCase().includes(searchLower);
      return nameMatch || yidMatch || providerMatch;
    }
    return true;
  });
  const displayedConfigs = quotaSortOrder
    ? [...filteredConfigs].sort((a, b) => {
        const d = compareChannelQuota(a, b, quotaSortPeriod, quotaSortMetric, quotaTz);
        return quotaSortOrder === 'ascend' ? d : -d;
      })
    : filteredConfigs;

  const columns = [
    {
      title: '配置',
      key: 'name',
      width: 280,
      ellipsis: false,
      onCell: () => ({ style: { overflow: 'visible', whiteSpace: 'normal' } }),
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.name || '').localeCompare(b.name || '', 'zh'),
      render: (_: unknown, record: ChannelConfig) => {
        const sync = renderUpstreamSyncInline(record);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.name}</div>
              <Typography.Text keyboard style={{ color: '#1677ff', fontSize: 11, lineHeight: 1.2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', width: 'fit-content' }}>
                YID {record.yid || '-'}
              </Typography.Text>
            </div>
            {sync}
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 75,
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.status ?? 1) - (b.status ?? 1),
      render: (status: number) => renderStatusBadge(status),
    },
    {
      title: '上游分类',
      dataIndex: 'category_id',
      key: 'category_id',
      width: 95,
      ellipsis: true,
      sorter: (a: ChannelConfig, b: ChannelConfig) => {
        const nameA = resolveCategoryName(a.category_id);
        const nameB = resolveCategoryName(b.category_id);
        return nameA.localeCompare(nameB, 'zh');
      },
      render: (categoryId: number | null | undefined) => {
        const name = resolveCategoryName(categoryId);
        return name ? (
          <Tag style={{ margin: 0, padding: '0 5px', fontSize: 11, height: 19, lineHeight: '17px', borderRadius: 4 }}>{name}</Tag>
        ) : <Text type="secondary" style={{ fontSize: 12 }}>未分类</Text>;
      },
    },
    {
      title: '绑定分组',
      key: 'bound_channels',
      width: 105,
      align: 'center' as const,
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.bound_channel_count || 0) - (b.bound_channel_count || 0),
      render: (_: unknown, record: ChannelConfig) => {
        const count = record.bound_channel_count || 0;
        if (count === 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>未绑定</Text>;
        }
        const channels = record.bound_channels || [];
        return (
          <Popover
            title={
              <div style={{ fontSize: 12, fontWeight: 600, paddingBottom: 4 }}>
                已绑定的模型渠道分组 ({count})
              </div>
            }
            content={
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, maxWidth: 300 }}>
                {channels.map((ch) => (
                  <div
                    key={ch.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 6,
                      background: isLight ? '#f4f4f5' : 'rgba(255,255,255,0.06)',
                      border: isLight ? '1px solid #e4e4e7' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: ch.status === 0 ? 'var(--text-secondary, #8c8c8c)' : undefined,
                        }}
                        title={ch.name}
                      >
                        {ch.name}
                      </span>
                      {ch.status === 0 && (
                        <Tag color="error" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '14px', height: 16, borderRadius: 2 }}>
                          已禁用
                        </Tag>
                      )}
                      {ch.is_ha && (
                        <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '14px', height: 16, borderRadius: 2 }}>
                          HA
                        </Tag>
                      )}
                    </div>
                    <Link
                      to={channelEditPath(adminPath, ch.id)}
                      style={{ fontSize: 11, color: '#1677ff', flexShrink: 0, textDecoration: 'none' }}
                    >
                      编辑
                    </Link>
                  </div>
                ))}
              </div>
            }
            placement="bottom"
            trigger={['hover', 'click']}
          >
            <Tag
              color="processing"
              style={{
                margin: 0,
                padding: '0 6px',
                fontSize: 11,
                height: 20,
                lineHeight: '18px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {count} 个分组
            </Tag>
          </Popover>
        );
      },
    },
    {
      title: '服务商',
      dataIndex: 'provider_type',
      key: 'provider_type',
      width: 90,
      ellipsis: true,
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.provider_type || '').localeCompare(b.provider_type || '', 'zh'),
      render: (text: string) => <Text style={{ fontSize: 12 }}>{text || '-'}</Text>,
    },
    {
      title: '调度',
      key: 'schedule',
      width: 105,
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.priority || 0) - (b.priority || 0),
      render: (_: unknown, record: ChannelConfig) => (
        <Space size={3} wrap={false}>
          <Tooltip title="优先级"><Text type="secondary" style={{ fontSize: 12 }}>P{record.priority || 0}</Text></Tooltip>
          <Tooltip title="权重"><Text type="secondary" style={{ fontSize: 12 }}>W{record.weight || 1}</Text></Tooltip>
          <Tag color="orange" style={{ margin: 0, padding: '0 4px', lineHeight: '16px', height: 18, fontSize: 11, borderRadius: 4 }}>{record.rate ?? 1.0}x</Tag>
        </Space>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={`点击按最紧档${quotaMetricLabel}排序`}>
            <span
              style={{ cursor: 'pointer' }}
              onClick={() => applyQuotaSort('auto')}
            >
              额度{quotaSortMark('auto')}
            </span>
          </Tooltip>
          <Select
            size="small"
            value={quotaSortMetric}
            options={QUOTA_SORT_METRICS.map((m) => ({ value: m.key, label: m.label }))}
            onChange={(m: QuotaSortMetric) => applyQuotaSort(quotaSortPeriod, m)}
            popupMatchSelectWidth={false}
            style={{ width: 78, fontSize: 12 }}
            variant="borderless"
          />
        </span>
      ),
      key: 'quota',
      width: 168,
      render: (_: unknown, record: ChannelConfig) => renderQuotaCell(record),
    },
    {
      title: 'Base URL',
      dataIndex: 'base_url',
      key: 'base_url',
      width: 180,
      ellipsis: true,
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.base_url || '').localeCompare(b.base_url || ''),
      render: (text: string) => (
        <Tooltip title={text}>
          <Text code style={{ fontSize: 11, lineHeight: 1.2 }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 70,
      align: 'center' as const,
      sorter: (a: ChannelConfig, b: ChannelConfig) => (a.sort_order || 0) - (b.sort_order || 0),
      render: (val: number) => <Text type="secondary" style={{ fontSize: 12 }}>{val || 0}</Text>,
    },
    {
      title: '最新更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 150,
      ellipsis: true,
      sorter: (a: ChannelConfig, b: ChannelConfig) => {
        const ta = a.updated_at || a.created_at || '';
        const tb = b.updated_at || b.created_at || '';
        return ta.localeCompare(tb);
      },
      render: (_: unknown, record: ChannelConfig) => {
        const time = record.updated_at || record.created_at;
        return <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{time ? formatApiDateTime(time) : '-'}</Text>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 100,
      ellipsis: true,
      render: (text: string) => <Text type="secondary" style={{ fontSize: 12 }}>{text || '-'}</Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, record: ChannelConfig) => (
        <Space size={2} style={{ justifyContent: 'center', width: '100%' }}>
          <Tooltip title={(record.status ?? 1) === 1 ? '点击禁用' : '点击启用'}>
            <Button
              type="text"
              size="small"
              className="channel-table-action-btn"
              icon={(record.status ?? 1) === 1
                ? <PlayCircleOutlined style={{ color: '#52c41a' }} />
                : <StopOutlined style={{ color: '#ff4d4f' }} />}
              onClick={() => handleToggleStatus(record)}
            />
          </Tooltip>
          <Tooltip title="清零额度">
            <Popconfirm title="确定清零该预设的总/日/周/月已用额度吗？" onConfirm={() => handleResetQuota(record.id)}>
              <Button type="text" size="small" className="channel-table-action-btn" icon={<ClearOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" className="channel-table-action-btn" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title="删除">
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
              <Button type="text" size="small" className="channel-table-action-btn" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <style>{`
        .channel-configs-table .ant-table,
        .channel-configs-table .ant-table-container,
        .channel-configs-table .ant-table-content,
        .channel-configs-table table {
          border-collapse: collapse !important;
          border-spacing: 0 !important;
        }
        .channel-configs-table .ant-table-thead {
          background: ${isLight ? '#f9fafb' : '#18181b'} !important;
        }
        .channel-configs-table .ant-table-thead > tr {
          height: 28px !important;
          background: ${isLight ? '#f9fafb' : '#18181b'} !important;
        }
        .channel-configs-table .ant-table-thead > tr > th,
        .channel-configs-table .ant-table-thead > tr > th.ant-table-cell {
          padding: 3px 8px !important;
          height: 28px !important;
          line-height: 20px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          background: ${isLight ? '#f9fafb' : '#18181b'} !important;
          border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} !important;
          color: ${isLight ? '#64748b' : '#a1a1aa'} !important;
        }
        .channel-configs-table .ant-table-thead .ant-table-column-sorters {
          padding: 0 !important;
          margin: 0 !important;
          height: 20px !important;
          display: inline-flex !important;
          align-items: center !important;
        }
        .channel-configs-table .ant-table-thead .ant-table-column-title {
          line-height: 20px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
        }
        .channel-configs-table .ant-table-thead .ant-table-column-sorter {
          margin-inline-start: 3px !important;
          font-size: 9px !important;
        }
        .channel-configs-table .ant-table-thead > tr > th::before {
          display: none !important;
        }
        .channel-configs-table .ant-table-tbody {
          margin: 0 !important;
          padding: 0 !important;
        }
        .channel-configs-table .ant-table-tbody > tr {
          margin: 0 !important;
          background: transparent !important;
        }
        .channel-configs-table .ant-table-tbody > tr > td {
          padding: 4px 8px !important;
          font-size: 12px !important;
          border-bottom: 1px solid ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'} !important;
          vertical-align: middle !important;
          line-height: 1.3 !important;
        }
        .channel-configs-table .ant-table-tbody > tr:first-child > td {
          border-top: none !important;
        }
        .channel-configs-table .ant-table-measure-row,
        .channel-configs-table .ant-table-measure-row td,
        .channel-configs-table .ant-table-measure-row th,
        .channel-configs-table tr.ant-table-measure-row,
        .channel-configs-table tr.ant-table-measure-row td,
        .channel-configs-table tr.ant-table-measure-row th,
        .channel-configs-table tr.ant-table-measure-row .ant-table-cell {
          padding: 0 !important;
          height: 0 !important;
          font-size: 0 !important;
          line-height: 0 !important;
          border: none !important;
          visibility: hidden !important;
        }
        .channel-configs-table .ant-table-tbody > tr:hover > td {
          background: ${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'} !important;
        }
        .channel-configs-table .ant-table-pagination.ant-pagination {
          margin: 10px 0 0 0 !important;
        }
        .channel-table-action-btn {
          width: 22px !important;
          height: 22px !important;
          min-width: 22px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 4px !important;
          font-size: 12px !important;
        }
        .channel-table-action-btn:hover {
          background: ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} !important;
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, fontSize: screens.xs ? 18 : 20, fontWeight: 600 }}>上游渠道配置预设</Title>
        <Space wrap>
          <Segmented
            options={[
              { label: `全部 (${configs.length})`, value: 'all' },
              { label: `激活 (${configs.filter(c => (c.status ?? 1) === 1).length})`, value: '1' },
              { label: `已禁用 (${configs.filter(c => (c.status ?? 1) === 0).length})`, value: '0' },
            ]}
            value={statusFilter === 'all' ? 'all' : statusFilter.toString()}
            onChange={(val) => setStatusFilter(val === 'all' ? 'all' : parseInt(val as string, 10))}
          />
          <Input.Search
            placeholder="名称、YID或服务商"
            allowClear
            onSearch={setSearchText}
            onChange={(e) => !e.target.value && setSearchText('')}
            style={{ width: screens.xs ? '100%' : 220 }}
          />
          <Button
            icon={<CheckSquareOutlined />}
            type={isBatchEditMode ? 'primary' : 'default'}
            danger={isBatchEditMode}
            onClick={() => {
              setIsBatchEditMode(!isBatchEditMode);
              if (isBatchEditMode) setSelectedRowKeys([]);
            }}
          >
            {isBatchEditMode ? '退出选择' : '选择编辑'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加配置</Button>
        </Space>
      </div>

      <div style={{
        backgroundColor: isLight ? '#fafafa' : '#141414',
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 16,
        border: isLight ? '1px solid #e8e8e8' : '1px solid #303030',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: 0 }}>
          <Text type="secondary" style={{ width: 80, flexShrink: 0, fontSize: 13 }}>上游分类</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexGrow: 1 }}>
            {([
              { key: 'all' as const, label: '全部', count: configs.length },
              ...categories.map(c => ({
                key: c.id,
                label: c.name,
                count: configs.filter(ch => ch.category_id === c.id).length,
              })),
              {
                key: 'unclassified' as const,
                label: '未分类',
                count: configs.filter(ch => !ch.category_id).length,
              },
            ] as { key: number | 'all' | 'unclassified'; label: string; count: number }[]).map(item => {
              const selected = categoryFilter === item.key;
              return (
                <div
                  key={String(item.key)}
                  onClick={() => setCategoryFilter(item.key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 16,
                    fontSize: 14,
                    backgroundColor: selected ? '#1677ff' : (isLight ? '#f0f0f0' : '#1d1d1d'),
                    color: selected ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                    border: isLight ? '1px solid #d9d9d9' : '1px solid #303030',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s',
                  }}
                >
                  {item.label}
                  <span style={{ opacity: 0.6 }}>{item.count}</span>
                </div>
              );
            })}
            <Tooltip title={t('common.manage', '管理')}>
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined style={{ color: '#1677ff' }} />}
                onClick={() => setIsCategoryManagerVisible(true)}
                style={{ marginLeft: 8 }}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {isBatchEditMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 14px',
          marginBottom: 12,
          borderRadius: 8,
          backgroundColor: isLight ? '#e6f4ff' : '#111b26',
          border: isLight ? '1px solid #91caff' : '1px solid #154173',
        }}>
          <Space wrap size={10} style={{ alignItems: 'center' }}>
            <Button
              size="small"
              onClick={() => {
                const ids = displayedConfigs.map(c => c.id);
                setSelectedRowKeys(prev => Array.from(new Set([...prev.map(k => Number(k)), ...ids])));
              }}
            >
              全选
            </Button>
            <Button size="small" disabled={selectedRowKeys.length === 0} onClick={() => setSelectedRowKeys([])}>
              取消选择
            </Button>
            <Text strong style={{ fontSize: 13, color: isLight ? '#0958d9' : '#1677ff', marginLeft: 4 }}>
              已选择 <span style={{ fontSize: 15, fontWeight: 700 }}>{selectedRowKeys.length}</span> 项
            </Text>
          </Space>
          <Space wrap size={8}>
            <Select
              key={batchCategoryKey}
              size="small"
              placeholder="修改分类"
              style={{ width: 140 }}
              disabled={selectedRowKeys.length === 0 || batchLoading}
              options={[
                { label: '未分类', value: 0 },
                ...activeCategories.map(c => ({ label: c.name, value: c.id })),
              ]}
              onChange={(value) => {
                handleBatchChangeCategory(value === 0 ? null : value);
                setBatchCategoryKey(k => k + 1);
              }}
            />
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} disabled={selectedRowKeys.length === 0} loading={batchLoading} onClick={() => handleBatchChangeStatus(1)}>
              激活
            </Button>
            <Button size="small" icon={<StopOutlined />} disabled={selectedRowKeys.length === 0} loading={batchLoading} onClick={() => handleBatchChangeStatus(0)}>
              禁用
            </Button>
            <Popconfirm
              title="确定要批量删除选中的上游渠道吗？"
              description={`将一次性删除选中的 ${selectedRowKeys.length} 个上游渠道，此操作不可撤销。`}
              onConfirm={handleBatchDelete}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: batchLoading }}
              disabled={selectedRowKeys.length === 0}
            >
              <Button size="small" danger type="primary" icon={<DeleteOutlined />} disabled={selectedRowKeys.length === 0} loading={batchLoading}>
                批量删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      {screens.xs ? (
        <MobileCardList
          dataSource={displayedConfigs}
          loading={loading}
          rowKey="id"
          pagination={listPagination()}
          renderCard={(record: ChannelConfig) => {
            const sync = renderUpstreamSyncInline(record);
            return (
            <MobileCard
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isBatchEditMode && (
                    <Checkbox
                      checked={batchChecked(record.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggleBatchKey(record.id, e.target.checked)}
                    />
                  )}
                  <span>{record.name}</span>
                </div>
              }
              extra={<Typography.Text keyboard style={{ color: '#1677ff' }}>{record.yid || '-'}</Typography.Text>}
            >
              {sync ? <CardRow label="上游同步">{sync}</CardRow> : null}
              <CardRow label="状态">{renderStatusBadge(record.status)}</CardRow>
              <CardRow label="上游分类">{resolveCategoryName(record.category_id) || '未分类'}</CardRow>
              <CardRow label="绑定渠道分组">
                {record.bound_channel_count && record.bound_channel_count > 0 ? (
                  <Tag color="processing" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                    {record.bound_channel_count} 个模型渠道分组
                  </Tag>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>未绑定</Text>
                )}
              </CardRow>
              <CardRow label="服务商广场展示">{record.provider_type || '-'}</CardRow>
              <CardRow label="Base URL"><Text code style={{ fontSize: 12 }}>{record.base_url}</Text></CardRow>
              <CardRow label="额度">{renderQuotaCell(record)}</CardRow>
              <CardRow label="最新更新时间">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {record.updated_at || record.created_at ? formatApiDateTime(record.updated_at || record.created_at) : '-'}
                </Text>
              </CardRow>
              <CardRow label="备注">{record.remark || '-'}</CardRow>
              <CardActions>
                <Tooltip title={(record.status ?? 1) === 1 ? '点击禁用' : '点击启用'}>
                  <Button
                    type="text"
                    size="small"
                    icon={(record.status ?? 1) === 1
                      ? <PlayCircleOutlined style={{ color: '#52c41a' }} />
                      : <StopOutlined style={{ color: '#ff4d4f' }} />}
                    onClick={() => handleToggleStatus(record)}
                  />
                </Tooltip>
                <Tooltip title="清零额度">
                  <Popconfirm title="确定清零已用额度吗？" onConfirm={() => handleResetQuota(record.id)}>
                    <Button type="text" size="small" icon={<ClearOutlined />} />
                  </Popconfirm>
                </Tooltip>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record.id)}>
                  <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </CardActions>
            </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          className="channel-configs-table compact-table"
          size="small"
          dataSource={displayedConfigs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={listPagination()}
          scroll={{ x: 1480 }}
          rowSelection={isBatchEditMode ? {
            selectedRowKeys,
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelectedRowKeys(keys),
          } : undefined}
          onChange={(_p, _f, sorter) => {
            const s = Array.isArray(sorter) ? sorter[0] : sorter;
            if (s?.order && s.columnKey) setQuotaSortOrder(null);
          }}
        />
      )}

      <Modal
        title={editingConfig ? "编辑上游渠道配置" : "添加上游渠道配置"}
        open={isModalVisible}
        onCancel={closeConfigModal}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        width={560}
        styles={{ body: { paddingTop: 12, paddingBottom: 4 } }}
      >
        <Form
          form={form}
          layout="vertical"
          size="small"
          onFinish={handleSave}
          autoComplete="off"
          style={{ marginBottom: 0 }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item
              name="name"
              label={
                <Space size={6}>
                  <span>配置名称</span>
                  {editingConfig?.yid && (
                    <Text type="secondary" style={{ fontSize: 11 }}>YID: {editingConfig.yid}</Text>
                  )}
                </Space>
              }
              rules={[{ required: true, message: '请输入配置名称' }]}
              style={{ flex: 1.4, marginBottom: 10 }}
            >
              <Input placeholder="例如：OpenAI 官方渠道" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="provider_type"
              label="服务商类型(模型广场展示)"
              style={{ flex: 1, marginBottom: 10 }}
            >
              <Input placeholder="如: custom / openai" autoComplete="off" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Form.Item name="category_id" label="上游分类" style={{ flex: 1, marginBottom: 10 }}>
              <Select
                allowClear
                placeholder="选择分类"
                options={activeCategories.map(c => ({ label: c.name, value: c.id }))}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '6px 0' }} />
                    <Button
                      type="link"
                      size="small"
                      icon={<SettingOutlined />}
                      onClick={() => setIsCategoryManagerVisible(true)}
                      style={{ width: '100%' }}
                    >
                      管理分类
                    </Button>
                  </>
                )}
              />
            </Form.Item>
            <Form.Item
              name="sort_order"
              label={
                <Tooltip title="数字越大在页面中越靠前">
                  <span>页面排序</span>
                </Tooltip>
              }
              style={{ width: 96, marginBottom: 10 }}
            >
              <InputNumber placeholder="0" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="rate" label="渠道倍率" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 10 }}>
              <InputNumber min={0} step={0.0001} precision={4} placeholder="1.0000" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 10 }}>
              <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="weight" label="权重" rules={[{ required: true }]} style={{ flex: 1, marginBottom: 10 }}>
              <InputNumber min={1} placeholder="1" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item label="额度限额" style={{ marginBottom: 10 }}>
            <Switch
              checked={enableQuota}
              onChange={(checked) => {
                setEnableQuota(checked);
                form.setFieldsValue({
                  quota_limit: -1,
                  daily_quota_limit: -1,
                  weekly_quota_limit: -1,
                  monthly_quota_limit: -1,
                });
              }}
              checkedChildren="已开启限额"
              unCheckedChildren="默认不限额"
            />
          </Form.Item>

          <Form.Item name="daily_reset_hour" hidden initialValue={0}><InputNumber /></Form.Item>
          <Form.Item name="daily_reset_minute" hidden initialValue={0}><InputNumber /></Form.Item>
          <Form.Item name="daily_reset_cooldown_minutes" hidden initialValue={0}><InputNumber /></Form.Item>

          {enableQuota && (
            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) =>
                prev.quota_limit !== curr.quota_limit ||
                prev.daily_quota_limit !== curr.daily_quota_limit ||
                prev.weekly_quota_limit !== curr.weekly_quota_limit ||
                prev.monthly_quota_limit !== curr.monthly_quota_limit ||
                prev.daily_reset_hour !== curr.daily_reset_hour ||
                prev.daily_reset_minute !== curr.daily_reset_minute ||
                prev.daily_reset_cooldown_minutes !== curr.daily_reset_cooldown_minutes
              }
            >
              {() => {
                const quotaDeps = ['quota_limit', 'daily_quota_limit', 'weekly_quota_limit', 'monthly_quota_limit'] as const;
                const fieldValidator = (field: typeof quotaDeps[number]) => ({
                  validator: async (_: unknown, value: number | null) => {
                    if (value != null && Number(value) < -1) {
                      throw new Error('额度不能小于 -1');
                    }
                    const latest = {
                      ...form.getFieldsValue([...quotaDeps]),
                      [field]: value,
                    };
                    const total = latest.quota_limit;
                    const day = latest.daily_quota_limit;
                    const week = latest.weekly_quota_limit;
                    const month = latest.monthly_quota_limit;

                    const fail = (msg: string) => {
                      throw new Error(msg);
                    };

                    if (field === 'daily_quota_limit' && isFiniteQuotaLimit(day)) {
                      if (isFiniteQuotaLimit(week) && day > week) fail('日额度不能大于周额度');
                      if (isFiniteQuotaLimit(month) && day > month) fail('日额度不能大于月额度');
                      if (isFiniteQuotaLimit(total) && day > total) fail('日额度不能大于总额度');
                    }
                    if (field === 'weekly_quota_limit' && isFiniteQuotaLimit(week)) {
                      if (isFiniteQuotaLimit(month) && week > month) fail('周额度不能大于月额度');
                      if (isFiniteQuotaLimit(total) && week > total) fail('周额度不能大于总额度');
                      if (isFiniteQuotaLimit(day) && day > week) fail('周额度不能小于日额度');
                    }
                    if (field === 'monthly_quota_limit' && isFiniteQuotaLimit(month)) {
                      if (isFiniteQuotaLimit(total) && month > total) fail('月额度不能大于总额度');
                      if (isFiniteQuotaLimit(week) && week > month) fail('月额度不能小于周额度');
                      if (isFiniteQuotaLimit(day) && day > month) fail('月额度不能小于日额度');
                    }
                    if (field === 'quota_limit' && isFiniteQuotaLimit(total)) {
                      if (isFiniteQuotaLimit(month) && month > total) fail('总额度不能小于月额度');
                      if (isFiniteQuotaLimit(week) && week > total) fail('总额度不能小于周额度');
                      if (isFiniteQuotaLimit(day) && day > total) fail('总额度不能小于日额度');
                    }
                  },
                });
                const quotaItemStyle: React.CSSProperties = { marginBottom: 10 };
                const resetHour = Number(form.getFieldValue('daily_reset_hour') ?? 0);
                const resetMinute = Number(form.getFieldValue('daily_reset_minute') ?? 0);
                const resetCooldown = Number(form.getFieldValue('daily_reset_cooldown_minutes') ?? 0);
                const tzSuffix = timedisplayOffsetSuffix(quotaTz);
                const resetInline = formatDailyResetInline(resetHour, resetMinute, resetCooldown, tzSuffix);
                const hh = String(Math.min(23, Math.max(0, resetHour))).padStart(2, '0');
                const mm = String(Math.min(59, Math.max(0, resetMinute))).padStart(2, '0');
                const resetTooltip = resetCooldown > 0
                  ? `每天 ${hh}:${mm}${tzSuffix} 起，再冷却 ${resetCooldown} 分钟后清零日已用`
                  : `每天 ${hh}:${mm}${tzSuffix} 清零日已用`;
                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      columnGap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <Form.Item
                      name="quota_limit"
                      label="总额度"
                      initialValue={-1}
                      style={quotaItemStyle}
                      dependencies={quotaDeps as unknown as string[]}
                      validateTrigger={['onChange', 'onBlur']}
                      rules={[fieldValidator('quota_limit')]}
                    >
                      <InputNumber
                        min={-1}
                        style={{ width: '100%' }}
                        formatter={formatQuotaLimitDisplay}
                        parser={parseQuotaLimitInput}
                      />
                    </Form.Item>
                    <Form.Item
                      name="monthly_quota_limit"
                      label="月额度"
                      initialValue={-1}
                      style={quotaItemStyle}
                      dependencies={quotaDeps as unknown as string[]}
                      validateTrigger={['onChange', 'onBlur']}
                      rules={[fieldValidator('monthly_quota_limit')]}
                    >
                      <InputNumber
                        min={-1}
                        style={{ width: '100%' }}
                        formatter={formatQuotaLimitDisplay}
                        parser={parseQuotaLimitInput}
                      />
                    </Form.Item>
                    <Form.Item
                      name="weekly_quota_limit"
                      label="周额度"
                      initialValue={-1}
                      style={quotaItemStyle}
                      dependencies={quotaDeps as unknown as string[]}
                      validateTrigger={['onChange', 'onBlur']}
                      rules={[fieldValidator('weekly_quota_limit')]}
                    >
                      <InputNumber
                        min={-1}
                        style={{ width: '100%' }}
                        formatter={formatQuotaLimitDisplay}
                        parser={parseQuotaLimitInput}
                      />
                    </Form.Item>
                    <Form.Item
                      name="daily_quota_limit"
                      label={
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            maxWidth: '100%',
                            verticalAlign: 'middle',
                          }}
                        >
                          <span>日额度</span>
                          <Tooltip title={resetTooltip}>
                            <Text
                              type="secondary"
                              style={{
                                fontSize: 11,
                                fontWeight: 400,
                                lineHeight: 1.2,
                                maxWidth: 148,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {resetInline}
                            </Text>
                          </Tooltip>
                          <Tooltip title="配置日额度刷新时间与冷却">
                            <Button
                              type="link"
                              size="small"
                              icon={<SettingOutlined />}
                              aria-label="配置日额度刷新"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openDailyResetModal();
                              }}
                              style={{
                                padding: 0,
                                width: 18,
                                height: 18,
                                minWidth: 18,
                                lineHeight: '18px',
                                flexShrink: 0,
                              }}
                            />
                          </Tooltip>
                        </span>
                      }
                      initialValue={-1}
                      style={quotaItemStyle}
                      dependencies={quotaDeps as unknown as string[]}
                      validateTrigger={['onChange', 'onBlur']}
                      rules={[fieldValidator('daily_quota_limit')]}
                    >
                      <InputNumber
                        min={-1}
                        style={{ width: '100%' }}
                        formatter={formatQuotaLimitDisplay}
                        parser={parseQuotaLimitInput}
                      />
                    </Form.Item>
                  </div>
                );
              }}
            </Form.Item>
          )}

          <Form.Item name="base_url" label="端点基础地址 (Base URL)" rules={[{ required: true }]} style={{ marginBottom: 10 }}>
            <AutoComplete
              options={[
                { value: 'https://ark.cn-beijing.volces.com', label: '火山方舟 (https://ark.cn-beijing.volces.com)' },
                { value: 'https://ark.ap-southeast.bytepluses.com/api/v3', label: 'BytePlus(ap-southeast-1) (https://ark.ap-southeast.bytepluses.com/api/v3)' },
                { value: 'https://ark.eu-west.bytepluses.com/api/v3', label: 'BytePlus(eu-west-1) (https://ark.eu-west.bytepluses.com/api/v3)' },
                { value: 'https://api-beijing.klingai.com', label: '可灵 (https://api-beijing.klingai.com)' },
                { value: 'https://dashscope.aliyuncs.com', label: '阿里百炼 (https://dashscope.aliyuncs.com)' },
                { value: 'https://vod.tencentcloudapi.com', label: '腾讯云 VOD AIGC (https://vod.tencentcloudapi.com)' },
                { value: 'https://visual.volcengineapi.com', label: '即梦AI/火山CV (https://visual.volcengineapi.com)' },
              ]}
              placeholder="选择预设或自由输入"
              filterOption={(inputValue, option) =>
                String(option?.label || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1 ||
                String(option?.value || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="请求鉴权密钥 (API Key)"
            style={{ marginBottom: 10 }}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={editingConfig ? '保持当前密钥或输入新值覆盖' : 'API Key / sk-... / access_key:secret_key'}
            />
          </Form.Item>
          <Form.Item name="upstream_system" label="上游系统" style={{ marginBottom: 10 }}>
            <Select
              allowClear
              placeholder="可选"
              options={UPSTREAM_SYSTEM_OPTIONS}
              onChange={(val) => {
                form.setFieldsValue({ upstream_system: val });
                if (val === 'newapi') {
                  const defaultSiteCurrency = settings?.currency?.default_currency || 'USD';
                  if (!form.getFieldValue('upstream_currency')) {
                    form.setFieldsValue({ upstream_currency: 'CNY' });
                  }
                  if (!form.getFieldValue('site_currency')) {
                    form.setFieldsValue({ site_currency: defaultSiteCurrency });
                  }
                  if (!form.getFieldValue('upstream_currency_rate')) {
                    form.setFieldsValue({ upstream_currency_rate: 7.2 });
                  }
                  const bUrl = form.getFieldValue('base_url');
                  if (bUrl) {
                    loadUpstreamGroups(undefined, true);
                  }
                }
              }}
            />
          </Form.Item>
          {upstreamSystem === 'newapi' && (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Form.Item
                  name="upstream_group"
                  label="同步分组倍率"
                  extra="选中后写入上方「渠道倍率」"
                  style={{ flex: 1, marginBottom: 10 }}
                >
                  <Select
                    allowClear
                    showSearch
                    placeholder={upstreamGroups.length ? '选择要同步的分组' : '先拉取分组倍率'}
                    optionFilterProp="label"
                    onChange={(value) => {
                      form.setFieldsValue({ upstream_group: value || '' });
                      updateCalculatedRate(value || undefined);
                    }}
                    options={
                      upstreamGroups.length
                        ? upstreamGroups.map(g => ({
                            value: g.name,
                            label: `${g.name}  ${g.ratio}x${g.label && g.label !== g.name ? `  ${g.label}` : ''}`,
                          }))
                        : (form.getFieldValue('upstream_group')
                            ? [{ value: form.getFieldValue('upstream_group'), label: form.getFieldValue('upstream_group') }]
                            : [])
                    }
                  />
                </Form.Item>
                <Form.Item label=" " style={{ marginBottom: 10, width: 118 }}>
                  <Button
                    icon={<SyncOutlined spin={fetchingGroups} />}
                    loading={fetchingGroups}
                    onClick={() => loadUpstreamGroups(undefined, false)}
                    style={{ width: '100%' }}
                  >
                    拉取分组
                  </Button>
                </Form.Item>
              </div>
              <div
                style={{
                  background: isLight ? '#f9fafb' : '#141414',
                  border: isLight ? '1px solid #f0f0f0' : '1px solid #303030',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: isLight ? '#262626' : '#d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>计价货币换算设置</span>
                  <Tooltip title="针对 NewAPI 上游以人民币定价（如 GPT 3倍率 代表 3元/刀）或美元定价，折算为本站对应货币实际倍率/折扣">
                    <span style={{ fontSize: 12, fontWeight: 'normal', color: '#1890ff', cursor: 'pointer' }}>
                      换算说明
                    </span>
                  </Tooltip>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: screens.xs ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                  <Form.Item
                    name="upstream_currency"
                    label="上游计价货币"
                    style={{ marginBottom: 6 }}
                  >
                    <Select
                      options={UPSTREAM_CURRENCY_OPTIONS}
                      style={{ width: '100%' }}
                      onChange={(val) => {
                        form.setFieldsValue({ upstream_currency: val });
                        updateCalculatedRate(undefined, undefined, val);
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="site_currency"
                    label="本站计价货币"
                    style={{ marginBottom: 6 }}
                  >
                    <Select
                      options={SITE_CURRENCY_OPTIONS}
                      style={{ width: '100%' }}
                      onChange={(val) => {
                        form.setFieldsValue({ site_currency: val });
                        updateCalculatedRate(undefined, undefined, undefined, val);
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="upstream_currency_rate"
                    label="换算汇率"
                    tooltip="上游货币兑换本站货币的汇率，例如 1 USD = 7.2 CNY 时填 7.2"
                    style={{ marginBottom: 6 }}
                  >
                    <InputNumber
                      min={0.0001}
                      step={0.1}
                      precision={4}
                      placeholder="如 7.2000"
                      style={{ width: '100%' }}
                      onChange={(val) => {
                        const num = Number(val);
                        const validRate = Number.isFinite(num) && num > 0 ? num : 7.2;
                        form.setFieldsValue({ upstream_currency_rate: val });
                        updateCalculatedRate(undefined, undefined, undefined, undefined, validRate);
                      }}
                    />
                  </Form.Item>
                </div>
                {/* 实时公式与核算预览 */}
                {(() => {
                  const uCurr = (upstreamCurrency || '').trim().toUpperCase();
                  const sCurr = (siteCurrency || '').trim().toUpperCase();
                  const cRate = Number(upstreamCurrencyRate) > 0 ? Number(upstreamCurrencyRate) : 7.2;
                  const currentGroup = upstreamGroup ? upstreamGroups.find(g => g.name === upstreamGroup) : null;
                  const sampleRatio = currentGroup ? currentGroup.ratio : (selectedGroupRatio ?? 3.0);
                  const addVal = syncAddEnabled ? Number(upstreamSyncRateAdd || 0) : 0;
                  const converted = convertCurrencyRatio(sampleRatio, uCurr, sCurr, cRate);
                  const finalSample = Math.max(0, converted + addVal);
                  const finalFormatted = (Math.round(finalSample * 10000) / 10000).toFixed(4);
                  const isCnyToUsd = (uCurr === 'CNY' || uCurr === 'RMB' || uCurr === '人民币') && (sCurr === 'USD' || sCurr === '美元');
                  const isUsdToCny = (sCurr === 'CNY' || sCurr === 'RMB' || sCurr === '人民币') && (uCurr === 'USD' || uCurr === '美元');

                  return (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        background: isLight ? '#f0f5ff' : '#111d2c',
                        border: isLight ? '1px solid #d6e4ff' : '1px solid #1d39c4',
                        borderRadius: 6,
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: isLight ? '#1d39c4' : '#adc6ff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>换算规则：</span>
                        <span>
                          {isCnyToUsd ? (
                            `上游 RMB 倍率 ÷ 汇率 (${cRate}) = 本站 USD 折扣倍率`
                          ) : isUsdToCny ? (
                            `上游 USD 倍率 × 汇率 (${cRate}) = 本站 CNY 倍率`
                          ) : !uCurr || !sCurr || uCurr === sCurr ? (
                            '上游与本站币种一致，按 1:1 原样继承，无需换算'
                          ) : (
                            `上游倍率 ÷ 汇率 (${cRate}) = 本站折算倍率`
                          )}
                        </span>
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>
                          {currentGroup ? `分组核算 (${currentGroup.name})：` : (upstreamGroup ? `分组核算 (${upstreamGroup})：` : '核算预览：')}
                        </span>
                        <span>
                          {sampleRatio}x
                          {isCnyToUsd ? ` ÷ ${cRate} = ` : isUsdToCny ? ` × ${cRate} = ` : ' = '}
                          <strong>{converted.toFixed(4)}x</strong>
                        </span>
                        {isCnyToUsd && (
                          <Tag color="blue" style={{ margin: 0, padding: '0 5px', fontSize: 11, height: 20, lineHeight: '18px', borderRadius: 4 }}>
                            相当于官方 {(converted * 10).toFixed(2)} 折
                          </Tag>
                        )}
                        {addVal > 0 && (
                          <Tag color="orange" style={{ margin: 0, padding: '0 5px', fontSize: 11, height: 20, lineHeight: '18px', borderRadius: 4 }}>
                            ＋增量 {addVal} ➔ 最终 {finalFormatted}x
                          </Tag>
                        )}
                        <Tag
                          color="green"
                          style={{ margin: 0, padding: '0 6px', fontSize: 11, height: 20, lineHeight: '18px', borderRadius: 4, cursor: 'pointer' }}
                          onClick={() => updateCalculatedRate()}
                          title="点击可重新触发写入上方渠道倍率"
                        >
                          已实时更新到渠道倍率: {finalFormatted}x
                        </Tag>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Form.Item
                  name="upstream_sync_interval_minutes"
                  label="同步间隔（分钟）"
                  extra="0 为不自动同步"
                  style={{ flex: 1, marginBottom: 10 }}
                >
                  <InputNumber min={0} max={10080} precision={0} placeholder="0" style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label="同步后叠加增量" style={{ flex: 1, marginBottom: 10 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', paddingRight: 8 }}>
                      <Switch
                        size="small"
                        checked={syncAddEnabled}
                        onChange={(checked) => {
                          setSyncAddEnabled(checked);
                          const nextAdd = checked ? Number(form.getFieldValue('upstream_sync_rate_add') || 0) : 0;
                          if (!checked) form.setFieldsValue({ upstream_sync_rate_add: 0 });
                          updateCalculatedRate(undefined, nextAdd, undefined, undefined, undefined, checked);
                        }}
                      />
                    </div>
                    <Form.Item name="upstream_sync_rate_add" noStyle>
                      <InputNumber
                        min={0}
                        step={0.01}
                        precision={4}
                        disabled={!syncAddEnabled}
                        placeholder="0"
                        style={{ width: '100%' }}
                        onChange={(value) => {
                          const add = Number(value) || 0;
                          form.setFieldsValue({ upstream_sync_rate_add: add });
                          updateCalculatedRate(undefined, add);
                        }}
                      />
                    </Form.Item>
                  </Space.Compact>
                </Form.Item>
              </div>
            </>
          )}
          <Form.Item
            name="remark"
            label={
              <Tooltip title="记录渠道归属、适用场景等，方便查阅">
                <span>备注说明</span>
              </Tooltip>
            }
            style={{ marginBottom: 10 }}
          >
            <Input.TextArea rows={1} placeholder="例如：图片生成主通道..." autoSize={{ minRows: 1, maxRows: 3 }} />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            initialValue={1}
            valuePropName="checked"
            getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}
            getValueProps={(value) => ({ checked: value !== 0 })}
            style={{ marginBottom: 0 }}
          >
            <Switch checkedChildren={t('common.active')} unCheckedChildren={t('common.disabled')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="日额度刷新设置"
        open={dailyResetModalOpen}
        onCancel={() => setDailyResetModalOpen(false)}
        onOk={saveDailyResetModal}
        okText="保存"
        cancelText="取消"
        width={360}
        destroyOnHidden
        getContainer={() => document.body}
        zIndex={1100}
      >
        <Form layout="vertical" size="small" style={{ marginTop: 8 }}>
          <Form.Item
            label={`每天刷新时间点${timedisplayOffsetSuffix(quotaTz)}`}
            style={{ marginBottom: 12 }}
          >
            <TimePicker
              format="HH:mm"
              allowClear={false}
              style={{ width: '100%' }}
              getPopupContainer={(node) => node.parentElement || document.body}
              value={dayjs().hour(dailyResetDraft.hour).minute(dailyResetDraft.minute).second(0)}
              onChange={(t) => {
                setDailyResetDraft((prev) => ({
                  ...prev,
                  hour: t ? t.hour() : 0,
                  minute: t ? t.minute() : 0,
                }));
              }}
            />
          </Form.Item>
          <Form.Item
            label="刷新冷却（分钟）"
            extra="到达时间点后再等待该时长才清零日已用"
            style={{ marginBottom: 8 }}
          >
            <InputNumber
              min={0}
              max={1440}
              placeholder="0"
              style={{ width: '100%' }}
              addonAfter="分钟"
              value={dailyResetDraft.cooldown}
              onChange={(v) => setDailyResetDraft((prev) => ({
                ...prev,
                cooldown: v == null ? 0 : Number(v),
              }))}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 11 }}>
            按站点默认时区计算（非系统运行时区）；默认 00:00 / 冷却 0 即自然日刷新
          </Text>
        </Form>
      </Modal>

      <ChannelCategoryManager
        visible={isCategoryManagerVisible}
        onClose={() => setIsCategoryManagerVisible(false)}
        onUpdate={fetchCategories}
      />
    </Card>
  );
};

export default ChannelConfigs;
