/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use crate::auth;
use crate::models::{
    CreateRedemptionRequest, RedeemRequest, Redemption, RedemptionGroupResponse,
    RedemptionListResponse,
};
use crate::AppState;
use axum::{
    extract::{ConnectInfo, Extension, Path, Query, State},
    http::HeaderMap,
    Json,
};
use dashmap::DashMap;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};

use rand::{distributions::Alphanumeric, Rng};

/// Admin: List all redemption codes
pub async fn list_redemptions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<crate::models::RedemptionQuery>,
) -> AppResult<Json<RedemptionListResponse>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(10).max(1).min(100);
    let offset = (page - 1) * page_size;

    let mut qb = sqlx::QueryBuilder::new("SELECT * FROM redemptions WHERE 1=1 ");
    if let Some(name) = &query.name {
        qb.push(" AND name = ");
        qb.push_bind(name);
    }
    qb.push(" ORDER BY id DESC LIMIT ");
    qb.push_bind(page_size);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let redemptions: Vec<Redemption> = qb.build_query_as().fetch_all(&state.db.pool).await?;

    let mut count_qb = sqlx::QueryBuilder::new("SELECT COUNT(*) FROM redemptions WHERE 1=1 ");
    if let Some(name) = &query.name {
        count_qb.push(" AND name = ");
        count_qb.push_bind(name);
    }
    let total: i64 = count_qb
        .build_query_scalar()
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(RedemptionListResponse {
        data: redemptions,
        total,
    }))
}

pub async fn list_redemption_groups(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<crate::models::RedemptionQuery>,
) -> AppResult<Json<RedemptionGroupResponse>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(10).max(1).min(100);
    let offset = (page - 1) * page_size;

    let name_filter = query
        .name
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT \
             name, \
             COUNT(id) as total_count, \
             SUM(quota) as total_quota, \
             MAX(created_at) as created_at, \
             MAX(expires_at) as expires_at, \
             SUM(used_count) as total_used_count, \
             MAX(max_uses) as max_uses, \
             MAX(per_user_limit) as per_user_limit, \
             MAX(per_user_activity_limit) as per_user_activity_limit \
             FROM redemptions WHERE 1=1 ",
    );
    if let Some(name) = name_filter {
        qb.push(" AND name LIKE ");
        qb.push_bind(format!("%{}%", name));
    }
    qb.push(" GROUP BY name ORDER BY MAX(created_at) DESC LIMIT ");
    qb.push_bind(page_size);
    qb.push(" OFFSET ");
    qb.push_bind(offset);

    let groups: Vec<crate::models::RedemptionGroup> =
        qb.build_query_as().fetch_all(&state.db.pool).await?;

    let mut count_qb =
        sqlx::QueryBuilder::new("SELECT COUNT(DISTINCT name) FROM redemptions WHERE 1=1 ");
    if let Some(name) = name_filter {
        count_qb.push(" AND name LIKE ");
        count_qb.push_bind(format!("%{}%", name));
    }
    let total: i64 = count_qb
        .build_query_scalar()
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(RedemptionGroupResponse {
        data: groups,
        total,
    }))
}

