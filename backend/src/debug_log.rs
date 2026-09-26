/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 运行时调试日志开关：关不输出；开以 `info` 打到控制台（无需改 RUST_LOG）。
//! 常驻故障用 `tracing::warn`（本环境 `error` 不落控制台/文件）；调用过程用 `relay_debug`。

use std::sync::atomic::{AtomicBool, Ordering};

pub struct Flag(AtomicBool);

impl Flag {
    pub const fn new() -> Self {
        Self(AtomicBool::new(false))
    }

    #[inline]
    pub fn set(&self, on: bool) {
        self.0.store(on, Ordering::Relaxed);
    }

    #[inline]
    pub fn on(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

pub static RELAY: Flag = Flag::new();

#[cfg(feature = "commercial_plugins")]
pub static VOLC_ARK: Flag = Flag::new();

#[macro_export]
macro_rules! debug_info {
    ($flag:expr, $($arg:tt)*) => {
        if $flag.on() {
            tracing::info!($($arg)*);
        }
    };
}

#[macro_export]
macro_rules! debug_warn {
    ($flag:expr, $($arg:tt)*) => {
        if $flag.on() {
            tracing::warn!($($arg)*);
        }
    };
}

#[macro_export]
macro_rules! relay_debug {
    ($($arg:tt)*) => {
        $crate::debug_info!($crate::debug_log::RELAY, $($arg)*)
    };
}
