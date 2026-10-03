/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react';
import { Typography, Tag, Progress } from 'antd';
import { DollarCircleOutlined, RightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/theme';
import useSettingsStore from '../store/settings';

const { Text } = Typography;

interface WalletBalanceDisplayProps {
  record: {
    balance?: number;
    used_quota?: number;
    gift_balance?: number;
    gift_used_quota?: number;
    credit_limit?: number;
    commission_balance?: number;
    pay_enabled?: number;
  };
  onWalletClick?: (record: any, tab?: 'commission') => void;
  isLight?: boolean;
  currencySymbol?: string;
  systemLabel?: React.ReactNode;
  giftLabel?: React.ReactNode;
  width?: string | number;
  gap?: string | number;
  monthStats?: {
    recharge_amount: number;
    gift_amount: number;
  };
  /** 系统钱包总充值金额（来自充值记录合计），传入后显示"总充值"而非 balance+used_quota */
  totalRecharge?: number;
  /** 赠送钱包总充值金额（来自充值记录合计） */
  totalGiftRecharge?: number;
  /** 列表页展示消费合计（used_quota / gift_used_quota），优先于总充值 */
  showConsumption?: boolean;
  /** 当月消费合计（传入后标签变为「本月消费合计」） */
  monthConsumption?: {
    system_cost: number;
    gift_cost: number;
  };
}

const WalletBalanceDisplay: React.FC<WalletBalanceDisplayProps> = ({
  record,
  onWalletClick,
  isLight: customIsLight,
  currencySymbol: customCurrencySymbol,
  systemLabel,
  giftLabel,
  width,
  gap = 16,
  monthStats,
  totalRecharge,
  totalGiftRecharge,
  showConsumption = false,
  monthConsumption,
}) => {
  const { t } = useTranslation('team_marketing');
  
  // 动态读取主题 (若未传)
  const { themeMode } = useThemeStore();
  const isLight = customIsLight !== undefined ? customIsLight : themeMode === 'light';
  
  // 动态读取币种符号 (若未传)
  const { settings } = useSettingsStore();
  const currencySymbol = customCurrencySymbol !== undefined ? customCurrencySymbol : (settings?.currency?.currency_symbol || '$');

  const balance = record.balance || 0;
  const used = record.used_quota || 0;
  const total = balance + used;
  const percent = total > 0 ? (balance / total) * 100 : 0;

  const gift = record.gift_balance || 0;
  const gift_used = record.gift_used_quota || 0;
  const gift_total = gift + gift_used;
  const gift_percent = gift_total > 0 ? (gift / gift_total) * 100 : 0;

  const creditLimit = record.credit_limit || 0;
  const commission = record.commission_balance || 0;
  const muted = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

  const isMonthView = !!monthStats;
  const hasTotalRecharge = totalRecharge !== undefined;
  const isMonthConsumption = showConsumption && !!monthConsumption;

  let displayTotal: number;
  let displayGiftTotal: number;
  let labelPrefix: string;

  if (showConsumption) {
    displayTotal = isMonthConsumption ? monthConsumption.system_cost : used;
    displayGiftTotal = isMonthConsumption ? monthConsumption.gift_cost : gift_used;
    labelPrefix = isMonthConsumption ? '本月消费合计' : '消费合计';
  } else {
    displayTotal = isMonthView ? monthStats.recharge_amount : (hasTotalRecharge ? totalRecharge : total);
    displayGiftTotal = isMonthView ? monthStats.gift_amount : (totalGiftRecharge !== undefined ? totalGiftRecharge : gift_total);
    labelPrefix = isMonthView ? '本月' : (hasTotalRecharge ? '总充值' : '总');
  }

  const displaySystemLabel = systemLabel || t('system_wallet', '系统钱包');
  const displayGiftLabel = giftLabel || t('gift_wallet', '赠送钱包');

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    columnGap: typeof gap === 'number' ? `${gap}px` : gap,
    rowGap: 6,
  };

  const itemStyle: React.CSSProperties = width !== undefined
    ? { width, cursor: onWalletClick ? 'pointer' : 'default' }
    : { flex: 1, minWidth: 0, maxWidth: 160, cursor: onWalletClick ? 'pointer' : 'default' };

  const handleWalletClick = () => {
    if (onWalletClick) {
      onWalletClick(record);
    }
  };

  // 可用余额 = 系统余额 + 信控额度
  const availableBalance = balance + creditLimit;

  // 格式化信控额度显示：整数不带小数，有小数则保留最多6位并去除多余零
  const formatCreditLimit = (val: number) => {
    if (Number.isInteger(val)) {
      return val.toString();
    }
    return parseFloat(val.toFixed(6)).toString();
  };

  return (
    <div style={containerStyle}>
      {/* 系统钱包 */}
      <div style={itemStyle} onClick={handleWalletClick}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', marginBottom: 2 }}>
          <Text style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {displaySystemLabel}
          </Text>
          {/* 关闭支付标识 */}
          {record.pay_enabled === 0 && (
            <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px', border: 'none', whiteSpace: 'nowrap' }}>
              关闭支付
            </Tag>
          )}
          {/* 信控额度标识 */}
          {creditLimit > 0 && (
            <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px', border: 'none', whiteSpace: 'nowrap' }}>
              💳 信控 {currencySymbol}{formatCreditLimit(creditLimit)}
            </Tag>
          )}
        </div>
        <div style={{ lineHeight: 1.2, marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            <span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, marginRight: 4 }}>余额</span>
            {currencySymbol}{balance.toFixed(6)}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
            <span style={{ marginRight: 4 }}>{labelPrefix}</span>
            {currencySymbol}{displayTotal.toFixed(6)}
          </div>
        </div>
        <Progress 
          percent={percent} 
          showInfo={false} 
          size="small" 
          strokeColor={percent < 10 ? '#ff4d4f' : percent < 40 ? '#faad14' : '#52c41a'} 
          trailColor={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} 
          style={{ margin: 0, lineHeight: 1 }} 
        />
      </div>

      {/* 赠送钱包 */}
      <div style={itemStyle} onClick={handleWalletClick}>
        <Text style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, display: 'block', marginBottom: 2, whiteSpace: 'nowrap' }}>
          {displayGiftLabel}
        </Text>
        <div style={{ lineHeight: 1.2, marginBottom: 4, opacity: displayGiftTotal > 0 || gift > 0 ? 1 : 0.6 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            <span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, marginRight: 4 }}>余额</span>
            {currencySymbol}{gift.toFixed(6)}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
            <span style={{ marginRight: 4 }}>{labelPrefix}</span>
            {currencySymbol}{displayGiftTotal.toFixed(6)}
          </div>
        </div>
        <Progress 
          percent={gift_percent} 
          showInfo={false} 
          size="small" 
          strokeColor={gift > 0 ? (isLight ? '#18181b' : '#fafafa') : '#ff4d4f'} 
          trailColor={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} 
          style={{ margin: 0, lineHeight: 1 }} 
        />
      </div>

      {commission > 0 && (
        <div
          style={{
            flexBasis: '100%',
            maxWidth: typeof width === 'number' ? width * 2 + (typeof gap === 'number' ? gap : 16) : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 8px',
            borderRadius: 6,
            border: `1px solid ${isLight ? 'rgba(217, 119, 6, 0.22)' : 'rgba(250, 173, 20, 0.26)'}`,
            background: isLight
              ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.5) 0%, rgba(253, 230, 138, 0.22) 100%)'
              : 'linear-gradient(135deg, rgba(250, 173, 20, 0.12) 0%, rgba(217, 119, 6, 0.05) 100%)',
            cursor: onWalletClick ? 'pointer' : 'default',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxSizing: 'border-box',
          }}
          className="transition-all hover:brightness-105"
          onClick={(e) => {
            e.stopPropagation();
            if (onWalletClick) onWalletClick(record, 'commission');
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <DollarCircleOutlined style={{ fontSize: 12, color: isLight ? '#d97706' : '#faad14' }} />
            <span style={{ color: isLight ? '#92400e' : '#faad14', fontSize: 11, fontWeight: 500 }}>
              {t('commission_wallet', '佣金钱包')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isLight ? '#b45309' : '#ffe58f',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.2px',
              }}
            >
              {currencySymbol}{commission.toFixed(6)}
            </span>
            <RightOutlined style={{ fontSize: 9, color: isLight ? '#d97706' : '#faad14', opacity: 0.6 }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletBalanceDisplay;
