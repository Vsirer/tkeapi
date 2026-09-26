/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use std::sync::Arc;

use serde_json::json;
use sqlx::{Postgres, Transaction};

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::LoginCandidate;
use crate::AppState;

pub const DEFAULT_ACCOUNTS_PER_CONTACT: i32 = 5;
const MAX_ACCOUNTS_PER_CONTACT: i32 = 99;

#[derive(Debug, Clone, Copy)]
pub struct Occupancy {
    pub bound_count: i64,
    pub limit: i32,
}

impl Occupancy {
    pub fn remaining(&self) -> i64 {
        (i64::from(self.limit) - self.bound_count).max(0)
    }

    pub fn at_limit(&self) -> bool {
        would_exceed_limit(self.bound_count, self.limit, false)
    }

    pub fn extra_json(&self) -> serde_json::Value {
        json!({
            "bound_count": self.bound_count,
            "limit": self.limit,
            "remaining": self.remaining(),
        })
    }

    pub fn in_use_error(&self, contact_label: &str) -> AppError {
        AppError::ConflictDetails(
            format!(
                "该{}已绑定 {} 个账号（上限 {}），可继续注册或直接登录",
                contact_label, self.bound_count, self.limit
            ),
            "CONTACT_IN_USE",
            self.extra_json(),
        )
    }

    pub fn at_limit_error(&self, contact_label: &str) -> AppError {
        AppError::ConflictDetails(
            format!(
                "该{}已绑定 {} 个账号，已达上限 {}",
                contact_label, self.bound_count, self.limit
            ),
            "CONTACT_AT_LIMIT",
            self.extra_json(),
        )
    }
}

pub fn normalize_limit(raw: i32) -> i32 {
    if (1..=MAX_ACCOUNTS_PER_CONTACT).contains(&raw) {
        raw
    } else {
        DEFAULT_ACCOUNTS_PER_CONTACT
    }
}

pub fn would_exceed_limit(bound_count: i64, limit: i32, already_holds: bool) -> bool {
    if already_holds {
        false
    } else {
        bound_count >= i64::from(limit)
    }
}

pub fn is_real_email(email: &str) -> bool {
    let email = email.trim();
    !email.is_empty() && !email.to_ascii_lowercase().ends_with("@tokensbyte.local")
}

pub fn is_real_mobile(mobile: &str) -> bool {
    !mobile.trim().is_empty()
}

fn exclude_id(exclude_user_id: Option<&str>) -> &str {
    exclude_user_id.unwrap_or("")
}

pub fn parse_contact_kind(kind: &str) -> AppResult<&'static str> {
    match kind.trim() {
        "email" => Ok("email"),
        "mobile" => Ok("mobile"),
        _ => Err(AppError::BadRequest(
            "kind 必须是 email 或 mobile".to_string(),
        )),
    }
}

pub fn effective_limit(override_limit: Option<i32>, global_default: i32) -> i32 {
    normalize_limit(override_limit.unwrap_or(global_default))
}

pub async fn fetch_override_limit(
    state: &Arc<AppState>,
    kind: &str,
    value: &str,
) -> AppResult<Option<i32>> {
    let row: Option<i32> = sqlx::query_scalar(&state.db.format_query(
        "SELECT max_accounts FROM contact_bind_limits WHERE kind = ? AND value = ?",
    ))
    .bind(kind)
    .bind(value)
    .fetch_optional(&state.db.pool)
    .await?;
    Ok(row)
}

async fn fetch_override_limit_tx(
    tx: &mut Transaction<'_, Postgres>,
    db: &Database,
    kind: &str,
    value: &str,
) -> AppResult<Option<i32>> {
    let row: Option<i32> = sqlx::query_scalar(
        &db.format_query("SELECT max_accounts FROM contact_bind_limits WHERE kind = ? AND value = ?"),
    )
    .bind(kind)
    .bind(value)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row)
}

