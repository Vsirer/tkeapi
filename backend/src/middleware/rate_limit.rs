/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use dashmap::DashMap;
use governor::{state::InMemoryState, state::NotKeyed, Quota, RateLimiter};
use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct GlobalRateLimiter {
    // Key: TokenID, Value: Limiter (RPS)
    token_rps_limits:
        DashMap<i64, Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>>,
    // Key: TokenID, Value: Limiter (RPM)
    token_rpm_limits:
        DashMap<i64, Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>>,
    /// 登录/管理登录按 IP 限流（每分钟）
    login_ip_limits:
        DashMap<String, Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>>,
    /// 登录连续失败计数：IP -> (连续失败次数, 上次失败时间)
    login_failures: DashMap<String, (u32, Instant)>,
    /// 登录锁定到期时间：IP -> 锁定到期 Instant
    login_lockouts: DashMap<String, Instant>,
    /// 兑换码：IP 短窗计数（次数, 窗口起点）
    redeem_ip_windows: DashMap<String, (u32, Instant)>,
    /// 兑换码：IP 封禁至（Instant）
    redeem_ip_bans: DashMap<String, Instant>,
    /// 日志重度查询按 (User, IP) 限流
    logs_query_limits:
        DashMap<String, Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>>,
}

const LOGIN_MAX_FAILURES: u32 = 10;
const LOGIN_WARN_REMAINING_ATTEMPTS: u32 = 3;
const LOGIN_LOCKOUT_SECS: u64 = 10 * 60; // 锁定 10 分钟
const LOGIN_FAILURE_WINDOW_SECS: u64 = 15 * 60; // 连续失败窗口 15 分钟

impl GlobalRateLimiter {
    pub fn new() -> Self {
        Self {
            token_rps_limits: DashMap::new(),
            token_rpm_limits: DashMap::new(),
            login_ip_limits: DashMap::new(),
            login_failures: DashMap::new(),
            login_lockouts: DashMap::new(),
            redeem_ip_windows: DashMap::new(),
            redeem_ip_bans: DashMap::new(),
            logs_query_limits: DashMap::new(),
        }
    }

    /// 检查 IP 是否处于登录锁定状态（失败 10 次锁定 10 分钟）
    pub fn check_login_lock(&self, ip: &str) -> Result<(), String> {
        let ip = ip.trim();
        if ip.is_empty() || ip == "unknown" {
            return Ok(());
        }
        let now = Instant::now();

        if let Some(until) = self.login_lockouts.get(ip) {
            if *until > now {
                let remaining_secs = until.duration_since(now).as_secs();
                let remaining_mins = (remaining_secs + 59) / 60;
                return Err(format!(
                    "登录错误次数过多，已被锁定，请 {} 分钟后再试",
                    remaining_mins.max(1)
                ));
            }
            // 锁定已到期，释放锁定
            drop(until);
            self.login_lockouts.remove(ip);
        }

        Ok(())
    }

    /// 记录一次登录失败。连续失败满 10 次时锁定 10 分钟，并返回对应提示。
    pub fn record_login_failure(&self, ip: &str, base_err: &str) -> String {
        let ip = ip.trim();
        if ip.is_empty() || ip == "unknown" {
            return base_err.to_string();
        }
        let now = Instant::now();

        // 定期清理过期项，防止内存增长
        if self.login_failures.len() > 8_192 {
            self.login_failures.retain(|_, (_, last_fail)| {
                now.duration_since(*last_fail) <= Duration::from_secs(LOGIN_FAILURE_WINDOW_SECS)
            });
        }
        if self.login_lockouts.len() > 4_096 {
            self.login_lockouts.retain(|_, until| *until > now);
        }

        let mut entry = self
            .login_failures
            .entry(ip.to_string())
            .or_insert((0, now));
        let (count, last_fail) = *entry;

        // 如果距离上次失败已超过窗口期，重新从 1 开始计
        let new_count = if now.duration_since(last_fail)
            > Duration::from_secs(LOGIN_FAILURE_WINDOW_SECS)
        {
            1
        } else {
            count.saturating_add(1)
        };

        *entry = (new_count, now);

        if new_count >= LOGIN_MAX_FAILURES {
            // 达到 10 次：锁定 10 分钟
            self.login_lockouts.insert(
                ip.to_string(),
                now + Duration::from_secs(LOGIN_LOCKOUT_SECS),
            );
            // 清理计数器，以便 10 分钟解封后开始新一轮计次（一直错一直这个重复）
            drop(entry);
            self.login_failures.remove(ip);

            tracing::warn!(
                ip = %ip,
                "Login failed 10 times, locked for 10 minutes"
            );
            "登录错误次数已达 10 次，已锁定 10 分钟，请稍后再试".to_string()
        } else {
            let remaining = LOGIN_MAX_FAILURES - new_count;
            if remaining <= LOGIN_WARN_REMAINING_ATTEMPTS {
                format!("{}（还剩 {} 次尝试机会）", base_err, remaining)
            } else {
                base_err.to_string()
            }
        }
    }

    /// 登录成功后清理失败记录与锁定
    pub fn clear_login_failures(&self, ip: &str) {
        let ip = ip.trim();
        if !ip.is_empty() && ip != "unknown" {
            self.login_failures.remove(ip);
            self.login_lockouts.remove(ip);
        }
    }

