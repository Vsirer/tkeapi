/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use super::proxy;
use super::task::{normalize_task_status, poll_task_result, PollOutcome, PollTaskOpts};
use crate::error::{AppError, AppResult};
use crate::models::{BillingRule, Channel};
use crate::relay::{forward, response_formatter};
use crate::AppState;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

/// 增强版本 → (billing version, 火山 mid)；非法返回 None
fn cascade_enhance_pair(version: &str) -> Option<(&'static str, &'static str)> {
    match version.trim().to_ascii_lowercase().as_str() {
        "fast" => Some(("fast", "vve-ft")),
        "standard" => Some(("standard", "vve-sd")),
        "pro" => Some(("pro", "vve-pf")),
        "ai" => Some(("ai", "vve-gt")),
        _ => None,
    }
}

/// 阶段二超分分辨率入参：非大模型 + 目标 480p → 整型 `resolution_limit=480`（锁标准 480p）；否则字符串 `resolution`
fn cascade_s2_apply_resolution_param(payload: &mut serde_json::Value, target_res: &str, mid: &str) {
    let Some(obj) = payload.as_object_mut() else {
        return;
    };
    obj.remove("resolution");
    obj.remove("resolution_limit");
    let res = target_res.trim().to_ascii_lowercase();
    // 非 vve-gt：MediaKit resolution_limit 为像素上限整型，与字符串 resolution 互斥
    if !mid.trim().eq_ignore_ascii_case("vve-gt") && res == "480p" {
        obj.insert("resolution_limit".to_string(), serde_json::json!(496));
    } else {
        obj.insert("resolution".to_string(), serde_json::json!(res));
    }
}

/// 优先用转发规则 res_enhance[目标分辨率]；缺省/非法/分辨率不支持的 ai → 标准版
pub(crate) fn cascade_resolve_enhance(
    target_res: &str,
    res_enhance: &HashMap<String, String>,
) -> (&'static str, &'static str) {
    let key = target_res.trim().to_ascii_lowercase();
    res_enhance
        .get(&key)
        .and_then(|ver| {
            let pair = cascade_enhance_pair(ver)?;
            // 大模型增强（ai）仅 720p / 1080p / 2k
            if pair.0 == "ai" && !matches!(key.as_str(), "720p" | "1080p" | "2k") {
                None
            } else {
                Some(pair)
            }
        })
        .unwrap_or(("standard", "vve-sd"))
}

/// 标准版增强场景枚举（仅 tool_version=standard 生效）
fn cascade_scene_pair(scene: &str) -> Option<&'static str> {
    match scene.trim().to_ascii_lowercase().as_str() {
        "common" => Some("common"),
        "ugc" => Some("ugc"),
        "short_series" => Some("short_series"),
        "aigc" => Some("aigc"),
        "old_film" => Some("old_film"),
        _ => None,
    }
}

/// 仅标准增强返回场景；配置合法则用配置，否则 common；非标准 → None
pub(crate) fn cascade_resolve_scene(
    cascade_version: &str,
    target_res: &str,
    res_scene: &HashMap<String, String>,
) -> Option<&'static str> {
    if cascade_version != "standard" {
        return None;
    }
    Some(
        res_scene
            .get(&target_res.trim().to_ascii_lowercase())
            .and_then(|s| cascade_scene_pair(s))
            .unwrap_or("common"),
    )
}

fn cascade_is_res(s: &str) -> bool {
    matches!(
        s.trim().to_ascii_lowercase().as_str(),
        "480p" | "720p" | "768p" | "1080p" | "2k" | "4k"
    )
}

/// 与 cascade_enhance_pair 同源，避免版本枚举双份维护
fn cascade_is_version(s: &str) -> bool {
    cascade_enhance_pair(s).is_some()
}

/// 目标分辨率允许的底座列表（首项为默认一级；单元素即锁定不可改）
fn cascade_allowed_bases(target: &str) -> &'static [&'static str] {
    match target.trim().to_ascii_lowercase().as_str() {
        "480p" => &["480p"],
        "720p" => &["480p", "720p"],
        "1080p" => &["720p", "480p", "1080p"],
        "2k" | "4k" => &["1080p", "720p", "480p"],
        _ => &["720p"],
    }
}

/// 有分辨率计费时返回已启用集合；非分辨率计费或无配置则返回 None
fn cascade_billing_enabled_resolutions(
    rule: &BillingRule,
    cascade_version: &str,
) -> Option<HashSet<String>> {
    // requests (按次计费) 不参与分辨率拦截
    if rule.billing_type.eq_ignore_ascii_case("requests") {
        return None;
    }
    if (rule.extended_config.is_empty() || rule.extended_config == "{}")
        && (rule.pricing_tiers.is_empty() || rule.pricing_tiers == "[]")
    {
        return None;
    }

    let ext: serde_json::Value = serde_json::from_str(&rule.extended_config).unwrap_or_default();
    let mut has_res_billing = false;
    let mut enabled = HashSet::new();

    if let Some(rates) = ext.get("resolution_rates").and_then(|v| v.as_object()) {
        has_res_billing = true;
        for k in rates.keys().filter(|k| cascade_is_res(k)) {
            enabled.insert(k.to_ascii_lowercase());
        }
    }

    if let Some(pt) = ext.get("price_table").and_then(|v| v.as_object()) {
        let disabled: HashSet<String> = ext
            .get("price_table_disabled")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_ascii_lowercase()))
                    .collect()
            })
            .unwrap_or_default();
        for key in pt.keys() {
            let lower = key.to_ascii_lowercase();
            let parts: Vec<&str> = lower.split('|').collect();
            let res = match parts.as_slice() {
                [ver, res, ..] if cascade_is_version(ver) && cascade_is_res(res) => {
                    has_res_billing = true;
                    if cascade_version.is_empty() || ver.eq_ignore_ascii_case(cascade_version) {
                        Some(*res)
                    } else {
                        None
                    }
                }
                [attr, res] if !cascade_is_version(attr) && cascade_is_res(res) => {
                    has_res_billing = true;
                    Some(*res)
                }
                _ => None,
            };
            if let Some(res) = res {
                if !disabled.contains(&lower) {
                    enabled.insert(res.to_string());
                }
            }
        }
    }

    if !rule.pricing_tiers.is_empty() && rule.pricing_tiers != "[]" {
        if let Ok(tiers) = serde_json::from_str::<Vec<serde_json::Value>>(&rule.pricing_tiers) {
            for tier in tiers {
                let Some(res) = tier.get("resolution").and_then(|v| v.as_str()) else {
                    continue;
                };
                if !cascade_is_res(res) {
                    continue;
                }
                has_res_billing = true;
                if tier
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
                {
                    enabled.insert(res.trim().to_ascii_lowercase());
                }
            }
        }
    }

    has_res_billing.then_some(enabled)
}

