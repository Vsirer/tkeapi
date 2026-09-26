/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useEffect, useState, useMemo, startTransition } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Select, Progress, Grid, Radio, Tabs, Timeline, Row, Col, Tooltip, DatePicker, Statistic, Spin, Switch, Alert, Checkbox, App, theme } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { listPagination } from '../../components/ListPagination';
import ModelSelector from '../../components/ModelSelector';
import WalletBalanceDisplay from '../../components/WalletBalanceDisplay';
import WalletDetailsView from '../../components/WalletDetailsView';
import UserKycListManager from '../../components/UserKycListManager';
import { KYC_STATUS_META } from '../../components/UserKycFormFields';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, WalletOutlined, LoginOutlined, ArrowLeftOutlined, CloseOutlined, SearchOutlined, IdcardOutlined, CheckSquareOutlined, CheckCircleOutlined, StopOutlined, CreditCardOutlined, SettingOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import request from '../../utils/request';

const TAB_KEY_TO_SLUG: Record<string, string> = {
  '1': 'basic',
  '2': 'detail',
  '3': 'binding',
  '5': 'payment',
  '4': 'discount',
  '6': 'kyc',
  '7': 'invoices',
};

const SLUG_TO_TAB_KEY: Record<string, string> = {
  basic: '1',
  '1': '1',
  detail: '2',
  '2': '2',
  binding: '3',
  bind: '3',
  '3': '3',
  payment: '5',
  pay: '5',
  '5': '5',
  discount: '4',
  '4': '4',
  kyc: '6',
  '6': '6',
  invoices: '7',
  invoice: '7',
  '7': '7',
};
import useSettingsStore from '../../store/settings';
import { useThemeStore } from '../../store/theme';
import generateUUID from '../../utils/uuid';

import type { User, UserKyc, UserKycStatus } from '../../types';
import dayjs from 'dayjs';
import { formatApiDateTime } from '../../utils/timedisplay';
import { toAbsoluteDateParam } from '../../utils/dateRangeParams';
import { Resizable } from 'react-resizable';
import type { ResizeCallbackData } from 'react-resizable';

const ResizableTitle = (props: any) => {
  const { onResize, width, ...restProps } = props;
  const thRef = React.useRef<HTMLTableCellElement>(null);

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            zIndex: 1,
            width: '10px',
            height: '100%',
            cursor: 'col-resize',
            display: 'block'
          }}
        />
      }
      onResize={(e, { size }) => {
        // Bypass React state for 60fps native performance during dragging
        if (thRef.current) {
          const index = Array.from(thRef.current.parentNode!.children).indexOf(thRef.current);
          const tableContainer = thRef.current.closest('.ant-table');
          if (tableContainer) {
            const colgroups = tableContainer.querySelectorAll('colgroup');
            colgroups.forEach(cg => {
              const col = cg.children[index] as HTMLElement;
              if (col) {
                col.style.width = `${Math.max(size.width, 80)}px`;
                col.style.minWidth = `${Math.max(size.width, 80)}px`;
              }
            });
          }
        }
      }}
      onResizeStop={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th ref={thRef} {...restProps} style={{ ...restProps.style, position: 'relative' }} />
    </Resizable>
  );
};

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

// Helper: check if email is a real user-bound email (not a placeholder)
const isRealEmail = (email?: string) => !!email && !email.endsWith('@tokensbyte.local');

type ContactKind = 'email' | 'mobile';
type ClickFilterKind = ContactKind | 'ip';
type ContactFilter = { kind: ClickFilterKind; value: string };
type ContactBindInfo = {
  kind: ContactKind;
  value: string;
  bound_count: number;
  limit: number;
  default_limit: number;
  is_override: boolean;
};

/** 超级管理员：role=admin 且未绑定管理员等级 */
const isSuperAdminUser = (user?: Pick<User, 'role' | 'admin_group_id'> | null) =>
  !!user && user.role === 'admin' && !user.admin_group_id;

