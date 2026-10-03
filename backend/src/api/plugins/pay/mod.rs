/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use crate::error::{AppError, AppResult};
use crate::models::order::Order;
use crate::time_system::DbTs;
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

mod payment;

use payment::alipay::AlipayClient;
use payment::allinpay::AllinpayClient;
use payment::hyperbc::HyperbcClient;
use payment::stripe::StripeClient;
use payment::wechat::WechatClient;

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateOrderReq {
    pub amount: f64,
    pub payment_method: String,
    /// 是否为移动端支付请求 (用于部分聚合支付通道多端跳转或扫码的自适应)
    #[serde(default)]
    pub is_mobile: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CreateOrderResp {
    pub out_trade_no: String,
    pub payment_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hyperbc_data: Option<serde_json::Value>,
}

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<CreateOrderReq>,
) -> AppResult<Json<CreateOrderResp>> {
    let s = crate::api::settings::get_currency_settings(&state).await;
    if s.min_recharge_amount > 0.0 && payload.amount < s.min_recharge_amount {
        return Err(AppError::BadRequest(format!("充值金额不能小于 {}", s.min_recharge_amount)));
    }
    if s.max_recharge_amount > 0.0 && payload.amount > s.max_recharge_amount {
        return Err(AppError::BadRequest(format!("充值金额不能大于 {}", s.max_recharge_amount)));
    }
    if payload.amount < 0.01 {
        return Err(AppError::BadRequest("金额必须大于或等于 0.01".to_string()));
    }

    // 检查用户是否被禁止在线支付（pay_enabled 为 0 表示禁止支付，1 表示允许支付）
    let pay_enabled: Option<i32> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT pay_enabled FROM users WHERE id = ?"),
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;
    if pay_enabled.unwrap_or(1) == 0 {
        return Err(AppError::Forbidden(
            "您的在线支付功能已被管理员关闭".to_string(),
        ));
    }

    let out_trade_no = format!(
        "T{}R{}",
        Local::now().format("%Y%m%d%H%M%S"),
        &Uuid::new_v4().simple().to_string()[..8]
    );

    // 回调基地址推断：优先级 PUBLIC_API_URL env > Origin header > Host header
    let base_notify_url = crate::relay::vendor_callback::infer_base_url(&headers);

    // 前端跳转基地址：优先 PUBLIC_FRONTEND_URL env，自动感知 Origin 头，兜底使用 base_notify_url
    let frontend_base_url = std::env::var("PUBLIC_FRONTEND_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            headers
                .get("origin")
                .and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty() && *s != "null")
                .map(|s| s.trim_end_matches('/').to_string())
        })
        .unwrap_or_else(|| base_notify_url.clone());

    tracing::info!(
        "[支付] 用户 {} 发起充值 {:.2} 元, 方式: {}, 订单号: {}, 回调基地址: {}, 前端基地址: {}",
        claims.sub,
        payload.amount,
        payload.payment_method,
        out_trade_no,
        base_notify_url,
        frontend_base_url
    );

    let payment_url: String;
    let mut trade_no: Option<String> = None;
    let mut hyperbc_data: Option<serde_json::Value> = None;

    if payload.payment_method == "wechat" {
        let wechat_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_wechat'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let wechat_config: crate::models::PaymentWechatSettings =
            serde_json::from_str(&wechat_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("微信支付未配置".to_string()))?;

        if !wechat_config.enabled {
            return Err(AppError::BadRequest("微信支付暂未开启".to_string()));
        }

        let wechat_client = WechatClient::new(wechat_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/wechat", base_notify_url);
        tracing::info!("[支付] 微信回调地址: {}", notify_url);
        payment_url = wechat_client
            .create_native_order(&out_trade_no, payload.amount, "钱包充值", &notify_url)
            .await?;
    } else if payload.payment_method == "alipay" {
        let alipay_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_alipay'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let alipay_config: crate::models::PaymentAlipaySettings =
            serde_json::from_str(&alipay_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("支付宝未配置".to_string()))?;

        if !alipay_config.enabled {
            return Err(AppError::BadRequest("支付宝暂未开启".to_string()));
        }

        let alipay_client = AlipayClient::new(alipay_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/alipay", base_notify_url);
        let return_url = format!("{}/wallet", frontend_base_url);
        tracing::info!("[支付] 支付宝回调地址: {}", notify_url);
        payment_url = alipay_client.generate_page_pay_url(
            &out_trade_no,
            payload.amount,
            "钱包充值",
            &notify_url,
            &return_url,
        )?;
    } else if payload.payment_method == "stripe" {
        let stripe_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_stripe'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let stripe_config: crate::models::PaymentStripeSettings =
            serde_json::from_str(&stripe_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("Stripe 未配置".to_string()))?;

        if !stripe_config.enabled {
            return Err(AppError::BadRequest("Stripe 支付暂未开启".to_string()));
        }

        let success_url = format!("{}/wallet?payment=success", frontend_base_url);
        let cancel_url = format!("{}/wallet?payment=cancelled", frontend_base_url);

        // 从全局货币设置读取货币代码
        let currency = crate::api::settings::get_currency_settings(&state)
            .await
            .default_currency
            .to_lowercase();

        let stripe_client = StripeClient::new(stripe_config);
        tracing::info!("[支付] Stripe Checkout Session 创建中, 货币: {}", currency);
        let (session_url, session_id) = stripe_client
            .create_checkout_session(
                &out_trade_no,
                payload.amount,
                &currency,
                "钱包充值",
                &success_url,
                &cancel_url,
            )
            .await
            .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        tracing::info!("[支付] Stripe session_id: {}", session_id);
        payment_url = session_url;
        trade_no = Some(session_id);
    } else if payload.payment_method == "hyperbc" {
        let hyperbc_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_hyperbc'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let hyperbc_config: crate::models::PaymentHyperbcSettings =
            serde_json::from_str(&hyperbc_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("HyperBC 支付未配置".to_string()))?;

        if !hyperbc_config.enabled {
            return Err(AppError::BadRequest("HyperBC 支付暂未开启".to_string()));
        }

        let hyperbc_client = HyperbcClient::new(hyperbc_config);
        let return_url = format!("{}/wallet", frontend_base_url);

        let lang = headers
            .get("accept-language")
            .and_then(|v| v.to_str().ok())
            .map(|s| if s.starts_with("en") { "en" } else { "zh" })
            .unwrap_or("zh");

        // 读取系统货币设置作为 CipherBC H5 订单的法币币种
        let currency = crate::api::settings::get_currency_settings(&state)
            .await
            .default_currency
            .to_lowercase();

        tracing::info!(
            "[支付] HyperBC H5 Hosted Cashier 创建中: return_url={}, currency={}, lang={}",
            return_url,
            currency,
            lang
        );

        let h5_order = hyperbc_client
            .create_h5_order(&out_trade_no, payload.amount, &currency, &return_url, lang)
            .await
            .map_err(|e| AppError::UpstreamError(e.to_string()))?;

        payment_url = h5_order.checkout_url.clone();
        trade_no = Some(h5_order.order_no.clone());
        hyperbc_data = Some(serde_json::to_value(&h5_order).unwrap_or_default());
    } else if payload.payment_method == "allinpay_wechat"
        || payload.payment_method == "allinpay_alipay"
    {
        let allinpay_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_allinpay'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let allinpay_config: crate::models::PaymentAllinpaySettings =
            serde_json::from_str(&allinpay_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("通联支付未配置".to_string()))?;

        if !allinpay_config.enabled {
            return Err(AppError::BadRequest("通联支付暂未开启".to_string()));
        }

        // 通联子渠道可单独关闭；先 merge 以兼容旧版拆分配置
        let raw_channels_ui: Option<crate::models::PaymentChannelsUiSettings> =
            sqlx::query_scalar::<_, String>(
                &state
                    .db
                    .format_query("SELECT value FROM settings WHERE key = 'payment_channels_ui'"),
            )
            .fetch_optional(&state.db.pool)
            .await?
            .and_then(|v| serde_json::from_str(&v).ok());
        let channels_ui = crate::models::merge_payment_channels_ui(
            raw_channels_ui,
            &crate::models::PaymentGatewayEnableFlags {
                allinpay: true,
                ..Default::default()
            },
        );
        if !crate::models::is_payment_channel_ui_enabled(&channels_ui, &payload.payment_method) {
            return Err(AppError::BadRequest("该通联支付渠道暂未开启".to_string()));
        }

        let allinpay_client = AllinpayClient::new(allinpay_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/allinpay", base_notify_url);

        let client_is_mobile = payload.is_mobile.unwrap_or_else(|| {
            if let Some(ua) = headers.get("user-agent").and_then(|v| v.to_str().ok()) {
                let ua_lower = ua.to_lowercase();
                ua_lower.contains("mobile")
                    || ua_lower.contains("android")
                    || ua_lower.contains("iphone")
                    || ua_lower.contains("ipad")
            } else {
                false
            }
        });

        if client_is_mobile {
            // 手机H5收银台模式
            let return_url = format!("{}/wallet", frontend_base_url);
            tracing::info!("[支付] 通联 H5 收银台支付创建中, return_url={}", return_url);
            payment_url = allinpay_client
                .generate_h5_pay_url(&out_trade_no, payload.amount, &notify_url, &return_url)
                .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        } else {
            // PC端扫码支付模式 (微信/支付宝二维码)
            let paytype = if payload.payment_method == "allinpay_wechat" {
                "W01"
            } else {
                "A01"
            };
            tracing::info!(
                "[支付] 通联 PC 扫码支付创建中, 方式: {}, paytype: {}",
                payload.payment_method,
                paytype
            );
            payment_url = allinpay_client
                .create_scan_pay(
                    &out_trade_no,
                    payload.amount,
                    "钱包充值",
                    &notify_url,
                    paytype,
                )
                .await
                .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        }
    } else {
        return Err(AppError::BadRequest("不支持的支付方式".to_string()));
    }

    // 保存待支付订单记录 (仅用于微信/支付宝/Stripe/HyperBC 等传统支付方式)
    // 数据库写入操作字段说明：
    // - out_trade_no: 系统内唯一交易流水号，格式 T年月日时分秒R随机字符串
    // - user_id: 关联充值发起者的用户主键ID
    // - payment_method: 支付通道类型 (可选值: wechat, alipay, stripe, hyperbc, allinpay_wechat, allinpay_alipay)
    // - amount: 充值金额，对应本系统的法币余额数量
    // - status: 订单处理进度状态，初始化设定为 'pending'
    // - created_at: 订单的创建时间（TIMESTAMPTZ，由数据库 CURRENT_TIMESTAMP 写入）
    sqlx::query(&state.db.format_query("INSERT INTO orders (out_trade_no, user_id, payment_method, amount, status, created_at, trade_no) VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?)"))
        .bind(&out_trade_no)
        .bind(&claims.sub)
        .bind(&payload.payment_method)
        .bind(payload.amount)
        .bind(trade_no)
        .execute(&state.db.pool)
        .await?;

    tracing::info!("[支付] 订单创建成功: {}, payment_url 已生成", out_trade_no);

    Ok(Json(CreateOrderResp {
        out_trade_no,
        payment_url,
        hyperbc_data,
    }))
}

/// 在线支付入账流水，并在邀请人等级为「按充值发放」时记佣。与订单 pending→paid 同事务。
async fn insert_paid_recharge_record(
    db: &crate::db::Database,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
    amount: f64,
    recharge_type: &str,
    order_no: &str,
) -> Result<(), sqlx::Error> {
    let recharge_id: i64 = sqlx::query_scalar(&db.format_query(
        "INSERT INTO recharge_records (user_id, amount, recharge_type, remark, order_no) VALUES (?, ?, ?, '', ?) RETURNING id",
    ))
    .bind(user_id)
    .bind(amount)
    .bind(recharge_type)
    .bind(order_no)
    .fetch_one(&mut **tx)
    .await?;
    crate::services::affiliate::award_recharge_commission(db, tx, user_id, recharge_id, amount)
        .await
        .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    Ok(())
}

/// 通用的充值入账核心逻辑，集成更新订单状态、加用户余额、记录明细三合一事务。
/// 利用数据库行锁与 `status = 'pending'` 限制条件提供强幂等防护，杜绝高并发重复充值。
async fn complete_recharge_payment_common(
    state: &Arc<AppState>,
    out_trade_no: &str,
    amount: f64,
    user_id: &str,
    payment_method: &str,
    channel_name_zh: &str,
) -> AppResult<bool> {
    // 开启数据库事务进行余额入账与记录插入
    let mut tx = state
        .db
        .pool
        .begin()
        .await
        .map_err(|e| AppError::Internal(format!("启动事务失败: {:?}", e)))?;
    let now = DbTs::now();

    // 1. 更新订单表 orders，状态由 pending 变更为 paid
    // 限制条件：仅在原状态为 'pending' 时才能成功更新，防止并发或重复充值
    let result = sqlx::query(&state.db.format_query(
        "UPDATE orders SET status = 'paid', paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"
    ))
    .bind(&now)
    .bind(out_trade_no)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("更新订单状态失败: {:?}", e)))?;

    if result.rows_affected() == 0 {
        tracing::info!(
            "[{}] 订单已是支付状态或已被并发处理，跳过: {}",
            channel_name_zh,
            out_trade_no
        );
        let _ = tx.rollback().await;
        return Ok(false); // 已处理，返回 false
    }

    // 2. 增加用户账户余额 users
    sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&now)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("更新用户余额失败: {:?}", e)))?;

    // 3. 写入充值流水明细表 recharge_records，单号独立存入 order_no 方便统计与追溯
    insert_paid_recharge_record(
        &state.db,
        &mut tx,
        user_id,
        amount,
        payment_method,
        out_trade_no,
    )
    .await
    .map_err(|e| AppError::Internal(format!("插入充值记录失败: {:?}", e)))?;

    tx.commit()
        .await
        .map_err(|e| AppError::Internal(format!("提交事务失败: {:?}", e)))?;

    tracing::info!(
        "[{}] ✅ 订单 {} 充值成功，入账 {:.2} 元",
        channel_name_zh,
        out_trade_no,
        amount
    );
    // 余额回升时清除低余额提醒周期标记
    crate::services::notification::spawn_low_balance_check(Arc::clone(state), user_id.to_string());
    Ok(true) // 处理成功，返回 true
}

