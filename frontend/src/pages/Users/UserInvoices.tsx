/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Typography,
  Space,
  Input,
  Button,
  Tag,
  DatePicker,
  Radio,
  Drawer,
  Descriptions,
  message,
  Spin,
  Tooltip,
  Row,
  Col,
  Statistic,
  Select,
  Alert,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  SyncOutlined,
  SearchOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
  DownloadOutlined,
  UserOutlined,
  AuditOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import request from '../../utils/request';
import { formatApiDateTime } from '../../utils/timedisplay';
import { toTimeRangeParams } from '../../utils/dateRangeParams';
import { listPagination, useListPager } from '../../components/ListPagination';
import InvoiceDocumentPreview from '../../components/InvoiceDocumentPreview';
import useSettingsStore from '../../store/settings';
import type {
  FundTypeStats,
  InvoiceConfig,
  InvoiceItem,
  InvoiceRequestRecord,
  ReceiptItem,
  User,
} from '../../types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface InvoiceStats {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  total_count: number;
  total_approved_amount: number;
  this_month_approved_amount: number;
}

type IntlDocKind = 'invoice' | 'receipt';

interface BillingParty {
  display_name?: string;
  subject_type?: string;
  doc_number?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface AdminCustomerProfile {
  display_name: string;
  account_id: string;
  email?: string;
  phone?: string;
  kyc_type: string;
  company_name?: string;
  company_doc_number?: string;
  real_name?: string;
  id_doc_number?: string;
  address?: string;
  is_completed?: boolean;
  personal_subject?: BillingParty;
  enterprise_subject?: BillingParty;
}

interface AdminUserInvoicePayload {
  enabled: boolean;
  mode: string;
  config: InvoiceConfig;
  fund_stats?: FundTypeStats;
  customer_profile?: AdminCustomerProfile;
  invoices: InvoiceItem[];
  receipts: ReceiptItem[];
}

interface IntlDocument {
  kind: IntlDocKind;
  id: string;
  order_id?: number;
  date: string;
  raw_date: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment?: string;
  description?: string;
  transaction_id?: string;
  fund_type?: string;
  fund_type_label?: string;
}

const emptyChinaStats: InvoiceStats = {
  pending_count: 0,
  approved_count: 0,
  rejected_count: 0,
  total_count: 0,
  total_approved_amount: 0,
  this_month_approved_amount: 0,
};

function formatPaymentMethod(method?: string) {
  if (!method) return '-';
  const key = method.toLowerCase();
  if (key === 'stripe') return 'Stripe';
  if (key === 'alipay') return 'Alipay';
  if (key === 'wechat' || key === 'wechatpay' || key === 'wechat_pay') return 'WeChat Pay';
  return method;
}

function resolveBilledParty(profile?: AdminCustomerProfile) {
  const sub = profile?.enterprise_subject || profile?.personal_subject;
  return {
    name: sub?.display_name || profile?.company_name || profile?.real_name || profile?.display_name || '-',
    taxId: sub?.doc_number || profile?.company_doc_number || profile?.id_doc_number || '',
    email: sub?.email || profile?.email || '',
    phone: sub?.phone || profile?.phone || '',
    address: sub?.address || profile?.address || '',
    kind: sub?.subject_type || profile?.kyc_type || '',
  };
}

function toInvoiceItem(doc: IntlDocument): InvoiceItem {
  return {
    id: doc.id,
    order_id: doc.order_id,
    date: doc.date,
    raw_date: doc.raw_date,
    payment: doc.payment || 'paid',
    amount: doc.amount,
    currency: doc.currency,
    payment_method: doc.payment_method,
    description: doc.description || '',
    fund_type: doc.fund_type,
    fund_type_label: doc.fund_type_label,
  };
}

function toReceiptItem(doc: IntlDocument): ReceiptItem {
  return {
    id: doc.id,
    order_id: doc.order_id,
    date: doc.date,
    raw_date: doc.raw_date,
    amount: doc.amount,
    currency: doc.currency,
    payment_method: doc.payment_method,
    transaction_id: doc.transaction_id,
    fund_type: doc.fund_type,
    fund_type_label: doc.fund_type_label,
  };
}

const UserInvoices: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';

