/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 模型广场单模型可见性：
//! - 广场展示开启：`level_ids` 为不可查看的用户等级，空 = 全部可查看
//! - 广场展示关闭：`level_ids` 为可查看的用户等级，空 = 全部不可查看

use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MarketplaceViewer {
    pub is_admin: bool,
    pub level_id: Option<i64>,
}

impl MarketplaceViewer {
    pub fn guest() -> Self {
        Self {
            is_admin: false,
            level_id: None,
        }
    }
}

pub fn json_to_i64(v: &Value) -> Option<i64> {
    v.as_i64()
        .or_else(|| v.as_u64().map(|n| n as i64))
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

pub fn parse_level_id_list(v: Option<&Value>) -> Vec<i64> {
    v.and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(json_to_i64).collect())
        .unwrap_or_default()
}

pub fn parse_mp_level_ids(conf: &Value) -> Vec<i64> {
    parse_level_id_list(conf.get("level_ids"))
}

pub fn mp_enabled(conf: &Value, default_enabled: bool) -> bool {
    conf.get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(default_enabled)
}

pub fn mp_is_candidate(enabled: bool, level_ids: &[i64]) -> bool {
    enabled || !level_ids.is_empty()
}

pub fn mp_conf_is_candidate(conf: &Value, default_enabled: bool) -> bool {
    let enabled = mp_enabled(conf, default_enabled);
    let level_ids = parse_mp_level_ids(conf);
    mp_is_candidate(enabled, &level_ids)
}

/// 当前观察者是否可见该模型。
pub fn mp_visible_to(enabled: bool, level_ids: &[i64], viewer: MarketplaceViewer) -> bool {
    if viewer.is_admin {
        return mp_is_candidate(enabled, level_ids);
    }
    match viewer.level_id {
        None => enabled,
        Some(id) => {
            if enabled {
                !level_ids.contains(&id)
            } else {
                level_ids.contains(&id)
            }
        }
    }
}
