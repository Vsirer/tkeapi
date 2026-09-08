
### 5. Phản hồi lỗi phổ biến

Mã HTTP và khắc phục được tập trung tại trang chuyên dụng.

👉 **[Mã lỗi gateway & khắc phục]({{error_codes_href}})**

**Tóm tắt**（chi tiết xem trang chuyên dụng）：

| Mã | Ý nghĩa |
| :---: | :--- |
| **402** | Số dư không đủ（**không phải** 429） |
| **400** | Yêu cầu sai / lọc nội dung·bản quyền |
| **429** | Giới hạn RPS/RPM, quá nhiều tác vụ đang chạy |
| **403** | Quyền token（lọc nội dung → 400） |
| **200 + `status: failed`** | Lỗi nghiệp vụ khi poll video bất đồng bộ |

> Chỉ cập nhật mô tả lỗi tại `error-codes`; phụ lục các ví dụ chỉ liên kết.
