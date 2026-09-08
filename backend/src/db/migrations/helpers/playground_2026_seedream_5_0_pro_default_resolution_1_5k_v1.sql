-- 创作中心2026：Seedream 5.0 Pro 图片方案默认分辨率对齐为 1.5K
UPDATE plugin_configs
SET config_value = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN elem->>'id' = 'seedream_5_0_pro'
          AND elem ? 'image_special_params'
          AND elem->'image_special_params' ? 'resolution'
        THEN jsonb_set(elem, '{image_special_params,resolution,default}', '"1.5K"'::jsonb, true)
        ELSE elem
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )::text
  FROM jsonb_array_elements(config_value::jsonb) WITH ORDINALITY AS t(elem, ord)
),
updated_at = CURRENT_TIMESTAMP
WHERE plugin_name = 'playground_2026'
  AND config_key = 'pg_schemes'
  AND config_value ~ '^\s*\[';
