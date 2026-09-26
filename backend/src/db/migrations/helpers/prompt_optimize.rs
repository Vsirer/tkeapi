/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

const CONFIG_KEY: &str = "prompt_optimize_model_mid";

fn is_chat_llm_type(type_name: &str) -> bool {
    type_name.contains("聊天") || type_name.contains("对话")
}

fn compact_id(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn looks_like_qwen37_max(name: &str, model_id: &str) -> bool {
    let blob = compact_id(&format!("{name}{model_id}"));
    blob.contains("qwen37") && blob.contains("max")
}

pub(crate) async fn seed_prompt_optimize_llm_mid(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT m.mid, m.name, m.model_id, COALESCE(mt.name, '') \
         FROM models m \
         LEFT JOIN model_types mt ON mt.id = m.type_id \
         WHERE m.is_active = 1 \
         ORDER BY m.sort_order DESC, m.id DESC",
    )
    .fetch_all(pool)
    .await?;
    let chat: Vec<(String, String, String)> = rows
        .into_iter()
        .filter(|(_, _, _, ty)| is_chat_llm_type(ty))
        .map(|(mid, name, model_id, _)| (mid, name, model_id))
        .collect();
    let mid = chat
        .iter()
        .find(|(_, name, model_id)| looks_like_qwen37_max(name, model_id))
        .or(chat.first())
        .map(|(m, _, _)| m.clone());
    let Some(mid) = mid else {
        return Ok(0);
    };
    let res = sqlx::query(
        "INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at) \
         VALUES ('playground_2026', $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
         ON CONFLICT (plugin_name, config_key) DO NOTHING",
    )
    .bind(CONFIG_KEY)
    .bind(&mid)
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}
