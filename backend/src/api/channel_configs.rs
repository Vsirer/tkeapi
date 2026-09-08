/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::error::AppError;
use crate::models::{
    ChannelConfig, ChannelConfigListResponse, ChannelConfigSafe, CreateChannelConfigRequest,
    UpdateChannelConfigRequest,
};
use crate::services::upstream_rate_sync::{
    applied_channel_rate, is_sync_due, newapi_pricing_url, parse_newapi_groups,
    UpstreamGroupRatio, SYSTEM_NEWAPI,
};
use crate::time_system::DbTs;
use crate::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use rand::Rng;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;

fn sanitize_upstream_system(raw: &str) -> Result<String, AppError> {
    let value = raw.trim();
    if !crate::services::upstream_rate_sync::is_known_upstream_system(value) {
        return Err(AppError::BadRequest("不支持的上游系统".into()));
    }
    Ok(value.to_string())
}

fn sanitize_sync_interval(minutes: i32) -> i32 {
    minutes.clamp(0, 10_080)
}

fn sanitize_rate_add(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    }
}

fn sanitize_upstream_group(raw: &str) -> String {
    raw.trim().to_string()
}

fn sanitize_currency(raw: &str) -> String {
    raw.trim().to_string()
}

fn sanitize_rate(value: f64) -> f64 {
    if value.is_finite() && value >= 0.0 {
        (value * 10000.0).round() / 10000.0
    } else {
        1.0
    }
}

fn sanitize_currency_rate(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        1.0
    }
}

fn resolve_api_key(submitted: Option<&str>, stored: &str) -> String {
    match submitted {
        Some(key) if !key.trim().is_empty() && !key.contains("******") => key.trim().to_string(),
        _ => stored.to_string(),
    }
}

async fn fetch_newapi_groups(
    http: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> Result<Vec<UpstreamGroupRatio>, AppError> {
    let url = newapi_pricing_url(base_url).map_err(AppError::BadRequest)?;
    let mut req = http.get(&url).header("Accept", "application/json");
    let key = api_key.trim();
    if !key.is_empty() {
        req = req.header("Authorization", format!("Bearer {key}"));
    }
    let resp = crate::services::http_client::with_timeout(req, Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("拉取上游分组倍率失败: {e}")))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(AppError::UpstreamError(format!(
            "上游定价接口 HTTP {}: {}",
            status.as_u16(),
            crate::relay::proxy::sanitize_error_message(&body)
        )));
    }
    parse_newapi_groups(&body).map_err(AppError::UpstreamError)
}

fn apply_selected_group(
    groups: &[UpstreamGroupRatio],
    group_name: &str,
    rate_add: f64,
    upstream_currency: &str,
    site_currency: &str,
    currency_rate: f64,
) -> Result<f64, AppError> {
    let found = groups
        .iter()
        .find(|g| g.name == group_name)
        .ok_or_else(|| AppError::BadRequest(format!("上游没有分组 {group_name}")))?;
    Ok(applied_channel_rate(
        found.ratio,
        rate_add,
        upstream_currency,
        site_currency,
        currency_rate,
    ))
}

pub async fn list_channel_configs(
    State(state): State<Arc<AppState>>,
    claims: Option<axum::Extension<crate::auth::Claims>>,
) -> Result<Json<ChannelConfigListResponse>, AppError> {
    let is_admin = claims.as_ref().map_or(false, |c| c.0.role == "admin");

    let configs: Vec<ChannelConfig> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM channel_configs ORDER BY sort_order DESC, id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let total: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM channel_configs"),
    )
    .fetch_one(&state.db.pool)
    .await?;

    // 统计各上游预设绑定的模型渠道分组
    let channels: Vec<(i64, String, Option<String>, Option<i64>, String, String, i32)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, name, group_aid, preset_id, provider_type, config, status FROM channels",
        ),
    )
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    let mut bindings_map: std::collections::HashMap<i64, Vec<crate::models::channel_config::BoundChannelSummary>> =
        std::collections::HashMap::new();

    for (ch_id, name, group_aid, preset_id, provider_type, config_str, status) in channels {
        let is_ha = provider_type == "high_availability_group";
        if is_ha {
            if let Ok(cfg_val) = serde_json::from_str::<serde_json::Value>(&config_str) {
                if let Some(sub_ids) = cfg_val.get("sub_channels").and_then(|v| v.as_array()) {
                    for sid_val in sub_ids {
                        if let Some(sid) = sid_val.as_i64() {
                            bindings_map.entry(sid).or_default().push(
                                crate::models::channel_config::BoundChannelSummary {
                                    id: ch_id,
                                    name: name.clone(),
                                    group_aid: group_aid.clone(),
                                    is_ha: true,
                                    status,
                                },
                            );
                        }
                    }
                }
            }
        } else if let Some(pid) = preset_id {
            bindings_map.entry(pid).or_default().push(
                crate::models::channel_config::BoundChannelSummary {
                    id: ch_id,
                    name,
                    group_aid,
                    is_ha: false,
                    status,
                },
            );
        }
    }

    let data: Vec<ChannelConfigSafe> = configs
        .into_iter()
        .map(|c| {
            let config_id = c.id;
            let mut safe = ChannelConfigSafe::from_with_role(c, is_admin);
            if let Some(bound) = bindings_map.remove(&config_id) {
                safe.bound_channel_count = bound.len() as i64;
                safe.bound_channels = bound;
            }
            safe
        })
        .collect();

    Ok(Json(ChannelConfigListResponse { data, total }))
}

