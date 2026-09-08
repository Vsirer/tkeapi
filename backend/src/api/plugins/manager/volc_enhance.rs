/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 火山画质增强配置 API。整模块由 `plugin_volcengine_enhance` feature 门控，关 feature 时不编译。

use axum::{
    extract::{Extension, State},
    Json,
};
use crate::time_system::DbTs;
use std::sync::Arc;
use crate::AppState;

use super::{load_plugin_configs, upsert_config};
// ── 火山画质增强插件配置 API 与连接自测试实现 ──

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct VolcCredential {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub base_url: String,
}

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(serde::Deserialize)]
pub struct VolcEnhanceConfigRequest {
    pub keys: Option<Vec<VolcCredential>>,
    pub active_mids: Option<Vec<String>>,
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn get_volcengine_enhance_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    let configs = load_plugin_configs(&state, "volcengine_enhance")
        .await
        .unwrap_or_default();

    // 从 plugin_configs 中拉取多凭证列表 keys 字段并解析
    let keys_str = configs.get("keys").cloned().unwrap_or_default();
    let mut keys: Vec<VolcCredential> = if !keys_str.is_empty() {
        serde_json::from_str(&keys_str).unwrap_or_default()
    } else {
        Vec::new()
    };

    // 向上兼容：若 keys 为空，则从原有的单个 api_key 构建默认凭证
    if keys.is_empty() {
        if let Some(old_api_key) = configs.get("api_key") {
            if !old_api_key.trim().is_empty() {
                keys.push(VolcCredential {
                    id: "default".to_string(),
                    name: "默认凭证".to_string(),
                    api_key: old_api_key.clone(),
                    base_url: "https://mediakit.cn-beijing.volces.com".to_string(),
                });
            }
        }
    }

