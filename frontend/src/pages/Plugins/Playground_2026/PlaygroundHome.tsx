/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 体验中心 - 创作中心2026 首页壳（资源 / 图片 / 视频 / 工作流）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getAnnouncementLabel } from '../../../utils/announcement';
import {
  parseNotificationPreferences,
  shouldShowWebNotifications,
  maybeShowBrowserPush,
} from '../../../utils/notificationPrefs';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip, Popover, Button, App, Dropdown, Badge, Space, List, PlaygroundUIProvider } from './ui';
import {
  ExclamationCircleOutlined, ReloadOutlined,
  ScheduleOutlined, BellOutlined,
} from './ui';
import { useTranslation } from 'react-i18next';
import request from '../../../utils/request';
import { coalesceAsync, invalidateCoalesce } from '../../../utils/coalesceAsync';
import { fetchActivePlugins } from '../../../utils/activePlugins';
import { persistUserLanguagePreference, LANG_NAME_MAP } from '../../../utils/language';
import { useThemeStore } from '../../../store/theme';
import useAuthStore from '../../../store/auth';
import useSettingsStore from '../../../store/settings';
import UserAvatarMenu from '../../../components/UserAvatarMenu';
import CanvasParticles from './components/CanvasParticles';
import PlaygroundSidebar from './components/PlaygroundSidebar';
import SidebarToggleButton from './components/SidebarToggleButton';
import PlaygroundHomeMain from './components/PlaygroundHomeMain';
import PlaygroundHealthGate from './components/PlaygroundHealthGate';
import { SidebarCollapseProvider } from './components/sidebarCollapseContext';
import {
  listAlbums,
  type WorkAlbum,
} from './utils/albumsApi';
import { formatApiDateTime } from '../../../utils/timedisplay';
import './styles/imagineShell.css';
import './styles/imagineMobile.css';
import './components/WorksList.css';