async fn complete_hyperbc_payment(
    state: &Arc<AppState>,
    out_trade_no: &str,
    amount: f64,
    user_id: &str,
) -> AppResult<bool> {
    complete_recharge_payment_common(state, out_trade_no, amount, user_id, "hyperbc", "HyperBC")
        .await
}

/// 封装通联支付成功逻辑：更新订单、加用户余额并记录明细（利用数据库行锁与 status='pending' 确保严格的全局幂等性）
async fn complete_allinpay_payment(
    state: &Arc<AppState>,
    out_trade_no: &str,
    amount: f64,
    user_id: &str,
    payment_method: &str,
) -> AppResult<bool> {
    let channel_name = if payment_method == "allinpay_wechat" {
        "通联微信"
    } else {
        "通联支付宝"
    };
    complete_recharge_payment_common(
        state,
        out_trade_no,
        amount,
        user_id,
        payment_method,
        channel_name,
    )
    .await
}

#[derive(Debug, Serialize)]
pub struct OrderStatusResp {
    pub status: String,
}

pub async fn check_status(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Path(out_trade_no): Path<String>,
) -> AppResult<Json<OrderStatusResp>> {
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ? AND user_id = ?"),
    )
    .bind(&out_trade_no)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    if let Some(mut order) = order {
        // 如果订单是待支付，且支付方式是 HyperBC，我们尝试主动查询最新的支付状态以防回调延迟或在本地开发环境中丢失
        if order.status == "pending" && order.payment_method == "hyperbc" {
            if let Some(ref hyperbc_order_no) = order.trade_no {
                // 读取 HyperBC 配置
                let hyperbc_setting: Option<String> = sqlx::query_scalar(
                    &state
                        .db
                        .format_query("SELECT value FROM settings WHERE key = 'payment_hyperbc'"),
                )
                .fetch_optional(&state.db.pool)
                .await?;
                if let Some(setting_str) = hyperbc_setting {
                    if let Ok(config) =
                        serde_json::from_str::<crate::models::PaymentHyperbcSettings>(&setting_str)
                    {
                        if config.enabled {
                            let hyperbc_client = HyperbcClient::new(config.clone());
                            // 事务外调用第三方 API，确保不长期锁定数据库连接与行锁
                            match hyperbc_client.query_order(hyperbc_order_no).await {
                                Ok(query_data) => {
                                    let check_code = query_data.get_check_code();
                                    let actual_crypto = query_data.get_actual_crypto_amount();
                                    tracing::info!(
                                        "[支付状态查询] HyperBC 订单 {} 查询状态为: status={}, check_code={}, 实际到账代币={}",
                                        out_trade_no,
                                        query_data.status,
                                        check_code,
                                        actual_crypto
                                    );

                                    // 入账条件：
                                    // 1. 标准正常支付 (status=1 且无风控异常 check_code=0)
                                    // 2. 实报实销差额支付 (status=2 且 check_code=1001 且链上实际收到代币 actual_crypto > 0.0)
                                    let should_settle = (query_data.status == 1 && check_code == 0)
                                        || (query_data.status == 2 && check_code == 1001 && actual_crypto > 0.0);

                                    if should_settle {
                                        // 结算金额严格按照实收代币与汇率折算，且不得超出预设金额（平台零亏损红线）
                                        let exchange_rate = if config.crypto_exchange_rate > 0.0 { config.crypto_exchange_rate } else { 1.0 };
                                        let settle_amount = if actual_crypto > 0.0 {
                                            let converted = actual_crypto * exchange_rate;
                                            converted.min(order.amount)
                                        } else {
                                            order.amount
                                        };

                                        match complete_hyperbc_payment(
                                            &state,
                                            &out_trade_no,
                                            settle_amount,
                                            &order.user_id,
                                        )
                                        .await
                                        {
                                            Ok(_) => {
                                                order.status = "paid".to_string();
                                            }
                                            Err(e) => {
                                                tracing::warn!(
                                                    "[支付状态查询] 自动入账失败: {:?}",
                                                    e
                                                );
                                            }
                                        }
                                    } else if query_data.status == 10 {
                                        // 订单已取消
                                        let _ = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'cancelled' WHERE out_trade_no = ? AND status = 'pending'"))
                                            .bind(&out_trade_no)
                                            .execute(&state.db.pool)
                                            .await;
                                        order.status = "cancelled".to_string();
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        "[支付状态查询] 主动查询 HyperBC 订单 {} 失败: {:?}",
                                        out_trade_no,
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }
        } else if order.status == "pending"
            && (order.payment_method == "allinpay_wechat"
                || order.payment_method == "allinpay_alipay")
        {
            // 读取通联配置并进行主动查询，防止前台关闭或回调延迟导致状态不同步
            let allinpay_setting: Option<String> = sqlx::query_scalar(
                &state
                    .db
                    .format_query("SELECT value FROM settings WHERE key = 'payment_allinpay'"),
            )
            .fetch_optional(&state.db.pool)
            .await?;
            if let Some(setting_str) = allinpay_setting {
                if let Ok(config) =
                    serde_json::from_str::<crate::models::PaymentAllinpaySettings>(&setting_str)
                {
                    if config.enabled {
                        let allinpay_client = AllinpayClient::new(config);
                        match allinpay_client.query_order(&order.out_trade_no).await {
                            Ok(query_data) => {
                                tracing::info!("[支付状态查询] 通联订单 {} 查询状态为: retcode={}, trxstatus={:?}", out_trade_no, query_data.retcode, query_data.trxstatus);
                                // trxstatus 0000 交易成功，此时利用 complete_allinpay_payment 悲观锁事务安全入账
                                if query_data.retcode == "SUCCESS"
                                    && query_data.trxstatus.as_deref() == Some("0000")
                                {
                                    match complete_allinpay_payment(
                                        &state,
                                        &out_trade_no,
                                        order.amount,
                                        &order.user_id,
                                        &order.payment_method,
                                    )
                                    .await
                                    {
                                        Ok(_) => {
                                            order.status = "paid".to_string();
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                "[支付状态查询] 通联自动入账失败: {:?}",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "[支付状态查询] 主动查询通联订单 {} 失败: {:?}",
                                    out_trade_no,
                                    e
                                );
                            }
                        }
                    }
                }
            }
        }
        Ok(Json(OrderStatusResp {
            status: order.status,
        }))
    } else {
        Err(AppError::NotFound("订单不存在或无权访问".into()))
    }
}

// ================= Notifications =================

pub async fn wechat_notify(State(state): State<Arc<AppState>>, body: String) -> impl IntoResponse {
    use crate::models::PaymentWechatSettings;
    use axum::http::StatusCode;

    tracing::info!("[微信回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[微信回调] 原始数据: {}", body);

    let resp_success = serde_json::json!({ "code": "SUCCESS", "message": "成功" });
    let resp_fail = serde_json::json!({ "code": "FAIL", "message": "失败" });

    // 1. 读取配置
    let wechat_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_wechat'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[微信回调] 读取配置失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let config =
        match serde_json::from_str::<PaymentWechatSettings>(&wechat_setting.unwrap_or_default()) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("[微信回调] 解析配置失败: {:?}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
            }
        };

    let client = WechatClient::new(config);

    // 2. 解析回调报文
    let payload: serde_json::Value = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("[微信回调] JSON解析失败: {:?}", e);
            return (StatusCode::BAD_REQUEST, Json(resp_fail));
        }
    };

    let event_type = payload["event_type"].as_str().unwrap_or("");
    tracing::info!("[微信回调] event_type: {}", event_type);

    if event_type != "TRANSACTION.SUCCESS" {
        tracing::info!("[微信回调] 非支付成功事件，忽略: {}", event_type);
        return (StatusCode::OK, Json(resp_success));
    }

    // 3. 解密资源
    let resource = &payload["resource"];
    let nonce = resource["nonce"].as_str().unwrap_or("");
    let associated_data = resource["associated_data"].as_str().unwrap_or("");
    let ciphertext = resource["ciphertext"].as_str().unwrap_or("");

    let decrypted = match client.decrypt_callback_resource(nonce, associated_data, ciphertext) {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("[微信回调] AES解密失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    tracing::info!("[微信回调] 解密成功: {}", decrypted);

    let data: serde_json::Value = match serde_json::from_str(&decrypted) {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("[微信回调] 解密数据JSON解析失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let trade_state = data["trade_state"].as_str().unwrap_or("");
    let out_trade_no = data["out_trade_no"].as_str().unwrap_or("");
    let trade_no = data["transaction_id"].as_str().unwrap_or("");

    tracing::info!(
        "[微信回调] trade_state: {}, out_trade_no: {}, transaction_id: {}",
        trade_state,
        out_trade_no,
        trade_no
    );

    if trade_state != "SUCCESS" {
        tracing::info!("[微信回调] 交易状态非SUCCESS: {}", trade_state);
        return (StatusCode::OK, Json(resp_success));
    }

    // 4. 前置检查：事务外查询，避免不必要的事务开销
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    if order.is_none() {
        tracing::warn!("[微信回调] 订单不存在: {}", out_trade_no);
        return (StatusCode::OK, Json(resp_success));
    }

    let order = order.unwrap();
    if order.status != "pending" {
        tracing::info!("[微信回调] 订单已处理过, 当前状态: {}, 跳过", order.status);
        return (StatusCode::OK, Json(resp_success));
    }

    // 5. 事务处理：更新订单 + 充值余额 + 写充值记录
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[微信回调] 开启事务失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let amount = order.amount;
    // 数据库更新操作字段说明：
    // - status: 订单状态更新为 'paid' 表示支付成功
    // - trade_no: 保存微信支付交易流水号
    // - paid_at: 记录实际支付完成的时间（TIMESTAMPTZ）
    let now = DbTs::now();

    let result = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"))
        .bind(trade_no).bind(&now).bind(out_trade_no)
        .execute(&mut *tx).await;
    match result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::info!("[微信回调] 订单已被并发处理，跳过: {}", out_trade_no);
            let _ = tx.rollback().await;
            return (StatusCode::OK, Json(resp_success));
        }
        Err(e) => {
            tracing::warn!("[微信回调] 更新订单状态失败: {:?}", e);
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
        _ => {}
    }

    if let Err(e) = sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&order.user_id)
    .execute(&mut *tx)
    .await
    {
        tracing::warn!("[微信回调] 更新用户余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    if let Err(e) = insert_paid_recharge_record(&state.db, &mut tx, &order.user_id, amount, "wechat", &out_trade_no).await {
        tracing::warn!("[微信回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    if let Err(e) = tx.commit().await {
        tracing::warn!("[微信回调] 事务提交失败: {:?}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    tracing::info!(
        "[微信回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2} 元",
        out_trade_no,
        order.user_id,
        amount
    );
    crate::services::notification::spawn_low_balance_check(
        Arc::clone(&state),
        order.user_id.clone(),
    );

    (StatusCode::OK, Json(resp_success))
}

pub async fn alipay_notify(State(state): State<Arc<AppState>>, body: String) -> impl IntoResponse {
    tracing::info!("[支付宝回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[支付宝回调] 原始数据: {}", body);

    // 使用标准 form_urlencoded 解析，正确处理 %2B → + 等编码
    let params: BTreeMap<String, String> = form_urlencoded::parse(body.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    let sign = params.get("sign").cloned().unwrap_or_default();
    let out_trade_no = params.get("out_trade_no").cloned().unwrap_or_default();
    let trade_no = params.get("trade_no").cloned().unwrap_or_default();
    let trade_status = params.get("trade_status").cloned().unwrap_or_default();

    tracing::info!(
        "[支付宝回调] trade_status: {}, out_trade_no: {}, trade_no: {}",
        trade_status,
        out_trade_no,
        trade_no
    );

    if trade_status != "TRADE_SUCCESS" && trade_status != "TRADE_FINISHED" {
        tracing::info!("[支付宝回调] 非成功状态，忽略: {}", trade_status);
        return "success".to_string();
    }

    let alipay_setting: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_alipay'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or_default();

    let config = match serde_json::from_str::<crate::models::PaymentAlipaySettings>(
        &alipay_setting.unwrap_or_default(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("[支付宝回调] 解析配置失败: {:?}", e);
            return "fail".to_string();
        }
    };

    let client = AlipayClient::new(config);
    match client.verify_signature(&params, &sign) {
        Ok(true) => tracing::info!("[支付宝回调] 签名验证通过"),
        Ok(false) => {
            tracing::warn!("[支付宝回调] 签名验证失败");
            return "fail".to_string();
        }
        Err(e) => {
            tracing::warn!("[支付宝回调] 签名验证异常: {:?}", e);
            return "fail".to_string();
        }
    }

    // 前置检查：事务外查询
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(&out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    if order.is_none() {
        tracing::warn!("[支付宝回调] 订单不存在: {}", out_trade_no);
        return "success".to_string();
    }

    let order = order.unwrap();
    if order.status != "pending" {
        tracing::info!("[支付宝回调] 订单已处理过, 当前状态: {}", order.status);
        return "success".to_string();
    }

    // 事务处理
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[支付宝回调] 开启事务失败: {:?}", e);
            return "fail".to_string();
        }
    };

    let amount = order.amount;
    // 数据库更新操作字段说明：
    // - status: 订单状态更新为 'paid' 表示支付成功
    // - trade_no: 保存支付宝交易流水号
    // - paid_at: 记录实际支付完成的时间（TIMESTAMPTZ）
    let now = DbTs::now();

    let result = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"))
        .bind(&trade_no).bind(&now).bind(&out_trade_no)
        .execute(&mut *tx).await;
    match result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::info!("[支付宝回调] 订单已被并发处理，跳过: {}", out_trade_no);
            let _ = tx.rollback().await;
            return "success".to_string();
        }
        Err(e) => {
            tracing::warn!("[支付宝回调] 更新订单失败: {:?}", e);
            let _ = tx.rollback().await;
            return "fail".to_string();
        }
        _ => {}
    }

    if let Err(e) = sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&order.user_id)
    .execute(&mut *tx)
    .await
    {
        tracing::warn!("[支付宝回调] 更新余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return "fail".to_string();
    }

    if let Err(e) = insert_paid_recharge_record(&state.db, &mut tx, &order.user_id, amount, "alipay", &out_trade_no).await {
        tracing::warn!("[支付宝回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return "fail".to_string();
    }

    if let Err(e) = tx.commit().await {
        tracing::warn!("[支付宝回调] 事务提交失败: {:?}", e);
        return "fail".to_string();
    }

    tracing::info!(
        "[支付宝回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2} 元",
        out_trade_no,
        order.user_id,
        amount
    );
    crate::services::notification::spawn_low_balance_check(
        Arc::clone(&state),
        order.user_id.clone(),
    );

    "success".to_string()
}

pub async fn stripe_notify(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: String,
) -> impl IntoResponse {
    use axum::http::StatusCode;

    tracing::info!("[Stripe回调] 收到 Webhook 通知, body长度: {}", body.len());

    let resp_ok = (StatusCode::OK, "ok");
    let resp_fail = (StatusCode::BAD_REQUEST, "fail");

    // 1. 读取 Stripe 配置
    let stripe_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_stripe'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[Stripe回调] 读取配置失败: {:?}", e);
            return resp_fail;
        }
    };

    let config = match serde_json::from_str::<crate::models::PaymentStripeSettings>(
        &stripe_setting.unwrap_or_default(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("[Stripe回调] 解析配置失败: {:?}", e);
            return resp_fail;
        }
    };

    // 2. 验证 Webhook 签名（必须携带签名头且校验通过，杜绝伪造）
    let sig_header = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let is_live_key = config.secret_key.starts_with("sk_live_");
    let client = StripeClient::new(config);

    if sig_header.is_empty() || !client.verify_webhook_signature(&body, sig_header).unwrap_or(false) {
        tracing::warn!("[Stripe回调] 缺少签名或签名校验失败");
        return resp_fail;
    }

    // 3. 解析事件
    let event: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[Stripe回调] JSON 解析失败: {:?}", e);
            return resp_fail;
        }
    };

    let event_type = event["type"].as_str().unwrap_or("");
    tracing::info!("[Stripe回调] event type: {}", event_type);

    if event_type != "checkout.session.completed" {
        tracing::info!("[Stripe回调] 非 checkout.session.completed 事件，忽略");
        return resp_ok;
    }

    let session = &event["data"]["object"];
    let payment_status = session["payment_status"].as_str().unwrap_or("");
    let out_trade_no = session["client_reference_id"].as_str().unwrap_or("");
    let stripe_session_id = session["id"].as_str().unwrap_or("");

    tracing::info!(
        "[Stripe回调] payment_status: {}, out_trade_no: {}, session_id: {}",
        payment_status,
        out_trade_no,
        stripe_session_id
    );

    if payment_status != "paid" {
        tracing::info!("[Stripe回调] payment_status 非 paid: {}", payment_status);
        return resp_ok;
    }

    // 4. 前置检查
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    if order.is_none() {
        tracing::warn!("[Stripe回调] 订单不存在: {}", out_trade_no);
        return resp_ok;
    }

    let order = order.unwrap();
    if order.status != "pending" {
        tracing::info!("[Stripe回调] 订单已处理过, 当前状态: {}", order.status);
        return resp_ok;
    }

    // 5. 向 Stripe 官方 API 主动二次验单（双重安全防御：官方必须确认 paid 且订单号一致）
    if stripe_session_id.is_empty() {
        tracing::warn!("[Stripe回调] 回调中缺少 session_id");
        return resp_fail;
    }
    if let Some(ref bound_trade_no) = order.trade_no {
        if bound_trade_no != stripe_session_id {
            tracing::warn!(
                "[Stripe回调] 订单绑定的 session_id 不匹配: 原绑定={}, 当前回调={}",
                bound_trade_no,
                stripe_session_id
            );
            return resp_fail;
        }
    }
    let official = match client.get_session(stripe_session_id).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[Stripe回调] 官方 API 验单请求失败: id={}, err={:?}", stripe_session_id, e);
            return resp_fail;
        }
    };
    let official_status = official["payment_status"].as_str().unwrap_or("");
    let official_ref = official["client_reference_id"].as_str().unwrap_or("");
    let official_currency = official["currency"].as_str().unwrap_or("").to_lowercase();
    let official_amount = official["amount_total"].as_i64().unwrap_or(0);
    let session_livemode = official["livemode"].as_bool().unwrap_or(false);

    let currency_settings = crate::api::settings::get_currency_settings(&state).await;
    let expected_currency = currency_settings.default_currency.to_lowercase();
    let expected_minor = client.to_minor_units(order.amount, &expected_currency);

    if official_status != "paid"
        || official_ref != out_trade_no
        || (is_live_key && !session_livemode)
        || official_currency != expected_currency
        || official_amount != expected_minor
    {
        tracing::warn!(
            "[Stripe回调] 官方验单未通过: id={}, 状态={}, 单号={}, 币种={}(需{}), 金额={}(需{}), livemode={}",
            stripe_session_id,
            official_status,
            official_ref,
            official_currency,
            expected_currency,
            official_amount,
            expected_minor,
            session_livemode
        );
        return resp_fail;
    }

    // 6. 事务处理
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[Stripe回调] 开启事务失败: {:?}", e);
            return resp_fail;
        }
    };

    let amount = order.amount;
    // 数据库更新操作字段说明：
    // - status: 订单状态更新为 'paid' 表示支付成功
    // - trade_no: 保存 Stripe 的 session id，用以对账
    // - paid_at: 记录实际支付完成的时间（TIMESTAMPTZ）
    let now = DbTs::now();

    let result = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"))
        .bind(stripe_session_id).bind(&now).bind(out_trade_no)
        .execute(&mut *tx).await;
    match result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::info!("[Stripe回调] 订单已被并发处理，跳过: {}", out_trade_no);
            let _ = tx.rollback().await;
            return resp_ok;
        }
        Err(e) => {
            tracing::warn!("[Stripe回调] 更新订单状态失败: {:?}", e);
            let _ = tx.rollback().await;
            return resp_fail;
        }
        _ => {}
    }

    if let Err(e) = sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&order.user_id)
    .execute(&mut *tx)
    .await
    {
        tracing::warn!("[Stripe回调] 更新用户余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return resp_fail;
    }

    if let Err(e) = insert_paid_recharge_record(&state.db, &mut tx, &order.user_id, amount, "stripe", &out_trade_no).await {
        tracing::warn!("[Stripe回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return resp_fail;
    }

    if let Err(e) = tx.commit().await {
        tracing::warn!("[Stripe回调] 事务提交失败: {:?}", e);
        return resp_fail;
    }

    tracing::info!(
        "[Stripe回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2}",
        out_trade_no,
        order.user_id,
        amount
    );
    crate::services::notification::spawn_low_balance_check(
        Arc::clone(&state),
        order.user_id.clone(),
    );

    resp_ok
}




/// HyperBC 支付异步回调通知处理函数
/// 收到来自 HyperBC 的 POST 请求，对 body 签名进行平台公钥验签，然后对对应订单状态进行更新，并入账用户余额
pub async fn hyperbc_notify(State(state): State<Arc<AppState>>, body: String) -> impl IntoResponse {
    tracing::warn!("[HyperBC回调] 原始数据: {}", body);

    // 1. 解析回调 JSON 报文
    let body_val: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[HyperBC回调] JSON 解析失败: {:?}", e);
            return "fail".into_response();
        }
    };

    // 2. 提取并移出 sign 签名参数，供后续验签
    let sign = match body_val.get("sign").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            tracing::warn!("[HyperBC回调] 验签失败 [缺少签名字段]: 回调报文中缺少 sign 参数");
            return "fail".into_response();
        }
    };

    // 构造平铺的待签名数据：若包含 data 节点且为 Object，则直接将 data 节点的属性拉平到最外层进行验签
    let flat_body_val = if let Some(data_obj) = body_val.get("data").and_then(|d| d.as_object()) {
        serde_json::Value::Object(data_obj.clone())
    } else {
        body_val.clone()
    };

    // 3. 加载数据库配置进行验签
    let hyperbc_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_hyperbc'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("[HyperBC回调] 查询数据库配置失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let config: crate::models::PaymentHyperbcSettings =
        match serde_json::from_str(&hyperbc_setting.unwrap_or_default()) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("[HyperBC回调] 解析 HyperBC 配置失败: {:?}", e);
                return "fail".into_response();
            }
        };

    if config.hyperbc_public_key.trim().is_empty() {
        tracing::warn!("[HyperBC回调] 验签失败 [未配置平台公钥]: 系统未配置 HyperBC 平台公钥，拒绝处理");
        return "fail".into_response();
    }

    let client = HyperbcClient::new(config.clone());
    let sign_content = HyperbcClient::get_sign_content_from_raw(&body)
        .unwrap_or_else(|_| HyperbcClient::get_sign_content(&flat_body_val));

    match client.verify_signature_str(&sign_content, &sign) {
        Ok(true) => {
            tracing::info!("[HyperBC回调] RSA 签名验证通过");
        }
        Ok(false) => {
            tracing::warn!(
                "[HyperBC回调] 验签失败 [签名不匹配]: RSA 签名校验未通过 (sign={}, sign_content={})",
                sign,
                sign_content
            );
            return "fail".into_response();
        }
        Err(e) => {
            tracing::warn!("[HyperBC回调] 验签失败 [执行异常]: RSA 验签执行异常: {:?}", e);
            return "fail".into_response();
        }
    }

    // 4. 解析业务 data 节点为强类型 QueryOrderData
    let data_val = match body_val.get("data") {
        Some(d) => d,
        None => {
            tracing::warn!("[HyperBC回调] 报文错误 [缺少业务数据]: 回调报文中缺少 data 节点");
            return "fail".into_response();
        }
    };

    let notify_data: crate::api::plugins::pay::payment::hyperbc::QueryOrderData =
        match serde_json::from_value(data_val.clone()) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("[HyperBC回调] 报文错误 [结构解析失败]: 解析 data 节点失败: {:?}", e);
                return "fail".into_response();
            }
        };

    let merchant_order_id = &notify_data.merchant_order_id;
    if merchant_order_id.is_empty() {
        tracing::warn!("[HyperBC回调] 报文错误 [缺少订单号]: data 节点中缺少有效 merchant_order_id");
        return "fail".into_response();
    }

    let status = notify_data.status;
    let check_code = notify_data.get_check_code();
    let actual_crypto = notify_data.get_actual_crypto_amount();

    tracing::info!(
        "[HyperBC回调] 订单号: {}, status: {}, check_code: {}, 实际到账代币: {}",
        merchant_order_id,
        status,
        check_code,
        actual_crypto
    );

    let ok_resp = || {
        (
            [(axum::http::header::CONTENT_TYPE, "application/json; charset=utf-8")],
            client.success_response(),
        )
            .into_response()
    };

    // status = 10 表示已取消
    if status == 10 {
        let _ = sqlx::query(&state.db.format_query(
            "UPDATE orders SET status = 'cancelled' WHERE out_trade_no = ? AND status = 'pending'",
        ))
        .bind(merchant_order_id)
        .execute(&state.db.pool)
        .await;
        return ok_resp();
    }

    // 判断结算资格：
    // 1: 正常支付 (status=1 且 check_code=0)
    // 2: 异常支付差额入账 (status=2 且 check_code=1001 且链上确有代币到账 actual_crypto > 0)
    let should_settle = (status == 1 && check_code == 0)
        || (status == 2 && check_code == 1001 && actual_crypto > 0.0);

    if !should_settle {
        tracing::info!(
            "[HyperBC回调] 订单 {} status={} check_code={} 不满足自动入账条件，忽略或需人工复核",
            merchant_order_id,
            status,
            check_code
        );
        return ok_resp();
    }

    // 查询订单信息以提取期望金额和用户ID
    let order: Option<Order> = match sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(merchant_order_id)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(o) => o,
        Err(e) => {
            tracing::warn!("[HyperBC回调] 查询订单失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let order = match order {
        Some(o) => o,
        None => {
            tracing::warn!("[HyperBC回调] 订单不存在: {}", merchant_order_id);
            return "fail".into_response();
        }
    };

    // 幂等防护：如果订单状态已经是 paid (已支付)，直接返回 success 避免重复入账
    if order.status == "paid" {
        tracing::info!(
            "[HyperBC回调] 订单已是支付状态，幂等跳过, out_trade_no: {}",
            merchant_order_id
        );
        return ok_resp();
    }

    // 计算实际结算金额（零亏损红线：实到金额乘汇率，且不得超过预设金额）：
    let exchange_rate = if config.crypto_exchange_rate > 0.0 { config.crypto_exchange_rate } else { 1.0 };
    let settle_amount = if actual_crypto > 0.0 {
        let converted = actual_crypto * exchange_rate;
        converted.min(order.amount)
    } else {
        order.amount
    };

    // 调用公用入账函数进行状态更新与余额充值，保证业务逻辑的高内聚和 100% 严格防并发防重入
    match complete_hyperbc_payment(&state, merchant_order_id, settle_amount, &order.user_id).await {
        Ok(_) => ok_resp(),
        Err(e) => {
            tracing::warn!("[HyperBC回调] 处理订单支付更新失败: {:?}", e);
            "fail".into_response()
        }
    }
}

