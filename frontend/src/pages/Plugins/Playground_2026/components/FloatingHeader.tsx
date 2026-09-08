/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 左上角悬浮标头
 * 显示返回按钮（回到项目列表）和创作日志按钮
 */
import React from 'react';
import { Button, Tooltip, Dropdown, Modal, Input, Popover } from '../ui';
import type { MenuProps } from '../ui';
import { 
  ArrowLeftOutlined, MenuOutlined, PlusOutlined, 
  FolderOpenOutlined, CopyOutlined, EditOutlined, HistoryOutlined,
  SearchOutlined, DashboardOutlined
} from '../ui';
import { MessageCircle, Cloud, CloudOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayground } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../../store/theme';
import useAuthStore from '../../../../store/auth';
import request from '../../../../utils/request';
import toast from './PlaygroundToast';
import { getSharedModalStyles } from '../utils/modalStyles';
import { formatApiDateTime, parseApiTimeAsUtc } from '../../../../utils/timedisplay';
import { useDebouncedSearchKeyword } from '../hooks/useDebouncedSearchKeyword';
import { openWorkflowInNewTab } from '../utils/openWorkflowTab';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const getFullUrl = (url: string) => {
  if (!url) return '';
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

const NormalIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
);
const NodeIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
);
const CheckIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);
const AgentIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>
);