/// 格式与计费启用校验：仅当模型存在生效的分辨率计费配置时才进行开启拦截；非分辨率计费则直接放行。
pub(crate) fn cascade_check_resolution(
    db_rule: Option<&BillingRule>,
    cascade_version: &str,
    res_str: &str,
) -> AppResult<()> {
    let Some(rule) = db_rule else {
        return Ok(());
    };
    let Some(enabled) = cascade_billing_enabled_resolutions(rule, cascade_version) else {
        return Ok(());
    };
    let key = res_str.trim().to_ascii_lowercase();
    if enabled.contains(&key) {
        return Ok(());
    }
    Err(AppError::BadRequest(format!(
        "当前分辨率 {} 不支持",
        res_str.trim()
    )))
}

/// 优先用转发规则 res_base[目标]；缺省/非法回退默认一级底座（allowed 首项）
pub(crate) fn cascade_resolve_base(
    target: &str,
    res_base: &HashMap<String, String>,
) -> &'static str {
    let key = target.trim().to_ascii_lowercase();
    let allowed = cascade_allowed_bases(&key);
    res_base
        .get(&key)
        .and_then(|configured| {
            let b = configured.trim().to_ascii_lowercase();
            allowed.iter().copied().find(|a| a.eq_ignore_ascii_case(&b))
        })
        .unwrap_or_else(|| allowed.first().copied().unwrap_or("720p"))
}

/// MediaKit 共用上下文（state + 增强渠道鉴权），避免裁剪/抽帧重复传参。
struct CascadeMk<'a> {
    state: &'a AppState,
    ch: &'a Channel,
    auth_type: &'a str,
}

