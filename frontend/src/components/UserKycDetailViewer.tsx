/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useState } from 'react';
import { Modal, Button, message, Tooltip } from 'antd';
import {
  ShieldCheck,
  Building2,
  User as UserIcon,
  Mail,
  Phone,
  CreditCard,
  Calendar,
  RotateCcw,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import type { UserKyc } from '../types';

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

export interface UserKycDetailViewerProps {
  open: boolean;
  onClose: () => void;
  onReKyc: () => void;
  kyc: UserKyc | null;
  isEn?: boolean;
}

const UserKycDetailViewer: React.FC<UserKycDetailViewerProps> = ({
  open,
  onClose,
  onReKyc,
  kyc,
  isEn = false,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!kyc) return null;

  const isEnterprise = kyc.kyc_type === 'enterprise';

  const handleCopy = (text?: string | null, key = 'id_num') => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      message.success(isEn ? 'Copied to clipboard' : '已复制到剪贴板');
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const docTypeLabel = isEnterprise
    ? COMPANY_DOC_LABEL_MAP[kyc.company_doc_type || ''] || kyc.company_doc_type || (isEn ? 'Business License / Tax Code' : '统一社会信用代码')
    : ID_DOC_LABEL_MAP[kyc.id_doc_type || ''] || kyc.id_doc_type || (isEn ? 'ID Card' : '居民身份证');

  const mainName = isEnterprise
    ? kyc.company_name || (isEn ? 'Unnamed Company' : '未设置企业名称')
    : kyc.real_name || (isEn ? 'Unnamed' : '未设置姓名');

  const docNumber = isEnterprise ? kyc.company_doc_number : kyc.id_doc_number;
  const contactEmail = isEnterprise ? kyc.company_email : kyc.personal_email;
  const contactPhone = isEnterprise ? kyc.company_phone : kyc.personal_phone;


  const validityText = kyc.validity_type === 'long_term'
    ? (isEn ? 'Permanent Valid' : '长期有效')
    : kyc.expire_at
      ? `${isEn ? 'Expires on ' : '有效期至 '}${kyc.expire_at.slice(0, 10)}`
      : (isEn ? 'Permanent Valid' : '长期有效');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={680}
      destroyOnClose
      centered
      title={
        <div className="flex items-center gap-2.5 text-zinc-900 dark:text-zinc-100 font-semibold text-base">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span>{isEn ? 'Real-Name Verification Details' : '用户实名详细信息'}</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full pt-2">
          <Button
            onClick={onReKyc}
            icon={<RotateCcw className="w-4 h-4 mr-1 text-zinc-600 dark:text-zinc-300" />}
            className="flex items-center rounded-lg border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 shadow-sm px-4 h-9 font-medium transition-all"
          >
            {isEn ? 'Re-verify' : '重新实名'}
          </Button>
          <Button
            type="primary"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-sm px-5 h-9 font-medium transition-all border-none"
          >
            {isEn ? 'Close' : '关闭'}
          </Button>
        </div>
      }
    >
      <div className="py-2 space-y-4">
        {/* 顶部状态卡片 */}
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              {isEnterprise ? <Building2 className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {mainName}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck className="w-3 h-3" />
                  {isEn ? 'Verified' : '官方认证已通过'}
                </span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                <span>{isEnterprise ? '企业(团体机构)用户' : '个人用户'}</span>
                {kyc.is_default && (
                  <>
                    <span>•</span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">{isEn ? 'Default Entity' : '当前默认生效主体'}</span>
                  </>
                )}
                {kyc.reviewed_at && (
                  <>
                    <span>•</span>
                    <span>{isEn ? 'Reviewed: ' : '认证时间: '}{kyc.reviewed_at.slice(0, 10)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 详细信息展示卡片群 */}
        <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 p-4 space-y-4 shadow-sm">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            {isEn ? 'Identity & Certificate' : '实名主体与证件信息'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 证件类型 */}
            <div className="p-3 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isEnterprise ? (isEn ? 'Company Doc Type' : '企业证件类型') : (isEn ? 'ID Type' : '证件类型')}</span>
              </div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {docTypeLabel}
              </div>
            </div>

            {/* 证件号码 */}
            <div className="p-3 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{isEnterprise ? (isEn ? 'Tax ID / Doc No.' : '纳税人识别号/信用代码') : (isEn ? 'ID Number' : '证件号码')}</span>
                </div>
                <div className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {docNumber || '-'}
                </div>
              </div>
              {docNumber && (
                <Tooltip title={isEn ? 'Copy' : '复制'}>
                  <button
                    onClick={() => handleCopy(docNumber, 'doc_num')}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {copiedKey === 'doc_num' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </Tooltip>
              )}
            </div>

            {/* 联系邮箱 */}
            <div className="p-3 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isEnterprise ? (isEn ? 'Company Email' : '企业联系邮箱') : (isEn ? 'Contact Email' : '联系邮箱')}</span>
              </div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                {contactEmail || '-'}
              </div>
            </div>

            {/* 联系电话 */}
            <div className="p-3 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isEnterprise ? (isEn ? 'Company Phone' : '企业联系电话') : (isEn ? 'Contact Phone' : '联系电话')}</span>
              </div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {contactPhone || (isEn ? 'Not set' : '未设置')}
              </div>
            </div>

            {/* 证件有效期 */}
            <div className="p-3 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80 md:col-span-2">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isEn ? 'Certificate Validity' : '证件有效期'}</span>
              </div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <span>{validityText}</span>
                {kyc.validity_type === 'long_term' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-normal">
                    长期
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default UserKycDetailViewer;
