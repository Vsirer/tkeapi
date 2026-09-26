/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 模型广场：内存缓存、`notify_marketplace_data_changed`、管理/公开 API。见 `mod.rs` 模块注释。

use axum::{
    extract::{Extension, Path, State},
    Json,
};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use crate::{
    auth,
    error::{AppError, AppResult},
    models::Plugin,
    AppState,
};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{
    load_plugin_configs,
    marketplace_visibility::{
        mp_enabled, mp_is_candidate, mp_visible_to, parse_level_id_list, parse_mp_level_ids,
        MarketplaceViewer,
    },
    upsert_config,
};
/// 模型广场公开数据的内存缓存（TTL 60秒）
pub struct MarketplaceCache {
    data: Option<serde_json::Value>,
    updated_at: Instant,
}

impl MarketplaceCache {
    pub fn new() -> Self {
        Self {
            data: None,
            updated_at: Instant::now(),
        }
    }
    pub fn is_valid(&self) -> bool {
        self.data.is_some() && self.updated_at.elapsed().as_secs() < 60
    }
    pub fn invalidate(&mut self) {
        self.data = None;
    }
}

static MARKETPLACE_CACHE: std::sync::OnceLock<RwLock<MarketplaceCache>> =
    std::sync::OnceLock::new();

pub fn get_marketplace_cache() -> &'static RwLock<MarketplaceCache> {
    MARKETPLACE_CACHE.get_or_init(|| RwLock::new(MarketplaceCache::new()))
}

pub async fn notify_marketplace_data_changed(state: &Arc<AppState>) {
    get_marketplace_cache().write().await.invalidate();
    crate::relay::router::invalidate_channel_cache();

    #[cfg(feature = "plugin_site_portal")]
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            if let Err(e) =
                crate::api::plugins::site_portal::auto_generate_portal_models_static(&state_clone).await
            {
                tracing::warn!("Failed to auto generate portal static models: {:?}", e);
            }
        });
    }

    #[cfg(feature = "commercial_plugins")]
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            if let Err(e) =
                crate::api::plugins::site_portal_pro::auto_generate_portal_models_static(&state_clone).await
            {
                tracing::warn!("Failed to auto generate portal_pro static models: {:?}", e);
            }
        });
    }
}

fn get_default_trending_config() -> serde_json::Value {
    json!({
        "enabled": false,
        "hero_slides": [
            {
                "id": "hero-1",
                "category": "图生视频",
                "title": "可灵 Kling Video v3 图生视频 [Pro]",
                "description": "Kling 3.0 Pro：顶级图生视频模型，具备电影级视觉效果、流畅的动作生成以及原生音频支持。",
                "try_model_id": "",
                "docs_url": ""
            },
            {
                "id": "hero-2",
                "category": "SOTA 级视频",
                "title": "Seedance 2.0 旗舰视频生成大模型",
                "description": "字节跳动推出的全新 SOTA 级视频模型，支持多参考图、视频与音频同步控制生成。",
                "try_model_id": "",
                "docs_url": ""
            },
            {
                "id": "hero-3",
                "category": "高清图像生成",
                "title": "FLUX 1.1 Pro 高清图像创作引擎",
                "description": "Black Forest Labs 打造的顶级文生图模型，高清晰度细节呈现与极佳的提示词遵循度。",
                "try_model_id": "",
                "docs_url": ""
            }
        ],
        "quick_tags": [],
        "sections": [
            {
                "id": "sec-seedance",
                "title": "Seedance 2.0 专题",
                "description": "字节跳动推出的全新 SOTA 级视频生成模型，即刻体验惊艳的视听合一生成能力。",
                "type": "models",
                "items": []
            },
            {
                "id": "sec-grok",
                "title": "Grok Imagine 专题",
                "description": "由 xAI 强力驱动的高品质视频、图像与自然语音生成模型系列。",
                "type": "models",
                "items": []
            }
        ]
    })
}

// ========== 模型广场管理 (Model Marketplace) ==========

