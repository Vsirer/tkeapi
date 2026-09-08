# MiniMax 图像生成接入指南

MiniMax（海螺）提供 `image-01` / `image-01-live` 生图模型。通过 OpenAI 兼容接口 `POST /v1/images/generations` 调用即可。

---

## 1. 提交生图任务代码示例 (POST)

* **HTTP Method**: `POST`
* **请求路径**: `https://{{domain}}/v1/images/generations`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

### A. 文生图（比例 / 张数 / Prompt 优化）

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "白 T 恤男子全身正面站姿，洛杉矶威尼斯海滩招牌背景，90 年代纪实时尚摄影，胶片颗粒，写实",
    "ratio": "16:9",
    "n": 2,
    "prompt_optimizer": true,
    "response_format": "url"
  }'
```

### B. 图生图 / 主体参考

传入 `image` 或 `image_urls` 作为主体参考。建议使用单人正面清晰人像。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "参考图中人物，站在图书馆窗边远眺，电影感自然光",
    "image_urls": [
      "https://example.com/assets/character_face.jpg"
    ],
    "ratio": "16:9",
    "n": 1
  }'
```

### C. 多图主体参考

多张参考图可用于角色外形 + 场景/道具等组合（`image-01` 通常以首张人物为主，其余辅助场景或风格）。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "参考图一人物身份与图二街景氛围，人物自然行走，电影感跟拍构图",
    "image_urls": [
      "https://example.com/character_face.jpg",
      "https://example.com/street_scene.jpg"
    ],
    "ratio": "16:9",
    "n": 2
  }'
```

多主体时也可使用 `subject_reference` 数组（每项一张参考图）：

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "两位参考图中人物同框对话，室内暖光",
    "subject_reference": [
      { "type": "character", "image_file": "https://example.com/person_a.jpg" },
      { "type": "character", "image_file": "https://example.com/person_b.jpg" }
    ],
    "aspect_ratio": "16:9",
    "n": 1
  }'
```

### D. 使用 `subject_reference`（单图）

也可直接传 `subject_reference`（与 B 同时传时以此为准；多图见上一节 C）。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "参考图中人物，站在图书馆窗边远眺，电影感自然光",
    "subject_reference": [
      {
        "type": "character",
        "image_file": "https://example.com/assets/character_face.jpg"
      }
    ],
    "aspect_ratio": "16:9",
    "n": 2
  }'
```

### E. image-01-live 画风控制（仅 live 模型）

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01-live",
    "prompt": "春日公园里的少女侧脸，柔和日光",
    "style": {
      "style_type": "水彩",
      "style_weight": 0.8
    },
    "ratio": "3:4",
    "n": 1
  }'
```

---

## 2. 完整参数字典说明

| 参数 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | `image-01` 或 `image-01-live`（以平台实际上架名为准）。 |
| `prompt` | `string` | **是** | - | 画面描述，最长约 1500 字符。 |
| `ratio` / `size` / `aspect_ratio` | `string` | 否 | `"1:1"` | 画幅。可选 `1:1` `16:9` `9:16` `4:3` `3:4` `3:2` `2:3`；`21:9` 仅 `image-01`。三者等价。 |
| `width` + `height` | `integer` | 否 | - | 仅 `image-01`；需成对且为 8 的倍数，范围 `[512, 2048]`；与比例参数同时存在时以比例为准。 |
| `image` / `image_urls` | `string / array` | 否 | - | 主体参考图。 |
| `subject_reference` | `array` | 否 | - | 主体参考；元素含 `type`（当前仅 `character`）与 `image_file`（URL 或 Data URL）。 |
| `style` | `object` | 否 | - | 仅 `image-01-live`：`style_type`（`漫画`/`元气`/`中世纪`/`水彩`）+ 可选 `style_weight`（`(0,1]`，默认 `0.8`）。 |
| `n` | `integer` | 否 | `1` | 生成张数，范围 `[1, 9]`。 |
| `seed` | `integer` | 否 | - | 随机种子，便于复现。 |
| `prompt_optimizer` | `boolean` | 否 | `false` | 是否开启 Prompt 自动优化。 |
| `watermark` / `aigc_watermark` | `boolean` | 否 | `false` | 是否加水印，二者等价。 |
| `response_format` | `string` | 否 | `"url"` | `"url"` 或 `"b64_json"`。URL 通常 24 小时有效。 |

---

## 3. 返回结果示例 (200 OK)

同步返回，格式为 OpenAI 风格 `data[]`：

```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_minimax_1.png"
    },
    {
      "url": "https://example.com/output/img_minimax_2.png"
    }
  ]
}
```
