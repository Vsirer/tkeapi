/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    models::{Announcement, CreateAnnouncementReq, UpdateAnnouncementReq},
    time_system::DbTs,
    AppState,
};

pub async fn list_admin_announcements(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
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
    let now = DbTs::now();
    let is_popup = payload.is_popup.unwrap_or(0);
    let sort_order = payload.sort_order.unwrap_or(0);

    let announcement: Announcement = sqlx::query_as(&state.db.format_query(
        "INSERT INTO announcements (title, content, is_pinned, is_popup, is_active, sort_order, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    ))
    .bind(&payload.title)
    .bind(&payload.content)
    .bind(payload.is_pinned)
    .bind(is_popup)
    .bind(payload.is_active)
    .bind(sort_order)
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

    let title = payload.title.unwrap_or(current.title);
    let content = payload.content.unwrap_or(current.content);
    let is_pinned = payload.is_pinned.unwrap_or(current.is_pinned);
    let is_popup = payload.is_popup.unwrap_or(current.is_popup);
    let is_active = payload.is_active.unwrap_or(current.is_active);
    let sort_order = payload.sort_order.unwrap_or(current.sort_order);
    let now = DbTs::now();

    let updated: Announcement = sqlx::query_as(
        &state.db.format_query(
            "UPDATE announcements SET title = ?, content = ?, is_pinned = ?, is_popup = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ? RETURNING *"
        )
    )
    .bind(&title)
    .bind(&content)
    .bind(is_pinned)
    .bind(is_popup)
    .bind(is_active)
    .bind(sort_order)
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
