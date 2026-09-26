/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

#![allow(dead_code)]
use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

/// 邮箱/短信验证码统一有效期（分钟），与落库 expires_at、邮件正文保持一致
pub const VERIFICATION_CODE_EXPIRY_MINUTES: i64 = 5;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum VerificationPurpose {
    Register,
    ResetPassword,
    BindMobile,
    BindEmail,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct VerificationCode {
    pub id: i64,
    pub email: String,
    /// 手机号（短信验证码时使用）
    pub phone: String,
    pub code: String,
    pub purpose: String,
    pub expires_at: DbTs,
    pub created_at: DbTs,
}
