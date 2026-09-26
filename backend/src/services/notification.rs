/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 用户通知订阅：低余额邮件/短信提醒
//! 尊重 users.notification_preferences 与站点 notification_settings

use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppResult;
use crate::services::email::EmailService;
use crate::services::sms::SmsService;
use crate::AppState;

/// 并发领取锁时长（秒）；进程崩溃后超时可重试
const CLAIM_TTL_SECS: i64 = 90;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserNotificationPrefs {
    #[serde(default = "default_true")]
    web_notification: bool,
    #[serde(default)]
    email_notification: bool,
    #[serde(default)]
    push_notification: bool,
    #[serde(default)]
    sms_notification: bool,
    #[serde(default = "default_threshold")]
    low_balance_threshold: f64,
    /// 勿扰：开启后屏蔽全部通道
    #[serde(default)]
    do_not_disturb: bool,
    /// 兼容旧字段 mute_preference: "none" | "all"
    #[serde(default)]
    mute_preference: Option<String>,
    /// 本轮是否已完成全部所需通道（兼容旧数据；新逻辑由分通道标记驱动）
    #[serde(default)]
    low_balance_alert_active: bool,
    /// 本轮邮件是否已成功发送
    #[serde(default)]
    low_balance_email_notified: bool,
    /// 本轮短信是否已成功发送
    #[serde(default)]
    low_balance_sms_notified: bool,
    /// 并发领取截止时间（unix 秒）；> now 表示其他任务持有中
    #[serde(default)]
    low_balance_claim_until: i64,
}

fn default_true() -> bool {
    true
}
fn default_threshold() -> f64 {
    100.0
}

/// 用户端不可覆盖的内部状态字段
const INTERNAL_PREF_KEYS: &[&str] = &[
    "low_balance_alert_active",
    "low_balance_email_notified",
    "low_balance_sms_notified",
    "low_balance_claim_until",
];

impl Default for UserNotificationPrefs {
    fn default() -> Self {
        Self {
            web_notification: true,
            email_notification: false,
            push_notification: false,
            sms_notification: false,
            low_balance_threshold: 100.0,
            do_not_disturb: false,
            mute_preference: None,
            low_balance_alert_active: false,
            low_balance_email_notified: false,
            low_balance_sms_notified: false,
            low_balance_claim_until: 0,
        }
    }
}

impl UserNotificationPrefs {
    fn from_json(raw: Option<&str>) -> Self {
        let mut prefs = raw
            .and_then(|s| serde_json::from_str::<UserNotificationPrefs>(s).ok())
            .unwrap_or_default();
        if !prefs.do_not_disturb {
            if let Some(ref m) = prefs.mute_preference {
                if m == "all" {
                    prefs.do_not_disturb = true;
                }
            }
        }
        prefs
    }

    /// 旧数据仅有 alert_active、无分通道标记：整轮已提醒过（不推断各通道，以免日后新开通道被误跳过）
    fn legacy_cycle_locked(&self) -> bool {
        self.low_balance_alert_active
            && !self.low_balance_email_notified
            && !self.low_balance_sms_notified
    }

    fn clear_cycle_flags(&mut self) {
        self.low_balance_alert_active = false;
        self.low_balance_email_notified = false;
        self.low_balance_sms_notified = false;
        self.low_balance_claim_until = 0;
    }

    fn cycle_complete(&self, want_email: bool, want_sms: bool) -> bool {
        (!want_email || self.low_balance_email_notified)
            && (!want_sms || self.low_balance_sms_notified)
            && (want_email || want_sms)
    }

    fn sync_alert_active(&mut self, want_email: bool, want_sms: bool) {
        self.low_balance_alert_active = self.cycle_complete(want_email, want_sms);
    }

    fn has_cycle_flags(&self) -> bool {
        self.low_balance_alert_active
            || self.low_balance_email_notified
            || self.low_balance_sms_notified
            || self.low_balance_claim_until != 0
    }
}

/// 异步触发低余额检查（不阻塞计费/调账路径）
pub fn spawn_low_balance_check(state: Arc<AppState>, user_id: impl Into<String>) {
    let uid = user_id.into();
    tokio::spawn(async move {
        if let Err(e) = check_and_notify_low_balance_inner(&state, &uid).await {
            tracing::warn!("[LowBalanceNotify] user={} err={}", uid, e);
        }
    });
}

