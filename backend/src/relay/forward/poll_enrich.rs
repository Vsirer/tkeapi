/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 轮询后处理扩展点：厂商 status 与结果体分离时在此补齐。
//! 新队列类厂商：在 `enrich_poll_response` 增加 match arm，逻辑放 `vendors/`。
//! 轮询 URL 仍由 `task` 按规则 `poll_path` / 原有默认逻辑解析。

use super::{build_auth_headers, vendors, ResolvedForward};
use crate::models::Channel;

/// 轮询后处理失败（由 task 映射为 PollReqErr）
pub struct PollEnrichErr {
    pub http_status: Option<u16>,
    pub message: String,
}

/// 轮询 GET 成功后的厂商补齐。默认原样返回。
pub async fn enrich_poll_response(
    resolved: &ResolvedForward,
    http_client: &reqwest::Client,
    channel: &Channel,
    poll_url: &str,
    body: String,
) -> Result<(String, String), PollEnrichErr> {
    match resolved.target_type.as_str() {
        "fal_video" => {
            let auth = build_auth_headers(resolved, &channel.api_key, false);
            vendors::fal_enrich_queue_poll(http_client, auth, poll_url, body).await
        }
        _ => Ok((poll_url.to_string(), body)),
    }
}

/// 轮询成功后根据 target_type 为客户端格式化响应注入各厂商专属消耗指标（仅 fal_video 等指定目标生效，避免字段污染）
pub fn enrich_client_poll_usage(target_type: &str, json_str: &str, billing_features: &str) -> String {
    match target_type {
        "fal_video" => vendors::inject_fal_poll_usage(json_str, billing_features),
        _ => json_str.to_string(),
    }
}
