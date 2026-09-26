/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 响应格式化引擎 (Response Formatter)
//! 将各厂商上游返回格式归一化为 OpenAI 标准规范格式。
//! 仅对 OpenAI 兼容路由（/v1/images/generations、/v1/images/edits、
//! /v1/video/generations、/v1/videos、/v1/videos/generations、/v1/tasks/）生效。
//! 设计原则：采用递归扫描模式，确保无论上游结构如何变化，都能准确抓取 ID、状态和媒体 URL。

use crate::relay::usage_extractor;
use regex::Regex;
use serde_json::{json, Value};

/// 判定请求路径是否属于标准的 OpenAI 兼容 API 路径（排除如 /api/ 厂商原生接口）
pub fn is_openai_compatible_path(raw_path: &str) -> bool {
    let Some(p) = raw_path.strip_prefix("/v1/") else {
        return false;
    };

    // 1. 图像生成/编辑与通用任务轮询
    if p == "images/generations" || p == "images/edits" || p.starts_with("tasks/") {
        return true;
    }

    // 2. 标准视频入口与轮询：/v1/video/generations[/...]
    if p == "video/generations" || p.starts_with("video/generations/") {
        return true;
    }

    // 3. OpenAI Videos 兼容别名（/v1/videos、/v1/videos/generations[/...]、/v1/videos/{task_id}）
    //    排除可灵原生路径：text2video、image2video、omni-video
    if let Some(sub) = p.strip_prefix("videos") {
        if sub.is_empty() {
            return true; // /v1/videos
        }
        if let Some(rest) = sub.strip_prefix('/') {
            if rest == "generations" || rest.starts_with("generations/") {
                return true; // /v1/videos/generations 或 /v1/videos/generations/{task_id}
            }
            // 单段 task_id 轮询：/v1/videos/{task_id}
            return !rest.contains('/')
                && !matches!(rest, "text2video" | "image2video" | "omni-video");
        }
    }

    false
}

/// 统一格式化入口：对 OpenAI 兼容路由自动转换响应格式。
/// - `is_poll`: true=异步轮询/结案（必须带正确终态 status）；false=同步或异步 POST
/// - `fallback_id`: 轮询缺 id 时兜底；同步成功时可写入 id；不用于伪造 POST pending
pub fn apply_format(
    raw_path: &str,
    category: &str,
    raw_response: &str,
    is_poll: bool,
    fallback_id: Option<&str>,
) -> String {
    // 仅对 OpenAI 兼容路由（/v1/...）启用格式转换
    if !is_openai_compatible_path(raw_path) {
        return raw_response.to_string();
    }

    format_openai(category, raw_response, is_poll, fallback_id)
}

/// OpenAI 格式化核心逻辑
pub fn format_openai(
    category: &str,
    raw: &str,
    is_poll: bool,
    fallback_id: Option<&str>,
) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(val) => val,
        Err(_) => return raw.to_string(),
    };

    // 异步轮询/结案：一律 poll 骨架（正确 status；error+success → failed）
    if is_poll {
        return build_openai_poll(category, &v, fallback_id);
    }

    // 同步 / 异步 POST：业务错误 → 纯 error（无 status）
    if let Some(formatted) = format_as_openai_error(&v) {
        return formatted;
    }

    // 上游已是 OpenAI 同步成功体
    if v.get("created").is_some()
        && v.get("data").and_then(|d| d.as_array()).is_some()
        && v.get("code").is_none()
    {
        // 已有 OpenAI usage → 原样；仅有根级 usageMetadata → 注入转换结果
        if openai_usage_node(&v).is_some() {
            return raw.to_string();
        }
        if let Some(meta) = v.get("usageMetadata") {
            let usage = crate::relay::usage_extractor::gemini_usage_metadata_to_openai(meta);
            let mut out = v;
            out["usage"] = usage;
            return to_json(&out);
        }
        return raw.to_string();
    }

    // 同步结果：有媒体（无 status）
    let urls = find_urls(&v);
    if !urls.is_empty() {
        return build_openai_sync(category, &v, urls, fallback_id);
    }

    // 异步 POST 成功：仅当上游响应自身带 task_id（勿用 log fallback 冒充 pending）
    let id = find_id(&v);
    if !id.is_empty() {
        return build_openai_submit(category, &v, &id);
    }

    raw.to_string()
}

// ── ID 提取（公共方法，供 task.rs / image.rs / proxy.rs 复用） ──

/// 从任意厂商响应 JSON 中提取任务 ID（兼容 task_id / id / data.task_id 等多种路径）
/// 优先级：真实任务号字段优先；根级 `request_id` 仅作 fal 等无 task_id 厂商的最后兜底
///（DashScope 等同体常同时有 `request_id` + `output.task_id`，不可先取 request_id）。
pub fn find_id(v: &Value) -> String {
    v.get("task_id")
        .or_else(|| v.get("TaskId"))
        .or_else(|| v.get("id"))
        .or_else(|| v.pointer("/task/id")) // MiniMax H3: { task: { id, status } }
        .or_else(|| v.pointer("/data/taskCode"))
        .or_else(|| v.pointer("/data/task_id"))
        .or_else(|| v.pointer("/data/id"))
        .or_else(|| v.pointer("/data/0/task_id"))
        .or_else(|| v.pointer("/data/0/id")) // 可灵 3.0 按任务ID查询: data[].id
        .or_else(|| v.pointer("/output/task_id")) // DashScope / 阿里百炼
        .or_else(|| v.pointer("/data/task/id"))
        .or_else(|| v.pointer("/Response/TaskId"))
        .or_else(|| {
            usage_extractor::tencent_aigc_task(v).and_then(|t| t.get("TaskId"))
        })
        .or_else(|| v.get("request_id")) // fal.ai queue: { request_id, status }；须在真实 task_id 之后
        .and_then(|val| {
            // 兼容字符串和数字类型的 task_id（如火山方舟返回数字 ID）
            val.as_str()
                .map(|s| s.to_string())
                .or_else(|| val.as_i64().map(|n| n.to_string()))
                .or_else(|| Some(val.to_string()))
        })
        .unwrap_or_default()
        .trim_matches('"')
        .to_string()
}

