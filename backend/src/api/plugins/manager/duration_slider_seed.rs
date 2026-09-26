/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 创作中心2026：视频时长 duration 统一为滑块。
//! 仅 playground_2026 覆写，不改旧创作中心方案控件。

use serde_json::{json, Value};

fn is_duration_param(p: &Value) -> bool {
    let key = p
        .get("key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let label = p.get("label").and_then(|v| v.as_str()).unwrap_or("");
    key == "duration"
        || key == "duration_seconds"
        || key == "seconds"
        || label.contains("视频时长")
        || label == "时长"
}

fn as_i64_loose(v: &Value) -> Option<i64> {
    v.as_i64()
        .or_else(|| v.as_u64().map(|n| n as i64))
        .or_else(|| v.as_f64().map(|n| n as i64))
        .or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
}

fn option_nums(p: &Value) -> Vec<i64> {
    p.get("options")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(as_i64_loose).collect())
        .unwrap_or_default()
}

/// 将单条 duration 参数改为滑块；已是 slider 则保持 min/max
fn convert_duration_param(p: &mut Value) -> bool {
    if !is_duration_param(p) {
        return false;
    }
    let ty = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if ty == "slider" {
        return false;
    }
    if ty != "select" && ty != "radio" && ty != "number" {
        return false;
    }

    let nums = option_nums(p);
    let existing_min = p.get("min").and_then(as_i64_loose);
    let existing_max = p.get("max").and_then(as_i64_loose);
    let min = existing_min
        .or_else(|| nums.iter().copied().min())
        .unwrap_or(1);
    let max = existing_max
        .or_else(|| nums.iter().copied().max())
        .unwrap_or(30);
    let max = max.max(min);

    let Some(obj) = p.as_object_mut() else {
        return false;
    };
    obj.insert("type".into(), json!("slider"));
    obj.insert("data_type".into(), json!("integer"));
    obj.insert("min".into(), json!(min));
    obj.insert("max".into(), json!(max));
    obj.insert("step".into(), json!(1));
    obj.remove("options");
    obj.remove("quick");
    true
}

pub fn seed_video_duration_sliders(schemes: &mut [Value]) -> bool {
    let mut changed = false;
    for s in schemes.iter_mut() {
        let Some(params) = s.get_mut("params").and_then(|v| v.as_array_mut()) else {
            continue;
        };
        for p in params {
            if convert_duration_param(p) {
                changed = true;
            }
        }
    }
    changed
}
