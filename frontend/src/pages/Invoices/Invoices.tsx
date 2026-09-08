/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Modal, Spin, message, Typography, Tag, Form, Input, InputNumber, Radio, Space, Table, Empty, Dropdown, Tooltip, Popconfirm, type MenuProps } from 'antd';
import { 
  PrinterOutlined,
  CheckCircleOutlined, 
  FileTextOutlined, 
  WalletOutlined,
  GiftOutlined,
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
      // Fallback mock data if initial empty
      setData({
        enabled: true,
        mode: 'international',
        config: {
          company_name: 'TokensByte Inc.',
          company_address: '100 Innovation Way, Suite 300, San Francisco, CA 94107',
          tax_id: 'US-987654321',
          contact_email: 'billing@tokensbyte.com',
          currency_symbol: '$',
          invoice_prefix: 'INV-',
          receipt_prefix: 'REC-',
          notes: 'Thank you for your business! Payment has been processed in full.',
          show_invoices: true,
          show_receipts: true,
        },
        invoices: [],
        receipts: [],
        china_requests: [],
        total_paid_amount: 0,
      });
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

  const billedName = currentSubject?.display_name || customer?.display_name || user?.nickname || user?.username || 'Valued Customer';
  const billedTaxId = currentSubject?.doc_number || (isEnterpriseCustomer ? customer?.company_doc_number : customer?.id_doc_number) || customer?.company_doc_number || customer?.id_doc_number;
  const billedEmail = currentSubject?.email || customer?.email || user?.email;
  const billedPhone = currentSubject?.phone || customer?.phone || user?.mobile;
  const billedAddress = currentSubject?.address || customer?.address;
  const accountId = customer?.account_id || user?.uid || user?.id || 'Standard User';
  const hasCompletedProfile = availableSubjects.length > 0;

  // Mask sensitive personal ID / tax reference number
  const maskDocNumber = (val?: string, isEnterprise = false): string => {
    if (!val) return '';
    const str = String(val).trim();
    if (str.includes('****')) return str;
    // 18-digit resident ID: mask middle 8 birthday digits with ****
    if (/^\d{17}[\dXx]$/i.test(str)) {
      return `${str.slice(0, 6)}****${str.slice(-4)}`;
    }
    // Enterprise Tax ID (Unified Social Credit Code): keep full for formal tax invoices
    if (isEnterprise) {
      return str;
    }
    // General personal ID document numbers
    if (str.length <= 6) return str;
    if (str.length <= 10) {
      return `${str.slice(0, 2)}****${str.slice(-2)}`;
    }
    return `${str.slice(0, 4)}****${str.slice(-4)}`;
  };

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

  // Invoices list with fallback demo rows if empty, matching image 1
  const invoicesList = useMemo(() => {
    if (data?.invoices && data.invoices.length > 0) {
      return data.invoices;
    }
    // If user has zero payments, supply standard default template rows matching image 1
    return [
      {
        id: 'INV-20260901-0001',
        date: 'September 1st, 2026',
        raw_date: '2026-09-01T05:11:18Z',
        payment: 'paid',
        amount: 25.00,
        currency: '$',
        payment_method: 'Stripe',
        description: 'Purchase of Prepaid API Service Credits',
        fund_type: 'real_payment',
        fund_type_label: '实付充值',
        is_invoiceable: true,
      },
      {
        id: 'INV-20260901-0002',
        date: 'September 1st, 2026',
        raw_date: '2026-09-01T00:00:00Z',
        payment: 'paid',
        amount: 0.00,
        currency: '$',
        payment_method: 'System',
        description: 'Monthly Free Plan Renewal',
        fund_type: 'real_payment',
        fund_type_label: '实付充值',
        is_invoiceable: true,
      },
      {
        id: 'INV-20260801-0001',
        date: 'August 1st, 2026',
        raw_date: '2026-08-01T00:00:00Z',
        payment: 'paid',
        amount: 0.00,
        currency: '$',
        payment_method: 'System',
        description: 'Monthly Free Plan Renewal',
        fund_type: 'real_payment',
        fund_type_label: '实付充值',
        is_invoiceable: true,
      },
      {
        id: 'INV-20260701-0001',
        date: 'July 1st, 2026',
        raw_date: '2026-07-01T00:00:00Z',
        payment: 'paid',
        amount: 0.00,
        currency: '$',
        payment_method: 'System',
        description: 'Monthly Free Plan Renewal',
        fund_type: 'real_payment',
        fund_type_label: '实付充值',
        is_invoiceable: true,
      },
    ];
  }, [data?.invoices]);

  // Receipts list
  const receiptsList = useMemo(() => {
    if (data?.receipts && data.receipts.length > 0) {
      return data.receipts;
    }
    return [
      {
        id: 'REC-20260901-0001',
        date: 'September 1st, 2026 at 1:11:18 PM UTC+8',
        raw_date: '2026-09-01T05:11:18Z',
        amount: 25.00,
        currency: '$',
        payment_method: 'Stripe',
        transaction_id: 'ch_3PzK928172635489',
        fund_type: 'real_payment',
        fund_type_label: '实付资金',
      },
    ];
  }, [data?.receipts]);

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

  const isUsingDemoInvoices = !data?.invoices || data.invoices.length === 0;

  const invoiceSheetRef = useRef<HTMLDivElement>(null);
  const receiptSheetRef = useRef<HTMLDivElement>(null);

  // Print invoice or receipt strictly on 1 single A4 sheet using an isolated print iframe
  const handlePrint = (sheetOrTitle?: HTMLElement | string | null, docTitle?: string) => {
    let sheetElement: HTMLElement | null = null;
    let title = docTitle;
    if (typeof sheetOrTitle === 'string') {
      title = sheetOrTitle;
    } else if (sheetOrTitle) {
      sheetElement = sheetOrTitle;
    }
    const targetElement = sheetElement || (document.querySelector('.printable-a4-sheet') as HTMLElement | null);
    const originalTitle = document.title;
    if (title) {
      document.title = title;
    }

    if (!targetElement) {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1500);
      return;
    }

    // Remove any previous print iframe to prevent duplicates
    const oldIframe = document.getElementById('tokensbyte-invoice-print-frame');
    if (oldIframe) {
      oldIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'tokensbyte-invoice-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '794px';
    iframe.style.height = '1123px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1500);
      return;
    }

    // Collect all stylesheets and font links from parent page
    let stylesHtml = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      stylesHtml += node.outerHTML;
    });

    const sheetHtml = targetElement.outerHTML;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title || 'Invoice'}</title>
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 210mm !important;
              height: 297mm !important;
              max-width: 210mm !important;
              max-height: 297mm !important;
              background: #ffffff !important;
              color: #0f172a !important;
              overflow: hidden !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif !important;
            }
            .printable-a4-sheet {
              position: relative !important;
              left: 0 !important;
              top: 0 !important;
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
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              overflow: hidden !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .no-print {
              display: none !important;
            }
            .anticon {
              display: inline-block;
              color: inherit;
              font-style: normal;
              line-height: 0;
              text-align: center;
              text-transform: none;
              vertical-align: -0.125em;
              text-rendering: optimizeLegibility;
              -webkit-font-smoothing: antialiased;
            }
            .anticon > * {
              line-height: 1;
            }
            .anticon svg {
              display: inline-block;
            }
          </style>
        </head>
        <body>
          ${sheetHtml}
        </body>
      </html>
    `);
    doc.close();

    const cleanup = () => {
      document.title = originalTitle;
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.remove();
        }
      }, 1000);
    };

    if (iframe.contentWindow) {
      iframe.contentWindow.onafterprint = cleanup;
    }
    // Fallback cleanup after 2 minutes
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.remove();
      }
    }, 120000);

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('Print error:', e);
          window.print();
        } finally {
          document.title = originalTitle;
        }
      }, 300);
    };

    if (iframe.contentWindow?.document.readyState === 'complete') {
      doPrint();
    } else {
      iframe.onload = doPrint;
      setTimeout(doPrint, 600);
    }
  };

  // Download invoice or receipt as a standalone single-page A4 PDF file
  const handleDownloadPdf = async (sheetElement: HTMLElement | null, docTitle: string) => {
    if (!sheetElement) {
      handlePrint(sheetElement, docTitle);
      return;
    }
    const hide = message.loading(t('invoices_page.generating_pdf', '正在生成标准高清 A4 单页 PDF 文件，请稍候...'), 0);
    try {
      const [html2canvasModule, jsPdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const html2canvas = (html2canvasModule.default || html2canvasModule) as any;
      const jsPDF = (jsPdfModule.jsPDF || jsPdfModule.default || jsPdfModule) as any;
      const canvas = await html2canvas(sheetElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      // Standalone single-page A4 document: exactly 210mm x 297mm
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

      pdf.save(`${docTitle}.pdf`);
      hide();
      message.success(t('invoices_page.download_pdf_success', 'A4 单页 PDF 凭证已生成并开始下载'));
    } catch (err) {
      hide();
      console.error('PDF export error:', err);
      message.info(t('invoices_page.print_save_hint', '正在为您调起系统打印窗口（严格 A4 单页），可选择打印机或另存为 PDF'));
      handlePrint(sheetElement, docTitle);
    }
  };

  const getInvoiceMenuItems = (invoice: InvoiceItem): MenuProps['items'] => {
    const isGift = invoice.fund_type === 'gift_bonus';
    const docTitle = `${isGift ? 'Promotional-Gift' : 'Commercial-Invoice'}-${invoice.id}`;
    return [
      {
        key: 'download_pdf',
        icon: <DownloadOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_download_pdf', '下载 A4 单页 PDF')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_download_pdf_desc', '生成并保存独立标准 A4 单页 PDF 电子凭证')}</div>
          </div>
        ),
        onClick: () => handleDownloadPdf(invoiceSheetRef.current, docTitle),
      },
      {
        type: 'divider',
      },
      {
        key: 'print_pdf',
        icon: <PrinterOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_print_pdf', '直接打印 A4 单页')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_print_pdf_desc', '调起系统打印窗口，严格限制 1 张 A4 纸')}</div>
          </div>
        ),
        onClick: () => handlePrint(invoiceSheetRef.current, docTitle),
      },
    ];
  };

  const getReceiptMenuItems = (receipt: ReceiptItem): MenuProps['items'] => {
    const docTitle = `Payment-Receipt-${receipt.id}`;
    return [
      {
        key: 'download_pdf',
        icon: <DownloadOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_download_pdf', '下载 A4 单页 PDF')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_download_pdf_desc', '生成并保存独立标准 A4 单页 PDF 电子凭证')}</div>
          </div>
        ),
        onClick: () => handleDownloadPdf(receiptSheetRef.current, docTitle),
      },
      {
        type: 'divider',
      },
      {
        key: 'print_pdf',
        icon: <PrinterOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_print_pdf', '直接打印 A4 单页')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_print_pdf_desc', '调起系统打印窗口，严格限制 1 张 A4 纸')}</div>
          </div>
        ),
        onClick: () => handlePrint(receiptSheetRef.current, docTitle),
      },
    ];
  };

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
          {isUsingDemoInvoices && (
            <div 
              className="no-print"
              style={{ 
                padding: '10px 16px', 
                background: isLight ? '#f4f4f5' : '#18181b', 
                border: isLight ? '1px solid #e4e4e7' : '1px solid #27272a', 
                borderRadius: 8, 
                fontSize: 13, 
                color: isLight ? '#52525b' : '#a1a1aa',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{t('invoices_page.demo_hint', '💡 提示：当前账号暂无真实在线充值订单，以下为基于图一标准版式的预览数据，支持直接点击「Invoice」与「Receipt」查看并打印商业凭证。')}</span>
            </div>
          )}

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
                    pagination={{
                      pageSize: 10,
                      style: { padding: '12px 16px', margin: 0 },
                    }}
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

      {/* ================= Printable Commercial Invoice Modal (Standard A4) ================= */}
      <Modal
        open={!!selectedInvoice}
        onCancel={() => setSelectedInvoice(null)}
        footer={null}
        width={860}
        destroyOnClose
        centered
        styles={{ body: { padding: 0, overflow: 'hidden', background: isLight ? '#f1f5f9' : '#09090b', borderRadius: 8 } }}
      >
        {selectedInvoice && (() => {
          const isGiftInvoice = selectedInvoice.fund_type === 'gift_bonus';
          const menuItems = getInvoiceMenuItems(selectedInvoice);
          const docTitle = `${isGiftInvoice ? 'Promotional-Gift' : 'Commercial-Invoice'}-${selectedInvoice.id}`;
          return (
          <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
            <div>
              {/* Top Preview Toolbar (Hidden in Print) */}
              <div 
                className="no-print" 
                style={{ 
                  position: 'sticky', 
                  top: 0, 
                  zIndex: 10, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '12px 20px', 
                  background: isLight ? '#ffffff' : '#18181b', 
                  borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #27272a',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileTextOutlined style={{ color: isLight ? '#18181b' : '#fafafa', fontSize: 18 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: isLight ? '#0f172a' : '#f8fafc' }}>
                    {isGiftInvoice ? 'Promotional Gift Voucher' : 'Commercial Invoice'} · {selectedInvoice.id}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 28 }}>
                  <Button 
                    icon={<DownloadOutlined />} 
                    onClick={() => handleDownloadPdf(invoiceSheetRef.current, docTitle)}
                    style={{ 
                      borderRadius: 6, 
                      fontWeight: 500,
                      background: isLight ? '#ffffff' : '#27272a',
                      borderColor: isLight ? '#e4e4e7' : '#3f3f46',
                      color: isLight ? '#18181b' : '#fafafa',
                    }}
                  >
                    {t('invoices_page.btn_download_pdf', 'Download PDF')}
                  </Button>
                  <Button 
                    type="primary" 
                    icon={<PrinterOutlined />} 
                    onClick={() => handlePrint(invoiceSheetRef.current, docTitle)}
                    style={{ borderRadius: 6, fontWeight: 500 }}
                  >
                    {t('invoices_page.btn_print_direct', 'Print')}
                  </Button>
                </div>
              </div>

              {/* Document Viewer Scroll Viewport */}
              <div className="a4-preview-scroll" style={{ maxHeight: 'calc(88vh - 54px)', overflowY: 'auto', overflowX: 'auto', padding: '24px 16px 40px 16px', display: 'flex', justifyContent: 'center' }}>
                {/* Standard A4 Paper Sheet (Exact 794x1123 Portrait) */}
                <div 
                  ref={invoiceSheetRef}
                  className="printable-a4-sheet" 
                  style={{ 
                    width: 794, 
                    height: 1123,
                    minHeight: 1123, 
                    maxHeight: 1123,
                    background: '#ffffff', 
                    color: '#0f172a', 
                    padding: '2.54cm 2.0cm', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)', 
                    borderRadius: 2, 
                    boxSizing: 'border-box', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between', 
                    overflow: 'hidden',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' 
                  }}
                >
                  {/* Upper Content */}
                  <div>
                    {/* Header / Brand & Document Meta */}
                    <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '0.04em' }}>
                          {isGiftInvoice ? 'PROMOTIONAL VOUCHER' : 'INVOICE'}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
                          {isGiftInvoice ? 'Voucher No:' : 'Invoice No:'} {selectedInvoice.id}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          Issue Date: {selectedInvoice.date}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          Due Date: {selectedInvoice.date}
                        </div>

                        {/* Company Info placed directly under date info */}
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
                            {config.company_name || 'TokensByte Inc.'}
                          </div>
                          <div style={{ fontSize: 11, color: '#475569', marginTop: 3, maxWidth: 360, lineHeight: 1.35 }}>
                            {config.company_address || '100 Innovation Way, Suite 300, San Francisco, CA 94107'}
                          </div>
                          {config.tax_id && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                              Tax ID: <strong>{config.tax_id}</strong>
                            </div>
                          )}
                          {config.contact_email && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                              Billing Support: <strong>{config.contact_email}</strong>
                            </div>
                          )}
                          {config.company_phone && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                              Tel: <strong>{config.company_phone}</strong>
                            </div>
                          )}
                          {(config.company_website || config.website) && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                              Web: <strong>{config.company_website || config.website}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Parties & Payment Info (2 Columns) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                          BILLED TO:
                        </div>
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
                          {billedName}
                        </div>
                        {billedTaxId && (
                          <div style={{ fontSize: 11, color: '#334155', marginTop: 2, fontWeight: 500 }}>
                            <span style={{ color: '#64748b' }}>
                              {isEnterpriseCustomer ? 'Tax ID: ' : 'ID / Tax Ref: '}
                            </span>
                            <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                              {maskDocNumber(billedTaxId, isEnterpriseCustomer)}
                            </strong>
                          </div>
                        )}
                        {billedAddress && (
                          <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.35 }}>
                            {billedAddress}
                          </div>
                        )}
                        <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
                          {billedEmail || 'N/A'}
                        </div>
                        {billedPhone && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                            Tel: {billedPhone}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          Account ID: {accountId}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                          PAYMENT INFORMATION:
                        </div>
                        <div style={{ fontSize: 11.5, color: '#334155', marginTop: 3 }}>
                          Payment Method: <strong>{selectedInvoice.payment_method || 'Online Payment'}</strong>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
                          Payment Status: <strong style={{ color: '#0f172a' }}>
                            {isGiftInvoice ? 'Promotional Grant' : 'Paid'}
                          </strong>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
                          Currency: <strong>{selectedInvoice.currency === '¥' ? 'CNY' : 'USD'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div style={{ marginTop: 14 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #0f172a' }}>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left', width: 32 }}>#</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left' }}>Item Description</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'center', width: 50 }}>Qty</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', width: 95 }}>Unit Price</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', width: 105 }}>Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#64748b' }}>1</td>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, fontWeight: 600, color: '#0f172a' }}>
                              <div style={{ whiteSpace: 'nowrap' }}>
                                {(!selectedInvoice.description || selectedInvoice.description === 'Account Credits & API Balance Top-up')
                                  ? (isGiftInvoice ? 'Promotional Gift Credits & Activity Bonus' : 'Purchase of Prepaid API Service Credits')
                                  : selectedInvoice.description}
                              </div>
                            </td>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#334155', textAlign: 'center' }}>1</td>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#334155', textAlign: 'right' }}>
                              {selectedInvoice.currency}{selectedInvoice.amount.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 8px', fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                              {selectedInvoice.currency}{selectedInvoice.amount.toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Totals Summary */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <div style={{ width: 250, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                          <span>Subtotal</span>
                          <span>{selectedInvoice.currency}{selectedInvoice.amount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                          <span>Tax / VAT (0.0%)</span>
                          <span>{selectedInvoice.currency}0.00</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', marginTop: 3, borderTop: '2px solid #0f172a', fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                          <span>Total</span>
                          <span>{selectedInvoice.currency}{selectedInvoice.amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Terms & Notes */}
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 10.5, color: '#475569', lineHeight: 1.4 }}>
                      <div>
                        <strong style={{ color: '#0f172a' }}>Terms & Notes: </strong>
                        {config.notes || 'Thank you for your business! Payment has been processed in full.'}
                      </div>
                      <div style={{ marginTop: 3, color: '#64748b' }}>
                        <strong style={{ color: '#0f172a' }}>Tax Note: </strong>
                        Tax exempt / Reverse charge (Zero-rated VAT/GST on cross-border B2B digital cloud services).
                      </div>
                    </div>
                  </div>

                  {/* Bottom Footer (A4 Bottom) */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8' }}>
                      <span>Document Ref: {selectedInvoice.id} · {isGiftInvoice ? 'Promotional Gift Voucher' : 'Official Commercial Invoice'}</span>
                      <span style={{ fontWeight: 600 }}>Page 1 of 1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Dropdown>
          );
        })()}
      </Modal>

      {/* ================= Printable Payment Receipt Modal (Standard A4) ================= */}
      <Modal
        open={!!selectedReceipt}
        onCancel={() => setSelectedReceipt(null)}
        footer={null}
        width={860}
        destroyOnClose
        centered
        styles={{ body: { padding: 0, overflow: 'hidden', background: isLight ? '#f1f5f9' : '#09090b', borderRadius: 8 } }}
      >
        {selectedReceipt && (() => {
          const menuItems = getReceiptMenuItems(selectedReceipt);
          const docTitle = `Payment-Receipt-${selectedReceipt.id}`;
          return (
          <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
            <div>
              {/* Top Preview Toolbar (Hidden in Print) */}
              <div 
                className="no-print" 
                style={{ 
                  position: 'sticky', 
                  top: 0, 
                  zIndex: 10, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '12px 20px', 
                  background: isLight ? '#ffffff' : '#18181b', 
                  borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #27272a',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileTextOutlined style={{ color: isLight ? '#18181b' : '#fafafa', fontSize: 18 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: isLight ? '#0f172a' : '#f8fafc' }}>
                    Payment Receipt · {selectedReceipt.id}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 28 }}>
                  <Button 
                    icon={<DownloadOutlined />} 
                    onClick={() => handleDownloadPdf(receiptSheetRef.current, docTitle)}
                    style={{ 
                      borderRadius: 6, 
                      fontWeight: 500,
                      background: isLight ? '#ffffff' : '#27272a',
                      borderColor: isLight ? '#e4e4e7' : '#3f3f46',
                      color: isLight ? '#18181b' : '#fafafa',
                    }}
                  >
                    {t('invoices_page.btn_download_pdf', 'Download PDF')}
                  </Button>
                  <Button 
                    type="primary" 
                    icon={<PrinterOutlined />} 
                    onClick={() => handlePrint(receiptSheetRef.current, docTitle)}
                    style={{ borderRadius: 6, fontWeight: 500 }}
                  >
                    {t('invoices_page.btn_print_direct', 'Print')}
                  </Button>
                </div>
              </div>

              {/* Document Viewer Scroll Viewport */}
              <div className="a4-preview-scroll" style={{ maxHeight: 'calc(88vh - 54px)', overflowY: 'auto', overflowX: 'auto', padding: '24px 16px 40px 16px', display: 'flex', justifyContent: 'center' }}>
                {/* Standard A4 Paper Sheet (Exact 794x1123 Portrait) */}
                <div 
                  ref={receiptSheetRef}
                  className="printable-a4-sheet" 
                  style={{ 
                    width: 794, 
                    height: 1123,
                    minHeight: 1123, 
                    maxHeight: 1123,
                    background: '#ffffff', 
                    color: '#0f172a', 
                    padding: '2.54cm 2.0cm', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)', 
                    borderRadius: 2, 
                    boxSizing: 'border-box', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between', 
                    overflow: 'hidden', 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' 
                  }}
                >
                  {/* Upper Content */}
                  <div>
                    {/* Header / Brand & Document Meta */}
                    <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '0.04em' }}>
                          RECEIPT
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
                          Receipt No: {selectedReceipt.id}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          Payment Date: {(selectedReceipt.date || '').replace(/GMT/g, 'UTC')}
                        </div>

                        {/* Company Info placed directly under date info */}
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
                            {config.company_name || 'TokensByte Inc.'}
                          </div>
                          <div style={{ fontSize: 11, color: '#475569', marginTop: 3, maxWidth: 360, lineHeight: 1.35 }}>
                            {config.company_address || '100 Innovation Way, Suite 300, San Francisco, CA 94107'}
                          </div>
                          {config.tax_id && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                              Tax ID: <strong>{config.tax_id}</strong>
                            </div>
                          )}
                          {config.contact_email && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                              Billing Support: <strong>{config.contact_email}</strong>
                            </div>
                          )}
                          {config.company_phone && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                              Tel: <strong>{config.company_phone}</strong>
                            </div>
                          )}
                          {(config.company_website || config.website) && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                              Web: <strong>{config.company_website || config.website}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Hero Receipt Card */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircleOutlined style={{ fontSize: 24, color: '#0f172a' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                            Payment Successfully Cleared
                          </div>
                          <div style={{ fontSize: 12, color: '#52525b', marginTop: 2 }}>
                            Processed via {selectedReceipt.payment_method || 'Online Payment Gateway'}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#52525b', fontWeight: 700 }}>
                          AMOUNT RECEIVED
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                          {selectedReceipt.currency}{selectedReceipt.amount.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Key Details Grid (2 Columns) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 14, padding: '12px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                          RECEIVED FROM (PAYER):
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                          {billedName}
                        </div>
                        {billedTaxId && (
                          <div style={{ fontSize: 11, color: '#334155', marginTop: 2, fontWeight: 500 }}>
                            <span style={{ color: '#64748b' }}>
                              {isEnterpriseCustomer ? 'Tax ID: ' : 'ID / Tax Ref: '}
                            </span>
                            <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                              {maskDocNumber(billedTaxId, isEnterpriseCustomer)}
                            </strong>
                          </div>
                        )}
                        {billedAddress && (
                          <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.35 }}>
                            {billedAddress}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                          {billedEmail || 'N/A'}
                        </div>
                        {billedPhone && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                            Tel: {billedPhone}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          Account ID: {accountId}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                          TRANSACTION SUMMARY:
                        </div>
                        <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
                          Receipt #: <strong>{selectedReceipt.id}</strong>
                        </div>
                        {selectedReceipt.transaction_id && (
                          <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>
                            Transaction Ref: <strong style={{ fontFamily: 'monospace' }}>{selectedReceipt.transaction_id}</strong>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                          Payment Gateway: <strong>{selectedReceipt.payment_method || 'Online'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Itemized Allocation Table */}
                    <div style={{ marginTop: 14 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #0f172a' }}>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left', width: 32 }}>#</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left' }}>Description</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'center', width: 115 }}>Payment Method</th>
                            <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', width: 105 }}>Paid Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#64748b' }}>1</td>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, fontWeight: 600, color: '#0f172a' }}>
                              <div style={{ whiteSpace: 'nowrap' }}>Purchase of Prepaid API Service Credits</div>
                              <div style={{ fontSize: 10.5, fontWeight: 400, color: '#64748b', marginTop: 2 }}>Instant Settlement Confirmation</div>
                            </td>
                            <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#334155', textAlign: 'center' }}>
                              {selectedReceipt.payment_method || 'Online Payment'}
                            </td>
                            <td style={{ padding: '8px 8px', fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                              {selectedReceipt.currency}{selectedReceipt.amount.toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Totals Summary */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <div style={{ width: 250, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                          <span>Subtotal</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{selectedReceipt.currency}{selectedReceipt.amount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                          <span>Tax / VAT (0.0%)</span>
                          <span>{selectedReceipt.currency}0.00</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', marginTop: 3, borderTop: '2px solid #0f172a', fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                          <span>Total Paid</span>
                          <span>{selectedReceipt.currency}{selectedReceipt.amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Verification Note */}
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 10.5, color: '#475569', lineHeight: 1.4 }}>
                      <div>
                        <strong style={{ color: '#0f172a' }}>Official Receipt Note: </strong>
                        This document serves as an official confirmation of electronic fund transfer and payment receipt. Payment has been verified and settled to the designated account.
                      </div>
                      <div style={{ marginTop: 3, color: '#64748b' }}>
                        <strong style={{ color: '#0f172a' }}>Tax Note: </strong>
                        Tax exempt / Reverse charge (Zero-rated VAT/GST on cross-border B2B digital cloud services).
                      </div>
                    </div>
                  </div>

                  {/* Bottom Footer (A4 Bottom) */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8' }}>
                      <span>Receipt Ref: {selectedReceipt.id} · Payment Voucher</span>
                      <span style={{ fontWeight: 600 }}>Page 1 of 1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Dropdown>
          );
        })()}
      </Modal>
    </div>
  );
};

export default Invoices;
