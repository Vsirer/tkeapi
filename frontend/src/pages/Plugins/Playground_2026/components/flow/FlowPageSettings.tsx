/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 工作流左侧栏「设置」：偏好 / 快捷键与反馈（原 ZoomIndicator 齿轮菜单）
 */
import React, { useEffect, useRef, useState } from 'react';
import { usePlayground } from '../../context/PlaygroundContext';
import { useThemeStore } from '../../../../../store/theme';
import { Modal, Table, Input, Tooltip } from '../../ui';
import toast from '../PlaygroundToast';
import { getSharedModalStyles } from '../../utils/modalStyles';
import { FlowIconSettings } from './flowIcons';

const FileTextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
);
const HelpCircleIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
);
const CheckIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);
const GiftIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4.8 0 0 1 12 8a4.8 4.8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5Z"/></svg>
);
const MessageSquareIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);

const isMac = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }
  return false;
};
const getModKey = (): string => (isMac() ? '⌘' : 'Ctrl');
const getShiftKey = (): string => (isMac() ? '⇧' : 'Shift');

const FlowPageSettings: React.FC = () => {
  const {
    autoDisplayAssetDetails,
    setAutoDisplayAssetDetails,
    autoDisplayPreviewDetails,
    setAutoDisplayPreviewDetails,
  } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const bg = _isLight ? 'rgba(255,255,255,0.95)' : 'rgba(20,20,22,0.96)';
  const border = _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)';
  const shadow = _isLight
    ? '0 10px 40px -10px rgba(0,0,0,0.12)'
    : '0 15px 50px -12px rgba(0,0,0,0.55)';
  const textColor = _isLight ? '#09090b' : '#f4f4f5';
  const textMuted = _isLight ? '#71717a' : '#a1a1aa';
  const hoverBg = _isLight ? '#f4f4f5' : '#27272a';
  const dividerBg = _isLight ? '#e4e4e7' : '#27272a';
  const modKey = getModKey();
  const shiftKey = getShiftKey();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="pg-flow-page-settings" style={{ position: 'relative' }}>
      <Tooltip title="设置" placement="right" overlayStyle={{ zIndex: 5200 }}>
        <button
          type="button"
          className={`pg-flow-rail-icon-btn${open ? ' is-active' : ''}`}
          aria-label="页面设置"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <FlowIconSettings size={18} />
        </button>
      </Tooltip>

      {open && (
        <div
          className="pg-flow-page-settings-menu"
          role="menu"
          style={{
            position: 'absolute',
            left: 'calc(100% + 10px)',
            bottom: 0,
            minWidth: 220,
            background: bg,
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            borderRadius: 16,
            border,
            boxShadow: shadow,
            padding: 8,
            zIndex: 3300,
            display: 'flex',
            flexDirection: 'column',
            animation: 'pg-flow-settings-in 0.15s ease-out',
          }}
        >
          <div
            onClick={() => {
              setIsShortcutsOpen(true);
              setOpen(false);
            }}
            className="pg-settings-menu-item"
          >
            <span>快捷键</span>
            <HelpCircleIcon />
          </div>
          <div
            onClick={() => {
              window.open('/legal/privacy', '_blank');
              setOpen(false);
            }}
            className="pg-settings-menu-item"
          >
            <span>隐私权声明</span>
          </div>

          <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

          <div
            onClick={() => setAutoDisplayAssetDetails((prev) => !prev)}
            className="pg-settings-menu-item"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextIcon />
              <span>素材属性自动显示</span>
            </div>
            {autoDisplayAssetDetails && <CheckIcon />}
          </div>
          <div
            onClick={() => setAutoDisplayPreviewDetails((prev) => !prev)}
            className="pg-settings-menu-item"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextIcon />
              <span>预览属性自动显示</span>
            </div>
            {autoDisplayPreviewDetails && <CheckIcon />}
          </div>

          <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

          <div
            onClick={() => {
              setIsWhatsNewOpen(true);
              setOpen(false);
            }}
            className="pg-settings-menu-item"
          >
            <span>新变化</span>
            <GiftIcon />
          </div>
          <div
            onClick={() => {
              setIsFeedbackOpen(true);
              setOpen(false);
            }}
            className="pg-settings-menu-item"
          >
            <span>发送反馈</span>
            <MessageSquareIcon />
          </div>

          <div style={{ height: 1, background: dividerBg, margin: '2px 0' }} />

          <div
            style={{
              padding: '6px 8px',
              fontSize: 11,
              color: textMuted,
              textAlign: 'left',
              lineHeight: '14px',
              userSelect: 'none',
            }}
          >
            可能会出错，请检查其输出结果。
          </div>
        </div>
      )}

      <Modal
        title="快捷键"
        open={isShortcutsOpen}
        onCancel={() => setIsShortcutsOpen(false)}
        footer={null}
        width={420}
        {...getSharedModalStyles(_isLight)}
      >
        <Table
          dataSource={[
            { key: 'undo', action: '撤销', shortcut: `${modKey} Z` },
            { key: 'redo', action: '重做', shortcut: `${modKey} Shift Z / ${modKey} Y` },
            { key: '1', action: '放大', shortcut: `${modKey} +` },
            { key: '2', action: '缩小', shortcut: `${modKey} -` },
            { key: '3', action: '缩放到 100%', shortcut: `${shiftKey} 0` },
            { key: '4', action: '缩放适应画布', shortcut: `${shiftKey} 1` },
            { key: '5', action: '缩放到选区', shortcut: `${shiftKey} 2` },
            { key: '6', action: '平移画布', shortcut: 'Space + 鼠标拖拽 或 鼠标中键拖拽' },
            { key: 'multiselect', action: '多选节点', shortcut: `${modKey} + 鼠标点击` },
            { key: 'delete', action: '删除选中节点', shortcut: 'Delete / Backspace' },
          ]}
          columns={[
            { title: '功能', dataIndex: 'action', key: 'action' },
            {
              title: '快捷键',
              dataIndex: 'shortcut',
              key: 'shortcut',
              render: (text: string) => (
                <code
                  style={{
                    background: _isLight ? '#f4f4f5' : '#27272a',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 12,
                    color: textColor,
                  }}
                >
                  {text}
                </code>
              ),
            },
          ]}
          pagination={false}
          size="small"
        />
      </Modal>

      <Modal
        title="新变化"
        open={isWhatsNewOpen}
        onCancel={() => setIsWhatsNewOpen(false)}
        footer={null}
        width={460}
        {...getSharedModalStyles(_isLight)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h4
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: textColor,
                margin: '0 0 4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              火山画质增强功能上线
            </h4>
            <p style={{ fontSize: 13, color: textMuted, margin: 0, paddingLeft: 14 }}>
              创作中心2026正式上线火山画质增强节点，可大幅提升视频素材的分辨率、帧率及画质细节。
            </p>
          </div>
          <div>
            <h4
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: textColor,
                margin: '0 0 4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              连接线智能重新绑定
            </h4>
            <p style={{ fontSize: 13, color: textMuted, margin: 0, paddingLeft: 14 }}>
              当节点断开与其父层级节点的连接时，你现在可以直接拖拽连接线重新将其绑定到新的父节点上，操作更为人性化。
            </p>
          </div>
          <div>
            <h4
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: textColor,
                margin: '0 0 4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              全新设计的偏好设置
            </h4>
            <p style={{ fontSize: 13, color: textMuted, margin: 0, paddingLeft: 14 }}>
              采用精致的 Shadcn UI 风格重构了设置菜单，能够更直观地选择和切换主题风格与页面模式。
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        title="发送反馈"
        open={isFeedbackOpen}
        onCancel={() => {
          setIsFeedbackOpen(false);
          setFeedbackText('');
        }}
        onOk={async () => {
          if (!feedbackText.trim()) {
            toast.warning('请输入您的反馈内容');
            return;
          }
          setSubmittingFeedback(true);
          await new Promise((resolve) => setTimeout(resolve, 800));
          setSubmittingFeedback(false);
          toast.success('反馈提交成功！非常感谢您的支持。');
          setIsFeedbackOpen(false);
          setFeedbackText('');
        }}
        confirmLoading={submittingFeedback}
        okText="提交"
        cancelText="取消"
        {...getSharedModalStyles(_isLight)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, color: textMuted }}>
            欢迎在此输入您的反馈或遇到的问题，我们将认真对待每一条建议：
          </div>
          <Input.TextArea
            rows={4}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="请输入您的反馈..."
            maxLength={300}
          />
        </div>
      </Modal>

      <style>{`
        @keyframes pg-flow-settings-in {
          from { opacity: 0; transform: translateX(-6px) scale(0.98); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        .pg-flow-page-settings .pg-settings-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          border-radius: 8px;
          cursor: pointer;
          color: ${textColor};
          font-size: 13px;
          font-weight: 400;
          line-height: 18px;
          transition: background 0.12s ease;
          user-select: none;
          background: transparent;
        }
        .pg-flow-page-settings .pg-settings-menu-item:hover {
          background: ${hoverBg};
        }
      `}</style>
    </div>
  );
};

export default FlowPageSettings;
