/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 创作中心2026：Seedance 2.0 方案对齐官方视频生成 API。
//! 仅 playground_2026 覆写，不改旧创作中心默认方案。
//! https://www.volcengine.com/docs/82379/1520757

use serde_json::{json, Value};

pub const SEEDANCE2_SCHEME_ID: &str = "seedance2.0";

/// 官方能力：文生 / 图生（首帧）/ 首尾帧 / 全模态参考（图≤9 视频≤3 音频≤3）/ 编辑 / 延长。
/// 全模态参考 = 站点「全能参考生视频」。首尾帧与全模态参考互斥。
pub fn seedance2_video_scheme_io() -> Value {
    json!({
        "inputs": [
            {
                "key": "prompt",
                "label": "提示词",
                "enabled": true,
                "modality": "text",
                "handle_prefix": "Prompt",
                "bind_key": "prompt",
                "accepts": ["prompt"],
                "required": true,
                "max": 1
            },
            {
                "key": "start_frame",
                "label": "图生视频",
                "enabled": true,
                "modality": "image",
                "handle_prefix": "Start Frame",
                "bind_key": "image_url",
                "accepts": ["asset", "ai_image", "preview"],
                "accept_asset_kinds": ["image"],
                "max": 1
            },
            {
                "key": "end_frame",
                "label": "尾帧",
                "enabled": true,
                "modality": "image",
                "handle_prefix": "End Frame",
                "bind_key": "end_image_url",
                "accepts": ["asset", "ai_image", "preview"],
                "accept_asset_kinds": ["image"],
                "max": 1
            },
            {
                "key": "reference_images",
                "label": "参考图",
                "enabled": true,
                "modality": "image",
                "handle_prefix": "Reference Images",
                "bind_key": "image_urls",
                "accepts": ["asset", "ai_image", "preview"],
                "accept_asset_kinds": ["image"],
                "max": 9,
                "expandable": true,
                "default_count": 1
            },
            {
                "key": "reference_videos",
                "label": "参考视频",
                "enabled": true,
                "modality": "video",
                "handle_prefix": "Reference Videos",
                "bind_key": "video_urls",
                "accepts": ["asset", "ai_video", "preview"],
                "accept_asset_kinds": ["video"],
                "max": 3,
                "expandable": true,
                "default_count": 1
            },
            {
                "key": "reference_audio",
                "label": "参考音频",
                "enabled": true,
                "modality": "audio",
                "handle_prefix": "Reference Audio",
                "bind_key": "audio_urls",
                "accepts": ["asset"],
                "accept_asset_kinds": ["audio"],
                "max": 3,
                "expandable": true,
                "default_count": 1
            }
        ],
        "outputs": [
            {
                "key": "video",
                "label": "视频",
                "enabled": true,
                "modality": "video",
                "handle_prefix": "Video",
                "result_key": "video_url",
                "max": 1
            }
        ]
    })
}

pub fn seedance2_scheme() -> Value {
    let io = seedance2_video_scheme_io();
    let mut scheme = json!({
        "id": SEEDANCE2_SCHEME_ID,
        "name": "Seedance 2.0 方案",
        "type": "video",
        "is_system": true,
        "description": "火山 Seedance 2.0：文生视频、图生视频（首帧）、首尾帧、全模态参考生视频（站点全能参考：图/视频/音频）、视频编辑、视频延长。首尾帧与全模态参考互斥。时长 4–15 秒，分辨率 480p/720p/1080p/4k。",
        "max_reference_images": 9,
        "params": [
            {
                "key": "duration",
                "label": "视频时长",
                "type": "slider",
                "data_type": "integer",
                "min": 4,
                "max": 15,
                "step": 1,
                "default": 5,
                "unit": "秒",
                "hint": "官方 4–15 秒；编辑/延长可按模式另传 duration"
            },
            {
                "key": "ratio",
                "label": "画面比例",
                "type": "radio",
                "data_type": "string",
                "options": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"],
                "default": "16:9",
                "quick": true,
                "hint": "adaptive：按首帧/参考媒体自动选比例；编辑与延长建议 adaptive"
            },
            {
                "key": "resolution",
                "label": "输出分辨率",
                "type": "select",
                "data_type": "string",
                "options": ["480p", "720p", "1080p", "4K"],
                "default": "480p",
                "quick": true
            },
            {
                "key": "watermark",
                "label": "水印",
                "type": "switch",
                "data_type": "boolean",
                "default": false
            },
            {
                "key": "return_last_frame",
                "label": "返回最后一帧",
                "type": "switch",
                "data_type": "boolean",
                "default": false
            },
            {
                "key": "generate_audio",
                "label": "生成音频",
                "type": "switch",
                "data_type": "boolean",
                "default": false,
                "hint": "原生有声视频"
            },
            {
                "key": "web_search",
                "label": "联网搜索",
                "type": "switch",
                "data_type": "boolean",
                "default": false,
                "hint": "仅文生视频生效"
            }
        ]
    });
    if let Some(obj) = scheme.as_object_mut() {
        if let Some(inputs) = io.get("inputs").cloned() {
            obj.insert("inputs".into(), inputs);
        }
        if let Some(outputs) = io.get("outputs").cloned() {
            obj.insert("outputs".into(), outputs);
        }
    }
    scheme
}

/// 旧种子只有提示词 + 参考图/视频/音频，缺首尾帧与源视频
pub fn saved_io_is_legacy_multimodal_only(saved: &Value) -> bool {
    let Some(inputs) = saved.get("inputs").and_then(|v| v.as_array()) else {
        return true;
    };
    if inputs.is_empty() {
        return true;
    }
    let mut has_ref = false;
    let mut has_frames = false;
    for p in inputs {
        if p.get("enabled") == Some(&Value::Bool(false)) {
            continue;
        }
        match p.get("key").and_then(|v| v.as_str()).unwrap_or("") {
            "reference_images" | "reference_videos" | "reference_audio" => has_ref = true,
            "start_frame" | "end_frame" => has_frames = true,
            _ => {}
        }
    }
    has_ref && !has_frames
}

/// 覆写列表中的 seedance2.0；若不存在则追加
pub fn seed_seedance2_scheme(schemes: &mut Vec<Value>) {
    let next = seedance2_scheme();
    if let Some(pos) = schemes.iter().position(|s| {
        s.get("id").and_then(|v| v.as_str()) == Some(SEEDANCE2_SCHEME_ID)
    }) {
        schemes[pos] = next;
    } else {
        schemes.push(next);
    }
}

/// Seedance 2.0 方案：去掉反向提示词（官方不支持）
pub fn sanitize_seedance2_saved_io(saved: &mut Value) {
    if let Some(inputs) = saved.get_mut("inputs").and_then(|v| v.as_array_mut()) {
        inputs.retain(|p| {
            let key = p.get("key").and_then(|v| v.as_str());
            let bind_key = p.get("bind_key").and_then(|v| v.as_str());
            key != Some("negative_prompt") && bind_key != Some("negative_prompt")
        });
    }
}
