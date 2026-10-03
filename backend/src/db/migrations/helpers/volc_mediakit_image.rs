/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 火山 MediaKit 图像工具：计费、转发、模型行。幂等，迁移与插件开启共用。

use sqlx::PgPool;

const ENHANCE_BILLING: &str = "火山 MediaKit 图像画质增强";
const REMOVE_BG_BILLING: &str = "火山 MediaKit 图像背景移除";
const ENHANCE_BILLING_PID: &str = "78243";
const REMOVE_BG_BILLING_PID: &str = "78244";
const ENHANCE_FORWARD: &str = "火山 MediaKit 图像画质增强";
const REMOVE_BG_FORWARD: &str = "火山 MediaKit 图像背景移除";
const ENHANCE_FORWARD_JSON: &str = r#"{"target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/images/generations","new":"/api/v1/tools-sync/enhance-image"},"auth_type":"bearer"}"#;
const REMOVE_BG_FORWARD_JSON: &str = r#"{"target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/images/generations","new":"/api/v1/tools-sync/remove-image-background"},"auth_type":"bearer"}"#;
const TYPE_NAME: &str = "画质增强";
const ORIGINAL_ID: &str = "画质增强";
const PRESET_REMARK: &str = "系统预设";
const VOLC_LOGO: &str = "volcengine";
const TYPE_REMARK: &str = "画质增强、字幕擦除与图像背景移除处理模型";

