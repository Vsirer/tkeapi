/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 腾讯云 API 3.0（TC3-HMAC-SHA256）原生 HTTP 调用，无官方 SDK。
//! 供短信、内容安全审核、后续 COS/TOS 等复用。

use chrono::Utc;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use std::time::Duration;

use super::http_client::{with_timeout, with_upstream_timeout};

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(super::http_client::build_outbound_client)
}

/// 限流/可重试策略（次数=额外重试，不含首次）
#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub interval: Duration,
}

impl RetryPolicy {
    pub fn new(max_retries: u32, interval_ms: u64) -> Self {
        Self {
            max_retries: max_retries.min(20),
            interval: Duration::from_millis(interval_ms.clamp(100, 60_000)),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct InvokeOpts<'a> {
    pub service: &'a str,
    pub action: &'a str,
    pub version: &'a str,
    pub region: &'a str,
    pub payload: &'a str,
}

/// 腾讯云业务错误码（Response.Error.Code）
pub fn error_code(body: &Value) -> Option<&str> {
    body.pointer("/Response/Error/Code")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
}

pub fn request_id(body: &Value) -> &str {
    body.pointer("/Response/RequestId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
}

/// 限流、模型瞬时失败：适合间隔重试
pub fn is_retryable(body: &Value) -> bool {
    matches!(
        error_code(body).unwrap_or(""),
        "RequestLimitExceeded"
            | "LimitExceeded"
            | "InternalError.QueryReqLimited"
            | "ResourceUnavailable.ModelCallFailed"
    )
}

fn is_retryable_transport(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("timeout")
        || e.contains("timed out")
        || e.contains("connect")
        || e.contains("connection")
        || e.contains("temporarily")
        || e.contains("reset")
}

/// 单次 TC3 调用。传输失败返回 Err；成功解析 JSON 即 Ok（业务 Error 仍在 body 内）。
pub async fn invoke(
    secret_id: &str,
    secret_key: &str,
    opts: InvokeOpts<'_>,
) -> Result<Value, String> {
    invoke_timed(secret_id, secret_key, opts, None).await
}

async fn invoke_timed(
    secret_id: &str,
    secret_key: &str,
    opts: InvokeOpts<'_>,
    timeout: Option<Duration>,
) -> Result<Value, String> {
    let host = format!("{}.tencentcloudapi.com", opts.service);
    let content_type = "application/json; charset=utf-8";
    let now = Utc::now();
    let timestamp = now.timestamp();
    let date = now.format("%Y-%m-%d").to_string();

    let hashed_payload = hex::encode(Sha256::digest(opts.payload.as_bytes()));
    let canonical_request = format!(
        "POST\n/\n\ncontent-type:{content_type}\nhost:{host}\n\ncontent-type;host\n{hashed_payload}"
    );
    let credential_scope = format!("{date}/{}/tc3_request", opts.service);
    let hashed_canonical = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign =
        format!("TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical}");

    let secret_date = hmac_sha256(format!("TC3{secret_key}").as_bytes(), date.as_bytes());
    let secret_service = hmac_sha256(&secret_date, opts.service.as_bytes());
    let secret_signing = hmac_sha256(&secret_service, b"tc3_request");
    let signature = hex::encode(hmac_sha256(&secret_signing, string_to_sign.as_bytes()));
    let authorization = format!(
        "TC3-HMAC-SHA256 Credential={secret_id}/{credential_scope}, SignedHeaders=content-type;host, Signature={signature}"
    );

    let builder = http()
        .post(format!("https://{host}"))
        .header("Content-Type", content_type)
        .header("Host", &host)
        .header("X-TC-Action", opts.action)
        .header("X-TC-Version", opts.version)
        .header("X-TC-Timestamp", timestamp.to_string())
        .header("X-TC-Region", opts.region)
        .header("Authorization", &authorization)
        .body(opts.payload.to_string());
    let builder = match timeout {
        Some(t) => with_timeout(builder, t),
        None => with_upstream_timeout(builder),
    };

    let resp = builder.send().await.map_err(|e| format!("请求失败: {e}"))?;
    resp.json::<Value>()
        .await
        .map_err(|e| format!("响应解析失败: {e}"))
}

/// 限流/瞬时失败按间隔重试；成功返回 `(body, 额外重试次数)`，首次成功则为 0。
pub async fn invoke_with_retry(
    secret_id: &str,
    secret_key: &str,
    opts: InvokeOpts<'_>,
    policy: RetryPolicy,
    timeout: Option<Duration>,
) -> Result<(Value, u32), String> {
    let mut last_transport: Option<String> = None;
    let attempts = policy.max_retries.saturating_add(1);
    for i in 0..attempts {
        if i > 0 {
            tokio::time::sleep(policy.interval).await;
        }
        match invoke_timed(secret_id, secret_key, opts, timeout).await {
            Ok(body) => {
                if is_retryable(&body) && i + 1 < attempts {
                    tracing::warn!(
                        "[tencentcloud] {} {} rate-limited request_id={} retry={}/{}",
                        opts.service,
                        opts.action,
                        request_id(&body),
                        i + 1,
                        policy.max_retries
                    );
                    last_transport = None;
                    continue;
                }
                return Ok((body, i));
            }
            Err(e) => {
                if is_retryable_transport(&e) && i + 1 < attempts {
                    tracing::warn!(
                        "[tencentcloud] {} {} transport retry={}/{}: {e}",
                        opts.service,
                        opts.action,
                        i + 1,
                        policy.max_retries
                    );
                    last_transport = Some(e);
                    continue;
                }
                return Err(e);
            }
        }
    }
    Err(last_transport.unwrap_or_else(|| "请求失败: 重试耗尽".into()))
}