async fn check_and_notify_low_balance_inner(state: &Arc<AppState>, user_id: &str) -> AppResult<()> {
    let row: Option<(f64, f64, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT balance, gift_balance, email, mobile, notification_preferences FROM users WHERE id = ?",
        ),
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let Some((balance, gift_balance, email, mobile, prefs_raw)) = row else {
        return Ok(());
    };

    let settings = crate::api::settings::load_all_settings(state).await?;
    let site_notif = &settings.notification;

    let mut prefs = UserNotificationPrefs::from_json(prefs_raw.as_deref());
    // 用户未自定义阈值时，用站点默认
    if prefs_raw.is_none() {
        prefs.low_balance_threshold = site_notif.low_balance_threshold;
    }

    let total = balance + gift_balance;
    let threshold = if prefs.low_balance_threshold > 0.0 {
        prefs.low_balance_threshold
    } else {
        site_notif.low_balance_threshold
    };

    // 余额回升：无论站点通知开关是否打开，都清本轮标记（避免关站期间回升后重开仍被锁死）
    if total >= threshold {
        if prefs.has_cycle_flags() {
            prefs.clear_cycle_flags();
            prefs.mute_preference = None;
            let _ = save_prefs_cas(state, user_id, prefs_raw.as_deref(), &prefs).await?;
        }
        return Ok(());
    }

    if !site_notif.site_notification_enabled {
        return Ok(());
    }

    // 管理端关闭勿扰能力时，忽略用户勿扰偏好
    if prefs.do_not_disturb && site_notif.do_not_disturb_enabled {
        return Ok(());
    }

    let want_email = site_notif.email_balance_notification && prefs.email_notification;
    let want_sms = site_notif.sms_balance_notification && prefs.sms_notification;

    if !want_email && !want_sms {
        return Ok(());
    }

    // 旧整轮锁 或 所需通道均已成功
    if prefs.legacy_cycle_locked() || prefs.cycle_complete(want_email, want_sms) {
        return Ok(());
    }

    let now = Utc::now().timestamp();
    if prefs.low_balance_claim_until > now {
        return Ok(());
    }

    let need_email = want_email && !prefs.low_balance_email_notified;
    let need_sms = want_sms && !prefs.low_balance_sms_notified;

    // CAS 领取，防止并发计费重复发送
    prefs.low_balance_claim_until = now + CLAIM_TTL_SECS;
    prefs.mute_preference = None;
    if !save_prefs_cas(state, user_id, prefs_raw.as_deref(), &prefs).await? {
        return Ok(());
    }

    let mut email_ok = prefs.low_balance_email_notified;
    let mut sms_ok = prefs.low_balance_sms_notified;

    if need_email {
        let balance_str = crate::money::format_money(total);
        let threshold_str = crate::money::format_money(threshold);
        if let Some(ref to) = email {
            if !to.is_empty() && !to.ends_with("@tokensbyte.local") {
                match EmailService::new(&settings.smtp) {
                    Ok(svc) => {
                        let subject_tpl = if site_notif.low_balance_email_subject.trim().is_empty()
                        {
                            crate::models::default_low_balance_email_subject()
                        } else {
                            site_notif.low_balance_email_subject.clone()
                        };
                        let html_tpl = if site_notif.low_balance_email_html.trim().is_empty() {
                            crate::models::default_low_balance_email_html()
                        } else {
                            site_notif.low_balance_email_html.clone()
                        };
                        match svc
                            .send_low_balance_alert(
                                to,
                                &balance_str,
                                &threshold_str,
                                &subject_tpl,
                                &html_tpl,
                            )
                            .await
                        {
                            Ok(()) => email_ok = true,
                            Err(e) => tracing::warn!(
                                "[LowBalanceNotify] email failed user={}: {}",
                                user_id,
                                e
                            ),
                        }
                    }
                    Err(e) => {
                        tracing::warn!("[LowBalanceNotify] smtp init failed: {}", e);
                    }
                }
            }
        }
    }

    if need_sms {
        if let Some(ref phone) = mobile {
            if !phone.is_empty() {
                match settings.sms.as_ref() {
                    Some(sms_settings) if sms_settings.balance_template_configured() => {
                        let svc = SmsService::new(sms_settings);
                        match svc
                            .send_balance_alert(phone, sms_settings.balance_template_id_effective())
                            .await
                        {
                            Ok(_) => sms_ok = true,
                            Err(e) => {
                                tracing::warn!(
                                    "[LowBalanceNotify] sms failed user={}: {}",
                                    user_id,
                                    e
                                );
                            }
                        }
                    }
                    Some(_) | None => {
                        tracing::warn!(
                            "[LowBalanceNotify] sms skipped user={}: balance_template_id not configured while sms_balance_notification is on",
                            user_id
                        );
                    }
                }
            }
        }
    }

    // 持锁方写回：重读后只合并周期标记，避免覆盖用户并发修改的订阅开关
    persist_cycle_state(state, user_id, email_ok, sms_ok, want_email, want_sms).await?;

    Ok(())
}