/// Admin: Bulk generate redemption codes
pub async fn generate_redemptions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<CreateRedemptionRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    if request.count <= 0 || request.count > 1000 {
        return Err(AppError::BadRequest(
            "Count must be between 1 and 1000".to_string(),
        ));
    }
    if request.quota <= 0.0 {
        return Err(AppError::BadRequest("额度必须大于 0".to_string()));
    }

    let tz_name = crate::relay::relay_settings::get_cached_site_timezone(&state.db).await;
    let expires_at = if request.permanent {
        None
    } else {
        let Some(ref exp) = request.expires_at else {
            return Err(AppError::BadRequest(
                "请设置有效期，或选择长期有效".to_string(),
            ));
        };
        Some(normalize_expiry_date(exp, &tz_name)?)
    };

    // allow_multiple 只约束「单码可兑次数」；活动级单用户参与次数与之独立
    let max_uses = if request.allow_multiple {
        if request.max_uses < -1 {
            return Err(AppError::BadRequest(
                "兑换次数无效（-1 表示不限制）".to_string(),
            ));
        }
        if request.max_uses == 0 {
            -1
        } else {
            request.max_uses
        }
    } else {
        1
    };

    // 单码单用户：关闭多次兑换时固定为 1；开启时默认不限（由活动参与次数统一约束）
    let per_user_limit = if request.allow_multiple {
        if request.per_user_limit < -1 {
            return Err(AppError::BadRequest(
                "单用户兑换次数无效（-1 表示不限制）".to_string(),
            ));
        }
        if request.per_user_limit == 0 {
            -1
        } else {
            request.per_user_limit
        }
    } else {
        1
    };

    if request.per_user_activity_limit < -1 {
        return Err(AppError::BadRequest(
            "活动参与次数无效（-1 表示不限制）".to_string(),
        ));
    }
    // 约定：-1/0 = 不限；>0 为上限（与 allow_multiple / max_uses 相互独立）
    let per_user_activity_limit = if request.per_user_activity_limit <= 0 {
        -1
    } else {
        request.per_user_activity_limit
    };

    let mut codes = Vec::new();
    let mut unique_codes = std::collections::HashSet::new();
    let mut tx = state.db.pool.begin().await?;

    for _ in 0..request.count {
        // 8 位大写字母+数字，便于复制使用；冲突时重试
        for attempt in 0..16 {
            let code: String = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(8)
                .map(|c| (c as char).to_ascii_uppercase())
                .collect();

            if !unique_codes.contains(&code) {
                let exists: Option<i64> = sqlx::query_scalar(
                    &state
                        .db
                        .format_query("SELECT id FROM redemptions WHERE code = ? LIMIT 1"),
                )
                .bind(&code)
                .fetch_optional(&mut *tx)
                .await?;
                if exists.is_none() {
                    unique_codes.insert(code.clone());
                    codes.push(code);
                    break;
                }
            }

            if attempt == 15 {
                return Err(AppError::BadRequest("生成兑换码失败，请重试".to_string()));
            }
        }
    }

    if !codes.is_empty() {
        let mut query_builder = sqlx::QueryBuilder::new(
            "INSERT INTO redemptions (name, code, quota, expires_at, max_uses, used_count, per_user_limit, per_user_activity_limit, is_used) "
        );
        let name = request.name.clone();
        let q = request.quota;
        query_builder.push_values(codes.clone(), |mut b, code| {
            b.push_bind(name.clone())
                .push_bind(code)
                .push_bind(q)
                .push_bind(expires_at.clone())
                .push_bind(max_uses)
                .push_bind(0)
                .push_bind(per_user_limit)
                .push_bind(per_user_activity_limit)
                .push_bind(0);
        });

        let query = query_builder.build();
        query.execute(&mut *tx).await?;
    }

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "count": request.count,
        "codes": codes
    })))
}