/// 统一提取异步任务 ID。自动过滤聊天响应（包含 choices / candidates 字段）的干扰性通用会话 ID。
pub fn extract_async_task_id(v: &Value) -> String {
    let id = find_id(v);
    // 聊天响应的 id 字段是会话 ID，不是异步任务 ID
    if !id.is_empty() && (v.get("choices").is_some() || v.get("candidates").is_some()) {
        String::new()
    } else {
        id
    }
}

// ── 异步结案失败体 / 状态提取 ──

/// 异步结案失败最小任务体（默认 HTTP 200；体含数字 error.code 时轮询出口透出）
pub fn async_task_failed_body(task_id: &str, message: &str) -> String {
    json!({
        "id": task_id,
        "status": "failed",
        "error": {
            "message": crate::relay::proxy::sanitize_error_message(message),
            "type": "api_error"
        }
    })
    .to_string()
}

/// 强制根节点对外任务号：写 `id`；若已有根 `task_id` 则同步。原位改值，避免 `Value` 重排键。
pub fn force_json_task_id(s: &mut String, task_id: &str) {
    if task_id.is_empty() {
        return;
    }
    let lit = json!(task_id).to_string();
    if !json_root_set(s, "id", &lit) {
        json_root_insert_first(s, "id", &lit);
    }
    json_root_set(s, "task_id", &lit);
    json_root_set(s, "TaskId", &lit);
}

#[derive(Clone, Copy)]
struct JsonMember {
    key_lo: usize,
    val_lo: usize,
    val_hi: usize,
}

fn json_skip_ws(s: &str, i: &mut usize) {
    let b = s.as_bytes();
    while *i < b.len() && b[*i].is_ascii_whitespace() {
        *i += 1;
    }
}

fn json_skip_string(s: &str, i: &mut usize) -> Option<()> {
    let b = s.as_bytes();
    if b.get(*i) != Some(&b'"') {
        return None;
    }
    *i += 1;
    while *i < b.len() {
        match b[*i] {
            b'\\' => *i = (*i + 2).min(b.len()),
            b'"' => {
                *i += 1;
                return Some(());
            }
            _ => *i += 1,
        }
    }
    None
}

fn json_skip_balanced(s: &str, i: &mut usize, open: u8, close: u8) -> Option<()> {
    let b = s.as_bytes();
    if b.get(*i) != Some(&open) {
        return None;
    }
    let mut depth = 1usize;
    let mut in_str = false;
    let mut esc = false;
    *i += 1;
    while *i < b.len() && depth > 0 {
        let c = b[*i];
        *i += 1;
        if in_str {
            if esc {
                esc = false;
            } else if c == b'\\' {
                esc = true;
            } else if c == b'"' {
                in_str = false;
            }
        } else if c == b'"' {
            in_str = true;
        } else if c == open {
            depth += 1;
        } else if c == close {
            depth -= 1;
        }
    }
    (depth == 0).then_some(())
}

fn json_skip_value(s: &str, i: &mut usize) -> Option<(usize, usize)> {
    json_skip_ws(s, i);
    let start = *i;
    match s.as_bytes().get(*i)? {
        b'"' => json_skip_string(s, i)?,
        b'{' => json_skip_balanced(s, i, b'{', b'}')?,
        b'[' => json_skip_balanced(s, i, b'[', b']')?,
        _ => {
            let b = s.as_bytes();
            while *i < b.len() && !matches!(b[*i], b',' | b'}' | b']') {
                *i += 1;
            }
        }
    }
    Some((start, *i))
}

fn json_root_open(s: &str) -> Option<usize> {
    let mut i = 0;
    json_skip_ws(s, &mut i);
    (s.as_bytes().get(i) == Some(&b'{')).then_some(i)
}

fn json_for_each_member(
    s: &str,
    obj_open: usize,
    mut f: impl FnMut(&str, JsonMember) -> bool,
) -> Option<()> {
    let b = s.as_bytes();
    if b.get(obj_open) != Some(&b'{') {
        return None;
    }
    let mut i = obj_open + 1;
    json_skip_ws(s, &mut i);
    if b.get(i) == Some(&b'}') {
        return Some(());
    }
    loop {
        json_skip_ws(s, &mut i);
        let key_lo = i;
        json_skip_string(s, &mut i)?;
        let key = serde_json::from_str::<String>(&s[key_lo..i]).ok()?;
        json_skip_ws(s, &mut i);
        if b.get(i) != Some(&b':') {
            return None;
        }
        i += 1;
        let (val_lo, val_hi) = json_skip_value(s, &mut i)?;
        if !f(
            &key,
            JsonMember {
                key_lo,
                val_lo,
                val_hi,
            },
        ) {
            return Some(());
        }
        json_skip_ws(s, &mut i);
        match b.get(i) {
            Some(b',') => i += 1,
            Some(b'}') => return Some(()),
            _ => return None,
        }
    }
}

fn json_find_root(s: &str, key: &str) -> Option<JsonMember> {
    let mut found = None;
    json_for_each_member(s, json_root_open(s)?, |k, m| {
        if k == key {
            found = Some(m);
            false
        } else {
            true
        }
    })?;
    found
}

