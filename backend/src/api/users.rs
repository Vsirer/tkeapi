/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{
    CreateUserRequest, LoginResponse, RechargeRequest, UpdateUserRequest, User, UserListResponse,
};
use crate::AppState;
use axum::{
    extract::{ConnectInfo, Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

fn collect_kyc_list_statuses(
    rows: impl IntoIterator<Item = (String, String, String)>,
) -> HashMap<String, (Option<String>, Option<String>)> {
    let mut flags: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    for (user_id, kyc_type, status) in rows {
        if status == "none" || (kyc_type != "personal" && kyc_type != "enterprise") {
            continue;
        }
        let entry = flags.entry(user_id).or_insert((None, None));
        if kyc_type == "personal" {
            entry.0 = Some(status);
        } else {
            entry.1 = Some(status);
        }
    }
    flags
}

async fn attach_kyc_flags(state: &AppState, users: &mut [User]) -> AppResult<()> {
    if users.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = users.iter().map(|u| u.id.clone()).collect();
    // 每用户每类型取最新提交（submitted_at / updated_at / id），覆盖待审/通过/驳回/过期
    let rows: Vec<(String, String, String)> = sqlx::query_as(&state.db.format_query(
        "SELECT DISTINCT ON (user_id, kyc_type) user_id, kyc_type, status \
         FROM user_kyc \
         WHERE kyc_type IN ('personal', 'enterprise') AND status <> 'none' AND user_id = ANY(?) \
         ORDER BY user_id, kyc_type, COALESCE(submitted_at, updated_at) DESC, id DESC",
    ))
    .bind(&ids)
    .fetch_all(&state.db.pool)
    .await?;
    let flags = collect_kyc_list_statuses(rows);
    for user in users.iter_mut() {
        if let Some((personal, enterprise)) = flags.get(&user.id) {
            user.kyc_personal_status = personal.clone();
            user.kyc_enterprise_status = enterprise.clone();
            user.kyc_personal = personal.as_deref() == Some("approved");
            user.kyc_enterprise = enterprise.as_deref() == Some("approved");
        }
    }
    Ok(())
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> AppResult<Json<UserListResponse>> {
    let keyword = query
        .get("keyword")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut users: Vec<User> = if let Some(kw) = keyword {
        let like_pattern = format!("%{}%", kw);
        let limit: i64 = query
            .get("limit")
            .and_then(|s| s.parse().ok())
            .unwrap_or(50)
            .clamp(1, 100);
        sqlx::query_as(&state.db.format_query(
            "SELECT u.*, ul.name as level_name, ul.id as level_id FROM users u \
             LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.role = 'user' AND (u.username LIKE ? OR u.uid LIKE ? OR u.email LIKE ? OR u.nickname LIKE ?) \
             ORDER BY u.created_at DESC LIMIT ?"
        ))
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(limit)
        .fetch_all(&state.db.pool)
        .await?
    } else {
        sqlx::query_as(&state.db.format_query(
            "SELECT u.*, ul.name as level_name, ul.id as level_id FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key ORDER BY u.created_at DESC"
        ))
        .fetch_all(&state.db.pool)
        .await?
    };

    attach_kyc_flags(&state, &mut users).await?;

    let total = users.len() as i64;
    Ok(Json(UserListResponse { data: users, total }))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    headers: axum::http::HeaderMap,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
    Json(request): Json<CreateUserRequest>,
) -> AppResult<Json<User>> {
    let operator_name = claims.username.clone();
    let register_ip = crate::api::auth::extract_client_ip(&headers, &addr);
    crate::api::auth::validate_username(&request.username, false)?;
    let mut actual_email = request.email.clone();
    if actual_email.is_empty() {
        use rand::Rng;
        let random_suffix: String = (0..8)
            .map(|_| rand::thread_rng().gen_range(0..10).to_string())
            .collect();
        actual_email = format!("u_{}@tokensbyte.local", random_suffix);
    }

    let role = request.role.as_deref().unwrap_or("user");
    crate::admin_permission::require_edit(&ctx, crate::admin_permission::users_write_perm(role))?;
    crate::admin_permission::assert_can_assign_admin_group(&state, request.admin_group_id, role)
        .await?;

    let exists: bool = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)"),
    )
    .bind(&request.username)
    .fetch_one(&state.db.pool)
    .await?;

    if exists {
        return Err(AppError::Conflict("请更换用户名尝试".to_string()));
    }

    let password_hash = auth::hash_password(&request.password)?;
    let user_id = uuid::Uuid::new_v4().to_string();
    let uid = state
        .db
        .generate_unique_uid()
        .await
        .map_err(AppError::from)?;

    let user_group = request
        .user_group
        .as_deref()
        .unwrap_or(request.group.as_deref().unwrap_or("default"));
    let admin_group_id = request.admin_group_id;
    let mut referred_by = request.referred_by.clone().or(request.aff.clone());

    // Resolve referred_by to ID if it's a UID or Username
    if let Some(ref ref_val) = referred_by {
        if !ref_val.trim().is_empty() {
            if ref_val == &request.username {
                return Err(AppError::BadRequest("不能设置自己为推荐人".to_string()));
            }

            let resolved: Option<(String, String)> = sqlx::query_as(&state.db.format_query(
                "SELECT id, role FROM users WHERE id = ? OR uid = ? OR username = ? LIMIT 1",
            ))
            .bind(ref_val)
            .bind(ref_val)
            .bind(ref_val)
            .fetch_optional(&state.db.pool)
            .await?;

            if let Some((id, ref_role)) = resolved {
                if role == "user" && ref_role == "admin" {
                    return Err(AppError::BadRequest("上级推荐人不能是管理员".to_string()));
                }
                referred_by = Some(id);
            }
        }
    }

    let referral_history = if let Some(ref inviter_id) = referred_by {
        let now = crate::time_system::utc_naive_string();
        let display_name = state.db.get_user_display_name(inviter_id).await;
        Some(format!("[{}] 通过 {} 邀请注册\n", now, display_name))
    } else {
        None
    };

    let balance = request.balance.unwrap_or(0.0);
    let gift_balance = request.gift_balance.unwrap_or(0.0);
    let pay_enabled = request.pay_enabled.unwrap_or(1);
    let settings = crate::api::settings::load_all_settings(&state).await?;

    let mut tx = state.db.pool.begin().await?;
    crate::auth::contact::assert_email_slot_tx(
        &mut tx,
        &state.db,
        &actual_email,
        None,
        crate::auth::contact::normalize_limit(settings.registration.max_accounts_per_email),
    )
    .await?;
    if let Some(ref mobile) = request.mobile {
        crate::auth::contact::assert_mobile_slot_tx(
            &mut tx,
            &state.db,
            mobile,
            None,
            crate::auth::contact::normalize_limit(settings.registration.max_accounts_per_mobile),
        )
        .await?;
    }

    sqlx::query(
        &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, mobile, password_hash, role, user_group, admin_group_id, balance, gift_balance, pay_enabled, is_active, referred_by, referral_history, register_ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)"#)
    )
    .bind(&user_id)
    .bind(&uid)
    .bind(&request.username)
    .bind(&actual_email)
    .bind(&request.mobile)
    .bind(&password_hash)
    .bind(role)
    .bind(user_group)
    .bind(admin_group_id)
    .bind(balance)
    .bind(gift_balance)
    .bind(pay_enabled)
    .bind(&referred_by)
    .bind(&referral_history)
    .bind(&register_ip)
    .execute(&mut *tx)
    .await?;

    if balance > 0.0 {
        sqlx::query(
            &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type) VALUES (?, ?, 'manual', ?, ?, 'system')")
        )
        .bind(&user_id)
        .bind(balance)
        .bind("管理员创建用户-系统余额")
        .bind(&operator_name)
        .execute(&mut *tx)
        .await?;
    }

    if gift_balance > 0.0 {
        let gift_order_no = crate::api::plugins::finance::generate_gift_order_no();
        sqlx::query(
            &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type, order_no) VALUES (?, ?, 'manual', ?, ?, 'gift', ?)")
        )
        .bind(&user_id)
        .bind(gift_balance)
        .bind("管理员创建用户-赠送余额")
        .bind(&operator_name)
        .bind(&gift_order_no)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&user_id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(user))
}

