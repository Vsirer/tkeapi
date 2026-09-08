/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 底部中央操作栏（Imagine：Move / 密钥 / Image / Video / … / Sections）
 */
import React from 'react';
import { Tooltip } from '../../ui';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import toast from '../PlaygroundToast';
import TokenSelectorPop from '../TokenSelectorPop';
import { addAdvancedNodeToCanvas } from './WorkflowEmptyAddNode';
import { isDirectorStageEnabled } from '../../utils/workflowBasicNodes';
import { resolveWorkflowNodeLimit } from '../../utils/workflowNodeLimit';
import { saveSelectedTokenKey } from '../../utils/imageGenerationApi';
import {
  FlowIconAssets,
  FlowIconAudio,
  FlowIconAutoLayout,
  FlowIconDirector,
  FlowIconImage,
  FlowIconMove,
  FlowIconPrompt,
  FlowIconSections,
  FlowIconVideo,
} from './flowIcons';

const WorkflowOpBar: React.FC = () => {
  const { nodes, setNodes, maxZIndex, setMaxZIndex, canvasTransform, activeTool, setActiveTool, handleRearrange } = useCanvas();
  const {
    saveCanvasState,
    advancedNodesConfig,
    models,
    apiTokens,
    setApiTokens,
    selectedTokenKey,
    setSelectedTokenKey,
    storageStats,
  } = usePlayground();

  const isMoveTool = activeTool === 'pointer' || activeTool === 'hand';
  const isSectionTool = activeTool === 'section';

  // 退出区块绘制后去掉按钮焦点，避免残留浏览器 focus 描边
  React.useEffect(() => {
    if (activeTool === 'section') return;
    const el = document.activeElement as HTMLElement | null;
    if (el?.closest?.('.pg-flow-opbar')) el.blur();
  }, [activeTool]);

  const add = (type: 'ai_image' | 'ai_video' | 'prompt' | 'preview' | 'asset' | 'director') => {
    if (type === 'director' && !isDirectorStageEnabled(advancedNodesConfig)) return;
    addAdvancedNodeToCanvas({
      type,
      nodes,
      setNodes,
      maxZIndex,
      setMaxZIndex,
      canvasTransform,
      saveCanvasState,
      models,
      nodeLimit: resolveWorkflowNodeLimit(storageStats),
    });
  };

  return (
    <div className="pg-flow-opbar" onWheel={(e) => e.stopPropagation()}>
      <Tooltip title="移动（按住空格可平移画布）">
        <button
          type="button"
          className={`pg-flow-opbar-btn${isMoveTool ? ' is-active' : ''}`}
          aria-label="移动"
          aria-pressed={isMoveTool}
          onClick={() => setActiveTool('pointer')}
        >
          <FlowIconMove size={18} />
        </button>
      </Tooltip>
      <div className="pg-flow-opbar-divider" />
      <TokenSelectorPop
        tokens={apiTokens || []}
        selectedTokenKey={selectedTokenKey || ''}
        onTokensChange={setApiTokens}
        onSelect={(key) => {
          setSelectedTokenKey(key);
          saveSelectedTokenKey(key);
        }}
        variant="opbar"
      />
      <div className="pg-flow-opbar-divider" />
      {advancedNodesConfig?.ai_image_enabled !== false && (
        <Tooltip title="图片">
          <button type="button" className="pg-flow-opbar-btn" onClick={() => add('ai_image')}>
            <FlowIconImage size={18} />
          </button>
        </Tooltip>
      )}
      {advancedNodesConfig?.ai_video_enabled !== false && (
        <Tooltip title="视频">
          <button type="button" className="pg-flow-opbar-btn" onClick={() => add('ai_video')}>
            <FlowIconVideo size={18} />
          </button>
        </Tooltip>
      )}
      <Tooltip title="音频（即将支持）">
        <button
          type="button"
          className="pg-flow-opbar-btn"
          onClick={() => toast.info('音频节点即将接入')}
        >
          <FlowIconAudio size={18} />
        </button>
      </Tooltip>
      {advancedNodesConfig?.prompt_enabled !== false && (
        <Tooltip title="提示词">
          <button type="button" className="pg-flow-opbar-btn" onClick={() => add('prompt')}>
            <FlowIconPrompt size={18} />
          </button>
        </Tooltip>
      )}
      {advancedNodesConfig?.asset_enabled !== false && (
        <Tooltip title="素材">
          <button type="button" className="pg-flow-opbar-btn" onClick={() => add('asset')}>
            <FlowIconAssets size={18} />
          </button>
        </Tooltip>
      )}
      {isDirectorStageEnabled(advancedNodesConfig) && (
        <Tooltip title="导演台">
          <button type="button" className="pg-flow-opbar-btn" onClick={() => add('director')}>
            <FlowIconDirector size={18} />
          </button>
        </Tooltip>
      )}
      <div className="pg-flow-opbar-divider" />
      <Tooltip title={isSectionTool ? '绘制区块中（Esc 或点移动退出）' : '区块'}>
        <button
          type="button"
          className={`pg-flow-opbar-btn${isSectionTool ? ' is-active' : ''}`}
          aria-pressed={isSectionTool}
          onClick={() => {
            if (isSectionTool) {
              setActiveTool('pointer');
              return;
            }
            setActiveTool('section');
            toast.info('点击画布放置，或拖拽指定区域；Esc 或点「移动」退出');
          }}
        >
          <FlowIconSections size={18} />
        </button>
      </Tooltip>
      <Tooltip title="整理布局">
        <button
          type="button"
          className="pg-flow-opbar-btn"
          onClick={() => handleRearrange()}
          aria-label="整理布局"
        >
          <FlowIconAutoLayout size={18} />
        </button>
      </Tooltip>
    </div>
  );
};

export default WorkflowOpBar;
