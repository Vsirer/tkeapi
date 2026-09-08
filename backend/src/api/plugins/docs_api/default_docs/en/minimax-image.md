# MiniMax Image Generation

MiniMax `image-01` / `image-01-live` via OpenAI-compatible `POST /v1/images/generations`.

---

## 1. Endpoint

* **HTTP Method**: `POST`
* **Request Path**: `https://{{domain}}/v1/images/generations`
* **Authorization**: `Authorization: Bearer sk-your_token`

### A. Text-to-Image

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "A man in a white t-shirt, full-body, Venice Beach sign background, 90s documentary fashion, film grain",
    "ratio": "16:9",
    "n": 2,
    "prompt_optimizer": true,
    "response_format": "url"
  }'
```

### B. Image-to-Image / Single Subject Reference

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "Keep the character identity, looking out from a library window, cinematic light",
    "image_urls": ["https://example.com/assets/character_face.jpg"],
    "ratio": "16:9",
    "n": 1
  }'
```

### C. Multi-Image Subject Reference

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "Match character from image 1 and street mood from image 2, cinematic tracking shot",
    "image_urls": [
      "https://example.com/character_face.jpg",
      "https://example.com/street_scene.jpg"
    ],
    "ratio": "16:9",
    "n": 2
  }'
```

Or use multiple `subject_reference` entries:

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01",
    "prompt": "Two characters from references talking indoors, warm light",
    "subject_reference": [
      { "type": "character", "image_file": "https://example.com/person_a.jpg" },
      { "type": "character", "image_file": "https://example.com/person_b.jpg" }
    ],
    "aspect_ratio": "16:9",
    "n": 1
  }'
```

### D. image-01-live Style Control

```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "image-01-live",
    "prompt": "Girl profile in spring park, soft daylight",
    "style": { "style_type": "watercolor", "style_weight": 0.8 },
    "ratio": "3:4",
    "n": 1
  }'
```

---

## 2. Request Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | Yes | - | `image-01` or `image-01-live`. |
| `prompt` | `string` | Yes | - | Image description (~1500 chars). |
| `ratio` / `aspect_ratio` | `string` | No | `1:1` | Aspect ratio; `21:9` only for `image-01`. |
| `image` / `image_urls` | `string / array` | No | - | Subject reference image(s). |
| `subject_reference` | `array` | No | - | `{type:"character", image_file}` per entry. |
| `style` | `object` | No | - | `image-01-live` only. |
| `n` | `integer` | No | `1` | Count `[1, 9]`. |
| `prompt_optimizer` | `boolean` | No | `false` | Auto-optimize prompt. |
| `response_format` | `string` | No | `url` | `url` or `b64_json`. |

---

## 3. Response Example (200 OK)

```json
{
  "created": 1719441600,
  "data": [
    { "url": "https://example.com/output/img_minimax_1.png" },
    { "url": "https://example.com/output/img_minimax_2.png" }
  ]
}
```
