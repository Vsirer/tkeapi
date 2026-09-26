/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
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
        .tcp_keepalive(env_secs("HTTP_TCP_KEEPALIVE_SECS", 15))
        .connect_timeout(env_secs("HTTP_CONNECT_TIMEOUT_SECS", 10))
        .pool_idle_timeout(env_secs("HTTP_POOL_IDLE_TIMEOUT_SECS", 45))
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

fn max_download_bytes() -> usize {
    static MAX_BYTES: OnceLock<usize> = OnceLock::new();
    *MAX_BYTES.get_or_init(|| env_usize("HTTP_MAX_DOWNLOAD_MB", 50) * 1024 * 1024)
}

fn allow_private_outbound() -> bool {
    static ALLOW: OnceLock<bool> = OnceLock::new();
    *ALLOW.get_or_init(|| {
        std::env::var("SSRF_ALLOW_PRIVATE_IP")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    })
}

/// 检查 IP 是否为本地回环、内网私有地址或云元数据地址（杜绝 SSRF）
#[inline]
fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified() || v4.octets()[0] == 0
        }
        std::net::IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
    }
}

/// 统一出站 URL 安全检查：仅允许合法公网 HTTP/HTTPS 请求，严禁内网与私有 IP 探测。
/// 可通过环境变量 `SSRF_ALLOW_PRIVATE_IP=true` 临时放行内网（用于离线机房或纯内网环境）。
pub async fn is_safe_outbound_url(url_str: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(url_str) else { return false; };
    if url.scheme() != "http" && url.scheme() != "https" { return false; }
    let Some(host) = url.host_str() else { return false; };

    // 若显式开启了私网出站（如离线纯内网机房环境），直接放行
    if allow_private_outbound() {
        return true;
    }

    if host == "localhost" || host.ends_with(".local") || host.ends_with(".internal") || host.ends_with(".lan") {
        return false;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return !is_private_ip(ip);
    }
    let port = url.port_or_known_default().unwrap_or(80);
    tokio::net::lookup_host((host, port))
        .await
        .map(|mut addrs| addrs.all(|a| !is_private_ip(a.ip())))
        .unwrap_or(false)
}

/// GET 下载完整响应体（带 SSRF 安全检查与流式大小上限防护，防止 OOM）。Playground / TOS 等共用。
/// 默认上限 50 MB，可通过环境变量 `HTTP_MAX_DOWNLOAD_MB` 自定义配置。
pub async fn download_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    if !is_safe_outbound_url(url).await {
        return Err("出站目标地址受限".to_string());
    }
    let resp = with_download_timeout(client.get(url))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let mut resp = resp;
    let mut buf = Vec::new();
    let max_bytes = max_download_bytes();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if buf.len() + chunk.len() > max_bytes {
            return Err(format!(
                "远程资源超出大小限制 (最大 {} MB)",
                max_bytes / 1024 / 1024
            ));
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(buf)
}
