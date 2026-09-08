/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::models::{ApiToken, BillingRule, Channel, Model};
use crate::AppState;
use std::sync::Arc;

use axum::body::Bytes;
use axum::response::IntoResponse;
use futures::StreamExt;
use reqwest::Response as ReqwestResponse;
use tokio::sync::mpsc;

use super::upstream_headers;

/// 流结束后统一结算：resolve_model → calculate_relay_cost → record_and_bill_inner
async fn settle_after_stream(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel: &Channel,
    model: &str,
    db_model: Option<&Model>,
    db_rule: &mut Option<BillingRule>,
    ctx: &crate::relay::proxy::UserContext,
    usage: crate::relay::usage_extractor::UsageTokens,
    features: crate::relay::usage_extractor::ExtractedFeatures,
    detail_extra: Option<String>,
    start_time: std::time::Instant,
    entry_endpoint: &str,
    upstream_path: &str,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    request_content: String,
    response_content: String,
    upstream_req_content: Option<String>,
    category: &str,
    pending_log_id: Option<i64>,
) {
    let map_res =
        crate::relay::router::mapping_resolution(Some(category), features.resolution.as_deref());
    let (resolved_model, mapping_source) =
        crate::relay::router::resolve_model(channel, model, db_model, map_res);
    let (cost, mut detail) = crate::relay::calculate_relay_cost(
        state,
        db_model,
        db_rule.as_mut(),
        channel,
        ctx,
        &usage,
        &features,
        mapping_source.as_deref(),
        model,
        &resolved_model,
    )
    .await;
    if let Some(extra) = detail_extra {
        detail.push_str(&extra);
    }
    let latency_ms = start_time.elapsed().as_millis() as u32;
    let ep = format!("{}|{}", entry_endpoint, upstream_path);
    crate::relay::proxy::record_and_bill_inner(crate::relay::proxy::BillRecord {
        ctx: crate::relay::ha::HaBillCtx::new(state, token, model, &ep)
            .category(category)
            .db(db_model),
        channel,
        log_id: pending_log_id,
        usage,
        cost,
        pre_deducted,
        pre_deduct_gift,
        latency_ms,
        is_stream: 1,
        status_code: 200,
        error_msg: None,
        request: Some(request_content),
        response: Some(response_content),
        upstream_req: upstream_req_content,
        detail: Some(detail),
        features: Some(features),
        time_multiplier: db_rule.as_ref().map(|r| r.applied_multiplier),
        plugin_tag: None,
    })
    .await;
}

/// SSE 原样透传：Anthropic Messages 或 Responses（`/v1/responses`、`/api/v3/responses` 等）
fn sse_body_passthrough(entry: &str) -> bool {
    crate::relay::forward::is_anthropic_messages_path(entry) || entry.ends_with("/responses")
}

/// Chat / Responses 流式
pub async fn handle_chat_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    ctx: crate::relay::proxy::UserContext,
    prompt_tokens: i32,
    request_content_str: String,
    start_time: std::time::Instant,
    target_type: String,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    smart_router_ep: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    mut db_rule: Option<BillingRule>,
) -> impl IntoResponse {
    let upstream_hdrs = response.headers().clone();
    let (tx, rx) = mpsc::channel::<Result<String, axum::Error>>(100);
    let mut upstream_stream = response.bytes_stream();

    tokio::spawn(async move {
        let mut buffer = String::new();
        let mut raw_response_text = String::new();
        let passthrough = sse_body_passthrough(&entry_endpoint);

        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk_str = String::from_utf8_lossy(&bytes);
                    raw_response_text.push_str(&chunk_str);
                    if passthrough {
                        if tx.send(Ok(chunk_str.to_string())).await.is_err() {
                            break;
                        }
                    } else {
                        buffer.push_str(&chunk_str);
                        while let Some(index) = buffer.find('\n') {
                            let line = buffer.drain(..index + 1).collect::<String>();
                            let line = line.trim();
                            if line.is_empty() {
                                continue;
                            }
                            if let Some(transformed) = crate::relay::forward::transform_sse_line(
                                &target_type,
                                line,
                                &model,
                            ) {
                                if tx
                                    .send(Ok(format!("data: {}\n\n", transformed)))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }

        if !passthrough {
            let _ = tx.send(Ok("data: [DONE]\n\n".to_string())).await;
        }

        let mut usage = crate::relay::usage_extractor::UsageTokens {
            prompt: prompt_tokens,
            completion: 0,
            ..Default::default()
        };
        if !raw_response_text.is_empty() {
            let actual = crate::relay::usage_extractor::parse_usage(&raw_response_text);
            if actual.prompt > 0 || actual.completion > 0 {
                usage = actual;
            }
        }
        if usage.prompt == 0 && usage.completion == 0 {
            usage.completion = 1;
        }

        let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
            .unwrap_or(serde_json::json!({}));
        let mut features = crate::relay::usage_extractor::extract_request_features(&req_json);
        crate::relay::usage_extractor::enrich_features_from_usage(&mut features, &usage);
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            &ctx,
            usage,
            features,
            smart_router_ep
                .as_ref()
                .map(|ep| format!(" | 智能路由: {}", ep)),
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            raw_response_text,
            upstream_req_content,
            "聊天",
            pending_log_id,
        )
        .await;
    });

    upstream_headers::sse_with_upstream_headers(
        &upstream_hdrs,
        axum::body::Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx)),
    )
}

