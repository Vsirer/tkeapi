/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流空画布：仅「+ / 点击添加节点」（不做 Imagine 快捷创建预设）
 */
import React from 'react';
import toast from '../PlaygroundToast';
import { FlowIconPlus } from './flowIcons';
import type { PlaygroundModel } from '../../types';
import {
  buildModelTaskDefaults,
  pickDefaultModel,
} from '../../utils/flowDefaultModel';
import {
  DEFAULT_WORKFLOW_NODE_LIMIT,
  canAddWorkflowNodes,
  countWorkflowNodes,
  workflowNodeLimitMessage,
} from '../../utils/workflowNodeLimit';
import { createDefaultDirectorScene } from '../director_stage/directorScene';
import FlowAddNodePicker, { type FlowAddNodePickerState } from './FlowAddNodePicker';

export type NodeKey = 'preview' | 'volc_enhance' | 'prompt' | 'ai_video' | 'ai_image' | 'asset' | 'director';

/** 在画布视口中央添加高级节点（复用现有 canvas API） */
export function addAdvancedNodeToCanvas(opts: {
  type: NodeKey;
  nodes: any[];
  setNodes: (fn: (prev: any) => any) => void;
  maxZIndex: number;
  setMaxZIndex: (z: number) => void;
  canvasTransform: { x: number; y: number; scale: number };
  saveCanvasState: (nodes?: any) => void;
  models?: PlaygroundModel[];
  /** 指定落点（画布坐标）；缺省为视口中央 */
  placeAt?: { x: number; y: number };
  /** 优先使用的模型（节点列表按模型创建时） */
  preferredModel?: PlaygroundModel | null;
  /** 在同一 setNodes 事务内连线 */
  link?: (args: { nodes: any[]; primaryId: string }) => any[];
  /** 单个工作流可见节点总数上限 */
  nodeLimit?: number;
}): string | null {
  const {
    type, nodes, setNodes, maxZIndex, setMaxZIndex, canvasTransform, saveCanvasState, models, placeAt,
    preferredModel,
    nodeLimit = DEFAULT_WORKFLOW_NODE_LIMIT,
  } = opts;

  const addCount = type === 'volc_enhance' ? 2 : 1;
  if (!canAddWorkflowNodes(countWorkflowNodes(nodes), addCount, nodeLimit)) {
    toast.warning(workflowNodeLimitMessage(nodeLimit));
    return null;
  }

  const newZIndex = maxZIndex + 1;
  setMaxZIndex(newZIndex);

  const rect = document.body.getBoundingClientRect();
  const viewCenterX = rect.width / 2;
  const viewCenterY = rect.height / 2;
  const canvasX = placeAt?.x ?? ((viewCenterX - canvasTransform.x) / canvasTransform.scale - 140);
  const canvasY = placeAt?.y ?? ((viewCenterY - canvasTransform.y) / canvasTransform.scale - 100);

  const newNodesToPush: any[] = [];
  let primaryId = `node-${Date.now()}`;

  if (type === 'preview') {
    newNodesToPush.push({
      id: primaryId,
      type: 'image',
      status: 'completed',
      resultData: { content: '[预览节点] 尚未关联素材' },
      x: canvasX,
      y: canvasY,
      width: 280,
      height: 200,
      zIndex: newZIndex,
      taskData: { node_type: 'preview' },
    });
  } else if (type === 'volc_enhance') {
    const volcNodeId = primaryId;
    newNodesToPush.push({
      id: volcNodeId,
      type: 'video',
      status: 'completed',
      resultData: { content: { video_url: '' } },
      x: canvasX,
      y: canvasY,
      width: 280,
      height: 240,
      zIndex: newZIndex,
      taskData: {
        node_type: 'volc_enhance',
        model: '火山画质增强 - 标准版',
        scene: 'AI 生成 (AIGC)',
        resolution: '保持原分辨率',
        fps: '保持原帧率',
      },
    });
    newNodesToPush.push({
      id: `node-${Date.now() + 1}`,
      type: 'video',
      status: 'completed',
      resultData: { content: `[预览节点] 关联至素材: ${volcNodeId}` },
      x: canvasX + 280 + 40,
      y: canvasY,
      width: 280,
      height: 200,
      zIndex: newZIndex + 1,
      parentId: volcNodeId,
      taskData: { node_type: 'preview' },
    });
  } else if (type === 'prompt') {
    newNodesToPush.push({
      id: primaryId,
      type: 'text',
      status: 'completed',
      resultData: { content: '' },
      x: canvasX,
      y: canvasY,
      width: 280,
      height: 180,
      zIndex: newZIndex,
      taskData: { node_type: 'prompt', prompt: '' },
    });
  } else if (type === 'ai_video') {
    const def = preferredModel || pickDefaultModel(models, 'video');
    const modelDefaults = buildModelTaskDefaults(def);
    newNodesToPush.push({
      id: primaryId,
      type: 'video',
      status: 'completed',
      resultData: { content: { video_url: '' } },
      x: canvasX,
      y: canvasY,
      width: 569,
      height: 440,
      zIndex: newZIndex,
      taskData: {
        node_type: 'ai_video',
        duration: '5秒',
        motion: '中 (推荐)',
        prompt: '',
        ...modelDefaults,
      },
    });
  } else if (type === 'ai_image') {
    const def = preferredModel || pickDefaultModel(models, 'image');
    const modelDefaults = buildModelTaskDefaults(def);
    newNodesToPush.push({
      id: primaryId,
      type: 'image',
      status: 'completed',
      resultData: { content: { image_url: '' } },
      x: canvasX,
      y: canvasY,
      width: 320,
      height: 440,
      zIndex: newZIndex,
      taskData: {
        node_type: 'ai_image',
        aspect_ratio: modelDefaults.aspect_ratio || modelDefaults.aspectRatio || '1:1',
        prompt: '',
        ...modelDefaults,
      },
    });
  } else if (type === 'asset') {
    newNodesToPush.push({
      id: primaryId,
      type: 'image',
      status: 'completed',
      resultData: { content: { image_url: '' } },
      x: canvasX,
      y: canvasY,
      width: 300,
      height: 260,
      zIndex: newZIndex,
      taskData: {
        node_type: 'asset',
        label: '素材',
        node_title: '素材',
      },
    });
  } else if (type === 'director') {
    newNodesToPush.push({
      id: primaryId,
      type: 'image',
      status: 'completed',
      resultData: { content: { image_url: '' } },
      x: canvasX,
      y: canvasY,
      width: 300,
      height: 260,
      zIndex: newZIndex,
      taskData: {
        node_type: 'director',
        label: '导演台',
        node_title: '导演台',
        scene: createDefaultDirectorScene(),
        files: [],
      },
    });
  }

  setNodes((prev: any) => {
    let next = [...prev, ...newNodesToPush];
    if (opts.link && primaryId) {
      next = opts.link({ nodes: next, primaryId });
    }
    saveCanvasState(next);
    return next;
  });
  return primaryId;
}

interface WorkflowEmptyAddNodeProps {
  visible: boolean;
}

const WorkflowEmptyAddNode: React.FC<WorkflowEmptyAddNodeProps> = ({ visible }) => {
  const [picker, setPicker] = React.useState<FlowAddNodePickerState>(null);

  if (!visible) return null;

  return (
    <div className="pg-flow-empty">
      <div className="pg-flow-empty-inner">
        <button
          type="button"
          className="pg-flow-empty-plus"
          aria-label="添加节点"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setPicker({
              clientX: rect.left + rect.width / 2 - 110,
              clientY: rect.bottom + 8,
            });
          }}
        >
          <FlowIconPlus size={22} />
        </button>
        <h1 className="pg-flow-empty-title">点击添加节点</h1>
      </div>
      <FlowAddNodePicker state={picker} onClose={() => setPicker(null)} />
    </div>
  );
};

export default WorkflowEmptyAddNode;
