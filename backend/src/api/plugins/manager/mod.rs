/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 插件中心「通用壳」：列表/开关、`plugin_configs`、HA/存储/审核、创作中心、模型广场。
//!
//! ## 目录
//! - `mod.rs` — router、seed、`is_plugin_compiled`、registry/config、HA/存储/审核、object_store、api_logs
//! - `playground.rs` — 创作中心 schemes 与配置 API
//! - `marketplace.rs` — 模型广场缓存与 API
//! - `volc_enhance.rs` — 火山画质增强（`plugin_volcengine_enhance` feature，关 feature 时不编译）
//! - `*_seed.rs` — 方案种子，由迁移或 init 调用
//!
//! ## 新插件
//! 业务 API 放 `plugins/{name}/` 自有目录并在 `api/mod.rs` 挂 router；勿把业务逻辑堆进本目录。
//! 仅插件中心 UI 需要的配置键：创作中心→`playground.rs`，广场→`marketplace.rs`，Volc→`volc_enhance.rs`，
//! 通用 toggle/upsert→`mod.rs`；router 用 `playground::handler` 等显式路径，handler 用 `pub(crate)`。
//!
//! ## 可移除（feature 三连）
//! `Cargo.toml` feature → `plugins/mod.rs` `#[cfg] pub mod` → `is_plugin_compiled` 补一行。
//! 关 feature 后基础 relay/用户功能不得依赖该插件。
//!
//! ## 契约
//! `plugins/mod.rs` 的 `pub use manager::*` 不可破坏；新增 `pub` API 前先确认是否必须对外。

use crate::time_system::DbTs;
use axum::{
    extract::{Extension, Path, State},
    routing::{get, post},
    Json, Router,
};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub(crate) mod quick_bar_seed;
pub(crate) mod seedream_5_0_pro_seed;
pub(crate) mod minimax_h3_seed;
pub(crate) mod dashscope_video_seed;
pub(crate) mod seedance2_seed;
pub(crate) mod duration_slider_seed;
pub(crate) mod gpt_image_2_seed;
pub(crate) mod marketplace_visibility;
pub use marketplace_visibility::*;

mod marketplace;
mod playground;
#[cfg(feature = "plugin_volcengine_enhance")]
mod volc_enhance;

pub use marketplace::*;
#[cfg(feature = "plugin_volcengine_enhance")]
pub use volc_enhance::*;

use crate::{
    auth,
    error::{AppError, AppResult},
    models::{plugin::sanitize_admin_menu_default_tab, Plugin},
    services::object_store::{is_global_storage_default, ObjectStore, StoreKind},
    AppState,
};
use serde::Deserialize;
use serde_json::{json, Value};
pub fn router() -> Router<Arc<AppState>> {
    let mut r = Router::new()
        .route("/", get(list_plugins))
        .route("/{name}/toggle", post(toggle_plugin))
        .route("/{name}/config", post(update_plugin_config))
        .route("/{name}/ha-config", get(get_ha_config).post(save_ha_config))
        .route("/{name}/ha-runtime/clear", post(clear_ha_runtime))
        .route("/{name}/ha-logs", get(get_ha_logs))
        .route(
            "/{name}/storage-config",
            get(get_storage_config).post(save_storage_config),
        )
        .route(
            "/{name}/moderation-config",
            get(get_moderation_config).post(save_moderation_config),
        )
        .route(
            "/{name}/playground-config",
            get(playground::get_playground_config).post(playground::save_playground_config),
        )
        .route(
            "/{name}/playground-schemes",
            get(playground::get_playground_schemes).post(playground::save_playground_schemes),
        )
        .route(
            "/{name}/playground-public-config",
            get(playground::get_playground_public_config),
        )
        .route(
            "/{name}/marketplace-models",
            get(marketplace::get_marketplace_models).post(marketplace::save_marketplace_models),
        )
        .route(
            "/{name}/marketplace-models/toggle",
            post(marketplace::toggle_marketplace_model),
        )
        .route(
            "/{name}/marketplace-models/batch-toggle",
            post(marketplace::batch_toggle_marketplace_models),
        )
        .route("/{name}/test-connection", post(test_tos_connection))
        .route("/{name}/api-logs", get(get_plugin_api_logs));

    #[cfg(feature = "plugin_volcengine_enhance")]
    {
        r = r
            .route(
                "/{name}/volcengine-enhance-config",
                get(volc_enhance::get_volcengine_enhance_config)
                    .post(volc_enhance::save_volcengine_enhance_config),
            )
            .route(
                "/{name}/test-volcengine-connection",
                post(volc_enhance::test_volcengine_connection),
            )
            .route("/{name}/enhance-logs", get(volc_enhance::get_volcengine_enhance_logs))
            .route(
                "/{name}/enhance-logs/recover",
                get(volc_enhance::get_volcengine_enhance_logs_recover_status)
                    .post(volc_enhance::start_volcengine_enhance_logs_recover),
            );
    }

    r
}

/// 开源白名单：playground / docs_api / model_marketplace / site_portal / site_icons / high_availability_channel
/// 其余商业插件由 feature 门控；未知插件仅在商业版放行。
/// 转发规则等列表展示可复用此门控，与插件中心保持一致。
pub fn is_plugin_compiled(name: &str) -> bool {
    match name {
        "site_icons" => cfg!(feature = "plugin_site_icons"),
        "site_portal" => cfg!(feature = "plugin_site_portal"),
        "site_portal_pro" => cfg!(feature = "commercial_plugins"),
        "playground_2026" => cfg!(feature = "commercial_plugins"),
        "team_marketing" => cfg!(all(feature = "commercial_plugins", plugin_team_marketing)),
        "volcengine_ark_monitor" => cfg!(feature = "commercial_plugins"),
        "volcengine_enhance" => cfg!(feature = "plugin_volcengine_enhance"),
        "asset_manager" => cfg!(feature = "commercial_plugins"),
        "asset_manager_intl" => cfg!(feature = "commercial_plugins"),
        "upstream_asset_relay" => cfg!(feature = "commercial_plugins"),
        "data_sync" => cfg!(feature = "plugin_data_sync"),
        "comfyui_bridge" => cfg!(feature = "plugin_comfyui"),
        "content_security" => cfg!(feature = "plugin_content_security"),
        _ => true,
    }
}

/// 管理员：获取所有插件列表
async fn list_plugins(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let mut plugins: Vec<Plugin> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugins ORDER BY id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 动态过滤掉当前未编译（被物理剥离）的插件
    plugins.retain(|p| is_plugin_compiled(&p.name));

    Ok(Json(json!({ "plugins": plugins })))
}

