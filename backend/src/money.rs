/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 站点内部账本金额精度约定：一律保留小数点后 6 位（四舍五入）。
//!
//! 适用范围：余额、赠送金、日志 cost、预扣/结算扣费、充值调账、额度用量等。
//! 不适用：支付通道对外金额（微信/支付宝等仍按对方要求保留分，即 2 位）。

/// 金额小数位数
pub const MONEY_DECIMAL_PLACES: u32 = 6;

/// 缩放因子：10^6（与 MONEY_DECIMAL_PLACES 保持一致）
pub const MONEY_SCALE: f64 = 1_000_000.0;

/// 四舍五入到约定小数位
#[inline]
pub fn round_money(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    (v * MONEY_SCALE).round() / MONEY_SCALE
}

/// 格式化为固定小数位字符串（日志/通知用）
#[inline]
pub fn format_money(v: f64) -> String {
    format!("{:.*}", MONEY_DECIMAL_PLACES as usize, round_money(v))
}

/// 精简金额格式化（最多 6 位小数，去除末尾无效的 0 与小数点）
#[inline]
pub fn format_clean_money(v: f64) -> String {
    let s = format!("{:.*}", MONEY_DECIMAL_PLACES as usize, round_money(v));
    let trimmed = s.trim_end_matches('0').trim_end_matches('.');
    if trimmed.is_empty() || trimmed == "-" {
        "0".to_string()
    } else {
        trimmed.to_string()
    }
}

/// 预扣/扣费：赠送余额优先，返回 `(gift_deducted, balance_deducted)`（均已 round）。
#[inline]
pub fn split_gift_first(amount: f64, gift_balance: f64) -> (f64, f64) {
    let amount = round_money(amount);
    if amount <= 0.0 {
        return (0.0, 0.0);
    }
    let gift = round_money(amount.min(gift_balance.max(0.0)));
    (gift, round_money(amount - gift))
}

/// 结算差额 `(settled_cost, apply_balance)`：应付原样；apply 正补扣、负退多扣。
#[inline]
pub fn settlement_delta(cost: f64, pre_deducted: f64) -> (f64, f64) {
    let settled = round_money(cost);
    let apply = round_money(settled - round_money(pre_deducted));
    (settled, apply)
}

/// 格式化预扣结算文案留痕（统一收口异步/同步任务的预扣结算说明）
/// 支持传入已有货币单位（Some）；未传入（None）且 pre_deducted > 0 时内部自动从 state 查询，避免外部到处重复查库
pub async fn format_settlement_note(
    state: &crate::AppState,
    settled_cost: f64,
    pre_deducted: f64,
    unit_opt: Option<&str>,
    is_by_second: bool,
) -> String {
    if pre_deducted <= 0.0 {
        return String::new();
    }
    let fallback_unit;
    let unit = match unit_opt {
        Some(u) => u,
        None => {
            fallback_unit = crate::api::settings::get_currency_settings(state).await.currency_unit;
            &fallback_unit
        }
    };
    let (settled, delta) = settlement_delta(settled_cost, pre_deducted);
    let tag = if is_by_second {
        "[按秒预扣结算]"
    } else {
        "[预扣结算]"
    };
    let action = if delta < 0.0 {
        format!("退还差额 {}{}", format_clean_money(-delta), unit)
    } else if delta > 0.0 {
        format!("补扣差额 {}{}", format_clean_money(delta), unit)
    } else {
        "无需退补".to_string()
    };
    format!(
        " | {} 已预扣 {}{}，实际消费 {}{}，{}",
        tag,
        format_clean_money(pre_deducted),
        unit,
        format_clean_money(settled),
        unit,
        action
    )
}
