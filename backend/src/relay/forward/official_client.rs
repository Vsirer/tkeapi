/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use serde_json::{json, Value};
use crate::relay::response_formatter::{
    extract_error_code_from_value, extract_error_message_from_value, find_id, find_last_frame_url,
    find_urls,
};

/// 客户端走厂商官方路由（MiniMax、可灵 AI、火山方舟）时组装/规范化官方信封格式。
/// 适用于腾讯云、fal、EdgeOne 等对接各类官方路由的厂商通道。
/// 仅当命中对应官方路由（新旧创建及轮询）时转换，其它路径原样返回。
pub fn wrap_official_client(
    path: &str,
    json_str: &str,
    model: &str,
    request_content: &str,
) -> String {
    let p = path.trim_end_matches('/');

    // 1. MiniMax 官方路由规范
    if p == "/v2/video_generation" {
        return wrap_minimax_v2_create(json_str);
    }
    if p.starts_with("/v2/query/video_generation/") || p == "/v2/query/video_generation" {
        return wrap_minimax_v2_query(json_str, model, request_content);
    }

    // 2. 火山引擎(方舟)官方视频路由规范
    let clean = p.strip_prefix("/v1").unwrap_or(p);
    if clean == "/api/v3/contents/generations/tasks" {
        return wrap_volcengine_create(json_str);
    }
    if clean.starts_with("/api/v3/contents/generations/tasks/") {
        return wrap_volcengine_query(json_str, model, request_content);
    }

    // 3. 可灵 3.0 / Omni 最新官方原生路由（注册于顶层根路径）
    // 创建：/text-to-video/{model}, /image-to-video/{model}, /omni-video/{model} (兼容带 /v1)
    if clean.starts_with("/text-to-video/")
        || clean.starts_with("/image-to-video/")
        || clean.starts_with("/omni-video/")
    {
        return wrap_kling_create(json_str, true);
    }
    // 轮询：GET /tasks?task_ids=... (兼容带 /v1 前缀)
    if clean == "/tasks" {
        return wrap_kling_query(json_str, request_content, true);
    }

    // 4. 可灵老版官方路由（严格匹配专属路径，绝不使用宽泛的 /videos/，彻底杜绝误伤 OpenAI 等其它通道）
    // 创建：/v1/videos/text2video, /v1/videos/image2video, /v1/videos/omni-video
    if clean == "/videos/text2video"
        || clean == "/videos/image2video"
        || clean == "/videos/omni-video"
    {
        return wrap_kling_create(json_str, false);
    }
    // 轮询：/v1/videos/text2video/{id}, /v1/videos/image2video/{id}, /v1/videos/omni-video/{id}
    if clean.starts_with("/videos/text2video/")
        || clean.starts_with("/videos/image2video/")
        || clean.starts_with("/videos/omni-video/")
    {
        return wrap_kling_query(json_str, request_content, false);
    }

    json_str.to_string()
}

/// 将官方创建路径映射为其对应的轮询/查询路径；非官方路径则原样返回
pub fn to_official_query_path(path: &str, task_id: &str) -> String {
    let p = path.trim_end_matches('/');
    let clean = p.strip_prefix("/v1").unwrap_or(p);
    if clean == "/v2/video_generation" {
        return "/v2/query/video_generation".to_string();
    }
    if clean == "/api/v3/contents/generations/tasks" {
        let tid = if task_id.is_empty() { "poll" } else { task_id };
        return format!("{}/{}", clean, tid);
    }
    if clean.starts_with("/text-to-video/")
        || clean.starts_with("/image-to-video/")
        || clean.starts_with("/omni-video/")
    {
        return "/tasks".to_string();
    }
    if clean == "/videos/text2video"
        || clean == "/videos/image2video"
        || clean == "/videos/omni-video"
    {
        let tid = if task_id.is_empty() { "poll" } else { task_id };
        return format!("{}/{}", p, tid);
    }
    path.to_string()
}

