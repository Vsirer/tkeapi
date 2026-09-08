# Mã lỗi cổng thông tin phổ biến và khắc phục sự cố

Mã HTTP **khớp `status_code` trong nhật ký**. Thiếu số dư là **402**, 429 chỉ cho giới hạn tần suất / tác vụ đang chạy. Chi tiết: [中文 (zh)] hoặc [English (en)].

| HTTP | Mục đích |
| :---: | :--- |
| 400 | Tham số / loại model / **lọc nội dung·bản quyền** |
| 401 | Xác thực |
| **402** | **Không đủ số dư** |
| 403 | Token, IP, model, quota（chính sách nội dung → 400） |
| 404 | Không có kênh upstream, hoặc `status 404` |
| **429** | **RPS/RPM**, giới hạn tác vụ |
| 500/502/504 | Nội bộ / upstream / timeout |

Tác vụ bất đồng bộ có thể HTTP 200 + `status: failed`.

---

## 6. Bổ sung theo năng lực（dùng chung với ví dụ）

| Năng lực | Tình huống | Mã / ghi chú |
| :--- | :--- | :--- |
| **千问 ảnh** | `size` sai, URL tham chiếu | **400** |
| **万相 video** | Trộn khung đầu/cuối với tham chiếu; chỉ audio | **400** |
| **万相 video** | `files`/`links` trộn với role khung đầu/cuối | **400** |

Chỉ cập nhật mô tả tại **`error-codes`**.

