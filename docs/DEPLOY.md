# 🚀 Hướng dẫn Deploy

## Tổng quan hệ thống (Distributed Architecture)

| Thành phần | Môi trường | URL |
|------------|------------|-----|
| **Frontend (Giao diện)** | **Vercel** | [quanganhtapcode.com](https://quanganhtapcode.com) |
| **Backend (API)** | **VPS (Ubuntu 22.04)** | [api.quanganh.org](https://api.quanganh.org) |
| **Dữ liệu tĩnh (Logos)** | **AWS S3** | (Served trực tiếp từ S3 bucket) |
| **VPS SSH** | `root@203.55.176.10` | 🔑 Sử dụng file `key.pem` |

---

## 1. Quy trình Deploy (Automated)

Hệ thống được thiết kế để deploy đồng thời cả Frontend và Backend bằng một lệnh duy nhất:

```powershell
# Từ thư mục project local
.\automation\deploy.ps1 -CommitMessage "Mô tả thay đổi"
```

**Quy trình tự động hoạt động như sau:**
1. **Frontend**: Code được push lên GitHub (nhánh `main`). Vercel phát hiện thay đổi và tự động build/deploy phiên bản web mới.
2. **Backend**: Code thư mục `backend/` và các file cấu hình được `scp` (đồng bộ) trực tiếp lên VPS.
3. **Restart**: Script tự động SSH vào VPS và thực hiện `systemctl restart gunicorn-ec2` để áp dụng các thay đổi API.

---

## 2. SSH vào VPS (Debug & Dữ liệu)

```powershell
ssh -i "path\to\your\key.pem" root@203.55.176.10
```

**Log Kiểm tra:**
```bash
# Xem log API Backend thời gian thực
journalctl -u gunicorn-ec2 -f

# Kiểm tra log định kỳ (Updater)
tail -f /var/www/vps/automation/update.log
```

---

## 3. Cấu trúc thư mục Production (VPS)

```
/var/www/vps/
├── backend/            # Python Flask scripts
├── stocks.db           # SQLite database tập trung
├── automation/         # Scripts cập nhật dữ liệu hàng ngày
├── .venv/              # Môi trường ảo Python
└── .env                # Biến môi trường (DB keys, etc.)
```

---

## 4. Quản lý Stock Logos

Website hiện tại không phục vụ logo từ VPS để tối ưu hiệu suất.
- **Serving**: Script `siteConfig.ts` trỏ link ảnh về AWS S3.
- **Fallback**: Nếu S3 lỗi, website sẽ tự động tìm trong `public/logos/` của Vercel deployment.
- **Cập nhật**: Sử dụng script `automation/download_logos.py` để đồng bộ logo mới nhất từ AWS về local folder trước khi deploy.

---

## 5. Services trên VPS

| Service | Mô tả | Trạng thái |
|---------|-------|--------|
| `gunicorn-ec2.service` | API Backend (Flask) | Always running (Port 8000) |
| `val-updater.timer` | Tự động cập nhật dữ liệu | Chạy mỗi sáng (08:00) |
- Kiểm tra version trong URL: `overview.js?v=1`

---

## 6. Backup & Rollback

```bash
# Trên VPS - backup trước khi thay đổi lớn
cp -r /var/www/valuation /var/www/valuation_backup_$(date +%Y%m%d)

# Rollback nếu có lỗi
rm -rf /var/www/valuation
mv /var/www/valuation_backup_YYYYMMDD /var/www/valuation
systemctl restart gunicorn-ec2
```

---

## 7. Services trên VPS

| Service | Mô tả | Status |
|---------|-------|--------|
| `gunicorn-ec2.service` | API Backend | Always running |
| `val-updater.service` | Auto update JSON | Timer: Ngày 1, 15 |

```bash
systemctl status gunicorn-ec2
systemctl list-timers | grep val
```

---

## 8. API Gateway & Microservices Architecture

### 8.1. API Gateway (`api.quanganh.org`)
Using NGINX as API Gateway to route requests to multiple projects via one domain.

| Path Prefix | Routing | Backend Port | Project |
|-------------|---------|--------------|---------|
| `/v1/valuation/*` | `/*` | 8000 | Valuation API (Flask) |
| `/v1/store/*` | `/*` | 3001 | POS System (Node) |
| `/v1/invoice/*` | `/*` | 3000 | Invoice App (Node) |
| `/api/*` | `/api/*` | 8000 | Legacy Support |

### 8.2. Monitor Dashboard (`vps.quanganh.org`)
- **App**: Nezha Monitoring
- **Internal Port**: 8008
- **Public Access**: `https://vps.quanganh.org` (Proxied via NGINX)
- **Note**: Direct access to port 8008 from internet is **BLOCKED** by Firewall.

### 8.3. Firewall (UFW) Configuration
Strict firewall rules are applied. Only the following ports are open to public:

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (Remote Access) |
| 80 | TCP | HTTP (Redirect to HTTPS) |
| 443 | TCP | HTTPS (Web Traffic) |
| 51820 | UDP | WireGuard VPN |

**Commands to manage firewall:**
```bash
ufw status verbose
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 8.4. Deployment Commands

**Deploy API Gateway Config:**
```powershell
scp -i "$env:USERPROFILE\Downloads\key.pem" "deployment\nginx-api-gateway.conf" root@203.55.176.10:/etc/nginx/sites-available/api.quanganh.org
ssh -i "$env:USERPROFILE\Downloads\key.pem" root@203.55.176.10 "nginx -t && systemctl reload nginx"
```

**Deploy Monitor Config:**
```powershell
scp -i "$env:USERPROFILE\Downloads\key.pem" "deployment\nginx-vps-monitor.conf" root@203.55.176.10:/etc/nginx/sites-available/vps.quanganh.org
ssh -i "$env:USERPROFILE\Downloads\key.pem" root@203.55.176.10 "nginx -t && systemctl reload nginx"
```
