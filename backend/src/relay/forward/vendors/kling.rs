/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use super::super::media;

// ── 可灵 AI 请求体构建器 ──────────────────────────────────────
//
// 将 OpenAI 兼容格式转换为可灵官方 API 格式。
// - model → model_name（可灵官方字段名）
// - 白名单驱动参数透传，扩展时追加一行即可
// - 直通模式：body 已含 model_name → 原样透传，仅补充默认值
// 参考文档：https://klingai.com/document-api/apiReference

/// 可灵视频接口透传参数白名单
const KLING_VIDEO_PASSTHROUGH_KEYS: &[&str] = &[
    "model_name",
    "prompt",
    "negative_prompt",
    "duration",
    "mode",
    "sound",
    "aspect_ratio",
    "image",
    "image_tail",
    "image_list",
    "video_list",
    "type",
    "multi_shot",
    "multi_prompt",
    "callback_url",
    "external_task_id",
    "cfg_scale",
    "camera_control",
    "shot_type",
    "element_list",
    "voice_list",
];

/// 可灵图片接口透传参数白名单
const KLING_IMAGE_PASSTHROUGH_KEYS: &[&str] = &[
    "model_name",
    "prompt",
    "negative_prompt",
    "n",
    "aspect_ratio",
    "resolution",
    "image",
    "image_list",
    "element_list",
    "subject_image_list",
    "image_fidelity",
    "series_amount",
    "callback_url",
    "external_task_id",
    "image_reference",
    "result_type",
    "watermark_info",
];

fn is_kling_first_frame(role: &str) -> bool {
    role == "first_frame" || role == "first"
}

fn is_kling_end_frame(role: &str) -> bool {
    role == "last_frame" || role == "end_frame" || role == "last" || role == "tail"
}

