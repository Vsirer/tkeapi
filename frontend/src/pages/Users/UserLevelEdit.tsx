/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Space, Tabs, Spin, Switch, Radio } from 'antd';
import { SaveOutlined, ArrowLeftOutlined, KeyOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { pinyin } from 'pinyin-pro';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import type { UserLevel } from '../../types';

const { TabPane } = Tabs;

const UserLevelEdit: React.FC = () => {
  const { t } = useTranslation();
  const { actionId } = useParams<{ actionId: string }>();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [marketingToggleLoading, setMarketingToggleLoading] = useState(false);
  const [groupKeyManuallyEdited, setGroupKeyManuallyEdited] = useState(false);
  const isAdd = actionId === 'new';

  const generateGroupKey = (nameStr: string) => {
    if (!nameStr) return '';
    try {
      const py = pinyin(nameStr, { toneType: 'none', type: 'array' });
      const cleanPy = py.map(p => p.toLowerCase().replace(/[^a-z0-9]/g, '')).join('');
      return cleanPy || 'group_' + Date.now().toString().slice(-4);
    } catch (e) {
      return 'group_' + Date.now().toString().slice(-4);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAdd && !groupKeyManuallyEdited) {
      const newName = e.target.value;
      const key = generateGroupKey(newName);
      form.setFieldValue('group_key', key);
    }
  };

  useEffect(() => {
    if (isAdd) {
      setLoading(false);
      form.setFieldsValue({
        discount: 1.0,
        discount_type: 2,
        commission_ratio: 0.0,
        invite_reward_inviter: 0.0,
        invite_reward_invitee: 0.0,
        daily_invite_limit: 10,
        marketing_enabled: false,
        is_default: false,
        max_token_count: 10,
        allow_view_log_details: true,
        sort_order: 0,
        invoice_enabled: false,
      });
      return;
    }

    const fetchLevel = async () => {
      setLoading(true);
      try {
        const resp = await (request.get('/user_levels') as unknown as Promise<{ data: UserLevel[] }>);
        const level = resp.data.find((l: UserLevel) => String(l.id) === actionId);
        if (level) {
          form.setFieldsValue({
            ...level,
            discount_type: level.discount_type ?? 0,
            marketing_enabled: level.marketing_enabled === 1,
            is_default: level.is_default === 1,
            allow_view_log_details: level.allow_view_log_details === undefined ? true : level.allow_view_log_details === 1,
            invoice_enabled: level.invoice_enabled === 1,
          });
        } else {
          message.error('未找到对应等级记录');
          navigate(`/${adminPath}/user-levels`);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchLevel();
  }, [actionId, form, isAdd, navigate]);

  const handleSave = async (values: any) => {
    setSaving(true);
    // Convert boolean switch back to number, guarding against undefined to prevent overwriting with 0
    const payload = {
      ...values,
      marketing_enabled: values.marketing_enabled === undefined ? undefined : (values.marketing_enabled ? 1 : 0),
      is_default: values.is_default === undefined ? undefined : (values.is_default ? 1 : 0),
      allow_view_log_details: values.allow_view_log_details === undefined ? undefined : (values.allow_view_log_details ? 1 : 0),
      invoice_enabled: values.invoice_enabled === undefined ? undefined : (values.invoice_enabled ? 1 : 0),
    };
    // 新建时自动生成 group_key
    if (isAdd && !payload.group_key) {
      payload.group_key = generateGroupKey(values.name || '');
    }
    if (!payload.group_key) {
      message.error('分组标识不能为空');
      setSaving(false);
      return;
    }
    try {
      if (isAdd) {
        await request.post('/user_levels', payload);
        message.success(t('user_levels.success'));
      } else {
        await request.put(`/user_levels/${actionId}`, payload);
        message.success(t('user_levels.success'));
      }
      navigate(`/${adminPath}/user-levels`);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /** 专属推广开关：编辑模式下切换即生效，无需点保存配置 */
  const handleMarketingEnabledChange = async (checked: boolean) => {
    form.setFieldValue('marketing_enabled', checked);
    if (isAdd) return;

    setMarketingToggleLoading(true);
    try {
      await request.put(`/user_levels/${actionId}`, {
        marketing_enabled: checked ? 1 : 0,
      });
      message.success(checked ? '专属推广模式已开启' : '专属推广模式已关闭');
    } catch (e) {
      console.error(e);
      form.setFieldValue('marketing_enabled', !checked);
    } finally {
      setMarketingToggleLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: 100 }}><Spin size="large" /></div>;
  }

  return (
    <Card 
      title={
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/${adminPath}/user-levels`)} />
          <span>{isAdd ? t('user_levels.add_level') : t('user_levels.edit_level')}</span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving}>
          保存配置
        </Button>
      }
      bordered={false}
    >
      <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 800 }}>
        <Tabs defaultActiveKey="1" type="card">
          <TabPane tab="等级基本信息" key="1">
            <Form.Item name="name" label={t('user_levels.name')} rules={[{ required: true }]}>
              <Input placeholder="输入等级呈现的中文名称" onChange={handleNameChange} />
            </Form.Item>
            <Form.Item 
              name="group_key" 
              label={t('user_levels.group_key', '等级标志ID (Group Key)')} 
              rules={[{ required: true }]}
              extra="辅助的英文字母等级标识符（如 vip1）。系统底层已拥有永久不可变的【4位数字用户等级ID】作为安全兜底，您可以在需要的时候安全地修改本标识而不用担心数据解绑。"
            >
              <Input 
                placeholder="e.g. vip, primary" 
                disabled={!isAdd}
                onChange={() => { if(isAdd) setGroupKeyManuallyEdited(true); }}
              />
            </Form.Item>
            <Form.Item 
              name="discount_type" 
              label="折扣使用设置" 
              extra={
                <div className="mt-2 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground border border-border shadow-sm">
                  <div className="mb-2 text-[13px] font-medium flex items-center text-foreground">
                    <span className="mr-1.5">💡</span> 折扣生效规则说明
                  </div>
                  <div className="mb-3 text-xs leading-relaxed opacity-90">
                    <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">用户模型折扣</code> 是单独为用户设置的对应的专属模型折扣，系统在结算根据以下策略自动取<strong className="text-foreground font-semibold">最大折扣力度（即最大优惠）</strong>：
                  </div>
                  <ul className="space-y-3 text-xs m-0 pl-0 list-none">
                    <li className="flex flex-col gap-1 relative pl-3 before:content-[''] before:absolute before:left-0 before:top-2 before:w-1 before:h-1 before:bg-primary/50 before:rounded-full">
                      <span className="font-medium text-foreground flex items-center gap-1.5"><span className="text-[14px]">🎚️</span> 用户等级折扣优先</span>
                      <span className="text-muted-foreground/80 leading-snug">仅比较 <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">用户模型折扣</code> 与 <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">用户等级折扣</code>，自动选取<strong className="text-foreground">最低值</strong>。选取用户等级折扣，模型站点折扣不生效，只有单独为用户设置的模型折扣才生效。</span>
                    </li>
                    <li className="flex flex-col gap-1 relative pl-3 before:content-[''] before:absolute before:left-0 before:top-2 before:w-1 before:h-1 before:bg-primary/50 before:rounded-full">
                      <span className="font-medium text-foreground flex items-center gap-1.5"><span className="text-[14px]">🌐</span> 全站折扣优先</span>
                      <span className="text-muted-foreground/80 leading-snug">仅比较 <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">用户模型折扣</code> 与 <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">全局全站折扣</code>，自动选取<strong className="text-foreground">最低值</strong>。</span>
                    </li>
                    <li className="flex flex-col gap-1 relative pl-3 before:content-[''] before:absolute before:left-0 before:top-2 before:w-1 before:h-1 before:bg-primary/50 before:rounded-full">
                      <span className="font-medium text-foreground flex items-center gap-1.5"><span className="text-[14px]">⚙️</span> 默认融合（不选择）</span>
                      <span className="text-muted-foreground/80 leading-snug">综合对比 <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">用户模型折扣</code>、<code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">用户等级折扣</code> 及 <code className="bg-background border border-border/50 px-1 py-0.5 rounded text-[11px] font-mono text-foreground">全局全站折扣</code>，自动选取三者<strong className="text-foreground">最低值</strong>。</span>
                    </li>
                  </ul>
                </div>
              }
            >
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button value={2}>用户等级折扣 (默认)</Radio.Button>
                <Radio.Button value={1}>全站折扣</Radio.Button>
                <Radio.Button value={0}>不选择 (系统融合)</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item 
              name="discount" 
              label={t('user_levels.discount', '计费倍率 (Discount/Multiplier)')} 
              rules={[{ required: true }]}
              extra="设置用户计费的乘数。1 为原价不打折；小于1为折扣优惠（如 0.8 为 8折）；大于1为加倍收费（如 1.5 表明加价50%）。"
            >
              <InputNumber style={{ width: '100%' }} min={0.01} max={999} step={0.01} precision={2} />
            </Form.Item>
            <Form.Item name="description" label={t('user_levels.description')}>
              <Input.TextArea rows={4} placeholder="描述该组特权或补充信息..." />
            </Form.Item>
            <Form.Item 
              name="sort_order" 
              label="排序（数字越大越靠前）" 
              extra="数字大的将显示在列表前面"
            >
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item 
              name="is_default" 
              label="设为默认注册等级" 
              valuePropName="checked"
              extra="开启后，新用户注册时将自动成为该等级。同一时间只能有一个默认注册等级，设置后会覆盖之前的默认等级。"
            >
              <Switch />
            </Form.Item>
          </TabPane>

          <TabPane tab="等级营销推广" key="2" forceRender>
            <Form.Item 
              name="marketing_enabled" 
              label="开启专属推广模式 (高优先级)" 
              valuePropName="checked"
              extra={
                isAdd
                  ? '开启后，被邀请人注册时将不再发放站点的「全局注册好礼」，而是直接发放该等级配置的面额。邀请人也会根据日限制额度获得对应提成。新建等级需点击「保存配置」后生效。'
                  : '开启后立即生效，无需点击「保存配置」。被邀请人注册时将不再发放站点的「全局注册好礼」，而是直接发放该等级配置的面额。邀请人也会根据日限制额度获得对应提成。'
              }
            >
              <Switch
                loading={marketingToggleLoading}
                onChange={handleMarketingEnabledChange}
              />
            </Form.Item>

            <Form.Item 
              name="commission_ratio" 
              label="返利比例 (邀请充值返现)" 
              rules={[{ required: true }]}
              extra="邀请的用户充值后，邀请人获得的奖金入账比例 (0-1)"
            >
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                max={1} 
                step={0.01} 
                precision={2} 
                formatter={value => `${Math.round((Number(value) || 0) * 100)}%`}
                parser={value => (parseFloat(value?.replace('%', '') || '0') / 100) as any}
              />
            </Form.Item>

            <Form.Item 
              name="invite_reward_inviter" 
              label="邀请成功送额度（给邀请人）" 
              rules={[{ required: true }]}
              extra="当受邀人成功注册并激活后，一次性赠送给【邀请人】的固定消费额度"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} precision={2} />
            </Form.Item>

            <Form.Item 
              name="invite_reward_invitee" 
              label="走邀请链接注册送额度（给新客户/受邀人）" 
              rules={[{ required: true }]}
              extra="【受到邀请】而来的新用户，一经注册额外直接赠送的启动资金加成额度"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} precision={2} />
            </Form.Item>

            <Form.Item 
              name="daily_invite_limit" 
              label="每日邀请人数上限 (0为无限)" 
              rules={[{ required: true }]}
              extra="限制每天最多有多少个有效下线名额可以获得固定额度奖励，防止机器批量注册撸羊毛（超出的邀请可能依然绑定但不支持送额度）"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1} precision={0} />
            </Form.Item>
          </TabPane>

          <TabPane tab={<span><KeyOutlined /> 密钥配置</span>} key="3" forceRender>
            <Form.Item 
              name="max_token_count" 
              label="最大密钥创建数量" 
              rules={[{ required: true }]}
              extra="限制该等级用户可以创建的 API 密钥数量上限。设为 0 表示禁止创建密钥。"
            >
              <InputNumber style={{ width: '100%' }} min={0} max={1000} step={1} precision={0} />
            </Form.Item>
          </TabPane>

          <TabPane tab="日志配置" key="4" forceRender>
            <Form.Item 
              name="allow_view_log_details" 
              label="查看日志详情" 
              valuePropName="checked"
              extra="设置关闭后，属于当前用户等级的用户在页面的使用日志和任务日志里只能看列表信息，无法点击下拉看详细内容（同时隐藏使用日志的详情文案和任务日志的加号图标），设置开启后才能看。"
            >
              <Switch />
            </Form.Item>
          </TabPane>

          <TabPane tab={<span><FileTextOutlined /> Invoices收据&发票</span>} key="5" forceRender>
            <Form.Item 
              name="invoice_enabled" 
              label="开启该用户等级的 Invoices 收据与发票功能" 
              valuePropName="checked"
              extra="开启后，属于该等级的用户登录时可在「用户设置 -> 财务发票 (Invoices)」中使用发票与交易凭单功能；关闭则对该等级用户隐藏。"
            >
              <Switch />
            </Form.Item>

            <Card 
              size="small" 
              style={{ 
                marginTop: 16, 
                borderRadius: 8, 
                background: 'var(--ant-color-bg-container)',
                border: '1px solid var(--ant-color-border-secondary)'
              }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500 }}>
                  <FileTextOutlined style={{ color: '#722ed1', fontSize: 18 }} />
                  <span>发票与收据全局业务参数统一配置</span>
                </div>
                <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                  发票开票主体、纳税人识别号、销方联系邮箱、国际海外模式（商业发票/收据前缀、货币符号、打印条款）与中国大陆境内增值税发票规则（起开门槛、税率、应税劳务类目）等全局业务参数，已统一移至<b>「支付财务设置 → Invoices收据&amp;发票」</b>中集中维护。在此处开启本等级权限后，该等级用户即可使用全局配置的发票功能。
                </div>
                <div style={{ marginTop: 4 }}>
                  <Button 
                    type="primary" 
                    icon={<SettingOutlined />}
                    onClick={() => navigate(`/${adminPath}/payment-settings?tab=invoices`)}
                    style={{
                      backgroundColor: '#722ed1',
                      borderColor: '#722ed1',
                      color: '#ffffff',
                      fontWeight: 500,
                      borderRadius: 6,
                      boxShadow: '0 2px 8px rgba(114, 46, 209, 0.4)',
                    }}
                  >
                    前往「支付财务设置」配置发票详细规则
                  </Button>
                </div>
              </Space>
            </Card>
          </TabPane>
        </Tabs>
      </Form>
    </Card>
  );
};

export default UserLevelEdit;
