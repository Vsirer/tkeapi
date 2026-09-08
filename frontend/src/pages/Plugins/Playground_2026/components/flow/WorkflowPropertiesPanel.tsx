/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流选中节点属性面板（对齐 Imagine Properties）
 * - 图片/视频：选中即开，模型与参数
 * - 预览 / 素材：操作栏「属性信息」打开，展示媒体元数据
 * - 提示词：操作栏打开，展示基础字段
 */
import React, { useMemo, useRef, useState } from 'react';
import { useCanvas, usePlayground } from '../../context/PlaygroundContext';
import ParamControl from '../ParamControl';
import { getDisplayParams } from '../../hooks/usePlaygroundImageModels';
import { DownOutlined, CloseOutlined } from '../../ui';
import { FlowIconImage, FlowIconVideo, FlowIconSearch, FlowIconAssets, FlowIconDirector, FlowIconText } from './flowIcons';
import FlowModelPickerPop from './FlowModelPickerPop';
import ModelLogoIcon from '../ModelLogoIcon';
import { resolveModelLogoSrc } from '../../utils/modelLogo';
import type { FlowModelKind } from '../../utils/flowDefaultModel';
import { getNodeDisplayTitle } from '../nodes/shared/NodeMoreMenu';
import {
  formatFileSizeBytes,
  listSourceMediaItems,
  resolvePreviewMediaInfo,
  usePreviewMediaMeta,
} from '../../utils/previewMedia';
import { DIRECTOR_OPEN_EVENT, listDirectorFiles } from '../director_stage/directorScene';

const mediaTypeLabel = (t: string) =>
  t === 'video' ? '视频' : t === 'audio' ? '音频' : t === 'image' ? '图片' : t || '未知';

const ReadonlyRows: React.FC<{ rows: { label: string; value: string }[] }> = ({ rows }) => (
  <div className="pg-flow-props-scroll">
    {rows.map((row) => (
      <div key={row.label} className="pg-flow-props-field">
        <label className="pg-flow-props-label">{row.label}</label>
        <div
          className={`pg-flow-props-readonly${row.label === '资源地址' ? ' is-mono' : ''}`}
          title={row.value}
        >
          {row.value}
        </div>
      </div>
    ))}
  </div>
);

const PreviewPropertiesBody: React.FC<{
  selectedNode: NonNullable<ReturnType<typeof useCanvas>['nodes'][number]>;
  nodes: ReturnType<typeof useCanvas>['nodes'];
}> = ({ selectedNode, nodes }) => {
  const info = useMemo(
    () => resolvePreviewMediaInfo(selectedNode, selectedNode, nodes),
    [selectedNode, nodes],
  );
  const meta = usePreviewMediaMeta(
    info.finalUrl,
    info.mediaType,
    info.isParentLost || !info.finalUrl,
    info.activeFileSizeBytes,
  );

  const sizeValue =
    meta?.fileSize && meta.fileSize !== '未知'
      ? meta.fileSize
      : info.activeFileSizeBytes
        ? formatFileSizeBytes(info.activeFileSizeBytes)
        : meta?.fileSize || '未知';

  const rows: { label: string; value: string }[] = [
    { label: '连接状态', value: info.isParentLost ? '已断开' : '已连接' },
    { label: '媒体类型', value: mediaTypeLabel(info.mediaType) },
    {
      label: '生成状态',
      value: info.isGenerating
        ? '生成中'
        : selectedNode.status === 'error'
          ? '失败'
          : info.finalUrl
            ? '就绪'
            : '无内容',
    },
  ];

  if (info.items.length > 1) {
    rows.push({ label: '当前文件', value: `${info.activeIndex + 1} / ${info.items.length}` });
  }

  if (info.finalUrl) {
    rows.push(
      { label: '格式', value: meta?.format || '未知' },
      { label: '大小', value: sizeValue },
    );
    if (info.mediaType === 'image' || info.mediaType === 'video') {
      rows.push({ label: '分辨率', value: meta?.resolution || '未知' });
    }
    if (info.mediaType === 'video' || info.mediaType === 'audio') {
      rows.push({ label: '时长', value: meta?.duration || '未知' });
      rows.push({ label: '码率', value: meta?.bitrate || '未知' });
    }
    rows.push({ label: '资源地址', value: info.finalUrl });
  }

  return (
    <>
      <ReadonlyRows rows={rows} />
      {!info.finalUrl && !info.isParentLost && (
        <div className="pg-flow-props-empty">暂无媒体信息</div>
      )}
      {info.isParentLost && (
        <div className="pg-flow-props-empty">源节点已丢失或被移除</div>
      )}
    </>
  );
};

