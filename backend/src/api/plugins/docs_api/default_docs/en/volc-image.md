# Volcengine doubao-seedream Image Generation

Prefer **Seedream 5.0 Pro** (`doubao-seedream-5-0-pro-260628`). OpenAI-compatible: `POST /v1/images/generations`. Native: `/api/v3/images/generations`. [Image API](https://www.volcengine.com/docs/82379/1541523)

---

## 1. Submit (POST)

* **Path**: `https://{{domain}}/v1/images/generations`
* **Auth**: `Authorization: Bearer sk-your_token`

### A. Text-to-image (`n` for a batch)

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "A little Shiba Inu wearing a red Tang suit under lanterns, national-tide illustration",
    "size": "2K",
    "n": 2,
    "watermark": false,
    "response_format": "url"
  }'
```

### B. Image-to-image / multi-reference

Pro accepts up to 10 reference images.

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

### C. Layer decomposition (`layer_decomposition`)

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

### D. Transparent background (`background`)

`background=transparent` requires `output_format=png` (JPEG has no alpha).

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
| `model` | string | Yes | - | Prefer `doubao-seedream-5-0-pro-260628` |
| `prompt` | string | Conditional | - | Scene / edit intent. Optional for auto layer split |
| `image` | string / array | No | - | Reference URL or base64. Layer split needs exactly 1 |
| `image_urls` | array | No | - | URL array; gateway folds into official `image` |
| `size` / `resolution` | string | No | `"2K"` | Pro: `1K` / `1.5K` / `2K` or pixels like `"2048x2048"`. Layer split also `auto` |
| `n` | integer | No | `1` | Count (1–15); mapped to group generation. Ignored for layer split |
| `layer_decomposition` | boolean | No | `false` | **Pro only.** Split into base + independent transparent layers |
| `background` | string | No | `"opaque"` | Alpha: `opaque` / `transparent` (transparent needs `output_format=png`) |
| `output_format` | string | No | `"jpeg"` | Base encoding `jpeg` / `png`. Split layers are always transparent PNG |
| `watermark` | boolean | No | `false` | Watermark |
| `web_search` | boolean | No | `false` | Web search |
| `response_format` | string | No | `"url"` | `"url"` or `"b64_json"` |
| `sequential_image_generation` | string | No | - | Official group mode: `auto` / `disabled`. Prefer `n` |

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

## 4. Earlier models

Swap `model` to `doubao-seedream-5-0-260128` or 4.x. `layer_decomposition` / `background=transparent` are Pro-only.