pub async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<User>> {
    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ? OR u.uid = ?"
    ))
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(user))
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
    Json(request): Json<UpdateUserRequest>,
) -> AppResult<Json<User>> {
    let operator_name = claims.username.clone();
    let operator_id = claims.sub.clone();
    let mut user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ? OR u.uid = ?"
    ))
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let was_super_admin = crate::admin_permission::is_super_admin(&user.role, user.admin_group_id);
    let old_balance = user.balance;
    let old_gift_balance = user.gift_balance;
    let old_credit_limit = user.credit_limit;
    // 记录旧等级信息，用于变更时写日志
    let old_user_group = user.user_group.clone();
    let old_level_name: String = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COALESCE(name, ?) FROM user_levels WHERE group_key = ?"),
    )
    .bind(&old_user_group)
    .bind(&old_user_group)
    .fetch_optional(&state.db.pool)
    .await?
    .flatten()
    .unwrap_or_else(|| old_user_group.clone());

    crate::admin_permission::assert_role_immutable(&user.role, request.role.as_deref())?;
    crate::admin_permission::assert_super_admin_immutable(
        &user.role,
        user.admin_group_id,
        request.role.as_deref(),
        request.admin_group_id,
    )?;
    crate::admin_permission::require_edit(
        &ctx,
        crate::admin_permission::users_write_perm(&user.role),
    )?;

    if let Some(username) = request.username.filter(|u| u != &user.username) {
        crate::api::auth::validate_username(&username, false)?;
        user.username = username;
    }
    if let Some(email) = request.email {
        if email != user.email {
            let settings = crate::api::settings::load_all_settings(&state).await?;
            crate::auth::contact::assert_email_slot(
                &state,
                &email,
                Some(&user.id),
                crate::auth::contact::normalize_limit(settings.registration.max_accounts_per_email),
            )
            .await?;
        }
        user.email = email;
    }
    if let Some(password) = request.password {
        user.password_hash = auth::hash_password(&password)?;
    }
    if let Some(ref nickname) = request.nickname {
        if nickname.chars().count() > 24 {
            return Err(AppError::BadRequest(
                "昵称长度最多不能超过 24 个字符".to_string(),
            ));
        }
        user.nickname = Some(nickname.clone());
    }
    if let Some(mobile) = request.mobile {
        let current = user.mobile.clone().unwrap_or_default();
        if !mobile.is_empty() && mobile != current {
            let settings = crate::api::settings::load_all_settings(&state).await?;
            crate::auth::contact::assert_mobile_slot(
                &state,
                &mobile,
                Some(&user.id),
                crate::auth::contact::normalize_limit(settings.registration.max_accounts_per_mobile),
            )
            .await?;
        }
        user.mobile = Some(mobile);
    }
    if let Some(wechat_id) = request.wechat_id {
        user.wechat_id = Some(wechat_id);
    }
    if let Some(balance) = request.balance {
        user.balance = balance;
    }
    if let Some(gift_balance) = request.gift_balance {
        user.gift_balance = gift_balance;
    }
    if let Some(gift_used_quota) = request.gift_used_quota {
        user.gift_used_quota = gift_used_quota;
    }
    if let Some(user_group) = request.user_group {
        user.user_group = user_group;
    }
    if let Some(is_active) = request.is_active {
        user.is_active = is_active;
    }
    if let Some(admin_remark) = request.admin_remark {
        user.admin_remark = Some(admin_remark);
    }
    if let Some(admin_group_opt) = request.admin_group_id {
        user.admin_group_id = admin_group_opt;
    }
    if user.role != "admin" {
        user.admin_group_id = None;
    } else if !was_super_admin {
        crate::admin_permission::assert_can_assign_admin_group(
            &state,
            user.admin_group_id,
            &user.role,
        )
        .await?;
    }
    // 用户模型单独折扣（空字符串视为清空，存 NULL）
    if let Some(ref md) = request.model_discounts {
        user.model_discounts = if md.is_empty() {
            None
        } else {
            Some(md.clone())
        };
    }
    if let Some(timezone) = request.timezone {
        user.timezone = Some(timezone);
    }
    if let Some(credit_limit) = request.credit_limit {
        user.credit_limit = credit_limit;
    }
    if let Some(pay_enabled) = request.pay_enabled {
        user.pay_enabled = pay_enabled;
    }
    let old_referred_by = user.referred_by.clone();

    if let Some(referred_by) = request.referred_by {
        let mut new_ref = if referred_by.trim().is_empty() {
            None
        } else {
            Some(referred_by.clone())
        };

        // Resolve referred_by to ID if it's a UID or Username
        if let Some(ref ref_val) = new_ref {
            let resolved: Option<(String, String)> = sqlx::query_as(&state.db.format_query(
                "SELECT id, role FROM users WHERE id = ? OR uid = ? OR username = ? LIMIT 1",
            ))
            .bind(ref_val)
            .bind(ref_val)
            .bind(ref_val)
            .fetch_optional(&state.db.pool)
            .await?;

            if let Some((id, ref_role)) = resolved {
                if user.role == "user" && ref_role == "admin" {
                    return Err(AppError::BadRequest("上级推荐人不能是管理员".to_string()));
                }
                new_ref = Some(id);
            }
        }

        // 检查不能设置自己为推荐人
        if let Some(ref ref_id) = new_ref {
            if ref_id == &user.id || ref_id == &user.uid || ref_id == &user.username {
                return Err(AppError::BadRequest("不能设置自己为推荐人".to_string()));
            }
        }

        if old_referred_by != new_ref {
            let now = crate::time_system::utc_naive_string();
            let old_str = state
                .db
                .get_user_display_name(&old_referred_by.unwrap_or_else(|| "无".to_string()))
                .await;
            let new_str = state
                .db
                .get_user_display_name(&new_ref.clone().unwrap_or_else(|| "无".to_string()))
                .await;
            let msg = format!("[{}] 推荐人从 {} 变更为 {}\n", now, old_str, new_str);
            let mut hist = user.referral_history.clone().unwrap_or_default();
            hist.push_str(&msg);
            user.referral_history = Some(hist);
        }
        user.referred_by = new_ref;
    }

    let mut tx = state.db.pool.begin().await?;

    sqlx::query(
        &state.db.format_query(r#"UPDATE users SET username = ?, email = ?, password_hash = ?, 
           nickname = ?, mobile = ?, wechat_id = ?,
           role = ?, admin_group_id = ?, balance = ?, gift_balance = ?, gift_used_quota = ?, user_group = ?, is_active = ?, admin_remark = ?, referred_by = ?, referral_history = ?, model_discounts = ?, timezone = ?, credit_limit = ?, pay_enabled = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#)
    )
    .bind(&user.username)
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.nickname)
    .bind(&user.mobile)
    .bind(&user.wechat_id)
    .bind(&user.role)
    .bind(user.admin_group_id)
    .bind(user.balance)
    .bind(user.gift_balance)
    .bind(user.gift_used_quota)
    .bind(&user.user_group)
    .bind(user.is_active)
    .bind(&user.admin_remark)
    .bind(&user.referred_by)
    .bind(&user.referral_history)
    .bind(&user.model_discounts)
    .bind(&user.timezone)
    .bind(user.credit_limit)
    .bind(user.pay_enabled)
    .bind(&user.id)
    .execute(&mut *tx)
    .await?;

    // 系统钱包余额变动记录
    if (user.balance - old_balance).abs() > 1e-9 {
        let diff = user.balance - old_balance;
        let remark = if diff > 0.0 {
            "管理员调增系统余额"
        } else {
            "管理员调减系统余额"
        };
        sqlx::query(
            &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type) VALUES (?, ?, 'manual', ?, ?, 'system')")
        )
        .bind(&user.id)
        .bind(diff)
        .bind(remark)
        .bind(&operator_name)
        .execute(&mut *tx)
        .await?;
    }

    // 赠送钱包余额变动记录
    if (user.gift_balance - old_gift_balance).abs() > 1e-9 {
        let diff = user.gift_balance - old_gift_balance;
        let remark = if diff > 0.0 {
            "管理员调增赠送余额"
        } else {
            "管理员调减赠送余额"
        };
        let gift_order_no = crate::api::plugins::finance::generate_gift_order_no();
        sqlx::query(
            &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type, order_no) VALUES (?, ?, 'manual', ?, ?, 'gift', ?)")
        )
        .bind(&user.id)
        .bind(diff)
        .bind(remark)
        .bind(&operator_name)
        .bind(&gift_order_no)
        .execute(&mut *tx)
        .await?;
    }

    // 信控额度变动记录
    if (user.credit_limit - old_credit_limit).abs() > 1e-9 {
        let diff = user.credit_limit - old_credit_limit;
        let remark = if diff > 0.0 {
            "管理员调增信控额度"
        } else {
            "管理员调减信控额度"
        };
        sqlx::query(
            &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type) VALUES (?, ?, 'manual', ?, ?, 'credit')")
        )
        .bind(&user.id)
        .bind(diff)
        .bind(remark)
        .bind(&operator_name)
        .execute(&mut *tx)
        .await?;
    }

    // 用户等级变更日志
    if user.user_group != old_user_group {
        let new_level_name: String = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT COALESCE(name, ?) FROM user_levels WHERE group_key = ?"),
        )
        .bind(&user.user_group)
        .bind(&user.user_group)
        .fetch_optional(&mut *tx)
        .await?
        .flatten()
        .unwrap_or_else(|| user.user_group.clone());

        sqlx::query(&state.db.format_query(
            "INSERT INTO user_level_logs (user_id, old_level, old_level_name, new_level, new_level_name, operator, operator_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin')"
        ))
        .bind(&user.id)
        .bind(&old_user_group)
        .bind(&old_level_name)
        .bind(&user.user_group)
        .bind(&new_level_name)
        .bind(&operator_name)
        .bind(&operator_id)
        .execute(&mut *tx)
        .await?;
    }

    let balance_changed = (user.balance - old_balance).abs() > 1e-9
        || (user.gift_balance - old_gift_balance).abs() > 1e-9;

    tx.commit().await?;

    if balance_changed {
        crate::services::notification::spawn_low_balance_check(Arc::clone(&state), user.id.clone());
    }

    Ok(Json(user))
}

