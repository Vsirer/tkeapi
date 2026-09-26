/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

use crate::error::{AppError, AppResult};
use crate::models::SmsSettings;
use crate::services::tencentcloud::{self, InvokeOpts};
use crate::services::volcengine::volcengine_sign;

const BALANCE_SMS_TEMPLATE_REQUIRED_MSG: &str =
    "开启短信余额提醒前，请先在「短信通知」中配置余额提醒模板 ID（无变量固定正文模板）";

/// 短信受理回执（腾讯 SerialNo / 火山 MessageID）
#[derive(Debug)]
pub struct SmsSendResult {
    pub request_id: String,
    pub serial_no: String,
    pub phone: String,
    pub provider: &'static str,
}

impl SmsSendResult {
    pub fn accepted_message(&self, fallback_phone: &str, kind: &str) -> String {
        let phone = nonempty(&self.phone).unwrap_or(fallback_phone);
        let serial = nonempty(&self.serial_no).unwrap_or("-");
        let request_id = nonempty(&self.request_id).unwrap_or("-");
        let vendor = match self.provider {
            "volcengine" => "火山引擎短信控制台",
            _ => "腾讯云短信控制台",
        };
        format!(
            "{kind}已受理（号码 {phone}）。流水号 {serial}，RequestId {request_id}。若未收到，请到{vendor}按流水号查看送达状态。"
        )
    }
}

fn nonempty(s: &str) -> Option<&str> {
    (!s.is_empty()).then_some(s)
}

/// 站点已开启短信余额提醒时，校验余额模板已配置
pub fn ensure_balance_sms_config(enabled: bool, sms: &SmsSettings) -> AppResult<()> {
    if enabled && !sms.balance_template_configured() {
        return Err(AppError::BadRequest(
            BALANCE_SMS_TEMPLATE_REQUIRED_MSG.to_string(),
        ));
    }
    Ok(())
}

/// 国内 11 位手机号补全 +86；已带国家码则原样
fn normalize_phone(mobile: &str) -> String {
    let m = mobile.trim().replace([' ', '-'], "");
    if m.starts_with('+') {
        return m;
    }
    if m.starts_with("86") && m.len() >= 13 && m.chars().all(|c| c.is_ascii_digit()) {
        return format!("+{m}");
    }
    if m.len() == 11 && m.starts_with('1') && m.chars().all(|c| c.is_ascii_digit()) {
        return format!("+86{m}");
    }
    m
}

/// 火山 PhoneNumbers：国内可无 +；国际须保留 E.164（含 +）
fn volc_phone_numbers(normalized: &str) -> &str {
    normalized.strip_prefix("+86").unwrap_or(normalized)
}

fn ensure_account_ready(sms: &SmsSettings) -> AppResult<()> {
    if !sms.credentials_configured() {
        return Err(AppError::BadRequest("请先完善短信通知配置".to_string()));
    }
    if sms.sdk_app_id.trim().is_empty() {
        return Err(AppError::BadRequest(if sms.is_volcengine() {
            "请先配置消息组 ID（SmsAccount）".to_string()
        } else {
            "请先配置短信 SdkAppId".to_string()
        }));
    }
    if sms.sign_name.trim().is_empty() {
        return Err(AppError::BadRequest("请先配置短信签名".to_string()));
    }
    Ok(())
}

fn check_tencent_sms_response(body: &serde_json::Value) -> AppResult<SmsSendResult> {
    if let Some(err) = body.pointer("/Response/Error") {
        return Err(AppError::BadRequest(format!("短信发送失败: {err}")));
    }
    let request_id = body
        .pointer("/Response/RequestId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let statuses = body
        .pointer("/Response/SendStatusSet")
        .and_then(|v| v.as_array())
        .filter(|a| !a.is_empty())
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "短信发送失败: 响应缺少 SendStatusSet (RequestId={request_id})"
            ))
        })?;
    for st in statuses {
        let code = st.get("Code").and_then(|c| c.as_str()).unwrap_or("");
        if code.is_empty() || !code.eq_ignore_ascii_case("Ok") {
            let msg = st.get("Message").and_then(|m| m.as_str()).unwrap_or(code);
            return Err(AppError::BadRequest(format!(
                "短信发送失败: {msg} ({code}) RequestId={request_id}"
            )));
        }
    }
    let st = &statuses[0];
    Ok(SmsSendResult {
        request_id,
        serial_no: st
            .get("SerialNo")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        phone: st
            .get("PhoneNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        provider: "tencent",
    })
}

fn check_volcengine_sms_response(
    body: &serde_json::Value,
    phone: &str,
) -> AppResult<SmsSendResult> {
    if let Some(err) = body.pointer("/ResponseMetadata/Error") {
        let code = err.get("Code").and_then(|v| v.as_str()).unwrap_or("");
        let msg = err.get("Message").and_then(|v| v.as_str()).unwrap_or("");
        let request_id = body
            .pointer("/ResponseMetadata/RequestId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return Err(AppError::BadRequest(format!(
            "短信发送失败: {msg} ({code}) RequestId={request_id}"
        )));
    }
    let request_id = body
        .pointer("/ResponseMetadata/RequestId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let message_id = body
        .pointer("/Result/MessageID")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if message_id.is_empty() {
        return Err(AppError::BadRequest(format!(
            "短信发送失败: 响应缺少 MessageID (RequestId={request_id})"
        )));
    }
    Ok(SmsSendResult {
        request_id,
        serial_no: message_id,
        phone: phone.to_string(),
        provider: "volcengine",
    })
}

