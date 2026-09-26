/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react';
import { Card, Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import EmailNotification from './EmailNotification';
import SmsNotification from './SmsNotification';

const MessageNotification: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Card bordered={false} title="消息通知" style={{ borderRadius: 12 }}>
      <Tabs
        defaultActiveKey="email"
        items={[
          {
            key: 'email',
            label: t('menu.email_notification'),
            children: <EmailNotification />,
          },
          {
            key: 'sms',
            label: t('menu.sms_notification'),
            children: <SmsNotification />,
          },
        ]}
      />
    </Card>
  );
};

export default MessageNotification;