async fn spawn_object_deletes(
    state: &AppState,
    plugin: &str,
    rows: Vec<(String, String)>,
    label: &'static str,
    tasks: &mut Vec<tokio::task::JoinHandle<()>>,
) {
    if rows.is_empty() {
        return;
    }
    use crate::services::object_store::StoreKind;
    let all = crate::api::plugins::collect_object_stores(state, plugin).await;
    for (key, provider) in rows {
        let kind = StoreKind::parse(&provider);
        let stores: Vec<_> = all
            .iter()
            .filter(|s| StoreKind::parse(s.provider()) == kind)
            .cloned()
            .collect();
        if stores.is_empty() {
            continue;
        }
        tasks.push(tokio::spawn(async move {
            for store in stores {
                match store.delete_file(&key).await {
                    Ok(()) => tracing::info!("同步清理用户数据: {label} 文件删除成功: {key}"),
                    Err(e) => {
                        tracing::warn!("同步清理用户数据: {label} 文件删除失败: {key} - {e}")
                    }
                }
            }
        }));
    }
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
) -> AppResult<Json<serde_json::Value>> {
    let target: Option<(String, String, Option<i64>)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT id, role, admin_group_id FROM users WHERE id = ? OR uid = ?"),
    )
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?;
    let (target_id, role, gid) =
        target.ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // 防止管理员删除自己
    if claims.sub == target_id {
        return Err(AppError::BadRequest(
            "不能删除当前登录的管理员账户".to_string(),
        ));
    }

    if crate::admin_permission::is_super_admin(&role, gid) {
        return Err(AppError::BadRequest("超级管理员不可删除".to_string()));
    }
    crate::admin_permission::require_edit(&ctx, crate::admin_permission::users_write_perm(&role))?;

    // 0. 在事务开启前，先查出该用户在 plugin_assets 与 playground_assets 中上传的全部云端文件，
    //    以进行同步且并发的物理清理，避免云端对象存储产生孤儿垃圾文件。
    //    注：不可在下面的数据库事务内执行网络 IO，以避免长时间占用数据库连接。
    let assets: Vec<(String, String, String)> = sqlx::query_as::<_, (String, String, String)>(
        &state
            .db
            .format_query("SELECT file_url, plugin_ns, COALESCE(storage_provider, 'tos') FROM plugin_assets WHERE user_id = ?"),
    )
    .bind(&target_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    let pg_assets: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        &state.db.format_query("SELECT tos_object_key, COALESCE(storage_provider, 'tos') FROM playground_assets WHERE user_id = ? AND tos_object_key IS NOT NULL AND tos_object_key != ''")
    )
    .bind(&target_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    let mut pg2026_all: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        &state.db.format_query("SELECT tos_object_key, COALESCE(storage_provider, 'tos') FROM playground_2026_project_assets WHERE user_id = ? AND tos_object_key IS NOT NULL AND tos_object_key != ''")
    )
    .bind(&target_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();
    let pg2026_lib: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        &state.db.format_query("SELECT tos_object_key, COALESCE(storage_provider, 'tos') FROM playground_2026_assets WHERE user_id = ? AND tos_object_key IS NOT NULL AND tos_object_key != ''")
    )
    .bind(&target_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();
    pg2026_all.extend(pg2026_lib);

    if !assets.is_empty() || !pg_assets.is_empty() || !pg2026_all.is_empty() {
        // 并发生成 TOS 文件删除任务
        let mut delete_tasks = Vec::new();

        // 1. 处理 plugin_assets 关联的 TOS 文件删除 (包含国内版与国际版素材管理等插件)
        if !assets.is_empty() {
            // 缓存不同 plugin_ns 的 TosConfig，避免重复查库
            let mut stores = std::collections::HashMap::new();
            for ns in assets
                .iter()
                .map(|(_, ns, _)| ns.as_str())
                .collect::<std::collections::HashSet<_>>()
            {
                stores.insert(
                    ns.to_string(),
                    crate::api::plugins::collect_object_stores(&state, ns).await,
                );
            }

            for (file_url, plugin_ns, provider) in assets {
                let kind = crate::services::object_store::StoreKind::parse(&provider);
                let Some(list) = stores.get(&plugin_ns) else {
                    continue;
                };
                let matched = list
                    .iter()
                    .find(|s| {
                        crate::services::object_store::StoreKind::parse(s.provider()) == kind
                            && s.extract_object_key(&file_url).is_some()
                    })
                    .cloned()
                    .or_else(|| {
                        list.iter()
                            .find(|s| {
                                crate::services::object_store::StoreKind::parse(s.provider())
                                    == kind
                            })
                            .cloned()
                    });
                if let Some(tos_config) = matched {
                    if let Some(object_key) = tos_config.extract_object_key(&file_url) {
                        let task = tokio::spawn(async move {
                            match tos_config.delete_file(&object_key).await {
                                Ok(()) => {
                                    tracing::info!(
                                        "同步清理用户数据: plugin_assets 文件删除成功: {}",
                                        object_key
                                    );
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        "同步清理用户数据: plugin_assets 文件删除失败: {} - {}",
                                        object_key,
                                        e
                                    );
                                }
                            }
                        });
                        delete_tasks.push(task);
                    }
                }
            }
        }

        spawn_object_deletes(
            &state,
            "playground",
            pg_assets,
            "playground_assets",
            &mut delete_tasks,
        )
        .await;
        spawn_object_deletes(
            &state,
            "playground_2026",
            pg2026_all,
            "playground_2026_project_assets",
            &mut delete_tasks,
        )
        .await;

        // 超时保障机制：使用 tokio::time::timeout 给并发执行 of tasks 设置一个 30 秒的最大时间上限。
        // 即使云端网络异常卡死，接口也将在 30 秒内强制返回并继续主流程，绝不阻塞用户删除接口的正常响应。
        if !delete_tasks.is_empty() {
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                futures::future::join_all(delete_tasks),
            )
            .await;
        }
    }

    // 使用事务，按外键依赖顺序逐层清理关联数据
    let mut tx = state.db.pool.begin().await?;

    // 1. commissions 引用 recharge_records(id) 和 users(id)，必须最先删
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM commissions WHERE user_id = ? OR from_user_id = ?"),
    )
    .bind(&target_id)
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 2. recharge_records 引用 users(id)
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM recharge_records WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 3. api_tokens 引用 users(id)
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM api_tokens WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 4. orders 引用 users(id)
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM orders WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 5. plugin_assets 引用 users(id)
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM plugin_assets WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 6. plugin_asset_groups 引用 users(id)
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM plugin_asset_groups WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 7. 无外键但需清理的业务数据
    sqlx::query(&state.db.format_query("DELETE FROM logs WHERE user_id = ?"))
        .bind(&target_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM plugin_api_logs WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;
    // marketing 关联（无外键但需清理）
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM marketing_team_leaders WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM marketing_team_members WHERE user_id = ?"),
    )
    .bind(&target_id)
    .execute(&mut *tx)
    .await?;

    // 8. 最终删除用户主记录（playground_projects / playground_assets 已有 ON DELETE CASCADE）
    sqlx::query(&state.db.format_query("DELETE FROM users WHERE id = ?"))
        .bind(&target_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
pub async fn recharge_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
    Json(request): Json<RechargeRequest>,
) -> AppResult<Json<RechargeOutcome>> {
    if request.amount.is_nan() || request.amount.is_infinite() {
        return Err(AppError::BadRequest("无效的金额数值".to_string()));
    }
    let request_amount = crate::money::round_money(request.amount);

    let operator_name = claims.username.clone();
    let mut tx = state.db.pool.begin().await?;

    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ? OR u.uid = ?"
    ))
    .bind(&id)
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    crate::admin_permission::require_edit(
        &ctx,
        crate::admin_permission::users_write_perm(&user.role),
    )?;

    let remark = request
        .remark
        .unwrap_or_else(|| "Administrator Adjustment".to_string());
    let is_gift = request.wallet_type == "gift";
    let is_credit = request.wallet_type == "credit";

    if is_credit {
        // 信控额度操作
        let new_credit = user.credit_limit + request_amount;
        if new_credit < 0.0 {
            return Err(AppError::BadRequest("信控额度不能为负数".to_string()));
        }
        sqlx::query(&state.db.format_query(
            "UPDATE users SET credit_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ))
        .bind(new_credit)
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    } else if is_gift {
        // 赠送钱包操作
        let new_gift = user.gift_balance + request_amount;
        sqlx::query(&state.db.format_query(
            "UPDATE users SET gift_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ))
        .bind(new_gift)
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    } else {
        // 系统钱包操作
        let new_balance = user.balance + request_amount;
        sqlx::query(&state.db.format_query(
            "UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ))
        .bind(new_balance)
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    }

    let recharge_type = "manual";
    let wallet_type = if is_credit {
        "credit"
    } else if is_gift {
        "gift"
    } else {
        "system"
    };
    let order_no = if is_gift {
        crate::api::plugins::finance::generate_gift_order_no()
    } else {
        crate::api::plugins::finance::generate_system_order_no()
    };
    let recharge_id: i64 = sqlx::query_scalar::<_, i64>(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type, order_no) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id"))
        .bind(&user.id)
        .bind(request_amount)
        .bind(recharge_type)
        .bind(&remark)
        .bind(&operator_name)
        .bind(wallet_type)
        .bind(&order_no)
        .fetch_one(&mut *tx)
        .await?;

    let is_system = !is_gift && !is_credit;
    let mut commission_applied = 0.0;
    let commission_capped = false;
    let mut commission_from_wallet = 0.0;
    let mut commission_from_system = 0.0;
    if is_system && request_amount > 0.0 && request.apply_commission.unwrap_or(true) {
        match crate::services::affiliate::award_recharge_commission(
            &state.db,
            &mut tx,
            &user.id,
            recharge_id,
            request_amount,
        )
        .await
        {
            Ok(credited) => commission_applied = credited,
            Err(e) => {
                tracing::warn!(
                    "Failed to award commission for recharge {}: {}",
                    recharge_id,
                    e
                );
            }
        }
    }
    if is_system && request_amount < 0.0 && request.apply_commission.unwrap_or(false) {
        let system_order_no = crate::api::plugins::finance::generate_system_order_no();
        match crate::services::affiliate::clawback_admin_commission(
            &state.db,
            &mut tx,
            &user.id,
            recharge_id,
            -request_amount,
            &operator_name,
            &user.username,
            &system_order_no,
        )
        .await
        {
            Ok(cut) => {
                commission_from_wallet = cut.from_commission;
                commission_from_system = cut.from_system;
                commission_applied = crate::money::round_money(
                    -(cut.from_commission + cut.from_system),
                );
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to claw back commission for recharge {}: {}",
                    recharge_id,
                    e
                );
            }
        }
    }

    tx.commit().await?;

    // 扣减可能触发提醒；充值回升需清除本轮标记
    crate::services::notification::spawn_low_balance_check(Arc::clone(&state), user.id.clone());

    let updated_user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&user.id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(RechargeOutcome {
        user: updated_user,
        commission_applied,
        commission_capped,
        commission_from_wallet,
        commission_from_system,
    }))
}

#[derive(Debug, Serialize)]
pub struct RechargeOutcome {
    #[serde(flatten)]
    pub user: User,
    pub commission_applied: f64,
    pub commission_capped: bool,
    /// 本次从上级佣金钱包扣回的正数。
    pub commission_from_wallet: f64,
    /// 本次从上级系统钱包扣回的正数。
    pub commission_from_system: f64,
}

#[derive(Debug, Deserialize)]
pub struct CommissionPreviewQuery {
    pub amount: f64,
}

#[derive(Debug, Serialize)]
pub struct CommissionPreviewResponse {
    pub eligible: bool,
    pub direction: String,
    pub inviter_username: String,
    pub inviter_uid: String,
    pub ratio: f64,
    pub basis: String,
    pub suggested: f64,
    pub inviter_commission_balance: f64,
    pub inviter_system_balance: f64,
    pub from_commission: f64,
    pub from_system: f64,
    pub actual: f64,
    pub default_apply: bool,
}

pub async fn preview_commission_adjust(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<CommissionPreviewQuery>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<CommissionPreviewResponse>> {
    if query.amount.is_nan() || query.amount.is_infinite() {
        return Err(AppError::BadRequest("无效的金额数值".to_string()));
    }
    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ? OR u.uid = ?",
    ))
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;
    let ctx = crate::admin_permission::load_admin_context(&state, &claims.sub).await?;
    crate::admin_permission::require_edit(
        &ctx,
        crate::admin_permission::users_write_perm(&user.role),
    )?;

    let row: Option<(String, String, f64, f64, f64, String)> = sqlx::query_as(&state.db.format_query(
        "SELECT inv.username, inv.uid, inv.commission_balance, inv.balance, ul.commission_ratio, COALESCE(NULLIF(ul.commission_basis, ''), 'consumption') \
         FROM users u \
         JOIN users inv ON (inv.id = u.referred_by OR inv.uid = u.referred_by) \
         JOIN user_levels ul ON ul.group_key = inv.user_group \
         WHERE u.id = ? \
         ORDER BY CASE WHEN inv.id = u.referred_by THEN 0 ELSE 1 END \
         LIMIT 1",
    ))
    .bind(&user.id)
    .fetch_optional(&state.db.pool)
    .await?;

    let Some((username, uid, commission_balance, system_balance, ratio, basis)) = row else {
        return Ok(Json(CommissionPreviewResponse {
            eligible: false,
            direction: "none".to_string(),
            inviter_username: String::new(),
            inviter_uid: String::new(),
            ratio: 0.0,
            basis: "consumption".to_string(),
            suggested: 0.0,
            inviter_commission_balance: 0.0,
            inviter_system_balance: 0.0,
            from_commission: 0.0,
            from_system: 0.0,
            actual: 0.0,
            default_apply: false,
        }));
    };
    let quote = crate::services::affiliate::quote_adjust(
        query.amount,
        ratio,
        &basis,
        commission_balance,
    );
    Ok(Json(CommissionPreviewResponse {
        eligible: quote.eligible,
        direction: quote.direction.to_string(),
        inviter_username: username,
        inviter_uid: uid,
        ratio,
        basis: crate::services::affiliate::normalize_commission_basis(&basis).to_string(),
        suggested: quote.suggested,
        inviter_commission_balance: crate::money::round_money(commission_balance),
        inviter_system_balance: crate::money::round_money(system_balance),
        from_commission: quote.from_commission,
        from_system: quote.from_system,
        actual: quote.actual,
        default_apply: quote.default_apply,
    }))
}

#[derive(Debug, Deserialize)]
pub struct CommissionLedgerQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CommissionLedgerItem {
    pub id: String,
    pub created_at: String,
    pub amount: f64,
    pub ratio: f64,
    pub source: String,
    pub source_label: String,
    pub from_username: String,
    pub from_uid: String,
}

#[derive(Debug, Serialize)]
pub struct CommissionLedgerResponse {
    pub commission_balance: f64,
    pub period_earned: f64,
    pub period_clawback: f64,
    pub period_transfer: f64,
    pub data: Vec<CommissionLedgerItem>,
}

fn commission_ledger_label(source_key: &str, amount: f64) -> (&'static str, &'static str) {
    if source_key.starts_with("adjustclaw:") {
        ("adjust", "余额调减扣回")
    } else if source_key.starts_with("arkrefund:")
        || (amount < 0.0 && source_key.starts_with("ark:"))
    {
        ("refund", "退款回冲")
    } else if source_key.starts_with("ark:") {
        ("video", "视频返佣")
    } else if source_key.starts_with("recharge:") {
        ("recharge", "充值返佣")
    } else if source_key.starts_with("log:") {
        ("consumption", "消费返佣")
    } else if amount < 0.0 {
        ("refund", "回冲")
    } else {
        ("other", "其他")
    }
}

fn append_ledger_range(
    sql: &mut String,
    binds: &mut Vec<String>,
    field: &str,
    start: Option<&str>,
    end: Option<&str>,
    tz: chrono_tz::Tz,
) {
    if let Some(start) = start.filter(|s| !s.trim().is_empty()) {
        crate::api::date_helper::push_timestamptz_bound(sql, binds, field, start, false, tz);
    }
    if let Some(end) = end.filter(|s| !s.trim().is_empty()) {
        crate::api::date_helper::push_timestamptz_bound(sql, binds, field, end, true, tz);
    }
}

/// 管理端钱包明细：佣金入账、回冲，以及划转到系统钱包的流出。
pub async fn list_user_commission_ledger(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<CommissionLedgerQuery>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<CommissionLedgerResponse>> {
    crate::admin_permission::load_admin_context(&state, &claims.sub).await?;
    let user_id: String = sqlx::query_scalar(&state.db.format_query(
        "SELECT id FROM users WHERE id = ? OR uid = ? LIMIT 1",
    ))
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let commission_balance: f64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT commission_balance FROM users WHERE id = ?",
    ))
    .bind(&user_id)
    .fetch_one(&state.db.pool)
    .await?;

    let site_tz = crate::relay::relay_settings::get_cached_site_timezone(&state.db).await;
    let tz = crate::time_system::parse_timedisplay(&site_tz);
    let start = query.start_date.as_deref();
    let end = query.end_date.as_deref();

    let mut comm_where = " WHERE c.user_id = ?".to_string();
    let mut comm_binds = vec![user_id.clone()];
    append_ledger_range(&mut comm_where, &mut comm_binds, "c.created_at", start, end, tz);

    let sum_sql = state.db.format_query(&format!(
        "SELECT COALESCE(SUM(CASE WHEN c.amount > 0 THEN c.amount ELSE 0 END), 0)::float8, \
         COALESCE(SUM(CASE WHEN c.amount < 0 THEN -c.amount ELSE 0 END), 0)::float8 \
         FROM commissions c{comm_where}"
    ));
    let mut sum_q = sqlx::query_as::<_, (f64, f64)>(&sum_sql);
    for val in &comm_binds {
        sum_q = sum_q.bind(val);
    }
    let (period_earned, period_clawback) = sum_q.fetch_one(&state.db.pool).await?;

    #[derive(sqlx::FromRow)]
    struct CommissionRow {
        id: i32,
        amount: f64,
        ratio: f64,
        source_key: Option<String>,
        created_at: crate::time_system::DbTs,
        from_username: Option<String>,
        from_uid: Option<String>,
    }
    let list_sql = state.db.format_query(&format!(
        "SELECT c.id, c.amount, c.ratio, c.source_key, c.created_at, fu.username AS from_username, fu.uid AS from_uid \
         FROM commissions c \
         LEFT JOIN users fu ON fu.id = c.from_user_id \
         {comm_where} \
         ORDER BY c.created_at DESC, c.id DESC \
         LIMIT 500"
    ));
    let mut list_q = sqlx::query_as::<_, CommissionRow>(&list_sql);
    for val in &comm_binds {
        list_q = list_q.bind(val);
    }
    let commission_rows = list_q.fetch_all(&state.db.pool).await?;

    let mut xfer_where =
        " WHERE rr.user_id = ? AND rr.recharge_type = 'transfer'".to_string();
    let mut xfer_binds = vec![user_id.clone()];
    append_ledger_range(
        &mut xfer_where,
        &mut xfer_binds,
        "rr.created_at",
        start,
        end,
        tz,
    );
    let xfer_sum_sql = state.db.format_query(&format!(
        "SELECT COALESCE(SUM(rr.amount), 0)::float8 FROM recharge_records rr{xfer_where}"
    ));
    let mut xfer_sum_q = sqlx::query_scalar::<_, f64>(&xfer_sum_sql);
    for val in &xfer_binds {
        xfer_sum_q = xfer_sum_q.bind(val);
    }
    let period_transfer = xfer_sum_q.fetch_one(&state.db.pool).await?;

    #[derive(sqlx::FromRow)]
    struct TransferRow {
        id: i64,
        amount: f64,
        created_at: crate::time_system::DbTs,
    }
    let xfer_sql = state.db.format_query(&format!(
        "SELECT rr.id, rr.amount, rr.created_at FROM recharge_records rr{xfer_where} \
         ORDER BY rr.created_at DESC, rr.id DESC LIMIT 500"
    ));
    let mut xfer_q = sqlx::query_as::<_, TransferRow>(&xfer_sql);
    for val in &xfer_binds {
        xfer_q = xfer_q.bind(val);
    }
    let transfer_rows = xfer_q.fetch_all(&state.db.pool).await?;

    let money = crate::money::round_money;
    let mut data: Vec<CommissionLedgerItem> = commission_rows
        .into_iter()
        .map(|row| {
            let key = row.source_key.unwrap_or_default();
            let (source, source_label) = commission_ledger_label(&key, row.amount);
            CommissionLedgerItem {
                id: format!("c:{}", row.id),
                created_at: row.created_at.into_string(),
                amount: money(row.amount),
                ratio: row.ratio,
                source: source.to_string(),
                source_label: source_label.to_string(),
                from_username: row.from_username.unwrap_or_default(),
                from_uid: row.from_uid.unwrap_or_default(),
            }
        })
        .collect();
    data.extend(transfer_rows.into_iter().map(|row| CommissionLedgerItem {
        id: format!("t:{}", row.id),
        created_at: row.created_at.into_string(),
        amount: money(-row.amount),
        ratio: 0.0,
        source: "transfer".to_string(),
        source_label: "划转到系统钱包".to_string(),
        from_username: String::new(),
        from_uid: String::new(),
    }));
    data.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    data.truncate(500);

    Ok(Json(CommissionLedgerResponse {
        commission_balance: money(commission_balance),
        period_earned: money(period_earned),
        period_clawback: money(period_clawback),
        period_transfer: money(period_transfer),
        data,
    }))
}

pub async fn impersonate_user(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
    Path(id): Path<String>,
) -> AppResult<Json<LoginResponse>> {
    // 防御纵深：路由层已有 auth + admin_middleware，handler 再强制校验管理员身份
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin access required".to_string()));
    }
    crate::admin_permission::require_edit(&ctx, "users.list")?;

    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ? OR u.uid = ?"
    ))
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    if user.role != "user" {
        return Err(AppError::Forbidden(
            "Only normal users can be impersonated".to_string(),
        ));
    }

    if user.is_active == 0 {
        return Err(AppError::Forbidden("Account disabled".to_string()));
    }

    tracing::warn!(
        "[Impersonate] admin={} ({}) impersonating user={} ({})",
        claims.username,
        claims.sub,
        user.username,
        user.id
    );

    let token = auth::create_token(
        &user.id,
        &user.username,
        &user.role,
        &state.config.jwt_secret,
    )?;

    Ok(Json(LoginResponse { token, user }))
}

