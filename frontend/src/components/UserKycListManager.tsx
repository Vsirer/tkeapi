/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Popconfirm,
  Modal,
  Form,
  Input,
  Radio,
  Select,
  DatePicker,
  Image,
  message,
  Tooltip,
  Divider,
  Alert,
  Grid,
  Switch,
} from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from './MobileCardList';
import { listPagination } from './ListPagination';
import { useThemeStore } from '../store/theme';
import {
  UserOutlined,
  BankOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  FilePdfOutlined,
  StarOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import request from '../utils/request';
import type {
  UserKyc,
  UserKycType,
  UserKycStatus,
  KycIdDocType,
  KycCompanyDocType,
  KycValidityType,
} from '../types';
import {
  KYC_STATUS_META,
  ID_DOC_OPTIONS,
  COMPANY_DOC_OPTIONS,
  DocUploadField,
} from './UserKycFormFields';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export interface UserKycListManagerProps {
  userId: string;
  username?: string;
  onKycCountChange?: (count: number) => void;
}

interface KycFormValues {
  kyc_type: UserKycType;
  status: UserKycStatus;
  // 个人属性
  real_name?: string;
  id_doc_type?: KycIdDocType;
  id_doc_number?: string;
  personal_email?: string;
  personal_phone?: string;
  id_doc_front_url?: string;
  id_doc_back_url?: string;
  // 企业属性
  company_name?: string;
  company_doc_type?: KycCompanyDocType;
  company_doc_number?: string;
  company_email?: string;
  company_phone?: string;
  business_license_url?: string;
  tax_registration_url?: string;
  legal_notarization_url?: string;
  // 公共审核与有效期
  validity_type: KycValidityType;
  expire_at?: Dayjs | null;
  reject_reason?: string;
  admin_remark?: string;
  is_default?: boolean;
}

const ID_DOC_LABEL_MAP: Record<string, string> = {
  id_card: '居民身份证',
  passport: '护照',
  driver_license: '驾驶证',
  other: '其他证件',
};

const COMPANY_DOC_LABEL_MAP: Record<string, string> = {
  unified_social_credit_code: '统一社会信用代码',
  business_license: '营业执照注册号',
  organization_code: '组织机构代码',
  other: '其它企业证件',
};

const UserKycListManager: React.FC<UserKycListManagerProps> = ({
  userId,
  username,
  onKycCountChange,
}) => {
  const screens = useBreakpoint();
  const isMobile = Boolean(screens.xs);
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  const [list, setList] = useState<UserKyc[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<UserKyc | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quickRejectModalOpen, setQuickRejectModalOpen] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<UserKyc | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const [form] = Form.useForm<KycFormValues>();
  const activeKycType = Form.useWatch('kyc_type', form) as UserKycType | undefined;
  const activeValidityType = Form.useWatch('validity_type', form) as KycValidityType | undefined;
  const activeIdDocType = Form.useWatch('id_doc_type', form) as KycIdDocType | undefined;

  useEffect(() => {
    if (activeKycType === 'enterprise') {
      (form as any).clearValidate?.(['real_name', 'id_doc_type', 'id_doc_number', 'personal_email', 'personal_phone']);
    } else {
      (form as any).clearValidate?.(['company_name', 'company_doc_type', 'company_doc_number', 'company_email', 'company_phone']);
    }
  }, [activeKycType, form]);

  const loadList = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await (request.get(`/users/${userId}/kyc`) as unknown as Promise<UserKyc[]>);
      const data = Array.isArray(res) ? res : res ? [res] : [];
      // 保持原始数据顺序（按 id 升序），即使某条被设为默认也不重排到最前
      data.sort((a, b) => Number(a.id) - Number(b.id));
      setList(data);
      onKycCountChange?.(data.length);
    } catch (e) {
      console.error('Failed to load user kyc list:', e);
      setList([]);
      onKycCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [userId, onKycCountChange]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleOpenAdd = (type: UserKycType = 'personal') => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      kyc_type: type,
      status: 'approved',
      validity_type: 'long_term',
      id_doc_type: 'id_card',
      company_doc_type: 'unified_social_credit_code',
      is_default: list.length === 0,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (item: UserKyc) => {
    setEditingItem(item);
    form.resetFields();
    form.setFieldsValue({
      kyc_type: (item.kyc_type as UserKycType) || 'personal',
      status: (item.status as UserKycStatus) || 'approved',
      real_name: item.real_name || undefined,
      id_doc_type: (item.id_doc_type as KycIdDocType) || 'id_card',
      id_doc_number: item.id_doc_number || undefined,
      personal_email: item.personal_email || undefined,
      personal_phone: item.personal_phone || undefined,
      id_doc_front_url: item.id_doc_front_url || undefined,
      id_doc_back_url: item.id_doc_back_url || undefined,
      company_name: item.company_name || undefined,
      company_doc_type: (item.company_doc_type as KycCompanyDocType) || 'unified_social_credit_code',
      company_doc_number: item.company_doc_number || undefined,
      company_email: item.company_email || undefined,
      company_phone: item.company_phone || undefined,
      business_license_url: item.business_license_url || undefined,
      tax_registration_url: item.tax_registration_url || undefined,
      legal_notarization_url: item.legal_notarization_url || undefined,
      validity_type: (item.validity_type as KycValidityType) || 'long_term',
      expire_at: item.expire_at ? dayjs(item.expire_at) : null,
      reject_reason: item.reject_reason || undefined,
      admin_remark: item.admin_remark || undefined,
      is_default: !!item.is_default,
    });
    setModalOpen(true);
  };

  const handleSetDefault = async (item: UserKyc) => {
    try {
      await request.post(`/users/${userId}/kyc/${item.id}/default`);
      message.success('已设为默认主体');
      // 保持当前列表原有排列顺序不变，仅原地更新默认主体状态
      setList((prev) =>
        prev.map((k) => ({
          ...k,
          is_default: k.id === item.id,
        }))
      );
    } catch (e: any) {
      message.error(e?.message || '设置默认主体失败');
    }
  };

  const handleDelete = async (item: UserKyc) => {
    try {
      await request.delete(`/users/${userId}/kyc/${item.id}`);
      loadList();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const handleQuickApprove = async (item: UserKyc) => {
    try {
      await request.put(`/users/${userId}/kyc/${item.id}`, {
        status: 'approved',
        reject_reason: '',
      });
      loadList();
    } catch (e: any) {
      message.error(e?.message || '审核通过失败');
    }
  };

  const handleOpenQuickReject = (item: UserKyc) => {
    setRejectingItem(item);
    setRejectReasonInput('');
    setQuickRejectModalOpen(true);
  };

  const handleConfirmQuickReject = async () => {
    if (!rejectingItem) return;
    try {
      await request.put(`/users/${userId}/kyc/${rejectingItem.id}`, {
        status: 'rejected',
        reject_reason: rejectReasonInput,
      });
      setQuickRejectModalOpen(false);
      loadList();
    } catch (e: any) {
      message.error(e?.message || '驳回失败');
    }
  };

  const handleSubmitModal = async () => {
    try {
      const validatedValues = await form.validateFields();
      setSubmitting(true);
      const values = { ...form.getFieldsValue(true), ...validatedValues };

      const payload: Record<string, any> = {
        kyc_type: values.kyc_type,
        status: values.status,
        validity_type: values.validity_type,
        expire_at:
          values.validity_type === 'expire_date' && values.expire_at
            ? values.expire_at.endOf('day').toISOString()
            : '',
        reject_reason: values.reject_reason || '',
        admin_remark: values.admin_remark || '',
        is_default: !!values.is_default,
        real_name: values.real_name || '',
        id_doc_type: values.id_doc_type || '',
        id_doc_number: values.id_doc_number || '',
        personal_email: values.personal_email || '',
        personal_phone: values.personal_phone || '',
        id_doc_front_url: values.id_doc_front_url || '',
        id_doc_back_url: values.id_doc_back_url || '',
        company_name: values.company_name || '',
        company_doc_type: values.company_doc_type || '',
        company_doc_number: values.company_doc_number || '',
        company_email: values.company_email || '',
        company_phone: values.company_phone || '',
        business_license_url: values.business_license_url || '',
        tax_registration_url: values.tax_registration_url || '',
        legal_notarization_url: values.legal_notarization_url || '',
      };

      if (editingItem) {
        payload.id = editingItem.id;
        await request.put(`/users/${userId}/kyc/${editingItem.id}`, payload);
      } else {
        await request.post(`/users/${userId}/kyc`, payload);
      }

      setModalOpen(false);
      loadList();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存实名信息失败');
    } finally {
      setSubmitting(false);
    }
  };

  const renderAttachments = (record: UserKyc) => {
    const isPersonal = record.kyc_type === 'personal';
    const docs: { label: string; url?: string | null }[] = isPersonal
      ? [
          { label: '正面', url: record.id_doc_front_url },
          { label: '反面', url: record.id_doc_back_url },
        ]
      : [
          { label: '营业执照', url: record.business_license_url },
          { label: '法务公证', url: record.legal_notarization_url },
        ];

    const validDocs = docs.filter((d) => !!d.url);
    if (validDocs.length === 0) {
      return <Text type="secondary" style={{ fontSize: 12 }}>无附件</Text>;
    }

    return (
      <Image.PreviewGroup>
        <Space size={6} wrap>
          {validDocs.map((d, idx) => {
            const isPdf = /\.pdf($|\?)/i.test(d.url || '');
            if (isPdf) {
              return (
                <a
                  key={idx}
                  href={d.url!}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12 }}
                >
                  <FilePdfOutlined style={{ color: '#ff4d4f' }} />
                  {d.label}
                </a>
              );
            }
            return (
              <div key={idx} style={{ textAlign: 'center', display: 'inline-block' }}>
                <Image
                  src={d.url!}
                  width={38}
                  height={28}
                  style={{ borderRadius: 4, objectFit: 'cover', border: '1px solid #d9d9d9' }}
                />
                <div style={{ fontSize: 10, color: '#8c8c8c', transform: 'scale(0.85)', marginTop: -2 }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </Space>
      </Image.PreviewGroup>
    );
  };

  const columns = [
    {
      title: '类型',
      key: 'kyc_type',
      width: 105,
      render: (_: unknown, record: UserKyc) => {
        return (
          <Space direction="vertical" size={4} align="start">
            {record.kyc_type === 'enterprise' ? (
              <Tag color="purple" icon={<BankOutlined />} style={{ margin: 0 }}>
                企业认证
              </Tag>
            ) : (
              <Tag color="blue" icon={<UserOutlined />} style={{ margin: 0 }}>
                个人认证
              </Tag>
            )}
            {record.is_default && (
              <Tag color="gold" style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px' }}>
                ⭐ 默认
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '认证主体名称',
      key: 'subject_name',
      width: 230,
      render: (_: unknown, record: UserKyc) => {
        const name = record.kyc_type === 'enterprise' ? record.company_name : record.real_name;
        const isEnt = record.kyc_type === 'enterprise';
        const docType = isEnt ? record.company_doc_type : record.id_doc_type;
        const docNum = isEnt ? record.company_doc_number : record.id_doc_number;
        const typeLabel = isEnt
          ? COMPANY_DOC_LABEL_MAP[docType || ''] || docType || '企业证件'
          : ID_DOC_LABEL_MAP[docType || ''] || docType || '身份证件';

        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {/* 第一行：主体名称 */}
            <Text strong style={{ fontSize: 13 }} ellipsis={{ tooltip: name || '未填写' }}>
              {name || <span style={{ color: '#bfbfbf' }}>未填写</span>}
            </Text>

            {/* 证件信息：证件类型与其号码分行换行展示 */}
            {docNum ? (
              <>
                <Text type="secondary" style={{ fontSize: 11, lineHeight: '14px' }}>
                  {typeLabel}:
                </Text>
                <Text code style={{ fontSize: 11, margin: 0 }}>
                  {docNum}
                </Text>
              </>
            ) : (
              <Text type="secondary" style={{ fontSize: 11 }}>未录入证件号码</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '联系方式',
      key: 'contact',
      width: 190,
      render: (_: unknown, record: UserKyc) => {
        const isEnt = record.kyc_type === 'enterprise';
        const email = isEnt ? record.company_email : record.personal_email;
        const phone = isEnt ? record.company_phone : record.personal_phone;

        return (
          <Space direction="vertical" size={1} style={{ fontSize: 12 }}>
            {email ? (
              <Text ellipsis={{ tooltip: email }} style={{ maxWidth: 170 }}>
                ✉️ {email}
              </Text>
            ) : (
              <Text type="secondary">✉️ 未设置邮箱</Text>
            )}
            {phone ? (
              <Text type="secondary">📞 {phone}</Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '证件附件',
      key: 'attachments',
      width: 115,
      render: (_: unknown, record: UserKyc) => {
        const isExpired =
          record.validity_type === 'expire_date' && record.expire_at
            ? dayjs(record.expire_at).isBefore(dayjs())
            : false;

        return (
          <Space direction="vertical" size={4} align="start">
            {/* 上部：证件附件 */}
            {renderAttachments(record)}

            {/* 下部（换行）：有效期 */}
            {record.validity_type === 'expire_date' && record.expire_at ? (
              <Space size={4} wrap>
                <Text style={{ fontSize: 11, color: isExpired ? '#ff4d4f' : undefined }}>
                  {dayjs(record.expire_at).format('YYYY-MM-DD')}
                </Text>
                {isExpired && (
                  <Tag color="error" style={{ margin: 0, fontSize: 10, padding: '0 2px', lineHeight: '16px' }}>
                    已到期
                  </Tag>
                )}
              </Space>
            ) : (
              <Tag color="cyan" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>
                长期有效
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_: unknown, record: UserKyc) => {
        const meta = KYC_STATUS_META[(record.status as UserKycStatus)] || {
          label: record.status,
          color: 'default',
        };
        const content = (
          <Tag color={meta.color} style={{ margin: 0 }}>
            {meta.label}
          </Tag>
        );

        if (record.status === 'rejected' && record.reject_reason) {
          return (
            <Tooltip title={`驳回原因: ${record.reject_reason}`}>
              {content}
            </Tooltip>
          );
        }
        return content;
      },
    },
    {
      title: '提交 / 审核',
      key: 'time_info',
      width: 195,
      render: (_: unknown, record: UserKyc) => (
        <Space direction="vertical" size={1} style={{ fontSize: 10, lineHeight: 1.3 }}>
          {record.submitted_at && (
            <Text type="secondary" style={{ fontSize: 10 }}>
              提交: {dayjs(record.submitted_at).format('YYYY-MM-DD HH:mm')}
            </Text>
          )}
          {record.reviewed_at && (
            <Text type="secondary" style={{ fontSize: 10 }}>
              审核: {dayjs(record.reviewed_at).format('YYYY-MM-DD HH:mm')}
              {record.reviewed_by ? ` (${record.reviewed_by})` : ''}
            </Text>
          )}
          {record.admin_remark && (
            <Tooltip title={`备注: ${record.admin_remark}`}>
              <Text type="secondary" ellipsis style={{ maxWidth: 175, fontSize: 10 }}>
                注: {record.admin_remark}
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_: unknown, record: UserKyc) => (
        <Space size={6} wrap>
          {record.status !== 'approved' && (
            <>
              <Tooltip title="审核通过">
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  style={{ color: '#52c41a', borderColor: '#b7eb8f' }}
                  onClick={() => handleQuickApprove(record)}
                />
              </Tooltip>
              <Tooltip title="审核驳回">
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleOpenQuickReject(record)}
                />
              </Tooltip>
            </>
          )}

          {!record.is_default && (
            <Tooltip title="设为默认主体">
              <Button
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleSetDefault(record)}
                style={{ color: '#d48806', borderColor: '#ffe58f' }}
              />
            </Tooltip>
          )}

          <Tooltip title="编辑 / 审核">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>

          <Popconfirm
            title="确认删除该条实名认证？"
            description="删除后将解除此实名绑定，但不会影响该用户的其他实名信息。"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderMobileCard = (record: UserKyc) => {
    const isEnt = record.kyc_type === 'enterprise';
    const name = isEnt ? record.company_name : record.real_name;
    const docType = isEnt ? record.company_doc_type : record.id_doc_type;
    const docNum = isEnt ? record.company_doc_number : record.id_doc_number;
    const typeLabel = isEnt
      ? COMPANY_DOC_LABEL_MAP[docType || ''] || docType || '企业证件'
      : ID_DOC_LABEL_MAP[docType || ''] || docType || '身份证件';
    const email = isEnt ? record.company_email : record.personal_email;
    const phone = isEnt ? record.company_phone : record.personal_phone;
    const statusMeta = KYC_STATUS_META[(record.status as UserKycStatus)] || {
      label: record.status,
      color: 'default',
    };

    const isExpired =
      record.validity_type === 'expire_date' && record.expire_at
        ? dayjs(record.expire_at).isBefore(dayjs())
        : false;

    return (
      <MobileCard
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {isEnt ? (
              <Tag color="purple" icon={<BankOutlined />} style={{ margin: 0, fontSize: 11 }}>
                企业认证
              </Tag>
            ) : (
              <Tag color="blue" icon={<UserOutlined />} style={{ margin: 0, fontSize: 11 }}>
                个人认证
              </Tag>
            )}
            <span style={{ fontSize: 14, fontWeight: 600, color: name ? undefined : '#8c8c8c' }}>
              {name || '未填写主体名称'}
            </span>
            {record.is_default && (
              <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                ⭐ 默认主体
              </Tag>
            )}
          </div>
        }
        extra={
          <Tag color={statusMeta.color} style={{ margin: 0, fontSize: 11 }}>
            {statusMeta.label}
          </Tag>
        }
      >
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* 证件信息 */}
          <CardRow label={typeLabel}>
            {docNum ? (
              <Text code style={{ fontSize: 12 }}>{docNum}</Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>未录入号码</Text>
            )}
          </CardRow>

          {/* 邮箱联系 */}
          <CardRow label="联系邮箱">
            {email ? (
              <Text ellipsis style={{ maxWidth: 190, fontSize: 12 }}>
                ✉️ {email}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>未设置</Text>
            )}
          </CardRow>

          {/* 电话联系 */}
          {phone && (
            <CardRow label="联系电话">
              <Text style={{ fontSize: 12 }}>📞 {phone}</Text>
            </CardRow>
          )}

          {/* 有效期 */}
          <CardRow label="有效期限">
            {record.validity_type === 'expire_date' && record.expire_at ? (
              <span style={{ fontSize: 12, color: isExpired ? '#ff4d4f' : undefined }}>
                {dayjs(record.expire_at).format('YYYY-MM-DD')}
                {isExpired && <Tag color="error" style={{ marginLeft: 4, fontSize: 10, padding: '0 2px' }}>已到期</Tag>}
              </span>
            ) : (
              <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>长期有效</Tag>
            )}
          </CardRow>

          {/* 证件附件 */}
          <div style={{ padding: '3px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text type="secondary" style={{ fontSize: 13, flexShrink: 0, marginRight: 8 }}>证件附件</Text>
            <div style={{ textAlign: 'right' }}>
              {renderAttachments(record)}
            </div>
          </div>

          {/* 驳回原因或管理员备注 */}
          {record.status === 'rejected' && record.reject_reason && (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: isLight ? '#fff2f0' : 'rgba(255, 77, 79, 0.1)',
                border: isLight ? '1px solid #ffccc7' : '1px solid rgba(255, 77, 79, 0.25)',
                fontSize: 12,
                color: '#ff4d4f',
                marginTop: 2,
              }}
            >
              <strong>驳回原因：</strong>{record.reject_reason}
            </div>
          )}

          {record.admin_remark && (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                background: isLight ? '#f5f5f5' : 'rgba(255, 255, 255, 0.04)',
                fontSize: 11,
                color: '#8c8c8c',
                marginTop: 2,
              }}
            >
              <strong>内部备注：</strong>{record.admin_remark}
            </div>
          )}

          {/* 提交与审核时间 */}
          {(record.submitted_at || record.reviewed_at) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>
              <span>
                {record.submitted_at ? `提交: ${dayjs(record.submitted_at).format('MM-DD HH:mm')}` : ''}
              </span>
              <span>
                {record.reviewed_at ? `审核: ${dayjs(record.reviewed_at).format('MM-DD HH:mm')}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* 底部快捷操作 */}
        <CardActions>
          {record.status !== 'approved' && (
            <>
              <Tooltip title="审核通过">
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<CheckOutlined />}
                  style={{ color: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => handleQuickApprove(record)}
                />
              </Tooltip>
              <Tooltip title="审核驳回">
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleOpenQuickReject(record)}
                />
              </Tooltip>
            </>
          )}
          {!record.is_default && (
            <Tooltip title="设为默认主体">
              <Button
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleSetDefault(record)}
                style={{ color: '#faad14', borderColor: '#ffe58f' }}
              />
            </Tooltip>
          )}
          <Tooltip title="编辑 / 审核">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除该条实名认证？"
            description="删除后将解除此实名绑定"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </CardActions>
      </MobileCard>
    );
  };

  return (
    <div style={{ marginTop: 8 }}>
      {/* 头部提示与操作按钮 */}
      {isMobile ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            background: isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.03)',
            borderRadius: 8,
            border: isLight ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>实名主体列表</span>
              {list.length > 0 && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{list.length} 条</Tag>}
            </div>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={loadList}
              loading={loading}
            >
              刷新
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10, lineHeight: 1.4 }}>
            支持同时保留个人与企业多条实名记录，说明属性完全独立隔离。
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenAdd('personal')}
              style={{ width: '100%' }}
            >
              + 个人实名
            </Button>
            <Button
              style={{ borderColor: '#722ed1', color: '#722ed1', width: '100%' }}
              icon={<PlusOutlined />}
              onClick={() => handleOpenAdd('enterprise')}
            >
              + 企业实名
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            padding: '10px 14px',
            background: isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.03)',
            borderRadius: 8,
            border: isLight ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              实名主体信息列表 {list.length > 0 && <Tag color="blue">{list.length} 条记录</Tag>}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              每个用户无论是个人还是企业只能有 1 个默认主体；管理端可为用户维护实名信息与审核状态。
            </Text>
          </div>
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenAdd('personal')}
            >
              添加个人实名
            </Button>
            <Button
              style={{ borderColor: '#722ed1', color: '#722ed1' }}
              icon={<PlusOutlined />}
              onClick={() => handleOpenAdd('enterprise')}
            >
              添加企业实名
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadList} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>
      )}

      {/* 实名列表展示：移动端卡片式流排版，桌面端表格 */}
      {isMobile ? (
        list.length === 0 && !loading ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: isLight ? '#fafafa' : 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              border: isLight ? '1px dashed #d9d9d9' : '1px dashed rgba(255, 255, 255, 0.15)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              该用户暂无实名认证信息
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 300, margin: '0 auto' }}>
              <Button type="dashed" size="small" onClick={() => handleOpenAdd('personal')}>
                录入个人实名
              </Button>
              <Button type="dashed" size="small" onClick={() => handleOpenAdd('enterprise')}>
                录入企业实名
              </Button>
            </div>
          </div>
        ) : (
          <MobileCardList
            dataSource={list}
            loading={loading}
            rowKey="id"
            renderCard={renderMobileCard}
            pagination={list.length > 5 ? listPagination({ pageSize: 5 }) : false}
            compact={false}
          />
        )
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={list.length > 5 ? listPagination({ pageSize: 5 }) : false}
          size="small"
          bordered
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <Text type="secondary">该用户暂无实名认证信息</Text>
                <div style={{ marginTop: 12 }}>
                  <Space>
                    <Button type="dashed" size="small" onClick={() => handleOpenAdd('personal')}>
                      录入个人实名
                    </Button>
                    <Button type="dashed" size="small" onClick={() => handleOpenAdd('enterprise')}>
                      录入企业实名
                    </Button>
                  </Space>
                </div>
              </div>
            ),
          }}
        />
      )}

      {/* 新增 / 编辑实名 Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {editingItem ? <EditOutlined style={{ color: '#1677ff' }} /> : <PlusOutlined style={{ color: '#52c41a' }} />}
            <span style={{ fontSize: isMobile ? 14 : 16 }}>
              {editingItem
                ? `编辑用户实名 (${editingItem.kyc_type === 'enterprise' ? '企业' : '个人'})`
                : '录入用户实名认证'}
            </span>
            {username && <Tag style={{ margin: 0 }}>{username}</Tag>}
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmitModal}
        confirmLoading={submitting}
        okText="保存实名信息"
        cancelText="取消"
        width={isMobile ? 'calc(100vw - 20px)' : 720}
        style={isMobile ? { maxWidth: '100vw', top: 12, margin: '0 auto' } : undefined}
        styles={{
          body: isMobile
            ? { maxHeight: '76vh', overflowY: 'auto', padding: '8px 4px' }
            : { maxHeight: '80vh', overflowY: 'auto' },
        }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="kyc_type"
            label="实名主体类型"
            rules={[{ required: true, message: '请选择实名类型' }]}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
            >
              <Radio.Button value="personal" style={{ textAlign: 'center', borderRadius: 6 }}>
                <UserOutlined style={{ marginRight: 4 }} />
                个人用户实名
              </Radio.Button>
              <Radio.Button value="enterprise" style={{ textAlign: 'center', borderRadius: 6 }}>
                <BankOutlined style={{ marginRight: 4 }} />
                企业(团体机构)用户实名
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              activeKycType === 'enterprise'
                ? '正在录入企业实名属性。保存后将独立作为一条企业认证记录保留，与个人属性互不覆盖。'
                : '正在录入个人实名属性。保存后将独立作为一条个人认证记录保留，与企业属性互不覆盖。'
            }
          />

          {/* ═══ 个人实名专属说明属性字段 ═══ */}
          <div
            style={{
              display: activeKycType === 'enterprise' ? 'none' : 'block',
              background: isLight ? 'rgba(22, 119, 255, 0.02)' : 'rgba(22, 119, 255, 0.05)',
              border: isLight ? '1px solid rgba(22, 119, 255, 0.15)' : '1px solid rgba(22, 119, 255, 0.25)',
              borderRadius: 8,
              padding: isMobile ? '12px 10px 4px' : '16px 16px 4px',
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, color: '#1677ff', marginBottom: 12 }}>
              👤 个人身份说明属性
            </div>

            <Form.Item
              name="real_name"
              label="真实姓名"
              rules={activeKycType === 'enterprise' ? [] : [{ required: true, message: '请输入真实姓名' }]}
            >
              <Input placeholder="与个人有效身份证件一致的姓名" maxLength={64} />
            </Form.Item>

            <Form.Item
              name="id_doc_type"
              label="证件类型"
              rules={activeKycType === 'enterprise' ? [] : [{ required: true, message: '请选择证件类型' }]}
            >
              <Select placeholder="居民身份证 / 护照 / 驾驶证" options={ID_DOC_OPTIONS} />
            </Form.Item>

            <Form.Item
              name="id_doc_number"
              label="证件号码"
              rules={activeKycType === 'enterprise' ? [] : [{ required: true, message: '请输入证件号码' }]}
            >
              <Input placeholder="请输入个人有效身份证件号码" maxLength={64} />
            </Form.Item>

            <Form.Item
              name="personal_email"
              label="个人联系邮箱"
              rules={
                activeKycType === 'enterprise'
                  ? []
                  : [
                      { required: true, message: '请输入个人联系邮箱' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]
              }
            >
              <Input placeholder="用于接收个人账单与通知的日常邮箱" maxLength={120} />
            </Form.Item>

            <Form.Item name="personal_phone" label="个人联系电话">
              <Input placeholder="手机号码（选填）" maxLength={32} />
            </Form.Item>

            <Divider dashed titlePlacement="left" plain style={{ fontSize: 12, color: '#8c8c8c' }}>
              个人证件附件扫描件（可选）
            </Divider>

            <Form.Item name="id_doc_front_url" style={{ marginBottom: 0 }}>
              <DocUploadField
                label={
                  activeIdDocType === 'passport'
                    ? '护照个人信息页'
                    : activeIdDocType === 'driver_license'
                    ? '驾驶证正面'
                    : '身份证人像面 / 证件正面'
                }
                docField="id_doc_front"
                targetUserId={userId}
              />
            </Form.Item>

            {(activeIdDocType === 'id_card' || !activeIdDocType) && (
              <Form.Item name="id_doc_back_url" style={{ marginBottom: 0 }}>
                <DocUploadField
                  label="身份证国徽面 / 证件反面"
                  docField="id_doc_back"
                  targetUserId={userId}
                />
              </Form.Item>
            )}
          </div>

          {/* ═══ 企业实名专属说明属性字段 ═══ */}
          <div
            style={{
              display: activeKycType === 'enterprise' ? 'block' : 'none',
              background: isLight ? 'rgba(114, 46, 209, 0.02)' : 'rgba(114, 46, 209, 0.06)',
              border: isLight ? '1px solid rgba(114, 46, 209, 0.15)' : '1px solid rgba(114, 46, 209, 0.3)',
              borderRadius: 8,
              padding: isMobile ? '12px 10px 4px' : '16px 16px 4px',
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, color: '#722ed1', marginBottom: 12 }}>
              🏢 企业主体说明属性
            </div>

            <Form.Item
              name="company_name"
              label="企业名称"
              rules={activeKycType === 'enterprise' ? [{ required: true, message: '请输入企业名称' }] : []}
            >
              <Input placeholder="营业执照上的企业完整全称" maxLength={120} />
            </Form.Item>

            <Form.Item
              name="company_doc_type"
              label="企业证件类型"
              rules={activeKycType === 'enterprise' ? [{ required: true, message: '请选择企业证件类型' }] : []}
            >
              <Select placeholder="请选择企业证件类型" options={COMPANY_DOC_OPTIONS} />
            </Form.Item>

            <Form.Item
              name="company_doc_number"
              label="企业证件号码"
              rules={activeKycType === 'enterprise' ? [{ required: true, message: '请输入企业证件号码' }] : []}
            >
              <Input placeholder="统一社会信用代码 / 企业证件号码" maxLength={64} />
            </Form.Item>

            <Form.Item
              name="company_email"
              label="企业联系邮箱"
              rules={
                activeKycType === 'enterprise'
                  ? [
                      { required: true, message: '请输入企业联系邮箱' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]
                  : []
              }
            >
              <Input placeholder="企业开票对接邮箱或业务通知邮箱" maxLength={120} />
            </Form.Item>

            <Form.Item name="company_phone" label="企业联系电话">
              <Input placeholder="企业前台电话 / 财务联系手机（选填）" maxLength={32} />
            </Form.Item>

            <Divider dashed titlePlacement="left" plain style={{ fontSize: 12, color: '#8c8c8c' }}>
              企业证照扫描件（可选）
            </Divider>

            <Form.Item name="business_license_url" style={{ marginBottom: 0 }}>
              <DocUploadField
                label="营业执照照片 / PDF"
                docField="business_license"
                targetUserId={userId}
              />
            </Form.Item>

            <Form.Item name="legal_notarization_url" style={{ marginBottom: 0 }}>
              <DocUploadField
                label="企业法务公证材料 / 授权书"
                docField="legal_notarization"
                targetUserId={userId}
              />
            </Form.Item>
          </div>

          {/* ═══ 公共有效期限 ═══ */}
          <Divider dashed titlePlacement="left" plain style={{ fontSize: 12, color: '#8c8c8c', margin: '12px 0 16px' }}>
            证件有效期限
          </Divider>

          <Form.Item name="validity_type" label="有效期限">
            <Radio.Group>
              <Radio value="long_term">长期有效</Radio>
              <Radio value="expire_date">按证件到期日</Radio>
            </Radio.Group>
          </Form.Item>

          {activeValidityType === 'expire_date' && (
            <Form.Item
              name="expire_at"
              label="证件到期日期"
              rules={[{ required: true, message: '请选择证件到期日期' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          )}

          {/* ═══ 审核状态与备注 ═══ */}
          <Divider dashed titlePlacement="left" plain style={{ fontSize: 12, color: '#8c8c8c', margin: '12px 0 16px' }}>
            认证状态与管理审核
          </Divider>

          <Form.Item
            name="status"
            label="认证状态"
            rules={[{ required: true, message: '请选择认证状态' }]}
          >
            <Select
              options={[
                { value: 'approved', label: '已通过 (Approved)' },
                { value: 'pending', label: '审核中 (Pending)' },
                { value: 'rejected', label: '已驳回 (Rejected)' },
                { value: 'expired', label: '已过期 (Expired)' },
                { value: 'none', label: '未认证 (None)' },
              ]}
            />
          </Form.Item>

          <Form.Item name="reject_reason" label="驳回原因">
            <Input.TextArea
              rows={2}
              placeholder="若审核驳回，请填写具体原因，用户端可见"
              maxLength={500}
            />
          </Form.Item>

          <Form.Item name="admin_remark" label="管理员备注">
            <Input.TextArea
              rows={2}
              placeholder="仅管理员可见的内部备忘说明"
              maxLength={500}
            />
          </Form.Item>

          <Form.Item name="is_default" valuePropName="checked" label="设为默认实名主体">
            <Space align="center">
              <Switch checkedChildren="默认" unCheckedChildren="普通" />
              <Text type="secondary" style={{ fontSize: 12 }}>
                设为默认后，用户端（个人中心、开票等）将默认优先展示此实名信息
              </Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 快捷驳回弹窗 */}
      <Modal
        title="驳回实名认证"
        open={quickRejectModalOpen}
        onCancel={() => setQuickRejectModalOpen(false)}
        onOk={handleConfirmQuickReject}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        width={isMobile ? 'calc(100vw - 28px)' : 480}
        style={isMobile ? { maxWidth: '100vw', top: 32, margin: '0 auto' } : undefined}
      >
        <div style={{ marginBottom: 12 }}>
          请填写驳回原因（用户端可见），以便用户核对并修正：
        </div>
        <Input.TextArea
          rows={3}
          value={rejectReasonInput}
          onChange={(e) => setRejectReasonInput(e.target.value)}
          placeholder="例如：身份证照片模糊不清，请重新拍摄上传清晰证件面"
          maxLength={300}
        />
      </Modal>
    </div>
  );
};

export default UserKycListManager;