async fn persist_cycle_state(
    state: &Arc<AppState>,
    user_id: &str,
    email_notified: bool,
    sms_notified: bool,
    want_email: bool,
    want_sms: bool,
) -> AppResult<()> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT notification_preferences FROM users WHERE id = ?"),
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;
    let raw = row.and_then(|r| r.0);

    let mut prefs = UserNotificationPrefs::from_json(raw.as_deref());
    // 成功标记只升不降，防止并发写回把已成功通道打回未发送
    prefs.low_balance_email_notified = prefs.low_balance_email_notified || email_notified;
    prefs.low_balance_sms_notified = prefs.low_balance_sms_notified || sms_notified;
    prefs.low_balance_claim_until = 0;
    prefs.sync_alert_active(want_email, want_sms);
    prefs.mute_preference = None;
    save_prefs(state, user_id, &prefs).await
}

async fn save_prefs(
    state: &Arc<AppState>,
    user_id: &str,
    prefs: &UserNotificationPrefs,
) -> AppResult<()> {
    let json = serde_json::to_string(prefs).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(&state.db.format_query(
        "UPDATE users SET notification_preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(json)
    .bind(user_id)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

/// 仅当库中 prefs 仍等于 expected_raw 时写入，返回是否抢占成功
async fn save_prefs_cas(
    state: &Arc<AppState>,
    user_id: &str,
    expected_raw: Option<&str>,
    prefs: &UserNotificationPrefs,
) -> AppResult<bool> {
    let json = serde_json::to_string(prefs).unwrap_or_else(|_| "{}".to_string());
    let result = if let Some(old) = expected_raw {
        sqlx::query(&state.db.format_query(
            "UPDATE users SET notification_preferences = ?, updated_at = CURRENT_TIMESTAMP \
             WHERE id = ? AND notification_preferences = ?",
        ))
        .bind(&json)
        .bind(user_id)
        .bind(old)
        .execute(&state.db.pool)
        .await?
    } else {
        sqlx::query(&state.db.format_query(
            "UPDATE users SET notification_preferences = ?, updated_at = CURRENT_TIMESTAMP \
             WHERE id = ? AND notification_preferences IS NULL",
        ))
        .bind(&json)
        .bind(user_id)
        .execute(&state.db.pool)
        .await?
    };
    Ok(result.rows_affected() > 0)
}

/// 合并用户提交的偏好 JSON，保留服务端内部字段
pub fn merge_user_prefs_json(existing: Option<&str>, incoming: &str) -> String {
    let mut base: Value = existing
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| Value::Object(Default::default()));
    let Ok(new_val) = serde_json::from_str::<Value>(incoming) else {
        return incoming.to_string();
    };
    if let (Some(base_obj), Some(new_obj)) = (base.as_object_mut(), new_val.as_object()) {
        for (k, v) in new_obj {
            if INTERNAL_PREF_KEYS.contains(&k.as_str()) {
                continue;
            }
            base_obj.insert(k.clone(), v.clone());
        }
        // 新开关 do_not_disturb 优先；若只传了 mute_preference 也归一化
        if let Some(dnd) = base_obj.get("do_not_disturb").and_then(|v| v.as_bool()) {
            if dnd {
                base_obj.insert("mute_preference".into(), Value::String("all".into()));
            } else {
                base_obj.insert("mute_preference".into(), Value::String("none".into()));
            }
        } else if let Some(m) = base_obj.get("mute_preference").and_then(|v| v.as_str()) {
            base_obj.insert("do_not_disturb".into(), Value::Bool(m == "all"));
        }
    } else {
        base = new_val;
    }
    serde_json::to_string(&base).unwrap_or_else(|_| incoming.to_string())
}