pub async fn load_active_plugins(state: &Arc<AppState>) -> AppResult<Vec<serde_json::Value>> {
    let mut plugins: Vec<Plugin> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugins WHERE is_enabled = 1"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 动态过滤掉当前未编译（被物理剥离）的插件
    plugins.retain(|p| is_plugin_compiled(&p.name));

    let mut enhanced_plugins = Vec::new();
    for plugin in plugins {
        let mut p_json = serde_json::to_value(&plugin).unwrap_or(serde_json::Value::Null);
        if plugin.name == "asset_manager" || plugin.name == "asset_manager_intl" {
            let config_val: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = 'show_in_playground_prompt'")
            )
            .bind(&plugin.name)
            .fetch_optional(&state.db.pool)
            .await?;
            let show = config_val.unwrap_or_else(|| "false".to_string()) == "true";
            if let Some(obj) = p_json.as_object_mut() {
                obj.insert("show_in_playground_prompt".to_string(), json!(show));
            }
        }
        if plugin.name == "model_marketplace" || plugin.name == "docs_api" {
            let config_val: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = 'mp_allow_guest'")
            )
            .bind(&plugin.name)
            .fetch_optional(&state.db.pool)
            .await?;
            let allow_guest = config_val.unwrap_or_else(|| "false".to_string()) == "true";
            if let Some(obj) = p_json.as_object_mut() {
                obj.insert("mp_allow_guest".to_string(), json!(allow_guest));
            }
        }
        enhanced_plugins.push(p_json);
    }

    Ok(enhanced_plugins)
}

/// 公开接口：无需认证即可获取活跃插件列表（供前端菜单渲染）
pub async fn get_active_plugins_public(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let enhanced_plugins = load_active_plugins(&state).await?;
    Ok(Json(json!({ "active_plugins": enhanced_plugins })))
}

#[derive(Deserialize)]
pub struct ToggleRequest {
    pub is_enabled: i64,
}

/// 管理员：开关插件
async fn toggle_plugin(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ToggleRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    sqlx::query(&state.db.format_query(
        "UPDATE plugins SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
    ))
    .bind(payload.is_enabled)
    .bind(&name)
    .execute(&state.db.pool)
    .await?;

    if name == crate::relay::relay_settings::HA_PLUGIN_NAME {
        crate::relay::relay_settings::put_cached_ha_enabled(payload.is_enabled == 1);
    }

    if name == "volcengine_enhance" && payload.is_enabled == 1 {
        let _ = crate::api::billing_rules::ensure_volcengine_enhance_system_rules(&state).await;
    }

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(json!({ "message": "ok" })))
}

#[derive(Deserialize)]
pub struct ConfigRequest {
    pub allowed_levels: Option<String>, // 可选：仅更新开放等级时传入
    pub level_quotas: Option<HashMap<String, i64>>, // 每个等级的存储配额(MB)
    pub default_quota: Option<i64>,     // 默认存储配额(MB)
    pub level_max_folders: Option<HashMap<String, i64>>, // 每个等级的文件夹数量上限
    pub default_max_folders: Option<i64>, // 默认文件夹数量上限
    pub level_max_files_per_folder: Option<HashMap<String, i64>>, // 每个等级的每文件夹文件上限
    pub default_max_files_per_folder: Option<i64>, // 默认每文件夹文件上限
    pub level_api_enabled: Option<HashMap<String, bool>>, // 每个等级的 API 接口开放状态
    pub default_api_enabled: Option<bool>, // 默认 API 接口开放状态
    pub api_access_mode: Option<String>, // level | user
    pub api_user_mode: Option<String>,  // include | exclude
    pub api_user_ids: Option<Vec<String>>, // 按用户设置时的用户 ID 列表
    pub level_max_projects: Option<HashMap<String, i64>>, // 每个等级的项目数量上限
    pub default_max_projects: Option<i64>, // 默认项目数量上限
    pub level_max_assets: Option<HashMap<String, i64>>, // 每个等级的素材数量上限
    pub default_max_assets: Option<i64>, // 默认素材数量上限
    /// 创作中心2026：单个工作流节点上限（全局）
    pub workflow_node_limit: Option<i64>,
    /// 创作中心2026：工作流功能总开关（默认关闭）
    pub workflow_enabled: Option<bool>,
    /// 创作中心2026：用户端工作流菜单名称（默认「工作流」）
    pub workflow_menu_title: Option<String>,
    /// 创作中心2026：是否开放火山增强节点
    pub volc_enhance_enabled: Option<bool>,
    /// 创作中心2026：是否开放导演台节点
    pub director_enabled: Option<bool>,
    pub show_in_playground_prompt: Option<bool>, // 体验中心提示词输入窗口加载显示
    pub docs_api_allow_guest: Option<bool>,      // 文档API是否允许免登录访问
    pub show_in_admin_menu: Option<i64>,         // 管理后台左侧二级菜单开关
    pub admin_menu_sort: Option<i64>,            // 二级菜单排序权重（越大越靠前）
    pub admin_menu_title: Option<String>,        // 二级菜单自定义名称
    pub admin_menu_default_tab: Option<String>,  // 点击二级菜单后打开的 Tab key
}