/// 管理员：获取模型广场配置（返回全部模型 + 每个模型的广场展示配置）
pub(crate) async fn get_marketplace_models(
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

    // 查出全部模型及其 provider/type 信息
    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM models WHERE is_listed = 1 ORDER BY sort_order DESC, id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let providers: Vec<crate::models::ModelProvider> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_providers ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM model_types ORDER BY sort_order DESC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 读取展示模式: whitelist（默认隐藏，手动开启）或 blacklist（默认展示，手动排除）
    let display_mode = configs
        .get("mp_display_mode")
        .map(|s| s.as_str())
        .unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";
    let allow_guest = configs
        .get("mp_allow_guest")
        .map(|s| s == "true")
        .unwrap_or(false);

    let mut model_list = Vec::new();
    for m in &models {
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = configs
            .get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"sort_order": 0, "description": ""}));

        // 在黑名单模式下，没有配置的模型默认展示 (enabled=true)
        let default_enabled = is_blacklist;
        let mp_enabled = model_conf
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(default_enabled);

        let provider_name = m
            .provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .map(|p| p.name.clone())
            .unwrap_or_default();

        let type_name = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        model_list.push(json!({
            "id": m.id,
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "remark": m.remark,
            "provider_id": m.provider_id,
            "provider_name": provider_name,
            "provider_name_en": m.provider_id
                .and_then(|pid| providers.iter().find(|p| p.id == pid))
                .map(|p| p.name_en.clone())
                .unwrap_or_default(),
            "type_id": m.type_id,
            "type_name": type_name,
            "type_name_en": m.type_id
                .and_then(|tid| types.iter().find(|t| t.id == tid))
                .map(|t| t.name_en.clone())
                .unwrap_or_default(),
            "is_active": m.is_active,
            "mp_enabled": mp_enabled,
            "sort_order": m.sort_order,
            "mp_sort_order": m.sort_order as i64,
            "mp_description": model_conf.get("description").and_then(|v| v.as_str()).unwrap_or(""),
            "mp_description_en": model_conf.get("description_en").and_then(|v| v.as_str()).unwrap_or(""),
            "mp_level_ids": parse_mp_level_ids(&model_conf),
        }));
    }

    let trending_config: serde_json::Value = configs
        .get("mp_trending_config")
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(get_default_trending_config);

    Ok(Json(json!({
        "models": model_list,
        "display_mode": display_mode,
        "allow_guest": allow_guest,
        "trending_config": trending_config,
    })))
}

#[derive(Deserialize)]
pub(crate) struct MarketplaceModelConfig {
    pub id: i64,
    pub enabled: bool,
    pub sort_order: Option<i64>,
    pub description: Option<String>,
    pub description_en: Option<String>,
    /// 广场展示开：不可查看的用户等级；关：可查看的用户等级。空则走对应默认。
    #[serde(default)]
    pub level_ids: Vec<i64>,
}

#[derive(Deserialize)]
pub(crate) struct MarketplaceConfigRequest {
    pub models: Vec<MarketplaceModelConfig>,
    pub display_mode: Option<String>, // "whitelist" or "blacklist"
    pub allow_guest: Option<bool>,
    pub trending_config: Option<serde_json::Value>,
}

/// 管理员：保存模型广场配置
pub(crate) async fn save_marketplace_models(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<MarketplaceConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    // 保存展示模式
    if let Some(ref mode) = payload.display_mode {
        upsert_config(&state, &name, "mp_display_mode", mode).await?;
    }

    if let Some(allow_guest) = payload.allow_guest {
        upsert_config(
            &state,
            &name,
            "mp_allow_guest",
            if allow_guest { "true" } else { "false" },
        )
        .await?;
    }

    if let Some(ref config) = payload.trending_config {
        upsert_config(&state, &name, "mp_trending_config", &config.to_string()).await?;
    }

    for mc in &payload.models {
        let config_key = format!("mp_model_id_{}", mc.id);
        let val = json!({
            "enabled": mc.enabled,
            "sort_order": mc.sort_order.unwrap_or(0),
            "description": mc.description.as_deref().unwrap_or(""),
            "description_en": mc.description_en.as_deref().unwrap_or(""),
            "level_ids": mc.level_ids,
        });
        upsert_config(&state, &name, &config_key, &val.to_string()).await?;
    }

    // 清除缓存，下次请求将重新构建
    get_marketplace_cache().write().await.invalidate();

    Ok(Json(json!({ "message": "模型广场配置已保存" })))
}

