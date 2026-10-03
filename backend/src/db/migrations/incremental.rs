/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

//! 拆分后新增迁移只追加到本文件末尾。

use std::collections::HashSet;
use sqlx::PgPool;

use crate::db::migrations::{once_heavy_migration, once_migration};

pub async fn run(pool: &PgPool, done: &mut HashSet<String>) -> anyhow::Result<()> {
    // ── 更新火山画质增强/字幕擦除预设模型备注文案 ──
    once_migration!(pool, done, "update_volcengine_enhance_preset_remark_v1",
        "UPDATE models SET remark = '系统预设' WHERE remark = '火山引擎画质增强/字幕擦除插件预置模型，请勿删除'"
    );

    // ── 移除系统预设可灵 (Kling) 模型 ──
    once_migration!(pool, done, "remove_kling_system_preset_models_v1",
        "DELETE FROM models WHERE is_system = 1 AND (mid IN ('310004', '310005', '310006', '310007') OR model_id LIKE 'kling%')"
    );

    // ── 模型分类外键级联置空保护（防止删除服务商/类型时外键拦截） ──
    once_migration!(pool, done, "fk_model_classifications_on_delete_set_null_v1",
        "UPDATE billing_rules SET provider_id = NULL WHERE provider_id IS NOT NULL AND provider_id NOT IN (SELECT id FROM model_providers)",
        "UPDATE billing_rules SET type_id = NULL WHERE type_id IS NOT NULL AND type_id NOT IN (SELECT id FROM model_types)",
        "UPDATE models SET provider_id = NULL WHERE provider_id IS NOT NULL AND provider_id NOT IN (SELECT id FROM model_providers)",
        "UPDATE models SET type_id = NULL WHERE type_id IS NOT NULL AND type_id NOT IN (SELECT id FROM model_types)",
        "UPDATE models SET api_provider_id = NULL WHERE api_provider_id IS NOT NULL AND api_provider_id NOT IN (SELECT id FROM model_api_providers)",
        "ALTER TABLE billing_rules DROP CONSTRAINT IF EXISTS billing_rules_provider_id_fkey",
        "ALTER TABLE billing_rules ADD CONSTRAINT billing_rules_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES model_providers(id) ON DELETE SET NULL",
        "ALTER TABLE billing_rules DROP CONSTRAINT IF EXISTS billing_rules_type_id_fkey",
        "ALTER TABLE billing_rules ADD CONSTRAINT billing_rules_type_id_fkey FOREIGN KEY (type_id) REFERENCES model_types(id) ON DELETE SET NULL",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_provider_id_fkey",
        "ALTER TABLE models ADD CONSTRAINT models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES model_providers(id) ON DELETE SET NULL",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_type_id_fkey",
        "ALTER TABLE models ADD CONSTRAINT models_type_id_fkey FOREIGN KEY (type_id) REFERENCES model_types(id) ON DELETE SET NULL",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_api_provider_id_fkey",
        "ALTER TABLE models ADD CONSTRAINT models_api_provider_id_fkey FOREIGN KEY (api_provider_id) REFERENCES model_api_providers(id) ON DELETE SET NULL"
    );

    if !done.contains("playground_2026_seedream_pro_image_special_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_seedream_pro_image_special(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_seedream_pro_image_special_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_seedream_pro_image_special_v1".into());
                tracing::info!("创作中心2026 Seedream Pro 图片专用参数回填完成，更新 {} 条配置", n);
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_seedream_pro_image_special_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    if !done.contains("playground_2026_seedream_pro_smart_ratio_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_seedream_pro_image_special(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_seedream_pro_smart_ratio_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_seedream_pro_smart_ratio_v1".into());
                tracing::info!("创作中心2026 Seedream Pro 智能比例回填完成，更新 {} 条配置", n);
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_seedream_pro_smart_ratio_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    if !done.contains("playground_2026_gpt_image_2_zh_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_gpt_image_2_localization(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_gpt_image_2_zh_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_gpt_image_2_zh_v1".into());
                tracing::info!("创作中心2026 gpt-image-2 中文与描述菜单本地化迁移完成，更新 {} 条配置", n);
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_gpt_image_2_zh_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    if !done.contains("playground_2026_gpt_image_2_variations_default_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_gpt_image_2_localization(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_gpt_image_2_variations_default_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_gpt_image_2_variations_default_v1".into());
                tracing::info!("创作中心2026 gpt-image-2 默认变体数量修正迁移完成，更新 {} 条配置", n);
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_gpt_image_2_variations_default_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    once_migration!(
        pool,
        done,
        "playground_2026_gpt_image_2_strip_redundant_params_v1",
        include_str!("helpers/playground_2026_gpt_image_2_strip_redundant_params_v1.sql")
    );

    if !done.contains("playground_2026_gpt_image_2_official_size_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_gpt_image_2_localization(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_gpt_image_2_official_size_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_gpt_image_2_official_size_v1".into());
                tracing::info!(
                    "创作中心2026 gpt-image-2 官方比例/4K 尺寸迁移完成，更新 {} 条配置",
                    n
                );
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_gpt_image_2_official_size_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    if !done.contains("playground_2026_gpt_image_2_multi_ref_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_gpt_image_2_localization(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_gpt_image_2_multi_ref_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_gpt_image_2_multi_ref_v1".into());
                tracing::info!(
                    "创作中心2026 gpt-image-2 多参考图上限迁移完成，更新 {} 条配置",
                    n
                );
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_gpt_image_2_multi_ref_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    once_migration!(
        pool,
        done,
        "playground_2026_seedream_image_special_official_v1",
        include_str!("helpers/playground_2026_seedream_image_special_official_v1.sql")
    );

    once_migration!(
        pool,
        done,
        "playground_2026_seedream_strip_size_param_v1",
        include_str!("helpers/playground_2026_seedream_strip_size_param_v1.sql")
    );

    once_migration!(
        pool,
        done,
        "playground_2026_seedream_5_0_pro_default_resolution_1_5k_v1",
        include_str!("helpers/playground_2026_seedream_5_0_pro_default_resolution_1_5k_v1.sql")
    );

    // ── fal.ai MiniMax H3 Max 参考生视频转发规则 ──
    once_migration!(pool, done, "fal_minimax_h3_max_r2v_forward_rule_v1",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT 'fal.ai MiniMax H3 Max 参考生视频', 'fal',
               'fal.ai MiniMax 参考生视频：队列提交 + 状态轮询 + 结果拉取。渠道 base_url=https://queue.fal.run，密钥填 FAL_KEY；模型 ID 填变体名如 h3-max（提交 /minimax/${model}/reference-to-video，轮询 /minimax/${model}/requests/${task_id}/status）',
               '{"target_type":"fal_video","path_rewrite":{"old":"/v1/video/generations","new":"/minimax/${model}/reference-to-video"},"auth_type":"key","poll_path":"/minimax/${model}/requests/${task_id}/status"}',
               '视频', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (
            SELECT 1 FROM forward_rules WHERE name = 'fal.ai MiniMax H3 Max 参考生视频'
        )"#
    );

    // 已落地规则：修正 poll_path（去掉误加的 /reference-to-video）
    once_migration!(pool, done, "fal_minimax_h3_max_r2v_poll_path_v2",
        r#"UPDATE forward_rules
        SET config_json = jsonb_set(
              config_json::jsonb,
              '{poll_path}',
              '"/minimax/${model}/requests/${task_id}/status"'
            )::text,
            updated_at = NOW()
        WHERE name = 'fal.ai MiniMax H3 Max 参考生视频'
          AND config_json::jsonb->>'poll_path'
            = '/minimax/${model}/reference-to-video/requests/${task_id}/status'"#
    );

    // ── fal.ai MiniMax H3 Max 参考生视频官方系统计费规则 ──
    once_migration!(pool, done, "fal_minimax_h3_max_r2v_billing_rule_v1",
        r#"INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, is_system, pid, pricing_type)
        SELECT 'fal.ai MiniMax H3 Max 参考生视频', 'duration', 0.0, 0.0, 0.0, 0.08, 'fal_ref_video',
               '{"free_ref_tokens":4096,"ref_token_rate_per_1k":0.02,"image_tokens_default":1024,"video_ref_tokens_per_sec":{"480p":2886,"768p":7459},"audio_ref_tokens_per_sec":80}',
               1, '7' || lpad((floor(random() * 10000)::int)::text, 4, '0'), 'official'
        WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = 'fal.ai MiniMax H3 Max 参考生视频')
        "#
    );

    // ── 同步现有环境预设模型为最新用户配置（若未被删除） ──
    once_migration!(pool, done, "sync_preset_models_latest_config_v1",
        "UPDATE models SET model_id = 'doubao-seedance-2-0-260128', original_id = 'doubao-seedance-2-0', model_id_alias = '', pre_deduction = 5.0, site_discount = 1.0, site_discount_enabled = 1, global_discount = 1.0, global_discount_enabled = 1, enable_log_content = 0, feature_attributes = '[]' WHERE mid = '310001'",
        "UPDATE models SET model_id = 'doubao-seedance-2-0-fast', original_id = 'doubao-seedance-2-0-fast', model_id_alias = '', pre_deduction = 5.0, site_discount = 1.0, site_discount_enabled = 1, global_discount = 1.0, global_discount_enabled = 1, enable_log_content = 1, feature_attributes = '[]' WHERE mid = '310002'",
        "UPDATE models SET model_id = 'doubao-seedance-2-5-260628', original_id = 'doubao-seedance-2-5', model_id_alias = '', pre_deduction = 5.0, site_discount = 1.0, site_discount_enabled = 1, global_discount = 1.0, global_discount_enabled = 1, enable_log_content = 1, feature_attributes = '[]' WHERE mid = '310003'",
        "UPDATE models SET model_id = 'doubao-seedance-2-0-mini', original_id = 'doubao-seedance-2-0-mini', model_id_alias = '', pre_deduction = 5.0, site_discount = 1.0, site_discount_enabled = 1, global_discount = 1.0, global_discount_enabled = 1, enable_log_content = 1, feature_attributes = '[]' WHERE mid = '310004'"
    );

    // ── 火山方舟多模态向量官方转发规则 ──
    once_migration!(pool, done, "volcengine_embeddings_forward_rules_v1",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT '火山方舟 多模态向量', 'volcengine',
               '将多模态向量请求转发到火山方舟官方多模态向量接口（/api/v3/embeddings/multimodal）',
               '{"target_type":"openai","path_rewrite":{"old":"/v1/embeddings","new":"/api/v3/embeddings/multimodal"},"path_passthrough":["/api/v3/embeddings/multimodal"],"auth_type":"bearer"}',
               '向量', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = '火山方舟 多模态向量')"#
    );

    // ── 模型列表页面排序权重字段 ──
    once_migration!(pool, done, "models_sort_order_column_v1",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN models.sort_order IS '页面排序，数值越大越在列表中显示越靠前'"
    );

    // ── 创作中心 Seedance 2.0 方案剔除反向提示词 ──
    if !done.contains("strip_seedance2_negative_prompt_v1") {
        match crate::db::migrations::helpers::playground::strip_playground_seedance2_negative_prompt(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('strip_seedance2_negative_prompt_v1')",
                )
                .execute(pool)
                .await;
                done.insert("strip_seedance2_negative_prompt_v1".into());
                tracing::info!("创作中心 Seedance 2.0 方案移除反向提示词完成，更新 {} 条配置", n);
            }
            Err(e) => {
                tracing::warn!(
                    "strip_seedance2_negative_prompt_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    // ── 用户等级发票收据配置与申请表 ──
    once_migration!(pool, done, "user_levels_invoices_feature_v1",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invoice_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invoice_mode TEXT NOT NULL DEFAULT 'international'",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invoice_config TEXT NOT NULL DEFAULT '{}'",
        r#"CREATE TABLE IF NOT EXISTS user_invoice_requests (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            invoice_type TEXT NOT NULL DEFAULT 'normal',
            title_type TEXT NOT NULL DEFAULT 'company',
            title TEXT NOT NULL,
            tax_number TEXT,
            company_address TEXT,
            company_phone TEXT,
            bank_name TEXT,
            bank_account TEXT,
            amount DOUBLE PRECISION NOT NULL,
            email TEXT NOT NULL,
            remark TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            reject_reason TEXT,
            invoice_file_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )"#
    );

    // ── 用户实名 KYC：新增个人/企业详细信息字段 ──
    once_migration!(pool, done, "user_kyc_detailed_info_fields_v1",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS id_doc_number TEXT",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS personal_email TEXT",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS personal_phone TEXT",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS company_doc_type TEXT",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS company_doc_number TEXT",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS company_email TEXT",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS company_phone TEXT",
        "COMMENT ON COLUMN user_kyc.id_doc_number IS '个人证件号码'",
        "COMMENT ON COLUMN user_kyc.personal_email IS '个人联系邮箱'",
        "COMMENT ON COLUMN user_kyc.personal_phone IS '个人联系电话'",
        "COMMENT ON COLUMN user_kyc.company_doc_type IS '企业证件类型：unified_social_credit_code|business_license|organization_code|other'",
        "COMMENT ON COLUMN user_kyc.company_doc_number IS '企业证件号码'",
        "COMMENT ON COLUMN user_kyc.company_email IS '企业联系邮箱'",
        "COMMENT ON COLUMN user_kyc.company_phone IS '企业联系电话'"
    );

    // ── 用户实名 KYC：解除单用户唯一限制，支持同时拥有多条个人与企业认证 ──
    once_migration!(pool, done, "user_kyc_multiple_records_v1",
        "ALTER TABLE user_kyc DROP CONSTRAINT IF EXISTS user_kyc_user_id_key",
        "DROP INDEX IF EXISTS user_kyc_user_id_key",
        "CREATE INDEX IF NOT EXISTS idx_user_kyc_user_id ON user_kyc(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_kyc_user_type ON user_kyc(user_id, kyc_type)"
    );

    // ── 用户实名 KYC：新增 is_default 默认实名主体配置与索引 ──
    once_migration!(pool, done, "user_kyc_add_is_default_v1",
        "ALTER TABLE user_kyc ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE",
        "UPDATE user_kyc SET is_default = TRUE WHERE id IN (SELECT MAX(id) FROM user_kyc GROUP BY user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_kyc_is_default ON user_kyc(user_id, is_default)",
        "COMMENT ON COLUMN user_kyc.is_default IS '是否为用户默认实名主体'"
    );

    // ── 用户实名 KYC：严格确保每个用户只能有且仅有 1 个默认主体（部分唯一索引） ──
    once_migration!(pool, done, "user_kyc_strictly_one_default_v1",
        "UPDATE user_kyc SET is_default = FALSE WHERE is_default = TRUE AND id NOT IN (SELECT MAX(id) FROM user_kyc WHERE is_default = TRUE GROUP BY user_id)",
        "UPDATE user_kyc SET is_default = TRUE WHERE id IN (SELECT MAX(id) FROM user_kyc WHERE user_id NOT IN (SELECT user_id FROM user_kyc WHERE is_default = TRUE) GROUP BY user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_kyc_one_default ON user_kyc(user_id) WHERE is_default = TRUE"
    );

    // ── 发票申请审核与开票信息扩展字段 ──
    once_migration!(pool, done, "user_invoice_requests_audit_fields_v1",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS invoice_code TEXT",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS invoice_number TEXT",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS admin_remark TEXT",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS operator_id TEXT",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS operator_name TEXT",
        "COMMENT ON COLUMN user_invoice_requests.invoice_code IS '发票代码'",
        "COMMENT ON COLUMN user_invoice_requests.invoice_number IS '发票号码'",
        "COMMENT ON COLUMN user_invoice_requests.admin_remark IS '财务审核或开具备注'",
        "COMMENT ON COLUMN user_invoice_requests.issued_at IS '实际开票时间'",
        "COMMENT ON COLUMN user_invoice_requests.operator_id IS '操作管理员ID'",
        "COMMENT ON COLUMN user_invoice_requests.operator_name IS '操作管理员用户名/姓名'"
    );

    // ── 发票申请单号字段 (fp + YYMMDD + 4位以上随机数) ──
    once_migration!(pool, done, "user_invoice_requests_request_no_v1",
        "ALTER TABLE user_invoice_requests ADD COLUMN IF NOT EXISTS request_no TEXT",
        "UPDATE user_invoice_requests SET request_no = 'fp' || to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYMMDD') || LPAD(id::text, 4, '0') WHERE request_no IS NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invoice_requests_request_no ON user_invoice_requests(request_no)",
        "COMMENT ON COLUMN user_invoice_requests.request_no IS '发票申请单号 (fp+YYMMDD+随机数)'"
    );

    // ── recharge_records 新增 order_no 独立字段与索引，并回填历史单号 ──
    once_migration!(pool, done, "recharge_records_order_no_field_v1",
        "ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS order_no TEXT DEFAULT ''",
        "COMMENT ON COLUMN recharge_records.order_no IS '关联订单号/支付流水号，方便统计分析与对账'",
        "CREATE INDEX IF NOT EXISTS idx_recharge_records_order_no ON recharge_records (order_no) WHERE order_no != ''",
        r#"UPDATE recharge_records 
           SET order_no = (regexp_match(remark, '(?:订单号|Order\s*(?:No|Number|Id)|单号)[\s:：]+([a-zA-Z0-9_-]+)'))[1]
           WHERE (order_no IS NULL OR order_no = '') 
             AND remark ~ '(?:订单号|Order\s*(?:No|Number|Id)|单号)[\s:：]+[a-zA-Z0-9_-]+'"#,
        r#"UPDATE recharge_records 
           SET order_no = remark 
           WHERE (order_no IS NULL OR order_no = '') 
             AND remark ~ '^T\d{14}[A-Za-z0-9_-]+$'"#
    );

    // ── 上游渠道配置：NewAPI 等上游货币与本站货币单位折算汇率 ──
    once_migration!(pool, done, "channel_configs_upstream_currency_rate_v1",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS upstream_currency TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS site_currency TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS upstream_currency_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "COMMENT ON COLUMN channel_configs.upstream_currency IS '上游计价货币单位，如 CNY/USD，空=同本站'",
        "COMMENT ON COLUMN channel_configs.site_currency IS '本站计价货币单位，如 USD/CNY，空=同系统'",
        "COMMENT ON COLUMN channel_configs.upstream_currency_rate IS '货币换算汇率(例如 1 USD = 7.2 CNY 时填 7.2)'"
    );

    // ── 高并发与慢查询优化索引：超大容量表专用异步后台迁移（专属会话内存调优，杜绝启动停机与 I/O 跑满） ──
    once_heavy_migration!(pool, done, "perf_concurrency_opt_v1",
        // 1. 用户按类型查询、分页与 COUNT 聚合（全量覆盖，覆盖全历史）
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_action_created ON logs (user_id, action_type, created_at DESC)",
        // 2. 用户视觉模型日志分页与总数统计（带 user_id 部分索引）
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_vision_created ON logs (user_id, created_at DESC) WHERE (action_type = ANY (ARRAY['图片'::text, '视频'::text, '视频增强'::text, '视觉模型'::text, '视觉'::text]))",
        // 3. 孤儿任务扫描优化
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_orphan_scan ON logs (created_at) WHERE is_completed = 0 AND status_code = 0",
        // 4. 高可用插件日志关联索引
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ha_usage_logs_log_id ON ha_usage_logs (log_id)",
        // 5. 精简确凿冗余索引（已被复合索引最左前缀覆盖，减少写入放大）
        "DROP INDEX CONCURRENTLY IF EXISTS idx_logs_user_id",
        "DROP INDEX CONCURRENTLY IF EXISTS idx_logs_user_created",
        "DROP INDEX CONCURRENTLY IF EXISTS idx_logs_is_completed_pending",
        "DROP INDEX CONCURRENTLY IF EXISTS idx_logs_created_at_new",
        "DROP INDEX CONCURRENTLY IF EXISTS idx_logs_user_created_at_new",
        "DROP INDEX CONCURRENTLY IF EXISTS idx_logs_action_created_stats_new",
        // 6. 刷新执行计划统计信息
        "ANALYZE logs",
        "ANALYZE api_tokens",
        "ANALYZE ha_usage_logs",
    );

    // ── 任务在途轮询快照优化索引：forward_rules.eid 专有部分索引（0.1ms 点查，保障热切换轮询零抖动） ──
    once_migration!(pool, done, "task_poll_forward_rules_eid_v1",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_forward_rules_eid ON forward_rules (eid) WHERE eid != ''",
        "ANALYZE forward_rules"
    );

    once_migration!(pool, done, "playground_2026_conversations_v1",
        r#"CREATE TABLE IF NOT EXISTS playground_2026_conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT '',
            model_mid TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS playground_2026_conversation_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES playground_2026_conversations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_pg2026_conversations_user_updated ON playground_2026_conversations (user_id, updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_pg2026_conversation_messages_conv_created ON playground_2026_conversation_messages (conversation_id, created_at ASC)"
    );

    once_migration!(pool, done, "playground_2026_conversation_message_parts_v1",
        "ALTER TABLE playground_2026_conversation_messages ADD COLUMN IF NOT EXISTS parts JSONB"
    );

    // ── 系统预设模型按业务场景归并原始模型 ID（聚合前端卡片展示） ──
    once_migration!(pool, done, "preset_models_original_id_grouping_v1",
        "UPDATE models SET original_id = '视频增强' WHERE mid IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep')",
        "UPDATE models SET original_id = '画质增强级联' WHERE mid IN ('dbs-sr', 'dbs-fs')",
        "UPDATE models SET original_id = 'Doubao Seedance 预设' WHERE mid IN ('310001', '310002', '310003', '310004')"
    );

    once_migration!(pool, done, "playground_2026_skills_v1",
        r#"CREATE TABLE IF NOT EXISTS playground_2026_skills (
            id TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            body_md TEXT NOT NULL DEFAULT '',
            applies_to JSONB NOT NULL DEFAULT '[]'::jsonb,
            trigger_words JSONB NOT NULL DEFAULT '[]'::jsonb,
            source TEXT NOT NULL DEFAULT 'user',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_pg2026_skills_user_slug ON playground_2026_skills (user_id, slug) WHERE user_id IS NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_pg2026_skills_official_slug ON playground_2026_skills (slug) WHERE user_id IS NULL",
        "CREATE INDEX IF NOT EXISTS idx_pg2026_skills_user_updated ON playground_2026_skills (user_id, updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_pg2026_skills_source_updated ON playground_2026_skills (source, updated_at DESC)",
        "ALTER TABLE playground_2026_conversations ADD COLUMN IF NOT EXISTS skill_id TEXT"
    );

    once_migration!(pool, done, "playground_2026_skills_seed_prompt_rewriter_v1",
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-prompt-rewriter', NULL, 'prompt-rewriter', '提示词改写',
            '把口语需求整理成可粘贴到图片/视频页的提示词，不会替你出图。',
            E'你是提示词改写助手。用户用口语描述想生成的图片或视频时，你把它整理成可直接粘贴到生成页的提示词。\n\n规则：\n- 先确认主体、风格、构图、禁忌；信息不足就提问，不要臆造关键细节。\n- 给出一段完整、可复制的提示词（与用户语言一致）。\n- 不要声称你能出图、出视频或调用生成接口。用户需要自己去图片/视频页粘贴并生成。\n- 不要输出网关路径、厂商字段名或工具调用。',
            '["chat"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'prompt-rewriter' AND user_id IS NULL
        )"#
    );

    once_migration!(pool, done, "playground_2026_skill_categories_v1",
        r#"CREATE TABLE IF NOT EXISTS playground_2026_skill_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            name_en TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"INSERT INTO playground_2026_skill_categories (id, name, name_en, sort_order, is_system)
        SELECT v.id, v.name, v.name_en, v.sort_order, TRUE
        FROM (VALUES
            ('chat', '聊天', 'Chat', 10),
            ('image', '图片', 'Image', 20),
            ('video', '视频', 'Video', 30),
            ('audio', '声音', 'Audio', 40)
        ) AS v(id, name, name_en, sort_order)
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skill_categories c WHERE c.id = v.id
        )"#
    );

    once_migration!(pool, done, "playground_2026_skills_seed_chat_writing_v1",
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-wenyan', NULL, 'wenyan', '文言文',
            '把白话改成典雅文言文，专名与术语保持原形。',
            $wenyan$你是文言文写作助手。用户给出白话、主题或现代文本时，改写成典雅可诵的文言文；若用户直接提问，也用文言作答。

规则：
- 用文言句式：判断用「…者…也」，因果用「盖」「故」，假设用「若」「倘」，完成用「矣」。删冗词，能省主语则省。
- 「之乎者也」点到即止，禁止堆砌虚词、网络口语和表情。
- 人名、地名、产品名、代码与术语保持原形，不强译。
- 先给正文；用户要对照时再附简短白话释义，不要把释义写进正文。
- 不要伪造典故出处；拿不准就不用典。$wenyan$,
            '["chat"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'wenyan' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-gushi', NULL, 'gushi', '古诗',
            '按主题作近体诗，默认可作七绝；指定体裁则从其请。',
            $gushi$你是古诗创作助手。按用户主题、情绪或场景作诗。默认近体诗；用户指定诗经体、古风或词牌时再换体。

规则：
- 未点名体裁时作七言绝句。点名五绝、五律、七律、古风、词牌或诗经体则从其请。
- 近体诗：一句之内平仄交替，一联之内相对，邻联相粘；律诗中间两联对仗；押平声韵，一韵到底。
- 用赋比兴：可直陈，可比拟，宜先以草木岁时起兴再落到人事。重章叠句只用于诗经体。
- 先出诗题与正文；需要时再附格律说明（平仄、韵部）。不要把说明写进诗句。
- 今事、品牌、网络梗用古典意象转写，不要硬塞进诗。
- 不要伪称某句出自唐诗宋词。$gushi$,
            '["chat"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'gushi' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-ad-copy', NULL, 'ad-copy', '广告词',
            '按产品与媒介写可投放的口号和短文案，不替你投放。',
            $adcopy$你是广告词写作助手。按用户的产品、对象和媒介写可投放的文案，不替用户投放。

规则：
- 先确认产品、受众、卖点、媒介（海报口号 / 短视频口播 / 详情页 / 搜索广告）。信息不足就提问，不要臆造关键卖点。
- 结构用公开文案框架：AIDA（注意-兴趣-欲望-行动）、PAS（问题-放大-解决）；标题对照 4U（有用、紧迫、独特、具体）。
- 每稿给：主口号（不超过十二字）、一句副句、以及两条备选。口号要能上口、有利益点，避免空洞形容词堆砌。
- 不写违法承诺、绝对化用语和未经验证的疗效或收益；不确定就改成可核验的表述。
- 不要输出投放后台字段名，也不要声称已经发布广告。$adcopy$,
            '["chat"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'ad-copy' AND user_id IS NULL
        )"#
    );

    once_migration!(pool, done, "playground_2026_skills_seed_image_video_v1",
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-cinematic-still', NULL, 'cinematic-still', '电影静帧',
            '电影剧照质感的静帧约束，用于图片生成。',
            $cinematic_still$电影剧照质感：35mm 镜头，浅景深，胶片颗粒，实用光，构图留白。真实皮肤与材质，不要插画、不要文字水印、不要畸变人脸。$cinematic_still$,
            '["image"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'cinematic-still' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-product-hero', NULL, 'product-hero', '产品主图',
            '电商主图约束，用于图片生成。',
            $product_hero$电商主图：单件产品居中，干净棚拍，柔和立体光，背景简洁。突出材质与边缘，不要手持自拍、不要夸张场景、不要功效承诺文字。$product_hero$,
            '["image"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'product-hero' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-cinematic-move', NULL, 'cinematic-move', '电影运镜',
            '电影短镜头运镜约束，用于视频生成。',
            $cinematic_move$电影短镜头：一条连续动作，缓慢推近或横移，稳定器质感，自然光。不要跳切、不要分镜列表、不要字幕和台标。$cinematic_move$,
            '["video"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'cinematic-move' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-product-turn', NULL, 'product-turn', '产品展示',
            '产品展示片约束，用于视频生成。',
            $product_turn$产品展示片：产品静止或缓慢旋转，灯光匀、背景干净，突出外形与材质。不要剧情故事、不要多场景切换、不要口播字幕。$product_turn$,
            '["video"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'product-turn' AND user_id IS NULL
        )"#
    );

    once_migration!(pool, done, "playground_2026_skills_seed_image_video_audio_v1",
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-kawaii-still', NULL, 'kawaii-still', '可爱插画',
            '圆润Q版可爱风，可加星星、爱心、蝴蝶结等元素，用于图片生成。',
            $kawaii_still$圆润Q版可爱风：大眼睛、软萌脸颊，马卡龙或奶油色。可加星星、爱心、蝴蝶结、小动物等可爱元素。插画或轻厚涂，不要写实恐怖、不要血腥、不要文字水印。$kawaii_still$,
            '["image"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'kawaii-still' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-kawaii-move', NULL, 'kawaii-move', '可爱短片',
            'Q版角色轻快短镜头，可加星星闪烁、爱心飘散，用于视频生成。',
            $kawaii_move$可爱短片：圆润Q版角色，动作轻快有弹性，可加星星闪烁、爱心飘散等可爱元素。一条连续动作，镜头平稳。不要跳切、不要恐怖、不要字幕和台标。$kawaii_move$,
            '["video"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'kawaii-move' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-warm-narration', NULL, 'warm-narration', '温暖旁白',
            '柔和清晰的旁白声线约束，用于声音生成。',
            $warm_narration$温暖旁白：声线柔和清晰，语速适中，像对朋友说话。情绪贴合文本，不要播音腔、不要机械音、不要嘈杂背景。$warm_narration$,
            '["audio"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'warm-narration' AND user_id IS NULL
        )"#
    );

    once_migration!(pool, done, "playground_2026_audio_enabled_default_off_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('playground_2026', 'audio_enabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    once_migration!(pool, done, "playground_2026_audio_module_rename_v1",
        "UPDATE playground_2026_skill_categories SET name = '音频', updated_at = NOW() WHERE id = 'audio' AND name <> '音频'",
        "UPDATE playground_2026_skills SET description = '柔和清晰的旁白声线约束，用于音频生成。' WHERE id = 'pg2026-skill-warm-narration' AND description LIKE '%用于声音生成%'"
    );

    once_migration!(pool, done, "playground_2026_skills_drop_audio_v1",
        "DELETE FROM playground_2026_skills WHERE id = 'pg2026-skill-warm-narration' OR (slug = 'warm-narration' AND user_id IS NULL)",
        r#"DELETE FROM playground_2026_skills
           WHERE applies_to @> jsonb_build_array('audio')
             AND jsonb_array_length(applies_to) = 1"#,
        r#"UPDATE playground_2026_skills
           SET applies_to = COALESCE((
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements_text(applies_to) AS t(elem)
                WHERE elem <> 'audio'
            ), '[]'::jsonb),
               updated_at = NOW()
           WHERE applies_to @> jsonb_build_array('audio')"#,
        r#"UPDATE playground_2026_skills SET applies_to = '["chat"]'::jsonb
           WHERE applies_to = '[]'::jsonb"#,
        "DELETE FROM playground_2026_skill_categories WHERE id = 'audio'"
    );

    // ── 腾讯云 VOD MiniMax 视频生成专属转发规则（支持 OpenAI 与 MiniMax 官方路由） ──
    once_migration!(pool, done, "tencent_vod_minimax_video_forward_rule_v2",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT '腾讯云 VOD MiniMax 视频生成', 'tencent', '将 OpenAI 与 MiniMax 官方视频请求转换为腾讯云点播 AIGC CreateAigcVideoTask 接口。密钥格式：SecretId:SecretKey:SubAppId，模型格式：ModelName@ModelVersion', '{"target_type":"tencent_vod_video","path_rewrite":{"old":"/v1/video/generations","new":"/"},"path_accept":["/v2/video_generation"],"auth_type":"tencent_vod"}', '视频', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = '腾讯云 VOD MiniMax 视频生成')"#
    );

    // ── 站点模型展示排序统一到 models.sort_order（页面排序） ──
    if !done.contains("unify_model_page_sort_order_v1") {
        match crate::db::migrations::helpers::model_sort::backfill_models_sort_order_from_plugin_configs(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('unify_model_page_sort_order_v1')",
                )
                .execute(pool)
                .await;
                done.insert("unify_model_page_sort_order_v1".into());
                tracing::info!("模型页面排序回填完成，更新 {} 条", n);
            }
            Err(e) => {
                tracing::warn!(
                    "unify_model_page_sort_order_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    once_migration!(pool, done, "playground_2026_prompt_optimize_category_v1",
        r#"INSERT INTO playground_2026_skill_categories (id, name, name_en, sort_order, is_system)
        SELECT 'prompt-optimize', '提示词优化', 'Prompt optimize', 90, TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skill_categories WHERE id = 'prompt-optimize'
        )"#
    );

    once_migration!(pool, done, "playground_2026_prompt_optimize_skills_v1",
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-prompt-optimize-image', NULL, 'prompt-optimize-image', '图片提示词优化',
            '把用户的画面描述扩写成可直接用于文生图的提示词。',
            $poi$你是图片提示词优化助手。用户给出想生成的画面描述时，把它扩写成更具体、可直接用于文生图的提示词。

规则：
- 只输出优化后的提示词正文，不要前言、标题、解释或 markdown 围栏。
- 保留用户的主体、风格与禁忌；信息不足时合理补全构图、光线、材质、镜头，不要改掉核心对象。
- 与用户语言一致。不要声称你能出图。$poi$,
            '["prompt-optimize","image"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'prompt-optimize-image' AND user_id IS NULL
        )"#,
        r#"INSERT INTO playground_2026_skills (id, user_id, slug, name, description, body_md, applies_to, trigger_words, source, enabled)
        SELECT 'pg2026-skill-prompt-optimize-video', NULL, 'prompt-optimize-video', '视频提示词优化',
            '把用户的镜头描述扩写成可直接用于文生视频的提示词。',
            $pov$你是视频提示词优化助手。用户给出想生成的镜头或动作描述时，把它扩写成更具体、可直接用于文生视频的提示词。