/// MediaKit 异步工具：POST → `poll_task_result`（5→1s）→ 取 `out_ptr`。
/// POST 提交失败重试仍用短退避，与任务状态轮询分离。
async fn cascade_mk_url(
    mk: &CascadeMk<'_>,
    path: &str,
    payload: serde_json::Value,
    out_ptr: &str,
) -> Option<String> {
    let resolved = forward::ResolvedForward {
        auth_type: mk.auth_type.to_string(),
        upstream_path: path.to_string(),
        poll_path: Some("/api/v1/tasks/${task_id}".to_string()),
        ..Default::default()
    };
    let url = forward::build_upstream_url(&mk.ch.base_url, &resolved, "", &mk.ch.api_key);

    let mut attempt = 0u32;
    let task_id = loop {
        attempt += 1;
        let mut body = payload.clone();
        let builder =
            crate::services::http_client::with_upstream_timeout(forward::apply_request_auth(
                mk.state
                    .http_client
                    .post(&url)
                    .header("Content-Type", "application/json"),
                &resolved,
                &mk.ch.api_key,
                &mut body,
                &mk.ch.base_url,
            ));
        let retry = match builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status != 200 {
                    crate::relay::proxy::is_poll_transport_retryable(status)
                } else {
                    let text = resp.text().await.unwrap_or_default();
                    let post: serde_json::Value =
                        serde_json::from_str(&text).unwrap_or(serde_json::json!({}));
                    let id = response_formatter::find_id(&post);
                    if !id.is_empty() && !response_formatter::is_upstream_error_response(&post) {
                        break id;
                    }
                    false
                }
            }
            Err(_) => true,
        };
        if retry && attempt < 5 {
            let delay = (2u64 << (attempt - 1)).min(10);
            tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            continue;
        }
        return None;
    };

    let PollOutcome::Succeeded(body) =
        poll_task_result(mk.state, mk.ch, &resolved, &task_id, PollTaskOpts::default()).await
    else {
        return None;
    };
    let v: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    v.pointer(out_ptr)
        .and_then(|u| u.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// 仅 480→720 且 ratio∈{16:9,9:16}：MediaKit 居中裁成标准 480p；否则/失败返回原 URL。
/// 角点：16:9→(2,6,862,490)；9:16→(6,2,490,862)。S1 明确非 480p 时跳过；ratio 优先 S1，缺则 hints。
async fn cascade_ensure_standard_480p_video(
    mk: &CascadeMk<'_>,
    video_url: &str,
    stage1_resp: &serde_json::Value,
    target_resolution: &str,
    field_hints: &[&serde_json::Value],
) -> String {
    fn root<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a str> {
        v.get(key)
            .and_then(|x| x.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    }
    if !target_resolution.eq_ignore_ascii_case("720p") {
        return video_url.to_string();
    }
    // 勿用用户入参 resolution=720p 误判；仅信 S1 回显
    if root(stage1_resp, "resolution").is_some_and(|r| !r.eq_ignore_ascii_case("480p")) {
        return video_url.to_string();
    }
    let Some(ratio) =
        root(stage1_resp, "ratio").or_else(|| field_hints.iter().find_map(|h| root(h, "ratio")))
    else {
        return video_url.to_string();
    };
    let (tlx, tly, brx, bry) = match ratio {
        "16:9" => (2, 6, 862, 490),
        "9:16" => (6, 2, 490, 862),
        _ => return video_url.to_string(),
    };

    cascade_mk_url(
        mk,
        "/api/v1/tools/crop-video",
        serde_json::json!({
            "video_url": video_url,
            "top_left_x": tlx,
            "top_left_y": tly,
            "bottom_right_x": brx,
            "bottom_right_y": bry,
        }),
        "/result/video_url",
    )
    .await
    .unwrap_or_else(|| video_url.to_string())
}

/// S2 成功落库前：stage1 usage×res_mul；S1 有尾帧则对 S2 视频抽帧写入 `s2.last_frame_url`（不改 stage1）。
pub(crate) async fn cascade_on_s2_succeeded(
    state: &AppState,
    ch: &Channel,
    auth_type: &str,
    s1_raw: &mut String,
    s2_raw: &mut String,
    res_mul: &HashMap<String, f64>,
    plugin_tag: &str,
) {
    let mk = CascadeMk {
        state,
        ch,
        auth_type,
    };
    let mut s1: serde_json::Value =
        serde_json::from_str(s1_raw).unwrap_or(serde_json::json!({}));
    let res = cascade_resolve_target_resolution(plugin_tag, "");
    let mul = forward::lookup_res_mul(res_mul, &res);
    if (mul - 1.0).abs() > 1e-9 {
        forward::scale_usage_in_json(&mut s1, mul);
        if let Some(u) = s1.get("usage") {
            response_formatter::json_root_set(s1_raw, "usage", &u.to_string());
        }
    }

    if response_formatter::find_last_frame_url(&s1).is_none() {
        return;
    }
    let mut s2: serde_json::Value = serde_json::from_str(s2_raw).unwrap_or(serde_json::json!({}));
    let Some(video_url) = s2
        .pointer("/result/video_url")
        .and_then(|u| u.as_str())
        .filter(|s| !s.is_empty())
    else {
        return;
    };
    let Some(frame) = cascade_mk_url(
        &mk,
        "/api/v1/tools/extract-frames",
        serde_json::json!({
            "video_url": video_url,
            "snapshot_type": "SpecifiedFrames",
            "specified_frames": [-1],
        }),
        "/result/snapshots/0/image_url",
    )
    .await
    else {
        crate::relay_debug!("[Cascade S2] 尾帧跳过");
        return;
    };
    if let Some(obj) = s2.as_object_mut() {
        obj.insert("last_frame_url".into(), serde_json::json!(frame));
    }
    *s2_raw = s2.to_string();
}

/// 阶段一出参 + 阶段二增强请求；`s1_raw` 空（未开 enable_log）→ None。
fn cascade_upstream_req_combined(s1_raw: &str, s2: &serde_json::Value) -> Option<String> {
    if s1_raw.is_empty() {
        return None;
    }
    let s1: serde_json::Value = serde_json::from_str(s1_raw).unwrap_or(serde_json::json!({}));
    Some(serde_json::json!({ "stage1": s1, "stage2": s2 }).to_string())
}

/// 阶段二 POST HTTP200 无有效 task_id 时的分类（文案/状态码由调用方拼，避免 cascade↔proxy 耦合）。
enum CascadeS2Post200Fail {
    /// 上游业务错误体
    Upstream(serde_json::Value),
    /// 非错误体但解析不到 task_id（调用方宜 warn 原文）
    MissingTaskId,
}

/// 阶段二 POST HTTP200：有 task_id → Ok；否则 Err 分类。
fn cascade_s2_parse_post_200(
    text: &str,
) -> Result<(String, serde_json::Value), CascadeS2Post200Fail> {
    let post: serde_json::Value = serde_json::from_str(text).unwrap_or(serde_json::json!({}));
    let id = response_formatter::find_id(&post);
    if !id.is_empty() {
        return Ok((id, post));
    }
    if response_formatter::is_upstream_error_response(&post) {
        Err(CascadeS2Post200Fail::Upstream(post))
    } else {
        Err(CascadeS2Post200Fail::MissingTaskId)
    }
}

/// JSON 指针取非空字符串；`lower=true` 时转小写（分辨率等），任务 id 等保持原样
fn cascade_json_ptr(json: &str, pointer: &str, lower: bool) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|v| {
            v.pointer(pointer)?.as_str().map(|s| {
                let t = s.trim();
                if lower {
                    t.to_ascii_lowercase()
                } else {
                    t.to_string()
                }
            })
        })
        .filter(|s| !s.is_empty())
}

#[inline]
pub(crate) fn cascade_json_str(json: &str, pointer: &str) -> Option<String> {
    cascade_json_ptr(json, pointer, true)
}

/// 级联对外任务号：`cgt-{YYYYMMDDHHmmss}-{5位随机}`
fn cascade_new_client_task_id() -> String {
    let ts = chrono::Local::now().format("%Y%m%d%H%M%S");
    let u = ulid::Ulid::new().to_string().to_lowercase();
    format!("cgt-{}-{}", ts, &u[21..26])
}

/// 写入 `cascade.s1_task_id`（仅内部），返回对外 cgt（由调用方写入响应体 `id` / `logs.task_id`）
pub(crate) fn cascade_seal_s1_task_id(
    plugin_tag: &mut Option<String>,
    upstream_s1_id: &str,
) -> Option<String> {
    let upstream_s1_id = upstream_s1_id.trim();
    if upstream_s1_id.is_empty() {
        return None;
    }
    let cgt = cascade_new_client_task_id();
    let mut v: serde_json::Value = plugin_tag
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let cascade = v
        .as_object_mut()?
        .entry("cascade")
        .or_insert_with(|| serde_json::json!({}));
    cascade
        .as_object_mut()?
        .insert("s1_task_id".into(), serde_json::json!(upstream_s1_id));
    *plugin_tag = Some(v.to_string());
    Some(cgt)
}