fn json_walk_objects(s: &str, obj_open: usize, f: &mut impl FnMut(&str, JsonMember)) {
    let _ = json_for_each_member(s, obj_open, |k, m| {
        f(k, m);
        let mut i = m.val_lo;
        json_skip_ws(s, &mut i);
        if s.as_bytes().get(i) == Some(&b'{') {
            json_walk_objects(s, i, f);
        }
        true
    });
}

pub(crate) fn json_root_raw_value<'a>(s: &'a str, key: &str) -> Option<&'a str> {
    json_find_root(s, key).map(|m| &s[m.val_lo..m.val_hi])
}

/// 根字段已存在则原位替换值，不重排其它键。无此键 / 非对象 → false
pub(crate) fn json_root_set(s: &mut String, key: &str, raw_val: &str) -> bool {
    let Some(m) = json_find_root(s, key) else {
        return false;
    };
    s.replace_range(m.val_lo..m.val_hi, raw_val);
    true
}

fn json_root_insert_first(s: &mut String, key: &str, raw_val: &str) {
    let Some(open) = json_root_open(s) else {
        return;
    };
    let mut j = open + 1;
    json_skip_ws(s, &mut j);
    let empty = s.as_bytes().get(j) == Some(&b'}');
    let piece = if empty {
        format!("{}:{raw_val}", json!(key))
    } else {
        format!("{}:{raw_val},", json!(key))
    };
    s.insert_str(open + 1, &piece);
}

pub(crate) fn json_root_remove(s: &mut String, key: &str) {
    let Some(m) = json_find_root(s, key) else {
        return;
    };
    let b = s.as_bytes();
    let mut lo = m.key_lo;
    let mut hi = m.val_hi;
    let mut k = hi;
    json_skip_ws(s, &mut k);
    if b.get(k) == Some(&b',') {
        hi = k + 1;
    } else {
        let mut p = lo;
        while p > 0 && b[p - 1].is_ascii_whitespace() {
            p -= 1;
        }
        if p > 0 && b[p - 1] == b',' {
            lo = p - 1;
        }
    }
    s.replace_range(lo..hi, "");
}

pub(crate) fn json_replace_str(s: &mut String, old: &str, new: &str) {
    if old.is_empty() || old == new {
        return;
    }
    if let (Ok(old_lit), Ok(new_lit)) = (serde_json::to_string(old), serde_json::to_string(new)) {
        *s = s.replace(&old_lit, &new_lit);
    }
}

/// 已有同名字段（含嵌套对象）原位改值，不追加
pub(crate) fn json_replace_fields(s: &mut String, kv: &[(&str, &str)]) {
    let Some(open) = json_root_open(s) else {
        return;
    };
    let mut hits: Vec<(usize, usize, &str)> = Vec::new();
    json_walk_objects(s, open, &mut |k, m| {
        if let Some((_, raw)) = kv.iter().find(|(n, _)| *n == k) {
            hits.push((m.val_lo, m.val_hi, raw));
        }
    });
    for (lo, hi, raw) in hits.into_iter().rev() {
        s.replace_range(lo..hi, raw);
    }
}

/// 结案失败客户端体：OpenAI 兼容路径经 apply_format（轮询态），并固定对外 id
pub fn format_async_task_failed(
    raw_path: &str,
    category: &str,
    task_id: &str,
    message: &str,
) -> String {
    let body = async_task_failed_body(task_id, message);
    let mut s = apply_format(raw_path, category, &body, true, Some(task_id));
    if is_openai_compatible_path(raw_path) {
        force_json_task_id(&mut s, task_id);
    }
    s
}

