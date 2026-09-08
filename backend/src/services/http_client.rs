/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 全局出站 HTTP 客户端：连接层容错 + 连接池复用。
//! 不设 Client 级总超时，避免切断长流式；非流式在请求级使用 [`with_upstream_timeout`]。

use std::sync::OnceLock;
use std::time::Duration;

fn env_secs(key: &str, default: u64) -> Duration {
    Duration::from_secs(
        std::env::var(key)
            .ok()
            .and_then(|v| v.parse().ok())
            .filter(|&n| n > 0)
            .unwrap_or(default),
    )
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or(default)
}

fn download_timeout() -> Duration {
    static TIMEOUT: OnceLock<Duration> = OnceLock::new();
    *TIMEOUT.get_or_init(|| env_secs("HTTP_DOWNLOAD_TIMEOUT_SECS", 300))
}

/// 出站 Client 公共基线（低延迟、建连超时、keepalive、空闲回收）。
pub fn outbound_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .tcp_nodelay(true)
        .tcp_keepalive(env_secs("HTTP_TCP_KEEPALIVE_SECS", 60))
        .connect_timeout(env_secs("HTTP_CONNECT_TIMEOUT_SECS", 10))
        .pool_idle_timeout(env_secs("HTTP_POOL_IDLE_TIMEOUT_SECS", 90))
        .pool_max_idle_per_host(env_usize("HTTP_POOL_MAX_IDLE_PER_HOST", 100))
}

/// AppState 共享客户端：无全局 request timeout（流式安全）。
pub fn build_outbound_client() -> reqwest::Client {
    outbound_client_builder().build().unwrap_or_else(|e| {
        tracing::warn!("出站 HTTP Client 构建失败，降级为最小安全配置: {}", e);
        reqwest::Client::builder()
            .tcp_nodelay(true)
            .connect_timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// 非流式上游默认总超时（默认 1800s，`HTTP_UPSTREAM_TIMEOUT_SECS` 可覆盖）。
pub fn upstream_timeout_duration() -> Duration {
    static TIMEOUT: OnceLock<Duration> = OnceLock::new();
    *TIMEOUT.get_or_init(|| env_secs("HTTP_UPSTREAM_TIMEOUT_SECS", 1800))
}

/// 使用显式超时（HA 备渠按剩余墙钟预算收紧时用）。
#[inline]
pub fn with_timeout(
    builder: reqwest::RequestBuilder,
    timeout: Duration,
) -> reqwest::RequestBuilder {
    builder.timeout(timeout)
}

/// 非流式上游防挂死总超时（默认 1800s）。
#[inline]
pub fn with_upstream_timeout(builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    with_timeout(builder, upstream_timeout_duration())
}

/// 仅在 `apply` 为 true 时挂显式超时（流式传 false，避免切断 SSE）。
#[inline]
pub fn with_timeout_if(
    builder: reqwest::RequestBuilder,
    apply: bool,
    timeout: Duration,
) -> reqwest::RequestBuilder {
    if apply {
        with_timeout(builder, timeout)
    } else {
        builder
    }
}

/// 资源下载类请求超时（默认 300s，`HTTP_DOWNLOAD_TIMEOUT_SECS` 可覆盖）。
#[inline]
pub fn with_download_timeout(builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    with_timeout(builder, download_timeout())
}

/// GET 下载完整响应体（带下载超时）。Playground / TOS 等共用，避免三处复制粘贴。
pub async fn download_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = with_download_timeout(client.get(url))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("读取失败: {}", e))
}
