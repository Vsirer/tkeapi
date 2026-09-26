# GPT-gpt-image-2 图像生成与编辑接入指南

OpenAI 兼容：`POST /v1/images/generations`、`POST /v1/images/edits`。[图片生成 API](https://developers.openai.com/api/reference/resources/images/methods/generate)

---

## 1. 基础调用地址 (Endpoint)

* **HTTP Method**: `POST`
* **文生图路由**: `https://{{domain}}/v1/images/generations`
* **图像编辑与局部重绘路由**: `https://{{domain}}/v1/images/edits`
* **鉴权头部**: `Authorization: Bearer sk-your_token`

---

## 2. 文生图 (Text-to-Image)

### A. 常用调用

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一个极简主义风格的宇航员，站在红色荒凉的火星表面，背景是浩瀚的宇宙星空",
    "size": "1024x1024",
    "quality": "low",
    "n": 1,
    "response_format": "url"
  }'
```

### B. 透明背景

`background=transparent` 须 `output_format` 为 `png` 或 `webp`（`jpeg` 无透明通道）。提示词写清主体孤立，不要实景、棋盘底或多余阴影。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一枚扁平蓝色文件夹图标，干净描边，完全透明背景，无阴影无场景",
    "size": "1024x1024",
    "quality": "medium",
    "background": "transparent",
    "output_format": "png",
    "response_format": "url"
  }'
```

---

## 3. 图像编辑与局部重绘 (Image Edits)

兼容 JSON（网关扩展：传图片 URL）与官方 Form-Data。编辑同样支持 `quality` / `background` / `output_format` / `size`。`gpt-image-2` 不支持 `input_fidelity`（输出默认已是高保真）。

### A. JSON 传参（网络图片 URL）

```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "image": "https://example.com/assets/my_avatar.png",
    "mask": "https://example.com/assets/mask_face.png",
    "prompt": "在遮罩涂抹的脸部区域加上一副酷炫的墨镜，保持逼真光影",
    "size": "1024x1024",
    "quality": "medium",
    "n": 1,
    "response_format": "url"
  }'
```

### B. OpenAI 标准 Form-Data（本地文件）

```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token_here" \
  -F "model=gpt-image-2" \
  -F "image=@/path/to/my_avatar.png" \
  -F "mask=@/path/to/mask_face.png" \
  -F "prompt=在遮罩涂抹的脸部区域加上一副酷炫的墨镜，保持逼真光影" \
  -F "size=1024x1024" \
  -F "quality=medium" \
  -F "n=1" \
  -F "response_format=url"
```

---

## 4. 请求参数说明

| 参数名 | 类型 | 必填 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | **是** | - | 传入 `gpt-image-2`（或快照 `gpt-image-2-2026-04-21`）。 |
| `prompt` | `string` | **是** | - | 画面或改动描述。GPT Image 最长约 32000 字符。 |
| `image` | `file / string / array` | 否 | - | **编辑必填**。底图：Form-Data 文件，或 JSON 的 URL。官方：`png` / `webp` / `jpg`，单张小于 50MB，最多 16 张。 |
| `mask` | `file / string` | 否 | - | 编辑可选。透明区域（Alpha）为重绘范围。 |
| `size` | `string` | 否 | `auto` | `auto`，或 `WIDTHxHEIGHT`。常用 `1024x1024`、`1024x1536`、`1536x1024`。两边须为 16 的倍数，比例 1:3～3:1，边长 ≤3840，总像素 655360～8294400。超过 `2560x1440` 为实验档。 |
| `quality` | `string` | 否 | `auto` | 默认 `auto`，按所选模型自动选最佳质量。GPT 图像模型：`high` / `medium` / `low`。`gpt-image-2.5-sunburst`、`gpt-image-2.5-flare`（含 `2026-09-08` 快照）额外支持 `xhigh` / `max`。 |
| `background` | `string` | 否 | `auto` | `transparent` / `opaque` / `auto`。透明须 `output_format=png` 或 `webp`（预览能力）。 |
| `output_format` | `string` | 否 | `png` | `png` / `jpeg` / `webp`。 |
| `output_compression` | `integer` | 否 | `100` | 仅 `jpeg` / `webp`，0–100。PNG 不要传。 |
| `moderation` | `string` | 否 | `auto` | 内容审核：`auto` 或 `low`（更宽松）。 |
| `n` | `integer` | 否 | `1` | 生成张数，官方 1–10；令牌或渠道可能另有上限。 |
| `response_format` | `string` | 否 | `url` | 网关：`url` 或 `b64_json`。官方 GPT Image 原生返回 base64，本网关可用 `url`。 |

`style` 仅 DALL·E 3，本模型不要传。

---

## 5. 返回结果示例 (200 OK)

```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_astronaut_gptimage2.png"
    }
  ]
}
```
