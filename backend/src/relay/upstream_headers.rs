/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay Header 透传：上游响应头过滤；客户端请求头黑名单过滤后注入上游。
//! 网关会重建 body，故不可原样转发 content-length / content-encoding。
//! 鉴权头由调用方在本模块之后写入，保证渠道 key 覆盖客户端 sk。

use axum::http::header::{self, HeaderName, HeaderValue};
use axum::http::HeaderMap;
use axum::response::Response;

/// 是否应将上游响应头转发给客户端。
#[inline]
fn should_forward_response_header(name: &HeaderName) -> bool {
    !matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-connection"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailers"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
            | "content-encoding"
            | "content-type"
            | "set-cookie"
    )
}

/// 读取上游响应头字符串值。
#[inline]
pub fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

/// 上游 Content-Type 是否为 SSE。
#[inline]
pub fn is_sse(headers: &HeaderMap) -> bool {
    header_str(headers, "content-type").is_some_and(|s| s.contains("text/event-stream"))
}

/// 上游 Content-Type 是否为可流式消费（SSE / NDJSON）。
#[inline]
pub fn is_stream_content_type(headers: &HeaderMap) -> bool {
    header_str(headers, "content-type")
        .is_some_and(|s| s.contains("text/event-stream") || s.contains("application/x-ndjson"))
}

/// 将上游可转发头挂到 Response builder。
fn apply_upstream_response_headers(
    mut builder: axum::http::response::Builder,
    upstream: &HeaderMap,
) -> axum::http::response::Builder {
    for (name, value) in upstream
        .iter()
        .filter(|(n, _)| should_forward_response_header(n))
    {
        builder = builder.header(name, value);
    }
    builder
}

/// 将上游可转发头写入已构建 Response 的 HeaderMap（错误路径等）。
pub fn merge_upstream_response_headers(dest: &mut HeaderMap, upstream: &HeaderMap) {
    for (name, value) in upstream
        .iter()
        .filter(|(n, _)| should_forward_response_header(n))
    {
        dest.append(name.clone(), value.clone());
    }
}

/// 已有该响应头时替换为 `value`；无则不动。`value` 空/非法则移除该头。
#[inline]
pub fn replace_header_if_present(headers: &mut HeaderMap, name: &str, value: &str) {
    if !headers.contains_key(name) {
        return;
    }
    let Ok(key) = HeaderName::try_from(name) else {
        return;
    };
    match HeaderValue::try_from(value) {
        Ok(v) if !value.is_empty() => {
            headers.insert(key, v);
        }
        _ => {
            headers.remove(key);
        }
    }
}

/// 透传上游诊断头并设置指定 Content-Type。
pub fn with_content_type(
    upstream: &HeaderMap,
    content_type: impl AsRef<str>,
    body: impl Into<axum::body::Body>,
) -> Response {
    apply_upstream_response_headers(Response::builder(), upstream)
        .header(header::CONTENT_TYPE, content_type.as_ref())
        .body(body.into())
        .unwrap()
}

/// 成功 JSON 响应：透传上游诊断头 + `application/json`。
#[inline]
pub fn json_with_upstream_headers(
    upstream: &HeaderMap,
    body: impl Into<axum::body::Body>,
) -> Response {
    with_content_type(upstream, "application/json", body)
}

/// SSE 响应：透传上游诊断头 + 网关流式固定头（insert 覆盖，避免与上游 Cache-Control 重复）。
pub fn sse_with_upstream_headers(
    upstream: &HeaderMap,
    body: impl Into<axum::body::Body>,
) -> Response {
    let mut resp = with_content_type(upstream, "text/event-stream", body);
    let h = resp.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    h.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
    resp
}

/// 判定请求头要绑定的追踪头策略：2 个都有才用 2 个；仅有 x-request-id 用 x-request-id；默认（或仅有 request-id）统一用 request-id。
#[inline]
fn active_request_id_headers(headers: &HeaderMap) -> (&'static str, Option<&'static str>) {
    let has_x = headers.contains_key("x-request-id");
    let has_req = headers.contains_key("request-id");
    if has_x && has_req {
        ("request-id", Some("x-request-id"))
    } else if has_x {
        ("x-request-id", None)
    } else {
        ("request-id", None)
    }
}

/// 向响应头注入诊断头并清理冗余头（2 个都有才用 2 个，默认仅用 request-id）。
pub fn inject_request_id(
    headers: &mut HeaderMap,
    client_headers: &HeaderMap,
    log_id: &str,
) {
    let trimmed = log_id.trim();
    if trimmed.is_empty() {
        return;
    }
    let Ok(v) = HeaderValue::try_from(trimmed) else {
        return;
    };
    let (primary, secondary) = active_request_id_headers(client_headers);
    headers.insert(HeaderName::from_static(primary), v.clone());
    if let Some(sec) = secondary {
        headers.insert(HeaderName::from_static(sec), v.clone());
    } else {
        let other = if primary == "request-id" { "x-request-id" } else { "request-id" };
        headers.remove(other);
    }

    if client_headers.contains_key("x-log-id") {
        headers.insert(HeaderName::from_static("x-log-id"), v);
    } else {
        headers.remove("x-log-id");
    }
}

