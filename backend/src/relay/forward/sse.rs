/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

// ── SSE 流式转换 ──────────────────────────────────────────────

/// 根据 target_type 转换 SSE 数据行为 OpenAI 格式
pub fn transform_sse_line(target_type: &str, line: &str, model: &str) -> Option<String> {
    if !line.starts_with("data: ") {
        return None;
    }
    let data = &line[6..];
    if data == "[DONE]" {
        return None;
    }

    match target_type {
        "anthropic" => transform_anthropic_sse(data, model),
        "gemini" => transform_gemini_sse(data, model),
        _ => Some(data.to_string()), // OpenAI 兼容直接透传
    }
}

fn transform_anthropic_sse(data: &str, model: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    let event_type = v.get("type")?.as_str()?;
    if event_type == "content_block_delta" {
        let text = v.get("delta")?.get("text")?.as_str()?;
        return serde_json::to_string(&create_openai_chunk(text, model)).ok();
    }
    None
}

fn transform_gemini_sse(data: &str, model: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(data).ok()?;

    // 文字内容 chunk（candidates[0].content.parts[0].text）
    let text_chunk = v
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .and_then(|text| serde_json::to_string(&create_openai_chunk(text, model)).ok());

    // usage chunk（usageMetadata → OpenAI usage，含 reasoning / cached）
    let usage_chunk = v.get("usageMetadata").and_then(|meta| {
        let usage = crate::relay::usage_extractor::gemini_usage_metadata_to_openai(meta);
        serde_json::to_string(&serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "object": "chat.completion.chunk",
            "created": chrono::Utc::now().timestamp(),
            "model": model,
            "choices": [],
            "usage": usage
        }))
        .ok()
    });

    match (text_chunk, usage_chunk) {
        (Some(t), Some(u)) => Some(format!("{}\n\ndata: {}", t, u)),
        (Some(t), None) => Some(t),
        (None, Some(u)) => Some(u),
        (None, None) => None,
    }
}

fn create_openai_chunk(text: &str, model: &str) -> serde_json::Value {
    serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "object": "chat.completion.chunk",
        "created": chrono::Utc::now().timestamp(),
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {"role": "assistant", "content": text},
            "finish_reason": null
        }]
    })
}
