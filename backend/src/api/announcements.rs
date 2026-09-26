/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde_json::json;
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    models::{Announcement, CreateAnnouncementReq, UpdateAnnouncementReq},
    time_system::DbTs,
    AppState,
};

const DEFAULT_FLAG_EXPIRE_DAYS: i64 = 5;
const PERMANENT_EXPIRE: &str = "permanent";
const DISPLAY_TIME_CREATED: &str = "created";
const DISPLAY_TIME_UPDATED: &str = "updated";

fn normalize_display_time_mode(raw: Option<&str>, fallback: &str) -> AppResult<String> {
    let candidate = raw
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback);
    let candidate = if candidate.is_empty() {
        DISPLAY_TIME_CREATED
    } else {
        candidate
    };
    match candidate {
        DISPLAY_TIME_CREATED | DISPLAY_TIME_UPDATED => Ok(candidate.to_string()),
        _ => Err(AppError::BadRequest(
            "发布时间选项无效，请选择新建时间或最后修改时间".to_string(),
        )),
    }
}

fn should_touch_updated_at(payload: &UpdateAnnouncementReq) -> bool {
    payload.title.is_some()
        || payload.content.is_some()
        || payload.is_pinned.is_some()
        || payload.is_popup.is_some()
        || payload.is_active.is_some()
        || payload.pin_expires_at.is_some()
        || payload.popup_expires_at.is_some()
        || payload.active_expires_at.is_some()
        || payload.display_time_mode.is_some()
}

fn default_flag_expires_at(now: DateTime<Utc>) -> DbTs {
    DbTs::from_utc(now + Duration::days(DEFAULT_FLAG_EXPIRE_DAYS))
}

fn is_permanent_expire(raw: &str) -> bool {
    let t = raw.trim();
    t.is_empty() || t.eq_ignore_ascii_case(PERMANENT_EXPIRE)
}

fn parse_flag_expires_at(raw: Option<&str>) -> Result<Option<DbTs>, String> {
    let Some(s) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    if is_permanent_expire(s) {
        return Ok(None);
    }
    let normalized = if s.len() == 10 {
        format!("{s}T23:59:59.000Z")
    } else {
        s.to_string()
    };
    let ts = DbTs::new(normalized);
    if ts.to_utc().is_none() {
        return Err("无效的有效期日期".to_string());
    }
    Ok(Some(ts))
}

fn flag_should_turn_off(is_on: i32, expires_at: Option<&DbTs>, now: DateTime<Utc>) -> bool {
    is_on == 1 && expires_at.and_then(|t| t.to_utc()).is_some_and(|t| t <= now)
}

fn apply_flag_expiry(is_on: i32, expires_at: Option<&DbTs>, now: DateTime<Utc>) -> i32 {
    if flag_should_turn_off(is_on, expires_at, now) {
        0
    } else {
        is_on
    }
}

fn resolve_create_expires(
    is_on: i32,
    raw: Option<&str>,
    now: DateTime<Utc>,
) -> AppResult<Option<DbTs>> {
    match raw {
        Some(s) if is_permanent_expire(s) => Ok(None),
        Some(s) => parse_flag_expires_at(Some(s)).map_err(AppError::BadRequest),
        None if is_on == 1 => Ok(Some(default_flag_expires_at(now))),
        None => Ok(None),
    }
}

fn resolve_update_expires(
    is_on: i32,
    raw: Option<&str>,
    current: Option<DbTs>,
    now: DateTime<Utc>,
) -> AppResult<Option<DbTs>> {
    match raw {
        Some(s) if is_permanent_expire(s) => Ok(None),
        Some(s) => parse_flag_expires_at(Some(s)).map_err(AppError::BadRequest),
        None => {
            if current.is_some() {
                Ok(current)
            } else if is_on == 1 {
                Ok(Some(default_flag_expires_at(now)))
            } else {
                Ok(None)
            }
        }
    }
}

pub(crate) async fn apply_announcement_expiries(state: &Arc<AppState>) -> AppResult<()> {
    sqlx::query(
        "UPDATE announcements SET
            is_pinned = CASE
                WHEN is_pinned = 1 AND pin_expires_at IS NOT NULL AND pin_expires_at <= NOW() THEN 0
                ELSE is_pinned
            END,
            is_popup = CASE
                WHEN is_popup = 1 AND popup_expires_at IS NOT NULL AND popup_expires_at <= NOW() THEN 0
                ELSE is_popup
            END,
            is_active = CASE
                WHEN is_active = 1 AND active_expires_at IS NOT NULL AND active_expires_at <= NOW() THEN 0
                ELSE is_active
            END
         WHERE (is_pinned = 1 AND pin_expires_at IS NOT NULL AND pin_expires_at <= NOW())
            OR (is_popup = 1 AND popup_expires_at IS NOT NULL AND popup_expires_at <= NOW())
            OR (is_active = 1 AND active_expires_at IS NOT NULL AND active_expires_at <= NOW())",
    )
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

pub async fn list_admin_announcements(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    apply_announcement_expiries(&state).await?;
    let announcements: Vec<Announcement> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM announcements ORDER BY sort_order DESC, id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": announcements
    })))
}