/// 将统一 request-id 注入到 Response，保持响应头干净无冗余。
#[inline]
pub fn with_request_id(mut resp: Response, client_headers: &HeaderMap, log_id: &str) -> Response {
    inject_request_id(resp.headers_mut(), client_headers, log_id);
    resp
}

/// 从客户端请求头中提取客户端带来的 request-id（不区分大小写）。
/// 只认标准 `x-request-id`、`request-id` 以及前端创作中心 `x-log-id`。
/// 必须是非空、合理长度（1..=128）且全为合法可见 ASCII 字符。
pub fn extract_client_request_id(headers: &HeaderMap) -> Option<String> {
    const CANDIDATES: &[&str] = &["x-request-id", "request-id", "x-log-id"];
    for key in CANDIDATES {
        if let Some(val) = headers.get(*key).and_then(|v| v.to_str().ok()) {
            let trimmed = val.trim();
            if !trimmed.is_empty()
                && trimmed.len() <= 128
                && trimmed.bytes().all(|b| (32..=126).contains(&b))
            {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

/// 确定本请求的全局统一日志 ID（结合客户端 request-id 与平台日志 ID）：
/// - 客户端有带有效 request-id：用客户端传入的，不额外生成日志 ID；
/// - 客户端没有带：按类别生成平台日志 ID（任务类 tsk_，普通聊天类 log_）。
pub fn resolve_request_log_id(headers: &HeaderMap, category: Option<&str>) -> String {
    if let Some(client_id) = extract_client_request_id(headers) {
        return client_id;
    }
    let prefix = if category.is_some_and(|c| !c.is_empty() && c != "聊天") {
        "tsk_"
    } else {
        "log_"
    };
    format!("{}{}", prefix, ulid::Ulid::new().to_string().to_lowercase())
}

/// 客户端 → 上游：黑名单内不透传（鉴权 / hop-by-hop / body 绑定 / 流式易被带偏的 Accept·UA / 客户端 IP）。
/// 其余原样透传（Codex `x-codex-*`/`originator`、Claude `anthropic-beta`、追踪 id 等无需逐厂商登记）。
#[inline]
fn should_block_client_request_header(name: &str) -> bool {
    // 反代链路身份：勿把终端用户 IP/Host 打到上游（风控/地域/回调异常）
    if name == "forwarded" || name.starts_with("x-forwarded-") {
        return true;
    }
    matches!(
        name,
        // 鉴权 / Anthropic 版本：由渠道 auth 写入，禁止把平台 sk 打到上游
        "authorization"
            | "proxy-authorization"
            | "x-api-key"
            | "x-goog-api-key"
            | "anthropic-version"
            // hop-by-hop / 连接
            | "host"
            | "connection"
            | "keep-alive"
            | "proxy-connection"
            | "te"
            | "trailers"
            | "transfer-encoding"
            | "upgrade"
            // body 由网关 json() 重建
            | "content-length"
            | "content-encoding"
            | "content-type"
            // 压缩协商交给 reqwest
            | "accept-encoding"
            // Cookie 不应进上游
            | "cookie"
            | "cookie2"
            // 浏览器 Accept: application/json 会带偏 SSE；UA 亦勿透传
            | "accept"
            | "user-agent"
            // 客户端真实 IP（非 x-forwarded-* 前缀的常见变体）
            | "x-real-ip"
            | "x-client-ip"
            | "cf-connecting-ip"
            | "true-client-ip"
            | "fastly-client-ip"
            | "x-cluster-client-ip"
            | "x-original-forwarded-for"
            // request-id 由 apply_client_request_headers 统一在末尾写入对齐的 log_id，避免重复头
            | "x-request-id"
            | "request-id"
    )
}

/// 将黑名单外的客户端请求头注入上游 RequestBuilder，同时将当前请求的 log_id 注入为 request-id 请求头。
/// 客户端 2 个都有才用 2 个；仅有 x-request-id 用 x-request-id；默认（或仅有 request-id）上游统一用 request-id，杜绝冗余。
/// 调用方须在其后写入渠道鉴权与 Content-Type，保证覆盖。
pub fn apply_client_request_headers(
    mut builder: reqwest::RequestBuilder,
    headers: &HeaderMap,
    log_id: &str,
) -> reqwest::RequestBuilder {
    for (name, value) in headers.iter() {
        if !should_block_client_request_header(name.as_str()) {
            builder = builder.header(name, value);
        }
    }
    let trimmed = log_id.trim();
    if !trimmed.is_empty() {
        let (primary, secondary) = active_request_id_headers(headers);
        builder = builder.header(primary, trimmed);
        if let Some(sec) = secondary {
            builder = builder.header(sec, trimmed);
        }
    }
    builder
}