    let preset_mids = vec!["vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep"];
    let models_status: Vec<(String, i32)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT mid, is_active FROM models WHERE mid = ANY(?)"),
    )
    .bind(&preset_mids)
    .fetch_all(&state.db.pool)
    .await?;

    let active_mids: Vec<String> = models_status
        .into_iter()
        .filter(|(_, active)| *active == 1)
        .map(|(mid, _)| mid)
        .collect();

    Ok(Json(
        serde_json::json!({ "keys": keys, "active_mids": active_mids }),
    ))
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn save_volcengine_enhance_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
    Json(payload): Json<VolcEnhanceConfigRequest>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    // 仅在传入了 keys 时保存多凭证列表
    if let Some(ref keys) = payload.keys {
        let keys_json = serde_json::to_string(keys).unwrap_or_else(|_| "[]".to_string());
        upsert_config(&state, "volcengine_enhance", "keys", &keys_json).await?;

        // 向上兼容写入第一个 api_key
        if let Some(first_key) = keys.first() {
            upsert_config(&state, "volcengine_enhance", "api_key", &first_key.api_key).await?;
        } else {
            upsert_config(&state, "volcengine_enhance", "api_key", "").await?;
        }
    }

    // 仅在传入了 active_mids 时更新模型激活状态
    if let Some(active_mids) = payload.active_mids {
        let preset_mids = vec!["vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep"];
        let provider_id: Option<i64> = sqlx::query_scalar(&state.db.format_query(
            "SELECT id FROM model_api_providers WHERE name ILIKE '%火山%' OR name ILIKE '%volcengine%' LIMIT 1"
        )).fetch_optional(&state.db.pool).await?;

        // 一键重置火山引擎专属预置模型为未激活状态，并更新归属服务商（保障基础数据准确）
        sqlx::query(&state.db.format_query(
            "UPDATE models SET \
             api_provider_id = ?, \
             is_active = 0, \
             updated_at = CURRENT_TIMESTAMP \
             WHERE mid = ANY(?)",
        ))
        .bind(provider_id)
        .bind(&preset_mids)
        .execute(&state.db.pool)
        .await?;

        // 根据前端提交的激活列表，过滤出火山专属模型
        let active_mids_filtered: Vec<String> = active_mids
            .into_iter()
            .filter(|mid| preset_mids.contains(&mid.as_str()))
            .collect();

        // 校验要激活的模型是否已配置服务商、计费规则和转发规则，保证数据的严谨性
        if !active_mids_filtered.is_empty() {
            let incomplete_names: Vec<String> = sqlx::query_scalar(&state.db.format_query(
                "SELECT name FROM models \
                 WHERE mid = ANY(?) \
                 AND ( \
                     provider_id IS NULL \
                     OR billing_rule_id IS NULL \
                     OR forward_rule_ids IS NULL \
                     OR forward_rule_ids = '' \
                     OR forward_rule_ids = '[]' \
                 )",
            ))
            .bind(&active_mids_filtered)
            .fetch_all(&state.db.pool)
            .await?;

            if !incomplete_names.is_empty() {
                let err_msg = format!(
                    "模型「{}」尚未完善官方服务商、计费规则或转发规则，请先前往「模型管理」完善配置后，再在插件中激活！",
                    incomplete_names.join("、")
                );
                return Err(crate::error::AppError::BadRequest(err_msg));
            }

            sqlx::query(&state.db.format_query(
                "UPDATE models SET \
                 is_active = 1, \
                 updated_at = CURRENT_TIMESTAMP \
                 WHERE mid = ANY(?)",
            ))
            .bind(&active_mids_filtered)
            .execute(&state.db.pool)
            .await?;
        }
    }

    Ok(Json(
        serde_json::json!({ "message": "火山画质增强配置已更新" }),
    ))
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn test_volcengine_connection(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
    Json(payload): Json<serde_json::Value>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }

    let api_key = payload
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let base_url = payload
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://mediakit.cn-beijing.volces.com");
    if api_key.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "API Key 不能为空".to_string(),
        ));
    }

    let client = reqwest::Client::new();
    let test_url = format!("{}/api/v1/tasks/ping-test", base_url.trim_end_matches('/'));
    let resp = client
        .get(&test_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status() == 401 {
                Ok(Json(
                    serde_json::json!({ "success": false, "message": "上游返回 401 Unauthorized，请检查 API Key 是否有效" }),
                ))
            } else {
                Ok(Json(
                    serde_json::json!({ "success": true, "message": "通道连接成功" }),
                ))
            }
        }
        Err(e) => Ok(Json(
            serde_json::json!({ "success": false, "message": format!("连接上游网络失败: {}", e) }),
        )),
    }
}

#[cfg(feature = "plugin_volcengine_enhance")]
const VOLC_ENHANCE_MIDS: &[&str] = &["vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep"];

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(Debug, serde::Deserialize)]
pub struct VolcLogQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub keyword: Option<String>,
}

#[cfg(feature = "plugin_volcengine_enhance")]
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct VolcEnhanceLog {
    pub id: i64,
    pub log_id: Option<String>,
    pub user_id: String,
    pub model: String,
    pub cost: f64,
    pub latency_ms: i32,
    pub status_code: i32,
    pub billing_detail: Option<String>,
    pub billing_features: Option<String>,
    pub created_at: DbTs,
    pub user_uid: Option<String>,
    pub user_nickname: Option<String>,
    pub channel_name: Option<String>,
    pub model_name: Option<String>,
    pub task_id: Option<String>,
    pub error_message: Option<String>,
}

/// 写入 MediaKit 关联：`volcengine_enhance_logs.log_id` = `logs.id`（幂等）
#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn link_volcengine_enhance_log(state: &AppState, logs_pk: i64) {
    if logs_pk <= 0 {
        return;
    }
    let _ = sqlx::query(&state.db.format_query(
        "INSERT INTO volcengine_enhance_logs (log_id) VALUES (?) ON CONFLICT (log_id) DO NOTHING",
    ))
    .bind(logs_pk)
    .execute(&state.db.pool)
    .await;
}

