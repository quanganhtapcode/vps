# Hệ thống Định giá Cổ phiếu (Stock Valuation System)

Tài liệu này hướng dẫn cách vận hành, triển khai và bảo trì hệ thống định giá cổ phiếu chạy trên VPS và Vercel.

## 1. Kiến trúc Hệ thống

Hệ thống bao gồm 3 thành phần chính:
- **Frontend (Vercel):** Website Next.js giao tiếp với người dùng.
- **API Gateway (Nginx trên VPS):** Tiếp nhận request từ Vercel, xử lý SSL và chuyển hướng (proxy) vào Backend.
- **Backend (Python Flask trên VPS):** Xử lý logic, lấy dữ liệu từ SQLite (`stocks.db`) và proxy dữ liệu từ CafeF/VCI.

### Luồng dữ liệu:
`Trình duyệt` -> `Vercel (API Route)` -> `api.quanganh.org (Nginx)` -> `Gunicorn (Port 8000)`

---

## 2. Hướng dẫn Triển khai (VPS)

### Bước 1: Chuẩn bị thư mục
Dự án được đặt tại: `/var/www/valuation`

### Bước 2: Cấu hình Virtual Environment
```bash
cd /var/www/valuation
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install gunicorn gevent  # Gevent giúp xử lý nhiều request đồng thời tốt hơn
```

### Bước 3: Cấu hình Systemd (Dịch vụ Backend)
Tạo file `/etc/systemd/system/valuation.service`:
```ini
[Unit]
Description=Stock Valuation Backend Service
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/var/www/valuation
Environment="PYTHONPATH=/var/www/valuation"
Environment="PATH=/var/www/valuation/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
# Chạy với 5 workers để đảm bảo tốc độ và khả năng chịu tải
ExecStart=/var/www/valuation/.venv/bin/gunicorn --workers 5 --threads 2 --bind 127.0.0.1:8000 --timeout 120 --access-logfile /var/log/valuation-access.log --error-logfile /var/log/valuation-error.log backend.server:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Kích hoạt dịch vụ:
```bash
systemctl daemon-reload
systemctl enable valuation
systemctl restart valuation
```

### Bước 4: Cấu hình Nginx (Gateway)
File cấu hình tại `/etc/nginx/sites-available/api.quanganh.org`:
```nginx
server {
    server_name api.quanganh.org;

    location /v1/valuation/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        add_header 'Access-Control-Allow-Origin' '*' always;
    }

    listen 443 ssl; 
    # ... SSL Certbot config ...
}
```

---

## 3. Quản lý Dữ liệu (stocks.db)

Dữ liệu chính được lưu trong file SQLite `stocks.db`. Để cập nhật dữ liệu mới nhất:

1. **Upload file mới:** Dùng SCP hoặc SFTP để đè file `stocks.db` mới lên `/var/www/valuation/stocks.db`.
2. **Không cần restart:** Flask sẽ tự động đọc dữ liệu mới từ file mà không cần restart service.

---

## 4. Tối ưu Tốc độ (Performance)

Nếu hệ thống phản hồi chậm:
1. **Kiểm tra Log:** `tail -f /var/log/valuation-error.log` để xem có lỗi kết nối đến các bên thứ 3 (CafeF, VCI) không.
2. **Tăng số lượng Worker:** Chỉnh sửa số lượng `--workers` trong file `.service` (thường là `2 * số_core + 1`).
3. **Cache:** Backend đã có sẵn cơ chế cache in-memory. Nếu muốn xóa cache, chỉ cần restart service: `systemctl restart valuation`.

---

## 5. Các lệnh thường dùng

- **Xem trạng thái Backend:** `systemctl status valuation`
- **Restart Backend:** `systemctl restart valuation`
- **Xem log realtime:** `tail -f /var/log/valuation-access.log`
- **Kiểm tra Nginx:** `nginx -t && systemctl reload nginx`