/// 从任意厂商响应 JSON 中提取原始状态字，并自动应用特定平台的校验（如腾讯云 ErrCode、即梦 code）
pub fn extract_raw_status(v: &Value) -> String {
    // 腾讯云 DescribeTaskDetail：Status="FINISH" 时校验任务节点 ErrCode，非 0 视为 FAILED
    if let Some(resp) = v.get("Response") {
        if let Some(status) = resp.get("Status").and_then(|s| s.as_str()) {
            if status.eq_ignore_ascii_case("FINISH") {
                if usage_extractor::tencent_aigc_task(resp)
                    .and_then(|t| t.get("ErrCode"))
                    .and_then(|c| c.as_i64())
                    .is_some_and(|c| c != 0)
                {
                    return "FAILED".to_string();
                }
                if resp
                    .pointer("/ProcedureTask/ErrCode")
                    .and_then(|c| c.as_i64())
                    .is_some_and(|c| c != 0)
                {
                    return "FAILED".to_string();
                }
                // MPS DescribeImageTaskDetail：FINISH 但 ErrMsg 非空即失败（可无 ResultSet）
                if resp
                    .get("ErrMsg")
                    .and_then(|s| s.as_str())
                    .is_some_and(|s| !s.is_empty())
                {
                    return "FAILED".to_string();
                }
            }
            return status.to_string();
        }
    }

    // 即梦AI：data.status="done" 时需检查外层 code。10000 为成功，否则失败。
    if let Some(status) = v.pointer("/data/status").and_then(|s| s.as_str()) {
        if status == "done" {
            let code = v.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            return if code == 10000 {
                "done".to_string()
            } else {
                "FAILED".to_string()
            };
        }
    }

    v.get("status")
        .or_else(|| v.get("task_status"))
        .or_else(|| v.pointer("/task/status")) // MiniMax H3 v2: { task: { status, content } }
        .or_else(|| v.pointer("/data/status"))
        .or_else(|| v.pointer("/data/task_status"))
        .or_else(|| v.pointer("/data/0/status")) // 可灵 3.0: data[].status
        .or_else(|| v.pointer("/data/task/status"))
        .or_else(|| v.pointer("/output/task_status"))
        .or_else(|| v.pointer("/Response/Status"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string()
}

/// 将任意厂商的状态字符串统一归一化为标准的异步任务状态
pub fn parse_raw_status_to_standard(raw: &str) -> &'static str {
    match raw.to_lowercase().trim() {
        "completed" | "succeeded" | "succeed" | "success" | "finish" | "done" => "completed",
        "failed" | "canceled" | "cancelled" | "error" | "timeout" | "unknown" | "fail"
        | "abort" | "not_found" | "expired" => "failed",
        "processing" | "running" | "active" | "generating" | "waiting" | "in_queue"
        | "in_progress" => "in_progress",
        "submitted" | "pending" | "queueing" | "queued" => "pending",
        _ => "unknown",
    }
}

/// JSON 体（或已格式化串）是否已是标准 `status=failed`
pub fn is_failed_task_status(raw: &str) -> bool {
    serde_json::from_str::<Value>(raw)
        .ok()
        .is_some_and(|v| parse_raw_status_to_standard(&extract_raw_status(&v)) == "failed")
}

/// URL 提取：优先从标准字段路径直接提取，递归扫描兜底（供 tos_persist 复用）
pub fn find_urls(v: &Value) -> Vec<String> {
    let mut urls: Vec<String> = Vec::new();

    // 1. OpenAI: data[].url；可灵 3.0: data[].outputs[].url
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(u) = item.get("url").and_then(|u| u.as_str()) {
                push_unique(&mut urls, u);
            }
            if let Some(outputs) = item.get("outputs").and_then(|a| a.as_array()) {
                for out in outputs {
                    if let Some(u) = out.get("url").and_then(|u| u.as_str()) {
                        push_unique(&mut urls, u);
                    }
                }
            }
        }
    }

    // 2. 可灵旧协议: data.task_result.images/videos[].url
    for path in &[
        "/data/task_result/images",
        "/data/task_result/videos",
        "/data/task/task_result/images",
        "/data/task/task_result/videos",
    ] {
        if let Some(arr) = v.pointer(path).and_then(|a| a.as_array()) {
            for item in arr {
                if let Some(u) = item.get("url").and_then(|u| u.as_str()) {
                    push_unique(&mut urls, u);
                }
            }
        }
    }

    // 即梦AI / MiniMax: data.image_urls[] (字符串数组，非对象数组)
    if let Some(arr) = v.pointer("/data/image_urls").and_then(|a| a.as_array()) {
        for item in arr {
            if let Some(u) = item.as_str() {
                push_unique(&mut urls, u);
            }
        }
    }

    // 即梦 binary_data_base64 / MiniMax image_base64（与 image_urls 互斥）
    if urls.is_empty() {
        for path in ["/data/binary_data_base64", "/data/image_base64"] {
            if let Some(arr) = v.pointer(path).and_then(|a| a.as_array()) {
                for item in arr {
                    if let Some(b64) = item.as_str().filter(|s| !s.is_empty()) {
                        if b64.starts_with("data:") {
                            push_unique(&mut urls, b64);
                        } else {
                            push_unique(&mut urls, &format!("data:image/png;base64,{}", b64));
                        }
                    }
                }
                if !urls.is_empty() {
                    break;
                }
            }
        }
    }

    // 即梦AI: data.video_url
    if let Some(u) = v.pointer("/data/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 3. 火山方舟: content.video_url；MiniMax H3 v2: task.content.url；fal.ai: video.url
    for path in &["/content/video_url", "/task/content/url", "/video/url"] {
        if let Some(u) = v.pointer(path).and_then(|u| u.as_str()) {
            push_unique(&mut urls, u);
        }
    }
    if let Some(u) = v.get("video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }
    // 火山引擎 AI MediaKit：视频 /result/video_url，图像 /result/image_url
    if let Some(u) = v.pointer("/result/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }
    if let Some(u) = v.pointer("/result/image_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }
    if let Some(u) = v
        .pointer("/Response/ProcedureTask/MediaProcessResultSet/0/TranscodeTask/Output/Url")
        .and_then(|u| u.as_str())
    {
        push_unique(&mut urls, u);
    }
    if let Some(u) = v
        .pointer("/Response/ProcedureTask/MediaProcessResultSet/0/CoverBySnapshotTask/Output/CoverUrl")
        .and_then(|u| u.as_str())
    {
        push_unique(&mut urls, u);
    }

    // 4. 阿里 DashScope: output.results[].url / output.video_url
    if let Some(arr) = v.pointer("/output/results").and_then(|a| a.as_array()) {
        for item in arr {
            let u = item
                .get("url")
                .or_else(|| item.get("video_url"))
                .and_then(|u| u.as_str());
            if let Some(u) = u {
                push_unique(&mut urls, u);
            }
        }
    }
    if let Some(u) = v.pointer("/output/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 4b. 阿里 DashScope chat 格式: output.choices[].message.content[].image
    if let Some(choices) = v.pointer("/output/choices").and_then(|c| c.as_array()) {
        for choice in choices {
            if let Some(parts) = choice
                .pointer("/message/content")
                .and_then(|c| c.as_array())
            {
                for part in parts {
                    if let Some(u) = part.get("image").and_then(|u| u.as_str()) {
                        push_unique(&mut urls, u);
                    }
                }
            }
        }
    }

    // 5. APIMart: data.result.images/videos[].url
    for path in &["/data/result/images", "/data/result/videos"] {
        if let Some(arr) = v.pointer(path).and_then(|a| a.as_array()) {
            for item in arr {
                if let Some(u) = item.get("url").and_then(|u| u.as_str()) {
                    push_unique(&mut urls, u);
                } else if let Some(arr_url) = item.get("url").and_then(|u| u.as_array()) {
                    for u in arr_url {
                        if let Some(s) = u.as_str() {
                            push_unique(&mut urls, s);
                        }
                    }
                }
            }
        }
    }

    // 5b. Bytefor: data.files[].fileUrl 或 data.files[].file_url
    if let Some(arr) = v.pointer("/data/files").and_then(|a| a.as_array()) {
        for item in arr {
            if let Some(u) = item
                .get("fileUrl")
                .or_else(|| item.get("file_url"))
                .and_then(|u| u.as_str())
            {
                push_unique(&mut urls, u);
            }
        }
    }

    // 6. Gemini: candidates[].content.parts[].inlineData → data URI
    if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
        for cand in candidates {
            if let Some(parts) = cand.pointer("/content/parts").and_then(|p| p.as_array()) {
                for part in parts {
                    let inline = part.get("inlineData").or_else(|| part.get("inline_data"));
                    if let Some(inline) = inline {
                        if let Some(data) = inline.get("data").and_then(|d| d.as_str()) {
                            // TOS 替换后 data 值已是 URL，直接作为 URL 返回
                            if data.starts_with("http://") || data.starts_with("https://") {
                                push_unique(&mut urls, data);
                            } else {
                                let mime = inline
                                    .get("mimeType")
                                    .or_else(|| inline.get("mime_type"))
                                    .and_then(|m| m.as_str())
                                    .unwrap_or("image/png");
                                push_unique(&mut urls, &format!("data:{};base64,{}", mime, data));
                            }
                        }
                    }
                    // 书虫格式/Gemini文本格式：text 中的 Markdown 图片 或嵌入的 HTTP URL
                    else if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        // 1. 匹配 Markdown 中的 base64 图片格式 ![...](data:image/...;base64,...)
                        let base64_re =
                            Regex::new(r"data:([^;]+);base64,([a-zA-Z0-9+/=]+)").unwrap();
                        for cap in base64_re.captures_iter(text) {
                            push_unique(&mut urls, &format!("data:{};base64,{}", &cap[1], &cap[2]));
                        }
                        // 2. 匹配文本或 Markdown 中的 HTTP/HTTPS 链接（自动剔除右侧的括号或方括号）
                        let url_re = Regex::new(r"https?://[^\s)\]]+").unwrap();
                        for mat in url_re.find_iter(text) {
                            let url_str = mat.as_str();
                            let lower = url_str.to_lowercase();
                            let path_part = lower.split('?').next().unwrap_or(&lower);
                            let is_media = path_part.ends_with(".png")
                                || path_part.ends_with(".jpg")
                                || path_part.ends_with(".jpeg")
                                || path_part.ends_with(".webp")
                                || path_part.ends_with(".gif")
                                || path_part.ends_with(".mp4")
                                || path_part.ends_with(".mov")
                                || path_part.ends_with(".webm")
                                || lower.contains("/image")
                                || lower.contains("/video")
                                || lower.contains("x-oss-process")
                                || lower.contains("tos-cn-")
                                || lower.contains("volccdn.com")
                                || lower.contains("volces.com")
                                || lower.contains("klingai.com")
                                || lower.contains("aliyuncs.com");
                            if is_media {
                                push_unique(&mut urls, url_str);
                            }
                        }
                    }
                }
            }
        }
    }

    // 6b. 腾讯云 VOD FileInfos；MPS SignedUrl（跳过 last_frame_url 尾帧图）
    if let Some(resp) = v.get("Response") {
        if let Some(task) = usage_extractor::tencent_aigc_task(resp) {
            if let Some(arr) = task.pointer("/Output/FileInfos").and_then(|a| a.as_array()) {
                for item in arr {
                    if item.get("UsageType").and_then(|u| u.as_str()) == Some("last_frame_url") {
                        continue;
                    }
                    if let Some(u) = item.get("FileUrl").and_then(|u| u.as_str()) {
                        push_unique(&mut urls, u);
                    }
                }
            }
        }
        if let Some(arr) = resp
            .get("ImageProcessTaskResultSet")
            .and_then(|a| a.as_array())
        {
            for item in arr {
                if let Some(u) = item.pointer("/Output/SignedUrl").and_then(|u| u.as_str()) {
                    push_unique(&mut urls, u);
                }
            }
        }
    }

    // 7. 递归扫描兜底（捕获非标准位置的媒体 URL）
    if urls.is_empty() {
        scan_value_for_urls(v, &mut urls);
    }

    urls
}

fn push_unique(urls: &mut Vec<String>, url: &str) {
    if !url.is_empty() && !urls.iter().any(|u| u == url) {
        urls.push(url.to_string());
    }
}

fn scan_value_for_urls(v: &Value, urls: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            if (s.starts_with("http://") || s.starts_with("https://"))
                && !urls.iter().any(|u| u == s)
            {
                let lower = s.to_lowercase();
                // 截取 ? 前的路径部分，解决 OSS 签名 URL 带查询参数导致扩展名匹配失败
                let path_part = lower.split('?').next().unwrap_or(&lower);
                let is_media = path_part.ends_with(".png")
                    || path_part.ends_with(".jpg")
                    || path_part.ends_with(".jpeg")
                    || path_part.ends_with(".webp")
                    || path_part.ends_with(".gif")
                    || path_part.ends_with(".mp4")
                    || path_part.ends_with(".mov")
                    || path_part.ends_with(".webm")
                    || lower.contains("/image")
                    || lower.contains("/video")
                    || lower.contains("x-oss-process")
                    || lower.contains("tos-cn-")
                    || lower.contains("volccdn.com")
                    || lower.contains("volces.com")
                    || lower.contains("klingai.com")
                    || lower.contains("aliyuncs.com");
                if is_media {
                    urls.push(s.clone());
                }
            }
        }
        Value::Array(arr) => {
            for item in arr {
                scan_value_for_urls(item, urls);
            }
        }
        Value::Object(map) => {
            for (k, val) in map {
                // 排除请求输入相关字段，避免将用户提交的原始图片误识别为响应媒体
                if k == "request"
                    || k == "input"
                    || k == "task_input"
                    || k == "original_input"
                    || k == "task_data"
                    || k == "InputInfo"
                {
                    continue;
                }
                scan_value_for_urls(val, urls);
            }
        }
        _ => {}
    }
}

