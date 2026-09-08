/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 迁移：`ledger/` 冻结历史 → [`incremental.rs`](incremental.rs) 追加新迁移。
//! 合并旧分支：`python3 scripts/port_legacy_migrations.py --legacy <旧migrations.rs>`
//! 详规：`.cursor/rules/db-migrations.mdc`

use std::collections::HashSet;

pub(crate) mod macros;
pub(crate) use macros::once_migration;

mod helpers;
mod ledger;
mod incremental;

pub async fn run_pg(pool: &sqlx::Pool<sqlx::Postgres>) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sys_migration_history (\
         id TEXT PRIMARY KEY, \
         executed_at TEXT NOT NULL DEFAULT (now()::text))",
    )
    .execute(pool)
    .await
    .ok();

    let mut done: HashSet<String> = sqlx::query_scalar("SELECT id FROM sys_migration_history")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect();

    ledger::run_all(pool, &mut done).await?;
    incremental::run(pool, &mut done).await?;
    tracing::info!("PostgreSQL AnyPool migrations completed successfully");
    Ok(())
}
