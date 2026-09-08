/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  App,
  DatePicker,
  Tooltip,
  theme,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  CopyOutlined,
  CheckOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { SorterResult } from 'antd/es/table/interface';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import request from '../../../utils/request';
import { formatApiDateTime } from '../../../utils/timedisplay';
import { useThemeStore } from '../../../store/theme';
import { copyToClipboard } from '../../../utils/clipboard';

const { Text } = Typography;

interface HaPool {
  bind: number;
  live: number;
  off?: number;
  melt?: number;
  quota?: number;
  excl?: number;
  gone?: number;
}

interface HaAttempt {
  n: number;
  yid?: string;
  name?: string;
  status: number;
  /** 上游业务错误码（如 MissingParameter） */
  code?: string;
  error?: string;
  url?: string;
  ms: number;
  ok: number;
  /** 停切原因（写在末次 snap） */
  end?: string;
  /** 选该次子渠时的池快照 */
  pool?: HaPool;
}

function formatHaPool(p?: HaPool): string | null {
  if (!p) return null;
  const why = [
    p.melt && `熔断${p.melt}`,
    p.off && `禁用${p.off}`,
    p.quota && `额度${p.quota}`,
    p.excl && `本轮已排除${p.excl}`,
    p.gone && `库中缺失${p.gone}`,
  ].filter(Boolean);
  const filtered = Math.max(0, p.bind - (p.live || 0));
  const head = `绑定 ${p.bind} · 可调度 ${p.live} · 过滤 ${filtered}`;
  return why.length ? `${head}（${why.join(' · ')}）` : head;
}

interface HaLog {
  log_id: number;
  biz_log_id?: string;
  group_aid?: string;
  attempt_count: number;
  final_ok: number;
  final_status_code: number;
  attempts: HaAttempt[];
  created_at: string;
  user_uid?: string;
  user_nickname?: string;
  channel_name?: string;
  model?: string;
  status_code?: number;
}

/** 紧凑复制标签组件 */
const CopyTag: React.FC<{
  text: string;
  label?: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
}> = ({ text, label, title, style }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!text) return <span style={{ opacity: 0.4 }}>-</span>;

  return (
    <Tooltip title={copied ? '已复制' : (title || `点击复制: ${text}`)}>
      <span
        onClick={handleCopy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 12,
          padding: '1px 6px',
          borderRadius: 4,
          background: 'rgba(128, 128, 128, 0.08)',
          border: '1px solid rgba(128, 128, 128, 0.2)',
          transition: 'all 0.15s ease',
          ...style,
        }}
      >
        <span>{label ?? text}</span>
        {copied ? (
          <CheckOutlined style={{ fontSize: 11, color: '#52c41a', flexShrink: 0 }} />
        ) : (
          <CopyOutlined style={{ fontSize: 11, opacity: 0.5, flexShrink: 0 }} />
        )}
      </span>
    </Tooltip>
  );
};