pub(crate) fn build_kling_body(
    model: &str,
    body: &serde_json::Value,
    category: &str,
    upstream_path: &str,
) -> serde_json::Value {
    let is_omni = upstream_path.contains("omni-video") || upstream_path.contains("omni-image");
    let keys = if category == "图片" {
        &KLING_IMAGE_PASSTHROUGH_KEYS[..]
    } else {
        &KLING_VIDEO_PASSTHROUGH_KEYS[..]
    };

    let mut result = serde_json::Map::new();

    // model_name：优先使用请求体中已有的（官方原生调用），否则从 model 转换
    if let Some(mn) = body.get("model_name").and_then(|v| v.as_str()) {
        result.insert("model_name".to_string(), serde_json::json!(mn));
    } else {
        result.insert("model_name".to_string(), serde_json::json!(model));
    }

    // 白名单驱动透传（跳过 model_name，已处理）
    for &key in keys {
        if key == "model_name" {
            continue;
        }
        if let Some(val) = body.get(key) {
            result.insert(key.to_string(), val.clone());
        }
    }

    // 视频声音优先级：generate_audio（布尔）> sound（字符串）
    // generate_audio 是 OpenAI 兼容扩展参数，可灵官方使用 sound 字段
    if category == "视频" {
        if let Some(ga) = body.get("generate_audio") {
            let enabled = media::json_truthy(ga);
            result.insert(
                "sound".to_string(),
                serde_json::json!(if enabled { "on" } else { "off" }),
            );
        }
    }

    // 兼容 OpenAI 的 ratio -> aspect_ratio (可灵官方参数名为 aspect_ratio)
    if !result.contains_key("aspect_ratio") {
        if let Some(ratio) = body.get("ratio") {
            result.insert("aspect_ratio".to_string(), ratio.clone());
        }
    }

    // 视频 mode 默认从 resolution 映射（OpenAI 兼容：720p/480p->std，1080p->pro，4k->4k），未提供时兜底 std
    if category != "图片" && !result.contains_key("mode") {
        let mode_val = if let Some(res_str) = body.get("resolution").and_then(|v| v.as_str()) {
            let res_lower = res_str.to_ascii_lowercase();
            if res_lower == "1080p" {
                "pro"
            } else if res_lower == "4k" {
                "4k"
            } else {
                "std" // "720p", "480p" 映射为 std
            }
        } else {
            "std"
        };
        result.insert("mode".to_string(), serde_json::json!(mode_val));
    }

    // 视频：OpenAI 兼容 images / image_urls 数组 → 可灵官方 image / image_tail / image_list
    // 仅在未使用官方参数时生效，避免覆盖原生调用
    // omni-video：多图统一走 image_list[].image_url
    // 非 omni：含 role=reference_image → image_list[].image（多图参考），否则按数量分发首尾帧
    if category != "图片"
        && !result.contains_key("image")
        && !result.contains_key("image_tail")
        && !result.contains_key("image_list")
    {
        let images = media::collect_media_values(body, &["images", "image_urls"]);
        if !images.is_empty() {
            // 统一解析媒体数据并过滤空值，兼容 role 和 type
            let parsed_items: Vec<(String, String)> = images
                .iter()
                .filter_map(|item| {
                    let (url_opt, role) = media::parse_media_item(item, "");
                    url_opt
                        .filter(|u| !u.is_empty())
                        .map(|u| (u.to_string(), role.to_string()))
                })
                .collect();

            if !parsed_items.is_empty() {
                if is_omni {
                    // omni-video：全部走 image_list[].image_url
                    let is_len_two = parsed_items.len() == 2;
                    let is_simple_mode =
                        is_len_two && parsed_items.iter().all(|(_, role)| role.is_empty());

                    let list: Vec<serde_json::Value> = parsed_items
                        .into_iter()
                        .enumerate()
                        .map(|(idx, (url, role))| {
                            let mut obj = serde_json::Map::new();
                            obj.insert("image_url".to_string(), serde_json::json!(url));
                            if is_simple_mode {
                                if idx == 0 {
                                    obj.insert(
                                        "type".to_string(),
                                        serde_json::json!("first_frame"),
                                    );
                                } else {
                                    obj.insert("type".to_string(), serde_json::json!("end_frame"));
                                }
                            } else {
                                if is_kling_first_frame(&role) {
                                    obj.insert(
                                        "type".to_string(),
                                        serde_json::json!("first_frame"),
                                    );
                                } else if is_kling_end_frame(&role) {
                                    obj.insert("type".to_string(), serde_json::json!("end_frame"));
                                }
                            }
                            serde_json::Value::Object(obj)
                        })
                        .collect();

                    result.insert("image_list".to_string(), serde_json::Value::Array(list));
                } else {
                    // 非 omni：含 role=reference_image 或图片数大于 2 → 全部走 image_list[].image（多图参考）
                    // 否则 → 按数量分配到 image / image_tail 首尾帧
                    let has_ref_role = parsed_items
                        .iter()
                        .any(|(_, role)| role == "reference_image");

                    if has_ref_role || parsed_items.len() > 2 {
                        let list: Vec<serde_json::Value> = parsed_items
                            .iter()
                            .map(|(u, _)| serde_json::json!({ "image": u }))
                            .collect();
                        result.insert("image_list".to_string(), serde_json::Value::Array(list));
                    } else {
                        let mut first_img: Option<String> = None;
                        let mut tail_img: Option<String> = None;

                        // 1. 根据显式指定的 role / type 进行归类
                        for (url, role) in &parsed_items {
                            if is_kling_first_frame(role) {
                                first_img = Some(url.clone());
                            } else if is_kling_end_frame(role) {
                                tail_img = Some(url.clone());
                            }
                        }

                        // 2. 兜底填充（若未指定，首张为首帧，第二张为尾帧）
                        if first_img.is_none() && tail_img.is_none() {
                            first_img = Some(parsed_items[0].0.clone());
                            if parsed_items.len() >= 2 {
                                tail_img = Some(parsed_items[1].0.clone());
                            }
                        } else {
                            // 填充空缺位置
                            for (url, role) in &parsed_items {
                                if !is_kling_first_frame(role) && !is_kling_end_frame(role) {
                                    if first_img.is_none() {
                                        first_img = Some(url.clone());
                                    } else if tail_img.is_none() {
                                        tail_img = Some(url.clone());
                                    }
                                }
                            }
                        }

                        if let Some(fi) = first_img {
                            result.insert("image".to_string(), serde_json::json!(fi));
                        }
                        if let Some(ti) = tail_img {
                            result.insert("image_tail".to_string(), serde_json::json!(ti));
                        }
                    }
                }
            }
        }
    }

    // 视频：OpenAI 兼容 videos 数组 → 可灵官方 video_list
    // 仅在未使用官方参数时生效，避免覆盖原生调用
    if category != "图片" && !result.contains_key("video_list") && is_omni {
        let videos = media::collect_media_values(body, &["videos"]);
        if !videos.is_empty() {
            let parsed_items: Vec<(String, String)> = videos
                .iter()
                .filter_map(|item| {
                    let (url_opt, role) = media::parse_media_item(item, "");
                    url_opt
                        .filter(|u| !u.is_empty())
                        .map(|u| (u.to_string(), role.to_string()))
                })
                .collect();

            if !parsed_items.is_empty() {
                // omni-video：使用 video_list 且结构包含 video_url
                let list: Vec<serde_json::Value> = parsed_items
                    .into_iter()
                    .map(|(url, role)| {
                        let mut obj = serde_json::Map::new();
                        obj.insert("video_url".to_string(), serde_json::json!(url));
                        if !role.is_empty() {
                            obj.insert("refer_type".to_string(), serde_json::json!(role));
                        } else {
                            obj.insert("refer_type".to_string(), serde_json::json!("base"));
                        }
                        serde_json::Value::Object(obj)
                    })
                    .collect();

                result.insert("video_list".to_string(), serde_json::Value::Array(list));
            }
        }
    }

    // 图片 resolution：优先可灵官方 resolution → OpenAI size → 兜底 1k
    if category == "图片" && !result.contains_key("resolution") {
        let fallback = body.get("size").and_then(|v| v.as_str()).unwrap_or("1k");
        result.insert("resolution".to_string(), serde_json::json!(fallback));
    }

    // OpenAI 兼容：media::collect_image_urls 统一收集 image/image_urls
    // omni-image：多图 → image_list[].image
    // 非 omni：单图 → image，多图 → subject_image_list[].subject_image
    if category == "图片"
        && !result.contains_key("subject_image_list")
        && !result.contains_key("image_list")
    {
        let urls = media::collect_image_urls(body, &["image", "image_urls"]);
        result.remove("image");
        result.remove("image_urls");
        if is_omni {
            // omni-image：全部走 image_list[].image
            match urls.len() {
                0 => {}
                _ => {
                    let list: Vec<serde_json::Value> = urls
                        .iter()
                        .map(|u| serde_json::json!({ "image": u }))
                        .collect();
                    result.insert("image_list".to_string(), serde_json::json!(list));
                }
            }
        } else {
            // 非 omni：单图 → image，多图 → subject_image_list[].subject_image
            match urls.len() {
                0 => {}
                1 => {
                    result.insert("image".to_string(), serde_json::json!(&urls[0]));
                }
                _ => {
                    let list: Vec<serde_json::Value> = urls
                        .iter()
                        .map(|u| serde_json::json!({ "subject_image": u }))
                        .collect();
                    result.insert("subject_image_list".to_string(), serde_json::json!(list));
                }
            }
        }
    }

    serde_json::Value::Object(result)
}

