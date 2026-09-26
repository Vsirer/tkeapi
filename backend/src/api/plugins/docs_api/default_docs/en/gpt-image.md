# GPT-gpt-image-2 Image Generation & Editing

OpenAI-compatible: `POST /v1/images/generations`, `POST /v1/images/edits`. [Image API](https://developers.openai.com/api/reference/resources/images/methods/generate)

---

## 1. Base URL & Endpoint

* **HTTP Method**: `POST`
* **Text-to-image**: `https://{{domain}}/v1/images/generations`
* **Edits / inpainting**: `https://{{domain}}/v1/images/edits`
* **Auth**: `Authorization: Bearer sk-your_token`

---

## 2. Text-to-Image

### A. Common request

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A minimalist astronaut standing on the red, desolate Martian surface, vast cosmic starry sky",
    "size": "1024x1024",
    "quality": "low",
    "n": 1,
    "response_format": "url"
  }'
```

### B. Transparent background

`background=transparent` requires `output_format` `png` or `webp` (`jpeg` has no alpha). Describe an isolated subject; do not ask for scenery, checkerboards, or extra shadows.

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A flat blue folder icon, clean outlines, fully transparent background, no shadow or scene",
    "size": "1024x1024",
    "quality": "medium",
    "background": "transparent",
    "output_format": "png",
    "response_format": "url"
  }'
```

---

## 3. Image Edits

JSON (gateway extension: image URLs) or official Form-Data. Edits also accept `quality` / `background` / `output_format` / `size`. `gpt-image-2` does not support `input_fidelity` (output is already high-fidelity).

### A. JSON (image URLs)

```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "image": "https://example.com/assets/my_avatar.png",
    "mask": "https://example.com/assets/mask_face.png",
    "prompt": "Add stylish sunglasses on the masked face, keep realistic lighting",
    "size": "1024x1024",
    "quality": "medium",
    "n": 1,
    "response_format": "url"
  }'
```

### B. OpenAI Form-Data (local files)

```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token_here" \
  -F "model=gpt-image-2" \
  -F "image=@/path/to/my_avatar.png" \
  -F "mask=@/path/to/mask_face.png" \
  -F "prompt=Add stylish sunglasses on the masked face, keep realistic lighting" \
  -F "size=1024x1024" \
  -F "quality=medium" \
  -F "n=1" \
  -F "response_format=url"
```

---

## 4. Request Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | - | Use `gpt-image-2` (or snapshot `gpt-image-2-2026-04-21`). |
| `prompt` | `string` | Yes | - | Scene or edit intent. GPT Image: up to ~32000 characters. |
| `image` | `file / string / array` | No | - | **Required for edits**. File upload or JSON URL. Official: `png` / `webp` / `jpg`, under 50MB each, up to 16 images. |
| `mask` | `file / string` | No | - | Optional. Transparent (alpha) pixels mark the inpaint region. |
| `size` | `string` | No | `auto` | `auto` or `WIDTHxHEIGHT`. Common: `1024x1024`, `1024x1536`, `1536x1024`. Both edges multiples of 16, aspect 1:3–3:1, edge ≤3840, pixels 655360–8294400. Above `2560x1440` is experimental. |
| `quality` | `string` | No | `auto` | Default `auto` picks the best quality for the selected model. GPT image models: `high` / `medium` / `low`. `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` (including `2026-09-08` snapshots) also support `xhigh` and `max`. |
| `background` | `string` | No | `auto` | `transparent` / `opaque` / `auto`. Transparent requires `output_format=png` or `webp` (preview). |
| `output_format` | `string` | No | `png` | `png` / `jpeg` / `webp`. |
| `output_compression` | `integer` | No | `100` | `jpeg` / `webp` only, 0–100. Omit for PNG. |
| `moderation` | `string` | No | `auto` | `auto` or `low` (less restrictive). |
| `n` | `integer` | No | `1` | Official range 1–10; token or channel may cap lower. |
| `response_format` | `string` | No | `url` | Gateway: `url` or `b64_json`. Official GPT Image returns base64; this gateway can return `url`. |

Do not send `style` (DALL·E 3 only).

---

## 5. Response Example (200 OK)

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