/// 级联目标分辨率：plugin_tag.cascade.resolution → 请求体 resolution → 720p。
fn cascade_resolve_target_resolution(plugin_tag: &str, request_content: &str) -> String {
    cascade_json_str(plugin_tag, "/cascade/resolution")
        .or_else(|| cascade_json_str(request_content, "/resolution"))
        .unwrap_or_else(|| "720p".into())
}

/// 从阶段二增强响应提取帧率（result.fps / 顶层 fps）
fn cascade_s2_fps(s2: &serde_json::Value) -> Option<i64> {
    s2.pointer("/result/fps")
        .or_else(|| s2.get("fps"))
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_u64().map(|u| u as i64))
                .or_else(|| v.as_f64().map(|f| f as i64))
        })
        .filter(|&f| f > 0)
}

/// 级联成功对外：S1 原文骨架叠 S2 产物 URL / 分辨率 / 帧率 / 尾帧；原位改字符串
fn cascade_s1_with_s2_url(s1_raw: &str, s2: &serde_json::Value, plugin_tag: &str) -> String {
    let s1: serde_json::Value = serde_json::from_str(s1_raw).unwrap_or(serde_json::json!({}));
    let new_url = response_formatter::find_urls(s2)
        .into_iter()
        .next()
        .unwrap_or_default();
    let mut out = s1_raw.to_string();
    if new_url.is_empty() {
        return out;
    }
    let old_url = response_formatter::find_urls(&s1)
        .into_iter()
        .next()
        .unwrap_or_default();
    let res_lit = serde_json::json!(cascade_resolve_target_resolution(plugin_tag, "")).to_string();
    let fps_lit = cascade_s2_fps(s2).unwrap_or(24).to_string();
    let url_lit = serde_json::json!(new_url).to_string();
    if !old_url.is_empty() {
        response_formatter::json_replace_str(&mut out, &old_url, &new_url);
    }
    response_formatter::json_replace_fields(
        &mut out,
        &[
            ("video_url", url_lit.as_str()),
            ("resolution", res_lit.as_str()),
            ("framespersecond", fps_lit.as_str()),
            ("fps", fps_lit.as_str()),
        ],
    );
    if let (Some(old_frame), Some(new_frame)) = (
        response_formatter::find_last_frame_url(&s1),
        response_formatter::find_last_frame_url(s2),
    ) {
        response_formatter::json_replace_str(&mut out, old_frame, new_frame);
    }
    out
}

/// 列表/仪表盘/终态落库：去掉 plugin_tag.cascade 中的密钥与上游渠道细节。
/// 返回是否发生了字段删除（无变更则不改写字符串）。
pub(crate) fn cascade_scrub_plugin_tag_for_user(plugin_tag: &mut Option<String>) -> bool {
    let Some(raw) = plugin_tag.as_deref() else {
        return false;
    };
    if !raw.contains("\"cascade\"") {
        return false;
    }
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return false;
    };
    let Some(obj) = v.get_mut("cascade").and_then(|c| c.as_object_mut()) else {
        return false;
    };
    let mut changed = false;
    for key in ["api_key", "base_url", "ch_name", "ch_id", "mid"] {
        if obj.remove(key).is_some() {
            changed = true;
        }
    }
    if changed {
        *plugin_tag = Some(v.to_string());
    }
    changed
}

/// 用户日志级联脱敏（仅 response/post）：
/// 未完成→处理中；成功叠 S2 URL；失败不露 S1；非级联仅在有 cascade 时补 resolution
pub(crate) fn cascade_sanitize_for_user(
    response: &mut Option<String>,
    post_resp: &mut Option<String>,
    plugin_tag: Option<&str>,
    is_completed: bool,
    task_id: &str,
    log_model: &str,
    status_code: i32,
) {
    fn fold_post(raw: String) -> String {
        response_formatter::json_root_raw_value(&raw, "stage1")
            .map(str::to_string)
            .unwrap_or(raw)
    }
    fn take_map(slot: &mut Option<String>, f: impl FnOnce(String) -> String) {
        if let Some(raw) = slot.take() {
            *slot = Some(f(raw));
        }
    }

    let has_cascade = plugin_tag
        .map(|t| t.contains("\"cascade\""))
        .unwrap_or(false);
    let combined = |s: &str| response_formatter::json_root_raw_value(s, "stage1").is_some();
    let cascade_inflight = !is_completed
        && (has_cascade
            || post_resp.as_deref().is_some_and(combined)
            || response.as_deref().is_some_and(combined));

    if cascade_inflight {
        let s1_ack = [response.as_deref(), post_resp.as_deref()]
            .into_iter()
            .flatten()
            .map(cascade_s1_raw_from_log)
            .find(|s| s.contains('"'))
            .unwrap_or("{}");
        let tid_buf = task_id.is_empty().then(|| {
            response_formatter::json_root_raw_value(s1_ack, "id")
                .and_then(|v| serde_json::from_str::<String>(v).ok())
                .unwrap_or_default()
        });
        let tid = tid_buf.as_deref().unwrap_or(task_id);
        *response = Some(cascade_user_processing_response(
            s1_ack,
            tid,
            plugin_tag.unwrap_or(""),
            log_model,
        ));
        take_map(post_resp, |raw| {
            let mut folded = fold_post(raw);
            response_formatter::force_json_task_id(&mut folded, tid);
            folded
        });
        return;
    }

    if is_completed {
        take_map(response, |raw| {
            let mut out = if let (Some(s1), Some(s2_raw)) = (
                response_formatter::json_root_raw_value(&raw, "stage1"),
                response_formatter::json_root_raw_value(&raw, "stage2"),
            ) {
                let s2: serde_json::Value =
                    serde_json::from_str(s2_raw).unwrap_or(serde_json::json!({}));
                if status_code != 200 || response_formatter::find_urls(&s2).is_empty() {
                    let err = cascade_stage2_err_text(&s2, "增强失败");
                    serde_json::json!({
                        "id": task_id,
                        "status": "failed",
                        "error": { "message": err }
                    })
                    .to_string()
                } else {
                    let mut merged = cascade_s1_with_s2_url(s1, &s2, plugin_tag.unwrap_or(""));
                    cascade_overlay_client_identity(
                        &mut merged,
                        plugin_tag.unwrap_or(""),
                        log_model,
                    );
                    merged
                }
            } else if status_code != 200 && has_cascade {
                serde_json::json!({
                    "id": task_id,
                    "status": "failed",
                    "error": { "message": "增强失败" }
                })
                .to_string()
            } else if has_cascade {
                let mut out = raw;
                cascade_overlay_client_identity(&mut out, plugin_tag.unwrap_or(""), log_model);
                out
            } else {
                raw
            };
            if has_cascade {
                response_formatter::force_json_task_id(&mut out, task_id);
            }
            out
        });
    }
    take_map(post_resp, |raw| {
        let mut folded = fold_post(raw);
        if has_cascade {
            response_formatter::force_json_task_id(&mut folded, task_id);
        }
        folded
    });
}

