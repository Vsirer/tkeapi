/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay: POST /v1/video/generations（对外主入口）；POST /v1/videos 与 POST /v1/videos/generations 为 OpenAI 兼容别名
//! OpenAI-compatible video generation task endpoint with forward-rule-driven protocol adaptation.

use super::cascade::{
    cascade_check_resolution, cascade_resolve_base, cascade_resolve_enhance, cascade_resolve_scene,
};
use super::{forward, proxy, router, upstream_headers};
use crate::models::ApiToken;
use crate::{
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, OriginalUri, State},
    response::Response,
    Json,
};
use std::sync::Arc;

/// POST /v1/video/generations — Submit a video generation task

pub async fn video_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    headers: axum::http::HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let raw_path = uri.path();
    // 归一化到兼容入口，便于匹配转发规则 path_rewrite.old=/v1/video/generations：
    // - OpenAI Videos：/v1/videos
    // - 可灵原生：/v1/videos/text2video|image2video|...
    let entry_path = if raw_path == "/v1/videos" || raw_path.starts_with("/v1/videos/") {
        "/v1/video/generations".to_string()
    } else {
        raw_path.to_string()
    };
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let x_log_id = headers
        .get("x-log-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let mut model_opt = body["model"]
        .as_str()
        .or_else(|| body["model_name"].as_str())
        .map(|s| s.to_string());
    let mut category = "视频";
    let mut db_model_from_mid = None;

    // 当直接访问媒体增强工具接口时，自动从路径 and 参数中推导并反查对应的激活模型 ID
    if model_opt.is_none() {
        let mid = if raw_path.contains("/tools/enhance-video-fast") {
            Some("vve-ft")
        } else if raw_path.contains("/tools/enhance-video-generative") {
            Some("vve-gt")
        } else if raw_path.contains("/tools/erase-video-subtitle-pro") {
            Some("vvs-ep")
        } else if raw_path.contains("/tools/erase-video-subtitle") {
            Some("vvs-er")
        } else if raw_path.contains("/tools/enhance-video") {
            if body["tool_version"].as_str() == Some("professional") {
                Some("vve-pf")
            } else {
                Some("vve-sd")
            }
        } else {
            None
        };

        if let Some(m) = mid {
            // 通过固定不可变的 mid 反查数据库，获取用户自定义修改后当前处于激活状态的模型
            if let Some(model_data) = proxy::find_active_model_by_mid(&state, m).await {
                model_opt = Some(model_data.model_id.clone());
                db_model_from_mid = Some(model_data);
                category = "视频增强";
            } else {
                return Err(AppError::NotFound(format!(
                    "预置画质增强模型 (mid: {}) 未在系统启用或未激活",
                    m
                )));
            }
        }
    }

    let model_str = model_opt
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;
    let model = model_str.as_str();

    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, model, &entry_path, Some(category))
        .await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    let mut billing_rule_cache = None;
    let mut access_cache = None;

    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        // 2. 渠道选择
        let mut ha_pool = None;
        let channel = match proxy::select_channel_with_db(
            &state,
            &token,
            model,
            &ctx.user_group,
            &ctx.level_id,
            &entry_path,
            db_model_from_mid.as_ref(),
            &ha.exclude_aids,
            !ha.had_upstream,
            Some(category),
            &mut ha_pool,
        )
        .await
        {
            Ok(c) => {
                ha.note_pool(ha_pool);
                ha.on_channel(&c);
                c
            }
            Err(e) => {
                ha.note_pool(ha_pool);
                ha.on_select_err(e);
                break;
            }
        };

        // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额，同时获取 Model 供下游复用）
        let (pre_deduction, db_model, resolved_cat) = match proxy::check_access_with_model(
            &state,
            &token,
            model,
            &ctx,
            Some(category),
            &channel,
            db_model_from_mid.as_ref(),
            &mut access_cache,
        )
        .await
        {
            Ok(v) => v,
            Err(e) => {
                ha.on_access_err(e);
                break;
            }
        };

        // 转发规则（复用 db_model 避免重查 models 表）
        let mut resolved = match forward::resolve_forward_rule(
            &state,
            model,
            &resolved_cat,
            &entry_path,
            Some(&channel),
            db_model.as_ref(),
        )
        .await
        {
            Some(r) => r,
            None => {
                if forward::model_has_forward_rules(&state, model).await {
                    ha.on_access_err(AppError::BadRequest(format!(
                        "模型 '{}' 不支持当前接口，请检查模型对应的转发规则",
                        model
                    )));
                    break;
                }
                forward::infer_forward_from_base_url(
                    &channel.base_url,
                    &resolved_cat,
                    db_model.as_ref(),
                )
            }
        };
        // 根据渠道 base_url 修正 target_type（如 APIMart 需从 "openai" 覆盖为 "apimart"）
        forward::refine_target_type(&mut resolved, &channel.base_url);
        forward::apply_channel_provider(&mut resolved, &channel);

        // 模型映射：视频走分辨率档（resolve_model_body）；依赖本轮 Channel/子配，不可环外缓存
        let (final_resolved_model, mapping_source) = router::resolve_model_body(
            &channel,
            model,
            db_model.as_ref(),
            Some(&body),
        );

        let db_rule = proxy::get_model_billing_rule(
            &state,
            model,
            Some(&channel),
            db_model.as_ref(),
            &mut billing_rule_cache,
        )
        .await;
        let mut upstream_body: serde_json::Value = forward::transform_request_body(
            &resolved,
            &final_resolved_model,
            &body,
            &resolved_cat,
            db_rule.as_ref(),
            Some(&state.http_client),
        )
        .await;

        // 通用视频模型分辨率校验（有分辨率计费配置且未开启时拦截，非分辨率计费全放行）
        if !resolved.is_cascade {
            if let Some(res_str) = body
                .get("resolution")
                .or_else(|| upstream_body.get("resolution"))
                .and_then(|v| v.as_str())
            {
                cascade_check_resolution(db_rule.as_ref(), "", res_str)?;
            }
        }

        // 级联超分：增强档优先转发规则 res_enhance，缺省标准版；忽略请求体 version
        let mut cascade_tag_json = None;
        if resolved.is_cascade {
            if body
                .get("output_format")
                .and_then(|v| v.as_str())
                .is_some_and(|s| s.trim().eq_ignore_ascii_case("mov"))
            {
                return Err(AppError::BadRequest(
                    "暂不支持 output_format 为 mov".to_string(),
                ));
            }
            // 目标分辨率单一来源：请求体 → 上游体 → 720p（与 cascade 标签 / 计费缺省一致）
            let target_res = if let Some(v) = body.get("resolution") {
                v.as_str()
                    .ok_or_else(|| AppError::BadRequest(format!("此模型不支持的分辨率: {}", v)))?
            } else {
                upstream_body
                    .get("resolution")
                    .and_then(|r| r.as_str())
                    .unwrap_or("720p")
            };
            let target_key = target_res.trim().to_ascii_lowercase();
            let (cascade_version, volc_mid) =
                cascade_resolve_enhance(&target_key, &resolved.res_enhance);
            cascade_check_resolution(db_rule.as_ref(), cascade_version, &target_key)?;

            // 阶段一座底：优先 res_base，否则默认一级；标准版场景供阶段二透传
            // 目标分辨率只写入 cascade（计费/阶段二同源），不改写用户入参
            let base_res = cascade_resolve_base(&target_key, &resolved.res_base);
            let cascade_scene =
                cascade_resolve_scene(cascade_version, &target_key, &resolved.res_scene);
            upstream_body["resolution"] = serde_json::json!(base_res);
            crate::relay_debug!(
                "[Cascade] 模型: {}, 增强: {}({}), 目标: {}, 底座: {}, 场景: {}",
                model,
                cascade_version,
                volc_mid,
                target_key,
                base_res,
                cascade_scene.unwrap_or("-")
            );

            let volc_db_model = proxy::find_active_model_by_mid(&state, volc_mid)
                .await
                .ok_or_else(|| {
                    AppError::NotFound(format!(
                        "预置画质增强模型 (mid: {}) 未在系统启用或未激活",
                        volc_mid
                    ))
                })?;
            let volc_model_id = volc_db_model.model_id.as_str();

            let mut _ha_pool = None;
            let volc_channel = match proxy::select_channel_with_db(
                &state,
                &token,
                volc_model_id,
                &ctx.user_group,
                &ctx.level_id,
                &entry_path,
                Some(&volc_db_model),
                &[],
                true,
                Some("视频增强"),
                &mut _ha_pool,
            )
            .await
            {
                Ok(ch) => ch,
                Err(e) => {
                    crate::relay_debug!(
                        "[Cascade S2 Error] 级联画质增强专属渠道获取失败! 模型='{}' 分组='{}' 等级='{}' MIDs={:?} 错误={:?}",
                        volc_model_id, ctx.user_group, ctx.level_id, Some(vec![volc_db_model.mid.clone()]), e
                    );
                    return Err(e);
                }
            };

            let enhance_resolved = forward::resolve_forward_rule(
                &state,
                volc_model_id,
                "视频增强",
                &entry_path,
                Some(&volc_channel),
                Some(&volc_db_model),
            )
            .await
            .unwrap_or_else(|| {
                forward::infer_forward_from_base_url(
                    &volc_channel.base_url,
                    "视频增强",
                    Some(&volc_db_model),
                )
            });
            let (volc_final_model, _) =
                router::resolve_model(&volc_channel, volc_model_id, Some(&volc_db_model), None);

            // cascade：阶段二渠道信息；version/resolution 供预扣费写入 billing_features（不改用户入参）
            let mut cascade_val = serde_json::json!({
                "mid": volc_mid,
                "resolution": target_key,
                "version": cascade_version,
                "final_model": volc_final_model,
                "base_url": volc_channel.base_url,
                "api_key": volc_channel.api_key,
                "ch_id": volc_channel.id,
                "ch_name": volc_channel.name,
                "rate": volc_channel.rate,
                "auth_type": enhance_resolved.auth_type,
                "upstream_path": enhance_resolved.upstream_path,
                "target_type": enhance_resolved.target_type,
                "poll_path": enhance_resolved.poll_path,
            });
            if let Some(scene) = cascade_scene {
                cascade_val["scene"] = serde_json::json!(scene);
            }

            // 仅 volc_enhance_cascade 预探测时长写入 input_duration，供阶段二结算
            if db_rule
                .as_ref()
                .is_some_and(|r| r.billing_rule == "volc_enhance_cascade")
            {
                let video_urls = proxy::extract_request_video_urls(&body);
                if !video_urls.is_empty() {
                    let dur = proxy::sum_remote_media_duration(&state.http_client, &video_urls)
                        .await
                        .map_err(AppError::BadRequest)?;
                    if dur > 0.0 {
                        cascade_val["input_duration"] = serde_json::json!(dur);
                    }
                }
            }

            cascade_tag_json = Some(cascade_val);
        }

        // 预提取特征并预探测多媒体实际时长（供各规则入库快照）
        let pre_features = if db_rule
            .as_ref()
            .is_some_and(|r| {
                r.billing_rule == "fal_ref_video"
                    || r.billing_rule == "minimax_h3"
                    || r.billing_rule == "video_seconds_io"
            })
        {
            let mut feat = crate::relay::usage_extractor::extract_request_features(&upstream_body);
            let video_urls = proxy::extract_request_video_urls(&upstream_body);
            let audio_urls = proxy::extract_request_audio_urls(&upstream_body);
            if !video_urls.is_empty() || !audio_urls.is_empty() {
                let (v_dur, a_dur) = tokio::try_join!(
                    proxy::sum_remote_media_duration(&state.http_client, &video_urls),
                    proxy::sum_remote_media_duration(&state.http_client, &audio_urls)
                )
                .map_err(AppError::BadRequest)?;
                if v_dur > 0.0 {
                    feat.video_ref_seconds = Some(v_dur);
                }
                if a_dur > 0.0 {
                    feat.audio_ref_seconds = Some(a_dur);
                }
            }
            Some(feat)
        } else {
            None
        };

        // 可灵动态路径：根据请求体内容调整实际端点（text2video/image2video/multi-image2video）
        forward::resolve_kling_dynamic_path(&mut resolved, &upstream_body);

        let url = forward::build_upstream_url(
            &channel.base_url,
            &resolved,
            &final_resolved_model,
            &channel.api_key,
        );

        // 【一条日志原则】请求前预记录日志（model 记录用户请求的第1个模型 ID）
        let ep = format!(
            "{}|{}",
            raw_path,
            resolved
                .upstream_path
                .replace("${model}", &final_resolved_model)
        );

        // plugin_tag：级联 / 客户端 callback（上游体根级 callback_url；与入口是否 OpenAI 无关）
        // 火山等官方参数可经 OpenAI 路由透传到 upstream_body
        let client_cb = super::vendor_callback::extract_client_callback_url(&upstream_body);
        let plugin_tag: Option<String> = {
            let mut tag_json = serde_json::json!({});
            if let Some(cascade_val) = cascade_tag_json {
                tag_json["cascade"] = cascade_val;
            }
            if let Some(ref u) = client_cb {
                super::vendor_callback::stash_cb_in_plugin_tag(&mut tag_json, u);
            }
            let s = tag_json.to_string();
            if s == "{}" || s == "null" {
                None
            } else {
                Some(s)
            }
        };

        let mut pending_pk: Option<i64> = ha.pending_log_id;
        if ha.pending_log_id.is_none() {
            pending_pk = proxy::record_pending_log(proxy::PendingLog {
                state: &state,
                user_id: &token.user_id,
                token_id: token.id,
                model: model,
                endpoint: &ep,
                is_stream: 0,
                request_content: Some(&request_content_str),
                upstream_url: Some(&url),
                channel: &channel,
                plugin_tag: plugin_tag.as_deref(),
                category: Some(resolved_cat.as_str()),
                db_model: db_model.as_ref(),
                forward_eid: Some(&resolved.eid),
                requested_log_id: x_log_id.as_deref(),
            })
            .await;
            ha.set_pending(pending_pk);
            #[cfg(feature = "plugin_volcengine_enhance")]
            if resolved.target_type == "volcengine_media_enhance" {
                if let Some(pk) = ha.pending_log_id {
                    crate::api::plugins::link_volcengine_enhance_log(&state, pk).await;
                }
            }
        }

        // 素材转换：上游渠道转换优先；否则走现有插件凭证转换
        let mut asset_convert_log: Option<String> = None;
        if resolved.upstream_asset_convert {
            match resolved.upstream_asset_binding_id {
                Some(binding_id) => {
                    let (convert_logs, convert_errors) =
                        super::asset_convert::convert_content_urls_via_upstream(
                            &state,
                            &token.user_id,
                            binding_id,
                            &mut upstream_body,
                        )
                        .await;
                    if !convert_logs.is_empty() {
                        asset_convert_log =
                            Some(format!("上游素材转换: {}", convert_logs.join(" | ")));
                    }
                    if !convert_errors.is_empty() {
                        let full_err = convert_errors.join("; ");
                        let user_msg = convert_errors
                            .iter()
                            .map(|e| proxy::extract_error_message(e))
                            .collect::<Vec<_>>()
                            .join("; ");
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        let status_code = proxy::infer_error_status_code_from_str(&full_err);
                        let _ = proxy::record_zero_cost_fail(proxy::ZeroCostUpstreamFail {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model,
                            prefer_http_status: Some(status_code),
                            endpoint: &ep,
                            latency_ms,
                            is_stream: 0,
                            request_content: request_content_str.clone(),
                            response_body: full_err,
                            response_content: None,
                            upstream_req_content: None,
                            billing_detail: asset_convert_log.clone(),
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: ha.pending_log_id,
                            db_model: db_model.as_ref(),
                            client_msg: None,
                            pre_deducted: 0.0,
                            pre_deduct_gift: 0.0,
                        })
                        .await;
                        return Err(AppError::BadRequest(format!(
                            "上游素材转换失败: {}",
                            user_msg
                        )));
                    }
                }
                None => {
                    return Err(AppError::BadRequest(
                        "上游素材转换失败: 转发规则缺少 upstream_asset_binding_id".into(),
                    ));
                }
            }
        } else if resolved.asset_convert {
            let (convert_logs, convert_errors) = super::asset_convert::convert_content_urls(
                &state,
                &token.user_id,
                &resolved.asset_convert_ns,
                &mut upstream_body,
                resolved.asset_moderation,
            )
            .await;
            if !convert_logs.is_empty() {
                asset_convert_log = Some(format!("素材转换: {}", convert_logs.join(" | ")));
            }
            // 素材转换失败时直接拦截，不再继续调用上游接口
            if !convert_errors.is_empty() {
                let full_err = convert_errors.join("; ");
                let user_msg = convert_errors
                    .iter()
                    .map(|e| proxy::extract_error_message(e))
                    .collect::<Vec<_>>()
                    .join("; ");
                let latency_ms = start_time.elapsed().as_millis() as u32;
                let status_code = proxy::infer_error_status_code_from_str(&full_err);
                let _ = proxy::record_zero_cost_fail(proxy::ZeroCostUpstreamFail {
                    state: &state,
                    token: &token,
                    channel: &channel,
                    model,
                    prefer_http_status: Some(status_code),
                    endpoint: &ep,
                    latency_ms,
                    is_stream: 0,
                    request_content: request_content_str.clone(),
                    response_body: full_err,
                    response_content: None,
                    upstream_req_content: None,
                    billing_detail: asset_convert_log.clone(),
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: ha.pending_log_id,
                    db_model: db_model.as_ref(),
                    client_msg: None,
                    pre_deducted: 0.0,
                    pre_deduct_gift: 0.0,
                })
                .await;
                return Err(AppError::BadRequest(format!("素材转换失败: {}", user_msg)));
            }
        }

        // 上游体根级有 callback_url：改写为系统地址（logs 主键 id）；原地址已存 plugin_tag.cb
        if let (Some(_), Some(pk)) = (&client_cb, pending_pk.or(ha.pending_log_id)) {
            let sys = super::vendor_callback::system_callback_url(pk, &headers);
            super::vendor_callback::rewrite_upstream_callback(&mut upstream_body, &sys);
        }

        // 【连接保护】上游请求+预扣+落库放独立 task，客户端断开后仍能完成
        let pending_log_id = ha.pending_log_id;
        let mapping_detail: Option<String> = mapping_source.map(|src| {
            format!(
                "{}: {} ➞ {}",
                src, model, final_resolved_model
            )
        });
        let timeout_ctx = ha.timeout_ctx();
        let fail_buf = ha.buf();

        let result_rx = super::spawn_protected({
            let state = state.clone();
            let token = token.clone();
            let mut channel = channel.clone();
            let ep = ep.clone();
            let mut upstream_body = upstream_body.clone();
            let asset_convert_log = asset_convert_log.clone();
            let url = url.clone();
            let mut plugin_tag = plugin_tag.clone();
            let model = model.to_string();
            let raw_path = raw_path.to_string();
            let resolved_cat = resolved_cat.clone();
            let request_content_str = request_content_str.clone();
            let dm = db_model.clone();
            let resolved = resolved.clone();
            let pre_features = pre_features;
            async move {
                #[cfg(feature = "plugin_comfyui")]
                let mut comfy_prompt_json: Option<String> = None;
                let (mut response_content_str, mut upstream_hdrs) = if resolved.target_type == "comfyui"
                {
                    #[cfg(feature = "plugin_comfyui")]
                    {
                        let target =
                            match crate::api::plugins::comfyui_bridge::resolve_submit_target(
                                &state,
                                &upstream_body,
                                &channel,
                            )
                            .await
                            {
                                Ok(v) => v,
                                Err(e) => {
                                    let msg = e.message();
                                    let bill = crate::relay::ha::FailBill::biz(
                                        start_time.elapsed().as_millis() as u32,
                                        msg.clone(),
                                        msg,
                                        request_content_str.clone(),
                                        String::new(),
                                    );
                                    return Err(crate::relay::ha::HaAttempt::park(
                                        &fail_buf, bill, None,
                                    ));
                                }
                            };
                        match crate::api::plugins::comfyui_bridge::submit_video(
                            Arc::clone(&state),
                            &upstream_body,
                            &target,
                            pending_log_id,
                            Some(token.user_id.as_str()),
                        )
                        .await
                        {
                            Ok(ack) => {
                                channel.base_url = ack.base_url.clone();
                                let body = ack.openai_body();
                                comfy_prompt_json = Some(ack.prompt_json);
                                (body, axum::http::HeaderMap::new())
                            }
                            Err(e) => {
                                let msg = e.error.message();
                                let bill = crate::relay::ha::FailBill::http(
                                    start_time.elapsed().as_millis() as u32,
                                    e.error.http_status(),
                                    msg.clone(),
                                    request_content_str.clone(),
                                    e.prompt_json,
                                )
                                .client(msg);
                                return Err(crate::relay::ha::HaAttempt::park(
                                    &fail_buf, bill, None,
                                ));
                            }
                        }
                    }
                    #[cfg(not(feature = "plugin_comfyui"))]
                    {
                        let bill = crate::relay::ha::FailBill::biz(
                            start_time.elapsed().as_millis() as u32,
                            "当前服务暂不可用",
                            "当前服务暂不可用",
                            request_content_str.clone(),
                            String::new(),
                        );
                        return Err(crate::relay::ha::HaAttempt::park(&fail_buf, bill, None));
                    }
                } else {
                    let builder = state
                        .http_client
                        .post(&url)
                        .header("Content-Type", "application/json");
                    let builder = crate::services::http_client::with_timeout(
                        forward::apply_request_auth(
                            builder,
                            &resolved,
                            &channel.api_key,
                            &mut upstream_body,
                            &channel.base_url,
                        ),
                        timeout_ctx.resolve(),
                    );
                    let resp = match builder.send().await {
                        Ok(resp) => resp,
                        Err(e) => {
                            let err_msg = e.to_string();
                            let latency_ms = start_time.elapsed().as_millis() as u32;
                            let bill = crate::relay::ha::FailBill::transport(
                                latency_ms,
                                err_msg,
                                &request_content_str,
                                upstream_body.to_string(),
                            )
                            .detail_opt(asset_convert_log.clone());
                            return Err(crate::relay::ha::HaAttempt::park(&fail_buf, bill, None));
                        }
                    };

                    let status = resp.status().as_u16();
                    if !resp.status().is_success() {
                        let upstream_hdrs = resp.headers().clone();
                        let err = resp.text().await.unwrap_or_default();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        let bill = crate::relay::ha::FailBill::http(
                            latency_ms,
                            status,
                            err,
                            &request_content_str,
                            upstream_body.to_string(),
                        )
                        .detail_opt(asset_convert_log.clone());
                        return Err(crate::relay::ha::HaAttempt::park(
                            &fail_buf,
                            bill,
                            Some(upstream_hdrs),
                        ));
                    }

                    let upstream_hdrs = resp.headers().clone();
                    let data = resp.bytes().await.unwrap_or_default();
                    let mut body_str = String::from_utf8_lossy(&data).to_string();
                    let (converted, post_err) = forward::check_upstream_post_error(
                        &resolved.target_type,
                        &body_str,
                        resolved_cat.as_str(),
                        crate::relay::response_formatter::is_openai_compatible_path(&raw_path),
                    );
                    body_str = converted;
                    if let Some(err_response) = post_err {
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        let bill = crate::relay::ha::FailBill::biz(
                            latency_ms,
                            body_str,
                            err_response,
                            request_content_str,
                            upstream_body.to_string(),
                        )
                        .detail("请求失败");
                        return Err(crate::relay::ha::HaAttempt::park(
                            &fail_buf,
                            bill,
                            Some(upstream_hdrs),
                        ));
                    }
                    (body_str, upstream_hdrs)
                };

                #[cfg(feature = "plugin_comfyui")]
                let upstream_req = comfy_prompt_json.unwrap_or_else(|| upstream_body.to_string());
                #[cfg(not(feature = "plugin_comfyui"))]
                let upstream_req = upstream_body.to_string();

                let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                    &state,
                    &token,
                    &channel,
                    &model,
                    pre_deduction,
                    &ep,
                    start_time,
                    0,
                    &request_content_str,
                    &upstream_req,
                    None,
                    pending_log_id,
                    dm.as_ref(),
                    Some(resolved_cat.as_str()),
                )
                .await?;

                let latency_ms = start_time.elapsed().as_millis() as u32;
                let mut billing_detail = match (&asset_convert_log, pre_deduction > 0.0) {
                    (Some(acl), true) => format!("异步任务预扣费冻结 | {}", acl),
                    (None, true) => "异步任务预扣费冻结".to_string(),
                    (Some(acl), false) => format!("异步任务处理中(冻结) | {}", acl),
                    (None, false) => "异步任务处理中(冻结)".to_string(),
                };
                if let Some(ref md) = mapping_detail {
                    billing_detail.push_str(&format!(" | {}", md));
                }
                // 级联：S1 真 id → plugin_tag；响应体 id / 上游响应头 x-request-id 换成 cgt
                if resolved.is_cascade {
                    let upstream_tid =
                        serde_json::from_str::<serde_json::Value>(&response_content_str)
                            .ok()
                            .map(|v| crate::relay::response_formatter::extract_async_task_id(&v))
                            .unwrap_or_default();
                    if let Some(cgt) = crate::relay::cascade::cascade_seal_s1_task_id(
                        &mut plugin_tag,
                        &upstream_tid,
                    ) {
                        crate::relay::response_formatter::force_json_task_id(
                            &mut response_content_str,
                            &cgt,
                        );
                        upstream_headers::replace_header_if_present(
                            &mut upstream_hdrs,
                            "x-request-id",
                            &cgt,
                        );
                    }
                }
                proxy::record_and_bill_inner(proxy::BillRecord {
                    ctx: crate::relay::ha::HaBillCtx::new(&state, &token, &model, &ep)
                        .category(resolved_cat.as_str())
                        .db(dm.as_ref()),
                    channel: &channel,
                    log_id: pending_log_id,
                    usage: Default::default(),
                    cost: pre_deduction,
                    pre_deducted: pre_deduction,
                    pre_deduct_gift,
                    latency_ms,
                    is_stream: 0,
                    status_code: 200,
                    error_msg: None,
                    request: Some(request_content_str),
                    response: Some(response_content_str.clone()),
                    upstream_req: Some(upstream_req),
                    detail: Some(billing_detail),
                    features: pre_features,
                    time_multiplier: db_rule.as_ref().map(|r| r.applied_multiplier),
                    plugin_tag: plugin_tag.as_deref(),
                })
                .await;

                Ok(super::UpstreamRaw::new(upstream_hdrs, response_content_str))
            }
        });

        let bill_ctx = crate::relay::ha::HaBillCtx::new(&state, &token, &model, &ep)
            .category(resolved_cat.as_str())
            .db(db_model.as_ref());
        match super::join_protected(&mut ha, result_rx, &bill_ctx, &channel, Some(&url)).await {
            super::ProtectJoin::Ok(raw) => {
                let ms = start_time.elapsed().as_millis() as u32;
                ha.ok(&state, &channel, &url, ms).await;
                let final_response_str = crate::relay::response_formatter::apply_format(
                    &raw_path,
                    &resolved_cat,
                    &raw.body,
                    false,
                    None,
                );
                return Ok(upstream_headers::json_with_upstream_headers(
                    &raw.headers,
                    final_response_str,
                ));
            }
            super::ProtectJoin::Retry => {
                ha.bump();
                continue;
            }
            super::ProtectJoin::Stop => break,
        }
    }

    Err(ha
        .finish(
            &crate::relay::ha::HaBillCtx::new(&state, &token, model, &entry_path)
                .category(category),
        )
        .await)
}

// 级联相关业务已统一移至 cascade.rs 模块中
