# 알리바바 DashScope 네이티브 API

OpenAI 호환 예시: **`wan-image`**(千问 图像生成), **`wan-video`**(万相 视频生成). 여기서는 네이티브 경로와 기타 기능만.

### 1. 이미지 / 동영상 네이티브 경로
| 기능 | 경로 |
| :--- | :--- |
| 이미지 제출 | `POST /api/v1/services/aigc/multimodal-generation/generation` |
| 동영상 제출 | `POST /api/v1/services/aigc/video-generation/video-synthesis` |
| 작업 조회 | `GET /api/v1/tasks/{task_id}` |

비동기: `X-DashScope-Async: enable`. `input`/`parameters` 그대로 전달.

### 2. Embeddings 및 Rerank
* **Embeddings**: `/compatible-mode/v1/embeddings` (예: `text-embedding-v4`)
* **Rerank**: `/compatible-api/v1/reranks` 또는 `/api/v1/services/rerank/text-rerank/text-rerank`