/// 判断用户是否允许调用素材 API（纯逻辑，与 HTTP 层解耦）
/// - mode=level：按等级开关，缺省回落到 default_api_enabled（默认 false，需显式开启）
/// - mode=user：include=仅列表内可调用；exclude=列表外可调用
/// 注意：调用方须先校验插件 enabled + allowed_levels，本函数只做 API 细分闸
pub fn is_asset_api_enabled(
    configs: &HashMap<String, String>,
    user_id: &str,
    user_group: &str,
    level_id: Option<i64>,
) -> bool {
    let mode = configs
        .get("api_access_mode")
        .map(|s| s.as_str())
        .unwrap_or("level");

    if mode == "user" {
        let ids: Vec<String> = configs
            .get("api_user_ids")
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let in_list = ids.iter().any(|id| id == user_id);
        let exclude = configs
            .get("api_user_mode")
            .map(|s| s.as_str())
            .unwrap_or("include")
            == "exclude";
        return if exclude { !in_list } else { in_list };
    }

    let default_enabled = configs
        .get("api_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    configs
        .get(&format!("api_enabled_{}", user_group))
        .or_else(|| level_id.and_then(|id| configs.get(&format!("api_enabled_{}", id))))
        .map(|v| v.as_str() == "true")
        .unwrap_or(default_enabled)
}

/// 管理员：配置插件的开放等级
async fn update_plugin_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    if let Some(ref allowed) = payload.allowed_levels {
        sqlx::query(&state.db.format_query(
            "UPDATE plugins SET allowed_levels = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
        ))
        .bind(allowed)
        .bind(&name)
        .execute(&state.db.pool)
        .await?;
    }

    // 保存每个等级的存储配额
    if let Some(quotas) = &payload.level_quotas {
        for (level_key, quota_mb) in quotas {
            let config_key = format!("quota_{}", level_key);
            upsert_config(&state, &name, &config_key, &quota_mb.to_string()).await?;
        }
    }

    // 保存默认存储配额
    if let Some(dq) = payload.default_quota {
        upsert_config(&state, &name, "default_quota", &dq.to_string()).await?;
    }

    // 保存每个等级的文件夹数量上限
    if let Some(ref level_mf) = payload.level_max_folders {
        for (level_key, val) in level_mf {
            let config_key = format!("max_folders_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    // 保存默认文件夹数量上限
    if let Some(dmf) = payload.default_max_folders {
        upsert_config(&state, &name, "max_folders", &dmf.to_string()).await?;
    }

    // 保存每个等级的每文件夹文件上限
    if let Some(ref level_mfpf) = payload.level_max_files_per_folder {
        for (level_key, val) in level_mfpf {
            let config_key = format!("max_files_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    // 保存默认每文件夹文件上限
    if let Some(dmfpf) = payload.default_max_files_per_folder {
        upsert_config(&state, &name, "max_files_per_folder", &dmfpf.to_string()).await?;
    }

    // 保存每个等级的 API 访问开关
    if let Some(ref level_api) = payload.level_api_enabled {
        for (level_key, val) in level_api {
            let config_key = format!("api_enabled_{}", level_key);
            upsert_config(
                &state,
                &name,
                &config_key,
                if *val { "true" } else { "false" },
            )
            .await?;
        }
    }

    // 保存默认 API 访问开关
    if let Some(dae) = payload.default_api_enabled {
        upsert_config(
            &state,
            &name,
            "api_enabled",
            if dae { "true" } else { "false" },
        )
        .await?;
    }

    // 保存 API 访问模式：按等级 / 按用户
    if let Some(ref mode) = payload.api_access_mode {
        let normalized = if mode == "user" { "user" } else { "level" };
        upsert_config(&state, &name, "api_access_mode", normalized).await?;
    }
    if let Some(ref user_mode) = payload.api_user_mode {
        let normalized = if user_mode == "exclude" {
            "exclude"
        } else {
            "include"
        };
        upsert_config(&state, &name, "api_user_mode", normalized).await?;
    }
    if let Some(ref user_ids) = payload.api_user_ids {
        let ids_json = serde_json::to_string(user_ids).unwrap_or_else(|_| "[]".to_string());
        upsert_config(&state, &name, "api_user_ids", &ids_json).await?;
    }

    // 保存每个等级的项目上限
    if let Some(ref level_mp) = payload.level_max_projects {
        for (level_key, val) in level_mp {
            let config_key = format!("max_projects_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    if let Some(dmp) = payload.default_max_projects {
        upsert_config(&state, &name, "default_max_projects", &dmp.to_string()).await?;
    }

    // 保存每个等级的素材上限
    if let Some(ref level_ma) = payload.level_max_assets {
        for (level_key, val) in level_ma {
            let config_key = format!("max_assets_{}", level_key);
            upsert_config(&state, &name, &config_key, &val.to_string()).await?;
        }
    }

    if let Some(dma) = payload.default_max_assets {
        upsert_config(&state, &name, "default_max_assets", &dma.to_string()).await?;
    }

    if let Some(wnl) = payload.workflow_node_limit {
        let v = if wnl < 1 { 1 } else { wnl };
        upsert_config(&state, &name, "workflow_node_limit", &v.to_string()).await?;
    }

    if let Some(enabled) = payload.workflow_enabled {
        upsert_config(
            &state,
            &name,
            "workflow_enabled",
            if enabled { "true" } else { "false" },
        )
        .await?;
    }

    if let Some(title) = payload.workflow_menu_title {
        upsert_config(&state, &name, "workflow_menu_title", title.trim()).await?;
    }

    if name == "playground_2026" {
        if let Some(enabled) = payload.volc_enhance_enabled {
            upsert_config(
                &state,
                &name,
                "pg_advanced_node_volc_enhance_enabled",
                if enabled { "true" } else { "false" },
            )
            .await?;
        }
        if let Some(enabled) = payload.director_enabled {
            upsert_config(
                &state,
                &name,
                "pg_advanced_node_director_enabled",
                if enabled { "true" } else { "false" },
            )
            .await?;
        }
    }

    if let Some(show) = payload.show_in_playground_prompt {
        upsert_config(
            &state,
            &name,
            "show_in_playground_prompt",
            if show { "true" } else { "false" },
        )
        .await?;
    }

    // 保存 docs_api 是否允许游客访问
    if let Some(allow_guest) = payload.docs_api_allow_guest {
        upsert_config(
            &state,
            &name,
            "mp_allow_guest",
            if allow_guest { "true" } else { "false" },
        )
        .await?;
    }

    if payload.show_in_admin_menu.is_some()
        || payload.admin_menu_sort.is_some()
        || payload.admin_menu_title.is_some()
        || payload.admin_menu_default_tab.is_some()
    {
        let menu_flag = payload
            .show_in_admin_menu
            .map(|v| if v == 0 { 0i64 } else { 1i64 });
        let menu_title = payload.admin_menu_title.as_deref().map(str::trim);
        let default_tab = payload
            .admin_menu_default_tab
            .as_deref()
            .map(sanitize_admin_menu_default_tab);
        sqlx::query(&state.db.format_query(
            "UPDATE plugins SET show_in_admin_menu = COALESCE(?::bigint, show_in_admin_menu), \
             admin_menu_sort = COALESCE(?::bigint, admin_menu_sort), \
             admin_menu_title = COALESCE(?::text, admin_menu_title), \
             admin_menu_default_tab = COALESCE(?::text, admin_menu_default_tab), \
             updated_at = CURRENT_TIMESTAMP WHERE name = ?",
        ))
        .bind(menu_flag)
        .bind(payload.admin_menu_sort)
        .bind(menu_title)
        .bind(default_tab)
        .bind(&name)
        .execute(&state.db.pool)
        .await?;
    }

    Ok(Json(json!({ "message": "ok" })))
}

// ========== 存储配置 ==========

/// 辅助：从 DB 加载插件的所有 config
async fn load_plugin_configs(
    state: &AppState,
    plugin_name: &str,
) -> Result<HashMap<String, String>, sqlx::Error> {
    let rows: Vec<(String, String)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT config_key, config_value FROM plugin_configs WHERE plugin_name = ?",
        ))
        .bind(plugin_name)
        .fetch_all(&state.db.pool)
        .await?;

    Ok(rows.into_iter().collect())
}

/// 公开版本：供其他模块调用
pub async fn load_plugin_configs_pub(
    state: &AppState,
    plugin_name: &str,
) -> Result<HashMap<String, String>, sqlx::Error> {
    load_plugin_configs(state, plugin_name).await
}

/// 转换素材缓存自动清理保留天数（plugin_configs）；缺省 7；0=关闭。
pub const CONVERT_CACHE_RETENTION_KEY: &str = "convert_cache_retention_days";
const DEFAULT_CONVERT_CACHE_RETENTION_DAYS: i32 = 7;

/// 读取插件级转换素材保留天数；未配置时默认 7。
pub async fn load_convert_cache_retention_days(state: &AppState, plugin_name: &str) -> i32 {
    if let Ok(configs) = load_plugin_configs(state, plugin_name).await {
        if let Some(v) = configs.get(CONVERT_CACHE_RETENTION_KEY) {
            if let Ok(n) = v.trim().parse::<i32>() {
                return n.clamp(0, 365);
            }
        }
    }
    DEFAULT_CONVERT_CACHE_RETENTION_DAYS
}

pub async fn save_convert_cache_retention_days(
    state: &AppState,
    plugin_name: &str,
    days: i32,
) -> Result<(), sqlx::Error> {
    upsert_config(
        state,
        plugin_name,
        CONVERT_CACHE_RETENTION_KEY,
        &days.clamp(0, 365).to_string(),
    )
    .await
}

/// 辅助：保存 config（upsert）—— 改用数据库原生 ON CONFLICT DO UPDATE 确保原子性（修复 Issue 5）
pub async fn upsert_config(
    state: &AppState,
    plugin_name: &str,
    key: &str,
    value: &str,
) -> Result<(), sqlx::Error> {
    // PostgreSQL 使用 ON CONFLICT (plugin_name, config_key) DO UPDATE
    // SQLite 兑换成 INSERT OR REPLACE -- format_query 会处理占位符转换
    let sql = state.db.format_query(
        "INSERT INTO plugin_configs (plugin_name, config_key, config_value, updated_at) \
         VALUES (?, ?, ?, CURRENT_TIMESTAMP) \
         ON CONFLICT (plugin_name, config_key) DO UPDATE \
         SET config_value = EXCLUDED.config_value, updated_at = CURRENT_TIMESTAMP",
    );
    sqlx::query(&sql)
        .bind(plugin_name)
        .bind(key)
        .bind(value)
        .execute(&state.db.pool)
        .await?;
    Ok(())
}

/// 管理员：获取存储配置（secret_key 脱敏）
async fn get_storage_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;
    let global_config = crate::relay::tos_persist::load_system_object_store(&state).await;
    let stored_provider = configs
        .get("default_provider")
        .cloned()
        .unwrap_or_else(|| "tos".to_string());
    let own_store = if is_global_storage_default(&stored_provider) {
        None
    } else {
        ObjectStore::from_plugin_map_for(&configs, StoreKind::parse(&stored_provider))
    };

    fn mask_key(sk: &str) -> String {
        crate::models::channel::mask_secret(sk)
    }

    let tos_sk = configs.get("tos_secret_key").cloned().unwrap_or_default();
    let cos_sk = configs.get("cos_secret_key").cloned().unwrap_or_default();

    // 提取等级配额、限制和 API 开关
    let mut level_quotas = serde_json::Map::new();
    let mut level_max_folders = serde_json::Map::new();
    let mut level_max_files = serde_json::Map::new();
    let mut level_api_enabled = serde_json::Map::new();
    let mut level_max_projects = serde_json::Map::new();
    let mut level_max_assets = serde_json::Map::new();
    for (k, v) in &configs {
        if let Some(level_key) = k.strip_prefix("quota_") {
            let mb: i64 = v.parse().unwrap_or(100);
            level_quotas.insert(level_key.to_string(), serde_json::Value::Number(mb.into()));
        } else if let Some(level_key) = k.strip_prefix("max_folders_") {
            let val: i64 = v.parse().unwrap_or(20);
            level_max_folders.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        } else if let Some(level_key) = k.strip_prefix("max_files_") {
            let val: i64 = v.parse().unwrap_or(100);
            level_max_files.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        } else if let Some(level_key) = k.strip_prefix("api_enabled_") {
            let val = v == "true";
            level_api_enabled.insert(level_key.to_string(), serde_json::Value::Bool(val));
        } else if let Some(level_key) = k.strip_prefix("max_projects_") {
            let val: i64 = v.parse().unwrap_or(3);
            level_max_projects.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        } else if let Some(level_key) = k.strip_prefix("max_assets_") {
            let val: i64 = v.parse().unwrap_or(30);
            level_max_assets.insert(level_key.to_string(), serde_json::Value::Number(val.into()));
        }
    }

    // 提取全局默认配置
    let default_quota: i64 = configs
        .get("default_quota")
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    let default_max_folders: i64 = configs
        .get("max_folders")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20);
    let default_max_files_per_folder: i64 = configs
        .get("max_files_per_folder")
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    let default_api_enabled: bool = configs
        .get("api_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    let api_access_mode = configs
        .get("api_access_mode")
        .cloned()
        .unwrap_or_else(|| "level".to_string());
    let api_user_mode = configs
        .get("api_user_mode")
        .cloned()
        .unwrap_or_else(|| "include".to_string());
    let api_user_ids: Vec<String> = configs
        .get("api_user_ids")
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let default_max_projects: i64 = configs
        .get("default_max_projects")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);
    let default_max_assets: i64 = configs
        .get("default_max_assets")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    let workflow_node_limit: i64 = configs
        .get("workflow_node_limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(200);
    let workflow_enabled: bool = configs
        .get("workflow_enabled")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let workflow_menu_title: String = configs
        .get("workflow_menu_title")
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "工作流".to_string());
    let show_in_playground_prompt: bool = configs
        .get("show_in_playground_prompt")
        .map(|v| v == "true")
        .unwrap_or(false);
    let docs_api_allow_guest: bool = configs
        .get("mp_allow_guest")
        .map(|v| v == "true")
        .unwrap_or(false);

    // 解析已选用户的展示信息（uid/username/等级），便于管理端回显与开放状态提示
    let mut api_user_options: Vec<serde_json::Value> = Vec::new();
    if !api_user_ids.is_empty() {
        let placeholders = api_user_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = state.db.format_query(&format!(
            "SELECT u.id, u.username, u.uid, u.user_group, ul.id, ul.name \
             FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id IN ({})",
            placeholders
        ));
        let mut q = sqlx::query_as::<
            _,
            (String, String, String, String, Option<i64>, Option<String>),
        >(&sql);
        for id in &api_user_ids {
            q = q.bind(id);
        }
        if let Ok(rows) = q.fetch_all(&state.db.pool).await {
            let mut map: HashMap<String, (String, String, String, Option<i64>, Option<String>)> =
                rows.into_iter()
                    .map(|(id, username, uid, user_group, level_id, level_name)| {
                        (id, (username, uid, user_group, level_id, level_name))
                    })
                    .collect();
            for id in &api_user_ids {
                if let Some((username, uid, user_group, level_id, level_name)) = map.remove(id) {
                    api_user_options.push(json!({
                        "user_id": id,
                        "username": username,
                        "uid": uid,
                        "user_group": user_group,
                        "level_id": level_id,
                        "level_name": level_name,
                    }));
                } else {
                    api_user_options.push(json!({
                        "user_id": id,
                        "username": id,
                        "uid": "",
                    }));
                }
            }
        }
    }

    let mut body = json!({
        "default_provider": stored_provider,
        "tos_access_key": configs.get("tos_access_key").cloned().unwrap_or_default(),
        "tos_secret_key": tos_sk,
        "tos_secret_key_masked": mask_key(&tos_sk),
        "tos_endpoint": configs.get("tos_endpoint").cloned().unwrap_or_default(),
        "tos_region": configs.get("tos_region").cloned().unwrap_or_default(),
        "tos_bucket": configs.get("tos_bucket").cloned().unwrap_or_default(),
        "tos_path_prefix": configs.get("tos_path_prefix").cloned().unwrap_or_default(),
        "tos_custom_domain": configs.get("tos_custom_domain").cloned().unwrap_or_default(),
        "cos_secret_id": configs.get("cos_secret_id").cloned().unwrap_or_default(),
        "cos_secret_key": cos_sk,
        "cos_secret_key_masked": mask_key(&cos_sk),
        "cos_endpoint": configs.get("cos_endpoint").cloned().unwrap_or_default(),
        "cos_region": configs.get("cos_region").cloned().unwrap_or_default(),
        "cos_bucket": configs.get("cos_bucket").cloned().unwrap_or_default(),
        "cos_path_prefix": configs.get("cos_path_prefix").cloned().unwrap_or_default(),
        "cos_custom_domain": configs.get("cos_custom_domain").cloned().unwrap_or_default(),
        "is_configured": own_store.is_some() || global_config.is_some(),
        "global_configured": global_config.is_some(),
        "global_provider": global_config.as_ref().map(|c| c.provider()).unwrap_or("tos"),
        "global_bucket": global_config.as_ref().map(|c| c.bucket().to_string()).unwrap_or_default(),
        "global_endpoint": global_config.as_ref().map(|c| c.endpoint().to_string()).unwrap_or_default(),
        "global_region": global_config.as_ref().map(|c| c.region().to_string()).unwrap_or_default(),
        "global_path_prefix": global_config
            .as_ref()
            .map(|c| c.path_prefix().to_string())
            .unwrap_or_default(),
    });
    if let Some(obj) = body.as_object_mut() {
        obj.insert("level_quotas".into(), Value::Object(level_quotas));
        obj.insert("default_quota".into(), json!(default_quota));
        obj.insert("level_max_folders".into(), Value::Object(level_max_folders));
        obj.insert("default_max_folders".into(), json!(default_max_folders));
        obj.insert(
            "level_max_files_per_folder".into(),
            Value::Object(level_max_files),
        );
        obj.insert(
            "default_max_files_per_folder".into(),
            json!(default_max_files_per_folder),
        );
        obj.insert("level_api_enabled".into(), Value::Object(level_api_enabled));
        obj.insert("default_api_enabled".into(), json!(default_api_enabled));
        obj.insert("api_access_mode".into(), json!(api_access_mode));
        obj.insert("api_user_mode".into(), json!(api_user_mode));
        obj.insert("api_user_ids".into(), json!(api_user_ids));
        obj.insert("api_user_options".into(), json!(api_user_options));
        obj.insert(
            "level_max_projects".into(),
            Value::Object(level_max_projects),
        );
        obj.insert("default_max_projects".into(), json!(default_max_projects));
        obj.insert("level_max_assets".into(), Value::Object(level_max_assets));
        obj.insert("default_max_assets".into(), json!(default_max_assets));
        obj.insert("workflow_node_limit".into(), json!(workflow_node_limit));
        obj.insert("workflow_enabled".into(), json!(workflow_enabled));
        obj.insert(
            "workflow_menu_title".into(),
            json!(workflow_menu_title),
        );
        obj.insert(
            "show_in_playground_prompt".into(),
            json!(show_in_playground_prompt),
        );
        obj.insert("docs_api_allow_guest".into(), json!(docs_api_allow_guest));
    }
    Ok(Json(body))
}

#[derive(Deserialize)]
pub struct StorageConfigRequest {
    #[serde(default)]
    pub default_provider: String,
    #[serde(default)]
    pub tos_access_key: String,
    pub tos_secret_key: Option<String>,
    #[serde(default)]
    pub tos_endpoint: String,
    #[serde(default)]
    pub tos_region: String,
    #[serde(default)]
    pub tos_bucket: String,
    pub tos_path_prefix: Option<String>,
    pub tos_custom_domain: Option<String>,
    #[serde(default)]
    pub cos_secret_id: String,
    pub cos_secret_key: Option<String>,
    #[serde(default)]
    pub cos_endpoint: String,
    #[serde(default)]
    pub cos_region: String,
    #[serde(default)]
    pub cos_bucket: String,
    pub cos_path_prefix: Option<String>,
    pub cos_custom_domain: Option<String>,
}

/// 管理员：保存存储配置
async fn save_storage_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<StorageConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let provider = normalize_plugin_default_provider(&payload.default_provider);
    if is_global_storage_default(provider)
        && crate::relay::tos_persist::load_system_object_store(&state)
            .await
            .is_none()
    {
        return Err(AppError::BadRequest(
            "站点存储尚未配置完整，请先在「站点设置 → 存储设置」中配置".to_string(),
        ));
    }

    upsert_config(&state, &name, "tos_access_key", &payload.tos_access_key).await?;
    upsert_config(&state, &name, "tos_endpoint", &payload.tos_endpoint).await?;
    upsert_config(&state, &name, "tos_region", &payload.tos_region).await?;
    upsert_config(&state, &name, "tos_bucket", &payload.tos_bucket).await?;
    upsert_config(
        &state,
        &name,
        "tos_path_prefix",
        payload.tos_path_prefix.as_deref().unwrap_or(""),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "tos_custom_domain",
        payload.tos_custom_domain.as_deref().unwrap_or(""),
    )
    .await?;
    if let Some(ref sk) = payload.tos_secret_key {
        if !sk.is_empty() && !sk.contains("****") {
            upsert_config(&state, &name, "tos_secret_key", sk).await?;
        }
    }

    upsert_config(&state, &name, "default_provider", provider).await?;
    upsert_config(&state, &name, "cos_secret_id", &payload.cos_secret_id).await?;
    upsert_config(&state, &name, "cos_endpoint", &payload.cos_endpoint).await?;
    upsert_config(&state, &name, "cos_region", &payload.cos_region).await?;
    upsert_config(&state, &name, "cos_bucket", &payload.cos_bucket).await?;
    upsert_config(
        &state,
        &name,
        "cos_path_prefix",
        payload.cos_path_prefix.as_deref().unwrap_or(""),
    )
    .await?;
    upsert_config(
        &state,
        &name,
        "cos_custom_domain",
        payload.cos_custom_domain.as_deref().unwrap_or(""),
    )
    .await?;
    if let Some(ref sk) = payload.cos_secret_key {
        if !sk.is_empty() && !sk.contains("****") {
            upsert_config(&state, &name, "cos_secret_key", sk).await?;
        }
    }

    Ok(Json(json!({ "message": "存储配置已保存" })))
}

#[derive(Deserialize)]
pub struct TestConnectionRequest {
    #[serde(default)]
    pub provider: Option<String>,
    pub tos_access_key: Option<String>,
    pub tos_secret_key: Option<String>,
    pub tos_endpoint: Option<String>,
    pub tos_region: Option<String>,
    pub tos_bucket: Option<String>,
    pub tos_path_prefix: Option<String>,
    pub tos_custom_domain: Option<String>,
    pub cos_secret_id: Option<String>,
    pub cos_secret_key: Option<String>,
    pub cos_endpoint: Option<String>,
    pub cos_region: Option<String>,
    pub cos_bucket: Option<String>,
    pub cos_path_prefix: Option<String>,
    pub cos_custom_domain: Option<String>,
}

/// 管理员：测试 TOS 连接
async fn test_tos_connection(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<TestConnectionRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    if payload
        .provider
        .as_deref()
        .is_some_and(is_global_storage_default)
    {
        let store = crate::relay::tos_persist::load_system_object_store(&state)
            .await
            .ok_or_else(|| {
                AppError::BadRequest(
                    "站点存储尚未配置完整，请先在「站点设置 → 存储设置」中配置".to_string(),
                )
            })?;
        return match store.test_connection().await {
            Ok(msg) => Ok(Json(json!({ "success": true, "message": msg }))),
            Err(msg) => Ok(Json(json!({ "success": false, "message": msg }))),
        };
    }

    let kind = StoreKind::parse(payload.provider.as_deref().unwrap_or("tos"));
    let mut configs = HashMap::new();
    for (k, v) in [
        ("tos_access_key", payload.tos_access_key),
        ("tos_secret_key", payload.tos_secret_key),
        ("tos_endpoint", payload.tos_endpoint),
        ("tos_region", payload.tos_region),
        ("tos_bucket", payload.tos_bucket),
        ("tos_path_prefix", payload.tos_path_prefix),
        ("tos_custom_domain", payload.tos_custom_domain),
        ("cos_secret_id", payload.cos_secret_id),
        ("cos_secret_key", payload.cos_secret_key),
        ("cos_endpoint", payload.cos_endpoint),
        ("cos_region", payload.cos_region),
        ("cos_bucket", payload.cos_bucket),
        ("cos_path_prefix", payload.cos_path_prefix),
        ("cos_custom_domain", payload.cos_custom_domain),
    ] {
        configs.insert(k.to_string(), v.unwrap_or_default());
    }
    let sk_field = match kind {
        StoreKind::Tos => "tos_secret_key",
        StoreKind::Cos => "cos_secret_key",
    };
    let submitted_sk = configs.get(sk_field).map(|s| s.as_str()).unwrap_or("");
    if submitted_sk.is_empty() || submitted_sk.contains("****") {
        if let Ok(saved) = load_plugin_configs(&state, &name).await {
            if let Some(sk) = saved.get(sk_field).filter(|s| !s.is_empty()) {
                configs.insert(sk_field.to_string(), sk.clone());
            }
        }
    }

    let Some(store) = ObjectStore::from_plugin_map_for(&configs, kind) else {
        return Ok(Json(json!({
            "success": false,
            "message": "请先填写该存储的完整凭证（密钥、地域、Endpoint、Bucket）",
        })));
    };

    match store.test_connection().await {
        Ok(msg) => Ok(Json(json!({ "success": true, "message": msg }))),
        Err(msg) => Ok(Json(json!({ "success": false, "message": msg }))),
    }
}

// ========== 审核配置 (火山引擎) ==========

#[derive(Deserialize)]
pub struct ModerationConfigRequest {
    pub volc_access_key: String,
    pub volc_secret_key: Option<String>,
    pub volc_app_id: Option<String>,
    pub volc_project_name: Option<String>,
    pub volc_group_id: Option<String>,
    pub volc_region: Option<String>,
    pub review_enabled: Option<bool>,
}

/// 管理员：获取审核配置
async fn get_moderation_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let configs = load_plugin_configs(&state, &name).await?;

    let sk = configs.get("volc_secret_key").cloned().unwrap_or_default();
    let masked_sk = crate::models::channel::mask_secret(&sk);

    let review_enabled = configs
        .get("review_enabled")
        .map(|v| v == "true")
        .unwrap_or(false);

    let volc_region = configs
        .get("volc_region")
        .cloned()
        .unwrap_or_else(|| "cn-beijing".to_string());

    // 根据 region 生成审核请求基址（国内版 volcengineapi.com，国际版 byteplusapi.com）
    let is_international = volc_region.starts_with("ap-");
    let ark_api_host = if is_international {
        "open.byteplusapi.com"
    } else {
        "open.volcengineapi.com"
    };
    let review_api_url = format!(
        "https://{}/?Action=CreateAsset&Version=2024-01-01",
        ark_api_host
    );

    Ok(Json(json!({
        "volc_access_key": configs.get("volc_access_key").cloned().unwrap_or_default(),
        "volc_secret_key": sk,
        "volc_secret_key_masked": masked_sk,
        "volc_app_id": configs.get("volc_app_id").cloned().unwrap_or_default(),
        "volc_project_name": configs.get("volc_project_name").cloned().unwrap_or_else(|| "default".to_string()),
        "volc_group_id": configs.get("volc_group_id").cloned().unwrap_or_default(),
        "volc_region": volc_region,
        "review_api_url": review_api_url,
        "is_configured": !configs.get("volc_access_key").cloned().unwrap_or_default().is_empty(),
        "review_enabled": review_enabled,
    })))
}

/// 管理员：保存审核配置
async fn save_moderation_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ModerationConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    upsert_config(&state, &name, "volc_access_key", &payload.volc_access_key).await?;
    if let Some(ref app_id) = payload.volc_app_id {
        if !app_id.is_empty() {
            upsert_config(&state, &name, "volc_app_id", app_id).await?;
        }
    }

    // secret_key 只在有值时更新
    if let Some(ref sk) = payload.volc_secret_key {
        if !sk.is_empty() && !sk.contains("****") {
            upsert_config(&state, &name, "volc_secret_key", sk).await?;
        }
    }

    // project_name
    if let Some(ref pn) = payload.volc_project_name {
        let pn_val = if pn.trim().is_empty() {
            "default"
        } else {
            pn.trim()
        };
        upsert_config(&state, &name, "volc_project_name", pn_val).await?;
    }

    // group_id
    if let Some(ref gid) = payload.volc_group_id {
        upsert_config(&state, &name, "volc_group_id", gid.trim()).await?;
    }

    // review_enabled 审核开关
    if let Some(re) = payload.review_enabled {
        upsert_config(
            &state,
            &name,
            "review_enabled",
            if re { "true" } else { "false" },
        )
        .await?;
    }

    // region
    if let Some(ref region) = payload.volc_region {
        let region_val = if region.trim().is_empty() {
            "cn-beijing"
        } else {
            region.trim()
        };
        upsert_config(&state, &name, "volc_region", region_val).await?;
    }

    Ok(Json(json!({ "message": "审核配置已保存" })))
}

async fn get_ha_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<crate::relay::ha_rule::HaRulesBundle>> {
    if name != "high_availability_channel" {
        return Err(AppError::BadRequest("仅高可用插件支持此接口".into()));
    }
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let bundle = crate::relay::relay_settings::get_cached_ha_rules(&state.db).await;
    Ok(Json((*bundle).clone()))
}

async fn save_ha_config(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<crate::relay::ha_rule::HaRulesBundle>,
) -> AppResult<Json<serde_json::Value>> {
    if name != "high_availability_channel" {
        return Err(AppError::BadRequest("仅高可用插件支持此接口".into()));
    }
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let bundle = crate::relay::ha_rule::sanitize_bundle(payload).map_err(AppError::BadRequest)?;
    let json = serde_json::to_string(&bundle)
        .map_err(|e| AppError::Internal(format!("序列化高可用规则失败: {e}")))?;
    upsert_config(&state, &name, "ha_rules", &json).await?;
    // 同步更新旧 ha_max_retries 扁平配置，确保任何场景回落时次数与主规则完全一致
    let primary_retries = bundle.resolve_arc(None).retries.to_string();
    upsert_config(&state, &name, "ha_max_retries", &primary_retries).await?;
    crate::relay::relay_settings::put_cached_ha_rules(Arc::new(bundle));

    Ok(Json(json!({ "message": "高可用配置已保存并重载" })))
}

async fn clear_ha_runtime(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if name != "high_availability_channel" {
        return Err(AppError::BadRequest("仅高可用插件支持此接口".into()));
    }
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    state.failed_channels.clear();
    crate::relay::relay_settings::invalidate_ha();
    tracing::info!("[HA] 管理员清空运行时缓存 user={}", claims.sub);
    Ok(Json(json!({ "message": "ok" })))
}

#[derive(Debug, Deserialize)]
struct HaLogQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    keyword: Option<String>,
    sort_by: Option<String>,    // attempt_count | created_at
    sort_order: Option<String>, // asc | desc
    date_from: Option<String>,  // YYYY-MM-DD
    date_to: Option<String>,    // YYYY-MM-DD
}