/// 管理员查询指定用户的等级变更历史
pub async fn get_user_level_logs(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let real_user_id: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM users WHERE id = ? OR uid = ? LIMIT 1"),
    )
    .bind(&id)
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?;
    let target_id = real_user_id.unwrap_or_else(|| id.clone());

    let logs = sqlx::query(
        &state.db.format_query(
            "SELECT id, user_id, old_level, old_level_name, new_level, new_level_name, operator, operator_id, source, remark, created_at FROM user_level_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
        )
    )
    .bind(&target_id)
    .fetch_all(&state.db.pool)
    .await?;

    use sqlx::Row;
    let data: Vec<serde_json::Value> = logs.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<i64, _>("id"),
            "old_level": row.get::<String, _>("old_level"),
            "old_level_name": row.get::<String, _>("old_level_name"),
            "new_level": row.get::<String, _>("new_level"),
            "new_level_name": row.get::<String, _>("new_level_name"),
            "operator": row.get::<String, _>("operator"),
            "source": row.get::<String, _>("source"),
            "remark": row.get::<String, _>("remark"),
            "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
        })
    }).collect();

    Ok(Json(
        serde_json::json!({ "data": data, "total": data.len() }),
    ))
}

#[derive(Debug, Deserialize)]
pub struct ConsumptionStatsBatchRequest {
    pub user_ids: Vec<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Default, Clone)]
