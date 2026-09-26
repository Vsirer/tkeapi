/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Spin, message, Typography, Tag, Form, Input, InputNumber, Radio, Space, Table, Empty, Dropdown, Tooltip, Popconfirm, type MenuProps } from 'antd';
import { 
  WalletOutlined,
  PieChartOutlined,
  InfoCircleOutlined,
  DollarCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  IdcardOutlined,
  UserOutlined,
  BankOutlined,
  CheckOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import { formatApiDateTime } from '../../utils/timedisplay';
import { listPagination } from '../../components/ListPagination';
import InvoiceDocumentPreview from '../../components/InvoiceDocumentPreview';
import type { InvoiceConfig, InvoiceItem, ReceiptItem, InvoiceRequestRecord, FundTypeStats } from '../../types';

const { Title, Text, Paragraph } = Typography;

export interface BillingSubject {
  id?: number;
  subject_type: 'enterprise' | 'personal';
  display_name: string;
  doc_type?: string;
  doc_number?: string;
  email?: string;
  phone?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  is_default?: boolean;
  status?: string;
}

export interface CustomerProfile {
  display_name: string;
  account_id: string;
  email?: string;
  phone?: string;
  kyc_type: string;
  company_name?: string;
  company_doc_type?: string;
  company_doc_number?: string;
  company_email?: string;
  company_phone?: string;
  real_name?: string;
  id_doc_type?: string;
  id_doc_number?: string;
  personal_email?: string;
  personal_phone?: string;
  address?: string;
  is_completed: boolean;
  personal_subject?: BillingSubject;
  enterprise_subject?: BillingSubject;
  subjects?: BillingSubject[];
  has_multiple_subjects?: boolean;
}

interface InvoicesResponse {
  enabled: boolean;
  mode: string;
  config: InvoiceConfig;
  fund_stats?: FundTypeStats;
  customer_profile?: CustomerProfile;
  invoices: InvoiceItem[];
  receipts: ReceiptItem[];
  china_requests: InvoiceRequestRecord[];
  total_paid_amount: number;
}

interface ShadcnSegmentedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  tooltip?: string;
}

const ShadcnSegmented: React.FC<{
  value?: string;
  onChange?: (val: string) => void;
  options: ShadcnSegmentedOption[];
  isLight: boolean;
}> = ({ value, onChange, options, isLight }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: 3,
      borderRadius: 8,
      background: isLight ? '#f4f4f5' : '#27272a',
      border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
      gap: 3,
    }}
  >
    {options.map((opt) => {
      const isActive = value === opt.value;
      const isDisabled = !!opt.disabled;
      const btn = (
        <button
          key={opt.value}
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (!isDisabled) {
              onChange?.(opt.value);
            }
          }}
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: isActive ? 600 : 500,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            border: 'none',
            background: isActive
              ? (isLight ? '#ffffff' : '#18181b')
              : 'transparent',
            color: isActive
              ? (isLight ? '#09090b' : '#fafafa')
              : isDisabled
                ? (isLight ? '#a1a1aa' : '#52525b')
                : (isLight ? '#71717a' : '#a1a1aa'),
            opacity: isDisabled ? 0.55 : 1,
            boxShadow: isActive
              ? (isLight ? '0 1px 3px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.4)')
              : 'none',
            transition: 'all 0.15s ease',
            lineHeight: '18px',
          }}
        >
          {opt.label}
        </button>
      );

      if (opt.tooltip && isDisabled) {
        return (
          <Tooltip key={opt.value} title={opt.tooltip}>
            <span style={{ display: 'inline-block', cursor: 'not-allowed' }}>{btn}</span>
          </Tooltip>
        );
      }
      return btn;
    })}
  </div>
);