pub async fn create_channel_config(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateChannelConfigRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // yid 仅展示；业务关联用 id。查重分配，格式 3 + 8 位
    let mut yid = String::new();
    for _ in 0..10 {
        let candidate = format!("3{:08}", rand::thread_rng().gen_range(0u32..100_000_000));
        let exists: i64 = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT COUNT(*) FROM channel_configs WHERE yid = ?"),
        )
        .bind(&candidate)
        .fetch_one(&state.db.pool)
        .await?;
        if exists == 0 {
            yid = candidate;
            break;
        }
    }
    if yid.is_empty() {
        return Err(AppError::Internal("生成渠道配置 yid 失败，请重试".into()));
    }

    let status = if req.status == 0 { 0 } else { 1 };
    let daily_reset_hour = req.daily_reset_hour.unwrap_or(0).clamp(0, 23);
    let daily_reset_minute = req.daily_reset_minute.unwrap_or(0).clamp(0, 59);
    let daily_reset_cooldown_minutes = req.daily_reset_cooldown_minutes.unwrap_or(0).max(0);
    let upstream_system = sanitize_upstream_system(&req.upstream_system)?;
    let upstream_group = sanitize_upstream_group(&req.upstream_group);
    let upstream_sync_interval_minutes =
        sanitize_sync_interval(req.upstream_sync_interval_minutes);
    let upstream_sync_rate_add = sanitize_rate_add(req.upstream_sync_rate_add);
    let upstream_currency = sanitize_currency(&req.upstream_currency);
    let site_currency = sanitize_currency(&req.site_currency);
    let upstream_currency_rate = sanitize_currency_rate(req.upstream_currency_rate);
    let rate = sanitize_rate(req.rate);

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO channel_configs (name, provider_type, base_url, api_key, remark, yid, sort_order, rate, priority, weight, quota_limit, daily_quota_limit, weekly_quota_limit, monthly_quota_limit, daily_reset_hour, daily_reset_minute, daily_reset_cooldown_minutes, status, category_id, upstream_system, upstream_group, upstream_sync_interval_minutes, upstream_sync_rate_add, upstream_currency, site_currency, upstream_currency_rate) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
    )
    .bind(&req.name)
    .bind(&req.provider_type)
    .bind(&req.base_url)
    .bind(&req.api_key)
    .bind(&req.remark)
    .bind(&yid)
    .bind(&req.sort_order)
    .bind(rate)
    .bind(&req.priority)
    .bind(&req.weight)
    .bind(req.quota_limit.unwrap_or(-1.0))
    .bind(req.daily_quota_limit.unwrap_or(-1.0))
    .bind(req.weekly_quota_limit.unwrap_or(-1.0))
    .bind(req.monthly_quota_limit.unwrap_or(-1.0))
    .bind(daily_reset_hour)
    .bind(daily_reset_minute)
    .bind(daily_reset_cooldown_minutes)
    .bind(status)
    .bind(req.category_id)
    .bind(&upstream_system)
    .bind(&upstream_group)
    .bind(upstream_sync_interval_minutes)
    .bind(upstream_sync_rate_add)
    .bind(&upstream_currency)
    .bind(&site_currency)
    .bind(upstream_currency_rate)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn update_channel_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateChannelConfigRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut config: ChannelConfig = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM channel_configs WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel Config not found".to_string()))?;

    if let Some(name) = req.name {
        config.name = name;
    }
    if let Some(pt) = req.provider_type {
        config.provider_type = pt;
    }
    if let Some(bu) = req.base_url {
        config.base_url = bu;
    }
    if let Some(key) = req.api_key {
        // 【防护】含脱敏标记的值不覆盖原始密钥
        if !key.contains("******") {
            config.api_key = key;
        }
    }
    if let Some(rem) = req.remark {
        config.remark = Some(rem);
    }
    if let Some(so) = req.sort_order {
        config.sort_order = so;
    }
    if let Some(r) = req.rate {
        config.rate = sanitize_rate(r);
    }
    if let Some(p) = req.priority {
        config.priority = p;
    }
    if let Some(w) = req.weight {
        config.weight = w;
    }
    if let Some(q) = req.quota_limit {
        config.quota_limit = q;
    }
    if let Some(d) = req.daily_quota_limit {
        config.daily_quota_limit = d;
    }
    if let Some(w) = req.weekly_quota_limit {
        config.weekly_quota_limit = w;
    }
    if let Some(m) = req.monthly_quota_limit {
        config.monthly_quota_limit = m;
    }
    if let Some(h) = req.daily_reset_hour {
        config.daily_reset_hour = h.clamp(0, 23);
    }
    if let Some(m) = req.daily_reset_minute {
        config.daily_reset_minute = m.clamp(0, 59);
    }
    if let Some(c) = req.daily_reset_cooldown_minutes {
        config.daily_reset_cooldown_minutes = c.max(0);
    }
    if let Some(s) = req.status {
        config.status = if s == 0 { 0 } else { 1 };
    }
    if let Some(category_id) = req.category_id {
        config.category_id = category_id;
    }
    if let Some(system) = req.upstream_system {
        config.upstream_system = sanitize_upstream_system(&system)?;
    }
    if let Some(group) = req.upstream_group {
        config.upstream_group = sanitize_upstream_group(&group);
    }
    if let Some(interval) = req.upstream_sync_interval_minutes {
        config.upstream_sync_interval_minutes = sanitize_sync_interval(interval);
    }
    if let Some(add) = req.upstream_sync_rate_add {
        config.upstream_sync_rate_add = sanitize_rate_add(add);
    }
    if let Some(uc) = req.upstream_currency {
        config.upstream_currency = sanitize_currency(&uc);
    }
    if let Some(sc) = req.site_currency {
        config.site_currency = sanitize_currency(&sc);
    }
    if let Some(ur) = req.upstream_currency_rate {
        config.upstream_currency_rate = sanitize_currency_rate(ur);
    }

    sqlx::query(
        &state.db.format_query(
            "UPDATE channel_configs SET name = ?, provider_type = ?, base_url = ?, api_key = ?, remark = ?, \
             sort_order = ?, rate = ?, priority = ?, weight = ?, quota_limit = ?, daily_quota_limit = ?, weekly_quota_limit = ?, monthly_quota_limit = ?, \
             daily_reset_hour = ?, daily_reset_minute = ?, daily_reset_cooldown_minutes = ?, status = ?, category_id = ?, \
             upstream_system = ?, upstream_group = ?, upstream_sync_interval_minutes = ?, upstream_sync_rate_add = ?, \
             upstream_currency = ?, site_currency = ?, upstream_currency_rate = ? \
             WHERE id = ?"
        )
    )
    .bind(&config.name)
    .bind(&config.provider_type)
    .bind(&config.base_url)
    .bind(&config.api_key)
    .bind(&config.remark)
    .bind(&config.sort_order)
    .bind(config.rate)
    .bind(config.priority)
    .bind(config.weight)
    .bind(config.quota_limit)
    .bind(config.daily_quota_limit)
    .bind(config.weekly_quota_limit)
    .bind(config.monthly_quota_limit)
    .bind(config.daily_reset_hour)
    .bind(config.daily_reset_minute)
    .bind(config.daily_reset_cooldown_minutes)
    .bind(config.status)
    .bind(config.category_id)
    .bind(&config.upstream_system)
    .bind(&config.upstream_group)
    .bind(config.upstream_sync_interval_minutes)
    .bind(config.upstream_sync_rate_add)
    .bind(&config.upstream_currency)
    .bind(&config.site_currency)
    .bind(config.upstream_currency_rate)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    // 上游渠道配置变更后清除关联的 HA 子渠道熔断记录
    // HA 子渠道的熔断 key 格式为 ha_group_{group_id}_config_{config_id}
    let config_suffix = format!("_config_{}", id);
    state
        .failed_channels
        .retain(|k, _| !k.ends_with(&config_suffix));

    // 如果该 config 被某个渠道作为 preset_id 引用，也清除那些渠道的熔断记录
    if let Ok(referring_channels) = sqlx::query_as::<_, (Option<String>,)>(
        &state
            .db
            .format_query("SELECT group_aid FROM channels WHERE preset_id = ?"),
    )
    .bind(id)
    .fetch_all(&state.db.pool)
    .await
    {
        for (group_aid,) in referring_channels {
            if let Some(aid) = group_aid {
                state.failed_channels.remove(&aid);
            }
        }
    }

    tracing::info!(
        "[ChannelConfig Update] 上游渠道配置 {} 已更新，已清除关联的熔断记录",
        id
    );

    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn delete_channel_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Optionally check if channels depend on this config
    let count: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM channels WHERE preset_id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    // We can allow deletion and let channels keep their last fallback base_url/api_key,
    // or set preset_id to NULL upon deletion
    if count > 0 {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE channels SET preset_id = NULL WHERE preset_id = ?"),
        )
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM channel_configs WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}