const AssetPropertiesBody: React.FC<{
  selectedNode: NonNullable<ReturnType<typeof useCanvas>['nodes'][number]>;
}> = ({ selectedNode }) => {
  const items = useMemo(() => listSourceMediaItems(selectedNode), [selectedNode]);
  const activeId =
    (typeof selectedNode.taskData?.active_file_id === 'string' &&
      selectedNode.taskData.active_file_id) ||
    '';
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.id === activeId),
  );
  const active = items[activeIndex] || items[0] || null;
  const mediaType = active?.kind === 'document' ? 'text' : active?.kind || 'image';
  const meta = usePreviewMediaMeta(
    active?.url || '',
    mediaType,
    !active?.url,
    active?.fileSizeBytes,
  );

  const sizeValue =
    meta?.fileSize && meta.fileSize !== '未知'
      ? meta.fileSize
      : active?.fileSizeBytes
        ? formatFileSizeBytes(active.fileSizeBytes)
        : meta?.fileSize || '未知';

  const rows: { label: string; value: string }[] = [
    { label: '媒体类型', value: mediaTypeLabel(mediaType) },
    { label: '文件数', value: String(items.length || 0) },
  ];
  if (items.length > 1 && active) {
    rows.push({ label: '当前文件', value: `${activeIndex + 1} / ${items.length}` });
  }
  if (selectedNode.taskData?.file_name) {
    rows.push({ label: '文件名', value: String(selectedNode.taskData.file_name) });
  }
  if (active?.url) {
    rows.push(
      { label: '格式', value: meta?.format || '未知' },
      { label: '大小', value: sizeValue },
    );
    if (mediaType === 'image' || mediaType === 'video') {
      rows.push({ label: '分辨率', value: meta?.resolution || '未知' });
    }
    if (mediaType === 'video' || mediaType === 'audio') {
      rows.push({ label: '时长', value: meta?.duration || '未知' });
      rows.push({ label: '码率', value: meta?.bitrate || '未知' });
    }
    rows.push({ label: '资源地址', value: active.url });
  }

  return (
    <>
      <ReadonlyRows rows={rows} />
      {!active?.url && <div className="pg-flow-props-empty">暂无媒体信息</div>}
    </>
  );
};

const PromptPropertiesBody: React.FC<{
  selectedNode: NonNullable<ReturnType<typeof useCanvas>['nodes'][number]>;
}> = ({ selectedNode }) => {
  const prompt =
    (typeof selectedNode.taskData?.prompt === 'string' && selectedNode.taskData.prompt) ||
    (typeof selectedNode.resultData?.content === 'string' && selectedNode.resultData.content) ||
    '';
  const rows = [
    { label: '节点类型', value: '提示词' },
    { label: '标题', value: getNodeDisplayTitle(selectedNode, '提示词') },
    { label: '字数', value: String(prompt.length) },
    { label: '内容', value: prompt || '（空）' },
  ];
  return <ReadonlyRows rows={rows} />;
};

