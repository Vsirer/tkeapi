/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Playground 主组件 — 工作流画布工作台（Imagine Flow 风格壳）
 * 通过 URL 参数 workflowId 确定当前工作流
 */
import React from 'react';
import { useThemeStore } from "../../../store/theme";
import { PlaygroundUIProvider } from './ui';
import type { MenuProps } from './ui';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { PlaygroundProvider, usePlayground, useCanvas } from './context/PlaygroundContext';
import { useGlobalTaskPolling } from './hooks/useGeneration';
import InfiniteCanvas from './components/InfiniteCanvas';
import ChatPanel from './components/ChatPanel';
import FloatingHeader from './components/FloatingHeader';
import WorkflowPropertiesPanel from './components/flow/WorkflowPropertiesPanel';
import GenerationLogWidget from './components/GenerationLogWidget';
import ModelDrawer from './components/ModelDrawer';
import TokenModal from './components/TokenModal';
import ZoomIndicator from './components/ZoomIndicator';
import PlaygroundHealthGate from './components/PlaygroundHealthGate';
import WorkflowLoadingSplash from './components/flow/WorkflowLoadingSplash';
import WorkflowLeftRail, { type FlowRailTab } from './components/flow/WorkflowLeftRail';
import WorkflowOpBar from './components/flow/WorkflowOpBar';
import WorkflowResourcePanel from './components/flow/WorkflowResourcePanel';
import FlowAddNodePicker, { type FlowAddNodePickerState } from './components/flow/FlowAddNodePicker';
import toast from './components/PlaygroundToast';
import { openWorkflowInNewTab } from './utils/openWorkflowTab';
import './Playground.css';
import './styles/imagineShell.css';
import './styles/imagineFlow.css';

const PlaygroundLayout: React.FC = () => {
  const navigate = useNavigate();
  const { themeMode } = useThemeStore();
  const {
    currentModel, isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    isModelDrawerVisible, setIsModelDrawerVisible, isGenLogVisible, setIsGenLogVisible,
    loading, saveCanvasState, entityListPath,
    duplicateProject, currentProjectId, projects,
  } = usePlayground();
  const { setSelectedNodeId } = useCanvas();

  useGlobalTaskPolling();

  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);
  const [railTab, setRailTab] = React.useState<FlowRailTab>(null);
  const [addNodePicker, setAddNodePicker] = React.useState<FlowAddNodePickerState>(null);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (isMobile) setIsSettingsWidgetVisible(false);
  }, [isMobile, setIsSettingsWidgetVisible]);

  const isChatMode = currentModel?.scheme_type === 'chat';

  const menuItems: MenuProps['items'] = [
    { key: 'back', label: '返回创作中心' },
    { key: 'back_console', label: '返回控制台' },
    { type: 'divider' },
    { key: 'duplicate', label: '复制工作流' },
  ];

  const onMenuClick = async ({ key }: { key: string }) => {
    if (key === 'back') {
      await saveCanvasState();
      navigate(entityListPath);
    } else if (key === 'back_console') {
      await saveCanvasState();
      navigate('/dashboard');
    } else if (key === 'duplicate') {
      if (!currentProjectId) return;
      const name = projects.find(p => p.id === currentProjectId)?.name || '未命名工作流';
      const newId = await duplicateProject(currentProjectId, `${name} 副本`);
      if (newId) {
        toast.success('已复制');
        openWorkflowInNewTab(`${entityListPath}/${newId}`);
      }
    }
  };

  const onRailSelect = (tab: FlowRailTab, meta?: { clientX: number; clientY: number }) => {
    setRailTab(tab);
    if (tab === 'nodes') {
      if (meta) {
        setAddNodePicker({ clientX: meta.clientX, clientY: meta.clientY });
      } else {
        setAddNodePicker({ clientX: 72, clientY: 120 });
      }
      // 再次点击同一项时收起高亮
      window.setTimeout(() => setRailTab(null), 0);
    }
  };

  const resourcePanelOpen = railTab === 'assets';

  /** 工作流界面接管系统右键（输入框除外，便于复制粘贴） */
  const onFlowContextMenuCapture = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, [contenteditable="true"]')) return;
    // 画布空白处的插入菜单由 InfiniteCanvas 处理；此处统一拦截浏览器菜单
    e.preventDefault();
  };

  return (
    <div
      className={`playground-root pg-ig pg-flow-editor${resourcePanelOpen && !isMobile ? ' has-resource-panel' : ''}`}
      data-theme={themeMode}
      onContextMenuCapture={onFlowContextMenuCapture}
    >
      <WorkflowLoadingSplash loading={loading} />

      {!isMobile && (
        <WorkflowLeftRail
          active={railTab}
          onSelect={onRailSelect}
          menuItems={menuItems}
          onMenuClick={onMenuClick}
        />
      )}

      {!isMobile && (
        <WorkflowResourcePanel
          open={resourcePanelOpen}
          onClose={() => setRailTab(null)}
        />
      )}

      <div className="pg-flow-main">
        {isChatMode ? (
          <ChatPanel />
        ) : (
          <InfiniteCanvas isMobile={isMobile} flowEditor />
        )}
        <FloatingHeader flowEditor />
        {!isChatMode && !isMobile && <ZoomIndicator flowEditor />}
        {!isChatMode && !isMobile && <WorkflowOpBar />}
        <GenerationLogWidget />
      </div>

      {/* 工作流：Imagine 风格右侧属性面板 */}
      <WorkflowPropertiesPanel />

      <FlowAddNodePicker state={addNodePicker} onClose={() => setAddNodePicker(null)} />

      <div
        onClick={() => setIsModelDrawerVisible(false)}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          zIndex: 2100,
          opacity: isModelDrawerVisible && isMobile ? 1 : 0,
          pointerEvents: isModelDrawerVisible && isMobile ? 'auto' : 'none',
        }}
      />
      <ModelDrawer />

      <div
        onClick={() => setIsSettingsWidgetVisible(false)}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 2098,
          opacity: (isMobile && isSettingsWidgetVisible) ? 1 : 0,
          pointerEvents: (isMobile && isSettingsWidgetVisible) ? 'auto' : 'none',
        }}
      />

      <div
        onClick={() => {
          setIsGenLogVisible(false);
          setSelectedNodeId(null);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 999,
          opacity: (isMobile && isGenLogVisible) ? 1 : 0,
          pointerEvents: (isMobile && isGenLogVisible) ? 'auto' : 'none',
        }}
      />

      <TokenModal />
    </div>
  );
};

const Playground: React.FC = () => {
  const { themeMode } = useThemeStore();
  const { projectId, workflowId } = useParams<{ projectId?: string; workflowId?: string }>();
  const listPath = '/playground-2026/workflows';

  if (projectId && !workflowId) {
    return <Navigate to={listPath} replace />;
  }

  if (!workflowId) return <Navigate to={listPath} replace />;

  const numericProjectId = parseInt(workflowId, 10);
  if (isNaN(numericProjectId)) return <Navigate to={listPath} replace />;

  return (
    <PlaygroundUIProvider mode={themeMode === 'dark' ? 'dark' : 'light'}>
      <PlaygroundProvider projectId={numericProjectId} entityKind="workflow">
        <PlaygroundLayout />
      </PlaygroundProvider>
    </PlaygroundUIProvider>
  );
};

const PlaygroundPage: React.FC = () => (
  <PlaygroundHealthGate>
    <Playground />
  </PlaygroundHealthGate>
);

export default PlaygroundPage;