pub async fn upsert_override_limit(
    state: &Arc<AppState>,
    kind: &str,
    value: &str,
    max_accounts: i32,
) -> AppResult<()> {
    if !(1..=MAX_ACCOUNTS_PER_CONTACT).contains(&max_accounts) {
        return Err(AppError::BadRequest(
            "绑定上限必须是 1–99".to_string(),
        ));
    }
    sqlx::query(&state.db.format_query(
        r#"INSERT INTO contact_bind_limits (kind, value, max_accounts)
           VALUES (?, ?, ?)
           ON CONFLICT (kind, value) DO UPDATE SET
             max_accounts = EXCLUDED.max_accounts,
             updated_at = CURRENT_TIMESTAMP"#,
    ))
    .bind(kind)
    .bind(value)
    .bind(max_accounts)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

pub async fn delete_override_limit(
    state: &Arc<AppState>,
    kind: &str,
    value: &str,
) -> AppResult<()> {
    sqlx::query(&state.db.format_query(
        "DELETE FROM contact_bind_limits WHERE kind = ? AND value = ?",
    ))
    .bind(kind)
    .bind(value)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

async fn resolved_email_limit(
    state: &Arc<AppState>,
    email: &str,
    global_default: i32,
) -> AppResult<i32> {
    let ov = fetch_override_limit(state, "email", email).await?;
    Ok(effective_limit(ov, global_default))
}

async fn resolved_mobile_limit(
    state: &Arc<AppState>,
    mobile: &str,
    global_default: i32,
) -> AppResult<i32> {
    let ov = fetch_override_limit(state, "mobile", mobile).await?;
    Ok(effective_limit(ov, global_default))
}

pub async fn email_occupancy(
    state: &Arc<AppState>,
    email: &str,
    exclude_user_id: Option<&str>,
    global_default: i32,
) -> AppResult<Occupancy> {
    let limit = resolved_email_limit(state, email, global_default).await?;
    if !is_real_email(email) {
        return Ok(Occupancy {
            bound_count: 0,
            limit,
        });
    }
    let bound_count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM users WHERE email = ? AND email NOT LIKE ? AND id != ?",
    ))
    .bind(email)
    .bind("%@tokensbyte.local")
    .bind(exclude_id(exclude_user_id))
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Occupancy { bound_count, limit })
}

pub async fn mobile_occupancy(
    state: &Arc<AppState>,
    mobile: &str,
    exclude_user_id: Option<&str>,
    global_default: i32,
) -> AppResult<Occupancy> {
    let limit = resolved_mobile_limit(state, mobile, global_default).await?;
    if !is_real_mobile(mobile) {
        return Ok(Occupancy {
            bound_count: 0,
            limit,
        });
    }
    let bound_count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM users WHERE mobile = ? AND COALESCE(mobile, '') != '' AND id != ?",
    ))
    .bind(mobile)
    .bind(exclude_id(exclude_user_id))
    .fetch_one(&state.db.pool)
    .await?;
    Ok(Occupancy { bound_count, limit })
}

pub fn gate_shared_contact(occ: Occupancy, confirm_new_account: bool, label: &str) -> AppResult<()> {
    if occ.bound_count <= 0 {
        return Ok(());
    }
    if occ.at_limit() {
        return Err(occ.at_limit_error(label));
    }
    if !confirm_new_account {
        return Err(occ.in_use_error(label));
    }
    Ok(())
}

