/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useState, useEffect } from 'react';
import {
  Form, Input, Radio, Select, Upload, Button, Space, Typography, Tag, DatePicker, Image, message, Alert, Divider, Switch,
} from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import request from '../utils/request';
import type { UserKyc, UserKycStatus, UserKycType, KycIdDocType, KycCompanyDocType, KycValidityType } from '../types';

const { Text } = Typography;

export const KYC_STATUS_META: Record<UserKycStatus, { label: string; color: string }> = {
  none: { label: '未实名', color: 'default' },
  pending: { label: '待审核', color: 'processing' },
  approved: { label: '已实名', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  expired: { label: '已过期', color: 'warning' },
};

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

export const ID_DOC_OPTIONS: { value: KycIdDocType; label: string }[] = [
  { value: 'id_card', label: '居民身份证' },
  { value: 'passport', label: '护照' },
  { value: 'driver_license', label: '驾驶证' },
  { value: 'other', label: '其他证件' },
];

export const COMPANY_DOC_OPTIONS: { value: KycCompanyDocType; label: string }[] = [
  { value: 'unified_social_credit_code', label: '统一社会信用代码' },
  { value: 'other', label: '其它企业证件' },
];

export type KycFormValues = {
  kyc_type: UserKycType;
  status?: UserKycStatus;
  // 个人用户
  real_name?: string;
  id_doc_type?: KycIdDocType;
  id_doc_number?: string;
  personal_email?: string;
  personal_phone?: string;
  id_doc_front_url?: string;
  id_doc_back_url?: string;
  // 企业用户
  company_name?: string;
  company_doc_type?: KycCompanyDocType;
  company_doc_number?: string;
  company_email?: string;
  company_phone?: string;
  business_license_url?: string;
  tax_registration_url?: string;
  legal_notarization_url?: string;
  // 有效期与审核
  validity_type: KycValidityType;
  expire_at?: Dayjs | null;
  reject_reason?: string;
  admin_remark?: string;
  is_default?: boolean;
};

export function kycToFormValues(kyc?: UserKyc | null): KycFormValues {
  return {
    kyc_type: (kyc?.kyc_type as UserKycType) || 'personal',
    status: (kyc?.status as UserKycStatus) || 'none',
    real_name: kyc?.real_name || undefined,
    id_doc_type: (kyc?.id_doc_type as KycIdDocType) || 'id_card',
    id_doc_number: kyc?.id_doc_number || undefined,
    personal_email: kyc?.personal_email || undefined,
    personal_phone: kyc?.personal_phone || undefined,
    id_doc_front_url: kyc?.id_doc_front_url || undefined,
    id_doc_back_url: kyc?.id_doc_back_url || undefined,
    company_name: kyc?.company_name || undefined,
    company_doc_type: (kyc?.company_doc_type as KycCompanyDocType) || 'unified_social_credit_code',
    company_doc_number: kyc?.company_doc_number || undefined,
    company_email: kyc?.company_email || undefined,
    company_phone: kyc?.company_phone || undefined,
    business_license_url: kyc?.business_license_url || undefined,
    tax_registration_url: kyc?.tax_registration_url || undefined,
    legal_notarization_url: kyc?.legal_notarization_url || undefined,
    validity_type: (kyc?.validity_type as KycValidityType) || 'long_term',
    expire_at: kyc?.expire_at ? dayjs(kyc.expire_at) : null,
    reject_reason: kyc?.reject_reason || undefined,
    admin_remark: kyc?.admin_remark || undefined,
    is_default: kyc?.is_default ?? false,
  };
}

/**
 * 同时装填已有的个人与企业实名数据，支持在表单内无损切换类型且不覆盖已存内容
 */
export function bothKycToFormValues(
  activeType: UserKycType,
  personalKyc?: UserKyc | null,
  enterpriseKyc?: UserKyc | null,
): KycFormValues {
  const activeKyc = activeType === 'enterprise' ? enterpriseKyc : personalKyc;
  return {
    kyc_type: activeType,
    status: (activeKyc?.status as UserKycStatus) || 'none',
    // 个人实名数据
    real_name: personalKyc?.real_name || undefined,
    id_doc_type: (personalKyc?.id_doc_type as KycIdDocType) || 'id_card',
    id_doc_number: personalKyc?.id_doc_number || undefined,
    personal_email: personalKyc?.personal_email || undefined,
    personal_phone: personalKyc?.personal_phone || undefined,
    id_doc_front_url: personalKyc?.id_doc_front_url || undefined,
    id_doc_back_url: personalKyc?.id_doc_back_url || undefined,
    // 企业实名数据
    company_name: enterpriseKyc?.company_name || undefined,
    company_doc_type: (enterpriseKyc?.company_doc_type as KycCompanyDocType) || 'unified_social_credit_code',
    company_doc_number: enterpriseKyc?.company_doc_number || undefined,
    company_email: enterpriseKyc?.company_email || undefined,
    company_phone: enterpriseKyc?.company_phone || undefined,
    business_license_url: enterpriseKyc?.business_license_url || undefined,
    tax_registration_url: enterpriseKyc?.tax_registration_url || undefined,
    legal_notarization_url: enterpriseKyc?.legal_notarization_url || undefined,
    // 当前激活类型的有效期与审核说明
    validity_type: (activeKyc?.validity_type as KycValidityType) || 'long_term',
    expire_at: activeKyc?.expire_at ? dayjs(activeKyc.expire_at) : null,
    reject_reason: activeKyc?.reject_reason || undefined,
    admin_remark: activeKyc?.admin_remark || undefined,
    is_default: activeKyc ? !!activeKyc.is_default : (!personalKyc && !enterpriseKyc),
  };
}

export function formValuesToKycPayload(values: KycFormValues, includeStatus: boolean) {
  const payload: Record<string, unknown> = {
    kyc_type: values.kyc_type,
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
    validity_type: values.validity_type || 'long_term',
    expire_at: values.validity_type === 'expire_date' && values.expire_at
      ? values.expire_at.endOf('day').toISOString()
      : '',
    reject_reason: values.reject_reason || '',
    admin_remark: values.admin_remark || '',
  };
  if (values.is_default !== undefined) {
    payload.is_default = values.is_default;
  }
  if (includeStatus && values.status) {
    payload.status = values.status;
  }
  return payload;
}

async function uploadKycFile(file: File, docField: string, targetUserId?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_field', docField);
  if (targetUserId) formData.append('target_user_id', targetUserId);
  const res = await (request.post('/user/kyc/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as unknown as Promise<{ file_url: string }>);
  if (!res?.file_url) throw new Error('上传失败');
  return res.file_url;
}

type DocUploadProps = {
  label: string;
  value?: string;
  onChange?: (url?: string) => void;
  docField: string;
  targetUserId?: string;
  disabled?: boolean;
};

export const DocUploadField: React.FC<DocUploadProps> = ({
  label, value, onChange, docField, targetUserId, disabled,
}) => {
  const [uploading, setUploading] = useState(false);
  const isPdf = !!value && /\.pdf($|\?)/i.test(value);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <Text>{label}</Text>
      </div>
      <Space direction="vertical" style={{ width: '100%' }}>
        {value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {isPdf ? (
              <a href={value} target="_blank" rel="noreferrer">查看 PDF</a>
            ) : (
              <Image src={value} width={120} style={{ borderRadius: 6, objectFit: 'cover' }} />
            )}
            {!disabled && (
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => onChange?.(undefined)}
              >
                移除
              </Button>
            )}
          </div>
        ) : null}
        {!disabled && (
          <Upload
            showUploadList={false}
            accept="image/*,.pdf,application/pdf"
            beforeUpload={async (file) => {
              if (file.size > 12 * 1024 * 1024) {
                message.error('文件不能超过 12MB');
                return Upload.LIST_IGNORE;
              }
              try {
                setUploading(true);
                const url = await uploadKycFile(file as File, docField, targetUserId);
                onChange?.(url);
                message.success('上传成功');
              } catch (e: any) {
                message.error(e?.message || '上传失败');
              } finally {
                setUploading(false);
              }
              return Upload.LIST_IGNORE;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploading}>
              {value ? '重新上传' : '上传材料'}
            </Button>
          </Upload>
        )}
      </Space>
    </div>
  );
};

type Props = {
  form: any;
  mode: 'admin' | 'user';
  targetUserId?: string;
  /** 用户端已通过时只读 */
  readOnly?: boolean;
  currentStatus?: UserKycStatus;
  kycEnabled?: boolean;
  personalKyc?: UserKyc | null;
  enterpriseKyc?: UserKyc | null;
  onKycTypeChange?: (type: UserKycType) => void;
  /** 是否处于重新实名模式 */
  isReKyc?: boolean;
  /** 是否隐藏主体类型选择（只查看/编辑当前实名主体详细信息） */
  hideTypeRadio?: boolean;
};

/** 实名表单字段区（挂到外部 Form 上） */
const UserKycFormFields: React.FC<Props> = ({
  form,
  mode,
  targetUserId,
  readOnly,
  currentStatus,
  kycEnabled = true,
  personalKyc,
  enterpriseKyc,
  onKycTypeChange,
  isReKyc = false,
  hideTypeRadio = false,
}) => {
  const kycType = (Form.useWatch('kyc_type', form) as UserKycType | undefined) || form.getFieldValue?.('kyc_type') || 'personal';
  const idDocType = Form.useWatch('id_doc_type', form) as KycIdDocType | undefined;
  const validityType = Form.useWatch('validity_type', form) as KycValidityType | undefined;

  const activeRecord = kycType === 'enterprise' ? enterpriseKyc : personalKyc;
  const effectiveStatus: UserKycStatus = (activeRecord?.status as UserKycStatus) || currentStatus || 'none';
  const isCurrentApproved = kycEnabled && effectiveStatus === 'approved';
  // 用户模式下：若当前已认证且未处于重新实名模式，则为只读查看；若处于重新实名模式或未认证，则解锁可编辑
  const isFieldReadOnly = mode === 'user' ? (isCurrentApproved && !isReKyc) : (readOnly ?? false);
  const statusMeta = KYC_STATUS_META[effectiveStatus] || KYC_STATUS_META.none;

  // 判断是否两种类型都已通过
  const personalApproved = kycEnabled && (personalKyc?.status === 'approved');
  const enterpriseApproved = kycEnabled && (enterpriseKyc?.status === 'approved');
  // 用户端点击查看已实名信息，或指定 hideTypeRadio 时，不展示主体类型切换单选，只展示当前实名详细信息
  const showTypeRadio = !hideTypeRadio && !isFieldReadOnly;

  useEffect(() => {
    const fieldsToClear: string[] = kycType === 'enterprise'
      ? ['real_name', 'id_doc_type', 'id_doc_number', 'personal_email', 'personal_phone']
      : ['company_name', 'company_doc_type', 'company_doc_number', 'company_email', 'company_phone'];
    form.setFields?.(fieldsToClear.map(name => ({ name, errors: [] })));
  }, [kycType, form]);

  return (
    <div style={{ marginTop: 8 }}>
      {kycEnabled && effectiveStatus && effectiveStatus !== 'none' && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ marginRight: 8 }}>
            {kycType === 'enterprise' ? '企业(团体机构)实名状态' : '个人实名状态'}
          </Text>
          <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          {mode === 'admin' && activeRecord?.is_default && (
            <Tag color="blue" style={{ marginLeft: 4 }}>当前默认主体</Tag>
          )}
        </div>
      )}
      {kycEnabled && mode === 'user' && effectiveStatus === 'rejected' && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${kycType === 'enterprise' ? '企业(团体机构)' : '个人'}实名审核未通过`}
          description={activeRecord?.reject_reason || form.getFieldValue('reject_reason') || '请根据驳回原因修改后重新提交'}
        />
      )}
      {kycEnabled && mode === 'user' && effectiveStatus === 'pending' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${kycType === 'enterprise' ? '企业(团体机构)' : '个人'}实名正在审核中，审核通过前可修改后重新提交。`}
        />
      )}
      {kycEnabled && mode === 'user' && isCurrentApproved && (
        isReKyc ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`${kycType === 'enterprise' ? '企业(团体机构)' : '个人'}实名资料变更`}
            description="您正在重新提交实名认证资料。提交后将重新进入审核流程，审核通过前将更新实名信息。"
          />
        ) : (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message={`${kycType === 'enterprise' ? '企业(团体机构)' : '个人'}实名已通过审核，当前为只读查看模式。如需变更资料，请点击下方「重新实名」按钮。`}
          />
        )
      )}

      {showTypeRadio ? (
        <>
          <Form.Item
            name="kyc_type"
            label="选择实名主体类型"
            rules={[{ required: true, message: '请选择实名主体类型' }]}
            initialValue="personal"
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => onKycTypeChange?.(e.target.value)}
            >
              <Radio.Button value="personal">
                个人用户实名{personalApproved ? ' ✅' : ''}
              </Radio.Button>
              <Radio.Button value="enterprise">
                企业(团体机构)用户实名{enterpriseApproved ? ' ✅' : ''}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {kycType === 'enterprise'
                ? '💡 说明：企业实名与个人实名相互独立保留，分别对应管理后台的一条实名记录，保存后互不覆盖。'
                : '💡 说明：个人实名与企业实名相互独立保留，分别对应管理后台的一条实名记录，保存后互不覆盖。'}
            </Text>
          </div>
        </>
      ) : (
        <Form.Item name="kyc_type" hidden>
          <Input />
        </Form.Item>
      )}

      {mode === 'admin' && (
        <Form.Item name="status" label="认证状态" initialValue="approved">
          <Select
            options={[
              { value: 'none', label: '未认证' },
              { value: 'pending', label: '审核中' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
              { value: 'expired', label: '已过期' },
            ]}
          />
        </Form.Item>
      )}

      {/* 企业用户字段区：使用 display 控制显示隐藏，确保切换用户类型时已输入/已保存的数据不会被销毁 */}
      <div style={{ display: kycType === 'enterprise' ? 'block' : 'none' }}>
        <Form.Item
          name="company_name"
          label="企业名称"
          rules={kycType === 'enterprise' ? [{ required: true, message: '请输入企业名称' }] : []}
        >
          <Input disabled={isFieldReadOnly} placeholder="营业执照上的企业全称" maxLength={120} />
        </Form.Item>
        <Form.Item
          name="company_doc_type"
          label="企业证件类型"
          initialValue="unified_social_credit_code"
          rules={kycType === 'enterprise' ? [{ required: true, message: '请选择企业证件类型' }] : []}
        >
          <Select disabled={isFieldReadOnly} placeholder="请选择企业证件类型" options={COMPANY_DOC_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="company_doc_number"
          label="企业证件号码"
          rules={kycType === 'enterprise' ? [{ required: true, message: '请输入企业证件号码' }] : []}
        >
          <Input disabled={isFieldReadOnly} placeholder="统一社会信用代码 / 企业证件号码" maxLength={64} />
        </Form.Item>
        <Form.Item
          name="company_email"
          label="企业联系邮箱"
          rules={
            kycType === 'enterprise'
              ? [
                  { required: true, message: '请输入企业联系邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]
              : []
          }
        >
          <Input disabled={isFieldReadOnly} placeholder="用于接收企业业务通知与账单的邮箱" maxLength={120} />
        </Form.Item>
        <Form.Item
          name="company_phone"
          label="企业联系电话"
        >
          <Input disabled={isFieldReadOnly} placeholder="企业联系电话 / 负责人手机号（选填）" maxLength={32} />
        </Form.Item>

        <Divider dashed titlePlacement="left" plain style={{ fontSize: 13, color: '#8c8c8c', margin: '20px 0 16px' }}>
          企业证件扫描件（可选）
        </Divider>
        <Form.Item name="business_license_url" style={{ marginBottom: 0 }}>
          <DocUploadField
            label="营业执照照片/PDF"
            docField="business_license"
            targetUserId={targetUserId}
            disabled={isFieldReadOnly}
          />
        </Form.Item>
        <Form.Item name="legal_notarization_url" style={{ marginBottom: 0 }}>
          <DocUploadField
            label="企业法务公证材料"
            docField="legal_notarization"
            targetUserId={targetUserId}
            disabled={isFieldReadOnly}
          />
        </Form.Item>
      </div>

      {/* 个人用户字段区：使用 display 控制显示隐藏，确保切换用户类型时已输入/已保存的数据不会被销毁 */}
      <div style={{ display: kycType !== 'enterprise' ? 'block' : 'none' }}>
        <Form.Item
          name="real_name"
          label="真实姓名"
          rules={kycType !== 'enterprise' ? [{ required: true, message: '请输入真实姓名' }] : []}
        >
          <Input disabled={isFieldReadOnly} placeholder="与证件一致的姓名" maxLength={64} />
        </Form.Item>
        <Form.Item
          name="id_doc_type"
          label="证件类型"
          initialValue="id_card"
          rules={kycType !== 'enterprise' ? [{ required: true, message: '请选择证件类型' }] : []}
        >
          <Select disabled={isFieldReadOnly} placeholder="居民身份证 / 护照 / 驾驶证" options={ID_DOC_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="id_doc_number"
          label="证件号码"
          rules={kycType !== 'enterprise' ? [{ required: true, message: '请输入证件号码' }] : []}
        >
          <Input disabled={isFieldReadOnly} placeholder="请输入有效身份证件号码" maxLength={64} />
        </Form.Item>
        <Form.Item
          name="personal_email"
          label="联系邮箱"
          rules={
            kycType !== 'enterprise'
              ? [
                  { required: true, message: '请输入联系邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]
              : []
          }
        >
          <Input disabled={isFieldReadOnly} placeholder="请输入日常联系邮箱" maxLength={120} />
        </Form.Item>
        <Form.Item
          name="personal_phone"
          label="联系电话"
        >
          <Input disabled={isFieldReadOnly} placeholder="请输入联系手机号码（选填）" maxLength={32} />
        </Form.Item>

        <Divider dashed titlePlacement="left" plain style={{ fontSize: 13, color: '#8c8c8c', margin: '20px 0 16px' }}>
          个人证件扫描件（可选）
        </Divider>
        <Form.Item name="id_doc_front_url" style={{ marginBottom: 0 }}>
          <DocUploadField
            label={idDocType === 'passport' ? '护照个人信息页' : idDocType === 'driver_license' ? '驾照正面' : '证件正面/身份证正面'}
            docField="id_doc_front"
            targetUserId={targetUserId}
            disabled={isFieldReadOnly}
          />
        </Form.Item>
        {(idDocType === 'id_card' || !idDocType) && (
          <Form.Item name="id_doc_back_url" style={{ marginBottom: 0 }}>
            <DocUploadField
              label="身份证反面（国徽面）"
              docField="id_doc_back"
              targetUserId={targetUserId}
              disabled={isFieldReadOnly}
            />
          </Form.Item>
        )}
      </div>

      <Divider dashed titlePlacement="left" plain style={{ fontSize: 13, color: '#8c8c8c', margin: '20px 0 16px' }}>
        证件有效期限
      </Divider>
      <Form.Item
        name="validity_type"
        label="有效期"
        initialValue="long_term"
      >
        <Radio.Group disabled={isFieldReadOnly}>
          <Radio value="long_term">长期有效</Radio>
          <Radio value="expire_date">按证件到期日</Radio>
        </Radio.Group>
      </Form.Item>
      {validityType === 'expire_date' && (
        <Form.Item
          name="expire_at"
          label="证件到期日"
        >
          <DatePicker disabled={isFieldReadOnly} style={{ width: '100%' }} />
        </Form.Item>
      )}

      {mode === 'admin' && (
        <>
          <Divider dashed titlePlacement="left" plain style={{ fontSize: 13, color: '#8c8c8c', margin: '20px 0 16px' }}>
            默认主体偏好
          </Divider>
          <Form.Item name="is_default" valuePropName="checked" label="设为默认实名主体">
            <Switch disabled={isFieldReadOnly && !!activeRecord?.is_default} />
            <span style={{ marginLeft: 8, fontSize: 12, color: '#8c8c8c' }}>
              设为默认后，个人中心与开票等业务将默认优先展示与使用此实名信息
            </span>
          </Form.Item>
        </>
      )}

      {mode === 'admin' && (
        <>
          <Divider dashed titlePlacement="left" plain style={{ fontSize: 13, color: '#8c8c8c', margin: '20px 0 16px' }}>
            管理端审核
          </Divider>
          <Form.Item name="reject_reason" label="驳回原因">
            <Input.TextArea rows={2} placeholder="驳回时填写，用户端可见" maxLength={500} />
          </Form.Item>
          <Form.Item name="admin_remark" label="管理员备注">
            <Input.TextArea rows={2} placeholder="仅管理员可见" maxLength={500} />
          </Form.Item>
        </>
      )}
    </div>
  );
};

export default UserKycFormFields;