/// 判断给定的请求路径是否属于厂商官方原生路由（MiniMax、可灵、火山方舟等）
#[inline]
pub fn is_official_route(path: &str) -> bool {
    let clean = path.split(['|', '?']).next().unwrap_or("").trim_end_matches('/');
    clean == "/v2/video_generation"
        || clean.starts_with("/v2/query/video_generation")
        || clean == "/api/v3/contents/generations/tasks"
        || clean.starts_with("/api/v3/contents/generations/tasks/")
        || clean == "/tasks"
        || clean.starts_with("/text-to-video/")
        || clean.starts_with("/image-to-video/")
        || clean.starts_with("/omni-video/")
        || clean.starts_with("/videos/")
        || clean.starts_with("/v1/videos/")
}

fn wrap_kling_create(raw: &str, is_v3: bool) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };
    if v.get("code").and_then(Value::as_i64).is_some_and(|c| c != 0) {
        return raw.to_string();
    }
    // 已具备对应版本的纯净结构则原样返回
    if is_v3 {
        if v.pointer("/data/id").is_some() && v.pointer("/data/task_id").is_none() {
            return raw.to_string();
        }
    } else if v.pointer("/data/task_id").is_some() && v.pointer("/data/id").is_none() {
        return raw.to_string();
    }

    let id = find_id(&v);
    if id.is_empty() {
        return raw.to_string();
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let status = match crate::relay::response_formatter::parse_raw_status_to_standard(
        &crate::relay::response_formatter::extract_raw_status(&v),
    ) {
        "completed" => if is_v3 { "succeeded" } else { "succeed" },
        "in_progress" => "processing",
        "failed" => "failed",
        _ => "submitted",
    };
    let create_time = v
        .get("created")
        .and_then(Value::as_i64)
        .map(|t| if t < 10_000_000_000 { t * 1000 } else { t })
        .unwrap_or(now_ms);
    let update_time = v
        .get("updated")
        .and_then(Value::as_i64)
        .map(|t| if t < 10_000_000_000 { t * 1000 } else { t })
        .unwrap_or(create_time);

    let ext_id = v.get("external_id").and_then(Value::as_str);

    let data = if is_v3 {
        let mut obj = json!({
            "id": id,
            "status": status,
            "create_time": create_time,
            "update_time": update_time,
        });
        if let Some(ext) = ext_id {
            obj["external_id"] = json!(ext);
        }
        obj
    } else {
        let mut obj = json!({
            "task_id": id,
            "task_status": status,
            "created_at": create_time,
            "updated_at": update_time,
        });
        if let Some(ext) = ext_id {
            obj["external_task_id"] = json!(ext);
        }
        obj
    };

    json!({
        "code": 0,
        "message": v.get("message").and_then(Value::as_str).unwrap_or("SUCCEED"),
        "request_id": v.get("request_id").or_else(|| v.get("id")).and_then(Value::as_str).unwrap_or(&id),
        "data": data
    })
    .to_string()
}

