/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

pub(crate) async fn seed_playground_2026_quick_bar(pool: &sqlx::Pool<sqlx::Postgres>) -> anyhow::Result<u64> {
    use crate::api::plugins::manager::quick_bar_seed::{
        seed_imagine_quick_bar_overrides, seed_imagine_quick_bar_schemes,
    };

    let mut updated = 0u64;
    let schemes_raw: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .fetch_optional(pool)
    .await?;

    let mut scheme_params_by_id: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    if let Some(raw) = schemes_raw {
        if let Ok(mut schemes) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
            let changed = seed_imagine_quick_bar_schemes(&mut schemes);
            for s in &schemes {
                if let (Some(id), Some(params)) = (
                    s.get("id").and_then(|v| v.as_str()),
                    s.get("params").and_then(|v| v.as_array()),
                ) {
                    scheme_params_by_id.insert(id.to_string(), params.clone());
                }
            }
            if changed {
                let next = serde_json::to_string(&schemes)?;
                sqlx::query(
                    "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
                     WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
                )
                .bind(&next)
                .execute(pool)
                .await?;
                updated += 1;
            }
        }
    }

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT config_key, config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' \
           AND (config_key LIKE 'pg_model_id_%' OR (config_key LIKE 'pg_model_%' AND config_key NOT LIKE 'pg_model_id_%'))",
    )
    .fetch_all(pool)
    .await?;

    for (key, val) in rows {
        let Ok(mut conf) = serde_json::from_str::<serde_json::Value>(&val) else {
            continue;
        };
        if !conf.get("param_overrides").is_some_and(|v| v.is_object()) {
            continue;
        }
        let scheme_id = conf
            .get("scheme_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let scheme_params = scheme_params_by_id
            .get(scheme_id)
            .cloned()
            .unwrap_or_default();
        let changed = conf
            .get_mut("param_overrides")
            .is_some_and(|overrides| seed_imagine_quick_bar_overrides(overrides, &scheme_params));
        if !changed {
            continue;
        }
        let next = serde_json::to_string(&conf)?;
        sqlx::query(
            "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
             WHERE plugin_name = 'playground_2026' AND config_key = $2",
        )
        .bind(&next)
        .bind(&key)
        .execute(pool)
        .await?;
        updated += 1;
    }

    Ok(updated)
}

/// 创作中心2026：历史迁移占位（Seedream 5.0 不支持图层拆分）
pub(crate) async fn seed_playground_2026_layer_decomposition(
    _pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    Ok(0)
}

/// 创作中心2026：移除 Seedream 5.0 方案中的 layer_decomposition（图层拆分仅 Pro 支持）
pub(crate) async fn remove_playground_2026_seedream_5_0_layer_decomposition(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    let mut updated = 0u64;
    let schemes_raw: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .fetch_optional(pool)
    .await?;

    if let Some(raw) = schemes_raw {
        if let Ok(mut schemes) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
            let mut changed = false;
            for s in schemes.iter_mut() {
                if s.get("id").and_then(|v| v.as_str()) == Some("seedream_5_0") {
                    if let Some(params) = s.get_mut("params").and_then(|v| v.as_array_mut()) {
                        let len_before = params.len();
                        params.retain(|p| {
                            p.get("key").and_then(|v| v.as_str()) != Some("layer_decomposition")
                        });
                        if params.len() != len_before {
                            changed = true;
                        }
                    }
                }
            }
            if changed {
                let next = serde_json::to_string(&schemes)?;
                sqlx::query(
                    "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
                     WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
                )
                .bind(&next)
                .execute(pool)
                .await?;
                updated += 1;
            }
        }
    }

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT config_key, config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' \
           AND (config_key LIKE 'pg_model_id_%' OR (config_key LIKE 'pg_model_%' AND config_key NOT LIKE 'pg_model_id_%'))",
    )
    .fetch_all(pool)
    .await?;

    for (key, val) in rows {
        let Ok(mut conf) = serde_json::from_str::<serde_json::Value>(&val) else {
            continue;
        };
        let scheme_id = conf
            .get("scheme_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if scheme_id != "seedream_5_0" {
            continue;
        }
        let Some(overrides) = conf.get_mut("param_overrides").and_then(|v| v.as_object_mut()) else {
            continue;
        };
        let mut model_changed = false;
        if let Some(modify) = overrides.get_mut("modify").and_then(|v| v.as_object_mut()) {
            if modify.remove("layer_decomposition").is_some() {
                model_changed = true;
            }
        }
        if let Some(remove) = overrides.get_mut("remove").and_then(|v| v.as_array_mut()) {
            let before_len = remove.len();
            remove.retain(|v| v.as_str() != Some("layer_decomposition"));
            if remove.len() != before_len {
                model_changed = true;
            }
        }
        if let Some(add) = overrides.get_mut("add").and_then(|v| v.as_array_mut()) {
            let before_len = add.len();
            add.retain(|p| p.get("key").and_then(|v| v.as_str()) != Some("layer_decomposition"));
            if add.len() != before_len {
                model_changed = true;
            }
        }
        if model_changed {
            let next = serde_json::to_string(&conf)?;
            sqlx::query(
                "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
                 WHERE plugin_name = 'playground_2026' AND config_key = $2",
            )
            .bind(&next)
            .bind(&key)
            .execute(pool)
            .await?;
            updated += 1;
        }
    }

    Ok(updated)
}