/// 通联支付异步回调通知接口
pub async fn allinpay_notify(
    State(state): State<Arc<AppState>>,
    body: String,
) -> impl IntoResponse {
    tracing::info!("[通联回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[通联回调] 原始数据: {}", body);

    // 通联发送回调是标准的 form-urlencoded 格式
    let params: BTreeMap<String, String> = form_urlencoded::parse(body.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    let sign = params.get("sign").cloned().unwrap_or_default();
    // 统一下单回传：优先 reqsn，兼容 cusorderid（文档定义为对应 reqsn）
    let out_trade_no = params
        .get("reqsn")
        .filter(|s| !s.is_empty())
        .or_else(|| params.get("cusorderid"))
        .cloned()
        .unwrap_or_default();
    let trxstatus = params.get("trxstatus").cloned().unwrap_or_default();

    tracing::info!(
        "[通联回调] trxstatus: {}, reqsn: {}",
        trxstatus,
        out_trade_no
    );

    // 通联定义 "0000" 代表支付成功
    if trxstatus != "0000" {
        tracing::info!("[通联回调] 交易状态未成功，忽略");
        return "success".into_response();
    }

    // 获取配置
    let allinpay_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_allinpay'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[通联回调] 读取配置失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let config = match serde_json::from_str::<crate::models::PaymentAllinpaySettings>(
        &allinpay_setting.unwrap_or_default(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("[通联回调] 解析配置失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let client = AllinpayClient::new(config);
    // 利用平台公钥校验回调签名，防止伪造攻击
    match client.verify_signature(&params, &sign) {
        Ok(true) => tracing::info!("[通联回调] 签名验证通过"),
        Ok(false) => {
            tracing::warn!("[通联回调] 签名验证失败");
            return "fail".into_response();
        }
        Err(e) => {
            tracing::warn!("[通联回调] 签名验证过程中出现异常: {:?}", e);
            return "fail".into_response();
        }
    }

    // 获取原订单以确认支付金额和充值人
    let order: Option<Order> = match sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(&out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(o) => o,
        Err(e) => {
            tracing::warn!("[通联回调] 查询订单失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let order = match order {
        Some(o) => o,
        None => {
            tracing::warn!("[通联回调] 订单不存在: {}", out_trade_no);
            return "fail".into_response();
        }
    };

    // 幂等防护：订单已支付直接返回成功，防重复充值
    if order.status == "paid" {
        tracing::info!(
            "[通联回调] 订单已是支付状态，幂等跳过, out_trade_no: {}",
            out_trade_no
        );
        return "success".into_response();
    }

    // 事务处理入账
    match complete_allinpay_payment(
        &state,
        &out_trade_no,
        order.amount,
        &order.user_id,
        &order.payment_method,
    )
    .await
    {
        Ok(_) => "success".into_response(),
        Err(e) => {
            tracing::warn!("[通联回调] 处理加额更新失败: {:?}", e);
            "fail".into_response()
        }
    }
}