async fn lock_contact(
    tx: &mut Transaction<'_, Postgres>,
    db: &Database,
    kind: &str,
    value: &str,
) -> AppResult<()> {
    sqlx::query(&db.format_query("SELECT pg_advisory_xact_lock(hashtext(?))"))
        .bind(format!("{kind}:{value}"))
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn email_occupancy_tx(
    tx: &mut Transaction<'_, Postgres>,
    db: &Database,
    email: &str,
    exclude_user_id: Option<&str>,
    global_default: i32,
) -> AppResult<Occupancy> {
    let ov = fetch_override_limit_tx(tx, db, "email", email).await?;
    let limit = effective_limit(ov, global_default);
    if !is_real_email(email) {
        return Ok(Occupancy {
            bound_count: 0,
            limit,
        });
    }
    let bound_count: i64 = sqlx::query_scalar(&db.format_query(
        "SELECT COUNT(*) FROM users WHERE email = ? AND email NOT LIKE ? AND id != ?",
    ))
    .bind(email)
    .bind("%@tokensbyte.local")
    .bind(exclude_id(exclude_user_id))
    .fetch_one(&mut **tx)
    .await?;
    Ok(Occupancy { bound_count, limit })
}

async fn mobile_occupancy_tx(
    tx: &mut Transaction<'_, Postgres>,
    db: &Database,
    mobile: &str,
    exclude_user_id: Option<&str>,
    global_default: i32,
) -> AppResult<Occupancy> {
    let ov = fetch_override_limit_tx(tx, db, "mobile", mobile).await?;
    let limit = effective_limit(ov, global_default);
    if !is_real_mobile(mobile) {
        return Ok(Occupancy {
            bound_count: 0,
            limit,
        });
    }
    let bound_count: i64 = sqlx::query_scalar(&db.format_query(
        "SELECT COUNT(*) FROM users WHERE mobile = ? AND COALESCE(mobile, '') != '' AND id != ?",
    ))
    .bind(mobile)
    .bind(exclude_id(exclude_user_id))
    .fetch_one(&mut **tx)
    .await?;
    Ok(Occupancy { bound_count, limit })
}

pub async fn assert_email_slot_tx(
    tx: &mut Transaction<'_, Postgres>,
    db: &Database,
    email: &str,
    exclude_user_id: Option<&str>,
    limit: i32,
) -> AppResult<()> {
    if !is_real_email(email) {
        return Ok(());
    }
    lock_contact(tx, db, "email", email).await?;
    let occ = email_occupancy_tx(tx, db, email, exclude_user_id, limit).await?;
    if occ.at_limit() {
        return Err(occ.at_limit_error("邮箱"));
    }
    Ok(())
}

pub async fn assert_mobile_slot_tx(
    tx: &mut Transaction<'_, Postgres>,
    db: &Database,
    mobile: &str,
    exclude_user_id: Option<&str>,
    limit: i32,
) -> AppResult<()> {
    if !is_real_mobile(mobile) {
        return Ok(());
    }
    lock_contact(tx, db, "mobile", mobile).await?;
    let occ = mobile_occupancy_tx(tx, db, mobile, exclude_user_id, limit).await?;
    if occ.at_limit() {
        return Err(occ.at_limit_error("手机号"));
    }
    Ok(())
}

pub async fn assert_email_slot(
    state: &Arc<AppState>,
    email: &str,
    exclude_user_id: Option<&str>,
    limit: i32,
) -> AppResult<()> {
    let occ = email_occupancy(state, email, exclude_user_id, limit).await?;
    if occ.at_limit() {
        return Err(occ.at_limit_error("邮箱"));
    }
    Ok(())
}

pub async fn assert_mobile_slot(
    state: &Arc<AppState>,
    mobile: &str,
    exclude_user_id: Option<&str>,
    limit: i32,
) -> AppResult<()> {
    let occ = mobile_occupancy(state, mobile, exclude_user_id, limit).await?;
    if occ.at_limit() {
        return Err(occ.at_limit_error("手机号"));
    }
    Ok(())
}

pub async fn list_email_candidates(
    state: &Arc<AppState>,
    email: &str,
) -> AppResult<Vec<LoginCandidate>> {
    if !is_real_email(email) {
        return Ok(Vec::new());
    }
    let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(&state.db.format_query(
        "SELECT uid, username, nickname FROM users WHERE email = ? AND email NOT LIKE ? ORDER BY created_at ASC, uid ASC",
    ))
    .bind(email)
    .bind("%@tokensbyte.local")
    .fetch_all(&state.db.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(uid, username, nickname)| LoginCandidate {
            uid,
            username,
            nickname,
        })
        .collect())
}