/// 从 plugin_tag.cascade 还原阶段二轮询目标（渠道 + 转发配置 + 模型）
fn cascade_stage2_poll_target(
    channel: &Channel,
    resolved: &forward::ResolvedForward,
    plugin_tag: &str,
    stage2_task_id: &str,
) -> (Channel, forward::ResolvedForward, String) {
    let tag_json: serde_json::Value =
        serde_json::from_str(plugin_tag).unwrap_or(serde_json::json!({}));
    let cascade_info = tag_json
        .get("cascade")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let mut ch = channel.clone();
    ch.id = cascade_info
        .get("ch_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(channel.id);
    ch.name = cascade_info
        .get("ch_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&channel.name)
        .to_string();
    ch.base_url = cascade_info
        .get("base_url")
        .and_then(|v| v.as_str())
        .unwrap_or(&channel.base_url)
        .to_string();
    ch.api_key = cascade_info
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or(&channel.api_key)
        .to_string();
    ch.rate = cascade_info
        .get("rate")
        .and_then(|v| v.as_f64())
        .unwrap_or(channel.rate);

    let mut res = resolved.clone();
    res.mid = cascade_info
        .get("mid")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    res.auth_type = cascade_info
        .get("auth_type")
        .and_then(|v| v.as_str())
        .unwrap_or(&resolved.auth_type)
        .to_string();
    res.upstream_path = cascade_info
        .get("upstream_path")
        .and_then(|v| v.as_str())
        .unwrap_or(&resolved.upstream_path)
        .to_string();
    res.target_type = cascade_info
        .get("target_type")
        .and_then(|v| v.as_str())
        .unwrap_or(&resolved.target_type)
        .to_string();
    res.poll_path = cascade_info
        .get("poll_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let final_model = cascade_info
        .get("final_model")
        .and_then(|v| v.as_str())
        .or_else(|| cascade_info.get("mid").and_then(|v| v.as_str()))
        .unwrap_or("vve-sd")
        .to_string();

    crate::relay_debug!(
        "[Cascade S2] 轮询目标: 阶段2任务ID={}, 渠道={}, 模型ID={:?}, 最终模型={}",
        stage2_task_id,
        ch.name,
        res.mid,
        final_model
    );
    (ch, res, final_model)
}

/// 官方路径：S1 已有字段才替换（不追加）。model=logs.model，resolution=级联目标
pub(crate) fn cascade_overlay_client_identity(s: &mut String, plugin_tag: &str, log_model: &str) {
    response_formatter::json_root_set(s, "model", &serde_json::json!(log_model).to_string());
    response_formatter::json_root_set(
        s,
        "resolution",
        &serde_json::json!(cascade_resolve_target_resolution(plugin_tag, "")).to_string(),
    );
}

/// 用户端处理中：剥产物后盖请求 model / 目标分辨率
fn cascade_user_processing_response(
    stage1_raw: &str,
    task_id: &str,
    plugin_tag: &str,
    log_model: &str,
) -> String {
    let mut s = stage1_raw.to_string();
    cascade_apply_processing_status(&mut s, task_id, false);
    cascade_overlay_client_identity(&mut s, plugin_tag, log_model);
    s
}

/// 写入对外任务号，进行中统一为 in_progress/running；无成片则去掉 content/usage
fn cascade_apply_processing_status(s: &mut String, task_id: &str, openai_compatible: bool) {
    response_formatter::force_json_task_id(s, task_id);
    let st = response_formatter::json_root_raw_value(s, "status")
        .and_then(|raw| serde_json::from_str::<String>(raw).ok())
        .unwrap_or_default();
    let norm = normalize_task_status(&st);
    let processing = if openai_compatible {
        "in_progress"
    } else {
        "running"
    };
    if st.is_empty()
        || matches!(norm, "succeeded" | "failed")
        || norm == "pending"
    {
        response_formatter::json_root_set(s, "status", &serde_json::json!(processing).to_string());
    }
    response_formatter::json_root_remove(s, "content");
    response_formatter::json_root_remove(s, "usage");
    if openai_compatible {
        response_formatter::json_root_remove(s, "data");
    }
}

/// 级联处理中对外：OpenAI 只保留进度字段；官方路径覆盖 logs.model 与目标分辨率
pub(crate) fn cascade_s2_client_processing(
    raw_path: &str,
    category: &str,
    stage1_raw: &str,
    task_id: &str,
    plugin_tag: &str,
    log_model: &str,
) -> String {
    let openai = response_formatter::is_openai_compatible_path(raw_path);
    let mut s = response_formatter::apply_format(
        raw_path,
        category,
        stage1_raw,
        openai,
        Some(task_id),
    );
    cascade_apply_processing_status(&mut s, task_id, openai);
    if !openai {
        cascade_overlay_client_identity(&mut s, plugin_tag, log_model);
    }
    s
}

/// 级联落库：stage1 + stage2 原始串直接拼进 combined，不经 Value 重排
pub(crate) fn cascade_combine_stages(s1_raw: &str, s2_raw: &str) -> String {
    let s1 = if s1_raw.trim().is_empty() {
        "{}"
    } else {
        s1_raw
    };
    let s2 = match serde_json::from_str::<serde_json::Value>(s2_raw) {
        Ok(_) => s2_raw.to_string(),
        Err(_) => serde_json::json!(s2_raw).to_string(),
    };
    format!(r#"{{"stage1":{s1},"stage2":{s2}}}"#)
}

/// S2 时从 response_content 取 stage1 原文（无 stage1 或空对象则整包即扁平 S1）
pub(crate) fn cascade_s1_raw_from_log(content: &str) -> &str {
    if content.is_empty() {
        return "{}";
    }
    match response_formatter::json_root_raw_value(content, "stage1") {
        Some(s1) if s1.trim_start().starts_with('{') && s1.contains('"') => s1,
        _ => content,
    }
}

/// 级联阶段二提交结果：Submitted=已提交超分；InProgress=他处正在裁剪/提交
pub(crate) enum CascadeS2SubmitOutcome {
    Submitted(String),
    InProgress,
}

/// 0=非级联 / 1=阶段一 / 2=阶段二
pub(crate) fn cascade_stage_num(is_cascade: bool, post: &serde_json::Value) -> u8 {
    if !is_cascade {
        0
    } else if post.get("stage2").is_some() {
        2
    } else {
        1
    }
}

/// 有 stage1 或 stage2 → 级联落库形态
#[inline]
pub(crate) fn cascade_is_combined_resp(v: &serde_json::Value) -> bool {
    v.get("stage1").is_some() || v.get("stage2").is_some()
}

/// plugin_tag 含 cascade（S1 扁平体时靠此识别）
#[inline]
pub(crate) fn cascade_plugin_tag_present(plugin_tag: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(plugin_tag)
        .ok()
        .is_some_and(|v| v.get("cascade").is_some())
}

/// 从级联 stage2 节点提取失败文案（字符串 / 错误体 / 兜底）
pub(crate) fn cascade_stage2_err_text(stage2: &serde_json::Value, fallback: &str) -> String {
    let raw = stage2
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            response_formatter::extract_error_message_from_value(stage2).filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| fallback.to_string());
    proxy::sanitize_error_message(&raw)
}

/// 上游轮询目标（手动 GET / 后台轮询共用）
pub(crate) struct CascadePollTarget<'a> {
    pub channel: std::borrow::Cow<'a, Channel>,
    pub resolved: std::borrow::Cow<'a, forward::ResolvedForward>,
    pub task_id: std::borrow::Cow<'a, str>,
    pub model: std::borrow::Cow<'a, str>,
}

/// 上游轮询目标（含 S1/S2）。Err=(文案, status)：S2 无有效 id；status 优先从 stage2 体推断，无法识别才 500
pub(crate) fn cascade_poll_target<'a>(
    cascade_stage: u8,
    post_resp: &serde_json::Value,
    channel: &'a Channel,
    resolved: &'a forward::ResolvedForward,
    plugin_tag: &str,
    user_task_id: &'a str,
    model_name: &'a str,
) -> Result<CascadePollTarget<'a>, (String, u16)> {
    if cascade_stage == 2 {
        let stage2_val = &post_resp["stage2"];
        let s2_id = response_formatter::find_id(stage2_val);
        if s2_id.is_empty() {
            let msg = cascade_stage2_err_text(stage2_val, "S2 无任务 ID");
            return Err((msg, status_from_stage2_body(stage2_val)));
        }
        let (ch, res, model) = cascade_stage2_poll_target(channel, resolved, plugin_tag, &s2_id);
        return Ok(CascadePollTarget {
            channel: std::borrow::Cow::Owned(ch),
            resolved: std::borrow::Cow::Owned(res),
            task_id: std::borrow::Cow::Owned(s2_id),
            model: std::borrow::Cow::Owned(model),
        });
    }
    // 非级联 / S1：优先 plugin_tag.cascade.s1_task_id，否则用户侧 id
    let task_id = cascade_json_ptr(plugin_tag, "/cascade/s1_task_id", false)
        .map(std::borrow::Cow::Owned)
        .unwrap_or(std::borrow::Cow::Borrowed(user_task_id));
    Ok(CascadePollTarget {
        channel: std::borrow::Cow::Borrowed(channel),
        resolved: std::borrow::Cow::Borrowed(resolved),
        task_id,
        model: std::borrow::Cow::Borrowed(model_name),
    })
}

