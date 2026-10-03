/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAnnouncementLabel, getAnnouncementDisplayTime } from '../utils/announcement';
import {
  parseNotificationPreferences,
  shouldShowWebNotifications,
  maybeShowBrowserPush,
} from '../utils/notificationPrefs';
import { Sidebar as SidebarIcon, Terminal } from 'lucide-react';
import { fetchConsoleBootstrap } from '../utils/consoleBootstrap';
import {
  fetchAdminPlugins,
  subscribeAdminPluginsChange,
  selectAdminSidebarPlugins,
  adminSidebarPluginLabel,
  adminSidebarPluginHref,
} from '../utils/adminPlugins';
import { persistUserLanguagePreference, LANG_NAME_MAP, toDisplayLocale } from '../utils/language';
import useSettingsStore from '../store/settings';
import { hasAdminChildMenuPermission } from '../constants/adminMenuPermissions';
import ErrorBoundary from '../components/ErrorBoundary';
import { Layout, Menu, Button, Space, Typography, ConfigProvider, theme, Grid } from 'antd';
import {
  DashboardOutlined,
  ControlOutlined,
  KeyOutlined,
  BarsOutlined,
  GiftOutlined,
  TeamOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  GlobalOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  SettingOutlined,
  WalletOutlined,
  UserOutlined,
  NotificationOutlined,
  HistoryOutlined,
  ScheduleOutlined,
  RocketOutlined,
  PictureOutlined,
  FolderOpenOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  BellOutlined,
  ShopOutlined,
  SunOutlined,
  MoonOutlined,

  VideoCameraOutlined,
  SafetyCertificateOutlined,
  RightOutlined,
  SoundOutlined,
  FileTextOutlined,
} from '@ant-design/icons';

import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dropdown, Modal, message, Popover, Avatar, Divider, Drawer, List, Badge, Tooltip, Checkbox } from 'antd';
import type { MenuProps } from 'antd';
import type { Announcement, Plugin } from '../types';
import useAuthStore from '../store/auth';
import { normalizeTitleHref } from './AuthLayout';
import { useThemeStore } from '../store/theme';
import UserAvatarMenu from '../components/UserAvatarMenu';
import BindPromptModal from '../components/BindPromptModal';
import AnnouncementPopupModal from '../components/AnnouncementPopupModal';
import { getAntdThemeTokens, getSiderMenuTokens, softAccent } from '../theme/tokens';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;

