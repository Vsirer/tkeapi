-- 创作中心2026：仅四个 Seedream 图片方案去掉与「图片专用参数」重复的 params.size
-- 其它方案（含 openai_image / gemini / dashscope 等）的 size 参数不改
UPDATE plugin_configs
SET config_value = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN elem->>'id' IN ('seedream_5_0', 'seedream_5_0_pro', 'seedream_4_5', 'seedream_4_0')
          AND jsonb_typeof(elem->'params') = 'array'
        THEN jsonb_set(
          elem,
          '{params}',
          (
            SELECT COALESCE(jsonb_agg(p ORDER BY pord), '[]'::jsonb)
            FROM jsonb_array_elements(elem->'params') WITH ORDINALITY AS t(p, pord)
            WHERE p->>'key' IS DISTINCT FROM 'size'
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