  const invoiceSettings = settings?.invoices;
  const isInvoiceEnabled = invoiceSettings?.invoice_enabled !== false;
  const invoiceMode = invoiceSettings?.invoice_mode || 'international';
  const isChinaMode = invoiceMode === 'china';
  const settingsCurrency = isChinaMode
    ? (invoiceSettings?.invoice_currency_symbol || '¥')
    : (invoiceSettings?.invoice_currency_symbol || settings?.currency?.currency_symbol || '$');

  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState<boolean>(true);

  const [data, setData] = useState<InvoiceRequestRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const { page, pageSize, onChange } = useListPager();

  const [stats, setStats] = useState<InvoiceStats>(emptyChinaStats);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRequestRecord | null>(null);
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);

  const [intlPayload, setIntlPayload] = useState<AdminUserInvoicePayload | null>(null);
  const [selectedIntlDoc, setSelectedIntlDoc] = useState<IntlDocument | null>(null);

  const currencySymbol = isChinaMode
    ? settingsCurrency
    : (intlPayload?.config?.currency_symbol || settingsCurrency);
  const showIntlInvoices = intlPayload?.config?.show_invoices ?? invoiceSettings?.invoice_show_invoices !== false;
  const showIntlReceipts = intlPayload?.config?.show_receipts ?? invoiceSettings?.invoice_show_receipts !== false;

  const fetchUserInfo = useCallback(async () => {
    if (!userId) return;
    setUserLoading(true);
    try {
      const res: any = await request.get(`/users/${userId}`);
      if (res?.data) {
        setTargetUser(res.data);
      } else if (res?.id) {
        setTargetUser(res);
      }
    } catch (e) {
      console.error('Failed to fetch user details:', e);
    } finally {
      setUserLoading(false);
    }
  }, [userId]);

  const fetchChinaInvoices = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const timeParams = dateRange ? toTimeRangeParams(dateRange) : {};
      const params: Record<string, any> = {
        user_id: userId,
        page,
        per_page: pageSize,
        ...timeParams,
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (typeFilter !== 'all') {
        params.invoice_type = typeFilter;
      }
      if (keyword.trim()) {
        params.keyword = keyword.trim();
      }

      const resp: any = await request.get('/finance/invoices', { params });
      setData(resp?.items || []);
      setTotal(resp?.total || 0);
      if (resp?.stats) {
        setStats(resp.stats);
      }
    } catch (err: any) {
      console.error('Failed to load user invoice records:', err);
      message.error(err?.message || '加载用户开票历史记录失败');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize, statusFilter, typeFilter, keyword, dateRange]);

  const fetchIntlDocuments = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const resp: AdminUserInvoicePayload = await request.get(`/users/${userId}/invoices`);
      setIntlPayload(resp || null);
    } catch (err: any) {
      console.error('Failed to load international invoice documents:', err);
      message.error(err?.message || '加载发票与收据记录失败');
      setIntlPayload(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUserInfo();
  }, [fetchUserInfo]);

  useEffect(() => {
    if (isChinaMode) {
      fetchChinaInvoices();
      return;
    }
    fetchIntlDocuments();
  }, [isChinaMode, fetchChinaInvoices, fetchIntlDocuments]);

  const intlDocuments = useMemo<IntlDocument[]>(() => {
    const invoices = showIntlInvoices ? (intlPayload?.invoices || []) : [];
    const receipts = showIntlReceipts ? (intlPayload?.receipts || []) : [];
    const docs: IntlDocument[] = [
      ...invoices.map((inv) => ({
        kind: 'invoice' as const,
        id: inv.id,
        order_id: inv.order_id,
        date: inv.date,
        raw_date: inv.raw_date,
        amount: inv.amount,
        currency: inv.currency,
        payment_method: inv.payment_method,
        payment: inv.payment,
        description: inv.description,
        fund_type: inv.fund_type,
        fund_type_label: inv.fund_type_label,
      })),
      ...receipts.map((rec) => ({
        kind: 'receipt' as const,
        id: rec.id,
        order_id: rec.order_id,
        date: rec.date,
        raw_date: rec.raw_date,
        amount: rec.amount,
        currency: rec.currency,
        payment_method: rec.payment_method,
        transaction_id: rec.transaction_id,
        fund_type: rec.fund_type,
        fund_type_label: rec.fund_type_label,
      })),
    ];
    docs.sort((a, b) => {
      const ta = a.raw_date ? new Date(a.raw_date).getTime() : 0;
      const tb = b.raw_date ? new Date(b.raw_date).getTime() : 0;
      return tb - ta;
    });
    return docs;
  }, [intlPayload, showIntlInvoices, showIntlReceipts]);

  const filteredIntlDocuments = useMemo(() => {
    let docs = intlDocuments;
    if (typeFilter === 'invoice' || typeFilter === 'receipt') {
      docs = docs.filter((d) => d.kind === typeFilter);
    }
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      docs = docs.filter((d) => {
        const hay = [
          d.id,
          d.payment_method,
          d.transaction_id,
          d.description,
          d.fund_type_label,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(kw);
      });
    }
    if (dateRange) {
      const start = dateRange[0].startOf('day');
      const end = dateRange[1].endOf('day');
      docs = docs.filter((d) => {
        if (!d.raw_date) return false;
        const t = dayjs(d.raw_date);
        return !t.isBefore(start) && !t.isAfter(end);
      });
    }
    return docs;
  }, [intlDocuments, typeFilter, keyword, dateRange]);

  const pagedIntlDocuments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredIntlDocuments.slice(start, start + pageSize);
  }, [filteredIntlDocuments, page, pageSize]);

  const billedParty = useMemo(
    () => resolveBilledParty(intlPayload?.customer_profile),
    [intlPayload?.customer_profile],
  );

  useEffect(() => {
    if (isChinaMode) return;
    const maxPage = Math.max(1, Math.ceil(filteredIntlDocuments.length / pageSize) || 1);
    if (page > maxPage) {
      onChange(maxPage, pageSize);
    }
  }, [filteredIntlDocuments.length, isChinaMode, page, pageSize, onChange]);

  const handleSearch = () => {
    onChange(1, pageSize);
    if (isChinaMode) {
      fetchChinaInvoices();
    }
  };

  const handleReset = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setKeyword('');
    setDateRange(null);
    onChange(1, pageSize);
  };

  const handleRefresh = () => {
    fetchUserInfo();
    if (isChinaMode) {
      fetchChinaInvoices();
    } else {
      fetchIntlDocuments();
    }
  };

  const renderChinaInvoiceTypeTag = (val: string) => {
    if (val === 'special') {
      return <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>增值税专用发票</Tag>;
    }
    return <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>增值税普通发票</Tag>;
  };

  const renderIntlTypeTag = (kind: IntlDocKind) => {
    if (kind === 'receipt') {
      return <Tag color="green" style={{ margin: 0, fontSize: 11 }}>付款收据 (Receipt)</Tag>;
    }
    return <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>商业发票 (Invoice)</Tag>;
  };

  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Tag icon={<ClockCircleOutlined />} color="warning" style={{ margin: 0, fontSize: 11 }}>
            待审核
          </Tag>
        );
      case 'approved':
        return (
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, fontSize: 11 }}>
            已开票
          </Tag>
        );
      case 'rejected':
        return (
          <Tag icon={<CloseCircleOutlined />} color="error" style={{ margin: 0, fontSize: 11 }}>
            已驳回
          </Tag>
        );
      case 'cancelled':
        return (
          <Tag icon={<MinusCircleOutlined />} color="default" style={{ margin: 0, fontSize: 11 }}>
            已取消
          </Tag>
        );
      default:
        return <Tag style={{ margin: 0, fontSize: 11 }}>{status}</Tag>;
    }
  };

  const chinaColumns = [
    {
      title: '申请单号 / 发票号',
      key: 'identifiers',
      width: 180,
      render: (_: unknown, record: InvoiceRequestRecord) => (
        <Space vertical size={1}>
          <Text
            copyable={{ text: record.request_no || String(record.id) }}
            style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', whiteSpace: 'nowrap' }}
          >
            {record.request_no || `#${record.id}`}
          </Text>
          {record.invoice_number && (
            <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              发票: {record.invoice_number}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '发票类型',
      dataIndex: 'invoice_type',
      key: 'invoice_type',
      width: 130,
      render: (val: string) => renderChinaInvoiceTypeTag(val),
    },
    {
      title: '发票抬头',
      key: 'title',
      width: 180,
      ellipsis: true,
      render: (_: unknown, record: InvoiceRequestRecord) => {
        const isCompany = record.title_type === 'company';
        return (
          <Space vertical size={1} style={{ maxWidth: '100%' }}>
            <Space size={4} style={{ maxWidth: '100%', overflow: 'hidden' }}>
              <Tag color={isCompany ? 'cyan' : 'default'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>
                {isCompany ? '企业' : '个人'}
              </Tag>
              <Text strong ellipsis={{ tooltip: record.title }} style={{ fontSize: 12 }}>
                {record.title}
              </Text>
            </Space>
            {record.tax_number && (
              <Text type="secondary" ellipsis={{ tooltip: record.tax_number }} style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                税号: {record.tax_number}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '开票金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right' as const,
      render: (amt: number, record: InvoiceRequestRecord) => (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'monospace',
            color: record.status === 'approved' ? '#10b981' : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {currencySymbol}
          {Number(amt || 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: '接收邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 160,
      ellipsis: true,
      render: (email: string) => (
        <Text copyable={{ text: email }} style={{ fontSize: 12 }}>
          {email || '-'}
        </Text>
      ),
    },
    {
      title: '审核状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (st: string) => renderStatusTag(st),
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {formatApiDateTime(time)}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_: unknown, record: InvoiceRequestRecord) => (
        <Space size={6}>
          <Button
            size="small"
            type="link"
            style={{ padding: 0, fontSize: 12 }}
            onClick={() => {
              setSelectedInvoice(record);
              setDrawerVisible(true);
            }}
          >
            查看详情
          </Button>
          {record.status === 'approved' && record.invoice_file_url && (
            <Tooltip title="下载电子发票文件">
              <Button
                size="small"
                type="link"
                icon={<DownloadOutlined />}
                style={{ padding: 0, color: '#10b981' }}
                onClick={() => window.open(record.invoice_file_url, '_blank')}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const intlColumns = [
    {
      title: '凭证编号',
      key: 'id',
      width: 190,
      render: (_: unknown, record: IntlDocument) => (
        <Space vertical size={1}>
          <Text copyable={{ text: record.id }} style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {record.id}
          </Text>
          {record.transaction_id && (
            <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              Txn: {record.transaction_id}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '凭证类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 170,
      render: (kind: IntlDocKind) => renderIntlTypeTag(kind),
    },
    {
      title: '账单抬头 (Billed To)',
      key: 'billed_to',
      width: 180,
      ellipsis: true,
      render: () => {
        const isCompany = billedParty.kind === 'enterprise';
        return (
          <Space vertical size={1} style={{ maxWidth: '100%' }}>
            <Space size={4} style={{ maxWidth: '100%', overflow: 'hidden' }}>
              {billedParty.kind && billedParty.kind !== 'unverified' && (
                <Tag color={isCompany ? 'cyan' : 'default'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>
                  {isCompany ? '企业' : '个人'}
                </Tag>
              )}
              <Text strong ellipsis={{ tooltip: billedParty.name }} style={{ fontSize: 12 }}>
                {billedParty.name}
              </Text>
            </Space>
            {billedParty.taxId && (
              <Text type="secondary" ellipsis={{ tooltip: billedParty.taxId }} style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                Tax ID: {billedParty.taxId}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '支付方式',
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 130,
      render: (method: string, record: IntlDocument) => (
        <Space size={4} align="center">
          <Text style={{ fontSize: 12 }}>{formatPaymentMethod(method)}</Text>
          {record.payment === 'paid' && (
            <Tag color="success" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>paid</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right' as const,
      render: (amt: number, record: IntlDocument) => (
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: '#10b981', whiteSpace: 'nowrap' }}>
          {record.currency || currencySymbol}
          {Number(amt || 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: '资金类型',
      dataIndex: 'fund_type',
      key: 'fund_type',
      width: 110,
      render: (_: string, record: IntlDocument) => (
        <Tag color={record.fund_type === 'gift_bonus' ? 'default' : 'blue'} style={{ margin: 0, fontSize: 11 }}>
          {record.fund_type_label || (record.fund_type === 'gift_bonus' ? '活动赠送' : '实付资金')}
        </Tag>
      ),
    },
    {
      title: '开具时间',
      dataIndex: 'raw_date',
      key: 'raw_date',
      width: 140,
      render: (time: string, record: IntlDocument) => (
        <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {time ? formatApiDateTime(time) : record.date}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: IntlDocument) => (
        <Button
          size="small"
          type="link"
          style={{ padding: 0, fontSize: 12 }}
          onClick={() => {
            setSelectedIntlDoc(record);
          }}
        >
          查看详情
        </Button>
      ),
    },
  ];

  const intlInvoiceCount = intlDocuments.filter((d) => d.kind === 'invoice').length;
  const intlReceiptCount = intlDocuments.filter((d) => d.kind === 'receipt').length;
  const fundStats = intlPayload?.fund_stats;

  return (
    <div className="compact-invoices-page" style={{ padding: '0 4px', animation: 'fadeIn 0.25s ease' }}>
      <style>{`
        .compact-invoices-page .ant-table-thead > tr > th {
          padding: 6px 8px !important;
          font-size: 12px !important;
          white-space: nowrap;
        }
        .compact-invoices-page .ant-table-tbody > tr > td {
          padding: 5px 8px !important;
          font-size: 12px !important;
        }
        .compact-invoices-page .ant-pagination {
          margin: 8px 0 0 !important;
        }
      `}</style>
      {!isInvoiceEnabled && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10, borderRadius: 8 }}
          message={isChinaMode ? '全局开票服务当前未开启' : 'Invoices 收据与发票服务当前未开启'}
          description="系统设置「站点设置 - 支付设置 - 收据与发票」中服务处于关闭状态。当前页面仅供查阅与归档该用户历史开票数据。"
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={10} align="center">
          <Button
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/${adminPath}/users`)}
            style={{ borderRadius: 6 }}
          >
            返回用户列表
          </Button>
          <div>
            <div style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <FileTextOutlined style={{ color: '#fa8c16', fontSize: 15 }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                {isChinaMode ? '用户开票历史记录' : '用户发票与收据记录'}
              </span>
              <Tag color={isChinaMode ? 'orange' : 'blue'} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
                {isChinaMode ? '🇨🇳 境内增值税发票' : '🌐 国际凭证 (Invoices & Receipts)'}
              </Tag>
              {targetUser?.username && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({targetUser.username} · UID: {targetUser.uid || targetUser.id})
                </Text>
              )}
            </div>
          </div>
        </Space>

        <Space size={8}>
          {isChinaMode && (
            <Button
              size="small"
              icon={<AuditOutlined />}
              onClick={() => navigate(`/${adminPath}/finance/invoices`)}
            >
              发票审核中心
            </Button>
          )}
          <Button size="small" icon={<SyncOutlined spin={loading} />} onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
      </div>

      <Card
        size="small"
        bordered={false}
        styles={{ body: { padding: '8px 12px' } }}
        style={{
          marginBottom: 10,
          borderRadius: 8,
          background: 'var(--ant-color-bg-container)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        }}
      >
        {userLoading ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Spin size="small" tip="正在加载用户基本资料..." />
          </div>
        ) : targetUser ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Space size={10} align="center">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(250, 140, 22, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fa8c16',
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                <UserOutlined />
              </div>
              <div>
                <Space size={6} align="center" wrap>
                  <Text strong style={{ fontSize: 14 }}>
                    {targetUser.username}
                  </Text>
                  {targetUser.nickname && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ({targetUser.nickname})
                    </Text>
                  )}
                  <Tag color="orange" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
                    {targetUser.user_group || '默认等级'}
                  </Tag>
                  <Tag color={targetUser.is_active ? 'success' : 'error'} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
                    {targetUser.is_active ? '正常' : '已禁用'}
                  </Tag>
                </Space>
                <div style={{ marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                  <span>
                    UID:{' '}
                    <Text code copyable={{ text: targetUser.uid || String(targetUser.id) }} style={{ fontSize: 11, fontFamily: 'monospace' }}>
                      {targetUser.uid || targetUser.id}
                    </Text>
                  </span>
                  {targetUser.email && (
                    <span>
                      邮箱: <Text copyable={{ text: targetUser.email }} style={{ fontSize: 11 }}>{targetUser.email}</Text>
                    </span>
                  )}
                  {targetUser.mobile && (
                    <span>手机: {targetUser.mobile}</span>
                  )}
                  {targetUser.register_ip && (
                    <span>注册IP: {targetUser.register_ip}</span>
                  )}
                </div>
              </div>
            </Space>

            <Space size={20} wrap>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)' }}>系统钱包余额</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1677ff', fontFamily: 'monospace' }}>
                  {currencySymbol}{Number(targetUser.balance || 0).toFixed(4)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)' }}>赠送钱包余额</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#52c41a', fontFamily: 'monospace' }}>
                  {currencySymbol}{Number(targetUser.gift_balance || 0).toFixed(4)}
                </div>
              </div>
            </Space>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>用户标识: {userId}</Text>
        )}
      </Card>

      {isChinaMode ? (
        <Row gutter={[8, 8]} style={{ marginBottom: 10 }}>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>累计已开票总额</span>}
                value={stats.total_approved_amount}
                precision={2}
                prefix={currencySymbol}
                valueStyle={{ color: '#10b981', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>本月已开票金额</span>}
                value={stats.this_month_approved_amount}
                precision={2}
                prefix={currencySymbol}
                valueStyle={{ color: '#059669', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>申请开票总数</span>}
                value={stats.total_count}
                suffix={<span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>笔</span>}
                valueStyle={{ color: '#1677ff', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>待审核 / 驳回</span>}
                value={stats.pending_count}
                suffix={
                  <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                    待审 / {stats.rejected_count} 驳回
                  </span>
                }
                valueStyle={{
                  color: stats.pending_count > 0 ? '#fa8c16' : 'var(--ant-color-text)',
                  fontWeight: 700,
                  fontSize: 18,
                  fontFamily: 'monospace',
                }}
              />
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={[8, 8]} style={{ marginBottom: 10 }}>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>累计实付金额</span>}
                value={fundStats?.total_real_paid || 0}
                precision={2}
                prefix={currencySymbol}
                valueStyle={{ color: '#10b981', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>商业发票 (Invoices)</span>}
                value={intlInvoiceCount}
                suffix={<span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>份</span>}
                valueStyle={{ color: '#1677ff', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>付款收据 (Receipts)</span>}
                value={intlReceiptCount}
                suffix={<span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>份</span>}
                valueStyle={{ color: '#059669', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" bordered={false} styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8 }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>赠送金（不可开具）</span>}
                value={fundStats?.total_gift_recharged || 0}
                precision={2}
                prefix={currencySymbol}
                valueStyle={{ color: 'var(--ant-color-text-secondary)', fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        size="small"
        bordered={false}
        styles={{ body: { padding: '10px 12px' } }}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {isChinaMode ? (
            <Radio.Group
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                onChange(1, pageSize);
              }}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部 ({stats.total_count})</Radio.Button>
              <Radio.Button value="pending">
                待审核 {stats.pending_count > 0 ? `(${stats.pending_count})` : ''}
              </Radio.Button>
              <Radio.Button value="approved">已开票 ({stats.approved_count})</Radio.Button>
              <Radio.Button value="rejected">已驳回 ({stats.rejected_count})</Radio.Button>
            </Radio.Group>
          ) : (
            <Radio.Group
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                onChange(1, pageSize);
              }}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部 ({intlDocuments.length})</Radio.Button>
              {showIntlInvoices && (
                <Radio.Button value="invoice">商业发票 ({intlInvoiceCount})</Radio.Button>
              )}
              {showIntlReceipts && (
                <Radio.Button value="receipt">付款收据 ({intlReceiptCount})</Radio.Button>
              )}
            </Radio.Group>
          )}

          <Space size={8} wrap>
            {isChinaMode && (
              <Select
                size="small"
                value={typeFilter}
                onChange={(val) => {
                  setTypeFilter(val);
                  onChange(1, pageSize);
                }}
                style={{ width: 140 }}
                options={[
                  { label: '全部发票类型', value: 'all' },
                  { label: '增值税普通发票', value: 'normal' },
                  { label: '增值税专用发票', value: 'special' },
                ]}
              />
            )}
            <Input
              size="small"
              placeholder={isChinaMode ? '搜索抬头/税号/单号/发票号' : '搜索凭证号/支付方式/交易号'}
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              style={{ width: 210 }}
            />
            <RangePicker
              size="small"
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as any);
                if (!isChinaMode) {
                  onChange(1, pageSize);
                }
              }}
              placeholder={isChinaMode ? ['申请起始', '申请截止'] : ['开具起始', '开具截止']}
              style={{ width: 220 }}
            />
            {isChinaMode && (
              <Button size="small" type="primary" onClick={handleSearch}>
                查询
              </Button>
            )}
            <Button size="small" onClick={handleReset}>重置</Button>
          </Space>
        </div>

        {isChinaMode ? (
          <Table
            rowKey="id"
            columns={chinaColumns}
            dataSource={data}
            loading={loading}
            pagination={listPagination({
              total,
              current: page,
              pageSize,
              onChange,
            })}
            scroll={{ x: 1000 }}
            size="small"
          />
        ) : (
          <Table
            rowKey={(record) => `${record.kind}-${record.id}`}
            columns={intlColumns}
            dataSource={pagedIntlDocuments}
            loading={loading}
            locale={{
              emptyText: (
                <Empty
                  description={
                    !showIntlInvoices && !showIntlReceipts
                      ? '站点已关闭国际模式 Invoices / Receipts 展示'
                      : '暂无商业发票或付款收据（仅实付订单会生成）'
                  }
                />
              ),
            }}
            pagination={listPagination({
              total: filteredIntlDocuments.length,
              current: page,
              pageSize,
              onChange,
            })}
            scroll={{ x: 1080 }}
            size="small"
          />
        )}
      </Card>

      <Drawer
        title={
          <Space size={8}>
            <FileTextOutlined style={{ color: '#fa8c16' }} />
            <span>发票申请详情</span>
            {selectedInvoice && renderStatusTag(selectedInvoice.status)}
          </Space>
        }
        open={drawerVisible && isChinaMode}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedInvoice(null);
        }}
        width={560}
      >
        {isChinaMode && selectedInvoice && (
          <Space vertical size={16} style={{ width: '100%' }}>
            <Descriptions title="基本开票信息" bordered column={1} size="small">
              <Descriptions.Item label="申请单号">
                <Text copyable={{ text: selectedInvoice.request_no || String(selectedInvoice.id) }}>
                  {selectedInvoice.request_no || `#${selectedInvoice.id}`}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="发票类型">
                {renderChinaInvoiceTypeTag(selectedInvoice.invoice_type)}
              </Descriptions.Item>
              <Descriptions.Item label="抬头类型">
                {selectedInvoice.title_type === 'company' ? '企业单位' : '个人 / 非企业单位'}
              </Descriptions.Item>
              <Descriptions.Item label="发票抬头">
                <Text strong>{selectedInvoice.title}</Text>
              </Descriptions.Item>
              {selectedInvoice.tax_number && (
                <Descriptions.Item label="纳税人识别号">
                  <Text copyable={{ text: selectedInvoice.tax_number }}>
                    {selectedInvoice.tax_number}
                  </Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="开票金额">
                <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                  {currencySymbol}{Number(selectedInvoice.amount || 0).toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="接收邮箱">
                <Text copyable={{ text: selectedInvoice.email }}>{selectedInvoice.email}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="申请时间">
                {formatApiDateTime(selectedInvoice.created_at)}
              </Descriptions.Item>
            </Descriptions>

            {(selectedInvoice.bank_name || selectedInvoice.company_address) && (
              <Descriptions
                title={
                  <Space size={6}>
                    <BankOutlined />
                    <span>对公企业开票资质</span>
                  </Space>
                }
                bordered
                column={1}
                size="small"
              >
                {selectedInvoice.bank_name && (
                  <Descriptions.Item label="开户银行">{selectedInvoice.bank_name}</Descriptions.Item>
                )}
                {selectedInvoice.bank_account && (
                  <Descriptions.Item label="银行账号">
                    <Text copyable={{ text: selectedInvoice.bank_account }}>
                      {selectedInvoice.bank_account}
                    </Text>
                  </Descriptions.Item>
                )}
                {selectedInvoice.company_address && (
                  <Descriptions.Item label="注册地址">{selectedInvoice.company_address}</Descriptions.Item>
                )}
                {selectedInvoice.company_phone && (
                  <Descriptions.Item label="注册电话">{selectedInvoice.company_phone}</Descriptions.Item>
                )}
              </Descriptions>
            )}

            <Descriptions title="审核与开具结果" bordered column={1} size="small">
              {selectedInvoice.remark && (
                <Descriptions.Item label="用户申请备注">
                  {selectedInvoice.remark}
                </Descriptions.Item>
              )}
              {selectedInvoice.invoice_code && (
                <Descriptions.Item label="发票代码">
                  {selectedInvoice.invoice_code}
                </Descriptions.Item>
              )}
              {selectedInvoice.invoice_number && (
                <Descriptions.Item label="发票号码">
                  <Text copyable={{ text: selectedInvoice.invoice_number }}>
                    {selectedInvoice.invoice_number}
                  </Text>
                </Descriptions.Item>
              )}
              {selectedInvoice.issued_at && (
                <Descriptions.Item label="开票时间">
                  {formatApiDateTime(selectedInvoice.issued_at)}
                </Descriptions.Item>
              )}
              {selectedInvoice.operator_name && (
                <Descriptions.Item label="审核经办人">
                  {selectedInvoice.operator_name}
                </Descriptions.Item>
              )}
              {selectedInvoice.admin_remark && (
                <Descriptions.Item label="财务审核备注">
                  {selectedInvoice.admin_remark}
                </Descriptions.Item>
              )}
              {selectedInvoice.reject_reason && (
                <Descriptions.Item label="驳回原因">
                  <span style={{ color: '#ef4444' }}>{selectedInvoice.reject_reason}</span>
                </Descriptions.Item>
              )}
              {selectedInvoice.invoice_file_url && (
                <Descriptions.Item label="电子发票文件">
                  <Button
                    type="primary"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => window.open(selectedInvoice.invoice_file_url, '_blank')}
                  >
                    在线查看 / 下载发票
                  </Button>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Drawer>

      {!isChinaMode && (
        <InvoiceDocumentPreview
          invoice={selectedIntlDoc?.kind === 'invoice' ? toInvoiceItem(selectedIntlDoc) : null}
          receipt={selectedIntlDoc?.kind === 'receipt' ? toReceiptItem(selectedIntlDoc) : null}
          onClose={() => setSelectedIntlDoc(null)}
          config={intlPayload?.config || {}}
          billedName={billedParty.name !== '-' ? billedParty.name : (targetUser?.nickname || targetUser?.username || '')}
          billedTaxId={billedParty.taxId}
          billedEmail={billedParty.email || targetUser?.email}
          billedPhone={billedParty.phone || targetUser?.mobile}
          billedAddress={billedParty.address}
          accountId={intlPayload?.customer_profile?.account_id || targetUser?.uid || targetUser?.id || ''}
          isEnterpriseCustomer={billedParty.kind === 'enterprise'}
        />
      )}
    </div>
  );
};

export default UserInvoices;
