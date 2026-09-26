/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use std::collections::HashSet;
use sqlx::PgPool;

#[path = "01_bootstrap.rs"]
mod m01_bootstrap;
#[path = "02_schema_upgrade.rs"]
mod m02_schema_upgrade;
#[path = "03_happyhorse_ha.rs"]
mod m03_happyhorse_ha;
#[path = "04_docs_playground_v1.rs"]
mod m04_docs_playground_v1;
#[path = "05_volc_monitor_cleanup.rs"]
mod m05_volc_monitor_cleanup;
#[path = "06_redemptions_channels_time.rs"]
mod m06_redemptions_channels_time;
#[path = "07_logs_indexes.rs"]
mod m07_logs_indexes;
#[path = "08_pg2026_portal_marketing.rs"]
mod m08_pg2026_portal_marketing;
#[path = "09_data_sync_forward_rules.rs"]
mod m09_data_sync_forward_rules;
#[path = "10_comfyui_tail.rs"]
mod m10_comfyui_tail;

pub async fn run_all(pool: &PgPool, done: &mut HashSet<String>) -> anyhow::Result<()> {
    m01_bootstrap::run(pool, done).await?;
    m02_schema_upgrade::run(pool, done).await?;
    m03_happyhorse_ha::run(pool, done).await?;
    m04_docs_playground_v1::run(pool, done).await?;
    m05_volc_monitor_cleanup::run(pool, done).await?;
    m06_redemptions_channels_time::run(pool, done).await?;
    m07_logs_indexes::run(pool, done).await?;
    m08_pg2026_portal_marketing::run(pool, done).await?;
    m09_data_sync_forward_rules::run(pool, done).await?;
    m10_comfyui_tail::run(pool, done).await?;
    Ok(())
}