/// 手动清零上游预设已用额度（总/日/月）
pub async fn reset_quota(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(&state.db.format_query(
        &crate::models::channel_quota::reset_quota_sql("channel_configs"),
    ))
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("上游渠道配置不存在".into()));
    }

    tracing::info!(
        "[ChannelConfig Quota Reset] 管理员手动清零上游预设 {} 的已用额度",
        id
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Debug, Deserialize)]
pub struct FetchUpstreamGroupsRequest {
    pub config_id: Option<i64>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub upstream_system: Option<String>,
}

pub async fn fetch_upstream_groups(
    State(state): State<Arc<AppState>>,
    Json(req): Json<FetchUpstreamGroupsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let system = sanitize_upstream_system(req.upstream_system.as_deref().unwrap_or(SYSTEM_NEWAPI))?;
    if system != SYSTEM_NEWAPI {
        return Err(AppError::BadRequest("当前仅 newapi 支持拉取分组倍率".into()));
    }

    let mut base_url = req.base_url.unwrap_or_default();
    let mut api_key = req.api_key.unwrap_or_default();
    if let Some(id) = req.config_id {
        let stored: ChannelConfig = sqlx::query_as(
            &state
                .db
                .format_query("SELECT * FROM channel_configs WHERE id = ?"),
        )
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel Config not found".to_string()))?;
        if base_url.trim().is_empty() {
            base_url = stored.base_url.clone();
        }
        api_key = resolve_api_key(Some(&api_key), &stored.api_key);
    }

    if api_key.trim().is_empty() || api_key.contains("******") {
        return Err(AppError::BadRequest("请先填写请求鉴权密钥".into()));
    }

    let groups = fetch_newapi_groups(&state.http_client, &base_url, &api_key).await?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": groups.iter().map(|g| serde_json::json!({
            "name": g.name,
            "ratio": g.ratio,
            "label": g.label,
        })).collect::<Vec<_>>(),
    })))
}