const HaLogs: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const [logs, setLogs] = useState<HaLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>(() => [
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchLogs = useCallback(
    async (opt?: {
      p?: number;
      size?: number;
      kw?: string;
      range?: typeof dateRange;
      sb?: string;
      so?: 'asc' | 'desc';
    }) => {
      const p = opt?.p ?? page;
      const size = opt?.size ?? pageSize;
      const kw = opt?.kw ?? keyword;
      const range = opt?.range ?? dateRange;
      const sb = opt?.sb ?? sortBy;
      const so = opt?.so ?? sortOrder;

      try {
        setLoading(true);
        const res = (await request.get('/plugins/high_availability_channel/ha-logs', {
          params: {
            page: p,
            page_size: size,
            keyword: kw.trim() || undefined,
            date_from: range[0] ? range[0].format('YYYY-MM-DD') : undefined,
            date_to: range[1] ? range[1].format('YYYY-MM-DD') : undefined,
            sort_by: sb,
            sort_order: so,
          },
        })) as { logs?: HaLog[]; total?: number; page?: number; page_size?: number };
        setLogs(res?.logs || []);
        setTotal(res?.total || 0);
        setPage(res?.page || p);
        setPageSize(res?.page_size || size);
      } catch (e: any) {
        message.error(e?.message || '加载高可用日志失败');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, keyword, dateRange, sortBy, sortOrder, message]
  );

  useEffect(() => {
    fetchLogs({ p: 1, so: 'desc' });
  }, []);

  const handleSearch = () => {
    fetchLogs({ p: 1 });
  };

  const handleReset = () => {
    const range: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs().startOf('day'), dayjs().endOf('day')];
    setKeyword('');
    setDateRange(range);
    fetchLogs({ p: 1, kw: '', range });
  };

  const handleTableChange = (
    _: any,
    __: any,
    sorter: SorterResult<HaLog> | SorterResult<HaLog>[]
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const sb = s.order ? (s.field as string) : undefined;
    const so: 'asc' | 'desc' = s.order === 'ascend' ? 'asc' : 'desc';
    setSortBy(sb);
    setSortOrder(so);
    fetchLogs({ sb, so });
  };

  const columns: ColumnsType<HaLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 175,
      render: (v: string) => (
        <span
          style={{
            fontFamily: 'SFMono-Regular, Consolas, monospace',
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {formatApiDateTime(v)}
        </span>
      ),
    },
    {
      title: '结果',
      width: 90,
      render: (_: unknown, r: HaLog) => {
        const isOk = Boolean(
          r.final_ok === 1 || (r.status_code && r.status_code >= 200 && r.status_code < 300)
        );
        const code = r.final_status_code || r.status_code || (isOk ? 200 : 500);
        return (
          <Tag
            color={isOk ? 'success' : 'error'}
            style={{ margin: 0, fontWeight: 600, fontSize: 12 }}
          >
            {code} {isOk ? '成功' : '失败'}
          </Tag>
        );
      },
    },
    {
      title: (
        <Tooltip title="本请求实际打到的子渠次数，不是规则里的「最大尝试」；展开可看停切原因">
          实际尝试
        </Tooltip>
      ),
      dataIndex: 'attempt_count',
      width: 95,
      sorter: true,
      render: (count: number, r: HaLog) => {
        const c = count || 1;
        const attempts = Array.isArray(r.attempts) ? r.attempts : [];
        const stop = attempts[attempts.length - 1]?.end;
        const poolTip = formatHaPool(attempts[attempts.length - 1]?.pool);
        const tip = [
          stop ? `实际 ${c} 次 · 停因：${stop}` : `实际尝试 ${c} 次（非配置上限）`,
          poolTip,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Tooltip title={tip}>
            <Tag
              color={c > 1 ? 'warning' : 'default'}
              style={{ margin: 0, fontWeight: c > 1 ? 600 : undefined, fontSize: 12, opacity: c > 1 ? undefined : 0.85 }}
            >
              {c} 次
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '请求模型',
      dataIndex: 'model',
      width: 250,
      render: (m?: string) =>
        m ? (
          <span
            style={{
              fontFamily: 'SFMono-Regular, Consolas, monospace',
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {m}
          </span>
        ) : (
          <span style={{ opacity: 0.4 }}>-</span>
        ),
    },
    {
      title: '命中渠道 / 组',
      width: 210,
      render: (_: unknown, r: HaLog) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            {r.channel_name || '-'}
          </div>
          {r.group_aid ? (
            <div
              style={{
                fontSize: 11,
                opacity: 0.65,
                fontFamily: 'SFMono-Regular, Consolas, monospace',
                marginTop: 2,
              }}
            >
              组: {r.group_aid}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '调用用户',
      width: 120,
      render: (_: unknown, r: HaLog) => {
        const name = r.user_nickname || r.user_uid || '-';
        const uid = r.user_uid;
        return (
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{name}</div>
            {uid && uid !== name ? (
              <div style={{ marginTop: 2 }}>
                <CopyTag text={uid} label={uid} style={{ fontSize: 10, padding: '0 4px' }} />
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: '业务日志 ID',
      width: 220,
      render: (_: unknown, r: HaLog) => {
        const bid = r.biz_log_id || (r.log_id ? `ID #${r.log_id}` : '');
        return bid ? <CopyTag text={r.biz_log_id || String(r.log_id)} label={bid} /> : <span style={{ opacity: 0.4 }}>-</span>;
      },
    },
  ];

  return (
    <div>
      {/* 顶部搜索与操作栏 */}
      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space wrap size={8}>
          <Input
            allowClear
            placeholder="日志ID / 用户 / 模型 / 组AID"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 250 }}
            prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) => setDateRange(v ? [v[0], v[1]] : [null, null])}
            style={{ width: 230 }}
            placeholder={['开始日期', '结束日期']}
            allowClear
          />
          <Button type="primary" onClick={handleSearch} loading={loading}>
            查询
          </Button>
          <Button onClick={handleReset}>
            重置
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchLogs()} loading={loading}>
            刷新
          </Button>
        </Space>

        <Text type="secondary" style={{ fontSize: 12 }}>
          共 <strong style={{ color: token.colorText }}>{total}</strong> 条高可用调用记录
        </Text>
      </div>

      {/* 高可用日志表格 */}
      <Table
        rowKey="log_id"
        loading={loading}
        dataSource={logs}
        columns={columns}
        size="small"
        scroll={{ x: 'max-content' }}
        onChange={handleTableChange}
        expandable={{
          columnWidth: 40,
          expandedRowRender: (row: HaLog) => {
            const attempts = Array.isArray(row.attempts) ? row.attempts : [];
            const stop = attempts[attempts.length - 1]?.end;
            const poolText = formatHaPool(attempts[attempts.length - 1]?.pool);
            return (
              <div
                style={{
                  padding: '10px 14px',
                  background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#fafafa',
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                {/* 链路标题与摘要：全部紧凑靠左依次排列 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 8,
                    paddingBottom: 6,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>高可用调度链路轨迹</span>
                  <Tag color={attempts.length > 1 ? 'warning' : 'blue'} style={{ margin: 0 }}>
                    共调度 {attempts.length} 次上游
                  </Tag>
                  {stop ? (
                    <Tag color="orange" style={{ margin: 0, maxWidth: '100%', whiteSpace: 'normal' }}>
                      停因：{stop}
                    </Tag>
                  ) : null}
                  {poolText ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {poolText}
                    </Text>
                  ) : null}
                  {row.biz_log_id ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.85 }}>
                      <span>业务日志:</span>
                      <CopyTag text={row.biz_log_id} />
                    </div>
                  ) : null}
                </div>

                {/* 调度轨迹节点 */}
                {!attempts.length ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    无子渠尝试明细数据
                  </Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {attempts.map((a, idx) => {
                      const isFirst = a.n === 1;
                      const isSuccess = Boolean(
                        a.ok === 1 || (a.status >= 200 && a.status < 300)
                      );
                      return (
                        <div
                          key={a.n || idx}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            background: isDark ? '#1a1a1a' : '#ffffff',
                            border: `1px solid ${
                              isSuccess
                                ? isDark
                                  ? 'rgba(82, 196, 26, 0.3)'
                                  : '#b7eb8f'
                                : isDark
                                  ? 'rgba(255, 77, 79, 0.3)'
                                  : '#ffa39e'
                            }`,
                          }}
                        >
                          {/* 节点第一行：状态、渠道、耗时依次排列 */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 8,
                            }}
                          >
                            <Tag
                              color={isFirst ? 'blue' : 'purple'}
                              style={{ margin: 0, fontWeight: 600 }}
                            >
                              {isFirst ? '#1 首选尝试' : `#${a.n} 容灾切换`}
                            </Tag>
                            <Tag
                              color={isSuccess ? 'success' : 'error'}
                              style={{ margin: 0, fontWeight: 600 }}
                            >
                              {a.status} {isSuccess ? '成功' : '失败'}
                            </Tag>
                            <Text strong style={{ fontSize: 13 }}>
                              {a.name || '未命名渠道'}
                            </Text>
                            {a.yid ? (
                              <Text
                                type="secondary"
                                style={{
                                  fontSize: 12,
                                  fontFamily: 'SFMono-Regular, Consolas, monospace',
                                }}
                              >
                                (YID: {a.yid})
                              </Text>
                            ) : null}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                opacity: 0.75,
                                fontSize: 12,
                                fontFamily: 'SFMono-Regular, Consolas, monospace',
                                marginLeft: 4,
                              }}
                            >
                              <ClockCircleOutlined style={{ fontSize: 11 }} />
                              {a.ms ?? 0} ms
                            </span>
                          </div>

                          {/* 节点报错：业务码 + 错误文案 */}
                          {a.code || a.error ? (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '6px 10px',
                                background: isDark ? 'rgba(255, 77, 79, 0.1)' : '#fff1f0',
                                border: '1px solid rgba(255, 77, 79, 0.2)',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 8,
                              }}
                            >
                              {a.code ? (
                                <Tag color="error" style={{ margin: 0, fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
                                  {a.code}
                                </Tag>
                              ) : null}
                              {a.error ? (
                                <div
                                  style={{
                                    color: '#ff4d4f',
                                    fontSize: 12,
                                    wordBreak: 'break-all',
                                    fontFamily: 'SFMono-Regular, Consolas, monospace',
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {a.error}
                                </div>
                              ) : null}
                              <CopyTag
                                text={[a.code, a.error].filter(Boolean).join(': ')}
                                label="复制错误"
                                style={{
                                  color: '#ff4d4f',
                                  borderColor: 'rgba(255, 77, 79, 0.35)',
                                  background: 'transparent',
                                }}
                              />
                            </div>
                          ) : null}

                          {/* 上游请求 URL */}
                          {a.url ? (
                            <div style={{ marginTop: 4 }}>
                              <Text
                                type="secondary"
                                style={{
                                  fontSize: 11,
                                  fontFamily: 'SFMono-Regular, Consolas, monospace',
                                  wordBreak: 'break-all',
                                }}
                              >
                                {a.url}
                              </Text>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          },
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['15', '30', '50', '100'],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, s) => fetchLogs({ p, size: s }),
        }}
      />
    </div>
  );
};

export default HaLogs;


