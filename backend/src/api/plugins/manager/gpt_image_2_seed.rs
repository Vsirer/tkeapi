/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 创作中心2026：GPT-Image-2 图片生成独立创作方案种子。
//! 仅 playground_2026 注入，参数对齐 gpt-image-2 官方/代理生图界面规范：
//! 画面比例（9:16、3:4、1:1、4:3、3:2、16:9、21:9）、Prompt Enhancer、Variations、Resolution、Quality。

use serde_json::{json, Value};

pub const GPT_IMAGE_2_SCHEME_ID: &str = "gpt-image-2";

/// GPT-Image-2 工作流 IO：文生图 + 图生图（参考图编辑）
pub fn gpt_image_2_scheme_io() -> Value {
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
                "key": "reference_images",
                "label": "参考图",
                "enabled": true,
                "modality": "image",
                "handle_prefix": "Reference Images",
                "bind_key": "image_urls",
                "accepts": ["asset", "ai_image", "preview"],
                "accept_asset_kinds": ["image"],
                "max": 1,
                "expandable": false,
                "default_count": 1
            }
        ],
        "outputs": [
            {
                "key": "images",
                "label": "图片列表",
                "enabled": true,
                "modality": "image",
                "handle_prefix": "Image",
                "result_key": "image_url",
                "max": 4
            }
        ]
    })
}

