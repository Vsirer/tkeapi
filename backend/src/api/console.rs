/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 控制台壳数据一次拉取：资料 + 公告 + 活跃插件（不含看板聚合）

use crate::auth;
use crate::error::AppResult;
use crate::models::{Announcement, User};
use crate::AppState;
use axum::{
    extract::{Extension, State},
    Json,
};
use std::sync::Arc;

#[derive(Debug, serde::Serialize)]
pub struct ConsoleBootstrap {
    pub user: User,
    pub announcements: Vec<Announcement>,
    pub active_plugins: Vec<serde_json::Value>,
}

/// GET /api/v1/console/bootstrap
pub async fn get_bootstrap(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<ConsoleBootstrap>> {
    let (user_res, announcements_res, plugins_res) = tokio::join!(
        crate::api::user::load_profile_user(&state, &claims),
        crate::api::announcements::load_public_announcements(&state),
        crate::api::plugins::load_active_plugins(&state),
    );

    let announcements = match announcements_res {
        Ok(list) => list,
        Err(e) => {
            tracing::warn!("console bootstrap announcements failed: {:?}", e);
            Vec::new()
        }
    };
    let active_plugins = match plugins_res {
        Ok(list) => list,
        Err(e) => {
            tracing::warn!("console bootstrap plugins failed: {:?}", e);
            Vec::new()
        }
    };

    Ok(Json(ConsoleBootstrap {
        user: user_res?,
        announcements,
        active_plugins,
    }))
}
