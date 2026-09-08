/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Backend plugins — mirrors `frontend/src/pages/Plugins/`.
//! Each plugin lives in its own folder (code + i18n/docs resources).
//!
//! Layout (aligned with frontend):
//! - `manager/`              → PluginConfig / PluginsList / ModelMarketplace（扩展规范见 manager/mod.rs 模块注释）
//! - `docs_api/`             → DocsApi (+ `default_docs/` markdown)
//! - `playground/`           → Playground
//! - `playground_2026/`      → Playground_2026
//! - `assets/`               → AssetManager / UserAssets
//! - `site_portal/`          → SitePortal
//! - `site_portal_pro/`      → SitePortalPro (+ `docs`)
//! - `team_marketing/`       → TeamMarketing
//! - `upstream_asset_relay/` → UpstreamAssetRelay
//! - `volc_ark_monitor/`     → VolcengineArkMonitor
//! - `comfyui_bridge/`       → ComfyUiBridge
//! - `content_security/`     → ContentSecurity
//! - `site_icons/`           → SiteIcons
//! - `data_sync/`            → DataSync
//! - `finance/` / `pay/`（含 `pay/payment/` 渠道客户端）/ `redemptions/` → 可选插件（目录存在即编译）

// Plugin manager (marketplace / config / TOS / Volc)
pub(crate) mod manager;
pub use manager::*;

// Always-on plugins
pub mod docs_api;
pub mod playground;

// Feature-gated plugins
#[cfg(feature = "commercial_plugins")]
pub mod assets;
#[cfg(feature = "commercial_plugins")]
pub mod playground_2026;
#[cfg(feature = "commercial_plugins")]
pub mod site_portal_pro;
#[cfg(feature = "commercial_plugins")]
pub use site_portal_pro::docs as site_portal_pro_docs;
#[cfg(all(feature = "commercial_plugins", plugin_team_marketing))]
pub mod team_marketing;
#[cfg(feature = "commercial_plugins")]
pub mod upstream_asset_relay;
#[cfg(feature = "commercial_plugins")]
pub mod volc_ark_monitor;

#[cfg(feature = "plugin_content_security")]
pub mod content_security;

#[cfg(feature = "plugin_comfyui")]
pub mod comfyui_bridge;
#[cfg(feature = "plugin_data_sync")]
pub mod data_sync;
#[cfg(feature = "plugin_site_icons")]
pub mod site_icons;
#[cfg(feature = "plugin_site_portal")]
pub mod site_portal;

// Optional plugins (presence detected by build.rs → rustc-cfg)
#[cfg(plugin_finance)]
pub mod finance;
#[cfg(all(plugin_pay, plugin_payment))]
pub mod pay;
#[cfg(plugin_redemptions)]
pub mod redemptions;
