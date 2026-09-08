/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { getAnnouncementLabel } from '../../utils/announcement';
import { Row, Col, Card, Typography, Table, Space, List, Progress, Alert, Grid, Spin, Modal, Button, Divider, Tooltip as AntTooltip, DatePicker, Radio, Tag } from 'antd';
import MobileCardList, { MobileCard, CardRow } from '../../components/MobileCardList';
import {
  BarChartOutlined,
  DatabaseOutlined,
  AccountBookOutlined,
  CloseOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import type { DashboardStats, RequestLog, Announcement, ModelTrend30dResponse, LiveMetricsResponse, LiveMetricsSnapshot } from '../../types';
import dayjs from 'dayjs';
import { toCalendarDateRangeParams } from '../../utils/dateRangeParams';
import ModelDistribution30d from './ModelDistribution30d';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const screens = Grid.useBreakpoint();
  const { settings } = useSettingsStore();
  const adminPath = settings?.admin_path || 'admin';
  const { user } = useAuthStore();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const currencySymbol = settings?.currency?.currency_symbol || '$';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetricsSnapshot | null>(null);
  const [liveMetricsReady, setLiveMetricsReady] = useState(false);
  const outletContext = useOutletContext<{
    announcements: Announcement[];
    notifyConsolePageReady?: () => void;
  } | null>();
  const notifyConsolePageReady = outletContext?.notifyConsolePageReady;
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState<number>(0);
  const [isPinnedBannerHovered, setIsPinnedBannerHovered] = useState(false);
  const [selectedNoticeForModal, setSelectedNoticeForModal] = useState<Announcement | null>(null);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isNoticeTruncated, setIsNoticeTruncated] = useState(false);
  const noticeTitleRef = useRef<HTMLSpanElement>(null);
  const noticeContentRef = useRef<HTMLDivElement>(null);
  const initializedPinnedRef = useRef(false);

  const handleOpenNoticeDetail = (notice: Announcement) => {
    setSelectedNoticeForModal(notice);
    setIsNoticeModalOpen(true);
  };

  const pinnedAnnouncements = useMemo(() => {
    const raw = outletContext?.announcements?.filter((a) => a.is_pinned === 1 && a.is_active === 1) || [];
    const seen = new Set<number>();
    const list: Announcement[] = [];
    for (const item of raw) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        list.push(item);
      }
    }
    return list;
  }, [outletContext?.announcements]);

  // 当置顶通知数据到达后，随机展示一条（优先不与上次展示的相同），并重置初始化标记
  useEffect(() => {
    if (pinnedAnnouncements.length === 0) {
      setCurrentPinnedIndex(0);
      initializedPinnedRef.current = false;
      return;
    }

    if (!initializedPinnedRef.current) {
      initializedPinnedRef.current = true;
      if (pinnedAnnouncements.length === 1) {
        setCurrentPinnedIndex(0);
        try {
          sessionStorage.setItem('last_dashboard_pinned_id', String(pinnedAnnouncements[0].id));
        } catch {}
        return;
      }

      const lastId = sessionStorage.getItem('last_dashboard_pinned_id');
      const candidateIndices = pinnedAnnouncements
        .map((a, idx) => ({ id: a.id, idx }))
        .filter((item) => String(item.id) !== lastId);

      const chosenIdx =
        candidateIndices.length > 0
          ? candidateIndices[Math.floor(Math.random() * candidateIndices.length)].idx
          : Math.floor(Math.random() * pinnedAnnouncements.length);

      setCurrentPinnedIndex(chosenIdx);
      try {
        sessionStorage.setItem('last_dashboard_pinned_id', String(pinnedAnnouncements[chosenIdx].id));
      } catch {}
    } else {
      setCurrentPinnedIndex((prev) => (prev < pinnedAnnouncements.length ? prev : 0));
    }
  }, [pinnedAnnouncements]);

  // 当存在多条置顶通知时，定时自动轮播切换，悬浮暂停
  useEffect(() => {
    if (pinnedAnnouncements.length <= 1 || isPinnedBannerHovered) return;

    const timer = setInterval(() => {
      setCurrentPinnedIndex((prev) => {
        const next = (prev + 1) % pinnedAnnouncements.length;
        try {
          if (pinnedAnnouncements[next]) {
            sessionStorage.setItem('last_dashboard_pinned_id', String(pinnedAnnouncements[next].id));
          }
        } catch {}
        return next;
      });
    }, 8000);

    return () => clearInterval(timer);
  }, [pinnedAnnouncements, isPinnedBannerHovered]);

  const pinnedAnnouncement = pinnedAnnouncements[currentPinnedIndex] || pinnedAnnouncements[0] || null;

  // 检测当前置顶通知是否内容超出/显示不完整（超出1行标题或2行正文或含隐藏图片/特殊标签）
  useEffect(() => {
    if (!pinnedAnnouncement) {
      setIsNoticeTruncated(false);
      return;
    }

    const checkTruncation = () => {
      let truncated = false;
      if (noticeTitleRef.current) {
        if (noticeTitleRef.current.scrollWidth > noticeTitleRef.current.clientWidth + 1) {
          truncated = true;
        }
      }
      if (noticeContentRef.current) {
        if (noticeContentRef.current.scrollHeight > noticeContentRef.current.clientHeight + 1) {
          truncated = true;
        }
      }
      const contentHtml = getAnnouncementLabel(pinnedAnnouncement.content) || '';
      if (/<img|<table|<pre|<blockquote|<hr/i.test(contentHtml)) {
        truncated = true;
      }
      setIsNoticeTruncated(truncated);
    };

    const animId = requestAnimationFrame(checkTruncation);
    window.addEventListener('resize', checkTruncation);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', checkTruncation);
    };
  }, [pinnedAnnouncement, currentPinnedIndex, i18n.language]);
  const { RangePicker } = DatePicker;
  const isAdmin = user?.role === 'admin';
  const [dateRange, setDateRange] = useState<[any, any] | null>(() => [
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [quickRange, setQuickRange] = useState<string>('today');

  const applyTodayRange = () => {
    setQuickRange('today');
    setDateRange([dayjs().startOf('day'), dayjs().endOf('day')]);
  };

  const handleQuickRangeChange = (e: any) => {
    const val = e.target.value;
    setQuickRange(val);
    if (val === 'today') {
      setDateRange([dayjs().startOf('day'), dayjs().endOf('day')]);
    } else if (val === 'yesterday') {
      setDateRange([dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')]);
    } else if (val === 'week') {
      setDateRange([dayjs().startOf('week'), dayjs().endOf('week')]);
    } else if (val === 'month') {
      setDateRange([dayjs().startOf('month'), dayjs().endOf('month')]);
    } else if (val === 'last_month') {
      setDateRange([
        dayjs().subtract(1, 'month').startOf('month'),
        dayjs().subtract(1, 'month').endOf('month'),
      ]);
    }
  };

  const handleDateRangeChange = (vals: any) => {
    if (!vals?.[0] || !vals?.[1]) {
      applyTodayRange();
      return;
    }
    setDateRange(vals);
    setQuickRange('custom');
  };

  const showDayComparison = quickRange === 'today' || quickRange === 'yesterday';

  const periodLabel = (() => {
    switch (quickRange) {
      case 'today':
        return t('dashboard.today');
      case 'yesterday':
        return t('dashboard.yesterday');
      case 'week':
        return t('dashboard.week');
      case 'month':
        return t('dashboard.month');
      case 'last_month':
        return t('dashboard.last_month');
      default:
        if (dateRange?.[0] && dateRange?.[1]) {
          const sameYear = dateRange[0].year() === dateRange[1].year();
          const fmt = sameYear ? 'MM-DD' : 'YYYY-MM-DD';
          return `${dateRange[0].format(fmt)} ~ ${dateRange[1].format(fmt)}`;
        }
        return t('dashboard.custom');
    }
  })();

  const requestsLabel = t('dashboard.period_requests', { period: periodLabel });
  const tokensLabel = t('dashboard.period_tokens', { period: periodLabel });
  const costLabel = t('dashboard.period_cost', { period: periodLabel });
  const scopeLabel = isAdmin
    ? t('dashboard.scope_admin')
    : t('dashboard.scope_user');
  const modelDetailHint = t('dashboard.model_detail_recent');
  const [cardHeight, setCardHeight] = useState(580);
  const [isModel30dView, setIsModel30dView] = useState(false);
  const [modelStats30d, setModelStats30d] = useState<ModelTrend30dResponse | null>(null);
  const [loading30d, setLoading30d] = useState(false);

  const fetchModelStats30d = async () => {
    setLoading30d(true);
    try {
      const data = await (request.get<ModelTrend30dResponse>('/dashboard/models_30d') as unknown as Promise<ModelTrend30dResponse>);
      setModelStats30d(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading30d(false);
    }
  };

  useEffect(() => {
    if (isModel30dView && !modelStats30d) {
      fetchModelStats30d();
    }
  }, [isModel30dView]);

  useEffect(() => {
    const handleResize = () => {
      const announcementOffset = pinnedAnnouncement ? 70 : 0;
      const calculated = window.innerHeight - 470 - announcementOffset;
      setCardHeight(Math.max(450, calculated));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pinnedAnnouncement]);

  const isDark = !_isLight;
  const textColor = isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)';

  const getRankBadgeStyle = (index: number) => {
    const base: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      borderRadius: '50%',
      fontWeight: 'bold',
      fontSize: 10,
      marginRight: 8,
      color: '#fff',
      flexShrink: 0,
    };
    if (index === 0) {
      return {
        ...base,
        background: 'linear-gradient(135deg, #FFE066 0%, #F5A623 100%)',
        boxShadow: '0 1px 4px rgba(245, 166, 35, 0.3)',
      };
    }
    if (index === 1) {
      return {
        ...base,
        background: 'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%)',
        boxShadow: '0 1px 4px rgba(148, 163, 184, 0.3)',
      };
    }
    if (index === 2) {
      return {
        ...base,
        background: 'linear-gradient(135deg, #FDBA74 0%, #C2410C 100%)',
        boxShadow: '0 1px 4px rgba(194, 65, 12, 0.3)',
      };
    }
    return {
      ...base,
      background: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e8e8e8',
      color: textColor,
    };
  };

  const getBarColor = (index: number) => {
    if (index === 0) return 'linear-gradient(90deg, #F5A623 0%, #FFE066 100%)';
    if (index === 1) return 'linear-gradient(90deg, #94A3B8 0%, #CBD5E1 100%)';
    if (index === 2) return 'linear-gradient(90deg, #C2410C 0%, #FDBA74 100%)';
    return 'linear-gradient(90deg, #18181b 0%, #52525b 100%)';
  };

  const fetchStats = async () => {
    try {
      const params: any = {};
      Object.assign(params, toCalendarDateRangeParams(dateRange));
      const data = await (request.get<DashboardStats>('/dashboard', { params }) as unknown as Promise<DashboardStats>);
      setStats(data);
      if (data.live_metrics) {
        setLiveMetrics(data.live_metrics);
      }
    } catch (error) {
      console.error(error);
      void fetchLiveMetrics();
    }
  };

  const fetchLiveMetrics = async () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    try {
      const data = await (request.get<LiveMetricsResponse>('/metrics/live') as unknown as Promise<LiveMetricsResponse>);
      setLiveMetrics(data.metrics);
    } catch (error) {
      // 实时指标失败不阻断看板
      console.error(error);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStats().finally(() => {
      if (!cancelled) {
        setLoading(false);
        setLiveMetricsReady(true);
      }
    });
    // 与后端 dashboard SWR 缓存 TTL（180s）对齐，减轻 logs 大表聚合压力
    const timer = setInterval(fetchStats, 180000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dateRange]);

  useEffect(() => {
    const timer = setInterval(fetchLiveMetrics, 5000);
    const onVis = () => {
      if (!document.hidden) fetchLiveMetrics();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // 看板主数据与实时指标都结束后再通知布局弹公告，避免加载过程中反复闪屏
  useEffect(() => {
    if (loading || !liveMetricsReady) return;
    notifyConsolePageReady?.();
  }, [loading, liveMetricsReady, notifyConsolePageReady]);

  const columns = [
    {
      title: t('dashboard.recent_activity_time', { defaultValue: 'Time' }),
      key: 'time_status',
      align: 'center' as const,
      render: (log: RequestLog) => (
        <Space direction="vertical" size={2} align="center">
          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 13 }}>
            {dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Text>
          <span style={{ 
            display: 'inline-block',
            width: 'fit-content',
            background: log.status_code === 200 ? (_isLight ? 'rgba(82, 196, 26, 0.1)' : 'rgba(255,255,255,0.1)') : 'rgba(255,0,0,0.1)', 
            color: log.status_code === 200 ? (_isLight ? '#52c41a' : '#ccc') : '#ff4d4f',
            padding: '1px 6px', 
            borderRadius: 4, 
            fontSize: 11 
          }}>
            {log.status_code}
          </span>
        </Space>
      ),
    },
    ...(isAdmin
      ? [
          {
            title: t('dashboard.recent_activity_user', '用户'),
            key: 'user',
            render: (log: RequestLog) => {
              const displayName = log.user_nickname || log.user_uid || log.user_id || '-';
              return log.user_uid ? (
                <Link to={`/${adminPath}/users/${log.user_uid}/basic`} style={{ fontSize: 13, fontWeight: 500 }}>
                  {displayName}
                </Link>
              ) : (
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 13 }}>
                  {displayName}
                </Text>
              );
            },
          },
        ]
      : []),
    {
      title: t('channels.type'),
      dataIndex: 'model',
      key: 'model',
      render: (text: string) => (
        <span style={{ background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, color: _isLight ? '#333' : '#ccc', fontSize: 13 }}>
          {text}
        </span>
      ),
    },
    {
      title: 'Tokens',
      key: 'tokens',
      render: (log: RequestLog) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>In: {log.prompt_tokens}</Text>
          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>Out: {log.completion_tokens}</Text>
        </Space>
      ),
    },
    {
      title: t('dashboard.estimated_cost'),
      dataIndex: 'cost',
      key: 'cost',
      render: (val: number) => <Text style={{ color: _isLight ? '#333' : '#ccc', fontSize: 13 }}>{currencySymbol}{val.toFixed(6)}</Text>,
    },
  ];

  const cardStyle: React.CSSProperties = {
    height: screens.xs ? 180 : 210,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    borderRadius: 12,
  };

  const metricLabelStyle: React.CSSProperties = {
    color: _isLight ? '#666' : '#888',
    fontSize: screens.xs ? 11 : 13,
    fontWeight: 500,
  };

  const metricValueStyle: React.CSSProperties = {
    margin: '4px 0 0 0',
    color: _isLight ? '#1f2937' : '#fff',
    fontWeight: 500,
    fontSize: screens.xs ? 18 : 26,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
  };

  const metricSubStyle: React.CSSProperties = {
    color: _isLight ? '#666' : '#888',
    fontSize: screens.xs ? 10 : 12,
  };

  const liveMetricItems = [
    { key: 'qps', label: t('dashboard.live_qps'), tip: t('dashboard.live_qps_tip'), value: liveMetrics?.qps ?? 0 },
    { key: 'rpm', label: t('dashboard.live_rpm'), tip: t('dashboard.live_rpm_tip'), value: liveMetrics?.rpm ?? 0 },
    { key: 'tpm', label: t('dashboard.live_tpm'), tip: t('dashboard.live_tpm_tip'), value: liveMetrics?.tpm ?? 0 },
    { key: 'task', label: t('dashboard.live_task'), tip: t('dashboard.live_task_tip'), value: liveMetrics?.task ?? 0 },
  ];

  const backgroundIconStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: screens.xs ? '48px' : '64px',
    color: _isLight ? 'rgba(0, 0, 0, 0.025)' : 'rgba(255, 255, 255, 0.03)',
    pointerEvents: 'none',
    zIndex: 0,
  };



  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      {!isModel30dView && (
      <>
      {pinnedAnnouncement && (
        <div
          className="compact-announcement-banner"
          onMouseEnter={() => setIsPinnedBannerHovered(true)}
          onMouseLeave={() => setIsPinnedBannerHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            height: screens.xs ? 'auto' : '64px',
            minHeight: '64px',
            padding: '8px 14px',
            marginBottom: 10,
            borderRadius: '8px',
            background: _isLight ? 'rgba(24, 24, 27, 0.03)' : 'rgba(250, 250, 250, 0.04)',
            border: _isLight ? '1px solid rgba(24, 24, 27, 0.08)' : '1px solid rgba(250, 250, 250, 0.1)',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
            transition: 'all 0.2s ease',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flex: 1,
              minWidth: 0,
              cursor: isNoticeTruncated ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (isNoticeTruncated) {
                handleOpenNoticeDetail(pinnedAnnouncement);
              }
            }}
          >
            {/* Custom Bell Icon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: _isLight ? 'rgba(24, 24, 27, 0.06)' : 'rgba(255, 255, 255, 0.08)',
                color: _isLight ? '#18181b' : '#fafafa',
                flexShrink: 0,
              }}
            >
              <BellOutlined style={{ fontSize: '15px' }} />
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
              <span
                ref={noticeTitleRef}
                style={{
                  fontWeight: 600,
                  fontSize: '13px',
                  lineHeight: '18px',
                  color: _isLight ? '#18181b' : '#f4f4f5',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {getAnnouncementLabel(pinnedAnnouncement.title)}
              </span>
              <div
                ref={noticeContentRef}
                className="quill-content compact-announcement"
                dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(pinnedAnnouncement.content) }}
                style={{
                  fontSize: '12px',
                  lineHeight: '15px',
                  maxHeight: '30px',
                  color: _isLight ? '#52525b' : '#a1a1aa',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  wordBreak: 'break-word',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {isNoticeTruncated && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenNoticeDetail(pinnedAnnouncement);
                }}
                style={{
                  padding: '0 2px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: _isLight ? '#52525b' : '#a1a1aa',
                  textDecoration: 'none',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = _isLight ? '#18181b' : '#fafafa'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = _isLight ? '#52525b' : '#a1a1aa'; }}
              >
                {t('dashboard.view_detail', '详情')}
              </button>
            )}

            {/* 多条置顶通知时展示可点击切换的小圆点 */}
            {pinnedAnnouncements.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                  paddingLeft: '2px',
                }}
              >
                {pinnedAnnouncements.map((_, idx) => {
                  const isActive = idx === currentPinnedIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentPinnedIndex(idx);
                        try {
                          sessionStorage.setItem('last_dashboard_pinned_id', String(pinnedAnnouncements[idx]?.id));
                        } catch {}
                      }}
                      aria-label={`切换到第 ${idx + 1} 条置顶通知`}
                      style={{
                        padding: 0,
                        border: 'none',
                        cursor: 'pointer',
                        height: '5px',
                        width: isActive ? '14px' : '5px',
                        borderRadius: '9999px',
                        backgroundColor: isActive
                          ? _isLight
                            ? '#18181b'
                            : '#fafafa'
                          : _isLight
                            ? 'rgba(0, 0, 0, 0.18)'
                            : 'rgba(255, 255, 255, 0.22)',
                        transition: 'all 0.2s ease',
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 系统概览标题与过滤工具栏 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={2} style={{ margin: 0, fontWeight: 600, color: _isLight ? '#1f2937' : '#E8EAED' }}>
            {t('dashboard.title')}
          </Title>
          <Tag
            style={{
              marginLeft: 12,
              marginRight: 0,
              borderRadius: 6,
              border: _isLight ? '1px solid rgba(24,24,27,0.12)' : '1px solid rgba(255,255,255,0.16)',
              background: _isLight ? 'rgba(24,24,27,0.04)' : 'rgba(255,255,255,0.06)',
              color: _isLight ? '#52525b' : '#a1a1aa',
              fontWeight: 500,
            }}
          >
            {scopeLabel}
          </Tag>
          <AntTooltip title={t('dashboard.view_30d_trend', '查看 30 天趋势')}>
            <LineChartIcon
              size={24}
              strokeWidth={2}
              className="shadcn-icon-btn"
              style={{
                marginLeft: 12,
                color: _isLight ? '#000000' : '#ffffff',
                cursor: 'pointer',
              }}
              onClick={() => setIsModel30dView(true)}
            />
          </AntTooltip>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Radio.Group value={quickRange} onChange={handleQuickRangeChange} style={{ display: 'flex', flexWrap: 'wrap' }}>
            <Radio.Button value="today">{t('dashboard.today', '今天')}</Radio.Button>
            <Radio.Button value="yesterday">{t('dashboard.yesterday', '昨日')}</Radio.Button>
            <Radio.Button value="week">{t('dashboard.week', '本周')}</Radio.Button>
            <Radio.Button value="month">{t('dashboard.month', '本月')}</Radio.Button>
            <Radio.Button value="last_month">{t('dashboard.last_month', '上月')}</Radio.Button>
          </Radio.Group>
          <RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            allowClear={false}
            style={{ width: screens.xs ? '100%' : 260 }}
          />
        </div>
      </div>

      {/* 概览仪表盘：消耗 Token | 预估成本 | 请求+令牌 | 实时吞吐 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 16 : 24, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <DatabaseOutlined style={backgroundIconStyle} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{tokensLabel}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stats?.total_tokens?.toLocaleString() || '0'}>{stats?.total_tokens?.toLocaleString() || 0}</Title>
                {showDayComparison && (
                  <>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.today')}: {stats?.today_tokens?.toLocaleString() || 0}</Text>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.yesterday')}: {stats?.yesterday_tokens?.toLocaleString() || 0}</Text>
                  </>
                )}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 16 : 24, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <AccountBookOutlined style={backgroundIconStyle} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 14, fontWeight: 500 }}>{costLabel}</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0 0' }}>
                <Title level={2} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, fontSize: screens.xs ? 18 : 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${currencySymbol}${stats?.total_cost?.toFixed(6) || 0}`}>{currencySymbol}{stats?.total_cost?.toFixed(6) || 0}</Title>
                {showDayComparison && (
                  <>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.today')}: {currencySymbol}{(stats?.today_cost || 0).toFixed(6)}</Text>
                    <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 11 : 13 }}>{t('dashboard.yesterday')}: {currencySymbol}{(stats?.yesterday_cost || 0).toFixed(6)}</Text>
                  </>
                )}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 14 : 20, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <BarChartOutlined style={backgroundIconStyle} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Text style={metricLabelStyle}>{requestsLabel}</Text>
                <Title level={2} style={metricValueStyle} title={String(stats?.total_requests || 0)}>
                  {stats?.total_requests || 0}
                </Title>
                {showDayComparison && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 2 }}>
                    <Text style={metricSubStyle}>{t('dashboard.today')}: {stats?.today_requests || 0}</Text>
                    <Text style={metricSubStyle}>{t('dashboard.yesterday')}: {stats?.yesterday_requests || 0}</Text>
                  </div>
                )}
              </div>
              <Divider style={{ margin: 0, borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <Text style={metricLabelStyle}>{t('dashboard.total_api_tokens', '总令牌')}</Text>
                <Title level={2} style={{ ...metricValueStyle, fontSize: screens.xs ? 16 : 22 }} title={String(stats?.total_api_tokens || 0)}>
                  {stats?.total_api_tokens || 0}
                </Title>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 2 }}>
                  <Text style={metricSubStyle}>{t('dashboard.today_active')}: {stats?.today_active_tokens || 0}</Text>
                  <Text style={metricSubStyle}>{t('dashboard.yesterday_active')}: {stats?.yesterday_active_tokens || 0}</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={cardStyle}
            styles={{ body: { padding: screens.xs ? 14 : 18, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' } }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <Text style={{ color: _isLight ? '#666' : '#888', fontSize: screens.xs ? 12 : 13, fontWeight: 500 }}>
                  {t('dashboard.live_throughput')}
                </Text>
                <Tag style={{ margin: 0, lineHeight: '18px', fontSize: 11 }}>{t('dashboard.live_tag')}</Tag>
              </div>
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gridTemplateRows: '1fr 1fr',
                  gap: screens.xs ? 8 : 10,
                }}
              >
                {liveMetricItems.map((item) => (
                  <AntTooltip key={item.key} title={item.tip}>
                    <div style={{ minWidth: 0 }}>
                      <Text style={metricSubStyle}>{item.label}</Text>
                      <Title
                        level={4}
                        style={{
                          margin: '2px 0 0 0',
                          color: _isLight ? '#1f2937' : '#fff',
                          fontWeight: 500,
                          fontSize: screens.xs ? 15 : 20,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {Number(item.value).toLocaleString()}
                      </Title>
                    </div>
                  </AntTooltip>
                ))}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col lg={14} xs={24}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.recent_activity')}</Title>
            <Text type="secondary" style={{ color: _isLight ? '#999' : '#666', fontSize: 13 }}>{t('dashboard.auto_refresh')}</Text>
          </div>
          <Card 
            variant="borderless" 
            style={{ 
              borderRadius: 12, 
              height: screens.xs ? 'auto' : cardHeight, 
              display: 'flex', 
              flexDirection: 'column',
              background: screens.xs ? 'transparent' : undefined,
              boxShadow: screens.xs ? 'none' : undefined
            }} 
            styles={{ body: { padding: 0, flex: 1, overflowY: screens.xs ? 'auto' : 'hidden' } }}
          >
            {screens.xs ? (
              <MobileCardList
                dataSource={stats?.recent_logs || []}
                loading={loading}
                rowKey="id"
                compact={true}
                gap={4}
                renderCard={(item) => (
                  <MobileCard
                    compact={true}
                    style={{ background: _isLight ? '#fff' : '#141414', border: 'none' }}
                    title={
                      <span style={{ background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, color: _isLight ? '#333' : '#ccc', fontSize: 11 }}>
                        {item.model}
                      </span>
                    }
                    extra={
                      <span style={{ 
                        background: item.status_code === 200 ? (_isLight ? 'rgba(82, 196, 26, 0.1)' : 'rgba(255,255,255,0.1)') : 'rgba(255,0,0,0.1)', 
                        color: item.status_code === 200 ? (_isLight ? '#52c41a' : '#ccc') : '#ff4d4f',
                        padding: '1px 6px', 
                        borderRadius: 4, 
                        fontSize: 11 
                      }}>
                        {item.status_code}
                      </span>
                    }
                  >
                    <CardRow compact={true} label={t('dashboard.recent_activity_time', { defaultValue: 'Time' })}>
                      <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>{dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    </CardRow>
                    {isAdmin && (
                      <CardRow compact={true} label={t('dashboard.recent_activity_user', '用户')}>
                        {item.user_uid ? (
                          <Link to={`/${adminPath}/users/${item.user_uid}/basic`} style={{ fontSize: 12, fontWeight: 500 }}>
                            {item.user_nickname || item.user_uid || item.user_id || '-'}
                          </Link>
                        ) : (
                          <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>
                            {item.user_nickname || item.user_uid || item.user_id || '-'}
                          </Text>
                        )}
                      </CardRow>
                    )}
                    <CardRow compact={true} label={t('dashboard.recent_activity_tokens', 'Tokens (In / Out)')}>
                      <Text style={{ color: _isLight ? '#666' : '#888', fontSize: 12 }}>{item.prompt_tokens} / {item.completion_tokens}</Text>
                    </CardRow>
                    <CardRow compact={true} label={t('dashboard.estimated_cost')}>
                      <Text style={{ color: _isLight ? '#333' : '#ccc', fontSize: 12, fontWeight: 500 }}>{currencySymbol}{(item.cost || 0).toFixed(6)}</Text>
                    </CardRow>
                  </MobileCard>
                )}
              />
            ) : (
              <Table
                dataSource={stats?.recent_logs || []}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="middle"
                loading={loading}
                locale={{ emptyText: <Text style={{ color: _isLight ? '#999' : '#888' }}>{t('dashboard.no_data')}</Text> }}
                scroll={{ y: cardHeight - 48, x: 'max-content' }}
                style={{ borderRadius: 12, overflow: 'hidden', border: 'none' }}
              />
            )}
          </Card>
        </Col>
        
        <Col lg={10} xs={24}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
            <Title level={5} style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500, margin: 0 }}>{t('dashboard.model_distribution')}</Title>
            <Text type="secondary" style={{ color: _isLight ? '#999' : '#666', fontSize: 12 }}>{modelDetailHint}</Text>
            <AntTooltip title="查看最近 30 天分布详细数据">
              <PieChartIcon 
                size={18}
                strokeWidth={2}
                className="shadcn-icon-btn"
                style={{ 
                  marginLeft: 2, 
                  color: _isLight ? '#000000' : '#ffffff', 
                  cursor: 'pointer' 
                }} 
                onClick={() => setIsModel30dView(true)}
              />
            </AntTooltip>
          </div>
          <Card 
            variant="borderless" 
            style={{ borderRadius: 12, height: screens.xs ? 'auto' : cardHeight, display: 'flex', flexDirection: 'column' }} 
            styles={{ body: { padding: '16px 20px', flex: 1, overflowY: 'hidden' } }}
          >
            <Spin spinning={loading}>
              <div 
                className="custom-scrollbar"
                style={{ 
                  height: screens.xs ? 'auto' : cardHeight - 64, 
                  overflowY: 'auto', 
                  paddingRight: 8 
                }}
              >
                {stats?.model_stats && stats.model_stats.length > 0 ? (
                  (() => {
                    const maxCost = stats.model_stats.reduce((max, item) => Math.max(max, item.total_cost), 0) || 1;
                    return stats.model_stats.map((item, index) => {
                      const percentage = (item.total_cost / maxCost) * 100;
                      return (
                        <div 
                          key={item.model} 
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            padding: '10px 2px',
                            borderBottom: index === stats.model_stats.length - 1 
                              ? 'none' 
                              : (_isLight ? '1px dashed #e8e8e8' : '1px dashed rgba(255, 255, 255, 0.08)'),
                            transition: 'all 0.3s ease',
                          }}
                        >
                          {/* Main Row */}
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {/* Rank Badge */}
                            <div style={getRankBadgeStyle(index)}>{index + 1}</div>
                            
                            {/* Info & Progress bar */}
                            <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: _isLight ? '#1f2937' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                                  {item.model}
                                </span>
                                <span style={{ fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
                                  {t('dashboard.count_times', { count: item.count })}
                                </span>
                              </div>
                              {/* Progress Bar Container */}
                              <div style={{ 
                                height: 4, 
                                borderRadius: 2, 
                                background: _isLight ? '#f5f5f5' : 'rgba(255,255,255,0.06)', 
                                overflow: 'hidden' 
                              }}>
                                <div style={{ 
                                  height: '100%', 
                                  width: `${percentage}%`, 
                                  borderRadius: 2, 
                                  background: getBarColor(index),
                                  transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' 
                                }} />
                              </div>
                            </div>

                            {/* Cost Display */}
                            <div style={{ width: 110, textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ 
                                fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', 
                                fontWeight: 700, 
                                color: index === 0 ? '#F5A623' : (_isLight ? '#1f2937' : '#fff'),
                                fontSize: 14 
                              }}>
                                {currencySymbol}{Number(item.total_cost).toFixed(6)}
                              </span>
                            </div>
                          </div>

                          {/* Last 3 Days Row */}
                          {item.last_three_days && item.last_three_days.length > 0 && (
                            <div style={{ 
                              display: 'flex', 
                              gap: 6, 
                              marginTop: 6, 
                              paddingLeft: 28, 
                              flexWrap: 'wrap' 
                            }}>
                              {item.last_three_days.map((day) => {
                                const dateLabel = day.date.slice(5);
                                return (
                                  <div 
                                    key={day.date} 
                                    style={{ 
                                      background: !_isLight ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                      borderRadius: 4,
                                      padding: '1px 6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: 10,
                                    }}
                                  >
                                    <span style={{ color: !_isLight ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontWeight: 500 }}>
                                      {dateLabel}
                                    </span>
                                    <span style={{ color: index === 0 ? '#faad14' : textColor, fontFamily: 'monospace', fontWeight: 600 }}>
                                      {currencySymbol}{day.total_cost.toFixed(6)}
                                    </span>
                                    <span style={{ color: !_isLight ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', fontSize: 9 }}>
                                      ({t('dashboard.times', { count: day.count })})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: _isLight ? '#999' : '#888', minHeight: 400 }}>
                    {t('dashboard.no_data')}
                  </div>
                )}
              </div>
            </Spin>
          </Card>
        </Col>
      </Row>
      </>
      )}

      {isModel30dView && (
        <ModelDistribution30d
          data={modelStats30d}
          loading={loading30d}
          currencySymbol={currencySymbol}
          onBack={() => setIsModel30dView(false)}
        />
      )}
      
      {/* Global override for table styles to ensure monochrome dark theme */}
      <style>{`
        .shadcn-icon-btn {
          opacity: 0.85;
          transition: all 0.2s ease-in-out;
        }
        .shadcn-icon-btn:hover {
          opacity: 1;
          transform: scale(1.08);
        }
        .shadcn-icon-btn:active {
          transform: scale(0.95);
        }
        .ant-progress-text {
          color: ${_isLight ? '#666' : '#888'} !important;
        }
        .compact-announcement p,
        .compact-announcement h1,
        .compact-announcement h2,
        .compact-announcement h3,
        .compact-announcement h4,
        .compact-announcement h5,
        .compact-announcement h6,
        .compact-announcement ul,
        .compact-announcement ol,
        .compact-announcement li {
          margin: 0 !important;
          padding: 0 !important;
          display: inline !important;
          line-height: inherit !important;
          font-size: inherit !important;
          font-weight: inherit !important;
        }
        .compact-announcement img {
          display: none !important;
        }
        .custom-scrollbar::-webkit-scrollbar,
        .ant-card-body::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track,
        .ant-card-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb,
        .ant-card-body::-webkit-scrollbar-thumb {
          background: ${_isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'};
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover,
        .ant-card-body::-webkit-scrollbar-hover {
          background: ${_isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'};
        }
      `}</style>

      {/* 单条通知详情弹窗 */}
      <Modal
        closable={false}
        open={isNoticeModalOpen && !!selectedNoticeForModal}
        onCancel={() => {
          setIsNoticeModalOpen(false);
          setSelectedNoticeForModal(null);
        }}
        footer={null}
        width={640}
        centered
        styles={{
          content: {
            padding: 0,
            borderRadius: '12px',
            background: _isLight ? '#ffffff' : '#18181b',
            border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
            boxShadow: _isLight
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
              : '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden',
          },
          body: {
            padding: 0,
          },
        } as any}
      >
        {selectedNoticeForModal && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* 弹窗顶部 Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                padding: '20px 24px 16px',
                borderBottom: _isLight ? '1px solid #f4f4f5' : '1px solid #27272a',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Tag
                    style={{
                      margin: 0,
                      borderRadius: 4,
                      fontSize: '12px',
                      fontWeight: 500,
                      background: _isLight ? 'rgba(24, 24, 27, 0.08)' : 'rgba(255, 255, 255, 0.12)',
                      color: _isLight ? '#18181b' : '#f4f4f5',
                      border: 'none',
                    }}
                  >
                    {t('dashboard.pinned_notice', '置顶通知')}
                  </Tag>
                  {selectedNoticeForModal.created_at && (
                    <span style={{ fontSize: '12px', color: _isLight ? '#71717a' : '#a1a1aa' }}>
                      {dayjs(selectedNoticeForModal.created_at).format('YYYY-MM-DD HH:mm')}
                    </span>
                  )}
                </div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    color: _isLight ? '#09090b' : '#fafafa',
                    lineHeight: '1.4',
                    wordBreak: 'break-word',
                  }}
                >
                  {getAnnouncementLabel(selectedNoticeForModal.title)}
                </h3>
              </div>
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={() => {
                  setIsNoticeModalOpen(false);
                  setSelectedNoticeForModal(null);
                }}
                style={{
                  color: _isLight ? '#71717a' : '#a1a1aa',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                }}
              />
            </div>

            {/* 弹窗内容主体 */}
            <div
              className="custom-scrollbar quill-content"
              style={{
                padding: '20px 24px',
                maxHeight: '55vh',
                overflowY: 'auto',
                fontSize: '14px',
                lineHeight: '1.6',
                color: _isLight ? '#27272a' : '#d4d4d8',
              }}
              dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(selectedNoticeForModal.content) }}
            />

            {/* 弹窗底部操作 Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                borderTop: _isLight ? '1px solid #f4f4f5' : '1px solid #27272a',
                background: _isLight ? '#fafafa' : '#141416',
              }}
            >
              <div>
                {pinnedAnnouncements.length > 1 && (
                  <span style={{ fontSize: '12px', color: _isLight ? '#71717a' : '#a1a1aa' }}>
                    {pinnedAnnouncements.findIndex((a) => a.id === selectedNoticeForModal.id) + 1} / {pinnedAnnouncements.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pinnedAnnouncements.length > 1 && (
                  <>
                    <Button
                      size="small"
                      disabled={pinnedAnnouncements.findIndex((a) => a.id === selectedNoticeForModal.id) <= 0}
                      onClick={() => {
                        const curIdx = pinnedAnnouncements.findIndex((a) => a.id === selectedNoticeForModal.id);
                        if (curIdx > 0) {
                          setSelectedNoticeForModal(pinnedAnnouncements[curIdx - 1]);
                        }
                      }}
                      style={{
                        borderRadius: 6,
                        fontSize: '12px',
                      }}
                    >
                      {t('common.prev', '上一条')}
                    </Button>
                    <Button
                      size="small"
                      disabled={pinnedAnnouncements.findIndex((a) => a.id === selectedNoticeForModal.id) >= pinnedAnnouncements.length - 1}
                      onClick={() => {
                        const curIdx = pinnedAnnouncements.findIndex((a) => a.id === selectedNoticeForModal.id);
                        if (curIdx < pinnedAnnouncements.length - 1) {
                          setSelectedNoticeForModal(pinnedAnnouncements[curIdx + 1]);
                        }
                      }}
                      style={{
                        borderRadius: 6,
                        fontSize: '12px',
                      }}
                    >
                      {t('common.next', '下一条')}
                    </Button>
                  </>
                )}
                <Button
                  type="primary"
                  onClick={() => {
                    setIsNoticeModalOpen(false);
                    setSelectedNoticeForModal(null);
                  }}
                  style={{
                    borderRadius: 6,
                    fontWeight: 500,
                    fontSize: '13px',
                    height: '32px',
                    background: _isLight ? '#18181b' : '#fafafa',
                    color: _isLight ? '#fafafa' : '#18181b',
                    border: 'none',
                  }}
                >
                  {t('common.close', '关闭')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
