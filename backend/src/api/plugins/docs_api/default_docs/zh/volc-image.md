# seedream 图像生成接入指南

OpenAI 兼容：`POST /v1/images/generations`。原生路径：`/api/v3/images/generations`。[图片生成 API](https://www.volcengine.com/docs/82379/1541523)

---

## 1. 提交示例 (POST)

* **路径**: `https://{{domain}}/v1/images/generations`
* **鉴权**: `Authorization: Bearer sk-your_token`

> [!IMPORTANT]
> **模型能力核心差异（必读）**：
> * **Seedream 5.0 Pro (`doubao-seedream-5-0-pro-260628`)**：专为高精度单图设计，支持**图层拆分**、**交互编辑（坐标/涂鸦/框选）**、**透明背景**；**仅支持单图生成，严禁传入 `n > 1` 或 `sequential_image_generation`**（否则上游火山将报错 `the parameter 'sequential_image_generation' is not supported by the current model`），亦不支持联网搜索与流式输出。
> * **Seedream 5.0 lite (`doubao-seedream-5-0-260128`) / 4.5 / 4.0**：支持**组图生成（`n: 2~15`）**与联网搜索（仅 5.0 lite）；不支持图层拆分与交互编辑。

### A. 文生单图（Seedream 5.0 Pro 推荐）

用于高质量、高精度细节的单张图片生成。`n` 必须为 `1` 或直接省略不传。

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "一只穿着红色唐装的小柴犬，坐在大门红灯笼下拜年，国潮插画风格，喜庆温馨",
    "size": "2K",
    "watermark": false,
    "response_format": "url"
  }'
```

### B. 文生组图（一次多张，需使用 Seedream 5.0 lite 或 4.5）

若需一次生成一组多张内容关联的图片（组图），需使用 **Seedream 5.0 lite** 或 **4.5**，并通过 `n` 参数指定生成张数（2–15 张）：

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "一组四格连环漫画，讲述小猫探索奇幻森林的冒险旅程，治愈温暖插画风格",
    "size": "2K",
    "n": 4,
    "watermark": false,
    "response_format": "url"
  }'
```

### C. 图生图 / 多图参考

* **Seedream 5.0 Pro**：参考图支持 1–10 张（生成单图，不支持组图）。
* **Seedream 5.0 lite / 4.5**：参考图支持 1–14 张（支持图生组图，输入参考图数量 + 最终生成图数量 ≤ 15 张）。

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

### D. 图层拆分（`layer_decomposition`）

仅 Pro 支持。必须且只能 1 张输入图；严禁组图（`n>1`）。返回底图（`z_index=0`）+ 最多 16 张透明 PNG 图层。`prompt` 可空（自动拆全部要素），或用自然语言 / `<bbox>x1 y1 x2 y2</bbox>`（归一化 0–999）指定要拆的元素。被挡住的背景会补全。

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

### E. 透明背景（`background`）

仅 Pro 支持。`background=transparent` 须配合 `output_format=png`（`jpeg` 无透明通道）。

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
| `model` | string | **是** | - | 推荐 `doubao-seedream-5-0-pro-260628`（高精度单图/拆层）或 `doubao-seedream-5-0-260128`（组图/搜索） |
| `prompt` | string | 条件 | - | 画面 / 编辑意图。图层拆分可空（自动拆层） |
| `image` | string / array | 否 | - | 参考图 URL 或 base64。Pro 参考图 1–10 张（单图）；Lite/4.x 参考图 1–14 张。图层拆分必须恰好 1 张 |
| `image_urls` | array | 否 | - | 参考图 URL 数组，网关会收成官方 `image` |
| `size` / `resolution` | string | 否 | `"2K"` | Pro 支持 `1K` / `1.5K` / `2K` 或像素如 `"2048x2048"`（拆层还可 `auto`）；Lite 支持 `2K` / `3K` / `4K` |
| `n` | integer | 否 | `1` | 生成张数（1–15）。**注意：仅 5.0 lite / 4.5 / 4.0 支持组图（n > 1）；Seedream 5.0 pro 仅支持单图（n 必须为 1 或不传，传 n > 1 会报错）** |
| `layer_decomposition` | boolean | 否 | `false` | **仅 Pro**。图层拆分：底图 + 独立透明图层（最多 16 层） |
| `background` | string | 否 | `"opaque"` | **仅 Pro**。透明通道：`opaque` / `transparent`（透明须 `output_format=png`） |
| `output_format` | string | 否 | `"jpeg"` | 底图编码 `jpeg` / `png`。拆出的图层固定为透明 PNG |
| `watermark` | boolean | 否 | `false` | 水印开关 |
| `web_search` | boolean | 否 | `false` | 联网搜索。**注意：仅 5.0 lite 支持**；Pro 及 4.x 不支持 |
| `response_format` | string | 否 | `"url"` | `"url"` 或 `"b64_json"` |
| `sequential_image_generation` | string | 否 | - | 官方组图参数：`auto` / `disabled`。一般直接传 `n` 即可。**注意：仅 Lite / 4.5 / 4.0 支持；Pro 模型不支持该参数，严禁配置** |

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

## 4. 模型选型与版本特性对比

| 特性 / 能力 | Seedream 5.0 Pro | Seedream 5.0 lite | Seedream 4.5 | Seedream 4.0 |
| :--- | :---: | :---: | :---: | :---: |
| **推荐 Model ID** | `doubao-seedream-5-0-pro-260628` | `doubao-seedream-5-0-260128` | `doubao-seedream-4-5-251128` | `doubao-seedream-4-0-250828` |
| **生成单图** | ✅ 支持 | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| **生成组图 (`n > 1`)** | ❌ **不支持（严禁传 n>1）** | ✅ 支持（最多 15 张） | ✅ 支持（最多 15 张） | ✅ 支持（最多 15 张） |
| **参考图上限** | 1–10 张 | 1–14 张 | 1–14 张 | 1–14 张 |
| **图层拆分** | ✅ 支持（1 底图 + ≤16 图层） | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 |
| **交互编辑（坐标/选区）** | ✅ 支持 | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 |
| **透明背景** | ✅ 支持 (`background=transparent`) | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 |
| **联网搜索 (`web_search`)** | ❌ 不支持 | ✅ 支持 | ❌ 不支持 | ❌ 不支持 |
| **分辨率范围** | 1K / 1.5K / 2K | 2K / 3K / 4K | 2K / 4K | 1K / 2K / 4K |