/// Admin: Delete a redemption code
pub async fn delete_redemption(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM redemptions WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// Admin: Update redemption status (void/disable)
pub async fn update_redemption_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(request): Json<crate::models::UpdateRedemptionStatusRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    if request.status != 1 && request.status != 0 && request.status != -1 {
        return Err(AppError::BadRequest("Invalid status".to_string()));
    }

    let rows = sqlx::query(
        &state
            .db
            .format_query("UPDATE redemptions SET status = ? WHERE id = ?"),
    )
    .bind(request.status)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    if rows.rows_affected() == 0 {
        return Err(AppError::NotFound("Redemption code not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(serde::Deserialize)]
pub struct DeleteGroupQuery {
    pub name: String,
}

pub async fn delete_redemption_group(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<DeleteGroupQuery>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    if query.name.trim().is_empty() {
        return Err(AppError::BadRequest("Activity name required".to_string()));
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM redemptions WHERE name = ?"),
    )
    .bind(&query.name)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// 将有效期规范为落库的 DbTs（按站点时区计算过期瞬间的 UTC 时间）
fn normalize_expiry_date(raw: &str, tz_name: &str) -> AppResult<crate::time_system::DbTs> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(
            "请设置有效期，或选择长期有效".to_string(),
        ));
    }
    let tz: chrono_tz::Tz = tz_name.parse().unwrap_or(chrono_tz::Asia::Shanghai);

    let mut dt_opt = None;

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        dt_opt = Some(dt.with_timezone(&chrono::Utc));
    } else if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
        if let Some(local) = ndt.and_local_timezone(tz).latest() {
            dt_opt = Some(local.with_timezone(&chrono::Utc));
        }
    } else if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S") {
        if let Some(local) = ndt.and_local_timezone(tz).latest() {
            dt_opt = Some(local.with_timezone(&chrono::Utc));
        }
    } else if let Ok(d) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        if let Some(next) = d.succ_opt() {
            if let Some(end) = next
                .and_hms_opt(0, 0, 0)
                .and_then(|ndt| ndt.and_local_timezone(tz).latest())
            {
                dt_opt = Some(end.with_timezone(&chrono::Utc));
            }
        }
    }

    if let Some(dt) = dt_opt {
        Ok(crate::time_system::DbTs::from_utc(dt))
    } else {
        Err(AppError::BadRequest("有效期格式不正确".to_string()))
    }
}