/// 从 stage2 落库体推断 HTTP 码；空/无法识别 → 500
fn status_from_stage2_body(stage2: &serde_json::Value) -> u16 {
    match stage2 {
        serde_json::Value::Null => 500,
        serde_json::Value::String(s) if s.trim().is_empty() => 500,
        serde_json::Value::String(s) => proxy::infer_error_status_code_from_str(s),
        serde_json::Value::Object(m) if m.is_empty() => 500,
        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
            proxy::infer_error_status_code(stage2)
        }
        _ => 500,
    }
}

/// 阶段二成功对外体：S1 骨架换 S2 URL → apply_format → 固定用户侧 task_id
pub(crate) fn cascade_format_s2_succeeded(
    raw_path: &str,
    category: &str,
    plugin_tag: &str,
    s1_raw: &str,
    s2: &serde_json::Value,
    task_id: &str,
    log_model: &str,
) -> String {
    let new_stage1 = cascade_s1_with_s2_url(s1_raw, s2, plugin_tag);
    let mut formatted = response_formatter::apply_format(
        raw_path,
        category,
        &new_stage1,
        true,
        Some(task_id),
    );
    response_formatter::force_json_task_id(&mut formatted, task_id);
    if !response_formatter::is_openai_compatible_path(raw_path) {
        cascade_overlay_client_identity(&mut formatted, plugin_tag, log_model);
    }
    formatted
}

