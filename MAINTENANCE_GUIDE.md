# Hướng dẫn Vận hành Tự động (VPS)

Hệ thống đã được thiết lập để tự động cập nhật dữ liệu báo cáo tài chính hàng ngày trên VPS.

### 1. Cơ chế hoạt động
- **Script trung tâm**: `run_pipeline.py`
- **Tần suất**: Chạy vào **18:00 (Giờ VN)** hàng ngày (thông qua `stock-fetch.timer`).
- **Luồng xử lý**:
    1. **Kiểm tra thông minh (Smart Update)**: Script sẽ so sánh dữ liệu trong database. Nếu dữ liệu của một mã cổ phiếu đã được cập nhật trong vòng **30 ngày** qua, nó sẽ **tự động Skip** để tiết kiệm API quota và thời gian.
    2. **Cập nhật BCTC**: Nếu dữ liệu cũ hơn 30 ngày hoặc thiếu kỳ mới, nó sẽ gọi VCI API để tải Bảng cân đối, Kết quả kinh doanh, Lưu chuyển tiền tệ và Chỉ số tài chính.
    3. **Phân loại Ngành**: Cập nhật bảng `stock_industry` để phục vụ tính năng so sánh định giá theo ngành (Sector Peers Analysis).
    4. **Đồng bộ hóa**: Tự động đồng bộ sang bảng `overview` để đảm bảo hiển thị trên UI chính xác.
    5. **Dọn dẹp**: Tự động dọn dẹp các tệp backup dư thừa.

### 2. Cách kiểm tra trạng thái
Bạn có thể kiểm tra xem hệ thống có đang chạy hay không bằng các lệnh sau trên VPS:

```bash
# Xem trạng thái của timer (xem khi nào sẽ chạy lần tới)
systemctl status stock-fetch.timer

# Xem nhật ký (logs) thực tế của quá trình cập nhật
journalctl -u stock-fetch.service -f

# Xem file log chi tiết của Pipeline
tail -f /var/www/valuation/logs/pipeline.log
```

### 3. Cách chạy thủ công ngay lập tức
Nếu bạn muốn buộc hệ thống cập nhật ngay bây giờ (không đợi đến 18:00):

```bash
# Chạy thông qua systemd (khuyên dùng để giữ history)
systemctl start stock-fetch.service

# Hoặc chạy trực tiếp script
/var/www/valuation/.venv/bin/python3 /var/www/valuation/run_pipeline.py
```

### 4. Lưu ý về giới hạn (Rate Limits)
- Hệ thống sử dụng **30 requests/phút** (rất an toàn cho VCI).
- Mỗi stock mất khoảng 8s-30s để hoàn tất (nếu không skip).
- Việc quét toàn bộ 1700 mã sẽ diễn ra rất nhanh nếu đa số các mã đã có dữ liệu mới.

### 5. Realtime WebSocket (VCI) - vận hành chuẩn
- Kiến trúc hiện tại là đúng: **VPS giữ kết nối upstream tới VCI**, sau đó broadcast lại cho client qua endpoint nội bộ (`/ws/market/indices`).
- Để giảm rủi ro bị chặn IP, nên giữ **một backend instance realtime chính** (tránh nhiều worker cùng mở nhiều upstream Socket.IO tới VCI).
- Đã có cơ chế tự bảo vệ trong backend:
    - reconnect theo **exponential backoff + jitter**
    - REST fallback poll có **jitter** để tránh pattern request cứng
- Có thể tinh chỉnh qua biến môi trường:
    - `VCI_INDEX_REST_POLL_IDLE_SECONDS` (mặc định `3`)
    - `VCI_INDEX_REST_POLL_JITTER_SECONDS` (mặc định `0.6`)
    - `VCI_INDEX_RECENT_WS_SECONDS` (mặc định `2.5`)
    - `VCI_INDEX_WS_CONNECT_TIMEOUT_SECONDS` (mặc định `8`)
    - `VCI_INDEX_WS_BACKOFF_MIN_SECONDS` (mặc định `2`)
    - `VCI_INDEX_WS_BACKOFF_MAX_SECONDS` (mặc định `60`)
    - `VCI_INDEX_WS_BACKOFF_JITTER_SECONDS` (mặc định `0.8`)
