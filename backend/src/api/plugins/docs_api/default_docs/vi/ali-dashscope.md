# Alibaba DashScope Native API

Ví dụ OpenAI tương thích: **`wan-image`** (千问 图像生成), **`wan-video`** (万相 视频生成). Trang này chỉ liệt kê đường dẫn native và tính năng khác.

### 1. Đường dẫn native ảnh / video
| Khả năng | Đường dẫn |
| :--- | :--- |
| Gửi ảnh | `POST /api/v1/services/aigc/multimodal-generation/generation` |
| Gửi video | `POST /api/v1/services/aigc/video-generation/video-synthesis` |
| Truy vấn task | `GET /api/v1/tasks/{task_id}` |

Bất đồng bộ: header `X-DashScope-Async: enable`. Body `input`/`parameters` được chuyển nguyên.

### 2. Embeddings và Rerank
* **Embeddings**: `/compatible-mode/v1/embeddings` (vd. `text-embedding-v4`)
* **Rerank**: `/compatible-api/v1/reranks` hoặc `/api/v1/services/rerank/text-rerank/text-rerank`