interface DashboardLayoutProps {
  isUserEnd?: boolean;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ isUserEnd = false }) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth <= 576) {
        return true;
      }
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (screens.xs) {
      setCollapsed(true);
    }
  }, [screens.xs]);

  const handleCollapsedChange = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem('sidebar_collapsed', JSON.stringify(val));
  };

  const [openKeys, setOpenKeys] = useState<string[]>([]);


  const { user, logout, setUser, isLoggedIn } = useAuthStore();
  const { themeMode, toggleTheme } = useThemeStore();
  // 复用 App.tsx 中已拉取的 settings store，不再独立调 /settings 接口
  const { settings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const site = settings?.site;
  const siteName = site?.name || 'Tkeapi';
  const siteLogo = site?.logo || '';
  const logoTitleHref = normalizeTitleHref(site?.logo_title_url);
  const goLogoTitle = () => {
    if (!logoTitleHref) return;
    if (logoTitleHref.startsWith('/') || logoTitleHref.startsWith('#') || logoTitleHref.startsWith('?')) {
      navigate(logoTitleHref);
    } else {
      window.location.href = logoTitleHref;
    }
  };
  const siteTitle = site?.title || '';
  const enableMultilingual = site?.enable_multilingual !== false;
  const enableThemeToggle = site?.enable_theme_toggle !== false;
  const supportedLanguages = site?.supported_languages?.length ? site.supported_languages : ['zh', 'en'];
  const agreement = settings?.agreement || null;

  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [popupAnnouncements, setPopupAnnouncements] = useState<Announcement[]>([]);
  const [popupModalOpen, setPopupModalOpen] = useState(false);
  const [consolePageReady, setConsolePageReady] = useState(false);
  const dashboardPopupShownRef = useRef(false);
  const notifyConsolePageReady = useCallback(() => {
    setTimeout(() => {
      setConsolePageReady(true);
    }, 2000);
  }, []);
  const outletContextValue = useMemo(() => ({
    announcements,
    notifyConsolePageReady,
  }), [announcements, notifyConsolePageReady]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);
  const [adminPlugins, setAdminPlugins] = useState<Plugin[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetchConsoleBootstrap()
      .then((data) => {
        if (cancelled) return;
        if (data.user?.id) {
          setUser(data.user, !!sessionStorage.getItem('token'));
        }
        if (Array.isArray(data.announcements)) {
          setAnnouncements(data.announcements);
        }
        if (Array.isArray(data.active_plugins)) {
          setActivePlugins(data.active_plugins);
        }
      })
      .catch((error) => {
        console.error('Failed to fetch console bootstrap', error);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (isUserEnd || !isLoggedIn) return;
    if (import.meta.env.VITE_ENABLE_PLUGINS !== 'true') return;
    let cancelled = false;
    const load = () => {
      fetchAdminPlugins()
        .then((data) => {
          if (cancelled) return;
          if (Array.isArray(data?.plugins)) setAdminPlugins(data.plugins);
        })
        .catch((error) => {
          console.error('Failed to fetch admin plugins', error);
        });
    };
    load();
    const unsub = subscribeAdminPluginsChange(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [isLoggedIn, isUserEnd]);


  const showSystemAbout = () => {
    navigate(`/${adminPath}/about`);
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    persistUserLanguagePreference(lng);
  };

  const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en'];

  const langItems: MenuProps['items'] = supportedLanguages
    .filter(lng => implementedLangs.includes(lng))
    .map(lng => ({
      key: lng,
      label: LANG_NAME_MAP[lng] || lng,
      onClick: () => changeLanguage(lng),
    }));

  const isDashboardPath = (pathname: string) => {
    const p = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
    return p === '/' || p === '/dashboard' || p.endsWith('/dashboard');
  };

  const checkAndShowPopup = (dataList: Announcement[]) => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetPopups = dataList.filter((item: Announcement) => {
      if (item.is_popup !== 1) return false;
      return localStorage.getItem(`popup_notice_dismissed_${item.id}`) !== todayStr;
    });
    if (targetPopups.length === 0) return false;
    setPopupAnnouncements(targetPopups);
    setPopupModalOpen(true);
    return true;
  };

  // 当公告数据、用户偏好或阈值设置更新时，计算未读数与浏览器推送，不再发起多余网络请求
  useEffect(() => {
    if (!announcements.length) {
      setUnreadCount(0);
      return;
    }
    const prefs = parseNotificationPreferences(
      user?.notification_preferences,
      settings?.notification?.low_balance_threshold ?? 100.0,
    );
    const showWeb = shouldShowWebNotifications(prefs, settings?.notification);
    setUnreadCount(showWeb ? announcements.length : 0);
    if (showWeb && announcements.length > 0) {
      const first = announcements[0];
      const seenKey = `notif_push_seen_${first.id}`;
      if (!sessionStorage.getItem(seenKey)) {
        sessionStorage.setItem(seenKey, '1');
        const title = getAnnouncementLabel(first.title || '') || (i18n.language.startsWith('zh') ? '新通知' : 'New notification');
        const body = getAnnouncementLabel(first.content || '').replace(/<[^>]+>/g, '').slice(0, 120);
        maybeShowBrowserPush(title, body, prefs, settings?.notification);
      }
    }
  }, [announcements, user?.notification_preferences, settings?.notification?.low_balance_threshold, settings?.notification, i18n.language]);

  // 离开控制台时关掉弹窗，下次进入再等加载完成后弹
  useEffect(() => {
    if (!isDashboardPath(location.pathname)) {
      dashboardPopupShownRef.current = false;
      setConsolePageReady(false);
      setPopupModalOpen(false);
    }
  }, [location.pathname]);

  // 控制台首屏加载完成后再弹一次，避免加载过程中反复挂载闪屏
  useEffect(() => {
    if (!isDashboardPath(location.pathname) || !consolePageReady) return;
    if (dashboardPopupShownRef.current || announcements.length === 0) return;
    if (checkAndShowPopup(announcements)) {
      dashboardPopupShownRef.current = true;
    }
  }, [location.pathname, announcements, consolePageReady]);

  const handleClosePopupModal = (dontShowToday: boolean, noticeIds: number[]) => {
    if (dontShowToday) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      noticeIds.forEach((id) => {
        localStorage.setItem(`popup_notice_dismissed_${id}`, todayStr);
      });
    }
    setPopupModalOpen(false);
  };

  // 插件菜单：检查用户等级是否在插件允许范围内
  const isPluginVisibleForUser = (pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    if (plugin.allowed_levels === 'all') return true;
    if (!isUserEnd) return true; // 管理员端始终显示
    const allowed = plugin.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  };

  const menuItems: MenuProps['items'] = [];
  const isSuperAdmin = !isUserEnd && user?.role === 'admin' && !user.admin_group_id;

  const getMenuLabel = (item: any) => {
    if (!item) return '';
    const lang = (i18n.language || 'zh').toLowerCase();
    if (lang.startsWith('zh')) {
      if (item.label_zh && item.label_zh.trim()) {
        return item.label_zh;
      }
      if (item.label_en && item.label_en.trim()) {
        return item.label_en;
      }
    } else if (lang.startsWith('en')) {
      if (item.label_en && item.label_en.trim()) {
        return item.label_en;
      }
      if (item.label_zh && item.label_zh.trim()) {
        return item.label_zh;
      }
    } else {
      // 其它语种（如 ja, ko, vi 等）优先尝试国际化翻译字典，未匹配再降级到英文/中文
      if (item.key === '/playground' && i18n.exists('playground:title')) {
        return t('playground:title');
      }
      if (item.key === '/playground-2026' && i18n.exists('playground_2026:title')) {
        return t('playground_2026:title');
      }
      const i18nKey = `menu.${item.key.substring(1).replace(/-/g, '_')}`;
      if (i18n.exists(i18nKey)) {
        return t(i18nKey);
      }
      return item.label_en || item.label_zh || item.key;
    }

    if (item.key === '/playground' && i18n.exists('playground:title')) {
      return t('playground:title');
    }
    if (item.key === '/playground-2026' && i18n.exists('playground_2026:title')) {
      return t('playground_2026:title');
    }
    const i18nKey = `menu.${item.key.substring(1).replace(/-/g, '_')}`;
    if (i18n.exists(i18nKey)) {
      return t(i18nKey);
    }
    return item.label_zh || item.label_en || item.key;
  };

  const getMenuIcon = (iconName: string) => {
    const iconStyle = { fontSize: '18px' };
    switch (iconName) {
      case 'DashboardOutlined': return <DashboardOutlined style={iconStyle} />;
      case 'ExperimentOutlined': return <ExperimentOutlined style={iconStyle} />;
      case 'RocketOutlined': return <RocketOutlined style={iconStyle} />;
      case 'KeyOutlined': return <KeyOutlined style={iconStyle} />;
      case 'HistoryOutlined': return <HistoryOutlined style={iconStyle} />;
      case 'ScheduleOutlined': return <ScheduleOutlined style={iconStyle} />;
      case 'PictureOutlined': return <PictureOutlined style={iconStyle} />;
      case 'FolderOpenOutlined': return <FolderOpenOutlined style={iconStyle} />;
      case 'TeamOutlined': return <TeamOutlined style={iconStyle} />;

      case 'WalletOutlined': return <WalletOutlined style={iconStyle} />;
      case 'VideoCameraOutlined': return <VideoCameraOutlined style={iconStyle} />;
      case 'SafetyCertificateOutlined': return <SafetyCertificateOutlined style={iconStyle} />;
      case 'UserOutlined': return <UserOutlined style={iconStyle} />;
      case 'SettingOutlined': return <SettingOutlined style={iconStyle} />;
      default: return <BarsOutlined style={iconStyle} />;
    }
  };

  const isMenuAllowedForUser = (item: any) => {
    if (!item.enabled) return false;
    if (item.allowed_levels === 'all') return true;
    
    const allowed = item.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  };

  if (isUserEnd) {
    if (settings) {
      const defaultItems = [
        { key: '/dashboard', label_zh: '系统概览', label_en: 'Dashboard', icon: 'DashboardOutlined', enabled: true, sort_order: 1, allowed_levels: 'all' },
        { key: '/playground', label_zh: '创作中心', label_en: 'Playground', icon: 'ExperimentOutlined', enabled: true, sort_order: 2, allowed_levels: 'all' },
        { key: '/playground-2026', label_zh: '创作中心2026', label_en: 'Playground 2026', icon: 'ExperimentOutlined', enabled: true, sort_order: 2.5, allowed_levels: 'all' },
        { key: '/tokens', label_zh: '令牌管理', label_en: 'Tokens', icon: 'KeyOutlined', enabled: true, sort_order: 4, allowed_levels: 'all' },
        { key: '/logs', label_zh: '日志记录', label_en: 'Logs', icon: 'HistoryOutlined', enabled: true, sort_order: 5, allowed_levels: 'all' },
        { key: '/task-logs', label_zh: '任务列表', label_en: 'Task Logs', icon: 'ScheduleOutlined', enabled: true, sort_order: 6, allowed_levels: 'all' },
        { key: '/assets', label_zh: '资产素材', label_en: 'Assets', icon: 'PictureOutlined', enabled: true, sort_order: 7, allowed_levels: 'all' },
        { key: '/assets-intl', label_zh: '资产管理', label_en: 'Assets Intl', icon: 'FolderOpenOutlined', enabled: true, sort_order: 8, allowed_levels: 'all' },
        { key: '/advanced-marketing', label_zh: '高级推广', label_en: 'Advanced Marketing', icon: 'TeamOutlined', enabled: true, sort_order: 10, allowed_levels: 'all' },

        { key: '/wallet', label_zh: '我的钱包', label_en: 'Wallet', icon: 'WalletOutlined', enabled: true, sort_order: 11, allowed_levels: 'all' },
        { key: '/ark-video-monitor', label_zh: '视频监控', label_en: 'Ark Video Monitor', icon: 'VideoCameraOutlined', enabled: true, sort_order: 11.5, allowed_levels: 'all' },
        { key: '/profile', label_zh: '个人中心', label_en: 'Profile', icon: 'UserOutlined', enabled: true, sort_order: 12, allowed_levels: 'all' },
      ];

      const mergedItems = settings?.menu_config?.items?.length ? [...settings.menu_config.items] : [...defaultItems];

      defaultItems.forEach((defItem) => {
        if (!mergedItems.some((item: any) => item.key === defItem.key)) {
          mergedItems.push({
            ...defItem,
            sort_order: mergedItems.length + 1
          });
        }
      });

      const sortedConfigs = mergedItems.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

      const userSettingsChildren: any[] = [];
      let settingsSortOrder = 11;

      sortedConfigs.forEach((item: any) => {
        if (!isMenuAllowedForUser(item)) return;
        if (item.key === '/relay-api' || item.key === '/docs') return; // Completely hide API tutorial from left menu

        if (item.key === '/moderation-query') return;
        if (item.key === '/playground' && !isPluginVisibleForUser('playground')) return;
        if (item.key === '/playground-2026' && !isPluginVisibleForUser('playground_2026')) return;
        if (item.key === '/assets') {
          if (!isPluginVisibleForUser('asset_manager')) return;
          const assetPlugin = activePlugins.find((p: any) => p.name === 'asset_manager');
          if (assetPlugin?.user_asset_menu_enabled !== true) return;
        }
        if (item.key === '/assets-intl' && !isPluginVisibleForUser('asset_manager_intl')) return;
        if (item.key === '/advanced-marketing' && !isPluginVisibleForUser('team_marketing')) return;

        if (item.key === '/ark-video-monitor' && !isPluginVisibleForUser('volcengine_ark_monitor')) return;

        const labelNode = <Link to={item.key}>{getMenuLabel(item)}</Link>;

        if (item.key === '/wallet' || item.key === '/profile') {
          userSettingsChildren.push({
            key: item.key,
            icon: getMenuIcon(item.icon),
            label: labelNode,
          });
          if (item.key === '/wallet') {
            settingsSortOrder = item.sort_order || 11;
          }
          return;
        }

        menuItems.push({
          key: item.key,
          icon: getMenuIcon(item.icon),
          label: labelNode,
          sort_order: item.sort_order,
        } as any);
      });

        if (settings?.notification?.site_notification_enabled) {
          userSettingsChildren.push({
            key: '/profile/notifications',
            icon: <BellOutlined style={{ fontSize: '18px' }} />,
            label: <Link to="/profile/notifications">{t('menu.notifications')}</Link>,
          });
        }

        const isInvoiceEnabled = user?.invoice_enabled === 1 || user?.role === 'admin';
        if (isInvoiceEnabled) {
          userSettingsChildren.push({
            key: '/invoices',
            icon: <FileTextOutlined style={{ fontSize: '18px' }} />,
            label: <Link to="/invoices">{t('menu.invoices', '财务发票')}</Link>,
          });
        }

        userSettingsChildren.sort((a, b) => {
          const rank = (key: string) => {
            if (key === '/profile') return 0;
            if (key === '/wallet') return 1;
            if (key === '/invoices') return 2;
            return 3;
          };
          return rank(a.key) - rank(b.key);
        });
        menuItems.push({
          key: 'user-settings-group',
          icon: getMenuIcon('SettingOutlined'),
          label: t('menu.user_settings'),
          children: userSettingsChildren,
          sort_order: settingsSortOrder,
        } as any);
        menuItems.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  } else {
    // Admin side menu construction
    const isSubAdmin = user?.role === 'admin' && !isSuperAdmin;
    const permissionsLoaded = !!user?.permissions;

    // Only render restricted core menus once permissions are loaded (or if super admin) to prevent flashing
    if (!isSubAdmin || permissionsLoaded) {
      if (!isSubAdmin || user?.permissions?.includes('dashboard')) {
        menuItems.push({
          key: '/admin0755/dashboard',
          icon: <DashboardOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/dashboard">{t('menu.dashboard')}</Link>,
        });
      }

      // Hide API tutorial from left menu in Admin section as well (since it's moved to header)
      /* 
      if (!isSubAdmin || user?.permissions?.includes('relay_api')) {
        menuItems.push({
          key: '/admin0755/docs',
          icon: <RocketOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/docs">{t('menu.relay_api')}</Link>,
        });
      }
      */

      if (!isSubAdmin || user?.permissions?.includes('tokens')) {
        menuItems.push({
          key: '/admin0755/tokens',
          icon: <KeyOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/tokens">{t('menu.tokens')}</Link>,
        });
      }

      if (!isSubAdmin || user?.permissions?.includes('logs')) {
        if (
          !isSubAdmin ||
          hasAdminChildMenuPermission(user?.permissions, 'logs', 'logs.usage', false)
        ) {
          menuItems.push({
            key: '/admin0755/logs',
            icon: <HistoryOutlined style={{ fontSize: '18px' }} />,
            label: <Link to="/admin0755/logs">{t('menu.usage_logs')}</Link>,
          });
        }

        if (
          !isSubAdmin ||
          hasAdminChildMenuPermission(user?.permissions, 'logs', 'logs.tasks', false)
        ) {
          menuItems.push({
            key: '/admin0755/task-logs',
            icon: <ScheduleOutlined style={{ fontSize: '18px' }} />,
            label: <Link to="/admin0755/task-logs">{t('menu.task_logs')}</Link>,
          });
        }
      }
    }
  }

  if (!isUserEnd && user?.role === 'admin') {
    const hasPermission = (key: string) => {
      if (isSuperAdmin) return true; // 超级管理员直接放行所有菜单
      if (!user.permissions) return false;
      return user.permissions.includes(key);
    };
    const hasChildMenu = (parentKey: string, childKey: string) =>
      hasAdminChildMenuPermission(user?.permissions, parentKey, childKey, isSuperAdmin);

    if (hasPermission('dashboard')) {
      // dashboard is already at index 0, but we might want to consolidate menu items here
    }

    if (hasPermission('channels')) {
      const channelChildren = [];
      if (hasChildMenu('channels', 'channels.groups')) {
        channelChildren.push({
          key: '/admin0755/channels',
          label: <Link to="/admin0755/channels">{t('menu.channel_groups')}</Link>,
        });
      }
      if (hasChildMenu('channels', 'channels.configs')) {
        channelChildren.push({
          key: '/admin0755/channel-configs',
          label: <Link to="/admin0755/channel-configs">{t('menu.channel_configs')}</Link>,
        });
      }
      if (channelChildren.length > 0) {
        menuItems.push({
          key: 'channels-management-group',
          icon: <ControlOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.channels'),
          children: channelChildren
        });
      }
    }

    if (hasPermission('models') || isSuperAdmin) {
      const modelChildren = [];

      if (hasChildMenu('models', 'models.list')) {
        modelChildren.push({
          key: '/admin0755/models',
          label: <Link to="/admin0755/models">{t('menu.model_list')}</Link>,
        });
      }
      if (hasChildMenu('models', 'models.billing_rules')) {
        modelChildren.push({
          key: '/admin0755/billing-rules',
          label: <Link to="/admin0755/billing-rules">{t('menu.billing_rules')}</Link>,
        });
      }
      if (hasChildMenu('models', 'models.forward_rules')) {
        modelChildren.push({
          key: '/admin0755/forward-rules',
          label: <Link to="/admin0755/forward-rules">{t('menu.forward_rules')}</Link>,
        });
      }

      if (modelChildren.length > 0) {
        menuItems.push({
          key: 'models-management-group',
          icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.admin_routing'),
          children: modelChildren
        });
      }
    }

    if (hasPermission('marketing')) {
      const marketingChildren = [];
      if (hasChildMenu('marketing', 'marketing.redemptions')) {
        marketingChildren.push({
          key: '/admin0755/redemptions',
          label: <Link to="/admin0755/redemptions">{t('menu.redemptions')}</Link>,
        });
      }
      if (hasChildMenu('marketing', 'marketing.registration_gifts')) {
        marketingChildren.push({
          key: '/admin0755/marketing/registration-gifts',
          label: <Link to="/admin0755/marketing/registration-gifts">{t('menu.registration_gifts')}</Link>,
        });
      }
      if (hasChildMenu('marketing', 'marketing.announcements')) {
        marketingChildren.push({
          key: '/admin0755/marketing/announcements',
          label: <Link to="/admin0755/marketing/announcements">{t('menu.announcements')}</Link>,
        });
      }
      if (marketingChildren.length > 0) {
        menuItems.push({
          key: 'marketing-management-group',
          icon: <NotificationOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.marketing'),
          children: marketingChildren
        });
      }
    }


    if (hasPermission('users')) {
      const userItems = [];
      if (hasChildMenu('users', 'users.list')) {
        userItems.push({
          key: '/admin0755/users',
          label: <Link to="/admin0755/users">{t('menu.user_list')}</Link>,
        });
      }
      if (hasChildMenu('users', 'users.admins')) {
        userItems.push({
          key: '/admin0755/admins',
          label: <Link to="/admin0755/admins">{t('menu.admin_list')}</Link>,
        });
      }
      const canUserLevels = hasChildMenu('users', 'users.levels');
      const canAdminGroups = hasChildMenu('users', 'admin_groups');
      if (canUserLevels || canAdminGroups) {
        userItems.push({
          key: '/admin0755/user-levels',
          label: (
            <Link to={canUserLevels ? '/admin0755/user-levels' : '/admin0755/user-levels?tab=admins'}>
              {t('menu.user_levels')}
            </Link>
          ),
        });
      }
      if (hasChildMenu('users', 'users.analytics')) {
        userItems.push({
          key: '/admin0755/users/analytics',
          label: <Link to="/admin0755/users/analytics">{t('menu.user_analytics')}</Link>,
        });
      }

      if (userItems.length > 0) {
        menuItems.push({
          key: 'user-management-group',
          icon: <TeamOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.users'),
          children: userItems
        });
      }
    }

    if (hasPermission('finance')) {
      const financeChildren = [];
      if (hasChildMenu('finance', 'finance.recharges')) {
        financeChildren.push({
          key: '/admin0755/finance/recharges',
          label: <Link to="/admin0755/finance/recharges">{t('menu.finance_recharges')}</Link>,
        });
      }
      if (hasChildMenu('finance', 'finance.orders')) {
        financeChildren.push({
          key: '/admin0755/finance/orders',
          label: <Link to="/admin0755/finance/orders">{t('menu.finance_orders')}</Link>,
        });
      }
      if (hasChildMenu('finance', 'finance.gifts')) {
        financeChildren.push({
          key: '/admin0755/finance/gifts',
          label: <Link to="/admin0755/finance/gifts">{t('menu.finance_gifts')}</Link>,
        });
      }
      if (hasChildMenu('finance', 'finance.commissions')) {
        financeChildren.push({
          key: '/admin0755/finance/commissions',
          label: <Link to="/admin0755/finance/commissions">{t('menu.finance_commissions', '佣金明细')}</Link>,
        });
      }
      const isChinaInvoiceEnabled =
        settings?.invoices?.invoice_enabled !== false &&
        settings?.invoices?.invoice_mode === 'china';
      if (isChinaInvoiceEnabled && hasChildMenu('finance', 'finance.invoices')) {
        financeChildren.push({
          key: '/admin0755/finance/invoices',
          label: <Link to="/admin0755/finance/invoices">{t('menu.finance_invoices', '发票申请审核')}</Link>,
        });
      }
      if (hasChildMenu('finance', 'finance.analysis')) {
        financeChildren.push({
          key: '/admin0755/finance/analysis',
          label: <Link to="/admin0755/finance/analysis">{t('menu.finance_analysis')}</Link>,
        });
      }
      if (financeChildren.length > 0) {
        menuItems.push({
          key: 'finance-management-group',
          icon: <WalletOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.finance'),
          children: financeChildren
        });
      }
    }

    if (hasPermission('settings')) {
      const settingsChildren = [];
      if (hasChildMenu('settings', 'settings.basic')) {
        settingsChildren.push({
          key: '/admin0755/settings?tab=basic',
          label: <Link to="/admin0755/settings?tab=basic">{t('menu.basic_settings')}</Link>,
        });
      }
      if (hasChildMenu('settings', 'settings.payment')) {
        settingsChildren.push({
          key: '/admin0755/payment-settings',
          label: <Link to="/admin0755/payment-settings">{t('menu.payment_settings')}</Link>,
        });
      }
      if (hasChildMenu('settings', 'settings.message_notification')) {
        settingsChildren.push({
          key: '/admin0755/message-notification',
          label: <Link to="/admin0755/message-notification">{t('menu.message_notification')}</Link>,
        });
      }
      if (hasChildMenu('settings', 'settings.oauth')) {
        settingsChildren.push({
          key: '/admin0755/oauth-settings',
          label: <Link to="/admin0755/oauth-settings">{t('menu.oauth_settings')}</Link>,
        });
      }
      if (hasChildMenu('settings', 'settings.database')) {
        settingsChildren.push({
          key: '/admin0755/settings?tab=database',
          label: <Link to="/admin0755/settings?tab=database">{t('menu.database_settings')}</Link>,
        });
      }
      if (settingsChildren.length > 0) {
        menuItems.push({
          key: 'settings-group',
          icon: <SettingOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.settings'),
          children: settingsChildren
        });
      }
    }

    const hasAnyPluginPermission = isSuperAdmin || hasPermission('plugins') || user?.permissions?.some((p: string) => p.startsWith('plugin:'));
    if (hasAnyPluginPermission && import.meta.env.VITE_ENABLE_PLUGINS === 'true') {
      const hasGlobalPluginPerm = isSuperAdmin || hasPermission('plugins');
      const canSeePlugin = (pluginName: string) =>
        hasGlobalPluginPerm || !!user?.permissions?.includes(`plugin:${pluginName}`);
      const sidebarPlugins = selectAdminSidebarPlugins(adminPlugins, canSeePlugin);
      if (sidebarPlugins.length === 0) {
        menuItems.push({
          key: '/admin0755/plugins',
          icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
          label: <Link to="/admin0755/plugins">{t('menu.plugins')}</Link>,
        });
      } else {
        const pluginChildren = [
          {
            key: '/admin0755/plugins',
            label: <Link to="/admin0755/plugins">{t('menu.plugins_all')}</Link>,
          },
          ...sidebarPlugins.map((plugin) => ({
            key: `/admin0755/plugins/${plugin.name}/config`,
            label: (
              <Link to={adminSidebarPluginHref(plugin)}>
                {adminSidebarPluginLabel(plugin, (name, title) => t(`plugin_titles.${name}`, title))}
              </Link>
            ),
          })),
        ];
        menuItems.push({
          key: 'plugins-group',
          icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
          label: t('menu.plugins'),
          children: pluginChildren,
        });
      }
    }
  }

  // 递归替换 /admin0755 为当前的 adminPath
  const processMenuItems = (items: any[]): any[] => {
    return items.map(item => {
      if (!item) return item;
      
      let newKey = item.key;
      if (typeof newKey === 'string' && newKey.startsWith('/admin0755')) {
        newKey = newKey.replace('/admin0755', `/${adminPath}`);
      }

      let newLabel = item.label;
      if (React.isValidElement(newLabel)) {
        const props = (newLabel as React.ReactElement<any>).props;
        if (props && typeof props.to === 'string' && props.to.startsWith('/admin0755')) {
          newLabel = React.cloneElement(newLabel as React.ReactElement<any>, {
            to: props.to.replace('/admin0755', `/${adminPath}`)
          });
        }
      }

      const newItem = {
        ...item,
        key: newKey,
        label: newLabel,
      };

      if (item.children) {
        newItem.children = processMenuItems(item.children);
      }

      return newItem;
    });
  };

  const processedMenuItems = processMenuItems(menuItems);

  const findSelectedKey = (items: any[]): string => {
    const fullPath = location.pathname + location.search;
    const path = location.pathname;

    // 1. Exact match with fullPath (search)
    for (const item of items) {
      if (item?.children) {
        for (const child of item.children) {
          if (child?.key === fullPath) return child.key;
        }
      } else if (item?.key === fullPath) {
        return item.key;
      }
    }

    // 2. Exact match with path
    for (const item of items) {
      if (item?.children) {
        for (const child of item.children) {
          if (child?.key === path) return child.key;
        }
      } else if (item?.key === path) {
        return item.key;
      }
    }

    // 3. Prefix match with path
    for (const item of items) {
      if (item?.children) {
        for (const child of item.children) {
          const baseKey = typeof child?.key === 'string' ? child.key.split('?')[0] : '';
          if (baseKey && baseKey !== '/' && path.startsWith(baseKey + '/')) {
            return child.key;
          }
        }
      } else {
        const baseKey = typeof item?.key === 'string' ? item.key.split('?')[0] : '';
        if (baseKey && baseKey !== '/' && path.startsWith(baseKey + '/')) {
          return item.key;
        }
      }
    }

    if (path.includes('/admin-groups')) {
      for (const item of items) {
        const children = item?.children || [];
        for (const child of children) {
          const baseKey = typeof child?.key === 'string' ? child.key.split('?')[0] : '';
          if (baseKey.endsWith('/user-levels')) return child.key;
        }
      }
    }

    return fullPath;
  };

  let pageName = '';
  const findName = (items: any[], checkPrefix = false): string | undefined => {
    const fullPath = location.pathname + location.search;
    const path = location.pathname;
    for (const item of items) {
      if (!item) continue;
      const isMatch = checkPrefix
        ? (typeof item.key === 'string' && item.key.split('?')[0] !== '/' && (path === item.key.split('?')[0] || path.startsWith(item.key.split('?')[0] + '/')))
        : (item.key === path || item.key === fullPath);

      if (isMatch) {
        if (typeof item.label === 'string') return item.label;
        if (item.label?.props?.children) {
          if (typeof item.label.props.children === 'string') return item.label.props.children;
          if (Array.isArray(item.label.props.children)) return item.label.props.children.join('');
        }
      }
      if (item.children) {
        const found = findName(item.children, checkPrefix);
        if (found) return found;
      }
    }
    return undefined;
  };

  const getActiveOpenKeys = () => {
    const fullPath = location.pathname + location.search;
    const path = location.pathname;
    const keys = processedMenuItems
      .filter((item: any) => item?.children?.some((child: any) => {
        if (child?.key === path || child?.key === fullPath) return true;
        const baseKey = typeof child?.key === 'string' ? child.key.split('?')[0] : '';
        return baseKey && baseKey !== '/' && path.startsWith(baseKey + '/');
      }))
      .map((item: any) => item.key as string);
    
    if (path.includes('/admin-groups') && !keys.includes('user-management-group')) {
      keys.push('user-management-group');
    }
    if (!keys.includes('user-settings-group')) {
      keys.push('user-settings-group');
    }
    return keys;
  };

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys(getActiveOpenKeys());
    }
  }, [collapsed, location.pathname, location.search, activePlugins.length, adminPlugins]);

  pageName = findName(processedMenuItems) || findName(processedMenuItems, true) || '';
  if (!pageName) {
    if (location.pathname === '/profile') pageName = t('menu.profile', '个人中心') as string;
    else if (location.pathname === '/wallet' || location.pathname === '/affiliate') pageName = t('menu.wallet', '我的钱包') as string;
    else if (location.pathname === '/assets') pageName = t('menu.assets', '资产素材') as string;
    else if (location.pathname === '/assets-intl') pageName = t('menu.assets_intl', '资产管理') as string;
    else if (location.pathname === '/advanced-marketing') pageName = t('menu.advanced_marketing', '团队营销管理') as string;
    else if (location.pathname.includes('/admin-groups')) pageName = t('menu.user_levels') as string;

    else if (location.pathname === '/playground' || location.pathname.startsWith('/playground/')) {
      const pgItem = settings?.menu_config?.items?.find((i: any) => i.key === '/playground');
      pageName = pgItem ? getMenuLabel(pgItem) : (i18n.exists('playground:title') ? t('playground:title') : t('menu.playground', '创作中心')) as string;
    }
    else if (location.pathname === '/playground-2026' || location.pathname.startsWith('/playground-2026/')) {
      const pg2026Item = settings?.menu_config?.items?.find((i: any) => i.key === '/playground-2026');
      pageName = pg2026Item ? getMenuLabel(pg2026Item) : (i18n.exists('playground_2026:title') ? t('playground_2026:title') : t('menu.playground_2026', '创作中心2026')) as string;
    }
  }

  useEffect(() => {
    if (pageName && siteTitle) {
      document.title = `${pageName}-${siteTitle}`;
    } else if (siteTitle) {
      document.title = siteTitle;
    }
  }, [pageName, siteTitle]);

  const isLight = themeMode === 'light';
  const borderBottom = isLight ? '1px solid #f0f0f0' : '1px solid rgba(255,255,255,0.08)';
  const cardBg = isLight ? '#f9fafb' : 'rgba(255, 255, 255, 0.04)';
  const cardHoverBg = isLight ? '#f3f4f6' : 'rgba(255, 255, 255, 0.08)';
  const titleColor = isLight ? '#1f2937' : '#fff';
  const timeColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';
  const contentColor = isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';
  const emptyIconColor = isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)';
  const emptyTextColor = isLight ? '#6b7280' : '#e5e5e5';
  const emptySubtextColor = isLight ? '#9ca3af' : 'rgba(255,255,255,0.45)';

  const siteIntro = site?.intro?.trim();
  const renderAdminBadge = () => {
    const badge = (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 border select-none transition-colors"
        style={{
          backgroundColor: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
          borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)',
          color: isLight ? '#71717a' : '#a1a1aa',
        }}
      >
        {t('common.admin_suffix', '管理后台').trim()}
      </span>
    );

    if (!siteIntro) {
      return badge;
    }

    return (
      <Tooltip
        title={
          <div style={{ maxWidth: 280, fontSize: 12, lineHeight: 1.6, padding: '2px 0', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {siteIntro}
          </div>
        }
        placement="bottom"
      >
        {badge}
      </Tooltip>
    );
  };

  const announcementContent = (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom
      }}>
        <span style={{ color: titleColor, fontSize: 16, fontWeight: 500 }}>{t('header.notifications', '通知')}</span>
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
            renderItem={(item) => (
              <div
                key={item.id}
                style={{
                  background: cardBg,
                  borderRadius: 12,
                  padding: '16px',
                  marginBottom: 12,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = cardHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = cardBg;
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{
                        ...softAccent(themeMode === 'light' ? 'light' : 'dark'),
                        fontSize: 12,
                        padding: '2px 6px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        {t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: titleColor, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                      {getAnnouncementLabel(item.title)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timeColor, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {new Date(getAnnouncementDisplayTime(item)).toLocaleString(toDisplayLocale(i18n.language), {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>

                <div
                  className="quill-content"
                  dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(item.content) }}
                  style={{
                    color: contentColor, fontSize: 13, lineHeight: 1.6,
                    background: 'transparent', padding: '0', overflowWrap: 'break-word', wordBreak: 'break-all'
                  }}
                />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: 64, color: emptyIconColor, marginBottom: 24 }} />
            <div style={{ color: emptyTextColor, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{t('header.no_notifications', '你的通知将出现在这里')}</div>
            <div style={{ color: emptySubtextColor, fontSize: 13, lineHeight: 1.6, maxWidth: 260 }}>
              {t('header.no_notifications_desc', '平台重要公告及更新内容将在这里展示，即可第一时间收到通知。')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        token: getAntdThemeTokens(themeMode === 'light' ? 'light' : 'dark'),
        components: {
          Layout: {
            /* siderBg handled by global */
          },
          Menu: {
            ...getSiderMenuTokens(themeMode === 'light' ? 'light' : 'dark'),
            itemHeight: 50,
            iconSize: 20,
            itemMarginInline: 12,
          }
        }
      }}
    >
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme={themeMode}
          width={240}
          collapsedWidth={screens.xs ? 0 : 68}
          style={{
            boxShadow: 'none',
            borderRight: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
            zIndex: screens.xs ? 1050 : 10,
            position: screens.xs ? 'fixed' : 'relative',
            height: '100%',
            left: 0,
            top: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
          className="custom-sider"
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo Area：展开态固定宽度裁切 + 与图标轨交叉淡入，避免文字挤压 */}
            <div
              style={{
                height: screens.xs ? 48 : 56,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
                borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                  width: 224,
                  minWidth: 224,
                  maxWidth: 224,
                  opacity: collapsed ? 0 : 1,
                  transition: collapsed
                    ? 'opacity 0.1s ease'
                    : 'opacity 0.18s ease 0.12s',
                  pointerEvents: collapsed ? 'none' : 'auto',
                  ...(logoTitleHref ? { cursor: 'pointer', textDecoration: 'none', color: 'inherit' } : {}),
                }}
                {...(logoTitleHref
                  ? {
                      role: 'link',
                      tabIndex: 0,
                      onClick: goLogoTitle,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goLogoTitle();
                        }
                      },
                    }
                  : {})}
              >
                {siteLogo ? (
                  <img src={siteLogo} alt="logo" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                ) : (
                  <div className="flex items-center justify-center w-5 h-5 rounded bg-primary text-primary-foreground flex-shrink-0">
                    <Terminal className="w-3 h-3" />
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    flexShrink: 1,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      color: themeMode === 'light' ? '#1f2937' : '#fff',
                      margin: 0,
                      fontSize: siteName.length > 14 ? 12 : siteName.length > 10 ? 13 : siteName.length > 6 ? 14 : 16,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                      minWidth: 0,
                    }}
                    title={siteName}
                  >
                    {siteName}
                  </div>
                  {!isUserEnd && renderAdminBadge()}
                </div>
              </div>
              {!screens.xs && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: collapsed ? 1 : 0,
                    transition: collapsed
                      ? 'opacity 0.18s ease 0.12s'
                      : 'opacity 0.1s ease',
                    pointerEvents: collapsed ? 'auto' : 'none',
                    ...(logoTitleHref ? { cursor: 'pointer' } : {}),
                  }}
                  {...(logoTitleHref
                    ? {
                        role: 'link',
                        tabIndex: 0,
                        onClick: goLogoTitle,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            goLogoTitle();
                          }
                        },
                      }
                    : {})}
                >
                  {siteLogo ? (
                    <img src={siteLogo} alt="logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                  ) : (
                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary text-primary-foreground">
                      <Terminal className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              <ConfigProvider
                theme={{
                  components: {
                    Menu: getSiderMenuTokens(themeMode === 'light' ? 'light' : 'dark'),
                  }
                }}
              >
                <Menu
                  theme={themeMode}
                  mode="inline"
                  selectedKeys={[findSelectedKey(processedMenuItems)]}
                  openKeys={collapsed ? undefined : openKeys}
                  onOpenChange={(keys) => {
                    if (!collapsed) {
                      setOpenKeys(keys);
                    }
                  }}
                  items={processedMenuItems}
                  expandIcon={({ isOpen }) => (
                    <RightOutlined
                      className="ant-menu-submenu-expand-icon"
                      rotate={isOpen ? 90 : 0}
                      style={{ fontSize: 10 }}
                    />
                  )}
                  style={{ border: 'none', background: 'transparent', marginTop: 8 }}
                  onClick={() => {
                    if (screens.xs) setCollapsed(true);
                  }}
                />
              </ConfigProvider>
            </div>
            {!isUserEnd && (
              <div style={{ padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center' }}>
                <Button
                  type="text"
                  icon={<InfoCircleOutlined style={{ fontSize: '18px' }} />}
                  style={{ color: themeMode === 'light' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}
                  onClick={showSystemAbout}
                  title={`${t('menu.system_about')}${settings?.is_open_source ? t('menu.edition_oss') : t('menu.edition_commercial')}`}
                >
                  {(!collapsed) && <span style={{ marginLeft: 8 }}>{t('menu.system_about')}{settings?.is_open_source ? t('menu.edition_oss') : t('menu.edition_commercial')}</span>}
                </Button>
              </div>
            )}
          </div>
        </Sider>
        <Layout style={{
          marginLeft: (screens.xs || collapsed) ? 0 : 0,
          background: 'var(--dashboard)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <Header
            className="dashboard-top-nav-glass"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 100,
              padding: '0 12px',
              background: isLight ? 'rgba(255, 255, 255, 0.62)' : 'rgba(0, 0, 0, 0.48)',
              backdropFilter: 'blur(18px) saturate(180%)',
              WebkitBackdropFilter: 'blur(18px) saturate(180%)',
              height: screens.xs ? 48 : 56,
              lineHeight: (screens.xs ? 48 : 56) + 'px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingRight: screens.xs ? 8 : 24,
              borderBottom: isLight
                ? '1px solid rgba(228, 228, 231, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
              <Button
                type="text"
                icon={<SidebarIcon size={16} />}
                onClick={() => handleCollapsedChange(!collapsed)}
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              />
              {screens.xs && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginLeft: 6,
                    minWidth: 0,
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (logoTitleHref) {
                      goLogoTitle();
                    } else {
                      navigate('/dashboard');
                    }
                  }}
                >
                  {siteLogo ? (
                    <img src={siteLogo} alt="logo" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                  ) : (
                    <div className="flex items-center justify-center w-4.5 h-4.5 rounded bg-primary text-primary-foreground flex-shrink-0">
                      <Terminal className="w-3 h-3" />
                    </div>
                  )}
                  <span
                    style={{
                      color: themeMode === 'light' ? '#1f2937' : '#fff',
                      margin: 0,
                      fontSize: siteName.length > 14 ? 11 : siteName.length > 10 ? 12 : 13,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}
                    title={siteName}
                  >
                    {siteName}
                  </span>
                  {!isUserEnd && renderAdminBadge()}
                </div>
              )}
            </div>

            <Space size={screens.xs ? 2 : 8} align="center" style={{ flexShrink: 0 }}>
              <style>{`
                .header-badge.ant-badge {
                  display: flex !important;
                  align-items: center;
                  justify-content: center;
                  height: 40px;
                }
              `}</style>
              {isPluginVisibleForUser('model_marketplace') && (
                <Tooltip title={t('menu.model_marketplace', '模型广场')} placement="bottom">
                  <Button
                    type="text"
                    href="/home/models"
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
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      height: screens.xs ? 34 : 40,
                      width: screens.xs ? 34 : undefined,
                      padding: screens.xs ? 0 : '0 12px',
                    }}
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        navigate('/home/models');
                      }
                    }}
                  >
                    {!screens.xs && (
                      <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.model_marketplace', 'Models')}</span>
                    )}
                  </Button>
                </Tooltip>
              )}

              {isPluginVisibleForUser('docs_api') && (
                <Tooltip title={t('menu.relay_api', 'API教程')} placement="bottom">
                  <Button
                    type="text"
                    href="/docs"
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
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      height: screens.xs ? 34 : 40,
                      width: screens.xs ? 34 : undefined,
                      padding: screens.xs ? 0 : '0 12px',
                    }}
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        navigate('/docs');
                      }
                    }}
                  >
                    {!screens.xs && (
                      <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.relay_api', 'API教程')}</span>
                    )}
                  </Button>
                </Tooltip>
              )}

              {(enableThemeToggle || !isUserEnd) && (
                <Tooltip title={themeMode === 'light' ? t('header.switch_dark_mode', '切换暗色模式') : t('header.switch_light_mode', '切换亮色模式')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} styles={{ container: { color: themeMode === 'light' ? '#1f2937' : '#fff' } }}>
                  <Button
                    type="text"
                    shape="circle"
                    onClick={toggleTheme}
                    icon={
                      themeMode === 'light'
                        ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79Z" fill="#757575" />
                          </svg>
                        )
                        : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                            <circle cx="12" cy="12" r="6" fill="#555555" />
                            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="#9e9e9e" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        )
                    }
                    style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: screens.xs ? 34 : 40, height: screens.xs ? 34 : 40 }}
                  />
                </Tooltip>
              )}

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
                    style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: screens.xs ? 34 : 40, height: screens.xs ? 34 : 40 }}
                  />
                </Dropdown>
              )}

              <Popover
                content={announcementContent}
                trigger="click"
                placement="bottomRight"
                overlayClassName="custom-premium-popover"
                open={announcementsDrawerVisible}
                onOpenChange={setAnnouncementsDrawerVisible}
                styles={{ container: { padding: 0, background: 'transparent', boxShadow: 'none' } }}
                motion={{ motionName: '' }}
                arrow={false}
              >
                <Tooltip title={t('header.notifications', '通知')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} styles={{ container: { color: themeMode === 'light' ? '#1f2937' : '#fff' } }}>
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
                      style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: screens.xs ? 34 : 40, height: screens.xs ? 34 : 40 }}
                      onClick={() => {
                        setUnreadCount(0);
                      }}
                    />
                  </Badge>
                </Tooltip>
              </Popover>

              <UserAvatarMenu isUserEnd={isUserEnd} agreement={agreement} />
            </Space>

          </Header>
          <Content
            ref={contentRef}
            style={{
            position: 'relative',
            zIndex: 1,
            margin: screens.xs ? '0 8px 8px' : '0 12px 12px',
            // 顶栏浮层 + 10px 间距，滚动时内容穿过毛玻璃
            padding: screens.xs ? 12 : 16,
            paddingTop: (screens.xs ? 48 : 56) + 10,
            minHeight: 280,
            background: 'transparent',
            borderRadius: 8,
            overflow: 'auto',
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ flex: '1 0 auto', width: '100%', minWidth: 0 }}>
              <ErrorBoundary>
                <Outlet context={outletContextValue} />
              </ErrorBoundary>
            </div>
            {site?.copyright && (
              <div
                style={{
                  flexShrink: 0,
                  paddingTop: screens.xs ? 16 : 24,
                  paddingBottom: screens.xs ? 4 : 8,
                  textAlign: 'center',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.35)',
                  userSelect: 'none',
                }}
              >
                {site.copyright}
              </div>
            )}
          </Content>
          {screens.xs && !collapsed && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 1040,
              }}
              onClick={() => setCollapsed(true)}
            />
          )}
        </Layout>
      </Layout>

      {/* 登录控制台弹窗通知 (Shadcn UI Style) */}
      <AnnouncementPopupModal
        announcements={popupAnnouncements}
        open={popupModalOpen}
        onClose={handleClosePopupModal}
        themeMode={themeMode === 'light' ? 'light' : 'dark'}
      />

      {isUserEnd && <BindPromptModal />}
    </ConfigProvider>
  );
};

export default DashboardLayout;
