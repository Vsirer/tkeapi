/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use super::super::media;
use hmac::Mac;
use sha2::{Digest, Sha256};
// ── 腾讯云 TC3 / VOD AIGC / MPS AI 换装 ─────────────────────────
//
// VOD 密钥：{SecretId}:{SecretKey}:{SubAppId}；模型：{ModelName}@{ModelVersion}
// MPS 密钥：{SecretId}:{SecretKey}

/// 腾讯云媒体转发
pub fn is_tencent_target(target_type: &str) -> bool {
    target_type.starts_with("tencent_vod") || target_type.starts_with("tencent_mps")
}

/// TC3-HMAC-SHA256；必须在完整 body 序列化后调用。VOD 签名字段保持原样（无 charset）。
pub fn build_tencent_tc3_headers(
    secret_id: &str,
    secret_key: &str,
    service: &str,
    host: &str,
    version: &str,
    action: &str,
    body: &str,
) -> Vec<(reqwest::header::HeaderName, reqwest::header::HeaderValue)> {
    let timestamp = chrono::Utc::now().timestamp();
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let hashed_payload = format!("{:x}", Sha256::digest(body.as_bytes()));
    let canonical_request = format!(
        "POST\n/\n\ncontent-type:application/json\nhost:{}\n\ncontent-type;host\n{}",
        host, hashed_payload
    );

    let credential_scope = format!("{}/{}/tc3_request", date, service);
    let hashed_canonical = format!("{:x}", Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TC3-HMAC-SHA256\n{}\n{}\n{}",
        timestamp, credential_scope, hashed_canonical
    );

    let secret_date = hmac_sha256(format!("TC3{}", secret_key).as_bytes(), date.as_bytes());
    let secret_service = hmac_sha256(&secret_date, service.as_bytes());
    let secret_signing = hmac_sha256(&secret_service, b"tc3_request");
    let signature = hex::encode(hmac_sha256(&secret_signing, string_to_sign.as_bytes()));

    let authorization = format!(
        "TC3-HMAC-SHA256 Credential={}/{}, SignedHeaders=content-type;host, Signature={}",
        secret_id, credential_scope, signature
    );

    vec![
        (
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        ),
        (
            reqwest::header::HeaderName::from_static("x-tc-action"),
            reqwest::header::HeaderValue::from_str(action).unwrap(),
        ),
        (
            reqwest::header::HeaderName::from_static("x-tc-version"),
            reqwest::header::HeaderValue::from_str(version).unwrap(),
        ),
        (
            reqwest::header::HeaderName::from_static("x-tc-timestamp"),
            reqwest::header::HeaderValue::from_str(&timestamp.to_string()).unwrap(),
        ),
        (
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&authorization).unwrap(),
        ),
    ]
}

pub fn build_tencent_vod_headers(
    secret_id: &str,
    secret_key: &str,
    action: &str,
    body: &str,
) -> Vec<(reqwest::header::HeaderName, reqwest::header::HeaderValue)> {
    build_tencent_tc3_headers(
        secret_id,
        secret_key,
        "vod",
        "vod.tencentcloudapi.com",
        "2018-07-17",
        action,
        body,
    )
}

pub fn build_tencent_mps_headers(
    secret_id: &str,
    secret_key: &str,
    action: &str,
    body: &str,
) -> Vec<(reqwest::header::HeaderName, reqwest::header::HeaderValue)> {
    build_tencent_tc3_headers(
        secret_id,
        secret_key,
        "mps",
        "mps.tencentcloudapi.com",
        "2019-06-12",
        action,
        body,
    )
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(key).expect("HMAC key");
    mac.update(msg);
    mac.finalize().into_bytes().to_vec()
}

/// 解析三段式密钥 SecretId:SecretKey:SubAppId
pub fn parse_tencent_vod_key(api_key: &str) -> (&str, &str, u64) {
    let parts: Vec<&str> = api_key.splitn(3, ':').collect();
    if parts.len() >= 3 {
        (parts[0], parts[1], parts[2].parse().unwrap_or(0))
    } else {
        ("", "", 0)
    }
}