fn wrap_kling_query(raw: &str, request_content: &str, is_v3: bool) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };
    if v.get("code").and_then(Value::as_i64).is_some_and(|c| c != 0) {
        return raw.to_string();
    }
    // 已具备对应版本的纯净结构则原样返回
    if is_v3 {
        if let Some(arr) = v.get("data").and_then(Value::as_array) {
            if !arr.is_empty() && arr[0].get("id").is_some() && arr[0].get("task_id").is_none() {
                return raw.to_string();
            }
        }
    } else if v.pointer("/data/task_id").is_some()
        && v.pointer("/data/id").is_none()
        && v.get("data").and_then(Value::as_object).is_some()
    {
        return raw.to_string();
    }

    let id = find_id(&v);
    if id.is_empty() {
        return raw.to_string();
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let status = match crate::relay::response_formatter::parse_raw_status_to_standard(
        &crate::relay::response_formatter::extract_raw_status(&v),
    ) {
        "completed" => if is_v3 { "succeeded" } else { "succeed" },
        "in_progress" => "processing",
        "failed" => "failed",
        _ => "submitted",
    };
    let message = extract_error_message_from_value(&v).unwrap_or_default();
    let create_time = v
        .get("created")
        .and_then(Value::as_i64)
        .map(|t| if t < 10_000_000_000 { t * 1000 } else { t })
        .unwrap_or(now_ms);
    let update_time = v
        .get("updated")
        .and_then(Value::as_i64)
        .map(|t| if t < 10_000_000_000 { t * 1000 } else { t })
        .unwrap_or(create_time);

    let outputs = if status == "succeeded" || status == "succeed" {
        if let Some(arr) = v
            .pointer("/data/0/outputs")
            .or_else(|| v.pointer("/data/task_result/videos"))
            .and_then(Value::as_array)
        {
            arr.clone()
        } else {
            let duration = v
                .pointer("/usage/output_seconds")
                .and_then(|d| {
                    if let Some(n) = d.as_i64().filter(|&n| n > 0) {
                        Some(n.to_string())
                    } else if let Some(f) = d.as_f64().filter(|&f| f > 0.0) {
                        Some(if f.fract() == 0.0 {
                            (f as i64).to_string()
                        } else {
                            f.to_string()
                        })
                    } else {
                        d.as_str().filter(|s| !s.is_empty()).map(|s| s.to_string())
                    }
                })
                .unwrap_or_else(|| {
                    let req: Value = serde_json::from_str(request_content).unwrap_or(Value::Null);
                    req.pointer("/settings/duration")
                        .or_else(|| req.get("duration"))
                        .and_then(|d| {
                            if let Some(s) = d.as_str() {
                                Some(s.to_string())
                            } else {
                                d.as_i64().map(|n| n.to_string())
                            }
                        })
                        .unwrap_or_else(|| "5".to_string())
                });

            find_urls(&v)
                .into_iter()
                .enumerate()
                .map(|(idx, u)| {
                    json!({
                        "type": "video",
                        "id": format!("{}_{}", id, idx),
                        "url": u,
                        "duration": duration
                    })
                })
                .collect()
        }
    } else {
        Vec::new()
    };

    let ext_id = v.get("external_id").and_then(Value::as_str);

    let data = if is_v3 {
        let mut item = json!({
            "id": id,
            "status": status,
            "message": message,
            "create_time": create_time,
            "update_time": update_time,
        });
        if status == "succeeded" {
            item["outputs"] = json!(outputs);
        }
        if let Some(ext) = ext_id {
            item["external_id"] = json!(ext);
        }
        json!([item])
    } else {
        let mut obj = json!({
            "task_id": id,
            "task_status": status,
            "task_status_msg": message,
            "created_at": create_time,
            "updated_at": update_time,
        });
        if let Some(ext) = ext_id {
            obj["external_task_id"] = json!(ext);
        }
        if !outputs.is_empty() {
            obj["task_result"] = json!({ "videos": outputs });
        }
        obj
    };

    json!({
        "code": 0,
        "message": "SUCCEED",
        "request_id": v.get("request_id").or_else(|| v.get("id")).and_then(Value::as_str).unwrap_or(&id),
        "data": data
    })
    .to_string()
}

fn wrap_minimax_v2_create(raw: &str) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };
    if v.get("error").is_some() || v.pointer("/Response/Error").is_some() {
        return raw.to_string();
    }
    if v.get("task_id").is_some() && v.get("object").is_none() && v.get("task").is_none() {
        return raw.to_string();
    }
    let id = find_id(&v);
    if id.is_empty() {
        return raw.to_string();
    }
    json!({ "task_id": id }).to_string()
}

