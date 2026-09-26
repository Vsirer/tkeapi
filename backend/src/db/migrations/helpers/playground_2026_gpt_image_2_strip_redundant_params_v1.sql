-- 创作中心2026：GPT-Image-2 去掉与图片专用参数重复的 ratio / prompt_enhancer / resolution
-- 缺图片专用参数时写入 enabled=true；管理员已保存的开关不覆盖
UPDATE plugin_configs
SET config_value = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN elem->>'id' = 'gpt-image-2'
          AND jsonb_typeof(elem->'params') = 'array'
        THEN jsonb_set(
          CASE
            WHEN elem->'image_special_params' IS NULL
              OR jsonb_typeof(elem->'image_special_params') <> 'object'
              OR elem->'image_special_params' = '{}'::jsonb
            THEN jsonb_set(elem, '{image_special_params}', '{"enabled": true}'::jsonb, true)
            ELSE elem
          END,
          '{params}',
          (
            SELECT COALESCE(jsonb_agg(p ORDER BY pord), '[]'::jsonb)
            FROM jsonb_array_elements(elem->'params') WITH ORDINALITY AS t(p, pord)
            WHERE p->>'key' NOT IN ('ratio', 'prompt_enhancer', 'resolution')
          ),
          true
        )
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