/// 创作中心：Seedance 2.0 方案时长默认改为 slider 滑块（min: 4, max: 15, step: 1, default: 5, unit: "秒"）
pub(crate) async fn seed_playground_seedance2_slider(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    let mut updated = 0u64;
    for plugin_name in &["playground_2026", "playground"] {
        let schemes_raw: Option<String> = sqlx::query_scalar(
            "SELECT config_value FROM plugin_configs \
             WHERE plugin_name = $1 AND config_key = 'pg_schemes'",
        )
        .bind(plugin_name)
        .fetch_optional(pool)
        .await?;

        if let Some(raw) = schemes_raw {
            if let Ok(mut schemes) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                let mut changed = false;
                for s in &mut schemes {
                    if s.get("id").and_then(|v| v.as_str()) == Some("seedance2.0") {
                        if let Some(params) = s.get_mut("params").and_then(|p| p.as_array_mut()) {
                            for p in params {
                                if p.get("key").and_then(|v| v.as_str()) == Some("duration") {
                                    if let Some(obj) = p.as_object_mut() {
                                        obj.insert("type".into(), serde_json::json!("slider"));
                                        obj.insert("data_type".into(), serde_json::json!("integer"));
                                        obj.insert("min".into(), serde_json::json!(4));
                                        obj.insert("max".into(), serde_json::json!(15));
                                        obj.insert("step".into(), serde_json::json!(1));
                                        obj.insert("default".into(), serde_json::json!(5));
                                        obj.insert("unit".into(), serde_json::json!("秒"));
                                        obj.remove("options");
                                        changed = true;
                                    }
                                }
                                if p.get("key").and_then(|v| v.as_str()) == Some("resolution") {
                                    if let Some(obj) = p.as_object_mut() {
                                        obj.insert("default".into(), serde_json::json!("480p"));
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }
                if changed {
                    let next = serde_json::to_string(&schemes)?;
                    sqlx::query(
                        "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
                         WHERE plugin_name = $2 AND config_key = 'pg_schemes'",
                    )
                    .bind(&next)
                    .bind(plugin_name)
                    .execute(pool)
                    .await?;
                    updated += 1;
                }
            }
        }
    }
    Ok(updated)
}

/// 创作中心：Seedance 2.0 方案删除反向提示词（不显示且不支持）
pub(crate) async fn strip_playground_seedance2_negative_prompt(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    let mut updated = 0u64;
    for plugin_name in &["playground_2026", "playground"] {
        let schemes_raw: Option<String> = sqlx::query_scalar(
            "SELECT config_value FROM plugin_configs \
             WHERE plugin_name = $1 AND config_key = 'pg_schemes'",
        )
        .bind(plugin_name)
        .fetch_optional(pool)
        .await?;

        if let Some(raw) = schemes_raw {
            if let Ok(mut schemes) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                let mut changed = false;
                for s in &mut schemes {
                    if s.get("id").and_then(|v| v.as_str()) == Some("seedance2.0") {
                        if let Some(inputs) = s.get_mut("inputs").and_then(|p| p.as_array_mut()) {
                            let len_before = inputs.len();
                            inputs.retain(|p| {
                                let key = p.get("key").and_then(|v| v.as_str());
                                let bind_key = p.get("bind_key").and_then(|v| v.as_str());
                                key != Some("negative_prompt") && bind_key != Some("negative_prompt")
                            });
                            if inputs.len() != len_before {
                                changed = true;
                            }
                        }
                    }
                }
                if changed {
                    let next = serde_json::to_string(&schemes)?;
                    sqlx::query(
                        "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
                         WHERE plugin_name = $2 AND config_key = 'pg_schemes'",
                    )
                    .bind(&next)
                    .bind(plugin_name)
                    .execute(pool)
                    .await?;
                    updated += 1;
                }
            }
        }
    }
    Ok(updated)
}

/// 创作中心2026：四个 Seedream 图片方案写入火山文档「图像输出尺寸」
pub(crate) async fn seed_playground_2026_seedream_pro_image_special(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    use crate::api::plugins::manager::seedream_5_0_pro_seed::seed_seedream_official_image_special;

    let schemes_raw: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .fetch_optional(pool)
    .await?;

    let Some(raw) = schemes_raw else {
        return Ok(0);
    };
    let mut schemes: Vec<serde_json::Value> = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Ok(0),
    };
    if !seed_seedream_official_image_special(&mut schemes) {
        return Ok(0);
    }
    let next = serde_json::to_string(&schemes)?;
    sqlx::query(
        "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .bind(&next)
    .execute(pool)
    .await?;
    Ok(1)
}

/// 创作中心2026：gpt-image-2 模型属性中文对照与描述菜单本地化同步
pub(crate) async fn seed_playground_2026_gpt_image_2_localization(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    use crate::api::plugins::manager::gpt_image_2_seed::seed_gpt_image_2_scheme;

    let schemes_raw: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .fetch_optional(pool)
    .await?;

    let Some(raw) = schemes_raw else {
        return Ok(0);
    };
    let mut schemes: Vec<serde_json::Value> = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Ok(0),
    };
    if !seed_gpt_image_2_scheme(&mut schemes) {
        return Ok(0);
    }
    let next = serde_json::to_string(&schemes)?;
    sqlx::query(
        "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .bind(&next)
    .execute(pool)
    .await?;
    Ok(1)
}

