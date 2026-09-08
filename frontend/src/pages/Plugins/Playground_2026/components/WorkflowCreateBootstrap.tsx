/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * /workflows/create：创建工作流后新标签打开编辑页
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, App, PlaygroundUIProvider } from '../ui';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../../../store/theme';
import { createWorkflow } from '../utils/workflowsApi';
import { openWorkflowInNewTab } from '../utils/openWorkflowTab';
import PlaygroundHealthGate from './PlaygroundHealthGate';

const WorkflowCreateInner: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { themeMode } = useThemeStore();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const created = await createWorkflow(
          t('playground_2026:untitled_workflow', '未命名工作流'),
        );
        const opened = openWorkflowInNewTab(`/playground-2026/workflows/${created.id}`);
        // 新标签已打开时，本页回到列表；弹窗被拦时 openWorkflowInNewTab 会同页跳转
        if (opened) {
          navigate('/playground-2026/workflows', { replace: true });
        }
      } catch (e: any) {
        message.error(
          e?.response?.data?.error?.message ||
            e?.message ||
            t('playground_2026:workflow_create_failed', '创建工作流失败'),
        );
        navigate('/playground-2026/workflows', { replace: true });
      }
    })();
  }, [navigate, message, t]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: themeMode === 'light' ? '#fafafa' : '#09090b',
      }}
    >
      <Spin tip={t('playground_2026:workflow_creating', '正在创建...')} />
    </div>
  );
};

const WorkflowCreateBootstrap: React.FC = () => {
  const { themeMode } = useThemeStore();
  return (
    <PlaygroundUIProvider mode={themeMode === 'dark' ? 'dark' : 'light'}>
      <WorkflowCreateInner />
    </PlaygroundUIProvider>
  );
};

const WorkflowCreateBootstrapPage: React.FC = () => (
  <PlaygroundHealthGate>
    <WorkflowCreateBootstrap />
  </PlaygroundHealthGate>
);

export default WorkflowCreateBootstrapPage;