/// 预置 mid + 库内 model_id（历史回填过滤）
#[cfg(feature = "plugin_volcengine_enhance")]
async fn resolve_volc_enhance_model_keys(state: &AppState) -> Vec<String> {
    let model_ids: Vec<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT model_id FROM models WHERE mid = ANY(?)"),
    )
    .bind(VOLC_ENHANCE_MIDS)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    let mut keys: Vec<String> = VOLC_ENHANCE_MIDS.iter().map(|s| (*s).to_string()).collect();
    for mid in model_ids {
        let mid = mid.trim();
        if !mid.is_empty() && !keys.iter().any(|k| k == mid) {
            keys.push(mid.to_string());
        }
    }
    keys
}

#[cfg(feature = "plugin_volcengine_enhance")]
async fn require_volc_admin(
    state: &AppState,
    claims: &crate::auth::Claims,
) -> crate::error::AppResult<()> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(crate::error::AppError::Forbidden(
            "需要管理员权限".to_string(),
        ));
    }
    Ok(())
}

#[cfg(feature = "plugin_volcengine_enhance")]
async fn volc_enhance_linked_count(state: &AppState) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM volcengine_enhance_logs")
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0)
}

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn get_volcengine_enhance_logs(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<VolcLogQuery>,
    Extension(claims): Extension<crate::auth::Claims>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    require_volc_admin(&state, &claims).await?;

    let page_size = query.page_size.unwrap_or(15).clamp(1, 100);
    let keyword = query.keyword.as_deref().unwrap_or("").trim().to_string();

    // 关联表驱动：COUNT/分页落在窄表，再 JOIN logs（不再 logs.model=ANY 全表扫）
    let mut where_clause = String::new();
    let mut kw_binds: Vec<String> = Vec::new();

    if !keyword.is_empty() {
        let kw = format!("%{}%", keyword);
        if let Some(uid) = crate::api::logs::lookup_user_id(&state.db, &keyword).await? {
            where_clause.push_str(" WHERE (l.log_id LIKE ? OR l.model LIKE ? OR l.user_id = ?)");
            kw_binds.push(kw.clone());
            kw_binds.push(kw);
            kw_binds.push(uid);
        } else {
            where_clause.push_str(
                " WHERE (l.log_id LIKE ? OR l.model LIKE ? OR l.user_id IN \
                 (SELECT id FROM users WHERE uid LIKE ? OR username LIKE ?))",
            );
            kw_binds.push(kw.clone());
            kw_binds.push(kw.clone());
            kw_binds.push(kw.clone());
            kw_binds.push(kw);
        }
    }

    let count_sql = if keyword.is_empty() {
        "SELECT COUNT(*) FROM volcengine_enhance_logs".to_string()
    } else {
        state.db.format_query(&format!(
            "SELECT COUNT(*) FROM volcengine_enhance_logs v \
             INNER JOIN logs l ON l.id = v.log_id{where_clause}"
        ))
    };
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    for v in &kw_binds {
        count_q = count_q.bind(v);
    }
    let total: i64 = count_q.fetch_one(&state.db.pool).await?;

    if total == 0 {
        return Ok(Json(serde_json::json!({
            "logs": [],
            "total": 0,
            "page": 1,
            "page_size": page_size,
            "linked": if keyword.is_empty() {
                0
            } else {
                volc_enhance_linked_count(&state).await
            },
        })));
    }

    let max_page = (total + page_size - 1) / page_size;
    let page = query.page.unwrap_or(1).max(1).min(max_page);
    let offset = (page - 1) * page_size;

    const LIST_JOINS: &str = " LEFT JOIN users u ON l.user_id = u.id \
         LEFT JOIN channels c ON l.channel_id = c.id \
         LEFT JOIN LATERAL ( \
             SELECT name FROM models \
             WHERE mid = l.model OR model_id = l.model \
             ORDER BY CASE WHEN mid = l.model THEN 0 ELSE 1 END \
             LIMIT 1 \
         ) m ON TRUE";

    // 先从关联表取 log_id，再回表 JOIN（log_id 单调 ≈ 时间序）
    let page_ids_sql = if keyword.is_empty() {
        format!(
            "SELECT v.log_id AS id FROM volcengine_enhance_logs v \
             ORDER BY v.log_id DESC LIMIT {page_size} OFFSET {offset}"
        )
    } else {
        state.db.format_query(&format!(
            "SELECT v.log_id AS id FROM volcengine_enhance_logs v \
             INNER JOIN logs l ON l.id = v.log_id{where_clause} \
             ORDER BY v.log_id DESC LIMIT {page_size} OFFSET {offset}"
        ))
    };
    let data_sql = format!(
        "SELECT \
            l.id, \
            l.log_id, \
            l.user_id, \
            l.model, \
            l.cost, \
            l.latency_ms, \
            l.status_code, \
            l.billing_detail, \
            l.billing_features, \
            l.created_at, \
            u.uid AS user_uid, \
            u.username AS user_nickname, \
            c.name AS channel_name, \
            m.name AS model_name, \
            l.task_id, \
            l.error_message \
         FROM ({page_ids_sql}) page \
         INNER JOIN logs l ON l.id = page.id \
         {LIST_JOINS} \
         ORDER BY l.id DESC"
    );

    let mut data_q = sqlx::query_as::<_, VolcEnhanceLog>(&data_sql);
    for v in &kw_binds {
        data_q = data_q.bind(v);
    }
    let logs: Vec<VolcEnhanceLog> = data_q.fetch_all(&state.db.pool).await?;
    let linked = if keyword.is_empty() {
        total
    } else {
        volc_enhance_linked_count(&state).await
    };

    Ok(Json(serde_json::json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "linked": linked,
    })))
}

