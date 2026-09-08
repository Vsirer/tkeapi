/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingOutlined } from '../../ui';
import type { AdvancedNodeProps } from './shared/types';
import { useCanvas } from '../../context/PlaygroundContext';
import NodeConnectors from './shared/NodeConnectors';
import NodeMoreMenu, { getNodeDisplayTitle } from './shared/NodeMoreMenu';
import NodeTitleInline from './shared/NodeTitleInline';
import { usePreviewMediaInfo, type PreviewMediaItem } from '../../utils/previewMedia';

function IconPlay({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.92)" />
      <path d="M20 16.5v15l12-7.5-12-7.5z" fill="#1a1a1a" />
    </svg>
  );
}

const PreviewMediaView: React.FC<{ item: PreviewMediaItem }> = ({ item }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlaying(false);
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, [item.url, item.kind]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  if (item.kind === 'image') {
    return (
      <img
        src={item.url}
        alt="Preview"
        className="pg-flow-preview-media-el"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
    );
  }

  if (item.kind === 'video') {
    return (
      <>
        <video
          ref={videoRef}
          src={item.url}
          className="pg-flow-preview-media-el"
          playsInline
          preload="metadata"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
        {!playing && (
          <button type="button" className="pg-flow-asset-play" onClick={togglePlay} aria-label="播放">
            <IconPlay />
          </button>
        )}
        {playing && (
          <button
            type="button"
            className="pg-flow-asset-play is-playing"
            onClick={togglePlay}
            aria-label="暂停"
          />
        )}
      </>
    );
  }

  if (item.kind === 'audio') {
    return (
      <audio
        src={item.url}
        controls
        style={{ width: '90%' }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>暂不支持该素材类型预览</span>;
};

const PreviewNode: React.FC<AdvancedNodeProps> = ({
  node,
  displayNode,
  nodes,
  onRemove,
  updateNodeTaskData,
  setNodes,
  saveCanvasState,
}) => {
  const {
    connectingSourceId,
    setConnectingSourceId,
    setConnectingMousePos,
    canvasRef,
    canvasTransform,
  } = useCanvas();
  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const switchSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLeftSockets = isNodeHovered || (connectingSourceId && connectingSourceId !== node.id);

  const defaultTitle = `预览 ${node.id.split('-').pop()?.slice(-3) || '1'}`;
  const nodeTitle = getNodeDisplayTitle(node, defaultTitle);

  const hasChildConnection = useMemo(() => {
    return (nodes || []).some((n) => n.parentId === node.id && !n.isHidden);
  }, [nodes, node.id]);

  const { sourceNode, isParentLost, mediaType, finalUrl, isGenerating, items, activeIndex } =
    usePreviewMediaInfo(node, displayNode, nodes || []);

  const activeItem = items[activeIndex] || items[0] || null;
  const socketColor =
    mediaType === 'video' ? '#4ade80' : mediaType === 'audio' ? '#f472b6' : '#f59e0b';
  const socketLabel =
    mediaType === 'video' ? 'Video output' : mediaType === 'audio' ? 'Audio output' : 'Image output';

  useEffect(
    () => () => {
      if (switchSaveTimerRef.current) clearTimeout(switchSaveTimerRef.current);
    },
    [],
  );

  const setActiveItem = (nextIndex: number) => {
    if (!sourceNode || !items.length) return;
    const idx = Math.min(Math.max(0, nextIndex), items.length - 1);
    const item = items[idx];
    if (!item) return;

    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== sourceNode.id) return n;
        if (sourceNode.taskData?.node_type === 'asset') {
          return {
            ...n,
            resultData: {
              ...(n.resultData || {}),
              content: {
                ...(typeof n.resultData?.content === 'object' && n.resultData.content
                  ? n.resultData.content
                  : {}),
                active_file_id: item.id,
              },
            },
            taskData: {
              ...(n.taskData || {}),
              active_file_id: item.id,
            },
          };
        }
        return {
          ...n,
          resultData: {
            ...(n.resultData || {}),
            content: {
              ...(typeof n.resultData?.content === 'object' && n.resultData.content
                ? n.resultData.content
                : {}),
              active_index: idx,
            },
          },
          taskData: {
            ...(n.taskData || {}),
            active_result_index: idx,
          },
        };
      }),
    );

    if (switchSaveTimerRef.current) clearTimeout(switchSaveTimerRef.current);
    switchSaveTimerRef.current = setTimeout(() => {
      switchSaveTimerRef.current = null;
      void saveCanvasState();
    }, 450);
  };

  return (
    <div
      onMouseEnter={() => setIsNodeHovered(true)}
      onMouseLeave={() => setIsNodeHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        overflow: 'visible',
        boxSizing: 'border-box',
        gap: 8,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -26,
          left: 8,
          right: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: '#fff',
            minWidth: 0,
            pointerEvents: 'auto',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <NodeTitleInline
            nodeId={node.id}
            title={nodeTitle}
            onCommit={(next) => updateNodeTaskData({ label: next, node_title: next })}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'auto', flexShrink: 0 }}>
          <NodeMoreMenu
            hideTrigger
            node={node}
            defaultTitle={defaultTitle}
            onRemove={onRemove}
            updateNodeTaskData={updateNodeTaskData}
            setNodes={setNodes}
            saveCanvasState={saveCanvasState}
          />
        </div>
      </div>

      <NodeConnectors
        side="left"
        visible={!!showLeftSockets}
        centerY
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'preview'}
        sockets={[
          {
            id: 'Input',
            color: isParentLost ? 'rgba(255,255,255,0.2)' : '#10b981',
            connected: !isParentLost,
          },
        ]}
      />
      <NodeConnectors
        side="right"
        visible={isNodeHovered || !!finalUrl || hasChildConnection}
        nodeId={node.id}
        nodeType={node.taskData?.node_type || 'preview'}
        sockets={[
          {
            id: socketLabel,
            color: socketColor,
            connected: !!finalUrl || hasChildConnection,
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

      <div className="pg-flow-preview-panel">
        {isParentLost && (
          <div className="pg-flow-preview-badge is-lost">已断开</div>
        )}

        {isParentLost ? (
          <div className="pg-flow-preview-empty">
            <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 500 }}>
              ⚠️ 关联的源节点已丢失或被移除
            </div>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onRemove(node.id);
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              移除此节点
            </div>
          </div>
        ) : isGenerating ? (
          <div className="pg-flow-preview-empty">
            <LoadingOutlined style={{ fontSize: 22, color: '#1677ff' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>正在生成预览…</span>
          </div>
        ) : displayNode.status === 'error' ? (
          <div className="pg-flow-preview-empty">
            <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 500 }}>生成失败</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' }}>
              {displayNode.resultData?.message || '未知错误'}
            </span>
          </div>
        ) : activeItem ? (
          <div className="pg-flow-preview-media">
            <PreviewMediaView item={activeItem} />
          </div>
        ) : (
          <div className="pg-flow-preview-empty">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.8 }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', padding: '0 12px' }}>
              {sourceNode?.taskData?.node_type === 'volc_enhance'
                ? '⚠️ 等待主节点运行增强'
                : '暂无生成文件或 URL 无效'}
            </span>
          </div>
        )}
      </div>

      {items.length > 1 && (
        <div
          className="pg-flow-asset-switcher"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pg-flow-asset-switcher-row">
            <button
              type="button"
              className="pg-flow-asset-switcher-nav"
              aria-label="上一个"
              disabled={activeIndex <= 0}
              onClick={(e) => {
                e.stopPropagation();
                setActiveItem(activeIndex - 1);
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="pg-flow-asset-switcher-thumbs">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className={`pg-flow-asset-switcher-thumb${idx === activeIndex ? ' is-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveItem(idx);
                  }}
                >
                  {item.kind === 'video' ? (
                    <video src={item.url} muted playsInline preload="metadata" />
                  ) : item.kind === 'image' ? (
                    <img src={item.url} alt="" draggable={false} />
                  ) : (
                    <span className="pg-flow-asset-switcher-thumb-fallback">
                      {item.kind === 'audio' ? '♪' : '•'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pg-flow-asset-switcher-nav"
              aria-label="下一个"
              disabled={activeIndex >= items.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setActiveItem(activeIndex + 1);
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <div className="pg-flow-asset-switcher-meta">
            {activeIndex + 1} of {items.length}
          </div>
        </div>
      )}
    </div>
  );
};

PreviewNode.displayName = 'PreviewNode';
export default React.memo(PreviewNode);
