/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use anyhow::Result;
use sqlx::{Postgres, Transaction};

pub const BASIS_CONSUMPTION: &str = "consumption";
pub const BASIS_RECHARGE: &str = "recharge";

pub fn normalize_commission_basis(raw: &str) -> &'static str {
    if raw == BASIS_RECHARGE {
        BASIS_RECHARGE
    } else {
        BASIS_CONSUMPTION
    }
}

#[derive(sqlx::FromRow)]
struct InviterTerms {
    id: String,
    commission_ratio: f64,
    commission_basis: String,
}

/// 终态结算里应计佣的系统钱包消费。赠送钱包不计入。冻结未完成返回 0。
pub struct ConsumptionAward {
    pub inviter_id: String,
    pub ratio: f64,
    pub base_amount: f64,
}

async fn load_inviter_terms(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
) -> Result<Option<InviterTerms>> {
    let row: Option<InviterTerms> = sqlx::query_as(&db.format_query(
        "SELECT inv.id, ul.commission_ratio, COALESCE(NULLIF(ul.commission_basis, ''), 'consumption') AS commission_basis \
         FROM users u \
         JOIN users inv ON (inv.id = u.referred_by OR inv.uid = u.referred_by) \
         JOIN user_levels ul ON ul.group_key = inv.user_group \
         WHERE u.id = ? AND u.referred_by IS NOT NULL AND u.referred_by <> '' \
         ORDER BY CASE WHEN inv.id = u.referred_by THEN 0 ELSE 1 END \
         LIMIT 1",
    ))
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row)
}

fn commission_amount(base: f64, ratio: f64) -> f64 {
    if base <= 0.0 || ratio <= 0.0 {
        return 0.0;
    }
    crate::money::round_money(base * ratio)
}

async fn insert_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    inviter_id: &str,
    from_user_id: &str,
    recharge_id: Option<i64>,
    amount: f64,
    ratio: f64,
    source_key: &str,
) -> Result<bool> {
    let inserted = sqlx::query(&db.format_query(
        "INSERT INTO commissions (user_id, from_user_id, recharge_id, amount, ratio, source_key) \
         VALUES (?, ?, ?, ?, ?, ?) \
         ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING",
    ))
    .bind(inviter_id)
    .bind(from_user_id)
    .bind(recharge_id)
    .bind(amount)
    .bind(ratio)
    .bind(source_key)
    .execute(&mut **tx)
    .await?
    .rows_affected();
    Ok(inserted > 0)
}

/// 回冲不超过佣金钱包余额。余额不足时只扣剩余部分。
pub fn capped_clawback(requested: f64, balance: f64) -> f64 {
    let requested = crate::money::round_money(requested);
    let balance = crate::money::round_money(balance);
    if requested <= 0.0 || balance <= 0.0 {
        return 0.0;
    }
    crate::money::round_money(requested.min(balance))
}

/// 管理端系统钱包加减时，是否提示、默认勾不勾、实际金额。
pub struct AdjustQuote {
    pub eligible: bool,
    pub direction: &'static str,
    pub suggested: f64,
    /// 实际联动金额。扣回时等于佣金钱包与系统钱包两笔之和。
    pub actual: f64,
    /// 扣回时先从佣金钱包扣的部分。发放时等于入账佣金。
    pub from_commission: f64,
    /// 扣回时佣金钱包不够、改从上级系统钱包扣的部分。
    pub from_system: f64,
    pub default_apply: bool,
}

/// 管理端扣回拆分：先吃满佣金钱包，差额记到系统钱包，系统钱包侧不封顶。
fn split_admin_clawback(suggested: f64, commission_balance: f64) -> (f64, f64) {
    let suggested = crate::money::round_money(suggested);
    let from_commission = capped_clawback(suggested, commission_balance);
    let from_system = crate::money::round_money((suggested - from_commission).max(0.0));
    (from_commission, from_system)
}

