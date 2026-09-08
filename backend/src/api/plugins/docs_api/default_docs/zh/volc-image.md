# seedream 图像生成接入指南

推荐 **Seedream 5.0 Pro**（`doubao-seedream-5-0-pro-260628`）。OpenAI 兼容：`POST /v1/images/generations`。原生路径 `/api/v3/images/generations`。[图片生成 API](https://www.volcengine.com/docs/82379/1541523)

---

## 1. 提交示例 (POST)

* **路径**: `https://{{domain}}/v1/images/generations`
* **鉴权**: `Authorization: Bearer sk-your_token`

### A. 文生图（`n` 一次多张）

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "一只穿着红色唐装的小柴犬，坐在大门红灯笼下拜年，国潮插画风格，喜庆温馨",
    "size": "2K",
    "n": 2,
    "watermark": false,
    "response_format": "url"
  }'
```

### B. 图生图 / 多图参考

Pro 参考图最多 10 张。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "参考图一中柴犬的神态和图二的古风房屋背景，绘制一幅精美的贺年国画插图",
    "image_urls": [
      "https://example.com/assets/dog.png",
      "https://example.com/assets/house.png"
    ],
    "size": "2K"
  }'
```

### C. 图层拆分（`layer_decomposition`）

仅 Pro。必须且只能 1 张输入图；不要同时组图（`n>1`）。返回底图（`z_index=0`）+ 最多 16 张透明 PNG 图层。`prompt` 可空（自动拆全部要素），或用自然语言 / `<bbox>x1 y1 x2 y2</bbox>`（归一化 0–999）指定要拆的元素。被挡住的背景会补全。

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "分离标题文字与主体鹦鹉为独立图层；鹦鹉坐标 <bbox>347 305 642 997</bbox>",
  "image": "https://example.com/poster.png",
  "layer_decomposition": true,
  "size": "2K",
  "output_format": "png",
  "watermark": false
}
```

### D. 透明背景（`background`）

`background=transparent` 须配合 `output_format=png`（`jpeg` 无透明通道）。

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "一只柴犬商品主图，纯透明背景",
  "size": "2K",
  "output_format": "png",
  "background": "transparent",
  "watermark": false
}
```

---

## 2. 完整参数字典说明

| 参数 | 类型 | 必填 | 默认值 | 描述与限制 |
| :--- | :--- | :--- | :--- | :--- |
| `model` | string | **是** | - | 推荐 `doubao-seedream-5-0-pro-260628` |
| `prompt` | string | 条件 | - | 画面 / 编辑意图。图层拆分可空（自动拆层） |
| `image` | string / array | 否 | - | 参考图 URL 或 base64。图层拆分必须恰好 1 张 |
| `image_urls` | array | 否 | - | 参考图 URL 数组，网关会收成官方 `image` |
| `size` / `resolution` | string | 否 | `"2K"` | Pro：`1K` / `1.5K` / `2K` 或像素如 `"2048x2048"`。图层拆分还可 `auto` |
| `n` | integer | 否 | `1` | 生成张数（1–15），网关映射为组图。图层拆分忽略组图 |
| `layer_decomposition` | boolean | 否 | `false` | **仅 Pro**。图层拆分：底图 + 独立透明图层 |
| `background` | string | 否 | `"opaque"` | 透明通道：`opaque` / `transparent`（透明须 `output_format=png`） |
| `output_format` | string | 否 | `"jpeg"` | 底图编码 `jpeg` / `png`。拆出的图层固定为透明 PNG |
| `watermark` | boolean | 否 | `false` | 水印 |
| `web_search` | boolean | 否 | `false` | 联网搜索 |
| `response_format` | string | 否 | `"url"` | `"url"` 或 `"b64_json"` |
| `sequential_image_generation` | string | 否 | - | 官方组图：`auto` / `disabled`。一般用 `n` 即可 |

`role` 类字段生图不需要。已有官方 `image` 时不要再叠冲突的数组字段。

---

## 3. 返回结果

普通生图：

```json
{
  "created": 1719441600,
  "data": [
    { "url": "https://example.com/output/a.png", "size": "2048x2048" }
  ]
}
```

图层拆分时 `data[]` 按 `z_index` 自底向上：`0` 为底图（无 bbox/name），其余为图层。按 `z_index` 升序叠回可还原整图。

```json
{
  "data": [
    {
      "url": "https://example.com/base.jpg",
      "size": "2048x2048",
      "output_format": "jpeg",
      "z_index": 0
    },
    {
      "url": "https://example.com/title.png",
      "size": "1273x265",
      "output_format": "png",
      "z_index": 1,
      "bounding_box": {
        "absolute": [383, 120, 1655, 384],
        "normalized": [187, 59, 808, 188]
      },
      "name": "标题文字",
      "description": "黄色大号衬线标题"
    }
  ],
  "usage": { "input_images": 1, "generated_images": 2 }
}
```

---

## 4. 更早模型

`doubao-seedream-5-0-260128`、4.x 等：把 `model` 换成对应 ID。`layer_decomposition` / `background=transparent` 仅 Pro。