fn wrap_minimax_v2_query(raw: &str, model: &str, request_content: &str) -> String {
    let mut v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };
    if let Some(task) = v.get_mut("task").and_then(Value::as_object_mut) {
        if model.is_empty() || task.get("model").and_then(Value::as_str) == Some(model) {
            return raw.to_string();
        }
        task.insert("model".to_string(), json!(model));
        return v.to_string();
    }

    let status = match v.get("status").and_then(Value::as_str).unwrap_or("") {
        "completed" | "succeeded" => "succeeded",
        "failed" => "failed",
        "cancelled" => "cancelled",
        "pending" | "queued" => "queued",
        "in_progress" | "processing" | "running" => "running",
        _ if v.get("error").is_some() => "failed",
        _ => "running",
    };

    let req = serde_json::from_str::<Value>(request_content).unwrap_or(Value::Null);
    let mut task = json!({
        "id": find_id(&v),
        "model": model,
        "status": status,
        "task_type": "generation",
        "modality": "video",
    });
    if let Some(r) = req.get("resolution").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        task["resolution"] = json!(r);
    }
    if let Some(d) = req.get("duration").and_then(Value::as_i64) {
        task["duration"] = json!(d);
    }
    if let Some(r) = req.get("ratio").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        task["ratio"] = json!(r);
    }

    if status == "succeeded" {
        let url = v
            .pointer("/data/0/url")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| find_urls(&v).into_iter().next());
        if let Some(u) = url {
            task["content"] = json!({ "url": u });
        }
        if let Some(usage) = minimax_task_usage(v.get("usage"), req.get("duration")) {
            task["usage"] = usage;
        }
    } else if status == "failed" {
        let code = extract_error_code_from_value(&v).unwrap_or_else(|| "1026".to_string());
        let msg = extract_error_message_from_value(&v).unwrap_or_else(|| "generation failed".to_string());
        task["error"] = json!({ "code": code, "message": msg });
        task["usage"] = json!({});
    }

    json!({ "task": task }).to_string()
}

fn minimax_task_usage(usage: Option<&Value>, req_duration: Option<&Value>) -> Option<Value> {
    let mut out = usage.and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(d) = req_duration.and_then(Value::as_i64) {
        out.entry("output_seconds".to_string()).or_insert(json!(d));
    }

    out.entry("prompt_tokens".to_string()).or_insert(json!(0));
    out.entry("completion_tokens".to_string()).or_insert(json!(0));
    out.entry("input_seconds".to_string()).or_insert(json!(0));
    out.entry("output_seconds".to_string()).or_insert(json!(0));

    let num = |k: &str| -> f64 {
        out.get(k)
            .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|n| n as f64)))
            .unwrap_or(0.0)
    };
    let total_sec = num("output_seconds") + num("input_seconds");
    let total_sec_val = if total_sec.fract() == 0.0 {
        json!(total_sec as i64)
    } else {
        json!(total_sec)
    };
    out.insert("total_seconds".to_string(), total_sec_val);

    let p = out.get("prompt_tokens").and_then(Value::as_i64).unwrap_or(0);
    let c = out.get("completion_tokens").and_then(Value::as_i64).unwrap_or(0);
    out.insert("total_tokens".to_string(), json!(p + c));

    Some(Value::Object(out))
}

fn wrap_volcengine_create(raw: &str) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };
    if v.get("error").is_some() || v.pointer("/Response/Error").is_some() {
        return raw.to_string();
    }
    if v.get("id").is_some() && v.get("object").is_none() && v.get("status").is_none() {
        return raw.to_string();
    }
    let id = find_id(&v);
    if id.is_empty() {
        return raw.to_string();
    }
    json!({ "id": id }).to_string()
}

#[derive(serde::Serialize)]
struct VolcengineQueryResponse<'a> {
    id: &'a str,
    model: &'a str,
    status: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
    created_at: i64,
    updated_at: i64,
    service_tier: &'a str,
    execution_expires_after: i64,
    generate_audio: bool,
    draft: bool,
    priority: i64,
    output_format: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolution: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage: Option<Value>,
}

