/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

fn default_unlimited() -> i32 {
    -1
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Redemption {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub quota: f64,
    pub is_used: i32,
    pub used_at: Option<DbTs>,
    pub used_by: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    /// 过期时间（NULL/空 = 长期有效）
    #[sqlx(default)]
    pub expires_at: Option<DbTs>,
    /// 单兑换码可兑换次数，-1 = 不限（兼容历史 0 = 不限）
    #[sqlx(default)]
    pub max_uses: i32,
    /// 已兑换次数（按单个兑换码累计）
    #[sqlx(default)]
    pub used_count: i32,
    /// 单兑换码单用户可兑换次数，-1 = 不限（兼容历史 0 = 不限）
    #[sqlx(default)]
    pub per_user_limit: i32,
    /// 同一活动（同 name）下单用户可兑换次数，-1 = 不限（兼容历史缺省）
    #[sqlx(default)]
    pub per_user_activity_limit: i32,
    /// 状态: 1=正常, 0=禁用, -1=作废
    #[sqlx(default)]
    pub status: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateRedemptionRequest {
    pub name: String,
    pub count: i32,
    pub quota: f64,
    /// 是否长期有效（true 时忽略 expires_at）
    #[serde(default = "default_true")]
    pub permanent: bool,
    /// 过期时间 ISO 字符串（permanent=false 时必填）
    #[serde(default)]
    pub expires_at: Option<String>,
    /// 是否允许多次兑换（false 时强制 max_uses=1；与活动参与次数限制相互独立）
    #[serde(default)]
    pub allow_multiple: bool,
    /// 单兑换码兑换次数上限，-1 = 不限（仅 allow_multiple=true 时生效；每个码独立）
    #[serde(default = "default_unlimited")]
    pub max_uses: i32,
    /// 单兑换码单用户兑换次数上限，-1 = 不限（仅 allow_multiple=true 时生效）
    #[serde(default = "default_unlimited")]
    pub per_user_limit: i32,
    /// 同一活动下单用户可兑换次数上限，-1 = 不限（与 allow_multiple 相互独立）
    #[serde(default = "default_unlimited")]
    pub per_user_activity_limit: i32,
}

#[derive(Debug, Deserialize)]
pub struct RedeemRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRedemptionStatusRequest {
    pub status: i32,
}

#[derive(Debug, Deserialize)]
pub struct RedemptionQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RedemptionGroup {
    pub name: String,
    pub total_count: i64,
    pub total_quota: f64,
    pub created_at: DbTs,
    pub expires_at: Option<DbTs>,
    pub total_used_count: i64,
    pub max_uses: i32,
    pub per_user_limit: i32,
    #[sqlx(default)]
    pub per_user_activity_limit: i32,
}

#[derive(Debug, Serialize)]
pub struct RedemptionGroupResponse {
    pub data: Vec<RedemptionGroup>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct RedemptionListResponse {
    pub data: Vec<Redemption>,
    pub total: i64,
}
