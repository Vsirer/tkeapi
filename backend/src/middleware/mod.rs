/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

pub mod live_metrics;
pub mod rate_limit;
use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::auth;
use crate::error::AppError;
use crate::AppState;

/// API Key 脱敏：保留前8后4位，中间用 *** 替代
fn mask_key(key: &str) -> String {
    if key.len() <= 12 {
        return "***".to_string();
    }
    format!("{}***{}", &key[..8], &key[key.len() - 4..])
}

fn request_path(request: &Request) -> String {
    request
        .extensions()
        .get::<axum::extract::OriginalUri>()
        .map(|uri| uri.path().to_string())
        .unwrap_or_else(|| request.uri().path().to_string())
}

fn auth_skip_error_log(path: &str) -> bool {
    path.ends_with("/balance")
        || path.ends_with("/health")
        || path.ends_with("favicon.ico")
}

fn header_flag(request: &Request, name: &str) -> bool {
    matches!(
        request.headers().get(name).and_then(|v| v.to_str().ok()),
        Some("1" | "true")
    )
}

fn client_ip(request: &Request) -> &str {
    request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .or_else(|| {
            request
                .headers()
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
        })
        .unwrap_or("127.0.0.1")
}

fn playground_allowed(token: &crate::models::ApiToken, request: &Request) -> bool {
    let only_pg = token.only_playground == 1;
    let only_pg2026 = token.only_playground_2026 == 1;
    if !only_pg && !only_pg2026 {
        return true;
    }
    let pg = header_flag(request, "x-playground");
    let pg2026 = header_flag(request, "x-playground-2026");
    if only_pg && only_pg2026 {
        pg || pg2026
    } else if only_pg2026 {
        pg2026
    } else {
        pg
    }
}

fn ip_whitelisted(token: &crate::models::ApiToken, request: &Request) -> bool {
    if token.allowed_ips.is_empty() {
        return true;
    }
    let ip = client_ip(request);
    token.allowed_ips.split(',').any(|s| ip == s.trim())
}

async fn record_auth_error(
    state: &Arc<AppState>,
    skip_log: bool,
    user_id: &str,
    token_id: Option<i64>,
    status: u16,
    path: &str,
    message: &str,
) {
    if skip_log {
        return;
    }
    crate::relay::proxy::record_error_log(
        state,
        user_id,
        None,
        token_id,
        "unknown",
        status,
        path,
        message,
        None,
        None,
    )
    .await;
}

/// Extract user claims from JWT token in Authorization header
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        Some(h) => h,
        None => return AppError::Unauthorized.into_response(),
    };

    let token = match auth_header.strip_prefix("Bearer ") {
        Some(t) => t,
        None => return AppError::Unauthorized.into_response(),
    };

    let claims = match auth::validate_token(token, &state.config.jwt_secret) {
        Ok(c) => c,
        Err(_) => return AppError::Unauthorized.into_response(),
    };

    // 高频只读观测接口：仅校验 JWT，跳过 is_active 查库（减轻看板轮询对连接池压力）
    let path = request.uri().path();
    if path.ends_with("/metrics/live") {
        request.extensions_mut().insert(claims);
        return next.run(request).await;
    }

    // Verify user still exists and is active
    let is_active: Result<Option<i64>, sqlx::Error> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_active FROM users WHERE id = ?"),
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await;

    match is_active {
        Ok(Some(active)) if active != 0 => {
            request.extensions_mut().insert(claims);
            next.run(request).await
        }
        Ok(Some(_)) | Ok(None) => AppError::Unauthorized.into_response(),
        Err(e) => {
            tracing::warn!("Database error in auth_middleware: {}", e);
            AppError::Internal("Database connection error".to_string()).into_response()
        }
    }
}

/// Require admin role
pub async fn admin_middleware(request: Request, next: Next) -> Response {
    let claims = match request.extensions().get::<auth::Claims>() {
        Some(c) => c,
        None => return AppError::Unauthorized.into_response(),
    };

    if claims.role != "admin" {
        return AppError::Forbidden("Admin access required".to_string()).into_response();
    }

    next.run(request).await
}

