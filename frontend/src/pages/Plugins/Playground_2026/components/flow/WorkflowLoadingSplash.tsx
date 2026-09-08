/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流进场加载：上方 Logo + 下方进度条（对齐 Imagine flow-loading-fill/wave）
 */
import React, { useEffect, useState } from 'react';
import useSettingsStore from '../../../../../store/settings';
import { Terminal } from 'lucide-react';

const MIN_VISIBLE_MS = 1200;

interface WorkflowLoadingSplashProps {
  loading: boolean;
}

const WorkflowLoadingSplash: React.FC<WorkflowLoadingSplashProps> = ({ loading }) => {
  const { settings } = useSettingsStore();
  const siteLogo = settings?.site?.logo || '';
  const siteName = settings?.site?.name || 'TokensByte';
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const mountedAt = React.useRef(Date.now());

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setLeaving(false);
      mountedAt.current = Date.now();
      return;
    }
    const elapsed = Date.now() - mountedAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const t1 = window.setTimeout(() => setLeaving(true), wait);
    const t2 = window.setTimeout(() => setVisible(false), wait + 320);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loading]);

  if (!visible) return null;

  return (
    <div className={`pg-flow-splash${leaving ? ' is-leaving' : ''}`} aria-busy="true" aria-label="加载中">
      {siteLogo ? (
        <img className="pg-flow-splash-logo" src={siteLogo} alt={siteName} />
      ) : (
        <div className="pg-flow-splash-logo-fallback">
          <Terminal size={32} />
        </div>
      )}
      <div className="pg-flow-splash-track" role="progressbar" aria-valuemin={0} aria-valuemax={100}>
        <div className="pg-flow-splash-fill">
          <div className="pg-flow-splash-wave" />
        </div>
      </div>
    </div>
  );
};

export default WorkflowLoadingSplash;