#[derive(Debug, sqlx::FromRow)]
struct HaLogRow {
    log_id: i64,
    group_aid: Option<String>,
    attempt_count: i16,
    final_ok: i16,
    final_status_code: i32,
    attempts: sqlx::types::Json<serde_json::Value>,
    created_at: DbTs,
    biz_log_id: Option<String>,
    model: Option<String>,
    status_code: Option<i32>,
    error_message: Option<String>,
    user_uid: Option<String>,
    user_nickname: Option<String>,
    channel_name: Option<String>,
}

/// 高可用插件使用日志（单表 + JOIN logs）
async fn get_ha_logs(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    axum::extract::Query(query): axum::extract::Query<HaLogQuery>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if name != "high_availability_channel" {
        return Err(AppError::BadRequest("仅高可用插件支持此接口".into()));
    }
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".into()));
    }

    let page_size = query.page_size.unwrap_or(15).clamp(1, 100);
    let keyword = query.keyword.as_deref().unwrap_or("").trim();
    let kw = (!keyword.is_empty()).then(|| format!("%{keyword}%"));

    // 排序字段白名单
    let order_col = match query.sort_by.as_deref() {
        Some("attempt_count") => "h.attempt_count",
        _ => "h.created_at",
    };
    let order_dir = match query.sort_order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    // 日期范围条件（复用带时区解析，避免 UTC 偏移问题）
    let df_val = query
        .date_from
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| {
            crate::api::date_helper::parse_timestamptz_bind(
                s,
                false,
                crate::api::date_helper::default_timedisplay_tz(),
            )
        });
    let dt_val = query.date_to.as_deref().filter(|s| !s.is_empty()).map(|s| {
        crate::api::date_helper::parse_timestamptz_bind(
            s,
            true,
            crate::api::date_helper::default_timedisplay_tz(),
        )
    });
    let has_date = df_val.is_some() || dt_val.is_some();

    // 构造 WHERE 条件
    let mut conds = Vec::new();
    if kw.is_some() {
        conds.push("(l.log_id LIKE ? OR l.model LIKE ? OR h.group_aid LIKE ? \
                    OR EXISTS (SELECT 1 FROM users u2 WHERE u2.id = l.user_id AND (u2.uid LIKE ? OR u2.username LIKE ?)))");
    }
    if df_val.is_some() {
        conds.push("h.created_at >= ?::timestamptz");
    }
    // `is_end = true` 会将日期解析为次日的 0点，所以这里改为 `<` 半开区间
    if dt_val.is_some() {
        conds.push("h.created_at < ?::timestamptz");
    }
    let where_sql = if conds.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conds.join(" AND "))
    };

    macro_rules! bind_where {
        ($q:expr) => {{
            let mut q = $q;
            if let Some(ref k) = kw {
                for _ in 0..5 {
                    q = q.bind(k);
                }
            }
            if let Some(ref df) = df_val {
                q = q.bind(df);
            }
            if let Some(ref dt) = dt_val {
                q = q.bind(dt);
            }
            q
        }};
    }

    let join = if kw.is_some() || has_date {
        "INNER JOIN"
    } else {
        "LEFT JOIN"
    };
    let count_sql = state.db.format_query(&format!(
        "SELECT COUNT(*) FROM ha_usage_logs h {join} logs l ON l.id = h.log_id{where_sql}"
    ));
    let total: i64 = bind_where!(sqlx::query_scalar::<_, i64>(&count_sql))
        .fetch_one(&state.db.pool)
        .await?;

    if total == 0 {
        return Ok(Json(json!({
            "logs": [],
            "total": 0,
            "page": 1,
            "page_size": page_size,
        })));
    }

    let max_page = (total + page_size - 1) / page_size;
    let page = query.page.unwrap_or(1).max(1).min(max_page);
    let offset = (page - 1) * page_size;

    let list_sql = state.db.format_query(&format!(
        "SELECT h.log_id, h.group_aid, h.attempt_count, h.final_ok, h.final_status_code, \
                h.attempts, h.created_at, l.log_id AS biz_log_id, l.model, \
                l.status_code, l.error_message, u.uid AS user_uid, \
                u.username AS user_nickname, c.name AS channel_name \
         FROM ha_usage_logs h \
         {join} logs l ON l.id = h.log_id \
         LEFT JOIN users u ON l.user_id = u.id \
         LEFT JOIN channels c ON l.channel_id = c.id \
         {where_sql} \
         ORDER BY {order_col} {order_dir} LIMIT {page_size} OFFSET {offset}"
    ));
    let rows = bind_where!(sqlx::query_as::<_, HaLogRow>(&list_sql))
        .fetch_all(&state.db.pool)
        .await?;
    let logs: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "log_id": r.log_id,
                "biz_log_id": r.biz_log_id,
                "group_aid": r.group_aid,
                "attempt_count": r.attempt_count,
                "final_ok": r.final_ok,
                "final_status_code": r.final_status_code,
                "attempts": r.attempts.0,
                "created_at": r.created_at,
                "user_uid": r.user_uid,
                "user_nickname": r.user_nickname,
                "channel_name": r.channel_name,
                "model": r.model,
                "status_code": r.status_code,
                "error_message": r.error_message,
            })
        })
        .collect();

    Ok(Json(json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}

/// 公开辅助：加载插件的 Volcengine 配置（供 assets 模块调用）
pub async fn get_volc_config(
    state: &AppState,
    plugin_name: &str,
) -> Option<crate::services::volcengine::VolcConfig> {
    let configs = load_plugin_configs(state, plugin_name).await.ok()?;
    crate::services::volcengine::VolcConfig::from_map(&configs)
}

fn normalize_plugin_default_provider(s: &str) -> &'static str {
    if s.eq_ignore_ascii_case("cos") {
        "cos"
    } else if is_global_storage_default(s) {
        "global"
    } else {
        "tos"
    }
}

