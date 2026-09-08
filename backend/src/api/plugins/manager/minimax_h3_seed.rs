/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 创作中心2026：MiniMax-H3 视频生成方案种子。
//! 仅 playground_2026 注入，不进入旧创作中心默认方案列表。
//! 参数对齐 https://platform.minimax.cn/docs/api-reference/video-generation-v2-create

use serde_json::{json, Value};

pub const MINIMAX_H3_SCHEME_ID: &str = "minimax-h3";

/// MiniMax H3 工作流 IO：文生 + 首尾帧 + 多模态参考（图/视频/音频）
pub fn minimax_h3_video_scheme_io() -> Value {
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

pub fn minimax_h3_scheme() -> Value {
    let io = minimax_h3_video_scheme_io();
    let mut scheme = json!({
        "id": MINIMAX_H3_SCHEME_ID,
        "name": "MiniMax H3 视频生成方案",
        "type": "video",
        "is_system": true,
        "description": "MiniMax Hailuo-03（MiniMax-H3）视频生成：文生视频、图生视频（首尾帧）、多模态参考生视频（图/视频/音频）。首尾帧与参考素材互斥，不可同请求混用。分辨率 768P/2K，时长 5–15 秒。",
        "max_reference_images": 9,
        "params": [
            {
                "key": "duration",
                "label": "视频时长",
                "type": "slider",
                "data_type": "integer",
                "min": 5,
                "max": 15,
                "step": 1,
                "default": 5,
                "unit": "秒"
            },
            {
                "key": "ratio",
                "label": "画面比例",
                "type": "radio",
                "data_type": "string",
                "options": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"],
                "default": "16:9",
                "quick": true,
                "hint": "文生视频必填且不能为 adaptive；图生视频由输入图决定（adaptive）；参考生可选"
            },
            {
                "key": "resolution",
                "label": "输出分辨率",
                "type": "select",
                "data_type": "string",
                "options": ["768P", "2K"],
                "default": "2K",
                "quick": true
            },
            {
                "key": "watermark",
                "label": "水印",
                "type": "switch",
                "data_type": "boolean",
                "default": false,
                "hint": "对应官方 aigc_watermark"
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

/// 若列表中尚无 MiniMax H3 方案则追加
pub fn seed_minimax_h3_scheme(schemes: &mut Vec<Value>) -> bool {
    let exists = schemes.iter().any(|s| {
        s.get("id").and_then(|v| v.as_str()) == Some(MINIMAX_H3_SCHEME_ID)
    });
    if exists {
        return false;
    }
    schemes.push(minimax_h3_scheme());
    true
}