/// 短信服务（腾讯云 TC3 / 火山引擎 Signature V4，均原生 HTTP，无官方 SDK）
pub struct SmsService {
    settings: SmsSettings,
}

impl SmsService {
    pub fn new(settings: &SmsSettings) -> Self {
        Self {
            settings: settings.clone(),
        }
    }

    /// 发送短信验证码（业务与管理端测试共用）
    pub async fn send_verification_code(
        &self,
        mobile: &str,
        code: &str,
    ) -> AppResult<SmsSendResult> {
        ensure_account_ready(&self.settings)?;
        let template_id = self.settings.template_id.trim();
        if template_id.is_empty() {
            return Err(AppError::BadRequest("请先配置验证码模板 ID".to_string()));
        }
        if self.settings.is_volcengine() {
            let key = self.settings.code_param_effective();
            let param = serde_json::json!({ key: code });
            self.send_volcengine(mobile, template_id, Some(&param))
                .await
        } else {
            self.send_tencent(mobile, template_id, &[code.to_string()])
                .await
        }
    }

    /// 余额提醒短信：无变量固定正文
    pub async fn send_balance_alert(
        &self,
        mobile: &str,
        template_id: &str,
    ) -> AppResult<SmsSendResult> {
        ensure_account_ready(&self.settings)?;
        let template_id = template_id.trim();
        if template_id.is_empty() {
            return Err(AppError::BadRequest("余额提醒模板 ID 未配置".to_string()));
        }
        if self.settings.is_volcengine() {
            self.send_volcengine(mobile, template_id, None).await
        } else {
            self.send_tencent(mobile, template_id, &[]).await
        }
    }

    /// 腾讯云 SendSms（TemplateParamSet 顺序对应模板 {1}/{2}…；无变量不传）
    async fn send_tencent(
        &self,
        mobile: &str,
        template_id: &str,
        params: &[String],
    ) -> AppResult<SmsSendResult> {
        let phone = normalize_phone(mobile);

        let mut payload = serde_json::json!({
            "PhoneNumberSet": [&phone],
            "SmsSdkAppId": self.settings.sdk_app_id.trim(),
            "SignName": self.settings.sign_name.trim(),
            "TemplateId": template_id,
        });
        if !params.is_empty() {
            payload["TemplateParamSet"] = serde_json::json!(params);
        }
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| AppError::BadRequest(format!("序列化短信请求失败: {e}")))?;

        let body = tencentcloud::invoke(
            self.settings.secret_id.trim(),
            self.settings.secret_key.trim(),
            InvokeOpts {
                service: "sms",
                action: "SendSms",
                version: "2021-01-11",
                region: "ap-guangzhou",
                payload: &payload_str,
            },
        )
        .await
        .map_err(|e| AppError::BadRequest(format!("短信发送失败: {e}")))?;

        let result = check_tencent_sms_response(&body)?;
        tracing::info!(
            "[Sms:tencent] accepted phone={} template={} serial={} request_id={}",
            result.phone,
            template_id,
            result.serial_no,
            result.request_id
        );
        Ok(result)
    }

    /// 火山引擎 SendSms（Signature V4；TemplateParam 为 JSON 字符串；无变量省略）
    /// 文档: https://docs.volcengine.com/docs/6361/67380
    async fn send_volcengine(
        &self,
        mobile: &str,
        template_id: &str,
        template_param: Option<&serde_json::Value>,
    ) -> AppResult<SmsSendResult> {
        let host = "sms.volcengineapi.com";
        let service = "volcSMS";
        let region = "cn-north-1";
        let action = "SendSms";
        let version = "2020-01-01";
        let phone = normalize_phone(mobile);
        let phone_for_api = volc_phone_numbers(&phone);

        let mut payload = serde_json::json!({
            "SmsAccount": self.settings.sdk_app_id.trim(),
            "Sign": self.settings.sign_name.trim(),
            "TemplateID": template_id,
            "PhoneNumbers": phone_for_api,
        });
        if let Some(p) = template_param {
            payload["TemplateParam"] = serde_json::Value::String(
                serde_json::to_string(p)
                    .map_err(|e| AppError::BadRequest(format!("序列化模板参数失败: {e}")))?,
            );
        }
        let payload_bytes = serde_json::to_vec(&payload)
            .map_err(|e| AppError::BadRequest(format!("序列化短信请求失败: {e}")))?;

        let query = format!("Action={action}&Version={version}");
        let (authorization, x_date, payload_hash) = volcengine_sign(
            self.settings.secret_id.trim(),
            self.settings.secret_key.trim(),
            "POST",
            host,
            "/",
            &query,
            service,
            region,
            &payload_bytes,
        );

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("https://{host}/?{query}"))
            .header("Content-Type", "application/json")
            .header("Host", host)
            .header("X-Date", &x_date)
            .header("X-Content-Sha256", &payload_hash)
            .header("Authorization", &authorization)
            .body(payload_bytes)
            .send()
            .await
            .map_err(|e| AppError::BadRequest(format!("短信发送请求失败: {e}")))?;

        let status = resp.status();
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::BadRequest(format!("短信响应解析失败: {e}")))?;
        // 火山业务错误常仍返回 HTTP 200，需看 ResponseMetadata.Error
        if !status.is_success() {
            return Err(AppError::BadRequest(format!("短信 API 返回错误: {body}")));
        }

        let result = check_volcengine_sms_response(&body, &phone)?;
        tracing::info!(
            "[Sms:volcengine] accepted phone={} template={} message_id={} request_id={}",
            result.phone,
            template_id,
            result.serial_no,
            result.request_id
        );
        Ok(result)
    }
}