fn kling_v3_content_item(type_name: &str, url: &str) -> serde_json::Value {
    serde_json::json!({ "type": type_name, "url": url })
}

fn kling_v3_image_type(role: &str, idx: usize, pair_plain: bool) -> &'static str {
    if pair_plain {
        return if idx == 0 {
            "first_frame"
        } else {
            "last_frame"
        };
    }
    match role.to_ascii_lowercase().as_str() {
        "first_frame" | "first" => "first_frame",
        "last_frame" | "end_frame" | "last" | "tail" => "last_frame",
        "refer_image" | "reference_image" => "refer_image",
        _ if idx == 0 => "first_frame",
        _ => "refer_image",
    }
}

fn kling_v3_build_settings(body: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    let mut settings = serde_json::Map::new();
    let resolution = body
        .pointer("/settings/resolution")
        .or_else(|| body.get("resolution"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("720p");
    settings.insert("resolution".into(), serde_json::json!(resolution));
    if let Some(d) = body
        .pointer("/settings/duration")
        .or_else(|| body.get("duration"))
    {
        settings.insert("duration".into(), d.clone());
    }
    // settings.audio / audio / OpenAI generate_audio → off|native
    let audio = if let Some(a) = body
        .pointer("/settings/audio")
        .or_else(|| body.get("audio"))
        .and_then(|v| v.as_str())
    {
        match a.to_ascii_lowercase().as_str() {
            "off" | "false" => "off",
            _ => "native",
        }
    } else if let Some(ga) = body.get("generate_audio") {
        let on = media::json_truthy(ga);
        if on {
            "native"
        } else {
            "off"
        }
    } else {
        "off"
    };
    settings.insert("audio".into(), serde_json::json!(audio));
    if let Some(r) = body
        .pointer("/settings/aspect_ratio")
        .or_else(|| body.get("aspect_ratio"))
        .or_else(|| body.get("ratio"))
    {
        settings.insert("aspect_ratio".into(), r.clone());
    }
    if let Some(ms) = body
        .pointer("/settings/multi_shot")
        .or_else(|| body.get("multi_shot"))
    {
        settings.insert("multi_shot".into(), ms.clone());
    }
    settings
}

fn kling_v3_build_options(body: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    let mut options = body
        .get("options")
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    for key in ["callback_url", "external_task_id", "watermark_info"] {
        if !options.contains_key(key) {
            if let Some(v) = body.get(key) {
                options.insert(key.into(), v.clone());
            }
        }
    }
    options
}

/// 可灵 3.0：contents / settings / options（模型在 URL）
/// - 文生：顶层 `prompt`，无 contents
/// - 图生 / Omni：`contents`（含 prompt 条目 + 媒体；Omni 的 prompt 一律在 contents）
pub(crate) fn build_kling_v3_body(body: &serde_json::Value, upstream_path: &str) -> serde_json::Value {
    let is_omni = upstream_path.contains("omni-video");

    // 已含 contents 透传；文生 prompt+settings 也可透传。Omni 禁止仅靠顶层 prompt 透传。
    if body.get("contents").is_some()
        || (!is_omni && body.get("prompt").is_some() && body.get("settings").is_some())
    {
        let mut out = body.clone();
        if let Some(obj) = out.as_object_mut() {
            obj.remove("model");
            obj.remove("model_name");
            // Omni：顶层 prompt 迁入 contents（已有 prompt 条目则只去掉顶层）
            if is_omni {
                if let Some(p) = obj.remove("prompt") {
                    let text = p.as_str().unwrap_or("").trim();
                    if !text.is_empty() {
                        let mut contents = obj
                            .remove("contents")
                            .and_then(|v| v.as_array().cloned())
                            .unwrap_or_default();
                        let has_prompt = contents
                            .iter()
                            .any(|c| c.get("type").and_then(|t| t.as_str()) == Some("prompt"));
                        if !has_prompt {
                            contents
                                .insert(0, serde_json::json!({ "type": "prompt", "text": text }));
                        }
                        obj.insert("contents".into(), serde_json::Value::Array(contents));
                    }
                }
            }
            let mut settings = obj
                .remove("settings")
                .and_then(|v| v.as_object().cloned())
                .unwrap_or_default();
            for (k, v) in kling_v3_build_settings(body) {
                settings.entry(k).or_insert(v);
            }
            obj.insert("settings".into(), serde_json::Value::Object(settings));
            let options = kling_v3_build_options(body);
            if !options.is_empty() {
                obj.insert("options".into(), serde_json::Value::Object(options));
            }
        }
        return out;
    }

    // 媒体 → contents（prompt 稍后按文/非文分流）；仅新协议 images/image_urls/videos，不读旧 image/image_tail
    let mut media: Vec<serde_json::Value> = Vec::new();

    let images = media::collect_media_values(body, &["images", "image_urls"]);
    let parsed_imgs: Vec<(String, String)> = images
        .iter()
        .filter_map(|item| {
            let (url_opt, role) = media::parse_media_item(item, "");
            url_opt
                .filter(|u| !u.is_empty())
                .map(|u| (u.to_string(), role.to_string()))
        })
        .collect();
    let pair_plain = parsed_imgs.len() == 2 && parsed_imgs.iter().all(|(_, r)| r.is_empty());
    for (idx, (url, role)) in parsed_imgs.into_iter().enumerate() {
        media.push(kling_v3_content_item(
            kling_v3_image_type(&role, idx, pair_plain),
            &url,
        ));
    }

    if is_omni || body.get("videos").is_some() {
        for item in media::collect_media_values(body, &["videos"]) {
            let (url_opt, role) = media::parse_media_item(&item, "");
            let Some(url) = url_opt.filter(|u| !u.is_empty()) else {
                continue;
            };
            let ty = match role.to_ascii_lowercase().as_str() {
                "feature" | "feature_video" => "feature_video",
                _ => "base_video",
            };
            media.push(kling_v3_content_item(ty, url));
        }
    }

    // 文生：顶层 prompt；图生 / Omni：prompt 进 contents
    let is_text = !is_omni && media.is_empty();
    let mut result = serde_json::Map::new();

    if is_text {
        if let Some(p) = body.get("prompt") {
            result.insert("prompt".into(), p.clone());
        }
    } else {
        let mut contents = Vec::with_capacity(media.len() + 1);
        if let Some(p) = body
            .get("prompt")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            contents.push(serde_json::json!({ "type": "prompt", "text": p }));
        }
        contents.extend(media);
        result.insert("contents".into(), serde_json::Value::Array(contents));
    }

    result.insert(
        "settings".into(),
        serde_json::Value::Object(kling_v3_build_settings(body)),
    );
    let options = kling_v3_build_options(body);
    if !options.is_empty() {
        result.insert("options".into(), serde_json::Value::Object(options));
    }

    serde_json::Value::Object(result)
}

// ── 可灵 JWT 自动生成（仅旧 target_type=kling）────────────────
//
// 渠道 api_key 格式："{access_key}:{secret_key}"
// 使用 HS256 算法生成 30 分钟有效期的 JWT Token。
// 如果 api_key 不含 ":" 分隔符，视为已生成的 Token / 普通 Bearer，由调用方直传。
// 新标准 kling_video 使用官方 API Key + Authorization: Bearer，不走本函数。

pub(crate) fn generate_kling_jwt(api_key: &str) -> Option<String> {
    // 不含 ":" 时视为已生成的 JWT 或普通 Bearer Token，直接使用
    let (ak, sk) = api_key.split_once(':')?;
    if ak.is_empty() || sk.is_empty() {
        return None;
    }

    let now = chrono::Utc::now().timestamp() as usize;
    let claims = serde_json::json!({
        "iss": ak,
        "exp": now + 1800,
        "nbf": now - 5
    });

    let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
    let key = jsonwebtoken::EncodingKey::from_secret(sk.as_bytes());

    jsonwebtoken::encode(&header, &claims, &key).ok()
}