fn push_unique_store(out: &mut Vec<ObjectStore>, seen: &mut HashSet<String>, store: ObjectStore) {
    let sig = format!("{}:{}", store.provider(), store.bucket());
    if seen.insert(sig) {
        out.push(store);
    }
}

/// 插件自有凭证与站点凭证一并纳入（同桶去重）。上传走 `get_object_store`；列举/删除走这里，避免切换默认后漏删旧桶。
pub async fn collect_object_stores(state: &AppState, plugin_name: &str) -> Vec<ObjectStore> {
    let configs = load_plugin_configs(state, plugin_name).await.ok();
    let sys = crate::relay::tos_persist::load_storage_settings(state).await;
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for kind in StoreKind::ALL {
        if let Some(store) = configs
            .as_ref()
            .and_then(|c| ObjectStore::from_plugin_map_for(c, kind))
        {
            push_unique_store(&mut out, &mut seen, store);
        }
        if let Some(ref s) = sys {
            if let Some(store) = ObjectStore::from_settings_for(s, kind) {
                push_unique_store(&mut out, &mut seen, store);
            }
        }
    }
    out
}

pub async fn collect_object_stores_for(
    state: &AppState,
    plugin_name: &str,
    kind: StoreKind,
) -> Vec<ObjectStore> {
    collect_object_stores(state, plugin_name)
        .await
        .into_iter()
        .filter(|s| StoreKind::parse(s.provider()) == kind)
        .collect()
}