/// MPS：SecretId:SecretKey（第三段若有则忽略）
pub fn parse_tencent_mps_key(api_key: &str) -> (&str, &str) {
    let Some((ak, rest)) = api_key.split_once(':') else {
        return ("", "");
    };
    (ak, rest.split_once(':').map(|(s, _)| s).unwrap_or(rest))
}

/// 拆分 ModelName@ModelVersion
fn split_model(model_str: &str) -> (&str, &str) {
    model_str.split_once('@').unwrap_or((model_str, ""))
}

/// settings.key，否则顶层 key（兼容可灵官方 settings）
fn tc_setting<'a>(body: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Value> {
    body.get("settings")
        .and_then(|s| s.get(key))
        .or_else(|| body.get(key))
}

fn tc_prompt_str(v: Option<&serde_json::Value>) -> Option<&str> {
    v.and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn tc_enabled_flag(v: &serde_json::Value) -> bool {
    media::json_truthy(v)
}

fn tc_en_dis(enabled: bool) -> &'static str {
    if enabled {
        "Enabled"
    } else {
        "Disabled"
    }
}

fn tc_push_unique(dst: &mut Vec<String>, url: &str) {
    if !url.is_empty() && !dst.iter().any(|e| e == url) {
        dst.push(url.to_string());
    }
}

fn tc_push_image(dst: &mut Vec<(String, &'static str)>, url: &str, role: &'static str) {
    if !url.is_empty() && !dst.iter().any(|(e, _)| e == url) {
        dst.push((url.to_string(), role));
    }
}

fn tc_list_image_role(role: &str) -> &'static str {
    match role {
        "first_frame" => "first_frame",
        "end_frame" | "last_frame" => "last_frame",
        _ => "reference_image",
    }
}

fn tc_content_media_url(item: &serde_json::Value) -> Option<&str> {
    item.get("url")
        .or_else(|| item.get("image_url"))
        .or_else(|| item.get("video_url"))
        .or_else(|| item.get("audio_url"))
        .and_then(media::as_media_url)
}