fn find_ts(v: &Value, keys: &[&str]) -> i64 {
    for key in keys {
        let val = v
            .get(*key)
            .or_else(|| v.pointer(&format!("/task/{}", key))) // MiniMax H3
            .or_else(|| v.pointer(&format!("/data/{}", key)))
            .or_else(|| v.pointer(&format!("/output/{}", key)));
        if let Some(t) = val {
            if let Some(n) = t.as_i64() {
                return n;
            }
            if let Some(s) = t.as_str() {
                if let Ok(n) = s.parse::<i64>() {
                    return n;
                }
            }
        }
    }
    0
}

/// 提交/轮询骨架共用的 created 时间戳
fn resolve_created(v: &Value) -> i64 {
    let ts = find_ts(v, &["created_at", "created", "submit_time"]);
    if ts > 0 {
        ts
    } else {
        chrono::Utc::now().timestamp()
    }
}

fn to_json(v: &Value) -> String {
    serde_json::to_string(v).unwrap_or_default()
}

// ══════════════════════════════════════════════════════════════════════
// OpenAI 规范格式
// ══════════════════════════════════════════════════════════════════════

fn openai_object(category: &str) -> &'static str {
    if category.contains("视频") || category == "video" {
        "video.generation"
    } else {
        "image.generation"
    }
}

