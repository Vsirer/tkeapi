/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 厂商 callback 代理：上游体含根级 `callback_url` 时改写为系统地址。
//! 本入口只查 logs、不写库；非级联则原文转发客户端；级联交由后台轮询结案后再通知。

use crate::error::AppResult;
use crate::AppState;
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::{json, Value};
use std::sync::Arc;

const CB_KEY: &str = "callback_url";

/// 从上游请求 JSON 根级提取 `callback_url`
pub fn extract_client_callback_url(v: &Value) -> Option<String> {
    v.get(CB_KEY)
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// 将上游 body 根级 `callback_url` 改写为系统地址
pub fn rewrite_upstream_callback(body: &mut Value, system_url: &str) {
    if body
        .get(CB_KEY)
        .and_then(|x| x.as_str())
        .is_some_and(|s| !s.trim().is_empty())
    {
        body[CB_KEY] = json!(system_url);
    }
}

/// 从请求头推断服务根地址（与支付回调逻辑相同）。
/// 优先级：`PUBLIC_API_URL` 环境变量 → `Origin` 头 → `X-Forwarded-Host` / `Host` 头
pub fn infer_base_url(headers: &axum::http::HeaderMap) -> String {
    std::env::var("PUBLIC_API_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("origin")
                .and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty() && *s != "null")
                .map(str::to_string)
        })
        .or_else(|| {
            let host = headers
                .get("x-forwarded-host")
                .or_else(|| headers.get("host"))
                .and_then(|v| v.to_str().ok())?;
            let scheme = headers
                .get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(
                    if host.contains("localhost") || host.contains("127.0.0.1") {
                        "http"
                    } else {
                        "https"
                    },
                );
            Some(format!("{}://{}", scheme, host))
        })
        .unwrap_or_else(|| "http://localhost:3000".to_string())
        .trim_end_matches('/')
        .to_string()
}

/// 构造系统回调地址，自动识别当前服务域名
pub fn system_callback_url(db_log_id: i64, headers: &axum::http::HeaderMap) -> String {
    format!(
        "{}/api/v1/relay/vendor-callback/{}",
        infer_base_url(headers),
        db_log_id
    )
}

pub fn stash_cb_in_plugin_tag(tag: &mut Value, client_url: &str) {
    tag["cb"] = json!(client_url);
}

pub fn cb_from_plugin_tag(plugin_tag: &str) -> Option<String> {
    let v: Value = serde_json::from_str(plugin_tag).ok()?;
    v.get("cb")
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

async fn post_official(state: &AppState, client_url: &str, official: &str) {
    match state
        .http_client
        .post(client_url)
        .header("Content-Type", "application/json")
        .body(official.to_string())
        .send()
        .await
    {
        Ok(resp) => crate::relay_debug!(
            "[VendorCallback] 已转发 url={} status={}",
            client_url,
            resp.status()
        ),
        Err(e) => crate::relay_debug!("[VendorCallback] 转发失败 url={} err={}", client_url, e),
    }
}

/// 直接向已知客户端 callback URL 转发
pub async fn notify_client(state: &AppState, client_url: &str, official: &str) {
    post_official(state, client_url, official).await;
}

/// 有客户端 callback 时转发；`plugin_tag` 由调用方传入
pub async fn forward_official_to_client(state: &AppState, plugin_tag: &str, official: &str) {
    let Some(url) = cb_from_plugin_tag(plugin_tag) else {
        return;
    };
    post_official(state, &url, official).await;
}

/// 厂商 callback：只读 logs；级联不转发；非级联原文转客户端
pub async fn vendor_callback(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    body: Bytes,
) -> AppResult<impl IntoResponse> {
    if id <= 0 {
        return Ok((StatusCode::BAD_REQUEST, "无效 id").into_response());
    }

    let plugin_tag: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COALESCE(plugin_tag,'') FROM logs WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten();

    let Some(plugin_tag) = plugin_tag else {
        return Ok((StatusCode::NOT_FOUND, "日志不存在").into_response());
    };

    // 级联：S1 上游回调只 ack，用户通知由后台轮询 S2 结案后处理
    if super::cascade::cascade_plugin_tag_present(&plugin_tag) {
        crate::relay_debug!("[VendorCallback] 级联跳过 id={}", id);
        return Ok((StatusCode::OK, "ok").into_response());
    }

    if let Some(url) = cb_from_plugin_tag(&plugin_tag) {
        let official = String::from_utf8_lossy(&body).to_string();
        let state2 = state.clone();
        tokio::spawn(async move {
            post_official(&state2, &url, &official).await;
        });
    }

    Ok((StatusCode::OK, "ok").into_response())
}