async fn unify_enhance_type(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"UPDATE model_types SET
             name = '画质增强',
             name_en = CASE WHEN name_en IS NULL OR name_en = '' OR name_en = 'Video Enhancement'
                            THEN 'Quality Enhancement' ELSE name_en END,
             remark = CASE WHEN remark IS NULL OR remark = '' OR remark = '视频画质增强与字幕擦除处理模型'
                           THEN $1 ELSE remark END,
             is_system = 1
           WHERE name = '视频增强'
             AND NOT EXISTS (SELECT 1 FROM model_types WHERE name = '画质增强')"#,
    )
    .bind(TYPE_REMARK)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"INSERT INTO model_types (name, name_en, sort_order, is_active, is_system, logo, remark)
           SELECT '画质增强', 'Quality Enhancement', 35, 1, 1, 'volcengine', $1
           WHERE NOT EXISTS (SELECT 1 FROM model_types WHERE name = '画质增强')"#,
    )
    .bind(TYPE_REMARK)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"UPDATE model_types SET
             name_en = CASE WHEN name_en IS NULL OR name_en = '' THEN 'Quality Enhancement' ELSE name_en END,
             logo = CASE WHEN logo IS NULL OR logo = '' THEN 'volcengine' ELSE logo END,
             remark = CASE WHEN remark IS NULL OR remark = '' THEN $1 ELSE remark END,
             is_system = 1
           WHERE name = '画质增强'"#,
    )
    .bind(TYPE_REMARK)
    .execute(pool)
    .await?;

    let enhance_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM model_types WHERE name = '画质增强' LIMIT 1")
            .fetch_optional(pool)
            .await?;
    let Some(enhance_id) = enhance_id else {
        return Ok(());
    };
    for old in ["图像增强", "视频增强"] {
        sqlx::query(
            "UPDATE models SET type_id = $1 WHERE type_id IN (SELECT id FROM model_types WHERE name = $2)",
        )
        .bind(enhance_id)
        .bind(old)
        .execute(pool)
        .await?;
        sqlx::query(
            "UPDATE model_library SET type_id = $1 WHERE type_id IN (SELECT id FROM model_types WHERE name = $2)",
        )
        .bind(enhance_id)
        .bind(old)
        .execute(pool)
        .await?;
        sqlx::query(
            "UPDATE billing_rules SET type_id = $1 WHERE type_id IN (SELECT id FROM model_types WHERE name = $2)",
        )
        .bind(enhance_id)
        .bind(old)
        .execute(pool)
        .await?;
    }
    sqlx::query(
        "UPDATE models SET original_id = '画质增强' WHERE original_id IN ('视频增强', '图像增强')",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE model_library SET original_id = '画质增强' WHERE original_id IN ('视频增强', '图像增强')",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE forward_rules SET category = '画质增强' WHERE category IN ('视频增强', '图像增强')",
    )
    .execute(pool)
    .await?;
    sqlx::query("DELETE FROM model_types WHERE name IN ('图像增强', '视频增强')")
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn seed(pool: &PgPool) -> anyhow::Result<()> {
    unify_enhance_type(pool).await?;
    let volc_provider_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM model_providers WHERE name = '火山引擎' LIMIT 1")
            .fetch_optional(pool)
            .await?;
    let volc_api_provider_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM model_api_providers WHERE name ILIKE '%火山%' OR name ILIKE '%volcengine%' LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    let image_enhance_type_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM model_types WHERE name = $1 LIMIT 1")
            .bind(TYPE_NAME)
            .fetch_optional(pool)
            .await?;

    for (name, rate, pid) in [
        (ENHANCE_BILLING, 0.006_f64, ENHANCE_BILLING_PID),
        (REMOVE_BG_BILLING, 0.006_f64, REMOVE_BG_BILLING_PID),
    ] {
        sqlx::query(
            r#"INSERT INTO billing_rules (
                name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate,
                billing_rule, pricing_tiers, extended_config, is_system, pid, provider_id, type_id
            ) SELECT $1, 'requests', 0.0, 0.0, $2, 0.0, 'standard', '[]', '{}', 1, $5, $3, $4
            WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = $1)"#,
        )
        .bind(name)
        .bind(rate)
        .bind(volc_provider_id)
        .bind(image_enhance_type_id)
        .bind(pid)
        .execute(pool)
        .await?;
        sqlx::query(
            r#"UPDATE billing_rules SET pid = $1
               WHERE name = $2 AND (pid LIKE '6%' OR pid = '' OR pid IS NULL)"#,
        )
        .bind(pid)
        .bind(name)
        .execute(pool)
        .await?;
    }
    if let Some(tid) = image_enhance_type_id {
        sqlx::query("UPDATE billing_rules SET type_id = $1 WHERE name IN ($2, $3)")
            .bind(tid)
            .bind(ENHANCE_BILLING)
            .bind(REMOVE_BG_BILLING)
            .execute(pool)
            .await?;
    }

    for (name, desc, config) in [
        (
            ENHANCE_FORWARD,
            "火山图像画质增强同步转发，改写为 MediaKit tools-sync/enhance-image。",
            ENHANCE_FORWARD_JSON,
        ),
        (
            REMOVE_BG_FORWARD,
            "火山图像背景移除同步转发，改写为 MediaKit tools-sync/remove-image-background。",
            REMOVE_BG_FORWARD_JSON,
        ),
    ] {
        sqlx::query(
            r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
             SELECT $1, 'volcengine', $2, $3, '画质增强', 1,
                    '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
             WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = $1)"#,
        )
        .bind(name)
        .bind(desc)
        .bind(config)
        .execute(pool)
        .await?;
    }
    sqlx::query(r#"UPDATE forward_rules SET category = '画质增强' WHERE name IN ($1, $2)"#)
        .bind(ENHANCE_FORWARD)
        .bind(REMOVE_BG_FORWARD)
        .execute(pool)
        .await?;

    ensure_enhance_library_catalog(pool).await?;

    Ok(())
}

const IMAGE_TOOL_MIDS: [&str; 2] = ["vie-en", "vir-bg"];
const MEDIAKIT_HINTS: [&str; 8] = [
    "vie-en", "vir-bg", "vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep",
];

fn models_json_is_open(raw: &str) -> bool {
    raw.trim() == "[]"
}