pub async fn object_store_for_url(
    state: &AppState,
    plugin_name: &str,
    provider: &str,
    file_url: &str,
) -> Option<ObjectStore> {
    let kind = StoreKind::parse(provider);
    let stores = collect_object_stores_for(state, plugin_name, kind).await;
    stores
        .iter()
        .find(|s| s.extract_object_key(file_url).is_some())
        .cloned()
        .or_else(|| stores.into_iter().next())
}

pub async fn get_object_store(state: &AppState, plugin_name: &str) -> Option<ObjectStore> {
    let configs = load_plugin_configs(state, plugin_name).await.ok();
    let default_raw = configs
        .as_ref()
        .and_then(|c| c.get("default_provider"))
        .map(|s| s.as_str())
        .unwrap_or("tos");
    if is_global_storage_default(default_raw) {
        return crate::relay::tos_persist::load_system_object_store(state).await;
    }
    let resolved = StoreKind::parse(default_raw);
    if let Some(store) = configs
        .as_ref()
        .and_then(|c| ObjectStore::from_plugin_map_for(c, resolved))
    {
        return Some(store);
    }
    crate::relay::tos_persist::load_system_object_store(state).await
}

pub async fn delete_stored_object(
    state: &AppState,
    plugin_name: &str,
    provider: &str,
    object_key: &str,
) {
    let key = object_key.trim().trim_start_matches('/');
    if key.is_empty() {
        return;
    }
    for store in collect_object_stores_for(state, plugin_name, StoreKind::parse(provider)).await {
        let _ = store.delete_file(key).await;
    }
}