fn openai_status(v: &Value, urls: &[String]) -> String {
    let raw = extract_raw_status(v);
    let std = if raw.is_empty() {
        if is_upstream_error_response(v) {
            return "failed".to_string();
        }
        if urls.is_empty() {
            "in_progress"
        } else {
            "completed"
        }
    } else {
        parse_raw_status_to_standard(&raw)
    };
    // error + 成功类 status → failed（计费安全）
    if std == "completed" && is_upstream_error_response(v) {
        return "failed".to_string();
    }
    match std {
        "completed" | "failed" | "in_progress" => std.to_string(),
        // OpenAI 轮询无 pending：上游 queueing/pending 统一为 in_progress
        "pending" => "in_progress".to_string(),
        _ => "in_progress".to_string(),
    }
}

fn openai_usage_node(v: &Value) -> Option<&Value> {
    v.get("usage")
        .or_else(|| v.pointer("/task/usage"))
        .or_else(|| v.pointer("/data/usage"))
}

/// OpenAI usage 原样；Gemini `usageMetadata` 或 腾讯云 `Output.Usage` → OpenAI 字段
fn resolve_client_usage(v: &Value) -> Option<Value> {
    if let Some(u) = openai_usage_node(v) {
        return Some(u.clone());
    }
    if let Some(meta) = v.get("usageMetadata") {
        return Some(usage_extractor::gemini_usage_metadata_to_openai(meta));
    }
    if let Some(usage) = usage_extractor::tencent_output_usage(v) {
        return Some(usage_extractor::tencent_usage_to_openai(usage));
    }
    None
}

// ── URL/Base64 → OpenAI data item 统一转换（build_openai_sync 和 build_openai_poll 共用）──
fn build_data_item(u: &str) -> Value {
    if u.starts_with("data:") {
        // data:image/png;base64,xxx → b64_json；TOS 替换后 payload 为 http → url
        let payload = crate::relay::forward::b64_data(u);
        if payload == u.trim() {
            json!({"url": u})
        } else if payload.starts_with("http://") || payload.starts_with("https://") {
            json!({"url": payload})
        } else {
            json!({"b64_json": payload})
        }
    } else {
        json!({"url": u})
    }
}

// ── 同步完成 ──
fn build_openai_sync(
    _category: &str,
    v: &Value,
    urls: Vec<String>,
    fallback_id: Option<&str>,
) -> String {
    let now = chrono::Utc::now().timestamp();
    let created = v.get("created").and_then(|c| c.as_i64()).unwrap_or(now);

    let extra = scan_extra_metadata(v);
    let items: Vec<Value> = urls
        .iter()
        .map(|u| {
            let mut item = build_data_item(u);
            for (k, ev) in &extra {
                item[k] = ev.clone();
            }
            item
        })
        .collect();

    let mut resp = json!({"created": created, "data": items});
    if let Some(fid) = fallback_id {
        if !fid.is_empty() {
            resp["id"] = json!(fid);
        }
    }
    // OpenAI usage 原样 / Gemini usageMetadata 转换；无则不挂字段（避免无用量厂商多出零值）
    if let Some(usage) = resolve_client_usage(v) {
        resp["usage"] = usage;
    }
    to_json(&resp)
}

// ── 异步 POST 提交 ack（带 status:pending；终态 status 只在轮询响应）──
fn build_openai_submit(category: &str, v: &Value, id: &str) -> String {
    to_json(&json!({
        "id": id,
        "object": openai_object(category),
        "status": "pending",
        "created": resolve_created(v)
    }))
}