/// 图片流式
pub async fn handle_image_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    ctx: crate::relay::proxy::UserContext,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    smart_router_ep: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    mut db_rule: Option<BillingRule>,
) -> impl IntoResponse {
    let upstream_hdrs = response.headers().clone();
    let (tx, rx) = mpsc::channel::<Result<Bytes, axum::Error>>(100);
    let mut upstream_stream = response.bytes_stream();

    tokio::spawn(async move {
        let mut full_response_text = String::new();

        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    full_response_text.push_str(&String::from_utf8_lossy(&bytes));
                    if tx.send(Ok(bytes)).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        let usage = crate::relay::usage_extractor::parse_usage(&full_response_text);
        let features = crate::relay::usage_extractor::features_from_exchange(
            Some(request_content_str.as_str()),
            upstream_req_content
                .as_deref()
                .filter(|uc| *uc != request_content_str.as_str()),
            Some(full_response_text.as_str()),
        );
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            &ctx,
            usage,
            features,
            smart_router_ep
                .as_ref()
                .map(|ep| format!(" | 智能路由: {}", ep)),
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            full_response_text,
            upstream_req_content,
            "图片",
            pending_log_id,
        )
        .await;
    });

    upstream_headers::sse_with_upstream_headers(
        &upstream_hdrs,
        axum::body::Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx)),
    )
}

/// 原生协议流式
pub async fn handle_native_stream(
    state: Arc<AppState>,
    token: ApiToken,
    channel: Channel,
    model: String,
    response: ReqwestResponse,
    ctx: crate::relay::proxy::UserContext,
    request_content_str: String,
    start_time: std::time::Instant,
    upstream_path: String,
    upstream_req_content: Option<String>,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    entry_endpoint: String,
    smart_router_ep: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<Model>,
    mut db_rule: Option<BillingRule>,
    hint_category: String,
) -> impl IntoResponse {
    let upstream_hdrs = response.headers().clone();
    let (tx, rx) = mpsc::channel::<Result<Bytes, axum::Error>>(100);
    let mut upstream_stream = response.bytes_stream();

    tokio::spawn(async move {
        let mut full_response_text = String::new();

        while let Some(chunk_result) = upstream_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    full_response_text.push_str(&String::from_utf8_lossy(&bytes));
                    if tx.send(Ok(bytes)).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        // 统一从完整响应文本提取 token 用量（复用 parse_usage 完整能力，覆盖 OpenAI/Gemini/Anthropic 等所有格式）
        let fallback = crate::relay::usage_extractor::parse_usage(&full_response_text);
        let mut prompt_tokens = fallback.prompt;
        let mut completion_tokens = fallback.completion;
        if prompt_tokens == 0 && completion_tokens == 0 {
            let req_json = serde_json::from_str::<serde_json::Value>(&request_content_str)
                .unwrap_or(serde_json::json!({}));
            prompt_tokens = crate::relay::chat::estimate_prompt_tokens(&req_json);
            completion_tokens = (full_response_text.len() as f64 / 4.0).ceil() as i32;
        }

        let mut features = crate::relay::usage_extractor::features_from_exchange(
            Some(request_content_str.as_str()),
            upstream_req_content
                .as_deref()
                .filter(|uc| *uc != request_content_str.as_str()),
            Some(full_response_text.as_str()),
        );
        let usage = crate::relay::usage_extractor::UsageTokens {
            prompt: prompt_tokens,
            completion: completion_tokens,
            ..fallback
        };
        crate::relay::usage_extractor::enrich_features_from_usage(&mut features, &usage);
        settle_after_stream(
            &state,
            &token,
            &channel,
            &model,
            db_model.as_ref(),
            &mut db_rule,
            &ctx,
            usage,
            features,
            smart_router_ep
                .as_ref()
                .map(|ep| format!(" | 智能路由: {}", ep)),
            start_time,
            &entry_endpoint,
            &upstream_path,
            pre_deducted,
            pre_deduct_gift,
            request_content_str,
            full_response_text,
            upstream_req_content,
            hint_category.as_str(),
            pending_log_id,
        )
        .await;
    });

    upstream_headers::sse_with_upstream_headers(
        &upstream_hdrs,
        axum::body::Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx)),
    )
}
