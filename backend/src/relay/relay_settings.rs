/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay 热路径缓存：站点/HA 等配置分槽 TTL（默认 1 天）；API Key 鉴权 DashMap 短 TTL（60s）。
//! 写路径写穿或按 key 失效；miss 回填不盖未过期值。

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{ApiToken, InflightCat, RelaySettings};
use crate::relay::ha_rule::HaRulesBundle;
use crate::time_system::DEFAULT_TIMEDISPLAY;
use dashmap::DashMap;
use std::future::Future;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration, Instant};

/// 读路径 TTL。管理端保存走 `put_*` 写穿，不必等过期；本值主要兜底「直改库 / 多副本」。
const CACHE_TTL: Duration = Duration::from_secs(86400);
const API_TOKEN_TTL: Duration = Duration::from_secs(60);
pub const HA_PLUGIN_NAME: &str = "high_availability_channel";
const INFLIGHT_MSG: &str = "当前余额较低，任务过多，请充值";

struct TtlCell<T> {
    value: T,
    at: Instant,
}

struct CacheSlot<T>(OnceLock<RwLock<Option<TtlCell<T>>>>);

impl<T> CacheSlot<T> {
    const fn new() -> Self {
        Self(OnceLock::new())
    }

    fn lock(&self) -> &RwLock<Option<TtlCell<T>>> {
        self.0.get_or_init(|| RwLock::new(None))
    }

    fn put(&self, value: T) {
        if let Ok(mut guard) = self.lock().write() {
            *guard = Some(TtlCell {
                value,
                at: Instant::now(),
            });
        }
    }

    fn clear(&self) {
        if let Ok(mut guard) = self.lock().write() {
            *guard = None;
        }
    }
}

impl<T: Clone> CacheSlot<T> {
    fn get(&self) -> Option<T> {
        let Ok(guard) = self.lock().read() else {
            return None;
        };
        let cell = guard.as_ref()?;
        (Instant::now().duration_since(cell.at) < CACHE_TTL).then(|| cell.value.clone())
    }

    /// 不覆盖未过期条目（写穿 / 并发先填优先）
    fn fill_miss(&self, value: T) -> T {
        let Ok(mut guard) = self.lock().write() else {
            return value;
        };
        if let Some(cell) = guard.as_ref() {
            if Instant::now().duration_since(cell.at) < CACHE_TTL {
                return cell.value.clone();
            }
        }
        let out = value.clone();
        *guard = Some(TtlCell {
            value,
            at: Instant::now(),
        });
        out
    }

    async fn get_or_load<F>(&self, load: F) -> T
    where
        F: Future<Output = T>,
    {
        if let Some(v) = self.get() {
            return v;
        }
        self.fill_miss(load.await)
    }
}

async fn setting_value(db: &Database, key: &str) -> Option<String> {
    sqlx::query_scalar(&db.format_query("SELECT value FROM settings WHERE key = ?"))
        .bind(key)
        .fetch_optional(&db.pool)
        .await
        .ok()
        .flatten()
}

static RELAY_SETTINGS: CacheSlot<Arc<RelaySettings>> = CacheSlot::new();
static SITE_TZ: CacheSlot<Arc<str>> = CacheSlot::new();
static HA_ENABLED: CacheSlot<bool> = CacheSlot::new();
static HA_RULES: CacheSlot<Arc<HaRulesBundle>> = CacheSlot::new();

pub fn put_cached_relay_settings(settings: RelaySettings) {
    let s = settings.prepared();
    crate::debug_log::RELAY.set(s.enable_debug_log);
    RELAY_SETTINGS.put(Arc::new(s));
}

pub async fn get_cached_relay_settings(db: &Database) -> Arc<RelaySettings> {
    RELAY_SETTINGS
        .get_or_load(async {
            let s = setting_value(db, "relay_settings")
                .await
                .and_then(|v| serde_json::from_str::<RelaySettings>(&v).ok())
                .unwrap_or_default();
            let s = s.prepared();
            crate::debug_log::RELAY.set(s.enable_debug_log);
            Arc::new(s)
        })
        .await
}

pub fn put_cached_site_timezone(tz: impl AsRef<str>) {
    SITE_TZ.put(Arc::<str>::from(tz.as_ref()));
}

pub async fn get_cached_site_timezone(db: &Database) -> Arc<str> {
    SITE_TZ
        .get_or_load(async {
            let tz = setting_value(db, "site_settings")
                .await
                .and_then(|v| serde_json::from_str::<crate::models::SiteSettings>(&v).ok())
                .map(|s| s.default_timezone)
                .unwrap_or_else(|| DEFAULT_TIMEDISPLAY.to_string());
            Arc::<str>::from(tz)
        })
        .await
}