pub(crate) async fn load_public_announcements(
    state: &Arc<AppState>,
) -> AppResult<Vec<Announcement>> {
    apply_announcement_expiries(state).await?;
    let announcements: Vec<Announcement> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM announcements WHERE is_active = 1 ORDER BY is_pinned DESC, sort_order DESC, id DESC LIMIT 10",
    ))
    .fetch_all(&state.db.pool)
    .await?;
    Ok(announcements)
}

pub async fn get_public_announcements(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let announcements = load_public_announcements(&state).await?;

    Ok(Json(json!({
        "success": true,
        "data": announcements
    })))
}

pub async fn create_announcement(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateAnnouncementReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let now_dt = Utc::now();
    let now = DbTs::from_utc(now_dt);
    let is_popup = payload.is_popup.unwrap_or(0);
    let sort_order = payload.sort_order.unwrap_or(0);
    let pin_expires_at =
        resolve_create_expires(payload.is_pinned, payload.pin_expires_at.as_deref(), now_dt)?;
    let popup_expires_at =
        resolve_create_expires(is_popup, payload.popup_expires_at.as_deref(), now_dt)?;
    let active_expires_at =
        resolve_create_expires(payload.is_active, payload.active_expires_at.as_deref(), now_dt)?;
    let is_pinned = apply_flag_expiry(payload.is_pinned, pin_expires_at.as_ref(), now_dt);
    let is_popup = apply_flag_expiry(is_popup, popup_expires_at.as_ref(), now_dt);
    let is_active = apply_flag_expiry(payload.is_active, active_expires_at.as_ref(), now_dt);
    let display_time_mode =
        normalize_display_time_mode(payload.display_time_mode.as_deref(), DISPLAY_TIME_CREATED)?;

    let announcement: Announcement = sqlx::query_as(&state.db.format_query(
        "INSERT INTO announcements (title, content, is_pinned, is_popup, is_active, sort_order, pin_expires_at, popup_expires_at, active_expires_at, display_time_mode, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    ))
    .bind(&payload.title)
    .bind(&payload.content)
    .bind(is_pinned)
    .bind(is_popup)
    .bind(is_active)
    .bind(sort_order)
    .bind(&pin_expires_at)
    .bind(&popup_expires_at)
    .bind(&active_expires_at)
    .bind(&display_time_mode)
    .bind(&now)
    .bind(&now)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "通知创建成功",
        "data": announcement
    })))
}

pub async fn update_announcement(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateAnnouncementReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let current: Announcement = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM announcements WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("通知不存在".to_string()))?;

    let now_dt = Utc::now();
    let touch_updated = should_touch_updated_at(&payload);
    let display_time_mode = normalize_display_time_mode(
        payload.display_time_mode.as_deref(),
        &current.display_time_mode,
    )?;
    let title = payload.title.unwrap_or(current.title);
    let content = payload.content.unwrap_or(current.content);
    let is_pinned = payload.is_pinned.unwrap_or(current.is_pinned);
    let is_popup = payload.is_popup.unwrap_or(current.is_popup);
    let is_active = payload.is_active.unwrap_or(current.is_active);
    let sort_order = payload.sort_order.unwrap_or(current.sort_order);
    let pin_expires_at = resolve_update_expires(
        is_pinned,
        payload.pin_expires_at.as_deref(),
        current.pin_expires_at,
        now_dt,
    )?;
    let popup_expires_at = resolve_update_expires(
        is_popup,
        payload.popup_expires_at.as_deref(),
        current.popup_expires_at,
        now_dt,
    )?;
    let active_expires_at = resolve_update_expires(
        is_active,
        payload.active_expires_at.as_deref(),
        current.active_expires_at,
        now_dt,
    )?;
    let is_pinned = apply_flag_expiry(is_pinned, pin_expires_at.as_ref(), now_dt);
    let is_popup = apply_flag_expiry(is_popup, popup_expires_at.as_ref(), now_dt);
    let is_active = apply_flag_expiry(is_active, active_expires_at.as_ref(), now_dt);
    let now = if touch_updated {
        DbTs::from_utc(now_dt)
    } else {
        current.updated_at
    };

    let updated: Announcement = sqlx::query_as(
        &state.db.format_query(
            "UPDATE announcements SET title = ?, content = ?, is_pinned = ?, is_popup = ?, is_active = ?, sort_order = ?, pin_expires_at = ?, popup_expires_at = ?, active_expires_at = ?, display_time_mode = ?, updated_at = ? WHERE id = ? RETURNING *"
        )
    )
    .bind(&title)
    .bind(&content)
    .bind(is_pinned)
    .bind(is_popup)
    .bind(is_active)
    .bind(sort_order)
    .bind(&pin_expires_at)
    .bind(&popup_expires_at)
    .bind(&active_expires_at)
    .bind(&display_time_mode)
    .bind(&now)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "通知更新成功",
        "data": updated
    })))
}

pub async fn delete_announcement(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM announcements WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "通知删除成功"
    })))
}
