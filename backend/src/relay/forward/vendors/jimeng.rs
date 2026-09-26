/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use super::super::media;

// ── 即梦AI（火山引擎 CV 视觉服务）────────────────────────────

/// 解析即梦两段式密钥 AccessKeyID:SecretAccessKey
pub fn parse_jimeng_key(api_key: &str) -> (&str, &str) {
    let parts: Vec<&str> = api_key.splitn(2, ':').collect();
    if parts.len() >= 2 {
        (parts[0], parts[1])
    } else {
        ("", "")
    }
}

/// 即梦AI签名鉴权头构建（火山引擎 CV 服务 Signature V4）
/// action: "CVSync2AsyncSubmitTask" 或 "CVSync2AsyncGetResult"
/// base_url: 渠道配置的上游地址，用于动态提取 host（如 https://visual.volcengineapi.com）
/// 仅返回签名相关 header（X-Date/X-Content-Sha256/Authorization），
/// Content-Type 和 Host 由调用方或 reqwest 自动设置，避免重复 header 导致签名不匹配
pub fn build_jimeng_headers(
    access_key: &str,
    secret_key: &str,
    action: &str,
    body: &str,
    base_url: &str,
) -> Vec<(String, String)> {
    #[cfg(not(feature = "commercial_plugins"))]
    {
        let _ = access_key;
        let _ = secret_key;
        let _ = action;
        let _ = body;
        let _ = base_url;
        crate::relay_debug!("[JimengSign] 签名在开源版本（未装载商业插件）中未启用");
        vec![]
    }
    #[cfg(feature = "commercial_plugins")]
    {
        // 从 base_url 动态提取 host（与素材库 call_api 一致）
        // 简单字符串解析：去掉 scheme 后取到第一个 / 或结尾
        let host = base_url
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap_or("visual.volcengineapi.com");
        let query = format!("Action={}&Version=2022-08-31", action);
        let (auth, x_date, payload_hash) = crate::services::volcengine::volcengine_sign(
            access_key,
            secret_key,
            "POST",
            &host,
            "/",
            &query,
            "cv",
            "cn-north-1",
            body.as_bytes(),
        );
        // 调试日志：输出签名关键参数，便于排查 SignatureDoesNotMatch
        crate::relay_debug!(
            "[JimengSign] 主机={} 查询参数={} AK={} 消息体长度={} 消息体哈希={} 日期={}",
            host,
            query,
            access_key,
            body.len(),
            payload_hash,
            x_date
        );
        // 仅返回签名相关 header（与素材库 call_api 一致，不设 Content-Type/Host）
        vec![
            ("X-Date".to_string(), x_date),
            ("X-Content-Sha256".to_string(), payload_hash),
            ("Authorization".to_string(), auth),
        ]
    }
}

/// 即梦图片请求体构建：OpenAI 格式 → 即梦 CV 格式
/// req_key 固定为渠道模型映射后的 model（无映射时即为渠道里选择的模型ID）
pub(crate) fn build_jimeng_image_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    let mut fwd = body.clone();
    // req_key = 模型标识（由渠道模型映射决定）
    fwd["req_key"] = serde_json::json!(model);
    // 清理 OpenAI 特有字段（已转换为即梦原生参数）
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("model");
    }

    // OpenAI size → 即梦 width/height（仅当用户未直接传 width/height 时）
    if fwd.get("width").is_none() && fwd.get("height").is_none() {
        if let Some(size) = body.get("size").and_then(|v| v.as_str()) {
            if let Some((w, h)) = size
                .split_once('x')
                .or_else(|| size.split_once('X'))
                .or_else(|| size.split_once('×'))
                .or_else(|| size.split_once('*'))
            {
                if let (Ok(wv), Ok(hv)) = (w.parse::<i64>(), h.parse::<i64>()) {
                    fwd["width"] = serde_json::json!(wv);
                    fwd["height"] = serde_json::json!(hv);
                }
            }
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("size");
    }

    // OpenAI image/image_urls → 即梦 image_urls（优先级: image > image_urls）
    if fwd.get("image_urls").is_none() {
        let images = media::collect_image_urls(body, &["image", "image_urls"]);
        if !images.is_empty() {
            fwd["image_urls"] = serde_json::json!(images);
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("image");
    }

    // 清理 OpenAI 特有字段（return_url/logo_info 在轮询阶段的 req_json 中构建）
    if let Some(obj) = fwd.as_object_mut() {
        media::remove_openai_compat_fields(obj);
    }

    fwd
}

/// 即梦视频请求体构建：OpenAI 格式 → 即梦 CV 格式
pub(crate) fn build_jimeng_video_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    let mut fwd = body.clone();
    fwd["req_key"] = serde_json::json!(model);
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("model");
    }

    // OpenAI duration（秒）→ 即梦 frames（5秒=121帧, 10秒=241帧）
    if fwd.get("frames").is_none() {
        if let Some(dur) = body.get("duration").and_then(|v| v.as_f64()) {
            fwd["frames"] = serde_json::json!(if dur <= 5.0 { 121 } else { 241 });
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("duration");
    }

    // OpenAI ratio/aspect_ratio/size → 即梦 aspect_ratio
    if fwd.get("aspect_ratio").is_none() {
        let ratio = body
            .get("ratio")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("size").and_then(|v| v.as_str()));
        if let Some(r) = ratio {
            fwd["aspect_ratio"] = serde_json::json!(r);
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("ratio");
        // 仅清理 size（aspect_ratio 是即梦原生参数，保留）
        obj.remove("size");
    }

    // OpenAI images/image_urls → 判断数据类型：base64 用 binary_data_base64，URL 用 image_urls
    // 优先级: images > image_urls（判断/去前缀与腾讯云 FileInfos 共用）
    if fwd.get("binary_data_base64").is_none() && fwd.get("image_urls").is_none() {
        let images = media::collect_image_urls(body, &["images", "image_urls"]);
        if !images.is_empty() {
            if media::is_b64(&images[0], 1) {
                let cleaned: Vec<&str> = images.iter().map(|s| media::b64_data(s)).collect();
                fwd["binary_data_base64"] = serde_json::json!(cleaned);
            } else {
                fwd["image_urls"] = serde_json::json!(images);
            }
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("images");
    }

    if fwd.get("frames").is_none() {
        fwd["frames"] = serde_json::json!(121);
    }

    // 清理 OpenAI 特有字段（return_url/logo_info 在轮询阶段的 req_json 中构建）
    if let Some(obj) = fwd.as_object_mut() {
        media::remove_openai_compat_fields(obj);
    }

    fwd
}