fn channel_hosts_mediakit(models_json: &str, base_url: &str, config_json: &str) -> bool {
    let models = models_json.to_ascii_lowercase();
    if MEDIAKIT_HINTS.iter().any(|mid| models.contains(mid)) {
        return true;
    }
    if base_url.to_ascii_lowercase().contains("mediakit") {
        return true;
    }
    config_json.contains("volcengine_enhance_credential_id")
}

fn append_image_tool_mids(models_json: &str) -> Option<String> {
    if models_json_is_open(models_json) {
        return None;
    }
    let mut list: Vec<String> = serde_json::from_str(models_json).ok()?;
    let mut changed = false;
    for mid in IMAGE_TOOL_MIDS {
        if !list.iter().any(|m| m == mid) {
            list.push(mid.to_string());
            changed = true;
        }
    }
    if !changed {
        return None;
    }
    serde_json::to_string(&list).ok()
}

/// 创作中心2026 图片编辑页：激活两条图像工具、打开编辑入口、把 mid 写进已有 MediaKit 渠道。
pub async fn activate_for_pg2026_edit(pool: &PgPool) -> anyhow::Result<()> {
    seed(pool).await?;

    sqlx::query(
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('playground_2026', 'image_edit_enabled', 'true', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO UPDATE
           SET config_value = 'true', updated_at = CURRENT_TIMESTAMP"#,
    )
    .execute(pool)
    .await?;

    let channels: Vec<(i64, String, String, String)> =
        sqlx::query_as("SELECT id, models, base_url, config FROM channels")
            .fetch_all(pool)
            .await?;

    let mut patched = 0usize;
    for (id, models, base_url, config) in &channels {
        if !channel_hosts_mediakit(models, base_url, config) {
            continue;
        }
        let Some(next) = append_image_tool_mids(models) else {
            if models_json_is_open(models) || IMAGE_TOOL_MIDS.iter().all(|mid| models.contains(mid))
            {
                patched += 1;
            }
            continue;
        };
        sqlx::query(
            "UPDATE channels SET models = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        )
        .bind(&next)
        .bind(id)
        .execute(pool)
        .await?;
        patched += 1;
    }

    if patched == 0 {
        ensure_mediakit_image_channel(pool).await?;
    }

    Ok(())
}

async fn ensure_mediakit_image_channel(pool: &PgPool) -> anyhow::Result<()> {
    let keys_raw: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM plugin_configs \
         WHERE plugin_name = 'volcengine_enhance' AND config_key = 'keys'",
    )
    .fetch_optional(pool)
    .await?;
    let Some(keys_raw) = keys_raw else {
        tracing::warn!(
            "pg2026_volc_image_edit_ready：没有 MediaKit 渠道，也没有插件凭证，未自动建渠"
        );
        return Ok(());
    };
    let keys: Vec<serde_json::Value> = serde_json::from_str(&keys_raw).unwrap_or_default();
    let Some(first) = keys.first() else {
        tracing::warn!("pg2026_volc_image_edit_ready：插件 keys 为空，未自动建渠");
        return Ok(());
    };
    let cred_id = first.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if cred_id.is_empty() {
        tracing::warn!("pg2026_volc_image_edit_ready：插件凭证缺少 id，未自动建渠");
        return Ok(());
    }
    let base_url = first
        .get("base_url")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("https://mediakit.cn-beijing.volces.com");
    let models = serde_json::to_string(&IMAGE_TOOL_MIDS)?;
    let config = serde_json::json!({ "volcengine_enhance_credential_id": cred_id }).to_string();
    sqlx::query(
        r#"INSERT INTO channels (
                name, provider_type, base_url, api_key, models, model_mapping,
                user_groups, exclude_user_groups, config, status, weight, priority, sort_order, rate,
                created_at, updated_at
           )
           SELECT
                '火山 MediaKit 图像工具', 'volcengine', $1, '', $2, '{}',
                '[]', '[]', $3, 1, 1, 0, 10, 1.0,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           WHERE NOT EXISTS (
                SELECT 1 FROM channels
                WHERE models LIKE '%vie-en%'
                   OR models LIKE '%vir-bg%'
                   OR config LIKE '%volcengine_enhance_credential_id%'
                   OR lower(base_url) LIKE '%mediakit%'
           )"#,
    )
    .bind(base_url)
    .bind(&models)
    .bind(&config)
    .execute(pool)
    .await?;
    Ok(())
}

