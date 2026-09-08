/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Authentication required")]
    Unauthorized,

    #[error("{0}")]
    AuthFailed(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    /// 钱包可用余额不足（HTTP 402 Payment Required）
    #[error("{0}")]
    PaymentRequired(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("{0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Rate limited: {0}")]
    TooManyRequests(String),

    #[error("Upstream error: {0}")]
    UpstreamError(String),

    /// 上游 HTTP 错误；第三项为可选上游响应头（诊断用，如 x-request-id）
    #[error("Upstream HTTP error {0}: {1}")]
    UpstreamHttpError(u16, String, Option<HeaderMap>),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error("HTTP client error: {0:?}")]
    Reqwest(#[from] reqwest::Error),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl AppError {
    /// 给客户端/队列的原文，不含 Display 英文前缀。
    pub fn message(&self) -> String {
        match self {
            Self::Unauthorized => "Authentication required".into(),
            Self::AuthFailed(m)
            | Self::PaymentRequired(m)
            | Self::Forbidden(m)
            | Self::NotFound(m)
            | Self::BadRequest(m)
            | Self::Conflict(m)
            | Self::TooManyRequests(m)
            | Self::UpstreamError(m)
            | Self::Internal(m) => m.clone(),
            Self::UpstreamHttpError(_, m, _) => m.clone(),
            other => other.to_string(),
        }
    }

    /// 供 HA failover 等逻辑读取对外/上游关联状态码；未知则按网关错误 502
    pub fn http_status(&self) -> u16 {
        match self {
            Self::UpstreamHttpError(s, _, _) => *s,
            Self::Unauthorized | Self::AuthFailed(_) => 401,
            Self::PaymentRequired(_) => 402,
            Self::Forbidden(_) => 403,
            Self::NotFound(_) => 404,
            Self::BadRequest(_) => 400,
            Self::Conflict(_) => 409,
            Self::TooManyRequests(_) => 429,
            Self::UpstreamError(_) | Self::Reqwest(_) => 502,
            _ => 500,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // 一次匹配：拿走 message / 上游头，避免 HeaderMap clone
        let (status, message, upstream_headers, passthrough_json) = match self {
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "Authentication required".to_string(),
                None,
                false,
            ),
            AppError::AuthFailed(msg) => (StatusCode::UNAUTHORIZED, msg, None, false),
            AppError::PaymentRequired(msg) => (StatusCode::PAYMENT_REQUIRED, msg, None, false),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg, None, false),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg, None, false),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg, None, false),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg, None, false),
            AppError::TooManyRequests(msg) => (StatusCode::TOO_MANY_REQUESTS, msg, None, false),
            AppError::UpstreamError(msg) => (StatusCode::BAD_GATEWAY, msg, None, true),
            AppError::UpstreamHttpError(status, msg, headers) => {
                let status_code = StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY);
                (status_code, msg, headers, true)
            }
            AppError::Internal(msg) => {
                tracing::warn!("Internal error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                    None,
                    false,
                )
            }
            AppError::Database(e) => {
                tracing::warn!("Database error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal database error".to_string(),
                    None,
                    false,
                )
            }
            AppError::Reqwest(e) => {
                tracing::warn!("HTTP client error: {}", e);
                (
                    StatusCode::BAD_GATEWAY,
                    "Upstream request failed".to_string(),
                    None,
                    false,
                )
            }
            AppError::Anyhow(e) => {
                tracing::warn!("Error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                    None,
                    false,
                )
            }
            AppError::Json(e) => {
                tracing::warn!("JSON error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Serialization error".to_string(),
                    None,
                    false,
                )
            }
        };

        let body = if passthrough_json {
            serde_json::from_str::<serde_json::Value>(&message).unwrap_or_else(|_| {
                json!({
                    "error": {
                        "message": message,
                        "type": "api_error",
                        "code": status.as_u16().to_string(),
                    },
                })
            })
        } else {
            json!({
                "error": {
                    "message": message,
                    "type": "api_error",
                    "code": status.as_u16().to_string(),
                },
            })
        };

        let mut resp = (status, axum::Json(body)).into_response();
        if let Some(hdrs) = upstream_headers {
            crate::relay::upstream_headers::merge_upstream_response_headers(
                resp.headers_mut(),
                &hdrs,
            );
        }
        resp
    }
}

pub type AppResult<T> = Result<T, AppError>;