// ── 异步轮询 ──
/// fallback_id: 客户端轮询钥匙（path / logs.task_id）；优先于上游体内 id（级联 cgt 等）
fn build_openai_poll(category: &str, v: &Value, fallback_id: Option<&str>) -> String {
    let urls = find_urls(v);
    let status = openai_status(v, &urls);
    let id = fallback_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| find_id(v));

    let mut resp = json!({
        "id": id,
        "object": openai_object(category),
        "status": status,
        "created": resolve_created(v)
    });

    if status == "completed" {
        if !urls.is_empty() {
            let extra = scan_extra_metadata(v);
            let items: Vec<Value> = urls
                .iter()
                .map(|u| {
                    let mut item = build_data_item(u);
                    for (k, ev) in &extra {
                        item[k] = ev.clone();
                    }
                    item
                })
                .collect();
            resp["data"] = json!(items);
        }
        resp["usage"] = resolve_client_usage(v).unwrap_or_else(
            || json!({"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}),
        );
    }

    if status == "failed" {
        resp["error"] = openai_error_object(v);
    }

    to_json(&resp)
}

/// 统一从 Value 中提取最核心的错误文本信息（集合了所有的已知厂商指针路径）
pub fn extract_error_message_from_value(v: &Value) -> Option<String> {
    // fal / FastAPI：{"detail":[{"msg":"..."}, ...]} 或 {"detail":"..."}
    if let Some(msg) = fastapi_detail_message(v) {
        return Some(msg);
    }

    v.pointer("/data/error/message")
        .or_else(|| v.pointer("/data/error"))
        .or_else(|| v.pointer("/error/message"))
        .or_else(|| v.pointer("/error"))
        .or_else(|| v.pointer("/task/error/message")) // MiniMax H3: { task: { error: { message } } }
        .or_else(|| v.pointer("/base_resp/status_msg")) // MiniMax 图片/部分接口
        .or_else(|| v.pointer("/data/task/task_status_msg"))
        .or_else(|| v.pointer("/data/0/message")) // 可灵 3.0 失败说明
        .or_else(|| v.pointer("/data/errorMsg"))
        .or_else(|| v.get("message"))
        .or_else(|| v.pointer("/output/message"))
        .or_else(|| v.pointer("/Response/Error/Message"))
        .or_else(|| v.pointer("/ResponseMetadata/Error/Message"))
        // 方舟/智算等扁平错误：{"ErrorCode":"...","ErrorMessage":"..."}
        .or_else(|| v.get("ErrorMessage"))
        // 腾讯云任务级：优先 Response.{TaskType}.Message，无 TaskType 时回退已知 Aigc* 节点
        .or_else(|| tencent_task_message(v))
        .or_else(|| {
            v.pointer("/Response/ProcedureTask/Message")
                .filter(|m| m.as_str().is_some_and(|s| !s.is_empty()))
        })
        .or_else(|| {
            v.pointer("/Response/Message")
                .filter(|m| m.as_str().is_some_and(|s| !s.is_empty()))
        })
        // 即梦 CV 网关错误体：[{"algo_msg":"..."}]
        .or_else(|| v.pointer("/0/algo_msg"))
        .and_then(|val| {
            if val.is_object() {
                val.get("message")
                    .or_else(|| val.get("msg"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(val.to_string()))
            } else {
                val.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| Some(val.to_string()))
            }
        })
}

/// fal / FastAPI 校验错误：`detail` 为对象数组（取 msg）或纯字符串
fn fastapi_detail_message(v: &Value) -> Option<String> {
    let detail = v.get("detail")?;
    if let Some(arr) = detail.as_array() {
        let msgs: Vec<&str> = arr
            .iter()
            .filter_map(|item| item.get("msg").and_then(|m| m.as_str()))
            .filter(|s| !s.is_empty())
            .collect();
        (!msgs.is_empty()).then(|| msgs.join("; "))
    } else {
        detail
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    }
}

/// 腾讯云 VOD/混元任务节点 Message：复用 [`usage_extractor::tencent_aigc_task`]
fn tencent_task_message(v: &Value) -> Option<&Value> {
    let msg = usage_extractor::tencent_aigc_task(v.get("Response")?)?.get("Message")?;
    match msg.as_str() {
        Some(s) if !s.is_empty() => Some(msg),
        _ => None,
    }
}

/// 从任意厂商响应 JSON 中提取错误消息（兼容可灵、APIMart、DashScope 等）
/// 供各 relay 模块复用，避免硬编码通用错误文本
pub fn extract_error_message(v: &Value) -> String {
    extract_error_message_from_value(v).unwrap_or_else(|| "generation failed".to_string())
}

/// 从响应 JSON 中提取结构化错误分类码，供 HTTP 状态码推断和错误格式化使用
/// 优先精确路径（error.code / data.error.code / 腾讯云 / 即梦火山网关 / ErrorCode），兜底根节点 code
/// 接受字符串（如 "PolicyViolation" / "PERMISSION_ERROR"）和数字（如 429），统一转为字符串返回
/// 注：仅在已确认为错误响应时调用，根节点 code 不会出现成功值（10000/200/0）
pub fn extract_error_code_from_value(v: &Value) -> Option<String> {
    v.pointer("/error/code")
        .or_else(|| v.pointer("/data/error/code"))
        .or_else(|| v.pointer("/task/error/code")) // MiniMax H3
        .or_else(|| v.pointer("/base_resp/status_code")) // MiniMax 图片/部分接口
        .or_else(|| v.pointer("/Response/Error/Code"))
        .or_else(|| v.pointer("/ResponseMetadata/Error/Code"))
        // 方舟/智算等扁平错误：{"ErrorCode":"PERMISSION_ERROR","ErrorMessage":"..."}
        .or_else(|| v.get("ErrorCode"))
        .or_else(|| v.get("code")) // APIMart/即梦根节点数字或字符串 code
        .and_then(|c| {
            c.as_str()
                .map(|s| s.to_string())
                .or_else(|| c.as_i64().map(|n| n.to_string()))
        })
}

/// 尾帧图：`content.last_frame_url`、顶层 `last_frame_url`、OpenAI `data[0].last_frame_url`、腾讯云 VOD UsageType
pub fn find_last_frame_url(v: &Value) -> Option<&str> {
    if let Some(url) = v
        .pointer("/content/last_frame_url")
        .or_else(|| v.get("last_frame_url"))
        .or_else(|| v.pointer("/data/0/last_frame_url"))
        .and_then(|u| u.as_str())
        .filter(|s| !s.is_empty())
    {
        return Some(url);
    }

    // 腾讯云 AIGC 任务 Output.FileInfos: UsageType 为 last_frame_url，地址为 FileUrl
    let arr = usage_extractor::tencent_aigc_task(v)
        .and_then(|t| t.pointer("/Output/FileInfos"))
        .and_then(|a| a.as_array())?;
    for item in arr {
        if item.get("UsageType").and_then(|u| u.as_str()) == Some("last_frame_url") {
            return item.get("FileUrl").and_then(|u| u.as_str()).filter(|s| !s.is_empty());
        }
    }
    None
}

/// 从上游响应中扫描厂商特有的重要附加字段
fn scan_extra_metadata(v: &Value) -> serde_json::Map<String, Value> {
    let mut meta = serde_json::Map::new();
    if let Some(url) = find_last_frame_url(v) {
        meta.insert("last_frame_url".to_string(), json!(url));
    }
    meta
}

/// 辅助函数：判断响应体是否是上游业务报错状态（聚合所有已知厂商的报错标识，如腾讯云、即梦、火山MediaKit、Bytefor等）
pub fn is_upstream_error_response(v: &Value) -> bool {
    // 1. 腾讯云 API 级别错误
    if v.pointer("/Response/Error").is_some() {
        return true;
    }
    if v.pointer("/Response/ErrMsg")
        .and_then(|s| s.as_str())
        .is_some_and(|s| !s.is_empty())
    {
        return true;
    }
    // 2. 即梦/火山网关错误
    if v.pointer("/ResponseMetadata/Error").is_some() {
        return true;
    }
    // 3. 方舟/智算等扁平错误：{"ErrorCode":"PERMISSION_ERROR","ErrorMessage":"..."}
    //    仅认非空 PascalCase ErrorCode，避免与业务成功体中的小写 code/message 混淆
    if v.get("ErrorCode")
        .and_then(|c| c.as_str())
        .is_some_and(|c| !c.is_empty())
    {
        return true;
    }
    // 4. 含有 error 节点（且 error 节点内含有 message/msg 或 code，或者 error 本身是字符串）
    if let Some(err) = v.get("error") {
        if err.is_string()
            || err.get("message").is_some()
            || err.get("msg").is_some()
            || err.get("code").is_some()
        {
            return true;
        }
    }
    if let Some(err) = v.pointer("/data/error") {
        if err.is_string()
            || err.get("message").is_some()
            || err.get("msg").is_some()
            || err.get("code").is_some()
        {
            return true;
        }
    }
    // 5. 常见的 code 错误指示（排除 0 和 200, 10000 等正常成功值）
    if let Some(code_val) = v.get("code") {
        if let Some(code) = code_val.as_i64() {
            if code != 0 && code != 200 && code != 10000 {
                return true;
            }
        } else if let Some(code_str) = code_val.as_str() {
            if code_str != "0"
                && code_str != "200"
                && code_str != "10000"
                && code_str != "success"
                && code_str != "ok"
            {
                return true;
            }
        }
    }
    // 6. 火山 MediaKit success 字段指示
    if let Some(success) = v.get("success").and_then(|s| s.as_bool()) {
        if !success {
            return true;
        }
    }
    // 7. MiniMax: base_resp.status_code != 0（图片等同步接口 HTTP 仍可能 200）
    if let Some(code) = v.pointer("/base_resp/status_code").and_then(|c| c.as_i64()) {
        if code != 0 {
            return true;
        }
    }
    // 8. fal / FastAPI：{"detail":"..."} 或 {"detail":[{"msg":"..."}]}
    if fastapi_detail_message(v).is_some() {
        return true;
    }
    false
}

/// 标准 OpenAI `error` 对象（poll failed / 纯 error 体共用）
fn openai_error_object(v: &Value) -> Value {
    // 优先 OpenAI 路径 message，避免 extract 抢先命中 /data/error/message
    let msg = v
        .pointer("/error/message")
        .and_then(|m| m.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| extract_error_message(v));

    let raw_type = v
        .pointer("/error/type")
        .and_then(|t| t.as_str())
        .unwrap_or("");
    let code = extract_error_code_from_value(v)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if raw_type.is_empty() {
                "upstream_error".to_string()
            } else {
                raw_type.to_string()
            }
        });

    let err_type = if code.to_lowercase().contains("permission") {
        "permission_error"
    } else if raw_type.is_empty() || raw_type.chars().all(|c| c.is_ascii_digit()) {
        "upstream_error"
    } else {
        raw_type
    };

    json!({
        "message": crate::relay::proxy::sanitize_error_message(&msg),
        "type": err_type,
        "code": code
    })
}

/// 将上游错误 Value 转为标准 OpenAI error JSON：`{"error":{"message","type","code"}}`。
/// - 厂商扁平错误（ErrorCode 等）→ 转换
/// - 已有 `error.message` 但夹带 `success` / 数字 type 等 → 规范化
/// - 非错误体 → `None`（调用方透传原文）
pub fn format_as_openai_error(v: &Value) -> Option<String> {
    if !is_upstream_error_response(v) {
        return None;
    }
    Some(to_json(&json!({ "error": openai_error_object(v) })))
}