const ENHANCE_MIDS: [&str; 8] = [
    "vve-sd", "vve-pf", "vve-ft", "vve-gt", "vvs-er", "vvs-ep", "vie-en", "vir-bg",
];

/// mid、计费规则名、稳定 PID。空 pid / 6 开头才回填，已有 7 开头不改。
pub const PRESET_BILLING: &[(&str, &str, &str)] = &[
    ("vve-sd", "火山 MediaKit 视频画质增强 (标准版)", "78245"),
    ("vve-pf", "火山 MediaKit 视频画质增强 (专业版)", "78246"),
    ("vve-ft", "火山 MediaKit 视频画质增强 (极速版)", "78247"),
    ("vve-gt", "火山 MediaKit 视频画质增强 (大模型版)", "78248"),
    ("vvs-er", "火山 MediaKit 视频字幕擦除 (标准版)", "78249"),
    ("vvs-ep", "火山 MediaKit 视频字幕擦除 (精细版)", "78250"),
    ("vie-en", ENHANCE_BILLING, ENHANCE_BILLING_PID),
    ("vir-bg", REMOVE_BG_BILLING, REMOVE_BG_BILLING_PID),
];

/// 计费配置列表：插件关闭时收起全部 MediaKit / 级联规则；插件开启时全部留下，规则自身禁用也不收起。
/// `include_key` 是编辑页带上的 pid 或 id，插件关闭时仍能打开被收起的那一条。
pub fn billing_rule_listed(
    name: &str,
    pid: &str,
    rule_kind: &str,
    rule_id: i64,
    plugin_on: bool,
    include_key: Option<&str>,
) -> bool {
    if let Some(key) = include_key.map(str::trim).filter(|s| !s.is_empty()) {
        if key == pid || key == rule_id.to_string() {
            return true;
        }
    }
    if plugin_on {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    !(lower.contains("mediakit")
        || rule_kind == "volc_enhance_cascade"
        || pid == "78242"
        || name == "火山级联画质增强默认计费")
}

pub async fn backfill_preset_billing_pids(pool: &PgPool) -> anyhow::Result<()> {
    for (_, name, pid) in PRESET_BILLING {
        sqlx::query(
            r#"UPDATE billing_rules SET pid = $1
               WHERE name = $2 AND (pid LIKE '6%' OR pid = '' OR pid IS NULL)"#,
        )
        .bind(*pid)
        .bind(*name)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// 八条预置模型对应的计费 PID。规则还没落库时用稳定 PID，编辑页仍能打开。
pub async fn load_preset_billing_pids(pool: &PgPool) -> anyhow::Result<serde_json::Value> {
    let _ = backfill_preset_billing_pids(pool).await;
    let names: Vec<String> = PRESET_BILLING.iter().map(|row| row.1.to_string()).collect();
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT name, COALESCE(pid, '') FROM billing_rules WHERE name = ANY($1)")
            .bind(&names)
            .fetch_all(pool)
            .await?;
    let mut map = serde_json::Map::new();
    for (mid, name, fallback) in PRESET_BILLING {
        let pid = rows
            .iter()
            .find(|(rule_name, _)| rule_name == name)
            .map(|(_, pid)| pid.trim())
            .filter(|pid| !pid.is_empty())
            .unwrap_or(fallback);
        map.insert((*mid).to_string(), serde_json::Value::String(pid.to_string()));
    }
    Ok(serde_json::Value::Object(map))
}

const ENHANCE_PRESETS: &[(&str, &str, &str, &str, &str)] = &[
    (
        "vve-sd",
        "火山画质增强-标准版",
        "volc_video_enhance_standard",
        "火山 MediaKit 视频画质增强 (标准/专业版)",
        "火山 MediaKit 视频画质增强 (标准版)",
    ),
    (
        "vve-pf",
        "火山画质增强-专业版",
        "volc_video_enhance_professional",
        "火山 MediaKit 视频画质增强 (标准/专业版)",
        "火山 MediaKit 视频画质增强 (专业版)",
    ),
    (
        "vve-ft",
        "火山画质增强-极速版",
        "volc_video_enhance_fast",
        "火山 MediaKit 视频画质增强 (极速版)",
        "火山 MediaKit 视频画质增强 (极速版)",
    ),
    (
        "vve-gt",
        "火山画质增强-大模型版",
        "volc_video_enhance_generative",
        "火山 MediaKit 视频画质增强 (大模型版)",
        "火山 MediaKit 视频画质增强 (大模型版)",
    ),
    (
        "vvs-er",
        "火山字幕擦除-标准版",
        "volc_video_subtitle_erase",
        "火山 MediaKit 视频字幕擦除",
        "火山 MediaKit 视频字幕擦除 (标准版)",
    ),
    (
        "vvs-ep",
        "火山字幕擦除-精细版",
        "volc_video_subtitle_erase_pro",
        "火山 MediaKit 视频字幕擦除",
        "火山 MediaKit 视频字幕擦除 (精细版)",
    ),
    (
        "vie-en",
        "火山图像画质增强",
        "volc_image_enhance",
        ENHANCE_FORWARD,
        ENHANCE_BILLING,
    ),
    (
        "vir-bg",
        "火山图像背景移除",
        "volc_image_remove_bg",
        REMOVE_BG_FORWARD,
        REMOVE_BG_BILLING,
    ),
];

async fn lookup_named_id(pool: &PgPool, sql: &str, name: &str) -> Option<i64> {
    sqlx::query_scalar::<_, i64>(sql)
        .bind(name)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// 八条 MediaKit 预置模型补进模型仓库，分类固定为「画质增强」。已有目录行不覆盖。
pub async fn ensure_enhance_library_catalog(pool: &PgPool) -> anyhow::Result<()> {
    unify_enhance_type(pool).await?;
    let type_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM model_types WHERE name = '画质增强' LIMIT 1")
            .fetch_optional(pool)
            .await?;
    let provider_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM model_providers WHERE name = '火山引擎' LIMIT 1")
            .fetch_optional(pool)
            .await?;
    let api_provider_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM model_api_providers WHERE name ILIKE '%火山%' OR name ILIKE '%volcengine%' LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    for mid in ENHANCE_MIDS {
        sqlx::query(
            r#"INSERT INTO model_library (
                    mid, name, model_id, original_id, model_id_alias,
                    provider_id, api_provider_id, type_id, group_ratios, billing_rule_id,
                    pre_deduction, is_active, forward_rule_ids, enable_log_content,
                    site_discount, site_discount_enabled, global_discount, global_discount_enabled,
                    logo, remark, description, feature_attributes, is_system, sort_order,
                    created_at, updated_at
               )
               SELECT
                    mid, name, model_id, COALESCE(NULLIF(original_id, ''), '画质增强'), model_id_alias,
                    provider_id, api_provider_id, type_id, group_ratios, billing_rule_id,
                    pre_deduction, is_active, forward_rule_ids, enable_log_content,
                    site_discount, site_discount_enabled, global_discount, global_discount_enabled,
                    logo, remark, description, feature_attributes, 1, sort_order,
                    created_at, updated_at
               FROM models
               WHERE mid = $1
                 AND NOT EXISTS (SELECT 1 FROM model_library WHERE mid = $1)"#,
        )
        .bind(mid)
        .execute(pool)
        .await?;
    }

    for (mid, name, model_id, forward_name, billing_name) in ENHANCE_PRESETS {
        let exists: bool = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM model_library WHERE mid = $1)",
        )
        .bind(mid)
        .fetch_one(pool)
        .await?;
        if exists {
            continue;
        }
        let billing_id = lookup_named_id(
            pool,
            "SELECT id FROM billing_rules WHERE name = $1 LIMIT 1",
            billing_name,
        )
        .await;
        let forward_id = lookup_named_id(
            pool,
            "SELECT id FROM forward_rules WHERE name = $1 LIMIT 1",
            forward_name,
        )
        .await;
        let forward_ids = forward_id.map(|id| format!("[{id}]"));
        sqlx::query(
            r#"INSERT INTO model_library (
                    mid, name, model_id, original_id, provider_id, api_provider_id, type_id,
                    billing_rule_id, forward_rule_ids, is_active, is_system, logo, remark,
                    created_at, updated_at
               )
               VALUES (
                    $1, $2, $3, '画质增强', $4, $5, $6, $7, $8, 0, 1, 'volcengine', '系统预设',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
               )
               ON CONFLICT (mid) DO NOTHING"#,
        )
        .bind(mid)
        .bind(name)
        .bind(model_id)
        .bind(provider_id)
        .bind(api_provider_id)
        .bind(type_id)
        .bind(billing_id)
        .bind(forward_ids)
        .execute(pool)
        .await?;
    }

    let mids: Vec<String> = ENHANCE_MIDS.iter().map(|m| (*m).to_string()).collect();
    sqlx::query(
        r#"UPDATE model_library
           SET type_id = COALESCE($1, type_id),
               original_id = '画质增强',
               updated_at = CURRENT_TIMESTAMP
           WHERE mid = ANY($2)"#,
    )
    .bind(type_id)
    .bind(&mids)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"UPDATE models
           SET type_id = COALESCE($1, type_id),
               original_id = '画质增强',
               updated_at = CURRENT_TIMESTAMP
           WHERE mid = ANY($2)"#,
    )
    .bind(type_id)
    .bind(&mids)
    .execute(pool)
    .await?;
    Ok(())
}