pub struct ConsumptionStatsBatchItem {
    pub system_cost: f64,
    pub gift_cost: f64,
}

#[derive(Debug, sqlx::FromRow)]
struct ConsumptionStatsBatchRawRow {
    user_id: String,
    system_cost: f64,
    gift_cost: f64,
}

/// 批量查询用户消费合计（系统钱包 / 赠送钱包）。
/// 历史天走 usage_daily_stats，今日及碎片段走 logs，与财务/明细口径一致。
pub async fn query_consumption_stats_batch(
    state: &AppState,
    user_ids: &[String],
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> AppResult<HashMap<String, ConsumptionStatsBatchItem>> {
    if user_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let site_tz = crate::relay::relay_settings::get_cached_site_timezone(&state.db).await;
    let tz: chrono_tz::Tz = site_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai);
    let slices = crate::api::date_helper::calculate_query_slices(start_date, end_date, tz);

    let placeholders = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let mut result: HashMap<String, ConsumptionStatsBatchItem> = HashMap::new();
    let merge_row = |map: &mut HashMap<String, ConsumptionStatsBatchItem>,
                     row: ConsumptionStatsBatchRawRow| {
        let entry = map.entry(row.user_id).or_default();
        entry.system_cost += row.system_cost;
        entry.gift_cost += row.gift_cost;
    };

    if slices.has_history_days {
        let sql = format!(
            "SELECT user_id, \
                COALESCE(SUM(GREATEST(total_cost - total_pre_deduct_gift, 0.0)), 0.0) as system_cost, \
                COALESCE(SUM(total_pre_deduct_gift), 0.0) as gift_cost \
             FROM usage_daily_stats \
             WHERE user_id IN ({}) AND {} \
             GROUP BY user_id",
            placeholders,
            slices.history_cond("stat_date")
        );
        let formatted_sql = state.db.format_query(&sql);
        let mut query = sqlx::query_as::<_, ConsumptionStatsBatchRawRow>(&formatted_sql);
        for id in user_ids {
            query = query.bind(id);
        }
        query = query
            .bind(slices.hist_start_date)
            .bind(slices.hist_end_date);
        let rows = query.fetch_all(&state.db.pool).await?;
        for row in rows {
            merge_row(&mut result, row);
        }
    }

    for r_slice in slices.realtime_slices() {
        let sql = format!(
            "SELECT user_id, \
                COALESCE(SUM(GREATEST(cost - pre_deduct_gift, 0.0)), 0.0) as system_cost, \
                COALESCE(SUM(pre_deduct_gift), 0.0) as gift_cost \
             FROM logs \
             WHERE user_id IN ({}) AND {} \
             GROUP BY user_id",
            placeholders,
            r_slice.sql_cond("created_at")
        );
        let formatted_sql = state.db.format_query(&sql);
        let mut query = sqlx::query_as::<_, ConsumptionStatsBatchRawRow>(&formatted_sql);
        for id in user_ids {
            query = query.bind(id);
        }
        query = query.bind(&r_slice.start).bind(&r_slice.end);
        let rows = query.fetch_all(&state.db.pool).await?;
        for row in rows {
            merge_row(&mut result, row);
        }
    }

    Ok(result)
}

