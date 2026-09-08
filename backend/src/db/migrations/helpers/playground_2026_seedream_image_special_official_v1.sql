-- 创作中心2026：四个 Seedream 图片方案写入火山「图像输出尺寸」官方专用参数（覆盖库内旧配置）
-- 文档：https://ark.volcengine.com/docs/82379/1824121 文生图 / 图像输出尺寸
UPDATE plugin_configs
SET config_value = (
  SELECT COALESCE(
    jsonb_agg(
      CASE elem->>'id'
        WHEN 'seedream_5_0_pro' THEN jsonb_set(elem, '{image_special_params}', $seedream_pro${"enabled":true,"aspect_ratio":{"enabled":true,"key":"ratio","in_request":false,"options":["auto","1:1","4:3","3:4","16:9","9:16","3:2","2:3","21:9"],"default":"auto"},"resolution":{"enabled":true,"key":"resolution","in_request":false,"options":["1K","1.5K","2K"],"default":"2K"},"image_size":{"enabled":true,"key":"size","in_request":true,"size_map":{"1K":{"1:1":"1024x1024","4:3":"1152x864","3:4":"864x1152","16:9":"1424x800","9:16":"800x1424","3:2":"1248x832","2:3":"832x1248","21:9":"1568x672"},"1.5K":{"1:1":"1536x1536","4:3":"1792x1344","3:4":"1344x1792","16:9":"2048x1152","9:16":"1152x2048","3:2":"1872x1248","2:3":"1248x1872","21:9":"2352x1008"},"2K":{"1:1":"2048x2048","4:3":"2368x1776","3:4":"1776x2368","16:9":"2816x1584","9:16":"1584x2816","3:2":"2496x1664","2:3":"1664x2496","21:9":"3136x1344"}},"custom":{"enabled":true,"min_pixels":921600,"max_pixels":4624220,"min_aspect":"1:16","max_aspect":"16:1","step":1}}}$seedream_pro$::jsonb, true)
        WHEN 'seedream_5_0' THEN jsonb_set(elem, '{image_special_params}', $seedream_lite${"enabled":true,"aspect_ratio":{"enabled":true,"key":"ratio","in_request":false,"options":["auto","1:1","4:3","3:4","16:9","9:16","3:2","2:3","21:9"],"default":"auto"},"resolution":{"enabled":true,"key":"resolution","in_request":false,"options":["2K","3K","4K"],"default":"2K"},"image_size":{"enabled":true,"key":"size","in_request":true,"size_map":{"2K":{"1:1":"2048x2048","4:3":"2304x1728","3:4":"1728x2304","16:9":"2848x1600","9:16":"1600x2848","3:2":"2496x1664","2:3":"1664x2496","21:9":"3136x1344"},"3K":{"1:1":"3072x3072","4:3":"3456x2592","3:4":"2592x3456","16:9":"4096x2304","9:16":"2304x4096","3:2":"3744x2496","2:3":"2496x3744","21:9":"4704x2016"},"4K":{"1:1":"4096x4096","4:3":"4704x3520","3:4":"3520x4704","16:9":"5504x3040","9:16":"3040x5504","3:2":"4992x3328","2:3":"3328x4992","21:9":"6240x2656"}},"custom":{"enabled":true,"min_pixels":3686400,"max_pixels":16777216,"min_aspect":"1:16","max_aspect":"16:1","step":1}}}$seedream_lite$::jsonb, true)
        WHEN 'seedream_4_5' THEN jsonb_set(elem, '{image_special_params}', $seedream_45${"enabled":true,"aspect_ratio":{"enabled":true,"key":"ratio","in_request":false,"options":["auto","1:1","4:3","3:4","16:9","9:16","3:2","2:3","21:9"],"default":"auto"},"resolution":{"enabled":true,"key":"resolution","in_request":false,"options":["2K","4K"],"default":"2K"},"image_size":{"enabled":true,"key":"size","in_request":true,"size_map":{"2K":{"1:1":"2048x2048","4:3":"2304x1728","3:4":"1728x2304","16:9":"2848x1600","9:16":"1600x2848","3:2":"2496x1664","2:3":"1664x2496","21:9":"3136x1344"},"4K":{"1:1":"4096x4096","4:3":"4704x3520","3:4":"3520x4704","16:9":"5504x3040","9:16":"3040x5504","3:2":"4992x3328","2:3":"3328x4992","21:9":"6240x2656"}},"custom":{"enabled":true,"min_pixels":3686400,"max_pixels":16777216,"min_aspect":"1:16","max_aspect":"16:1","step":1}}}$seedream_45$::jsonb, true)
        WHEN 'seedream_4_0' THEN jsonb_set(elem, '{image_special_params}', $seedream_40${"enabled":true,"aspect_ratio":{"enabled":true,"key":"ratio","in_request":false,"options":["auto","1:1","4:3","3:4","16:9","9:16","3:2","2:3","21:9"],"default":"auto"},"resolution":{"enabled":true,"key":"resolution","in_request":false,"options":["1K","2K","4K"],"default":"1K"},"image_size":{"enabled":true,"key":"size","in_request":true,"size_map":{"1K":{"1:1":"1024x1024","4:3":"1152x864","3:4":"864x1152","16:9":"1312x736","9:16":"736x1312","3:2":"1248x832","2:3":"832x1248","21:9":"1568x672"},"2K":{"1:1":"2048x2048","4:3":"2304x1728","3:4":"1728x2304","16:9":"2848x1600","9:16":"1600x2848","3:2":"2496x1664","2:3":"1664x2496","21:9":"3136x1344"},"4K":{"1:1":"4096x4096","4:3":"4704x3520","3:4":"3520x4704","16:9":"5504x3040","9:16":"3040x5504","3:2":"4992x3328","2:3":"3328x4992","21:9":"6240x2656"}},"custom":{"enabled":true,"min_pixels":921600,"max_pixels":16777216,"min_aspect":"1:16","max_aspect":"16:1","step":1}}}$seedream_40$::jsonb, true)
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
