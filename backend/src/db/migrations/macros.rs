/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/// 索引 DDL 幂等：CREATE 名冲突(23505) / DROP 目录缺口(XX000) 可跳过；不吞业务唯一约束错误。
pub(crate) fn is_idempotent_index_ddl_err(err: &sqlx::Error, stmt: &str) -> bool {
    let sqlx::Error::Database(db) = err else {
        return false;
    };
    // code() 返回临时 Cow，须先绑定再 as_deref，否则临时值提前释放
    let code = db.code();
    let code = code.as_deref();
    let msg = db.message();
    let upper = stmt.to_ascii_uppercase();
    if upper.contains("CREATE INDEX")
        && code == Some("23505")
        && db
            .constraint()
            .map(|c| c == "pg_class_relname_nsp_index")
            .unwrap_or_else(|| msg.contains("pg_class_relname_nsp_index"))
    {
        return true;
    }
    upper.contains("DROP INDEX")
        && code == Some("XX000")
        && msg.contains("pg_attribute catalog is missing")
}

/// 一次性迁移：依赖调用处已加载的 `done`（sys_migration_history），跳过已完成项。
/// 任一句失败则不写入 history，下次启动可重试。
macro_rules! once_migration {
    ($pool:expr, $done:ident, $id:literal, $( $stmt:expr ),+ $(,)?) => {{
        if !$done.contains($id) {
            let mut _m_ok = true;
            $(
                if _m_ok {
                    match sqlx::query($stmt).execute($pool).await {
                        Ok(_) => {}
                        Err(e) if $crate::db::migrations::macros::is_idempotent_index_ddl_err(&e, $stmt) => {
                            tracing::warn!(
                                "⚠️ [Migration] ID: {} 索引 DDL 已满足/目录异常可跳过. 语句: '{}'",
                                $id,
                                $stmt
                            );
                        }
                        Err(e) => {
                            _m_ok = false;
                            tracing::warn!(
                                "❌ [Migration] ID: {} 失败，将不写入 history 以便重试. 语句: '{}' 错误: {:?}",
                                $id,
                                $stmt,
                                e
                            );
                        }
                    }
                }
            )+
            if _m_ok {
                let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ($1)")
                    .bind($id)
                    .execute($pool)
                    .await;
                $done.insert($id.to_string());
                tracing::info!("✅ [Migration] 一次性迁移完成: {}", $id);
            } else {
                tracing::warn!("❌ [Migration] 一次性迁移中止（未标记完成）: {}", $id);
            }
        }
    }};
}

pub(crate) use once_migration;