/// 过期判定：无时区字符串按站点默认时区墙钟解释；纯日期则该日结束（次日 00:00）前仍有效。
fn is_expired(expires_at: Option<&str>, tz_name: &str) -> bool {
    let Some(exp) = expires_at.map(str::trim).filter(|s| !s.is_empty()) else {
        return false; // 长期有效
    };
    let tz: chrono_tz::Tz = tz_name.parse().unwrap_or(chrono_tz::Asia::Shanghai);
    let now = chrono::Utc::now().with_timezone(&tz);

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(exp) {
        return dt.with_timezone(&tz) < now;
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%d %H:%M:%S") {
        if let Some(local) = ndt.and_local_timezone(tz).latest() {
            return local < now;
        }
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%dT%H:%M:%S") {
        if let Some(local) = ndt.and_local_timezone(tz).latest() {
            return local < now;
        }
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(exp, "%Y-%m-%d") {
        // 日期当天结束仍有效：站点时区下「过期日 + 1 天 00:00」起算过期
        if let Some(next) = d.succ_opt() {
            if let Some(end) = next
                .and_hms_opt(0, 0, 0)
                .and_then(|ndt| ndt.and_local_timezone(tz).latest())
            {
                return now >= end;
            }
        }
    }
    false
}

/// User: Redeem a code to balance
pub async fn redeem_code(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(request): Json<RedeemRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id = claims.sub;
    let client_ip = crate::api::auth::extract_client_ip(&headers, &addr);

    // 0) IP 防刷：1 分钟超 20 次 → 封禁该 IP 24 小时（优先于用户限流与查库）
    if let Err(msg) = state.rate_limiter.check_redeem_ip(&client_ip) {
        return Err(AppError::Forbidden(msg));
    }

    // 1) 限流放最前：未过限流前不碰库（防刷）
    //    每用户 5 次/分钟；顺带清理过期条目，避免 DashMap 无限增长
    static REDEEM_RL: OnceLock<DashMap<String, (u32, Instant)>> = OnceLock::new();
    let rl = REDEEM_RL.get_or_init(|| DashMap::new());
    let now = Instant::now();
    if rl.len() > 10_000 {
        rl.retain(|_, (_, last_reset)| now.duration_since(*last_reset) <= Duration::from_secs(120));
    }
    let mut allowed = true;
    if let Some(mut entry) = rl.get_mut(&user_id) {
        let (count, last_reset) = *entry;
        if now.duration_since(last_reset) > Duration::from_secs(60) {
            *entry = (1, now);
        } else if count >= 5 {
            allowed = false;
        } else {
            *entry = (count + 1, last_reset);
        }
    } else {
        rl.insert(user_id.clone(), (1, now));
    }
    if !allowed {
        return Err(AppError::BadRequest("请求过于频繁，请稍后再试".to_string()));
    }

    // 2) 输入校验：空码 / 过长直接拒绝（兑换码为 8 位，放宽到 32 兼容历史）
    let code = request.code.trim().to_ascii_uppercase();
    if code.is_empty() {
        return Err(AppError::BadRequest("请输入兑换码".to_string()));
    }
    if code.len() > 32 {
        return Err(AppError::BadRequest("兑换码无效，请检查后重试".to_string()));
    }

    // 3) 只读 marketing 开关（避免 load_all_settings 每次 ~20 次查库）
    let marketing_raw: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'marketing_settings'"),
    )
    .fetch_optional(&state.db.pool)
    .await?;
    let enable_redemption = marketing_raw
        .and_then(|v| {
            serde_json::from_str::<crate::models::MarketingSettings>(&v)
                .ok()
                .map(|m| m.enable_redemption)
        })
        .unwrap_or_else(|| crate::api::settings::default_marketing_settings().enable_redemption);
    if !enable_redemption {
        return Err(AppError::Forbidden("兑换功能未开启".to_string()));
    }

    // 4) 事务外预检：无效/禁用/过期/用尽快速失败，不占用连接做写事务
    let preview: Option<Redemption> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM redemptions WHERE code = ? LIMIT 1"),
    )
    .bind(&code)
    .fetch_optional(&state.db.pool)
    .await?;

    let preview = match preview {
        None => {
            return Err(AppError::BadRequest("兑换码无效，请检查后重试".to_string()));
        }
        Some(r) => r,
    };

    if preview.status == 0 {
        return Err(AppError::BadRequest("该兑换码已被禁用".to_string()));
    }
    if preview.status == -1 {
        return Err(AppError::BadRequest("该兑换码已作废".to_string()));
    }

    let tz_name = crate::relay::relay_settings::get_cached_site_timezone(&state.db).await;
    if is_expired(preview.expires_at.as_deref(), &tz_name) {
        return Err(AppError::BadRequest("兑换码已过期".to_string()));
    }

    let max_uses_preview = preview.max_uses;
    if max_uses_preview > 0 && preview.used_count >= max_uses_preview {
        return Err(AppError::BadRequest("该兑换码兑换次数已用完".to_string()));
    }
    if max_uses_preview == 1 && preview.is_used != 0 && preview.used_count == 0 {
        return Err(AppError::BadRequest("该兑换码已被使用".to_string()));
    }

    // 5) 写事务：活动顾问锁 + 乐观更新，防超发 / 防并发突破活动上限
    let mut tx = state.db.pool.begin().await?;

    let redemption: Redemption = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM redemptions WHERE id = ? LIMIT 1"),
    )
    .bind(preview.id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::BadRequest("兑换码无效，请检查后重试".to_string()))?;

    if redemption.status != 1 {
        return Err(AppError::BadRequest(if redemption.status == -1 {
            "该兑换码已作废".to_string()
        } else {
            "该兑换码已被禁用".to_string()
        }));
    }
    if is_expired(redemption.expires_at.as_deref(), &tz_name) {
        return Err(AppError::BadRequest("兑换码已过期".to_string()));
    }

    let max_uses = redemption.max_uses;
    if max_uses > 0 && redemption.used_count >= max_uses {
        return Err(AppError::BadRequest("该兑换码兑换次数已用完".to_string()));
    }

    // 单兑换码单用户限制：<=0（-1 约定 / 历史 0）表示不限
    let per_user_limit = redemption.per_user_limit;
    if per_user_limit > 0 {
        // 单用户并发互斥锁：防止同用户多线程并发突破限领次数双重入账
        sqlx::query(
            &state
                .db
                .format_query("SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))"),
        )
        .bind(format!("redemption_code:{}", redemption.id))
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;

        let user_used: i64 = sqlx::query_scalar(&state.db.format_query(
            "SELECT COUNT(*) FROM redemption_logs WHERE redemption_id = ? AND user_id = ?",
        ))
        .bind(redemption.id)
        .bind(&user_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0);

        let legacy_used = redemption.used_by.as_deref() == Some(user_id.as_str())
            && user_used == 0
            && redemption.is_used != 0
            && max_uses == 1;

        if legacy_used || user_used >= per_user_limit as i64 {
            return Err(AppError::BadRequest(
                "您已达到该兑换码的兑换次数上限".to_string(),
            ));
        }
    }

    // 活动级单用户参与次数
    let per_user_activity_limit = redemption.per_user_activity_limit;
    if per_user_activity_limit > 0 {
        sqlx::query(
            &state
                .db
                .format_query("SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))"),
        )
        .bind(format!("redemption_activity:{}", redemption.name))
        .bind(&user_id)
        .execute(&mut *tx)
        .await?;

        // 先按 user_id 过滤，配合 idx_redemption_logs_user_id，避免大活动全表扫 logs
        let activity_used: i64 = sqlx::query_scalar(&state.db.format_query(
            "SELECT COUNT(*) FROM redemption_logs \
             WHERE user_id = ? \
               AND redemption_id IN (SELECT id FROM redemptions WHERE name = ?)",
        ))
        .bind(&user_id)
        .bind(&redemption.name)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0);

        if activity_used >= per_user_activity_limit as i64 {
            return Err(AppError::BadRequest(
                "您已达到该活动的参与次数上限".to_string(),
            ));
        }
    }

    // 乐观锁：要求 status=1，防止预检后被禁用仍兑入账
    let rows_affected = sqlx::query(&state.db.format_query(
        "UPDATE redemptions SET \
         used_count = used_count + 1, \
         is_used = CASE WHEN ? > 0 AND used_count + 1 >= ? THEN 1 ELSE is_used END, \
         used_at = CURRENT_TIMESTAMP, \
         used_by = CASE WHEN ? = 1 THEN ? ELSE used_by END, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ? AND status = 1 AND (? <= 0 OR used_count < ?)",
    ))
    .bind(max_uses)
    .bind(max_uses)
    .bind(max_uses)
    .bind(&user_id)
    .bind(redemption.id)
    .bind(max_uses)
    .bind(max_uses)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::BadRequest(
            "该兑换码兑换次数已用完，或已被他人抢先兑换".to_string(),
        ));
    }

    sqlx::query(&state.db.format_query(
        "UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(redemption.quota)
    .bind(&user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(&state.db.format_query(
        "INSERT INTO redemption_logs (redemption_id, user_id, amount) VALUES (?, ?, ?)",
    ))
    .bind(redemption.id)
    .bind(&user_id)
    .bind(redemption.quota)
    .execute(&mut *tx)
    .await?;

    let recharge_id: i64 = sqlx::query_scalar::<_, i64>(
        &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'redemption', ?) RETURNING id")
    )
    .bind(&user_id)
    .bind(redemption.quota)
    .bind(format!("兑换码: {}", redemption.name))
    .fetch_one(&mut *tx)
    .await?;

    if let Err(e) = crate::services::affiliate::award_commission(
        &state.db,
        &mut tx,
        &user_id,
        recharge_id,
        redemption.quota,
    )
    .await
    {
        tracing::warn!(
            "Failed to award commission for redemption {}: {}",
            recharge_id,
            e
        );
    }

    tx.commit().await?;

    crate::services::notification::spawn_low_balance_check(Arc::clone(&state), user_id.clone());

    Ok(Json(serde_json::json!({
        "success": true,
        "quota_added": redemption.quota
    })))
}