const Invoices: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const { user } = useAuthStore();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InvoicesResponse | null>(null);

  // Mode override for preview (if admin)
  const [previewMode, setPreviewMode] = useState<'international' | 'china'>('international');

  // Pagination for overseas mode
  const [invoicePage, setInvoicePage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);
  const pageSize = 5;

  // Selected item for modals
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);

  // China mode form
  const [chinaForm] = Form.useForm();
  const watchedChinaInvoiceType = Form.useWatch('invoice_type', chinaForm);
  const currentInvoiceType = watchedChinaInvoiceType || 'normal';
  const [submittingChinaRequest, setSubmittingChinaRequest] = useState(false);
  const [chinaActiveTab, setChinaActiveTab] = useState<'apply' | 'history'>('apply');

  // Helper to generate unique key for a billing subject
  const getSubjectKey = (sub: BillingSubject, idx: number) => {
    return sub.id ? `sub_${sub.id}` : `${sub.subject_type}_${sub.display_name}_${idx}`;
  };

  // Active subject selection ('enterprise' | 'personal' | 'none')
  const [activeSubjectType, setActiveSubjectType] = useState<'enterprise' | 'personal' | 'none'>('none');
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>(() => {
    return localStorage.getItem('invoices_selected_subject_key') || '';
  });

  // Apply billing subject to China Mode invoice form directly from user KYC / profile details
  const applyBillingSubject = (sub: BillingSubject, idx?: number) => {
    const key = getSubjectKey(sub, idx ?? 0);
    setSelectedSubjectKey(key);
    setActiveSubjectType(sub.subject_type as 'enterprise' | 'personal');
    localStorage.setItem('invoices_selected_subject_key', key);
    localStorage.setItem('invoices_active_subject_type', sub.subject_type);

    const isApprovedEnterprise = sub.subject_type === 'enterprise' && sub.status === 'approved';
    if (!isApprovedEnterprise) {
      chinaForm.setFieldsValue({
        invoice_type: 'normal',
      });
    }
  };

  const applySubjectToForm = (subType: 'enterprise' | 'personal', customerProfile?: CustomerProfile) => {
    const cp = customerProfile || data?.customer_profile;
    const subs: BillingSubject[] = (cp?.subjects && cp.subjects.length > 0)
      ? cp.subjects
      : ([cp?.enterprise_subject, cp?.personal_subject].filter(Boolean) as BillingSubject[]);
    const idx = subs.findIndex(s => s.subject_type === subType);
    if (idx >= 0) {
      applyBillingSubject(subs[idx], idx);
    } else {
      setActiveSubjectType(subType);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp: any = await request.get('/user/invoices');
      setData(resp);
      setPreviewMode((resp.mode as 'international' | 'china') || 'international');
      if (resp?.customer_profile) {
        const c = resp.customer_profile;
        const subs: BillingSubject[] = (c?.subjects && c.subjects.length > 0)
          ? c.subjects
          : ([c?.enterprise_subject, c?.personal_subject].filter(Boolean) as BillingSubject[]);

        const validSubs = subs.filter((s) => {
          if (s.subject_type === 'enterprise') {
            return !!(s.doc_number || c?.company_name || (s.display_name && s.display_name !== user?.username && s.display_name !== 'Enterprise Entity'));
          }
          return !!(s.doc_number || c?.real_name || c?.id_doc_number || (s.display_name && s.display_name !== user?.username && s.display_name !== user?.nickname && s.display_name !== 'Valued Customer'));
        });

        if (validSubs.length > 0) {
          const savedKey = localStorage.getItem('invoices_selected_subject_key');
          let defaultSub = validSubs.find((s, idx) => getSubjectKey(s, idx) === savedKey);
          let defaultIdx = defaultSub ? validSubs.findIndex((s, idx) => getSubjectKey(s, idx) === savedKey) : -1;
          if (!defaultSub) {
            defaultSub = validSubs.find((s) => s.is_default) || validSubs[0];
            defaultIdx = validSubs.indexOf(defaultSub);
          }
          applyBillingSubject(defaultSub, defaultIdx >= 0 ? defaultIdx : 0);
        } else {
          setActiveSubjectType('none');
          setSelectedSubjectKey('');
          localStorage.removeItem('invoices_selected_subject_key');
          localStorage.removeItem('invoices_active_subject_type');
          chinaForm.setFieldsValue({
            title_type: 'company',
            title: '',
            tax_number: '',
            company_phone: user?.mobile || '',
            company_address: '',
            bank_name: '',
            bank_account: '',
            email: user?.email || '',
          });
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const config = data?.config || {};
  const currencySymbol = config.currency_symbol || '$';
  const minInvoiceAmount = (config.china_min_amount && config.china_min_amount > 0) ? config.china_min_amount : 100;

  const fundStats: FundTypeStats = data?.fund_stats || {
    total_real_paid: data?.total_paid_amount || 0,
    total_gift_recharged: 0,
    total_real_consumed: 0,
    total_gift_consumed: 0,
    current_balance: 0,
    current_gift_balance: 0,
    current_credit_limit: 0,
    total_invoiced_amount: 0,
    remaining_invoiceable_amount: data?.total_paid_amount || 0,
  };

  // Customer / Payer Profile from completed user details
  const customer = data?.customer_profile;

  // Available Billing Subjects from profile (only actual approved/verified subjects)
  const availableSubjects: BillingSubject[] = useMemo(() => {
    if (customer?.subjects && customer.subjects.length > 0) {
      return customer.subjects;
    }
    const list: BillingSubject[] = [];
    if (customer?.enterprise_subject) {
      const ent = customer.enterprise_subject;
      if (
        ent.doc_number ||
        customer.company_name ||
        customer.company_doc_number ||
        (ent.display_name && ent.display_name !== user?.username && ent.display_name !== 'Enterprise Entity')
      ) {
        list.push(ent);
      }
    }
    if (customer?.personal_subject) {
      const per = customer.personal_subject;
      if (
        per.doc_number ||
        customer.real_name ||
        customer.id_doc_number ||
        (per.display_name &&
          per.display_name !== user?.username &&
          per.display_name !== user?.nickname &&
          per.display_name !== 'Valued Customer')
      ) {
        list.push(per);
      }
    }
    return list;
  }, [customer, user]);

  const hasEnterprise = availableSubjects.some((s) => s.subject_type === 'enterprise');
  const hasPersonal = availableSubjects.some((s) => s.subject_type === 'personal');
  const canSwitchSubject = availableSubjects.length > 1;

  // Determine active subject based on user selection
  const currentSubject: BillingSubject | undefined = useMemo(() => {
    if (availableSubjects.length === 0) {
      return undefined;
    }
    if (selectedSubjectKey) {
      const matched = availableSubjects.find((s, idx) => getSubjectKey(s, idx) === selectedSubjectKey);
      if (matched) return matched;
    }
    if (activeSubjectType !== 'none') {
      const matchedType = availableSubjects.find((s) => s.subject_type === activeSubjectType);
      if (matchedType) return matchedType;
    }
    const defaultSub = availableSubjects.find((s) => s.is_default);
    if (defaultSub) return defaultSub;

    if (customer?.kyc_type) {
      const matchedKyc = availableSubjects.find((s) => s.subject_type === customer.kyc_type);
      if (matchedKyc) return matchedKyc;
    }

    return availableSubjects[0];
  }, [availableSubjects, selectedSubjectKey, activeSubjectType, customer?.kyc_type]);

  const currentSubjectType = currentSubject?.subject_type || (customer?.kyc_type === 'enterprise' ? 'enterprise' : 'personal');
  const isEnterpriseCustomer = currentSubjectType === 'enterprise';
  const isApprovedEnterprise = currentSubject?.subject_type === 'enterprise' && currentSubject?.status === 'approved';

  const billedName = currentSubject?.display_name || customer?.display_name || user?.nickname || user?.username || '';
  const billedTaxId = currentSubject?.doc_number || (isEnterpriseCustomer ? customer?.company_doc_number : customer?.id_doc_number) || customer?.company_doc_number || customer?.id_doc_number;
  const billedEmail = currentSubject?.email || customer?.email || user?.email;
  const billedPhone = currentSubject?.phone || customer?.phone || user?.mobile;
  const billedAddress = currentSubject?.address || customer?.address;
  const accountId = customer?.account_id || user?.uid || user?.id || '';
  const hasCompletedProfile = availableSubjects.length > 0;

  // Auto-sync China Mode form when active subject changes
  useEffect(() => {
    if (currentSubject && availableSubjects.length > 0) {
      const isApprovedEnterprise = currentSubject.subject_type === 'enterprise' && currentSubject.status === 'approved';
      if (!isApprovedEnterprise) {
        chinaForm.setFieldsValue({ invoice_type: 'normal' });
      }
    }
  }, [currentSubject, availableSubjects.length, chinaForm]);

  // Unified, polished dropdown menu items for billing subject switcher
  const subjectDropdownItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = availableSubjects.map((sub, idx) => {
      const subKey = getSubjectKey(sub, idx);
      const isSelected = (currentSubject && getSubjectKey(currentSubject, availableSubjects.indexOf(currentSubject)) === subKey) || (selectedSubjectKey === subKey);
      const isEnt = sub.subject_type === 'enterprise';

      return {
        key: subKey,
        style: {
          padding: '8px 10px',
          borderRadius: 8,
          margin: '2px 0',
          background: isSelected
            ? (isLight ? 'rgba(22, 119, 255, 0.06)' : 'rgba(22, 119, 255, 0.14)')
            : undefined,
        },
        label: (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 260 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2,
                background: isSelected
                  ? (isLight ? '#e6f4ff' : 'rgba(22, 119, 255, 0.22)')
                  : (isLight ? '#f4f4f5' : 'rgba(255, 255, 255, 0.06)'),
                color: isSelected
                  ? (isLight ? '#1677ff' : '#69b1ff')
                  : (isLight ? '#71717a' : '#a1a1aa'),
              }}
            >
              {isEnt ? <BankOutlined style={{ fontSize: 16 }} /> : <UserOutlined style={{ fontSize: 16 }} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isSelected
                        ? (isLight ? '#1677ff' : '#69b1ff')
                        : (isLight ? '#71717a' : '#a1a1aa'),
                      lineHeight: '18px',
                    }}
                  >
                    {isEnt ? t('invoices_page.subject_enterprise', '企业开票主体') : t('invoices_page.subject_personal', '个人开票主体')}
                  </span>
                  {sub.status === 'approved' && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: isLight ? '#f4f4f5' : '#27272a',
                        border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
                        color: isLight ? '#18181b' : '#fafafa',
                        lineHeight: '14px',
                      }}
                    >
                      已认证
                    </span>
                  )}
                </div>
                {isSelected && (
                  <CheckOutlined style={{ color: isLight ? '#1677ff' : '#69b1ff', fontSize: 13, flexShrink: 0 }} />
                )}
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isLight ? '#18181b' : '#fafafa',
                  marginTop: 2,
                  lineHeight: '18px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sub.display_name || '-'}
              </div>

              {sub.doc_number && (
                <div
                  style={{
                    fontSize: 11,
                    color: isLight ? '#71717a' : '#a1a1aa',
                    marginTop: 2,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    lineHeight: '16px',
                  }}
                >
                  {isEnt ? `税号: ${sub.doc_number}` : `证件: ${sub.doc_number}`}
                </div>
              )}
            </div>
          </div>
        ),
        onClick: () => {
          applyBillingSubject(sub, idx);
        },
      };
    });

    if (items.length > 0) {
      items.push({ type: 'divider', style: { margin: '4px 0' } });
    }
    items.push({
      key: 'manage',
      icon: <SettingOutlined style={{ color: isLight ? '#71717a' : '#a1a1aa', fontSize: 14 }} />,
      label: (
        <span style={{ fontSize: 12, color: isLight ? '#3f3f46' : '#d4d4d8' }}>
          {t('invoices_page.manage_profile', '管理/完善主体信息')}
        </span>
      ),
      onClick: () => navigate('/profile'),
    });

    return items;
  }, [availableSubjects, currentSubject, selectedSubjectKey, isLight, t, navigate]);

  const invoicesList = useMemo(() => data?.invoices || [], [data?.invoices]);

  const receiptsList = useMemo(() => data?.receipts || [], [data?.receipts]);

  // 格式化日期与交易时间：中文菜单模式下展示中文对应日期与站点统一时间系统（时区使用 UTC 与站点统一保持一致），英文模式下保持标准英文格式
  const formatInvoiceDate = (inv: InvoiceItem) => {
    if (isZh) {
      return inv.raw_date ? formatApiDateTime(inv.raw_date, 'YYYY-MM-DD') : inv.date;
    }
    return inv.date;
  };

  const formatReceiptDate = (rec: ReceiptItem) => {
    if (isZh) {
      return rec.raw_date ? formatApiDateTime(rec.raw_date) : (rec.date || '').replace(/GMT/g, 'UTC');
    }
    return (rec.date || '').replace(/GMT/g, 'UTC');
  };

  // Paginated invoices
  const totalInvoices = invoicesList.length;
  const totalInvoicePages = Math.ceil(totalInvoices / pageSize) || 1;
  const paginatedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * pageSize;
    return invoicesList.slice(start, start + pageSize);
  }, [invoicesList, invoicePage, pageSize]);

  // Paginated receipts
  const totalReceipts = receiptsList.length;
  const totalReceiptPages = Math.ceil(totalReceipts / pageSize) || 1;
  const paginatedReceipts = useMemo(() => {
    const start = (receiptPage - 1) * pageSize;
    return receiptsList.slice(start, start + pageSize);
  }, [receiptsList, receiptPage, pageSize]);

  // Submit China invoice application
  const handleSubmitChinaRequest = async (values: any) => {
    if (availableSubjects.length === 0) {
      message.error('请先完善个人中心用户详细信息后再提交开票申请');
      return;
    }
    const sub = currentSubject || availableSubjects[0];
    if (!sub) {
      message.error('未找到有效的开票主体信息');
      return;
    }

    const isEnt = sub.subject_type === 'enterprise';
    const isApprovedEnt = isEnt && sub.status === 'approved';
    const invoiceType = isApprovedEnt ? (values.invoice_type || 'normal') : 'normal';

    const payload = {
      invoice_type: invoiceType,
      title_type: isEnt ? 'company' : 'personal',
      title: sub.display_name || '',
      tax_number: isEnt ? (sub.doc_number || '') : null,
      company_address: isEnt ? (sub.address || '') : null,
      company_phone: sub.phone || '',
      bank_name: isEnt ? (sub.bank_name || '') : null,
      bank_account: isEnt ? (sub.bank_account || '') : null,
      email: sub.email || user?.email || '',
      amount: Number(values.amount),
      remark: values.remark ? String(values.remark).trim() : null,
    };

    setSubmittingChinaRequest(true);
    try {
      const res: any = await request.post('/user/invoice_requests', payload);
      const reqNoStr = res?.request_no ? `（申请单号：${res.request_no}）` : '';
      message.success(`开票申请已成功提交${reqNoStr}，工作人员将在1-3个工作日内审核开具`);
      chinaForm.resetFields();
      if (currentSubject) {
        const idx = availableSubjects.indexOf(currentSubject);
        applyBillingSubject(currentSubject, idx >= 0 ? idx : 0);
      }
      setChinaActiveTab('history');
      fetchData();
    } catch (e: any) {
      console.error(e);
    } finally {
      setSubmittingChinaRequest(false);
    }
  };

  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Cancel China invoice application
  const handleCancelInvoiceRequest = async (id: number) => {
    setCancellingId(id);
    try {
      await request.post(`/user/invoice_requests/${id}/cancel`);
      message.success('开票申请已成功取消，额度已释放');
      await fetchData();
    } catch (e: any) {
      console.error(e);
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  const effectiveMode = previewMode;

  return (
    <div className="invoices-page-container" style={{ maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px 4px' }}>
      {/* Print CSS Styles for Standard A4 */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          /* Strict standard A4 dimensions for browser print layout */
          html, body {
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, .ant-modal-close, .ant-dropdown, .ant-modal-mask {
            display: none !important;
          }
          .ant-modal-wrap {
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .ant-modal {
            position: static !important;
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
            top: 0 !important;
            transform: none !important;
          }
          .ant-modal-content {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
          }
          .ant-modal-body {
            padding: 0 !important;
            margin: 0 !important;
          }
          .a4-preview-scroll {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            max-height: none !important;
            display: block !important;
          }
          /* Standard single-page A4 canvas with strict avoid-break rules */
          .printable-a4-sheet {
            position: relative !important;
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            min-height: 297mm !important;
            padding: 2.54cm 2.0cm 2.54cm 2.0cm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={3} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {t('invoices_page.title', effectiveMode === 'international' ? 'Invoices' : '财务发票')}
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              {t('invoices_page.subtitle', effectiveMode === 'international' 
                ? 'View and download your invoices.' 
                : '申请开具增值税发票，并查看已提交的开票流转记录。')}
            </Text>
          </div>

          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Admin mode switcher if admin is browsing */}
            {user?.role === 'admin' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: isLight ? '#f4f4f5' : '#27272a', padding: '4px 10px', borderRadius: 8, border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46' }}>
                <Text type="secondary" style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.admin_mode_switcher', '管理员模式切换:')}</Text>
                <Radio.Group 
                  size="small" 
                  value={previewMode} 
                  onChange={(e) => setPreviewMode(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="international">{t('invoices_page.mode_international', '🌐 国际模式')}</Radio.Button>
                  <Radio.Button value="china">{t('invoices_page.mode_china', '🇨🇳 境内模式')}</Radio.Button>
                </Radio.Group>
              </div>
            )}
          </div>
        </div>
      </div>

      {effectiveMode === 'international' ? (
        /* ================= 海外模式 (International Mode - Exactly matches Image 1) ================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Card 1: Invoices */}
          {config.show_invoices !== false && (
            <div 
              style={{
                borderRadius: 10,
                border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.1)',
                background: isLight ? '#ffffff' : 'var(--ant-color-bg-container, #1f1f23)',
                boxShadow: isLight ? '0 1px 3px rgba(0, 0, 0, 0.02)' : '0 1px 3px rgba(0, 0, 0, 0.2)',
                padding: '24px 28px',
              }}
            >
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: isLight ? '#111827' : '#f4f4f5' }}>
                  {t('invoices_page.card_invoices_title', 'Invoices')}
                </div>
                <div style={{ fontSize: 13, color: isLight ? '#6b7280' : '#a1a1aa', marginTop: 2 }}>
                  {t('invoices_page.card_invoices_subtitle', 'Your billing invoices and payment history')}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <th style={{ padding: '10px 0', fontSize: 13, fontWeight: 500, color: isLight ? '#6b7280' : '#a1a1aa' }}>
                        {t('invoices_page.col_date', 'Date')}
                      </th>
                      <th style={{ padding: '10px 0', fontSize: 13, fontWeight: 500, color: isLight ? '#6b7280' : '#a1a1aa' }}>
                        {t('invoices_page.col_payment', 'Payment')}
                      </th>
                      <th style={{ padding: '10px 0', fontSize: 13, fontWeight: 500, color: isLight ? '#6b7280' : '#a1a1aa' }}>
                        {t('invoices_page.col_amount', 'Amount')}
                      </th>
                      <th style={{ padding: '10px 0', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInvoices.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '48px 0' }}>
                          <Empty description={t('invoices_page.empty_no_invoices', '暂无发票记录')} />
                        </td>
                      </tr>
                    )}
                    {paginatedInvoices.map((inv) => (
                      <tr 
                        key={inv.id} 
                        style={{ 
                          borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.04)' : '1px solid rgba(255, 255, 255, 0.06)',
                          transition: 'background-color 0.2s',
                        }}
                      >
                        <td style={{ padding: '16px 0', fontSize: 14, fontWeight: 500, color: isLight ? '#111827' : '#f4f4f5' }}>
                          {formatInvoiceDate(inv)}
                        </td>
                        <td style={{ padding: '16px 0' }}>
                          <span 
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background: isLight ? '#f4f4f5' : '#27272a',
                              color: isLight ? '#18181b' : '#fafafa',
                              border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
                              textTransform: 'lowercase',
                            }}
                          >
                            {inv.payment === 'paid' ? t('invoices_page.paid_badge', 'paid') : inv.payment}
                          </span>
                        </td>
                        <td style={{ padding: '16px 0', fontSize: 14, fontWeight: 600, color: isLight ? '#111827' : '#f4f4f5' }}>
                          {inv.currency || currencySymbol}{inv.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 0', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(inv)}
                              style={{
                                background: isLight ? '#ffffff' : '#27272a',
                                border: isLight ? '1px solid #e5e7eb' : '1px solid #3f3f46',
                                color: isLight ? '#111827' : '#f4f4f5',
                                padding: '6px 14px',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : '0 1px 2px rgba(0,0,0,0.2)',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = isLight ? '#d1d5db' : '#52525b';
                                e.currentTarget.style.backgroundColor = isLight ? '#f9fafb' : '#3f3f46';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = isLight ? '#e5e7eb' : '#3f3f46';
                                e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : '#27272a';
                              }}
                            >
                              {t('invoices_page.btn_invoice', 'Invoice')}
                            </button>

                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginTop: 20, 
                  paddingTop: 12,
                  fontSize: 13, 
                  color: isLight ? '#6b7280' : '#a1a1aa',
                }}
              >
                <div>
                  {t('invoices_page.showing_results', {
                    start: totalInvoices === 0 ? 0 : (invoicePage - 1) * pageSize + 1,
                    end: Math.min(invoicePage * pageSize, totalInvoices),
                    total: totalInvoices,
                    count: paginatedInvoices.length,
                    defaultValue: `Showing ${paginatedInvoices.length} out of ${totalInvoices} results`,
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>
                    {t('invoices_page.page_info', {
                      current: invoicePage,
                      total: totalInvoicePages,
                      defaultValue: `Page ${invoicePage} of ${totalInvoicePages}`,
                    })}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={invoicePage <= 1}
                      onClick={() => setInvoicePage(p => Math.max(1, p - 1))}
                      style={{
                        background: isLight ? '#ffffff' : '#27272a',
                        border: isLight ? '1px solid #e5e7eb' : '1px solid #3f3f46',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: invoicePage <= 1 ? 'not-allowed' : 'pointer',
                        color: invoicePage <= 1 ? (isLight ? '#9ca3af' : '#71717a') : (isLight ? '#374151' : '#e4e4e7'),
                        opacity: invoicePage <= 1 ? 0.6 : 1,
                      }}
                    >
                      {t('invoices_page.prev_page', '< Previous')}
                    </button>
                    <button
                      type="button"
                      disabled={invoicePage >= totalInvoicePages}
                      onClick={() => setInvoicePage(p => Math.min(totalInvoicePages, p + 1))}
                      style={{
                        background: isLight ? '#ffffff' : '#27272a',
                        border: isLight ? '1px solid #e5e7eb' : '1px solid #3f3f46',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: invoicePage >= totalInvoicePages ? 'not-allowed' : 'pointer',
                        color: invoicePage >= totalInvoicePages ? (isLight ? '#9ca3af' : '#71717a') : (isLight ? '#374151' : '#e4e4e7'),
                        opacity: invoicePage >= totalInvoicePages ? 0.6 : 1,
                      }}
                    >
                      {t('invoices_page.next_page', 'Next >')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card 2: Receipts */}
          {config.show_receipts !== false && (
            <div 
              style={{
                borderRadius: 10,
                border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.1)',
                background: isLight ? '#ffffff' : 'var(--ant-color-bg-container, #1f1f23)',
                boxShadow: isLight ? '0 1px 3px rgba(0, 0, 0, 0.02)' : '0 1px 3px rgba(0, 0, 0, 0.2)',
                padding: '24px 28px',
              }}
            >
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: isLight ? '#111827' : '#f4f4f5' }}>
                  {t('invoices_page.card_receipts_title', 'Receipts')}
                </div>
                <div style={{ fontSize: 13, color: isLight ? '#6b7280' : '#a1a1aa', marginTop: 2 }}>
                  {t('invoices_page.card_receipts_subtitle', 'Your payment receipts and transaction history')}
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <th style={{ padding: '10px 0', fontSize: 13, fontWeight: 500, color: isLight ? '#6b7280' : '#a1a1aa' }}>
                        {t('invoices_page.col_receipt_date', 'Date')}
                      </th>
                      <th style={{ padding: '10px 0', fontSize: 13, fontWeight: 500, color: isLight ? '#6b7280' : '#a1a1aa' }}>
                        {t('invoices_page.col_amount', 'Amount')}
                      </th>
                      <th style={{ padding: '10px 0', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReceipts.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '48px 0' }}>
                          <Empty description={t('invoices_page.empty_no_receipts', '暂无收据记录')} />
                        </td>
                      </tr>
                    )}
                    {paginatedReceipts.map((rec) => (
                      <tr 
                        key={rec.id} 
                        style={{ 
                          borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.04)' : '1px solid rgba(255, 255, 255, 0.06)',
                          transition: 'background-color 0.2s',
                        }}
                      >
                        <td style={{ padding: '16px 0', fontSize: 14, fontWeight: 500, color: isLight ? '#111827' : '#f4f4f5' }}>
                          {formatReceiptDate(rec)}
                        </td>
                        <td style={{ padding: '16px 0', fontSize: 14, fontWeight: 600, color: isLight ? '#111827' : '#f4f4f5' }}>
                          {rec.currency || currencySymbol}{rec.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 0', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(rec)}
                              style={{
                                background: isLight ? '#ffffff' : '#27272a',
                                border: isLight ? '1px solid #e5e7eb' : '1px solid #3f3f46',
                                color: isLight ? '#111827' : '#f4f4f5',
                                padding: '6px 14px',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : '0 1px 2px rgba(0,0,0,0.2)',
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = isLight ? '#d1d5db' : '#52525b';
                                e.currentTarget.style.backgroundColor = isLight ? '#f9fafb' : '#3f3f46';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = isLight ? '#e5e7eb' : '#3f3f46';
                                e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : '#27272a';
                              }}
                            >
                              {t('invoices_page.btn_receipt', 'Receipt')}
                            </button>

                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginTop: 20, 
                  paddingTop: 12,
                  fontSize: 13, 
                  color: isLight ? '#6b7280' : '#a1a1aa',
                }}
              >
                <div>
                  {t('invoices_page.showing_results', {
                    start: totalReceipts === 0 ? 0 : (receiptPage - 1) * pageSize + 1,
                    end: Math.min(receiptPage * pageSize, totalReceipts),
                    total: totalReceipts,
                    count: paginatedReceipts.length,
                    defaultValue: `Showing ${paginatedReceipts.length} out of ${totalReceipts} results`,
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>
                    {t('invoices_page.page_info', {
                      current: receiptPage,
                      total: totalReceiptPages,
                      defaultValue: `Page ${receiptPage} of ${totalReceiptPages}`,
                    })}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={receiptPage <= 1}
                      onClick={() => setReceiptPage(p => Math.max(1, p - 1))}
                      style={{
                        background: isLight ? '#ffffff' : '#27272a',
                        border: isLight ? '1px solid #e5e7eb' : '1px solid #3f3f46',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: receiptPage <= 1 ? 'not-allowed' : 'pointer',
                        color: receiptPage <= 1 ? (isLight ? '#9ca3af' : '#71717a') : (isLight ? '#374151' : '#e4e4e7'),
                        opacity: receiptPage <= 1 ? 0.6 : 1,
                      }}
                    >
                      {t('invoices_page.prev_page', '< Previous')}
                    </button>
                    <button
                      type="button"
                      disabled={receiptPage >= totalReceiptPages}
                      onClick={() => setReceiptPage(p => Math.min(totalReceiptPages, p + 1))}
                      style={{
                        background: isLight ? '#ffffff' : '#27272a',
                        border: isLight ? '1px solid #e5e7eb' : '1px solid #3f3f46',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: receiptPage >= totalReceiptPages ? 'not-allowed' : 'pointer',
                        color: receiptPage >= totalReceiptPages ? (isLight ? '#9ca3af' : '#71717a') : (isLight ? '#374151' : '#e4e4e7'),
                        opacity: receiptPage >= totalReceiptPages ? 0.6 : 1,
                      }}
                    >
                      {t('invoices_page.next_page', 'Next >')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================= 中国大陆境内模式 (China Mainland Mode) ================= */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <Card size="small" bordered={false} style={{ borderRadius: 8, border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a', background: isLight ? '#ffffff' : '#141414' }}>
              <Text type="secondary" style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>累计实付充值</Text>
              <Title level={3} style={{ margin: '6px 0 0 0', color: isLight ? '#09090b' : '#fafafa' }}>
                ¥{fundStats.total_real_paid.toFixed(2)}
              </Title>
              <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>真实入账，排除赠送金</div>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 8, border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a', background: isLight ? '#ffffff' : '#141414' }}>
              <Text type="secondary" style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>累计已申请开票</Text>
              <Title level={3} style={{ margin: '6px 0 0 0', color: isLight ? '#09090b' : '#fafafa' }}>
                ¥{fundStats.total_invoiced_amount.toFixed(2)}
              </Title>
              <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>包含已开具与审核中</div>
            </Card>
            <Card size="small" bordered={false} style={{ borderRadius: 8, border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a', background: isLight ? '#ffffff' : '#141414' }}>
              <Text type="secondary" style={{ fontSize: 13, color: isLight ? '#71717a' : '#a1a1aa' }}>剩余可开票额度</Text>
              <Title level={3} style={{ margin: '6px 0 0 0', color: isLight ? '#09090b' : '#fafafa' }}>
                ¥{fundStats.remaining_invoiceable_amount.toFixed(2)}
              </Title>
              <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 4 }}>实际可提交最高上限</div>
            </Card>
          </div>

          <Card
            tabList={[
              { key: 'apply', tab: '申请开具发票' },
              { key: 'history', tab: `开票申请历史 (${data?.china_requests?.length || 0})` },
            ]}
            activeTabKey={chinaActiveTab}
            onTabChange={(key) => setChinaActiveTab(key as any)}
            bordered={false}
            style={{ borderRadius: 8, border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a', background: isLight ? '#ffffff' : '#141414', overflow: 'hidden' }}
            styles={{ body: { padding: chinaActiveTab === 'history' ? '10px 0 0 0' : '24px' } }}
          >
            {chinaActiveTab === 'apply' ? (
              availableSubjects.length === 0 ? (
                <div
                  style={{
                    padding: '36px 20px',
                    borderRadius: 8,
                    border: isLight ? '1px dashed #e4e4e7' : '1px dashed #27272a',
                    background: isLight ? '#ffffff' : '#141414',
                    textAlign: 'center',
                    maxWidth: 640,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      background: isLight ? '#f4f4f5' : '#27272a',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <IdcardOutlined style={{ fontSize: 24, color: isLight ? '#71717a' : '#a1a1aa' }} />
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: isLight ? '#09090b' : '#fafafa',
                      marginBottom: 8,
                    }}
                  >
                    请完善用户详细信息
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: isLight ? '#71717a' : '#a1a1aa',
                      maxWidth: 460,
                      margin: '0 auto 20px',
                      lineHeight: 1.6,
                    }}
                  >
                    检测到您当前在「个人中心 · 用户详细」中尚未录入实名认证信息，暂无可用的开票主体。请先前往完善个人或企业详细信息后再申请开具发票。
                  </div>
                  <Button
                    type="primary"
                    icon={<IdcardOutlined />}
                    onClick={() => navigate('/profile')}
                    style={{
                      borderRadius: 6,
                      fontWeight: 500,
                      fontSize: 13,
                      height: 36,
                      padding: '0 20px',
                      background: isLight ? '#18181b' : '#fafafa',
                      color: isLight ? '#fafafa' : '#18181b',
                      border: 'none',
                    }}
                  >
                    前往个人中心完善用户详细
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* 左侧：开票申请表单 */}
                  <div className="lg:col-span-7 xl:col-span-7">
                    <Form
                      form={chinaForm}
                      layout="vertical"
                      initialValues={{
                        invoice_type: 'normal',
                        amount: minInvoiceAmount,
                      }}
                      onFinish={handleSubmitChinaRequest}
                      style={{ width: '100%' }}
                    >
                      {/* 开票主体选择器 (shadcn Radio Cards) */}
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {availableSubjects.map((sub, idx) => {
                            const subKey = getSubjectKey(sub, idx);
                            const isSelected = selectedSubjectKey
                              ? selectedSubjectKey === subKey
                              : (currentSubject ? getSubjectKey(currentSubject, availableSubjects.indexOf(currentSubject)) === subKey : idx === 0);
                            const isEnt = sub.subject_type === 'enterprise';

                            return (
                              <div
                                key={subKey}
                                onClick={() => applyBillingSubject(sub, idx)}
                                style={{
                                  cursor: 'pointer',
                                  position: 'relative',
                                  padding: '10px 14px',
                                  borderRadius: 8,
                                  border: isSelected
                                    ? (isLight ? '1.5px solid #18181b' : '1.5px solid #fafafa')
                                    : (isLight ? '1px solid #e4e4e7' : '1px solid #27272a'),
                                  background: isSelected
                                    ? (isLight ? '#fafafa' : '#27272a')
                                    : (isLight ? '#ffffff' : '#18181b'),
                                  boxShadow: isSelected
                                    ? (isLight ? '0 1px 3px rgba(0,0,0,0.06)' : '0 1px 4px rgba(0,0,0,0.35)')
                                    : 'none',
                                  transition: 'all 0.15s ease',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.borderColor = isLight ? '#a1a1aa' : '#52525b';
                                    e.currentTarget.style.background = isLight ? '#fafafa' : '#202024';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.borderColor = isLight ? '#e4e4e7' : '#27272a';
                                    e.currentTarget.style.background = isLight ? '#ffffff' : '#18181b';
                                  }
                                }}
                              >
                                {/* Left: Type badge + Status tag + Subject name */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 5,
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      background: isLight ? '#f4f4f5' : '#27272a',
                                      color: isSelected ? (isLight ? '#18181b' : '#fafafa') : (isLight ? '#71717a' : '#a1a1aa'),
                                      border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isEnt ? <BankOutlined style={{ fontSize: 12 }} /> : <UserOutlined style={{ fontSize: 12 }} />}
                                    <span>{isEnt ? '企业' : '个人'}</span>
                                  </span>

                                  {sub.status === 'approved' && (
                                    <span style={{ 
                                      fontSize: 10, 
                                      padding: '1px 6px', 
                                      borderRadius: 4, 
                                      background: isLight ? '#f4f4f5' : '#27272a',
                                      border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
                                      color: isLight ? '#27272a' : '#d4d4d8',
                                      fontWeight: 500,
                                      lineHeight: '16px',
                                      flexShrink: 0,
                                    }}>
                                      已认证
                                    </span>
                                  )}

                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: isLight ? '#09090b' : '#fafafa',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      minWidth: 0,
                                    }}
                                  >
                                    {sub.display_name || '-'}
                                  </span>
                                </div>

                                {/* Right: shadcn circle radio checkmark */}
                                <div
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease',
                                    background: isSelected
                                      ? (isLight ? '#18181b' : '#fafafa')
                                      : 'transparent',
                                    border: isSelected
                                      ? 'none'
                                      : (isLight ? '1.5px solid #d4d4d8' : '1.5px solid #52525b'),
                                    flexShrink: 0,
                                  }}
                                >
                                  {isSelected && (
                                    <CheckOutlined style={{ fontSize: 10, color: isLight ? '#fafafa' : '#18181b' }} />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* 换行最后一排：前往个人中心管理用户详细提示 */}
                        <div style={{ marginTop: 10, padding: '2px 2px' }}>
                          <a
                            onClick={(e) => {
                              e.preventDefault();
                              navigate('/profile');
                            }}
                            style={{
                              fontSize: 12,
                              color: isLight ? '#71717a' : '#a1a1aa',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              textDecoration: 'none',
                              transition: 'color 0.15s ease',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = isLight ? '#18181b' : '#fafafa')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = isLight ? '#71717a' : '#a1a1aa')}
                          >
                            去个人中心管理用户详细 ↗
                          </a>
                        </div>
                      </div>

                      {/* 发票类型选项 (shadcn Segmented) */}
                      {(() => {
                        const platformSellers = data?.config?.sellers || [];
                        const platformSupportsSpecial = platformSellers.length === 0 || platformSellers.some((s) => s.support_special);
                        const specialDisabled = !isApprovedEnterprise || !platformSupportsSpecial;
                        const specialTooltip = !platformSupportsSpecial
                          ? '平台当前销方开票主体暂未开通增值税专用发票资质，请选择普通发票'
                          : !isApprovedEnterprise
                          ? (currentSubject?.subject_type === 'enterprise'
                              ? '企业主体实名认证通过后可申请增值税专用发票'
                              : '仅企业实名认证主体支持申请增值税专用发票')
                          : undefined;

                        return (
                          <Form.Item
                            name="invoice_type"
                            label={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
                                  发票类型
                                </span>
                                {!isApprovedEnterprise && (
                                  <span style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>
                                    (已认证企业主体可选增值税专用发票)
                                  </span>
                                )}
                              </div>
                            }
                            initialValue="normal"
                            style={{ marginBottom: 22 }}
                          >
                            <ShadcnSegmented
                              isLight={isLight}
                              options={[
                                { value: 'normal', label: '增值税普通发票' },
                                {
                                  value: 'special',
                                  label: '增值税专用发票',
                                  disabled: specialDisabled,
                                  tooltip: specialTooltip,
                                },
                              ]}
                            />
                          </Form.Item>
                        );
                      })()}

                      <Form.Item 
                        label={
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
                              开票金额 (元)
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <a 
                                onClick={(e) => {
                                  e.preventDefault();
                                  chinaForm.setFieldValue('amount', minInvoiceAmount);
                                }}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: isLight ? '#71717a' : '#a1a1aa',
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  transition: 'color 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = isLight ? '#18181b' : '#fafafa')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = isLight ? '#71717a' : '#a1a1aa')}
                              >
                                填入最低起开额 (¥{minInvoiceAmount.toFixed(2)})
                              </a>
                              {fundStats.remaining_invoiceable_amount > 0 ? (
                                <>
                                  <span style={{ color: isLight ? '#d4d4d8' : '#3f3f46', fontSize: 11 }}>|</span>
                                  <a 
                                    onClick={(e) => {
                                      e.preventDefault();
                                      chinaForm.setFieldValue('amount', fundStats.remaining_invoiceable_amount);
                                    }}
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 500,
                                      color: isLight ? '#18181b' : '#fafafa',
                                      cursor: 'pointer',
                                      textDecoration: 'none',
                                      opacity: 0.85,
                                      transition: 'opacity 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
                                  >
                                    一键填入全部额度 (¥{fundStats.remaining_invoiceable_amount.toFixed(2)})
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </div>
                        }
                        name="amount" 
                        rules={[
                          { required: true, message: '请输入开票金额' },
                          {
                            validator: (_, value) => {
                              if (value && value > fundStats.remaining_invoiceable_amount) {
                                return Promise.reject(new Error(`开票金额不能超过剩余可开票额度 ¥${fundStats.remaining_invoiceable_amount.toFixed(2)}（赠送金与信用额不可开票）`));
                              }
                              if (value && value < minInvoiceAmount) {
                                return Promise.reject(new Error(`开票金额低于系统设定的最低起开门槛 ¥${minInvoiceAmount}`));
                              }
                              return Promise.resolve();
                            }
                          }
                        ]}
                        extra={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }}>
                            <InfoCircleOutlined style={{ fontSize: 12, opacity: 0.8 }} />
                            <span>
                              可开票实付额度：
                              <strong style={{ fontWeight: 600, color: isLight ? '#09090b' : '#fafafa', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                                ¥{fundStats.remaining_invoiceable_amount.toFixed(2)}
                              </strong>
                            </span>
                            <span style={{ opacity: 0.35 }}>·</span>
                            <span>最低起开门槛：¥{minInvoiceAmount}</span>
                            <span style={{ opacity: 0.35 }}>·</span>
                            <span style={{ fontSize: 11 }}>活动赠送金不可申请发票</span>
                          </div>
                        }
                        style={{ marginBottom: 20 }}
                      >
                        <InputNumber 
                          style={{ width: '100%', height: 40, borderRadius: 6 }} 
                          prefix={<span style={{ color: isLight ? '#a1a1aa' : '#71717a', fontSize: 13, fontWeight: 500, marginRight: 2 }}>¥</span>}
                          min={minInvoiceAmount} 
                          max={fundStats.remaining_invoiceable_amount > 0 ? fundStats.remaining_invoiceable_amount : undefined}
                          precision={2} 
                          placeholder={minInvoiceAmount.toFixed(2)}
                        />
                      </Form.Item>

                      <Form.Item
                        name="remark"
                        label={
                          <span style={{ fontWeight: 600, fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
                            备注留言 <span style={{ fontWeight: 400, fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa' }}>(选填)</span>
                          </span>
                        }
                        style={{ marginBottom: 24 }}
                      >
                        <Input
                          placeholder="若有特殊开票需求或订单备注请在此填写"
                          style={{ height: 40, borderRadius: 6 }}
                        />
                      </Form.Item>

                      <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={submittingChinaRequest}
                          style={{
                            height: 40,
                            borderRadius: 6,
                            padding: '0 28px',
                            fontSize: 13,
                            fontWeight: 500,
                            background: isLight ? '#18181b' : '#fafafa',
                            color: isLight ? '#fafafa' : '#18181b',
                            border: 'none',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          提交开票申请
                        </Button>
                      </Form.Item>
                    </Form>
                  </div>

                  {/* 右侧：主体详细信息 & 开票须知 */}
                  <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-4" style={{ minWidth: 0 }}>
                    {/* 卡片一：当前开票主体详细信息 (shadcn Card) */}
                    <div
                      style={{
                        borderRadius: 8,
                        border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                        background: isLight ? '#fafafa' : '#18181b',
                        padding: '18px 20px',
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottom: isLight ? '1px solid #e4e4e7' : '1px solid #27272a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: isLight ? '#f4f4f5' : '#27272a',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isLight ? '#18181b' : '#fafafa',
                              fontSize: 13,
                            }}
                          >
                            {currentSubject?.subject_type === 'enterprise' ? <BankOutlined /> : <UserOutlined />}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: isLight ? '#09090b' : '#fafafa', lineHeight: 1.2 }}>
                              开票抬头资质
                            </div>
                            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 2 }}>
                              当前选中主体的信息档案
                            </div>
                          </div>
                        </div>
                        <a
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/profile');
                          }}
                          style={{
                            fontSize: 12,
                            color: isLight ? '#71717a' : '#a1a1aa',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            textDecoration: 'none',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = isLight ? '#18181b' : '#fafafa')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = isLight ? '#71717a' : '#a1a1aa')}
                        >
                          去管理 ↗
                        </a>
                      </div>

                      {/* Active Subject Info Summary */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 12 }}>
                        {/* Display Name */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>主体全称</span>
                          <span style={{ fontWeight: 600, color: isLight ? '#09090b' : '#fafafa', textAlign: 'right', wordBreak: 'break-all' }}>
                            {currentSubject?.display_name || '-'}
                          </span>
                        </div>

                        {/* Subject Type & Status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>主体类型</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: isLight ? '#27272a' : '#e4e4e7', fontWeight: 500 }}>
                              {currentSubject?.subject_type === 'enterprise' ? '企业' : '个人'}
                            </span>
                            {currentSubject?.status === 'approved' ? (
                              <span style={{
                                fontSize: 10,
                                padding: '0 6px',
                                borderRadius: 4,
                                background: isLight ? '#f0fdf4' : '#052e16',
                                color: isLight ? '#16a34a' : '#4ade80',
                                border: isLight ? '1px solid #bbf7d0' : '1px solid #166534',
                                lineHeight: '16px',
                              }}>
                                已认证
                              </span>
                            ) : (
                              <span style={{
                                fontSize: 10,
                                padding: '0 6px',
                                borderRadius: 4,
                                background: isLight ? '#f4f4f5' : '#27272a',
                                color: isLight ? '#71717a' : '#a1a1aa',
                                border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46',
                                lineHeight: '16px',
                              }}>
                                基础信息
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tax Number / Doc Number */}
                        {currentSubject?.doc_number && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>
                              {currentSubject.subject_type === 'enterprise' ? '税号/信用代码' : '证件号码'}
                            </span>
                            <span style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              color: isLight ? '#18181b' : '#fafafa',
                              fontWeight: 500,
                            }}>
                              {currentSubject.doc_number}
                            </span>
                          </div>
                        )}

                        {/* Invoice Type Supported */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>发票支持</span>
                          <span style={{ color: isLight ? '#18181b' : '#fafafa', fontWeight: 500 }}>
                            {currentSubject?.subject_type === 'enterprise' && currentSubject?.status === 'approved'
                              ? (currentInvoiceType === 'special' ? '增值税专用发票' : '增值税普通发票')
                              : '增值税电子普通发票'}
                          </span>
                        </div>

                        {/* Bank & Account (if present) */}
                        {currentSubject?.bank_name && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>开户银行</span>
                            <span style={{ color: isLight ? '#27272a' : '#e4e4e7', textAlign: 'right' }}>
                              {currentSubject.bank_name}
                            </span>
                          </div>
                        )}
                        {currentSubject?.bank_account && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>银行账号</span>
                            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: isLight ? '#27272a' : '#e4e4e7' }}>
                              {currentSubject.bank_account}
                            </span>
                          </div>
                        )}

                        {/* Address */}
                        {currentSubject?.address && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>注册地址</span>
                            <span style={{ color: isLight ? '#27272a' : '#e4e4e7', textAlign: 'right', wordBreak: 'break-all' }}>
                              {currentSubject.address}
                            </span>
                          </div>
                        )}

                        {/* Email */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 6, borderTop: isLight ? '1px dashed #e4e4e7' : '1px dashed #27272a' }}>
                          <span style={{ color: isLight ? '#71717a' : '#a1a1aa', flexShrink: 0 }}>发票接收邮箱</span>
                          <span style={{ color: isLight ? '#09090b' : '#fafafa', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentSubject?.email || user?.email || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 卡片二：开票须知与指引 (shadcn Card) */}
                    <div
                      style={{
                        borderRadius: 8,
                        border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                        background: isLight ? '#ffffff' : '#141414',
                        padding: '18px 20px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <InfoCircleOutlined style={{ fontSize: 14, color: isLight ? '#71717a' : '#a1a1aa' }} />
                        <span style={{ fontWeight: 600, fontSize: 13, color: isLight ? '#09090b' : '#fafafa' }}>
                          开票须知与指引
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', lineHeight: 1.6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLight ? '#a1a1aa' : '#71717a', marginTop: 7, flexShrink: 0 }} />
                          <span><strong style={{ color: isLight ? '#27272a' : '#d4d4d8' }}>开票时效：</strong>提交开票申请后，财务人员将在 1~3 个工作日内完成审核与数电发票开具。</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLight ? '#a1a1aa' : '#71717a', marginTop: 7, flexShrink: 0 }} />
                          <span><strong style={{ color: isLight ? '#27272a' : '#d4d4d8' }}>发票形式：</strong>全面推行数电发票（增值税电子发票），具有与纸质发票同等的法律效力。</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLight ? '#a1a1aa' : '#71717a', marginTop: 7, flexShrink: 0 }} />
                          <span><strong style={{ color: isLight ? '#27272a' : '#d4d4d8' }}>文件交付：</strong>开票后自动发送至发票接收邮箱，亦可在「开票申请历史」中一键下载。</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLight ? '#a1a1aa' : '#71717a', marginTop: 7, flexShrink: 0 }} />
                          <span><strong style={{ color: isLight ? '#27272a' : '#d4d4d8' }}>额度规则：</strong>仅限真实入账充值金额申请开票，活动赠送金及优惠代金券不计入开票额度。</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div>
                {(!data?.china_requests || data.china_requests.length === 0) ? (
                  <Empty description="暂无发票申请记录" style={{ padding: '40px 0' }} />
                ) : (
                  <Table
                    rowKey="id"
                    dataSource={data.china_requests}
                    scroll={{ x: 'max-content' }}
                    pagination={listPagination({
                      style: { padding: '12px 16px', margin: 0 },
                    })}
                    columns={[
                      {
                        title: '申请单号 / 时间',
                        dataIndex: 'request_no',
                        key: 'request_no',
                        width: 200,
                        render: (val, r: any) => (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Text
                                strong
                                copyable={val ? { text: val } : undefined}
                                style={{
                                  fontSize: 13,
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                  color: isLight ? '#09090b' : '#fafafa',
                                }}
                              >
                                {val || `#${r.id}`}
                              </Text>
                            </div>
                            <div style={{ fontSize: 12, color: isLight ? '#71717a' : '#a1a1aa', marginTop: 2 }}>
                              {r.created_at ? formatApiDateTime(r.created_at) : '-'}
                            </div>
                          </div>
                        ),
                      },
                      {
                        title: '发票类型',
                        dataIndex: 'invoice_type',
                        key: 'invoice_type',
                        render: (val) => val === 'special' ? (
                          <Tag style={{ background: isLight ? '#18181b' : '#fafafa', color: isLight ? '#fafafa' : '#18181b', border: 'none', borderRadius: 4 }}>增值税专用发票</Tag>
                        ) : (
                          <Tag style={{ background: isLight ? '#f4f4f5' : '#27272a', color: isLight ? '#18181b' : '#fafafa', border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46', borderRadius: 4 }}>普通发票</Tag>
                        ),
                      },
                      {
                        title: '发票抬头',
                        dataIndex: 'title',
                        key: 'title',
                        render: (text) => (
                          <Text strong style={{ color: isLight ? '#18181b' : '#f4f4f5' }}>{text || '-'}</Text>
                        ),
                      },
                      {
                        title: '开票金额',
                        dataIndex: 'amount',
                        key: 'amount',
                        render: (val) => <Text strong style={{ color: isLight ? '#18181b' : '#f4f4f5' }}>¥{Number(val).toFixed(2)}</Text>,
                      },
                      {
                        title: '状态',
                        dataIndex: 'status',
                        key: 'status',
                        render: (status, record: any) => {
                          if (status === 'approved') {
                            return <Tag style={{ background: isLight ? '#f0fdf4' : '#052e16', color: isLight ? '#16a34a' : '#4ade80', border: isLight ? '1px solid #bbf7d0' : '1px solid #166534', borderRadius: 4 }}>已开具</Tag>;
                          }
                          if (status === 'rejected') {
                            return (
                              <Tooltip title={record.reject_reason || '已驳回，请核对信息'}>
                                <Tag style={{ background: isLight ? '#fef2f2' : '#450a0a', color: isLight ? '#dc2626' : '#f87171', border: isLight ? '1px solid #fecaca' : '1px solid #991b1b', borderRadius: 4, cursor: 'help' }}>
                                  已驳回
                                </Tag>
                              </Tooltip>
                            );
                          }
                          if (status === 'cancelled') {
                            return (
                              <Tag style={{ background: isLight ? '#f4f4f5' : '#27272a', color: isLight ? '#71717a' : '#a1a1aa', border: isLight ? '1px solid #e4e4e7' : '1px solid #3f3f46', borderRadius: 4 }}>
                                已取消
                              </Tag>
                            );
                          }
                          return <Tag style={{ background: isLight ? '#fffbeb' : '#451a03', color: isLight ? '#d97706' : '#fbbf24', border: isLight ? '1px solid #fde68a' : '1px solid #92400e', borderRadius: 4 }}>审核中</Tag>;
                        },
                      },
                      {
                        title: '操作',
                        key: 'action',
                        width: 110,
                        render: (_: any, record: any) => {
                          if (record.status === 'pending') {
                            return (
                              <Popconfirm
                                title="取消开票申请"
                                okText="确认取消"
                                cancelText="再想想"
                                okButtonProps={{ danger: true, size: 'small', style: { borderRadius: 4 } }}
                                cancelButtonProps={{ size: 'small', style: { borderRadius: 4 } }}
                                onConfirm={() => handleCancelInvoiceRequest(record.id)}
                              >
                                <Button
                                  size="small"
                                  danger
                                  loading={cancellingId === record.id}
                                  style={{
                                    borderRadius: 4,
                                    fontSize: 12,
                                    height: 26,
                                    padding: '0 8px',
                                  }}
                                >
                                  取消申请
                                </Button>
                              </Popconfirm>
                            );
                          }
                          if (record.status === 'approved' && record.invoice_file_url) {
                            return (
                              <Button
                                type="link"
                                size="small"
                                icon={<DownloadOutlined />}
                                href={record.invoice_file_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ padding: 0, height: 'auto', fontSize: 12 }}
                              >
                                下载发票
                              </Button>
                            );
                          }
                          return <span style={{ color: isLight ? '#a1a1aa' : '#71717a' }}>-</span>;
                        },
                      },
                    ]}
                  />
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      <InvoiceDocumentPreview
        invoice={selectedInvoice}
        receipt={selectedReceipt}
        onClose={() => {
          setSelectedInvoice(null);
          setSelectedReceipt(null);
        }}
        config={config}
        billedName={billedName}
        billedTaxId={billedTaxId}
        billedEmail={billedEmail}
        billedPhone={billedPhone}
        billedAddress={billedAddress}
        accountId={accountId}
        isEnterpriseCustomer={isEnterpriseCustomer}
      />
    </div>
  );
};

export default Invoices;