const PlaygroundHome: React.FC = () => {
  const { themeMode, toggleTheme } = useThemeStore();
  const _isLight = themeMode === 'light';
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const siteName = settings?.site?.name || 'Tkeapi';
  const siteLogo = settings?.site?.logo || '';
  const agreement = settings?.agreement || null;
  const [storageStats, setStorageStats] = useState<any>(null);
  const path = location.pathname;
  const assetsAlbumMatch = path.match(/^\/playground-2026\/assets\/albums\/([^/]+)/);
  const activeTab:
    | 'assets-all'
    | 'assets-works'
    | 'assets-uploads'
    | 'assets-favorites'
    | 'assets-album'
    | 'images'
    | 'videos'
    | 'workflows' = path.startsWith('/playground-2026/videos')
    ? 'videos'
    : path.startsWith('/playground-2026/images')
      ? 'images'
      : path.startsWith('/playground-2026/workflows')
        ? 'workflows'
        : path.startsWith('/playground-2026/assets/uploads')
          ? 'assets-uploads'
          : path.startsWith('/playground-2026/assets/favorites')
            ? 'assets-favorites'
            : path.startsWith('/playground-2026/assets/works')
              ? 'assets-works'
              : assetsAlbumMatch
                ? 'assets-album'
                : path.startsWith('/playground-2026/assets')
                  ? 'assets-all'
                  : 'images';
  const activeAlbumId = assetsAlbumMatch?.[1] || '';
  const [albums, setAlbums] = useState<WorkAlbum[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // --- 对齐控制台顶部右上角功能 ---
  const { t, i18n } = useTranslation();
  const site = settings?.site;
  const enableMultilingual = site?.enable_multilingual !== false;
  const enableThemeToggle = site?.enable_theme_toggle !== false;
  const supportedLanguages = site?.supported_languages?.length ? site.supported_languages : ['zh', 'en'];

  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const prefs = parseNotificationPreferences(
        user?.notification_preferences,
        settings?.notification?.low_balance_threshold ?? 100.0,
      );
      if (!shouldShowWebNotifications(prefs, settings?.notification)) {
        setAnnouncements([]);
        setUnreadCount(0);
        return;
      }
      try {
        const response = await coalesceAsync('pg2026:announcements-public', () =>
          request.get('/announcements/public') as Promise<any>,
        );
        if (response.data) {
          setAnnouncements(response.data);
          setUnreadCount(response.data.length);
          if (response.data.length > 0) {
            const first = response.data[0];
            const seenKey = `notif_push_seen_${first.id}`;
            if (!sessionStorage.getItem(seenKey)) {
              sessionStorage.setItem(seenKey, '1');
              const title = getAnnouncementLabel(first.title || '') || (i18n.language === 'zh' ? '新通知' : 'New notification');
              const body = getAnnouncementLabel(first.content || '').replace(/<[^>]+>/g, '').slice(0, 120);
              maybeShowBrowserPush(title, body, prefs, settings?.notification);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };
    const fetchActivePluginsList = async () => {
      try {
        const response = await fetchActivePlugins();
        if (response.active_plugins) {
          setActivePlugins(response.active_plugins);
        }
      } catch (error) {
        console.error('Failed to fetch active plugins:', error);
      }
    };
    fetchAnnouncements();
    fetchActivePluginsList();
  }, [user?.notification_preferences, settings?.notification?.low_balance_threshold, i18n.language]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    persistUserLanguagePreference(lng);
  };

  const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en'];

  const langItems = supportedLanguages
    .filter(lng => implementedLangs.includes(lng))
    .map(lng => ({
      key: lng,
      label: LANG_NAME_MAP[lng] || lng,
      onClick: () => changeLanguage(lng),
    }));

  const isPluginVisibleForUser = (pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    if (plugin.allowed_levels === 'all') return true;
    const allowed = plugin.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  };



  const popoverBorderBottom = _isLight ? '1px solid #f0f0f0' : '1px solid rgba(255,255,255,0.08)';
  const popoverCardBg = _isLight ? '#f9fafb' : 'rgba(255, 255, 255, 0.04)';
  const popoverCardHoverBg = _isLight ? '#f3f4f6' : 'rgba(255, 255, 255, 0.08)';
  const popoverTitleColor = _isLight ? '#1f2937' : '#fff';
  const popoverTimeColor = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';
  const popoverContentColor = _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';
  const popoverEmptyIconColor = _isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)';
  const popoverEmptyTextColor = _isLight ? '#6b7280' : '#e5e5e5';
  const popoverEmptySubtextColor = _isLight ? '#9ca3af' : 'rgba(255,255,255,0.45)';

  const announcementContent = (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: popoverBorderBottom
      }}>
        <span style={{ color: popoverTitleColor, fontSize: 16, fontWeight: 500 }}>{t('header.notifications', '通知')}</span>
      </div>

      <div style={{
        maxHeight: 480, overflowY: 'auto', padding: announcements.length > 0 ? '16px' : '60px 20px',
        display: 'flex', flexDirection: 'column',
      }}>
        {announcements.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={announcements}
            split={false}
            renderItem={(item: any) => (
              <div
                key={item.id}
                style={{
                  background: popoverCardBg,
                  borderRadius: 12,
                  padding: '16px',
                  marginBottom: 12,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = popoverCardHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = popoverCardBg;
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{
                        background: themeMode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)',
                        color: themeMode === 'light' ? '#3f3f46' : '#d4d4d8', fontSize: 12,
                        padding: '2px 6px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap',
                        border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
                        flexShrink: 0
                      }}>
                        {t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: popoverTitleColor, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                      {getAnnouncementLabel(item.title)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: popoverTimeColor, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {formatApiDateTime(item.created_at, 'YYYY-MM-DD HH:mm')}
                  </div>
                </div>

                <div
                  className="quill-content"
                  dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(item.content) }}
                  style={{
                    color: popoverContentColor, fontSize: 13, lineHeight: 1.6,
                    background: 'transparent', padding: '0', overflowWrap: 'break-word', wordBreak: 'break-all'
                  }}
                />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: 64, color: popoverEmptyIconColor, marginBottom: 24 }} />
            <div style={{ color: popoverEmptyTextColor, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{t('header.notifications', '你的通知将出现在这里')}</div>
            <div style={{ color: popoverEmptySubtextColor, fontSize: 13, lineHeight: 1.6, maxWidth: 260 }}>
              {t('header.no_notifications_desc', '平台重要公告及更新内容将在这里展示，即可第一时间收到通知。')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const loadStorageStats = useCallback(async () => {
    try {
      invalidateCoalesce('pg2026:storage-stats');
      const statsRes = await coalesceAsync('pg2026:storage-stats', () =>
        request.get('/playground-2026/storage-stats') as Promise<any>,
      );
      setStorageStats(statsRes);
    } catch (e) {
      console.error('获取存储统计失败', e);
    }
  }, []);

  // 初始化存储：检查 TOS 配置并创建用户文件夹
  const initStorage = useCallback(async () => {
    try {
      setStorageError(null);
      await coalesceAsync('pg2026:init-storage', () =>
        request.post('/playground-2026/init-storage', {}) as Promise<any>,
      );
      setStorageReady(true);
      await loadStorageStats();
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || e?.message || '存储初始化失败';
      setStorageError(errMsg);
      setStorageReady(false);
    }
  }, [loadStorageStats]);

  useEffect(() => {
    const siteNameStr = settings?.site?.name || 'AI 创作中心2026';
    const pgTitle = t('playground_2026:title', '创作中心2026');
    document.title = `${pgTitle}-${siteNameStr}`;
  }, [settings?.site?.name, t]);

  useEffect(() => {
    void initStorage();
    // 仅挂载时初始化一次；settings 变化只改标题，避免整页接口重打
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAlbums = useCallback(async () => {
    try {
      const list = await listAlbums();
      setAlbums(list);
    } catch (e) {
      console.error('加载作品分类失败', e);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    void loadAlbums();
  }, [storageReady, loadAlbums]);

  useEffect(() => {
    const handleAssetsRefresh = () => {
      void loadStorageStats();
      void loadAlbums();
    };
    window.addEventListener('pg-assets-refresh', handleAssetsRefresh);
    return () => {
      window.removeEventListener('pg-assets-refresh', handleAssetsRefresh);
    };
  }, [loadStorageStats, loadAlbums]);

  useEffect(() => {
    if (path.startsWith('/playground-2026/assets/uploads')) {
      navigate('/playground-2026/assets/all', { replace: true });
    }
  }, [path, navigate]);

  return (
    <PlaygroundUIProvider mode={themeMode === 'dark' ? 'dark' : 'light'}>
    <SidebarCollapseProvider initialCollapsed={isMobile} isMobile={isMobile}>
    <App>
    <div className={`pg-ig pg-ig-shell${isMobile ? ' pg-ig-is-mobile' : ''}${themeMode === 'light' ? ' light' : ''}`} data-theme={themeMode}>
        <CanvasParticles />

        <style>{`
          @keyframes pgSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes pgFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pgShimmer {
            0% { background-position: -200px 0; }
            100% { background-position: 200px 0; }
          }
          @keyframes pgPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.15; }
          }
        `}</style>

        {/* ===== 存储未配置错误遮罩 ===== */}
        {storageError && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              background: 'rgba(22, 22, 24, 0.98)',
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: 24,
              padding: '48px 40px',
              maxWidth: 460,
              textAlign: 'center',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}>
              <ExclamationCircleOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 20 }} />
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>创作中心2026暂不可用</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.8, margin: '0 0 8px' }}>
                请先在管理端本插件「存储配置」中完成火山引擎 TOS 对象存储后再使用创作中心2026。
              </p>
              <p style={{ color: 'rgba(255,77,79,0.8)', fontSize: 13, lineHeight: 1.6, margin: '0 0 28px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {storageError}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="pg-ig-top-link"
                  onClick={() => navigate('/dashboard')}
                  style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '8px 24px' }}
                >
                  返回首页
                </button>
                <button
                  type="button"
                  onClick={() => initStorage()}
                  style={{
                    padding: '8px 24px', borderRadius: 12, cursor: 'pointer',
                    background: '#8b5cf6', border: 'none',
                    color: '#fff', fontSize: 14, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <ReloadOutlined />
                  重试
                </button>
              </div>
            </div>
          </div>
        )}

        <PlaygroundSidebar
          activeTab={activeTab}
          activeAlbumId={activeAlbumId}
          albums={albums}
          storageStats={storageStats}
          siteName={siteName}
          siteLogo={siteLogo}
          onAlbumsChange={loadAlbums}
        />

        {/* ===== 右侧 Main 区域 ===== */}
        <div className="pg-ig-main">
          {/* 顶部 Navbar */}
          <div className="pg-ig-topbar">
            {/* 左侧：面包屑与展开/收起开关（对齐模型广场） */}
            <div className="pg-ig-crumb">
              <SidebarToggleButton
                className="pg-ig-topbar-toggle"
                title={t('playground_2026:toggle_menu', '切换菜单')}
                size={16}
              />
              <button type="button" className="pg-ig-crumb-home" onClick={() => navigate('/playground-2026/images')}>
                {t('playground_2026:title', '创作中心2026')}
              </button>
              <span className="pg-ig-crumb-sep" style={{ color: 'var(--ig-border-strong)' }}>/</span>
              <strong className="pg-ig-crumb-section">
                {activeTab === 'images'
                  ? t('playground_2026:images', '图片')
                  : activeTab === 'videos'
                    ? t('playground_2026:videos', '视频')
                    : activeTab === 'assets-favorites'
                      ? t('playground_2026:favorites', '收藏夹')
                      : activeTab === 'assets-album'
                        ? albums.find((a) => a.id === activeAlbumId)?.name ||
                          t('playground_2026:assets', '资产')
                        : activeTab === 'assets-uploads'
                          ? t('playground_2026:uploads', '上传')
                          : activeTab === 'assets-works'
                            ? t('playground_2026:works', '作品')
                              : activeTab === 'assets-all'
                              ? t('playground_2026:all_assets', '资产素材库')
                              : ((typeof storageStats?.workflow_menu_title === 'string' && storageStats.workflow_menu_title.trim()) || t('playground_2026:workflows', '工作流'))}
              </strong>
            </div>

            {/* 右侧：工具项 */}
            <div className="pg-ig-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

              {/* 右侧工具对齐主站控制台：PC 端展示图文，移动端只显示纯图标 */}
              <Space size={isMobile ? 2 : 8} align="center" style={{ flexShrink: 0 }}>
                {/* 1. 模型广场 */}
                {isPluginVisibleForUser('model_marketplace') && (
                  <Tooltip title={t('menu.model_marketplace', '模型广场')} placement="bottom">
                    <Button
                      type="text"
                      shape={isMobile ? 'circle' : undefined}
                      href="/home/models"
                      target="_blank"
                      icon={
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                        >
                          <path d="M12 2L19.5 6.2L12 10.5L4.5 6.2Z" fill={themeMode === 'light' ? '#e0e0e0' : '#2e2e2e'} />
                          <path d="M3.5 7.8L11 12V21L3.5 16.8Z" fill={themeMode === 'light' ? '#b0b0b0' : '#555555'} />
                          <path d="M13 12L20.5 7.8V16.8L13 21Z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} />
                        </svg>
                      }
                      style={{
                        color: themeMode === 'light' ? '#1f2937' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: isMobile ? 0 : 6,
                        fontSize: 14,
                        fontWeight: 500,
                        height: isMobile ? 34 : 40,
                        width: isMobile ? 34 : undefined,
                        padding: isMobile ? 0 : '0 12px',
                      }}
                    >
                      {!isMobile && (
                        <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.model_marketplace', '模型广场')}</span>
                      )}
                    </Button>
                  </Tooltip>
                )}

                {/* 2. API教程 */}
                {isPluginVisibleForUser('docs_api') && (
                  <Tooltip title={t('menu.relay_api', 'API教程')} placement="bottom">
                    <Button
                      type="text"
                      shape={isMobile ? 'circle' : undefined}
                      href="/docs"
                      target="_blank"
                      icon={
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                        >
                          <rect x="8" y="2.5" width="2.6" height="5.8" rx="1.2" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} />
                          <rect x="13.4" y="2.5" width="2.6" height="5.8" rx="1.2" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} />
                          <path d="M4.5 7.5H19.5V10H4.5V7.5Z" fill={themeMode === 'light' ? '#e0e0e0' : '#2e2e2e'} />
                          <path d="M5 10H12V21C7.8 21 5 18.6 5 15.2V10Z" fill={themeMode === 'light' ? '#b0b0b0' : '#555555'} />
                          <path d="M12 10H19V15.2C19 18.6 16.2 21 12 21V10Z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} />
                          <path d="M8.5 12.2V16.8" stroke={themeMode === 'light' ? '#757575' : '#2e2e2e'} strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M15.5 12.2V16.8" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      }
                      style={{
                        color: themeMode === 'light' ? '#1f2937' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: isMobile ? 0 : 6,
                        fontSize: 14,
                        fontWeight: 500,
                        height: isMobile ? 34 : 40,
                        width: isMobile ? 34 : undefined,
                        padding: isMobile ? 0 : '0 12px',
                      }}
                    >
                      {!isMobile && (
                        <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.relay_api', 'API教程')}</span>
                      )}
                    </Button>
                  </Tooltip>
                )}

                {/* 3. 明暗切换 */}
                {enableThemeToggle && (
                  <Tooltip
                    title={themeMode === 'light' ? t('header.switch_dark_mode', '切换暗色模式') : t('header.switch_light_mode', '切换亮色模式')}
                    placement="bottom"
                    color={themeMode === 'light' ? '#fff' : '#2b2b2b'}
                    overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}
                  >
                    <Button
                      type="text"
                      shape="circle"
                      onClick={toggleTheme}
                      icon={
                        themeMode === 'light' ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79Z" fill="#757575" />
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <circle cx="12" cy="12" r="6" fill="#555555" />
                            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="#9e9e9e" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        )
                      }
                      style={{
                        color: themeMode === 'light' ? '#1f2937' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: isMobile ? 34 : 40,
                        height: isMobile ? 34 : 40,
                      }}
                    />
                  </Tooltip>
                )}

                {/* 4. 多语言切换 */}
                {enableMultilingual && (
                  <Dropdown menu={{ items: langItems }} placement="bottomRight">
                    <Button
                      type="text"
                      shape="circle"
                      icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                          <circle cx="12" cy="12" r="8.5" stroke={themeMode === 'light' ? '#757575' : '#9e9e9e'} strokeWidth="2" />
                          <path d="M3.5 12h17" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2" strokeLinecap="round" />
                          <ellipse cx="12" cy="12" rx="3.5" ry="8.5" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2" />
                        </svg>
                      }
                      style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? 34 : 40, height: isMobile ? 34 : 40 }}
                    />
                  </Dropdown>
                )}

                {/* 5. 通知中心 */}
                <Popover
                  content={announcementContent}
                  trigger="click"
                  placement="bottomRight"
                  overlayClassName={`custom-premium-popover pg-site-notice-popover ${_isLight ? 'light' : 'dark'}`}
                  open={announcementsDrawerVisible}
                  onOpenChange={setAnnouncementsDrawerVisible}
                  styles={{ container: { padding: 0, background: 'transparent', boxShadow: 'none' }, body: { padding: 0 } }}
                  motion={{ motionName: '' }}
                  arrow={false}
                >
                  <Tooltip title={t('header.notifications', '通知')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
                    <Badge count={unreadCount} overflowCount={99} offset={[-4, 4]} className="header-badge">
                      <Button
                        type="text"
                        shape="circle"
                        icon={
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                          >
                            <path d="M19 16.5v-6.5a7 7 0 00-14 0v6.5l-2 2h18l-2-2z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} stroke={themeMode === 'light' ? '#757575' : '#9e9e9e'} strokeWidth="1.5" strokeLinejoin="round" />
                            <path d="M10 19.5a2 2 0 004 0" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        }
                        style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? 34 : 40, height: isMobile ? 34 : 40 }}
                        onClick={() => {
                          setUnreadCount(0);
                        }}
                      />
                    </Badge>
                  </Tooltip>
                </Popover>

                {/* 6. 用户头像 */}
                {user && (
                  <UserAvatarMenu isUserEnd={true} agreement={agreement} />
                )}
              </Space>
            </div>
          </div>

          <PlaygroundHomeMain
            activeTab={activeTab}
            activeAlbumId={activeAlbumId}
            albums={albums}
            loadAlbums={loadAlbums}
            onWorkflowsChange={loadStorageStats}
            isMobile={isMobile}
            workflowMenuTitle={typeof storageStats?.workflow_menu_title === 'string' ? storageStats.workflow_menu_title.trim() : undefined}
          />
        </div>

        <style>{`
          .pg-scroll::-webkit-scrollbar { width: 4px; }
          .pg-scroll::-webkit-scrollbar-track { background: transparent; }
          .pg-scroll::-webkit-scrollbar-thumb { background: ${themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; border-radius: 4px; }
          .pg-scroll::-webkit-scrollbar-thumb:hover { background: ${themeMode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}; }
        `}</style>
      </div>
    </App>
    </SidebarCollapseProvider>
    </PlaygroundUIProvider>
  );
};

const PlaygroundHomePage: React.FC = () => (
  <PlaygroundHealthGate>
    <PlaygroundHome />
  </PlaygroundHealthGate>
);

export default PlaygroundHomePage;