pub fn put_cached_ha_enabled(enabled: bool) {
    HA_ENABLED.put(enabled);
}

pub fn put_cached_ha_rules(bundle: Arc<HaRulesBundle>) {
    HA_RULES.put(bundle);
}

pub fn invalidate_ha() {
    HA_ENABLED.clear();
    HA_RULES.clear();
}

pub async fn get_cached_ha_rules(db: &Database) -> Arc<HaRulesBundle> {
    HA_RULES
        .get_or_load(async { Arc::new(crate::relay::ha_rule::load_from_db(db).await) })
        .await
}

pub fn invalidate_all() {
    RELAY_SETTINGS.clear();
    SITE_TZ.clear();
    invalidate_ha();
    clear_api_token_cache();
    crate::debug_log::RELAY.set(false);
}

// ── API Key 鉴权缓存（按 token_key，60s TTL；更新/删除令牌时按 key 失效）──

struct ApiTokenEntry {
    token: ApiToken,
    at: Instant,
}

struct ApiTokenCache {
    by_key: DashMap<Arc<str>, ApiTokenEntry>,
}

impl ApiTokenCache {
    fn new() -> Self {
        Self {
            by_key: DashMap::new(),
        }
    }

    async fn lookup(
        &self,
        db: &Database,
        api_key: &str,
    ) -> Result<Option<ApiToken>, sqlx::Error> {
        let key: Arc<str> = Arc::from(api_key);
        if let Some(entry) = self.by_key.get(&key) {
            if entry.at.elapsed() < API_TOKEN_TTL {
                return Ok(Some(entry.token.clone()));
            }
        }

        let token: Option<ApiToken> = sqlx::query_as(
            &db.format_query("SELECT * FROM api_tokens WHERE token_key = ?"),
        )
        .bind(api_key)
        .fetch_optional(&db.pool)
        .await?;

        if let Some(ref t) = token {
            self.by_key.insert(
                key,
                ApiTokenEntry {
                    token: t.clone(),
                    at: Instant::now(),
                },
            );
        }
        Ok(token)
    }

    fn invalidate_key(&self, token_key: &str) {
        self.by_key.remove(&Arc::<str>::from(token_key));
    }

    fn clear(&self) {
        self.by_key.clear();
    }
}

fn api_token_cache() -> &'static ApiTokenCache {
    static CACHE: OnceLock<ApiTokenCache> = OnceLock::new();
    CACHE.get_or_init(ApiTokenCache::new)
}

pub async fn lookup_api_token(
    db: &Database,
    api_key: &str,
) -> Result<Option<ApiToken>, sqlx::Error> {
    api_token_cache().lookup(db, api_key).await
}

pub fn invalidate_api_token_key(token_key: &str) {
    api_token_cache().invalidate_key(token_key);
}

pub fn clear_api_token_cache() {
    api_token_cache().clear();
}

pub async fn get_cached_ha_enabled(db: &Database) -> bool {
    HA_ENABLED
        .get_or_load(async {
            let enabled: Option<i64> = sqlx::query_scalar(
                &db.format_query("SELECT is_enabled FROM plugins WHERE name = ?"),
            )
            .bind(HA_PLUGIN_NAME)
            .fetch_optional(&db.pool)
            .await
            .ok()
            .flatten();
            enabled == Some(1)
        })
        .await
}

/// 低余额在途门禁：限额读内存配置；DB 仅在启用时查「是否已有 ≥max 条在途」（OFFSET 触顶即停）
pub async fn enforce_inflight_gate(
    db: &Database,
    user_id: &str,
    available: f64,
    action_type: &str,
) -> AppResult<()> {
    let settings = get_cached_relay_settings(db).await;
    let cat = InflightCat::of(action_type);
    let Some(max) = settings.inflight_limits.get(cat).max_inflight(available) else {
        return Ok(());
    };
    let cat_sql = cat.count_sql();
    let over: bool = sqlx::query_scalar(&db.format_query(&format!(
        "SELECT EXISTS (
             SELECT 1 FROM logs \
             WHERE user_id = ? AND is_completed = 0 AND status_code IN (0, 200) {cat_sql} \
             OFFSET ? LIMIT 1
         )"
    )))
    .bind(user_id)
    .bind(i64::from(max.saturating_sub(1)))
    .fetch_one(&db.pool)
    .await?;
    if over {
        return Err(AppError::TooManyRequests(INFLIGHT_MSG.to_string()));
    }
    Ok(())
}