const DirectorPropertiesBody: React.FC<{
  selectedNode: NonNullable<ReturnType<typeof useCanvas>['nodes'][number]>;
}> = ({ selectedNode }) => {
  const count = listDirectorFiles(selectedNode.taskData as Record<string, unknown> | undefined).length;
  return (
    <div className="pg-flow-props-scroll">
      <div className="pg-flow-props-field">
        <label className="pg-flow-props-label">构图</label>
        <div className="pg-flow-props-readonly">
          {count > 0 ? `已发送 ${count} 张` : '未发送'}
        </div>
      </div>
      <div className="pg-flow-props-field">
        <button
          type="button"
          className="pg-flow-asset-library-btn"
          style={{ width: '100%' }}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(DIRECTOR_OPEN_EVENT, { detail: { nodeId: selectedNode.id } }),
            );
          }}
        >
          打开导演台
        </button>
      </div>
    </div>
  );
};

const WorkflowPropertiesPanel: React.FC = () => {
  const { selectedNodeId, nodes } = useCanvas();
  const {
    currentModel,
    models,
    isSettingsWidgetVisible,
    setIsSettingsWidgetVisible,
    handleSelectModel,
    setActiveSelectorNodeId,
  } = usePlayground();

  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
    [nodes, selectedNodeId],
  );

  const nodeType = selectedNode?.taskData?.node_type;
  const isGenerator = nodeType === 'ai_image' || nodeType === 'ai_video';
  const isPreview = nodeType === 'preview';
  const isAsset = nodeType === 'asset';
  const isDirector = nodeType === 'director';
  const isPrompt = nodeType === 'prompt';
  if (
    !selectedNode ||
    (!isGenerator && !isPreview && !isAsset && !isDirector && !isPrompt) ||
    !isSettingsWidgetVisible
  ) {
    return null;
  }

  if (isPreview) {
    const title = getNodeDisplayTitle(
      selectedNode,
      `预览 ${selectedNode.id.split('-').pop()?.slice(-3) || '1'}`,
    );
    return (
      <aside className="pg-flow-props" aria-label="属性">
        <header className="pg-flow-props-head">
          <div className="pg-flow-props-head-title">属性</div>
          <button
            type="button"
            className="pg-flow-props-close"
            onClick={() => setIsSettingsWidgetVisible(false)}
            aria-label="关闭"
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </button>
        </header>

        <div className="pg-flow-props-node">
          <span className="pg-flow-props-node-icon">
            <FlowIconSearch size={16} />
          </span>
          <h3 className="pg-flow-props-node-name">{title}</h3>
        </div>

        <PreviewPropertiesBody selectedNode={selectedNode} nodes={nodes} />
      </aside>
    );
  }

  if (isAsset) {
    const title = getNodeDisplayTitle(
      selectedNode,
      `素材 ${selectedNode.id.split('-').pop()?.slice(-3) || '1'}`,
    );
    return (
      <aside className="pg-flow-props" aria-label="属性">
        <header className="pg-flow-props-head">
          <div className="pg-flow-props-head-title">属性</div>
          <button
            type="button"
            className="pg-flow-props-close"
            onClick={() => setIsSettingsWidgetVisible(false)}
            aria-label="关闭"
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </button>
        </header>
        <div className="pg-flow-props-node">
          <span className="pg-flow-props-node-icon">
            <FlowIconAssets size={16} />
          </span>
          <h3 className="pg-flow-props-node-name">{title}</h3>
        </div>
        <AssetPropertiesBody selectedNode={selectedNode} />
      </aside>
    );
  }

  if (isDirector) {
    const title = getNodeDisplayTitle(
      selectedNode,
      `导演台 ${selectedNode.id.split('-').pop()?.slice(-3) || '1'}`,
    );
    return (
      <aside className="pg-flow-props" aria-label="属性">
        <header className="pg-flow-props-head">
          <div className="pg-flow-props-head-title">属性</div>
          <button
            type="button"
            className="pg-flow-props-close"
            onClick={() => setIsSettingsWidgetVisible(false)}
            aria-label="关闭"
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </button>
        </header>
        <div className="pg-flow-props-node">
          <span className="pg-flow-props-node-icon">
            <FlowIconDirector size={16} />
          </span>
          <h3 className="pg-flow-props-node-name">{title}</h3>
        </div>
        <DirectorPropertiesBody selectedNode={selectedNode} />
      </aside>
    );
  }

  if (isPrompt) {
    const title = getNodeDisplayTitle(selectedNode, '提示词');
    return (
      <aside className="pg-flow-props" aria-label="属性">
        <header className="pg-flow-props-head">
          <div className="pg-flow-props-head-title">属性</div>
          <button
            type="button"
            className="pg-flow-props-close"
            onClick={() => setIsSettingsWidgetVisible(false)}
            aria-label="关闭"
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </button>
        </header>
        <div className="pg-flow-props-node">
          <span className="pg-flow-props-node-icon">
            <FlowIconText size={16} />
          </span>
          <h3 className="pg-flow-props-node-name">{title}</h3>
        </div>
        <PromptPropertiesBody selectedNode={selectedNode} />
      </aside>
    );
  }

  const kind: FlowModelKind = nodeType === 'ai_video' ? 'video' : 'image';
  const displayParams = getDisplayParams(currentModel);
  const title =
    selectedNode.taskData?.label ||
    selectedNode.taskData?.node_title ||
    selectedNode.taskData?.modelName ||
    (nodeType === 'ai_video' ? '视频节点' : '图片节点');
  const logoSrc = resolveModelLogoSrc(currentModel?.logo);
  const modelLabel = currentModel?.name || selectedNode.taskData?.modelName || '选择模型';

  return (
    <aside className="pg-flow-props" aria-label="属性">
      <header className="pg-flow-props-head">
        <div className="pg-flow-props-head-title">属性</div>
        <button
          type="button"
          className="pg-flow-props-close"
          onClick={() => setIsSettingsWidgetVisible(false)}
          aria-label="关闭"
        >
          <CloseOutlined style={{ fontSize: 14 }} />
        </button>
      </header>

      <div className="pg-flow-props-node">
        <span className="pg-flow-props-node-icon">
          {nodeType === 'ai_video' ? <FlowIconVideo size={16} /> : <FlowIconImage size={16} />}
        </span>
        <h3 className="pg-flow-props-node-name">{title}</h3>
      </div>

      <div className="pg-flow-props-scroll">
        <div className="pg-flow-props-field">
          <label className="pg-flow-props-label">模型</label>
          <button
            ref={modelBtnRef}
            type="button"
            className={`pg-flow-props-select${pickerOpen ? ' is-open' : ''}`}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <span className="pg-flow-props-select-left">
              <ModelLogoIcon
                logo={currentModel?.logo}
                fallbackLetter={modelLabel}
                className="pg-flow-props-model-logo"
                size={18}
              />
              <span className="pg-flow-props-select-text">{modelLabel}</span>
            </span>
            <DownOutlined style={{ fontSize: 12, opacity: 0.7 }} />
          </button>
        </div>

        {currentModel && displayParams.length > 0 && (
          <div className="pg-flow-props-params">
            {displayParams.map((param) => (
              <ParamControl
                key={`${currentModel.mid}-${param.key}`}
                param={param}
                disabled={false}
                variant="flow"
              />
            ))}
          </div>
        )}

        {currentModel && displayParams.length === 0 && (
          <div className="pg-flow-props-empty">该方案暂无可配置参数</div>
        )}

        {!currentModel && (
          <div className="pg-flow-props-empty">暂无可用模型</div>
        )}
      </div>

      <FlowModelPickerPop
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        anchorRef={modelBtnRef}
        models={models || []}
        selectedMid={currentModel?.mid || selectedNode.taskData?.modelMid}
        kind={kind}
        onSelect={(m) => {
          setActiveSelectorNodeId(selectedNode.id);
          handleSelectModel(m.mid);
        }}
      />
    </aside>
  );
};

export default WorkflowPropertiesPanel;