#[derive(Deserialize)]
pub(crate) struct MarketplaceToggleRequest {
    pub id: i64,
    pub enabled: bool,
    pub sort_order: Option<i64>,
    pub description: Option<String>,
    pub description_en: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MarketplaceBatchToggleRequest {
    pub ids: Vec<i64>,
    pub enabled: bool,
}

/// 管理员：单模型广场展示开关即时切换
pub(crate) async fn toggle_marketplace_model(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<MarketplaceToggleRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    let config_key = format!("mp_model_id_{}", payload.id);
    let existing_val: Option<String> = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = ?",
        ),
    )
    .bind(&name)
    .bind(&config_key)
    .fetch_optional(&state.db.pool)
    .await?;

    let mut model_conf: serde_json::Value = existing_val
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!({
            "sort_order": 0,
            "description": "",
            "description_en": "",
            "level_ids": []
        }));

    if let Some(obj) = model_conf.as_object_mut() {
        obj.insert("enabled".to_string(), json!(payload.enabled));
        // 切换展示开关时，清空已选等级（与原业务规则一致）
        obj.insert("level_ids".to_string(), json!([]));
        if let Some(sort_order) = payload.sort_order {
            obj.insert("sort_order".to_string(), json!(sort_order));
        }
        if let Some(description) = payload.description {
            obj.insert("description".to_string(), json!(description));
        }
        if let Some(description_en) = payload.description_en {
            obj.insert("description_en".to_string(), json!(description_en));
        }
    }

    upsert_config(&state, &name, &config_key, &model_conf.to_string()).await?;
    get_marketplace_cache().write().await.invalidate();

    Ok(Json(json!({
        "message": if payload.enabled {
            "已开启广场展示"
        } else {
            "已关闭广场展示"
        }
    })))
}

/// 管理员：批量模型广场展示开关即时切换
pub(crate) async fn batch_toggle_marketplace_models(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<MarketplaceBatchToggleRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Forbidden("需要管理员权限".to_string()));
    }

    for id in &payload.ids {
        let config_key = format!("mp_model_id_{}", id);
        let existing_val: Option<String> = sqlx::query_scalar(
            &state.db.format_query(
                "SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = ?",
            ),
        )
        .bind(&name)
        .bind(&config_key)
        .fetch_optional(&state.db.pool)
        .await?;

        let mut model_conf: serde_json::Value = existing_val
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({
                "sort_order": 0,
                "description": "",
                "description_en": "",
                "level_ids": []
            }));

        if let Some(obj) = model_conf.as_object_mut() {
            obj.insert("enabled".to_string(), json!(payload.enabled));
            obj.insert("level_ids".to_string(), json!([]));
        }

        upsert_config(&state, &name, &config_key, &model_conf.to_string()).await?;
    }

    get_marketplace_cache().write().await.invalidate();

    Ok(Json(json!({
        "message": if payload.enabled {
            "已批量开启广场展示"
        } else {
            "已批量关闭广场展示"
        }
    })))
}

async fn marketplace_viewer_for_user(state: &AppState, user_id: &str) -> MarketplaceViewer {
    let row: Option<(String, Option<i64>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.role, ul.id FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?",
        ),
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten();
    match row {
        Some((role, level_id)) => MarketplaceViewer {
            is_admin: role == "admin",
            level_id,
        },
        None => MarketplaceViewer::guest(),
    }
}

pub async fn marketplace_viewer_for_user_id(
    state: &AppState,
    user_id: &str,
) -> MarketplaceViewer {
    marketplace_viewer_for_user(state, user_id).await
}

async fn marketplace_viewer_from_headers(
    state: &AppState,
    headers: &axum::http::HeaderMap,
) -> MarketplaceViewer {
    let Some(auth_header) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    else {
        return MarketplaceViewer::guest();
    };
    let Some(token) = auth_header.strip_prefix("Bearer ") else {
        return MarketplaceViewer::guest();
    };
    let Ok(claims) = crate::auth::validate_token(token, &state.config.jwt_secret) else {
        return MarketplaceViewer::guest();
    };
    let is_active: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_active FROM users WHERE id = ?"),
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten();
    if is_active.unwrap_or(0) == 0 {
        return MarketplaceViewer::guest();
    }
    marketplace_viewer_for_user(state, &claims.sub).await
}