/// 管理端写操作（POST/PUT/PATCH/DELETE）校验管理员等级 edit 权限。
/// 仅挂在 admin_routes / 插件 admin nest，不覆盖用户端、登录、回调、relay。
pub async fn admin_write_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let method = request.method();
    if matches!(
        *method,
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) {
        return next.run(request).await;
    }

    let claims = match request.extensions().get::<auth::Claims>() {
        Some(c) => c.clone(),
        None => return AppError::Unauthorized.into_response(),
    };
    // 用户端账号不走等级 edit；管理员走用户端接口由 route_map 白名单放行
    if claims.role != "admin" {
        return next.run(request).await;
    }
    // nest 后 request.uri 会丢掉前缀，必须用原始路径才能命中 /plugins /assets 等 map
    let path = request
        .extensions()
        .get::<axum::extract::OriginalUri>()
        .map(|uri| uri.path().to_string())
        .unwrap_or_else(|| request.uri().path().to_string());
    match crate::admin_permission::enforce_admin_write(&state, &claims, &path).await {
        Ok(Some(ctx)) => {
            request.extensions_mut().insert(ctx);
            next.run(request).await
        }
        Ok(None) => next.run(request).await,
        Err(err) => err.into_response(),
    }
}

/// Normalize vendor-specific API auth formats to standard Authorization header
/// Supports: x-api-key / X-Api-Key (Anthropic & Volcengine)
///           x-goog-api-key (Google Gemini)
///           ?key=xxx query parameter (Google Gemini)
fn normalize_request_auth(request: &mut Request) {
    if request.headers().get(header::AUTHORIZATION).is_none() {
        // 1. Try x-api-key or X-Api-Key (Anthropic & Volcengine)
        if let Some(key) = request
            .headers()
            .get("x-api-key")
            .or_else(|| request.headers().get("X-Api-Key"))
            .and_then(|v| v.to_str().ok())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert(header::AUTHORIZATION, val);
                return;
            }
        }

        // 2. Try x-goog-api-key (Google Gemini)
        if let Some(key) = request
            .headers()
            .get("x-goog-api-key")
            .and_then(|v| v.to_str().ok())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert(header::AUTHORIZATION, val);
                return;
            }
        }

        // 3. Try ?key= query parameter (Google Gemini)
        if let Some(query) = request.uri().query() {
            for pair in query.split('&') {
                if let Some(key) = pair.strip_prefix("key=") {
                    if let Ok(val) = format!("Bearer {}", key).parse() {
                        request.headers_mut().insert(header::AUTHORIZATION, val);
                    }
                    break;
                }
            }
        }
    }
}