pub async fn run_upstream_rate_sync_tick(state: Arc<AppState>) {
    let configs: Vec<ChannelConfig> = match sqlx::query_as(
        &state.db.format_query(
            "SELECT * FROM channel_configs WHERE upstream_system = ? AND upstream_group <> '' AND upstream_sync_interval_minutes > 0",
        ),
    )
    .bind(SYSTEM_NEWAPI)
    .fetch_all(&state.db.pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!("[UpstreamRateSync] 查询待同步渠道失败: {e}");
            return;
        }
    };

    let now = Utc::now();
    for config in configs {
        let synced = config
            .upstream_synced_at
            .as_ref()
            .map(|t| t.as_str());
        if !is_sync_due(synced, config.upstream_sync_interval_minutes, now) {
            continue;
        }
        match fetch_newapi_groups(&state.http_client, &config.base_url, &config.api_key).await {
            Ok(groups) => match apply_selected_group(
                &groups,
                &config.upstream_group,
                config.upstream_sync_rate_add,
                &config.upstream_currency,
                &config.site_currency,
                config.upstream_currency_rate,
            ) {
                Ok(rate) => {
                    if let Err(e) = sqlx::query(
                        &state.db.format_query(
                            "UPDATE channel_configs SET rate = ?, upstream_synced_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        ),
                    )
                    .bind(rate)
                    .bind(DbTs::from_utc(now))
                    .bind(config.id)
                    .execute(&state.db.pool)
                    .await
                    {
                        tracing::warn!(
                            "[UpstreamRateSync] 写入渠道 {} 倍率失败: {e}",
                            config.id
                        );
                    } else {
                        tracing::info!(
                            "[UpstreamRateSync] 渠道 {} 分组 {} 倍率同步为 {}",
                            config.id,
                            config.upstream_group,
                            rate
                        );
                    }
                }
                Err(e) => tracing::warn!(
                    "[UpstreamRateSync] 渠道 {} 分组未命中: {e}",
                    config.id
                ),
            },
            Err(e) => tracing::warn!(
                "[UpstreamRateSync] 渠道 {} 拉取失败: {e}",
                config.id
            ),
        }
    }
}