pub fn quote_adjust(amount: f64, ratio: f64, basis: &str, commission_balance: f64) -> AdjustQuote {
    let amount = crate::money::round_money(amount);
    let basis = normalize_commission_basis(basis);
    let none = AdjustQuote {
        eligible: false,
        direction: "none",
        suggested: 0.0,
        actual: 0.0,
        from_commission: 0.0,
        from_system: 0.0,
        default_apply: false,
    };
    if ratio <= 0.0 || amount == 0.0 {
        return none;
    }
    if amount > 0.0 {
        if basis != BASIS_RECHARGE {
            return none;
        }
        let suggested = commission_amount(amount, ratio);
        if suggested <= 0.0 {
            return none;
        }
        return AdjustQuote {
            eligible: true,
            direction: "award",
            suggested,
            actual: suggested,
            from_commission: suggested,
            from_system: 0.0,
            default_apply: true,
        };
    }
    let suggested = commission_amount(-amount, ratio);
    if suggested <= 0.0 {
        return none;
    }
    let (from_commission, from_system) = split_admin_clawback(suggested, commission_balance);
    AdjustQuote {
        eligible: true,
        direction: "clawback",
        suggested,
        actual: crate::money::round_money(from_commission + from_system),
        from_commission,
        from_system,
        default_apply: basis == BASIS_RECHARGE,
    }
}

async fn lock_commission_balance(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    inviter_id: &str,
) -> Result<f64> {
    let balance: f64 = sqlx::query_scalar(&db.format_query(
        "SELECT commission_balance FROM users WHERE id = ? FOR UPDATE",
    ))
    .bind(inviter_id)
    .fetch_one(&mut **tx)
    .await?;
    Ok(balance)
}

/// 佣金只进出 `commission_balance`。扣回不超过当前余额；流水金额与实际变动一致。
async fn settle_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    inviter_id: &str,
    from_user_id: &str,
    recharge_id: Option<i64>,
    signed: f64,
    ratio: f64,
    source_key: &str,
) -> Result<f64> {
    let signed = crate::money::round_money(signed);
    if signed == 0.0 {
        return Ok(0.0);
    }
    let actual = if signed > 0.0 {
        signed
    } else {
        let balance = lock_commission_balance(db, tx, inviter_id).await?;
        -capped_clawback(-signed, balance)
    };
    if actual == 0.0 {
        return Ok(0.0);
    }
    if !insert_commission(
        db,
        tx,
        inviter_id,
        from_user_id,
        recharge_id,
        actual,
        ratio,
        source_key,
    )
    .await?
    {
        return Ok(0.0);
    }
    sqlx::query(&db.format_query(
        "UPDATE users SET commission_balance = GREATEST(commission_balance + ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(actual)
    .bind(inviter_id)
    .execute(&mut **tx)
    .await?;
    Ok(actual)
}

/// 按充值发放。仅当邀请人等级基准为 `recharge` 且比例大于 0 时入账。返回实际入账金额。
pub async fn award_recharge_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    recharge_id: i64,
    amount: f64,
) -> Result<f64> {
    let amount = crate::money::round_money(amount);
    if amount <= 0.0 {
        return Ok(0.0);
    }
    let Some(terms) = load_inviter_terms(db, tx, user_id).await? else {
        return Ok(0.0);
    };
    if normalize_commission_basis(&terms.commission_basis) != BASIS_RECHARGE {
        return Ok(0.0);
    }
    let commission = commission_amount(amount, terms.commission_ratio);
    if commission <= 0.0 {
        return Ok(0.0);
    }
    let source_key = format!("recharge:{recharge_id}");
    settle_commission(
        db,
        tx,
        &terms.id,
        user_id,
        Some(recharge_id),
        commission,
        terms.commission_ratio,
        &source_key,
    )
    .await
}

/// 结算前测算本次可计佣的系统钱包消费。`apply > 0` 时锁定用户行，保证与随后的钱包扣减读到同一笔赠送余额。
pub async fn prepare_consumption_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    settled_cost: f64,
    pre_deducted: f64,
    pre_deduct_gift: f64,
    is_freeze: bool,
) -> Result<Option<ConsumptionAward>> {
    if is_freeze || crate::money::round_money(settled_cost) <= 0.0 {
        return Ok(None);
    }
    let Some(terms) = load_inviter_terms(db, tx, user_id).await? else {
        return Ok(None);
    };
    if normalize_commission_basis(&terms.commission_basis) != BASIS_CONSUMPTION
        || terms.commission_ratio <= 0.0
    {
        return Ok(None);
    }
    let (_, apply) = crate::money::settlement_delta(settled_cost, pre_deducted);
    let gift_before_extra = if apply > 0.0 {
        let gift: f64 = sqlx::query_scalar(&db.format_query(
            "SELECT gift_balance FROM users WHERE id = ? FOR UPDATE",
        ))
        .bind(user_id)
        .fetch_one(&mut **tx)
        .await?;
        gift
    } else {
        0.0
    };
    let base = crate::money::paid_consumption_for_commission(
        settled_cost,
        pre_deducted,
        pre_deduct_gift,
        gift_before_extra,
        false,
    );
    if commission_amount(base, terms.commission_ratio) <= 0.0 {
        return Ok(None);
    }
    Ok(Some(ConsumptionAward {
        inviter_id: terms.id,
        ratio: terms.commission_ratio,
        base_amount: base,
    }))
}