#[cfg(feature = "plugin_volcengine_enhance")]
static VOLC_LOG_RECOVER_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn get_volcengine_enhance_logs_recover_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    require_volc_admin(&state, &claims).await?;
    Ok(Json(serde_json::json!({
        "running": VOLC_LOG_RECOVER_RUNNING.load(std::sync::atomic::Ordering::Relaxed),
        "linked": volc_enhance_linked_count(&state).await,
    })))
}

/// 后台分批回填：历史 logs（model∈预置 mid/model_id）→ 关联表
#[cfg(feature = "plugin_volcengine_enhance")]
pub async fn start_volcengine_enhance_logs_recover(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<crate::auth::Claims>,
) -> crate::error::AppResult<Json<serde_json::Value>> {
    require_volc_admin(&state, &claims).await?;

    let already = VOLC_LOG_RECOVER_RUNNING
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::Relaxed,
        )
        .is_err();

    let linked = volc_enhance_linked_count(&state).await;
    if already {
        return Ok(Json(serde_json::json!({
            "running": true,
            "linked": linked,
            "started": false,
        })));
    }

    let state_bg = Arc::clone(&state);
    tokio::spawn(async move {
        let keys = resolve_volc_enhance_model_keys(&state_bg).await;
        let insert_sql = state_bg.db.format_query(
            "INSERT INTO volcengine_enhance_logs (log_id) \
             SELECT l.id FROM logs l \
             WHERE l.model = ANY(?) \
               AND NOT EXISTS ( \
                   SELECT 1 FROM volcengine_enhance_logs v WHERE v.log_id = l.id \
               ) \
             ORDER BY l.id \
             LIMIT 500",
        );
        loop {
            let n = sqlx::query(&insert_sql)
                .bind(&keys)
                .execute(&state_bg.db.pool)
                .await
                .map(|r| r.rows_affected())
                .unwrap_or(0);
            if n == 0 {
                break;
            }
            tracing::info!("[MediaKit] 日志关联回填 +{n}");
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        VOLC_LOG_RECOVER_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
        tracing::info!(
            "[MediaKit] 日志关联回填完成，当前关联={}",
            volc_enhance_linked_count(&state_bg).await
        );
    });

    Ok(Json(serde_json::json!({
        "running": true,
        "linked": linked,
        "started": true,
    })))
}
