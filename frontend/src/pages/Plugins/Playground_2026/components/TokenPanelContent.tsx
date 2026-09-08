/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 令牌面板内容：逻辑/文案对齐创作中心 TokenModal，视觉用 Imagine 风格样式类
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckOutlined, CloseOutlined, Popconfirm } from '../ui';
import toast from './PlaygroundToast';
import type { ApiTokenItem } from '../utils/imageGenerationApi';
import {
  createApiToken,
  deleteApiToken,
  loadApiTokens,
  saveSelectedTokenKey,
} from '../utils/imageGenerationApi';
import useSettingsStore from '../../../../store/settings';
import useAuthStore from '../../../../store/auth';
import { formatApiDateTime } from '../../../../utils/timedisplay';
import { shouldBlockTokenCreate, tokenBindBlockMessage } from '../../../../utils/bindPolicy';
import { openWorkflowInNewTab } from '../../../../utils/authTabHandoff';

export type TokenPanelContentProps = {
  tokens: ApiTokenItem[];
  selectedTokenKey: string;
  onTokensChange: (tokens: ApiTokenItem[]) => void;
  onSelect: (tokenKey: string) => void;
  onClose: () => void;
  /** 选中后是否自动关闭面板（默认 true） */
  closeOnSelect?: boolean;
};

function maskTokenKey(key: string): string {
  if (!key) return '';
  const head = key.substring(0, 8);
  const tail = key.substring(Math.max(0, key.length - 6));
  return `${head}......${tail}`;
}

function formatQuota(tok: ApiTokenItem): { text: string; exceeded: boolean } {
  const limit = tok.quota_limit;
  if (limit == null) return { text: '-', exceeded: false };
  if (limit < 0) return { text: '不限额度', exceeded: false };
  const used = tok.quota_used ?? tok.used_quota ?? 0;
  const remain = Math.max(0, limit - used);
  const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));
  return { text: `${fmt(remain)} / ${fmt(limit)}`, exceeded: remain <= 0 };
}