/// 视频输入源：顶层标准参数 + contents/content 多模态数组
fn tc_collect_video_src(
    body: &serde_json::Value,
) -> (Option<&str>, Vec<(String, &'static str)>, Vec<String>, Vec<String>) {
    let mut prompt = tc_prompt_str(body.get("prompt").or_else(|| body.get("Prompt")));
    let mut images: Vec<(String, &'static str)> = Vec::new();
    let mut videos: Vec<String> = Vec::new();
    let mut audios: Vec<String> = Vec::new();

    // 1. 视频与音频输入（OpenAI 兼容参数: videos, audios）
    for u in media::collect_image_urls(body, &["videos"]) {
        tc_push_unique(&mut videos, &u);
    }
    for u in media::collect_image_urls(body, &["audios"]) {
        tc_push_unique(&mut audios, &u);
    }

    // 2. 图片输入：OpenAI 兼容列表 (images, image_urls)
    let list_images = media::collect_media_values(body, &["images", "image_urls"]);
    if !list_images.is_empty() {
        let defaults = media::infer_image_default_roles(list_images.len());
        for (i, item) in list_images.iter().enumerate() {
            let (url, role) =
                media::parse_media_item(item, defaults.get(i).copied().unwrap_or("reference_image"));
            if let Some(u) = url.filter(|s| !s.is_empty()) {
                tc_push_image(&mut images, u, tc_list_image_role(role));
            }
        }
    }

    // 3. 可灵官方 / OpenAI 多模态 contents/content 数组
    for key in ["contents", "content"] {
        if let Some(arr) = body.get(key).and_then(|v| v.as_array()) {
            for item in arr {
                match item.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                    "prompt" | "text" if prompt.is_none() => {
                        prompt = tc_prompt_str(item.get("text"));
                    }
                    "first_frame" => {
                        if let Some(u) = tc_content_media_url(item) {
                            tc_push_image(&mut images, u, "first_frame");
                        }
                    }
                    "last_frame" => {
                        if let Some(u) = tc_content_media_url(item) {
                            tc_push_image(&mut images, u, "last_frame");
                        }
                    }
                    "refer_image" | "image_url" => {
                        if let Some(u) = tc_content_media_url(item) {
                            let role = item.get("role").and_then(|r| r.as_str()).unwrap_or("reference_image");
                            tc_push_image(&mut images, u, tc_list_image_role(role));
                        }
                    }
                    "feature_video" | "base_video" | "video_url" => {
                        if let Some(u) = tc_content_media_url(item) {
                            tc_push_unique(&mut videos, u);
                        }
                    }
                    "audio_url" => {
                        if let Some(u) = tc_content_media_url(item) {
                            tc_push_unique(&mut audios, u);
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    (prompt, images, videos, audios)
}

fn tc_video_usage(role: &str, idx: usize, count: usize, has_video: bool) -> &'static str {
    match role {
        "first_frame" => "FirstFrame",
        "last_frame" => "LastFrame",
        "reference_image" => "Reference",
        _ if has_video || count > 2 => "Reference",
        _ if count == 2 && idx == 0 => "FirstFrame",
        _ if count == 2 => "LastFrame",
        _ => "FirstFrame",
    }
}

/// 组装 FileInfos；尾帧 URL 走 LastFrameUrl，base64 进 FileInfos
fn tc_build_video_file_infos(
    images: Vec<(String, &'static str)>,
    videos: &[String],
    audios: &[String],
) -> (Vec<serde_json::Value>, Option<String>) {
    let has_video = !videos.is_empty();
    let count = images.len();
    let mut fi_arr = Vec::new();
    let mut last_frame_url = None;
    for (idx, (u, role)) in images.into_iter().enumerate() {
        let usage = tc_video_usage(role, idx, count, has_video);
        if usage == "LastFrame" && !media::is_b64(&u, 1) {
            last_frame_url = Some(u);
        } else {
            fi_arr.push(media::tc_file(
                &u,
                &[
                    ("Category", serde_json::json!("Image")),
                    ("Usage", serde_json::json!(usage)),
                ],
            ));
        }
    }
    for vu in videos {
        fi_arr.push(media::tc_file(
            vu,
            &[
                ("Category", serde_json::json!("Video")),
                ("Usage", serde_json::json!("Reference")),
            ],
        ));
    }
    for au in audios {
        fi_arr.push(media::tc_file(
            au,
            &[
                ("Category", serde_json::json!("Audio")),
                ("Usage", serde_json::json!("Reference")),
            ],
        ));
    }
    (fi_arr, last_frame_url)
}

fn tc_build_video_output_config(
    body: &serde_json::Value,
) -> serde_json::Map<String, serde_json::Value> {
    let mut oc = serde_json::Map::new();
    if let Some(r) = tc_setting(body, "resolution").and_then(|v| v.as_str()) {
        oc.insert("Resolution".into(), serde_json::json!(r.to_uppercase()));
    } else if let Some(mode) = body.get("mode").and_then(|v| v.as_str()) {
        let res = match mode {
            "std" => "720P".to_string(),
            "pro" => "1080P".to_string(),
            other => other.to_uppercase(),
        };
        oc.insert("Resolution".into(), serde_json::json!(res));
    }
    if let Some(r) = tc_setting(body, "aspect_ratio")
        .or_else(|| body.get("ratio"))
        .and_then(|v| v.as_str())
    {
        oc.insert("AspectRatio".into(), serde_json::json!(r));
    }
    if let Some(d) = tc_setting(body, "duration") {
        if let Some(n) = d
            .as_f64()
            .or_else(|| d.as_str().and_then(|s| s.parse::<f64>().ok()))
        {
            oc.insert("Duration".into(), serde_json::json!(n));
        }
    }
    if let Some(op) = body.get("OffPeak").and_then(|v| v.as_str()) {
        oc.insert("OffPeak".into(), serde_json::json!(op));
    } else if body.get("service_tier").and_then(|v| v.as_str()) == Some("flex") {
        oc.insert("OffPeak".into(), serde_json::json!("Enabled"));
    }
    if let Some(wm) = body.get("watermark") {
        oc.insert(
            "LogoAdd".into(),
            serde_json::json!(tc_en_dis(tc_enabled_flag(wm))),
        );
    }
    // generate_audio > settings.audio/audio > sound
    let audio = if let Some(ga) = body.get("generate_audio") {
        Some(tc_enabled_flag(ga))
    } else if let Some(a) = tc_setting(body, "audio").and_then(|v| v.as_str()) {
        Some(!matches!(a.to_ascii_lowercase().as_str(), "off" | "false"))
    } else {
        body.get("sound")
            .and_then(|v| v.as_str())
            .map(|s| s.eq_ignore_ascii_case("on"))
    };
    if let Some(enabled) = audio {
        oc.insert(
            "AudioGeneration".into(),
            serde_json::json!(tc_en_dis(enabled)),
        );
    }
    if !oc.contains_key("Resolution") {
        oc.insert("Resolution".into(), serde_json::json!("720P"));
    }
    oc.insert("InputComplianceCheck".into(), serde_json::json!("Disabled"));
    oc.insert(
        "OutputComplianceCheck".into(),
        serde_json::json!("Disabled"),
    );
    oc
}

fn tc_apply_enhance_prompt(tb: &mut serde_json::Value, body: &serde_json::Value) {
    if let Some(v) = body.get("EnhancePrompt").and_then(|v| v.as_str()) {
        tb["EnhancePrompt"] = serde_json::json!(v);
    } else if let Some(v) = body
        .get("prompt_extend")
        .or_else(|| body.get("enhance_prompt"))
    {
        let enabled = tc_enabled_flag(v)
            || v.as_str()
                .is_some_and(|s| s.eq_ignore_ascii_case("enabled"));
        tb["EnhancePrompt"] = serde_json::json!(tc_en_dis(enabled));
    }
}

/// 提取图片分辨率：OpenAI resolution → size 转大写分辨率（如 1K/2K/4K 等）
fn tc_extract_resolution(body: &serde_json::Value) -> Option<String> {
    body.get("resolution")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            body.get("size")
                .and_then(|v| v.as_str())
                .and_then(crate::relay::usage_extractor::parse_pixel_resolution)
                .map(|s| s.to_uppercase())
        })
}

/// 提取图片宽高比：OpenAI ratio / aspect_ratio → size 转最近标准宽高比（如 16:9, 1:1 等）
fn tc_extract_aspect_ratio(body: &serde_json::Value) -> Option<&str> {
    body.get("ratio")
        .or_else(|| body.get("aspect_ratio"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or_else(|| body.get("size").and_then(|v| v.as_str()).and_then(media::size_to_ratio))
}

// ── 图片请求体构建 ──────────────────────────────────────
// OpenAI snake_case → 腾讯云 PascalCase
// AigcImageOutputConfig：Resolution / AspectRatio / OutputImageCount / OutputFormat / LogoAdd

pub fn build_tencent_vod_image_body(
    model_str: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    let (model_name, model_version) = split_model(model_str);
    let mut tb = serde_json::json!({ "ModelName": model_name });
    if !model_version.is_empty() {
        tb["ModelVersion"] = serde_json::json!(model_version);
    }

    // Prompt / NegativePrompt
    if let Some(v) = body.get("prompt").and_then(|v| v.as_str()) {
        tb["Prompt"] = serde_json::json!(v);
    }
    if let Some(v) = body.get("negative_prompt").and_then(|v| v.as_str()) {
        tb["NegativePrompt"] = serde_json::json!(v);
    }

    // FileInfos：用户已传直接透传；否则从 image / image_urls 构建（图片模型无需 Category，仅视频模型需要）
    if let Some(fi) = body.get("FileInfos") {
        tb["FileInfos"] = fi.clone();
    } else {
        let urls = media::collect_image_urls(body, &["image", "image_urls"]);
        if !urls.is_empty() {
            let fi: Vec<_> = urls.iter().map(|u| media::tc_file(u, &[])).collect();
            tb["FileInfos"] = serde_json::json!(fi);
        }
    }

    // OutputConfig：已有则原样透传；否则仅从 OpenAI 扁平参数构建
    if let Some(oc) = body.get("OutputConfig") {
        tb["OutputConfig"] = oc.clone();
    } else {
        let mut oc = serde_json::Map::new();
        if let Some(n) = body.get("n").and_then(|v| v.as_i64()) {
            oc.insert("OutputImageCount".into(), serde_json::json!(n));
        }
        let resolution = tc_extract_resolution(body).unwrap_or_else(|| "1K".into());
        oc.insert("Resolution".into(), serde_json::json!(resolution));
        if let Some(ar) = tc_extract_aspect_ratio(body) {
            oc.insert("AspectRatio".into(), serde_json::json!(ar));
        }
        // output_format → OutputFormat（勿用 response_format，那是投递方式）
        if let Some(f) = body.get("output_format").and_then(|v| v.as_str()) {
            oc.insert("OutputFormat".into(), serde_json::json!(f));
        }
        if let Some(wm) = body.get("watermark") {
            oc.insert(
                "LogoAdd".into(),
                serde_json::json!(tc_en_dis(tc_enabled_flag(wm))),
            );
        }
        tb["OutputConfig"] = serde_json::Value::Object(oc);
    }

    if let Some(s) = body.get("seed") {
        tb["Seed"] = s.clone();
    }
    if let Some(v) = body.get("ExtInfo") {
        tb["ExtInfo"] = v.clone();
    }
    tc_apply_enhance_prompt(&mut tb, body);
    tb
}

// ── MPS AI 换装 ProcessImage ──────────────────────────────────────
// 有 InputInfo → 官方字段透传；否则 OpenAI → AiTryOnConfig（resolution 缺省 1K）

const MPS_TRYON_PASSTHROUGH: &[&str] = &[
    "InputInfo",
    "OutputStorage",
    "OutputDir",
    "OutputPath",
    "Definition",
    "ResourceId",
    "ImageTask",
    "ScheduleId",
    "AddOnParameter",
    "StdExtInfo",
];

fn mps_media_input(url: &str) -> serde_json::Value {
    serde_json::json!({
        "Type": "URL",
        "UrlInputInfo": { "Url": url.trim() }
    })
}

fn mps_collect_tryon_images(body: &serde_json::Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for field in ["image", "image_urls"] {
        let Some(val) = body.get(field) else {
            continue;
        };
        let push = |out: &mut Vec<(String, String)>, item: &serde_json::Value| {
            let (url, ty) = media::parse_media_item(item, "garment");
            if let Some(u) = url.filter(|s| !s.is_empty()) {
                out.push((u.to_string(), ty.to_ascii_lowercase()));
            }
        };
        if let Some(arr) = val.as_array() {
            for item in arr {
                push(&mut out, item);
            }
        } else {
            push(&mut out, val);
        }
    }
    out
}

pub fn build_tencent_mps_tryon_body(
    model_str: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    if body.get("InputInfo").is_some() {
        let mut tb = serde_json::json!({});
        for k in MPS_TRYON_PASSTHROUGH {
            if let Some(v) = body.get(*k) {
                tb[*k] = v.clone();
            }
        }
        return tb;
    }

    let mut tb = serde_json::json!({ "OutputStorage": {"Type": "RMS"} });
    let images = mps_collect_tryon_images(body);
    if let Some((model_url, _)) = images.first() {
        tb["InputInfo"] = mps_media_input(model_url);
    }
    // 1 张：同一张进 ImageSet（上游要求至少 1 张参考）；2+ 张：首张模特，其余参考
    let refs = match images.len() {
        0 => &[][..],
        1 => images.as_slice(),
        _ => &images[1..],
    };
    if !refs.is_empty() {
        tb["AddOnParameter"] = serde_json::json!({
            "ImageSet": refs.iter().map(|(url, ty)| serde_json::json!({
                "Type": ty,
                "Image": mps_media_input(url)
            })).collect::<Vec<_>>()
        });
    }

    let resolution = body
        .get("resolution")
        .or_else(|| body.get("Resolution"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_uppercase())
        .unwrap_or_else(|| "1K".into());
    let mut cfg = serde_json::json!({
        "Model": model_str,
        "Resolution": resolution
    });
    if let Some(p) = tc_prompt_str(body.get("prompt").or_else(|| body.get("Prompt"))) {
        cfg["Prompt"] = serde_json::json!(p);
    }
    tb["ImageTask"] = serde_json::json!({ "AiTryOnConfig": cfg });
    tb
}

// ── MPS 场景生图 ProcessImage ──────────────────────────────────────
// 官方 CreateImageConfig 字段：Model, Prompt, Resolution, AspectRatio, AdditionalParameters
// 文生图不传图片；图生图通过 AddOnParameter.ImageSet 传参（无 garment/主体图限制）

fn mps_collect_create_images(body: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    for field in ["image", "image_urls"] {
        let Some(val) = body.get(field) else {
            continue;
        };
        let push = |out: &mut Vec<String>, item: &serde_json::Value| {
            let (url, _) = media::parse_media_item(item, "");
            if let Some(u) = url.filter(|s| !s.is_empty()) {
                out.push(u.to_string());
            }
        };
        if let Some(arr) = val.as_array() {
            for item in arr {
                push(&mut out, item);
            }
        } else {
            push(&mut out, val);
        }
    }
    out
}

pub fn build_tencent_mps_create_image_body(
    model_str: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    if body.get("InputInfo").is_some() || body.get("ImageTask").is_some() {
        let mut tb = serde_json::json!({});
        for k in MPS_TRYON_PASSTHROUGH {
            if let Some(v) = body.get(*k) {
                tb[*k] = v.clone();
            }
        }
        return tb;
    }

    let mut tb = serde_json::json!({ "OutputStorage": {"Type": "RMS"} });
    let images = mps_collect_create_images(body);
    if !images.is_empty() {
        tb["AddOnParameter"] = serde_json::json!({
            "ImageSet": images.iter().map(|url| serde_json::json!({
                "Image": mps_media_input(url)
            })).collect::<Vec<_>>()
        });
    }

    let mut cfg = serde_json::json!({ "Model": model_str });
    if let Some(p) = tc_prompt_str(body.get("prompt")) {
        cfg["Prompt"] = serde_json::json!(p);
    }
    let resolution = tc_extract_resolution(body).unwrap_or_else(|| "1K".into());
    cfg["Resolution"] = serde_json::json!(resolution);
    if let Some(ar) = tc_extract_aspect_ratio(body) {
        cfg["AspectRatio"] = serde_json::json!(ar);
    }
    if let Some(ap) = body.get("additional_parameters") {
        cfg["AdditionalParameters"] = ap.clone();
    }
    tb["ImageTask"] = serde_json::json!({ "CreateImageConfig": cfg });
    tb
}

// ── 视频请求体构建 ──────────────────────────────────────
// AigcVideoOutputConfig：Duration / Resolution / AspectRatio
// FileInfos Usage：有视频时图片=Reference；无视频≤2张=FirstFrame/LastFrame，>2=Reference
// 可灵官方 contents/settings 经此转换为腾讯云 PascalCase

pub fn build_tencent_vod_video_body(
    model_str: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    let (model_name, model_version) = split_model(model_str);
    let mut tb = serde_json::json!({ "ModelName": model_name });
    if !model_version.is_empty() {
        tb["ModelVersion"] = serde_json::json!(model_version);
    }

    if let Some(v) = body
        .get("negative_prompt")
        .or_else(|| body.get("NegativePrompt"))
        .and_then(|v| v.as_str())
    {
        tb["NegativePrompt"] = serde_json::json!(v);
    }

    if let Some(p) = tc_prompt_str(body.get("prompt").or_else(|| body.get("Prompt"))) {
        tb["Prompt"] = serde_json::json!(p);
    }

    if let Some(fi) = body.get("FileInfos") {
        tb["FileInfos"] = fi.clone();
    } else {
        let (prompt_opt, images, videos, audios) = tc_collect_video_src(body);
        if tb.get("Prompt").is_none() {
            if let Some(v) = prompt_opt {
                tb["Prompt"] = serde_json::json!(v);
            }
        }
        let (fi_arr, last_frame_url) = tc_build_video_file_infos(images, &videos, &audios);
        if let Some(url) = last_frame_url {
            tb["LastFrameUrl"] = serde_json::json!(url);
        }
        if !fi_arr.is_empty() {
            tb["FileInfos"] = serde_json::json!(fi_arr);
        }
    }

    // 用户显式 LastFrameUrl 原样透传（可与 FileInfos 并存，覆盖推导结果）
    if let Some(v) = body.get("LastFrameUrl") {
        tb["LastFrameUrl"] = v.clone();
    }

    if let Some(oc) = body.get("OutputConfig") {
        tb["OutputConfig"] = oc.clone();
    } else {
        tb["OutputConfig"] = serde_json::Value::Object(tc_build_video_output_config(body));
    }

    if let Some(s) = body.get("seed").or_else(|| body.get("Seed")) {
        tb["Seed"] = s.clone();
    }
    if let Some(v) = body.get("SubjectInfo").or_else(|| body.get("subject_info")) {
        tb["SubjectInfo"] = v.clone();
    }
    if let Some(ext) = tc_build_ext_info(body) {
        tb["ExtInfo"] = serde_json::json!(ext);
    }
    tc_apply_enhance_prompt(&mut tb, body);
    tb
}

fn tc_parse_sub_map(v: Option<&serde_json::Value>) -> serde_json::Map<String, serde_json::Value> {
    v.and_then(|v| {
        v.as_str()
            .and_then(|s| serde_json::from_str(s).ok())
            .or_else(|| v.as_object().cloned())
    })
    .unwrap_or_default()
}

fn tc_build_ext_info(body: &serde_json::Value) -> Option<String> {
    let mut ext_map = tc_parse_sub_map(body.get("ExtInfo"));

    // 1. AdditionalParameters（如 return_last_frame, omni_reference_task_type）
    let mut add_params = tc_parse_sub_map(
        ext_map
            .get("AdditionalParameters")
            .or_else(|| body.get("AdditionalParameters")),
    );
    for key in ["return_last_frame", "omni_reference_task_type"] {
        if let Some(v) = body.get(key) {
            add_params.insert(key.to_string(), v.clone());
        }
    }
    if !add_params.is_empty() {
        if let Ok(s) = serde_json::to_string(&add_params) {
            ext_map.insert("AdditionalParameters".to_string(), serde_json::json!(s));
        }
    }

    // 2. WandVegaParameters（提示词优化：EnhancePromptMode，兼容 OpenAI 参数）
    let mut wand_params = tc_parse_sub_map(
        ext_map
            .get("WandVegaParameters")
            .or_else(|| body.get("WandVegaParameters")),
    );
    if let Some(v) = body.get("EnhancePromptMode") {
        wand_params.insert("EnhancePromptMode".to_string(), v.clone());
    } else if let Some(v) = body
        .get("enhance_prompt")
        .or_else(|| body.get("prompt_extend"))
        .or_else(|| body.get("EnhancePrompt"))
    {
        let mode = if media::json_truthy(v)
            || v.as_str().is_some_and(|s| {
                matches!(
                    s.to_ascii_lowercase().as_str(),
                    "enabled" | "enable" | "on"
                )
            }) {
            "enable"
        } else {
            "disable"
        };
        wand_params.insert("EnhancePromptMode".to_string(), serde_json::json!(mode));
    }
    if !wand_params.is_empty() {
        if let Ok(s) = serde_json::to_string(&wand_params) {
            ext_map.insert("WandVegaParameters".to_string(), serde_json::json!(s));
        }
    }

    if ext_map.is_empty() {
        None
    } else {
        serde_json::to_string(&ext_map).ok()
    }
}