const PRESET_FORWARDS: &[(&str, &str)] = &[
    (
        "火山 MediaKit 视频画质增强 (标准/专业版)",
        r#"{"target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/enhance-video"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#,
    ),
    (
        "火山 MediaKit 视频画质增强 (极速版)",
        r#"{"target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/enhance-video-fast"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#,
    ),
    (
        "火山 MediaKit 视频画质增强 (大模型版)",
        r#"{"target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/enhance-video-generative"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#,
    ),
    (
        "火山 MediaKit 视频字幕擦除",
        r#"{"target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/erase-video-subtitle"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#,
    ),
    (ENHANCE_FORWARD, ENHANCE_FORWARD_JSON),
    (REMOVE_BG_FORWARD, REMOVE_BG_FORWARD_JSON),
];

/// 插件关掉再打开：八条模型回到模型仓库，计费和转发写回各自那一条预设，不另建副本。
pub async fn refresh_presets_on_enable(pool: &PgPool) -> anyhow::Result<()> {
    crate::api::billing_rules::restore_volc_preset_billing(pool).await?;
    backfill_preset_billing_pids(pool).await?;
    for (name, config) in PRESET_FORWARDS {
        sqlx::query(
            r#"UPDATE forward_rules
               SET config_json = $1, is_active = 1, updated_at = CURRENT_TIMESTAMP
               WHERE name = $2"#,
        )
        .bind(*config)
        .bind(*name)
        .execute(pool)
        .await?;
    }
    let preset_mids: Vec<String> = ENHANCE_PRESETS.iter().map(|row| row.0.to_string()).collect();
    let preset_model_ids: Vec<String> = ENHANCE_PRESETS.iter().map(|row| row.2.to_string()).collect();
    sqlx::query(
        r#"UPDATE models
           SET is_active = 1,
               is_listed = 0,
               is_system = 0,
               updated_at = CURRENT_TIMESTAMP
           WHERE mid = ANY($1) OR library_mid = ANY($1) OR model_id = ANY($2)"#,
    )
    .bind(&preset_mids)
    .bind(&preset_model_ids)
    .execute(pool)
    .await?;

    for (mid, _, model_id, forward_name, billing_name) in ENHANCE_PRESETS {
        let billing_id = lookup_named_id(
            pool,
            "SELECT id FROM billing_rules WHERE name = $1 LIMIT 1",
            billing_name,
        )
        .await;
        let forward_id = lookup_named_id(
            pool,
            "SELECT id FROM forward_rules WHERE name = $1 LIMIT 1",
            forward_name,
        )
        .await;
        let forward_ids = forward_id.map(|id| format!("[{id}]"));
        sqlx::query(
            r#"UPDATE model_library
               SET billing_rule_id = COALESCE($1, billing_rule_id),
                   forward_rule_ids = COALESCE($2, forward_rule_ids),
                   is_active = 1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE mid = $3"#,
        )
        .bind(billing_id)
        .bind(&forward_ids)
        .bind(mid)
        .execute(pool)
        .await?;
        sqlx::query(
            r#"UPDATE models
               SET billing_rule_id = COALESCE($1, billing_rule_id),
                   forward_rule_ids = COALESCE($2, forward_rule_ids),
                   updated_at = CURRENT_TIMESTAMP
               WHERE mid = $3 OR library_mid = $3 OR model_id = $4"#,
        )
        .bind(billing_id)
        .bind(&forward_ids)
        .bind(mid)
        .bind(model_id)
        .execute(pool)
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{append_image_tool_mids, channel_hosts_mediakit};

    #[test]
    fn append_adds_missing_mids() {
        let next = append_image_tool_mids(r#"["vve-sd","vve-pf"]"#).expect("changed");
        assert!(next.contains("vie-en"));
        assert!(next.contains("vir-bg"));
        assert!(next.contains("vve-sd"));
    }

    #[test]
    fn append_skips_open_list() {
        assert_eq!(append_image_tool_mids("[]"), None);
    }

    #[test]
    fn append_skips_already_present() {
        assert_eq!(
            append_image_tool_mids(r#"["vie-en","vir-bg","vve-sd"]"#),
            None
        );
    }

    #[test]
    fn plugin_on_lists_billing_even_when_disabled() {
        assert!(super::billing_rule_listed(
            "火山 MediaKit 视频画质增强 (专业版)",
            "78246",
            "video_quality",
            9,
            true,
            None,
        ));
        assert!(super::billing_rule_listed(
            "火山 MediaKit 官方视频超分计费",
            "70001",
            "video_quality",
            3,
            true,
            None,
        ));
    }

    #[test]
    fn include_key_opens_hidden_billing_rule() {
        assert!(super::billing_rule_listed(
            "火山 MediaKit 图像画质增强",
            "78243",
            "standard",
            12,
            false,
            Some("78243"),
        ));
        assert!(super::billing_rule_listed(
            "火山级联画质增强默认计费",
            "78242",
            "volc_enhance_cascade",
            4,
            false,
            Some("4"),
        ));
        assert!(!super::billing_rule_listed(
            "火山 MediaKit 图像背景移除",
            "78244",
            "standard",
            13,
            false,
            None,
        ));
    }

    #[test]
    fn host_detects_credential_and_video_mids() {
        assert!(channel_hosts_mediakit(
            r#"["vve-sd"]"#,
            "",
            r#"{"volcengine_enhance_credential_id":"abc"}"#
        ));
        assert!(channel_hosts_mediakit(
            "[]",
            "https://mediakit.cn-beijing.volces.com",
            "{}"
        ));
        assert!(!channel_hosts_mediakit(
            r#"["305432"]"#,
            "https://ark.cn-beijing.volces.com",
            "{}"
        ));
    }
}