const TokenPanelContent: React.FC<TokenPanelContentProps> = ({
  tokens,
  selectedTokenKey,
  onTokensChange,
  onSelect,
  onClose,
  closeOnSelect = true,
}) => {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const user = useAuthStore((s) => s.user);
  const currencySymbol = settings?.currency?.currency_symbol || '¥';

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUnlimitedQuota, setIsUnlimitedQuota] = useState(true);
  const [quotaLimit, setQuotaLimit] = useState(100);
  const [creating, setCreating] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!showCreateForm) return;
    const rand = Array.from({ length: 4 }, () =>
      'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
    ).join('');
    setNewName(`arkpg ${rand}`);
    setIsUnlimitedQuota(true);
    setQuotaLimit(100);
  }, [showCreateForm]);

  const refresh = async () => {
    const list = await loadApiTokens();
    onTokensChange(list);
    return list;
  };

  const applySelect = (key: string) => {
    onSelect(key);
    saveSelectedTokenKey(key);
    if (closeOnSelect) onClose();
  };

  const handleRowClick = (tok: ApiTokenItem) => {
    if (selectedTokenKey === tok.token_key) {
      onSelect('');
      saveSelectedTokenKey('');
      if (closeOnSelect) onClose();
      return;
    }
    applySelect(tok.token_key);
  };

  const handleCreate = async () => {
    if (shouldBlockTokenCreate(settings?.registration, user)) {
      toast.error(tokenBindBlockMessage(settings?.registration));
      navigate('/profile');
      return;
    }
    const tokenName = newName.trim();
    if (!tokenName) {
      toast.error('请输入密钥名称');
      return;
    }
    setCreating(true);
    try {
      const created = await createApiToken({
        name: tokenName,
        quota_limit: isUnlimitedQuota ? -1 : quotaLimit,
      });
      const list = await refresh();
      onTokensChange(list);
      toast.success('创建并关联成功');
      applySelect(created.token_key);
      setShowCreateForm(false);
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error?.message || e?.message || '创建令牌失败';
      toast.error(serverMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number | undefined, tokenKey: string) => {
    if (id == null) {
      toast.error('无法删除：缺少令牌 ID');
      return;
    }
    try {
      await deleteApiToken(id);
      toast.success('删除密钥成功');
      const list = await refresh();
      onTokensChange(list);
      if (selectedTokenKey === tokenKey) {
        onSelect('');
        saveSelectedTokenKey('');
      }
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error?.message || err?.message || '删除令牌失败';
      toast.error(serverMsg);
    }
  };

  const renderAction = (tok: ApiTokenItem) => {
    if (selectedTokenKey === tok.token_key) {
      return <CheckOutlined className="hf-tsp-check" />;
    }
    return (
      <Popconfirm
        title="确认删除密钥"
        description={`您确定要删除密钥“${tok.name || tok.token_key}”吗？此操作不可逆。`}
        onConfirm={() => void handleDelete(tok.id, tok.token_key)}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <span
          className="hf-tsp-delete-icon"
          role="button"
          tabIndex={0}
          title="删除"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </span>
      </Popconfirm>
    );
  };

  return (
    <>
      <div className="hf-tsp-header hf-tsp-header-rich">
        <h3 className="hf-tsp-title">使用创作中心请关联API密钥令牌</h3>
        <div className="hf-tsp-header-actions">
          {tokens.length > 0 && (
            <>
              <button
                type="button"
                className="hf-tsp-btn solid"
                onClick={() => setShowCreateForm((v) => !v)}
              >
                {showCreateForm ? '取消创建' : '创建令牌'}
              </button>
              <button
                type="button"
                className="hf-tsp-btn"
                onClick={() => {
                  onClose();
                  // 始终打开用户端令牌页（与创作中心一致）；带上 session 登录态以免新标签落到管理员身份
                  openWorkflowInNewTab('/tokens');
                }}
              >
                令牌管理
              </button>
            </>
          )}
          <button type="button" className="hf-tsp-close" aria-label="关闭" onClick={onClose}>
            <CloseOutlined />
          </button>
        </div>
      </div>

      <div className="hf-tsp-notice">
        <span className="hf-tsp-notice-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div className="hf-tsp-notice-text">
          保护好您的密钥，请不要泄露。专用密钥只能在创作中心内发起请求时使用。
        </div>
      </div>

      <div className="hf-tsp-body hf-tsp-body-rich">
        {!isMobile && tokens.length > 0 && (
          <div className="hf-tsp-cols">
            <div>
              密钥信息 <span className="hf-tsp-cols-hint">(点击选择)</span>
            </div>
            <div>可用额度</div>
            <div>创建时间</div>
            <div>上次使用时间</div>
            <div />
          </div>
        )}

        {tokens.length === 0 ? (
          <div className="hf-tsp-empty-block">
            <div className="hf-tsp-empty">暂无可用的接口密钥</div>
            <button
              type="button"
              className="hf-tsp-btn solid"
              onClick={() => setShowCreateForm((v) => !v)}
            >
              {showCreateForm ? '取消创建' : '创建令牌'}
            </button>
          </div>
        ) : (
          <div className="hf-tsp-list hf-tsp-list-rich">
            {tokens.map((tok) => {
              const selected = selectedTokenKey === tok.token_key;
              const createdStr = tok.created_at
                ? formatApiDateTime(tok.created_at, 'YYYY-MM-DD HH:mm')
                : '-';
              const usedStr = tok.last_used_at
                ? formatApiDateTime(tok.last_used_at, 'YYYY-MM-DD HH:mm')
                : '从未';
              const quota = formatQuota(tok);
              const playgroundOnly =
                tok.only_playground === 1 || tok.only_playground_2026 === 1;

              return (
                <div
                  key={tok.token_key}
                  role="button"
                  tabIndex={0}
                  className={`hf-tsp-item hf-tsp-item-rich${selected ? ' selected' : ''}${isMobile ? ' is-mobile' : ''}`}
                  onClick={(e) => {
                    if (!e.currentTarget.contains(e.target as Node)) return;
                    handleRowClick(tok);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(tok);
                    }
                  }}
                >
                  <div className="hf-tsp-item-info">
                    <div className="hf-tsp-item-name-row">
                      <span className="hf-tsp-item-name">{tok.name || '未命名'}</span>
                      {playgroundOnly && <span className="hf-tsp-badge">仅创作中心</span>}
                      {isMobile && <span className="hf-tsp-item-action">{renderAction(tok)}</span>}
                    </div>
                    <div className="hf-tsp-item-desc mono">{maskTokenKey(tok.token_key)}</div>
                  </div>

                  {isMobile ? (
                    <div className="hf-tsp-item-meta-mobile">
                      <div>
                        <span>可用额度</span>
                        <strong className={quota.exceeded ? 'danger' : ''}>{quota.text}</strong>
                      </div>
                      <div>
                        <span>创建时间</span>
                        <em>{createdStr}</em>
                      </div>
                      <div>
                        <span>上次使用</span>
                        <em>{usedStr}</em>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={`hf-tsp-cell-quota${quota.exceeded ? ' danger' : ''}`}>
                        {quota.text}
                      </div>
                      <div className="hf-tsp-cell-time">{createdStr}</div>
                      <div className="hf-tsp-cell-time">{usedStr}</div>
                      <div className="hf-tsp-item-action">{renderAction(tok)}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateForm && (
        <div className="hf-tsp-create-form">
          <div className={`hf-tsp-create-grid${isMobile ? ' is-mobile' : ''}`}>
            <label className="hf-tsp-field">
              <span>密钥名称</span>
              <input
                className="hf-tsp-input"
                value={newName}
                placeholder="请输入密钥名称"
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
            </label>

            <div className="hf-tsp-field">
              <span>额度配置</span>
              <div className="hf-tsp-quota-row">
                <label className="hf-tsp-check">
                  <input
                    type="checkbox"
                    checked={isUnlimitedQuota}
                    onChange={(e) => setIsUnlimitedQuota(e.target.checked)}
                  />
                  <span>无限额度</span>
                </label>
                {!isUnlimitedQuota && (
                  <label className="hf-tsp-quota-limit">
                    <span>限制 ({currencySymbol})</span>
                    <input
                      className="hf-tsp-input hf-tsp-input-sm"
                      type="number"
                      min={1}
                      value={quotaLimit}
                      onChange={(e) => setQuotaLimit(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                )}
              </div>
            </div>

            <button
              type="button"
              className="hf-tsp-btn primary"
              disabled={creating || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? '创建中…' : '确认创建并关联'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default TokenPanelContent;
