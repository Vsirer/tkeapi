/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react';
import { Typography, theme } from 'antd';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import { lightTheme } from '@uiw/react-json-view/light';
import { useThemeStore } from '../../../store/theme';

const { Text } = Typography;

function safeParse(str?: string | null) {
  if (str == null || str === '') return { raw_text: '(空)' };
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return { raw_text: str };
  }
}

/** 素材资产中心「接口日志」同款：Request / 上游 / Response JSON 树展开 */
const ApiLogPayloadExpand: React.FC<{
  request?: string | null;
  upstream?: string | null;
  response?: string | null;
}> = ({ request, upstream, response }) => {
  const { themeMode } = useThemeStore();
  const { token } = theme.useToken();
  const isLight = themeMode === 'light';
  const jsonTheme = isLight ? lightTheme : darkTheme;
  const panelBg = isLight ? token.colorBgContainer : '#141414';
  const panelBorder = isLight ? '1px solid #e8e8e8' : '1px solid #303030';

  const block = (title: string, color: string, payload?: string | null, last?: boolean) => (
    <div style={{ marginBottom: last ? 0 : 16 }}>
      <Text strong style={{ color, display: 'block', marginBottom: 8 }}>{title}</Text>
      <div
        style={{
          background: panelBg,
          padding: 16,
          borderRadius: 8,
          maxHeight: 500,
          overflow: 'auto',
          border: panelBorder,
        }}
      >
        <JsonView
          value={safeParse(payload)}
          style={jsonTheme}
          collapsed={false}
          shortenTextAfterLength={0}
          displayDataTypes={false}
          displayObjectSize={false}
        />
      </div>
    </div>
  );

  const items = [
    { title: '📤 Request Payload', color: token.colorPrimary, payload: request },
    ...(upstream
      ? [{ title: '📡 上游请求', color: token.colorSuccess, payload: upstream }]
      : []),
    { title: '📥 Response Payload', color: token.colorWarning, payload: response },
  ];

  return (
    <div
      style={{
        margin: 0,
        padding: 16,
        background: isLight ? token.colorFillQuaternary : '#1e1e1e',
        borderRadius: 8,
      }}
    >
      {items.map((it, i) => block(it.title, it.color, it.payload, i === items.length - 1))}
    </div>
  );
};

export default ApiLogPayloadExpand;