const FloatingHeader: React.FC<{ flowEditor?: boolean }> = React.memo(({ flowEditor = false }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(['playground_2026', 'translation']);
  const { 
    saveCanvasState, isGenLogVisible, setIsGenLogVisible, 
    projects, currentProjectId, canvasSaveStatus, createProject, duplicateProject, loadProjects,
    pageMode, setPageMode, advancedNodesConfig,
    entityKind, entityApiBase, entityListPath,
  } = usePlayground();
  const { themeMode } = useThemeStore();
  const { user } = useAuthStore();
  const _isLight = themeMode === 'light';

  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);
  const [isRenameModalOpen, setIsRenameModalOpen] = React.useState(false);
  const [isInlineRenaming, setIsInlineRenaming] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const inlineRenameInputRef = React.useRef<HTMLInputElement>(null);
  const skipInlineBlurCommit = React.useRef(false);
  /** 进入内联改名后刚全选；再点一下进入插入态 */
  const justSelectedInlineRef = React.useRef(false);

  React.useEffect(() => {
    loadProjects();
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadProjects]);

  const handleBack = async () => {
    await saveCanvasState();
    navigate(entityListPath);
  };

  const handleBackConsole = async () => {
    await saveCanvasState();
    navigate('/dashboard');
  };

  const handleNewProject = async () => {
    try {
      await saveCanvasState();
      const newId = await createProject();
      if (newId) {
        toast.success(
          entityKind === 'workflow'
            ? t('playground_2026:workflow_create_success', '工作流创建成功')
            : t('new_success_toast', '新项目创建成功'),
        );
        openWorkflowInNewTab(`${entityListPath}/${newId}`);
      } else {
        toast.error(
          entityKind === 'workflow'
            ? t('playground_2026:workflow_create_failed', '创建工作流失败')
            : t('new_failed_toast', '创建项目失败'),
        );
      }
    } catch (e) {
      toast.error(
        entityKind === 'workflow'
          ? t('playground_2026:workflow_create_failed', '创建工作流失败')
          : t('new_error_toast', '创建项目出错'),
      );
    }
  };

  const handleSwitchProject = async (projectId: number) => {
    try {
      await saveCanvasState();
      openWorkflowInNewTab(`${entityListPath}/${projectId}`);
    } catch (e) {
      toast.error(t('switch_failed_toast', '切换项目失败'));
    }
  };

  const currentProject = projects.find(p => p.id === currentProjectId);
  const projectName = currentProject?.name || t('untitled_project', '未命名项目');

  const handleDuplicateProject = async () => {
    if (!currentProjectId) return;
    try {
      await saveCanvasState();
      const suffix = t('duplicate_suffix', ' (副本)');
      const newId = await duplicateProject(currentProjectId, `${projectName}${suffix}`);
      if (newId) {
        toast.success(t('duplicate_success_toast', '复制项目成功'));
        openWorkflowInNewTab(`${entityListPath}/${newId}`);
      } else {
        toast.error(t('duplicate_failed_toast', '复制项目失败'));
      }
    } catch (e) {
      toast.error(t('duplicate_error_toast', '复制项目出错'));
    }
  };

  const handleRenameProject = () => {
    setNewProjectName(projectName);
    if (flowEditor) {
      setIsInlineRenaming(true);
      return;
    }
    setIsRenameModalOpen(true);
  };

  const executeRename = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      toast.error(t('rename_empty_toast', '项目名称不能为空'));
      return;
    }
    if (trimmed === projectName) {
      setIsRenameModalOpen(false);
      setIsInlineRenaming(false);
      return;
    }
    try {
      await request.put(
        `${entityApiBase}/${currentProjectId}`,
        { name: trimmed },
        { skipErrorHandler: true } as any
      );
      await loadProjects();
      toast.success(t('rename_success_toast', '项目重命名成功'));
      setIsRenameModalOpen(false);
      setIsInlineRenaming(false);
    } catch (e: any) {
      const errorMsg = e.response?.data?.error?.message || t('rename_failed_toast', '项目重命名失败');
      toast.error(errorMsg);
    }
  };

  const cancelInlineRename = () => {
    skipInlineBlurCommit.current = true;
    setIsInlineRenaming(false);
    setNewProjectName(projectName);
  };

  React.useEffect(() => {
    if (!isInlineRenaming) {
      justSelectedInlineRef.current = false;
      return undefined;
    }
    const t = window.setTimeout(() => {
      const el = inlineRenameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
      justSelectedInlineRef.current = true;
    }, 0);
    return () => window.clearTimeout(t);
  }, [isInlineRenaming]);

  const handleInlineRenameMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    if (!justSelectedInlineRef.current) return;
    justSelectedInlineRef.current = false;
    const clientX = e.clientX;
    window.setTimeout(() => {
      if (inlineRenameInputRef.current !== el) return;
      const allSelected =
        el.selectionStart === 0 &&
        el.selectionEnd === el.value.length &&
        el.value.length > 0;
      if (!allSelected) return;
      // 粗略落到点击附近：优先用浏览器已有的折叠结果，否则置中后段
      const approx = Math.min(
        el.value.length,
        Math.max(0, Math.round(((clientX - el.getBoundingClientRect().left) / Math.max(el.clientWidth, 1)) * el.value.length)),
      );
      el.setSelectionRange(approx, approx);
    }, 0);
  };

  const renderSaveStatus = () => {
    const iconSize = isMobile ? 15 : 18;
    switch (canvasSaveStatus) {
      case 'saving':
        return (
          <Tooltip title={t('saving_auto', '正在自动保存...')}>
            <div style={{ display: 'flex', alignItems: 'center', color: '#1677ff' }}>
              <Cloud size={iconSize} style={{ animation: 'header-pulse 1.2s ease-in-out infinite' }} />
              <style>{`
                @keyframes header-pulse {
                  0%, 100% { opacity: 0.4; }
                  50% { opacity: 1; }
                }
              `}</style>
            </div>
          </Tooltip>
        );
      case 'error':
        return (
          <Tooltip title={t('save_failed', '保存失败，请检查网络')}>
            <CloudOff size={iconSize} style={{ color: '#ff4d4f' }} />
          </Tooltip>
        );
      case 'saved':
      default:
        return (
          <Tooltip title={t('all_saved', '所有更改已保存')}>
            <Cloud size={iconSize} style={{ color: _isLight ? '#71717a' : '#a1a1aa' }} />
          </Tooltip>
        );
    }
  };

  const menuItems = React.useMemo(() => {
    const isWorkflow = entityKind === 'workflow';
    const items: MenuProps['items'] = [
      {
        key: 'back',
        label: isWorkflow
          ? t('playground_2026:back_to_workflows', '返回创作中心')
          : t('back_to_list', '返回创作中心2026'),
        icon: <ArrowLeftOutlined style={{ fontSize: 14 }} />,
      },
      {
        key: 'back_console',
        label: t('back_to_console', '返回控制台'),
        icon: <DashboardOutlined style={{ fontSize: 14 }} />,
      },
      { type: 'divider' },
    ];

    // 工作流：去掉「创建工作流 / 打开项目 / 正常模式(及模式切换)」
    if (!isWorkflow) {
      items.push(
        {
          key: 'new',
          label: t('new_project', '新建项目'),
          icon: <PlusOutlined style={{ fontSize: 14 }} />,
        },
        {
          key: 'open',
          keepOpen: true,
          label: (
            <Popover
              content={
                <ProjectListPopover
                  projects={projects}
                  currentProjectId={currentProjectId}
                  _isLight={_isLight}
                  user={user}
                  handleNewProject={handleNewProject}
                  handleSwitchProject={handleSwitchProject}
                  t={t}
                />
              }
              placement="rightTop"
              trigger={isMobile ? 'click' : 'hover'}
              arrow={false}
              align={{ offset: [8, -4] }}
              overlayStyle={{ padding: 0 }}
              overlayInnerStyle={{
                padding: 0,
                background: 'transparent',
                boxShadow: 'none',
                border: 'none',
              }}
              overlayClassName={`custom-project-popover ${_isLight ? 'light' : 'dark'}`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  gap: 8,
                }}
              >
                <span>
                  <FolderOpenOutlined style={{ marginRight: 8, fontSize: 14 }} />
                  {t('open_project', '打开项目')}
                </span>
                <span style={{ fontSize: 12, color: _isLight ? '#999' : '#666' }}>&gt;</span>
              </div>
            </Popover>
          ),
        },
      );
    }

    items.push(
      {
        key: 'duplicate',
        label: isWorkflow
          ? t('playground_2026:duplicate_workflow', '复制工作流')
          : t('duplicate_project', '复制项目'),
        icon: <CopyOutlined style={{ fontSize: 14 }} />,
      },
      {
        key: 'rename',
        label: isWorkflow
          ? t('playground_2026:rename', '重命名')
          : t('rename_project', '重命名项目'),
        icon: <EditOutlined style={{ fontSize: 14 }} />,
      },
    );

    if (!isWorkflow) {
      items.push(
        { type: 'divider' },
        {
          key: 'mode-normal',
          label: (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: 12,
              }}
            >
              <span>正常模式</span>
              {pageMode === 'normal' && <CheckIcon />}
            </div>
          ),
          icon: <NormalIcon />,
        },
        {
          key: 'mode-node',
          label: (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: 12,
              }}
            >
              <span>节点模式</span>
              {pageMode === 'node' && <CheckIcon />}
            </div>
          ),
          icon: <NodeIcon />,
        },
      );
    }

    return items;
  }, [
    pageMode,
    projects,
    currentProjectId,
    _isLight,
    user,
    t,
    isMobile,
    entityKind,
  ]);

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'back') {
      handleBack();
    } else if (key === 'back_console') {
      handleBackConsole();
    } else if (key === 'new') {
      handleNewProject();
    } else if (key === 'duplicate') {
      handleDuplicateProject();
    } else if (key === 'rename') {
      handleRenameProject();
    } else if (key === 'mode-normal') {
      setPageMode('normal');
    } else if (key === 'mode-node') {
      setPageMode('node');
    }
  };

  if (flowEditor) {
    return (
      <>
        <div className="pg-flow-top-left" onWheel={(e) => e.stopPropagation()}>
          <div className="pg-flow-pill">
            {isInlineRenaming ? (
              <input
                ref={inlineRenameInputRef}
                className="pg-flow-pill-name-input"
                value={newProjectName}
                maxLength={50}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void executeRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelInlineRename();
                  }
                }}
                onBlur={() => {
                  if (skipInlineBlurCommit.current) {
                    skipInlineBlurCommit.current = false;
                    return;
                  }
                  void executeRename();
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={handleInlineRenameMouseDown}
              />
            ) : (
              <button
                type="button"
                className="pg-flow-pill-btn pg-flow-pill-name"
                title="点击重命名"
                onClick={handleRenameProject}
              >
                {projectName}
              </button>
            )}
            <div className="pg-flow-pill-divider" />
            <div className="pg-flow-pill-btn" style={{ pointerEvents: 'none' }}>
              {renderSaveStatus()}
            </div>
          </div>
        </div>

        <div className="pg-flow-top-right" onWheel={(e) => e.stopPropagation()}>
          <Tooltip title={t('creation_log', '创作日志')}>
            <button
              type="button"
              className="pg-flow-chip"
              onClick={() => setIsGenLogVisible(!isGenLogVisible)}
              style={{
                background: isGenLogVisible ? 'rgba(255,255,255,0.12)' : undefined,
              }}
            >
              <MessageCircle size={16} color="#fff" />
            </button>
          </Tooltip>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{
        position: 'absolute', top: isMobile ? 12 : 24, left: isMobile ? 12 : 24, zIndex: 2005,
        display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8,
        background: _isLight ? 'rgba(255,255,255,0.85)' : '#1e1f20', 
        padding: isMobile ? '4px 8px' : '6px 10px', 
        borderRadius: 32,
        border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746', 
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 6px rgba(0,0,0,0.3)'
      }} onWheel={(e) => e.stopPropagation()}>
        
        {/* 三条横线返回菜单 */}
        <Dropdown
          menu={{ items: menuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomLeft"
          overlayStyle={{ zIndex: 3000 }}
          overlayClassName={`shadcn-dropdown ${_isLight ? 'light' : 'dark'}`}
        >
          <Tooltip title={t('menu_file', '文件')}>
            <Button
              type="text" shape="circle" icon={<MenuOutlined style={{ fontSize: 16 }} />}
              style={{
                width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32,
                color: _isLight ? '#333' : '#E3E3E3',
                background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            />
          </Tooltip>
        </Dropdown>

        <Tooltip title={t('creation_log', '创作日志')}>
          <Button
            type="text" shape="circle"
            icon={<MessageCircle size={16} />}
            onClick={() => setIsGenLogVisible(!isGenLogVisible)}
            style={{
              width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, minWidth: isMobile ? 28 : 32,
              color: isGenLogVisible ? (_isLight ? '#fff' : '#1f2937') : (_isLight ? '#333' : '#E3E3E3'),
              background: isGenLogVisible ? (_isLight ? '#1f2937' : '#f3f4f6') : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          />
        </Tooltip>

        {/* 项目名称与保存状态区域 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 10,
          marginLeft: isMobile ? 6 : 8,
          marginRight: isMobile ? 4 : 8,
        }}>
          <span style={{
            fontSize: isMobile ? 13 : 15,
            fontWeight: 600,
            color: _isLight ? '#1f2937' : '#E3E3E3',
            maxWidth: isMobile ? 100 : 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {projectName}
          </span>
          <div style={{
            width: 1,
            height: isMobile ? 12 : 14,
            background: _isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'
          }} />
          {renderSaveStatus()}
        </div>
      </div>

      {/* 项目重命名 Modal */}
      <Modal
        title={t('rename_project', '重命名项目')}
        open={isRenameModalOpen}
        onOk={executeRename}
        onCancel={() => setIsRenameModalOpen(false)}
        okText={t('common.ok', '确定')}
        cancelText={t('common.cancel', '取消')}
        width={340}
        zIndex={3100}
        {...getSharedModalStyles(_isLight)}
      >
        <Input
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value.slice(0, 30))}
          maxLength={30}
          placeholder={t('rename_placeholder', '请输入新的项目名称')}
          style={{ marginTop: 12, marginBottom: 8 }}
          autoFocus
          onPressEnter={executeRename}
        />
      </Modal>
    </>
  );
});

FloatingHeader.displayName = 'FloatingHeader';
export default FloatingHeader;

interface ProjectListPopoverProps {
  projects: any[];
  currentProjectId: number | null;
  _isLight: boolean;
  user: any;
  handleNewProject: () => void;
  handleSwitchProject: (id: number) => void;
  t: any;
}

const ProjectListPopover: React.FC<ProjectListPopoverProps> = ({
  projects,
  currentProjectId,
  _isLight,
  user,
  handleNewProject,
  handleSwitchProject,
  t
}) => {
  const { searchKeyword: projectSearchVal, searchInputProps } = useDebouncedSearchKeyword();
  const filteredProjects = React.useMemo(() => {
    const kw = projectSearchVal.trim().toLowerCase();
    if (!kw) return projects;
    return projects.filter(p => p.name && p.name.toLowerCase().includes(kw));
  }, [projects, projectSearchVal]);

  const formatRelativeTime = (timeStr: string) => {
    try {
      const date = parseApiTimeAsUtc(timeStr);
      if (!date) return '未知时间';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return '刚刚';
      if (diffMin < 60) return `${diffMin} 分钟前`;
      if (diffHour < 24) return `${diffHour} 小时前`;
      if (diffDay === 1) return '昨天';
      if (diffDay < 30) return `${diffDay} 天前`;
      
      const months = Math.floor(diffDay / 30);
      if (months < 12) return `${months} 个月前`;
      
      return formatApiDateTime(timeStr, 'YYYY-MM-DD');
    } catch (e) {
      return '未知时间';
    }
  };

  const renderCover = (p: any) => {
    if (p.cover_url) {
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(p.cover_url);
      if (isVideo) {
        return (
          <video 
            src={getFullUrl(p.cover_url)} 
            style={{ width: 44, height: 44, borderRadius: 5, objectFit: 'cover' }} 
            muted 
            loop 
            playsInline 
          />
        );
      }
      return (
        <img 
          src={getFullUrl(p.cover_url)} 
          style={{ width: 44, height: 44, borderRadius: 5, objectFit: 'cover' }} 
          alt="" 
        />
      );
    }
    return (
      <div style={{ 
        width: 44, height: 44, borderRadius: 5, 
        background: _isLight ? '#f4f4f5' : '#27272a',
        display: 'flex', gap: 2, padding: 3,
        alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ flex: 1, height: '100%', background: _isLight ? '#e4e4e7' : '#3f3f46', borderRadius: 2 }} />
        <div style={{ flex: 1, height: '100%', background: _isLight ? '#d4d4d8' : '#52525b', borderRadius: 2 }} />
      </div>
    );
  };

  const ownerName = user?.nickname || user?.username || '';

  return (
    <div 
      style={{ 
        width: 320, 
        padding: 12, 
        background: _isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(20, 20, 22, 0.8)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        color: _isLight ? '#27272a' : '#e4e4e7',
        borderRadius: 20,
        boxShadow: _isLight 
          ? '0 10px 40px -10px rgba(0, 0, 0, 0.1)'
          : '0 15px 50px -12px rgba(0, 0, 0, 0.5)',
        border: _isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
      }}
      onClick={(e) => e.stopPropagation()} // 阻止事件冒泡防止关闭Dropdown
    >
      {/* 顶部搜索和新建 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Input
          placeholder="Search project..."
          prefix={<SearchOutlined style={{ color: '#8e8e93' }} />}
          allowClear
          {...searchInputProps}
          onKeyDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            height: 32,
            borderRadius: 6,
            background: _isLight ? '#f4f4f5' : 'rgba(255, 255, 255, 0.04)',
            border: _isLight ? '1px solid #e4e4e7' : '1px solid rgba(255, 255, 255, 0.08)',
            color: _isLight ? '#000' : '#fff'
          }}
        />
        <Tooltip title="新建项目">
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleNewProject();
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: _isLight ? '1px solid #e4e4e7' : '1px solid rgba(255, 255, 255, 0.08)',
              background: _isLight ? '#f4f4f5' : 'rgba(255, 255, 255, 0.04)',
              color: _isLight ? '#000' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          />
        </Tooltip>
      </div>

      {/* 项目列表 */}
      <div 
        className="pg-resource-widget-scroll"
        style={{ 
          maxHeight: 280, 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 6 
        }}
      >
        {filteredProjects.length > 0 ? (
          filteredProjects.map((p) => {
            const isCurrent = p.id === currentProjectId;
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (!isCurrent) {
                    handleSwitchProject(p.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 8,
                  borderRadius: 6,
                  cursor: isCurrent ? 'default' : 'pointer',
                  background: isCurrent 
                    ? (_isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)')
                    : 'transparent',
                  border: isCurrent 
                    ? (_isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.15)')
                    : '1px solid transparent',
                  transition: 'all 0.15s ease',
                  color: isCurrent 
                    ? (_isLight ? '#09090b' : '#ffffff')
                    : (_isLight ? '#27272a' : '#e4e4e7'),
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = _isLight ? '#f4f4f5' : 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.color = _isLight ? '#09090b' : '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = _isLight ? '#27272a' : '#e4e4e7';
                  }
                }}
              >
                {/* 缩略图 */}
                {renderCover(p)}
                
                {/* 项目文字 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span 
                    style={{ 
                      fontSize: 12, 
                      fontWeight: 600, 
                      color: _isLight ? '#1f2937' : '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {p.name || '未命名项目'}
                  </span>
                  <span style={{ fontSize: 10, color: '#8e8e93', marginTop: 2 }}>
                    {ownerName} - {formatRelativeTime(p.updated_at || p.created_at)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8e8e93', fontSize: 12 }}>
            无匹配项目
          </div>
        )}
      </div>
    </div>
  );
};