#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PluginApiLog {
    pub id: i64,
    pub user_id: String,
    pub plugin_name: String,
    pub api_endpoint: String,
    pub request_payload: Option<String>,
    pub response_payload: Option<String>,
    pub status_code: Option<i32>,
    pub source: String,
    pub created_at: DbTs,
}

#[derive(serde::Deserialize)]
pub struct LogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub source: Option<String>,
    pub keyword: Option<String>,
}

/// 管理员：获取插件 API 日志
async fn get_plugin_api_logs(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    axum::extract::Query(query): axum::extract::Query<LogQuery>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_optional(&state.db.pool)
            .await?
            .unwrap_or_default();
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    // 动态拼接过滤条件
    let mut where_clause = "WHERE plugin_name = $1".to_string();
    let mut param_idx = 2u32;

    let source_filter = query.source.as_deref().unwrap_or("").to_string();
    if !source_filter.is_empty() {
        where_clause.push_str(&format!(" AND source = ${}", param_idx));
        param_idx += 1;
    }

    let keyword = query.keyword.as_deref().unwrap_or("").to_string();
    if !keyword.is_empty() {
        where_clause.push_str(&format!(" AND (api_endpoint ILIKE ${p} OR user_id ILIKE ${p} OR EXISTS (SELECT 1 FROM users u WHERE u.id = plugin_api_logs.user_id AND u.uid ILIKE ${p}))", p = param_idx));
        param_idx += 1;
    }

    // 构造 count 查询
    let count_sql = format!("SELECT COUNT(*) FROM plugin_api_logs {}", where_clause);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql).bind(&name);
    if !source_filter.is_empty() {
        count_q = count_q.bind(&source_filter);
    }
    if !keyword.is_empty() {
        count_q = count_q.bind(format!("%{}%", keyword));
    }
    let total: i64 = count_q.fetch_one(&state.db.pool).await?;

    // 构造数据查询
    let data_sql = format!(
        "SELECT * FROM plugin_api_logs {} ORDER BY id DESC LIMIT ${} OFFSET ${}",
        where_clause,
        param_idx,
        param_idx + 1
    );
    let mut data_q = sqlx::query_as::<_, PluginApiLog>(&data_sql).bind(&name);
    if !source_filter.is_empty() {
        data_q = data_q.bind(&source_filter);
    }
    if !keyword.is_empty() {
        data_q = data_q.bind(format!("%{}%", keyword));
    }
    let logs: Vec<PluginApiLog> = data_q
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db.pool)
        .await?;

    // 构建 user_id -> uid/username 映射
    let user_ids: Vec<String> = logs
        .iter()
        .map(|a| a.user_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let mut uid_map = serde_json::Map::new();
    for uid_chunk in user_ids.chunks(50) {
        let placeholders = uid_chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = state.db.format_query(&format!(
            "SELECT id, uid, username FROM users WHERE id IN ({})",
            placeholders
        ));
        let mut q = sqlx::query_as::<_, (String, String, String)>(&sql);
        for id in uid_chunk {
            q = q.bind(id);
        }
        if let Ok(rows) = q.fetch_all(&state.db.pool).await {
            for (id, uid, username) in rows {
                uid_map.insert(id, serde_json::json!({"uid": uid, "username": username}));
            }
        }
    }

    Ok(Json(serde_json::json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "uid_map": serde_json::Value::Object(uid_map)
    })))
}

pub async fn is_plugin_enabled(state: &crate::AppState, name: &str) -> bool {
    let enabled: Option<i64> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = ?"),
    )
    .bind(name)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(val) => val,
        Err(_) => None,
    };
    enabled.unwrap_or(0) == 1
}