pub async fn list_mobile_candidates(
    state: &Arc<AppState>,
    mobile: &str,
) -> AppResult<Vec<LoginCandidate>> {
    if !is_real_mobile(mobile) {
        return Ok(Vec::new());
    }
    let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(&state.db.format_query(
        "SELECT uid, username, nickname FROM users WHERE mobile = ? AND COALESCE(mobile, '') != '' ORDER BY created_at ASC, uid ASC",
    ))
    .bind(mobile)
    .fetch_all(&state.db.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(uid, username, nickname)| LoginCandidate {
            uid,
            username,
            nickname,
        })
        .collect())
}

pub fn account_select_error(candidates: Vec<LoginCandidate>, label: &str) -> AppError {
    AppError::ConflictDetails(
        format!("该{}绑定了多个账号，请选择要操作的 UID", label),
        "ACCOUNT_SELECT_REQUIRED",
        json!({ "candidates": candidates }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum PasswordMatchKind {
        None,
        Single,
        Multiple,
    }

    fn classify_password_matches(match_count: usize, selected_uid: Option<&str>) -> PasswordMatchKind {
        if selected_uid.is_some() {
            if match_count == 1 {
                PasswordMatchKind::Single
            } else {
                PasswordMatchKind::None
            }
        } else {
            match match_count {
                0 => PasswordMatchKind::None,
                1 => PasswordMatchKind::Single,
                _ => PasswordMatchKind::Multiple,
            }
        }
    }

    #[test]
    fn default_limit_when_invalid() {
        assert_eq!(normalize_limit(0), DEFAULT_ACCOUNTS_PER_CONTACT);
        assert_eq!(normalize_limit(-1), DEFAULT_ACCOUNTS_PER_CONTACT);
        assert_eq!(normalize_limit(100), DEFAULT_ACCOUNTS_PER_CONTACT);
        assert_eq!(normalize_limit(5), 5);
        assert_eq!(normalize_limit(1), 1);
        assert_eq!(normalize_limit(99), 99);
    }

    #[test]
    fn occupancy_allows_existing_holder() {
        assert!(!would_exceed_limit(5, 5, true));
        assert!(would_exceed_limit(5, 5, false));
        assert!(!would_exceed_limit(4, 5, false));
    }

    #[test]
    fn login_selects_when_multiple_and_no_uid() {
        assert_eq!(
            classify_password_matches(2, None),
            PasswordMatchKind::Multiple
        );
        assert_eq!(classify_password_matches(1, None), PasswordMatchKind::Single);
        assert_eq!(classify_password_matches(0, None), PasswordMatchKind::None);
        assert_eq!(
            classify_password_matches(1, Some("10001")),
            PasswordMatchKind::Single
        );
        assert_eq!(
            classify_password_matches(0, Some("10001")),
            PasswordMatchKind::None
        );
    }

    #[test]
    fn placeholder_email_is_not_real() {
        assert!(!is_real_email("u_123@tokensbyte.local"));
        assert!(!is_real_email(""));
        assert!(is_real_email("user@example.com"));
    }

    #[test]
    fn override_limit_wins_until_invalid() {
        assert_eq!(effective_limit(Some(8), 5), 8);
        assert_eq!(effective_limit(None, 5), 5);
        assert_eq!(effective_limit(Some(0), 5), DEFAULT_ACCOUNTS_PER_CONTACT);
        assert_eq!(effective_limit(Some(100), 5), DEFAULT_ACCOUNTS_PER_CONTACT);
    }

    #[test]
    fn parse_contact_kind_rejects_unknown() {
        assert_eq!(parse_contact_kind("email").unwrap(), "email");
        assert_eq!(parse_contact_kind("mobile").unwrap(), "mobile");
        assert!(parse_contact_kind("wechat").is_err());
    }
}
