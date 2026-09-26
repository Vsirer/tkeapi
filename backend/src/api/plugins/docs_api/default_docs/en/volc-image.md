# Volcengine doubao-seedream Image Generation

OpenAI-compatible: `POST /v1/images/generations`. Native: `/api/v3/images/generations`. [Image API](https://www.volcengine.com/docs/82379/1541523)

---

## 1. Submit (POST)

* **Path**: `https://{{domain}}/v1/images/generations`
* **Auth**: `Authorization: Bearer sk-your_token`

> [!IMPORTANT]
> **Key Model Capability Differences (Must Read)**:
> * **Seedream 5.0 Pro (`doubao-seedream-5-0-pro-260628`)**: Designed for high-precision single image creation. Supports **layer decomposition**, **interactive editing (coordinates/sketches/bounding boxes)**, and **transparent background**. **Only supports single image generation; DO NOT pass `n > 1` or `sequential_image_generation`** (otherwise upstream Volcano Ark will reject with `the parameter 'sequential_image_generation' is not supported by the current model`). Web search and streaming are not supported.
> * **Seedream 5.0 lite (`doubao-seedream-5-0-260128`) / 4.5 / 4.0**: Supports **group generation (`n: 2~15`)** and web search (5.0 lite only); does not support layer decomposition or interactive editing.

### A. Text-to-Single-Image (Seedream 5.0 Pro Recommended)

Generates a single high-detail image. `n` must be `1` or omitted.

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "A little Shiba Inu wearing a red Tang suit under lanterns, national-tide illustration",
    "size": "2K",
    "watermark": false,
    "response_format": "url"
  }'
```

### B. Text-to-Group-Images (Batch generation with Seedream 5.0 lite / 4.5)

To generate a set of related images simultaneously, use **Seedream 5.0 lite** or **4.5**, and specify the image count with `n` (2–15):

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "A four-panel comic strip about a little kitten exploring an enchanted forest, warm healing illustration style",
    "size": "2K",
    "n": 4,
    "watermark": false,
    "response_format": "url"
  }'
```

### C. Image-to-image / multi-reference

* **Seedream 5.0 Pro**: Up to 10 reference images (single image output only).
* **Seedream 5.0 lite / 4.5**: Up to 14 reference images (supports group output; reference images + output images ≤ 15).

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "Use the dog from image 1 and the house from image 2 for a New Year ink illustration",
    "image_urls": [
      "https://example.com/assets/dog.png",
      "https://example.com/assets/house.png"
    ],
    "size": "2K"
  }'
```

### D. Layer decomposition (`layer_decomposition`)

Pro only. Exactly one input image; do not combine with group generation (`n>1`). Returns a base image (`z_index=0`) plus up to 16 transparent PNG layers. `prompt` may be empty (auto-split all major elements) or name targets in natural language / `<bbox>x1 y1 x2 y2</bbox>` (normalized 0–999). Occluded background is inpainted.

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "Split the title text and the parrot; parrot <bbox>347 305 642 997</bbox>",
  "image": "https://example.com/poster.png",
  "layer_decomposition": true,
  "size": "2K",
  "output_format": "png",
  "watermark": false
}
```

### E. Transparent background (`background`)

Pro only. `background=transparent` requires `output_format=png` (JPEG has no alpha).

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "Product shot of a Shiba Inu, fully transparent background",
  "size": "2K",
  "output_format": "png",
  "background": "transparent",
  "watermark": false
}
```

---

## 2. Parameter dictionary

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | string | Yes | - | Prefer `doubao-seedream-5-0-pro-260628` (single image/layers) or `doubao-seedream-5-0-260128` (groups/search) |
| `prompt` | string | Conditional | - | Scene / edit intent. Optional for auto layer split |
| `image` | string / array | No | - | Reference URL or base64. Pro: 1–10 images (single output); Lite/4.x: 1–14 images. Layer split needs exactly 1 |
| `image_urls` | array | No | - | URL array; gateway folds into official `image` |
| `size` / `resolution` | string | No | `"2K"` | Pro: `1K` / `1.5K` / `2K` or pixels like `"2048x2048"` (layer split also `auto`); Lite: `2K` / `3K` / `4K` |
| `n` | integer | No | `1` | Count (1–15). **Note: Only 5.0 lite / 4.5 / 4.0 support group generation (n > 1); Seedream 5.0 pro supports single image only (n must be 1 or omitted)** |
| `layer_decomposition` | boolean | No | `false` | **Pro only.** Split into base + independent transparent layers (up to 16) |
| `background` | string | No | `"opaque"` | **Pro only.** Alpha: `opaque` / `transparent` (transparent needs `output_format=png`) |
| `output_format` | string | No | `"jpeg"` | Base encoding `jpeg` / `png`. Split layers are always transparent PNG |
| `watermark` | boolean | No | `false` | Watermark toggle |
| `web_search` | boolean | No | `false` | Web search. **Note: 5.0 lite only**; Pro and 4.x do not support this |
| `response_format` | string | No | `"url"` | `"url"` or `"b64_json"` |
| `sequential_image_generation` | string | No | - | Official group mode: `auto` / `disabled`. Pass `n` directly. **Note: Pro does NOT support this parameter; Lite/4.x only** |

---

## 3. Response

Normal generation:

```json
{
  "created": 1719441600,
  "data": [
    { "url": "https://example.com/output/a.png", "size": "2048x2048" }
  ]
}
```

Layer split: `data[]` is bottom-up by `z_index`. `0` is the base (no bbox/name). Composite by ascending `z_index` to rebuild the full image.

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
      "name": "Title text",
      "description": "Yellow serif headline"
    }
  ],
  "usage": { "input_images": 1, "generated_images": 2 }
}
```

---

## 4. Model Capabilities & Comparison Matrix

| Feature / Capability | Seedream 5.0 Pro | Seedream 5.0 lite | Seedream 4.5 | Seedream 4.0 |
| :--- | :---: | :---: | :---: | :---: |
| **Recommended Model ID** | `doubao-seedream-5-0-pro-260628` | `doubao-seedream-5-0-260128` | `doubao-seedream-4-5-251128` | `doubao-seedream-4-0-250828` |
| **Single Image Generation** | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Group Generation (`n > 1`)** | ❌ **Not supported (do not pass n>1)** | ✅ Supported (up to 15) | ✅ Supported (up to 15) | ✅ Supported (up to 15) |
| **Reference Images Limit** | 1–10 images | 1–14 images | 1–14 images | 1–14 images |
| **Layer Decomposition** | ✅ Supported (1 base + ≤16 layers) | ❌ Not supported | ❌ Not supported | ❌ Not supported |
| **Interactive Editing (Coords/Boxes)** | ✅ Supported | ❌ Not supported | ❌ Not supported | ❌ Not supported |
| **Transparent Background** | ✅ Supported (`background=transparent`) | ❌ Not supported | ❌ Not supported | ❌ Not supported |
| **Web Search (`web_search`)** | ❌ Not supported | ✅ Supported | ❌ Not supported | ❌ Not supported |
| **Resolution Options** | 1K / 1.5K / 2K | 2K / 3K / 4K | 2K / 4K | 1K / 2K / 4K |