/// Extract API token (sk-xxx) for relay endpoints
pub async fn api_key_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    normalize_request_auth(&mut request);

    let path = request_path(&request);
    let skip_log = auth_skip_error_log(&path);

    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        Some(h) => h,
        None => {
            if !skip_log {
                crate::relay_debug!("[Auth] {} | 缺少 Authorization 请求头", path);
            }
            record_auth_error(
                &state,
                skip_log,
                "unknown",
                None,
                401,
                &path,
                "Missing Authorization Header",
            )
            .await;
            return AppError::AuthFailed("Missing Authorization Header".to_string()).into_response();
        }
    };

    let api_key = match auth_header.strip_prefix("Bearer ") {
        Some(k) => k,
        None => {
            crate::relay_debug!(
                "[Auth] {} | Bearer 格式错误, header={}",
                path,
                &auth_header[..auth_header.len().min(20)]
            );
            record_auth_error(
                &state,
                skip_log,
                "unknown",
                None,
                401,
                &path,
                "Invalid Bearer Token Format",
            )
            .await;
            return AppError::AuthFailed("Invalid Bearer Token Format".to_string()).into_response();
        }
    };

    let token: crate::models::ApiToken =
        match crate::relay::relay_settings::lookup_api_token(&state.db, api_key).await {
            Ok(Some(t)) if t.is_active != 0 => {
                crate::relay_debug!(
                    "[Auth] {} | 令牌验证通过: key={}, token_id={}, user={}",
                    path,
                    mask_key(api_key),
                    t.id,
                    t.user_id
                );
                t
            }
            Ok(Some(t)) => {
                crate::relay_debug!(
                    "[Auth] {} | 令牌已禁用: key={}, token_id={}, user={}",
                    path,
                    mask_key(api_key),
                    t.id,
                    t.user_id
                );
                record_auth_error(
                    &state,
                    skip_log,
                    &t.user_id,
                    Some(t.id),
                    403,
                    &path,
                    "Token disabled",
                )
                .await;
                return AppError::Forbidden("Token disabled".to_string()).into_response();
            }
            Ok(None) => {
                crate::relay_debug!("[Auth] {} | 无效 API Key: key={}", path, mask_key(api_key));
                record_auth_error(
                    &state,
                    skip_log,
                    "unknown",
                    None,
                    401,
                    &path,
                    "Invalid API Key",
                )
                .await;
                return AppError::AuthFailed("Invalid API Key".to_string()).into_response();
            }
            Err(e) => return AppError::Internal(format!("Database error: {}", e)).into_response(),
        };

    if !playground_allowed(&token, &request) {
        let msg = if token.only_playground == 1 && token.only_playground_2026 == 1 {
            "该令牌仅能在创作中心或创作中心2026内使用"
        } else if token.only_playground_2026 == 1 {
            "该令牌仅能在创作中心2026内使用"
        } else {
            "该令牌仅能在创作中心内使用"
        };
        record_auth_error(
            &state,
            skip_log,
            &token.user_id,
            Some(token.id),
            403,
            &path,
            "This token is restricted to Playground use only",
        )
        .await;
        return AppError::Forbidden(msg.to_string()).into_response();
    }

    if token.is_expired() {
        record_auth_error(
            &state,
            skip_log,
            &token.user_id,
            Some(token.id),
            403,
            &path,
            "Token expired",
        )
        .await;
        return AppError::Forbidden("Token expired".to_string()).into_response();
    }

    let skip_quota_check = matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::DELETE
    );
    if !skip_quota_check {
        let site_tz = crate::relay::relay_settings::get_cached_site_timezone(&state.db).await;
        let timedisplay = crate::api::date_helper::resolve_user_timedisplay_name(
            &state.db,
            &token.user_id,
            &site_tz,
        )
        .await;
        if let Err(e) = state.quota_memory.check_quota(&token, &timedisplay) {
            let err_msg = e.to_string();
            record_auth_error(
                &state,
                skip_log,
                &token.user_id,
                Some(token.id),
                403,
                &path,
                &err_msg,
            )
            .await;
            return AppError::Forbidden(err_msg).into_response();
        }
    }

    if !ip_whitelisted(&token, &request) {
        let msg = format!("IP {} not whitelisted", client_ip(&request));
        record_auth_error(
            &state,
            skip_log,
            &token.user_id,
            Some(token.id),
            403,
            &path,
            &msg,
        )
        .await;
        return AppError::Forbidden(msg).into_response();
    }

    if token.rps_limit > 0 && !state.rate_limiter.check_rps(token.id, token.rps_limit) {
        record_auth_error(
            &state,
            skip_log,
            &token.user_id,
            Some(token.id),
            429,
            &path,
            "RPS limit exceeded",
        )
        .await;
        return AppError::TooManyRequests("RPS limit exceeded".to_string()).into_response();
    }

    if token.rpm_limit > 0 && !state.rate_limiter.check_rpm(token.id, token.rpm_limit) {
        record_auth_error(
            &state,
            skip_log,
            &token.user_id,
            Some(token.id),
            429,
            &path,
            "RPM limit exceeded",
        )
        .await;
        return AppError::TooManyRequests("RPM limit exceeded".to_string()).into_response();
    }

    let (global_guard, user_guard) = live_metrics::begin_request(&token.user_id, token.id);
    request.extensions_mut().insert(token);
    let mut response = next.run(request).await;
    response
        .extensions_mut()
        .insert(live_metrics::LiveMetricsTaskGuards::new(
            global_guard,
            user_guard,
        ));
    response
}