fn wrap_volcengine_query(raw: &str, model: &str, request_content: &str) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };

    if v.get("id").is_some()
        && v.get("status").is_some()
        && v.get("service_tier").is_some()
        && v.get("object").is_none()
        && (model.is_empty() || v.get("model").and_then(Value::as_str) == Some(model))
    {
        return raw.to_string();
    }

    let raw_status = crate::relay::response_formatter::extract_raw_status(&v);
    let standard = crate::relay::response_formatter::parse_raw_status_to_standard(&raw_status);
    let status = match standard {
        "completed" => "succeeded",
        "failed" => "failed",
        "cancelled" => "cancelled",
        "queued" => "queued",
        _ => "running",
    };

    let id = find_id(&v);
    let now_sec = chrono::Utc::now().timestamp();
    let create_time = v
        .get("created_at")
        .or_else(|| v.get("created"))
        .and_then(Value::as_i64)
        .map(|t| if t > 10_000_000_000 { t / 1000 } else { t })
        .unwrap_or(now_sec);
    let update_time = v
        .get("updated_at")
        .or_else(|| v.get("updated"))
        .and_then(Value::as_i64)
        .map(|t| if t > 10_000_000_000 { t / 1000 } else { t })
        .unwrap_or(now_sec);

    let req: Value = serde_json::from_str(request_content).unwrap_or(Value::Null);

    let final_model = if !model.is_empty() {
        model
    } else {
        v.get("model")
            .or_else(|| req.get("model"))
            .and_then(Value::as_str)
            .unwrap_or("")
    };

    let service_tier = v.get("service_tier").or_else(|| req.get("service_tier")).and_then(Value::as_str).unwrap_or("default");
    let execution_expires_after = v.get("execution_expires_after").or_else(|| req.get("execution_expires_after")).and_then(Value::as_i64).unwrap_or(3600);
    let generate_audio = v.get("generate_audio").or_else(|| req.get("generate_audio")).and_then(Value::as_bool).unwrap_or(true);
    let draft = v.get("draft").or_else(|| req.get("draft")).and_then(Value::as_bool).unwrap_or(false);
    let priority = v.get("priority").or_else(|| req.get("priority")).and_then(Value::as_i64).unwrap_or(0);
    let output_format = v.get("output_format").or_else(|| req.get("output_format")).and_then(Value::as_str).unwrap_or("mp4");

    let (content, seed, resolution, ratio, duration, usage, error) = if status == "succeeded" {
        let content = v.get("content").cloned().map(|mut c| {
            if c.get("last_frame_url").is_none() {
                if let Some(lf) = find_last_frame_url(&v) {
                    c["last_frame_url"] = json!(lf);
                }
            }
            c
        }).or_else(|| {
            let u = v.pointer("/data/0/url").and_then(Value::as_str).map(String::from).or_else(|| find_urls(&v).into_iter().next())?;
            let mut c = json!({ "video_url": u });
            if let Some(lf) = find_last_frame_url(&v) {
                c["last_frame_url"] = json!(lf);
            }
            Some(c)
        });

        let s = v.get("seed").or_else(|| req.get("seed")).and_then(Value::as_i64);
        let res = v.get("resolution").or_else(|| req.get("resolution")).and_then(Value::as_str).map(String::from);
        let rat = v.get("ratio").or_else(|| req.get("ratio")).and_then(Value::as_str).map(String::from);
        let dur = v.get("duration").and_then(Value::as_f64)
            .or_else(|| v.pointer("/usage/output_seconds").and_then(Value::as_f64))
            .or_else(|| v.pointer("/Response/AigcVideoTask/Output/FileInfos/0/MetaData/Duration").and_then(Value::as_f64))
            .or_else(|| req.get("duration").and_then(Value::as_f64))
            .map(|f| f.round() as i64);

        let u = v.get("usage").cloned();

        (content, s, res, rat, dur, u, None)
    } else if status == "failed" {
        let err = v.get("error").cloned().unwrap_or_else(|| {
            let code = extract_error_code_from_value(&v).unwrap_or_else(|| "generation_failed".to_string());
            let msg = extract_error_message_from_value(&v).unwrap_or_else(|| "generation failed".to_string());
            json!({ "code": code, "message": msg })
        });
        (None, None, None, None, None, None, Some(err))
    } else {
        (None, None, None, None, None, None, None)
    };

    let resp = VolcengineQueryResponse {
        id: &id,
        model: final_model,
        status,
        error,
        created_at: create_time,
        updated_at: update_time,
        service_tier,
        execution_expires_after,
        generate_audio,
        draft,
        priority,
        output_format,
        content,
        seed,
        resolution,
        ratio,
        duration,
        usage,
    };

    serde_json::to_string(&resp).unwrap_or_else(|_| raw.to_string())
}

