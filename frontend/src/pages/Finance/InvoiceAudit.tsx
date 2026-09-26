/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Table,
  Card,
  Typography,
  Space,
  Input,
  Button,
  Tag,
  Select,
  DatePicker,
  Modal,
  Form,
  Drawer,
  message,
  Tooltip,
  Divider,
  Radio,
  Badge,
} from 'antd';
import {
  SyncOutlined,
  SearchOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
  EditOutlined,
  CopyOutlined,
  DownloadOutlined,
  UserOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { formatApiDateTime } from '../../utils/timedisplay';
import { toTimeRangeParams } from '../../utils/dateRangeParams';
import { useThemeStore } from '../../store/theme';
import { listPagination, useListPager } from '../../components/ListPagination';
import type { SellerInvoiceSubject } from '../../types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface InvoiceRequestRecord {
  id: number;
  request_no?: string;
  user_id: string;
  username?: string;
  user_email?: string;
  user_nickname?: string;
  user_uid?: string;
  invoice_type: string; // 'normal' | 'special'
  title_type: string;   // 'company' | 'personal'
  title: string;
  tax_number?: string;
  company_address?: string;
  company_phone?: string;
  bank_name?: string;
  bank_account?: string;
  amount: number;
  email: string;
  remark?: string;
  status: string;       // 'pending' | 'approved' | 'rejected'
  reject_reason?: string;
  invoice_file_url?: string;
  invoice_code?: string;
  invoice_number?: string;
  admin_remark?: string;
  issued_at?: string;
  operator_id?: string;
  operator_name?: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceStats {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  total_count: number;
  total_approved_amount: number;
  this_month_approved_amount: number;
}

const QUICK_REJECT_REASONS = [
  '纳税人识别号/统一社会信用代码有误或校验不通过',
  '专用发票开户行或银行账号信息缺失/不完整',
  '开票主体与实际充值支付结算主体不一致',
  '发票抬头与纳税人识别号不匹配',
  '开票金额超出实际可开具实付额度',
  '请核实开票信息后重新提交申请',
];

const InvoiceAudit: React.FC = () => {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.themeMode);
  const isLight = currentTheme === 'light';

  // 数据列表状态
  const [data, setData] = useState<InvoiceRequestRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const { page, pageSize, setPage, onChange } = useListPager();

  // 统计指标
  const [stats, setStats] = useState<InvoiceStats>({
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
    total_count: 0,
    total_approved_amount: 0,
    this_month_approved_amount: 0,
  });

  // 筛选状态
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [titleTypeFilter, setTitleTypeFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState<string>('');
  const [dateRange, setDateRange] = useState<[string, string] | undefined>();

  // 弹窗与抽屉控制
  const [issueModalOpen, setIssueModalOpen] = useState<boolean>(false);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState<boolean>(false);
  const [activeRecord, setActiveRecord] = useState<InvoiceRequestRecord | null>(null);
  const [isUpdatingExisting, setIsUpdatingExisting] = useState<boolean>(false);

  // 表单
  const [issueForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 数据获取
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp: any = await request.get('/finance/invoices', {
        params: {
          page,
          per_page: pageSize,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          invoice_type: typeFilter !== 'all' ? typeFilter : undefined,
          title_type: titleTypeFilter !== 'all' ? titleTypeFilter : undefined,
          keyword: keyword.trim() || undefined,
          ...toTimeRangeParams(dateRange),
        },
      });

      setData(resp.items || []);
      setTotal(resp.total || 0);
      if (resp.stats) {
        setStats(resp.stats);
      }
    } catch (err: any) {
      console.error('Failed to fetch invoice requests:', err);
      message.error(err?.message || '获取发票申请列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, typeFilter, titleTypeFilter, keyword, dateRange]);

  // 开票主体列表
  const [sellers, setSellers] = useState<SellerInvoiceSubject[]>([]);

  useEffect(() => {
    fetchData();
    request.get('/settings').then((res: any) => {
      if (res?.invoices?.invoice_sellers && Array.isArray(res.invoices.invoice_sellers) && res.invoices.invoice_sellers.length > 0) {
        setSellers(res.invoices.invoice_sellers);
      } else if (res?.invoices?.invoice_company_name) {
        setSellers([{
          id: 'seller_default',
          company_name: res.invoices.invoice_company_name,
          tax_id: res.invoices.invoice_tax_id || '',
          support_normal: true,
          support_special: true,
          is_default: true,
          enabled: true,
        }]);
      }
    }).catch(() => {});
  }, [fetchData]);

  // 打开开具/更新发票弹窗
  const handleOpenIssueModal = (record: InvoiceRequestRecord, isUpdate = false) => {
    setActiveRecord(record);
    setIsUpdatingExisting(isUpdate);
    const defaultSeller = sellers.find((s) => s.is_default) || sellers[0];
    issueForm.setFieldsValue({
      seller_id: defaultSeller?.id,
      invoice_number: record.invoice_number || '',
      invoice_code: record.invoice_code || '',
      invoice_file_url: record.invoice_file_url || '',
      admin_remark: record.admin_remark || '',
    });
    setIssueModalOpen(true);
  };

  // 提交发票开具/更新
  const handleIssueSubmit = async (values: any) => {
    if (!activeRecord) return;
    setSubmitting(true);
    try {
      const selectedSeller = sellers.find((s) => s.id === values.seller_id);
      const sellerPrefix = selectedSeller ? `[销方主体: ${selectedSeller.company_name}] ` : '';
      const finalRemark = values.admin_remark?.trim()
        ? (values.admin_remark.includes('销方主体:') ? values.admin_remark.trim() : `${sellerPrefix}${values.admin_remark.trim()}`)
        : (selectedSeller ? `[销方主体: ${selectedSeller.company_name}]` : undefined);

      await request.put(`/finance/invoices/${activeRecord.id}`, {
        action: isUpdatingExisting ? 'update' : 'approve',
        invoice_number: values.invoice_number?.trim(),
        invoice_code: values.invoice_code?.trim() || activeRecord.invoice_code || undefined,
        invoice_file_url: values.invoice_file_url?.trim() || undefined,
        admin_remark: finalRemark,
      });

      message.success(isUpdatingExisting ? '发票信息更新成功' : '发票开具成功并已标记审核通过');
      setIssueModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Failed to issue/update invoice:', err);
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 打开驳回弹窗
  const handleOpenRejectModal = (record: InvoiceRequestRecord) => {
    setActiveRecord(record);
    rejectForm.resetFields();
    setRejectModalOpen(true);
  };

  // 提交驳回
  const handleRejectSubmit = async (values: any) => {
    if (!activeRecord) return;
    setSubmitting(true);
    try {
      await request.put(`/finance/invoices/${activeRecord.id}`, {
        action: 'reject',
        reject_reason: values.reject_reason?.trim(),
        admin_remark: values.admin_remark?.trim() || undefined,
      });

      message.success('已驳回该发票申请');
      setRejectModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Failed to reject invoice:', err);
      message.error(err?.message || '驳回失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 复制文本提示
  const handleCopy = (text?: string, label = '内容') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    message.success(`已复制${label}到剪贴板`);
  };

  // 表格列定义
  const columns = [
    {
      title: '申请单号 / 时间',
      key: 'id_time',
      width: 170,
      render: (_: any, r: InvoiceRequestRecord) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text
              strong
              copyable={r.request_no ? { text: r.request_no } : undefined}
              style={{
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: isLight ? '#09090b' : '#fafafa',
              }}
            >
              {r.request_no || `#${r.id}`}
            </Text>
          </div>
          <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 2 }}>
            {formatApiDateTime(r.created_at)}
          </div>
        </div>
      ),
    },
    {
      title: '申请用户',
      key: 'user',
      width: 180,
      render: (_: any, r: InvoiceRequestRecord) => {
        const displayName = r.user_nickname || r.username || '匿名用户';
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserOutlined style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }} />
              <Text strong style={{ fontSize: 13, maxWidth: 140 }} ellipsis={{ tooltip: displayName }}>
                {displayName}
              </Text>
            </div>
            <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 2 }}>
              UID: {r.user_uid || r.user_id.slice(0, 8)}
            </div>
            {r.user_email && (
              <div style={{ fontSize: 11, color: isLight ? '#a1a1aa' : '#71717a', maxWidth: 150 }}>
                {r.user_email}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '发票类型 / 抬头主体',
      key: 'invoice_type_info',
      width: 250,
      render: (_: any, r: InvoiceRequestRecord) => {
        const isSpecial = r.invoice_type === 'special';
        const isCompany = r.title_type === 'company';
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Tag
                style={{
                  margin: 0,
                  fontSize: 11,
                  borderRadius: 4,
                  background: isSpecial
                    ? (isLight ? '#09090b' : '#fafafa')
                    : (isLight ? '#f4f4f5' : '#27272a'),
                  color: isSpecial
                    ? (isLight ? '#fafafa' : '#09090b')
                    : (isLight ? '#09090b' : '#fafafa'),
                  border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
                }}
              >
                {isSpecial ? '增值税专用发票' : '普通发票'}
              </Tag>
              <Tag
                style={{
                  margin: 0,
                  fontSize: 11,
                  borderRadius: 4,
                  background: isLight ? '#f4f4f5' : '#18181b',
                  color: isLight ? '#71717a' : '#a1a1aa',
                  border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                }}
              >
                {isCompany ? '企业' : '个人/非企业'}
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text strong style={{ fontSize: 13, maxWidth: 200 }} ellipsis={{ tooltip: r.title }}>
                {r.title}
              </Text>
              <CopyOutlined
                style={{ fontSize: 12, cursor: 'pointer', color: '#71717a' }}
                onClick={() => handleCopy(r.title, '发票抬头')}
              />
            </div>
            {r.tax_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 2 }}>
                <span>税号: {r.tax_number}</span>
                <CopyOutlined
                  style={{ fontSize: 11, cursor: 'pointer' }}
                  onClick={() => handleCopy(r.tax_number, '税号')}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '申请金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (val: number) => (
        <Text strong style={{ fontSize: 15, color: isLight ? '#09090b' : '#fafafa' }}>
          ¥{Number(val || 0).toFixed(2)}
        </Text>
      ),
    },
    {
      title: '接收邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 170,
      render: (email: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: email }}>
            {email}
          </Text>
          <CopyOutlined
            style={{ fontSize: 11, cursor: 'pointer', color: '#71717a' }}
            onClick={() => handleCopy(email, '接收邮箱')}
          />
        </div>
      ),
    },
    {
      title: '开票状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (st: string) => {
        if (st === 'approved') {
          return (
            <Tag
              icon={<CheckCircleOutlined />}
              style={{
                borderRadius: 4,
                background: isLight ? '#f0fdf4' : '#052e16',
                color: isLight ? '#16a34a' : '#4ade80',
                border: isLight ? '1px solid #bbf7d0' : '1px solid #166534',
              }}
            >
              已开具
            </Tag>
          );
        }
        if (st === 'rejected') {
          return (
            <Tag
              icon={<CloseCircleOutlined />}
              style={{
                borderRadius: 4,
                background: isLight ? '#fef2f2' : '#450a0a',
                color: isLight ? '#dc2626' : '#f87171',
                border: isLight ? '1px solid #fecaca' : '1px solid #991b1b',
              }}
            >
              已驳回
            </Tag>
          );
        }
        if (st === 'cancelled') {
          return (
            <Tag
              icon={<MinusCircleOutlined />}
              style={{
                borderRadius: 4,
                background: isLight ? '#f4f4f5' : '#27272a',
                color: isLight ? '#71717a' : '#a1a1aa',
                border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
              }}
            >
              已取消
            </Tag>
          );
        }
        return (
          <Tag
            icon={<ClockCircleOutlined />}
            style={{
              borderRadius: 4,
              background: isLight ? '#fffbeb' : '#451a03',
              color: isLight ? '#d97706' : '#fbbf24',
              border: isLight ? '1px solid #fde68a' : '1px solid #92400e',
            }}
          >
            待审核
          </Tag>
        );
      },
    },
    {
      title: '发票信息 / 审核流水',
      key: 'invoice_details',
      width: 220,
      render: (_: any, r: InvoiceRequestRecord) => {
        if (r.status === 'approved') {
          return (
            <div>
              {r.invoice_number && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <Text strong>号: {r.invoice_number}</Text>
                  <CopyOutlined
                    style={{ fontSize: 11, cursor: 'pointer', color: '#71717a' }}
                    onClick={() => handleCopy(r.invoice_number, '发票号码')}
                  />
                </div>
              )}
              {r.invoice_code && (
                <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>
                  代码: {r.invoice_code}
                </div>
              )}
              {r.invoice_file_url && (
                <div style={{ marginTop: 2 }}>
                  <a
                    href={r.invoice_file_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                  >
                    <DownloadOutlined /> 下载电子发票
                  </a>
                </div>
              )}
              {r.operator_name && (
                <div style={{ fontSize: 11, color: isLight ? '#a1a1aa' : '#71717a', marginTop: 2 }}>
                  经办人: {r.operator_name}
                </div>
              )}
            </div>
          );
        }

        if (r.status === 'rejected') {
          return (
            <div>
              <Tooltip title={r.reject_reason || '未填写驳回原因'}>
                <div style={{ fontSize: 12, color: isLight ? '#dc2626' : '#f87171', maxWidth: 190 }}>
                  驳回: {r.reject_reason || '-'}
                </div>
              </Tooltip>
              {r.operator_name && (
                <div style={{ fontSize: 11, color: isLight ? '#a1a1aa' : '#71717a', marginTop: 2 }}>
                  经办人: {r.operator_name}
                </div>
              )}
            </div>
          );
        }

        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.remark ? `用户备注: ${r.remark}` : '等待财务开票审核'}
          </Text>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: any, r: InvoiceRequestRecord) => {
        return (
          <Space size={8}>
            {r.status === 'pending' && (
              <>
                <Button
                  type="primary"
                  size="small"
                  style={{ borderRadius: 4, background: isLight ? '#09090b' : '#fafafa', color: isLight ? '#fafafa' : '#09090b' }}
                  onClick={() => handleOpenIssueModal(r, false)}
                >
                  开具发票
                </Button>
                <Button
                  size="small"
                  danger
                  style={{ borderRadius: 4 }}
                  onClick={() => handleOpenRejectModal(r)}
                >
                  驳回
                </Button>
              </>
            )}

            {r.status === 'approved' && (
              <Button
                size="small"
                icon={<EditOutlined />}
                style={{ borderRadius: 4 }}
                onClick={() => handleOpenIssueModal(r, true)}
              >
                更新信息
              </Button>
            )}

            {r.status === 'rejected' && (
              <Button
                size="small"
                style={{ borderRadius: 4 }}
                onClick={() => handleOpenIssueModal(r, false)}
              >
                重新开具
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 600, color: isLight ? '#09090b' : '#fafafa' }}>
            发票申请审核
          </Title>
          <Text type="secondary" style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>
            中国大陆境内增值税普通发票与专用发票申请集中流转与开具管理
          </Text>
        </div>
        <Button
          icon={<SyncOutlined spin={loading} />}
          onClick={fetchData}
          style={{ borderRadius: 6, border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a' }}
        >
          刷新
        </Button>
      </div>

      {/* 核心指标统计卡片 (shadcn Card Grid 规范) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Card
          size="small"
          bordered={false}
          style={{
            borderRadius: 8,
            border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
            background: isLight ? '#ffffff' : '#141414',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>待处理申请</Text>
            {stats.pending_count > 0 && <Badge status="processing" color="#f59e0b" />}
          </div>
          <Title level={3} style={{ margin: '6px 0 0 0', color: stats.pending_count > 0 ? '#f59e0b' : (isLight ? '#09090b' : '#fafafa') }}>
            {stats.pending_count} <span style={{ fontSize: 14, fontWeight: 'normal', color: '#71717a' }}>笔</span>
          </Title>
          <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
            等待财务审批开具
          </div>
        </Card>

        <Card
          size="small"
          bordered={false}
          style={{
            borderRadius: 8,
            border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
            background: isLight ? '#ffffff' : '#141414',
          }}
        >
          <Text style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>累计已开票金额</Text>
          <Title level={3} style={{ margin: '6px 0 0 0', color: isLight ? '#09090b' : '#fafafa' }}>
            ¥{Number(stats.total_approved_amount || 0).toFixed(2)}
          </Title>
          <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
            已成功开具总计 {stats.approved_count} 笔
          </div>
        </Card>

        <Card
          size="small"
          bordered={false}
          style={{
            borderRadius: 8,
            border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
            background: isLight ? '#ffffff' : '#141414',
          }}
        >
          <Text style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>本月已开票金额</Text>
          <Title level={3} style={{ margin: '6px 0 0 0', color: isLight ? '#09090b' : '#fafafa' }}>
            ¥{Number(stats.this_month_approved_amount || 0).toFixed(2)}
          </Title>
          <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
            自然月已开具增值税发票
          </div>
        </Card>

        <Card
          size="small"
          bordered={false}
          style={{
            borderRadius: 8,
            border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
            background: isLight ? '#ffffff' : '#141414',
          }}
        >
          <Text style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>申请总量与驳回</Text>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
            <Title level={3} style={{ margin: 0, color: isLight ? '#09090b' : '#fafafa' }}>
              {stats.total_count}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              已驳回: <span style={{ color: stats.rejected_count > 0 ? '#ef4444' : 'inherit' }}>{stats.rejected_count}</span>
            </Text>
          </div>
          <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>
            全生命周期申请总量
          </div>
        </Card>
      </div>

      {/* 筛选与操作卡片 */}
      <Card
        size="small"
        bordered={false}
        style={{
          borderRadius: 8,
          border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
          background: isLight ? '#ffffff' : '#141414',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* 状态切换 Tab / Radio */}
          <Radio.Group
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="all">全部申请</Radio.Button>
            <Radio.Button value="pending">
              待审核 {stats.pending_count > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>({stats.pending_count})</span>}
            </Radio.Button>
            <Radio.Button value="approved">已开具</Radio.Button>
            <Radio.Button value="rejected">已驳回</Radio.Button>
          </Radio.Group>

          {/* 组合筛选器 */}
          <Space wrap size={10}>
            <Select
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                setPage(1);
              }}
              style={{ width: 140 }}
              options={[
                { label: '全部发票类型', value: 'all' },
                { label: '普通发票', value: 'normal' },
                { label: '专用发票', value: 'special' },
              ]}
            />

            <Select
              value={titleTypeFilter}
              onChange={(val) => {
                setTitleTypeFilter(val);
                setPage(1);
              }}
              style={{ width: 130 }}
              options={[
                { label: '全部抬头', value: 'all' },
                { label: '企业单位', value: 'company' },
                { label: '个人/非企业', value: 'personal' },
              ]}
            />

            <RangePicker
              value={dateRange as any}
              onChange={(_dates, dateStrings) => {
                if (dateStrings && dateStrings[0] && dateStrings[1]) {
                  setDateRange([dateStrings[0], dateStrings[1]]);
                } else {
                  setDateRange(undefined);
                }
                setPage(1);
              }}
              style={{ width: 240 }}
            />

            <Input
              placeholder="搜索 UID/用户名/抬头/税号/发票号"
              prefix={<SearchOutlined style={{ color: '#a1a1aa' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                fetchData();
              }}
              style={{ width: 230 }}
              allowClear
            />

            <Button
              type="primary"
              style={{
                borderRadius: 6,
                background: isLight ? '#09090b' : '#fafafa',
                color: isLight ? '#fafafa' : '#09090b',
              }}
              onClick={() => {
                setPage(1);
                fetchData();
              }}
            >
              查询
            </Button>
          </Space>
        </div>
      </Card>

      {/* 主数据表格 */}
      <Card
        size="small"
        bordered={false}
        style={{
          borderRadius: 8,
          border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
          background: isLight ? '#ffffff' : '#141414',
        }}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          scroll={{ x: 1100 }}
          pagination={listPagination({
            current: page,
            pageSize,
            total,
            onChange,
          })}
        />
      </Card>

      {/* 财务开具发票 / 更新发票信息弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: isLight ? '#09090b' : '#fafafa' }} />
            <span>{isUpdatingExisting ? '更新发票信息' : '开具增值税发票'}</span>
          </Space>
        }
        open={issueModalOpen}
        onCancel={() => setIssueModalOpen(false)}
        footer={null}
        destroyOnClose
        width={560}
      >
        {activeRecord && (
          <div>
            {/* 申请单基础摘要卡片 */}
            <div
              style={{
                padding: '12px 16px',
                background: isLight ? '#f4f4f5' : '#18181b',
                border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13,
              }}
            >
              {/* 1. 发票抬头 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: isLight ? '#71717a' : '#a1a1aa', fontSize: 13 }}>发票抬头：</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>
                    {activeRecord.title}
                  </span>
                  <Tooltip title="复制发票抬头">
                    <CopyOutlined
                      style={{ fontSize: 12, cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa' }}
                      onClick={() => handleCopy(activeRecord.title, '发票抬头')}
                    />
                  </Tooltip>
                </div>
              </div>

              {/* 2. 发票类型 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: isLight ? '#71717a' : '#a1a1aa', fontSize: 13 }}>发票类型：</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>
                  {activeRecord.invoice_type === 'special'
                    ? '增值税专用发票 (企业)'
                    : `增值税普通发票 (${activeRecord.title_type === 'company' ? '企业' : '个人'})`}
                </span>
              </div>

              {/* 3. 纳税人税号 */}
              {activeRecord.tax_number && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa', fontSize: 13 }}>纳税人税号：</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: isLight ? '#09090b' : '#fafafa', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                      {activeRecord.tax_number}
                    </span>
                    <Tooltip title="复制税号">
                      <CopyOutlined
                        style={{ fontSize: 12, cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa' }}
                        onClick={() => handleCopy(activeRecord.tax_number, '纳税人税号')}
                      />
                    </Tooltip>
                  </div>
                </div>
              )}

              {/* 4. 开票金额 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: isLight ? '#71717a' : '#a1a1aa', fontSize: 13 }}>开票金额：</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>
                    ¥{Number(activeRecord.amount).toFixed(2)}
                  </span>
                  <Tooltip title="复制金额">
                    <CopyOutlined
                      style={{ fontSize: 12, cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa' }}
                      onClick={() => handleCopy(Number(activeRecord.amount).toFixed(2), '开票金额')}
                    />
                  </Tooltip>
                </div>
              </div>

              {/* 5. 接收邮箱 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: isLight ? '#71717a' : '#a1a1aa', fontSize: 13 }}>接收邮箱：</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: isLight ? '#09090b' : '#fafafa' }}>
                    {activeRecord.email}
                  </span>
                  <Tooltip title="复制接收邮箱">
                    <CopyOutlined
                      style={{ fontSize: 12, cursor: 'pointer', color: isLight ? '#71717a' : '#a1a1aa' }}
                      onClick={() => handleCopy(activeRecord.email, '接收邮箱')}
                    />
                  </Tooltip>
                </div>
              </div>
            </div>

            <Form
              form={issueForm}
              layout="vertical"
              onFinish={handleIssueSubmit}
              autoComplete="off"
            >
              {sellers.length > 0 && (
                <Form.Item
                  name="seller_id"
                  label="开具发票的销方主体 (Seller Subject)"
                >
                  <Select
                    placeholder="请选择开票主体"
                    options={sellers.map((s) => {
                      const isSpecial = activeRecord?.invoice_type === 'special';
                      const isSupported = isSpecial ? s.support_special : s.support_normal;
                      return {
                        value: s.id,
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{s.company_name} {s.is_default ? '(默认)' : ''}</span>
                            <Space size={4}>
                              <Tag color={s.support_normal ? 'blue' : 'default'} style={{ fontSize: 10, margin: 0 }}>
                                普票: {s.support_normal ? '支持' : '不支持'}
                              </Tag>
                              <Tag color={s.support_special ? 'purple' : 'default'} style={{ fontSize: 10, margin: 0 }}>
                                专票: {s.support_special ? '支持' : '不支持'}
                              </Tag>
                              {!isSupported && (
                                <Tag color="error" style={{ fontSize: 10, margin: 0 }}>
                                  资质不匹配
                                </Tag>
                              )}
                            </Space>
                          </div>
                        ),
                      };
                    })}
                  />
                </Form.Item>
              )}

              <Form.Item
                name="invoice_number"
                label="发票号码 (Invoice Number)"
                rules={[{ required: true, message: '请输入发票号码' }]}
              >
                <Input placeholder="如：24112000000012345678" />
              </Form.Item>

              <Form.Item
                name="invoice_file_url"
                label="电子发票下载链接 / PDF 直链 (File URL)"
              >
                <Input placeholder="https://..." />
              </Form.Item>

              <Form.Item
                name="admin_remark"
                label="财务内部备注 (Admin Remark)"
              >
                <Input.TextArea rows={2} placeholder="如：已开具电子发票并发送邮件，寄送单号SF..." />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <Button onClick={() => setIssueModalOpen(false)}>取消</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  style={{
                    borderRadius: 6,
                    background: isLight ? '#09090b' : '#fafafa',
                    color: isLight ? '#fafafa' : '#09090b',
                  }}
                >
                  {isUpdatingExisting ? '保存并更新发票信息' : '确认已开票并审核通过'}
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Modal>

      {/* 驳回申请弹窗 */}
      <Modal
        title={
          <Space>
            <CloseCircleOutlined style={{ color: '#ef4444' }} />
            <span>驳开发票申请</span>
          </Space>
        }
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        {activeRecord && (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>
              正在驳回 <Text strong>{activeRecord.title}</Text> 的发票申请（申请单 #{activeRecord.id}，金额 ¥{Number(activeRecord.amount).toFixed(2)}）。驳回后该笔金额将退回到用户的剩余可开票额度中。
            </div>

            <Form
              form={rejectForm}
              layout="vertical"
              onFinish={handleRejectSubmit}
            >
              <div style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }}>快捷填入常见驳回原因：</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {QUICK_REJECT_REASONS.map((reason) => (
                    <Tag
                      key={reason}
                      style={{ cursor: 'pointer', borderRadius: 4 }}
                      onClick={() => rejectForm.setFieldsValue({ reject_reason: reason })}
                    >
                      {reason.length > 18 ? `${reason.slice(0, 18)}...` : reason}
                    </Tag>
                  ))}
                </div>
              </div>

              <Form.Item
                name="reject_reason"
                label="驳回原因（将直接展示给申请用户）"
                rules={[{ required: true, message: '请填写驳回原因' }]}
              >
                <Input.TextArea rows={3} placeholder="请详细说明驳回原因，指导用户修改后重新提交..." />
              </Form.Item>

              <Form.Item
                name="admin_remark"
                label="内部审核备注（选填）"
              >
                <Input placeholder="财务内部留存备注" />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                <Button onClick={() => setRejectModalOpen(false)}>取消</Button>
                <Button type="primary" danger htmlType="submit" loading={submitting} style={{ borderRadius: 6 }}>
                  确认驳回申请
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Modal>

      {/* 详情查看抽屉 (Drawer) */}
      <Drawer
        title="发票申请全量详细信息"
        width={540}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        extra={
          activeRecord && activeRecord.status === 'pending' ? (
            <Space>
              <Button size="small" danger onClick={() => {
                setDetailDrawerOpen(false);
                handleOpenRejectModal(activeRecord);
              }}>
                驳回
              </Button>
              <Button size="small" type="primary" onClick={() => {
                setDetailDrawerOpen(false);
                handleOpenIssueModal(activeRecord, false);
              }}>
                开具发票
              </Button>
            </Space>
          ) : null
        }
      >
        {activeRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 状态看板 */}
            <div
              style={{
                padding: '16px',
                borderRadius: 8,
                background: isLight ? '#f4f4f5' : '#18181b',
                border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }}>申请金额</div>
                  <Title level={3} style={{ margin: '4px 0 0 0' }}>
                    ¥{Number(activeRecord.amount).toFixed(2)}
                  </Title>
                </div>
                <div>
                  {activeRecord.status === 'approved' && (
                    <Tag color="success" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 4 }}>已开具发票</Tag>
                  )}
                  {activeRecord.status === 'rejected' && (
                    <Tag color="error" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 4 }}>已驳回申请</Tag>
                  )}
                  {activeRecord.status === 'pending' && (
                    <Tag color="warning" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 4 }}>待财务审核</Tag>
                  )}
                </div>
              </div>

              {activeRecord.reject_reason && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: isLight ? '#fef2f2' : '#450a0a', borderRadius: 6, fontSize: 12, color: '#ef4444' }}>
                  驳回原因：{activeRecord.reject_reason}
                </div>
              )}
            </div>

            {/* 发票与抬头信息 */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileTextOutlined /> 发票基础资质信息
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>申请单号：</span>
                  <Text strong copyable style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {activeRecord.request_no || `#${activeRecord.id}`}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>发票类型：</span>
                  <Text strong>{activeRecord.invoice_type === 'special' ? '增值税专用发票' : '增值税普通发票'}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>抬头主体：</span>
                  <Text>{activeRecord.title_type === 'company' ? '企业' : '个人'}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>发票抬头：</span>
                  <Text strong copyable>{activeRecord.title}</Text>
                </div>
                {activeRecord.tax_number && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>纳税人税号：</span>
                    <Text code copyable>{activeRecord.tax_number}</Text>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>接收邮箱：</span>
                  <Text copyable>{activeRecord.email}</Text>
                </div>
              </div>
            </div>

            {/* 增值税专用发票专有资质信息 */}
            {activeRecord.invoice_type === 'special' && (
              <div>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BankOutlined /> 增值税专用发票开票资质
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>开户银行：</span>
                    <Text copyable>{activeRecord.bank_name || '-'}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>银行账号：</span>
                    <Text code copyable>{activeRecord.bank_account || '-'}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>企业注册地址：</span>
                    <Text style={{ maxWidth: 300, textAlign: 'right' }} copyable>{activeRecord.company_address || '-'}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>企业注册电话：</span>
                    <Text copyable>{activeRecord.company_phone || '-'}</Text>
                  </div>
                </div>
              </div>
            )}

            {/* 发票已开具信息 */}
            {activeRecord.status === 'approved' && (
              <div>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircleOutlined style={{ color: '#16a34a' }} /> 已开具发票信息
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>发票号码：</span>
                    <Text strong code copyable>{activeRecord.invoice_number || '-'}</Text>
                  </div>
                  {activeRecord.invoice_code && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>发票代码：</span>
                      <Text copyable>{activeRecord.invoice_code}</Text>
                    </div>
                  )}
                  {activeRecord.invoice_file_url && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>发票文件：</span>
                      <a href={activeRecord.invoice_file_url} target="_blank" rel="noreferrer">
                        查看并下载发票 PDF
                      </a>
                    </div>
                  )}
                  {activeRecord.admin_remark && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>财务备注：</span>
                      <Text>{activeRecord.admin_remark}</Text>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>开票时间：</span>
                    <Text>{activeRecord.issued_at ? formatApiDateTime(activeRecord.issued_at) : '-'}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: isLight ? '#71717a' : '#a1a1aa' }}>经办财务：</span>
                    <Text>{activeRecord.operator_name || activeRecord.operator_id || '-'}</Text>
                  </div>
                </div>
              </div>
            )}

            {/* 用户备注留言 */}
            {activeRecord.remark && (
              <div>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>用户申请留言</div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 6,
                    background: isLight ? '#f4f4f5' : '#18181b',
                    fontSize: 13,
                  }}
                >
                  {activeRecord.remark}
                </div>
              </div>
            )}

            {/* 流水单信息 */}
            <div>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }}>
                <div>申请编号：#{activeRecord.id}</div>
                <div>申请提交时间：{formatApiDateTime(activeRecord.created_at)}</div>
                <div>最新更新时间：{formatApiDateTime(activeRecord.updated_at)}</div>
                <div>申请用户账号 ID：{activeRecord.user_id}</div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default InvoiceAudit;