/// 进程内互斥：占位成功则持有，Drop 时 remove（仅 stage2_submit 使用）
struct CascadeS2InflightGuard<'a> {
    map: &'a dashmap::DashMap<i64, ()>,
    id: i64,
}

impl<'a> CascadeS2InflightGuard<'a> {
    fn try_acquire(map: &'a dashmap::DashMap<i64, ()>, id: i64) -> Option<Self> {
        if map.insert(id, ()).is_some() {
            return None;
        }
        Some(Self { map, id })
    }
}

impl Drop for CascadeS2InflightGuard<'_> {
    fn drop(&mut self) {
        self.map.remove(&self.id);
    }
}

/// S2 提交入参（手动 GET / 后台共用，避免 10+ 散参）
pub(crate) struct CascadeS2SubmitCtx<'a> {
    pub task_id: &'a str,
    pub log_id: i64,
    pub post_response: &'a str,
    pub request_content: &'a str,
    pub upstream_req: &'a str,
    pub channel: &'a Channel,
    pub base_video_url: &'a str,
    pub plugin_tag: &'a str,
    pub stage1_response: &'a str,
    /// 仅目标 720p 且底座 480 时是否 MediaKit 裁剪（转发规则同名字段，缺省 true）
    pub crop_480p: bool,
}