/// 管理后台：批量查询用户消费合计。
pub async fn get_consumption_stats_batch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ConsumptionStatsBatchRequest>,
) -> AppResult<Json<HashMap<String, ConsumptionStatsBatchItem>>> {
    let result = query_consumption_stats_batch(
        &state,
        &req.user_ids,
        req.start_date.as_deref(),
        req.end_date.as_deref(),
    )
    .await?;
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
pub struct ContactBindQuery {
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct PutContactBindRequest {
    pub kind: String,
    pub value: String,
    pub max_accounts: i32,
}

#[derive(Debug, Serialize)]
pub struct ContactBindResponse {
    pub kind: String,
    pub value: String,
    pub bound_count: i64,
    pub limit: i32,
    pub default_limit: i32,
    pub is_override: bool,
}

fn normalize_admin_contact(kind: &str, value: &str) -> AppResult<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(AppError::BadRequest("联系方式不能为空".to_string()));
    }
    if kind == "email" && !crate::auth::contact::is_real_email(&value) {
        return Err(AppError::BadRequest(
            "占位邮箱不能设置绑定上限".to_string(),
        ));
    }
    Ok(value)
}

async fn load_contact_bind(
    state: &Arc<AppState>,
    kind: &str,
    value: &str,
) -> AppResult<ContactBindResponse> {
    let kind = crate::auth::contact::parse_contact_kind(kind)?;
    let value = normalize_admin_contact(kind, value)?;
    let settings = crate::api::settings::load_all_settings(state).await?;
    let default_limit = crate::auth::contact::normalize_limit(if kind == "email" {
        settings.registration.max_accounts_per_email
    } else {
        settings.registration.max_accounts_per_mobile
    });
    let occ = if kind == "email" {
        crate::auth::contact::email_occupancy(state, &value, None, default_limit).await?
    } else {
        crate::auth::contact::mobile_occupancy(state, &value, None, default_limit).await?
    };
    let is_override = crate::auth::contact::fetch_override_limit(state, kind, &value)
        .await?
        .is_some();
    Ok(ContactBindResponse {
        kind: kind.to_string(),
        value,
        bound_count: occ.bound_count,
        limit: occ.limit,
        default_limit,
        is_override,
    })
}