pub async fn credit_consumption_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    from_user_id: &str,
    source_key: &str,
    award: &ConsumptionAward,
) -> Result<()> {
    let commission = commission_amount(award.base_amount, award.ratio);
    if commission <= 0.0 {
        return Ok(());
    }
    accrue_daily_consumption(
        db,
        tx,
        &award.inviter_id,
        from_user_id,
        commission,
        award.ratio,
        source_key,
    )
    .await?;
    Ok(())
}

/// 已经拆好的系统钱包实扣（方舟视频等增量扣费）。基准不是 consumption 时直接跳过。
pub async fn award_paid_consumption(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    source_key: &str,
    paid_amount: f64,
) -> Result<()> {
    let paid_amount = crate::money::round_money(paid_amount);
    if paid_amount <= 0.0 {
        return Ok(());
    }
    let Some(terms) = load_inviter_terms(db, tx, user_id).await? else {
        return Ok(());
    };
    if normalize_commission_basis(&terms.commission_basis) != BASIS_CONSUMPTION {
        return Ok(());
    }
    let award = ConsumptionAward {
        inviter_id: terms.id,
        ratio: terms.commission_ratio,
        base_amount: paid_amount,
    };
    credit_consumption_commission(db, tx, user_id, source_key, &award).await
}

/// 系统钱包退款回冲。只减邀请人佣金钱包，不超过剩余额度。
pub async fn clawback_consumption_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    source_key: &str,
    refund_amount: f64,
) -> Result<()> {
    let refund_amount = crate::money::round_money(refund_amount);
    if refund_amount <= 0.0 {
        return Ok(());
    }
    let Some(terms) = load_inviter_terms(db, tx, user_id).await? else {
        return Ok(());
    };
    if normalize_commission_basis(&terms.commission_basis) != BASIS_CONSUMPTION {
        return Ok(());
    }
    let cut = commission_amount(refund_amount, terms.commission_ratio);
    if cut <= 0.0 {
        return Ok(());
    }
    accrue_daily_consumption(
        db,
        tx,
        &terms.id,
        user_id,
        -cut,
        terms.commission_ratio,
        source_key,
    )
    .await?;
    Ok(())
}

