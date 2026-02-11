# Hướng dẫn Xây dựng lại Hệ thống (System Rebuilding Guide)

Tài liệu này dành cho quản trị viên khi cần triển khai lại toàn bộ hệ thống từ đầu trên một máy chủ mới.

## 1. Yêu cầu Hệ thống (Prerequisites)
- Hệ điều hành: Ubuntu 20.04+ hoặc Debian 11+
- Quyền truy cập: Root hoặc Sudo
- Python 3.9+
- Nginx & Certbot (cho SSL)

## 2. Cấu trúc Thư mục Chuẩn
Tạo thư mục dự án và gán quyền:
```bash
mkdir -p /var/www/valuation
chown -R root:root /var/www/valuation
```

## 3. Cài đặt Python Backend
```bash
cd /var/www/valuation
# Sao chép code từ GitHub vào đây
git clone https://github.com/quanganhtapcode/vps.git .

# Thiết lập môi trường ảo
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

## 4. Thiết lập Dịch vụ (Systemd)
Copy file cấu hình `valuation.service` (đã có trong repo công cụ) vào hệ thống:
```bash
cp valuation.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable valuation
systemctl start valuation
```

## 5. Cú pháp Kiểm tra và Bảo trì

### Kiểm tra Backend
- **Xem tiến trình:** `ps aux | grep gunicorn`
- **Xem log lỗi:** `tail -f /var/log/valuation-error.log`
- **Kiểm tra SQL:** `sqlite3 stocks.db "SELECT count(*) FROM companies;"`

### Kiểm tra Nginx
- **Xem log Nginx:** `tail -f /var/log/nginx/access.log`
- **Reload Nginx:** `nginx -t && systemctl reload nginx`

## 6. Lưu ý về Bảo mật
- Luôn sử dụng HTTPS qua Cloudflare hoặc Certbot.
- File `.env` chứa các thông tin nhạy cảm nên được giữ bảo mật và không đẩy lên GitHub công khai.
- Chặn các port không cần thiết (chỉ mở 80, 443, 22).

---
*Tài liệu được cập nhật lần cuối: 11/02/2026*