/// 日志还没有上游响应时，按本次请求路径组装受理体。
pub fn route_accept_body(path: &str, task_id: &str, model: &str) -> String {
    let now = chrono::Utc::now().timestamp();
    let seed = json!({
        "id": task_id,
        "task_id": task_id,
        "status": "pending",
        "created": now,
    })
    .to_string();
    let p = path.split(['|', '?']).next().unwrap_or(path).trim_end_matches('/');
    if crate::relay::response_formatter::is_openai_compatible_path(p) {
        return crate::relay::response_formatter::format_openai("视频", &seed, false, Some(task_id));
    }
    if p.contains("/video-generation/video-synthesis") || p.starts_with("/api/v1/tasks/") {
        return json!({
            "request_id": task_id,
            "output": { "task_id": task_id, "task_status": "PENDING" }
        })
        .to_string();
    }
    wrap_official_client(p, &seed, model, "")
}

/// 本次视频受理（POST 已返回系统任务号，上游提交在后台）。
pub fn tag_is_video_accept(tag: &str) -> bool {
    serde_json::from_str::<Value>(tag)
        .ok()
        .and_then(|v| v.get("la").and_then(Value::as_i64))
        == Some(1)
}

/// 新受理且响应仍为空、上游号还没写下：轮询只回受理体。
pub fn awaiting_video_submit(response: &str, tag: &str) -> bool {
    if !response.trim().is_empty() {
        return false;
    }
    let Ok(v) = serde_json::from_str::<Value>(tag) else {
        return false;
    };
    v.get("la").and_then(Value::as_i64) == Some(1)
        && !v
            .get("upstream_task")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty())
}

pub fn remember_upstream_task(tag: &mut Option<String>, upstream_id: &str) {
    let id = upstream_id.trim();
    if id.is_empty() {
        return;
    }
    let mut v: Value = tag
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| json!({}));
    let Some(obj) = v.as_object_mut() else {
        return;
    };
    obj.insert("la".into(), json!(1));
    obj.insert("upstream_task".into(), json!(id));
    *tag = Some(v.to_string());
}

#[cfg(test)]
mod route_accept_tests {
    use super::*;

    #[test]
    fn awaiting_only_when_new_accept_has_no_result() {
        assert!(awaiting_video_submit("", r#"{"la":1}"#));
        assert!(!awaiting_video_submit("", r#"{}"#));
        assert!(!awaiting_video_submit(r#"{"id":"x"}"#, r#"{"la":1}"#));
        assert!(!awaiting_video_submit(
            "",
            r#"{"la":1,"upstream_task":"up-1"}"#
        ));
    }

    #[test]
    fn route_bodies_use_system_task_id() {
        let id = "tsk_abc";
        let openai = route_accept_body("/v1/video/generations", id, "m");
        assert!(openai.contains(id) && openai.contains("pending"));
        let volc = route_accept_body("/api/v3/contents/generations/tasks", id, "m");
        assert!(volc.contains(id));
        let ali = route_accept_body(
            "/api/v1/services/aigc/video-generation/video-synthesis",
            id,
            "m",
        );
        assert!(ali.contains("PENDING") && ali.contains(id));
        let poll = route_accept_body("/v1/video/generations/tsk_abc", id, "m");
        assert!(poll.contains(id) && poll.contains("pending"));
    }
}


