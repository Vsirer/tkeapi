/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Imagine Flow 左侧 57px 图标栏
 */
import React from 'react';
import { Dropdown, Tooltip } from '../../ui';
import type { MenuProps } from '../../ui';
import useSettingsStore from '../../../../../store/settings';
import toast from '../PlaygroundToast';
import { Terminal } from 'lucide-react';
import {
  FlowIconAssets,
  FlowIconHelp,
  FlowIconPlus,
  FlowIconPresets,
} from './flowIcons';
import FlowPageSettings from './FlowPageSettings';
import { getFlowEditorPrefs, saveFlowEditorPrefs } from '../../utils/userPrefsApi';

export type FlowRailTab = 'nodes' | 'assets' | 'presets' | null;

interface WorkflowLeftRailProps {
  active?: FlowRailTab;
  onSelect: (tab: FlowRailTab, meta?: { clientX: number; clientY: number }) => void;
  menuItems?: MenuProps['items'];
  onMenuClick?: (info: { key: string }) => void;
}

const WorkflowLeftRail: React.FC<WorkflowLeftRailProps> = ({
  active,
  onSelect,
  menuItems,
  onMenuClick,
}) => {
  const { settings } = useSettingsStore();
  const siteLogo = settings?.site?.logo || '';
  const siteName = settings?.site?.name || 'TB';

  const items: { key: FlowRailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'nodes', label: '节点', icon: <FlowIconPlus size={18} /> },
    { key: 'assets', label: '资源', icon: <FlowIconAssets size={18} /> },
    { key: 'presets', label: '预设', icon: <FlowIconPresets size={18} /> },
  ];

  const handleClick = async (key: FlowRailTab, e: React.MouseEvent<HTMLButtonElement>) => {
    if (key === 'nodes') {
      const rect = e.currentTarget.getBoundingClientRect();
      onSelect(key, { clientX: rect.right + 8, clientY: rect.top });
      return;
    }
    if (key === 'assets') {
      // 切换资源侧栏（再次点击关闭）
      onSelect(active === 'assets' ? null : 'assets');
      return;
    }
    onSelect(key);
    if (key === 'presets') {
      await saveFlowEditorPrefs({ emptyHintSeen: true });
      toast.info('快捷创建暂未开放');
    }
  };

  React.useEffect(() => {
    getFlowEditorPrefs().catch(() => undefined);
  }, []);

  const logoBtn = (
    <button type="button" className="pg-flow-rail-logo" aria-label={siteName}>
      {siteLogo ? (
        <img src={siteLogo} alt={siteName} />
      ) : (
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary text-primary-foreground">
          <Terminal className="w-3.5 h-3.5" />
        </div>
      )}
    </button>
  );

  return (
    <aside className="pg-flow-rail">
      {menuItems && onMenuClick ? (
        <Dropdown
          menu={{ items: menuItems, onClick: onMenuClick }}
          trigger={['click']}
          placement="bottomLeft"
          overlayClassName="shadcn-dropdown dark"
          overlayStyle={{ zIndex: 3200 }}
        >
          <Tooltip title="菜单" placement="right">{logoBtn}</Tooltip>
        </Dropdown>
      ) : (
        logoBtn
      )}

      <nav className="pg-flow-rail-nav">
        {items.map((it) => (
          <button
            key={it.key!}
            type="button"
            className={`pg-flow-rail-item${active === it.key ? ' is-active' : ''}`}
            onClick={(e) => handleClick(it.key, e)}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        ))}
      </nav>

      <div className="pg-flow-rail-bottom">
        <FlowPageSettings />
        <Tooltip title="帮助与资源" placement="right" overlayStyle={{ zIndex: 5200 }}>
          <button
            type="button"
            className="pg-flow-rail-icon-btn"
            aria-label="帮助与资源"
            onClick={() => window.open('/docs', '_blank')}
          >
            <FlowIconHelp size={18} />
          </button>
        </Tooltip>
      </div>
    </aside>
  );
};

export default WorkflowLeftRail;
