/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

/** 创作中心2026：协议名后的 ?，展示该预设实际发出的字段。 */
export const ChatProtocolHelpMark: React.FC<{ detail: string; isLight?: boolean }> = ({
  detail,
  isLight = true,
}) => (
  <Tooltip
    title={
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.55, maxWidth: 440 }}>
        {detail}
      </div>
    }
    overlayInnerStyle={{ maxWidth: 480 }}
    overlayStyle={{ zIndex: 2200 }}
    getPopupContainer={() => document.body}
  >
    <QuestionCircleOutlined
      style={{
        marginLeft: 6,
        fontSize: 13,
        color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)',
        cursor: 'help',
        verticalAlign: 'middle',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  </Tooltip>
);

export function chatProtocolSelectLabel(
  label: string,
  detail: string,
  isLight?: boolean,
): React.ReactNode {
  return (
    <span>
      {label}
      <ChatProtocolHelpMark detail={detail} isLight={isLight} />
    </span>
  );
}
