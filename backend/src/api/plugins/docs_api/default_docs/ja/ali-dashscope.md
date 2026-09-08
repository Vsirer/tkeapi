# 阿里百煉 (DashScope) ネイティブ API

OpenAI 互換例は **`wan-image`（千问 图像生成）**、**`wan-video`（万相 视频生成）** を参照。ここではネイティブパスとその他機能のみ。

### 1. 画像 / 動画ネイティブパス
| 能力 | パス |
| :--- | :--- |
| 画像送信 | `POST /api/v1/services/aigc/multimodal-generation/generation` |
| 動画送信 | `POST /api/v1/services/aigc/video-generation/video-synthesis` |
| タスク照会 | `GET /api/v1/tasks/{task_id}` |

非同期は `X-DashScope-Async: enable`。`input`/`parameters` はそのまま透传。

### 2. Embeddings と Rerank
* **Embeddings**: `/compatible-mode/v1/embeddings`（例: `text-embedding-v4`）
* **Rerank**: `/compatible-api/v1/reranks` または `/api/v1/services/rerank/text-rerank/text-rerank`