/// 同一被邀请人、同一站点日只保留一条消费返佣，金额随调用累加。`source_key` 仍用来防止同一笔结算重复入账。
async fn accrue_daily_consumption(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    inviter_id: &str,
    from_user_id: &str,
    signed: f64,
    ratio: f64,
    source_key: &str,
) -> Result<()> {
    let signed = crate::money::round_money(signed);
    if signed == 0.0 {
        return Ok(());
    }
    let actual = if signed > 0.0 {
        signed
    } else {
        let balance = lock_commission_balance(db, tx, inviter_id).await?;
        -capped_clawback(-signed, balance)
    };
    if actual == 0.0 || !claim_commission_event(db, tx, source_key).await? {
        return Ok(());
    }
    let site_tz = crate::relay::relay_settings::get_cached_site_timezone(db).await;
    let tz: chrono_tz::Tz = site_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai);
    let day = chrono::Utc::now()
        .with_timezone(&tz)
        .format("%Y-%m-%d")
        .to_string();
    let day_key = format!("daycons:{from_user_id}:{day}");
    sqlx::query(&db.format_query(
        "INSERT INTO commissions (user_id, from_user_id, amount, ratio, source_key) \
         VALUES (?, ?, ?, ?, ?) \
         ON CONFLICT (source_key) WHERE source_key IS NOT NULL \
         DO UPDATE SET amount = commissions.amount + EXCLUDED.amount, ratio = EXCLUDED.ratio",
    ))
    .bind(inviter_id)
    .bind(from_user_id)
    .bind(actual)
    .bind(ratio)
    .bind(&day_key)
    .execute(&mut **tx)
    .await?;
    sqlx::query(&db.format_query(
        "UPDATE users SET commission_balance = GREATEST(commission_balance + ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(actual)
    .bind(inviter_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn claim_commission_event(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    source_key: &str,
) -> Result<bool> {
    let updated = if let Some(id) = source_key.strip_prefix("log:") {
        let Ok(id) = id.parse::<i64>() else {
            return Ok(false);
        };
        sqlx::query(&db.format_query(
            "UPDATE logs SET commission_posted = 1 WHERE id = ? AND commission_posted = 0",
        ))
        .bind(id)
        .execute(&mut **tx)
        .await?
    } else if let Some(id) = source_key
        .strip_prefix("arkrefund:")
        .or_else(|| source_key.strip_prefix("ark:"))
    {
        let Ok(id) = id.parse::<i64>() else {
            return Ok(false);
        };
        sqlx::query(&db.format_query(
            "UPDATE recharge_records SET commission_posted = 1 WHERE id = ? AND commission_posted = 0",
        ))
        .bind(id)
        .execute(&mut **tx)
        .await?
    } else {
        return Ok(false);
    };
    Ok(updated.rows_affected() > 0)
}

/// 校验用户填写的划转金额。`min`/`max` 为 0 表示不限制。
pub fn transfer_amount(
    requested: f64,
    balance: f64,
    min_amt: f64,
    max_amt: f64,
) -> Result<f64, &'static str> {
    let requested = crate::money::round_money(requested);
    let balance = crate::money::round_money(balance);
    let min_amt = crate::money::round_money(min_amt).max(0.0);
    let max_amt = crate::money::round_money(max_amt).max(0.0);
    if requested <= 0.0 || balance <= 0.0 {
        return Err("empty");
    }
    if max_amt > 0.0 && min_amt > max_amt {
        return Err("conflict");
    }
    if min_amt > 0.0 && (balance < min_amt || requested < min_amt) {
        return Err("below_min");
    }
    if requested > balance {
        return Err("over_balance");
    }
    if max_amt > 0.0 && requested > max_amt {
        return Err("above_max");
    }
    Ok(requested)
}

pub struct AdminClawback {
    pub from_commission: f64,
    pub from_system: f64,
}

/// 管理端明确选择扣回时使用。不看发放基准。先扣佣金钱包，差额再扣上级系统钱包。
pub async fn clawback_admin_commission(
    db: &crate::db::Database,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    recharge_id: i64,
    base_amount: f64,
    operator: &str,
    child_username: &str,
    system_order_no: &str,
) -> Result<AdminClawback> {
    let base_amount = crate::money::round_money(base_amount);
    if base_amount <= 0.0 {
        return Ok(AdminClawback {
            from_commission: 0.0,
            from_system: 0.0,
        });
    }
    let Some(terms) = load_inviter_terms(db, tx, user_id).await? else {
        return Ok(AdminClawback {
            from_commission: 0.0,
            from_system: 0.0,
        });
    };
    let suggested = commission_amount(base_amount, terms.commission_ratio);
    if suggested <= 0.0 {
        return Ok(AdminClawback {
            from_commission: 0.0,
            from_system: 0.0,
        });
    }
    let commission_balance = lock_commission_balance(db, tx, &terms.id).await?;
    let (want_commission, _) = split_admin_clawback(suggested, commission_balance);
    let source_key = format!("adjustclaw:{recharge_id}");
    let from_commission = if want_commission > 0.0 {
        let applied = settle_commission(
            db,
            tx,
            &terms.id,
            user_id,
            Some(recharge_id),
            -want_commission,
            terms.commission_ratio,
            &source_key,
        )
        .await?;
        crate::money::round_money(-applied)
    } else {
        0.0
    };
    let from_system = crate::money::round_money((suggested - from_commission).max(0.0));
    if from_system > 0.0 {
        let remark = format!("下级 {child_username} 余额调减，返佣差额从系统钱包扣回");
        sqlx::query(&db.format_query(
            "UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ))
        .bind(from_system)
        .bind(&terms.id)
        .execute(&mut **tx)
        .await?;
        sqlx::query(&db.format_query(
            "INSERT INTO recharge_records (user_id, amount, recharge_type, remark, operator, wallet_type, order_no) VALUES (?, ?, 'manual', ?, ?, 'system', ?)",
        ))
        .bind(&terms.id)
        .bind(-from_system)
        .bind(&remark)
        .bind(operator)
        .bind(system_order_no)
        .execute(&mut **tx)
        .await?;
    }
    Ok(AdminClawback {
        from_commission,
        from_system,
    })
}

#[cfg(test)]
mod commission_wallet_tests {
    use super::{capped_clawback, quote_adjust, split_admin_clawback, transfer_amount};

    #[test]
    fn clawback_stops_at_commission_wallet() {
        assert_eq!(capped_clawback(3.0, 10.0), 3.0);
        assert_eq!(capped_clawback(3.0, 1.25), 1.25);
        assert_eq!(capped_clawback(3.0, 0.0), 0.0);
        assert_eq!(capped_clawback(0.0, 5.0), 0.0);
    }

    #[test]
    fn admin_clawback_takes_commission_then_system() {
        assert_eq!(split_admin_clawback(5.0, 0.0), (0.0, 5.0));
        assert_eq!(split_admin_clawback(5.0, 2.0), (2.0, 3.0));
        assert_eq!(split_admin_clawback(5.0, 9.0), (5.0, 0.0));
        assert_eq!(split_admin_clawback(0.0, 4.0), (0.0, 0.0));
    }

    #[test]
    fn recharge_topup_defaults_to_award() {
        let quote = quote_adjust(100.0, 0.1, "recharge", 0.0);
        assert!(quote.eligible);
        assert_eq!(quote.direction, "award");
        assert_eq!(quote.actual, 10.0);
        assert!(quote.default_apply);
    }

    #[test]
    fn consumption_topup_does_not_award() {
        let quote = quote_adjust(100.0, 0.1, "consumption", 50.0);
        assert!(!quote.eligible);
    }

    #[test]
    fn recharge_decrease_defaults_to_clawback_and_spills() {
        let quote = quote_adjust(-100.0, 0.1, "recharge", 4.0);
        assert!(quote.eligible);
        assert_eq!(quote.direction, "clawback");
        assert_eq!(quote.suggested, 10.0);
        assert_eq!(quote.from_commission, 4.0);
        assert_eq!(quote.from_system, 6.0);
        assert_eq!(quote.actual, 10.0);
        assert!(quote.default_apply);
    }

    #[test]
    fn consumption_decrease_asks_but_defaults_off() {
        let quote = quote_adjust(-80.0, 0.1, "consumption", 100.0);
        assert!(quote.eligible);
        assert_eq!(quote.from_commission, 8.0);
        assert_eq!(quote.from_system, 0.0);
        assert_eq!(quote.actual, 8.0);
        assert!(!quote.default_apply);
    }

    #[test]
    fn transfer_respects_min_and_max() {
        assert_eq!(transfer_amount(40.0, 100.0, 0.0, 0.0), Ok(40.0));
        assert_eq!(transfer_amount(20.0, 100.0, 10.0, 30.0), Ok(20.0));
        assert_eq!(transfer_amount(40.0, 100.0, 10.0, 30.0), Err("above_max"));
        assert_eq!(transfer_amount(5.0, 100.0, 10.0, 0.0), Err("below_min"));
        assert_eq!(transfer_amount(8.0, 8.0, 10.0, 0.0), Err("below_min"));
        assert_eq!(transfer_amount(50.0, 40.0, 0.0, 0.0), Err("over_balance"));
        assert_eq!(transfer_amount(0.0, 100.0, 0.0, 0.0), Err("empty"));
        assert_eq!(transfer_amount(20.0, 100.0, 50.0, 10.0), Err("conflict"));
    }
}
