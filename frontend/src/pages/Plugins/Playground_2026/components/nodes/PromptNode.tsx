/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 📝 AI 提示词节点
 * 采用全新的暗黑极简 UI 风格，仿 Copilot 对话框设计，圆角为 24px，标题外置。
 */
import React, { useState, useMemo } from 'react';
import type { AdvancedNodeProps } from './shared/types';
import toast from '../PlaygroundToast';
import { useCanvas } from '../../context/PlaygroundContext';
import NodeConnectors from './shared/NodeConnectors';
import { FlowIconPrompt } from '../flow/flowIcons';
import MentionPromptField from '../MentionPromptField';
import {
  buildFlowMentionAssets,
  collectPromptNodeMentionItems,
} from '../../utils/flowSlotMentionAssets';

const PromptNode: React.FC<AdvancedNodeProps> = ({
  node,
  nodes,
  isLight,
  onRemove,
  updateNodeTaskData,
  isSelected,
}) => {
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const { connectingSourceId, setConnectingSourceId, setConnectingMousePos, canvasRef, canvasTransform } = useCanvas();
  const prompt = node.taskData?.prompt || '';

  const hasChildConnection = useMemo(() => {
    return (nodes || []).some(n => n.parentId === node.id && !n.isHidden);
  }, [nodes, node.id]);

  const mentionAssets = useMemo(
    () => buildFlowMentionAssets(collectPromptNodeMentionItems(node.id, nodes || [])),
    [node.id, nodes],
  );

  const showSocket = isNodeHovered || hasChildConnection || (connectingSourceId === node.id);

  // 顺序索引计算
  const promptNodes = nodes.filter(n => n.taskData?.node_type === 'prompt');
  const nodeIndex = promptNodes.findIndex(n => n.id === node.id);
  const displayIndex = nodeIndex !== -1 ? nodeIndex + 1 : 4;

  const handleEnhance = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!prompt.trim()) {
      toast.info('请先输入提示词再使用魔法优化');
      return;
    }
    const suffix = ', photorealistic, 8k resolution, highly detailed, masterpiece';
    if (!prompt.includes('masterpiece') && !prompt.includes('detailed')) {
      updateNodeTaskData({ prompt: prompt.trim() + suffix });
      toast.success('已使用智能魔法优化提示词！');
    } else {
      toast.info('提示词已处于优化状态');
    }
  };

  return (
    <div
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        overflow: 'visible',
      }}
    >

      {/* 2. 节点外面顶部的标题 */}
      <div style={{
        position: 'absolute',
        top: -30,
        left: 4,
        display: 'flex',
        alignItems: 'center',
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        <span style={{ marginRight: 8, opacity: 0.8, display: 'inline-flex' }}>
          <FlowIconPrompt size={14} />
        </span>
        <span>提示词 {displayIndex}</span>
      </div>

      {/* 3. 圆角主体输入区域 */}
      <div style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        background: '#1b1b1e',
        borderRadius: 24,
        padding: '18px 20px 48px 20px', // 底部留出空间放魔法棒
        border: `${isSelected ? '1.5px' : '1px'} solid ${isSelected ? '#1677ff' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isSelected
          ? '0 0 0 1px rgba(22,119,255,0.15), 0 8px 32px rgba(0, 0, 0, 0.6)'
          : '0 4px 20px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        transition: 'all 0.2s ease-in-out',
      }}>
        <div className="pg-flow-prompt-mention">
          <MentionPromptField
            value={prompt}
            onChange={(next) => updateNodeTaskData({ prompt: next })}
            assets={mentionAssets}
            placeholder="在此输入提示词…"
            dropdownTitle="引用文件"
            emptyText="暂无参考文件，请先将提示词接到图片/视频节点并接上文件"
            isLight={false}
          />
        </div>

        {/* 4. 右下角魔法棒按钮 */}
        <div
          onClick={handleEnhance}
          style={{
            position: 'absolute',
            bottom: 16,
            right: 20,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* The Wand */}
            <g transform="rotate(-45 12 12)">
              <rect x="9.5" y="4.5" width="5" height="15" rx="2.5" />
              <path d="M9.5 9.5h5" />
            </g>
            
            {/* Sparkle 1 (Top left) */}
            <path d="M9.5 4 Q9.5 6.5 12 6.5 Q9.5 6.5 9.5 9 Q9.5 6.5 7 6.5 Q9.5 6.5 9.5 4" />
            
            {/* Sparkle 2 (Middle left) */}
            <path d="M6 10 Q6 12 8 12 Q6 12 6 14 Q6 12 4 12 Q6 12 6 10" />
            
            {/* Sparkle 3 (Bottom right) */}
            <path d="M18 14 Q18 16 20 16 Q18 16 18 18 Q18 16 16 16 Q18 16 18 14" />
          </svg>
        </div>
      </div>

      <NodeConnectors
        side="right"
        visible={!!showSocket}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'prompt'}
        sockets={[
          {
            id: 'Prompt',
            color: '#38bdf8',
            connected: hasChildConnection,
            onConnectStart: (e) => {
              e.stopPropagation();
              e.preventDefault();
              setConnectingSourceId(node.id);
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                setConnectingMousePos({
                  x: (e.clientX - rect.left - canvasTransform.x) / canvasTransform.scale,
                  y: (e.clientY - rect.top - canvasTransform.y) / canvasTransform.scale,
                });
              }
            },
          },
        ]}
      />

    </div>
  );
};

PromptNode.displayName = 'PromptNode';
export default React.memo(PromptNode);