pub async fn get_contact_bind(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<ContactBindQuery>,
) -> AppResult<Json<ContactBindResponse>> {
    Ok(Json(load_contact_bind(&state, &query.kind, &query.value).await?))
}

pub async fn put_contact_bind(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
    Json(request): Json<PutContactBindRequest>,
) -> AppResult<Json<ContactBindResponse>> {
    crate::admin_permission::require_edit(&ctx, crate::admin_permission::users_write_perm("user"))?;
    let kind = crate::auth::contact::parse_contact_kind(&request.kind)?;
    let value = normalize_admin_contact(kind, &request.value)?;
    let snapshot = load_contact_bind(&state, kind, &value).await?;
    if i64::from(request.max_accounts) < snapshot.bound_count {
        return Err(AppError::BadRequest(format!(
            "该联系方式已绑定 {} 个账号，上限不能低于当前绑定数",
            snapshot.bound_count
        )));
    }
    crate::auth::contact::upsert_override_limit(&state, kind, &value, request.max_accounts).await?;
    Ok(Json(load_contact_bind(&state, kind, &value).await?))
}

pub async fn delete_contact_bind(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(ctx): axum::extract::Extension<crate::admin_permission::AdminContext>,
    axum::extract::Query(query): axum::extract::Query<ContactBindQuery>,
) -> AppResult<Json<ContactBindResponse>> {
    crate::admin_permission::require_edit(&ctx, crate::admin_permission::users_write_perm("user"))?;
    let kind = crate::auth::contact::parse_contact_kind(&query.kind)?;
    let value = normalize_admin_contact(kind, &query.value)?;
    crate::auth::contact::delete_override_limit(&state, kind, &value).await?;
    Ok(Json(load_contact_bind(&state, kind, &value).await?))
}