fn group_marketplace_models(models: &[Value]) -> Vec<Value> {
    let mut grouped_map: std::collections::HashMap<String, Vec<Value>> =
        std::collections::HashMap::new();
    let mut grouped_order: Vec<String> = Vec::new();
    for m in models {
        let original_id = m
            .get("original_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let model_id = m
            .get("model_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let base_key = if !original_id.is_empty() {
            original_id
        } else {
            model_id.clone()
        };
        let type_id = m.get("type_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let group_key = format!("{}::{}", base_key, type_id);

        if !grouped_map.contains_key(&group_key) {
            grouped_order.push(group_key.clone());
        }
        grouped_map.entry(group_key).or_default().push(m.clone());
    }
    let mut groups: Vec<Value> = grouped_order
        .into_iter()
        .filter_map(|group_key| {
            let mut variants = grouped_map.remove(&group_key)?;
            // 组内变体按照 sort_order 降序，其次按 id 降序，权重最高者作为代表主变体
            variants.sort_by(|a, b| {
                let sa = a.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
                let sb = b.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
                let ida = a.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                let idb = b.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                sb.cmp(&sa).then_with(|| idb.cmp(&ida))
            });

            let primary = &variants[0];
            let mut group = primary.clone();
            let max_sort_order = variants
                .iter()
                .map(|v| v.get("sort_order").and_then(|x| x.as_i64()).unwrap_or(0))
                .max()
                .unwrap_or(0);
            group["sort_order"] = json!(max_sort_order);
            group["variant_count"] = json!(variants.len());
            group["variants"] = json!(variants);
            let original_id = primary
                .get("original_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let model_id = primary
                .get("model_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let base_key = if !original_id.is_empty() {
                original_id
            } else {
                model_id
            };
            group["model_id"] = json!(base_key);
            Some(group)
        })
        .collect();

    // 所有分组模型卡片按照 sort_order 降序，其次按 id 降序排列
    groups.sort_by(|a, b| {
        let sa = a.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        let sb = b.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        let ida = a.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let idb = b.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        sb.cmp(&sa).then_with(|| idb.cmp(&ida))
    });

    groups
}

fn finalize_marketplace_cache(cached: &Value, viewer: MarketplaceViewer) -> Value {
    let trending_config = cached
        .get("trending_config")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let providers = cached
        .get("providers")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let types = cached
        .get("types")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let raw_models = cached
        .get("models")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut models: Vec<Value> = Vec::new();
    for mut m in raw_models {
        let enabled = m
            .get("_mp_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let level_ids = parse_level_id_list(m.get("_mp_level_ids"));
        if !mp_visible_to(enabled, &level_ids, viewer) {
            continue;
        }
        if let Some(obj) = m.as_object_mut() {
            obj.remove("_mp_enabled");
            obj.remove("_mp_level_ids");
        }
        models.push(m);
    }

    let grouped_models = group_marketplace_models(&models);
    let active_provider_ids: std::collections::HashSet<i64> = models
        .iter()
        .filter_map(|m| m.get("provider_id").and_then(|v| v.as_i64()))
        .collect();
    let active_type_ids: std::collections::HashSet<i64> = models
        .iter()
        .filter_map(|m| m.get("type_id").and_then(|v| v.as_i64()))
        .collect();
    let provider_list: Vec<Value> = providers
        .into_iter()
        .filter(|p| {
            p.get("id")
                .and_then(|v| v.as_i64())
                .map(|id| active_provider_ids.contains(&id))
                .unwrap_or(false)
        })
        .collect();
    let type_list: Vec<Value> = types
        .into_iter()
        .filter(|t| {
            t.get("id")
                .and_then(|v| v.as_i64())
                .map(|id| active_type_ids.contains(&id))
                .unwrap_or(false)
        })
        .collect();

    json!({
        "enabled": true,
        "models": models,
        "grouped_models": grouped_models,
        "providers": provider_list,
        "types": type_list,
        "total": models.len(),
        "group_total": grouped_models.len(),
        "trending_config": trending_config,
    })
}

/// 公开接口：获取模型广场展示数据（若配置了允许游客访问则无需登录，否则需登录并校验用户等级权限）
pub async fn get_marketplace_public(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    // 1. 检查插件是否启用
    let plugin: Option<Plugin> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugins WHERE name = ? AND is_enabled = 1"),
    )
    .bind("model_marketplace")
    .fetch_optional(&state.db.pool)
    .await?;

    let plugin = match plugin {
        Some(p) => p,
        None => {
            return Ok(Json(json!({
                "enabled": false,
                "models": [],
                "providers": [],
                "types": [],
            })))
        }
    };

    // 加载配置，获取是否允许游客访问
    let configs = load_plugin_configs(&state, "model_marketplace").await?;
    let allow_guest = configs
        .get("mp_allow_guest")
        .map(|s| s == "true")
        .unwrap_or(false);

    // 2. 用户等级/游客权限校验
    if !allow_guest {
        // 如果不允许游客访问，则手动尝试解析 JWT 鉴权
        let mut claims = None;
        if let Some(auth_header) = headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
        {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                if let Ok(c) = crate::auth::validate_token(token, &state.config.jwt_secret) {
                    // 验证用户是否仍存在且处于激活状态
                    let is_active: Result<Option<i64>, sqlx::Error> = sqlx::query_scalar(
                        &state
                            .db
                            .format_query("SELECT is_active FROM users WHERE id = ?"),
                    )
                    .bind(&c.sub)
                    .fetch_optional(&state.db.pool)
                    .await;
                    if let Ok(Some(active)) = is_active {
                        if active != 0 {
                            claims = Some(c);
                        }
                    }
                }
            }
        }

        let claims = match claims {
            Some(c) => c,
            None => return Err(AppError::Unauthorized), // 未登录或 Token 无效
        };

        if plugin.allowed_levels != "all" {
            let user_info: Option<(String, String, Option<i64>)> = sqlx::query_as(
                &state.db.format_query("SELECT u.role, u.user_group, ul.id as level_id FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?")
            )
            .bind(&claims.sub)
            .fetch_optional(&state.db.pool)
            .await?;

            let (role, user_group, user_level_id) =
                user_info.unwrap_or_else(|| ("user".to_string(), "default".to_string(), Some(0)));
            if role != "admin" {
                let allowed: Vec<&str> = plugin.allowed_levels.split(',').collect();
                let level_id_str = user_level_id.unwrap_or(0).to_string();

                if !allowed.contains(&user_group.as_str())
                    && !allowed.contains(&level_id_str.as_str())
                {
                    return Err(AppError::Forbidden(
                        "您当前的用户等级无权访问模型广场".to_string(),
                    ));
                }
            }
        }
    }

    let viewer = marketplace_viewer_from_headers(&state, &headers).await;

    // 3. 尝试从缓存读取（内部候选数据，按当前观察者过滤）
    {
        let cache = get_marketplace_cache().read().await;
        if cache.is_valid() {
            if let Some(ref data) = cache.data {
                if data.get("_mp_internal").and_then(|v| v.as_bool()) == Some(true) {
                    return Ok(Json(finalize_marketplace_cache(data, viewer)));
                }
            }
        }
    }

    // 4. 缓存未命中，从数据库查询并构建
    let configs = load_plugin_configs(&state, "model_marketplace").await?;

    let models: Vec<crate::models::Model> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM models WHERE is_active = 1 AND is_listed = 1 ORDER BY sort_order DESC, id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let providers: Vec<crate::models::ModelProvider> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM model_providers WHERE is_active = 1 ORDER BY sort_order DESC, id ASC",
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let api_providers: Vec<crate::models::ModelProvider> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM model_api_providers ORDER BY sort_order DESC, id ASC",
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let types: Vec<crate::models::ModelType> = sqlx::query_as(&state.db.format_query(
        "SELECT * FROM model_types WHERE is_active = 1 ORDER BY sort_order DESC, id ASC",
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let billing_rules: Vec<crate::models::BillingRule> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE is_active = 1"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let ha_channels: Vec<(String, String)> = sqlx::query_as(
        &state.db.format_query("SELECT models, config FROM channels WHERE provider_type = 'high_availability_group' AND status = 1")
    ).fetch_all(&state.db.pool).await?;

    let channel_configs: Vec<crate::models::ChannelConfig> =
        sqlx::query_as(&state.db.format_query("SELECT * FROM channel_configs"))
            .fetch_all(&state.db.pool)
            .await?;

    let mut config_map = std::collections::HashMap::new();
    for cfg in channel_configs {
        config_map.insert(cfg.id, cfg);
    }

    let mut ha_model_subs: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    let mut ha_model_ids = std::collections::HashSet::new();
    let mut ha_model_sub_ids: std::collections::HashMap<String, std::collections::HashSet<i64>> =
        std::collections::HashMap::new();

    for (models_str, config_str) in ha_channels {
        if let Ok(m_ids) = serde_json::from_str::<Vec<String>>(&models_str) {
            let mut subs = Vec::new();
            let mut sub_sids = std::collections::HashSet::new();
            if let Ok(config_val) = serde_json::from_str::<serde_json::Value>(&config_str) {
                if let Some(sub_channel_ids) =
                    config_val.get("sub_channels").and_then(|v| v.as_array())
                {
                    for sid_val in sub_channel_ids {
                        if let Some(sid) = sid_val.as_i64() {
                            if let Some(cfg) = config_map.get(&sid) {
                                if cfg.status != 1 {
                                    continue;
                                }
                                subs.push(json!({
                                    "name": cfg.name,
                                    "provider_type": cfg.provider_type,
                                    "rate": cfg.rate,
                                    "is_ha": true,
                                }));
                                sub_sids.insert(sid);
                            }
                        }
                    }
                }
            }
            for m_id in m_ids {
                ha_model_ids.insert(m_id.clone());
                if !sub_sids.is_empty() {
                    let sids_entry = ha_model_sub_ids
                        .entry(m_id.clone())
                        .or_insert_with(std::collections::HashSet::new);
                    sids_entry.extend(&sub_sids);
                }
                if !subs.is_empty() {
                    let entry = ha_model_subs.entry(m_id).or_insert_with(Vec::new);
                    // Avoid duplicates if multiple HA groups have the same model
                    for sub in &subs {
                        if !entry.contains(sub) {
                            entry.push(sub.clone());
                        }
                    }
                }
            }
        }
    }

    // 补充：获取普通渠道（非HA）及其倍率，用于在前台也展示其上游渠道倍率
    let normal_channels: Vec<(String, String, f64, Option<i64>, String)> = sqlx::query_as(
        &state.db.format_query("SELECT models, name, rate, preset_id, provider_type FROM channels WHERE provider_type != 'high_availability_group' AND status = 1")
    ).fetch_all(&state.db.pool).await?;

    for (models_str, name, rate, preset_id, provider_type) in normal_channels {
        if let Ok(m_ids) = serde_json::from_str::<Vec<String>>(&models_str) {
            let mut effective_name = name;
            let mut effective_rate = rate;
            let mut effective_provider_type = provider_type;
            // 如果存在分组 preset_id，则优先展示渠道分组名称和分组倍率
            if let Some(pid) = preset_id {
                if let Some(cfg) = config_map.get(&pid) {
                    if cfg.status != 1 {
                        continue;
                    }
                    effective_name = cfg.name.clone();
                    effective_rate = cfg.rate;
                    effective_provider_type = cfg.provider_type.clone();
                }
            }

            let sub = json!({
                "name": effective_name,
                "provider_type": effective_provider_type,
                "rate": effective_rate,
                "is_ha": false,
            });

            for m_id in m_ids {
                let entry = ha_model_subs.entry(m_id).or_insert_with(Vec::new);
                if !entry.contains(&sub) {
                    entry.push(sub.clone());
                }
            }
        }
    }

    for subs in ha_model_subs.values_mut() {
        *subs = merge_ha_subchannels_by_rate(std::mem::take(subs));
    }

    // 读取展示模式
    let display_mode = configs
        .get("mp_display_mode")
        .map(|s| s.as_str())
        .unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";

    let mut marketplace_models: Vec<serde_json::Value> = Vec::new();
    #[cfg(feature = "plugin_volcengine_enhance")]
    let volc_plugin_on =
        crate::api::plugins::is_plugin_enabled(&state, "volcengine_enhance").await;
    for m in &models {
        #[cfg(feature = "plugin_volcengine_enhance")]
        if !volc_plugin_on && crate::api::plugins::is_volc_preset_mid(&m.mid) {
            continue;
        }
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = configs
            .get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"sort_order": 0, "description": ""}));

        // 黑名单模式：没有配置的模型默认展示；白名单模式：没有配置的模型默认隐藏
        let default_enabled = is_blacklist;
        let is_enabled = mp_enabled(&model_conf, default_enabled);
        let level_ids = parse_mp_level_ids(&model_conf);
        if !mp_is_candidate(is_enabled, &level_ids) {
            continue;
        }

        let sort_order = m.sort_order as i64;
        let description = model_conf
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let description_en = model_conf
            .get("description_en")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let provider_name = m
            .provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .map(|p| p.name.clone())
            .unwrap_or_default();

        let api_provider = m
            .api_provider_id
            .and_then(|pid| api_providers.iter().find(|p| p.id == pid));

        let type_name = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .map(|t| t.name.clone())
            .unwrap_or_default();

        let billing_info = m
            .billing_rule_id
            .and_then(|bid| billing_rules.iter().find(|b| b.id == bid))
            .map(|b| {
                json!({
                    "billing_type": b.billing_type,
                    "name": b.name,
                    "prompt_rate": b.prompt_rate,
                    "completion_rate": b.completion_rate,
                    "cached_rate": b.cached_rate,
                    "claude_cache_creation_rate": b.claude_cache_creation_rate,
                    "claude_cache_read_rate": b.claude_cache_read_rate,
                    "fixed_rate": b.fixed_rate,
                    "duration_rate": b.duration_rate,
                    "pricing_tiers": b.pricing_tiers,
                    "billing_rule": b.billing_rule,
                    "extended_config": b.extended_config,
                })
            })
            .unwrap_or(json!(null));

        let provider_logo = m
            .provider_id
            .and_then(|pid| providers.iter().find(|p| p.id == pid))
            .and_then(|p| p.logo.clone());

        let type_logo = m
            .type_id
            .and_then(|tid| types.iter().find(|t| t.id == tid))
            .and_then(|t| t.logo.clone());

        marketplace_models.push(json!({
            "id": m.id,
            "mid": m.mid,
            "name": m.name,
            "model_id": m.model_id,
            "provider_id": m.provider_id,
            "provider_name": provider_name,
            "provider_name_en": m.provider_id
                .and_then(|pid| providers.iter().find(|p| p.id == pid))
                .map(|p| p.name_en.clone())
                .unwrap_or_default(),
            "provider_logo": provider_logo,
            "api_provider_id": m.api_provider_id,
            "api_provider_name": api_provider.map(|p| p.name.clone()).unwrap_or_default(),
            "api_provider_name_en": api_provider.map(|p| p.name_en.clone()).unwrap_or_default(),
            "type_id": m.type_id,
            "type_name": type_name,
            "type_name_en": m.type_id
                .and_then(|tid| types.iter().find(|t| t.id == tid))
                .map(|t| t.name_en.clone())
                .unwrap_or_default(),
            "type_logo": type_logo,
            "logo": m.logo,
            "original_id": m.original_id,
            "sort_order": sort_order,
            "description": description,
            "description_en": description_en,
            "model_description": m.description,
            "global_discount": m.global_discount,
            "global_discount_enabled": m.global_discount_enabled,
            "billing": billing_info,
            "has_ha": ha_model_ids.contains(&m.mid),
            "ha_sub_count": ha_model_sub_ids.get(&m.mid).map(|s| s.len()).unwrap_or(0),
            "ha_subchannels": ha_model_subs.get(&m.mid).cloned().unwrap_or_default(),
            "created_at": m.created_at,
            "_mp_enabled": is_enabled,
            "_mp_level_ids": level_ids,
        }));
    }

    marketplace_models.sort_by(|a, b| {
        let sa = a.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        let sb = b.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
        sb.cmp(&sa)
    });

    let all_providers_json: Vec<Value> = providers
        .iter()
        .map(|p| json!({"id": p.id, "name": p.name, "name_en": p.name_en, "logo": p.logo}))
        .collect();
    let all_types_json: Vec<Value> = types
        .iter()
        .map(|t| json!({"id": t.id, "name": t.name, "name_en": t.name_en, "logo": t.logo}))
        .collect();
    let trending_config: Value = configs
        .get("mp_trending_config")
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(get_default_trending_config);

    let internal = json!({
        "_mp_internal": true,
        "models": marketplace_models,
        "providers": all_providers_json,
        "types": all_types_json,
        "trending_config": trending_config,
    });

    {
        let mut cache = get_marketplace_cache().write().await;
        cache.data = Some(internal.clone());
        cache.updated_at = Instant::now();
    }

    Ok(Json(finalize_marketplace_cache(&internal, viewer)))
}

/// 广场计价只展示倍率：高可用组绑定多个上游时，相同倍率合并为一条。
fn merge_ha_subchannels_by_rate(subs: Vec<Value>) -> Vec<Value> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(subs.len());
    for sub in subs {
        let rate = sub.get("rate").and_then(Value::as_f64).unwrap_or(1.0);
        let key = (rate * 1_000_000.0).round() as i64;
        if seen.insert(key) {
            out.push(sub);
        }
    }
    out
}
