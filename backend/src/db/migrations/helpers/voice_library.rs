/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 创作中心2026 音频音色一次性数据变更。
//! 由迁移 `playground_2026_voice_library_v1` 调用一次：
//! 写入 Doubao TTS 2.0 方案（若缺失），给 audio 方案落 `voice_library`，并从 params 去掉 voice/speaker。

use crate::api::plugins::manager::doubao_tts_2_seed::{
    doubao_tts_2_scheme, DOUBAO_TTS_2_SCHEME_ID,
};
#[cfg(feature = "commercial_plugins")]
use crate::api::plugins::playground_2026::voice_library::seed_scheme_voice_library;
use serde_json::Value;

pub(crate) fn apply_voice_library_to_schemes(schemes: &mut Vec<Value>) {
    let has_tts = schemes
        .iter()
        .any(|s| s.get("id").and_then(|v| v.as_str()) == Some(DOUBAO_TTS_2_SCHEME_ID));
    if !has_tts {
        schemes.push(doubao_tts_2_scheme());
    }
    #[cfg(feature = "commercial_plugins")]
    for s in schemes.iter_mut() {
        seed_scheme_voice_library(s);
    }
}

pub(crate) async fn seed_playground_2026_voice_library(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<u64> {
    let schemes_raw: Option<String> = sqlx::query_scalar(
        "SELECT config_value FROM plugin_configs \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .fetch_optional(pool)
    .await?;
    let Some(raw) = schemes_raw else {
        return Ok(0);
    };
    let Ok(mut schemes) = serde_json::from_str::<Vec<Value>>(&raw) else {
        return Ok(0);
    };
    apply_voice_library_to_schemes(&mut schemes);
    let next = serde_json::to_string(&schemes)?;
    if next == raw {
        return Ok(0);
    }
    sqlx::query(
        "UPDATE plugin_configs SET config_value = $1, updated_at = CURRENT_TIMESTAMP \
         WHERE plugin_name = 'playground_2026' AND config_key = 'pg_schemes'",
    )
    .bind(&next)
    .execute(pool)
    .await?;
    Ok(1)
}