/// S2 提交超分（GET/后台共用）。失败只落库；退费由调用方 settle_failure(stage=2)
pub(crate) async fn cascade_stage2_submit(
    state: &Arc<AppState>,
    ctx: &CascadeS2SubmitCtx<'_>,
) -> Result<CascadeS2SubmitOutcome, (String, u16)> {
    let Some(_guard) = CascadeS2InflightGuard::try_acquire(&state.cascade_s2_inflight, ctx.log_id)
    else {
        crate::relay_debug!("[Cascade S2] 跳过 log_id={}（忙）", ctx.log_id);
        return Ok(CascadeS2SubmitOutcome::InProgress);
    };

    let post_resp: serde_json::Value =
        serde_json::from_str(ctx.post_response).unwrap_or(serde_json::json!({}));

    let mut updated_tag_opt: Option<String> = None;
    if !ctx.plugin_tag.is_empty() {
        if let Ok(mut pt) = serde_json::from_str::<serde_json::Value>(ctx.plugin_tag) {
            if let Some(cascade) = pt.get_mut("cascade").and_then(|v| v.as_object_mut()) {
                if cascade.remove("api_key").is_some() {
                    updated_tag_opt = Some(pt.to_string());
                }
            }
        }
    }
    // S1 轮询成功体：根 id 换成用户侧 cgt 再落库（后续 combine/展示同源）
    let mut s1_body = ctx.stage1_response.to_string();
    response_formatter::force_json_task_id(&mut s1_body, ctx.task_id);
    let s1_json: serde_json::Value =
        serde_json::from_str(&s1_body).unwrap_or(serde_json::json!({}));

    let write_error = |state: &Arc<AppState>,
                       err_msg: &str,
                       post_resp_json: &serde_json::Value,
                       s1_raw: &str,
                       s2_raw: &str,
                       tag: &Option<String>,
                       upstream: Option<String>| {
        let state = state.clone();
        let err = err_msg.to_string();
        let updated = serde_json::json!({"stage1": post_resp_json, "stage2": s2_raw}).to_string();
        let resp_content = cascade_combine_stages(s1_raw, s2_raw);
        let tag = tag.clone();
        let db_id = ctx.log_id;
        async move {
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET post_response = ?, response_content = ?, error_message = ?, plugin_tag = COALESCE(?, plugin_tag), upstream_req_content = COALESCE(?, upstream_req_content) WHERE id = ?"
            )).bind(&updated).bind(&resp_content).bind(&err).bind(&tag).bind(&upstream).bind(db_id).execute(&state.db.pool).await;
        }
    };

    if ctx.base_video_url.is_empty() {
        // 底座无直链：非上游 HTTP 体，无法推断 → 500
        let err_msg = "底座视频生成成功但未能获取到视频直链地址";
        write_error(
            state,
            err_msg,
            &post_resp,
            &s1_body,
            err_msg,
            &updated_tag_opt,
            None,
        )
        .await;
        return Err((err_msg.to_string(), 500));
    }

    let seed_resolved = forward::ResolvedForward {
        target_type: "volcengine_media_enhance".to_string(),
        upstream_path: "/api/v1/tools/enhance-video".to_string(),
        auth_type: "volcengine_sign".to_string(),
        ..Default::default()
    };
    let (enhance_ch, mut volc_resolved, final_model) =
        cascade_stage2_poll_target(ctx.channel, &seed_resolved, ctx.plugin_tag, ctx.task_id);
    let volc_model_mid = volc_resolved
        .mid
        .get_or_insert_with(|| "vve-sd".to_string())
        .clone();

    let target_resolution = cascade_resolve_target_resolution(ctx.plugin_tag, ctx.request_content);
    let base_video_url = if ctx.crop_480p {
        let req_hint: serde_json::Value =
            serde_json::from_str(ctx.request_content).unwrap_or(serde_json::json!({}));
        let up_hint: serde_json::Value =
            serde_json::from_str(ctx.upstream_req).unwrap_or(serde_json::json!({}));
        let mk = CascadeMk {
            state,
            ch: &enhance_ch,
            auth_type: &volc_resolved.auth_type,
        };
        cascade_ensure_standard_480p_video(
            &mk,
            ctx.base_video_url,
            &s1_json,
            &target_resolution,
            &[&up_hint, &req_hint],
        )
        .await
    } else {
        ctx.base_video_url.to_string()
    };

    let volc_url = forward::build_upstream_url(
        &enhance_ch.base_url,
        &volc_resolved,
        &final_model,
        &enhance_ch.api_key,
    );

    let mut volc_payload = serde_json::json!({
        "video_url": base_video_url,
        "fps": 24,
        "bitrate_level": "high"
    });
    cascade_s2_apply_resolution_param(&mut volc_payload, &target_resolution, &volc_model_mid);
    if let Some(tv) = forward::volc_enhance_tool_version(&volc_model_mid) {
        volc_payload["tool_version"] = serde_json::json!(tv);
        if tv == "standard" {
            let scene = cascade_json_str(ctx.plugin_tag, "/cascade/scene")
                .and_then(|s| cascade_scene_pair(&s))
                .unwrap_or("common");
            volc_payload["scene"] = serde_json::json!(scene);
        }
    }

    // 临时错最多 5 次；退避 10→20→40→60s（总睡眠约 130s，原固定 120s×4≈480s）
    let max_attempts = 5u32;
    let mut attempt = 0u32;

    let (stage2_id, post_json) = loop {
        attempt += 1;
        let mut volc_body = volc_payload.clone();
        let builder = state
            .http_client
            .post(&volc_url)
            .header("Content-Type", "application/json");
        let builder =
            crate::services::http_client::with_upstream_timeout(forward::apply_request_auth(
                builder,
                &volc_resolved,
                &enhance_ch.api_key,
                &mut volc_body,
                &enhance_ch.base_url,
            ));

        let (should_retry, err_msg, err_status, raw_text) = match builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let text = resp.text().await.unwrap_or_default();
                if status == 200 {
                    match cascade_s2_parse_post_200(&text) {
                        Ok(ok) => break ok,
                        Err(CascadeS2Post200Fail::Upstream(post)) => {
                            let err =
                                match response_formatter::extract_error_message_from_value(&post) {
                                    Some(m) if !m.is_empty() => format!(
                                        "增强失败: {}",
                                        proxy::sanitize_error_message(&m)
                                    ),
                                    _ => "增强失败（无任务 ID）".to_string(),
                                };
                            (false, err, proxy::infer_error_status_code(&post), text)
                        }
                        Err(CascadeS2Post200Fail::MissingTaskId) => {
                            let snippet: String = text.chars().take(240).collect();
                            crate::relay_debug!(
                                "[Cascade S2 POST] HTTP200 无任务ID log_id={} url={} body={}",
                                ctx.log_id,
                                volc_url,
                                snippet
                            );
                            // 有响应体则推断；空体无法识别 → 500
                            let st = if text.trim().is_empty() {
                                500
                            } else {
                                proxy::infer_error_status_code_from_str(&text)
                            };
                            (
                                false,
                                "火山增强提交成功但未能解析到超分任务 ID".to_string(),
                                st,
                                text,
                            )
                        }
                    }
                } else {
                    let err_text_raw = proxy::extract_error_message(&text);
                    let err_text = proxy::sanitize_error_message(&if err_text_raw.is_empty() {
                        format!("增强失败 HTTP {}", status)
                    } else {
                        err_text_raw
                    });
                    const RETRY_CODES: &[&str] = &[
                        "requestlimitexceeded",
                        "internalserviceerror",
                        "downloadfileerror",
                        "abilityprocessingerror",
                        "serviceinitializingerror",
                        "internalservicetimeout",
                    ];
                    let retry = proxy::is_poll_transport_retryable(status)
                        || serde_json::from_str::<serde_json::Value>(&text)
                            .ok()
                            .and_then(|v| response_formatter::extract_error_code_from_value(&v))
                            .is_some_and(|code| {
                                let c = code.to_lowercase();
                                RETRY_CODES.iter().any(|&k| c.contains(k))
                            });
                    (retry, err_text, status, text)
                }
            }
            Err(e) => (
                true,
                proxy::sanitize_error_message(&format!("增强连接失败: {:?}", e)),
                502,
                String::new(),
            ),
        };

        if should_retry && attempt < max_attempts {
            let delay_secs = (10u64 << (attempt - 1).min(3)).min(60);
            crate::relay_debug!(
                "[Cascade S2 POST] 临时错误 {}/{}，{}s 后重试: {}",
                attempt,
                max_attempts,
                delay_secs,
                err_msg
            );
            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
        } else {
            let err_status = proxy::normalize_error_http_status(err_status);
            crate::relay_debug!(
                "[Cascade S2 POST] 失败 ({}/{}) log_id={} status={} err={}",
                attempt,
                max_attempts,
                ctx.log_id,
                err_status,
                err_msg
            );
            write_error(
                state,
                &err_msg,
                &post_resp,
                &s1_body,
                &raw_text,
                &updated_tag_opt,
                cascade_upstream_req_combined(ctx.upstream_req, &volc_payload),
            )
            .await;
            return Err((err_msg, err_status));
        }
    };

    let updated = serde_json::json!({"stage1": post_resp, "stage2": post_json}).to_string();
    let upstream_combined = cascade_upstream_req_combined(ctx.upstream_req, &volc_payload);
    let _ = sqlx::query(&state.db.format_query("UPDATE logs SET post_response = ?, response_content = ?, upstream_req_content = COALESCE(?, upstream_req_content) WHERE id = ?"))
        .bind(&updated).bind(&s1_body).bind(&upstream_combined).bind(ctx.log_id).execute(&state.db.pool).await;

    crate::relay_debug!(
        "[Cascade S2] 级联提交成功 日志ID={} 阶段1={} 阶段2={} MID={} 分辨率={} 渠道={}",
        ctx.log_id,
        ctx.task_id,
        stage2_id,
        volc_model_mid,
        target_resolution,
        enhance_ch.name
    );
    Ok(CascadeS2SubmitOutcome::Submitted(stage2_id))
}