#[cfg(test)]
mod tests {
    use super::{collect_kyc_list_statuses, commission_ledger_label};

    #[test]
    fn commission_ledger_label_splits_adjust_and_sources() {
        assert_eq!(
            commission_ledger_label("adjustclaw:9", -5.0).0,
            "adjust"
        );
        assert_eq!(commission_ledger_label("log:3", 1.2).0, "consumption");
        assert_eq!(commission_ledger_label("recharge:4", 2.0).0, "recharge");
        assert_eq!(commission_ledger_label("ark:8", 1.0).0, "video");
        assert_eq!(commission_ledger_label("arkrefund:8", -1.0).0, "refund");
    }

    #[test]
    fn collect_kyc_list_statuses_keeps_pending_review() {
        let map = collect_kyc_list_statuses([
            ("u1".into(), "personal".into(), "pending".into()),
            ("u1".into(), "enterprise".into(), "approved".into()),
            ("u2".into(), "personal".into(), "none".into()),
            ("u3".into(), "other".into(), "pending".into()),
            ("u4".into(), "personal".into(), "rejected".into()),
        ]);
        assert_eq!(
            map.get("u1"),
            Some(&(Some("pending".into()), Some("approved".into())))
        );
        assert!(!map.contains_key("u2"));
        assert!(!map.contains_key("u3"));
        assert_eq!(map.get("u4"), Some(&(Some("rejected".into()), None)));
    }
}