/** 模型折扣 Tag：悬停一眼看全模型名与倍率（沿用早期友好布局） */
function ModelDiscountHoverTag({
  modelDiscounts,
  models,
  compact,
}: {
  modelDiscounts?: string | null;
  models: any[];
  compact?: boolean;
}) {
  let entries: [string, number][] = [];
  try {
    if (modelDiscounts) entries = Object.entries(JSON.parse(modelDiscounts));
  } catch { /* ignore */ }
  if (!entries.length) return null;

  const tip = (
    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
      {entries.map(([mid, discount]) => {
        const name = models.find((m) => m.mid === mid)?.name || mid;
        return (
          <div key={mid} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0', fontSize: 12 }}>
            <span style={{ opacity: 0.85 }}>{name}</span>
            <span style={{ fontWeight: 500, flexShrink: 0, color: discount < 1 ? '#52c41a' : discount > 1 ? '#ff4d4f' : undefined }}>
              {discount}x
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Tooltip title={tip} placement="right" overlayStyle={{ maxWidth: 360 }}>
      <Tag color="orange" style={{ alignSelf: 'flex-start', marginTop: compact ? 0 : 4, marginInlineEnd: 0, fontSize: 11, cursor: 'default', padding: '0 6px', lineHeight: '20px' }}>
        {compact ? `已设(${entries.length})` : `模型折扣(${entries.length})`}
      </Tag>
    </Tooltip>
  );
}

const KYC_TAG_STYLE: React.CSSProperties = { fontSize: 11, padding: '0 4px', margin: 0, whiteSpace: 'nowrap', cursor: 'pointer' };

function kycListStatus(status?: string | null, approvedFallback?: boolean): UserKycStatus | null {
  if (status && status !== 'none') return status as UserKycStatus;
  if (approvedFallback) return 'approved';
  return null;
}

function KycStatusTags({ record, onOpen }: { record: User; onOpen: () => void }) {
  const openKyc = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen();
  };
  const items: { key: string; typeLabel: string; status: UserKycStatus }[] = [];
  const personal = kycListStatus(record.kyc_personal_status, record.kyc_personal);
  const enterprise = kycListStatus(record.kyc_enterprise_status, record.kyc_enterprise);
  if (personal) items.push({ key: 'personal', typeLabel: '个人', status: personal });
  if (enterprise) items.push({ key: 'enterprise', typeLabel: '企业', status: enterprise });

  if (items.length === 0) {
    return <Tag style={KYC_TAG_STYLE} onClick={openKyc}>未实名</Tag>;
  }
  return (
    <>
      {items.map((item) => {
        const meta = KYC_STATUS_META[item.status] || KYC_STATUS_META.none;
        return (
          <Tag key={item.key} color={meta.color} style={KYC_TAG_STYLE} onClick={openKyc}>
            {item.typeLabel}{meta.label}
          </Tag>
        );
      })}
    </>
  );
}

const Users: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { modal } = App.useApp();
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { actionId, tab: routeTab } = useParams<{ actionId?: string; tab?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab');
  const [userLoading, setUserLoading] = useState(false);
  const loadingUserIdRef = React.useRef<string | null>(null);

  const screens = useBreakpoint();
  const isAdminPage = location.pathname.includes('/admins');
  const targetRole = isAdminPage ? 'admin' : 'user';
  
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const basePath = isAdminPage ? 'admins' : 'users';
  const isInvoiceEnabled = settings?.invoices?.invoice_enabled !== false;
  const isChinaInvoiceMode = settings?.invoices?.invoice_mode === 'china';
  const invoiceBtnTitle = isChinaInvoiceMode ? '增值税开票历史' : '商业发票与付款收据';

  const rawTab = routeTab || queryTab;
  const resolvedTabKey = useMemo(() => {
    if (!rawTab) return '1';
    return SLUG_TO_TAB_KEY[rawTab.toLowerCase()] || rawTab;
  }, [rawTab]);
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userLevels, setUserLevels] = useState<any[]>([]);
  const [adminGroups, setAdminGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isRechargeModalVisible, setIsRechargeModalVisible] = useState(false);
  const [rechargingUser, setRechargingUser] = useState<User | null>(null);
  const [rechargeLoading, setRechargeLoading] = useState(false);

  const [walletTimeFilter, setWalletTimeFilter] = useState<'all' | 'month'>(() => {
    return (localStorage.getItem('walletTimeFilter') as 'all' | 'month') || 'month';
  });
  const [monthConsumptionMap, setMonthConsumptionMap] = useState<Record<string, { system_cost: number; gift_cost: number }>>({});
  const [isBatchEditMode, setIsBatchEditMode] = useState<boolean>(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchLoading, setBatchLoading] = useState<boolean>(false);

  useEffect(() => {
    if (users.length === 0 || walletTimeFilter !== 'month') {
      setMonthConsumptionMap({});
      return;
    }
    const userIds = users.map(u => u.id);
    request.post('/users/consumption/stats_batch', {
      user_ids: userIds,
      start_date: toAbsoluteDateParam(dayjs().startOf('month')),
      end_date: toAbsoluteDateParam(dayjs().endOf('month'), true),
    }, { skipErrorHandler: true } as any).then((res: any) => {
      setMonthConsumptionMap(res || {});
    }).catch((e) => {
      console.error('Failed to fetch month consumption stats', e);
      setMonthConsumptionMap({});
    });
  }, [walletTimeFilter, users]);

  const [columnsWidths, setColumnsWidths] = useState<Record<string, number>>({
    uid: 100,
    username: 320,
    registration_info: 280,
    user_group: 150,
    balance: 320,
    actions: 120,
  });

  const handleResize = (key: string) => (_e: React.SyntheticEvent<Element>, { size }: ResizeCallbackData) => {
    setColumnsWidths((prev) => ({ ...prev, [key]: Math.max(size.width, 80) }));
  };
  const [searchText, setSearchText] = useState('');
  const [contactFilter, setContactFilter] = useState<ContactFilter | null>(null);
  const [contactBind, setContactBind] = useState<ContactBindInfo | null>(null);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitDraft, setLimitDraft] = useState(5);
  const queryGroupParam = searchParams.get('group') || searchParams.get('user_group') || searchParams.get('level');
  const [filterGroup, setFilterGroup] = useState<string>(() => queryGroupParam || 'all');

  useEffect(() => {
    const qGroup = searchParams.get('group') || searchParams.get('user_group') || searchParams.get('level');
    if (qGroup) {
      if (userLevels.length > 0) {
        const matched = userLevels.find((l: any) => l.group_key === qGroup || String(l.id) === qGroup);
        if (matched) {
          setFilterGroup(matched.group_key);
          return;
        }
      }
      setFilterGroup(qGroup);
    } else {
      setFilterGroup('all');
    }
  }, [searchParams, userLevels]);

  const handleFilterGroupChange = (val: string) => {
    setFilterGroup(val);
    const newParams = new URLSearchParams(searchParams);
    if (val && val !== 'all') {
      newParams.set('group', val);
      newParams.delete('user_group');
      newParams.delete('level');
    } else {
      newParams.delete('group');
      newParams.delete('user_group');
      newParams.delete('level');
    }
    setSearchParams(newParams, { replace: true });
  };

  const [filterReferrer, setFilterReferrer] = useState('');
  /** 排序：default / 系统钱包余额 / 赠送钱包余额 / 信控额度 / 消费合计 */
  const [listSort, setListSort] = useState<'default' | 'balance_desc' | 'balance_asc' | 'gift_balance_desc' | 'gift_balance_asc' | 'credit_limit_desc' | 'credit_limit_asc' | 'consumption_desc' | 'consumption_asc'>('default');
  const [form] = Form.useForm();
  const [rechargeForm] = Form.useForm();
  const rechargeActionType = Form.useWatch('actionType', rechargeForm);
  const rechargeWalletType = Form.useWatch('walletType', rechargeForm) || 'system';

  // ── 钱包明细弹窗状态 ──
  const [walletDetailUser, setWalletDetailUser] = useState<User | null>(null);
  const [walletRecharges, setWalletRecharges] = useState<any[]>([]);
  const [walletDetailLoading, setWalletDetailLoading] = useState(false);
  // 缓存：{ userId: { data: [...], time: timestamp } }
  const walletCacheRef = React.useRef<Record<string, { data: any[]; time: number }>>({});
  const WALLET_CACHE_TTL = 30 * 1000; // 30秒

  // ── 模型折扣 Tab 相关状态 ──
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  /** 当前编辑用户的模型折扣数据: {mid: discount} */
  const [discountMap, setDiscountMap] = useState<Record<string, number>>({});
  /** 已选用于设置折扣的模型 mid 列表 */
  const [discountMids, setDiscountMids] = useState<string[]>([]);

  // ── 等级变更历史 ──
  const [levelLogs, setLevelLogs] = useState<any[]>([]);
  const [levelLogsLoading, setLevelLogsLoading] = useState(false);
  // ── 用户编辑与实名 Tab 控制 ──
  const [userEditActiveTab, setUserEditActiveTab] = useState('1');
  const [kycCount, setKycCount] = useState(0);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/users') as unknown as Promise<{ data: User[] }>);
      setAllUsers(resp.data);
      // Filter by role
      const filteredUsers = resp.data.filter(u => u.role === targetRole);
      setUsers(filteredUsers);
      
      const levelsResp = await (request.get('/user_levels') as unknown as Promise<{ data: any[] }>);
      setUserLevels(levelsResp.data);

      const adminGroupsResp = await (request.get('/admin_groups') as unknown as Promise<{ data: any[] }>);
      setAdminGroups(adminGroupsResp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsBatchEditMode(false);
    setSelectedRowKeys([]);
    setContactFilter(null);
    setContactBind(null);
    fetchUsers();
    // 加载模型列表用于折扣标识显示模型名称（仅首次）
    if (availableModels.length === 0) {
      request.get('/models').then((resp: any) => {
        if (resp?.data) setAvailableModels(resp.data);
      }).catch(() => {});
    }
  }, [isAdminPage]);

  const displayedUsers = useMemo(() => {
    let result = users;
    
    if (filterGroup && filterGroup !== 'all') {
      result = result.filter(user => user.user_group === filterGroup);
    }

    const trimmedFilterReferrer = filterReferrer.trim();
    if (trimmedFilterReferrer) {
      const lowerRef = trimmedFilterReferrer.toLowerCase();
      result = result.filter(user => {
        if (!user.referred_by) return false;
        const referrerObj = allUsers.find(u => u.id === user.referred_by || u.uid === user.referred_by || u.username === user.referred_by);
        if (referrerObj) {
          return referrerObj.uid?.toLowerCase().includes(lowerRef) || 
                 referrerObj.username?.toLowerCase().includes(lowerRef) || 
                 (referrerObj.nickname && referrerObj.nickname.toLowerCase().includes(lowerRef));
        }
        return user.referred_by.toLowerCase().includes(lowerRef);
      });
    }
    
    if (contactFilter) {
      if (contactFilter.kind === 'email') {
        const want = contactFilter.value.toLowerCase();
        result = result.filter(user => isRealEmail(user.email) && user.email!.toLowerCase() === want);
      } else if (contactFilter.kind === 'mobile') {
        result = result.filter(user => (user.mobile || '').trim() === contactFilter.value);
      } else {
        const want = contactFilter.value.toLowerCase();
        result = result.filter(user => (user.register_ip || '').trim().toLowerCase() === want);
      }
    }

    const trimmedSearchText = searchText.trim();
    if (trimmedSearchText) {
      const lower = trimmedSearchText.toLowerCase();
      result = result.filter(user => 
        user.username?.toLowerCase().includes(lower) ||
        user.uid?.toLowerCase().includes(lower) ||
        user.nickname?.toLowerCase().includes(lower) ||
        (isRealEmail(user.email) && user.email!.toLowerCase().includes(lower)) ||
        user.mobile?.toLowerCase().includes(lower) ||
        user.register_ip?.toLowerCase().includes(lower) ||
        user.admin_remark?.toLowerCase().includes(lower)
      );
    }

    if (listSort === 'balance_desc' || listSort === 'balance_asc') {
      result = [...result].sort((a, b) => {
        const balA = a.balance || 0;
        const balB = b.balance || 0;
        return listSort === 'balance_desc' ? balB - balA : balA - balB;
      });
    } else if (listSort === 'gift_balance_desc' || listSort === 'gift_balance_asc') {
      result = [...result].sort((a, b) => {
        const giftA = a.gift_balance || 0;
        const giftB = b.gift_balance || 0;
        return listSort === 'gift_balance_desc' ? giftB - giftA : giftA - giftB;
      });
    } else if (listSort === 'credit_limit_desc' || listSort === 'credit_limit_asc') {
      // 信控为 0 的用户不参与排序，固定排在有信控额度的用户之后
      const withCredit: typeof result = [];
      const noCredit: typeof result = [];
      for (const u of result) {
        if ((u.credit_limit || 0) > 0) withCredit.push(u);
        else noCredit.push(u);
      }
      withCredit.sort((a, b) => {
        const creditA = a.credit_limit || 0;
        const creditB = b.credit_limit || 0;
        return listSort === 'credit_limit_desc' ? creditB - creditA : creditA - creditB;
      });
      result = [...withCredit, ...noCredit];
    } else if (listSort === 'consumption_desc' || listSort === 'consumption_asc') {
      result = [...result].sort((a, b) => {
        const costA = walletTimeFilter === 'month'
          ? (monthConsumptionMap[a.id]?.system_cost || 0)
          : (a.used_quota || 0);
        const costB = walletTimeFilter === 'month'
          ? (monthConsumptionMap[b.id]?.system_cost || 0)
          : (b.used_quota || 0);
        return listSort === 'consumption_desc' ? costB - costA : costA - costB;
      });
    }
    
    return result;
  }, [users, searchText, contactFilter, filterGroup, filterReferrer, allUsers, listSort, walletTimeFilter, monthConsumptionMap]);

  const applyContactFilter = (kind: ClickFilterKind, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSearchText('');
    setFilterGroup('all');
    const newParams = new URLSearchParams(searchParams);
    if (newParams.has('group') || newParams.has('user_group') || newParams.has('level')) {
      newParams.delete('group');
      newParams.delete('user_group');
      newParams.delete('level');
      setSearchParams(newParams, { replace: true });
    }
    setFilterReferrer('');
    setContactFilter({ kind, value: trimmed });
  };

  useEffect(() => {
    if (!contactFilter || contactFilter.kind === 'ip') {
      setContactBind(null);
      return;
    }
    let cancelled = false;
    request
      .get('/users/contact-bind', { params: { kind: contactFilter.kind, value: contactFilter.value } })
      .then((res: any) => {
        if (!cancelled && res) setContactBind(res as ContactBindInfo);
      })
      .catch(() => {
        if (!cancelled) setContactBind(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contactFilter]);

  useEffect(() => {
    if (limitModalOpen && contactBind) {
      setLimitDraft(contactBind.limit);
    }
  }, [contactBind, limitModalOpen]);

  const openLimitModal = () => {
    setLimitDraft(contactBind?.limit ?? 5);
    setLimitModalOpen(true);
  };

  const saveContactLimit = async () => {
    if (!contactFilter || contactFilter.kind === 'ip') return;
    const maxAccounts = Number(limitDraft);
    setLimitSaving(true);
    try {
      const res: any = await request.put('/users/contact-bind', {
        kind: contactFilter.kind,
        value: contactFilter.value,
        max_accounts: maxAccounts,
      });
      if (res) setContactBind(res as ContactBindInfo);
      setLimitModalOpen(false);
      message.success('已更新绑定上限');
    } catch (e) {
      console.error(e);
    } finally {
      setLimitSaving(false);
    }
  };

  const resetContactLimit = async () => {
    if (!contactFilter || contactFilter.kind === 'ip') return;
    setLimitSaving(true);
    try {
      const res: any = await request.delete('/users/contact-bind', {
        params: { kind: contactFilter.kind, value: contactFilter.value },
      });
      if (res) {
        setContactBind(res as ContactBindInfo);
        setLimitDraft(res.limit);
      } else {
        setContactBind(null);
      }
      setLimitModalOpen(false);
      message.success('已恢复站点默认上限');
    } catch (e) {
      console.error(e);
    } finally {
      setLimitSaving(false);
    }
  };

  const renderContactLink = (kind: ClickFilterKind, value: string, opts?: { compact?: boolean }) => {
    const normalize = (v: string) => (kind === 'mobile' ? v.trim() : v.trim().toLowerCase());
    const active = contactFilter?.kind === kind && normalize(contactFilter.value) === normalize(value);
    const label = kind === 'email' ? '邮箱' : kind === 'mobile' ? '手机号' : '注册 IP';
    return (
      <Button
        type="link"
        size="small"
        style={{
          padding: 0,
          height: 'auto',
          fontSize: opts?.compact ? 12 : 13,
          maxWidth: 220,
          color: active ? '#1677ff' : undefined,
        }}
        title={`点击筛选该${label}下的账号`}
        onClick={(e) => {
          e.stopPropagation();
          applyContactFilter(kind, value);
        }}
      >
        {value}
      </Button>
    );
  };

  // 查找推荐人用户对象（支持通过 id、uid 或 username 匹配）
  const findReferrerUser = (refVal?: string | null) => {
    if (!refVal) return null;
    const trimmed = String(refVal).trim();
    if (!trimmed) return null;
    return allUsers.find(u =>
      String(u.id) === trimmed ||
      (u.uid && String(u.uid) === trimmed) ||
      u.username === trimmed
    ) || null;
  };

  // 将表单推荐人值解析规范为对应的统一 id (UUID)，使 Select 的 value 精准匹配
  const resolveReferrerFormValue = (refVal?: string | null): string | undefined => {
    if (!refVal) return undefined;
    const trimmed = String(refVal).trim();
    if (!trimmed) return undefined;
    const matched = findReferrerUser(trimmed);
    return matched ? String(matched.id) : trimmed;
  };

  // 上级推荐人下拉列表候选项：排除自身，统一展示“用户名 (昵称) - UID: xxxx”
  const referrerOptions = useMemo(() => {
    // 过滤掉当前正在编辑的用户自己，不能自己推荐自己
    const filtered = allUsers.filter(u => {
      if (!editingUser) return true;
      if (u.id === editingUser.id) return false;
      if (editingUser.uid && String(u.uid) === String(editingUser.uid)) return false;
      if (editingUser.username && u.username === editingUser.username) return false;
      return true;
    });

    const formatLabel = (u: User) => {
      const nickPart = u.nickname ? ` (${u.nickname})` : '';
      const emailPart = isRealEmail(u.email) ? ` (${u.email})` : '';
      return `${u.username}${nickPart} - UID: ${u.uid || u.id}${emailPart}`;
    };

    const options = filtered.map(u => ({
      value: String(u.id),
      label: formatLabel(u),
      searchKey: `${u.username} ${u.nickname || ''} ${u.uid || ''} ${u.id} ${u.email || ''}`.toLowerCase(),
    }));

    // 若当前正在编辑的用户已有推荐人，且该推荐人未在候选列表中（例如老数据、异常数据等，但非自身），追加兜底项保证回显正常
    if (editingUser?.referred_by) {
      const currentRefId = resolveReferrerFormValue(editingUser.referred_by);
      const isSelf = currentRefId && (
        currentRefId === editingUser.id ||
        (editingUser.uid && currentRefId === String(editingUser.uid)) ||
        (editingUser.username && currentRefId === editingUser.username)
      );
      if (currentRefId && !isSelf && !options.some(opt => opt.value === currentRefId)) {
        const matched = findReferrerUser(currentRefId);
        if (matched) {
          options.unshift({
            value: String(matched.id),
            label: formatLabel(matched),
            searchKey: `${matched.username} ${matched.nickname || ''} ${matched.uid || ''} ${matched.id} ${matched.email || ''}`.toLowerCase(),
          });
        } else {
          options.unshift({
            value: currentRefId,
            label: `未知推荐人 (${currentRefId})`,
            searchKey: currentRefId.toLowerCase(),
          });
        }
      }
    }

    return options;
  }, [allUsers, editingUser]);

  const initEditUser = (record: User, activeTab = '1') => {
    setEditingUser(record);
    setUserEditActiveTab(activeTab);
    setIsModalVisible(true);
    // 加载等级变更记录
    setLevelLogs([]);
    setLevelLogsLoading(true);
    (request.get(`/users/${record.uid || record.id}/level-logs`) as unknown as Promise<{ data: any[] }>)
      .then(res => setLevelLogs(res.data || []))
      .catch(() => {})
      .finally(() => setLevelLogsLoading(false));

    // 规范化推荐人初始值，避免自推荐或 UUID 无法匹配
    const isSelfReferral = record.referred_by && (
      record.referred_by === record.id ||
      (record.uid && String(record.referred_by) === String(record.uid)) ||
      (record.username && record.referred_by === record.username)
    );
    const initialReferredBy = isSelfReferral ? undefined : resolveReferrerFormValue(record.referred_by);

    form.setFieldsValue({
      ...record,
      referred_by: initialReferredBy,
      password: '', // Don't show password
    });
    // 初始化模型折扣数据
    const md: Record<string, number> = record.model_discounts ? (() => { try { return JSON.parse(record.model_discounts); } catch { return {}; } })() : {};
    setDiscountMap(md);
    setDiscountMids(Object.keys(md));
    setKycCount(0);
  };

  const handleBackToList = () => {
    setIsModalVisible(false);
    setEditingUser(null);
    navigate(`/${adminPath}/${basePath}`);
  };

  const handleAdd = () => {
    navigate(`/${adminPath}/${basePath}/new`);
  };

  const handleEdit = (record: User, activeTab = '1') => {
    initEditUser(record, activeTab);
    const slug = TAB_KEY_TO_SLUG[activeTab] || activeTab;
    navigate(`/${adminPath}/${basePath}/${record.uid || record.id}/${slug}`);
  };

  const handleTabChange = (key: string) => {
    setUserEditActiveTab(key);
    const slug = TAB_KEY_TO_SLUG[key] || key;
    const currentActionId = editingUser?.uid || actionId || editingUser?.id || (actionId === 'new' ? 'new' : '');
    if (currentActionId) {
      navigate(`/${adminPath}/${basePath}/${currentActionId}/${slug}`, { replace: true });
    }
  };

  const loadUserData = async (id: string, tabKey: string) => {
    if (loadingUserIdRef.current === id) return;
    loadingUserIdRef.current = id;
    setUserLoading(true);
    try {
      let targetUser: User | null = null;
      try {
        const res: any = await request.get(`/users/${id}`);
        if (res && (res.id || res.data?.id)) {
          targetUser = res.data || res;
        }
      } catch (e) {
        // Fallback to list search
      }

      if (!targetUser) {
        const resp = await (request.get('/users') as unknown as Promise<{ data: User[] }>);
        if (resp?.data) {
          setAllUsers(resp.data);
          const filtered = resp.data.filter(u => u.role === targetRole);
          setUsers(filtered);
          targetUser = resp.data.find((u: User) => String(u.id) === String(id) || u.uid === String(id)) || null;
        }
      }

      if (targetUser) {
        initEditUser(targetUser, tabKey);
        if (targetUser.uid && id !== targetUser.uid && id !== 'new') {
          const slug = TAB_KEY_TO_SLUG[tabKey] || tabKey;
          navigate(`/${adminPath}/${basePath}/${targetUser.uid}/${slug}`, { replace: true });
        }
      } else {
        message.error('未找到指定用户');
        handleBackToList();
      }
    } catch (err) {
      console.error('Failed to load user', err);
      message.error('加载用户信息失败');
      handleBackToList();
    } finally {
      setUserLoading(false);
      loadingUserIdRef.current = null;
    }
  };

  useEffect(() => {
    if (!actionId) {
      setIsModalVisible(false);
      setEditingUser(null);
      return;
    }

    const targetTab = resolvedTabKey || '1';

    if (actionId === 'new') {
      setIsModalVisible(true);
      setEditingUser(null);
      form.resetFields();
      form.setFieldsValue({ role: targetRole, is_active: 1, balance: 0, gift_balance: 0, user_group: 'default' });
      setDiscountMap({});
      setDiscountMids([]);
      setKycCount(0);
      setUserEditActiveTab(targetTab);
      return;
    }

    // 编辑模式
    setIsModalVisible(true);
    setUserEditActiveTab(targetTab);

    // 若当前已在编辑该用户，仅是 Tab 切换，勿重置表单内容
    if (editingUser && (String(editingUser.id) === String(actionId) || editingUser.uid === String(actionId))) {
      return;
    }

    // 优先尝试从已加载的用户列表中匹配
    const foundInList = allUsers.find(u => String(u.id) === String(actionId) || u.uid === String(actionId));
    if (foundInList) {
      initEditUser(foundInList, targetTab);
      if (foundInList.uid && actionId !== foundInList.uid && actionId !== 'new') {
        const slug = TAB_KEY_TO_SLUG[targetTab] || targetTab;
        navigate(`/${adminPath}/${basePath}/${foundInList.uid}/${slug}`, { replace: true });
      }
      return;
    }

    // 列表未加载或未找到：从后端获取该用户详情
    loadUserData(actionId, targetTab);
  }, [actionId, resolvedTabKey, allUsers.length]);

  // 当 allUsers 异步加载完成后，若当前正在编辑用户，同步校准推荐人字段值为其对应 id
  useEffect(() => {
    if (editingUser?.referred_by && allUsers.length > 0) {
      const isSelfReferral =
        editingUser.referred_by === editingUser.id ||
        (editingUser.uid && String(editingUser.referred_by) === String(editingUser.uid)) ||
        (editingUser.username && editingUser.referred_by === editingUser.username);
      if (isSelfReferral) {
        form.setFieldsValue({ referred_by: undefined });
        return;
      }
      const targetVal = resolveReferrerFormValue(editingUser.referred_by);
      const currentVal = form.getFieldValue('referred_by');
      if (targetVal && currentVal !== targetVal) {
        form.setFieldsValue({ referred_by: targetVal });
      }
    }
  }, [allUsers, editingUser]);

  const handleDelete = async (target: User | string) => {
    try {
      if (typeof target !== 'string' && isSuperAdminUser(target)) {
        message.error('超级管理员不可删除');
        return;
      }
      const deleteIdentifier = typeof target === 'string' ? target : (target.uid || target.id);
      await request.delete(`/users/${deleteIdentifier}`);
      message.success(t('common.success'));
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBatchChangeActive = async (active: number) => {
    if (selectedRowKeys.length === 0) return;
    const selectedKeySet = new Set(selectedRowKeys.map(String));
    const targetUsers = displayedUsers.filter(u => selectedKeySet.has(String(u.id)));
    if (targetUsers.length === 0) return;

    setBatchLoading(true);
    try {
      await Promise.all(
        targetUsers.map(u =>
          request.put(`/users/${u.uid || u.id}`, { is_active: active })
        )
      );
      message.success(`已成功${active === 1 ? '启用' : '禁用'} ${targetUsers.length} 个用户`);
      const targetIdSet = new Set(targetUsers.map(u => u.id));
      setUsers(prev => prev.map(u => targetIdSet.has(u.id) ? { ...u, is_active: (active === 1) as any } : u));
      setAllUsers(prev => prev.map(u => targetIdSet.has(u.id) ? { ...u, is_active: (active === 1) as any } : u));
    } catch (e) {
      console.error(e);
      message.error(active === 1 ? '批量启用失败' : '批量禁用失败');
      fetchUsers();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchChangePay = async (payEnabled: number) => {
    if (selectedRowKeys.length === 0) return;
    const selectedKeySet = new Set(selectedRowKeys.map(String));
    const targetUsers = displayedUsers.filter(u => selectedKeySet.has(String(u.id)));
    if (targetUsers.length === 0) return;

    setBatchLoading(true);
    try {
      await Promise.all(
        targetUsers.map(u =>
          request.put(`/users/${u.uid || u.id}`, { pay_enabled: payEnabled })
        )
      );
      message.success(`已成功${payEnabled === 1 ? '开启' : '关闭'} ${targetUsers.length} 个用户的在线支付`);
      const targetIdSet = new Set(targetUsers.map(u => u.id));
      setUsers(prev => prev.map(u => targetIdSet.has(u.id) ? { ...u, pay_enabled: payEnabled } : u));
      setAllUsers(prev => prev.map(u => targetIdSet.has(u.id) ? { ...u, pay_enabled: payEnabled } : u));
    } catch (e) {
      console.error(e);
      message.error(payEnabled === 1 ? '批量开启支付失败' : '批量关闭支付失败');
      fetchUsers();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    const selectedKeySet = new Set(selectedRowKeys.map(String));
    const candidates = displayedUsers.filter(u => selectedKeySet.has(String(u.id)));
    const targetUsers = candidates.filter(u => !isSuperAdminUser(u));
    if (targetUsers.length === 0) {
      message.warning('选中的用户均为超级管理员，无法删除');
      return;
    }
    if (candidates.length > targetUsers.length) {
      message.info(`已自动跳过 ${candidates.length - targetUsers.length} 个超级管理员账号`);
    }

    setBatchLoading(true);
    try {
      await Promise.all(
        targetUsers.map(u => request.delete(`/users/${u.uid || u.id}`))
      );
      message.success(`已成功删除 ${targetUsers.length} 个用户`);
      const targetIdSet = new Set(targetUsers.map(u => u.id));
      setUsers(prev => prev.filter(u => !targetIdSet.has(u.id)));
      setAllUsers(prev => prev.filter(u => !targetIdSet.has(u.id)));
      setSelectedRowKeys([]);
      fetchUsers();
    } catch (e) {
      console.error(e);
      message.error('批量删除失败');
      fetchUsers();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleSave = async (values: { [key: string]: unknown }) => {
    try {
      if (editingUser) {
        const payload = { ...values };
        if (!payload.password || (payload.password as string).trim() === '') {
          delete payload.password;
        }
        if (payload.referred_by === undefined || payload.referred_by === null) {
          payload.referred_by = "";
        } else if (payload.referred_by) {
          const refVal = String(payload.referred_by).trim();
          if (
            refVal === String(editingUser.id) ||
            (editingUser.uid && refVal === String(editingUser.uid)) ||
            (editingUser.username && refVal === String(editingUser.username))
          ) {
            message.error('不能将自己设置为上级推荐人');
            return;
          }
        }
        // 编辑模式下不发送 balance/gift_balance，避免并发覆盖充值操作
        delete payload.balance;
        delete payload.gift_balance;
        delete payload.gift_used_quota;
        delete payload.used_quota;
        // 角色创建后不可改（admin / user）
        delete payload.role;
        // 实名字段由「保存实名信息」单独提交，勿混入用户更新
        [
          'kyc_type', 'status', 'real_name', 'id_doc_type', 'id_doc_front_url', 'id_doc_back_url',
          'company_name', 'business_license_url', 'tax_registration_url', 'legal_notarization_url',
          'validity_type', 'expire_at', 'reject_reason', 'admin_remark',
        ].forEach((k) => { delete payload[k]; });
        // 保存模型折扣：仅保留已设置折扣值的模型
        const validDiscounts: Record<string, number> = {};
        for (const mid of discountMids) {
          if (discountMap[mid] !== undefined && discountMap[mid] !== null) {
            validDiscounts[mid] = discountMap[mid];
          }
        }
        payload.model_discounts = Object.keys(validDiscounts).length > 0 ? JSON.stringify(validDiscounts) : '';
        await request.put(`/users/${editingUser.uid || editingUser.id}`, payload);
        message.success(t('common.success'));
      } else {
        const payload: any = { ...values, role: targetRole };
        if (payload.referred_by && payload.username && String(payload.referred_by).trim() === String(payload.username).trim()) {
          message.error('不能将自己设置为上级推荐人');
          return;
        }
        // 创建时去掉值为0的余额字段，避免后端不必要的记录
        if (payload.balance === 0 || payload.balance === null) delete payload.balance;
        if (payload.gift_balance === 0 || payload.gift_balance === null) delete payload.gift_balance;
        if (targetRole === 'admin' && !payload.admin_group_id) {
          message.error('请选择管理员等级');
          return;
        }
        await request.post('/users', payload);
        message.success(t('common.success'));
      }
      handleBackToList();
      fetchUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRechargeClick = (record: User) => {
    setRechargingUser(record);
    rechargeForm.setFieldsValue({
      walletType: 'system',
      actionType: 'increase',
      amount: '',
      remark: '',
    });
    setIsRechargeModalVisible(true);
  };


  const handleRechargeSave = async (values: any) => {
    if (!rechargingUser) return;
    if (rechargeLoading) return;
    setRechargeLoading(true);
    try {
      let finalAmount = Number(values.amount);
      if (values.actionType === 'decrease') {
        finalAmount = -finalAmount;
      }
      const payload = {
        amount: finalAmount,
        remark: values.remark,
        wallet_type: values.walletType || 'system',
      };
      await request.post(`/users/${rechargingUser.uid || rechargingUser.id}/recharge`, payload);
      message.success(t('users.recharge_success'));
      setIsRechargeModalVisible(false);
      // 充值后清除该用户的钱包明细缓存，确保下次查看时获取最新数据
      delete walletCacheRef.current[rechargingUser.uid || rechargingUser.id];
      fetchUsers();
    } catch (e) {
      console.error(e);
    } finally {
      setRechargeLoading(false);
    }
  };

  const confirmRechargeSave = (values: any) => {
    if (!rechargingUser) return;
    const walletLabel = values.walletType === 'gift'
      ? '赠送钱包'
      : values.walletType === 'credit'
        ? '信控额度'
        : '系统钱包';
        
    const currentBalance = values.walletType === 'gift'
      ? (rechargingUser.gift_balance || 0)
      : values.walletType === 'credit'
        ? (rechargingUser.credit_limit || 0)
        : (rechargingUser.balance || 0);

    const isDecrease = values.actionType === 'decrease';
    const adjustmentAmount = Number(values.amount);
    const afterBalance = isDecrease ? currentBalance - adjustmentAmount : currentBalance + adjustmentAmount;
    
    const amountColor = isDecrease ? token.colorError : token.colorSuccess;
    const detailRows: { label: string; value: React.ReactNode }[] = [
      { label: '用户', value: rechargingUser.username },
      { label: '钱包', value: walletLabel },
      { label: '操作', value: isDecrease ? '减少金额' : '增加金额' },
      {
        label: '金额',
        value: (
          <span style={{ color: amountColor, fontSize: 16, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {isDecrease ? '-' : '+'}{currencySymbol}{values.amount}
          </span>
        ),
      },
      {
        label: '调整后余额',
        value: (
          <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {currencySymbol}{Number(afterBalance.toFixed(6))}
          </span>
        ),
      },
    ];
    modal.confirm({
      title: <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 18 }}>确认余额调整</div>,
      icon: null,
      centered: true,
      width: 400,
      content: (
        <div>
          <div
            style={{
              marginTop: 8,
              padding: '4px 14px',
              borderRadius: 8,
              background: token.colorFillTertiary,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {detailRows.map((row, idx) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '10px 0',
                  borderBottom: idx === detailRows.length - 1 ? 'none' : `1px solid ${token.colorSplit}`,
                }}
              >
                <span style={{ color: token.colorTextSecondary, fontSize: 13, flexShrink: 0 }}>{row.label}</span>
                <span style={{ color: token.colorText, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, color: token.colorTextTertiary, fontSize: 13, textAlign: 'center' }}>
            确认后余额将立即变动，请核对无误。
          </div>
        </div>
      ),
      okText: '确认调整',
      cancelText: '取消',
      okButtonProps: { danger: isDecrease, style: { width: '100%' } },
      cancelButtonProps: { style: { width: '100%' } },
      footer: (_, { OkBtn, CancelBtn }) => (
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <div style={{ flex: 1 }}><CancelBtn /></div>
          <div style={{ flex: 1 }}><OkBtn /></div>
        </div>
      ),
      onOk: () => handleRechargeSave(values),
    });
  };

  // ── 钱包明细：获取用户充值记录（30秒 TTL 缓存） ──
  const openWalletDetail = async (record: User) => {
    setWalletDetailUser(record);
    const userKey = record.uid || record.id;
    // 检查缓存是否有效（30秒内）
    const cached = walletCacheRef.current[userKey];
    if (cached && Date.now() - cached.time < WALLET_CACHE_TTL) {
      setWalletRecharges(cached.data);
      return;
    }
    setWalletDetailLoading(true);
    try {
      const res = await (request.get('/finance/recharges', { params: { user_id: userKey, per_page: 500 } }) as any);
      const data = res.data || [];
      setWalletRecharges(data);
      walletCacheRef.current[userKey] = { data, time: Date.now() };
    } catch (e) {
      console.error('获取充值记录失败', e);
      setWalletRecharges([]);
    } finally {
      setWalletDetailLoading(false);
    }
  };

  const handleImpersonate = async (record: User) => {
    try {
      const resp = await (request.post(`/users/${record.uid || record.id}/impersonate`) as unknown as Promise<{ token: string; user: User }>);
      const { token, user } = resp;
      
      // 管理端与用户端同属一个 Vite SPA；本地 5173=商业版、5174=开源版，直接用当前 origin
      const baseUrl = window.location.origin;
      
      message.success(`正在打开用户端: ${user.username}`);
      
      // 用 localStorage 一次性交接，避免 JWT 出现在 URL
      const handoffKey = `imp_handoff_${generateUUID()}`;
      localStorage.setItem(handoffKey, token);
      window.open(`${baseUrl}/login?impersonate=1&handoff=${encodeURIComponent(handoffKey)}`, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error(e);
    }
  };

  const baseColumns: any[] = [
    {
      title: t('users.uid'),
      dataIndex: 'uid',
      key: 'uid',
      render: (text: string) => (
        <Text
          code
          copyable={{ text: String(text || ''), tooltips: [t('common.copy', '复制'), t('common.copy_success', '已复制')] }}
          style={{ color: '#fff', padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 13 }}
        >
          {text}
        </Text>
      ),
    },
    {
      title: t('users.username'),
      dataIndex: 'username',
      key: 'username',
      width: 320,
      render: (text: string, record: User) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Space align="center" style={{ flexWrap: 'wrap' }}>
            <UserOutlined />
            <a onClick={() => handleEdit(record)} style={{ color: 'inherit' }}>
              <Text strong style={{ cursor: 'pointer' }}>{text}</Text>
            </a>
            {record.nickname && <Text type="secondary">({record.nickname})</Text>}
            <Tag color={record.is_active ? 'success' : 'error'} style={{ fontSize: 11, padding: '0 4px', margin: 0, whiteSpace: 'nowrap' }}>
              {record.is_active ? t('common.active') : t('common.disabled')}
            </Tag>
            {!isAdminPage && <KycStatusTags record={record} onOpen={() => handleEdit(record, '6')} />}
          </Space>
          {record.referred_by && (() => {
            const referrer = allUsers.find(u => u.id === record.referred_by || u.uid === record.referred_by || u.username === record.referred_by);
            return (
              <Text type="secondary" style={{ fontSize: '12px', marginTop: 4 }}>
                推荐人: {referrer ? `${referrer.username}${referrer.nickname ? ` (${referrer.nickname})` : ''} (UID: ${referrer.uid || referrer.id})` : record.referred_by}
              </Text>
            );
          })()}
          <div style={{ maxWidth: 280, display: 'flex', marginTop: 4 }}>
          <Text 
            type="secondary" 
            style={{ fontSize: '12px', width: '100%' }}
            ellipsis={{ tooltip: record.admin_remark || '添加备注' }}
            editable={{
              text: record.admin_remark || '',
              onChange: async (val) => {
                if (val === record.admin_remark) return;
                try {
                  await request.put(`/users/${record.uid || record.id}`, { admin_remark: val });
                  setAllUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                  setUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                } catch (e) {
                  console.error('Failed to update remark:', e);
                }
              },
              tooltip: '点击编辑用户备注',
              triggerType: ['icon']
            }}
          >
            {record.admin_remark || '添加备注'}
          </Text>
          </div>
          <ModelDiscountHoverTag modelDiscounts={record.model_discounts} models={availableModels} />
        </div>
      ),
    },
    {
      title: '注册信息',
      key: 'registration_info',
      width: 280,
      render: (_: any, record: User) => (
        <Space vertical size={2} style={{ fontSize: '13px' }}>
          {isRealEmail(record.email) && (
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>邮箱: </Text>
              <span style={{ marginLeft: 4, minWidth: 0 }}>
                {isAdminPage ? (
                  <Text type="secondary" style={{ maxWidth: 220 }} ellipsis={{ tooltip: record.email }}>{record.email}</Text>
                ) : (
                  renderContactLink('email', record.email!)
                )}
              </span>
            </div>
          )}
          {record.mobile && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>手机号: </Text>
              <span style={{ marginLeft: 4 }}>
                {isAdminPage ? (
                  <Text type="secondary">{record.mobile}</Text>
                ) : (
                  renderContactLink('mobile', record.mobile)
                )}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>注册 IP: </Text>
            <span style={{ marginLeft: 4 }}>
              {!isAdminPage && record.register_ip ? (
                renderContactLink('ip', record.register_ip)
              ) : (
                <Text type="secondary">{record.register_ip || '未知'}</Text>
              )}
            </span>
          </div>
          <Text type="secondary">加入时间: {formatApiDateTime(record.created_at)}</Text>
          <Text type="secondary">最后活跃: {record.updated_at ? formatApiDateTime(record.updated_at) : '未知'}</Text>
        </Space>
      ),
    },

    {
      title: t('users.group'),
      dataIndex: 'user_group',
      key: 'user_group',
      render: (group: string, record: User) => {
        if (record.role === 'admin') {
          const adminGroup = adminGroups.find(g => g.id === record.admin_group_id);
          return <Tag color="purple">{adminGroup ? adminGroup.name : '超级管理员'}</Tag>;
        }
        
        const level = userLevels.find(l => l.group_key === group);
        const levelName = level ? level.name : (group || 'default').toUpperCase();
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
            <Tag color={group === 'vip' ? 'gold' : group === 'partner' ? 'cyan' : 'default'} style={{ margin: 0 }}>
              {levelName}
            </Tag>
            {level && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                折扣倍率: {level.discount}x
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: '钱包余额',
      key: 'balance',
      width: 320,
      render: (_: unknown, record: User) => (
        <WalletBalanceDisplay 
          record={record} 
          onWalletClick={openWalletDetail} 
          width={140} 
          gap={20} 
          showConsumption
          monthConsumption={walletTimeFilter === 'month' ? (monthConsumptionMap[record.id] || { system_cost: 0, gift_cost: 0 }) : undefined}
        />
      ),
    },

    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          <Button 
            icon={<WalletOutlined />} 
            style={{ color: '#52c41a', borderColor: '#52c41a' }}
            onClick={() => handleRechargeClick(record)} 
            title="充值"
          />
          {!isAdminPage && isInvoiceEnabled && (
            <Tooltip title={invoiceBtnTitle}>
              <Button 
                icon={<FileTextOutlined />} 
                style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
                onClick={() => navigate(`/${adminPath}/users/${record.uid || record.id}/invoices`)}
              />
            </Tooltip>
          )}
          {!isAdminPage && (
            <Button 
              icon={<LoginOutlined />} 
              style={{ color: '#1677ff', borderColor: '#1677ff' }}
              onClick={() => handleImpersonate(record)}
              title="登录此用户"
            />
          )}
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {isSuperAdminUser(record) ? (
            <Tooltip title="超级管理员不可删除">
              <Button icon={<DeleteOutlined />} danger disabled />
            </Tooltip>
          ) : (
            <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record)}>
              <Button icon={<DeleteOutlined />} danger />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const columns = baseColumns.map((col: any) => ({
    ...col,
    width: columnsWidths[col.key as string] || col.width || 150,
    onHeaderCell: (column: any) => ({
      width: column.width,
      onResize: handleResize(column.key as string),
    }),
  }));

  return (
    <Card variant="borderless">
      {!isModalVisible ? (
      <>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>
          {isAdminPage ? t('menu.admin_list') : t('menu.user_list')}
        </Title>
        <Space wrap>
          {!isAdminPage && (
            <Select
              value={filterGroup}
              onChange={handleFilterGroupChange}
              style={{ width: screens.xs ? '100%' : 200, fontSize: 12, height: 32 }}
              styles={{ popup: { root: { fontSize: 12 } } }}
              options={[
                { value: 'all', label: '全部用户等级' },
                ...userLevels.map(level => ({ value: level.group_key, label: `${level.name} (${level.discount}x)` }))
              ]}
            />
          )}
          {!isAdminPage && (
            <Select
              value={listSort}
              onChange={setListSort}
              style={{ width: screens.xs ? '100%' : 200, fontSize: 12, height: 32 }}
              styles={{ popup: { root: { fontSize: 12 } } }}
              options={[
                { value: 'default', label: '默认排序' },
                { value: 'balance_desc', label: '系统钱包余额 ↓' },
                { value: 'balance_asc', label: '系统钱包余额 ↑' },
                { value: 'gift_balance_desc', label: '赠送钱包余额 ↓' },
                { value: 'gift_balance_asc', label: '赠送钱包余额 ↑' },
                { value: 'credit_limit_asc', label: '信控额度 ↑' },
                { value: 'credit_limit_desc', label: '信控额度 ↓' },
                { value: 'consumption_desc', label: '消费合计 ↓' },
                { value: 'consumption_asc', label: '消费合计 ↑' },
              ]}
            />
          )}
          {!isAdminPage && (
            <Select
              value={walletTimeFilter}
              onChange={(v) => {
                setWalletTimeFilter(v);
                localStorage.setItem('walletTimeFilter', v);
              }}
              options={[
                { label: '当月数据', value: 'month' },
                { label: '全部数据', value: 'all' },
              ]}
              style={{ width: screens.xs ? '100%' : 140, fontSize: 12, height: 32 }}
              styles={{ popup: { root: { fontSize: 12 } } }}
            />
          )}
          <Input 
            prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary, #bfbfbf)' }} />}
            placeholder="搜索用户名/ID/昵称/邮箱/手机号/IP/备注..." 
            allowClear 
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)} 
            onBlur={() => setSearchText(searchText.trim())}
            onPressEnter={(e) => setSearchText((e.target as HTMLInputElement).value.trim())}
            style={{ width: screens.xs ? '100%' : 280, fontSize: 12, height: 32 }}
          />
          {!isAdminPage && (
            <Input 
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary, #bfbfbf)' }} />}
              placeholder="搜索推荐人(UID/用户名/昵称)..." 
              allowClear 
              value={filterReferrer}
              onChange={(e) => setFilterReferrer(e.target.value)} 
              onBlur={() => setFilterReferrer(filterReferrer.trim())}
              onPressEnter={(e) => setFilterReferrer((e.target as HTMLInputElement).value.trim())}
              style={{ width: screens.xs ? '100%' : 220, fontSize: 12, height: 32 }}
            />
          )}
          {!isAdminPage && (
            <Button
              icon={<CheckSquareOutlined />}
              type={isBatchEditMode ? 'primary' : 'default'}
              danger={isBatchEditMode}
              onClick={() => {
                setIsBatchEditMode(!isBatchEditMode);
                if (isBatchEditMode) setSelectedRowKeys([]);
              }}
              style={{ height: 32, borderRadius: 6, fontSize: 12 }}
            >
              {isBatchEditMode ? '退出选择' : '选择编辑'}
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} style={{ height: 32, borderRadius: 6, fontSize: 12 }}>{isAdminPage ? '添加管理员' : '添加普通用户'}</Button>
        </Space>
      </div>

      {!isAdminPage && contactFilter && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setContactFilter(null)}
          style={{ marginBottom: 12 }}
          message={
            <Space wrap size={8}>
              <span>
                {contactFilter.kind === 'ip' ? (
                  `当前筛选注册 IP ${contactFilter.value}：共 ${displayedUsers.length} 个账号`
                ) : (
                  <>
                    当前筛选{contactFilter.kind === 'email' ? '邮箱' : '手机号'} {contactFilter.value}
                    {contactBind
                      ? `：已绑定 ${contactBind.bound_count} 个账号，上限 ${contactBind.limit}${contactBind.is_override ? `（已单独设置，站点默认 ${contactBind.default_limit}）` : '（站点默认）'}`
                      : ''}
                  </>
                )}
              </span>
              {contactFilter.kind !== 'ip' && (
                <Button type="link" size="small" icon={<SettingOutlined />} onClick={openLimitModal}>修改上限</Button>
              )}
            </Space>
          }
        />
      )}

      {/* 批量操作工具条 */}
      {isBatchEditMode && !isAdminPage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 14px',
          marginBottom: 12,
          borderRadius: 8,
          backgroundColor: _isLight ? '#e6f4ff' : '#111b26',
          border: _isLight ? '1px solid #91caff' : '1px solid #154173',
          transition: 'all 0.3s ease'
        }}>
          <Space wrap size={10} style={{ alignItems: 'center' }}>
            <Button
              size="small"
              onClick={() => {
                setSelectedRowKeys(displayedUsers.map(u => u.id));
              }}
            >
              全选
            </Button>
            <Button
              size="small"
              disabled={selectedRowKeys.length === 0}
              onClick={() => setSelectedRowKeys([])}
            >
              取消选择
            </Button>
            <Text strong style={{ fontSize: 13, color: _isLight ? '#0958d9' : '#1677ff', marginLeft: 4 }}>
              已选择 <span style={{ fontSize: 15, fontWeight: 700 }}>{selectedRowKeys.length}</span> 项
            </Text>
          </Space>

          <Space wrap size={8}>
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={batchLoading}
              onClick={() => handleBatchChangeActive(1)}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              用户启用
            </Button>
            <Button
              size="small"
              icon={<StopOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={batchLoading}
              onClick={() => handleBatchChangeActive(0)}
            >
              用户禁用
            </Button>
            <Button
              size="small"
              icon={<CreditCardOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={batchLoading}
              onClick={() => handleBatchChangePay(1)}
            >
              支付开启
            </Button>
            <Button
              size="small"
              icon={<StopOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={batchLoading}
              onClick={() => handleBatchChangePay(0)}
            >
              支付关闭
            </Button>
            <Popconfirm
              title="确定要批量删除选中的用户吗？"
              description={`将一次性删除选中的 ${selectedRowKeys.length} 个用户，此操作不可撤销。`}
              onConfirm={handleBatchDelete}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: batchLoading }}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={selectedRowKeys.length === 0}
                loading={batchLoading}
              >
                用户删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      {screens.xs ? (
        <MobileCardList
          dataSource={displayedUsers}
          loading={loading}
          rowKey="id"
          pagination={listPagination()}
          renderCard={(record: any) => {
            const level = userLevels.find((l: any) => l.group_key === record.user_group);
            const levelName = level ? level.name : (record.user_group || 'default').toUpperCase();
            return (
              <MobileCard
                title={
                  <Space>
                    {isBatchEditMode && !isAdminPage && (
                      <Checkbox
                        checked={selectedRowKeys.includes(record.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRowKeys(prev => [...prev, record.id]);
                          } else {
                            setSelectedRowKeys(prev => prev.filter(k => k !== record.id));
                          }
                        }}
                      />
                    )}
                    <UserOutlined />
                    <Text strong>{record.username}</Text>
                    {record.nickname && <Text type="secondary">({record.nickname})</Text>}
                  </Space>
                }
                extra={
                  <Space size={4} wrap>
                    <Tag color={record.is_active ? 'success' : 'error'}>{record.is_active ? t('common.active') : t('common.disabled')}</Tag>
                    {!isAdminPage && <KycStatusTags record={record} onOpen={() => handleEdit(record, '6')} />}
                  </Space>
                }
              >
                <CardRow label="UID">
                  <Text
                    code
                    copyable={{ text: String(record.uid || ''), tooltips: [t('common.copy', '复制'), t('common.copy_success', '已复制')] }}
                    style={{ color: '#fff', fontSize: 12 }}
                  >
                    {record.uid}
                  </Text>
                </CardRow>
                {isRealEmail(record.email) && (
                  <CardRow label="邮箱">
                    {isAdminPage ? (
                      <Text style={{ fontSize: 12 }}>{record.email}</Text>
                    ) : (
                      renderContactLink('email', record.email!, { compact: true })
                    )}
                  </CardRow>
                )}
                {record.mobile && (
                  <CardRow label="手机号">
                    {isAdminPage ? (
                      <Text style={{ fontSize: 12 }}>{record.mobile}</Text>
                    ) : (
                      renderContactLink('mobile', record.mobile, { compact: true })
                    )}
                  </CardRow>
                )}
                
                {/* 推荐人 */}
                {record.referred_by && (() => {
                  const referrer = allUsers.find(u => u.id === record.referred_by || u.uid === record.referred_by || u.username === record.referred_by);
                  return (
                    <CardRow label="推荐人">
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {referrer ? `${referrer.username}${referrer.nickname ? ` (${referrer.nickname})` : ''} (UID: ${referrer.uid || referrer.id})` : record.referred_by}
                      </Text>
                    </CardRow>
                  );
                })()}

                {/* 备注 (可编辑) */}
                <CardRow label="备注">
                  <div style={{ maxWidth: 200, display: 'flex', justifyContent: 'flex-end' }}>
                    <Text 
                      type="secondary" 
                      style={{ fontSize: '12px', textAlign: 'right' }}
                      ellipsis={{ tooltip: record.admin_remark || '添加备注' }}
                      editable={{
                        text: record.admin_remark || '',
                        onChange: async (val) => {
                          if (val === record.admin_remark) return;
                          try {
                            await request.put(`/users/${record.uid || record.id}`, { admin_remark: val });
                            setAllUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                            setUsers(prev => prev.map(u => u.id === record.id ? { ...u, admin_remark: val } : u));
                          } catch (e) {
                            console.error('Failed to update remark:', e);
                          }
                        },
                        tooltip: '点击编辑用户备注',
                        triggerType: ['icon']
                      }}
                    >
                      {record.admin_remark || '添加备注'}
                    </Text>
                  </div>
                </CardRow>

                {/* 模型单独折扣标识 */}
                {record.model_discounts && (
                  <CardRow label="模型折扣">
                    <ModelDiscountHoverTag modelDiscounts={record.model_discounts} models={availableModels} compact />
                  </CardRow>
                )}

                {isAdminPage ? (
                  <CardRow label="分组">
                    {(() => {
                      const adminGroup = adminGroups.find((g: any) => g.id === record.admin_group_id);
                      return <Tag color="purple">{adminGroup ? adminGroup.name : '超级管理员'}</Tag>;
                    })()}
                  </CardRow>
                ) : (
                  <CardRow label="等级">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <Tag color={record.user_group === 'vip' ? 'gold' : record.user_group === 'partner' ? 'cyan' : 'default'} style={{ margin: 0 }}>
                        {levelName}
                      </Tag>
                      {level && (
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          折扣倍率: {level.discount}x
                        </Text>
                      )}
                    </div>
                  </CardRow>
                )}

                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--ant-color-border-secondary)', borderTop: '1px solid var(--ant-color-border-secondary)', marginTop: 8 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>钱包数据</Text>
                  </div>
                  <WalletBalanceDisplay 
                    record={record} 
                    onWalletClick={openWalletDetail} 
                    showConsumption
                    monthConsumption={walletTimeFilter === 'month' ? (monthConsumptionMap[record.id] || { system_cost: 0, gift_cost: 0 }) : undefined}
                    gap={12}
                  />
                </div>
                <CardRow label="注册IP">
                  {!isAdminPage && record.register_ip ? (
                    renderContactLink('ip', record.register_ip, { compact: true })
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.register_ip || '未知'}</Text>
                  )}
                </CardRow>
                <CardRow label="加入时间"><Text type="secondary" style={{ fontSize: 12 }}>{formatApiDateTime(record.created_at, 'MM-DD HH:mm')}</Text></CardRow>
                <CardRow label="最后活跃"><Text type="secondary" style={{ fontSize: 12 }}>{record.updated_at ? formatApiDateTime(record.updated_at, 'MM-DD HH:mm') : '未知'}</Text></CardRow>
                <CardActions>
                  <Button size="small" icon={<WalletOutlined />} style={{ color: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleRechargeClick(record)} title="充值" />
                  {!isAdminPage && isInvoiceEnabled && (
                    <Tooltip title={invoiceBtnTitle}>
                      <Button size="small" icon={<FileTextOutlined />} style={{ color: '#fa8c16', borderColor: '#fa8c16' }} onClick={() => navigate(`/${adminPath}/users/${record.uid || record.id}/invoices`)} />
                    </Tooltip>
                  )}
                  {!isAdminPage && (
                    <Button size="small" icon={<LoginOutlined />} style={{ color: '#1677ff', borderColor: '#1677ff' }} onClick={() => handleImpersonate(record)} title="登录此用户" />
                  )}
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                  {isSuperAdminUser(record) ? (
                    <Tooltip title="超级管理员不可删除">
                      <Button size="small" icon={<DeleteOutlined />} danger disabled />
                    </Tooltip>
                  ) : (
                    <Popconfirm title={t('common.confirm_delete')} onConfirm={() => handleDelete(record)}>
                      <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                  )}
                </CardActions>
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          components={{
            header: {
              cell: ResizableTitle,
            },
          }}
          className="compact-table"
          dataSource={displayedUsers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={listPagination()}
          scroll={{ x: 'max-content' }}
          showSorterTooltip={false}
          rowSelection={isBatchEditMode && !isAdminPage ? {
            selectedRowKeys,
            onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
          } : undefined}
        />
      )}
      </>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: screens.xs ? 8 : 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBackToList}>返回</Button>
            <Title level={screens.xs ? 4 : 3} style={{ margin: 0 }}>
              {editingUser ? `${t('users.edit_user')}${editingUser.uid ? ` (UID: ${editingUser.uid})` : ''}` : (isAdminPage ? '添加管理员' : '添加普通用户')}
            </Title>
          </div>
          {userLoading ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <Spin size="large" tip="正在加载用户信息..." />
            </div>
          ) : (
            <div style={{ maxWidth: 1200, width: '100%' }}>
              <Form form={form} layout="vertical" onFinish={handleSave}>
                <Tabs
                  activeKey={userEditActiveTab}
                  onChange={handleTabChange}
                  items={[
                  {
                    key: '1',
                    label: '用户基本信息',
                    children: (
                      <>
          {editingUser?.uid && (
            <Form.Item label="用户 UID">
              <Input
                value={editingUser.uid}
                disabled
                addonAfter={<Typography.Text copyable={{ text: editingUser.uid }} style={{ cursor: 'pointer' }} />}
              />
            </Form.Item>
          )}
          <Form.Item
            name="username"
            label={t('users.username')}
            rules={[
              { required: true, message: '请输入用户名' },
              {
                validator: (_, val) =>
                  (editingUser && val === editingUser.username) || !val || (val.length >= 5 && val.length <= 48)
                    ? Promise.resolve()
                    : Promise.reject(new Error(val.length < 5 ? '用户名长度不能少于 5 个字符' : '正确输入用户名限制为 48 字'))
              }
            ]}
          >
            <Input placeholder={t('users.username')} />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="用户昵称"
            rules={[{ max: 24, message: '昵称长度最多不能超过 24 个字符' }]}
          >
            <Input placeholder="输入用户昵称" />
          </Form.Item>
          <Form.Item name="admin_remark" label="用户备注 (管理员可见)">
            <Input.TextArea placeholder="写入简便备注例如: vip客户" rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
          </Form.Item>
          <Form.Item
            name="referred_by"
            label="上级推荐人 (UID / 用户名)"
            rules={[
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  if (editingUser) {
                    const valStr = String(value).trim();
                    if (
                      valStr === String(editingUser.id) ||
                      (editingUser.uid && valStr === String(editingUser.uid)) ||
                      (editingUser.username && valStr === String(editingUser.username))
                    ) {
                      return Promise.reject(new Error('不能选择自己作为上级推荐人'));
                    }
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Select
              showSearch
              allowClear
              placeholder="输入用户名、UID 或邮箱快速搜索"
              filterOption={(input, option) => {
                if (!option) return false;
                const searchKey = (option as any)?.searchKey || String(option?.label || '').toLowerCase();
                return searchKey.includes(input.toLowerCase().trim());
              }}
              options={referrerOptions}
            />
          </Form.Item>
          <Form.Item name="mobile" label="手机号" extra="同一手机号默认可绑定多个用户（上限见注册设置）；列表里点击手机号可筛选并单独改这条上限">
            <Input placeholder="输入用户手机号 (可选)" />
          </Form.Item>
          <Form.Item name="email" label={t('users.email')} rules={[{ required: true, type: 'email' }]} extra="同一邮箱默认可绑定多个用户（上限见注册设置）；列表里点击邮箱可筛选并单独改这条上限">
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item 
            name="password" 
            label={editingUser ? t('users.password_hint') : t('login.password')}
            rules={[{ required: !editingUser }]}
          >
            <Input.Password placeholder={t('login.password')} />
          </Form.Item>
          {!editingUser && (
             <Form.Item name="role" label={t('users.role')} initialValue={targetRole} hidden>
                <Input />
             </Form.Item>
          )}
          {isAdminPage && !isSuperAdminUser(editingUser) && (
            <Form.Item
              name="admin_group_id"
              label="管理员等级"
              rules={[{ required: true, message: '请选择管理员等级' }]}
            >
              <Select placeholder="选择管理员等级">
                {adminGroups.map(group => (
                  <Option key={group.id} value={group.id}>{group.name}</Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!editingUser && (
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item name="balance" label={`系统钱包余额 (${currencySymbol})`} initialValue={0} style={{ flex: 1 }}>
                <InputNumber style={{ width: '100%' }} precision={6} min={0} />
              </Form.Item>
              <Form.Item name="gift_balance" label={`赠送钱包余额 (${currencySymbol})`} initialValue={0} style={{ flex: 1 }}>
                <InputNumber style={{ width: '100%' }} precision={6} min={0} />
              </Form.Item>
            </div>
          )}
          {!isAdminPage && (
            <Form.Item name="user_group" label="普通用户等级" initialValue="default">
              <Select>
                {userLevels.map(level => (
                  <Option key={level.id} value={level.group_key}>
                    {level.name} (折扣倍率: {level.discount}x)
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="is_active" label={t('common.status')} initialValue={1}>
            <Select>
              <Option value={1}>{t('common.active')}</Option>
              <Option value={0}>{t('common.disabled')}</Option>
            </Select>
          </Form.Item>
                      </>
                    )
                  },
                  ...(editingUser ? [{
                    key: '2',
                    label: '用户详细',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                        <div>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>用户 UID:</Typography.Text>
                          <Typography.Text code copyable={{ text: editingUser.uid }} style={{ fontSize: 13 }}>{editingUser.uid || '未知'}</Typography.Text>
                        </div>
                        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                          <div>
                            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>注册时间:</Typography.Text>
                            <Typography.Text>{editingUser.created_at ? formatApiDateTime(editingUser.created_at) : '未知'}</Typography.Text>
                          </div>
                          <div>
                            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>注册 IP:</Typography.Text>
                            <Typography.Text>{editingUser.register_ip || '未知'}</Typography.Text>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                          <div>
                            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>最后活跃时间:</Typography.Text>
                            <Typography.Text>{editingUser.updated_at ? formatApiDateTime(editingUser.updated_at) : '未知'}</Typography.Text>
                          </div>
                          <div>
                            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>最后活跃 IP:</Typography.Text>
                            <Typography.Text>{editingUser.last_active_ip || '未知'}</Typography.Text>
                          </div>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>关联记录 (流转记录):</Typography.Text>
                          <div style={{ padding: '16px 16px 0', background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))', borderRadius: 8, minHeight: 100, border: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}>
                            {editingUser.referral_history ? (
                              <Timeline 
                                items={editingUser.referral_history.split('\n').filter(line => line.trim()).map(line => {
                                  const match = line.match(/^\[(.*?)\]\s*(.*)$/);
                                  if (match) {
                                    return {
                                      color: 'blue',
                                      children: (
                                        <>
                                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{match[1]}</Typography.Text>
                                          <Typography.Text style={{ marginTop: 2, display: 'block' }}>{match[2]}</Typography.Text>
                                        </>
                                      )
                                    };
                                  }
                                  return { children: <Typography.Text>{line}</Typography.Text> };
                                }).reverse()}
                              />
                            ) : (
                              <Typography.Text type="secondary">暂无流转记录</Typography.Text>
                            )}
                          </div>
                        </div>
                         {/* 等级变更记录（仅非管理员页面显示） */}
                         {!isAdminPage && (
                           <div>
                             <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>等级变更记录:</Typography.Text>
                             <div style={{ padding: '16px 16px 0', background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))', borderRadius: 8, minHeight: 60, border: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}>
                               {levelLogsLoading ? (
                                 <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /></div>
                               ) : levelLogs.length === 0 ? (
                                 <Typography.Text type="secondary">暂无等级变更记录</Typography.Text>
                               ) : (
                                 <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                   <Timeline
                                     items={levelLogs.map((log: any) => {
                                       const sourceMap: Record<string, { label: string; color: string }> = {
                                         admin: { label: '管理员', color: 'blue' },
                                         marketing: { label: '推广负责人', color: 'purple' },
                                         system: { label: '系统自动', color: 'default' },
                                       };
                                       const src = sourceMap[log.source] || { label: log.source, color: 'default' };
                                       return {
                                         color: src.color === 'blue' ? 'blue' : src.color === 'purple' ? 'purple' : 'gray',
                                         children: (
                                           <div style={{ paddingBottom: 4 }}>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                               <Text type="secondary" style={{ fontSize: 12 }}>
                                                 {formatApiDateTime(log.created_at)}
                                               </Text>
                                               <Tag color={src.color === 'blue' ? 'blue' : src.color === 'purple' ? 'purple' : 'default'} style={{ fontSize: 11, margin: 0 }}>
                                                 {src.label}
                                               </Tag>
                                             </div>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                               <Tag color="default" style={{ fontSize: 12, margin: 0 }}>
                                                 {log.old_level_name || log.old_level || '—'}
                                               </Tag>
                                               <Text style={{ fontSize: 12 }}>→</Text>
                                               <Tag color="success" style={{ fontSize: 12, margin: 0 }}>
                                                 {log.new_level_name || log.new_level || '—'}
                                               </Tag>
                                             </div>
                                             <div style={{ marginTop: 4 }}>
                                               <Text type="secondary" style={{ fontSize: 12 }}>
                                                 操作人：{log.operator || '未知'}
                                                 {log.remark ? `  ·  ${log.remark}` : ''}
                                               </Text>
                                             </div>
                                           </div>
                                         ),
                                       };
                                     })}
                                   />
                                 </div>
                               )}
                             </div>
                           </div>
                         )}
                       </div>
                     )
                   },
                  {
                    key: '3',
                    label: '账号绑定',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
                        {[{
                          label: '📧 邮箱',
                          bound: isRealEmail(editingUser.email),
                          value: isRealEmail(editingUser.email) ? editingUser.email : null,
                        }, {
                          label: '📱 手机号',
                          bound: !!editingUser.mobile,
                          value: editingUser.mobile || null,
                        }, {
                          label: '🔵 Google',
                          bound: !!editingUser.google_id,
                          value: editingUser.google_name || editingUser.google_id || null,
                        }, {
                          label: '💬 微信',
                          bound: !!editingUser.wechat_id,
                          value: editingUser.wechat_name || editingUser.wechat_id || null,
                        }].map(item => (
                          <div key={item.label} style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))', border: '1px solid var(--ant-color-border-secondary, #f0f0f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space>
                              <Typography.Text strong>{item.label}</Typography.Text>
                              {item.bound && item.value && <Typography.Text type="secondary" style={{ fontSize: 13 }}>{item.value}</Typography.Text>}
                            </Space>
                            <Tag color={item.bound ? 'success' : 'default'}>{item.bound ? '已绑定' : '未绑定'}</Tag>
                          </div>
                        ))}
                      </div>
                    )
                  }] : []),
                  // ── 支付设置 Tab（仅非管理员页面显示） ──
                  ...(!isAdminPage ? [{
                    key: '5',
                    label: '支付设置',
                    children: (
                      <div style={{ marginTop: 8 }}>
                        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                          控制该用户是否可使用在线充值功能。关闭后，用户端「我的钱包」将不显示在线充值按钮，且无法发起任何支付请求。
                        </Typography.Text>
                        <div style={{ padding: '16px 20px', background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.1)' }}>
                          <Form.Item
                            name="pay_enabled"
                            label="在线支付"
                            initialValue={1}
                            style={{ marginBottom: 0 }}
                            extra="开启后用户可在「我的钱包」使用在线充值功能（支付宝、微信、Stripe、加密货币等）"
                          >
                            <Radio.Group buttonStyle="solid" optionType="button">
                              <Radio value={1}>✅ 允许支付</Radio>
                              <Radio value={0}>🚫 禁止支付</Radio>
                            </Radio.Group>
                          </Form.Item>
                        </div>
                      </div>
                    )
                  }] : []),
                  // ── 模型折扣 Tab（仅编辑模式 + 非管理员页面） ──
                  ...((editingUser && !isAdminPage) ? [{
                    key: '4',
                    label: '模型折扣',
                    children: (
                      <div style={{ marginTop: 8 }}>
                        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                          为该用户针对特定模型设置单独折扣。系统取 MIN(用户模型折扣, 全站折扣, 用户等级折扣) 最低值，再与渠道倍率相乘；若模型开启折扣限价则对乘积 MAX 保底。
                        </Typography.Text>
                        <Row gutter={24}>
                          {/* 左侧：已选模型及折扣设置 */}
                          <Col xs={24} md={10}>
                            <div style={{ padding: 16, background: _isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 8, minHeight: 300 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text strong>已选模型折扣 ({discountMids.length})</Text>
                              </div>
                              {discountMids.length === 0 ? (
                                <Text type="secondary" style={{ fontSize: 13 }}>从右侧选择模型后设置折扣</Text>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                                  {discountMids.map(mid => {
                                    const model = availableModels.find((m: any) => m.mid === mid);
                                    const discount = discountMap[mid];
                                    const siteDiscount = model?.site_discount_enabled ? model.site_discount : null;
                                    return (
                                      <div key={mid} style={{ padding: '8px 12px', background: _isLight ? '#fff' : 'rgba(255,255,255,0.06)', borderRadius: 6, border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {model ? model.name : mid}
                                              {model?.remark && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: 4, fontSize: 11 }}>({model.remark})</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{model ? model.model_id : ''} · MID: {mid}</div>
                                          </div>
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<CloseOutlined style={{ fontSize: 10 }} />}
                                            style={{ width: 20, height: 20, minWidth: 20, color: 'var(--text-secondary)' }}
                                            onClick={() => {
                                              setDiscountMids(prev => prev.filter(id => id !== mid));
                                              setDiscountMap(prev => { const n = { ...prev }; delete n[mid]; return n; });
                                            }}
                                          />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <InputNumber
                                            size="small"
                                            min={siteDiscount !== null ? siteDiscount : 0}
                                            max={2}
                                            step={0.05}
                                            precision={2}
                                            value={discount}
                                            onChange={(val) => setDiscountMap(prev => ({ ...prev, [mid]: val ?? 1 }))}
                                            style={{ width: 100 }}
                                            placeholder="折扣倍率"
                                            addonAfter="x"
                                          />
                                          <Text type="secondary" style={{ fontSize: 11 }}>
                                            {discount !== undefined ? `${(discount * 100).toFixed(0)}%` : '未设置'}
                                          </Text>
                                          {siteDiscount !== null && (
                                            <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                                              限价 {siteDiscount}x
                                            </Tag>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </Col>
                          {/* 右侧：ModelSelector 选择模型 */}
                          <Col xs={24} md={14}>
                            <div style={{ padding: 16, background: _isLight ? '#fff' : 'rgba(255,255,255,0.02)', border: _isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                              <ModelSelector
                                selectedMids={discountMids}
                                onSelectionChange={(mids) => {
                                  setDiscountMids(mids);
                                }}
                                onModelsLoaded={(models) => setAvailableModels(models)}
                                allowDuplicateModelId={true}
                                isLightTheme={_isLight}
                                title="选择模型"
                              />
                            </div>
                          </Col>
                        </Row>
                      </div>
                    )
                  }] : []),
                  // ── 用户实名 Tab（仅编辑普通用户） ──
                  ...((editingUser && !isAdminPage) ? [{
                    key: '6',
                    label: (
                      <span>
                        用户实名
                        {kycCount > 0 ? (
                          <Tag color="blue" style={{ marginLeft: screens.xs ? 4 : 8, fontSize: screens.xs ? 10 : 12, padding: screens.xs ? '0 4px' : undefined }}>
                            {screens.xs ? `${kycCount}` : `${kycCount} 条实名`}
                          </Tag>
                        ) : null}
                      </span>
                    ),
                    children: (
                      <UserKycListManager
                        userId={editingUser.uid || editingUser.id}
                        username={editingUser.username}
                        onKycCountChange={(cnt) => setKycCount(cnt)}
                      />
                    ),
                  }] : [])
                ]}
              />

              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <Button type="primary" onClick={() => form.submit()} style={screens.xs ? { flex: 1 } : undefined}>保存</Button>
                <Button onClick={handleBackToList} style={screens.xs ? { flex: 1 } : undefined}>取消</Button>
              </div>
            </Form>
          </div>
          )}
        </div>
      )}

      <Modal
        title={`修改${contactFilter?.kind === 'email' ? '邮箱' : '手机号'}绑定上限`}
        open={limitModalOpen}
        onCancel={() => setLimitModalOpen(false)}
        onOk={saveContactLimit}
        confirmLoading={limitSaving}
        okText="保存"
        cancelText="取消"
      >
        <Space vertical size="middle" className="w-full">
          <Text type="secondary">
            {contactFilter?.value}
            {contactBind ? `，当前已绑定 ${contactBind.bound_count} 个账号` : ''}
          </Text>
          <InputNumber
            min={Math.max(1, contactBind?.bound_count ?? 1)}
            max={99}
            precision={0}
            value={limitDraft}
            onChange={(v) => setLimitDraft(Number(v) || 1)}
            style={{ width: 160 }}
          />
          {contactBind?.is_override && (
            <Button onClick={resetContactLimit} loading={limitSaving}>
              恢复站点默认（{contactBind.default_limit}）
            </Button>
          )}
        </Space>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WalletOutlined style={{ color: '#1677ff' }} />
            <span>{t('users.recharge')}</span>
          </div>
        }
        open={isRechargeModalVisible}
        onCancel={() => setIsRechargeModalVisible(false)}
        onOk={() => rechargeForm.submit()}
        confirmLoading={rechargeLoading}
        width={560}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ 
              width: 24, height: 24, borderRadius: '50%', 
              background: _isLight ? '#e6f4ff' : 'rgba(22,119,255,0.15)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8 
            }}>
              <UserOutlined style={{ fontSize: 13, color: '#1677ff' }} />
            </div>
            <Text type="secondary" style={{ fontSize: 13, marginRight: 6 }}>{t('users.username')}:</Text>
            <Text strong style={{ fontSize: 14 }}>{rechargingUser?.username}</Text>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 2, display: 'block' }}>系统钱包余额</Text>
              <Text strong style={{ color: '#1677ff', fontSize: 16, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {currencySymbol}{(rechargingUser?.balance || 0).toFixed(6)}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 2, display: 'block' }}>赠送钱包余额</Text>
              <Text strong style={{ color: '#faad14', fontSize: 16, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                🎁 {currencySymbol}{(rechargingUser?.gift_balance || 0).toFixed(6)}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 2, display: 'block' }}>信控额度</Text>
              <Text strong style={{ color: '#1890ff', fontSize: 16, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                💳 {currencySymbol}{(rechargingUser?.credit_limit || 0).toFixed(6)}
              </Text>
            </div>
          </div>
        </div>

        <Form form={rechargeForm} layout="vertical" onFinish={confirmRechargeSave} initialValues={{ actionType: 'increase', amount: '', walletType: 'system' }}>
          <Form.Item name="walletType" label={<Text strong style={{ fontSize: 13 }}>充值到哪个钱包</Text>} rules={[{ required: true }]} style={{ marginBottom: 10 }}>
            <Radio.Group style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Radio.Button value="system" style={{ textAlign: 'center', borderRadius: 6 }}>系统钱包 (正常充值)</Radio.Button>
              <Radio.Button value="gift" style={{ textAlign: 'center', borderRadius: 6 }}>赠送钱包 (活动赠送)</Radio.Button>
              <Radio.Button value="credit" style={{ textAlign: 'center', borderRadius: 6 }}>💳 信控额度</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Alert
            type="warning"
            showIcon
            message={
              <Text strong style={{ fontSize: 13, color: _isLight ? '#d46b08' : '#faad14' }}>
                所有用户赠送、消费补偿、返现请选择赠送钱包充值
              </Text>
            }
            style={{ marginBottom: 14, borderRadius: 6, padding: '8px 12px' }}
          />
          
          <Form.Item name="actionType" label={<Text strong style={{ fontSize: 13 }}>操作类型</Text>} rules={[{ required: true }]} style={{ marginBottom: 14 }}>
            <Radio.Group style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <Radio.Button value="increase" style={{ textAlign: 'center', borderRadius: 6 }}>
                增加金额 (+)
              </Radio.Button>
              <Radio.Button value="decrease" style={{ textAlign: 'center', borderRadius: 6 }}>
                减少金额 (-)
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          
          <Form.Item 
            name="amount" 
            label={<Text strong style={{ fontSize: 13 }}>{t('users.adjustment_amount')}</Text>} 
            style={{ marginBottom: 14 }}
            rules={[
              { required: true, message: '请输入调整金额' },
              {
                validator: async (_, value) => {
                  if (value === undefined || value === null || value === '') {
                    return Promise.resolve();
                  }
                  const num = Number(value);
                  if (isNaN(num) || !isFinite(num)) {
                    return Promise.reject(new Error('请输入有效的数字金额'));
                  }
                  const reg = /^-?\d+(\.\d{1,6})?$/;
                  if (!reg.test(value.toString())) {
                    return Promise.reject(new Error('请输入正确的金额格式（最多保留六位小数，可为负数）'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input 
              style={{ width: '100%', borderRadius: 6 }} 
              size="large"
              prefix={<span style={{ color: 'var(--ant-color-text-secondary)', marginRight: 4 }}>{currencySymbol}</span>}
              placeholder="0.000000"
            />
          </Form.Item>
          
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              快捷输入：<span style={{ color: '#1677ff', fontWeight: 500 }}>{
                rechargeWalletType === 'system' ? '系统钱包 (正常充值)' : 
                rechargeWalletType === 'gift' ? '赠送钱包 (活动赠送)' : '💳 信控额度'
              }</span>
            </Text>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: 8 
            }}>
              {[10, 50, 100, 500, 1000, 10000, 20000, 100000].map(val => (
                <Button 
                  key={val} 
                  style={{ 
                    borderRadius: 6,
                    height: 32,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 500,
                    fontSize: 13,
                    color: rechargeActionType === 'decrease' ? '#ff4d4f' : '#52c41a', 
                    borderColor: rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.4)' : 'rgba(82, 196, 26, 0.4)',
                    background: rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.04)' : 'rgba(82, 196, 26, 0.04)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = rechargeActionType === 'decrease' ? '#ff4d4f' : '#52c41a';
                    e.currentTarget.style.background = rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.1)' : 'rgba(82, 196, 26, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.4)' : 'rgba(82, 196, 26, 0.4)';
                    e.currentTarget.style.background = rechargeActionType === 'decrease' ? 'rgba(255, 77, 79, 0.04)' : 'rgba(82, 196, 26, 0.04)';
                  }}
                  onClick={() => {
                    const cur = rechargeForm.getFieldValue('amount') || 0;
                    rechargeForm.setFieldsValue({ amount: Math.round((cur + val) * 1_000_000) / 1_000_000 });
                  }}
                >
                  {rechargeActionType === 'decrease' ? '-' : '+'}{val}
                </Button>
              ))}
            </div>
          </div>
          
          <Form.Item name="remark" label={<Text strong style={{ fontSize: 13 }}>{t('users.remark')}</Text>} style={{ marginBottom: 0 }}>
            <Input.TextArea rows={2} placeholder="输入调整备注信息 (必填/选填，建议填写以便后续对账)" style={{ borderRadius: 6 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 钱包明细弹窗 ── */}
      <Modal
        title={`${walletDetailUser?.username || ''} 的钱包明细`}
        open={!!walletDetailUser}
        onCancel={() => { setWalletDetailUser(null); setWalletRecharges([]); }}
        footer={null}
        width={800}
        destroyOnClose
      >
        {walletDetailUser && (
          <WalletDetailsView 
            key={walletDetailUser.id}
            user={walletDetailUser} 
            recharges={walletRecharges} 
            loading={walletDetailLoading} 
          />
        )}
      </Modal>
    </Card>
  );
};

export default Users;