    /// 登录尝试限流：同一 IP 每分钟最多 `per_minute` 次（默认 10）。
    pub fn check_login_ip(&self, ip: &str, per_minute: u32) -> bool {
        let limit = per_minute.max(1);
        let limiter = self
            .login_ip_limits
            .entry(ip.to_string())
            .or_insert_with(|| {
                let quota = Quota::per_minute(NonZeroU32::new(limit).unwrap());
                Arc::new(RateLimiter::direct(quota))
            });
        limiter.check().is_ok()
    }

    /// 兑换码 IP 防刷：
    /// - 已封禁：直接拒绝（24 小时）
    /// - 1 分钟内超过 [`REDEEM_IP_MAX_PER_MINUTE`] 次：立即封禁 24 小时
    /// - 每次调用计 1 次（含无效码尝试）
    pub fn check_redeem_ip(&self, ip: &str) -> Result<(), String> {
        const WINDOW_SECS: u64 = 60;
        const REDEEM_IP_MAX_PER_MINUTE: u32 = 20;
        const BAN_SECS: u64 = 24 * 60 * 60;

        let ip = ip.trim();
        if ip.is_empty() || ip == "unknown" {
            return Ok(());
        }

        let now = Instant::now();

        // 清理过期封禁 / 过期窗口，避免内存无限涨
        if self.redeem_ip_bans.len() > 4_096 {
            self.redeem_ip_bans.retain(|_, until| *until > now);
        }
        if self.redeem_ip_windows.len() > 8_192 {
            self.redeem_ip_windows.retain(|_, (_, start)| {
                now.duration_since(*start) <= Duration::from_secs(WINDOW_SECS * 2)
            });
        }

        if let Some(until) = self.redeem_ip_bans.get(ip) {
            if *until > now {
                return Err("当前 IP 因异常兑换请求已被封禁 24 小时，请稍后再试".to_string());
            }
            drop(until);
            self.redeem_ip_bans.remove(ip);
        }

        let mut banned = false;
        {
            let mut entry = self
                .redeem_ip_windows
                .entry(ip.to_string())
                .or_insert((0, now));
            let (count, start) = *entry;
            if now.duration_since(start) > Duration::from_secs(WINDOW_SECS) {
                *entry = (1, now);
            } else {
                let new_count = count.saturating_add(1);
                *entry = (new_count, start);
                if new_count > REDEEM_IP_MAX_PER_MINUTE {
                    banned = true;
                }
            }
        }

        if banned {
            self.redeem_ip_bans
                .insert(ip.to_string(), now + Duration::from_secs(BAN_SECS));
            self.redeem_ip_windows.remove(ip);
            tracing::warn!(
                ip = %ip,
                "Redemption IP banned for 24h due to excessive attempts"
            );
            return Err("当前 IP 因异常兑换请求已被封禁 24 小时，请稍后再试".to_string());
        }

        Ok(())
    }

    pub fn check_rps(&self, token_id: i64, rps: i32) -> bool {
        if rps <= 0 {
            return true;
        }

        let limiter = self.token_rps_limits.entry(token_id).or_insert_with(|| {
            let quota = Quota::per_second(NonZeroU32::new(rps as u32).unwrap());
            Arc::new(RateLimiter::direct(quota))
        });

        limiter.check().is_ok()
    }

    pub fn check_rpm(&self, token_id: i64, rpm: i32) -> bool {
        if rpm <= 0 {
            return true;
        }

        let limiter = self.token_rpm_limits.entry(token_id).or_insert_with(|| {
            let quota = Quota::per_minute(NonZeroU32::new(rpm as u32).unwrap());
            Arc::new(RateLimiter::direct(quota))
        });

        limiter.check().is_ok()
    }

    /// 重度查询限流（如日志列表），同一 key 每分钟最多 `per_minute` 次
    pub fn check_heavy_query(&self, key: &str, per_minute: u32) -> bool {
        let limit = per_minute.max(1);
        let limiter = self
            .logs_query_limits
            .entry(key.to_string())
            .or_insert_with(|| {
                let quota = Quota::per_minute(NonZeroU32::new(limit).unwrap());
                Arc::new(RateLimiter::direct(quota))
            });
        limiter.check().is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_login_failure_warning_threshold() {
        let limiter = GlobalRateLimiter::new();
        let ip = "192.0.2.1";
        let base_err = "用户名或密码错误";

        // 第 1 到 6 次失败（还剩 9 到 4 次），不提示剩余次数
        for _ in 1..=6 {
            let msg = limiter.record_login_failure(ip, base_err);
            assert_eq!(msg, base_err);
        }

        // 第 7 次失败（还剩 3 次），开始提示剩余 3 次
        let msg7 = limiter.record_login_failure(ip, base_err);
        assert_eq!(msg7, format!("{}（还剩 3 次尝试机会）", base_err));

        // 第 8 次失败（还剩 2 次）
        let msg8 = limiter.record_login_failure(ip, base_err);
        assert_eq!(msg8, format!("{}（还剩 2 次尝试机会）", base_err));

        // 第 9 次失败（还剩 1 次）
        let msg9 = limiter.record_login_failure(ip, base_err);
        assert_eq!(msg9, format!("{}（还剩 1 次尝试机会）", base_err));

        // 第 10 次失败，触发锁定
        let msg10 = limiter.record_login_failure(ip, base_err);
        assert!(msg10.contains("已锁定 10 分钟"));
    }
}