规则：
- 只输出优化后的提示词正文，不要前言、标题、解释或 markdown 围栏。
- 保留用户的主体、风格与禁忌；信息不足时合理补全镜头运动、时长感、光影与节奏，不要改掉核心对象。
- 与用户语言一致。不要声称你能出视频。$pov$,
            '["prompt-optimize","video"]'::jsonb, '[]'::jsonb, 'official', TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM playground_2026_skills WHERE slug = 'prompt-optimize-video' AND user_id IS NULL
        )"#
    );

    if !done.contains("playground_2026_prompt_optimize_llm_v1") {
        match crate::db::migrations::helpers::prompt_optimize::seed_prompt_optimize_llm_mid(pool).await {
            Ok(_) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_prompt_optimize_llm_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_prompt_optimize_llm_v1".into());
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_prompt_optimize_llm_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    once_migration!(pool, done, "playground_2026_conversation_message_extra_v1",
        "ALTER TABLE playground_2026_conversation_messages ADD COLUMN IF NOT EXISTS extra JSONB"
    );

    // ── 火山方舟聊天转发规则升级：支持 Chat、Responses、Messages 三协议多路径重写 ──
    once_migration!(pool, done, "volcengine_chat_three_protocols_rewrites_v1",
        r#"UPDATE forward_rules
           SET config_json = '{"target_type":"volcengine_chat","path_rewrites":[{"old":"/v1/chat/completions","new":"/api/v3/chat/completions"},{"old":"/v1/responses","new":"/api/v3/responses"},{"old":"/v1/messages","new":"/api/compatible/v1/messages"}],"auth_type":"bearer"}',
               description = '将标准聊天、Responses及Messages请求转发到火山方舟官方接口，支持/api/v3/chat/completions、/api/v3/responses与/api/compatible/v1/messages',
               updated_at = CURRENT_TIMESTAMP
           WHERE name = '火山方舟 聊天' AND is_system = 1"#
    );

    once_migration!(pool, done, "announcements_flag_expires_at_v1",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pin_expires_at TIMESTAMPTZ",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS popup_expires_at TIMESTAMPTZ",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS active_expires_at TIMESTAMPTZ",
        "COMMENT ON COLUMN announcements.pin_expires_at IS '置顶有效期，到期自动取消置顶'",
        "COMMENT ON COLUMN announcements.popup_expires_at IS '弹窗有效期，到期自动关闭弹窗'",
        "COMMENT ON COLUMN announcements.active_expires_at IS '上架有效期，到期自动下架'"
    );

    if !done.contains("playground_2026_chat_business_init_v1") {
        match crate::db::migrations::helpers::glm_deepseek_chat::seed_playground_2026_glm_deepseek_chat(pool).await {
            Ok(_) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_chat_business_init_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_chat_business_init_v1".into());
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_chat_business_init_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    if !done.contains("playground_2026_voice_library_v1") {
        match crate::db::migrations::helpers::voice_library::seed_playground_2026_voice_library(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_voice_library_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_voice_library_v1".into());
                tracing::info!("创作中心2026 音频方案音色库回填完成，更新 {} 条配置", n);
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_voice_library_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    // ── 腾讯云 EdgeOne MiniMax 视频生成专属转发规则（支持 OpenAI 与 MiniMax 官方路由） ──
    once_migration!(pool, done, "tencent_edgeone_minimax_video_forward_rule_v1",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT '腾讯云 EdgeOne MiniMax 视频生成', 'tencent', '通过腾讯云 EdgeOne Makers Model Pro 调用 MiniMax H3 视频生成模型。支持 OpenAI 与 MiniMax 官方路由发起，自动转换并透传多模态 content 数组与 TaskId，轮询 /minimax/query/${task_id}', '{"target_type":"minimax_video","path_rewrites":[{"old":"/v1/video/generations","new":"/minimax/v2/video_generation/tpl-3"},{"old":"/v2/video_generation","new":"/minimax/v2/video_generation/tpl-3"}],"auth_type":"bearer","poll_path":"/minimax/query/${task_id}"}', '视频', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = '腾讯云 EdgeOne MiniMax 视频生成')"#
    );

    // ── 腾讯云 VOD 可灵视频生成专属转发规则（支持 OpenAI 与可灵官方路由） ──
    once_migration!(pool, done, "tencent_vod_kling_video_forward_rule_v1",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT '腾讯云 VOD 可灵视频生成', 'tencent', '将 OpenAI 与可灵官方视频请求（文生/图生/Omni）转换为腾讯云点播 AIGC CreateAigcVideoTask 接口。密钥格式：SecretId:SecretKey:SubAppId，模型格式：ModelName@ModelVersion', '{"target_type":"tencent_vod_video","path_rewrite":{"old":"/v1/video/generations","new":"/"},"auth_type":"tencent_vod"}', '视频', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = '腾讯云 VOD 可灵视频生成')"#
    );

    once_migration!(pool, done, "announcements_display_time_mode_v1",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS display_time_mode VARCHAR(16) NOT NULL DEFAULT 'created'",
        "COMMENT ON COLUMN announcements.display_time_mode IS '用户端显示时间：created=新建时间, updated=最后修改时间'"
    );

    // ── OpenAI 聊天转发规则升级：支持 Chat、Responses、Messages 三协议多路径重写 ──
    once_migration!(pool, done, "openai_chat_three_protocols_rewrites_v1",
        r#"UPDATE forward_rules
           SET config_json = '{"path_rewrites":[{"old":"/v1/chat/completions","new":"/v1/chat/completions"},{"old":"/v1/responses","new":"/v1/responses"},{"old":"/v1/messages","new":"/v1/messages"}]}',
               description = '标准的按路径聊天透传规则，支持/v1/chat/completions、/v1/responses与/v1/messages',
               updated_at = CURRENT_TIMESTAMP
           WHERE name = 'OpenAI 兼容原生通道 (聊天)'
              OR config_json = '{"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}'"#
    );

    // ── 2026-09-15 转发规则与素材索引综合更新：MiniMax三协议、素材索引、阿里百炼聊天合并、腾讯云生图及百炼原生路径去重 ──
    once_migration!(pool, done, "rules_and_assets_consolidation_20260915_v1",
        // 1. MiniMax 聊天规则升级：支持 Chat、Responses、Anthropic Messages 多路径重写
        r#"UPDATE forward_rules
           SET name = 'MiniMax 聊天',
               description = 'MiniMax 官方聊天转发规则，支持 /v1/chat/completions、/v1/responses 与 /anthropic/v1/messages 三种协议格式，上游统一 Bearer 鉴权',
               config_json = '{"path_rewrites":[{"old":"/v1/chat/completions","new":"/v1/chat/completions"},{"old":"/v1/responses","new":"/v1/responses"},{"old":"/anthropic/v1/messages","new":"/anthropic/v1/messages"},{"old":"/v1/messages","new":"/anthropic/v1/messages"}],"auth_type":"bearer"}',
               updated_at = CURRENT_TIMESTAMP
           WHERE (name = 'MiniMax 聊天 (Anthropic兼容)' OR name = 'MiniMax 聊天') AND is_system = 1"#,

        // 2. 素材资产管理：为本站关联云端素材建立高能部分索引，确保千万级海量数据下查询恒定毫秒级
        r#"CREATE INDEX IF NOT EXISTS idx_plugin_assets_ns_has_asset_id
           ON plugin_assets (plugin_ns, id DESC)
           WHERE asset_id IS NOT NULL AND asset_id != ''"#,

        // 3. 阿里百炼统一聊天规则：创建新规则并确保配置为 3 端点重写
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT '阿里百炼 DashScope 聊天', 'aliyun',
               '阿里百炼官方聊天转发规则，支持 /v1/chat/completions、/v1/responses 与 /v1/messages（/apps/anthropic/v1/messages）协议格式，上游统一 Bearer 鉴权',
               '{"path_rewrites":[{"old":"/v1/chat/completions","new":"/compatible-mode/v1/chat/completions"},{"old":"/v1/responses","new":"/compatible-mode/v1/responses"},{"old":"/v1/messages","new":"/apps/anthropic/v1/messages"}],"auth_type":"bearer"}',
               '聊天', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = '阿里百炼 DashScope 聊天')"#,
        r#"UPDATE forward_rules
        SET config_json = '{"path_rewrites":[{"old":"/v1/chat/completions","new":"/compatible-mode/v1/chat/completions"},{"old":"/v1/responses","new":"/compatible-mode/v1/responses"},{"old":"/v1/messages","new":"/apps/anthropic/v1/messages"}],"auth_type":"bearer"}',
            description = '阿里百炼官方聊天转发规则，支持 /v1/chat/completions、/v1/responses 与 /v1/messages（/apps/anthropic/v1/messages）协议格式，上游统一 Bearer 鉴权',
            updated_at = CURRENT_TIMESTAMP
        WHERE name = '阿里百炼 DashScope 聊天'"#,

        // 4. 将旧阿里百炼聊天规则(ID 27, 28)的模型自动重定向至新规则，并清理旧规则
        r#"UPDATE models m
        SET forward_rule_ids = (
            SELECT json_agg(DISTINCT CASE WHEN elem::text::bigint IN (27, 28) THEN n.id ELSE elem::text::bigint END)::text
            FROM jsonb_array_elements_text(m.forward_rule_ids::jsonb) AS elem
        ), updated_at = CURRENT_TIMESTAMP
        FROM (SELECT id FROM forward_rules WHERE name = '阿里百炼 DashScope 聊天' LIMIT 1) n
        WHERE m.forward_rule_ids::jsonb @> '27'::jsonb OR m.forward_rule_ids::jsonb @> '28'::jsonb"#,
        r#"DELETE FROM forward_rules WHERE name IN ('阿里百炼 DashScope 聊天 (OpenAI兼容)', '阿里百炼 DashScope 聊天 (Anthropic兼容)')"#,

        // 5. 腾讯云 VOD 生图去重：模型重定向至同步轮询版，清理带 poll_path 规则
        r#"UPDATE models m
        SET forward_rule_ids = (
            SELECT json_agg(DISTINCT CASE WHEN elem::text::bigint = del.id THEN sync.id ELSE elem::text::bigint END)::text
            FROM jsonb_array_elements_text(m.forward_rule_ids::jsonb) AS elem
        ), updated_at = CURRENT_TIMESTAMP
        FROM (
            SELECT id FROM forward_rules 
            WHERE category = '图片' AND rule_type IN ('tencent', 'tencent_vod') 
              AND (config_json::jsonb->>'target_type') = 'tencent_vod_image' AND NOT (config_json::jsonb ? 'poll_path')
            LIMIT 1
        ) sync,
        (
            SELECT id FROM forward_rules 
            WHERE category = '图片' AND rule_type IN ('tencent', 'tencent_vod') 
              AND (config_json::jsonb->>'target_type') = 'tencent_vod_image' AND (config_json::jsonb ? 'poll_path')
        ) del
        WHERE m.forward_rule_ids::jsonb @> to_jsonb(del.id)"#,
        r#"DELETE FROM forward_rules
        WHERE category = '图片' AND rule_type IN ('tencent', 'tencent_vod')
          AND (config_json::jsonb->>'target_type') = 'tencent_vod_image' AND (config_json::jsonb ? 'poll_path')"#,

        // 6. 阿里百炼官方路径(old==new)重复生图与视频规则清理：模型重定向至标准规则，清理冗余规则
        r#"UPDATE models m
        SET forward_rule_ids = (
            SELECT json_agg(DISTINCT CASE WHEN elem::text::bigint = del.id THEN std.id ELSE elem::text::bigint END)::text
            FROM jsonb_array_elements_text(m.forward_rule_ids::jsonb) AS elem
        ), updated_at = CURRENT_TIMESTAMP
        FROM (SELECT id FROM forward_rules WHERE category = '视频' AND rule_type = 'aliyun' AND (config_json::jsonb #>> '{path_rewrite,old}') = '/v1/video/generations' LIMIT 1) std,
             (SELECT id FROM forward_rules WHERE category = '视频' AND rule_type = 'aliyun' AND (config_json::jsonb #>> '{path_rewrite,old}') = (config_json::jsonb #>> '{path_rewrite,new}') AND (config_json::jsonb #>> '{path_rewrite,old}') LIKE '%/api/v1/services/aigc/%') del
        WHERE m.forward_rule_ids::jsonb @> to_jsonb(del.id)"#,
        r#"UPDATE models m
        SET forward_rule_ids = (
            SELECT json_agg(DISTINCT CASE WHEN elem::text::bigint = del.id THEN std.id ELSE elem::text::bigint END)::text
            FROM jsonb_array_elements_text(m.forward_rule_ids::jsonb) AS elem
        ), updated_at = CURRENT_TIMESTAMP
        FROM (SELECT id FROM forward_rules WHERE category = '图片' AND rule_type = 'aliyun' AND (config_json::jsonb #>> '{path_rewrite,old}') = '/v1/images/generations' LIMIT 1) std,
             (SELECT id FROM forward_rules WHERE category = '图片' AND rule_type = 'aliyun' AND (config_json::jsonb #>> '{path_rewrite,old}') = (config_json::jsonb #>> '{path_rewrite,new}') AND (config_json::jsonb #>> '{path_rewrite,old}') LIKE '%/api/v1/services/aigc/%') del
        WHERE m.forward_rule_ids::jsonb @> to_jsonb(del.id)"#,
        r#"DELETE FROM forward_rules
        WHERE rule_type = 'aliyun'
          AND (config_json::jsonb #>> '{path_rewrite,old}') = (config_json::jsonb #>> '{path_rewrite,new}')
          AND (config_json::jsonb #>> '{path_rewrite,old}') LIKE '%/api/v1/services/aigc/%'"#
    );

    once_migration!(pool, done, "tencent_enhance_plugin_v1",
        r#"INSERT INTO plugins (name, title, description, is_enabled, allowed_levels, category)
           VALUES ('tencent_enhance', '腾讯云增强',
           '腾讯云增强，仅作为级联阶段二，不预置模型与渠道',
           0, 'all', 'system')
           ON CONFLICT (name) DO NOTHING"#,
        r#"CREATE TABLE IF NOT EXISTS plugin_tencent_enhance_logs (
            id BIGSERIAL PRIMARY KEY,
            task_id VARCHAR(128) NOT NULL DEFAULT '',
            relay_log_id BIGINT,
            source_type VARCHAR(32) NOT NULL DEFAULT 'cascade',
            video_url TEXT NOT NULL DEFAULT '',
            target_resolution VARCHAR(32) NOT NULL DEFAULT '',
            template_id BIGINT NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'processing',
            output_url TEXT,
            error_message TEXT,
            latency_ms INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_tencent_enhance_task_id ON plugin_tencent_enhance_logs(task_id)",
        "CREATE INDEX IF NOT EXISTS idx_tencent_enhance_status ON plugin_tencent_enhance_logs(status)",
        "CREATE INDEX IF NOT EXISTS idx_tencent_enhance_created_at ON plugin_tencent_enhance_logs(created_at DESC)",
        "COMMENT ON TABLE plugin_tencent_enhance_logs IS '腾讯云视频增强自测与级联阶段二流水'"
    );
    // ── 模型库与上架模型拆分：预置目录独立，更新不污染已上架 ──
    once_migration!(pool, done, "model_library_table_v1",
        r#"CREATE TABLE IF NOT EXISTS model_library (
            id BIGSERIAL PRIMARY KEY,
            mid TEXT NOT NULL,
            name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            original_id TEXT NOT NULL DEFAULT '',
            model_id_alias TEXT NOT NULL DEFAULT '',
            provider_id BIGINT,
            api_provider_id BIGINT,
            type_id BIGINT,
            group_ratios TEXT NOT NULL DEFAULT '{"default":1.0}',
            billing_rule_id BIGINT,
            pre_deduction DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            is_active INTEGER NOT NULL DEFAULT 1,
            forward_rule_ids TEXT,
            enable_log_content INTEGER NOT NULL DEFAULT 0,
            site_discount DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            site_discount_enabled INTEGER NOT NULL DEFAULT 1,
            global_discount DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            global_discount_enabled INTEGER NOT NULL DEFAULT 0,
            logo TEXT,
            remark TEXT,
            description TEXT,
            feature_attributes TEXT DEFAULT '[]',
            is_system INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"#,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_model_library_mid ON model_library (mid)",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS library_mid TEXT",
        "CREATE INDEX IF NOT EXISTS idx_models_library_mid ON models (library_mid)",
        "COMMENT ON TABLE model_library IS '系统模型库（预置目录）。上架后复制到 models，目录更新不覆盖已上架模型。'",
        "COMMENT ON COLUMN models.library_mid IS '来源模型库 mid；空表示自建上架模型'"
    );

    once_migration!(pool, done, "models_is_listed_v1",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS is_listed INTEGER NOT NULL DEFAULT 1",
        "COMMENT ON COLUMN models.is_listed IS '1=上架（可调用/进渠道/进广场），0=下架（在模型库）'",
        "CREATE INDEX IF NOT EXISTS idx_models_is_listed ON models (is_listed)"
    );

    // v1 带 REFERENCES 时，若 providers/types 的 id 仍是 integer，建表会失败；无 FK 再保证能建表。
    once_migration!(pool, done, "model_library_table_nofk_v1",
        r#"CREATE TABLE IF NOT EXISTS model_library (
            id BIGSERIAL PRIMARY KEY,
            mid TEXT NOT NULL,
            name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            original_id TEXT NOT NULL DEFAULT '',
            model_id_alias TEXT NOT NULL DEFAULT '',
            provider_id BIGINT,
            api_provider_id BIGINT,
            type_id BIGINT,
            group_ratios TEXT NOT NULL DEFAULT '{"default":1.0}',
            billing_rule_id BIGINT,
            pre_deduction DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            is_active INTEGER NOT NULL DEFAULT 1,
            forward_rule_ids TEXT,
            enable_log_content INTEGER NOT NULL DEFAULT 0,
            site_discount DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            site_discount_enabled INTEGER NOT NULL DEFAULT 1,
            global_discount DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            global_discount_enabled INTEGER NOT NULL DEFAULT 0,
            logo TEXT,
            remark TEXT,
            description TEXT,
            feature_attributes TEXT DEFAULT '[]',
            is_system INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"#,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_model_library_mid ON model_library (mid)"
    );

    once_migration!(pool, done, "model_library_columns_align_v1",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS provider_id BIGINT",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS api_provider_id BIGINT",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS type_id BIGINT",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS billing_rule_id BIGINT",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS forward_rule_ids TEXT",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS enable_log_content INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 1"
    );

    once_migration!(pool, done, "model_library_columns_nullable_v1",
        "ALTER TABLE model_library ALTER COLUMN logo DROP NOT NULL",
        "ALTER TABLE model_library ALTER COLUMN logo TYPE TEXT",
        "ALTER TABLE model_library ALTER COLUMN remark DROP NOT NULL",
        "ALTER TABLE model_library ALTER COLUMN description DROP NOT NULL"
    );

    if !done.contains("model_library_split_seed_v1") {
        match crate::db::preset_models::split_listed_and_library(pool).await {
            Ok(_) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('model_library_split_seed_v1')",
                )
                .execute(pool)
                .await;
                done.insert("model_library_split_seed_v1".into());
            }
            Err(e) => {
                tracing::warn!("model_library_split_seed_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }
    if !done.contains("volc_mediakit_image_tools_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::seed(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('volc_mediakit_image_tools_v1')",
                )
                .execute(pool)
                .await;
                done.insert("volc_mediakit_image_tools_v1".into());
            }
            Err(e) => {
                tracing::warn!("volc_mediakit_image_tools_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }

    if !done.contains("volc_mediakit_image_identity_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::seed(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('volc_mediakit_image_identity_v1')",
                )
                .execute(pool)
                .await;
                done.insert("volc_mediakit_image_identity_v1".into());
            }
            Err(e) => {
                tracing::warn!("volc_mediakit_image_identity_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }

    once_migration!(pool, done, "playground_2026_image_edit_enabled_default_off_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('playground_2026', 'image_edit_enabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    if !done.contains("pg2026_volc_image_edit_ready_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::activate_for_pg2026_edit(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('pg2026_volc_image_edit_ready_v1')",
                )
                .execute(pool)
                .await;
                done.insert("pg2026_volc_image_edit_ready_v1".into());
            }
            Err(e) => {
                tracing::warn!("pg2026_volc_image_edit_ready_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }
    // ── 日志与归档表增加上游 request_id 字段（元数据加列秒级完成，保持冷热表对齐） ──
    once_migration!(pool, done, "logs_add_upstream_request_id_v1",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS upstream_request_id TEXT",
        "ALTER TABLE logs_archive ADD COLUMN IF NOT EXISTS upstream_request_id TEXT",
        "COMMENT ON COLUMN logs.upstream_request_id IS '上游厂商返回的 request_id（响应头中提取）'",
        "COMMENT ON COLUMN logs_archive.upstream_request_id IS '上游厂商返回的 request_id（冷归档）'"
    );

    // ── 大表索引异步后台构建（专属会话内存 + CONCURRENTLY 并发建索引，启动零阻塞，不锁业务读写） ──
    once_heavy_migration!(pool, done, "logs_upstream_request_id_idx_v1",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_upstream_request_id ON logs (upstream_request_id) WHERE upstream_request_id IS NOT NULL AND upstream_request_id <> ''",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_archive_upstream_request_id ON logs_archive (upstream_request_id) WHERE upstream_request_id IS NOT NULL AND upstream_request_id <> ''",
        "ANALYZE logs",
        "ANALYZE logs_archive"
    );

    once_migration!(pool, done, "volcengine_enhance_tool_logs_v1",
        r#"CREATE TABLE IF NOT EXISTS plugin_volcengine_enhance_logs (
            id BIGSERIAL PRIMARY KEY,
            task_id VARCHAR(128) NOT NULL DEFAULT '',
            relay_log_id BIGINT,
            source_type VARCHAR(32) NOT NULL DEFAULT 'cascade',
            video_url TEXT NOT NULL DEFAULT '',
            target_resolution VARCHAR(32) NOT NULL DEFAULT '',
            status VARCHAR(32) NOT NULL DEFAULT 'processing',
            output_url TEXT,
            error_message TEXT,
            latency_ms INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_volc_enhance_tool_task_id ON plugin_volcengine_enhance_logs(task_id)",
        "CREATE INDEX IF NOT EXISTS idx_volc_enhance_tool_status ON plugin_volcengine_enhance_logs(status)",
        "CREATE INDEX IF NOT EXISTS idx_volc_enhance_tool_created_at ON plugin_volcengine_enhance_logs(created_at DESC)",
        "COMMENT ON TABLE plugin_volcengine_enhance_logs IS '火山增强自测与级联阶段二流水'"
    );

    // ── 控制台仪表盘统计 covering 索引加固（覆盖 token_id 与聚合列，彻底消除回表与 3.15K IOPS 读突刺） ──
    once_heavy_migration!(pool, done, "logs_dashboard_covering_v2",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_admin_dashboard_covering_v2 ON logs (created_at DESC) INCLUDE (prompt_tokens, completion_tokens, cost, token_id)",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_dashboard_covering_v2 ON logs (user_id, created_at DESC) INCLUDE (prompt_tokens, completion_tokens, cost, token_id)",
        "ANALYZE logs"
    );

    // ── 双轨用量统计 covering 索引、logs 复合主键升级与充值订单号自动触发器 ──
    once_heavy_migration!(pool, done, "logs_and_recharge_opt_v1",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_daily_stats_user_date ON usage_daily_stats (user_id, stat_date) INCLUDE (total_cost, total_pre_deduct_gift)",
        "ANALYZE usage_daily_stats",
        "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_pkey_composite ON logs (id, created_at)",
        r#"DO $$ BEGIN
             IF EXISTS (
               SELECT 1 FROM pg_index i
               JOIN pg_class t ON t.oid = i.indrelid
               WHERE t.relname = 'logs' AND i.indisprimary AND i.indnatts >= 2
             ) THEN
               DROP INDEX IF EXISTS idx_logs_pkey_composite;
               RETURN;
             END IF;

             ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_pkey;
             ALTER TABLE logs ADD CONSTRAINT logs_pkey PRIMARY KEY USING INDEX idx_logs_pkey_composite;
           EXCEPTION WHEN OTHERS THEN
             RAISE WARNING 'logs_composite_pkey skip: %', SQLERRM;
           END $$"#,
        "ANALYZE logs",
        r#"UPDATE recharge_records
           SET order_no = (CASE WHEN wallet_type = 'gift' THEN 'G' ELSE 'T' END)
               || to_char(COALESCE(created_at, NOW()) AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDDHH24MISS')
               || 'R' || substring(md5(id::text || COALESCE(created_at::text, '')) from 1 for 8)
           WHERE order_no IS NULL OR TRIM(order_no) = ''"#,
        r#"CREATE OR REPLACE FUNCTION trg_recharge_auto_order_no()
           RETURNS TRIGGER AS $$
           BEGIN
               IF NEW.order_no IS NULL OR TRIM(NEW.order_no) = '' THEN
                   NEW.order_no := (CASE WHEN NEW.wallet_type = 'gift' THEN 'G' ELSE 'T' END)
                       || to_char(CLOCK_TIMESTAMP() AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDDHH24MISS')
                       || 'R' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 8);
               END IF;
               RETURN NEW;
           END;
           $$ LANGUAGE plpgsql;"#,
        "DROP TRIGGER IF EXISTS trg_recharge_auto_order_no ON recharge_records",
        "CREATE TRIGGER trg_recharge_auto_order_no BEFORE INSERT ON recharge_records FOR EACH ROW EXECUTE FUNCTION trg_recharge_auto_order_no()"
    );

    // ── 普通用户邮箱/手机改为限额共享，身份以 UID 唯一区分 ──
    once_migration!(pool, done, "users_shared_email_mobile_v1",
        r#"DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'users' AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) ILIKE '%(email)%'
          LOOP
            EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', r.conname);
          END LOOP;
          FOR r IN
            SELECT i.relname AS idx
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
            WHERE t.relname = 'users'
              AND x.indisunique
              AND NOT x.indisprimary
              AND a.attname = 'email'
              AND x.indnkeyatts = 1
          LOOP
            EXECUTE format('DROP INDEX IF EXISTS %I', r.idx);
          END LOOP;
        END $$"#,
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)",
        "CREATE INDEX IF NOT EXISTS idx_users_mobile ON users (mobile) WHERE mobile IS NOT NULL AND btrim(mobile) <> ''",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_placeholder_email_unique ON users (email) WHERE email LIKE '%@tokensbyte.local'"
    );

    // ── 单条邮箱/手机绑定上限覆盖（站点默认仍走 registration 设置） ──
    once_migration!(pool, done, "contact_bind_limits_v1",
        r#"CREATE TABLE IF NOT EXISTS contact_bind_limits (
            kind TEXT NOT NULL CHECK (kind IN ('email', 'mobile')),
            value TEXT NOT NULL CHECK (btrim(value) <> ''),
            max_accounts INTEGER NOT NULL CHECK (max_accounts BETWEEN 1 AND 99),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (kind, value)
        )"#
    );

    // ── 视觉 Tab 部分索引扩展（精确对齐系统固定 4 个视觉类型，对齐 SQL_VISION_ACTION_FILTER） ──
    once_heavy_migration!(pool, done, "logs_vision_index_include_image_enhance_v1",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_vision_created_at_v2 ON logs (created_at DESC) WHERE (action_type = ANY (ARRAY['图片'::text, '视频'::text, '视频增强'::text, '图像增强'::text]))",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_vision_created_v2 ON logs (user_id, created_at DESC) WHERE (action_type = ANY (ARRAY['图片'::text, '视频'::text, '视频增强'::text, '图像增强'::text]))",
        "ANALYZE logs"
    );

    once_migration!(pool, done, "playground_2026_video_edit_workbench_enabled_default_off_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('playground_2026', 'video_edit_workbench_enabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    // ── 火山 Seedream 5.0 Pro 仅支持单图文档说明与多语言更新 ──
    if !done.contains("update_volc_image_doc_pro_single_v1") {
        let zh_content = include_str!("../../api/plugins/docs_api/default_docs/zh/volc-image.md");
        let en_content = include_str!("../../api/plugins/docs_api/default_docs/en/volc-image.md");
        let _ = sqlx::query("UPDATE plugin_docs SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE slug = 'volc-image'")
            .bind(zh_content)
            .execute(pool)
            .await;
        let _ = sqlx::query("UPDATE plugin_docs_intl SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE lang = 'en' AND doc_id IN (SELECT id FROM plugin_docs WHERE slug = 'volc-image')")
            .bind(en_content)
            .execute(pool)
            .await;
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('update_volc_image_doc_pro_single_v1')")
            .execute(pool)
            .await;
        done.insert("update_volc_image_doc_pro_single_v1".into());
        tracing::info!("已同步火山 Seedream 5.0 Pro 文档说明至数据库");
    }

    if !done.contains("volc_enhance_type_unify_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::seed(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('volc_enhance_type_unify_v1')",
                )
                .execute(pool)
                .await;
                done.insert("volc_enhance_type_unify_v1".into());
            }
            Err(e) => {
                tracing::warn!("volc_enhance_type_unify_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }

    once_migration!(pool, done, "model_discount_schedule_v1",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS discount_schedule TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN models.discount_schedule IS '折扣限价与全站折扣的按天时段规划 JSON。enabled=false 时使用统一折扣'",
        "ALTER TABLE model_library ADD COLUMN IF NOT EXISTS discount_schedule TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN model_library.discount_schedule IS '折扣限价与全站折扣的按天时段规划 JSON。enabled=false 时使用统一折扣'"
    );

    if !done.contains("volc_mediakit_image_billing_pid_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::seed(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('volc_mediakit_image_billing_pid_v1')",
                )
                .execute(pool)
                .await;
                done.insert("volc_mediakit_image_billing_pid_v1".into());
            }
            Err(e) => {
                tracing::warn!("volc_mediakit_image_billing_pid_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }

    once_migration!(
        pool,
        done,
        "ha_plugin_preset_rules_seed_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('high_availability_channel', 'ha_rules', '{"def":"r1","rules":[{"id":"r1","name":"通用对话","retries":3,"budget":900,"ttfb":0,"err":"first","melt":{"401":1800,"402":1800,"404":3,"429":60,"5xx":300}},{"id":"r2","name":"图像生成","retries":2,"budget":1200,"ttfb":120,"err":"last","melt":{"401":1800,"402":1800,"404":3,"429":60,"5xx":300}},{"id":"r3","name":"深度思考","retries":3,"budget":1200,"ttfb":60,"err":"first","melt":{"401":1800,"402":1800,"404":3,"429":60,"5xx":300}},{"id":"r4","name":"音视频长任务","retries":2,"budget":1800,"ttfb":0,"err":"last","melt":{"401":1800,"402":1800,"404":3,"429":60,"5xx":300}},{"id":"r5","name":"向量与排序","retries":3,"budget":600,"ttfb":30,"err":"first","melt":{"401":1800,"402":1800,"404":3,"429":60,"5xx":300}},{"id":"r6","name":"极速容灾","retries":4,"budget":300,"ttfb":5,"err":"first","melt":{"401":1800,"402":1800,"404":3,"429":60,"5xx":300}}]}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    // ── 腾讯云 VOD 火山视频生成专属转发规则（支持 OpenAI 与火山方舟官方路由） ──
    once_migration!(pool, done, "tencent_vod_volcengine_video_forward_rule_v1",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system, eid)
        SELECT '腾讯云 VOD 火山视频生成', 'tencent', '将 OpenAI 与火山方舟官方视频请求转换为腾讯云点播 AIGC CreateAigcVideoTask 接口。密钥格式：SecretId:SecretKey:SubAppId，模型格式：ModelName@ModelVersion', '{"target_type":"tencent_vod_video","path_rewrite":{"old":"/v1/video/generations","new":"/"},"path_accept":["/api/v3/contents/generations/tasks"],"auth_type":"tencent_vod"}', '视频', 1, '1' || lpad((floor(random() * 10000)::int)::text, 4, '0')
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = '腾讯云 VOD 火山视频生成')"#
    );

    // ── 视频模型 Token 细分与日统计预聚合字段（has_video 与细分指标） ──
    once_migration!(pool, done, "logs_has_video_and_stats_columns_v1",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS has_video SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE logs_archive ADD COLUMN IF NOT EXISTS has_video SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE usage_daily_stats ADD COLUMN IF NOT EXISTS prompt_tokens BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE usage_daily_stats ADD COLUMN IF NOT EXISTS completion_tokens BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE usage_daily_stats ADD COLUMN IF NOT EXISTS with_video_tokens BIGINT NOT NULL DEFAULT 0"
    );

    // ── 实时用量高性能通用覆盖索引（无模型硬编码，避免自定义模型漏索引） ──
    once_heavy_migration!(pool, done, "idx_logs_stat_covering_v1",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_stat_covering ON logs (created_at DESC) INCLUDE (model, prompt_tokens, completion_tokens, has_video, cost, status_code, is_completed)",
        "ANALYZE logs"
    );

    if !done.contains("playground_2026_mark_mask_bbox_v1") {
        match crate::db::migrations::helpers::playground::seed_playground_2026_mark_capabilities(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_mark_mask_bbox_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_mark_mask_bbox_v1".into());
                tracing::info!(
                    "创作中心2026 标记蒙版/坐标框回填完成，更新 {} 条配置",
                    n
                );
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_mark_mask_bbox_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    if !done.contains("playground_2026_mark_mask_exact_v1") {
        match crate::db::migrations::helpers::playground::restrict_playground_2026_mask_models(pool).await {
            Ok(n) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('playground_2026_mark_mask_exact_v1')",
                )
                .execute(pool)
                .await;
                done.insert("playground_2026_mark_mask_exact_v1".into());
                tracing::info!(
                    "创作中心2026 蒙版仅保留 gpt-image-2，去掉 {} 条渠道别名",
                    n
                );
            }
            Err(e) => {
                tracing::warn!(
                    "playground_2026_mark_mask_exact_v1 失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    once_migration!(
        pool,
        done,
        "playground_2026_scratch_objects_v1",
        r#"CREATE TABLE IF NOT EXISTS playground_2026_scratch_objects (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            object_key TEXT NOT NULL,
            file_url TEXT NOT NULL DEFAULT '',
            storage_provider TEXT NOT NULL DEFAULT 'tos',
            purpose TEXT NOT NULL DEFAULT 'mask',
            file_size BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expire_at TIMESTAMPTZ NOT NULL
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_pg2026_scratch_expire ON playground_2026_scratch_objects (expire_at)",
        "CREATE INDEX IF NOT EXISTS idx_pg2026_scratch_user_key ON playground_2026_scratch_objects (user_id, object_key)",
        "COMMENT ON TABLE playground_2026_scratch_objects IS '创作中心2026笔画蒙版等临时对象，到期或用完即删'"
    );

    // ── 用户最后活跃 IP，供管理端用户详细展示 ──
    once_migration!(pool, done, "users_last_active_ip_v1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_ip TEXT NOT NULL DEFAULT ''"
    );

    #[cfg(feature = "commercial_plugins")]
    once_migration!(pool, done, "mobile_app_plugin_v1",
        r#"INSERT INTO plugins (
            name, title, description, is_enabled, allowed_levels, category,
            show_in_admin_menu, admin_menu_sort, admin_menu_title, admin_menu_default_tab
        ) VALUES (
            'mobile_app', '移动端APP管理',
            '手机端 App 的版本、维护开关、底部入口和接口目录。App 启动配置只从本插件读取。',
            0, 'all', 'user',
            1, 40, '', 'app_client'
        ) ON CONFLICT (name) DO NOTHING"#
    );

    #[cfg(not(feature = "commercial_plugins"))]
    once_migration!(pool, done, "mobile_app_plugin_strip_v1",
        "DELETE FROM plugin_configs WHERE plugin_name = 'mobile_app'",
        "DELETE FROM plugins WHERE name = 'mobile_app'"
    );

    // 默认安装写进运营列表的预置副本：mid 与目录 mid 相同。已绑渠道、令牌或产生过调用的留下。
    once_migration!(pool, done, "preset_models_stay_in_library_v1",
        r#"DELETE FROM models AS m
           WHERE m.is_listed = 1
             AND m.library_mid IS NOT NULL
             AND m.library_mid <> ''
             AND m.library_mid = m.mid
             AND NOT EXISTS (
               SELECT 1 FROM channels c
               WHERE position(m.mid in c.models) > 0
                  OR position(m.mid in c.model_mapping) > 0
                  OR position(m.model_id in c.models) > 0
             )
             AND NOT EXISTS (
               SELECT 1 FROM api_tokens t
               WHERE position(m.mid in t.allowed_models) > 0
                  OR position(m.model_id in t.allowed_models) > 0
             )
             AND NOT EXISTS (
               SELECT 1 FROM logs l
               WHERE l.model = m.model_id OR l.model = m.mid
             )
             AND NOT EXISTS (
               SELECT 1 FROM logs_archive l
               WHERE l.model = m.model_id OR l.model = m.mid
             )"#
    );

    // 目录里的 MediaKit 预置模型跟随运营行的激活状态。没有已激活运营行时保持关闭，避免插件一开就占满模型仓库。
    once_migration!(pool, done, "volc_mediakit_library_active_follows_models_v1",
        r#"UPDATE model_library AS l
           SET is_active = CASE
                 WHEN EXISTS (
                   SELECT 1 FROM models m WHERE m.mid = l.mid AND m.is_active = 1
                 ) THEN 1
                 ELSE 0
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE l.mid IN (
             'vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep', 'vie-en', 'vir-bg'
           )"#
    );

    if !done.contains("volc_mediakit_library_under_enhance_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::ensure_enhance_library_catalog(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('volc_mediakit_library_under_enhance_v1')",
                )
                .execute(pool)
                .await;
                done.insert("volc_mediakit_library_under_enhance_v1".into());
            }
            Err(e) => {
                tracing::warn!("volc_mediakit_library_under_enhance_v1 失败，未标记完成以便重试: {e}");
            }
        }
    }

    // Seedance 2.5 系统预设补 1080p。只补缺失档，已有自定义 1080p 与时段倍率保持不动。
    once_migration!(pool, done, "seedance25_official_1080p_rate_v1",
        r#"UPDATE billing_rules
        SET extended_config = jsonb_set(
              extended_config::jsonb,
              '{resolution_rates,1080p}',
              '{"with_video":46,"without_video":77}'::jsonb,
              true
            )::text,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_system = 1
          AND (name = 'Seedance2.5官方计费' OR pid = '73119')
          AND jsonb_typeof(extended_config::jsonb -> 'resolution_rates') = 'object'
          AND NOT (extended_config::jsonb -> 'resolution_rates' ? '1080p')"#
    );

    once_migration!(pool, done, "announcements_target_module_v1",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_module VARCHAR(32) NOT NULL DEFAULT 'console'",
        "COMMENT ON COLUMN announcements.target_module IS '通知模块：console=控制台，playground_2026=创作中心2026，portal_pro=站点门户增强版'"
    );

    once_migration!(pool, done, "announcements_target_modules_color_v1",
        "ALTER TABLE announcements ALTER COLUMN target_module TYPE TEXT",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS banner_bg_color VARCHAR(16)",
        "COMMENT ON COLUMN announcements.target_module IS '通知模块，逗号分隔可多选：console,playground_2026,portal_pro'",
        "COMMENT ON COLUMN announcements.banner_bg_color IS '创作中心与门户顶栏背景色，#RRGGBB，空为默认背景'"
    );

    once_migration!(pool, done, "announcements_split_banner_bg_v1",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS playground_banner_bg VARCHAR(16)",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS portal_banner_bg VARCHAR(16)",
        "COMMENT ON COLUMN announcements.playground_banner_bg IS '创作中心顶栏背景色，#RRGGBB，空为默认'",
        "COMMENT ON COLUMN announcements.portal_banner_bg IS '门户顶栏背景色，#RRGGBB，空为默认'",
        r#"UPDATE announcements SET playground_banner_bg = banner_bg_color
           WHERE playground_banner_bg IS NULL AND banner_bg_color IS NOT NULL AND banner_bg_color <> ''
             AND position('playground_2026' in target_module) > 0"#,
        r#"UPDATE announcements SET portal_banner_bg = banner_bg_color
           WHERE portal_banner_bg IS NULL AND banner_bg_color IS NOT NULL AND banner_bg_color <> ''
             AND position('portal_pro' in target_module) > 0"#
    );

    once_migration!(pool, done, "playground_2026_site_default_enabled_default_off_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('playground_2026', 'site_default_enabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    once_migration!(pool, done, "user_level_commission_basis_v1",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_basis TEXT NOT NULL DEFAULT 'consumption'",
        "COMMENT ON COLUMN user_levels.commission_basis IS '返佣发放基准: consumption=按系统钱包实际消费, recharge=按充值入账'",
        "ALTER TABLE commissions ADD COLUMN IF NOT EXISTS source_key TEXT",
        "COMMENT ON COLUMN commissions.source_key IS '返佣幂等键: log:{logs.id} | recharge:{recharge_records.id} | ark:{id} | arkrefund:{id}'",
        "CREATE UNIQUE INDEX IF NOT EXISTS uidx_commissions_source_key ON commissions (source_key) WHERE source_key IS NOT NULL"
    );

    once_migration!(pool, done, "playground_2026_dedicated_token_unique_v1",
        r#"DELETE FROM api_tokens a
           WHERE a.only_playground_2026 = 1
             AND a.name = '创作中心2026'
             AND EXISTS (
               SELECT 1 FROM api_tokens b
               WHERE b.only_playground_2026 = 1
                 AND b.name = '创作中心2026'
                 AND b.user_id = a.user_id
                 AND b.id < a.id
             )"#,
        r#"CREATE UNIQUE INDEX IF NOT EXISTS uidx_api_tokens_pg2026_dedicated
           ON api_tokens (user_id)
           WHERE only_playground_2026 = 1 AND name = '创作中心2026'"#
    );

    once_migration!(
        pool,
        done,
        "volcengine_enhance_default_off_v1",
        r#"UPDATE plugins SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP
           WHERE name = 'volcengine_enhance'
             AND NOT EXISTS (
                 SELECT 1 FROM plugin_configs
                 WHERE plugin_name = 'volcengine_enhance'
                   AND config_key = 'keys'
                   AND config_value IS NOT NULL
                   AND config_value <> ''
                   AND config_value <> '[]'
             )"#
    );

    once_migration!(
        pool,
        done,
        "playground_2026_default_off_v1",
        r#"UPDATE plugins SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP
           WHERE name = 'playground_2026'"#
    );

    once_migration!(
        pool,
        done,
        "remove_seedance_cascade_enhance_models_v1",
        "DELETE FROM model_library WHERE mid IN ('dbs-sr', 'dbs-fs') OR model_id IN ('Doubao-seedance-2-0-sr', 'Doubao-seedance-2-0-fast-sr')",
        "DELETE FROM models WHERE mid IN ('dbs-sr', 'dbs-fs') OR model_id IN ('Doubao-seedance-2-0-sr', 'Doubao-seedance-2-0-fast-sr')"
    );

    // 八条 MediaKit 预置模型录入模型仓库目录，默认保持关闭（is_active = 0），由管理员在插件配置中按需激活。
    if !done.contains("volc_mediakit_preset_library_catalog_v1") {
        match crate::db::migrations::helpers::volc_mediakit_image::ensure_enhance_library_catalog(pool).await {
            Ok(()) => {
                let _ = sqlx::query(
                    "INSERT INTO sys_migration_history (id) VALUES ('volc_mediakit_preset_library_catalog_v1')",
                )
                .execute(pool)
                .await;
                done.insert("volc_mediakit_preset_library_catalog_v1".into());
            }
            Err(e) => {
                tracing::warn!(
                    "volc_mediakit_preset_library_catalog_v1 写入目录失败，未标记完成以便重试: {e}"
                );
            }
        }
    }

    once_migration!(
        pool,
        done,
        "volc_mediakit_preset_models_default_off_v1",
        r#"UPDATE model_library
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE mid IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep', 'vie-en', 'vir-bg')"#,
        r#"UPDATE models
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE mid IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep', 'vie-en', 'vir-bg')
              OR library_mid IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep', 'vie-en', 'vir-bg')"#
    );

    // 画质增强模型默认全部留在模型仓库，不可预先塞入运营模型列表。未绑渠道/令牌/日志的预置行与重复上架副本全部清除。
    once_migration!(
        pool,
        done,
        "volc_mediakit_models_library_only_by_default_v1",
        r#"DELETE FROM models m
           WHERE (
               m.mid IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep', 'vie-en', 'vir-bg')
               OR (m.library_mid IN ('vve-sd', 'vve-pf', 'vve-ft', 'vve-gt', 'vvs-er', 'vvs-ep', 'vie-en', 'vir-bg') AND m.is_listed = 1)
           )
             AND NOT EXISTS (
               SELECT 1 FROM channels c
               WHERE position(m.mid in c.models) > 0
                  OR position(m.mid in c.model_mapping) > 0
                  OR position(m.model_id in c.models) > 0
             )
             AND NOT EXISTS (
               SELECT 1 FROM api_tokens t
               WHERE position(m.mid in t.allowed_models) > 0
                  OR position(m.model_id in t.allowed_models) > 0
             )
             AND NOT EXISTS (
               SELECT 1 FROM logs l
               WHERE l.model = m.model_id OR l.model = m.mid
             )
             AND NOT EXISTS (
               SELECT 1 FROM logs_archive l
               WHERE l.model = m.model_id OR l.model = m.mid
             )"#
    );

    // 用户端资产素材菜单默认关闭；已保存的菜单文案「资产充值」改为「资产素材」
    once_migration!(pool, done, "asset_manager_user_menu_default_off_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('asset_manager', 'user_asset_menu_enabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#,
        r#"UPDATE settings SET value = replace(
            replace(value, '"label_zh":"资产充值"', '"label_zh":"资产素材"'),
            '"label_zh": "资产充值"', '"label_zh": "资产素材"'
        ) WHERE key = 'menu_config_settings'"#
    );

    once_migration!(pool, done, "commission_transfer_limits_daily_v1",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_transfer_min DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_transfer_max DOUBLE PRECISION NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN user_levels.commission_transfer_min IS '佣金钱包单次划转下限，0 为不限制'",
        "COMMENT ON COLUMN user_levels.commission_transfer_max IS '佣金钱包单次划转上限，0 为不限制'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS commission_posted INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS commission_posted INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN logs.commission_posted IS '消费返佣是否已计入当日汇总，1 为已计入'",
        "COMMENT ON COLUMN recharge_records.commission_posted IS '该流水的返佣是否已计入当日汇总，1 为已计入'"
    );

    once_migration!(pool, done, "commission_wallet_unmirror_gift_v1",
        "COMMENT ON COLUMN users.commission_balance IS '佣金钱包。返佣只进此余额。调用扣费不使用它，用户可划转到系统钱包。'",
        r#"UPDATE users SET commission_balance = 0, updated_at = CURRENT_TIMESTAMP
           WHERE commission_balance <> 0"#
    );

    Ok(())
}