pub fn gpt_image_2_scheme() -> Value {
    let io = gpt_image_2_scheme_io();
    let mut scheme = json!({
        "id": GPT_IMAGE_2_SCHEME_ID,
        "name": "GPT-Image-2 图片生成方案",
        "type": "image",
        "is_system": true,
        "description": "GPT-Image-2 旗舰图片生成方案：支持文生图与图生图；提供画面比例网格、提示词增强、变体数量（1-4）、分辨率（1K/2K/4K）与画质（常用画质/高画质/高精细画质）配置。",
        "max_reference_images": 1,
        "params": [
            {
                "key": "ratio",
                "label": "画面比例",
                "type": "radio",
                "data_type": "string",
                "options": ["9:16", "3:4", "1:1", "4:3", "3:2", "16:9", "21:9"],
                "default": "1:1",
                "hide_label": true,
                "quick": true
            },
            {
                "key": "prompt_enhancer",
                "label": "提示词增强",
                "type": "switch",
                "data_type": "boolean",
                "default": false,
                "group": "更多选项",
                "hint": "开启后智能优化与润色提示词，丰富画面细节"
            },
            {
                "key": "variations",
                "label": "变体数量",
                "type": "slider",
                "data_type": "integer",
                "min": 1,
                "max": 4,
                "step": 1,
                "default": 1,
                "display_style": "pill",
                "group": "更多选项",
                "hint": "单次生成的图片变体数量 (1-4)"
            },
            {
                "key": "resolution",
                "label": "分辨率",
                "type": "radio",
                "data_type": "string",
                "options": ["1K", "2K", "4K"],
                "default": "1K",
                "display_style": "radio",
                "group": "更多选项",
                "hint": "设置生成图片的清晰度规格 (1K/2K/4K)",
                "quick": true
            },
            {
                "key": "quality",
                "label": "画质",
                "type": "radio",
                "data_type": "string",
                "options": ["Low", "Medium", "High"],
                "option_labels": {
                    "Low": "常用画质",
                    "Medium": "高画质",
                    "High": "高精细画质"
                },
                "default": "Low",
                "display_style": "radio",
                "group": "更多选项",
                "hint": "设置生成画面的精细度质量 (常用画质/高画质/高精细画质)"
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

/// 确保列表中有 gpt-image-2 方案；若已存在则就地同步其参数中文标签、分组与描述
pub fn seed_gpt_image_2_scheme(schemes: &mut Vec<Value>) -> bool {
    if let Some(pos) = schemes.iter().position(|s| {
        s.get("id").and_then(|v| v.as_str()) == Some(GPT_IMAGE_2_SCHEME_ID)
    }) {
        let mut changed = false;
        if let Some(params) = schemes[pos].get_mut("params").and_then(|v| v.as_array_mut()) {
            for p in params.iter_mut() {
                let key = p.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
                match key.as_str() {
                    "prompt_enhancer" => {
                        if p.get("label").and_then(|v| v.as_str()) != Some("提示词增强") {
                            p["label"] = json!("提示词增强");
                            changed = true;
                        }
                        if p.get("group").and_then(|v| v.as_str()) != Some("更多选项") {
                            p["group"] = json!("更多选项");
                            changed = true;
                        }
                        if p.get("hint").and_then(|v| v.as_str()) != Some("开启后智能优化与润色提示词，丰富画面细节") {
                            p["hint"] = json!("开启后智能优化与润色提示词，丰富画面细节");
                            changed = true;
                        }
                    }
                    "variations" => {
                        if p.get("label").and_then(|v| v.as_str()) != Some("变体数量") {
                            p["label"] = json!("变体数量");
                            changed = true;
                        }
                        if p.get("group").and_then(|v| v.as_str()) != Some("更多选项") {
                            p["group"] = json!("更多选项");
                            changed = true;
                        }
                        if p.get("hint").and_then(|v| v.as_str()) != Some("单次生成的图片变体数量 (1-4)") {
                            p["hint"] = json!("单次生成的图片变体数量 (1-4)");
                            changed = true;
                        }
                        if p.get("default").and_then(|v| v.as_i64()) == Some(4) || p.get("default").is_none() {
                            p["default"] = json!(1);
                            changed = true;
                        }
                    }
                    "resolution" => {
                        if p.get("label").and_then(|v| v.as_str()) != Some("分辨率") {
                            p["label"] = json!("分辨率");
                            changed = true;
                        }
                        if p.get("group").and_then(|v| v.as_str()) != Some("更多选项") {
                            p["group"] = json!("更多选项");
                            changed = true;
                        }
                        if p.get("hint").and_then(|v| v.as_str()) != Some("设置生成图片的清晰度规格 (1K/2K/4K)") {
                            p["hint"] = json!("设置生成图片的清晰度规格 (1K/2K/4K)");
                            changed = true;
                        }
                    }
                    "quality" => {
                        if p.get("label").and_then(|v| v.as_str()) != Some("画质") {
                            p["label"] = json!("画质");
                            changed = true;
                        }
                        if p.get("group").and_then(|v| v.as_str()) != Some("更多选项") {
                            p["group"] = json!("更多选项");
                            changed = true;
                        }
                        let hint_zh = "设置生成画面的精细度质量 (常用画质/高画质/高精细画质)";
                        if p.get("hint").and_then(|v| v.as_str()) != Some(hint_zh) {
                            p["hint"] = json!(hint_zh);
                            changed = true;
                        }
                        let target_labels = json!({
                            "Low": "常用画质",
                            "Medium": "高画质",
                            "High": "高精细画质"
                        });
                        if p.get("option_labels") != Some(&target_labels) {
                            p["option_labels"] = target_labels;
                            changed = true;
                        }
                    }
                    _ => {
                        if p.get("group").and_then(|v| v.as_str()) == Some("More options") {
                            p["group"] = json!("更多选项");
                            changed = true;
                        }
                    }
                }
            }
        }
        return changed;
    }

    let scheme = gpt_image_2_scheme();
    if let Some(pos) = schemes.iter().position(|s| {
        s.get("id").and_then(|v| v.as_str()) == Some("openai_image")
    }) {
        schemes.insert(pos + 1, scheme);
    } else {
        schemes.push(scheme);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpt_image_2_scheme_defaults_in_chinese() {
        let scheme = gpt_image_2_scheme();
        let params = scheme.get("params").and_then(|v| v.as_array()).unwrap();
        let prompt_enhancer = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("prompt_enhancer")).unwrap();
        assert_eq!(prompt_enhancer.get("label").and_then(|v| v.as_str()), Some("提示词增强"));
        assert_eq!(prompt_enhancer.get("group").and_then(|v| v.as_str()), Some("更多选项"));
        assert!(prompt_enhancer.get("hint").and_then(|v| v.as_str()).unwrap().contains("优化与润色"));

        let variations = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("variations")).unwrap();
        assert_eq!(variations.get("label").and_then(|v| v.as_str()), Some("变体数量"));
        assert_eq!(variations.get("group").and_then(|v| v.as_str()), Some("更多选项"));
        assert_eq!(variations.get("default").and_then(|v| v.as_i64()), Some(1));

        let resolution = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("resolution")).unwrap();
        assert_eq!(resolution.get("label").and_then(|v| v.as_str()), Some("分辨率"));

        let quality = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("quality")).unwrap();
        assert_eq!(quality.get("label").and_then(|v| v.as_str()), Some("画质"));
    }

    #[test]
    fn test_seed_gpt_image_2_scheme_updates_legacy_english() {
        let legacy_scheme = json!({
            "id": GPT_IMAGE_2_SCHEME_ID,
            "params": [
                {
                    "key": "prompt_enhancer",
                    "label": "Prompt Enhancer",
                    "group": "More options"
                },
                {
                    "key": "variations",
                    "label": "Variations",
                    "group": "More options",
                    "default": 4
                },
                {
                    "key": "resolution",
                    "label": "Resolution",
                    "group": "More options"
                },
                {
                    "key": "quality",
                    "label": "Quality",
                    "group": "More options"
                }
            ]
        });

        let mut schemes = vec![legacy_scheme];
        assert!(seed_gpt_image_2_scheme(&mut schemes));

        let updated = &schemes[0];
        let params = updated.get("params").and_then(|v| v.as_array()).unwrap();
        let pe = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("prompt_enhancer")).unwrap();
        assert_eq!(pe.get("label").and_then(|v| v.as_str()), Some("提示词增强"));
        assert_eq!(pe.get("group").and_then(|v| v.as_str()), Some("更多选项"));

        let v = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("variations")).unwrap();
        assert_eq!(v.get("label").and_then(|v| v.as_str()), Some("变体数量"));
        assert_eq!(v.get("default").and_then(|v| v.as_i64()), Some(1));

        let res = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("resolution")).unwrap();
        assert_eq!(res.get("label").and_then(|v| v.as_str()), Some("分辨率"));

        let q = params.iter().find(|p| p.get("key").and_then(|v| v.as_str()) == Some("quality")).unwrap();
        assert_eq!(q.get("label").and_then(|v| v.as_str()), Some("画质"));
        assert_eq!(
            q.get("option_labels").and_then(|v| v.get("Low")).and_then(|v| v.as_str()),
            Some("常用画质")
        );
        assert_eq!(
            q.get("option_labels").and_then(|v| v.get("Medium")).and_then(|v| v.as_str()),
            Some("高画质")
        );
        assert_eq!(
            q.get("option_labels").and_then(|v| v.get("High")).and_then(|v| v.as_str()),
            Some("高精细画质")
        );

        // 第二次调用无变化返回 false
        assert!(!seed_gpt_image_2_scheme(&mut schemes));
    }
}

